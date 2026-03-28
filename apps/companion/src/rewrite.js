import { mergeStyleRules, parseStyleMarkdown, styleRulesToPrompt } from '../../../packages/shared/src/style-parser.js';
import { buildProfileFromSamples } from '../../../packages/shared/src/profile.js';
import { normalizeMode } from '../../../packages/shared/src/types.js';
import { appendHistory, loadConfig, loadProfile, loadStyleMarkdown, saveProfile } from './config.js';
import { DEFAULT_REWRITE_SYSTEM_TEMPLATE, renderRewriteSystemTemplate } from './prompt-template.js';
import { buildProviderRegistry } from './providers.js';

const providerRegistry = buildProviderRegistry();
const defaultEndpointAvailability = new Map();
export const ENDPOINT_UNAVAILABLE_BASE_COOLDOWN_MS = 30000;
export const ENDPOINT_UNAVAILABLE_MAX_COOLDOWN_MS = 300000;

function buildExecutionOrder(config) {
  const routing = config.routing ?? { enabled: [] };
  return [...(routing.enabled ?? [])];
}

function isEndpointAvailabilityError(error) {
  const message = String(error?.message ?? '').toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('unreachable') ||
    message.includes('fetch failed') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('eai_again') ||
    message.includes('network')
  );
}

function computeCooldownMs(consecutiveFailures) {
  const exponent = Math.max(0, consecutiveFailures - 1);
  const raw = ENDPOINT_UNAVAILABLE_BASE_COOLDOWN_MS * (2 ** exponent);
  return Math.min(raw, ENDPOINT_UNAVAILABLE_MAX_COOLDOWN_MS);
}

export async function rewriteEmail(request, deps = {}) {
  const logger = deps.logger ?? (() => {});
  const requestId = deps.requestId ?? 'n/a';
  const now = deps.now ?? (() => Date.now());
  const endpointAvailability = deps.endpointAvailability ?? defaultEndpointAvailability;
  const config = deps.config ?? await loadConfig();
  const styleMarkdown = deps.styleMarkdown ?? await loadStyleMarkdown();
  const parsedRules = parseStyleMarkdown(styleMarkdown);
  const profile = deps.profile ?? await loadProfile();
  const registry = deps.providerRegistry ?? providerRegistry;

  const mode = normalizeMode(request.mode);
  const mergedRules = mergeStyleRules({
    rules: parsedRules,
    mode,
    profile
  });

  const rulesPrompt = styleRulesToPrompt(mergedRules);
  const systemPromptTemplate = config?.prompts?.rewriteSystemTemplate;
  const systemPrompt = renderRewriteSystemTemplate({
    template: systemPromptTemplate ?? DEFAULT_REWRITE_SYSTEM_TEMPLATE,
    mode,
    rulesPrompt
  });
  const attempts = [];
  const endpointById = new Map((config.endpoints ?? []).map((endpoint) => [endpoint.id, endpoint]));
  const executionOrder = buildExecutionOrder(config);
  logger('rewrite.start', {
    requestId,
    mode,
    textLength: String(request.text ?? '').length,
    endpoints: executionOrder
  });

  for (const endpointId of executionOrder) {
    const endpoint = endpointById.get(endpointId);
    if (!endpoint) {
      logger('rewrite.endpoint.missing', { requestId, endpointId });
      attempts.push(`${endpointId}: endpoint missing in config`);
      continue;
    }

    const currentTs = now();
    const availabilityState = endpointAvailability.get(endpoint.id);
    if (availabilityState && availabilityState.nextRetryAt > currentTs) {
      const remainingMs = availabilityState.nextRetryAt - currentTs;
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      attempts.push(
        `${endpoint.id}: temporarily unavailable (${remainingSeconds}s cooldown remaining)`
      );
      logger('rewrite.endpoint.unavailable', {
        requestId,
        endpointId: endpoint.id,
        providerType: endpoint.type,
        remainingMs,
        nextRetryAt: new Date(availabilityState.nextRetryAt).toISOString(),
        lastError: availabilityState.lastError
      });
      continue;
    }
    if (availabilityState) {
      endpointAvailability.delete(endpoint.id);
    }

    const provider = registry[endpoint.type];
    if (!provider) {
      logger('rewrite.provider.missing', { requestId, endpointId, providerType: endpoint.type });
      attempts.push(`${endpointId}: provider type not registered (${endpoint.type})`);
      continue;
    }
    const timeoutMs = endpoint.timeoutMs ?? config.timeoutMs;

    try {
      const startedAt = Date.now();
      logger('rewrite.endpoint.attempt', {
        requestId,
        endpointId,
        providerType: endpoint.type,
        timeoutMs
      });
      const rewrittenText = await provider.rewrite({
        text: request.text,
        systemPrompt,
        timeoutMs,
        endpointConfig: endpoint.config
      });
      const durationMs = Date.now() - startedAt;
      logger('rewrite.endpoint.success', {
        requestId,
        endpointId,
        providerType: endpoint.type,
        durationMs,
        outputLength: rewrittenText.length
      });

      if (!deps.skipHistory) {
        await appendHistory({
          ts: new Date().toISOString(),
          mode,
          provider: endpoint.type,
          endpointId: endpoint.id,
          text: request.text,
          rewrittenText
        });
      }

      return {
        rewrittenText,
        appliedMode: mode,
        providerUsed: endpoint.type,
        endpointUsed: endpoint.id,
        notes: attempts
      };
    } catch (error) {
      if (isEndpointAvailabilityError(error)) {
        const previousState = endpointAvailability.get(endpoint.id);
        const consecutiveFailures = (previousState?.consecutiveFailures ?? 0) + 1;
        const cooldownMs = computeCooldownMs(consecutiveFailures);
        const nextRetryAt = now() + cooldownMs;
        endpointAvailability.set(endpoint.id, {
          consecutiveFailures,
          cooldownMs,
          nextRetryAt,
          lastError: error.message
        });
        attempts.push(`${endpoint.id}: ${error.message} (cooldown ${Math.ceil(cooldownMs / 1000)}s)`);
        logger('rewrite.endpoint.unavailable_marked', {
          requestId,
          endpointId: endpoint.id,
          providerType: endpoint.type,
          consecutiveFailures,
          cooldownMs,
          nextRetryAt: new Date(nextRetryAt).toISOString(),
          error: error.message
        });
      } else {
        endpointAvailability.delete(endpoint.id);
        attempts.push(`${endpoint.id}: ${error.message}`);
      }
      logger('rewrite.endpoint.error', {
        requestId,
        endpointId: endpoint.id,
        providerType: endpoint.type,
        error: error.message
      });
    }
  }

  throw new Error(`All providers failed. ${attempts.join(' | ')}`);
}

export async function buildProfile(samples) {
  const profile = buildProfileFromSamples(samples);
  await saveProfile(profile);
  return profile;
}

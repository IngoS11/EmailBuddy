import { mergeStyleRules, parseStyleMarkdown, styleRulesToPrompt } from '../../../packages/shared/src/style-parser.js';
import { buildProfileFromSamples } from '../../../packages/shared/src/profile.js';
import { normalizeMode } from '../../../packages/shared/src/types.js';
import { appendHistory, loadConfig, loadProfile, loadStyleMarkdown, saveProfile } from './config.js';
import { buildProviderRegistry } from './providers.js';

const providerRegistry = buildProviderRegistry();

function buildExecutionOrder(config) {
  const routing = config.routing ?? { enabled: [] };
  return [...(routing.enabled ?? [])];
}

export async function rewriteEmail(request, deps = {}) {
  const logger = deps.logger ?? (() => {});
  const requestId = deps.requestId ?? 'n/a';
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
        mode,
        rulesPrompt,
        systemPromptTemplate,
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
      attempts.push(`${endpoint.id}: ${error.message}`);
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

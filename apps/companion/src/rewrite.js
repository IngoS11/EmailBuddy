import { mergeStyleRules, parseStyleMarkdown, styleRulesToPrompt } from '../../../packages/shared/src/style-parser.js';
import { buildProfileFromSamples } from '../../../packages/shared/src/profile.js';
import { normalizeMode } from '../../../packages/shared/src/types.js';
import { appendHistory, loadConfig, loadProfile, loadStyleMarkdown, saveProfile } from './config.js';
import { buildProviderRegistry } from './providers.js';

const providerRegistry = buildProviderRegistry();

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
  const attempts = [];
  logger('rewrite.start', {
    requestId,
    mode,
    textLength: String(request.text ?? '').length,
    providers: config.providerOrder
  });

  for (const providerName of config.providerOrder) {
    const provider = registry[providerName];
    if (!provider) {
      logger('rewrite.provider.missing', { requestId, providerName });
      continue;
    }

    try {
      const startedAt = Date.now();
      logger('rewrite.provider.attempt', { requestId, providerName });
      const rewrittenText = await provider.rewrite({
        text: request.text,
        mode,
        rulesPrompt,
        timeoutMs: config.timeoutMs
      });
      const durationMs = Date.now() - startedAt;
      logger('rewrite.provider.success', {
        requestId,
        providerName,
        durationMs,
        outputLength: rewrittenText.length
      });

      if (!deps.skipHistory) {
        await appendHistory({
          ts: new Date().toISOString(),
          mode,
          provider: providerName,
          text: request.text,
          rewrittenText
        });
      }

      return {
        rewrittenText,
        appliedMode: mode,
        providerUsed: providerName,
        notes: attempts
      };
    } catch (error) {
      attempts.push(`${providerName}: ${error.message}`);
      logger('rewrite.provider.error', {
        requestId,
        providerName,
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

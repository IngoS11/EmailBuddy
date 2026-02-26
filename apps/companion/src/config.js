import { appendFile, writeFile } from 'node:fs/promises';
import {
  CONFIG_PATH,
  HISTORY_PATH,
  PROFILE_PATH,
  STYLE_PATH,
  ensureEmailBuddyDir,
  readJson,
  readText,
  writeJson
} from './file-utils.js';

export const ALLOWED_PROVIDERS = ['ollama', 'openai', 'anthropic'];

export const CONFIG_SCHEMA = {
  defaults: {
    host: '127.0.0.1',
    port: 48123,
    providerOrder: ['ollama', 'openai', 'anthropic'],
    history: {
      enabled: false
    },
    timeoutMs: 12000
  },
  constraints: {
    timeoutMs: {
      min: 1000,
      max: 60000
    },
    port: {
      min: 1,
      max: 65535
    },
    providers: ALLOWED_PROVIDERS
  }
};

const DEFAULT_STYLE = `# EmailBuddy Style Configuration\n\n## global\n\ndo: keep language clear and natural for non-native English writer\navoid: overly formal phrases and corporate jargon\n\n## mode: casual\n\ndo: sound warm and collaborative\n\n## mode: polished\n\ndo: improve grammar and sentence flow\n\n## mode: concise\n\ndo: reduce unnecessary words\n`;

function normalizeProviderOrder(order) {
  if (!Array.isArray(order)) {
    throw new Error('providerOrder must be an array');
  }

  const normalized = order.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  if (!normalized.length) {
    throw new Error('providerOrder must include at least one provider');
  }

  const seen = new Set();
  for (const provider of normalized) {
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      throw new Error(`Unsupported provider in providerOrder: ${provider}`);
    }
    if (seen.has(provider)) {
      throw new Error(`providerOrder contains duplicate provider: ${provider}`);
    }
    seen.add(provider);
  }

  return normalized;
}

function normalizeTimeout(timeoutMs) {
  const num = Number(timeoutMs);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    throw new Error('timeoutMs must be an integer');
  }

  if (num < CONFIG_SCHEMA.constraints.timeoutMs.min || num > CONFIG_SCHEMA.constraints.timeoutMs.max) {
    throw new Error(`timeoutMs must be between ${CONFIG_SCHEMA.constraints.timeoutMs.min} and ${CONFIG_SCHEMA.constraints.timeoutMs.max}`);
  }

  return num;
}

function normalizeHost(host) {
  const value = String(host ?? '').trim();
  if (!value) {
    throw new Error('host must be a non-empty string');
  }
  return value;
}

function normalizePort(port) {
  const num = Number(port);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    throw new Error('port must be an integer');
  }

  if (num < CONFIG_SCHEMA.constraints.port.min || num > CONFIG_SCHEMA.constraints.port.max) {
    throw new Error(`port must be between ${CONFIG_SCHEMA.constraints.port.min} and ${CONFIG_SCHEMA.constraints.port.max}`);
  }

  return num;
}

function normalizeHistory(history) {
  if (typeof history !== 'object' || history === null) {
    throw new Error('history must be an object');
  }

  if (typeof history.enabled !== 'boolean') {
    throw new Error('history.enabled must be boolean');
  }

  return { enabled: history.enabled };
}

export function validateConfig(config) {
  return {
    host: normalizeHost(config.host),
    port: normalizePort(config.port),
    providerOrder: normalizeProviderOrder(config.providerOrder),
    history: normalizeHistory(config.history),
    timeoutMs: normalizeTimeout(config.timeoutMs)
  };
}

function mergeConfig(baseConfig, patchConfig) {
  return {
    ...baseConfig,
    ...patchConfig,
    history: {
      ...baseConfig.history,
      ...(patchConfig.history ?? {})
    }
  };
}

export async function loadConfig() {
  await ensureEmailBuddyDir();
  const raw = await readJson(CONFIG_PATH, CONFIG_SCHEMA.defaults);
  const merged = mergeConfig(CONFIG_SCHEMA.defaults, raw);
  try {
    return validateConfig(merged);
  } catch {
    return validateConfig(CONFIG_SCHEMA.defaults);
  }
}

export async function saveConfig(nextConfig) {
  const current = await loadConfig();
  const merged = mergeConfig(current, nextConfig ?? {});
  const validated = validateConfig(merged);

  await writeJson(CONFIG_PATH, validated);
  return validated;
}

export async function getConfigSchema() {
  return CONFIG_SCHEMA;
}

export async function loadStyleMarkdown() {
  return readText(STYLE_PATH, DEFAULT_STYLE);
}

export async function saveStyleMarkdown(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    throw new Error('style markdown must be a non-empty string');
  }

  await ensureEmailBuddyDir();
  await writeFile(STYLE_PATH, markdown, 'utf8');
  return markdown;
}

export async function loadProfile() {
  return readJson(PROFILE_PATH, null);
}

export async function saveProfile(profile) {
  await writeJson(PROFILE_PATH, profile);
  return profile;
}

export async function appendHistory(item) {
  const config = await loadConfig();
  if (!config.history.enabled) {
    return;
  }

  await ensureEmailBuddyDir();
  await appendFile(HISTORY_PATH, `${JSON.stringify(item)}\n`, 'utf8');
}

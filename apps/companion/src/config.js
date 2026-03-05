import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONFIG_PATH,
  HISTORY_PATH,
  PROFILE_PATH,
  STYLE_PATH,
  ensureEmailBuddyDir,
  readJson,
  writeJson
} from './file-utils.js';
import { ANTHROPIC_MODELS, OPENAI_MODELS } from './models.js';

export const ALLOWED_ENDPOINT_TYPES = ['ollama', 'openai', 'anthropic'];
const LEGACY_ALLOWED_PROVIDERS = ['ollama', 'openai', 'anthropic'];

const DEFAULT_ENDPOINTS = [
  {
    id: 'remote-ollama',
    type: 'ollama',
    label: 'Remote Ollama',
    config: {
      baseUrl: '',
      model: 'llama3.1:8b'
    }
  },
  {
    id: 'openai',
    type: 'openai',
    label: 'OpenAI',
    config: {
      model: 'gpt-4.1-mini'
    }
  },
  {
    id: 'anthropic',
    type: 'anthropic',
    label: 'Anthropic',
    config: {
      model: 'claude-3-5-haiku-latest'
    }
  },
  {
    id: 'local-ollama',
    type: 'ollama',
    label: 'Local Ollama',
    config: {
      baseUrl: 'http://127.0.0.1:11434',
      model: 'llama3.1:8b'
    }
  }
];

function buildDefaultEndpoints() {
  return DEFAULT_ENDPOINTS.map((endpoint) => ({
    ...endpoint,
    config: { ...(endpoint.config ?? {}) }
  }));
}

export const CONFIG_SCHEMA = {
  defaults: {
    host: '127.0.0.1',
    port: 48123,
    endpoints: buildDefaultEndpoints(),
    routing: {
      enabled: ['openai', 'anthropic', 'local-ollama'],
      disabled: ['remote-ollama']
    },
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
    endpointTypes: ALLOWED_ENDPOINT_TYPES,
    models: {
      openai: OPENAI_MODELS,
      anthropic: ANTHROPIC_MODELS
    }
  }
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STYLE_TEMPLATE_PATH = path.join(__dirname, 'default-style.md');

function normalizeLegacyProviderOrder(order) {
  if (!Array.isArray(order)) {
    throw new Error('providerOrder must be an array');
  }

  const normalized = order.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  if (!normalized.length) {
    throw new Error('providerOrder must include at least one provider');
  }

  const seen = new Set();
  for (const provider of normalized) {
    if (!LEGACY_ALLOWED_PROVIDERS.includes(provider)) {
      throw new Error(`Unsupported provider in providerOrder: ${provider}`);
    }
    if (seen.has(provider)) {
      throw new Error(`providerOrder contains duplicate provider: ${provider}`);
    }
    seen.add(provider);
  }

  return normalized;
}

function normalizeEndpointId(id) {
  const value = String(id ?? '').trim();
  if (!value) {
    throw new Error('endpoint.id must be a non-empty string');
  }
  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new Error(`endpoint.id must use lowercase letters, numbers, and dashes: ${value}`);
  }
  return value;
}

function normalizeEndpointType(type) {
  const value = String(type ?? '').trim().toLowerCase();
  if (!ALLOWED_ENDPOINT_TYPES.includes(value)) {
    throw new Error(`Unsupported endpoint type: ${value}`);
  }
  return value;
}

function normalizeEndpointLabel(label) {
  const value = String(label ?? '').trim();
  if (!value) {
    throw new Error('endpoint.label must be a non-empty string');
  }
  return value;
}

function normalizeEndpointTimeout(timeoutMs) {
  if (timeoutMs === undefined || timeoutMs === null || timeoutMs === '') {
    return undefined;
  }

  return normalizeTimeout(timeoutMs);
}

function normalizeBaseUrl(url) {
  const value = String(url ?? '').trim();
  if (!value) {
    return '';
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid endpoint URL: ${value}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Endpoint URL must use http or https: ${value}`);
  }

  return parsed.toString().replace(/\/$/, '');
}

function normalizeModel(model, providerType) {
  const value = String(model ?? '').trim();
  if (!value) {
    throw new Error(`${providerType} endpoint config.model must be a non-empty string`);
  }

  if (providerType === 'openai' && !CONFIG_SCHEMA.constraints.models.openai.includes(value)) {
    throw new Error(`Unsupported OpenAI model: ${value}`);
  }

  if (providerType === 'anthropic' && !CONFIG_SCHEMA.constraints.models.anthropic.includes(value)) {
    throw new Error(`Unsupported Anthropic model: ${value}`);
  }

  return value;
}

function normalizeEndpointConfig(type, config) {
  const value = typeof config === 'object' && config !== null ? config : {};
  if (type === 'ollama') {
    return {
      baseUrl: normalizeBaseUrl(value.baseUrl),
      model: String(value.model ?? '').trim()
    };
  }

  if (type === 'openai' || type === 'anthropic') {
    return {
      model: normalizeModel(value.model, type)
    };
  }

  return {};
}

function normalizeEndpoints(endpoints) {
  if (!Array.isArray(endpoints) || !endpoints.length) {
    throw new Error('endpoints must be a non-empty array');
  }

  const seenIds = new Set();
  return endpoints.map((endpoint) => {
    if (typeof endpoint !== 'object' || endpoint === null) {
      throw new Error('endpoint must be an object');
    }

    const id = normalizeEndpointId(endpoint.id);
    if (seenIds.has(id)) {
      throw new Error(`endpoints contains duplicate id: ${id}`);
    }
    seenIds.add(id);

    const type = normalizeEndpointType(endpoint.type);
    const normalizedEndpoint = {
      id,
      type,
      label: normalizeEndpointLabel(endpoint.label),
      config: normalizeEndpointConfig(type, endpoint.config)
    };

    const timeoutMs = normalizeEndpointTimeout(endpoint.timeoutMs);
    if (timeoutMs !== undefined) {
      normalizedEndpoint.timeoutMs = timeoutMs;
    }

    return normalizedEndpoint;
  });
}

function normalizeRoutingList(list, fieldName, endpointIds) {
  if (!Array.isArray(list)) {
    throw new Error(`routing.${fieldName} must be an array`);
  }

  const seen = new Set();
  const normalized = [];
  for (const idRaw of list) {
    const id = normalizeEndpointId(idRaw);
    if (!endpointIds.has(id)) {
      throw new Error(`routing.${fieldName} contains unknown endpoint id: ${id}`);
    }
    if (seen.has(id)) {
      throw new Error(`routing.${fieldName} contains duplicate endpoint id: ${id}`);
    }
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

function normalizeRouting(routing, endpoints) {
  if (typeof routing !== 'object' || routing === null) {
    throw new Error('routing must be an object');
  }

  const endpointIds = new Set(endpoints.map((endpoint) => endpoint.id));
  const enabled = normalizeRoutingList(routing.enabled, 'enabled', endpointIds);
  const disabled = normalizeRoutingList(routing.disabled, 'disabled', endpointIds);

  if (!enabled.length) {
    throw new Error('routing.enabled must include at least one endpoint id');
  }

  const overlap = enabled.find((id) => disabled.includes(id));
  if (overlap) {
    throw new Error(`routing endpoint id appears in both enabled and disabled: ${overlap}`);
  }

  return { enabled, disabled };
}

function validateEnabledEndpointRequirements(endpoints, routing) {
  const byId = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));
  for (const id of routing.enabled) {
    const endpoint = byId.get(id);
    if (!endpoint) {
      continue;
    }

    if (endpoint.type === 'ollama') {
      if (!endpoint.config.baseUrl) {
        throw new Error(`Enabled ollama endpoint ${id} requires config.baseUrl`);
      }
      if (!String(endpoint.config.model ?? '').trim()) {
        throw new Error(`Enabled ollama endpoint ${id} requires config.model`);
      }
    }
  }
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

function resolveRoutingFromLegacy(config, endpoints) {
  const endpointIds = new Set(endpoints.map((endpoint) => endpoint.id));

  const rawRouting = config?.routing;
  if (rawRouting && (Array.isArray(rawRouting.enabled) || Array.isArray(rawRouting.disabled))) {
    return {
      enabled: Array.isArray(rawRouting.enabled) ? rawRouting.enabled : [],
      disabled: Array.isArray(rawRouting.disabled) ? rawRouting.disabled : []
    };
  }

  if (rawRouting && (Array.isArray(rawRouting.primary) || Array.isArray(rawRouting.fallback))) {
    const enabled = [...(rawRouting.primary ?? []), ...(rawRouting.fallback ?? [])];
    const disabled = endpoints.map((endpoint) => endpoint.id).filter((id) => !enabled.includes(id));
    return { enabled, disabled };
  }

  if (Array.isArray(config?.endpoints)) {
    const enabled = [];
    const disabled = [];
    for (const endpoint of config.endpoints) {
      const id = String(endpoint?.id ?? '').trim();
      if (!endpointIds.has(id)) {
        continue;
      }
      if (endpoint?.enabled === false) {
        disabled.push(id);
      } else {
        enabled.push(id);
      }
    }

    if (enabled.length || disabled.length) {
      for (const endpoint of endpoints) {
        if (!enabled.includes(endpoint.id) && !disabled.includes(endpoint.id)) {
          disabled.push(endpoint.id);
        }
      }
      return { enabled, disabled };
    }
  }

  if (Array.isArray(config?.providerOrder)) {
    const providerToEndpoint = {
      openai: 'openai',
      anthropic: 'anthropic',
      ollama: 'local-ollama'
    };

    const enabled = [];
    for (const provider of normalizeLegacyProviderOrder(config.providerOrder)) {
      const endpointId = providerToEndpoint[provider];
      if (endpointId && !enabled.includes(endpointId)) {
        enabled.push(endpointId);
      }
    }

    if (!enabled.length) {
      enabled.push('openai', 'anthropic', 'local-ollama');
    }

    if (!enabled.includes('local-ollama')) {
      enabled.push('local-ollama');
    }

    const disabled = endpoints.map((endpoint) => endpoint.id).filter((id) => !enabled.includes(id));
    return { enabled, disabled };
  }

  return {
    enabled: [...CONFIG_SCHEMA.defaults.routing.enabled],
    disabled: [...CONFIG_SCHEMA.defaults.routing.disabled]
  };
}

export function validateConfig(config) {
  const endpoints = normalizeEndpoints(config.endpoints);
  const routing = normalizeRouting(config.routing, endpoints);
  validateEnabledEndpointRequirements(endpoints, routing);

  return {
    host: normalizeHost(config.host),
    port: normalizePort(config.port),
    endpoints,
    routing,
    history: normalizeHistory(config.history),
    timeoutMs: normalizeTimeout(config.timeoutMs)
  };
}

function migrateLegacyConfig(config) {
  const base = mergeConfig(CONFIG_SCHEMA.defaults, config ?? {});
  const endpointById = new Map();
  for (const endpoint of buildDefaultEndpoints()) {
    endpointById.set(endpoint.id, endpoint);
  }
  if (Array.isArray(base.endpoints)) {
    for (const endpoint of base.endpoints) {
      if (!endpoint || typeof endpoint !== 'object') {
        continue;
      }
      const id = String(endpoint.id ?? '').trim();
      if (!id) {
        continue;
      }
      const previous = endpointById.get(id) ?? {};
      endpointById.set(id, {
        ...previous,
        ...endpoint,
        config: {
          ...(previous.config ?? {}),
          ...(endpoint.config ?? {})
        }
      });
    }
  }

  const endpoints = Array.from(endpointById.values());
  const routing = resolveRoutingFromLegacy(config ?? {}, endpoints);

  return {
    ...base,
    endpoints,
    routing
  };
}

function mergeConfig(baseConfig, patchConfig) {
  return {
    ...baseConfig,
    ...patchConfig,
    history: {
      ...baseConfig.history,
      ...(patchConfig.history ?? {})
    },
    routing: {
      ...(baseConfig.routing ?? {}),
      ...(patchConfig.routing ?? {})
    }
  };
}

export async function loadConfig() {
  await ensureEmailBuddyDir();
  const raw = await readJson(CONFIG_PATH, CONFIG_SCHEMA.defaults);
  const migrated = migrateLegacyConfig(raw);
  const merged = mergeConfig(CONFIG_SCHEMA.defaults, migrated);
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
  await ensureEmailBuddyDir();
  try {
    return await readFile(STYLE_PATH, 'utf8');
  } catch {
    const defaultStyle = await readFile(DEFAULT_STYLE_TEMPLATE_PATH, 'utf8');
    await writeFile(STYLE_PATH, defaultStyle, 'utf8');
    return defaultStyle;
  }
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

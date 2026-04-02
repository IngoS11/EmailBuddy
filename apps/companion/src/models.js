import { getSecret } from './keychain.js';

const OLLAMA_TAGS_TIMEOUT_MS = 2500;
const LMSTUDIO_MODELS_TIMEOUT_MS = 2500;
const OPENAI_MODELS_TIMEOUT_MS = 2500;
const ANTHROPIC_MODELS_TIMEOUT_MS = 2500;

export const OPENAI_MODELS = [
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4o',
  'gpt-4o-mini'
];

export const ANTHROPIC_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-3-haiku-20240307'
];

function toErrorMessage(error) {
  if (!error) return 'Unknown error';
  if (error.name === 'AbortError') return 'Timed out while fetching models';
  return error.message || String(error);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function isOpenAiRewriteModel(modelId) {
  const id = String(modelId ?? '').trim().toLowerCase();
  if (!id) return false;

  if (
    id.startsWith('gpt-') ||
    id.startsWith('chatgpt-') ||
    /^o\d/.test(id)
  ) {
    return !(
      id.includes('audio') ||
      id.includes('realtime') ||
      id.includes('transcribe') ||
      id.includes('tts') ||
      id.includes('image') ||
      id.includes('search')
    );
  }

  return false;
}

function isAnthropicRewriteModel(modelId) {
  const id = String(modelId ?? '').trim().toLowerCase();
  return id.startsWith('claude-');
}

function parseAnthropicModelIds(body) {
  return Array.isArray(body?.data)
    ? body.data
        .map((entry) => String(entry?.id ?? '').trim())
        .filter((id) => isAnthropicRewriteModel(id))
        .filter(Boolean)
    : [];
}

function parseOpenAiModelIds(body) {
  return Array.isArray(body?.data)
    ? body.data
        .map((entry) => String(entry?.id ?? '').trim())
        .filter((id) => isOpenAiRewriteModel(id))
        .filter(Boolean)
    : [];
}

async function fetchOllamaModelNames(baseUrl, fetchImpl, timeoutMs = OLLAMA_TAGS_TIMEOUT_MS) {
  const normalizedBaseUrl = String(baseUrl ?? '').trim().replace(/\/$/, '');
  if (!normalizedBaseUrl) {
    return { ok: false, models: [], error: 'Endpoint URL is not configured' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${normalizedBaseUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        models: [],
        error: body.error || `HTTP ${response.status}`
      };
    }

    const models = Array.isArray(body.models)
      ? body.models
          .map((entry) => String(entry?.name ?? '').trim())
          .filter(Boolean)
      : [];

    return { ok: true, models: uniqueSorted(models), error: null };
  } catch (error) {
    return { ok: false, models: [], error: toErrorMessage(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchLmStudioModelIds(baseUrl, fetchImpl, timeoutMs = LMSTUDIO_MODELS_TIMEOUT_MS) {
  const normalizedBaseUrl = String(baseUrl ?? '').trim().replace(/\/$/, '');
  if (!normalizedBaseUrl) {
    return { ok: false, models: [], error: 'Endpoint URL is not configured' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${normalizedBaseUrl}/v1/models`, {
      method: 'GET',
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        models: [],
        error: body.error?.message || body.error || `HTTP ${response.status}`
      };
    }

    const models = Array.isArray(body?.data)
      ? body.data
          .map((entry) => String(entry?.id ?? '').trim())
          .filter(Boolean)
      : [];
    return { ok: true, models: uniqueSorted(models), error: null };
  } catch (error) {
    return { ok: false, models: [], error: toErrorMessage(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAnthropicModelIds(apiKey, fetchImpl, timeoutMs = ANTHROPIC_MODELS_TIMEOUT_MS) {
  const key = String(apiKey ?? '').trim();
  if (!key) {
    return { ok: false, models: [], error: 'Anthropic API key is not configured' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        models: [],
        error: body.error?.message || body.error || `HTTP ${response.status}`
      };
    }

    return {
      ok: true,
      models: uniqueSorted(parseAnthropicModelIds(body)),
      error: null
    };
  } catch (error) {
    return { ok: false, models: [], error: toErrorMessage(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchOpenAiModelIds(apiKey, fetchImpl, timeoutMs = OPENAI_MODELS_TIMEOUT_MS) {
  const key = String(apiKey ?? '').trim();
  if (!key) {
    return { ok: false, models: [], error: 'OpenAI API key is not configured' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`
      },
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        models: [],
        error: body.error?.message || body.error || `HTTP ${response.status}`
      };
    }

    return {
      ok: true,
      models: uniqueSorted(parseOpenAiModelIds(body)),
      error: null
    };
  } catch (error) {
    return { ok: false, models: [], error: toErrorMessage(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getAvailableModels(config, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? OLLAMA_TAGS_TIMEOUT_MS;
  const openaiApiKey = String(options.openaiApiKey ?? await getSecret('openai_api_key')).trim();
  const anthropicApiKey = String(options.anthropicApiKey ?? await getSecret('anthropic_api_key')).trim();
  const endpoints = Array.isArray(config?.endpoints) ? config.endpoints : [];
  const ollamaEndpoints = endpoints.filter((endpoint) => endpoint?.type === 'ollama');
  const lmstudioEndpoints = endpoints.filter((endpoint) => endpoint?.type === 'lmstudio');

  const ollamaEntries = await Promise.all(
    ollamaEndpoints.map(async (endpoint) => {
      const result = await fetchOllamaModelNames(endpoint?.config?.baseUrl ?? '', fetchImpl, timeoutMs);
      return [endpoint.id, result];
    })
  );
  const lmstudioEntries = await Promise.all(
    lmstudioEndpoints.map(async (endpoint) => {
      const result = await fetchLmStudioModelIds(endpoint?.config?.baseUrl ?? '', fetchImpl, timeoutMs);
      return [endpoint.id, result];
    })
  );

  let openaiModels = [...OPENAI_MODELS];
  if (openaiApiKey) {
    const discovered = await fetchOpenAiModelIds(openaiApiKey, fetchImpl, timeoutMs);
    if (discovered.ok && discovered.models.length) {
      openaiModels = discovered.models;
    }
  }

  let anthropicModels = [...ANTHROPIC_MODELS];
  if (anthropicApiKey) {
    const discovered = await fetchAnthropicModelIds(anthropicApiKey, fetchImpl, timeoutMs);
    if (discovered.ok && discovered.models.length) {
      anthropicModels = discovered.models;
    }
  }

  return {
    cloud: {
      openai: openaiModels,
      anthropic: anthropicModels
    },
    ollama: Object.fromEntries(ollamaEntries),
    lmstudio: Object.fromEntries(lmstudioEntries)
  };
}

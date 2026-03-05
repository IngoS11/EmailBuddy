const OLLAMA_TAGS_TIMEOUT_MS = 2500;

export const OPENAI_MODELS = [
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4o',
  'gpt-4o-mini'
];

export const ANTHROPIC_MODELS = [
  'claude-3-7-sonnet-latest',
  'claude-3-5-sonnet-latest',
  'claude-3-5-haiku-latest'
];

function toErrorMessage(error) {
  if (!error) return 'Unknown error';
  if (error.name === 'AbortError') return 'Timed out while fetching models';
  return error.message || String(error);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
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

export async function getAvailableModels(config, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? OLLAMA_TAGS_TIMEOUT_MS;
  const endpoints = Array.isArray(config?.endpoints) ? config.endpoints : [];
  const ollamaEndpoints = endpoints.filter((endpoint) => endpoint?.type === 'ollama');

  const ollamaEntries = await Promise.all(
    ollamaEndpoints.map(async (endpoint) => {
      const result = await fetchOllamaModelNames(endpoint?.config?.baseUrl ?? '', fetchImpl, timeoutMs);
      return [endpoint.id, result];
    })
  );

  return {
    cloud: {
      openai: [...OPENAI_MODELS],
      anthropic: [...ANTHROPIC_MODELS]
    },
    ollama: Object.fromEntries(ollamaEntries)
  };
}

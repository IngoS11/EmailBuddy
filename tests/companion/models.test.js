import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableModels } from '../../apps/companion/src/models.js';

const baseConfig = {
  endpoints: [
    {
      id: 'remote-ollama',
      type: 'ollama',
      config: { baseUrl: 'http://192.168.1.10:11434' }
    },
    {
      id: 'local-ollama',
      type: 'ollama',
      config: { baseUrl: 'http://127.0.0.1:11434' }
    }
  ]
};

test('getAvailableModels returns cloud models and ollama tags per endpoint', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('api.openai.com')) {
      return {
        ok: true,
        async json() {
          return {
            data: [
              { id: 'gpt-5-mini' },
              { id: 'gpt-4.1-mini' },
              { id: 'dall-e-3' },
              { id: 'whisper-1' },
              { id: 'gpt-4o-realtime-preview' }
            ]
          };
        }
      };
    }
    if (url.includes('api.anthropic.com')) {
      return {
        ok: true,
        async json() {
          return {
            data: [
              { id: 'claude-sonnet-4-6' },
              { id: 'claude-haiku-4-5-20251001' },
              { id: 'not-claude-model' }
            ]
          };
        }
      };
    }
    if (url.includes('192.168.1.10')) {
      return {
        ok: true,
        async json() {
          return { models: [{ name: 'llama3.1:8b' }, { name: 'qwen2.5:14b' }] };
        }
      };
    }
    return {
      ok: true,
      async json() {
        return { models: [{ name: 'llama3.1:8b' }] };
      }
    };
  };

  const models = await getAvailableModels(baseConfig, {
    fetchImpl,
    openaiApiKey: 'test-openai-key',
    anthropicApiKey: 'test-anthropic-key'
  });
  assert.ok(Array.isArray(models.cloud.openai));
  assert.ok(Array.isArray(models.cloud.anthropic));
  assert.deepEqual(models.cloud.openai, ['gpt-4.1-mini', 'gpt-5-mini']);
  assert.deepEqual(models.cloud.anthropic, ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6']);
  assert.deepEqual(models.ollama['remote-ollama'], {
    ok: true,
    models: ['llama3.1:8b', 'qwen2.5:14b'],
    error: null
  });
  assert.deepEqual(models.ollama['local-ollama'], {
    ok: true,
    models: ['llama3.1:8b'],
    error: null
  });
});

test('getAvailableModels returns endpoint error when ollama request fails', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('api.openai.com')) {
      return {
        ok: true,
        async json() {
          return { data: [{ id: 'gpt-4.1-mini' }] };
        }
      };
    }
    throw new Error('network unreachable');
  };

  const models = await getAvailableModels(baseConfig, {
    fetchImpl,
    openaiApiKey: 'test-openai-key',
    anthropicApiKey: ''
  });
  assert.deepEqual(models.cloud.openai, ['gpt-4.1-mini']);
  assert.equal(models.ollama['remote-ollama'].ok, false);
  assert.equal(models.ollama['remote-ollama'].models.length, 0);
  assert.match(models.ollama['remote-ollama'].error, /network unreachable/);
});

test('getAvailableModels keeps fallback cloud lists when discovery fails', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('api.openai.com')) {
      throw new Error('openai temporarily unavailable');
    }
    if (url.includes('api.anthropic.com')) {
      throw new Error('anthropic temporarily unavailable');
    }
    return {
      ok: true,
      async json() {
        return { models: [{ name: 'llama3.1:8b' }] };
      }
    };
  };

  const models = await getAvailableModels(baseConfig, {
    fetchImpl,
    openaiApiKey: 'test-openai-key',
    anthropicApiKey: 'test-anthropic-key'
  });
  assert.deepEqual(models.cloud.openai, ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini']);
  assert.deepEqual(models.cloud.anthropic, ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-3-haiku-20240307']);
});

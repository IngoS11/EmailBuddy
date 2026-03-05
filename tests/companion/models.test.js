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

  const models = await getAvailableModels(baseConfig, { fetchImpl });
  assert.ok(Array.isArray(models.cloud.openai));
  assert.ok(Array.isArray(models.cloud.anthropic));
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
  const fetchImpl = async () => {
    throw new Error('network unreachable');
  };

  const models = await getAvailableModels(baseConfig, { fetchImpl });
  assert.equal(models.ollama['remote-ollama'].ok, false);
  assert.equal(models.ollama['remote-ollama'].models.length, 0);
  assert.match(models.ollama['remote-ollama'].error, /network unreachable/);
});

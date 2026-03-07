import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_SCHEMA, validateConfig } from '../../apps/companion/src/config.js';

test('validateConfig accepts enabled/disabled endpoint defaults', () => {
  const config = validateConfig(CONFIG_SCHEMA.defaults);
  assert.deepEqual(config.routing.enabled, ['openai', 'anthropic', 'local-ollama']);
  assert.deepEqual(config.routing.disabled, ['remote-ollama']);
  assert.equal(config.endpoints.length, 4);
  assert.equal(config.timeoutMs, 12000);
  assert.equal(config.history.enabled, false);
});

test('validateConfig rejects duplicate endpoint ids', () => {
  const duplicate = {
    ...CONFIG_SCHEMA.defaults,
    endpoints: [...CONFIG_SCHEMA.defaults.endpoints, { ...CONFIG_SCHEMA.defaults.endpoints[0] }]
  };
  assert.throws(() => {
    validateConfig(duplicate);
  }, /duplicate id/);
});

test('validateConfig rejects routing overlap', () => {
  assert.throws(() => {
    validateConfig({
      ...CONFIG_SCHEMA.defaults,
      routing: {
        enabled: ['openai'],
        disabled: ['openai']
      }
    });
  }, /both enabled and disabled/);
});

test('validateConfig rejects timeout outside allowed range', () => {
  assert.throws(() => {
    validateConfig({
      ...CONFIG_SCHEMA.defaults,
      timeoutMs: 100
    });
  }, /timeoutMs must be between/);
});

test('validateConfig rejects empty cloud model names', () => {
  assert.throws(() => {
    validateConfig({
      ...CONFIG_SCHEMA.defaults,
      endpoints: CONFIG_SCHEMA.defaults.endpoints.map((endpoint) =>
        endpoint.id === 'openai'
          ? {
              ...endpoint,
              config: { ...endpoint.config, model: '' }
            }
          : endpoint
      )
    });
  }, /openai endpoint config.model must be a non-empty string/);
});

test('validateConfig accepts non-listed openai model names', () => {
  const config = validateConfig({
    ...CONFIG_SCHEMA.defaults,
    endpoints: CONFIG_SCHEMA.defaults.endpoints.map((endpoint) =>
      endpoint.id === 'openai'
        ? {
            ...endpoint,
            config: { ...endpoint.config, model: 'gpt-5-mini' }
          }
        : endpoint
    )
  });

  const openai = config.endpoints.find((endpoint) => endpoint.id === 'openai');
  assert.equal(openai?.config?.model, 'gpt-5-mini');
});

test('validateConfig accepts non-listed anthropic model names', () => {
  const config = validateConfig({
    ...CONFIG_SCHEMA.defaults,
    endpoints: CONFIG_SCHEMA.defaults.endpoints.map((endpoint) =>
      endpoint.id === 'anthropic'
        ? {
            ...endpoint,
            config: { ...endpoint.config, model: 'claude-haiku-4-5-20251001' }
          }
        : endpoint
    )
  });

  const anthropic = config.endpoints.find((endpoint) => endpoint.id === 'anthropic');
  assert.equal(anthropic?.config?.model, 'claude-haiku-4-5-20251001');
});

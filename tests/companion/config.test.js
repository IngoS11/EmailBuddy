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

test('validateConfig rejects unsupported cloud model names', () => {
  assert.throws(() => {
    validateConfig({
      ...CONFIG_SCHEMA.defaults,
      endpoints: CONFIG_SCHEMA.defaults.endpoints.map((endpoint) =>
        endpoint.id === 'openai'
          ? {
              ...endpoint,
              config: { ...endpoint.config, model: 'gpt-unknown' }
            }
          : endpoint
      )
    });
  }, /Unsupported OpenAI model/);
});

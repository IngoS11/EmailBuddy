import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_SCHEMA, validateConfig } from '../../apps/companion/src/config.js';

test('validateConfig accepts ollama-first defaults', () => {
  const config = validateConfig(CONFIG_SCHEMA.defaults);
  assert.deepEqual(config.providerOrder, ['ollama', 'openai', 'anthropic']);
  assert.equal(config.timeoutMs, 12000);
  assert.equal(config.history.enabled, false);
});

test('validateConfig rejects duplicate providers', () => {
  assert.throws(() => {
    validateConfig({
      ...CONFIG_SCHEMA.defaults,
      providerOrder: ['ollama', 'ollama', 'openai']
    });
  }, /duplicate provider/);
});

test('validateConfig rejects timeout outside allowed range', () => {
  assert.throws(() => {
    validateConfig({
      ...CONFIG_SCHEMA.defaults,
      timeoutMs: 100
    });
  }, /timeoutMs must be between/);
});

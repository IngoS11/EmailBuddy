import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_SCHEMA, validateConfig } from '../../apps/companion/src/config.js';
import { MAX_REWRITE_SYSTEM_TEMPLATE_LENGTH } from '../../apps/companion/src/prompt-template.js';

test('validateConfig accepts enabled/disabled endpoint defaults', () => {
  const config = validateConfig(CONFIG_SCHEMA.defaults);
  assert.deepEqual(config.routing.enabled, ['openai', 'anthropic', 'local-ollama']);
  assert.deepEqual(config.routing.disabled, ['remote-ollama']);
  assert.equal(config.endpoints.length, 4);
  assert.equal(config.timeoutMs, 36000);
  assert.equal(config.history.enabled, false);
  assert.equal(config.appearance.theme, 'system');
  assert.equal(
    config.prompts.rewriteSystemTemplate,
    CONFIG_SCHEMA.defaults.prompts.rewriteSystemTemplate
  );
});

test('validateConfig accepts appearance theme values', () => {
  for (const theme of ['light', 'dark', 'system']) {
    const config = validateConfig({
      ...CONFIG_SCHEMA.defaults,
      appearance: { theme }
    });
    assert.equal(config.appearance.theme, theme);
  }
});

test('validateConfig rejects invalid appearance theme', () => {
  assert.throws(() => {
    validateConfig({
      ...CONFIG_SCHEMA.defaults,
      appearance: { theme: 'sepia' }
    });
  }, /appearance.theme must be one of/);
});

test('validateConfig rejects missing appearance object', () => {
  assert.throws(() => {
    validateConfig({
      ...CONFIG_SCHEMA.defaults,
      appearance: undefined
    });
  }, /appearance must be an object/);
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

test('validateConfig defaults ollama injectSystemPrompt to true when omitted', () => {
  const config = validateConfig({
    ...CONFIG_SCHEMA.defaults,
    endpoints: CONFIG_SCHEMA.defaults.endpoints.map((endpoint) => (
      endpoint.type === 'ollama'
        ? {
            ...endpoint,
            config: {
              ...endpoint.config,
              injectSystemPrompt: undefined
            }
          }
        : endpoint
    ))
  });

  const remote = config.endpoints.find((endpoint) => endpoint.id === 'remote-ollama');
  const local = config.endpoints.find((endpoint) => endpoint.id === 'local-ollama');
  assert.equal(remote?.config?.injectSystemPrompt, true);
  assert.equal(local?.config?.injectSystemPrompt, true);
});

test('validateConfig accepts explicit ollama injectSystemPrompt false', () => {
  const config = validateConfig({
    ...CONFIG_SCHEMA.defaults,
    endpoints: CONFIG_SCHEMA.defaults.endpoints.map((endpoint) => (
      endpoint.id === 'local-ollama'
        ? {
            ...endpoint,
            config: {
              ...endpoint.config,
              injectSystemPrompt: false
            }
          }
        : endpoint
    ))
  });

  const local = config.endpoints.find((endpoint) => endpoint.id === 'local-ollama');
  assert.equal(local?.config?.injectSystemPrompt, false);
});

test('validateConfig defaults prompts.rewriteSystemTemplate when omitted', () => {
  const config = validateConfig({
    ...CONFIG_SCHEMA.defaults,
    prompts: undefined
  });
  assert.equal(
    config.prompts.rewriteSystemTemplate,
    CONFIG_SCHEMA.defaults.prompts.rewriteSystemTemplate
  );
});

test('validateConfig rejects empty rewrite system template', () => {
  assert.throws(() => {
    validateConfig({
      ...CONFIG_SCHEMA.defaults,
      prompts: {
        rewriteSystemTemplate: '   '
      }
    });
  }, /prompts\.rewriteSystemTemplate must be a non-empty string/);
});

test('validateConfig rejects overly long rewrite system template', () => {
  assert.throws(() => {
    validateConfig({
      ...CONFIG_SCHEMA.defaults,
      prompts: {
        rewriteSystemTemplate: 'a'.repeat(MAX_REWRITE_SYSTEM_TEMPLATE_LENGTH + 1)
      }
    });
  }, /prompts\.rewriteSystemTemplate must be at most/);
});

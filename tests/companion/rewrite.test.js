import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENDPOINT_UNAVAILABLE_BASE_COOLDOWN_MS,
  rewriteEmail
} from '../../apps/companion/src/rewrite.js';

const styleMarkdown = `
## global

do: be concise
`;

test('rewriteEmail falls back to later provider when first fails', async () => {
  let receivedSystemPrompt = '';
  const providerRegistry = {
    openai: {
      async rewrite() {
        throw new Error('simulated outage');
      }
    },
    anthropic: {
      async rewrite({ text, systemPrompt }) {
        receivedSystemPrompt = systemPrompt;
        return `rewritten:${text}`;
      }
    }
  };

  const result = await rewriteEmail(
    { text: 'hello team', mode: 'casual' },
    {
      config: {
        endpoints: [
          { id: 'openai', type: 'openai', label: 'OpenAI', config: { model: 'gpt-4.1-mini' } },
          {
            id: 'anthropic',
            type: 'anthropic',
            label: 'Anthropic',
            config: { model: 'claude-3-5-haiku-latest' }
          }
        ],
        routing: {
          enabled: ['openai', 'anthropic'],
          disabled: []
        },
        timeoutMs: 100,
        history: { enabled: false },
        appearance: { theme: 'system' },
        prompts: {
          rewriteSystemTemplate: 'Mode={{mode}}\nRules={{rulesPrompt}}'
        }
      },
      styleMarkdown,
      profile: null,
      providerRegistry,
      skipHistory: true
    }
  );

  assert.equal(result.providerUsed, 'anthropic');
  assert.equal(result.endpointUsed, 'anthropic');
  assert.equal(result.rewrittenText, 'rewritten:hello team');
  assert.equal(result.appliedMode, 'casual');
  assert.equal(result.notes.length, 1);
  assert.match(result.notes[0], /openai: simulated outage/);
  assert.equal(receivedSystemPrompt, 'Mode=casual\nRules=do: be concise');
});

test('rewriteEmail temporarily skips unavailable endpoint during cooldown window', async () => {
  let nowMs = 1_000;
  let openaiCalls = 0;
  let anthropicCalls = 0;
  const endpointAvailability = new Map();

  const providerRegistry = {
    openai: {
      async rewrite() {
        openaiCalls += 1;
        throw new Error('OpenAI endpoint unreachable. Check internet access.');
      }
    },
    anthropic: {
      async rewrite({ text }) {
        anthropicCalls += 1;
        return `rewritten:${text}`;
      }
    }
  };

  const deps = {
    config: {
      endpoints: [
        { id: 'openai', type: 'openai', label: 'OpenAI', config: { model: 'gpt-4.1-mini' } },
        {
          id: 'anthropic',
          type: 'anthropic',
          label: 'Anthropic',
          config: { model: 'claude-3-5-haiku-latest' }
        }
      ],
      routing: {
        enabled: ['openai', 'anthropic'],
        disabled: []
      },
      timeoutMs: 100,
      history: { enabled: false },
      appearance: { theme: 'system' },
      prompts: {
        rewriteSystemTemplate: 'Mode={{mode}}\nRules={{rulesPrompt}}'
      }
    },
    styleMarkdown,
    profile: null,
    providerRegistry,
    endpointAvailability,
    now: () => nowMs,
    skipHistory: true
  };

  const first = await rewriteEmail({ text: 'hello team', mode: 'casual' }, deps);
  assert.equal(first.providerUsed, 'anthropic');
  assert.equal(openaiCalls, 1);
  assert.equal(anthropicCalls, 1);
  assert.match(first.notes[0], /cooldown 30s/);

  nowMs += 1_000;
  const second = await rewriteEmail({ text: 'hello team', mode: 'casual' }, deps);
  assert.equal(second.providerUsed, 'anthropic');
  assert.equal(openaiCalls, 1);
  assert.equal(anthropicCalls, 2);
  assert.match(second.notes[0], /temporarily unavailable/);
});

test('rewriteEmail retries endpoint after cooldown expires', async () => {
  let nowMs = 1_000;
  let openaiCalls = 0;
  const endpointAvailability = new Map();

  const providerRegistry = {
    openai: {
      async rewrite({ text }) {
        openaiCalls += 1;
        if (openaiCalls === 1) {
          throw new Error('OpenAI endpoint unreachable. Check internet access.');
        }
        return `openai:${text}`;
      }
    },
    anthropic: {
      async rewrite({ text }) {
        return `anthropic:${text}`;
      }
    }
  };

  const deps = {
    config: {
      endpoints: [
        { id: 'openai', type: 'openai', label: 'OpenAI', config: { model: 'gpt-4.1-mini' } },
        {
          id: 'anthropic',
          type: 'anthropic',
          label: 'Anthropic',
          config: { model: 'claude-3-5-haiku-latest' }
        }
      ],
      routing: {
        enabled: ['openai', 'anthropic'],
        disabled: []
      },
      timeoutMs: 100,
      history: { enabled: false },
      appearance: { theme: 'system' },
      prompts: {
        rewriteSystemTemplate: 'Mode={{mode}}\nRules={{rulesPrompt}}'
      }
    },
    styleMarkdown,
    profile: null,
    providerRegistry,
    endpointAvailability,
    now: () => nowMs,
    skipHistory: true
  };

  const first = await rewriteEmail({ text: 'hello team', mode: 'casual' }, deps);
  assert.equal(first.providerUsed, 'anthropic');
  assert.equal(openaiCalls, 1);

  nowMs += ENDPOINT_UNAVAILABLE_BASE_COOLDOWN_MS + 1;
  const second = await rewriteEmail({ text: 'hello team', mode: 'casual' }, deps);
  assert.equal(second.providerUsed, 'openai');
  assert.equal(openaiCalls, 2);
  assert.equal(second.notes.length, 0);
});

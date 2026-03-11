import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteEmail } from '../../apps/companion/src/rewrite.js';

const styleMarkdown = `
## global

do: be concise
`;

test('rewriteEmail falls back to later provider when first fails', async () => {
  let receivedSystemPromptTemplate = '';
  const providerRegistry = {
    openai: {
      async rewrite() {
        throw new Error('simulated outage');
      }
    },
    anthropic: {
      async rewrite({ text, systemPromptTemplate }) {
        receivedSystemPromptTemplate = systemPromptTemplate;
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
  assert.equal(receivedSystemPromptTemplate, 'Mode={{mode}}\nRules={{rulesPrompt}}');
});

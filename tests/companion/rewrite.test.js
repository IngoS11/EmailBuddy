import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteEmail } from '../../apps/companion/src/rewrite.js';

const styleMarkdown = `
## global

do: be concise
`;

test('rewriteEmail falls back to later provider when first fails', async () => {
  const providerRegistry = {
    openai: {
      async rewrite() {
        throw new Error('simulated outage');
      }
    },
    mock: {
      async rewrite({ text }) {
        return `rewritten:${text}`;
      }
    }
  };

  const result = await rewriteEmail(
    { text: 'hello team', mode: 'casual' },
    {
      config: {
        providerOrder: ['openai', 'mock'],
        timeoutMs: 100,
        history: { enabled: false }
      },
      styleMarkdown,
      profile: null,
      providerRegistry,
      skipHistory: true
    }
  );

  assert.equal(result.providerUsed, 'mock');
  assert.equal(result.rewrittenText, 'rewritten:hello team');
  assert.equal(result.appliedMode, 'casual');
  assert.equal(result.notes.length, 1);
  assert.match(result.notes[0], /openai: simulated outage/);
});

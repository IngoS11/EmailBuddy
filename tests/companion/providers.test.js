import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOpenAiResponseText } from '../../apps/companion/src/providers.js';

test('extractOpenAiResponseText prefers output_text when present', () => {
  const text = extractOpenAiResponseText({ output_text: '  rewritten email  ' });
  assert.equal(text, 'rewritten email');
});

test('extractOpenAiResponseText reads responses output content blocks', () => {
  const text = extractOpenAiResponseText({
    output: [
      {
        content: [
          { type: 'reasoning', summary: [] },
          { type: 'output_text', text: 'First paragraph.' },
          { type: 'output_text', text: 'Second paragraph.' }
        ]
      }
    ]
  });
  assert.equal(text, 'First paragraph.\n\nSecond paragraph.');
});

test('extractOpenAiResponseText supports legacy choices shape', () => {
  const text = extractOpenAiResponseText({
    choices: [{ message: { content: 'Legacy output' } }]
  });
  assert.equal(text, 'Legacy output');
});


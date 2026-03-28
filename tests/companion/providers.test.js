import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOpenAiResponseText, OllamaProvider } from '../../apps/companion/src/providers.js';
import { renderRewriteSystemTemplate } from '../../apps/companion/src/prompt-template.js';

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

test('renderRewriteSystemTemplate replaces supported tokens', () => {
  const rendered = renderRewriteSystemTemplate({
    template: 'Mode={{mode}}\nRules={{rulesPrompt}}',
    mode: 'casual',
    rulesPrompt: 'do: be concise'
  });

  assert.equal(rendered, 'Mode=casual\nRules=do: be concise');
});

test('OllamaProvider injects system prompt by default', async () => {
  const provider = new OllamaProvider();
  const originalFetch = global.fetch;
  let capturedPrompt = '';
  global.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body ?? '{}'));
    capturedPrompt = String(body.prompt ?? '');
    return {
      ok: true,
      async text() {
        return JSON.stringify({ response: 'rewritten text' });
      }
    };
  };

  try {
    const rewritten = await provider.rewrite({
      text: 'Hallo Team',
      systemPrompt: 'Mode=casual\nRules=do: be concise',
      timeoutMs: 5000,
      endpointConfig: {
        baseUrl: 'http://127.0.0.1:11434',
        model: 'llama3.1:8b'
      }
    });

    assert.equal(rewritten, 'rewritten text');
    assert.match(capturedPrompt, /Mode=casual/);
    assert.match(capturedPrompt, /Rules=do: be concise/);
    assert.match(capturedPrompt, /Email:\nHallo Team/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('OllamaProvider skips system prompt when injectSystemPrompt is false', async () => {
  const provider = new OllamaProvider();
  const originalFetch = global.fetch;
  let capturedPrompt = '';
  global.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body ?? '{}'));
    capturedPrompt = String(body.prompt ?? '');
    return {
      ok: true,
      async text() {
        return JSON.stringify({ response: 'rewritten text' });
      }
    };
  };

  try {
    const rewritten = await provider.rewrite({
      text: 'Hallo Team',
      systemPrompt: 'Mode=casual\nRules=do: be concise',
      timeoutMs: 5000,
      endpointConfig: {
        baseUrl: 'http://127.0.0.1:11434',
        model: 'llama3.1:8b',
        injectSystemPrompt: false
      }
    });

    assert.equal(rewritten, 'rewritten text');
    assert.match(capturedPrompt, /Respond in the same language as the input email\./);
    assert.match(capturedPrompt, /Do not translate unless the user explicitly asks for translation\./);
    assert.match(capturedPrompt, /Email:\nHallo Team/);
    assert.match(capturedPrompt, /Rewritten email \(same language\):/);
  } finally {
    global.fetch = originalFetch;
  }
});

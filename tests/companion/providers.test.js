import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractOpenAiResponseText,
  LMStudioProvider,
  OllamaProvider
} from '../../apps/companion/src/providers.js';
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
  let capturedSystem = '';
  let capturedPrompt = '';
  global.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body ?? '{}'));
    capturedSystem = String(body.system ?? '');
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
    assert.match(capturedSystem, /Mode=casual/);
    assert.match(capturedSystem, /Rules=do: be concise/);
    assert.match(capturedPrompt, /Email:\nHallo Team/);
    assert.doesNotMatch(capturedPrompt, /Mode=casual/);
    assert.doesNotMatch(capturedPrompt, /Rules=do: be concise/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('OllamaProvider skips system prompt when injectSystemPrompt is false', async () => {
  const provider = new OllamaProvider();
  const originalFetch = global.fetch;
  let capturedSystem = '';
  let capturedPrompt = '';
  global.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body ?? '{}'));
    capturedSystem = String(body.system ?? '');
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
    assert.equal(capturedSystem, '');
  } finally {
    global.fetch = originalFetch;
  }
});

test('LMStudioProvider injects system prompt by default', async () => {
  const provider = new LMStudioProvider();
  const originalFetch = global.fetch;
  let capturedMessages = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body ?? '{}'));
    capturedMessages = Array.isArray(body.messages) ? body.messages : [];
    return {
      ok: true,
      async text() {
        return JSON.stringify({
          choices: [{ message: { content: 'rewritten text' } }]
        });
      }
    };
  };

  try {
    const rewritten = await provider.rewrite({
      text: 'Hallo Team',
      systemPrompt: 'Mode=casual\nRules=do: be concise',
      timeoutMs: 5000,
      endpointConfig: {
        baseUrl: 'http://127.0.0.1:1234',
        model: 'qwen2.5-7b-instruct'
      }
    });

    assert.equal(rewritten, 'rewritten text');
    assert.equal(capturedMessages.length, 2);
    assert.equal(capturedMessages[0]?.role, 'system');
    assert.match(String(capturedMessages[0]?.content ?? ''), /Mode=casual/);
    assert.equal(capturedMessages[1]?.role, 'user');
    assert.match(String(capturedMessages[1]?.content ?? ''), /Email:\nHallo Team/);
    assert.doesNotMatch(String(capturedMessages[1]?.content ?? ''), /Mode=casual/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('LMStudioProvider skips system prompt when injectSystemPrompt is false', async () => {
  const provider = new LMStudioProvider();
  const originalFetch = global.fetch;
  let capturedMessages = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body ?? '{}'));
    capturedMessages = Array.isArray(body.messages) ? body.messages : [];
    return {
      ok: true,
      async text() {
        return JSON.stringify({
          choices: [{ message: { content: [{ text: 'rewritten text' }] } }]
        });
      }
    };
  };

  try {
    const rewritten = await provider.rewrite({
      text: 'Hallo Team',
      systemPrompt: 'Mode=casual\nRules=do: be concise',
      timeoutMs: 5000,
      endpointConfig: {
        baseUrl: 'http://127.0.0.1:1234',
        model: 'qwen2.5-7b-instruct',
        injectSystemPrompt: false
      }
    });

    assert.equal(rewritten, 'rewritten text');
    assert.equal(capturedMessages.length, 1);
    assert.equal(capturedMessages[0]?.role, 'user');
    assert.match(
      String(capturedMessages[0]?.content ?? ''),
      /Respond in the same language as the input email\./
    );
    assert.match(String(capturedMessages[0]?.content ?? ''), /Email:\nHallo Team/);
    assert.doesNotMatch(String(capturedMessages[0]?.content ?? ''), /Mode=casual/);
  } finally {
    global.fetch = originalFetch;
  }
});

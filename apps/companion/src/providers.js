import { getSecret } from './keychain.js';

async function parseJsonOrThrow(response) {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Provider error ${response.status}: ${body.slice(0, 300)}`);
  }

  return JSON.parse(body);
}

function rewriteSystemPrompt({ mode, rulesPrompt }) {
  return [
    'You are an email rewriting assistant.',
    `Mode: ${mode}`,
    'Rewrite the email in natural English while preserving intent and facts.',
    'Avoid introducing new commitments or changing meaning.',
    'Respect style directives below:',
    rulesPrompt
  ].join('\n');
}

export class OpenAIProvider {
  name = 'openai';

  async rewrite({ text, mode, rulesPrompt, timeoutMs }) {
    const apiKey = await getSecret('openai_api_key');
    if (!apiKey) {
      throw new Error('Missing OpenAI API key in macOS keychain (account: openai_api_key).');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          input: [
            { role: 'system', content: rewriteSystemPrompt({ mode, rulesPrompt }) },
            { role: 'user', content: text }
          ],
          temperature: 0.4
        })
      });

      const json = await parseJsonOrThrow(response);
      const output = json.output_text?.trim();
      if (!output) {
        throw new Error('OpenAI response missing output_text');
      }

      return output;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class AnthropicProvider {
  name = 'anthropic';

  async rewrite({ text, mode, rulesPrompt, timeoutMs }) {
    const apiKey = await getSecret('anthropic_api_key');
    if (!apiKey) {
      throw new Error('Missing Anthropic API key in macOS keychain (account: anthropic_api_key).');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'claude-3-5-haiku-latest',
          max_tokens: 1200,
          temperature: 0.4,
          system: rewriteSystemPrompt({ mode, rulesPrompt }),
          messages: [{ role: 'user', content: text }]
        })
      });

      const json = await parseJsonOrThrow(response);
      const output = json.content?.find((c) => c.type === 'text')?.text?.trim();
      if (!output) {
        throw new Error('Anthropic response missing text content');
      }

      return output;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class OllamaProvider {
  name = 'ollama';

  async rewrite({ text, mode, rulesPrompt, timeoutMs }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'llama3.1:8b',
          stream: false,
          prompt: `${rewriteSystemPrompt({ mode, rulesPrompt })}\n\nEmail:\n${text}\n\nRewritten email:`
        })
      });

      const json = await parseJsonOrThrow(response);
      const output = json.response?.trim();
      if (!output) {
        throw new Error('Ollama response missing response text');
      }

      return output;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class MockProvider {
  name = 'mock';

  async rewrite({ text, mode }) {
    return `[${mode}] ${text.trim()}`;
  }
}

export function buildProviderRegistry() {
  return {
    openai: new OpenAIProvider(),
    anthropic: new AnthropicProvider(),
    ollama: new OllamaProvider(),
    mock: new MockProvider()
  };
}

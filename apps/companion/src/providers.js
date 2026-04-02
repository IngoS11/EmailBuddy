import { getSecret } from './keychain.js';

async function parseJsonOrThrow(response) {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Provider error ${response.status}: ${body.slice(0, 300)}`);
  }

  return JSON.parse(body);
}

export function extractOpenAiResponseText(json) {
  const direct = typeof json?.output_text === 'string' ? json.output_text.trim() : '';
  if (direct) {
    return direct;
  }

  const chunks = [];
  if (Array.isArray(json?.output)) {
    for (const item of json.output) {
      if (!Array.isArray(item?.content)) {
        continue;
      }
      for (const part of item.content) {
        if (part?.type === 'output_text' || part?.type === 'text') {
          const text = String(part?.text ?? '').trim();
          if (text) {
            chunks.push(text);
          }
        }
      }
    }
  }

  if (chunks.length) {
    return chunks.join('\n\n');
  }

  const legacy = json?.choices?.[0]?.message?.content;
  if (typeof legacy === 'string' && legacy.trim()) {
    return legacy.trim();
  }

  if (Array.isArray(legacy)) {
    const legacyChunks = legacy
      .map((part) => (typeof part?.text === 'string' ? part.text.trim() : ''))
      .filter(Boolean);
    if (legacyChunks.length) {
      return legacyChunks.join('\n\n');
    }
  }

  return '';
}

async function withTimeout(timeoutMs, task) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Provider timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildRewritePrompt(text) {
  return [
    'Email:',
    text,
    '',
    'Rewritten email (same language):'
  ].join('\n');
}

function buildPromptWithoutSystemPrompt(prompt) {
  return [
    'Rewrite the following email while preserving intent and facts.',
    'Respond in the same language as the input email.',
    'Do not translate unless the user explicitly asks for translation.',
    '',
    prompt
  ].join('\n');
}

function extractChatCompletionText(json) {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const chunks = content
      .map((part) => {
        if (typeof part?.text === 'string') {
          return part.text.trim();
        }
        if (part?.type === 'text' && typeof part?.content === 'string') {
          return part.content.trim();
        }
        return '';
      })
      .filter(Boolean);
    if (chunks.length) {
      return chunks.join('\n\n');
    }
  }

  return '';
}

export class OpenAIProvider {
  name = 'openai';

  async rewrite({ text, systemPrompt, timeoutMs, endpointConfig = {} }) {
    const apiKey = await getSecret('openai_api_key');
    if (!apiKey) {
      throw new Error('Missing OpenAI API key in macOS keychain (account: openai_api_key).');
    }

    try {
      const model = String(endpointConfig.model ?? 'gpt-4.1-mini').trim();
      if (!model) {
        throw new Error('OpenAI model must be configured.');
      }

      return await withTimeout(timeoutMs, async (signal) => {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        signal,
        body: JSON.stringify({
          model,
          input: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          temperature: 0.4
        })
      });

      const json = await parseJsonOrThrow(response);
      const output = extractOpenAiResponseText(json);
      if (!output) {
        throw new Error('OpenAI response did not contain rewritten text');
      }

      return output;
      });
    } catch (error) {
      if (error?.message?.includes('fetch failed')) {
        throw new Error('OpenAI endpoint unreachable. Check internet access.');
      }
      throw error;
    }
  }
}

export class AnthropicProvider {
  name = 'anthropic';

  async rewrite({ text, systemPrompt, timeoutMs, endpointConfig = {} }) {
    const apiKey = await getSecret('anthropic_api_key');
    if (!apiKey) {
      throw new Error('Missing Anthropic API key in macOS keychain (account: anthropic_api_key).');
    }

    try {
      const model = String(endpointConfig.model ?? 'claude-3-5-haiku-latest').trim();
      if (!model) {
        throw new Error('Anthropic model must be configured.');
      }

      return await withTimeout(timeoutMs, async (signal) => {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        signal,
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          temperature: 0.4,
          system: systemPrompt,
          messages: [{ role: 'user', content: text }]
        })
      });

      const json = await parseJsonOrThrow(response);
      const output = json.content?.find((c) => c.type === 'text')?.text?.trim();
      if (!output) {
        throw new Error('Anthropic response missing text content');
      }

      return output;
      });
    } catch (error) {
      if (error?.message?.includes('fetch failed')) {
        throw new Error('Anthropic endpoint unreachable. Check internet access.');
      }
      throw error;
    }
  }
}

export class OllamaProvider {
  name = 'ollama';

  async rewrite({ text, systemPrompt, timeoutMs, endpointConfig = {} }) {
    const baseUrl = String(endpointConfig.baseUrl ?? '').trim().replace(/\/$/, '');
    const model = String(endpointConfig.model ?? '').trim();
    const injectSystemPrompt = endpointConfig.injectSystemPrompt !== false;
    if (!baseUrl) {
      throw new Error('Ollama baseUrl must be configured.');
    }
    if (!model) {
      throw new Error('Ollama model must be configured.');
    }

    try {
      return await withTimeout(timeoutMs, async (signal) => {
      const prompt = buildRewritePrompt(text);
      const requestBody = {
        model,
        stream: false,
        prompt
      };
      if (injectSystemPrompt) {
        requestBody.system = systemPrompt;
      } else {
        requestBody.prompt = buildPromptWithoutSystemPrompt(requestBody.prompt);
      }
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify(requestBody)
      });

      const json = await parseJsonOrThrow(response);
      const output = json.response?.trim();
      if (!output) {
        throw new Error('Ollama response missing response text');
      }

      return output;
      });
    } catch (error) {
      if (error?.message?.includes('fetch failed')) {
        throw new Error(`Ollama endpoint unreachable at ${baseUrl}. Check LAN/VPN access.`);
      }
      throw error;
    }
  }
}

export class LMStudioProvider {
  name = 'lmstudio';

  async rewrite({ text, systemPrompt, timeoutMs, endpointConfig = {} }) {
    const baseUrl = String(endpointConfig.baseUrl ?? '').trim().replace(/\/$/, '');
    const model = String(endpointConfig.model ?? '').trim();
    const injectSystemPrompt = endpointConfig.injectSystemPrompt !== false;
    if (!baseUrl) {
      throw new Error('LM Studio baseUrl must be configured.');
    }
    if (!model) {
      throw new Error('LM Studio model must be configured.');
    }

    try {
      return await withTimeout(timeoutMs, async (signal) => {
        const prompt = buildRewritePrompt(text);
        const userContent = injectSystemPrompt ? prompt : buildPromptWithoutSystemPrompt(prompt);
        const messages = [{ role: 'user', content: userContent }];
        if (injectSystemPrompt) {
          messages.unshift({ role: 'system', content: systemPrompt });
        }

        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            model,
            temperature: 0.4,
            messages
          })
        });

        const json = await parseJsonOrThrow(response);
        const output = extractChatCompletionText(json);
        if (!output) {
          throw new Error('LM Studio response missing completion text');
        }

        return output;
      });
    } catch (error) {
      if (error?.message?.includes('fetch failed')) {
        throw new Error(`LM Studio endpoint unreachable at ${baseUrl}. Check LAN/VPN access.`);
      }
      throw error;
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
    lmstudio: new LMStudioProvider(),
    mock: new MockProvider()
  };
}

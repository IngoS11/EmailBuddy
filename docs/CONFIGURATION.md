# EmailBuddy Configuration Guide

This document explains the runtime and style configuration options available in EmailBuddy.

## Where Configuration Lives

- Runtime config: `~/.emailbuddy/config.json`
- Style rules: `~/.emailbuddy/STYLE.md`
- Learned profile: `~/.emailbuddy/profile.json` (generated from writing samples)
- Rewrite history (optional): `~/.emailbuddy/history.jsonl`
- Cloud API keys: macOS Keychain (`openai_api_key`, `anthropic_api_key`)

You can manage most settings from:
- Extension options page (`chrome://extensions` -> EmailBuddy -> Extension options)
- Companion console (`http://127.0.0.1:48123/console`)
- Direct API calls to `GET/PUT /v1/config` and `GET/PUT /v1/style`

## Runtime Config (`config.json`)

### Top-level fields

- `host`: Companion bind host (default `127.0.0.1`)
- `port`: Companion bind port (default `48123`)
- `endpoints`: Configured model endpoints (Ollama, LM Studio, and cloud)
- `routing.enabled`: Ordered endpoint IDs to try first
- `routing.disabled`: Endpoint IDs excluded from rewrite attempts
- `history.enabled`: Store rewrite history (`true`/`false`)
- `appearance.theme`: `system`, `light`, or `dark`
- `prompts.rewriteSystemTemplate`: Global system-prompt template used for rewrite instructions
- `timeoutMs`: Provider timeout in milliseconds (1000-60000)

### Endpoint schema

Each endpoint contains:

- `id`: Stable endpoint ID (for example `local-ollama`)
- `type`: `ollama`, `lmstudio`, `openai`, or `anthropic`
- `label`: Display label used in UIs
- `config`: Provider-specific config
- `timeoutMs` (optional): Override global timeout for this endpoint

#### Ollama endpoint config

- `baseUrl`: Ollama server URL (`http://127.0.0.1:11434`, LAN URL, etc.)
- `model`: Ollama model/tag to call
- `injectSystemPrompt`: Whether EmailBuddy prepends its generated system prompt
  - `true` (default): EmailBuddy rewrite instructions are injected
  - `false`: EmailBuddy does not inject system instructions; use your Ollama Modelfile/system prompt behavior

#### OpenAI endpoint config

- `model`: OpenAI model name

#### LM Studio endpoint config

- `baseUrl`: LM Studio server URL (for example, `http://127.0.0.1:1234`)
- `model`: LM Studio model ID shown by `/v1/models`
- `injectSystemPrompt`: Whether EmailBuddy injects its generated system prompt
  - `true` (default): EmailBuddy system prompt is sent as a system message
  - `false`: EmailBuddy does not send a system message and inlines minimal rewrite instructions into the user message

#### Anthropic endpoint config

- `model`: Anthropic model name

### Default endpoint setup

- Enabled by default (in order): `openai`, `anthropic`, `local-ollama`
- Disabled by default: `remote-ollama`, `local-lmstudio`, `remote-lmstudio`

### Prompt template settings

- `prompts.rewriteSystemTemplate` is edited in Companion Console:
  - `Settings` -> `Prompt`
- Supported tokens:
  - `{{mode}}`
  - `{{rulesPrompt}}`
- This template is used by:
  - OpenAI system message
  - Anthropic system message
  - Ollama when `injectSystemPrompt=true`

## Style Rules (`STYLE.md`)

`STYLE.md` controls rewrite behavior by mode using markdown directives.

Example:

```md
## global
do: keep language clear and natural
avoid: unnecessary jargon

## mode: casual
do: sound warm and collaborative
avoid: stiff wording
```

Notes:
- Mode-specific rules override `global` rules.
- Style rules are merged with learned profile traits (if any).

## Profile Learning

Use `POST /v1/profile/samples` with writing samples to generate a profile that captures tone preferences. That profile is combined with `STYLE.md` rules at rewrite time.

## API Key Configuration (macOS Keychain)

Set keys:

```bash
security add-generic-password -U -a openai_api_key -s emailbuddy -w '<OPENAI_KEY>'
security add-generic-password -U -a anthropic_api_key -s emailbuddy -w '<ANTHROPIC_KEY>'
```

Check key presence:
- `GET /v1/secrets/status`

## API Endpoints for Config

- `GET /v1/config`
- `PUT /v1/config`
- `GET /v1/config/schema`
- `GET /v1/style`
- `PUT /v1/style`
- `POST /v1/profile/samples`

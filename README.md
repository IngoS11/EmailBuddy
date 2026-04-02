# EmailBuddy

EmailBuddy is a macOS-focused toolchain for beautifying Gmail draft text in your personal style using Ollama or LM Studio endpoints (local or remote), plus cloud models from OpenAI and Anthropic.

## Components
- `apps/extension`: Chrome extension that rewrites draft text from a keyboard shortcut in Gmail compose.
- `apps/companion`: Local HTTP service (`127.0.0.1:48123`) that rewrites text using ordered enabled models.
- `packages/shared`: Style/profile parsing and common helpers.

## Requirements
### Minimum
- macOS 13+ (Ventura or newer)
- Node.js 20+ and npm
- Chrome/Chromium (for extension workflow)
- Internet connection for cloud providers and first-time model download

### Recommended
- Apple Silicon Mac (M1/M2/M3) with 16 GB RAM or more
- Ollama endpoint (local or remote; `llama3.1:8b` local by default)
- OpenAI and/or Anthropic API key for cloud models
- LM Studio endpoint (local or remote, optional)
- Stable internet for initial setup and model pulls

## Quick Start
0. Guided setup (recommended):
```bash
npm run install:guided
```
This installer checks whether Ollama is installed and asks for approval before installing it.

1. Start the companion service:
```bash
npm run dev
```
2. Add cloud keys to macOS Keychain (optional but recommended):
```bash
security add-generic-password -U -a openai_api_key -s emailbuddy -w '<OPENAI_KEY>'
security add-generic-password -U -a anthropic_api_key -s emailbuddy -w '<ANTHROPIC_KEY>'
```
3. Optional for local/self-hosted inference: configure Ollama and/or LM Studio endpoints (local or remote). Skip this step if you only use cloud models:
```bash
ollama serve
ollama pull llama3.1:8b
```
Optional: configure an LM Studio endpoint in settings (`http://127.0.0.1:1234` by default for local LM Studio).
4. Load extension in Chrome:
- Open `chrome://extensions`
- Enable Developer Mode
- Click **Load unpacked** and select `apps/extension/src`
- In Gmail compose, press your configured shortcut (default: `Cmd+Shift+E`) to beautify selected text (or full draft if nothing is selected).
- Configure the shortcut:
  - Open extension details in `chrome://extensions`
  - Click **Extension options**
  - Click **Record shortcut** and press your preferred key combination
  - Use the same page to edit backend config (provider order, timeout, history, API keys)

## Optional: Custom Ollama Modelfile
Using a custom Ollama Modelfile is optional. EmailBuddy works with standard pulled models (for example `llama3.1:8b`) out of the box.

If you want to customize model behavior, you can use the repository's example Modelfile:
- [Modelfile](./Modelfile)

If you disable `injectSystemPrompt` for an Ollama endpoint, your Modelfile/system prompt instructions become the primary rewrite guidance for that endpoint.

## Global macOS Shortcut (Hammerspoon)
For global usage outside Gmail/Chrome, use Hammerspoon to send selected text to EmailBuddy Companion and replace it in place.

- Setup guide: [docs/HAMMERSPOON.md](docs/HAMMERSPOON.md)
- Ready-to-copy script: [docs/hammerspoon-emailbuddy.lua](docs/hammerspoon-emailbuddy.lua)

## Configuration

Detailed configuration reference:
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md)

This includes:
- `config.json` runtime options (`endpoints`, `routing`, `timeoutMs`, `history`, `appearance`)
- Ollama and LM Studio endpoint options, including `injectSystemPrompt`
- System prompt template configuration (`Settings` -> `Prompt` in Companion Console)
- `STYLE.md` format and profile behavior
- API-key/keychain setup and config endpoints

## API
- `POST /v1/rewrite`
- `GET /v1/system/checks`
- `POST /v1/profile/samples`
- `GET/PUT /v1/config`
- `GET /v1/config/schema`
- `GET /v1/models`
- `GET/PUT /v1/style`
- `POST /v1/secrets`
- `GET /v1/secrets/status`

## Debugging and Test UI
- Companion logs now print JSON lines with request IDs, durations, and provider attempt outcomes.
- Start the companion:
```bash
npm run dev
```
- Open companion console:
```bash
http://127.0.0.1:48123/console
```
- Use tabs in the page to test rewrites, edit runtime settings, and modify `STYLE.md`.

## Test and Build
```bash
npm test
npm run build
```

## Run as a Background Service (macOS)
Install and enable login auto-start:
```bash
npm run service:install
```

## Uninstall
- Full guide: [docs/UNINSTALL.md](docs/UNINSTALL.md)
- Guided script:
```bash
npm run uninstall:guided
```
- Remove the background service:
```bash
npm run service:uninstall
```
- Note: Chrome extension removal is manual (`chrome://extensions`).

## Manual Service Controls:
Use npm run to manually control the service:
```bash
npm run service:start
npm run service:stop
npm run service:restart
npm run service:status
npm run service:logs
```

## Releases and GitHub Actions
- CI workflow: `.github/workflows/ci.yml` (tests + build checks on PR/push).
- Release workflow: `.github/workflows/release.yml` (builds extension ZIP + macOS DMG + checksums).
- To publish a GitHub release:
```bash
git tag v0.1.1
git push origin v0.1.1
```
- The tagged workflow uploads artifacts to the GitHub Release automatically.
- For manual artifact generation in CI without tagging, run the Release workflow via `workflow_dispatch`.

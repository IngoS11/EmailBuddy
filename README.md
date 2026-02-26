# EmailBuddy

EmailBuddy is a macOS-focused toolchain for beautifying Gmail draft text in your personal style.

## Components
- `apps/extension`: Chrome extension that rewrites draft text from a keyboard shortcut in Gmail compose.
- `apps/companion`: Local HTTP service (`127.0.0.1:48123`) that rewrites text with Ollama-first + cloud fallback.
- `packages/shared`: Style/profile parsing and common helpers.

## Quick Start
1. Start the companion service:
```bash
npm run dev
```
2. Add cloud keys to macOS Keychain (optional but recommended):
```bash
security add-generic-password -U -a openai_api_key -s emailbuddy -w '<OPENAI_KEY>'
security add-generic-password -U -a anthropic_api_key -s emailbuddy -w '<ANTHROPIC_KEY>'
```
3. Ensure local fallback is available:
```bash
ollama serve
ollama pull llama3.1:8b
```
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

## Style Configuration
Edit `~/.emailbuddy/STYLE.md` to define mode behavior:

```md
## mode: casual
do: sound warm and collaborative
avoid: stiff wording
```

Markdown rules override learned profile traits.

## API
- `POST /v1/rewrite`
- `POST /v1/profile/samples`
- `GET/PUT /v1/config`
- `GET /v1/config/schema`
- `GET/PUT /v1/style`
- `POST /v1/secrets`
- `GET /v1/secrets/status`

## Debugging and Test UI
- Companion logs now print JSON lines with request IDs, durations, and provider attempt outcomes.
- Default provider order is now `ollama -> openai -> anthropic` for new installs.
- Start the companion:
```bash
npm run dev
```
- Open test UI:
```bash
http://127.0.0.1:48123/test-ui
```
- Use tabs in the page to test rewrites, edit runtime settings, and modify `STYLE.md`.

## Test and Build
```bash
npm test
npm run build
```

## Optional: Auto-start Companion at Login
1. Copy and edit [docs/com.emailbuddy.companion.plist](/Users/isauerzapf/Development/emailbuddy/docs/com.emailbuddy.companion.plist) (replace `USERNAME` path).
2. Install it:
```bash
cp docs/com.emailbuddy.companion.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.emailbuddy.companion.plist
```

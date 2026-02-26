# EmailBuddy Architecture

## Overview
EmailBuddy has two runtime components:
1. **Chrome extension** in Gmail (`apps/extension/src/content.js`)
2. **Local companion service** on macOS (`apps/companion/src/index.js`)

The extension handles keyboard-triggered rewrite actions and text selection in Gmail. The companion app handles style/profile loading, provider routing, and model calls.

## Component Responsibilities
- **Extension (MV3 content script)**
  - Listens for a user-configured keyboard shortcut (default `Cmd+Shift+E`) while focus is in Gmail compose.
  - Reads selected draft text (or full compose text).
  - Calls local API and replaces the draft text with rewritten output.

- **Companion service (Node HTTP server)**
  - Exposes `POST /v1/rewrite`, `POST /v1/profile/samples`, `GET/PUT /v1/config`, `GET /v1/config/schema`, `POST /v1/secrets`, `GET /v1/secrets/status`.
  - Reads `~/.emailbuddy/STYLE.md` and optional `profile.json`.
  - Merges style/profile directives and builds prompt constraints.
  - Tries providers in configured order (default: Ollama first, then cloud fallbacks).

## Rewrite Request Flow
1. User presses the configured shortcut in Gmail compose.
2. Extension sends `POST http://127.0.0.1:48123/v1/rewrite` with:
   - `text`
   - `mode` (`casual` default in shortcut flow)
3. Companion:
   - parses style markdown,
   - resolves mode,
   - attempts providers in `config.providerOrder`.
4. First successful provider returns:
   - `rewrittenText`, `appliedMode`, `providerUsed`, `notes`.
5. Extension replaces selected/compose text and shows provider status.

## When Extension Calls Companion
- **On configured keyboard shortcut**: one rewrite API call.
- No background polling is used.
- Extension options UI reads/writes backend settings through companion config/secrets endpoints.
- Companion `/test-ui` also edits the same config, making companion the single source of truth.

## Performance Notes
No DOM observers are used in the extension runtime path, so Gmail compose performance is not impacted by continuous mutation handling.

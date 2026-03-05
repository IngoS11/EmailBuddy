# Global macOS Shortcut with Hammerspoon

Use this if you want EmailBuddy outside Gmail/Chrome.

## What it does
- Binds global shortcut `Cmd+Shift+E`.
- Reads selected text from the focused app via macOS Accessibility APIs.
- Calls EmailBuddy Companion `POST /v1/rewrite` with mode `polished`.
- Replaces the selected text with rewritten output.
- On error, leaves the original text unchanged and shows a notification.

## Prerequisites
- Hammerspoon installed from [hammerspoon.org](https://www.hammerspoon.org/).
- EmailBuddy Companion running on `127.0.0.1:48123`:
  ```bash
  npm run service:start
  ```
- Accessibility permission enabled for Hammerspoon:
  - System Settings -> Privacy & Security -> Accessibility -> enable `Hammerspoon`.

## Setup
1. Open your Hammerspoon config:
   - `~/.hammerspoon/init.lua`
2. Copy contents of:
   - `docs/hammerspoon-emailbuddy.lua`
3. Paste into `init.lua` (or `require` it from there).
4. Reload Hammerspoon config from the menu bar icon.

## Notes
- This uses Accessibility selected-text attributes (`AXSelectedText`), so compatibility varies by app.
- If a target app does not support setting selected text, you will see:
  - `Focused app does not allow AX text replacement.`
- Current default mode is fixed to `polished` in `docs/hammerspoon-emailbuddy.lua`.

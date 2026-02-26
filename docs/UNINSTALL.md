# Uninstall EmailBuddy

This guide removes the companion service and extension from macOS + Chrome.

## 1) Stop and remove companion auto-start
If you previously installed the LaunchAgent:

```bash
launchctl unload ~/Library/LaunchAgents/com.emailbuddy.companion.plist 2>/dev/null || true
rm -f ~/Library/LaunchAgents/com.emailbuddy.companion.plist
```

## 2) Stop any running companion process
```bash
lsof -tiTCP:48123 -sTCP:LISTEN | xargs -I{} kill {} 2>/dev/null || true
```

## 3) Remove project/app files
If you installed from source, remove the repo folder:

```bash
rm -rf /Users/<user>/Development/emailbuddy
```

If you installed from a packaged app, delete `EmailBuddy.app` from `/Applications` (or where you installed it).

## 4) Optional: remove user data
This deletes style/config/history/profile data.

```bash
rm -rf ~/.emailbuddy
```

## 5) Remove Chrome extension (manual)
Chrome does not allow normal apps to silently uninstall user extensions.

1. Open `chrome://extensions`
2. Find **EmailBuddy**
3. Click **Remove**
4. Confirm removal

## 6) Optional: cleanup temp logs
```bash
rm -f /tmp/emailbuddy*.log /tmp/emailbuddy-ollama.log
```

## 7) Verify uninstall
```bash
lsof -nP -iTCP:48123 -sTCP:LISTEN
```
Expected: no output.

Also confirm EmailBuddy no longer appears at `chrome://extensions`.

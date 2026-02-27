#!/usr/bin/env bash
set -euo pipefail

keep_data=true
remove_repo=false

info() {
  printf '\n[EmailBuddy] %s\n' "$1"
}

warn() {
  printf '\n[EmailBuddy][warn] %s\n' "$1"
}

ask_yes_no() {
  local prompt="$1"
  local reply
  read -r -p "$prompt [y/N] " reply
  case "${reply:-}" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

main() {
  warn "This script uninstalls EmailBuddy components from this machine."

  if ! ask_yes_no "Continue with uninstall?"; then
    info "Canceled."
    exit 0
  fi

  info "Unloading and removing LaunchAgent (if present)..."
  launchctl bootout "gui/$(id -u)/com.emailbuddy.companion" 2>/dev/null || true
  rm -f ~/Library/LaunchAgents/com.emailbuddy.companion.plist

  info "Stopping companion listener on port 48123 (if running)..."
  lsof -tiTCP:48123 -sTCP:LISTEN | xargs -I{} kill {} 2>/dev/null || true

  if ask_yes_no "Remove user data under ~/.emailbuddy?"; then
    keep_data=false
  fi

  if [[ "$keep_data" == "false" ]]; then
    info "Removing ~/.emailbuddy ..."
    rm -rf ~/.emailbuddy
  else
    info "Keeping ~/.emailbuddy data."
  fi

  if ask_yes_no "Remove this repository folder ($PWD)?"; then
    remove_repo=true
  fi

  info "Cleaning temporary logs..."
  rm -f /tmp/emailbuddy*.log /tmp/emailbuddy-ollama.log

  info "Manual step required: remove extension in Chrome."
  echo "  1) Open chrome://extensions"
  echo "  2) Find EmailBuddy"
  echo "  3) Click Remove"

  if [[ "$remove_repo" == "true" ]]; then
    info "Removing repository folder..."
    cd ..
    rm -rf "$OLDPWD"
    info "Repository removed."
  fi

  info "Uninstall flow complete."
}

main "$@"

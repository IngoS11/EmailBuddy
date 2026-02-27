#!/usr/bin/env bash
set -euo pipefail

LABEL="com.emailbuddy.companion"
LOG_OUT="/tmp/emailbuddy.out.log"
LOG_ERR="/tmp/emailbuddy.err.log"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_PLIST="$REPO_ROOT/docs/com.emailbuddy.companion.plist"
TARGET_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ENTRYPOINT="$REPO_ROOT/apps/companion/src/index.js"
LAUNCH_DOMAIN="gui/$(id -u)"
LAUNCH_TARGET="$LAUNCH_DOMAIN/$LABEL"

info() {
  printf '\n[EmailBuddy] %s\n' "$1"
}

warn() {
  printf '\n[EmailBuddy][warn] %s\n' "$1"
}

die() {
  printf '\n[EmailBuddy][error] %s\n' "$1" >&2
  exit 1
}

require_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    die "service commands are supported on macOS only"
  fi
}

ensure_paths() {
  [[ -f "$TEMPLATE_PLIST" ]] || die "missing template plist: $TEMPLATE_PLIST"
  [[ -f "$ENTRYPOINT" ]] || die "missing companion entrypoint: $ENTRYPOINT"
  mkdir -p "$HOME/Library/LaunchAgents"
}

is_loaded() {
  launchctl print "$LAUNCH_TARGET" >/dev/null 2>&1
}

render_plist() {
  local escaped_entrypoint
  escaped_entrypoint=$(printf '%s' "$ENTRYPOINT" | sed 's/[\\/&]/\\&/g')
  sed \
    -e "s#__EMAILBUDDY_ENTRYPOINT__#$escaped_entrypoint#g" \
    -e "s#/Users/USERNAME/Development/emailbuddy/apps/companion/src/index.js#$escaped_entrypoint#g" \
    "$TEMPLATE_PLIST" > "$TARGET_PLIST"
}

service_install() {
  require_macos
  ensure_paths

  info "Installing LaunchAgent plist..."
  render_plist

  if is_loaded; then
    info "Reloading existing LaunchAgent..."
    launchctl bootout "$LAUNCH_TARGET" >/dev/null 2>&1 || true
  fi

  launchctl bootstrap "$LAUNCH_DOMAIN" "$TARGET_PLIST"
  launchctl kickstart -k "$LAUNCH_TARGET"

  info "Installed and started: $LABEL"
  info "Logs: $LOG_OUT and $LOG_ERR"
}

service_uninstall() {
  require_macos

  if is_loaded; then
    info "Stopping LaunchAgent..."
    launchctl bootout "$LAUNCH_TARGET" >/dev/null 2>&1 || true
  fi

  rm -f "$TARGET_PLIST"
  info "Removed LaunchAgent: $LABEL"
}

service_start() {
  require_macos
  ensure_paths

  if [[ ! -f "$TARGET_PLIST" ]]; then
    warn "LaunchAgent plist is not installed; installing first"
    service_install
    return
  fi

  if ! is_loaded; then
    info "Loading LaunchAgent..."
    launchctl bootstrap "$LAUNCH_DOMAIN" "$TARGET_PLIST"
  fi

  launchctl kickstart -k "$LAUNCH_TARGET"
  info "Started: $LABEL"
}

service_stop() {
  require_macos

  if is_loaded; then
    launchctl bootout "$LAUNCH_TARGET"
    info "Stopped: $LABEL"
  else
    warn "Service is not running"
  fi
}

service_restart() {
  service_stop || true
  service_start
}

service_status() {
  require_macos

  if is_loaded; then
    info "LaunchAgent status: loaded"
    launchctl print "$LAUNCH_TARGET" | sed -n '1,25p'
  else
    info "LaunchAgent status: not loaded"
    if [[ -f "$TARGET_PLIST" ]]; then
      info "Plist installed at: $TARGET_PLIST"
    else
      warn "Plist not installed (run: npm run service:install)"
    fi
  fi

  local listener
  listener=$(lsof -nP -iTCP:48123 -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "$listener" ]]; then
    info "Port 48123 listener detected"
    echo "$listener"
  else
    warn "No process currently listening on 127.0.0.1:48123"
  fi
}

service_logs() {
  require_macos
  touch "$LOG_OUT" "$LOG_ERR"
  info "Tailing logs (Ctrl+C to exit)"
  tail -n 100 -f "$LOG_OUT" "$LOG_ERR"
}

usage() {
  cat <<USAGE
Usage: sh scripts/service.sh <command>

Commands:
  install     Install LaunchAgent and start service
  uninstall   Stop service and remove LaunchAgent plist
  start       Start service in background
  stop        Stop service
  restart     Restart service
  status      Show LaunchAgent and listener status
  logs        Tail service logs
USAGE
}

main() {
  local cmd="${1:-}"

  case "$cmd" in
    install) service_install ;;
    uninstall) service_uninstall ;;
    start) service_start ;;
    stop) service_stop ;;
    restart) service_restart ;;
    status) service_status ;;
    logs) service_logs ;;
    -h|--help|help|"")
      usage
      ;;
    *)
      die "unknown command: $cmd"
      ;;
  esac
}

main "$@"

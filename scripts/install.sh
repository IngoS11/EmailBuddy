#!/usr/bin/env bash
set -euo pipefail

DEFAULT_MODEL="${EMAILBUDDY_DEFAULT_MODEL:-llama3.1:8b}"

info() {
  printf '\n[EmailBuddy] %s\n' "$1"
}

warn() {
  printf '\n[EmailBuddy][warn] %s\n' "$1"
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
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

install_ollama() {
  info "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
}

ensure_ollama_running() {
  if ! pgrep -x ollama >/dev/null 2>&1; then
    info "Starting Ollama background service..."
    nohup ollama serve >/tmp/emailbuddy-ollama.log 2>&1 &
    sleep 2
  fi
}

main() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    warn "This installer currently targets macOS only."
    exit 1
  fi

  if ! have_cmd node; then
    warn "Node.js is required. Install Node.js 20+ and rerun this installer."
    exit 1
  fi

  if ! have_cmd npm; then
    warn "npm is required. Install npm and rerun this installer."
    exit 1
  fi

  info "Installing JavaScript dependencies..."
  npm install

  local ollama_available="false"
  if have_cmd ollama; then
    ollama_available="true"
    info "Ollama is already installed."
  else
    warn "Ollama is not installed. Local-first rewriting works best with Ollama."
    if ask_yes_no "Install Ollama now?"; then
      install_ollama
      if have_cmd ollama; then
        ollama_available="true"
        info "Ollama installation complete."
      else
        warn "Ollama installation did not complete successfully."
      fi
    else
      warn "Skipping Ollama installation. Cloud fallback can still be used if configured."
    fi
  fi

  if [[ "$ollama_available" == "true" ]]; then
    ensure_ollama_running
    if ask_yes_no "Pull default model ${DEFAULT_MODEL} now?"; then
      info "Pulling model ${DEFAULT_MODEL}..."
      ollama pull "$DEFAULT_MODEL"
    else
      warn "Skipping model pull for now. You can run: ollama pull ${DEFAULT_MODEL}"
    fi
  else
    warn "Ollama is unavailable. You can install later and rerun this script."
  fi

  info "Install complete. Next steps:"
  echo "  1) Start companion: npm run dev"
  echo "  2) Open test UI: http://127.0.0.1:48123/test-ui"
  echo "  3) Load Chrome extension from apps/extension/src"
}

main "$@"

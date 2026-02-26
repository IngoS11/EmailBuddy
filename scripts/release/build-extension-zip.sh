#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <version>"
  exit 1
fi

VERSION="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/dist/release"
STAGE_DIR="$OUT_DIR/stage-extension"
PACKAGE_DIR="$STAGE_DIR/EmailBuddy-Extension"
OUTPUT_ZIP="$OUT_DIR/EmailBuddy-Extension-${VERSION}.zip"

rm -rf "$STAGE_DIR"
mkdir -p "$PACKAGE_DIR"
mkdir -p "$OUT_DIR"

cp -R "$ROOT_DIR/apps/extension/src/"* "$PACKAGE_DIR/"
cat > "$PACKAGE_DIR/VERSION.txt" <<TXT
EmailBuddy Extension
Version: ${VERSION}
TXT

(
  cd "$STAGE_DIR"
  rm -f "$OUTPUT_ZIP"
  zip -r "$OUTPUT_ZIP" "EmailBuddy-Extension" >/dev/null
)

echo "$OUTPUT_ZIP"

#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <version> <extension_zip_path>"
  exit 1
fi

VERSION="$1"
EXTENSION_ZIP_PATH="$2"

if [[ ! -f "$EXTENSION_ZIP_PATH" ]]; then
  echo "Extension zip not found: $EXTENSION_ZIP_PATH"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/dist/release"
STAGE_DIR="$OUT_DIR/stage-dmg"
APP_DIR="$STAGE_DIR/EmailBuddy"
DMG_PATH="$OUT_DIR/EmailBuddy-${VERSION}.dmg"

rm -rf "$STAGE_DIR"
mkdir -p "$APP_DIR"
mkdir -p "$OUT_DIR"

mkdir -p "$APP_DIR/companion"
cp -R "$ROOT_DIR/apps/companion" "$APP_DIR/companion/"
cp -R "$ROOT_DIR/packages/shared" "$APP_DIR/companion/shared"
cp "$ROOT_DIR/package.json" "$APP_DIR/"
cp "$ROOT_DIR/README.md" "$APP_DIR/"
cp "$ROOT_DIR/docs/UNINSTALL.md" "$APP_DIR/"
cp "$ROOT_DIR/scripts/install.sh" "$APP_DIR/"
cp "$ROOT_DIR/scripts/uninstall.sh" "$APP_DIR/"
cp "$EXTENSION_ZIP_PATH" "$APP_DIR/"

cat > "$APP_DIR/INSTALL.txt" <<TXT
EmailBuddy ${VERSION}

1) Open Terminal in this folder.
2) Run: sh install.sh
3) Start companion: npm run dev
4) Load extension zip in Chrome (or unpack apps/extension/src).

Extension package:
$(basename "$EXTENSION_ZIP_PATH")
TXT

rm -f "$DMG_PATH"
hdiutil create \
  -volname "EmailBuddy ${VERSION}" \
  -srcfolder "$APP_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH" >/dev/null

echo "$DMG_PATH"

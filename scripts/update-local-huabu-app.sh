#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGED_APP="$ROOT_DIR/backend/cmd/desktop/build/bin/Huabu.app"
INSTALLED_APP="/Applications/Huabu.app"

cleanup_staged_app() {
  if [[ -d "$STAGED_APP" && ! -L "$STAGED_APP" ]]; then
    find "$STAGED_APP" -depth -delete
  fi
}
trap cleanup_staged_app EXIT

"$ROOT_DIR/scripts/build-huabu-release.sh"

if [[ ! -x "$STAGED_APP/Contents/MacOS/Huabu" ]]; then
  echo "Built Huabu.app is incomplete: $STAGED_APP" >&2
  exit 1
fi
# External agents connect through the bundled CLI, so an install without it is
# incomplete even though the GUI would start.
if [[ ! -x "$STAGED_APP/Contents/MacOS/cli/huabu" ]]; then
  echo "Built Huabu.app has no bundled huabu CLI: $STAGED_APP/Contents/MacOS/cli/huabu" >&2
  exit 1
fi
codesign --verify --deep --strict "$STAGED_APP"
if [[ -e "$INSTALLED_APP" && ( ! -d "$INSTALLED_APP" || -L "$INSTALLED_APP" ) ]]; then
  echo "Refusing to replace unexpected target: $INSTALLED_APP" >&2
  exit 1
fi

osascript -e 'tell application id "com.wails.huabu" to quit' 2>/dev/null || true
for _ in 1 2 3 4 5; do
  pgrep -f '^/Applications/Huabu.app/Contents/MacOS/Huabu$' >/dev/null || break
  sleep 1
done
if pgrep -f '^/Applications/Huabu.app/Contents/MacOS/Huabu$' >/dev/null; then
  echo "Huabu is still running. Save your work and quit before updating." >&2
  exit 1
fi

mkdir -p "$INSTALLED_APP"
rsync -a --delete "$STAGED_APP/" "$INSTALLED_APP/"
codesign --verify --deep --strict "$INSTALLED_APP"

echo "Updated the canonical local app: $INSTALLED_APP"

#!/bin/bash
# One-time setup for sweety-statechart-video rendering (macOS / Linux). Narration (Apple Silicon) is separate: see README.
#   bash scripts/setup.sh
set -euo pipefail
VENV="$HOME/.local/share/sweety-statechart-video/venv"
PY="${PYTHON:-python3}"
command -v ffmpeg >/dev/null || { echo "ffmpeg not found: install it first (macOS: brew install ffmpeg)"; exit 1; }
if [ ! -x "$VENV/bin/python" ]; then
  echo "creating $VENV"
  "$PY" -m venv "$VENV"
fi
"$VENV/bin/python" -m pip install --quiet --upgrade pip
"$VENV/bin/python" -m pip install --quiet "playwright>=1.40" "pillow>=9" numpy scipy
# Google Chrome is used when installed; otherwise Playwright's own Chromium
if [ -d "/Applications/Google Chrome.app" ] || command -v google-chrome >/dev/null; then
  echo "using the installed Google Chrome"
else
  "$VENV/bin/python" -m playwright install chromium
fi
echo "ready: scv.py uses $VENV/bin/python for rendering (override with SCV_PYTHON)"
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
"$VENV/bin/python" "$SKILL/scripts/smoke_test.py"

#!/usr/bin/env bash
# Run from a separate task directory after film.json and scenes.js are ready.
set -euo pipefail

JOB="${1:?usage: run.sh /absolute/path/to/JOB}"
SKILL="${SCV_SKILL:?set SCV_SKILL to the author's skills/sweety-statechart-video directory}"
HERE="$(cd "$(dirname "$0")" && pwd)"
export STATECHART_USER_VOICES="$HERE/catalog.json"
export SCV_PYTHON="${SCV_PYTHON:-$HOME/.local/share/sweety-statechart-video/venv/bin/python}"

"$SCV_PYTHON" "$SKILL/scripts/scv.py" check "$JOB"
"$SCV_PYTHON" "$SKILL/scripts/scv.py" layout "$JOB"
"$SCV_PYTHON" "$SKILL/scripts/scv.py" lint "$JOB"
"$SCV_PYTHON" "$SKILL/scripts/scv.py" lines "$JOB"
"$SCV_PYTHON" "$HERE/bridge.py" "$JOB" --live
"$SCV_PYTHON" "$SKILL/scripts/scv.py" plan "$JOB"
"$SCV_PYTHON" "$SKILL/scripts/scv.py" render "$JOB"
"$SCV_PYTHON" "$SKILL/scripts/scv.py" posters "$JOB"
"$SCV_PYTHON" "$SKILL/scripts/scv.py" finalize "$JOB"


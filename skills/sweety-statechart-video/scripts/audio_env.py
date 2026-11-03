"""Local audio toolchain for sweety-statechart-video: where things live, and running a script under the right Python.

Paths follow the sister project's layout (sweety-handdraw-video 3.0.0, commit 63154e4, scripts/voice_backends.py),
trimmed to what this skill uses. Nothing here installs or downloads anything. Every path can be overridden:

  STATECHART_MLX_PYTHON     Python with mlx-audio + mlx_whisper   (default ~/.local/share/voxcpm2-mlx/.venv/bin/python3)
  STATECHART_RENDER_PYTHON  Python with numpy + scipy             (default ~/.local/share/sweety-handdraw-video/venv/bin/python)
  STATECHART_VOICE_CATALOG  personal voice catalog json           (default ~/.local/share/sweety-handdraw-video/voices/catalog.json)
                            searched after the skill's own voices (assets/voices/catalog.json)
  STATECHART_VOXCPM_MODEL   VoxCPM2 MLX model dir                 (default: the voice's verified model_path, else ~/.local/share/voxcpm2-mlx/models/VoxCPM2-8bit)
  STATECHART_ASR_MODEL      Whisper MLX model dir                 (default: HF cache mlx-community/whisper-large-v3-turbo)
"""
import importlib.util
import json
import os
from pathlib import Path
import sys

HOME = Path.home()
SKILL_CATALOG = Path(__file__).resolve().parent.parent / 'assets' / 'voices' / 'catalog.json'
USER_CATALOG = Path(os.environ.get('STATECHART_USER_VOICES', HOME / '.local/share/sweety-statechart-video/voices/catalog.json')).expanduser()
DEFAULT_VOICE = 'crayon-sister'
LOCAL_VOXCPM = HOME / '.local/share/voxcpm2-mlx/models/VoxCPM2-8bit'   # default install place (a symlink is fine)
MLX_PYTHON = Path(os.environ.get('STATECHART_MLX_PYTHON', HOME / '.local/share/voxcpm2-mlx/.venv/bin/python3')).expanduser()
RENDER_PYTHON = Path(os.environ.get('STATECHART_RENDER_PYTHON', HOME / '.local/share/sweety-handdraw-video/venv/bin/python')).expanduser()
VOICE_CATALOG = Path(os.environ.get('STATECHART_VOICE_CATALOG', HOME / '.local/share/sweety-handdraw-video/voices/catalog.json')).expanduser()
HF_HUB = Path(os.environ.get('HF_HUB_CACHE', HOME / '.cache/huggingface/hub')).expanduser()
WHISPER_REPO = 'mlx-community/whisper-large-v3-turbo'
MIN_WHISPER_BYTES = 100 * 1024 * 1024   # a wiped cache can leave the snapshot folder with a dangling or tiny weights file

# Offline everywhere: no model may be fetched implicitly by a library.
os.environ.setdefault('HF_HUB_OFFLINE', '1')
os.environ.setdefault('TRANSFORMERS_OFFLINE', '1')
os.environ.setdefault('TRANSFORMERS_VERBOSITY', 'error')  # mlx-audio's model load prints a harmless type warning


def require(*modules, prefer=None):
    """Re-run this script under a Python that has `modules` (the current one, then `prefer`, then the render and
    MLX Pythons). Call before importing any of them. Exits with a clear message when none has them."""
    if all(importlib.util.find_spec(module) for module in modules):
        return
    candidates = [path for path in (prefer, RENDER_PYTHON, MLX_PYTHON) if path]
    for python in candidates:
        python = Path(python)
        if python.is_file() and Path(sys.executable).resolve() != python.resolve() and not os.environ.get('STATECHART_REEXEC'):
            os.environ['STATECHART_REEXEC'] = '1'
            os.execv(str(python), [str(python), os.path.abspath(sys.argv[0]), *sys.argv[1:]])
    raise SystemExit(f"{Path(sys.argv[0]).name}: needs Python modules {', '.join(modules)}; none of "
                     f"{[sys.executable] + [str(p) for p in candidates]} has them. Run scripts/audio_doctor.py.")


def whisper_model():
    """(path or None, problem or None) for the local Whisper turbo model."""
    configured = os.environ.get('STATECHART_ASR_MODEL')
    if configured:
        folder = Path(configured).expanduser()
    else:
        snapshots = sorted((HF_HUB / ('models--' + WHISPER_REPO.replace('/', '--')) / 'snapshots').glob('*/'))
        if not snapshots:
            return None, f'Whisper model {WHISPER_REPO} is not in the HF cache ({HF_HUB}); it has been wiped before'
        folder = snapshots[-1]
    weights = folder / 'weights.safetensors'
    if not (folder / 'config.json').is_file() or not weights.is_file():
        return None, f'Whisper model folder {folder} lacks config.json or weights.safetensors (dangling cache?)'
    if weights.stat().st_size < MIN_WHISPER_BYTES:
        return None, f'Whisper weights {weights} are only {weights.stat().st_size} bytes (truncated cache?)'
    return folder, None


def catalogs():
    """(catalog path, catalog) pairs: the skill's own designed voices, then voices you added (add_voice.py), then the
    sweety-handdraw-video personal library."""
    found = []
    for path in (SKILL_CATALOG, USER_CATALOG, VOICE_CATALOG):
        if path.is_file():
            found.append((path, json.loads(path.read_text())))
    if not found:
        raise SystemExit(f'No voice catalog: {SKILL_CATALOG}, {USER_CATALOG} or {VOICE_CATALOG}')
    return found


def voice_ids():
    return [voice['id'] for _, catalog in catalogs() for voice in catalog.get('voices', [])]


def voice_profile(voice_id):
    """The catalog entry for a voice, with reference paths made absolute (relative to its own catalog)."""
    for path, catalog in catalogs():
        profile = next((dict(voice) for voice in catalog.get('voices', []) if voice['id'] == voice_id), None)
        if profile is None:
            continue
        for field in ('reference_audio', 'reference_text'):
            if profile.get(field):
                value = Path(profile[field]).expanduser()
                profile[field] = str(value if value.is_absolute() else (path.parent / value).resolve())
        return profile
    raise SystemExit(f"Unknown voice {voice_id!r}; known: {', '.join(voice_ids())}")


def voxcpm_model(profile):
    configured = os.environ.get('STATECHART_VOXCPM_MODEL') or (profile.get('verified_generation_parameters') or {}).get('model_path')
    return Path(configured).expanduser() if configured else LOCAL_VOXCPM

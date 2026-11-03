#!/usr/bin/env python3
"""Check the local audio toolchain: MLX Python (mlx-audio, mlx_whisper), VoxCPM2 model, voice reference, Whisper
model, and a Python with numpy/scipy for music and mix. Never installs or downloads anything.

  audio_doctor.py [--voice realistic-man] [--json]

Exit code 0 when everything voice.py, music.py and mix.py need is present, 1 otherwise. Paths come from audio_env.py
(override with the STATECHART_* environment variables listed there).
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import audio_env

IMPORT_CHECK = 'import importlib.util as u, json, sys; print(json.dumps({m: bool(u.find_spec(m)) for m in sys.argv[1:]}))'


def modules_in(python, modules):
    if not Path(python).is_file():
        return None
    try:
        result = subprocess.run([str(python), '-c', IMPORT_CHECK, *modules], capture_output=True, text=True, timeout=60)
        return json.loads(result.stdout.strip().splitlines()[-1])
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        return None


def check(voice_id):
    items = []

    def add(name, ok, detail, essential=True):
        items.append({'check': name, 'ok': bool(ok), 'essential': essential, 'detail': detail})

    mlx = modules_in(audio_env.MLX_PYTHON, ['mlx', 'mlx_audio', 'mlx_whisper', 'numpy', 'scipy', 'pypinyin', 'opencc'])
    add('mlx_python', mlx is not None, str(audio_env.MLX_PYTHON) if mlx is not None else f'not found / not runnable: {audio_env.MLX_PYTHON}')
    if mlx is not None:
        for module in ('mlx_audio', 'mlx_whisper', 'numpy', 'scipy'):
            add(f'mlx_python:{module}', mlx[module], 'importable' if mlx[module] else 'missing in the MLX Python')
        add('mlx_python:pypinyin', mlx['pypinyin'], 'homophone fallback for the CER check' if mlx['pypinyin'] else 'missing: CER check without the pinyin homophone fallback', essential=False)
        add('mlx_python:opencc', mlx['opencc'], 'traditional -> simplified for Whisper output' if mlx['opencc'] else 'missing: Whisper may answer in traditional characters', essential=False)
    render = modules_in(audio_env.RENDER_PYTHON, ['numpy', 'scipy'])
    add('render_python', render is not None and all(render.values()), f'{audio_env.RENDER_PYTHON} (numpy/scipy for music.py, mix.py)'
        if render and all(render.values()) else f'missing or lacks numpy/scipy: {audio_env.RENDER_PYTHON} (the MLX Python can run music/mix instead)', essential=False)

    try:
        profile = audio_env.voice_profile(voice_id)
    except SystemExit as error:
        add('voice_catalog', False, str(error))
        profile = None
    if profile:
        add('voice_catalog', True, f'{audio_env.VOICE_CATALOG}: {voice_id} ({profile.get("name", "")})')
        model = audio_env.voxcpm_model(profile)
        model_ok = bool(model) and (model / 'config.json').is_file() and (model / 'model.safetensors').is_file()
        add('voxcpm_model', model_ok, str(model) if model_ok else f'not installed (config.json + model.safetensors): {model}')
        audio, text = Path(profile.get('reference_audio') or ''), Path(profile.get('reference_text') or '')
        present = audio.is_file() and text.is_file()
        detail = f'{audio}' if present else f'missing: {audio if not audio.is_file() else text}'
        ok = present
        if present and profile.get('reference_sha256'):
            ok = hashlib.sha256(audio.read_bytes()).hexdigest() == profile['reference_sha256']
            detail += ' (sha256 matches the catalog)' if ok else ' (sha256 DIFFERS from the catalog: reference changed after import)'
        if present and profile.get('transcript_sha256') and hashlib.sha256(text.read_text().strip().encode()).hexdigest() != profile['transcript_sha256']:
            ok, detail = False, detail + '; transcript sha256 differs from the catalog'
        add('voice_reference', ok, detail)
        params = profile.get('verified_generation_parameters') or {}
        add('voice_parameters', bool(params), json.dumps({k: params.get(k) for k in ('mode', 'cfg_value', 'timesteps', 'seed')}) if params
            else 'no verified_generation_parameters; voice.py falls back to cfg 2.0 / 10 steps / seed 2026', essential=False)
    whisper, problem = audio_env.whisper_model()
    add('whisper_model', whisper is not None, f'{whisper} ({(whisper / "weights.safetensors").stat().st_size / 1e9:.2f} GB)' if whisper
        else f'MISSING: {problem}. voice.py refuses to run without it unless --no-asr is given (takes then unchecked).')
    essential_ok = all(item['ok'] for item in items if item['essential'])
    return {'ok': essential_ok, 'voice': voice_id, 'checks': items}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--voice', default=audio_env.DEFAULT_VOICE)
    parser.add_argument('--json', action='store_true', help='print the report as JSON only')
    arguments = parser.parse_args()
    report = check(arguments.voice)
    if arguments.json:
        print(json.dumps(report, ensure_ascii=False, indent=1))
    else:
        for item in report['checks']:
            mark = 'OK  ' if item['ok'] else ('FAIL' if item['essential'] else 'warn')
            print(f"{mark} {item['check']:<22} {item['detail']}")
        print('READY' if report['ok'] else 'NOT READY: fix the FAIL lines above')
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
"""Add your own voice (or one you are authorised to use) as a narrator for statechart films.

  add_voice.py ID --audio FILE --text "逐字稿" --consent self|authorized [--name 名字] [--start S --end E] [--preview] [--force]

- FILE: any audio or video file ffmpeg can read (wav, m4a, mp3, mp4, mov ...). Use --start/--end to cut 8-15 seconds
  of clean solo speech that ends at the end of a sentence.
- --text: exactly what is said in that cut, word for word (the clone follows it; a wrong transcript is the most common
  cause of mumbled starts and odd endings).
- --consent: self (your own voice) or authorized (you have the speaker's permission). Never add public figures,
  streamers or platform voices.

Checks, in order: length (5-30 s, 8-15 s recommended), noise/hum/clipping/pause depth (audio_gate, short-clip mode),
and Whisper against the transcript (CER <= 0.15). A clip that fails is refused with the reason; --force skips the
gate (not the ASR check). The voice is written to ~/.local/share/sweety-statechart-video/voices/<ID>/ and registered
in that folder's catalog.json, which scv.py searches after the skill's own four voices. --preview also clones it on a
fixed line (previews/<ID>.wav) so you can listen before using it in a film ("voice": "<ID>").
"""
import audio_env
audio_env.require('mlx_audio', 'mlx_whisper', 'numpy', 'scipy', prefer=audio_env.MLX_PYTHON)

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile

import numpy as np
from audio_gate import measure, speech_span
from asr import Whisper, covers, spoken_syllables
from meter import SR, read_wav, write_wav

PREVIEW = '付了钱，商家叮的一声接了单。厨房开了火，面已经下锅了。'
SAFE_ID = re.compile(r'^[a-z0-9][a-z0-9-]{1,40}$')


def load_audio(path, start=None, end=None):
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / 'cut.wav'
        cmd = ['ffmpeg', '-v', 'error', '-y']
        if start is not None:
            cmd += ['-ss', str(start)]
        cmd += ['-i', str(path)]
        if end is not None:
            cmd += ['-t', str(end - (start or 0))]
        cmd += ['-ac', '1', '-ar', str(SR), '-c:a', 'pcm_s24le', str(out)]
        subprocess.run(cmd, check=True)
        return read_wav(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('id', help='lowercase letters, digits and hyphens, e.g. my-voice')
    ap.add_argument('--audio', type=Path, required=True)
    ap.add_argument('--text', required=True)
    ap.add_argument('--consent', choices=('self', 'authorized'), required=True)
    ap.add_argument('--name')
    ap.add_argument('--start', type=float)
    ap.add_argument('--end', type=float)
    ap.add_argument('--preview', action='store_true')
    ap.add_argument('--force', action='store_true', help='keep a clip that fails the noise gate (ASR must still pass)')
    a = ap.parse_args()
    if not SAFE_ID.match(a.id):
        raise SystemExit('ID: use 2-41 lowercase letters, digits and hyphens, starting with a letter or digit')
    if a.id in {v['id'] for _, cat in audio_env.catalogs() if _ == audio_env.SKILL_CATALOG for v in cat.get('voices', [])}:
        raise SystemExit(f'{a.id} is one of the built-in voices; pick another ID')
    if not a.audio.is_file():
        raise SystemExit(f'no such file: {a.audio}')

    raw = load_audio(a.audio, a.start, a.end)
    s0, s1 = speech_span(raw)
    clip = raw[max(0, round((s0 - .1) * SR)):round((s1 + .5) * SR)]
    seconds = len(clip) / SR
    print(f'clip: {seconds:.1f} s of speech')
    if not 5 <= seconds <= 30:
        raise SystemExit(f'the clip is {seconds:.1f} s; cut 8-15 s of solo speech with --start/--end')
    if not 8 <= seconds <= 15:
        print('note: 8-15 s works best')
    peak = float(np.abs(clip).max())
    if peak > 0:
        clip = clip * (10 ** (-3 / 20) / peak)       # peak -3 dBFS, as the built-in references
    gate = measure(clip, short_clip=True)
    if gate['failures'] and not a.force:
        raise SystemExit('the clip fails the noise gate: ' + '; '.join(gate['failures'])
                         + '\nCut a cleaner part (no music, no echo, no other voices), or rerun with --force to keep it anyway.')
    whisper_dir, problem = audio_env.whisper_model()
    if problem:
        raise SystemExit(f'ASR unavailable: {problem}')
    heard = Whisper(whisper_dir, 'zh').transcribe(clip)
    cov = covers(a.text, heard['text'])
    print(f"ASR heard: {heard['text']}  (CER {cov['cer']})")
    if cov['status'] != 'pass':
        raise SystemExit('the transcript does not match what is said (CER above 0.15). Fix --text so it is word for word, or cut a different part.')

    root = audio_env.USER_CATALOG.parent
    folder = root / a.id
    folder.mkdir(parents=True, exist_ok=True)
    ref, txt = folder / 'reference.wav', folder / 'transcript.txt'
    write_wav(ref, clip)
    txt.write_text(a.text.strip() + '\n')
    rate = round(spoken_syllables(a.text) / max(.5, s1 - s0), 2)
    entry = {
        'id': a.id, 'name': a.name or a.id, 'description': 'Your own voice' if a.consent == 'self' else 'An authorised voice',
        'consent': a.consent, 'reference_kind': 'source_recording',
        'reference_audio': f'{a.id}/reference.wav', 'reference_text': f'{a.id}/transcript.txt',
        'reference_sha256': hashlib.sha256(ref.read_bytes()).hexdigest(),
        'transcript_sha256': hashlib.sha256(a.text.strip().encode()).hexdigest(),
        'source': str(a.audio.name) + (f' {a.start}-{a.end} s' if a.start is not None else ''),
        'gate': {k: gate.get(k) for k in ('pause_depth_db', 'peak_dbfs', 'tonal_lines_hz_persistence', 'clipped_fraction')},
        'asr': {'heard': heard['text'], 'cer': cov['cer']},
        'chars_per_second': rate,
        'verified_generation_parameters': {'mode': 'combined', 'cfg_value': 2.0, 'timesteps': 10, 'seed': 2026},
        'redistribution': 'personal; do not bundle or publish the reference',
    }
    cat_path = audio_env.USER_CATALOG
    cat = json.loads(cat_path.read_text()) if cat_path.is_file() else {'about': 'Voices added with add_voice.py', 'voices': []}
    cat['voices'] = [v for v in cat['voices'] if v['id'] != a.id] + [entry]
    cat_path.write_text(json.dumps(cat, ensure_ascii=False, indent=1) + '\n')
    print(f'added voice {a.id} -> {cat_path}')

    if a.preview:
        import voice as V
        engine = V.Engine(audio_env.voice_profile(a.id), {})
        audio, _ = engine.synthesize(PREVIEW, 2026)
        st, en = speech_span(audio)
        out = root / 'previews' / f'{a.id}.wav'
        write_wav(out, audio[max(0, round((st - .06) * SR)):round((en + .3) * SR)])
        print(f'preview: {out}')
    print(f'use it with  "voice": "{a.id}"  in film.json')


if __name__ == '__main__':
    sys.exit(main())

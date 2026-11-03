#!/usr/bin/env python3
"""Design this skill's own voices with VoxCPM2 Voice Design, lock each as a reference clip, write the catalog.

  design_voice.py [--only id1,id2] [--out DIR] [--pick id=seed]

Reads assets/voices/designs.json. For every voice:
  1. voice the reference line in design mode (instruct = the text description) once per design seed;
  2. trim, gate (noise, hum, clipping, pause depth), check speech rate and ASR coverage (voice.check_take);
  3. keep the passing take with the lowest CER, then the deepest pauses (or the seed given by --pick);
  4. copy it to assets/voices/<id>.wav with <id>.txt (the exact reference line);
  5. clone it in Hi-Fi mode (reference + transcript) for the same-text preview, assets/voices/previews/<id>.wav.
Every candidate stays under --out (default output/voices/) with report.json, for listening.
assets/voices/catalog.json is rewritten with the voices done so far (format read by audio_env.voice_profile).

This follows sweety-handdraw-video's synthetic voices (references/voxcpm2.md there): description only, several seeds,
the cleanest take becomes the fixed reference, every later line is cloned from it. Run under the MLX Python; the script
re-executes itself there when needed.
"""
import audio_env
audio_env.require('mlx_audio', 'mlx_whisper', 'numpy', 'scipy', prefer=audio_env.MLX_PYTHON)

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import time
import numpy as np

from audio_gate import speech_span
from asr import Whisper
from meter import SR, write_wav, to_rate
import voice as V

SKILL = Path(__file__).resolve().parent.parent
VOICES = SKILL / 'assets' / 'voices'


def f0_median(x, rate=SR):
    """Median pitch (Hz) of voiced 40 ms frames, by normalised autocorrelation; enough to tell a man from a girl."""
    hop, size = int(.02 * rate), int(.04 * rate)
    lo, hi = int(rate / 400), int(rate / 60)
    level = np.sqrt(np.mean(x ** 2)) + 1e-9
    found = []
    for start in range(0, len(x) - size - hi, hop):
        frame = x[start:start + size + hi]
        if np.sqrt(np.mean(frame[:size] ** 2)) < level * .6:
            continue
        a = frame[:size] - frame[:size].mean()
        best, lag = 0., 0
        for k in range(lo, hi, 2):
            b = frame[k:k + size] - frame[k:k + size].mean()
            c = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
            if c > best:
                best, lag = c, k
        if best > .75 and lag:
            found.append(rate / lag)
    return round(float(np.median(found)), 1) if found else None


class Designer:
    def __init__(self, model_path):
        from mlx_audio.tts.utils import load
        started = time.time()
        self.model = load(str(model_path))
        V.log(f'VoxCPM2 loaded in {time.time() - started:.1f}s')

    def say(self, text, seed, cfg, steps, instruct=None, reference=None, transcript=None):
        import mlx.core as mx
        kwargs = {'text': text, 'inference_timesteps': steps, 'cfg_value': cfg, 'max_tokens': len(text) * 6 + 10}
        if instruct:
            kwargs['instruct'] = instruct
        if reference:
            kwargs.update(ref_audio=str(reference), prompt_audio=str(reference), prompt_text=transcript)
        mx.random.seed(seed)
        result = list(self.model.generate(**kwargs))
        samples = np.concatenate([np.asarray(chunk.audio) for chunk in result]).astype(np.float32)
        out = to_rate(samples, result[0].sample_rate)
        mx.clear_cache()
        return out


def trimmed(raw):
    start, end = speech_span(raw)
    return raw[max(0, round((start - V.LEAD_SECONDS) * SR)):round((end + V.RAW_TAIL_SECONDS) * SR)]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--only', help='comma-separated voice ids')
    parser.add_argument('--out', type=Path, default=SKILL.parent.parent / 'output' / 'voices')
    parser.add_argument('--pick', action='append', default=[], help='id=seed: use this design seed instead of the automatic choice (no regeneration when its candidate exists)')
    args = parser.parse_args()
    designs = json.loads((VOICES / 'designs.json').read_text())
    only = {item.strip() for item in (args.only or '').split(',') if item.strip()}
    picks = dict(item.split('=') for item in args.pick)
    model_path = audio_env.voxcpm_model({})
    if not model_path or not (model_path / 'config.json').is_file():
        raise SystemExit(f'VoxCPM2 model not found ({model_path}); set STATECHART_VOXCPM_MODEL')
    whisper_dir, problem = audio_env.whisper_model()
    if problem:
        raise SystemExit(f'ASR unavailable: {problem}')
    whisper = Whisper(whisper_dir, 'zh')
    designer = Designer(model_path)
    reference_text, preview_text = designs['reference_text'], designs['preview_text']
    d, n = designs['design'], designs['narration']
    catalog_path = VOICES / 'catalog.json'
    catalog = json.loads(catalog_path.read_text()) if catalog_path.is_file() else {'voices': []}
    done = {v['id']: v for v in catalog.get('voices', [])}

    for spec in designs['voices']:
        vid = spec['id']
        if only and vid not in only:
            continue
        folder = args.out / vid
        folder.mkdir(parents=True, exist_ok=True)
        report_path = folder / 'report.json'
        report = json.loads(report_path.read_text()) if report_path.is_file() else {'candidates': {}}
        for seed in d['seeds']:
            key = str(seed)
            wav = folder / f'seed{seed}.wav'
            if key in report['candidates'] and wav.is_file():
                continue
            started = time.time()
            raw = designer.say(reference_text, seed, d['cfg_value'], d['timesteps'], instruct=spec['design_prompt'])
            try:
                audio = trimmed(raw)
            except ValueError:
                report['candidates'][key] = {'status': 'FAIL', 'failures': ['no speech']}
                continue
            kept, check = V.check_take(audio, reference_text, whisper, [])
            take = kept if kept is not None else audio
            write_wav(wav, take)
            entry = {key2: value for key2, value in check.items() if key2 != 'words'}
            entry.update(seconds=round(len(take) / SR, 2), f0_median_hz=f0_median(take), synth_seconds=round(time.time() - started, 1))
            report['candidates'][key] = entry
            V.log(f"[{vid}] seed {seed}: {entry['status']} cer {entry.get('cer')} pause {entry['gate'].get('pause_depth_db')} dB "
                  f"f0 {entry['f0_median_hz']} Hz {entry['seconds']}s" + ('' if entry['status'] == 'PASS' else ' - ' + '; '.join(entry['failures'])))
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=1))
        passing = [(int(k), c) for k, c in report['candidates'].items() if c.get('status') == 'PASS']
        if vid in picks:
            chosen = int(picks[vid])
        elif passing:
            chosen = min(passing, key=lambda kc: (round(kc[1].get('cer', 1.), 2), kc[1]['gate'].get('pause_depth_db') or 0))[0]
        else:
            V.log(f'[{vid}] no passing take; listen to {folder} and rerun with --pick {vid}=SEED')
            continue
        report['chosen_seed'] = chosen
        reference = VOICES / f'{vid}.wav'
        transcript = VOICES / f'{vid}.txt'
        shutil.copyfile(folder / f'seed{chosen}.wav', reference)
        transcript.write_text(reference_text + '\n')
        preview = designer.say(preview_text, n['seed'], n['cfg_value'], n['timesteps'], reference=reference, transcript=reference_text)
        preview = trimmed(preview)
        kept, check = V.check_take(preview, preview_text, whisper, [])
        (VOICES / 'previews').mkdir(exist_ok=True)
        write_wav(VOICES / 'previews' / f'{vid}.wav', kept if kept is not None else preview)
        report['preview'] = {key2: value for key2, value in check.items() if key2 != 'words'}
        report['preview']['f0_median_hz'] = f0_median(kept if kept is not None else preview)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=1))
        V.log(f"[{vid}] chosen seed {chosen}; preview {check['status']} cer {check.get('cer')}")
        done[vid] = {
            'id': vid, 'name': spec['name'], 'description': spec['description'],
            'reference_audio': f'{vid}.wav', 'reference_text': f'{vid}.txt',
            'reference_sha256': sha(reference), 'transcript_sha256': hashlib.sha256(reference_text.encode()).hexdigest(),
            'preview_audio': f'previews/{vid}.wav', 'preview_text': preview_text, 'preview_kind': 'same_text',
            'source': 'Synthetic VoxCPM2 voice design from a text description only; no real person, creator or platform voice was cloned or used as reference',
            'design_prompt': spec['design_prompt'],
            'generation': {'model': 'VoxCPM2-8bit MLX (mlx-audio 0.5.8)', 'mode': 'design', 'cfg_value': d['cfg_value'],
                           'timesteps': d['timesteps'], 'seed': chosen, 'seeds_tried': d['seeds'],
                           'reference_check': {k: report['candidates'][str(chosen)].get(k) for k in ('cer', 'gate', 'syllables_per_second', 'f0_median_hz', 'seconds')}},
            'verified_generation_parameters': dict(n),
            'preferred_engine': 'voxcpm',
            'redistribution': 'Distributable: generated with Apache-2.0 VoxCPM2 weights; label as AI-generated when published',
            'acceptance': 'pending_listening',
        }
        order = [v['id'] for v in designs['voices']]
        catalog = {'default': designs['default'],
                   'about': 'Voices designed for sweety-statechart-video (scripts/design_voice.py, assets/voices/designs.json).',
                   'voices': [done[i] for i in order if i in done]}
        catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + '\n')
    print(json.dumps({v['id']: v['generation']['reference_check'] for v in catalog['voices']}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()

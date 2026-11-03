#!/usr/bin/env python3
"""Final audio mix for a statechart video: JOB/work/audio/mix.wav (48 kHz stereo, 24-bit) + mix-report.json.

  mix.py JOB

Reads JOB/work/timeline.json (written by the engine):
  {"duration": sec, "lines": [{"id": "c1s01", "at": sec}],
   "music": {"mood": "warm", "gain_db": -2, "seed": 0} or null,
   "sfx": [{"kind": "pop|paper|tick|chime", "at": sec, "gain_db": 0}]}
and the line clips from voice.py (work/audio/voice.json + lines/<id>.wav).

- Narration: every line is levelled to the same loudness (-17 LUFS mono, gain clamped to +-9 dB) and placed at `at`.
- Music: work/audio/music.wav from music.py; re-rendered automatically when it is missing or its mood / seed /
  duration differ from the timeline. The un-ducked bed sits about 6 LU under the voice (plus gain_db) and ducks 13 dB
  under narration (0.25 s before a line to 0.35 s after it, gaps under 0.9 s stay ducked; smoothed with 0.12 s
  attack / 0.45 s release), so speech sits about 19 dB over the music.
- Sfx: small soft procedural sounds synthesized here (no samples), ducked 6 dB under narration.
- Master: -14 LUFS integrated (BS.1770-4), look-ahead true-peak limiter at -1 dBTP.

The report gives the measured loudness, true peak, voice-over-music per line, limiter depth and clipping, and FAILs
when a target is missed. Meter and limiter: meter.py / audio_gate.py; the ducking scheme follows the bio film mixer
(sweety-handdraw-video output/bio/lauren-tan-20261101/work/mix.py, alongside handdraw 3.0.0, commit 63154e4).
"""
import audio_env
audio_env.require('numpy', 'scipy')

import argparse
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
from scipy import signal

from audio_gate import loudness_lufs
from meter import SR, read_wav, write_wav, limit, true_peak_db, db, raised_cosine_fades

TARGET_LUFS = -14.
CEILING_DBTP = -1.
VOICE_LUFS = -17.          # per line, mono (dual mono in the mix measures -14)
MAX_LINE_GAIN_DB = 9.
MUSIC_BED_LUFS = -16.      # music_synth.TARGET_LUFS
MUSIC_BASE_DB = -4.        # un-ducked bed at -20 LUFS + gain_db, about 6 LU under the voice
DUCK_DB = -13.
DUCK_PRE, DUCK_POST, DUCK_MERGE_GAP = .25, .35, .9
DUCK_ATTACK, DUCK_RELEASE = .12, .45
SFX_DUCK_DB = -6.
MIN_VOICE_OVER_MUSIC_DB = 6.     # FAIL below (handdraw's layered-mix margin)
WARN_VOICE_OVER_MUSIC_DB = 10.
SFX_PEAK_DBFS = {'pop': -21., 'paper': -25., 'tick': -27., 'chime': -23.}
TAU = 2 * np.pi


# ------------------------------------------------------------------------------------------- procedural sfx

def _seeded(*parts):
    return np.random.default_rng(int.from_bytes(hashlib.sha256('|'.join(map(str, parts)).encode()).digest()[:8], 'little'))


def _band(x, low, high, order=2):
    return signal.sosfilt(signal.butter(order, (low, high), 'bandpass', fs=SR, output='sos'), x)


def _pan(mono, position):
    angle = (np.clip(position, -1, 1) + 1) * np.pi / 4
    return np.stack([mono * np.cos(angle), mono * np.sin(angle)], axis=1) * np.sqrt(2)


def sfx_pop(rng):
    """Soft bubble pop: a sine whose pitch drops fast, a whisper of click on top."""
    t = np.arange(int(.14 * SR)) / SR
    pitch = rng.uniform(.9, 1.12)
    f = pitch * (480 + 950 * np.exp(-t / .011))
    body = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / .038)
    click = .12 * _band(rng.standard_normal(len(t)), 2000, 6000) * np.exp(-t / .003)
    x = (body + click) * (1 - np.exp(-t / .0008))
    return _pan(signal.sosfilt(signal.butter(2, 6000, 'lowpass', fs=SR, output='sos'), x), rng.uniform(-.2, .2))


def sfx_paper(rng):
    """Paper swish: band-passed noise swelling and fading, with a light crinkle of tiny grains."""
    n = int(.38 * SR)
    t = np.arange(n) / SR
    swell = np.sin(np.pi * np.clip(t / .34, 0, 1)) ** 2
    swish = _band(rng.standard_normal(n), 1100, 6500) * swell
    grains = np.zeros(n)
    for at in np.sort(rng.uniform(0, .3, int(rng.integers(14, 22)))):
        i = int(at * SR)
        length = min(n - i, int(.006 * SR))
        grains[i:i + length] += rng.uniform(.4, 1.) * np.exp(-np.arange(length) / (.0012 * SR))
    crinkle = _band(rng.standard_normal(n) * grains, 2500, 8000)
    x = .7 * swish / (np.abs(swish).max() + 1e-9) + .45 * crinkle / (np.abs(crinkle).max() + 1e-9) * swell
    left, right = x, .6 * x + .8 * _band(rng.standard_normal(n), 1100, 6500) * swell * .15
    return np.stack([left, right], axis=1) * np.sqrt(2) * .7


def sfx_tick(rng):
    """Small clock tick (the bio film's tick, softer)."""
    t = np.arange(int(.07 * SR)) / SR
    x = np.sin(TAU * rng.uniform(2500, 2900) * t) * np.exp(-t / .006)
    x += .5 * _band(rng.standard_normal(len(t)), 2000, 6000) * np.exp(-t / .0025)
    x *= 1 - np.exp(-t / .0003)
    return _pan(x, rng.uniform(-.15, .15))


def sfx_chime(rng):
    """Two soft bell notes (C6 then G6, 80 ms apart): modal partials, the high ones dying first."""
    n = int(1.8 * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for k, (hz, delay, side) in enumerate(((1046.5, 0., -.15), (1568., .08, .15))):
        tt = np.clip(t - delay, 0, None)
        on = t >= delay
        tone = np.zeros(n)
        for ratio, decay, level in ((1., 1.1, 1.), (2.0, .55, .35), (2.76, .35, .22), (5.4, .15, .08)):
            tone += level * np.sin(TAU * hz * ratio * tt + rng.uniform(0, TAU)) * np.exp(-tt / decay)
        tone *= on * (1 - np.exp(-tt / .002)) * (1. if k == 0 else .8)
        out += _pan(tone, side)
    return out


SFX = {'pop': sfx_pop, 'paper': sfx_paper, 'tick': sfx_tick, 'chime': sfx_chime}


def render_sfx(kind, index, at, gain_db=0.):
    if kind not in SFX:
        raise SystemExit(f"timeline sfx kind {kind!r}: choose one of {', '.join(SFX)}")
    x = SFX[kind](_seeded('sfx-1', kind, index, round(at * 1000)))
    x = raised_cosine_fades(x, 0., .008)
    return x * (10 ** ((SFX_PEAK_DBFS[kind] + gain_db) / 20) / (np.abs(x).max() + 1e-12))


# ------------------------------------------------------------------------------------------- ducking

def duck_envelope(spans, duration, depth_db, frames):
    """Gain per sample: depth_db inside the (merged, padded) spans, 0 dB elsewhere, smoothed attack/release."""
    merged = []
    for start, end in sorted(spans):
        start, end = start - DUCK_PRE, end + DUCK_POST
        if merged and start - merged[-1][1] < DUCK_MERGE_GAP:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    grid = np.arange(0, duration + .002, .001)
    target = np.zeros_like(grid)
    for start, end in merged:
        target[(grid >= start) & (grid <= end)] = depth_db
    attack, release = 1 - np.exp(-.001 / DUCK_ATTACK), 1 - np.exp(-.001 / DUCK_RELEASE)
    smooth, level = np.empty_like(target), 0.
    for i, value in enumerate(target):
        level += (value - level) * (attack if value < level else release)
        smooth[i] = level
    return np.interp(np.arange(frames) / SR, grid, 10 ** (smooth / 20)), merged


# ------------------------------------------------------------------------------------------- mix

def energy_db(x):
    return 10 * np.log10(np.mean(np.square(x)) + 1e-20) if len(x) else -200.


def ensure_music(job, music, duration, warnings):
    """music.wav matching the timeline's mood, seed and duration (re-rendered when not)."""
    folder = job / 'work' / 'audio'
    record_path, path = folder / 'music.json', folder / 'music.wav'
    mood, seed = music.get('mood'), int(music.get('seed', 0))
    record = json.loads(record_path.read_text()) if record_path.is_file() else {}
    fresh = path.is_file() and record.get('mood') == mood and record.get('seed') == seed and abs(float(record.get('duration', -1)) - duration) <= .05
    if path.is_file() and record.get('sha256') and fresh:
        fresh = hashlib.sha256(path.read_bytes()).hexdigest() == record['sha256']
    if not fresh:
        from music import render_bed
        reason = 'missing' if not path.is_file() else f"was {record.get('mood')}/seed {record.get('seed')}/{record.get('duration')}s"
        warnings.append(f'music.wav re-rendered for {mood}/seed {seed}/{duration:.2f}s ({reason})')
        print(f'music.wav {reason}: rendering {mood} for {duration:.2f}s ...', file=sys.stderr, flush=True)
        record = render_bed(job, mood, duration, seed)
    bed = read_wav(path)
    return (bed if bed.ndim == 2 else np.stack([bed, bed], 1)), record


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('job', type=Path)
    arguments = parser.parse_args()
    job = arguments.job.resolve()
    audio_dir = job / 'work' / 'audio'
    timeline_path, voice_path = job / 'work' / 'timeline.json', audio_dir / 'voice.json'
    if not timeline_path.is_file():
        raise SystemExit(f'No {timeline_path}: the engine writes it')
    if not voice_path.is_file():
        raise SystemExit(f'No {voice_path}: run voice.py first')
    timeline, voice = json.loads(timeline_path.read_text()), json.loads(voice_path.read_text())
    duration = float(timeline['duration'])
    if not np.isfinite(duration) or duration <= 0:
        raise SystemExit('timeline.json duration must be a positive number of seconds')
    frames = round(duration * SR)
    warnings, failures = [], []

    # narration
    narration = np.zeros(frames)
    placed, spans, inputs_clipped = [], [], []
    for item in timeline.get('lines') or []:
        identifier, at = item['id'], float(item['at'])
        entry, path = (voice.get('lines') or {}).get(identifier), audio_dir / 'lines' / f'{identifier}.wav'
        if entry is None or not path.is_file():
            why = 'failed in voice.py' if identifier in (voice.get('failed') or {}) else 'not in voice.json'
            raise SystemExit(f'timeline line {identifier}: no usable clip ({why})')
        if at < 0:
            raise SystemExit(f'timeline line {identifier}: at must be >= 0')
        clip = read_wav(path)
        clip = clip if clip.ndim == 1 else clip.mean(axis=1)
        if np.abs(clip).max() >= .999:
            inputs_clipped.append(identifier)
        measured = loudness_lufs(clip)
        gain_db = float(np.clip(VOICE_LUFS - measured, -MAX_LINE_GAIN_DB, MAX_LINE_GAIN_DB)) if np.isfinite(measured) else 0.
        clip = clip * 10 ** (gain_db / 20)
        start = round(at * SR)
        end = start + len(clip)
        if start >= frames:
            warnings.append(f'line {identifier} starts at {at:.2f}s, after the end ({duration:.2f}s): dropped')
            continue
        if end > frames:
            warnings.append(f'line {identifier} runs {(end - frames) / SR:.2f}s past the end: truncated with a fade')
            clip = raised_cosine_fades(clip[:frames - start], 0., .05)
            end = frames
        narration[start:end] += clip
        spans.append((at, end / SR, identifier))
        placed.append({'id': identifier, 'at': round(at, 3), 'end': round(end / SR, 3), 'dur': round(len(clip) / SR, 3),
                       'lufs_in': measured, 'gain_db': round(gain_db, 2)})
    ordered = sorted(spans)
    overlaps = [f'{a[2]} ({a[0]:.2f}-{a[1]:.2f}s) overlaps {b[2]} (from {b[0]:.2f}s)' for a, b in zip(ordered, ordered[1:]) if b[0] < a[1] - .001]
    if overlaps:
        warnings.append('overlapping lines: ' + '; '.join(overlaps))
    voice_stereo = np.stack([narration, narration], 1)
    speech = [(start, end) for start, end, _ in spans]

    # music
    music_report, music_track = None, np.zeros((frames, 2))
    if timeline.get('music'):
        music = timeline['music']
        bed, record = ensure_music(job, music, duration, warnings)
        bed = bed[:frames] if len(bed) >= frames else np.vstack([bed, np.zeros((frames - len(bed), 2))])
        gain_db = MUSIC_BASE_DB + float(music.get('gain_db', 0.))
        envelope, ducked_spans = duck_envelope(speech, duration, DUCK_DB, frames)
        music_track = bed * (10 ** (gain_db / 20) * envelope)[:, None]
        music_report = {'mood': music.get('mood'), 'seed': int(music.get('seed', 0)), 'gain_db': float(music.get('gain_db', 0.)),
                        'bed_lufs': record.get('loudness_lufs'), 'applied_gain_db': round(gain_db, 2), 'duck_db': DUCK_DB,
                        'duck_attack_s': DUCK_ATTACK, 'duck_release_s': DUCK_RELEASE, 'ducked_spans': [[round(a, 3), round(b, 3)] for a, b in ducked_spans],
                        'file': record.get('file')}

    # sfx
    sfx_track, sfx_report = np.zeros((frames, 2)), []
    for index, item in enumerate(timeline.get('sfx') or []):
        kind, at = item['kind'], float(item['at'])
        sound = render_sfx(kind, index, at, float(item.get('gain_db', 0.)))
        start = round(at * SR)
        if not 0 <= start < frames:
            warnings.append(f'sfx {kind} at {at:.2f}s is outside the timeline: dropped')
            continue
        count = min(len(sound), frames - start)
        sfx_track[start:start + count] += sound[:count]
        sfx_report.append({'kind': kind, 'at': round(at, 3), 'peak_dbfs': round(SFX_PEAK_DBFS[kind] + float(item.get('gain_db', 0.)), 1)})
    if sfx_report and speech:
        sfx_track *= duck_envelope(speech, duration, SFX_DUCK_DB, frames)[0][:, None]

    # master: normalize, limit, re-measure (the limiter lowers loudness a little; a second pass corrects it)
    mix = voice_stereo + music_track + sfx_track
    pre_lufs = loudness_lufs(mix)
    if not np.isfinite(pre_lufs):
        raise SystemExit('The mix is silent')
    gain_db, reduction = TARGET_LUFS - pre_lufs, 0.
    for _ in range(3):
        out, reduction = limit(mix * 10 ** (gain_db / 20), CEILING_DBTP)
        measured = loudness_lufs(out)
        if abs(measured - TARGET_LUFS) <= .1:
            break
        gain_db += TARGET_LUFS - measured
    write_wav(audio_dir / 'mix.wav', out, 24)

    # measure what was written
    final = read_wav(audio_dir / 'mix.wav')
    lufs, peak = loudness_lufs(final), true_peak_db(final)
    clipped = int(np.sum(np.abs(final) >= .999))
    per_line = {}
    for start, end, identifier in spans:
        a, b = round(start * SR), round(end * SR)
        voice_db = energy_db(narration[a:b])
        per_line[identifier] = round(voice_db - energy_db(music_track[a:b].mean(axis=1)), 1) if music_report else None
    margins = [value for value in per_line.values() if value is not None]
    gaps = np.ones(frames, bool)
    for start, end in speech:
        gaps[round(start * SR):round(end * SR)] = False
    if abs(lufs - TARGET_LUFS) > .5:
        failures.append(f'integrated loudness {lufs} LUFS misses {TARGET_LUFS}')
    if peak > CEILING_DBTP + .05:
        failures.append(f'true peak {peak} dBTP over {CEILING_DBTP}')
    if clipped:
        failures.append(f'{clipped} clipped samples in mix.wav')
    if margins and min(margins) < MIN_VOICE_OVER_MUSIC_DB:
        failures.append(f'music masks the voice: only {min(margins)} dB under a line')
    elif margins and min(margins) < WARN_VOICE_OVER_MUSIC_DB:
        warnings.append(f'voice only {min(margins)} dB over the music on some line')
    if reduction < -4:
        warnings.append(f'limiter reduced up to {-reduction} dB: check plosives / sfx peaks')
    report = {'status': 'FAIL' if failures else 'PASS', 'failures': failures, 'warnings': warnings,
              'file': str(audio_dir / 'mix.wav'), 'sample_rate': SR, 'channels': 2, 'bits': 24, 'duration': round(len(final) / SR, 3),
              'lufs': lufs, 'true_peak_dbtp': peak, 'target': {'lufs': TARGET_LUFS, 'true_peak_dbtp': CEILING_DBTP},
              'voice_over_music_db': {'min': min(margins) if margins else None, 'median': float(np.median(margins)) if margins else None,
                                      'per_line': per_line, 'method': 'narration vs ducked music energy over each line clip'},
              'music_in_gaps_vs_voice_db': round(energy_db(music_track[gaps].mean(axis=1)) - energy_db(narration[~gaps]), 1) if music_report and gaps.any() and (~gaps).any() else None,
              'clipping': {'clipped_samples': clipped, 'input_lines_at_full_scale': inputs_clipped},
              'limiter_max_reduction_db': reduction, 'master_gain_db': round(gain_db, 2), 'pre_master_lufs': pre_lufs,
              'narration': {'lines': placed, 'line_target_lufs_mono': VOICE_LUFS, 'overlaps': overlaps},
              'music': music_report, 'sfx': sfx_report, 'subjective_listening': 'not_performed'}
    (audio_dir / 'mix-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(json.dumps({key: report[key] for key in ('status', 'lufs', 'true_peak_dbtp', 'voice_over_music_db', 'limiter_max_reduction_db',
                                                    'clipping', 'failures', 'warnings')}, ensure_ascii=False, indent=1))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())

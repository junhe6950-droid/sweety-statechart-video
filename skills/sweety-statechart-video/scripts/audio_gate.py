#!/usr/bin/env python3
"""Objective narration gate: stationary tones, pause depth, DC offset and clipping (plus BS.1770 loudness).

Ported from sweety-handdraw-video 3.0.0 (commit 63154e4), scripts/audio_gate.py, with speech activity from
scripts/align.py. Kept: the tone/hum detector with its voice-pitch exemption, pause depth, DC, clipping and the
integrated-loudness meter. Dropped: ffmpeg decoding and the layered-mix gate (mix.py reports its own numbers).

FAIL when a narrow line (30-4000 Hz) stands >= 8 dB above its +-25 Hz neighbourhood in >= 50% (and at least 2) of
the 2-second windows (hum, drone, sustained note), when the quietest frames are less than 25 dB below the speech p95
level (pauses never become quiet: noise), or when DC offset / clipping exceed the limits below. A single generated
line is short dense speech, so it uses the quietest 2% of 20 ms frames (short_clip=True). Signals never replace
listening.
"""
import argparse
import json
from pathlib import Path
import sys
import numpy as np
from scipy import signal
from scipy.ndimage import median_filter

SAMPLE_RATE = 48000
TONE_BAND_HZ = (30, 4000)
TONE_EXCESS_DB = 8.
TONE_PERSISTENCE = .5
TONE_WINDOW_SECONDS = 2.
TONE_MIN_WINDOWS = 2  # one 2 s window of a held vowel shows harmonic lines; hum repeats in every window
MAX_PAUSE_DEPTH_DB = -25.
PAUSE_PERCENTILE = 5
SHORT_CLIP_PAUSE_PERCENTILE = 2
MAX_DC_OFFSET = .005
CLIP_LEVEL = .999
MAX_CLIPPED_FRACTION = 1e-4


def activity(samples, rate=SAMPLE_RATE):
    """Speech frames (20 ms, 10 ms hop) by a level relative to the clip's own p95/p10 (align.activity)."""
    hop, width = round(.01 * rate), round(.02 * rate)
    samples = np.asarray(samples, dtype=np.float64)
    if len(samples) < width:
        return np.zeros(0, dtype=bool)
    count = 1 + (len(samples) - width) // hop
    energy = np.concatenate([[0.], np.cumsum(samples * samples)])
    starts = hop * np.arange(count)
    levels = 20 * np.log10(np.sqrt(np.maximum(energy[starts + width] - energy[starts], 0.) / width) + 1e-9)
    threshold = max(np.percentile(levels, 95) - 35, np.percentile(levels, 10) + 6)
    return levels > threshold


def speech_span(samples, rate=SAMPLE_RATE):
    active = np.flatnonzero(activity(samples, rate))
    if not len(active):
        raise ValueError('No speech found')
    return active[0] * .01, active[-1] * .01 + .02


def tonal_lines(x):
    size = int(TONE_WINDOW_SECONDS * SAMPLE_RATE)
    rows = []
    for start in range(0, len(x) - size + 1, size):
        window = x[start:start + size]
        if np.sqrt(np.mean(window ** 2)) < 1e-5:
            continue  # digital silence
        frequencies, power = signal.welch(window, SAMPLE_RATE, nperseg=size // 2)
        level = 10 * np.log10(power + 1e-24)
        rows.append(level - median_filter(level, size=51, mode='nearest'))
    if not rows:
        return []
    band = (frequencies >= TONE_BAND_HZ[0]) & (frequencies <= TONE_BAND_HZ[1])
    hits = (np.array(rows)[:, band] > TONE_EXCESS_DB).sum(axis=0)
    persistence = hits / len(rows)
    lines = []
    excess = np.median(np.asarray(rows)[:, band], axis=0)
    for index in np.lexsort((frequencies[band], -excess, -persistence)):
        if persistence[index] < TONE_PERSISTENCE:
            break
        if hits[index] < TONE_MIN_WINDOWS:
            continue
        if all(abs(frequencies[band][index] - hz) > 4 for hz, _ in lines):
            lines.append((float(frequencies[band][index]), round(float(persistence[index]), 2)))
    return lines[:5]


VOICE_PAUSE_DROP_DB = 25.   # a line this much quieter in the pauses than in speech is the voice's own pitch, not hum
DEEP_PAUSE_FRAMES = 8        # 10 ms frames: a pause frame this far from speech holds no ringing of the voice
MIN_PAUSE_FRAMES = 10        # deep pause frames needed to judge by the pauses; fewer, and the pitch decides
PITCH_TOLERANCE = .1
PITCH_SHARE = .25


def pitch_peaks(x):
    """The strongest peak between 70 and 400 Hz of each voiced 40 ms frame (the pitch, or one of its harmonics)."""
    active = activity(x, SAMPLE_RATE)
    hop, width = round(.01 * SAMPLE_RATE), round(.04 * SAMPLE_RATE)
    frequencies = np.fft.rfftfreq(8192, 1 / SAMPLE_RATE)
    band = (frequencies >= 70) & (frequencies <= 400)
    found = []
    for frame in np.flatnonzero(active)[::4]:
        window = x[frame * hop:frame * hop + width]
        if len(window) == width:
            found.append(frequencies[band][np.argmax(np.abs(np.fft.rfft(window * np.hanning(width), 8192))[band])])
    return np.array(found)


def voice_lines(x, lines):
    """Split stationary lines into hum and the voice's own pitch. A male voice reading an even list holds its pitch near
    120 Hz for seconds (handdraw v3: seven of eight takes failed as "hum"). Hum stays in the pauses; the voice's pitch is
    gone there. A clip without such pauses is judged by pitch: a line on the speaker's pitch or a harmonic is the voice."""
    if not lines:
        return [], []
    from scipy import ndimage
    active = activity(x, SAMPLE_RATE)
    if not active.any():
        return lines, []
    hop = round(.01 * SAMPLE_RATE)
    first, last = np.flatnonzero(active)[[0, -1]]
    deep = ~ndimage.binary_dilation(active, iterations=DEEP_PAUSE_FRAMES)
    deep[:first] = deep[last:] = False
    pauses, speech = np.flatnonzero(deep), np.flatnonzero(active)
    peaks = pitch_peaks(x) if len(pauses) < MIN_PAUSE_FRAMES else None
    hum, voice = [], []
    for hz, persistence in lines:
        if len(pauses) >= MIN_PAUSE_FRAMES:
            low, high = max(1., hz - 8), min(SAMPLE_RATE / 2 - 1, hz + 8)
            narrow = signal.sosfiltfilt(signal.butter(2, [low, high], btype='band', fs=SAMPLE_RATE, output='sos'), x)
            level = lambda frames: 20 * np.log10(np.sqrt(np.mean(np.concatenate([narrow[i * hop:(i + 1) * hop] for i in frames]) ** 2)) + 1e-12)
            is_voice = level(speech) - level(pauses) >= VOICE_PAUSE_DROP_DB
        else:
            on_line = [any(abs(peak - k * hz) <= PITCH_TOLERANCE * k * hz for k in (1, 2, 3)) for peak in peaks]
            is_voice = bool(on_line) and float(np.mean(on_line)) >= PITCH_SHARE
        (voice if is_voice else hum).append((hz, persistence))
    return hum, voice


def frame_levels(x, frame=.02, hop=.01):
    width, step = round(frame * SAMPLE_RATE), round(hop * SAMPLE_RATE)
    if len(x) < width:
        return np.zeros(0)
    count = 1 + (len(x) - width) // step
    return np.sqrt(np.mean(x[np.arange(width)[None] + step * np.arange(count)[:, None]] ** 2, axis=1))


def pause_depth(x, percentile=PAUSE_PERCENTILE):
    levels = frame_levels(x)
    levels = 20 * np.log10(levels[levels > 1e-6])
    return float(np.percentile(levels, percentile) - np.percentile(levels, 95)) if len(levels) else 0.


def measure(samples, label=None, short_clip=False):
    """Gate a mono 48 kHz float signal. Returns a report with 'status' PASS/FAIL and 'failures'."""
    x = np.asarray(samples, dtype=np.float64).reshape(-1)
    if not len(x) or not np.isfinite(x).all() or not np.any(x):
        return {'source': label, 'status': 'FAIL', 'failures': ['empty, silent or non-finite audio']}
    clipped = float(np.mean(np.abs(x) >= CLIP_LEVEL))
    hum, voice = voice_lines(x, tonal_lines(x))
    percentile = SHORT_CLIP_PAUSE_PERCENTILE if short_clip else PAUSE_PERCENTILE
    report = {'source': label, 'duration_seconds': round(len(x) / SAMPLE_RATE, 3),
              'tonal_lines_hz_persistence': hum, **({'voice_pitch_lines': voice} if voice else {}),
              'pause_percentile': percentile, 'pause_depth_db': round(pause_depth(x, percentile), 1),
              'dc_offset': round(float(np.mean(x)), 5), 'peak_dbfs': round(float(20 * np.log10(np.abs(x).max())), 2),
              'clipped_fraction': clipped}
    failures = []
    if hum:
        failures.append('stationary tone/hum line at ' + ', '.join(f'{hz:.0f} Hz' for hz, _ in hum))
    if report['pause_depth_db'] > MAX_PAUSE_DEPTH_DB:
        failures.append(f"pauses not quiet ({report['pause_depth_db']} dB > {MAX_PAUSE_DEPTH_DB} dB): noise")
    if abs(report['dc_offset']) > MAX_DC_OFFSET:
        failures.append(f"DC offset {report['dc_offset']}")
    if clipped > MAX_CLIPPED_FRACTION:
        failures.append(f'clipping in {clipped:.2%} of samples')
    return {**report, 'status': 'FAIL' if failures else 'PASS', 'failures': failures}


# ITU-R BS.1770 K-weighting at 48 kHz (pre-filter shelf, then RLB high-pass).
K_SHELF = ([1.53512485958697, -2.69169618940638, 1.19839281085285], [1., -1.69065929318241, .73248077421585])
K_HIGHPASS = ([1., -2., 1.], [1., -1.99004745483398, .99007225036621])


def loudness_lufs(samples, rate=SAMPLE_RATE):
    """Integrated loudness (BS.1770-4: K-weighting, 400 ms blocks, -70 LUFS absolute and -10 LU relative gates).
    Mono input counts once; stereo sums both channels, so dual-mono measures 3 LU louder than its mono source."""
    if rate != SAMPLE_RATE:
        raise ValueError('loudness_lufs uses the 48 kHz K-weighting coefficients')
    x = np.asarray(samples)
    x = x[:, None] if x.ndim == 1 else x
    block, hop = round(.4 * rate), round(.1 * rate)
    if len(x) < block:
        return float('-inf')
    energy = np.zeros(len(x) + 1)
    for channel in range(x.shape[1]):
        weighted = signal.lfilter(*K_HIGHPASS, signal.lfilter(*K_SHELF, x[:, channel].astype(np.float64)))
        energy[1:] += np.cumsum(weighted ** 2)
    starts = np.arange(0, len(x) - block + 1, hop)
    power = (energy[starts + block] - energy[starts]) / block
    level = -.691 + 10 * np.log10(power + 1e-30)
    power = power[level > -70]
    if not len(power):
        return float('-inf')
    relative = -.691 + 10 * np.log10(power.mean()) - 10
    power = power[-.691 + 10 * np.log10(power) > relative]
    return round(float(-.691 + 10 * np.log10(power.mean())), 2)


if __name__ == '__main__':
    from meter import read_wav
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('files', nargs='+', type=Path, help='48 kHz wav files (first channel is gated)')
    parser.add_argument('--short-clip', action='store_true', help='single generated line: quietest 2%% pause statistic')
    arguments = parser.parse_args()
    results = []
    for path in arguments.files:
        audio = read_wav(path)
        results.append(measure(audio if audio.ndim == 1 else audio[:, 0], str(path), arguments.short_clip))
        print(json.dumps(results[-1], ensure_ascii=False))
    sys.exit(0 if all(result['status'] == 'PASS' for result in results) else 1)

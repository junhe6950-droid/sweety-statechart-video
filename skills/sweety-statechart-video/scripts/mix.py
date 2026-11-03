#!/usr/bin/env python3
"""Final audio mix for a statechart video: JOB/work/audio/mix.wav (48 kHz stereo, 24-bit) + mix-report.json.

  mix.py JOB

Reads JOB/work/timeline.json (written by the engine):
  {"duration": sec, "lines": [{"id": "c1s01", "at": sec}],
   "music": {"mood": "warm", "gain_db": -2, "seed": 0} or null,
   "sfx": [{"kind": "pop|paper|...", "at": sec, "gain_db": 0}],
   "ambience": [{"kind": "rain|fire|street|room", "from": sec, "to": sec, "gain_db": 0}]}
and the line clips from voice.py (work/audio/voice.json + lines/<id>.wav). scv.py plan writes sfx and ambience from the
film's `sfx` / state `sfx` / step `sfx` / state `ambience` fields (scripts/audio_plan.py).

- Narration: every line is levelled to the same loudness (-17 LUFS mono, gain clamped to +-9 dB) and placed at `at`.
- Music: work/audio/music.wav from music.py; re-rendered automatically when it is missing or its mood / seed /
  duration differ from the timeline. The un-ducked bed sits about 6 LU under the voice (plus gain_db) and ducks 13 dB
  under narration (0.25 s before a line to 0.35 s after it, gaps under 0.9 s stay ducked; smoothed with 0.12 s
  attack / 0.45 s release), so speech sits about 19 dB over the music.
- Sfx: small soft procedural sounds synthesized here (no samples), ducked 6 dB under narration: pop, paper, tick,
  chime, steam, kettle, fire, knock, creak, bell, ding, typing, coins, stamp, whoosh. Same kind + index + time, same sound.
- Ambience: procedural loops rendered for each span (rain, fire, street, room) at a fixed loudness under the voice,
  faded in and out, ducked 6 dB under narration.
- Master: -14 LUFS integrated (BS.1770-4), look-ahead true-peak limiter at -1 dBTP.

The report gives the measured loudness, true peak, voice-over-music and voice-over-bed (music + ambience + sfx) per
line, limiter depth and clipping, and FAILs when a target is missed. Meter and limiter: meter.py / audio_gate.py; the ducking scheme follows the bio film mixer
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
import audio_plan
import music_synth
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
SFX_PEAK_DBFS = {'pop': -21., 'paper': -25., 'tick': -27., 'chime': -23., 'steam': -28., 'kettle': -26., 'fire': -25.,
                 'knock': -20., 'creak': -27., 'bell': -25., 'ding': -24., 'typing': -26., 'coins': -26., 'stamp': -19.,
                 'whoosh': -26.}
AMBIENCE_LUFS = {'rain': -30., 'fire': -31., 'street': -32., 'room': -38.}   # un-ducked, before the master (voice -14)
AMBIENCE_DUCK_DB = -6.
AMBIENCE_FADE = (.6, .9)         # audio_plan.AMBIENCE_FADE
SYNC_WARN_MS = 60.               # music "sync": a target further than this from its downbeat is reported as a warning
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


def _t(seconds):
    return np.arange(int(seconds * SR)) / SR


def _low(x, hz, order=2):
    return signal.sosfilt(signal.butter(order, hz, 'lowpass', fs=SR, output='sos'), x)


def _high(x, hz, order=2):
    return signal.sosfilt(signal.butter(order, hz, 'highpass', fs=SR, output='sos'), x)


def _pink(rng, n):
    """Pink noise (Kellet's filter), unit peak."""
    x = signal.lfilter([.049922035, -.095993537, .050612699, -.004408786], [1, -2.494956002, 2.017265875, -.5221894],
                       rng.standard_normal(n))
    return x / (np.abs(x).max() + 1e-12)


def _grain(rng, length, low, high, decay):
    """A short band-limited noise burst: a crackle, a key click, a raindrop."""
    t = np.arange(int(length * SR)) / SR
    return _band(rng.standard_normal(len(t)), low, high) * np.exp(-t / decay) * (1 - np.exp(-t / .0004))


def _scatter(rng, n, rate, kernels, amplitude=(.2, 1.)):
    """Mono track of n samples: the grains in `kernels` struck at Poisson times (`rate` per second in all) with random
    amplitudes (grains are made once, so a dense patter stays cheap)."""
    count = int(rng.poisson(rate * n / SR))
    at = np.sort(rng.integers(0, n, count))
    which = rng.integers(0, len(kernels), count)
    levels = rng.uniform(*amplitude, count)
    out = np.zeros(n)
    for i, k, level in zip(at, which, levels):
        m = min(len(kernels[k]), n - i)
        out[i:i + m] += level * kernels[k][:m]
    return out


def _ring(rng, hz, partials, length, strike=.002):
    """Struck metal: inharmonic partials (ratio, decay seconds, level), the high ones dying first."""
    t = _t(length)
    x = sum(level * np.sin(TAU * hz * ratio * t + rng.uniform(0, TAU)) * np.exp(-t / decay) for ratio, decay, level in partials)
    return x * (1 - np.exp(-t / strike))


def sfx_steam(rng):
    """Steam: breathy hiss swelling for a second and a half, a little flutter in it."""
    t = _t(1.8)
    swell = np.clip(t / 1.3, 0, 1) ** 1.6 * np.clip((1.8 - t) / .35, 0, 1)
    flutter = 1 + .25 * np.sin(TAU * rng.uniform(5, 8) * t) * swell
    x = _band(rng.standard_normal(len(t)), 2500, 9000) * swell * flutter + .4 * _band(rng.standard_normal(len(t)), 900, 2500) * swell
    return _pan(x, rng.uniform(-.25, .25))


def sfx_kettle(rng):
    """Kettle coming to the boil: steam hiss, then the whistle rising into its note (with breath and a wobble)."""
    hiss = sfx_steam(rng)[:, 0] / np.sqrt(2)
    t = _t(3.)
    out = np.zeros(len(t))
    out[:len(hiss)] += .6 * hiss
    on = np.clip((t - 1.) / .5, 0, 1) * np.clip((3. - t) / .4, 0, 1)
    hz = 1750 + 280 * np.clip((t - 1.) / .9, 0, 1) + 14 * np.sin(TAU * 5.5 * t)
    phase = TAU * np.cumsum(hz) / SR
    whistle = (np.sin(phase) + .18 * np.sin(2 * phase)) * on
    breath = _band(rng.standard_normal(len(t)), 1500, 2600) * on * .35
    out += .55 * whistle + breath
    return _pan(out, rng.uniform(-.2, .2))


def sfx_fire(rng):
    """A match struck and a flame catching: a soft whoomph and a dozen crackles."""
    t = _t(1.4)
    whoomph = _low(rng.standard_normal(len(t)), 500) * np.exp(-t / .25) * (1 - np.exp(-t / .02))
    crackle = _scatter(rng, len(t), 12, [_grain(rng, .03, 1500, 7000, rng.uniform(.002, .006)) for _ in range(4)], (.3, 1.))
    x = .9 * whoomph / (np.abs(whoomph).max() + 1e-9) + crackle / (np.abs(crackle).max() + 1e-9) * .8
    return _pan(x, rng.uniform(-.2, .2))


def sfx_knock(rng):
    """Three knocks on a wooden door: a hollow thump and a knuckle click each, the last a touch softer."""
    out = np.zeros(int(.75 * SR))
    for k, at in enumerate((0., .21 + rng.uniform(-.01, .01), .42 + rng.uniform(-.015, .015))):
        t = _t(.16)
        body = sum(level * np.sin(TAU * hz * rng.uniform(.97, 1.03) * t) * np.exp(-t / decay)
                   for hz, decay, level in ((165, .045, 1.), (410, .025, .55), (960, .012, .25)))
        click = .5 * _band(rng.standard_normal(len(t)), 1500, 5000) * np.exp(-t / .002)
        hit = (body + click) * (1 - np.exp(-t / .0006)) * (1., .92, .8)[k]
        i = int(at * SR)
        out[i:i + len(hit)] += hit[:len(out) - i]
    return _pan(out, rng.uniform(-.3, .3))


def sfx_creak(rng):
    """A door creaking open: stick-slip friction, a pulse train whose pitch wanders upward, through a wooden body."""
    t = _t(1.1)
    hz = 95 + 140 * np.clip(t / .9, 0, 1) ** .8 + 18 * np.sin(TAU * rng.uniform(2, 3.5) * t)
    hz *= 1 + .06 * _low(rng.standard_normal(len(t)), 12) / .05
    phase = np.cumsum(np.maximum(hz, 40)) / SR
    pulses = np.exp(-((phase % 1) * 9))                       # one sharp slip per cycle
    x = _band(pulses - pulses.mean(), 300, 2400, order=2) + .4 * _band(pulses, 1800, 3200)
    x *= np.clip(t / .08, 0, 1) * np.clip((1.1 - t) / .25, 0, 1)
    return _pan(x, rng.uniform(-.3, .3))


def sfx_bell(rng):
    """A bicycle bell: two quick rings of a small steel dome."""
    partials = ((1., .55, 1.), (1.53, .4, .45), (2.41, .25, .3), (3.62, .12, .15))
    hz = rng.uniform(2850, 3050)
    out = np.zeros(int(1.2 * SR))
    for at, level in ((0., 1.), (.13, .85)):
        ring = _ring(rng, hz, partials, 1.0) * level
        i = int(at * SR)
        out[i:i + len(ring)] += ring[:len(out) - i]
    return _pan(out, rng.uniform(-.2, .2))


def sfx_ding(rng):
    """A phone notification: one clean bell-like note with a soft octave."""
    t = _t(.9)
    hz = 1318.5
    x = (np.sin(TAU * hz * t) + .3 * np.sin(TAU * 2 * hz * t) * np.exp(-t / .12)) * np.exp(-t / .3) * (1 - np.exp(-t / .004))
    return _pan(x, 0.)


def sfx_typing(rng):
    """A short run of typing: a dozen key clicks at an uneven pace, each a click and a little plastic thock."""
    out = np.zeros(int(1.6 * SR))
    at = .02
    while at < 1.45:
        t = _t(.05)
        click = _band(rng.standard_normal(len(t)), 2000, 7000) * np.exp(-t / .0025)
        thock = np.sin(TAU * rng.uniform(220, 320) * t) * np.exp(-t / .012) * .5
        hit = (click + thock) * rng.uniform(.55, 1.) * (1 - np.exp(-t / .0003))
        i = int(at * SR)
        out[i:i + len(hit)] += hit[:len(out) - i]
        at += rng.uniform(.07, .17) + (rng.uniform(.15, .3) if rng.random() < .12 else 0)
    return _pan(out, rng.uniform(-.2, .2))


def sfx_coins(rng):
    """A few coins dropped on a counter: bright clinks crowding together, then settling."""
    out = np.zeros(int(1. * SR))
    at = 0.
    for k in range(int(rng.integers(6, 9))):
        hz = rng.uniform(3200, 5200)
        clink = _ring(rng, hz, ((1., .08, 1.), (1.41, .05, .5), (2.27, .03, .3)), .3, .0005) * rng.uniform(.5, 1.)
        i = int(at * SR)
        out[i:i + len(clink)] += clink[:len(out) - i]
        at += rng.uniform(.02, .08) * (1 + k * .25)
    return _pan(out, rng.uniform(-.2, .2))


def sfx_stamp(rng):
    """A rubber stamp landing on paper: a low thud on the desk and a paper slap."""
    t = _t(.35)
    thud = np.sin(TAU * np.cumsum(55 + 45 * np.exp(-t / .03)) / SR) * np.exp(-t / .09)
    body = .45 * np.sin(TAU * 170 * t) * np.exp(-t / .03)
    slap = .35 * _band(rng.standard_normal(len(t)), 600, 4000) * np.exp(-t / .012)
    return _pan((thud + body + slap) * (1 - np.exp(-t / .0008)), 0.)


def sfx_whoosh(rng):
    """Something swept past: noise whose band rises and falls with a swell (left to right)."""
    n = int(.8 * SR)
    t = np.arange(n) / SR
    swell = np.sin(np.pi * np.clip(t / .75, 0, 1)) ** 2
    noise = rng.standard_normal(n)
    low, mid, high = _band(noise, 250, 900), _band(noise, 900, 2600), _band(noise, 2600, 7000)
    x = (low * (1 - swell) + mid * swell + .6 * high * swell ** 2) * swell
    position = np.clip(t / .75 * 2 - 1, -1, 1) * .6
    angle = (position + 1) * np.pi / 4
    return np.stack([x * np.cos(angle), x * np.sin(angle)], axis=1) * np.sqrt(2)


SFX = {'pop': sfx_pop, 'paper': sfx_paper, 'tick': sfx_tick, 'chime': sfx_chime, 'steam': sfx_steam, 'kettle': sfx_kettle,
       'fire': sfx_fire, 'knock': sfx_knock, 'creak': sfx_creak, 'bell': sfx_bell, 'ding': sfx_ding, 'typing': sfx_typing,
       'coins': sfx_coins, 'stamp': sfx_stamp, 'whoosh': sfx_whoosh}


def render_sfx(kind, index, at, gain_db=0.):
    if kind not in SFX:
        raise SystemExit(f"timeline sfx kind {kind!r}: choose one of {', '.join(SFX)}")
    x = SFX[kind](_seeded('sfx-1', kind, index, round(at * 1000)))
    x = raised_cosine_fades(x, 0., .008)
    return x * (10 ** ((SFX_PEAK_DBFS[kind] + gain_db) / 20) / (np.abs(x).max() + 1e-12))


# ------------------------------------------------------------------------------------------- ambience (loops)

def amb_rain(rng, n):
    """Steady rain: a pink wash, a dense patter of drops, and the odd heavier drip nearer by."""
    wash = _high(_low(_pink(rng, n), 7000), 250)
    patter = _scatter(rng, n, 220, [_grain(rng, .012, 2500, 9000, .0015) for _ in range(6)])
    drips = _scatter(rng, n, 1.5, [_grain(rng, .04, 700, 2500, .008) for _ in range(3)], (.4, 1.))
    slow = 1 + .12 * _low(rng.standard_normal(n), .3) / .01
    left = (wash + .25 * patter / (np.abs(patter).max() + 1e-9) + .3 * drips / (np.abs(drips).max() + 1e-9)) * slow
    right = (np.roll(wash, int(.013 * SR)) + .25 * np.roll(patter, int(.21 * SR)) / (np.abs(patter).max() + 1e-9)) * slow
    return np.stack([left, right], axis=1)


def amb_fire(rng, n):
    """A stove or hearth: a soft roar underneath and crackles at irregular moments, some in little bursts."""
    roar = _low(_pink(rng, n), 400) * (1 + .3 * _low(rng.standard_normal(n), .8) / .03)
    crackle = _scatter(rng, n, 7, [_grain(rng, .03, 1200, 7000, rng.uniform(.0015, .005)) for _ in range(5)])
    pops = _scatter(rng, n, .5, [_grain(rng, .08, 600, 3000, .012) for _ in range(3)], (.6, 1.))
    mono = roar / (np.abs(roar).max() + 1e-9) + .5 * crackle / (np.abs(crackle).max() + 1e-9) + .45 * pops / (np.abs(pops).max() + 1e-9)
    return _pan(mono, rng.uniform(-.15, .15))


def amb_street(rng, n):
    """A street heard from inside: low traffic rumble, a car passing every few seconds, a far murmur."""
    t = np.arange(n) / SR
    rumble = _low(_pink(rng, n), 350)
    swells = np.zeros(n)
    at = rng.uniform(0, 3)
    while at < n / SR:
        width = rng.uniform(1.5, 3.)
        swells += rng.uniform(.4, 1.) * np.exp(-((t - at) / width) ** 2)
        at += rng.uniform(3., 7.)
    car = _band(_pink(rng, n), 120, 1500) * swells
    murmur = .25 * _band(_pink(rng, n), 300, 1200) * (1 + .5 * _low(rng.standard_normal(n), 1.5) / .03)
    mono = rumble / (np.abs(rumble).max() + 1e-9) + .8 * car / (np.abs(car).max() + 1e-9) + murmur / (np.abs(murmur).max() + 1e-9)
    return np.stack([mono, np.roll(mono, int(.019 * SR)) * .9 + .1 * mono], axis=1)


def amb_room(rng, n):
    """Room tone: the quiet air of a room, a soft low hush with a slow breath in it (no hum)."""
    air = _low(_high(_pink(rng, n), 60), 1800)
    breathe = 1 + .08 * np.sin(TAU * np.arange(n) / SR / rng.uniform(7, 11))
    return np.stack([air * breathe, np.roll(air, int(.011 * SR)) * breathe], axis=1)


AMBIENCE = {'rain': amb_rain, 'fire': amb_fire, 'street': amb_street, 'room': amb_room}
assert set(SFX) == set(audio_plan.SFX_KINDS) and set(AMBIENCE) == set(audio_plan.AMBIENCE_KINDS), 'audio_plan kinds drifted'
assert audio_plan.MOOD_BPM == {name: mood['bpm'] for name, mood in music_synth.MOODS.items()}, 'audio_plan.MOOD_BPM drifted'


def render_ambience(kind, index, start, end, gain_db=0.):
    """(stereo loop for [start, end), its loudness before ducking) at AMBIENCE_LUFS[kind] + gain_db, faded in and out."""
    if kind not in AMBIENCE:
        raise SystemExit(f"timeline ambience kind {kind!r}: choose one of {', '.join(AMBIENCE)}")
    n = max(1, round((end - start) * SR))
    x = AMBIENCE[kind](_seeded('amb-1', kind, index, round(start * 1000)), n)
    measured = loudness_lufs(x)
    if np.isfinite(measured):
        x = x * 10 ** ((AMBIENCE_LUFS[kind] + gain_db - measured) / 20)
    fade_in, fade_out = (min(f, (end - start) / 3) for f in AMBIENCE_FADE)
    return raised_cosine_fades(x, fade_in, fade_out), AMBIENCE_LUFS[kind] + gain_db


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
    from music import render_bed, sync_key
    mood, seed, sync = music.get('mood'), int(music.get('seed', 0)), music.get('sync')
    record = json.loads(record_path.read_text()) if record_path.is_file() else {}
    fresh = path.is_file() and record.get('mood') == mood and record.get('seed') == seed and abs(float(record.get('duration', -1)) - duration) <= .05 \
        and record.get('sync_key') == sync_key(sync)
    if path.is_file() and record.get('sha256') and fresh:
        fresh = hashlib.sha256(path.read_bytes()).hexdigest() == record['sha256']
    if not fresh:
        reason = 'missing' if not path.is_file() else f"was {record.get('mood')}/seed {record.get('seed')}/{record.get('duration')}s" + \
            (', another beat grid' if record.get('sync_key') != sync_key(sync) else '')
        warnings.append(f'music.wav re-rendered for {mood}/seed {seed}/{duration:.2f}s ({reason})')
        print(f'music.wav {reason}: rendering {mood} for {duration:.2f}s ...', file=sys.stderr, flush=True)
        record = render_bed(job, mood, duration, seed, sync=sync)
    bed = read_wav(path)
    return (bed if bed.ndim == 2 else np.stack([bed, bed], 1)), record


def sync_report(sync, record, warnings):
    """Music "sync": each target (chapter start, rule stamp) against the downbeats of the bed actually rendered (its
    music.json tempo and grid origin), in ms; positive = the picture is late."""
    if not sync:
        return None
    bar = 4 * 60. / float(record.get('bpm') or sync['bpm'])
    origin = float(record.get('origin', sync['origin']))
    stretch = record.get('stretch') or {}                  # the fermatas music_synth actually rendered
    targets = []
    for item in sync.get('targets') or []:
        downbeat, error = audio_plan.downbeat_error(float(item['t']), origin, bar, stretch)
        targets.append({**item, 'downbeat': round(downbeat, 3), 'error_ms': round(error * 1000, 1)})
    worst = max((abs(item['error_ms']) for item in targets), default=0.)
    if worst > SYNC_WARN_MS:
        late = [f"{item['what']} {item['error_ms']:+.0f} ms" for item in targets if abs(item['error_ms']) > SYNC_WARN_MS]
        warnings.append('music sync: off the downbeat: ' + ', '.join(late))
    return {'bpm': record.get('bpm'), 'mood_bpm': audio_plan.MOOD_BPM.get(record.get('mood')), 'bar_s': round(bar, 4),
            'origin': origin, 'sections': sync.get('sections'), 'accents': sync.get('accents'), 'holds_s': sync.get('holds_s'),
            'music_holds': stretch or None,
            'max_error_ms': round(worst, 1), 'mean_error_ms': round(float(np.mean([abs(i['error_ms']) for i in targets])), 1) if targets else None,
            'targets': targets}


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
                        'file': record.get('file'), 'sync': sync_report(music.get('sync'), record, warnings)}

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
        sfx_report.append({'kind': kind, 'at': round(at, 3), 'peak_dbfs': round(SFX_PEAK_DBFS[kind] + float(item.get('gain_db', 0.)), 1),
                           **({'why': item['why']} if item.get('why') else {})})
    if sfx_report and speech:
        sfx_track *= duck_envelope(speech, duration, SFX_DUCK_DB, frames)[0][:, None]

    # ambience: a loop per span (a state's rain, fire, street or room), ducked under the narration like the sfx
    ambience_track, ambience_report = np.zeros((frames, 2)), []
    for index, item in enumerate(timeline.get('ambience') or []):
        kind, start, end = item['kind'], max(0., float(item['from'])), min(duration, float(item['to']))
        if end - start < .3:
            warnings.append(f'ambience {kind} {item["from"]}-{item["to"]}s is outside the timeline or too short: dropped')
            continue
        loop, level = render_ambience(kind, index, start, end, float(item.get('gain_db', 0.)))
        a = round(start * SR)
        count = min(len(loop), frames - a)
        ambience_track[a:a + count] += loop[:count]
        ambience_report.append({'kind': kind, 'from': round(start, 3), 'to': round(end, 3), 'lufs': level, 'gain_db': float(item.get('gain_db', 0.))})
    if ambience_report and speech:
        ambience_track *= duck_envelope(speech, duration, AMBIENCE_DUCK_DB, frames)[0][:, None]

    # master: normalize, limit, re-measure (the limiter lowers loudness a little; a second pass corrects it)
    mix = voice_stereo + music_track + sfx_track + ambience_track
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
    per_line, per_line_bed = {}, {}
    bed = music_track + ambience_track + sfx_track
    for start, end, identifier in spans:
        a, b = round(start * SR), round(end * SR)
        voice_db = energy_db(narration[a:b])
        per_line[identifier] = round(voice_db - energy_db(music_track[a:b].mean(axis=1)), 1) if music_report else None
        per_line_bed[identifier] = round(voice_db - energy_db(bed[a:b].mean(axis=1)), 1) if (music_report or ambience_report or sfx_report) else None
    margins = [value for value in per_line.values() if value is not None]
    bed_margins = [value for value in per_line_bed.values() if value is not None]
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
    if bed_margins and min(bed_margins) < MIN_VOICE_OVER_MUSIC_DB and not (margins and min(margins) < MIN_VOICE_OVER_MUSIC_DB):
        worst = min(per_line_bed, key=lambda key: per_line_bed[key] if per_line_bed[key] is not None else 99)
        failures.append(f'music + ambience + sfx mask the voice: only {min(bed_margins)} dB under line {worst}')
    if reduction < -4:
        warnings.append(f'limiter reduced up to {-reduction} dB: check plosives / sfx peaks')
    report = {'status': 'FAIL' if failures else 'PASS', 'failures': failures, 'warnings': warnings,
              'file': str(audio_dir / 'mix.wav'), 'sample_rate': SR, 'channels': 2, 'bits': 24, 'duration': round(len(final) / SR, 3),
              'lufs': lufs, 'true_peak_dbtp': peak, 'target': {'lufs': TARGET_LUFS, 'true_peak_dbtp': CEILING_DBTP},
              'voice_over_music_db': {'min': min(margins) if margins else None, 'median': float(np.median(margins)) if margins else None,
                                      'per_line': per_line, 'method': 'narration vs ducked music energy over each line clip'},
              'voice_over_bed_db': {'min': min(bed_margins) if bed_margins else None, 'median': float(np.median(bed_margins)) if bed_margins else None,
                                    'per_line': per_line_bed, 'method': 'narration vs music + ambience + sfx (all ducked) over each line clip'},
              'music_in_gaps_vs_voice_db': round(energy_db(music_track[gaps].mean(axis=1)) - energy_db(narration[~gaps]), 1) if music_report and gaps.any() and (~gaps).any() else None,
              'clipping': {'clipped_samples': clipped, 'input_lines_at_full_scale': inputs_clipped},
              'limiter_max_reduction_db': reduction, 'master_gain_db': round(gain_db, 2), 'pre_master_lufs': pre_lufs,
              'narration': {'lines': placed, 'line_target_lufs_mono': VOICE_LUFS, 'overlaps': overlaps},
              'music': music_report, 'sfx': sfx_report,
              'ambience': {'spans': ambience_report, 'duck_db': AMBIENCE_DUCK_DB, 'fade_s': list(AMBIENCE_FADE),
                           'in_gaps_vs_voice_db': round(energy_db(ambience_track[gaps].mean(axis=1)) - energy_db(narration[~gaps]), 1)
                           if ambience_report and gaps.any() and (~gaps).any() else None},
              'subjective_listening': 'not_performed'}
    (audio_dir / 'mix-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(json.dumps({key: report[key] for key in ('status', 'lufs', 'true_peak_dbtp', 'voice_over_music_db', 'voice_over_bed_db', 'limiter_max_reduction_db',
                                                    'clipping', 'failures', 'warnings')}, ensure_ascii=False, indent=1))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())

"""Wav io, resampling, true-peak meter and look-ahead limiter shared by voice.py, music.py and mix.py.

true_peak_env / limit / write_wav / read_wav are ported from the sweety-handdraw-video bio film's own score tool
(output/bio/lauren-tan-20261101/work/tools/score.py, written alongside handdraw 3.0.0, commit 63154e4); the
integrated loudness meter lives in audio_gate.loudness_lufs (same BS.1770 implementation).
"""
from pathlib import Path
import math
import wave
import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import minimum_filter1d, uniform_filter1d

SR = 48000


def db(value):
    return float(20 * np.log10(max(float(value), 1e-12)))


def to_rate(samples, rate, target=SR):
    """Polyphase resample along the first axis (mono or frames x channels)."""
    samples = np.asarray(samples, dtype=np.float64)
    if int(rate) == target:
        return samples
    factor = math.gcd(int(rate), target)
    return signal.resample_poly(samples, target // factor, int(rate) // factor, axis=0)


def read_wav(path):
    """Float64 samples (mono stays 1-D, otherwise frames x channels) of a 48 kHz wav: 16/24/32-bit PCM or float."""
    rate, data = wavfile.read(str(path))
    if data.dtype == np.int16:
        x = data.astype(np.float64) / 32768
    elif data.dtype == np.int32:  # scipy returns 24-bit PCM left-justified in int32
        x = data.astype(np.float64) / 2 ** 31
    elif data.dtype == np.uint8:
        x = (data.astype(np.float64) - 128) / 128
    else:
        x = data.astype(np.float64)
    if rate != SR:
        x = to_rate(x, rate)
    return x


def write_wav(path, x, bits=24):
    """Write mono (1-D) or frames x channels float audio as 48 kHz PCM (16/24-bit) or 32-bit float; atomic rename."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.stem + '.writing' + path.suffix)
    x = np.asarray(x, np.float64)
    channels = 1 if x.ndim == 1 else x.shape[1]
    if bits == 32:
        wavfile.write(str(temporary), SR, x.astype(np.float32))
    else:
        if bits == 24:
            ints = np.rint(np.clip(x, -1, 1 - 2 ** -23) * 8388608).astype('<i4')
            data = ints.reshape(-1).view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
        else:
            data = np.rint(np.clip(x, -1, 32767 / 32768) * 32768).astype('<i2').tobytes()
        with wave.open(str(temporary), 'wb') as stream:
            stream.setparams((channels, bits // 8, SR, 0, 'NONE', 'not compressed'))
            stream.writeframes(data)
    temporary.replace(path)


def true_peak_env(x, chunk=1 << 20):
    """Per-sample peak over all channels, 4x oversampled (inter-sample peaks included)."""
    x = np.asarray(x, np.float64)
    x = x[:, None] if x.ndim == 1 else x
    n = len(x)
    out = np.zeros(n)
    for s in range(0, n, chunk):
        a, b = max(0, s - 64), min(n, s + chunk + 64)
        up = signal.resample_poly(x[a:b], 4, 1, axis=0)
        peak = np.abs(up).max(axis=1)
        peak = peak[:len(peak) // 4 * 4].reshape(-1, 4).max(axis=1)
        m = min(chunk, n - s)
        out[s:s + m] = peak[s - a:s - a + m]
    return np.maximum(out, np.abs(x).max(axis=1))


def true_peak_db(x):
    return round(db(true_peak_env(x).max()), 2) if len(x) else -120.


def limit(x, ceiling_db, look=.006):
    """Look-ahead true-peak limiter: gain = moving average of a moving minimum of ceiling/peak (never above 1).
    Returns (limited, deepest gain reduction in dB, as a negative number or 0)."""
    ceiling = 10 ** (ceiling_db / 20)
    gain = np.minimum(1., ceiling / np.maximum(true_peak_env(x), 1e-12))
    if gain.min() >= 1.:
        return x, 0.
    h = int(look * SR)
    gain = uniform_filter1d(minimum_filter1d(gain, 2 * h + 1, mode='nearest'), 2 * h + 1, mode='nearest')
    y = x * (gain[:, None] if np.ndim(x) == 2 else gain)
    tp = true_peak_env(y).max()
    if tp > ceiling:
        y = y * (ceiling / tp)
    return y, round(db(gain.min()), 2)


def raised_cosine_fades(x, fade_in=0., fade_out=0.):
    """Raised-cosine fade in/out (seconds) along the first axis; returns a copy."""
    x = np.array(x, np.float64)
    a, b = min(len(x), round(fade_in * SR)), min(len(x), round(fade_out * SR))
    shape = (slice(None),) + (None,) * (x.ndim - 1)
    if a > 1:
        x[:a] *= (.5 - .5 * np.cos(np.linspace(0, np.pi, a)))[shape]
    if b > 1:
        x[len(x) - b:] *= (.5 + .5 * np.cos(np.linspace(0, np.pi, b)))[shape]
    return x

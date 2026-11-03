#!/usr/bin/env python3
"""Narration for a statechart video: one VoxCPM2 clip per caption line, gated, ASR-checked, cached.

  voice.py JOB [--only id1,id2] [--redo id] [--probe-terms] [--no-asr]

Reads JOB/work/lines.json (written by the engine):
  {"language": "zh", "voice": "realistic-man", "say": {"写法": "读法"},
   "lines": [{"id": "c1s01", "text": "字幕文本", "say": "optional reading for this line"}]}
  - global "say": written term -> spoken form, applied to every line (Latin terms whole-word, case-insensitive;
    numbers never match inside a longer number; longest term first).
  - line "say": a string is the full reading of that line (used verbatim); an object is a per-line map applied on
    top of the global one.
  - optional "english_exceptions": {"word": "reason"} words accepted as the voice says them.
  - optional "voxcpm": {"cfg_value", "timesteps", "seed", "mode"} overrides the voice's verified parameters.
  - line "tone": VoxCPM2 controllable cloning, e.g. "惊讶" -> "(惊讶)reading". mlx-audio honours the prefix only when the
    text starts the sequence, i.e. in reference mode (the reference audio alone, no transcript continuation); in the
    default combined mode it lands after the reference transcript and is read aloud. So a toned line is cloned in
    reference mode (TONE_MODE). The control text is never part of the ASR comparison; it is part of the cache key.
  - "language": Whisper's language; Chinese / Japanese / Korean / Thai lines are compared by characters (CER 0.15,
    pinyin homophones for Chinese), languages written with spaces by words (WER 0.2, scripts/i18n.py uses_words).
VoxCPM2 does not normalise digits: a reading that still holds Arabic numerals is refused with suggested say entries.

Each line: synthesize (seed policy: the voice's verified seed, then +1, +2, +3), trim to speech (60 ms lead), gate
noise/hum/clipping (audio_gate, short-clip mode), check speech rate, ASR the take against the reading (CER <= 0.15,
ending included, pinyin homophones allowed), find where the last syllable really ends, fade, then ASR the kept audio
again (and, if the line has English words, check that an English ear hears them). The first passing seed is kept.

Writes JOB/work/audio/lines/<id>.wav (48 kHz mono 24-bit) and JOB/work/audio/voice.json:
  {"voice": ..., "lines": {"<id>": {"dur", "text", "reading", "tone", "asr", "cer", "seed", "chars": [[char, t0, t1], ...] | null,
   "env_hz": 100, "env": [0..1, ...], ...extras}}, "failed": {"<id>": {...}}}
`chars` covers every character of `text` in order (punctuation included, ''.join == text), times in seconds inside
the clip. `env` is the take's loudness every 10 ms, smoothed like a mouth (scv.py plan turns it into timing.json
`talk`). Takes are cached by content (voice + model + reading + tone + seed policy) under work/audio/cache, so renaming or
reordering line ids costs nothing; --redo ID rejects the current take and tries the next seeds.

Ported from sweety-handdraw-video 3.0.0 (commit 63154e4): scripts/voxcpm_voice.py (VoxCPM2 MLX synthesis),
scripts/narration_master.py (say maps, chunk gate + retries, tail cut, term probe), scripts/voice_studio.py
(reference handling). Run under the MLX Python; the script re-executes itself there when needed.
"""
import audio_env
audio_env.require('mlx_audio', 'mlx_whisper', 'numpy', 'scipy', prefer=audio_env.MLX_PYTHON)

import argparse
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import time
import numpy as np

from audio_gate import measure, speech_span, loudness_lufs
from asr import Whisper, covers, covers_words, char_times, english_words, spoken_syllables, LATIN_WORD, PUNCTUATION, MAX_WER
from meter import SR, read_wav, write_wav, to_rate, db
import i18n

CHECKS_VERSION = 2              # 2: a pinyin-only pass earns one more seed
ATTEMPTS = 4
SPEECH_RATE_RANGE = (3., 8.)   # syllables/s of speech span; only gross stretching or truncation (realistic-man ~6.6)
SPEECH_RATE_RANGE_WORDS = (2., 7.)  # spaced languages (vowel groups): old-master reads English at 2.1-2.9 with CER 0
LEAD_SECONDS = .06             # kept before the first speech frame
RAW_TAIL_SECONDS = .6          # kept after the last speech frame until the tail rule decides
TAIL_QUIET_DB = -40.           # the last syllable has ended once the level stays this far under the clip peak...
TAIL_QUIET_SECONDS = .03       # ...for this long
TAIL_QUIET_WORDS_SECONDS = .12 # spaced languages: longer, a stop closure inside the last word (typ-ing) is not its end
TAIL_BURST_DB = -30.           # a sound this loud after that quiet is an after-sound, dropped
TAIL_LOUD_DB = -25.            # a clip still ending this loud with no quiet after its last word was cut off
TAIL_KEEP_SECONDS = .12        # natural decay kept after the last syllable
MIN_SYLLABLE_SECONDS = .12     # a stop consonant's closure is shorter: no quiet inside this ends the last syllable
INSIDE_WORD_SECONDS = .1
FADE_OUT_SECONDS = .05
FADE_IN_SECONDS = .01
MIN_CHAR_MATCH = .5            # below this share of characters matched by ASR, `chars` is null (too unreliable)
SAFE_ID = re.compile(r'^[A-Za-z0-9_.-]+$')
DIGITS = re.compile(r'\d+(?:\.\d+)?%?')
ENV_HZ = 100                   # talk envelope: loudness 0..1 every 10 ms, for the player's talking mouths
ENV_RANGE_DB = 28.             # 0 at this far under the line's loud frames, 1 at them
ENV_ATTACK, ENV_RELEASE = .015, .07
TONE_MODE = 'reference'        # a toned line: "(tone)text" cloned from the reference audio alone (see references/voices.md)


def log(message):
    print(message, file=sys.stderr, flush=True)


def talk_env(samples, rate=SR):
    """Per-10 ms loudness 0..1 of a kept take, smoothed like a mouth (fast open, slower close), 2 decimals."""
    hop, width = round(rate / ENV_HZ), round(.02 * rate)
    x = np.asarray(samples, float)
    if len(x) < width:
        return []
    energy = np.concatenate([[0.], np.cumsum(x ** 2)])
    starts = np.arange(0, len(x) - width + 1, hop)
    level = 10 * np.log10(np.maximum((energy[starts + width] - energy[starts]) / width, 1e-12))
    top = np.percentile(level, 95)
    target = np.clip((level - (top - ENV_RANGE_DB)) / ENV_RANGE_DB, 0, 1)
    attack, release = 1 - np.exp(-1 / (ENV_HZ * ENV_ATTACK)), 1 - np.exp(-1 / (ENV_HZ * ENV_RELEASE))
    out, value = [], 0.
    for item in target:
        value += (item - value) * (attack if item > value else release)
        out.append(round(float(value), 2))
    return out


def coverage_of(language):
    """The ASR comparison for a language: characters (CER, pinyin homophones) or words (WER)."""
    return covers_words if i18n.uses_words(language) else covers


# ------------------------------------------------------------------------------------------- say maps and readings

def say_pattern(mapping):
    """Latin terms whole-word and case-insensitive; numbers never inside a longer number; longest first."""
    def term(key):
        latin = key.isascii() and any(ch.isalpha() for ch in key)
        body = f'(?i:{re.escape(key)})' if latin else re.escape(key)
        before = '(?<![A-Za-z])' if key[0].isascii() and key[0].isalpha() else '(?<![0-9.])' if key[0].isdigit() else ''
        after = '(?![A-Za-z])' if key[-1].isascii() and key[-1].isalpha() else r'(?![0-9]|\.[0-9])' if key[-1].isdigit() else ''
        return before + body + after
    return re.compile('|'.join(term(key) for key in sorted(mapping, key=len, reverse=True)))


def check_map(mapping, where):
    if not isinstance(mapping, dict) or not all(isinstance(k, str) and k.strip() and isinstance(v, str) and v.strip() for k, v in mapping.items()):
        raise SystemExit(f'{where}: say must map written terms to nonempty spoken text')
    return mapping


def reading_of(text, global_map, line_say):
    """(reading, segments): segments [(tag, t0, t1, r0, r1)] cover text and reading in order; 'equal' maps char to char."""
    if isinstance(line_say, str):
        reading = line_say.strip()
        matcher = SequenceMatcher(None, text, reading, autojunk=False)
        return reading, [(tag if tag == 'equal' else 'replace', a0, a1, b0, b1) for tag, a0, a1, b0, b1 in matcher.get_opcodes()]
    mapping = {**global_map, **(line_say or {})}
    if not mapping:
        return text, [('equal', 0, len(text), 0, len(text))]
    folded = {key.lower(): value for key, value in mapping.items()}
    parts, segments, cursor, length = [], [], 0, 0
    for match in say_pattern(mapping).finditer(text):
        if match.start() > cursor:
            piece = text[cursor:match.start()]
            segments.append(('equal', cursor, match.start(), length, length + len(piece)))
            parts.append(piece)
            length += len(piece)
        said = mapping.get(match.group(0), folded.get(match.group(0).lower(), match.group(0)))
        segments.append(('replace', match.start(), match.end(), length, length + len(said)))
        parts.append(said)
        length += len(said)
        cursor = match.end()
    if cursor < len(text):
        segments.append(('equal', cursor, len(text), length, length + len(text) - cursor))
        parts.append(text[cursor:])
    return ''.join(parts), segments


CN_DIGITS = '零一二三四五六七八九'


def int_reading(value):
    """Plain Chinese reading of a nonnegative integer below 10^12 (30 -> 三十, 2000 -> 两千, 105 -> 一百零五)."""
    if value == 0:
        return '零'

    def group(n):
        out, zero = '', False
        for power, unit in ((3, '千'), (2, '百'), (1, '十'), (0, '')):
            digit = n // 10 ** power % 10
            if digit == 0:
                zero = bool(out)
                continue
            out += ('零' if zero else '') + CN_DIGITS[digit] + unit
            zero = False
        return out
    out, pending_zero = '', False
    for size, unit in ((10 ** 8, '亿'), (10 ** 4, '万'), (1, '')):
        part = value // size % 10 ** 4 if size < 10 ** 8 else value // size
        if part:
            if out and (pending_zero or part < 1000):
                out += '零'
            out += group(part) + unit
            pending_zero = False
        elif out:
            pending_zero = True
    out = re.sub('^一十', '十', out)
    return re.sub('(^|[亿万零])二(?=[千万亿])', r'\1两', out)


def number_reading(term, after=''):
    """Suggested reading for a numeral as written (2026年 digit by digit, 3.5, 50%)."""
    percent = term.endswith('%')
    body = term.rstrip('%')
    if re.fullmatch(r'\d{4}', body) and after.startswith('年'):
        return ''.join(CN_DIGITS[int(d)] for d in body)
    whole, _, fraction = body.partition('.')
    said = (int_reading(int(whole)) if len(whole) < 13 else ''.join(CN_DIGITS[int(d)] for d in whole))
    if fraction:
        said += '点' + ''.join(CN_DIGITS[int(d)] for d in fraction)
    return '百分之' + said if percent else said


def digit_terms(reading, language='zh'):
    if i18n.uses_words(language):
        return [(match.group(0), i18n.english_number(match.group(0)) if i18n.base_language(language) == 'en' else '<the number in words>')
                for match in DIGITS.finditer(reading)]
    return [(match.group(0), number_reading(match.group(0), reading[match.end():])) for match in DIGITS.finditer(reading)]


# ------------------------------------------------------------------------------------------- the end of a take

def tail_levels(samples, rate=SR):
    """Level of 20 ms frames every 10 ms, in dB under the clip peak."""
    hop, width = round(.01 * rate), round(.02 * rate)
    if len(samples) < width:
        return np.full(1, -120.)
    peak = max(float(np.abs(samples).max()), 1e-9)
    starts = np.arange(0, len(samples) - width + 1, hop)
    energy = np.concatenate([[0.], np.cumsum(np.asarray(samples, float) ** 2)])
    rms = np.sqrt(np.maximum(energy[starts + width] - energy[starts], 0.) / width)
    return 20 * np.log10(np.maximum(rms, 1e-9) / peak)


def speech_tail(samples, words=None, rate=SR, quiet_seconds=TAIL_QUIET_SECONDS):
    """(cut seconds or None, report): the last syllable ends at the first quiet run after the last word's first
    MIN_SYLLABLE_SECONDS; an after-sound burst is dropped; None when the clip ends loud (the last word was cut off)."""
    levels = tail_levels(samples, rate)
    count, duration = len(levels), len(samples) / rate
    if words:
        last = words[-1]
        anchor = max(float(last['start']) + MIN_SYLLABLE_SECONDS, float(last.get('end', last['start'])) - .1)
    else:
        anchor = max(0., speech_span(samples, rate)[1] - .4)
    quiet = max(1, round(quiet_seconds / .01))
    first = min(count - 1, max(0, int(anchor / .01)))
    end_frame = None
    for frame in range(first, count - quiet + 1):
        if (levels[frame:frame + quiet] < TAIL_QUIET_DB).all():
            end_frame = frame
            break
    if end_frame is None:
        if levels[-3:].max() > TAIL_LOUD_DB:
            return None, {'status': 'cut_off', 'final_level_db': round(float(levels[-3:].max()), 1)}
        end_frame = first + int(np.argmin(levels[first:]))
    speech_end = end_frame * .01 + .01
    burst = next((frame for frame in range(end_frame + quiet, count) if levels[frame] > TAIL_BURST_DB), None)
    cut = speech_end + TAIL_KEEP_SECONDS
    if burst is not None:
        cut = min(cut, burst * .01 - .01)
    cut = min(max(cut, speech_end + .02), duration)
    return cut, {'status': 'artifact_dropped' if burst is not None and burst * .01 < duration else 'clean',
                 'speech_end': round(speech_end, 3), 'cut': round(cut, 3), 'dropped_seconds': round(duration - cut, 3)}


def finish_edges(samples, cut, speech_end, rate=SR):
    samples = np.array(samples[:max(1, round(cut * rate))], float)
    fade = min(max(round(FADE_OUT_SECONDS * rate), len(samples) - round(speech_end * rate)), len(samples))
    if fade > 1:
        samples[-fade:] *= .5 + .5 * np.cos(np.linspace(0, np.pi, fade))
    lead = min(round(FADE_IN_SECONDS * rate), len(samples))
    if lead > 1:
        samples[:lead] *= .5 - .5 * np.cos(np.linspace(0, np.pi, lead))
    return samples


def clips_last_word(tail, words):
    if not words or not tail or tail.get('cut') is None:
        return None
    last = words[-1]
    if float(tail['cut']) < float(last.get('end', last['start'])) - INSIDE_WORD_SECONDS:
        return f"the tail cut at {tail['cut']:.2f}s falls inside the last word {last.get('text', '')!r} ({last['start']:.2f}-{last['end']:.2f}s)"
    return None


# ------------------------------------------------------------------------------------------- per-character times

def spoken_mask(text):
    return [character not in PUNCTUATION or (character == '.' and 0 < index < len(text) - 1 and text[index - 1].isdigit()
            and text[index + 1].isdigit()) for index, character in enumerate(text)]


def caption_chars(text, reading, segments, words, duration):
    """[[char, t0, t1], ...] for every character of text, or (None, reason). Times come from the recognised words of
    the reading, carried onto the written text through the say segments (a term gets the span of its spoken form)."""
    try:
        times, matched = char_times(reading, words)
    except ValueError as error:
        return None, str(error)
    if matched < MIN_CHAR_MATCH:
        return None, f'only {matched:.0%} of characters matched the recognised words'
    reading_times, cursor = [None] * len(reading), 0
    for index, is_spoken in enumerate(spoken_mask(reading)):
        if is_spoken:
            reading_times[index] = times[cursor]
            cursor += 1
    text_times, text_spoken = [None] * len(text), spoken_mask(text)
    for tag, t0, t1, r0, r1 in segments:
        if tag == 'equal':
            for offset in range(t1 - t0):
                if text_spoken[t0 + offset]:
                    text_times[t0 + offset] = reading_times[r0 + offset]
            continue
        known = [value for value in reading_times[r0:r1] if value]
        targets = [index for index in range(t0, t1) if text_spoken[index]]
        if known and targets:
            start, end = min(v[0] for v in known), max(v[1] for v in known)
            step = (end - start) / len(targets)
            for number, index in enumerate(targets):
                text_times[index] = (start + number * step, start + (number + 1) * step)
    known = [index for index, value in enumerate(text_times) if value]
    if not known:
        return None, 'no character of the text could be timed'
    for index in range(len(text)):
        if text_times[index] is None:
            left = max((k for k in known if k < index), default=None)
            right = min((k for k in known if k > index), default=None)
            start = text_times[left][1] if left is not None else text_times[right][0]
            end = text_times[right][0] if right is not None else start
            text_times[index] = (start, max(start, end))
    chars, previous = [], 0.
    for character, (start, end) in zip(text, text_times):
        start = min(max(start, previous, 0.), duration)
        end = min(max(end, start), duration)
        chars.append([character, round(start, 3), round(end, 3)])
        previous = start
    return chars, None


# ------------------------------------------------------------------------------------------- engine

_MODELS = {}


class Engine:
    """VoxCPM2 (MLX) with the voice's reference; loaded on first use."""
    def __init__(self, profile, overrides):
        params = profile.get('verified_generation_parameters') or {}
        self.model_path = audio_env.voxcpm_model(profile)
        if not self.model_path or not (self.model_path / 'config.json').is_file():
            raise SystemExit(f'VoxCPM2 model not installed at {self.model_path}; run scripts/audio_doctor.py')
        self.mode = overrides.get('mode', params.get('mode', 'combined'))
        if self.mode not in ('combined', 'reference'):
            raise SystemExit('voxcpm mode must be combined or reference')
        self.cfg = float(overrides.get('cfg_value', params.get('cfg_value', 2.)))
        self.steps = int(overrides.get('timesteps', params.get('timesteps', 10)))
        self.seed = int(overrides.get('seed', params.get('seed', 2026)))
        self.reference = Path(profile.get('reference_audio') or '')
        transcript = Path(profile.get('reference_text') or '')
        if not self.reference.is_file() or not transcript.is_file():
            raise SystemExit(f"Voice {profile['id']}: reference audio or transcript missing ({self.reference}, {transcript})")
        reference_sha = hashlib.sha256(self.reference.read_bytes()).hexdigest()
        self.transcript = transcript.read_text().strip()
        if profile.get('reference_sha256') and reference_sha != profile['reference_sha256']:
            raise SystemExit(f'Voice reference audio changed after import: {self.reference}')
        if profile.get('transcript_sha256') and hashlib.sha256(self.transcript.encode()).hexdigest() != profile['transcript_sha256']:
            raise SystemExit(f'Voice reference transcript changed after import: {transcript}')
        enhancement = profile.get('verified_generation_parameters', {}).get('enhancement_model_path')
        self.enhancement = str(Path(enhancement).expanduser()) if enhancement else None
        self.identity = {'engine': 'voxcpm2-mlx', 'voice': profile['id'], 'model_path': str(self.model_path.resolve()),
                         'mode': self.mode, 'cfg_value': self.cfg, 'timesteps': self.steps, 'reference_sha256': reference_sha,
                         'reference_text_sha256': hashlib.sha256(self.transcript.encode()).hexdigest(), 'enhancement': self.enhancement}
        self.model = self.cleaner = None

    def load(self):
        if self.model is None:
            from mlx_audio.tts.utils import load
            started = time.time()
            key = str(self.model_path.resolve())
            if key not in _MODELS:                 # several voices in one film share one loaded model
                _MODELS[key] = load(key)
            self.model = _MODELS[key]
            if self.enhancement:
                from mlx_audio.sts.models.deepfilternet import DeepFilterNetModel
                self.cleaner = DeepFilterNetModel.from_pretrained(self.enhancement, subfolder=None)
            log(f'VoxCPM2 loaded in {time.time() - started:.1f}s ({self.model_path.name}, cfg {self.cfg}, {self.steps} steps)')

    def synthesize(self, text, seed, control=None):
        """(mono float samples at 48 kHz, synthesis seconds). `control` (a step's tone) becomes VoxCPM2's controllable
        cloning prefix "(control)text" in reference mode; see TONE_MODE."""
        import mlx.core as mx
        self.load()
        kwargs = {'text': text, 'inference_timesteps': self.steps, 'cfg_value': self.cfg, 'max_tokens': len(text) * 6 + 10,
                  'ref_audio': str(self.reference)}
        if control:
            kwargs.update(text=f'({control}){text}', max_tokens=len(text) * 8 + 10)   # room for a slower reading
        elif self.mode == 'combined':
            kwargs.update(prompt_audio=str(self.reference), prompt_text=self.transcript)
        started = time.time()
        mx.random.seed(seed)
        result = list(self.model.generate(**kwargs))
        samples = np.concatenate([np.asarray(chunk.audio) for chunk in result]).astype(np.float32)
        rate = result[0].sample_rate
        if self.cleaner is not None:
            samples = np.asarray(self.cleaner.enhance_array(samples), dtype=np.float32)
        # Without this MLX's buffer cache grew to 18 GB over four lines (VoxCPM + Whisper in one process) and the
        # fourth synthesis took 17.7 s instead of 4.9 s; cleared, every line stays at 4.4-6.0 s (2026-11-03 bench).
        mx.clear_cache()
        return to_rate(samples, rate), time.time() - started


def check_take(audio, reading, whisper, exceptions, language='zh'):
    """Gate, speech rate and ASR of a trimmed take; then the tail cut and a second ASR of the audio actually kept.
    The ASR compares the reading only (a tone's control text is never spoken), by characters or by words."""
    started = time.time()
    covers = coverage_of(language)
    gate = measure(audio, short_clip=True)
    failures = list(gate['failures'])
    start, end = speech_span(audio)
    syllables = spoken_syllables(reading)
    rate = syllables / max(.01, end - start)
    low, high = SPEECH_RATE_RANGE_WORDS if i18n.uses_words(language) else SPEECH_RATE_RANGE
    if syllables >= 4 and not low <= rate <= high:
        failures.append(f'speech rate {rate:.2f} syllables/s outside {(low, high)}')
    result = {'gate': {key: gate.get(key) for key in ('pause_depth_db', 'peak_dbfs', 'tonal_lines_hz_persistence', 'clipped_fraction')},
              'syllables_per_second': round(rate, 2)}
    words = None
    if whisper:
        heard = whisper.transcribe(audio)
        coverage = covers(reading, heard['text'])
        result['asr_take'] = {'text': heard['text'], 'cer': coverage['cer'], 'status': coverage['status']}
        if coverage['status'] != 'pass':
            failures.append(f"ASR does not cover the reading, ending included (CER {coverage['cer']}): {heard['text']!r}")
        words = heard['words']
    cut, tail = speech_tail(audio, words, quiet_seconds=TAIL_QUIET_WORDS_SECONDS if i18n.uses_words(language) else TAIL_QUIET_SECONDS)
    result['tail'] = tail
    kept = None
    if cut is None:
        failures.append(f"the take ends mid-sound ({tail['final_level_db']} dB): the last word is cut off")
    elif clips_last_word(tail, words):
        failures.append(clips_last_word(tail, words))
    else:
        kept = finish_edges(audio, cut, tail['speech_end'])
        if whisper and not failures:
            heard = whisper.transcribe(kept)
            coverage = covers(reading, heard['text'])
            result.update(asr=heard['text'], cer=coverage['cer'], words=heard['words'],
                          **{key: coverage[key] for key in ('matched_by', 'pinyin_cer', 'sound_wer') if key in coverage})
            if coverage['status'] != 'pass':
                failures.append(f"after the tail cut, ASR does not cover the reading (CER {coverage['cer']}): {heard['text']!r}")
            if not i18n.uses_words(language) and english_words(reading):
                english = whisper.english_heard(kept, reading, exceptions)
                result['english'] = english
                if english['status'] != 'pass':
                    failures.append('an English ear does not hear: ' + ', '.join(item['word'] for item in english['words'] if not item['heard']))
    result['check_seconds'] = round(time.time() - started, 2)
    return kept, {**result, 'failures': failures, 'status': 'FAIL' if failures else 'PASS'}


def generate(engine, reading, seeds, whisper, exceptions, label, control=None, language='zh'):
    """Try seeds until one passes. Returns (kept audio or None, best failed take or None, attempts, kept-audio words,
    index of the chosen attempt or None). A take that passes only on toneless pinyin (Whisper heard a homophone, which
    can also be a tone slip: 商家 heard as 上加) earns one more seed; an exact character match there is preferred."""
    attempts, best, held = [], (None, None), None
    for index, seed in enumerate(seeds):
        if held is not None and index > held[3] + 1:
            break
        raw, synth_seconds = engine.synthesize(reading, seed, control)
        record = {'seed': seed, 'synth_seconds': round(synth_seconds, 2), 'raw_seconds': round(len(raw) / SR, 2)}
        if not len(raw) or not np.isfinite(raw).all() or not np.any(raw):
            attempts.append({**record, 'status': 'FAIL', 'failures': ['empty, silent or non-finite audio']})
            log(f'[{label}] seed {seed}: synth {synth_seconds:.1f}s, FAIL empty audio')
            continue
        try:
            start, end = speech_span(raw)
        except ValueError:
            attempts.append({**record, 'status': 'FAIL', 'failures': ['no speech found']})
            continue
        audio = raw[max(0, round((start - LEAD_SECONDS) * SR)):round((end + RAW_TAIL_SECONDS) * SR)]
        kept, check = check_take(audio, reading, whisper, exceptions, language)
        attempts.append({**record, **{key: value for key, value in check.items() if key != 'words'}})
        summary = f"cer {check.get('cer', check.get('asr_take', {}).get('cer', 'n/a'))}"
        log(f"[{label}] seed {seed}: synth {synth_seconds:.1f}s, check {check['check_seconds']:.1f}s, {check['status']} {summary}"
            + ('' if check['status'] == 'PASS' else ' - ' + '; '.join(check['failures'])))
        if check['status'] == 'PASS':
            exact = check.get('matched_by') not in ('pinyin', 'sound')
            if held is None and not exact and index + 1 < len(seeds):
                held = (kept, check.get('words'), check.get('cer', 1.), index)
                log(f'[{label}] passed on sound-alikes only (toneless pinyin or Soundex); trying one more seed for an exact match')
                continue
            if held is not None and not exact and check.get('cer', 1.) >= held[2]:
                break  # the extra seed is no better: keep the held take
            return kept, None, attempts, check.get('words'), index
        if held is not None:
            break
        score = len(check['failures']) + check.get('cer', check.get('asr_take', {}).get('cer', 1.))
        if best[0] is None or score < best[0]:
            best = (score, kept if kept is not None else audio)
    if held is not None:
        return held[0], None, attempts, held[1], held[3]
    return None, best[1], attempts, None, None


# ------------------------------------------------------------------------------------------- job handling

def load_lines(job):
    path = job / 'work' / 'lines.json'
    if not path.is_file():
        raise SystemExit(f'No {path}: the engine writes it')
    spec = json.loads(path.read_text())
    global_map = check_map(spec.get('say') or {}, 'lines.json')
    lines, seen = [], set()
    for line in spec.get('lines') or []:
        identifier, text = line.get('id'), (line.get('text') or '').strip()
        if not isinstance(identifier, str) or not SAFE_ID.match(identifier) or identifier in seen:
            raise SystemExit(f'lines.json: line id {identifier!r} must be unique and use only letters, digits, _ . -')
        if not text:
            raise SystemExit(f'lines.json: line {identifier} has no text')
        say = line.get('say')
        if isinstance(say, dict):
            check_map(say, f'lines.json line {identifier}')
        elif say is not None and (not isinstance(say, str) or not say.strip()):
            raise SystemExit(f'lines.json line {identifier}: say must be a reading string or a map')
        reading, segments = reading_of(text, global_map, say)
        tone = line.get('tone')
        if tone is not None and (not isinstance(tone, str) or re.search(r'[()（）]', tone)):
            raise SystemExit(f'lines.json line {identifier}: tone must be a short description without brackets')
        seen.add(identifier)
        lines.append({'id': identifier, 'text': text, 'reading': reading, 'segments': segments, 'voice': line.get('voice'),
                      'tone': (tone or '').strip() or None})
    if not lines:
        raise SystemExit('lines.json has no lines')
    return spec, lines


def signature(identity, reading, seeds, control=None, language='zh'):
    """Cache key. The control text and a language other than Chinese join the key only when present, so every take
    cached before tones and languages existed keeps its key."""
    payload = {'checks': CHECKS_VERSION, 'identity': identity, 'reading': reading, 'seeds': seeds}
    if control:
        payload['control'] = {'text': control, 'mode': TONE_MODE}
    if i18n.base_language(language) not in ('', 'zh'):
        payload['language'] = language
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]


def seed_list(base, excluded):
    seeds, candidate = [], base
    while len(seeds) < ATTEMPTS:
        if candidate not in excluded:
            seeds.append(candidate)
        candidate += 1
    return seeds


def probe_terms(job, lines, engine, whisper, exceptions, language='zh'):
    """Voice each English word in its own sentence (two seeds) before the lines; numerals always need a reading.
    In a language written with spaces every word is Latin, so only numerals are reported."""
    folder = job / 'work' / 'audio' / 'term-probe'
    folder.mkdir(parents=True, exist_ok=True)
    terms = {}
    latin_terms = not i18n.uses_words(language)
    for line in lines:
        for sentence in re.split(r'(?<=[。！？!?])', line['reading']):
            for match in (list(LATIN_WORD.finditer(sentence)) if latin_terms else []) + list(DIGITS.finditer(sentence)):
                terms.setdefault(match.group(0), (sentence.strip(), line['id'], sentence[match.end():]))
    report, voiced = [], {}

    def voice_clause(clause, seed):
        """One take of a sentence, shared by every term in it."""
        if (clause, seed) not in voiced:
            raw, seconds = engine.synthesize(clause, seed)
            try:
                start, end = speech_span(raw)
                raw = raw[max(0, round((start - LEAD_SECONDS) * SR)):round((end + RAW_TAIL_SECONDS) * SR)]
            except ValueError:
                pass
            path = folder / f'{len(voiced):02d}-{seed}.wav'
            write_wav(path, raw)
            take = {'seed': seed, 'file': path.name, 'synth_seconds': round(seconds, 2)}
            if whisper:
                heard = whisper.transcribe(raw)
                coverage = covers(clause, heard['text'])
                take.update(asr=heard['text'], cer=coverage['cer'], asr_pass=coverage['status'] == 'pass',
                            english=whisper.english_heard(raw, clause, exceptions))
            voiced[(clause, seed)] = take
        return voiced[(clause, seed)]

    for term, (clause, line_id, after) in terms.items():
        if DIGITS.fullmatch(term):
            said = number_reading(term, after) if latin_terms else digit_terms(term, language)[0][1]
            report.append({'term': term, 'line': line_id, 'clause': clause, 'status': 'needs_say', 'suggest': {term: said},
                           'advice': f'VoxCPM2 does not normalise digits: say {{"{term}": "{said}"}} (the caption keeps {term})'})
            continue
        takes = []
        for attempt in range(2):
            shared = voice_clause(clause, engine.seed + attempt)
            take = {key: shared[key] for key in ('seed', 'file', 'synth_seconds', 'asr', 'cer') if key in shared}
            if whisper:
                term_heard = any(item['word'] == term.lower() and item['heard'] for item in shared['english']['words'])
                failures = ([f"ASR CER {shared['cer']}: {shared['asr']!r}"] if not shared['asr_pass'] else []) + \
                           ([f"an English ear hears {shared['english']['heard']!r}"] if not term_heard else [])
                take.update(english_heard=shared['english']['heard'], term_heard=term_heard,
                            status='FAIL' if failures else 'PASS', failures=failures)
            else:
                take['status'] = 'unchecked'
            takes.append(take)
        passed = sum(take['status'] == 'PASS' for take in takes)
        entry = {'term': term, 'line': line_id, 'clause': clause, 'passed': passed, 'of': len(takes), 'takes': takes,
                 'status': 'unchecked' if not whisper else 'pass' if passed == len(takes) else 'risky' if passed else 'fail'}
        if whisper and passed < len(takes):
            entry['advice'] = f'say {{"{term}": "<中文读法或中文词>"}}: the caption keeps {term}, the voice reads the Chinese'
        report.append(entry)
        log(f"probe {term!r}: {entry['status']} ({passed}/{len(takes)})")
    (folder / 'report.json').write_text(json.dumps({'terms': report}, ensure_ascii=False, indent=1))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('job', type=Path)
    parser.add_argument('--only', help='comma-separated line ids to (re)check; other lines keep their entries')
    parser.add_argument('--redo', action='append', default=[], help='reject the current take of this line id and try the next seeds (repeatable, or comma list)')
    parser.add_argument('--probe-terms', action='store_true', help='voice each English word / number in its sentence and suggest say entries (work/audio/term-probe)')
    parser.add_argument('--no-asr', action='store_true', help='skip the Whisper check (takes are marked unchecked; chars are null)')
    arguments = parser.parse_args()
    job = arguments.job.resolve()
    spec, lines = load_lines(job)
    exceptions = list((spec.get('english_exceptions') or {}).keys())
    only = {item.strip() for item in (arguments.only or '').split(',') if item.strip()}
    redo = {item.strip() for value in arguments.redo for item in value.split(',') if item.strip()}
    known = {line['id'] for line in lines}
    for identifier in only | redo:
        if identifier not in known:
            raise SystemExit(f'Unknown line id {identifier!r}')

    whisper_dir, whisper_problem = audio_env.whisper_model()
    if whisper_problem and not arguments.no_asr:
        raise SystemExit(f'ASR UNAVAILABLE: {whisper_problem}.\nThe ASR check is required (it caught skipped and garbled '
                         'words before). Restore the model to the HF cache, or rerun with --no-asr to accept unchecked takes.')
    if arguments.no_asr:
        log('WARNING: --no-asr: takes are NOT checked by ASR; cer/asr/chars will be null' +
            (f' (Whisper is also missing: {whisper_problem})' if whisper_problem else ''))

    profile = audio_env.voice_profile(spec.get('voice') or audio_env.DEFAULT_VOICE)
    engine = Engine(profile, spec.get('voxcpm') or {})
    engines = {profile['id']: engine}

    def engine_for(line):                          # a line may name its own voice (dialogue, voice showcases)
        vid = line.get('voice') or profile['id']
        if vid not in engines:
            engines[vid] = Engine(audio_env.voice_profile(vid), spec.get('voxcpm') or {})
        return engines[vid]
    main_engine = engine
    language = spec.get('language') or 'zh'
    covers = coverage_of(language)
    whisper = None if arguments.no_asr else Whisper(whisper_dir, i18n.base_language(language))

    if arguments.probe_terms:
        report = probe_terms(job, lines, engine, whisper, exceptions, language)
        print(json.dumps([{key: item[key] for key in ('term', 'status', 'advice', 'suggest') if key in item} for item in report], ensure_ascii=False, indent=1))
        return 0

    with_digits = {line['id']: digit_terms(line['reading'], language) for line in lines if DIGITS.search(line['reading'])}
    if with_digits:
        suggestion = {term: said for terms in with_digits.values() for term, said in terms}
        raise SystemExit('Readings still contain Arabic numerals, which VoxCPM2 does not normalise: ' +
                         ', '.join(f'{key} ({", ".join(t for t, _ in value)})' for key, value in with_digits.items()) +
                         '\nAdd to lines.json "say" (captions keep the digits): ' + json.dumps(suggestion, ensure_ascii=False))

    audio_dir = job / 'work' / 'audio'
    cache, out_dir = audio_dir / 'cache', audio_dir / 'lines'
    cache.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    exclusions_path = cache / 'exclusions.json'
    exclusions = json.loads(exclusions_path.read_text()) if exclusions_path.is_file() else {}
    voice_path = audio_dir / 'voice.json'
    previous = json.loads(voice_path.read_text()) if voice_path.is_file() else {}

    entries, failed, totals = {}, {}, {'synthesized': 0, 'reused': 0, 'failed': 0}
    for line in lines:
        identifier, reading = line['id'], line['reading']
        engine = engine_for(line)
        if only and identifier not in only:
            kept_entry = (previous.get('lines') or {}).get(identifier)
            if kept_entry and kept_entry.get('reading') == reading and kept_entry.get('text') == line['text'] and \
                    kept_entry.get('tone') == line['tone'] and (out_dir / f'{identifier}.wav').is_file():
                entries[identifier] = kept_entry  # a line whose text changed is left out until it is regenerated
            elif identifier in (previous.get('failed') or {}):
                failed[identifier] = previous['failed'][identifier]
            continue
        control = line['tone']

        def keyed(seeds):
            return signature(engine.identity, reading, seeds, control, language)
        base_key = keyed([])
        excluded = set(exclusions.get(base_key, []))
        key = keyed(seed_list(engine.seed, excluded))
        record_path, take_path = cache / f'{key}.json', cache / f'{key}.wav'
        record = json.loads(record_path.read_text()) if record_path.is_file() else None
        if identifier in redo and record and record.get('status') == 'pass':
            excluded.add(record['seed'])
            exclusions[base_key] = sorted(excluded)
            exclusions_path.write_text(json.dumps(exclusions, indent=1))
            key = keyed(seed_list(engine.seed, excluded))
            record_path, take_path = cache / f'{key}.json', cache / f'{key}.wav'
            record = json.loads(record_path.read_text()) if record_path.is_file() else None
            log(f'[{identifier}] redo: seed {sorted(excluded)} rejected, trying {seed_list(engine.seed, excluded)}')
        usable = record and record.get('status') == 'pass' and take_path.is_file()
        if usable and whisper and not record.get('asr_checked'):
            kept = read_wav(take_path)
            heard = whisper.transcribe(kept)
            coverage = covers(reading, heard['text'])
            if coverage['status'] == 'pass':
                record.update(asr=heard['text'], cer=coverage['cer'], words=heard['words'], asr_checked=True,
                              **{key: coverage[key] for key in ('matched_by', 'pinyin_cer', 'sound_wer') if key in coverage})
                record_path.write_text(json.dumps(record, ensure_ascii=False, indent=1))
                log(f'[{identifier}] cached unchecked take now ASR-checked: cer {coverage["cer"]}')
            else:
                usable = False
                log(f'[{identifier}] cached unchecked take fails ASR (cer {coverage["cer"]}); regenerating')
        if usable:
            totals['reused'] += 1
            log(f"[{identifier}] cached take (seed {record['seed']}, {record['dur']:.2f}s)")
        else:
            seeds = seed_list(engine.seed, excluded)
            kept, best, attempts, words, chosen = generate(engine, reading, seeds, whisper, exceptions, identifier, control, language)
            if kept is None:
                totals['failed'] += 1
                failed_path = None
                if best is not None:
                    failed_path = audio_dir / 'failed' / f'{identifier}.wav'
                    write_wav(failed_path, best)
                failed[identifier] = {'text': line['text'], 'reading': reading, 'tone': control, 'seeds': seeds, 'attempts': attempts,
                                      'best_take_for_listening': str(failed_path) if failed_path else None,
                                      'advice': 'rewrite the line or add a say reading for terms the voice cannot say' +
                                                (', or soften / drop its tone' if control else '') + ', then rerun'}
                (out_dir / f'{identifier}.wav').unlink(missing_ok=True)
                continue
            totals['synthesized'] += 1
            write_wav(take_path, kept)
            final = attempts[chosen]
            final['chosen'] = True
            record = {'status': 'pass', 'key': key, 'reading': reading, 'tone': control, 'tone_mode': TONE_MODE if control else None,
                      'seed': final['seed'], 'dur': round(len(kept) / SR, 3), 'syllables_per_second': final.get('syllables_per_second'),
                      'asr': final.get('asr'), 'cer': final.get('cer'), 'words': words, 'asr_checked': bool(whisper),
                      **{key: final[key] for key in ('matched_by', 'pinyin_cer', 'sound_wer') if key in final},
                      'synth_seconds': round(sum(item.get('synth_seconds', 0) for item in attempts), 2),
                      'check_seconds': round(sum(item.get('check_seconds', 0) for item in attempts), 2),
                      'attempts': attempts, 'identity': engine.identity}
            record_path.write_text(json.dumps(record, ensure_ascii=False, indent=1))
        kept = read_wav(take_path)
        shutil.copyfile(take_path, out_dir / f'{identifier}.wav')
        chars, why = (caption_chars(line['text'], reading, line['segments'], record['words'], record['dur'])
                      if record.get('words') else (None, 'no ASR timestamps'))
        entries[identifier] = {'dur': record['dur'], 'text': line['text'], 'reading': reading, 'tone': control, 'voice': engine.identity['voice'], 'asr': record.get('asr'),
                               'cer': record.get('cer'), 'seed': record['seed'], 'chars': chars,
                               **{key: record[key] for key in ('matched_by', 'pinyin_cer', 'sound_wer') if key in record},
                               **({'chars_note': why} if chars is None else {}),
                               'asr_checked': record.get('asr_checked', False), 'attempts': len(record['attempts']),
                               'synth_seconds': record['synth_seconds'], 'lufs': loudness_lufs(kept),
                               'peak_dbfs': round(db(np.abs(kept).max()), 2), 'file': f'lines/{identifier}.wav', 'cache_key': record['key'],
                               **({'syllables_per_second': record['syllables_per_second']} if record.get('syllables_per_second') else {}),
                               'env_hz': ENV_HZ, 'env': talk_env(kept)}
        failed.pop(identifier, None)

    if not only:
        for stale in out_dir.glob('*.wav'):
            if stale.stem not in known:
                stale.unlink()
    engine = main_engine
    report = {'voice': engine.identity['voice'], 'voices': sorted(engines), 'language': language, 'sample_rate': SR,
              'engine': {key: value for key, value in engine.identity.items() if key != 'voice'},
              'asr': {'model': str(whisper_dir) if whisper else None, 'checked': bool(whisper),
                      **({'metric': 'wer', 'max_wer': MAX_WER} if i18n.uses_words(language) else {'metric': 'cer', 'max_cer': .15})},
              'lines': {line['id']: entries[line['id']] for line in lines if line['id'] in entries},
              'failed': {line['id']: failed[line['id']] for line in lines if line['id'] in failed},
              'subjective_listening': 'not_performed'}
    voice_path.write_text(json.dumps(report, ensure_ascii=False, indent=1))
    total = sum(entry['dur'] for entry in report['lines'].values())
    log(f"voice.json: {len(report['lines'])} lines ready ({total:.2f}s of speech), {totals['synthesized']} synthesized, "
        f"{totals['reused']} reused, {len(report['failed'])} failed")
    if report['failed']:
        log('FAILED lines: ' + ', '.join(report['failed']) + f' (details in {voice_path})')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

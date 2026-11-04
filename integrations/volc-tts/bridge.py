#!/usr/bin/env python3
"""Create sweety-statechart-video narration inputs using Volcengine TTS 2.0.

This file lives outside the author's Skill. It never edits Skill source files.
Run ``scv.py lines JOB`` first, then ``bridge.py JOB --live``. Each uncached
line makes one paid API request. Without --live, this is a read-only preflight.
"""
from __future__ import annotations

import argparse
import array
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request
import uuid
import wave

ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
RESOURCE = "seed-tts-2.0"
VOICE_ID = "volc-seed-tts-2"
DEFAULT_SPEAKER = "zh_male_cixingjieshuonan_uranus_bigtts"
RATE = 48000


def normalized(text: str) -> str:
    return "".join(ch.casefold() for ch in text if ch.isalnum())


def documents(body: bytes):
    text = body.decode("utf-8-sig")
    lines = text.splitlines()
    if any(line.lstrip().startswith("data:") for line in lines):
        text = "\n".join(line.split("data:", 1)[1].strip()
                         for line in lines if line.lstrip().startswith("data:") and line.strip() != "data: [DONE]")
    decoder = json.JSONDecoder()
    pos = 0
    while pos < len(text):
        while pos < len(text) and text[pos].isspace():
            pos += 1
        if pos == len(text):
            break
        item, pos = decoder.raw_decode(text, pos)
        if not isinstance(item, dict):
            raise ValueError("TTS response contains a non-object JSON value")
        yield item


def decode_response(body: bytes):
    audio = bytearray()
    words = []
    seen = set()
    success = False
    for item in documents(body):
        code = item.get("code", 0)
        if code not in (0, 20000000):
            raise ValueError(f"TTS returned code {code}: {str(item.get('message', ''))[:180]}")
        success = True
        chunk = item.get("data")
        if chunk:
            audio.extend(base64.b64decode(chunk, validate=True))
        for word in (item.get("sentence") or {}).get("words") or []:
            key = (word.get("word"), word.get("startTime"), word.get("endTime"))
            if key not in seen:
                words.append(word)
                seen.add(key)
    if not success or not audio or not words:
        raise ValueError("TTS did not return both audio and word timestamps")
    words.sort(key=lambda w: (float(w["startTime"]), float(w["endTime"])))
    return bytes(audio), words


def request_tts(text: str, speaker: str, key: str):
    payload = {"req_params": {"text": text, "speaker": speaker,
               "audio_params": {"format": "mp3", "sample_rate": 24000,
                                "enable_subtitle": True}}}
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "X-Api-Key": key,
                 "X-Api-Resource-Id": RESOURCE, "X-Api-Request-Id": str(uuid.uuid4())})
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            return decode_response(response.read())
    except urllib.error.HTTPError as exc:
        # Do not print request headers or the key.
        raise RuntimeError(f"TTS HTTP {exc.code}: {exc.read(300).decode('utf-8', 'replace')}") from None


def convert_mp3(mp3: bytes, wav_path: Path):
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = wav_path.with_suffix(".writing.wav")
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "mp3", "-i", "pipe:0",
           "-ac", "1", "-ar", str(RATE), "-c:a", "pcm_s16le", str(temporary)]
    result = subprocess.run(cmd, input=mp3, capture_output=True)
    if result.returncode:
        temporary.unlink(missing_ok=True)
        raise RuntimeError("ffmpeg conversion failed: " + result.stderr.decode("utf-8", "replace")[-500:])
    temporary.replace(wav_path)


def audio_info(wav_path: Path):
    with wave.open(str(wav_path), "rb") as stream:
        if (stream.getnchannels(), stream.getsampwidth(), stream.getframerate()) != (1, 2, RATE):
            raise ValueError("expected 48 kHz mono 16-bit PCM WAV")
        samples = array.array("h")
        samples.frombytes(stream.readframes(stream.getnframes()))
    if sys.byteorder != "little":
        samples.byteswap()
    duration = len(samples) / RATE
    hop = RATE // 100
    levels = []
    for start in range(0, len(samples), hop):
        window = samples[start:start + hop]
        rms = math.sqrt(sum(x * x for x in window) / max(1, len(window))) / 32768
        levels.append(20 * math.log10(max(rms, 1e-6)))
    loud = sorted(levels)[int((len(levels) - 1) * .95)] if levels else -120
    env, prior = [], 0.0
    for level in levels:
        target = max(0.0, min(1.0, (level - loud + 28) / 28))
        prior += (target - prior) * (0.49 if target > prior else 0.13)
        env.append(round(prior, 2))
    return round(duration, 3), env


def char_times(caption: str, words: list, duration: float):
    spoken_positions = [i for i, ch in enumerate(caption) if ch.isalnum()]
    spoken = "".join(caption[i].casefold() for i in spoken_positions)
    heard = "".join(normalized(str(w.get("word", ""))) for w in words)
    if spoken != heard:
        raise ValueError(f"TTS text differs from caption: caption={spoken!r}, returned={heard!r}")
    times = [None] * len(caption)
    cursor = 0
    last_start = 0.0
    for word in words:
        letters = normalized(str(word.get("word", "")))
        start, end = float(word["startTime"]), float(word["endTime"])
        if not (0 <= last_start <= start <= end <= duration + .25):
            raise ValueError("TTS timestamps are outside audio or not ordered in seconds")
        last_start = start
        for n in range(len(letters)):
            index = spoken_positions[cursor]
            times[index] = (start + (end - start) * n / len(letters),
                            start + (end - start) * (n + 1) / len(letters))
            cursor += 1
    previous = 0.0
    result = []
    for ch, stamp in zip(caption, times):
        if stamp is None:
            stamp = (previous, previous)
        previous = stamp[1]
        result.append([ch, round(stamp[0], 3), round(stamp[1], 3)])
    return result


def atomic_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".writing")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def run(job: Path, speaker: str, live: bool):
    lines_file = job / "work" / "lines.json"
    if not lines_file.is_file():
        raise ValueError(f"missing {lines_file}; run scv.py lines JOB first")
    spec = json.loads(lines_file.read_text(encoding="utf-8"))
    if spec.get("voice") != VOICE_ID:
        raise ValueError(f'film.json voice must be "{VOICE_ID}" before running scv.py lines')
    if spec.get("say") or any(line.get("say") for line in spec["lines"]):
        raise ValueError("say/read-aloud overrides require separate alignment review; this adapter does not apply them")
    lines = spec["lines"]
    if not lines:
        raise ValueError("no captioned steps in work/lines.json")
    out = job / "work" / "audio"
    cache = out / "volc-cache"
    entries = {}
    needed = []
    for line in lines:
        ident, caption = line["id"], line["text"]
        if not normalized(caption):
            raise ValueError(f"line {ident} has no speakable text")
        signature = hashlib.sha256(json.dumps([RESOURCE, speaker, caption], ensure_ascii=False).encode()).hexdigest()[:24]
        meta, wav = cache / f"{signature}.json", cache / f"{signature}.wav"
        if not meta.is_file() or not wav.is_file():
            needed.append(ident)
            if not live:
                continue
            key = os.environ.get("VOLC_TTS_API_KEY", "")
            if not key:
                raise ValueError("VOLC_TTS_API_KEY is not available in this task")
            mp3, words = request_tts(caption, speaker, key)
            convert_mp3(mp3, wav)
            duration, env = audio_info(wav)
            chars = char_times(caption, words, duration)
            atomic_json(meta, {"dur": duration, "text": caption, "chars": chars,
                               "env_hz": 100, "env": env, "speaker": speaker,
                               "source": "volcengine-seed-tts-2.0"})
        if meta.is_file() and wav.is_file():
            entry = json.loads(meta.read_text(encoding="utf-8"))
            if entry.get("text") != caption:
                raise ValueError(f"cache mismatch for {ident}")
            entries[ident] = {**entry, "file": f"lines/{ident}.wav"}
    print(json.dumps({"total_lines": len(lines), "cached": len(entries),
                      "requests_needed": len(needed), "live": live}, ensure_ascii=False))
    if not live:
        return
    if len(entries) != len(lines):
        raise ValueError("not all lines have verified audio")
    lines_dir = out / "lines"
    lines_dir.mkdir(parents=True, exist_ok=True)
    for line in lines:
        ident, caption = line["id"], line["text"]
        signature = hashlib.sha256(json.dumps([RESOURCE, speaker, caption], ensure_ascii=False).encode()).hexdigest()[:24]
        target = lines_dir / f"{ident}.wav"
        source = cache / f"{signature}.wav"
        target.write_bytes(source.read_bytes())
    atomic_json(out / "voice.json", {"voice": VOICE_ID, "engine": "volcengine-seed-tts-2.0",
                                      "speaker": speaker, "lines": entries, "failed": {}})
    print(f"wrote {out / 'voice.json'} with {len(entries)} lines")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("job", type=Path)
    parser.add_argument("--speaker", default=os.environ.get("VOLC_TTS_SPEAKER", DEFAULT_SPEAKER))
    parser.add_argument("--live", action="store_true", help="make one paid request for each uncached line")
    args = parser.parse_args()
    try:
        run(args.job.resolve(), args.speaker, args.live)
    except (ValueError, RuntimeError) as exc:
        parser.exit(1, f"bridge: {exc}\n")


if __name__ == "__main__":
    main()


#!/usr/bin/env python3
"""Background music bed for a statechart video: JOB/work/audio/music.wav (48 kHz stereo, 24-bit).

  music.py JOB --mood <mood> --duration SEC [--seed N] [--fade-in S] [--fade-out S]

The bed is our own procedural instrumental (music_synth.py, vendored from sweety-handdraw-video 3.0.0, commit 63154e4;
"builtin:<mood>" there): nothing sampled, the same mood + seed always renders the same bed, rendered at -16 LUFS with a
-1 dBFS ceiling. Fades follow handdraw's music_bed.py defaults (1.2 s in, 3 s out). Ducking under the narration and the
final level happen in mix.py, so this file stays a plain bed. Also writes music.json (mood, seed, loudness, sha256).
--duration defaults to timeline.json's duration when that exists.
"""
import audio_env
audio_env.require('numpy', 'scipy')

import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

import music_synth
from meter import write_wav, raised_cosine_fades

FADE_IN_SECONDS = 1.2
FADE_OUT_SECONDS = 3.


def sync_key(sync):
    """What makes a synced bed different: tempo, grid origin, sections and accents (None for an unsynced bed)."""
    if not sync:
        return None
    keep = {key: sync.get(key) for key in ('bpm', 'origin', 'sections', 'accents', 'stretch')}
    return hashlib.sha256(json.dumps(keep, sort_keys=True).encode()).hexdigest()[:16]


def render_bed(job, mood, duration, seed=0, fade_in=FADE_IN_SECONDS, fade_out=FADE_OUT_SECONDS, sync=None):
    """Render, fade and write work/audio/music.wav; returns the record also written to music.json.
    `sync` (timeline.json music.sync, from scv.py plan): {bpm, origin, sections, accents, stretch}; bar 0 of the bed
    starts at film time `origin` (<= 0), so the render begins -origin seconds early and that lead is cut; section and
    stretch bars count from there, accents are film seconds."""
    started = time.time()
    if sync:
        lead = -float(sync['origin'])
        stereo, record = music_synth.render(mood, float(duration) + lead, int(seed), loop=False, bpm=sync['bpm'],
                                            sections=sync.get('sections'), accents=[a + lead for a in sync.get('accents') or []],
                                            stretch={int(k): float(v) for k, v in sync.get('stretch') or []})
        stereo = stereo[round(lead * music_synth.SAMPLE_RATE):]
        record.update(origin=sync['origin'], sync_key=sync_key(sync))
    else:
        stereo, record = music_synth.render(mood, float(duration), int(seed), loop=False)
    fade_in, fade_out = min(fade_in, duration / 3), min(fade_out, duration / 3)
    stereo = raised_cosine_fades(stereo, fade_in, fade_out)
    folder = Path(job) / 'work' / 'audio'
    path = folder / 'music.wav'
    write_wav(path, stereo, 24)
    record.update(file=str(path), duration=round(len(stereo) / music_synth.SAMPLE_RATE, 3), fade_in=fade_in, fade_out=fade_out,
                  sha256=hashlib.sha256(path.read_bytes()).hexdigest(), render_seconds=round(time.time() - started, 2),
                  description=music_synth.MOODS[mood]['description'])
    (folder / 'music.json').write_text(json.dumps(record, ensure_ascii=False, indent=1))
    return record


def main():
    moods = '\n'.join(f"  {name:<8} {mood['description']} ({mood['bpm']} bpm)" for name, mood in music_synth.MOODS.items())
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
                                     epilog='moods:\n' + moods)
    parser.add_argument('job', type=Path)
    parser.add_argument('--mood', required=True, choices=list(music_synth.MOODS), metavar='MOOD', help='one of: ' + ', '.join(music_synth.MOODS))
    parser.add_argument('--duration', type=float, help='seconds (default: timeline.json duration)')
    parser.add_argument('--seed', type=int, default=0, help='arrangement seed (default 0)')
    parser.add_argument('--fade-in', type=float, default=FADE_IN_SECONDS)
    parser.add_argument('--fade-out', type=float, default=FADE_OUT_SECONDS)
    arguments = parser.parse_args()
    duration = arguments.duration
    if duration is None:
        timeline = arguments.job / 'work' / 'timeline.json'
        if not timeline.is_file():
            raise SystemExit('Give --duration, or write work/timeline.json first')
        duration = float(json.loads(timeline.read_text())['duration'])
    record = render_bed(arguments.job.resolve(), arguments.mood, duration, arguments.seed, arguments.fade_in, arguments.fade_out)
    print(json.dumps(record, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())

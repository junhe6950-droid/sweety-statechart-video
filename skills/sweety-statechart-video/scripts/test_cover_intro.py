"""Exercise the actual encoder: cover/fade/body order, sound delay, subtitles and repeat-safe finalization."""
import array
import contextlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import scv


def ffmpeg(*args):
    return subprocess.check_output(['ffmpeg', '-v', 'error', '-y', *map(str, args)])


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'ffmpeg and ffprobe required')
class CoverIntroTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix='scv-cover-')
        self.addCleanup(self.folder.cleanup)
        self.job = Path(self.folder.name)
        (self.job / 'work/render').mkdir(parents=True)
        (self.job / 'outputs').mkdir()
        self.body = self.job / 'work/render/video.mp4'
        self.cover = self.job / 'outputs/cover.png'
        self.audio = self.job / 'tone.wav'
        ffmpeg('-f', 'lavfi', '-i', 'color=blue:s=120x160:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', self.body)
        # A portrait cover in a different ratio also exercises fit-without-cropping.
        ffmpeg('-f', 'lavfi', '-i', 'color=red:s=120x120', '-frames:v', '1', self.cover)
        ffmpeg('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', self.audio)
        self.timing = {'W': 120, 'H': 160, 'fps': 30, 'duration': 2,
                       'steps': [{'t0': .25, 't1': 1.5, 'note': '测试字幕', 'tag': 'I.1'}]}
        (self.job / 'work/timing.json').write_text(json.dumps(self.timing))

    def finalize(self, **spec):
        with patch.object(scv, 'sound', return_value=self.audio), contextlib.redirect_stdout(io.StringIO()):
            return scv.finalize(self.job, {'voice': 'none', **spec})

    def duration(self, video):
        return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(video)]))

    def center_rgb(self, video, seconds):
        pixels = ffmpeg('-ss', seconds, '-i', video, '-frames:v', '1', '-vf', 'crop=2:2:60:80', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-')
        return tuple(sum(pixels[channel::3]) / 4 for channel in range(3))

    def test_hold_fade_body_audio_and_repeat(self):
        video = self.finalize()
        self.assertAlmostEqual(self.duration(video), 3, places=2)
        held = self.center_rgb(video, .2)
        held_end = self.center_rgb(video, .466)
        fading = self.center_rgb(video, .75)
        faded = self.center_rgb(video, .966)
        body = self.center_rgb(video, 1.05)
        self.assertGreater(held[0], 230)
        self.assertAlmostEqual(held[0], held_end[0], delta=8)
        self.assertTrue(50 < fading[0] < 190)
        self.assertLess(faded[0], 35)
        self.assertGreater(body[2], 230)
        self.assertLess(body[0], 15)
        samples = array.array('f', ffmpeg('-i', video, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'))
        self.assertLess(max(abs(value) for value in samples[:45000]), .001)
        self.assertGreater(max(abs(value) for value in samples[52000:70000]), .05)
        captions = (self.job / 'outputs/editing/captions.srt').read_text()
        self.assertIn('00:00:01,250 --> 00:00:02,500', captions)
        self.finalize()
        self.assertAlmostEqual(self.duration(video), 3, places=2)
        self.assertEqual((self.job / 'outputs/editing/captions.srt').read_text(), captions)
        self.assertEqual(json.loads((self.job / 'work/timing.json').read_text()), self.timing)

    def test_disabled_does_not_require_cover_or_shift_subtitles(self):
        self.cover.unlink()
        video = self.finalize(cover_intro=False)
        self.assertAlmostEqual(self.duration(video), 2, places=2)
        self.assertIn('00:00:00,250', (self.job / 'outputs/editing/captions.srt').read_text())

    def test_missing_cover_preserves_existing_delivery(self):
        self.cover.unlink()
        delivery = self.job / 'outputs/film.mp4'
        delivery.write_bytes(b'previous delivery')
        with self.assertRaisesRegex(SystemExit, 'posters'):
            self.finalize()
        self.assertEqual(delivery.read_bytes(), b'previous delivery')


if __name__ == '__main__':
    unittest.main()

import base64
import json
import tempfile
import unittest
from pathlib import Path

import bridge


class BridgeContractTests(unittest.TestCase):
    def test_decodes_chunked_audio_and_strict_character_times(self):
        packets = [
            {"code": 0, "data": base64.b64encode(b"one").decode()},
            {"code": 0, "data": base64.b64encode(b"two").decode(),
             "sentence": {"words": [
                 {"word": "你", "startTime": 0.1, "endTime": 0.3},
                 {"word": "好，", "startTime": 0.3, "endTime": 0.6},
             ]}},
        ]
        audio, words = bridge.decode_response("\n".join(json.dumps(p) for p in packets).encode())
        self.assertEqual(audio, b"onetwo")
        chars = bridge.char_times("你好，", words, 0.8)
        self.assertEqual("".join(row[0] for row in chars), "你好，")
        self.assertEqual(chars[0][1:], [0.1, 0.3])
        self.assertEqual(chars[1][1:], [0.3, 0.6])
        self.assertEqual(chars[2][1:], [0.6, 0.6])

    def test_refuses_missing_timestamps_and_text_mismatch(self):
        packet = {"code": 0, "data": base64.b64encode(b"sound").decode()}
        with self.assertRaisesRegex(ValueError, "word timestamps"):
            bridge.decode_response(json.dumps(packet).encode())
        with self.assertRaisesRegex(ValueError, "differs"):
            bridge.char_times("你好", [{"word": "再见", "startTime": 0, "endTime": 0.4}], 1)

    def test_preflight_is_read_only(self):
        with tempfile.TemporaryDirectory() as folder:
            job = Path(folder)
            (job / "work").mkdir()
            (job / "work" / "lines.json").write_text(json.dumps({
                "voice": bridge.VOICE_ID, "lines": [{"id": "c1s01", "text": "你好"}]},
                ensure_ascii=False), encoding="utf-8")
            bridge.run(job, bridge.DEFAULT_SPEAKER, False)
            self.assertFalse((job / "work" / "audio").exists())


if __name__ == "__main__":
    unittest.main()


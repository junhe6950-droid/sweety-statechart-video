"""Offline contract test against an adjacent author's Skill checkout."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest


class AuthorContractTests(unittest.TestCase):
    def test_external_voice_files_feed_plan(self):
        skill = os.environ.get("SCV_SKILL")
        if not skill:
            self.skipTest("set SCV_SKILL to an author's Skill checkout")
        sys.path.insert(0, str(Path(skill) / "scripts"))
        os.environ["STATECHART_USER_VOICES"] = str(Path(__file__).with_name("catalog.json"))
        import scv

        with tempfile.TemporaryDirectory() as folder:
            job = Path(folder)
            scv.new_job(job, "Contract test")
            spec = json.loads((job / "film.json").read_text(encoding="utf-8"))
            spec["voice"] = "volc-seed-tts-2"
            (job / "film.json").write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
            self.assertFalse(scv.check(job, spec, quiet=True)["errors"])
            lines = scv.write_lines(job, spec)["lines"]
            report = {"voice": "volc-seed-tts-2", "failed": {}, "lines": {}}
            for line in lines:
                text = line["text"]
                report["lines"][line["id"]] = {
                    "text": text, "dur": 1.0, "chars": [[c, 0.1, 0.3] for c in text],
                    "env_hz": 100, "env": [0.2] * 100,
                }
            audio = job / "work" / "audio"
            audio.mkdir()
            (audio / "voice.json").write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
            timing = scv.plan(job, spec)
            self.assertEqual(timing["voice"], "volc-seed-tts-2")
            self.assertTrue(timing["steps"][0]["chars"])
            self.assertTrue(timing["talk"]["env"])


if __name__ == "__main__":
    unittest.main()


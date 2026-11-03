#!/usr/bin/env python3
"""Smoke test: the takeout example checks clean (and the checker finds its red path), lays out every poster without
page errors or overlapping words, plays one still per step and renders two seconds of video. Silent (no voice), so it
needs only Chrome + Playwright. usage: smoke_test.py [--keep]"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
SCV = SKILL / 'scripts/scv.py'


def run(*args):
    r = subprocess.run([sys.executable, str(SCV), *args], capture_output=True, text=True)
    if r.returncode:
        print(r.stdout[-3000:], r.stderr[-3000:])
        raise SystemExit(f'FAIL: scv.py {" ".join(args)}')
    return r.stdout + r.stderr


def units():
    sys.path.insert(0, str(SKILL / 'scripts'))
    import scv
    assert scv.frame_size({'aspect': '3:4'}) == (1080, 1440)
    assert scv.frame_size({'aspect': '16:9'}) == (1920, 1080)
    assert scv.frame_size({'aspect': '2.35:1'}) == (2538, 1080)
    assert scv.frame_size({'aspect': '9／16'}) == (1080, 1920)
    assert scv.aspect_ratio('1:9') is None and scv.aspect_ratio('abc') is None
    assert scv.target_duration({'voice': 'crayon-sister'}) == (120, 180)
    assert scv.target_duration({'voice': 'none'})[1] > 1e8
    assert scv.target_duration({'duration': '1分钟'}) == (54, 66)
    assert scv.target_duration({'duration': '2-3分钟'}) == (120, 180)
    assert scv.target_duration({'duration': [60, 90]}) == (60, 90)
    __import__('test_statechart_io').main()      # import / export, logic guards, history, fixes, rules (scripts/test_statechart_io.py)


def main():
    units()
    tmp = Path(tempfile.mkdtemp(prefix='scv-smoke-'))
    job = tmp / 'takeout'
    job.mkdir()
    shutil.copy(SKILL / 'examples/takeout/scenes.js', job / 'scenes.js')
    spec = json.loads((SKILL / 'examples/takeout/film.json').read_text())
    spec['voice'] = 'none'
    (job / 'film.json').write_text(json.dumps(spec, ensure_ascii=False))
    out = run('check', str(job))
    chk = json.loads(out[out.index('{'):])
    assert not chk['errors'], chk['errors']
    assert 'fresh > warm > cool > soggy > served' in out, out
    run('layout', str(job))
    rep = json.loads((job / 'work/layout/report.json').read_text())
    assert not rep['page_errors'], rep['page_errors']
    assert len(rep['chapters']) == len(spec['chapters'])
    run('plan', str(job))
    run('stills', str(job))
    steps = len(json.loads((job / 'work/timing.json').read_text())['steps'])
    n = len(list((job / 'work/stills').glob('t*.jpg')))
    assert n == steps, (n, steps)
    run('render', str(job), '--end', '2', '--workers', '2')
    video = job / 'work/render/video.mp4'
    assert video.exists() and video.stat().st_size > 10000
    print(f"PASS: {len(rep['chapters'])} posters, {steps} steps, red path fresh > warm > cool > soggy > served, "
          f"layout warnings: {len(rep['warnings'])}")
    for w in rep['warnings']:
        print(' ', w)
    if '--keep' in sys.argv:
        print('kept', job)
    else:
        shutil.rmtree(tmp)


if __name__ == '__main__':
    main()

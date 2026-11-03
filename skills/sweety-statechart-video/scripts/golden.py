#!/usr/bin/env python3
"""golden.py: `scv.py golden [--update] [EXAMPLE...]`. Renders the examples (takeout, message, intro) silently at fixed
times and compares each frame with its stored thumbnail in tests/golden/ by SSIM. A frame under the threshold is a
regression: it is listed, and a side-by-side (stored | now | difference) goes to the report folder. Exit 1 if any.
--update stores the current frames as the new baseline (after an intended change to the look).

The times are fixed in tests/golden/manifest.json when the baseline is made (the opening, the first step and the
settled last step of each chapter), so a change in pacing shows up as a regression too. Frames are 300 px JPEGs."""
import json
import shutil
import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
SKILL = SCRIPTS.parent
GOLDEN = SKILL / 'tests/golden'
EXAMPLES = ['takeout', 'message', 'intro']
THUMB = 300
THRESHOLD = .985
sys.path.insert(0, str(SCRIPTS))
import scv  # noqa: E402


def ssim(a, b):
    """mean SSIM of two same-size greyscale images (Gaussian window, sigma 1.5)"""
    import numpy as np
    from scipy.ndimage import gaussian_filter
    a, b = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    c1, c2 = (.01 * 255) ** 2, (.03 * 255) ** 2
    mu_a, mu_b = gaussian_filter(a, 1.5), gaussian_filter(b, 1.5)
    va = gaussian_filter(a * a, 1.5) - mu_a ** 2
    vb = gaussian_filter(b * b, 1.5) - mu_b ** 2
    cov = gaussian_filter(a * b, 1.5) - mu_a * mu_b
    m = ((2 * mu_a * mu_b + c1) * (2 * cov + c2)) / ((mu_a ** 2 + mu_b ** 2 + c1) * (va + vb + c2))
    return float(m.mean())


def job_for(name, tmp):
    """a silent copy of the example, planned"""
    job = tmp / name
    job.mkdir(parents=True)
    src = SKILL / 'examples' / name
    shutil.copy(src / 'scenes.js', job / 'scenes.js')
    spec = json.loads((src / 'film.json').read_text())
    spec['voice'] = 'none'
    (job / 'film.json').write_text(json.dumps(spec, ensure_ascii=False))
    job, spec = scv.load(job)
    timing = scv.plan(job, spec)
    return job, spec, timing


def default_times(timing):
    ts, seen = [.5], set()
    steps = timing['steps']
    settle = lambda s: round(s['t0'] + min(s['dur'] - .05, max(.9, 1.4 / timing['speed'] + .35)), 2)
    for i, s in enumerate(steps):
        last = i + 1 == len(steps) or steps[i + 1]['ci'] != s['ci']
        if i == 0 or last:
            ts.append(settle(s))
    return sorted(set(ts))


def frames(job, spec, timing, times):
    from io import BytesIO
    from PIL import Image
    from playwright.sync_api import sync_playwright
    page = scv.write_page(job, spec, 'play', scv.page_timing(timing))
    out = []
    with sync_playwright() as p:
        b, pg, errors = scv.open_page(p, page, timing['W'], timing['H'])
        for t in times:
            data = pg.evaluate('t => { renderAt(t); return document.getElementById("cv").toDataURL("image/png"); }', t)
            im = Image.open(BytesIO(scv.b64(data))).convert('RGB')
            im = im.resize((THUMB, round(THUMB * im.height / im.width)), Image.LANCZOS)
            buf = BytesIO()                         # through the same JPEG as the stored frames, so like meets like
            im.save(buf, 'JPEG', quality=90)
            out.append(Image.open(BytesIO(buf.getvalue())).convert('RGB'))
        b.close()
    return out, errors


def run(update=False, examples=None, threshold=None):
    from PIL import Image, ImageChops
    manifest_f = GOLDEN / 'manifest.json'
    manifest = json.loads(manifest_f.read_text()) if manifest_f.exists() else {'threshold': THRESHOLD, 'thumb': THUMB, 'examples': {}}
    threshold = threshold or manifest.get('threshold', THRESHOLD)
    names = examples or EXAMPLES
    report = Path(tempfile.gettempdir()) / 'scv-golden-report'
    shutil.rmtree(report, ignore_errors=True)
    tmp = Path(tempfile.mkdtemp(prefix='scv-golden-'))
    bad, rows = [], []
    try:
        for name in names:
            job, spec, timing = job_for(name, tmp)
            entry = manifest['examples'].get(name)
            if update or not entry:
                if not update:
                    print(f'{name}: no baseline yet; run `scv.py golden --update`')
                    bad.append((name, None, 0))
                    continue
                times = default_times(timing)
            else:
                times = entry['times']
            ims, errors = frames(job, spec, timing, times)
            if errors:
                print(f'{name}: page errors:', *errors[:3], sep='\n  ')
            d = GOLDEN / name
            if update:
                shutil.rmtree(d, ignore_errors=True)
                d.mkdir(parents=True)
                for t, im in zip(times, ims):
                    im.save(d / f't{t:07.2f}.jpg', quality=95)
                manifest['examples'][name] = {'times': times, 'size': [timing['W'], timing['H']], 'duration': timing['duration']}
                print(f'{name}: stored {len(times)} frames')
                continue
            for t, im in zip(times, ims):
                f = d / f't{t:07.2f}.jpg'
                if not f.exists():
                    bad.append((name, t, 0))
                    continue
                ref = Image.open(f).convert('RGB')
                if ref.size != im.size:
                    s = 0.0
                else:
                    s = ssim(ref.convert('L'), im.convert('L'))
                rows.append((name, t, s))
                if s < threshold:
                    bad.append((name, t, s))
                    report.mkdir(exist_ok=True)
                    w, h = ref.size
                    side = Image.new('RGB', (w * 3 + 16, h), (40, 40, 40))
                    side.paste(ref, (0, 0))
                    if im.size == ref.size:
                        side.paste(im, (w + 8, 0))
                        diff = ImageChops.difference(ref, im).point(lambda v: min(255, v * 4))
                        side.paste(diff, (2 * w + 16, 0))
                    side.save(report / f'{name}-t{t:07.2f}.png')
        if update:
            GOLDEN.mkdir(parents=True, exist_ok=True)
            manifest['threshold'], manifest['thumb'] = threshold, THUMB
            manifest_f.write_text(json.dumps(manifest, indent=1) + '\n')
            print('baseline in', GOLDEN)
            return 0
        for name, t, s in rows:
            print(f'{name:8s} t={t:6.2f}  ssim {s:.4f}  {"ok" if s >= threshold else "REGRESSION"}')
        if bad:
            print(f'{len(bad)} regression(s) under {threshold}; side-by-sides (stored | now | difference x4) in {report}')
            return 1
        print(f'golden: {len(rows)} frames match (ssim >= {threshold})')
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('examples', nargs='*')
    ap.add_argument('--update', action='store_true')
    ap.add_argument('--threshold', type=float)
    a = ap.parse_args()
    sys.exit(run(a.update, a.examples or None, a.threshold))

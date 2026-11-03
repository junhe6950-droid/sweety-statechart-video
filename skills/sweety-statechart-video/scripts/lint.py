#!/usr/bin/env python3
"""Picture checks for a film, as numbers an agent can act on: scene ink on cards, words, arrows or the header; blank
paper (share of empty 40-unit tiles, aim at most 38%, and where the biggest holes are); near-solid blocks; ink spilling
off the poster; steps whose pictures never change; people off the 0.7–0.9 scale or not sharing a ground line; theme
contrast and colour-blind checks; error/final states with misleading pins.

  lint.py JOB [--no-steps] [--json]      (also: scv.py lint JOB)

Writes JOB/work/lint.json and prints one line per issue with a suggested fix. Exit status 1 when there are issues.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import scv  # noqa: E402


def lint(job, spec, steps=True, quiet=False):
    from playwright.sync_api import sync_playwright
    job = Path(job)
    page = scv.write_page(job, spec, 'layout')
    W, H = scv.frame_size(spec)
    with sync_playwright() as p:
        b, pg, errors = scv.open_page(p, page, W, H)
        rep = pg.evaluate(f'lintReport({{steps: {"true" if steps else "false"}}})')
        b.close()
    if errors:
        rep['issues'].append({'chapter': None, 'kind': 'page', 'fix': 'page errors: ' + '; '.join(errors[:3])})
    (job / 'work').mkdir(exist_ok=True)
    (job / 'work/lint.json').write_text(json.dumps(rep, ensure_ascii=False, indent=1))
    if not quiet:
        for c in rep['chapters']:
            cov = c['coverage']
            print(f"chapter {c['num']} {c['title']}: blank {cov['empty']:.0%}, solid {cov['solid']:.0%}, "
                  f"{len(c['overlap'])} overlaps, {len(c['still'])} still steps, {c['people']} people")
        for i in rep['issues']:
            where = f"[{i['chapter']}] " if i.get('chapter') else ''
            print(f"  {i['kind']:8s} {where}{i['fix']}")
        print(f"{len(rep['issues'])} issues; details in {job / 'work/lint.json'}")
    return rep


def main():
    if scv.need_render_python() and Path(scv.RENDER_PY).exists() and sys.executable != scv.RENDER_PY:
        import os
        os.execv(scv.RENDER_PY, [scv.RENDER_PY, __file__, *sys.argv[1:]])
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('job')
    ap.add_argument('--no-steps', action='store_true', help='skip the per-step change check (faster)')
    ap.add_argument('--json', action='store_true', help='print the report as JSON')
    a = ap.parse_args()
    job, spec = scv.load(a.job)
    rep = lint(job, spec, steps=not a.no_steps, quiet=a.json)
    if a.json:
        print(json.dumps(rep, ensure_ascii=False, indent=1))
    sys.exit(1 if rep['issues'] else 0)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Engine checks across shapes, themes and looks (like statechart-art's "every screen shape" test): the takeout example
lays out at six aspect ratios with no page errors and every card on its poster; each theme and each card look builds
and draws a poster; the rules legend and the fix draw; lint runs. Silent, needs only the render venv.

  test_engine.py [--keep]
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import scv  # noqa: E402

ASPECTS = ['9:16', '3:4', '1:1', '4:5', '16:9', '2.35:1']
THEMES = ['crayon', 'pencil', 'night', 'kraft', 'riso', 'linen', 'season:autumn', {'base': 'crayon', 'paper': 'grid'}]
LOOKS = ['ticket', 'note', 'sign', 'soft', 'plate', 'tag', 'slide', 'patch']


BROWSER = {}


def page_check(job, spec, js):
    """one shared browser; a fresh page per film"""
    page = scv.write_page(job, spec, 'layout')
    W, H = scv.frame_size(spec)
    if 'b' not in BROWSER:
        from playwright.sync_api import sync_playwright
        BROWSER['p'] = sync_playwright().start()
        args = ['--allow-file-access-from-files', '--disable-web-security']
        try:
            BROWSER['b'] = BROWSER['p'].chromium.launch(channel='chrome', args=args)
        except Exception:
            BROWSER['b'] = BROWSER['p'].chromium.launch(args=args)
    pg = BROWSER['b'].new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(page.as_uri())
    pg.wait_for_function('window.ENGINE_READY === true || !!window.ENGINE_ERROR', timeout=120000)
    err = pg.evaluate('window.ENGINE_ERROR || null')
    if err:
        errors.append(err.splitlines()[0])
        out = None
    else:
        out = pg.evaluate(js)
    pg.close()
    return out, errors


def main():
    if scv.need_render_python() and Path(scv.RENDER_PY).exists() and sys.executable != scv.RENDER_PY:
        import os
        os.execv(scv.RENDER_PY, [scv.RENDER_PY, __file__, *sys.argv[1:]])
    tmp = Path(tempfile.mkdtemp(prefix='scv-engine-'))
    src = scv.SKILL / 'examples/takeout'
    fails = []
    base = json.loads((src / 'film.json').read_text())
    base['voice'] = 'none'
    shutil.copy(src / 'scenes.js', tmp / 'scenes.js')
    js_fit = """(() => { const f = window.__film; const bad = [];
      f.chapters.forEach(ch => Object.values(ch.L.boxes).forEach(b => { if (b.x - b.w / 2 < 0 || b.x + b.w / 2 > f.W || b.y < 0 || b.y > f.H) bad.push(ch.num + ':' + b.id); }));
      return { W: f.W, H: f.H, bad, png: window.layoutImages(false).length }; })()"""
    for a in ASPECTS:
        spec = dict(base, aspect=a)
        (tmp / 'film.json').write_text(json.dumps(spec, ensure_ascii=False))
        out, errors = page_check(tmp, spec, js_fit)
        ok = bool(out) and not errors and not out['bad'] and out['png'] == len(spec['chapters'])
        print(f"aspect {a:7s} poster {(out or {}).get('W')}x{(out or {}).get('H')}  {'ok' if ok else 'FAIL'} {errors[:2]} {(out or {}).get('bad', [])[:4]}")
        if not ok:
            fails.append(f'aspect {a}')
    one = dict(base, chapters=base['chapters'][:1])
    for th in THEMES:
        spec = dict(one, theme=th)
        (tmp / 'film.json').write_text(json.dumps(spec, ensure_ascii=False))
        out, errors = page_check(tmp, spec, "window.layoutImages(false).length")
        print(f"theme  {json.dumps(th, ensure_ascii=False):24s} {'ok' if not errors and out == 1 else 'FAIL'} {errors[:2]}")
        if errors or out != 1:
            fails.append(f'theme {th}')
    for lk in LOOKS:
        spec = dict(one, look=lk)
        (tmp / 'film.json').write_text(json.dumps(spec, ensure_ascii=False))
        out, errors = page_check(tmp, spec, "window.layoutImages(false).length")
        print(f"look   {lk:24s} {'ok' if not errors and out == 1 else 'FAIL'} {errors[:2]}")
        if errors or out != 1:
            fails.append(f'look {lk}')
    # the rule chapter with a fix and a legend, drawn at the fix step
    rule = dict(base, chapters=base['chapters'][3:4])
    ch = rule['chapters'][0]
    ch['steps'][0]['go'] = 'start' if not ch.get('start') is None else ch['steps'][0].get('go')
    ch['rule']['fix'] = {'edge': 'soggy>served', 'if': '出餐检查', 'stamp': '修好了'}
    ch['steps'][-2]['fix'] = True
    (tmp / 'film.json').write_text(json.dumps(rule, ensure_ascii=False))
    out, errors = page_check(tmp, rule, "(() => { const ch = window.__film.chapters[0]; return { legend: !!ch.L.legend, fixAt: ch.fixAt, png: window.layoutImages(false).length }; })()")
    ok = bool(out) and not errors and out['legend'] and out['fixAt'] >= 0
    print(f"rule legend + fix  {'ok' if ok else 'FAIL'} {out} {errors[:2]}")
    if not ok:
        fails.append('rule legend/fix')
    if 'b' in BROWSER:
        BROWSER['b'].close()
        BROWSER['p'].stop()
    if '--keep' not in sys.argv:
        shutil.rmtree(tmp, ignore_errors=True)
    if fails:
        raise SystemExit('FAIL: ' + ', '.join(fails))
    print('engine checks passed')


if __name__ == '__main__':
    main()

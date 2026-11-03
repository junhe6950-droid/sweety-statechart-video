#!/usr/bin/env python3
"""sweety-statechart-video: animated crayon statecharts, played like Ann Nguyen's "the making of nhang".
A film is a film.json (chapters: states, arrows, steps with captions) and a scenes.js (the living pictures around
each chart, drawn in JavaScript with the crayon kit). Narration in one of the skill's own voices; 3:4 by default.

usage: scv.py <command> JOB [options]
  new       JOB [--title T]   a job folder with a film.json and scenes.js to fill in
  check     JOB               structure, step references, captions, the rule checker (it finds the red path)
  layout    JOB               every chapter's finished poster with a grid + free areas (work/layout/), for scenes.js
  lines     JOB               work/lines.json: one narration line per captioned step
  voice     JOB [--redo ID]   synthesize, gate and ASR-check the lines (scripts/voice.py, MLX Python)
  plan      JOB               step times (from the voice, or the reference pace), work/timing.json + timeline.json
  stills    JOB [--at t,..]   frames to work/stills/ + contact sheet (default: late in every step)
  render    JOB [--workers N] [--start S --end E]   frames -> work/render/video.mp4
  posters   JOB               finished posters -> outputs/posters/, outputs/cover.png
  finalize  JOB               sound (voice / music / sfx) + mux -> outputs/film.mp4, captions.srt, script.txt
  all       JOB               check, lines, voice, plan, render, posters, finalize
  batch     JOB [JOB...]      `all` for each job, then a summary
  voices                      list the voices
  add-voice ID --audio F --text T --consent self|authorized [--start S --end E] [--preview]
                              add your own voice (scripts/add_voice.py)
"""
import argparse
import base64
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import modelcheck

SKILL = Path(__file__).resolve().parent.parent
ENGINE = SKILL / 'engine'
CRAYON = ENGINE / 'crayon'
FONTS = ENGINE / 'fonts'
SCRIPTS = SKILL / 'scripts'
OWN_VENV = Path.home() / '.local/share/sweety-statechart-video/venv/bin/python'      # made by scripts/setup.sh
RENDER_PY = os.environ.get('SCV_PYTHON') or str(OWN_VENV if OWN_VENV.exists() else Path.home() / '.local/share/sweety-handdraw-video/venv/bin/python')
MLX_PY = os.environ.get('STATECHART_MLX_PYTHON', str(Path.home() / '.local/share/voxcpm2-mlx/.venv/bin/python3'))
ASPECT_RE = re.compile(r'^\s*(\d+(?:\.\d+)?)\s*[:：x×/]\s*(\d+(?:\.\d+)?)\s*$')
RATIO_LIMITS = (0.4, 2.5)                       # height / width


def aspect_ratio(text):
    """'3:4', '16:9', '2.35:1', '4x5', '9／16' -> height / width, or None when unreadable or too extreme."""
    m = ASPECT_RE.match(str(text or '3:4').replace('／', '/'))
    if not m or float(m[1]) <= 0 or float(m[2]) <= 0:
        return None
    r = float(m[2]) / float(m[1])
    return r if RATIO_LIMITS[0] <= r <= RATIO_LIMITS[1] else None


def frame_size(spec):
    """(W, H) in pixels: an explicit "size", or the aspect with the short side at 1080 (both sides even)."""
    if spec.get('size'):
        w, h = spec['size']
        return int(w) // 2 * 2, int(h) // 2 * 2
    r = aspect_ratio(spec.get('aspect', '3:4')) or 4 / 3
    if r >= 1:
        return 1080, round(1080 * r / 2) * 2
    return round(1080 / r / 2) * 2, 1080
ENGINE_FILES = ['ink.js', 'chart.js', 'layout.js', 'people.js', 'props.js', 'film.js', 'player.js', 'main.js']
ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
CAPTION_MAX = 24
FPS = 30
DIGITS = re.compile(r'\d')
LEAD, GAP, CHAPTER_GAP, VOICE_AT = 1.0, .35, .25, .12
DURATION_DEFAULT = (120.0, 180.0)              # 2-3 minutes: what most short-video feeds reward
MAX_STRETCH = .7                                # at most this much extra hold per step to reach the target
READ_BASE, READ_CPS = .5, 7.                     # a silent step lasts at least this long: time to read its caption
SPOKEN = re.compile(r'[，。！？；：、“”‘’（）《》〈〉【】—…·,.!?;:"\'()\[\]\s↓→]')


def target_duration(spec):
    """(min, max) seconds from "duration": 150 | [120, 180] | "2-3分钟" | "90秒" | "1.5 min"; default 2-3 minutes."""
    d = spec.get('duration')
    if d is None:
        return DURATION_DEFAULT if voice_of(spec) else (0., 1e9)   # a silent film keeps the reference's brisk pace
    if isinstance(d, (int, float)):
        return (d * .9, d * 1.1)
    if isinstance(d, (list, tuple)) and len(d) == 2:
        return (float(d[0]), float(d[1]))
    text = str(d).lower()
    nums = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', text)]
    if not nums:
        return DURATION_DEFAULT
    unit = 60 if re.search(r'分|min|m\b', text) else 1
    lo, hi = (nums[0], nums[1]) if len(nums) > 1 else (nums[0] * .9, nums[0] * 1.1)
    return (lo * unit, hi * unit)


def voice_rate(spec):
    """characters per second of the film's voice (from the catalog; 5 when unknown)."""
    v = voice_of(spec)
    if not v:
        return None
    try:
        sys.path.insert(0, str(SCRIPTS))
        import audio_env
        return float(audio_env.voice_profile(v).get('chars_per_second') or 5.0)
    except SystemExit:
        return 5.0


def estimate_seconds(spec):
    """film length before any voice exists: the animation of each step, or its line read at the voice's pace."""
    sp, rate = speed_of(spec), voice_rate(spec)
    anim, allsteps, t = 3.6 / sp, steps_of(spec), LEAD
    for n, (ci, si, st) in enumerate(allsteps):
        d = anim
        if not rate and spec.get('read_pace', True):
            d = max(anim, READ_BASE + len(SPOKEN.sub('', st.get('note') or '')) / READ_CPS)
        if rate:
            chars = len(SPOKEN.sub('', st.get('say') or st.get('note') or ''))
            if chars:
                d = max(anim, VOICE_AT + chars / rate + .05 + GAP)
        if n + 1 == len(allsteps) or allsteps[n + 1][0] != ci:
            d += CHAPTER_GAP
        d += float(st.get('hold') or 0)
        t += d
    return t + 2.5 / sp + .8


def load(job):
    job = Path(job).resolve()
    return job, json.loads((job / 'film.json').read_text())


def voice_of(spec):
    v = spec.get('voice', 'crayon-sister')
    return None if v in (None, False, 'none', '') else v


def speed_of(spec):
    return float(spec.get('speed') or (2 if voice_of(spec) else 3))


def edge_ids(ch):
    seen, out = {}, []
    for e in ch.get('edges') or []:
        base = f"{e['from']}>{e['to']}"
        seen[base] = seen.get(base, 0) + 1
        out.append(e.get('id') or (base if seen[base] == 1 else f'{base}#{seen[base]}'))
    return out


def steps_of(spec):
    """(ci, si, step) for every step, in order."""
    out = []
    for ci, ch in enumerate(spec['chapters']):
        for si, st in enumerate(ch.get('steps') or []):
            out.append((ci, si, st if isinstance(st, dict) else {'note': st}))
    return out


def line_id(ci, si):
    return f'c{ci + 1}s{si + 1:02d}'


def go_list(st):
    go = st.get('go')
    return [] if go is None else go if isinstance(go, list) else [go]


# ------------------------------------------------------------------ check
def check(job, spec, quiet=False):
    errors, warnings = [], []
    chapters = spec.get('chapters') or []
    if not chapters:
        errors.append('film.json has no chapters')
    if not spec.get('size') and aspect_ratio(spec.get('aspect', '3:4')) is None:
        errors.append(f"aspect {spec.get('aspect')!r}: write it as W:H (for example 3:4, 9:16, 16:9, 4:5, 2.35:1), height/width between {RATIO_LIMITS[0]} and {RATIO_LIMITS[1]}")
    for ci, ch in enumerate(chapters):
        where = f'chapter {ci + 1} ({ch.get("title", "")})'
        states = ch.get('states') or {}
        if not isinstance(states, dict) or not states:
            errors.append(f'{where}: states must be a non-empty object {{id: {{label, tag, pin}}}}')
            continue
        regs = ch.get('regions')
        lanes = (regs or {}).get('lanes') or []
        box = (regs or {}).get('id', 'together') if regs else None
        for l in lanes:
            for s in l.get('states', []):
                if s not in states:
                    errors.append(f'{where}: lane {l.get("id")} lists {s}, which is not in states')
        known = set(states) | ({box} if box else set())
        ids = edge_ids(ch)
        for e in ch.get('edges') or []:
            for k in ('from', 'to'):
                v = e.get(k)
                if v not in known and not (k == 'to' and re.fullmatch(r'end\d*', str(v))):
                    errors.append(f'{where}: arrow {e.get("from")}>{e.get("to")}: unknown {k} {v!r}')
        if ch.get('start') and ch['start'] not in known:
            errors.append(f'{where}: start {ch["start"]!r} is not a state')
        if ch.get('exit') and ch['exit'].get('from') not in states:
            errors.append(f'{where}: exit.from {ch["exit"].get("from")!r} is not a state')
        if ch.get('exit') and ci == len(chapters) - 1:
            warnings.append(f'{where}: the last chapter has an exit arrow with nowhere to go')
        steps = ch.get('steps') or []
        if not steps:
            errors.append(f'{where}: no steps')
        refs_ok = set(ids) | {'start', 'entry'} | ({f"{ch['exit']['from']}>exit"} if ch.get('exit') else set())
        used = set()
        for si, st in enumerate(steps):
            st = st if isinstance(st, dict) else {'note': st}
            for r in go_list(st):
                if not (r in refs_ok or any(i.startswith(r + '#') for i in ids)):
                    errors.append(f'{where} step {si + 1}: go {r!r} matches no arrow (arrows: {", ".join(ids)})')
                used.add(r)
            note = st.get('note') or ''
            if len(note) > CAPTION_MAX:
                warnings.append(f'{where} step {si + 1}: caption has {len(note)} characters (keep to {CAPTION_MAX}): {note}')
            if st.get('voice'):
                try:
                    sys.path.insert(0, str(SCRIPTS))
                    import audio_env
                    if st['voice'] not in audio_env.voice_ids():
                        errors.append(f"{where} step {si + 1}: voice {st['voice']!r} unknown")
                except SystemExit:
                    pass
            said = st.get('say') or note
            if voice_of(spec) and DIGITS.search(said) and not any(k in said for k in (spec.get('say') or {})):
                warnings.append(f'{where} step {si + 1}: digits in a narrated line; add a "say" reading (VoxCPM2 does not read digits): {note}')
        never = [i for i in ids if not any(u == i or i.startswith(u + '#') for u in used)]
        if never:
            warnings.append(f'{where}: arrows never drawn by a step: {", ".join(never)}')
        if not any(r in ('start', 'entry') for st in steps for r in go_list(st if isinstance(st, dict) else {})):
            warnings.append(f'{where}: no step goes "start" (or "entry"), so the first card has no arrow in')
    model = []
    if not errors:
        model = modelcheck.check_film(spec)
        for m in model:
            where = f"chapter {m['chapter']}"
            if m.get('error'):
                warnings.append(f"{where}: checker: {m['error']}")
                continue
            ch = chapters[m['chapter'] - 1]
            if m.get('rule'):
                r = m['rule']
                if r['holds']:
                    warnings.append(f"{where}: rule never {r['never']} holds: no path reaches it, so there is no red path to show")
                elif not quiet:
                    print(f"{where}: the checker found the red path: {' > '.join(r['path'])}")
            reach = set()
            for cfg in (modelcheck.explore(modelcheck.chart_of(ch)) or {}).get('prev', {}):
                reach |= set(cfg)
            for s in ch.get('states', {}):
                if s not in reach:
                    warnings.append(f'{where}: state {s} cannot be reached from the start')
            multi = [s for s in m.get('stuck', []) if len(s) > 1]
            if multi:
                warnings.append(f"{where}: stuck combinations (no way out): {multi[:3]}")
    if not (job / 'scenes.js').exists():
        warnings.append('no scenes.js: the posters will have no pictures (see references/scenes.md)')
    if chapters and not errors:
        est, (lo, hi) = estimate_seconds(spec), target_duration(spec)
        nsteps = max(1, len(steps_of(spec)))
        per = est / nsteps
        if est < lo * .95:
            warnings.append(f'length: about {est:.0f} s, target {lo:.0f}-{hi:.0f} s. Add about {int((lo - est) / per) + 1} steps '
                            f'(another chapter, or 2-3 more steps per chapter), or give lines more words; or set "duration"')
        elif est > hi * 1.05:
            warnings.append(f'length: about {est:.0f} s, target {lo:.0f}-{hi:.0f} s. Cut about {int((est - hi) / per) + 1} steps or shorten lines; or set "duration"')
    v = voice_of(spec)
    if v:
        try:
            sys.path.insert(0, str(SCRIPTS))
            import audio_env
            if v not in audio_env.voice_ids():
                errors.append(f"voice {v!r} unknown; voices: {', '.join(audio_env.voice_ids())}")
        except SystemExit as e:
            warnings.append(f'voice catalog: {e}')
    res = {'errors': errors, 'warnings': warnings, 'model': model}
    if chapters and not errors:
        lo, hi = target_duration(spec)
        res['length'] = {'estimate_seconds': round(estimate_seconds(spec), 1), 'target_seconds': [round(lo), round(hi)], 'steps': len(steps_of(spec))}
    if not quiet:
        print(json.dumps({k: res[k] for k in ('errors', 'warnings', 'length') if k in res}, ensure_ascii=False, indent=1))
    return res


def resolved(spec):
    """film.json as the page needs it: rule paths filled in by the checker."""
    s = json.loads(json.dumps(spec))
    modelcheck.apply_found_paths(s)
    s['size'] = list(frame_size(spec))
    return s


# ------------------------------------------------------------------ pages
def font_css():
    def url(name):
        return (FONTS / name).as_uri()
    hand = f"url('{url('LXGWWenKai-500.woff')}') format('woff')"
    song = "local('STSongti-SC-Bold'), local('Songti SC Bold'), local('Noto Serif CJK SC Bold'), local('Source Han Serif SC Bold'), local('SimSun')"
    return f"""
@font-face {{ font-family: 'Special Elite'; src: url('{url('SpecialElite-Regular.ttf')}'); }}
@font-face {{ font-family: 'Courier Prime'; src: url('{url('CourierPrime-Regular.ttf')}'); font-style: normal; font-weight: 400; }}
@font-face {{ font-family: 'Courier Prime'; src: url('{url('CourierPrime-Italic.ttf')}'); font-style: italic; font-weight: 400; }}
@font-face {{ font-family: 'Courier Prime'; src: url('{url('CourierPrime-Bold.ttf')}'); font-style: normal; font-weight: 700; }}
@font-face {{ font-family: 'SCV Hand'; src: {hand}; font-style: normal; }}
@font-face {{ font-family: 'SCV Hand'; src: {hand}; font-style: italic; }}
@font-face {{ font-family: 'SCV Type'; src: {song}; }}
"""


def write_page(job, spec, mode='play', timing=None, opts=None):
    work = job / 'work'
    work.mkdir(exist_ok=True)
    (work / 'fonts.css').write_text(font_css())
    film = resolved(spec)
    data = (f"window.MODE = {json.dumps(mode)};\nwindow.FILM = {json.dumps(film, ensure_ascii=False)};\n"
            f"window.TIMING = {json.dumps(timing)};\nwindow.PLAYER_OPTS = {json.dumps(opts or spec.get('player') or {})};\n"
            "window.SCENES = window.SCENES || {};\n")
    (work / f'data-{mode}.js').write_text(data)
    scenes = (job / 'scenes.js').as_uri() if (job / 'scenes.js').exists() else None
    W, H = frame_size(spec)
    tags = '\n'.join(f'<script src="{(CRAYON / f).as_uri()}"></script>' for f in ENGINE_FILES[:-1])
    html = f"""<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fonts.css">
<style>html,body{{margin:0;background:#e9e3d6}} canvas{{display:block}}</style></head><body>
<canvas id="cv" width="{W}" height="{H}"></canvas>
<script src="data-{mode}.js"></script>
{tags}
{f'<script src="{scenes}"></script>' if scenes else ''}
<script src="{(CRAYON / 'main.js').as_uri()}"></script>
</body></html>"""
    page = work / f'page-{mode}.html'
    page.write_text(html)
    return page


def need_render_python():
    try:
        import playwright  # noqa
        return None
    except ImportError:
        return RENDER_PY


def open_page(p, page_html, W=1080, H=1440, timeout=180000):
    args = ['--allow-file-access-from-files', '--disable-web-security']
    try:
        b = p.chromium.launch(channel='chrome', args=args)          # the installed Google Chrome
    except Exception:
        b = p.chromium.launch(args=args)                            # or Playwright's own Chromium (setup.sh installs it)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto(page_html.as_uri())
    pg.wait_for_function('window.ENGINE_READY === true || !!window.ENGINE_ERROR', timeout=timeout)
    err = pg.evaluate('window.ENGINE_ERROR || null')
    if err:
        raise SystemExit('engine error:\n' + err + '\n' + '\n'.join(errors))
    return b, pg, errors


def b64(data):
    return base64.b64decode(data.split(',', 1)[1])


def contact(files, dest, tw=300, cols=6, labels=None):
    from PIL import Image, ImageDraw
    if not files:
        return
    ims = [Image.open(f) for f in files]
    th = int(tw * ims[0].height / ims[0].width)
    cols = min(cols, len(ims))
    rows = math.ceil(len(ims) / cols)
    sheet = Image.new('RGB', (cols * (tw + 8) + 8, rows * (th + 30) + 8), (40, 40, 40))
    d = ImageDraw.Draw(sheet)
    for i, (im, f) in enumerate(zip(ims, files)):
        x, y = 8 + (i % cols) * (tw + 8), 8 + (i // cols) * (th + 30)
        sheet.paste(im.convert('RGB').resize((tw, th)), (x, y))
        d.text((x + 4, y + th + 6), (labels[i] if labels else Path(f).stem), fill=(230, 230, 230))
    sheet.save(dest, quality=88)


# ------------------------------------------------------------------ layout
def layout(job, spec):
    from playwright.sync_api import sync_playwright
    page = write_page(job, spec, 'layout')
    out = job / 'work/layout'
    out.mkdir(parents=True, exist_ok=True)
    W, H = frame_size(spec)
    with sync_playwright() as p:
        b, pg, errors = open_page(p, page, W, H)
        rep = pg.evaluate('layoutReport()')
        imgs = pg.evaluate('layoutImages(true)')
        b.close()
    files = []
    for ci, data in enumerate(imgs):
        f = out / f'ch{ci + 1}.png'
        f.write_bytes(b64(data))
        files.append(f)
        (out / f'ch{ci + 1}.json').write_text(json.dumps(rep['chapters'][ci], ensure_ascii=False, indent=1))
    rep['page_errors'] = errors
    (out / 'report.json').write_text(json.dumps(rep, ensure_ascii=False, indent=1))
    contact(files, out / 'contact.jpg', tw=420, cols=4)
    for w in rep['warnings']:
        print('warning:', w)
    if errors:
        print('page errors:', *errors[:6], sep='\n  ')
    print(f'wrote {len(files)} layouts to {out} (chN.png with a 100-unit grid, chN.json with every card, arrow and free area)')
    return rep


# ------------------------------------------------------------------ narration
def write_lines(job, spec):
    v = voice_of(spec)
    lines = []
    for ci, si, st in steps_of(spec):
        text = (st.get('note') or '').strip()
        if not text and not st.get('say'):
            continue
        item = {'id': line_id(ci, si), 'text': text or st['say']}
        if st.get('say'):
            item['say'] = st['say']
        if st.get('voice'):
            item['voice'] = st['voice']
        lines.append(item)
    out = {'language': spec.get('language', 'zh'), 'voice': v, 'say': spec.get('say') or {}, 'lines': lines}
    if spec.get('voxcpm'):
        out['voxcpm'] = spec['voxcpm']
    (job / 'work').mkdir(parents=True, exist_ok=True)
    (job / 'work/lines.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print('wrote', job / 'work/lines.json', len(lines), 'lines, voice', v)
    return out


def voice(job, spec, redo=None):
    write_lines(job, spec)
    args = [str(job)] + (['--redo', redo] if redo else [])
    run_py('voice.py', *args, python=MLX_PY if Path(MLX_PY).exists() else None)


# ------------------------------------------------------------------ plan
def plan(job, spec):
    sp = speed_of(spec)
    anim = 3.6 / sp
    v = voice_of(spec)
    durs = {}
    if v:
        vj = job / 'work/audio/voice.json'
        if not vj.exists():
            raise SystemExit('narrated film without work/audio/voice.json: run `scv.py voice JOB` first (or set "voice": "none")')
        rep = json.loads(vj.read_text())
        if rep.get('failed'):
            raise SystemExit(f"voice.json has failed lines: {', '.join(rep['failed'])}; fix them with `scv.py voice JOB --redo ID`")
        durs = {k: x['dur'] for k, x in rep['lines'].items()}
    t = LEAD
    steps, lines = [], []
    allsteps = steps_of(spec)
    for n, (ci, si, st) in enumerate(allsteps):
        lid = line_id(ci, si)
        d = anim
        if lid in durs:
            d = max(anim, VOICE_AT + durs[lid] + GAP)
            lines.append({'id': lid, 'at': round(t + VOICE_AT, 3)})
        elif not v and spec.get('read_pace', True):        # silent: long enough to read the caption
            d = max(anim, READ_BASE + len(SPOKEN.sub('', st.get('note') or '')) / READ_CPS)
        last_of_chapter = n + 1 == len(allsteps) or allsteps[n + 1][0] != ci
        if last_of_chapter:
            d += CHAPTER_GAP
        d += float(st.get('hold') or 0)
        if n + 1 == len(allsteps):
            d += 2.5 / sp + .8
        steps.append({'id': lid, 'ci': ci, 'si': si, 't0': round(t, 3), 'dur': round(d, 3), 't1': round(t + d, 3),
                      'note': st.get('note') or '', 'tag': f"{ROMAN[ci]}.{si + 1}"})
        t += d
    total = round(t + .4, 3)
    lo, hi = target_duration(spec)
    stretch = 0.
    if total < lo and steps:
        stretch = min(MAX_STRETCH, (lo - total) / len(steps))
        shift = 0.
        for s_ in steps:
            s_['t0'] = round(s_['t0'] + shift, 3)
            s_['dur'] = round(s_['dur'] + stretch, 3)
            s_['t1'] = round(s_['t0'] + s_['dur'], 3)
            shift += stretch
        for line in lines:
            k = next(i for i, s_ in enumerate(steps) if s_['id'] == line['id'])
            line['at'] = round(steps[k]['t0'] + VOICE_AT, 3)
        total = round(total + shift, 3)
    W, H = frame_size(spec)
    timing = {'W': W, 'H': H, 'fps': int(spec.get('fps', FPS)), 'speed': sp, 'lead': LEAD, 'duration': total, 'total': total, 'voice': v, 'target': [lo, hi], 'steps': steps}
    (job / 'work').mkdir(exist_ok=True)
    (job / 'work/timing.json').write_text(json.dumps(timing, ensure_ascii=False, indent=1))
    sfx = [{'kind': 'pop', 'at': round(s['t0'] + .9 / sp, 3), 'gain_db': -6} for s in steps] if spec.get('sfx') else []
    music = spec.get('music') or None
    if isinstance(music, str):
        music = {'mood': music}
    (job / 'work/timeline.json').write_text(json.dumps({'duration': total, 'lines': lines, 'music': music, 'sfx': sfx}, ensure_ascii=False, indent=1))
    print(f'plan: {len(steps)} steps, {total:.1f} s at speed {sp:g}' + (f', {len(lines)} narrated lines' if lines else ', silent')
          + (f', +{stretch:.2f} s hold per step toward the target' if stretch else ''))
    if total < lo - 1 or total > hi + 1:
        print(f'note: {total:.0f} s is outside the target {lo:.0f}-{hi:.0f} s ("duration" in film.json); '
              + ('add steps or a chapter' if total < lo else 'cut steps') + ' to land inside it')
    return timing


def page_timing(timing):
    return {'lead': timing['lead'], 'total': timing['total'], 'steps': [{'t0': s['t0'], 'dur': s['dur']} for s in timing['steps']]}


# ------------------------------------------------------------------ stills, posters
def stills(job, spec, times=None, tw=300):
    from playwright.sync_api import sync_playwright
    timing = json.loads((job / 'work/timing.json').read_text())
    page = write_page(job, spec, 'play', page_timing(timing))
    labels = None
    if not times:
        times = [round(s['t0'] + min(s['dur'] - .05, max(.9, 1.4 / timing['speed'] + .35)), 2) for s in timing['steps']]
        labels = [f"{s['tag']} {s['t0']:.1f}s" for s in timing['steps']]
    out = job / 'work/stills'
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    files = []
    with sync_playwright() as p:
        b, pg, errors = open_page(p, page, timing['W'], timing['H'])
        for t in times:
            f = out / f't{t:07.2f}.jpg'
            f.write_bytes(b64(pg.evaluate(f'frameJPEG({t}, .9)')))
            files.append(f)
        b.close()
    if errors:
        print('page errors:', *errors[:5], sep='\n  ')
    contact(files, out / 'contact.jpg', tw, labels=labels)
    print('wrote', len(files), 'stills and', out / 'contact.jpg')
    return files


def posters(job, spec):
    from playwright.sync_api import sync_playwright
    from PIL import Image
    timing = json.loads((job / 'work/timing.json').read_text()) if (job / 'work/timing.json').exists() else None
    page = write_page(job, spec, 'play', page_timing(timing) if timing else None)
    out = job / 'outputs/posters'
    out.mkdir(parents=True, exist_ok=True)
    W, H = frame_size(spec)
    files = []
    with sync_playwright() as p:
        b, pg, errors = open_page(p, page, W, H)
        for ci in range(len(spec['chapters'])):
            f = out / f'{ci + 1:02d}.png'
            f.write_bytes(b64(pg.evaluate(f'posterPNG({ci})')))
            files.append(f)
        b.close()
    im = Image.open(files[0]).convert('RGB')
    im.resize((1080, round(1080 * im.height / im.width)), Image.LANCZOS).save(job / 'outputs/cover.png')
    print('wrote', len(files), 'posters to', out, 'and outputs/cover.png')
    return files


# ------------------------------------------------------------------ render
def render_chunk(job, spec, f0, f1, dest):
    """one browser renders frames [f0, f1) into one H.264 file; any failure exits non-zero (the parent retries)"""
    from playwright.sync_api import sync_playwright
    timing = json.loads((job / 'work/timing.json').read_text())
    W, H, fps = timing['W'], timing['H'], timing['fps']
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', str(fps), '-c:v', 'mjpeg', '-i', '-',
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-g', str(fps * 2), str(dest)]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    beat = Path(str(dest) + '.beat')
    beat.write_text('launch')
    with sync_playwright() as p:
        b, pg, errors = open_page(p, job / 'work/page-play.html', W, H)
        beat.write_text(f'ready {f0}')
        pg.set_default_timeout(30000)
        for f in range(f0, f1):
            ff.stdin.write(b64(pg.evaluate(f'frameJPEG({f / fps:.6f}, .94)')))
            if f % 15 == 0:
                beat.write_text(f'frame {f}')
        if errors:
            print('page errors:', *errors[:3], sep='\n  ', file=sys.stderr)
        ff.stdin.close()
        rc = ff.wait()
        beat.write_text('done' if rc == 0 else 'ffmpeg-failed')
        import threading  # closing Chrome can hang: try politely, never wait long
        th = threading.Thread(target=lambda: b.close(), daemon=True)
        th.start()
        th.join(8)
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(0 if rc == 0 else 3)


def render(job, spec, workers=6, start=0.0, end=None, chunk_seconds=8.0):
    """short chunks, each in its own process group with a heartbeat; a stuck or crashed browser is killed and its
    chunk rendered again"""
    import signal
    timing = json.loads((job / 'work/timing.json').read_text())
    write_page(job, spec, 'play', page_timing(timing))
    fps = timing['fps']
    dur = end or timing['duration']
    F0, F1 = round(start * fps), round(dur * fps)
    step = max(30, int(chunk_seconds * fps))
    seg = job / 'work/render/seg'
    if seg.exists():
        shutil.rmtree(seg)
    seg.mkdir(parents=True)
    todo = [(i, f, min(F1, f + step), seg / f'chunk{i:04d}.mp4', 0) for i, f in enumerate(range(F0, F1, step))]
    chunks = [t[3] for t in todo]
    running, t0, failed = [], time.time(), []
    while todo or running:
        while todo and len(running) < workers:
            i, a, b, dest, tries = todo.pop(0)
            log = open(seg / f'chunk{i:04d}.log', 'w')
            pr = subprocess.Popen([sys.executable, __file__, '_chunk', str(job), str(a), str(b), str(dest)], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            running.append([pr, (i, a, b, dest, tries), time.time() + 120 + (b - a) * 1.2, log, time.time(), -1])
        time.sleep(0.5)
        for item in running[:]:
            pr, task, deadline, log, _, _ = item
            rc = pr.poll()
            bf = Path(str(task[3]) + '.beat')
            state = bf.read_text() if bf.exists() else 'launch'
            if state != item[5]:
                item[4], item[5] = time.time(), state
            stalled = time.time() - item[4] > (150 if state == 'launch' else 60)
            if rc is None and state == 'done':
                rc = 0
            if rc is None and time.time() < deadline and not stalled:
                continue
            try:
                os.killpg(pr.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass
            if rc is None:
                print(f'chunk {task[0]}: {"stalled at " + str(item[5]) if stalled else "over time"}, killing its browser', flush=True)
                pr.wait()
                rc = 'timeout'
            log.close()
            running.remove(item)
            i, a, b, dest, tries = task
            if rc == 0 and dest.exists():
                print(f'chunk {i} frames {a}-{b} done ({time.time() - t0:.0f} s)', flush=True)
            elif tries < 3:
                print(f'chunk {i} failed ({rc}); retrying', flush=True)
                todo.append((i, a, b, dest, tries + 1))
            else:
                failed.append(i)
    if failed:
        raise SystemExit(f'render failed: chunks {failed} (see work/render/seg/*.log)')
    lst = seg / 'list.txt'
    lst.write_text(''.join(f"file '{c}'\n" for c in chunks))
    dest = job / 'work/render/video.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(dest)], check=True)
    print(f'wrote {dest} ({F1 - F0} frames in {time.time() - t0:.0f} s)')
    return dest


# ------------------------------------------------------------------ sound and delivery
def run_py(script, *args, python=None):
    cmd = [python or sys.executable, str(SCRIPTS / script), *map(str, args)]
    print('$', ' '.join(cmd), flush=True)
    r = subprocess.run(cmd)
    if r.returncode:
        raise SystemExit(f'{script} failed ({r.returncode})')


def sound(job, spec):
    """voice and/or music and/or sfx through mix.py; nothing for a silent film"""
    tl = json.loads((job / 'work/timeline.json').read_text())
    if not (tl['lines'] or tl.get('music') or tl.get('sfx')):
        return None
    py = RENDER_PY if Path(RENDER_PY).exists() else None
    a = job / 'work/audio'
    if not tl['lines'] and not (a / 'voice.json').exists():  # mix.py reads voice.json even for a music-only film
        a.mkdir(parents=True, exist_ok=True)
        (a / 'voice.json').write_text(json.dumps({'voice': None, 'lines': {}, 'failed': {}}))
    run_py('mix.py', job, python=py)
    return job / 'work/audio/mix.wav'


def srt_time(t):
    ms = int(round(t * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


def finalize(job, spec):
    work, outd = job / 'work', job / 'outputs'
    outd.mkdir(exist_ok=True)
    mix = sound(job, spec)
    video = work / 'render/video.mp4'
    timing = json.loads((work / 'timing.json').read_text())
    dest = outd / 'film.mp4'
    if mix and mix.exists():
        audio = ['-i', str(mix)]
    else:  # a silent track, so every platform accepts the file
        audio = ['-f', 'lavfi', '-t', str(timing['duration']), '-i', 'anullsrc=r=48000:cl=stereo']
    comment = 'comment=AI-generated narration (VoxCPM2 designed voice)' if voice_of(spec) else 'comment=sweety-statechart-video'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(video), *audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                    '-shortest', '-movflags', '+faststart', '-metadata', comment, str(dest)], check=True)
    (outd / 'editing').mkdir(exist_ok=True)
    rows = [f"{i + 1}\n{srt_time(s['t0'])} --> {srt_time(s['t1'])}\n{s['note']}\n" for i, s in enumerate(timing['steps']) if s['note']]
    (outd / 'editing/captions.srt').write_text('\n'.join(rows))
    (outd / 'script.txt').write_text('\n'.join(f"{s['tag']}  {s['note']}" for s in timing['steps']))
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', str(dest)], capture_output=True, text=True)
    print('delivered', dest, json.dumps(json.loads(probe.stdout or '{}').get('format', {})))
    return dest


def all_steps(job, spec, workers=6):
    res = check(job, spec, quiet=True)
    if res['errors']:
        print(json.dumps(res['errors'], ensure_ascii=False, indent=1))
        raise SystemExit('fix the errors in film.json first')
    if voice_of(spec):
        voice(job, spec)
    plan(job, spec)
    render(job, spec, workers=workers)
    posters(job, spec)
    return finalize(job, spec)


# ------------------------------------------------------------------ new job
SKELETON = {
    "title": "片名", "series": "系列名（每张海报的页眉）", "language": "zh", "aspect": "3:4", "voice": "crayon-sister",
    "chapters": [{
        "title": "第一章", "sub": "一句副标题", "tagline": "english words · 或者一行小字",
        "states": {"a": {"label": "状态甲", "tag": "state a", "pin": "pink"}, "b": {"label": "状态乙", "tag": "state b", "pin": "straw"}},
        "start": "a",
        "edges": [{"from": "a", "to": "b", "label": "发生了什么", "if": "条件"}],
        "steps": [{"go": "start", "note": "一句字幕，也是旁白"}, {"go": "a>b", "note": "下一句"}]
    }]
}
SCENES_SKELETON = """// scenes.js — the living pictures around each chapter's chart (see references/scenes.md).
// SCENES[n] = { bg($) {...static...}, fg($, S) {...every frame...} };  n = chapter number (1-based)
// $ = crayon kit bound to the poster (units: 1000 wide), S = {T, t, step, on(id), since(id), at(k), done}
SCENES[1] = {
  bg($) {
    $.ground(40, 420, 1180, 10, 'g1');
  },
  fg($, S) {
    $.sun(860, 120, 36, S.T);
  },
};
"""


def new_job(job, title=None):
    job = Path(job).resolve()
    job.mkdir(parents=True, exist_ok=True)
    sk = json.loads(json.dumps(SKELETON))
    if title:
        sk['title'] = title
    if not (job / 'film.json').exists():
        (job / 'film.json').write_text(json.dumps(sk, ensure_ascii=False, indent=1))
    if not (job / 'scenes.js').exists():
        (job / 'scenes.js').write_text(SCENES_SKELETON)
    print('new job', job)


def list_voices():
    sys.path.insert(0, str(SCRIPTS))
    import audio_env
    for path, cat in audio_env.catalogs():
        print(f'# {path}')
        for v in cat.get('voices', []):
            print(f"  {v['id']:28s} {v.get('name', ''):10s} {v.get('description', '')[:60]}")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'add-voice':         # its own options; handled by add_voice.py
        run_py('add_voice.py', *sys.argv[2:], python=MLX_PY if Path(MLX_PY).exists() else None)
        return
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd')
    ap.add_argument('jobs', nargs='*')
    ap.add_argument('--at')
    ap.add_argument('--width', type=int, default=300)
    ap.add_argument('--workers', type=int, default=6)
    ap.add_argument('--start', type=float, default=0.0)
    ap.add_argument('--end', type=float)
    ap.add_argument('--title')
    ap.add_argument('--redo')
    a = ap.parse_args()
    if a.cmd == 'voices':
        return list_voices()
    if a.cmd == 'new':
        return new_job(a.jobs[0], a.title)
    browser = ('layout', 'stills', 'render', 'posters', 'all', 'batch', '_chunk')
    if a.cmd in browser and need_render_python() and Path(RENDER_PY).exists() and sys.executable != RENDER_PY:
        os.execv(RENDER_PY, [RENDER_PY, __file__, *sys.argv[1:]])
    if a.cmd == '_chunk':
        job, spec = load(a.jobs[0])
        return render_chunk(job, spec, int(a.jobs[1]), int(a.jobs[2]), Path(a.jobs[3]))
    if a.cmd == 'batch':
        summary = []
        for j in a.jobs:
            t0 = time.time()
            try:
                job, spec = load(j)
                dest = all_steps(job, spec, workers=a.workers)
                summary.append({'job': str(job), 'ok': True, 'film': str(dest), 'seconds': round(time.time() - t0)})
            except SystemExit as e:
                summary.append({'job': j, 'ok': False, 'error': str(e)})
        print(json.dumps(summary, ensure_ascii=False, indent=1))
        return
    job, spec = load(a.jobs[0])
    if a.cmd == 'check':
        sys.exit(1 if check(job, spec)['errors'] else 0)
    elif a.cmd == 'layout':
        layout(job, spec)
    elif a.cmd == 'lines':
        write_lines(job, spec)
    elif a.cmd == 'voice':
        voice(job, spec, a.redo)
    elif a.cmd == 'plan':
        plan(job, spec)
    elif a.cmd == 'stills':
        stills(job, spec, times=[float(x) for x in a.at.split(',')] if a.at else None, tw=a.width)
    elif a.cmd == 'render':
        render(job, spec, workers=a.workers, start=a.start, end=a.end)
    elif a.cmd == 'posters':
        posters(job, spec)
    elif a.cmd == 'finalize':
        finalize(job, spec)
    elif a.cmd == 'all':
        all_steps(job, spec, workers=a.workers)
    else:
        ap.error(f'unknown command {a.cmd}')


if __name__ == '__main__':
    main()

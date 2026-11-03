#!/usr/bin/env python3
"""deliver.py: more outputs from one render. `scv.py deliver JOB [--what clips,longimage,html,gif,site,social]`;
`all` runs it with film.json "deliver": [...]. Needs `finalize` first (film.mp4, posters). Every file carries the
GB 45438 AIGC label (aigc.py).

  clips      outputs/clips/NN-<chapter>.mp4: one per chapter, cut at the chapter boundaries in timing.json, with the
             sound and a short fade from and to the paper
  longimage  outputs/longimage/long-N.jpg: the posters stacked, 1080 wide; a new part before it gets taller than 7200 px
  social     outputs/social/NN-1080.jpg (preview), NN-x.jpg (2048, x.com), NN-xhs.jpg (1242x1660, Xiaohongshu),
             NN-ig.jpg (1080x1350, Instagram): fitted and padded with the paper colour, never stretched
  gif        outputs/gif/NN-<chapter>.gif: each chapter looping, 540 wide, 8 fps, its own palette (480 wide and
             64 colours when that is over 10 MB)
  html       outputs/film.html: one self-contained file (engine, scenes, data, timing, fonts, the sound) in the player
             shell: play, steps, scrubber, speed, step-through. Works opened from disk
  site       outputs/site/: a gallery page, one section per chapter: poster with a layout overlay, the rules the
             checker ran, the chapter's film.json and Mermaid, long alt text, the chart as text, icons, a share card
"""
import base64
import html as H
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import aigc  # noqa: E402
import frames  # noqa: E402
import publish  # noqa: E402
import scv  # noqa: E402

ALL = ['clips', 'longimage', 'social', 'gif', 'html', 'site']
LONG_MAX = 7200                                  # px at 1080 wide: about 1:6.7, fine for WeChat, Weibo, Xiaohongshu
SOCIAL = {'1080': (1080, None), 'x': (2048, 2048), 'xhs': (1242, 1660), 'ig': (1080, 1350)}


def safe(name):
    return re.sub(r'[\\/:*?"<>|\s]+', '', name or '')[:24] or 'chapter'


def chapters(job, spec):
    """[(ci, title, t0, t1)] from timing.json: a chapter runs from its first step to the next chapter's first step"""
    timing = json.loads((job / 'work/timing.json').read_text())
    firsts = {}
    for s in timing['steps']:
        firsts.setdefault(s['ci'], s['t0'])
    cis = sorted(firsts)
    out = []
    for k, ci in enumerate(cis):
        t0 = 0.0 if k == 0 else firsts[ci]
        t1 = firsts[cis[k + 1]] if k + 1 < len(cis) else timing['duration']
        out.append((ci, spec['chapters'][ci].get('title') or f'chapter {ci + 1}', t0, t1))
    return out


def need(path, what):
    if not path.exists():
        raise SystemExit(f'deliver {what}: {path} is missing; run `scv.py finalize JOB` (and posters) first')
    return path


def source(job):
    """the best encode there is: the master, else the film"""
    m = job / 'outputs/film-master.mp4'
    return m if m.exists() else need(job / 'outputs/film.mp4', 'clips')


def posters(job, spec):
    files = sorted((job / 'outputs/posters').glob('[0-9][0-9].png'))
    if len(files) < len(spec['chapters']):
        files = scv.posters(job, spec)
    return files[:len(spec['chapters'])]


def paper(poster):
    """the poster's paper colour: the median of its outer border (themes change it)"""
    from PIL import Image
    im = Image.open(poster).convert('RGB')
    w, h = im.size
    px = [im.getpixel((x, y)) for x in range(0, w, max(1, w // 64)) for y in (2, h - 3)]
    px += [im.getpixel((x, y)) for y in range(0, h, max(1, h // 64)) for x in (2, w - 3)]
    return tuple(sorted(c[i] for c in px)[len(px) // 2] for i in range(3))


def hexc(rgb):
    return '0x%02x%02x%02x' % rgb


def save_jpeg(im, dest, label, q=90):
    im.convert('RGB').save(dest, quality=q, optimize=True, progressive=True)
    aigc.tag_jpeg(dest, label)


# ------------------------------------------------------------------ clips
def clips(job, spec, label):
    src = source(job)
    out = job / 'outputs/clips'
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    col = hexc(paper(posters(job, spec)[0]))
    comment = 'AI-generated narration (VoxCPM2 designed voice)' if scv.voice_of(spec) else 'sweety-statechart-video'   # as finalize
    meta = ['-metadata', f'comment={comment}', *aigc.ffmpeg_args(label), '-movflags', '+faststart+use_metadata_tags']

    def one(c):
        ci, title, t0, t1 = c
        d, f = t1 - t0, .35
        dest = out / f'{ci + 1:02d}-{safe(title)}.mp4'
        vf = f'fade=t=in:st=0:d={f}:color={col},fade=t=out:st={d - f:.3f}:d={f}:color={col}'
        af = f'afade=t=in:st=0:d={f},afade=t=out:st={d - f:.3f}:d={f}'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t0:.3f}', '-i', str(src), '-t', f'{d:.3f}', '-vf', vf, '-af', af,
                        *frames.FILM, '-g', '60', *frames.COLOR, '-c:a', 'aac', '-b:a', '192k', *meta, str(dest)], check=True)
        return dest
    with ThreadPoolExecutor(2) as ex:
        done = list(ex.map(one, chapters(job, spec)))
    print('clips:', ', '.join(f.name for f in done))
    return done


# ------------------------------------------------------------------ images
def longimage(job, spec, label):
    from PIL import Image
    out = job / 'outputs/longimage'
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    ims = []
    for f in posters(job, spec):
        im = Image.open(f).convert('RGB')
        ims.append(im.resize((1080, round(1080 * im.height / im.width)), Image.LANCZOS))
    parts, cur = [], []
    for im in ims:
        if cur and sum(x.height for x in cur) + im.height > LONG_MAX:
            parts.append(cur)
            cur = []
        cur.append(im)
    parts.append(cur)
    files = []
    for k, part in enumerate(parts):
        canvas = Image.new('RGB', (1080, sum(x.height for x in part)), paper(posters(job, spec)[0]))
        y = 0
        for im in part:
            canvas.paste(im, (0, y))
            y += im.height
        dest = out / (f'long-{k + 1}.jpg' if len(parts) > 1 else 'long.jpg')
        save_jpeg(canvas, dest, label, q=88)
        files.append(dest)
    print('longimage:', ', '.join(f'{f.name} ({f.stat().st_size / 1e6:.1f} MB)' for f in files))
    return files


def fit(im, w, h, bg):
    """contain im in w x h (h None: keep the aspect), padded with bg"""
    from PIL import Image
    if h is None:
        return im.resize((w, round(w * im.height / im.width)), Image.LANCZOS)
    if w == h == 2048:                            # x.com: longest side 2048, no padding
        k = 2048 / max(im.size)
        return im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    k = min(w / im.width, h / im.height)
    sm = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    canvas = Image.new('RGB', (w, h), bg)
    canvas.paste(sm, ((w - sm.width) // 2, (h - sm.height) // 2))
    return canvas


def social(job, spec, label):
    from PIL import Image
    out = job / 'outputs/social'
    out.mkdir(parents=True, exist_ok=True)
    files = []
    for f in posters(job, spec):
        im, bg = Image.open(f).convert('RGB'), paper(f)
        for key, (w, h) in SOCIAL.items():
            dest = out / f'{f.stem}-{key}.jpg'
            save_jpeg(fit(im, w, h, bg), dest, label)
            files.append(dest)
    print(f'social: {len(files)} images in {out} (1080, x 2048, xhs 1242x1660, ig 1080x1350)')
    return files


# ------------------------------------------------------------------ gif
GIF_MAX = 10e6                                   # GitHub's limit for an image in an issue or PR
GIF_TRIES = [(540, 8, 96), (480, 8, 64)]           # (width, fps, colours): the boil redraws every line 5 times a second,
                                                 # so frames barely compress; the second try keeps a 20 s chapter under 10 MB


def gif(job, spec, label):
    src = source(job)
    out = job / 'outputs/gif'
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    files = []
    for ci, title, t0, t1 in chapters(job, spec):
        dest = out / f'{ci + 1:02d}-{safe(title)}.gif'
        for width, fps, colors in GIF_TRIES:
            vf = (f'fps={fps},scale={width}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors={colors}:stats_mode=full[p];'
                  '[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t0:.3f}', '-t', f'{t1 - t0:.3f}', '-i', str(src),
                            '-filter_complex', vf, '-loop', '0', str(dest)], check=True)
            if dest.stat().st_size <= GIF_MAX:
                break
        aigc.tag_gif(dest, label)
        files.append(dest)
    print('gif:', ', '.join(f'{f.name} ({f.stat().st_size / 1e6:.1f} MB)' for f in files))
    return files


# ------------------------------------------------------------------ html
def audio_m4a(job, label):
    """the mix as AAC in an M4A, labelled (moov.udta.meta AIGC), for the HTML export; None for a silent film"""
    mix = job / 'work/audio/mix.wav'
    if not mix.exists():
        return None
    dest = job / 'work/audio/mix.m4a'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(mix), '-c:a', 'aac', '-b:a', '128k', *aigc.ffmpeg_args(label),
                    '-movflags', '+faststart+use_metadata_tags', str(dest)], check=True)
    return dest


def html_export(job, spec, label, dest=None):
    import preview
    page = preview.play_page(job, spec)
    m4a = audio_m4a(job, label)
    audio = 'data:audio/mp4;base64,' + base64.b64encode(m4a.read_bytes()).decode() if m4a else None
    text = preview.shell_html(job, spec, page, inline=True, audio=audio)
    tag = f'<meta name="AIGC" content="{H.escape(aigc.value(label))}">'
    text = text.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + tag, 1)
    dest = dest or job / 'outputs/film.html'
    dest.write_text(text)
    print(f'html: {dest} ({dest.stat().st_size / 1e6:.1f} MB, ' + ('with sound' if m4a else 'silent') + ')')
    return dest


# ------------------------------------------------------------------ site
SITE_CSS = """:root { --paper: #f5f1e8; --ground: #e9e3d6; --ink: #2b2622; --ink-2: #6b625a; --red: #c8372d; --green: #2f6b3a;
  --blue: #1b4fd1; --rule: #d6cdbd; --code: #efe9dc; --hand: 'Kaiti SC', 'STKaiti', 'KaiTi', serif;
  --sans: 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', system-ui, sans-serif; --mono: ui-monospace, 'SF Mono', Menlo, monospace; color-scheme: light; }
* { box-sizing: border-box; }
html { background: var(--ground); color: var(--ink); font: 400 1.0625rem/1.7 var(--sans); -webkit-text-size-adjust: 100%; }
body { margin: 0; }
main { max-width: 1120px; margin: 0 auto; padding: 48px clamp(16px, 4vw, 48px) 72px; }
h1, h2, h3, h4 { font-family: var(--hand); font-weight: 700; line-height: 1.2; margin: 0; }
p { margin: 0; }
a { color: var(--red); text-underline-offset: .18em; }
a:focus-visible, button:focus-visible, summary:focus-visible, pre:focus-visible { outline: 2px solid var(--red); outline-offset: 3px; }
img, svg { display: block; max-width: 100%; height: auto; }
code, pre { font-family: var(--mono); }
.top { max-width: 46rem; }
.kicker { color: var(--ink-2); letter-spacing: .08em; }
.top h1 { font-size: clamp(2.2rem, 7vw, 3.8rem); margin-top: 4px; }
.lede { margin-top: 16px; color: var(--ink-2); font-size: 1.1rem; }
.links { margin-top: 12px; }
.links a { margin-right: 1.2em; font-weight: 600; }
.plates { margin-top: 44px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); gap: 56px 40px; }
.plate { margin: 0; }
.frame { position: relative; box-shadow: 0 0 0 1px var(--rule), 0 6px 24px rgba(60, 40, 10, .1); background: var(--paper); }
.frame img { width: 100%; }
.frame svg.over { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity .25s; pointer-events: none; }
.plate.overlay .frame svg.over { opacity: 1; }
.plate figcaption { margin-top: 14px; }
.num { font-family: var(--mono); color: var(--red); margin-right: .45em; }
.plate h2 { display: inline; font-size: 1.8rem; }
.sub { font-family: var(--hand); color: var(--ink-2); margin-top: 2px; font-size: 1.15rem; }
.desc { margin-top: 8px; color: var(--ink-2); }
.tools { margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap; }
.tools button { font: inherit; font-size: .95rem; padding: 3px 12px; background: var(--paper); color: var(--ink); border: 1.5px solid var(--ink); border-radius: 6px; cursor: pointer; }
.tools button[aria-pressed="true"] { background: var(--blue); border-color: var(--blue); color: #fff; }
details { margin-top: 10px; }
summary { cursor: pointer; color: var(--ink-2); }
details p, details pre { margin-top: 8px; }
.how { margin-top: 88px; padding-top: 32px; border-top: 1px solid var(--rule); }
.how > h2 { font-size: clamp(1.8rem, 4vw, 2.4rem); }
.steps { margin: 18px 0 0; padding-left: 1.4em; max-width: 46rem; }
.steps li { margin-top: 8px; }
.made { margin-top: 52px; padding-top: 24px; border-top: 1px solid var(--rule); }
.made h3 { font-size: 1.6rem; }
.stats { margin-top: 6px; color: var(--ink-2); }
.rules { list-style: none; margin: 12px 0 0; padding: 0; max-width: 46rem; }
.rules li { display: flex; gap: 10px; align-items: baseline; margin-top: 6px; }
.rules .mark { flex: none; width: 1.1em; font-weight: 700; }
.rules .holds .mark::before { content: "\\2713"; color: var(--green); }
.rules .broken .mark::before { content: "\\2717"; color: var(--red); }
.rules .info .mark::before { content: "\\00B7"; color: var(--ink-2); }
.row { margin-top: 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 20px; align-items: start; }
.row figure { margin: 0; min-width: 0; }
.row figcaption { margin-top: 8px; font-size: .95rem; color: var(--ink-2); }
pre { margin: 0; padding: 14px 16px; max-height: 420px; overflow: auto; background: var(--code); font-size: .8rem; line-height: 1.5; white-space: pre; }
pre.wrap { white-space: pre-wrap; overflow-wrap: anywhere; }
.foot { margin-top: 80px; padding-top: 20px; border-top: 1px solid var(--rule); color: var(--ink-2); max-width: 46rem; font-size: .95rem; }
@media (max-width: 720px) { main { padding-top: 32px; } pre { max-height: 320px; } }
@media (prefers-reduced-motion: reduce) { .frame svg.over { transition: none; } }
"""
SITE_JS = """document.querySelectorAll('.plate').forEach(p => { const b = p.querySelector('button.overlay');
  if (b) b.onclick = () => { const on = !p.classList.contains('overlay'); p.classList.toggle('overlay', on); b.setAttribute('aria-pressed', on); }; });"""

OG_JS = """async (o) => {
  const C = window.SCV.C, F = window.SCV.FONT || {}, c = document.createElement('canvas'); c.width = 1200; c.height = 630;
  const title = F.type || '"SCV Type", serif', mono = F.mono || '"Courier Prime", "SCV Hand", monospace';   // the posters' faces
  const g = c.getContext('2d');
  g.fillStyle = C.paper || '#f5f1e8'; g.fillRect(0, 0, 1200, 630);
  const img = new Image(); img.src = o.poster; await img.decode();
  const h = 560, w = h * img.width / img.height;
  g.save(); g.translate(60 + w / 2, 315); g.rotate(-1.5 * Math.PI / 180);
  g.fillStyle = 'rgba(60,40,10,.18)'; g.fillRect(-w / 2 + 8, -h / 2 + 10, w, h);
  g.drawImage(img, -w / 2, -h / 2, w, h); g.strokeStyle = C.ink || '#2b2622'; g.lineWidth = 2; g.strokeRect(-w / 2, -h / 2, w, h); g.restore();
  const x = 60 + w + 60, maxw = 1200 - x - 50;
  g.fillStyle = C.red || '#c8372d'; g.font = `26px ${mono}`; g.fillText(o.kicker, x, 120);
  let fs = 80; g.font = `bold ${fs}px ${title}`; while (g.measureText(o.title).width > maxw && fs > 40) { fs -= 2; g.font = `bold ${fs}px ${title}`; }
  g.fillStyle = C.inkD || C.ink || '#2b2622'; g.fillText(o.title, x, 120 + fs + 10);
  g.font = `italic 30px ${mono}`; g.fillStyle = C.navy || '#2140d6';
  o.lines.slice(0, 6).forEach((t, i) => { let s = t; while (g.measureText(s).width > maxw && s.length > 2) s = s.slice(0, -2) + '…'; g.fillText(s, x, 120 + fs + 80 + i * 46); });
  g.font = `22px ${mono}`; g.fillStyle = '#6b625a'; g.fillText(o.foot, x, 585);
  return c.toDataURL('image/png');
}"""


def overlay_svg(ch, W, Hh, desc):
    """the layout under the drawing, in blue: cards, containers, arrows with heads, word boxes; free areas in green"""
    def r(v):
        return round(v, 1)
    out = [f'<svg class="over" viewBox="0 0 {W} {Hh}" role="img" aria-label="{H.escape(desc)}"><rect width="{W}" height="{Hh}" fill="#fff" fill-opacity=".55"/>',
           '<g fill="none" stroke="#1b4fd1" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">']
    for k in ch.get('containers') or []:
        out.append(f'<rect x="{r(k["x0"])}" y="{r(k["y0"])}" width="{r(k["x1"] - k["x0"])}" height="{r(k["y1"] - k["y0"])}" rx="14" stroke-dasharray="8 6"/>')
        for g in k.get('regions') or []:
            out.append(f'<rect x="{r(g["x0"])}" y="{r(g["y0"])}" width="{r(g["x1"] - g["x0"])}" height="{r(g["y1"] - g["y0"])}" rx="10" stroke-opacity=".5"/>')
    for b in (ch.get('boxes') or {}).values():
        out.append(f'<rect x="{r(b["x0"])}" y="{r(b["y0"])}" width="{r(b["x1"] - b["x0"])}" height="{r(b["y1"] - b["y0"])}" rx="8" fill="#1b4fd1" fill-opacity=".12"/>')
    for e in ch.get('edges') or []:
        pts = e.get('pts') or []
        if len(pts) < 2:
            continue
        out.append('<polyline points="' + ' '.join(f'{p[0]},{p[1]}' for p in pts) + '"/>')
        (x0, y0), (x1, y1) = pts[-2], pts[-1]
        dx, dy = x1 - x0, y1 - y0
        n = max(1e-6, (dx * dx + dy * dy) ** .5)
        ux, uy = dx / n, dy / n
        a = (x1 - 14 * ux + 6 * uy, y1 - 14 * uy - 6 * ux)
        b = (x1 - 14 * ux - 6 * uy, y1 - 14 * uy + 6 * ux)
        out.append(f'<polygon points="{r(x1)},{r(y1)} {r(a[0])},{r(a[1])} {r(b[0])},{r(b[1])}" fill="#1b4fd1"/>')
        w = e.get('words')
        if w and w.get('box'):
            x0_, y0_, x1_, y1_ = w['box']
            out.append(f'<rect x="{x0_}" y="{y0_}" width="{x1_ - x0_}" height="{y1_ - y0_}" stroke-dasharray="3 3" stroke-width="1.2"/>')
    for d in (ch.get('dots') or {}).values():
        out.append(f'<circle cx="{d["x"]}" cy="{d["y"]}" r="7" fill="#1b4fd1"/>')
    out.append('</g><g fill="none" stroke="#2f8a4a" stroke-width="1.6" stroke-dasharray="6 5">')
    for i, f in enumerate(ch.get('free') or []):
        out.append(f'<rect x="{r(f["x0"] + 3)}" y="{r(f["y0"] + 3)}" width="{r(f["x1"] - f["x0"] - 6)}" height="{r(f["y1"] - f["y0"] - 6)}"/>')
    out.append('</g></svg>')
    return ''.join(out)


def mermaid(job, spec, ci):
    """the chapter in Mermaid: area A's exporter when this skill has it (statechart_io), else a plain stateDiagram"""
    try:
        import statechart_io                                   # area A's exporter, one chapter at a time
        one = dict(spec, chapters=[spec['chapters'][ci]])
        return statechart_io.export_film(one, 'mermaid'), True
    except Exception:
        pass
    ch = spec['chapters'][ci]

    def mid(x):
        return re.sub(r'\W', '_', x)
    lines = ['stateDiagram-v2'] + [f'    {mid(k)} : {v.get("label", k)}' for k, v in (ch.get('states') or {}).items()]
    for g in publish.regions(ch):
        lines.append(f'    state "{publish.label(ch, g["id"])}" as {mid(g["id"])} {{')
        for k, l in enumerate(g.get('lanes') or []):
            if k:
                lines.append('        --')
            first = l.get('start') or (l.get('states') or [None])[0]
            if first:
                lines.append(f'        [*] --> {mid(first)}')
            lines += [f'        {mid(s)}' for s in l.get('states') or [] if s != first]
        lines.append('    }')
    if ch.get('start'):
        lines.append(f'    [*] --> {mid(ch["start"])}')
    for e in ch.get('edges') or []:
        to = '[*]' if e['to'] == 'end' else mid(e['to'])
        words = (e.get('label') or '') + (f' [{e["if"]}]' if e.get('if') else '')
        lines.append(f'    {mid(e["from"])} --> {to}' + (f' : {words}' if words else ''))
    return '\n'.join(lines), False


def checked(spec, film):
    """per chapter: (configurations, transitions, [(ok, words)], stuck)"""
    import modelcheck
    res = []
    for ch, r in zip(film['chapters'], modelcheck.check_film(spec)):
        rules = []
        def say(x, res_):                                     # one rule in words: what it says, what the checker found
            what = x.get('text') or (f'永远不会到「{publish.label(ch, x["never"])}」' if x.get('never') else
                                     f'一直满足 {x["always"]}' if x.get('always') else '不会卡住' if x.get('stuck') is False else '规则')
            if res_.get('holds'):
                return True, what
            found = f'{what}——打破了：{res_.get("steps", "?")} 步就能走到，最短的那条路用红线画在图上'
            fx, fixed = x.get('fix') or {}, res_.get('fixed') or {}
            if fx and fixed.get('holds'):
                found += f'；加上「{fx.get("if") or fx.get("when") or fx.get("edge")}」以后，检查器确认它成立了'
            return False, found
        if ch.get('rule'):
            rr = dict(ch['rule'], **{k: v for k, v in (r.get('rule') or {}).items() if k in ('holds', 'steps', 'fixed')})
            rules.append(say(ch['rule'], rr))
        for x in ch.get('rules') or []:                       # area A: rules[i].result
            if x is ch.get('rule') or (ch.get('rule') and x.get('never') == ch['rule'].get('never') and not x.get('stuck') is False):
                continue
            rules.append(say(x, x.get('result') or {}))
        info = ch.get('checked') or {}
        res.append((info.get('states', r.get('configurations')), info.get('steps', r.get('transitions')), rules, r.get('stuck') or []))
    return res


def kind_of(ch):
    regs = publish.regions(ch)
    if ch.get('rule'):
        return '一条会被打破的规则，和走到那里的路' if ch['rule'].get('path') else '一条规则，检查器确认它在每一处都成立'
    if any(len(g.get('lanes') or []) > 1 for g in regs):
        return '两件事同时进行'
    if regs:
        return '一个带父状态的图'
    loops = any(e['from'] == e['to'] for e in ch.get('edges') or [])
    outs = {}
    for e in ch.get('edges') or []:
        outs[e['from']] = outs.get(e['from'], 0) + 1
    branch = any(v > 1 for v in outs.values())
    return '平铺的图' + ('，有岔路' if branch else '') + ('，有回路' if loops else '')


def site(job, spec, label):
    from PIL import Image
    from playwright.sync_api import sync_playwright
    out = job / 'outputs/site'
    shutil.rmtree(out, ignore_errors=True)
    (out / 'img').mkdir(parents=True)
    film = scv.resolved(spec)
    files = posters(job, spec)
    page = scv.write_page(job, spec, 'layout')
    title, series = film.get('title') or '', film.get('series') or ''
    lines = [f"{publish.ROMAN[i]} {c.get('title', '')}" for i, c in enumerate(film['chapters'])]
    W, Hh = scv.frame_size(spec)
    with sync_playwright() as p:
        b, pg, errors = scv.open_page(p, page, W, Hh)
        rep = pg.evaluate('layoutReport()')
        og = pg.evaluate(OG_JS, {'poster': files[0].as_uri(), 'title': title, 'kicker': '格物 · 蜡笔状态图', 'lines': lines,
                                 'foot': series if series and series != title else 'sweety-statechart-video'})
        b.close()
    (out / 'og.png').write_bytes(base64.b64decode(og.split(',', 1)[1]))
    aigc.tag_png(out / 'og.png', label)
    # icons: the first chapter's start card, cut out of its poster
    im0 = Image.open(files[0]).convert('RGB')
    ch0 = rep['chapters'][0]
    k = im0.width / rep['W']
    box = ch0['boxes'].get(film['chapters'][0].get('start') or '') or next(iter(ch0['boxes'].values()))
    side = max(box['x1'] - box['x0'], 180) * 1.25
    cx, cy = (box['x0'] + box['x1']) / 2, (box['y0'] + box['y1']) / 2 - 10
    icon = im0.crop(tuple(round(v * k) for v in (cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2)))
    for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')]:
        icon.resize((size, size), Image.LANCZOS).save(out / name)
        aigc.tag_png(out / name, label)
    icon.resize((64, 64), Image.LANCZOS).save(out / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    (out / 'site.webmanifest').write_text(json.dumps({
        'name': title, 'short_name': title[:12], 'start_url': './', 'display': 'browser', 'background_color': '#e9e3d6', 'theme_color': '#e9e3d6',
        'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'}, {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png'}],
    }, ensure_ascii=False, indent=1))
    (out / 'style.css').write_text(SITE_CSS)
    if (job / 'outputs/film.html').exists():
        shutil.copy(job / 'outputs/film.html', out / 'film.html')
    scenes_src = (job / 'scenes.js').read_text() if (job / 'scenes.js').exists() else ''
    checks = checked(spec, film)
    plates, made = [], []
    for ci, (f, ch) in enumerate(zip(files, film['chapters'])):
        im = Image.open(f).convert('RGB')
        save_jpeg(fit(im, 1080, None, None), out / f'img/{ci + 1:02d}-1080.jpg', label, q=86)
        save_jpeg(fit(im, 2048, 2048, None), out / f'img/{ci + 1:02d}.jpg', label, q=88)
        n, alt = publish.ROMAN[ci], publish.alt_text(film, ci, scenes_src)
        text = publish.chart_text(ch, ci)
        lay = rep['chapters'][ci]
        over = overlay_svg(lay, rep['W'], rep['H'], f'第 {n} 章的排版：每张卡片、每条箭头和箭头上的字所在的框，蓝色画在海报上；绿色虚线是留给插画的空地。')
        desc = kind_of(ch) + '。' + (ch.get('tagline') or '')
        h1080 = round(1080 * im.height / im.width)
        plates.append(f"""
  <figure class="plate" id="ch{ci + 1}">
    <div class="frame"><a href="img/{ci + 1:02d}.jpg"><img src="img/{ci + 1:02d}-1080.jpg" srcset="img/{ci + 1:02d}-1080.jpg 1080w, img/{ci + 1:02d}.jpg 2048w" sizes="(min-width: 780px) 520px, 100vw" width="1080" height="{h1080}" alt="{H.escape(alt)}" aria-describedby="text{ci + 1}"{'' if ci == 0 else ' loading="lazy"'} decoding="async"></a>{over}</div>
    <figcaption><span class="num">{n}</span><h2>{H.escape(ch.get('title', ''))}</h2><p class="sub">{H.escape(ch.get('sub') or '')}</p><p class="desc">{H.escape(desc)}</p>
      <div class="tools"><button type="button" class="overlay" aria-pressed="false">显示排版</button></div>
      <details><summary>图的文字版</summary><pre class="wrap" id="text{ci + 1}" tabindex="0">{H.escape(text)}</pre></details>
      <details><summary>图片说明</summary><p>{H.escape(alt)}</p></details>
    </figcaption>
  </figure>""")
        states, steps_, rules, stuck = checks[ci]
        rl = ''.join(f'<li class="{"holds" if ok else "broken" if ok is False else "info"}"><span class="mark" aria-hidden="true"></span><span>{H.escape(words)}{"——成立" if ok else ""}</span></li>' for ok, words in rules)
        if not rules:
            rl = '<li class="info"><span class="mark" aria-hidden="true"></span><span>这一章没有写规则；检查器确认每张卡片都走得到。</span></li>'
        if stuck:
            rl += '<li class="info"><span class="mark" aria-hidden="true"></span><span>走到这里就停住（没有箭头出去）：' + H.escape('、'.join('+'.join(publish.label(ch, s) for s in c) for c in stuck)) + '</span></li>'
        mm, from_a = mermaid(job, spec, ci)
        src_json = json.dumps(spec['chapters'][ci], ensure_ascii=False, indent=1)
        made.append(f"""
  <article class="made" id="made-ch{ci + 1}">
    <h3><span class="num">{n}</span>{H.escape(ch.get('title', ''))}</h3>
    <p class="stats">检查器走遍了 {states} 种状态组合、{steps_} 条转移。</p>
    <ul class="rules">{rl}</ul>
    <div class="row">
      <figure><pre tabindex="0" aria-label="第 {n} 章的 film.json">{H.escape(src_json)}</pre><figcaption>1. film.json 里的这一章</figcaption></figure>
      <figure><pre tabindex="0" aria-label="第 {n} 章的 Mermaid">{H.escape(mm)}</pre><figcaption>2. 同一张图的 Mermaid{'' if from_a else '（简版导出）'}</figcaption></figure>
    </div>
  </article>""")
    site_url = (os.environ.get('SCV_SITE_URL') or '').rstrip('/') + '/' if os.environ.get('SCV_SITE_URL') else ''
    voiced = bool(scv.voice_of(spec))
    lede = (f"{len(film['chapters'])} 张状态图，讲{H.escape(title)}。每张图先由检查器走遍所有能到的状态，再自动排版，最后用代码一笔一笔画成蜡笔画。"
            '点“显示排版”，能看到画面底下的卡片、箭头和留给插画的空地。')
    links = ('<a href="film.html">在网页里一步步看</a>' if (out / 'film.html').exists() else '') + '<a href="#how">怎么做的</a>'
    og_alt = f'《{title}》的分享卡：左边是第一张海报，右边是片名和章节。'
    page_html = f"""<!doctype html>
<html lang="{H.escape(spec.get('language') or 'zh')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{H.escape(title)} · 格物 · 蜡笔状态图</title>
<meta name="description" content="{H.escape(lede[:120])}">
<meta name="AIGC" content="{H.escape(aigc.value(label))}">
<meta name="theme-color" content="#e9e3d6">
<meta property="og:type" content="website">
<meta property="og:site_name" content="格物 · 蜡笔状态图">
<meta property="og:title" content="{H.escape(title)}">
<meta property="og:description" content="{H.escape('、'.join(lines))}">
<meta property="og:image" content="{site_url}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{H.escape(og_alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{H.escape(title)}">
<meta name="twitter:image" content="{site_url}og.png">
<link rel="icon" href="favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<link rel="stylesheet" href="style.css">
</head>
<body>
<main>
<header class="top">
  <p class="kicker">格物 · 蜡笔状态图{(' · ' + H.escape(series)) if series and series != title else ''}</p>
  <h1>{H.escape(title)}</h1>
  <p class="lede">{lede}</p>
  <p class="links">{links}</p>
</header>
<section class="plates" aria-label="海报">
{''.join(plates)}
</section>
<section class="how" aria-labelledby="how">
  <h2 id="how">怎么做的</h2>
  <ol class="steps">
    <li><b>写成状态图。</b>film.json 里写每一章的状态、箭头和条件，再写一步一步怎么讲。</li>
    <li><b>检查。</b>检查器从起点出发，走遍每一种能到的状态组合，看规则在每一处是否成立；规则被打破时，找出最短的那条路，用红线画出来。</li>
    <li><b>排版。</b>状态按最长路径分层，岔路分到两边，箭头上的字避开卡片和别的字；剩下的地方留给插画。</li>
    <li><b>画。</b>卡片、箭头和四周的插画全部由代码一笔一笔画成蜡笔画，每一步按顺序出现{'，旁白由 AI 合成' if voiced else ''}。</li>
  </ol>
{''.join(made)}
</section>
<footer class="foot">
  <p>由 <a href="https://github.com/threerocks/sweety-statechart-video">格物 · 蜡笔状态图（sweety-statechart-video）</a> 生成：画面由代码绘制{'，旁白由 AI 合成' if voiced else ''}，文件元数据带 AI 生成标识（GB 45438）。字体均随包、可再分发：Noto Serif SC、朱雀仿宋、霞鹜漫黑、霞鹜文楷、Courier Prime（SIL OFL），Special Elite（Apache 2.0），Kevin Serif / Sans（MIT）。</p>
</footer>
</main>
<script>{SITE_JS}</script>
</body>
</html>
"""
    (out / 'index.html').write_text(page_html)
    print(f'site: {out}/index.html ({len(files)} chapters, og.png, icons)' + (f'; page errors: {errors[:3]}' if errors else ''))
    return out / 'index.html'


# ------------------------------------------------------------------
def deliver(job, spec, what=None):
    job = Path(job)
    what = what or spec.get('deliver') or ALL
    if isinstance(what, str):
        what = [w.strip() for w in what.split(',') if w.strip()]
    bad = [w for w in what if w not in ALL]
    if bad:
        raise SystemExit(f'deliver: unknown {bad}; choose from {", ".join(ALL)}')
    label = aigc.load(job, spec)
    order = [w for w in ALL if w in what]               # html before site (the site links it)
    made = {}
    for w in order:
        fn = {'clips': clips, 'longimage': longimage, 'social': social, 'gif': gif, 'html': html_export, 'site': site}[w]
        made[w] = fn(job, spec, label)
    return made


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('job')
    ap.add_argument('--what')
    a = ap.parse_args()
    j, s = scv.load(a.job)
    deliver(j, s, a.what)

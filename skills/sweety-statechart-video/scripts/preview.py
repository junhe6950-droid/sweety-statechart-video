#!/usr/bin/env python3
"""preview.py: `scv.py preview JOB [--port N] [--open]`. The film in the player shell (engine/shell/) on
http://127.0.0.1:N: a scrubber, the step list, speed, step-through, and the sound when work/audio/mix.wav exists.
Edit film.json or scenes.js and the page rebuilds (plan + the render page, through scv.py) and reloads where you were.

The page is the render page itself (scv.write_page), so the preview plays exactly what `render` records; the shell
only wraps it. shell_html(..., inline=True) is the same page as one self-contained file (the HTML export)."""
import base64
import json
import mimetypes
import re
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
SKILL = SCRIPTS.parent
SHELL = SKILL / 'engine/shell'
sys.path.insert(0, str(SCRIPTS))
import scv  # noqa: E402

UI_TEXT = '播放暂停上一步下一步逐步看放大镜退出速度进度无字幕重新载入空格亮出当前状态卡片《》（）·…—：，。！？、'
FONT_MIME = {'.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf'}


def play_page(job, spec):
    """(re)write the render page for this job: work/page-play.html, with the planned timing when there is one"""
    tf = job / 'work/timing.json'
    timing = json.loads(tf.read_text()) if tf.exists() else None
    return scv.write_page(job, spec, 'play', scv.page_timing(timing) if timing else None)


def _file(uri):
    return Path(urllib.parse.unquote(urllib.parse.urlparse(uri).path))


def subset_font(path, text):
    """the font cut down to the characters this film uses (woff2), or None without fontTools"""
    try:
        from fontTools import subset
        from io import BytesIO
    except ImportError:
        return None
    try:
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        font = subset.load_font(str(path), opts)
        sub = subset.Subsetter(opts)
        sub.populate(text=text)
        sub.subset(font)
        buf = BytesIO()
        subset.save_font(font, buf, opts)
        return buf.getvalue()
    except Exception as e:  # a font fontTools cannot cut: embed it whole
        print('font subset failed for', path.name, e, file=sys.stderr)
        return None


def data_uri(data, mime):
    return f'data:{mime};base64,' + base64.b64encode(data).decode()


def film_text(job, spec):
    """every character the page can draw: the film, its scenes, the engine's own words (default stamps…), the shell"""
    s = json.dumps(spec, ensure_ascii=False)
    sc = job / 'scenes.js'
    engine = ''.join(f.read_text() for f in sorted((SKILL / 'engine/crayon').glob('*.js')))
    return s + (sc.read_text() if sc.exists() else '') + engine + UI_TEXT + ''.join(chr(c) for c in range(0x20, 0x7f)) + '０１２３４５６７８９'


def shell_html(job, spec, page, inline=False, audio=None, live=None):
    """the render page wrapped in the shell. inline: one file, every script, font and the audio inside;
    else: URLs under /f/ (served by the preview server)"""
    html = page.read_text()
    base = page.parent
    fonts_text = film_text(job, spec) if inline else ''

    def src_of(ref):
        return _file(ref) if ref.startswith('file:') else (base / ref)

    def css(text):
        def url(m):
            f = src_of(m.group(2))
            if not inline:
                return f"url('/f{urllib.parse.quote(str(f))}')"
            data = subset_font(f, fonts_text) if f.suffix in ('.woff', '.ttf', '.otf') else None
            return f"url('{data_uri(data, 'font/woff2')}')" if data else f"url('{data_uri(f.read_bytes(), FONT_MIME.get(f.suffix, 'application/octet-stream'))}')"
        text = re.sub(r"url\((['\"]?)([^'\")]+)\1\)", url, text)
        return text.replace("format('woff')", '').replace('format("woff")', '') if inline else text

    def script(m):
        f = src_of(m.group(1))
        if not inline:
            return f'<script src="/f{urllib.parse.quote(str(f))}"></script>'
        return '<script>\n' + f.read_text().replace('</script', '<\\/script') + '\n</script>'

    def link(m):
        f = src_of(m.group(1))
        if not inline:
            return f'<style>{css(f.read_text())}</style>'
        return f'<style>{css(f.read_text())}</style>'

    html = re.sub(r'<script src="([^"]+)"></script>', script, html)
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', link, html)
    shell_css, shell_js = (SHELL / 'shell.css').read_text(), (SHELL / 'shell.js').read_text()
    cfg = {'audio': audio, 'live': live}
    title = (spec.get('title') or 'film').replace('<', '')
    head = (f'<meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title>'
            f'<style>{shell_css}</style>')
    html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + head, 1)
    tail = (f'<script>window.SHELL = {json.dumps(cfg)};</script>\n<script>\n' + shell_js.replace('</script', '<\\/script') + '\n</script>\n')
    html = html.replace('</body>', tail + '</body>', 1)
    if inline:
        html = html.replace('<html>', '<html lang="' + (spec.get('language') or 'zh') + '">', 1)
    return html


# ------------------------------------------------------------------ the preview server
class Preview:
    def __init__(self, job):
        self.job = Path(job).resolve()
        self.version, self.error = '0', None
        self.lock = threading.Lock()
        self.roots = [SKILL.resolve(), self.job]
        self.build(first=True)

    def watched(self):
        files = [self.job / 'film.json', self.job / 'scenes.js', self.job / 'work/audio/mix.wav']
        files += sorted((SKILL / 'engine/crayon').glob('*.js')) + sorted(SHELL.glob('*'))
        return {str(f): f.stat().st_mtime for f in files if f.exists()}

    def build(self, first=False, replan=True):
        """film.json / scenes.js changed: plan again (scv.plan: voice or reading pace) and rewrite the render page"""
        try:
            job, spec = scv.load(self.job)
        except Exception as e:                  # half-saved film.json: keep the last good page
            self.error = f'film.json: {e}'
            print('preview:', self.error, flush=True)
            return False
        try:
            if replan:
                scv.plan(job, spec)
        except SystemExit as e:
            print('preview: plan failed, keeping the old timing:', e, flush=True)
        self.spec = spec
        self.page = play_page(job, spec)
        self.error = None
        self.version = str(time.time())
        if not first:
            print('preview: rebuilt', time.strftime('%H:%M:%S'), flush=True)
        return True

    def watch(self):
        seen = self.watched()
        while True:
            time.sleep(.5)
            now = self.watched()
            if now != seen:
                changed = [k for k in now if seen.get(k) != now[k]] + [k for k in seen if k not in now]
                seen = now
                if any(k.endswith(('film.json', 'scenes.js')) for k in changed):
                    with self.lock:
                        self.build()
                else:
                    self.version = str(time.time())

    def html(self):
        mix = self.job / 'work/audio/mix.wav'
        with self.lock:
            return shell_html(self.job, self.spec, self.page, inline=False,
                              audio='/audio/mix.wav' if mix.exists() else None, live={'version': '/__version'})

    def allowed(self, f):
        f = f.resolve()
        return any(f == r or r in f.parents for r in self.roots)


def make_handler(pv):
    class H(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, *a):
            pass

        def send(self, code, body, ctype, extra=None):
            self.send_response(code)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
            try:
                if path in ('/', '/index.html'):
                    return self.send(200, pv.html().encode(), 'text/html; charset=utf-8')
                if path == '/favicon.ico':
                    return self.send(204, b'', 'image/x-icon')
                if path == '/__version':
                    return self.send(200, pv.version.encode(), 'text/plain')
                if path == '/audio/mix.wav':
                    return self.file(pv.job / 'work/audio/mix.wav')
                if path.startswith('/f/'):
                    f = Path(path[2:])
                    if pv.allowed(f) and f.is_file():
                        if f.name == 'fonts.css':           # its font URLs are file:// URIs: serve them under /f/ too
                            text = re.sub(r"url\('file://([^']+)'\)", lambda m: f"url('/f{m.group(1)}')", f.read_text())
                            return self.send(200, text.encode(), 'text/css')
                        return self.file(f)
                self.send(404, b'not found', 'text/plain')
            except (BrokenPipeError, ConnectionResetError):
                pass

        def file(self, f):
            """with Range, so the audio element can seek"""
            if not f.exists():
                return self.send(404, b'not found', 'text/plain')
            data = f.read_bytes()
            ctype = FONT_MIME.get(f.suffix) or mimetypes.guess_type(f.name)[0] or 'application/octet-stream'
            if f.suffix == '.js':
                ctype = 'text/javascript; charset=utf-8'
            rng = re.match(r'bytes=(\d*)-(\d*)', self.headers.get('Range') or '')
            if rng and (rng.group(1) or rng.group(2)):
                a = int(rng.group(1)) if rng.group(1) else len(data) - int(rng.group(2))
                b = int(rng.group(2)) if rng.group(1) and rng.group(2) else len(data) - 1
                b = min(b, len(data) - 1)
                return self.send(206, data[a:b + 1], ctype, {'Content-Range': f'bytes {a}-{b}/{len(data)}', 'Accept-Ranges': 'bytes'})
            self.send(200, data, ctype, {'Accept-Ranges': 'bytes'})
    return H


def serve(job, port=8765, open_browser=False):
    pv = Preview(job)
    srv = ThreadingHTTPServer(('127.0.0.1', port), make_handler(pv))
    srv.daemon_threads = True
    threading.Thread(target=pv.watch, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_port}/'
    print(f'preview: {url}  (film.json / scenes.js changes reload the page; ctrl-c to stop)', flush=True)
    if open_browser:
        import webbrowser
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return url


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('job')
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--open', action='store_true', help='open it in the default browser')
    a = ap.parse_args()
    serve(Path(a.job), a.port, a.open)

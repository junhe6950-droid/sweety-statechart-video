#!/usr/bin/env python3
"""frames.py: how `scv.py render` gets frames out of the page and into video files.

Encoders (`scv.py render JOB --encoder NAME`; film.json "encoder" sets the job's default):
  x264       default. The page sends each frame as a PNG (lossless, made off the main thread by canvas.toBlob) to a
             sink on 127.0.0.1, no base64; one ffmpeg per chunk encodes the platform film and the upload master.
  webcodecs  the page encodes H.264 itself with WebCodecs (VideoToolbox on a Mac); ffmpeg only remuxes. One file,
             no master. Fast where Chrome has a hardware encoder; worse quality per byte than x264.
  legacy     v1: JPEG q .94 through toDataURL, base64, MJPEG, libx264 CRF 26. The fallback.

The settings below were chosen by measurement (SSIM against a PNG sequence of the same frames; docs in
references/delivery.md). For benchmarks only: SCV_TRANSPORT=jpeg|rgba switches the x264 path's readback (rgba is
getImageData, a synchronous GPU readback that stalls when several browsers share the GPU),
SCV_FILM_ARGS / SCV_MASTER_ARGS replace the encoder arguments, SCV_MASTER=0 skips the master, SCV_WC_Q sets the WebCodecs
quantizer.
"""
import json
import os
import socket
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ENCODERS = ('x264', 'webcodecs', 'legacy')
DEFAULT_ENCODER = 'x264'
COLOR = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']
TO_YUV = ('scale=out_color_matrix=bt709:out_range=tv:flags=bicubic+accurate_rnd+full_chroma_inp,format=yuv420p,'
          'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv')
# platform film: what people download and share. Measured on the takeout film against PNGs of the same frames: at CRF 20
# -tune animation keeps plain CRF 20's SSIM with ~30% fewer bits, -tune grain spends ~20% more bits for a lower SSIM,
# 10-bit HEVC saves nothing and plays in fewer places; -preset slow gains 0.002 SSIM and 12% in size over medium for
# ~1.8x the CPU, so medium (references/delivery.md)
FILM = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-profile:v', 'high']
# upload master (~10-15 Mbps): so the platform's own transcode starts close to the canvas. At this bitrate veryfast
# CRF 13 matches medium CRF 14 in SSIM for a third of the CPU
MASTER = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '13', '-maxrate', '15M', '-bufsize', '30M',
          '-pix_fmt', 'yuv420p', '-profile:v', 'high']
WEBCODECS = {'codec': 'avc1.640033', 'hw': 'prefer-hardware', 'quantizer': 20}


TRANSPORT = 'png'


def transport():
    return os.environ.get('SCV_TRANSPORT') or TRANSPORT


def encoder_of(spec, name=None):
    e = name or os.environ.get('SCV_ENCODER') or spec.get('encoder') or DEFAULT_ENCODER
    if e not in ENCODERS:
        raise SystemExit(f'unknown encoder {e!r}; use one of {", ".join(ENCODERS)}')
    return e


def master_path(dest):
    return Path(str(dest)[:-4] + '.master.mp4')


# ------------------------------------------------------------------ the sink: page -> 127.0.0.1 -> ffmpeg
class Sink:
    """a tiny HTTP server the page POSTs to: /frame/N (one frame), /stream/N (a piece of an encoded stream), /end/N.
    Bodies are handed to `write` strictly in order; a request waits its turn, which is the backpressure."""

    def __init__(self, write, first, beat=None):
        self.write, self.next, self.beat, self.error, self.ended = write, first, beat, None, False
        self.cv = threading.Condition()
        sink = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'

            def setup(self):
                super().setup()
                self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

            def do_POST(self):
                _, kind, n = self.path.split('/')[:3]
                body = self.rfile.read(int(self.headers.get('Content-Length') or 0))
                ok = sink.take(kind, int(n), body)
                self.send_response(204 if ok else 500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', '0')
                self.end_headers()

            def log_message(self, *a):
                pass

        self.http = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.http.daemon_threads = True
        self.url = f'http://127.0.0.1:{self.http.server_port}'
        threading.Thread(target=self.http.serve_forever, daemon=True).start()

    def take(self, kind, n, body):
        with self.cv:
            while self.next != n and self.error is None:
                self.cv.wait(1)
            if self.error is not None:
                return False
            try:
                if kind == 'end':
                    self.ended = True
                elif body:
                    self.write(body)
            except Exception as e:  # ffmpeg died: tell the page
                self.error = e
                self.cv.notify_all()
                return False
            self.next += 1
            if self.beat and kind == 'frame' and n % 15 == 0:
                self.beat.write_text(f'frame {n}')
            self.cv.notify_all()
            return True

    def close(self):
        self.http.shutdown()
        self.http.server_close()


# ------------------------------------------------------------------ chunk recorders
def x264_cmd(W, H, fps, dest, master=True, src='png', film=None, master_args=None):
    """one ffmpeg: frames on stdin -> the film chunk (+ the master chunk)"""
    gop = ['-g', str(fps * 2)]
    if src == 'rgba':
        inp = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-framerate', str(fps), '-i', '-']
    else:
        inp = ['-f', 'image2pipe', '-framerate', str(fps), '-c:v', {'png': 'png', 'jpeg': 'mjpeg'}[src], '-i', '-']
    cmd = ['ffmpeg', '-v', 'error', '-y', *inp]
    if master:
        cmd += ['-filter_complex', f'[0:v]{TO_YUV},split=2[a][b]',
                '-map', '[a]', *(film or FILM), *gop, *COLOR, str(dest),
                '-map', '[b]', *(master_args or MASTER), *gop, *COLOR, str(master_path(dest))]
    else:
        cmd += ['-vf', TO_YUV, *(film or FILM), *gop, *COLOR, str(dest)]
    return cmd


def record_x264(pg, W, H, fps, f0, f1, dest, beat, master=True):
    src = transport()
    film = os.environ.get('SCV_FILM_ARGS', '').split() or None          # benchmarks only
    margs = os.environ.get('SCV_MASTER_ARGS', '').split() or None
    master = master and os.environ.get('SCV_MASTER', '1') != '0'
    ff = subprocess.Popen(x264_cmd(W, H, fps, dest, master, src, film=film, master_args=margs), stdin=subprocess.PIPE)
    sink = Sink(ff.stdin.write, f0, beat)
    try:
        q = 1.0 if src == 'jpeg' else None
        pg.evaluate('o => SCV_REC.push(o)', {'url': sink.url, 'f0': f0, 'f1': f1, 'fps': fps,
                                             'fmt': src, 'q': q, 'inflight': 3})
    finally:
        sink.close()
        ff.stdin.close()
    if sink.error:
        raise SystemExit(f'ffmpeg stopped taking frames: {sink.error}')
    return ff.wait()


def record_webcodecs(pg, W, H, fps, f0, f1, dest, beat, opts=None):
    o = dict(WEBCODECS, **(opts or {}))
    if os.environ.get('SCV_WC_Q'):                       # benchmarks only
        o['quantizer'] = int(os.environ['SCV_WC_Q'])
    raw = Path(str(dest) + '.h264' if o['codec'].startswith('avc') else str(dest) + '.hevc')
    fh = open(raw, 'wb')
    sink = Sink(fh.write, 0, None)
    stop = threading.Event()

    def pulse():                                 # encoded pieces come in bursts: beat on time instead
        while not stop.wait(5):
            beat.write_text(f'encoding {f0}-{f1} {fh.tell()}')
    threading.Thread(target=pulse, daemon=True).start()
    try:
        info = pg.evaluate('o => SCV_REC.encode(o)', {'url': sink.url, 'f0': f0, 'f1': f1, 'fps': fps, 'gop': fps * 2,
                                                      'codec': o['codec'], 'hw': o['hw'], 'quantizer': o.get('quantizer'),
                                                      'bitrate': o.get('bitrate')})
    finally:
        stop.set()
        sink.close()
        fh.close()
    fmt = 'h264' if raw.suffix == '.h264' else 'hevc'
    # timestamps from the frame count: VideoToolbox's SPS timing makes ffmpeg read 30 fps as 60
    rc = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', fmt, '-framerate', str(fps), '-i', str(raw), '-c', 'copy',
                         '-bsf:v', f'setts=ts=N/({fps}*TB)', *COLOR, str(dest)]).returncode
    raw.unlink(missing_ok=True)
    print('webcodecs', json.dumps(info.get('config', {})), info.get('bytes'), 'bytes', flush=True)
    return rc


def probe_webcodecs(pg, opts=None):
    o = dict(WEBCODECS, **(opts or {}))
    return pg.evaluate('o => SCV_REC.probe(o)', {'fps': 30, 'codec': o['codec'], 'hw': o['hw'], 'quantizer': o.get('quantizer')})

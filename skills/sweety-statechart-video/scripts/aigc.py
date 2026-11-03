#!/usr/bin/env python3
"""aigc.py: the implicit AI label of GB 45438-2025 (《人工智能生成合成内容标识办法》, in force 2025-09-01) in file metadata.

The value is one JSON object, {"Label": "1", "ContentProducer", "ProduceID", "ReservedCode1", "ContentPropagator",
"PropagateID", "ReservedCode2"}, written where TC260's practice guides (2025-08) put it:
  MP4 / M4A   moov.udta.meta: key AIGC in `keys`, the JSON in `ilst` (ffmpeg -metadata AIGC=... -movflags use_metadata_tags)
              TC260-PG-20257A (video) 6.1.1, audio guide 6.1.5
  WAV         a RIFF chunk with id AIGC holding the JSON (audio guide 6.1.1)
  PNG         XMP in iTXt (namespace http://www.tc260.org.cn/ns/AIGC/1.0/, property TC260:AIGC; image guide 6)
              plus a tEXt chunk with keyword AIGC and {"AIGC": {...}} (image guide appendix B.2)
  JPEG        XMP in APP1 (image guide 6 c 1)
  GIF         XMP in an application extension (image guide 6 c 4)
Values are ASCII (GB 45438 appendix E j: 0x20-0x7E); film.json "aigc" overrides producer, produce_id, propagator,
propagate_id.

usage: aigc.py read FILE...      print the AIGC field found in each file (exit 1 if one has none)
"""
import hashlib
import json
import re
import struct
import subprocess
import sys
import time
import uuid
import zlib
from pathlib import Path

PRODUCER = 'sweety-statechart-video'
NS = 'http://www.tc260.org.cn/ns/AIGC/1.0/'
ID_SPACE = uuid.UUID('6f1c3a52-9d0e-5b7a-8e43-2c1d5a7f9b10')      # this tool's UUID namespace for ProduceID
KEYS = ('Label', 'ContentProducer', 'ProduceID', 'ReservedCode1', 'ContentPropagator', 'PropagateID', 'ReservedCode2')


def ascii_(s):
    return ''.join(c if 0x20 <= ord(c) <= 0x7e else '?' for c in str(s or ''))


def content_hash(job):
    h = hashlib.sha256()
    for name in ('film.json', 'scenes.js'):
        f = Path(job) / name
        if f.exists():
            h.update(f.read_bytes())
    return h.hexdigest()


def identity(job, spec, rendered_at=None):
    """the seven fields for this film. ProduceID: a UUID from the film's content hash and its render time, so the
    same render always gets the same id and every new render a new one."""
    job = Path(job)
    o = spec.get('aigc') or {}
    if rendered_at is None:
        info = job / 'work/render/info.json'
        rendered_at = json.loads(info.read_text()).get('rendered_at') if info.exists() else time.strftime('%Y-%m-%dT%H:%M:%S%z')
    producer = ascii_(o.get('producer') or PRODUCER)
    pid = ascii_(o.get('produce_id') or uuid.uuid5(ID_SPACE, f'{content_hash(job)}|{rendered_at}'))
    return {
        'Label': '1',
        'ContentProducer': producer,
        'ProduceID': pid,
        'ReservedCode1': hashlib.sha256(f'{producer}|{pid}'.encode()).hexdigest()[:16],
        'ContentPropagator': ascii_(o.get('propagator')),
        'PropagateID': ascii_(o.get('propagate_id')),
        'ReservedCode2': '',
    }


def value(fields):
    return json.dumps({k: fields.get(k, '') for k in KEYS}, ensure_ascii=True, separators=(',', ':'))


def save(job, fields):
    (Path(job) / 'work').mkdir(exist_ok=True)
    (Path(job) / 'work/aigc.json').write_text(json.dumps(fields, indent=1))


def load(job, spec):
    """the identity finalize wrote for this render (deliver and publish reuse it), or a fresh one"""
    f = Path(job) / 'work/aigc.json'
    if f.exists():
        return json.loads(f.read_text())
    return identity(job, spec)


# ------------------------------------------------------------------ writers
def ffmpeg_args(fields):
    """for an MP4 / M4A that ffmpeg writes: the AIGC key in moov.udta.meta (add 'use_metadata_tags' to -movflags)"""
    return ['-metadata', f'AIGC={value(fields)}']


def xmp(fields):
    v = value(fields).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return ('<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>'
            '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
            f'<rdf:Description rdf:about="" xmlns:TC260="{NS}"><TC260:AIGC>{v}</TC260:AIGC></rdf:Description>'
            '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>').encode('utf-8')


def _png_chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def _png_chunks(data):
    i = 8
    while i < len(data):
        n, kind = struct.unpack('>I4s', data[i:i + 8])
        yield kind, data[i + 8:i + 8 + n], i, i + 12 + n
        i += 12 + n


def tag_png(path, fields):
    """iTXt XMP + tEXt AIGC, inserted before IDAT (old AIGC chunks replaced); the pixels are not touched"""
    path = Path(path)
    data = path.read_bytes()
    keep, first_idat = [], None
    for kind, body, a, b in _png_chunks(data):
        if (kind == b'tEXt' and body.startswith(b'AIGC\0')) or (kind == b'iTXt' and body.startswith(b'XML:com.adobe.xmp\0')):
            continue
        if kind == b'IDAT' and first_idat is None:
            first_idat = len(keep)
        keep.append(data[a:b])
    new = [_png_chunk(b'iTXt', b'XML:com.adobe.xmp\0\0\0\0\0' + xmp(fields)),
           _png_chunk(b'tEXt', b'AIGC\0' + json.dumps({'AIGC': json.loads(value(fields))}, separators=(',', ':')).encode())]
    keep[first_idat:first_idat] = new
    path.write_bytes(data[:8] + b''.join(keep))


def tag_jpeg(path, fields):
    path = Path(path)
    data = path.read_bytes()
    seg = b'http://ns.adobe.com/xap/1.0/\0' + xmp(fields)
    at = 2 + 2 + struct.unpack('>H', data[4:6])[0] if data[2:4] == b'\xff\xe0' else 2      # after JFIF's APP0
    path.write_bytes(data[:at] + b'\xff\xe1' + struct.pack('>H', len(seg) + 2) + seg + data[at:])


def tag_gif(path, fields):
    """XMP application extension ("XMP DataXMP" + packet + the 258-byte magic trailer) just before the trailer byte"""
    path = Path(path)
    data = path.read_bytes()
    assert data[-1:] == b'\x3b', 'not a GIF'
    ext = b'\x21\xff\x0bXMP DataXMP' + xmp(fields) + b'\x01' + bytes(range(255, -1, -1)) + b'\x00'
    path.write_bytes(data[:-1] + ext + b'\x3b')


def tag_wav(path, fields):
    """a RIFF chunk with id AIGC (padded to even length), appended; the RIFF size updated"""
    path = Path(path)
    data = bytearray(path.read_bytes())
    assert data[:4] == b'RIFF' and data[8:12] == b'WAVE', 'not a WAV'
    body = value(fields).encode('ascii')
    chunk = b'AIGC' + struct.pack('<I', len(body)) + body + (b'\0' if len(body) % 2 else b'')
    data += chunk
    data[4:8] = struct.pack('<I', len(data) - 8)
    path.write_bytes(bytes(data))


def tag_file(path, fields):
    """MP4/M4A are tagged by ffmpeg when written; this handles the rest by suffix"""
    s = Path(path).suffix.lower()
    {'.png': tag_png, '.jpg': tag_jpeg, '.jpeg': tag_jpeg, '.gif': tag_gif, '.wav': tag_wav}[s](path, fields)


# ------------------------------------------------------------------ reader (for verification)
def read(path):
    """the AIGC object stored in a file, or None"""
    path = Path(path)
    s = path.suffix.lower()
    if s in ('.mp4', '.m4a', '.mov'):
        r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format_tags', '-of', 'json', str(path)], capture_output=True, text=True)
        v = json.loads(r.stdout or '{}').get('format', {}).get('tags', {}).get('AIGC')
        return json.loads(v) if v else None
    data = path.read_bytes()
    if s == '.wav':
        i = 12
        while i + 8 <= len(data):
            kind, n = struct.unpack('<4sI', data[i:i + 8])
            if kind == b'AIGC':
                return json.loads(data[i + 8:i + 8 + n].rstrip(b'\0'))
            i += 8 + n + (n & 1)
        return None
    if s == '.png':
        for kind, body, _, _ in _png_chunks(data):
            if kind == b'tEXt' and body.startswith(b'AIGC\0'):
                return json.loads(body[5:])['AIGC']
    m = re.search(rb'<TC260:AIGC>(.*?)</TC260:AIGC>', data, re.S)
    if m:
        return json.loads(m.group(1).decode().replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&'))
    return None


def main():
    if len(sys.argv) < 3 or sys.argv[1] != 'read':
        raise SystemExit(__doc__)
    bad = 0
    for f in sys.argv[2:]:
        v = read(f)
        bad += v is None
        print(f, json.dumps(v, ensure_ascii=False) if v else '(no AIGC field)')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()

/* sweety-statechart-video · record.js — the recorder's side of the page (loaded after main.js, play mode only).
 * scv.py render opens a small HTTP sink on 127.0.0.1 and asks the page to send it frames:
 *   SCV_REC.push(o)    renders frames [o.f0, o.f1) and POSTs each one as PNG (lossless, the default), JPEG or raw RGBA;
 *   SCV_REC.encode(o)  encodes them in the page with WebCodecs (H.264 / HEVC, hardware when Chrome has it) and POSTs
 *                      the Annex-B stream, which ffmpeg only remuxes;
 *   SCV_REC.probe(o)   which WebCodecs configs this Chrome supports.
 * Frames go as Blobs (fast in Chrome) with a few requests in flight; the sink answers in order, so a slow encoder
 * holds the page back instead of piling frames up in memory. Frame f is film time f / fps, as in the v1 recorder. */
(function () {
  if (window.MODE === 'layout') return;
  const cv = () => document.getElementById('cv');

  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', body });
    if (!r.ok) throw new Error(`POST ${url}: HTTP ${r.status}`);
  }
  function blob(c, type, q) {
    return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), type, q));
  }
  async function frame(T, fmt, q) {
    window.renderAt(T);
    const c = cv();
    // rgba: getImageData is a synchronous GPU readback; with several browsers sharing the GPU it stalls (235-460 ms a
    // frame with 6 browsers, against 64-82 ms for PNG through toBlob, which reads back and encodes off the main thread).
    // With Chrome's 2D canvas on the CPU (--disable-accelerated-2d-canvas) rgba is as fast as PNG, no faster.
    if (fmt === 'rgba') return new Blob([c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
    return blob(c, fmt === 'png' ? 'image/png' : 'image/jpeg', q);
  }
  function config(o) {
    const c = cv(), codec = o.codec || 'avc1.640033';
    const cfg = {
      codec, width: c.width, height: c.height, framerate: o.fps,
      hardwareAcceleration: o.hw || 'prefer-hardware', latencyMode: 'quality',
      bitrateMode: o.quantizer != null ? 'quantizer' : 'variable', bitrate: o.bitrate || 12e6,
    };
    if (codec.startsWith('avc')) cfg.avc = { format: 'annexb' };
    else if (codec.startsWith('hvc') || codec.startsWith('hev')) cfg.hevc = { format: 'annexb' };
    return cfg;
  }

  window.SCV_REC = {
    /* {url, f0, f1, fps, fmt: 'rgba' | 'png' | 'jpeg', q, inflight} -> frames sent */
    async push(o) {
      const fmt = o.fmt || 'rgba', q = o.q == null ? 1 : o.q, depth = o.inflight || 3, flying = [];
      for (let f = o.f0; f < o.f1; f++) {
        const body = await frame(f / o.fps, fmt, q);
        flying.push(post(`${o.url}/frame/${f}`, body));
        if (flying.length >= depth) await flying.shift();
      }
      await Promise.all(flying);
      return o.f1 - o.f0;
    },
    /* {url, f0, f1, fps, codec, hw, quantizer | bitrate, gop} -> {frames, bytes, config} */
    async encode(o) {
      const cfg = config(o), sup = await VideoEncoder.isConfigSupported(cfg);
      if (!sup.supported) throw new Error('VideoEncoder does not support ' + JSON.stringify(cfg));
      let parts = [], size = 0, sent = 0, failure = null, seq = 0;
      const flying = [];
      const flush = () => {
        if (!parts.length) return;
        flying.push(post(`${o.url}/stream/${seq++}`, new Blob(parts)));
        parts = []; size = 0;
      };
      const enc = new VideoEncoder({
        output: chunk => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); parts.push(b); size += b.length; sent += b.length; },
        error: e => { failure = e; },
      });
      enc.configure(cfg);
      const gop = o.gop || o.fps * 2, us = 1e6 / o.fps, key = cfg.codec.startsWith('avc') ? 'avc' : 'hevc';
      for (let f = o.f0; f < o.f1; f++) {
        if (failure) throw failure;
        window.renderAt(f / o.fps);
        const vf = new VideoFrame(cv(), { timestamp: Math.round((f - o.f0) * us), duration: Math.round(us) });
        const opt = { keyFrame: (f - o.f0) % gop === 0 };
        if (o.quantizer != null) opt[key] = { quantizer: o.quantizer };
        enc.encode(vf, opt);
        vf.close();
        while (enc.encodeQueueSize > 3) await new Promise(r => setTimeout(r, 0));
        if (size > 4e6) flush();
        while (flying.length > 2) await flying.shift();
      }
      await enc.flush();
      enc.close();
      if (failure) throw failure;
      flush();
      await Promise.all(flying);
      await post(`${o.url}/end/${seq}`, new Blob([]));
      return { frames: o.f1 - o.f0, bytes: sent, config: cfg };
    },
    async probe(o) {
      if (typeof VideoEncoder === 'undefined') return { supported: false, reason: 'no WebCodecs' };
      const r = await VideoEncoder.isConfigSupported(config(o));
      return { supported: !!r.supported, config: r.config };
    },
  };
})();

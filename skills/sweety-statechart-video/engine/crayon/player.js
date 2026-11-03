/* sweety-statechart-video · player.js — one long page of posters, played like the reference: each step draws its
 * arrows (bead in front, words typing), pops its cards and rings the active ones; the page scrolls to keep the step in
 * view; every line boils (3 drawings, 5 a second); the caption strip at the bottom reads "I.3 — …" and darkens as the
 * narration reads it. On top of the reference: the camera can push in on a step and pull back, the film can open on
 * a hook (the finished first poster and a question) and close on an overview of every poster, a stamp shakes the
 * frame when it lands, the active state's mood tints the paper, and characters talk with the narration.
 * Deterministic: renderAt(T) draws the frame at film time T, for the recorder. */
(function () {
  const K = window.SCV, { C, FONT } = K;
  const PUSH = 1.28;                                     // how far the camera pushes in

  class Player {
    constructor(canvas, film, timing, opts = {}) {
      this.cv = canvas; this.g = canvas.getContext('2d');
      this.f = film; this.opts = Object.assign({}, film.player || {}, opts);
      const [Wpx, Hpx] = film.size;
      canvas.width = Wpx; canvas.height = Hpx;
      this.k = Wpx / film.W;
      this.ui = Math.min(Wpx, Hpx) / 1080;              // the strip and the chip scale with the short side
      this.bar = Math.round(Math.min(Hpx, Wpx * 4 / 3) * (this.opts.barShare || .076));   // 109 px at 3:4, the same on taller frames
      this.vh = (Hpx - this.bar) / this.k;               // visible page height above the caption strip, poster units
      this.full = Hpx / this.k;
      this.PH = film.H;
      this.steps = [];
      film.chapters.forEach((ch, ci) => ch.S.list.forEach((s, si) => this.steps.push({ ci, si, s })));
      this.timing = timing || this.defaultTiming();
      this.timing.steps.forEach((t, i) => Object.assign(this.steps[i], t));
      this.total = this.timing.total;
      this.hook = this.timing.hook || null;              // {at: 0, dur, text}
      this.outro = this.timing.outro || null;            // {at, dur}
      this.talk = this.timing.talk || null;              // {fps, env}
      this.aiLabel = film.ai_label === undefined ? (film.voice && film.voice !== 'none' ? '旁白由 AI 合成' : null) : film.ai_label;
      this.zmax = this.opts.camera === 'push' || film.camera === 'push' || this.steps.some(x => x.s.camera === 'push') ? PUSH : 1;
      this.cache = new Map();
      this.planCamera();
      this.planPush();
      this.planShakes();
    }
    defaultTiming() {
      const sp = this.f.speed, lead = .8;
      let t = lead;
      const steps = this.steps.map((x, i) => {
        const last = i === this.steps.length - 1, dur = (3.6 + (last ? 2.5 : 0)) / sp;
        const o = { t0: t, dur }; t += dur; return o;
      });
      return { lead, steps, total: t + .6 };
    }
    /* ---- camera: the reference's auto-scroll, replayed deterministically ---- */
    focusY(i) {
      const { ci, s } = this.steps[i], L = this.f.chapters[ci].L;
      let ys = [];
      if (s.focus != null) ys.push(s.focus);
      s.on.forEach(b => L.boxes[b] && ys.push(L.boxes[b].y));
      s.go.forEach(id => { const e = L.edges.find(x => x.id === id); if (e) ys.push(e.pts[e.pts.length - 1][1]); });
      if (!ys.length) ys = [this.PH / 2];
      const y = Math.max(...ys.map(v => Math.max(0, Math.min(this.PH + 1, v))));
      return ci * this.PH + y;
    }
    focusXY(i) {                                         // where a push-in looks: the new card, else the arrow's end
      const { ci, s } = this.steps[i], L = this.f.chapters[ci].L;
      const pts = [];
      s.on.forEach(b => L.boxes[b] && pts.push([L.boxes[b].x, L.boxes[b].y]));
      s.go.forEach(id => { const e = L.edges.find(x => x.id === id); if (e && e.kind !== 'start' && e.kind !== 'entry') pts.push(e.pts[e.pts.length - 1]); });
      if (!pts.length) return [this.f.W / 2, this.focusY(i)];
      const x = pts.reduce((a, p) => a + p[0], 0) / pts.length, y = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      return [x, ci * this.PH + y];
    }
    planCamera() {
      const segs = [], maxScroll = Math.max(0, this.f.chapters.length * this.PH - this.full + this.bar / this.k);
      const at = t => {
        let y = 0;
        for (const s of segs) { if (t < s.t0) break; y = t >= s.t0 + s.d ? s.to : s.from + (s.to - s.from) * K.ease((t - s.t0) / s.d); }
        return y;
      };
      this.steps.forEach((st, i) => {
        const cur = at(st.t0), y = this.focusY(i), rel = y - cur;
        let target;
        if (i === 0) target = 0;
        else if (st.si === 0 && this.opts.settle !== false) target = st.ci * this.PH;   // a new chapter: its poster settles at the top
        else target = y - this.vh * .55;
        // inside a chapter the camera stays on its poster (the whole poster nearly fits a 3:4 frame); the exit
        // step may scroll on into the next one, as the reference page does
        const L = this.f.chapters[st.ci].L, exit = st.s.go.some(id => (L.edges.find(e => e.id === id) || {}).kind === 'exit');
        if (this.opts.settle !== false && !exit && i > 0) {
          const lo = st.ci * this.PH, hi = lo + Math.max(0, this.PH - this.vh);
          const inside = cur >= lo - .5 && cur <= hi + .5;
          if (inside && rel > this.vh * .22 && rel < this.vh * .72 && st.si !== 0) return;
          target = Math.max(lo, Math.min(hi, target));
        } else if (i > 0 && rel > this.vh * .22 && rel < this.vh * .72) return;
        target = Math.max(0, Math.min(maxScroll, target));
        if (Math.abs(target - cur) < .5) return;
        segs.push({ t0: st.t0, d: Math.min(1.6, .6 + Math.abs(target - cur) * this.k / 1500), from: cur, to: target });
      });
      this.camAt = at;
      this.camSegs = segs;
    }
    // push-in weight 0..1 per step: "push" on the film (every step whose words would read small) or on a step;
    // "pull" or the next step without push eases back out
    planPush() {
      const film = this.f.camera === 'push' || this.opts.camera === 'push';
      const keys = [];                                    // [t, weight, focus]
      this.steps.forEach((st, i) => {
        const want = st.s.camera === 'push' || (film && st.s.camera !== 'pull' && st.si > 0 && (st.s.go.length || st.s.on.length));
        keys.push({ t: st.t0 + .25, w: want ? 1 : 0, at: this.focusXY(i), d: want ? .9 : .7 });
      });
      this.pushKeys = keys;
    }
    pushAt(T) {
      let w = 0, from = 0, at = null, prevAt = null;
      for (const k of this.pushKeys) {
        if (T < k.t) break;
        from = w; prevAt = at || k.at;
        const u = K.easeInOut(K.clamp((T - k.t) / k.d));
        w = from + (k.w - from) * u; at = k.w ? k.at : prevAt;
        if (at && prevAt && k.w && from > 0) at = [prevAt[0] + (k.at[0] - prevAt[0]) * u, prevAt[1] + (k.at[1] - prevAt[1]) * u];
      }
      return { w, at };
    }
    planShakes() {                                       // a stamp landing shakes the frame for a moment
      this.shakes = [];
      const sp = this.f.speed;
      this.f.chapters.forEach(ch => {
        const k = K.film.stampStep(ch), base = this.steps.find(x => x.ci === ch.index && x.si === k);
        if (k >= 0 && base) this.shakes.push(base.t0 + (K.film.STAMP_DELAY + K.film.STAMP_FALL) / sp);
        const fx = ch.fixAt, fb = this.steps.find(x => x.ci === ch.index && x.si === fx);
        if (fx >= 0 && fb && ch.rule && ch.rule.fix) this.shakes.push(fb.t0 + (1.6 + K.film.STAMP_FALL) / sp);
      });
    }
    shakeAt(T) {
      for (const t of this.shakes) {
        const u = T - t;
        if (u >= 0 && u < .2) { const a = 5 * (1 - u / .2); return [Math.sin(u * 97) * a, Math.cos(u * 83) * a * .7]; }
      }
      return [0, 0];
    }
    // the view: top-left corner of the visible page (poster units, all chapters stacked) and the zoom
    viewAt(T) {
      const W = this.f.W, top0 = this.camAt(T);
      let z = 1, cx = W / 2, cy = top0 + this.vh / 2;
      if (this.zmax > 1) {
        const { w, at } = this.pushAt(T);
        if (w > 0 && at) {
          z = 1 + (this.zmax - 1) * w;
          cx += (at[0] - cx) * w; cy += (at[1] - cy) * w;
        }
      }
      if (this.outro && T >= this.outro.at) {             // the overview: sweep down every poster, then stand back
        const u = (T - this.outro.at) / this.outro.dur, n = this.f.chapters.length, all = n * this.PH;
        const zFit = Math.min(1, this.vh / all * .96, 1);
        const sweep = K.clamp(u / .55), back = K.easeInOut(K.clamp((u - .5) / .3));
        const zs = Math.max(zFit, .55), ys = this.vh / zs / 2 + (all - this.vh / zs) * K.easeInOut(sweep);
        const zNow = z + (zs - z) * K.clamp(u / .12);
        z = zNow + (zFit - zNow) * back; cx = W / 2;
        cy = (cy + (ys - cy) * K.clamp(u / .12)) * (1 - back) + (all / 2) * back;
      }
      const vw = W / z, vhz = this.vh / z, all = this.f.chapters.length * this.PH;
      let left = cx - vw / 2, top = cy - vhz / 2;
      if (z >= 1) { left = Math.max(0, Math.min(W - vw, left)); top = Math.max(0, Math.min(Math.max(0, all - vhz + this.bar / this.k / z), top)); }
      const [sx, sy] = this.shakeAt(T);
      return { left: left + sx / z, top: top + sy / z, z };
    }
    stepAt(T) {
      let cur = -1;
      for (let i = 0; i < this.steps.length; i++) { if (T >= this.steps[i].t0) cur = i; else break; }
      return cur;
    }
    staticLayer(ci, boil) {
      const key = ci + ':' + boil;
      if (this.cache.has(key)) return this.cache.get(key);
      const s = this.k * this.zmax, c = document.createElement('canvas');
      c.width = Math.round(this.f.W * s); c.height = Math.round(this.PH * s);
      const g = c.getContext('2d'); g.scale(s, s);
      K.film.drawStatic(g, this.f, this.f.chapters[ci], boil);
      this.cache.set(key, c);
      return c;
    }
    talkAt(T) {
      const tk = this.talk;
      if (!tk || !tk.env || !tk.env.length) return 0;
      const i = Math.floor(T * (tk.fps || 30));
      return i >= 0 && i < tk.env.length ? tk.env[i] : 0;
    }
    moodAt(T, cur) {                                     // the active state's mood, eased in over 0.6 s
      if (cur < 0) return null;
      const A = this.steps[cur], ch = this.f.chapters[A.ci];
      const moodOf = st => { for (const id of st.on) { const s = ch.states[id]; if (s && s.mood) return s.mood; } return null; };
      const m = moodOf(A.s), prev = cur > 0 && this.steps[cur - 1].ci === A.ci ? moodOf(this.steps[cur - 1].s) : null;
      const u = K.clamp((T - A.t0) / .6);
      if (m === prev) return m ? { mood: m, w: 1 } : null;
      return m ? { mood: m, w: u, prev, pw: 1 - u } : prev ? { mood: prev, w: 1 - u } : null;
    }
    renderAt(T) {
      const g = this.g, f = this.f;
      if (this.hook && T < this.hook.dur) return this.renderHook(T);
      const cur = this.stepAt(T), A = cur >= 0 ? this.steps[cur] : { ci: 0, si: -1, t0: 0 };
      const t = cur >= 0 ? (T - A.t0) * f.speed : 0;
      const boil = Math.floor(T * 5) % 3;
      const view = this.viewAt(T), m = this.k * view.z;
      const outroOn = this.outro && T >= this.outro.at;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = C.bg; g.fillRect(0, 0, this.cv.width, this.cv.height);
      const sceneT = K.motion ? K.motion.beat(T, f.anim_fps) : T;
      const talk = this.talkAt(T), speaker = cur >= 0 ? (A.speaker || A.s.speaker) : null;
      const visH = this.full / view.z, xoff = 0;           // view.left already centres a zoomed-out page
      f.chapters.forEach((ch, ci) => {
        const top = ci * this.PH - view.top;
        if (top > visH || top + this.PH < 0) return;
        const ox = Math.round((xoff - view.left) * m), oy = Math.round(top * m);
        g.setTransform(1, 0, 0, 1, 0, 0);
        const layer = this.staticLayer(ci, boil);
        g.drawImage(layer, ox, oy, f.W * m, this.PH * m);
        g.setTransform(m, 0, 0, m, ox, oy);
        const n = ch.S.list.length;
        if (outroOn || ci < A.ci) this.live(g, ch, n, 99, T, sceneT, boil, n - 1, 0, null);
        else if (ci === A.ci) this.live(g, ch, A.si, t, T, sceneT, boil, A.si, talk, speaker);
        else this.live(g, ch, -1, 0, T, sceneT, boil, -1, 0, null);
      });
      g.setTransform(1, 0, 0, 1, 0, 0);
      const mood = outroOn ? null : this.moodAt(T, cur);
      if (mood) this.grade(g, mood, T);
      if (!outroOn && cur >= 0 && (this.opts.spotlight || A.s.spotlight)) this.spotlight(g, A, t, view, m);
      if (!outroOn && cur >= 0) this.inset(g, A, t, T, sceneT, boil, talk, speaker);
      if (this.opts.chip !== false) this.chip(g);
      if (this.aiLabel && T < 4.2) this.label(g, this.aiLabel, K.clamp(Math.min((T - .2) / .3, (4.2 - T) / .5)));
      if (outroOn) this.endCard(g, T);
      this.captionBar(g, cur, T, outroOn);
      return { step: cur, scroll: view.top, zoom: view.z };
    }
    live(g, ch, si, t, T, sceneT, boil, sceneStep, talk, speaker) {
      K.setBoil(boil);
      K.film.drawFixed(g, this.f, ch, si, t);
      K.setBoil(boil);
      if (ch.scene.fg) ch.scene.fg(K.film.kit(g, this.f, ch), K.film.sceneState(ch, sceneStep, si >= ch.S.list.length ? 99 : t, sceneT, { talk, speaker }));
      if (si >= 0) { K.setBoil(boil); K.film.drawChart(g, ch, si, t, T, { fade: !!this.opts.fade }); }
    }
    // the hook: the finished first poster and a question, then a quick wipe back to the empty page
    renderHook(T) {
      const g = this.g, f = this.f, ch = f.chapters[0], boil = Math.floor(T * 5) % 3, d = this.hook.dur;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = C.bg; g.fillRect(0, 0, this.cv.width, this.cv.height);
      const z = .92 + .06 * K.ease(K.clamp(T / d)), m = this.k * z, ox = (this.cv.width - f.W * m) / 2;
      g.setTransform(m, 0, 0, m, ox, 0);
      K.film.drawPoster(g, f, ch, boil);
      g.setTransform(1, 0, 0, 1, 0, 0);
      const wipe = K.clamp((T - (d - .55)) / .5);       // paper slides up over it: rewind to the start
      if (wipe > 0) {
        g.save(); g.setTransform(this.k, 0, 0, this.k, 0, this.cv.height * (1 - K.ease(wipe)));
        K.paper(g, f.W, this.full, 0); g.restore();
      }
      if (this.opts.chip !== false) this.chip(g);
      if (this.aiLabel) this.label(g, this.aiLabel, K.clamp(Math.min((T - .2) / .3, 1)));
      this.captionBar(g, -1, T, false, this.hook.text);
      return { step: -1, scroll: 0, zoom: z };
    }
    // the spotlight: everything but the active cards dims, as when you step through the chart by hand
    spotlight(g, A, t, view, m) {
      const ch = this.f.chapters[A.ci], L = ch.L, ids = A.s.on.length ? A.s.on : A.s.pass;
      if (!ids.length) return;
      const W = this.cv.width, H = this.cv.height - this.bar, a = K.clamp((t - .9) / .5) * .42;
      if (a <= 0) return;
      const c = this.spot || (this.spot = document.createElement('canvas'));
      c.width = W; c.height = H;
      const x = c.getContext('2d');
      x.fillStyle = `rgba(28,22,16,${a})`; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'destination-out';
      for (const id of ids) {
        const b = L.boxes[id]; if (!b) continue;
        const cx = (b.x - view.left) * m, cy = (A.ci * this.PH + b.y - view.top) * m, rx = (b.w / 2 + 46) * m, ry = ((b.h || 56) / 2 + 40) * m;
        const rg = x.createRadialGradient(cx, cy, 0, cx, cy, 1);
        rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(.72, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        x.save(); x.translate(cx, cy); x.scale(rx, ry); x.translate(-cx, -cy); x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, 1, 0, Math.PI * 2); x.fill(); x.restore();
      }
      g.drawImage(c, 0, 0);
    }
    // the microscope view: a round lens in the corner showing, close up, the spot an active state names with
    // "inset": [x, y, r] (poster units); it opens when the state does and closes when it ends
    inset(g, A, t, T, sceneT, boil, talk, speaker) {
      const ch = this.f.chapters[A.ci], id = A.s.on.find(x => ch.states[x] && ch.states[x].inset);
      if (!id) return;
      const [px, py, pr] = ch.states[id].inset, open = K.backOut(K.clamp((t - 1.1) / .5));
      if (open <= 0) return;
      const k = this.ui, R = 150 * k * open, cx = this.cv.width - R - 26 * k, cy = this.cv.height - this.bar - R - 26 * k;
      const z = R / (pr || 80);
      g.save();
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
      g.fillStyle = C.paper; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      g.setTransform(z, 0, 0, z, cx - px * z, cy - py * z);
      g.drawImage(this.staticLayer(A.ci, boil), 0, 0, this.f.W, this.PH);
      this.live(g, ch, A.si, t, T, sceneT, boil, A.si, talk, speaker);
      g.restore();
      g.save(); g.lineWidth = 7 * k; g.strokeStyle = C.ink; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 2 * k; g.strokeStyle = C.card; g.beginPath(); g.arc(cx, cy, R - 6 * k, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    // the active state's mood over the whole page: rain cools and greys, night darkens blue, alert reddens the
    // edges with a pulse, fixed / warm warm it up
    grade(g, md, T) {
      const W = this.cv.width, H = this.cv.height - this.bar;
      const one = (mood, w) => {
        if (!mood || w <= 0) return;
        g.save();
        if (mood === 'rain') {
          g.globalCompositeOperation = 'saturation'; g.globalAlpha = .35 * w; g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
          g.globalCompositeOperation = 'multiply'; g.globalAlpha = .16 * w; g.fillStyle = '#7f95c8'; g.fillRect(0, 0, W, H);
        } else if (mood === 'night') {
          g.globalCompositeOperation = 'multiply'; g.globalAlpha = .3 * w; g.fillStyle = '#4a5aa8'; g.fillRect(0, 0, W, H);
        } else if (mood === 'alert') {
          const p = .75 + .25 * Math.sin(T * 5);
          const rg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .32, W / 2, H / 2, Math.hypot(W, H) * .58);
          rg.addColorStop(0, 'rgba(216,27,74,0)'); rg.addColorStop(1, `rgba(216,27,74,${.28 * w * p})`);
          g.globalCompositeOperation = 'multiply'; g.fillStyle = rg; g.fillRect(0, 0, W, H);
        } else if (mood === 'fixed' || mood === 'warm') {
          g.globalCompositeOperation = 'soft-light'; g.globalAlpha = (mood === 'fixed' ? .32 : .22) * w; g.fillStyle = '#ffc86a'; g.fillRect(0, 0, W, H);
        }
        g.restore();
      };
      if (md.prev && md.pw) one(md.prev, md.pw);
      one(md.mood, md.w);
    }
    chip(g) {                                           // the maker's tag, styled like the reference's brand chip
      const s = this.f.watermark === undefined ? '制作：@leo_xiaolei/刘老板' : this.f.watermark;
      if (!s) return;
      const k = this.ui;
      g.save();
      g.font = `${Math.round(19 * k)}px ${FONT.type}`;
      const w = g.measureText(s).width + 22 * k, h = 34 * k;
      // top-right: the header (and its big title) lives top-left and must never sit under the tag
      g.translate(this.cv.width - w - 14 * k, 12 * k); g.rotate(1.5 * Math.PI / 180);
      g.globalAlpha = .9;
      g.fillStyle = 'rgba(33,64,214,.35)'; this.round(g, 3 * k, 3 * k, w, h, 6 * k); g.fill();
      g.fillStyle = C.card; this.round(g, 0, 0, w, h, 6 * k); g.fill();
      g.lineWidth = 2 * k; g.strokeStyle = K.S.dark ? C.cardInk : C.ink; this.round(g, 0, 0, w, h, 6 * k); g.stroke();
      g.fillStyle = C.cardInk; g.textBaseline = 'middle'; g.fillText(s, 11 * k, h / 2 + 1);
      g.restore();
    }
    label(g, s, a) {                                    // the explicit AI label: a small tag under the maker's chip
      if (a <= 0) return;
      const k = this.ui;
      g.save(); g.globalAlpha = a;
      g.font = `${Math.round(17 * k)}px ${FONT.mono}`;
      const w = g.measureText(s).width + 20 * k, h = 28 * k, x = this.cv.width - w - 16 * k, y = 56 * k;
      g.fillStyle = 'rgba(22,36,110,.82)'; this.round(g, x, y, w, h, 14 * k); g.fill();
      g.fillStyle = '#fbf7ec'; g.textBaseline = 'middle'; g.fillText(s, x + 10 * k, y + h / 2 + 1);
      g.restore();
    }
    // the closing card over the overview: series and episode, "next time", the AI label
    endCard(g, T) {
      const o = this.outro, u = (T - o.at) / o.dur, a = K.clamp((u - .62) / .12);
      if (a <= 0) return;
      const f = this.f, k = this.ui, W = this.cv.width, H = this.cv.height - this.bar;
      const lines = [];
      lines.push(f.series && f.episode ? `${f.series} · 第 ${f.episode} 集` : (f.series || f.title || ''));
      lines.push(f.next ? `下一集：${f.next}` : `《${f.title || ''}》 完`);
      g.save(); g.globalAlpha = a;
      g.font = `${Math.round(40 * k)}px ${FONT.type}`;
      const w = Math.max(...lines.map(l => g.measureText(l).width)) + 90 * k, h = 150 * k, x = (W - w) / 2, y = H * .5 - h / 2;
      g.translate(W / 2, y + h / 2); g.rotate(-.025); g.translate(-W / 2, -(y + h / 2));
      g.fillStyle = 'rgba(33,64,214,.3)'; this.round(g, x + 6 * k, y + 6 * k, w, h, 10 * k); g.fill();
      g.fillStyle = C.card; this.round(g, x, y, w, h, 10 * k); g.fill();
      g.lineWidth = 2.5 * k; g.strokeStyle = C.cardInk; this.round(g, x, y, w, h, 10 * k); g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${Math.round(24 * k)}px ${FONT.mono}`; g.fillStyle = C.guard; g.fillText(lines[0], W / 2, y + 44 * k);
      g.font = `${Math.round(40 * k)}px ${FONT.type}`; g.fillStyle = C.cardInk; g.fillText(lines[1], W / 2, y + 100 * k);
      g.restore();
      if (this.aiLabel) this.label(g, this.aiLabel, a);
    }
    round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    // where each region is now, on one small line above the strip ("the booster · the ship · the tower" in Catch)
    laneStatus(g, cur) {
      const { ci, s } = this.steps[cur], ch = this.f.chapters[ci];
      if (!ch.regions || ch.regions.lanes.length < 2) return;
      const parts = ch.regions.lanes.map(l => { const id = s.on.find(x => l.states.includes(x)); return id ? `${l.title || l.id} · ${(ch.states[id] && ch.states[id].label) || id}` : null; }).filter(Boolean);
      if (parts.length < 2) return;
      const k = this.ui, W = this.cv.width, H = this.cv.height, y = H - this.bar - 20 * k, text = parts.join('      ');
      g.save(); g.font = `${Math.round(22 * k)}px ${FONT.mono}`;
      const w = g.measureText(text).width + 28 * k;
      g.fillStyle = K.S.dark ? 'rgba(20,26,51,.85)' : 'rgba(251,247,236,.9)'; this.round(g, (W - w) / 2, y - 18 * k, w, 36 * k, 18 * k); g.fill();
      g.fillStyle = C.cardInk; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, y + 1);
      g.restore();
    }
    // how much of a step's note the narration has read at T: from the voice's character times, else everything
    spokenChars(st, T) {
      const ch = st.chars;
      if (!ch || !ch.length) return null;
      let n = 0;
      for (const c of ch) { if (T >= c[1]) n++; else break; }
      return n;
    }
    captionBar(g, cur, T, outro = false, hookText = null) {
      const W = this.cv.width, H = this.cv.height, b = this.bar, k = this.ui;
      g.save();
      const grad = g.createLinearGradient(0, H - b - 14 * k, 0, H - b);
      grad.addColorStop(0, 'rgba(60,40,10,0)'); grad.addColorStop(1, 'rgba(60,40,10,.10)');
      g.fillStyle = grad; g.fillRect(0, H - b - 14 * k, W, 14 * k);
      g.fillStyle = K.S.dark ? 'rgba(20,26,51,.95)' : 'rgba(245,241,232,.95)'; g.fillRect(0, H - b, W, b);
      g.fillStyle = C.ink; g.fillRect(0, H - b, W, 2 * k);
      let lead = '', note = '', count = '', spoken = null;
      if (hookText) note = hookText;
      else if (outro) note = this.f.title ? `《${this.f.title}》` : '';
      else if (cur >= 0) {
        const st = this.steps[cur], { ci, si, s } = st, ch = this.f.chapters[ci];
        if (s.note) { lead = `${ch.num}.${si + 1} — `; note = s.note; spoken = this.spokenChars(st, T); }
        count = `${cur + 1}/${this.steps.length}`;
      } else note = this.f.title ? `《${this.f.title}》` : '';
      const size = Math.round((this.opts.captionSize || 31) * k);
      let fs = size;
      g.font = `italic ${fs}px ${FONT.mono}`;
      while (g.measureText(lead + note).width > W - 190 * k && fs > 18 * k) { fs -= 1; g.font = `italic ${fs}px ${FONT.mono}`; }
      g.textBaseline = 'middle';
      const y = H - b / 2 + 2 * k, wl = g.measureText(lead).width, wn = g.measureText(note).width;
      let x = W / 2 - (wl + wn) / 2;
      const ink = K.S.dark ? C.ink : C.inkD;
      g.textAlign = 'left'; g.fillStyle = ink; g.fillText(lead, x, y); x += wl;
      if (spoken == null || spoken >= Array.from(note).length) { g.fillStyle = ink; g.fillText(note, x, y); }
      else {                                              // karaoke: what has been read is dark, the rest waits in grey
        const arr = Array.from(note), done = arr.slice(0, spoken).join(''), rest = arr.slice(spoken).join('');
        g.fillStyle = ink; g.fillText(done, x, y);
        const wd = g.measureText(done).width;
        g.globalAlpha = .42; g.fillText(rest, x + wd, y); g.globalAlpha = 1;
        if (spoken > 0) { g.fillStyle = C.active; g.globalAlpha = .55; g.fillRect(x, y + fs * .55, wd, Math.max(2, 2.5 * k)); g.globalAlpha = 1; }
      }
      if (count) {
        g.font = `${Math.round(19 * k)}px ${FONT.mono}`; g.fillStyle = C.active; g.textAlign = 'right';
        g.fillText(count, W - 22 * k, y);
      }
      g.restore();
      if (cur >= 0 && !outro && !hookText && this.opts.lanes !== false) this.laneStatus(g, cur);
    }
  }
  K.Player = Player;
})();

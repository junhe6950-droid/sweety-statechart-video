/* sweety-statechart-video · player.js — one long page of posters, played like the reference: each step draws its
 * arrows (bead in front, words typing), pops its cards and rings the active ones; the page scrolls to keep the step in
 * view; every line boils (3 drawings, 5 a second); the caption strip at the bottom reads "I.3 — …".
 * Deterministic: renderAt(T) draws the frame at film time T, for the recorder. */
(function () {
  const K = window.SCV, { C, FONT } = K;

  class Player {
    constructor(canvas, film, timing, opts = {}) {
      this.cv = canvas; this.g = canvas.getContext('2d');
      this.f = film; this.opts = opts;
      const [Wpx, Hpx] = film.size;
      canvas.width = Wpx; canvas.height = Hpx;
      this.k = Wpx / film.W;
      this.bar = Math.round(Hpx * (opts.barShare || .076));
      this.vh = (Hpx - this.bar) / this.k;               // visible page height above the caption strip, poster units
      this.full = Hpx / this.k;
      this.PH = film.H;
      this.steps = [];
      film.chapters.forEach((ch, ci) => ch.S.list.forEach((s, si) => this.steps.push({ ci, si, s })));
      this.timing = timing || this.defaultTiming();
      this.timing.steps.forEach((t, i) => Object.assign(this.steps[i], t));
      this.total = this.timing.total;
      this.cache = new Map();
      this.planCamera();
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
        else if (rel > this.vh * .22 && rel < this.vh * .72) return;
        else target = y - this.vh * .55;
        target = Math.max(0, Math.min(maxScroll, target));
        if (Math.abs(target - cur) < .5) return;
        segs.push({ t0: st.t0, d: Math.min(1.6, .6 + Math.abs(target - cur) * this.k / 1500), from: cur, to: target });
      });
      this.camAt = at;
      this.camSegs = segs;
    }
    stepAt(T) {
      let cur = -1;
      for (let i = 0; i < this.steps.length; i++) { if (T >= this.steps[i].t0) cur = i; else break; }
      return cur;
    }
    staticLayer(ci, boil) {
      const key = ci + ':' + boil;
      if (this.cache.has(key)) return this.cache.get(key);
      const c = document.createElement('canvas');
      c.width = this.cv.width; c.height = Math.round(this.PH * this.k);
      const g = c.getContext('2d'); g.scale(this.k, this.k);
      K.film.drawStatic(g, this.f, this.f.chapters[ci], boil);
      this.cache.set(key, c);
      return c;
    }
    renderAt(T) {
      const g = this.g, f = this.f, k = this.k;
      const cur = this.stepAt(T), A = cur >= 0 ? this.steps[cur] : { ci: 0, si: -1, t0: 0 };
      const t = cur >= 0 ? (T - A.t0) * f.speed : 0;
      const boil = Math.floor(T * 5) % 3;
      const scroll = this.camAt(T);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#e9e3d6'; g.fillRect(0, 0, this.cv.width, this.cv.height);
      f.chapters.forEach((ch, ci) => {
        const top = ci * this.PH - scroll;
        if (top > this.full || top + this.PH < 0) return;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(this.staticLayer(ci, boil), 0, Math.round(top * k));
        g.setTransform(k, 0, 0, k, 0, Math.round(top * k));
        const n = ch.S.list.length;
        if (ci < A.ci) this.live(g, ch, n, 99, T, boil, n - 1);
        else if (ci === A.ci) this.live(g, ch, A.si, t, T, boil, A.si);
        else this.live(g, ch, -1, 0, T, boil, -1);
      });
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (this.opts.chip !== false) this.chip(g);
      this.captionBar(g, cur, T);
      return { step: cur, scroll };
    }
    live(g, ch, si, t, T, boil, sceneStep) {
      K.setBoil(boil);
      if (ch.scene.fg) ch.scene.fg(K.film.kit(g, this.f, ch), K.film.sceneState(ch, sceneStep, si >= ch.S.list.length ? 99 : t, T));
      if (si >= 0) { K.setBoil(boil); K.film.drawChart(g, ch, si, t, T); }
    }
    chip(g) {                                           // the maker's tag, pinned top-left like the reference's brand chip
      const s = this.f.watermark === undefined ? '制作：@leo_xiaolei/刘老板' : this.f.watermark;
      if (!s) return;
      const k = this.cv.width / 1080;
      g.save();
      g.translate(12 * k, 10 * k); g.rotate(-1.5 * Math.PI / 180);
      g.font = `${Math.round(19 * k)}px ${FONT.type}`;
      const w = g.measureText(s).width + 22 * k, h = 34 * k;
      g.globalAlpha = .9;
      g.fillStyle = 'rgba(33,64,214,.35)'; this.round(g, 3 * k, 3 * k, w, h, 6 * k); g.fill();
      g.fillStyle = '#fbf7ec'; this.round(g, 0, 0, w, h, 6 * k); g.fill();
      g.lineWidth = 2 * k; g.strokeStyle = C.ink; this.round(g, 0, 0, w, h, 6 * k); g.stroke();
      g.fillStyle = C.navy; g.textBaseline = 'middle'; g.fillText(s, 11 * k, h / 2 + 1);
      g.restore();
    }
    round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    captionBar(g, cur, T) {
      const W = this.cv.width, H = this.cv.height, b = this.bar, k = W / 1080;
      g.save();
      const grad = g.createLinearGradient(0, H - b - 14 * k, 0, H - b);
      grad.addColorStop(0, 'rgba(60,40,10,0)'); grad.addColorStop(1, 'rgba(60,40,10,.10)');
      g.fillStyle = grad; g.fillRect(0, H - b - 14 * k, W, 14 * k);
      g.fillStyle = 'rgba(245,241,232,.95)'; g.fillRect(0, H - b, W, b);
      g.fillStyle = C.ink; g.fillRect(0, H - b, W, 2 * k);
      let note = '', count = '';
      if (cur >= 0) {
        const { ci, si, s } = this.steps[cur], ch = this.f.chapters[ci];
        note = s.note ? `${ch.num}.${si + 1} — ${s.note}` : '';
        count = `${cur + 1}/${this.steps.length}`;
      } else note = this.f.title ? `《${this.f.title}》` : '';
      const size = Math.round((this.opts.captionSize || 31) * k);
      g.font = `italic ${size}px ${FONT.mono}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      let fs = size;
      while (g.measureText(note).width > W - 190 * k && fs > 18 * k) { fs -= 1; g.font = `italic ${fs}px ${FONT.mono}`; }
      g.fillStyle = C.inkD;
      g.fillText(note, W / 2, H - b / 2 + 2 * k);
      if (count) {
        g.font = `${Math.round(19 * k)}px ${FONT.mono}`; g.fillStyle = C.pink; g.textAlign = 'right';
        g.fillText(count, W - 22 * k, H - b / 2 + 2 * k);
      }
      g.restore();
    }
  }
  K.Player = Player;
})();

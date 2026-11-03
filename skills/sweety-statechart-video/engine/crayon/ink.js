/* sweety-statechart-video · ink.js
 * Crayon on paper, drawn in code: seeded randomness, a grainy colour "tooth", wobbly multi-pass strokes,
 * clipped hatching, radial hatching, and a 3-frame line boil. Everything takes coordinates in poster units
 * (a poster is 1000 wide); the canvas transform scales to pixels, and the grain scales with it.
 * The look follows Ann Nguyen's crayon statechart ("the making of nhang"); this is our own implementation.
 */
(function () {
  const TAU = Math.PI * 2, PI = Math.PI;
  const C = {
    ink: '#2140d6', inkD: '#1a2c9c', navy: '#16246e',
    pink: '#e8175d', red: '#d81b4a', redD: '#b80f3c', rose: '#ff5a8c',
    straw: '#f5c935', ochre: '#e39a1c', orange: '#ff7f1e', flame: '#ffb31f', yolk: '#ffd84a',
    green: '#8fd65f', greenD: '#3fa748', leaf: '#62c24e',
    blue: '#2c4fe0', blueL: '#8fb6f5', sky: '#bcd6fb', lilac: '#a7a2ee', violet: '#5b4fe0',
    cream: '#fbeccb', creamD: '#f2d9a6', peach: '#f6c99a', teal: '#55dfc0', mint: '#9ff0d4',
    skin: '#f7c6a0', skinD: '#e9a27c', white: '#fdfcf8', paper: '#f5f1e8', grey: '#b9b6d6',
    tan: '#c98b4e', brown: '#9a5a2c', black: '#23233a',
  };

  /* ---------- seeded randomness: every drawn thing seeds by name, so it is stable until the boil frame changes ---- */
  function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  function prng(a) {                       // mulberry32
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const S = { rand: Math.random, boil: 0 };
  const seed = id => { S.rand = prng(fnv(String(id)) + S.boil * 7919); };
  const setBoil = b => { S.boil = b; };
  const rnd = (a = 0, b = 1) => a + (b - a) * S.rand();
  const pick = arr => arr[(S.rand() * arr.length) | 0];
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const easeInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const backOut = t => { t = clamp(t); const k = 1.7; return 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2); };

  /* ---------- tooth: the colour with speckled holes, as a repeating pattern ---------- */
  const tooth = new Map();
  const scratch = document.createElement('canvas').getContext('2d');
  function grain(color, holes = .42) {
    color = C[color] || color;                 // palette names work everywhere
    const key = color + '|' + holes;
    let p = tooth.get(key);
    if (p) return p;
    const n = 96, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, n, n);
    g.globalCompositeOperation = 'destination-out';
    const r = prng(fnv(key));
    for (let i = 0, m = n * n * holes; i < m; i++) { g.globalAlpha = r() * .95; g.fillRect((r() * n) | 0, (r() * n) | 0, r() < .2 ? 2 : 1, 1); }
    p = scratch.createPattern(c, 'repeat');
    try { p.setTransform(new DOMMatrix().scale(.62)); } catch (e) { /* older engines: unscaled tooth */ }
    tooth.set(key, p);
    return p;
  }

  /* ---------- geometry ---------- */
  function resample(pts, step, closed) {
    const P = closed ? pts.concat([pts[0]]) : pts, out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    if (!closed && P.length) out.push(P[P.length - 1]);
    return out;
  }
  function wobble(P, amp) {                // slow sines plus a little noise: a hand that drifts
    const p1 = rnd(0, TAU), p2 = rnd(0, TAU), q1 = rnd(0, TAU), q2 = rnd(0, TAU), f1 = rnd(.05, .1), f2 = rnd(.18, .32);
    return P.map((p, i) => [
      p[0] + amp * (Math.sin(i * f1 + p1) * .7 + Math.sin(i * f2 + p2) * .3 + rnd(-.25, .25)),
      p[1] + amp * (Math.sin(i * f1 + q1) * .7 + Math.sin(i * f2 + q2) * .3 + rnd(-.25, .25))]);
  }
  function ell(cx, cy, rx, ry, n = 36, a0 = 0, a1 = TAU, rot = 0) {
    const out = [], full = Math.abs(a1 - a0 - TAU) < 1e-9, cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * i / (full ? n : n - 1), x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      out.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
    }
    return out;
  }
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  function bez(p0, p1, p2, p3, n = 16) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
    return out;
  }
  function qbez(p0, p1, p2, n = 12) {
    const out = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]); }
    return out;
  }
  function smooth(pts, iter = 2, closed = true) {   // Chaikin corner cutting
    let P = pts;
    for (let k = 0; k < iter; k++) {
      const o = [], n = P.length;
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const a = P[i], b = P[(i + 1) % n];
        o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
      }
      if (!closed) { o.unshift(P[0]); o.push(P[n - 1]); }
      P = o;
    }
    return P;
  }
  function rounded(pts, r = 16) {          // polyline with quadratic fillets at the corners
    if (pts.length < 3) return pts.slice();
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const d1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, d2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1, rr = Math.min(r, d1 / 2, d2 / 2);
      const p = [b[0] + (a[0] - b[0]) * rr / d1, b[1] + (a[1] - b[1]) * rr / d1], q = [b[0] + (c[0] - b[0]) * rr / d2, b[1] + (c[1] - b[1]) * rr / d2];
      out.push(...qbez(p, b, q, 6));
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function capsule(pl, w, w2) {            // a thick limb/stick around a polyline, round caps, tapering w -> w2
    const n = pl.length, L = [], Rt = [];
    if (w2 == null) w2 = w;
    let a0 = 0, aE = 0;
    for (let i = 0; i < n; i++) {
      const a = pl[Math.max(0, i - 1)], b = pl[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
      const hw = lerp(w, w2, i / Math.max(1, n - 1)) / 2, nx = -ty, ny = tx;
      L.push([pl[i][0] + nx * hw, pl[i][1] + ny * hw]); Rt.push([pl[i][0] - nx * hw, pl[i][1] - ny * hw]);
      if (i === 0) a0 = Math.atan2(ny, nx);
      if (i === n - 1) aE = Math.atan2(ny, nx);
    }
    const capE = [], capS = [], pe = pl[n - 1], ps = pl[0];
    for (let k = 1; k < 7; k++) { const a = aE - PI * k / 7; capE.push([pe[0] + Math.cos(a) * w2 / 2, pe[1] + Math.sin(a) * w2 / 2]); }
    for (let k = 1; k < 7; k++) { const a = a0 + PI - PI * k / 7; capS.push([ps[0] + Math.cos(a) * w / 2, ps[1] + Math.sin(a) * w / 2]); }
    return L.concat(capE, Rt.reverse(), capS);
  }
  function bbox(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  function path2d(pts) { const p = new Path2D(); pts.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])); p.closePath(); return p; }
  const move = (pts, dx, dy, s = 1) => pts.map(p => [p[0] * s + dx, p[1] * s + dy]);
  const turn = (pts, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return pts.map(p => { const x = p[0] - cx, y = p[1] - cy; return [cx + x * c - y * s, cy + x * s + y * c]; }); };
  const flipX = (pts, cx) => pts.map(p => [2 * cx - p[0], p[1]]);
  function lengthOf(P) { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; }
  function along(P, f) {                   // point at fraction f of a polyline's length
    const L = lengthOf(P) * clamp(f);
    let acc = 0;
    for (let i = 1; i < P.length; i++) {
      const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      if (acc + d >= L) { const k = d ? (L - acc) / d : 0; return [lerp(P[i - 1][0], P[i][0], k), lerp(P[i - 1][1], P[i][1], k)]; }
      acc += d;
    }
    return P[P.length - 1].slice();
  }

  /* ---------- strokes ---------- */
  // A crayon line: two passes of a wobbling, tooth-filled stroke whose width breathes along the path.
  function line(ctx, pts, o = {}) {
    const color = o.color || C.ink, w = o.w || 2.6, amp = o.amp ?? 1.1, closed = !!o.closed;
    let P = resample(pts, 4, closed);
    if (closed) P = P.concat(P.slice(1, Math.min(P.length, 3 + ((S.rand() * 5) | 0))));   // the crayon overshoots its start
    if (o.progress != null && o.progress < 1) {
      if (o.progress <= 0) return P;
      P = P.slice(0, Math.max(2, Math.ceil(P.length * o.progress)));
    }
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = grain(color, o.holes ?? .3);
    const passes = o.passes || 2, base = o.alpha ?? 1;
    for (let k = 0; k < passes; k++) {
      const J = wobble(P, amp * (k ? 1.5 : 1)), ph = rnd(0, TAU);
      ctx.globalAlpha = base * (k ? .5 : .95);
      for (let s = 0; s < J.length - 1; s += 10) {
        ctx.lineWidth = w * (k ? .55 : 1) * (.78 + .38 * (.5 + .5 * Math.sin(s * .07 + ph)));
        ctx.beginPath(); ctx.moveTo(J[s][0], J[s][1]);
        for (let i = s + 1; i <= Math.min(J.length - 1, s + 10); i++) ctx.lineTo(J[i][0], J[i][1]);
        ctx.stroke();
      }
    }
    ctx.restore();
    return P;
  }
  // Hatching clipped to a shape: a tooth wash, then layers of broken parallel strokes.
  function hatch(ctx, pts, o = {}) {
    const color = o.color || C.ink, b = bbox(pts), shape = o.path || path2d(pts);
    ctx.save(); ctx.clip(shape);
    if (o.solid) { ctx.fillStyle = o.solid; ctx.fill(shape); }
    if (o.base !== 0) { ctx.globalAlpha = o.base ?? .5; ctx.fillStyle = grain(color, .5); ctx.fill(shape); }
    ctx.lineCap = 'round';
    for (const ly of (o.layers || [{}])) {
      const col = ly.color || color, gap = ly.gap || o.gap || 3.4, ang = (ly.angle ?? o.angle ?? -1.05) + rnd(-.08, .08);
      const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, L = Math.hypot(b.w, b.h) / 2 + 6;
      ctx.strokeStyle = grain(col, .35);
      for (let d = -L; d < L; d += gap * rnd(.65, 1.35)) {
        ctx.globalAlpha = rnd(.45, .95) * (ly.alpha ?? o.alpha ?? 1);
        ctx.lineWidth = (ly.w || o.w || 1.9) * rnd(.7, 1.3);
        const ox = b.cx + nx * d, oy = b.cy + ny * d;
        let t = -L - rnd(0, 12);
        ctx.beginPath();
        while (t < L) {
          const t2 = Math.min(L, t + rnd(20, 140)), bend = rnd(-1.6, 1.6);
          ctx.moveTo(ox + dx * t, oy + dy * t);
          ctx.quadraticCurveTo(ox + dx * (t + t2) / 2 + nx * bend, oy + dy * (t + t2) / 2 + ny * bend, ox + dx * t2, oy + dy * t2);
          t = t2 + (S.rand() < .5 ? rnd(0, 7) : 0);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  // Rays from a hub, for fans, cones, flames and hats.
  function radial(ctx, pts, hx, hy, o = {}) {
    const b = bbox(pts), shape = path2d(pts);
    const Rm = Math.hypot(Math.max(Math.abs(b.x0 - hx), Math.abs(b.x1 - hx)), Math.max(Math.abs(b.y0 - hy), Math.abs(b.y1 - hy))) + 4;
    ctx.save(); ctx.clip(shape);
    if (o.solid) { ctx.fillStyle = o.solid; ctx.fill(shape); }
    ctx.globalAlpha = o.base ?? .6; ctx.fillStyle = grain(o.color, .5); ctx.fill(shape);
    const cols = o.cols || [o.color], n = o.n || 70, a0 = o.a0 ?? -PI, a1 = o.a1 ?? 0;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i + rnd(-.4, .4)) / n, r0 = rnd(0, Rm * (o.inner ?? .1)), r1 = Rm * rnd(.75, 1.05), bend = rnd(-.04, .04);
      ctx.strokeStyle = grain(pick(cols), .35); ctx.globalAlpha = rnd(.5, 1); ctx.lineWidth = (o.w || 1.8) * rnd(.7, 1.4);
      ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * r0, hy + Math.sin(a) * r0);
      ctx.quadraticCurveTo(hx + Math.cos(a + bend) * r1 * .5, hy + Math.sin(a + bend) * r1 * .5, hx + Math.cos(a) * r1, hy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Fill (hatch or radial) then outline. o.fill colour, o.h hatch options, o.radial [hx, hy] + o.r options, o.stroke null = none.
  function shape(ctx, pts, o = {}) {
    if (o.fill) {
      if (o.radial) radial(ctx, pts, o.radial[0], o.radial[1], Object.assign({ color: o.fill, solid: o.solid }, o.r || {}));
      else hatch(ctx, pts, Object.assign({ color: o.fill, solid: o.solid }, o.h || {}));
    }
    if (o.stroke !== null) line(ctx, pts, { color: o.stroke || C.ink, w: o.w || 2.6, closed: !o.open, amp: o.amp, alpha: o.alpha });
  }
  function dot(ctx, x, y, r, fill, o = {}) {
    shape(ctx, ell(x, y, r, r, Math.max(10, (r * 2) | 0)), Object.assign({ fill, w: o.w || 2.2, solid: o.solid, h: { gap: 2.4, base: .7 } }, o));
  }
  function blob(ctx, x, y, r, color, alpha = 1) {      // a soft tooth disc, no outline (cheeks, glows, dust)
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = grain(color, .3); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
  }
  function scribble(ctx, x, y, w, h, color, o = {}) {  // loose back-and-forth crayon scribble
    ctx.save(); ctx.strokeStyle = grain(color, .45); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = o.alpha ?? .5; ctx.lineWidth = o.w || 1.8;
    const ang = o.angle ?? -.9, n = o.n || 12, L = o.len || 20;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), cx = x + w * t, cy = y + h * t + rnd(-3, 3), sg = i % 2 ? 1 : -1;
      const px = cx + Math.cos(ang) * L * sg, py = cy + Math.sin(ang) * L * sg;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke(); ctx.restore();
  }

  /* ---------- typewriter ink ---------- */
  const FONT = {
    type: '"Special Elite", "SCV Type", "Songti SC", serif',          // titles, ticket labels
    mono: '"Courier Prime", "SCV Hand", "Kaiti SC", monospace',        // notes, edge labels, captions
  };
  function text(ctx, s, x, y, o = {}) {
    ctx.save();
    ctx.font = o.font || `22px ${FONT.type}`; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = grain(o.color || C.inkD, o.holes ?? .18); ctx.globalAlpha = o.alpha ?? 1;
    if (o.ls) { try { ctx.letterSpacing = o.ls + 'px'; } catch (e) { /* not supported */ } }
    const str = o.chars != null ? Array.from(s).slice(0, Math.max(0, Math.floor(o.chars))).join('') : s;
    ctx.fillText(str, x, y);
    if (o.double) { ctx.globalAlpha *= .35; ctx.fillText(str, x + .7, y + .4); }   // a second strike, slightly off
    ctx.restore();
  }
  const GUARD = /(\[[^\]]*\]?)/;
  // Edge words: [guards] in red, the rest in ink; '\n' breaks lines; o.chars reveals like a typewriter.
  function words(ctx, s, x, y, o = {}) {
    const size = o.size || 19, lh = o.lh || size * 1.22;
    ctx.save(); ctx.font = `${o.upright ? '' : 'italic '}${size}px ${o.family || FONT.mono}`; ctx.textBaseline = 'alphabetic';
    let used = 0; const total = o.chars ?? 1e9;
    s.split('\n').forEach((ln, li) => {
      const parts = ln.split(GUARD).filter(Boolean), wTot = ctx.measureText(ln).width;
      let cx = o.align === 'right' ? x - wTot : o.align === 'center' ? x - wTot / 2 : x;
      for (const p of parts) {
        const chars = Array.from(p), guard = p[0] === '[', vis = Math.max(0, Math.min(chars.length, total - used));
        used += chars.length;
        if (vis > 0) { ctx.fillStyle = grain(guard ? C.red : (o.color || C.inkD), .15); ctx.globalAlpha = o.alpha ?? 1; ctx.fillText(chars.slice(0, vis).join(''), cx, y + li * lh); }
        cx += ctx.measureText(p).width;
      }
    });
    ctx.restore();
  }
  function measureWords(ctx, s, size, family) {
    ctx.save(); ctx.font = `italic ${size}px ${family || FONT.mono}`;
    const lines = s.split('\n'), w = Math.max(...lines.map(l => ctx.measureText(l).width));
    ctx.restore();
    return { w, h: size * 1.22 * (lines.length - 1) + size, lines: lines.length };
  }
  const charCount = s => Array.from(s.replace(/\n/g, '')).length;

  /* ---------- paper ---------- */
  function paper(ctx, w, h, k = 0) {
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, w, h);
    const n = document.createElement('canvas'); n.width = n.height = 200;
    const g = n.getContext('2d'), r = prng(7);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() < .5 ? `rgba(120,100,70,${r() * .07})` : `rgba(255,255,255,${r() * .35})`;
      g.fillRect(r() * 200, r() * 200, r() * 2 + .5, r() * 2 + .5);
    }
    ctx.fillStyle = ctx.createPattern(n, 'repeat'); ctx.fillRect(0, 0, w, h);
    const r2 = prng(31 + k);
    ctx.save(); ctx.globalAlpha = .05; ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = .6;
    for (let i = 0, m = 260 * w * h / 1e6; i < m; i++) {        // fibres
      const x = r2() * w, y = r2() * h, a = r2() * TAU, L = r2() * 14 + 3;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a + 1) * L * .5, y + Math.sin(a + 1) * L * .5, x + Math.cos(a) * L, y + Math.sin(a) * L);
      ctx.stroke();
    }
    ctx.restore();
  }

  window.SCV = Object.assign(window.SCV || {}, {
    TAU, PI, C, FONT, S, seed, setBoil, rnd, pick, clamp, lerp, ease, easeInOut, backOut, prng, fnv,
    grain, resample, wobble, ell, rect, bez, qbez, smooth, rounded, capsule, bbox, path2d, move, turn, flipX, lengthOf, along,
    line, hatch, radial, shape, dot, blob, scribble, text, words, measureWords, charCount, paper,
  });
})();

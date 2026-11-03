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
  // roles (theme.js rewrites them with the palette): text on paper and on cards, the active colour, guard red, ok green
  Object.assign(C, { title: C.navy, cardInk: C.navy, active: C.pink, guard: C.red, ok: '#178a9a', past: C.grey, card: '#fbf7ec', bg: '#e9e3d6' });
  // drawing state: reveal (0..1, a scene being drawn on), depth ('far' | 'mid' | 'near'), how crayon layers mix
  const S = { rand: Math.random, boil: 0, reveal: 1, depth: 'mid', blend: 'multiply', paperKind: 'cream', misreg: 0, dark: false,
    penW: 1, penAmp: 1, penPasses: 0, fillAlpha: 1, fillGap: 1, fillBase: 1, inkText: true };   // pen/fill: a theme's medium
  const seed = id => { S.rand = prng(fnv(String(id)) + S.boil * 7919); };
  const TIER = { outline: 3.2, structure: 2, detail: 1.2 };     // line widths: outer contour, inner structure, detail
  const named = c => C[c] || c;
  const mixCache = new Map();
  function toward(c, to, t) {                // mix two #rrggbb colours (anything else is returned as it is)
    c = named(c);
    if (typeof c !== 'string' || c[0] !== '#' || !to || to[0] !== '#') return c;
    const key = c + to + t;
    let v = mixCache.get(key);
    if (v) return v;
    const p = h => { h = h.slice(1); if (h.length === 3) h = h.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const a = p(c), b = p(to);
    v = '#' + a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, '0')).join('');
    mixCache.set(key, v);
    return v;
  }
  // far things are paler and thinner, near ones a little heavier: the cheapest depth there is
  const depthColor = c => S.depth === 'far' ? toward(c, C.paper, .42) : named(c);
  const depthW = w => w * (S.depth === 'far' ? .75 : S.depth === 'near' ? 1.12 : 1);
  function within(key, value, draw) { const old = S[key]; S[key] = value; try { return draw(); } finally { S[key] = old; } }
  const atDepth = (level, draw) => within('depth', level, draw);
  const revealing = (p, draw) => within('reveal', clamp(p) * S.reveal, draw);
  function layer(ctx) {                      // crayon over crayon: multiply on light paper, opaque on dark
    if (S.blend && S.blend !== 'source-over') ctx.globalCompositeOperation = S.blend;
  }
  function misregister(ctx, color) {         // riso: each ink sits a little off register
    if (!S.misreg) return;
    const h = fnv(String(color)), a = (h % 628) / 100;
    ctx.translate(Math.cos(a) * S.misreg, Math.sin(a) * S.misreg);
  }
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
    const color = depthColor(o.color || C.ink), w = depthW(o.w || 2.6) * S.penW, amp = (o.amp ?? 1.1) * S.penAmp, closed = !!o.closed;
    let P = resample(pts, 4, closed);
    if (closed) P = P.concat(P.slice(1, Math.min(P.length, 3 + ((S.rand() * 5) | 0))));   // the crayon overshoots its start
    const prog = Math.min(o.progress ?? 1, S.reveal);
    if (prog < 1) {
      if (prog <= 0) return P;
      P = P.slice(0, Math.max(2, Math.ceil(P.length * prog)));
    }
    ctx.save();
    layer(ctx); misregister(ctx, color);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = grain(color, o.holes ?? .3);
    const passes = S.penPasses || o.passes || 2, base = (o.alpha ?? 1) * (S.depth === 'far' ? .85 : 1), n = P.length;
    // pressure: an open stroke lands a little heavy and lifts off thinner; a closed one keeps its weight
    const press = u => closed || o.taper === false ? 1 : Math.min(1, .62 + u * 5) * Math.min(1, .5 + (1 - u) * 4);
    for (let k = 0; k < passes; k++) {
      const J = wobble(P, amp * (k ? 1.5 : 1)), ph = rnd(0, TAU);
      ctx.globalAlpha = base * (k ? .5 : .95);
      for (let s = 0; s < J.length - 1; s += 10) {
        ctx.lineWidth = w * (k ? .55 : 1) * (.78 + .38 * (.5 + .5 * Math.sin(s * .07 + ph))) * press((s + 5) / n);
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
    const color = depthColor(o.color || C.ink), b = bbox(pts), shape = o.path || path2d(pts);
    if (S.reveal <= 0) return;
    const far = S.depth === 'far', rv = S.reveal;
    ctx.save(); ctx.clip(shape);
    if (o.solid) { ctx.globalAlpha = Math.min(1, rv * 2); ctx.fillStyle = named(o.solid); ctx.fill(shape); }
    layer(ctx); misregister(ctx, color);
    if (o.base !== 0) { ctx.globalAlpha = (o.base ?? .5) * rv * (far ? .8 : 1) * S.fillBase; ctx.fillStyle = grain(color, .5); ctx.fill(shape); }
    ctx.lineCap = 'round';
    for (const ly of (o.layers || [{}])) {
      const col = depthColor(ly.color || color), gap = (ly.gap || o.gap || 3.4) * (far ? 1.35 : 1) * S.fillGap, ang = (ly.angle ?? o.angle ?? -1.05) + rnd(-.08, .08);
      const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, L = Math.hypot(b.w, b.h) / 2 + 6;
      ctx.strokeStyle = grain(col, .35);
      const stop = -L + 2 * L * rv;                    // drawing on: the hatching sweeps across the shape
      for (let d = -L; d < stop; d += gap * rnd(.65, 1.35)) {
        ctx.globalAlpha = rnd(.45, .95) * (ly.alpha ?? o.alpha ?? 1) * (far ? .8 : 1) * S.fillAlpha;
        ctx.lineWidth = (ly.w || o.w || 1.9) * rnd(.7, 1.3) * (S.penW < 1 ? .6 : 1);
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
    if (S.reveal <= 0) return;
    ctx.save(); ctx.clip(shape);
    if (o.solid) { ctx.globalAlpha = Math.min(1, S.reveal * 2); ctx.fillStyle = named(o.solid); ctx.fill(shape); }
    layer(ctx);
    ctx.globalAlpha = (o.base ?? .6) * S.reveal; ctx.fillStyle = grain(depthColor(o.color), .5); ctx.fill(shape);
    const cols = (o.cols || [o.color]).map(depthColor), n = o.n || 70, a0 = o.a0 ?? -PI, a1 = o.a1 ?? 0;
    ctx.lineCap = 'round';
    for (let i = 0; i < Math.ceil(n * S.reveal); i++) {
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
    ctx.save(); layer(ctx); ctx.globalAlpha = alpha * S.reveal; ctx.fillStyle = grain(depthColor(color), .3); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
  }
  function scribble(ctx, x, y, w, h, color, o = {}) {  // loose back-and-forth crayon scribble
    ctx.save(); layer(ctx); ctx.strokeStyle = grain(depthColor(color), .45); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = o.alpha ?? .5; ctx.lineWidth = o.w || 1.8;
    const ang = o.angle ?? -.9, n = Math.max(2, Math.ceil((o.n || 12) * S.reveal)), L = o.len || 20;
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
  // Typewriter ink: the glyphs are struck onto a small canvas, bled a little, worn by a blotch pattern that shifts
  // with the boil, then stamped twice (the second strike a hair off). Cached: titles and card labels redraw cheaply.
  const inked = new Map();
  let wearTile = null;
  function wear() {
    if (wearTile) return wearTile;
    const n = 180, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'), r = prng(0x51ed);
    for (let i = 0; i < 340; i++) { g.globalAlpha = r() * .6; g.fillStyle = '#000'; g.beginPath(); g.ellipse(r() * n, r() * n, r() * 2.6 + .4, r() * 1.8 + .3, r() * 3, 0, TAU); g.fill(); }
    for (let i = 0; i < 1400; i++) { g.globalAlpha = r() * .5; g.fillRect(r() * n, r() * n, 1, 1); }
    return (wearTile = c);
  }
  function inkImage(ctx, str, o, m) {
    const font = o.font || `22px ${FONT.type}`, color = named(o.color || C.inkD), holes = o.holes ?? .18;
    const key = [str, font, color, holes, S.boil, m.toFixed(3), o.ls || 0].join('|');
    let hit = inked.get(key);
    if (hit) return hit;
    const g0 = scratch; g0.save(); g0.font = font; if (o.ls) { try { g0.letterSpacing = o.ls + 'px'; } catch (e) { /* not supported */ } }
    const w = g0.measureText(str).width; g0.restore();
    const fs = parseFloat((font.match(/(\d+(?:\.\d+)?)px/) || [0, 22])[1]), pad = fs * .25 + 4;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil((w + 2 * pad) * m)); c.height = Math.max(1, Math.ceil(fs * 1.7 * m));
    const g = c.getContext('2d'); g.scale(m, m); g.font = font; g.textBaseline = 'alphabetic';
    if (o.ls) { try { g.letterSpacing = o.ls + 'px'; } catch (e) { /* not supported */ } }
    const base = fs * 1.25;
    g.fillStyle = grain(color, holes); g.fillText(str, pad, base);
    g.globalAlpha = .42; g.lineWidth = Math.max(.5, fs / 64); g.strokeStyle = grain(color, .5); g.strokeText(str, pad, base);   // bleed
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-out'; g.setTransform(1, 0, 0, 1, 0, 0);
    const pat = g.createPattern(wear(), 'repeat');
    try { pat.setTransform(new DOMMatrix().translate(S.boil * 53, S.boil * 31).scale(Math.max(.6, m * .8))); } catch (e) { /* older engines */ }
    g.fillStyle = pat; g.fillRect(0, 0, c.width, c.height);
    hit = { c, x: -pad, y: -base, w: w + 2 * pad, h: fs * 1.7, tw: w };
    if (inked.size > 800) inked.delete(inked.keys().next().value);
    inked.set(key, hit);
    return hit;
  }
  function text(ctx, s, x, y, o = {}) {
    const str = o.chars != null ? Array.from(s).slice(0, Math.max(0, Math.floor(o.chars))).join('') : s;
    if (!str) return;
    const font = o.font || `22px ${FONT.type}`;
    const ink = o.ink ?? (font.includes('Special Elite') && S.inkText !== false);
    ctx.save();
    ctx.font = font; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = (o.alpha ?? 1) * S.reveal;
    if (o.ls) { try { ctx.letterSpacing = o.ls + 'px'; } catch (e) { /* not supported */ } }
    if (ink) {
      const T = ctx.getTransform(), m = Math.hypot(T.a, T.b) || 1, im = inkImage(ctx, str, Object.assign({}, o, { font }), m);
      const full = o.chars != null ? ctx.measureText(s).width : im.tw;
      const x0 = o.align === 'center' ? x - full / 2 : o.align === 'right' ? x - full : x;
      ctx.drawImage(im.c, x0 + im.x, y + im.y, im.w, im.h);
      if (o.double) { ctx.globalAlpha *= .35; ctx.drawImage(im.c, x0 + im.x + .7, y + im.y + .4, im.w, im.h); }
    } else {
      ctx.fillStyle = grain(o.color || C.inkD, o.holes ?? .18);
      if (o.chars != null && o.align && o.align !== 'left') {      // typing: keep the line where the whole line sits
        const full = ctx.measureText(s).width; ctx.textAlign = 'left';
        x = o.align === 'center' ? x - full / 2 : x - full;
      }
      ctx.fillText(str, x, y);
      if (o.double) { ctx.globalAlpha *= .35; ctx.fillText(str, x + .7, y + .4); }   // a second strike, slightly off
    }
    ctx.restore();
  }
  const GUARD = /(\[[^\]]*\]?)/;
  // Edge words: [guards] in red, the rest in ink; '\n' breaks lines; o.chars reveals like a typewriter.
  function words(ctx, s, x, y, o = {}) {
    const size = o.size || 19, lh = o.lh || size * 1.22;
    ctx.save(); ctx.font = `${o.upright ? '' : 'italic '}${size}px ${o.family || FONT.mono}`; ctx.textBaseline = 'alphabetic';
    let used = 0; const total = o.chars ?? 1e9, A = (o.alpha ?? ctx.globalAlpha) * S.reveal;
    s.split('\n').forEach((ln, li) => {
      const parts = ln.split(GUARD).filter(Boolean), wTot = ctx.measureText(ln).width;
      let cx = o.align === 'right' ? x - wTot : o.align === 'center' ? x - wTot / 2 : x;
      for (const p of parts) {
        const chars = Array.from(p), guard = p[0] === '[', vis = Math.max(0, Math.min(chars.length, total - used));
        used += chars.length;
        if (vis > 0) { ctx.fillStyle = grain(guard ? (o.guardColor || C.guard) : (o.color || C.inkD), .15); ctx.globalAlpha = A; ctx.fillText(chars.slice(0, vis).join(''), cx, y + li * lh); }
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
  // the sheet under everything: cream (the reference), kraft, a squared notebook, dark card, or newsprint
  function paper(ctx, w, h, k = 0, kind = S.paperKind) {
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, w, h);
    const dark = S.dark, n = document.createElement('canvas'); n.width = n.height = 200;
    const g = n.getContext('2d'), r = prng(7);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() < .5 ? (dark ? `rgba(0,0,0,${r() * .16})` : `rgba(120,100,70,${r() * (kind === 'kraft' ? .14 : .07)})`)
        : (dark ? `rgba(255,255,255,${r() * .05})` : `rgba(255,255,255,${r() * (kind === 'kraft' ? .18 : .35)})`);
      g.fillRect(r() * 200, r() * 200, r() * 2 + .5, r() * 2 + .5);
    }
    ctx.fillStyle = ctx.createPattern(n, 'repeat'); ctx.fillRect(0, 0, w, h);
    const r2 = prng(31 + k);
    ctx.save(); ctx.globalAlpha = kind === 'kraft' ? .12 : dark ? .08 : .05;
    ctx.strokeStyle = kind === 'kraft' ? '#5a3c1c' : dark ? '#c8cff5' : '#8a7a5a'; ctx.lineWidth = .6;
    for (let i = 0, m = (kind === 'kraft' ? 520 : 260) * w * h / 1e6; i < m; i++) {        // fibres
      const x = r2() * w, y = r2() * h, a = r2() * TAU, L = r2() * 14 + 3;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a + 1) * L * .5, y + Math.sin(a + 1) * L * .5, x + Math.cos(a) * L, y + Math.sin(a) * L);
      ctx.stroke();
    }
    ctx.restore();
    if (kind === 'grid') {                                    // a squared notebook: faint blue rules, one red margin
      ctx.save(); ctx.lineWidth = .8;
      for (let x = 25; x < w; x += 25) { ctx.strokeStyle = 'rgba(70,110,200,.13)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 25; y < h; y += 25) { ctx.strokeStyle = 'rgba(70,110,200,.13)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(216,27,74,.22)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(34, h); ctx.stroke();
      ctx.restore();
    } else if (kind === 'linen') {                            // linen: a fine weave, the cloth an embroidery is stitched into
      ctx.save(); ctx.lineWidth = .7; const r3 = prng(53 + k);
      for (let x = 0; x < w; x += 3.2) { ctx.strokeStyle = `rgba(120,100,70,${.05 + r3() * .06})`; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + r3() * 2 - 1, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 3.2) { ctx.strokeStyle = `rgba(255,255,255,${.08 + r3() * .1})`; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + r3() * 2 - 1); ctx.stroke(); }
      ctx.restore();
    } else if (kind === 'news') {                             // newsprint: grey ground, faint columns of type
      ctx.save(); ctx.fillStyle = 'rgba(90,90,90,.06)'; const r3 = prng(97 + k);
      for (let col = 0; col < 4; col++) for (let y = 30; y < h; y += 9) { const L = (w / 4 - 30) * (.6 + r3() * .4); ctx.fillRect(col * w / 4 + 15, y, L, 3); }
      ctx.restore();
    }
    // light falls unevenly across a sheet: a soft, wide warm centre and slightly darker corners
    const vg = ctx.createRadialGradient(w * .48, h * .42, Math.min(w, h) * .2, w * .5, h * .5, Math.hypot(w, h) * .62);
    vg.addColorStop(0, dark ? 'rgba(255,255,255,.03)' : 'rgba(255,250,235,.10)'); vg.addColorStop(1, dark ? 'rgba(0,0,0,.22)' : 'rgba(110,80,40,.07)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }

  window.SCV = Object.assign(window.SCV || {}, {
    TAU, PI, C, FONT, S, TIER, seed, setBoil, rnd, toward, atDepth, revealing, within, mixCache, pick, clamp, lerp, ease, easeInOut, backOut, prng, fnv,
    grain, resample, wobble, ell, rect, bez, qbez, smooth, rounded, capsule, bbox, path2d, move, turn, flipX, lengthOf, along,
    line, hatch, radial, shape, dot, blob, scribble, text, words, measureWords, charCount, paper,
  });
})();

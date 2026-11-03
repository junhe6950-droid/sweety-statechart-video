/* sweety-statechart-video · sets.js — set pieces: a whole dense scene that fills a free area, in layers.
 *   $.set(name, area, state) → anchors {ground, s, x0, x1, at: {...}}
 * area {x0, y0, x1, y1} in poster units (a free area from `scv.py layout`, or your own); state is a mode name
 * ('toss'), a list of modes, or {mode, t, p, part, flip, scale, cast, sign, bleed}. Modes switch what it shows;
 * t (S.T) drives the loops; p (0..1) is how far the current mode has got (a door opening, coins flying).
 *
 * Layers: back (static: walls, shelves, far things; lighter, thinner, sparser), mid (live: people, fire, screens),
 * front (static: counters, desks, near things; darker, denser), top (live: steam, sparks, marks over everything).
 * Where to call it:
 *   fg($, S) { $.set('kitchen', A, { mode, t: S.T }) }      one call: back and front are cached as bitmaps (per state
 *                                                             and boil frame), so a frame costs the live layers only
 *   bg($) { $.set('kitchen', A, { part: 'bg' }) }  +  fg: { part: 'fg', ... }   the back goes into the poster's static
 *                                                             layer; fg draws mid + front (cached) + top
 * Everything seeds by name and position: no Math.random, no clock. Colours are palette names. */
(function () {
  const K = window.SCV, { C, PI, TAU, FONT } = K;
  const P = () => K.props;
  const col = c => !c ? null : (c[0] === '#' || c.startsWith('rgb') ? c : (C[c] || c));
  const tier = () => K.tier || { outline: 3.2, structure: 2, detail: 1.2 };
  const DARK = { tan: 'ochre', red: 'redD', blue: 'violet', straw: 'ochre', green: 'greenD', pink: 'red', sky: 'blueL', lilac: 'violet', grey: 'lilac', navy: 'ink', cream: 'creamD', peach: 'tan', mint: 'teal', white: 'sky', orange: 'ochre', yolk: 'straw', teal: 'greenD', brown: 'navy', rose: 'pink', violet: 'navy', ochre: 'brown', leaf: 'greenD', blueL: 'blue', creamD: 'tan', skin: 'skinD', ink: 'navy', greenD: 'navy', flame: 'orange' };
  const dark = c => col(DARK[c] || 'navy');

  /* ---------------- depth-tiered drawing ---------------- */
  // far: light ink, thin, sparse hatch; mid: the usual; near: heavy outline, dense hatch with a darker cross layer
  const DEPTH = {
    far: { w: 1.9, alpha: .7, gap: 4.4, base: .42, stroke: 'blue' },
    mid: { w: 2.5, alpha: 1, gap: 3, base: .72, stroke: 'ink' },
    near: { w: 3.3, alpha: 1, gap: 2.4, base: .86, stroke: 'ink' },
  };
  function sh(g, pts, fill, lvl = 'mid', o = {}) {
    const d = DEPTH[lvl] || DEPTH.mid, c = col(fill);
    const layers = o.layers || (lvl === 'far' ? [{ color: c, alpha: .5 }] : lvl === 'near' ? [{ color: c }, { color: dark(fill), angle: .5, gap: 6.5, alpha: .45 }] : [{ color: c, alpha: .7 }]);
    K.shape(g, pts, { fill: c, h: { gap: o.gap || d.gap, base: o.base ?? d.base, solid: o.solid === undefined ? C.white : o.solid, angle: o.angle, layers, w: o.hw }, w: o.w || (lvl === 'near' ? tier().outline : lvl === 'far' ? d.w : d.w), alpha: d.alpha, stroke: o.stroke === null ? null : col(o.stroke || d.stroke), open: o.open });
  }
  function ln(g, pts, lvl = 'mid', o = {}) {
    const d = DEPTH[lvl] || DEPTH.mid, T = tier();
    K.line(g, pts, { color: col(o.color || d.stroke), w: o.w || (o.detail ? T.detail : lvl === 'near' ? T.outline : lvl === 'far' ? 1.6 : T.structure), alpha: (o.alpha ?? 1) * d.alpha, passes: o.passes, closed: o.closed, progress: o.progress, amp: o.amp });
  }
  // a crayon mass with ragged edges and no outline: walls, skies, floors seen from far
  function wash(g, x0, y0, x1, y1, color, o = {}) {
    const top = [], n = Math.max(3, Math.round((x1 - x0) / 60));
    for (let i = 0; i <= n; i++) top.push([x0 + (x1 - x0) * i / n + (i && i < n ? K.rnd(-12, 12) : 0), y0 + (o.flatTop ? 0 : K.rnd(-10, 10))]);
    const pts = top.concat([[x1 + (o.rag ? K.rnd(-8, 8) : 0), (y0 + y1) / 2], [x1, y1], [x0, y1], [x0 + (o.rag ? K.rnd(-8, 8) : 0), (y0 + y1) / 2]]);
    K.hatch(g, pts, { color: col(color), base: o.base ?? .32, gap: o.gap || 4.2, angle: o.angle ?? -1.05, w: o.w || 1.8, layers: o.layers || [{ color: col(color), alpha: .55 }, { color: col(o.cross || color), angle: .45, gap: 9, alpha: .25 }] });
    return pts;
  }
  // the shared floor: a band from the ground line down (to the poster edge when it bleeds)
  function floor(g, F, kind = 'tiles', color = 'cream') {
    const y0 = F.gy, y1 = F.by1, x0 = F.bx0, x1 = F.bx1;
    if (y1 - y0 < 4) return;
    K.hatch(g, K.rect(x0, y0, x1 - x0, y1 - y0), { color: col(color), base: .45, gap: 3.6, angle: -.15, layers: [{ color: col(color), alpha: .6, angle: -.12 }, { color: dark(color), alpha: .22, angle: 1.2, gap: 8 }] });
    const T = tier();
    if (kind === 'tiles') {
      for (let y = y0 + 16 * F.s, k = 1; y < y1; y += 16 * F.s * (1 + k * .35), k++) K.line(g, [[x0, y], [x1, y]], { color: dark(color), w: T.detail, passes: 1, alpha: .55 });
      for (let x = x0 + 30; x < x1; x += 64 * F.s) K.line(g, [[x, y0], [x - (x - F.cx) * .25, y1]], { color: dark(color), w: T.detail, passes: 1, alpha: .45 });
    } else if (kind === 'planks') {
      for (let y = y0 + 12 * F.s; y < y1; y += 14 * F.s) K.line(g, [[x0, y], [x1, y]], { color: dark(color), w: T.detail, passes: 1, alpha: .5 });
    }
    K.line(g, [[x0, y0], [x1, y0]], { color: C.ink, w: T.structure, passes: 2 });
  }
  function mirror(g, x, F, fn) { if (F.f > 0) return fn(); g.save(); g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0); try { fn(); } finally { g.restore(); } }

  /* ---------------- the frame: where a set sits in its area ---------------- */
  const SETS = {};
  function norm(st) {
    if (st == null) return {};
    if (typeof st === 'string' || Array.isArray(st)) return { mode: st };
    return st;
  }
  function frame($, name, area, st0) {
    const spec = SETS[name], st = norm(st0);
    const W = $ ? $.W : 1000, H = $ ? $.H : 1333;
    const x0 = area.x0, x1 = area.x1, y0 = area.y0, y1 = area.y1, w = x1 - x0, h = y1 - y0;
    const s = K.clamp(Math.min(w / spec.minW, h / spec.H0), .4, 1.7) * (st.scale || 1);
    const bleed = st.bleed ?? true, E = 26;
    const L = bleed && x0 <= E, R = bleed && x1 >= W - E, B = bleed && y1 >= H - E;
    const bx0 = L ? -12 : x0, bx1 = R ? W + 12 : x1, by1 = B ? H + 8 : y1;
    const gy = B ? H - 40 * Math.min(1, s) : y1 - Math.min(26, 16 * s);
    const modes = [].concat(st.mode || spec.modes[0]);
    for (const m of spec.modes) if (st[m]) modes.push(m);
    const flip = !!st.flip;
    const F = {
      name, st, s, x0, x1, y0, y1, w, h, bx0, bx1, by1, gy, cx: (x0 + x1) / 2, W, H, f: flip ? -1 : 1,
      t: st.t || 0, p: st.p == null ? 1 : K.clamp(st.p), modes,
      is: m => modes.includes(m),
      X: u => flip ? x1 - u * w : x0 + u * w,          // fraction of the area's width (mirrored by flip)
      Y: n => gy - n * s,                                // n units above the ground, scaled
      u: n => n * s,
      top: Math.min(y0, gy - spec.H0 * s),
      at: {},
    };
    F.lay = spec.plan ? spec.plan(F) : {};
    return F;
  }
  // who plays a role: st.cast[role] is an outfit name or an outfit object (merged over the default)
  function cast(F, role, def, more = {}) {
    const c = (F.st.cast || {})[role];
    const base = typeof def === 'string' ? (K.outfits[def] || {}) : def;
    const over = typeof c === 'string' ? (K.outfits[c] || {}) : (c || {});
    const forced = {}; for (const k of ['arms', 'reach', 'target']) if (k in more) forced[k] = more[k];
    return Object.assign({}, base, more, over, forced, { t: 't' in more ? more.t : F.t, id: F.name + role });
  }
  function person(g, F, role, def, poseName, x, y, sc, f, more = {}) {
    const look = cast(F, role, def, more);
    const J = K.pose[poseName || 'stand'](x, y, sc * F.s, f, look);
    const out = P().person(g, J, look) || J;
    F.at[role] = out;
    return out;
  }

  /* ---------------- cached static layers ---------------- */
  const cache = new Map(), MAXC = 48;
  function cached(g, F, layer, key, fn) {
    const m = g.getTransform ? g.getTransform() : null;
    if (!m || m.b || m.c || typeof document === 'undefined') return fn(g);
    const ext = { x0: Math.max(-20, F.bx0 - 40 * F.s), x1: Math.min(F.W + 20, F.bx1 + 40 * F.s), y0: Math.max(-20, F.top - 70 * F.s), y1: Math.min(F.H + 20, Math.max(F.y1, F.by1) + 20) };
    const dx = m.a * ext.x0 + m.e, dy = m.d * ext.y0 + m.f, ix = Math.floor(dx), iy = Math.floor(dy), ox = dx - ix, oy = dy - iy;
    const k = [F.name, layer, key, F.x0, F.y0, F.x1, F.y1, F.s.toFixed(3), F.f, K.S.boil, m.a.toFixed(4), m.d.toFixed(4), Math.round(ox * 8), Math.round(oy * 8)].join('|');
    let c = cache.get(k);
    if (!c) {
      c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(m.a * (ext.x1 - ext.x0)) + 2); c.height = Math.max(1, Math.ceil(m.d * (ext.y1 - ext.y0)) + 2);
      const o = c.getContext('2d');
      o.setTransform(m.a, 0, 0, m.d, -m.a * ext.x0 + ox, -m.d * ext.y0 + oy);
      fn(o);
      cache.set(k, c);
      if (cache.size > MAXC) cache.delete(cache.keys().next().value);
    } else { cache.delete(k); cache.set(k, c); }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.drawImage(c, ix, iy); g.restore();
  }

  function draw(g, name, area, st0, $) {
    const spec = SETS[name];
    if (!spec) throw new Error(`no set piece "${name}" (have: ${Object.keys(SETS).join(', ')})`);
    if (!area || area.x1 == null) throw new Error(`$.set('${name}', area): area must be {x0, y0, x1, y1}`);
    const F = frame($, name, area, st0), part = F.st.part, key = spec.key ? spec.key(F) : '';
    const seeded = (layer, fn) => (o) => { K.seed(name + layer + F.x0 + '|' + F.y0); fn(o, F); };
    if (part === 'bg') { seeded('back', spec.back)(g); return out(F); }
    if (part !== 'fg' && spec.back) cached(g, F, 'back', key, seeded('back', spec.back));
    if (spec.mid) { K.seed(name + 'mid' + F.x0); spec.mid(g, F); }
    if (spec.front) cached(g, F, 'front', key, seeded('front', spec.front));
    if (spec.top) { K.seed(name + 'top' + F.x0); spec.top(g, F); }
    return out(F);
  }
  function out(F) { return { ground: F.gy, s: F.s, x0: F.x0, x1: F.x1, y0: F.y0, y1: F.y1, top: F.top, f: F.f, modes: F.modes, at: Object.assign({}, F.lay.at || {}, F.at) }; }

  /* ---------------- small shared pieces ---------------- */
  // a wall clock; hh:mm, far or mid
  function wallClock(g, x, y, r, hh, mm, lvl = 'far') {
    sh(g, K.ell(x, y, r, r, 24), 'white', lvl, { layers: [{ color: C.sky, alpha: .4 }] });
    ln(g, K.ell(x, y, r * 1.1, r * 1.1, 24), lvl, { color: 'red', closed: true, w: 2.4 });
    const am = mm / 60 * TAU - PI / 2, ah = (hh + mm / 60) / 12 * TAU - PI / 2;
    ln(g, [[x, y], [x + Math.cos(ah) * r * .5, y + Math.sin(ah) * r * .5]], lvl, { color: 'navy', w: 2.6 });
    ln(g, [[x, y], [x + Math.cos(am) * r * .75, y + Math.sin(am) * r * .75]], lvl, { color: 'navy', w: 2 });
  }
  // a window with a view: day (sky, clouds, far roofs) or night (navy, moon, lit windows)
  function windowView(g, x, y, w, h, night, lvl = 'far') {
    sh(g, K.rect(x - 6, y - 6, w + 12, h + 12), 'cream', lvl, { layers: [{ color: C.creamD, alpha: .6 }] });
    K.hatch(g, K.rect(x, y, w, h), { color: col(night ? 'navy' : 'sky'), base: night ? .75 : .5, gap: 3.6, layers: [{ color: col(night ? 'violet' : 'blueL'), alpha: .5 }] });
    for (let i = 0; i < 4; i++) {
      const bw = w * K.rnd(.16, .26), bh = h * K.rnd(.25, .55), bx = x + i * w / 4 + K.rnd(0, w * .04);
      K.hatch(g, K.rect(bx, y + h - bh, bw, bh), { color: col(night ? 'ink' : 'lilac'), base: night ? .8 : .45, gap: 3 });
      for (let r = 0; r < 3; r++) if (night && K.rnd() < .7) K.hatch(g, K.rect(bx + bw * .25, y + h - bh + 6 + r * 12, bw * .3, 6), { color: C.yolk, base: .95, gap: 2 });
    }
    if (night) P().moon(g, x + w * .75, y + h * .25, Math.min(w, h) * .1, 0, 0);
    else P().cloud(g, x + w * .3, y + h * .3, w * .32, h * .18, { fill: C.white, hatch: C.sky, base: .7 });
    ln(g, [[x + w / 2, y], [x + w / 2, y + h]], lvl, { color: 'creamD', w: 4 }); ln(g, [[x, y + h / 2], [x + w, y + h / 2]], lvl, { color: 'creamD', w: 4 });
    ln(g, K.rect(x, y, w, h), lvl, { closed: true });
  }
  function plant(g, x, y, s, lvl = 'mid', c = 'orange') {
    for (let i = 0; i < 7; i++) { const a = -PI / 2 + (i - 3) * .32, L = (60 + (i % 3) * 18) * s; sh(g, K.smooth([[x, y - 40 * s], [x + Math.cos(a - .2) * L * .5, y - 40 * s + Math.sin(a - .2) * L * .5], [x + Math.cos(a) * L, y - 40 * s + Math.sin(a) * L], [x + Math.cos(a + .2) * L * .5, y - 40 * s + Math.sin(a + .2) * L * .5]], 1), i % 2 ? 'leaf' : 'green', lvl, { w: 1.8 }); }
    sh(g, [[x - 22 * s, y - 44 * s], [x + 22 * s, y - 44 * s], [x + 16 * s, y], [x - 16 * s, y]], c, lvl);
  }
  // a crowd member by index: different outfits and builds so a queue is never clones
  const CROWD = [
    ['customer', {}], ['office', { build: 'stout' }], ['schoolkid', {}], ['grandma', { build: 'elder', cane: true }],
    ['student', { build: 'teen', hair: 'spiky' }], ['courier', {}], ['artist', {}], ['coder', { build: 'slim' }], ['customer', { shirt: 'plaid', shirtColor: 'green', hair: 'bob' }],
  ];
  const crowd = (i, more = {}) => Object.assign({}, K.outfits[CROWD[i % CROWD.length][0]], CROWD[i % CROWD.length][1], more);
  function seatedAt(F, x, sc, f, more) { const sp = sc * F.s; return K.pose.sit(x, F.gy - 60 * sp, sp, f, Object.assign({ floor: F.gy }, more)); }

  /* =====================================================================================================
   * kitchen: fire | toss | serve
   * a cook at the stove behind a long counter, a pot on the back burner, a helper plating at the pass
   * ===================================================================================================== */
  SETS.kitchen = {
    modes: ['fire', 'toss', 'serve'], minW: 430, H0: 430,
    plan(F) {
      const s = F.s, f = F.f, room = F.w / s, cook = F.X(.17), wok = cook + f * 157 * s, pot = room > 500 ? cook + f * 292 * s : null;
      const helper = F.X(.92), pass0 = pot != null ? pot + f * 75 * s : wok + f * 90 * s, pass1 = helper - f * 45 * s;
      const nb = Math.max(1, Math.min(4, Math.floor(Math.abs(pass1 - pass0) / (56 * s))));
      return { cook, wok, pot, helper, pass0, nb, top: F.Y(108), at: { pass: [pass0 + f * 30 * s, F.Y(108)], stove: [wok, F.Y(108)] } };
    },
    key: F => F.is('serve') ? 'serve' : '',
    back(g, F) {
      const s = F.s, L = F.lay, f = F.f;
      wash(g, F.bx0, F.Y(410), F.bx1, F.gy, 'peach', { cross: 'tan' });
      const ty0 = F.Y(250), ty1 = L.top;
      K.hatch(g, K.rect(F.bx0, ty0, F.bx1 - F.bx0, ty1 - ty0), { color: C.white, base: .55, gap: 5, layers: [{ color: C.sky, alpha: .5 }] });
      for (let y = ty0; y < ty1; y += 26 * s) ln(g, [[F.bx0, y], [F.bx1, y]], 'far', { detail: true });
      for (let x = F.bx0 + 10; x < F.bx1; x += 26 * s) ln(g, [[x, ty0], [x, ty1]], 'far', { detail: true, alpha: .7 });
      const hx = L.wok;
      sh(g, [[hx - 70 * s, F.Y(305)], [hx + 70 * s, F.Y(305)], [hx + 100 * s, F.Y(258)], [hx - 100 * s, F.Y(258)]], 'grey', 'far', { layers: [{ color: C.lilac, alpha: .6 }] });
      sh(g, K.rect(hx - 22 * s, Math.min(F.y0, F.Y(420)), 44 * s, F.Y(305) - Math.min(F.y0, F.Y(420))), 'grey', 'far');
      const sx0 = L.wok + f * 112 * s, sx1 = F.X(.99), shy = F.Y(352);
      sh(g, K.rect(Math.min(sx0, sx1) - 6 * s, shy, Math.abs(sx1 - sx0) + 12 * s, 9 * s), 'tan', 'far');
      const jars = [['油', 'ochre', 'red'], ['盐', 'white', 'green'], ['酱', 'brown', 'blue'], ['米', 'cream', 'straw']];
      const nj = Math.max(1, Math.min(4, Math.floor(Math.abs(sx1 - sx0) / (44 * s))));
      for (let i = 0; i < nj; i++) { const [lab, c, lid] = jars[i]; P().jar(g, K.lerp(sx0, sx1, (i + .5) / nj), shy, .6 * s, { label: lab, fill: c, lid }); }
      const rail = F.Y(292), r0 = L.wok + f * 112 * s;
      ln(g, [[r0, rail], [F.X(.99), rail]], 'far', { w: 2.4 });
      for (let i = 0, n = Math.max(2, Math.floor(Math.abs(F.X(.99) - r0) / (36 * s))); i < n; i++) {
        const x = K.lerp(r0 + f * 14 * s, F.X(.97), i / Math.max(1, n - 1));
        ln(g, [[x, rail], [x, rail + 12 * s]], 'far', { detail: true });
        if (i % 2) sh(g, K.ell(x, rail + 32 * s, 15 * s, 15 * s, 16), 'navy', 'far');
        else { ln(g, [[x, rail + 12 * s], [x, rail + 46 * s]], 'far', { w: 2.4 }); sh(g, K.ell(x, rail + 52 * s, 9 * s, 7 * s, 12), 'grey', 'far'); }
      }
      const ox = F.X(.02), oy = F.Y(380);
      ln(g, [[ox, oy], [ox + f * 170 * s, oy + 6 * s]], 'far', { detail: true });
      for (let i = 0; i < 3; i++) { const x = ox + f * (16 + i * 50) * s; sh(g, [[x, oy + 2 * s], [x + 32 * s, oy + 3 * s], [x + 33 * s, oy + 54 * s], [x + 1 * s, oy + 52 * s]], 'white', 'far', { layers: [{ color: C.sky, alpha: .4 }] }); for (let k = 0; k < 3; k++) ln(g, [[x + 6 * s, oy + (16 + k * 10) * s], [x + 26 * s, oy + (16 + k * 10) * s]], 'far', { detail: true, color: k ? 'blueL' : 'red' }); }
    },
    mid(g, F) {
      const L = F.lay, serve = F.is('serve'), toss = F.is('toss');
      person(g, F, 'hero', 'cook', 'stand', L.cook, F.gy, .98, F.f, { arms: serve ? 'give' : toss ? 'toss' : 'stir', face: serve ? 'happy' : toss ? 'proud' : 'neutral' });
      person(g, F, 'helper', { ...K.outfits.chef, hair: 'bob', hat: 'bandana', hatColor: 'green', apron: 'straw' }, 'stand', L.helper, F.gy, .9, -F.f, { arms: serve ? 'hold' : 'stir', face: serve ? 'happy' : 'neutral' });
    },
    front(g, F) {
      const s = F.s, L = F.lay, f = F.f, cy = L.top;
      floor(g, F, 'tiles', 'cream');
      sh(g, K.rect(F.bx0, cy + 12 * s, F.bx1 - F.bx0, F.gy - cy - 12 * s), 'tan', 'near', { angle: -1.5, layers: [{ color: C.ochre, angle: -1.5, gap: 5, alpha: .55 }, { color: C.brown, angle: .3, gap: 9, alpha: .25 }] });
      for (let x = F.bx0 + 50 * s; x < F.bx1 - 10; x += 70 * s) ln(g, [[x, cy + 18 * s], [x + 1, F.gy - 6 * s]], 'near', { color: 'brown', detail: true, alpha: .8 });
      sh(g, K.rect(F.bx0 - 6, cy, F.bx1 - F.bx0 + 12, 14 * s), 'white', 'near', { layers: [{ color: C.sky, alpha: .6 }, { color: C.lilac, angle: .3, gap: 6, alpha: .4 }] });
      const sign = F.st.sign ?? '后 厨';
      if (sign) { const sx = F.X(.5); sh(g, K.rect(sx - 70 * s, cy + 32 * s, 140 * s, 44 * s), 'cream', 'mid'); K.text(g, sign, sx, cy + 64 * s, { font: `${Math.round(26 * s)}px ${FONT.type}`, align: 'center', color: C.navy, double: true }); }
      const st0 = L.wok - f * 85 * s, st1 = (L.pot != null ? L.pot : L.wok) + f * 70 * s;
      sh(g, K.rect(Math.min(st0, st1), cy - 26 * s, Math.abs(st1 - st0), 26 * s), 'grey', 'near', { layers: [{ color: C.lilac }, { color: C.blue, angle: .4, gap: 7, alpha: .35 }] });
      for (const x of [st0 + f * 18 * s, st1 - f * 18 * s]) K.dot(g, x, cy - 13 * s, 6 * s, C.navy);
      const bx = F.f > 0 ? F.X(.0) : F.X(.0) - 76 * s;
      sh(g, K.rect(bx, cy - 10 * s, 70 * s, 10 * s), 'tan', 'mid');
      for (let i = 0; i < 6; i++) K.dot(g, bx + (8 + i * 10) * s, cy - 14 * s, 4.5 * s, i % 2 ? C.green : C.leaf, { w: 1.2 });
      const serve = F.is('serve');
      for (let i = 0; i < L.nb; i++) P().bowl(g, L.pass0 + f * (28 + i * 56) * s, cy, .48 * s, { food: serve || i === 0 ? 'noodles' : false });
      if (serve) {
        const bell = L.pass0 + f * (28 + L.nb * 56) * s;
        sh(g, K.ell(bell, cy - 2 * s, 18 * s, 5 * s, 14), 'grey', 'near'); sh(g, K.ell(bell, cy - 8 * s, 14 * s, 14 * s, 16, PI, TAU), 'straw', 'near'); K.dot(g, bell, cy - 24 * s, 3 * s, C.navy);
      }
    },
    top(g, F) {
      const s = F.s, L = F.lay, t = F.t, f = F.f, serve = F.is('serve'), toss = F.is('toss'), hot = !serve;
      const cy = L.top - 26 * s;
      K.seed('kflame' + K.S.boil);
      const n = hot ? 6 : 3;
      for (let i = 0; i < n; i++) P().flame(g, L.wok - 44 * s + i * 88 * s / (n - 1), cy, (hot ? 42 : 16) * s * (i % 2 ? .8 : 1), 18 * s, t, i * 2 + F.x0);
      const lift = toss ? Math.max(0, Math.sin(t * 5)) * 8 * s : 0;
      mirror(g, L.wok, F, () => P().wok(g, L.wok, cy - 14 * s - lift, .9 * s, t, { toss }));
      if (L.pot != null) { for (let i = 0; i < 3; i++) P().flame(g, L.pot - 26 * s + i * 26 * s, cy, 12 * s, 14 * s, t, i + 9); P().pot(g, L.pot, cy - 66 * s, 46 * s, 62 * s, { color: 'red', liquid: 'orange', handles: true, t, bubbles: true }); for (let k = 0; k < 2; k++) P().steam(g, L.pot - 15 * s + k * 30 * s, cy - 78 * s, t, k + 4, 90 * s, 6 * s); }
      for (let k = 0; k < (hot ? 4 : 2); k++) P().steam(g, L.wok - 30 * s + k * 20 * s, cy - 50 * s, t, k * 1.3, (hot ? 120 : 60) * s, 7 * s);
      if (serve) {
        for (let i = 0; i < L.nb; i++) P().steam(g, L.pass0 + f * (28 + i * 56) * s, L.top - 30 * s, t, i * 1.7, 60 * s, 5 * s);
        const h = F.at.hero; if (h) P().bowl(g, h.haF[0] + f * 6 * s, h.haF[1] + 12 * s, .46 * s, { food: 'noodles', t });
        const bell = L.pass0 + f * (28 + L.nb * 56) * s, k = (t * 2) % 1;
        for (const d of [-1, 1]) ln(g, [[bell + d * 20 * s, L.top - 40 * s], [bell + d * (28 + k * 8) * s, L.top - (50 + k * 8) * s]], 'mid', { color: 'red', w: 2.4, alpha: 1 - k });
      }
    },
  };

  /* =====================================================================================================
   * street: day | night | rain | jam      (modes combine: ['night', 'rain'])
   * shop houses at the back, a pavement, two lanes of traffic, a kerb in front
   * ===================================================================================================== */
  SETS.street = {
    modes: ['day', 'night', 'rain', 'jam'], minW: 460, H0: 420,
    plan(F) {
      const s = F.s, r = K.prng(K.fnv('street' + F.x0 + F.y0)), blds = [];
      for (let x = F.bx0 - 10 * s; x < F.bx1;) { const w = (110 + r() * 70) * s; blds.push({ x, w, h: (210 + r() * 170) * s, c: ['lilac', 'peach', 'sky', 'mint', 'cream', 'tan'][(r() * 6) | 0], shop: r() < .45, sign: ['面', '药', '书', '茶', '修', '米'][(r() * 6) | 0] }); x += w + 6 * s; }
      const pave = F.Y(84), far = F.Y(46), near = F.Y(10);
      return { blds, pave, far, near, at: { pavement: [F.X(.5), F.Y(70)], road: [F.X(.5), near] } };
    },
    key: F => (F.is('night') ? 'n' : 'd') + (F.is('rain') ? 'r' : '') + (F.is('jam') ? 'j' : ''),
    back(g, F) {
      const s = F.s, L = F.lay, night = F.is('night'), rain = F.is('rain');
      const skyTop = Math.max(F.y0 - (F.y0 <= 30 ? 20 : 0), F.Y(470));
      if (night || rain) wash(g, F.bx0, skyTop, F.bx1, L.pave, night ? 'navy' : 'grey', { base: night ? .55 : .3, cross: night ? 'violet' : 'lilac', flatTop: false });
      if (night) for (let i = 0; i < 6; i++) P().star(g, K.lerp(F.bx0, F.bx1, K.rnd()), skyTop + K.rnd(10, 90) * s, 6 * s, C.yolk, i);
      for (const b of L.blds) {
        const top = L.pave - b.h, lit = night;
        sh(g, K.rect(b.x, top, b.w, b.h), b.c, 'far', { base: .4, layers: [{ color: col(b.c), alpha: .45 }, { color: dark(b.c), angle: .5, gap: 10, alpha: .18 }] });
        const cols = Math.max(2, Math.floor(b.w / (48 * s))), rows = Math.max(1, Math.floor((b.h - (b.shop ? 110 : 50) * s) / (56 * s)));
        for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
          const wx = b.x + (c + .5) * b.w / cols - 11 * s, wy = top + 22 * s + rr * 56 * s, on = lit ? K.rnd() < .6 : (rr + c) % 4 === 0;
          K.hatch(g, K.rect(wx, wy, 22 * s, 26 * s), { color: on ? C.yolk : C.white, base: on ? .9 : .5, gap: 2.6, layers: [{ color: on ? C.straw : C.sky, alpha: .6 }] });
          ln(g, K.rect(wx, wy, 22 * s, 26 * s), 'far', { closed: true, detail: true });
        }
        if (b.shop) {
          const aw = L.pave - 92 * s, n = Math.max(3, Math.round(b.w / (24 * s)));
          for (let i = 0; i < n; i++) { const ax = b.x + 4 * s + i * (b.w - 8 * s) / n, ww = (b.w - 8 * s) / n; sh(g, [[ax, aw], [ax + ww, aw], [ax + ww, aw + 22 * s], [ax + ww / 2, aw + 30 * s], [ax, aw + 22 * s]], i % 2 ? 'white' : (b.c === 'peach' ? 'green' : 'red'), 'far', { w: 1.6 }); }
          K.hatch(g, K.rect(b.x + 10 * s, aw + 34 * s, b.w - 20 * s, 56 * s), { color: lit ? C.yolk : C.sky, base: .55, gap: 4, layers: [{ color: lit ? C.straw : C.blueL, alpha: .5, angle: -.7 }] });
          sh(g, K.rect(b.x + b.w / 2 - 15 * s, aw - 46 * s, 30 * s, 40 * s), 'red', 'far', { base: .8 });
          K.text(g, b.sign, b.x + b.w / 2, aw - 18 * s, { font: `${Math.round(22 * s)}px ${FONT.type}`, align: 'center', color: C.white });
        }
      }
      // pavement and the two lanes
      K.hatch(g, K.rect(F.bx0, L.pave, F.bx1 - F.bx0, F.Y(62) - L.pave), { color: C.creamD, base: .5, gap: 3.4, layers: [{ color: C.tan, alpha: .35, angle: 1.2, gap: 7 }] });
      for (let x = F.bx0 + 20 * s; x < F.bx1; x += 40 * s) ln(g, [[x, L.pave], [x - 6 * s, F.Y(62)]], 'far', { detail: true, color: 'tan' });
      K.hatch(g, K.rect(F.bx0, F.Y(62), F.bx1 - F.bx0, F.gy - F.Y(62)), { color: col(rain ? 'lilac' : 'grey'), base: rain ? .62 : .5, gap: 3.6, angle: -.1, layers: [{ color: C.lilac, alpha: .5, angle: -.12 }] });
      ln(g, [[F.bx0, F.Y(62)], [F.bx1, F.Y(62)]], 'mid', { w: 2.4 });
      if (rain) for (let i = 0; i < 5; i++) { const x = K.lerp(F.bx0, F.bx1, (i + K.rnd(.2, .8)) / 5); K.hatch(g, K.ell(x, F.Y(K.rnd(14, 50)), K.rnd(26, 46) * s, 5 * s, 16), { color: C.sky, base: .7, gap: 2.4, layers: [{ color: C.white, alpha: .6 }] }); }
      // lamps and the traffic light on the pavement
      for (const u of [.12, .62]) { const x = F.X(u); ln(g, [[x, F.Y(70)], [x, F.Y(300)]], 'mid', { w: 3 }); ln(g, K.qbez([x, F.Y(300)], [x + 10 * s, F.Y(318)], [x + 34 * s, F.Y(306)], 8), 'mid', { w: 3 }); sh(g, [[x + 20 * s, F.Y(306)], [x + 48 * s, F.Y(306)], [x + 54 * s, F.Y(290)], [x + 14 * s, F.Y(290)]], 'navy', 'mid'); }
      const tl = F.X(.9); ln(g, [[tl, F.Y(70)], [tl, F.Y(210)]], 'mid', { w: 3.2 }); sh(g, K.rect(tl - 14 * s, F.Y(286), 28 * s, 78 * s), 'navy', 'mid');
    },
    mid(g, F) {
      const s = F.s, L = F.lay, t = F.t, night = F.is('night'), rain = F.is('rain'), jam = F.is('jam');
      const tl = F.X(.9), light = jam ? 'red' : 'green';
      ['red', 'straw', 'green'].forEach((c, i) => K.dot(g, tl, F.Y(272) + i * 24 * s, 8 * s, (c === light ? c : 'grey'), { w: 1.6 }));
      if (night) for (const u of [.12, .62]) { const x = F.X(u); g.save(); g.globalAlpha = .28 + .05 * Math.sin(t * 4 + u * 9); g.fillStyle = K.grain(C.yolk, .3); g.beginPath(); g.moveTo(x + 14 * s, F.Y(290)); g.lineTo(x + 54 * s, F.Y(290)); g.lineTo(x + 100 * s, F.Y(64)); g.lineTo(x - 30 * s, F.Y(64)); g.fill(); g.restore(); }
      // people on the pavement: one walks across, one waits by the lamp
      const span = F.w + 200 * s, walkX = F.x0 - 100 * s + ((t * (rain ? 40 : 55) * s + F.w * .3) % span);
      const wf = 1;
      g.save(); g.beginPath(); g.rect(F.bx0, F.top - 200 * s, F.bx1 - F.bx0, F.by1 - F.top + 200 * s); g.clip();
      const wj = person(g, F, 'walker', crowd(0), 'walk', walkX, F.Y(72), .78, wf, { arms: rain ? 'carry' : undefined });
      if (rain) P().umbrella(g, wj.haF[0], wj.head[1] - 40 * s, 120 * s, 44 * s, 'violet');
      const wx = F.X(.7);
      const wt = person(g, F, 'waiter', crowd(4), 'stand', wx, F.Y(72), .78, -F.f, { arms: rain ? 'carry' : 'phone', face: jam ? 'worried' : 'neutral' });
      if (rain) P().umbrella(g, wt.haF[0], wt.head[1] - 40 * s, 110 * s, 40 * s, 'red');
      else P().phone(g, wt.haF[0] - F.f * 6 * s, wt.haF[1] - 2 * s, .3 * s, { screen: 'map', t });
      // traffic: far lane and near lane
      const cars = jam ? [['red', -1], ['green', -1], ['straw', -1], ['blue', -1], ['orange', -1]] : [['red', 1], ['green', -1]];
      if (jam) {
        const n = Math.max(3, Math.min(6, Math.floor((F.bx1 - F.bx0) / (190 * s))));
        for (let i = 0; i < n; i++) { const x = K.lerp(F.bx0 + 70 * s, F.bx1 - 70 * s, i / Math.max(1, n - 1)) + Math.sin(t * 9 + i) * .8 * s; P().car(g, x, L.far + (i % 2) * 2 * s, .74 * s, 1, { color: cars[i % cars.length][0] }); }
        const sx = F.X(.42);
        P().scooter(g, sx, L.near, .7 * s, 1, { logo: '外卖' });
        P().person(g, K.pose.ride(sx - 16 * s, L.near - 46 * s, .62 * s, 1, { t, bars: [sx + 38 * s, L.near - 70 * s] }), cast(F, 'rider', 'rider', { face: 'worried' }));
        for (let i = 0; i < n - 1; i += 2) { const x = K.lerp(F.bx0 + 70 * s, F.bx1 - 70 * s, i / Math.max(1, n - 1)); P().mark(g, x + 40 * s, L.far - 150 * s, '!', { pop: .6 + .4 * Math.abs(Math.sin(t * 3 + i)), color: 'red' }); }
      } else {
        const sp = (rain ? 90 : 160) * s, span2 = F.bx1 - F.bx0 + 400 * s;
        const x1 = F.bx0 - 200 * s + ((t * sp + F.w * .2) % span2), x2 = F.bx1 + 200 * s - ((t * sp * .8 + F.w * .7) % span2);
        P().car(g, x2, L.far, .7 * s, -1, { color: 'green', t, moving: true });
        P().car(g, x1, L.near, .78 * s, 1, { color: 'red', t, moving: true });
        if (night) for (const [x, y, d] of [[x1 + 88 * .78 * s, L.near - 44 * .78 * s, 1], [x2 - 88 * .7 * s, L.far - 44 * .7 * s, -1]]) { g.save(); g.globalAlpha = .35; g.fillStyle = K.grain(C.yolk, .3); g.beginPath(); g.moveTo(x, y - 4 * s); g.lineTo(x + d * 140 * s, y - 24 * s); g.lineTo(x + d * 140 * s, y + 26 * s); g.fill(); g.restore(); }
      }
      g.restore();
    },
    front(g, F) {
      const s = F.s;
      if (F.by1 - F.gy > 3) K.hatch(g, K.rect(F.bx0, F.gy, F.bx1 - F.bx0, F.by1 - F.gy), { color: C.creamD, base: .55, gap: 3.4, layers: [{ color: C.tan, alpha: .4, angle: 1.2, gap: 7 }] });
      sh(g, K.rect(F.bx0, F.gy - 6 * s, F.bx1 - F.bx0, 12 * s), 'grey', 'near', { layers: [{ color: C.lilac }] });
      for (let x = F.bx0 + 30 * s; x < F.bx1; x += 60 * s) ln(g, [[x, F.gy - 6 * s], [x, F.gy + 6 * s]], 'near', { detail: true });
      for (let x = F.bx0 + 40 * s, i = 0; x < F.bx1 - 20 * s; x += 130 * s, i++) if (i % 2 === 0) P().bush(g, x, F.gy + 4 * s, .55 * s, 0, i % 4 ? 'leaf' : 'green');
    },
    top(g, F) {
      const s = F.s, t = F.t;
      if (F.is('rain')) P().rain(g, F.bx0, F.top - 30 * s, F.bx1 - F.bx0, F.gy - F.top + 30 * s, t, Math.round((F.bx1 - F.bx0) / (12 * s)), F.x0);
      else if (!F.is('night')) for (let i = 0; i < 2; i++) P().bird(g, F.X(.2 + i * .12) + Math.sin(t * .7 + i) * 20 * s, F.Y(400 - i * 20) , .8 * s, t + i);
    },
  };

  /* =====================================================================================================
   * doorway: knock | open | handover
   * a hallway, a door with its number; a courier outside, someone inside
   * ===================================================================================================== */
  SETS.doorway = {
    modes: ['knock', 'open', 'handover'], minW: 420, H0: 420,
    plan(F) {
      const s = F.s, f = F.f, dw = 128 * s, dh = 252 * s, door = F.X(.62) - (f > 0 ? 0 : dw);
      const near = f > 0 ? door : door + dw, hinge = f > 0 ? door + dw : door, far = hinge + f * 30 * s;
      return { door, dw, dh, near, hinge, far, knockAt: near - f * 92 * s, courier: near - f * 150 * s, inside: door + dw * (f > 0 ? .34 : .66),
        at: { door: [door + dw / 2, F.gy - dh], courier: [near - f * 150 * s, F.gy] } };
    },
    key: F => F.is('handover') ? 'h' : F.is('open') ? 'o' : 'k',
    back(g, F) {
      const s = F.s, L = F.lay, f = F.f;
      wash(g, F.bx0, F.Y(410), F.bx1, F.gy, 'cream', { cross: 'peach', base: .42 });
      // the old-building green dado and its rail
      K.hatch(g, K.rect(F.bx0, F.Y(118), F.bx1 - F.bx0, 118 * s), { color: C.green, base: .5, gap: 3.4, angle: -1.2, layers: [{ color: C.greenD, alpha: .35, angle: -1.2, gap: 6 }, { color: C.leaf, alpha: .2, angle: .4, gap: 9 }] });
      ln(g, [[F.bx0, F.Y(118)], [F.bx1, F.Y(118)]], 'far', { w: 2.4, color: 'greenD' });
      // stairs going up out of the picture, with a rail
      const s0 = F.X(.25), s1 = F.f > 0 ? F.bx0 - 20 : F.bx1 + 20, n = 8, stair = [[s0, F.gy]];
      for (let i = 0; i < n; i++) { const x = K.lerp(s0, s1, i / n), x2 = K.lerp(s0, s1, (i + 1) / n), y = F.gy - (i + 1) * 30 * s; stair.push([x, y], [x2, y]); }
      stair.push([s1, F.gy]);
      sh(g, stair, 'tan', 'far', { layers: [{ color: C.ochre, alpha: .5 }] });
      for (let i = 0; i <= n; i += 2) { const x = K.lerp(s0, s1, i / n) - f * 10 * s, y = F.gy - (i + 1) * 30 * s; ln(g, [[x, y], [x, y - 84 * s]], 'far', { color: 'navy', w: 2 }); }
      ln(g, [[s0 - f * 10 * s, F.gy - 114 * s], [s1, F.gy - (n + 1) * 30 * s - 84 * s]], 'mid', { color: 'brown', w: 4.4 });
      // a meter box with two dials
      const mx = F.X(.33) - (f > 0 ? 0 : 70 * s);
      sh(g, K.rect(mx, F.Y(392), 70 * s, 84 * s), 'grey', 'far', { layers: [{ color: C.lilac, alpha: .5 }] });
      for (let i = 0; i < 2; i++) { K.dot(g, mx + 20 * s + i * 30 * s, F.Y(360), 9 * s, C.white, { w: 1.6 }); ln(g, [[mx + 20 * s + i * 30 * s, F.Y(360)], [mx + 25 * s + i * 30 * s, F.Y(365)]], 'far', { detail: true, color: 'red' }); }
      ln(g, [[mx + 35 * s, F.Y(308)], [mx + 35 * s, F.Y(250)], [mx + 60 * s, F.Y(240)]], 'far', { detail: true, color: 'navy' });
      // the doorway: frame, the dark room inside, a warm light
      const x = L.door, y = F.gy - L.dh, w = L.dw, h = L.dh;
      sh(g, K.rect(x - 14 * s, y - 14 * s, w + 28 * s, h + 14 * s), 'white', 'mid', { layers: [{ color: C.creamD, alpha: .6 }] });
      K.hatch(g, K.rect(x, y, w, h), { color: C.navy, base: .72, gap: 3, layers: [{ color: C.violet, alpha: .5, angle: .4, gap: 6 }] });
      K.hatch(g, [[x + w * .2, y + h * .3], [x + w * .8, y + h * .3], [x + w, y + h], [x, y + h]], { color: C.yolk, base: .35, gap: 4, layers: [{ color: C.straw, alpha: .4 }] });
      const num = String(F.st.sign ?? '802');
      sh(g, K.rect(x + w / 2 - 34 * s, y - 52 * s, 68 * s, 30 * s), 'navy', 'mid');
      K.text(g, num, x + w / 2, y - 29 * s, { font: `${Math.round(20 * s)}px ${FONT.type}`, align: 'center', color: C.white });
      const lx = L.near - f * 46 * s;
      sh(g, K.ell(lx, F.Y(300), 16 * s, 20 * s, 16), 'yolk', 'mid', { layers: [{ color: C.straw }] }); ln(g, [[lx, F.Y(320)], [lx, F.Y(340)]], 'mid', { detail: true });
      // beyond the hinge: a hook with an umbrella and a cap, a shoe rack
      const hx = L.far + f * 30 * s;
      ln(g, [[hx - 24 * s, F.Y(300)], [hx + 24 * s, F.Y(300)]], 'mid', { w: 3, color: 'brown' });
      sh(g, [[hx - 12 * s, F.Y(296)], [hx - 2 * s, F.Y(296)], [hx + 4 * s, F.Y(170)], [hx - 18 * s, F.Y(170)]], 'violet', 'mid', { layers: [{ color: C.blue, alpha: .5 }] });
      ln(g, K.qbez([hx - 7 * s, F.Y(296)], [hx - 7 * s, F.Y(318)], [hx + 6 * s, F.Y(312)], 5), 'mid', { w: 2.6 });
      sh(g, K.ell(hx + 16 * s, F.Y(282), 15 * s, 11 * s, 14, PI, TAU).concat([[hx + 31 * s, F.Y(282)], [hx + 1 * s, F.Y(282)]]), 'red', 'mid');
      const sx = L.far + f * 8 * s - (f > 0 ? 0 : 66 * s);
      sh(g, K.rect(sx, F.Y(72), 66 * s, 72 * s), 'tan', 'mid', { layers: [{ color: C.ochre, alpha: .5 }] });
      ln(g, [[sx, F.Y(36)], [sx + 66 * s, F.Y(36)]], 'mid', { detail: true });
      for (let i = 0; i < 2; i++) { sh(g, K.ell(sx + (17 + i * 30) * s, F.Y(78), 13 * s, 6 * s, 12), i ? 'red' : 'blue', 'mid', { w: 1.8 }); sh(g, K.ell(sx + (17 + i * 30) * s, F.Y(42), 13 * s, 6 * s, 12), i ? 'green' : 'straw', 'mid', { w: 1.8 }); }
    },
    mid(g, F) {
      const s = F.s, L = F.lay, t = F.t, f = F.f, open = F.is('open') || F.is('handover');
      const op = F.is('handover') ? 1 : open ? F.p : 0;
      // whoever is inside, then the door leaf over them
      if (op > .25) {
        const k = K.clamp((op - .25) / .5);
        person(g, F, 'resident', { ...K.outfits.customer, hair: 'long', shirt: 'dots', shirtColor: 'pink' }, 'stand', L.inside + f * (1 - k) * 30 * s, F.gy, .92, -f, { arms: F.is('handover') ? 'reach' : 'wave', reach: [L.near - f * 70 * s, F.Y(150)], face: F.is('handover') ? 'happy' : 'surprised' });
      }
      const x = L.door, w = L.dw, h = L.dh, k = Math.cos(K.clamp(op) * PI * .45), ww = w * k, hinge = L.hinge;
      const leaf = f > 0 ? [[hinge - ww, F.gy - h + (1 - k) * 18 * s], [hinge, F.gy - h], [hinge, F.gy], [hinge - ww, F.gy - (1 - k) * 18 * s]] : [[hinge, F.gy - h], [hinge + ww, F.gy - h + (1 - k) * 18 * s], [hinge + ww, F.gy - (1 - k) * 18 * s], [hinge, F.gy]];
      sh(g, leaf, 'red', 'mid', { layers: [{ color: C.redD, alpha: .5, angle: -1.4 }] });
      if (k > .4) { const fx = hinge - f * ww / 2; sh(g, K.turn(K.rect(fx - 18 * s * k, F.Y(170), 36 * s * k, 36 * s), fx, F.Y(152), PI / 4), 'straw', 'mid', { w: 1.6 }); K.text(g, '福', fx, F.Y(144), { font: `${Math.round(22 * s * k)}px ${FONT.type}`, align: 'center', color: C.red }); }
      K.dot(g, hinge - f * (ww - 14 * s * k), F.Y(124), 5 * s, C.straw);
      // the courier: knocks close to the door, then steps back with the parcel
      const knock = F.is('knock'), give = F.is('handover');
      const target = [L.near + f * 8 * s, F.Y(160) + (knock ? Math.abs(Math.sin(t * 7)) * 10 * s : 0)];
      const J = person(g, F, 'hero', 'courier', 'stand', knock ? L.knockAt : L.courier, F.gy, .96, f, { arms: knock ? 'reach' : give ? 'give' : 'hold', reach: target, face: give ? 'happy' : knock ? 'neutral' : 'happy' });
      if (!knock) P().box(g, J.haF[0] - (f > 0 ? 6 : 50) * s, J.haF[1] + 20 * s, 56 * s, 44 * s, { label: '快递' });
    },
    front(g, F) {
      const s = F.s, L = F.lay, f = F.f;
      floor(g, F, 'planks', 'tan');
      const mx = L.door + L.dw / 2;
      sh(g, [[mx - 70 * s, F.gy - 2 * s], [mx + 70 * s, F.gy - 2 * s], [mx + 80 * s, F.gy + 10 * s], [mx - 80 * s, F.gy + 10 * s]], 'red', 'near', { layers: [{ color: C.straw, angle: 0, gap: 6, alpha: .7 }] });
      // parcels waiting at the foot of the stairs
      const px = F.X(.12) - (f > 0 ? 0 : 70 * s);
      P().box(g, px, F.gy, 70 * s, 50 * s, { color: 'tan', label: '快递' });
      P().box(g, px + 8 * s, F.gy - 50 * s, 54 * s, 40 * s, { color: 'cream' });
      if (F.is('knock')) P().box(g, px + 74 * s * f + (f > 0 ? 0 : 20 * s), F.gy, 50 * s, 40 * s, { color: 'ochre' });
      plant(g, F.X(.96), F.gy, .9 * s, 'near', 'teal');
      if (F.bx0 < F.x0 - 5 && f > 0 || f < 0 && F.bx1 > F.x1 + 5) P().scooter(g, f > 0 ? F.bx0 + 20 * s : F.bx1 - 20 * s, F.gy, .8 * s, f, { logo: '外卖' });
    },
    top(g, F) {
      const s = F.s, L = F.lay, t = F.t;
      if (F.is('knock')) for (let i = 0; i < 2; i++) { const k = ((t * 1.4 + i * .5) % 1); g.save(); g.globalAlpha = 1 - k; K.text(g, '咚', L.near + F.f * (i ? 60 : 24) * s, F.Y(210 + i * 40 + k * 30), { font: `${Math.round(26 * s)}px ${FONT.type}`, align: 'center', color: C.red, double: true }); g.restore(); }
      if (F.is('handover')) P().heart(g, L.near - F.f * 40 * s, F.Y(300) - Math.abs(Math.sin(t * 3)) * 10 * s, 13 * s);
    },
  };

  /* =====================================================================================================
   * desk: typing | meeting | overtime
   * an office corner: a whiteboard, a window, a long desk with a screen; colleagues come and go
   * ===================================================================================================== */
  SETS.desk = {
    modes: ['typing', 'meeting', 'overtime'], minW: 440, H0: 420,
    plan(F) {
      const s = F.s, f = F.f, d0 = F.X(.42), d1 = F.X(.99), top = F.Y(118);
      return { d0, d1, top, chair: F.X(.47), screen: F.X(.75), board: [F.X(.02), F.X(.36)], at: { desk: [F.X(.7), top], board: [F.X(.19), F.Y(300)] } };
    },
    key: F => F.is('overtime') ? 'night' : F.is('meeting') ? 'meet' : '',
    back(g, F) {
      const s = F.s, L = F.lay, f = F.f, night = F.is('overtime');
      wash(g, F.bx0, F.Y(410), F.bx1, F.gy, night ? 'lilac' : 'sky', { cross: night ? 'violet' : 'blueL', base: night ? .45 : .32 });
      // whiteboard with sticky notes and a chart
      const b0 = Math.min(...L.board), b1 = Math.max(...L.board), by = F.Y(370), bh = 170 * s;
      sh(g, K.rect(b0, by, b1 - b0, bh), 'white', 'far', { layers: [{ color: C.sky, alpha: .3 }] });
      ln(g, K.rect(b0 - 4 * s, by - 4 * s, b1 - b0 + 8 * s, bh + 8 * s), 'mid', { closed: true, color: 'grey', w: 3 });
      const notes = ['yolk', 'pink', 'mint', 'yolk', 'sky', 'rose'];
      for (let i = 0; i < 6; i++) { const nx = b0 + 14 * s + (i % 3) * 40 * s, ny = by + 16 * s + Math.floor(i / 3) * 44 * s; K.hatch(g, K.rect(nx, ny, 30 * s, 30 * s), { color: col(notes[i]), base: .85, gap: 2.4 }); ln(g, [[nx + 5 * s, ny + 12 * s], [nx + 24 * s, ny + 12 * s]], 'far', { detail: true, color: 'navy' }); }
      const cx = b0 + 140 * s; if (cx + 20 * s < b1) ln(g, [[cx, by + bh - 20 * s], [cx + 20 * s, by + bh - 60 * s], [cx + 40 * s, by + bh - 45 * s], [Math.min(b1 - 10 * s, cx + 70 * s), by + bh - 110 * s]], 'mid', { color: 'red', w: 2.4 });
      // window and clock
      windowView(g, F.X(.6), F.Y(400), 150 * s, 120 * s, night);
      wallClock(g, F.X(.48), F.Y(330), 24 * s, night ? 11 : 3, night ? 40 : 10);
      // the office chair
      const cx2 = L.chair;
      sh(g, K.rect(cx2 - 30 * s, F.Y(68), 60 * s, 10 * s), 'navy', 'mid');
      sh(g, K.rounded([[cx2 - f * 30 * s, F.Y(170)], [cx2 - f * 18 * s, F.Y(170)], [cx2 - f * 18 * s, F.Y(72)], [cx2 - f * 30 * s, F.Y(72)], [cx2 - f * 30 * s, F.Y(170)]], 5 * s), 'navy', 'mid');
      ln(g, [[cx2, F.Y(58)], [cx2, F.Y(18)]], 'mid', { w: 3 }); ln(g, [[cx2 - 26 * s, F.gy - 4 * s], [cx2 + 26 * s, F.gy - 4 * s]], 'mid', { w: 3 });
      for (const d of [-1, 1]) K.dot(g, cx2 + d * 26 * s, F.gy - 4 * s, 4 * s, C.navy);
      plant(g, F.X(.97), F.Y(118), .7 * s, 'far', 'red');
    },
    mid(g, F) {
      const s = F.s, L = F.lay, t = F.t, f = F.f;
      const meet = F.is('meeting'), late = F.is('overtime');
      if (meet) {
        const b0 = Math.min(...L.board), b1 = Math.max(...L.board);
        person(g, F, 'colleague2', 'clerk', 'stand', F.X(.6), F.gy, .9, -f, { arms: 'clap', face: 'happy' });
        P().person(g, seatedAt(F, L.chair, .9, -f, { t, arms: 'hold' }), cast(F, 'colleague', 'boss', { face: 'neutral' }));
        person(g, F, 'hero', 'office', 'stand', F.X(.27), F.gy, .95, -f, { arms: 'point', target: [(b0 + b1) / 2 - f * 20 * s, F.Y(300)], face: 'happy' });
      } else {
        P().person(g, seatedAt(F, L.chair, .95, f, { t, arms: late ? 'sleep' : 'type' }), cast(F, 'hero', 'coder', { face: late ? 'sleepy' : 'neutral' }));
        F.at.hero = null;
        if (!late) person(g, F, 'colleague', 'office', 'stand', F.X(.2), F.gy, .9, f, { arms: 'hold', face: 'happy', hair: 'bob', shirt: 'stripes', shirtColor: 'green' });
      }
    },
    front(g, F) {
      const s = F.s, L = F.lay, f = F.f, late = F.is('overtime');
      floor(g, F, 'planks', 'creamD');
      const x0 = Math.min(L.d0, L.d1), x1 = Math.max(L.d0, L.d1) + (F.x1 >= F.W - 30 ? 20 : 0);
      for (const x of [x0 + 14 * s, x1 - 22 * s]) sh(g, K.rect(x, L.top + 12 * s, 9 * s, F.gy - L.top - 12 * s), 'grey', 'near');
      sh(g, K.rect(x1 - 110 * s, L.top + 12 * s, 84 * s, F.gy - L.top - 20 * s), 'grey', 'near', { layers: [{ color: C.lilac }, { color: C.blue, angle: .5, gap: 7, alpha: .3 }] });
      for (let i = 1; i < 3; i++) ln(g, [[x1 - 110 * s, L.top + 12 * s + i * (F.gy - L.top) / 3], [x1 - 26 * s, L.top + 12 * s + i * (F.gy - L.top) / 3]], 'near', { detail: true });
      sh(g, K.rect(x0, L.top, x1 - x0, 14 * s), 'tan', 'near', { layers: [{ color: C.ochre, alpha: .6, angle: -.1 }] });
      // the screen, keyboard and things on the desk
      const sx = L.screen;
      sh(g, K.rect(sx - 8 * s, L.top - 34 * s, 16 * s, 34 * s), 'grey', 'near');
      sh(g, K.rect(sx - 70 * s, L.top - 128 * s, 140 * s, 96 * s), 'navy', 'near', { layers: [{ color: C.ink }] });
      sh(g, [[L.chair + f * 50 * s, L.top - 6 * s], [L.chair + f * 120 * s, L.top - 6 * s], [L.chair + f * 116 * s, L.top], [L.chair + f * 54 * s, L.top]], 'grey', 'mid');
      const mug = sx + f * 96 * s;
      if (x0 < mug && mug < x1) P().cup(g, mug, L.top, .55 * s, { color: 'red' });
      const pile = late ? 7 : 3, px = L.chair + f * 160 * s;
      for (let i = 0; i < pile; i++) sh(g, K.rect(sx + f * 110 * s - (f > 0 ? 0 : 52 * s) + K.rnd(-4, 4) * s, L.top - (i + 1) * 7 * s, 52 * s, 7 * s), 'white', 'mid', { w: 1.6 });
      if (late) { for (let i = 0; i < 2; i++) P().cup(g, x0 + (30 + i * 34) * s, L.top, .45 * s, { color: i ? 'teal' : 'straw' }); ln(g, [[x1 - 40 * s, L.top], [x1 - 60 * s, L.top - 90 * s], [x1 - 30 * s, L.top - 110 * s]], 'near', { w: 3.4 }); sh(g, [[x1 - 46 * s, L.top - 122 * s], [x1 - 6 * s, L.top - 108 * s], [x1 - 16 * s, L.top - 92 * s], [x1 - 44 * s, L.top - 100 * s]], 'straw', 'near'); }
      P().bucket(g, x0 + (f > 0 ? -30 : x1 - x0 + 30) * s, F.gy, .45 * s, 'grey');
    },
    top(g, F) {
      const s = F.s, L = F.lay, t = F.t, late = F.is('overtime');
      const sx = L.screen, y0 = L.top - 118 * s;
      for (let i = 0; i < 5; i++) { const w = (F.is('typing') ? ((t * 1.3 + i * .37) % 1) : .8) * (110 - (i % 3) * 20) * s; K.line(g, [[sx - 56 * s, y0 + i * 15 * s], [sx - 56 * s + w, y0 + i * 15 * s]], { color: [C.green, C.straw, C.pink, C.sky, C.mint][i], w: 2.4, passes: 1 }); }
      if (late) { const x1 = Math.max(L.d0, L.d1); g.save(); g.globalAlpha = .3 + .05 * Math.sin(t * 3); g.fillStyle = K.grain(C.yolk, .3); g.beginPath(); g.moveTo(x1 - 40 * s, L.top - 96 * s); g.lineTo(x1 + 10 * s, L.top - 96 * s); g.lineTo(x1 + 30 * s, L.top); g.lineTo(x1 - 120 * s, L.top); g.fill(); g.restore(); }
      if (F.is('meeting')) P().bubble(g, F.X(.4), F.Y(290), F.st.say || '这样排！', { size: Math.round(18 * s), pop: K.clamp(F.p * 2) });
    },
  };

  /* =====================================================================================================
   * counter: queue | pay | change
   * a shop counter with a till; a cashier behind it, a line of customers in front
   * ===================================================================================================== */
  SETS.counter = {
    modes: ['queue', 'pay', 'change'], minW: 460, H0: 420,
    plan(F) {
      const s = F.s, f = F.f, c0 = F.X(.56), cashier = F.X(.83), till = F.X(.66);
      const first = c0 - f * 70 * s, room = Math.abs(first - F.X(0)) + (F.f > 0 ? F.x0 - F.bx0 : F.bx1 - F.x1) * .6;
      const n = Math.max(1, Math.min(4, 1 + Math.floor(room / (78 * s))));
      return { c0, cashier, till, first, n, top: F.Y(112), at: { till: [till, F.Y(112)], first: [first, F.gy] } };
    },
    key: F => F.modes.join(','),
    back(g, F) {
      const s = F.s, L = F.lay, f = F.f;
      wash(g, F.bx0, F.Y(410), F.bx1, F.gy, 'mint', { cross: 'teal', base: .3 });
      // shelves behind the cashier, a price board above the line
      const sx = Math.min(F.X(.6), F.X(1)) + 8 * s, sw = Math.abs(F.X(1) - F.X(.6)) - 16 * s;
      P().shelf(g, sx, F.Y(140), sw, 4, { rowH: 54 * s });
      const bx = F.X(.04) - (f > 0 ? 0 : 200 * s);
      sh(g, K.rect(bx, F.Y(400), 200 * s, 120 * s), 'navy', 'far', { base: .7, layers: [{ color: C.ink, alpha: .5 }] });
      K.text(g, F.st.sign ?? '今日 · 价目', bx + 100 * s, F.Y(368), { font: `${Math.round(18 * s)}px ${FONT.type}`, align: 'center', color: C.white });
      ['豆浆  ¥3', '包子  ¥2', '油条  ¥2'].forEach((r, i) => K.text(g, r, bx + 100 * s, F.Y(340 - i * 24), { font: `${Math.round(15 * s)}px ${FONT.mono}`, align: 'center', color: C.yolk }));
      for (let i = 0; i < 2; i++) P().lantern(g, F.X(.48 + i * .14), F.Y(375), .8 * s, 0);
      // the people further back in the line are part of the picture (they wait; only the first one acts)
      for (let i = L.n - 1; i >= 1; i--) {
        const x = L.first - f * i * 78 * s, look = crowd(i + 1, { t: undefined, face: i === L.n - 1 ? 'sleepy' : i === 1 ? 'worried' : 'neutral' });
        const J = K.pose.stand(x, F.gy, .9 * s, f, Object.assign({ arms: i === 1 ? 'phone' : 'hold' }, look));
        P().person(g, J, look);
        if (i === 1) P().phone(g, J.haF[0] + f * 6 * s, J.haF[1], .3 * s, { screen: 'pay' });
      }
    },
    mid(g, F) {
      const s = F.s, L = F.lay, t = F.t, f = F.f;
      const pay = F.is('pay'), change = F.is('change');
      person(g, F, 'hero', 'cashier', 'stand', L.cashier, F.gy, .95, -f, { arms: change ? 'give' : pay ? 'hold' : 'stir', face: change ? 'happy' : 'neutral' });
      const J = person(g, F, 'customer', crowd(0), 'stand', L.first, F.gy, .92, f, { arms: pay ? 'give' : change ? 'reach' : 'carry', reach: [L.till - f * 40 * s, L.top - 30 * s], face: change ? 'happy' : pay ? 'neutral' : 'neutral' });
      if (pay) P().phone(g, J.haF[0] + f * 8 * s, J.haF[1] - 4 * s, .36 * s, { screen: 'pay', tilt: f * .5 });
      if (!pay && !change) P().basket(g, J.haF[0] + f * 10 * s, J.haF[1] + 4 * s, 60 * s, 'red');
    },
    front(g, F) {
      const s = F.s, L = F.lay, f = F.f;
      floor(g, F, 'tiles', 'cream');
      const x0 = Math.min(L.c0, F.f > 0 ? F.bx1 : F.bx0), x1 = Math.max(L.c0, F.f > 0 ? F.bx1 : F.bx0), cy = L.top;
      sh(g, K.rect(x0, cy + 14 * s, x1 - x0, F.gy - cy - 14 * s), 'red', 'near', { angle: -1.5, layers: [{ color: C.redD, angle: -1.5, gap: 5, alpha: .5 }, { color: C.straw, angle: .3, gap: 10, alpha: .3 }] });
      sh(g, K.rect(x0 - 6 * s, cy, x1 - x0 + 12 * s, 16 * s), 'cream', 'near', { layers: [{ color: C.creamD }] });
      const sx = (L.c0 + L.cashier) / 2;
      sh(g, K.rect(sx - 52 * s, cy + 34 * s, 104 * s, 40 * s), 'cream', 'mid');
      K.text(g, '收 银', sx, cy + 62 * s, { font: `${Math.round(24 * s)}px ${FONT.type}`, align: 'center', color: C.redD, double: true });
      // the till and a QR stand
      const tx = L.till;
      sh(g, [[tx - 50 * s, cy], [tx + 50 * s, cy], [tx + 44 * s, cy - 40 * s], [tx - 44 * s, cy - 40 * s]], 'grey', 'near', { layers: [{ color: C.lilac }] });
      sh(g, K.rect(tx - 8 * s, cy - 76 * s, 16 * s, 36 * s), 'grey', 'mid');
      sh(g, K.rect(tx - 40 * s, cy - 106 * s, 80 * s, 34 * s), 'navy', 'near');
      const qx = tx - f * 72 * s;
      sh(g, K.rect(qx - 18 * s, cy - 54 * s, 36 * s, 54 * s), 'white', 'mid', { layers: [{ color: C.sky, alpha: .4 }] });
      for (let i = 0; i < 9; i++) if ((i * 5) % 3) K.hatch(g, K.rect(qx - 14 * s + (i % 3) * 10 * s, cy - 48 * s + ((i / 3) | 0) * 10 * s, 8 * s, 8 * s), { color: C.navy, base: .9, gap: 2 });
      K.text(g, '扫码', qx, cy - 8 * s, { font: `${Math.round(10 * s)}px ${FONT.type}`, align: 'center', color: C.red });
    },
    top(g, F) {
      const s = F.s, L = F.lay, t = F.t, f = F.f, cy = L.top, tx = L.till;
      const pay = F.is('pay'), change = F.is('change');
      const txt = change ? '找零 ¥2' : pay ? '¥ 18.00' : '¥ ' + (8 + Math.floor((t * 2) % 10));
      K.text(g, txt, tx, cy - 82 * s, { font: `${Math.round(17 * s)}px ${FONT.mono}`, align: 'center', color: pay ? C.green : C.yolk });
      if (pay) for (let i = 0; i < 2; i++) { const k = ((t * 1.8 + i * .5) % 1); g.save(); g.globalAlpha = 1 - k; K.line(g, K.ell(tx - f * 72 * s, cy - 30 * s, (20 + k * 30) * s, (20 + k * 30) * s, 12, f > 0 ? PI * .75 : -PI * .25, f > 0 ? PI * 1.25 : PI * .25), { color: C.green, w: 2.2, passes: 1 }); g.restore(); }
      if (change) {
        sh(g, K.rect(tx - 40 * s, cy - 6 * s, 80 * s, 14 * s * K.clamp(F.p * 3)), 'grey', 'near');
        const h = F.at.hero, c = F.at.customer;
        if (h && c) for (let i = 0; i < 3; i++) { const k = ((t * .9 + i / 3) % 1), x = K.lerp(h.haF[0], c.haF[0], k), y = K.lerp(h.haF[1], c.haF[1], k) - Math.sin(k * PI) * 40 * s; P().coin(g, x, y, 9 * s, t + i); }
      }
    },
  };

  /* =====================================================================================================
   * servers: ok | overload | down
   * a machine room: racks under a cable tray, an engineer at a cart
   * ===================================================================================================== */
  SETS.servers = {
    modes: ['ok', 'overload', 'down'], minW: 440, H0: 420,
    plan(F) {
      const s = F.s, f = F.f, span = Math.abs(F.X(.66) - F.X(.02)), n = Math.max(2, Math.min(6, Math.floor(span / (96 * s)))), racks = [];
      for (let i = 0; i < n; i++) racks.push(F.X(.02) + f * (48 * s + i * span / n));
      return { racks, rw: 84 * s, rh: 330 * s, eng: F.X(.86), cart: F.X(.75), at: { racks: [racks[(n / 2) | 0], F.Y(330)], engineer: [F.X(.86), F.gy] } };
    },
    key: F => F.is('down') ? 'down' : '',
    back(g, F) {
      const s = F.s, L = F.lay;
      wash(g, F.bx0, Math.min(F.y0 + 4, F.Y(420)), F.bx1, F.gy, 'navy', { base: .46, cross: 'violet', layers: [{ color: C.navy, alpha: .5 }, { color: C.violet, angle: .45, gap: 8, alpha: .35 }] });
      // cable tray and cables
      const ty = F.Y(372);
      sh(g, K.rect(F.bx0, ty, F.bx1 - F.bx0, 16 * s), 'grey', 'far', { layers: [{ color: C.lilac }] });
      ['green', 'straw', 'pink', 'sky'].forEach((c, i) => ln(g, K.resample([[F.bx0, ty + 4 * s + i * 3 * s], [F.bx1, ty + 4 * s + i * 3 * s]], 40).map((p, k) => [p[0], p[1] + Math.sin(k * .9 + i) * 1.5 * s]), 'far', { color: c, w: 2.2, alpha: 1 }));
      for (const x of L.racks) {
        ['green', 'pink'].forEach((c, i) => ln(g, K.qbez([x - 10 * s + i * 20 * s, ty + 16 * s], [x - 6 * s + i * 14 * s, ty + 30 * s], [x - 8 * s + i * 16 * s, F.gy - L.rh], 6), 'far', { color: c, w: 2, alpha: 1 }));
        const x0 = x - L.rw / 2, y0 = F.gy - L.rh;
        sh(g, K.rect(x0, y0, L.rw, L.rh), 'ink', 'mid', { layers: [{ color: C.navy }, { color: C.violet, angle: .5, gap: 7, alpha: .4 }] });
        for (let u = 0; u < 7; u++) { const uy = y0 + 12 * s + u * 44 * s; sh(g, K.rect(x0 + 8 * s, uy, L.rw - 16 * s, 34 * s), F.is('down') && u % 3 === 1 ? 'lilac' : 'grey', 'mid', { w: 1.6, gap: 3.2 }); ln(g, [[x0 + 14 * s, uy + 10 * s], [x0 + L.rw * .5, uy + 10 * s]], 'mid', { detail: true }); }
      }
    },
    mid(g, F) {
      const s = F.s, L = F.lay, t = F.t, f = F.f;
      const busy = F.is('overload'), down = F.is('down');
      for (let r = 0; r < L.racks.length; r++) {
        const x0 = L.racks[r] - L.rw / 2, y0 = F.gy - L.rh;
        for (let u = 0; u < 7; u++) for (let j = 0; j < 3; j++) {
          const uy = y0 + 12 * s + u * 44 * s + 17 * s, on = Math.sin(t * (busy ? 9 + j * 3 : 3 + j) + u * 2.1 + j + r * 1.3) > (busy ? -.3 : .2);
          const c = down ? (j === 0 && Math.sin(t * 4 + u + r) > 0 ? C.red : C.lilac) : busy ? (on ? (j === 0 ? C.red : C.orange) : C.lilac) : (on ? (j === 0 ? C.green : C.straw) : C.lilac);
          K.blob(g, x0 + L.rw - 18 * s - j * 11 * s, uy, 3.6 * s, c, 1);
        }
      }
      const look = down ? 'surprised' : busy ? 'worried' : 'happy';
      const J = person(g, F, 'hero', 'engineer', 'stand', L.eng, F.gy, .95, -f, { shirt: 'straw', arms: down ? 'shrug' : busy ? 'type' : 'point', target: [L.racks[L.racks.length - 1], F.Y(260)], face: look });
    },
    front(g, F) {
      const s = F.s, L = F.lay, f = F.f;
      floor(g, F, 'tiles', 'grey');
      // the cart with a laptop
      const cx = L.cart, cy = F.Y(112);
      sh(g, K.rect(cx - 60 * s, cy, 120 * s, 12 * s), 'grey', 'near');
      for (const d of [-1, 1]) { ln(g, [[cx + d * 50 * s, cy + 12 * s], [cx + d * 50 * s, F.gy - 14 * s]], 'near', { w: 3 }); K.dot(g, cx + d * 50 * s, F.gy - 7 * s, 7 * s, C.navy); }
      sh(g, K.rect(cx - 55 * s, F.Y(50), 110 * s, 9 * s), 'grey', 'near');
      P().laptop(g, cx, cy, .9 * s, {});
      // cables across the floor, an extinguisher
      ln(g, K.bez([L.racks[0], F.gy + 4 * s], [L.racks[0] + f * 80 * s, F.gy + 16 * s], [cx - f * 90 * s, F.gy - 6 * s], [cx, cy + 6 * s], 18), 'near', { color: 'straw', w: 3 });
      const ex = F.X(.98) - f * 6 * s;
      sh(g, K.rounded([[ex - 13 * s, F.gy], [ex - 13 * s, F.Y(70)], [ex + 13 * s, F.Y(70)], [ex + 13 * s, F.gy], [ex - 13 * s, F.gy]], 8 * s), 'red', 'near');
      ln(g, [[ex, F.Y(70)], [ex, F.Y(84)], [ex + f * 16 * s, F.Y(80)]], 'near', { w: 3 });
    },
    top(g, F) {
      const s = F.s, L = F.lay, t = F.t, f = F.f, cx = L.cart, cy = F.Y(112);
      const busy = F.is('overload'), down = F.is('down');
      // the laptop screen: a heartbeat, red when it is bad
      const sx = cx - 40 * s, sy = cy - 50 * s, pts = [];
      for (let i = 0; i <= 20; i++) { const x = sx + i * 4 * s, ph = (i / 20 + t * .8) % 1; pts.push([x, sy + (down ? 0 : (ph > .4 && ph < .5 ? -14 * s * (busy ? 1.4 : 1) : ph > .5 && ph < .55 ? 8 * s : 0))]); }
      K.line(g, pts, { color: down ? C.red : busy ? C.orange : C.green, w: 2.2, passes: 1 });
      if (busy) for (const x of L.racks) for (let k = 0; k < 2; k++) P().steam(g, x - 16 * s + k * 32 * s, F.gy - L.rh - 8 * s, t, k + x, 80 * s, 6 * s, k ? 'red' : 'orange');
      if (down) {
        const x = L.racks[(L.racks.length / 2) | 0];
        for (let k = 0; k < 3; k++) P().puff(g, x + (k - 1) * 22 * s, F.gy - L.rh - 10 * s, 60 * s, t, k);
        for (let k = 0; k < 4; k++) { const a = t * 6 + k * 1.7, r = (8 + ((t * 3 + k * .3) % 1) * 24) * s; K.line(g, [[x + Math.cos(a) * r * .4, F.Y(200) + Math.sin(a) * r * .4], [x + Math.cos(a) * r, F.Y(200) + Math.sin(a) * r]], { color: C.yolk, w: 2.4, passes: 1 }); }
        P().mark(g, L.eng - f * 10 * s, F.Y(300), '!', { pop: .9 + .1 * Math.sin(t * 8), color: 'red' });
      }
    },
  };

  /* =====================================================================================================
   * clinic: register | wait | call
   * a waiting hall: a bench of patients, a number screen, a registration window with a nurse
   * ===================================================================================================== */
  SETS.clinic = {
    modes: ['register', 'wait', 'call'], minW: 460, H0: 420,
    plan(F) {
      const s = F.s, f = F.f, win0 = F.X(.62), nurse = F.X(.86), b0 = F.X(.03), b1 = F.X(.46);
      const seats = Math.max(2, Math.min(4, Math.floor(Math.abs(b1 - b0) / (70 * s))));
      return { win0, nurse, b0, b1, seats, top: F.Y(118), screen: [F.X(.3), F.Y(330)], at: { window: [F.X(.74), F.Y(118)], screen: [F.X(.3), F.Y(330)] } };
    },
    key: F => F.is('call') ? 'call' : F.is('register') ? 'reg' : '',
    back(g, F) {
      const s = F.s, L = F.lay, f = F.f;
      wash(g, F.bx0, F.Y(410), F.bx1, F.gy, 'mint', { cross: 'sky', base: .32 });
      K.hatch(g, K.rect(F.bx0, F.Y(92), F.bx1 - F.bx0, 92 * s), { color: C.sky, base: .45, gap: 3.6, layers: [{ color: C.blueL, alpha: .35 }] });
      ln(g, [[F.bx0, F.Y(92)], [F.bx1, F.Y(92)]], 'far', { w: 2.2 });
      // the window: a glass screen with a hole, a sign over it
      const w0 = Math.min(L.win0, F.f > 0 ? F.bx1 : F.bx0), w1 = Math.max(L.win0, F.f > 0 ? F.bx1 : F.bx0);
      sh(g, K.rect(w0, F.Y(320), w1 - w0, 202 * s), 'white', 'far', { layers: [{ color: C.sky, alpha: .3 }] });
      const sx = (L.win0 + L.nurse) / 2 + f * 20 * s;
      sh(g, K.rect(sx - 60 * s, F.Y(372), 120 * s, 40 * s), 'teal', 'mid', { base: .85 });
      K.text(g, F.st.sign ?? '挂号 · 收费', sx, F.Y(345), { font: `${Math.round(20 * s)}px ${FONT.type}`, align: 'center', color: C.white });
      // red cross, a poster, a clock
      const rx = F.X(.07);
      sh(g, [[rx, F.Y(372)], [rx + 50 * s, F.Y(372)], [rx + 50 * s, F.Y(322)], [rx, F.Y(322)]], 'white', 'far');
      K.hatch(g, K.rect(rx + 19 * s, F.Y(366), 12 * s, 38 * s), { color: C.red, base: .95, gap: 2 }); K.hatch(g, K.rect(rx + 6 * s, F.Y(353), 38 * s, 12 * s), { color: C.red, base: .95, gap: 2 });
      wallClock(g, F.X(.52), F.Y(350), 20 * s, 9, 30);
      // the bench and the people who wait on it (static: they only wait)
      const b0 = Math.min(L.b0, L.b1), b1 = Math.max(L.b0, L.b1), seat = F.Y(52);
      sh(g, K.rect(b0, F.Y(150), b1 - b0, 64 * s), 'sky', 'mid', { layers: [{ color: C.blueL }] });
      for (const x of [b0 + 16 * s, b1 - 16 * s]) ln(g, [[x, seat], [x, F.gy]], 'mid', { w: 3 });
      sh(g, K.rect(b0 - 6 * s, seat, b1 - b0 + 12 * s, 10 * s), 'blue', 'mid');
      const call = F.is('call');
      for (let i = 0; i < L.seats; i++) {
        if (call && i === 0) continue;
        const x = K.lerp(b0 + 30 * s, b1 - 60 * s, i / Math.max(1, L.seats - 1)), who = [['patient', {}], ['grandpa', { build: 'elder', cane: true }], ['schoolkid', { mask: true }], ['customer', { build: 'stout' }]][i % 4];
        const look = Object.assign({}, K.outfits[who[0]], who[1], { face: i === 1 ? 'sleepy' : i === 2 ? 'worried' : 'neutral' });
        P().person(g, seatedAt(F, x, .86, f, { arms: 'hold', build: look.build }), look);
      }
    },
    mid(g, F) {
      const s = F.s, L = F.lay, t = F.t, f = F.f;
      const reg = F.is('register'), call = F.is('call');
      person(g, F, 'hero', 'nurse', 'stand', L.nurse, F.gy, .92, -f, { arms: reg ? 'type' : call ? 'wave' : 'hold', face: 'happy' });
      if (reg) { const J = person(g, F, 'patient', crowd(8), 'stand', L.win0 - f * 40 * s, F.gy, .92, f, { arms: 'give', face: 'neutral' }); P().bankCard(g, J.haF[0] + f * 10 * s, J.haF[1] - 4 * s, .4 * s, {}); }
      if (call) {
        const k = K.ease(F.p), x = K.lerp(Math.min(L.b0, L.b1) + 30 * s, L.win0 - f * 60 * s, k);
        person(g, F, 'called', 'patient', k > .05 && k < .98 ? 'walk' : 'stand', x, F.gy, .9, f, { arms: k < .05 ? 'point' : undefined, target: L.screen, face: 'surprised' });
      }
    },
    front(g, F) {
      const s = F.s, L = F.lay, f = F.f;
      floor(g, F, 'tiles', 'white');
      const x0 = Math.min(L.win0, F.f > 0 ? F.bx1 : F.bx0), x1 = Math.max(L.win0, F.f > 0 ? F.bx1 : F.bx0);
      sh(g, K.rect(x0, L.top + 14 * s, x1 - x0, F.gy - L.top - 14 * s), 'white', 'near', { layers: [{ color: C.mint }, { color: C.teal, angle: .4, gap: 8, alpha: .35 }] });
      sh(g, K.rect(x0 - 6 * s, L.top, x1 - x0 + 12 * s, 16 * s), 'teal', 'near');
      ln(g, [[L.win0 + f * 10 * s, L.top], [L.win0 + f * 10 * s, F.Y(318)]], 'near', { color: 'blueL', w: 3 });
      P().medicine(g, L.nurse - f * 40 * s, L.top, .42 * s, { color: 'orange' });
      plant(g, F.X(.52), F.gy, .8 * s, 'near', 'red');
    },
    top(g, F) {
      const s = F.s, L = F.lay, t = F.t, call = F.is('call');
      const num = call ? (F.st.num || 'A013') : (F.st.num0 || 'A012');
      P().queueScreen(g, L.screen[0], L.screen[1], .9 * s, { num, t, blink: call });
      if (call) for (let i = 0; i < 2; i++) { const k = ((t * 1.5 + i * .5) % 1); g.save(); g.globalAlpha = 1 - k; K.line(g, K.ell(L.screen[0] + 90 * s, L.screen[1], (14 + k * 26) * s, (14 + k * 26) * s, 10, -PI / 3, PI / 3), { color: C.red, w: 2.4, passes: 1 }); g.restore(); }
    },
  };

  /* =====================================================================================================
   * classroom: teach | ask | exam
   * a blackboard and a teacher at the front, pupils at their desks
   * ===================================================================================================== */
  SETS.classroom = {
    modes: ['teach', 'ask', 'exam'], minW: 460, H0: 420,
    plan(F) {
      const s = F.s, f = F.f, b0 = F.X(.02), b1 = F.X(.52), teacher = F.X(.36), d0 = F.X(.56);
      const span = Math.abs(F.X(1.02) - d0), n = Math.max(1, Math.min(4, Math.floor(span / (100 * s))));
      const kids = []; for (let i = 0; i < n; i++) kids.push(d0 + f * (64 * s + i * span / n));
      return { b0, b1, teacher, kids, by: F.Y(380), bh: 190 * s, at: { board: [(b0 + b1) / 2, F.Y(290)], teacher: [teacher, F.gy] } };
    },
    key: F => F.is('exam') ? 'exam' : F.is('ask') ? 'ask' : '',
    back(g, F) {
      const s = F.s, L = F.lay, f = F.f;
      wash(g, F.bx0, F.Y(415), F.bx1, F.gy, 'straw', { cross: 'ochre', base: .26 });
      K.hatch(g, K.rect(F.bx0, F.Y(90), F.bx1 - F.bx0, 90 * s), { color: C.greenD, base: .4, gap: 3.6, layers: [{ color: C.green, alpha: .3 }] });
      const b0 = Math.min(L.b0, L.b1), b1 = Math.max(L.b0, L.b1);
      sh(g, K.rect(b0 - 8 * s, L.by - 8 * s, b1 - b0 + 16 * s, L.bh + 16 * s), 'brown', 'mid');
      K.hatch(g, K.rect(b0, L.by, b1 - b0, L.bh), { color: C.greenD, base: .85, gap: 3, layers: [{ color: C.navy, alpha: .25, angle: .4, gap: 7 }, { color: C.green, alpha: .2, gap: 9, angle: -1.3 }] });
      sh(g, K.rect(b0, L.by + L.bh, b1 - b0, 8 * s), 'tan', 'mid');
      for (let i = 0; i < 3; i++) ln(g, [[b0 + (20 + i * 14) * s, L.by + L.bh + 2 * s], [b0 + (30 + i * 14) * s, L.by + L.bh + 2 * s]], 'mid', { color: 'white', w: 3, passes: 1 });
      wallClock(g, F.X(.62), F.Y(352), 22 * s, 10, 0);
      windowView(g, F.X(.72), F.Y(400), Math.abs(F.X(.97) - F.X(.72)) - 10 * s, 120 * s, false);
      sh(g, K.rect(F.X(.56) - (f > 0 ? 0 : 40 * s), F.Y(300), 40 * s, 56 * s), 'red', 'far');
      K.text(g, '★', F.X(.56) + f * 20 * s - (f > 0 ? 0 : 0), F.Y(262), { font: `${Math.round(22 * s)}px ${FONT.type}`, align: 'center', color: C.yolk });
      // a back row (smaller, higher) behind the front row; the front row's first pupil acts in mid
      const exam = F.is('exam');
      if (L.kids.length >= 2) for (let i = L.kids.length - 1; i >= 0; i--) {
        const x = L.kids[i] + f * 40 * s, by = F.gy - 40 * s, sc = .78;
        const look = Object.assign({}, K.outfits[i % 2 ? 'schoolkid' : 'pupil'], { backpack: false, face: exam ? 'worried' : i % 2 ? 'happy' : 'neutral', hair: ['bob', 'curly', 'buzz', 'ponytail'][i % 4], shirt: ['green', 'sky', 'pink', 'straw'][i % 4] });
        P().person(g, K.pose.sit(x, by - 52 * sc * s, sc * s, -f, { arms: exam ? 'type' : 'hold', build: 'kid', floor: by }), look);
        const dx = x - f * 50 * s;
        sh(g, K.rect(dx - 28 * s, by - 76 * s, 56 * s, 9 * s), 'ochre', 'far');
        sh(g, K.rect(dx - 25 * s, by - 67 * s, 50 * s, 26 * s), 'tan', 'far');
      }
      for (let i = L.kids.length - 1; i >= 1; i--) {
        const look = Object.assign({}, K.outfits[i % 2 ? 'pupil' : 'schoolkid'], { backpack: false, face: exam ? 'worried' : 'neutral', hair: ['spiky', 'pigtails', 'short'][i % 3] });
        P().person(g, seatedAt(F, L.kids[i], .9, -f, { arms: exam ? 'type' : 'hold', build: 'kid', floor: F.gy }), look);
      }
    },
    mid(g, F) {
      const s = F.s, L = F.lay, t = F.t, f = F.f, ask = F.is('ask'), exam = F.is('exam');
      person(g, F, 'hero', 'teacher', exam ? 'walk' : 'stand', L.teacher, F.gy, .98, f, { arms: ask ? 'shrug' : exam ? 'hips' : 'point', target: [(L.b0 + L.b1) / 2 - f * 40 * s, L.by + 70 * s], face: ask ? 'happy' : exam ? 'neutral' : 'happy', t: exam ? t * .4 : t });
      const look = Object.assign({}, cast(F, 'pupil', 'schoolkid'), { backpack: false, face: ask ? 'happy' : exam ? 'worried' : 'neutral' });
      const J = seatedAt(F, L.kids[0], .9, -f, { t, arms: ask ? 'up' : exam ? 'type' : 'hold', build: 'kid' });
      P().person(g, J, look); F.at.pupil = J;
    },
    front(g, F) {
      const s = F.s, L = F.lay, f = F.f, exam = F.is('exam');
      floor(g, F, 'planks', 'tan');
      for (const x of L.kids) {
        const dx = x - f * 58 * s, top = F.Y(88);
        sh(g, K.rect(dx - 34 * s, top, 68 * s, 10 * s), 'ochre', 'near');
        sh(g, K.rect(dx - 30 * s, top + 10 * s, 60 * s, 30 * s), 'tan', 'near');
        for (const d of [-1, 1]) ln(g, [[dx + d * 26 * s, top + 40 * s], [dx + d * 28 * s, F.gy]], 'near', { w: 3.2 });
        P().schoolbag(g, dx + f * 20 * s, top + 64 * s, .38 * s, { color: ['blue', 'red', 'orange'][Math.round(Math.abs(x)) % 3] });
        if (exam) sh(g, K.turn(K.rect(dx - 16 * s, top - 4 * s, 32 * s, 4 * s), dx, top, -.05), 'white', 'mid', { w: 1.4 });
      }
      // the teacher's desk at the very front of the room
      const tx = F.X(.04) - (f > 0 ? 0 : 90 * s);
      sh(g, K.rect(tx, F.Y(96), 90 * s, 96 * s), 'brown', 'near', { layers: [{ color: C.tan }, { color: C.navy, angle: .5, gap: 8, alpha: .3 }] });
      for (let i = 0; i < 3; i++) sh(g, K.rect(tx + 10 * s, F.Y(110 + i * 12), 66 * s, 12 * s), ['red', 'blue', 'straw'][i], 'mid', { w: 1.8 });
    },
    top(g, F) {
      const s = F.s, L = F.lay, t = F.t, f = F.f, ask = F.is('ask'), exam = F.is('exam');
      const b0 = Math.min(L.b0, L.b1), b1 = Math.max(L.b0, L.b1), W = b1 - b0, prog = F.is('teach') ? F.p : 1;
      const chalk = (s0, x, y, size, k = 1) => K.text(g, s0, x, y, { font: `${Math.round(size * s)}px ${FONT.mono}`, color: C.white, chars: Array.from(s0).length * k, alpha: .92 });
      if (exam) { chalk(F.st.board || '考 试', b0 + 24 * s, L.by + 70 * s, 34); chalk('45 min', b0 + 24 * s, L.by + 116 * s, 22); P().clock(g, b1 - 48 * s, L.by + 64 * s, 30 * s, t * 2, { speed: 4, hour: 10 }); }
      else {
        const lines = (F.st.board || 'a² + b² = c²\nx → y').split('\n'); const total = lines.length;
        lines.forEach((ln0, i) => chalk(ln0, b0 + 20 * s, L.by + (44 + i * 40) * s, 24, K.clamp(prog * total - i)));
        const tri = [[b1 - 120 * s, L.by + 150 * s], [b1 - 30 * s, L.by + 150 * s], [b1 - 120 * s, L.by + 70 * s]];
        if (b1 - b0 > 250 * s) K.line(g, tri, { color: C.white, w: 2.4, passes: 1, closed: true, progress: K.clamp(prog * 1.3 - .2), alpha: .9 });
        if (ask) { const J = F.at.pupil; if (J) P().mark(g, J.head[0] - f * 30 * s, J.head[1] - 40 * s, '?', { pop: K.clamp(F.p * 2), color: 'red' }); }
      }
    },
  };

  /* =====================================================================================================
   * boba: order | make | call
   * a bubble-tea counter: a cashier at the till, a barista shaking, chibi customers in line (pencil-friendly)
   * ===================================================================================================== */
  SETS.boba = {
    modes: ['order', 'make', 'call'], minW: 440, H0: 400,
    plan(F) {
      const s = F.s, f = F.f, c0 = F.X(.42), barista = F.X(.67), cashier = F.X(.9), first = F.X(.31);
      const n = Math.max(1, Math.min(3, Math.floor(Math.abs(first - F.X(0)) / (70 * s)) + 1));
      return { c0, barista, cashier, first, n, top: F.Y(66), at: { till: [cashier - f * 30 * s, F.Y(66)], bell: [F.X(.78), F.Y(66)], first: [first, F.gy] } };
    },
    key: F => F.is('call') ? 'call' : F.is('make') ? 'make' : '',
    back(g, F) {
      const s = F.s, L = F.lay, f = F.f;
      wash(g, F.bx0, F.Y(400), F.bx1, F.gy, 'cream', { cross: 'peach', base: .34 });
      const mx = F.X(.03) - (f > 0 ? 0 : 230 * s);
      const mw = Math.min(230 * s, F.w * .44);
      P().menuBoard(g, F.f > 0 ? mx : F.X(.03) - mw, F.Y(370), mw, 110 * s, { title: F.st.sign || 'menu', items: F.st.menu || [['珍珠奶茶', '12'], ['黑糖波波', '15'], ['芋泥啵啵', '14']], hang: 30 * s });
      // a shelf over the counter: the pearl pot, jars, an hourglass
      const sx0 = Math.min(F.X(.5), F.X(.99)), sx1 = Math.max(F.X(.5), F.X(.99)), sy = F.Y(250);
      sh(g, K.rect(sx0, sy, sx1 - sx0, 8 * s), 'tan', 'far');
      for (const x of [sx0 + 16 * s, sx1 - 16 * s]) ln(g, [[x, sy + 8 * s], [x + (x < (sx0 + sx1) / 2 ? 12 : -12) * s, sy + 34 * s]], 'far', { detail: true });
      P().pearlJar(g, F.X(.92), sy, .62 * s, { label: '珍珠', n: 9 });
      P().hourglass(g, F.X(.8), sy - 36 * s, .55 * s, 0, { p: .4 });
      P().pearlPot(g, F.X(.6), sy, .7 * s, { low: F.is('call') });
      // the people further back in the line
      for (let i = L.n - 1; i >= 1; i--) {
        const look = Object.assign({}, K.outfits.chibi, [{ shirt: 'pink', hair: 'bob' }, { shirt: 'sky', hair: 'short' }, { shirt: 'mint', hair: 'bun' }][i % 3], { face: i === L.n - 1 ? 'sleepy' : 'neutral' });
        const J = K.pose.stand(L.first - f * i * 72 * s, F.gy, 1.2 * s, f, Object.assign({ arms: i === 1 ? 'phone' : 'hold' }, look));
        const out = P().person(g, J, look);
        if (i === 1 && out) P().phone(g, out.haF[0], out.haF[1] - 8 * s, .26 * s, { screen: 'pay' });
      }
    },
    mid(g, F) {
      const s = F.s, L = F.lay, t = F.t, f = F.f, order = F.is('order'), make = F.is('make'), call = F.is('call');
      person(g, F, 'cashier', 'boba', 'stand', L.cashier, F.gy, 1.25, -f, { arms: order ? 'type' : 'hold', face: order ? 'happy' : 'neutral' });
      person(g, F, 'hero', 'barista', 'stand', L.barista, F.gy, 1.25, -f, { arms: make ? 'shake' : call ? 'give' : 'hold', face: call ? 'happy' : make ? 'proud' : 'neutral' });
      person(g, F, 'customer', { ...K.outfits.chibi, shirt: 'straw', hair: 'short' }, 'stand', L.first, F.gy, 1.2, f, { arms: order ? 'point' : call ? 'cheer' : 'hold', target: [F.X(.15), F.Y(330)], face: call ? 'happy' : order ? 'neutral' : 'worried' });
    },
    front(g, F) {
      const s = F.s, L = F.lay, f = F.f;
      floor(g, F, 'planks', 'creamD');
      const x0 = Math.min(L.c0, f > 0 ? F.bx1 : F.bx0), x1 = Math.max(L.c0, f > 0 ? F.bx1 : F.bx0), cy = L.top;
      sh(g, K.rect(x0, cy + 10 * s, x1 - x0, F.gy - cy - 10 * s), 'cream', 'near', { layers: [{ color: C.creamD, alpha: .6 }, { color: C.tan, angle: .3, gap: 10, alpha: .25 }] });
      for (let x = x0 + 22 * s; x < x1 - 8 * s; x += 26 * s) ln(g, [[x, cy + 16 * s], [x, F.gy - 6 * s]], 'near', { detail: true });
      sh(g, K.rect(x0 - 6 * s, cy, x1 - x0 + 12 * s, 12 * s), 'tan', 'near', { layers: [{ color: C.ochre, alpha: .6, angle: -.1 }] });
      P().register(g, L.cashier - f * 34 * s, cy, .62 * s, { price: F.st.price || '¥12', open: F.is('order') ? .6 : 0 });
      P().coins(g, L.cashier - f * 86 * s, cy, .7 * s, { n: 3 });
      const cups = F.is('call') ? 3 : F.is('make') ? 2 : 1;
      for (let i = 0; i < cups; i++) P().bubbleTea(g, L.c0 + f * (26 + i * 40) * s, cy, .56 * s, { tea: ['tan', 'lilac', 'pink'][i], tiger: i === 0 });
      for (let i = 0; i < 2; i++) P().pager(g, L.c0 + f * (cups * 40 + 30) * s + f * 4 * s * i, cy - i * 10 * s, .45 * s, {});
    },
    top(g, F) {
      const s = F.s, L = F.lay, t = F.t, f = F.f, call = F.is('call'), make = F.is('make');
      P().steam(g, F.X(.6) - 8 * s, F.Y(250) - 74 * s, t, 1, 44 * s, 4 * s, 'ink'); P().steam(g, F.X(.6) + 8 * s, F.Y(250) - 74 * s, t, 2, 44 * s, 4 * s, 'ink');
      P().bell(g, L.at.bell[0], L.top, .55 * s, { t, ring: call });
      const h = F.at.hero;
      if (make && h) P().shaker(g, h.haF[0], h.haF[1] + 30 * s, .55 * s, { shake: true, t });
      if (call && h) P().bubbleTea(g, h.haF[0] + f * 4 * s, h.haF[1] + 30 * s, .5 * s, { tea: 'tan', tiger: true });
      if (call) { const c = F.at.customer; if (c) P().pager(g, c.haF[0], c.haF[1] - 4 * s, .45 * s, { buzz: true, t, num: F.st.num || '42' }); P().bubble(g, (h ? h.head[0] : L.barista) - f * 34 * s, (h ? h.head[1] : F.Y(150)) - 20 * s, F.st.say || '42 号！', { size: Math.round(17 * s), side: f > 0 ? 'right' : 'left', pop: K.clamp(F.p * 2) }); }
    },
  };

  K.sets = { draw, frame, names: () => Object.keys(SETS), modes: n => (SETS[n] || {}).modes || [], define: (n, spec) => { SETS[n] = spec; }, helpers: { sh, ln, wash, floor, mirror, cast, person, wallClock, windowView, plant, crowd, seatedAt, DEPTH, dark } };
})();

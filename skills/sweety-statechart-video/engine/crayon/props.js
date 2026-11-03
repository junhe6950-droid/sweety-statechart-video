/* sweety-statechart-video · props.js — things to fill a poster with, all in crayon and most of them alive:
 * pass t (seconds, S.T in a scene's fg) and they flicker, spin, drift, steam, ring, blink or roll.
 * Positions are poster units; s scales a prop around its base point. See references/scenes.md for the catalogue. */
(function () {
  const K = window.SCV, { C, PI, TAU, FONT } = K;
  const col = c => !c ? null : (c[0] === '#' || c.startsWith('rgb') ? c : (C[c] || c));
  const P = K.props = K.props || {};
  const fillH = (c, more = {}) => ({ fill: col(c), h: Object.assign({ gap: 2.6, base: .8, solid: C.white }, more) });

  /* ================= nature, weather, light ================= */
  P.ground = (ctx, x0, x1, y, n = 10, key = 'g', color) => { K.seed(key); for (let i = 0; i < n; i++) { const x = K.rnd(x0, x1), w = K.rnd(14, 46); K.line(ctx, [[x, y + K.rnd(-5, 5)], [x + w, y + K.rnd(-5, 5)]], { color: col(color) || C.blue, w: 2, passes: 1, alpha: .8 }); } };
  P.grass = (ctx, x0, x1, y, t = 0, key = 'grass') => {
    K.seed(key);
    const n = Math.max(2, Math.round((x1 - x0) / 34));
    for (let i = 0; i < n; i++) {
      const x = x0 + (x1 - x0) * (i + K.rnd(.1, .9)) / n, h = K.rnd(14, 26);
      for (let k = -1; k <= 1; k++) { const sw = Math.sin(t * 1.8 + x * .05) * 3; K.line(ctx, K.qbez([x + k * 4, y], [x + k * 5 + sw * .5, y - h * .55], [x + k * 9 + sw, y - h * (k ? .8 : 1)], 6), { color: k ? C.greenD : C.leaf, w: 2.2, passes: 1 }); }
    }
  };
  P.tree = (ctx, x, y, s = 1, t = 0, o = {}) => {
    K.seed('tree' + x + '|' + y);
    K.shape(ctx, [[x - 9 * s, y], [x - 6 * s, y - 70 * s], [x + 6 * s, y - 70 * s], [x + 10 * s, y]], fillH(o.trunk || 'brown', { gap: 2.2, angle: -1.5, layers: [{ color: C.tan }] }));
    const sw = Math.sin(t * 1.3 + x) * 3 * s;
    const blobs = [[0, -118], [-34, -96], [34, -96], [-20, -140], [22, -142], [0, -82]];
    blobs.forEach(([dx, dy], i) => K.shape(ctx, K.ell(x + dx * s + sw * (1 + dy / -150), y + dy * s, 32 * s, 26 * s, 18), { fill: col(o.leaf) || C.leaf, h: { gap: 2.6, base: .7, layers: [{ color: C.green }, { color: C.greenD, angle: .4, gap: 6, alpha: .6 }] }, w: 2 }));
    if (o.fruit) for (let i = 0; i < 6; i++) K.dot(ctx, x + K.rnd(-40, 40) * s + sw, y + K.rnd(-150, -80) * s, 5 * s, col(o.fruit));
  };
  P.bush = (ctx, x, y, s = 1, t = 0, color) => {
    K.seed('bush' + x);
    for (let i = 0; i < 4; i++) { const dx = (i - 1.5) * 20 * s, sw = Math.sin(t * 1.6 + i) * 1.5; K.shape(ctx, K.ell(x + dx + sw, y - 18 * s - (i % 2) * 8 * s, 24 * s, 20 * s, 16), { fill: col(color) || C.leaf, h: { gap: 2.6, base: .7, layers: [{ color: C.greenD, angle: .4, gap: 5, alpha: .5 }] }, w: 2 }); }
  };
  P.flowerPot = (ctx, x, y, s = 1, t = 0, color) => {
    K.seed('fpot' + x);
    const sw = Math.sin(t * 2 + x) * 3 * s;
    for (let i = -1; i <= 1; i++) { K.line(ctx, K.qbez([x + i * 6 * s, y - 34 * s], [x + i * 10 * s + sw * .5, y - 60 * s], [x + i * 16 * s + sw, y - 82 * s], 6), { color: C.greenD, w: 2.4 }); K.dot(ctx, x + i * 16 * s + sw, y - 86 * s, 8 * s, col(color) || [C.pink, C.straw, C.rose][i + 1]); }
    K.shape(ctx, [[x - 22 * s, y - 36 * s], [x + 22 * s, y - 36 * s], [x + 16 * s, y], [x - 16 * s, y]], fillH('orange', { layers: [{ color: C.ochre, alpha: .6 }] }));
  };
  P.cloud = (ctx, x, y, w, h, o = {}) => {
    const pts = [], n = 7;
    for (let i = 0; i < n; i++) { const a0 = PI * .95 + i / n * PI * 1.1, a1 = a0 + PI * 1.1 / n, am = (a0 + a1) / 2; pts.push(...K.ell(x + Math.cos(am) * w * .5, y + Math.sin(am) * h * .5, w * .16, h * .32, 9, am - 1.6, am + 1.6)); }
    pts.push([x + w * .5, y + h * .25], [x - w * .5, y + h * .25]);
    K.shape(ctx, K.smooth(pts, 1), { fill: col(o.fill) || C.white, h: { gap: 4, base: o.base ?? .5, solid: o.solid, layers: [{ color: col(o.hatch) || C.sky, gap: 4 }] }, stroke: col(o.stroke), w: 2.4 });
  };
  P.sun = (ctx, x, y, r, t = 0) => {
    K.seed('sun' + x);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * .25, r0 = r * 1.25, r1 = r * (1.6 + .1 * Math.sin(t * 3 + i)); K.line(ctx, [[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, y + Math.sin(a) * r1]], { color: C.orange, w: 3 }); }
    K.shape(ctx, K.ell(x, y, r, r, 28), { fill: C.straw, h: { gap: 2.6, base: .85, layers: [{ color: C.yolk }, { color: C.ochre, angle: .4, gap: 5, alpha: .5 }] }, stroke: C.ochre, w: 2.6 });
  };
  P.moon = (ctx, x, y, r, t = 0, stars = 5) => {
    K.seed('moon' + x);
    const pts = K.ell(x, y, r, r, 28, -PI * .6, PI * .6).concat(K.ell(x + r * .45, y - r * .1, r * .78, r * .82, 20, PI * .55, -PI * .55));
    K.shape(ctx, pts, { fill: C.yolk, h: { gap: 2.4, base: .85, layers: [{ color: C.straw }] }, stroke: C.ochre, w: 2.4 });
    for (let i = 0; i < stars; i++) { const sx = x + K.rnd(-120, 120), sy = y + K.rnd(-60, 70), tw = .6 + .4 * Math.sin(t * 3 + i * 1.7); P.star(ctx, sx, sy, 7 * tw + 3, C.straw, i); }
  };
  P.star = (ctx, x, y, r, c, k = 0) => { K.seed('star' + k + x); const pts = []; for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, rr = i % 2 ? r * .45 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); } K.shape(ctx, pts, { fill: col(c) || C.straw, h: { gap: 2, base: .9 }, w: 1.6 }); };
  P.sparkle = (ctx, x, y, r, t = 0, c) => { const k = .6 + .4 * Math.sin(t * 6 + x); K.seed('spk' + x + y); [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([a, b]) => K.line(ctx, [[x + a * r * .25 * k, y + b * r * .25 * k], [x + a * r * k, y + b * r * k]], { color: col(c) || C.straw, w: 2.4, passes: 1 })); };
  P.rain = (ctx, x, y, w, h, t = 0, n = 30, key = 0) => {
    K.seed('rain' + key);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (let i = 0; i < n; i++) { const rx = x + K.rnd(0, w), sp = K.rnd(.6, 1), yy = y + ((K.rnd(0, h) + t * 260 * sp) % h); K.line(ctx, [[rx - (yy - y) * .15, yy], [rx - (yy - y) * .15 - 4, yy + 14]], { color: C.blue, w: 2, passes: 1, amp: .3 }); }
    ctx.restore();
  };
  P.snow = (ctx, x, y, w, h, t = 0, n = 26, key = 0) => {
    K.seed('snow' + key);
    for (let i = 0; i < n; i++) { const sx = x + K.rnd(0, w) + Math.sin(t * 1.3 + i) * 8, yy = y + ((K.rnd(0, h) + t * 50 * K.rnd(.6, 1)) % h); K.blob(ctx, sx, yy, K.rnd(2.5, 4.5), C.sky, .9); }
  };
  P.wind = (ctx, x, y, w, t = 0, n = 3) => { for (let i = 0; i < n; i++) { const f = ((t * .6 + i / n) % 1), xx = x + f * w; K.seed('wind' + i); ctx.save(); ctx.globalAlpha = Math.sin(f * PI); K.line(ctx, K.bez([xx, y + i * 16], [xx + 30, y + i * 16 - 8], [xx + 50, y + i * 16 + 6], [xx + 70, y + i * 16 - 4], 10), { color: C.blueL, w: 2.2, passes: 1 }); ctx.restore(); } };
  P.flame = (ctx, x, y, h, w, t, k = 0) => {
    const sway = Math.sin(t * 7 + k * 3) * w * .35 + Math.sin(t * 13 + k) * w * .12, hh = h * (.85 + .15 * Math.sin(t * 11 + k * 5));
    const tip = [x + sway, y - hh];
    const pts = K.bez([x - w / 2, y], [x - w * .7, y - hh * .45], [x + sway * .5 - w * .2, y - hh * .7], tip, 10).concat(K.bez(tip, [x + sway * .4 + w * .35, y - hh * .6], [x + w * .65, y - hh * .35], [x + w / 2, y], 10));
    K.shape(ctx, pts, { fill: C.orange, h: { angle: -1.5, gap: 2.6, base: .8, layers: [{ color: C.flame, angle: -1.4, gap: 3 }] }, stroke: '#ff6a10', w: 2.2 });
    K.hatch(ctx, pts.map(p => [x + (p[0] - x) * .5, y + (p[1] - y) * .55]), { color: C.yolk, base: .8, gap: 2.5, angle: -1.5 });
  };
  P.fire = (ctx, x, y, w, t = 0, n = 7, hmax = 70, logs = true) => {
    K.seed('fire' + x + '|' + K.S.boil);
    for (let i = 0; i < n; i++) { const fx = x - w / 2 + w * (i + .5) / n + K.rnd(-6, 6), h = hmax * (.45 + .55 * Math.sin((i + .5) / n * PI)) * K.rnd(.8, 1.1); P.flame(ctx, fx, y, h, w / n * 1.5, t, i * 1.7 + x); }
    if (logs) { K.seed('logs' + x); K.line(ctx, [[x - w * .5, y + 4], [x + w * .45, y - 2]], { color: C.brown, w: 4 }); K.line(ctx, [[x - w * .4, y - 2], [x + w * .5, y + 5]], { color: C.brown, w: 4 }); }
  };
  P.steam = (ctx, x, y, t = 0, k = 0, len = 120, amp = 8, color) => {
    const ph = ((t * .32 + k * .37) % 1), pts = [];
    for (let i = 0; i <= 26; i++) pts.push([x + Math.sin(i * .55 + t * 2.2 + k) * amp * (.4 + i / 26), y - i / 26 * len - ph * 40]);
    ctx.save(); ctx.globalAlpha = Math.sin(ph * PI) * .9 + .1;
    K.seed('steam' + x + k);
    for (let s = 0; s < pts.length - 2; s += 9) K.line(ctx, pts.slice(s, s + 7), { w: 2.4, color: col(color) || C.blue, alpha: 1 });
    ctx.restore();
  };
  P.puff = (ctx, x, y, w, t = 0, k = 0) => {           // a smoke puff drifting up and fading
    const f = ((t * .25 + k * .33) % 1);
    ctx.save(); ctx.globalAlpha = Math.sin(f * PI) * .8;
    K.seed('puff' + x + k); P.cloud(ctx, x + Math.sin(t + k) * 6, y - f * 60, w * (.7 + f * .5), w * .5 * (.7 + f * .5), { fill: C.white, base: 0, hatch: 'rgba(0,0,0,0)', stroke: C.blue });
    ctx.restore();
  };
  P.bulb = (ctx, x, y, s = 1, t = 0, on = true) => {
    K.seed('bulb' + x);
    if (on) { const g = .5 + .25 * Math.sin(t * 5); K.blob(ctx, x, y - 30 * s, 34 * s, C.yolk, g * .5); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; K.line(ctx, [[x + Math.cos(a) * 30 * s, y - 30 * s + Math.sin(a) * 30 * s], [x + Math.cos(a) * 42 * s, y - 30 * s + Math.sin(a) * 42 * s]], { color: C.orange, w: 2.4, passes: 1, alpha: g + .3 }); } }
    K.shape(ctx, K.ell(x, y - 32 * s, 20 * s, 22 * s, 20), fillH(on ? 'yolk' : 'white', { layers: [{ color: on ? C.straw : C.sky }] }));
    K.shape(ctx, K.rect(x - 9 * s, y - 12 * s, 18 * s, 12 * s), fillH('grey'));
  };
  P.lamp = (ctx, x, y, h = 160, s = 1, t = 0, on = true) => {
    K.seed('lamp' + x);
    K.line(ctx, [[x, y], [x, y - h * s]], { w: 3.2 }); K.line(ctx, K.qbez([x, y - h * s], [x + 10 * s, y - h * s - 18 * s], [x + 34 * s, y - h * s - 6 * s], 8), { w: 3 });
    K.shape(ctx, [[x + 20 * s, y - h * s - 6 * s], [x + 48 * s, y - h * s - 6 * s], [x + 54 * s, y - h * s + 12 * s], [x + 14 * s, y - h * s + 12 * s]], fillH('navy'));
    if (on) { ctx.save(); ctx.globalAlpha = .25 + .08 * Math.sin(t * 4); ctx.fillStyle = K.grain(C.yolk, .3); ctx.beginPath(); ctx.moveTo(x + 14 * s, y - h * s + 12 * s); ctx.lineTo(x + 54 * s, y - h * s + 12 * s); ctx.lineTo(x + 90 * s, y); ctx.lineTo(x - 20 * s, y); ctx.fill(); ctx.restore(); }
  };

  /* ================= kitchen and food ================= */
  P.pot = (ctx, cx, rimY, rw, h, o = {}) => {
    K.seed('pot' + cx + rimY);
    const body = [[cx - rw, rimY]].concat(K.bez([cx - rw, rimY + 4], [cx - rw * .98, rimY + h * .95], [cx - rw * .4, rimY + h], [cx, rimY + h], 10), K.bez([cx, rimY + h], [cx + rw * .4, rimY + h], [cx + rw * .98, rimY + h * .95], [cx + rw, rimY + 4], 10), [[cx + rw, rimY]]);
    const c = col(o.color) || C.blue;
    K.shape(ctx, body, { fill: c, h: { gap: 2.5, base: .8, solid: C.white, layers: [{ color: c }, { color: C.violet, angle: .5, gap: 6, alpha: .5 }] }, w: 2.8 });
    K.shape(ctx, K.ell(cx, rimY, rw, rw * .17, 30), { fill: col(o.liquid) || c, h: { gap: 2.4, base: .85, solid: C.white }, w: 2.6 });
    if (o.lid) { K.shape(ctx, K.ell(cx, rimY - 2, rw * 1.02, rw * .2, 30), { fill: c, h: { gap: 2.4, base: .85 }, w: 2.6 }); K.shape(ctx, K.capsule([[cx - rw * .2, rimY - rw * .22], [cx, rimY - rw * .32], [cx + rw * .2, rimY - rw * .22]], 6), { fill: c, h: { base: .8 } }); }
    if (o.handles) { K.line(ctx, K.qbez([cx - rw, rimY + 8], [cx - rw - 14, rimY + 14], [cx - rw - 2, rimY + 26], 6), { w: 3 }); K.line(ctx, K.qbez([cx + rw, rimY + 8], [cx + rw + 14, rimY + 14], [cx + rw + 2, rimY + 26], 6), { w: 3 }); }
    if (o.t != null && o.bubbles) for (let i = 0; i < 4; i++) { const f = ((o.t * .9 + i * .27) % 1); K.blob(ctx, cx + Math.sin(i * 2.3) * rw * .6, rimY - f * 10, 3 + f * 3, C.white, 1 - f); }
  };
  P.stove = (ctx, x, y, w = 140, t = 0, on = true, o = {}) => {   // y = floor; burners on top
    K.seed('stove' + x);
    const h = o.h || 70;
    K.shape(ctx, K.rect(x - w / 2, y - h, w, h), fillH(o.color || 'grey', { layers: [{ color: C.lilac }, { color: C.blue, angle: .4, gap: 7, alpha: .4 }] }));
    K.line(ctx, [[x - w / 2, y - h + 14], [x + w / 2, y - h + 14]], { w: 2 });
    for (const k of [-.25, .25]) K.dot(ctx, x + k * w, y - h * .45, 7, C.navy);
    if (on) { K.seed('stfl' + x + K.S.boil); for (let i = 0; i < 5; i++) P.flame(ctx, x - w * .28 + i * w * .14, y - h, 18 + (i % 2) * 6, 12, t, i * 2 + x); }
  };
  P.wok = (ctx, x, y, s = 1, t = 0, o = {}) => {        // y = rim; tossing food when o.toss
    K.seed('wok' + x);
    const tilt = o.toss ? Math.sin(t * 5) * .12 : 0;
    let body = K.qbez([x - 62 * s, y], [x, y + 60 * s], [x + 62 * s, y], 14);
    body = K.turn(body.concat([[x + 62 * s, y]]), x, y, tilt);
    K.shape(ctx, body, fillH('navy', { layers: [{ color: C.blue }, { color: C.violet, angle: .5, gap: 6, alpha: .5 }] }));
    K.shape(ctx, K.capsule(K.turn([[x - 60 * s, y - 2 * s], [x - 120 * s, y - 16 * s]], x, y, tilt), 9 * s), { fill: C.brown, h: { base: .85, gap: 2.2 }, w: 2 });
    if (o.food !== false) {
      const k = o.toss ? Math.max(0, Math.sin(t * 5)) : 0;
      K.seed('food' + x);
      for (let i = 0; i < 9; i++) { const fx = x + K.rnd(-40, 40) * s, fy = y - 6 * s - k * K.rnd(20, 60) * s; K.shape(ctx, K.ell(fx, fy, K.rnd(5, 9) * s, K.rnd(3, 6) * s, 10, 0, TAU, K.rnd(0, 3)), { fill: K.pick([C.green, C.orange, C.straw, C.red]), h: { base: .9, gap: 2 }, w: 1.4 }); }
    }
  };
  P.bowl = (ctx, x, y, s = 1, o = {}) => {              // y = table; o.food noodles|rice|soup, o.t for steam
    K.seed('bowl' + x + y);
    const w = 52 * s, h = 34 * s, c = col(o.color) || C.white;
    const body = [[x - w, y - h]].concat(K.qbez([x - w, y - h * .6], [x, y + h * .45], [x + w, y - h * .6], 14), [[x + w, y - h]]);
    if (o.food !== false) {
      const top = K.ell(x, y - h, w * .96, h * .3, 24);
      const fc = o.food === 'rice' ? C.white : o.food === 'soup' ? C.orange : C.straw;
      K.shape(ctx, top, { fill: fc, h: { gap: 2.4, base: .8, solid: C.white, layers: [{ color: o.food === 'rice' ? C.sky : C.ochre, alpha: .6 }] }, w: 2 });
      if (o.food === 'noodles' || !o.food) for (let i = 0; i < 6; i++) K.line(ctx, K.qbez([x - w * .7 + i * w * .26, y - h * .9], [x - w * .55 + i * w * .26, y - h * 1.35], [x - w * .4 + i * w * .26, y - h * .95], 6), { color: C.ochre, w: 2, passes: 1 });
      if (o.soggy) { K.blob(ctx, x - w * .2, y - h, 10 * s, C.tan, .8); K.blob(ctx, x + w * .3, y - h * 1.05, 8 * s, C.tan, .8); }
    }
    K.shape(ctx, body, { fill: c, h: { gap: 3, base: .5, solid: C.white, layers: [{ color: C.sky, alpha: .7 }] }, w: 2.6 });
    for (let i = 0; i < 3; i++) P.flower(ctx, x - w * .45 + i * w * .45, y - h * .35, 4 * s, .4, C.blue);
    if (o.t != null && o.steam !== false) for (let k = 0; k < 3; k++) P.steam(ctx, x - w * .4 + k * w * .4, y - h - 8 * s, o.t, k * 1.7 + x, 60 * s, 5 * s);
  };
  P.cup = (ctx, x, y, s = 1, o = {}) => {
    K.seed('cup' + x + y);
    const c = col(o.color) || C.rose;
    K.shape(ctx, [[x - 22 * s, y - 50 * s], [x + 22 * s, y - 50 * s], [x + 17 * s, y], [x - 17 * s, y]], { fill: c, h: { gap: 2.6, base: .75, solid: C.white, layers: [{ color: c }] }, w: 2.4 });
    K.line(ctx, K.qbez([x + 21 * s, y - 40 * s], [x + 38 * s, y - 32 * s], [x + 19 * s, y - 14 * s], 8), { w: 3 });
    if (o.straw) K.line(ctx, [[x + 4 * s, y - 50 * s], [x + 12 * s, y - 78 * s]], { w: 4, color: C.pink });
    if (o.t != null && o.steam !== false && !o.straw) for (let k = 0; k < 2; k++) P.steam(ctx, x - 8 * s + k * 16 * s, y - 56 * s, o.t, k * 2.1 + x, 48 * s, 4 * s);
  };
  P.plate = (ctx, x, y, s = 1, food) => { K.seed('plate' + x); K.shape(ctx, K.ell(x, y, 50 * s, 14 * s, 26), fillH('white', { base: .4, layers: [{ color: C.sky, alpha: .6 }] })); if (food) K.shape(ctx, K.smooth([[x - 30 * s, y - 4 * s], [x - 10 * s, y - 22 * s], [x + 22 * s, y - 20 * s], [x + 30 * s, y - 4 * s]], 1), { fill: col(food), h: { gap: 2.4, base: .85 }, w: 2 }); };
  P.jar = (ctx, x, y, s = 1, o = {}) => {               // y = shelf; o.label, o.fill colour of contents, o.empty
    K.seed('jar' + x + y);
    const w = 30 * s, h = 64 * s;
    const body = K.smooth([[x - w, y - h * .85], [x + w, y - h * .85], [x + w, y], [x - w, y]], 1);
    K.shape(ctx, body, fillH('white', { base: .2, layers: [{ color: C.sky, alpha: .5 }] }));
    if (!o.empty) K.hatch(ctx, K.rect(x - w + 4, y - h * .55, 2 * w - 8, h * .55 - 4), { color: col(o.fill) || C.ochre, base: .7, gap: 2.4 });
    K.shape(ctx, K.rect(x - w * .8, y - h, w * 1.6, h * .16), fillH(o.lid || 'red'));
    if (o.label) { K.shape(ctx, K.rect(x - w * .75, y - h * .5, w * 1.5, h * .3), fillH('cream', { base: .5 })); K.text(ctx, o.label, x, y - h * .29, { font: `${Math.round(16 * s)}px ${FONT.type}`, align: 'center', color: C.red }); }
  };
  P.chopsticks = (ctx, x, y, s = 1, a = -.4) => { K.seed('chop' + x); for (const d of [0, 6]) K.line(ctx, K.turn([[x + d * s, y], [x + d * s + 80 * s, y - 4 * s]], x, y, a), { color: C.tan, w: 3 }); };

  /* ================= furniture, rooms, streets ================= */
  P.stool = (ctx, x, y, w = 60, h = 46, c = 'pink') => {   // y = seat top
    K.seed('stool' + x + y);
    const top = [[x - w / 2, y], [x + w / 2, y], [x + w / 2, y + 9], [x - w / 2, y + 9]];
    const legs = [[x - w / 2, y + 9], [x + w / 2, y + 9], [x + w * .6, y + h], [x + w * .38, y + h], [x + w * .25, y + h * .55], [x - w * .25, y + h * .55], [x - w * .38, y + h], [x - w * .6, y + h]];
    K.shape(ctx, legs, { fill: col(c), h: { gap: 2.4, base: .85, solid: C.white }, w: 2.4 });
    K.shape(ctx, top, { fill: col(c), h: { gap: 2.4, base: .9, solid: C.white }, w: 2.4 });
  };
  P.table = (ctx, x, y, w = 200, h = 80, c = 'tan') => {     // y = table top
    K.seed('table' + x + y);
    K.shape(ctx, K.rect(x - w / 2, y, w, 12), fillH(c, { layers: [{ color: C.ochre, alpha: .5, angle: -.1 }] }));
    for (const k of [-1, 1]) K.shape(ctx, K.rect(x + k * (w / 2 - 18) - 5, y + 12, 10, h - 12), fillH(c));
  };
  P.chair = (ctx, x, y, s = 1, f = 1, c = 'blueL') => {     // y = floor
    K.seed('chair' + x);
    K.shape(ctx, K.rect(x - 26 * s, y - 52 * s, 52 * s, 9 * s), fillH(c));
    K.shape(ctx, K.rect(x - f * 26 * s - (f > 0 ? 0 : -1) * 0, y - 120 * s, 9 * s * f, 68 * s), fillH(c));
    for (const k of [-1, 1]) K.line(ctx, [[x + k * 22 * s, y - 44 * s], [x + k * 24 * s, y]], { w: 3, color: col(c) });
  };
  P.counter = (ctx, x0, x1, y, h = 110, o = {}) => {        // y = counter top, front panel down to y + h
    K.seed('counter' + x0 + y);
    const c = col(o.color) || C.tan;
    K.shape(ctx, K.rect(x0, y + 14, x1 - x0, h - 14), { fill: c, h: { gap: 2.8, base: .75, solid: C.white, angle: -1.5, layers: [{ color: C.ochre, angle: -1.5, gap: 5, alpha: .6 }] }, w: 2.6 });
    for (let x = x0 + 40; x < x1 - 20; x += 60) K.line(ctx, [[x, y + 20], [x + 1, y + h - 6]], { color: C.brown, w: 1.6, passes: 1, alpha: .7 });
    K.shape(ctx, K.rect(x0 - 10, y, x1 - x0 + 20, 16), { fill: col(o.top) || C.cream, h: { gap: 2.4, base: .8, solid: C.white, angle: -.1, layers: [{ color: C.creamD }] }, w: 2.6 });
    if (o.sign) K.text(ctx, o.sign, (x0 + x1) / 2, y + h * .6, { font: `${o.signSize || 26}px ${FONT.type}`, align: 'center', color: C.navy, double: true });
  };
  P.shelf = (ctx, x, y, w = 160, rows = 3, o = {}) => {     // y = bottom; rows of goods
    K.seed('shelf' + x + y);
    const rh = o.rowH || 56;
    K.line(ctx, [[x, y], [x, y - rows * rh]], { w: 3 }); K.line(ctx, [[x + w, y], [x + w, y - rows * rh]], { w: 3 });
    for (let r = 0; r <= rows; r++) K.shape(ctx, K.rect(x - 6, y - r * rh - 6, w + 12, 8), fillH('tan'));
    const goods = o.goods || ['red', 'straw', 'blue', 'green', 'pink', 'orange'];
    for (let r = 0; r < rows; r++) { let gx = x + 8; while (gx < x + w - 20) { const gw = K.rnd(16, 28), gh = K.rnd(24, rh - 14); K.shape(ctx, K.rect(gx, y - r * rh - 6 - gh, gw, gh), fillH(K.pick(goods), { gap: 2.4 })); gx += gw + K.rnd(4, 9); } }
  };
  P.door = (ctx, x, y, w = 110, h = 200, open = 0, o = {}) => {   // y = floor, x = left edge; open 0..1 swings it
    K.seed('door' + x);
    K.shape(ctx, K.rect(x - 8, y - h - 8, w + 16, h + 8), fillH(o.frame || 'cream', { base: .4, layers: [{ color: C.creamD }] }));
    K.hatch(ctx, K.rect(x, y - h, w, h), { color: C.navy, base: .55, gap: 3 });
    const k = Math.cos(K.clamp(open) * PI * .45), ww = w * k;
    const leaf = [[x, y - h], [x + ww, y - h + (1 - k) * 16], [x + ww, y - (1 - k) * 16], [x, y]];
    K.shape(ctx, leaf, fillH(o.color || 'red', { layers: [{ color: C.redD, alpha: .5, angle: -1.4 }] }));
    K.dot(ctx, x + ww - 14 * k, y - h * .48, 5, C.straw);
    if (o.number) K.text(ctx, String(o.number), x + w / 2, y - h - 18, { font: `20px ${FONT.type}`, align: 'center', color: C.navy });
  };
  P.house = (ctx, x, y, w = 180, h = 150, o = {}) => {    // y = ground, x = centre
    K.seed('house' + x);
    K.shape(ctx, K.rect(x - w / 2, y - h, w, h), fillH(o.wall || 'cream', { base: .6, layers: [{ color: C.peach, alpha: .6 }] }));
    K.shape(ctx, [[x - w / 2 - 18, y - h], [x, y - h - w * .45], [x + w / 2 + 18, y - h]], fillH(o.roof || 'red', { layers: [{ color: C.redD, alpha: .5, angle: -.6 }] }));
    K.shape(ctx, K.rect(x - 22, y - 74, 44, 74), fillH('blue'));
    for (const k of [-1, 1]) { const wx = x + k * w * .3; K.shape(ctx, K.rect(wx - 20, y - h * .72, 40, 36), fillH(o.lit ? 'yolk' : 'sky')); K.line(ctx, [[wx, y - h * .72], [wx, y - h * .72 + 36]], { w: 1.6 }); }
  };
  P.building = (ctx, x, y, w = 160, h = 300, o = {}) => {   // y = ground, x = centre; o.t flickers windows
    K.seed('bld' + x + y);
    const c = col(o.color) || C.lilac;
    K.shape(ctx, K.rect(x - w / 2, y - h, w, h), { fill: c, h: { gap: 3, base: .6, solid: C.white, layers: [{ color: c }, { color: C.violet, angle: .5, gap: 8, alpha: .35 }] }, w: 2.6 });
    const cols = Math.max(2, Math.floor(w / 42)), rows = Math.max(2, Math.floor((h - 40) / 48));
    for (let r = 0; r < rows; r++) for (let c2 = 0; c2 < cols; c2++) {
      const wx = x - w / 2 + (c2 + .5) * w / cols - 12, wy = y - h + 22 + r * 48;
      const lit = o.night ? (Math.sin((o.t || 0) * .8 + r * 3.1 + c2 * 1.7) > -.3) : ((r + c2) % 3 === 0);
      K.shape(ctx, K.rect(wx, wy, 24, 28), fillH(lit ? 'yolk' : 'sky', { gap: 2.4 }));
    }
    if (o.sign) { K.shape(ctx, K.rect(x - w * .42, y - h - 34, w * .84, 30), fillH('red')); K.text(ctx, o.sign, x, y - h - 12, { font: `20px ${FONT.type}`, align: 'center', color: C.white }); }
  };
  P.shopFront = (ctx, x, y, w = 260, h = 220, o = {}) => {  // y = ground, x = centre; striped awning + sign + window
    K.seed('shop' + x);
    K.shape(ctx, K.rect(x - w / 2, y - h, w, h), fillH(o.wall || 'cream', { base: .55, layers: [{ color: C.peach, alpha: .5 }] }));
    const aw = y - h + 40, n = 8, a1 = col(o.awning) || C.red;
    for (let i = 0; i < n; i++) { const ax = x - w / 2 - 10 + i * (w + 20) / n; K.shape(ctx, [[ax, aw - 30], [ax + (w + 20) / n, aw - 30], [ax + (w + 20) / n, aw + 10], [ax + (w + 20) / n / 2, aw + 22], [ax, aw + 10]], fillH(i % 2 ? 'white' : a1, { gap: 2.4 })); }
    if (o.sign) { K.shape(ctx, K.rect(x - w * .38, y - h - 26, w * .76, 40), fillH('navy')); K.text(ctx, o.sign, x, y - h + 3, { font: `${o.signSize || 26}px ${FONT.type}`, align: 'center', color: C.white }); }
    K.shape(ctx, K.rect(x - w * .42, aw + 36, w * .5, h * .42), fillH('sky', { base: .5, layers: [{ color: C.blueL, angle: -.7, gap: 8 }] }));
    P.door(ctx, x + w * .14, y, w * .26, h * .55, o.open || 0, { color: o.door || 'green' });
  };
  P.awningStall = (ctx, x, y, w = 220, o = {}) => P.shopFront(ctx, x, y, w, 170, o);
  P.road = (ctx, x0, x1, y, t = 0, o = {}) => {             // a strip of road with dashes rolling by
    K.seed('road' + y);
    K.hatch(ctx, K.rect(x0, y, x1 - x0, o.h || 60), { color: col(o.color) || C.grey, base: .55, gap: 4, angle: -.1, layers: [{ color: C.lilac, alpha: .5 }] });
    K.line(ctx, [[x0, y], [x1, y]], { w: 2.4 }); K.line(ctx, [[x0, y + (o.h || 60)], [x1, y + (o.h || 60)]], { w: 2.4 });
    const off = (t * (o.speed || 80)) % 80;
    for (let x = x0 - 80 + off; x < x1; x += 80) { const a = Math.max(x, x0), b = Math.min(x + 40, x1); if (b > a) K.line(ctx, [[a, y + (o.h || 60) / 2], [b, y + (o.h || 60) / 2]], { color: C.white, w: 4, passes: 1 }); }
  };
  P.trafficLight = (ctx, x, y, s = 1, light = 'red') => {
    K.seed('tl' + x);
    K.line(ctx, [[x, y], [x, y - 120 * s]], { w: 3.4 });
    K.shape(ctx, K.rect(x - 16 * s, y - 196 * s, 32 * s, 80 * s), fillH('navy'));
    ['red', 'straw', 'green'].forEach((c, i) => K.dot(ctx, x, y - 180 * s + i * 24 * s, 9 * s, light === c || (light === 'yellow' && c === 'straw') ? c : 'grey'));
  };
  P.sign = (ctx, x, y, w, h, textS, o = {}) => {           // a board on a post or hanging; x,y = top-left
    K.seed('sign' + x + y);
    if (o.post) K.line(ctx, [[x + w / 2, y + h], [x + w / 2, y + h + o.post]], { w: 4, color: C.brown });
    if (o.hang) { K.line(ctx, [[x + w * .2, y], [x + w * .2, y - o.hang]], { w: 1.8 }); K.line(ctx, [[x + w * .8, y], [x + w * .8, y - o.hang]], { w: 1.8 }); }
    K.shape(ctx, K.rect(x, y, w, h), fillH(o.color || 'cream', { base: .6, layers: [{ color: C.creamD }] }));
    const lines = String(textS).split('\n'), fs = o.size || 22;
    lines.forEach((ln, i) => K.text(ctx, ln, x + (o.align === 'left' ? 14 : w / 2), y + h / 2 + fs * .35 + (i - (lines.length - 1) / 2) * fs * 1.25, { font: `${fs}px ${o.mono ? FONT.mono : FONT.type}`, align: o.align === 'left' ? 'left' : 'center', color: col(o.ink) || C.navy, double: true }));
  };
  P.lantern = (ctx, x, y, s = 1, t = 0) => {
    const a = Math.sin(t * 1.5 + x) * .08;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.translate(-x, -y);
    K.seed('lant' + x);
    K.line(ctx, [[x, y - 40 * s], [x, y - 22 * s]], { w: 1.8 });
    K.shape(ctx, K.ell(x, y, 24 * s, 22 * s, 20), fillH('red', { layers: [{ color: C.redD, angle: -1.5, gap: 5, alpha: .6 }] }));
    K.shape(ctx, K.rect(x - 10 * s, y - 26 * s, 20 * s, 6 * s), fillH('straw')); K.shape(ctx, K.rect(x - 10 * s, y + 20 * s, 20 * s, 6 * s), fillH('straw'));
    for (let i = -1; i <= 1; i++) K.line(ctx, [[x + i * 3 * s, y + 26 * s], [x + i * 4 * s, y + 42 * s]], { color: C.straw, w: 1.8, passes: 1 });
    ctx.restore();
  };
  P.umbrella = (ctx, x, y, w, h, c = 'violet') => {
    K.seed('umb' + x);
    K.line(ctx, [[x, y], [x + 4, y + h * 3.4]], { w: 3.4, color: C.ink });
    const n = 7, pts = K.bez([x - w / 2, y + h * .55], [x - w * .4, y - h * .35], [x + w * .4, y - h * .35], [x + w / 2, y + h * .55], 20);
    for (let i = n; i > 0; i--) { const xa = x - w / 2 + w * i / n, xb = x - w / 2 + w * (i - 1) / n; pts.push(...K.qbez([xa, y + h * .55], [(xa + xb) / 2, y + h * .3], [xb, y + h * .55], 5)); }
    K.shape(ctx, pts, { fill: col(c), h: { gap: 2.6, base: .85, solid: C.white, layers: [{ color: C.blue, angle: -.9 }, { color: C.lilac, angle: .3, gap: 6, alpha: .6 }] }, w: 2.8 });
    for (let i = 1; i < n; i++) { const xa = x - w / 2 + w * i / n; K.line(ctx, K.qbez([x, y - h * .12], [K.lerp(x, xa, .6), y], [xa, y + h * .55], 6), { w: 1.6, color: C.inkD, alpha: .8 }); }
  };
  P.bench = (ctx, x, y, w = 160, c = 'green') => { K.seed('bench' + x); K.shape(ctx, K.rect(x - w / 2, y - 48, w, 10), fillH(c)); K.shape(ctx, K.rect(x - w / 2, y - 92, w, 10), fillH(c)); for (const k of [-1, 1]) { K.line(ctx, [[x + k * w * .4, y - 38], [x + k * w * .42, y]], { w: 3.4 }); K.line(ctx, [[x + k * w * .4, y - 92], [x + k * w * .4, y - 48]], { w: 3 }); } };

  /* ================= devices and messages ================= */
  P.phone = (ctx, x, y, s = 1, o = {}) => {                 // x,y = centre; o.screen chat|map|order|pay|call|blank, o.t, o.ring, o.badge
    const w = 64 * s, h = 120 * s, a = (o.tilt || 0) + (o.ring ? Math.sin((o.t || 0) * 40) * .06 : 0);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.translate(-x, -y);
    K.seed('phone' + x + y);
    const bodyPts = K.rounded([[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2], [x - w / 2, y - h / 2]], 10 * s);
    K.shape(ctx, bodyPts, fillH(o.color || 'navy', { layers: [{ color: C.blue }] }));
    const sx = x - w / 2 + 6 * s, sy = y - h / 2 + 12 * s, sw = w - 12 * s, sh = h - 24 * s;
    K.hatch(ctx, K.rect(sx, sy, sw, sh), { color: o.screen === 'map' ? C.mint : C.sky, solid: C.white, base: .35, gap: 5, w: 1.2 });
    const t = o.t || 0;
    if (o.screen === 'chat') for (let i = 0; i < 3; i++) { const right = i % 2 === 1, bw = sw * K.rnd(.45, .7); K.shape(ctx, K.rect(right ? sx + sw - bw - 4 * s : sx + 4 * s, sy + 8 * s + i * 26 * s, bw, 16 * s), fillH(right ? 'green' : 'white', { gap: 2.4, base: .7 })); }
    else if (o.screen === 'map') { K.line(ctx, [[sx + 6 * s, sy + sh - 10 * s], [sx + sw * .5, sy + sh * .55], [sx + sw - 8 * s, sy + 12 * s]], { w: 2.2, color: C.pink }); const q = K.along([[sx + 6 * s, sy + sh - 10 * s], [sx + sw * .5, sy + sh * .55], [sx + sw - 8 * s, sy + 12 * s]], (t * .15) % 1); K.dot(ctx, q[0], q[1], 5 * s, C.pink); }
    else if (o.screen === 'order') { K.text(ctx, o.text || '下单', x, sy + 22 * s, { font: `${Math.round(13 * s)}px ${FONT.type}`, align: 'center', color: C.navy }); for (let i = 0; i < 3; i++) K.line(ctx, [[sx + 8 * s, sy + 36 * s + i * 14 * s], [sx + sw - 8 * s, sy + 36 * s + i * 14 * s]], { w: 1.6, passes: 1, color: C.blueL }); K.shape(ctx, K.rect(sx + 8 * s, sy + sh - 24 * s, sw - 16 * s, 16 * s), fillH('pink', { gap: 2.2 })); }
    else if (o.screen === 'pay') { K.shape(ctx, K.rect(x - 18 * s, sy + 18 * s, 36 * s, 36 * s), fillH('white', { base: .2 })); for (let i = 0; i < 9; i++) if ((i * 7) % 3) K.hatch(ctx, K.rect(x - 16 * s + (i % 3) * 11 * s, sy + 20 * s + ((i / 3) | 0) * 11 * s, 10 * s, 10 * s), { color: C.navy, base: .9, gap: 2 }); K.text(ctx, o.text || '✓', x, sy + sh - 14 * s, { font: `${Math.round(16 * s)}px ${FONT.type}`, align: 'center', color: C.greenD }); }
    else if (o.screen === 'call') { K.dot(ctx, x, sy + sh * .4, 14 * s, C.green); K.text(ctx, o.text || '', x, sy + sh * .8, { font: `${Math.round(12 * s)}px ${FONT.type}`, align: 'center', color: C.navy }); }
    else if (o.screen === 'text') { String(o.text || '').split('\n').forEach((ln, i) => K.text(ctx, ln, x, sy + 24 * s + i * 18 * s, { font: `${Math.round(14 * s)}px ${FONT.type}`, align: 'center', color: C.navy })); }
    ctx.restore();
    if (o.badge) { const k = o.pop != null ? K.backOut(K.clamp(o.pop)) : 1; if (k > .01) { K.dot(ctx, x + w / 2, y - h / 2, 11 * s * k, C.red); K.text(ctx, String(o.badge), x + w / 2, y - h / 2 + 5 * s * k, { font: `${Math.round(13 * s * k)}px ${FONT.type}`, align: 'center', color: C.white }); } }
    if (o.ring) for (let i = 0; i < 2; i++) { const f = ((t * 2 + i * .5) % 1); ctx.save(); ctx.globalAlpha = 1 - f; K.seed('ring' + x + i); K.line(ctx, K.ell(x, y, w * (.7 + f * .5), h * (.6 + f * .3), 24, -PI * .25, PI * .25), { w: 2, color: C.pink, passes: 1 }); K.line(ctx, K.ell(x, y, w * (.7 + f * .5), h * (.6 + f * .3), 24, PI * .75, PI * 1.25), { w: 2, color: C.pink, passes: 1 }); ctx.restore(); }
  };
  P.bubble = (ctx, x, y, textS, o = {}) => {                // chat bubble; x,y = tail tip; o.side left|right; o.pop 0..1; o.chars typewriter
    const k = o.pop != null ? K.backOut(K.clamp(o.pop)) : 1;
    if (k <= .01) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.translate(-x, -y);
    const fs = o.size || 20;
    ctx.font = `${fs}px ${FONT.type}`;
    const lines = String(textS).split('\n'), w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 30, h = lines.length * fs * 1.3 + 18;
    const side = o.side || 'left', bx = side === 'left' ? x + 6 : x - 6 - w, by = y - h - 16;
    K.seed('bub' + x + y);
    const pts = K.rounded([[bx, by], [bx + w, by], [bx + w, by + h], ...(side === 'left' ? [[bx + 34, by + h], [x, y], [bx + 16, by + h]] : [[bx + w - 16, by + h], [x, y], [bx + w - 34, by + h]]), [bx, by + h], [bx, by]], 10);
    K.shape(ctx, pts, { fill: col(o.color) || C.white, h: { gap: 3, base: .6, solid: C.white, layers: [{ color: col(o.color) || C.sky, alpha: .4 }] }, w: 2.2 });
    lines.forEach((ln, i) => K.text(ctx, ln, bx + w / 2, by + 9 + fs * 1.05 + i * fs * 1.3, { font: `${fs}px ${FONT.type}`, align: 'center', color: col(o.ink) || C.navy, chars: o.chars }));
    ctx.restore();
  };
  P.think = (ctx, x, y, textS, o = {}) => {                  // thought cloud above a head
    const k = o.pop != null ? K.backOut(K.clamp(o.pop)) : 1;
    if (k <= .01) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.translate(-x, -y);
    K.dot(ctx, x, y, 5, C.white); K.dot(ctx, x + 12, y - 16, 8, C.white);
    const fs = o.size || 22; ctx.font = `${fs}px ${FONT.type}`;
    const w = Math.max(80, ctx.measureText(textS).width + 50);
    P.cloud(ctx, x + 30, y - 58, w, 64, { fill: C.white, solid: C.white, base: .2, hatch: C.sky, stroke: C.ink });
    K.text(ctx, textS, x + 30, y - 52, { font: `${fs}px ${FONT.type}`, align: 'center', color: C.navy });
    ctx.restore();
  };
  P.mark = (ctx, x, y, ch = '!', o = {}) => {               // a ! or ? popping over a head
    const k = o.pop != null ? K.backOut(K.clamp(o.pop)) : 1;
    if (k <= .01) return;
    K.seed('mark' + x + ch);
    K.text(ctx, ch, x, y + (1 - k) * 10, { font: `${Math.round(44 * k)}px ${FONT.type}`, align: 'center', color: col(o.color) || C.red, double: true });
  };
  P.laptop = (ctx, x, y, s = 1, o = {}) => {                // y = table
    K.seed('lap' + x);
    const w = 110 * s;
    K.shape(ctx, [[x - w / 2, y - 76 * s], [x + w / 2, y - 76 * s], [x + w / 2 - 4 * s, y - 8 * s], [x - w / 2 + 4 * s, y - 8 * s]], fillH('grey', { layers: [{ color: C.lilac }] }));
    K.hatch(ctx, K.rect(x - w / 2 + 8 * s, y - 70 * s, w - 16 * s, 54 * s), { color: C.navy, solid: C.navy, base: .6, gap: 4 });
    const t = o.t || 0;
    for (let i = 0; i < 4; i++) { const L = (o.typing ? ((t * 1.5 + i * .4) % 1) : .7) * (w - 40 * s); K.line(ctx, [[x - w / 2 + 14 * s, y - 60 * s + i * 11 * s], [x - w / 2 + 14 * s + L * (i === 3 ? .6 : 1), y - 60 * s + i * 11 * s]], { color: [C.green, C.straw, C.pink, C.sky][i], w: 2, passes: 1 }); }
    K.shape(ctx, [[x - w / 2 - 14 * s, y - 8 * s], [x + w / 2 + 14 * s, y - 8 * s], [x + w / 2 + 6 * s, y], [x - w / 2 - 6 * s, y]], fillH('grey'));
  };
  P.server = (ctx, x, y, s = 1, o = {}) => {                // y = floor; blinking lights
    K.seed('srv' + x);
    const w = 90 * s, h = (o.units || 4) * 46 * s, t = o.t || 0;
    K.shape(ctx, K.rect(x - w / 2, y - h, w, h), fillH('navy', { layers: [{ color: C.blue }, { color: C.violet, angle: .5, gap: 7, alpha: .4 }] }));
    for (let i = 0; i < (o.units || 4); i++) {
      const uy = y - h + 8 * s + i * 46 * s;
      K.shape(ctx, K.rect(x - w / 2 + 8 * s, uy, w - 16 * s, 34 * s), fillH('grey', { gap: 2.4 }));
      for (let j = 0; j < 3; j++) { const on = Math.sin(t * (3 + j) + i * 2.1 + j) > (o.busy ? -.5 : .2); K.blob(ctx, x + w / 2 - 18 * s - j * 12 * s, uy + 17 * s, 4 * s, on ? (j === 0 ? C.green : C.straw) : C.lilac, 1); }
      K.line(ctx, [[x - w / 2 + 14 * s, uy + 12 * s], [x - 2 * s, uy + 12 * s]], { w: 1.6, passes: 1 });
    }
  };
  P.tower = (ctx, x, y, s = 1, t = 0, on = true) => {       // a signal mast; y = ground
    K.seed('tower' + x);
    const h = 180 * s;
    K.line(ctx, [[x - 30 * s, y], [x, y - h]], { w: 3 }); K.line(ctx, [[x + 30 * s, y], [x, y - h]], { w: 3 });
    for (let i = 1; i < 5; i++) { const yy = y - h * i / 5, ww = 30 * s * (1 - i / 5); K.line(ctx, [[x - ww, yy], [x + ww, yy]], { w: 1.8, passes: 1 }); }
    K.dot(ctx, x, y - h, 7 * s, C.red);
    if (on) P.signal(ctx, x, y - h, s, t);
  };
  P.signal = (ctx, x, y, s = 1, t = 0, color) => { for (let i = 0; i < 3; i++) { const f = ((t * .8 + i / 3) % 1), r = (16 + f * 46) * s; ctx.save(); ctx.globalAlpha = 1 - f; K.seed('sig' + x + i); K.line(ctx, K.ell(x, y, r, r, 16, -PI * .8, -PI * .2), { w: 2.4, color: col(color) || C.pink, passes: 1 }); ctx.restore(); } };
  P.wifi = (ctx, x, y, s = 1, t = 0, bars = 3) => { K.seed('wifi' + x); for (let i = 0; i < 3; i++) { const on = i < bars && (t === 0 || ((t * 2 + i * .3) % 2) < 1.6); K.line(ctx, K.ell(x, y, (14 + i * 13) * s, (14 + i * 13) * s, 12, -PI * .78, -PI * .22), { w: 3, color: on ? C.ink : C.grey, passes: 1 }); } K.dot(ctx, x, y, 4 * s, C.ink); };
  P.envelope = (ctx, x, y, s = 1, o = {}) => {              // x,y = centre; o.open 0..1
    K.seed('env' + x + y);
    const w = 70 * s, h = 46 * s;
    K.shape(ctx, K.rect(x - w / 2, y - h / 2, w, h), fillH(o.color || 'white', { base: .4, layers: [{ color: C.creamD, alpha: .7 }] }));
    const flap = o.open ? -o.open : 1;
    K.line(ctx, [[x - w / 2, y - h / 2], [x, y - h / 2 + h * .55 * flap], [x + w / 2, y - h / 2]], { w: 2.2 });
    if (o.heart) P.heart(ctx, x, y + 6 * s, 9 * s);
    if (o.stamp) K.shape(ctx, K.rect(x + w / 2 - 18 * s, y - h / 2 + 5 * s, 13 * s, 15 * s), fillH('pink', { gap: 2 }));
  };
  P.paperPlane = (ctx, x, y, s = 1, a = 0) => { K.seed('plane' + x); K.shape(ctx, K.turn([[x + 34 * s, y], [x - 26 * s, y - 18 * s], [x - 14 * s, y], [x - 26 * s, y + 14 * s]], x, y, a), fillH('white', { base: .4, layers: [{ color: C.sky }] })); K.line(ctx, K.turn([[x - 14 * s, y], [x + 34 * s, y]], x, y, a), { w: 1.6 }); };
  P.heart = (ctx, x, y, r = 10, c = 'pink') => { K.seed('heart' + x + y); const pts = []; for (let i = 0; i < 30; i++) { const a = i / 30 * TAU, hx = 16 * Math.pow(Math.sin(a), 3), hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); pts.push([x + hx * r / 16, y + hy * r / 16]); } K.shape(ctx, pts, fillH(c, { gap: 2 })); };
  P.check = (ctx, x, y, s = 1, c = 'greenD', prog = 1) => { K.seed('chk' + x); K.line(ctx, [[x - 14 * s, y], [x - 4 * s, y + 12 * s], [x + 18 * s, y - 14 * s]], { w: 5 * s, color: col(c), progress: prog }); };
  P.cross = (ctx, x, y, s = 1, c = 'red') => { K.seed('crs' + x); K.line(ctx, [[x - 14 * s, y - 14 * s], [x + 14 * s, y + 14 * s]], { w: 5 * s, color: col(c) }); K.line(ctx, [[x + 14 * s, y - 14 * s], [x - 14 * s, y + 14 * s]], { w: 5 * s, color: col(c) }); };
  P.clock = (ctx, x, y, r = 40, t = 0, o = {}) => {          // hands move: o.speed minutes per second, o.hour/o.minute start
    K.seed('clock' + x);
    K.shape(ctx, K.ell(x, y, r, r, 30), fillH(o.face || 'white', { base: .4, layers: [{ color: C.sky, alpha: .6 }] }));
    K.line(ctx, K.ell(x, y, r * 1.08, r * 1.08, 30), { closed: true, w: 3, color: col(o.rim) || C.red });
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; K.line(ctx, [[x + Math.cos(a) * r * .8, y + Math.sin(a) * r * .8], [x + Math.cos(a) * r * .92, y + Math.sin(a) * r * .92]], { w: 2, passes: 1 }); }
    const min = (o.minute || 0) + t * (o.speed ?? 1), hr = (o.hour ?? 3) + min / 60;
    const am = min / 60 * TAU - PI / 2, ah = hr / 12 * TAU - PI / 2;
    K.line(ctx, [[x, y], [x + Math.cos(ah) * r * .5, y + Math.sin(ah) * r * .5]], { w: 3.6, color: C.navy });
    K.line(ctx, [[x, y], [x + Math.cos(am) * r * .76, y + Math.sin(am) * r * .76]], { w: 2.6, color: C.navy });
    K.dot(ctx, x, y, 4, C.red);
  };
  P.alarm = (ctx, x, y, s = 1, t = 0, ringing = false) => {
    const j = ringing ? Math.sin(t * 50) * 3 * s : 0;
    ctx.save(); ctx.translate(j, 0);
    for (const k of [-1, 1]) K.dot(ctx, x + k * 22 * s, y - 70 * s, 11 * s, C.straw);
    P.clock(ctx, x, y - 40 * s, 32 * s, t, { speed: 0, hour: 7, minute: 0, rim: 'red' });
    K.line(ctx, [[x - 20 * s, y - 12 * s], [x - 28 * s, y]], { w: 3 }); K.line(ctx, [[x + 20 * s, y - 12 * s], [x + 28 * s, y]], { w: 3 });
    ctx.restore();
    if (ringing) for (const k of [-1, 1]) K.line(ctx, [[x + k * 46 * s, y - 80 * s], [x + k * 58 * s, y - 92 * s]], { w: 2.4, color: C.red, passes: 1 });
  };
  P.calendar = (ctx, x, y, s = 1, label = '1', o = {}) => {
    K.seed('cal' + x);
    K.shape(ctx, K.rect(x - 40 * s, y - 44 * s, 80 * s, 88 * s), fillH('white', { base: .3, layers: [{ color: C.sky, alpha: .5 }] }));
    K.shape(ctx, K.rect(x - 40 * s, y - 44 * s, 80 * s, 24 * s), fillH('red'));
    K.text(ctx, String(label), x, y + 28 * s, { font: `${Math.round(40 * s)}px ${FONT.type}`, align: 'center', color: C.navy, double: true });
    if (o.top) K.text(ctx, o.top, x, y - 26 * s, { font: `${Math.round(14 * s)}px ${FONT.type}`, align: 'center', color: C.white });
  };
  P.printer = (ctx, x, y, s = 1, t = 0, o = {}) => {        // y = counter top; a slip grows out when o.printing (0..1 progress)
    K.seed('prn' + x);
    const w = 90 * s;
    const p = o.printing ?? 0;
    if (p > 0) { const L = 20 * s + 70 * s * K.clamp(p); K.shape(ctx, K.rect(x - 26 * s, y - 52 * s - L, 52 * s, L), fillH('white', { base: .2, layers: [{ color: C.sky, alpha: .3 }] })); for (let i = 0; i < Math.floor(L / (12 * s)) - 1; i++) K.line(ctx, [[x - 18 * s, y - 60 * s - L + 14 * s + i * 12 * s], [x + (i % 2 ? 8 : 18) * s, y - 60 * s - L + 14 * s + i * 12 * s]], { w: 1.4, passes: 1, color: C.blueL }); if (o.text) K.text(ctx, o.text, x, y - 56 * s - L + 22 * s, { font: `${Math.round(12 * s)}px ${FONT.type}`, align: 'center', color: C.red }); }
    K.shape(ctx, K.rect(x - w / 2, y - 56 * s, w, 56 * s), fillH(o.color || 'grey', { layers: [{ color: C.lilac }] }));
    K.line(ctx, [[x - 30 * s, y - 52 * s], [x + 30 * s, y - 52 * s]], { w: 2.4, color: C.navy });
    K.blob(ctx, x + w / 2 - 14 * s, y - 20 * s, 5 * s, (p > 0 && p < 1 && Math.sin(t * 12) > 0) ? C.green : C.lilac, 1);
  };
  P.receipt = (ctx, x, y, w = 70, h = 110, o = {}) => {     // x,y = top centre
    K.seed('rcpt' + x + y);
    const pts = [[x - w / 2, y], [x + w / 2, y]];
    for (let i = 0; i <= 8; i++) pts.push([x + w / 2 - w * i / 8, y + h + (i % 2 ? 5 : 0)]);
    K.shape(ctx, pts, fillH('white', { base: .25, layers: [{ color: C.sky, alpha: .35 }] }));
    if (o.title) K.text(ctx, o.title, x, y + 22, { font: `16px ${FONT.type}`, align: 'center', color: C.red });
    for (let i = 0; i < 4; i++) K.line(ctx, [[x - w / 2 + 10, y + 36 + i * 15], [x + w / 2 - (i % 2 ? 22 : 10), y + 36 + i * 15]], { w: 1.4, passes: 1, color: C.blueL });
  };
  P.coin = (ctx, x, y, r = 16, t = 0) => { const k = Math.abs(Math.cos(t * 3 + x)); K.seed('coin' + x); K.shape(ctx, K.ell(x, y, r * Math.max(.15, k), r, 18), fillH('straw', { layers: [{ color: C.ochre, alpha: .6 }] })); if (k > .5) K.text(ctx, '¥', x, y + r * .4, { font: `${Math.round(r * 1.1)}px ${FONT.type}`, align: 'center', color: C.ochre }); };
  P.magnifier = (ctx, x, y, r = 40, a = .7) => {
    K.seed('mag' + x);
    K.shape(ctx, K.capsule([[x + Math.cos(a) * r, y + Math.sin(a) * r], [x + Math.cos(a) * r * 2.3, y + Math.sin(a) * r * 2.3]], 14), fillH('brown'));
    K.hatch(ctx, K.ell(x, y, r, r, 28), { color: C.sky, base: .25, gap: 6, alpha: .6 });
    K.line(ctx, K.ell(x, y, r, r, 28), { closed: true, w: 5, color: C.navy });
    K.line(ctx, K.ell(x - r * .35, y - r * .35, r * .3, r * .18, 12, PI * 1.1, PI * 1.7), { w: 2.4, color: C.white, passes: 1 });
  };
  P.gear = (ctx, x, y, r = 40, t = 0, o = {}) => {
    const n = o.teeth || 10, a0 = t * (o.speed ?? 1.2), pts = [];
    for (let i = 0; i < n * 4; i++) { const a = a0 + i / (n * 4) * TAU, rr = (i % 4 < 2) ? r : r * .8; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    K.seed('gear' + x);
    K.shape(ctx, pts, fillH(o.color || 'grey', { layers: [{ color: C.lilac }] }));
    K.dot(ctx, x, y, r * .28, C.white);
  };
  P.conveyor = (ctx, x0, x1, y, t = 0, o = {}) => {         // y = belt top; items roll along
    K.seed('conv' + y);
    K.shape(ctx, K.rounded([[x0, y], [x1, y], [x1, y + 26], [x0, y + 26], [x0, y]], 13), fillH('grey', { layers: [{ color: C.lilac }] }));
    for (let x = x0 + 13; x < x1; x += 40) { const a = t * 4 + x; K.dot(ctx, x, y + 13, 9, C.white); K.line(ctx, [[x, y + 13], [x + Math.cos(a) * 8, y + 13 + Math.sin(a) * 8]], { w: 1.6, passes: 1 }); }
    const items = o.items || 3, span = x1 - x0;
    for (let i = 0; i < items; i++) { const f = ((t * (o.speed || .12) + i / items) % 1); const ix = x0 + 20 + f * (span - 60); P.box(ctx, ix, y - 2, 36, 28, { color: o.color || 'tan' }); }
  };
  P.box = (ctx, x, y, w = 60, h = 46, o = {}) => {          // a parcel; x = left, y = bottom
    K.seed('box' + x.toFixed(0) + y);
    K.shape(ctx, K.rect(x, y - h, w, h), fillH(o.color || 'tan', { layers: [{ color: C.ochre, alpha: .55 }] }));
    K.line(ctx, [[x + w / 2, y - h], [x + w / 2, y]], { color: col(o.tape) || C.cream, w: 5, passes: 1 });
    if (o.label) K.text(ctx, o.label, x + w / 2, y - h / 2 + 6, { font: `${Math.round(Math.min(18, w / 3))}px ${FONT.type}`, align: 'center', color: C.navy });
  };
  P.bag = (ctx, x, y, s = 1, o = {}) => {                   // takeaway bag; y = bottom
    K.seed('bag' + x + y);
    const w = 70 * s, h = 82 * s, c = col(o.color) || C.cream;
    K.line(ctx, K.qbez([x - 16 * s, y - h], [x, y - h - 30 * s], [x + 16 * s, y - h], 8), { w: 3 });
    K.shape(ctx, [[x - w / 2, y - h], [x + w / 2, y - h], [x + w / 2 + 4 * s, y], [x - w / 2 - 4 * s, y]], { fill: c, h: { gap: 3, base: .6, solid: C.white, layers: [{ color: C.creamD, alpha: .7 }] }, w: 2.4 });
    if (o.logo) K.text(ctx, o.logo, x, y - h * .42, { font: `${Math.round(18 * s)}px ${FONT.type}`, align: 'center', color: col(o.ink) || C.red, double: true });
    if (o.seal) K.shape(ctx, K.rect(x - 9 * s, y - h - 4 * s, 18 * s, 12 * s), fillH('pink', { gap: 2 }));
  };
  P.scooter = (ctx, x, y, s = 1, f = 1, o = {}) => {        // e-bike with a delivery box; x = between wheels, y = ground; o.t spins wheels
    K.seed('scoot' + x.toFixed(0));
    const t = o.t || 0, spin = o.moving ? t * 12 : 0, rw = 22 * s;
    const wB = [x - f * 52 * s, y - rw], wF = [x + f * 56 * s, y - rw];
    for (const w of [wB, wF]) { K.shape(ctx, K.ell(w[0], w[1], rw, rw, 22), fillH('navy', { gap: 2.2, base: .85 })); K.dot(ctx, w[0], w[1], 8 * s, C.grey); for (let k = 0; k < 3; k++) { const a = spin + k * TAU / 3; K.line(ctx, [[w[0], w[1]], [w[0] + Math.cos(a) * 14 * s, w[1] + Math.sin(a) * 14 * s]], { w: 1.6, passes: 1, color: C.white }); } }
    const c = col(o.color) || C.blue;
    K.shape(ctx, [[x - f * 60 * s, y - 40 * s], [x + f * 20 * s, y - 36 * s], [x + f * 46 * s, y - 92 * s], [x + f * 58 * s, y - 88 * s], [x + f * 40 * s, y - 30 * s], [x + f * 30 * s, y - 20 * s], [x - f * 66 * s, y - 24 * s]], { fill: c, h: { gap: 2.6, base: .8, solid: C.white, layers: [{ color: c }, { color: C.violet, angle: .5, gap: 6, alpha: .4 }] }, w: 2.4 });
    K.shape(ctx, [[x - f * 50 * s, y - 54 * s], [x - f * 4 * s, y - 54 * s], [x - f * 2 * s, y - 42 * s], [x - f * 52 * s, y - 42 * s]], fillH('navy'));
    K.line(ctx, [[x + f * 52 * s, y - 92 * s], [x + f * 72 * s, y - 100 * s]], { w: 3.4 });
    K.dot(ctx, x + f * 62 * s, y - 64 * s, 6 * s, C.yolk);
    if (o.box !== false) { const bx = x - f * 84 * s; K.shape(ctx, K.rect(Math.min(bx, bx + f * 62 * s), y - 120 * s, 62 * s, 64 * s), fillH(o.boxColor || 'straw', { layers: [{ color: C.ochre, alpha: .6 }] })); if (o.logo) K.text(ctx, o.logo, bx + f * 31 * s, y - 80 * s, { font: `${Math.round(18 * s)}px ${FONT.type}`, align: 'center', color: C.navy, double: true }); }
    if (o.moving) P.wind(ctx, x - f * 160 * s, y - 70 * s, 50 * s, t, 2);
  };
  P.car = (ctx, x, y, s = 1, f = 1, o = {}) => {
    K.seed('car' + x.toFixed(0));
    const t = o.t || 0, c = col(o.color) || C.red;
    K.shape(ctx, K.smooth([[x - 90 * s, y - 24 * s], [x - 86 * s, y - 56 * s], [x - 46 * s, y - 60 * s], [x - 26 * s, y - 96 * s], [x + 40 * s, y - 96 * s], [x + 62 * s, y - 60 * s], [x + 92 * s, y - 54 * s], [x + 94 * s, y - 24 * s]], 1, true), { fill: c, h: { gap: 2.6, base: .8, solid: C.white, layers: [{ color: c }, { color: C.redD, angle: .5, gap: 6, alpha: .4 }] }, w: 2.6 });
    K.shape(ctx, [[x - 18 * s, y - 88 * s], [x + 6 * s, y - 88 * s], [x + 6 * s, y - 62 * s], [x - 34 * s, y - 62 * s]], fillH('sky'));
    K.shape(ctx, [[x + 14 * s, y - 88 * s], [x + 36 * s, y - 88 * s], [x + 52 * s, y - 62 * s], [x + 14 * s, y - 62 * s]], fillH('sky'));
    for (const k of [-56, 56]) { const wx = x + k * s; K.shape(ctx, K.ell(wx, y - 20 * s, 20 * s, 20 * s, 20), fillH('navy')); K.dot(ctx, wx, y - 20 * s, 7 * s, C.grey); const a = (o.moving ? t * 10 : 0); K.line(ctx, [[wx, y - 20 * s], [wx + Math.cos(a) * 12 * s, y - 20 * s + Math.sin(a) * 12 * s]], { w: 1.6, passes: 1, color: C.white }); }
    K.dot(ctx, x + f * 88 * s, y - 44 * s, 6 * s, C.yolk);
  };
  P.bike = (ctx, x, y, s = 1, f = 1, t = 0) => {
    K.seed('bike' + x);
    for (const k of [-1, 1]) { const w = [x + k * 46 * s, y - 26 * s]; K.line(ctx, K.ell(w[0], w[1], 26 * s, 26 * s, 22), { closed: true, w: 2.6 }); const a = t * 9; K.line(ctx, [[w[0], w[1]], [w[0] + Math.cos(a) * 22 * s, w[1] + Math.sin(a) * 22 * s]], { w: 1.4, passes: 1 }); }
    K.line(ctx, [[x - 46 * s, y - 26 * s], [x - 6 * s, y - 26 * s], [x + 20 * s, y - 70 * s], [x - 20 * s, y - 70 * s], [x - 46 * s, y - 26 * s]], { w: 3, color: C.red });
    K.line(ctx, [[x + 46 * s, y - 26 * s], [x + 26 * s, y - 84 * s], [x + 40 * s, y - 88 * s]], { w: 3, color: C.red });
  };
  P.bird = (ctx, x, y, s = 1, t = 0) => { const w = Math.sin(t * 9 + x) * 10 * s; K.seed('bird' + x); K.line(ctx, [[x - 18 * s, y - w], [x - 6 * s, y], [x, y + 3 * s], [x + 6 * s, y], [x + 18 * s, y - w]], { w: 2.4, color: C.navy }); };
  P.cat = (ctx, x, y, s = 1, t = 0, c = 'orange') => {      // y = ground, sitting cat, tail sways
    K.seed('cat' + x);
    const cc = col(c);
    const sw = Math.sin(t * 2.2) * 12 * s;
    K.line(ctx, K.bez([x + 26 * s, y - 6 * s], [x + 56 * s, y - 10 * s], [x + 50 * s + sw, y - 46 * s], [x + 40 * s + sw, y - 62 * s], 10), { w: 6 * s, color: cc });
    K.shape(ctx, K.smooth([[x - 26 * s, y], [x - 24 * s, y - 50 * s], [x, y - 62 * s], [x + 24 * s, y - 50 * s], [x + 30 * s, y]], 1), { fill: cc, h: { gap: 2.4, base: .8, solid: C.white, layers: [{ color: C.ochre, angle: -1.5, gap: 6, alpha: .6 }] }, w: 2.2 });
    const hy = y - 72 * s;
    K.shape(ctx, [[x - 22 * s, hy - 4 * s], [x - 18 * s, hy - 28 * s], [x - 6 * s, hy - 14 * s], [x + 6 * s, hy - 14 * s], [x + 18 * s, hy - 28 * s], [x + 22 * s, hy - 4 * s], [x + 16 * s, hy + 14 * s], [x - 16 * s, hy + 14 * s]], { fill: cc, h: { gap: 2.4, base: .85, solid: C.white }, w: 2.2 });
    const blink = (t % 3.3) < .12;
    for (const k of [-1, 1]) blink ? K.line(ctx, [[x + k * 10 * s - 3 * s, hy], [x + k * 10 * s + 3 * s, hy]], { w: 1.6, passes: 1 }) : K.dot(ctx, x + k * 9 * s, hy, 2.2 * s, C.navy, { w: 1.2 });
    K.blob(ctx, x, hy + 6 * s, 2 * s, C.pink, 1);
  };
  P.dog = (ctx, x, y, s = 1, t = 0, c = 'tan') => {
    K.seed('dog' + x);
    const cc = col(c), wag = Math.sin(t * 12) * 8 * s;
    K.line(ctx, [[x - 40 * s, y - 50 * s], [x - 58 * s, y - 70 * s + wag]], { w: 6 * s, color: cc });
    K.shape(ctx, K.smooth([[x - 44 * s, y - 34 * s], [x - 40 * s, y - 60 * s], [x + 24 * s, y - 60 * s], [x + 30 * s, y - 34 * s]], 1), { fill: cc, h: { gap: 2.4, base: .8, solid: C.white }, w: 2.2 });
    for (const k of [-34, -18, 10, 22]) K.line(ctx, [[x + k * s, y - 36 * s], [x + k * s, y]], { w: 6 * s, color: cc });
    K.shape(ctx, K.ell(x + 34 * s, y - 70 * s, 20 * s, 17 * s, 16), { fill: cc, h: { gap: 2.4, base: .85, solid: C.white }, w: 2.2 });
    K.shape(ctx, K.ell(x + 26 * s, y - 72 * s, 7 * s, 13 * s, 10, 0, TAU, .3), { fill: C.brown, h: { base: .9, gap: 2 }, w: 1.6 });
    K.dot(ctx, x + 40 * s, y - 74 * s, 2.2 * s, C.navy, { w: 1.2 }); K.dot(ctx, x + 53 * s, y - 68 * s, 3 * s, C.navy, { w: 1.2 });
  };
  P.basket = (ctx, x, y, w = 110, c = 'straw') => { K.seed('bask' + x); K.shape(ctx, K.ell(x, y, w / 2, w * .16, 28), { fill: col(c), h: { gap: 2.5, base: .8, solid: C.white, layers: [{ color: C.ochre, angle: .3, gap: 4 }] } }); };
  P.bucket = (ctx, x, y, s = 1, c = 'blue') => { K.seed('buck' + x); K.shape(ctx, [[x - 28 * s, y - 64 * s], [x + 28 * s, y - 64 * s], [x + 22 * s, y], [x - 22 * s, y]], { fill: col(c), h: { gap: 2.5, base: .8, solid: C.white, layers: [{ color: C.violet, angle: .4, gap: 5, alpha: .6 }] } }); K.line(ctx, K.qbez([x - 28 * s, y - 64 * s], [x, y - 100 * s], [x + 28 * s, y - 64 * s], 8), { w: 2.2 }); };
  P.sack = (ctx, x, y, s = 1, c = 'tan') => { K.seed('sack' + x); K.shape(ctx, K.smooth([[x - 46 * s, y], [x - 40 * s, y - 80 * s], [x - 16 * s, y - 94 * s], [x + 18 * s, y - 94 * s], [x + 40 * s, y - 80 * s], [x + 46 * s, y]], 1), { fill: col(c), h: { gap: 2.8, base: .7, solid: C.white, layers: [{ color: C.ochre }, { color: C.brown, angle: .5, gap: 6, alpha: .4 }] } }); };
  P.crate = (ctx, x, y, w = 110, h = 90, c = 'cream') => { K.seed('crate' + x); K.shape(ctx, K.rect(x - w / 2, y - h, w, h), fillH(c, { base: .35, gap: 5 })); for (let i = 1; i < 3; i++) K.line(ctx, [[x - w / 2, y - h * i / 3], [x + w / 2, y - h * i / 3]], { w: 2 }); };
  P.flag = (ctx, x, y, s = 1, t = 0, c = 'red') => { K.seed('flag' + x); K.line(ctx, [[x, y], [x, y - 120 * s]], { w: 3 }); const pts = []; for (let i = 0; i <= 8; i++) pts.push([x + i * 8 * s, y - 120 * s + Math.sin(t * 5 - i * .7) * 4 * s]); for (let i = 8; i >= 0; i--) pts.push([x + i * 8 * s, y - 80 * s + Math.sin(t * 5 - i * .7) * 4 * s]); K.shape(ctx, pts, fillH(c)); };
  P.stamp = (ctx, x, y, s, o = {}) => K.chart.stamp(ctx, x, y, s, o);

  /* ================= people shortcuts ================= */
  // who(kind, poseName, x, y, s, f, extra): an outfit from K.outfits in a pose from K.pose (extra.t, extra.arms ...)
  P.who = (ctx, kind, poseName, x, y, s = 1, f = 1, extra = {}) => {
    const joints = K.pose[poseName || 'stand'](x, y, s, f, extra);
    P.person(ctx, joints, Object.assign({}, K.outfits[kind] || {}, extra, { t: extra.t }));
    return joints;
  };
})();

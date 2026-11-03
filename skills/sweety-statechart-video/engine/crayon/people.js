/* sweety-statechart-video · people.js — crayon people with joints you can pose and animate.
 * person(ctx, joints, outfit): joints {head, neck, hip, elB, haB, elF, haF, knB, ftB, knF, ftF, s, f, tilt}
 * (B = the far limb, F = the near one; f = facing, 1 right / -1 left; s = scale, 1 ≈ 250 units tall standing).
 * pose.stand / walk / sit / bend / ride / run build joints from a foot point; outfits.* are ready-made looks.
 * v2: o.build (kid | teen | adult | elder, plus slim | stout, e.g. 'elder stout'), o.face (neutral | happy | surprised |
 * worried | sleepy | angry | proud), o.mouth 0..1 (overrides talk), arms give | shrug | cheer | sleep | stomp | clap |
 * point (toward o.target [x, y]), more hair, hats and accessories (backpack, bag, scarf, tie, badge, cane). */
(function () {
  const K = window.SCV, { C, PI, TAU } = K;
  const col = c => !c ? null : (c[0] === '#' || c.startsWith('rgb') ? c : (C[c] || c));

  function flower(ctx, x, y, r, a, c) {
    ctx.save(); ctx.fillStyle = K.grain(c || C.blue, .25); ctx.globalAlpha = .95;
    for (let k = 0; k < 4; k++) { const an = a + k * PI / 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(an) * r * .95, y + Math.sin(an) * r * .95, r * .78, r * .58, an, 0, TAU); ctx.fill(); }
    ctx.fillStyle = C.white; ctx.beginPath(); ctx.arc(x, y, r * .3, 0, TAU); ctx.fill(); ctx.restore();
  }
  // cloth fills
  function cloth(ctx, pts, kind, s, color) {
    const b = K.bbox(pts);
    if (kind === 'floral') {
      K.hatch(ctx, pts, { color: C.sky, solid: C.white, base: .22, gap: 5, w: 1.2, layers: [{ color: C.lilac, alpha: .3, gap: 7 }] });
      ctx.save(); ctx.clip(K.path2d(pts)); const g = 15 * s; let row = 0;
      for (let y = b.y0 - g; y < b.y1 + g; y += g * .9, row++) for (let x = b.x0 - g + (row % 2) * g / 2; x < b.x1 + g; x += g) flower(ctx, x + K.rnd(-2, 2) * s, y + K.rnd(-2, 2) * s, 3.1 * s, K.rnd(0, 1.5), col(color) || C.blue);
      ctx.restore();
    } else if (kind === 'stripes') {
      K.hatch(ctx, pts, { color: C.sky, solid: C.white, base: .16, gap: 6, w: 1.1, layers: [{ color: C.lilac, alpha: .25 }] });
      ctx.save(); ctx.clip(K.path2d(pts)); ctx.lineCap = 'round';
      for (let x = b.x0 - 40; x < b.x1 + 40; x += 7.5 * s) { ctx.strokeStyle = K.grain(col(color) || C.blue, .3); ctx.lineWidth = 3.2 * s * K.rnd(.8, 1.2); ctx.globalAlpha = K.rnd(.75, 1); ctx.beginPath(); ctx.moveTo(x, b.y0 - 5); ctx.quadraticCurveTo(x + K.rnd(-2, 2), b.cy, x, b.y1 + 5); ctx.stroke(); }
      ctx.restore();
    } else if (kind === 'hstripes') {
      K.hatch(ctx, pts, { color: C.white, solid: C.white, base: .2, gap: 6, w: 1.1, layers: [{ color: C.lilac, alpha: .2 }] });
      ctx.save(); ctx.clip(K.path2d(pts)); ctx.lineCap = 'round';
      for (let y = b.y0 - 10; y < b.y1 + 10; y += 9 * s) { ctx.strokeStyle = K.grain(col(color) || C.red, .3); ctx.lineWidth = 3.6 * s * K.rnd(.85, 1.15); ctx.beginPath(); ctx.moveTo(b.x0 - 5, y); ctx.quadraticCurveTo(b.cx, y + K.rnd(-2, 2), b.x1 + 5, y); ctx.stroke(); }
      ctx.restore();
    } else if (kind === 'plaid') {
      K.hatch(ctx, pts, { color: col(color) || C.red, solid: C.white, base: .35, gap: 4, w: 1.3, angle: 0, layers: [{ color: col(color) || C.red, angle: 0, gap: 9, w: 2.4, alpha: .7 }, { color: col(color) || C.red, angle: PI / 2, gap: 9, w: 2.4, alpha: .7 }, { color: C.navy, angle: PI / 2, gap: 18, w: 1.2, alpha: .5 }] });
    } else if (kind === 'dots') {
      K.hatch(ctx, pts, { color: col(color) || C.pink, solid: C.white, base: .55, gap: 3.2, w: 1.5 });
      ctx.save(); ctx.clip(K.path2d(pts)); ctx.fillStyle = C.white; let row = 0;
      for (let y = b.y0; y < b.y1 + 10; y += 10 * s, row++) for (let x = b.x0 + (row % 2) * 5 * s; x < b.x1 + 10; x += 10 * s) { ctx.beginPath(); ctx.arc(x, y, 2.2 * s, 0, TAU); ctx.fill(); }
      ctx.restore();
    } else {
      const c = col(kind) || C.blue;
      K.hatch(ctx, pts, { color: c, solid: C.white, gap: 3, base: .7, layers: [{ color: c }, { color: C.navy, angle: .5, gap: 9, alpha: .18 }] });
    }
  }

  /* ---------------- builds: age (size, head) and body (widths) ---------------- */
  const AGES = { adult: { g: 1, head: 1, limb: 1 }, kid: { g: .7, head: 1.42, limb: 1.12, leg: .74, trunk: .86 }, teen: { g: .88, head: 1.08, limb: .92, leg: .96 }, elder: { g: .94, head: 1, limb: 1, stoop: 1 }, chibi: { g: 1, head: 1, limb: 1, chibi: 1 } };
  const BODIES = { mid: { torso: 1, hip: 1, limb: 1 }, slim: { torso: .82, hip: .8, limb: .82 }, stout: { torso: 1.18, hip: 1.5, limb: 1.2, belly: 1 } };
  function buildOf(b) {
    const words = Array.isArray(b) ? b : String(b || '').split(/[\s,+]+/);
    let age = 'adult', body = 'mid';
    for (const w of words) { if (AGES[w]) age = w; else if (BODIES[w]) body = w; }
    const A = AGES[age], B = BODIES[body];
    return { age, body, g: A.g, head: A.head, leg: A.leg || 1, trunk: A.trunk || 1, limb: A.limb * B.limb, torso: B.torso * (age === 'kid' ? 1.08 : 1), hip: B.hip * (age === 'kid' ? 1.05 : 1), belly: !!B.belly, stoop: !!A.stoop, chibi: !!A.chibi, key: age + ' ' + body };
  }
  const JOINTS = ['head', 'neck', 'hip', 'elB', 'haB', 'elF', 'haF', 'knB', 'ftB', 'knF', 'ftF'];
  // scale a pose about its foot (or seat) point for the age; lift a bigger head; an elder stoops a little
  function applyBuild(J, x, y, b) {
    const B = buildOf(b);
    J.build = B.key; J.built = true;
    const standing = J.ftB && Math.abs(Math.max(J.ftB[1], J.ftF[1]) - y) < 2 * J.s;
    if (standing && (B.leg !== 1 || B.trunk !== 1)) {   // shorter legs (and trunk): everything above the knees comes down
      const dl = (y - J.hip[1]) * (1 - B.leg), dt = (J.hip[1] - J.neck[1]) * (1 - B.trunk);
      for (const k of ['knB', 'knF']) if (J[k]) J[k] = [J[k][0], J[k][1] + dl * .5];
      J.hip = [J.hip[0], J.hip[1] + dl];
      for (const k of ['head', 'neck', 'elB', 'haB', 'elF', 'haF']) if (J[k]) J[k] = [J[k][0], J[k][1] + dl + dt];
    }
    if (B.g !== 1) { for (const k of JOINTS) if (J[k]) J[k] = [x + (J[k][0] - x) * B.g, y + (J[k][1] - y) * B.g]; J.s *= B.g; }
    const s = J.s, f = J.f || 1;
    if (B.head !== 1) J.head = [J.head[0], J.head[1] - (B.head - 1) * 15 * s * .9];
    if (B.stoop) {
      const dn = [f * 7 * s, 2 * s];
      J.neck = [J.neck[0] + dn[0], J.neck[1] + dn[1]];
      J.head = [J.head[0] + f * 13 * s, J.head[1] + 5 * s];
      for (const k of ['elB', 'haB', 'elF', 'haF']) if (J[k]) J[k] = [J[k][0] + dn[0] * .8, J[k][1] + dn[1]];
    }
    return J;
  }

  /* ---------------- hats and hair ---------------- */
  function hat(ctx, kind, x, y, r, f, tilt, o) {
    const T = (pts) => K.turn(pts, x, y, tilt);
    if (kind === 'conical') {
      const W = 3.5 * r, H = 2.2 * r, by = y - .42 * r;
      let pts = [[x, by - H]].concat(K.qbez([x + W / 2, by + .1 * r], [x, by + .62 * r], [x - W / 2, by + .1 * r], 16));
      pts = T(pts); const ap = pts[0];
      K.shape(ctx, pts, { fill: C.straw, radial: ap, r: { cols: [C.ochre, C.orange, C.flame, C.ochre], n: 30, w: 2.3, base: .8, inner: 0, a0: PI / 2 - .95 + tilt, a1: PI / 2 + .95 + tilt, solid: C.white }, w: 2.6 });
    } else if (kind === 'cap') {
      const c = col(o.hatColor) || C.red;
      const dome = T(K.ell(x, y - r * .35, r * 1.02, r * .8, 22, PI, TAU).concat([[x + r * 1.02, y - r * .3], [x - r * 1.02, y - r * .3]]));
      K.shape(ctx, dome, { fill: c, h: { gap: 2.4, base: .85, solid: C.white }, w: 2.2 });
      K.shape(ctx, T([[x + f * r * .5, y - r * .45], [x + f * r * 1.85, y - r * .3], [x + f * r * 1.7, y - r * .12], [x + f * r * .4, y - r * .2]]), { fill: c, h: { gap: 2.2, base: .9 }, w: 2 });
    } else if (kind === 'helmet') {
      const c = col(o.hatColor) || C.straw;
      const dome = T(K.ell(x, y - r * .2, r * 1.2, r * 1.08, 24, PI * .98, TAU * 1.01).concat([[x + r * 1.2, y + r * .05], [x - r * 1.2, y + r * .05]]));
      K.shape(ctx, dome, { fill: c, h: { gap: 2.4, base: .85, solid: C.white, layers: [{ color: c }, { color: C.ochre, angle: .5, gap: 6, alpha: .45 }] }, w: 2.4 });
      K.line(ctx, T([[x - r * 1.15, y - r * .15], [x + r * 1.15, y - r * .15]]), { w: 2, color: C.navy });
      K.shape(ctx, T([[x + f * r * .15, y - r * .1], [x + f * r * 1.32, y - r * .02], [x + f * r * 1.2, y + r * .3], [x + f * r * .25, y + r * .22]]), { fill: C.sky, h: { gap: 3, base: .6, layers: [{ color: C.blueL }] }, w: 2 });
    } else if (kind === 'hardhat') {                 // a site helmet: dome, ridge, a brim all round
      const c = col(o.hatColor) || C.orange;
      K.shape(ctx, T(K.ell(x, y - r * .4, r * 1.08, r * .95, 22, PI, TAU).concat([[x + r * 1.08, y - r * .35], [x - r * 1.08, y - r * .35]])), { fill: c, h: { gap: 2.4, base: .88, solid: C.white, layers: [{ color: c }, { color: C.ochre, angle: .5, gap: 5, alpha: .5 }] }, w: 2.4 });
      K.shape(ctx, T(K.rounded([[x - r * 1.45, y - r * .42], [x + r * 1.45, y - r * .42], [x + r * 1.4, y - r * .24], [x - r * 1.4, y - r * .24], [x - r * 1.45, y - r * .42]], 3)), { fill: c, h: { gap: 2.2, base: .9 }, w: 2.2 });
      K.line(ctx, T([[x - r * .1, y - r * 1.32], [x + r * .1, y - r * .5]]), { w: 3, color: C.white, passes: 1, alpha: .7 });
    } else if (kind === 'beret') {
      const c = col(o.hatColor) || C.red;
      K.shape(ctx, T(K.smooth([[x - f * r * 1.15, y - r * .45], [x - f * r * .7, y - r * 1.15], [x + f * r * .5, y - r * 1.25], [x + f * r * 1.25, y - r * .8], [x + f * r * .9, y - r * .55]], 2, true)), { fill: c, h: { gap: 2.3, base: .88, solid: C.white, layers: [{ color: c }, { color: C.redD, angle: .4, gap: 5, alpha: .45 }] }, w: 2.2 });
      K.line(ctx, T([[x + f * r * .1, y - r * 1.2], [x + f * r * .2, y - r * 1.5]]), { w: 3, color: c });
    } else if (kind === 'bandana') {                 // a band over the brow, knotted behind with two tails
      const c = col(o.hatColor) || C.red;
      K.shape(ctx, T(K.ell(x, y - r * .45, r * 1.04, r * .72, 20, PI * 1.02, TAU * .99).concat([[x + r, y - r * .3], [x - r, y - r * .3]])), { fill: c, h: { gap: 2.3, base: .85, solid: C.white }, w: 2 });
      ctx.save(); ctx.clip(K.path2d(T(K.ell(x, y - r * .45, r * 1.04, r * .72, 20, PI, TAU)))); for (let i = 0; i < 6; i++) K.blob(ctx, x - r * .8 + i * r * .32, y - r * .75 + (i % 2) * r * .22, r * .07, C.white, .9); ctx.restore();
      for (const a of [.5, .9]) K.shape(ctx, T(K.capsule([[x - f * r * .95, y - r * .4], [x - f * r * (1.5 + a * .2), y - r * (.1 - a * .5)]], r * .3, r * .12)), { fill: c, h: { gap: 2.2, base: .85 }, w: 1.6 });
    } else if (kind === 'sunhat') {                  // straw sun hat, a wide brim and a ribbon
      const c = col(o.hatColor) || C.straw;
      K.shape(ctx, T(K.ell(x, y - r * .5, r * 2.1, r * .42, 26)), { fill: c, h: { gap: 2.4, base: .85, solid: C.white, layers: [{ color: C.ochre, angle: .3, gap: 4, alpha: .6 }] }, w: 2.2 });
      K.shape(ctx, T(K.ell(x, y - r * .7, r * 1.0, r * .8, 22, PI, TAU).concat([[x + r, y - r * .62], [x - r, y - r * .62]])), { fill: c, h: { gap: 2.4, base: .85, solid: C.white, layers: [{ color: C.ochre, angle: -.4, gap: 4, alpha: .5 }] }, w: 2.2 });
      K.line(ctx, T([[x - r * .98, y - r * .78], [x + r * .98, y - r * .78]]), { w: 4, color: col(o.ribbon) || C.pink });
    } else if (kind === 'nurse') {
      K.shape(ctx, T([[x - r * .8, y - r * .62], [x - r * .6, y - r * 1.2], [x + r * .6, y - r * 1.2], [x + r * .8, y - r * .62]]), { fill: C.white, h: { gap: 4, base: .3, solid: C.white, layers: [{ color: C.sky, alpha: .5 }] }, w: 2 });
      const cx = x + f * r * .05, cy = y - r * .92;
      K.line(ctx, T([[cx - r * .2, cy], [cx + r * .2, cy]]), { w: 3, color: C.red, passes: 1 }); K.line(ctx, T([[cx, cy - r * .2], [cx, cy + r * .2]]), { w: 3, color: C.red, passes: 1 });
    } else if (kind === 'grad') {                    // mortarboard and tassel
      K.shape(ctx, T(K.ell(x, y - r * .55, r * .95, r * .55, 18, PI, TAU).concat([[x + r * .95, y - r * .5], [x - r * .95, y - r * .5]])), { fill: C.navy, h: { gap: 2.2, base: .9 }, w: 2 });
      K.shape(ctx, T([[x - r * 1.6, y - r * 1.05], [x, y - r * 1.4], [x + r * 1.6, y - r * 1.05], [x, y - r * .75]]), { fill: C.navy, h: { gap: 2.2, base: .9, layers: [{ color: C.ink }] }, w: 2.2 });
      K.line(ctx, T([[x, y - r * 1.07], [x + f * r * 1.2, y - r * 1.0], [x + f * r * 1.3, y - r * .3]]), { w: 2, color: C.straw, passes: 1 });
    } else if (kind === 'chef') {
      const top = K.smooth([[x - r * .9, y - r * .55], [x - r * 1.25, y - r * 1.6], [x - r * .5, y - r * 2.25], [x + r * .2, y - r * 2.0], [x + r * .9, y - r * 2.3], [x + r * 1.3, y - r * 1.5], [x + r * .9, y - r * .55]], 2, true);
      K.shape(ctx, T(top), { fill: C.white, h: { gap: 4, base: .25, solid: C.white, layers: [{ color: C.sky, alpha: .6 }] }, w: 2.2 });
      K.shape(ctx, T(K.rect(x - r * .95, y - r * .7, r * 1.9, r * .38)), { fill: C.white, h: { gap: 4, base: .2, solid: C.white, layers: [{ color: C.lilac, alpha: .4 }] }, w: 2 });
    } else if (kind === 'beanie') {
      const c = col(o.hatColor) || C.green;
      K.shape(ctx, T(K.ell(x, y - r * .3, r * 1.04, r * .95, 22, PI, TAU).concat([[x + r * 1.04, y - r * .2], [x - r * 1.04, y - r * .2]])), { fill: c, h: { gap: 2.4, base: .85, solid: C.white, angle: -1.4 }, w: 2.2 });
      K.dot(ctx, x, y - r * 1.3, r * .26, C.white);
    } else if (kind === 'headband') {
      K.line(ctx, T([[x - r * .95, y - r * .45], [x + r * .95, y - r * .55]]), { w: 4, color: col(o.hatColor) || C.red });
    }
  }
  const FRINGE = ['short', 'long', 'ponytail', 'bob', 'pigtails', 'side'];
  function hairBack(ctx, x, y, r, f, o) {
    const hc = col(o.hairColor) || C.navy, style = o.hair || 'bun';
    if (style === 'bald') return;
    const fillOpts = { fill: hc, h: { gap: 2.2, base: .85, layers: [{ color: hc === C.navy ? C.blue : hc }] }, w: 2 };
    if (style === 'buzz') { K.shape(ctx, K.ell(x - f * r * .12, y - r * .2, r * .96, r * .9, 20), { fill: hc, h: { gap: 4, base: .45 }, w: 1.6 }); return; }
    if (style === 'curly' || style === 'afro') {
      const R = style === 'afro' ? 1.45 : 1.14, pts = [];
      for (let i = 0; i < 13; i++) { const a = PI * .62 + i / 13 * TAU; pts.push(...K.ell(x - f * r * .15 + Math.cos(a) * r * R, y - r * .2 + Math.sin(a) * r * R * .95, r * .32, r * .32, 7, a - 1.5, a + 1.5)); }
      K.shape(ctx, K.smooth(pts, 1), fillOpts);
      return;
    }
    if (style === 'long') K.shape(ctx, K.smooth([[x - f * r * 1.1, y - r * .6], [x + f * r * .3, y - r * 1.1], [x + f * r * .9, y - r * .4], [x + f * r * .2, y + r * .3], [x - f * r * .3, y + r * 1.9], [x - f * r * 1.25, y + r * 1.7]], 2, true), fillOpts);
    if (style === 'bob') K.shape(ctx, K.smooth([[x - f * r * 1.15, y - r * .4], [x - f * r * .4, y - r * 1.15], [x + f * r * .8, y - r * .85], [x + f * r * .7, y + r * .1], [x - f * r * .1, y + r * .85], [x - f * r * 1.2, y + r * .75]], 2, true), fillOpts);
    K.shape(ctx, K.ell(x - f * r * .18, y - r * .12, r * 1.02, r * 1.0, 22), fillOpts);
    if (style === 'bun') K.shape(ctx, K.ell(x - f * r * .95, y - r * .05, r * .42, r * .42, 14), fillOpts);
    if (style === 'ponytail') K.shape(ctx, K.capsule(K.bez([x - f * r * .7, y - r * .5], [x - f * r * 1.9, y - r * .3], [x - f * r * 1.6, y + r * 1.4], [x - f * r * 1.15, y + r * 2.4], 10), r * .75, r * .25), fillOpts);
    if (style === 'pigtails') for (const [dx, dy] of [[-1.05, .15], [.55, .55]]) { K.shape(ctx, K.capsule(K.qbez([x + f * r * dx, y + r * (dy - .3)], [x + f * r * (dx * 1.3), y + r * (dy + .4)], [x + f * r * (dx * 1.1), y + r * (dy + 1.1)], 6), r * .55, r * .25), fillOpts); K.dot(ctx, x + f * r * dx, y + r * (dy - .2), r * .16, col(o.ribbon) || C.pink, { w: 1.4 }); }
    if (style === 'spiky') { const sp = []; for (let i = 0; i <= 8; i++) { const a = PI * 1.02 + i / 8 * PI * .96, rr = i % 2 ? r * 1.02 : r * 1.4; sp.push([x - f * r * .1 + Math.cos(a) * rr, y - r * .12 + Math.sin(a) * rr]); } K.shape(ctx, sp.concat([[x - f * r * .1 + r * .98, y], [x - f * r * .1 - r * .98, y]]), fillOpts); }
  }
  // expressions: eyes, brows and mouth in a three-quarter view; o.face, o.mouth (0..1) or o.talk (time), o.sad
  function face(ctx, x, y, r, f, o) {
    hairBack(ctx, x, y, r, f, o);
    const skin = col(o.skin) || C.skin, mood = o.face || (o.sad ? 'worried' : 'neutral');
    const tiltBack = mood === 'proud' ? -f * .12 : 0;
    if (tiltBack) { ctx.save(); ctx.translate(x, y + r); ctx.rotate(tiltBack); ctx.translate(-x, -y - r); }
    K.shape(ctx, K.ell(x + f * r * .12, y + r * .05, r * .86, r * .92, 22), { fill: skin, solid: C.white, h: { gap: 3, base: .7, layers: [{ color: C.skinD, alpha: .35 }] }, w: 2 });
    const hc = col(o.hairColor) || C.navy, style = o.hair || 'bun';
    if (FRINGE.includes(style)) {     // fringe
      const pts = style === 'bob' ? [[x - f * r * .7, y - r * .3], [x - f * r * .1, y - r * 1.0], [x + f * r * .98, y - r * .55], [x + f * r * .96, y - r * .28], [x - f * r * .5, y - r * .25]]
        : style === 'side' ? [[x - f * r * .62, y - r * .25], [x - f * r * .3, y - r * 1.0], [x + f * r * 1.0, y - r * .62], [x + f * r * .3, y - r * .55], [x - f * r * .45, y - r * .1]]
          : [[x - f * r * .62, y - r * .25], [x - f * r * .1, y - r * .98], [x + f * r * .95, y - r * .5], [x + f * r * .9, y - r * .22], [x + f * r * .25, y - r * .42], [x - f * r * .45, y - r * .02]];
      const browy = ['surprised', 'worried', 'angry', 'proud'].includes(mood) ? y - r * .44 : 1e9;
      K.shape(ctx, pts.map(p => [p[0], Math.min(p[1], browy)]), { fill: hc, h: { gap: 2, base: .9 }, w: 1.8 });
    }
    if (style === 'curly' || style === 'afro') for (let i = 0; i < 3; i++) K.dot(ctx, x + f * r * (.05 + i * .3), y - r * (.72 - i * .08), r * .2, hc, { w: 1.4 });
    const ex = x + f * r * .5, ey = y - r * .08, ew = 1.6 * Math.max(.8, r / 15), dw = Math.max(1.2, r / 12.5);
    const blink = o.t != null && ((o.t * .7 + (o.blinkPhase || 0)) % 3.1) < .12;
    const arc = (dy) => K.line(ctx, K.qbez([ex - r * .14, ey + r * .03], [ex, ey + dy * r], [ex + r * .14, ey + r * .03], 5), { w: dw, color: C.navy, passes: 1 });
    const brow = (yIn, yOut) => K.line(ctx, [[ex - f * r * .2, ey - r * yOut], [ex + f * r * .16, ey - r * yIn]], { w: dw * 1.05, color: hc === C.grey ? C.navy : hc, passes: 1 });
    if (mood === 'happy' || mood === 'proud') arc(-.2);
    else if (mood === 'sleepy') arc(.14);
    else if (blink) K.line(ctx, [[x + f * r * .38, ey], [x + f * r * .62, ey]], { w: dw, color: C.navy, passes: 1 });
    else if (mood === 'surprised') { K.dot(ctx, ex, ey, ew * 1.5, C.navy, { w: 1.4 }); K.blob(ctx, ex - f * ew * .5, ey - ew * .5, ew * .45, C.white, 1); }
    else K.dot(ctx, ex, ey, ew, C.navy, { w: 1.4 });
    if (mood === 'surprised') brow(.34, .3);
    else if (mood === 'worried') brow(.32, .18);
    else if (mood === 'angry') brow(.14, .32);
    else if (mood === 'proud') brow(.3, .28);
    if (o.glasses) { K.line(ctx, K.ell(ex, ey, r * .3, r * .26, 14), { closed: true, w: 1.6, color: C.navy }); K.line(ctx, [[x + f * r * .2, y - r * .1], [x - f * r * .5, y - r * .2]], { w: 1.4, color: C.navy }); }
    if (o.mask) {
      const m = [[x + f * r * .02, y + r * .12], [x + f * r * 1.02, y + r * .1], [x + f * r * .86, y + r * .78], [x + f * r * .15, y + r * .86]];
      K.shape(ctx, m, { fill: C.white, solid: C.white, h: { gap: 4, base: .2, w: 1.2, layers: [{ color: C.sky, alpha: .4 }] }, w: 1.8 });
      K.line(ctx, [[x + f * r * .05, y + r * .25], [x - f * r * .45, y - r * .05]], { w: 1.4 });
    } else {
      const blush = mood === 'happy' || mood === 'proud' ? 1.35 : mood === 'angry' ? 1.25 : 1;
      K.blob(ctx, x + f * r * .42, y + r * .34, 2.8 * r / 15 * blush, C.rose, mood === 'angry' ? 1 : .9);
      const mx = x + f * r * .62, my = y + r * .52, mw = Math.max(1.4, r / 11);
      const open = o.mouth != null ? K.clamp(o.mouth) : o.talk ? Math.abs(Math.sin(o.talk * 9)) : mood === 'surprised' ? .7 : 0;
      if (open > .15) K.shape(ctx, K.ell(mx, my + r * .02, r * (mood === 'surprised' ? .12 : .15), r * .07 + r * .13 * open, 12), { fill: C.red, h: { base: .9, gap: 2 }, w: 1.4, stroke: C.redD });
      else if (mood === 'happy') K.shape(ctx, K.qbez([mx - r * .17, my - r * .04], [mx, my + r * .32], [mx + r * .19, my - r * .07], 8), { fill: C.red, h: { base: .9, gap: 2 }, w: 1.5, stroke: C.redD });
      else if (mood === 'worried') K.line(ctx, [[mx - r * .15, my + r * .04], [mx - r * .05, my - r * .03], [mx + r * .05, my + r * .04], [mx + r * .15, my - r * .02]], { w: mw, color: C.red, passes: 1 });
      else if (mood === 'angry') K.line(ctx, K.qbez([mx - r * .16, my + r * .06], [mx, my - r * .1], [mx + r * .16, my + r * .06], 5), { w: mw * 1.2, color: C.redD });
      else if (mood === 'sleepy') K.shape(ctx, K.ell(mx, my + r * .02, r * .07, r * .06, 8), { fill: C.red, h: { base: .9, gap: 2 }, w: 1.2, stroke: C.redD });
      else if (mood === 'proud') K.line(ctx, K.qbez([mx - r * .16, my + r * .02], [mx + r * .02, my + r * .14], [mx + r * .2, my - r * .1], 5), { w: mw, color: C.red });
      else K.line(ctx, K.qbez([x + f * r * .48, y + r * .5], [mx, y + r * (o.sad ? .42 : .64)], [x + f * r * .78, y + r * .46], 5), { w: 1.6, color: C.red });
      if (o.beard) K.shape(ctx, K.smooth([[x - f * r * .2, y + r * .3], [x + f * r * .9, y + r * .4], [x + f * r * .7, y + r * 1.05], [x + f * r * .1, y + r * .95]], 1), { fill: o.beard === true ? C.grey : col(o.beard), h: { gap: 2.2, base: .7 }, w: 1.6 });
    }
    if (tiltBack) ctx.restore();
    // little signs over the head
    const t = o.t || 0;
    if (mood === 'worried') { const d = (t * .8) % 1; K.shape(ctx, K.smooth([[x - f * r * .9, y - r * (.75 - d * .3)], [x - f * r * 1.06, y - r * (.38 - d * .3)], [x - f * r * .9, y - r * (.25 - d * .3)], [x - f * r * .76, y - r * (.38 - d * .3)]], 1), { fill: C.sky, h: { base: .9, gap: 2 }, w: 1.4, stroke: C.blue }); }
    if (mood === 'angry') { const cx = x - f * r * .55, cy = y - r * 1.05, k = r * .22 * (1 + .15 * Math.sin(t * 9)); for (const a of [0, PI / 2, PI, PI * 1.5]) K.line(ctx, K.qbez([cx + Math.cos(a) * k * .4, cy + Math.sin(a) * k * .4], [cx + Math.cos(a + .8) * k, cy + Math.sin(a + .8) * k], [cx + Math.cos(a + PI / 2) * k * .4, cy + Math.sin(a + PI / 2) * k * .4], 4), { w: dw, color: C.red, passes: 1 }); }
    if (mood === 'sleepy' && o.t != null) for (let i = 0; i < 2; i++) { const d = ((t * .5 + i * .5) % 1); ctx.save(); ctx.globalAlpha = Math.sin(d * PI); K.text(ctx, 'z', x + f * r * (1 + d * 1.2), y - r * (1.1 + d * 1.6), { font: `${Math.round(r * (.7 + d * .5))}px ${K.FONT.type}`, color: C.navy, align: 'center' }); ctx.restore(); }
    if (mood === 'proud') K.props.sparkle && K.props.sparkle(ctx, x + f * r * 1.5, y - r * 1.2, r * .55, t, C.straw);
  }

  /* ---------------- chibi: a big round head (a third of the height), a short body, facing us ---------------- */
  // look: o.look 'pencil' (or a pencil theme) draws a thin dark outline over soft pastel fills; otherwise crayon.
  // Widths come from K.tier and colours from the palette, so a theme restyles it.
  function pencilLook(o) { return o.look === 'pencil' || (o.look == null && (K.S.look === 'pencil' || K.S.theme === 'pencil' || !!(K.theme && (K.theme === 'pencil' || K.theme.name === 'pencil' || K.theme.look === 'pencil')))); }
  function chibiStyle(o, s) {
    const T = K.tier || { outline: 3.2, structure: 2, detail: 1.2 }, k = Math.max(.8, Math.min(1.25, Math.sqrt(s)));
    return pencilLook(o) ? { w: T.detail * 1.15 * k, base: .42, gap: 4.4, hw: 1, amp: .55, layer: .3 } : { w: T.outline * .78 * k, base: .78, gap: 2.8, hw: undefined, amp: 1, layer: .7 };
  }
  // arms in chibi units from the shoulder: [elbow, hand] for the near (d = 1) and far (d = -1) sides; d flips with facing
  function chibiArm(kind, d, t) {
    const near = d > 0, sw = Math.sin((t || 0) * 2.2);
    const std = [[30, 26], [31, 48]];
    switch (kind) {
      case 'hold': return [[30, 24], [10, 32]];
      case 'carry': return [[28, 22], [14, 14]];
      case 'sleep': return [[26, 26], [6, 30]];
      case 'type': case 'stir': { const j = Math.sin((t || 0) * (kind === 'type' ? 14 : 4) + d) * 3; return [[30, 26], [14 + j, 36]]; }
      case 'up': case 'cheer': { const b = kind === 'cheer' ? Math.abs(Math.sin((t || 0) * 6)) * 8 : 0; return [[34, -22], [40, -48 - b]]; }
      case 'hips': return [[40, 22], [22, 42]];
      case 'shrug': { const b = Math.abs(Math.sin((t || 0) * 3)) * 4; return [[40, 10 - b], [46, -14 - b]]; }
      case 'clap': { const g = (1 + Math.sin((t || 0) * 11)) * 8; return [[30, 22], [4 + g, 10]]; }
      case 'wave': if (!near) return std; { const w = Math.sin((t || 0) * 7) * 6; return [[38, -18], [44 + w, -46]]; }
      case 'give': case 'reach': if (!near) return [[30, 24], [12, 32]]; return [[44, 4], [66, 10]];
      case 'phone': if (!near) return std; return [[30, 24], [8, 8]];
      case 'toss': case 'shake': { if (!near) return [[28, 22], [6, 20]]; const j = Math.sin((t || 0) * 16) * 5; return [[34, 10], [30 + j, -20]]; }
      case 'swing': return [[30 + sw * 6 * d, 26], [31 + sw * 14 * d, 48]];
      default: return std;
    }
  }
  function chibi(ctx, P, o) {
    const s = P.s || 1, f = P.f || 1, t = o.t || 0, S = chibiStyle(o, s), k = s * .82;   // a chibi at s = 1 is about 150 units tall
    const floor = Math.max(P.ftB ? P.ftB[1] : P.hip[1], P.ftF ? P.ftF[1] : P.hip[1]);
    const seated = floor - P.hip[1] < 95 * s, x = P.hip[0];
    const hipY = seated ? P.hip[1] : floor - 52 * k, bob = seated ? 0 : Math.sin(t * 2.4) * 1.2 * k;
    const sy = hipY - 52 * k + bob, headC = [x + f * 2 * k, sy - 38 * k], R = 34 * k;
    const ink = C.ink, skin = col(o.skin) || C.skin, shirt = o.shirt || 'sky', pants = col(o.pants) || C.navy;
    const fill = (c, more = {}) => Object.assign({ fill: col(c) || c, h: { gap: S.gap, base: S.base, solid: C.white, w: S.hw, layers: [{ color: col(c) || c, alpha: S.layer }] }, w: S.w, amp: S.amp, stroke: ink }, more);
    K.seed('chibi' + (o.id || '') + x.toFixed(0) + floor.toFixed(0));
    const W = (lx, ly) => [x + lx * k, ly];
    // arms: far one behind the body, near one in front
    const kind = o.arms || P.arms || 'stand';
    const armAt = (d) => {
      const sh = [x + d * f * 21 * k, sy + 6 * k];
      let [el, ha] = chibiArm(kind, d, t).map(([ax, ay]) => [sh[0] + d * f * (ax - 21) * k, sh[1] + ay * k - 6 * k]);
      const tg = o.target || P.target;
      if (kind === 'point' && d > 0 && tg) { let dx = tg[0] - sh[0], dy = tg[1] - sh[1]; const dd = Math.hypot(dx, dy) || 1; dx /= dd; dy /= dd; el = [sh[0] + dx * 26 * k, sh[1] + dy * 26 * k + 3 * k]; ha = [sh[0] + dx * 52 * k, sh[1] + dy * 52 * k]; }
      else if (kind === 'point' && d > 0) { el = [sh[0] + f * 24 * k, sh[1] - 4 * k]; ha = [sh[0] + f * 50 * k, sh[1] - 12 * k]; }
      return { sh, el, ha };
    };
    const arm = (A, front) => {
      K.shape(ctx, K.capsule([A.sh, A.el, A.ha], 10 * k, 9 * k), fill(o.sleeveless ? (o.skin || 'skin') : 'skin', { h: { gap: 3.4, base: S.base * .8, solid: C.white, w: S.hw } }));
      if (!o.sleeveless) { const se = [A.sh[0] + (A.el[0] - A.sh[0]) * .7, A.sh[1] + (A.el[1] - A.sh[1]) * .7]; const sl = K.capsule([A.sh, se], 13 * k, 12 * k); cloth(ctx, sl, shirt, k * .9, o.shirtColor); K.line(ctx, sl, { closed: true, w: S.w, color: ink, amp: S.amp }); }
      if (front && o.holdF) o.holdF(A.ha); if (!front && o.holdB) o.holdB(A.ha);
      K.shape(ctx, K.ell(A.ha[0], A.ha[1], 7.5 * k, 7 * k, 12), fill(o.gloves ? (o.gloves === true ? 'blue' : o.gloves) : 'skin', { h: { gap: 3, base: S.base * .8, solid: C.white, w: S.hw } }));
    };
    const far = armAt(-1), near = armAt(1);
    const J = Object.assign({}, P, { head: headC, neck: [x, sy], hip: [x, hipY], haF: near.ha, elF: near.el, haB: far.ha, elB: far.el, chibi: true });
    if (o.dry) return J;                                  // where the hands and head are, without drawing
    // legs and shoes (seated: short legs hang from the seat)
    const fs = [P.ftB || [x - 9 * s, floor], P.ftF || [x + 11 * s, floor]].sort((a, b) => a[0] - b[0]);
    const legs = seated ? [[-10, -14, Math.min(floor, hipY + 40 * k)], [10, 14, Math.min(floor, hipY + 40 * k)]]
      : [[-10, -11 + ((fs[0][0] - x) / k + 11) * .6, fs[0][1] - 6 * k], [10, 11 + ((fs[1][0] - x) / k - 11) * .6, fs[1][1] - 6 * k]];
    for (const [hx, lf, fy] of legs) {
      K.shape(ctx, K.capsule([W(hx, hipY), W(lf, fy)], 15 * k, 13 * k), fill(pants === C.navy ? 'navy' : pants, { h: { gap: S.gap, base: S.base + .1, solid: C.white, w: S.hw } }));
      K.shape(ctx, K.ell(x + (lf + (lf < 0 ? -3 : 3)) * k, fy + 3 * k, 11 * k, 6 * k, 14), fill(o.shoes || 'white', { h: { gap: 3, base: .35, solid: C.white, w: S.hw } }));
    }
    if (o.backpack) K.shape(ctx, K.rounded([[x - 24 * k, sy + 4 * k], [x + 24 * k, sy + 4 * k], [x + 26 * k, hipY], [x - 26 * k, hipY], [x - 24 * k, sy + 4 * k]], 10 * k), fill(o.backpack === true ? 'red' : o.backpack));
    arm(far, false);
    // the body: a short rounded shirt
    const torso = K.smooth([[x - 20 * k, sy], [x + 20 * k, sy], [x + 23 * k, hipY - 14 * k], [x + 21 * k, hipY + 4 * k], [x - 21 * k, hipY + 4 * k], [x - 23 * k, hipY - 14 * k]], 2, true);
    cloth(ctx, torso, shirt, k, o.shirtColor);
    K.line(ctx, torso, { closed: true, w: S.w, color: ink, amp: S.amp });
    if (o.apron) { const ap = K.smooth([[x - 14 * k, sy + 10 * k], [x + 14 * k, sy + 10 * k], [x + 18 * k, hipY + 10 * k], [x - 18 * k, hipY + 10 * k]], 1, true); K.shape(ctx, ap, fill(o.apron)); for (const d of [-1, 1]) K.line(ctx, [[x + d * 14 * k, sy + 10 * k], [x + d * 10 * k, sy - 2 * k]], { w: S.w * .7, color: ink, passes: 1 }); }
    if (o.tie) K.shape(ctx, [[x - 3 * k, sy + 2 * k], [x + 3 * k, sy + 2 * k], [x + 5 * k, sy + 28 * k], [x, sy + 34 * k], [x - 5 * k, sy + 28 * k]], fill(o.tie === true ? 'red' : o.tie));
    if (o.scarf) K.shape(ctx, K.capsule([[x - 18 * k, sy + 2 * k], [x + 18 * k, sy + 2 * k]], 10 * k), fill(o.scarf === true ? 'red' : o.scarf));
    if (o.bag) { K.line(ctx, [[x - f * 16 * k, sy + 2 * k], [x + f * 18 * k, hipY - 6 * k]], { w: 3 * k, color: C.brown, passes: 1 }); K.shape(ctx, K.rect(x + f * 18 * k - 12 * k, hipY - 12 * k, 24 * k, 18 * k), fill(o.bag === true ? 'tan' : o.bag)); }
    if (o.logo) K.text(ctx, o.logo, x, (sy + hipY) / 2 + 6 * k, { font: `${Math.round(13 * k)}px ${K.FONT.type}`, align: 'center', color: C.navy });
    if (o.badge) K.shape(ctx, K.rect(x - f * 12 * k - 6 * k, sy + 14 * k, 12 * k, 9 * k), fill('white'));
    // the head: hair behind, face, eyes, cheeks, fringe, bun or hat
    const [hx, hy] = headC, hc = col(o.hairColor) || C.navy, style = o.hair || 'bun';
    const hairFill = { fill: hc, h: { gap: 2.2, base: .9, solid: hc, w: S.hw }, w: S.w, amp: S.amp, stroke: ink };
    if (['bob', 'long', 'pigtails', 'ponytail'].includes(style)) {
      const down = style === 'long' ? 1.25 : style === 'bob' ? .55 : .2;
      K.shape(ctx, K.smooth([[hx - R * 1.08, hy + R * down], [hx - R * 1.12, hy - R * .2], [hx - R * .7, hy - R * 1.05], [hx, hy - R * 1.12], [hx + R * .7, hy - R * 1.05], [hx + R * 1.12, hy - R * .2], [hx + R * 1.08, hy + R * down], [hx + R * .8, hy + R * (down + .1)], [hx - R * .8, hy + R * (down + .1)]], 2, true), hairFill);
      if (style === 'pigtails') for (const d of [-1, 1]) K.shape(ctx, K.ell(hx + d * R * 1.15, hy + R * .25, R * .3, R * .42, 14), hairFill);
      if (style === 'ponytail') K.shape(ctx, K.capsule([[hx - f * R * .9, hy - R * .3], [hx - f * R * 1.3, hy + R * .5], [hx - f * R * 1.1, hy + R * 1.1]], R * .4, R * .2), hairFill);
    }
    K.shape(ctx, K.ell(hx, hy, R, R * .97, 30), fill(o.skin || 'skin', { h: { gap: 3.4, base: pencilLook(o) ? .25 : .45, solid: C.white, w: S.hw, layers: [{ color: skin, alpha: .25 }] } }));
    const mood = o.face || (o.sad ? 'worried' : 'neutral'), look = f * 3 * k, ey = hy + 1 * k, ex = 11 * k, dw = Math.max(1.4, S.w * .8);
    const blink = o.t != null && ((t * .7 + (o.blinkPhase || 0)) % 3.1) < .12;
    for (const d of [-1, 1]) K.blob(ctx, hx + d * 20 * k + look, hy + 11 * k, 6 * k, C.rose, pencilLook(o) ? .55 : .85);
    for (const d of [-1, 1]) {
      const e = [hx + d * ex + look, ey];
      if (mood === 'happy' || mood === 'proud') K.line(ctx, K.qbez([e[0] - 4 * k, e[1] + 1 * k], [e[0], e[1] - 5 * k], [e[0] + 4 * k, e[1] + 1 * k], 5), { w: dw, color: ink, passes: 1 });
      else if (mood === 'sleepy' || blink) K.line(ctx, K.qbez([e[0] - 4 * k, e[1]], [e[0], e[1] + (mood === 'sleepy' ? 3 : 0) * k], [e[0] + 4 * k, e[1]], 5), { w: dw, color: ink, passes: 1 });
      else K.dot(ctx, e[0], e[1], (mood === 'surprised' ? 3.6 : 2.8) * k, ink, { w: 1, stroke: null, h: { base: 1, gap: 1.5 } });
      const bi = mood === 'angry' ? [-8, 2] : mood === 'worried' ? [2, -6] : mood === 'surprised' ? [-9, -9] : null;
      if (bi) K.line(ctx, [[e[0] - d * 5 * k, ey - 8 * k + bi[0] * k * .3 - 2 * k], [e[0] + d * 5 * k, ey - 8 * k + bi[1] * k * .3 - 2 * k]], { w: dw, color: ink, passes: 1 });
    }
    const my = hy + 14 * k, mx = hx + look, open = o.mouth != null ? K.clamp(o.mouth) : o.talk ? Math.abs(Math.sin(o.talk * 9)) : mood === 'surprised' ? .6 : 0;
    if (o.mask) K.shape(ctx, K.rounded([[mx - 13 * k, my - 7 * k], [mx + 13 * k, my - 7 * k], [mx + 12 * k, my + 9 * k], [mx - 12 * k, my + 9 * k], [mx - 13 * k, my - 7 * k]], 4 * k), fill('white'));
    else if (open > .15) K.shape(ctx, K.ell(mx, my + 1 * k, 3.6 * k, (2 + 4 * open) * k, 10), { fill: C.red, h: { base: .9, gap: 2 }, w: 1.2, stroke: C.redD });
    else if (mood === 'happy' || mood === 'proud') K.line(ctx, K.qbez([mx - 4 * k, my], [mx, my + 4 * k], [mx + 4 * k, my], 5), { w: dw, color: C.redD, passes: 1 });
    else if (mood === 'worried' || mood === 'angry') K.line(ctx, K.qbez([mx - 4 * k, my + 2 * k], [mx, my - 1.5 * k], [mx + 4 * k, my + 2 * k], 5), { w: dw, color: C.redD, passes: 1 });
    else K.line(ctx, [[mx - 2.5 * k, my + 1 * k], [mx + 2.5 * k, my + 1 * k]], { w: dw, color: C.redD, passes: 1 });
    if (o.glasses) for (const d of [-1, 1]) K.line(ctx, K.ell(hx + d * ex + look, ey, 7 * k, 6 * k, 14), { closed: true, w: S.w * .7, color: ink, passes: 1 });
    if (style !== 'bald') {
      const top = K.ell(hx, hy, R * 1.03, R * 1.0, 26, PI + .18, TAU - .18), fr = [];
      const n = style === 'spiky' ? 9 : 5;
      for (let i = 0; i <= n; i++) { const u = i / n, fx = hx + R * (.98 - 1.96 * u), wave = (i % 2 ? .16 : .3) * (style === 'side' ? (u < .35 ? .4 : 1.6) : 1); fr.push([fx, hy - R * wave - (style === 'buzz' ? R * .35 : 0)]); }
      K.shape(ctx, top.concat(fr), hairFill);
      if (style === 'bun') K.shape(ctx, K.ell(hx + 2 * k, hy - R * 1.22, R * .38, R * .34, 16), hairFill);
      if (style === 'curly' || style === 'afro') for (let i = 0; i < 7; i++) { const a = PI * (1.05 + i * .15); K.dot(ctx, hx + Math.cos(a) * R * 1.05, hy + Math.sin(a) * R * 1.02, R * .2, hc, { w: S.w * .8, stroke: ink }); }
    }
    if (o.hat === 'cap') {
      const c = col(o.hatColor) || C.red;
      K.shape(ctx, K.ell(hx, hy - R * .2, R * 1.04, R * .9, 24, PI + .05, TAU - .05).concat([[hx + R * 1.04, hy - R * .22], [hx - R * 1.04, hy - R * .22]]), fill(c));
      K.shape(ctx, K.smooth([[hx + f * R * .1, hy - R * .3], [hx + f * R * 1.55, hy - R * .26], [hx + f * R * 1.5, hy - R * .1], [hx + f * R * .1, hy - R * .12]], 1, true), fill(c, { h: { gap: 2.4, base: .9, solid: C.white, w: S.hw } }));
    } else if (o.hat) hat(ctx, o.hat, hx, hy + R * .12, R * .95, f, 0, o);
    arm(near, true);
    if (mood === 'sleepy' && o.t != null) for (let i = 0; i < 2; i++) { const d = ((t * .5 + i * .5) % 1); ctx.save(); ctx.globalAlpha = Math.sin(d * PI); K.text(ctx, 'z', hx + f * R * (1 + d * .8), hy - R * (1 + d * 1.2), { font: `${Math.round(R * (.5 + d * .4))}px ${K.FONT.type}`, color: ink, align: 'center' }); ctx.restore(); }
    if (mood === 'proud' && K.props.sparkle) K.props.sparkle(ctx, hx + f * R * 1.3, hy - R * 1.1, R * .4, t, C.straw);
    if (mood === 'worried') K.blob(ctx, hx - f * R * .85, hy - R * .45, R * .1, C.sky, 1);
    if (o.over) o.over(J);
    return J;
  }

  /* ---------------- the person ---------------- */
  function person(ctx, P, o = {}) {
    const B = buildOf(o.build || P.build);
    if (B.chibi) return chibi(ctx, P, o);
    if (!P.built && B.key !== 'adult mid') {           // joints made without the build: apply it about the feet
      const fy = Math.max(P.ftB ? P.ftB[1] : P.hip[1], P.ftF ? P.ftF[1] : P.hip[1]);
      P = applyBuild(Object.assign({}, P), P.hip[0], fy, o.build);
    }
    if (o.dry) return P;
    const s = P.s || 1, f = P.f || 1, r = 15 * s * B.head, lw = Math.max(1, Math.sqrt(s)) * (K.tier ? K.tier.outline / 3.2 : 1) * (pencilLook(o) ? .55 : 1);
    const N = P.neck, Hp = P.hip, L = B.limb, Tw = B.torso, Hw = B.hip;
    let vx = Hp[0] - N[0], vy = Hp[1] - N[1]; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
    const px = -vy, py = vx, sh = [N[0] + vx * 7 * s, N[1] + vy * 7 * s];
    const shirt = o.shirt || 'floral', pants = col(o.pants) || C.blue;
    K.seed('person' + (o.id || '') + P.head[0].toFixed(0) + P.head[1].toFixed(0));
    const leg = (kn, ft) => {
      if (!kn) return;
      K.shape(ctx, K.capsule([Hp, kn, ft], 25 * s * L * (Hw > 1.2 ? 1.12 : 1), 20 * s * L), { fill: pants, h: { angle: -1.3, gap: 2.8, base: .7, solid: C.white }, w: 2.4 * lw });
      K.shape(ctx, K.ell(ft[0] + f * 6 * s, ft[1] + 3 * s, 13 * s * Math.min(1.1, L), 6.5 * s, 16), { fill: col(o.shoes) || C.navy, h: { gap: 2.2, base: .8 }, w: 2 * lw });
    };
    const hand = (ha) => {
      if (o.gloves) K.shape(ctx, K.ell(ha[0], ha[1], 8.5 * s, 7.5 * s, 14), { fill: col(o.gloves === true ? 'blue' : o.gloves), h: { gap: 2.3, base: .8 }, w: 2 * lw });
      else K.shape(ctx, K.ell(ha[0], ha[1], 6.5 * s * L, 6 * s * L, 12), { fill: col(o.skin) || C.skin, h: { gap: 3, base: .7 }, w: 1.8 * lw });
    };
    const arm = (el, ha, front) => {
      if (!el) return;
      const pts = K.capsule([[sh[0] + f * (front ? 3 : -3) * s, sh[1]], el, ha], 18 * s * L, 14 * s * L);
      if (o.sleeveless) K.shape(ctx, pts, { fill: col(o.skin) || C.skin, h: { gap: 3, base: .7, solid: C.white, layers: [{ color: C.skinD, alpha: .3 }] }, w: 2.2 * lw });
      else { cloth(ctx, pts, o.sleeve || shirt, s * .85, o.shirtColor); K.line(ctx, pts, { closed: true, w: 2.3 * lw }); }
      if (o.cane && front) { const fl = Math.max(P.ftB ? P.ftB[1] : ha[1], P.ftF ? P.ftF[1] : ha[1]) + 4 * s; K.line(ctx, [[ha[0] + f * 3 * s, ha[1]], [ha[0] + f * 9 * s, fl]], { w: 4 * s, color: col(o.cane === true ? 'brown' : o.cane) }); K.line(ctx, K.qbez([ha[0] + f * 3 * s, ha[1]], [ha[0] - f * 4 * s, ha[1] - 12 * s], [ha[0] - f * 12 * s, ha[1] - 4 * s], 5), { w: 4 * s, color: col(o.cane === true ? 'brown' : o.cane) }); }
      if (o.holdB && !front) o.holdB(ha); if (o.holdF && front) o.holdF(ha);
      hand(ha);
    };
    const at = (k, d) => [N[0] + vx * k * s + px * d * s, N[1] + vy * k * s + py * d * s];    // k along the spine from the neck, d across
    if (o.skirt) {
      leg(P.knB, P.ftB); leg(P.knF, P.ftF);
      const sk = [[Hp[0] - px * 20 * s * Hw, Hp[1] - py * 20 * s - 8 * s], [Hp[0] + px * 20 * s * Hw, Hp[1] + py * 20 * s - 8 * s], [Hp[0] + px * 30 * s * Hw + vx * 55 * s, Hp[1] + 55 * s], [Hp[0] - px * 30 * s * Hw + vx * 55 * s, Hp[1] + 55 * s]];
      K.shape(ctx, K.smooth(sk, 1), { fill: col(o.skirt), h: { gap: 2.6, base: .75, solid: C.white, angle: -1.4 }, w: 2.3 * lw });
    } else { leg(P.knB, P.ftB); leg(P.knF, P.ftF); }
    if (o.backpack) {                                 // on the far side of the back, under the torso
      const c = col(o.backpack === true ? 'red' : o.backpack), bc = at(46, f * 17 * Tw);
      K.shape(ctx, K.rounded([[bc[0] - 17 * s, bc[1] - 32 * s], [bc[0] + 17 * s, bc[1] - 32 * s], [bc[0] + 19 * s, bc[1] + 30 * s], [bc[0] - 19 * s, bc[1] + 30 * s], [bc[0] - 17 * s, bc[1] - 32 * s]], 9 * s), { fill: c, h: { gap: 2.4, base: .85, solid: C.white, layers: [{ color: c }, { color: C.navy, angle: .5, gap: 7, alpha: .3 }] }, w: 2.4 * lw });
      K.shape(ctx, K.rect(bc[0] - f * 2 * s - 12 * s, bc[1] + 4 * s, 24 * s, 18 * s), { fill: c, h: { gap: 2.2, base: .9 }, w: 1.8 * lw });
    }
    arm(P.elB, P.haB, false);
    const nW = 14 * Tw, hW = 19 * Hw;
    const t = [[N[0] + px * nW * s, N[1] + py * nW * s], [N[0] - px * nW * s, N[1] - py * nW * s],
      [Hp[0] - px * hW * s + vx * 14 * s, Hp[1] - py * hW * s + vy * 14 * s], [Hp[0] + px * hW * s + vx * 14 * s, Hp[1] + py * hW * s + vy * 14 * s]];
    if (B.belly) { const belly = at(58, -f * 27 * Hw); if (f > 0) t.splice(2, 0, belly); else t.push(belly); }
    const torso = K.smooth(t, 1, true);
    cloth(ctx, torso, shirt, s, o.shirtColor);
    K.line(ctx, torso, { closed: true, w: 2.5 * lw });
    if (o.apron) {
      const ap = [[N[0] + vx * 22 * s + px * 11 * s, N[1] + vy * 22 * s + py * 11 * s], [N[0] + vx * 22 * s - px * 11 * s, N[1] + vy * 22 * s - py * 11 * s],
        [Hp[0] - px * 17 * s * Hw + vx * 26 * s, Hp[1] - py * 17 * s * Hw + vy * 26 * s], [Hp[0] + px * 17 * s * Hw + vx * 26 * s, Hp[1] + py * 17 * s * Hw + vy * 26 * s]];
      K.shape(ctx, ap, { fill: col(o.apron), h: { gap: 2.6, base: .75, solid: C.white, angle: -1.3 }, w: 2.2 * lw });
    }
    if (o.vest) {                                     // reflective stripes for riders
      K.line(ctx, [[Hp[0] - px * 18 * s - vx * 30 * s, Hp[1] - py * 18 * s - vy * 30 * s], [Hp[0] + px * 18 * s - vx * 30 * s, Hp[1] + py * 18 * s - vy * 30 * s]], { w: 4 * s, color: col(o.vest) });
    }
    if (o.tie) { const c = col(o.tie === true ? 'red' : o.tie), a = at(0, f * 2); K.shape(ctx, [[a[0] - 6 * s, a[1] - 2 * s], [a[0] + 6 * s, a[1] - 2 * s], [a[0] + 3 * s, a[1] + 6 * s], [a[0] + 6 * s, a[1] + 44 * s], [a[0], a[1] + 54 * s], [a[0] - 6 * s, a[1] + 44 * s], [a[0] - 3 * s, a[1] + 6 * s]], { fill: c, h: { gap: 2, base: .9, layers: [{ color: C.white, angle: .8, gap: 7, alpha: .5 }] }, w: 1.6 * lw }); }
    if (o.backpack) { const a = at(2, -f * 6 * Tw), b = at(54, -f * 12 * Tw); K.line(ctx, K.qbez(a, [(a[0] + b[0]) / 2 - f * 6 * s, (a[1] + b[1]) / 2], b, 6), { w: 4.5 * s, color: C.navy }); }
    if (o.bag) {                                      // a shoulder bag: strap across, bag at the near hip
      const c = col(o.bag === true ? 'tan' : o.bag), a = at(0, f * 10 * Tw), bp = at(88, -f * 16 * Hw);
      K.line(ctx, [a, bp], { w: 3.6 * s, color: C.brown });
      K.shape(ctx, K.rounded([[bp[0] - 17 * s, bp[1] - 8 * s], [bp[0] + 17 * s, bp[1] - 8 * s], [bp[0] + 17 * s, bp[1] + 20 * s], [bp[0] - 17 * s, bp[1] + 20 * s], [bp[0] - 17 * s, bp[1] - 8 * s]], 5 * s), { fill: c, h: { gap: 2.4, base: .85, solid: C.white, layers: [{ color: C.ochre, alpha: .5 }] }, w: 2 * lw });
      K.line(ctx, [[bp[0] - 17 * s, bp[1] + 2 * s], [bp[0] + 17 * s, bp[1] + 2 * s]], { w: 1.4, passes: 1 });
    }
    if (o.badge) { const b = at(24, f * 5 * Tw); K.shape(ctx, K.rect(b[0] - 8 * s, b[1] - 6 * s, 16 * s, 12 * s), { fill: C.white, h: { gap: 3, base: .4, solid: C.white, layers: [{ color: C.sky, alpha: .5 }] }, w: 1.4 * lw }); K.line(ctx, [[b[0] - 5 * s, b[1] - 1 * s], [b[0] + 5 * s, b[1] - 1 * s]], { w: 1.2, color: C.red, passes: 1 }); if (typeof o.badge === 'string') K.text(ctx, o.badge, b[0], b[1] + 4 * s, { font: `${Math.round(8 * s)}px ${K.FONT.type}`, align: 'center', color: C.navy }); }
    if (o.logo) K.text(ctx, o.logo, (N[0] + Hp[0]) / 2 + f * 2 * s, (N[1] + Hp[1]) / 2 + 6 * s, { font: `${Math.round(13 * s)}px ${K.FONT.type}`, align: 'center', color: C.navy });
    K.shape(ctx, K.capsule([P.head, N], 9 * s * Math.min(1.15, Tw)), { fill: col(o.skin) || C.skin, h: { gap: 3, base: .7, solid: C.white }, w: 1.8 * lw });
    if (o.scarf) {
      const c = col(o.scarf === true ? 'red' : o.scarf), a = at(-4, 0);
      K.shape(ctx, K.capsule([[a[0] - 13 * s, a[1]], [a[0] + 13 * s, a[1] + 2 * s]], 11 * s), { fill: c, h: { gap: 2.3, base: .85, solid: C.white, layers: [{ color: c }, { color: C.white, angle: .3, gap: 6, alpha: .5 }] }, w: 2 * lw });
      const sw = Math.sin((o.t || 0) * 2.4) * 2 * s;
      K.shape(ctx, K.capsule([[a[0] + f * 6 * s, a[1] + 4 * s], [a[0] + f * 9 * s + sw, a[1] + 40 * s]], 10 * s, 8 * s), { fill: c, h: { gap: 2.3, base: .85, solid: C.white }, w: 2 * lw });
    }
    face(ctx, P.head[0], P.head[1], r, f, o);
    if (o.hat) hat(ctx, o.hat, P.head[0], P.head[1], r, f, P.tilt || 0, o);
    arm(P.elF, P.haF, true);
    if (o.over) o.over(P);
    return P;
  }

  /* ---------------- poses ---------------- */
  // all return joints; x = between the feet, y = the floor; s scale, f facing; o.arms, o.t, o.reach [x,y] for the near hand,
  // o.target [x,y] for 'point', o.build for the age and body
  function armsFor(kind, N, s, f, t, o) {
    const at = (dx, dy) => [N[0] + dx * s * f, N[1] + dy * s];
    const sw = Math.sin((t || 0) * 2.2);
    switch (kind) {
      case 'hold': return { elB: at(16, 46), haB: at(38, 56), elF: at(22, 46), haF: at(46, 52) };
      case 'carry': return { elB: at(10, 44), haB: at(30, 30), elF: at(16, 44), haF: at(38, 28) };
      case 'up': return { elB: at(-20, -16), haB: at(-28, -60), elF: at(24, -18), haF: at(30, -62) };
      case 'wave': { const w = Math.sin((t || 0) * 7) * 10; return { elB: at(-8, 48), haB: at(-12, 88), elF: at(28, -6), haF: at(36 + w, -48) }; }
      case 'point': {
        const T = o.target;
        if (T) {                                       // the near arm reaches toward the target
          const sh = [N[0] + f * 3 * s, N[1] + 7 * s]; let dx = T[0] - sh[0], dy = T[1] - sh[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
          const reach = Math.min(76 * s, d), bend = 5 * s;
          return { elB: at(-8, 48), haB: at(-12, 88), elF: [sh[0] + dx * reach * .52 - dy * bend * f, sh[1] + dy * reach * .52 + Math.abs(dx) * bend], haF: [sh[0] + dx * reach, sh[1] + dy * reach] };
        }
        return { elB: at(-8, 48), haB: at(-12, 88), elF: at(34, 18), haF: at(70, 10) };
      }
      case 'phone': return { elB: at(-8, 48), haB: at(-10, 88), elF: at(24, 52), haF: at(28, 34) };
      case 'hips': return { elB: at(-26, 34), haB: at(-14, 70), elF: at(28, 34), haF: at(16, 70) };
      case 'type': { const k = Math.sin((t || 0) * 14) * 3; return { elB: at(14, 52), haB: at(44, 62 + k), elF: at(20, 52), haF: at(54, 60 - k) }; }
      case 'stir': { const a = (t || 0) * 4; return { elB: at(12, 50), haB: at(40 + Math.cos(a) * 8, 62 + Math.sin(a) * 4), elF: at(24, 44), haF: at(52, 50) }; }
      case 'toss': { const k = Math.max(0, Math.sin((t || 0) * 5)) * 16; return { elB: at(18, 46), haB: at(48, 56 - k), elF: at(22, 46), haF: at(50, 50 - k * .6) }; }
      case 'reach': { let R = o.reach; if (R) { const sx = N[0] + f * 3 * s, sy = N[1] + 7 * s, d = Math.hypot(R[0] - sx, R[1] - sy) || 1, L = Math.min(d, 84 * s); R = [sx + (R[0] - sx) * L / d, sy + (R[1] - sy) * L / d]; return { elB: at(10, 48), haB: at(26, 70), elF: [(N[0] + R[0]) / 2, (N[1] + R[1]) / 2 + 8 * s], haF: R }; } return { elB: at(20, 30), haB: at(50, 20), elF: at(30, 30), haF: at(62, 22) }; }
      case 'swing': return { elB: at(-10 - sw * 8, 46), haB: at(-12 - sw * 18, 84), elF: at(8 + sw * 8, 46), haF: at(12 + sw * 18, 84) };
      case 'give': { const k = Math.sin((t || 0) * 2) * 2; return { elB: at(22, 40), haB: at(54, 42 + k), elF: at(28, 38), haF: at(64, 36 + k) }; }
      case 'shrug': { const k = Math.abs(Math.sin((t || 0) * 3)) * 5; return { elB: at(-28, 36 - k), haB: at(-40, 8 - k * 1.5), elF: at(30, 36 - k), haF: at(44, 8 - k * 1.5) }; }
      case 'cheer': { const k = Math.abs(Math.sin((t || 0) * 6)) * 9; return { elB: at(-22, -12), haB: at(-34, -54 - k), elF: at(24, -14), haF: at(38, -56 - k) }; }
      case 'sleep': return { elB: at(16, 50), haB: at(34, 64), elF: at(22, 50), haF: at(34, 62) };
      case 'stomp': { const k = Math.sin((t || 0) * 14) * 2; return { elB: at(-18, 44), haB: at(-26 + k, 80), elF: at(18, 44), haF: at(28 - k, 80) }; }
      case 'clap': { const g = (1 + Math.sin((t || 0) * 11)) * 9; return { elB: at(12, 46), haB: at(40 - g, 30), elF: at(20, 44), haF: at(46 + g * .4, 30) }; }
      default: return { elB: at(-10, 48), haB: at(-14, 88), elF: at(10, 48), haF: at(14, 88) };
    }
  }
  function finish(J, x, y, o) {
    J.arms = o.arms; J.target = o.target; J.t = o.t;
    if (o.arms === 'sleep') { J.head = [J.head[0] + J.f * 7 * J.s, J.head[1] + 6 * J.s]; J.tilt = (J.tilt || 0) + .3 * J.f; }
    return applyBuild(J, x, y, o.build);
  }
  const pose = {
    stand(x, y, s = 1, f = 1, o = {}) {
      const t = o.t || 0, bob = Math.sin(t * 2.4) * 1.2 * s;
      const hip = [x, y - 124 * s], neck = [x + f * 2 * s, hip[1] - 90 * s + bob], head = [x + f * 4 * s, neck[1] - 20 * s];
      const lift = o.arms === 'stomp' ? Math.max(0, Math.sin(t * 7)) * 16 * s : 0;
      return finish({ s, f, head, neck, hip, knB: [x - f * 6 * s, hip[1] + 63 * s], ftB: [x - f * 9 * s, y], knF: [x + f * (8 + lift * .6 / s) * s, hip[1] + 63 * s - lift * 1.2], ftF: [x + f * 11 * s, y - lift], tilt: o.tilt || 0, ...armsFor(o.arms, neck, s, f, t, o) }, x, y, o);
    },
    walk(x, y, s = 1, f = 1, o = {}) {
      const ph = (o.t || 0) * (o.pace || 6), a = Math.sin(ph), lift = Math.max(0, Math.cos(ph)) * 8 * s;
      const hip = [x, y - 122 * s - Math.abs(Math.sin(ph)) * 2 * s], neck = [x + f * 6 * s, hip[1] - 90 * s], head = [x + f * 9 * s, neck[1] - 20 * s];
      const kB = [x - f * a * 14 * s, hip[1] + 62 * s], kF = [x + f * a * 14 * s, hip[1] + 62 * s];
      return finish({ s, f, head, neck, hip, knB: kB, ftB: [x - f * a * 26 * s, y - (a < 0 ? lift : 0)], knF: kF, ftF: [x + f * a * 26 * s, y - (a > 0 ? lift : 0)], tilt: o.tilt || 0,
        ...(o.arms ? armsFor(o.arms, neck, s, f, o.t, o) : { elB: [neck[0] + f * a * 12 * s, neck[1] + 46 * s], haB: [neck[0] + f * a * 26 * s, neck[1] + 84 * s], elF: [neck[0] - f * a * 12 * s, neck[1] + 46 * s], haF: [neck[0] - f * a * 26 * s, neck[1] + 84 * s] }) }, x, y, o);
    },
    run(x, y, s = 1, f = 1, o = {}) { return pose.walk(x, y, s, f, { ...o, pace: (o.pace || 10) }); },
    sit(x, y, s = 1, f = 1, o = {}) {                 // y = the seat; feet on the floor 60s below
      const t = o.t || 0, bob = Math.sin(t * 2.4) * 1 * s;
      const hip = [x, y], neck = [x + f * 10 * s, y - 88 * s + bob], head = [x + f * 15 * s, neck[1] - 21 * s];
      const fl = o.floor != null ? o.floor : y + 62 * s;
      return finish({ s, f, head, neck, hip, knB: [x + f * 48 * s, y - 4 * s], ftB: [x + f * 54 * s, fl], knF: [x + f * 58 * s, y + 2 * s], ftF: [x + f * 64 * s, fl + 2 * s], tilt: o.tilt || -.08, ...armsFor(o.arms || 'hold', neck, s, f, t, o) }, x, y, o);
    },
    bend(x, y, s = 1, f = 1, o = {}) {
      const b = Math.sin((o.t || 0) * 1.6) * 6 * s;
      const hip = [x, y - 96 * s], neck = [x + f * 50 * s, hip[1] - 32 * s + b * .3], head = [x + f * 68 * s, neck[1] - 10 * s + b * .3];
      return finish({ s, f, head, neck, hip, knB: [x - f * 6 * s, y - 48 * s], ftB: [x - f * 10 * s, y], knF: [x + f * 10 * s, y - 46 * s], ftF: [x + f * 14 * s, y], tilt: .5 * f,
        elB: [neck[0] + f * 16 * s, neck[1] + 40 * s + b], haB: [neck[0] + f * 30 * s, neck[1] + 72 * s + b], elF: [neck[0] + f * 24 * s, neck[1] + 36 * s + b], haF: [neck[0] + f * 42 * s, neck[1] + 66 * s + b] }, x, y, o);
    },
    ride(x, y, s = 1, f = 1, o = {}) {                // y = the seat of a scooter; hands forward on the bars
      const t = o.t || 0, bob = Math.sin(t * 9) * 1.2 * s;
      const hip = [x, y + bob], neck = [x + f * 14 * s, y - 86 * s + bob], head = [x + f * 20 * s, neck[1] - 20 * s];
      const bars = o.bars || [x + f * 76 * s, y - 40 * s];
      return finish({ s, f, head, neck, hip, knB: [x + f * 40 * s, y - 2 * s], ftB: [x + f * 46 * s, y + 46 * s], knF: [x + f * 48 * s, y + 4 * s], ftF: [x + f * 54 * s, y + 50 * s], tilt: -.06 * f,
        elB: [neck[0] + f * 30 * s, neck[1] + 38 * s], haB: bars, elF: [neck[0] + f * 36 * s, neck[1] + 34 * s], haF: [bars[0] + f * 4 * s, bars[1] + 2 * s] }, x, y, o);
    },
  };

  /* ---------------- outfits ---------------- */
  const outfits = {
    rider: { shirt: 'straw', pants: 'navy', hat: 'helmet', hatColor: 'straw', hair: 'short', gloves: 'navy', vest: 'orange' },
    chef: { shirt: 'white', pants: 'navy', hat: 'chef', hair: 'short', apron: 'sky' },
    cook: { shirt: 'white', pants: 'navy', hat: 'chef', hair: 'short', apron: 'rose' },
    cashier: { shirt: 'stripes', shirtColor: 'red', pants: 'navy', hair: 'bun', apron: 'green' },
    customer: { shirt: 'pink', pants: 'blue', hair: 'ponytail' },
    student: { shirt: 'hstripes', shirtColor: 'blue', pants: 'navy', hair: 'short', glasses: true },
    office: { shirt: 'sky', pants: 'navy', hair: 'short', glasses: true },
    coder: { shirt: 'plaid', shirtColor: 'red', pants: 'blue', hair: 'short', glasses: true },
    grandma: { shirt: 'floral', shirtColor: 'violet', pants: 'navy', hair: 'bun', hairColor: 'grey' },
    grandpa: { shirt: 'tan', pants: 'navy', hair: 'bald', beard: true },
    farmer: { shirt: 'floral', pants: 'blue', hat: 'conical', gloves: 'blue', mask: true },
    kid: { shirt: 'dots', shirtColor: 'orange', pants: 'blue', hair: 'short', hat: 'cap', hatColor: 'red' },
    doctor: { shirt: 'white', pants: 'sky', hair: 'short', glasses: true, logo: '+' },
    courier: { shirt: 'green', pants: 'navy', hat: 'cap', hatColor: 'green', hair: 'short' },
    // v2: these carry a build, so who() sizes them by age
    schoolkid: { build: 'kid', shirt: 'hstripes', shirtColor: 'red', pants: 'navy', hair: 'pigtails', backpack: 'blue' },
    pupil: { build: 'kid', shirt: 'white', pants: 'navy', hair: 'spiky', scarf: 'red', backpack: 'orange' },
    teen: { build: 'teen slim', shirt: 'green', pants: 'blue', hair: 'bob', bag: 'straw' },
    elder: { build: 'elder', shirt: 'floral', shirtColor: 'teal', pants: 'navy', hair: 'curly', hairColor: 'grey', cane: true, glasses: true },
    nurse: { shirt: 'white', pants: 'white', hat: 'nurse', hair: 'bun', badge: '护士', shoes: 'white' },
    teacher: { shirt: 'stripes', shirtColor: 'violet', pants: 'navy', hair: 'bob', glasses: true, badge: true },
    worker: { build: 'stout', shirt: 'orange', pants: 'navy', hat: 'hardhat', hatColor: 'straw', hair: 'buzz', gloves: 'navy', vest: 'straw' },
    engineer: { shirt: 'blueL', pants: 'navy', hair: 'side', glasses: true, badge: 'IT' },
    clerk: { shirt: 'white', pants: 'navy', hair: 'side', tie: 'red', badge: true },
    boss: { build: 'stout', shirt: 'sky', pants: 'navy', hair: 'bald', tie: 'navy', glasses: true },
    patient: { shirt: 'stripes', shirtColor: 'blue', pants: 'blue', hair: 'short', mask: true, scarf: 'straw' },
    artist: { shirt: 'dots', shirtColor: 'teal', pants: 'navy', hat: 'beret', hair: 'long', hairColor: 'brown', scarf: 'yolk' },
    porter: { shirt: 'tan', pants: 'navy', hat: 'bandana', hatColor: 'blue', hair: 'short', sleeveless: true },
  };

  outfits.barista = { build: 'chibi', shirt: 'sky', pants: 'navy', hair: 'bun', apron: 'green' };
  outfits.boba = { build: 'chibi', shirt: 'white', pants: 'navy', hair: 'short', hat: 'cap', hatColor: 'rose', apron: 'rose' };
  outfits.chibi = { build: 'chibi', shirt: 'mint', pants: 'navy', hair: 'bun' };
  K.pose = pose; K.outfits = outfits; K.people = { buildOf, applyBuild, armsFor, chibi, pencilLook };
  K.props = Object.assign(K.props || {}, { person, face, hat, cloth, flower });
})();

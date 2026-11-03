/* sweety-statechart-video · people.js — crayon people with joints you can pose and animate.
 * person(ctx, joints, outfit): joints {head, neck, hip, elB, haB, elF, haF, knB, ftB, knF, ftF, s, f, tilt}
 * (B = the far limb, F = the near one; f = facing, 1 right / -1 left; s = scale, 1 ≈ 250 units tall standing).
 * pose.stand / walk / sit / bend / ride / run build joints from a foot point; outfits.* are ready-made looks. */
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
      K.hatch(ctx, pts, { color: '#dfe3ff', solid: C.white, base: .25, gap: 5, w: 1.2, layers: [{ color: C.lilac, alpha: .3, gap: 7 }] });
      ctx.save(); ctx.clip(K.path2d(pts)); const g = 15 * s; let row = 0;
      for (let y = b.y0 - g; y < b.y1 + g; y += g * .9, row++) for (let x = b.x0 - g + (row % 2) * g / 2; x < b.x1 + g; x += g) flower(ctx, x + K.rnd(-2, 2) * s, y + K.rnd(-2, 2) * s, 3.1 * s, K.rnd(0, 1.5), col(color) || C.blue);
      ctx.restore();
    } else if (kind === 'stripes') {
      K.hatch(ctx, pts, { color: '#e3e6ff', solid: C.white, base: .2, gap: 6, w: 1.1, layers: [{ color: C.lilac, alpha: .25 }] });
      ctx.save(); ctx.clip(K.path2d(pts)); ctx.lineCap = 'round';
      for (let x = b.x0 - 40; x < b.x1 + 40; x += 7.5 * s) { ctx.strokeStyle = K.grain(col(color) || C.blue, .3); ctx.lineWidth = 3.2 * s * K.rnd(.8, 1.2); ctx.globalAlpha = K.rnd(.75, 1); ctx.beginPath(); ctx.moveTo(x, b.y0 - 5); ctx.quadraticCurveTo(x + K.rnd(-2, 2), b.cy, x, b.y1 + 5); ctx.stroke(); }
      ctx.restore();
    } else if (kind === 'hstripes') {
      K.hatch(ctx, pts, { color: '#ffffff', solid: C.white, base: .2, gap: 6, w: 1.1, layers: [{ color: C.lilac, alpha: .2 }] });
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
  const SOLID = k => !['floral', 'stripes', 'hstripes', 'plaid', 'dots'].includes(k);

  /* ---------------- hats and hair ---------------- */
  function hat(ctx, kind, x, y, r, f, tilt, o) {
    if (kind === 'conical') {
      const W = 3.5 * r, H = 2.2 * r, by = y - .42 * r;
      let pts = [[x, by - H]].concat(K.qbez([x + W / 2, by + .1 * r], [x, by + .62 * r], [x - W / 2, by + .1 * r], 16));
      pts = K.turn(pts, x, y, tilt); const ap = pts[0];
      K.shape(ctx, pts, { fill: C.straw, radial: ap, r: { cols: [C.ochre, C.orange, '#f0a92a', C.ochre], n: 30, w: 2.3, base: .8, inner: 0, a0: PI / 2 - .95 + tilt, a1: PI / 2 + .95 + tilt, solid: C.white }, w: 2.6 });
    } else if (kind === 'cap') {
      const c = col(o.hatColor) || C.red;
      let dome = K.ell(x, y - r * .35, r * 1.02, r * .8, 22, PI, TAU).concat([[x + r * 1.02, y - r * .3], [x - r * 1.02, y - r * .3]]);
      dome = K.turn(dome, x, y, tilt);
      K.shape(ctx, dome, { fill: c, h: { gap: 2.4, base: .85, solid: C.white }, w: 2.2 });
      const bill = K.turn([[x + f * r * .5, y - r * .45], [x + f * r * 1.85, y - r * .3], [x + f * r * 1.7, y - r * .12], [x + f * r * .4, y - r * .2]], x, y, tilt);
      K.shape(ctx, bill, { fill: c, h: { gap: 2.2, base: .9 }, w: 2 });
    } else if (kind === 'helmet') {
      const c = col(o.hatColor) || C.straw;
      let dome = K.ell(x, y - r * .2, r * 1.2, r * 1.08, 24, PI * .98, TAU * 1.01).concat([[x + r * 1.2, y + r * .05], [x - r * 1.2, y + r * .05]]);
      dome = K.turn(dome, x, y, tilt);
      K.shape(ctx, dome, { fill: c, h: { gap: 2.4, base: .85, solid: C.white, layers: [{ color: c }, { color: C.ochre, angle: .5, gap: 6, alpha: .45 }] }, w: 2.4 });
      K.line(ctx, K.turn([[x - r * 1.15, y - r * .15], [x + r * 1.15, y - r * .15]], x, y, tilt), { w: 2, color: C.navy });
      const visor = K.turn([[x + f * r * .15, y - r * .1], [x + f * r * 1.32, y - r * .02], [x + f * r * 1.2, y + r * .3], [x + f * r * .25, y + r * .22]], x, y, tilt);
      K.shape(ctx, visor, { fill: C.sky, h: { gap: 3, base: .6, layers: [{ color: C.blueL }] }, w: 2 });
    } else if (kind === 'chef') {
      const top = K.smooth([[x - r * .9, y - r * .55], [x - r * 1.25, y - r * 1.6], [x - r * .5, y - r * 2.25], [x + r * .2, y - r * 2.0], [x + r * .9, y - r * 2.3], [x + r * 1.3, y - r * 1.5], [x + r * .9, y - r * .55]], 2, true);
      K.shape(ctx, K.turn(top, x, y, tilt), { fill: C.white, h: { gap: 4, base: .25, solid: C.white, layers: [{ color: C.sky, alpha: .6 }] }, w: 2.2 });
      K.shape(ctx, K.turn(K.rect(x - r * .95, y - r * .7, r * 1.9, r * .38), x, y, tilt), { fill: C.white, h: { gap: 4, base: .2, solid: C.white, layers: [{ color: C.lilac, alpha: .4 }] }, w: 2 });
    } else if (kind === 'beanie') {
      const c = col(o.hatColor) || C.green;
      const dome = K.turn(K.ell(x, y - r * .3, r * 1.04, r * .95, 22, PI, TAU).concat([[x + r * 1.04, y - r * .2], [x - r * 1.04, y - r * .2]]), x, y, tilt);
      K.shape(ctx, dome, { fill: c, h: { gap: 2.4, base: .85, solid: C.white, angle: -1.4 }, w: 2.2 });
      K.dot(ctx, x, y - r * 1.3, r * .26, C.white);
    } else if (kind === 'headband') {
      K.line(ctx, K.turn([[x - r * .95, y - r * .45], [x + r * .95, y - r * .55]], x, y, tilt), { w: 4, color: col(o.hatColor) || C.red });
    }
  }
  function hairBack(ctx, x, y, r, f, o) {
    const hc = col(o.hairColor) || C.navy, style = o.hair || 'bun';
    if (style === 'bald') return;
    const fillOpts = { fill: hc, h: { gap: 2.2, base: .85, layers: [{ color: hc === C.navy ? C.blue : hc }] }, w: 2 };
    if (style === 'long') K.shape(ctx, K.smooth([[x - f * r * 1.1, y - r * .6], [x + f * r * .3, y - r * 1.1], [x + f * r * .9, y - r * .4], [x + f * r * .2, y + r * .3], [x - f * r * .3, y + r * 1.9], [x - f * r * 1.25, y + r * 1.7]], 2, true), fillOpts);
    K.shape(ctx, K.ell(x - f * r * .18, y - r * .12, r * 1.02, r * 1.0, 22), fillOpts);
    if (style === 'bun') K.shape(ctx, K.ell(x - f * r * .95, y - r * .05, r * .42, r * .42, 14), fillOpts);
    if (style === 'ponytail') K.shape(ctx, K.capsule(K.bez([x - f * r * .7, y - r * .5], [x - f * r * 1.9, y - r * .3], [x - f * r * 1.6, y + r * 1.4], [x - f * r * 1.15, y + r * 2.4], 10), r * .75, r * .25), fillOpts);
  }
  function face(ctx, x, y, r, f, o) {
    hairBack(ctx, x, y, r, f, o);
    const skin = col(o.skin) || C.skin;
    K.shape(ctx, K.ell(x + f * r * .12, y + r * .05, r * .86, r * .92, 22), { fill: skin, solid: C.white, h: { gap: 3, base: .7, layers: [{ color: C.skinD, alpha: .35 }] }, w: 2 });
    if (o.hair === 'short' || o.hair === 'long' || o.hair === 'ponytail') {     // fringe
      K.shape(ctx, [[x - f * r * .62, y - r * .25], [x - f * r * .1, y - r * .98], [x + f * r * .95, y - r * .5], [x + f * r * .9, y - r * .22], [x + f * r * .25, y - r * .42], [x - f * r * .45, y - r * .02]], { fill: col(o.hairColor) || C.navy, h: { gap: 2, base: .9 }, w: 1.8 });
    }
    const blink = o.t != null && ((o.t * .7 + (o.blinkPhase || 0)) % 3.1) < .12;
    if (blink) K.line(ctx, [[x + f * r * .38, y - r * .06], [x + f * r * .62, y - r * .06]], { w: 1.6, color: C.navy, passes: 1 });
    else K.dot(ctx, x + f * r * .5, y - r * .08, 1.6 * Math.max(.8, r / 15), C.navy, { w: 1.4 });
    if (o.glasses) { K.line(ctx, K.ell(x + f * r * .5, y - r * .08, r * .3, r * .26, 14), { closed: true, w: 1.6, color: C.navy }); K.line(ctx, [[x + f * r * .2, y - r * .1], [x - f * r * .5, y - r * .2]], { w: 1.4, color: C.navy }); }
    if (o.mask) {
      const m = [[x + f * r * .02, y + r * .12], [x + f * r * 1.02, y + r * .1], [x + f * r * .86, y + r * .78], [x + f * r * .15, y + r * .86]];
      K.shape(ctx, m, { fill: '#eef0ff', solid: C.white, h: { gap: 4, base: .2, w: 1.2 }, w: 1.8 });
      K.line(ctx, [[x + f * r * .05, y + r * .25], [x - f * r * .45, y - r * .05]], { w: 1.4 });
    } else {
      K.blob(ctx, x + f * r * .42, y + r * .34, 2.8 * r / 15, C.rose, .9);
      const open = o.talk ? Math.abs(Math.sin(o.talk * 9)) : 0;
      if (open > .3) K.shape(ctx, K.ell(x + f * r * .62, y + r * .52, r * .14, r * .12 * (1 + open), 10), { fill: C.red, h: { base: .9, gap: 2 }, w: 1.4, stroke: C.red });
      else K.line(ctx, K.qbez([x + f * r * .48, y + r * .5], [x + f * r * .62, y + r * (o.sad ? .42 : .64)], [x + f * r * .78, y + r * .46], 5), { w: 1.6, color: C.red });
      if (o.beard) K.shape(ctx, K.smooth([[x - f * r * .2, y + r * .3], [x + f * r * .9, y + r * .4], [x + f * r * .7, y + r * 1.05], [x + f * r * .1, y + r * .95]], 1), { fill: o.beard === true ? C.grey : col(o.beard), h: { gap: 2.2, base: .7 }, w: 1.6 });
    }
  }

  /* ---------------- the person ---------------- */
  function person(ctx, P, o = {}) {
    const s = P.s || 1, f = P.f || 1, r = 15 * s;
    const N = P.neck, Hp = P.hip;
    let vx = Hp[0] - N[0], vy = Hp[1] - N[1]; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
    const px = -vy, py = vx, sh = [N[0] + vx * 7 * s, N[1] + vy * 7 * s];
    const shirt = o.shirt || 'floral', pants = col(o.pants) || C.blue;
    K.seed('person' + (o.id || '') + P.head[0].toFixed(0) + P.head[1].toFixed(0));
    const leg = (kn, ft) => {
      if (!kn) return;
      K.shape(ctx, K.capsule([Hp, kn, ft], 25 * s, 20 * s), { fill: pants, h: { angle: -1.3, gap: 2.8, base: .7, solid: C.white }, w: 2.4 });
      K.shape(ctx, K.ell(ft[0] + f * 6 * s, ft[1] + 3 * s, 13 * s, 6.5 * s, 16), { fill: col(o.shoes) || C.navy, h: { gap: 2.2, base: .8 }, w: 2 });
    };
    const hand = (ha) => {
      if (o.gloves) K.shape(ctx, K.ell(ha[0], ha[1], 8.5 * s, 7.5 * s, 14), { fill: col(o.gloves === true ? 'blue' : o.gloves), h: { gap: 2.3, base: .8 }, w: 2 });
      else K.shape(ctx, K.ell(ha[0], ha[1], 6.5 * s, 6 * s, 12), { fill: col(o.skin) || C.skin, h: { gap: 3, base: .7 }, w: 1.8 });
    };
    const arm = (el, ha, front) => {
      if (!el) return;
      const pts = K.capsule([[sh[0] + f * (front ? 3 : -3) * s, sh[1]], el, ha], 18 * s, 14 * s);
      if (o.sleeveless) K.shape(ctx, pts, { fill: col(o.skin) || C.skin, h: { gap: 3, base: .7, solid: C.white, layers: [{ color: C.skinD, alpha: .3 }] }, w: 2.2 });
      else { cloth(ctx, pts, o.sleeve || shirt, s * .85, o.shirtColor); K.line(ctx, pts, { closed: true, w: 2.3 }); }
      if (o.holdB && !front) o.holdB(ha); if (o.holdF && front) o.holdF(ha);
      hand(ha);
    };
    if (o.skirt) {
      leg(P.knB, P.ftB); leg(P.knF, P.ftF);
      const sk = [[Hp[0] - px * 20 * s, Hp[1] - py * 20 * s - 8 * s], [Hp[0] + px * 20 * s, Hp[1] + py * 20 * s - 8 * s], [Hp[0] + px * 30 * s + vx * 55 * s, Hp[1] + 55 * s], [Hp[0] - px * 30 * s + vx * 55 * s, Hp[1] + 55 * s]];
      K.shape(ctx, K.smooth(sk, 1), { fill: col(o.skirt), h: { gap: 2.6, base: .75, solid: C.white, angle: -1.4 }, w: 2.3 });
    } else { leg(P.knB, P.ftB); leg(P.knF, P.ftF); }
    arm(P.elB, P.haB, false);
    const t = [[N[0] + px * 14 * s, N[1] + py * 14 * s], [N[0] - px * 14 * s, N[1] - py * 14 * s],
      [Hp[0] - px * 19 * s + vx * 14 * s, Hp[1] - py * 19 * s + vy * 14 * s], [Hp[0] + px * 19 * s + vx * 14 * s, Hp[1] + py * 19 * s + vy * 14 * s]];
    const torso = K.smooth(t, 1, true);
    cloth(ctx, torso, shirt, s, o.shirtColor);
    K.line(ctx, torso, { closed: true, w: 2.5 });
    if (o.apron) {
      const ap = [[N[0] + vx * 22 * s + px * 11 * s, N[1] + vy * 22 * s + py * 11 * s], [N[0] + vx * 22 * s - px * 11 * s, N[1] + vy * 22 * s - py * 11 * s],
        [Hp[0] - px * 17 * s + vx * 26 * s, Hp[1] - py * 17 * s + vy * 26 * s], [Hp[0] + px * 17 * s + vx * 26 * s, Hp[1] + py * 17 * s + vy * 26 * s]];
      K.shape(ctx, ap, { fill: col(o.apron), h: { gap: 2.6, base: .75, solid: C.white, angle: -1.3 }, w: 2.2 });
    }
    if (o.vest) {                                     // reflective stripes for riders
      K.line(ctx, [[Hp[0] - px * 18 * s - vx * 30 * s, Hp[1] - py * 18 * s - vy * 30 * s], [Hp[0] + px * 18 * s - vx * 30 * s, Hp[1] + py * 18 * s - vy * 30 * s]], { w: 4 * s, color: col(o.vest) });
    }
    if (o.logo) K.text(ctx, o.logo, (N[0] + Hp[0]) / 2 + f * 2 * s, (N[1] + Hp[1]) / 2 + 6 * s, { font: `${Math.round(13 * s)}px ${K.FONT.type}`, align: 'center', color: C.navy });
    K.shape(ctx, K.capsule([P.head, N], 9 * s), { fill: col(o.skin) || C.skin, h: { gap: 3, base: .7, solid: C.white }, w: 1.8 });
    face(ctx, P.head[0], P.head[1], r, f, o);
    if (o.hat) hat(ctx, o.hat, P.head[0], P.head[1], r, f, P.tilt || 0, o);
    arm(P.elF, P.haF, true);
    if (o.over) o.over(P);
  }

  /* ---------------- poses ---------------- */
  // all return joints; x = between the feet, y = the floor; s scale, f facing; o.arms, o.t, o.reach [x,y] for the near hand
  function armsFor(kind, N, s, f, t, o) {
    const at = (dx, dy) => [N[0] + dx * s * f, N[1] + dy * s];
    const sw = Math.sin((t || 0) * 2.2);
    switch (kind) {
      case 'hold': return { elB: at(16, 46), haB: at(38, 56), elF: at(22, 46), haF: at(46, 52) };
      case 'carry': return { elB: at(10, 44), haB: at(30, 30), elF: at(16, 44), haF: at(38, 28) };
      case 'up': return { elB: at(-20, -16), haB: at(-28, -60), elF: at(24, -18), haF: at(30, -62) };
      case 'wave': { const w = Math.sin((t || 0) * 7) * 10; return { elB: at(-8, 48), haB: at(-12, 88), elF: at(28, -6), haF: at(36 + w, -48) }; }
      case 'point': return { elB: at(-8, 48), haB: at(-12, 88), elF: at(34, 18), haF: at(70, 10) };
      case 'phone': return { elB: at(-8, 48), haB: at(-10, 88), elF: at(24, 52), haF: at(28, 34) };
      case 'hips': return { elB: at(-26, 34), haB: at(-14, 70), elF: at(28, 34), haF: at(16, 70) };
      case 'type': { const k = Math.sin((t || 0) * 14) * 3; return { elB: at(14, 52), haB: at(44, 62 + k), elF: at(20, 52), haF: at(54, 60 - k) }; }
      case 'stir': { const a = (t || 0) * 4; return { elB: at(12, 50), haB: at(40 + Math.cos(a) * 8, 62 + Math.sin(a) * 4), elF: at(24, 44), haF: at(52, 50) }; }
      case 'toss': { const k = Math.max(0, Math.sin((t || 0) * 5)) * 16; return { elB: at(18, 46), haB: at(48, 56 - k), elF: at(22, 46), haF: at(50, 50 - k * .6) }; }
      case 'reach': { const R = o.reach; if (R) return { elB: at(10, 48), haB: at(26, 70), elF: [(N[0] + R[0]) / 2, (N[1] + R[1]) / 2 + 8 * s], haF: R }; return { elB: at(20, 30), haB: at(50, 20), elF: at(30, 30), haF: at(62, 22) }; }
      case 'swing': return { elB: at(-10 - sw * 8, 46), haB: at(-12 - sw * 18, 84), elF: at(8 + sw * 8, 46), haF: at(12 + sw * 18, 84) };
      default: return { elB: at(-10, 48), haB: at(-14, 88), elF: at(10, 48), haF: at(14, 88) };
    }
  }
  const pose = {
    stand(x, y, s = 1, f = 1, o = {}) {
      const t = o.t || 0, bob = Math.sin(t * 2.4) * 1.2 * s;
      const hip = [x, y - 124 * s], neck = [x + f * 2 * s, hip[1] - 90 * s + bob], head = [x + f * 4 * s, neck[1] - 20 * s];
      return { s, f, head, neck, hip, knB: [x - f * 6 * s, hip[1] + 63 * s], ftB: [x - f * 9 * s, y], knF: [x + f * 8 * s, hip[1] + 63 * s], ftF: [x + f * 11 * s, y], tilt: o.tilt || 0, ...armsFor(o.arms, neck, s, f, t, o) };
    },
    walk(x, y, s = 1, f = 1, o = {}) {
      const ph = (o.t || 0) * (o.pace || 6), a = Math.sin(ph), lift = Math.max(0, Math.cos(ph)) * 8 * s;
      const hip = [x, y - 122 * s - Math.abs(Math.sin(ph)) * 2 * s], neck = [x + f * 6 * s, hip[1] - 90 * s], head = [x + f * 9 * s, neck[1] - 20 * s];
      const kB = [x - f * a * 14 * s, hip[1] + 62 * s], kF = [x + f * a * 14 * s, hip[1] + 62 * s];
      return { s, f, head, neck, hip, knB: kB, ftB: [x - f * a * 26 * s, y - (a < 0 ? lift : 0)], knF: kF, ftF: [x + f * a * 26 * s, y - (a > 0 ? lift : 0)], tilt: o.tilt || 0,
        ...(o.arms ? armsFor(o.arms, neck, s, f, o.t, o) : { elB: [neck[0] + f * a * 12 * s, neck[1] + 46 * s], haB: [neck[0] + f * a * 26 * s, neck[1] + 84 * s], elF: [neck[0] - f * a * 12 * s, neck[1] + 46 * s], haF: [neck[0] - f * a * 26 * s, neck[1] + 84 * s] }) };
    },
    run(x, y, s = 1, f = 1, o = {}) { return pose.walk(x, y, s, f, { ...o, pace: (o.pace || 10) }); },
    sit(x, y, s = 1, f = 1, o = {}) {                 // y = the seat; feet on the floor 60s below
      const t = o.t || 0, bob = Math.sin(t * 2.4) * 1 * s;
      const hip = [x, y], neck = [x + f * 10 * s, y - 88 * s + bob], head = [x + f * 15 * s, neck[1] - 21 * s];
      const fl = o.floor != null ? o.floor : y + 62 * s;
      return { s, f, head, neck, hip, knB: [x + f * 48 * s, y - 4 * s], ftB: [x + f * 54 * s, fl], knF: [x + f * 58 * s, y + 2 * s], ftF: [x + f * 64 * s, fl + 2 * s], tilt: o.tilt || -.08, ...armsFor(o.arms || 'hold', neck, s, f, t, o) };
    },
    bend(x, y, s = 1, f = 1, o = {}) {
      const b = Math.sin((o.t || 0) * 1.6) * 6 * s;
      const hip = [x, y - 96 * s], neck = [x + f * 50 * s, hip[1] - 32 * s + b * .3], head = [x + f * 68 * s, neck[1] - 10 * s + b * .3];
      return { s, f, head, neck, hip, knB: [x - f * 6 * s, y - 48 * s], ftB: [x - f * 10 * s, y], knF: [x + f * 10 * s, y - 46 * s], ftF: [x + f * 14 * s, y], tilt: .5 * f,
        elB: [neck[0] + f * 16 * s, neck[1] + 40 * s + b], haB: [neck[0] + f * 30 * s, neck[1] + 72 * s + b], elF: [neck[0] + f * 24 * s, neck[1] + 36 * s + b], haF: [neck[0] + f * 42 * s, neck[1] + 66 * s + b] };
    },
    ride(x, y, s = 1, f = 1, o = {}) {                // y = the seat of a scooter; hands forward on the bars
      const t = o.t || 0, bob = Math.sin(t * 9) * 1.2 * s;
      const hip = [x, y + bob], neck = [x + f * 14 * s, y - 86 * s + bob], head = [x + f * 20 * s, neck[1] - 20 * s];
      const bars = o.bars || [x + f * 76 * s, y - 40 * s];
      return { s, f, head, neck, hip, knB: [x + f * 40 * s, y - 2 * s], ftB: [x + f * 46 * s, y + 46 * s], knF: [x + f * 48 * s, y + 4 * s], ftF: [x + f * 54 * s, y + 50 * s], tilt: -.06 * f,
        elB: [neck[0] + f * 30 * s, neck[1] + 38 * s], haB: bars, elF: [neck[0] + f * 36 * s, neck[1] + 34 * s], haF: [bars[0] + f * 4 * s, bars[1] + 2 * s] };
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
  };

  K.pose = pose; K.outfits = outfits;
  K.props = Object.assign(K.props || {}, { person, face, hat, cloth, flower });
})();

/* sweety-statechart-video · chart.js — the statechart pieces in crayon: ticket cards with a pin, start and end
 * dots, rounded arrows, edge words with red [guards], the travelling bead, region containers, the red trace and the
 * stamp of a rule chapter. Pure drawing: positions come from layout.js, timing from film.js. */
(function () {
  const K = window.SCV, { C, FONT, TAU, PI } = K;
  const TH = () => (K.layout && K.layout.th ? K.layout.th() : 56);   // ticket height, from the layout
  const colour = c => !c ? C.active : (c[0] === '#' ? c : (C[c] || c));

  function ticketPts(x, y, w, h) {          // straight top and sides, a torn zigzag bottom
    const L = x - w / 2, R = x + w / 2, T = y - h / 2, B = y + h / 2, pts = [[L, T], [R, T], [R, B - 2]];
    const n = Math.round(w / 11);
    for (let i = 1; i < n; i++) pts.push([R - w * i / n, B + (i % 2 ? 3 : -2)]);
    pts.push([L, B - 2]);
    return pts;
  }
  function tornPts(x, y, w, h) {            // an error card: torn on the right edge as well
    const L = x - w / 2, R = x + w / 2, T = y - h / 2, B = y + h / 2, pts = [[L, T], [R - 6, T]];
    for (let i = 1; i < 6; i++) pts.push([R + (i % 2 ? 3 : -4), T + h * i / 6]);
    const n = Math.round(w / 11);
    for (let i = 0; i < n; i++) pts.push([R - w * i / n, B + (i % 2 ? 3 : -2)]);
    pts.push([L, B - 2]);
    return pts;
  }
  function fitFont(ctx, s, maxW, size, min, family) {
    let fs = size;
    ctx.save(); ctx.font = `${fs}px ${family}`;
    while (ctx.measureText(s).width > maxW && fs > min) { fs--; ctx.font = `${fs}px ${family}`; }
    ctx.restore();
    return fs;
  }
  function clock(ctx, x, y, r, t = 0) {     // a small clock badge: waiting, timers
    K.dot(ctx, x, y, r, C.white, { w: 1.6, h: { gap: 3, base: .3 } });
    K.line(ctx, [[x, y], [x, y - r * .62]], { w: 1.5, color: C.cardInk, passes: 1, taper: false });
    const a = t * 1.3 - Math.PI / 2;
    K.line(ctx, [[x, y], [x + Math.cos(a) * r * .75, y + Math.sin(a) * r * .75]], { w: 1.3, color: C.guard, passes: 1, taper: false });
  }
  // b: {id, x, y, w, label, tag, pin, kind}; st: {pop, alpha, active, at, bad, drop (0..1 pin falling), swing (time since the
  // pin landed), ring (0..1 the active ring being drawn), squash (0..1 pop bump), fixed, past}
  function ticket(ctx, b, st = {}) {
    const h = TH(), x = b.x, y = b.y, w = b.w, sc = st.pop ?? 1, kind = b.kind;
    const pinX = x, pinY = y - h / 2;
    ctx.save();
    // swing on the pin after it lands, squash and stretch while popping
    const sw = st.swing != null && st.swing < 1.6 ? .055 * Math.sin(st.swing * 9) * Math.exp(-st.swing * 2.6) : 0;
    const bump = st.squash ? Math.sin(Math.PI * st.squash) : 0;
    ctx.translate(pinX, pinY); ctx.rotate(sw); ctx.translate(-pinX, -pinY);
    ctx.translate(x, y); ctx.scale(sc * (1 + .07 * bump), sc * (1 - .09 * bump)); ctx.translate(-x, -y);
    ctx.globalAlpha = st.alpha ?? 1;
    K.seed('tk' + b.id + (st.active ? 'a' : ''));
    const pts = kind === 'error' ? tornPts(x, y, w, h) : ticketPts(x, y, w, h);
    K.hatch(ctx, K.move(pts, 6, 6), { color: C.ink, base: .12, gap: 2.6, w: 1.4, angle: -.8, alpha: K.S.dark ? .35 : .75 });          // shadow
    K.hatch(ctx, pts, { color: C.cream, solid: C.card, base: .55, gap: 4.5, w: 1.6, angle: -.5, layers: [{ color: C.creamD, alpha: .5 }] });
    if (st.bad || kind === 'error') K.hatch(ctx, pts, { color: '#ffc2cf', base: st.bad ? .45 : .25, gap: 3.4, w: 1.5, angle: .7, layers: [{ color: C.guard, alpha: st.bad ? .35 : .2 }] });
    else if (st.active) K.hatch(ctx, pts, { color: '#ffd3e0', base: .35, gap: 5, w: 1.4, angle: .9, layers: [{ color: C.rose, alpha: .28 }] });
    else if (kind === 'undo' || st.past) K.hatch(ctx, pts, { color: C.past, base: .2, gap: 5, w: 1.2, angle: .9, alpha: .5 });
    const edge = st.bad || kind === 'error' ? C.redD : kind === 'undo' ? C.past : (K.S.dark ? C.cardInk : C.ink);
    K.line(ctx, pts, { closed: true, w: 2.6, color: edge });
    if (kind === 'final') { K.seed('tkf' + b.id); K.line(ctx, ticketPts(x, y, w - 12, h - 12), { closed: true, w: 1.5, color: edge }); }
    if (b.tag) {
      const tfs = fitFont(ctx, b.tag, w - 22, (K.layout && K.layout.size.tag) || 12, 9, FONT.mono);
      ctx.save(); ctx.font = `italic ${tfs}px ${FONT.mono}`; ctx.fillStyle = K.grain(C.guard, .2); ctx.fillText(b.tag, x - w / 2 + 9, y - h / 2 + 14); ctx.restore();
    }
    K.line(ctx, [[x - w / 2 + 8, y - h / 2 + 19], [x + w / 2 - 8, y - h / 2 + 19]], { color: C.guard, w: 1.1, passes: 1, amp: .5, alpha: .8, taper: false });
    const cs = (K.layout && K.layout.size.card) || 23;
    const fs = fitFont(ctx, b.label, w - 22, b.size || cs, 14, FONT.type);
    K.text(ctx, b.label, x, y + h / 2 - 13 + (h - 56) * .1, { font: `${fs}px ${FONT.type}`, align: 'center', color: kind === 'undo' ? C.past : C.cardInk, double: true });
    if (kind === 'undo') { K.seed('tku' + b.id); K.line(ctx, [[x - w / 2 + 16, y + 8], [x + w / 2 - 16, y + 2]], { w: 2.4, color: C.guard, alpha: .8 }); }
    if (kind === 'wait') clock(ctx, x + w / 2 - 14, y - h / 2 + 2, 11, st.at || 0);
    // the pin: falls in, bites, then bobs while its card is active
    const drop = st.drop ?? 1, dy = -46 * (1 - K.ease(drop)) * (1 - K.ease(drop));
    const pr = 8 + (st.active ? 1.5 * Math.sin((st.at || 0) * 5) : 0) + (drop < 1 ? 2 * (1 - drop) : 0);
    ctx.save(); ctx.globalAlpha *= drop > 0 ? 1 : 0;
    if (drop >= 1) K.blob(ctx, pinX + 3, pinY + 4, pr * .9, C.ink, .18);           // the pin's own small shadow
    K.dot(ctx, pinX, pinY + dy, pr, colour(b.pin), { w: 2.2 });
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(pinX - pr * .35, pinY + dy - pr * .35, pr * .28, 0, TAU); ctx.fill();
    ctx.restore();
    if (st.active && (st.ring ?? 1) > 0) {   // the ring is drawn round the card like a crayon circling it
      K.seed('ring' + b.id);
      K.line(ctx, ticketPts(x, y, w + 14, h + 14), { closed: true, w: 2, color: st.bad ? C.guard : C.active, alpha: .55 + .3 * Math.sin((st.at || 0) * 4), progress: st.ring ?? 1 });
    }
    ctx.restore();
  }
  function startDot(ctx, n, st = {}) {
    K.seed('in' + n.id);
    ctx.save(); ctx.globalAlpha = st.alpha ?? 1;
    K.line(ctx, K.ell(n.x, n.y, 14, 14, 24), { closed: true, w: 2.2 });
    K.dot(ctx, n.x, n.y, 8.5, colour(n.color || 'pink'), { w: 2 });
    ctx.restore();
  }
  function endDot(ctx, n, st = {}) {
    K.seed('fn' + n.id);
    ctx.save(); ctx.globalAlpha = st.alpha ?? 1;
    K.line(ctx, K.ell(n.x, n.y, 15, 15, 24), { closed: true, w: 2.4 });
    K.dot(ctx, n.x, n.y, 8.5, C.navy, { w: 2 });
    ctx.restore();
  }
  function arrowHead(ctx, E, Q, id, color) {
    const a = Math.atan2(E[1] - Q[1], E[0] - Q[0]);
    K.seed('ah' + id);
    const head = [[E[0] - Math.cos(a - .5) * 12, E[1] - Math.sin(a - .5) * 12], E, [E[0] - Math.cos(a + .5) * 12, E[1] - Math.sin(a + .5) * 12]];
    K.shape(ctx, head, { fill: color, stroke: color, h: { base: .9, gap: 2 }, w: 2 });
  }
  // a wavy copy of a route (async messages)
  function wavy(P, amp = 3.2, per = 22) {
    const R = K.resample(P, 3, false), out = [];
    let acc = 0;
    for (let i = 0; i < R.length; i++) {
      const a = R[Math.max(0, i - 1)], b = R[Math.min(R.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (i) acc += Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]);
      const k = Math.sin(acc / per * Math.PI * 2) * amp * Math.min(1, acc / 20, (lengthOf(R) - acc) / 20);
      out.push([R[i][0] - (b[1] - a[1]) / L * k, R[i][1] + (b[0] - a[0]) / L * k]);
    }
    return out;
  }
  const lengthOf = P => K.lengthOf(P);
  // e: {id, route (rounded polyline), noHead, style}; prog 0..1
  function arrow(ctx, e, prog, o = {}) {
    K.seed('e' + e.id);
    const color = o.color || C.ink;
    ctx.save(); ctx.globalAlpha = o.alpha ?? 1;
    if (e.style === 'timer') {                // dashed, like a wait that ticks away
      const P = e.route, L = lengthOf(P), dash = 14, gap = 9;
      for (let d = 0; d < L * prog; d += dash + gap) {
        const a = d / L, b = Math.min(prog, (d + dash) / L), seg = [];
        for (let k = 0; k <= 4; k++) seg.push(K.along(P, a + (b - a) * k / 4));
        K.line(ctx, seg, { w: o.w || 2.3, color, passes: 1, taper: false });
      }
    } else if (e.style === 'async') {
      e._wavy = e._wavy || wavy(e.route);
      K.line(ctx, e._wavy, { w: o.w || 2.1, color, progress: prog });
    } else K.line(ctx, e.route, { w: o.w || 2.3, color, progress: prog });
    if (prog >= .999 && !e.noHead) { const P = e.route, n = P.length; arrowHead(ctx, P[n - 1], P[n - 2], e.id, color); }
    if (e.style === 'timer' && prog >= .5 && e.lab) clock(ctx, e.lab.align === 'right' ? e.lab.x + 14 : e.lab.x - 14, e.lab.y - 6, 9, 0);
    ctx.restore();
  }
  function edgeWords(ctx, e, chars, o = {}) {
    if (!e.text || !e.lab) return;
    K.seed('lb' + e.id);
    const size = e.lab.size || 18.5;
    ctx.save(); if (o.alpha != null) ctx.globalAlpha = o.alpha;
    K.words(ctx, e.text, e.lab.x, e.lab.y, { align: e.lab.align, chars, size, color: o.color });
    if (o.fix) {                             // the fix: a green guard written under the words
      K.words(ctx, `[${o.fix}]`, e.lab.x, e.lab.y + size * 1.25 * e.text.split('\n').length, { align: e.lab.align, size, color: C.ok, chars: o.fixChars, guardColor: C.ok });
    }
    ctx.restore();
  }
  function bead(ctx, x, y, t, color) {
    K.seed('tok' + K.S.boil);
    ctx.save(); ctx.globalAlpha = .35 + .2 * Math.sin(t * 8); ctx.fillStyle = K.grain(C.rose, .3); ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU); ctx.fill(); ctx.restore();
    K.dot(ctx, x, y, 7.5, color || C.pink, { w: 2 });
  }
  // container {id, x0, y0, x1, y1, title, regions: [{x0, y0, x1, y1, title, tint}], dividers: [x]}; p 0..1 draws it on
  function container(ctx, k, p = 1) {
    if (p <= 0) return;
    const ln = K.clamp(p / .55), fill = K.clamp((p - .3) / .7), words = K.clamp((p - .45) / .55);
    K.seed('box' + k.id);
    if (k.title != null) {
      const outer = K.rounded([[k.x0, k.y0], [k.x1, k.y0], [k.x1, k.y1], [k.x0, k.y1], [k.x0, k.y0]], 18);
      K.line(ctx, outer, { w: 2.6, progress: ln, taper: false });
      if (fill > 0) {
        K.revealing(fill, () => K.hatch(ctx, K.rect(k.x0 + 3, k.y0 + 3, k.x1 - k.x0 - 6, 42), { color: C.straw, base: .18, gap: 5, w: 1.3, alpha: .35, angle: -.4 }));
        K.line(ctx, [[k.x0 + 2, k.y0 + 46], [k.x1 - 2, k.y0 + 46]], { w: 2, progress: fill, taper: false });
      }
      if (words > 0) K.words(ctx, k.title, (k.x0 + k.x1) / 2, k.y0 + 32, { size: 21, align: 'center', chars: words * K.charCount(k.title) });
      for (const x of k.dividers || []) for (let y = k.y0 + 60; y < k.y0 + 60 + (k.y1 - k.y0 - 70) * fill; y += 16) K.line(ctx, [[x, y], [x, y + 8]], { w: 1.8, passes: 1, taper: false });
    }
    k.regions.forEach((r, i) => {
      K.seed('reg' + k.id + i);
      const pts = K.rounded([[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1], [r.x0, r.y0]], 10);
      if (fill > 0) K.revealing(fill, () => {
        K.hatch(ctx, pts, { color: colour(r.tint || 'sky'), base: .22, gap: 6.5, alpha: .5, w: 1.5, angle: -1.15, layers: [{}, { color: colour(r.tint || 'sky'), angle: -.2, gap: 15, alpha: .25, w: 1.2 }] });
        K.hatch(ctx, K.rect(r.x0 + 2, r.y0 + 2, r.x1 - r.x0 - 4, 40), { color: colour(r.tint || 'sky'), base: .25, gap: 4, alpha: .45, w: 1.4, angle: -.6 });
      });
      K.line(ctx, pts, { w: 2, progress: ln, taper: false });
      if (fill > 0) K.line(ctx, [[r.x0 + 2, r.y0 + 42], [r.x1 - 2, r.y0 + 42]], { w: 1.6, progress: fill, taper: false });
      if (words > 0) K.text(ctx, r.title || '', (r.x0 + r.x1) / 2, r.y0 + 32, { align: 'center', font: `24px ${FONT.type}`, color: C.title, double: true, chars: words * K.charCount(r.title || '') });
    });
  }
  // the red path of a rule chapter, drawn over the arrows it follows
  function trace(ctx, routes, prog, id, alpha = .85) {
    const all = [];
    routes.forEach(r => all.push(...r));
    if (all.length < 2 || alpha <= 0) return;
    K.seed('trace' + id);
    K.line(ctx, all, { w: 5.2, color: C.guard, progress: prog, alpha, amp: 1.3 });
  }
  // the rubber stamp: o.k scale (it comes down from 1.6), o.land seconds since it landed (ink spatter, uneven ink),
  // o.color (red for a broken rule, the ok green for a fix)
  function stamp(ctx, x, y, s, o = {}) {
    const k = o.k ?? 1, a = o.angle ?? -.14, col = o.color || C.guard;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(k, k); ctx.globalAlpha = o.alpha ?? 1;
    K.seed('stamp' + s);
    ctx.font = `34px ${FONT.type}`;
    const w = ctx.measureText(s).width + 40, h = 58;
    K.line(ctx, K.rect(-w / 2, -h / 2, w, h), { closed: true, w: 3.4, color: col, amp: .8 });
    K.line(ctx, K.rect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12), { closed: true, w: 1.6, color: col, amp: .6 });
    K.text(ctx, s, 0, 12, { font: `34px ${FONT.type}`, align: 'center', color: col, holes: .38, double: true });
    if (o.land != null && o.land >= 0) {     // spatter flung out when the stamp hits, settling to a stain
      K.seed('spat' + s);
      const grow = K.clamp(o.land / .12), n = 18;
      for (let i = 0; i < n; i++) {
        const side = i % 4, u = K.rnd(-.5, .5), d = K.rnd(6, 26) * grow;
        const px = side < 2 ? u * w : (side === 2 ? -1 : 1) * (w / 2 + d), py = side < 2 ? (side ? -1 : 1) * (h / 2 + d) : u * h;
        K.blob(ctx, px, py, K.rnd(.8, 3.2), col, .55 * Math.min(1, .5 + grow));
      }
    }
    ctx.restore();
  }

  K.chart = { TH, colour, ticketPts, tornPts, ticket, startDot, endDot, arrow, arrowHead, edgeWords, bead, container, trace, stamp, fitFont, clock };
})();

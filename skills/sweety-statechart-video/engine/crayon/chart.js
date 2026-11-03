/* sweety-statechart-video · chart.js — the statechart pieces in crayon: ticket cards with a pin, start and end
 * dots, rounded arrows, edge words with red [guards], the travelling bead, region containers, the red trace and the
 * stamp of a rule chapter. Pure drawing: positions come from layout.js, timing from film.js. */
(function () {
  const K = window.SCV, { C, FONT, TAU, PI } = K;
  const TH = 56;                            // ticket height
  const colour = c => !c ? C.pink : (c[0] === '#' ? c : (C[c] || c));

  function ticketPts(x, y, w, h) {          // straight top and sides, a torn zigzag bottom
    const L = x - w / 2, R = x + w / 2, T = y - h / 2, B = y + h / 2, pts = [[L, T], [R, T], [R, B - 2]];
    const n = Math.round(w / 11);
    for (let i = 1; i < n; i++) pts.push([R - w * i / n, B + (i % 2 ? 3 : -2)]);
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
  // b: {id, x, y, w, label, tag, pin}; st: {pop, alpha, active, at, bad}
  function ticket(ctx, b, st = {}) {
    const x = b.x, y = b.y, w = b.w, h = TH, sc = st.pop ?? 1;
    ctx.save();
    ctx.translate(x, y); ctx.scale(sc, sc); ctx.translate(-x, -y); ctx.globalAlpha = st.alpha ?? 1;
    K.seed('tk' + b.id + (st.active ? 'a' : ''));
    const pts = ticketPts(x, y, w, h);
    K.hatch(ctx, K.move(pts, 6, 6), { color: C.ink, base: .12, gap: 2.6, w: 1.4, angle: -.8, alpha: .75 });          // shadow
    K.hatch(ctx, pts, { color: C.cream, solid: '#fbf7ec', base: .55, gap: 4.5, w: 1.6, angle: -.5, layers: [{ color: C.creamD, alpha: .5 }] });
    if (st.bad) K.hatch(ctx, pts, { color: '#ffc2cf', base: .45, gap: 3.4, w: 1.5, angle: .7, layers: [{ color: C.red, alpha: .35 }] });
    else if (st.active) K.hatch(ctx, pts, { color: '#ffd3e0', base: .35, gap: 5, w: 1.4, angle: .9, layers: [{ color: C.rose, alpha: .28 }] });
    K.line(ctx, pts, { closed: true, w: 2.6, color: st.bad ? C.redD : C.ink });
    if (b.tag) {
      const tfs = fitFont(ctx, b.tag, w - 22, 12, 9, FONT.mono);
      ctx.save(); ctx.font = `italic ${tfs}px ${FONT.mono}`; ctx.fillStyle = K.grain(C.red, .2); ctx.fillText(b.tag, x - w / 2 + 9, y - h / 2 + 14); ctx.restore();
    }
    K.line(ctx, [[x - w / 2 + 8, y - h / 2 + 19], [x + w / 2 - 8, y - h / 2 + 19]], { color: C.red, w: 1.1, passes: 1, amp: .5, alpha: .8 });
    const fs = fitFont(ctx, b.label, w - 22, b.size || 23, 14, FONT.type);
    K.text(ctx, b.label, x, y + 15, { font: `${fs}px ${FONT.type}`, align: 'center', color: C.navy, double: true });
    const pr = 8 + (st.active ? 1.5 * Math.sin((st.at || 0) * 5) : 0);
    K.dot(ctx, x, y - h / 2, pr, colour(b.pin), { w: 2.2 });
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x - pr * .35, y - h / 2 - pr * .35, pr * .28, 0, TAU); ctx.fill(); ctx.restore();
    if (st.active) { K.seed('ring' + b.id); K.line(ctx, ticketPts(x, y, w + 14, h + 14), { closed: true, w: 2, color: st.bad ? C.red : C.pink, alpha: .55 + .3 * Math.sin((st.at || 0) * 4) }); }
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
  // e: {id, route (rounded polyline), noHead}; prog 0..1
  function arrow(ctx, e, prog, o = {}) {
    K.seed('e' + e.id);
    const color = o.color || C.ink;
    ctx.save(); ctx.globalAlpha = o.alpha ?? 1;
    K.line(ctx, e.route, { w: o.w || 2.3, color, progress: prog });
    if (prog >= .999 && !e.noHead) { const P = e.route, n = P.length; arrowHead(ctx, P[n - 1], P[n - 2], e.id, color); }
    ctx.restore();
  }
  function edgeWords(ctx, e, chars) {
    if (!e.text || !e.lab) return;
    K.seed('lb' + e.id);
    K.words(ctx, e.text, e.lab.x, e.lab.y, { align: e.lab.align, chars, size: e.lab.size || 18.5 });
  }
  function bead(ctx, x, y, t, color) {
    K.seed('tok' + K.S.boil);
    ctx.save(); ctx.globalAlpha = .35 + .2 * Math.sin(t * 8); ctx.fillStyle = K.grain(C.rose, .3); ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU); ctx.fill(); ctx.restore();
    K.dot(ctx, x, y, 7.5, color || C.pink, { w: 2 });
  }
  // container {id, x0, y0, x1, y1, title, regions: [{x0, y0, x1, y1, title, tint}], dividers: [x]}
  function container(ctx, k) {
    K.seed('box' + k.id);
    if (k.title != null) {
      const outer = K.rounded([[k.x0, k.y0], [k.x1, k.y0], [k.x1, k.y1], [k.x0, k.y1], [k.x0, k.y0]], 18);
      K.line(ctx, outer, { w: 2.6 });
      K.line(ctx, [[k.x0 + 2, k.y0 + 46], [k.x1 - 2, k.y0 + 46]], { w: 2 });
      K.words(ctx, k.title, (k.x0 + k.x1) / 2, k.y0 + 32, { size: 21, align: 'center' });
      for (const x of k.dividers || []) for (let y = k.y0 + 60; y < k.y1 - 10; y += 16) K.line(ctx, [[x, y], [x, y + 8]], { w: 1.8, passes: 1 });
    }
    k.regions.forEach((r, i) => {
      K.seed('reg' + k.id + i);
      const pts = K.rounded([[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1], [r.x0, r.y0]], 10);
      K.hatch(ctx, pts, { color: colour(r.tint || 'sky'), base: .3, gap: 6, alpha: .45, w: 1.4 });
      K.line(ctx, pts, { w: 2 });
      K.line(ctx, [[r.x0 + 2, r.y0 + 42], [r.x1 - 2, r.y0 + 42]], { w: 1.6 });
      K.text(ctx, r.title || '', (r.x0 + r.x1) / 2, r.y0 + 32, { align: 'center', font: `24px ${FONT.type}`, color: C.navy, double: true });
    });
  }
  // the red path of a rule chapter, drawn over the arrows it follows
  function trace(ctx, routes, prog, id) {
    const all = [];
    routes.forEach(r => all.push(...r));
    if (all.length < 2) return;
    K.seed('trace' + id);
    K.line(ctx, all, { w: 5.2, color: C.red, progress: prog, alpha: .85, amp: 1.3 });
  }
  function stamp(ctx, x, y, s, o = {}) {
    const k = o.k ?? 1, a = o.angle ?? -.14;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(k, k); ctx.globalAlpha = o.alpha ?? 1;
    K.seed('stamp' + s);
    ctx.font = `34px ${FONT.type}`;
    const w = ctx.measureText(s).width + 40, h = 58;
    K.line(ctx, K.rect(-w / 2, -h / 2, w, h), { closed: true, w: 3.2, color: C.red, amp: .8 });
    K.line(ctx, K.rect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12), { closed: true, w: 1.6, color: C.red, amp: .6 });
    K.text(ctx, s, 0, 12, { font: `34px ${FONT.type}`, align: 'center', color: C.red, holes: .35, double: true });
    ctx.restore();
  }

  K.chart = { TH, colour, ticketPts, ticket, startDot, endDot, arrow, arrowHead, edgeWords, bead, container, trace, stamp, fitFont };
})();

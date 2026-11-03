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
  /* ---- card looks: the same box, drawn as a ticket (the reference), a taped note, a wooden sign, a soft rounded card,
   * a brass plate, a luggage tag, a glass slide or a felt patch (after Kevin Ngo's statechart-art; our own drawing) ---- */
  const LOOKS = ['ticket', 'note', 'sign', 'soft', 'plate', 'tag', 'slide', 'patch'];
  function rrect(x0, y0, x1, y1, r) { return K.rounded([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], r); }
  function tagPts(x0, y0, x1, y1, bev) { const b = Math.min(bev, (y1 - y0) * .42); return [[x0 - b * 1.25, y0 + b], [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0 - b * 1.25, y1 - b]]; }
  // draws the body of a card and returns its outline (for the active ring) and where the label sits
  function body(ctx, look, b, h, st, edge) {
    const x = b.x, y = b.y, w = b.w, L = x - w / 2, R = x + w / 2, T = y - h / 2, B = y + h / 2, active = st.active, bad = st.bad || b.kind === 'error';
    const shadow = pts => K.hatch(ctx, K.move(pts, 6, 6), { color: C.ink, base: .12, gap: 2.6, w: 1.4, angle: -.8, alpha: K.S.dark ? .35 : .7 });
    const wash = pts => {
      if (bad) K.hatch(ctx, pts, { color: '#ffc2cf', base: st.bad ? .45 : .25, gap: 3.4, w: 1.5, angle: .7, layers: [{ color: C.guard, alpha: st.bad ? .35 : .2 }] });
      else if (active) K.hatch(ctx, pts, { color: '#ffd3e0', base: .35, gap: 5, w: 1.4, angle: .9, layers: [{ color: C.rose, alpha: .28 }] });
      else if (b.kind === 'undo' || st.past) K.hatch(ctx, pts, { color: C.past, base: .2, gap: 5, w: 1.2, angle: .9, alpha: .5 });
    };
    if (look === 'note') {                    // a paper note, a little crooked, held by two strips of tape
      const tilt = (K.fnv(b.id) % 100 - 50) / 1400;
      const pts = K.turn([[L, T], [R, T], [R, B], [L, B]], x, y, tilt);
      shadow(pts); K.hatch(ctx, pts, { color: C.yolk, solid: '#fdf6dc', base: .3, gap: 5, w: 1.3, angle: -.4, alpha: .5 }); wash(pts);
      K.line(ctx, pts, { closed: true, w: 2.2, color: edge });
      for (const [tx, ta] of [[L + 18, -.55], [R - 18, .55]]) {
        const tape = K.turn(K.rect(tx - 17, T - 7, 34, 13), tx, T, ta + tilt);
        K.hatch(ctx, tape, { color: C.creamD, solid: 'rgba(250,244,226,.85)', base: .5, gap: 3, w: 1, angle: .2, alpha: .4 });
        K.line(ctx, tape, { closed: true, w: 1, color: C.past, alpha: .6, passes: 1 });
      }
      return { ring: K.turn([[L - 7, T - 7], [R + 7, T - 7], [R + 7, B + 7], [L - 7, B + 7]], x, y, tilt), pin: false };
    }
    if (look === 'sign') {                    // a wooden board: grain, four screws
      const pts = rrect(L, T, R, B, 6);
      shadow(pts); K.hatch(ctx, pts, { color: C.tan, solid: '#ecd2a8', base: .55, gap: 3.6, w: 1.5, angle: 0, layers: [{ color: C.ochre, angle: .04, gap: 7, alpha: .35 }] }); wash(pts);
      K.seed('grain' + b.id);
      for (let yy = T + 11; yy < B - 6; yy += 9) K.line(ctx, [[L + 6, yy + K.rnd(-1, 1)], [R - 6, yy + K.rnd(-1, 1)]], { w: .9, color: C.brown, passes: 1, alpha: .5, taper: false });
      K.line(ctx, pts, { closed: true, w: 2.6, color: edge });
      for (const [ex, ey] of [[L + 8, T + 8], [R - 8, T + 8], [L + 8, B - 8], [R - 8, B - 8]]) K.dot(ctx, ex, ey, 2.2, C.brown, { w: 1 });
      return { ring: rrect(L - 7, T - 7, R + 7, B + 7, 10), pin: false };
    }
    if (look === 'soft') {                    // a soft rounded card, tinted like its region
      const r = Math.min(18, h * .34), pts = rrect(L, T, R, B, r);
      shadow(pts); K.hatch(ctx, pts, { color: colour(st.tint || 'cream'), solid: C.card, base: .5, gap: 4, w: 1.4, angle: .5, layers: [{}, { angle: -.3, gap: 9, alpha: .4 }] }); wash(pts);
      K.line(ctx, pts, { closed: true, w: 2.4, color: edge });
      return { ring: rrect(L - 7, T - 7, R + 7, B + 7, r + 7), pin: false };
    }
    if (look === 'plate') {                   // a brass plate with an inner rule and four screws
      const pts = rrect(L, T, R, B, 5);
      shadow(pts); K.hatch(ctx, pts, { color: C.ochre, solid: '#f1d79a', base: .55, gap: 3.4, w: 1.4, angle: .35, layers: [{ color: C.straw, angle: -.2, gap: 6, alpha: .5 }] }); wash(pts);
      K.line(ctx, pts, { closed: true, w: 2.4, color: edge });
      K.line(ctx, rrect(L + 6, T + 6, R - 6, B - 6, 3), { closed: true, w: 1, color: edge, passes: 1, alpha: .6 });
      for (const [ex, ey] of [[L + 10, T + 10], [R - 10, T + 10], [L + 10, B - 10], [R - 10, B - 10]]) K.dot(ctx, ex, ey, 2, C.brown, { w: .9 });
      return { ring: rrect(L - 7, T - 7, R + 7, B + 7, 9), pin: false };
    }
    if (look === 'tag') {                     // a luggage tag: bevelled nose, a grommet and a curl of string
      const pts = tagPts(L + 10, T, R, B, 16);
      shadow(pts); K.hatch(ctx, pts, { color: C.creamD, solid: C.card, base: .55, gap: 4, w: 1.4, angle: .5 }); wash(pts);
      K.line(ctx, pts, { closed: true, w: 2.4, color: edge });
      const gx = L + 8, gy = y;
      K.dot(ctx, gx, gy, 5.5, C.tan, { w: 1.3 }); K.dot(ctx, gx, gy, 2.4, C.card, { w: 1 });
      K.seed('string' + b.id);
      K.line(ctx, K.smooth([[gx, gy], [gx - 12, gy - 6], [gx - 22, gy + 3], [gx - 16, gy + 13], [gx - 7, gy + 7], [gx - 18, gy - 2], [gx - 32, gy + 9]], 2, false), { w: 1.2, color: edge, passes: 1 });
      return { ring: tagPts(L + 3, T - 7, R + 7, B + 7, 20), pin: false };
    }
    if (look === 'slide') {                   // a glass slide: clear glass, a frosted label end, a stained sample
      const pts = rrect(L, T, R, B, 3);
      K.hatch(ctx, K.move(pts, 4, 5), { color: C.ink, base: .08, gap: 3, w: 1.2, angle: -.8, alpha: .4 });
      K.hatch(ctx, pts, { color: C.sky, solid: 'rgba(235,245,255,.75)', base: .25, gap: 6, w: 1.1, angle: -1.2, alpha: .45 }); wash(pts);
      const fr = rrect(L + 3, T + 3, L + 34, B - 3, 2);
      K.hatch(ctx, fr, { color: C.white, solid: '#fbfbf6', base: .6, gap: 2.4, w: 1, angle: .8, alpha: .5 });
      K.blob(ctx, x + 14, y + 4, Math.min(h * .32, 16), C.lilac, .35);
      K.seed('glint' + b.id);
      K.line(ctx, [[R - 30, T + 6], [R - 14, B - 8]], { w: 1.4, color: C.white, passes: 1, alpha: .9, taper: false });
      K.line(ctx, pts, { closed: true, w: 1.8, color: edge });
      return { ring: rrect(L - 7, T - 7, R + 7, B + 7, 6), pin: false, labelDx: 16 };
    }
    if (look === 'patch') {                   // a felt patch: fuzzy edge, a stitched border inside; on the happy path navy
      const pts = rrect(L, T, R, B, 12);      // felt with gold stitches, off it pale linen (Catch's chart)
      const felt = st.happy === true ? colour('navy') : st.happy === false ? colour('grey') : colour(st.tint || 'straw');
      shadow(pts); K.hatch(ctx, pts, { color: felt, solid: C.card, base: .7, gap: 2.4, w: 1.6, angle: .7, layers: [{}, { angle: -.7, gap: 3.2, alpha: .6 }] }); wash(pts);
      K.seed('fuzz' + b.id);
      const E = K.resample(pts, 5, true);
      for (const q of E) K.line(ctx, [q, [q[0] + K.rnd(-3, 3), q[1] + K.rnd(-3, 3)]], { w: 1, color: felt, passes: 1, alpha: .8, taper: false });
      const S = K.resample(rrect(L + 7, T + 7, R - 7, B - 7, 7), 9, true);
      for (let i = 0; i < S.length - 1; i += 2) K.line(ctx, [S[i], S[i + 1]], { w: 1.6, color: st.happy === false ? C.past : C.straw, passes: 1, taper: false });
      return { ring: rrect(L - 8, T - 8, R + 8, B + 8, 16), pin: false, onDark: st.happy === true };
    }
    const pts = b.kind === 'error' ? tornPts(x, y, w, h) : ticketPts(x, y, w, h);   // the reference's ticket
    shadow(pts);
    K.hatch(ctx, pts, { color: C.cream, solid: C.card, base: .55, gap: 4.5, w: 1.6, angle: -.5, layers: [{ color: C.creamD, alpha: .5 }] });
    wash(pts);
    K.line(ctx, pts, { closed: true, w: 2.6, color: edge });
    return { ring: ticketPts(x, y, w + 14, h + 14), pin: true, rule: true };
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
    const look = st.look || b.look || 'ticket';
    const edge = st.bad || kind === 'error' ? C.redD : kind === 'undo' ? C.past : (K.S.dark ? C.cardInk : C.ink);
    const shape = body(ctx, look, b, h, st, edge);
    if (st.onBug) { K.seed('bug' + b.id); K.line(ctx, shape.ring, { closed: true, w: 2.2, color: C.guard, alpha: .9 }); }   // on the broken rule's path
    if (kind === 'final') { K.seed('tkf' + b.id); K.line(ctx, look === 'ticket' ? ticketPts(x, y, w - 12, h - 12) : rrect(x - w / 2 + 6, y - h / 2 + 6, x + w / 2 - 6, y + h / 2 - 6, 6), { closed: true, w: 1.5, color: edge }); }
    if (b.tag) {
      const tfs = fitFont(ctx, b.tag, w - 22, (K.layout && K.layout.size.tag) || 12, 9, FONT.mono);
      ctx.save(); ctx.font = `italic ${tfs}px ${FONT.mono}`; ctx.fillStyle = K.grain(C.guard, .2); ctx.fillText(b.tag, x - w / 2 + 9, y - h / 2 + 14); ctx.restore();
    }
    if (shape.rule) K.line(ctx, [[x - w / 2 + 8, y - h / 2 + 19], [x + w / 2 - 8, y - h / 2 + 19]], { color: C.guard, w: 1.1, passes: 1, amp: .5, alpha: .8, taper: false });
    const cs = (K.layout && K.layout.size.card) || 23;
    const fs = fitFont(ctx, b.label, w - 22, b.size || cs, 14, FONT.type);
    K.text(ctx, b.label, x + (shape.labelDx || 0), y + h / 2 - 13 + (h - 56) * .1 - (shape.rule || b.tag ? 0 : 4), { font: `${fs}px ${FONT.type}`, align: 'center', color: shape.onDark ? C.card : kind === 'undo' ? C.past : C.cardInk, double: true });
    if (kind === 'undo') { K.seed('tku' + b.id); K.line(ctx, [[x - w / 2 + 16, y + 8], [x + w / 2 - 16, y + 2]], { w: 2.4, color: C.guard, alpha: .8 }); }
    if (kind === 'wait') clock(ctx, x + w / 2 - 14, y - h / 2 + 2, 11, st.at || 0);
    // the pin: falls in, bites, then bobs while its card is active
    const drop = st.drop ?? 1, dy = -46 * (1 - K.ease(drop)) * (1 - K.ease(drop));
    const pr = 8 + (st.active ? 1.5 * Math.sin((st.at || 0) * 5) : 0) + (drop < 1 ? 2 * (1 - drop) : 0);
    if (drop > 0 && shape.pin) {             // only a ticket is pinned; notes are taped, signs screwed, cards just sit
      ctx.save();
      if (drop >= 1) K.blob(ctx, pinX + 3, pinY + 4, pr * .9, C.ink, .18);           // the pin's own small shadow
      K.dot(ctx, pinX, pinY + dy, pr, colour(b.pin), { w: 2.2 });
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(pinX - pr * .35, pinY + dy - pr * .35, pr * .28, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (st.active && (st.ring ?? 1) > 0) {   // the ring is drawn round the card like a crayon circling it
      K.seed('ring' + b.id);
      K.line(ctx, shape.ring, { closed: true, w: 2, color: st.bad ? C.guard : C.active, alpha: .55 + .3 * Math.sin((st.at || 0) * 4), progress: st.ring ?? 1 });
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
  function arrowHead(ctx, E, Q, id, color, scale = 1) {
    const a = Math.atan2(E[1] - Q[1], E[0] - Q[0]), r = 12 * (scale || 1);
    K.seed('ah' + id);
    const head = [[E[0] - Math.cos(a - .5) * r, E[1] - Math.sin(a - .5) * r], E, [E[0] - Math.cos(a + .5) * r, E[1] - Math.sin(a + .5) * r]];
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
  // the part of a polyline between lengths a and b
  function sub(P, a, b) {
    const out = [], L = lengthOf(P);
    if (b <= a || L <= 0) return P.slice();
    out.push(K.along(P, a / L));
    let acc = 0;
    for (let i = 1; i < P.length; i++) { acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (acc > a && acc < b) out.push(P[i]); }
    out.push(K.along(P, b / L));
    return out;
  }
  // e: {id, route (rounded polyline), noHead, style}; prog 0..1; o.stop: stop short of both ends (pen drawings do)
  function arrow(ctx, e, prog, o = {}) {
    K.seed('e' + e.id);
    const color = o.color || C.ink;
    if (o.stop && e.kind !== 'entry' && e.kind !== 'exit') {
      const L = lengthOf(e.route);
      if (L > 3 * o.stop) e = Object.assign({}, e, { route: sub(e.route, e.kind === 'start' ? 0 : o.stop * .6, L - o.stop) });
    }
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
    } else if (o.cord) {                    // a gold cord, couched down with small stitches across it
      K.line(ctx, e.route, { w: 3.6, color: C.ochre, progress: prog, taper: false });
      K.line(ctx, e.route, { w: 1.6, color: C.yolk, progress: prog, passes: 1, taper: false, amp: .4 });
      const P = e.route, L = lengthOf(P);
      for (let d = 8; d < L * prog; d += 14) {
        const a = K.along(P, d / L), b2 = K.along(P, Math.min(1, (d + 1) / L)), ang = Math.atan2(b2[1] - a[1], b2[0] - a[0]) + Math.PI / 2;
        K.line(ctx, [[a[0] - Math.cos(ang) * 4, a[1] - Math.sin(ang) * 4], [a[0] + Math.cos(ang) * 4, a[1] + Math.sin(ang) * 4]], { w: 1, color: C.brown, passes: 1, taper: false, amp: .2 });
      }
    } else K.line(ctx, e.route, { w: o.w || 2.3, color, progress: prog });
    if (prog >= .999 && !e.noHead) { const P = e.route, n = P.length; arrowHead(ctx, P[n - 1], P[n - 2], e.id, color, o.head); }
    if (e.style === 'timer' && prog >= .5 && e.lab) clock(ctx, e.lab.align === 'right' ? e.lab.x + 14 : e.lab.x - 14, e.lab.y - 6, 9, 0);
    ctx.restore();
  }
  // a pale red wash under an arrow on a broken rule's path
  function wash(ctx, e, prog) {
    K.seed('wash' + e.id);
    K.line(ctx, e.route, { w: 10, color: '#f0b3a8', alpha: .55, passes: 1, progress: prog, taper: false });
  }
  // the legend of a rule chapter: {x0, y0, x1, y1, lines: [{text, holds}], checked: {states, steps}}; o.shown says
  // which marks may show yet (results appear with the red path), o.fixed turns broken rules into fixed ones
  function legend(ctx, lg, o = {}) {
    const { x0, y0, x1, y1 } = lg, w = x1 - x0;
    K.seed('legend');
    const pts = K.rect(x0, y0, w, y1 - y0);
    K.hatch(ctx, K.move(pts, 5, 5), { color: C.ink, base: .1, gap: 2.6, w: 1.2, angle: -.8, alpha: .5 });
    K.hatch(ctx, pts, { color: C.cream, solid: C.card, base: .35, gap: 6, w: 1.2, angle: -.5, alpha: .5 });
    K.line(ctx, pts, { closed: true, w: 1.8, color: C.cardInk });
    K.text(ctx, o.title || '规则', x0 + 16, y0 + 30, { font: `italic 18px ${FONT.mono}`, color: C.guard, ink: false });
    let y = y0 + 62;
    for (const ln of lg.lines) {
      const holds = o.fixed && ln.holds === false ? true : ln.holds, mark = !o.shown || holds == null ? '·' : holds ? '✓' : '✗';
      K.text(ctx, mark, x0 + 16, y, { font: `20px ${FONT.mono}`, color: holds === false && o.shown ? C.guard : holds && o.shown ? C.ok : C.cardInk, ink: false });
      K.words(ctx, ln.text, x0 + 40, y, { size: 17, color: C.cardInk });
      y += 30;
    }
    if (o.shown) {
      K.line(ctx, [[x0 + 16, y - 6], [x0 + 56, y - 6]], { w: 4, color: C.guard, alpha: .85, taper: false });
      K.words(ctx, '检查器找到的路径', x0 + 66, y, { size: 16, color: C.cardInk });
    }
    if (lg.checked && o.shown) K.words(ctx, `查遍 ${lg.checked.states} 种情况、${lg.checked.steps} 步`, x0 + 16, y + 28, { size: 15, color: C.past });
  }
  function edgeWords(ctx, e, chars, o = {}) {
    if (!e.text || !e.lab) return;
    K.seed('lb' + e.id);
    const size = e.lab.size || 18.5;
    ctx.save(); if (o.alpha != null) ctx.globalAlpha = o.alpha;
    K.words(ctx, e.text, e.lab.x, e.lab.y, { align: e.lab.align, chars, size, color: o.color, guardColor: o.guardColor });
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
      if ((r.look || k.look) === 'shop') return shopFront(ctx, r, p, ln, fill, words);
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
  // a parent state drawn as a shop front: a striped awning over a window of glass, a planter under it; the
  // sub-states hang in the window (give them the 'note' look)
  function shopFront(ctx, r, p, ln, fill, words) {
    const { x0, y0, x1, y1 } = r, aw = 46, n = Math.max(4, Math.round((x1 - x0) / 70)), sw = (x1 - x0 + 24) / n;
    // window frame and glass
    const win = K.rect(x0, y0 + aw - 4, x1 - x0, y1 - y0 - aw + 4);
    if (fill > 0) K.revealing(fill, () => {
      K.hatch(ctx, win, { color: C.sky, solid: 'rgba(232,242,252,.55)', base: .3, gap: 7, w: 1.2, angle: -1.1, alpha: .35 });
      K.seed('glare' + r.id);
      for (let k = 0; k < 3; k++) { const gx = x0 + (x1 - x0) * (.18 + k * .28); K.line(ctx, [[gx, y0 + aw + 14], [gx + 40, y0 + aw + 70]], { w: 2, color: C.white, alpha: .9, passes: 1, taper: false }); }
    });
    K.line(ctx, win, { closed: true, w: 4.2, color: C.brown, progress: ln, taper: false });
    K.line(ctx, K.rect(x0 + 7, y0 + aw + 3, x1 - x0 - 14, y1 - y0 - aw - 10), { closed: true, w: 1.6, color: C.ink, progress: ln, taper: false });
    // the awning: scalloped stripes, alternate red and cream
    if (fill > 0) K.revealing(fill, () => {
      for (let i = 0; i < n; i++) {
        const a = x0 - 12 + i * sw, b = a + sw, scal = K.qbez([b, y0 + aw - 10], [(a + b) / 2, y0 + aw + 12], [a, y0 + aw - 10], 8);
        const pts = [[a + 4, y0 - 6], [b - 4, y0 - 6], ...scal];
        K.shape(ctx, pts, { fill: i % 2 ? C.cream : C.red, h: { gap: 3, base: .75, solid: C.white, angle: 1.4 }, w: 1.8 });
      }
    });
    K.line(ctx, [[x0 - 14, y0 - 6], [x1 + 14, y0 - 6]], { w: 3, color: C.brown, progress: ln, taper: false });
    // the planter
    if (fill > 0) {
      const pl = K.rect(x0 + 20, y1 + 6, x1 - x0 - 40, 26);
      K.revealing(fill, () => { K.shape(ctx, pl, { fill: C.brown, h: { gap: 3, base: .7, solid: C.white, angle: 0 }, w: 2 });
        K.seed('flowers' + r.id);
        for (let fx = x0 + 34; fx < x1 - 30; fx += 26) { K.line(ctx, [[fx, y1 + 6], [fx + K.rnd(-4, 4), y1 - 10]], { w: 1.4, color: C.greenD, passes: 1 }); K.dot(ctx, fx + K.rnd(-4, 4), y1 - 12, 4.5, K.pick([C.pink, C.straw, C.rose, C.lilac]), { w: 1.2 }); } });
    }
    if (words > 0 && r.title) {                         // the name on a small sign on the awning
      ctx.save(); ctx.font = `24px ${FONT.type}`; const tw = ctx.measureText(r.title).width; ctx.restore();
      const cx = (x0 + x1) / 2, sg = K.rect(cx - tw / 2 - 16, y0 + 4, tw + 32, 36);
      K.shape(ctx, sg, { fill: C.cream, h: { gap: 4, base: .55, solid: C.card }, w: 2 });
      K.text(ctx, r.title, cx, y0 + 30, { align: 'center', font: `24px ${FONT.type}`, color: C.cardInk, double: true, chars: words * K.charCount(r.title) });
    }
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

  K.chart = { TH, LOOKS, body, rrect, sub, wash, legend, colour, ticketPts, tornPts, ticket, startDot, endDot, arrow, arrowHead, edgeWords, bead, container, trace, stamp, fitFont, clock };
})();

/* sweety-statechart-video · motion.js — how things come and go in a scene, the crayon way.
 *   $.enter(kind, p, draw, o)  draw something at progress p (0..1): 'draw' (lines run, hatching sweeps across),
 *                              'pop' (springs up from o.at), 'slide' (comes in from o.from = [dx, dy]), 'erase' (p 0..1
 *                              scribbles it out and lifts it off), 'fade'. p <= 0 draws nothing, p >= 1 draws it plainly.
 *   $.travel(path, p)          a point along a polyline at p, with the facing (f = 1 right, -1 left) and the heading.
 *   $.cast(name, pose, x, y, s, o)  a character from film.json "cast", posed like $.who; the speaker's mouth follows
 *                              the narration (S.talk) when o.S is passed.
 *   $.beat(t, fps)             film time stepped to fps (animation "on twos" is fps 12).
 *   $.progress(t, from, len)   0..1 between chart-time from and from + len (eased with o.ease).
 * Everything is deterministic: progress comes from S.t / S.since / S.T, never from a clock. */
(function () {
  const K = window.SCV;

  function bbox(o, fallback) { return o && o.at ? o.at : fallback; }
  function enter(ctx, kind, p, draw, o = {}) {
    if (p <= 0 && kind !== 'erase') return;
    if (p >= 1 && kind !== 'erase') return draw();
    if (kind === 'erase' && p <= 0) return draw();
    if (kind === 'erase' && p >= 1) return;
    ctx.save();
    try {
      if (kind === 'draw') return K.revealing(K.ease(p), draw);
      if (kind === 'fade') { ctx.globalAlpha *= K.ease(p); return draw(); }
      if (kind === 'pop') {
        const [x, y] = bbox(o, [0, 0]), k = .2 + .8 * K.backOut(p), q = Math.sin(Math.PI * Math.min(1, p * 1.3));
        ctx.translate(x, y); ctx.scale(k * (1 + .08 * q), k * (1 - .1 * q)); ctx.translate(-x, -y);
        ctx.globalAlpha *= Math.min(1, p * 3);
        return draw();
      }
      if (kind === 'slide') {
        const [dx, dy] = o.from || [-160, 0], e = 1 - K.easeInOut(p);
        ctx.translate(dx * e, dy * e);
        ctx.globalAlpha *= Math.min(1, p * 2.5);
        return draw();
      }
      if (kind === 'erase') {                   // scribbled over, then lifted off the page
        const r = o.box || null;
        ctx.globalAlpha *= 1 - K.clamp((p - .55) / .45);
        draw();
        if (r && p > .05) {
          K.seed('erase' + r.join(','));
          const n = Math.round(6 + 18 * K.clamp(p / .6));
          K.scribble(ctx, r[0], r[1] + (r[3] - r[1]) * .1, r[2] - r[0], (r[3] - r[1]) * .8, K.C.paper, { n, len: (r[3] - r[1]) * .5, w: 5, alpha: .9, angle: -.6 });
        }
        return;
      }
      return draw();
    } finally { ctx.restore(); }
  }

  function travel(path, p) {
    const P = path.length > 2 ? path : K.resample(path, 6, false);
    const q = K.along(P, K.clamp(p)), r = K.along(P, Math.min(1, K.clamp(p) + .01)), l = K.along(P, Math.max(0, K.clamp(p) - .01));
    const dx = r[0] - l[0], dy = r[1] - l[1];
    return { x: q[0], y: q[1], f: dx < -.01 ? -1 : 1, heading: Math.atan2(dy, dx), moving: p > 0 && p < 1 };
  }

  const beat = (t, fps) => fps ? Math.floor(t * fps + 1e-6) / fps : t;
  const progress = (t, from, len = 1, ease = true) => { const u = K.clamp((t - from) / len); return ease ? K.ease(u) : u; };

  // a cast member: film.json "cast": {"rider": {"outfit": "rider", "build": "adult", "face": "happy", ...}}
  function cast(ctx, f, name, poseName, x, y, s = 1, fc = 1, o = {}) {
    const def = (f.cast || {})[name] || {}, S = o.S;
    const extra = Object.assign({}, def, o);
    delete extra.S; delete extra.outfit;
    if (S && S.speaker === name && S.talk > .04) extra.mouth = Math.min(1, S.talk * 1.4);
    if (S && extra.t == null) extra.t = S.T;
    return K.props.who(ctx, def.outfit || name, poseName, x, y, s, fc, extra);
  }

  function bind($, ctx, f, ch) {
    $.enter = (kind, p, draw, o) => enter(ctx, kind, p, draw, o);
    $.travel = travel;
    $.beat = beat;
    $.progress = progress;
    $.cast = (name, poseName, x, y, s, fc, o) => cast(ctx, f, name, poseName, x, y, s, fc, o);
  }

  K.motion = { enter, travel, beat, progress, cast, bind };
})();

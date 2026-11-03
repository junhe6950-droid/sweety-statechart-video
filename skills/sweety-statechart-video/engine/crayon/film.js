/* sweety-statechart-video · film.js — film.json in, posters out: normalises the spec, lays out every chapter, works
 * out what each step draws (arrows, cards, dots, the active set), and draws a poster at any moment: the static layer
 * (paper, header, containers, scene background) and the live layer (scene foreground and the chart so far). */
(function () {
  const K = window.SCV, { C, FONT } = K;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  // any W:H; the short side of the frame is 1080 px
  function ratio(a) {
    const m = String(a || '3:4').replace('／', '/').match(/^\s*(\d+(?:\.\d+)?)\s*[:：x×/]\s*(\d+(?:\.\d+)?)\s*$/);
    const r = m ? +m[2] / +m[1] : 4 / 3;
    return Math.max(.4, Math.min(2.5, r || 4 / 3));
  }
  function sizeOf(a) { const r = ratio(a); return r >= 1 ? [1080, Math.round(1080 * r / 2) * 2] : [Math.round(1080 / r / 2) * 2, 1080]; }

  function normalise(spec) {
    const f = JSON.parse(JSON.stringify(spec));
    f.aspect = f.aspect || '3:4';
    f.size = f.size || sizeOf(f.aspect);
    // the poster has the frame's shape when the frame is upright; a wide frame shows a square poster and scrolls over it
    const fr = f.size[1] / f.size[0];
    f.W = 1000; f.H = Math.round(1000 * (f.poster ? ratio(f.poster) : Math.max(1, fr)));
    f.speed = f.speed || (f.voice === 'none' ? 3 : 2);
    // phones show a 1080-wide frame at about 0.37x: an upright frame gets larger card and arrow words
    const upright = fr > 1.1, big = f.text || {};
    f.text = { card: big.card || (upright ? 27 : 23), edge: big.edge || (upright ? 22.5 : 18.5), tag: big.tag || (upright ? 13 : 12) };
    if (K.layout && K.layout.setText) K.layout.setText(f.text);
    f.player = f.player || {};
    f.chapters.forEach((ch, ci) => {
      ch.index = ci; ch.num = ch.num || ROMAN[ci] || String(ci + 1);
      ch.states = ch.states || {};
      const acc = K.theme ? K.theme.accent(ci) : { pins: ['pink'], tint: 'sky' };
      Object.values(ch.states).forEach((st, k) => { if (!st.pin) st.pin = st.kind === 'error' ? 'red' : st.kind === 'final' ? 'green' : acc.pins[k % acc.pins.length]; });
      ch.accent = acc;
      // how the chart is drawn: a card look per state (chapter / film default), thread or pencil-line arrows
      const look = ch.look || f.look;
      Object.values(ch.states).forEach(st => { if (!st.look && look) st.look = look; });
      ch.arrows = ch.arrows || f.arrows || (look === 'ticket-thread' ? 'thread' : 'line');
      Object.values(ch.states).forEach(st => { if (st.look === 'ticket-thread') st.look = 'ticket'; });
      const seen = {};
      ch.edges = (ch.edges || []).map(e => {
        const base = e.from + '>' + e.to; seen[base] = (seen[base] || 0) + 1;
        return { ...e, id: e.id || (seen[base] > 1 ? base + '#' + seen[base] : base), text: K.layout.edgeText(e) };
      });
      if (ch.regions && ch.regions.lanes && ch.regions.lanes.length > 1) {
        // a guard that waits on another region is written in that region's colour (an edge may name it with "waits")
        const lanes = ch.regions.lanes, laneOf = {};
        lanes.forEach(l => l.states.forEach(x => laneOf[x] = l));
        ch.edges.forEach(e => {
          if (!e.if && !e.waits) return;
          const own = laneOf[e.from];
          let dep = e.waits ? lanes.find(l => l.id === e.waits) : null;
          if (!dep) dep = lanes.find(l => l !== own && (l.title && e.if.includes(l.title) || l.states.some(x => ch.states[x] && ch.states[x].label && e.if.includes(ch.states[x].label))));
          if (dep) e.waitsLane = dep.id;
        });
      }
      if (ch.regions) {
        ch.regions.id = ch.regions.id || 'together';
        ch.regions.lanes.forEach((ln, k) => { ln.start = ln.start || ln.states[0]; ln.tint = ln.tint || K.theme && ['sky', 'rose', 'mint', 'straw', 'lilac'][(ch.index + k) % 5]; });
      }
      // no start given: the regions box when no card outside it is a root (nothing points at it), else the first card
      if (!ch.start) {
        const inLane = s => ch.regions && ch.regions.lanes.some(l => l.states.includes(s));
        const outer = Object.keys(ch.states).filter(s => !inLane(s));
        const roots = outer.filter(s => !ch.edges.some(e => e.to === s && e.from !== s));
        ch.start = ch.regions && !roots.length ? ch.regions.id : (roots[0] || Object.keys(ch.states)[0]);
      }
      ch.entry = ci > 0 && !!f.chapters[ci - 1].exit;
      ch.steps = (ch.steps || []).map(s => typeof s === 'string' ? { note: s } : s);
    });
    return f;
  }

  function header(ch, f, g) {
    g.font = `78px ${FONT.type}`; const tw = g.measureText(ch.title || '').width;
    g.font = `italic 21px ${FONT.mono}`; const sw = g.measureText(ch.sub || '').width;
    g.font = `italic 15px ${FONT.mono}`; const vw = g.measureText(ch.tagline || '').width;
    g.font = `18px ${FONT.mono}`; const hw = g.measureText(`${f.series || f.title || ''}  ·  ${ch.num}`).width;
    return { x0: 50, y0: 38, x1: 58 + Math.max(tw, sw, vw, hw) + 6, y1: ch.tagline ? 222 : 198 };
  }

  /* ---------------- what each step does ---------------- */
  function steps(ch, L) {
    const byId = Object.fromEntries(L.edges.map(e => [e.id, e]));
    const laneOf = {}, laneStart = {};
    if (ch.regions) ch.regions.lanes.forEach(ln => { ln.states.forEach(s => laneOf[s] = ln.id); laneStart[ln.id] = ln.start; });
    const inBox = s => !!laneOf[s];
    const resolve = (ref, i) => {
      if (ref === 'start' || ref === 'entry') return ref;
      if (byId[ref]) return ref;
      const hits = L.edges.filter(e => e.id === ref || e.id.startsWith(ref + '#'));
      if (hits.length) return hits[0].id;
      throw new Error(`chapter ${ch.num} step ${i + 1}: no arrow "${ref}" (have: ${L.edges.filter(e => e.kind !== 'start' && e.kind !== 'entry').map(e => e.id).join(', ')})`);
    };
    let config = new Set();
    const out = [];
    const enterBox = (go, dots) => {
      ch.regions.lanes.forEach(ln => {
        config.add(ln.start);
        const se = L.edges.find(e => e.kind === 'start' && e.to === ln.start && e.id.endsWith('@' + ln.id));
        if (se) go.push(se.id);
        dots.push('start:' + ln.id);
      });
    };
    ch.steps.forEach((s, i) => {
      const refs = s.go == null ? [] : Array.isArray(s.go) ? s.go : [s.go];
      const go = [], dots = [], fins = [];
      for (const r0 of refs) {
        const r = resolve(r0, i);
        if (r === 'start' || r === 'entry') {
          const e = L.edges.find(x => x.kind === (ch.entry ? 'entry' : 'start') && (x.to === ch.start || x.from === 'start' || x.from === 'entry') && !x.id.includes('@'));
          if (e) go.push(e.id);
          if (!ch.entry && L.dots.start) dots.push('start');
          if (ch.regions && ch.start === ch.regions.id) enterBox(go, dots); else config.add(ch.start);
          continue;
        }
        const e = byId[r];
        go.push(e.id);
        if (e.kind === 'exit') { config = new Set(); continue; }
        const box = ch.regions && ch.regions.id;
        if (e.from === box) config = new Set([...config].filter(x => !inBox(x)));
        else if (inBox(e.from) && !inBox(e.to) && e.to !== box) config = new Set([...config].filter(x => !inBox(x)));
        else if (inBox(e.from)) config.delete(e.from);
        else config = new Set([...config].filter(x => inBox(x)));     // one card at a time outside the regions
        if (e.to === box) enterBox(go, dots);
        else if (L.dots[e.to] && L.dots[e.to].type === 'end') fins.push(e.to);
        else config.add(e.to);
      }
      const on = s.on ? s.on.slice() : [...config];
      if (s.on) config = new Set(s.on);
      const pass = go.map(id => byId[id]).filter(e => e && L.boxes[e.to]).map(e => e.to);
      out.push({ i, go, on, pass, dots, fins, note: s.note || '', say: s.say, focus: s.focus, trace: !!s.trace, stamp: s.stamp, hold: s.hold, fix: !!s.fix, camera: s.camera, speaker: s.speaker, tone: s.tone });
    });
    // cumulative "seen before this step"
    const seenE = new Set(), seenB = new Set(), seenD = new Set();
    out.forEach(st => {
      st.seenE = new Set(seenE); st.seenB = new Set(seenB); st.seenD = new Set(seenD);
      st.go.forEach(e => seenE.add(e)); st.on.forEach(b => seenB.add(b)); st.pass.forEach(b => seenB.add(b)); st.dots.forEach(d => seenD.add(d)); st.fins.forEach(d => seenD.add(d));
    });
    const done = { i: out.length, go: [], on: [], pass: [], dots: [], fins: [], seenE, seenB, seenD, note: '' };
    return { list: out, done };
  }

  /* ---------------- the rule chapter's red paths ---------------- */
  // every broken rule's shortest path (the checker's rules[i].result, or the single rule's path) as routes, plus the
  // states and arrows on it (they get a red double edge and a pale red wash under the arrow)
  function rulesOf(ch) {
    const list = ch.rules ? ch.rules.slice() : [];
    if (ch.rule && !list.some(r => r === ch.rule)) list.unshift(Object.assign({ result: ch.rule.path ? { holds: false, path: ch.rule.path } : null }, ch.rule));
    return list;
  }
  function tracePath(ch, L) {
    const routes = [], states = new Set(), edges = new Set();
    for (const r of rulesOf(ch)) {
      const path = (r.result && r.result.path) || (r === ch.rule && ch.rule.path);
      if (!path || path.length < 2 || (r.result && r.result.holds)) continue;
      const one = [];
      for (let i = 1; i < path.length; i++) {
        const e = L.edges.find(x => x.from === path[i - 1] && x.to === path[i]);
        if (e) { one.push(e.route); edges.add(e.id); }
      }
      path.forEach(x => states.add(x));
      if (one.length) routes.push(one);
    }
    ch.bug = { states, edges };
    return routes.length === 1 ? routes[0] : routes.flat ? routes.reduce((a, r) => a.concat(r), []) : [];
  }
  function traceRoutes(ch, L) {                     // one polyline list per broken rule
    const out = [];
    for (const r of rulesOf(ch)) {
      const path = (r.result && r.result.path) || (r === ch.rule && ch.rule.path);
      if (!path || path.length < 2 || (r.result && r.result.holds)) continue;
      const one = [];
      for (let i = 1; i < path.length; i++) { const e = L.edges.find(x => x.from === path[i - 1] && x.to === path[i]); if (e) one.push(e.route); }
      if (one.length) out.push(one);
    }
    return out;
  }
  // the legend of a rule chapter: each rule, whether it holds, the red line, and how much the checker looked at
  function legendLines(ch) {
    const rules = rulesOf(ch);
    if (!rules.length || ch.legend === false || (ch.rule && ch.rule.legend === false)) return null;
    const label = id => (ch.states[id] && ch.states[id].label) || id;
    const lines = rules.map(r => ({ text: r.text || (r.never ? `永远不能「${label(r.never)}」` : r.always ? `一直要满足 ${r.always}` : r.stuck === false ? '不会卡住' : ''), holds: r.result ? r.result.holds : null }));
    const checked = ch.checked || (ch.rule && ch.rule.checked) || null;
    return { lines, checked };
  }

  /* ---------------- build ---------------- */
  function build(spec, scenes) {
    if (K.theme) K.theme.apply(spec);
    const f = normalise(spec);
    const g = document.createElement('canvas').getContext('2d');
    const layouts = f.chapters.map(ch => {
      const head = header(ch, f, g);
      const L = K.layout.chapter(ch, f.W, f.H, head);
      L.header = head;
      return L;
    });
    f.chapters.forEach((ch, ci) => { if (ch.exit) K.layout.linkChapters(layouts[ci], layouts[ci + 1], f.H, ch.exit); });
    f.chapters.forEach((ch, ci) => {
      const L = layouts[ci];
      ch.L = L;
      ch.S = steps(ch, L);
      ch.trace = tracePath(ch, L);
      ch.traces = traceRoutes(ch, L);
      L.free = K.layout.freeAreas(L, f.W, f.H, L.header);
      const lg = legendLines(ch);
      if (lg) {                                         // reserve a corner for the legend before scenes see the free areas
        const w = 300, h = 58 + 30 * lg.lines.length + 30 + (lg.checked ? 26 : 0);
        const fits = L.free.filter(r => r.x1 - r.x0 >= w + 10 && r.y1 - r.y0 >= h + 10).sort((a, b) => (a.y0 - a.x1 * .4) - (b.y0 - b.x1 * .4));
        const at = ch.legendAt || (fits[0] ? [fits[0].x1 - w - 6, fits[0].y0 + 6] : null);
        if (at) { L.legend = { x0: at[0], y0: at[1], x1: at[0] + w, y1: at[1] + h, lines: lg.lines, checked: lg.checked }; L.reserved = [L.legend]; L.free = K.layout.freeAreas(L, f.W, f.H, L.header); }
      }
      ch.scene = (scenes && (scenes[ch.id] || scenes[String(ci + 1)] || scenes[ci + 1])) || {};
      // the step that first enters the regions box: the box is drawn on then, not before
      const lanes = ch.regions ? ch.regions.lanes.flatMap(l => l.states) : [];
      ch.boxAt = !ch.regions ? -1 : ch.S.list.findIndex(st => st.dots.some(d => d.startsWith('start:')) || st.on.some(x => lanes.includes(x)) || st.pass.some(x => lanes.includes(x)));
      ch.fixAt = ch.S.list.findIndex(st => st.fix);
    });
    f.warnings = K.theme ? K.theme.audit() : [];
    return f;
  }

  /* ---------------- scene kit ---------------- */
  function kit(ctx, f, ch) {
    const $ = { ctx, C, K, W: f.W, H: f.H, L: ch.L, film: f, chapter: ch };
    for (const [name, fn] of Object.entries(K)) if (typeof fn === 'function' && !/^[A-Z]/.test(name)) $[name] = (...a) => fn(ctx, ...a);
    for (const name of ['seed', 'setBoil', 'rnd', 'pick', 'clamp', 'lerp', 'ease', 'easeInOut', 'backOut', 'prng', 'fnv', 'grain', 'resample', 'wobble', 'ell', 'rect', 'bez', 'qbez', 'smooth', 'rounded', 'capsule', 'bbox', 'path2d', 'move', 'turn', 'flipX', 'lengthOf', 'along', 'charCount', 'toward', 'atDepth', 'revealing', 'within']) $[name] = K[name];
    $.tier = K.TIER;
    $.depth = (level, draw) => K.atDepth(level, draw);
    if (K.motion) K.motion.bind($, ctx, f, ch);
    for (const [name, fn] of Object.entries(K.props || {})) $[name] = (...a) => fn(ctx, ...a);
    $.pose = K.pose;
    $.box = id => ch.L.boxes[id];
    $.dot = (...a) => K.dot(ctx, ...a);
    return $;
  }
  // what a scene's fg sees: S.T (film time, stepped to anim_fps if set), S.t, S.step, S.on(id), S.since(id), S.at(k),
  // S.done, S.talk (narration loudness 0..1 now), S.speaker (who is talking), S.mood (the active state's mood)
  function sceneState(ch, si, t, T, extra = {}) {
    const S = ch.S, list = S.list, cur = si < 0 ? null : (list[si] || S.done);
    const firstOn = id => { for (let k = 0; k <= Math.min(si, list.length - 1); k++) if (list[k].on.includes(id)) return k; return -1; };
    const moodOf = () => { if (!cur) return null; for (const id of cur.on) { const st = ch.states[id]; if (st && st.mood) return st.mood; } return null; };
    return {
      T, t, step: si, steps: list.length, done: si >= list.length,
      on: id => !!cur && cur.on.includes(id),
      seen: id => !!cur && (cur.seenB.has(id) || (cur.on.includes(id))),
      since: id => {                                    // artifact-time since this state last became active (-1 if not active)
        if (!cur || !cur.on.includes(id)) return -1;
        let k = Math.min(si, list.length - 1);
        while (k > 0 && list[k - 1].on.includes(id)) k--;
        return k === si ? t : 99;
      },
      at: k => si < k ? -1 : si === k ? t : 99,          // artifact-time since step k began (99 once past)
      first: firstOn,
      talk: extra.talk || 0, speaker: extra.speaker || (cur && cur.speaker) || null, mood: moodOf(),
    };
  }

  /* ---------------- drawing ---------------- */
  // the cached layer: paper and the scene's static background (header and containers are live: they type and draw on)
  function drawStatic(g, f, ch, boil) {
    K.setBoil(boil);
    K.paper(g, f.W, f.H, ch.index);
    if (ch.scene.bg) { K.setBoil(boil); ch.scene.bg(kit(g, f, ch)); }
  }
  // header and containers at step si, chart-time t: the title types in at the chapter's first step, a regions box is
  // drawn on at the step that first enters it. si === steps.length (or opts.full): everything
  function drawFixed(g, f, ch, si, t, opts = {}) {
    const n = ch.S.list.length, full = opts.full || si >= n || f.player.type_titles === false;
    K.seed('hdr' + ch.index);
    if (full || si >= 0) {
      const tt = full || si > 0 ? 99 : t;
      const title = ch.title || '', typed = K.clamp(tt / .9) * K.charCount(title);
      K.text(g, `${f.series || f.title || ''}  ·  ${ch.num}`, 60, 62, { font: `18px ${FONT.mono}`, color: C.title, alpha: K.clamp(tt / .3) });
      K.text(g, title, 54, 146, { font: `78px ${FONT.type}`, color: C.title, double: true, chars: typed });
      if (ch.sub) K.words(g, ch.sub, 58, 186, { size: 21, alpha: K.clamp((tt - .7) / .4), color: C.title });
      if (ch.tagline) K.text(g, ch.tagline, 58, 212, { font: `italic 15px ${FONT.mono}`, color: C.guard, alpha: K.clamp((tt - .9) / .4) });
    }
    if (ch.L.legend && (full || si >= 0)) {
      const tr = ch.S.list.findIndex(x => x.trace), shown = full || (tr >= 0 ? si > tr || (si === tr && t > 1.4) : si >= 0);
      const fixed = ch.fixAt >= 0 && (full || si > ch.fixAt || (si === ch.fixAt && t > 1.6));
      g.save(); g.globalAlpha *= full || si > 0 ? 1 : K.clamp((t - .6) / .5);
      K.chart.legend(g, ch.L.legend, { shown, fixed });
      g.restore();
    }
    for (const k of ch.L.containers) {
      const at = ch.boxAt;
      const p = full || at < 0 ? 1 : si < at ? 0 : si > at ? 1 : K.clamp(t / .85);
      K.chart.container(g, k, p);
    }
  }
  // when the stamp of a rule chapter lands, in chart-time of its step (camera shake and the stamp sound use it)
  const STAMP_DELAY = 1.2, STAMP_FALL = .35;
  function stampStep(ch) { return ch.S.list.findIndex(x => x.stamp || (x.trace && ch.rule && ch.rule.stamp)); }
  // the chart as of step si at artifact-time t; si === steps.length: everything, nothing active
  function drawChart(g, ch, si, t, T, opts = {}) {
    const { list, done } = ch.S, s = si >= list.length ? done : list[si];
    const L = ch.L, ep = K.ease(K.clamp((t - .15) / .85)), arrived = t > 1.0;
    const fixAt = ch.fixAt, fixed = fixAt >= 0 && si >= fixAt, fixT = si === fixAt ? t : 99;
    const fix = ch.rule && ch.rule.fix;
    for (const [id, d] of Object.entries(L.dots)) {
      const now = s.dots.includes(id), fin = s.fins.includes(id);
      if (!s.seenD.has(id) && !now && !fin) continue;
      const a = fin ? K.clamp((t - 1) / .4) : 1;
      d.type === 'start' ? K.chart.startDot(g, d, { alpha: a }) : K.chart.endDot(g, d, { alpha: a });
    }
    const beads = [], fade = opts.fade && si < list.length;
    const traced = ch.trace.length && (s.trace || si >= list.length || list.slice(0, si).some(x => x.trace));
    const hot = new Set(s.go.concat(L.edges.filter(e => s.on.includes(e.to)).map(e => e.id)));
    for (const e of L.edges) {
      const now = s.go.includes(e.id), seen = s.seenE.has(e.id);
      if (!seen && !now) continue;
      const past = fade && !hot.has(e.id), thread = ch.arrows === 'thread';
      const showBug = ch.bug && ch.bug.edges.has(e.id) && traced;
      if (showBug) K.chart.wash(g, e, seen ? 1 : ep);
      K.chart.arrow(g, e, seen ? 1 : ep, Object.assign(thread ? { color: C.redD, w: 1.8, stop: 7, head: .8 } : ch.arrows === 'pencil' ? { stop: 6 } : {}, past ? { color: C.past, alpha: .7 } : {}));
      const fixHere = fix && fixed && e.id === (fix.edge || '') ? fix.if || fix.when || '' : null;
      const lane = e.waitsLane && ch.regions ? ch.regions.lanes.find(l => l.id === e.waitsLane) : null;
      const STRONG = { sky: 'blue', rose: 'pink', mint: 'teal', straw: 'ochre', lilac: 'violet' };   // a region's tint -> its ink
      const guardColor = lane ? K.toward(K.chart.colour(STRONG[lane.tint] || lane.tint || 'blue'), C.ink, .2) : null;
      if (e.lab) K.chart.edgeWords(g, e, seen ? 1e9 : K.clamp((t - .45) / 1.1) * K.charCount(e.text),
        Object.assign(past ? { alpha: .6 } : {}, guardColor ? { guardColor } : {}, fixHere ? { fix: fixHere, fixChars: K.clamp((fixT - .2) / .9) * (K.charCount(fixHere) + 2) } : {}));
      if (now && !arrived) beads.push(K.along(e.route, ep));
    }
    if (traced) {
      const prog = s.trace ? K.ease(K.clamp(t / 1.6)) : 1;
      const alpha = fixed ? .85 - .6 * K.clamp((fixT - .6) / 1) : .85;   // after the fix the red path fades to a ghost
      (ch.traces && ch.traces.length ? ch.traces : [ch.trace]).forEach((r, k) => K.chart.trace(g, r, prog, ch.index * 10 + k, alpha));
    }
    const never = ch.rule && ch.rule.never;
    for (const [id, b] of Object.entries(L.boxes)) {
      const on = s.on.includes(id), seen = s.seenB.has(id), passing = !on && !seen && s.pass.includes(id);
      if (!seen && !((on || passing) && t > .85)) continue;
      let pop = 1, squash = 0, drop = 1, swing = null;
      const fresh = (on || passing) && !seen;
      if (fresh) {
        const u = K.clamp((t - .85) / .45);
        pop = .6 + .4 * K.backOut(u); squash = u < 1 ? u : 0;
        drop = K.clamp((t - .95) / .3);                 // the pin falls in after the card
        swing = t - 1.25;
      } else if (on) pop = 1 + .05 * Math.sin(K.clamp((t - .9) / .5) * Math.PI);
      const wasOn = si > 0 && si < list.length && list[si - 1].on.includes(id);
      const ring = on && arrived ? (wasOn ? 1 : K.clamp((t - 1.05) / .55)) : 0;
      const bad = id === never && (on || si >= list.length) && !(fixed && fixT > 1.6);
      const lane = b.lane && ch.regions ? ch.regions.lanes.find(l => l.id === b.lane) : null;
      K.chart.ticket(g, b, { active: on && arrived, at: t, pop, squash, drop, swing: swing != null && swing >= 0 ? swing : null, ring, alpha: pop < 1 ? K.clamp((t - .85) / .25) : 1, bad, past: fade && !on && b.kind !== 'final',
        onBug: traced && ch.bug && ch.bug.states.has(id) && !(fixed && fixT > 1.6), tint: (lane && lane.tint) || (ch.states[id] && ch.states[id].tint) });
    }
    for (const q of beads) K.chart.bead(g, q[0], q[1], T);
    const stampAt = stampStep(ch);
    if (stampAt >= 0 && si >= stampAt) {
      const st = list[stampAt], text = st.stamp || ch.rule.stamp;
      const tt = si === stampAt ? t - STAMP_DELAY : 9;
      if (tt > 0) {
        const where = ch.rule && ch.rule.stampAt || stampSpot(ch);
        const k = tt < STAMP_FALL ? 1.6 - .6 * K.backOut(tt / STAMP_FALL) : 1;
        const fadeOut = fixed ? 1 - .55 * K.clamp((fixT - 1.2) / .6) : 1;
        K.chart.stamp(g, where[0], where[1], text, { k, alpha: K.clamp(tt / .15) * fadeOut, land: tt - STAMP_FALL });
      }
    }
    if (fixed && fix && fixT > 1.6) {                   // the fix holds: a green stamp beside the old red one
      const tt = fixT - 1.6, where = fix.stampAt || stampSpot(ch, (ch.rule && ch.rule.stampAt) || stampSpot(ch));
      const k = tt < STAMP_FALL ? 1.6 - .6 * K.backOut(tt / STAMP_FALL) : 1;
      K.chart.stamp(g, where[0], where[1], fix.stamp || '修好了', { k, alpha: K.clamp(tt / .15), land: tt - STAMP_FALL, color: C.ok, angle: .08 });
    }
  }
  // a free spot near the forbidden card for a stamp; `avoid` is a stamp already there (the fix stamp goes elsewhere)
  function stampSpot(ch, avoid) {
    const b = ch.L.boxes[ch.rule && ch.rule.never] || { x: 700, y: 400 };
    const far = r => !avoid || Math.abs(Math.max(r.x0 + 120, Math.min(r.x1 - 120, b.x)) - avoid[0]) > 250 || Math.abs(Math.max(r.y0 + 50, Math.min(r.y1 - 50, b.y)) - avoid[1]) > 90;
    let roomy = (ch.L.free || []).filter(r => r.x1 - r.x0 >= 240 && r.y1 - r.y0 >= 100);
    if (avoid) {                                        // split big areas so a second spot can sit in the same one
      roomy = roomy.flatMap(r => r.y1 - r.y0 >= 220 ? [{ ...r, y1: (r.y0 + r.y1) / 2 }, { ...r, y0: (r.y0 + r.y1) / 2 }] : [r]).filter(far);
      if (!roomy.length) return [avoid[0] + 20, avoid[1] + 86];
    }
    if (!roomy.length) return [Math.min(860, b.x + b.w / 2 + 120), b.y - 50];
    const c = r => [Math.max(r.x0 + 120, Math.min(r.x1 - 120, b.x)), Math.max(r.y0 + 50, Math.min(r.y1 - 50, b.y))];
    roomy.sort((p, q) => { const a = c(p), d = c(q); return Math.hypot(a[0] - b.x, a[1] - b.y) - Math.hypot(d[0] - b.x, d[1] - b.y); });
    return c(roomy[0]);
  }
  // a finished poster: everything drawn, nothing active (posters, the overview, layout sheets)
  function drawPoster(g, f, ch, boil = 0) {
    drawStatic(g, f, ch, boil);
    drawFixed(g, f, ch, ch.S.list.length, 99, { full: true });
    const n = ch.S.list.length;
    if (ch.scene.fg) { K.setBoil(boil); ch.scene.fg(kit(g, f, ch), sceneState(ch, n - 1, 99, 2.0)); }
    K.setBoil(boil);
    drawChart(g, ch, n, 99, 2.0);
  }

  K.film = { normalise, build, drawStatic, drawFixed, drawChart, drawPoster, kit, sceneState, stampStep, STAMP_DELAY, STAMP_FALL, ratio, sizeOf };
})();

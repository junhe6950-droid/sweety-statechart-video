/* sweety-statechart-video · film.js — film.json in, posters out: normalises the spec, lays out every chapter, works
 * out what each step draws (arrows, cards, dots, the active set), and draws a poster at any moment: the static layer
 * (paper, header, containers, scene background) and the live layer (scene foreground and the chart so far). */
(function () {
  const K = window.SCV, { C, FONT } = K;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const ASPECTS = { '3:4': [1080, 1440], '1:1': [1080, 1080], '9:16': [1080, 1920], '4:5': [1080, 1350], '16:9': [1920, 1080] };

  function ratio(a) { const [w, h] = String(a).split(':').map(Number); return h / w; }

  function normalise(spec) {
    const f = JSON.parse(JSON.stringify(spec));
    f.aspect = f.aspect || '3:4';
    f.size = f.size || ASPECTS[f.aspect] || [1080, Math.round(1080 * ratio(f.aspect))];
    f.poster = f.poster || f.aspect;
    f.W = 1000; f.H = Math.round(1000 * ratio(f.poster));
    f.speed = f.speed || (f.voice === 'none' ? 3 : 2);
    f.chapters.forEach((ch, ci) => {
      ch.index = ci; ch.num = ch.num || ROMAN[ci] || String(ci + 1);
      ch.states = ch.states || {};
      const seen = {};
      ch.edges = (ch.edges || []).map(e => {
        const base = e.from + '>' + e.to; seen[base] = (seen[base] || 0) + 1;
        return { ...e, id: e.id || (seen[base] > 1 ? base + '#' + seen[base] : base), text: K.layout.edgeText(e) };
      });
      if (ch.regions) {
        ch.regions.id = ch.regions.id || 'together';
        ch.regions.lanes.forEach(ln => { ln.start = ln.start || ln.states[0]; });
      }
      ch.start = ch.start || (ch.regions && !Object.keys(ch.states).some(s => !ch.regions.lanes.some(l => l.states.includes(s))) ? ch.regions.id : Object.keys(ch.states)[0]);
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
      out.push({ i, go, on, pass, dots, fins, note: s.note || '', say: s.say, focus: s.focus, trace: !!s.trace, stamp: s.stamp, hold: s.hold });
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

  /* ---------------- the rule chapter's red path ---------------- */
  function tracePath(ch, L) {
    const path = ch.rule && ch.rule.path;
    if (!path || path.length < 2) return [];
    const routes = [];
    for (let i = 1; i < path.length; i++) {
      const e = L.edges.find(x => x.from === path[i - 1] && x.to === path[i]);
      if (e) routes.push(e.route);
    }
    return routes;
  }

  /* ---------------- build ---------------- */
  function build(spec, scenes) {
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
      L.free = K.layout.freeAreas(L, f.W, f.H, L.header);
      ch.scene = (scenes && (scenes[ch.id] || scenes[String(ci + 1)] || scenes[ci + 1])) || {};
    });
    return f;
  }

  /* ---------------- scene kit ---------------- */
  function kit(ctx, f, ch) {
    const $ = { ctx, C, K, W: f.W, H: f.H, L: ch.L, film: f, chapter: ch };
    for (const [name, fn] of Object.entries(K)) if (typeof fn === 'function' && !/^[A-Z]/.test(name)) $[name] = (...a) => fn(ctx, ...a);
    for (const name of ['seed', 'setBoil', 'rnd', 'pick', 'clamp', 'lerp', 'ease', 'easeInOut', 'backOut', 'prng', 'fnv', 'grain', 'resample', 'wobble', 'ell', 'rect', 'bez', 'qbez', 'smooth', 'rounded', 'capsule', 'bbox', 'path2d', 'move', 'turn', 'flipX', 'lengthOf', 'along', 'charCount']) $[name] = K[name];
    for (const [name, fn] of Object.entries(K.props || {})) $[name] = (...a) => fn(ctx, ...a);
    $.pose = K.pose;
    $.box = id => ch.L.boxes[id];
    $.dot = (...a) => K.dot(ctx, ...a);
    return $;
  }
  function sceneState(ch, si, t, T) {
    const S = ch.S, list = S.list, cur = si < 0 ? null : (list[si] || S.done);
    const firstOn = id => { for (let k = 0; k <= Math.min(si, list.length - 1); k++) if (list[k].on.includes(id)) return k; return -1; };
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
    };
  }

  /* ---------------- drawing ---------------- */
  function drawStatic(g, f, ch, boil) {
    K.setBoil(boil);
    K.paper(g, f.W, f.H, ch.index);
    K.seed('hdr' + ch.index);
    K.text(g, `${f.series || f.title || ''}  ·  ${ch.num}`, 60, 62, { font: `18px ${FONT.mono}`, color: C.navy });
    K.text(g, ch.title || '', 54, 146, { font: `78px ${FONT.type}`, color: C.navy, double: true });
    if (ch.sub) K.words(g, ch.sub, 58, 186, { size: 21 });
    if (ch.tagline) K.text(g, ch.tagline, 58, 212, { font: `italic 15px ${FONT.mono}`, color: C.red });
    for (const k of ch.L.containers) K.chart.container(g, k);
    if (ch.scene.bg) { K.setBoil(boil); ch.scene.bg(kit(g, f, ch)); }
  }
  // the chart as of step si at artifact-time t; si === steps.length: everything, nothing active
  function drawChart(g, ch, si, t, T) {
    const { list, done } = ch.S, s = si >= list.length ? done : list[si];
    const L = ch.L, ep = K.ease(K.clamp((t - .15) / .85)), arrived = t > 1.0;
    for (const [id, d] of Object.entries(L.dots)) {
      const now = s.dots.includes(id), fin = s.fins.includes(id);
      if (!s.seenD.has(id) && !now && !fin) continue;
      const a = fin ? K.clamp((t - 1) / .4) : 1;
      d.type === 'start' ? K.chart.startDot(g, d, { alpha: a }) : K.chart.endDot(g, d, { alpha: a });
    }
    const beads = [];
    for (const e of L.edges) {
      const now = s.go.includes(e.id), seen = s.seenE.has(e.id);
      if (!seen && !now) continue;
      K.chart.arrow(g, e, seen ? 1 : ep);
      if (e.lab) K.chart.edgeWords(g, e, seen ? 1e9 : K.clamp((t - .45) / 1.1) * K.charCount(e.text));
      if (now && !arrived) beads.push(K.along(e.route, ep));
    }
    if (ch.trace.length && (s.trace || si >= list.length || list.slice(0, si).some(x => x.trace))) {
      const prog = s.trace ? K.ease(K.clamp(t / 1.6)) : 1;
      K.chart.trace(g, ch.trace, prog, ch.index);
    }
    const never = ch.rule && ch.rule.never;
    for (const [id, b] of Object.entries(L.boxes)) {
      const on = s.on.includes(id), seen = s.seenB.has(id), passing = !on && !seen && s.pass.includes(id);
      if (!seen && !((on || passing) && t > .85)) continue;
      let pop = 1;
      if ((on || passing) && !seen) pop = .6 + .4 * K.backOut(K.clamp((t - .85) / .45));
      else if (on) pop = 1 + .05 * Math.sin(K.clamp((t - .9) / .5) * Math.PI);
      K.chart.ticket(g, b, { active: on && arrived, at: t, pop, alpha: pop < 1 ? K.clamp((t - .85) / .25) : 1, bad: id === never && (on || si >= list.length) });
    }
    for (const q of beads) K.chart.bead(g, q[0], q[1], T);
    const stampAt = list.findIndex(x => x.stamp || (x.trace && ch.rule && ch.rule.stamp));
    if (stampAt >= 0 && si >= stampAt) {
      const st = list[stampAt], text = st.stamp || ch.rule.stamp;
      const tt = si === stampAt ? t - 1.2 : 9;
      if (tt > 0) {
        const where = ch.rule && ch.rule.stampAt || stampSpot(ch);
        const k = tt < .35 ? 1.6 - .6 * K.backOut(tt / .35) : 1;
        K.chart.stamp(g, where[0], where[1], text, { k, alpha: K.clamp(tt / .15) });
      }
    }
  }
  function stampSpot(ch) {
    const b = ch.L.boxes[ch.rule && ch.rule.never] || { x: 700, y: 400 };
    const roomy = (ch.L.free || []).filter(r => r.x1 - r.x0 >= 240 && r.y1 - r.y0 >= 100);
    if (!roomy.length) return [Math.min(860, b.x + b.w / 2 + 120), b.y - 50];
    const c = r => [Math.max(r.x0 + 120, Math.min(r.x1 - 120, b.x)), Math.max(r.y0 + 50, Math.min(r.y1 - 50, b.y))];
    roomy.sort((p, q) => { const a = c(p), d = c(q); return Math.hypot(a[0] - b.x, a[1] - b.y) - Math.hypot(d[0] - b.x, d[1] - b.y); });
    return c(roomy[0]);
  }
  function drawLive(g, f, ch, si, t, T, boil) {
    K.setBoil(boil);
    if (ch.scene.fg) ch.scene.fg(kit(g, f, ch), sceneState(ch, si, t, T));
    K.setBoil(boil);
    if (si >= 0) drawChart(g, ch, si, t, T);
  }

  K.film = { normalise, build, drawStatic, drawLive, drawChart, kit, sceneState, ASPECTS };
})();

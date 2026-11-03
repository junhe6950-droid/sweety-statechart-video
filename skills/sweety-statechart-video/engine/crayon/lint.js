/* sweety-statechart-video · lint.js — checks a poster the way a picky art director would, in numbers an agent can act
 * on. For every chapter it draws the scenes alone (no paper, no chart) and the chart alone on transparent canvases
 * and measures:
 *   - overlap: scene ink on cards, arrow words, arrows and the header (which item, how many pixels, where);
 *   - coverage: the poster cut into 40-unit tiles: the share of empty tiles (reference ≈ 34%), of near-solid tiles,
 *     and the empty areas still left (the largest blank rectangles);
 *   - change: whether the scene changes at each step that changes the chart (a step whose pictures never move);
 *   - spill: scene ink beyond the poster's edge;
 *   - people: every figure drawn with who()/cast(): its scale, and feet that almost (but not quite) share a ground line.
 * window.lintReport(opts) returns {chapters: [...], issues: [...]}; scripts/lint.py runs it and prints the result. */
(function () {
  const K = window.SCV;
  const TILE = 40, PAD = 60;

  function canvasFor(f) {
    const c = document.createElement('canvas'); c.width = f.W + 2 * PAD; c.height = f.H + 2 * PAD;
    const g = c.getContext('2d'); g.translate(PAD, PAD);
    return { c, g };
  }
  function alphaOf(c) { return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }
  // heavy ink: opaque and dark or strongly coloured (a white underlay or a pale wash is not heavy)
  const heavyAt = (A, i) => { if (A[i + 3] < 120) return false; const r = A[i], g = A[i + 1], b = A[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx < 150 || (mx - mn) > 120 && mx < 235; };
  const inkAt = (A, w, x, y) => A[((y + PAD) * w + (x + PAD)) * 4 + 3] > 50;

  // scene layer (bg + fg) at a step, late in it; people are recorded while drawing
  function sceneLayer(f, ch, si, people) {
    const { c, g } = canvasFor(f);
    K.setBoil(0);
    const who = K.props.who;
    if (people) K.props.who = (ctx, kind, poseName, x, y, s = 1, fc = 1, extra = {}) => { people.push({ kind, pose: poseName || 'stand', x, y, s }); return who(ctx, kind, poseName, x, y, s, fc, extra); };
    try {
      if (ch.scene.bg) ch.scene.bg(K.film.kit(g, f, ch));
      if (ch.scene.fg) ch.scene.fg(K.film.kit(g, f, ch), K.film.sceneState(ch, si, 3.2, 10 + si * 2.2));
    } finally { K.props.who = who; }
    return c;
  }
  function chartLayer(f, ch) {
    const { c, g } = canvasFor(f);
    K.setBoil(0);
    K.film.drawFixed(g, f, ch, ch.S.list.length, 99, { full: true });
    K.film.drawChart(g, ch, ch.S.list.length, 99, 2.0);
    return c;
  }

  function overlap(f, ch, A, w) {
    const L = ch.L, out = [], r = Math.round;
    const count = (x0, y0, x1, y1) => {
      let n = 0, xs = 0, ys = 0;
      for (let y = Math.max(-PAD, r(y0)); y < Math.min(f.H + PAD, r(y1)); y++) for (let x = Math.max(-PAD, r(x0)); x < Math.min(f.W + PAD, r(x1)); x++) if (inkAt(A, w, x, y)) { n++; xs += x; ys += y; }
      return { n, at: n ? [r(xs / n), r(ys / n)] : null };
    };
    for (const b of Object.values(L.boxes)) {
      const h = b.h || 56, c = count(b.x - b.w / 2 - 3, b.y - h / 2 - 14, b.x + b.w / 2 + 3, b.y + h / 2 + 4), area = (b.w + 6) * (h + 18);
      if (c.n > area * .02) out.push({ kind: 'card', id: b.id, label: b.label, pixels: c.n, share: +(c.n / area).toFixed(3), at: c.at });
    }
    for (const e of L.edges) {
      if (e.lab && e.lab.box) {
        const q = e.lab.box, c = count(q.x0, q.y0, q.x1, q.y1), area = (q.x1 - q.x0) * (q.y1 - q.y0);
        if (c.n > area * .03) out.push({ kind: 'words', id: e.id, text: e.text, pixels: c.n, share: +(c.n / area).toFixed(3), at: c.at });
      }
      let n = 0, at = null;
      const P = K.resample(e.route || e.pts, 6, false);
      for (const p of P) {
        if (p[1] < 0 || p[1] > f.H) continue;
        const c = count(p[0] - 4, p[1] - 4, p[0] + 4, p[1] + 4);
        if (c.n > 12) { n += c.n; at = at || c.at; }
      }
      if (n > 120) out.push({ kind: 'arrow', id: e.id, pixels: n, at });
    }
    const hd = L.header;
    if (hd) { const c = count(hd.x0, hd.y0, hd.x1, hd.y1); if (c.n > 400) out.push({ kind: 'header', pixels: c.n, at: c.at }); }
    return out;
  }

  function coverage(f, A, w, B) {                      // A: scene alpha, B: chart alpha (both padded)
    const cols = Math.floor(f.W / TILE), rows = Math.floor((f.H - 100) / TILE);   // the bottom 100 hide under the strip
    let empty = 0, solid = 0, n = 0;
    const grid = [];
    for (let ty = 0; ty < rows; ty++) {
      const row = [];
      for (let tx = 0; tx < cols; tx++) {
        let ink = 0, heavy = 0;
        for (let y = ty * TILE; y < (ty + 1) * TILE; y += 2) for (let x = tx * TILE; x < (tx + 1) * TILE; x += 2) {
          const i = ((y + PAD) * w + (x + PAD)) * 4;
          if (A[i + 3] > 50 || B[i + 3] > 50) ink++;
          if (heavyAt(A, i)) heavy++;
        }
        const d = ink / (TILE * TILE / 4), hv = heavy / (TILE * TILE / 4);
        n++; if (d < .03) empty++; if (hv > .6) solid++;
        row.push(d < .03 ? 0 : 1);
      }
      grid.push(row);
    }
    // the largest blank rectangles (in tiles), so the fix can say where
    const holes = [];
    const used = grid.map(r => r.map(() => false));
    for (let k = 0; k < 4; k++) {
      let best = null;
      for (let y0 = 0; y0 < rows; y0++) for (let x0 = 0; x0 < cols; x0++) {
        if (grid[y0][x0] || used[y0][x0]) continue;
        let wmax = cols;
        for (let y1 = y0; y1 < rows && !grid[y1][x0] && !used[y1][x0]; y1++) {
          let x1 = x0;
          while (x1 + 1 < cols && x1 + 1 - x0 < wmax && !grid[y1][x1 + 1] && !used[y1][x1 + 1]) x1++;
          wmax = x1 - x0 + 1;
          const a = wmax * (y1 - y0 + 1);
          if (wmax >= 2 && y1 - y0 >= 1 && (!best || a > best.a)) best = { a, x0, y0, x1: x0 + wmax - 1, y1 };
        }
      }
      if (!best || best.a < 6) break;
      for (let y = best.y0; y <= best.y1; y++) for (let x = best.x0; x <= best.x1; x++) used[y][x] = true;
      holes.push({ x0: best.x0 * TILE, y0: best.y0 * TILE, x1: (best.x1 + 1) * TILE, y1: (best.y1 + 1) * TILE });
    }
    return { empty: +(empty / n).toFixed(3), solid: +(solid / n).toFixed(3), holes };
  }

  function spill(f, A, w) {
    let n = 0;
    for (let y = -PAD; y < f.H + PAD; y += 2) for (let x = -PAD; x < f.W + PAD; x += 2) {
      if (x >= 0 && x < f.W && y >= 0 && y < f.H) continue;
      if (inkAt(A, w, x, y)) n++;
    }
    return n * 4;
  }

  function changes(f, ch) {                            // does the picture move when the chart does?
    const list = ch.S.list, still = [];
    let prev = null;
    list.forEach((st, si) => {
      const c = sceneLayer(f, ch, si), A = alphaOf(c);
      if (prev) {
        let d = 0;
        for (let i = 3; i < A.length; i += 16) if (Math.abs(A[i] - prev[i]) > 60) d++;
        const changed = d / (A.length / 16);
        const chartMoves = st.go.length || (list[si - 1] && st.on.join() !== list[si - 1].on.join());
        if (chartMoves && changed < .0015) still.push({ step: si + 1, note: st.note, change: +changed.toFixed(4) });
      }
      prev = A;
    });
    return still;
  }

  function people(list) {
    const out = [];
    for (const p of list) if (p.s < .55 || p.s > 1.6) out.push({ kind: 'scale', who: p.kind, at: [Math.round(p.x), Math.round(p.y)], s: p.s });
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], dy = Math.abs(a.y - b.y);
      if (Math.abs(a.x - b.x) < 260 && dy > 4 && dy < 26 && a.pose !== 'sit' && b.pose !== 'sit' && a.pose !== 'ride' && b.pose !== 'ride')
        out.push({ kind: 'ground', who: [a.kind, b.kind], at: [[Math.round(a.x), Math.round(a.y)], [Math.round(b.x), Math.round(b.y)]], dy: Math.round(dy) });
    }
    return out;
  }

  function lintReport(opts = {}) {
    const f = window.__film, issues = [];
    const chapters = f.chapters.map((ch, ci) => {
      const ppl = [];
      const S = sceneLayer(f, ch, ch.S.list.length - 1, ppl), A = alphaOf(S), w = S.width;
      const B = alphaOf(chartLayer(f, ch));
      const ov = overlap(f, ch, A, w), cov = coverage(f, A, w, B), sp = spill(f, A, w);
      const still = opts.steps === false ? [] : changes(f, ch), pp = people(ppl);
      const num = ch.num;
      ov.forEach(o => issues.push({ chapter: num, kind: 'overlap', what: o.kind, id: o.id || null, at: o.at, detail: o,
        fix: o.kind === 'card' ? `move the picture near (${o.at}) off card ${o.id}` : o.kind === 'words' ? `keep pictures off the words of ${o.id} (${o.text})` : o.kind === 'arrow' ? `a picture crosses arrow ${o.id} near (${o.at})` : `keep pictures out of the header` }));
      // a dense crayon poster leaves at most 38% blank (the reference measures 34%); an airy pen-and-pencil one about
      // half (statechart-art's boba plates measure 24–50%)
      const limit = K.theme && K.theme.current && K.theme.current.airy ? .55 : .38;
      if (cov.empty > limit) issues.push({ chapter: num, kind: 'empty', share: cov.empty, holes: cov.holes, fix: `${Math.round(cov.empty * 100)}% of the poster is blank paper (aim ≤ ${Math.round(limit * 100)}%): fill ${cov.holes.slice(0, 3).map(h => `[${h.x0},${h.y0}–${h.x1},${h.y1}]`).join(' ')}` });
      if (cov.solid > .08) issues.push({ chapter: num, kind: 'heavy', share: cov.solid, fix: `${Math.round(cov.solid * 100)}% of tiles are heavy dark or saturated blocks (aim ≤ 8%): open up the hatching, lighten big solid fills` });
      if (sp > 1500) issues.push({ chapter: num, kind: 'spill', pixels: sp, fix: 'scene ink beyond the poster edge: pull it inside (bleeding off an edge on purpose is fine for big set pieces)' });
      still.forEach(s => issues.push({ chapter: num, kind: 'still', step: s.step, fix: `step ${num}.${s.step} (${s.note}): the pictures do not change; make the active state show (S.on / S.since)` }));
      pp.forEach(p => issues.push({ chapter: num, kind: 'people', detail: p, fix: p.kind === 'scale' ? `${p.who} at (${p.at}) has scale ${p.s} (people 0.7–0.9, a hero up to 1.5)` : `${p.who.join(' and ')} stand ${p.dy} apart vertically: put their feet on one ground line` }));
      return { num, title: ch.title, overlap: ov, coverage: cov, spill: sp, still, people: ppl.length };
    });
    (f.warnings || []).forEach(wn => issues.push({ chapter: null, kind: 'theme', fix: wn }));
    f.chapters.forEach(ch => Object.entries(ch.states).forEach(([id, st]) => {
      if (st.kind === 'error' && /green|teal|mint|leaf/.test(String(st.pin))) issues.push({ chapter: ch.num, kind: 'colour', fix: `${id} is an error state with a ${st.pin} pin: errors are red` });
      if (st.kind === 'final' && /^(red|redD)$/.test(String(st.pin))) issues.push({ chapter: ch.num, kind: 'colour', fix: `${id} is a final state with a ${st.pin} pin: red and pink mean danger and "now"` });
    }));
    return { chapters, issues };
  }

  K.lint = { lintReport };
  window.lintReport = lintReport;
})();

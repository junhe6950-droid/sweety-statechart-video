/* sweety-statechart-video · layout.js — places a chapter's chart on its poster the way the reference page sets it:
 * a column of tickets right of the header, branches split left/right with elbow arrows, self-loops and short
 * excursions on the side, long way-backs on an outer lane, words beside the arrows, regions side by side in a
 * container. Ranks by longest path, columns by splitting branches, arrows by scoring orthogonal candidates
 * (obstacles, crossings, overlaps, length, bends), words by scoring spots around each arrow.
 * Output geometry is in poster units (1000 wide). */
(function () {
  const K = window.SCV, { FONT } = K, TH = 56;
  const GAP = 84, LANE = 26, END_SIDE = 52;
  const SIZE = { label: 18.5 };
  let ctx = null;
  const g2d = () => ctx || (ctx = document.createElement('canvas').getContext('2d'));

  /* ---------------- text ---------------- */
  function boxWidth(st) {
    const c = g2d();
    c.font = `23px ${FONT.type}`; const lw = c.measureText(st.label || st.id).width;
    c.font = `italic 12px ${FONT.mono}`; const tw = c.measureText(st.tag || '').width;
    return Math.round(Math.min(300, Math.max(st.w || 0, 150, lw + 54, tw + 30)));
  }
  const cjk = s => /[　-鿿＀-￯]/.test(s);
  function wrapLine(s, max) {                        // break a long line at a natural place
    const chars = Array.from(s);
    const limit = cjk(s) ? max : max * 1.8;
    if (chars.length <= limit) return [s];
    const mid = chars.length / 2;
    let best = -1, bd = 1e9;
    chars.forEach((ch, i) => { if (i > 1 && i < chars.length - 1 && /[，、,；; ]/.test(ch) && Math.abs(i - mid) < bd) { best = i; bd = Math.abs(i - mid); } });
    if (best < 0) best = Math.ceil(mid);
    const a = chars.slice(0, best + (/[，、,；;]/.test(chars[best]) ? 1 : 0)).join('').trim(), b = chars.slice(best + (/[，、,；;]/.test(chars[best]) ? 1 : 0)).join('').trim();
    return [a, b];
  }
  function edgeText(e) {
    if (e.text != null) return e.text;
    const g = e.if ? `[${e.if}]` : '', l = e.label || '';
    let s;
    if (!g) s = l; else if (!l) s = g;
    else s = (Array.from(g + l).length > 9 || l.includes('\n')) ? g + '\n' + l : g + ' ' + l;
    return s.split('\n').flatMap(x => wrapLine(x, 9)).join('\n');
  }

  /* ---------------- geometry helpers ---------------- */
  const R = (x0, y0, x1, y1) => ({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) });
  const grow = (r, d) => ({ x0: r.x0 - d, y0: r.y0 - d, x1: r.x1 + d, y1: r.y1 + d });
  const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const segs = pts => { const s = []; for (let i = 1; i < pts.length; i++) s.push([pts[i - 1], pts[i]]); return s; };
  const segRect = ([a, b]) => R(a[0], a[1], b[0], b[1]);
  function segHits(sg, r) { const s = segRect(sg); return s.x0 <= r.x1 && s.x1 >= r.x0 && s.y0 <= r.y1 && s.y1 >= r.y0; }
  function cross(s1, s2) {                            // perpendicular crossing of two orthogonal segments
    const h1 = Math.abs(s1[0][1] - s1[1][1]) < .5, h2 = Math.abs(s2[0][1] - s2[1][1]) < .5;
    if (h1 === h2) return false;
    const [H, V] = h1 ? [s1, s2] : [s2, s1];
    const hx0 = Math.min(H[0][0], H[1][0]), hx1 = Math.max(H[0][0], H[1][0]), vy0 = Math.min(V[0][1], V[1][1]), vy1 = Math.max(V[0][1], V[1][1]);
    const x = V[0][0], y = H[0][1];
    return x > hx0 + 1 && x < hx1 - 1 && y > vy0 + 1 && y < vy1 - 1;
  }
  function overlap(s1, s2) {                          // parallel and on top of each other
    const h1 = Math.abs(s1[0][1] - s1[1][1]) < .5, h2 = Math.abs(s2[0][1] - s2[1][1]) < .5;
    if (h1 !== h2) return 0;
    const k = h1 ? 1 : 0, j = 1 - k;
    if (Math.abs(s1[0][k] - s2[0][k]) > 7) return 0;
    const a0 = Math.min(s1[0][j], s1[1][j]), a1 = Math.max(s1[0][j], s1[1][j]), b0 = Math.min(s2[0][j], s2[1][j]), b1 = Math.max(s2[0][j], s2[1][j]);
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  }
  const lenOf = pts => segs(pts).reduce((a, [p, q]) => a + Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]), 0);

  /* ---------------- ranks and columns ---------------- */
  function arrange(ids, edges, starts, items, opts = {}) {
    const inside = new Set(ids), out = {};
    ids.forEach(i => out[i] = []);
    edges.forEach(e => { if (inside.has(e.from) && inside.has(e.to)) out[e.from].push(e.to); });
    const mark = {}, back = new Set(), post = [];
    const dfs = v => { mark[v] = 1; for (const w of out[v]) { if (w === v) continue; if (mark[w] === 1) back.add(v + '>' + w); else if (!mark[w]) dfs(w); } mark[v] = 2; post.push(v); };
    starts.filter(s => inside.has(s)).forEach(s => { if (!mark[s]) dfs(s); });
    ids.forEach(v => { if (!mark[v]) dfs(v); });
    const fwd = edges.filter(e => inside.has(e.from) && inside.has(e.to) && e.from !== e.to && !back.has(e.from + '>' + e.to));
    const topo = post.slice().reverse(), rank = {};
    topo.forEach(v => rank[v] = 0);
    for (const v of topo) for (const e of fwd) if (e.from === v) rank[e.to] = Math.max(rank[e.to], rank[v] + 1);
    // excursions: one way in, only ways back out -> beside the node they come from, half a row up when they go back up
    const side = {};
    for (const v of ids) {
      if (starts.includes(v) || items[v].kind === 'end') continue;
      const ins = fwd.filter(e => e.to === v), fo = fwd.filter(e => e.from === v);
      const bo = edges.filter(e => e.from === v && e.to !== v && back.has(v + '>' + e.to));
      if (opts.side !== false && ins.length === 1 && !fo.length && bo.length) {
        const a = ins[0].from, top = Math.min(...bo.map(e => rank[e.to]));
        side[v] = a; rank[v] = top < rank[a] ? (rank[a] + top) / 2 : rank[a];
      }
    }
    // a single end dot sits to the right of the state that ends
    for (const v of ids) {
      if (items[v].kind !== 'end') continue;
      const ins = fwd.filter(e => e.to === v);
      if (ins.length === 1) { side[v] = ins[0].from; rank[v] = rank[ins[0].from]; items[v].endSide = true; }
    }
    const kids = {};
    ids.forEach(v => kids[v] = [...new Set(fwd.filter(e => e.from === v && !side[e.to]).map(e => e.to))]);
    const col = {};
    let roots = 0;
    for (const v of topo) {
      if (side[v]) continue;
      const ps = fwd.filter(e => e.to === v && !side[e.from]).map(e => e.from).filter(p => col[p] != null);
      if (!ps.length) { col[v] = roots === 0 ? 0 : roots; roots++; continue; }
      const c = ps.map(p => col[p] + (kids[p].indexOf(v) - (kids[p].length - 1) / 2));
      col[v] = c.reduce((a, b) => a + b, 0) / c.length;
    }
    for (const v of ids) if (side[v]) col[v] = (col[side[v]] ?? 0) + (items[v].endSide ? 0 : ((col[side[v]] ?? 0) < -.01 ? -1 : 1));
    for (const v of ids) { const h = items[v].at; if (h) { if (h[0] != null) col[v] = h[0]; if (h[1] != null) rank[v] = h[1]; } }
    return { rank, col, back, side };
  }

  function place(ids, edges, starts, items, opts = {}) {
    const { rank, col, back, side } = arrange(ids, edges, starts, items, opts);
    const maxW = Math.max(150, ...ids.filter(i => items[i].kind === 'box').map(i => items[i].w));
    const COL = Math.max(opts.narrow ? 200 : 250, maxW + (opts.narrow ? 40 : 60));
    const whole = [...new Set(ids.map(i => Math.floor(rank[i])))].sort((a, b) => a - b);
    const hOf = r => Math.max(TH, ...ids.filter(i => Math.floor(rank[i]) === r && rank[i] === r).map(i => items[i].h));
    const yOf = {};
    let y = 0, prev = null;
    for (const r of whole) {
      const h = hOf(r);
      y = prev == null ? h / 2 : y + prev / 2 + (opts.gap || GAP) + h / 2;
      yOf[r] = y; prev = h;
    }
    const at = r => { const f = Math.floor(r); if (r === f) return yOf[f]; const nx = whole.find(w => w > f); return nx == null ? yOf[f] + (r - f) * 140 : yOf[f] + (yOf[nx] - yOf[f]) * (r - f); };
    ids.forEach(i => { const it = items[i]; it.x = col[i] * COL; it.y = at(rank[i]); it.rank = rank[i]; });
    ids.forEach(i => { const it = items[i]; if (it.endSide) { const s = items[side[i]]; it.x = s.x + s.w / 2 + END_SIDE; it.y = s.y; } });
    // a card beside its neighbour leaves room for the words on the arrows between them
    ids.forEach(i => {
      const it = items[i], a = items[side[i]];
      if (!a || it.endSide || Math.abs(it.y - a.y) > 30) return;
      const words = edges.filter(e => (e.from === i && e.to === a.id) || (e.from === a.id && e.to === i)).map(e => e.text ? Math.max(...e.text.split('\n').map(l => K.measureWords(g2d(), l, SIZE.label).w)) : 0);
      const need = (a.w + it.w) / 2 + Math.max(60, ...words) + 40, dir = it.x >= a.x ? 1 : -1;
      if (Math.abs(it.x - a.x) < need) it.x = a.x + dir * need;
    });
    // push apart anything that overlaps
    for (let it = 0; it < 30; it++) {
      let moved = false;
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
        const A = items[ids[a]], B = items[ids[b]];
        if (Math.abs(A.y - B.y) >= (A.h + B.h) / 2 + 26) continue;
        const need = (A.w + B.w) / 2 + (A.kind === 'end' || B.kind === 'end' ? 24 : 48) - Math.abs(A.x - B.x);
        if (need <= .5) continue;
        const [L, Rr] = A.x < B.x || (A.x === B.x && !side[ids[b]]) ? [A, B] : [B, A];
        if (side[Rr.id] && !side[L.id]) Rr.x += need; else if (side[L.id] && !side[Rr.id]) L.x -= need; else { L.x -= need / 2; Rr.x += need / 2; }
        moved = true;
      }
      if (!moved) break;
    }
    return { back, rank, side };
  }

  /* ---------------- ports and arrows ---------------- */
  function port(n, sideName, off, role) {
    const inn = role === 'in';
    if (n.kind === 'box') {
      if (sideName === 'top') return [n.x + off, n.y - n.h / 2 - (inn ? 11 : 2)];
      if (sideName === 'bottom') return [n.x + off, n.y + n.h / 2 + (inn ? 8 : 6)];
      if (sideName === 'left') return [n.x - n.w / 2 - (inn ? 4 : 1.5), n.y + off];
      return [n.x + n.w / 2 + (inn ? 4 : 1.5), n.y + off];
    }
    if (n.kind === 'container') {
      if (sideName === 'top') return [n.x + off, n.y - n.h / 2 - (inn ? 2 : 0)];
      if (sideName === 'bottom') return [n.x + off, n.y + n.h / 2 + (inn ? 8 : 0)];
      if (sideName === 'left') return [n.x - n.w / 2 - (inn ? 4 : 0), n.y + off];
      return [n.x + n.w / 2 + (inn ? 4 : 0), n.y + off];
    }
    const r = n.h / 2;                                  // start / end dots
    if (sideName === 'top') return [n.x + off, n.y - r - (inn ? 5 : 0)];
    if (sideName === 'bottom') return [n.x + off, n.y + r + (inn ? 5 : 1)];
    if (sideName === 'left') return [n.x - r - (inn ? 5 : 0), n.y + off];
    return [n.x + r + (inn ? 5 : 0), n.y + off];
  }
  const nodeRect = n => R(n.x - n.w / 2, n.y - n.h / 2 - (n.kind === 'box' ? 9 : 0), n.x + n.w / 2, n.y + n.h / 2 + (n.kind === 'box' ? 4 : 0));

  function candidates(e, S, T, rects) {
    const off = (who, side) => ((e.offs && e.offs[who] && e.offs[who][side]) || 0);
    const P = (n, side, role) => port(n, side, off(n === S ? 's' : 't', side), role);
    const c = [];
    if (S === T) {
      const a = P(S, 'right', 'out'), b = P(S, 'right', 'in');
      const ya = S.y - 10, yb = S.y + 13, x = S.x + S.w / 2 + 39;
      c.push({ type: 'loop', ss: 'right', ts: 'right', bias: 0, pts: [[a[0], ya], [x, ya], [x, yb], [b[0], yb]] });
      const ax = S.x - S.w / 2 - 39;
      c.push({ type: 'loop', ss: 'left', ts: 'left', bias: 60, pts: [[S.x - S.w / 2 - 1.5, ya], [ax, ya], [ax, yb], [S.x - S.w / 2 - 4, yb]] });
      return c;
    }
    const sR = nodeRect(S), tR = nodeRect(T), dx = T.x - S.x;
    const below = tR.y0 > sR.y1 + 14, above = tR.y1 < sR.y0 - 14;
    if (below) {
      const a = P(S, 'bottom', 'out'), b = P(T, 'top', 'in');
      if (Math.abs(a[0] - b[0]) < 3) c.push({ type: 'V', ss: 'bottom', ts: 'top', bias: 0, pts: [a, [a[0], b[1]]] });
      else {
        const ym = Math.min(a[1] + 29, (a[1] + b[1]) / 2);
        c.push({ type: 'Z', ss: 'bottom', ts: 'top', bias: 0, pts: [a, [a[0], ym], [b[0], ym], b] });
        const ym2 = Math.max(b[1] - 29, (a[1] + b[1]) / 2);
        if (ym2 - ym > 20) c.push({ type: 'Z', ss: 'bottom', ts: 'top', bias: 30, pts: [a, [a[0], ym2], [b[0], ym2], b] });
      }
      if (Math.abs(dx) > T.w / 2 + 14) { const ts = dx > 0 ? 'left' : 'right', b2 = P(T, ts, 'in'); c.push({ type: 'Ld', ss: 'bottom', ts, bias: 75, pts: [a, [a[0], b2[1]], b2] }); }
      if (Math.abs(dx) > S.w / 2 + 14) { const ss = dx > 0 ? 'right' : 'left', a2 = P(S, ss, 'out'); c.push({ type: 'Ls', ss, ts: 'top', bias: 110, pts: [a2, [b[0], a2[1]], b] }); }
    }
    if (above) {
      const a = P(S, 'top', 'out'), b = P(T, 'bottom', 'in');
      if (Math.abs(a[0] - b[0]) < 3) c.push({ type: 'V', ss: 'top', ts: 'bottom', bias: 60, pts: [a, [a[0], b[1]]] });
      else c.push({ type: 'Z', ss: 'top', ts: 'bottom', bias: 90, pts: [a, [a[0], (a[1] + b[1]) / 2], [b[0], (a[1] + b[1]) / 2], b] });
      if (Math.abs(dx) > T.w / 2 + 14) { const ts = dx > 0 ? 'left' : 'right', b2 = P(T, ts, 'in'); c.push({ type: 'Lu', ss: 'top', ts, bias: 40, pts: [a, [a[0], b2[1]], b2] }); }
      if (Math.abs(dx) > S.w / 2 + 14) { const ss = dx > 0 ? 'right' : 'left', a2 = P(S, ss, 'out'); c.push({ type: 'Lsu', ss, ts: 'bottom', bias: 40, pts: [a2, [b[0], a2[1]], b] }); }
    }
    if (!below && !above && Math.abs(dx) > (S.w + T.w) / 2 + 8) {
      const ss = dx > 0 ? 'right' : 'left', ts = dx > 0 ? 'left' : 'right', a = P(S, ss, 'out'), b = P(T, ts, 'in');
      if (Math.abs(a[1] - b[1]) < 3) c.push({ type: 'H', ss, ts, bias: 0, pts: [a, [b[0], a[1]]] });
      else { const xm = (a[0] + b[0]) / 2; c.push({ type: 'Zh', ss, ts, bias: 20, pts: [a, [xm, a[1]], [xm, b[1]], b] }); }
    }
    for (const side of ['right', 'left']) {
      const a = P(S, side, 'out'), b = P(T, side, 'in');
      const y0 = Math.min(a[1], b[1]) - 30, y1 = Math.max(a[1], b[1]) + 30;
      const span = rects.filter(r => r.y1 > y0 && r.y0 < y1);
      const edge = side === 'right' ? Math.max(a[0], b[0], ...span.map(r => r.x1)) : Math.min(a[0], b[0], ...span.map(r => r.x0));
      for (let k = 0; k < 4; k++) {
        const lx = side === 'right' ? edge + 34 + LANE * k : edge - 34 - LANE * k;
        c.push({ type: 'lane', ss: side, ts: side, bias: 260 + 40 * k + (side === 'left' ? 30 : 0), pts: [a, [lx, a[1]], [lx, b[1]], b] });
      }
    }
    return c;
  }

  function scoreRoute(pts, e, S, T, env) {
    let sc = 0;
    const own = new Set([S.id, T.id, ...(S.parent ? [S.parent] : []), ...(T.parent ? [T.parent] : [])]);
    for (const sg of segs(pts)) {
      for (const n of env.nodes) {
        if (own.has(n.id)) continue;
        if (n.kind === 'container') { if (segHits(sg, R(n.x - n.w / 2, n.y - n.h / 2, n.x + n.w / 2, n.y + n.h / 2))) sc += 6000; continue; }
        if (segHits(sg, grow(nodeRect(n), 5))) sc += 6000;
      }
      for (const r of env.blocks) if (segHits(sg, r)) sc += 6000;
      const sr = segRect(sg);
      if (sr.x0 < env.bounds.x0 || sr.x1 > env.bounds.x1) sc += 6000;
      for (const other of env.routes) for (const os of segs(other)) { if (cross(sg, os)) sc += 350; sc += overlap(sg, os) * 60; }
    }
    return sc + lenOf(pts) * .4 + (pts.length - 2) * 50;
  }

  function routeAll(edgeList, env, items) {
    // reciprocal pairs stacked in one column run side by side, down on the left, up on the right
    for (const e of edgeList) {
      const S = items[e.from], T = items[e.to];
      if (S === T || S.kind !== 'box' || T.kind !== 'box' || Math.abs(S.x - T.x) > 3) continue;
      const twin = edgeList.find(f => f.from === e.to && f.to === e.from);
      if (!twin) continue;
      const d = Math.min(36, S.w * .23);
      const down = T.y > S.y ? e : twin, up = down === e ? twin : e;
      down.offs = { s: { bottom: -d }, t: { top: -d } }; down.fixed = true;
      up.offs = { s: { top: d }, t: { bottom: d } }; up.fixed = true;
    }
    const order = edgeList.slice().sort((a, b) => {
      const w = e => { const S = items[e.from], T = items[e.to]; return (T.y < S.y - 10 ? 2000 : 0) + (S === T ? 500 : 0) + Math.abs(T.y - S.y) + Math.abs(T.x - S.x); };
      return w(a) - w(b);
    });
    for (let pass = 0; pass < 2; pass++) {
      env.routes = [];
      for (const e of order) {
        const S = items[e.from], T = items[e.to];
        const rects = env.nodes.filter(n => n.kind !== 'container' || (n.id !== S.parent && n.id !== T.parent)).map(nodeRect);
        let best = null;
        for (const c of candidates(e, S, T, rects)) {
          const s = scoreRoute(c.pts, e, S, T, env) + c.bias;
          if (!best || s < best.s) best = { ...c, s };
        }
        e.pts = best.pts; e.ss = best.ss; e.ts = best.ts; e.kind = best.type; e.penalty = best.s;
        env.routes.push(best.pts);
      }
      if (pass === 0) spreadPorts(order, items);
    }
  }
  function spreadPorts(edgeList, items) {
    const ends = {};
    for (const e of edgeList) {
      if (e.fixed || e.from === e.to) continue;
      const S = items[e.from], T = items[e.to];
      const k1 = S.id + ':' + e.ss, k2 = T.id + ':' + e.ts;
      const n = e.pts.length;
      (ends[k1] = ends[k1] || []).push({ e, who: 's', node: S, side: e.ss, far: e.pts[Math.min(1, n - 1)], to: e.pts[n - 1] });
      (ends[k2] = ends[k2] || []).push({ e, who: 't', node: T, side: e.ts, far: e.pts[Math.max(0, n - 2)], to: e.pts[0] });
    }
    for (const list of Object.values(ends)) {
      const node = list[0].node, side = list[0].side, horiz = side === 'top' || side === 'bottom';
      if (list.length < 2 || node.kind !== 'box') { list.forEach(it => { it.e.offs = it.e.offs || { s: {}, t: {} }; it.e.offs[it.who] = it.e.offs[it.who] || {}; it.e.offs[it.who][side] = 0; }); continue; }
      list.sort((a, b) => horiz ? (a.to[0] - b.to[0]) || (a.far[0] - b.far[0]) : (a.to[1] - b.to[1]) || (a.far[1] - b.far[1]));
      const span = horiz ? Math.min(38, node.w * .22) * (list.length > 2 ? 1.3 : 1) : 12;
      list.forEach((it, i) => {
        const o = list.length === 1 ? 0 : -span + 2 * span * i / (list.length - 1);
        it.e.offs = it.e.offs || { s: {}, t: {} }; it.e.offs[it.who] = it.e.offs[it.who] || {};
        it.e.offs[it.who][side] = side === 'left' || side === 'right' ? (i === 0 ? -10 : i === list.length - 1 ? 13 : 0) + (list.length > 2 ? 0 : 0) : o;
      });
    }
  }

  /* ---------------- edge words ---------------- */
  function placeWords(e, env, size = SIZE.label) {
    if (!e.text) return;
    const m = K.measureWords(g2d(), e.text, size), lh = size * 1.22, asc = size * .8;
    const cands = [];
    const box = (x, top, align) => {
      const x0 = align === 'left' ? x : align === 'right' ? x - m.w : x - m.w / 2;
      return R(x0 - 2, top - 2, x0 + m.w + 2, top + m.h + 3);
    };
    segs(e.pts).forEach(([p, q], i) => {
      const vertical = Math.abs(p[0] - q[0]) < .5, len = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
      if (len < 18) return;
      const pref = (i === 0 ? 0 : 25) + (len < 40 ? 40 : 0);
      if (vertical) {
        const x = p[0], ya = Math.min(p[1], q[1]), yb = Math.max(p[1], q[1]);
        for (const f of [.5, .3, .7, .15, .85]) {
          const yc = ya + (yb - ya) * f, top = yc - m.h / 2;
          cands.push({ x: x + 14, y: top + asc, align: 'left', r: box(x + 14, top, 'left'), bias: pref + Math.abs(f - .5) * 40, mid: [x, yc] });
          cands.push({ x: x - 14, y: top + asc, align: 'right', r: box(x - 14, top, 'right'), bias: pref + 15 + Math.abs(f - .5) * 40, mid: [x, yc] });
        }
      } else {
        const y = p[1], dir = Math.sign(q[0] - p[0]);
        const spots = [[p[0] + dir * 14, dir > 0 ? 'left' : 'right', 0], [(p[0] + q[0]) / 2, 'center', 10], [q[0] - dir * 14, dir > 0 ? 'right' : 'left', 20]];
        for (const [x, align, b] of spots) {
          const topA = y - 9 - (m.lines - 1) * lh - asc, topB = y + 9;
          cands.push({ x, y: topA + asc, align, r: box(x, topA, align), bias: pref + b, mid: [x, y] });
          cands.push({ x, y: topB + asc, align, r: box(x, topB, align), bias: pref + b + 12, mid: [x, y] });
        }
      }
    });
    let best = null;
    for (const c of cands) {
      let s = c.bias;
      for (const n of env.nodes) {
        if (n.kind === 'container') {
          const wall = R(n.x - n.w / 2, n.y - n.h / 2, n.x + n.w / 2, n.y + n.h / 2);
          const inside = c.r.x0 >= wall.x0 && c.r.x1 <= wall.x1 && c.r.y0 >= wall.y0 && c.r.y1 <= wall.y1;
          if (hit(c.r, wall) && !inside) s += 3000;
          else if (inside && !e.within) s += 3000;
          continue;
        }
        if (hit(c.r, grow(nodeRect(n), 3))) s += 6000;
      }
      for (const r of env.blocks) if (hit(c.r, r)) s += 6000;
      for (const r of env.labels) if (hit(c.r, grow(r, 3))) s += 6000;
      if (e.region && !(c.r.x0 >= e.region.x0 && c.r.x1 <= e.region.x1 && c.r.y0 >= e.region.y0 && c.r.y1 <= e.region.y1)) s += 2500;
      for (const rt of env.allRoutes) for (const sg of segs(rt)) if (segHits(sg, c.r)) s += 900;
      if (c.r.x0 < env.bounds.x0 || c.r.x1 > env.bounds.x1 || c.r.y0 < env.bounds.y0 || c.r.y1 > env.bounds.y1) s += 6000;
      if (!best || s < best.s) best = { ...c, s };
    }
    if (!best) return;
    e.lab = { x: best.x, y: best.y, align: best.align, size, box: best.r, penalty: best.s };
    env.labels.push(best.r);
  }

  /* ---------------- one graph (top level or a lane) ---------------- */
  function graph(ids, edgeList, starts, items, opts) {
    return place(ids, edgeList, starts, items, opts);
  }

  /* ---------------- a chapter ---------------- */
  // chapter: normalised by film.js: {states:{id:{label,tag,pin,at}}, edges:[{id,from,to,text,...}], start, regions?, entry?}
  function chapter(ch, W, H, header) {
    const items = {};
    const GAPV = Math.round(GAP + Math.max(0, H - 1000) * .06);
    const box = (id, st) => ({ id, kind: 'box', label: st.label || id, tag: st.tag, pin: st.pin, w: boxWidth(st), h: TH, at: st.at, size: st.size });
    for (const [id, st] of Object.entries(ch.states)) items[id] = box(id, st);
    for (const e of ch.edges) if (e.to === 'end' || /^end\d*$/.test(e.to)) items[e.to] = items[e.to] || { id: e.to, kind: 'end', w: 30, h: 30 };
    const container = ch.regions ? ch.regions.id : null;
    const laneOf = {};
    let K0 = null;
    if (ch.regions) {
      // lay out every lane on its own, then line them up inside the container
      const laneOpts = [{ gap: GAP }, { side: false, narrow: true, gap: GAP }];
      let lanes;
      for (const lo of laneOpts) {
        lanes = layLanes(lo);
        const wsum = lanes.reduce((a, L) => a + Math.max(lanes.length > 1 ? 300 : 360, L.bb.x1 - L.bb.x0 + 52) + 34, 0) + 6;
        if (wsum <= 950) break;
      }
      function layLanes(lo) { return ch.regions.lanes.map((ln, li) => {
        ln.states.forEach(s => laneOf[s] = ln.id);
        const ids = ln.states.slice();
        const sid = 'start:' + ln.id;
        items[sid] = { id: sid, kind: 'start', w: 30, h: 30 };
        const es = ch.edges.filter(e => ln.states.includes(e.from) && ln.states.includes(e.to)).map(e => { const c = { ...e }; delete c.offs; delete c.fixed; return c; });
        graph(ids, es, [ln.start], items, lo);
        const s0 = items[ln.start];
        items[sid].x = s0.x; items[sid].y = s0.y - 68;
        const env = { nodes: ids.map(i => items[i]).concat([items[sid]]), blocks: [], routes: [], labels: [], bounds: { x0: -1e4, x1: 1e4, y0: -1e4, y1: 1e4 } };
        const startEdge = { id: 'start>' + ln.start + '@' + ln.id, from: sid, to: ln.start, text: '', kind: 'start', within: true };
        es.forEach(e => e.within = true);
        routeAll(es, env, items);
        const st = items[sid];
        startEdge.pts = [port(st, 'bottom', 0, 'out'), port(s0, 'top', 0, 'in')];
        env.allRoutes = es.map(e => e.pts).concat([startEdge.pts]);
        es.forEach(e => placeWords(e, env));
        const parts = [...ids.map(i => nodeRect(items[i])), nodeRect(st), ...env.labels, ...env.allRoutes.flatMap(p => segs(p).map(segRect))];
        const bb = { x0: Math.min(...parts.map(r => r.x0)), y0: Math.min(...parts.map(r => r.y0)), x1: Math.max(...parts.map(r => r.x1)), y1: Math.max(...parts.map(r => r.y1)) };
        return { ln, li, ids: ids.concat([sid]), edges: es, startEdge, bb };
      }); }
      const PADX = 26, HEAD = 42, PADT = 18, PADB = 24, GAPR = 34, OUTER = 20, OHEAD = ch.regions.title != null && lanes.length > 1 ? 46 : 0;
      const minW = lanes.length > 1 ? 300 : 360;
      let x = OUTER;
      const regions = lanes.map(L => {
        const w = Math.max(minW, L.bb.x1 - L.bb.x0 + 2 * PADX), h = L.bb.y1 - L.bb.y0 + HEAD + PADT + PADB;
        const r = { lane: L, x0: x, y0: OHEAD + OUTER - (OHEAD ? 6 : 0), w, h };
        x += w + GAPR;
        return r;
      });
      const innerH = Math.max(...regions.map(r => r.h));
      const cw = x - GAPR + OUTER, chh = OHEAD + OUTER + innerH + OUTER - (OHEAD ? 6 : 0);
      regions.forEach(r => {
        r.h = innerH;
        const dx = r.x0 + (r.w - (r.lane.bb.x1 - r.lane.bb.x0)) / 2 - r.lane.bb.x0, dy = r.y0 + HEAD + PADT - r.lane.bb.y0;
        r.dx = dx; r.dy = dy;
        r.lane.ids.forEach(i => { items[i].x += dx; items[i].y += dy; items[i].parent = container; items[i].lane = r.lane.ln.id; });
        r.lane.edges.forEach(e => { e.pts = e.pts.map(p => [p[0] + dx, p[1] + dy]); if (e.lab) { e.lab.x += dx; e.lab.y += dy; if (e.lab.box) e.lab.box = R(e.lab.box.x0 + dx, e.lab.box.y0 + dy, e.lab.box.x1 + dx, e.lab.box.y1 + dy); } });
        r.lane.startEdge.pts = r.lane.startEdge.pts.map(p => [p[0] + dx, p[1] + dy]);
      });
      K0 = { id: container, kind: 'container', w: cw, h: chh, title: lanes.length > 1 ? (ch.regions.title ?? '') : null, regions, at: ch.regions.at };
      items[container] = K0;
    }
    // top level: plain states, ends, and the container as one big node
    const topIds = Object.keys(items).filter(i => !items[i].parent && items[i].kind !== 'start');
    const lift = id => laneOf[id] ? container : id;
    const topEdges = ch.edges.filter(e => !(laneOf[e.from] && laneOf[e.to])).map(e => ({ from: lift(e.from), to: lift(e.to), id: e.id, text: e.text }));
    const start = ch.start ? lift(ch.start) : topIds[0];
    // remember the container's own coordinates, then place top level
    const kLocal = K0 ? { ids: Object.keys(items).filter(i => items[i].parent === container), base: null } : null;
    if (K0) kLocal.base = Object.fromEntries(kLocal.ids.map(i => [i, [items[i].x, items[i].y]]));
    graph(topIds, topEdges, [start], items, { gap: GAPV });
    const all = Object.values(items);

    // try spots on the poster until nothing overlaps the header and everything fits
    const hasStartDot = !ch.entry && ch.start && !laneOf[ch.start] && ch.start !== container;
    const startDot = hasStartDot ? { id: 'start', kind: 'start', w: 30, h: 30 } : null;
    const topItems = topIds.map(i => items[i]);
    const s0 = items[start];
    const localBB = () => {
      const rs = topItems.map(n => R(n.x - n.w / 2, n.y - n.h / 2, n.x + n.w / 2, n.y + n.h / 2));
      return { x0: Math.min(...rs.map(r => r.x0)), x1: Math.max(...rs.map(r => r.x1)), y0: Math.min(...rs.map(r => r.y0)), y1: Math.max(...rs.map(r => r.y1)) };
    };
    const bb0 = localBB();
    const bottomRoom = H - (ch.exit ? 150 : 110);
    const tries = [];
    const centres = [590, 560, 620, 530, 650, 500, 680, 470, 440, 710];
    for (let dy = 0; dy <= 420; dy += 20) for (const cx of centres) tries.push([cx, dy]);
    let chosen = null, firstFit = null, attempts = 0;
    const topY = (hasStartDot || ch.entry ? 100 : 70) - bb0.y0;
    for (const [cx, dy] of tries) {
      const ox = cx - (s0 ? s0.x : (bb0.x0 + bb0.x1) / 2), oy = topY + dy;
      const x0 = bb0.x0 + ox, x1 = bb0.x1 + ox, y0 = bb0.y0 + oy, y1 = bb0.y1 + oy;
      if (x0 < 24 || x1 > 976 || y1 > bottomRoom) continue;
      const clear = topItems.every(n => !hit(grow(R(n.x + ox - n.w / 2, n.y + oy - n.h / 2 - 12, n.x + ox + n.w / 2, n.y + oy + n.h / 2), 14), header));
      if (!clear) continue;
      if (!firstFit) firstFit = [ox, oy];
      const res = attempt(ox, oy);
      if (res.penalty < 3000) { chosen = res; break; }
      if (!chosen || res.penalty < chosen.penalty) chosen = res;
      if (++attempts > 40) break;
    }
    if (!chosen) chosen = attempt(...(firstFit || [500 - (bb0.x0 + bb0.x1) / 2, topY + 200]));
    return chosen;

    function attempt(ox, oy) {
      // absolute copies so every attempt starts from the same local layout
      const N = {};
      for (const it of all) N[it.id] = { ...it };
      for (const id of topIds) { N[id].x += ox; N[id].y += oy; }
      if (K0) {
        const k = N[container], kx0 = k.x - k.w / 2, ky0 = k.y - k.h / 2;
        for (const id of kLocal.ids) { const [bx, by] = kLocal.base[id]; N[id].x = bx + kx0; N[id].y = by + ky0; }
        k.regions = K0.regions.map(r => ({ ...r, X0: r.x0 + kx0, Y0: r.y0 + ky0, X1: r.x0 + r.w + kx0, Y1: r.y0 + r.h + ky0 }));
        k.box = { x0: kx0, y0: ky0, x1: kx0 + k.w, y1: ky0 + k.h };
        k.dividers = k.regions.slice(1).map((r, i) => (k.regions[i].X1 + r.X0) / 2);
      }
      if (startDot) { const s = N[start]; N.start = { ...startDot, x: s.x, y: s.y - s.h / 2 - 40 }; }
      const nodes = Object.values(N).filter(n => n.kind !== 'start' || n.id === 'start');
      const env = { nodes: nodes.filter(n => !n.parent), blocks: [header], routes: [], labels: [], bounds: { x0: 16, x1: 984, y0: 8, y1: H - 6 } };
      const edges = ch.edges.filter(e => !(laneOf[e.from] && laneOf[e.to])).map(e => ({ ...e }));
      const inner = [];
      if (K0) {
        for (const r of N[container].regions) {
          const dx = r.X0 - r.x0, dy = r.Y0 - r.y0;
          r.lane.edges.forEach(e => inner.push({ ...e, pts: e.pts.map(p => [p[0] + dx, p[1] + dy]), lab: e.lab ? { ...e.lab, x: e.lab.x + dx, y: e.lab.y + dy, box: e.lab.box && R(e.lab.box.x0 + dx, e.lab.box.y0 + dy, e.lab.box.x1 + dx, e.lab.box.y1 + dy) } : null }));
          inner.push({ ...r.lane.startEdge, pts: r.lane.startEdge.pts.map(p => [p[0] + dx, p[1] + dy]) });
        }
        // the lane contents block other arrows; lane words are already placed
        for (const id of kLocal.ids) if (N[id].kind === 'box') env.blocks.push(grow(nodeRect(N[id]), 4));
        inner.forEach(e => { if (e.lab && e.lab.box) env.labels.push(e.lab.box); });
      }
      const routeItems = {};
      for (const n of Object.values(N)) routeItems[n.id] = n;
      // arrows out of a lane state leave from that state; the container is not in their way
      routeAll(edges, { ...env, nodes: env.nodes.concat(Object.values(N).filter(n => n.parent && n.kind === 'box')).filter(n => true) }, routeItems);
      const extra = [];
      if (startDot) {
        const s = N[start];
        extra.push({ id: 'start>' + start, from: 'start', to: start, kind: 'start', text: '', pts: [port(N.start, 'bottom', 0, 'out'), port(s, 'top', 0, 'in')] });
      }
      env.allRoutes = edges.map(e => e.pts).concat(inner.map(e => e.pts), extra.map(e => e.pts));
      for (const e of edges) placeWords(e, env);
      let penalty = 0;
      edges.forEach(e => { penalty += Math.max(0, (e.penalty || 0) - 2500); if (e.lab) penalty += e.lab.penalty >= 2500 ? e.lab.penalty : 0; });
      const boxes = {}, dots = {};
      for (const n of Object.values(N)) {
        if (n.kind === 'box') boxes[n.id] = { id: n.id, x: n.x, y: n.y, w: n.w, label: n.label, tag: n.tag, pin: n.pin, size: n.size, lane: n.lane };
        else if (n.kind === 'end' || n.kind === 'start') dots[n.id] = { id: n.id, type: n.kind, x: n.x, y: n.y };
      }
      const outEdges = edges.concat(inner, extra).map(e => ({ id: e.id, from: e.from, to: e.to, kind: e.kind, text: e.text || '', pts: e.pts, route: K.rounded(e.pts, 16), lab: e.lab || null, noHead: !!e.noHead }));
      const containers = K0 ? [(() => { const k = N[container]; return { id: k.id, x0: k.box.x0, y0: k.box.y0, x1: k.box.x1, y1: k.box.y1, title: k.title, dividers: k.dividers, regions: k.regions.map(r => ({ id: r.lane.ln.id, x0: r.X0, y0: r.Y0, x1: r.X1, y1: r.Y1, title: r.lane.ln.title, tint: r.lane.ln.tint })) }; })()] : [];
      return { penalty, boxes, dots, edges: outEdges, containers, offset: [ox, oy], start, entryX: N[start] ? N[start].x : 500, entryNode: start };
    }
  }

  // the arrow leaving through the bottom of one poster and the one entering the next, lined up into one line
  function linkChapters(L, next, H, exit) {
    const from = L.boxes[exit.from];
    const x2 = next ? next.entryX : from.x;
    const a = [from.x, from.y + TH / 2 + 6];
    const yj = H - 42;
    const pts = Math.abs(a[0] - x2) < 3 ? [a, [a[0], H + 1]] : [a, [a[0], yj], [x2, yj], [x2, H + 1]];
    const e = { id: exit.from + '>exit', from: exit.from, to: 'exit', kind: 'exit', text: edgeText(exit), pts, route: K.rounded(pts, 16), noHead: true, lab: null };
    const env = { nodes: Object.values(L.boxes).map(b => ({ ...b, kind: 'box', h: TH })), blocks: L.blocks || [], labels: L.edges.filter(x => x.lab && x.lab.box).map(x => x.lab.box), allRoutes: L.edges.map(x => x.pts).concat([pts]), bounds: { x0: 16, x1: 984, y0: 8, y1: H + 40 } };
    placeWords(e, env);
    L.edges.push(e);
    if (next) {
      const s = next.boxes[next.entryNode];
      const top = s ? s.y - TH / 2 - 11 : (next.containers[0] ? next.containers[0].y0 - 2 : 80);
      const xin = x2;
      const pts2 = [[xin, -1], [xin, top]];
      next.edges.push({ id: 'entry>' + next.entryNode, from: 'entry', to: next.entryNode, kind: 'entry', text: '', pts: pts2, route: pts2, noHead: false, lab: null });
    }
    return e;
  }

  // empty paper around the chart, for scenes: greedy maximal rectangles on a 20-unit grid
  function freeAreas(L, W, H, header) {
    const G = 20, cols = Math.ceil(W / G), rows = Math.ceil(H / G), occ = new Uint8Array(cols * rows);
    const mark = r => { for (let y = Math.max(0, Math.floor(r.y0 / G)); y < Math.min(rows, Math.ceil(r.y1 / G)); y++) for (let x = Math.max(0, Math.floor(r.x0 / G)); x < Math.min(cols, Math.ceil(r.x1 / G)); x++) occ[y * cols + x] = 1; };
    mark(grow(header, 10));
    Object.values(L.boxes).forEach(b => mark(R(b.x - b.w / 2 - 16, b.y - 46, b.x + b.w / 2 + 22, b.y + 40)));
    Object.values(L.dots).forEach(d => mark(R(d.x - 26, d.y - 26, d.x + 26, d.y + 26)));
    L.edges.forEach(e => { segs(e.pts).forEach(s => mark(grow(segRect(s), 14))); if (e.lab && e.lab.box) mark(grow(e.lab.box, 8)); });
    L.containers.forEach(k => mark(R(k.x0 - 12, k.y0 - 12, k.x1 + 12, k.y1 + 12)));
    const found = [];
    for (let k = 0; k < 8; k++) {
      let best = null;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (occ[y * cols + x]) continue;
        let maxW = cols - x;
        for (let h = 1; y + h - 1 < rows; h++) {
          let w = 0;
          while (w < maxW && !occ[(y + h - 1) * cols + x + w]) w++;
          maxW = w;
          if (!w) break;
          const area = w * h;
          if (w >= 6 && h >= 5 && (!best || area > best.area)) best = { x, y, w, h, area };
        }
      }
      if (!best) break;
      found.push({ x0: best.x * G, y0: best.y * G, x1: Math.min(W, (best.x + best.w) * G), y1: Math.min(H, (best.y + best.h) * G) });
      mark(R(best.x * G, best.y * G, (best.x + best.w) * G, (best.y + best.h) * G));
    }
    return found;
  }

  K.layout = { chapter, linkChapters, freeAreas, edgeText, boxWidth, segs, R, grow, hit };
})();

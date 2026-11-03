/* sweety-statechart-video · main.js — page entry. window.MODE: 'play' (renderAt for frames and stills) or 'layout'
 * (every chapter's finished poster, with a coordinate grid and the free areas, plus a JSON report for writing scenes). */
(async function () {
  const K = window.SCV;
  try {
    const want = ['20px "Special Elite"', 'italic 20px "Courier Prime"', '20px "Courier Prime"', '20px "SCV Hand"', 'italic 20px "SCV Hand"', '20px "SCV Type"', '20px "SCV Fangsong"', '20px "SCV Marker"'];
    await Promise.all(want.map(f => document.fonts.load(f, '状态图 ABC 123').catch(() => null)));
    await document.fonts.ready;
    const film = K.film.build(window.FILM, window.SCENES || {});
    window.__film = film;
    window.coverPNG = () => cover(film);
    if (window.MODE === 'layout') {
      window.layoutReport = () => report(film);
      window.layoutImages = (grid = true) => film.chapters.map((ch, ci) => poster(film, ci, grid));
    } else {
      const cv = document.getElementById('cv');
      const player = new K.Player(cv, film, window.TIMING || null, window.PLAYER_OPTS || {});
      window.__player = player;
      window.renderAt = T => player.renderAt(T);
      window.frameJPEG = (T, q = .93) => { player.renderAt(T); return cv.toDataURL('image/jpeg', q); };
      window.posterPNG = ci => poster(film, ci, false);
      window.timeline = () => ({ total: player.total, steps: player.steps.map(s => ({ ci: s.ci, si: s.si, t0: s.t0, dur: s.dur, note: s.s.note })), camera: player.camSegs });
      window.layoutReport = () => report(film);
    }
    window.ENGINE_READY = true;
  } catch (e) {
    window.ENGINE_ERROR = (e && e.stack) || String(e);
  }

  function poster(film, ci, grid) {
    const ch = film.chapters[ci], k = 2;
    const c = document.createElement('canvas'); c.width = film.W * k; c.height = film.H * k;
    const g = c.getContext('2d'); g.scale(k, k);
    K.film.drawPoster(g, film, ch, 0);
    if (grid) {
      g.save(); g.lineWidth = 1; g.font = '13px monospace';
      for (let x = 0; x <= film.W; x += 50) { g.strokeStyle = x % 100 ? 'rgba(255,0,80,.12)' : 'rgba(255,0,80,.35)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, film.H); g.stroke(); if (x % 100 === 0) { g.fillStyle = '#e8175d'; g.fillText(x, x + 2, 12); } }
      for (let y = 0; y <= film.H; y += 50) { g.strokeStyle = y % 100 ? 'rgba(255,0,80,.12)' : 'rgba(255,0,80,.35)'; g.beginPath(); g.moveTo(0, y); g.lineTo(film.W, y); g.stroke(); if (y % 100 === 0) { g.fillStyle = '#e8175d'; g.fillText(y, 2, y - 2); } }
      g.setLineDash([6, 4]); g.strokeStyle = 'rgba(0,150,60,.8)'; g.lineWidth = 2;
      ch.L.free.forEach((r, i) => { g.strokeRect(r.x0 + 2, r.y0 + 2, r.x1 - r.x0 - 4, r.y1 - r.y0 - 4); g.fillStyle = 'rgba(0,120,50,.9)'; g.fillText(`free ${i + 1}`, r.x0 + 6, r.y0 + 18); });
      g.restore();
    }
    return c.toDataURL('image/png');
  }

  // the cover: a 3:4 card for feeds: the first poster on a frame of the theme's ink, the film's title on a big ticket
  function cover(film) {
    const W = 1080, H = 1440, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), ch = film.chapters[0], C = K.C, FONT = K.FONT;
    g.fillStyle = C.ink; g.fillRect(0, 0, W, H);
    const pad = 34, pw = W - 2 * pad, k = pw / film.W, ph = Math.min(H - 2 * pad, film.H * k);
    g.save(); g.beginPath(); g.rect(pad, pad, pw, ph); g.clip();
    g.setTransform(k, 0, 0, k, pad, pad);
    K.film.drawPoster(g, film, ch, 0);
    g.restore();
    g.setTransform(1, 0, 0, 1, 0, 0);
    const title = film.title || ch.title || '', sub = film.series && film.series !== film.title ? film.series : (ch.sub || '');
    let fs = 104;
    g.font = `${fs}px ${FONT.type}`;
    while (g.measureText(title).width > W - 260 && fs > 56) { fs -= 4; g.font = `${fs}px ${FONT.type}`; }
    const tw = g.measureText(title).width, bw = tw + 120, bh = fs + 120, bx = (W - bw) / 2, by = H - pad - bh - 70;
    g.save(); g.translate(W / 2, by + bh / 2); g.rotate(-.03); g.translate(-W / 2, -(by + bh / 2));
    g.scale(1, 1);
    const sc = W / 1000; g.save(); g.scale(1, 1);
    const pts = K.chart.ticketPts(W / 2, by + bh / 2, bw, bh);
    K.seed('cover');
    K.hatch(g, K.move(pts, 10, 10), { color: C.black, base: .3, gap: 3, w: 2, angle: -.8, alpha: .6 });
    K.hatch(g, pts, { color: C.cream, solid: C.card, base: .6, gap: 5, w: 2, angle: -.5, layers: [{ color: C.creamD, alpha: .5 }] });
    K.line(g, pts, { closed: true, w: 4, color: C.cardInk });
    if (sub) K.text(g, sub, bx + 34, by + 44, { font: `italic 28px ${FONT.mono}`, color: C.guard, ink: false });
    K.text(g, title, W / 2, by + bh / 2 + fs * .42 + (sub ? 14 : 0), { font: `${fs}px ${FONT.type}`, align: 'center', color: C.cardInk, double: true });
    K.dot(g, W / 2, by, 16, C.active, { w: 3 });
    g.restore(); g.restore();
    return c.toDataURL('image/png');
  }

  function report(film) {
    const warnings = (film.warnings || []).slice();
    const chapters = film.chapters.map((ch, ci) => {
      const L = ch.L;
      L.edges.forEach(e => {
        if (e.lab && e.lab.penalty >= 2500) warnings.push(`chapter ${ch.num}: words of ${e.id} overlap something (score ${Math.round(e.lab.penalty)})`);
        if (e.text && !e.lab) warnings.push(`chapter ${ch.num}: no place for the words of ${e.id}`);
      });
      const used = new Set(), boxesSeen = new Set();
      ch.S.list.forEach(s => { s.go.forEach(x => used.add(x)); s.on.forEach(x => boxesSeen.add(x)); s.pass.forEach(x => boxesSeen.add(x)); });
      L.edges.forEach(e => { if (!used.has(e.id) && e.kind !== 'entry') warnings.push(`chapter ${ch.num}: arrow ${e.id} is never drawn by a step`); });
      Object.keys(L.boxes).forEach(b => { if (!boxesSeen.has(b)) warnings.push(`chapter ${ch.num}: card ${b} never becomes active, so it never appears`); });
      const r = v => Math.round(v);
      return {
        num: ch.num, title: ch.title, poster: [film.W, film.H],
        header: L.header,
        boxes: Object.fromEntries(Object.entries(L.boxes).map(([id, b]) => [id, { x: r(b.x), y: r(b.y), w: r(b.w), x0: r(b.x - b.w / 2), x1: r(b.x + b.w / 2), y0: r(b.y - (b.h || 56) / 2), y1: r(b.y + (b.h || 56) / 2), label: b.label, kind: b.kind }])),
        dots: Object.fromEntries(Object.entries(L.dots).map(([id, d]) => [id, { x: r(d.x), y: r(d.y), type: d.type }])),
        containers: L.containers.map(k => ({ id: k.id, x0: r(k.x0), y0: r(k.y0), x1: r(k.x1), y1: r(k.y1), regions: k.regions.map(g => ({ id: g.id, x0: r(g.x0), y0: r(g.y0), x1: r(g.x1), y1: r(g.y1) })) })),
        edges: L.edges.map(e => ({ id: e.id, kind: e.kind, text: e.text, pts: e.pts.map(p => [r(p[0]), r(p[1])]), words: e.lab ? { x: r(e.lab.x), y: r(e.lab.y), align: e.lab.align, box: [r(e.lab.box.x0), r(e.lab.box.y0), r(e.lab.box.x1), r(e.lab.box.y1)] } : null })),
        free: L.free,
        steps: ch.S.list.map(s => ({ go: s.go, on: s.on, note: s.note })),
      };
    });
    return { W: film.W, H: film.H, size: film.size, speed: film.speed, chapters, warnings };
  }
})();

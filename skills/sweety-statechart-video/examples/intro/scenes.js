// scenes.js — 《一句话，做一部会动的状态图》 (sweety-statechart-video intro, 2-3 min, v2 engine). Poster units: 1000 x 1333.
// Colours are palette names (themes swap them). S.T film seconds, S.on(id) active now, S.since(id) chart-time since it
// became active, S.step the step, S.t chart-time in the step; S.talk is the narration's loudness (0 in a silent render).
const c01 = v => Math.max(0, Math.min(1, v));
const grow = (S, k, d = 1, at = .9) => S.step > k ? 1 : S.step === k ? c01((S.t - at) / d) : 0;   // 0 -> 1 as step k lands
const voiced = (S, on) => !on ? {} : S.talk > .04 ? { mouth: Math.min(1, S.talk * 1.4) } : { talk: S.T };
const activeBox = ($, S, ids) => { for (const id of ids) if (S.on(id)) return $.box(id); return null; };

function wall($, x0, y0, x1, y1, color, cross) {         // a soft crayon wall with a ragged top
  $.seed('wall' + x0 + '|' + y0);
  const pts = [];
  for (let x = x0; x < x1; x += 46) pts.push([x, y0 + $.rnd(-7, 7)]);
  pts.push([x1, y0 + $.rnd(-7, 7)], [x1, y1], [x0, y1]);
  $.hatch(pts, { color, base: .3, gap: 4.2, layers: [{ color, alpha: .5 }, { color: cross || color, angle: .45, gap: 9, alpha: .25 }] });
}
function floorBand($, x0, x1, y, h, color = 'creamD') {
  $.hatch($.rect(x0, y, x1 - x0, h), { color, base: .5, gap: 3.4, angle: -.15, layers: [{ color: 'tan', alpha: .3, angle: 1.2, gap: 8 }] });
  $.line([[x0, y], [x1, y]], { w: 2.2 });
}
function miniPoster($, x, y, w, h, k = 1, seed = 'mp') {   // a tiny crayon poster: header, two cards, an arrow, a sun
  $.seed(seed);
  $.hatch($.rect(x, y, w, h), { color: 'cream', solid: $.C.white, base: .35, gap: 6, w: 1 });
  $.line([[x + w * .1, y + h * .12], [x + w * .45, y + h * .12]], { w: 2.2, color: 'navy', passes: 1 });
  if (k > .2) $.shape($.rect(x + w * .52, y + h * .2, w * .34, h * .14), { fill: 'cream', h: { gap: 3, base: .6 }, w: 1.4 });
  if (k > .5) $.line([[x + w * .69, y + h * .34], [x + w * .69, y + h * .48]], { w: 1.4 });
  if (k > .7) $.shape($.rect(x + w * .52, y + h * .5, w * .34, h * .14), { fill: 'rose', h: { gap: 3, base: .45 }, w: 1.4, stroke: 'pink' });
  $.blob(x + w * .2, y + h * .72, Math.min(w, h) * .09, 'straw', 1);
  $.hatch($.rect(x + w * .08, y + h * .84, w * .84, h * .08), { color: 'tan', base: .7, gap: 2.4 });
}
function frame($, x, y, w, h, label, on, k) {          // a device frame of a given shape with a tiny poster inside
  $.shape($.rounded([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], 10), { fill: 'navy', h: { gap: 2.4, base: .85 }, w: on ? 3.4 : 2.4, stroke: on ? 'pink' : 'ink' });
  miniPoster($, x + 8, y + 8, w - 16, h - 16, k, 'fr' + label);
  $.text(label, x + w / 2, y + h + 28, { font: '20px "Special Elite", "SCV Type"', align: 'center', color: on ? $.C.pink : $.C.navy });
}
function crayons($, x, y, t, s = 1) {                    // a cup of crayons
  ['pink', 'straw', 'blue', 'green', 'orange'].forEach((c, i) => {
    const bob = Math.sin(t * 2 + i) * 2, cx = x + (-34 + i * 15) * s, top = y + (-76 - (i % 2) * 8) * s + bob;
    $.shape($.rect(cx, top, 11 * s, 60 * s), { fill: c, h: { gap: 2, base: .9 }, w: 1.6 });
    $.shape([[cx, top], [cx + 6 * s, top - 14 * s], [cx + 11 * s, top]], { fill: c, h: { gap: 2, base: .9 }, w: 1.4 });
  });
  $.shape([[x - 44 * s, y - 40 * s], [x + 44 * s, y - 40 * s], [x + 36 * s, y], [x - 36 * s, y]], { fill: 'sky', h: { gap: 2.6, base: .8, layers: [{ color: 'lilac' }] }, w: 2.2 });
}
function mic($, x, y, s, t, on) {
  $.line([[x, y], [x, y - 120 * s]], { w: 3.4 });
  $.line([[x - 40 * s, y], [x + 40 * s, y]], { w: 4 });
  $.shape($.capsule([[x, y - 130 * s], [x, y - 190 * s]], 46 * s), { fill: 'grey', h: { gap: 2.4, base: .8, layers: [{ color: 'lilac' }, { color: 'navy', angle: 0, gap: 6, alpha: .5 }] }, w: 2.6 });
  if (on) for (let k = 0; k < 3; k++) { const f = (t * 1.2 + k / 3) % 1, r = (40 + f * 60) * s; $.seed('mw' + k + x); const a = $.ctx.globalAlpha; $.ctx.globalAlpha = 1 - f; $.line($.ell(x, y - 160 * s, r, r * 1.1, 14, -Math.PI * .35, Math.PI * .35), { w: 2.4, color: 'pink', passes: 1 }); $.ctx.globalAlpha = a; }
}
function waves($, x, y, t, on, d = 1) {                  // little sound waves beside a talking mouth
  if (!on) return;
  for (let k = 0; k < 3; k++) { const f = (t * 1.6 + k / 3) % 1; $.seed('wv' + x + k); const a = $.ctx.globalAlpha; $.ctx.globalAlpha = 1 - f; $.line($.ell(x, y, 10 + f * 26, 12 + f * 30, 10, d > 0 ? -.8 : Math.PI - .8, d > 0 ? .8 : Math.PI + .8), { w: 2.2, color: 'pink', passes: 1 }); $.ctx.globalAlpha = a; }
}
function likes($, x, y, t, n) {                          // hearts floating up
  for (let i = 0; i < n; i++) { const f = (t * .5 + i / n) % 1; const a = $.ctx.globalAlpha; $.ctx.globalAlpha = 1 - f; $.heart(x + Math.sin(i * 2.1 + t) * 18, y - f * 90, 9 + (i % 3) * 3, i % 2 ? 'rose' : 'pink'); $.ctx.globalAlpha = a; }
}
function sticker($, x, y, text, color, a, k) {           // a rotated hashtag sticker popping in
  if (k <= .01) return;
  $.ctx.save(); $.ctx.translate(x, y); $.ctx.rotate(a); const s = $.backOut(k); $.ctx.scale(s, s);
  $.ctx.font = '24px "Special Elite", "SCV Type"'; const w = $.ctx.measureText(text).width + 30;
  $.shape($.rounded([[-w / 2, -24], [w / 2, -24], [w / 2, 24], [-w / 2, 24], [-w / 2, -24]], 12), { fill: color, h: { gap: 2.6, base: .75, solid: $.C.white }, w: 2.4 });
  $.text(text, 0, 9, { font: '24px "Special Elite", "SCV Type"', align: 'center', color: $.C.navy });
  $.ctx.restore();
}
function filmStrip($, x, y0, y1, w, t, moving) {          // a vertical strip of film with tiny posters in its frames
  $.shape($.rect(x - w / 2, y0, w, y1 - y0), { fill: 'navy', h: { gap: 2.4, base: .85, layers: [{ color: 'ink' }] }, w: 2.6 });
  const fh = w * 1.2, off = moving ? (t * 40) % fh : 0;
  $.ctx.save(); $.ctx.beginPath(); $.ctx.rect(x - w / 2, y0, w, y1 - y0); $.ctx.clip();
  for (let y = y0 - fh + off, i = 0; y < y1; y += fh, i++) {
    miniPoster($, x - w * .32, y + fh * .12, w * .64, fh * .76, 1, 'fs' + (i % 3));
    for (const d of [-1, 1]) for (let k = 0; k < 3; k++) $.hatch($.rect(x + d * w * .42 - 4, y + k * fh / 3 + 6, 8, 10), { color: 'white', base: .95, gap: 2 });
  }
  $.ctx.restore();
}

/* ------------------------------------------------------------------ I 一句话 */
SCENES[1] = {
  bg($) {
    // the corner of the workshop where the AI draws
    wall($, 0, 690, 460, 1300, 'straw', 'ochre');
    floorBand($, 0, 460, 1300, 33);
    $.shape($.rect(36, 724, 240, 260), { fill: 'tan', h: { gap: 3, base: .6, solid: $.C.white, layers: [{ color: 'ochre', alpha: .5 }] }, w: 3 });
    for (const d of [0, 1]) $.line([[70 + d * 170, 984], [56 + d * 200, 1180]], { w: 4, color: 'brown' });
    // a shelf in the right strip
    $.shape($.rect(780, 640, 200, 10), { fill: 'tan', h: { gap: 2.4, base: .85 }, w: 2.2 });
  },
  fg($, S) {
    const T = S.T, st = S.step;
    $.sun(905, 90, 34, T);
    $.cloud(870 + Math.sin(T * .3) * 16, 220, 120, 50, { fill: 'white', hatch: 'sky' });
    $.bird(820 + Math.sin(T * .6) * 20, 300, .8, T);
    $.lantern(390, 90, 1, T);
    // I.1-2: you at your desk; a thought, then one sentence to the AI
    const asking = st === 1 || st === 6;
    $.set('desk', { x0: 0, y0: 250, x1: 460, y1: 672 }, { mode: st >= 2 && st <= 5 || st === 7 ? 'typing' : 'typing', t: T, cast: { hero: { ...$.K.outfits.customer, face: asking ? 'happy' : st === 0 ? 'worried' : 'neutral' } } });
    $.think(140, 420, '这事怎么讲清楚？', { pop: st === 0 ? (S.t - .3) / .5 : 0, size: 18 });
    $.bubble(300, 330, st === 6 ? '标题再大一点' : '把「泡茶」做成状态图', { side: 'right', size: 18, color: 'green', pop: asking ? (S.t - .5) / .4 : (st > 1 && st < 6 ? 1 : 0) });
    // I.3-5: the AI chops it into cards, draws it in crayon, voices it
    const k = grow(S, 2, 1.4) * .5 + grow(S, 3, 1.4) * .5;
    $.shape($.rect(52, 740, 208, 228), { fill: 'white', h: { gap: 4, base: .3, solid: $.C.white }, w: 2.4 });
    miniPoster($, 60, 748, 192, 212, k, 'big');
    const busy = st >= 2 && st <= 5 || st === 7;
    $.robot(372, 1290, .95, T, { wave: busy });
    crayons($, 300, 1160, T, .9);
    if (st >= 3) { const kk = grow(S, 3, 1); $.line([[200, 880], [200 + 50 * kk, 850]], { w: 3, color: 'pink' }); }
    mic($, 120, 1300, .62, T, st === 4 || st === 7);
    // I.6: a few minutes later; the film rolls
    $.clock(880, 470, 52, 0, { hour: 3, minute: st >= 5 ? 5 + Math.min(1, st > 5 ? 1 : S.t / 1.6) * 4 : 5, speed: 0, rim: 'red' });
    $.text('几分钟', 880, 556, { font: 'italic 24px "Courier Prime", "SCV Hand"', align: 'center', color: $.C.red });
    $.cup(820, 640, .7, { t: T, color: 'rose' });
    $.calendar(930, 610, .62, '18');
    filmStrip($, 880, 690, 940, 120, T, st >= 5);
    // someone points at the step being drawn
    const target = activeBox($, S, ['idea', 'ask', 'chart', 'draw', 'voice', 'film', 'post']);
    // I.9: posted; the likes come in
    const posted = st >= 8;
    const fan = $.who('office', 'stand', 900, 1300, .82, -1, { t: T, arms: target ? 'point' : 'phone', target: target ? [target.x + target.w / 2 + 10, target.y] : null, face: posted ? 'happy' : 'neutral' });
    $.phone(800, 1180, .78, { screen: posted ? 'chat' : 'blank', t: T, badge: posted ? '99+' : null, pop: st === 8 ? (S.t - .9) / .4 : 1 });
    if (posted) likes($, 800, 1100, T, 6);
    $.ground(740, 1000, 1302, 6, 'g1c');
  },
};

/* ------------------------------------------------------------------ II 为什么好看 */
function beadMascot($, x, y, r, t, running) {
  const b = running ? Math.abs(Math.sin(t * 10)) * 6 : Math.sin(t * 2) * 2;
  $.blob(x, y - b, r * 1.8, 'rose', .35 + .15 * Math.sin(t * 8));
  for (const k of [-1, 1]) { const ph = running ? Math.sin(t * 10 + (k > 0 ? Math.PI : 0)) * 8 : 0; $.line([[x + k * r * .4, y + r * .8 - b], [x + k * r * .4 + ph, y + r * 1.6]], { w: 3, color: 'navy' }); }
  $.dot(x, y - b, r, 'pink', { w: 2.4 });
  for (const k of [-1, 1]) $.dot(x + k * r * .35 + r * .15, y - b - r * .15, r * .14, 'navy', { w: 1.2 });
  $.line($.qbez([x - r * .1, y - b + r * .3], [x + r * .2, y - b + r * .5], [x + r * .5, y - b + r * .28], 5), { w: 1.8, color: 'navy' });
  if (running) $.wind(x - r * 4.2, y - b - r * .6, r * 1.6, t, 3);
}
function typewriter($, x, y, s, text, chars) {
  $.shape($.rect(x - 70 * s, y - 120 * s, 140 * s, 80 * s), { fill: 'white', h: { gap: 4, base: .25, solid: $.C.white, layers: [{ color: 'sky', alpha: .4 }] }, w: 2 });
  $.text(text, x, y - 80 * s, { font: `${Math.round(24 * s)}px "Special Elite", "SCV Type"`, align: 'center', color: $.C.navy, chars });
  $.shape([[x - 100 * s, y - 50 * s], [x + 100 * s, y - 50 * s], [x + 120 * s, y], [x - 120 * s, y]], { fill: 'navy', h: { gap: 2.4, base: .85, layers: [{ color: 'ink' }] }, w: 2.4 });
  for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) $.dot(x - 78 * s + i * 26 * s + r * 12 * s, y - 34 * s + r * 16 * s, 5.5 * s, 'white', { w: 1.4 });
  $.shape($.rect(x - 110 * s, y - 62 * s, 220 * s, 12 * s), { fill: 'grey', h: { gap: 2, base: .8 }, w: 2 });
}
function curtains($, x0, y0, x1, y1) {                   // a little stage: two red curtains and a pelmet
  const w = x1 - x0;
  for (const d of [0, 1]) {
    const cx = d ? x1 : x0, pts = [[cx, y0], [cx + (d ? -1 : 1) * w * .26, y0], [cx + (d ? -1 : 1) * w * .14, y1], [cx, y1]];
    $.shape(pts, { fill: 'red', h: { gap: 2.6, base: .85, solid: $.C.white, angle: -1.5, layers: [{ color: 'redD', angle: -1.5, gap: 6, alpha: .6 }] }, w: 2.8 });
  }
  for (let i = 0; i < 6; i++) { const ax = x0 + i * w / 6; $.shape([[ax, y0 - 10], [ax + w / 6, y0 - 10], [ax + w / 6, y0 + 22], [ax + w / 12, y0 + 34], [ax, y0 + 22]], { fill: i % 2 ? 'straw' : 'red', h: { gap: 2.4, base: .85, solid: $.C.white }, w: 2 }); }
}
SCENES[2] = {
  bg($) {
    // three little panels down the left: the bead's track, the drawing desk, the typewriter
    wall($, 0, 252, 460, 556, 'sky', 'blueL');
    wall($, 0, 572, 460, 880, 'straw', 'ochre');
    wall($, 0, 896, 460, 1300, 'mint', 'teal');
    floorBand($, 0, 460, 1300, 33);
    floorBand($, 0, 460, 556, 12, 'tan');
    floorBand($, 0, 460, 880, 12, 'tan');
    $.table(230, 1220, 300, 80, 'tan');
    // the stage, bottom middle
    $.hatch($.rect(472, 700, 238, 552), { color: 'navy', base: .38, gap: 4, layers: [{ color: 'violet', alpha: .3 }] });
    floorBand($, 472, 712, 1252, 14, 'brown');
  },
  fg($, S) {
    const T = S.T, st = S.step;
    $.sun(940, 70, 28, T);
    $.cloud(790 + Math.sin(T * .3) * 12, 50, 100, 40, { fill: 'white', hatch: 'sky' });
    // II.1 the bead runs along its track
    const running = S.on('go') || st === 6;
    const track = [[40, 500], [160, 456], [290, 500], [420, 456]];
    for (let i = 0; i < 20; i++) { const a = $.along(track, i / 20), b = $.along(track, (i + .5) / 20); $.line([a, b], { w: 2.4, color: 'ink', passes: 1 }); }
    const q = $.along(track, running ? (T * .35) % 1 : .15);
    beadMascot($, q[0], q[1] - 40, 30, T, running);
    $.text('圆点出发', 120, 300, { font: '22px "Special Elite", "SCV Type"', align: 'center', color: $.C.navy, alpha: running ? 1 : .55 });
    // II.2 the line grows behind a crayon
    const drawing = S.on('line') || st === 6;
    const L = drawing ? ((T * .4) % 1) : (st > 1 ? 1 : 0);
    const path = [[40, 800], [150, 720], [260, 810], [420, 730]];
    if (L > 0) { const pts = []; for (let i = 0; i <= 30 * L; i++) pts.push($.along(path, i / 30)); if (pts.length > 1) { $.seed('pl'); $.line(pts, { w: 3.4, color: 'ink' }); } }
    const tip = $.along(path, Math.max(.02, L)), pa = 2.24;
    const base = [tip[0] - 112 * Math.cos(pa), tip[1] - 112 * Math.sin(pa)];
    $.shape([[0, -9], [120, -9], [142, 0], [120, 9], [0, 9]].map(([px, py]) => [base[0] + (px * Math.cos(pa) - py * Math.sin(pa)) * .9, base[1] + (px * Math.sin(pa) + py * Math.cos(pa)) * .9]), { fill: 'straw', h: { gap: 2.4, base: .85 }, w: 2.2 });
    crayons($, 400, 870, T, .7);
    // II.3 the words, typed
    const typing = S.on('words') || st === 6;
    const word = '圆点到站';
    typewriter($, 230, 1220, 1.15, word, typing ? Math.floor(((S.on('words') ? S.since('words') : S.t) * 1.6) % (word.length + 2)) : (st > 2 ? 9 : 0));
    const typist = $.who('student', 'stand', 70, 1300, .8, 1, { t: T, arms: typing ? 'type' : 'hold', face: typing ? 'happy' : 'neutral' });
    // II.4-5 the card pops out of its box on a little stage, then turns pink under the spotlight
    curtains($, 474, 712, 708, 1252);
    const popK = grow(S, 3, .5, .8);
    $.shape($.rect(512, 1150, 160, 100), { fill: 'violet', h: { gap: 2.6, base: .8, layers: [{ color: 'lilac' }] }, w: 2.6 });
    if (popK > 0) {
      const lift = 60 * $.backOut(popK);
      $.line([[552, 1150], [572, 1130 - lift * .3], [552, 1110 - lift * .6], [572, 1090 - lift]], { w: 3, color: 'navy' });
      $.K.chart.ticket($.ctx, { id: 'demo', x: 592, y: 1060 - lift, w: 150, label: '卡片', tag: 'pop', pin: 'pink' }, { pop: .6 + .4 * $.backOut(popK), active: st >= 4 && (st > 4 || S.t > 1), at: T * 2 });
    }
    if (st >= 4) { $.ctx.save(); $.ctx.globalAlpha = .22 + .05 * Math.sin(T * 4); $.ctx.fillStyle = $.grain('yolk', .3); $.ctx.beginPath(); $.ctx.moveTo(560, 740); $.ctx.lineTo(626, 740); $.ctx.lineTo(690, 1250); $.ctx.lineTo(494, 1250); $.ctx.fill(); $.ctx.restore(); }
    // II.7-8 the little people, the fire, the steam keep going
    const cook = $.who('cook', 'stand', 942, 1300, .78, -1, { t: T, arms: st >= 6 ? 'toss' : 'stir', face: st >= 6 ? 'proud' : 'neutral' });
    for (let k = 0; k < 3; k++) $.steam(920 + k * 14, cook.head[1] - 40, T, k, st >= 6 ? 80 : 40, 5);
    $.lamp(760, 1255, 300, .7, T, st >= 4);
    $.flowerPot(790, 1255, .7, T, 'pink');
    $.lantern(940, 480, 1, T); $.lantern(940, 600, 1, T + 1);
    if (st >= 7) for (let i = 0; i < 3; i++) $.sparkle(940 + (i % 2) * 30 - 15, 740 + i * 70, 14, T + i, i % 2 ? 'pink' : 'straw');
  },
};

/* ------------------------------------------------------------------ III 四个声音 */
SCENES[3] = {
  bg($) {
    // the left side is a little recording booth: foam on the walls
    wall($, 0, 254, 460, 1300, 'lilac', 'violet');
    $.repeat((x, y) => { $.hatch($.rect(x - 16, y - 32, 32, 30), { color: 'violet', base: .25, gap: 3.2, layers: [{ color: 'navy', alpha: .25 }] }); }, { x0: 0, y0: 270, x1: 460, y1: 690 }, { cols: 10, rows: 7, jitter: 0 });
    floorBand($, 0, 460, 1300, 33, 'tan');
    floorBand($, 0, 460, 690, 10, 'tan');
    $.shape($.rect(0, 880, 460, 12), { fill: 'tan', h: { gap: 2.4, base: .85 }, w: 2.2 });
    // the workshop corner, bottom right
    wall($, 720, 860, 1000, 1300, 'peach', 'tan');
    floorBand($, 720, 1000, 1300, 33, 'tan');
  },
  fg($, S) {
    const T = S.T, st = S.step;
    $.sun(930, 80, 30, T);
    $.cloud(820 + Math.sin(T * .3) * 20, 70, 120, 50, { fill: 'white', hatch: 'sky' });
    // 蜡笔姐姐, top left, next to her card
    const a1 = S.on('s1');
    mic($, 300, 690, .55, T, a1);
    const p1 = $.who('customer', 'stand', 160, 690, .84, 1, { t: T, arms: a1 ? 'wave' : 'hold', face: a1 ? 'happy' : 'neutral', ...voiced(S, a1) });
    waves($, p1.head[0] + 32, p1.head[1] + 4, T, a1);
    $.bubble(260, 330, '生活里的小事', { side: 'left', size: 18, color: 'rose', pop: grow(S, 0, .4, .4) });
    // 图纸哥, top right, at a drafting board
    const a2 = S.on('s2');
    $.shape($.turn($.rect(744, 400, 150, 110), 819, 455, -.08), { fill: 'blue', h: { gap: 2.6, base: .85, solid: $.C.white, layers: [{ color: 'violet', alpha: .4 }] }, w: 2.6 });
    for (let i = 0; i < 3; i++) $.line([[764, 430 + i * 26], [870, 422 + i * 26]], { color: 'white', w: 1.6, passes: 1 });
    $.line([[780, 500], [850, 450]], { color: 'white', w: 2, passes: 1 });
    for (const d of [-1, 1]) $.line([[819 + d * 50, 506], [819 + d * 66, 716]], { w: 3.4, color: 'brown' });
    const p2 = $.who('office', 'stand', 940, 716, .82, -1, { t: T, arms: a2 ? 'point' : 'hold', target: [830, 450], face: a2 ? 'proud' : 'neutral', ...voiced(S, a2) });
    waves($, p2.head[0] - 30, p2.head[1] + 4, T, a2, -1);
    $.bubble(760, 330, '流程和原理', { side: 'left', size: 18, color: 'sky', pop: grow(S, 1, .4, .4) });
    $.ground(720, 1000, 718, 6, 'v2');
    // 元气少女, middle left, cheering with sparkles
    const a3 = S.on('s3');
    const p3 = $.who({ ...$.K.outfits.teen, shirt: 'straw', hair: 'pigtails' }, 'stand', 140, 880, .84, 1, { t: T, arms: a3 ? 'cheer' : 'swing', face: a3 ? 'happy' : 'neutral', ...voiced(S, a3) });
    waves($, p3.head[0] + 26, p3.head[1] + 4, T, a3);
    if (a3) for (let i = 0; i < 4; i++) $.sparkle(240 + (i % 2) * 70, 740 + i * 30, 14, T + i, i % 2 ? 'pink' : 'straw');
    $.bubble(290, 740, '好玩的事', { side: 'left', size: 18, color: 'straw', pop: grow(S, 2, .4, .4) });
    // 老师傅, bottom right, with his tea and his kiln
    const a4 = S.on('s4');
    $.kiln(900, 1300, .7, T, { fire: a4 });
    $.stool(790, 1212, 66, 88, 'blueL');
    $.person($.pose.sit(780, 1210, .78, 1, { t: T, arms: 'hold', floor: 1300 }), { ...$.K.outfits.grandpa, build: 'elder', t: T, face: a4 ? 'happy' : 'sleepy', ...voiced(S, a4) });
    $.teacup(760, 1150, .5, { t: T, steep: .8 });
    $.bubble(790, 990, '手艺和老行当', { side: 'left', size: 18, color: 'mint', pop: grow(S, 3, .4, .4) });
    // 你自己的声音: record a dozen seconds
    const own = st >= 5, rec = st === 6;
    mic($, 110, 1300, .72, T, rec);
    const me = $.who('student', 'stand', 250, 1300, .84, -1, { t: T, arms: 'phone', face: own ? 'happy' : 'neutral', ...voiced(S, rec) });
    $.phone(me.haF[0] - 8, me.haF[1] + 2, .42, { screen: 'call', text: own ? '录音中' : '', t: T, ring: rec, tilt: -.1 });
    if (rec && Math.sin(T * 6) > 0) { $.dot(330, 1110, 9, 'red'); $.text('REC', 370, 1117, { font: '20px "Special Elite"', color: $.C.red }); }
    $.enter('pop', grow(S, 4, .5, .3), () => $.sign(30, 920, 360, 54, '纯合成 · 无版权麻烦', { size: 22, color: 'cream' }), { at: [210, 947] });
    $.enter('pop', grow(S, 7, .5, .3), () => $.sign(60, 990, 300, 54, '教程：主页 · 文章', { size: 22, color: 'white' }), { at: [210, 1017] });
  },
};

/* ------------------------------------------------------------------ IV 发哪儿都合适 */
SCENES[4] = {
  bg($) {
    // a living room wall with frames on it, a corkboard, a TV cabinet
    wall($, 0, 652, 460, 1300, 'peach', 'tan');
    floorBand($, 0, 460, 1300, 33, 'tan');
    wall($, 760, 652, 1000, 1300, 'sky', 'blueL');
    floorBand($, 760, 1000, 1300, 33, 'tan');
    $.shape($.rect(20, 260, 170, 360), { fill: 'tan', h: { gap: 3, base: .7, solid: $.C.white, layers: [{ color: 'ochre', alpha: .5 }, { color: 'brown', angle: .5, gap: 8, alpha: .2 }] }, w: 3 });
    $.shape($.rect(776, 1150, 210, 100), { fill: 'brown', h: { gap: 2.6, base: .8, solid: $.C.white, layers: [{ color: 'tan', alpha: .5 }] }, w: 2.8 });
    for (const d of [0, 1]) $.line([[796 + d * 170, 1250], [796 + d * 170, 1300]], { w: 3.4, color: 'brown' });
    $.shelf(800, 960, 170, 1, { rowH: 64, goods: ['red', 'straw', 'blue', 'green'] });
  },
  fg($, S) {
    const T = S.T, st = S.step;
    $.sun(930, 80, 30, T);
    $.cloud(760 + Math.sin(T * .3) * 20, 90, 120, 46, { fill: 'white', hatch: 'sky' });
    $.bird(680, 160, .8, T); $.bird(720, 186, .7, T + 1);
    // the corkboard: notes, then the hashtags
    for (let i = 0; i < 4; i++) { const nx = 40 + (i % 2) * 70, ny = 290 + Math.floor(i / 2) * 80; $.shape($.turn($.rect(nx, ny, 56, 56), nx + 28, ny + 28, (i - 1.5) * .06), { fill: ['yolk', 'rose', 'mint', 'sky'][i], h: { gap: 2.4, base: .85 }, w: 1.8 }); $.dot(nx + 28, ny + 4, 4, 'red', { w: 1 }); }
    sticker($, 105, 480, '#AI玩家', 'rose', -.12, grow(S, 5, .5, .3));
    sticker($, 105, 560, '#vive', 'sky', .08, grow(S, 5, .5, .6));
    // device frames in each shape, the active one in pink
    frame($, 40, 690, 170, 226, '小红书 3:4', S.on('default') || st === 0, 1);
    frame($, 236, 690, 112, 200, '抖音 9:16', S.on('tall'), 1);
    frame($, 790, 1004, 180, 102, '横屏 16:9', S.on('wide'), 1);
    frame($, 820, 700, 130, 130, '方图 1:1', S.on('square'), 1);
    // 2-3 minutes: a clock on the wall; the sofa below
    const lenOn = st >= 4;
    $.clock(406, 756, 40, lenOn ? T : 0, { hour: 12, minute: 0, speed: lenOn ? 30 : 0, rim: 'red' });
    $.text('2–3 分钟', 406, 830, { font: '22px "Special Elite", "SCV Type"', align: 'center', color: $.C.red });
    $.shape($.rect(30, 1170, 300, 50), { fill: 'green', h: { gap: 2.6, base: .8, solid: $.C.white }, w: 2.6 });
    $.shape($.rect(20, 1214, 320, 36), { fill: 'green', h: { gap: 2.6, base: .85, solid: $.C.white, layers: [{ color: 'greenD', alpha: .4 }] }, w: 2.6 });
    for (const d of [0, 1]) $.line([[40 + d * 280, 1250], [42 + d * 280, 1300]], { w: 3 });
    // you on the sofa point at the shape being picked
    const target = activeBox($, S, ['default', 'tall', 'wide', 'square', 'len', 'custom']);
    const me = $.person($.pose.sit(130, 1214, .82, 1, { t: T, arms: target ? 'point' : 'phone', target: target ? [target.x - target.w / 2 - 8, target.y] : null, floor: 1300 }), { ...$.K.outfits.customer, t: T, face: target ? 'happy' : 'neutral' });
    $.cat(290, 1214, .55, T, 'orange');
    // "one minute, please"
    const one = st >= 6;
    const c = $.who('student', 'stand', 410, 1300, .8, -1, { t: T, arms: one ? 'up' : 'hold', face: one ? 'happy' : 'neutral', ...voiced(S, st === 6) });
    $.bubble(c.head[0] - 30, c.head[1] - 30, '一分钟就好', { side: 'right', size: 18, color: 'white', pop: st === 6 ? (S.t - .4) / .4 : st > 6 ? 1 : 0 });
  },
};

/* ------------------------------------------------------------------ V 你喝茶，它干活 */
const PLATFORMS = ['Codex', 'Claude Code', 'Grok Build', 'Grok Bot', 'Muse'];
SCENES[5] = {
  bg($) {
    // your tea corner, left
    wall($, 0, 254, 240, 1300, 'peach', 'tan');
    $.shape($.rect(36, 300, 168, 128), { fill: 'cream', h: { base: .5, gap: 3.4, solid: $.C.white } });
    $.hatch($.rect(44, 308, 152, 112), { color: 'sky', base: .5, gap: 3.6, layers: [{ color: 'blueL', alpha: .5 }] });
    $.line([[120, 308], [120, 420]], { color: 'creamD', w: 4 });
    $.shelf(30, 640, 180, 2, { rowH: 54, goods: ['tan', 'green', 'straw', 'red'] });
    floorBand($, 0, 240, 1300, 33, 'tan');
    $.table(160, 1180, 120, 120, 'tan');
    // the long desk of platforms, bottom
    wall($, 240, 1168, 1000, 1262, 'mint', 'teal');
    $.shape($.rect(250, 1262, 744, 14), { fill: 'tan', h: { gap: 2.4, base: .85 }, w: 2.6 });
  },
  fg($, S) {
    const T = S.T, st = S.step;
    $.sun(930, 80, 30, T);
    $.clock(720, 130, 46, T, { speed: 8, hour: 15 });
    $.cloud(110 + Math.sin(T * .3) * 10, 350, 70, 30, { fill: 'white', hatch: 'sky' });
    $.lantern(200, 740, 1, T);
    // you: ask, drink tea, come back with the film
    const tea = S.on('y2'), back = S.on('y3') || st >= 5;
    $.stool(80, 1212, 60, 88, 'pink');
    const me = $.pose.sit(70, 1210, .8, 1, { t: T, arms: tea ? 'hold' : 'phone', floor: 1300 });
    $.person(me, { ...$.K.outfits.customer, t: T, face: tea ? 'sleepy' : back ? 'happy' : 'neutral', ...voiced(S, S.on('y1')) });
    if (tea) $.cup(me.haF[0] + 14, me.haF[1] + 16, .6, { t: T, color: 'rose' });
    else $.phone(me.haF[0] + 8, me.haF[1] + 2, .38, { screen: back ? 'map' : 'chat', t: T });
    $.teapot(160, 1180, .6, { t: T });
    if (tea) $.think(120, 920, '真香', { pop: (S.since('y2') - .3) / .4, size: 20 });
    // the AI at work: it chops, draws, voices, and the film comes out
    const job = S.on('a1') ? 0 : S.on('a2') ? 1 : S.on('a3') ? 2 : S.on('a4') || st >= 5 ? 3 : 0;
    $.robot(740, 1160, .62, T, { wave: job === 3 });
    const steps = ['拆', '画', '配', '好'];
    steps.forEach((w, i) => { const on = i <= job, x = 820 + i * 42; $.shape($.rect(x - 17, 1060, 34, 34), { fill: on ? (i === job ? 'pink' : 'green') : 'white', h: { gap: 2.4, base: on ? .85 : .3 }, w: 2 }); $.text(w, x, 1086, { font: '20px "Special Elite", "SCV Type"', align: 'center', color: on ? $.C.white : $.C.navy }); });
    if (job === 1) crayons($, 830, 1150, T, .55);
    if (job === 2) mic($, 840, 1160, .32, T, true);
    if (job === 3) { $.enter('pop', c01(S.since('a4') >= 0 ? S.since('a4') / .6 : 1), () => miniPoster($, 800, 1104, 60, 56, 1, 'done'), { at: [830, 1132] }); $.check(900, 1130, .8, 'greenD'); }
    // the platforms it runs in
    PLATFORMS.forEach((name, i) => {
      const x = 320 + i * 120, busy = st >= 2 && st <= 4;
      $.laptop(x, 1262, .6, { t: T + i, typing: busy || st >= 7 });
      $.text(name, x, 1296, { font: '17px "Special Elite", "Courier Prime"', align: 'center', color: $.C.navy });
      if (st === 7) $.check(x + 30, 1196, .7, 'greenD', c01((S.t - .4 - i * .2) / .4));
    });
    $.sign(256, 1010, 180, 64, 'WorkBuddy\n即将支持', { size: 16, color: 'white' });
    // posted: likes rise
    if (st >= 6) likes($, 478, 1150, T, 5);
    // thanks, release, follow
    if (st >= 9) $.enter('pop', grow(S, 9, .5, .3), () => $.sign(16, 450, 210, 120, '灵感来自\nAnn Nguyen\n@ann_nnng', { size: 18, color: 'cream' }), { at: [120, 510] });
    if (st >= 10) $.K.chart.stamp($.ctx, 830, 215, '马上发布', { k: st === 10 ? 1.6 - .6 * $.backOut(c01((S.t - .5) / .4)) : 1, alpha: st === 10 ? c01((S.t - .4) / .2) : 1, angle: -.1 });
    if (st >= 11) $.enter('pop', grow(S, 11, .5, .3), () => $.sign(16, 780, 210, 64, '关注 @leo_xiaolei', { size: 17, color: 'rose' }), { at: [120, 812] });
  },
};

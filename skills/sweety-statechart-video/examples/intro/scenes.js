// scenes.js — 《一句话，做一部会动的状态图》 (sweety-statechart-video intro, 2-3 min). Poster units: 1000 x 1333.
const P = { ink: '#2140d6', navy: '#16246e', pink: '#e8175d', red: '#d81b4a', straw: '#f5c935', orange: '#ff7f1e', green: '#8fd65f', greenD: '#3fa748', sky: '#bcd6fb', lilac: '#a7a2ee', cream: '#fbeccb', white: '#fdfcf8', grey: '#b9b6d6', rose: '#ff5a8c', violet: '#5b4fe0', tan: '#c98b4e', mint: '#9ff0d4' };
const c01 = v => Math.max(0, Math.min(1, v));
const grow = (S, k, d = 1, at = .9) => S.step > k ? 1 : S.step === k ? c01((S.t - at) / d) : 0;   // 0 -> 1 as step k lands

function miniPoster($, x, y, w, h, k = 1, seed = 'mp') {   // a tiny crayon poster: header, two cards, an arrow, a sun
  $.seed(seed);
  $.hatch($.rect(x, y, w, h), { color: P.cream, solid: P.white, base: .35, gap: 6, w: 1 });
  $.line([[x + w * .1, y + h * .12], [x + w * .45, y + h * .12]], { w: 2.2, color: P.navy, passes: 1 });
  if (k > .2) $.shape($.rect(x + w * .52, y + h * .2, w * .34, h * .14), { fill: P.cream, h: { gap: 3, base: .6 }, w: 1.4 });
  if (k > .5) $.line([[x + w * .69, y + h * .34], [x + w * .69, y + h * .48]], { w: 1.4 });
  if (k > .7) $.shape($.rect(x + w * .52, y + h * .5, w * .34, h * .14), { fill: '#ffd3e0', h: { gap: 3, base: .6 }, w: 1.4, stroke: P.pink });
  $.blob(x + w * .2, y + h * .72, Math.min(w, h) * .09, P.straw, 1);
  $.hatch($.rect(x + w * .08, y + h * .84, w * .84, h * .08), { color: P.tan, base: .7, gap: 2.4 });
}
function frame($, x, y, w, h, label, on, k) {          // a device frame of a given shape with a tiny poster inside
  $.shape($.rounded([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], 10), { fill: P.navy, h: { gap: 2.4, base: .85 }, w: on ? 3.4 : 2.4, stroke: on ? P.pink : P.ink });
  miniPoster($, x + 8, y + 8, w - 16, h - 16, k, 'fr' + label);
  $.text(label, x + w / 2, y + h + 28, { font: '20px "Special Elite", "SCV Type"', align: 'center', color: on ? P.pink : P.navy });
}
function crayons($, x, y, t) {                          // a cup of crayons
  ['#e8175d', '#f5c935', '#2c4fe0', '#8fd65f', '#ff7f1e'].forEach((c, i) => {
    const bob = Math.sin(t * 2 + i) * 2;
    $.shape($.rect(x - 34 + i * 15, y - 76 + bob - (i % 2) * 8, 11, 60), { fill: c, h: { gap: 2, base: .9 }, w: 1.6 });
    $.shape([[x - 34 + i * 15, y - 76 + bob - (i % 2) * 8], [x - 28 + i * 15, y - 90 + bob - (i % 2) * 8], [x - 23 + i * 15, y - 76 + bob - (i % 2) * 8]], { fill: c, h: { gap: 2, base: .9 }, w: 1.4 });
  });
  $.shape([[x - 44, y - 40], [x + 44, y - 40], [x + 36, y], [x - 36, y]], { fill: P.sky, h: { gap: 2.6, base: .8, layers: [{ color: P.lilac }] }, w: 2.2 });
}
function mic($, x, y, s, t, on) {
  $.line([[x, y], [x, y - 120 * s]], { w: 3.4 });
  $.line([[x - 40 * s, y], [x + 40 * s, y]], { w: 4 });
  $.shape($.capsule([[x, y - 130 * s], [x, y - 190 * s]], 46 * s), { fill: P.grey, h: { gap: 2.4, base: .8, layers: [{ color: P.lilac }, { color: P.navy, angle: 0, gap: 6, alpha: .5 }] }, w: 2.6 });
  if (on) for (let k = 0; k < 3; k++) { const f = (t * 1.2 + k / 3) % 1, r = (40 + f * 60) * s; $.seed('mw' + k + x); const a = $.ctx.globalAlpha; $.ctx.globalAlpha = 1 - f; $.line($.ell(x, y - 160 * s, r, r * 1.1, 14, -Math.PI * .35, Math.PI * .35), { w: 2.4, color: P.pink, passes: 1 }); $.ctx.globalAlpha = a; }
}
function waves($, x, y, t, on) {                         // little sound waves beside a talking mouth
  if (!on) return;
  for (let k = 0; k < 3; k++) { const f = (t * 1.6 + k / 3) % 1; $.seed('wv' + x + k); const a = $.ctx.globalAlpha; $.ctx.globalAlpha = 1 - f; $.line($.ell(x, y, 10 + f * 26, 12 + f * 30, 10, -.8, .8), { w: 2.2, color: P.pink, passes: 1 }); $.ctx.globalAlpha = a; }
}
function likes($, x, y, t, n) {                          // hearts floating up
  for (let i = 0; i < n; i++) { const f = (t * .5 + i / n) % 1; const a = $.ctx.globalAlpha; $.ctx.globalAlpha = 1 - f; $.heart(x + Math.sin(i * 2.1 + t) * 18, y - f * 90, 9 + (i % 3) * 3, i % 2 ? 'rose' : 'pink'); $.ctx.globalAlpha = a; }
}
function sticker($, x, y, text, color, a, k) {           // a rotated hashtag sticker popping in
  if (k <= .01) return;
  $.ctx.save(); $.ctx.translate(x, y); $.ctx.rotate(a); const s = $.backOut(k); $.ctx.scale(s, s);
  $.ctx.font = '24px "Special Elite", "SCV Type"'; const w = $.ctx.measureText(text).width + 30;
  $.shape($.rounded([[-w / 2, -24], [w / 2, -24], [w / 2, 24], [-w / 2, 24], [-w / 2, -24]], 12), { fill: color, h: { gap: 2.6, base: .75, solid: P.white }, w: 2.4 });
  $.text(text, 0, 9, { font: '24px "Special Elite", "SCV Type"', align: 'center', color: P.navy });
  $.ctx.restore();
}

/* ------------------------------------------------------------------ I 一句话 */
SCENES[1] = {
  bg($) {
    $.table(300, 600, 260, 70, 'tan');
    $.ground(20, 470, 672, 10, 'g1');
    $.ground(20, 470, 1300, 10, 'g1b');
    $.ground(740, 1000, 1300, 6, 'g1c');
  },
  fg($, S) {
    const T = S.T;
    $.sun(905, 90, 34, T);
    $.cloud(860 + Math.sin(T * .3) * 16, 230, 120, 50, { fill: 'white', hatch: 'sky' });
    $.bird(820 + Math.sin(T * .6) * 20, 320, .8, T);
    // I.1-2: a thought, then one sentence to the laptop
    $.stool(130, 602, 66, 70, 'pink');
    const me = $.pose.sit(130, 600, .82, 1, { t: T, arms: S.step >= 1 && S.step <= 2 ? 'type' : 'hold', floor: 672 });
    $.person(me, { ...$.K.outfits.customer, t: T, talk: S.step === 1 || S.step === 6 ? T : 0 });
    $.think(170, 420, '这事怎么讲清楚？', { pop: S.step === 0 ? (S.t - .3) / .5 : 0, size: 18 });
    const asking = S.step === 1 || S.step === 6;
    $.bubble(400, 372, S.step === 6 ? '标题再大一点' : '把「泡茶」做成状态图', { side: 'right', size: 18, color: 'green', pop: asking ? (S.t - .5) / .4 : (S.step > 1 && S.step < 6 ? 1 : 0) });
    $.laptop(340, 600, 1.05, { t: T, typing: S.step >= 2 && S.step <= 5 || S.step === 7 });
    // I.3-5: the AI chops, draws and voices it
    $.sign(60, 720, 220, 220, '', { color: 'white' });
    miniPoster($, 76, 736, 188, 188, grow(S, 2, 1.4) * .5 + grow(S, 3, 1.4) * .5, 'big');
    crayons($, 360, 940, T);
    if (S.step >= 3) { const k = grow(S, 3, 1); $.line([[300, 820], [300 + 60 * k, 790]], { w: 3, color: '#e8175d' }); }
    mic($, 410, 1300, .8, T, S.step === 4 || S.step === 7);
    // I.6: a few minutes later
    $.clock(880, 470, 56, 0, { hour: 3, minute: S.step >= 5 ? 5 + Math.min(1, S.step > 5 ? 1 : S.t / 1.6) * 4 : 5, speed: 0, rim: 'red' });
    $.text('几分钟', 880, 560, { font: 'italic 24px "Courier Prime", "SCV Hand"', align: 'center', color: '#d81b4a' });
    $.cup(880, 720, 1.1, { t: T, color: 'rose' });
    // I.6-9: the film and its posters, then likes
    const k = grow(S, 5, .8);
    if (k > 0) {
      ['pink', 'sky', 'straw'].forEach((c, i) => { if (k > i * .3) miniPoster($, 60 + i * 120, 1010, 100, 133, 1, 'pp' + i); });
      $.phone(140, 1230, .7, { screen: 'map', t: T });
    }
    $.phone(860, 1150, 1.05, { screen: S.step >= 8 ? 'chat' : 'blank', t: T, badge: S.step >= 8 ? '99+' : null, pop: S.step === 8 ? (S.t - .9) / .4 : 1 });
    if (S.step >= 8) likes($, 860, 1070, T, 6);
  },
};

/* ------------------------------------------------------------------ II 为什么好看 */
function beadMascot($, x, y, r, t, running) {
  const b = running ? Math.abs(Math.sin(t * 10)) * 6 : Math.sin(t * 2) * 2;
  $.blob(x, y - b, r * 1.8, P.rose, .35 + .15 * Math.sin(t * 8));
  for (const k of [-1, 1]) { const ph = running ? Math.sin(t * 10 + (k > 0 ? Math.PI : 0)) * 8 : 0; $.line([[x + k * r * .4, y + r * .8 - b], [x + k * r * .4 + ph, y + r * 1.6]], { w: 3, color: P.navy }); }
  $.dot(x, y - b, r, P.pink, { w: 2.4 });
  for (const k of [-1, 1]) $.dot(x + k * r * .35 + r * .15, y - b - r * .15, r * .14, P.navy, { w: 1.2 });
  $.line($.qbez([x - r * .1, y - b + r * .3], [x + r * .2, y - b + r * .5], [x + r * .5, y - b + r * .28], 5), { w: 1.8, color: P.navy });
  if (running) $.wind(x - r * 4.2, y - b - r * .6, r * 1.6, t, 3);
}
function typewriter($, x, y, s, text, chars) {
  $.shape($.rect(x - 70 * s, y - 120 * s, 140 * s, 80 * s), { fill: P.white, h: { gap: 4, base: .25, solid: P.white, layers: [{ color: P.sky, alpha: .4 }] }, w: 2 });
  $.text(text, x, y - 80 * s, { font: `${Math.round(24 * s)}px "Special Elite", "SCV Type"`, align: 'center', color: P.navy, chars });
  $.shape([[x - 100 * s, y - 50 * s], [x + 100 * s, y - 50 * s], [x + 120 * s, y], [x - 120 * s, y]], { fill: P.navy, h: { gap: 2.4, base: .85, layers: [{ color: P.ink }] }, w: 2.4 });
  for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) $.dot(x - 78 * s + i * 26 * s + r * 12 * s, y - 34 * s + r * 16 * s, 5.5 * s, P.white, { w: 1.4 });
  $.shape($.rect(x - 110 * s, y - 62 * s, 220 * s, 12 * s), { fill: P.grey, h: { gap: 2, base: .8 }, w: 2 });
}
SCENES[2] = {
  bg($) {
    $.ground(20, 450, 520, 10, 'track');
    $.table(230, 1220, 300, 80, 'tan');
    $.ground(20, 450, 1300, 10, 'g2');
    $.ground(470, 820, 1255, 8, 'g2b');
  },
  fg($, S) {
    const T = S.T;
    $.sun(930, 60, 26, T);
    const running = S.on('go') || S.step === 6;
    const track = [[60, 470], [180, 430], [300, 470], [420, 430]];
    for (let i = 0; i < 20; i++) { const a = $.along(track, i / 20), b = $.along(track, (i + .5) / 20); $.line([a, b], { w: 2.4, color: '#2140d6', passes: 1 }); }
    const q = $.along(track, running ? (T * .35) % 1 : .15);
    beadMascot($, q[0], q[1] - 36, 26, T, running);
    const drawing = S.on('line') || S.step === 6;
    const L = drawing ? ((T * .4) % 1) : (S.step > 1 ? 1 : 0);
    const path = [[60, 760], [160, 700], [260, 780], [380, 720]];
    if (L > 0) { const pts = []; for (let i = 0; i <= 30 * L; i++) pts.push($.along(path, i / 30)); if (pts.length > 1) { $.seed('pl'); $.line(pts, { w: 3, color: '#2140d6' }); } }
    const tip = $.along(path, Math.max(.02, L)), pa = 2.24;
    const base = [tip[0] - 112 * Math.cos(pa), tip[1] - 112 * Math.sin(pa)];
    $.shape([[0, -8], [120, -8], [140, 0], [120, 8], [0, 8]].map(([px, py]) => [base[0] + (px * Math.cos(pa) - py * Math.sin(pa)) * .8, base[1] + (px * Math.sin(pa) + py * Math.cos(pa)) * .8]), { fill: P.straw, h: { gap: 2.4, base: .85 }, w: 2.2 });
    const typing = S.on('words') || S.step === 6;
    const word = '圆点到站';
    typewriter($, 230, 1220, 1.15, word, typing ? Math.floor(((S.on('words') ? S.since('words') : S.t) * 1.6) % (word.length + 2)) : (S.step > 2 ? 9 : 0));
    // the pop box and the spotlight
    const popK = grow(S, 3, .5, .8);
    $.shape($.rect(560, 1150, 160, 100), { fill: P.violet, h: { gap: 2.6, base: .8, layers: [{ color: P.lilac }] }, w: 2.6 });
    if (popK > 0) {
      const lift = 60 * $.backOut(popK);
      $.line([[600, 1150], [620, 1130 - lift * .3], [600, 1110 - lift * .6], [620, 1090 - lift]], { w: 3, color: P.navy });
      $.K.chart.ticket($.ctx, { id: 'demo', x: 640, y: 1060 - lift, w: 160, label: '卡片', tag: 'pop', pin: 'pink' }, { pop: .6 + .4 * $.backOut(popK), active: S.step >= 4 && (S.step > 4 || S.t > 1), at: T * 2 });
    }
    $.lamp(860, 1255, 300, .9, T, S.step >= 4);
    // II.7-8: the little people, the fire, the steam keep going
    if (S.step >= 6) {
      $.who('cook', 'stand', 520, 900, .6, 1, { t: T, arms: 'toss' });
      $.stove(660, 900, 110, T, true, { h: 50 });
      $.wok(662, 848, .55, T, { toss: true });
      for (let k = 0; k < 3; k++) $.steam(645 + k * 15, 820, T, k, 70, 5);
      $.ground(470, 820, 902, 6, 'g2c');
    }
    if (S.step >= 7) for (let i = 0; i < 3; i++) $.sparkle(900 + (i % 2) * 40, 560 + i * 90, 14, T + i, i % 2 ? 'pink' : 'straw');
  },
};

/* ------------------------------------------------------------------ III 四个声音 */
SCENES[3] = {
  bg($) {
    $.ground(40, 440, 562, 8, 'v1');
    $.ground(720, 1000, 640, 6, 'v2');
    $.ground(40, 440, 930, 8, 'v3');
    $.ground(720, 1000, 1180, 6, 'v4');
    $.ground(40, 440, 1300, 8, 'v5');
  },
  fg($, S) {
    const T = S.T;
    $.cloud(850 + Math.sin(T * .3) * 20, 80, 120, 50, { fill: 'white', hatch: 'sky' });
    // 蜡笔姐姐, left, next to her card
    const a1 = S.on('s1');
    const p1 = $.who('customer', 'stand', 190, 562, .72, 1, { t: T, arms: a1 ? 'wave' : 'hold', talk: a1 ? T : 0 });
    waves($, p1.head[0] + 30, p1.head[1] + 4, T, a1);
    $.bubble(330, 300, '生活里的小事', { side: 'left', size: 18, color: 'rose', pop: grow(S, 0, .4, .4) });
    // 图纸哥, right, with a blueprint
    const a2 = S.on('s2');
    const p2 = $.who('office', 'stand', 860, 640, .7, -1, { t: T, arms: 'hold', talk: a2 ? T : 0 });
    waves($, p2.head[0] - 30, p2.head[1] + 4, T, a2);
    $.sign(745, 520, 100, 70, '图纸', { size: 20, color: 'sky' });
    $.bubble(780, 360, '流程和原理', { side: 'right', size: 18, color: 'sky', pop: grow(S, 1, .4, .4) });
    // 元气少女, left lower, waving with sparkles
    const a3 = S.on('s3');
    const p3 = $.who('kid', 'stand', 180, 930, .62, 1, { t: T, arms: a3 ? 'up' : 'swing', talk: a3 ? T : 0 });
    waves($, p3.head[0] + 26, p3.head[1] + 4, T, a3);
    if (a3) for (let i = 0; i < 4; i++) $.sparkle(110 + i * 60, 720 + (i % 2) * 40, 14, T + i, i % 2 ? 'pink' : 'straw');
    $.bubble(320, 700, '好玩的事', { side: 'left', size: 18, color: 'straw', pop: grow(S, 2, .4, .4) });
    // 老师傅, right lower, on a stool with tea
    const a4 = S.on('s4');
    $.stool(860, 1112, 70, 68, 'blueL');
    const p4 = $.person($.pose.sit(860, 1110, .66, -1, { t: T, arms: 'hold', floor: 1180 }), { ...$.K.outfits.grandpa, t: T, talk: a4 ? T : 0 });
    $.cup(790, 1100, .7, { t: T, color: 'tan' });
    $.bubble(800, 940, '手艺和老行当', { side: 'right', size: 18, color: 'mint', pop: grow(S, 3, .4, .4) });
    // 你自己的声音: record a few seconds
    const own = S.step >= 5;
    mic($, 120, 1300, .8, T, S.on('own') && S.step === 6);
    $.phone(260, 1210, .8, { screen: 'call', text: own ? '录音中' : '', t: T, ring: S.step === 6 });
    if (S.step === 6 && Math.sin(T * 6) > 0) { $.dot(320, 1110, 9, 'red'); $.text('REC', 360, 1117, { font: '20px "Special Elite"', color: '#d81b4a' }); }
    if (S.step >= 4) $.sign(50, 970, 330, 58, '纯合成 · 无版权麻烦', { size: 22, color: 'cream' });
    if (S.step >= 7) $.sign(50, 1042, 330, 58, '教程：主页 · 文章', { size: 22, color: 'white' });
  },
};

/* ------------------------------------------------------------------ IV 发哪儿都合适 */
SCENES[4] = {
  bg($) {
    $.ground(20, 460, 1300, 10, 'r1');
    $.ground(740, 1000, 1300, 6, 'r2');
  },
  fg($, S) {
    const T = S.T;
    $.sun(930, 80, 30, T);
    $.bird(700, 160, .8, T);
    // device frames in each shape, the active one in pink
    frame($, 50, 700, 180, 240, '小红书 3:4', S.on('default') || S.step === 0, 1);
    frame($, 270, 700, 135, 240, '抖音 9:16', S.on('tall'), 1);
    frame($, 760, 680, 220, 124, '横屏 16:9', S.on('wide'), 1);
    frame($, 800, 870, 140, 140, '方图 1:1', S.on('square'), 1);
    // 2-3 minutes
    const lenOn = S.step >= 4;
    $.clock(150, 1150, 64, lenOn ? T : 0, { hour: 12, minute: 0, speed: lenOn ? 30 : 0, rim: 'red' });
    $.text('2–3 分钟', 150, 1250, { font: '24px "Special Elite", "SCV Type"', align: 'center', color: '#d81b4a' });
    // the hashtags
    sticker($, 330, 1110, '#AI玩家', 'rose', -.12, grow(S, 5, .5, .3));
    sticker($, 360, 1200, '#vive知识大赏', 'sky', .08, grow(S, 5, .5, .6));
    // "one minute, please"
    const c = $.who('student', 'stand', 930, 1300, .62, -1, { t: T, talk: S.step === 6 ? T : 0 });
    $.bubble(c.head[0] - 10, c.head[1] - 30, '一分钟就好', { side: 'right', size: 18, color: 'white', pop: S.step === 6 ? (S.t - .4) / .4 : S.step > 6 ? 1 : 0 });
    $.cat(680, 1300, .55, T, 'orange');
  },
};

/* ------------------------------------------------------------------ V 你喝茶，它干活 */
const PLATFORMS = ['Codex', 'Claude Code', 'Grok Build', 'Grok Bot', 'Muse'];
SCENES[5] = {
  bg($) {
    $.ground(10, 240, 1100, 6, 't1');
    $.ground(240, 1000, 1300, 14, 't2');
  },
  fg($, S) {
    const T = S.T;
    $.sun(930, 80, 30, T);
    $.clock(720, 130, 46, T, { speed: 8, hour: 15 });
    // you: ask, drink tea, come back with the film
    const tea = S.on('y2');
    $.stool(110, 1032, 60, 68, 'pink');
    const me = $.pose.sit(110, 1030, .7, 1, { t: T, arms: tea ? 'hold' : 'phone', floor: 1100 });
    $.person(me, { ...$.K.outfits.customer, t: T, talk: S.on('y1') ? T : 0 });
    if (tea) $.cup(me.haF[0] + 14, me.haF[1] + 16, .6, { t: T, color: 'rose' });
    else $.phone(me.haF[0] + 8, me.haF[1] + 2, .38, { screen: S.step >= 5 ? 'map' : 'chat', t: T });
    if (tea) $.think(120, 820, '真香', { pop: (S.since('y2') - .3) / .4, size: 20 });
    // the platforms it runs in
    PLATFORMS.forEach((name, i) => {
      const x = 300 + i * 120, busy = S.step >= 2 && S.step <= 4;
      $.laptop(x, 1250, .62, { t: T + i, typing: busy || S.step >= 7 });
      $.text(name, x, 1288, { font: '17px "Special Elite", "Courier Prime"', align: 'center', color: '#16246e' });
      if (S.step === 7) $.check(x + 30, 1180, .7, 'greenD', c01((S.t - .4 - i * .2) / .4));
    });
    $.sign(850, 1170, 130, 64, 'WorkBuddy\n即将支持', { size: 16, color: 'white' });
    // posted: likes rise
    if (S.step >= 6) likes($, 700, 1130, T, 5);
    // thanks, release, follow
    if (S.step >= 9) $.sign(255, 990, 230, 120, '灵感来自\nAnn Nguyen\n@ann_nnng', { size: 18, color: 'cream' });
    if (S.step >= 10) { $.K.chart.stamp($.ctx, 830, 215, '马上发布', { k: S.step === 10 ? 1.6 - .6 * $.backOut(c01((S.t - .5) / .4)) : 1, alpha: S.step === 10 ? c01((S.t - .4) / .2) : 1, angle: -.1 }); }
    if (S.step >= 11) $.sign(760, 990, 225, 64, '关注 @leo_xiaolei', { size: 19, color: 'rose' });
  },
};

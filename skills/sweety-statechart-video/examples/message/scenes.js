// scenes.js — 《一条消息的旅程》: the living pictures around each chart (v2 engine). The poster is 1000 x 1333 units.
// S.T film seconds, S.on(id) active now, S.since(id) chart-time since it became active (99 long ago, -1 not active),
// S.step current step (0-based), S.t chart-time in the step. Set pieces ($.set) carry the big scenes; an exit step has
// no state on, so the pictures follow S.step to stay where the story got to.

const MSG = '今晚吃火锅？';
const clamp01 = v => Math.max(0, Math.min(1, v));
const prog = (S, id, d = 1.2) => { const k = S.since(id); return k < 0 ? 0 : k >= 99 ? 1 : clamp01((k - .5) / d); };

// a spinner of dots, the "sending" circle
function spinner($, x, y, r, t) {
  for (let i = 0; i < 8; i++) {
    const a = t * 5 + i * Math.PI / 4;
    $.blob(x + Math.cos(a) * r, y + Math.sin(a) * r, 3 + i * .45, 'ink', .25 + i * .09);
  }
}
// read receipts: one or two checks, blue when read
function checks($, x, y, n, read) {
  for (let i = 0; i < n; i++) $.check(x + i * 14, y, .55, read ? 'blue' : 'grey');
}
// a soft crayon wall with a ragged top
function wall($, x0, y0, x1, y1, color, cross) {
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
function windowPane($, x, y, w, h, night) {
  $.shape($.rect(x - 6, y - 6, w + 12, h + 12), { fill: 'cream', h: { base: .5, gap: 3.4, solid: $.C.white } });
  $.hatch($.rect(x, y, w, h), { color: night ? 'navy' : 'sky', base: night ? .75 : .5, gap: 3.6, layers: [{ color: night ? 'violet' : 'blueL', alpha: .5 }] });
  $.line([[x + w / 2, y], [x + w / 2, y + h]], { color: 'creamD', w: 4 }); $.line([[x, y + h / 2], [x + w, y + h / 2]], { color: 'creamD', w: 4 });
  $.line($.rect(x, y, w, h), { closed: true, w: 2.2 });
}
function sofa($, x, y, w, color) {           // y = floor
  $.shape($.rect(x - w / 2, y - 92, w, 50), { fill: color, h: { gap: 2.6, base: .8, solid: $.C.white }, w: 2.6 });
  $.shape($.rect(x - w / 2 - 10, y - 50, w + 20, 34), { fill: color, h: { gap: 2.6, base: .85, solid: $.C.white }, w: 2.6 });
  for (const d of [-1, 1]) $.shape($.rect(x + d * (w / 2 + 6) - 12, y - 74, 24, 58), { fill: color, h: { gap: 2.4, base: .9, solid: $.C.white }, w: 2.4 });
  for (const d of [-1, 1]) $.line([[x + d * (w / 2 - 6), y - 16], [x + d * (w / 2 - 4), y]], { w: 3 });
}
// a snail carrying something slowly (the late receipt)
function snail($, x, y, s, t) {
  $.seed('snail' + Math.round(x));
  const pts = [];
  for (let i = 0; i < 40; i++) { const a = i * .45, r = 3 + i * .62; pts.push([x + Math.cos(a) * r * s, y - 26 * s + Math.sin(a) * r * s]); }
  $.shape($.smooth([[x - 46 * s, y], [x - 30 * s, y - 10 * s], [x + 34 * s, y - 8 * s], [x + 40 * s, y]], 1), { fill: 'lilac', h: { gap: 2.4, base: .8 }, w: 2 });
  $.shape($.ell(x, y - 26 * s, 26 * s, 24 * s, 22), { fill: 'ochre', h: { gap: 2.4, base: .8, layers: [{ color: 'orange', alpha: .6 }] }, w: 2.2 });
  $.line(pts, { w: 1.8, passes: 1 });
  const bob = Math.sin(t * 3) * 2 * s;
  $.line([[x - 38 * s, y - 8 * s], [x - 46 * s, y - 30 * s + bob]], { w: 2 }); $.dot(x - 46 * s, y - 32 * s + bob, 3 * s, 'navy');
  $.line([[x - 32 * s, y - 8 * s], [x - 34 * s, y - 28 * s - bob]], { w: 2 }); $.dot(x - 34 * s, y - 30 * s - bob, 3 * s, 'navy');
}

/* ------------------------------------------------------------------ I 发出去 */
SCENES[1] = {
  bg($) {
    // your room: a wall, a shelf of books with the router on top
    wall($, 0, 254, 400, 640, 'sky', 'blueL');
    floorBand($, 0, 400, 640, 18);
    $.shelf(236, 640, 150, 2, { rowH: 50 });
    // the friend's room, bottom right
    wall($, 660, 784, 1000, 1290, 'mint', 'teal');
    windowPane($, 700, 830, 130, 100, false);
    floorBand($, 660, 1000, 1290, 30);
    sofa($, 900, 1290, 150, 'rose');
  },
  fg($, S) {
    const T = S.T, st = S.step, failed = S.on('failed');
    $.sun(930, 90, 32, T);
    $.cloud(820 + Math.sin(T * .3) * 24, 150, 130, 54, { fill: failed ? 'grey' : 'white', hatch: failed ? 'lilac' : 'sky' });
    $.tower(700, 236, .78, T, !failed);
    // you type, on the stool
    $.stool(124, 560, 70, 80, 'pink');
    const me = $.pose.sit(124, 560, .82, 1, { t: T, arms: 'phone', floor: 640 });
    $.person(me, { ...$.K.outfits.student, t: T, face: failed ? 'worried' : S.on('read') || st >= 7 ? 'happy' : 'neutral' });
    $.phone(me.haF[0] + 8, me.haF[1] + 2, .42, { screen: 'chat', t: T, tilt: .1 });
    $.lamp(26, 640, 170, .9, T, true);
    // the bubble and its status
    const typing = S.on('typing');
    const chars = typing ? Math.floor(clamp01((S.since('typing') - .3) / 2.2) * MSG.length) : MSG.length;
    $.bubble(340, 430, chars < MSG.length ? MSG.slice(0, chars) + '…' : MSG, { side: 'right', size: 24, color: 'green', pop: st === 0 ? (S.t - .2) / .5 : 1 });
    if (S.on('sending')) spinner($, 366, 364, 12, T);
    if (failed) { $.dot(368, 364, 13, 'red'); $.text('!', 368, 373, { font: '22px "Special Elite"', align: 'center', color: $.C.white }); }
    if (S.on('sent')) checks($, 358, 368, 1, false);
    if (S.on('delivered')) checks($, 352, 368, 2, false);
    if (S.on('read') || st >= 7) checks($, 352, 368, 2, true);
    // the router on the shelf: no bars without a network
    $.K.props.box($.ctx, 268, 540, 90, 26, { color: 'grey' });
    $.wifi(313, 528, 1.1, T, failed ? 0 : 3);
    if (failed) $.mark(313, 470, '×', { color: 'red' });
    // the paper plane takes off when the server takes the message
    if (S.on('sent')) { const f = clamp01((S.since('sent') - .2) / 1.2); $.enter('fade', 1 - f, () => $.paperPlane(330 + f * 60, 300 - f * 40, .9, -.4)); }
    // the street outside: rain when there is no network
    const street = $.set('street', { x0: 0, y0: 660, x1: 400, y1: 1333 }, { mode: failed ? 'rain' : 'day', t: T });
    $.cloud(110 + Math.sin(T * .25) * 20, 740, 150, 56, { fill: failed ? 'grey' : 'white', hatch: failed ? 'lilac' : 'sky' });
    $.cloud(300 + Math.sin(T * .2 + 1) * 16, 820, 120, 46, { fill: failed ? 'grey' : 'white', hatch: failed ? 'lilac' : 'sky' });
    if (!failed) { $.plane(330 - ((T * 30) % 420) + 140, 708, .32, T, { trail: true }); $.bird(160, 860, .7, T); $.bird(200, 880, .6, T + 1); }
    // the server room, top right: busy while it takes the message
    $.set('servers', { x0: 660, y0: 360, x1: 1000, y1: 764 }, { mode: S.on('sending') || S.on('sent') ? 'overload' : 'ok', t: T });
    if (S.on('sent')) { const f = clamp01((S.since('sent') - .6) / 1); $.paperPlane(690 + f * 70, 420 + f * 50, .8, .5); }
    // the network in between
    $.wifi(590, 990, 1.5, T, failed ? 0 : 3);
    if (failed) $.mark(590, 900, '×', { color: 'red' });
    $.dog(590, 1250, .62, T, 'tan');
    // the friend: the phone rings when the message lands, then she reads it
    const ring = S.on('delivered'), read = S.on('read') || st >= 7;
    const friend = $.who('customer', 'stand', 800, 1290, .84, 1, { t: T, arms: 'phone', face: read ? 'happy' : ring ? 'surprised' : 'neutral' });
    $.phone(friend.haF[0] + 8, friend.haF[1] + 2, .44, { screen: read ? 'chat' : 'blank', t: T, ring, badge: ring ? '1' : null, pop: ring ? (S.since('delivered') - 1) / .4 : 0, tilt: .1 });
    if (S.on('delivered')) { const f = clamp01((S.since('delivered') - .2) / 1.2); $.envelope(860 - f * 40, 800 + f * 260, .7, { stamp: true }); }
    if (read) $.bubble(900, 1020, '好呀！', { side: 'right', size: 22, color: 'white', pop: S.on('read') ? (S.since('read') - .5) / .5 : 1 });
    $.cat(960, 1290, .55, T, 'grey');
  },
};

/* ------------------------------------------------------------------ II 手机和服务器 */
SCENES[2] = {
  bg($) {
    // the lift lobby, bottom left
    wall($, 0, 900, 330, 1250, 'cream', 'peach');
    floorBand($, 0, 330, 1250, 10);
    $.shape($.rect(64, 1000, 172, 250), { fill: 'grey', h: { gap: 3.4, base: .45, solid: $.C.white, layers: [{ color: 'lilac', alpha: .5 }] }, w: 3 });
    // a park bench at the bottom right, where you wait for the ticks
    $.bench(860, 1300, 190, 'green');
    $.ground(730, 1000, 1302, 6, 'park');
    $.line([[730, 880], [990, 896]], { w: 1.8, color: 'brown' });
  },
  fg($, S) {
    const T = S.T, st = S.step;
    $.clock(700, 120, 48, T, { speed: 4, hour: 18 });
    $.sun(910, 100, 32, T);
    $.cloud(820 + Math.sin(T * .3) * 20, 200, 110, 44, { fill: 'white', hatch: 'sky' });
    $.bird(820, 190, .9, T);
    // the mast and the bars: no waves while the phone has no signal
    const online = S.on('on');
    $.tower(60, 850, 1.05, T, online);
    for (let i = 0; i < 4; i++) $.shape($.rect(24 + i * 20, 420 - i * 16, 14, 30 + i * 16), { fill: online || i === 0 ? 'green' : 'grey', h: { gap: 2.4, base: .85, solid: $.C.white }, w: 2 });
    if (!online) $.mark(60, 330, '×', { color: 'red' });
    // the lift: shut with her inside (no signal), open with her stepping out (online)
    const open = online ? clamp01((S.since('on') - .4) / .8) : 0;
    $.sign(74, 950, 152, 40, `电梯 ${online ? 1 : Math.floor(1 + (T * 1.5) % 9)}F`, { size: 21, color: 'cream', ink: 'red' });
    if (open > 0) $.hatch($.rect(70, 1006, 160, 244), { color: 'yolk', base: .5, gap: 3.4 });
    for (const d of [-1, 1]) { const w = 80 * (1 - open * .9); $.shape($.rect(d < 0 ? 70 : 230 - w, 1006, w, 244), { fill: 'grey', h: { gap: 3, base: .7, solid: $.C.white, layers: [{ color: 'blue', alpha: .35, angle: -1.5, gap: 7 }] }, w: 2.4 }); }
    if (online) {
      const k = clamp01((S.since('on') - .6) / 1.2);
      const p = $.who('customer', 'walk', 150 + k * 110, 1250, .8, 1, { t: T * (k < 1 ? 1 : 0), arms: 'phone', face: S.on('on') && S.on('push') ? 'surprised' : 'happy' });
      const pushing = S.on('push');
      $.phone(p.haF[0] + 8, p.haF[1] + 2, .42, { screen: 'chat', t: T, ring: pushing, badge: pushing ? '1' : null, pop: pushing ? (S.since('push') - .8) / .4 : 0 });
    } else $.wifi(290, 1010, .8, 0, 0);
    // the server room: messages pile up while she is away; a push flies out when she is back
    const holding = S.on('store'), pushing = S.on('push');
    $.set('servers', { x0: 340, y0: 860, x1: 680, y1: 1262 }, { mode: 'ok', t: T, cast: { hero: { shirt: 'straw' } } });
    const pile = holding ? Math.min(3, 1 + Math.floor(st / 3)) : 0;
    for (let i = 0; i < pile; i++) $.envelope(560, 1028 - i * 24 - (i === pile - 1 && S.since('store') < 1.5 ? (1 - clamp01((S.since('store') - .3) / .8)) * 70 : 0), .75, { stamp: true });
    if (pushing) { const f = clamp01((S.since('push') - .2) / 1.2); const q = $.along([[560, 1000], [420, 930], [300, 1050]], f); $.envelope(q[0], q[1], .7, { stamp: true }); }
    // the queue of waiting messages, hung on a line
    const waiting = holding ? pile : 0;
    for (let i = 0; i < 4; i++) $.enter('pop', i < waiting ? 1 : 0, () => $.envelope(770 + i * 56, 912 + i * 4, .62, { stamp: true }), { at: [770 + i * 56, 900] });
    // you, on the bench: the ticks turn up when the push lands
    const me = $.who('student', 'sit', 840, 1252, .78, 1, { t: T, arms: 'phone', floor: 1300, face: S.step >= 4 ? 'happy' : 'neutral' });
    $.phone(me.haF[0] + 8, me.haF[1] + 2, .38, { screen: 'chat', t: T, tilt: .1 });
    if (st >= 4) checks($, 900, 1110, 2, false);
    $.cat(966, 1300, .5, T, 'grey');
  },
};

/* ------------------------------------------------------------------ III 收到两条 */
SCENES[3] = {
  bg($) {
    wall($, 0, 384, 360, 680, 'sky', 'blueL');
    floorBand($, 0, 360, 680, 14);
  },
  fg($, S) {
    const T = S.T, st = S.step;
    // you wait for a receipt
    $.stool(110, 600, 70, 80, 'pink');
    const me = $.pose.sit(110, 600, .82, 1, { t: T, arms: 'phone', floor: 680 });
    $.person(me, { ...$.K.outfits.student, t: T, face: st === 3 ? 'worried' : 'neutral' });
    $.phone(me.haF[0] + 8, me.haF[1] + 2, .42, { screen: 'chat', t: T, tilt: .1 });
    $.bubble(300, 482, MSG, { side: 'right', size: 22, color: 'green' });
    if (S.on('wait') || S.on('out')) spinner($, 322, 420, 11, T);
    if (S.on('ok')) checks($, 310, 424, 2, false);
    // three seconds: the alarm rings at the resend
    const resend = st === 3;
    $.clock(930, 90, 44, T, { speed: 2, hour: 9 });
    $.alarm(930, 330, .9, T, resend);
    $.text('3 秒', 930, 390, { font: '26px "Special Elite", "SCV Type"', align: 'center', color: $.C.red });
    $.hourglass(930, 560, .9, T, { p: resend ? clamp01(S.t / 1.5) : .1 });
    $.lantern(800, 120, 1, T); $.lantern(800, 250, 1, T + 1);
    // the pipeline along the bottom: your side, the server, her phone
    $.set('desk', { x0: 0, y0: 800, x1: 300, y1: 1333 }, { mode: 'typing', t: T });
    $.sign(40, 860, 210, 48, '发送方', { size: 24, color: 'cream', hang: 30 });
    $.sign(400, 830, 200, 48, '服务器', { size: 24, color: 'mint', hang: 0 });
    $.set('servers', { x0: 300, y0: 860, x1: 690, y1: 1333 }, { mode: st >= 3 && st <= 4 ? 'overload' : 'ok', t: T, cast: { hero: { shirt: 'straw' } } });
    // her phone shows one bubble, then the same bubble twice
    const twice = S.on('twice') || st >= 5;
    const fr = $.who('customer', 'stand', 760, 1300, .84, 1, { t: T, arms: 'phone', face: twice ? 'surprised' : 'happy' });
    $.phone(fr.haF[0] + 8, fr.haF[1] + 2, .42, { screen: 'chat', t: T, ring: S.on('twice') && S.since('twice') < 3, tilt: .1 });
    $.bubble(830, 1010, MSG, { side: 'left', size: 15, color: 'white' });
    if (twice) $.bubble(830, 1070, MSG, { side: 'left', size: 15, color: 'white', pop: S.on('twice') && S.since('twice') < 9 ? (S.since('twice') - .6) / .5 : 1 });
    if (twice) $.mark(fr.head[0] + 6, fr.head[1] - 46, '?', { pop: 1 });
    // messages fly to her; the receipt crawls back on a snail
    const path = [[220, 880], [500, 840], [800, 900]];
    const q = $.along(path, (T * .35) % 1);
    $.envelope(q[0], q[1], .6, { stamp: true });
    if (st >= 3) { const q2 = $.along(path, (T * .35 + .5) % 1); $.envelope(q2[0], q2[1], .6, { stamp: true }); }
    const sx = 980 - ((T * 12) % 160);
    snail($, sx, 1300, .9, T);
    $.envelope(sx + 4, 1230, .45, { open: .2 });
    $.text('回执', sx + 4, 1213, { font: '16px "Special Elite", "SCV Type"', align: 'center', color: $.C.red });
    // the fix: number every message, drop the copy
    if (st >= 6) {
      $.enter('pop', st > 6 ? 1 : clamp01((S.t - .6) / .6), () => $.sign(30, 700, 330, 64, '每条消息编个号  #7', { size: 22, color: 'cream' }), { at: [195, 732] });
      $.cross(960, 1050, .9, 'red');
    }
  },
};

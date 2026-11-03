// scenes.js — 《一条消息的旅程》: the living pictures around each chart. The poster is 1000 x 1333 units.
// S.T film seconds, S.on(id) active now, S.since(id) chart-time since it became active (99 long ago, -1 not active),
// S.at(k) chart-time since step k began (-1 before, 99 after), S.step current step (0-based), S.t chart-time in the step.

const MSG = '今晚吃火锅？';
const clamp01 = v => Math.max(0, Math.min(1, v));

// a spinner of dots, the "sending" circle
function spinner($, x, y, r, t) {
  for (let i = 0; i < 8; i++) {
    const a = t * 5 + i * Math.PI / 4;
    $.blob(x + Math.cos(a) * r, y + Math.sin(a) * r, 3 + i * .45, '#2140d6', .25 + i * .09);
  }
}
// read receipts: one or two checks, blue when read
function checks($, x, y, n, read) {
  for (let i = 0; i < n; i++) $.check(x + i * 14, y, .55, read ? 'blue' : 'grey');
}
// a snail carrying something slowly (the late receipt)
function snail($, x, y, s, t) {
  $.seed('snail' + Math.round(x));
  const pts = [];
  for (let i = 0; i < 40; i++) { const a = i * .45, r = 3 + i * .62; pts.push([x + Math.cos(a) * r * s, y - 26 * s + Math.sin(a) * r * s]); }
  $.shape($.smooth([[x - 46 * s, y], [x - 30 * s, y - 10 * s], [x + 34 * s, y - 8 * s], [x + 40 * s, y]], 1), { fill: '#a7a2ee', h: { gap: 2.4, base: .8 }, w: 2 });
  $.shape($.ell(x, y - 26 * s, 26 * s, 24 * s, 22), { fill: '#e39a1c', h: { gap: 2.4, base: .8, layers: [{ color: '#ff7f1e', alpha: .6 }] }, w: 2.2 });
  $.line(pts, { w: 1.8, passes: 1 });
  const bob = Math.sin(t * 3) * 2 * s;
  $.line([[x - 38 * s, y - 8 * s], [x - 46 * s, y - 30 * s + bob]], { w: 2 }); $.dot(x - 46 * s, y - 32 * s + bob, 3 * s, '#16246e');
  $.line([[x - 32 * s, y - 8 * s], [x - 34 * s, y - 28 * s - bob]], { w: 2 }); $.dot(x - 34 * s, y - 30 * s - bob, 3 * s, '#16246e');
}

/* ------------------------------------------------------------------ I 发出去 */
SCENES[1] = {
  bg($) {
    $.ground(30, 440, 640, 8, 'room1');
    $.table(860, 900, 220, 80, 'blueL');
    $.ground(700, 1000, 1290, 8, 'recv');
    $.bench(220, 1290, 220, 'green');
    $.tree(400, 1290, .9, 0);
    $.ground(20, 460, 1292, 10, 'park');
  },
  fg($, S) {
    const T = S.T;
    $.sun(930, 90, 32, T);
    $.cloud(780 + Math.sin(T * .3) * 24, 120, 130, 54, { fill: 'white', hatch: 'sky' });
    $.tower(735, 240, .7, T, !S.on('failed'));
    // the sender types
    $.stool(130, 560, 70, 80, 'pink');
    const me = $.pose.sit(130, 560, .82, 1, { t: T, arms: 'phone', floor: 640 });
    $.person(me, { ...$.K.outfits.student, t: T });
    $.phone(me.haF[0] + 8, me.haF[1] + 2, .42, { screen: 'chat', t: T, tilt: .1 });
    // the bubble and its status
    const typing = S.on('typing');
    const chars = typing ? Math.floor(clamp01((S.since('typing') - .3) / 2.2) * MSG.length) : MSG.length;
    if (S.step >= 0) $.bubble(330, 420, chars < MSG.length ? MSG.slice(0, chars) + '…' : MSG, { side: 'right', size: 24, color: 'green', pop: S.step === 0 ? (S.t - .2) / .5 : 1 });
    if (S.on('sending')) spinner($, 360, 352, 12, T);
    if (S.on('failed')) { $.dot(362, 352, 13, '#d81b4a'); $.text('!', 362, 361, { font: '22px "Special Elite"', align: 'center', color: '#fdfcf8' }); }
    if (S.on('sent')) checks($, 352, 356, 1, false);
    if (S.on('delivered')) checks($, 346, 356, 2, false);
    if (S.on('read') || S.step >= 7) checks($, 346, 356, 2, true);
    // the router: no bars when there is no network
    $.shelf(30, 1060, 210, 3, { rowH: 56 });
    $.lamp(330, 1060, 190, 1, T, true);
    $.box(80, 886, 110, 30, { color: 'grey' });
    $.wifi(135, 872, 1.4, T, S.on('failed') ? 0 : 3);
    $.flowerPot(270, 1060, .9, T, 'rose');
    $.ground(20, 440, 1062, 8, 'shelf');
    if (S.on('failed')) { $.cloud(330, 720, 150, 64, { fill: 'grey', hatch: 'lilac' }); $.rain(260, 750, 150, 110, T, 14, 1); $.mark(135, 760, '×', { color: 'red' }); }
    // the paper plane: to the server when sent, to the friend when delivered
    let plane = null;
    if (S.on('sent')) { const f = clamp01((S.since('sent') - .2) / 1.4); plane = $.along([[340, 450], [600, 560], [860, 740]], f); }
    if (S.on('delivered')) { const f = clamp01((S.since('delivered') - .2) / 1.4); plane = $.along([[860, 760], [920, 940], [860, 1060]], f); }
    if (plane) $.paperPlane(plane[0], plane[1], 1, .4);
    // the server on its table
    $.server(860, 900, .9, { t: T, busy: S.on('sent') || S.on('sending'), units: 3 });
    $.sign(790, 650, 140, 44, '服务器', { size: 22, color: 'cream' });
    // the friend: phone rings when the message lands, then reads it
    const friend = $.who('customer', 'stand', 860, 1290, .8, -1, { t: T, arms: 'phone' });
    const ring = S.on('delivered');
    $.phone(friend.haF[0] - 8, friend.haF[1] + 2, .42, { screen: S.on('read') || S.step >= 7 ? 'chat' : 'blank', t: T, ring, badge: ring ? '1' : null, pop: ring ? (S.since('delivered') - 1) / .4 : 0, tilt: -.1 });
    if (S.on('read') || S.step >= 7) $.bubble(800, 1010, '好呀！', { side: 'left', size: 22, color: 'white', pop: S.on('read') ? (S.since('read') - .5) / .5 : 1 });
    $.dog(120, 1290, .7, T, 'tan');
  },
};

/* ------------------------------------------------------------------ II 手机和服务器 */
SCENES[2] = {
  bg($) {
    $.ground(20, 560, 1292, 10, 'lobby');
    $.ground(580, 1000, 1292, 8, 'room2');
    $.building(470, 1290, 150, 380, { color: 'lilac' });
  },
  fg($, S) {
    const T = S.T;
    $.clock(700, 120, 48, T, { speed: 4, hour: 18 });
    $.sun(910, 100, 32, T);
    $.bird(820, 190, .9, T);
    // the mast: no waves while the phone has no signal
    const online = S.on('on');
    $.tower(110, 760, 1.1, T, online);
    // the lift: closed with the friend inside (no signal), open with the friend outside (online)
    const inLift = !online;
    const open = online ? clamp01((S.since('on') - .4) / .8) : 0;
    $.sign(70, 1006, 150, 44, `电梯 ${inLift ? Math.floor(1 + (T * 1.5) % 9) : 1}F`, { size: 22, color: 'cream', ink: 'red' });
    $.door(80, 1290, 130, 230, open, { color: 'grey', frame: 'cream' });
    if (inLift) { $.wifi(300, 1010, .8, 0, 0); $.mark(300, 970, '×', { color: 'red' }); }
    if (online) {
      const p = $.who('customer', 'stand', 290, 1290, .82, -1, { t: T, arms: 'phone' });
      const pushing = S.on('push');
      $.phone(p.haF[0] - 8, p.haF[1] + 2, .42, { screen: 'chat', t: T, ring: pushing, badge: pushing ? '1' : null, pop: pushing ? (S.since('push') - .8) / .4 : 0 });
    }
    // the server room: racks blink; held messages pile up; a push flies out to the phone
    const holding = S.on('store'), pushing = S.on('push');
    $.server(700, 1290, .95, { t: T, busy: holding || pushing, units: 4 });
    $.server(830, 1290, .95, { t: T + 1.3, busy: pushing, units: 4 });
    $.sign(650, 880, 240, 46, '服务器机房', { size: 22, color: 'cream' });
    const pile = holding ? Math.min(3, 1 + Math.floor(S.step / 3)) : 0;
    for (let i = 0; i < pile; i++) $.envelope(700, 1080 - i * 26 - (i === pile - 1 && S.since('store') < 1.5 ? (1 - clamp01((S.since('store') - .3) / .8)) * 80 : 0), .8, { stamp: true });
    if (pushing) { const f = clamp01((S.since('push') - .2) / 1.2); const q = $.along([[700, 1060], [520, 960], [330, 1080]], f); $.envelope(q[0], q[1], .7, { stamp: true }); }
    $.cat(960, 1290, .55, T, 'grey');
  },
};

/* ------------------------------------------------------------------ III 收到两条 */
SCENES[3] = {
  bg($) {
    $.ground(20, 350, 640, 8, 'me3');
    $.ground(20, 1000, 1292, 14, 'floor3');
    $.table(250, 1180, 260, 90, 'tan');
    $.table(800, 1180, 260, 90, 'blueL');
  },
  fg($, S) {
    const T = S.T;
    // the sender waits for a receipt
    $.stool(110, 560, 70, 80, 'pink');
    const me = $.pose.sit(110, 560, .82, 1, { t: T, arms: 'phone', floor: 640 });
    $.person(me, { ...$.K.outfits.student, t: T });
    $.phone(me.haF[0] + 8, me.haF[1] + 2, .42, { screen: 'chat', t: T, tilt: .1 });
    $.bubble(300, 420, MSG, { side: 'right', size: 22, color: 'green' });
    if (S.on('wait') || S.on('out')) spinner($, 330, 356, 11, T);
    if (S.on('ok')) checks($, 318, 360, 2, false);
    // three seconds: the alarm rings at the resend
    const resend = S.step === 3;
    $.alarm(920, 300, .9, T, resend);
    $.text('3 秒', 920, 360, { font: '26px "Special Elite", "SCV Type"', align: 'center', color: '#d81b4a' });
    // the sender's phone, the server, the friend's phone, along the bottom
    $.laptop(250, 1180, 1.1, { t: T, typing: S.on('wait') || resend });
    $.text('发送方', 250, 1220, { font: '20px "Special Elite", "SCV Type"', align: 'center', color: '#16246e' });
    $.server(530, 1290, .9, { t: T, busy: true, units: 4 });
    $.text('服务器', 530, 1320, { font: '20px "Special Elite", "SCV Type"', align: 'center', color: '#16246e' });
    $.phone(800, 1060, 1.3, { screen: 'blank', t: T, ring: S.on('twice') && S.since('twice') < 3 });
    // the friend's phone shows one bubble, then the same bubble twice
    const twice = S.on('twice') || S.step >= 5;
    $.bubble(770, 990, MSG, { side: 'left', size: 15, color: 'white' });
    if (twice) $.bubble(770, 1050, MSG, { side: 'left', size: 15, color: 'white', pop: S.on('twice') && S.since('twice') < 9 ? (S.since('twice') - .6) / .5 : 1 });
    if (twice) $.mark(900, 900, '?', { pop: 1 });
    // messages fly to the friend; the receipt crawls back on a snail
    const f1 = ((T * .35) % 1);
    const q = $.along([[300, 1100], [530, 980], [760, 1000]], f1);
    $.envelope(q[0], q[1] - 20, .6, { stamp: true });
    if (S.step >= 3) { const f2 = ((T * .35 + .5) % 1), q2 = $.along([[300, 1100], [530, 980], [760, 1000]], f2); $.envelope(q2[0], q2[1] - 20, .6, { stamp: true }); }
    const sx = 700 - ((T * 12) % 260);
    snail($, sx, 1292, .9, T);
    $.envelope(sx + 4, 1222, .45, { open: .2 });
    $.text('回执', sx + 4, 1205, { font: '16px "Special Elite", "SCV Type"', align: 'center', color: '#d81b4a' });
    // the fix: number every message, drop the copy
    if (S.step >= 6) {
      $.sign(40, 700, 330, 64, '每条消息编个号  #7', { size: 22, color: 'cream' });
      $.cross(960, 1050, .9, 'red');
    }
  },
};

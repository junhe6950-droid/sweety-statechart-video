// scenes.js — 《一份外卖的一生》: the living pictures around each chart (v2 engine).
// SCENES[n] = { bg($) static, fg($, S) every frame }. Units: the poster is 1000 x 1333.
// Big scenes are set pieces ($.set), placed on the free areas of `scv.py layout`. S.T film seconds, S.on(id) active now,
// S.since(id) chart-time since it became active, S.step the step. An exit step has no state on, so the pictures
// follow S.step to stay where the story got to.

const prog = (S, id, d = 1.2) => { const k = S.since(id); return k < 0 ? 0 : k >= 99 ? 1 : Math.max(0, Math.min(1, (k - .5) / d)); };
const landed = (S, k, d = 1) => S.step > k ? 1 : S.step === k ? Math.max(0, Math.min(1, (S.t - .6) / d)) : 0;
// a soft crayon wall with a ragged top: a colour mass behind one corner of the story
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

/* ------------------------------------------------------------------ I 一份订单 */
SCENES[1] = {
  bg($) {
    // the customer's room, top left
    wall($, 0, 254, 362, 575, 'peach', 'tan');
    windowPane($, 198, 292, 126, 92, false);
    floorBand($, 0, 362, 575, 20);
    $.lamp(34, 575, 160, .9, 0, false);
    $.table(282, 512, 92, 63, 'tan');
    // outside the noodle shop, bottom left: awning, a window, the road
    $.hatch($.rect(0, 1012, 362, 200), { color: 'cream', base: .45, gap: 4, layers: [{ color: 'peach', alpha: .5 }] });
    for (let i = 0; i < 8; i++) { const ax = i * 46; $.shape([[ax, 1012], [ax + 46, 1012], [ax + 46, 1042], [ax + 23, 1054], [ax, 1042]], { fill: i % 2 ? 'white' : 'red', h: { gap: 2.4, base: .8, solid: $.C.white }, w: 2 }); }
    $.hatch($.rect(16, 1070, 150, 96), { color: 'sky', base: .5, gap: 4, layers: [{ color: 'blueL', alpha: .5, angle: -.7, gap: 8 }] });
    $.line($.rect(16, 1070, 150, 96), { closed: true, w: 2.2 });
    $.sign(200, 1076, 120, 40, '牛肉面', { size: 22, color: 'navy', ink: 'white' });
    floorBand($, 0, 362, 1212, 22);
    $.road(0, 362, 1234, 0, { h: 64 });
    // the block of flats, right: its sign, windows, and a door at the foot
    $.shape($.rect(786, 566, 212, 734), { fill: 'lilac', h: { gap: 3.4, base: .45, solid: $.C.white, layers: [{ color: 'lilac', alpha: .5 }, { color: 'violet', angle: .5, gap: 9, alpha: .25 }] }, w: 3 });
    $.sign(800, 520, 186, 38, '幸福小区', { size: 22, color: 'red', ink: 'white' });
    $.line([[968, 520], [968, 462]], { w: 2.6 }); $.line([[952, 476], [984, 476]], { w: 2 }); $.line([[956, 490], [980, 490]], { w: 2 });
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
      if (c === 0) continue;                                             // the lift runs up the first column
      const lit = (r * 3 + c * 2) % 5 === 0;
      $.shape($.rect(812 + c * 48, 600 + r * 60, 26, 30), { fill: lit ? 'yolk' : 'sky', h: { gap: 2.6, base: .7, solid: $.C.white }, w: 1.8 });
    }
    // the lift shaft, between the chart and the flats
    $.hatch($.rect(652, 846, 96, 454), { color: 'grey', base: .35, gap: 4.2, layers: [{ color: 'lilac', alpha: .5 }] });
    $.line($.rect(652, 846, 96, 454), { closed: true, w: 2.8 });
    for (let k = 1; k <= 8; k++) { const y = 1300 - (k - 1) * 54; $.line([[652, y], [672, y]], { w: 1.6, passes: 1 }); $.text(String(k), 662, y - 30, { font: '13px "Courier Prime"', align: 'center', color: $.C.navy }); }
    // the change table, beside the refund card
    $.table(670, 650, 168, 62, 'blueL');
    // pots by the flats' door
    $.flowerPot(546, 1300, .8, 0, 'pink');
    $.flowerPot(606, 1300, .7, 0, 'straw');
    $.ground(480, 640, 1302, 5, 'pots');
  },
  fg($, S) {
    const T = S.T, st = S.step;
    // sky over the flats, and the order flying off the phone
    $.sun(930, 92, 32, T);
    $.cloud(912 + Math.sin(T * .3) * 14, 262, 118, 46, { fill: 'white', hatch: 'sky' });
    $.bird(900 + Math.sin(T * .7) * 18, 356, .8, T); $.bird(950 + Math.sin(T * .6) * 14, 392, .7, T + 1.3);
    $.signal(440, 172, 1.1, T, st <= 1 ? 'pink' : 'blueL');
    $.paperPlane(440 + Math.sin(T * 1.2) * 10, 214, .8, -.25);

    // I.1 the customer orders; she waits on her phone until the door bell (I.8)
    const home = st < 7;
    if (home) {
      const c = $.who('customer', 'stand', 150, 575, .84, 1, { t: T, arms: 'phone', face: S.on('refunded') ? 'surprised' : S.on('accepted') ? 'happy' : st >= 5 ? 'worried' : 'neutral' });
      $.phone(c.haF[0] + 8, c.haF[1] + 2, .42, { screen: st >= 5 ? 'map' : 'order', text: '牛肉面', t: T, badge: st >= 1 ? '1' : null, pop: st === 1 ? (S.t - 1) / .4 : 1, tilt: .15 });
    }
    $.think(195, 330, '来碗牛肉面！', { pop: st === 0 ? (S.t - .3) / .5 : 0, size: 18 });
    $.cup(282, 512, .7, { t: T, color: 'rose' });
    $.cat(home ? 332 : 150, 575, .6, T, 'orange');

    // I.2 the order prints in the shop
    $.printer(790, 226, .85, T, { printing: landed(S, 1, 1.6), text: '#42' });

    // I.3 the kitchen fires up; I.5 the bag waits on the pass
    const k = $.set('kitchen', { x0: 0, y0: 600, x1: 362, y1: 1000 }, { mode: S.on('cooking') ? 'toss' : st >= 4 ? 'serve' : 'fire', t: T, p: prog(S, 'waiting') });
    if (st === 4) $.enter('pop', landed(S, 4, .5), () => $.bag(k.at.pass[0] + 6, k.at.pass[1], .46, { logo: '面', seal: true }), { at: k.at.pass });
    // I.4 sold out: a jar pops up and the money goes back
    const refund = S.on('refunded');
    if (refund) {
      $.enter('pop', prog(S, 'refunded', .5), () => $.soldOutJar(300, 760, .75, { text: '售罄', coin: false }), { at: [300, 760] });
      $.mark(300, 676, '!', { pop: (S.since('refunded') - .2) / .4 });
    }
    $.jar(626, 650, .95, { label: '零钱', fill: 'straw', lid: 'green' });
    $.phone(726, 590, .56, { screen: 'text', text: refund ? '退款\n¥18' : '收款\n¥18', t: T, badge: refund ? '✓' : null, pop: refund ? (S.since('refunded') - .3) / .4 : 0 });
    if (refund) for (let i = 0; i < 4; i++) { const f = (T * .8 + i * .25) % 1; $.coin(626 + f * 100, 590 - Math.sin(f * Math.PI) * 60, 12, T + i); }
    else for (let i = 0; i < 3; i++) $.coin(660 + i * 24, 658 - 12, 10, 0);

    // I.6-8 the rider: waits by the shop, rides off, then the lift, then the door
    const riding = st === 5;
    for (let x = -60 + ((riding ? T * 120 : 0) % 80); x < 362; x += 80) $.line([[Math.max(2, x), 1266], [Math.min(360, x + 40), 1266]], { color: 'white', w: 4, passes: 1 });
    if (riding) {
      $.scooter(190, 1290, .86, 1, { t: T, moving: true, logo: '外卖' });
      $.person($.pose.ride(172, 1236, .78, 1, { t: T, bars: [232, 1208] }), { ...$.K.outfits.rider, t: T, face: 'proud' });
    } else {
      $.scooter(130, 1290, .86, 1, { logo: '外卖' });
      if (st < 5) {
        const r = $.who('rider', 'stand', 300, 1290, .8, -1, { t: T, arms: st === 4 ? 'carry' : 'phone', face: st === 4 ? 'happy' : 'neutral' });
        if (st === 4) $.bag(r.haF[0] - 6, r.haF[1] + 30, .42, { logo: '面', seal: true });
        else $.phone(r.haF[0] - 6, r.haF[1] + 2, .36, { screen: 'map', t: T, tilt: -.2 });
      }
    }
    // the lift crawls up floor by floor while the rider waits in it (I.7)
    const lifting = st === 6, floor = lifting ? 1 + Math.min(7, S.t * 1.4) : st >= 7 ? 8 : 1;
    const ly = 1300 - (floor - 1) * 54;
    $.shape($.rect(680, ly - 48, 58, 44), { fill: 'straw', h: { gap: 2.4, base: .8, solid: $.C.white, layers: [{ color: 'ochre', alpha: .5 }] }, w: 2.4 });
    $.line([[709, 846], [709, ly - 48]], { w: 1.6, passes: 1 });
    if (lifting) { $.shape($.ell(709, ly - 22, 12, 11, 14), { fill: 'straw', h: { base: .85, gap: 2.4 }, w: 1.8 }); $.line([[699, ly - 24], [719, ly - 24]], { w: 2, color: 'navy', passes: 1 }); }
    $.sign(650, 804, 100, 36, `电梯 ${Math.floor(floor)}F`, { size: 18, color: 'cream', ink: 'red' });
    // the door opens; the noodles change hands
    const open = st >= 7 ? (st > 7 ? 1 : Math.max(0, Math.min(1, (S.t - .8) / .8))) : 0;
    $.door(812, 1300, 100, 182, open, { number: '802', color: 'red' });
    if (open > .3) $.enter('slide', (open - .3) / .7, () => $.who('customer', 'stand', 872, 1300, .8, 1, { t: T, arms: 'reach', reach: [924, 1196], face: 'happy' }), { from: [-30, 0] });
    if (st >= 7) {
      const r = $.who('rider', 'stand', 962, 1300, .8, -1, { t: T, arms: 'give', face: 'happy' });
      $.bag(r.haF[0] - 18, r.haF[1] + 34, .42, { logo: '面', seal: true });
      $.heart(800, 1150 - Math.sin(T * 3) * 6, 12);
      $.bubble(626, 1090, '叮咚！', { side: 'right', size: 20, pop: st === 7 ? (S.t - .4) / .4 : 1 });
    } else {
      $.line([[482, 1036], [640, 1050]], { w: 1.6, color: 'navy', passes: 1 });
      $.bird(530, 1030, .6, 0); $.bird(588, 1036, .6, 0);
    }
  },
};

/* ------------------------------------------------------------------ II 骑手的一天 */
const HOURS = [8, 9, 11, 14, 17, 19, 22, 7, 7];
SCENES[2] = {
  bg($) {
    $.house(232, 392, 160, 112, { roof: 'red', wall: 'cream' });
    $.ground(130, 340, 394, 6, 'home');
    $.bush(150, 394, .55, 0);
    $.sign(736, 966, 96, 110, '充电站', { size: 20, color: 'green', ink: 'white', post: 170 });
  },
  fg($, S) {
    const T = S.T, step = Math.max(0, Math.min(S.step, HOURS.length - 1)), st = S.step;
    const night = st === 6 || (st === 7 && S.t < 1.2);
    // the sky turns: sun by day, moon at ten; the clock runs toward the hour of the step
    if (night) $.moon(905, 112, 38, T, 6); else $.sun(905, 112, 36, T);
    $.cloud(790 + Math.sin(T * .25) * 30, 70, 130, 54, { fill: night ? 'lilac' : 'white', hatch: night ? 'violet' : 'sky' });
    $.bird(760 + Math.sin(T * .6) * 30, 196, .8, T);
    const h0 = HOURS[Math.max(0, step - 1)], h1 = HOURS[step], k = Math.min(1, st < 0 ? 0 : S.t / 1.6);
    const hour = h0 + (((h1 - h0 + 24) % 24) * k);
    $.clock(612, 122, 58, 0, { hour: Math.floor(hour), minute: (hour % 1) * 60, speed: 0, rim: night ? 'violet' : 'red' });
    // I.1 asleep at home, the alarm rings at nine
    $.alarm(326, 394, .62, T, st <= 1);
    if (st <= 0) $.mark(212, 300, 'z', { color: 'navy' });
    // the phone: what the app shows
    const app = S.on('idle') ? 'order' : (S.on('pickup') || S.on('dropoff')) ? 'map' : 'blank';
    $.phone(60, 470, .95, { screen: app, text: '新订单', t: T, ring: S.on('idle') && S.since('idle') < 3, badge: S.on('idle') ? '1' : null, pop: S.on('idle') ? (S.since('idle') - .3) / .4 : 0 });
    $.calendar(60, 712, .85, st >= 7 ? '19' : '18', { top: '十一月' });
    // the street: the rider rides between the noodle shop and the office tower
    const street = $.set('street', { x0: 0, y0: 840, x1: 720, y1: 1262 }, { mode: night ? 'night' : 'day', t: T, traffic: false, walkers: st >= 2 && st <= 5, signs: ['牛肉面馆', '写字楼', '药'] });
    const road = street.at.road[1], shop = 150, office = 560, home = 360;
    const place = { offline: home, idle: home, pickup: shop, dropoff: office, done: home };
    let target = home;
    for (const id of ['idle', 'pickup', 'dropoff', 'done', 'offline']) if (S.on(id)) target = place[id];
    const loop = st === 5, from = [home, home, home, shop, office, home, home, home, home][Math.max(0, st)];
    const f = Math.min(1, Math.max(0, (S.t - .5) / 1.4));
    let x = from + (target - from) * $.easeInOut(f);
    if (loop) { const u = (S.t * .35) % 1; x = u < .33 ? shop : u < .66 ? office : home; }
    const moving = (Math.abs(target - from) > 1 && f < 1) || loop;
    const dir = target >= from ? 1 : -1;
    if (st >= 1 && st <= 5) {
      $.scooter(x, road, .82, dir, { t: T, moving, logo: '外卖' });
      $.person($.pose.ride(x - dir * 18, road - 51, .76, dir, { t: T, bars: [x + dir * 41, road - 80] }), { ...$.K.outfits.rider, t: T, face: moving ? 'proud' : 'happy' });
    } else {
      $.scooter(home, road, .82, 1, { logo: '外卖' });
      $.who('rider', 'stand', home + 120, street.ground - 2, .8, -1, { t: T, arms: st >= 6 ? 'wave' : 'hips', face: st === 6 ? 'sleepy' : 'happy' });
    }
    // charging overnight
    const charging = st >= 7;
    $.line([[784, 1250], [784, 1262], [740, 1262]], { w: 3, color: 'navy' });
    if (charging) { $.line([[784, 1250], [760, 1270], [700, 1262]], { w: 3, color: 'green' }); if (Math.sin(T * 6) > 0) $.shape([[792, 990], [770, 1028], [787, 1028], [776, 1060], [804, 1016], [787, 1016]], { fill: 'straw', h: { base: .9, gap: 2 }, w: 2 }); }
  },
};

/* ------------------------------------------------------------------ III 两边同时 */
SCENES[3] = {
  bg($) {
    $.sign(6, 560, 80, 236, '牛肉面\n十八元\n加蛋\n两元', { size: 19, color: 'cream' });
    $.road(706, 1000, 1250, 0, { h: 52 });
    $.ground(706, 1000, 1306, 5, 'curb');
  },
  fg($, S) {
    const T = S.T;
    $.lantern(46, 300, 1.05, T); $.lantern(46, 440, 1.05, T + 1);
    $.sun(930, 96, 32, T);
    $.clock(778, 122, 54, T, { speed: 6, hour: 12 });
    $.bird(870, 210, .9, T);
    // a ticket prints when an order comes in
    $.printer(626, 228, .82, T, { printing: S.step >= 1 ? Math.min(1, S.step > 1 ? 1 : (S.t - .4) / 1.5) : 0, text: '来单' });
    // the kitchen: fire while waiting, tossing while cooking, a bag on the pass when the order is up
    const cooking = S.on('kcook'), ready = S.on('kready');
    const k = $.set('kitchen', { x0: 0, y0: 860, x1: 680, y1: 1266 }, { mode: cooking ? 'toss' : ready ? 'serve' : 'fire', t: T, p: prog(S, 'kready'), sign: '出 餐 口' });
    if (ready) $.enter('pop', prog(S, 'kready', .5), () => $.bag(k.at.pass[0] + 40, k.at.pass[1], .52, { logo: '面', seal: true }), { at: k.at.pass });
    $.sign(736, 880, 250, 62, ready ? '42 号 请取餐' : '42 号 制作中', { size: 24, color: 'cream', ink: ready ? 'greenD' : 'red', hang: 22 });
    // the rider: riding to the shop, waiting at the pass, carrying the bag away
    const road = 1300;
    if (S.on('rwait')) {
      $.scooter(930, road, .74, -1, { logo: '外卖' });
      $.who('rider', 'stand', 790, road, .82, -1, { t: T, arms: ready ? 'reach' : 'hips', reach: [740, 1160], face: ready ? 'happy' : 'worried' });
      $.think(744, 1040, '好了没？', { pop: (S.since('rwait') - .3) / .5, size: 18 });
    } else if (S.on('rcarry')) {
      const x = 760 + Math.min(1, Math.max(0, S.since('rcarry') - .4) / 2) * 190;
      $.scooter(x, road, .74, 1, { t: T, moving: true, logo: '外卖' });
      $.person($.pose.ride(x - 16, road - 47, .68, 1, { t: T, bars: [x + 36, road - 72] }), { ...$.K.outfits.rider, t: T, face: 'proud' });
    } else {
      const x = 900 - Math.min(1, Math.max(0, (S.since('rgo') > 0 ? S.since('rgo') : 0) - .4) / 2) * 150;
      $.scooter(x, road, .74, -1, { t: T, moving: S.on('rgo'), logo: '外卖' });
      $.person($.pose.ride(x + 16, road - 47, .68, -1, { t: T, bars: [x - 36, road - 72] }), { ...$.K.outfits.rider, t: T });
    }
    $.mark(780, 1004, '!', { pop: ready && S.on('rwait') ? 1 : 0, color: 'green' });
  },
};

/* ------------------------------------------------------------------ IV 坨了的面 */
SCENES[4] = {
  bg($) {
    // the table where the bowl waits (and, later, where you eat it)
    wall($, 0, 398, 482, 720, 'peach', 'tan');
    windowPane($, 300, 432, 130, 96, false);
    floorBand($, 0, 482, 720, 18);
    $.table(250, 600, 300, 120, 'tan');
  },
  fg($, S) {
    const T = S.T, st = S.step;
    $.cloud(860 + Math.sin(T * .3) * 20, 50, 130, 46, { fill: 'white', hatch: 'sky' });
    $.sun(930, 152, 28, T);
    // the bowl, cooling step by step
    const age = st <= 0 ? 0 : S.on('warm') ? 1 : S.on('cool') ? 2 : st >= 3 ? 3 : 1;
    const soggy = age >= 3;
    $.bowl(250, 600, 1.85, { food: 'noodles', soggy, t: age <= 1 ? T : null, steam: age <= 1 });
    if (age === 1) $.steam(250, 520, T, 2, 60, 6);
    if (soggy) $.mark(420, 566, '…', { color: 'navy' });
    // the clock: ten minutes a step
    const mins = age * 10 + (st >= 1 && st <= 3 ? Math.min(1, S.t / 1.5) * 10 - 10 : 0);
    $.clock(78, 302, 50, 0, { hour: 12, minute: Math.max(0, mins), speed: 0 });
    $.text(`+${age * 10} min`, 80, 376, { font: '20px "Courier Prime", "SCV Hand"', align: 'center', color: $.C.red });
    // served soggy: you, at the table, not pleased
    const served = st >= 6;
    if (served) {
      const c = $.who('customer', 'stand', 64, 720, .84, 1, { t: T, arms: 'hold', face: 'worried' });
      $.mark(c.head[0] + 22, c.head[1] - 48, '?', { pop: st === 6 ? (S.t - .8) / .5 : 1 });
    } else $.chair(64, 720, .9, 1, 'blueL');
    // stuck in traffic (IV.5): the street jams; otherwise it flows
    $.set('street', { x0: 0, y0: 960, x1: 500, y1: 1333 }, { mode: st === 4 ? 'jam' : 'day', t: T, signs: ['面', '药'] });
    // the redo: a chef with a fresh bowl
    const redo = S.on('redo') || (st === 5);
    const ch = $.who('chef', 'stand', 900, 836, .78, -1, { t: T, arms: redo ? 'give' : 'hold', face: redo ? 'happy' : 'neutral' });
    if (st >= 5) $.bowl(ch.haF[0] - 18, ch.haF[1] + 18, .55, { food: 'noodles', t: T });
    // the checker at work: the screen, a magnifier on the red path, then a check at the pass
    const fix = st >= 8;
    $.set('desk', { x0: 520, y0: 960, x1: 1000, y1: 1333 }, { mode: fix ? 'meeting' : 'typing', t: T, p: landed(S, 8, .8), say: '出餐前检查！' });
    if (st === 7) { const a = Math.min(1, S.t / 2); $.magnifier(880 + Math.sin(T * 1.5) * 30 * (1 - a * .5), 1086 + Math.cos(T * 1.2) * 14, 32, .7); }
    if (fix) $.check(962, 690, 1.1, 'greenD', st > 8 ? 1 : Math.min(1, Math.max(0, (S.t - .3) / 1)));
  },
};

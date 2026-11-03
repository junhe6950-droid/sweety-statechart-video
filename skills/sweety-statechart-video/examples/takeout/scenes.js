// scenes.js — 《一份外卖的一生》: the living pictures around each chart.
// SCENES[n] = { bg($) static, fg($, S) every frame }. Units: the poster is 1000 x 1333.
// S.T film seconds (for loops), S.on(id) active now, S.since(id) chart-time since it became active (99 = long ago, -1 = not active),
// S.at(k) chart-time since step k began (-1 before it, 99 after), S.step current step index (0-based).

const after = (S, k) => S.step > k || (S.step === k && S.t > .9);         // step k has landed
const grow = (S, k, d = 1.2) => S.step > k ? 1 : S.step === k ? Math.max(0, Math.min(1, (S.t - .6) / d)) : 0;

/* ------------------------------------------------------------------ I 一份订单 */
SCENES[1] = {
  bg($) {
    // the customer's room, top left
    $.ground(30, 350, 548, 8, 'room');
    $.lamp(48, 548, 150, .9, 0, false);
    $.table(290, 486, 90, 62, 'tan');
    // the kitchen, left middle
    $.shelf(30, 740, 150, 2, { rowH: 52 });
    $.ground(20, 380, 975, 6, 'kit', 'brown');
    // a street at the bottom left, the building on the right
    $.building(915, 1300, 150, 560, { color: 'lilac', sign: '幸福小区' });
    $.ground(600, 860, 1302, 8, 'door');
    $.flowerPot(860, 1300, .8, 0, 'pink');
  },
  fg($, S) {
    const T = S.T;
    // sky
    $.sun(905, 92, 34, T);
    $.cloud(860 + Math.sin(T * .3) * 18, 230, 120, 52, { fill: 'white', hatch: 'sky' });
    $.bird(842 + Math.sin(T * .7) * 30, 320, .9, T);

    // I.1: the customer orders on the phone; a thought of noodles
    const ordering = S.step <= 1;
    const cust = $.pose.stand(160, 548, .82, 1, { t: T, arms: 'phone' });
    $.person(cust, { ...$.K.outfits.customer, t: T, talk: S.on('placed') ? T : 0 });
    $.phone(cust.haF[0] + 8, cust.haF[1] + 2, .42, { screen: 'order', text: '牛肉面', t: T, badge: S.step >= 1 ? '1' : null, pop: S.step === 1 ? (S.t - 1) / .4 : 1, tilt: .15 });
    $.think(205, 300, '来碗牛肉面！', { pop: ordering ? (S.step === 0 ? (S.t - .3) / .5 : 1) : 0, size: 18 });
    $.cup(290, 486, .7, { t: T, color: 'rose' });
    $.cat(330, 548, .62, T, 'orange');

    // I.2: the order prints in the kitchen
    $.printer(420, 395, .8, T, { printing: S.step >= 1 ? Math.min(1, S.step > 1 ? 1 : (S.t - .5) / 1.6) : 0, text: '#42' });

    // I.3: the wok goes up in flames; I.4: the sold-out jar
    const cooking = S.on('cooking') || S.step === 2;
    $.who('cook', 'stand', 95, 958, .78, 1, { t: T, arms: cooking ? 'toss' : 'stir' });
    $.counter(20, 370, 900, 70, { color: 'tan', sign: '后 厨', signSize: 24 });
    $.stove(250, 900, 150, T, true, { h: 64 });
    $.wok(252, 830, .78, T, { toss: cooking });
    for (let k = 0; k < (cooking ? 4 : 2); k++) $.steam(220 + k * 20, 800, T, k * 1.3, cooking ? 110 : 60, 7);
    $.jar(60, 688, .75, { label: '牛肉', fill: 'brown' });
    $.jar(120, 688, .75, { label: '面', fill: 'straw' });
    $.jar(60, 740, .75, { label: '葱', fill: 'green' });
    $.jar(140, 740, .75, { label: '售罄', empty: true });
    $.mark(140, 650, '!', { pop: S.on('refunded') ? (S.since('refunded') - .2) / .4 : 0 });

    // I.4: the money goes back
    const refund = S.on('refunded');
    $.table(735, 700, 190, 80, 'blueL');
    $.jar(680, 700, 1.05, { label: '零钱', fill: 'straw', lid: 'green' });
    $.phone(790, 640, .62, { screen: 'text', text: refund ? '退款\n¥18' : '收款\n¥18', t: T, badge: refund ? '✓' : null, pop: refund ? (S.since('refunded') - .3) / .4 : 0 });
    for (let i = 0; i < 4; i++) {
      const f = refund ? ((T * .8 + i * .25) % 1) : 0;
      if (refund) $.coin(680 + Math.sin(i * 2) * 20 + f * 90, 600 - Math.sin(f * Math.PI) * 70 - f * 20, 13, T + i);
    }
    if (!refund) for (let i = 0; i < 3; i++) $.coin(652 + i * 26, 708, 11, 0);

    // I.5: the bag waits on the pass
    if (after(S, 4)) $.bag(320, 900, .62, { logo: '面', seal: true });

    // I.6-8: the rider: parked, then riding, then at your door
    const riding = S.step >= 5 && S.step <= 6 || (S.step === 7 && S.t < 1);
    $.road(0, 440, 1185, riding ? T : 0, { h: 56, speed: 120 });
    if (riding) {
      $.scooter(215, 1196, .9, 1, { t: T, moving: true, logo: '外卖' });
      $.person($.pose.ride(195, 1140, .82, 1, { t: T, bars: [258, 1110] }), { ...$.K.outfits.rider, t: T });
    } else {
      $.scooter(170, 1196, .9, 1, { logo: '外卖' });
      const r = $.who('rider', 'stand', 330, 1196, .82, -1, { t: T, arms: 'phone' });
      $.phone(r.haF[0] - 6, r.haF[1] + 2, .38, { screen: 'map', t: T, tilt: -.2 });
    }
    // I.7: the lift crawls floor by floor
    const lift = S.at(6) > 0 && S.step === 6;
    const floor = lift ? 1 + Math.min(8, Math.floor(S.t * 1.6)) : (S.step > 6 ? 8 : 1);
    $.sign(640, 820, 124, 50, `电梯 ${floor}F`, { size: 22, color: 'cream', ink: 'red' });
    if (lift) $.mark(782, 812, '…', { color: 'navy' });
    // I.8: the door opens, the noodles arrive
    const open = S.step >= 7 ? Math.min(1, S.step > 7 ? 1 : Math.max(0, (S.t - .8) / .8)) : 0;
    $.door(650, 1300, 112, 210, open, { number: '802', color: 'red' });
    if (open > .3) {
      const p = $.who('customer', 'stand', 706, 1300, .78, -1, { t: T, arms: 'wave' });
      $.heart(640, p.head[1] - 40 - Math.sin(T * 3) * 6, 12);
    }
    if (S.step >= 7) $.bag(790, 1300, .6, { logo: '面', seal: true });
  },
};

/* ------------------------------------------------------------------ II 骑手的一天 */
const HOURS = [8, 9, 11, 14, 17, 19, 22, 7, 7];
SCENES[2] = {
  bg($) {
    $.ground(120, 340, 400, 6, 'home');
    $.house(225, 400, 150, 110, { roof: 'red', wall: 'cream' });
    $.shopFront(150, 1150, 230, 200, { sign: '牛肉面馆', awning: 'red', door: 'green' });
    $.building(690, 1150, 170, 330, { color: 'sky', sign: '写字楼' });
    $.tree(410, 1150, .8, 0);
    $.ground(880, 1000, 1290, 4, 'chg');
  },
  fg($, S) {
    const T = S.T, step = Math.max(0, Math.min(S.step, HOURS.length - 1));
    const night = step >= 6 && step <= 6 || (step === 7 && S.t < 1.2);
    // the sky turns: sun by day, moon at ten
    if (night) $.moon(890, 110, 38, T, 6); else $.sun(890, 110, 36, T);
    $.cloud(760 + Math.sin(T * .25) * 30, 70, 130, 54, { fill: night ? 'lilac' : 'white', hatch: night ? 'violet' : 'sky' });
    // the clock runs toward the hour of the step
    const h0 = HOURS[Math.max(0, step - 1)], h1 = HOURS[step];
    const k = Math.min(1, S.step < 0 ? 0 : S.t / 1.6);
    const hour = h0 + (((h1 - h0 + 24) % 24) * k);
    $.clock(620, 128, 52, 0, { hour: Math.floor(hour), minute: (hour % 1) * 60, speed: 0, rim: night ? 'violet' : 'red' });
    // I.1: asleep at home, the alarm rings at nine
    $.alarm(330, 400, .7, T, S.step <= 1);
    if (S.step <= 0) $.mark(260, 300, 'z', { color: 'navy' });
    // the street lamp lights up at night
    $.lamp(60, 820, 300, 1, T, night);
    // the rider moves along the street with the state
    const place = { offline: 470, idle: 470, pickup: 250, dropoff: 610, done: 470 };
    let target = 470, from = 470;
    for (const id of ['idle', 'pickup', 'dropoff', 'done', 'offline']) if (S.on(id)) target = place[id];
    if (S.step === 5) { const f = (S.t * .35) % 1; target = f < .33 ? 250 : f < .66 ? 610 : 470; }
    const prev = S.step >= 1 ? [470, 470, 470, 250, 610, 470, 470, 470, 470][S.step] : 470;
    from = prev;
    const f = Math.min(1, Math.max(0, (S.t - .5) / 1.4));
    const x = S.step === 5 ? target : from + (target - from) * $.easeInOut(f);
    const moving = (Math.abs(target - from) > 1 && f < 1) || S.step === 5;
    $.road(0, 820, 1160, moving ? T : 0, { h: 56, speed: 140 });
    const dir = target >= from ? 1 : -1;
    if (S.step >= 1 && S.step <= 5) {
      $.scooter(x, 1176, .8, dir, { t: T, moving, logo: '外卖' });
      $.person($.pose.ride(x - dir * 18, 1126, .74, dir, { t: T, bars: [x + dir * 40, 1098] }), { ...$.K.outfits.rider, t: T });
    } else {
      $.scooter(470, 1176, .8, 1, { logo: '外卖' });
      $.who('rider', 'stand', 590, 1176, .76, -1, { t: T, arms: S.step >= 6 ? 'wave' : 'hips' });
    }
    // an order pops on the phone while waiting
    $.phone(940, 700, 1.05, { screen: S.on('idle') ? 'order' : 'map', text: '新订单', t: T, ring: S.on('idle') && S.since('idle') < 3, badge: S.on('idle') ? '1' : null, pop: S.on('idle') ? (S.since('idle') - .3) / .4 : 0 });
    // charging overnight
    const charging = S.step >= 7;
    $.sign(890, 1000, 100, 120, '充电站', { size: 20, color: 'green', ink: 'white' });
    if (charging) { $.line([[940, 1120], [940, 1200], [880, 1240]], { w: 3, color: 'navy' }); if (Math.sin(T * 6) > 0) $.shape([[950, 1046], [928, 1084], [945, 1084], [934, 1116], [962, 1072], [945, 1072]], { fill: '#f5c935', h: { base: .9, gap: 2 }, w: 2 }); }
    $.scooter(930, 1290, .55, -1, { box: false });
  },
};

/* ------------------------------------------------------------------ III 两边同时 */
SCENES[3] = {
  bg($) {
    $.ground(10, 700, 1290, 10, 'k3');
    $.sign(14, 560, 108, 230, '牛肉面\n十八元\n加蛋\n两元', { size: 22, color: 'cream', post: 0 });
    $.building(915, 1290, 150, 230, { color: 'peach', sign: '你家' });
  },
  fg($, S) {
    const T = S.T;
    $.lantern(70, 300, 1.1, T); $.lantern(70, 440, 1.1, T + 1);
    $.sun(920, 100, 32, T);
    $.clock(700, 128, 50, T, { speed: 6, hour: 12 });
    $.bird(820, 190, .9, T);
    // a ticket prints when an order comes in
    $.printer(470, 190, .8, T, { printing: S.step >= 1 ? Math.min(1, S.step > 1 ? 1 : (S.t - .4) / 1.5) : 0, text: '来单' });
    // the kitchen: fire roars while cooking
    const cooking = S.on('kcook');
    $.who('cook', 'stand', 90, 1168, .8, 1, { t: T, arms: cooking ? 'toss' : 'stir' });
    $.counter(20, 690, 1110, 100, { color: 'tan', sign: '出 餐 口', signSize: 28 });
    $.stove(240, 1110, 150, T, cooking, { h: 64 });
    $.wok(242, 1042, .78, T, { toss: cooking, food: cooking || S.on('kwait') });
    if (cooking) for (let k = 0; k < 4; k++) $.steam(210 + k * 20, 1010, T, k, 110, 7);
    $.sign(330, 880, 250, 64, S.on('kready') ? '42 号 请取餐' : '42 号 制作中', { size: 24, color: 'cream', ink: S.on('kready') ? 'greenD' : 'red', hang: 30 });
    // the pass: a bag sits there while the kitchen state is "on the pass"
    if (S.on('kready')) $.bag(420, 1110, .7, { logo: '面', seal: true });
    // the rider: riding to the shop, waiting at the pass, carrying the bag away
    if (S.on('rwait')) {
      $.who('rider', 'stand', 600, 1290, .82, -1, { t: T, arms: 'hips' });
      $.think(560, 990, '好了没？', { pop: (S.since('rwait') - .3) / .5, size: 18 });
    } else if (S.on('rcarry')) {
      const x = 560 + Math.min(1, Math.max(0, S.since('rcarry') - .4) / 2) * 250;
      $.scooter(x, 1290, .74, 1, { t: T, moving: true, logo: '外卖' });
      $.person($.pose.ride(x - 16, 1243, .68, 1, { t: T, bars: [x + 36, 1218] }), { ...$.K.outfits.rider, t: T });
    } else {
      const x = 900 - Math.min(1, Math.max(0, (S.since('rgo') > 0 ? S.since('rgo') : 0) - .4) / 2) * 250;
      $.scooter(x, 1290, .74, -1, { t: T, moving: S.on('rgo'), logo: '外卖' });
      $.person($.pose.ride(x + 16, 1243, .68, -1, { t: T, bars: [x - 36, 1218] }), { ...$.K.outfits.rider, t: T });
    }
    $.mark(470, 1000, '!', { pop: S.on('kready') && S.on('rwait') ? 1 : S.on('rcarry') && S.since('rcarry') < 1.5 ? 1 : 0, color: 'green' });
  },
};

/* ------------------------------------------------------------------ IV 坨了的面 */
SCENES[4] = {
  bg($) {
    $.table(240, 560, 330, 70, 'tan');
    $.ground(20, 470, 1000, 8, 'road4');
    $.table(760, 1180, 300, 100, 'blueL');
    $.ground(500, 1000, 1290, 8, 'office');
  },
  fg($, S) {
    const T = S.T;
    $.cloud(850 + Math.sin(T * .3) * 20, 50, 120, 46, { fill: 'white', hatch: 'sky' });
    // the bowl, cooling step by step
    const age = S.on('fresh') || S.step <= 0 ? 0 : S.on('warm') ? 1 : S.on('cool') ? 2 : 3;
    const soggy = age >= 3;
    $.bowl(240, 560, 2.1, { food: 'noodles', soggy, t: age <= 1 ? T : null, steam: age <= 1 });
    if (age === 1) $.steam(240, 470, T, 2, 60, 6);
    $.mark(340, 400, soggy ? '…' : '', { color: 'navy' });
    // the clock: ten minutes per step
    const mins = age * 10 + (S.step >= 1 && S.step <= 3 ? Math.min(1, S.t / 1.5) * 10 - 10 : 0);
    $.clock(400, 320, 54, 0, { hour: 12, minute: Math.max(0, mins), speed: 0 });
    $.text(`+${age * 10} min`, 400, 410, { font: '22px "Courier Prime", "SCV Hand"', align: 'center', color: '#d81b4a' });
    // stuck in traffic
    const jam = S.step === 4 || S.on('soggy');
    $.road(20, 470, 830, jam ? 0 : T, { h: 60 });
    $.car(110, 905, .7, 1, { color: 'red' });
    $.car(370, 905, .7, 1, { color: 'green' });
    $.scooter(240, 980, .78, 1, { logo: '外卖', t: T, moving: !jam });
    $.person($.pose.ride(222, 930, .7, 1, { t: T, bars: [280, 904] }), { ...$.K.outfits.rider, t: T, sad: jam });
    if (jam) { $.mark(110, 780, '!', {}); $.mark(370, 780, '!', {}); }
    // the redo: a chef with a fresh bowl
    $.who('chef', 'stand', 930, 800, .66, -1, { t: T, arms: 'hold' });
    if (S.step >= 5) $.bowl(880, 730, .6, { food: 'noodles', t: T });
    // served soggy: the customer is not pleased
    const served = S.on('served') || S.step >= 6;
    const c = $.who('customer', 'stand', 120, 1290, .8, 1, { t: T, arms: served ? 'hold' : 'hips', sad: served });
    if (served) { $.bowl(c.haF[0] + 26, c.haF[1] + 16, .7, { food: 'noodles', soggy: true }); $.mark(c.head[0] + 24, c.head[1] - 50, '?', { pop: (S.since('served') > 0 ? S.since('served') : 9) / .5 }); }
    $.cat(380, 1290, .6, T, 'grey');
    // the checker at work: a laptop, a magnifier sweeping the red path
    const tracing = S.step >= 7;
    $.who('coder', 'sit', 620, 1180, .78, 1, { t: T, arms: 'type', floor: 1290 });
    $.stool(620, 1182, 56, 108, 'pink');
    $.laptop(760, 1180, .9, { t: T, typing: tracing });
    if (tracing) { const a = S.step === 7 ? Math.min(1, S.t / 2) : 1; $.magnifier(870 + Math.sin(T * 1.5) * 30 * (1 - a * .5), 1080 + Math.cos(T * 1.2) * 16, 34, .7); }
    // the fix: a check at the pass
    if (S.step >= 8) {
      $.sign(520, 960, 210, 60, '出餐检查', { size: 26, color: 'cream' });
      $.check(760, 990, 1.3, 'greenD', S.step > 8 ? 1 : Math.min(1, Math.max(0, (S.t - .3) / 1)));
    }
  },
};

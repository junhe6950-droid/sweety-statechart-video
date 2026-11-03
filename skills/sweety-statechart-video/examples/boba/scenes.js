// A starting point, not the film: copy it to scenes.js (`scv.py draft JOB --write` does that while scenes.js is still the
// skeleton), look at `scv.py layout JOB`, then refine: one hero scene per poster, the story's own things in the
// smaller areas, the same cast in every chapter. See references/scenes.md.
// modeOf(S, [[state, mode], ...], default): the set piece's mode follows whichever listed state is active; p is how far
// that state has got (0..1), for doors that open and coins that fly.
const prog = (S, id, d = 1.2) => { const k = S.since(id); return k < 0 ? 0 : k >= 99 ? 1 : Math.max(0, Math.min(1, (k - .5) / d)); };
const modeOf = (S, map, def) => { for (const [id, m] of map) if (S.on(id)) return { mode: m, p: prog(S, id) }; return { mode: def, p: 1 }; };


/* ------------------------------------------------------------------ 1 一张单 */
// boba: 奶茶, 珍珠, 店员
SCENES[1] = {
  bg($) {
    $.ground(830, 992, 452, 8, 'g1c');
    $.ground(600, 992, 992, 8, 'g1d');
  },
  fg($, S) {
    const T = S.T, paid = S.since('paid') >= 0 || S.step >= 2, making = S.on('making'), ready = S.on('ready'), hand = S.on('hand');
    // the till: the cashier behind the counter rings up the order; coins go in when you pay
    $.who('cashier', 'stand', 80, 560, .95, 1, { build: 'chibi', t: T, arms: S.on('ordered') ? 'type' : 'hips', face: paid ? 'happy' : 'neutral', hat: 'cap', hatColor: 'pink' });
    $.counter(14, 320, 500, 70, {});
    $.register(210, 500, 1, { price: '¥12', open: S.on('paid') ? Math.min(1, S.t) : 0 });
    if (paid) $.coins(290, 500, .8, { n: 3 });
    // three in the queue, top right
    $.who('customer', 'stand', 852, 452, .78, 1, { build: 'chibi', t: T, shirt: 'mint', face: 'neutral' });
    $.who('customer', 'stand', 908, 452, .78, 1, { build: 'chibi', t: T, shirt: 'pink', hair: 'long', face: S.on('line') ? 'happy' : 'neutral', arms: 'phone' });
    $.who('customer', 'stand', 962, 452, .78, 1, { build: 'chibi', t: T, shirt: 'sky', face: 'sleepy' });
    // the barista behind the pick-up counter: shakes while making, points at the bell when it's ready
    $.who('barista', 'stand', 90, 968, .95, 1, { build: 'chibi', t: T, arms: making ? 'hold' : ready ? 'point' : 'hips', target: [230, 890], face: making ? 'happy' : 'neutral' });
    $.counter(14, 320, 905, 85, {});
    if (making) $.shaker(150, 905, .8, { shake: true, t: T });
    $.bell(240, 905, 1, { t: T, ring: ready });
    $.bubbleTea(40, 905, .75, { tea: 'tan', t: T, level: making ? .4 : 1 });
    // pearls run out: the sold-out jar pops up beside the refund
    if (S.since('refund') >= 0 || S.seen('refund')) $.enter('pop', S.since('refund') >= 0 && S.since('refund') < 99 ? Math.max(0, Math.min(1, S.since('refund') - .6)) : 1, () => $.soldOutJar(700, 820, 1, {}), { at: [700, 790] });
    // the shop's sign over the queue, and the order printing when you order
    $.sign(862, 60, 128, 62, '奶茶店', {});
    $.printer(400, 330, .9, T, { printing: S.on('ordered') ? Math.min(1, S.t) : S.step > 1 ? 1 : 0 });
    // a shelf of finished cups between the two counters
    $.line([[20, 742], [300, 742]], { w: 3, color: 'brown' });
    [60, 120, 180, 240].forEach((x, k) => $.bubbleTea(x, 740, .6, { tea: ['tan', 'lilac', 'pink', 'ochre'][k], t: T }));
    // someone waiting with a pager, mid right; it buzzes when the number is called
    $.who('customer', 'stand', 915, 820, .8, -1, { build: 'chibi', t: T, shirt: 'lilac', hair: 'bob', face: ready ? 'surprised' : 'neutral', arms: 'phone' });
    $.pager(955, 820, .7, { buzz: ready, t: T });
    for (const [sx, sy] of [[760, 640], [800, 700], [430, 120], [720, 200], [790, 90], [740, 290]]) $.sparkle(sx, sy, 7, T);
    // in your hand: a customer holds the cup up
    $.who('customer', 'stand', 900, 992, .95, -1, { build: 'chibi', t: T, shirt: 'tan', arms: hand ? 'up' : 'hips', face: hand ? 'happy' : 'neutral' });
    if (hand) $.bubbleTea(930, 840, .75, { tea: 'tan', t: T });
  },
};

/* ------------------------------------------------------------------ 2 一天 */
// boba: 珍珠
SCENES[2] = {
  bg($) {
    // free (0,780)-(1000,1000): coins (words: 钱)
    $.coins(500, 988, 0.80, { n: 4 });
    $.ground(10, 990, 990, 6, 'g10');
    // free (700,0)-(1000,100): calendar (words: 天, day)
    $.calendar(850, 50, 0.80, '18');
  },
  fg($, S) {
    const T = S.T;
    // the main scene, free area 2: boba (mode by state: closed → order, prep → order, cleanup → order)
    { const m = modeOf(S, [['closed', 'order'], ['prep', 'order'], ['cleanup', 'order']], 'order'); $.set('boba', { x0: 0, y0: 380, x1: 260, y1: 780}, { mode: m.mode, t: T, p: m.p }); }
    // free (0,240)-(260,380): teapot (words: 茶)
    $.teapot(130, 368, 0.80, { t: T });
    // free (260,0)-(480,360): the sky
    $.sun(414, 80, 34, T);
  },
};

/* ------------------------------------------------------------------ 3 两边同时 */
// props only
SCENES[3] = {
  bg($) {
    $.ground(10, 990, 992, 8, 'g3');
    $.counter(14, 986, 918, 72, {});
  },
  fg($, S) {
    const T = S.T, mixing = S.on('mixing'), calling = S.on('calling'), cooking = S.on('cooking'), low = S.on('low');
    // the menu board, top right, like a shop's wall
    $.menuBoard(560, 18, 330, 170, { title: '菜单', items: [['珍珠奶茶', '12'], ['黑糖波波', '15'], ['芋泥啵啵', '14']] });
    // the barista behind the counter: shakes while making, points at the pager while calling
    $.who('barista', 'stand', 150, 930, .62, 1, { build: 'chibi', t: T, arms: mixing ? 'hold' : calling ? 'point' : 'hips', target: [430, 900], face: mixing ? 'happy' : calling ? 'proud' : 'neutral' });
    if (mixing) $.shaker(205, 905, .75, { shake: true, t: T });
    // finished cups line up when the number is called
    const n = calling ? 3 : S.since('calling') > 0 || S.step > 4 ? 2 : 1;
    for (let k = 0; k < n; k++) $.bubbleTea(300 + k * 46, 916, .62, { tea: ['tan', 'lilac', 'pink'][k], t: T });
    $.pager(450, 916, .8, { buzz: calling, t: T });
    // the pot on its stove: low pearls, then a fresh boil with steam
    $.pearlPot(800, 916, .9, { low: low, t: T, boil: cooking });
    if (cooking) $.steam(800, 820, 1.1, T);
    $.hourglass(930, 870, .55, T);
    $.pearlJar(40, 916, .7, {});
  },
};

/* ------------------------------------------------------------------ 4 珍珠的毛病 */
// boba: 珍珠, pearl
SCENES[4] = {
  bg($) {
    $.ground(490, 990, 990, 6, 'g3480');
    // free (860,560)-(1000,740): magnifier (words: 检查)
    $.magnifier(930 - 20 * 0.75, 650 - 20 * 0.75, 40 * 0.75);
  },
  fg($, S) {
    const T = S.T;
    // the main scene, free area 1: boba (mode by state: boiled → make)
    { const m = modeOf(S, [['boiled', 'make']], 'order'); $.set('boba', { x0: 0, y0: 440, x1: 480, y1: 1000}, { mode: m.mode, t: T, p: m.p }); }
    // free (480,740)-(1000,1000): clock (words: 小时)
    $.clock(740, 870, 60, T, { speed: 2 });
    // free (860,380)-(1000,560): hourglass (words: 小时, old)
    $.hourglass(930, 470, 0.80, T);
    // free (0,240)-(160,440): bowl (words: 吃)
    $.bowl(80, 428, 0.80, { food: 'noodles', t: T });
    // free (700,0)-(1000,100): the sky
    $.sun(930, 40, 25, T);
    $.cloud(805 + Math.sin(T * .3) * 16, 55, 120, 30, { fill: 'white', hatch: 'sky' });
    // free (720,580)-(860,740): bubbleTea (words: 珍珠)
    $.bubbleTea(790, 728, 0.80, { tea: 'tan', tiger: true, t: T });
    // free (700,380)-(820,500): clock (a filler; swap in something from the story)
    $.clock(760, 440, 36, T, { speed: 2 });
  },
};

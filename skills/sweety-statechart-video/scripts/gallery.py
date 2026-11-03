#!/usr/bin/env python3
"""Contact sheets of the drawing library, to see what you can draw before writing scenes.js:
every prop with its name, people (builds x faces, every arms action and pose, hair, hats, accessories, outfits) and
every set piece in each state (plus a narrow and a wide area). Also times each set piece's live layers.

usage: gallery.py [--out DIR] [--only props,people,sets] [--set NAME]     (or: scv.py gallery [--out DIR])
writes DIR/props.png, people-faces.png, people-arms.png, people-looks.png, set-<name>.png, cost.json
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import scv  # noqa: E402  (page helpers: font_css, open_page, ENGINE_FILES)

GALLERY_JS = r"""
(async function () {
  const K = window.SCV, P = K.props, T = 1.3;
  try {
    const want = ['20px "Special Elite"', 'italic 20px "Courier Prime"', '20px "Courier Prime"', '20px "SCV Hand"', '20px "SCV Type"'];
    await Promise.all(want.map(f => document.fonts.load(f, '状态图 ABC 123').catch(() => null)));
    await document.fonts.ready;
    const film = K.film.build(window.FILM, {});
    const ch = film.chapters[0];
    const kitOf = g => K.film.kit(g, film, ch);

    // every prop: [scale, draw(P, g, t, $)] drawn about (0, 0) = the middle of the cell's floor
    const PROPS = {
      ground: [1, (P, g) => P.ground(g, -100, 100, -10, 8, 'g')],
      grass: [1, (P, g, t) => P.grass(g, -100, 100, -4, t)],
      tree: [.75, (P, g, t) => P.tree(g, 0, 0, 1, t)],
      bush: [1, (P, g, t) => P.bush(g, 0, 0, 1.2, t)],
      flowerPot: [1, (P, g, t) => P.flowerPot(g, 0, 0, 1.3, t)],
      cloud: [1, (P, g) => P.cloud(g, 0, -90, 160, 70, { fill: 'white', hatch: 'sky' })],
      sun: [1, (P, g, t) => P.sun(g, 0, -95, 40, t)],
      moon: [1, (P, g, t) => P.moon(g, 0, -100, 40, t, 4)],
      star: [1, (P, g) => P.star(g, 0, -80, 30)],
      sparkle: [1, (P, g, t) => P.sparkle(g, 0, -80, 40, t)],
      rain: [1, (P, g, t) => P.rain(g, -90, -180, 180, 170, t, 30)],
      snow: [1, (P, g, t) => P.snow(g, -90, -180, 180, 170, t, 30)],
      wind: [1, (P, g, t) => P.wind(g, -90, -120, 180, t)],
      flame: [1, (P, g, t) => P.flame(g, 0, 0, 120, 60, t)],
      fire: [1, (P, g, t) => P.fire(g, 0, -10, 160, t)],
      steam: [1, (P, g, t) => { for (let k = 0; k < 3; k++) P.steam(g, -30 + k * 30, 0, t, k); }],
      puff: [1, (P, g, t) => P.puff(g, 0, -40, 120, t)],
      bulb: [1.4, (P, g, t) => P.bulb(g, 0, -20, 1.3, t, true)],
      lamp: [.8, (P, g, t) => P.lamp(g, -30, 0, 180, 1, t, true)],
      pot: [1, (P, g, t) => P.pot(g, 0, -100, 70, 80, { handles: true, liquid: 'orange', t, bubbles: true })],
      stove: [1, (P, g, t) => P.stove(g, 0, 0, 170, t, true)],
      wok: [1, (P, g, t) => P.wok(g, 30, -60, 1, t, { toss: true })],
      bowl: [1.4, (P, g, t) => P.bowl(g, 0, -10, 1, { food: 'noodles', t })],
      cup: [1.6, (P, g, t) => P.cup(g, 0, -10, 1, { t })],
      kettle: [1.1, (P, g, t) => P.kettle(g, -20, -10, 1, { t, boiling: true })],
      teapot: [1.1, (P, g, t) => P.teapot(g, -10, -10, 1, { t })],
      teacup: [1.4, (P, g, t) => P.teacup(g, 0, -10, 1, { t, steep: .7 })],
      plate: [1.4, (P, g) => P.plate(g, 0, -20, 1.2, 'orange')],
      jar: [1.4, (P, g) => P.jar(g, 0, -10, 1.2, { label: '糖', fill: 'straw' })],
      chopsticks: [1.2, (P, g) => P.chopsticks(g, -40, -40, 1)],
      stool: [1.2, (P, g) => P.stool(g, 0, -60, 70, 54)],
      table: [.9, (P, g) => P.table(g, 0, -90, 200, 90)],
      chair: [1.1, (P, g) => P.chair(g, 0, 0, 1, 1)],
      counter: [.8, (P, g) => P.counter(g, -130, 130, -110, 110, { sign: '柜台' })],
      shelf: [.9, (P, g) => P.shelf(g, -90, 0, 180, 3)],
      door: [.8, (P, g) => P.door(g, -55, 0, 110, 200, .4, { number: '802' })],
      house: [.8, (P, g) => P.house(g, 0, 0, 180, 140)],
      building: [.55, (P, g, t) => P.building(g, 0, 0, 160, 300, { sign: '大楼', night: true, t })],
      shopFront: [.62, (P, g) => P.shopFront(g, 0, 0, 260, 220, { sign: '小店' })],
      awningStall: [.7, (P, g) => P.awningStall(g, 0, 0, 220, { sign: '摊' })],
      road: [.8, (P, g, t) => P.road(g, -140, 140, -70, t)],
      trafficLight: [.9, (P, g) => P.trafficLight(g, 0, 0, 1, 'green')],
      sign: [1, (P, g) => P.sign(g, -80, -110, 160, 60, '招牌', { post: 50 })],
      lantern: [1.2, (P, g, t) => P.lantern(g, 0, -80, 1.2, t)],
      umbrella: [.9, (P, g) => P.umbrella(g, 0, -170, 160, 60)],
      bench: [1, (P, g) => P.bench(g, 0, 0, 180)],
      phone: [1.2, (P, g, t) => P.phone(g, 0, -80, 1, { screen: 'chat', t, badge: 3 })],
      bubble: [1, (P, g) => P.bubble(g, -60, -30, '你好！')],
      think: [1, (P, g) => P.think(g, -40, -20, '想一想')],
      mark: [1.4, (P, g) => P.mark(g, 0, -30, '!')],
      laptop: [1.3, (P, g, t) => P.laptop(g, 0, -10, 1, { t, typing: true })],
      server: [.9, (P, g, t) => P.server(g, 0, 0, 1, { t, busy: true })],
      tower: [.9, (P, g, t) => P.tower(g, 0, 0, 1, t, true)],
      signal: [1, (P, g, t) => P.signal(g, 0, -40, 1.4, t)],
      wifi: [1.6, (P, g, t) => P.wifi(g, 0, -30, 1, t, 2)],
      envelope: [1.6, (P, g) => P.envelope(g, 0, -50, 1, { stamp: true, heart: true })],
      paperPlane: [1.6, (P, g) => P.paperPlane(g, 0, -60, 1.2, -.2)],
      heart: [1.6, (P, g) => P.heart(g, 0, -60, 30)],
      check: [1.6, (P, g) => P.check(g, 0, -60, 1.6)],
      cross: [1.6, (P, g) => P.cross(g, 0, -60, 1.6)],
      clock: [1, (P, g, t) => P.clock(g, 0, -90, 70, t, { hour: 3 })],
      alarm: [1.3, (P, g, t) => P.alarm(g, 0, -10, 1, t, true)],
      calendar: [1.2, (P, g) => P.calendar(g, 0, -70, 1.2, '18', { top: '十一月' })],
      printer: [1.1, (P, g, t) => P.printer(g, 0, -10, 1, t, { printing: .7, text: '#42' })],
      receipt: [1.2, (P, g) => P.receipt(g, 0, -150, 80, 120, { title: '小票' })],
      coin: [1.6, (P, g, t) => { P.coin(g, -30, -50, 20, t); P.coin(g, 30, -50, 20, t + 1); }],
      magnifier: [1.2, (P, g) => P.magnifier(g, -20, -100, 40)],
      gear: [1.2, (P, g, t) => P.gear(g, 0, -80, 50, t)],
      conveyor: [.8, (P, g, t) => P.conveyor(g, -140, 140, -50, t)],
      box: [1.2, (P, g) => P.box(g, -40, -10, 80, 64, { label: '快递' })],
      bag: [1.4, (P, g) => P.bag(g, 0, -10, 1, { logo: '面', seal: true })],
      scooter: [.9, (P, g, t) => P.scooter(g, 10, 0, 1, 1, { t, moving: true, logo: '外卖' })],
      car: [.9, (P, g, t) => P.car(g, 0, 0, 1, 1, { t })],
      bike: [1.2, (P, g, t) => P.bike(g, 0, 0, 1, 1, t)],
      bird: [2, (P, g, t) => P.bird(g, 0, -50, 1, t)],
      cat: [1.5, (P, g, t) => P.cat(g, 0, -10, 1, t)],
      dog: [1.4, (P, g, t) => P.dog(g, 0, -10, 1, t)],
      basket: [1.4, (P, g) => P.basket(g, 0, -40, 110)],
      bucket: [1.4, (P, g) => P.bucket(g, 0, -10, 1)],
      sack: [1.4, (P, g) => P.sack(g, 0, -10, 1)],
      crate: [1.2, (P, g) => P.crate(g, 0, -10, 110, 90)],
      flag: [1.2, (P, g, t) => P.flag(g, -20, -10, 1, t)],
      stamp: [1, (P, g) => P.stamp(g, 0, -80, '通过', {})],
      who: [.75, (P, g, t) => P.who(g, 'rider', 'stand', 0, 0, 1, 1, { t, arms: 'wave' })],
      person: [.75, (P, g, t) => P.person(g, K.pose.walk(0, 0, 1, 1, { t }), { ...K.outfits.customer, t })],
      face: [3, (P, g, t) => P.face(g, 0, -40, 15, 1, { hair: 'short', face: 'happy', t })],
      hat: [3, (P, g) => P.hat(g, 'hardhat', 0, -40, 15, 1, 0, {})],
      cloth: [1, (P, g) => P.cloth(g, K.rect(-70, -170, 140, 150), 'floral', 1.2, 'blue')],
      flower: [3, (P, g) => P.flower(g, 0, -40, 12, .3, C.pink)],
      // v2 props
      train: [.55, (P, g, t) => P.train(g, 0, 0, 1, t, { cars: 2, moving: true })],
      plane: [.8, (P, g, t) => P.plane(g, 0, -100, 1, t)],
      truck: [.8, (P, g, t) => P.truck(g, 0, 0, 1, 1, { t, label: '物流' })],
      ship: [.8, (P, g, t) => P.ship(g, 0, -40, 1, t)],
      subwayGate: [1, (P, g, t) => P.subwayGate(g, 0, 0, 1, t, { open: .7 })],
      bankCard: [1.6, (P, g) => P.bankCard(g, 0, -60, 1, { tilt: -.15 })],
      atm: [.9, (P, g, t) => P.atm(g, 0, 0, 1, t, { cash: .6 })],
      ledger: [1.1, (P, g) => P.ledger(g, 0, -20, 1)],
      contract: [1.1, (P, g, t) => P.contract(g, 0, -90, 1, { signed: .8, seal: true, t })],
      seal: [1.6, (P, g) => P.seal(g, 0, -10, 1, { text: '印' })],
      bed: [.8, (P, g) => P.bed(g, 0, 0, 1)],
      medicine: [1.6, (P, g) => { P.medicine(g, -30, -10, 1, { label: '药' }); P.medicine(g, 30, -10, .8, { color: 'orange', pills: true }); }],
      stethoscope: [1.4, (P, g) => P.stethoscope(g, 0, -70, 1)],
      queueScreen: [1, (P, g, t) => P.queueScreen(g, 0, -110, 1, { num: 'A013', t, blink: true })],
      desk: [.9, (P, g) => P.desk(g, 0, 0, 1, { paper: true })],
      examPaper: [1.3, (P, g) => P.examPaper(g, 0, -80, 1, { score: 100 })],
      schoolbag: [1.4, (P, g) => P.schoolbag(g, 0, -10, 1)],
      blackboard: [.8, (P, g, t) => P.blackboard(g, -130, -200, 260, 150, { text: '1 + 1 = 2', chalk: 1, t })],
      field: [.8, (P, g, t) => P.field(g, -140, 140, -10, t, { rows: 4 })],
      rice: [1.4, (P, g, t) => P.rice(g, 0, -10, 1, t, { ripe: true })],
      bambooBasket: [1.4, (P, g) => P.bambooBasket(g, 0, -10, 1, { fill: 'leaf' })],
      loom: [.9, (P, g, t) => P.loom(g, 0, 0, 1, t, { progress: .6 })],
      kiln: [.9, (P, g, t) => P.kiln(g, 0, 0, 1, t, { fire: true })],
      robotArm: [.9, (P, g, t) => P.robotArm(g, 0, 0, 1, t)],
      forklift: [.9, (P, g, t) => P.forklift(g, 0, 0, 1, 1, { t, lift: .5, load: true })],
      rack: [.7, (P, g) => P.rack(g, -130, 0, 260, 260, {})],
      robot: [1.1, (P, g, t) => P.robot(g, 0, 0, 1, t, { wave: true })],
      chip: [1.6, (P, g, t) => P.chip(g, 0, -60, 1, { t, label: 'AI' })],
      keyboard: [1.2, (P, g, t) => P.keyboard(g, 0, -40, 1, { t, typing: true })],
      queue: [.6, (P, g, t) => P.queue(g, 150, 0, 4, { t, f: 1 })],
      ring: [.55, (P, g, t) => P.ring(g, 0, -20, 7, { t, r: 150 })],
      bubbleTea: [1.3, (P, g, t) => { P.bubbleTea(g, -40, -10, 1, { tea: 'tan', tiger: true, t }); P.bubbleTea(g, 40, -10, 1, { tea: 'lilac', t }); }],
      shaker: [1.4, (P, g, t) => P.shaker(g, 0, -10, 1, { shake: true, t })],
      register: [1.2, (P, g) => P.register(g, 0, -20, 1, { price: '¥12', open: .6 })],
      coins: [2, (P, g) => P.coins(g, 0, -20, 1, { n: 4 })],
      bell: [1.8, (P, g, t) => P.bell(g, 0, -20, 1, { ring: true, t })],
      pager: [2, (P, g, t) => P.pager(g, 0, -30, 1, { buzz: true, t, num: '42' })],
      pearlPot: [1.2, (P, g, t) => P.pearlPot(g, 0, -10, 1, { t })],
      menuBoard: [.75, (P, g) => P.menuBoard(g, -140, -190, 280, 140, {})],
      pearlJar: [1.5, (P, g) => P.pearlJar(g, 0, -10, 1, { label: 'old', n: 6 })],
      soldOutJar: [1.4, (P, g) => P.soldOutJar(g, -20, -10, 1, {})],
      hourglass: [1.4, (P, g, t) => P.hourglass(g, 0, -80, 1, t, { p: .35 })],
      ladybug: [3, (P, g, t) => P.ladybug(g, 0, -20, 1, t)],
      cell: [.9, (P, g, t) => { P.cell(g, -100, -100, 34, { p: 0, t }); P.cell(g, 0, -100, 34, { p: .55, t }); P.cell(g, 100, -40, 34, { p: 1, t }); }],
      dna: [1, (P, g, t) => P.dna(g, 0, -200, 190, { t })],
      chromosome: [1.4, (P, g) => { P.chromosome(g, -50, -70, 1, {}); P.chromosome(g, 40, -70, .8, { split: .6, color: 'blue' }); }],
      microscope: [1, (P, g) => P.microscope(g, 0, -10, 1)],
      slide: [1.4, (P, g) => P.slide(g, 0, -60, 1, {})],
      petriDish: [1.4, (P, g, t) => P.petriDish(g, 0, -60, 70, { p: .7, t })],
      rocket: [.6, (P, g, t) => { P.rocket(g, -80, -80, 1, { t, fire: true }); P.rocket(g, 100, -80, .8, { t, sep: .5, fire: true, smoke: false }); }],
      launchTower: [.6, (P, g, t) => P.launchTower(g, 0, -10, 1, { arms: .3, t })],
      repeat: [.8, (P, g, t) => P.repeat(g, (x, y, i) => P.bowl(g, x, y, .5, { food: i % 2 ? 'rice' : 'noodles' }), { x0: -150, y0: -150, x1: 150, y1: 0 }, { cols: 4, rows: 3, jitter: .3 })],
    };

    function cellSheet(items, cols, cw, chh, title) {
      const rows = Math.ceil(items.length / cols), k = 1, pad = 40;
      const c = document.createElement('canvas'); c.width = cols * cw * k; c.height = (rows * chh + pad) * k;
      const g = c.getContext('2d'); g.scale(k, k);
      K.paper(g, cols * cw, rows * chh + pad, 1);
      K.text(g, title, 16, 28, { font: `22px ${K.FONT.type}`, color: C.navy });
      items.forEach((it, i) => {
        const x0 = (i % cols) * cw, y0 = pad + Math.floor(i / cols) * chh;
        g.save(); g.strokeStyle = 'rgba(33,64,214,.15)'; g.strokeRect(x0 + .5, y0 + .5, cw - 1, chh - 1); g.restore();
        g.save(); g.beginPath(); g.rect(x0, y0, cw, chh - 26); g.clip();
        try { it.draw(g, x0, y0); } catch (e) { it.label += ' ✗ ' + e.message.slice(0, 40); }
        g.restore();
        K.text(g, it.label, x0 + cw / 2, y0 + chh - 8, { font: `15px ${K.FONT.mono}`, align: 'center', color: it.label.includes('✗') ? C.red : C.navy });
      });
      return c.toDataURL('image/png');
    }
    const C = K.C;
    function propsSheet() {
      const names = Object.keys(P), items = [];
      const table = Object.keys(PROPS);
      for (const n of table) {
        const [k, fn] = PROPS[n];
        items.push({ label: n + (P[n] ? '' : ' ✗ missing'), draw: (g, x0, y0) => { if (!P[n]) return; g.translate(x0 + 120, y0 + 196); g.scale(k, k); K.seed('gal' + n); fn(P, g, T); } });
      }
      const untested = names.filter(n => !PROPS[n]);
      return { png: cellSheet(items, 10, 240, 240, `props · ${table.length} · ${untested.length ? 'not in the gallery: ' + untested.join(', ') : 'all shown'}`), untested };
    }
    const BUILDS = ['kid', 'teen', 'adult', 'elder', 'slim', 'stout', 'elder stout', 'teen stout', 'chibi'];
    const FACES = ['neutral', 'happy', 'surprised', 'worried', 'sleepy', 'angry', 'proud'];
    const LOOKS = ['customer', 'office', 'cashier', 'student', 'grandma', 'coder', 'farmer', 'doctor'];
    function facesSheet() {
      const items = [];
      BUILDS.forEach((b, bi) => FACES.forEach(fc => items.push({ label: b + ' · ' + fc, draw: (g, x0, y0) => { P.who(g, LOOKS[bi % LOOKS.length], 'stand', x0 + 90, y0 + 300, .95, 1, { t: T, build: b, face: fc }); } })));
      // close-ups of every face, and mouth 0..1
      FACES.forEach(fc => items.push({ label: 'face ' + fc, draw: (g, x0, y0) => { P.face(g, x0 + 85, y0 + 150, 52, 1, { hair: 'short', face: fc, t: T }); } }));
      [0, .3, .6, 1].forEach(m => items.push({ label: 'mouth ' + m, draw: (g, x0, y0) => { P.face(g, x0 + 85, y0 + 150, 52, 1, { hair: 'bob', mouth: m, t: T }); } }));
      return cellSheet(items, 7, 180, 340, 'people · build × face (kid teen adult elder · slim stout) · face close-ups · mouth');
    }
    const ARMS = ['hold', 'carry', 'up', 'wave', 'point', 'phone', 'hips', 'type', 'stir', 'toss', 'reach', 'swing', 'give', 'shrug', 'cheer', 'sleep', 'stomp', 'clap'];
    function armsSheet() {
      const items = ARMS.map(a => ({ label: 'arms ' + a + (a === 'point' ? ' → target' : ''), draw: (g, x0, y0) => {
        const tg = [x0 + 170, y0 + 60];
        if (a === 'point') K.dot(g, tg[0], tg[1], 8, C.red);
        P.who(g, 'office', 'stand', x0 + 80, y0 + 300, .95, 1, { t: T, arms: a, target: tg, face: a === 'sleep' ? 'sleepy' : a === 'stomp' ? 'angry' : a === 'cheer' || a === 'clap' ? 'happy' : a === 'shrug' ? 'worried' : 'neutral' });
      } }));
      [['walk', 'customer'], ['run', 'kid'], ['sit', 'coder'], ['bend', 'farmer'], ['ride', 'rider']].forEach(([p, o]) => items.push({ label: 'pose ' + p, draw: (g, x0, y0) => {
        if (p === 'sit') { P.stool(g, x0 + 80, y0 + 236, 60, 64); P.who(g, o, 'sit', x0 + 70, y0 + 232, .95, 1, { t: T, arms: 'type', floor: y0 + 300 }); }
        else if (p === 'ride') { P.scooter(g, x0 + 100, y0 + 300, .8, 1, { t: T }); P.who(g, o, 'ride', x0 + 80, y0 + 254, .75, 1, { t: T, bars: [x0 + 148, y0 + 228] }); }
        else P.who(g, o, p, x0 + 80, y0 + 300, .95, 1, { t: T });
      } }));
      ARMS.forEach(a => items.push({ label: 'chibi ' + a, draw: (g, x0, y0) => { const tg = [x0 + 170, y0 + 90]; if (a === 'point') K.dot(g, tg[0], tg[1], 8, C.red); P.who(g, 'barista', 'stand', x0 + 90, y0 + 300, 1.3, 1, { t: T, arms: a, target: tg }); } }));
      return cellSheet(items, 6, 200, 340, 'people · every arms action and pose · the same for chibi');
    }
    const HAIR = ['bun', 'short', 'ponytail', 'long', 'bald', 'bob', 'curly', 'afro', 'spiky', 'pigtails', 'buzz', 'side'];
    const HATS = ['conical', 'cap', 'helmet', 'chef', 'beanie', 'headband', 'hardhat', 'beret', 'bandana', 'sunhat', 'nurse', 'grad'];
    const ACC = [['backpack', { backpack: 'red' }], ['bag', { bag: 'straw' }], ['scarf', { scarf: 'red' }], ['tie', { tie: 'navy', shirt: 'white' }], ['badge', { badge: '工牌' }], ['cane', { cane: true, build: 'elder' }], ['glasses', { glasses: true }], ['mask', { mask: true }], ['apron', { apron: 'rose' }], ['gloves', { gloves: 'green' }], ['skirt', { skirt: 'red' }], ['sleeveless', { sleeveless: true }]];
    function looksSheet() {
      const items = [];
      HAIR.forEach(h => items.push({ label: 'hair ' + h, draw: (g, x0, y0) => P.face(g, x0 + 80, y0 + 130, 42, 1, { hair: h, hairColor: ['navy', 'brown', 'ochre', 'grey'][HAIR.indexOf(h) % 4], t: T }) }));
      HATS.forEach(h => items.push({ label: 'hat ' + h, draw: (g, x0, y0) => { P.face(g, x0 + 80, y0 + 150, 42, 1, { hair: 'short', t: T }); P.hat(g, h, x0 + 80, y0 + 150, 42, 1, 0, {}); } }));
      ACC.forEach(([n, o]) => items.push({ label: n, draw: (g, x0, y0) => P.who(g, { shirt: 'sky', pants: 'navy', hair: 'short' }, 'stand', x0 + 80, y0 + 300, .95, 1, Object.assign({ t: T, arms: n === 'cane' ? 'hold' : undefined }, o)) }));
      Object.keys(K.outfits).forEach(n => items.push({ label: 'outfit ' + n, draw: (g, x0, y0) => P.who(g, n, 'stand', x0 + 80, y0 + 300, .95, 1, { t: T }) }));
      [['chibi barista · pencil', 'barista'], ['chibi boba · pencil', 'boba'], ['chibi · crayon', 'chibi'], ['adult · pencil', 'customer'], ['kid · pencil', 'schoolkid']].forEach(([lab, n], i) => items.push({ label: lab, draw: (g, x0, y0) => P.who(g, n, 'stand', x0 + 80, y0 + 300, n === 'customer' || n === 'schoolkid' ? .95 : 1.3, 1, { t: T, look: lab.includes('pencil') ? 'pencil' : 'crayon', arms: ['shake', 'type', 'wave', 'phone', 'hold'][i], face: ['proud', 'happy', 'neutral', 'happy', 'surprised'][i] }) }));
      items.push({ label: 'hero 1.4 · proud · give', draw: (g, x0, y0) => P.who(g, 'chef', 'stand', x0 + 80, y0 + 330, 1.4 * .72, 1, { t: T, face: 'proud', arms: 'give' }) });
      return cellSheet(items, 8, 170, 330, 'people · hair · hats · accessories · outfits');
    }
    function setSheet(name) {
      const modes = K.sets.modes(name), items = [];
      const cw = 620, chh = 520;
      modes.forEach(m => items.push({ label: `${name} · ${m}`, draw: (g, x0, y0) => { const $ = kitOf(g); $.W = $.H = 1e5; $.set(name, { x0: x0 + 30, y0: y0 + 30, x1: x0 + cw - 30, y1: y0 + chh - 40 }, { mode: m, t: T, p: .7 }); } }));
      items.push({ label: `${name} · ${modes[1] || modes[0]} · narrow 380 × 450, flipped`, draw: (g, x0, y0) => { const $ = kitOf(g); $.W = $.H = 1e5; $.set(name, { x0: x0 + 120, y0: y0 + 30, x1: x0 + 500, y1: y0 + chh - 40 }, { mode: modes[1] || modes[0], t: T, flip: true }); } });
      return cellSheet(items, 2, cw, chh, `set piece · ${name} · ${modes.join(' | ')} · the last one is narrow and flipped`);
    }
    function setCost(name, n = 20) {
      const c = document.createElement('canvas'); c.width = 1080; c.height = 1440;
      const g = c.getContext('2d'); g.scale(1.08, 1.08);
      const area = { x0: 0, y0: 760, x1: 560, y1: 1333 }, $ = kitOf(g), modes = K.sets.modes(name);
      for (let b = 0; b < 3; b++) { K.setBoil(b); $.set(name, area, { mode: modes[0], t: 0 }); }   // warm the caches
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { K.setBoil(i % 3); $.set(name, area, { mode: modes[0], t: i / 30 }); }
      g.getImageData(0, 0, 1, 1);                                     // wait for the drawing to finish
      const live = (performance.now() - t0) / n;
      const t1 = performance.now();
      for (let i = 0; i < 3; i++) { K.setBoil(i % 3); K.sets.draw(g, name, area, { mode: modes[0], t: i / 30, part: 'bg' }, $); }
      g.getImageData(0, 0, 1, 1);
      const back = (performance.now() - t1) / 3;
      return { live_ms: +live.toFixed(2), back_ms: +back.toFixed(2) };
    }
    window.gallery = {
      props: propsSheet, faces: facesSheet, arms: armsSheet, looks: looksSheet, set: setSheet, cost: setCost,
      sets: () => K.sets.names(),
    };
    window.ENGINE_READY = true;
  } catch (e) {
    window.ENGINE_ERROR = (e && e.stack) || String(e);
  }
})();
"""

FILM = {"title": "gallery", "chapters": [{"title": "gallery", "states": {"a": {"label": "a"}}, "edges": [], "steps": [{"go": "start", "note": ""}]}]}


def write_page(out):
    out.mkdir(parents=True, exist_ok=True)
    (out / 'fonts.css').write_text(scv.font_css())
    (out / 'gallery.js').write_text(GALLERY_JS)
    tags = '\n'.join(f'<script src="{(scv.CRAYON / f).as_uri()}"></script>' for f in scv.ENGINE_FILES if f != 'main.js')
    page = out / 'gallery.html'
    page.write_text(f"""<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fonts.css"></head><body>
<script>window.MODE = 'gallery'; window.FILM = {json.dumps(FILM)}; window.SCENES = {{}};</script>
{tags}
<script src="gallery.js"></script>
</body></html>""")
    return page


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default='output/gallery', help='folder for the sheets (default output/gallery)')
    ap.add_argument('--only', default='props,people,sets', help='which sheets: props, people, sets')
    ap.add_argument('--set', help='only this set piece')
    a = ap.parse_args(argv)
    if scv.need_render_python() and Path(scv.RENDER_PY).exists() and sys.executable != scv.RENDER_PY:
        os.execv(scv.RENDER_PY, [scv.RENDER_PY, __file__, *(argv if argv is not None else sys.argv[1:])])
    from playwright.sync_api import sync_playwright
    out = Path(a.out).resolve()
    page = write_page(out)
    only = set(a.only.split(','))
    wrote, cost = [], {}
    with sync_playwright() as p:
        b, pg, errors = scv.open_page(p, page, 1200, 900)

        def save(name, data):
            f = out / name
            f.write_bytes(scv.b64(data))
            wrote.append(f)

        if 'props' in only:
            r = pg.evaluate('gallery.props()')
            save('props.png', r['png'])
            if r['untested']:
                print('props without a gallery entry:', ', '.join(r['untested']))
        if 'people' in only:
            save('people-faces.png', pg.evaluate('gallery.faces()'))
            save('people-arms.png', pg.evaluate('gallery.arms()'))
            save('people-looks.png', pg.evaluate('gallery.looks()'))
        if 'sets' in only:
            for n in pg.evaluate('gallery.sets()'):
                if a.set and n != a.set:
                    continue
                save(f'set-{n}.png', pg.evaluate(f'gallery.set({json.dumps(n)})'))
                cost[n] = pg.evaluate(f'gallery.cost({json.dumps(n)})')
        b.close()
    if cost:
        (out / 'cost.json').write_text(json.dumps(cost, indent=1))
        for n, c in cost.items():
            print(f'  {n:10s} live layers {c["live_ms"]:6.2f} ms/frame   back layer {c["back_ms"]:6.2f} ms (once per boil, cached)')
    if errors:
        print('page errors:', *errors[:8], sep='\n  ')
    print(f'wrote {len(wrote)} sheets to {out}')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())

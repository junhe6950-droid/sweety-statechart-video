/* sweety-statechart-video · theme.js — palettes, papers and type as themes. Every drawing takes its colours by name
 * from K.C, so a theme only rewrites K.C (plus a few roles: ink on paper, ink on cards, the active pink, guard red,
 * ok green, past grey), picks a paper and a type face, and says how crayon layers mix (multiply on light paper,
 * opaque on dark). A brand theme is derived from 1–3 colours in OKLCH. audit() checks contrast and colour-blind
 * separation of the colours that carry meaning. Loaded after ink.js, before everything that draws. */
(function () {
  const K = window.SCV, C = K.C, FONT = K.FONT;
  const BASE = Object.assign({}, C);                       // the reference palette, as ink.js defines it

  /* ---------------- colour maths: sRGB <-> OKLab / OKLCH ---------------- */
  const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
  const rgb2hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
  const lin = v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
  const gam = v => v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055;
  function oklab(hex) {
    const [r, g, b] = hex2rgb(hex).map(lin);
    const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
    return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
  }
  function fromOklab([L, a, b]) {
    const l = Math.pow(L + .3963377774 * a + .2158037573 * b, 3), m = Math.pow(L - .1055613458 * a - .0638541728 * b, 3), s = Math.pow(L - .0894841775 * a - 1.291485548 * b, 3);
    return rgb2hex([4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s].map(gam));
  }
  const oklch = hex => { const [L, a, b] = oklab(hex); return [L, Math.hypot(a, b), Math.atan2(b, a)]; };
  const fromOklch = ([L, Cc, h]) => fromOklab([L, Cc * Math.cos(h), Cc * Math.sin(h)]);
  const mix = (c1, c2, t) => { const a = oklab(c1), b = oklab(c2); return fromOklab(a.map((v, i) => v + (b[i] - v) * t)); };
  function luminance(hex) { const [r, g, b] = hex2rgb(hex).map(lin); return .2126 * r + .7152 * g + .0722 * b; }
  const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  function deutan(hex) {                                   // Viénot 1999 deuteranopia simulation in linear RGB
    const [r, g, b] = hex2rgb(hex).map(lin);
    return rgb2hex([.29275 * r + .70725 * g, .29275 * r + .70725 * g, -.02234 * r + .02234 * g + b].map(gam));
  }
  const dist = (a, b) => { const p = oklab(a), q = oklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

  /* ---------------- the themes ---------------- */
  // roles every theme fills (defaults from the reference palette): title/cardInk text, active pink, guard red, ok green, past grey
  const ROLES = { title: BASE.navy, cardInk: BASE.navy, active: BASE.pink, guard: BASE.red, ok: '#178a9a', past: BASE.grey, card: '#fbf7ec', bg: '#e9e3d6' };
  const THEMES = {
    crayon: { name: '蓝蜡笔', paper: 'cream', blend: 'multiply', colors: {} },
    night: {
      name: '夜读', paper: 'dark', blend: 'source-over', type: 'fangsong',
      colors: {
        paper: '#1e2442', ink: '#f2ead6', inkD: '#fff6df', navy: '#fff3d6', white: '#2c3358', black: '#0f1328',
        blue: '#6f8dff', blueL: '#9fb8ff', sky: '#4c63b8', grey: '#8b8fb8', lilac: '#9d97f0', violet: '#8577ff',
        title: '#fff3d6', cardInk: '#16246e', card: '#f6ecd0', bg: '#141a33', past: '#6d7299',
      },
    },
    kraft: {
      name: '牛皮纸', paper: 'kraft', blend: 'multiply', type: 'marker',
      colors: {
        paper: '#d2ad78', ink: '#2b2118', inkD: '#201810', navy: '#1f1a14', white: '#fbf4e4', blue: '#2f4a9a', blueL: '#8197cf',
        sky: '#c9d3e0', grey: '#9c8f7c', straw: '#f0c040', cream: '#f6e8c8', creamD: '#e7cfa0',
        title: '#1f1a14', cardInk: '#1f1a14', card: '#fbf2dc', bg: '#b8935e',
      },
    },
    riso: {
      name: '孔版', paper: 'cream', blend: 'multiply', misreg: 1.4,
      colors: {                                            // three inks (fluorescent pink, blue, yellow) and their overprints
        paper: '#f6f1e6', ink: '#1d5fc4', inkD: '#16489a', navy: '#173f87', blue: '#1d5fc4', blueL: '#6f9be0', sky: '#a9c6ef',
        pink: '#ff3d9a', rose: '#ff7ab8', red: '#f2365f', redD: '#c81f48', straw: '#ffd21f', yolk: '#ffe14d', ochre: '#f2a51f',
        orange: '#ff8a3d', flame: '#ffb11f', green: '#4fb3a0', greenD: '#2f8f84', leaf: '#5fbf8f', teal: '#3fb8c4', mint: '#a6e3d6',
        lilac: '#b08ee6', violet: '#7a5ad8', grey: '#b7b2cc', title: '#173f87', cardInk: '#173f87',
      },
    },
  };
  const SEASONS = {                                        // scene accents only; the chart's meaning colours stay
    spring: { green: '#9edc6a', leaf: '#6ccb5a', greenD: '#43a84c', rose: '#ff8cb3', sky: '#c4def9', straw: '#f7d65a', blueL: '#9cc2f5' },
    summer: { teal: '#38d6c2', mint: '#a8f2de', yolk: '#ffe04d', straw: '#ffcf2e', orange: '#ff8a1e', sky: '#a9d8ff', leaf: '#45c25a' },
    autumn: { ochre: '#dd8a17', orange: '#f0701c', straw: '#e8b43a', green: '#a7b24a', leaf: '#93a83c', greenD: '#6f8a2c', tan: '#c07a3e', brown: '#8c4a22', sky: '#d6dcf0' },
    winter: { sky: '#d7e4f7', blueL: '#a9c1ea', lilac: '#b9b4ee', grey: '#c3c4dc', green: '#8fbfa0', leaf: '#77ad8c', straw: '#e8d58a', white: '#ffffff' },
  };
  const TYPES = {
    serif: '"Special Elite", "SCV Type", serif',
    fangsong: '"Special Elite", "SCV Fangsong", "SCV Type", serif',
    marker: '"Special Elite", "SCV Marker", "SCV Type", sans-serif',
  };

  // 1–3 brand colours -> a theme: the darkest one (pushed dark enough) inks the lines and text, the most chromatic
  // one becomes the active colour, a third (or a hue-shifted second) the warm accent; meaning colours keep apart
  function brandTheme(list) {
    const cs = (list || []).filter(c => /^#?[0-9a-f]{3,6}$/i.test(String(c))).map(c => c[0] === '#' ? c : '#' + c);
    if (!cs.length) return THEMES.crayon;
    const byL = cs.slice().sort((a, b) => oklch(a)[0] - oklch(b)[0]), byC = cs.slice().sort((a, b) => oklch(b)[1] - oklch(a)[1]);
    const dark = oklch(byL[0]), ink = fromOklch([Math.min(dark[0], .42), Math.max(dark[1], .08), dark[2]]);
    const inkD = fromOklch([Math.min(dark[0], .34), Math.max(dark[1], .07), dark[2]]), navy = fromOklch([Math.min(dark[0], .28), Math.max(dark[1], .06), dark[2]]);
    const act = oklch(byC[0]), active = fromOklch([Math.max(.55, Math.min(.68, act[0])), Math.max(.16, act[1]), act[2]]);
    const third = cs.length > 2 ? oklch(byC[2] || byC[1]) : [.84, .14, act[2] + 2.2];
    const warm = fromOklch([Math.max(.78, third[0]), Math.max(.12, third[1]), third[2]]);
    const colors = { ink, inkD, navy, blue: ink, title: navy, cardInk: navy, active, pink: active, rose: mix(active, '#ffffff', .35), straw: warm, yolk: mix(warm, '#ffffff', .25) };
    // guard red and ok green must stay readable as meanings next to the brand's active colour
    if (dist(deutan(active), deutan(BASE.red)) < .08) colors.guard = colors.red = fromOklch([.5, .19, act[2] + 1.2]);
    return { name: 'brand', paper: 'cream', blend: 'multiply', colors };
  }

  function resolve(spec) {
    const t = spec && spec.theme, brand = spec && spec.brand;
    let base = THEMES.crayon, over = {};
    if (brand) base = brandTheme(Array.isArray(brand) ? brand : [brand]);
    if (typeof t === 'string') {
      const [k, v] = t.split(':');
      if (k === 'season') base = Object.assign({}, THEMES.crayon, { name: '节气·' + v, colors: SEASONS[v] || {} });
      else base = THEMES[k] || base;
    } else if (t && typeof t === 'object') {
      base = THEMES[t.base] || base;
      over = t;
    }
    const colors = Object.assign({}, base.colors, over.colors || {});
    return { name: over.name || base.name, paper: over.paper || base.paper, blend: over.blend || base.blend, type: over.type || base.type || 'serif', misreg: over.misreg ?? base.misreg ?? 0, colors };
  }

  // rewrite K.C in place (every module holds the same object), set the type face and the layer mixing
  function apply(spec) {
    const th = resolve(spec);
    for (const k of Object.keys(C)) delete C[k];
    Object.assign(C, BASE, ROLES, th.colors);
    C.active = th.colors.active || C.pink; C.guard = th.colors.guard || C.red;
    FONT.type = TYPES[th.type] || TYPES.serif;
    K.S.blend = th.blend; K.S.paperKind = th.paper; K.S.misreg = th.misreg || 0; K.S.dark = luminance(C.paper) < .25;
    K.mixCache && K.mixCache.clear();
    K.theme.current = th;
    return th;
  }

  // each chapter gets an accent: the default pin colours and region tints cycle from it
  const ACCENTS = [['pink', 'straw', 'blue', 'orange', 'green', 'violet'], ['teal', 'orange', 'pink', 'straw', 'violet', 'green'],
    ['orange', 'blue', 'straw', 'red', 'teal', 'pink'], ['violet', 'straw', 'teal', 'pink', 'orange', 'blue'], ['green', 'pink', 'orange', 'blue', 'straw', 'violet']];
  const TINTS = ['sky', 'rose', 'mint', 'straw', 'lilac'];
  const accent = ci => ({ pins: ACCENTS[ci % ACCENTS.length], tint: TINTS[ci % TINTS.length] });

  // meaning colours: is the text readable, can a deuteranope tell guard/error from ok, and active from ok?
  function audit() {
    const w = [];
    const ct = (a, b, what, min) => { const r = contrast(a, b); if (r < min) w.push(`theme: ${what} contrast ${r.toFixed(1)} (want ≥ ${min})`); };
    ct(C.title, C.paper, 'title on paper', 4.5);
    ct(C.cardInk, C.card, 'card text on card', 4.5);
    ct(C.inkD, C.paper, 'arrow words on paper', 3.5);
    if (dist(deutan(C.guard), deutan(C.ok)) < .1) w.push('theme: guard red and ok green look alike to a red-green colour-blind viewer');
    if (dist(deutan(C.active), deutan(C.ok)) < .1) w.push('theme: the active colour and ok green look alike to a red-green colour-blind viewer');
    return w;
  }

  K.theme = { THEMES, SEASONS, TYPES, resolve, apply, brandTheme, accent, audit, oklch, fromOklch, mix, contrast, deutan, current: null };
})();

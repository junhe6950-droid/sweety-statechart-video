// scenes.d.ts — types for scenes.js, so an editor (or a model) knows the kit. Coordinates are poster units: a poster is
// 1000 wide and 1000 × (frame height / width) tall. Point the editor at it with  /// <reference path="…/scenes.d.ts" />

type Pt = [number, number];
type Colour = string;               // a palette name ('ink', 'pink', 'straw', 'sky', …) or '#rrggbb'
type Area = { x0: number; y0: number; x1: number; y1: number };

interface HatchOpts { gap?: number; angle?: number; base?: number; w?: number; alpha?: number; solid?: Colour; layers?: Array<{ color?: Colour; angle?: number; gap?: number; alpha?: number; w?: number }> }
interface ShapeOpts { fill?: Colour; h?: HatchOpts; stroke?: Colour | null; w?: number; open?: boolean; solid?: Colour; radial?: Pt; r?: object; amp?: number; alpha?: number }
interface LineOpts { color?: Colour; w?: number; closed?: boolean; progress?: number; passes?: number; amp?: number; alpha?: number; taper?: boolean; holes?: number }

/** S: what the scene sees on this frame */
interface SceneState {
  T: number;                       // film seconds (stepped to anim_fps if the film sets it)
  t: number;                       // chart time since this step began (speed 2: 1 unit = 0.5 s); cards pop near 0.85
  step: number;                    // this chapter's step (from 0); -1 before the chapter; the last step after it
  steps: number;
  done: boolean;
  on(id: string): boolean;         // is this card active now
  seen(id: string): boolean;       // has it been active or passed
  since(id: string): number;       // chart time since it became active: this step's t, 99 earlier, -1 not active
  at(k: number): number;           // chart time since step k began: -1 before, 99 after
  first(id: string): number;       // the step it first became active, or -1
  talk: number;                    // narration loudness now, 0..1 (mouths)
  speaker: string | null;          // the cast member the step names as speaking
  mood: string | null;             // the active state's mood
}

/** $: the crayon kit bound to this poster */
interface Kit {
  W: number; H: number; C: Record<string, string>;
  tier: { outline: number; structure: number; detail: number };   // line widths: contour 3.2, inner 2, detail 1.2
  // strokes and fills
  line(pts: Pt[], o?: LineOpts): Pt[];
  shape(pts: Pt[], o?: ShapeOpts): void;
  hatch(pts: Pt[], o?: HatchOpts & { color?: Colour }): void;
  radial(pts: Pt[], hx: number, hy: number, o?: object): void;
  dot(x: number, y: number, r: number, fill: Colour, o?: ShapeOpts): void;
  blob(x: number, y: number, r: number, color: Colour, alpha?: number): void;
  scribble(x: number, y: number, w: number, h: number, color: Colour, o?: object): void;
  text(s: string, x: number, y: number, o?: { font?: string; align?: 'left' | 'center' | 'right'; color?: Colour; double?: boolean; chars?: number; ink?: boolean; alpha?: number }): void;
  words(s: string, x: number, y: number, o?: { size?: number; align?: 'left' | 'center' | 'right'; color?: Colour; chars?: number }): void;
  // geometry
  ell(cx: number, cy: number, rx: number, ry: number, n?: number, a0?: number, a1?: number, rot?: number): Pt[];
  rect(x: number, y: number, w: number, h: number): Pt[];
  bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n?: number): Pt[];
  qbez(p0: Pt, p1: Pt, p2: Pt, n?: number): Pt[];
  smooth(pts: Pt[], iter?: number, closed?: boolean): Pt[];
  capsule(pl: Pt[], w: number, w2?: number): Pt[];
  move(pts: Pt[], dx: number, dy: number, s?: number): Pt[];
  turn(pts: Pt[], cx: number, cy: number, a: number): Pt[];
  along(pts: Pt[], f: number): Pt;
  // randomness (seeded, so the drawing is the same every frame of a boil)
  seed(id: string): void; rnd(a?: number, b?: number): number; pick<T>(arr: T[]): T;
  clamp(v: number, a?: number, b?: number): number; lerp(a: number, b: number, t: number): number;
  ease(t: number): number; easeInOut(t: number): number; backOut(t: number): number;
  // depth and motion
  depth(level: 'far' | 'mid' | 'near', draw: () => void): void;      // far: paler, thinner; near: a little heavier
  enter(kind: 'draw' | 'pop' | 'slide' | 'erase' | 'fade', p: number, draw: () => void, o?: { at?: Pt; from?: Pt; box?: [number, number, number, number] }): void;
  travel(path: Pt[], p: number): { x: number; y: number; f: 1 | -1; heading: number; moving: boolean };
  beat(t: number, fps?: number): number;
  progress(t: number, from: number, len?: number, ease?: boolean): number;
  cast(name: string, pose: 'stand' | 'walk' | 'run' | 'sit' | 'bend' | 'ride', x: number, y: number, s?: number, f?: 1 | -1, o?: { S?: SceneState; arms?: string; [k: string]: unknown }): object;
  // people and props (see references/scenes.md for the full catalogue)
  who(kind: string, pose: string, x: number, y: number, s?: number, f?: 1 | -1, o?: object): object;
  box(id: string): { x: number; y: number; w: number; h?: number } | undefined;
  [prop: string]: unknown;
}

interface Scene { bg?($: Kit): void; fg?($: Kit, S: SceneState): void }
declare const SCENES: Record<number | string, Scene>;

# v2 upgrade: shared contract

Working notes for the v2 upgrade (see `docs/upgrade-directions-2026-11.md` and `docs/visual-upgrade-2026-11.md`).
Several people work in parallel; this file fixes the interfaces between them. Paths are relative to
`skills/sweety-statechart-video/`. Out of scope for now: cross-platform voice backends, Linux CI, MCP distribution,
Remotion/HyperFrames adapters, ACE-Step, MOSS-TTSD, C2PA.

## Ownership (who edits what)

| Area | Owner | Files |
|---|---|---|
| Statechart IO and checker | A | `scripts/statechart_io.py` (new), `scripts/modelcheck.py`, `references/film.schema.json` (new), tests in `scripts/test_statechart_io.py` (new) |
| Drawing library | B | `engine/crayon/props.js`, `engine/crayon/people.js`, `engine/crayon/sets.js` (new), `scripts/gallery.py` (new), `scripts/scene_draft.py` (new) |
| Delivery pipeline | C | `scripts/deliver.py` (new), `scripts/preview.py` (new), `scripts/publish.py` (new), `scripts/golden.py` (new), `scripts/eval_platforms.py` (new), `engine/shell/` (new: the player UI shared by preview and the HTML export) |
| Audio | D | `scripts/voice.py`, `scripts/mix.py`, `scripts/audio_*.py`, `scripts/asr.py`, `scripts/meter.py`, `scripts/i18n.py` (new) |
| Engine look and motion, lint, integration | lead | `engine/crayon/ink.js`, `chart.js`, `layout.js`, `film.js`, `player.js`, `main.js`, `engine/crayon/motion.js` (new), `engine/crayon/theme.js` (new), `scripts/lint.py` (new), SKILL.md, references (except the schema) |

`scripts/scv.py` is shared. Keep edits there small and local: a new function block, one dispatch branch in
`main()`, one-line hooks. Do not reformat or move existing code. Per area:

- A: `check()` (rule fix result), dispatch for `import` / `export`.
- B: `ENGINE_FILES` gets `'sets.js'` (after `props.js`); dispatch for `gallery`, `draft`.
- C: `render_chunk()` / `render()` (frame transport and encoding), `finalize()` (mux, metadata), dispatch for
  `deliver`, `preview`, `publish`, `golden`.
- D: `write_lines()`, `voice()`, `plan()` (timing additions below), `sound()`, `--lang` plumbing via `i18n.py`.
- lead: `font_css()`, `write_page()`, `page_timing()`, `resolved()`, `posters()` (cover), dispatch for `lint`.

Every drawing uses palette **names** (`C.ink`, `'straw'`), never raw hex: themes swap the palette.

## film.json additions

Film level:

| Field | Type | Meaning | Owner |
|---|---|---|---|
| `theme` | `"crayon"` (default) \| `"night"` \| `"kraft"` \| `"riso"` \| `"season:spring"`… \| `{base, colors: {name: color}, paper}` | palette and paper | lead |
| `brand` | `[color, …]` (1–3) | derive a theme from brand colours | lead |
| `anim_fps` | number \| null | scene animation stepped to this rate (12 = on twos); null = smooth | lead |
| `camera` | `"follow"` (default) \| `"push"` | push in on the active step | lead |
| `outro` | `"overview"` (default when ≥ 2 chapters) \| `false` | a closing pan over every poster | lead |
| `hook` | string \| false | open on the finished first poster with this question, then rewind | lead |
| `cast` | `{name: {outfit, build, face, shirt, …}}` | characters defined once, used by name in scenes (`$.cast('rider')`) | lead + B |
| `ai_label` | string \| false | explicit AI label in the opening seconds; default `"旁白由 AI 合成"` when voiced | lead |
| `aigc` | `{producer, produce_id, propagator, propagate_id}` | GB 45438 metadata overrides | C |
| `episode`, `next` | number, string | series number and the "next episode" end card | lead (card), C (publish) |
| `deliver` | `["clips", "longimage", "html", "gif"]` | extra outputs made by `all` | C |
| `i18n` | `{lang: {title, series, sub…, chapters: [{title, sub, tagline, states: {id: {label, tag}}, edges: {id: {label, if, text}}, steps: [{note, say}]}]}}` | translations; `scv.py all JOB --lang en` | D |
| `flow` | `"down"` (default) \| `"right"` | layout direction; wide frames may use right | lead |

State: `kind` (`"final"`, `"error"`, `"wait"`, `"undo"`: card style), `mood` (`"rain"`, `"night"`, `"alert"`,
`"fixed"`, `"warm"`: whole-poster grading while active), `sfx` (sound when it becomes active), `ambience` (a loop while
it is active: `"rain"`, `"fire"`, `"street"`, `"room"`).

Edge: `style` (`"timer"`, `"async"`), `when` (guard expression for the checker, e.g. `"stock > 0 && !closed"`),
`do` (assignments, e.g. `{"stock": "stock - 1"}`). Chapter: `vars` (initial values for `when` / `do`),
`regions.history: true` (re-entering the box resumes where each lane was).

Rule: `rule.fix = {"edge": "a>b", "if": "有人检查", "stamp": "修好了"}`: the checker re-runs with that edge cut (or
guarded by `fix.when`) and records `rule.fixed = {"holds": bool}`; the engine draws the fix at the step marked
`{"fix": true}` (green guard words, the red trace fades, a green stamp).

Step: `tone` (voice control text, e.g. `"惊讶一点"`), `speaker` (cast name: that character's mouth follows the
narration), `sfx` (extra sounds at this step), `camera` (`"push"`, `"pull"`, `"overview"`), `fix` (see rule).

## timing.json additions (D writes, lead reads)

`page_timing()` passes these to the page.

- `steps[i].chars`: `[[char, t0, t1], …]` in **film seconds**, covering the step's `note`, or `null`.
- `steps[i].speaker`: cast name or null.
- `talk`: `{"fps": 30, "env": [0..1, …]}` narration loudness envelope over the whole film (2 decimals).
- `timeline.json` `sfx` entries get more kinds; `ambience`: `[{kind, from, to, gain_db}]`.

## Scene kit additions

- lead (`motion.js`): `$.enter(kind, progress, draw)` with `'draw' | 'pop' | 'slide' | 'erase'`;
  `$.travel(path, progress)` → `{x, y, f}`; `S.talk` (0..1 at this frame); `S.speaker`; `S.mood`; `$.tier` line
  widths `{outline: 3.2, structure: 2, detail: 1.2}`; `$.depth(level, draw)` with `'far' | 'mid' | 'near'`.
- B (`sets.js`, `props.js`, `people.js`): `$.set(name, area, state)`, `$.repeat(draw, area, opts)`, new props, and in
  `who()` / `person()` the options `build` (`kid`, `teen`, `adult`, `elder`, plus `slim`, `stout`), `face`
  (`neutral`, `happy`, `surprised`, `worried`, `sleepy`, `angry`, `proud`), `mouth` (0..1, overrides `talk`), new
  `arms` (`give`, `shrug`, `cheer`, `sleep`, `stomp`, `clap`, `point` with `o.target`), more hair, hats, accessories.

## Done means

`python3 scripts/smoke_test.py` passes; the three examples still check, lay out and render; new commands have a short
`--help`; each area documents itself in its reference file (B: `references/scenes.md`, D: `references/voices.md`,
A and C: `references/film-spec.md` sections). Commit on your own branch with clear messages.

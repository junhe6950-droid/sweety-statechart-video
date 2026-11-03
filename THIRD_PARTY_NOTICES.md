# Third-party notices

## Followed, not bundled

- **Ann Nguyen (x.com/ann_nnng), *the making of nhang — an animated statechart*.** Shared as a TypingMind artifact; her video is a recording of this page.
  - The look and the motion follow it:
    - crayon strokes with a speckled tooth and hatching;
    - a 3-frame line boil;
    - ticket cards with a pin and a red tag;
    - a bead running ahead of each growing arrow, words typing, cards popping and turning pink;
    - the auto-scrolling page of posters joined by an exit arrow;
    - the caption strip `I.3 — …`;
    - scenes that move with the steps.
  - The page carries no licence, so none of its code is included. `engine/crayon/` is our own implementation of the same techniques.
  - A copy of the page is kept outside this repository as a visual reference only.
- **Kevin Ngo (@kevin_t_ngo), *The business of boba*** (kevintngo/statechart-art, MIT): the idea of a rule chapter whose red path is found by a checker, and the stamp. Version 2 of this project vendored his kit; version 3 does not bundle any of it.
- **Lauren Tan (@poteto), the /statechart skill** in pstack (MIT): https://github.com/cursor/plugins/tree/main/pstack/skills/statechart. It checks statecharts with TLC. `scripts/modelcheck.py` is a small explicit-state checker written for this project in the same spirit.

## Bundled

- **Fonts** in `skills/sweety-statechart-video/engine/fonts/`:
  - **Special Elite**, Copyright (c) 2010 Astigmatic (AOETI). Apache License 2.0 (`SpecialElite-LICENSE.txt`). From google/fonts.
  - **Courier Prime**, Copyright 2015 The Courier Prime Project Authors. SIL Open Font License 1.1 (`CourierPrime-OFL.txt`). From google/fonts.
  - **LXGW WenKai 霞鹜文楷** (subset, weight 500), © 2021-2025 LXGW, © 2020 The Klee Project Authors. SIL Open Font License 1.1 (`LXGWWenKai-OFL.txt`). Source: github.com/lxgw/LxgwWenKai. Copied from the subset already bundled in sweety-handdraw-video.
- **Voices** in `skills/sweety-statechart-video/assets/voices/`:
  - four reference clips (`crayon-sister`, `blueprint-guy`, `sunny-girl`, `old-master`) and their previews;
  - generated on this machine by VoxCPM2 (OpenBMB, Apache-2.0, run through mlx-audio) from text descriptions alone;
  - no real person, creator, platform voice or cloud TTS output was used as a reference;
  - they are AI-generated, so label them as such when published.
- **Audio code** under `scripts/` (voice, ASR check, gates, music synth, meter, mix):
  - ported from our own sweety-handdraw-video 3.0.0 (commit 63154e4), same author and licence as this repository;
  - `scripts/design_voice.py` follows that project's voice-design procedure.

## Not bundled

- **Songti SC** for Chinese titles and cards is a system font, used through `local()` (Noto Serif CJK on other systems). It is not redistributed.
- **VoxCPM2 weights and the Whisper model** live in the local model folders and are never downloaded by these scripts.

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
- **Kevin Ngo (@kevin_t_ngo), statechart-art** (https://github.com/kevintngo/statechart-art, MIT; site https://kevintngo.github.io/statechart-art/): *The business of boba*, *One becomes two* and *Catch*.
  - Ideas we learned from it and drew with our own code:
    - the rule chapter, its red path found by a checker, and the stamp;
    - a list of rules marked as holding or breaking, with the checker's counts;
    - one red path per broken rule, a red double edge on its states, a pale wash under its arrows;
    - a different way to draw each chart: taped notes, wooden signs, soft region-tinted cards, plates, luggage tags, glass slides, felt patches and gold cord, and a parent state as a shop front;
    - guards written in the colour of the region they wait on;
    - arrows that stop short of their targets;
    - the layout shown in blue over a poster;
    - the spotlight and the microscope view of a step-through, and music-paced scrolling;
    - a gallery page with alt text and the chart as text.
  - Version 2 of this project vendored his kit; this version bundles none of his code. It bundles only his fonts (below).
- **Lauren Tan (@poteto), the /statechart skill** in pstack (MIT): https://github.com/cursor/plugins/tree/main/pstack/skills/statechart. It checks statecharts with TLC. `scripts/modelcheck.py` is a small explicit-state checker written for this project in the same spirit.

## Bundled

- **Fonts** in `skills/sweety-statechart-video/engine/fonts/`:
  - **Special Elite**, Copyright (c) 2010 Astigmatic (AOETI). Apache License 2.0 (`SpecialElite-LICENSE.txt`). From google/fonts.
  - **Courier Prime**, Copyright 2015 The Courier Prime Project Authors. SIL Open Font License 1.1 (`CourierPrime-OFL.txt`). From google/fonts.
  - **LXGW WenKai 霞鹜文楷** (subset, weight 500), © 2021-2025 LXGW, © 2020 The Klee Project Authors. SIL Open Font License 1.1 (`LXGWWenKai-OFL.txt`). Source: github.com/lxgw/LxgwWenKai. Copied from the subset already bundled in sweety-handdraw-video.
  - **Noto Serif SC Bold** (GB2312 subset, woff2), © 2017 Adobe (Noto CJK), SIL Open Font License 1.1, no Reserved Font Name (`NotoSerifSC-OFL.txt`). Source: github.com/notofonts/noto-cjk. The default face for Chinese titles and cards.
  - **Zhuque Fangsong 朱雀仿宋** (GB2312 subset, woff2), © 2023 Zhejiang JadeFoci Technology. SIL Open Font License 1.1 (`ZhuqueFangsong-OFL.txt`). Source: github.com/TrionesType/zhuque.
  - **LXGW Marker Gothic 霞鹜漫黑** (GB2312 subset, woff2), © 2021-2026 The LXGW Marker Gothic Project Authors. SIL Open Font License 1.1 (`LXGWMarkerGothic-OFL.txt`). Source: github.com/lxgw/LxgwMarkerGothic.
  - **Kevin Serif and Kevin Sans** (woff2), © 2026 Kevin T. Ngo, MIT (`KevinFonts-MIT.txt`), traced from A. V. Hershey's 1967 letters (public domain). From kevintngo/statechart-art. Used by the `pencil` theme.
- **Voices** in `skills/sweety-statechart-video/assets/voices/`:
  - four reference clips (`crayon-sister`, `blueprint-guy`, `sunny-girl`, `old-master`) and their previews;
  - generated on this machine by VoxCPM2 (OpenBMB, Apache-2.0, run through mlx-audio) from text descriptions alone;
  - no real person, creator, platform voice or cloud TTS output was used as a reference;
  - they are AI-generated, so label them as such when published.
- **Audio code** under `scripts/` (voice, ASR check, gates, music synth, meter, mix):
  - ported from our own sweety-handdraw-video 3.0.0 (commit 63154e4), same author and licence as this repository;
  - `scripts/design_voice.py` follows that project's voice-design procedure.

## Not bundled

- Characters outside the bundled GB2312 subsets fall back to the system's serif (`local()`); no system font is redistributed.
- **VoxCPM2 weights and the Whisper model** live in the local model folders and are never downloaded by these scripts.

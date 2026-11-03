# 复盘：statechart-art 吸收得怎么样

- 日期：2026-11-04
- 对象：
  - Kevin Ngo 的 [statechart-art](https://github.com/kevintngo/statechart-art)（MIT，仓库）；
  - 发布站点 [kevintngo.github.io/statechart-art](https://kevintngo.github.io/statechart-art/)。
- 被检查的：本项目 `v2-integrate` 分支（v2.0）。

## 结论

**三部作品里，核心特性已全部吸收，并且在“视频”这一维度上超过了原作。**

- **The business of boba**（四张海报）和 **One becomes two**（细胞周期长墙）：
  - 方法链（模型 → 检查 → 规则 → 画）全部吸收；
  - 四种图形各自的画法全部吸收；
  - 逐步演示、聚光、显微镜、按音乐卡点、图片替代文字、图表转文字也都吸收了；
  - 我们用同一套引擎，可以重现这四张海报的结构和题材（见第三节的对照图）。
- **Catch**（three.js 的纸剧场）：
  - 吸收了它的状态图部分：三条线同时报状态、毛毡补丁配金线、红线配红结、亚麻刺绣收尾、“如果跳过检查”的规则、各种画幅都不出界的测试；
  - **没有吸收它的 3D 纸剧场本身**（WebGL 场景、物理飞行、相机穿行）。这是另一种媒介，不在“蜡笔状态图短片”的范围里，见第四节。
- **我们原本的核心**（Ann Nguyen 的 nhang：蜡笔、抖动、圆点跑、打字、弹卡、粉圈、一页往下长、字幕条、插画跟着动、旁白、海报、批量）**一项都没丢**：
  - 默认主题仍是参考作品的样子；
  - 三个例子的检查结果和红线与 v1.1.1 一致；
  - 冒烟测试和引擎测试全部通过。

下面是逐项清单。每一项都写明出处、我们的做法和证据，标记含义：
- ✅ 已吸收；
- ✅＋ 已吸收并超过；
- ◐ 部分吸收，写明差在哪；
- ✗ 不吸收，写明原因。

## 一、方法链（三部作品共用）

| # | statechart-art 的做法 | 出处 | 我们 | 证据 |
|---|---|---|---|---|
| 1 | 每张图是一个 TLA+ 模型，TLC 走遍所有可达状态，逐条检查规则，给出打破规则的最短路径 | README「How they are made」 | ✅＋ 自己的显式状态检查器：守卫可写成逻辑（`when` / `do` / `vars`）、历史状态、一章多条规则、上限 20000 并报告；还会验证“修复后规则成立”（TLC 流程里没有这一步） | `scripts/modelcheck.py`、`scripts/test_statechart_io.py`（17 项）、`scv.py check` 输出 |
| 2 | 用 /statechart 技能跑 TLC，写出 `chart.mmd` 和 `report.md` | README | ✅ `scv.py import 目录 JOB` 直接读 /statechart 的输出（Mermaid、报告、`layout.mmd` 的方向），规则和路径原样带进来；6 份原作图表都能导入、检查、排版 | `scripts/statechart_io.py`、`scripts/fixtures/statechart-art/` |
| 3 | 不直接运行 TLA+ | — | ◐ 我们不调用 Java 版 TLC。用 TLC 查过的结果可以导入；自己写的图用本项目的检查器。导入原作 counter 一章时，我们的检查器算出的 7 个状态、11 步与 TLC 一致 | A 的报告、`test_statechart_art` |
| 4 | `view.mjs` 把模型的状态和步骤换成读者的话 | README | ✅ `film.json` 的 `label` / `note`；导入时保留原 id 作 `tag`，超长的字逐条提醒 | `references/import-export.md` |
| 5 | Mermaid 图加 `layout.mmd`（方向、间距） | README | ✅ 导出 Mermaid / XState / SCXML，都能再导入回来；方向对应 `flow` | `scv.py export`、`references/film-spec.md`「排版方向」 |
| 6 | pele 排版 | README | ✅ 自己的排版：分层、岔路、回路、字找空位，从上往下或从左往右，放不下自动加高、加宽 | `engine/crayon/layout.js`、`scripts/test_engine.py` |
| 7 | 同一份代码画出同一张图（播种随机） | README | ✅ `renderAt(T)` 是纯函数，抖动按名字播种 | `engine/crayon/ink.js` |
| 8 | 按像素模拟钢笔、铅笔、圆珠笔、马克笔、蜡笔在纸纹上的沉积 | `tools/kit/*.js` | ◐ 我们用矢量笔触加纸纹颗粒，加上叠色（multiply）、起收笔压力、远近深浅和纸张种类来近似；`pencil` 主题专门模拟钢笔加彩铅。没有做逐像素的纸纹高度场：那样一帧要几秒，做不了视频 | `engine/crayon/ink.js`、`references/looks.md` |
| 9 | 用模拟的笔写出 Hershey 字（Kevin Serif / Sans） | README | ◐ 随包带了 Kevin Serif / Sans（MIT），`pencil` 主题使用；文字逐字打出，没有逐笔画写出的动画 | `engine/fonts/KevinSerif-*.woff2` |
| 10 | 字在干净的纸上，箭头两头停一点 | 站点「five-step process」 | ✅ `thread` / `pencil` / `cord` 箭头两头停短；◐ 字下面没有“擦净纸纹”这一步（排版已让字避开线和画） | `chart.js` 的 `arrow(o.stop)` |

## 二、The business of boba（四张方形海报）

| # | 原作 | 我们 | 证据 |
|---|---|---|---|
| 11 | 方形海报，按手机能读的字号设计 | ✅＋ 任意画幅；竖版自动加大卡片字和箭头字；1:1 也行 | `film.js` 的 `f.text`、`test_engine.py` 的六种画幅 |
| 12 | I：订单票据用图钉钉住，红线串起来，票上印“No. 42” | ✅ `look: ticket` 加 `arrows: thread`，`tag: "No. 42"` | `output/v2-lead/boba/outputs/posters/01.png` |
| 13 | II：父状态画成店面（条纹遮阳篷、橱窗），外面的状态是木牌，子状态是贴在橱窗上的便签 | ✅ `regions.look: shop` 加 `look: sign` / `note` | `…/02.png` |
| 14 | III：“同一时间”框里两条线，卡片颜色随线；等另一条线的条件，用那条线的颜色写 | ✅ `look: soft`，条件自动认出依赖的那条线并换色（也可写 `waits`） | `…/03.png` |
| 15 | IV：坏路径上的状态描双红边，红线画出路径，一张图例（规则和“TLC 找到的路径”），盖章 | ✅＋ 双红边、红线下垫浅红、图例列出每条规则的 ✓ / ✗ 和“查遍几种情况、几步”、盖章；另外还能“先破后立”（绿条件、红线淡去、绿章） | `…/04.png`、`examples/takeout` 第四章 |
| 16 | 每张海报下列出检查过的规则 | ✅ 图例 + `check` 输出 + 作品集页（待 C 合并后核对） | `chart.legend`、`scv.py check` |
| 17 | 插画：收银员、店员、收银机、硬币、铃、杯子、摇杯、取餐器、炉上的珍珠锅、菜单板、“售罄”罐、沙漏、瓢虫、放大镜；Q 版人物 | ✅ 奶茶店道具 12 件 + `boba` 场景件 + Q 版体型（`build: chibi`） | `scv.py gallery` → `set-boba.png`、`people-looks.png` |
| 18 | 每张出 2160 原图、2048 的 x.com 图、1080 预览，以及 pele 的形状 JSON | ✅ 海报 2000 方 + `NN-layout.png` 蓝框叠加；社交尺寸见 C | `scv.py posters` |
| 19 | 站点把 pele 的形状用蓝色叠在海报上 | ✅ `01-layout.png` 等；作品集页可切换（待 C） | `main.js` 的 `posterPNG(ci, {overlay})` |
| 20 | 站点：每张一节（序号、标题、副标题、说明、规则、TLA+ / Mermaid / 版式源码、长替代文字） | 待 C 合并后核对 | — |
| 21 | 图标和分享卡 | ✅ 封面卡片重新设计；图标和 OG 卡待 C | `main.js` 的 `coverPNG` |

## 三、One becomes two（细胞周期长墙）

| # | 原作 | 我们 | 证据 |
|---|---|---|---|
| 22 | 一面往下长的长墙，16 张纸 | ✅ 一页往下长的海报（本来就是 nhang 的形式）；长图交付待 C | `player.js` |
| 23 | 每个状态是一张玻璃载片，每一步是一根线 | ✅ `look: slide`、`arrows: thread` | `chart.js` 的 `body('slide')` |
| 24 | 线的颜色有含义：金色是健康的路，红色是坏路，淡色是其余 | ✅ `happy` 主线金色，坏路红色，其余变淡（`player.fade`） | `film.js` 的 `happy`、`fade` |
| 25 | 两条规则成立，两条故意打破，每条坏路一根红线 | ✅ `rules` 多条规则，每条打破的规则一条红线 | `film.js` 的 `traceRoutes` |
| 26 | 逐步演示：一颗金色细胞沿线一步步走，聚光照在当前状态上，旁边一个显微镜小窗 | ✅ 视频里：圆点沿线跑、`spotlight`、状态的 `inset` 显微镜小窗；可交互网页的逐步模式待 C | `player.js` 的 `spotlight()`、`inset()` |
| 27 | 模型移植成 JS，并核对与 TLC 结果一致 | ◐ 引擎按 `film.json` 自己算步骤；D 的 `audio_plan` 与引擎在 108 步上逐步一致；A 的检查器与 TLC 在 counter 上一致 | D、A 的报告 |
| 28 | 图表转文字（每个状态列出“条件 → 下一个状态”）和“TLC 找到了什么” | 待 C | — |
| 29 | 视频顺着长墙滚动，忽快忽慢，让每章正好对上音乐的段落 | ✅＋ `music.sync`：无旁白时每步落在拍子上、每章落在小节线上；有旁白时用不超过 0.6 秒的停顿去对，对不上就让音乐等；盖章落在强拍 | `scripts/audio_plan.py`、`mix-report.json` |
| 30 | 音乐是一份乐谱，用 CC0 采样乐器演奏 | ◐ 我们用程序合成纯器乐（不用采样），按章节换段落；没有乐谱输入 | `scripts/music_synth.py` |
| 31 | 每张都有说明文字和替代文字；有图标和分享卡 | 待 C | — |

## 四、Catch（three.js 纸剧场）

| # | 原作 | 我们 | 证据 |
|---|---|---|---|
| 32 | 3D 纸剧场：卷纸火箭、巴尔沙木塔、棉花蒸汽、薄纸火焰、撕纸沙丘，相机跟着飞，带物理飞行 | ✗ 不吸收。这是 WebGL 3D 的另一种媒介，本项目是 2D 蜡笔状态图短片；我们只有 2D 的火箭和发射塔道具 | `props.js` 的 `rocket`、`launchTower` |
| 33 | 三个部分同时运行，每一站都写出“助推器 / 飞船 / 发射塔”各在什么状态 | ✅ “同一时间”章的字幕条上方显示各条线现在在哪 | `player.js` 的 `laneStatus` |
| 34 | 毛毡补丁（成功路线是带金边的藏青，其余灰），金线缝住，失败路线红线红结，坏状态铁锈色 | ✅ `look: patch`、`arrows: cord`、坏路双红边；◐ 补丁不按路线换底色（箭头会按 `happy` 换色） | `chart.js` 的 `body('patch')`、`arrow(o.cord)` |
| 35 | 收尾：整张图绣在亚麻布上，配图例（金、红、灰），并给出 SVG 和 Mermaid 的链接 | ✅ `linen` 主题加片尾全景；Mermaid 导出；◐ 没有单独的刺绣样张页 | `theme.js` 的 `linen`、`player.js` 的 outro |
| 36 | “如果跳过检查”的规则：两条打破，各有步数 | ✅ `rules` 加 `rule.fix` | `film-spec.md` |
| 37 | 物理和碰撞测试：所有物体两两检查，14 种屏幕比例下镜头都不越界 | ✅ 2D 对应物：`lint` 查插画压卡片、压字、压箭头、出界；`test_engine.py` 在 6 种比例、9 种主题、8 种画法下检查版面不出界 | `scripts/lint.py`、`scripts/test_engine.py` |
| 38 | 视频 1080 方、60 fps、45 秒，每一站停在音乐的小节上 | ✅ `"fps": 60`、`aspect: 1:1`、`music.sync` | `scv.py plan` |
| 39 | 没有 WebGL 时显示海报，另有分享卡 | ✅ 每章海报和封面本来就是交付物 | `outputs/posters/`、`cover.png` |

## 五、我们原本的核心：一项没丢

| nhang 的特性 | 现在 |
|---|---|
| 蜡笔颗粒和排线 | 保留；默认 `crayon` 主题调色板未改，多了叠色和压力 |
| 线条每秒抖 5 次、3 张图轮换 | 原样保留 |
| 票据卡、图钉、红色小标签 | 原样保留，是默认画法；图钉多了落下、晃动 |
| 圆点带光晕沿箭头跑，字逐个打出 | 原样保留 |
| 卡片弹出、变粉、套粉圈 | 保留；粉圈改成画出来，弹出多了压扁回弹 |
| 一页往下长、出口箭头接到下一章 | 保留；入口箭头会绕开页眉 |
| 字幕条 `I.3 — …` 和步数 | 保留；读过的字变深 |
| 插画跟着状态动 | 保留；多了场景件、出场方式和人物表演 |
| 旁白、海报、批量、任意比例、目标时长、自己的声音、水印 | 全部保留 |
| 无旁白时按参考节奏 1.2 秒一步 | 保留（`read_pace`） |

- **回归证据**：
  - `smoke_test.py` 通过；
  - `test_statechart_io.py` 的 `test_examples_unchanged` 去掉新字段后，例子的检查结果与 v1.1.1 一致；
  - `test_engine.py` 23 项通过。
- **默认外观的变化**（有意为之）：
  - 中文改用随包的 Noto Serif SC 子集，加打字机墨迹；
  - 竖版字号变大，为了手机；
  - 章标题打字出现；
  - 有旁白时开头显示 AI 标识。

  想要旧排版可以写 `"text": {"card": 23, "edge": 18.5}`；关掉标题打字写 `"player": {"type_titles": false}`。

## 六、超过原作的地方

- **它是视频，不只是图**：旁白（四个声音、语气控制、英文版）、字幕跟读、音效和环境声、按状态变化的色调、推近的镜头、开场钩子、片尾全景和片尾卡。
- **一套引擎覆盖四种原作的画法，还能混搭**：9 种主题、8 种卡片、4 种箭头、店面父状态，加上品牌色主题。
- **从代码到片子**：XState、Mermaid、SCXML、PlantUML 和 /statechart 输出都能导入，图也能导出回去。
- **检查器能证明修复**：“先破后立”不仅画出来，`check` 还会验证修复后规则成立。
- **给 AI 用的护栏**：`lint` 给出机器可读的改法，`draft` 起草插画，Schema 和 `scenes.d.ts` 提供类型。

## 七、还没吸收、或者有意不做的

- ✗ Catch 的 3D 纸剧场（另一种媒介）。
- ◐ 逐像素的纸纹介质模拟（视频帧率下太慢）。
- ◐ 用笔一笔一画写出字的动画（现在是逐字打出）。
- ◐ 字下面擦净纸纹（排版已让字避开线条和插画）。
- ◐ 用乐谱和采样乐器作曲（现在是程序合成）。
- ◐ 按路线给补丁换底色、单独的刺绣样张页。

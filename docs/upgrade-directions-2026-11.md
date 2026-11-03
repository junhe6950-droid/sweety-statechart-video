# 格物 · 蜡笔状态图：优化升级方向（2026-11）

- 日期：2026-11-03
- 基线：v1.1.1（`e62d044`）。v1.0.0 之后已经加了任意比例、默认时长、自己的声音和泡茶道具，下面按现在的代码看。
- 视角：**代码生视频**。画面由代码一帧一帧画出来，不是像素生成模型“猜”出来的。

---

## 一句话结论

格物在代码生视频这条路上的位置，是“**一个领域做深 + 一种风格做透 + 结果能验证**”。真正的对手不是可灵、Seedance 这类像素模型，而是 Remotion Skills、HyperFrames 这些通用的“Agent 写代码出视频”框架。

升级分三条线：

1. **管线现代化**：出片更快、画质更好，没有 Apple Silicon 也能出带旁白的版本；
2. **让 Agent 一次写对**：机器可读的画面检查、场景配方、带声音的预览。代码生视频的质量上限由模型决定，下限要靠工具兜住；
3. **把状态图当数据**：输入可以直接是代码里的状态机，输出也不止一部 MP4。这是通用框架做不到的护城河。

**最值得先做的五件事：**

| # | 做什么 | 为什么先做 |
|---|---|---|
| 1 | 跨平台旁白后端 | 现在只有 Apple Silicon 能配音，云端和 Linux 沙箱里的 Agent 只能出无声版 |
| 2 | 画面 lint（`scv.py lint`） | `scenes.js` 是各平台效果差异最大的地方，现在只能靠模型自己看拼图 |
| 3 | 字幕跟读 | `voice.json` 里已经有逐字时间，播放器还没用上，成本最低、观感提升最明显 |
| 4 | 帧通道去 JPEG + 编码参数升级 | 蜡笔颗粒是高频纹理，现在要经过两次有损压缩，成片只有 3–4.5 Mbps |
| 5 | AIGC 隐式标识（GB 45438） | 平台已经开始核验元数据，现在只写了一行 `comment` |

---

## 一、2026 年 11 月的行业坐标

### 1. 像素生成：越来越强，但不擅长讲结构

- **可灵 4.0**（10 月 15 日）：原生 30 秒、4K 10-bit HDR、立体声，还能用 MCP 控制，开发者 API 暂未开放。
- **Seedance 2.5、Wan 3.0** 在夏天登上榜首；Google 的默认视频模型换成了 Gemini Omni Flash，Veo 3.1 Preview API 已于 10 月 22 日下线。
- **Sora** App 4 月关停，API 9 月 24 日下线。
- 开源权重：MiniMax、LTX-2.5、HunyuanVideo、Wan 2.2。

**对格物的意义**：像素模型一段 3–30 秒，字会写错、结构会漂，改一句旁白就得整段重抽。格物的卖点正好相反：**字一定对，结构一定对，改一句只重做一句，同样的输入每次出同样的片子**。宣传上要把这点讲透。

### 2. 代码生视频：Agent + Skill + 确定性渲染已是标配

| 项目 | 2026 年动态 | 路线 |
|---|---|---|
| **Remotion** | 1 月发布 Agent Skills（`npx skills add remotion-dev/skills`）；`@remotion/web-renderer` 从 v4.0.491 起稳定，在浏览器里用 WebCodecs（Mediabunny）编码，不再截图；Studio 支持拖拽和关键帧 | React 组件 |
| **HyperFrames**（HeyGen） | Apache-2.0，十月已有约 6.7 万星；HTML + GSAP，用 Puppeteer 截图、FFmpeg 编码；约 20 个技能，带 lint / check / snapshot / preview / render，可上 Lambda 和 HeyGen 云渲染 | 纯 HTML |

**对格物的意义**：

- **追平的**：lint、预览、可复现、CI、云渲染这些工程设施，用户已经默认该有；
- **赢的**：状态图语义、模型检查器（规则章）、自动排版、蜡笔画法和道具库、本地专属声音。通用框架要从零写这些，格物已经有了。

### 3. 声音和音乐：本地模型够用了，还能跨平台

- **VoxCPM2**（4 月，2B，Apache-2.0）：30 种语言加 9 种方言；**可控克隆**，克隆音色的同时用 `(稍快，开心一点)正文` 控制语气；支持流式；运行时有 PyTorch CUDA、vLLM-Omni（OpenAI 兼容的 `/v1/audio/speech`）、llama.cpp-omni GGUF（CPU / Metal / CUDA / Vulkan）。官方没有列 MLX，我们用的是 mlx-audio 的移植。
- **Qwen3-TTS**：mlx-audio 已支持，含 VoiceDesign 和流式。
- **MOSS-TTSD v1.0**：多人对话合成，最多 5 个说话人，单次最长 60 分钟。同家族的 MOSS-TTS-Nano 只有 100M，CPU 就能跑。
- **CosyVoice 3**：可以用拼音控制读音，适合多音字和专有名词。
- **ACE-Step 1.5**（MIT）：本地音乐生成，有 Mac 上的 MLX 后端，显存不到 4GB。

### 4. 分发与合规

- **《人工智能生成合成内容标识办法》** 2025-09-01 起施行，配套强制国标 **GB 45438-2025**：
  - 文件元数据里要写名为 `AIGC` 的 JSON，字段有 `Label`、`ContentProducer`、`ProduceID`、`ReservedCode1`、`ContentPropagator`、`PropagateID`、`ReservedCode2`；
  - 视频起始画面要有显著提示；
  - 平台会核验元数据，核验到就打“AI 生成”标识，没声明的还会被识别后补标。
- **C2PA 2.4**（4 月）：MP4 用 `uuid` box 嵌 manifest。任何重新封装都会让它失效，所以要在最后一步签名。

### 5. 平台和 Agent 生态

- **内容平台**（下面多来自非官方文章，仅供参考）：抖音、小红书都把收藏、系列、长尾观看放在完播率前面，2 分钟以上的中长视频有扶持，也有横屏中视频加权的说法。默认 2–3 分钟的选择是对的，横屏值得认真做。
- **Agent Skills** 已是开放标准（agentskills.io）：
  - `SKILL.md` 有可选的 `compatibility` 字段；
  - 跨客户端共享的约定目录是 `.agents/skills/`。
- **Skills over MCP**（SEP-2640）：可以通过 MCP 分发技能。
- **MCP Apps**（规范 2026-01-26 稳定）：让工具在对话里直接渲染交互界面。

---

## 二、现状体检（按 v1.1.1 代码）

### 做得好、要守住的

- **确定性**：`renderAt(T)` 是纯函数，随机数按名字播种（`ink.js` 里的 mulberry32），线条抖动是 5 fps、3 张图轮换。并行分块、补帧、复现都靠这个。
- **工程韧性**：
  - 分块渲染时每块一个进程组，用心跳文件判断卡死，卡住就杀掉重试（`scv.py` 的 `render`）；
  - 静态层按“章 × 抖动帧”缓存。
- **声音质量**：
  - 每句都过噪声门禁、Whisper 核对和尾音检测；
  - 按内容缓存，改一句只重做那一句；
  - 混音做到 −14 LUFS 和 −1 dBTP，音乐会在旁白下自动压低。
- **规则章**：显式状态的模型检查（`modelcheck.py`），红线是检查器找出来的，不是手画的。

### 差距（每条都对得上代码）

| # | 现状 | 位置 | 影响 |
|---|---|---|---|
| 1 | 帧通道：Canvas → `toDataURL` JPEG（q≈.94）→ base64 → Python → ffmpeg 先解 MJPEG，再用 libx264 以 CRF 26 编码 | `scripts/scv.py:563`、`engine/crayon/main.js:19` | 两次有损压缩，再加 base64 多出约 33% 的数据；成片实测 3.2–4.5 Mbps（1080×1440），蜡笔颗粒发糊，平台还会再转码一次 |
| 2 | 旁白只能在 MLX（Apple Silicon）上跑 | `scripts/voice.py`、`audio_env.py` | Codex 云端、Claude Code 网页版、Grok Bot 这类 Linux 沙箱只能出无声版，和 README 里的“主流 AI 助手里都能用”有落差 |
| 3 | `voice.json` 里有每个字的时间 `chars`，播放器没读 | `scripts/voice.py:23`、`engine/crayon/player.js:138` | 字幕整句一下出现，不跟读 |
| 4 | 镜头只会纵向滚动；横版是“方海报 + 滚动” | `engine/crayon/player.js:48` | 横屏只是能用，谈不上好看；没有推近、拉远和全图回顾 |
| 5 | 插画质量全靠模型：压线、压字、空地用没用满，都要模型自己看拼图 | `references/story-design.md`（画面检查） | 平台实测里 Claude 只能自己画烧水壶和茶杯；不同模型差异大 |
| 6 | 预览只有 stills 拼图和分段渲染，没有声音、不能拖动 | `scv.py stills` | 改一轮要几十秒，听不到节奏 |
| 7 | AI 标识只写了 `comment=AI-generated narration` | `scripts/scv.py:698` | 不是 GB 45438 的 `AIGC` 字段，平台核验不到 |
| 8 | 音效只用了“啵”一种；`mix.py` 已经支持 pop / paper / tick / chime | `scv.py` 的 `plan`、`scripts/mix.py:50` | 插画在动，耳朵里什么都没有 |
| 9 | 输入只能手写 `film.json` | — | 仓库里已有的状态机（XState、Mermaid、SCXML）用不上 |
| 10 | 守卫只是给人看的文字，检查器把每条箭头都当可走；嵌套只支持一层父状态 | `scripts/modelcheck.py` 文件头 | 规则章只能回答“能不能”，回答不了“在什么条件下会” |
| 11 | 文档小漂移：SKILL.md 写的 `SCV_PYTHON` 默认路径还是 sweety-handdraw-video 的 venv，`scv.py` 实际先用自己的 venv | `SKILL.md:93` | 新用户排查环境时会困惑 |

---

## 三、升级方向

每条都写清楚做什么、怎么落地、怎么算做完。价值和成本是粗估：高、中、低。

### A. 渲染管线

**A1. 帧通道去 JPEG，编码参数重定**（价值高 · 成本中）

- **做法**：
  1. 先做零风险的改动：去掉 base64，帧改用 `canvas.toBlob` 或 CDP 传二进制；JPEG 换成 PNG 或原始 RGBA；
  2. 再试页面内用 WebCodecs `VideoEncoder` 直接出 H.264 / HEVC 分片（Mediabunny 封装，Remotion 的 web-renderer 就是这么做的），Python 只负责拼接；
  3. 无头 Chrome 里能不能用上硬件编码要实测，保留 ffmpeg 路径兜底；
  4. 编码参数：用 SSIM 或 VMAF 对 PNG 参考打分，比较 CRF 18–20、`-tune grain` / `-tune animation` 和 10-bit HEVC，然后定默认值；
  5. 另出一份“上传母版”（约 10–15 Mbps），给平台二次转码留余量。
- **验收**：93 秒的片子渲染时间不超过 40 秒（现状）；颗粒肉眼可见；SSIM 有提升；体积可以接受。

**A2. 横屏原生版式和镜头语言**（价值高 · 成本中高）

- **做法**：
  - `layout.js` 加左右方向的布局（状态从左往右分层），插画分到上下两侧；
  - `planCamera` 加三种确定性镜头：推近当前卡片、换章时拉远、片尾回顾全图；
  - `film.json` 加 `"camera": "follow" | "push" | "overview"`。
- **为什么**：平台在给 2–10 分钟的横屏中视频加权（来源非官方，方向一致），现在的横版是将就。

**A3. 一次渲染，多种交付**（价值高 · 成本低）

`renderAt(T)` 是确定性的，同一套代码再出几种形态几乎不花钱：

- **每章一条竖版切片**（30–60 秒，自带片头片尾），适合抖音分发；
- **长图**：全片海报纵向拼接，正是参考作品本来的样子，适合小红书图文和公众号；
- **可交互 HTML**：单文件，带播放器，可以一步步点着看，适合博客、文档和课件；
- **GIF / APNG**：某一章的循环动图，放进 README 和 PR。

**A4. 嵌进别人的视频框架**（价值中 · 成本中，可选）

把 `Player` 包成 Remotion 组件和 HyperFrames 片段（输入时间，输出画面）。不换底座，借别人的生态出圈：用户在自己的 Remotion 片子里插一段格物状态图。

### B. 声音

**B1. 跨平台旁白后端**（价值高 · 成本中）

- **做法**：
  - `voice.py` 抽出后端接口：`mlx`（现状）、`torch`（CUDA）、`http`（vLLM-Omni 的 `/v1/audio/speech`，本机或局域网都行）、`gguf`（llama.cpp-omni，可在 CPU 或 Vulkan 上跑）；
  - 四个专属声音的参考录音和逐字稿已经固定，任何后端都能用克隆复现同一个音色；
  - 门禁和 ASR 核对照旧，Whisper 在非 Mac 上换成 faster-whisper；
  - `audio_doctor.py` 报出当前可用的后端。
- **验收**：在 Linux 沙箱里跑冒烟测试，能出带旁白的版本；四个声音的听感和 Mac 上一致（同一句话做 A/B）。

**B2. 每一步的语气**（价值中 · 成本低）

- **做法**：步骤里加 `"tone": "惊讶一点"`，转成 VoxCPM2 可控克隆的 `(…)` 前缀。规则章默认更紧张一点，结尾默认更舒缓一点。
- **注意**：语气会影响语速和 ASR 结果，门禁要同时检查语速有没有超出范围。

**B3. 字幕跟读**（价值高 · 成本低）

- **做法**：`plan` 把 `chars` 写进 `timing.json`，`captionBar` 按时间把读到的字加深或描红（卡拉 OK 式）。`chars` 为空时退回现状。
- **可选**：箭头上打字的节奏也跟着旁白走。

**B4. 道具音效**（价值中 · 成本中）

- **做法**：道具在 `fg` 里发事件（`$.sfx('steam')`）。`plan` 用确定性的预演扫一遍全片，收集事件写进 `timeline.json`，`mix.py` 再加几种程序合成的声音：水开、火、门、雨、车铃。
- **原则**：继续不用采样，保持没有版权问题。

**B5. 多语言和方言版本**（价值中 · 成本中）

- **做法**：`film.json` 加 `i18n` 块，放卡片、箭头和字幕的译文，一部片出多个语言版本。VoxCPM2 支持 30 种语言和 9 种方言，四川话、粤语版本很适合做小红书的钩子。
- **要改的**：拉丁文字的字数规则和版式（现在的 24 字、2–6 字都是按中文定的）。

**B6. 对话章**（价值中 · 成本中，可选）

- **做法**：两个角色你一句我一句（骑手和后厨），用 MOSS-TTSD 一次生成整段对话，比逐句换声音自然。
- **代价**：多一个 8B 模型，所以只做成可选后端。

**B7. 音乐升级**（价值低 · 成本中，可选）

- **做法**：`"music": {"engine": "ace-step", "prompt": "..."}`，接 ACE-Step 1.5（MIT，有 MLX 后端）。默认仍是现在的程序音乐，零依赖。

### C. Agent 体验：让模型一次写对

**C1. 画面 lint：`scv.py lint JOB`**（价值高 · 成本中）

把现在“看拼图”的人工检查变成机器可读的 JSON，模型照着改就行：

- **压线、压字**：单独渲染插画层，和卡片、箭头、文字的蒙版求交，报出哪个道具压了哪张卡、压了多少像素；
- **空地利用率**：每块空地的着色占比，低于阈值就报“free 3 还空着”；
- **跟没跟状态动**：相邻两步之间插画层的像素差，太小就报“这一步插画没有变化”；
- **出界、被字幕条挡住、地面线不齐、人物比例超出 0.7–0.9**；
- 输出：每条问题带坐标、建议的改法和截图裁切。

验收：平台实测里拿 lint 的问题数做指标，修完以后一次通过率明显上升。

**C2. 道具图鉴和场景配方**（价值高 · 成本中）

- `scv.py props`：把 70 多个道具连同名字、参数和动画中的一帧画成一张图鉴。多模态模型看一眼就知道有什么可用，不会再自己重画烧水壶。
- **场景配方**：`$.recipe('kitchen', free[2], {busy: S.on('cooking')})`，一次铺好一组搭配好的道具。弱一些的模型用配方也能做出像样的海报，强模型再在上面细调。
- `scv.py new` 按状态名猜场景，生成一版能跑的 `scenes.js` 初稿。

**C3. 带声音的实时预览：`scv.py preview JOB`**（价值高 · 成本低）

- **做法**：本地开一个页面，有时间轴可以拖动，带旁白和音乐，列出所有步骤，改了 `scenes.js` 或 `film.json` 自动刷新。播放器本来就在浏览器里，主要是加外壳。
- **再进一步**：做成 MCP App，在 Claude 等支持 MCP Apps 的对话里直接拖着看。

**C4. 写 `film.json` 之前就能校验**（价值中 · 成本低）

- 给 `film.json` 出 JSON Schema，给画笔 `$` 和状态 `S` 出 `.d.ts`；
- 编辑器和 Agent 写的时候就能校验，支持约束输出的模型也能直接用。

**C5. 平台实测变成回归测试**（价值高 · 成本中）

- **做法**：把 `output/platform-test/run.sh` 固化下来：N 个题目 × M 个 Agent，按渲染是否成功、lint 问题数、时长是否落在目标里、用了几轮来打分，每个版本跑一遍并记录。
- **为什么**：这是“各平台效果略有差异”唯一能量化的办法。

**C6. 打包向标准看齐**（价值中 · 成本低）

- **SKILL.md**：
  - 写上 `compatibility`：渲染需要 Chrome；旁白需要 Apple Silicon，做完 B1 以后改成任意平台；
  - 安装说明加上 `.agents/skills/` 目录。
- **补齐分发渠道**：Claude Code 插件市场；MCP 服务器把 check、layout、render 暴露成工具，返回图片，Grok Bot、Muse 这类只能聊天的宿主也能远程用。

### D. 状态图本体（护城河）

**D1. 代码 → 片子：导入现成的状态机**（价值高 · 成本中）

- **做法**：`scv.py import` 支持 XState v5 配置、Mermaid `stateDiagram-v2`、SCXML、PlantUML，生成 `film.json` 骨架（状态、箭头、守卫、父状态和并行区域）。Agent 只需要补字幕和插画。
- **场景**：工程师给新同事讲支付状态机、在设计评审里演示订单流转、事故复盘时用规则章重现那条坏路。这才是字面意义上的“从代码生视频”，也是一个全新的用户群。
- **反向**：`scv.py export` 把 `film.json` 导出成 Mermaid 或 XState，片子里的图可以回到文档和代码里。

**D2. 守卫变成逻辑**（价值中 · 成本中）

- **做法**：`if` 可以写一个简单的变量表达式（`stock > 0`），显示的仍是文字；检查器据此分清“可能发生”和“会发生”。
- **一起做**：支持两层嵌套和历史状态。

**D3. 规则章“先破后立”**（价值中 · 成本低）

- **做法**：先画红线、盖“规则被打破”的章；再加一条守卫，检查器确认“现在走不到了”，盖一枚绿章。
- **为什么**：讲隐患的片子就有了“问题 → 修复”的完整故事，收藏率也会更高。

### E. 风格和叙事

画面本身（笔触、构图、动效、配色主题）的升级单独写在 [视觉升级](visual-upgrade-2026-11.md)，这里只讲叙事。

**E1. 开头两秒**（价值高 · 成本低）

- **问题**：现在第一帧是空海报，字幕条上只有片名。
- **做法**：
  - 加 `"hook"`：先闪现整章画完的海报，配一句提问，再倒带回第一步，“先给结论再展开”；
  - 封面单独设计：大字标题加局部海报，不再只是第一章海报缩小。

**E2. 角色表**（价值中 · 成本低）

- **做法**：`film.json` 加 `cast`，定义一次人物的衣服、帽子和颜色，各章用名字引用。“同一个人每章穿同一套衣服”就从靠记住变成靠数据。

**E3. 系列化**（价值中 · 成本低）

- **做法**：系列编号、“下一集”片尾卡，加上 B 站和 YouTube 的章节时间戳（从 `timing.json` 直接生成）。平台在奖励系列内容和长尾回看。

**E4. 风格包**（价值中 · 成本中高，谨慎）

- **做法**：把调色板、笔触参数、字体和卡片形状抽成风格 JSON。
- **谨慎的原因**：“格物 = 蜡笔”是辨识度，第二种风格要自己原创，不能照搬别人的作品，做之前先想清楚值不值。

### F. 合规与发布

**F1. GB 45438 元数据**（价值高 · 成本低）

- **视频和旁白音频**：在 `finalize` 里写入 `AIGC` JSON：
  - `Label: "1"`；
  - `ContentProducer`：本工具的标识；
  - `ProduceID`：每部片唯一，用 UUID 加上 `film.json` 的哈希；
  - `ReservedCode1`：校验哈希。
- **起始画面提示**：`film.json` 加 `"ai_label"`，在开场的字幕条上写一行“旁白由 AI 合成”，可以关掉。
- **待确认**：MP4 里该放哪个 box（`udta` 还是 XMP），要以 TC260 的实践指南为准，先查清楚再写死。

**F2. C2PA**（价值低 · 成本低，可选）

面向海外平台，最后一步用 c2patool 签名，必须在所有 ffmpeg 处理之后。

**F3. 发布包**（价值中 · 成本低）

`outputs/publish/` 里放：几个标题备选、简介、话题标签、章节时间戳、平台建议的画幅。全部从 `film.json` 生成，不调外部服务。

### G. 工程

- **CI**：GitHub Actions 在 Linux 上跑冒烟测试（无声版）、lint 和单元测试；做完 B1 以后再加带旁白的冒烟测试。
- **金帧测试**：示例片在固定时间点的帧做哈希，引擎改动就能报出画面回归。
- **环境**：用 `uv` 锁依赖，出一个 Linux 渲染镜像，给云端 Agent 用。
- **小修**：SKILL.md 里 `SCV_PYTHON` 的默认路径（差距第 11 条）。

---

## 四、建议不做的

- **把像素视频模型塞进主流程**：违背“全部用代码现画”，失去确定性、正确的字和零版权这些核心卖点。用户想在剪辑时自己加，是他们的事。
- **底座换成 Remotion 或 HyperFrames**：现在的 Canvas 引擎更轻，也已经是确定性的；迁移等于重写，还会损失风格。接到它们的生态里（A4）就够了。
- **默认走云端 TTS**：会丢掉离线和无版权两个卖点。可以做成可选后端，不做默认。
- **扩到写实动画或口播**：SKILL.md 已经明确不做，保持专注。

---

## 五、版本节奏建议

| 版本 | 主题 | 内容 |
|---|---|---|
| **v1.2**（2–3 周） | 兜底和合规 | B3 字幕跟读 · F1 AIGC 元数据 · A1 第一步（去 base64 和 JPEG，重定编码参数）· C1 lint v1（压线、空地、没变化）· C2 道具图鉴 · C4 Schema · E1 开头两秒 · G 的 CI 和小修 |
| **v1.3** | 到处都能出带声音的片 | B1 跨平台旁白 · B2 语气 · B4 道具音效 · C3 预览 · A3 多种交付 · C5 回归测试 |
| **v2.0** | 代码进，片子出 | D1 导入和导出 · D2 守卫逻辑 · D3 先破后立 · A2 横屏原生版式和镜头 · C6 MCP 服务器和 MCP App · B5 多语言和方言 |

## 六、怎么衡量

- **渲染**：93 秒片子的渲染时间（现在约 40 秒），成片对 PNG 参考的 SSIM，码率。
- **Agent**：各平台一次交付成功率、lint 问题数、从一句话到成片的轮数和时间。
- **覆盖**：能出带旁白版本的平台数（现在只有 Mac 本机）。
- **发布**：自己账号上的收藏率和完播率（新开头和旧开头做 A/B）。

---

## 来源

- Remotion：[Agent Skills 报道](https://news.aibase.com/news/24827) · [2026 更新汇总](https://autoae.online/blog/remotion-updates-2026) · [客户端渲染](https://www.remotion.dev/docs/client-side-rendering/) · [@remotion/web-renderer](https://www.remotion.dev/docs/web-renderer/) · [v4.0.491](https://github.com/remotion-dev/remotion/releases/tag/v4.0.491)
- HyperFrames：[项目](https://github.com/heygen-com/hyperframes) · [介绍](https://themenonlab.blog/blog/hyperframes-claude-code-writes-renders-videos) · [HTML 渲染框架解析](https://silenceper.com/en/article/2026-05-02-hyperframes-html-video-rendering/) · [Agent-first 渲染](https://dev.to/mech_app_ai/hyperframes-html-to-mp4-rendering-as-an-agent-first-primitive-33k7)
- 像素生成模型：[2026 年 10 月格局](https://www.getscrollflow.com/blog/ai-video-generation-after-sora) · [Veo 3.1 / Kling 3.0 / Gemini Omni 对比](https://tech-insider.org/best-ai-video-generator-2026/) · [2026 模型综述](https://pinggy.io/blog/best_video_generation_ai_models/)
- WebCodecs：[canvas-record](https://github.com/dmnsgn/canvas-record) · [渲染基础](https://webcodecsfundamentals.org/basics/rendering/) · [2026 年客户端渲染](https://www.captio.work/blog/client-side-video-rendering-2026)
- 声音：[VoxCPM](https://github.com/OpenBMB/VoxCPM) · [VoxCPM2 模型卡](https://huggingface.co/openbmb/VoxCPM2) · [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) · [mlx-audio](https://github.com/Blaizzy/mlx-audio) · [MOSS-TTS](https://github.com/OpenMOSS/MOSS-TTS) · [开源 TTS 盘点](https://www.scriptbyai.com/best-open-source-tts-models/)
- 音乐：[ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5)
- 合规：[标识办法](http://www.whwx.gov.cn/zcfg/gfxwj/202608/t20260806_2830556.shtml) · [GB 45438 元数据实现示例](https://github.com/gtkit/aigc) · [AIGC 标识规则与合规要点](https://cloud.tencent.com/developer/article/2686230) · [平台标识执行](https://www.hailuoshe.com/blog/ai-generated-video-labeling) · [C2PA 2.4 规范](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html)
- Agent 生态：[Agent Skills 开放标准](https://the-decoder.com/anthropic-publishes-agent-skills-as-an-open-standard-for-ai-platforms/) · [Skills over MCP（SEP-2640）](https://modelcontextprotocol.io/seps/2640-skills-extension.md) · [Agent Skills 实践指南](https://blog.serghei.pl/posts/agent-skills-101/)
- 平台趋势（非官方）：[抖音 2026 风向](https://www.sohu.com/a/1044204664_121231944) · [小红书中长视频](https://www.huxiu.com/article/4861801.html) · [小红书视频规格 2026](https://resouci.com/xiaohongshu-video-note-spec-2026/)

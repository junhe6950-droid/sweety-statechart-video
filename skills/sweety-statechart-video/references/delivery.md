# 交付

`render` 出画面，`finalize` 配上声音、写好标识，`deliver` 和 `publish` 再从同一次渲染出别的形态。`all` 依次都跑。

## 成片和母版

| 文件 | 用途 | 编码 |
|---|---|---|
| `outputs/film.mp4` | 转发、下载、发给人看 | H.264 High，CRF 20，`-preset medium -tune animation`，yuv420p，标 BT.709；AAC 192k |
| `outputs/film-master.mp4` | 上传到平台 | H.264 High，CRF 13，`-preset veryfast`，码率上限 15 Mbps（实测约 11–13 Mbps）；AAC 320k |

平台收到视频都会再压一遍。传母版，它压完还清楚；传成片，等于压两遍。

## 帧怎么出来

页面画好一帧，用 `canvas.toBlob` 存成 PNG（无损，在后台线程里做，不卡页面），交给本机 127.0.0.1 上的一个小服务，直接送进 ffmpeg；一个 ffmpeg 同时编成片和母版。旧路径要先压成 JPEG、转成 base64 文字、再解开，画面先损失一次。

`scv.py render JOB --encoder …` 可以换：

- `x264`（默认）：上面这条路；
- `webcodecs`：在浏览器里用 WebCodecs 编码（Mac 上是 VideoToolbox 硬件编码），ffmpeg 只换封装。快，但同样画质文件更大，也没有母版；
- `legacy`：v1 的路径（JPEG → base64 → CRF 26），留着兜底。

film.json 写 `"encoder": "legacy"` 也行。

## 实测

外卖示例，无旁白，81 秒，1080×1440，2430 帧，6 个浏览器并行，M3 Max（和别的任务共用，负载在 13–150 之间，所以秒数会差 ±30%）。SSIM 是和同一组帧的 PNG 无损截图比，RGB 和亮度各一个；4:2:0 的视频 RGB 最多到 0.954、亮度 0.998，因为蜡笔颗粒的颜色细节在色度降采样时就丢了一部分。

整片：

| 方法 | 渲染（秒） | SSIM RGB / 亮度 | 大小 |
|---|---|---|---|
| v1：JPEG .94 → base64 → CRF 26 | 45–86，交替测的中位数 61 | .914 / .965 | 46.8 MB |
| PNG（toBlob）→ CRF 26 | 62 | .911 / .963 | 41.6 MB |
| JPEG q1.0 → CRF 26 | 80 | .909 / .962 | 40.5 MB |
| RGBA（getImageData）→ CRF 26 | 6 个浏览器时每帧卡 235–460 ms（PNG 是 64–82 ms），没跑完 | — | — |
| WebCodecs 硬件 H.264，q20 | 32 | .923 / .973 | 99.2 MB |
| WebCodecs 硬件 H.264，q26 | 37 | .894 / .947 | 56.5 MB |
| **默认：PNG → 成片 medium CRF 20 animation + 母版** | 53–66，交替测的中位数 56 | 成片 .933 / .982；母版 .940 / .988 | 69.8 + 115.7 MB |
| PNG → 成片 slow CRF 20 animation + 母版 | 86 | 成片 .935 / .984 | 61.4 + 115.8 MB |

只换帧通道、编码不变（CRF 26），画质几乎不动：损失主要在 CRF 26 这一步，不在 JPEG。所以默认同时换了编码参数，并且一次出两份。

编码参数（同一段 20 秒、600 帧，从 PNG 编码）：

| 参数 | Mbps | SSIM RGB / 亮度 | CPU（毫秒/帧） |
|---|---|---|---|
| CRF 26 slow（v1） | 4.6 | .898 / .956 | 90 |
| CRF 20 slow | 9.4 | .926 / .980 | 123 |
| CRF 18 slow | 11.7 | .932 / .985 | 129 |
| CRF 20 slow `-tune grain` | 11.2 | .926 / .978 | 129 |
| CRF 20 slow `-tune animation` | 6.6 | .926 / .980 | 145 |
| CRF 18 slow `-tune animation` | 8.0 | .933 / .985 | 137 |
| CRF 20 medium `-tune animation` | 7.4 | .923 / .977 | 81 |
| HEVC 10-bit CRF 20 medium | 7.6 | .926 / .979 | 157 |
| VideoToolbox H.264 12 Mbps | 10.6 | .922 / .977 | 18 |
| 母版：veryfast CRF 13，上限 15M | 12.8 | .933 / .986 | 31 |

- `-tune animation` 同样画质省三成码率；`-tune grain` 多花码率，SSIM 反而低；
- 10-bit HEVC 在这种画面上不省，很多地方还放不了，不用；
- slow 比 medium 好一点点，CPU 多八成，默认用 medium；
- WebCodecs 最快，同样画质文件大一半到一倍，适合赶时间（`--encoder webcodecs`）。

## 预览

`scv.py preview JOB`，打开 http://127.0.0.1:8765/：

- 能播放、拖动、调速，右边是全部步骤，点一下跳过去；
- 有 `work/audio/mix.wav` 就带声音，和进度条同步；
- 改了 `film.json` 或 `scenes.js`，页面自己重排时间、重新载入，停在原来的位置；
- “逐步看”一步一步走，当前卡片亮着、别的变暗；“放大镜”放大当前卡片。键盘：空格、← →、S、M。

`outputs/film.html`（`deliver --what html`）是同一个播放器，所有东西都装在一个文件里。

## 金帧测试

`scv.py golden` 把三个示例（无旁白）在固定时间点各渲染一帧，和 `tests/golden/` 里存的缩略图比 SSIM，低于 0.985 就报回归，并在临时目录里留一张“存的 | 现在 | 差异”的对照图。画面有意改动之后，`scv.py golden --update` 重存一遍。

## 平台实测

`python3 scripts/eval_platforms.py` 列出计划：几个题目 × 几个 Agent（codex、grok、claude），每个在自己的文件夹里做片。加 `--run` 才真的跑，跑完按“出片、时长在目标内、页面报错、lint 问题数”打分，写 `summary.md`。`--score 目录` 给已经跑完的一批重新打分。

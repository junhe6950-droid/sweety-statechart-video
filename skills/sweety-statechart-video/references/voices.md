# 声音

本项目有四个专属旁白声音，都是本机 VoxCPM2（Apache-2.0）**只凭一段文字描述**设计出来的，没有用任何真人、主播、平台音色或云端 TTS 的声音作参考。做法和 sweety-handdraw-video 的合成声音一样：

1. 同一句参考台词，用四个种子各生成一遍；
2. 每遍都过噪声门禁、ASR 全文核对和语速检查；
3. 按描述挑最贴的一遍（量音高和语速，老师傅要低、要慢），固定成参考录音；
4. 之后每一句都用这段参考做 Hi-Fi 克隆，所以整片、各片之间声音都一致。

| ID | 名字 | 听感 | 适合 | 参考音高 |
|---|---|---|---|---|
| `crayon-sister`（默认） | 蜡笔姐姐 | 年轻女声，明亮温暖，带笑意，轻快亲切 | 生活知识、轻松科普 | 约 276 Hz |
| `blueprint-guy` | 图纸哥 | 三十岁左右的男声，干净清爽，理性利落，带一点幽默 | 流程、原理、机制 | 约 118 Hz |
| `sunny-girl` | 元气少女 | 十八岁左右的女声，清脆甜亮，语调上扬，稍快 | 有趣的小科普、生活故事 | 约 348 Hz |
| `old-master` | 老师傅 | 六十多岁的男声，温厚略沙哑，慢悠悠，带笑 | 手艺、老行当、过日子的道理 | 约 111 Hz，语速约慢三成 |

- 文字描述、选中的种子和检查数据都在 `assets/voices/catalog.json`（`design_prompt`、`generation`）。
- 参考录音是 `assets/voices/<id>.wav` 加 `<id>.txt`。
- 同一句话的试听在 `assets/voices/previews/<id>.wav`：“付了钱，商家叮的一声接了单。厨房开了火，面已经下锅了。”
- 四个声音都还没有经过人耳验收（`acceptance: pending_listening`）。

## 用法

- **选声音**：`film.json` 里写 `"voice": "old-master"`，`scv.py voices` 列出所有可用声音。
- **自己的声音**：见下面“加自己的声音”。sweety-handdraw-video 个人声音库里的声音也能直接用。
- **生成**：`scv.py voice JOB` 逐句生成。
  - 每句先用固定种子；没过门禁或 ASR 就换下一个种子，最多四次；
  - 结果按内容缓存，改一句只重做那一句；
  - `--redo c2s03` 不要这一句的当前结果，换种子重来。
- **数字**：VoxCPM2 不会读阿拉伯数字。字幕里有数字时，在全片 `say` 表或这一步的 `say` 里写出读法，例如 `"say": {"42": "四十二"}`。

## 加自己的声音

准备一段 8–15 秒的录音：

- 只有一个人在说话；
- 没有背景音乐，没有回声；
- 在一句话的末尾结束。

手机录音、会议录屏、视频都行，再写下这段里说的每一个字：

```bash
python3 scripts/scv.py add-voice my-voice --audio 录音.m4a --start 12.5 --end 25 \
  --text "这段录音里说的每一个字，标点也写上。" --consent self --name 我的声音 --preview
```

这条命令依次：

1. 切出这一段，检查长度；
2. 查噪声、嗡声、削波和停顿；
3. 用 Whisper 把这段听写出来，和你写的逐字稿逐字核对；
4. 都通过了，存到 `~/.local/share/sweety-statechart-video/voices/my-voice/`；
5. 加了 `--preview` 时，再用这个声音读一句试听，存在同目录的 `previews/my-voice.wav`。

之后在 `film.json` 里写 `"voice": "my-voice"` 就能用。

没通过时，它会说原因：

- 噪声重：换一段更干净的；
- 对不上：改逐字稿。

`--consent` 只能是 `self`（本人）或 `authorized`（已获授权）。不要添加公众人物、主播或平台的声音。

## 重新设计

`scripts/design_voice.py` 读 `assets/voices/designs.json`（描述、参考台词、种子），生成候选（放在 `output/voices/<id>/`，附 `report.json`），选出参考，再写好试听和目录。

- 自动挑选只看 CER 和停顿深度。按听感指定种子：`--pick old-master=101`；
- 加新声音：在 `designs.json` 加一项，再跑 `--only 新id`；
- 描述只写声音本身的特征（身份 + 质感 + 用途），不要写“像某某”。

合成旁白属于 AI 生成内容，发布时要按平台要求标注。成片的 mp4 元数据里已经写了 `AI-generated narration`。

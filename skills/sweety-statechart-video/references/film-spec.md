# film.json 规格

```json
{
 "title": "一份外卖的一生",
 "series": "外卖背后",
 "aspect": "3:4",
 "voice": "crayon-sister",
 "chapters": [
  {
   "title": "一份订单",
   "sub": "从下单，到敲门",
   "tagline": "order · kitchen · doorstep",
   "states": {
    "placed": {"label": "已下单", "tag": "order placed", "pin": "pink"},
    "accepted": {"label": "商家接单", "tag": "accepted", "pin": "straw"}
   },
   "start": "placed",
   "edges": [{"from": "placed", "to": "accepted", "label": "你付了钱", "if": "有库存"}],
   "exit": {"from": "accepted", "label": "骑手这边呢 ↓"},
   "steps": [
    {"go": "start", "note": "你在手机上，点了一碗牛肉面"},
    {"go": "placed>accepted", "note": "付了钱，商家叮的一声接了单"},
    {"go": "accepted>exit", "note": "这一路，骑手又在忙什么？"}
   ]
  }
 ]
}
```

## 整片

| 字段 | 默认 | 说明 |
|---|---|---|
| `title` | 必填 | 片名，开场时显示在字幕条上 |
| `series` | `title` | 每张海报左上角的小字页眉 |
| `aspect` | `3:4` | 画幅，任意 `W:H`（`9:16`、`1:1`、`4:5`、`16:9`、`2.35:1`……），短边 1080。竖版的海报和画面同形；横版的海报是方的，镜头在上面滚动 |
| `size` | 无 | 直接给像素 `[宽, 高]`，优先于 `aspect` |
| `duration` | 有旁白时 2–3 分钟 | 目标时长：`150`（上下浮动 10%）、`[60, 90]`、`"1分钟"`、`"90秒"`。`check` 预估并提示加减几步；`plan` 差一点时每步最多多停 0.7 秒。无旁白的片子默认不设目标 |
| `voice` | `crayon-sister` | 旁白声音，见 voices.md；`"none"` 为无声 |
| `speed` | 有旁白 2，无旁白 3 | 每步动画速度（参考页默认 3） |
| `say` | 无 | 全片读法表 `{"写法": "读法"}`，例如 `{"42": "四十二"}`；字幕不变，只改读音 |
| `music` | 无 | `"calm"` / `"warm"` / `"curious"` / `"focused"` / `"tense"`，或 `{"mood": …, "gain_db": -2}` |
| `sfx` | `false` | `true`：卡片弹出时加一声轻“啵” |
| `watermark` | `制作：@leo_xiaolei/刘老板` | `null` 关掉 |
| `player` | `{}` | 播放细节：`{"settle": false}` 让换章时完全照参考页滚动，不先停到新海报顶上 |

## 一章

| 字段 | 说明 |
|---|---|
| `title` | 大标题，4–7 个字最好 |
| `sub` | 副标题，一句话 |
| `tagline` | 页眉最下面的红色小字，参考页在这里放越南语，我们放英文或拼音 |
| `states` | `{id: {label, tag, pin, at}}`：<br>`label` 卡片上的大字；<br>`tag` 卡片左上角的红色小字；<br>`pin` 图钉颜色（`pink` `straw` `orange` `green` `blue` `red` `violet` `teal` `grey`，或 `#rrggbb`）；<br>`at` 可选，`[列, 行]` 钉住位置，列以起点为 0、左负右正，行从 0 起 |
| `start` | 起点状态（画一个起点圆和一条短箭头）；整章都在“同时”框里时可以省略 |
| `edges` | `[{from, to, label, if, text}]`：<br>`to` 写 `end` 画终点圆；<br>`if` 是条件，显示成红色 `[条件]`；<br>`text` 直接给出箭头上的字，可以带 `\n` 换行；<br>`from` 和 `to` 相同就是自循环 |
| `regions` | 同时发生：`{"id": "both", "title": "同一时间", "lanes": [{"id", "title", "tint", "states": [...], "start"}]}`。<br>两条线并排画在一个大框里，中间是虚线；每条线有自己的起点圆。<br>箭头 `to` 写这个 `id` 就是进入框里（每条线回到起点）；从框里某个状态指向框外，就是离开整个框。<br>只有一条线时，就是一个带标题的父状态（例子：骑手的“在线接单”）。<br>`tint` 是底色：`sky` `rose` `mint` `straw` `lilac` |
| `rule` | 规则章：`{"never": "状态id", "stamp": "规则被打破"}`。检查器找出到达它的最短路径，存进 `rule.path`，用红线画出来 |
| `exit` | `{"from": "状态id", "label": "……↓"}`：一条从海报底边伸出去的箭头，接进下一章顶上（下一章第一步写 `"go": "entry"`） |
| `steps` | 见下 |

## 步骤

```json
{"go": "a>b", "note": "字幕兼旁白", "say": "可选的读法", "on": ["b"], "hold": 0.5}
```

- **`go`**：这一步画哪条箭头，可以是一条或一组：
  - `"start"`：起点；
  - `"entry"`：从上一章接进来；
  - `"a>b"`：一条箭头，同一对状态的第二条写 `"a>b#2"`；
  - `"a>exit"`：出口；
  - 一组：`["a>b", "b>c"]`，几颗圆点同时跑。

  已经画过的箭头再走一次，圆点会重跑一遍，箭头不会重画。
- **`note`**：字幕，同时是旁白，24 字以内。
- **`say`**：旁白和字幕不同的时候用，比如数字的读法，或者更口语的一句。
- **`on`**：这一步之后亮着的卡片。通常不用写：
  - 框外每次只亮一张，就是箭头指向的那张；
  - 框里每条线各亮一张。

  演示“另一条岔路”时可以手动指定。
- **`trace`**：`true` 时画规则章的红线，盖章跟在后面。
- **`focus`**：镜头要看的 y 坐标，一般不用。
- **`hold`**：这一步多停几秒。
- **没有 `go` 的步骤**只读一句话，画面停在当前状态，插画照样动。

卡片第一次亮起时弹出来；只是被一组箭头路过的卡片也会出现，但不变粉。没被任何一步点亮或路过的卡片不会出现，`layout` 会提醒。

## 自动排版

- **布局：**
  - 状态按最长路径分层，从上往下排；
  - 岔路分到左右两边，用肘形箭头从卡片底下分出去；
  - 只出去转一圈又回来的状态（比如“发送失败 → 点重试”）放在旁边；
  - 跨好几层的回路走外侧一条竖线；自循环画在右边。
- **起点**：图从页眉右侧开始（列中心约在 590），版面放不下就往下挪。
- **箭头上的字**：先试每段箭头的两侧，避开卡片、别的字、别的线和页眉。

`layout` 的 warning 会指出放不下的字。改法：缩短字，用 `text` 手动断行，给个别卡片加 `at`，或者拆章。

## 交付：`deliver`

`all` 渲染完会按 `"deliver"` 多出几样东西，也可以单独跑 `scv.py deliver JOB --what clips,gif`（不写 `--what` 就按 `deliver`，没有就全出）。都从同一次渲染来，要先跑过 `finalize`。

```json
{"deliver": ["clips", "longimage", "social", "gif", "html", "site"]}
```

| 名字 | 出什么 | 位置 |
|---|---|---|
| `clips` | 每章一条，按 `timing.json` 的章节边界切，带声音，头尾各 0.35 秒淡入淡出到纸色 | `outputs/clips/01-一份订单.mp4` |
| `longimage` | 全部海报竖着拼成一张长图，宽 1080；超过 7200 像素高就在海报之间分成几张 | `outputs/longimage/long.jpg` |
| `social` | 每张海报四种尺寸：1080 宽预览、x.com 用的 2048、小红书 1242×1660、Instagram 1080×1350。比例不合就用纸色补边，不拉伸 | `outputs/social/01-xhs.jpg` |
| `gif` | 每章一张循环动图，540 宽、每秒 8 帧，每章单独调色板；超过 10 MB 就换成 480 宽、64 色（GitHub 贴图的上限） | `outputs/gif/01-一份订单.gif` |
| `html` | 一个单文件网页：引擎、插画、数据、字体（只留用到的字）和声音都在里面，双击就能打开。能播放、拖动、调速、点步骤、逐步看 | `outputs/film.html` |
| `site` | 一个画廊网站文件夹：每章一节，有海报、“显示排版”、检查结果、这一章的 film.json 和 Mermaid、图片说明、图的文字版，还有图标和分享卡 | `outputs/site/index.html` |

`site` 的分享链接要写绝对地址时，渲染前设环境变量 `SCV_SITE_URL=https://…/`。

## AI 生成标识：`aigc`

按《人工智能生成合成内容标识办法》和 GB 45438-2025，成片、母版、每章切片、导出的音频、海报和交付的图片都在文件元数据里写一个 `AIGC` 字段（隐式标识）。位置按全国网安标委的实践指南：

| 文件 | 写在哪 |
|---|---|
| MP4、M4A | `moov.udta.meta`：`keys` 里是 `AIGC`，`ilst` 里是下面的 JSON |
| WAV | RIFF 里一个 ID 为 `AIGC` 的块 |
| PNG | `iTXt` 里的 XMP（`TC260:AIGC`），外加一个关键字为 `AIGC` 的 `tEXt` |
| JPEG、GIF | XMP（`TC260:AIGC`） |
| 网页 | `<meta name="AIGC">` |

```json
{"Label": "1", "ContentProducer": "sweety-statechart-video", "ProduceID": "…", "ReservedCode1": "…", "ContentPropagator": "", "PropagateID": "", "ReservedCode2": ""}
```

- `Label` 总是 `"1"`（AI 生成）。
- `ProduceID` 每部片不同：由 film.json、scenes.js 的内容哈希加渲染时间算出的 UUID。同一次渲染的所有文件用同一个。
- `ReservedCode1` 是 `ContentProducer` 和 `ProduceID` 的短哈希，用来核对。
- 要换成自己的：

```json
{"aigc": {"producer": "你的机构代码", "produce_id": "自己的编号", "propagator": "", "propagate_id": ""}}
```

只能用 ASCII 字符（标准附录 E 的要求），别的字符会被换成 `?`。查看：`python3 scripts/aigc.py read outputs/film.mp4`。原来的 `comment` 照旧保留。画面上的显式提示另见 `ai_label`。

## 发布包

`scv.py publish JOB`（`all` 最后也会跑）在 `outputs/publish/` 写：

- `titles.txt`：三个标题备选（片名加系列和集数、章节串起来的一句、一个问题）；
- `description.txt`：简介，有章节列表；`next` 写了就加“下一集”；
- `tags.txt`：话题，一行带 `#`，一行不带；
- `chapters.txt`：章节时间，B 站和 YouTube 的格式，从 `00:00` 开始；
- `cover.txt`：封面大字和小字；
- `alt.txt`：每张海报的长图片说明，给读屏软件和图文平台；
- `publish.md`：以上全部，加各平台的画幅、时长建议、标题字数上限，和图的文字版；`publish.json` 是同样的内容。

全部从 film.json 和 `timing.json` 生成，不联网，不调用模型。系列片写 `"episode": 3` 和 `"next": "下一集讲什么"`。

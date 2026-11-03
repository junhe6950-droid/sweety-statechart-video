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
| `cover_intro` | `true` | `finalize` 将 `outputs/cover.png` 合成进视频：展示 0.5 秒、渐隐到黑色 0.5 秒、再从头播放正片。片头静音；成片额外增加 1 秒，音频和交付字幕同步后移。设为 `false` 关闭；封面按比例完整适配画幅，不裁切。 |
| `voice` | `crayon-sister` | 旁白声音，见 voices.md；`"none"` 为无声 |
| `speed` | 有旁白 2，无旁白 3 | 每步动画速度（参考页默认 3） |
| `say` | 无 | 全片读法表 `{"写法": "读法"}`，例如 `{"42": "四十二"}`；字幕不变，只改读音 |
| `music` | 无 | `"calm"` / `"warm"` / `"curious"` / `"focused"` / `"tense"`，或 `{"mood": …, "gain_db": -2}`；加 `"sync": true` 让画面踩在音乐的拍子上，见下面“跟着音乐走” |
| `sfx` | `false` | `true`：卡片第一次弹出时加一声轻“啵”（有自己 `sfx` 的卡片用自己的声音）。别的音效见下面“声音和语言” |
| `language` | `zh` | 旁白和字幕的语言 |
| `i18n` | 无 | 其他语言的译文，见下面“声音和语言” |
| `watermark` | `制作：@leo_xiaolei/刘老板` | `null` 关掉 |
| `player` | `{}` | 播放细节：`{"settle": false}` 让换章时完全照参考页滚动，不先停到新海报顶上 |

`work/timing.json` 和 `work/timeline.json` 是正片的制作时间线。`outputs/editing/delivery-timing.json` 记录成片时长、片头长度和已平移的字幕步骤。重复合成始终从正片素材读取，不会重复加片头或累计字幕偏移。片头开启但封面缺失时，先运行 `scv.py posters JOB`。

## 一章

| 字段 | 说明 |
|---|---|
| `title` | 大标题，4–7 个字最好 |
| `sub` | 副标题，一句话 |
| `tagline` | 页眉最下面的红色小字，参考页在这里放越南语，我们放英文或拼音 |
| `states` | `{id: {label, tag, pin, at}}`：<br>`label` 卡片上的大字；<br>`tag` 卡片左上角的红色小字；<br>`pin` 图钉颜色（`pink` `straw` `orange` `green` `blue` `red` `violet` `teal` `grey`，或 `#rrggbb`）；<br>`at` 可选，`[列, 行]` 钉住位置，列以起点为 0、左负右正，行从 0 起 |
| `start` | 起点状态（画一个起点圆和一条短箭头）；整章都在“同时”框里时可以省略 |
| `edges` | `[{from, to, label, if, text, when, do}]`：<br>`to` 写 `end` 画终点圆；<br>`if` 是条件，显示成红色 `[条件]`；<br>`text` 直接给出箭头上的字，可以带 `\n` 换行；<br>`when` / `do` 是给检查器的逻辑，不显示；<br>`from` 和 `to` 相同就是自循环 |
| `regions` | 同时发生：`{"id": "both", "title": "同一时间", "lanes": [{"id", "title", "tint", "states": [...], "start"}]}`。<br>两条线并排画在一个大框里，中间是虚线；每条线有自己的起点圆。<br>箭头 `to` 写这个 `id` 就是进入框里（每条线回到起点）；从框里某个状态指向框外，就是离开整个框。<br>只有一条线时，就是一个带标题的父状态（例子：骑手的“在线接单”）。<br>`tint` 是底色：`sky` `rose` `mint` `straw` `lilac`。<br>`"history": true`：再进这个框时，每条线接着上次的位置 |
| `rule` | 规则章：`{"never": "状态id", "stamp": "规则被打破"}`。检查器找出到达它的最短路径，存进 `rule.path`，用红线画出来。修复见下面的 `rule.fix` |
| `rules` | 一章几条规则，每条标上守住或被打破，见下面“一章几条规则” |
| `vars` | 变量的初始值，给箭头的 `when` / `do` 用，见下面“守卫写成逻辑” |
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
- **`trace`**：`true` 时画规则章的红线，盖章跟在后面；写 `rules` 里某条规则的 `id`，就画那一条的红线。
- **`fix`**：`true` 时画出 `rule.fix` 的修复，见下面“先破后立”。
- **`focus`**：镜头要看的 y 坐标，一般不用。
- **`hold`**：这一步多停几秒。
- **没有 `go` 的步骤**只读一句话，画面停在当前状态，插画照样动。

卡片第一次亮起时弹出来；只是被一组箭头路过的卡片也会出现，但不变粉。没被任何一步点亮或路过的卡片不会出现，`layout` 会提醒。

## 守卫写成逻辑：`vars`、`when`、`do`

`if` 是给人看的字。想让检查器也懂这个条件，再写一个 `when`。画面上照样只显示 `if`。

```json
"vars": {"stock": 2, "closed": false},
"edges": [
 {"from": "open", "to": "sold", "label": "卖出一碗", "if": "还有面", "when": "stock > 0 && !closed", "do": {"stock": "stock - 1"}},
 {"from": "open", "to": "oversold", "label": "硬卖", "if": "没面了", "when": "stock < 0"}
]
```

- **`vars`**（一章）：变量和初始值。值只能是数字、`true` / `false` 或字符串。
- **`when`**（箭头）：条件成立时，这条箭头才能走。
- **`do`**（箭头）：走这条箭头时改变量，`{"变量": "表达式"}`。右边的式子都用走之前的值算。
- **表达式**能写：
  - 数字、`true` / `false`、`'字符串'`、变量名；
  - `+ - * / %`、`== != < <= > >=`、`&& || !`（也可以写 `and or not`）、括号。

  检查器用自己的小解析器读，不用 eval。
- **状态名也能当条件**：卡片 id、框的 id、线的 id 在表达式里表示“它现在亮着”。比如 `"when": "kready"`：后厨那条线停在“出餐口有餐”时，骑手才能取餐。
- `when` 里出现了既不在 `vars`、也不是状态的名字，这个条件就只当字看。检查器把这条箭头当作随时能走，`check` 会提醒。
- **检查器回答两个问题：**
  - **可能发生**：所有箭头都能走（没写逻辑时就是这样）；
  - **会发生**：按 `when` 和 `do` 真的走得到。

  `check` 会报出这几种情况：
  - 只在“可能”里走得到的卡片；
  - 永远走不了的箭头；
  - 规则只在“可能”里被打破。
- 变量一直在涨（比如每次 `+1`）时，检查器数到 20000 个组合就停，并说明结果不完整。给变量加个上限，比如 `"when": "tries < 3"`。

## 记住走到哪：`regions.history`

```json
"regions": {"id": "alarm", "history": true, "lanes": [...]}
```

离开这个框再回来（箭头 `to` 写框的 id），每条线回到离开时那张卡片，不从起点重来。不写就从起点重来。

## 先破后立：`rule.fix`

规则章先画红线、盖“规则被打破”，再加一道检查，确认那条坏路走不通了。

```json
"rule": {"never": "served", "stamp": "规则被打破",
         "fix": {"edge": "soggy>served", "if": "有人检查", "stamp": "修好了"}},
"steps": [
 ...,
 {"trace": true, "note": "检查器顺着红线，找到这条坏路"},
 {"fix": true, "note": "加一道出餐检查，就能堵上"}
]
```

- **`fix.edge`**：要堵的那条箭头（写法同 `go`）。
- **`fix.when`**（可选）：不写就当这条箭头被剪掉；写了就是给它加上这个条件。
- 检查器再跑一遍，结果写进 `rule.fixed = {"holds": true/false, ...}`：
  - `holds` 为 `true`：修好了，`check` 打印“the fix holds”；
  - `holds` 为 `false`：坏路还在，`check` 报 error，并给出剩下的那条路。
- **`{"fix": true}`**：这一步画出修复：
  - 守卫变成绿字；
  - 红线淡下去；
  - 盖一枚绿章（`fix.stamp`）。

  写了 `"fix": true` 却没有 `rule.fix`，`check` 报 error。

## 一章几条规则：`rules`

参考 /statechart 的报告：每张海报列出每条规则，标上守住了还是被打破。原来的 `rule` 照旧能用，相当于只有一条的清单。

```json
"rules": [
 {"id": "NoOversell", "never": "oversold", "text": "绝不超卖"},
 {"id": "StockOk", "always": "stock >= 0", "text": "库存不为负"},
 {"id": "NoDeadlock", "stuck": false, "text": "不会卡住"}
]
```

- **规则有三种写法**，每条写一种：
  - `never`：一个状态 id，或者一个不该成立的表达式；
  - `always`：一个应当一直成立的表达式；
  - `"stuck": false`：不会卡住。

  “卡住”的意思是：
  - 走到某个组合，一条能走的箭头都没有；
  - 本来就没有出口的单张卡片算结局，不算卡住。
- `text` 是图例上的一行字。`id` 给步骤引用。
- **`reported`**：另一个检查器（TLC）给的结论，`{"holds": false, "by": "TLC", "steps": 6, "path": [...]}`。
  - 只有 `reported`、没有规则写法的条目，照报告显示；
  - 两边结论不一样，`check` 会提醒。
- **一章的 `reported`**：另一个检查器的总数，`{"by": "TLC", "states": 36, "steps": 90}`。
- **`check` 的打印**像 TLC 的报告：
  - 查了多少个组合、多少步；
  - 每条规则 ✓ 守住或 ✗ 被打破；
  - 被打破的给出最短路径。
- **检查器写进页面的字段**（`scv.py` 自动加）：
  - `rules[i].result = {holds, path, edges, steps, values, possible, fixed}`；
  - 这一章的 `checked = {states, steps}`。
- **步骤 `trace`**：
  - `true`：画 `rule` 的红线；
  - 规则的 `id`（或从 1 数的序号）：画 `rules` 里那一条的红线。
- 每条规则也可以有自己的 `fix`，写法同上。

## 排版方向：`flow`

`"flow": "down"` 从上往下排；`"right"` 从左往右。横版（宽大于高）且没有“同一时间”框的片子默认 `"right"`，海报和画面同形，链太长时海报自动加宽。有框的章仍从上往下排。竖版的图太长、放不下时，海报会自动加高，镜头在章内滚动（`check` 会提醒拆章）。从 Mermaid 导入时，`direction LR` 会变成 `"right"`。

## 声音和语言

```json
"states": {"boil": {"label": "水开了", "sfx": "kettle", "ambience": "fire"}},
"steps": [{"go": "cold>boil", "note": "咕嘟咕嘟，水开了", "tone": "惊讶", "speaker": "grandma", "sfx": "steam"}]
```

**状态**

- **`sfx`**：这张卡片每次亮起时响一声，时间是圆点走到卡片的那一刻。可以写一个、一组（`["knock", "creak"]`），或者 `{"kind": "knock", "gain_db": -3}`。
- **`ambience`**：这张卡片亮着的时候一直响的环境声，换到别的卡片就淡出。前后两张卡片是同一种环境声时连着不断。

**步骤**

- **`tone`**：这一句的语气，比如 `"惊讶"`、`"语速很慢"`、`"温柔舒缓"`。短短几个字，不要带括号。效果和限制见 voices.md 的“语气”。
- **`speaker`**：这一句是谁在说（`cast` 里的名字）。画面上这个人的嘴跟着旁白动。
- **`sfx`**：这一步额外的声音，写法和状态的一样。`{"kind": "paper", "at": 0.3}` 的 `at` 是步内时间，和 scenes.js 里的 `S.t` 同一把尺子；不写就是 0.85（圆点走到卡片）。

规则章盖章时会自动“咚”一声，不用写。

**跟着音乐走**

`"music": {"mood": "curious", "sync": true}`：每一章在小节线上开始，盖章落在强拍上，音乐也跟着分段。做法借鉴了 Kevin Ngo 的 statechart-art（MIT）。

- 无旁白：每一步都在拍子上开始，每一章在小节线上，盖章落在强拍。会比不对齐长一点（实测 54 秒的片子长了 9 秒）。
- 有旁白：旁白的节奏不动。章节开头和盖章离下一个强拍不到 0.6 秒，就让画面多停一下；更远时让音乐等画面：前一小节的和弦多拖一会儿（延长记号），下一小节正好从这里开始。速度最多改 3%，用来少拖、少停。
- 音乐分段跟着章节走：第一章稀疏，后面几章饱满一些；每章从主和弦重新开始。盖章那一拍加一声轻钹和一个更满的和弦。
- `mix-report.json` 的 `music.sync` 列出每个对齐点离强拍差多少毫秒（`error_ms`），以及画面停了多久、音乐拖了多久。超过 60 毫秒会有 warning。

**音效**（都是程序合成的，没有录音素材）：

| 名字 | 声音 | 名字 | 声音 |
|---|---|---|---|
| `pop` | 卡片弹出的轻“啵” | `knock` | 敲门三下 |
| `paper` | 翻纸 | `creak` | 门吱呀一声 |
| `tick` | 钟表一声 | `bell` | 自行车铃两声 |
| `chime` | 两声小铃 | `ding` | 手机“叮” |
| `steam` | 水汽嘶嘶变响 | `typing` | 敲一串键盘 |
| `kettle` | 水开：嘶声，再响起哨音 | `coins` | 几枚硬币落在台面上 |
| `fire` | 划火柴、火苗噼啪 | `stamp` | 盖章“咚” |
| `whoosh` | 呼的一下掠过 | | |

**环境声**：`rain` 雨，`fire` 炉火，`street` 街上（远处车流），`room` 屋里的底噪。

音效和环境声都放在旁白下面：有旁白时自动压低 6 dB，整片响度目标不变。`mix-report.json` 里有每一声的时间和电平，`voice_over_bed_db` 是每句旁白比音乐 + 环境声 + 音效高多少，低于 6 dB 判失败。

**其他语言**

`i18n` 放译文，一种语言一块：

```json
"i18n": {"en": {
  "title": "A Message's Journey", "series": "Little Things in Your Phone",
  "chapters": [{
    "title": "Sending", "sub": "from typing to read",
    "states": {"typing": {"label": "Typing"}},
    "edges": {"typing>sending": {"label": "tap send"}, "sending>failed": {"label": "keeps spinning", "if": "no signal"}},
    "exit": {"label": "who delivers it? ↓"},
    "steps": [{"note": "You've typed a message. Still typing."}, {"note": "Tap send, and the little circle spins."}]
  }]
}}
```

- 章节和步骤按顺序对应；状态按 id，箭头按 `from>to`（同一对的第二条写 `a>b#2`，或者箭头自己的 `id`）。
- 还可以译：`rule.stamp`、`exit.label`、`regions.title` 和 `regions.lanes[].title`，整片的 `voice`、`say` 等字段。
- 中文的 `say` 读法不会带过去；英文里有数字时，在这一块里另写 `say`，比如 `{"3": "three"}`。
- 没译到的字照旧显示中文，`scv.py check JOB --lang en` 会列出来。

`scv.py all JOB --lang en` 在 `JOB/lang/en/` 生成英文版（译好的 film.json，加一份 scenes.js），然后照常跑一遍。每个命令都能加 `--lang`。

- 插画里的字写在 scenes.js 里，不会自动翻译。要换语言就在 scenes.js 里判断：`const EN = FILM.language === 'en';`，再按 `EN` 选字。
- 拉丁字母的字幕上限是 42 个字符（中文是 24 个字）。

## 自动排版

- **布局：**
  - 状态按最长路径分层，从上往下排；
  - 岔路分到左右两边，用肘形箭头从卡片底下分出去；
  - 只出去转一圈又回来的状态（比如“发送失败 → 点重试”）放在旁边；
  - 跨好几层的回路走外侧一条竖线；自循环画在右边。
- **起点**：图从页眉右侧开始（列中心约在 590），版面放不下就往下挪。
- **箭头上的字**：先试每段箭头的两侧，避开卡片、别的字、别的线和页眉。

`layout` 的 warning 会指出放不下的字。改法：缩短字，用 `text` 手动断行，给个别卡片加 `at`，或者拆章。

## 校验

- 字段的完整定义在 [film.schema.json](film.schema.json)（JSON Schema 2020-12）：
  - 编辑器和 Agent 写 `film.json` 时就能校验；
  - 支持约束输出的模型也能直接用。
- 装了 `jsonschema` 包时，`check` 会顺带按它校验，问题列在 warning 里，前面带 `schema:`。没装就跳过。
- 现成的状态机（XState、Mermaid、SCXML、PlantUML、/statechart 的输出）可以直接导入，见 [导入与导出](import-export.md)。

# 场景（scenes.js）

参考页的插画占海报一半以上。它们是大块的彩色蜡笔画，而且一直在动：火在跳，人在干活，扇子按步骤展开，天会下雨。我们的海报也要这样：每块空地都用上，每个状态都有一组插画，跟着状态动。

## 写法

```js
SCENES[1] = {                    // 第 1 章
  bg($) {                        // 静态部分：画进底图（3 张抖动版本轮换），不能用时间
    $.counter(20, 370, 900, 70, { sign: '后 厨' });
  },
  fg($, S) {                     // 每帧都画：随时间和状态变化
    const cooking = S.on('cooking');
    $.who('cook', 'stand', 95, 958, .78, 1, { t: S.T, arms: cooking ? 'toss' : 'stir' });
    $.wok(252, 830, .78, S.T, { toss: cooking });
  },
};
```

### 坐标

- 海报宽 1000，高 `1000 × 画幅高/宽`（3:4 是 1333）。
- 先跑 `scv.py layout JOB`，看 `work/layout/chN.png`：上面有网格，绿色虚线框出空地。卡片坐标在 `chN.json`，也可以在 `fg` 里用 `$.box('id')` 取 `{x, y, w}`。
- 底部约 100 单位在镜头停在海报顶部时会被字幕条盖住，那里放地面、草、路这类次要的东西。
- 画的顺序就是叠放的顺序：先画后面的，后画前面的。比如人站在柜台后面，就先画人，再画柜台。

### 状态（`fg` 的 `S`）

| 字段 | 含义 |
|---|---|
| `S.T` | 片子时间（秒），给一直在动的东西用：火、云、轮子 |
| `S.step` | 本章当前第几步（从 0 起）；还没到本章是 -1，本章讲完后是最后一步 |
| `S.t` | 这一步开始后过了多久（动画时间，速度 2 时 1 单位等于 0.5 秒）。约 0.85 时卡片弹出，1.0 时圆点到站 |
| `S.on(id)` | 这张卡片现在是否亮着 |
| `S.since(id)` | 它这次亮起后过了多久：本步亮起的给 `S.t`，更早亮起的给 99，没亮着给 -1 |
| `S.at(k)` | 第 k 步开始后过了多久（之前是 -1，之后是 99） |
| `S.done` | 本章已经讲完 |

常用写法：

- `S.on('x') ? 动 : 静`：只在那个状态时动；
- `Math.min(1, (S.since('x') - .5) / 1.2)`：从 0 到 1 的进度（门打开、东西飞过去）；
- `S.step >= 4`：某一步之后才出现。

## 画笔

所有函数都已经绑定到这张海报：

- **`$.line(pts, {color, w, closed, progress})`**：蜡笔线，两遍描，带抖动。
- **`$.shape(pts, {fill, h: {gap, angle, base, layers}, stroke, w})`**：先排线填色，再描边。
  - `h.layers` 可以叠几层不同颜色、不同角度的排线，参考页的立体感就从这里来；
  - `stroke: null` 不描边；
  - `radial: [x, y]` 改成从一点放射的排线（扇子、斗笠、火苗）。
- **`$.hatch(pts, opts)`**：只排线，不描边。
- **`$.dot(x, y, r, fill)`**：圆点。
- **`$.blob(x, y, r, color, alpha)`**：没有边的软圆，用在腮红、光晕、灰尘。
- **`$.scribble(x, y, w, h, color)`**：乱涂。
- **`$.text(s, x, y, {font, align, color, double})`**：打字机字。
- **`$.words(s, x, y, {size, align})`**：斜体字，`[条件]` 自动变红。
- **几何**：`$.ell` `$.rect` `$.bez` `$.qbez` `$.smooth` `$.capsule` `$.turn` `$.move` `$.along(折线, 0..1)`。
- **随机**：`$.seed('名字')` 和 `$.rnd(a, b)`，同名同结果，只在抖动帧之间变化。

颜色名可以用在任何 `color` / `fill` / `pin` 里：`ink` `navy` `pink` `red` `rose` `straw` `ochre` `orange` `flame` `yolk` `green` `greenD` `leaf` `blue` `blueL` `sky` `lilac` `violet` `cream` `peach` `teal` `mint` `skin` `white` `grey` `tan` `brown`。也可以写 `#rrggbb`。

## 人物

```js
$.who('rider', 'stand', x, 地面y, 0.8, 1, { t: S.T, arms: 'phone' })   // 套装 + 姿势，返回关节坐标
$.person($.pose.sit(x, 座面y, .8, 1, { t: S.T, arms: 'type', floor: 地面y }), { ...$.K.outfits.coder, glasses: true })
```

- **姿势** `$.pose.*`（参数都是 x、地面或座面 y、大小 s、朝向 f，1 朝右、-1 朝左）：
  - `stand`：站；
  - `walk`、`run`：走、跑，`t` 让腿动起来；
  - `sit`：坐，y 是座面，`floor` 是地面；
  - `bend`：弯腰；
  - `ride`：骑车，y 是座面，`bars` 是车把位置。
- **手臂** `arms`：`hold` 端着、`carry` 抱着、`up` 举手、`wave` 招手（会动）、`point` 指、`phone` 看手机、`hips` 叉腰、`type` 打字（会动）、`stir` 搅拌（会动）、`toss` 颠勺（会动）、`reach` 伸手（配 `reach: [x, y]`）、`swing` 摆臂。
- **套装** `$.K.outfits.*`：`rider` 骑手（黄衣黄盔）、`chef` / `cook` 厨师、`cashier` 收银、`customer` 顾客、`student` 学生、`office` 上班族、`coder` 程序员、`grandma` / `grandpa` 爷爷奶奶、`farmer` 斗笠农人、`kid` 小孩、`doctor` 医生、`courier` 快递员。
- **单项**：
  - 衣服 `shirt`：颜色名，或 `floral` 碎花、`stripes` 竖条、`hstripes` 横条、`plaid` 格子、`dots` 波点，花色的颜色写在 `shirtColor`；
  - 下装 `pants`，`skirt` 换成裙子；
  - 帽子 `hat`：`conical` 斗笠、`cap` 鸭舌帽、`helmet` 头盔、`chef` 厨师帽、`beanie` 毛线帽、`headband` 头带；帽子颜色写在 `hatColor`；
  - 头发 `hair`：`bun` 发髻、`short` 短发、`ponytail` 马尾、`long` 长发、`bald` 光头；
  - 其他：`glasses` 眼镜、`mask` 口罩、`gloves` 手套、`apron` 围裙、`vest` 反光条、`beard` 胡子、`logo` 胸前字、`sad` 难过、`talk: S.T` 说话（嘴会动）、`t: S.T` 眨眼。
- **大小**：0.8 倍的人约 200 单位高。站在同一条地面线上的人和物，y 要相同。

## 道具

带 `t` 的都会动（传 `S.T`）。x、y 一般是底边中点，`s` 是大小。

- **天气和自然**
  - `sun(x, y, r, t)` 光芒会转；`moon(x, y, r, t, 星星数)` 星星会闪；`star`；`sparkle`
  - `cloud(x, y, w, h, {fill, hatch})`；`rain(x, y, w, h, t)`；`snow(...)`；`wind(x, y, w, t)`
  - `tree(x, y, s, t)` 会摇；`bush`；`grass(x0, x1, y, t)`；`flowerPot(x, y, s, t, 颜色)`
  - `ground(x0, x1, y, n, key)` 地面短线
- **火、气、光**
  - `fire(x, y, w, t)`；`flame`
  - `steam(x, y, t, k, 长度)` 一缕蒸汽；`puff(x, y, w, t)` 一团烟
  - `bulb(x, y, s, t, on)` 发光灯泡；`lamp(x, y, 高, s, t, on)` 路灯，开着时有光柱
- **厨房和吃的**
  - `stove(x, y, w, t, on)` 灶，会出火；`wok(x, 锅沿y, s, t, {toss})` 会颠；`pot(cx, 口y, 半径, 高, {liquid, lid, handles, bubbles, t})`
  - `bowl(x, y, s, {food: noodles|rice|soup, soggy, t})` 有蒸汽；`cup(x, y, s, {t, straw})`；`plate`；`chopsticks`
  - `jar(x, y, s, {label, fill, empty})` 带标签的罐子，例如“售罄”
- **家具和房子**
  - `table(x, 桌面y, w, h)`；`chair`；`stool(x, 座面y, w, h, 颜色)`；`bench`
  - `counter(x0, x1, 台面y, h, {sign})` 柜台；`shelf(x, 底y, w, 层数)` 货架
  - `door(左x, 地面y, w, h, 开合0..1, {number})`
  - `house(x, y, w, h)`；`building(x, y, w, h, {sign, night, t})` 夜里窗户闪；`shopFront(x, y, w, h, {sign, awning, open})` 条纹雨棚店面
  - `sign(左x, 顶y, w, h, 文字, {size, color, ink, post, hang})` 牌子，可换行
  - `lantern(x, y, s, t)` 会晃；`umbrella`；`flag(x, y, s, t)` 会飘
- **街道和车**
  - `road(x0, x1, y, t, {speed})` 路面虚线会走
  - `scooter(x, y, s, f, {t, moving, logo})` 外卖电动车，轮子会转；`car`；`bike`
  - `trafficLight(x, y, s, 'red'|'yellow'|'green')`
- **设备和消息**
  - `phone(x, y, s, {screen, text, t, ring, badge, pop})`：`screen` 可选 `chat` `map`（小点沿路线走）`order` `pay` `call` `text` `blank`；`ring` 响铃时抖动出波纹
  - `laptop(x, y, s, {t, typing})`；`server(x, y, s, {t, busy, units})` 机柜灯闪
  - `tower(x, y, s, t, on)` 信号塔，开着时信号波往外扩；`wifi(x, y, s, t, 格数)`；`signal`
  - `printer(x, 台面y, s, t, {printing: 0..1, text})` 小票打出来；`receipt`
  - `envelope(x, y, s, {open, stamp, heart})`；`paperPlane(x, y, s, 角度)`
  - `bubble(尾巴x, 尾巴y, 文字, {side, size, pop, chars})` 聊天气泡；`think(x, y, 文字, {pop})` 想法云
  - `mark(x, y, '!'|'?', {pop, color})` 头顶的感叹号、问号
- **时间和钱**
  - `clock(x, y, r, t, {hour, minute, speed})` 指针会走；`alarm(x, y, s, t, ringing)` 闹钟，响时抖；`calendar`
  - `coin(x, y, r, t)` 会转
- **其他**
  - `magnifier(x, y, r)`；`gear(x, y, r, t)` 会转；`conveyor(x0, x1, y, t)` 传送带，箱子会走
  - `box(左x, 底y, w, h, {label})`；`bag(x, y, s, {logo, seal})` 外卖袋；`basket`；`bucket`；`sack`；`crate`
  - `heart`；`check(x, y, s, 颜色, 进度)`；`cross`
  - 动物：`cat(x, y, s, t)` 甩尾巴、眨眼；`dog` 摇尾巴；`bird` 扇翅膀

没有的东西就在 `scenes.js` 里用画笔现画（例子：`examples/message/scenes.js` 里的蜗牛）。用得多的再加进 `engine/crayon/props.js`。

## 摆放规矩

- **用满空地。** 参考页三张海报，每张都有三四个大场景，占满底部和两侧，顶上再加太阳、云、钟。
- **跟着状态动。** 状态亮起时，它的插画要有一个明显的变化：开火、门开、车动、气泡弹出、东西飞过去。别的时候保持轻微的持续动作，比如蒸汽、眨眼、尾巴、灯。
- **同一个人每章穿同一套衣服**（骑手一直是黄衣黄盔）。
- **不压图。** 插画避开卡片、箭头和字；`layout` 图上的绿框就是安全区。
- **改完就看。** 每改一轮跑一次 `layout` 看海报；动起来的效果用 `stills` 看，或者渲一小段：`scv.py render JOB --start 10 --end 16`。

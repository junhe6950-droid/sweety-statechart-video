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
- **手臂** `arms`：
  - `hold` 端着、`carry` 抱着、`up` 举手、`wave` 招手（会动）、`phone` 看手机、`hips` 叉腰、`swing` 摆臂；
  - `type` 打字、`stir` 搅拌、`toss` 颠勺（都会动）；
  - `reach` 伸手，配 `reach: [x, y]`，手够不到时停在最远处；
  - `point` 指，配 `target: [x, y]` 就指向那一点（比如指着当前的卡片 `$.box('id')`）；
  - `give` 递东西、`shrug` 耸肩、`cheer` 欢呼、`clap` 拍手（都会动）、`sleep` 睡着（头会垂下来）、`stomp` 跺脚（脚会抬）。
- **体型** `build`：`kid` 小孩、`teen` 少年、`adult` 成人、`elder` 老人（微驼），再加 `slim` 瘦、`stout` 壮（有肚子），可以组合，比如 `'elder stout'`。小孩头大腿短，不用自己算比例。
  - `chibi`：Q 版小人，大圆头约占三分之一身高，正面朝前，点眼睛、腮红，配发髻或鸭舌帽。所有手臂动作都能用。
- **表情** `face`：`neutral` 平常、`happy` 开心、`surprised` 惊讶、`worried` 着急（冒汗）、`sleepy` 困（飘 z）、`angry` 生气、`proud` 得意（闪一下）。可以按步骤换：规则被打破时 `face: 'surprised'`。
- **嘴** `mouth`：0..1，张多大；给了它就不用 `talk`。旁白的音量可以直接接到这里。
- **笔触** `look: 'pencil'`：细深色轮廓、淡彩填色，像铅笔加水彩。主题是铅笔时自动用它，不用每个人都写。
- **套装** `$.K.outfits.*`：
  - 原有：`rider` 骑手（黄衣黄盔）、`chef` / `cook` 厨师、`cashier` 收银、`customer` 顾客、`student` 学生、`office` 上班族、`coder` 程序员、`grandma` / `grandpa` 爷爷奶奶、`farmer` 斗笠农人、`kid` 小孩、`doctor` 医生、`courier` 快递员；
  - 新增：`schoolkid` / `pupil` 小学生（背书包）、`teen` 少年、`elder` 拄拐老人、`nurse` 护士、`teacher` 老师、`worker` 工人（安全帽）、`engineer` 工程师、`clerk` 职员（领带）、`boss` 老板（壮）、`patient` 病人、`artist` 画家（贝雷帽）、`porter` 搬运工、`barista` / `boba` 奶茶店员（Q 版）、`chibi` Q 版路人。
  - `$.who` 的第一个参数也可以直接给一个对象：`$.who({ ...$.K.outfits.office, build: 'stout' }, 'stand', ...)`。
- **单项**：
  - 衣服 `shirt`：颜色名，或 `floral` 碎花、`stripes` 竖条、`hstripes` 横条、`plaid` 格子、`dots` 波点，花色的颜色写在 `shirtColor`；
  - 下装 `pants`，`skirt` 换成裙子；
  - 帽子 `hat`：`conical` 斗笠、`cap` 鸭舌帽、`helmet` 头盔、`chef` 厨师帽、`beanie` 毛线帽、`headband` 头带、`hardhat` 安全帽、`beret` 贝雷帽、`bandana` 头巾、`sunhat` 草帽、`nurse` 护士帽、`grad` 学士帽；帽子颜色写在 `hatColor`；
  - 头发 `hair`：`bun` 发髻、`short` 短发、`ponytail` 马尾、`long` 长发、`bald` 光头、`bob` 齐耳、`curly` 卷发、`afro` 爆炸头、`spiky` 刺头、`pigtails` 双马尾、`buzz` 寸头、`side` 侧分；
  - 配饰：`backpack` 背包、`bag` 斜挎包、`scarf` 围巾、`tie` 领带、`badge` 工牌（可写两个字）、`cane` 拐杖，值是颜色名或 `true`；
  - 其他：`glasses` 眼镜、`mask` 口罩、`gloves` 手套、`apron` 围裙、`vest` 反光条、`beard` 胡子、`logo` 胸前字、`sad` 难过、`talk: S.T` 说话（嘴会动）、`t: S.T` 眨眼。
- **大小**：0.8 倍的人约 200 单位高。站在同一条地面线上的人和物，y 要相同。
- **主角**：每张海报可以有一个 1.2–1.5 倍的主角，线条会自动加粗一点。别的人保持 0.7–0.9。
- `$.who` 和 `$.person` 返回画好的关节，`haF` 是近手、`head` 是头，用来挂手机、气泡、问号。

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
  - `kettle(x, y, s, {t, boiling})` 烧水壶，开了时冒大汽、壶盖跳；`teapot(x, y, s, {t})` 茶壶；`teacup(x, y, s, {t, steep: 0..1})` 玻璃茶杯，茶色随 steep 变深、茶叶漂
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

- **交通**：`train(x, 轨道y, s, t, {cars, moving})`；`plane(x, y, s, t)`；`truck(x, y, s, f, {t, moving, label})`；`ship(x, 水线y, s, t)`；`subwayGate(x, y, s, t, {open: 0..1})` 闸机
- **钱**：`bankCard(x, y, s, {tilt})`；`atm(x, y, s, t, {cash: 0..1})` 吐钱；`ledger(x, 桌面y, s)` 账本；`contract(x, 顶y, s, {signed: 0..1, seal})` 合同，签名会写出来；`seal(x, y, s, {text})` 印章；`coins(x, y, s, {n})` 一小堆硬币
- **医疗**：`bed(x, y, s, {blanket, drip, t})` 病床，可挂吊瓶；`medicine(x, y, s, {label, pills})`；`stethoscope(x, y, s)`；`queueScreen(x, y, s, {num, t, blink})` 叫号屏
- **学校**：`desk(x, y, s, {paper, books})` 课桌；`examPaper(x, 顶y, s, {score})` 试卷；`schoolbag(x, y, s)`；`blackboard(左x, 顶y, w, h, {text, chalk: 0..1})` 粉笔字一笔笔写出来
- **农活和手艺**：`field(x0, x1, y, t, {rows, ripe})` 稻田；`rice(x, y, s, t, {ripe})` 稻穗；`bambooBasket(x, y, s, {fill})` 竹筐；`loom(x, y, s, t, {progress})` 织机；`kiln(x, y, s, t, {fire})` 窑
- **工厂**：`robotArm(x, y, s, t)` 机械臂；`forklift(x, y, s, f, {t, lift: 0..1, load})` 叉车；`rack(左x, 底y, w, h, {levels, boxes})` 仓库货架
- **科技**：`robot(x, y, s, t, {wave})` 机器人；`chip(x, y, s, {t, label})` 芯片，引脚上有光点走；`keyboard(x, 桌面y, s, {t, typing})` 键盘会亮
- **奶茶店**：`bubbleTea(x, y, s, {tea, tiger, level})` 珍珠奶茶；`shaker(x, y, s, {shake, t})` 摇杯；`register(x, 台面y, s, {price, open})` 收银机带价签；`bell(x, y, s, {ring, t})` 服务铃；`pager(x, y, s, {buzz, num, t})` 取餐器；`pearlPot(x, y, s, {low, t})` 炉上煮珍珠；`menuBoard(左x, 顶y, w, h, {title, items})` 菜单板；`pearlJar` / `soldOutJar` 珍珠罐、售罄罐；`hourglass(x, y, s, t, {p})` 沙漏；`ladybug(x, y, s, t)` 瓢虫
- **科学**：`cell(x, y, r, {p, t})` 细胞，`p` 从 0 到 1 一分为二；`dna(x, 顶y, h, {t})` 会转；`chromosome(x, y, s, {split})` 染色体，`split` 拉开；`microscope(x, 桌面y, s)`；`slide(x, y, s)` 玻片；`petriDish(x, y, r, {p})` 培养皿，菌落随 `p` 长多
- **航天**：`rocket(x, 底y, s, {t, fire, sep: 0..1})` 火箭，`sep` 时助推器脱落；`launchTower(x, y, s, {arms: 0..1})` 发射塔，摆臂收回
- **人群**：`queue(x, y, n, {s, f, t})` 排成一列的 n 个人，衣服、体型、表情都不一样；`ring(x, y, n, {r, s, t})` 围观的半圈人，都朝着中间
- **铺满一片**：`repeat(画法, 区域, 选项)`，见下一节。

### `$.repeat`：铺图案

参考页里一排排的香签，本身就是图案。用它铺一排碗、一片稻田、一群鸟：

```js
$.repeat((x, y, i, k) => $.bowl(x, y, .5 * k.s, { food: i % 2 ? 'rice' : 'noodles' }), { x0: 40, y0: 980, x1: 400, y1: 1100 }, { cols: 5, rows: 2, jitter: .3 });
$.repeat('rice', { x0: 0, y0: 1150, x1: 500, y1: 1300 }, { cols: 9, rows: 3, stagger: true, args: [S.T] });
$.repeat((x, y, i, k) => $.bird(x, y, .7 * k.s, S.T + i), { x0: 600, y0: 60, x1: 980, y1: 200 }, { n: 6, drift: 30, t: S.T });   // 一群鸟往右飞
```

- 画法是一个函数 `(x, y, i, k)`，`k.s` 是带一点随机的大小；也可以直接写道具名，按 `道具(x, y, s, ...args)` 调用。
- 排法：`cols` / `rows` 网格（`stagger` 错开），`rows: 1` 一排，`n` 随便撒；`jitter` 抖动 0..1，`sj` 大小抖动，`drift` + `t` 让一群东西往一边漂。
- 同一个区域、同一个 `seed`，每次都一样。从后往前画，近的压住远的。

没有的东西就在 `scenes.js` 里用画笔现画（例子：`examples/message/scenes.js` 里的蜗牛）。用得多的再加进 `engine/crayon/props.js`。

## 场景件（`$.set`）

一次画好一整组场景：互相挨着的家具和人、一条共同的地面、前中后三层、大块的颜色。弱一点的模型也能直接画出“满而有分量”的海报。

```js
fg($, S) {
  const A = { x0: 0, y0: 760, x1: 560, y1: 1333 };                 // 一块空地，从 layout 的 chN.json 里抄
  const p = Math.min(1, Math.max(0, (S.since('cooking') - .5) / 1.2));   // 进行到哪了，0..1
  $.set('kitchen', A, { mode: S.on('cooking') ? 'toss' : 'fire', t: S.T, p });
}
```

| 场景件 | 模式 `mode` | 画了什么 |
|---|---|---|
| `kitchen` 后厨 | `fire` 开火、`toss` 颠勺、`serve` 出餐 | 灶台、炒锅、汤锅、厨师和帮厨、出餐口的碗、铃 |
| `street` 街道 | `day`、`night`、`rain`、`jam` 堵车（可以组合：`['night', 'rain']`） | 一排店铺楼、人行道、路灯、两条车道、红绿灯、行人 |
| `doorway` 门口 | `knock` 敲门、`open` 开门、`handover` 交接 | 楼道、绿墙裙、楼梯、门和门牌、快递员、开门的人 |
| `desk` 办公桌 | `typing` 打字、`meeting` 开会、`overtime` 加班 | 白板、窗外、长桌和屏幕、同事；加班时窗外天黑、台灯亮 |
| `counter` 柜台 | `queue` 排队、`pay` 付款、`change` 找零 | 货架、价目牌、收银台、收银员、排队的人 |
| `servers` 机房 | `ok`、`overload` 过载、`down` 宕机 | 一排机柜、线槽、工程师和推车；过载冒热气，宕机冒烟 |
| `clinic` 医院 | `register` 挂号、`wait` 候诊、`call` 叫号 | 叫号屏、挂号窗口、护士、长椅上的病人 |
| `classroom` 教室 | `teach` 讲课、`ask` 提问、`exam` 考试 | 黑板（粉笔字会写出来）、老师、两排学生和课桌 |
| `boba` 奶茶店 | `order` 点单、`make` 摇茶、`call` 叫号 | 菜单板、煮珍珠的锅、柜台、Q 版店员和排队的人 |

第三个参数可以只写模式名（`'toss'`），也可以写一个对象：

| 字段 | 含义 |
|---|---|
| `mode` | 模式，或几个模式的数组 |
| `t` | 片子时间 `S.T`，让火、蒸汽、车、灯动起来 |
| `p` | 0..1，这个模式进行到哪了：门开多大、硬币飞到哪、粉笔写到哪 |
| `flip` | 左右翻过来，主角换到另一边 |
| `scale` | 在自动大小上再放大缩小 |
| `cast` | 换人：`{ hero: 'rider' }`，或 `{ hero: { ...$.K.outfits.chef, build: 'stout' } }`，各场景件的主角都叫 `hero` |
| `sign` | 招牌上的字（后厨、门牌号、价目、收费处） |
| `part` | 见下面的“静态和动态” |
| `bleed` | 默认 `true`：空地挨着海报边时，墙、地、车会画出边去 |

- **大小自动算**：按空地的宽高缩放，地面贴着空地底边；空地很宽时东西会散开、人会多一些，很窄时会挤一点、少一个人。最舒服的空地大约 450–600 宽、350–450 高。
- **返回值**：`{ ground, s, at }`。`ground` 是地面 y，`at.hero` 是主角的关节，`at.pass`、`at.till`、`at.board` 这类是场景里的要点，用来接箭头、气泡、问号。
- **静态和动态**：后层（墙、架子、远处的人）和前层（柜台、桌子）不动，中层（人、火、屏幕）和顶层（蒸汽、火花、问号）每帧画。
  - 只在 `fg` 里调一次就行：不动的两层会按模式和抖动帧各存一张图，之后每帧只贴图，画的只有动的那部分（一组大约 3–9 毫秒）。
  - 想把后层画进底图，就在 `bg` 里写 `$.set(名字, A, { part: 'bg' })`，`fg` 里写 `{ part: 'fg', mode, t }`。这时后层不能随模式变（比如街道的白天黑夜）。
- **看全部**：`scv.py gallery` 把每个场景件的每个模式画成一张图，另附道具和人物的总表。

## 构图

- **一张海报一个主场景。** 最大的那块空地放一个场景件，占海报的四分之一到三分之一。别的空地放两三样跟故事有关的小东西，顶上放天气。
- **共用地面。** 同一块空地里的人和物站在同一条地面线上；场景件自带地面和地板，别再另画一条。
- **出血。** 挨着海报边的场景，让墙、地、车画出边去，像参考页里的竹堆。别在海报边上留一圈空。
- **大小分级。** 主角 1.2–1.5 倍，配角 0.8 倍，远处的人和物再小一点、淡一点。不要所有人一样大。
- **远淡近浓。** 远处用细线、浅色、稀排线，近处用粗线、深色、密排线。新的道具和场景件已经这样分好：外轮廓 3.2、内部结构 2、细节 1.2。
- **颜色成块。** 一面墙、一个柜台、一片天，是大块的颜色；小东西是点缀。整张海报别全是小色块。

## 草稿（`scv.py draft`）

先排版，再起草：

```
scv.py layout JOB
scv.py draft JOB            # 写 scenes.draft.js
scv.py draft JOB --write    # scenes.js 还是新建时的样子，就直接写进去
```

- 它读 `film.json` 里的标题、状态名、箭头上的字和字幕，按中英文关键词选场景件（“后厨、出餐”→ `kitchen`，“宕机、服务器”→ `servers`）；
- 每个状态按自己的字选一个模式，状态亮起时场景件就切过去；
- 最大的空地放场景件，太高的空地上半截再放一个；其他空地放对得上的道具，对不上就放花盆、路灯、树、钟这类填充，注释里写明是哪个词选中的。
- 草稿只是起点：看一眼 `layout`，再换掉填充的东西、加上故事里的细节、统一人物。

## 摆放规矩

- **用满空地。** 参考页三张海报，每张都有三四个大场景，占满底部和两侧，顶上再加太阳、云、钟。
- **跟着状态动。** 状态亮起时，它的插画要有一个明显的变化：开火、门开、车动、气泡弹出、东西飞过去。别的时候保持轻微的持续动作，比如蒸汽、眨眼、尾巴、灯。
- **同一个人每章穿同一套衣服**（骑手一直是黄衣黄盔）。
- **不压图。** 插画避开卡片、箭头和字；`layout` 图上的绿框就是安全区。
- **改完就看。** 每改一轮跑一次 `layout` 看海报；动起来的效果用 `stills` 看，或者渲一小段：`scv.py render JOB --start 10 --end 16`。

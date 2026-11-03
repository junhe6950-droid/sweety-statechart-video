#!/usr/bin/env python3
"""Draft scenes.js from the layout: read each chapter's free areas (work/layout/chN.json) and the words in film.json
(titles, state labels and tags, arrow words, captions), pick a set piece for the biggest area and props for the rest,
switch the set piece's mode with the states, and write JOB/scenes.draft.js. A weaker model starts from a full poster
and refines it; a stronger one reads the notes and rewrites what it likes.

usage: scene_draft.py JOB [--write]        (or: scv.py draft JOB [--write])
  --write   also write scenes.js, but only while it is still the `scv.py new` skeleton (or missing)
Runs `scv.py layout JOB` first when the layout is missing.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# set piece -> (words that point to it, {mode: words})
SETS = {
    'kitchen': (['厨', '炒', '锅', '灶', '做饭', '出餐', '开火', '菜', '面', '饭', '餐厅', 'cook', 'kitchen', 'chef', 'fry', 'meal', 'dish', 'noodle', 'restaurant'],
                {'fire': ['开火', '生火', '火', '煮', '做', 'fire', 'cook', 'boil'], 'toss': ['炒', '颠', '翻', '出餐中', 'toss', 'fry', 'stir'], 'serve': ['出餐', '好了', '上菜', '打包', '取餐', 'serve', 'ready', 'pack', 'plate']}),
    'street': (['路', '街', '车', '堵', '骑', '配送', '交通', '下雨', '出门', '通勤', 'street', 'road', 'traffic', 'ride', 'drive', 'car', 'commute', 'city'],
               {'day': ['白天', '早', '出发', 'day', 'morning', 'go'], 'night': ['夜', '晚', '下班', 'night', 'dark', 'evening'], 'rain': ['雨', '湿', 'rain', 'storm', 'wet'], 'jam': ['堵', '慢', '红灯', '等', 'jam', 'traffic', 'stuck', 'late', 'slow']}),
    'doorway': (['门', '敲', '到家', '签收', '快递', '送到', '上门', '取件', 'door', 'knock', 'doorstep', 'parcel', 'deliver', 'arrive', 'home'],
                {'knock': ['敲', '到了', '叮咚', '按铃', 'knock', 'arrive', 'ring'], 'open': ['开门', '打开', 'open'], 'handover': ['签收', '交给', '递', '拿到', '手上', '收到', 'handover', 'delivered', 'receive', 'sign', 'hand']}),
    'desk': (['办公', '工作', '代码', '会议', '开会', '加班', '电脑', '写', '提交', '需求', '上班', 'AI', '助手', '设计', '方案', 'office', 'code', 'meeting', 'overtime', 'work', 'desk', 'review', 'commit', 'deadline', 'assistant', 'design', 'computer'],
             {'typing': ['写', '代码', '打字', '提交', '改', 'type', 'code', 'write', 'commit', 'edit'], 'meeting': ['会', '讨论', '评审', '汇报', 'meeting', 'review', 'discuss', 'plan'], 'overtime': ['加班', '熬夜', '深夜', '赶', 'overtime', 'late', 'night', 'deadline']}),
    'counter': (['柜台', '收银', '付款', '支付', '买', '排队', '找零', '结账', '退钱', '退款', '商店', '超市', 'pay', 'cashier', 'checkout', 'shop', 'store', 'buy', 'refund'],
                {'queue': ['排队', '等', '下单', 'queue', 'wait', 'line', 'order'], 'pay': ['付', '支付', '扫码', '钱', 'pay', 'scan', 'paid'], 'change': ['找零', '退', '零钱', 'change', 'refund', 'money back']}),
    'servers': (['服务器', '机房', '宕机', '网络', '数据', '上线', '部署', '请求', '流量', '后端', '接口', '数据库', '缓存', 'server', 'deploy', 'request', 'network', 'database', 'cloud', 'api', 'backend', 'cache', 'outage'],
                {'ok': ['正常', '成功', '收下', '恢复', '上线', 'ok', 'success', 'running', 'healthy', 'recovered'], 'overload': ['忙', '过载', '慢', '超时', '重试', '一直转圈', 'overload', 'busy', 'slow', 'timeout', 'retry', 'queue'], 'down': ['宕机', '挂', '失败', '崩', '错误', '没网', 'down', 'fail', 'error', 'crash', 'offline']}),
    'clinic': (['医院', '挂号', '看病', '医生', '护士', '候诊', '叫号', '药', '体检', '病', 'hospital', 'clinic', 'doctor', 'nurse', 'patient', 'medicine'],
               {'register': ['挂号', '登记', '预约', 'register', 'sign in', 'book'], 'wait': ['候诊', '等', '排队', 'wait', 'queue'], 'call': ['叫号', '到你', '轮到', '就诊', 'call', 'turn', 'next', 'see the doctor']}),
    'classroom': (['学校', '上课', '老师', '学生', '考试', '作业', '教室', '提问', '学习', '课', 'school', 'class', 'teacher', 'student', 'exam', 'homework', 'learn', 'lesson'],
                  {'teach': ['讲', '教', '学', '上课', 'teach', 'lesson', 'learn', 'explain'], 'ask': ['问', '提问', '不懂', '?', '？', 'ask', 'question'], 'exam': ['考', '测验', '交卷', '分数', 'exam', 'test', 'quiz', 'grade']}),
    'boba': (['奶茶', '珍珠', '波霸', '饮品', '咖啡', '茶饮', '店员', 'boba', 'bubble tea', 'milk tea', 'pearl', 'barista', 'drink', 'cafe'],
             {'order': ['点', '下单', '排队', '付', 'order', 'line', 'pay'], 'make': ['做', '摇', '煮', '制作', 'make', 'shake', 'brew', 'being made'], 'call': ['叫号', '取', '好了', '号', 'call', 'ready', 'pick up', 'number']}),
}

# prop -> (nominal width, height at scale 1, JS template, words). Template fields: {cx} {cy} {by} {x0} {x1} {s} {r} {w} {h}
PROPS = {
    'phone': (70, 130, "$.phone({cx}, {cy}, {s}, {{ screen: 'chat', t: T }});", ['手机', '消息', '聊天', '微信', '短信', 'app', 'phone', 'message', 'chat', 'text']),
    'laptop': (150, 90, "$.laptop({cx}, {by}, {s}, {{ t: T, typing: true }});", ['电脑', '代码', '程序', '笔记本', 'laptop', 'code', 'computer']),
    'server': (100, 190, "$.server({cx}, {by}, {s}, {{ t: T }});", ['服务器', '后端', '数据库', 'server', 'backend', 'database']),
    'tower': (70, 200, "$.tower({cx}, {by}, {s}, T, true);", ['信号', '基站', '网络', 'signal', 'network', '4g', '5g']),
    'clock': (150, 150, "$.clock({cx}, {cy}, {r}, T, {{ speed: 2 }});", ['时间', '分钟', '小时', '超时', '点钟', 'time', 'minute', 'hour', 'timeout', "o'clock"]),
    'calendar': (90, 100, "$.calendar({cx}, {cy}, {s}, '18');", ['日', '周', '月', '天', 'day', 'week', 'month', 'date']),
    'scooter': (220, 130, "$.scooter({cx}, {by}, {s}, 1, {{ t: T, logo: '外卖' }});", ['外卖', '骑手', '电动车', 'rider', 'scooter', 'takeout']),
    'car': (200, 100, "$.car({cx}, {by}, {s}, 1, {{ t: T }});", ['车', '开车', 'car', 'drive', 'taxi']),
    'bowl': (110, 80, "$.bowl({cx}, {by}, {s}, {{ food: 'noodles', t: T }});", ['面', '饭', '汤', '吃', 'noodle', 'rice', 'soup', 'eat']),
    'teapot': (150, 100, "$.teapot({cx}, {by}, {s}, {{ t: T }});", ['茶', 'tea']),
    'bubbleTea': (70, 160, "$.bubbleTea({cx}, {by}, {s}, {{ tea: 'tan', tiger: true, t: T }});", ['奶茶', '珍珠', 'boba', 'bubble tea', 'milk tea']),
    'printer': (100, 120, "$.printer({cx}, {by}, {s}, T, {{ printing: 1, text: '#42' }});", ['小票', '打印', '订单', 'receipt', 'print', 'ticket']),
    'box': (100, 80, "$.K.props.box($.ctx, {cx} - 50 * {s}, {by}, 100 * {s}, 80 * {s}, {{ label: '快递' }});", ['快递', '包裹', '箱', 'parcel', 'package', 'box']),
    'envelope': (90, 60, "$.envelope({cx}, {cy}, {s}, {{ stamp: true }});", ['信', '邮件', 'mail', 'email', 'letter']),
    'coins': (80, 30, "$.coins({cx}, {by}, {s}, {{ n: 4 }});", ['钱', '元', '付款', '零钱', 'money', 'coin', 'cash']),
    'bankCard': (90, 60, "$.bankCard({cx}, {cy}, {s}, {{ tilt: -.12 }});", ['银行卡', '刷卡', '信用卡', 'card', 'bank']),
    'atm': (130, 230, "$.atm({cx}, {by}, {s}, T, {{ cash: .6 }});", ['取钱', 'atm', '取款', 'withdraw']),
    'ledger': (230, 90, "$.ledger({cx}, {by}, {s});", ['账', '记账', 'ledger', 'account', 'books']),
    'contract': (130, 170, "$.contract({cx}, {y0} + 10, {s}, {{ signed: 1, seal: true }});", ['合同', '签', '协议', 'contract', 'sign', 'agreement']),
    'train': (580, 110, "$.train({cx}, {by}, {s}, T, {{ cars: 2, moving: true }});", ['火车', '高铁', '地铁', 'train', 'rail', 'subway']),
    'plane': (260, 130, "$.plane({cx}, {cy}, {s}, T);", ['飞机', '航班', '机场', 'plane', 'flight', 'airport']),
    'truck': (280, 140, "$.truck({cx}, {by}, {s}, 1, {{ t: T, label: '物流' }});", ['货车', '物流', '运输', '发货', 'truck', 'shipping', 'logistics']),
    'ship': (380, 200, "$.ship({cx}, {by} - 40 * {s}, {s}, T);", ['船', '港口', '海运', 'ship', 'boat', 'port']),
    'subwayGate': (200, 140, "$.subwayGate({cx}, {by}, {s}, T, {{ open: 1 }});", ['闸机', '进站', 'gate', 'turnstile']),
    'bed': (260, 120, "$.bed({cx}, {by}, {s}, {{ drip: true, t: T }});", ['病床', '住院', '病房', 'bed', 'ward']),
    'medicine': (60, 90, "$.medicine({cx}, {by}, {s}, {{ label: '药' }});", ['药', '吃药', 'medicine', 'pill', 'drug']),
    'queueScreen': (180, 110, "$.queueScreen({cx}, {cy}, {s}, {{ num: 'A013', t: T }});", ['叫号', '号码', 'number', 'queue']),
    'examPaper': (130, 170, "$.examPaper({cx}, {y0} + 10, {s}, {{ score: 100 }});", ['试卷', '考', '分数', 'exam', 'test', 'score']),
    'schoolbag': (100, 140, "$.schoolbag({cx}, {by}, {s});", ['书包', '上学', 'schoolbag', 'backpack']),
    'blackboard': (300, 180, "$.blackboard({x0} + 10, {y0} + 10, {w} - 20, Math.min({h} - 30, 180), {{ text: '1 + 1 = 2', t: T }});", ['黑板', '讲课', 'blackboard', 'lesson']),
    'field': (300, 120, "$.field({x0} + 10, {x1} - 10, {by}, T, {{ rows: 4 }});", ['田', '稻', '种', '农', 'field', 'farm', 'rice', 'crop']),
    'bambooBasket': (120, 90, "$.bambooBasket({cx}, {by}, {s}, {{ fill: 'leaf' }});", ['竹', '筐', '篮', 'basket', 'bamboo']),
    'loom': (170, 210, "$.loom({cx}, {by}, {s}, T, {{ progress: .6 }});", ['织', '布', 'loom', 'weave', 'cloth']),
    'kiln': (230, 200, "$.kiln({cx}, {by}, {s}, T, {{ fire: true }});", ['窑', '烧', '陶', '瓷', 'kiln', 'pottery', 'ceramic']),
    'robotArm': (220, 200, "$.robotArm({cx}, {by}, {s}, T);", ['机械臂', '流水线', '工厂', '自动化', 'robot arm', 'assembly', 'factory']),
    'forklift': (260, 210, "$.forklift({cx}, {by}, {s}, 1, {{ t: T, lift: .5, load: true }});", ['叉车', '仓库', '搬运', 'forklift', 'warehouse']),
    'rack': (280, 280, "$.rack({x0} + 10, {by}, Math.min({w} - 20, 280), Math.min({h} - 20, 280), {{}});", ['货架', '库存', '仓库', 'rack', 'stock', 'inventory']),
    'robot': (150, 220, "$.robot({cx}, {by}, {s}, T, {{ wave: true }});", ['机器人', 'ai', '智能', 'robot', 'bot', 'agent', 'model']),
    'chip': (110, 110, "$.chip({cx}, {cy}, {s}, {{ t: T, label: 'AI' }});", ['芯片', '算力', 'gpu', 'cpu', 'chip']),
    'keyboard': (190, 40, "$.keyboard({cx}, {by}, {s}, {{ t: T, typing: true }});", ['键盘', '打字', 'keyboard', 'type']),
    'cell': (200, 110, "$.cell({cx}, {cy}, 40 * {s}, {{ p: (T * .1) % 1, t: T }});", ['细胞', '分裂', 'cell', 'divide', 'mitosis']),
    'dna': (80, 220, "$.dna({cx}, {y0} + 10, Math.min({h} - 20, 220), {{ t: T }});", ['基因', 'dna', 'gene']),
    'microscope': (110, 210, "$.microscope({cx}, {by}, {s});", ['显微镜', '实验', 'microscope', 'lab', 'experiment']),
    'petriDish': (140, 70, "$.petriDish({cx}, {cy}, 60 * {s}, {{ p: .7, t: T }});", ['培养', '细菌', 'petri', 'bacteria', 'culture']),
    'rocket': (120, 320, "$.rocket({cx}, {by} - 60 * {s}, {s}, {{ t: T, fire: true }});", ['火箭', '发射', '航天', 'rocket', 'launch', 'space']),
    'gear': (110, 110, "$.gear({cx}, {cy}, 50 * {s}, T);", ['齿轮', '机器', '流程', 'gear', 'machine', 'process']),
    'magnifier': (150, 150, "$.magnifier({cx} - 20 * {s}, {cy} - 20 * {s}, 40 * {s});", ['检查', '查找', '发现', 'check', 'search', 'find', 'inspect']),
    'hourglass': (90, 140, "$.hourglass({cx}, {cy}, {s}, T);", ['小时', '过期', '时间到', 'hour', 'expire', 'old']),
    'cat': (100, 110, "$.cat({cx}, {by}, {s}, T);", ['猫', 'cat']),
    'dog': (110, 110, "$.dog({cx}, {by}, {s}, T);", ['狗', 'dog']),
}
FILLERS = ['flowerPot', 'lamp', 'tree', 'clock', 'cat', 'bush', 'building']
FILLER_JS = {
    'building': (160, 360, "$.building({cx}, {by}, 160 * {s}, 340 * {s}, {{ t: T }});"),
    'flowerPot': (70, 120, "$.flowerPot({cx}, {by}, {s}, T, 'pink');"),
    'lamp': (90, 200, "$.lamp({cx} - 20 * {s}, {by}, 180, {s}, T, false);"),
    'tree': (140, 200, "$.tree({cx}, {by}, {s}, T);"),
    'clock': PROPS['clock'][:3],
    'cat': PROPS['cat'][:3],
    'bush': (110, 60, "$.bush({cx}, {by}, {s}, T);"),
}


def hits(text, words):
    """how often the words occur: Chinese by substring, English as whole words (so 'ai' does not match 'paid')"""
    t = text.lower()
    n = 0
    for w in words:
        w = w.lower()
        n += len(re.findall(r'(?<![a-z])' + re.escape(w) + r'(?![a-z])', t)) if re.match(r'^[a-z0-9 \'?]+$', w) else t.count(w)
    return n


def chapter_text(ch):
    parts = [ch.get('title', ''), ch.get('sub', ''), ch.get('tagline', '')]
    for sid, st in (ch.get('states') or {}).items():
        parts += [sid, st.get('label', ''), st.get('tag', '')]
    for e in ch.get('edges') or []:
        parts += [e.get('label', ''), e.get('if', '')]
    for s in ch.get('steps') or []:
        parts.append(s if isinstance(s, str) else (s.get('note') or '') + ' ' + (s.get('say') or ''))
    rule = ch.get('rule') or {}
    parts += [rule.get('text', ''), rule.get('never', '')]
    return ' '.join(str(p) for p in parts if p)


def state_modes(ch, name):
    """{state id: mode} from each state's words and the words on the arrows into it."""
    modes = SETS[name][1]
    out = {}
    for sid, st in (ch.get('states') or {}).items():
        text = ' '.join([sid, st.get('label', ''), st.get('tag', '')] + [e.get('label', '') + ' ' + e.get('if', '') for e in ch.get('edges') or [] if e.get('to') == sid])
        best = max(modes, key=lambda m: hits(text, modes[m]))
        if hits(text, modes[best]):
            out[sid] = best
    return out


def area_of(r):
    return (r['x1'] - r['x0']) * (r['y1'] - r['y0'])


def fmt(v):
    return str(int(round(v)))


def place(js, w0, h0, r, fit=.8, cap=1.0):
    """fill a template with an area's numbers, the prop scaled to fit"""
    w, h = r['x1'] - r['x0'], r['y1'] - r['y0']
    s = max(.3, min(w / w0, h / h0, cap) * fit)
    cx, cy, by = (r['x0'] + r['x1']) / 2, (r['y0'] + r['y1']) / 2, r['y1'] - 12
    return js.format(cx=fmt(cx), cy=fmt(cy), by=fmt(by), x0=fmt(r['x0']), x1=fmt(r['x1']), y0=fmt(r['y0']), w=fmt(w), h=fmt(h),
                     s=f'{s:.2f}', r=fmt(min(60, min(w, h) * .3)))


def split_tall(r, minw):
    """a tall strip: the set takes the bottom, the rest stays free above it"""
    w, h = r['x1'] - r['x0'], r['y1'] - r['y0']
    if h <= max(520, w * 1.35):
        return r, None
    hs = max(400, min(h * .55, w * 1.15 + 60))
    low = dict(r, y0=round(r['y1'] - hs))
    up = dict(r, y1=low['y0'])
    return low, up


def draft_chapter(ci, ch, lay, film_text, W, H):
    text = chapter_text(ch)
    scores = sorted(((hits(text, SETS[n][0]) * 3 + hits(film_text, SETS[n][0]), n) for n in SETS), reverse=True)
    main = scores[0][1] if scores[0][0] > 0 else 'street'
    own = sorted(((hits(text, SETS[n][0]), n) for n in SETS if n != main), reverse=True)
    second = own[0][1] if own[0][0] >= 2 else None             # a second scene only when this chapter's own words ask for it
    why = [w for w in SETS[main][0] if w.lower() in text.lower()][:5]
    free = sorted(lay.get('free') or [], key=area_of, reverse=True)
    lines, still, notes, used = [], [], [], set()      # still: things that never move go into bg (drawn once)

    def set_call(name, r, label):
        modes = state_modes(ch, name)
        default = SETS[name][1] and list(SETS[name][1])[0]
        pairs = ', '.join(f"['{sid}', '{m}']" for sid, m in modes.items())
        area = f"{{ x0: {r['x0']}, y0: {r['y0']}, x1: {r['x1']}, y1: {r['y1']}}}"
        lines.append(f"    // {label}: {name}" + (f" (mode by state: {', '.join(f'{k} → {v}' for k, v in modes.items())})" if modes else f" (no state names a mode; it stays '{default}')"))
        lines.append(f"    {{ const m = modeOf(S, [{pairs}], '{default}'); $.set('{name}', {area}, {{ mode: m.mode, t: T, p: m.p }}); }}")

    big = [r for r in free if r['x1'] - r['x0'] >= 260 and r['y1'] - r['y0'] >= 280 and r['y1'] > 450]
    rest = [r for r in free if r not in big[:1]]
    if big:
        low, up = split_tall(big[0], 300)
        set_call(main, low, f"the main scene, free area {free.index(big[0]) + 1}")
        notes.append(f"{main}: {', '.join(why) if why else 'no keyword matched; a generic street'}")
        if up:
            if second and up['x1'] - up['x0'] >= 260 and up['y1'] - up['y0'] >= 300:
                set_call(second, dict(up, y0=max(up['y0'], up['y1'] - 460)), 'above it, a second scene')
                used.add(second)
            else:
                rest.insert(0, up)
        if second and second not in used and len(big) > 1 and big[1] in rest:
            set_call(second, big[1], f"a second scene, free area {free.index(big[1]) + 1}")
            rest.remove(big[1]); used.add(second)
    # props for the other areas: the ones the words point to first, then fillers
    wanted = sorted(((hits(text, p[3]), n) for n, p in PROPS.items()), reverse=True)
    queue = [n for k, n in wanted if k > 0]
    fill_i, sky = 0, False
    chunks = []
    for r in rest:                                   # tall strips hold two or three things, stacked
        w, h = r['x1'] - r['x0'], r['y1'] - r['y0']
        n = max(1, min(3, round(h / max(220, w * 1.5))))
        for k in range(n):
            chunks.append(dict(r, y0=round(r['y0'] + h * k / n), y1=round(r['y0'] + h * (k + 1) / n)))
    fit = lambda r, w0, h0: abs(__import__('math').log(((r['x1'] - r['x0']) / max(1, r['y1'] - r['y0'])) / (w0 / h0)))
    for r in chunks:
        w, h = r['x1'] - r['x0'], r['y1'] - r['y0']
        if w < 100 or h < 90:
            continue
        tag = f"free ({r['x0']},{r['y0']})-({r['x1']},{r['y1']})"
        if r['y0'] <= 40 and not sky and r['y1'] <= 420:            # the top of the poster: weather
            sky = True
            lines.append(f"    // {tag}: the sky")
            lines.append(f"    $.sun({fmt(r['x1'] - min(70, w * .3))}, {fmt(r['y0'] + min(80, h * .4))}, {fmt(min(34, w * .16, h * .25))}, T);")
            if w > 220:
                lines.append(f"    $.cloud({fmt(r['x0'] + w * .35)} + Math.sin(T * .3) * 16, {fmt(r['y0'] + h * .55)}, {fmt(min(140, w * .4))}, {fmt(min(56, h * .3))}, {{ fill: 'white', hatch: 'sky' }});")
            continue
        if queue:
            n = min(queue[:4], key=lambda q: fit(r, *PROPS[q][:2]))
            queue.remove(n)
            w0, h0, js, words = PROPS[n]
            note = f"    // {tag}: {n} (words: {', '.join(x for x in words if x.lower() in text.lower())[:40]})"
        else:
            n = min(FILLERS[fill_i % len(FILLERS):] + FILLERS[:fill_i % len(FILLERS)], key=lambda q: fit(r, *FILLER_JS[q][:2]) + .3 * (FILLERS.index(q) < fill_i % len(FILLERS)))
            fill_i += 1
            w0, h0, js = FILLER_JS[n]
            note = f"    // {tag}: {n} (a filler; swap in something from the story)"
        dest = lines if re.search(r'\bT\b', js) else still
        dest += [note, '    ' + place(js, w0, h0, r)]
        if h >= 150 and r['y1'] >= H - 60:
            still.append(f"    $.ground({r['x0'] + 10}, {r['x1'] - 10}, {r['y1'] - 10}, 6, 'g{ci}{r['x0']}');")
    title = f"{ch.get('num') or ci + 1} {ch.get('title', '')}".strip()
    body = '\n'.join(lines) if lines else '    // no free area big enough: the chart fills this poster'
    bg = ('  bg($) {\n' + '\n'.join(still) + '\n  },\n') if still else ''
    js = f"""/* ------------------------------------------------------------------ {title} */
// {'; '.join(notes) if notes else 'props only'}
SCENES[{ci + 1}] = {{
{bg}  fg($, S) {{
    const T = S.T;
{body}
  }},
}};
"""
    return js, main if big else None


HEAD = """// scenes.draft.js — drafted by `scv.py draft` from the layout (work/layout/chN.json) and the words in film.json.
// A starting point, not the film: copy it to scenes.js (`scv.py draft JOB --write` does that while scenes.js is still the
// skeleton), look at `scv.py layout JOB`, then refine: one hero scene per poster, the story's own things in the
// smaller areas, the same cast in every chapter. See references/scenes.md.
// modeOf(S, [[state, mode], ...], default): the set piece's mode follows whichever listed state is active; p is how far
// that state has got (0..1), for doors that open and coins that fly.
const prog = (S, id, d = 1.2) => { const k = S.since(id); return k < 0 ? 0 : k >= 99 ? 1 : Math.max(0, Math.min(1, (k - .5) / d)); };
const modeOf = (S, map, def) => { for (const [id, m] of map) if (S.on(id)) return { mode: m, p: prog(S, id) }; return { mode: def, p: 1 }; };

"""


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('job')
    ap.add_argument('--write', action='store_true', help='also write scenes.js while it is still the skeleton')
    a = ap.parse_args(argv)
    job = Path(a.job).resolve()
    spec = json.loads((job / 'film.json').read_text())
    chapters = spec.get('chapters') or []
    lay_dir = job / 'work/layout'
    if not all((lay_dir / f'ch{i + 1}.json').exists() for i in range(len(chapters))):
        print('no layout yet: running scv.py layout first')
        subprocess.run([sys.executable, str(HERE / 'scv.py'), 'layout', str(job)], check=True)
    film_text = ' '.join([spec.get('title', ''), spec.get('series', '')] + [chapter_text(c) for c in chapters])
    out, picks = [HEAD], []
    for ci, ch in enumerate(chapters):
        lay = json.loads((lay_dir / f'ch{ci + 1}.json').read_text())
        W, H = lay.get('poster', [1000, 1333])
        js, pick = draft_chapter(ci, ch, lay, film_text, W, H)
        out.append(js)
        picks.append(pick or '-')
    draft = job / 'scenes.draft.js'
    draft.write_text('\n'.join(out))
    print(f"wrote {draft} ({', '.join(f'{i + 1}: {p}' for i, p in enumerate(picks))})")
    if a.write:
        sys.path.insert(0, str(HERE))
        import scv
        cur = job / 'scenes.js'
        norm = lambda s: re.sub(r'\s+', '', s)
        if not cur.exists() or norm(cur.read_text()) == norm(scv.SCENES_SKELETON):
            cur.write_text(draft.read_text())
            print(f'wrote {cur} (it was the skeleton); look at it with: scv.py layout {job}')
        else:
            print(f'{cur} has your own scenes; left it alone. Compare with {draft.name}.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

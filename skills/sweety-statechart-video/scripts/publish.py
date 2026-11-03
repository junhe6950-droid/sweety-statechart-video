#!/usr/bin/env python3
"""publish.py: `scv.py publish JOB` -> outputs/publish/: three title options, a description, hashtags, chapter times
(Bilibili / YouTube format), per-platform notes (aspect, length, which file), cover text and the alt text of every
poster. Everything comes from film.json (+ work/timing.json for times); no network, no model.

Also the helpers the site uses: chart_text() (the chart as plain text) and alt_text() (a long description of a poster)."""
import json
import re
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import scv  # noqa: E402

ROMAN = scv.ROMAN + ['XI', 'XII', 'XIII', 'XIV', 'XV']
PROPS = {   # what the crayon kit's props are called in an alt text
    'ground': '地面', 'grass': '草', 'tree': '树', 'bush': '灌木', 'flowerPot': '花盆', 'cloud': '云', 'sun': '太阳', 'moon': '月亮',
    'star': '星星', 'sparkle': '闪光', 'rain': '雨', 'snow': '雪', 'wind': '风', 'flame': '火苗', 'fire': '火', 'steam': '热气',
    'puff': '一团烟', 'bulb': '灯泡', 'lamp': '路灯', 'pot': '锅', 'stove': '炉子', 'wok': '炒锅', 'bowl': '碗', 'cup': '杯子',
    'kettle': '水壶', 'teapot': '茶壶', 'teacup': '茶杯', 'plate': '盘子', 'jar': '罐子', 'chopsticks': '筷子', 'stool': '凳子',
    'table': '桌子', 'chair': '椅子', 'counter': '柜台', 'shelf': '架子', 'door': '门', 'house': '房子', 'building': '楼',
    'shopFront': '店面', 'awningStall': '摊位', 'road': '马路', 'trafficLight': '红绿灯', 'sign': '牌子', 'lantern': '灯笼',
    'umbrella': '伞', 'bench': '长椅', 'phone': '手机', 'bubble': '对话气泡', 'think': '想法气泡', 'mark': '标记', 'laptop': '笔记本电脑',
    'server': '服务器', 'tower': '信号塔', 'signal': '信号', 'wifi': '无线信号', 'envelope': '信封', 'paperPlane': '纸飞机', 'heart': '爱心',
    'check': '对勾', 'cross': '叉', 'clock': '钟', 'alarm': '闹钟', 'calendar': '日历', 'printer': '打印机', 'receipt': '小票',
    'coin': '硬币', 'magnifier': '放大镜', 'gear': '齿轮', 'conveyor': '传送带', 'box': '箱子', 'bag': '袋子', 'scooter': '电动车',
    'car': '汽车', 'bike': '自行车', 'bird': '鸟', 'cat': '猫', 'dog': '狗', 'basket': '篮子', 'bucket': '水桶', 'sack': '麻袋',
    'crate': '木箱', 'flag': '旗子', 'stamp': '印章', 'who': '人物', 'person': '人物',
}
SKIP = {'ground', 'mark', 'text', 'line', 'shape', 'dot', 'blob', 'scribble', 'words', 'hatch', 'radial', 'wobble', 'rect', 'ell'}


def stamp(t):
    t = int(round(t))
    return f'{t // 3600}:{t // 60 % 60:02d}:{t % 60:02d}' if t >= 3600 else f'{t // 60:02d}:{t % 60:02d}'


def label(ch, sid):
    if sid == 'end':
        return '终点'
    s = (ch.get('states') or {}).get(sid) or {}
    if s:
        return s.get('label') or sid
    for g in regions(ch):
        lanes = g.get('lanes') or []
        if g.get('id') == sid:
            return g.get('title') or (lanes[0].get('title') if len(lanes) == 1 else None) or sid
        for l in lanes:
            if l.get('id') == sid:
                return l.get('title') or sid
    return sid


def regions(ch):
    r = ch.get('regions')
    return [g for g in ([r] if isinstance(r, dict) else (r or [])) if g]


def arrows(ch):
    out = []
    for e in ch.get('edges') or []:
        words = (e.get('text') or e.get('label') or '').replace('\n', '')
        cond = f'（条件：{e["if"]}）' if e.get('if') else ''
        if e['from'] == e['to']:
            out.append(f"{label(ch, e['from'])} 自己转一圈" + (f'：{words}' if words else '') + cond)
        else:
            out.append(f"{label(ch, e['from'])} → {label(ch, e['to'])}" + (f'：{words}' if words else '') + cond)
    if ch.get('exit'):
        out.append(f"{label(ch, ch['exit']['from'])} → 下一章" + (f"：{ch['exit'].get('label', '').rstrip('↓ ')}" if ch['exit'].get('label') else ''))
    return out


def chart_text(ch, ci):
    """the chart as plain text, for screen readers and for search"""
    lines = [f"{ROMAN[ci]} {ch.get('title', '')}" + (f"：{ch['sub']}" if ch.get('sub') else '')]
    states = [label(ch, s) for s in (ch.get('states') or {})]
    lines.append('状态：' + '、'.join(states))
    if ch.get('start'):
        lines.append('起点：' + label(ch, ch['start']))
    for g in regions(ch):
        lanes = g.get('lanes') or []
        if len(lanes) == 1:
            lines.append(f"「{label(ch, g['id'])}」是一个大框（父状态），里面有：{'、'.join(label(ch, s) for s in lanes[0].get('states') or [])}")
        else:
            lines.append(f"「{label(ch, g['id'])}」里有 {len(lanes)} 条线同时走：" +
                         '；'.join(f"{l.get('title') or l['id']}（{'、'.join(label(ch, s) for s in l.get('states') or [])}）" for l in lanes))
    lines += ['箭头：'] + ['  ' + a for a in arrows(ch)]
    rule = ch.get('rule')
    if rule:
        bad = rule.get('never') or rule.get('breaks')
        path = rule.get('path')
        lines.append(f"规则：永远不该到「{label(ch, bad)}」" + (f"；检查器找到的路径：{' → '.join(label(ch, s) for s in path)}" if path else '；它成立'))
    return '\n'.join(lines)


def scene_block(src, n):
    m = re.search(rf'SCENES\[{n}\]\s*=', src)
    if not m:
        return ''
    nxt = re.search(r'SCENES\[\d+\]\s*=', src[m.end():])
    return src[m.end(): m.end() + nxt.start()] if nxt else src[m.end():]


def drawn(src, n):
    """the props a chapter's scene draws, in order of first use, with the words on signs"""
    block, seen, out = scene_block(src, n), set(), []
    for m in re.finditer(r'\$\.([a-zA-Z]+)\(([^\n]*)', block):
        name, args = m.group(1), m.group(2)
        if name in SKIP:
            continue
        words = re.findall(r"'([^'\n]{1,16})'|\"([^\"\n]{1,16})\"", args)
        words = [a or b for a, b in words if re.search(r'[一-鿿]', a or b)]
        key = name + (words[0] if words else '')
        if key in seen:
            continue
        seen.add(key)
        thing = PROPS.get(name, re.sub(r'([a-z])([A-Z])', r'\1 \2', name).lower())
        out.append(f'写着「{words[0]}」的{thing}' if words else thing)
    uniq = []
    for x in out:
        if x not in uniq:
            uniq.append(x)
    return uniq[:18]


def alt_text(spec, ci, scenes_src=''):
    ch = spec['chapters'][ci]
    s = [f"蜡笔手绘的状态图海报，第 {ROMAN[ci]} 章《{ch.get('title', '')}》" + (f"，{ch['sub']}" if ch.get('sub') else '') + '。']
    states = [label(ch, x) for x in (ch.get('states') or {})]
    if states:
        s.append(f"纸上钉着 {len(states)} 张状态卡片：{'、'.join(states)}。" + (f"起点是「{label(ch, ch['start'])}」。" if ch.get('start') else ''))
    for g in regions(ch):
        lanes = g.get('lanes') or []
        if len(lanes) > 1:
            s.append(f"一个写着「{label(ch, g['id'])}」的大框里，{len(lanes)} 条线用虚线隔开，同时进行：" +
                     '；'.join(f"{l.get('title') or l['id']}（{'、'.join(label(ch, x) for x in l.get('states') or [])}）" for l in lanes) + '。')
        elif lanes:
            s.append(f"「{label(ch, g['id'])}」是一个大框，里面有{'、'.join(label(ch, x) for x in lanes[0].get('states') or [])}。")
    arr = arrows(ch)
    if arr:
        s.append('箭头依次是：' + '；'.join(arr) + '。')
    rule = ch.get('rule')
    if rule and rule.get('path'):
        s.append(f"规则说永远不该到「{label(ch, rule.get('never') or rule.get('breaks'))}」，但检查器找到了一条路："
                 f"{' → '.join(label(ch, x) for x in rule['path'])}，这条路用红线描出，旁边盖着「{rule.get('stamp') or '规则被打破'}」的章。")
    things = drawn(scenes_src, ci + 1)
    if things:
        s.append('图的四周画着：' + '、'.join(things) + '。')
    return ''.join(s)


def chapter_times(timing, spec):
    rows, seen = [], set()
    for st in timing['steps']:
        if st['ci'] in seen:
            continue
        seen.add(st['ci'])
        ch = spec['chapters'][st['ci']]
        rows.append((0.0 if not rows else st['t0'], f"{ROMAN[st['ci']]} {ch.get('title', '')}"))
    return rows


def pack(job, spec):
    timing_f = job / 'work/timing.json'
    timing = json.loads(timing_f.read_text()) if timing_f.exists() else None
    film = scv.resolved(spec)
    chs = film['chapters']
    title, series = film.get('title') or '', film.get('series') or ''
    ep, nxt = spec.get('episode'), spec.get('next')
    W, H = scv.frame_size(spec)
    dur = timing['duration'] if timing else scv.estimate_seconds(spec)
    voiced = bool(scv.voice_of(spec))
    rule_ch = next((c for c in chs if c.get('rule') and c['rule'].get('path')), None)
    epi = f'第{ep}集' if ep else ''
    titles = [
        f"{title}" + (f"｜{series}{epi}" if series and series != title else (f'｜{epi}' if epi else '')),
        f"一张图看懂：{title}" if len(chs) < 2 else f"{title}：{'、'.join(c.get('title', '') for c in chs[:3])}" + ('……' if len(chs) > 3 else ''),
        spec['hook'] if isinstance(spec.get('hook'), str) else
        (f"{rule_ch.get('title')}：为什么会走到「{label(rule_ch, rule_ch['rule'].get('never') or rule_ch['rule'].get('breaks'))}」？" if rule_ch
         else f"{title}，背后有几种状态？"),
    ]
    times = chapter_times(timing, spec) if timing else []
    lines = [f"《{title}》" + (f" · {series}" if series and series != title else '') + (f" {epi}" if epi else '')]
    lines += [f"{ROMAN[i]} {c.get('title', '')}" + (f"：{c['sub']}" if c.get('sub') else '') for i, c in enumerate(chs)]
    if rule_ch:
        lines.append(f"最后一章交给检查器：它把所有能走的路都走了一遍，找出了「{label(rule_ch, rule_ch['rule'].get('never') or rule_ch['rule'].get('breaks'))}」是怎么发生的。")
    lines.append('画面全部由代码一笔一笔画出' + ('，旁白由 AI 合成。' if voiced else '。'))
    if nxt:
        lines.append(f'下一集：{nxt}')
    if times and len(times) >= 3:
        lines += ['', '章节：'] + [f'{stamp(t)} {name}' for t, name in times]
    tags = ['状态图', '知识科普', '动画', '蜡笔画', '流程']
    tags = list(dict.fromkeys([t for t in [series, title] + [c.get('title') for c in chs] + tags if t]))[:10]
    aspect = f'{W}:{H}'
    vertical = H > W
    platforms = [
        {'platform': '抖音', 'file': 'film-master.mp4', 'aspect': aspect, 'best': '9:16 竖版，1–3 分钟', 'title_max': 55,
         'note': '竖版直接发；横版会加黑边。' + ('长于 3 分钟时考虑发每章切片（outputs/clips/）。' if dur > 180 else '')},
        {'platform': '小红书', 'file': 'film-master.mp4', 'aspect': aspect, 'best': '3:4 竖版，1–5 分钟', 'title_max': 20,
         'note': '标题最多 20 字；也可以发长图（outputs/longimage/）或每张海报（outputs/social/*-xhs.jpg）做图文。'},
        {'platform': 'B 站', 'file': 'film-master.mp4', 'aspect': aspect, 'best': '16:9 横版，竖版也可', 'title_max': 80,
         'note': '简介里贴上章节时间（chapters.txt），开“分段章节”。'},
        {'platform': '视频号', 'file': 'film-master.mp4', 'aspect': aspect, 'best': '3:4 或 9:16，1–3 分钟', 'title_max': 55, 'note': ''},
        {'platform': 'YouTube', 'file': 'film-master.mp4', 'aspect': aspect,
         'best': 'Shorts：竖版且不超过 3 分钟；否则普通视频', 'title_max': 100,
         'note': ('可发 Shorts。' if vertical and dur <= 180 else '发普通视频。') + '章节时间要从 00:00 开始、至少 3 段、每段至少 10 秒。'},
    ]
    for p in platforms:
        p['length_ok'] = dur <= (180 if p['platform'] in ('抖音', '视频号') else 900)
    cover = {'image': 'outputs/cover.png', 'big': title, 'small': (chs[0].get('sub') if chs else '') or series,
             'note': '封面大字 4–8 个字最好，太长就用系列名做小字。'}
    scenes_src = (job / 'scenes.js').read_text() if (job / 'scenes.js').exists() else ''
    alts = [{'poster': f'outputs/posters/{i + 1:02d}.png', 'alt': alt_text(film, i, scenes_src)} for i in range(len(chs))]
    return {'title': title, 'titles': titles, 'description': '\n'.join(lines), 'tags': tags,
            'chapters': [{'t': round(t, 2), 'stamp': stamp(t), 'name': n} for t, n in times],
            'duration': round(dur, 1), 'aspect': aspect, 'platforms': platforms, 'cover': cover, 'alt': alts,
            'charts': [chart_text(c, i) for i, c in enumerate(chs)]}


def publish(job, spec):
    job = Path(job)
    p = pack(job, spec)
    out = job / 'outputs/publish'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'publish.json').write_text(json.dumps(p, ensure_ascii=False, indent=1))
    (out / 'titles.txt').write_text('\n'.join(p['titles']) + '\n')
    (out / 'description.txt').write_text(p['description'] + '\n')
    (out / 'tags.txt').write_text(' '.join('#' + t for t in p['tags']) + '\n' + ' '.join(p['tags']) + '\n')
    if p['chapters']:
        (out / 'chapters.txt').write_text('\n'.join(f"{c['stamp']} {c['name']}" for c in p['chapters']) + '\n')
    (out / 'cover.txt').write_text(f"{p['cover']['big']}\n{p['cover']['small']}\n")
    (out / 'alt.txt').write_text('\n\n'.join(f"{a['poster']}\n{a['alt']}" for a in p['alt']) + '\n')
    md = [f"# 发布包：{p['title']}", '', f"时长 {stamp(p['duration'])}，画幅 {p['aspect']}。上传用 `outputs/film-master.mp4`（码率高，平台再转码也清楚），转发用 `outputs/film.mp4`。", '',
          '## 标题（三选一）', ''] + [f'{i + 1}. {t}（{len(t)} 字）' for i, t in enumerate(p['titles'])]
    md += ['', '## 简介', '', p['description'], '', '## 话题', '', ' '.join('#' + t for t in p['tags'])]
    if p['chapters']:
        md += ['', '## 章节时间（B 站 / YouTube）', '', '```'] + [f"{c['stamp']} {c['name']}" for c in p['chapters']] + ['```']
    md += ['', '## 各平台', '', '| 平台 | 画幅 | 建议 | 时长 | 标题上限 | 说明 |', '|---|---|---|---|---|---|']
    md += [f"| {x['platform']} | {x['aspect']} | {x['best']} | {'合适' if x['length_ok'] else '偏长'} | {x['title_max']} 字 | {x['note']} |" for x in p['platforms']]
    md += ['', '## 封面', '', f"图：`{p['cover']['image']}`；大字：{p['cover']['big']}；小字：{p['cover']['small']}。{p['cover']['note']}",
           '', '## 图片说明（alt）', ''] + [f"- `{a['poster']}`：{a['alt']}" for a in p['alt']]
    md += ['', '## 图的文字版', ''] + ['```\n' + c + '\n```' for c in p['charts']]
    (out / 'publish.md').write_text('\n'.join(md) + '\n')
    print('wrote', out, '(publish.md, titles, description, tags, chapters, cover, alt)')
    return out


if __name__ == '__main__':
    j, s = scv.load(sys.argv[1])
    publish(j, s)

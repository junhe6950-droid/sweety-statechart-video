"""Sound planning for `scv.py plan`: when each card is active, the sfx and ambience events, karaoke character times
and the narration loudness envelope the player uses for talking mouths. Pure Python (scv.py runs under any python3).

  music_sync(spec, steps, lines, speed, total, voice_at) -> (total, sync)   music {"sync": true}: steps onto the beat grid
  sound_events(spec, steps, speed) -> (sfx, ambience)       for timeline.json
  step_chars(entry, note, at)      -> [[char, t0, t1], ...] in film seconds, or None
  talk_envelope(placed, total, fps) -> {"fps": fps, "env": [...]}
  lint(spec)                       -> warnings for `scv.py check`

Timing follows engine/crayon/film.js: a card pops at chart time POP_AT (pop = .6 + .4 backOut((t - .85) / .45)), the
rule stamp starts at chart time 1.2 and settles .35 later; chart time = film seconds after the step's t0 x speed.
The active set is film.js steps(): outside the regions box one card at a time, inside it one per lane.
"""
import math
import re

POP_AT = .85                # chart time: the dot reaches the card and the card pops
STAMP_AT = 1.5               # chart time: the rule stamp lands (1.2 + .35 settle, rounded)
POP_GAIN_DB = -6.            # the film-wide "sfx": true pop, as before
AMBIENCE_FADE = (.6, .9)     # seconds in / out, applied by mix.py
AMBIENCE_MERGE_GAP = .5      # the same ambience in back-to-back states plays on without a break
TALK_FPS = 30
MOOD_BPM = {'calm': 66, 'warm': 74, 'curious': 92, 'focused': 84, 'tense': 70}   # music_synth.MOODS (mix.py asserts)
SYNC_MAX_HOLD = .6           # narrated film: the longest pause added to meet a downbeat
SYNC_TOLERANCE = .04         # a target this little after a downbeat is on it...
SYNC_EARLY = .01             # ...and this little before one
SYNC_TEMPO = [1 + k / 20000 for k in range(-600, 601)]   # the bed's tempo may move by up to 3 %, in 0.005 % steps

SFX_KINDS = ('pop', 'paper', 'tick', 'chime', 'steam', 'kettle', 'fire', 'knock', 'creak', 'bell', 'ding', 'typing',
             'coins', 'stamp', 'whoosh')
AMBIENCE_KINDS = ('rain', 'fire', 'street', 'room')
SFX_HELP = {'pop': '卡片弹出的轻“啵”', 'paper': '翻纸', 'tick': '钟表一声', 'chime': '两声小铃', 'steam': '水汽嘶嘶变响',
            'kettle': '水开：嘶声加哨音', 'fire': '点火、噼啪几声', 'knock': '敲门三下', 'creak': '门吱呀', 'bell': '自行车铃两声',
            'ding': '手机“叮”', 'typing': '敲键盘一串', 'coins': '硬币叮当', 'stamp': '盖章“咚”', 'whoosh': '呼的一下'}
AMBIENCE_HELP = {'rain': '雨声', 'fire': '炉火噼啪', 'street': '街上（远处车流、偶尔一声铃）', 'room': '屋里的底噪'}


# ------------------------------------------------------------------------------------------- the active set

def _edge_ids(ch):
    seen, out = {}, []
    for e in ch.get('edges') or []:
        base = f"{e['from']}>{e['to']}"
        seen[base] = seen.get(base, 0) + 1
        out.append(e.get('id') or (base if seen[base] == 1 else f'{base}#{seen[base]}'))
    return out


def _start_of(ch):
    if ch.get('start'):
        return ch['start']
    regions = ch.get('regions')
    lanes = (regions or {}).get('lanes') or []
    in_lane = {s for lane in lanes for s in lane.get('states', [])}
    edges = ch.get('edges') or []
    outer = [s for s in ch.get('states') or {} if s not in in_lane]
    roots = [s for s in outer if not any(e.get('to') == s and e.get('from') != s for e in edges)]
    if regions and not roots:
        return regions.get('id', 'together')
    return roots[0] if roots else next(iter(ch.get('states') or {}), None)


def chapter_activity(ch):
    """Per step of one chapter: {'on': [...], 'new': [...]}, `new` the cards that pop (first shown at this step)."""
    regions = ch.get('regions')
    box = regions.get('id', 'together') if regions else None
    lane_of, lane_starts = {}, []
    for lane in (regions or {}).get('lanes') or []:
        for s in lane.get('states', []):
            lane_of[s] = lane.get('id')
        if lane.get('states'):
            lane_starts.append(lane.get('start') or lane['states'][0])
    edges = dict(zip(_edge_ids(ch), ch.get('edges') or []))
    exit_ref = f"{ch['exit']['from']}>exit" if ch.get('exit') else None
    start = _start_of(ch)
    config, seen, out = [], set(), []

    def add(state):
        if state not in config:
            config.append(state)

    for st in ch.get('steps') or []:
        st = st if isinstance(st, dict) else {'note': st}
        refs = st.get('go')
        refs = [] if refs is None else refs if isinstance(refs, list) else [refs]
        passing = []
        for ref in refs:
            if ref in ('start', 'entry'):
                if regions and start == box:
                    for s in lane_starts:
                        add(s)
                elif start:
                    add(start)
                continue
            if ref == exit_ref:
                config = []
                continue
            key = ref if ref in edges else next((k for k in edges if k.startswith(ref + '#')), None)
            if key is None:
                continue
            e = edges[key]
            src, dst = e.get('from'), e.get('to')
            if src == box or (src in lane_of and dst not in lane_of and dst != box):
                config = [s for s in config if s not in lane_of]
            elif src in lane_of:
                config = [s for s in config if s != src]
            else:
                config = [s for s in config if s in lane_of]           # one card at a time outside the regions
            if dst == box:
                for s in lane_starts:
                    add(s)
            elif dst in (ch.get('states') or {}):
                add(dst)
                passing.append(dst)
        on = list(st['on']) if st.get('on') else list(config)
        if st.get('on'):
            config = list(st['on'])
        new = [s for s in on + passing if s not in seen]
        out.append({'on': on, 'new': list(dict.fromkeys(new))})
        seen.update(on, passing)
    return out


# ------------------------------------------------------------------------------------------- events

def sfx_items(value, where):
    """A state's or step's `sfx`: "knock", ["knock", "creak"] or [{"kind", "at", "gain_db"}] -> [{kind, at, gain_db}].
    `at` is chart time inside the step (the same clock as S.t in scenes.js); default POP_AT."""
    if value in (None, False):
        return []
    items = value if isinstance(value, list) else [value]
    out = []
    for item in items:
        item = {'kind': item} if isinstance(item, str) else dict(item) if isinstance(item, dict) else {}
        kind = item.get('kind')
        if kind not in SFX_KINDS:
            raise SystemExit(f"{where}: sfx {kind!r} unknown; kinds: {', '.join(SFX_KINDS)}")
        out.append({'kind': kind, 'at': float(item.get('at', POP_AT)), 'gain_db': float(item.get('gain_db', 0.))})
    return out


def ambience_item(value, where):
    if value in (None, False):
        return None
    item = {'kind': value} if isinstance(value, str) else dict(value)
    if item.get('kind') not in AMBIENCE_KINDS:
        raise SystemExit(f"{where}: ambience {item.get('kind')!r} unknown; kinds: {', '.join(AMBIENCE_KINDS)}")
    return {'kind': item['kind'], 'gain_db': float(item.get('gain_db', 0.))}


def sound_events(spec, steps, speed):
    """(sfx, ambience) for timeline.json. `steps` are plan()'s steps (ci, si, t0, t1, final times)."""
    sfx, spans = [], []
    by_chapter = {}
    for s in steps:
        by_chapter.setdefault(s['ci'], []).append(s)
    for ci, ch in enumerate(spec.get('chapters') or []):
        timed = by_chapter.get(ci) or []
        if not timed:
            continue
        states = ch.get('states') or {}
        activity = chapter_activity(ch)
        raw_steps = [st if isinstance(st, dict) else {'note': st} for st in ch.get('steps') or []]
        rule = ch.get('rule') or {}
        stamp_step = next((k for k, st in enumerate(raw_steps) if st.get('stamp') or (st.get('trace') and rule.get('stamp'))), None)
        open_spans = {}
        for k, (s, act) in enumerate(zip(timed, activity)):
            st, at_pop = raw_steps[k], s['t0'] + POP_AT / speed
            before = activity[k - 1]['on'] if k else []
            sounded = set()
            for state in act['on']:
                if state not in before:
                    for item in sfx_items((states.get(state) or {}).get('sfx'), f'chapter {ci + 1} state {state}'):
                        sfx.append({'kind': item['kind'], 'at': round(s['t0'] + item['at'] / speed, 3), 'gain_db': item['gain_db'],
                                    'why': f'state {state}'})
                        sounded.add(state)
            if spec.get('sfx') is True and [n for n in act['new'] if n not in sounded]:
                sfx.append({'kind': 'pop', 'at': round(at_pop, 3), 'gain_db': POP_GAIN_DB, 'why': 'card'})
            for item in sfx_items(st.get('sfx'), f"chapter {ci + 1} step {k + 1}"):
                sfx.append({'kind': item['kind'], 'at': round(s['t0'] + item['at'] / speed, 3), 'gain_db': item['gain_db'],
                            'why': f'step {s["id"]}'})
            if k == stamp_step or (st.get('fix') and rule.get('fix')):
                sfx.append({'kind': 'stamp', 'at': round(s['t0'] + STAMP_AT / speed, 3), 'gain_db': 0., 'why': 'rule stamp'})
            # ambience: a state's loop from the moment its card is reached until another card takes over
            for state in list(open_spans):
                if state not in act['on']:
                    spans.append({**open_spans.pop(state), 'to': round(at_pop, 3)})
            for state in act['on']:
                amb = ambience_item((states.get(state) or {}).get('ambience'), f'chapter {ci + 1} state {state}')
                if amb and state not in open_spans:
                    open_spans[state] = {'kind': amb['kind'], 'from': round(at_pop, 3), 'gain_db': amb['gain_db'], 'state': state}
        for state, span in open_spans.items():
            spans.append({**span, 'to': round(timed[-1]['t1'], 3)})
    spans.sort(key=lambda x: (x['from'], x['kind']))
    merged = []
    for span in spans:
        prev = next((m for m in reversed(merged) if m['kind'] == span['kind'] and m['gain_db'] == span['gain_db']), None)
        if prev and span['from'] - prev['to'] <= AMBIENCE_MERGE_GAP:
            prev['to'] = max(prev['to'], span['to'])
            continue
        merged.append(dict(span))
    ambience = [{'kind': m['kind'], 'from': m['from'], 'to': m['to'], 'gain_db': m['gain_db']} for m in merged if m['to'] - m['from'] > .3]
    sfx.sort(key=lambda x: (x['at'], x['kind']))
    return sfx, ambience


# ------------------------------------------------------------------------------------------- music sync

def _stamp_steps(spec, steps):
    """Indexes into plan()'s steps whose rule stamp lands (first stamp / trace-with-stamp step, and `fix` steps)."""
    out = []
    for ci, ch in enumerate(spec.get('chapters') or []):
        rule = ch.get('rule') or {}
        raw = [st if isinstance(st, dict) else {'note': st} for st in ch.get('steps') or []]
        first = next((k for k, st in enumerate(raw) if st.get('stamp') or (st.get('trace') and rule.get('stamp'))), None)
        marks = {first} | {k for k, st in enumerate(raw) if st.get('fix') and rule.get('fix')}
        out += [n for n, s in enumerate(steps) if s['ci'] == ci and s['si'] in marks]
    return sorted(out)


def _sync_targets(spec, steps, speed):
    """[(step index, what, offset seconds after the step's t0)]: every chapter start, every rule stamp."""
    targets = [(n, f"chapter {s['ci'] + 1}", 0.) for n, s in enumerate(steps) if s['si'] == 0]
    targets += [(n, f"stamp {steps[n]['tag']}", STAMP_AT / speed) for n in _stamp_steps(spec, steps)]
    return sorted(targets, key=lambda item: (item[0], item[2]))


def _up(x, origin, unit):
    return origin + math.ceil((x - origin) / unit - 1e-9) * unit


def bar_at(t, origin, bar, stretch=None):
    """(bar number, its start, next bar's start) of the bar holding film time t; bar 0 starts at `origin` and
    stretch = {bar: extra seconds} lengthens bars (fermatas)."""
    stretch = {int(k): float(v) for k, v in (stretch or {}).items()}

    def start(k):
        return origin + k * bar + sum(v for b, v in stretch.items() if b < k)
    k = max(0, math.floor((t - origin) / bar + 1e-9))
    while k > 0 and start(k) > t + 1e-9:
        k -= 1
    while start(k + 1) <= t + 1e-9:
        k += 1
    return k, start(k), start(k + 1)


def downbeat_error(t, origin, bar, stretch=None):
    """(nearest downbeat, t minus it) in seconds."""
    _, before, after = bar_at(t, origin, bar, stretch)
    return (before, t - before) if t - before <= after - t else (after, t - after)


def _fit(targets, t0s, bar, origin):
    """Narrated: each target in turn, in time order. Just past a downbeat (SYNC_TOLERANCE): on it. Else the picture
    waits for the next downbeat when that is at most SYNC_MAX_HOLD away (a hold before the target's step). Else the
    music waits: the bar before stretches like a fermata so the next bar starts on the target (unless an earlier
    target sits on that bar). Returns (holds {step: s}, stretch {bar: s}, errors [s], how [str])."""
    shift, holds, stretch, errors, how, last = 0., {}, {}, [], [], -1
    for n, _, offset in targets:
        t = t0s[n] + offset + shift
        k, before, after = bar_at(t, origin, bar, stretch)
        if t - before <= SYNC_TOLERANCE or after - t <= SYNC_EARLY:
            errors.append(t - before if t - before <= SYNC_TOLERANCE else t - after)
            how.append('on the beat')
            last = k if t - before <= SYNC_TOLERANCE else k + 1
        elif after - t <= SYNC_MAX_HOLD and n > 0 and n not in holds:
            holds[n] = after - t
            shift += after - t
            errors.append(0.)
            how.append(f'picture holds {after - t:.2f} s')
            last = k + 1
        elif k >= 1 and last < k:
            stretch[k - 1] = stretch.get(k - 1, 0.) + t - before
            errors.append(0.)
            how.append(f'music holds {t - before:.2f} s')
            last = k
        else:
            errors.append(t - before if t - before < after - t else t - after)
            how.append('off the beat')
    return holds, stretch, errors, how


def music_sync(spec, steps, lines, speed, total, voice_at):
    """Music "sync": move steps onto the procedural bed's beat grid. Returns (total, sync or None) and edits `steps`
    and `lines` in place. Silent film: every step starts on a beat, every chapter on a bar line, the rule stamp on a
    downbeat (holds of any length). Narrated: the narration keeps its timing; a chapter start or stamp waits for the
    next downbeat when that is at most SYNC_MAX_HOLD away, otherwise the music waits for it (a fermata bar). The grid
    is pinned to a target and the tempo moved by at most 3 % to keep holds and fermatas short (deterministic search;
    a 3 % tempo change weighs like 0.3 s of fermata).
    The sync dict goes into timeline.json music.sync for music.py / mix.py."""
    music = spec.get('music')
    if not isinstance(music, dict) or not music.get('sync') or not steps:
        return total, None
    mood = music.get('mood')
    if mood not in MOOD_BPM:
        raise SystemExit(f"music sync: mood {mood!r} unknown; moods: {', '.join(MOOD_BPM)}")
    targets = _sync_targets(spec, steps, speed)
    t0s = [s['t0'] for s in steps]
    stretch, how = {}, []
    if lines:
        best = None
        for factor in sorted(SYNC_TEMPO, key=lambda f: (abs(f - 1), f)):
            bpm = round(MOOD_BPM[mood] * factor, 4)
            bar = 240. / bpm
            for n, _, offset in targets:                          # a grid that puts this target on a downbeat
                origin = round((t0s[n] + offset) % bar - bar, 4)
                holds, stretch, errors, how = _fit(targets, t0s, bar, origin)
                score = sum(abs(e) for e in errors) + .05 * sum(holds.values()) + .02 * sum(stretch.values()) + .2 * abs(factor - 1)
                if best is None or score < best[0] - 1e-9:        # ties keep the tempo nearest the mood's
                    best = (score, bpm, origin, holds, stretch, how)
        _, bpm, origin, holds, stretch, how = best
        shift = 0.
        for n, s in enumerate(steps):
            shift += holds.get(n, 0.)
            if holds.get(n) and n > 0:
                steps[n - 1]['dur'] = round(steps[n - 1]['dur'] + holds[n], 3)
            s['t0'] = round(s['t0'] + shift, 3)
            s['t1'] = round(s['t0'] + s['dur'], 3)
        added = shift
    else:                                                        # silent: everything on the grid
        bpm, bar = float(MOOD_BPM[mood]), 240. / MOOD_BPM[mood]
        origin = round(t0s[0] % bar - bar if t0s[0] % bar else 0., 4)   # the first step starts on bar 1
        beat, chapter_starts = bar / 4, {n for n, what, _ in targets if what.startswith('chapter')}
        stamps = {n for n, what, _ in targets if what.startswith('stamp')}
        t, end_before = t0s[0], steps[-1]['t1']
        for n, s in enumerate(steps):
            if n:
                if n in stamps:
                    t = _up(t + STAMP_AT / speed, origin, bar) - STAMP_AT / speed
                elif n in chapter_starts:
                    t = _up(t, origin, bar)
                else:
                    t = _up(t, origin, beat)
                steps[n - 1]['dur'] = round(t - steps[n - 1]['t0'], 3)
                steps[n - 1]['t1'] = round(t, 3)
            s['t0'] = round(t, 3)
            s['t1'] = round(t + s['dur'], 3)
            t = s['t0'] + s['dur']
        holds, added = {}, steps[-1]['t1'] - end_before
        how = ['picture on the grid'] * len(targets)
    by_id = {s['id']: s for s in steps}
    for line in lines:
        line['at'] = round(by_id[line['id']]['t0'] + voice_at, 3)
    bar = 240. / bpm
    stretch = {k: round(v, 4) for k, v in sorted(stretch.items())}
    sections, accents, report = [], [], []
    for (n, what, offset), way in zip(targets, how):
        t = steps[n]['t0'] + offset
        downbeat, error = downbeat_error(t, origin, bar, stretch)
        if what.startswith('chapter'):
            index = steps[n]['ci']
            sections.append([bar_at(downbeat, origin, bar, stretch)[0], 0 if index == 0 else 1 + (index - 1) % 3])
        else:
            accents.append(round(downbeat, 3))
        report.append({'what': what, 't': round(t, 3), 'how': way, 'planned_error_ms': round(error * 1000, 1)})
    sections[0][0] = 0
    sync = {'mood': mood, 'bpm': bpm, 'origin': origin, 'bar': round(bar, 4),
            'sections': [list(item) for item in dict((b, (b, i)) for b, i in sections).values()],
            'accents': accents, 'stretch': [[k, v] for k, v in stretch.items()], 'holds_s': round(added, 3),
            'music_holds_s': round(sum(stretch.values()), 3), 'targets': report}
    return round(total + added, 3), sync


# ------------------------------------------------------------------------------------------- karaoke and talking

def step_chars(entry, note, at):
    """voice.json `chars` of a line moved to film seconds, when they cover exactly this step's note; else None."""
    chars = (entry or {}).get('chars')
    if not note or not chars or ''.join(c[0] for c in chars) != note:
        return None
    return [[c, round(at + a, 3), round(at + b, 3)] for c, a, b in chars]


def _line_env(entry):
    """(rate, values) of a line's loudness envelope; from voice.json `env`, else bumps over its timed characters."""
    if entry.get('env'):
        return float(entry.get('env_hz', 100)), entry['env']
    rate, dur = 100., float(entry.get('dur') or 0)
    values = [0.] * (int(dur * rate) + 2)
    for c, a, b in entry.get('chars') or []:
        if not c.strip() or re.match(r'[，。！？；：、“”‘’（）《》—…·,.!?;:"\'()\-]', c):
            continue
        i0, i1 = int(a * rate), max(int(a * rate) + 1, int(b * rate))
        for i in range(i0, min(i1, len(values))):
            x = (i - i0 + .5) / (i1 - i0)
            values[i] = max(values[i], round(.8 * (1 - abs(2 * x - 1) ** 2), 2))
    return rate, values


def talk_envelope(placed, total, fps=TALK_FPS):
    """{"fps", "env"}: narration loudness 0..1 per frame over the whole film. `placed` = [(at, voice.json entry)].
    Each frame takes the loudest envelope value within its own 1/fps window, so a short syllable still opens the mouth."""
    frames = int(total * fps) + 1
    env = [0.] * frames
    for at, entry in placed:
        rate, values = _line_env(entry)
        if not values:
            continue
        first, last = max(0, int(at * fps)), min(frames - 1, int((at + len(values) / rate) * fps) + 1)
        for f in range(first, last + 1):
            a = int(max(0., (f - .5) / fps - at) * rate)
            b = int(max(0., (f + .5) / fps - at) * rate) + 1
            window = values[a:min(b, len(values))]
            if window:
                env[f] = max(env[f], max(window))
    return {'fps': fps, 'env': [round(v, 2) for v in env]}


# ------------------------------------------------------------------------------------------- check

def lint(spec):
    """Warnings for the sound fields: unknown sfx / ambience kinds, a speaker missing from cast, i18n coverage."""
    warnings = []
    cast = spec.get('cast') or {}
    for ci, ch in enumerate(spec.get('chapters') or []):
        where = f'chapter {ci + 1} ({ch.get("title", "")})'
        for sid, state in (ch.get('states') or {}).items():
            try:
                sfx_items(state.get('sfx'), f'{where} state {sid}')
                ambience_item(state.get('ambience'), f'{where} state {sid}')
            except SystemExit as e:
                warnings.append(str(e))
        for si, st in enumerate(ch.get('steps') or []):
            st = st if isinstance(st, dict) else {}
            try:
                sfx_items(st.get('sfx'), f'{where} step {si + 1}')
            except SystemExit as e:
                warnings.append(str(e))
            if st.get('speaker') and cast and st['speaker'] not in cast:
                warnings.append(f"{where} step {si + 1}: speaker {st['speaker']!r} is not in cast ({', '.join(cast)})")
            if st.get('tone') is not None and (not isinstance(st['tone'], str) or re.search(r'[()（）]', st['tone'])):
                warnings.append(f'{where} step {si + 1}: tone is a short description without brackets, e.g. "惊讶一点"')
    return warnings

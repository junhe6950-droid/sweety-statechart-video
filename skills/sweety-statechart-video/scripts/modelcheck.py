"""A small explicit-state checker for a chapter's chart, so the red path in a rule chapter is found, not hand-drawn.

The approach follows TLC as used by the /statechart skill (in miniature): start from the initial configuration, take
every transition from every reachable configuration, and check the rule in each one. A configuration is the set of
leaf states that are active at once (one per lane inside a "same time" region). Guards ([if ...]) are words for the
viewer, not logic, so every arrow is taken as possible; the checker answers "can this happen at all?".

A chapter of film.json (states {id: ...}, start, edges [{from, to}], regions {id, lanes [{id, states, start}]}, exit)
is turned into the checker's chart by chart_of().

Rules (chapter.rule):
  {"never": "stateId"}   breaks if a configuration holding that state can be reached (`breaks` is the same field)
Always checked:
  stuck                  a reachable configuration with no arrow out that is not the end
Result per chapter: {"rule": {"holds": bool, "path": [state ids], "edges": ["a>b", ...], "steps": n}, "stuck": [...],
                     "configurations": n, "transitions": n}
"""
from collections import deque


def _model(chart):
    states = [s['id'] for s in chart.get('states') or []]
    groups = {g['id']: g for g in chart.get('groups') or []}
    regs = chart.get('regions')
    lanes = {l['id']: l for l in (regs or {}).get('lanes', [])}
    parent = {}
    for g in groups.values():
        for s in g['states']:
            parent[s] = g['id']
    for l in lanes.values():
        for s in l['states']:
            parent[s] = l['id']
        parent[l['id']] = regs['id']
    T = chart.get('transitions') or []
    return states, groups, regs, lanes, parent, T


def _leaves(cid, groups, regs, lanes):
    if cid in groups:
        return set(groups[cid]['states'])
    if cid in lanes:
        return set(lanes[cid]['states'])
    if regs and cid == regs['id']:
        out = set()
        for l in lanes.values():
            out |= set(l['states'])
        return out
    return {cid}


def _enter(target, groups, regs, lanes, T):
    def initial_of(cid, members):
        c = groups.get(cid) or lanes.get(cid) or {}
        if c.get('initial'):
            return c['initial']
        for t in T:
            if t.get('from') == '*' and t.get('to') in members:
                return t['to']
        return sorted(members)[0] if members else None
    if target in groups:
        return {initial_of(target, set(groups[target]['states']))}
    if target in lanes:
        return {initial_of(target, set(lanes[target]['states']))}
    if regs and target == regs['id']:
        return {initial_of(l['id'], set(l['states'])) for l in lanes.values()}
    return {target}


def explore(chart, limit=20000):
    states, groups, regs, lanes, parent, T = _model(chart)
    members_inner = set(parent)
    tops = [t['to'] for t in T if t.get('from') == '*' and t.get('to') not in members_inner]
    if not tops and regs:  # a chart that is only a "same time" region starts in it
        tops = [regs['id']]
    if not tops:
        return None
    init = frozenset(_enter(tops[0], groups, regs, lanes, T))
    END = frozenset(['end'])
    prev = {init: None}
    q, edges_seen = deque([init]), 0
    stuck = []
    while q and len(prev) < limit:
        cfg = q.popleft()
        if cfg == END:
            continue
        out = 0
        for t in T:
            a, b = t.get('from'), t.get('to')
            if a == '*':
                continue
            src = _leaves(a, groups, regs, lanes) & cfg
            if not src:
                continue
            # what is exited: the source (all its leaves for a container); a step out of a lane leaves the whole region
            exited = _leaves(a, groups, regs, lanes) & cfg
            if b in ('end', '*'):
                lane = next((l for l in lanes.values() if any(s in l['states'] for s in exited)), None)
                if lane and regs and a not in (regs['id'],):
                    nxt = (cfg - exited)  # a lane finishing: that lane is done
                    nxt = nxt or END
                else:
                    nxt = END
            else:
                same_lane = any(b in l['states'] or b == l['id'] for l in lanes.values() if any(s in l['states'] for s in exited))
                if lanes and not same_lane and any(s in parent and parent.get(s) in lanes for s in exited) and parent.get(b) not in lanes:
                    exited = exited | (_leaves(regs['id'], groups, regs, lanes) & cfg)
                nxt = frozenset((cfg - exited) | _enter(b, groups, regs, lanes, T))
            nxt = frozenset(nxt)
            out += 1
            edges_seen += 1
            if nxt not in prev:
                prev[nxt] = (cfg, t)
                q.append(nxt)
        if out == 0:
            stuck.append(sorted(cfg))
    return {'init': init, 'prev': prev, 'stuck': stuck, 'configurations': len(prev), 'transitions': edges_seen}


def _trace(prev, goal):
    path = []
    cur = goal
    while prev[cur] is not None:
        cfg, t = prev[cur]
        path.append((cfg, t, cur))
        cur = cfg
    return list(reversed(path)), cur


def check_chart(chart):
    ex = explore(chart)
    if not ex:
        return None
    res = {'configurations': ex['configurations'], 'transitions': ex['transitions'], 'stuck': ex['stuck']}
    rule = chart.get('rule') or {}
    bad = rule.get('never') or rule.get('breaks')
    if bad:
        goal = None
        # breadth-first order: the first configuration holding the bad state is a shortest path to it
        order = list(ex['prev'].keys())
        for cfg in order:
            if bad in cfg:
                goal = cfg
                break
        if goal is None:
            res['rule'] = {'holds': True, 'never': bad}
        else:
            steps, start = _trace(ex['prev'], goal)
            path = sorted(start)[:1]
            edges = []
            for cfg, t, nxt in steps:
                edges.append(f"{t['from']}>{t['to'] if t['to'] not in ('*',) else 'end'}")
                new = sorted(nxt - cfg) or sorted(nxt)
                path.append(t['to'] if t['to'] in new else (new[0] if new else t['to']))
            res['rule'] = {'holds': False, 'never': bad, 'path': path, 'edges': edges, 'steps': len(edges)}
    return res


def chart_of(ch):
    """film.json chapter -> the checker's chart (states list, transitions with '*' for the start, regions)."""
    states = list((ch.get('states') or {}).keys())
    regs = ch.get('regions')
    lanes = []
    if regs:
        regs = {'id': regs.get('id') or 'together', 'lanes': [{'id': l['id'], 'states': l['states'], 'initial': l.get('start') or l['states'][0]} for l in regs['lanes']]}
        lanes = regs['lanes']
    inner = {s for l in lanes for s in l['states']}
    outer = [s for s in states if s not in inner]
    roots = [s for s in outer if not any(e['to'] == s and e['from'] != s for e in ch.get('edges') or [])]
    start = ch.get('start') or (regs['id'] if regs and not roots else (roots[0] if roots else (states[0] if states else None)))
    T = [{'from': '*', 'to': start}] if start else []
    T += [{'from': e['from'], 'to': e['to']} for e in ch.get('edges') or []]
    if ch.get('exit'):
        T.append({'from': ch['exit']['from'], 'to': 'end'})
    return {'states': [{'id': s} for s in states], 'transitions': T, 'regions': regs, 'rule': ch.get('rule')}


def check_film(spec):
    out = []
    for i, ch in enumerate(spec.get('chapters') or []):
        r = check_chart(chart_of(ch))
        out.append({'chapter': i + 1, 'title': ch.get('title'), **(r or {'error': 'no start'})})
    return out


def apply_found_paths(spec):
    """Give every rule that breaks the path the checker found (unless the film names its own path)."""
    for ch, r in zip(spec.get('chapters') or [], check_film(spec)):
        rule = ch.get('rule')
        if rule and r.get('rule') and not r['rule']['holds'] and not rule.get('path'):
            rule['path'] = r['rule']['path']
            rule['found'] = True
    return spec

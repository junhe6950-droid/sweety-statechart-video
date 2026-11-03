"""A small explicit-state checker for a chapter's chart, so the red path in a rule chapter is found, not hand-drawn.

The approach follows TLC as used by the /statechart skill (in miniature): start from the initial configuration, take
every transition from every reachable configuration, and check the rule in each one. A configuration is the set of
leaf states that are active at once (one per lane inside a "same time" region), plus, when the chapter uses them, the
values of its variables and what a history box remembers.

Two questions, two answers:
  possible    guards ([if ...]) are words for the viewer, every arrow can be taken: "can this happen at all?"
  reachable   arrows with a `when` expression are taken only when it is true over the chapter's `vars`, and `do`
              assignments change the vars: "does this happen under the logic?"
A chapter without vars / when / do has only the first answer (and behaves exactly as before the logic existed).

A chapter of film.json (states {id: ...}, start, edges [{from, to, when, do}], regions {id, lanes [{id, states,
start}], history}, vars, exit, rule) is turned into the checker's chart by chart_of().

Expressions (`when`, the right-hand side of `do`): numbers, true / false, 'strings', names from `vars`,
+ - * / %, == != < <= > >=, && || ! (or and / or / not), parentheses. Read by a small parser, never eval().
A `when` naming something that is not in `vars` stays words: the checker counts that arrow as always possible.

Rules (chapter.rule):
  {"never": "stateId"}   breaks if a configuration holding that state can be reached (`breaks` is the same field)
  {"fix": {"edge": "a>b", "when": "..."}}
                         the checker runs again with that arrow cut (or guarded by fix.when) and reports whether
                         the rule holds then: rule.fixed = {"holds": bool, "edge": ..., "path": [...]}
Always checked:
  stuck                  a reachable configuration with no arrow out that is not the end
History: regions.history true means re-entering the box (an arrow to the box id) resumes where each lane was.
The search stops at LIMIT configurations and says so (`capped`).

Result per chapter: {"rule": {"holds": bool, "path": [state ids], "edges": ["a>b", ...], "steps": n,
                     "possible": {...the same without the logic...}, "fixed": {...}}, "stuck": [...],
                     "configurations": n, "transitions": n, "reach": [state ids], "capped": bool,
                     "logic": bool, "possible": {"configurations", "reach", "capped"}, "dead": [edge ids],
                     "free": [edge ids], "eval_errors": [...]}
"""
import re
from collections import deque
from functools import lru_cache

LIMIT = 20000
END_RE = re.compile(r'end\d*')


# ------------------------------------------------------------------ expressions
class ExprError(ValueError):
    pass


_TOKEN = re.compile(r"""(?P<num>\d+(?:\.\d+)?|\.\d+)
                       |(?P<str>"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')
                       |(?P<op>===|!==|==|!=|<=|>=|&&|\|\||[-+*/%<>!()])
                       |(?P<name>[^\W\d][\w.]*)""", re.X)
_WORDS = {'and': '&&', 'or': '||', 'not': 'not'}
_CMP = ('==', '!=', '===', '!==', '<', '<=', '>', '>=')


def _tokens(text):
    out, pos, n = [], 0, len(text)
    while pos < n:
        if text[pos].isspace():
            pos += 1
            continue
        m = _TOKEN.match(text, pos)
        if not m:
            raise ExprError(f'cannot read {text[pos:pos + 12]!r}')
        kind = m.lastgroup
        val = m.group(kind)
        if kind == 'num':
            val = float(val) if '.' in val else int(val)
        elif kind == 'str':
            val = re.sub(r'\\(.)', r'\1', val[1:-1])
        elif kind == 'name' and val in _WORDS:
            kind, val = 'op', _WORDS[val]
        elif kind == 'name' and val in ('true', 'false', 'True', 'False'):
            kind, val = 'bool', val.lower() == 'true'
        out.append((kind, val))
        pos = m.end()
    return out


class _Parser:
    def __init__(self, toks):
        self.t, self.i = toks, 0

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else (None, None)

    def op(self, *ops):
        k, v = self.peek()
        if k == 'op' and v in ops:
            self.i += 1
            return v
        return None

    def expr(self):
        a = self.and_()
        while self.op('||'):
            a = ('or', a, self.and_())
        return a

    def and_(self):
        a = self.not_()
        while self.op('&&'):
            a = ('and', a, self.not_())
        return a

    def not_(self):
        if self.op('not'):
            return ('not', self.not_())
        return self.cmp()

    def cmp(self):
        a = self.add()
        o = self.op(*_CMP)
        if o:
            a = ('bin', {'===': '==', '!==': '!='}.get(o, o), a, self.add())
            if self.op(*_CMP):
                raise ExprError('write a chain of comparisons with && (a < b && b < c)')
        return a

    def add(self):
        a = self.mul()
        while True:
            o = self.op('+', '-')
            if not o:
                return a
            a = ('bin', o, a, self.mul())

    def mul(self):
        a = self.unary()
        while True:
            o = self.op('*', '/', '%')
            if not o:
                return a
            a = ('bin', o, a, self.unary())

    def unary(self):
        if self.op('!'):
            return ('not', self.unary())
        if self.op('-'):
            return ('neg', self.unary())
        if self.op('+'):
            return self.unary()
        return self.primary()

    def primary(self):
        k, v = self.peek()
        if k in ('num', 'str', 'bool'):
            self.i += 1
            return ('lit', v)
        if k == 'name':
            self.i += 1
            return ('var', v)
        if self.op('('):
            a = self.expr()
            if not self.op(')'):
                raise ExprError('a "(" is not closed')
            return a
        raise ExprError('expected a value' if k is None else f'unexpected {v!r}')


@lru_cache(maxsize=4096)
def parse(text):
    """expression text -> a small tree of tuples; raises ExprError when it is not an expression."""
    if not isinstance(text, str) or not text.strip():
        raise ExprError('empty expression')
    p = _Parser(_tokens(text))
    tree = p.expr()
    if p.i != len(p.t):
        raise ExprError(f'unexpected {p.t[p.i][1]!r}')
    return tree


def parses(text):
    try:
        parse(text)
        return True
    except ExprError:
        return False


def names(tree):
    """the variable names an expression reads."""
    if tree[0] == 'var':
        return {tree[1]}
    if tree[0] == 'lit':
        return set()
    out = set()
    for x in tree[1:]:
        if isinstance(x, tuple):
            out |= names(x)
    return out


def _num(v):
    if isinstance(v, float) and v.is_integer() and abs(v) < 2 ** 53:
        return int(v)
    return v


def _isnum(v):
    return isinstance(v, (int, float))


def evaluate(tree, env):
    """value of a parsed expression over env {name: value}; raises ExprError (unknown name, bad types, / by 0)."""
    k = tree[0]
    if k == 'lit':
        return tree[1]
    if k == 'var':
        if tree[1] not in env:
            raise ExprError(f'{tree[1]} is not in vars')
        return env[tree[1]]
    if k == 'not':
        return not evaluate(tree[1], env)
    if k == 'neg':
        v = evaluate(tree[1], env)
        if not _isnum(v):
            raise ExprError(f'-{v!r}: not a number')
        return -v
    if k == 'and':
        return bool(evaluate(tree[1], env)) and bool(evaluate(tree[2], env))
    if k == 'or':
        return bool(evaluate(tree[1], env)) or bool(evaluate(tree[2], env))
    op, a, b = tree[1], evaluate(tree[2], env), evaluate(tree[3], env)
    if op == '==':
        return a == b
    if op == '!=':
        return a != b
    if op in ('<', '<=', '>', '>='):
        if not ((_isnum(a) and _isnum(b)) or (isinstance(a, str) and isinstance(b, str))):
            raise ExprError(f'{a!r} {op} {b!r}: compare numbers with numbers, words with words')
        return {'<': a < b, '<=': a <= b, '>': a > b, '>=': a >= b}[op]
    if op == '+' and (isinstance(a, str) or isinstance(b, str)):
        return f'{a}{b}'
    if not (_isnum(a) and _isnum(b)):
        raise ExprError(f'{a!r} {op} {b!r}: not numbers')
    if op in ('/', '%') and b == 0:
        raise ExprError(f'{a!r} {op} 0')
    return _num({'+': a + b, '-': a - b, '*': a * b, '/': a / b if b else 0, '%': a % b if b else 0}[op])


def _value(v):
    """a `do` right-hand side: an expression string, or a plain number / boolean."""
    if isinstance(v, bool) or _isnum(v):
        return ('lit', v)
    return parse(v)


# ------------------------------------------------------------------ the model
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


def _enter(target, groups, regs, lanes, T, memory=None):
    """the leaves entered by an arrow to `target`; `memory` (lane -> state) is what a history box remembers."""
    memory = memory or {}

    def initial_of(cid, members):
        if cid in memory:
            return memory[cid]
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


def _is_end(b):
    return b == '*' or bool(END_RE.fullmatch(str(b)))


def _tid(t):
    return t.get('id') or f"{t['from']}>{t['to']}"


def _search(chart, logic=False, fix=None, limit=LIMIT):
    """Breadth-first search over configurations (states, values, history). logic: obey `when` / `do`.
    fix: {"edge": id, "when": text|None}: cut that arrow, or guard it with fix.when."""
    states, groups, regs, lanes, parent, T = _model(chart)
    members_inner = set(parent)
    tops = [t['to'] for t in T if t.get('from') == '*' and t.get('to') not in members_inner]
    if not tops and regs:  # a chart that is only a "same time" region starts in it
        tops = [regs['id']]
    if not tops:
        return None
    hist_on = bool(regs and regs.get('history'))
    box_leaves = _leaves(regs['id'], groups, regs, lanes) if regs else set()
    lane_of = {s: l for l, ln in lanes.items() for s in ln['states']}
    var0 = chart.get('vars') or {}
    vnames = sorted(var0) if logic else []
    vindex = {n: i for i, n in enumerate(vnames)}
    errors, free = [], []

    # the arrows, with their logic compiled once
    moves = []
    for t in T:
        if t.get('from') == '*':
            continue
        guards, sets = [], []
        tid = _tid(t)
        whens = [t.get('when')] if logic and t.get('when') else []
        if fix and tid == fix.get('edge'):
            if not fix.get('when'):
                continue                                     # the fix cuts this arrow
            whens.append(fix['when'])
        for w in whens:
            try:
                g = parse(w)
            except ExprError as e:
                errors.append(f'{tid}: when {w!r}: {e}')
                continue
            if names(g) - set(vindex):
                free.append(tid)                             # words, not logic: always possible
                continue
            guards.append(g)
        if logic and isinstance(t.get('do'), dict):
            for k, v in t['do'].items():
                try:
                    if k not in vindex:
                        raise ExprError(f'{k} is not in vars')
                    sets.append((vindex[k], _value(v)))
                except ExprError as e:
                    errors.append(f'{tid}: do {k}: {e}')
        moves.append((t, tid, guards, sets))

    def remember(hist):
        return {lane_of[s]: s for s in hist} if hist else {}

    init_states = frozenset(_enter(tops[0], groups, regs, lanes, T))
    init = (init_states, tuple(var0[n] for n in vnames) if logic else None, frozenset() if hist_on else None)
    END = frozenset(['end'])
    prev = {init: None}
    q, edges_seen = deque([init]), 0
    stuck, stuck_seen, taken = [], set(), set()
    while q and len(prev) < limit:
        key = q.popleft()
        cfg, vals, hist = key
        if cfg == END:
            continue
        env = dict(zip(vnames, vals)) if logic else None
        out = 0
        for t, tid, guards, sets in moves:
            a, b = t.get('from'), t.get('to')
            src = _leaves(a, groups, regs, lanes) & cfg
            if not src:
                continue
            try:
                if guards and not all(evaluate(g, env) for g in guards):
                    continue
                nvals = vals
                if sets:
                    nv = list(vals)
                    for i, tree in sets:
                        nv[i] = _num(evaluate(tree, env))
                    nvals = tuple(nv)
            except ExprError as e:
                msg = f'{tid}: {e}'
                if msg not in errors:
                    errors.append(msg)
                continue
            # what is exited: the source (all its leaves for a container); a step out of a lane leaves the whole region
            exited = _leaves(a, groups, regs, lanes) & cfg
            nhist = hist
            if _is_end(b):
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
                if hist_on and (cfg & box_leaves) and not (b in box_leaves or b in lanes):
                    nhist = frozenset(cfg & box_leaves)      # leaving the box: it remembers where each lane was
                nxt = frozenset((cfg - exited) | _enter(b, groups, regs, lanes, T, remember(nhist) if hist_on else None))
            nkey = (frozenset(nxt), nvals, nhist)
            out += 1
            edges_seen += 1
            taken.add(tid)
            if nkey not in prev:
                prev[nkey] = (key, t)
                q.append(nkey)
        if out == 0 and cfg not in stuck_seen:
            stuck_seen.add(cfg)
            stuck.append(sorted(cfg))
    reach = set()
    for k in prev:
        reach |= set(k[0])
    return {'init': init, 'prev': prev, 'stuck': stuck, 'configurations': len(prev), 'transitions': edges_seen,
            'capped': bool(q) and len(prev) >= limit, 'reach': reach, 'taken': taken, 'errors': errors,
            'free': sorted(set(free)), 'vnames': vnames}


def explore(chart, limit=LIMIT, logic=False):
    """The reachable configurations as sets of states (the shape callers have always had)."""
    r = _search(chart, logic=logic, limit=limit)
    if not r:
        return None
    prev = {}
    for key, back in r['prev'].items():
        if key[0] not in prev:
            prev[key[0]] = None if back is None else (back[0][0], back[1])
    return {'init': r['init'][0], 'prev': prev, 'stuck': r['stuck'], 'configurations': r['configurations'],
            'transitions': r['transitions'], 'capped': r['capped']}


def _trace(prev, goal):
    path = []
    cur = goal
    while prev[cur] is not None:
        cfg, t = prev[cur]
        path.append((cfg, t, cur))
        cur = cfg
    return list(reversed(path)), cur


def _rule_result(ex, bad):
    """the shortest path to a configuration holding `bad`, or holds."""
    goal = None
    # breadth-first order: the first configuration holding the bad state is a shortest path to it
    for key in ex['prev']:
        if bad in key[0]:
            goal = key
            break
    if goal is None:
        out = {'holds': True, 'never': bad}
        if ex['capped']:
            out['capped'] = True
        return out
    steps, start = _trace(ex['prev'], goal)
    path = sorted(start[0])[:1]
    edges = []
    values = [dict(zip(ex['vnames'], start[1]))] if ex['vnames'] else None
    for key, t, nkey in steps:
        cfg, nxt = key[0], nkey[0]
        edges.append(t.get('id') or f"{t['from']}>{t['to'] if t['to'] not in ('*',) else 'end'}")
        new = sorted(nxt - cfg) or sorted(nxt)
        path.append(t['to'] if t['to'] in new else (new[0] if new else t['to']))
        if values is not None:
            values.append(dict(zip(ex['vnames'], nkey[1])))
    out = {'holds': False, 'never': bad, 'path': path, 'edges': edges, 'steps': len(edges)}
    if values is not None:
        out['values'] = values
    return out


def has_logic(chart):
    rule = chart.get('rule') or {}
    fix = rule.get('fix') if isinstance(rule.get('fix'), dict) else {}
    return bool(chart.get('vars')) or bool(fix.get('when')) or any(
        t.get('when') or t.get('do') for t in chart.get('transitions') or [])


def check_chart(chart, limit=LIMIT):
    logic = has_logic(chart)
    ex = _search(chart, logic=logic, limit=limit)
    if not ex:
        return None
    res = {'configurations': ex['configurations'], 'transitions': ex['transitions'], 'stuck': ex['stuck'],
           'reach': sorted(ex['reach']), 'capped': ex['capped']}
    poss = ex
    if logic:
        poss = _search(chart, logic=False, limit=limit)
        res.update({'logic': True, 'possible': {'configurations': poss['configurations'], 'reach': sorted(poss['reach']),
                                                'capped': poss['capped']},
                    'dead': [_tid(t) for t in chart.get('transitions') or []
                             if t.get('from') != '*' and _tid(t) in poss['taken'] and _tid(t) not in ex['taken']],
                    'free': ex['free'], 'eval_errors': ex['errors']})
    rule = chart.get('rule') or {}
    bad = rule.get('never') or rule.get('breaks')
    if bad:
        res['rule'] = _rule_result(ex, bad)
        if logic:
            p = _rule_result(poss, bad)
            p.pop('never', None)
            res['rule']['possible'] = p
        fix = rule.get('fix')
        if isinstance(fix, dict) and fix.get('edge'):
            fx = _search(chart, logic=logic, fix=fix, limit=limit)
            r = _rule_result(fx, bad)
            r.pop('never', None)
            r['edge'] = fix['edge']
            if fix.get('when'):
                r['when'] = fix['when']
            res['rule']['fixed'] = r
    return res


def _edge_ids(edges):
    seen, out = {}, []
    for e in edges:
        base = f"{e['from']}>{e['to']}"
        seen[base] = seen.get(base, 0) + 1
        out.append(e.get('id') or (base if seen[base] == 1 else f'{base}#{seen[base]}'))
    return out


def chart_of(ch):
    """film.json chapter -> the checker's chart (states list, transitions with '*' for the start, regions)."""
    states = list((ch.get('states') or {}).keys())
    regs = ch.get('regions')
    lanes = []
    if regs:
        hist = bool(regs.get('history'))
        regs = {'id': regs.get('id') or 'together', 'lanes': [{'id': l['id'], 'states': l['states'], 'initial': l.get('start') or l['states'][0]} for l in regs['lanes']]}
        if hist:
            regs['history'] = True
        lanes = regs['lanes']
    inner = {s for l in lanes for s in l['states']}
    outer = [s for s in states if s not in inner]
    roots = [s for s in outer if not any(e['to'] == s and e['from'] != s for e in ch.get('edges') or [])]
    start = ch.get('start') or (regs['id'] if regs and not roots else (roots[0] if roots else (states[0] if states else None)))
    T = [{'from': '*', 'to': start}] if start else []
    edges = ch.get('edges') or []
    for e, eid in zip(edges, _edge_ids(edges)):
        t = {'from': e['from'], 'to': e['to'], 'id': eid}
        if e.get('when'):
            t['when'] = e['when']
        if e.get('do'):
            t['do'] = e['do']
        T.append(t)
    if ch.get('exit'):
        T.append({'from': ch['exit']['from'], 'to': 'end'})
    chart = {'states': [{'id': s} for s in states], 'transitions': T, 'regions': regs, 'rule': ch.get('rule')}
    if ch.get('vars'):
        chart['vars'] = ch['vars']
    return chart


def lint_chapter(ch):
    """(errors, warnings) about a chapter's vars / when / do / rule.fix / steps' "fix" before anything runs."""
    errors, warnings = [], []
    vars_ = ch.get('vars')
    if vars_ is not None and not isinstance(vars_, dict):
        errors.append('vars must be an object {name: initial value}')
        vars_ = {}
    vars_ = vars_ or {}
    for k, v in vars_.items():
        if not (isinstance(v, (bool, int, float, str))):
            errors.append(f'vars.{k}: give a number, true / false or a string (got {v!r})')
    edges = ch.get('edges') or []
    ids = _edge_ids(edges)
    for e, eid in zip(edges, ids):
        w = e.get('when')
        if w is not None:
            try:
                unknown = sorted(names(parse(w)) - set(vars_))
                if unknown:
                    warnings.append(f'arrow {eid}: when {w!r} uses {", ".join(unknown)}, which is not in vars, '
                                    f'so the checker counts this arrow as always possible')
            except (ExprError, TypeError) as ex:
                errors.append(f'arrow {eid}: when {w!r} is not an expression the checker can read: {ex}')
        d = e.get('do')
        if d is not None:
            if not isinstance(d, dict):
                errors.append(f'arrow {eid}: do must be an object {{name: expression}}')
                continue
            for k, v in d.items():
                if k not in vars_:
                    errors.append(f'arrow {eid}: do sets {k}, which has no initial value in vars')
                try:
                    unknown = sorted(names(_value(v)) - set(vars_))
                    if unknown:
                        errors.append(f'arrow {eid}: do {k} = {v!r} uses {", ".join(unknown)}, which is not in vars')
                except (ExprError, TypeError) as ex:
                    errors.append(f'arrow {eid}: do {k} = {v!r} is not an expression the checker can read: {ex}')
    rule = ch.get('rule') or {}
    fix = rule.get('fix')
    steps = [s for s in ch.get('steps') or [] if isinstance(s, dict)]
    marked = [i + 1 for i, s in enumerate(ch.get('steps') or []) if isinstance(s, dict) and s.get('fix')]
    if fix is not None:
        if not isinstance(fix, dict) or not fix.get('edge'):
            errors.append('rule.fix needs "edge": the arrow the fix cuts or guards, like "a>b"')
        else:
            if not (rule.get('never') or rule.get('breaks')):
                errors.append('rule.fix needs a rule "never" to fix')
            if fix['edge'] not in ids:
                errors.append(f'rule.fix.edge {fix["edge"]!r} matches no arrow (arrows: {", ".join(ids)})')
            if fix.get('when'):
                try:
                    parse(fix['when'])
                except (ExprError, TypeError) as ex:
                    errors.append(f'rule.fix.when {fix["when"]!r} is not an expression the checker can read: {ex}')
            if not marked and steps:
                warnings.append('rule.fix is set but no step has "fix": true, so the film never shows the fix')
    elif marked:
        errors.append(f'step {marked[0]} has "fix": true but the chapter has no rule.fix')
    return errors, warnings


def check_film(spec):
    out = []
    for i, ch in enumerate(spec.get('chapters') or []):
        r = check_chart(chart_of(ch))
        out.append({'chapter': i + 1, 'title': ch.get('title'), **(r or {'error': 'no start'})})
    return out


def apply_found_paths(spec):
    """Give every rule that breaks the path the checker found (unless the film names its own path), and every rule
    with a fix the result of the re-run (rule.fixed)."""
    for ch, r in zip(spec.get('chapters') or [], check_film(spec)):
        rule = ch.get('rule')
        if rule and r.get('rule') and not r['rule']['holds'] and not rule.get('path'):
            rule['path'] = r['rule']['path']
            rule['found'] = True
        if rule and r.get('rule') and r['rule'].get('fixed'):
            rule['fixed'] = r['rule']['fixed']
    return spec

#!/usr/bin/env python3
"""Tests for statechart_io.py (import / export) and modelcheck.py (logic, history, fixes, rules). Plain asserts.
usage: python3 test_statechart_io.py        (smoke_test.py runs it too; no browser, no voice needed)"""
import json
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import modelcheck as mc  # noqa: E402
import statechart_io as io  # noqa: E402

FIX = HERE / 'fixtures'
ART = FIX / 'statechart-art'
SKILL = HERE.parent


def checked(film, tmp):
    """scv.check on a film in a temporary job folder: (errors, warnings, printed result)."""
    import scv
    job = Path(tmp) / f'job{len(list(Path(tmp).iterdir()))}'
    job.mkdir()
    (job / 'film.json').write_text(json.dumps(film, ensure_ascii=False))
    (job / 'scenes.js').write_text('// none\n')
    res = scv.check(job, film, quiet=True)
    return res['errors'], res['warnings'], res


def edges_of(ch):
    return {(e['from'], e['to'], e.get('label', '')) for e in ch['edges']}


def chapter(**kw):
    ch = {'title': 't', 'states': {}, 'edges': [], 'steps': [{'go': 'start', 'note': '开始'}]}
    ch.update(kw)
    return ch


# ------------------------------------------------------------------ expressions
def test_expressions():
    ev = lambda s, env=None: mc.evaluate(mc.parse(s), env or {})  # noqa: E731
    assert ev('1 + 2 * 3') == 7 and ev('(1 + 2) * 3') == 9 and ev('7 % 3') == 1 and ev('6 / 2') == 3
    assert ev('stock > 0 && !closed', {'stock': 2, 'closed': False}) is True
    assert ev('a == 1 || b', {'a': 2, 'b': True}) is True
    assert ev("mode == 'night'", {'mode': 'night'}) is True
    assert ev('not done and n >= 3', {'done': False, 'n': 3}) is True
    assert ev('x === 2', {'x': 2}) is True and ev('-x', {'x': 2}) == -2
    assert mc.names(mc.parse('a + b > c && !d')) == {'a', 'b', 'c', 'd'}
    for bad in ('', 'a >', '1 < 2 < 3', 'a = 1', '(a', 'f(x)', '__import__("os")'):
        assert not mc.parses(bad), bad
    for bad, env in (('x / 0', {'x': 1}), ('y > 1', {}), ("'a' < 1", {})):
        try:
            ev(bad, env)
            raise AssertionError(bad)
        except mc.ExprError:
            pass


# ------------------------------------------------------------------ importers
def test_mermaid():
    film, warns = io.import_file(FIX / 'order.mmd')
    a, b = film['chapters']
    assert a['start'] == 'cart' and a['states']['cart']['label'] == '购物车'
    assert ('cart', 'paying', '下单') in edges_of(a)
    e = next(e for e in a['edges'] if e['from'] == 'cart')
    assert e['if'] == 'stock > 0' and e['when'] == 'stock > 0'
    assert next(e for e in a['edges'] if e['from'] == 'shipping')['if'] == '没人签收'
    assert ('refunded', 'end', '') in edges_of(a)
    assert a['exit']['from'] == 'refunded' and b['steps'][0]['go'] == 'entry'       # too tall with the box open: own chapter
    assert set(b['states']) == {'packing', 'onroad', 'arrived'} and ('arrived', 'end', '') in edges_of(b)
    assert not any('note' in s.lower() for s in film['chapters'][0]['states'])     # notes are not states
    assert any("card refunded 'refunded'" in w for w in warns)                        # over 6 characters
    with tempfile.TemporaryDirectory() as tmp:
        errors, _, _ = checked(film, tmp)
        assert not errors, errors


def test_mermaid_parallel():
    film, _ = io.import_file(FIX / 'shift.mmd')
    ch, = film['chapters']
    regs = ch['regions']
    assert regs['id'] == 'working' and regs['title'] == '营业中' and len(regs['lanes']) == 2
    assert [l['states'] for l in regs['lanes']] == [['kwait', 'kcook'], ['rgo', 'rwait']]
    assert ('off', 'working', '上班') in edges_of(ch) and ('working', 'off', '打烊') in edges_of(ch)
    gos = [g for s in ch['steps'] for g in ([s['go']] if isinstance(s.get('go'), str) else s.get('go') or [])]
    assert set(mc._edge_ids(ch['edges'])) <= set(gos)                                 # every arrow walked
    with tempfile.TemporaryDirectory() as tmp:
        errors, warnings, _ = checked(film, tmp)
        assert not errors and not [w for w in warnings if not w.startswith('length')], (errors, warnings)


def test_xstate_json():
    film, _ = io.import_file(FIX / 'checkout.xstate.json')
    ch, = film['chapters']
    assert ch['vars'] == {'stock': 2, 'paid': False}
    assert ch['regions']['id'] == 'payment' and ch['regions']['lanes'][0]['states'] == ['entering', 'authorizing', 'declined']
    by = {(e['from'], e['to'], e.get('label')): e for e in ch['edges']}
    assert by[('cart', 'payment', 'CHECKOUT')]['when'] == 'stock > 0' and by[('cart', 'payment', 'CHECKOUT')]['if'] == 'hasStock'
    assert by[('authorizing', 'end', 'onDone')]['do'] == {'stock': 'stock - 1', 'paid': True}
    assert by[('authorizing', 'end', 'onDone')]['style'] == 'async'
    assert by[('declined', 'entering', 'after 3s')]['style'] == 'timer'
    assert ('cart', 'end', 'EMPTY') in by and ('payment', 'cart', 'BACK') in by       # '#checkout.cancelled' is final
    with tempfile.TemporaryDirectory() as tmp:
        errors, warnings, _ = checked(film, tmp)
        assert not errors, errors


def test_xstate_ts():
    path = FIX / 'upload.machine.ts'
    text = path.read_text()
    want = {('failed', 'sending'): ('canRetry', 'retries < 3', {'retries': 'retries + 1'}),
            ('failed', 'broken'): ('gaveUp', 'retries >= 3', None)}
    if shutil.which('node'):
        film, _ = io.import_file(path)
        ch, = film['chapters']
        assert ch['vars'] == {'retries': 0, 'done': False}
        for e in ch['edges']:
            if (e['from'], e['to']) in want:
                assert (e.get('if'), e.get('when'), e.get('do')) == want[(e['from'], e['to'])], e
        assert {'from': 'broken', 'to': 'sending', 'label': 'PICK', 'do': {'retries': 0}} in ch['edges']
        with tempfile.TemporaryDirectory() as tmp:
            errors, _, res = checked(film, tmp)
            assert not errors, errors
            assert 'broken' in res['model'][0]['reach']
    # without node: the tolerant reader takes the same object literals
    cfg = io._JS(io.object_after(text, 'createMachine')).value()
    setup = io._JS(io.object_after(text, 'setup')).value()
    assert cfg['initial'] == 'idle' and cfg['states']['failed']['always'][0]['guard'] == 'canRetry'
    assert setup['guards']['canRetry']['__fn'].startswith('({ context }')
    m = io.from_xstate(cfg, setup, 'upload', io.file_consts(text))
    got = {(t['source'], t['target']): (t['guard'], t['when']) for t in m.trans}
    assert got[('failed', 'sending')] == ('canRetry', 'retries < 3'), got
    # a JS file is only ever run inside node's empty vm context
    if shutil.which('node'):
        r = io.node_eval('const m = createMachine({ id: typeof process.versions + "/" + typeof require("fs").readFileSync, states: {} });')
        assert r['machine']['id'] == 'undefined/undefined', r          # free names are inert markers, not node's
        r = io.node_eval('const m = createMachine({ id: this.constructor.constructor("return typeof process")() });')
        assert 'machine' not in r or r['machine'].get('id') != 'object', r
        r = io.node_eval('while (true) {}')
        assert 'error' in r


def test_scxml():
    film, _ = io.import_file(FIX / 'door.scxml')
    ch, = film['chapters']
    assert ch['vars'] == {'locked': False, 'tries': 0}
    assert ch['regions']['id'] == 'alarm' and ch['regions']['history'] is True
    by = {(e['from'], e['to'], e.get('label')): e for e in ch['edges']}
    assert by[('closed', 'alarm', 'force')]['when'] == 'locked && tries < 3'
    assert by[('closed', 'alarm', 'force')]['do'] == {'tries': 'tries + 1'}
    assert ('pause', 'alarm', 'resume') in by                                        # the arrow into the history
    assert by[('alarm', 'end', 'break')]['when'] == 'tries >= 2'
    with tempfile.TemporaryDirectory() as tmp:
        errors, warnings, res = checked(film, tmp)
        assert not errors, errors
        m = res['model'][0]
        assert m['logic'] and 'flash' in m['reach'] and m['configurations'] < 100


def test_plantuml():
    film, _ = io.import_file(FIX / 'phone.puml')
    ch, = film['chapters']
    assert ch['states']['Idle']['label'] == '待机' and ch['start'] == 'Idle'
    regs = ch['regions']
    assert regs['id'] == 'InCall' and regs['history'] is True and len(regs['lanes']) == 2
    assert ('Dialing', 'Idle', '挂断') in edges_of(ch)                               # -right-> is an arrow too
    assert ('Held', 'InCall', '切回') in edges_of(ch) and ('Held', 'end', '关机') in edges_of(ch)
    assert next(e for e in ch['edges'] if e['to'] == 'InCall' and e['from'] == 'Dialing')['if'] == '对方在线'
    with tempfile.TemporaryDirectory() as tmp:
        errors, _, _ = checked(film, tmp)
        assert not errors, errors


# ------------------------------------------------------------------ exports
def test_round_trip_mermaid():
    for name in ('shift.mmd', 'phone.puml'):
        src = (FIX / name).read_text()
        before = io.parse_diagram(src, 'mermaid' if name.endswith('.mmd') else 'plantuml')
        film, _ = io.to_film(io.parse_diagram(src, 'mermaid' if name.endswith('.mmd') else 'plantuml'))
        text = io.export_film(film, 'mermaid')
        after = io.parse_diagram(text, 'mermaid')

        def shape(m):
            atoms = {n['id']: n['label'] for n in m.nodes.values() if n['type'] == 'atomic'}
            trans = {(t['source'], '[*]' if m.nodes[t['target']]['type'] == 'final' else t['target'], t['event'], t['guard'])
                     for t in m.trans if m.nodes[t['target']]['type'] != 'history'}
            return atoms, trans
        io.normalize(before)
        assert shape(before) == shape(after), (name, shape(before), shape(after), text)
        assert 'stateDiagram-v2' in text


def test_exports_parse_back():
    films = [io.import_file(FIX / n)[0] for n in ('door.scxml', 'checkout.xstate.json', 'shift.mmd')]
    films.append(json.loads((SKILL / 'examples/takeout/film.json').read_text()))
    for film in films:
        ids = {s for ch in film['chapters'] for s in ch['states']}
        x = json.loads(io.export_film(film, 'xstate'))
        found = set()

        def walk(node):
            for k, v in (node.get('states') or {}).items():
                found.add(k)
                walk(v)
        walk(x)
        assert all(any(f == i or f.endswith('_' + i) for f in found) for i in ids), (ids - found)
        root = ET.fromstring(io.export_film(film, 'scxml'))
        sx = {el.get('id') for el in root.iter() if el.get('id')}
        assert all(any(f == i or f.endswith('_' + i) for f in sx) for i in ids)
        for to in ('xstate', 'scxml', 'mermaid'):          # and they read back in as films that check
            with tempfile.TemporaryDirectory() as tmp:
                p = Path(tmp) / {'xstate': 'm.json', 'scxml': 'm.scxml', 'mermaid': 'm.mmd'}[to]
                p.write_text(io.export_film(film, to))
                again, _ = io.import_file(p)
                errors, _, _ = checked(again, tmp)
                assert not errors, (to, errors)
    # one chapter with logic keeps it through XState and SCXML
    film, _ = io.import_file(FIX / 'door.scxml')
    for to, name in (('xstate', 'm.json'), ('scxml', 'm.scxml')):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / name
            p.write_text(io.export_film(film, to))
            again, _ = io.import_file(p)
            a, b = film['chapters'][0], again['chapters'][0]
            key = lambda e: (e['from'], e['to'], e.get('label'), e.get('when'), json.dumps(e.get('do'), sort_keys=True))  # noqa: E731
            assert sorted(map(key, a['edges'])) == sorted(map(key, b['edges'])), (to, a['edges'], b['edges'])
            assert b['vars'] == a['vars'] and b['regions'].get('history') is True


# ------------------------------------------------------------------ the checker
def shop(**extra):
    """a little shop: buying takes stock, oversold must never happen."""
    ch = chapter(states={'open': {'label': '开门'}, 'sold': {'label': '卖出'}, 'oversold': {'label': '超卖'}},
                 start='open', vars={'stock': 2},
                 edges=[{'from': 'open', 'to': 'sold', 'label': '买', 'when': 'stock > 0', 'do': {'stock': 'stock - 1'}},
                        {'from': 'sold', 'to': 'open', 'label': '下一位'},
                        {'from': 'open', 'to': 'oversold', 'label': '硬卖', 'when': 'stock < 0'}],
                 rule={'never': 'oversold'})
    ch.update(extra)
    return ch


def test_logic():
    r = mc.check_chart(mc.chart_of(shop()))
    assert r['logic'] and r['rule']['holds'] is True                    # under the logic it never happens
    assert r['rule']['possible']['holds'] is False                      # but every arrow could be taken: it can
    assert r['rule']['possible']['path'] == ['open', 'oversold']
    assert 'oversold' in r['possible']['reach'] and 'oversold' not in r['reach']
    assert r['dead'] == ['open>oversold'] and r['configurations'] == 5    # (open|sold) x stock 2,1,0 - (sold,2)
    film = {'title': 'x', 'voice': 'none', 'chapters': [shop()]}
    with tempfile.TemporaryDirectory() as tmp:
        errors, warnings, _ = checked(film, tmp)
        assert not errors, errors
        assert any('never fires under the logic' in w for w in warnings)
        assert any('possible, but under the logic' in w for w in warnings)
        assert any('holds under the logic' in w for w in warnings)
    # an unknown name keeps the guard as words; a bad expression and a do without vars are errors
    ch = shop(edges=shop()['edges'] + [{'from': 'sold', 'to': 'sold', 'when': 'mood > 1'}])
    with tempfile.TemporaryDirectory() as tmp:
        errors, warnings, _ = checked({'title': 'x', 'voice': 'none', 'chapters': [ch]}, tmp)
        assert any('mood' in w and 'always possible' in w for w in warnings), warnings
    bad = shop(edges=[{'from': 'open', 'to': 'sold', 'when': 'stock >'}, {'from': 'sold', 'to': 'open', 'do': {'cash': 'cash + 1'}}])
    errs, _ = mc.lint_chapter(bad)
    assert any('not an expression' in e for e in errs) and any('cash' in e for e in errs), errs
    # a counter that keeps growing stops at the cap, and says so
    grow = chapter(states={'a': {}}, start='a', vars={'n': 0}, edges=[{'from': 'a', 'to': 'a', 'do': {'n': 'n + 1'}}])
    r = mc.check_chart(mc.chart_of(grow), limit=500)
    assert r['capped'] and r['configurations'] == 500


def test_history():
    def box(history):
        regs = {'id': 'job', 'lanes': [{'id': 'steps', 'states': ['s1', 's2'], 'start': 's1'}]}
        if history:
            regs['history'] = True
        return chapter(states={'s1': {}, 's2': {}, 'pause': {}}, start='job', regions=regs, vars={'paused': False},
                       edges=[{'from': 's1', 'to': 's2', 'when': '!paused'},
                              {'from': 'job', 'to': 'pause', 'do': {'paused': True}}, {'from': 'pause', 'to': 'job'}],
                       rules=[{'id': 'BackAtStep2', 'never': 's2 && paused'}])
    # step 2 after a pause: only a box that remembers can put you there (the arrow s1>s2 is shut after a pause)
    assert mc.check_chart(mc.chart_of(box(False)))['rules'][0]['holds'] is True
    again = mc.check_chart(mc.chart_of(box(True)))['rules'][0]
    assert again['holds'] is False and again['path'] == ['s1', 's2', 'pause', 's2'], again
    # without logic too: a history box re-entered lands on the remembered card
    plain = {'states': [{'id': s} for s in ('s1', 's2', 'pause')], 'regions': {'id': 'job', 'history': True, 'lanes': [
        {'id': 'steps', 'states': ['s1', 's2'], 'initial': 's1'}]}, 'transitions': [
        {'from': '*', 'to': 'job'}, {'from': 's1', 'to': 's2'}, {'from': 'job', 'to': 'pause'}, {'from': 'pause', 'to': 'job'}]}
    ex = mc._search(plain)
    assert ((frozenset({'s2'}), None, frozenset({'s2'})) in ex['prev']) and ex['configurations'] == 7   # + what it remembers
    plain['regions'].pop('history')
    assert mc._search(plain)['configurations'] == 3


def test_fix():
    takeout = json.loads((SKILL / 'examples/takeout/film.json').read_text())
    ch = takeout['chapters'][3]
    ch['rule']['fix'] = {'edge': 'soggy>served', 'if': '有人检查', 'stamp': '修好了'}
    ch['steps'].insert(-1, {'fix': True, 'note': '加一道出餐检查'})
    r = mc.check_film(takeout)[3]['rule']
    assert r['holds'] is False and r['fixed'] == {'holds': True, 'edge': 'soggy>served'}
    spec = mc.apply_found_paths(json.loads(json.dumps(takeout)))
    assert spec['chapters'][3]['rule']['fixed']['holds'] is True and spec['chapters'][3]['rule']['found']
    takeout['voice'] = 'none'
    with tempfile.TemporaryDirectory() as tmp:
        errors, _, _ = checked(takeout, tmp)
        assert not errors, errors
    # a fix guarded by fix.when: it holds only when the guard can never be true
    ch['vars'] = {'checked': True}
    ch['rule']['fix'] = {'edge': 'soggy>served', 'when': '!checked'}
    assert mc.check_film(takeout)[3]['rule']['fixed']['holds'] is True
    ch['rule']['fix'] = {'edge': 'soggy>served', 'when': 'checked'}
    fixed = mc.check_film(takeout)[3]['rule']['fixed']
    assert fixed['holds'] is False and fixed['path'][-1] == 'served'
    with tempfile.TemporaryDirectory() as tmp:
        errors, _, _ = checked(takeout, tmp)
        assert any('the fix does not hold' in e for e in errors), errors
    # a fix step without a fix, a fix on an unknown arrow
    ch.pop('vars')
    ch['rule'] = {'never': 'served'}
    errs, _ = mc.lint_chapter(ch)
    assert any('"fix": true but the chapter has no rule.fix' in e for e in errs), errs
    ch['rule']['fix'] = {'edge': 'nowhere>served'}
    errs, _ = mc.lint_chapter(ch)
    assert any('matches no arrow' in e for e in errs), errs


def test_rules():
    ch = shop(rule=None, rules=[
        {'id': 'NoOversell', 'never': 'oversold', 'text': '绝不超卖'},
        {'id': 'StockNeverNegative', 'always': 'stock >= 0', 'text': '库存不为负'},
        {'id': 'Busy', 'never': 'sold && stock == 0', 'text': '卖空了'},
        {'stuck': False, 'text': '不会卡住'},
        {'id': 'Typed', 'text': '类型对', 'reported': {'holds': True, 'by': 'TLC'}}])
    r = mc.check_chart(mc.chart_of(ch))
    res = r['rules']
    assert [x['holds'] for x in res] == [True, True, False, False, True], res
    assert res[2]['path'] == ['open', 'sold', 'open', 'sold'] and res[2]['steps'] == 3
    assert res[2]['values'][-1] == {'stock': 0}
    assert res[3]['path'][-1] == 'open' and res[3]['values'][-1] == {'stock': 0}      # sold out: open has no way on
    assert res[3]['possible']['holds'] is True                                         # with every arrow possible it never sticks
    assert res[0]['possible']['holds'] is False and res[4]['source'] == 'report'
    assert r['checked'] == {'states': r['configurations'], 'steps': r['transitions']}
    spec = mc.apply_found_paths({'chapters': [json.loads(json.dumps(ch))]})
    assert spec['chapters'][0]['rules'][2]['result']['holds'] is False and spec['chapters'][0]['checked']['states'] == 5
    # stuck: a lone card with no way out is an ending; a combination with no way out is stuck
    lanes = chapter(states={'a': {}, 'b': {}, 'x': {}, 'y': {}}, regions={'id': 'both', 'lanes': [
        {'id': 'l1', 'states': ['a', 'b'], 'start': 'a'}, {'id': 'l2', 'states': ['x', 'y'], 'start': 'x'}]},
        edges=[{'from': 'a', 'to': 'b'}, {'from': 'x', 'to': 'y'}], rules=[{'stuck': False}])
    stuck = mc.check_chart(mc.chart_of(lanes))['rules'][0]
    assert stuck['holds'] is False and stuck['steps'] == 2
    # trace steps name a rule; unknown names are errors
    ch['steps'] = [{'go': 'start', 'note': '开始'}, {'trace': 'Busy', 'note': '红线'}, {'trace': 3, 'note': '同一条'}]
    assert not mc.lint_chapter(ch)[0]
    ch['steps'].append({'trace': 'Nope', 'note': 'x'})
    assert any('names no rule' in e for e in mc.lint_chapter(ch)[0])
    errs, _ = mc.lint_chapter(chapter(states={'a': {}}, rules=[{'never': 'b > '}, {'always': 'zz'}, {'stuck': True}, {}]))
    assert len(errs) == 4, errs
    # a state id inside an expression is true while that state is active; a when may name a state of another lane
    guard = chapter(states={'a': {}, 'b': {}, 'x': {}, 'y': {}}, regions={'id': 'both', 'lanes': [
        {'id': 'l1', 'states': ['a', 'b'], 'start': 'a'}, {'id': 'l2', 'states': ['x', 'y'], 'start': 'x'}]},
        edges=[{'from': 'a', 'to': 'b', 'when': 'y'}, {'from': 'x', 'to': 'y', 'when': '!b'}],
        rules=[{'never': 'b && x'}, {'always': 'a || y'}])
    r = mc.check_chart(mc.chart_of(guard))
    assert [x['holds'] for x in r['rules']] == [True, True] and r['configurations'] == 3


def test_statechart_art():
    """the six charts from kevintngo/statechart-art (the /statechart skill's output) import, check and keep TLC's word"""
    cases = {
        ART / 'business/order/chart': (1, None, {'TypeOK': True, 'PaidForEveryDrink': True, 'NoDeadlock': True}),
        ART / 'business/day': (1, 'down', {'OpenOnlyWhenReady': True, 'NoDeadlock': True}),
        ART / 'business/counter/chart/chart.mmd': (1, 'right', {'NoDrinkWhileCooking': True, 'NoDeadlock': True}),
        ART / 'business/bug/chart': (1, None, {'NeverServeOldPearls': False, 'NoDeadlock': True}),
        ART / 'one-becomes-two/model': (4, 'down', {'NeverCopiesDamagedDNA': False, 'SeparatesOnlyWhenAllCaught': False,
                                                    'EachDaughterGetsOneOfEach': False, 'DaughtersCarryNoMutation': False,
                                                    'CopiesBeforeDividing': True}),
        ART / 'catch/model/chart': (4, 'right', {'HeadsForTowerOnlyWhenGo': False, 'TowerNeverHit': False,
                                                 'ArmsCloseOnlyOnBooster': True}),
    }
    for src, (n, flow, verdicts) in cases.items():
        film, _ = io.import_file(src)
        assert len(film['chapters']) == n and film.get('flow') == flow, (src, len(film['chapters']), film.get('flow'))
        assert not any(s.startswith('lg') for ch in film['chapters'] for s in ch['states'])        # the Legend is gone
        spec = mc.apply_found_paths(json.loads(json.dumps(film)))
        got = {r['id']: r['result']['holds'] for ch in spec['chapters'] for r in ch.get('rules') or []}
        for k, v in verdicts.items():
            assert got[k] is v, (src, k, got)
        assert all(ch.get('checked') for ch in spec['chapters'] if ch.get('rules'))
        with tempfile.TemporaryDirectory() as tmp:
            errors, warnings, _ = checked(film, tmp)
            assert not errors, (src, errors)
            assert not any('the report says' in w for w in warnings), (src, warnings)
    film, _ = io.import_file(ART / 'business/bug/chart')
    ch = film['chapters'][0]
    rule = next(r for r in ch['rules'] if r['id'] == 'NeverServeOldPearls')
    assert rule['never'] == 's5' and rule['text'] == 'never serve old pearls'
    assert rule['reported']['steps'] == 6 and rule['reported']['edges'][1] == 's1>s1'           # TLC counts the stutter
    assert ch['reported'] == {'by': 'TLC', 'states': 36, 'steps': 90}
    assert {'trace': 'NeverServeOldPearls', 'note': io.TODO_NOTE} in ch['steps']
    assert ch['states']['s5']['kind'] == 'error'                                                # class s5 breaks
    film, _ = io.import_file(ART / 'business/counter/chart/chart.mmd')
    by = {(e['from'], e['to']): e for e in film['chapters'][0]['edges']}
    assert by[('s0', 's1')]['when'] == '!s5' and by[('s4', 's5')]['when'] == 's0'               # guards on the other lane
    spec = mc.check_film(film)[0]
    assert (spec['configurations'], spec['transitions']) == (7, 11)                              # TLC: 7 states, 11 steps
    m = io.parse_diagram((ART / 'catch/model/chart/chart.mmd').read_text(), 'mermaid')
    t = next(t for t in m.trans if t['source'] == 's19')
    assert t['when'] == '(s8 || s10) && !(s14 || s13)', t['when']


def test_cli():
    scv = str(HERE / 'scv.py')
    with tempfile.TemporaryDirectory() as tmp:
        job = Path(tmp) / 'shift'
        r = subprocess.run([sys.executable, scv, 'import', str(FIX / 'shift.mmd'), str(job), '--title', '两边同时'], capture_output=True, text=True)
        assert r.returncode == 0, r.stdout + r.stderr
        assert (job / 'scenes.js').exists() and json.loads((job / 'film.json').read_text())['title'] == '两边同时'
        r = subprocess.run([sys.executable, scv, 'import', str(FIX / 'shift.mmd'), str(job)], capture_output=True, text=True)
        assert r.returncode != 0 and 'exists' in (r.stdout + r.stderr)
        r = subprocess.run([sys.executable, scv, 'check', str(job)], capture_output=True, text=True)
        assert r.returncode == 0, r.stdout + r.stderr
        out = Path(tmp) / 'shift.scxml'
        r = subprocess.run([sys.executable, scv, 'export', str(job), '--to', 'scxml', '-o', str(out)], capture_output=True, text=True)
        assert r.returncode == 0 and ET.parse(out).getroot().tag.endswith('scxml')
        r = subprocess.run([sys.executable, scv, 'export', str(job), '--to', 'mermaid'], capture_output=True, text=True)
        assert r.stdout.lstrip('-\ntile: 两边同时').startswith('stateDiagram-v2') or 'stateDiagram-v2' in r.stdout


def test_examples_unchanged():
    """films without the new fields: the checker's answers and the page's rule paths are what they always were"""
    spec = json.loads((SKILL / 'examples/takeout/film.json').read_text())
    res = mc.check_film(spec)
    assert res[3]['rule'] == {'holds': False, 'never': 'served', 'path': ['fresh', 'warm', 'cool', 'soggy', 'served'],
                              'edges': ['fresh>warm', 'warm>cool', 'cool>soggy', 'soggy>served'], 'steps': 4}
    assert all('logic' not in r and 'rules' not in r for r in res)
    page = mc.apply_found_paths(json.loads(json.dumps(spec)))
    assert page['chapters'][3]['rule'] == {'never': 'served', 'stamp': '规则被打破', 'path': ['fresh', 'warm', 'cool', 'soggy', 'served'], 'found': True}
    assert all('checked' not in ch for ch in page['chapters'])
    msg = mc.check_film(json.loads((SKILL / 'examples/message/film.json').read_text()))
    assert msg[2]['rule']['path'] == ['out', 'wait', 'retry', 'twice']


def test_schema():
    schema = json.loads((SKILL / 'references/film.schema.json').read_text())
    assert schema['$schema'] == 'https://json-schema.org/draft/2020-12/schema'
    try:
        import jsonschema
    except ImportError:
        assert io.schema_problems({'chapters': 'nonsense'}) == []          # no jsonschema: check skips it silently
        return
    v = jsonschema.Draft202012Validator(schema)
    films = [json.loads((SKILL / f'examples/{n}/film.json').read_text()) for n in ('intro', 'takeout', 'message')]
    films += [io.import_file(FIX / n)[0] for n in ('order.mmd', 'checkout.xstate.json', 'door.scxml', 'phone.puml')]
    films += [io.import_file(ART / 'business/bug/chart')[0], mc.apply_found_paths(io.import_file(ART / 'catch/model/chart')[0])]
    for f in films:
        errs = list(v.iter_errors(f))
        assert not errs, [e.message for e in errs][:5]
    assert list(v.iter_errors({'title': 'x', 'chapters': [{'states': {'a': {'pin': 3}}, 'steps': []}]}))
    assert io.schema_problems({'title': 1, 'chapters': []})


def main():
    tests = [(k, f) for k, f in globals().items() if k.startswith('test_') and callable(f)]
    for name, fn in tests:
        fn()
        print('ok', name)
    print(f'PASS: {len(tests)} statechart io / checker tests')


if __name__ == '__main__':
    main()

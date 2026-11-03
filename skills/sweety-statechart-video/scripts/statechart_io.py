#!/usr/bin/env python3
"""Statecharts in and out: turn an existing state machine into a film.json skeleton, and a film back into code.

usage (through scv.py):
  scv.py import SRC JOB [--format xstate|mermaid|scxml|plantuml] [--title T] [--force]
  scv.py export JOB --to mermaid|xstate|scxml [-o FILE]

Reads XState v5 (a .json config, or a .js / .ts file with createMachine({...}) or setup({...}).createMachine({...})),
Mermaid stateDiagram / stateDiagram-v2 (also the first such block in a .md file), SCXML and PlantUML state diagrams.
Every format becomes one small tree (Machine): nodes with children, an initial child and history; transitions with an
event, a guard in words (`if`), a guard as logic (`when`) and assignments (`do`).

The tree is laid out as chapters the engine can draw: the top level is chapter 1; one compound state with plain
children becomes a parent-state box (`regions` with one lane), a parallel state becomes lanes; deeper nesting, or more
than CHAPTER_MAX cards, goes to further chapters joined by `exit` + "go": "entry". Final states become arrows to `end`.
Steps walk every arrow at least once, with TODO captions for the agent to write.

JavaScript is evaluated only by node's vm module in an empty context (no require, no process, no eval, 2 s timeout);
without node, a tolerant JSON5-like reader takes the createMachine({...}) literal. Python's eval is never used.
"""
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections import deque
from pathlib import Path

import modelcheck

SKILL = Path(__file__).resolve().parent.parent
SCHEMA = SKILL / 'references/film.schema.json'
FORMATS = ('xstate', 'mermaid', 'scxml', 'plantuml')
EXPORTS = ('mermaid', 'xstate', 'scxml')
CARD_MAX, ARROW_MAX, CHAPTER_MAX = 6, 8, 8           # the skill's rules: card 2-6 characters, arrow 8, ~8 cards a chapter
TITLE_MAX = 8                                        # a chapter title: 4-7 characters read best
TODO_NOTE = 'TODO: 一句字幕（二十四字以内）'
TODO_SUB = 'TODO: 一句副标题'
PINS = ['pink', 'straw', 'orange', 'green', 'blue', 'violet', 'teal']
TINTS = ['mint', 'sky', 'rose', 'straw', 'lilac']
ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
ROOT = '#root'
RESERVED = {'end', 'start', 'entry', 'exit', '*'}
SCXML_NS = 'http://www.w3.org/2005/07/scxml'
SCV_NS = 'urn:sweety-statechart-video:film'
ERRORISH = re.compile(r'err|fail|reject|cancel|declin|timeout|denied|错|失败|拒|取消|超时', re.I)
WAITISH = re.compile(r'wait|pending|loading|等', re.I)


class ImportError_(SystemExit):
    pass


# ------------------------------------------------------------------ the tree every format is read into
class Machine:
    """nodes {id: {id, label, tag, type, children, initial, parent, history}}; trans [{source, target, event, ...}].
    type: compound | parallel | atomic | final | history | choice. The root is a compound (or parallel) node ROOT."""

    def __init__(self, name=''):
        self.name = name or ''
        self.nodes = {}
        self.trans = []
        self.vars = {}
        self.warnings = []
        self.idmap = {}
        self.marks = {}                                      # Mermaid classes: {id: {'breaks', 'bugPath'}}
        self.direction = None                                # TB / LR from the diagram (or its layout.mmd)
        self.report = None                                   # a /statechart report.md, read by parse_report()
        self.root = self._new(ROOT, None, 'compound', label=self.name)

    def _new(self, nid, parent, type='atomic', label=None, tag=None):
        n = {'id': nid, 'label': label if label not in (None, '') else nid, 'tag': tag, 'type': type, 'children': [],
             'initial': None, 'parent': parent, 'history': None}
        self.nodes[nid] = n
        if parent is not None:
            self.nodes[parent]['children'].append(nid)
        return n

    def clean(self, raw):
        """a source name -> a film id: word characters and '-', unique, never a reserved word (end, start, exit...)."""
        raw = str(raw)
        if raw in self.idmap:
            return self.idmap[raw]
        nid = re.sub(r'[^\w-]+', '_', raw).strip('_') or 's'
        if nid in RESERVED or re.fullmatch(r'end\d+', nid):
            nid += '_'
        base, n = nid, 2
        while nid in self.nodes or nid in self.idmap.values():
            nid = f'{base}_{n}'
            n += 1
        self.idmap[raw] = nid
        return nid

    def fresh(self, base):
        """a new id for something the source does not name (a concurrent region, a final dot)."""
        nid, n = re.sub(r'[^\w-]+', '_', base).strip('_') or 's', 2
        stem = nid
        while nid in self.nodes or nid in self.idmap.values() or nid in RESERVED:
            nid = f'{stem}_{n}'
            n += 1
        return nid

    def state(self, raw, parent=ROOT, type=None, label=None):
        """get or create by source name (the first mention decides the parent)."""
        nid = self.clean(raw)
        n = self.nodes.get(nid)
        if n is None:
            n = self._new(nid, parent, type or 'atomic', label if label is not None else str(raw))
        else:
            if type and n['type'] == 'atomic':
                n['type'] = type
            if label:
                n['label'] = label
        return n

    def move(self, nid, parent):
        old = self.nodes[nid]['parent']
        if old is not None and nid in self.nodes[old]['children']:
            self.nodes[old]['children'].remove(nid)
        self.nodes[nid]['parent'] = parent
        self.nodes[parent]['children'].append(nid)

    def add(self, source, target, event='', guard=None, when=None, do=None, style=None):
        t = {'source': source, 'target': target, 'event': event or '', 'guard': guard or None, 'when': when or None,
             'do': do or None, 'style': style}
        self.trans.append(t)
        return t

    def ancestors(self, nid):
        out = []
        while nid is not None:
            out.append(nid)
            nid = self.nodes[nid]['parent']
        return out

    def inside(self, nid, anc):
        return anc in self.ancestors(nid)

    def members(self, nid):
        return [c for c in self.nodes[nid]['children'] if self.nodes[c]['type'] != 'history']

    def warn(self, msg):
        if msg not in self.warnings:
            self.warnings.append(msg)


def _when_of(text, known):
    """a guard's text as a `when` expression, when it reads as one (a bare unknown name stays words)."""
    if not isinstance(text, str) or not text.strip():
        return None
    try:
        tree = modelcheck.parse(text)
    except modelcheck.ExprError:
        return None
    if tree[0] == 'var' and tree[1] not in known:
        return None
    return ' '.join(text.split())


def _scalar(v):
    return isinstance(v, (bool, int, float, str)) and not (isinstance(v, float) and not math.isfinite(v))


def _split_label(text):
    """'event [guard] / action' -> (event, guard)."""
    text = re.sub(r'<br\s*/?>', ' ', text or '').strip()
    m = re.match(r'^(?P<ev>[^\[]*?)\s*(?:\[(?P<g>.*)\])?\s*(?:/\s*(?P<act>.*))?$', text, re.S)
    if not m:
        return text, None
    return (m.group('ev') or '').strip(), (m.group('g') or '').strip() or None


# ------------------------------------------------------------------ Mermaid and PlantUML
_ARROW_M = re.compile(r'^(?P<a>\[\*\]|[\w.-]+)(?::::[\w-]+)?\s*-->\s*(?P<b>\[\*\]|[\w.-]+)(?::::[\w-]+)?\s*(?::\s*(?P<label>.*))?$')
_ARROW_P = re.compile(r'^(?P<a>\[\*\]|\[H\*?\]|[\w.]+(?:\[H\*?\])?)\s*(?P<arrow><?-[^\s:>]*>?)\s*'
                      r'(?P<b>\[\*\]|\[H\*?\]|[\w.]+(?:\[H\*?\])?)\s*(?::\s*(?P<label>.*))?$')


def parse_diagram(text, dialect):
    """Mermaid stateDiagram(-v2) or PlantUML: [*], A --> B : event [guard], state "label" as id, state X { ... },
    concurrency separators (-- in both, || in PlantUML), history [H] / [H*] (PlantUML); notes ignored."""
    m = Machine()
    scopes = [{'node': ROOT, 'regions': [[]], 'initials': [None], 'finals': [None]}]
    in_note = in_front = False
    lines = text.splitlines()
    if dialect == 'mermaid' and lines and lines[0].strip() == '---':
        in_front = True
        lines = lines[1:]

    def scope():
        return scopes[-1]

    def declare(raw, label=None, type=None):
        sc = scope()
        nid = m.clean(raw)
        new = nid not in m.nodes
        n = m.state(raw, sc['node'], type, label)
        if new:
            sc['regions'][-1].append(n['id'])
        return n

    def final_of():
        sc = scope()
        r = len(sc['regions']) - 1
        if not sc['finals'][r]:
            base = 'final' if sc['node'] == ROOT else f"{sc['node']}_final"
            n = m._new(m.fresh(f'{base}{r + 1 if r else ""}'), sc['node'], 'final', label='[*]')
            sc['regions'][r].append(n['id'])
            sc['finals'][r] = n['id']
        return sc['finals'][r]

    def history_of(owner_raw, deep):
        owner = declare(owner_raw, type='compound')['id'] if owner_raw else scope()['node']
        hid = f'{owner}__H' if owner != ROOT else 'H'
        if hid not in m.nodes:
            m._new(hid, owner, 'history')
        m.nodes[hid]['history'] = 'deep' if deep else (m.nodes[hid]['history'] or 'shallow')
        return hid

    def ref(tok, target):
        if tok == '[*]':
            return final_of() if target else None
        h = re.fullmatch(r'(.*?)\[H(\*?)\]', tok)
        if h:
            return history_of(h.group(1), bool(h.group(2)))
        return declare(tok)['id']

    for raw in lines:
        line = raw.strip()
        if in_front:
            if line == '---':
                in_front = False
            t = re.match(r'^title:\s*(.+)$', line)
            if t:
                m.name = t.group(1).strip().strip('"\'')
            continue
        if dialect == 'mermaid':
            line = re.sub(r'%%.*$', '', line).strip()
        elif line.startswith("'"):
            continue
        if not line:
            continue
        if in_note:
            if re.match(r'^end\s*note$', line, re.I):
                in_note = False
            continue
        low = line.lower()
        cls = re.match(r'^class\s+([\w.,\s-]+?)\s+([\w-]+)\s*;?$', line)
        if cls:
            for x in cls.group(1).split(','):
                m.marks.setdefault(m.clean(x.strip()), set()).add(cls.group(2))
            continue
        d = re.match(r'^direction\s+(TB|TD|BT|LR|RL)\b', line, re.I)
        if d:
            if len(scopes) == 1:
                m.direction = d.group(1).upper()
            continue
        if re.match(r'^(statediagram(-v2)?|@startuml|@enduml|direction\b|classdef\b|class\b|style\b|acctitle|accdescr|'
                    r'title\b|skinparam\b|hide\b|show\b|scale\b|left to right|top to bottom|!|legend|endlegend|header|footer|caption)', low):
            continue
        if low.startswith('note '):
            if ':' not in line:
                in_note = True
            continue
        if line == '}':
            if len(scopes) > 1:
                sc = scopes.pop()
                node = m.nodes[sc['node']]
                regions = [r for r in sc['regions']]
                if len(regions) > 1:
                    node['type'] = 'parallel'
                    for r, mem in enumerate(regions):
                        R = m._new(m.fresh(f"{node['id']}_r{r + 1}"), node['id'], 'compound', label=f"{node['label']} {r + 1}")
                        for x in mem:
                            m.move(x, R['id'])
                        R['initial'] = sc['initials'][r]
                else:
                    node['type'] = 'compound' if node['children'] else node['type']
                    node['initial'] = sc['initials'][0]
            continue
        if line in ('--', '||') and len(scopes) > 1:
            sc = scope()
            sc['regions'].append([])
            sc['initials'].append(None)
            sc['finals'].append(None)
            continue
        opens = line.endswith('{')
        body = line[:-1].strip() if opens else line
        st = (re.match(r'^state\s+"(?P<label>[^"]*)"\s+as\s+(?P<id>[\w.-]+)(?P<rest>.*)$', body)
              or re.match(r'^state\s+(?P<id>[\w.-]+)\s+as\s+"(?P<label>[^"]*)"(?P<rest>.*)$', body)
              or re.match(r'^state\s+(?P<id>[\w.-]+)(?P<rest>.*)$', body))
        if st:
            rest = st.group('rest').strip()
            rest = re.sub(r'#+\S*', '', rest).strip()           # PlantUML colours and line styles
            label = st.groupdict().get('label')
            desc = re.match(r'^:\s*(.*)$', rest)
            kind = re.search(r'<<(\w+\*?)>>', rest)
            typ = None
            if kind:
                k = kind.group(1).lower()
                if k in ('choice', 'fork', 'join'):
                    typ = 'choice'
                    m.warn(f'{st.group("id")}: a <<{k}>> pseudo-state became a plain card')
                elif k == 'end':
                    typ = 'final'
                elif k.startswith('history'):
                    typ = 'history'
            if desc and not label and desc.group(1).strip():
                label = desc.group(1).strip()
            n = declare(st.group('id'), label=label, type='compound' if opens else typ)
            if typ == 'history':
                n['history'] = 'deep' if kind.group(1).endswith('*') else 'shallow'
            if opens:
                n['type'] = 'compound'
                scopes.append({'node': n['id'], 'regions': [[]], 'initials': [None], 'finals': [None]})
            continue
        arrow = (_ARROW_M if dialect == 'mermaid' else _ARROW_P).match(line)
        if arrow:
            a, b = arrow.group('a'), arrow.group('b')
            if dialect == 'plantuml' and arrow.group('arrow').startswith('<'):
                a, b = b, a
            ev, guard = _split_label(arrow.group('label') or '')
            if a == '[*]':
                tgt = ref(b, True)
                r = len(scope()['regions']) - 1
                scope()['initials'][r] = scope()['initials'][r] or tgt
                continue
            src = ref(a, False)
            tgt = ref(b, True)
            m.add(src, tgt, ev, guard)
            continue
        desc = re.match(r'^(?P<id>[\w.-]+)\s*:\s*(?P<text>.*)$', line)
        if desc:
            n = declare(desc.group('id'))
            if n['label'] == desc.group('id') and desc.group('text').strip():
                n['label'] = desc.group('text').strip()
            continue
        if re.fullmatch(r'[\w.-]+', line):
            declare(line)
            continue
        m.warn(f'skipped a line it could not read: {line[:60]}')
    root = m.nodes[ROOT]
    root['initial'] = scopes[0]['initials'][0]
    _drop_legend(m)
    for g in m.trans:
        if g['guard']:
            g['when'] = _when_of(g['guard'], m.vars) or statechart_guard(g['guard'], m)
            if g['when'] == g['source']:
                g['when'] = None                             # "[if quiet]" on an arrow out of quiet: always true there
    return m


def _drop_legend(m):
    """the /statechart skill draws a "Legend" box (which rules break, which path is the bug): not part of the chart."""
    for nid in [n['id'] for n in m.nodes.values() if n['parent'] == ROOT and n['type'] == 'compound'
                and (n['id'].lower() == 'legend' or str(n['label']).lower() == 'legend')]:
        inside = {x for x in m.nodes if m.inside(x, nid)}
        if any(t['source'] in inside or t['target'] in inside for t in m.trans):
            continue
        for x in inside:
            m.marks.pop(x, None)
        m.nodes[ROOT]['children'].remove(nid)
        for x in inside:
            del m.nodes[x]


def _lane_titles(m):
    """{lowercase title: node id} of every box and lane (the /statechart skill's guards name them: The tower ...)."""
    return {str(n['label']).lower(): n['id'] for n in m.nodes.values()
            if n['type'] in ('compound', 'parallel') and n['id'] != ROOT}


def _by_label(m, label, within=None):
    """the state ids whose label (or id) is `label`, optionally inside the node `within`."""
    low = label.strip().lower()
    return [n['id'] for n in m.nodes.values() if n['type'] in ('atomic', 'choice', 'compound', 'parallel') and n['id'] != ROOT
            and (str(n['label']).lower() == low or n['id'].lower() == low) and (within is None or m.inside(n['id'], within))]


def _label_list(m, text, within):
    """'A, B or C' (labels may hold commas themselves) -> ids, matching the longest known label each time."""
    known = sorted({str(m.nodes[x]['label']) for x in m.nodes if x != ROOT and m.inside(x, within) and x != within},
                   key=len, reverse=True)
    out, rest = [], text.strip()
    while rest:
        hit = next((k for k in known if rest.lower().startswith(k.lower())), None)
        if not hit:
            return None
        ids = _by_label(m, hit, within)
        if not ids:
            return None
        out.append(ids[0])
        rest = re.sub(r'^\s*(,|\bor\b|\band\b)?\s*', '', rest[len(hit):])
    return out


def statechart_guard(text, m):
    """the /statechart skill's guard words as an expression over states, or None:
    'when The tower is Arms closing' -> s20; 'when The booster is one of A, B and The ship is none of C' ->
    (s8 || s10) && !(s13); 'unless cooking pearls' -> !s5; 'when barista free' -> s0."""
    mm = re.match(r'^(when|if|unless)\s+(.+)$', (text or '').strip(), re.S | re.I)
    if not mm:
        return None
    lanes = _lane_titles(m)
    titles = sorted(lanes, key=len, reverse=True)
    body = mm.group(2).strip()
    if titles:
        body_parts = re.split(r'\s+and\s+(?=(?:' + '|'.join(re.escape(t) for t in titles) + r')\s+is\s)', body, flags=re.I)
    else:
        body_parts = [body]
    terms = []
    for part in body_parts:
        title = next((t for t in titles if part.lower().startswith(t + ' is ')), None)
        if title:
            rest = part[len(title) + 4:].strip()
            q = re.match(r'^(one of|none of)\s+(.*)$', rest, re.I | re.S)
            ids = _label_list(m, q.group(2) if q else rest, lanes[title])
            if not ids or (not q and len(ids) != 1):
                return None
            any_of = ' || '.join(ids)
            if q and q.group(1).lower() == 'none of':
                terms.append(f'!({any_of})' if len(ids) > 1 else f'!{ids[0]}')
            else:
                terms.append(f'({any_of})' if len(ids) > 1 and len(body_parts) > 1 else any_of)
        else:
            ids = _by_label(m, part)
            if len(ids) != 1:
                return None
            terms.append(ids[0])
    expr = ' && '.join(terms)
    if mm.group(1).lower() == 'unless':
        expr = f'!({expr})' if len(terms) > 1 or ' ' in expr else f'!{expr}'
    return expr if modelcheck.parses(expr) else None


def _decamel(name):
    """'NeverServeOldPearls' -> 'never serve old pearls', 'TypeOK' -> 'type OK'."""
    words = re.findall(r'[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+', name) or [name]
    return ' '.join(w if w.isupper() and len(w) > 1 else w.lower() for w in words)


def _config_of(m, text):
    """a /statechart report's configuration text -> state ids: 'The booster X, The ship Y' (lanes),
    'Parent / Child' (nesting) or a plain label."""
    text = text.strip()
    lanes = _lane_titles(m)
    titles = sorted(lanes, key=len, reverse=True)
    if titles:
        pat = r'(?:^|,\s+)(' + '|'.join(re.escape(t) for t in titles) + r')\s+'
        cuts = [(x.start(), x.end(), x.group(1).lower()) for x in re.finditer(pat, text, re.I)]
        if cuts and cuts[0][0] == 0:
            out = []
            for i, (a, b, title) in enumerate(cuts):
                label = text[b:cuts[i + 1][0] if i + 1 < len(cuts) else len(text)]
                ids = _by_label(m, label, lanes[title])
                if len(ids) != 1:
                    break                                    # not lanes after all: try "Parent / Child" below
                out.append(ids[0])
            else:
                return out
    parts = [p.strip() for p in text.split(' / ')]
    within = None
    for p in parts[:-1]:
        ids = _by_label(m, p, within)
        within = ids[0] if ids else within
    ids = _by_label(m, parts[-1], within)
    return ids[:1] if ids else None


def parse_report(text, m):
    """a /statechart report.md (TLC's result): {'states', 'steps', 'broken': [{'name', 'steps', 'trail'}], 'holds': [...]}
    where trail is [(event or None, [state ids])] from the start."""
    rep = {'states': None, 'steps': None, 'broken': [], 'holds': []}
    cur, holds_next = None, False
    for raw in text.splitlines():
        line = raw.strip()
        n = re.match(r'^TLC reached (\d+) states? and (\d+) steps?', line)
        if n:
            rep['states'], rep['steps'] = int(n.group(1)), int(n.group(2))
            continue
        h = re.match(r'^##\s+(\S+)\s+breaks\s*$', line)
        if h:
            cur, holds_next = {'name': h.group(1), 'steps': None, 'trail': []}, False
            rep['broken'].append(cur)
            continue
        if re.match(r'^##\s+Rules that hold', line, re.I):
            cur, holds_next = None, True
            continue
        if line.startswith('#'):
            cur, holds_next = None, False
            continue
        if holds_next and line:
            rep['holds'] += [x.strip() for x in line.split(',') if x.strip()]
            continue
        if cur is None:
            continue
        s = re.match(r'^The shortest path has (\d+) steps?', line)
        if s:
            cur['steps'] = int(s.group(1))
            continue
        p = re.match(r'^(\d+)\.\s+(.*)$', line)
        if not p:
            continue
        body = p.group(2)
        if p.group(1) == '0':
            cur['trail'].append((None, _config_of(m, body)))
            continue
        for x in re.finditer(r':\s', body):                  # the event is before the first ': ' that leaves a configuration
            cfg = _config_of(m, body[x.end():])
            if cfg:
                cur['trail'].append((body[:x.start()].strip(), cfg))
                break
        else:
            m.warn(f'report: {cur["name"]}: could not read the step {body[:60]!r}')
    return rep


def find_statechart(path):
    """(chart.mmd, report.md or None, layout.mmd or None) for a /statechart output folder, its parent, or chart.mmd."""
    path = Path(path)
    if path.is_dir():
        for c in (path / 'chart.mmd', path / 'chart' / 'chart.mmd'):
            if c.exists():
                path = c
                break
        else:
            raise ImportError_(f'{path}: no chart.mmd here or in chart/')
    report = path.parent / 'report.md'
    layout = next((p for p in (path.parent / 'layout.mmd', path.parent.parent / 'layout.mmd') if p.exists()), None)
    return path, (report if report.exists() else None), layout


def extract_mermaid(text):
    """the first stateDiagram block of a Markdown file (or the text itself)."""
    for block in re.findall(r'```\s*mermaid\s*\n(.*?)```', text, re.S):
        if re.search(r'^\s*stateDiagram', block, re.M):
            return block
    return text


# ------------------------------------------------------------------ SCXML
def _literal(expr):
    if expr is None:
        return None
    try:
        v = modelcheck.evaluate(modelcheck.parse(expr.strip()), {})
        return v if _scalar(v) else None
    except (modelcheck.ExprError, AttributeError):
        return None


def parse_scxml(text):
    """SCXML: state, parallel, final, initial (attribute or element), history, transition event / cond / target,
    datamodel data (-> vars), assign inside a transition (-> do)."""
    try:
        root = ET.fromstring(text)
    except ET.ParseError as e:
        raise ImportError_(f'SCXML: {e}')

    def tag(el):
        return el.tag.rsplit('}', 1)[-1] if isinstance(el.tag, str) else ''

    def scv(el, name):
        return el.get(f'{{{SCV_NS}}}{name}')

    m = Machine(root.get('name') or '')
    for d in root.iter():
        if tag(d) == 'data' and d.get('id'):
            v = _literal(d.get('expr') if d.get('expr') is not None else (d.text or '').strip() or None)
            if v is not None:
                m.vars[d.get('id')] = v
            else:
                m.warn(f'data {d.get("id")}: no plain initial value (number, true / false, string), left out of vars')
    pending, inits = [], {}

    def build(el, parent):
        for c in el:
            t = tag(c)
            if t in ('state', 'parallel', 'final', 'history'):
                kids = [x for x in c if tag(x) in ('state', 'parallel', 'final', 'history')]
                kind = {'state': 'compound' if kids else 'atomic', 'parallel': 'parallel', 'final': 'final', 'history': 'history'}[t]
                raw = c.get('id') or f'{parent}_{t}{len(m.nodes)}'
                n = m._new(m.clean(raw), parent, kind, label=scv(c, 'label') or raw, tag=scv(c, 'tag'))
                if t == 'history':
                    n['history'] = c.get('type') or 'shallow'
                    continue
                if c.get('initial'):
                    inits[n['id']] = c.get('initial').split()[0]
                build(c, n['id'])
            elif t == 'initial':
                tr = next((x for x in c if tag(x) == 'transition'), None)
                if tr is not None and tr.get('target'):
                    inits[parent] = tr.get('target').split()[0]
            elif t == 'transition' and parent != ROOT:
                targets = (c.get('target') or '').split()
                if len(targets) > 1:
                    m.warn(f'{parent}: a transition to several states ({" ".join(targets)}) keeps only {targets[0]}')
                do = {}
                for a in c.iter():
                    if tag(a) == 'assign' and a.get('location'):
                        expr = a.get('expr') if a.get('expr') is not None else (a.text or '').strip()
                        if modelcheck.parses(expr):
                            do[a.get('location')] = ' '.join(expr.split())
                cond = c.get('cond')
                pending.append({'source': parent, 'target': targets[0] if targets else None, 'event': scv(c, 'label') or c.get('event') or '',
                                'guard': scv(c, 'if') or cond, 'cond': cond, 'do': do or None})
    build(root, ROOT)
    for nid, raw in inits.items():
        m.nodes[nid]['initial'] = m.idmap.get(raw)
    if root.get('initial'):
        m.root['initial'] = m.idmap.get(root.get('initial').split()[0])
    for p in pending:
        tgt = m.idmap.get(p['target']) if p['target'] else None
        if p['target'] and not tgt:
            m.warn(f'{p["source"]}: target {p["target"]} is not a state; the arrow is left out')
            continue
        m.add(p['source'], tgt, p['event'], p['guard'], _when_of(p['cond'], m.vars), p['do'])
    return m


# ------------------------------------------------------------------ XState
_NODE_SCRIPT = r"""
const vm = require('vm');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', () => {
  const out = o => process.stdout.write(JSON.stringify(o));
  const { code, ts, prelude } = JSON.parse(input);
  let src = code;
  if (ts) {
    const mod = require('module');
    if (typeof mod.stripTypeScriptTypes !== 'function') return out({ error: 'this node cannot read TypeScript (needs node 22.13+)' });
    try { src = mod.stripTypeScriptTypes(src, { mode: 'transform' }); }
    catch (e) { try { src = mod.stripTypeScriptTypes(src); } catch (e2) { return out({ error: 'TypeScript: ' + e2.message }); } }
  }
  try {
    const ctx = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
    vm.runInContext(prelude, ctx, { timeout: 1000 });
    const json = vm.runInContext('__run(function () { with (__scope) {\n' + src + '\n} })', ctx, { timeout: 2000 });
    out(JSON.parse(json));
  } catch (e) { out({ error: String((e && e.message) || e) }); }
});
"""

# runs inside the empty context: every free name is a harmless marker, createMachine / setup record their config
_PRELUDE = r"""
var __machines = [];
var __mk = function (name) {
  var f = function () { return { __call: name, args: Array.prototype.slice.call(arguments) }; };
  f.__ref = name;
  return f;
};
var __wrap = function (config) { return { __machine: true, config: config, provide: function () { return this; } }; };
var createMachine = function (config) { __machines.push({ config: config, setup: null }); return __wrap(config); };
var Machine = createMachine;
var setup = function (s) {
  return { createMachine: function (config) { __machines.push({ config: config, setup: s }); return __wrap(config); } };
};
var __keep = { createMachine: 1, setup: 1, Machine: 1, __mk: 1, __wrap: 1, __machines: 1, __keep: 1, __scope: 1,
  __ser: 1, __run: 1, JSON: 1, Math: 1, Number: 1, String: 1, Boolean: 1, Array: 1, Object: 1, Date: 1, RegExp: 1,
  Error: 1, TypeError: 1, Symbol: 1, Map: 1, Set: 1, Promise: 1, parseInt: 1, parseFloat: 1, isNaN: 1,
  isFinite: 1, undefined: 1, NaN: 1, Infinity: 1 };
var __scope = new Proxy({}, {
  has: function (t, k) { return typeof k === 'string' && !(k in __keep); },
  get: function (t, k) { if (typeof k !== 'string') return undefined; if (k in t) return t[k]; return __mk(k); },
  set: function (t, k, v) { t[k] = v; return true; }
});
var __ser = function (value) {
  var stack = [];
  function s(v, d) {
    if (typeof v === 'function') {
      if (v.__ref) return { __ref: v.__ref };
      try { return { __fn: Function.prototype.toString.call(v) }; } catch (e) { return { __fn: '' }; }
    }
    if (v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'symbol') return String(v);
    if (v === null || typeof v !== 'object') return v;
    if (d > 64 || stack.indexOf(v) >= 0) return null;
    if (v.__machine) return { __ref: 'machine' };
    stack.push(v);
    var o, i, ks;
    if (Array.isArray(v)) { o = []; for (i = 0; i < v.length; i++) o.push(s(v[i], d + 1)); }
    else { o = {}; ks = Object.keys(v); for (i = 0; i < ks.length; i++) o[ks[i]] = s(v[ks[i]], d + 1); }
    stack.pop();
    return o;
  }
  return s(value, 0);
};
var __run = function (fn) {
  var err = null;
  try { fn(); } catch (e) { err = String((e && e.message) || e); }
  if (!__machines.length) return JSON.stringify({ error: err || 'no createMachine(...) call found' });
  var m = __machines[0];
  return JSON.stringify({ machine: __ser(m.config), setup: m.setup ? __ser(m.setup) : null, count: __machines.length, warning: err });
};
"""


def _strip_modules(text):
    """ES module and CommonJS plumbing out of a source file, so it runs as a plain script in the sandbox."""
    text = re.sub(r'^\s*import\s[^;]*?\sfrom\s*[\'"][^\'"]+[\'"]\s*;?', '', text, flags=re.M)
    text = re.sub(r'^\s*import\s*[\'"][^\'"]+[\'"]\s*;?', '', text, flags=re.M)
    text = re.sub(r'^\s*export\s*\{[^}]*\}\s*(?:from\s*[\'"][^\'"]+[\'"])?\s*;?', '', text, flags=re.M)
    text = re.sub(r'^(\s*)export\s+default\s+', r'\1', text, flags=re.M)
    text = re.sub(r'^(\s*)export\s+(?=(?:const|let|var|function|class|async|type|interface|enum)\b)', r'\1', text, flags=re.M)
    text = re.sub(r'^\s*(?:const|let|var)\s*\{[^}]*\}\s*=\s*require\([^)]*\)\s*;?', '', text, flags=re.M)
    return text


def node_eval(text, ts=False, timeout=15):
    """{'machine': config, 'setup': setup config | None} from a JS / TS file, via node's vm; None without node."""
    node = shutil.which('node')
    if not node:
        return None
    env = {k: v for k, v in os.environ.items() if k not in ('NODE_OPTIONS', 'NODE_PATH')}
    try:
        r = subprocess.run([node, '--no-warnings', '-e', _NODE_SCRIPT], input=json.dumps({'code': _strip_modules(text), 'ts': ts, 'prelude': _PRELUDE}),
                           capture_output=True, text=True, timeout=timeout, env=env)
    except (subprocess.TimeoutExpired, OSError) as e:
        return {'error': str(e)}
    try:
        return json.loads(r.stdout or '{}')
    except ValueError:
        return {'error': (r.stderr or r.stdout or 'node gave no answer').strip()[:300]}


class _JS:
    """A tolerant reader for JavaScript object literals (JSON5-like): unquoted keys, single quotes, trailing commas,
    comments. A value it cannot read (a function, a call, a name) is kept as {'__fn' | '__call' | '__ref' | '__src'}."""

    def __init__(self, s):
        self.s, self.i = s, 0

    def ws(self):
        s = self.s
        while self.i < len(s):
            if s[self.i].isspace():
                self.i += 1
            elif s.startswith('//', self.i):
                j = s.find('\n', self.i)
                self.i = len(s) if j < 0 else j + 1
            elif s.startswith('/*', self.i):
                j = s.find('*/', self.i + 2)
                self.i = len(s) if j < 0 else j + 2
            else:
                return

    def peek(self):
        self.ws()
        return self.s[self.i] if self.i < len(self.s) else ''

    def value(self):
        c = self.peek()
        if c == '{':
            return self.obj()
        if c == '[':
            return self.arr()
        if c in '"\'':
            return self.string()
        start = self.i
        m = re.compile(r'-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?(?=\s*[,}\]\s])').match(self.s, self.i)
        if m:
            self.i = m.end()
            v = float(m.group(0))
            return int(v) if v.is_integer() and re.fullmatch(r'-?\d+', m.group(0)) else v
        m = re.compile(r'(true|false|null|undefined)(?=\s*[,}\]\s])').match(self.s, self.i)
        if m:
            self.i = m.end()
            return {'true': True, 'false': False}.get(m.group(1))
        if c == '`':
            j = _skip_string(self.s, self.i)
            body = self.s[self.i + 1:j - 1]
            if '${' not in body:
                self.i = j
                self.after()
                return body
        self.i = start
        return self.raw()

    def after(self):
        """skip TypeScript's `as const` / `satisfies T` after a value."""
        self.ws()
        if re.compile(r'(as|satisfies)\b').match(self.s, self.i):
            self.raw()

    def string(self):
        j = _skip_string(self.s, self.i)
        body = self.s[self.i + 1:j - 1]
        self.i = j
        self.after()
        return re.sub(r'\\(.)', lambda m: {'n': '\n', 't': '\t'}.get(m.group(1), m.group(1)), body)

    def raw(self):
        start, s, depth = self.i, self.s, 0
        while self.i < len(s):
            c = s[self.i]
            if c in '"\'`':
                self.i = _skip_string(s, self.i)
                continue
            if s.startswith('//', self.i) or s.startswith('/*', self.i):
                self.ws()
                continue
            if c in '([{':
                depth += 1
            elif c in ')]}':
                if depth == 0:
                    break
                depth -= 1
            elif c == ',' and depth == 0:
                break
            self.i += 1
        text = s[start:self.i].strip()
        if re.match(r'^(async\s+)?(function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)', text):
            return {'__fn': text}
        call = re.match(r'^([\w$.]+)\s*\((.*)\)$', text, re.S)
        if call:
            try:
                args = _JS('[' + call.group(2) + ']').value()
            except (IndexError, ValueError):
                args = []
            return {'__call': call.group(1).split('.')[-1], 'args': args if isinstance(args, list) else []}
        if re.fullmatch(r'[\w$.]+', text):
            return {'__ref': text}
        return {'__src': text}

    def obj(self):
        self.i += 1
        out = {}
        while True:
            c = self.peek()
            if c == '}':
                self.i += 1
                self.after()
                return out
            if not c:
                raise ValueError('an object is not closed')
            if self.s.startswith('...', self.i):
                self.i += 3
                self.raw()
            else:
                if c in '"\'':
                    key = self.string()
                elif c == '[':
                    j = _match(self.s, self.i)
                    key = self.s[self.i + 1:j - 1].strip().strip('\'"`')
                    self.i = j
                else:
                    m = re.compile(r'(?:async\s+|get\s+|set\s+)?([\w$]+)').match(self.s, self.i)
                    if not m:
                        raise ValueError(f'cannot read a key at {self.s[self.i:self.i + 20]!r}')
                    key = m.group(1)
                    self.i = m.end()
                c = self.peek()
                if c == ':':
                    self.i += 1
                    out[key] = self.value()
                elif c == '(':                               # method shorthand: guard({ context }) { ... }
                    start = self.i
                    self.i = _match(self.s, self.i)
                    self.ws()
                    if self.peek() == '{':
                        self.i = _match(self.s, self.i)
                    out[key] = {'__fn': self.s[start:self.i]}
                else:
                    out[key] = {'__ref': key}
            if self.peek() == ',':
                self.i += 1

    def arr(self):
        self.i += 1
        out = []
        while True:
            c = self.peek()
            if c == ']':
                self.i += 1
                self.after()
                return out
            if not c:
                raise ValueError('an array is not closed')
            if self.s.startswith('...', self.i):
                self.i += 3
                self.raw()
            else:
                out.append(self.value())
            if self.peek() == ',':
                self.i += 1


def _skip_string(s, i):
    q, i = s[i], i + 1
    while i < len(s):
        if s[i] == '\\':
            i += 2
            continue
        if s[i] == q:
            return i + 1
        if q == '`' and s.startswith('${', i):
            i = _match(s, i + 1)
            continue
        i += 1
    return i


def _match(s, i):
    """index after the bracket that closes the one at s[i] (strings, template literals and comments skipped)."""
    pairs = {'(': ')', '[': ']', '{': '}'}
    stack = [pairs[s[i]]]
    i += 1
    while i < len(s) and stack:
        c = s[i]
        if c in '"\'`':
            i = _skip_string(s, i)
            continue
        if s.startswith('//', i):
            j = s.find('\n', i)
            i = len(s) if j < 0 else j + 1
            continue
        if s.startswith('/*', i):
            j = s.find('*/', i + 2)
            i = len(s) if j < 0 else j + 2
            continue
        if c in pairs:
            stack.append(pairs[c])
        elif stack and c == stack[-1]:
            stack.pop()
        i += 1
    return i


def object_after(text, name):
    """the source of the first object literal passed to name(...) / name<T>(...), or None."""
    for m in re.finditer(r'\b' + re.escape(name) + r'\s*(?:<[^()]*?>)?\s*\(\s*', text):
        if text[m.end():m.end() + 1] == '{':
            return text[m.end():_match(text, m.end())]
    return None


def read_xstate(path, text):
    """(machine config, setup config, notes) from .json / .js / .ts."""
    notes = []
    if path.suffix.lower() == '.json':
        try:
            return json.loads(text), None, notes
        except ValueError:
            return _JS(text).value(), None, notes
    ts = path.suffix.lower() in ('.ts', '.tsx', '.mts', '.cts')
    r = node_eval(text, ts=ts)
    if r and r.get('machine'):
        if r.get('count', 1) > 1:
            notes.append(f'the file makes {r["count"]} machines; imported the first')
        if r.get('warning'):
            notes.append(f'node stopped after createMachine: {r["warning"]}')
        return r['machine'], r.get('setup'), notes
    if r and r.get('error'):
        notes.append(f'node could not run the file ({r["error"][:160]}); read the object literal instead')
    src = object_after(text, 'createMachine') or object_after(text, 'Machine')
    if not src:
        raise ImportError_(f'{path}: no createMachine({{...}}) found')
    setup_src = object_after(text, 'setup')
    try:
        return _JS(src).value(), (_JS(setup_src).value() if setup_src else None), notes
    except (ValueError, IndexError) as e:
        raise ImportError_(f'{path}: cannot read the createMachine object: {e}')


def _fn_expr(src):
    """'({ context }) => context.count > 0' -> 'count > 0'; None when it is not a one-expression function."""
    if not isinstance(src, str):
        return None
    m = (re.match(r'^\s*(?:async\s+)?(?:function\s*[\w$]*\s*)?\(([^)]*)\)\s*(?:=>)?\s*(.*)$', src, re.S)
         or re.match(r'^\s*(?:async\s+)?([\w$]+)\s*=>\s*(.*)$', src, re.S)
         or re.match(r'^\s*[\w$]+\s*\(([^)]*)\)\s*(\{.*)$', src, re.S))
    if not m:
        return None
    params, body = m.group(1).strip(), m.group(2).strip()
    if body.startswith('{'):
        r = re.match(r'^\{\s*return\s+(.*?);?\s*\}$', body, re.S)
        if not r:
            return None
        body = r.group(1)
    ctx = ['context']
    if params and not params.startswith('{'):
        ctx.append(params.split(',')[0].split(':')[0].strip())
    for c in ctx:
        body = re.sub(r'(?<![\w$.])' + re.escape(c) + r'\.([\w$]+)', r'\1', body)
    return ' '.join(body.split()) or None


def _as_list(v):
    return [] if v is None else v if isinstance(v, list) else [v]


def file_consts(text):
    """plain constants of a source file (const MAX = 3;), so guards that use them become logic."""
    out = {}
    for name, val in re.findall(r'^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*\w+\s*)?=\s*(-?\d+(?:\.\d+)?|true|false)\s*;?\s*$',
                                text or '', re.M):
        out[name] = val
    return out


class _XState:
    def __init__(self, cfg, setup, name, consts=None):
        self.cfg = cfg if isinstance(cfg, dict) else {}
        self.consts = consts or {}
        setup = setup if isinstance(setup, dict) else {}
        self.guards = setup.get('guards') if isinstance(setup.get('guards'), dict) else {}
        self.actions = setup.get('actions') if isinstance(setup.get('actions'), dict) else {}
        self.m = Machine(self.cfg.get('id') or name)
        self.paths, self.xids, self.pending = {(): ROOT}, {}, []

    def expr(self, src):
        """a function's one expression, with the file's plain constants put in (unless the context has that name)."""
        e = _fn_expr(src)
        if e:
            for k, v in self.consts.items():
                if k not in self.m.vars:
                    e = re.sub(r'(?<![\w$.])' + re.escape(k) + r'(?![\w$])', v, e)
        return e

    def guard(self, g):
        """(words for `if`, expression for `when` or None)"""
        if g is None:
            return None, None
        if isinstance(g, str):
            impl = self.guards.get(g)
            if isinstance(impl, dict) and impl.get('__fn'):
                return g, self.expr(impl['__fn'])
            if isinstance(impl, dict) and impl.get('__call'):
                return g, self.guard(impl)[1]
            return g, None
        if isinstance(g, dict):
            if g.get('__fn') is not None:
                e = self.expr(g['__fn'])
                return (e if e and len(e) <= 24 else 'guard'), e
            call, args = g.get('__call'), g.get('args') or []
            if call in ('and', 'or') and args and isinstance(args[0], list):
                parts = [self.guard(x) for x in args[0]]
                j = ' && ' if call == 'and' else ' || '
                words = j.join(p[0] or '?' for p in parts)
                when = j.join(f'({p[1]})' for p in parts) if all(p[1] for p in parts) else None
                return words, when
            if call == 'not' and args:
                w, e = self.guard(args[0])
                return f'!{w}', (f'!({e})' if e else None)
            if call == 'stateIn' and args:
                return f'in {args[0]}', None
            if call:
                return call, None
            if g.get('type'):
                params = g.get('params') if isinstance(g.get('params'), dict) else {}
                words, when = self.guard(g['type'])
                return words, params.get('when') or when
        return 'guard', None

    def do(self, actions, where):
        out = {}
        for a in _as_list(actions):
            if isinstance(a, str):
                a = self.actions.get(a)
            if not isinstance(a, dict):
                continue
            if a.get('type') in ('assign', 'xstate.assign') and isinstance(a.get('params'), dict):
                out.update(a['params'])
                continue
            if a.get('__call') == 'assign' and a.get('args') and isinstance(a['args'][0], dict):
                for k, v in a['args'][0].items():
                    if isinstance(v, (bool, int, float)):
                        out[k] = v
                    elif isinstance(v, str):
                        out[k] = json.dumps(v, ensure_ascii=False).replace('"', "'")
                    elif isinstance(v, dict) and v.get('__fn'):
                        e = self.expr(v['__fn'])
                        if e and modelcheck.parses(e):
                            out[k] = e
        keep = {}
        for k, v in out.items():
            try:
                used = modelcheck.names(modelcheck._value(v))
            except modelcheck.ExprError:
                continue
            if k in self.m.vars and used <= set(self.m.vars):
                keep[k] = v
            else:
                self.m.warn(f'{where}: assignment to {k} left out (only plain context values become vars)')
        return keep or None

    def visit(self, node, key, parent, path, counts):
        node = node if isinstance(node, dict) else {}
        kids = node.get('states') if isinstance(node.get('states'), dict) else {}
        typ = node.get('type')
        kind = typ if typ in ('parallel', 'final', 'history') else ('compound' if kids else 'atomic')
        meta = node.get('meta') if isinstance(node.get('meta'), dict) else {}
        if parent is None:
            nid = ROOT
            self.m.root['type'] = 'parallel' if kind == 'parallel' else 'compound'
        else:
            raw = key if counts.get(key, 0) <= 1 else '_'.join(path)
            nid = self.m.clean(raw)
            self.m._new(nid, parent, kind, label=meta.get('label') or key, tag=meta.get('tag'))
            if kind == 'history':
                self.m.nodes[nid]['history'] = node.get('history') or 'shallow'
        self.paths[tuple(path)] = nid
        if isinstance(node.get('id'), str):
            self.xids[node['id']] = tuple(path)
        for k, v in kids.items():
            self.visit(v, k, nid, path + [k], counts)
        init = node.get('initial')
        if isinstance(init, dict):
            init = init.get('target')
        if isinstance(init, str):
            self.pending.append({'kind': 'initial', 'node': nid, 'path': path, 'raw': '.' + init if not init.startswith(('#', '.')) else init})
        on = node.get('on')
        if isinstance(on, list):                                  # v4 array form
            for item in on:
                if isinstance(item, dict):
                    self.specs(nid, path, item.get('event') or '', item)
        elif isinstance(on, dict):
            for ev, spec in on.items():
                self.specs(nid, path, ev, spec)
        if node.get('always') is not None:
            self.specs(nid, path, 'always', node['always'])
        if isinstance(node.get('after'), dict):
            for delay, spec in node['after'].items():
                d = str(delay)
                label = (f'{int(d) // 1000}s' if d.isdigit() and int(d) % 1000 == 0 else f'{d}ms') if d.isdigit() else d
                self.specs(nid, path, f'after {label}', spec, style='timer')
        for inv in _as_list(node.get('invoke')):
            if isinstance(inv, dict):
                for k in ('onDone', 'onError'):
                    if inv.get(k) is not None:
                        self.specs(nid, path, k, inv[k], style='async')
        if node.get('onDone') is not None:
            self.specs(nid, path, 'onDone', node['onDone'])
        if isinstance(node.get('context'), dict) and parent is None:
            for k, v in node['context'].items():
                if _scalar(v):
                    self.m.vars[k] = v
                else:
                    self.m.warn(f'context.{k}: not a plain value, left out of vars')
        elif node.get('context') is not None and parent is None:
            self.m.warn('context is computed by a function: no vars')

    def specs(self, nid, path, event, spec, style=None):
        for item in _as_list(spec):
            if isinstance(item, str) or item is None:
                item = {'target': item}
            if not isinstance(item, dict) or item.get('__fn') or item.get('__ref'):
                continue
            targets = _as_list(item.get('target'))
            if len(targets) > 1:
                self.m.warn(f'{".".join(path) or "machine"} {event}: several targets; kept {targets[0]}')
            self.pending.append({'kind': 'edge', 'node': nid, 'path': path, 'raw': targets[0] if targets else None,
                                 'event': event, 'guard': item.get('guard', item.get('cond')), 'actions': item.get('actions'), 'style': style})

    def resolve(self, raw, path):
        if raw is None:
            return None
        if not isinstance(raw, str):
            return False
        if raw.startswith('#'):
            head, _, rest = raw[1:].partition('.')
            if head in self.xids:
                base = list(self.xids[head])
            elif head == self.cfg.get('id'):
                base = []
            else:
                return False
            segs = [s for s in rest.split('.') if s]
        elif raw.startswith('.'):
            base, segs = list(path), [s for s in raw[1:].split('.') if s]
        else:
            base, segs = list(path[:-1]), raw.split('.')
        hit = self.paths.get(tuple(base + segs))
        if hit is None and not raw.startswith(('#', '.')):
            hit = self.paths.get(tuple(segs))
        return hit if hit is not None else False

    def build(self):
        counts = {}

        def count(node):
            kids = node.get('states') if isinstance(node, dict) and isinstance(node.get('states'), dict) else {}
            for k, v in kids.items():
                counts[k] = counts.get(k, 0) + 1
                count(v)
        count(self.cfg)
        self.visit(self.cfg, None, None, [], counts)
        for p in self.pending:
            tgt = self.resolve(p['raw'], p['path'])
            if p['kind'] == 'initial':
                if tgt:
                    self.m.nodes[p['node']]['initial'] = tgt
                continue
            if tgt is False:
                self.m.warn(f'{".".join(p["path"]) or "machine"} {p["event"]}: target {p["raw"]!r} not found; the arrow is left out')
                continue
            words, when = self.guard(p['guard'])
            if when is not None:
                when = _when_of(when, self.m.vars)
            if words and when is None and p['guard'] is not None:
                when = _when_of(words, self.m.vars)
            where = f'{".".join(p["path"]) or "machine"} {p["event"]}'
            self.m.add(p['node'], tgt, p['event'], words, when, self.do(p['actions'], where), p['style'])
        return self.m


def from_xstate(cfg, setup=None, name='machine', consts=None):
    return _XState(cfg, setup, name, consts).build()


# ------------------------------------------------------------------ reading any source
def guess_format(path, text):
    ext = path.suffix.lower()
    if ext in ('.json', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'):
        return 'xstate'
    if ext in ('.mmd', '.mermaid'):
        return 'mermaid'
    if ext in ('.scxml',):
        return 'scxml'
    if ext in ('.puml', '.plantuml', '.pu', '.iuml', '.wsd'):
        return 'plantuml'
    if '<scxml' in text:
        return 'scxml'
    if '@startuml' in text:
        return 'plantuml'
    if re.search(r'^\s*stateDiagram', text, re.M):
        return 'mermaid'
    if 'createMachine' in text:
        return 'xstate'
    raise ImportError_(f'{path}: cannot tell the format; pass --format {"|".join(FORMATS)}')


def read_machine(path, fmt=None):
    path = Path(path)
    if not path.exists():
        raise ImportError_(f'{path}: no such file')
    report = layout = None
    if path.is_dir() or path.suffix.lower() in ('.mmd', '.mermaid'):
        if path.is_dir():
            path, report, layout = find_statechart(path)
        else:
            _, report, layout = find_statechart(path)
        fmt = fmt or 'mermaid'
    text = path.read_text(encoding='utf-8')
    fmt = fmt or guess_format(path, text)
    if fmt == 'mermaid':
        m = parse_diagram(extract_mermaid(text), 'mermaid')
        if layout:
            d = re.search(r'^\s*direction\s+(TB|TD|BT|LR|RL)\b', layout.read_text(encoding='utf-8'), re.M | re.I)
            if d:
                m.direction = d.group(1).upper()
        if report:
            m.report = parse_report(report.read_text(encoding='utf-8'), m)
    elif fmt == 'plantuml':
        m = parse_diagram(text, 'plantuml')
    elif fmt == 'scxml':
        m = parse_scxml(text)
    elif fmt == 'xstate':
        cfg, setup, notes = read_xstate(path, text)
        m = from_xstate(cfg, setup, name=path.stem.split('.')[0], consts=file_consts(text))
        for n in notes:
            m.warn(n)
    else:
        raise ImportError_(f'unknown format {fmt!r}; use one of {", ".join(FORMATS)}')
    if not m.name:
        m.name = path.stem.split('.')[0]
    if len(m.nodes) <= 1:
        raise ImportError_(f'{path}: no states found')
    return m


# ------------------------------------------------------------------ the tree as chapters
def normalize(m):
    """history pseudo-states -> their parent remembers; one-compound regions -> that compound; initials resolved."""
    for t in m.trans:
        tg = t['target']
        if tg and m.nodes[tg]['type'] == 'history':
            parent = m.nodes[tg]['parent']
            m.nodes[parent]['history'] = m.nodes[tg]['history'] or 'shallow'
            t['target'] = parent
    m.trans = [t for t in m.trans if m.nodes[t['source']]['type'] != 'history']
    for n in list(m.nodes.values()):
        if n['type'] == 'compound' and not m.members(n['id']) and n['id'] != ROOT:
            n['type'] = 'atomic'
    for n in list(m.nodes.values()):
        if n['type'] != 'parallel':
            continue
        for r in list(m.members(n['id'])):
            R = m.nodes[r]
            inner = m.members(r)
            only = [c for c in inner if m.nodes[c]['type'] != 'final']
            if (R['type'] == 'compound' and len(inner) == 1 and m.nodes[inner[0]]['type'] in ('compound', 'parallel')
                    and not any(t['source'] == r or t['target'] == r for t in m.trans) and only):
                child = inner[0]
                idx = n['children'].index(r)
                m.move(child, n['id'])
                n['children'].remove(child)
                n['children'][idx] = child
                if R['history'] and not m.nodes[child]['history']:
                    m.nodes[child]['history'] = R['history']
                del m.nodes[r]
    for n in m.nodes.values():
        if n['type'] in ('compound', 'parallel'):
            mem = [c for c in m.members(n['id']) if m.nodes[c]['type'] != 'final']
            init = n['initial']
            if init and init in m.nodes and n['id'] in m.ancestors(init)[1:]:
                n['initial'] = next(a for a in m.ancestors(init) if m.nodes[a]['parent'] == n['id'])
            elif mem:
                n['initial'] = mem[0]
            else:
                n['initial'] = None


def _flat(m, c):
    mem = [x for x in m.members(c) if m.nodes[x]['type'] != 'final']
    return bool(mem) and all(m.nodes[x]['type'] in ('atomic', 'choice') for x in mem)


def _inline_ok(m, c):
    t = m.nodes[c]['type']
    if t == 'compound':
        return _flat(m, c)
    if t == 'parallel':
        return all(m.nodes[r]['type'] == 'atomic' or (m.nodes[r]['type'] == 'compound' and _flat(m, r)) for r in m.members(c))
    return False


def _inner_count(m, c):
    if m.nodes[c]['type'] == 'compound':
        return len([x for x in m.members(c) if m.nodes[x]['type'] != 'final'])
    return sum(1 if m.nodes[r]['type'] == 'atomic' else _inner_count(m, r) for r in m.members(c))


OUT, SELF, END = ('out',), ('self',), 'end'


def _levels(nodes, pairs, start):
    """longest-path layers from start (back edges dropped), like the engine's layout: {node: level}."""
    adj = {}
    for f, t in pairs:
        if f in nodes and t in nodes and f != t:
            adj.setdefault(f, []).append(t)
    order, color, back = [], {}, set()
    roots = ([start] if start in nodes else []) + [n for n in nodes if n != start]
    for r in roots:
        if r in color:
            continue
        stack = [(r, iter(adj.get(r, [])))]
        color[r] = 1
        while stack:
            u, it = stack[-1]
            v = next(it, None)
            if v is None:
                color[u] = 2
                order.append(u)
                stack.pop()
            elif color.get(v) == 1:
                back.add((u, v))
            elif v not in color:
                color[v] = 1
                stack.append((v, iter(adj.get(v, []))))
    level = {n: 0 for n in nodes}
    for u in reversed(order):
        for v in adj.get(u, []):
            if (u, v) not in back:
                level[v] = max(level[v], level[u] + 1)
    # as layout.js does: an excursion (one way in, only ways back out) sits beside the card it comes from, and so
    # does a single end dot; neither adds a row
    fwd = [(u, v) for u in adj for v in adj[u] if (u, v) not in back]
    for v in nodes:
        if v == start:
            continue
        ins = [u for u, w in fwd if w == v]
        if len(ins) == 1 and (v == END or (not any(u == v for u, _ in fwd) and any(u == v for u, _ in back))):
            level[v] = level[ins[0]]
    return level


def _height(cards, lanes, box, edges, start):
    """about how tall the engine draws this chart, in poster units (cards 56 high, 104 apart; 140 apart in a lane)."""
    lane_of = {s: l['id'] for l in lanes for s in l['states']}

    def lift(x):
        return box if x in lane_of else x
    lane_h = []
    for l in lanes:
        lv = _levels(l['states'], [(e['from'], e['to']) for e in edges], l['start'])
        lane_h.append(max(lv.values(), default=0) * 140 + TH_CARD)
    box_h = (250 + max(lane_h) + (46 if len(lanes) > 1 else 0)) if lanes else 0
    nodes = list(cards) + ([box] if box else []) + sorted({e['to'] for e in edges if e['to'] == END})
    lv = _levels(nodes, [(lift(e['from']), lift(e['to'])) for e in edges], lift(start) if start else None)
    rows = {}
    for n, k in lv.items():
        h = box_h if n == box else 30 if n == END else TH_CARD
        rows[k] = max(rows.get(k, 0), h)
    return sum(rows.values()) + 104 * max(0, len(rows) - 1) + 68


# a 3:4 poster has room for about 1100 units of chart (the estimate runs 3-40% above the engine's real layout of the
# examples; intro's first chapter, estimated 1084, fits)
TH_CARD, HEIGHT_MAX = 56, 1100


class View:
    """one chapter's worth of the tree: the subject's members as cards, at most one box (parent state or lanes)."""

    def __init__(self, m, subject, no_box=False):
        self.m, self.S = m, subject
        S = m.nodes[subject]
        mem = [c for c in m.members(subject) if m.nodes[c]['type'] != 'final']
        self.box, self.lanes, self.cards, self.collapsed = None, [], [], []
        if S['type'] == 'parallel':
            self.box = subject
        else:
            for c in ([] if no_box else mem):
                if m.nodes[c]['type'] in ('compound', 'parallel') and _inline_ok(m, c) and len(mem) - 1 + _inner_count(m, c) <= CHAPTER_MAX:
                    self.box = c
                    break
            self.cards = [c for c in mem if c != self.box]
        self.lane_of = {}
        if self.box:
            self._lanes()
        self.collapsed = [c for c in self.cards + [s for l in self.lanes for s in l['states']]
                          if m.nodes[c]['type'] in ('compound', 'parallel')]

    def _lanes(self):
        m, B = self.m, self.m.nodes[self.box]
        used = set(m.nodes)

        def lane_id(base):
            lid, n = f'{base}_lane', 2
            while lid in used:
                lid = f'{base}_lane{n}'
                n += 1
            used.add(lid)
            return lid
        if B['type'] == 'compound':
            sts = [x for x in m.members(self.box) if m.nodes[x]['type'] != 'final']
            self.lanes.append({'id': lane_id(self.box), 'title': B['label'], 'states': sts, 'start': B['initial'] or sts[0], 'node': self.box})
        else:
            for r in m.members(self.box):
                R = m.nodes[r]
                if R['type'] == 'compound':
                    sts = [x for x in m.members(r) if m.nodes[x]['type'] != 'final']
                    if sts:
                        self.lanes.append({'id': r, 'title': R['label'], 'states': sts, 'start': R['initial'] or sts[0], 'node': r})
                elif R['type'] != 'final':
                    self.lanes.append({'id': lane_id(r), 'title': R['label'], 'states': [r], 'start': r, 'node': r})
        for i, l in enumerate(self.lanes):
            l['tint'] = TINTS[i % len(TINTS)]
            for s in l['states']:
                self.lane_of[s] = l['id']

    def rep(self, x):
        """what stands for node x on this chapter's poster: a card id, the box id, END, OUT or SELF."""
        m = self.m
        if x == self.S:
            return SELF
        chain = list(reversed(m.ancestors(x)))
        if self.S not in chain:
            return OUT
        below = chain[chain.index(self.S) + 1:]
        first = below[0]
        if m.nodes[first]['type'] == 'final':
            return END
        if self.box == self.S:                                       # the subject is parallel: below = [region, state...]
            below = [self.S] + below
            first = self.S
        if first == self.box:
            if x == self.box:
                return self.box
            B = m.nodes[self.box]
            if B['type'] == 'compound':
                st = below[1]
            else:
                R = below[1]
                if m.nodes[R]['type'] != 'compound':
                    return R
                if len(below) == 2:
                    return self.box
                st = below[2]
            return END if m.nodes[st]['type'] == 'final' else st
        return first

    def start(self):
        if self.box == self.S:
            return None
        init = self.m.nodes[self.S]['initial']
        r = self.rep(init) if init else None
        if r in (None, END, OUT, SELF):
            return self.cards[0] if self.cards else self.box
        return r

    def edges(self):
        m, out = self.m, []
        root_cards = self.cards + ([self.box] if self.box else [])
        for t in m.trans:
            s, d = t['source'], t['target']
            rs = self.rep(s)
            if rs in (OUT, END):
                continue
            srcs = [rs]
            if rs == SELF:
                if self.box == self.S:
                    srcs = [self.box]
                elif self.S == ROOT:
                    srcs = [c for c in root_cards]
                    if len(srcs) > 1:
                        m.warn(f'{t["event"] or "an eventless transition"}: a transition on the whole machine (from any state) '
                               f'became {len(srcs)} arrows, one from every card; keep the ones that matter')
                else:
                    continue                                         # drawn in the chapter that shows this state as a card
            if d is None:
                rd = None
            else:
                rd = self.rep(d)
                if rd == SELF:
                    rd = self.start() or self.box
            for src in srcs:
                dst, goto = (src if d is None else rd), None
                if dst == OUT:
                    dst, goto = END, d
                if src == dst and src in self.collapsed and d is not None and s != src and d != src:
                    continue                                         # inside a card that has its own chapter
                if src in self.lane_of and dst in self.lane_of and self.lane_of[src] != self.lane_of[dst]:
                    m.warn(f'{src} > {dst}: an arrow between two lanes is not drawn (the skill links lanes by a condition, like [出餐口有餐])')
                    continue
                e = {'from': src, 'to': dst, 'label': t['event'], 'if': t['guard'], 'when': t['when'], 'do': t['do'],
                     'style': t['style'], '_goto': goto, '_src': s, '_dst': d}
                out.append(e)
        return out


def _bfs_order(cards, edges, start):
    adj = {}
    for e in edges:
        adj.setdefault(e['from'], []).append(e['to'])
    order, seen, q = [], set(), deque([start] if start in cards else [])
    while q:
        c = q.popleft()
        if c in seen or c not in cards:
            continue
        seen.add(c)
        order.append(c)
        q.extend(adj.get(c, []))
    return order + [c for c in cards if c not in seen]


def plan_chapters(m):
    """[{subject, cards, box, lanes, start, edges, collapsed, cover}] in film order."""
    out, queue, done = [], [ROOT], set()
    while queue:
        S = queue.pop(0)
        if S in done:
            continue
        done.add(S)
        v = View(m, S)
        edges = v.edges()
        if v.box and v.box != S and _height(v.cards, v.lanes, v.box, edges, v.start()) > HEIGHT_MAX:
            v = View(m, S, no_box=True)                              # too tall with the box open: it gets its own chapter
            edges = v.edges()
        if v.box == S and (len(v.lane_of) > CHAPTER_MAX or _height([], v.lanes, S, edges, None) > HEIGHT_MAX):
            regions = [l['node'] for l in v.lanes if m.nodes[l['node']]['type'] == 'compound']
            m.warn(f'{m.nodes[S]["label"]}: {len(v.lane_of)} cards running at once are too many for one poster; '
                   f'each lane gets its own chapter ({", ".join(m.nodes[r]["label"] for r in regions)})')
            queue[0:0] = regions
            continue
        if not v.box and len(v.cards) == 1 and v.cards[0] in v.collapsed:
            queue.insert(0, v.cards[0])                              # a chapter of one closed box: open it instead
            continue
        start = v.start()
        base = {'subject': S, 'box': v.box, 'lanes': v.lanes, 'collapsed': v.collapsed, 'lane_of': v.lane_of}
        tall = 0 if v.box else _height(v.cards, [], None, edges, start)
        if (len(v.cards) > CHAPTER_MAX + 1 or (tall > HEIGHT_MAX and len(v.cards) > 3)) and not v.box:
            order = _bfs_order(v.cards, edges, start)
            k = max(math.ceil(len(order) / CHAPTER_MAX), math.ceil(tall / HEIGHT_MAX))
            size = math.ceil(len(order) / k)
            chunks = [order[i:i + size] for i in range(0, len(order), size)]
            for j, chunk in enumerate(chunks):
                # a later part starts from the card of an earlier part that leads into it most (shown again)
                into = [e['from'] for e in edges if e['to'] in chunk and e['from'] not in chunk
                        and any(e['from'] in c for c in chunks[:j])]
                anchor = max(into, key=lambda c: (into.count(c), -order.index(c))) if into else None
                cards = ([anchor] if anchor else []) + chunk
                es = []
                for e in edges:
                    if e['from'] not in cards or (e['from'] == anchor and e['to'] not in chunk):
                        continue
                    e = dict(e)
                    if e['to'] not in cards and e['to'] != END:
                        e['_goto'] = e['to']
                        e['to'] = END
                    es.append(e)
                out.append({**base, 'cards': cards, 'edges': es, 'start': anchor or (start if j == 0 else chunk[0]),
                            'part': (j + 1, len(chunks)), 'cover': set(chunk), 'anchor': anchor,
                            'collapsed': [c for c in v.collapsed if c in chunk]})
        else:
            out.append({**base, 'cards': v.cards, 'edges': edges, 'start': start, 'part': None, 'cover': {S}})
        queue.extend(v.collapsed)
    return out


def _covers(m, ch, node):
    return node is not None and any(m.inside(node, c) for c in ch['cover'])


def _bottom(ch):
    """the cards on the chart's lowest row: the exit arrow runs straight down from its card, so only these are clear."""
    box = ch['box'] if ch['part'] is None else None
    lanes = ch['lanes'] if box else []
    lane_of = {s: l['id'] for l in lanes for s in l['states']}

    def lift(x):
        return box if x in lane_of else x
    nodes = list(ch['cards']) + ([box] if box else []) + ([END] if any(e['to'] == END for e in ch['edges']) else [])
    lv = _levels(nodes, [(lift(e['from']), lift(e['to'])) for e in ch['edges']], lift(ch['start']) if ch['start'] else None)
    lv.pop(END, None)
    low = max(lv.values(), default=0)
    out = [c for c in ch['cards'] if lv.get(c) == low]
    if box and lv.get(box) == low:
        for l in lanes:
            ll = _levels(l['states'], [(e['from'], e['to']) for e in ch['edges']], l['start'])
            out += [s for s in l['states'] if ll[s] == max(ll.values())]
    return out


def _link(m, chapters):
    """exit arrows: each chapter hands over to the next (zoom into a card, or the arrow that leads there), always from
    a card on the bottom row."""
    for k in range(len(chapters) - 1):
        ch, nxt = chapters[k], chapters[k + 1]
        states = set(_bottom(ch))
        ex = None
        if nxt['subject'] in states and nxt['subject'] != ch['subject']:
            ex = {'from': nxt['subject'], 'label': f"{m.nodes[nxt['subject']]['label']} ↓"}
        elif nxt.get('anchor'):
            if nxt['anchor'] in states:                              # the next part starts from this very card
                ex = {'from': nxt['anchor'], 'label': f"{_title(m, nxt, '')} ↓"}
            ch['edges'] = [e for e in ch['edges'] if not (e['from'] == nxt['anchor'] and e['to'] == END and _covers(m, nxt, e['_goto']))]
        else:
            for want_start in (True, False):
                for e in ch['edges']:
                    if e['to'] == END and e['from'] in states and _covers(m, nxt, e['_goto']):
                        hit = e['_goto']
                        if want_start and not (nxt['part'] and hit in nxt['cards']) and View(m, nxt['subject']).rep(hit) != nxt['start']:
                            continue
                        ex = {'from': e['from'], 'label': ((e['label'] or '') + ' ↓').strip()}
                        ch['edges'].remove(e)
                        if nxt['part'] and hit in nxt['cards']:
                            nxt['start'] = hit
                        break
                if ex:
                    break
        if not ex:
            order = [c for c in _bfs_order(list(ch['cards']) + list(ch['lane_of']), ch['edges'], ch['start']) if c in states]
            outs = {e['from'] for e in ch['edges'] if e['to'] != e['from']}
            leaf = next((c for c in reversed(order) if c not in outs), order[-1] if order else None)
            if leaf:
                ex = {'from': leaf, 'label': f"{_title(m, nxt, '')} ↓"}
        ch['exit'] = ex


def _title(m, p, film_title):
    """a chapter's title: the subject's name (the film's for the top), with the part number when it is split."""
    base = film_title if p['subject'] == ROOT else m.nodes[p['subject']]['label']
    return (base or '接着看') + (f" {p['part'][0]}" if p.get('part') and p['part'][1] > 1 else '')


def _edge_ids(edges):
    return modelcheck._edge_ids(edges)


def walk(ch, entry):
    """steps that draw every arrow at least once, along the arrows where it can (BFS from what is lit)."""
    edges, ids = ch['edges'], _edge_ids(ch['edges'])
    regs = ch.get('regions')
    box = regs['id'] if regs else None
    inbox = {s for l in (regs or {}).get('lanes', []) for s in l['states']}
    lane_starts = {l.get('start') or l['states'][0] for l in (regs or {}).get('lanes', [])}
    outer = [s for s in ch['states'] if s not in inbox]
    start = ch.get('start') or (box if box and not [s for s in outer if not any(e['to'] == s and e['from'] != s for e in edges)] else (outer[0] if outer else None))
    is_end = modelcheck._is_end
    steps = [{'go': 'entry' if entry else 'start', 'note': TODO_NOTE}]
    active = set(lane_starts) if start == box and box else {start}
    seen = set(active)
    last = set(active)

    def apply(e):
        nonlocal active, last
        f, t = e['from'], e['to']
        last = set(lane_starts) if t == box else {t}
        if f == box:
            active = active - inbox
        elif f in inbox and t not in inbox and t != box:
            active = active - inbox
        elif f in inbox:
            active.discard(f)
        else:
            active = active & inbox
        if t == box:
            active |= lane_starts
        elif not is_end(t):
            active.add(t)
        seen.update(active)

    def can(e, act):
        return e['from'] in act or (e['from'] == box and bool(act & inbox))

    def next_cards(e):
        if e['to'] == box:
            return list(lane_starts)
        return [] if is_end(e['to']) else [e['to']]

    def path_to(goal_ok, drawn):
        """shortest run of drawn arrows from what is lit to a card where goal_ok(card)."""
        prev = {c: None for c in active}
        q = deque(active)
        while q:
            c = q.popleft()
            if goal_ok(c) and prev[c] is not None:
                out = []
                while prev[c] is not None:
                    out.append(prev[c][1])
                    c = prev[c][0]
                return list(reversed(out))
            for i in drawn:
                e = edges[i]
                if can(e, {c}):
                    for n in next_cards(e):
                        if n not in prev:
                            prev[n] = (c, i)
                            q.append(n)
        return None

    todo, drawn, rewalked = list(range(len(edges))), [], False
    while todo:
        ready = [i for i in todo if can(edges[i], active)]
        if not ready:
            p = None if rewalked else path_to(lambda c: any(can(edges[i], {c}) for i in todo), drawn)
            if p and len(p) <= 2:
                steps.append({'go': [ids[i] for i in p] if len(p) > 1 else ids[p[0]], 'note': TODO_NOTE})
                for i in p:
                    apply(edges[i])
                rewalked = True
                continue
            rewalked = False
            pick = todo[0]
            src = edges[pick]['from']
            if src != box and src not in seen:
                steps.append({'on': [src], 'note': TODO_NOTE})
                active = {src}
                seen.add(src)
        else:
            def rank(i):                                    # the main line first: on from the card just entered
                f, t = edges[i]['from'], edges[i]['to']
                return (0 if f in last else 1, 0 if (t not in seen and not is_end(t)) else 1 if f == t else 2 if not is_end(t) else 3, i)
            pick = min(ready, key=rank)
            rewalked = False
        steps.append({'go': ids[pick], 'note': TODO_NOTE})
        apply(edges[pick])
        todo.remove(pick)
        drawn.append(pick)
    for s in ch['states']:
        if s not in seen and not any(e['to'] == s for e in edges):
            steps.append({'on': [s], 'note': TODO_NOTE})
            seen.add(s)
    ex = ch.get('exit')
    if ex:
        if ex['from'] not in active:
            p = path_to(lambda c: c == ex['from'], drawn)
            if p and len(p) <= 2:
                steps.append({'go': [ids[i] for i in p] if len(p) > 1 else ids[p[0]], 'note': TODO_NOTE})
            elif ex['from'] not in seen:
                steps.append({'on': [ex['from']], 'note': TODO_NOTE})
        steps.append({'go': f"{ex['from']}>exit", 'note': TODO_NOTE})
    return steps


def to_film(m, title=None):
    """(film.json dict, warnings) for a Machine."""
    normalize(m)
    plans = plan_chapters(m)
    _link(m, plans)
    chapter_of = {}
    for i, p in enumerate(plans):
        chapter_of.setdefault(p['subject'], i)
    title = title or m.name or '导入的状态机'
    chapters, warnings = [], list(m.warnings)
    for i, p in enumerate(plans):
        states = {}
        cards = list(p['cards']) + [s for l in p['lanes'] for s in l['states'] if s not in p['cards']]
        if p['part'] is not None:
            cards = list(p['cards'])
        for j, c in enumerate(cards):
            n = m.nodes[c]
            st = {'label': n['label'], 'tag': n['tag'] or c, 'pin': PINS[j % len(PINS)]}
            if c in chapter_of and c != p['subject']:
                st['tag'] = f"{n['tag'] or c} ▸ {ROMAN[chapter_of[c]] if chapter_of[c] < len(ROMAN) else chapter_of[c] + 1}"
            if 'breaks' in m.marks.get(c, ()) or ERRORISH.search(c) or ERRORISH.search(n['label']):
                st['pin'], st['kind'] = 'red', 'error'
            elif WAITISH.search(c) or WAITISH.search(n['label']):
                st['kind'] = 'wait'
            states[c] = st
        ch = {'title': _title(m, p, title),
              'sub': TODO_SUB,
              'tagline': (m.name if p['subject'] == ROOT else f"{m.name} · {p['subject']}").strip(' ·') or 'imported statechart',
              'states': states}
        if p['start'] and p['start'] != p['subject']:
            ch['start'] = p['start']
        if p['box'] and (p['part'] is None):
            B = m.nodes[p['box']]
            regs = {'id': p['box']}
            if B['type'] == 'parallel':
                regs['title'] = B['label']
            regs['lanes'] = [{'id': l['id'], 'title': l['title'], 'tint': l['tint'], 'states': l['states'], 'start': l['start']} for l in p['lanes']]
            hist = B['history'] or any(m.nodes[l['node']]['history'] for l in p['lanes'] if l['node'] != p['box'])
            if hist:
                regs['history'] = True
            ch['regions'] = regs
        edges = []
        here = set(states) | ({p['box']} if p['box'] and p['part'] is None else set()) | {l['id'] for l in p['lanes']}
        for e in p['edges']:
            out = {'from': e['from'], 'to': e['to']}
            if e['label']:
                out['label'] = e['label']
            if e['if']:
                out['if'] = e['if']
            if e['when'] and not (_names_in(e['when']) & (set(m.nodes) - here)):   # a guard on a state of another chapter stays words
                out['when'] = e['when']
            if e['do']:
                out['do'] = e['do']
            if e['style']:
                out['style'] = e['style']
            if out not in edges:
                edges.append(out)
        ch['edges'] = edges
        used = {n for e in edges for k in ('when', 'do') if e.get(k) for n in _names_in(e[k])}
        if m.vars and used & set(m.vars):
            ch['vars'] = dict(m.vars)
        if p.get('exit'):
            ch['exit'] = p['exit']
        ch['steps'] = walk(ch, entry=i > 0 and bool(plans[i - 1].get('exit')))
        chapters.append(ch)
    film = {'title': title, 'series': title, 'language': 'zh', 'aspect': '3:4', 'voice': 'crayon-sister', 'chapters': chapters}
    if m.direction:
        film['flow'] = 'right' if m.direction in ('LR', 'RL') else 'down'
    if m.report:
        _attach_rules(m, chapters)
    warnings += label_warnings(film)
    return film, warnings + [w for w in m.warnings if w not in warnings]


def _attach_rules(m, chapters):
    """a /statechart report as rules lists: a broken rule goes to the chapter showing its bad state (never: that
    state, with TLC's path as `reported`), the rules that hold go to chapter 1; each broken rule gets a trace step."""
    rep = m.report
    placed = []
    for b in rep['broken']:
        trail = [(ev, cfg) for ev, cfg in b['trail'] if cfg]
        if not trail:
            m.warn(f'report: {b["name"]}: its path could not be read; kept as reported only')
            placed.append((0, {'id': b['name'], 'text': _decamel(b['name']), 'reported': {'holds': False, 'by': 'TLC', 'steps': b['steps']}}))
            continue
        path, events = [trail[0][1][0]], []
        for (ev, cfg), (_, before) in zip(trail[1:], trail):
            new = [s for s in cfg if s not in before]
            path.append(new[0] if new else next((s for s in cfg if any(t['source'] == s == t['target'] and t['event'] == ev for t in m.trans)), cfg[0]))
            events.append(ev)
        last_new = [s for s in trail[-1][1] if s not in (trail[-2][1] if len(trail) > 1 else [])] or trail[-1][1]
        bad = next((s for s in last_new if 'breaks' in m.marks.get(s, ())), last_new[0])
        ci = next((i for i, ch in enumerate(chapters) if bad in ch['states']), None)
        rule = {'id': b['name'], 'text': _decamel(b['name'])}
        if ci is None:
            m.warn(f'report: {b["name"]} breaks at {bad}, which is no card of the film; kept as reported only')
            ci = 0
        else:
            rule['never'] = bad
        rule['reported'] = {'holds': False, 'by': 'TLC', 'steps': b['steps'] or len(events), 'path': path, 'events': events}
        edges = _trail_edges(chapters[ci], trail)
        if edges:
            rule['reported']['edges'] = edges
        placed.append((ci, rule))
    for name in rep['holds']:
        rule = {'id': name, 'text': _decamel(name)}
        if re.search(r'deadlock', name, re.I):
            rule['stuck'] = False
        rule['reported'] = {'holds': True, 'by': 'TLC'}
        placed.append((0, rule))
    for ci, rule in placed:
        ch = chapters[ci]
        ch.setdefault('rules', []).append(rule)
        if rep['states'] is not None:
            ch['reported'] = {'by': 'TLC', 'states': rep['states'], 'steps': rep['steps']}
        if rule['reported']['holds'] is False:
            at = len(ch['steps']) - (1 if ch.get('exit') else 0)
            ch['steps'].insert(at, {'trace': rule['id'], 'note': TODO_NOTE})


def _trail_edges(ch, trail):
    """TLC's path as this chapter's edge ids, when every step is an arrow drawn here (else None)."""
    ids = _edge_ids(ch['edges'])
    out = []
    for (ev, cfg), (_, before) in zip(trail[1:], trail):
        new = [s for s in cfg if s not in before] or [s for s in cfg]
        hit = None
        for e, eid in zip(ch['edges'], ids):
            said = (e.get('label') or '') + (f" [{e['if']}]" if e.get('if') else '')      # the report writes "event [guard]"
            if ev in (said, e.get('label')) and e['from'] in before and e['to'] in new:
                hit = eid
                break
        if not hit:
            return None
        out.append(hit)
    return out


def _names_in(v):
    try:
        if isinstance(v, dict):
            out = set(v)
            for x in v.values():
                out |= modelcheck.names(modelcheck._value(x))
            return out
        return modelcheck.names(modelcheck.parse(v))
    except modelcheck.ExprError:
        return set()


def label_warnings(film):
    """the skill's rules on words: a card 2-6 characters, an arrow 8."""
    out = []
    for ci, ch in enumerate(film.get('chapters') or []):
        if len(ch.get('title') or '') > TITLE_MAX:
            out.append(f"chapter {ci + 1}: title {ch['title']!r} has {len(ch['title'])} characters (4-7 read best on the poster)")
        for sid, st in (ch.get('states') or {}).items():
            lab = st.get('label') or sid
            if len(lab) > CARD_MAX:
                out.append(f'chapter {ci + 1}: card {sid} {lab!r} has {len(lab)} characters (keep to {CARD_MAX}: what you see, like 配送中)')
        for e in ch.get('edges') or []:
            lab = e.get('label') or ''
            if len(lab) > ARROW_MAX:
                out.append(f"chapter {ci + 1}: arrow {e['from']}>{e['to']} {lab!r} has {len(lab)} characters (keep to {ARROW_MAX}: what happened, like 你付了钱)")
    return out


def import_file(src, fmt=None, title=None):
    """(film, warnings) for a source file."""
    return to_film(read_machine(src, fmt), title)


# ------------------------------------------------------------------ film -> the tree -> Mermaid / XState / SCXML
def film_machine(film):
    """a film.json as a Machine: one chapter is the machine itself; several are compound states joined by exits."""
    chapters = film.get('chapters') or []
    multi = len(chapters) > 1
    m = Machine(film.get('title') or 'film')
    owners = {}
    for ci, ch in enumerate(chapters):
        regs = ch.get('regions') or {}
        ids = set(ch.get('states') or {}) | ({regs.get('id') or 'together'} if regs else set()) | {l['id'] for l in regs.get('lanes', [])}
        ids |= {e['to'] for e in ch.get('edges') or [] if modelcheck._is_end(e['to'])}
        for x in ids:
            owners.setdefault(x, set()).add(ci)

    def P(ci, x):
        return f'c{ci + 1}_{x}' if multi and len(owners.get(x, ())) > 1 else x
    used = set(owners)
    exits = []
    for ci, ch in enumerate(chapters):
        scope = ROOT
        if multi:
            cid = f'ch{ci + 1}' if f'ch{ci + 1}' not in used else f'chapter{ci + 1}'
            scope = m._new(cid, ROOT, 'compound', label=ch.get('title') or cid)['id']
        regs = ch.get('regions')
        box, lane_node, inlane = None, {}, {}
        if regs:
            box = regs.get('id') or 'together'
            for l in regs['lanes']:
                for s in l['states']:
                    inlane[s] = l
        states = ch.get('states') or {}

        def make_box():
            lanes = regs['lanes']
            if len(lanes) == 1:
                b = m._new(P(ci, box), scope, 'compound', label=lanes[0].get('title') or regs.get('title') or box)
                lane_node[lanes[0]['id']] = b['id']
            else:
                b = m._new(P(ci, box), scope, 'parallel', label=regs.get('title') or box)
                for l in lanes:
                    R = m._new(P(ci, l['id']), b['id'], 'compound', label=l.get('title') or l['id'])
                    lane_node[l['id']] = R['id']
            if regs.get('history'):
                b['history'] = 'deep' if len(lanes) > 1 else 'shallow'
            return b
        made = False
        for sid, st in states.items():
            if sid in inlane and not made:
                make_box()
                made = True
            parent = lane_node[inlane[sid]['id']] if sid in inlane else scope
            m._new(P(ci, sid), parent, 'atomic', label=st.get('label') or sid, tag=st.get('tag'))
        if regs and not made:
            make_box()
        if regs:
            for l in regs['lanes']:
                ln = m.nodes[lane_node[l['id']]]
                ln['initial'] = P(ci, l.get('start') or l['states'][0])
        inner = set(inlane)
        outer = [s for s in states if s not in inner]
        edges = ch.get('edges') or []
        roots = [s for s in outer if not any(e['to'] == s and e['from'] != s for e in edges)]
        start = ch.get('start') or (box if regs and not roots else (roots[0] if roots else (next(iter(states), None))))
        m.nodes[scope]['initial'] = P(ci, start) if start else None
        for e in edges:
            to = e['to']
            if modelcheck._is_end(to):
                fid = P(ci, to)
                if fid not in m.nodes:
                    m._new(fid, scope, 'final', label='[*]')
                tgt = fid
            else:
                tgt = P(ci, to)
            label = e.get('label') or (e.get('text') or '').replace('\n', ' ').strip()
            m.add(P(ci, e['from']), tgt, label, e.get('if'), e.get('when'), e.get('do'), e.get('style'))
        for k, v in (ch.get('vars') or {}).items():
            if k in m.vars and m.vars[k] != v:
                m.warn(f'vars.{k}: chapters start it at different values; kept {m.vars[k]!r}')
            m.vars.setdefault(k, v)
        if ch.get('exit') and ci + 1 < len(chapters):
            nxt = f'ch{ci + 2}' if f'ch{ci + 2}' not in used else f'chapter{ci + 2}'
            exits.append((P(ci, ch['exit']['from']), nxt, re.sub(r'\s*[↓→]+\s*$', '', ch['exit'].get('label') or '')))
    for src, nxt, label in exits:
        m.add(src, nxt, label)
    m.root['initial'] = m.root['children'][0] if multi and m.root['children'] else m.root['initial']
    return m


def _mid(nid):
    return nid if re.fullmatch(r'[A-Za-z_][\w-]*', nid) else 's_' + re.sub(r'\W', '_', nid.encode('unicode_escape').decode('ascii'))


def to_mermaid(m):
    lines = []
    if m.name:
        lines += ['---', f'title: {m.name}', '---']
    lines.append('stateDiagram-v2')

    def q(s):
        return str(s).replace('"', '“')

    def edge_text(t):
        ev = (t['event'] or '').replace(':', '：')
        g = f" [{t['guard'] or t['when']}]" if (t['guard'] or t['when']) else ''
        return f' : {ev}{g}'.rstrip() if (ev or g) else ''

    def scope_of(t):
        """the innermost block holding both ends: Mermaid makes a state where it is first named, and [*] means
        the final state of the block it is written in."""
        tgt = t['target'] or t['source']
        inner = set(m.ancestors(m.nodes[tgt]['parent']))
        return next(a for a in m.ancestors(m.nodes[t['source']]['parent']) if a in inner)
    where = {}
    for t in m.trans:
        where.setdefault(scope_of(t), []).append(t)

    def emit(nid, ind):
        node = m.nodes[nid]
        kids = [c for c in node['children'] if m.nodes[c]['type'] not in ('final', 'history')]
        for c in kids:
            n = m.nodes[c]
            head = f'{ind}state "{q(n["label"])}" as {_mid(c)}' if n['label'] != c else f'{ind}state {_mid(c)}'
            if n['type'] == 'parallel':
                lines.append(head + ' {')
                regions = m.members(c)
                for i, r in enumerate(regions):
                    if i:
                        lines.append(ind + '    --')
                    R = m.nodes[r]
                    lines.append(f'{ind}    state "{q(R["label"])}" as {_mid(r)} {{' if R['label'] != r else f'{ind}    state {_mid(r)} {{')
                    emit(r, ind + '        ')
                    lines.append(ind + '    }')
                lines.append(ind + '}')
            elif n['type'] == 'compound':
                lines.append(head + ' {')
                emit(c, ind + '    ')
                lines.append(ind + '}')
            elif n['label'] != c:
                lines.append(head)
            else:
                lines.append(f'{ind}{_mid(c)}')
        if node['initial'] and node['type'] != 'parallel':
            lines.append(f"{ind}[*] --> {_mid(node['initial'])}")
        for t in where.get(nid, []):
            tgt = t['target'] or t['source']
            tg = '[*]' if m.nodes[tgt]['type'] == 'final' else _mid(tgt)
            lines.append(f"{ind}{_mid(t['source'])} --> {tg}{edge_text(t)}")
    emit(ROOT, '    ')
    return '\n'.join(lines) + '\n'


def to_xstate(m):
    need_id = set()
    hist_of = {}
    for n in m.nodes.values():
        if n['history'] and n['type'] in ('compound', 'parallel'):
            hist_of[n['id']] = n['id'] + '_hist'

    def target(t):
        tgt = t['target']
        if tgt is None:
            return None
        if tgt in hist_of and (t['source'] == tgt or tgt not in m.ancestors(t['source'])):
            need_id.add(hist_of[tgt])                        # re-entering a box that remembers: through its history
            return '#' + hist_of[tgt]
        if m.nodes[tgt]['parent'] == m.nodes[t['source']]['parent']:
            return tgt
        need_id.add(tgt)
        return '#' + tgt
    targets = [(t, target(t)) for t in m.trans]

    def node_json(nid):
        n = m.nodes[nid]
        o = {}
        if nid != ROOT and nid in need_id:
            o['id'] = nid
        if n['type'] in ('parallel', 'final'):
            o['type'] = n['type']
        tag = n['tag'] if n['tag'] and n['tag'] != nid else None
        if nid != ROOT and n['type'] != 'final' and (n['label'] != nid or tag):
            o['meta'] = {'label': n['label'], **({'tag': tag} if tag else {})}
        if n['type'] == 'compound' and n['initial']:
            o['initial'] = n['initial']
        on, always = {}, []
        for t, ref in targets:
            if t['source'] != nid:
                continue
            item = {}
            if ref is not None:
                item['target'] = ref
            if t['when'] and t['guard'] and t['guard'] != t['when']:
                item['guard'] = {'type': t['guard'], 'params': {'when': t['when']}}   # words for the film, logic for the checker
            elif t['guard'] or t['when']:
                item['guard'] = t['when'] or t['guard']
            if t['do']:
                item['actions'] = [{'type': 'assign', 'params': t['do']}]
            if t['event']:
                on.setdefault(t['event'], []).append(item)
            else:
                always.append(item)

        def simplify(items):
            items = [i['target'] if set(i) == {'target'} else i for i in items]
            return items[0] if len(items) == 1 else items
        if on:
            o['on'] = {k: simplify(v) for k, v in on.items()}
        if always:
            o['always'] = simplify(always)
        kids = [c for c in n['children'] if m.nodes[c]['type'] != 'history']
        if kids or nid in hist_of:
            o['states'] = {c: node_json(c) for c in kids}
            if nid in hist_of:
                h = {'type': 'history', 'history': 'deep' if n['type'] == 'parallel' or n['history'] == 'deep' else 'shallow'}
                if hist_of[nid] in need_id:
                    h = {'id': hist_of[nid], **h}
                o['states'][hist_of[nid]] = h
        return o
    out = {'id': re.sub(r'\s+', '-', m.name or 'film')}
    root = node_json(ROOT)
    if m.vars:
        out['context'] = dict(m.vars)
    out.update(root)
    return json.dumps(out, ensure_ascii=False, indent=2) + '\n'


def to_scxml(m):
    ET.register_namespace('', SCXML_NS)
    ET.register_namespace('scv', SCV_NS)

    def Q(t):
        return f'{{{SCXML_NS}}}{t}'

    def S(a):
        return f'{{{SCV_NS}}}{a}'
    root = ET.Element(Q('scxml'), {'version': '1.0', 'datamodel': 'ecmascript'})
    if m.name:
        root.set('name', m.name)
    if m.root['initial']:
        root.set('initial', m.root['initial'])
    if m.vars:
        dm = ET.SubElement(root, Q('datamodel'))
        for k, v in m.vars.items():
            expr = ('true' if v else 'false') if isinstance(v, bool) else repr(v) if isinstance(v, str) else str(v)
            ET.SubElement(dm, Q('data'), {'id': k, 'expr': expr})
    hist_of = {n['id']: n['id'] + '_hist' for n in m.nodes.values() if n['history'] and n['type'] in ('compound', 'parallel')}

    def emit(nid, parent_el):
        for c in m.nodes[nid]['children']:
            n = m.nodes[c]
            if n['type'] == 'history':
                continue
            tag = {'parallel': 'parallel', 'final': 'final'}.get(n['type'], 'state')
            el = ET.SubElement(parent_el, Q(tag), {'id': c})
            if n['label'] != c and n['type'] != 'final':
                el.set(S('label'), n['label'])
            if n['tag'] and n['tag'] != c:
                el.set(S('tag'), n['tag'])
            if n['type'] == 'compound' and n['initial']:
                el.set('initial', n['initial'])
            for t in m.trans:
                if t['source'] != c:
                    continue
                attrs = {}
                if t['event']:
                    ev = re.sub(r'\s+', '_', t['event'])
                    attrs['event'] = ev
                    if ev != t['event']:
                        attrs[S('label')] = t['event']
                if t['when']:
                    attrs['cond'] = t['when']
                if t['guard'] and t['guard'] != t['when']:
                    attrs[S('if')] = t['guard']
                tgt = t['target']
                if tgt:
                    attrs['target'] = hist_of[tgt] if tgt in hist_of and (c == tgt or tgt not in m.ancestors(c)) else tgt
                tr = ET.SubElement(el, Q('transition'), attrs)
                for k, v in (t['do'] or {}).items():
                    ET.SubElement(tr, Q('assign'), {'location': k, 'expr': str(v).lower() if isinstance(v, bool) else str(v)})
            if c in hist_of:
                h = ET.SubElement(el, Q('history'), {'id': hist_of[c], 'type': 'deep' if n['type'] == 'parallel' or n['history'] == 'deep' else 'shallow'})
                first = n['initial'] or (m.members(c)[0] if m.members(c) else None)
                if n['type'] == 'parallel':
                    first = ' '.join(m.nodes[r]['initial'] or r for r in m.members(c))
                if first:
                    ET.SubElement(h, Q('transition'), {'target': first})
            emit(c, el)
    emit(ROOT, root)
    ET.indent(root, space='  ')
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding='unicode') + '\n'


def export_film(film, to):
    m = film_machine(film)
    if to == 'mermaid':
        return to_mermaid(m)
    if to == 'xstate':
        return to_xstate(m)
    if to == 'scxml':
        return to_scxml(m)
    raise ImportError_(f'unknown export {to!r}; use one of {", ".join(EXPORTS)}')


# ------------------------------------------------------------------ schema
def schema_problems(spec):
    """film.json against references/film.schema.json when the jsonschema package is installed (else nothing)."""
    try:
        import jsonschema
    except ImportError:
        return []
    try:
        schema = json.loads(SCHEMA.read_text())
        cls = jsonschema.validators.validator_for(schema)
        errs = sorted(cls(schema).iter_errors(spec), key=lambda e: [str(p) for p in e.absolute_path])
    except Exception as e:                                  # a broken schema or an old jsonschema must not stop check
        return [f'schema: not checked ({e.__class__.__name__}: {str(e)[:80]})']
    return [f"schema: {'/'.join(str(p) for p in e.absolute_path) or '(film)'}: {e.message[:200]}" for e in errs[:20]]


# ------------------------------------------------------------------ command line
def cli(argv, new_job=None):
    cmd, rest = argv[0], argv[1:]
    if cmd == 'import':
        ap = argparse.ArgumentParser(prog='scv.py import', description='turn an existing state machine into a film.json skeleton '
                                     '(XState v5 .json/.js/.ts, Mermaid stateDiagram, SCXML, PlantUML, or a /statechart output '
                                     'folder with chart.mmd + report.md); see references/import-export.md')
        ap.add_argument('src', help='the state machine file, or a /statechart chart folder')
        ap.add_argument('job', help='the job folder to make (film.json + scenes.js)')
        ap.add_argument('--format', choices=FORMATS, help='default: from the file name and content')
        ap.add_argument('--title', help='the film title (default: the machine name)')
        ap.add_argument('--force', action='store_true', help='overwrite an existing film.json')
        a = ap.parse_args(rest)
        job = Path(a.job).resolve()
        if (job / 'film.json').exists() and not a.force:
            raise SystemExit(f'{job / "film.json"} exists; pass --force to overwrite it')
        film, warnings = import_file(a.src, a.format, a.title)
        job.mkdir(parents=True, exist_ok=True)
        (job / 'film.json').write_text(json.dumps(film, ensure_ascii=False, indent=1))
        if new_job:
            new_job(job, film['title'])
        n_states = sum(len(c['states']) for c in film['chapters'])
        n_edges = sum(len(c['edges']) for c in film['chapters'])
        n_steps = sum(len(c['steps']) for c in film['chapters'])
        print(f"imported {a.src}: {len(film['chapters'])} chapters, {n_states} cards, {n_edges} arrows, {n_steps} steps -> {job / 'film.json'}")
        for w in warnings:
            print('  warning:', w)
        print('next: rewrite the labels as the skill asks (cards 2-6 characters, arrows 8), write every TODO caption, '
              f'then scv.py check {job} and scv.py layout {job}')
        return 0
    if cmd == 'export':
        ap = argparse.ArgumentParser(prog='scv.py export', description='write a film.json as Mermaid stateDiagram-v2, an XState v5 config (JSON) or SCXML')
        ap.add_argument('job', help='the job folder (or a film.json)')
        ap.add_argument('--to', required=True, choices=EXPORTS)
        ap.add_argument('-o', '--out', help='file to write (default: print)')
        a = ap.parse_args(rest)
        p = Path(a.job)
        film = json.loads((p if p.suffix == '.json' else p / 'film.json').read_text())
        text = export_film(film, a.to)
        if a.out:
            Path(a.out).write_text(text)
            print('wrote', a.out)
        else:
            sys.stdout.write(text)
        return 0
    raise SystemExit(f'unknown command {cmd}')


if __name__ == '__main__':
    sys.exit(cli(sys.argv[1:]))

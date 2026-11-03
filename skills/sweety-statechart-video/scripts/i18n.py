#!/usr/bin/env python3
"""Other languages for a film: film.json's `i18n` block merged into a localised film spec. Pure Python.

  i18n.py JOB --lang en      write JOB/lang/en/ (localised film.json + a copy of scenes.js) and print its warnings

  localize(spec, lang) -> (localised spec, warnings)
  sibling(job, spec, lang) -> JOB/lang/<lang>/, a normal job folder, so every scv.py command runs there unchanged
  caption_max(language, note) -> caption length rule: 24 for Chinese / Japanese / Korean, 42 for other scripts
  uses_words(language) -> True when ASR is checked word by word (WER) instead of character by character (CER)

The block (every field optional; what is missing stays as written, and `check` / this script warn about it):
  "i18n": {"en": {"title", "series", "voice", "say": {...}, ...any film-level field,
                  "chapters": [{"title", "sub", "tagline",
                                "states": {id: {"label", "tag"}},
                                "edges": {edge id ("a>b", "a>b#2", or its "id"): {"label", "if", "text"}},
                                "steps": [{"note", "say", "tone"}],          # by position
                                "rule": {"stamp"}, "exit": {"label"}, "regions": {"title", "lanes": [{"title"}]}}]}}
The Chinese `say` readings (film and step) are dropped unless the block gives its own: they would be read in Chinese.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import sys

CJK_LANGUAGES = {'zh', 'yue', 'wuu', 'ja', 'ko', 'cmn', 'nan', 'hak'}
CHARACTER_LANGUAGES = CJK_LANGUAGES | {'th', 'lo', 'my', 'km', 'bo'}   # no spaces between words: compare characters
CAPTION_CJK, CAPTION_LATIN = 24, 42


def base_language(language):
    return str(language or '').split('-')[0].split('_')[0].lower()


def caption_max(language, note=''):
    """24 characters for a Chinese / Japanese / Korean caption, 42 for Latin and other spaced scripts. Without a
    language, a caption that is mostly Latin letters gets the Latin rule."""
    base = base_language(language)
    if base:
        return CAPTION_CJK if base in CJK_LANGUAGES else CAPTION_LATIN
    letters = re.findall(r'[A-Za-zÀ-ɏ]', note or '')
    return CAPTION_LATIN if len(letters) > len(re.sub(r'\s', '', note or '')) / 2 else CAPTION_CJK


def uses_words(language):
    base = base_language(language) or 'zh'
    return base not in CHARACTER_LANGUAGES


# ------------------------------------------------------------------------------------------- numbers (say hints)

ONES = ('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen '
        'seventeen eighteen nineteen').split()
TENS = 'zero ten twenty thirty forty fifty sixty seventy eighty ninety'.split()


def english_int(n):
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ('-' + ONES[n % 10] if n % 10 else '')
    if n < 1000:
        return ONES[n // 100] + ' hundred' + (' ' + english_int(n % 100) if n % 100 else '')
    for size, name in ((10 ** 9, 'billion'), (10 ** 6, 'million'), (1000, 'thousand')):
        if n >= size:
            return english_int(n // size) + ' ' + name + (' ' + english_int(n % size) if n % size else '')
    return str(n)


def english_number(term):
    """'3' -> 'three', '2.5' -> 'two point five', '50%' -> 'fifty percent' (a say hint; VoxCPM2 reads no digits)."""
    percent = term.endswith('%')
    whole, _, fraction = term.rstrip('%').partition('.')
    said = english_int(int(whole)) if len(whole) < 13 else ' '.join(ONES[int(d)] for d in whole)
    if fraction:
        said += ' point ' + ' '.join(ONES[int(d)] for d in fraction)
    return said + (' percent' if percent else '')


# ------------------------------------------------------------------------------------------- merging

def _edge_ids(ch):
    seen, out = {}, []
    for e in ch.get('edges') or []:
        base = f"{e['from']}>{e['to']}"
        seen[base] = seen.get(base, 0) + 1
        out.append(e.get('id') or (base if seen[base] == 1 else f'{base}#{seen[base]}'))
    return out


def _deep(base, over):
    if isinstance(base, dict) and isinstance(over, dict):
        out = dict(base)
        for key, value in over.items():
            out[key] = _deep(base.get(key), value)
        return out
    return over


def _merge_chapter(ch, tr, where, warnings):
    ch = json.loads(json.dumps(ch))
    for key, value in tr.items():
        if key == 'states':
            for sid, fields in value.items():
                if sid not in (ch.get('states') or {}):
                    warnings.append(f'{where}: states.{sid} is not a state of this chapter')
                    continue
                ch['states'][sid] = _deep(ch['states'][sid], fields)
        elif key == 'edges':
            ids = _edge_ids(ch)
            for eid, fields in value.items():
                if eid not in ids:
                    warnings.append(f"{where}: edges.{eid} matches no arrow (arrows: {', '.join(ids)})")
                    continue
                k = ids.index(eid)
                ch['edges'][k] = _deep(ch['edges'][k], fields)
        elif key == 'steps':
            steps = [st if isinstance(st, dict) else {'note': st} for st in ch.get('steps') or []]
            if len(value) > len(steps):
                warnings.append(f'{where}: {len(value)} translated steps for {len(steps)} steps')
            for k, fields in enumerate(value[:len(steps)]):
                fields = {'note': fields} if isinstance(fields, str) else fields
                if 'say' not in fields:
                    steps[k].pop('say', None)                 # the Chinese reading would be read aloud
                steps[k] = _deep(steps[k], fields)
            ch['steps'] = steps
        elif key == 'regions' and isinstance(value, dict) and ch.get('regions'):
            lanes = value.get('lanes')
            regions = _deep(ch['regions'], {k: v for k, v in value.items() if k != 'lanes'})
            own = regions.get('lanes') or []
            if isinstance(lanes, dict):
                regions['lanes'] = [_deep(lane, lanes.get(lane.get('id'), {})) for lane in own]
            elif isinstance(lanes, list):
                regions['lanes'] = [_deep(lane, lanes[k]) if k < len(lanes) else lane for k, lane in enumerate(own)]
            ch['regions'] = regions
        else:
            ch[key] = _deep(ch.get(key), value)
    return ch


def _untranslated(original, localised, where):
    """Visible words still exactly as in the original language."""
    left = []
    for key in ('title', 'sub'):
        if original.get(key) and localised.get(key) == original.get(key):
            left.append(key)
    for sid, state in (original.get('states') or {}).items():
        if state.get('label') and (localised['states'].get(sid) or {}).get('label') == state['label']:
            left.append(f'states.{sid}.label')
    for eid, a, b in zip(_edge_ids(original), original.get('edges') or [], localised.get('edges') or []):
        for field in ('label', 'if', 'text'):
            if a.get(field) and a.get(field) == b.get(field):
                left.append(f'edges.{eid}.{field}')
    for k, (a, b) in enumerate(zip(original.get('steps') or [], localised.get('steps') or [])):
        a = a if isinstance(a, dict) else {'note': a}
        if a.get('note') and a.get('note') == b.get('note'):
            left.append(f'steps[{k}].note')
    return [f'{where}: not translated: ' + ', '.join(left)] if left else []


def localize(spec, lang):
    """(film spec in `lang`, warnings). Raises SystemExit when the film has no i18n block for `lang`."""
    block = (spec.get('i18n') or {}).get(lang)
    if block is None:
        have = ', '.join(spec.get('i18n') or {}) or 'none'
        raise SystemExit(f'film.json has no i18n.{lang} block (languages: {have}); see references/film-spec.md')
    out = {key: json.loads(json.dumps(value)) for key, value in spec.items() if key not in ('i18n', 'say')}
    warnings = []
    for key, value in block.items():
        if key != 'chapters':
            out[key] = _deep(out.get(key), value)
    out['language'] = block.get('language', lang)
    chapters = block.get('chapters') or []
    if len(chapters) > len(spec.get('chapters') or []):
        warnings.append(f'i18n.{lang}: {len(chapters)} translated chapters for {len(spec["chapters"])} chapters')
    merged = []
    for ci, ch in enumerate(spec.get('chapters') or []):
        where = f'i18n.{lang} chapter {ci + 1}'
        tr = chapters[ci] if ci < len(chapters) else {}
        if 'steps' not in tr:                                 # still drop the Chinese readings
            tr = {**tr, 'steps': [{} for _ in ch.get('steps') or []]}
        local = _merge_chapter(ch, tr, where, warnings)
        warnings += _untranslated(ch, local, where)
        merged.append(local)
    out['chapters'] = merged
    out['localized'] = {'from': spec.get('language', 'zh'), 'lang': lang}
    return out, warnings


def sibling(job, spec, lang, quiet=False):
    """JOB/lang/<lang>/: the localised film.json (rewritten only when it changes) and a fresh copy of scenes.js."""
    if not re.fullmatch(r'[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*', lang or ''):
        raise SystemExit(f'--lang {lang!r}: use a language code such as en, ja, fr, pt-BR')
    job = Path(job).resolve()
    if (spec.get('localized') or {}).get('lang'):
        raise SystemExit(f'{job} is already the {spec["localized"]["lang"]} version; run --lang on the original job')
    film, warnings = localize(spec, lang)
    dest = job / 'lang' / lang
    dest.mkdir(parents=True, exist_ok=True)
    text = json.dumps(film, ensure_ascii=False, indent=1)
    path = dest / 'film.json'
    if not path.is_file() or path.read_text() != text:
        path.write_text(text)
    if (job / 'scenes.js').is_file():
        shutil.copy2(job / 'scenes.js', dest / 'scenes.js')
    if not quiet:
        print(f'{lang} version: {dest}' + ''.join(f'\n  warning: {w}' for w in warnings), flush=True)
    return dest, warnings


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('job', type=Path)
    parser.add_argument('--lang', required=True)
    arguments = parser.parse_args()
    job = arguments.job.resolve()
    sibling(job, json.loads((job / 'film.json').read_text()), arguments.lang)
    return 0


if __name__ == '__main__':
    sys.exit(main())

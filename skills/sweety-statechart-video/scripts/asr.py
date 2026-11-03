"""Whisper ASR check for generated narration lines, in-process under the MLX Python.

Ported from sweety-handdraw-video 3.0.0 (commit 63154e4), scripts/align.py: text normalisation (spoken, numbers,
chinese_number), CER with the toneless-pinyin homophone fallback (covers), the "English ear" check (english_heard),
character timestamps from word times (char_times) and spoken-syllable counting. Changed: Whisper runs in this
process on numpy audio (model loaded once) instead of a subprocess per clip.
"""
from difflib import SequenceMatcher
from decimal import Decimal, InvalidOperation
import re
import unicodedata
import numpy as np

PUNCTUATION = set('，。！？；：、“”‘’（）《》〈〉【】—…·,.!?;:"\'()[]<>-~ \n\t')
CHINESE_DIGITS = dict(zip('零〇一二两三四五六七八九', (0, 0, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9)))
CHINESE_UNITS = {'十': 10, '百': 100, '千': 1000, '万': 10 ** 4, '亿': 10 ** 8}
NUMBER_DIGITS = '0-9零〇一二两三四五六七八九'
NUMBER_PATTERN = '[' + NUMBER_DIGITS + '十百千万亿]+(?:[.点][' + NUMBER_DIGITS + '十百千万亿]+)*'
MAX_CER = .15
LATIN_WORD = re.compile(r'[A-Za-z][A-Za-z\-]*')
SOUND_ALIKE = {'git': {'get'}, 'ai': {'ay', 'aye', 'a i'}}  # an English ear writes some correct words as sound-alikes
HEARD_RATIO = .75


# ------------------------------------------------------------------------------------------- text normalisation

def spoken(text):
    """Characters that are spoken: punctuation dropped, a decimal point between digits kept."""
    return ''.join(character for index, character in enumerate(text)
                   if character not in PUNCTUATION or (character == '.' and 0 < index < len(text) - 1
                       and text[index - 1].isdigit() and text[index + 1].isdigit()))


def chinese_number(text):
    """Exact Chinese/Arabic magnitude notation -> Arabic digits (for comparison only)."""
    normalized = ''.join(str(CHINESE_DIGITS.get(character, character)) for character in text).replace('点', '.')
    if re.search('[一二两三四五六七八九]{2}', text) and len(text) < 4:  # 两三万, 四五十: an approximation, not 23
        return text

    def value(token):
        for unit in ('亿', '万'):
            if unit in token:
                if token.count(unit) != 1:
                    raise ValueError('Repeated magnitude')
                left, right = token.split(unit)
                return value(left or '1') * CHINESE_UNITS[unit] + (value(right) if right else 0)
        total, previous, cursor = Decimal(0), 10000, 0
        for match in re.finditer(r'([0-9]+(?:\.[0-9]+)?)?([十百千])', token):
            if match.start() != cursor or CHINESE_UNITS[match[2]] >= previous:
                raise ValueError('Invalid small-unit order')
            previous = CHINESE_UNITS[match[2]]
            total += Decimal(match[1] or '1') * previous
            cursor = match.end()
        return total + (Decimal(token[cursor:]) if token[cursor:] else 0)

    try:
        result = format(value(normalized), 'f')
        return result.rstrip('0').rstrip('.') if '.' in result else result
    except (InvalidOperation, ValueError):
        return text


def numbers(text):
    text = unicodedata.normalize('NFKC', text)
    text = re.sub(r'(?<=\d),(?=\d{3}(?:\D|$))', '', text)
    text = re.sub('百分之(' + NUMBER_PATTERN + ')', lambda match: chinese_number(match[1]) + '%', text)
    text = re.sub(NUMBER_PATTERN, lambda match: chinese_number(match[0]), text)
    return re.sub(r'-(?=\d)', '负', text)


def edit_rate(expected, actual):
    """Levenshtein distance over any two sequences, divided by the expected length."""
    row = np.arange(len(actual) + 1)
    for index, item in enumerate(expected, 1):
        previous, row = row, np.empty_like(row)
        row[0] = index
        for column, other in enumerate(actual, 1):
            row[column] = min(previous[column] + 1, row[column - 1] + 1, previous[column - 1] + (item != other))
    return float(row[-1] / max(1, len(expected)))


def accent_merged(syllable):
    for retroflex, flat in (('zh', 'z'), ('ch', 'c'), ('sh', 's')):
        if syllable.startswith(retroflex):
            syllable = flat + syllable[2:]
            break
    if syllable.startswith('n') and syllable not in ('n', 'ng'):
        syllable = 'l' + syllable[1:]
    for back, front in (('ang', 'an'), ('eng', 'en'), ('ing', 'in')):
        if syllable.endswith(back):
            return syllable[:-len(back)] + front
    return syllable


def syllables(text):
    from pypinyin import lazy_pinyin
    return [accent_merged(item) for item in lazy_pinyin(text, errors=lambda other: list(other))]


def anchored(expected, actual, error, max_cer, end_slack=2):
    blocks = [block for block in SequenceMatcher(None, expected, actual, autojunk=False).get_matching_blocks() if block.size]
    return bool(blocks) and error <= max_cer and blocks[0].a <= 2 and blocks[-1].a + blocks[-1].size >= len(expected) - end_slack


def covers(expected, actual, max_cer=MAX_CER, end_slack=0):
    """ASR must cover the whole reading: CER <= max_cer, matched near both ends (numbers compared by value). A failing
    character comparison is re-checked on toneless pinyin: Whisper writes rare characters as common homophones."""
    raw_expected, raw_actual = expected.lower(), actual.lower()
    expected, actual = spoken(numbers(raw_expected)), spoken(numbers(raw_actual))
    error = edit_rate(expected, actual)
    result = {'cer': round(error, 3), 'status': 'pass' if anchored(expected, actual, error, max_cer, end_slack) else 'fail',
              'asr_text': raw_actual}
    if result['status'] == 'fail':
        try:
            pairs = [(syllables(e), syllables(a)) for e, a in ((expected, actual), (spoken(raw_expected), spoken(raw_actual)))]
        except ImportError:
            result['pinyin'] = 'unavailable'
        else:
            scored = [(edit_rate(e, a), e, a) for e, a in pairs]
            pinyin_error, expected_syllables, actual_syllables = min(scored, key=lambda item: item[0])
            result['pinyin_cer'] = round(pinyin_error, 3)
            if anchored(expected_syllables, actual_syllables, pinyin_error, max_cer, end_slack):
                result.update(status='pass', matched_by='pinyin')
    return result


def english_words(text):
    return [word.lower() for word in LATIN_WORD.findall(text)]


def spoken_syllables(text):
    """One per CJK character, vowel groups per Latin word (short all-caps acronyms letter by letter), one per digit."""
    count = 0
    for token in re.findall(r'[\u3400-\u9fff\uf900-\ufaff]|[A-Za-z]+|\d', text):
        if len(token) == 1 and '\u3400' <= token <= '\ufaff' or token.isdigit():
            count += 1
        elif token.isupper() and len(token) <= 5:
            count += len(token) + sum(letter == 'W' for letter in token)
        else:
            groups = re.findall(r'[aeiouy]+', token.lower())
            count += max(1, len(groups) - (token.lower().endswith('e') and len(groups) > 1))
    return count


def char_times(text, words):
    """(start, end) seconds for every spoken character of text through recognised word times, and the matched share."""
    recognized = []
    for word in words:
        characters = spoken(word['text'])
        step = (word['end'] - word['start']) / max(1, len(characters))
        recognized += [(character, word['start'] + index * step, word['start'] + (index + 1) * step) for index, character in enumerate(characters)]
    expected = spoken(text)
    times = [None] * len(expected)
    matcher = SequenceMatcher(None, expected.lower(), ''.join(item[0] for item in recognized).lower(), autojunk=False)
    for tag, a0, a1, b0, b1 in matcher.get_opcodes():
        if tag == 'equal' or (tag == 'replace' and a1 - a0 == b1 - b0):
            for offset in range(a1 - a0):
                times[a0 + offset] = recognized[b0 + offset][1:]
    known = [index for index, value in enumerate(times) if value]
    if not known:
        raise ValueError('Timestamps do not match the text')
    for index, value in enumerate(times):
        if value is None:
            left = max((k for k in known if k < index), default=None)
            right = min((k for k in known if k > index), default=None)
            start = times[left][1] if left is not None else times[right][0]
            end = times[right][0] if right is not None else times[left][1]
            times[index] = (start, max(start, end))
    return times, round(len(known) / len(expected), 3)


# ------------------------------------------------------------------------------------------- Whisper in-process

class Whisper:
    """Local mlx_whisper on 48 kHz numpy clips; the model folder must already exist (audio_env.whisper_model)."""
    def __init__(self, model_dir, language='zh'):
        import mlx_whisper  # noqa: F401  (fail early if the MLX Python lacks it)
        self.model = str(model_dir)
        self.language = language
        try:
            from opencc import OpenCC
            self.convert = OpenCC('t2s').convert if language == 'zh' else (lambda text: text)
        except ImportError:
            self.convert = lambda text: text

    def _run(self, samples, **options):
        import mlx_whisper
        from scipy.signal import resample_poly
        import mlx.core as mx
        audio = resample_poly(np.asarray(samples, np.float64), 1, 3).astype(np.float32)  # 48 kHz -> 16 kHz
        result = mlx_whisper.transcribe(audio, path_or_hf_repo=self.model, **options)
        mx.clear_cache()  # keep MLX's buffer cache from growing next to VoxCPM (see voice.Engine.synthesize)
        return result

    def transcribe(self, samples, initial_prompt=None):
        """{'text', 'words': [{'text', 'start', 'end'}]} with word timestamps, simplified Chinese."""
        result = self._run(samples, language=self.language, word_timestamps=True, initial_prompt=initial_prompt,
                           condition_on_previous_text=False)
        words = [{'text': self.convert(word['word']).strip(), 'start': float(word['start']), 'end': float(word['end'])}
                 for segment in result['segments'] for word in segment.get('words', [])]
        return {'text': self.convert(result['text']).strip(), 'words': words}

    def english_heard(self, samples, text, exceptions=()):
        """Which English words of a Chinese line an English ear hears: Chinese recognition locates the Latin words (it is
        lenient), each span is cut out and transcribed as English (handdraw: "bug", "git", "Amp" passed the Chinese check
        but an English ear heard "the", "kit", "Empire")."""
        expected = english_words(text)
        if not expected:
            return {'status': 'pass', 'words': [], 'heard': ''}
        found = self.transcribe(samples, initial_prompt='以下是普通话的句子，夹有英文词。')
        spans = []
        for word in found['words']:
            if re.search('[A-Za-z]', word['text']):
                if spans and word['start'] - spans[-1][1] < .12:
                    spans[-1] = (spans[-1][0], word['end'])
                else:
                    spans.append((word['start'], word['end']))
        heard_parts = []
        for start, end in spans:
            a, b = max(0, round((start - .1) * 48000)), min(len(samples), round((end + .1) * 48000))
            if b - a > 4800:
                heard_parts.append(self._run(samples[a:b], language='en', temperature=0.)['text'].strip())
        heard = ' '.join(heard_parts)
        tokens = re.findall(r'[a-z]+', heard.lower())
        candidates = set(tokens) | {a + b for a, b in zip(tokens, tokens[1:])}
        lowered = {word.lower() for word in exceptions}

        def hit(word):
            if word in lowered:
                return True
            word = word.replace('-', '')
            alike = SOUND_ALIKE.get(word, set()) | {word, word.rstrip('s') if len(word) > 3 else word}
            for token in candidates:
                if token in alike:
                    return True
                if len(word) <= 3:  # a short word must be heard as itself ("am" is not "amp")
                    if token.startswith(word) and len(token) <= len(word) + 2:
                        return True
                    continue
                if SequenceMatcher(None, word, token).ratio() >= HEARD_RATIO or word in token:
                    return True
            return any(' '.join(tokens[k:k + 2]) in alike for k in range(len(tokens)))
        words = [{'word': word, 'heard': hit(word)} for word in expected]
        return {'status': 'pass' if all(item['heard'] for item in words) else 'fail', 'words': words, 'heard': heard}

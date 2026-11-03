#!/usr/bin/env python3
"""eval_platforms.py: give the same film prompts to several agent CLIs (codex, grok, claude) and score their films.
The general form of output/platform-test/run.sh: N prompts x M agents, each run in its own folder, then scored.

usage: eval_platforms.py [--prompts FILE.json] [--only-prompts a,b] [--agents codex,claude] [--out DIR]
  (default)      dry run: print the plan (prompt x agent: folder and command) and exit; nothing is started
  --run          start the agents (--parallel N at a time, --timeout minutes each), then score
  --score DIR    score an existing OUT/<stamp> folder again; nothing is started
  --selftest     score a fake run in a temp folder (needs ffmpeg); no agent is called

Folders: OUT/<stamp>/<prompt>/<agent>/ holds run.log, meta.json, score.json and job/ (the task folder the agent is
told to use); OUT/<stamp>/summary.json and summary.md hold the table. OUT defaults to <repo>/output/platform-eval.
Prompts file: a JSON list of {"id", "text", "aspect", "duration"?}. In text, {job} is the task folder and {aspect}
the ratio. "duration" is a target like 90, [60, 90] or "1-2分钟"; without it the target comes from the job's own
film.json (scv.target_duration; a silent film without "duration" has no upper bound).
Agents: codex (model from $CODEX_MODEL, default gpt-6-astra), grok, claude; the commands are run.sh's, as argv lists.

Score per run, 0-100:
  film       50   job/outputs/film.mp4 exists and is over 10 kB
  in_target  20   its ffprobe duration lies inside the target
  page       15   job/work/layout/report.json lists no page_errors (0 when there is no report)
  lint       15 * max(0, 1 - issues / 10) from `scv.py lint JOB` (0 when scripts/lint.py is missing or lint fails)
turns is approximate: lines of run.log that look like tool calls (codex "exec" blocks, ⏺ Bash(...)); null if none.
"""
import argparse
import concurrent.futures
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
SKILL = SCRIPTS.parent
REPO = SKILL.parent.parent
AGENTS = ('codex', 'grok', 'claude')
CLAUDE_TOOLS = 'Bash(python3:*) Bash(bash:*) Bash(ls:*) Bash(mkdir:*) Bash(ffprobe:*) Read Write Edit Glob Grep'
MIN_FILM = 10_000                                   # bytes; a film.mp4 smaller than this is a failed mux
TOOL_LINE = re.compile(r'^(exec|tool)\s*$|^(exec|tool) |^\s*[⏺●]\s|^\s*(Bash|Read|Write|Edit|Glob|Grep)\(')

TAIL = ('任务目录用 {job} 。按技能说明依次完成 check、layout、写 scenes.js、plan、render、posters、finalize。\n'
        '完成后只回复两行：成片 mp4 的绝对路径，以及你遇到的问题（没有就写“无”）。')
PROMPTS = [
    {'id': 'tea', 'aspect': '1:1', 'text':
        '请使用 sweety-statechart-video 技能，把「泡一杯茶」这个过程做成一部蜡笔状态图短片。\n'
        '要求：1 章，6–8 步，带一个岔路（比如水没烧开就再等一会儿）；无旁白（film.json 里写 "voice": "none"）；'
        '比例 {aspect}；插画要有会动的东西（比如水壶冒气、火在跳）。\n' + TAIL},
    {'id': 'parcel', 'aspect': '3:4', 'text':
        '请使用 sweety-statechart-video 技能，把「一个快递从下单到签收」这个过程做成一部蜡笔状态图短片。\n'
        '要求：2 章（第一章下单到运输，第二章派送到签收），每章 4–6 步，第二章带一个岔路（没人在家就放驿站）；'
        '无旁白（film.json 里写 "voice": "none"）；比例 {aspect}；插画要有会动的东西（比如传送带在转、快递车在开）。\n' + TAIL},
    {'id': 'login', 'aspect': '9:16', 'text':
        '请使用 sweety-statechart-video 技能，把「登录失败与重试」这个过程做成一部蜡笔状态图短片。\n'
        '要求：1 章，6–8 步，带一个岔路（密码错了回到输入框重试，连错三次就锁定）；无旁白（film.json 里写 "voice": "none"）；'
        '比例 {aspect}；插画要有会动的东西（比如光标在闪、小锁在晃）。\n' + TAIL},
]


def now():
    return time.strftime('%Y-%m-%dT%H:%M:%S')


def read_json(f):
    try:
        return json.loads(Path(f).read_text())
    except (OSError, ValueError):
        return None


def prompt_text(p, job):
    return p['text'].replace('{job}', str(job)).replace('{aspect}', str(p.get('aspect', '')))


def argv_for(agent, run_dir, text):
    """the commands of run.sh / run-codex.sh, as argv lists (no shell)."""
    if agent == 'codex':
        return ['codex', 'exec', '-m', os.environ.get('CODEX_MODEL') or 'gpt-6-astra', '-s', 'workspace-write',
                '--skip-git-repo-check', '-C', str(run_dir), text]
    if agent == 'grok':
        return ['grok', '-p', text, '--cwd', str(run_dir), '--yolo', '--max-turns', '150', '--no-auto-update']
    if agent == 'claude':
        return ['claude', '-p', text, '--permission-mode', 'acceptEdits', '--allowedTools', CLAUDE_TOOLS,
                '--add-dir', str(SKILL)]
    raise SystemExit(f'unknown agent {agent} (known: {", ".join(AGENTS)})')


def plan_runs(prompts, agents, stamp_dir):
    runs = []
    for p in prompts:
        for a in agents:
            d = stamp_dir / p['id'] / a
            text = prompt_text(p, d / 'job')
            runs.append({'dir': d, 'agent': a, 'argv': argv_for(a, d, text),
                         'prompt': {'id': p['id'], 'aspect': p.get('aspect'), 'duration': p.get('duration'), 'text': text}})
    return runs


def short(r):
    """the command for the plan: the prompt cut short, the run folder as $RUN and the skill folder as $SKILL."""
    text = r['prompt']['text']
    m = re.search(r'「[^」]{1,24}」', text)
    cmd = shlex.join(('…' + m.group(0) + '…' if m else text[:28] + '…') if x == text else x for x in r['argv'])
    return cmd.replace(str(r['dir']), '$RUN').replace(str(SKILL), '$SKILL')


# ------------------------------------------------------------------ running
def run_one(r, timeout_s):
    d = r['dir']
    d.mkdir(parents=True, exist_ok=True)
    meta = {'prompt': r['prompt'], 'agent': r['agent'], 'argv': r['argv'], 'start': now()}
    (d / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    env = {k: v for k, v in os.environ.items() if k != 'CLAUDECODE'}   # claude -p refuses to start "inside" a session
    t0, code, timed_out = time.time(), None, False
    with open(d / 'run.log', 'w') as log:
        try:                                         # stdin closed: codex exec otherwise waits to read more input
            p = subprocess.Popen(r['argv'], cwd=d, env=env, stdin=subprocess.DEVNULL, stdout=log,
                                 stderr=subprocess.STDOUT, start_new_session=True)
        except OSError as e:
            log.write(f'cannot start {r["agent"]}: {e}\n')
        else:
            try:
                code = p.wait(timeout=timeout_s)
            except subprocess.TimeoutExpired:        # the agent's own children (render, Chrome) go too
                timed_out = True
                for sig, wait in ((signal.SIGTERM, 15), (signal.SIGKILL, None)):
                    try:
                        os.killpg(p.pid, sig)
                        code = p.wait(timeout=wait)
                        break
                    except (ProcessLookupError, subprocess.TimeoutExpired):
                        pass
                code = p.wait() if code is None else code
        log.write(f'\n{r["agent"]} exit {code}{" (timeout)" if timed_out else ""}\n')
    meta.update(end=now(), exit_code=code, timed_out=timed_out, wall_seconds=round(time.time() - t0, 1))
    (d / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    return meta


def run_all(runs, parallel, timeout_min):
    print(f'running {len(runs)} agent runs, {parallel} at a time, {timeout_min:g} min each at most')
    with concurrent.futures.ThreadPoolExecutor(max_workers=parallel) as ex:
        futs = {ex.submit(run_one, r, timeout_min * 60): r for r in runs}
        for f in concurrent.futures.as_completed(futs):
            m, r = f.result(), futs[f]
            print(f'  done {r["prompt"]["id"]}/{r["agent"]}: exit {m["exit_code"]}'
                  f'{" (timeout)" if m["timed_out"] else ""} in {m["wall_seconds"] / 60:.1f} min')


# ------------------------------------------------------------------ scoring
def probe(f):
    try:
        r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(f)],
                           capture_output=True, text=True, timeout=60)
        return round(float(json.loads(r.stdout)['format']['duration']), 2)
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        return None


def target(duration, job):
    """[lo, hi] seconds (hi None = no upper bound) from the prompt's duration, else the job's film.json; None if neither."""
    try:
        sys.path.insert(0, str(SCRIPTS))
        import scv
        if duration is not None:
            lo, hi = scv.target_duration({'duration': duration, 'voice': 'none'})
        else:
            spec = read_json(job / 'film.json')
            if not isinstance(spec, dict):
                return None
            lo, hi = scv.target_duration(spec)
    except Exception as e:                            # a half-edited scv.py must not stop the scoring
        print(f'warning: no target for {job}: {e}', file=sys.stderr)
        return None
    return [round(lo, 1), None if hi >= 1e8 else round(hi, 1)]


def lint(job):
    """(issue count or None, error text or None) from `scv.py lint JOB`; never raises."""
    if not (SCRIPTS / 'lint.py').exists():
        return None, 'scripts/lint.py not found'
    if not (job / 'film.json').exists():
        return None, 'no job/film.json'
    try:
        r = subprocess.run([sys.executable, str(SCRIPTS / 'scv.py'), 'lint', str(job)],
                           capture_output=True, text=True, timeout=300)
    except (OSError, subprocess.TimeoutExpired) as e:
        return None, str(e)
    res = None
    for m in re.finditer(r'^[\[{]', r.stdout, re.M):          # the JSON may come after a line or two of text
        try:
            res = json.JSONDecoder().raw_decode(r.stdout, m.start())[0]
            break
        except ValueError:
            pass
    if res is None:
        return None, f'exit {r.returncode}, no JSON on stdout: {(r.stderr or r.stdout).strip()[-300:]}'
    if isinstance(res, dict) and isinstance(res.get('issues'), list):
        return len(res['issues']), None
    if isinstance(res, list):
        return len(res), None
    return None, 'lint JSON has no "issues" list'


def turns(log):
    try:
        n = sum(1 for line in log.read_text(errors='replace').splitlines() if TOOL_LINE.match(line))
    except OSError:
        return None
    return n or None


def score_run(d, min_film=MIN_FILM):
    meta = read_json(d / 'meta.json') or {}
    prompt = meta.get('prompt') or {}
    job, film = d / 'job', d / 'job/outputs/film.mp4'
    s = {'prompt': prompt.get('id') or d.parent.name, 'agent': meta.get('agent') or d.name, 'dir': str(d),
         'exit_code': meta.get('exit_code'), 'timed_out': meta.get('timed_out'), 'wall_seconds': meta.get('wall_seconds')}
    s['film'] = film.is_file() and film.stat().st_size > min_film
    s['film_bytes'] = film.stat().st_size if film.is_file() else None
    s['duration'] = probe(film) if film.is_file() else None
    s['target'] = target(prompt.get('duration'), job)
    dur, tg = s['duration'], s['target']
    s['in_target'] = bool(s['film'] and dur is not None and tg and dur >= tg[0] and (tg[1] is None or dur <= tg[1]))
    rep = read_json(job / 'work/layout/report.json')
    s['page_errors'] = len(rep.get('page_errors') or []) if isinstance(rep, dict) and 'page_errors' in rep else None
    s['lint_issues'], s['lint_error'] = lint(job)
    s['turns'], s['turns_approx'] = turns(d / 'run.log'), True
    lint_pts = 15 * max(0., 1 - s['lint_issues'] / 10) if s['lint_issues'] is not None else 0
    s['score'] = round(50 * s['film'] + 20 * s['in_target'] + 15 * (s['page_errors'] == 0) + lint_pts, 1)
    (d / 'score.json').write_text(json.dumps(s, ensure_ascii=False, indent=1))
    return s


def table(rows):
    def cell(v):
        return '–' if v is None else ('yes' if v is True else 'no' if v is False else str(v))
    head = ['prompt', 'agent', 'film', 'seconds', 'target', 'in', 'page err', 'lint', 'turns~', 'exit', 'min', 'score']
    lines = ['| ' + ' | '.join(head) + ' |', '|' + '---|' * len(head)]
    for s in rows:
        tg = s['target'] and f'{s["target"][0]:g}-{"" if s["target"][1] is None else format(s["target"][1], "g")}'
        mins = s['wall_seconds'] and round(s['wall_seconds'] / 60, 1)
        vals = [s['prompt'], s['agent'], s['film'], s['duration'], tg, s['in_target'], s['page_errors'],
                s['lint_issues'], s['turns'], 'timeout' if s['timed_out'] else s['exit_code'], mins, s['score']]
        lines.append('| ' + ' | '.join(cell(v) for v in vals) + ' |')
    by = {}
    for s in rows:
        by.setdefault(s['agent'], []).append(s['score'])
    means = ', '.join(f'{a} {sum(v) / len(v):.1f} ({sum(1 for s in rows if s["agent"] == a and s["film"])}/{len(v)} films)'
                      for a, v in by.items())
    return '\n'.join(lines) + f'\n\nmean score by agent: {means}\n'


def score_stamp(stamp_dir, min_film=MIN_FILM):
    stamp_dir = Path(stamp_dir).resolve()
    dirs = [d for d in sorted(stamp_dir.glob('*/*')) if d.is_dir() and ((d / 'meta.json').exists() or (d / 'job').exists())]
    if not dirs:
        raise SystemExit(f'no runs under {stamp_dir} (expected <prompt>/<agent>/meta.json)')
    rows = [score_run(d, min_film) for d in dirs]
    md = table(rows)
    (stamp_dir / 'summary.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    (stamp_dir / 'summary.md').write_text(f'# platform eval {stamp_dir.name}\n\n{md}\nturns~ is approximate. '
                                          'score = film 50 + in_target 20 + no page errors 15 + lint 15*(1-issues/10)\n')
    print(md + f'wrote {stamp_dir}/summary.json, summary.md and score.json per run')
    return rows


# ------------------------------------------------------------------ self test
def selftest():
    tmp = Path(tempfile.mkdtemp(prefix='scv-eval-'))
    stamp = tmp / 'selftest'
    good, empty = stamp / 'tea' / 'claude', stamp / 'tea' / 'grok'
    job = good / 'job'
    (job / 'outputs').mkdir(parents=True)
    (job / 'work/layout').mkdir(parents=True)
    empty.mkdir(parents=True)
    spec = json.loads((SKILL / 'examples/takeout/film.json').read_text())
    spec['voice'] = 'none'
    (job / 'film.json').write_text(json.dumps(spec, ensure_ascii=False, indent=1))
    film = job / 'outputs/film.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=320x240:d=2', '-f', 'lavfi',
                    '-i', 'anullsrc', '-shortest', str(film)], check=True)
    (job / 'work/layout/report.json').write_text(json.dumps({'warnings': [], 'page_errors': []}))
    (good / 'run.log').write_text('exec\nbash -lc "python3 scv.py check job"\nexec\nbash -lc "ls"\ncodex exit 0\n')
    p = dict(PROMPTS[0], duration=[1, 3])
    for d, a in ((good, 'claude'), (empty, 'grok')):
        r = plan_runs([p], [a], stamp)[0]
        assert r['dir'] == d and str(d / 'job') in r['prompt']['text'], r
        meta = {'prompt': r['prompt'], 'agent': a, 'argv': r['argv'], 'start': now(), 'end': now(),
                'exit_code': 0, 'timed_out': False, 'wall_seconds': 1.0}
        (d / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    min_film = min(MIN_FILM, film.stat().st_size - 1)    # a 2 s white clip can be under 10 kB; relaxed here only
    rows = {s['agent']: s for s in score_stamp(stamp, min_film)}
    g, e = rows['claude'], rows['grok']
    keys = ('film', 'duration', 'target', 'in_target', 'page_errors', 'lint_issues', 'lint_error', 'turns', 'score')
    assert all(k in g and k in e for k in keys), (g, e)
    assert g['film'] and 1.5 < g['duration'] < 2.5 and g['in_target'] and g['page_errors'] == 0 and g['turns'] == 2, g
    assert g['score'] >= 85 and not e['film'] and e['duration'] is None and e['page_errors'] is None, (g, e)
    assert target(None, job) == [81.0, 99.0]                       # takeout: "1.5分钟", silent
    del spec['duration']
    (job / 'film.json').write_text(json.dumps(spec))
    assert target(None, job) == [0.0, None]                        # silent, no duration: no upper bound
    assert (stamp / 'summary.json').exists() and (stamp / 'summary.md').exists() and (good / 'score.json').exists()
    assert argv_for('codex', good, 'x')[:3] == ['codex', 'exec', '-m'] and '--add-dir' in argv_for('claude', good, 'x')
    shutil.rmtree(tmp)
    print('selftest ok')


def load_prompts(path):
    ps = read_json(path)
    if not isinstance(ps, list) or not all(isinstance(p, dict) and p.get('id') and p.get('text') for p in ps):
        raise SystemExit(f'{path}: expected a JSON list of {{"id", "text", "aspect", "duration"?}}')
    return ps


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0] + '\nDry run (print the plan) unless --run.',
                                 epilog=__doc__[__doc__.index('Score per run'):],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--prompts', metavar='FILE.json', help='a JSON list of {id, text, aspect, duration?} (default: '
                    + ', '.join(p['id'] for p in PROMPTS) + ')')
    ap.add_argument('--only-prompts', metavar='a,b', help='only these prompt ids')
    ap.add_argument('--agents', metavar='a,b', default=','.join(AGENTS), help='default: %(default)s')
    ap.add_argument('--out', metavar='DIR', type=Path, default=REPO / 'output/platform-eval',
                    help='default: <repo>/output/platform-eval')
    ap.add_argument('--run', action='store_true', help='start the agents, then score (otherwise: print the plan)')
    ap.add_argument('--parallel', metavar='N', type=int, default=3, help='agent runs at once (default: %(default)s)')
    ap.add_argument('--timeout', metavar='MIN', type=float, default=45, help='minutes per run (default: %(default)s)')
    ap.add_argument('--score', metavar='DIR', type=Path, help='score an existing OUT/<stamp> folder; run nothing')
    ap.add_argument('--selftest', action='store_true', help='score a fake run in a temp folder; run no agent')
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if a.score:
        return score_stamp(a.score)
    prompts = load_prompts(a.prompts) if a.prompts else PROMPTS
    if a.only_prompts:
        want = a.only_prompts.split(',')
        missing = set(want) - {p['id'] for p in prompts}
        if missing:
            ap.error(f'unknown prompt id(s): {", ".join(sorted(missing))}')
        prompts = [p for p in prompts if p['id'] in want]
    agents = [x.strip() for x in a.agents.split(',') if x.strip()]
    if not agents or set(agents) - set(AGENTS):
        ap.error(f'--agents: choose from {", ".join(AGENTS)}')
    stamp_dir = a.out.resolve() / time.strftime('%Y%m%d-%H%M%S')
    runs = plan_runs(prompts, agents, stamp_dir)
    if not a.run:
        print(f'plan: {len(prompts)} prompts x {len(agents)} agents = {len(runs)} runs in {stamp_dir}/\n'
              f'  $RUN = <stamp>/<prompt>/<agent> (run.log, meta.json; the task folder is $RUN/job), $SKILL = {SKILL}')
        for r in runs:
            print(f'  {r["prompt"]["id"]}/{r["agent"]}/\n    {short(r)}')
        print('dry run: nothing started. Add --run to start them.')
        return
    run_all(runs, max(1, a.parallel), a.timeout)
    score_stamp(stamp_dir)


if __name__ == '__main__':
    main()

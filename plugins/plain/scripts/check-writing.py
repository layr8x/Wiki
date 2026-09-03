#!/usr/bin/env python3
"""말 검사역 - 산출물 문서를 내보내기 전에 두 가지를 검사한다.

  1. 안 풀어쓴 전문용어  (같은 부서의 skills/jargon-gate/용어사전.md 기준)
  2. 번역투와 AI 티      (같은 부서의 scripts/ko_ai_score.py --mj)

부서 안에서 자립해 돈다. 어느 저장소에 설치하든 경로를 고칠 일이 없다.

사용:
  python3 <부서>/scripts/check-writing.py            # 바뀐 .md 자동 검사
  python3 <부서>/scripts/check-writing.py 파일.md    # 특정 파일 검사
  python3 <부서>/scripts/check-writing.py --hook     # Stop 훅용. 막을 땐 종료코드 2

위험이 있으면 종료코드 1(직접 실행) 또는 2(--hook). Stop 훅이 이걸 보고 작업을 막는다.
"""
import json, os, re, subprocess, sys
from pathlib import Path

PLUGIN = Path(__file__).resolve().parents[1]          # 부서 폴더
GLOSSARY = PLUGIN / 'skills/jargon-gate/용어사전.md'
SCORER = PLUGIN / 'scripts/ko_ai_score.py'
ROOT = Path(os.environ.get('CLAUDE_PROJECT_DIR') or Path.cwd())  # 검사 대상 저장소

# 검사에서 빼는 곳: 남이 만든 스킬, 용어를 정의하는 문서, 금지 패턴을 예시로 싣는 문서
# 검사에서 빼는 곳. 남이 만든 스킬, 용어를 정의하는 문서, 금지 패턴을 예시로 싣는 문서.
# 저장소마다 다른 예외는 desk.local.json 의 skip 배열에 적는다
SKIP = ['.agents/', 'node_modules/', '.claude/skills/', '.claude/plugins/',
        'skills/jargon-gate/용어사전.md', 'skills/no-translationese/SKILL.md',
        'CLAUDE.md', 'AGENTS.md']
_cfg = ROOT / '.claude-plugin' / 'desk.local.json'
if _cfg.exists():
    try:
        SKIP += json.loads(_cfg.read_text(encoding='utf-8')).get('skip', [])
    except Exception:
        pass

WINDOW = 150  # 용어 뒤 이 글자 수 안에 풀이가 있으면 통과


def load_terms():
    """용어사전에서 검사 대상을 뽑는다. 영문이 섞인 표제어만 대상(순한글 일반어는 오탐이 많다)."""
    terms = []
    if not GLOSSARY.exists():
        return terms
    for line in GLOSSARY.read_text(encoding='utf-8').splitlines():
        m = re.match(r'^\|\s*([^|]+?)\s*\|', line)
        if not m or m.group(1).startswith('---') or m.group(1) == '용어':
            continue
        head = m.group(1)
        if not re.search(r'[A-Za-z]', head):
            continue  # 순한글 일반어(평균, 중앙값 등)는 오탐이 많아 제외
        # 괄호 안은 첫 조각만 별명으로 쓴다. "토큰(token, AI)"에서 AI까지 용어로 잡히면 오탐이 난다
        aliases = [g.split(',')[0].strip() for g in re.findall(r'\(([^)]*)\)', head)]
        names = [n.strip() for n in re.sub(r'\([^)]*\)', '', head).split('·')]
        for part in names + aliases:
            if len(part) >= 2:
                terms.append(part)
    return sorted(set(terms), key=len, reverse=True)


def _pattern(t):
    """낱말 경계를 붙인다. 안 붙이면 '나머지'에서 '머지', 'report'에서 'repo'가 잡힌다."""
    if re.fullmatch(r'[A-Za-z0-9 .+-]+', t):
        return r'(?<![A-Za-z])' + re.escape(t) + r'(?![A-Za-z])'
    return r'(?<![가-힣])' + re.escape(t) + r'(?![가-힣])'


def strip_noncontent(text):
    """사람이 읽는 본문만 남긴다.

    앞머리 이름표(스킬 이름 local-context 등), 코드 덩어리, 홑따옴표 코드는 용어가 아니라
    식별자다. 여기서 잡으면 오탐만 늘어난다.
    """
    t = re.sub(r'\A---\n.*?\n---\n', '', text, flags=re.S)
    t = re.sub(r'```.*?```', ' ', t, flags=re.S)
    t = re.sub(r'`[^`\n]*`', ' ', t)
    return t


def check_jargon(text, terms):
    hits = []
    for t in terms:
        m = re.search(_pattern(t), text)
        if not m:
            continue
        # 풀이는 용어 뒤에도 앞에도 올 수 있다. FK(= Foreign Key, ...) 같은 형태
        near = text[max(0, m.start() - WINDOW):m.start() + WINDOW]
        if '(=' not in near:
            hits.append(t)
    return hits


def check_style(path):
    if not SCORER.exists():
        return None, ''
    out = subprocess.run([sys.executable, str(SCORER), str(path), '--mj'],
                         capture_output=True, text=True).stdout
    m = re.search(r'판정: 위험 (\d+) / 주의 (\d+)', out)
    if not m:
        return None, out
    return (int(m.group(1)), int(m.group(2))), out


def changed_docs():
    r = subprocess.run(['git', 'diff', '--name-only', 'HEAD', '--', '*.md'],
                       capture_output=True, text=True, cwd=ROOT)
    files = [f for f in r.stdout.split() if f]
    r2 = subprocess.run(['git', 'ls-files', '--others', '--exclude-standard', '--', '*.md'],
                        capture_output=True, text=True, cwd=ROOT)
    files += [f for f in r2.stdout.split() if f]
    return [f for f in dict.fromkeys(files) if not any(s in f for s in SKIP)]


def main():
    args = [a for a in sys.argv[1:] if a != '--hook']
    hook = '--hook' in sys.argv[1:]
    targets = args or changed_docs()
    if not targets:
        return 0
    terms = load_terms()
    danger_total = 0
    for f in targets:
        p = ROOT / f if not os.path.isabs(f) else Path(f)
        if not p.exists() or any(s in str(f) for s in SKIP):
            continue
        text = p.read_text(encoding='utf-8')
        body = strip_noncontent(text)
        jargon = check_jargon(body, terms)
        verdict, _ = check_style(p)
        lines = []
        if jargon:
            lines.append(f'   풀이 없는 용어 {len(jargon)}개: ' + ', '.join(jargon[:8]))
            danger_total += 1
        if verdict and verdict[0] > 0:
            lines.append(f'   문체 위험 {verdict[0]}건 (주의 {verdict[1]}건)'
                         f' - python3 {SCORER} {f} --mj 로 확인')
            danger_total += 1
        if lines:
            print(f'[막힘] {f}')
            print('\n'.join(lines))
        else:
            print(f'[통과] {f}')
    if danger_total:
        out = sys.stderr if hook else sys.stdout
        print(f'\n말 검사역: 위험 {danger_total}건. 고치고 다시 내보낼 것.', file=out)
        return 2 if hook else 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

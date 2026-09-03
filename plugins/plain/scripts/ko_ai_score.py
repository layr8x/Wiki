#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ko_ai_score.py - 한국어 글의 AI 티(기계 생성 신호)를 수치로 재는 측정기.

사용법:
    python3 tools/writing/ko_ai_score.py 글파일.txt          # 일반 기준(인간 평균)
    python3 tools/writing/ko_ai_score.py 글파일.txt --mj     # 김명준 실측 기준(더 엄격)
    cat 글.md | python3 tools/writing/ko_ai_score.py -       # 표준입력

근거(항목별 주석에 표기):
    [논문]   KatFishNet (ACL 2025 Findings, arXiv 2503.00032) - 한국어 AI 텍스트의
             쉼표 사용(AUC 94.88%), 품사 다양성(82.99%), 띄어쓰기 경직성(79.51%).
             AI 텍스트는 쉼표 포함 문장 약 61%, 인간 약 26%.
    [실측]   김명준 슬랙 116건 분석(analysis/문체지문_김명준.md v2):
             쉼표 문장 16~18%, 문장 길이 CV 0.75+, 줄표·첫째둘째·문두 접속부사 0회.
    [카탈로그] Wikipedia 'Signs of AI writing' + 한국어 40패턴(daleseo/korean-skills).
    [휴리스틱] 경험 기준, 신뢰도 낮음. 장르에 따라 오탐 가능(주석에 명시).

주의: 이 도구는 표면 신호만 잰다. 통과했다고 "명준 글"이 되는 게 아니라
      최소 조건일 뿐이다. 구조(불릿·밀도 불균형)와 목소리(1인칭 판단)는
      analysis/글쓰기_가이드_김명준.md 체크리스트로 따로 검수할 것.
"""
import re
import sys
import statistics

# ---------- 텍스트 준비 ----------

def strip_markup(text: str) -> str:
    text = re.sub(r'```.*?```', ' ', text, flags=re.S)      # 코드블록
    text = re.sub(r'^\|.*\|\s*$', ' ', text, flags=re.M)     # 표 행
    text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text)     # 링크
    text = re.sub(r'https?://\S+', ' ', text)
    text = re.sub(r'[#>*_`]', ' ', text)                     # md 기호
    return text

def split_sentences(text: str):
    sents = []
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        for p in re.split(r'(?<=[.!?])\s+', line):
            p = p.strip()
            if len(p) >= 2:
                sents.append(p)
    return sents

# ---------- 지표 ----------

AI_CLICHES = [
    '결론적으로', '종합하면', '종합해 보면', '요약하자면', '다시 말해',
    '살펴보겠습니다', '알아보겠습니다', '다음과 같습니다',
    '중요한 역할', '핵심적인', '효과적인', '혁신적인', '강력한', '완벽한',
    '뿐만 아니라', '그럼에도 불구하고', '주목할 만한', '괄목할',
    '다양한 측면', '전반적으로', '궁극적으로', '필수적',
]
TRANSLATIONESE = [
    '에 대해', '에 대한', '를 통해', '을 통해', '로 인해', '으로 인해',
    '에 의해', '에 있어서', '되어지', '하게 되었', '가지고 있', '보유하고 있',
    '존재한다', '위치하고 있',
]
HEAD_CONJ = ['그러나', '따라서', '또한', '한편', '더불어', '아울러', '나아가', '더욱이']

def judge(value, warn, danger, reverse=False):
    """reverse=False: 클수록 나쁨 / True: 작을수록 나쁨"""
    if reverse:
        if value <= danger: return '위험'
        if value <= warn: return '주의'
        return '양호'
    if value >= danger: return '위험'
    if value >= warn: return '주의'
    return '양호'

def analyze(text: str, mj: bool):
    plain = strip_markup(text)
    sents = split_sentences(plain)
    n = len(sents)
    if n < 5:
        print('문장이 5개 미만이라 측정 의미가 없습니다.')
        sys.exit(1)

    rows = []  # (지표, 측정값, 기준, 판정, 근거)

    # 1. 쉼표 포함 문장 비율 [논문][실측]
    comma = sum(1 for s in sents if ',' in s) / n
    w, d = (0.22, 0.30) if mj else (0.35, 0.45)  # 명준 실측 0.16~0.18 / AI 0.48+
    rows.append(('쉼표 포함 문장 비율', f'{comma:.2f}', f'주의 {w} / 위험 {d}',
                 judge(comma, w, d), '논문+실측'))

    # 2. 문장 길이 변동(CV) [실측][휴리스틱] - 낮으면 균일=기계 티
    lens = [len(s) for s in sents]
    cv = statistics.stdev(lens) / statistics.mean(lens) if len(lens) > 1 else 0
    w, d = (0.60, 0.45) if mj else (0.50, 0.35)  # 명준 실측 0.75+
    rows.append(('문장 길이 변동(CV)', f'{cv:.2f}', f'주의 {w} / 위험 {d} 미만',
                 judge(cv, w, d, reverse=True), '실측+휴리스틱'))

    # 3. AI 상투어 밀도(1000자당) [카탈로그]
    chars = max(len(plain), 1)
    cliche = sum(plain.count(c) for c in AI_CLICHES) / chars * 1000
    rows.append(('AI 상투어(1000자당)', f'{cliche:.2f}', '주의 0.8 / 위험 1.5',
                 judge(cliche, 0.8, 1.5), '카탈로그'))

    # 4. 번역투 밀도(1000자당) [카탈로그]
    trans = sum(plain.count(t) for t in TRANSLATIONESE) / chars * 1000
    rows.append(('번역투(1000자당)', f'{trans:.2f}', '주의 1.5 / 위험 3.0',
                 judge(trans, 1.5, 3.0), '카탈로그'))

    # 5. 문두 접속부사 [실측 0회][카탈로그]
    hc = sum(1 for s in sents for c in HEAD_CONJ if s.startswith(c))
    rows.append(('문두 접속부사(그러나/따라서/또한..)', str(hc), 'mj 기준 0 / 일반 주의 3+',
                 ('위험' if hc >= 1 else '양호') if mj else judge(hc, 3, 6), '실측'))

    # 6. 줄표·세미콜론·절 기호 [실측 0회]
    dash = plain.count('—') + plain.count('–') + plain.count(';') + plain.count('§')
    rows.append(('줄표(—)·세미콜론·§', str(dash), '0이어야 함',
                 '위험' if dash else '양호', '실측'))

    # 7. 첫째/둘째 병렬 + 3의 법칙 [카탈로그][실측 0회]
    ordinal = len(re.findall(r'첫째|둘째|셋째', plain))
    triple = len(re.findall(r'[\w가-힣]+, [\w가-힣]+, (?:그리고 )?[\w가-힣]+[을를이가은는]', plain))
    v = ordinal + triple
    rows.append(('첫째둘째·3연속 나열', str(v), '주의 2 / 위험 4',
                 judge(v, 2, 4), '카탈로그+실측'))

    # 8. 최빈 종결형 쏠림 [휴리스틱] - 습니다체 보고서는 높게 나오는 게 정상(오탐 주의)
    endings = {}
    for s in sents:
        tail = re.sub(r'[.!?~\s]+$', '', s)[-3:]
        endings[tail] = endings.get(tail, 0) + 1
    top = max(endings.values()) / n if endings else 0
    rows.append(('최빈 종결형 비율', f'{top:.2f}', '참고용(습니다체 보고서는 0.9+ 정상)',
                 '주의' if top > 0.9 else '양호', '휴리스틱(신뢰도 낮음)'))

    # 9. "것" 명사화 밀도(1000자당) [카탈로그] - 품사 다양성의 근사치
    geot = len(re.findall(r'것[이을은에으]', plain)) / chars * 1000
    rows.append(('"것" 명사화(1000자당)', f'{geot:.2f}', '주의 4 / 위험 7',
                 judge(geot, 4.0, 7.0), '카탈로그(근사)'))

    # 10. 문단 길이 균일성 [실측 인사이트] - 모든 문단이 비슷한 분량 = 밀도 균등 신호
    paras = [p for p in re.split(r'\n\s*\n', text) if len(p.strip()) > 40]
    if len(paras) >= 4:
        plens = [len(p) for p in paras]
        pcv = statistics.stdev(plens) / statistics.mean(plens)
        rows.append(('문단 길이 변동(CV)', f'{pcv:.2f}', '주의 0.45 / 위험 0.30 미만',
                     judge(pcv, 0.45, 0.30, reverse=True), '실측(밀도 불균형)'))

    return rows, n

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    mj = '--mj' in sys.argv
    if not args:
        print(__doc__)
        sys.exit(0)
    text = sys.stdin.read() if args[0] == '-' else open(args[0], encoding='utf-8').read()

    rows, n = analyze(text, mj)
    danger = sum(1 for r in rows if r[3] == '위험')
    warn = sum(1 for r in rows if r[3] == '주의')

    mode = '김명준 실측 기준(--mj)' if mj else '일반 기준(인간 평균)'
    print(f'\nko_ai_score - {mode}, 문장 {n}개\n')
    wname = max(len(r[0]) for r in rows)
    for name, val, crit, verdict, basis in rows:
        mark = {'양호': 'O', '주의': '!', '위험': 'X'}[verdict]
        print(f'  [{mark}] {name:<{wname}}  {val:>7}  ({crit}) [{basis}]')
    print(f'\n판정: 위험 {danger} / 주의 {warn}', end='  ')
    if danger == 0 and warn <= 2:
        print('=> [낮음] 표면 신호 통과. 구조·목소리 체크리스트로 넘어가세요.')
    elif danger <= 1:
        print('=> [중간] 위험 항목부터 고치고 재측정하세요.')
    else:
        print('=> [높음] AI 티 뚜렷. 문장 교체가 아니라 뼈대부터 재작성 권장.')
    print('   (통과 = 최소 조건. 지문 적용 여부는 analysis/문체지문_김명준.md 로 검수)')

if __name__ == '__main__':
    main()

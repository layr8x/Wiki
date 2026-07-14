#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ko_ai_score.py v1.0 — 한국어 AI 문체 정량 측정기
목적: '휴머나이즈'를 감(열린 루프)이 아니라 수치 수렴(폐루프)으로 바꾼다.
      재작성 → 측정 → '위험' 항목만 재교정 → 재측정 → 전 항목 양호까지 반복.

근거 표기:
  [논문인용]  KatFishNet (Park et al., ACL 2025, arXiv:2503.00032)이 판별 피처로
             검증한 축(쉼표·품사·띄어쓰기). 수치(인간 쉼표문장 ~26% vs LLM ~61%)는
             daleseo/korean-skills@humanizer의 논문 인용을 재인용 — 신뢰도 중간.
  [휴리스틱]  본 스크립트의 보수적 추정 임계값 — 신뢰도 낮음~중간.
             본인이 직접 쓴 글 2~3편에 돌려 개인 기준선으로 보정할 것.
  [규칙]     humanizer v3.0.0-ko 패턴(줄표 금지, 3의 법칙 등)의 기계 검사.

사용:
  pip install kiwipiepy
  python ko_ai_score.py 대상.txt          # 파일 측정
  cat 대상.txt | python ko_ai_score.py    # stdin
  python ko_ai_score.py 대상.txt --json   # 파이프라인용 JSON
  python ko_ai_score.py --selftest        # AI풍/인간풍 샘플로 판별력 자가검증

주의: 300자 미만 텍스트는 통계 신뢰도가 낮다(참고용).
"""
import sys, re, json, statistics
from collections import Counter

AI_CLICHES = [
    "핵심적", "중추적", "전략적", "패러다임", "생태계", "지평", "융합", "유의미",
    "고도화", "역동적", "혁신적", "효과적", "지속가능", "필수적", "전반적", "다각적",
    "본질적", "시사점", "방향성", "극대화", "최적화", "가속화", "활성화", "촉진",
    "도모", "제고", "창출", "토대를 마련", "기대됩니다", "기대된다", "한 걸음",
]

PATTERNS = {
    "번역투 조사구(에 대해/통해/있어/인해)": r"에\s?대(?:해|한|하여)|[을를]\s?통(?:해|하여)|에\s?있어서?|으로\s?인해",
    "이중피동(되어지/보여집니다)":            r"되어지|보여집니다|생각되어집|지게\s?되었",
    "'하다' 명사화(진행/실시/수행)":          r"(?:검토|분석|논의|개선|확인|적용|도입|작업)[을를]?\s?(?:진행|실시|수행)",
    "'것' 의존(~는 것이/것을)":              r"[는은던]\s?것[이을은]",
    "'수 있' 남발":                          r"수\s?있",
    "'~적으로' 나열":                        r"[가-힣]적으로",
}

NOUN_TAGS = {"NNG", "NNP", "NNB", "NR", "NP"}
CONTENT_TAGS = NOUN_TAGS | {"VV", "VA", "VX", "MAG", "MAJ", "MM", "XR"}


def analyze(text, kiwi):
    text = text.strip()
    nchar = len(re.sub(r"\s", "", text))
    sents = [s.text.strip() for s in kiwi.split_into_sents(text) if s.text.strip()]
    n = max(len(sents), 1)

    # 1) 문장 길이 변동(burstiness): 인간은 리듬이 흔들리고 LLM은 균일하다
    lens = [len(s.split()) for s in sents]
    mean_len = statistics.mean(lens) if lens else 0
    cv = (statistics.pstdev(lens) / mean_len) if mean_len and len(lens) > 1 else 0.0

    # 2) 쉼표: KatFishNet 최강 판별 피처(AUC 94.88 — 스킬인용 수치)
    comma_ratio = sum(1 for s in sents if ("," in s or "，" in s)) / n
    commas_per = sum(s.count(",") + s.count("，") for s in sents) / n

    # 3) 종결 표면형(마지막 2음절) 다양성: '-습니다' 일변도(KO-8) 검출
    endings = []
    for s in sents:
        core = re.sub(r"[\s\.\!\?…\"'”’\)\]]+$", "", s)
        if len(core) >= 2 and re.match(r"[가-힣]{2}", core[-2:]):
            endings.append(core[-2:])
    top_end = (max(Counter(endings).values()) / len(endings)) if endings else 0.0

    # 4) 형태소 기반: 명사 과다·품사 다양성(KatFishNet 피처 축)
    tags = [t.tag for t in kiwi.tokenize(text)]
    content_n = sum(1 for t in tags if t in CONTENT_TAGS) or 1
    noun_ratio = sum(1 for t in tags if t in NOUN_TAGS) / content_n
    bigrams = list(zip(tags, tags[1:]))
    pos_ttr = len(set(bigrams)) / len(bigrams) if bigrams else 0.0

    # 5) 어휘·패턴 밀도(/1000자)
    per1000 = lambda c: round(c * 1000 / max(nchar, 1), 1)
    cliche_hits = sum(len(re.findall(w, text)) for w in AI_CLICHES)
    pat_detail = {k: len(re.findall(v, text)) for k, v in PATTERNS.items()}
    # '수 있'·'적으로'는 인간 글에도 흔함 → 0.5 가중(밀도 높을 때만 신호)
    SOFT = {"'수 있' 남발", "'~적으로' 나열"}
    pat_weighted = sum(v * (0.5 if k in SOFT else 1.0) for k, v in pat_detail.items())

    # 6) 규칙 검사
    dashes = len(re.findall(r"[—–]", text))
    triples = len(re.findall(r"\S+·\S+·\S+", text))

    return {
        "chars": nchar, "sentences": len(sents),
        "comma_sent_ratio": round(comma_ratio, 2),
        "commas_per_sent": round(commas_per, 2),
        "sent_len_cv": round(cv, 2),
        "top_ending_share": round(top_end, 2),
        "noun_ratio": round(noun_ratio, 2),
        "pos_bigram_ttr": round(pos_ttr, 2),
        "cliche_per_1000": per1000(cliche_hits),
        "pattern_per_1000": per1000(pat_weighted),
        "pattern_detail": {k: v for k, v in pat_detail.items() if v},
        "dashes": dashes, "triple_lists": triples,
    }


def lv(v, ok, warn, reverse=False):
    """양호/주의/위험 판정. reverse=True면 클수록 좋음."""
    if reverse:
        return "양호" if v >= ok else ("주의" if v >= warn else "위험")
    return "양호" if v <= ok else ("주의" if v <= warn else "위험")


def rows(m):
    return [
        ("쉼표 포함 문장 비율", m["comma_sent_ratio"], "≈0.26 (LLM≈0.61)", lv(m["comma_sent_ratio"], .35, .50), "논문인용"),
        ("문장당 쉼표 수",      m["commas_per_sent"],  "≤0.5",             lv(m["commas_per_sent"], .5, .9),   "휴리스틱"),
        ("문장 길이 변동(CV)",  m["sent_len_cv"],      "≥0.45",            lv(m["sent_len_cv"], .45, .30, True), "휴리스틱"),
        ("최빈 종결형 점유율",  m["top_ending_share"], "≤0.50",            lv(m["top_ending_share"], .50, .65), "휴리스틱"),
        ("명사 비율(실질형태소)", m["noun_ratio"],     "≤0.58",            lv(m["noun_ratio"], .58, .66),      "휴리스틱"),
        ("AI 상투어(/1000자)",  m["cliche_per_1000"],  "≤2",               lv(m["cliche_per_1000"], 2, 5),     "패턴리스트"),
        ("번역투 등 패턴(/1000자)", m["pattern_per_1000"], "≤4",           lv(m["pattern_per_1000"], 4, 8),    "패턴리스트"),
        ("줄표(— –) 개수",      m["dashes"],           "0",                "양호" if m["dashes"] == 0 else "위험", "규칙"),
        ("3연속(·) 나열",       m["triple_lists"],     "0",                ("양호", "주의", "위험")[min(m["triple_lists"], 2)], "규칙"),
    ]


def report(m, title=""):
    rs = rows(m)
    danger = sum(1 for r in rs if r[3] == "위험")
    warn = sum(1 for r in rs if r[3] == "주의")
    verdict = "높음" if danger >= 3 else ("중간" if danger >= 1 or warn >= 3 else "낮음")
    out = []
    out.append(f"── ko_ai_score v1.0 {title} " + "─" * max(1, 30 - len(title)))
    out.append(f"텍스트: {m['chars']:,}자(공백제외) / {m['sentences']}문장" + ("  [주의: 300자 미만 → 참고용]" if m["chars"] < 300 else ""))
    out.append(f"{'항목':<22}{'측정':>6}  {'인간범위':<16}{'판정':<4}근거")
    for name, v, ref, level, basis in rs:
        out.append(f"{name:<22}{v:>6}  {ref:<16}{level:<4}{basis}")
    if m["pattern_detail"]:
        out.append("  └ 패턴 내역: " + " / ".join(f"{k} x{v}" for k, v in m["pattern_detail"].items()))
    out.append(f"POS bigram 다양성(참고)  {m['pos_bigram_ttr']}  — 길수록 높게 나옴, 개인 기준선과 비교")
    out.append(f"종합: 위험 {danger} / 주의 {warn} → AI 판독 위험 [{verdict}]")
    out.append("다음 행동: '위험' 항목만 골라 재작성 → 재측정 → 전 항목 양호까지 반복")
    return "\n".join(out), verdict


SAMPLE_AI = """디지털 전환은 단순한 기술의 도입이 아니라, 조직 문화의 근본적인 변화를 의미합니다. 이러한 변화는 혁신적이고, 전략적이며, 지속가능한 성장의 토대를 마련합니다. 첫째, 데이터 기반 의사결정은 업무의 효율성을 극대화합니다. 둘째, 자동화된 프로세스는 생산성 향상을 가능하게 합니다. 셋째, 유연한 조직 구조는 시장 변화에 대한 신속한 대응을 지원합니다. 이를 통해 기업은 경쟁력을 강화할 수 있으며, 지속적인 혁신·성장·발전을 도모할 수 있습니다. 결론적으로, 디지털 전환은 기업 경쟁력의 핵심적인 요소이며, 앞으로의 행보가 기대됩니다."""

SAMPLE_HUMAN = """솔직히 처음엔 반신반의했다. 디지털 전환이라는 말 자체가 컨설팅 회사들이 만들어낸 유행어 같았으니까. 그런데 작년에 우리 팀 정산 업무를 자동화하면서 생각이 좀 바뀌었다. 매달 이틀씩 잡아먹던 엑셀 작업이 반나절로 줄었다. 물론 다 좋았던 건 아니다. 스크립트가 깨질 때마다 나만 고칠 수 있어서 오히려 발목 잡힌 적도 있고. 그래도 돌아가라면 못 돌아간다. 숫자 앞에서 장사 없다."""


def main():
    args = sys.argv[1:]
    from kiwipiepy import Kiwi
    kiwi = Kiwi()

    if "--selftest" in args:
        for title, txt in (("[AI풍 샘플]", SAMPLE_AI), ("[인간풍 샘플]", SAMPLE_HUMAN)):
            r, v = report(analyze(txt, kiwi), title)
            print(r + "\n")
        return

    files = [a for a in args if not a.startswith("--")]
    text = open(files[0], encoding="utf-8").read() if files else sys.stdin.read()
    m = analyze(text, kiwi)
    if "--json" in args:
        print(json.dumps(m, ensure_ascii=False, indent=2))
    else:
        print(report(m)[0])


if __name__ == "__main__":
    main()

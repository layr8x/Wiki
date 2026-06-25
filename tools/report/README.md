# report — 범용 A4 리포트 생성기

데이터(JSON)만 넣으면 **전문적인 A4 1장 리포트(PNG + PDF)**가 나오는 재사용 도구입니다. 주제·기간·데이터가 달라도 같은 포맷으로 일관되게 — 월간보고, 지점별 분석, 문의 추세, 효과 측정 결과 등 **여러 상황에 그대로 재사용**합니다.

> 비유: 한 번 쓰고 버리는 보고서를 매번 손으로 그리지 않고, **"양식이 박힌 보고서 자판기"**에 데이터만 넣어 뽑는 것.

## 빠른 사용법
```bash
# 1) 데이터 스펙(JSON)을 작성 — example.json 복사해서 값만 교체
cp tools/report/example.json tools/report/out/my-report.json
#    (편집)

# 2) 생성 → PNG(보기용) + PDF(인쇄/공유용)
node tools/report/gen.cjs tools/report/out/my-report.json tools/report/out/my-report
#    → out/my-report.png, out/my-report.pdf
```
- 폰트(Pretendard)는 `tools/design-audit/fonts/` 재사용. 헤드리스 CDN 차단 우회 내장.
- 데이터는 **분석 스킬**(`/analyze`·`bigdata-sql`·`inquiry-classification`)로 뽑은 실측값을 넣는다(수치 추측 금지).

## 데이터 스펙 (JSON)
```jsonc
{
  "title": "리포트 제목",
  "subtitle": "부제(선택)",
  "meta": ["우상단 줄1(기간)", "줄2(출처)", "줄3"],     // 우상단 작은 글씨
  "kpis": [                                            // 상단 큰 숫자 카드(2~4개 권장)
    { "k": "라벨", "v": "7,221", "unit": " 건", "d": "보조설명", "hl": true }  // hl=검정 강조 카드
  ],
  "blocks": [ /* 아래 블록들을 순서대로 */ ],
  "footnote": "하단 한계·각주 (HTML 허용: <b> 등)"
}
```

### 블록 종류 (`blocks[]`)
| type | 용도 | 핵심 필드 |
|---|---|---|
| `bars` | 가로 막대(순위·분포) | `items:[{label, value, top?:최상위 검정, muted?:회색, display?:표시문자}]`, `note?`, `callout?`(HTML) |
| `trend` | 두 기간 비교(그룹 막대) | `groups:[{label, a:이전, b:최근}]`, `legend:[이전,최근]`, `note?` |
| `actions` | 실행 제안 카드(1~3) | `items:[{n, h:제목, p:설명, tag?}]` |
| `table` | 표 | `columns:[...]`, `rows:[[...],...]` |
| `note` | 자유 문단 | `html` 또는 `text` |

- 막대 길이·추세 높이는 **데이터 최댓값 기준 자동 계산** → 어떤 수치든 알아서 맞춰 그림.
- `callout`·`footnote`·`note.html` 은 HTML 허용(`<b>`, `<span style>` 등 강조).

## 예시
`example.json` = 카카오 학부모 문의 분석(이 저장소 첫 리포트). 그대로 생성하면 `out/inquiry.png/.pdf`.

## 메모
- `out/` 는 생성물이라 git 추적 안 함(.gitignore). 스펙(JSON)은 보관하려면 `out/` 밖에 두거나 커밋.
- 더 복잡한 시각화(대화형·다중 페이지)는 `/dashboard` 스킬(data-visualization) 사용. 이 도구는 **한 장짜리 정적 리포트** 전용.

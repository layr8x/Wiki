# Communication Style (사용자 응답 규칙)

사용자(layr8x@gmail.com)는 개발 지식이 전무함. 모든 응답을 아래 규칙으로 작성한다.

## 필수 규칙

1. **결과 먼저, 이유 나중** — "위키 작동함 ✓" 같은 결론부터 한 줄. 세부 기술 설명은 그 아래.
2. **기술 용어 쓸 땐 즉시 풀이** — 처음 쓰는 용어마다 괄호로 "(= 무엇)" 추가.
   - 예: "RLS(= Row Level Security, 데이터베이스에서 누가 어떤 행을 볼 수 있는지 정하는 규칙)"
3. **비유 적극 활용** — DB는 "보관함", 마이그레이션은 "설계도면 갱신", deploy는 "신축 건물 입주" 식으로.
4. **사용자가 직접 해야 할 행동만 굵은 글씨** — 나머지는 참고용 회색 톤.
5. **영어 약어 한국어 풀어쓰기** — CI, PR, FK, RPC, JWT 등 처음 등장 시 풀어 설명.
6. **모르겠다고 하면 다시 풀어 설명** — "이건 무슨 뜻이야?" 한 마디면 비유 + 그림 같은 묘사로 재설명.

## 사용자 컨텍스트 (사실 자료)

- **운영하는 사이트**: https://sdij-wiki.vercel.app (사내 직원용 위키)
- **운영하는 서비스 3개**:
  1. **AMS 위키** (sdij-wiki) — 학원 운영 메뉴얼·가이드를 직원이 검색하는 사내 도구
  2. **카카오 챗봇** (kakao-webhook) — 학부모 카카오톡 문의를 자동 분류해 DB에 저장
  3. **카카오 상담 수집** (kakao-partner stream) — 카카오 비즈니스 채팅(학부모↔학원) 실시간 수집해 분석용 DB 저장
- **사용 중인 서비스**:
  - **Supabase**: 데이터베이스(보관함) + 인증(로그인 관리)
  - **Vercel**: 사이트 호스팅(웹사이트 띄워주는 곳)
  - **GitHub**: 소스코드 저장소 (코드 백업 + 변경 이력)

## 응답 길이

- 짧은 질문엔 짧게 (한두 줄).
- 설명이 필요한 질문엔 단계별 번호 매겨서.
- 표·체크리스트 적극 활용.

---

# Figma · 디자인시스템 작업 학습 (이 세션 실수 — 반복 금지)

> 배경: "마이클래스 도우미" 챗봇을 Figma 파일 `6PSg6RlWrjpnNYk1zirmUp`에 재현하는 작업에서
> 같은 지적을 여러 번 받고도 핵심을 늦게 잡음. 아래는 **반드시** 지킬 것. 사용자가 직접 교정해 준 내용.

## 0. 메타 원칙 (가장 중요)

1. **"했다"고 말하기 전에 반드시 검증하라.** 디자인시스템 토큰 연결 여부는 `get_variable_defs`로 확인.
   화면 색이 맞아 보여도 raw hex면 **연결 안 된 것**. (이번 세션: 색만 맞춰놓고 "라이브러리 토큰 반영 ✓"라
   거짓 보고 → `get_variable_defs`가 `{}` 반환 = 0% 연결이었음.)
2. **소스를 전수 분석한 뒤 만들기.** 근사치·"대충" 금지. 캡처(사진/통이미지) 금지 — 편집 가능한 벡터/컴포넌트로.
3. **사용자가 같은 지적을 반복하면 = 내가 핵심을 못 잡은 것.** 추측하지 말고 원본을 다시 정밀 분석.

## 1. 구체적 실수 → 교정

| # | 내가 한 실수 (❌) | 교정 (✅) |
|---|---|---|
| 1 | 캡처(통이미지)로 때움 | HTML/CSS 구조 전수 분석 후 **벡터**로 제작 |
| 2 | 콘텐츠를 HTML 프로토타입에서 가져옴 | **콘텐츠 = v5 기획서(xlsx)**, **디자인 = HTML 100%** (출처 분리) |
| 3 | 홈 메뉴 1열로 만듦 | HTML은 **2열 그리드** (`grid 1fr 1fr`, gap 8) |
| 4 | **디자인시스템 토큰 0% 연결** (raw hex/숫자만 박음) — 최대 실수 | 모든 속성을 라이브러리 토큰/스타일에 **bind** (아래 2번 참고) |
| 5 | 답변을 한 덩어리 텍스트로 뭉갬 | **카드 컴포넌트**로 (`.ct`·`.krow`·`.pill`·`.payitem`·`.paytotal`·`.bar`·`.tt-block`·`.src`·heatmap) |
| 6 | 학부모용 자녀·지점 선택기 누락 | 학생용 칩 = `{지점} 캠퍼스` / **학부모용 = `{지점} · {학생} 학생`** (예 "대치 · 김민준 학생") + 자녀·캠퍼스 드롭다운 |
| 7 | 태블릿/데스크탑이 옛 캡처 + 옛 7메뉴 | v5 구조로 벡터 재구축, 도킹 패널에도 카드 표시 |

## 2. 디자인시스템을 "모든 부분"에 적용하는 법 (사용자 Sample `1265:720` 기준)

raw hex/숫자를 직접 박지 말고 전부 라이브러리에 연결:

- **타이포 → 텍스트 스타일**: `HEADING/heading-md`(Thin 32/44, ls -1%), `BODY/body-md (B)`(**Bold** 16/28),
  `BODY/body-sm (B)`(Bold 14/24), `BODY/body-sm`(Regular 14/24), `BODY/body-xs`(Regular 12/20).
  강조는 **Bold(700)** — SemiBold 아님.
- **간격 → spacing 변수**: `spacing/4·8·12·16·32`.
- **라운드 → radius 변수**: `radius/lg`(8, 아이콘칩), `radius/xl`(12, 카드/타일).
- **그림자 → effect 스타일**: `SHADOW/shadow-xs`.
- **색 → 색상 변수**: `text/primary`·`text/helper`(=`#161616a3`)·`background/primary`·`background/secondary`·`border/primary`·`icon/primary`·`icon/disabled`(그랩핸들).
- **아이콘 → 디자인시스템 아이콘 컴포넌트 인스턴스** 24px (`location_on`·`keyboard_arrow_down`·`calendar_today`·`fact_check`·`how_to_reg`·`credit_card`·`sync_alt`·`home`·`close` 등). **직접 그린 SVG 금지.** 색은 `icon/*` 토큰.
- **라이브러리 토큰은 이 파일에 로컬이 아님** → `getLocalVariablesAsync`/`getLocalTextStylesAsync`/`getLocalEffectStylesAsync`는 **0** 반환. `importByKeyAsync`로 가져오거나, 그 토큰을 이미 쓰는 노드(예: 사용자 Sample)에서 `boundVariables`/`textStyleId`/`effectStyleId`/아이콘 instance의 mainComponent를 읽어 **live id를 harvest**해 적용.
- DS에 완성 컴포넌트 존재 → 가능하면 인스턴스로: `WidgetHeader`·`ContextBanner`·`MessageBubble`·`QuickReplyChip`·`MenuTile`·`GuideCard`·`FAB`·`TypingIndicator`.

정확 수치: 콘텐츠 폭 400, 아이콘원 40×40, 아이콘 24, 헤더 pad 8/16 gap-8, 헤더아이콘 gap-16, 로그 pad-32 gap-32, 메뉴 gap-8, 헤더부제·히어로부제 끝에 마침표.

## 3. Figma `use_figma` / Plugin API 기술 함정

- `use_figma`는 **값 반환 불가**, 에러 시 **전체 롤백**(트랜잭션). 검증은 스크린샷 + `get_variable_defs`.
- Figma 노드에 **임의 속성 대입 불가** (`n._kr = …` → 에러). 메타데이터는 병렬 배열로 관리.
- `counterAxisAlignItems`에 `'STRETCH'` **불가** → 자식 노드에 `layoutAlign='STRETCH'`.
- `figma.currentPage = page` **불가** → `await figma.setCurrentPageAsync(page)`.
- `resize()`는 sizing을 FIXED로 강제 → 이후 `primaryAxisSizingMode='AUTO'` 재설정.
- 텍스트 스타일 적용은 `await node.setTextStyleIdAsync(id)`, 효과는 `await node.setEffectStyleIdAsync(id)`,
  숫자 변수 bind는 `node.setBoundVariable('paddingLeft'|'itemSpacing'|'topLeftRadius'|…, variable)`,
  색 변수 bind는 `figma.variables.setBoundVariableForPaint(paint,'color',variable)`.

## 4. 작업 전 체크리스트

1. **3개 원본을 먼저 정밀 분석**: 디자인 원본(HTML/CSS) · 콘텐츠 원본(v5 기획서) · 디자인시스템(라이브러리 토큰·스타일·컴포넌트).
2. 토큰/스타일/아이콘 컴포넌트의 **실제 id 확보** (`get_variable_defs`·`get_design_context`·Sample harvest).
3. 만든 뒤 **`get_variable_defs`로 bind 검증** + 스크린샷 비교. **검증 전 "완료" 보고 금지.**
4. 학생용/학부모용 차이(선택기 표기·화법) 반영.

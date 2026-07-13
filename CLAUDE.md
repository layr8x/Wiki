# Communication Style (사용자 응답 규칙)

사용자(layr8x@gmail.com)는 개발 지식이 전무함. 모든 응답을 아래 규칙으로 작성한다.

## 필수 규칙

1. **결과 먼저, 이유 나중 (두괄식)** — "위키 작동함 ✓" 같은 결론부터 한 줄. 세부 기술 설명은 그 아래. **보고서·분석 문서도 항상 두괄식** — 맨 위에 결론/권고 1~3줄(또는 "한 줄 요약"·"한눈에 보기")을 두고, 근거·과정은 그 아래에 둔다.
2. **기술 용어 쓸 땐 즉시 풀이** — 처음 쓰는 용어마다 괄호로 "(= 무엇)" 추가.
   - 예: "RLS(= Row Level Security, 데이터베이스에서 누가 어떤 행을 볼 수 있는지 정하는 규칙)"
3. **비유 적극 활용** — DB는 "보관함", 마이그레이션은 "설계도면 갱신", deploy는 "신축 건물 입주" 식으로.
4. **사용자가 직접 해야 할 행동만 굵은 글씨** — 나머지는 참고용 회색 톤.
5. **영어 약어 한국어 풀어쓰기** — CI, PR, FK, RPC, JWT 등 처음 등장 시 풀어 설명.
6. **모르겠다고 하면 다시 풀어 설명** — "이건 무슨 뜻이야?" 한 마디면 비유 + 그림 같은 묘사로 재설명.
7. **분석·의사결정 문서 = 검증된 빅데이터/의사결정 방법론을 명시 차용** — CRISP-DM(분석 생애주기), 가설검정, 대조군 인과추론(이중차분), DMAIC, KPI 트리·North Star, 피라미드 원칙(두괄식), RICE 우선순위, 민감도(분모) 분석 등. 방법론 이름은 풀이와 함께 쓴다. **항상 `[측정]`(사실)·`[추정]`(가정·범위)·`[미측정]`(검증 필요)을 구분**해 표기한다(허위/과장 분석 금지).
8. **전 구성원 공유 보고서·대시보드엔 비유·은유 표현 금지** — 천장·집·창·샜다·무게중심·정공법 같은 은유 대신 **평이한 직설 용어**(상한·한계·유입·우선순위·직접 구현 등)를 쓴다. (비유는 layr8x 본인 대상 채팅 설명에서만 — 규칙 3.)
9. **AI 특유의 특수기호 사용 금지** — 보고서·채팅 답변 어디에도 `§`(section 기호), `—`(em dash) 등을 쓰지 않는다. 절 번호는 "4장"·"4-1절"·"넷째" 등 한글로, 줄바꿈 강조가 필요하면 쉼표·마침표·괄호·일반 하이픈(-)으로 대체한다.

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

> **⚠️ 가장 안전한 방법 = 처음부터 새로 그리지 말 것.** 사용자가 만든 정답 Sample(`1265:720`)을
> `node.clone()`으로 **복제하고 텍스트(인사말·선택기 등)만 교체**하라. 복제는 토큰·텍스트스타일·
> effect·**도트 배경 이미지 fill**·보더·아이콘을 전부 그대로 보존한다. 처음부터 원시 프레임으로
> 재구축하면 **도트 배경·폰트·보더를 조용히 빠뜨려** 또 깨진다 (이번 세션에서 실제로 도트 누락·보더
> 어긋남 발생). 새 콘텐츠가 Sample에 없을 때만 아래 harvest 방식으로 직접 bind.

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
- **✅ 검증된 적용 절차** (이 세션에서 성공 확인, 사용자 Sample `1265:720` 기준):
  1. Sample 노드를 재귀 순회하며 수집 — `textStyleId`(→`getStyleByIdAsync`로 이름), `boundVariables`(→`getVariableByIdAsync`로 이름), `effectStyleId`, INSTANCE의 `getMainComponentAsync`(아이콘 컴포넌트).
  2. 새 노드에 적용 — `await node.setTextStyleIdAsync(id)` / `node.setBoundVariable('paddingLeft'|'itemSpacing'|'topLeftRadius'…, variable)` / `figma.variables.setBoundVariableForPaint(paint,'color',variable)` / `await node.setEffectStyleIdAsync(id)` / `component.createInstance()`.
  3. **검증**: `get_variable_defs(노드)`가 `{}`가 아니라 토큰 목록을 반환하면 성공. (반환 전 "완료" 금지)
- **아이콘 주의**: 일부 아이콘(`how_to_reg`·`sync_alt` 등)은 DS 컴포넌트가 아니라 Sample에 raw 이미지로 들어가 있어 harvest 안 됨 → 추출한 Material Symbols SVG 벡터로 만들되 fill을 `icon/primary` 토큰에 bind(= 컴포넌트 가능한 건 인스턴스, 없는 건 토큰-bind 벡터).
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

## 5. 카드 답변 컴포넌트 레시피 (사용자 다듬은 기준 `1281:110`)

납부 명세서 카드를 사용자가 직접 토큰으로 다듬음. 모든 카드 화면은 이 레시피를 따른다 (같은 종류는 `1281:110` clone, 다른 종류는 아래 규칙으로):

- **유형칩(수강료 등) = DS `Tag` 컴포넌트** (`1186:2027`, Configuration=Gray) 인스턴스. raw 프레임 금지. (`tag/gray/background`·`tag/gray/border` 0.8px·radius 2·`tag/gray/color` #393939·`BODY/body-sm`)
- **아이콘**: Sample에 없어도 DS에 컴포넌트로 존재 → 이름으로 찾아 인스턴스 (`receipt_long` `1282:1020` 등). 없을 때만 추출 SVG + `icon/*` bind.
- **카드 컨테이너**: `radius/xl`(12) + `p-spacing/16` + **`border/primary` 보더 + `SHADOW/shadow-xs`**(둘 다) + 우측 `spacing/32` 인셋.
- **카드 제목(ct)**: 아이콘 20(`icon/secondary`) + `BODY/body-xs`·`text/helper`, `pb-spacing/8`.
- **항목(payitem)**: 행 `gap-spacing/8`·`py-spacing/12`, 하단 `border/primary`. 좌측=[Tag, **강좌명+기한 묶음**(gap 0): 강좌명 `BODY/body-sm (B)`(w-full), 기한 `BODY/body-xs`·`text/helper`(w-full)]. 우측(배지+금액 gap-4)은 강좌명 줄에 맞춰 **`pt-spacing/24`**(=24, 옛 raw 28 아님). 완납 행 글자=`text/disabled`.
- **배지(미납/완납)**: `BODY/body-xs (B)`(=**Bold**, regular 아님)·**`px-spacing/6`**(=6, 상하패딩 0)·radius 999. 미납=`background/inverse`+`text/inverse`, 완납=`background/secondary`+`text/placeholder`.
- **합계(paytotal)**: 상단 **`border-1`** = `text/primary`(검정, 2px 아님), **`pt-spacing/12`**(8 아님). 라벨 `BODY/body-sm (B)`·`text/primary`. **큰 숫자 = `HEADING/heading-xs`(20 Light)·`text/primary`** (옛 heading-sm 24 아님 — 사용자가 줄임).
- **진행바**: 묶음 `gap-spacing/4`(8 아님)·`pt-spacing/12`. 라벨 `BODY/body-xs`, 트랙 높이 **4**·**full-width**(`layoutSizingHorizontal=FILL`)·`background/secondary`·radius 999, 채움 `background/inverse`.
- **말풍선(me)**: `bg background/inverse`·`text/inverse`·`BODY/body-sm (B)`·`px-spacing/16 py-spacing/12`·라운드 24/24/24 + 꼬리 `radius/md`(4).
- **퀵리플라이 칩 = 아이콘 + 텍스트** (예전 "텍스트만"은 틀림 — 사용자 교정). primary=`background/inverse`+`text/inverse`(아이콘 `icon/on-color`), 기본=`background/primary`+`border/primary`+`text/placeholder`(아이콘 `icon/secondary`). 공통 `px-spacing/16 py-spacing/8`·radius 999·`BODY/body-sm (B)`·**아이콘↔텍스트 `gap-spacing/8`(4 아님)·아이콘 24px**. 칩 스타일은 primary / 기본 둘뿐(ghost·맨 글자 금지). "처음으로·이전" 등 보조 버튼도 기본 칩.
- **아이콘 = Material Symbols, Sharp, weight 200** (사용자 지정). Figma에선 Material Symbols 플러그인으로 가져옴. 코드로는 `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolssharp/{이름}/wght200/24px.svg`(viewBox `0 -960 960 960`) fetch → `figma.createNodeFromSvg` → fill을 `icon/*` 토큰에 recolor. raw hex/다른 weight 금지.
- 추가 스타일: `BODY/body-xs (B)`·`HEADING/heading-xs`(20 Light). 추가 토큰: `tag/gray/*`·`radius/md`(4)·`spacing/6`·`spacing/24`·`text/placeholder`·`icon/secondary`·`icon/on-color`.

## 6. v5 기획서(콘텐츠 원본) 충실 반영 — 검수 결과

> 콘텐츠 출처 = `82a2104c-…v5.xlsx`("메뉴 시나리오"·"공통·진입·연결" 시트). 디자인만 맞추지 말고 **답변 텍스트·날짜형식·플로우를 기획서와 1:1 대조**할 것.

- **홈 메뉴 = 5개** (출결·보강 / 입반·등록·대기 / 납부·결제 / 수업·시간표 / 전반). 기획서 공통시트엔 "메뉴 6개" 표기가 있으나 **사용자가 5개로 확정**(6번째 미정).
- **만족도(👍/👎)**: 데이터 조회·자가안내 완료로 **끝나는 화면**엔 답변 칩 아래에 "도움이 됐나요?" + [👍 해결됐어요][👎 아직 안 됐어요](thumb_up/thumb_down 아이콘) 추가. **단, 상담 등록/전화로 끝나는 화면(이미 👎 경로)·진입·선택 화면엔 미노출.** (규칙: 칩에 '처음으로' 있고 '상담 등록' 없으면 노출.)
- **결제 내역**: 날짜 = **화면 표기 `YY/MM/DD`**(예 26/06/01) — 사용자 결정(피그마 디자인대로). 데이터 정본은 `YYYY-MM-DD` 유지하고 `fmtYMD()`로 표시만 변환. 강좌 **풀네임**(국어 박지훈T 기말 심화).
- **추가영상/동영상 보강**: 회차마다 `지급일 + 시청 기한` 둘 다.
- **입반 강좌 확인**: 제목 "입반된 강좌 현황", 강좌명만 단순 리스트(`li`), 완료 배지 없음(기획서엔 배지 없음).
- 납부 명세서 카드의 합계·진행바·완납 금액은 기획서엔 없지만 **사용자가 1281:110에서 직접 추가한 디자인** → 유지.
- **맞춤법**: 사용자 노출 챗봇 텍스트는 검수상 깨끗(보조용언 "해 주세요/도와드릴까요" 일관). "출석예정"은 기획서 표기 그대로 유지.
- **실제 강좌명**: 더미(박지훈T·이서연T·최민서T) 금지. AMS 강좌리스트(`ams.sdij.com/products/lecture/list`, Okta 인증 필요 → 사용자가 캡처 제공) 기준 실명 사용. **확정 김민준 수강 4강좌**(사용자 선택 "국·수·영 균형"): ① `강은양T 국어 서바이벌 일 13:30-17:05 7/12` ② `박종민T 수학 미적분 목 18:30-22:00 4/30` ③ `박종민T 수학 서바이벌 실전모의 수 18:25-22:00 7/8` ④ `김경욱T 진선1 영어 기말 6+1회 화 18:00-21:00 5/12`. 형식 `{강사}T {반/과목명} {요일} {시간} {개강일}`(앞 정원코드 `(C)(165)`는 좌석수라 제외).
- **⚠️ 강좌명 절대 축약 금지**(사용자 강력 교정 "강좌명은 네가 임의로 축약하지 않는다"). `김경욱T 진선1 영어 기말 6+1회`→`김경욱T 영어`(❌), `박종민T 수학 서바이벌 실전모의`→`박종민T 실전모의`(❌) 같은 이름 자르기 금지. **이름 부분(진선1·미적분·서바이벌 실전모의 등)은 통째 보존.** 캡처에 없는 강좌·일정 **날조도 금지**.
- **풀네임 표기 — 맥락별 규칙**(이름은 항상 통째, 일정 suffix만 맥락 따라): 강좌 선택 칩·납부 payitem·종강일(시작일 미충돌 시) = **풀네임 + 일정**. 시간표(시간열 따로)·결제내역(결제일 prefix 있음)·상세화면 문장 = **이름만**(요일·시간·개강일 빼서 날짜 중복/혼동 방지). 이름을 자르는 게 아니라 일정 중복만 피하는 것.
- **대량 텍스트 교체 기법**: 강좌명처럼 전 화면 동일 텍스트만 바꿀 땐 전체 재빌드 말고 `use_figma`로 페이지 전체 TEXT 노드 순회하며 `n.characters` 치환(폰트 로드 후, 긴 문자열→짧은 순 정렬). 모바일+디바이스 패널+웹배경 한 번에. **부분 확장(예 `강은양T 국어`→`강은양T 국어 서바이벌`)은 이미 완성된 문자열에 중복 append 안 되게 정규식 negative lookahead** `/강은양T 국어(?! 서바이벌)/g` 사용.

## 7. 페이지 정리 · 화면 재구축 (이 세션 — 학생/학부모 통합)

- **dynamic-page 함정(중요)**: `figma.root.children`로 얻은 **현재 페이지가 아닌 페이지의 `.children`는 빈 배열 반환(에러 없이 silent no-op)**. 삭제·이동 전 반드시 `await 그페이지.loadAsync()`. (`figma.loadAllPagesAsync`는 이 샌드박스 미지원.) 이번에 학부모 화면 삭제가 조용히 0건 처리됐다가 `loadAsync()`로 해결.
- **metadata `name` ≠ 엔진 생성 노드 characters**: `get_metadata`의 TEXT 노드 `name`은 콘텐츠명으로 자동명명된 **원본 노드만** 보임. 엔진(`createText`)으로 만든 노드는 generic 이름이라 grep에 안 잡힘 → 엔진 재빌드 화면 검증은 **스크린샷**으로. (강좌명 grep이 원본 상세화면·패널만 잡고 재빌드 카드는 못 잡았던 이유.)
- **in-place 재구축 idempotent**: 이름+너비(`Math.round(w)===400`)로 옛 프레임 찾아 같은 x/y에 새로. 엔진이 SAMPLE(`1265:720`, width 400) clone이라 재실행해도 너비 유지 → 재매칭 OK. 단 **재빌드하면 node id가 바뀜**(옛 id로 screenshot 시 invalid) → 재빌드 후 metadata 다시 떠서 새 id 확보.
- **학생/학부모 구조**: 두 페이지 거의 동일(모바일 36~37개 동명). 학부모 고유 = 홈 `진입 · 홈 · 인사+메뉴 (학부모)`(자녀·캠퍼스 드롭다운)뿐, 나머지는 선택칩(`대치 · 김민준 학생` vs `대치 캠퍼스`)만 차이. **사용자 결정: 학부모 중복 전부 삭제 + 고유 홈만 학생 페이지(1032:54)로 이동, 학부모 페이지(1152:54) 비움.**
- **섹션 정리(1032:54)**: 모든 프레임을 섹션별(`홈`/`①~⑤`/`학부모 전용`/`태블릿`/`데스크탑`)로 그룹핑, 각 섹션 위에 56px Bold 흰색 제목 라벨(node name `SEC:{섹션}`, 재실행 시 먼저 제거)·5열(모바일)/3열(태블릿·데스크탑) 그리드 정렬. `secOf(name)`은 이름 prefix(`① `·`T·`·`D·`·`납부·결제 · 납부 명세서`→③)로 매핑.
- **디바이스 패널 vs 모바일 차이(미해결, 사용자 확인 필요 시)**: 디바이스 패널 시간표·납부는 원래 3강좌 버전(국·수·영) → 축약만 풀고 풀네임화. 모바일은 4강좌. 패널을 4강좌로 완전 동기화하려면 별도 재빌드 필요.

---

# 8. 텍스트 길어진 뒤 "넘침(잘림)" 일괄 수정 — 함정 모음 (이 세션 실수 → 교정)

> 배경: 강좌명에 스케줄을 붙여 전 화면 텍스트를 길게 바꿨더니, **자동 폭(WIDTH_AND_HEIGHT) 글상자들이 줄을 안 바꾸고 옆으로 삐져나가 잘림**(말풍선·카드 제목·결제내역·시간표·종강일·강좌칩). 한 번에 고치려다 여러 번 더 망가뜨림. 아래는 반드시 지킬 것.

- **use_figma는 console.log/값을 반환 안 함** → 검증은 **스크린샷** 또는 **노드 `name`에 디버그 문자열을 적고 `get_metadata`로 읽기**(예: `S.name="DBG "+info`). 엔진 생성 노드는 metadata 깊이 제한으로 안 펼쳐지니, 알고 싶은 수치(폭·sizing)는 화면 프레임 name에 인코딩.
- **행(row) 단위로 판단할 것**(텍스트 1개씩 X). 가로 auto-layout 행이 넘치면 **가장 긴 자식 1개만 `FILL`+`textAutoResize='HEIGHT'`(줄바꿈)**, 나머지 텍스트는 `HUG`로 리셋. 텍스트 1개씩 처리하면 결제내역에서 **값(금액)이 1글자씩 세로로 쪼개짐**(키가 폭 안 잡힌 채 값만 FILL돼 음수 폭).
- **뱃지·짧은 라벨 절대 건드리지 말 것**: "미납/완납" 같은 짧은 글자를 `FIXED`로 클램프하면 뱃지 알약이 **긴 막대로 늘어남**(폭 82px). 클램프는 **자연폭 natW>140px**일 때만. 짧은 라벨은 항상 `HUG`+`WIDTH_AND_HEIGHT`.
- **줄바꿈 컨테이너(layoutWrap='WRAP', 퀵리플라이 칩)는 일반 행으로 취급 금지**: 가장 긴 칩을 `FILL`시키면 그 칩 폭이 24px로 찌부러짐. 칩은 **각 칩을 `HUG`로 두고, 칩 텍스트만 (컨테이너폭 − 칩 chrome) 기준으로 클램프**. avail은 **현재 위치(bb.x)가 아니라 담는 칸 폭**으로 계산(WRAP은 reflow로 위치가 틀어짐).
- **resize()는 auto-layout 축 sizing을 FIXED로 강제** → 카드 높이를 `resize(w,10)` 하면 10px 고정돼 내용이 겹침. 높이는 건드리지 말고 `primaryAxisSizingMode='AUTO'`(hug) 유지.
- **올바른 절차(idempotent)**: ①모든 텍스트 자연폭 리셋(`WIDTH_AND_HEIGHT`+`HUG`) → ②가로/세로 bounded 프레임 행단위 줄바꿈(WRAP 제외, 넘칠 때만 가장 긴 자식 FILL, `counterAxisAlignItems='MIN'`으로 값 윗줄 정렬) → ③WRAP 칩 별도 클램프 → ④부모가 hug인 긴 텍스트(말풍선)만 chrome 기반 avail로 클램프. **검증 전 "완료" 금지.**

# 9. 실제 웹 화면 100% 재현 — 마이클래스 "수업관리"(태블릿·데스크탑 배경)

- **원본**: 파일 `A3JqKGl3NJD7CIRtjj6aNj`, 노드 `29431-133930`(PC=`30329:115029`). `get_design_context`로 정확한 토큰·구조 추출 필수(근사치 금지).
- **구조(원본 그대로)**: **탭 박스**(가로, 좌우 border `color/base/gray/20`) = `수강 강좌`(활성: bg `background/primary`·border l/r/t `border/primary`·px24 py18·body-m 16/28·`text/primary`) | `강좌 예약 현황`(비활성: bg `background/secondary`·border t/b·`text/helper`). 각 탭 폭 = 패널폭/2.
- **강좌 카드**(py24·하단 border `border/primary`): [태그(`tag/gray/*` Configuration=Gray)+`수강중`(body-sm)] → **제목=강좌명만**(HEADING/heading-xs **Light 20/32**) + **둘째줄=요일·시간·교실(개강일)**(같은 heading-xs) → **밑줄 "강좌 상세보기"(body-m 16, underline) + keyboard_arrow_right 24**.
- **⚠️ 웹은 챗봇과 표기 규칙 다름**: 챗봇 카드/칩 = `강좌명+스케줄` 한 덩어리(사용자 "전체 스케줄 포함" 결정). **웹 수업관리 = 제목 강좌명만 + 스케줄 별도 줄**(원본 형식). 혼동 금지.
- **적용 대상 패널**: 데스크탑 6개 `1251:300·1251:404·1251:196·1251:512·1251:92·1250:92`(폭520, x556 y178), 태블릿 6개 `1252:401·1252:499·1252:303·1252:601·1252:205·1252:86`(폭672, x48 y276). 1개 정밀 빌드→검증→나머지 `clone()`(데스크탑 동일폭) 또는 동일 빌드함수 재실행(태블릿 폭만 다름). **clone 전 폰트 로드 필수**(`unloaded font` 에러).

# 10. 학부모 자녀·캠퍼스 드롭다운 화면(#4) · #3 결제 화면(사용자 소유)

- **학부모 드롭다운**(`1358:128`, 학부모 전용 섹션): 홈 `1278:68` clone → 선택자 텍스트 `대치 · {자녀} 학생`로 교체 → 선택자 아래 **드롭다운 카드**(bg primary·radius xl·shadow-xs·border) **`layoutPositioning='ABSOLUTE'` x16 y140**로 채팅영역 위에 겹쳐 띄움(자동배치 화면이라 안 그러면 맨 아래로 흐름). 행 = [자녀명 body-sm(B) / 캠퍼스 body-xs helper] + 선택행은 `background/secondary` 하이라이트 + check 아이콘.
- **자녀 4명(사용자 지정)**: 김시대·이시대·박시대·최시대(모두 대치 캠퍼스, 김시대 선택). 학부모 맥락 이름 = **김시대 학생**(김민준 아님).
- **#3 결제 화면은 사용자가 직접 다듬음 = 건드리지 말 것**. 사용자 기준: **결제내역 우측 값 = 결제수단(helper, 위)/금액(Bold, 아래) 2줄 우측정렬 스택**(내 1줄 버전과 다름). 납부대기 = 김시대 학생 + 물리 강좌(현정훈T 물리1 서바이벌·최현호T 물리 역학 특강(클리어) 5회 등). 이 "수단/금액 2줄 스택"은 결제내역 고유 → 다른 카드(종강일·전체회차·동영상보강 등 단일 값)엔 미적용, 그쪽은 `키(helper 좌) | 값(Bold 우)`로 이미 일관.

---

# 11. 콘텐츠 단일 출처(SSOT) = 기획서 v5 (★ 사용자가 같은 자료 재공유 안 하도록 저장소에 영구 보관)

> 사용자 강한 지적: "제발 학습 좀 해. 계속 자료를 공유해 주잖아." → **기획서는 저장소에 박아둔다. 다시 받아오지 말 것.**

- **정본 파일(저장소 보관, 항상 여기서 읽음)**:
  - 원본(verbatim, 답변 문구 정본): `analysis/myclass-chatbot/마이클래스_챗봇_시나리오_v5_최신.xlsx` (업로드 원본명 `181abc9e-…v5.xlsx`).
  - 읽기용 구조·검사 요약: **`analysis/myclass-chatbot/기획서_v5_요약.md`** ← 먼저 이거 읽고 시작.
  - 시트 4개: `메뉴 시나리오`·`공통·진입·연결`·`에러 처리 정의`·`측정 지표 정의`.
  - **구버전 `마이클래스_챗봇_시나리오.xlsx`(7메뉴, 2026-06-18)는 폐기 — 읽지 말 것.**
- **xlsx 읽는 법**: `python3` + `openpyxl`(이 환경 설치돼 있음). **병합셀 때문에 1~4depth가 빈칸으로 보임** → `ws.merged_cells.ranges`로 top-left 값 채워 읽을 것(안 그러면 노드↔메뉴 매핑 틀림).
- **홈 메뉴 = 6개 전제**(`처음으로`=메뉴 6개). 상세 정의 5개: 출결·보강 / 입반·등록·대기 / 납부·결제 / 수업·시간표 / 전반. **6번째 미상세(확인 필요)**. (구 5개 확정에서 6개로 늘어남.)
- **콘텐츠=기획서 v5 정본, 디자인=Figma**. 단 **강좌명 더미(박지훈T·이서연T·최민서T)는 placeholder** → 실제 챗봇은 **실명 AMS 강좌명 유지**(§6 규칙). 기획서가 "강좌명=API 응답값 그대로"라 명시 → 더미는 예시일 뿐, 되돌리지 말 것.
- **만족도 문구 정본**: `👍 해결됐어요 / 👎 아직 안 됐어요` (현재 빌드 `도움이 됐어요/아쉬웠어요` → 교체 대상). 노출 규칙·지점 전화번호·에러 6종·측정 8종은 요약.md 참조.
- **v5 ↔ 현재 빌드 차이(동기화 대상)**: 출결·보강에 **타반보강·추가영상 신규**(히트맵·결석신고·현장보강 제거 검토) / 수업·시간표에 **강좌별 전체 회차 일정 신규** / 입반·전반은 v5가 축소형. 상세는 요약.md §6.

---

# 12. ★★ 기획서 v6 (SERP-8270, 2026-06-23) = 최신 SSOT — v5 폐기

> **v6가 정본. v5 이전은 폐기.** 원본 `analysis/myclass-chatbot/마이클래스_챗봇_시나리오_v6.xlsx`(시트 `메뉴 시나리오_v2`) + 티켓 `마이클래스_UX_기획.pdf`(SERP-8270). 읽기용 요약 = **`analysis/myclass-chatbot/기획서_v6_요약.md`** ← 먼저 이거 읽기.

- **공통 UX(모든 화면)**: ①2Depth+ = `[이전][처음으로]` 둘 다 ②헤더 `[홈]` 삭제(닫기 X만) ③**`[상담 등록]` 버튼 제거 → 상담 버튼만**. ⚠️**버튼 라벨 = `상담 연결`**(`call` 아이콘) — 마스터보드(node 1519:14712) 실측값. 옛 `전화 상담 연결`은 **틀림**(사용자 교정). 봇 문구도 "하단의 상담 연결 버튼"이라 일관. ④전화 연결 = 지점별 번호.
- **메뉴 = 4개**(v5의 5개에서 축소): **출결·보강**(오늘출석·강좌선택→[동영상보강/타반보강/추가영상]·**입반 강좌 확인**·강좌선택) / **납부·결제**(납부 현황·결제 내역) / **수업·시간표**(내 시간표·전체 회차·종강일) / **전반**(='전반 가능한 강좌 확인하기', 옛 '시간이 안 맞아요'). **입반·등록·대기 메뉴 삭제**(입반 확인→출결·보강).
- **v6 내용 변경**: 출결 강좌없음=`현재 입반 중인 강좌가 없어요` / 동영상보강=`마이클래스(VOD)·연구실 동영상·시청 N분 제공(M분 시청)` 포맷 / 납부 현황=`[납부필요]`+`[납부대기 or 가상계좌]` 2섹션 / 결제 내역=`결제상태(완료·부분환불) + 외 N건` / 전반 타시간=`지점단과별` 노출.
- **현재 작업 = Figma 1032:54 전체를 다듬은 템플릿(1362·1451)으로 재스킨 + v6 내용 반영** (사용자: "디자인 동기화 + 기획서 변경 동시 반영"). 납부·결제 화면도 **포함**(내용 보존+새 디자인). §10의 "결제 건드리지 말 것"은 **해제**(사용자가 포함 지시).
- **재스킨 방식**(검증됨): 다듬은 프레임 `clone()`→1032:54 원위치 in-place 교체→부제·문구만 v6로 swap→스크린샷 검증. 새 노드 id는 마커 name 인코딩 후 `get_metadata`(200k, 파일저장)→grep으로 회수. **검증 전 "완료" 금지.**
- **진행 현황(이어서 할 것)**: 완료=강좌선택 5장(`1455:*`)·빈상태 3장(`1456:*`). 단 입반 화면 부제는 v6 기준 **출결·보강**으로 교정 필요, 출결 강좌없음 문구도 `입반 중인`으로 교정. 남음=진입(메뉴)·카드(시간표/종강일/전체회차/오늘출석/동영상보강/타반보강/추가영상/입반확인/납부/결제/타시간)·인트로(홈 4메뉴)·패널.

---

# 13. ★ HTML 프로토타입(/chatbot·/chatbot-parent) = Figma 마스터보드(1534:4236) 디자인시스템 동기화

> 사용자 지시: "모든 화면의 폰트·레이아웃·간격·쉐도우·컬러·플로우·아이콘이 전부 바뀜 → 빌드 말고 **디자인 기준 100%**". 정본 = 마스터보드 `1534:4236`(섹션 0.인트로 / 1.출결·보강 / 2.납부·결제). **콘텐츠는 기획서 v6 + §6 규칙 유지**(강좌명 축약 금지·실명·날짜 YYYY-MM-DD·결제내역 이름만·맞춤법).

## 13-1. 아이콘 (★ §5 갱신 — Sharp/200 폐기)
- **Material Symbols `Rounded` · weight `300`(Light)**. 코드: `<link ...family=Material+Symbols+Rounded...>` + `.ms{font-family:'Material Symbols Rounded';font-variation-settings:'FILL' 0,'wght' 300,...}`. (옛 Sharp/200 → 전부 교체됨.)
- 진입칩 아이콘(출결): 오늘출석=`person_check` / 보강확인=`add_notes` / 입반강좌=`check_circle`. 보강 서브: 타반보강=`meeting_room` / 동영상보강=`subscriptions` / 추가영상=`library_add`(순서도 이 순). 홈 타일: fact_check·credit_card·calendar_today·sync_alt(32px).

## 13-2. 디자인시스템 토큰 (마스터보드 확정값)
- **타이포**: 헤더 제목 `body-lg(B)` 18/28, 부제 `body-sm` 14/20. **말풍선·카드제목·칩라벨 = `body-md` 16/24**(옛 14 아님). 위치라벨·태그·뱃지 `body-sm(B)` 14.
- **말풍선**: radius **16**(옛 24 아님)+꼬리4. 봇=흰배경+`border/primary` 보더(쉐도우 없음), 나=`#161616`+`#f4f4f4` 글자. `white-space` nowrap 금지(강좌 echo는 2줄=`nameOf\nschedOf`).
- **카드**: 흰배경+`border/primary` 보더만(쉐도우 없음). 제목 `.paytitle` 전체 Bold, 강조구절=`#0043ce`(파랑), 하단보더 `0.96`.
- **칩 쉐도우(인터렉션 요소)**: 옵션칩(흰/파란보더)=네이비틴트 4단 `rgba(0,29,108,.08/.06/.04/.02)`. CTA칩(네이비채움)=검정 큰 4단 `rgba(0,0,0,.08/.06/.04/.02)`. nav칩(회색 `#e8e8e8`)·만족도칩=쉐도우 없음. 홈 메뉴그리드=네이비틴트 `filter:drop-shadow` 그룹.
- **색**: `text/secondary`=rgba(22,22,22,**0.72**)=#161616b8(옛 0.8 아님). 위치선택기 보더=`border/secondary` 0.48. 헤더 닫기버튼 32×32·helper.

## 13-3. 플로우/구조
- **헤더 부제 = 2단 브레드크럼** `섹션 / 액션`(예 "출결·보강 / 보강 확인", "수업·시간표 / 내 시간표"). `crumb(...parts)`가 `<span class=crumb-sep>/</span>`로 렌더. 메뉴진입=1단, 하위화면=2단.
- **오늘 출석**: 강좌블록 N개(`.atblk`), 각 `강좌명 + 수업시간/출결상태` 2행. 출석=초록 check+시각, 미래=`출석예정`(보라 #6929c4). 제목 강좌prefix 없음.
- **보강 강좌선택 후**: 강좌=나-말풍선(2줄), 봇="어떤 내용을 확인할까요?"만(강좌 중복금지).
- **만족도 규칙**: 데이터조회 종료화면=노출(납부현황·**종강일·전체회차·전반결과 포함** — 데이터+상담연결 CTA 같이 있는 화면도 노출). **빈상태(내역 없음)·순수 상담/전화 종료=미노출**(동영상/추가영상/타반보강 빈상태 navEnd/consultEnd false). ★사용자 결정(피그마 1540:1818·1540:2802가 만족도 포함) — 옛 "상담연결 종료=무조건 미노출"은 폐기. time_end·altResult(데이터분기)는 `consultEnd();satis();` 둘 다 호출.
- **카드 안쪽 간격 = 16px 유지(사용자 결정)**: ⚠️Figma 파일이 섹션마다 토큰스케일 불일치 — 출결·보강 섹션(1519:*/1534:*)은 `space/md=12`(카드제목 pb12·리스트 pt12·nav칩 px12·그룹내갭12)로 갱신됐으나 납부·시간표·전반(1526/1530/1537/1540:*)은 옛 `space/md=16` 유지. 한 shared 클래스로 둘 다 못 맞춤 → **사용자가 16px 통일 선택**(.paytitle pb16·.clist/.ttwrap/.endlist pt16·.chip.nav px16·.menu-grid gap16·.paysec/.phitem py16 그대로). 출결 화면만 피그마보다 4px 느슨하나 일관성 우선.
- **내 시간표**: 2줄 행(요일/시각+타반보강 뱃지 / 강좌명/강의실), `/` 구분자, 다음주=`event_upcoming`.

## 13-4. 파일 동기화
- `public/myclass-chatbot.html`(학생) ↔ `public/myclass-chatbot-parent.html`(학부모): 공유코드 동일, **학부모 고유 4곳만**(title·CHILDREN/CIDX/CTX·buildCtxFilter·heroGreet). 학생 수정 후 학부모는 학생 복사+4곳 재패치로 재생성(스크립트). 검증=Playwright(`window.__noTyping=true`, 헤드리스는 Material Symbols 미로드→아이콘이 텍스트로 보이나 색·레이아웃은 정상).

## 13-5. 남은 항목(사용자 확인 필요)
- **결제 내역 카드 심화 재구조화 보류**: 마스터보드는 `결제금액/환불금액` 라벨행 + `더 보기`(keyboard_arrow_down) 버튼 + `전체환불` 상태 + 날짜 `YY/MM/DD`를 보이나, §6/§10(이름만·YYYY-MM-DD·사용자 직접 다듬음)와 충돌 → 내용규칙 유지하고 구조변경은 보류. 진행 시 사용자 확인.
- Figma의 일부 무공백 표기(`시청기한`·`영상준비중`)는 한글 맞춤법·§6 위배라 정상 띄어쓰기 유지(구분자만 `·`→`/`).

## 13-6. 출결 뱃지 · 만족도 버튼 (사용자 실시간 교정 — Figma 1549:*, 1534:40*)
- **오늘 출석 출결상태 = 컬러 Tag 뱃지**(`.attag`, radius 4·border .8px): 출석=초록 `bg #defbe6·border #a7f0ba·#0e6027` + `check_circle`(fill) + 시각 / 출석예정=주황 `bg #fff2e8·border #ffd9be·#8a3800` + `do_not_disturb_on`(fill). 강좌블록 헤더 = **풀강좌명**(Regular). 순서 = 출석(강은양 13:58) → 출석예정(박종민).
- **만족도 버튼 = 흰 배경 + 이모지**(`.chip.satis`): bg #fff·border `border/primary` 0.08·radius 8, 😄 해결됐어요 / 😭 아직 안 됐어요(이모지 20px, 라벨 `text/secondary` Bold). thumb_up/down 아이콘 아님. (사용자가 cyan/yellow→흰색으로 재교정.)
- **"도움이 됐나요?" = 평문**(`.satq`, `text/secondary` 14)으로 렌더(말풍선 아님).

## 13-7. 카드 행 가로형 · 입반 Tag · 납부/결제 재구조화 · 빈 상태 (Figma 1519:14803·17139 / 1526:2267 / 1530:1183 / 1519:17118·15628)
- **보강 카드 행(타반·동영상·추가영상) = 가로 `.crow`**: 좌 회차라벨(`.ck` placeholder #16161666) | 우 값(`.cv` flex:1 wrap, #161616). 값 안 구분자는 `segs()`로 ` / `를 `.sep`(text/disabled) 분리. Regular(굵게 아님). (옛 세로 `.vrow` 폐기.)
- **입반 강좌 = `.crow` + 과목 Tag**: 좌 `.subjtag`(과목, tag/gray #f4f4f4/#e0e0e0/#525252 radius4 Bold) | 우 강좌 풀네임 Regular. `subjectOf(c)`로 과목 추출. 강좌 0개면 빈 상태.
- **납부 현황 `paySec`**: 행=`.payrow`. 납부기한 행=[`.pdue`(라벨 placeholder + 날짜 `#da1e28`) 좌 | Tag 우]. 품목 행=[라벨 `.plbl`(placeholder w64) + 내용 `.pdesc`(#161616) 좌 | 금액 `.pv` 우]. 합계=`.pv.b` Bold. 섹션 구분 `border/secondary`(.48), 품목묶음 하단 `border/primary`(.08). 납부필요=노랑Tag, 가상계좌=회색Tag.
- **결제 내역 `.phitem`**: 항목=[세부(메타행 `날짜 placeholder | 수단/상태 wrap, / 구분자 disabled` + 강좌명행 #161616) + 결제금액 행 + (환불 시 환불금액 행)]. 라벨 placeholder, 값 Bold. 항목 구분 border/secondary(.48), 세부↔금액 border/primary(.08). **카드 아래 `.morebtn`(더 보기 + keyboard_arrow_down, 흰배경 border/secondary radius16 검정 4단 쉐도우)**. **콘텐츠 규칙**: 날짜 화면표기 `YY/MM/DD`(`fmtYMD()` 변환, 사용자 결정 — 옛 "YYYY-MM-DD 유지"는 폐기), 강좌명 `nameOf`(이름만) + 외N건. PAY_HISTORY 포맷=[날짜 YYYY-MM-DD 정본,강좌,수단,상태,결제금액,환불금액,외N건]. 종강일(`fmtYMD(ENDDATES)`)도 동일.
- **빈 상태**(입반 없음 `현재 입반된 강좌가 없어요.` / 오늘 출석 없음 `오늘(6/24)은 수업이 없어요.`): 카드 아님 **봇 말풍선** + nav칩, **만족도 미노출**(`navEnd(...,false)`). 코드 분기는 있으나 현재 데모 데이터는 항상 강좌 있어 평소엔 미노출.

## 13-8. 메시지 영역 간격 체계 (Figma 실측 대조 — 헤드리스 아이콘폰트 주입 후 1:1)
> 검증법: `ms300.ttf`(Material Symbols Rounded wght300) 다운로드 → Playwright `addStyleTag`로 @font-face 주입 → `#sheet` 스크린샷을 Figma `get_screenshot`과 나란히 비교. (헤드리스 CDN 차단 우회 = 실측 렌더 확보.)
- **그룹 내 16 / 그룹 간 32 체계**: `.log`=`display:flex;flex-direction:column;gap:16px`(그룹 내 기본). `.row`·`.qr`·`.card` margin 제거. **그룹 경계(nav칩·만족도)만 `.grpgap`(margin-top:16 → gap16+16=32)**. quick()에서 **전부 nav(이전/처음으로)일 때만 grpgap**, satis 질문행도 grpgap. (block margin은 collapse → flex gap+margin으로 비충돌 32 구현.)
- ⚠️**CTA(납부하기·상담 연결·다음 주 보기)는 그룹 경계 아님 = 직전 응답(카드/말풍선)과 같은 그룹 16**(Figma node 1519:14712·1526:2281 실측: 응답묶음 안에 CTA 포함). 옛날 `primary||cta`도 grpgap(32) 처리한 건 **틀림**(사용자 교정). quick() grp 조건에서 `primary||cta` 빼고 grpOverride 인자 추가(consultEnd는 `false` 명시). CTA→nav만 32.
- ⚠️**풀폭 CTA(`full:true`)는 우측 32 인셋 = 가로 336**(`.qr.ctainset{padding-right:32px}`, quick()에서 `full&&(primary||cta)`면 부여). 옛 `width:100%`로 368까지 늘린 건 **틀림**(Figma 버튼 x16..351 w335, 카드/말풍선 우측엣지와 정렬). 사용자 "가로폭 같냐" 지적 핵심.
- **말풍선·카드 인셋**: bot `.msg`·`.me .msg` = `max-width:calc(100% - 32px)`(hug). **카드 `.card`는 `width:calc(100% - 32px)`(=336 꽉 채움, hug 아님)** — Figma 카드 전부 w-full. ⚠️옛 `.card{max-width}`(hug)는 제목 짧은 카드(결제내역 "최근 3개월 결제 내역")가 240px로 쪼그라들어 우측정렬 값이 안 맞음 → 사용자 "결제 내역 리스트 가로폭" 지적. `width`로 강제해야 모든 카드 336 통일.
- ⚠️**CTA 쉐도우 = 네이비**(`0 2 2 / 0 8 4 / 0 16 8 / 0 32 8 rgba(0,29,108,…)`, Figma node 1519:14732 실측). 옛 검정·큰값(`64px`까지)은 **틀림** — 큰 검정 그림자가 CTA→nav 간격을 무겁게/달라 보이게 함(사용자 "이전·처음으로 상단 간격" 지적). 옵션칩 쉐도우와 동일.
- ⚠️**`대화 닫기`·터미널 nav 버튼 = 회색**(`{nav:true}` 플래그 → `.chip.nav`). ic 없는 버튼은 자동 nav 인식 안 되니 `nav:true` 명시. quick()에 `isNavBtn=o=>o.nav===true||arrow/home` 헬퍼.
- ⚠️**강좌선택 칩 = 흰 plain 통일**: courseChips·m_overall(전반) 둘 다 `plain:true`(흰 배경). m_overall이 옛 파란테두리였던 건 **틀림**(CLAUDE.md §5 "강좌칩=흰배경" 규칙). 옵션칩(오늘출석·타반보강 등)만 파란테두리.
- **hero(인사말) pb 32→16**(gap-16과 합쳐 인사말→메뉴 32).

## 13-9. 챗봇 기준폭 = Figma 400px (헤드리스 폰트 함정)
- **`.phone` 모바일 목업 폭 430→400**(높이 866)으로 Figma 디자인 기준폭에 정합. (옛 430px는 Figma 400px보다 7.5% 넓어 전체가 커 보였음.)
- **헤드리스 검증 함정**: Playwright 헤드리스는 Pretendard(jsdelivr)·Material Symbols(gstatic) **CDN 차단** → 대체 폰트(글자 더 큼)로 렌더돼 "빌드가 10% 크다"는 착시 발생. **실측 = `page.route`로 jsdelivr Pretendard·gstatic 폰트를 로컬 woff2/ttf로 fulfill + `.phone` 400 override 후 `#sheet`를 Figma `get_screenshot`(widget 400px crop)과 1:1 대조.** 폰트 로드(`document.fonts.check`로 확인) 안 하면 크기 비교 무의미.

# 14. ★ 디자인 대조 툴킷 = `tools/design-audit/` (★ 매 세션 렌더환경 재구축 금지)

> §13-9의 "헤드리스 폰트 주입 + 400px 1:1 대조" 절차를 **저장소에 영구 도구화**함. 화면 정합 작업 전 **먼저 이걸 쓸 것**(임시 스크립트 새로 만들지 말 것).

- **`tools/design-audit/render.cjs <screen> [--parent] [--full]`** — 챗봇 화면을 Figma 기준폭 400px + 로컬 폰트(fonts/) 주입으로 충실 렌더 → `out/L_<screen>.png`. (CDN 차단 우회 내장. `node`로 실행, 전역 Playwright 자동 탐색.)
- **`tools/design-audit/compare.py <figma.png> <build.png> <out.png> [fig_top]`** — Figma 스크린샷 vs 빌드 렌더 나란히(왼 Figma·오 빌드).
- **`tools/design-audit/screens.json`** — 화면키 → Figma 노드ID + 내비게이션 경로 지도(전 화면). Figma 노드는 여기서 회수.
- **`tools/design-audit/fonts/`** — Pretendard·Material Symbols Rounded wght300(동봉, 재다운 불필요).
- **절차**: ①`render.cjs <screen>` 으로 빌드 렌더 → ②`get_screenshot(node)` URL을 `out/fig_*.png`로 curl → ③`compare.py`로 비교 → ④`get_design_context(node)`로 정확 토큰 확인 후 수정. **검증 전 "완료" 금지.**
- 토큰스케일 불일치(출결 12 / 나머지 16, 사용자 16 통일)·의도된 콘텐츠차(실강좌4·맞춤법·YY/MM/DD)는 README 참고.

---

# 15. ★★ 화면 정합 "반복 실패"의 근본 원인 = 낡은 노드 ID + 눈대중 검증 (2026-06 전수 재검증)

> 사용자 지적: "모달만 문제가 아니야, 다른 화면 만들 때도 항상 문제." → 원인을 끝까지 파니 **두 가지**였음. 둘 다 여기 박아 재발 방지.

## 15-1. 근본 원인 ① — 내가 비교하던 Figma 노드가 삭제/이동돼 있었음 (★최대 원인)
- Figma 파일은 자주 재구축됨 → **노드 ID가 바뀜**(§7). 내 `screens.json`·CLAUDE.md 곳곳의 노드 참조가 **낡아(stale)** 있었고, 나는 **없는 화면/엉뚱한 화면과 대조**하고 있었다.
- **2026-06 실측 결과**:
  - **마스터보드 `1534:4236` 삭제됨**(§13의 "정본 마스터보드"는 폐기). **출결·보강 `1519:*` 전부 삭제됨**.
  - **현재 정본 = 페이지 `1032:54` "MYCLASS_Chatbot"**(top-level page). `get_metadata(1032:54)`로 현재 노드 회수.
  - **출결·보강 섹션은 `1629:*`로 재구축**(이름 서술형): 진입 `1629:2848` / 오늘출석 `1629:2902`(빈상태)·`1629:2926`(채움) / 강좌선택후 `1629:3076` / 타반보강 없음 `1629:3105`·있음 `1629:3132` / 동영상보강 없음 `1629:3185`·있음 `1629:3210` / 추가영상 없음 `1629:3293`·있음 `1629:3318` / 입반강좌확인 없음 `1629:3531`·있음 `1629:3555`.
  - **납부/시간표/전반은 ID 유지**(`1526:2267`·`1530:1183`·`1537:3331`·`1540:1818`·`1539:1458`·`1540:2802`). 단 **프레임 이름이 "출결·보강 · 타반보강 · 있음"으로 복붙돼 신뢰 불가** → 이름 말고 **내용/스크린샷**으로 식별.
- **`screens.json`은 위 현재 노드로 갱신함**(2026-06). 옛 `1519:*` 참조(CLAUDE.md §13-3/§13-7/§13-8의 "Figma node 1519:14732 실측" 등)는 **무효 — 현재 노드로 재확인 후 사용**.
- **규칙(필수)**: 화면 대조 시작 전 **노드가 살아있는지부터 확인.** `get_screenshot`/`get_design_context`가 `invalid node`를 반환하면 = 그 노드는 죽음 → `get_metadata(1032:54)`로 현재 노드를 다시 찾는다. **죽은 노드와 비교한 "맞췄다"는 무의미.**

## 15-2. 근본 원인 ② — 검증을 "완료 보고 후"에, "눈대중"으로 함
- Figma 공식 문서(`developers.figma.com/docs/figma-mcp-server`)의 **필수 구현 순서** 마지막 단계 = **"완료라고 하기 전에 Figma와 1:1 검증"**. 나는 이걸 (a)완료 보고 후에, (b)눈대중으로 → 사용자가 QA를 대신하게 됨.
- **규칙(필수)**:
  1. 화면마다 `get_design_context(현재노드)`로 **정확 토큰을 숫자로** 뽑아 빌드 CSS와 **숫자 대조**(눈대중 금지).
  2. `tools/design-audit/render.cjs <screen> --full` 렌더 + `get_screenshot` 받아 **구조 누락**까지 대조.
  3. **검증 통과 전 "완료" 보고 금지.** (§0과 동일 — 이번에 그 의미를 구조화.)
  4. 화면이 많으면 **화면별 병렬 서브에이전트**에 위임(무거운 Figma 출력이 메인 컨텍스트를 안 채우게). 각 에이전트는 `{요소·속성·Figma값·빌드값·고칠위치}` 구조화 목록만 반환 → 메인에서 **파일로 재검증 후** 수정.

## 15-3. 전수 재검증 결과 (2026-06, 14개 노드 화면)
- **빌드는 대부분 충실했음**(13/14 MATCH). 진짜 문제는 "낡은 노드와 비교"였지 빌드 품질이 아니었다.
- **실제 수정 3건**: ①`time_end` 브레드크럼 `종강일`→`종강일 확인`(1540:1827) ②`extra` "영상 준비 중"(데이터 없음) 행 = `text/secondary`(0.72) 흐림 처리(`.crow .cv.pend`) ③`other_empty` 봇 말풍선 강제 `\n` 제거(Figma 한 문단 흐름).
- **의도된 차이(불일치 아님, 재확인)**: 칩 좌우 패딩 16(=`.chip` 한 클래스가 출결12/나머지16 둘 다 못 맞춰 **사용자 16 통일**) · 카드 내부 간격 16 통일 · 실강좌4 · YY/MM/DD · 한글 띄어쓰기 · 카드 제목은 **풀네임**(Figma대로), 상세 문장·시간표·결제는 **이름만**(§6).

---

# 16. ★★ 카카오 상담 수집 채널 정본 (2026-07-03 사용자 확정 — 이전 명칭·목록 폐기)

> 사용자가 시대인재 운영 채널 정리본을 확정 제공. 기존 수집은 3개뿐(2개 누락)이었고 명칭도 일부 틀렸음. 아래가 정본. `profile_id`는 `business.kakao.com/{id}` 경로의 그 값.

| profile_id | 정식 명칭 | 표시 약칭 | 상태(2026-07-03) |
|---|---|---|---|
| `_VGAQn` | 시대인재 마이클래스 | 마이클래스 | 수집 중(기존) |
| `_rcpPG` | 시대인재 LIVE | LIVE | **신규 편입**(기존 누락) |
| `_TkpPG` | 시대인재 LIVE (기술지원) | LIVE 기술지원 | 수집 중(기존, 옛 명칭 "라이브"는 틀림) |
| `_xfxilXn` | 시대인재 콘텐츠 | 콘텐츠 | 수집 중(기존, 옛 명칭 "시대인재C"는 틀림) |
| `_rkbcn` | 시대인재 통합로그인 안내 | 통합로그인 | **신규 편입**(기존 누락) |

- **핵심 교정**: 예전에 "라이브"로 부르던 `_TkpPG`는 실은 **LIVE 기술지원 부채널**이고, **메인 LIVE(`_rcpPG`)는 통째로 누락**돼 있었다. 옛 분석의 "라이브 저트래픽 0.8건/일"은 기술지원 채널을 본 것 → **메인 LIVE 데이터로 재해석 필요**. `_xfxilXn`도 "시대인재C"가 아니라 **콘텐츠**.
- **수집 코드**: `supabase/functions/kakao-collect/index.ts`의 `PROFILE_IDS`에 5개 전부. 라벨 매핑을 쓰는 곳(분석 RPC·일일요약·인사이트의 `array['_VGAQn','_TkpPG','_xfxilXn']`↔`array['마이클래스','라이브','시대인재C']`)은 **5채널+정식 약칭으로 갱신 대상**.
- **접근 권한**: 쿠키 계정이 5개 전부 접근 가능(2026-07-03 probe 확인, 모두 200).
- **일괄 백필**: 신규 2채널은 `supabase/functions/kakao-backfill`(mode=chats 발굴 → mode=messages 본문, 멱등·재개)로 전체 기간 수집. PII 마스킹은 kakao-collect와 동일(전화·주민·카드·이름), 저장 후 유출 0 감사 필수.
- **채널 표시 우선순위(사용자 설정, 5채널 확장 시 확인 필요)**: 기존 마이클래스 > 라이브 > 시대인재C. 신규 편입으로 재확인 대상(잠정: 마이클래스 > LIVE > LIVE 기술지원 > 콘텐츠 > 통합로그인).

---

# 17. ★★ 사용자 신원·인프라 정정 (2026-07-06, 반복 오류 → 영구 기록)

> 이 세션에서 두 가지를 반복해서 잘못 알고 있다가 사용자에게 직접 교정받음. 다음 세션에서 다시 틀리지 않도록 고정.

## 17-1. 사용자 신원 — "사장님" 아님

- **이름**: 김명준
- **소속**: (주)하이컨시 > TECH사업본부 > 플랫폼서비스팀 > 캠퍼스파트
- **직함**: 플랫폼 UX 디자이너 겸 PO(Product Owner)
- **호칭**: **"사장님"으로 부르지 말 것.** 이 문서 어디에도 "사장님" 호칭을 지시한 적 없음 — 이전 세션이 "회사 서비스 운영자"라는 맥락만 보고 임의로 붙인 잘못된 추정이었다. **"김명준님"으로 부를 것.**
- **§1의 "개발 지식이 전무함" 커뮤니케이션 스타일 규칙은 그대로 유지**(사용자가 이 규칙 자체를 바꾸라고 지시한 적 없음 — 직함만으로 임의로 말투를 바꾸지 말 것). 신원 정정과 응답 톤 규칙은 별개.

## 17-2. 카카오 쿠키 갱신 기기 — "맥북"이 아니라 "맥 스튜디오"

- 카카오 파트너센터 로그인 쿠키를 6시간마다 추출해 Supabase로 배달하는 기기는 **회사 자산 맥 스튜디오(Mac Studio, 데스크탑)**다. **개인 맥북(노트북)이 아니다.**
- 맥 스튜디오는 **뚜껑도 배터리도 없다** — "노트북 뚜껑을 닫으면 잠든다", "배터리 대신 전원 어댑터 연결 시 절전 안 함" 같은 노트북 전용 조언은 전부 무의미하다. 앞으로 이 기기 관련 조언은 데스크탑 기준(디스플레이 꺼짐 시 시스템 절전 안 함 설정 등)으로만 할 것.
- 이 세션에서 "맥북"으로 잘못 서술했던 문서·코드 주석(`docs/KAKAO_PARTNER_SETUP.md`, `scripts/kakao-partner-collect-once.mjs`, `scripts/launchd/com.amswiki.kakao-cookie-refresh.plist`, 관련 마이그레이션 주석 등)은 전부 "맥 스튜디오"로 정정 완료. 단, `kakao-classify`의 학부모 채팅 분류 키워드(`맥북|mac os` 등)는 학부모 개인 기기를 가리키는 정상 규칙이라 그대로 둠(우리 인프라와 무관).

---

# 18. ★ Astryx 디자인시스템 = 프론트엔드 작업의 유일 기준 (사용자 지시, 앞으로 모든 작업)

> 사용자 지시(2026-07-08): "버튼·드롭다운·인풋필드 등 인터렉션 컴포넌트는 Astryx 디자인시스템으로. astryx의 가이드·파운데이션·라이브러리 모두 참조하여 완벽히 구현할 것. 앞으로 모든 작업에서도."

- **모든 UI는 `@astryxdesign/core` 컴포넌트로**: 버튼=`Button`, 드롭다운=`Selector`(단일)/`MultiSelector`(다중)/`DropdownMenu`(액션메뉴), 입력=`TextInput`, 그 외 `Card`·`Badge`·`Heading`·`Text`·`VStack`·`HStack`·`Grid`·`Divider` 등. **raw `<select>`·`<button>`·`<input>` 금지** — 네이티브 요소를 토큰으로 흉내내지 말고 디자인시스템 컴포넌트를 쓴다.
- **작업 전 공식 문서 조회(추측 금지)**: `node node_modules/@astryxdesign/core/docs.mjs <Component>`(props·best practices·anatomy), `--list`로 전체 목록. 토큰/테마 파운데이션은 `npx astryx docs tokens`·`npx astryx docs theme`, 페이지 템플릿은 `npx astryx template --list`. Selector 등은 `renderOption`으로 커스텀 행(SelectorOption을 children으로 직접 넘기지 말 것).
- **색·간격·라운드·쉐도우는 전부 Astryx 토큰(var)만**: raw hex/px 남발 금지. primitive로 표현 못하는 레이아웃만 co-located `*.astryx.css`에서 토큰(var)으로 처리. 전역 `<Theme>`(AdminLayout)에서 토큰/모드 상속 → 페이지에서 Theme 재래핑 금지.
- **동종 페이지는 동일 스펙**: 예) `/admin/consults`(카카오 상담)·`/admin/jandi`(잔디 대화)는 같은 shell·헤더·KPI·툴바(칩+Selector+검색)·패널 chrome을 공유한다. 메시지 렌더링만 데이터 성격에 따라 다름(카카오=2자 말풍선 in/out 틴트, 잔디=다자 스레드+답글) — 이건 의도된 차이라 억지로 통일하지 말 것.
- **검증**: 컴포넌트 교체 후 `npm run build` 통과 확인 + Vercel 프리뷰로 실제 렌더 확인. 빌드만으로 "완료" 단정 말고 프리뷰 대조까지.

---

# 19. ★ 글쓰기 정본 = 가이드 + 문체 지문 + 측정기 3종 세트 (휴머나이저 한계의 해답)

> 배경(2026-07-13): 휴머나이저 2종 + 정량 교정까지 거쳐도 "여전히 AI 같다"는 문제 반복. 원인 = 목표가 "일반 인간 평균"이었기 때문. 자연스러움은 특정 인물(김명준)의 목소리에서 나온다. 슬랙 실제 메시지에서 지문을 떠 저장소에 박아둠.

- **총괄 = `analysis/글쓰기_가이드_김명준.md`** (2026-07-13 완결판): 3층 원리(문체 카탈로그/정량 신호/목소리, 연구 근거 포함) + 글 종류별 공식(피라미드·국립국어원 쉬운 공공언어) + 워크플로우 2종(정순/역순 구술) + 도구 스택 전수조사(커넥터·플러그인엔 글쓰기 도구 없음 확정) + 발행 전 체크리스트 + 참고자료 전목록. **글쓰기 작업은 이 가이드 0장 순서대로.**
- **측정기 = `tools/writing/ko_ai_score.py`** (저장소 내장, 의존성 없음): `python3 tools/writing/ko_ai_score.py 글.txt --mj` (--mj = 명준 실측 기준). 10개 지표(쉼표 문장비율·문장 CV·상투어·번역투·문두 접속부사·줄표·첫째둘째·종결 쏠림·"것" 밀도·문단 균일성), 근거 태그([논문]=KatFishNet ACL 2025 / [실측] / [카탈로그] / [휴리스틱]) 표기. AI 표본 위험5 vs 명준 표본 위험0 분리 검증됨.

- **정본 = `analysis/문체지문_김명준.md` (v2 심층판, 슬랙 실측 116건)**. 보고서·공지·문서를 쓰거나 다듬을 때 휴머나이저보다 먼저 이 지문을 적용한다. 재수집 불필요(슬랙 재검색 금지, 본인 장문 문서를 새로 확보했을 때만 갱신).
- v2 구성: 레지스터 4종(공지/요청·질문/채팅/셀프메모) 구조 공식 + 정량 지문(쉼표 문장 16~18%로 인간 평균 26%보다도 낮음, 문장 길이 CV 0.75+, 합니다/해요체 반반 혼용, ".." 두점 말줄임) + AI→명준 변환표(8장) + 금지목록(문두 접속부사·줄표·첫째둘째·과장 수식 = 실측 0회, 7장).
- 핵심 3가지: ①구조 = "프레이밍 1문장 + 불릿 + 괄호 부연 + 요청 1줄"(긴 산문 문단 금지) ②밀도 불균형(모든 항목 같은 분량·같은 템플릿 = 최대 AI 신호. 중요한 건 길게, 사소한 건 한 줄) ③1인칭 판단 문장("고민이 있었는데 ~해서 ~로 정했습니다") 2~3개 이상 + 요청은 의문형("~주실 수 있을까요?")으로.
- 마지막 단계는 대체 불가: 완성 전 사용자 본인이 겪은 디테일 1~2개를 구술로 받아 주입할 것. 더 강력한 역순 워크플로우(본인 구술 → AI 받아쓰기)는 지문 문서 9장 참조.

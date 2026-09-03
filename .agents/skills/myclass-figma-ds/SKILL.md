---
name: myclass-figma-ds
description: 마이클래스 챗봇 Figma 파일(6PSg6RlWrjpnNYk1zirmUp) 작업 규칙. Figma 화면을 만들거나 고칠 때, 디자인시스템 토큰·텍스트스타일·아이콘 컴포넌트를 bind할 때, use_figma/Plugin API로 노드를 다룰 때, 카드·말풍선·칩 컴포넌트를 만들 때, 강좌명·날짜 표기를 정할 때 사용한다. get_variable_defs 검증 절차와 Plugin API 함정 모음을 포함한다.
---

# 마이클래스 챗봇 Figma · 디자인시스템 작업 규칙

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


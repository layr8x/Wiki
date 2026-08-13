한 줄 요약 3줄

1. 61건은 실제로 **17개 작업**으로 줄어든다. 뿌리는 4개뿐이다 - (가) 조회 실패를 화면이 0으로 바꾼다, (나) 다크모드에서 표면 토큰 3개가 같은 값이라 로딩·말풍선이 사라진다, (다) Astryx `Text`의 `size` prop이 구현 없는 무효 prop이라 지표 숫자가 본문 크기로 떨어진다, (라) 같은 UI를 5개 화면이 각자 손으로 만들어 값이 갈라졌다.
2. **1차(반나절, 위험 낮음) 8건만 처리해도 RICE 상위 7개 중 6개가 끝난다.** 특히 감사 도구 수정(다크 렌더 미작동)은 다른 모든 작업의 검증 전제라 가장 먼저 해야 한다.
3. 구조 변경(대시보드 재구성, 상단 적층 축소, 공용 chrome 추출)은 2차로 미루고, DB 스키마 변경 1건과 정보구조 판단 3건은 김명준님 결정 대기로 남긴다.

---

## 0. 먼저 알아야 할 것: 지금 감사 근거의 절반이 무효다

`audit-signal-trust` 확인 결과, `tools/design-audit/admin/out/` 안의 **모든 `*_dark_*.png`는 사실 라이트 모드 렌더**다. 하네스가 html에 `dark` 클래스를 붙여도 `src/hooks/useDarkMode.js`가 마운트 시 localStorage 기본값(light)으로 지워버린다. 즉 주 사용 환경인 다크 모드는 아직 아무도 검증하지 않았다.

또 `audit.json`은 2026-08-13 00:00 생성본인데 그 뒤 커밋 두 개(00:39, 00:42)가 있어, 그 파일을 근거로 삼은 지적 일부가 이미 사실이 아니다(잔디 방 이름 1920px 잘림 등). CLAUDE.md 15장이 경고한 "낡은 기준과 대조"가 이번 감사 안에서 다시 발생했다.

**그래서 작업 1번은 UI 수정이 아니라 감사 도구 수정이다.**

---

## 1. RICE 우선순위 (17개 작업)

도달(R): consults 3(매일 여러 번) / jandi·overview 2 / guides·feedback 1 / 전 화면 공통 3
영향(I): 0.5~3 · 확신(C): 0.5~1 · 노력(E): 사람-일 [추정]
점수 = R x I x C / E

| 순위 | 작업 | 화면 | R | I | C | E | 점수 | 묶음 |
|---|---|---|---|---|---|---|---|---|
| 1 | 감사 도구 수정(다크 렌더·클릭영역 기준) | 도구 | 3 | 2 | 1 | 0.25 | 24.0 | 1차 |
| 2 | 비활성 색 각주·차트축 대비 수정 | 전체 | 3 | 2 | 1 | 0.25 | 24.0 | 1차 |
| 3 | 지표 숫자 크기 복구(`size` -> `type`) | consults·jandi | 3 | 2.5 | 1 | 0.5 | 15.0 | 1차 |
| 4 | 모바일 메시지 행 세로 접기 | consults·jandi | 2 | 3 | 1 | 0.5 | 12.0 | 1차 |
| 5 | 분포 막대를 전체 대비로 | overview | 2 | 1.5 | 1 | 0.25 | 12.0 | 1차 |
| 6 | 라벨·용어 정리(약어·차원·단위) | 전체 | 3 | 1.5 | 1 | 0.5 | 9.0 | 1차 |
| 7 | 색으로만 전달되는 상태 글자화 | consults·guides | 3 | 1.5 | 1 | 0.5 | 9.0 | 1차 |
| 8 | "지금 처리할 대화" 클릭 가능화 | consults | 3 | 3 | 0.9 | 1 | 8.1 | 2차 |
| 9 | 다크 표면 토큰 + Skeleton 통일 | 전체 | 3 | 2.5 | 1 | 1 | 7.5 | 2차 |
| 10 | 오류·빈·로딩 3상태 분리 | 전체 | 3 | 3 | 1 | 1.5 | 6.0 | 2차 |
| 11 | 필터를 SegmentedControl로 + 건수 | 4화면 | 3 | 1.5 | 1 | 1 | 4.5 | 2차 |
| 12 | 상단 적층 축소(잔디 2열, KPI 밴드) | consults·jandi | 3 | 2 | 0.6 | 1.5 | 2.4 | 2차 |
| 13 | 감정 추세 차트 축·접근성 | overview | 2 | 1.5 | 0.8 | 1 | 2.4 | 2차 |
| 14 | 대시보드 정보구조(실시간·연결) | overview | 2 | 2.5 | 0.7 | 1.5 | 2.3 | 2차 |
| 15 | 피드백 표 열 축소 + 상세 보기 | feedback | 1 | 2.5 | 1 | 1.5 | 1.7 | 2차 |
| 16 | 가이드 표 가로 잘림 + 액션 열 | guides | 1 | 3 | 1 | 2 | 1.5 | 2차 |
| 17 | 공용 shell·카드 chrome 추출 | 전체 | 3 | 1 | 1 | 2 | 1.5 | 2차 |

1차 합계 [추정] 2.75 사람-일, 2차 합계 [추정] 12.5 사람-일.

---

## 2. 1차: 지금 바로, 반나절 이내, 위험 낮음

### 1-1. 감사 도구 수정 (선행 작업)

- `tools/design-audit/admin/entry.jsx` 35행: 클래스 토글과 함께 `localStorage.setItem('ams-wiki:theme', mode)`를 실행한다. 그래야 `useDarkMode`가 되돌리지 않는다.
- `tools/design-audit/admin/render.cjs`: 클릭영역 판정 `r.height < 32 || r.width < 32`를 **24**로 바꾸고, 요소 자체가 아니라 실제로 클릭을 받는 조상 상자를 기준으로 잰다(현재 27건 경고 중 26건이 오탐).
- 감사 결과 파일에 **실행 시각과 커밋 해시**를 기록한다. 낡은 `audit.json`으로 판단하는 일을 막는다.
- 기존 `out/*_dark_*.png`는 전부 지우고 다시 뽑는다.

### 1-2. 비활성 색 각주·차트축 대비 (WCAG AA 미달)

읽어야 하는 문장에 "조작 불가" 색을 쓰고 있다. 실측 대비 라이트 2.52:1, 다크 2.20:1 (기준 4.5:1).

- `src/components/analytics/KakaoConsultStatus.astryx.css` 39행, `AnalyticsHeader.astryx.css` 45행, `JandiStatus.astryx.css` 26행: `color: var(--color-text-disabled)` 선언을 **삭제**한다(Text의 supporting 기본색을 그대로 쓰는 게 가장 안전). 명시가 필요하면 `var(--color-text-secondary)`로 바꾼다(라이트 4.7:1, 다크 6.8:1).
- `AnalyticsHeader.astryx.css` 65행: 축 `fill`도 같은 토큰으로, `font-size: 9px` -> `12px`.
- 같은 세 곳의 `<Text size="xs">`는 Astryx가 허용하지 않는 값이라 무시되고 있다. `type="supporting"`으로 바꾼다.

### 1-3. 지표 숫자 크기 복구

`node_modules/@astryxdesign/core/src/Text/Text.tsx` 204행이 `size`를 구조분해만 하고 쓰지 않는다. 즉 **`size` prop은 문서에만 있고 구현이 없다.** 그래서 "지금 밀린 상담 7"이 본문과 같은 14px로 나온다.

- `src/components/analytics/KakaoConsultStatus.jsx` 153행: `size="3xl"` -> `type="display-2"` + `hasTabularNumbers` (35px)
- `src/pages/admin/AdminConsultsPage.jsx` 194행: `size="2xl"` -> `type="display-3"` (29px)
- `src/components/analytics/AnalyticsHeader.jsx` 130행: -> `type="display-3"`
- `src/components/analytics/JandiStatus.jsx` 30·51행, `src/pages/admin/AdminJandiPage.jsx` 193행: 같은 규칙 적용
- `weight` 오버라이드는 `type`이 처리하므로 함께 제거한다.
- 저장소 전체의 다른 `size=` 사용처도 같이 훑어 위계를 한 번에 정한다(전역 무효 prop이라 지금 전부 안 먹고 있다).

### 1-4. 모바일 메시지 행 세로 접기

390px에서 말풍선이 49~71px만 남아 한 줄에 한 글자씩 흐른다. 53자 메시지 한 건이 833px 높이다.

- `src/pages/admin/AdminConsultsPage.astryx.css`의 기존 `@media (max-width: 640px)` 블록(73행)에 추가:
  `.ac-msg { flex-direction: column; align-items: stretch; gap: var(--spacing-1) }`,
  `.ac-msg-time, .ac-msg-sender { width: auto; max-width: none; flex: 0 0 auto }`
- `src/pages/admin/AdminJandiPage.astryx.css`에 동일 규칙(`.aj-msg`, `.aj-msg-time`) 추가. 두 화면 동시에 해야 제약 2가 유지된다.
- 좁은 폭에서는 시각을 `HH:MM`만 표기한다(`fmtKST`에 짧은 포맷 분기 추가). 스레드 헤더에 이미 날짜가 있다.
- 같은 자리에서 `KakaoConsultStatus.jsx` 229행 `descriptionLines={1}`을 **좁은 폭에서만 2**로 올린다(390px에서 미리보기가 8글자만 남고 툴팁도 없다).

### 1-5. 분포 막대를 전체 대비로

`AdminOverviewPage.jsx` 222-223행이 `maxPct` 자신을 분모로 써서 1위 행은 항상 정확히 100% 길이다. 라벨은 44.1%인데 막대는 꽉 찬다.

- 응답시간(204행대)·카테고리(256행대) 막대를 Astryx `ProgressBar`로 교체하고 `value={row.pct} max={100}`.
- **`label`은 필수 prop이다.** 왼쪽 라벨이 이미 있으므로 `isLabelHidden`을 반드시 함께 준다.
- 개수만 있고 합이 100이 아닌 모듈 분포(143-144행)는 최대값 기준을 유지하되, 카드 부제에 "가장 많은 모듈 기준"이라고 적는다.
- `.ov-bar-track` / `.ov-bar-fill` 수제 CSS 삭제. 교체 후 라이트 모드 트랙 색이 바뀌므로 눈으로 한 번 확인한다.

### 1-6. 라벨·용어 정리

- `KakaoConsultStatus.jsx` 146행: `지금 밀린 상담 (North Star · 5채널 합산, 실시간)` -> `지금 답을 기다리는 상담 (5채널 합산, 실시간)`. North Star라는 표현은 `.kcs-footnote` 각주로 내린다.
- 같은 파일 239·244·255행: `채널별 응답 현황(SLA)` -> `채널별 응답 현황 (응답 목표 시간 기준)`.
- 표 헤더 `중앙값 응답` -> `중앙값 첫 응답(분)`. 단위를 값이 아니라 헤더에 둔다. 헤더 줄바꿈은 `src/App.astryx.css` 23-26행 전역 규칙이 이미 처리한다.
- 183-188행 급증 배너: `오늘 '라이브' 문의` -> `오늘 '라이브' 유형 문의`. 같은 화면 아래에 채널 LIVE·LIVE 기술지원이 있어 두 뜻이 겹친다(`kakao-classify`의 분류 목록에 실제로 '라이브' 유형이 있다). 유형은 중립 Badge, 채널은 기존 `CHANNEL_BADGE` 색으로 고정해 색으로도 갈라놓는다.
- 같은 배너에 **이미 들어와 있는데 안 쓰는 `channelBreakdown`**(`db.js` 407행)을 설명 줄에 표기한다: `LIVE 33건 · 콘텐츠 8건`. 어느 채널을 열어야 하는지가 바로 보인다. 새 조회 불필요.
- 대화 수 단위 통일: `JandiStatus.jsx` 54행 '건', `AdminJandiPage.jsx` 197·389행 '개' -> 메시지는 '건', 대화 묶음은 '개 대화'로 고정.
- `src/layouts/AdminLayout.jsx`: `aria-label="Breadcrumb"` -> `"현재 위치"`. 햄버거는 `MobileNavToggle`에 `label="메뉴 열기"`를 준다(기본값이 `Open navigation`).

### 1-7. 색으로만 전달되는 상태 글자화

Astryx `StatusDot` 문서가 "항상 보이는 텍스트 라벨과 함께 쓸 것"을 두 번 명시한다. 지금은 8px 점 색깔뿐이고 상태 이름은 `aria-label`에만 있다. 수집이 멈춘 것을 18일간 못 알아챈 자리라 판단 실패 비용이 크다.

- `KakaoConsultStatus.jsx` 88-96행: '마지막 수집' 열 값 앞에 Astryx `Badge`(정상 / 지연 / 로그인 만료)를 붙인다. 로그인 만료는 이미 그 칸에 글자로 나오므로 세 상태를 같은 자리에 통일한다. 채널 열 폭을 안 늘리는 쪽이다.
- `src/pages/admin/AdminGuidesPage.jsx` 46-50행 `STATUS_BADGE_VARIANT`: `published: 'neutral'`, `draft: 'blue'`, `archived: 'neutral'`로 바꾼다. Astryx Badge 문서가 "정상 항목마다 success 배지를 붙이지 말 것", "모든 행에 같은 배지를 반복하지 말 것"을 명시한다. 솔리드 warning/error는 실제 조치가 필요한 것(지연 N채널, 수집 중단)에만 남긴다.

### 1-8. 함께 처리할 소액 수정 (각 10분 이내)

- `src/pages/admin/AdminFeedbackPage.astryx.css` 10행 `max-width: 64rem` -> **72rem**. 이 화면만 128px 좁아 화면을 옮길 때 본문이 64px 튄다. `src/App.astryx.css` 4행 `.page-skeleton`도 72rem.
- `AdminGuidesPage.jsx` 269행 `새 가이드 작성` 버튼: `variant="primary" size="sm" icon={<PencilLine size={14} />}`로 대시보드와 맞춘다(지금 116x32 보조 스타일, 대시보드는 140x28 주요 스타일).
- 상담·잔디 값 통일 5건: 메시지 행 구분선(잔디의 `color-mix(... 60%)` -> `var(--color-border)`), 툴바 아이콘 `size={14}` -> `16`, 패널 헤더 구분선 `<Divider />`로, 더 보기 정렬 `HStack hAlign="center"`로, 스레드 헤더 `align-items: center`로. 정의 없는 `.aj-main`에 `overflow: hidden` 추가.
- `KakaoConsultStatus.jsx` 198-199·244-245·279-280행: 섹션 제목과 오류 문구가 둘 다 인라인이라 `채널별 응답 현황(SLA)SLA 표 불러오기 실패`로 붙어 읽힌다. 두 Text를 `VStack gap={2}`로 감싸고 `.kcs-section-title`의 무효한 `margin-bottom`을 제거한다.

---

## 3. 2차: 구조를 건드리는 것

### 2-1. "지금 처리할 대화" 클릭 가능화 (RICE 8.1, 최우선)

이 위젯은 화면에서 유일하게 "지금 뭘 해야 하는지"를 말하는 자리인데 행이 정적 DIV다(내부에 a·button 0개, cursor auto).

1단계(백엔드 변경 없음): `KakaoConsultStatus.jsx` 203-225행 `<Item>`에 `onClick`을 붙여, 그 행의 채널로 툴바 필터를 전환한다. `AdminConsultsPage`에서 `onSelectChannel` 콜백을 내리고 `CHANNEL_BADGE` 자리의 라벨-profile_id 매핑을 재사용한다.
2단계: `supabase/migrations/`에 새 마이그레이션으로 `kakao_action_chats` 반환에 `chat_id`, `profile_id` 추가(현재 `channel·nickname·waited_h·preview`만 반환하고 내부에서 다루던 `p.chat_id`를 버린다). `src/lib/db.js` 386-391행 매퍼에도 실어, 클릭 시 해당 스레드로 스크롤·강조한다. 스레드 요소에 스크롤 대상 id가 없으므로(`AdminConsultsPage.jsx` 477행은 key만) 그 부분을 함께 손댄다.

Astryx Item 문서가 "Item으로 화면 간 이동 금지"라 하므로 새 라우트가 아니라 현재 화면 상태 전환으로 처리한다. 행 안에 별도 버튼을 중첩하지 않는다.

### 2-2. 다크 표면 토큰 + Skeleton 통일 (RICE 7.5)

`@astryxdesign/theme-neutral`이 다크에서 `--color-background-body`, `--color-background-card`, `--color-background-muted`를 전부 `#1b1b1b`로 정의한다. 그래서 스켈레톤·상담원 말풍선·스레드 헤더가 카드와 대비 1.00으로 사라진다.

- 수제 스켈레톤 3벌(`.ac-skel`+`ac-pulse`, `.aj-skel`+`aj-pulse`, `.ov-skel`+`ov-pulse`, `.kcs-skel`)과 keyframes를 삭제하고 Astryx `Skeleton`으로 교체한다. 가이드·피드백 화면이 이미 이 방식이다(`AdminGuidesPage.jsx` 318행). 치수 이관: KPI `width={96} height={32}`, 스레드 행 `width="100%" height={80}`, 대시보드 바 `height={32}`, 감정 차트 `height={128}`. 목록형은 `index={i}`로 순차 흐름을 준다.
- 표면 위에 얹히는 면은 `--color-background-muted` 대신 `--color-background-surface`(`light-dark(#ffffff, #262626)`)를 쓴다. 적용 대상 2곳: `.ac-msg[data-dir="out"] .ac-msg-bubble`, `.ac-thread-head`(잔디 `.aj-thread-head`도 동일).
- 고객 말풍선(`--color-background-blue`)은 그대로 둔다. 2자 대화 구분 규칙을 유지한다.
- 감정 차트 중립 막대(`--color-icon-disabled`, 다크 대비 2.20:1)도 3:1 이상 확보되는 토큰으로 교체하고 재측정한다.

### 2-3. 오류·빈·로딩 3상태 분리 (RICE 6.0, 영향 최대)

**현재 5개 화면 중 3개가 조회 실패를 데이터 0으로 보여준다.** overview는 오류 화면과 빈 화면의 md5가 같고(14b13be6...), feedback도 같다(60cfbc70...). guides도 동일(9b4c4534...). 카카오 수집이 18일간 멈춘 것을 못 알아챈 사고와 같은 유형이다.

- `src/lib/db.js` 272-288행 `fetchDashboardStats`: `guidesRes.data || []`, `searchRes.count || 0` 패턴을 지우고 `if (error) throw error`로 바꾼다. `formatNumber`(41행)가 숫자가 아니면 `—`를 반환하므로 KPI 표기는 자동으로 고쳐진다.
- `AdminOverviewPage.jsx`, `AdminGuidesPage.jsx`(101행), `AdminFeedbackPage.jsx`(97행), `JandiStatus.jsx`(39-41행): `useQuery`에서 `isError`, `error`, `refetch`를 받는다. 지금은 넷 다 안 받는다.
- 오류 = 카드 상단에 `<Banner status="error" title="..." description={error.message} endContent={<Button label="다시 시도" onClick={refetch} />} />`. **`variant`가 아니라 `status`가 맞는 prop이다.**
- 빈 상태 = Astryx `EmptyState`(카드 안에서는 `isCompact`). 지금은 5개 화면이 전부 수제다(`.af-empty`, `.ag-empty-cell`, `.ac-state`, `.aj-state`, `.ov-empty`). `src/components/NoResultFallback.jsx` 107행이 이미 EmptyState를 쓰고 있으니 그 사용법을 따른다.
- 필터가 걸린 빈 결과에는 `actions`로 "검색어 지우기", "전체 기간으로" 버튼을 준다. **단, description에 검색어 원문을 넣지 않는다**(상담 본문 검색어에 개인정보가 있을 수 있다). 방 이름과 기간까지만.
- overview 카카오 카드 3개는 `rtDist && rtDist.length > 0` 조건으로 통째로 사라진다. 카드를 숨기지 말고 EmptyState를 남긴다.
- 헤더 카운트 문구가 로딩·오류에서 "0개의 가이드가 관리 범위에 있습니다", "서버 0건"으로 0을 단언한다. `불러오는 중` / `확인 필요`로 바꾼다.
- consults·jandi의 빨간 한 줄 오류(`AdminConsultsPage.jsx` 481행, `AdminJandiPage.jsx` 412행)도 같은 Banner로 모아 표현을 하나로 만든다. Astryx EmptyState 문서가 "오류에는 EmptyState 대신 Banner를 쓸 것"이라고 명시한다.
- 피드백 화면 헤더에 "마지막 갱신 HH:MM"(`dataUpdatedAt`) + 새로고침 Button을 상담 화면과 같은 배치로 추가한다.

### 2-4. 필터를 SegmentedControl로 + 건수 표기 (RICE 4.5)

네 화면이 전부 `div[role="group"]` + Button 수제 조합이고, 선택 상태를 알리는 속성(`aria-pressed`/`aria-selected`/`aria-current`)이 하나도 없다. 화면 전체가 그 필터 결과인데 화면 낭독기는 어느 것이 켜졌는지 말하지 않는다.

- 교체 대상 4곳(동시에): `AdminGuidesPage.jsx` 276-286행 `.ag-seg`, `AdminFeedbackPage.jsx` 231-244행 `.af-seg`, `AdminConsultsPage.jsx` 384-394행 `.ac-chips`, `AdminJandiPage.jsx` 333행 `.aj-tabs`. `SegmentedControl` + `SegmentedControlItem`, `label`에 그룹 이름(채널 선택 / 상태 필터 / 피드백 유형).
- 화면 이동이 아니라 값 선택이므로 `TabList`가 아니라 `SegmentedControl`이 맞다(문서 기준).
- 툴바 세 컨트롤 높이가 20/28/32px로 제각각이다. 세 개가 같아지는 size를 **실측으로 골라** 맞춘다(`Selector`에 이미 `size="sm"`이 지정돼 있고 그게 20px이므로, size를 "명시"하는 것만으로는 안 맞는다).
- 건수 병기: 상태 탭 `전체 42 / 발행됨 30 / 임시저장 9 / 보관됨 3`. `AdminGuidesPage.jsx` 136-140행이 `stats`를 이미 계산해 놓고 `stats.all` 하나만 쓴다. **다만 그 `guides`는 이미 서버에서 status로 걸러진 결과**(`db.js` 523행)라 값이 틀린다. 행 데이터를 두 번 끌어오지 말고 `select('id', {count:'exact', head:true})`를 상태별로 받거나 group by 집계 RPC를 쓴다.
- 피드백 필터 4개도 같은 방식으로 건수를 붙인다. `merged` 배열을 탭 조건으로 한 번 집계하면 추가 조회가 없다.
- 확인 필요: `SegmentedControl`은 한 줄로 붙여 렌더해 `flex-wrap`으로 안 접힌다. 채널 5개 + `LIVE 기술지원` 라벨이 390px에서 어떻게 되는지(`layout="fill"` vs `"hug"`) 재렌더로 확인한다.

### 2-5. 상단 적층 축소 (RICE 2.4)

잔디는 통계 3층(실시간 현황 210px + 분석 요약 201px + 채널 KPI 111px + 툴바 72px)이 쌓여 대화 목록이 y=848부터 시작한다. 1440x900에서 첫 화면에 대화 0줄이다.

- **카카오 상담은 이미 2열로 개선됐다.** 잔디를 그 2열 구조에 맞춘다(반대 방향으로 복사하면 어긋난다).
- 채널 KPI 5장은 "전체 누적"이라 처리 우선순위와 무관하고, 같은 5개 채널명이 SLA 표·KPI 카드·선택 버튼으로 세 번 반복된다(상담은 여기에 위젯 배지까지 네 번). 카드를 없애고 정보를 채널 선택에 합치거나, 결과 패널 헤더의 "6개 채팅 · 28개 메시지" 옆에 선택 채널 기준 한 줄로 붙인다.
- 잔디 KPI 라벨(`재종통합행정 + 플랫폼서비스실`)이 1440px 이하에서 잘린다. `Text maxLines={1}`을 빼거나 2줄 허용한다(KPI 카드는 세로 여유가 있다).
- 잔디 KPI 카드가 클릭 안 되는데 바로 아래 탭이 같은 목록이다. 카드를 `SelectableCard`로 바꿔 선택 컨트롤로 삼고 탭 줄을 없애는 안이 중복도 제거하고 110px도 회수한다. 상담도 같은 구조라 함께 바꿔야 한다.

### 2-6. 감정 추세 차트 축·접근성 (RICE 2.4)

막대 30개에 날짜 눈금 0개, 수치는 브라우저 기본 `title`뿐이라 터치·키보드로는 값에 못 닿는다. 1440px에서 막대 한 개가 13px, 390px에서 6px다.

- 컨테이너에 `role="img"` + 요약 `aria-label`("최근 30일 감정 추세, 부정 비율 X%에서 Y%"). 같은 저장소 `AnalyticsHeader.jsx` 45행이 이미 이 방식이다.
- 차트 아래에 최근 7일 부정 비율 한 줄을 `Text`로 항상 보이게 둔다. 이것만으로 이 카드의 목적(부정 증가 감지)은 달성된다.
- 시작일·중간·종료일 3개 날짜 라벨을 `Text type="supporting"`으로. 30개 전부는 넣을 공간이 없다.
- `title` -> Astryx `Tooltip`으로 바꾸되 **막대 30개를 각각 감싸지 않는다**(포커스 정지점 30개는 오히려 손해).

### 2-7. 대시보드 정보구조 (RICE 2.3, 일부 보류)

지금 확정해서 할 수 있는 것:
- 카카오 카드 3장(응답시간·카테고리·감정) 헤더에 `Button variant="ghost"` "상담 로그에서 보기" -> `/admin/consults`. 대시보드 본문의 링크 5개가 전부 `/editor?id=`이고 상담 화면 링크는 0개다. 위험 없고 새 쿼리도 없다.
- 각 카드 부제에 대응 관계 한 줄: "90일 누적 분포입니다. 오늘 기준 급증은 카카오 상담 화면에서 확인". 기간 표기 자체는 이미 되어 있으니 새로 넣을 것은 링크와 이 한 줄뿐이다.
- KPI Grid(`AdminOverviewPage.jsx` 100행) `minWidth: 200` -> `160`. 768px에서 3+1로 접히는 것이 4열이 된다. **390px에서 2열이 되면 "4,630회" 같은 값이 줄바꿈되는지 재렌더로 확인**한 뒤 확정한다.

보류로 넘기는 것: 실시간 위젯을 대시보드 상단에 올릴지(3-2 참조).

### 2-8. 피드백 표 (RICE 1.7)

- 390px에서 표의 43%(264px)가 화면 밖이고 가로 스크롤 신호가 0이다(스크롤바 두께 0px). `src/hooks/use-mobile.js`의 `useIsMobile`(768px 기준)로 **columns 배열 자체를 줄인다.** 좁을 때 유형+내용 2열만 남기고 일시는 내용 셀 안 supporting 줄로, 가이드는 그 아래 줄로 합친다. sticky 열만 붙이면 여전히 610px를 밀어야 하므로 효과가 없다.
- 출처 열(100px)은 `localItems.length > 0`일 때만 columns에 넣는다. 값이 항상 '서버' 하나이고 헤더에 이미 "로컬 큐 0건 · 서버 4건"이 있다. 헤더 문구도 "이 브라우저에 임시 저장"으로 풀어 쓴다.
- 내용 열: 표시 단계에서 `[kind]` 접두를 제거하고(옆에 유형 배지가 있다) 제목/본문을 분리한다. **저장 포맷은 건드리지 않는다**(과거 데이터 호환). 행 끝에 "자세히" Button + Astryx `Dialog`로 전문·일시·가이드·세션을 보여준다.
- 가이드 열: `a.af-guide-link`가 16x16이고(WCAG 24px 미달) 밑줄이 없어 링크 단서가 색뿐인데, 그 색이 본문과 대비 1.4:1(다크)이다. Astryx `Link hasUnderline`으로 교체하고 클릭 영역을 셀 전체로 넓힌다. LinkProvider는 `AdminLayout.jsx` 168행에 이미 있다.
- 표시값을 id가 아니라 가이드 제목으로 바꾸려면 **이 화면에 가이드 조회를 새로 추가해야 한다**(현재 캐시 없음). 링크 목적지는 `/guides/:id`(사용자가 본 화면)를 기본으로 두고 "편집"을 행 끝 보조 액션으로 둔다.

### 2-9. 가이드 표 (RICE 1.5)

표의 열 폭 합이 1058px 고정인데 콘텐츠 폭은 1024px 창에서 688px, 768px 창에서 708px다. 상태 배지가 '임시저'로 잘린 채 오른쪽 끝에 걸려 있어 "스크롤하면 더 있다"가 아니라 "깨졌다"로 읽힌다.

- 액션 열(고정 168px, 아이콘 3개)을 Astryx `MoreMenu` 아이콘 1개로 접어 48px대로 줄인다. **넓은 폭에서는 펼치고 좁은 폭에서만 접는다**(발행·보관이 한 단계 깊어지므로).
- 메뉴로 접으면 아이콘 뜻을 몰라 눌러봐야 하는 문제(현재 `title` 속성 전부 null, 종이비행기/눈가림/되돌리기 구분 불가)도 함께 해소된다. 표에 남기는 버튼에는 `tooltip` prop을 준다.
- `proportional(n, { minWidth })`로 모듈·타입·상태 열 최소폭을 실제 내용 폭(80~90px)까지 낮춘다. `KakaoConsultStatus.jsx` 69-108행이 이미 이 방식을 쓴다.
- 900px 미만에서는 열 정의 배열을 짧은 버전으로 교체한다(모듈·타입·수정일을 제목 셀 아래 `Text type="supporting"` 한 줄로). Astryx Table에 열 자동 숨김 기능이 없으므로 이게 유일한 방법이다.

### 2-10. 공용 shell·카드 chrome 추출 (RICE 1.5, 시각이 아니라 유지보수 작업)

값 자체의 시각 차이는 4px 수준이라 스캔을 방해하지 않는다. **문제는 한 곳을 고쳐도 나머지 넷이 안 따라오는 구조**이고, 이번 감사에서 shell 폭 드리프트와 상담·잔디 6곳 어긋남이 그 증거다.

- `src/App.astryx.css`에 `.admin-shell`, `.admin-cardhead`, `.admin-cardbody`를 정의하고 다섯 화면이 같이 쓴다. `.ac-`/`.aj-`/`.ag-`/`.af-`/`.ov-shell` 규칙은 삭제.
- 카드 여백은 `var(--spacing-4)`(16px) / `var(--spacing-5)`(20px) 토큰으로. 현재 5개 파일 통틀어 `var(--spacing-*)` 사용이 단 1곳이고 나머지는 raw px(16px 24회, 12px 19회, 8px 18회, 24px 17회)다.
- 헤더 아래 구분선은 CSS border를 지우고 전부 `<Divider />`로.
- 상담·잔디 공유 부분(shell·KPI·툴바·패널·스레드 박스)을 같은 클래스로 합치고, **메시지 렌더링만 페이지별로 남긴다**(카카오 말풍선 틴트 / 잔디 답글 들여쓰기는 의도된 차이).

---

## 4. 보류: 김명준님 판단 또는 추가 근거 필요

| 항목 | 왜 보류인가 | 필요한 결정 |
|---|---|---|
| 대시보드에 실시간 상담 위젯 마운트 | 위젯을 두 화면에 동시에 두면 실시간 RPC 5종이 각 화면에서 60초마다 돈다. `kakao_sla_status`는 간헐적 500이 관측된 RPC다. 또 대시보드가 스스로 "AMS Wiki 전체 현황"이라고 범위를 선언하고 있다 | 대시보드를 위키 화면으로 둘지, 운영 첫 화면으로 바꿀지 |
| 피드백 처리 상태(`handled_at`) | 유일하게 DB 스키마 변경이 필요한 항목. 지금은 어제 반영한 피드백과 오늘 것이 구분되지 않는다 | 스키마 변경 승인. 진행 시 체크박스 열은 수제 금지, `useTableSelection` 플러그인 사용 |
| 좌측 메뉴 "새 가이드 작성" 제거 | `/editor`는 AdminLayout 밖이라 누르면 메뉴와 브레드크럼이 사라진다. 다만 제거하면 상담·잔디·피드백 3화면에서 진입점이 아예 없어진다 | 제거 vs `/admin/guides/new`로 옮기기 |
| 카드 여백 통일 방향 | 상담·잔디 16/20 vs 대시보드 20/24. 대시보드는 카드 폭이 넓어 24를 쓴 의도가 있었을 수 있다 | 두 안을 나란히 렌더해 보고 선택 |
| 잔디 스레드 원글 중복 | 헤더 제목과 첫 행이 같은 원글이다. 그런데 "8개 중 8개가 답글 없음"은 픽스처 산물이다(`fixtures.js`의 필드명이 `message`가 아니라 `text`, `reply_to_message_id` 없음). 실데이터는 코드 주석에 "댓글이 전체의 70%"라고 기록돼 있다 | 픽스처를 먼저 고치고 재측정. 고칠 때는 헤더 제목 유지 + `messages.slice(1)` 방향이 안전 |
| `Skip to content` 영어 문구 | AppShell이 자동 삽입하고 문구를 바꿀 prop을 문서에 노출하지 않는다 | Astryx 팀에 옵션 요청 |
| 기간 필터를 KPI·분석 요약까지 전파 | 전파하면 "전체 누적"의 의미가 사라져 채널 간 규모 비교 근거가 없어진다. 상담도 같은 구조라 동시 적용 필요 | 전파 vs 적용 범위 안내 문구만 추가 |

---

## 5. 하지 말아야 할 것 (감사 중 기각, 다시 제안되기 쉬움)

**측정이 반박한 것**

1. **작은 클릭영역 27건을 고치는 것.** 26건이 오탐이다. 아이콘 버튼 28x28은 WCAG 2.2 AA 최소 24px을 통과하고, "전체 모듈" 드롭다운도 안쪽 button만 20px일 뿐 실제 클릭 상자는 28px이다(가장자리 2px 지점 클릭으로 열림 확인). 진짜 미달은 피드백 표의 16x16 링크 하나뿐이다.
2. **상단 버튼 28px을 접근성 이유로 키우는 것.** 같은 이유로 위반이 아니다. 필요하면 다른 근거로 제안할 것.
3. **잔디 방 이름 1920px 잘림 대응.** 현재 빌드에서 안 잘린다(client 170 = scroll 170). 낡은 `audit.json`을 근거로 삼은 결과다. 잘림은 1440px 이하에서만 성립한다.
4. **"KPI 밴드가 상담 목록을 첫 화면 밖으로 민다"는 전제로 밴드만 제거하는 것.** 밴드는 135px뿐이고, 목록을 미는 것은 972px짜리 상단 분석 영역이다. 밴드 제거의 실제 가치는 중복 제거와 집계 범위 정합이다.
5. **피드백 출처 열 제거로 모바일 내용 열이 넓어진다는 기대.** 고정폭 합계가 이미 가용폭을 초과해, 출처를 빼도 내용 열은 최소폭 120px에 머문다. 줄어드는 것은 가로 스크롤 100px뿐이다.

**설계상 틀린 것**

6. **자체 EmptyState / 자체 Skeleton 컴포넌트를 새로 만드는 것.** Astryx에 둘 다 있다. 만드는 순간 제약 1 위반이고, 이 감사가 지적한 "다섯 화면이 각자 만든 것" 문제를 되풀이한다.
7. **표를 자체 `overflow-x: auto` div로 감싸는 것.** Astryx Table은 이미 자체 스크롤 래퍼와 음수 바깥여백을 갖고 있어, 한 겹 더 씌우면 세로 스크롤 컨테이너가 되어 헤더가 잘린다(CLAUDE.md 23-A, 세 번 재발한 자리).
8. **열 `minWidth`를 키워 헤더 잘림을 막는 것.** 글꼴·기기·라벨이 바뀔 때마다 다시 깨진다(23-B). 전역 줄바꿈 규칙이 이미 처리한다.
9. **가이드 액션을 IconButton으로 바꾸고 size를 md 이상으로 키우는 것.** 표 하한폭 1058px이 더 커져 2-9와 정반대 방향이다.
10. **`ProgressBar`를 `label` 없이 넣는 것.** `label`은 필수 prop이고, 왼쪽에 라벨이 이미 있으므로 `isLabelHidden`을 같이 줘야 중복이 안 생긴다.
11. **`Banner`에 `variant`를 넘기는 것.** 유효한 prop은 `status`(info/warning/error/success)다.
12. **`SegmentedControlItem`에 `disabledMessage`를 주는 것.** 그 prop은 그룹 전체(`SegmentedControl`) 전용이다.
13. **`Text`에 `size`나 `size="xs"`를 계속 쓰는 것.** `size`는 구현 없는 무효 prop이고 `xs`는 허용 값도 아니다. 의미형 `type`을 쓴다.

**범위·규칙 위반**

14. **카카오 상담을 탭 2개(실시간 운영 / 로그 검색)로 나누는 것.** 잔디와 shell·툴바·패널 구성이 갈려 제약 2를 깬다. 잔디에는 실시간 위젯이 없어 같은 분리를 적용할 수도 없다.
15. **한 화면만 SegmentedControl로 바꾸는 것.** 같은 수제 패턴이 4곳에 있다. 넷을 함께 바꾼다.
16. **잔디 분석 요약·채널 KPI를 기본 접힘으로 두는 것.** 이 플랫폼의 두 번째 목적(추세 파악)이 클릭 뒤로 숨는다. 접는다면 상태를 사용자별로 기억시킨다.
17. **채널 선택 칩 라벨에 건수를 붙이는 것.** `LIVE 기술지원 (1,024)`처럼 길어져 좁은 폭에서 툴바가 여러 줄로 접힌다.
18. **피드백의 '기타 문의'를 "가이드 요청" 탭에서 빼는 것.** `AdminFeedbackPage.jsx` 132행 주석이 "7종이 빠짐없이 한 탭에는 속하게 한다"고 밝힌 의도적 분류다. 빼면 그 유형이 어느 탭에도 안 잡힌다.
19. **빈 상태 설명에 검색어 원문을 그대로 노출하는 것.** 상담 본문 검색어에 개인정보가 있을 수 있다(제약 5).
20. **감정 차트를 색약 대응으로 색 교체하거나 사선 패턴을 넣는 것.** 스택 순서가 고정(부정이 항상 맨 위)이라 위치가 범주를 함께 인코딩하고 범례에도 텍스트 라벨이 있다. 우선순위 낮음.
21. **채널 배지의 연한 틴트 색을 의미색 문제로 취급하는 것.** Badge 문서가 정한 분류 태그의 올바른 용법이다. 고칠 곳은 가이드 상태 배지 하나다.
22. **삭제된 Figma 노드나 낡은 `audit.json`을 기준으로 "맞췄다"고 하는 것.** 대조 전에 기준이 살아 있는지부터 확인한다(CLAUDE.md 15장).
23. **검증 전에 완료라고 보고하는 것.** 각 작업은 `tools/design-audit/admin/render.cjs`로 라이트·다크 양쪽을 재렌더해 수치로 확인한 뒤에 끝났다고 한다.

---

## 6. 실행 순서 요약

1. 감사 도구 수정(1-1) -> 다크 스크린샷 재촬영 -> 다크 관련 지적 재확인
2. 1차 8건 일괄 처리 -> `npm run build` -> Vercel 프리뷰에서 5개 화면 라이트·다크 눈 확인
3. 2차는 RICE 순서대로. 단 2-2(다크 표면)와 2-3(3상태)은 서로 겹치는 파일이 많아 한 묶음으로 처리한다
4. 보류 7건은 결정이 나온 것부터 2차 뒤에 붙인다

**주요 파일**: `/home/user/sdij-wiki/src/pages/admin/AdminOverviewPage.jsx`, `AdminConsultsPage.jsx`, `AdminJandiPage.jsx`, `AdminGuidesPage.jsx`, `AdminFeedbackPage.jsx` (각 `.astryx.css` 동반), `/home/user/sdij-wiki/src/components/analytics/KakaoConsultStatus.jsx`, `JandiStatus.jsx`, `AnalyticsHeader.jsx`, `/home/user/sdij-wiki/src/lib/db.js`, `/home/user/sdij-wiki/src/App.astryx.css`, `/home/user/sdij-wiki/src/layouts/AdminLayout.jsx`, `/home/user/sdij-wiki/tools/design-audit/admin/entry.jsx`, `/home/user/sdij-wiki/tools/design-audit/admin/render.cjs`
---
name: astryx-frontend
description: 관리자 화면을 Astryx 디자인시스템으로 만든다. 버튼·드롭다운·입력칸·표를 넣거나 고칠 때, 색과 간격을 토큰으로 맞출 때, 표가 잘리거나 헤더가 말줄임될 때 사용한다. 네이티브 요소를 흉내내지 않고 디자인시스템 컴포넌트를 쓰는 규칙과 표 잘림 두 원인이 들어 있다.
---

# Astryx 디자인시스템 · 관리자 화면

CLAUDE.md 18장·23장에서 옮겨 왔다.

# 18. ★ Astryx 디자인시스템 = 프론트엔드 작업의 유일 기준 (사용자 지시, 앞으로 모든 작업)

> 사용자 지시(2026-07-08): "버튼·드롭다운·인풋필드 등 인터렉션 컴포넌트는 Astryx 디자인시스템으로. astryx의 가이드·파운데이션·라이브러리 모두 참조하여 완벽히 구현할 것. 앞으로 모든 작업에서도."

- **모든 UI는 `@astryxdesign/core` 컴포넌트로**: 버튼=`Button`, 드롭다운=`Selector`(단일)/`MultiSelector`(다중)/`DropdownMenu`(액션메뉴), 입력=`TextInput`, 그 외 `Card`·`Badge`·`Heading`·`Text`·`VStack`·`HStack`·`Grid`·`Divider` 등. **raw `<select>`·`<button>`·`<input>` 금지** — 네이티브 요소를 토큰으로 흉내내지 말고 디자인시스템 컴포넌트를 쓴다.
- **작업 전 공식 문서 조회(추측 금지)**: `node node_modules/@astryxdesign/core/docs.mjs <Component>`(props·best practices·anatomy), `--list`로 전체 목록. 토큰/테마 파운데이션은 `npx astryx docs tokens`·`npx astryx docs theme`, 페이지 템플릿은 `npx astryx template --list`. Selector 등은 `renderOption`으로 커스텀 행(SelectorOption을 children으로 직접 넘기지 말 것).
- **색·간격·라운드·쉐도우는 전부 Astryx 토큰(var)만**: raw hex/px 남발 금지. primitive로 표현 못하는 레이아웃만 co-located `*.astryx.css`에서 토큰(var)으로 처리. 전역 `<Theme>`(AdminLayout)에서 토큰/모드 상속 → 페이지에서 Theme 재래핑 금지.
- **동종 페이지는 동일 스펙**: 예) `/admin/consults`(카카오 상담)·`/admin/jandi`(잔디 대화)는 같은 shell·헤더·KPI·툴바(칩+Selector+검색)·패널 chrome을 공유한다. 메시지 렌더링만 데이터 성격에 따라 다름(카카오=2자 말풍선 in/out 틴트, 잔디=다자 스레드+답글) — 이건 의도된 차이라 억지로 통일하지 말 것.
- **검증**: 컴포넌트 교체 후 `npm run build` 통과 확인 + Vercel 프리뷰로 실제 렌더 확인. 빌드만으로 "완료" 단정 말고 프리뷰 대조까지.

---

# 23. ★ 관리자 표가 잘리는 두 가지 원인 (2026-08-12 실측) — 서로 다른 문제다

> 같은 자리에서 "표가 잘린다"가 반복됐는데, **원인이 두 개**였고 나는 하나만 고치고 완료라 했다가 세 번 되돌아왔다.
> 23-A(세로로 스크롤되며 헤더가 사라짐)와 23-B(헤더 글자가 말줄임)를 반드시 구분해서 볼 것.

## 23-A. 표 영역이 세로로 스크롤되며 위가 잘림 ← ★진짜 원인, 가장 오래 헤맨 것

- **증상**: 표 영역 안에서 세로 스크롤이 생겨 헤더 행과 첫 행이 위로 잘려 나감.
- **원인**: Astryx `Table` 은 **이미 자체 가로 스크롤 래퍼**를 갖고 있고, 그 래퍼는 카드 여백까지 번지려고 **음수 바깥여백**(`margin-block: -컨테이너패딩`, 실측 -20px)을 쓴다. 그 위에 `overflow-x:auto` 를 가진 div 를 한 겹 더 씌우면, 밖으로 나가라고 만든 그 여백이 "넘친 내용"이 되어 상자가 **세로 스크롤 컨테이너**로 바뀐다(CSS 규격: 한 축이 auto 면 나머지 축의 visible 도 auto 로 계산). 실측 1440px 상자 134px / 내용 154px.
- **해결**: 표를 감싸는 **자체 overflow 래퍼를 없앤다.** 가로 스크롤은 Astryx 래퍼가 이미 한다(390px 실측: 내용 336px / 표시 308px → 스스로 스크롤).
  `min-height:fit-content` · `min-height:max-content` · `height:fit-content` **셋 다 무효**였다(전부 측정 — 이걸로 두 번 헛수정했다).
- **접기(Collapsible) 안에 표를 넣을 때**: 위 음수 여백이 트리거를 8px 파고들어 겹친다 → `.<위젯>-collapsible .astryx-table-scroll-wrapper { margin-block: 0 !important }` 로 **세로 번짐만** 끈다(가로 번짐은 표가 카드 폭을 채워 구분선과 맞아야 하므로 유지).
- **교훈**: 디자인시스템 컴포넌트가 이미 해주는 일을 한 겹 더 감싸지 말 것. 감싸는 순간 그 컴포넌트의 의도된 음수 여백이 버그가 된다.

## 23-B. 헤더 글자가 말줄임(`중앙값 응…`)

- **증상**: 표 헤더가 조용히 `중앙값 응…` 으로 잘려 무슨 열인지 알 수 없음. 값(td)은 멀쩡.
- **원인**: Astryx `Table`의 헤더 칸(`th`)은 `white-space:nowrap + overflow:hidden + text-overflow:ellipsis` + `max-width:0`. 배정 폭보다 라벨이 **2px만 길어도** 잘린다(실측 390px: "중앙값 응답" 91px 필요 / 89px 배정).
- **해결(전역, `src/App.astryx.css`)**: `.astryx-table-header-cell { white-space:normal !important; text-overflow:clip !important; word-break:keep-all }` — 폭이 부족할 때만 두 줄로 흐르고, 충분하면 종전과 동일한 한 줄. 320~768px 6개 폭에서 잘림 0 확인.
- **열 minWidth를 키우는 방식은 쓰지 말 것**: 글꼴·기기·라벨이 바뀔 때마다 다시 깨진다(이 자리만 세 번째 재발이었다).
- **!important 는 여기선 불가피**: Astryx가 `:not(#\#)` 반복으로 명시도를 (3,1,0)까지 올려놔 일반 클래스 규칙은 절대 못 이긴다. (CLAUDE.md §18의 "토큰만 쓰라"와 충돌 아님 — 색·간격이 아니라 잘림 방지 레이아웃 규칙.)
- **검증법(재사용)**: `react-dom/server`로 실제 Astryx 컴포넌트를 SSR → 빌드된 CSS와 함께 정적 페이지로 띄움 → Playwright(`/opt/pw-browsers/chromium`)로 `th.scrollWidth > th.clientWidth` 측정. 눈대중 금지(§15-2).
  ⚠️ 이때 **링크할 CSS 청크를 반드시 확인**할 것. 컴포넌트 CSS는 `index-*.css`가 아니라 라우트 청크(예 `AdminConsultsPage-*.css`)에 들어간다 — 엉뚱한 파일을 링크하면 "수정이 안 먹는다"고 오진한다(이번에 한 번 겪음).



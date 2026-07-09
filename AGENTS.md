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

<!-- ASTRYX:START -->
Astryx v0.1.3 · 149 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing. Full page → AppShell; sidebar nav → SideNav.
- Frame first: pick the shell (AppShell / Layout+LayoutPanel) and budget regions in px BEFORE writing content (`astryx docs layout`).
- Dense data = rows (Table, List/Item) edge-to-edge — never Card-wrapped list items. Card = dashboard widgets, galleries, settings groups only.
- Status → StatusDot/Token; Badge only for counts and enumerated states, never decoration.
- Custom styling: component props first; else style/className with tokens — var(--color-*|--spacing-*|--radius-*). No raw hex/px. (No StyleX/Tailwind compiler here — don't use xstyle/utility classes.)
- Tokens for every value (`astryx docs tokens`). Brand/accent via `astryx theme` — never override --color-* in :root.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   149 components by category
  template --list    page + block recipes
  docs <topic>       color, elevation, icons, illustrations, layout, migration, motion, principles, shape, spacing, styling, theme, tokens, typography
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->

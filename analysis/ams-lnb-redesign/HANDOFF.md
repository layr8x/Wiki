# 세션 인수인계 — 2026-06-27 (sdij-wiki / layr8x)

> 다른 Claude Code 세션이 **이 문서만 읽고 이어갈 수 있게** 정리. 사용자=layr8x(개발지식 전무, 한국어 / CLAUDE.md 응답규칙 준수). Figma 작업 시 작성자 계정=김명준(hiconsy).
> 저장소가 `layr8x/Wiki`로 이동됨(옛 `sdij-wiki`). GitHub MCP 스코프=`layr8x/sdij-wiki`. 작업 브랜치=`claude/compassionate-wozniak-a9x5yr`.

---

## A. 이 세션에서 한 일 (2건)

### A-1. AI 위키 검색 — 완료·배포됨 (PR #223, main 머지됨)
키워드가 0건이어도 **AI가 위키 전체(가이드·Q&A·FAQ 181개)를 "의미"로 찾아 답 + 근거 문서 링크**를 주는 기능.

- **핵심 수정**: 별도 함수 `api/ai-search.js`가 Vercel Hobby **서버리스 함수 12개 한도**를 넘겨(13번째) 배포가 계속 ERROR(#220/#222) → `api/ai-search.js` **삭제하고 `api/search-summary.js`에 `mode:'ai-search'` 분기로 통합** → 12개 복귀, 배포 READY.
- 관련 파일:
  - `api/search-summary.js` — `handleAiSearch()` + `AI_CATALOG`/`AI_SYSTEM_PROMPT`, `import { GUIDE_INDEX } from './_lib/guide-index.js'`.
  - `api/_lib/guide-index.js` — AUTO-GEN(181개), 생성기 `scripts/build-guide-index.mjs`(`npm run build:guide-index`, prebuild로도 자동).
  - `src/hooks/useAiSearch.js`(디바운스 500ms, `/api/search-summary` `mode:'ai-search'`), `src/components/search/NoResultFallback.jsx`, `SearchOverlay.jsx`.
- **⚠ 남은 사용자 액션(미완)**: Vercel에 **`ANTHROPIC_API_KEY`** 미설정 → 지금은 503(배포 정상, 키만 대기). 키 넣으면 **AI검색 + 기존 휴면 AI요약** 둘 다 켜짐. (사용자: "이건 다음으로 미루자" → **보류 상태**.)
  - 검증: `curl -s -XPOST https://sdij-wiki.vercel.app/api/search-summary -H 'content-type: application/json' -d '{"mode":"ai-search","query":"환불"}'` → 현재 `503 api_key_missing`(정상).

### A-2. AMS LNB + 헤더 리디자인 — 1차 프로토타입 완료·라이브 (PR #224, main 머지됨) ★ 이게 메인, 이어서 할 일
사용자가 **다른 세션(김명준)의 결과물(딥네이비 #0D1424 + Indigo #6366F1)을 "영 마음에 안 든다"**고 함. 원인 = 그건 **Figma Make 커뮤니티 템플릿 감성**이지 **회사 디자인시스템(LUMEN)이 아님**. → LUMEN 토큰으로 새로 만듦.

- **라이브 확인 링크**: **https://sdij-wiki.vercel.app/ams-lnb** (HTTP 200 검증됨)
  - 헤더 우측 ☾ 버튼 = **라이트(Wiki) ↔ 다크(AMS) 전환** / 좌측 ≡ = 사이드바 접기(56px rail)
- **두 모드(사용자 확정)**: ☀️**라이트 = AMS Wiki용**(이 사이트) · 🌙**다크 = AMS용**(흰 헤더 + Carbon 그레이 사이드바 + blue/40 액센트 = 실제 AMS 흰헤더+다크사이드바 패턴).
- **산출물**:
  - `analysis/ams-lnb-redesign/_template.html` — 소스(아이콘 `__ICONS__` 플레이스홀더).
  - `analysis/ams-lnb-redesign/index.html` — 빌드본(아이콘 주입됨).
  - `public/ams-lnb.html` — index.html 복사본(Vercel 서빙용). `vercel.json`에 `/ams-lnb → /ams-lnb.html` rewrite.
  - `analysis/ams-lnb-redesign/render.cjs` — 렌더러(Playwright + 로컬 Pretendard 주입). `node analysis/ams-lnb-redesign/render.cjs` → `out/wiki-light.png`·`ams-dark.png`·`light-expanded.png`·`light-collapsed.png`.
  - 아이콘 맵 원본: `/tmp/.../scratchpad/ams_icons.json`(24개, gstatic Material Symbols Rounded wght300 SVG inline). **scratchpad는 휘발성** → 재빌드 필요 시 아래 "재현 절차" 참고.
- **빌드 재현**: `_template.html` 수정 후 → `python3`로 `ams_icons.json`을 `__ICONS__`에 치환해 `index.html` 생성 → `cp index.html ../../public/ams-lnb.html` → `node render.cjs`로 검증.

#### 디자인 = LUMEN(HICONSY Design System) 토큰 (Carbon 기반)
CSS `:root`에 토큰명 주석과 함께 박아둠. 라이트 기본 + `body.dark`가 `--sb-*`(사이드바 전용)만 다크로 오버라이드(헤더는 항상 라이트).

| 토큰 | 라이트 | 다크 | 근거 |
|---|---|---|---|
| interactive/primary | **#0043ce** (blue/70) | **#78a9ff** (blue/40) | 액센트바·활성텍스트 |
| interactive/hover·active | #002d9c · #001d6c | — | blue/80·90 |
| text/primary | #161616 (gray/100) | rgba(255,255,255,.92) | |
| 사이드바 면 | #fff (background/primary) | #262626 (gray/90) | |
| 활성 배경 | #e0e0e0 (gray/20 selected) | #393939 (gray/80) | |
| border/primary | rgba(0,0,0,.08) | rgba(255,255,255,.10) | transparent-black/white 8 |
| 콘텐츠 면 | #f4f4f4 (gray/10) | (동일) | |

- **활성 표시**: 좌측 inset 3px 블루바 + selected 배경 + 블루 텍스트/아이콘. **3depth**: 세로 연결선(border-left) + 들여쓰기.
- **아이콘**: Material Symbols **Rounded wght300** SVG 인라인(폰트서브셋 누락 회피). 섹션 매핑은 `_template.html`의 `MENU` 배열 참고(star/groups/how_to_reg/menu_book/cast_for_education/credit_card/redeem/forum/apartment/co_present/shield_person/monitoring).
- **타이포**: Pretendard(실브라우저=jsdelivr CDN link, 헤드리스=로컬 woff2 주입).

#### AMS 메뉴 구조 (프로토타입 `MENU`에 반영, 출처=김명준 인수인계 스크린샷)
즐겨찾기 / 고객(원생)관리(회원조회·상담관리·FAQ·공지사항·회원병합) / 모집·접수관리 / **강좌·교재관리(서브: 강좌관리·교재관리)** / 수업운영관리 / 청구·수납관리 / 장학혜택관리 / **메시지발송관리(서브: 메시지그룹관리)** / —구분선— / 학원관리 / 선생님(파트너)관리(하위없음) / Admin관리 / 매출·정산관리.

---

## B. 이어서 할 일 (우선순위)

사용자 지시 = **"세 가지 다 진행, 모든 요소는 기존 디자인시스템 사용"**. 현재 ①프로토타입까지 완료. 다음:

1. **사용자 피드백 반영** — 두 버전(라이트·다크) 보고 색·간격·활성표시·아이콘 손볼 점 받기. (아직 피드백 전.)
2. **② Figma 디자인시스템에 LNB 컴포넌트 등록** — 파일 `AWBOevxn4v0sjp6w22PPco`. **실제 토큰 bind 필수**(CLAUDE.md §0: raw hex 금지, `get_variable_defs`가 `{}` 아니어야 완료). 기존 `Sidebar` 컴포넌트셋이 `offplatform.admin.web_v2.0` 라이브러리에 있음(아래 함정 참고) — 가능하면 그 패턴에 정합.
3. **③ 실제 AMS 구조 대조** — `ams.sdij.com`(Okta 로그인 → 사용자 캡처 필요). 확정할 것: 메뉴 순서·'선생님(파트너)관리' 하위 유무·'즐겨찾기' 동작·6번째 메뉴.

---

## C. 환경·함정 (다음 세션 필수 숙지)

- **Figma MCP는 인증됨**(whoami=김명준/hiconsy, pro). **Figma REST PAT(`FIGMA_TOKEN` env)는 401 무효**(노출돼서 교체됨) → **REST 쓰지 말고 MCP만**.
- **LUMEN 파일 구조 함정**: `AWBOevxn4v0sjp6w22PPco`는 페이지가 `📋 COVER` 하나뿐(표지+잔여 아이콘). 토큰·컴포넌트는 **라이브러리로 published**(508 토큰/55 컴포넌트/2모드). `get_variable_defs(COVER)`=`{}`(표지가 raw색). **토큰 hex는 `search_design_system`으로 이름·매핑 확인 + Carbon값으로 해석**(이 문서 표가 해석 완료본). 기존 `Sidebar` 컴포넌트셋은 `offplatform.admin.web_v2.0` 라이브러리에 있으나 **MCP로 fileKey/nodeId 못 구해 미열람** → 등록 작업 시 그 파일 링크를 사용자에게 요청하면 정확.
- **Vercel**: team `team_gTwRSThNnEheXF3j30dvnIQ2`, project `prj_DrNZ7KPNXPxktPiB6F2JAfcLIUPu`. **브랜치 배포 OFF**(`vercel.json` `git.deploymentEnabled`: main만 true) → 라이브 링크 주려면 **main 머지 필수**(브랜치 프리뷰 안 나옴). `public/*.html`은 정적이라 SPA rewrite보다 우선 서빙됨(챗봇과 동일).
- **렌더 툴킷**: chromium=`/opt/pw-browsers`, Playwright 설치됨. 헤드리스는 CDN(jsdelivr Pretendard·gstatic Material Symbols) 차단 → `render.cjs`가 로컬 폰트(`tools/design-audit/fonts/pretendard.woff2`) 주입으로 우회. 아이콘 SVG는 빌드 시 gstatic에서 받아 인라인(프록시로 받아짐).
- **GitHub Actions 분 소진**(private repo) → CI 즉시 실패(runner_id:0). 로컬 build/lint 통과 + Vercel 독립 배포라 머지 진행해 옴. 7/1 리셋 또는 한도 상향 전까지 CI 빨강은 무시 가능.
- **카카오 수집**(별개 서비스): GitHub Actions→Supabase Edge Function(`kakao-collect`)로 이전 완료(#216), Actions=0. 쿠키 만료 시 사용자가 맥북에서 `npm run kakao:refresh-cookie`.

## D. 커밋/배포 현황
- main 최신: #224(AMS 리디자인) · #223(AI검색 통합) 머지됨. 둘 다 production READY.
- 브랜치 `claude/compassionate-wozniak-a9x5yr` push됨.
- 커밋·PR·코드에 모델식별자 절대 금지(채팅만). 커밋 푸터: `Co-Authored-By: Claude Opus 4.8` + `Claude-Session:`.

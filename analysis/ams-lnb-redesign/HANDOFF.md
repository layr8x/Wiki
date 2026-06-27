# 세션 인수인계 (전체) — 2026-06-27 / sdij-wiki(layr8x)

> 다른 Claude Code 세션이 **이 문서만 읽고 이어갈 수 있게** 정리. 사용자=layr8x(개발지식 전무, 한국어, CLAUDE.md 응답규칙 준수). Figma 작성자 계정=김명준(hiconsy).
> 저장소가 `layr8x/Wiki`로 이동됨(옛 `sdij-wiki`). GitHub MCP 스코프=`layr8x/sdij-wiki`. 작업 브랜치=`claude/compassionate-wozniak-a9x5yr`. Vercel: team `team_gTwRSThNnEheXF3j30dvnIQ2`, project `prj_DrNZ7KPNXPxktPiB6F2JAfcLIUPu`.
> 이 세션은 길어서 중간에 컨텍스트 압축됨 — 아래는 **세션 전체** 작업(워크스트림 6개).

---

## 워크스트림 1 — 챗봇 화면 정합 마무리 (배포 완료)
마이클래스 챗봇(`public/myclass-chatbot.html` 학생 / `-parent.html` 학부모) Figma 대조 잔여 수정.
- gap-audit 수정: `.cv.pend`(데이터 없는 행 흐림), `time_end` 브레드크럼 `종강일`→`종강일 확인`, `.ctxmenu` 타이포 16/14/16, **상담 모달 연락처 줄 = 아이콘엔 밑줄 빼고 글자에만**(`.cm-row span:not(.ms)`).
- 학부모본은 학생본 복사 + 고유 4곳 재패치(scratchpad `regen_parent.py` 방식). 검증=`tools/design-audit/render.cjs`.

## 워크스트림 2 — "왜 계속 화면을 못 맞추지" 근본원인 규명 (★ 큰 수확)
사용자: "모달만이 아니라 다른 화면 만들 때도 항상 문제." → 끝까지 파니 **두 원인**:
1. **내가 비교하던 Figma 노드가 삭제/이동돼 있었음**(파일 재구축 시 node id 바뀜). `screens.json`·CLAUDE.md 곳곳 참조가 stale → **없는 화면과 대조**하고 있었음.
   - 마스터보드 `1534:4236`·출결섹션 `1519:*` **삭제됨**. 현재 정본 = 페이지 **`1032:54`**. 출결·보강은 **`1629:*`로 재구축**(매핑은 CLAUDE.md §15-1).
2. **검증을 "완료 보고 후"에 "눈대중"으로** 함(Figma 공식 필수순서 위반).
- 조치: `tools/design-audit/screens.json`을 현재 노드로 갱신, **CLAUDE.md §15 신설**(노드 생존 확인 → `get_design_context`로 숫자 대조 → 스크린샷 → 검증 전 "완료" 금지). 전 화면 14개 재검증(13/14 MATCH, 실수정 3건).

## 워크스트림 3 — 효율화 도구 3종 (사용자: "범용적이면서 전문적", "모두 다")
### 3a. Figma 자동 대조 툴킷 `tools/design-audit/` (PR #210·#214·#215)
- `render.cjs <screen>` — 챗봇 화면을 Figma 기준폭 400px + 로컬폰트 주입으로 렌더(헤드리스 CDN차단 우회).
- `sweep.py` — 전 화면 자동 점검 한 줄 실행(#214). `fetch_figma.py` — Figma 캡처 REST 자동 다운로드(#215, **단 토큰은 env `FIGMA_TOKEN`에서만**).
- `compare.py`(나란히 비교), `screens.json`(화면키→노드ID 지도), `fonts/`(Pretendard·Material Symbols ms300.ttf 동봉).
### 3b. 데이터 리포트 생성기 `tools/report/` (PR #219)
- `template.html`(데이터 주입형 A4 1장) + `gen.cjs`(Playwright→PNG+PDF) + `example.json` + README. 범용(아무 데이터나 JSON으로).
### 3c. AI 위키 검색 (PR #220→#222→#223) — **워크스트림 별도 정리 아래**

## 워크스트림 4 — 6월 데이터 리포트 산출
3b 생성기로 6월 문의 리포트 제작: **436건, 전월(5월)比 -11%**. `out/june.json`→`june.png/pdf`.

## 워크스트림 5 — 카카오 상담수집: GitHub Actions → Supabase Edge Function (PR #216)
사용자: "이거 계속 실패한다"(스크린샷) → **GitHub Actions 분 소진**으로 즉시 실패(runner_id:0, 2~3초, 로그없음). 사용자 결정: "GitHub 말고 Supabase 안에서 직접 돌려서 Actions 시간 0."
- `supabase/functions/kakao-collect/index.ts`(+`deno.json`) — KakaoPartnerClient·sanitize·collect를 Deno로 포팅. 쿠키·토큰은 `kakao_partner_secrets` DB에서 읽음. `verify_jwt=false`+DB토큰 인증, 채널당 `MAX_CHANGED=80`.
- `supabase/migrations/20260625_kakao_collect_edge_function.sql` — pg_cron `kakao-collect-dispatch`를 edge function 호출로 재지정(5분). 적용됨.
- `.github/workflows/kakao-collect.yml` — `schedule` 제거, `workflow_dispatch`만(수동 폴백).
- **장애 복구**: 쿠키 만료(401) → 사용자가 맥북에서 `npm run kakao:refresh-cookie` → 수집 재개(6/18→6/25 점프, 629메시지 백필, recent_error=null 확인).

## 워크스트림 6 — AMS LNB + 헤더 리디자인 (PR #224, 라이브) ★ 이어서 할 메인
김명준 다른세션 결과물(딥네이비 #0D1424 + Indigo #6366F1)을 사용자가 "영 마음에 안 든다" → 원인=**Figma Make 커뮤니티 템플릿 감성, LUMEN 디자인시스템 아님**. → LUMEN 토큰으로 새로 만듦.
- **라이브**: **https://sdij-wiki.vercel.app/ams-lnb** (☾=라이트↔다크, ≡=접기). HTTP200 검증됨.
- **두 모드(확정)**: ☀️라이트=AMS Wiki용 · 🌙다크=AMS용(흰헤더+Carbon그레이 사이드바+blue/40).
- 파일: `analysis/ams-lnb-redesign/_template.html`(소스), `index.html`(빌드본), `render.cjs`(렌더), `out/*.png`; `public/ams-lnb.html`(서빙) + `vercel.json` rewrite `/ams-lnb`.
- 디자인=LUMEN 토큰(아래 표). 활성=좌측3px 블루바+selected배경+블루텍스트. 3depth=세로연결선. 아이콘=Material Symbols Rounded wght300 SVG 인라인.

### LUMEN(HICONSY Design System, Carbon 기반) 토큰 해석값
`AWBOevxn4v0sjp6w22PPco` / 라이트 기본 + `body.dark`가 `--sb-*`(사이드바)만 다크 오버라이드.

| 토큰 | 라이트 | 다크 |
|---|---|---|
| interactive/primary | #0043ce(blue/70) | #78a9ff(blue/40) |
| interactive/hover·active | #002d9c·#001d6c | — |
| text/primary | #161616(gray/100) | rgba(255,255,255,.92) |
| 사이드바 면 background/primary | #fff | #262626(gray/90) |
| 활성배경 selected | #e0e0e0(gray/20) | #393939(gray/80) |
| border/primary | rgba(0,0,0,.08) | rgba(255,255,255,.10) |
| 콘텐츠 면 | #f4f4f4(gray/10) | (동일) |

### AMS 메뉴 구조 (프로토타입 `MENU` 배열, 출처=김명준 스크린샷)
즐겨찾기 / 고객(원생)관리(회원조회·상담관리·FAQ·공지사항·회원병합) / 모집·접수관리 / **강좌·교재관리(서브:강좌관리·교재관리)** / 수업운영관리 / 청구·수납관리 / 장학혜택관리 / **메시지발송관리(서브:메시지그룹관리)** / —구분선— / 학원관리 / 선생님(파트너)관리(하위없음) / Admin관리 / 매출·정산관리.

---

## AI 위키 검색 상세 (워크스트림 3c, PR #223 머지됨)
키워드 0건이어도 AI가 위키 전체(가이드·Q&A·FAQ 181개)를 "의미"로 찾아 답+근거링크.
- **핵심**: 별도 `api/ai-search.js`가 Vercel **함수 12개 한도** 초과(13번째)→배포 ERROR(#220/#222) → **`api/search-summary.js`에 `mode:'ai-search'`로 통합**, `ai-search.js` 삭제 → 12개 복귀, READY.
- 파일: `api/search-summary.js`(`handleAiSearch`+`AI_SYSTEM_PROMPT`), `api/_lib/guide-index.js`(AUTO-GEN 181, 생성기 `scripts/build-guide-index.mjs`), `src/hooks/useAiSearch.js`, `src/components/search/NoResultFallback.jsx`·`SearchOverlay.jsx`.
- **⚠ 남은 사용자 액션(보류)**: Vercel `ANTHROPIC_API_KEY` 미설정→503. 넣으면 AI검색+기존 휴면 AI요약 둘 다 켜짐. (사용자 "다음으로 미루자".)

---

## 이어서 할 일 (우선순위)
1. **AMS 리디자인**: 두 버전 피드백 → ②Figma에 LNB 컴포넌트 등록(실제 토큰 bind, `get_variable_defs`≠`{}`) → ③실제 AMS(`ams.sdij.com`, Okta 캡처) 메뉴 순서·'선생님관리' 하위·'즐겨찾기' 동작 확정.
2. **AI검색**: 사용자가 `ANTHROPIC_API_KEY` 넣으면 작동 확인.
3. (옵션) #2 리포트 후속: 지점별/시간대별 추가 분석, 측정설계.

## 환경·함정 (필수 숙지)
- **Figma는 MCP만** 사용. **REST PAT(`FIGMA_TOKEN`)는 401 무효**(노출돼 교체됨). whoami=김명준/hiconsy/pro.
- **LUMEN 파일 함정**: `AWBOevxn4v0sjp6w22PPco`는 페이지가 `📋 COVER`뿐, 토큰은 라이브러리 published(508토큰/55컴포넌트/2모드). `get_variable_defs(COVER)`=`{}`. 토큰 hex는 `search_design_system` + Carbon값 해석(위 표가 해석완료). 기존 `Sidebar` 컴포넌트셋은 `offplatform.admin.web_v2.0` 라이브러리에 있으나 MCP로 fileKey 못구해 미열람 → 등록 시 사용자에게 그 파일 링크 요청.
- **Vercel 브랜치 배포 OFF**(`vercel.json` `git.deploymentEnabled` main만 true) → 라이브 링크 주려면 **main 머지 필수**. `public/*.html`은 SPA보다 우선 서빙.
- **렌더**: chromium=`/opt/pw-browsers`. 헤드리스 CDN차단 → `render.cjs`가 로컬 폰트(`tools/design-audit/fonts/`) 주입. 아이콘 SVG는 gstatic에서 빌드시 받아 인라인.
- **GitHub Actions 분 소진**(private) → CI 즉시 빨강(runner_id:0). 로컬 build/lint 통과+Vercel 독립배포라 머지 진행. 7/1 리셋 전까지 CI 빨강 무시 가능.
- 커밋/PR/코드에 **모델식별자 금지**(채팅만). 커밋 푸터 `Co-Authored-By: Claude Opus 4.8` + `Claude-Session:`.

## 보안 (계속 유효)
- Figma Client Secret/PAT, ANTHROPIC_API_KEY 등 **비밀은 저장소·환경변수 공개칸에 금지**(클라우드 환경변수 칸은 공개됨). DB 토큰은 gen_random_bytes.

## 커밋/배포 현황
- main 최신: #224(AMS) · #223(AI검색) · #219(리포트) · #216(카카오 Edge) · #215/#214/#210(design-audit) 등 머지·READY.
- 브랜치 `claude/compassionate-wozniak-a9x5yr` push됨.

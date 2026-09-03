---
name: repo-tooling
description: 이 저장소에 깔린 도구와 조종 체계. 글을 쓰거나 다듬을 때 어느 문서를 먼저 읽는지, 설치된 디자인 스킬 127개에서 무엇을 고르는지, 엉뚱한 스킬이 발동해 지우려 할 때, 훅과 스킬 중 어디에 규칙을 넣을지 정할 때 사용한다.
---

# 저장소 도구와 조종 체계

CLAUDE.md 19장·20장·21장에서 옮겨 왔다. 상시 적용되는 짧은 규칙만 CLAUDE.md에 남기고 나머지는 여기 있다.

# 19. ★ 글쓰기 정본 = 가이드 + 문체 지문 + 측정기 3종 세트 (휴머나이저 한계의 해답)

> 배경(2026-07-13): 휴머나이저 2종 + 정량 교정까지 거쳐도 "여전히 AI 같다"는 문제 반복. 원인 = 목표가 "일반 인간 평균"이었기 때문. 자연스러움은 특정 인물(김명준)의 목소리에서 나온다. 슬랙 실제 메시지에서 지문을 떠 저장소에 박아둠.

- **총괄 = `analysis/글쓰기_가이드_김명준.md`** (2026-07-13 완결판): 3층 원리(문체 카탈로그/정량 신호/목소리, 연구 근거 포함) + 글 종류별 공식(피라미드·국립국어원 쉬운 공공언어) + 워크플로우 2종(정순/역순 구술) + 도구 스택 전수조사(커넥터·플러그인엔 글쓰기 도구 없음 확정) + 발행 전 체크리스트 + 참고자료 전목록. **글쓰기 작업은 이 가이드 0장 순서대로.**
- **측정기 = `tools/writing/ko_ai_score.py`** (저장소 내장, 의존성 없음): `python3 tools/writing/ko_ai_score.py 글.txt --mj` (--mj = 명준 실측 기준). 10개 지표(쉼표 문장비율·문장 CV·상투어·번역투·문두 접속부사·줄표·첫째둘째·종결 쏠림·"것" 밀도·문단 균일성), 근거 태그([논문]=KatFishNet ACL 2025 / [실측] / [카탈로그] / [휴리스틱]) 표기. AI 표본 위험5 vs 명준 표본 위험0 분리 검증됨.

- **정본 = `analysis/문체지문_김명준.md` (v2 심층판, 슬랙 실측 116건)**. 보고서·공지·문서를 쓰거나 다듬을 때 휴머나이저보다 먼저 이 지문을 적용한다. 재수집 불필요(슬랙 재검색 금지, 본인 장문 문서를 새로 확보했을 때만 갱신).
- v2 구성: 레지스터 4종(공지/요청·질문/채팅/셀프메모) 구조 공식 + 정량 지문(쉼표 문장 16~18%로 인간 평균 26%보다도 낮음, 문장 길이 CV 0.75+, 합니다/해요체 반반 혼용, ".." 두점 말줄임) + AI→명준 변환표(8장) + 금지목록(문두 접속부사·줄표·첫째둘째·과장 수식 = 실측 0회, 7장).
- 핵심 3가지: ①구조 = "프레이밍 1문장 + 불릿 + 괄호 부연 + 요청 1줄"(긴 산문 문단 금지) ②밀도 불균형(모든 항목 같은 분량·같은 템플릿 = 최대 AI 신호. 중요한 건 길게, 사소한 건 한 줄) ③1인칭 판단 문장("고민이 있었는데 ~해서 ~로 정했습니다") 2~3개 이상 + 요청은 의문형("~주실 수 있을까요?")으로.
- 마지막 단계는 대체 불가: 완성 전 사용자 본인이 겪은 디테일 1~2개를 구술로 받아 주입할 것. 더 강력한 역순 워크플로우(본인 구술 → AI 받아쓰기)는 지문 문서 9장 참조.

---

# 20. ★ 디자인 스킬 127개 + Lazyweb MCP 설치 완료 (2026-07-29)

> 사용자 지시 "모두 설치". 카드뉴스로 공유받은 AI 디자인 도구를 전부 저장소에 설치함.
> 설치·복원 방법 = `docs/AGENT_SKILLS_SETUP.md`, 도구별 비교 = `analysis/AI디자인_도구_레퍼런스.md`.

- **스킬 위치**: 본체 `.agents/skills/` (커밋됨) → Claude Code용 링크 `.claude/skills/` (git 무시라 `scripts/install_pkgs.sh`가 세션 시작 시 자동 복원).
- **구성 127개**: `emilkowalski/skills` 8(모션·인터랙션) + `make-interfaces-feel-better` 1(완성도 원칙 16가지) + `MengTo/Skills` 118(웹디자인 79·Codex 워크플로 17·게임 17·기타 3).
- **자주 쓸 것**: 화면 완성도 점검=`make-interfaces-feel-better`, 모션 검토=`review-animations`·`improve-animations`, 모션 넣을 위치 발굴=`find-animation-opportunities`, 모션 용어=`animation-vocabulary`, 영상→프롬프트=`video-to-superprompt`.
- **⚠️ 스킬이 127개라 오발동 여지**: MengTo 묶음에 우리와 무관한 게 섞여 있음(게임 개발 17개·`write-like-meng-on-x`·`elevenlabs-tts` 등). 엉뚱한 게 발동하면 `rm -rf .agents/skills/<이름> .claude/skills/<이름>`.
- **⚠️ 스킬은 디자인 참고용, 우리 규칙이 우선**: 18장(Astryx 디자인시스템)·13장(챗봇 토큰)과 충돌하면 **우리 규칙을 따른다.** 스킬은 판단 근거를 보태는 용도지 토큰·컴포넌트 선택을 뒤집는 근거가 아니다.
- **데모 미디어 291개(78MB)는 커밋 제외**(`.gitignore`). `SKILL.md`·데모 HTML은 그대로라 기능 영향 없음. 이미지까지 필요하면 `npx skills@latest add MengTo/Skills` 재실행.
- **Lazyweb MCP**: 실제 앱·웹 화면 28.1만 개 검색. `.mcp.json` 등록 완료, 스킬 8종은 `.agents/skills/lazyweb*`. `LAZYWEB_TOKEN` 환경변수만 넣으면 동작(무료 발급, 저장소에 커밋 금지). 넣는 위치가 로컬·클라우드 다름 → 설치 문서 3-2. 자동 라우팅 규칙은 아래 21장.
- **UI Skills는 설치형 아님**: `npx ui-skills start`(작업에 맞는 스킬 자동 선택)·`npx ui-skills list --category <분류>`·`npx ui-skills get <스킬명>`로 그때그때 호출.
- **NameThatUI**(https://namethatui.com) = UI 요소 정식 명칭·API 심볼 사전, 참고용. **MotionSites는 도메인 응답 없어 확인 실패**(정확한 주소 확보 시 재확인).

<!-- LAZYWEB:ROUTER:BEGIN -->
## 20-1. Lazyweb 자동 사용 (2026-08-12 사용자 지시 "자동으로 켜줘")

**화면·UI를 새로 만들거나 크게 고칠 때는 시키지 않아도 먼저 Lazyweb으로 실제 사례를 찾고 시작한다.**
어떤 스킬을 고를지·검색을 잇는 법은 `lazyweb` 스킬에 있다(발동하면 로드됨).

**쓰지 않는 경우**: 백엔드·수집·인프라·SQL·CI, 글쓰기·보고서, 데이터 분석, 색·간격 미세 조정.
`lazyweb-growth-report`는 무거워서 **사용자가 직접 요청할 때만**(공급사도 자동 실행 금지).

**⚠️ 나가는 것은 검색어뿐.** 상담 내용·카카오/잔디 대화·개인정보·사내 문서 본문·AMS 내부 화면은
올리지 않는다. 이미지 비교 기능은 공개 화면이거나 사용자가 올리라고 한 경우만.

**⚠️ 충돌 시 우리 규칙 우선**(18장 Astryx·13장 챗봇 토큰). 사례는 근거를 보태는 용도다.

끄려면 `LAZYWEB:ROUTER:BEGIN`~`END` 사이를 지운다.
<!-- LAZYWEB:ROUTER:END -->

---

# 21. ★ 조종 체계 = CLAUDE.md는 목차, 절차는 스킬, 강제는 hook (2026-07-29)

> 근거: Claude Code 공식 가이드 "Steering Claude Code"(claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more).
> 핵심 원리 = **권위와 토큰 비용은 맞바꾸는 관계.** 항상 로드되는 것일수록 말발은 세지만 자리를 차지한다.
> 그래서 CLAUDE.md는 목차로 쓰고 내용은 밖으로 뺀다.

- **CLAUDE.md(항상 로드)** = 목차 + 사람·서비스 사실 + 짧은 규칙. 권장 200줄, 현재 285줄(계속 줄일 것).
  긴 작업 절차를 여기 새로 쓰지 말 것 — 스킬로.
- **스킬(필요할 때만 로드)** = 작업 절차. 우리 자체 스킬은 `.agents/skills/`에 두고 커밋한다
  (`.claude/skills/` 링크는 `scripts/install_pkgs.sh`가 세션 시작 시 복원).
  - `myclass-figma-ds` — 마이클래스 챗봇 Figma·디자인시스템 작업 규칙 (옛 CLAUDE.md Figma 장 115줄).
- **hook(자동 강제)** = "매번 X 하면 반드시 Y"는 글로 적지 말고 hook으로. 글은 모델의 선택이지 자동 실행이 아니다.
  - `SessionStart` → `scripts/install_pkgs.sh` (의존성 설치 + 스킬 링크 복원)
  - `PostToolUse`(Edit·Write) → `scripts/hooks/lint-changed.sh` (고친 js/jsx만 ESLint. 오류면 exit 2로 차단)
  - `Stop` → `scripts/hooks/verify-before-stop.sh` (코드가 바뀌었으면 lint·build 실행, 실패면 차단.
    **"검증 전 완료 보고 금지"를 글이 아니라 실행으로 강제한다.** `stop_hook_active`로 무한 반복 방지)
- **아직 안 쓰는 것**: `.claude/rules/`(paths 지정해 특정 폴더에서만 로드), `.claude/agents/`(서브에이전트).
  13장(챗봇 토큰 57줄)·15장(화면 정합 29줄)은 다음 정리 대상 — 스킬 또는 paths 지정 rule로.
- **모델·effort 선택**(claude.com/blog/claude-model-and-effort-level-in-claude-code): 대개 신경 쓸 필요 없다.
  틀렸을 때만 원인을 나눠 판단 — **파일을 안 읽거나 검증을 건너뛴 것이면 effort를 올리고, 충분히 보고도
  틀렸으면 모델을 올린다.** effort는 생각 시간이 아니라 읽는 파일 수·도구 사용·단계 수 전체를 조절한다.

---


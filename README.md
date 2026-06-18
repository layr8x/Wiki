# AMS Wiki — 학원 운영 통합 플랫폼

학원 운영 시스템(AMS)을 위한 **가이드 위키 · 운영 챗봇 · 카카오 문의/상담 수집·분석**을 한 곳에 모은 사내 플랫폼.
React 19 + shadcn/ui + Supabase 기반.

> 🔗 **라이브**: https://sdij-wiki.vercel.app

---

## 무엇을 하는 서비스인가

| 영역 | 설명 |
|------|------|
| 📚 **가이드 위키** | 학원 운영 매뉴얼·가이드를 직원이 검색·열람하는 지식 베이스 (6개 가이드 유형) |
| 💬 **운영 챗봇** | 자주 묻는 운영 FAQ를 7개 대메뉴로 안내 + 오류신고·처리현황·음성입력 |
| 📨 **카카오 문의 수집** | 학부모 카카오톡 문의를 자동 분류해 DB에 적재 (webhook) |
| 📊 **상담 수집·분석** | 카카오 비즈니스 채팅(학부모↔학원)을 실시간 수집 → 감정·응답시간·카테고리 분석 |
| 🔗 **외부 연동** | Confluence/Jira OAuth 2.0, 가이드 원본 동기화(Cron) |

---

## 핵심 기능

### 📚 가이드 시스템 (6유형)
- **SOP** 절차형 단계별 가이드 · **DECISION** 판단분기 테이블 · **REFERENCE** 용어 사전
- **TROUBLE** 트러블슈팅 · **RESPONSE** CS 대응 스크립트 · **POLICY** 정책 전/후 비교

### 💬 운영 챗봇
- 챗봇 대메뉴 **7개 분류**(OKTA · 강좌/영상/교재 · 입퇴반/대기 · 결제/환불 · 출결/배부 · 회원 · 오류신고)
- 분류별 **조회수 TOP FAQ** 노출 + 자유 검색(공식 Q&A · 매니저 FAQ 통합 매칭)
- 처리 현황 · 종료 요약 · **음성 입력** · 오류신고 폼 · 관련 가이드 딥링크
- 위키 FAQ 페이지(`/faq`)와 **동일한 데이터·분류**를 공유(단일 원본)

### 📨 카카오 연동 (문의·상담)
- **Webhook**: 학부모 문의 실시간 수신 → 자동 분류 → Supabase 적재
- **Partner Stream**: 비즈니스 채팅 실시간 수집 데몬 + 대시보드 스크립트
- 운영 분석: **감정 추세 · 응답시간 분포 · Claude 기반 카테고리 분류** 차트(Admin)

### 🔐 인증 (Supabase Auth)
- 구글 OAuth 원클릭 · 이메일/비밀번호 · 역할 기반 권한(OPERATOR/ADMIN/MANAGER/GUEST)

### 🔍 검색 & 네비게이션
- **⌘K 명령 팔레트** · 동의어 확장 검색 · 자동 목차(On This Page) · 최근/인기 가이드

### 🎨 UI/UX
- shadcn/ui 표준 컴포넌트 **28개** · 다크모드(`@theme` + `html.dark`) · Pretendard 폰트 · 반응형 · Toast

---

## 기술 스택

| 구분 | 사용 기술 |
|------|-----------|
| 프레임워크 | React 19 · Vite 8 |
| 스타일 | Tailwind CSS 4 (CSS-first `@theme`) · shadcn/ui |
| 라우팅/상태 | React Router 7 · TanStack Query 5 |
| 데이터 | Supabase (PostgreSQL · Auth · Realtime) |
| 서버리스 | Vercel Functions (`api/`) · Anthropic API(요약/분류) |
| 외부 연동 | Confluence REST v2 · Jira/Confluence OAuth 2.0 |
| 배포/CI | Vercel 자동 배포 · GitHub Actions (`ci` · `codeql` · `deploy`) |

---

## 빠른 시작

```bash
# 1) 의존성 설치
npm install

# 2) 환경 변수 (전체 목록·설명은 .env.example 참조)
cp .env.example .env

# 3) 개발 서버 (HMR)
npm run dev          # → http://localhost:5173
```

> Supabase 미설정 시 `src/data/mockData.js` 로컬 데이터로 자동 폴백되어 바로 실행됩니다.

### 사용 가능한 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 시작 (HMR) |
| `npm run build` | 프로덕션 빌드 |
| `npm run preview` | 빌드 미리보기 |
| `npm run lint` | ESLint 검사 |
| `npm run test` | Vitest 단위 테스트 |
| `npm run test:e2e` | Playwright E2E 테스트 |
| `npm run db:seed` | Supabase 시드 SQL 재생성 |

---

## 환경 변수

`.env.example`에 전체 목록과 설명이 있습니다. 주요 그룹만 요약하면:

- **필수** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **선택(Confluence)** — `VITE_CONFLUENCE_EMAIL`, `VITE_CONFLUENCE_TOKEN`, `VITE_CONFLUENCE_DOMAIN`, `VITE_CONFLUENCE_SPACE_KEY`
- **선택(Jira/Confluence OAuth)** — `ATLASSIAN_*` (서버리스 OAuth 콜백용)
- **선택(카카오/분석)** — Kakao·Supabase service role (수집 스크립트용, 서버 전용)
- **선택(AI/실시간)** — `ANTHROPIC_API_KEY`(요약·분류), `VITE_MANAGER_FAQ_URL`(FAQ 외부 실시간 소스)

> ⚠️ service role 등 **서버 전용 키는 `VITE_` 접두사를 붙이지 마세요**(클라이언트에 노출됨).

---

## 프로젝트 구조

> 🧭 루트의 **설정 파일**들은 빌드·배포 도구(Vite·Vercel·Supabase·GitHub)가 *정해진 위치*에서 읽어가므로 옮기지 않습니다. 아래는 "무엇이 무엇인지" 한눈에 보는 지도입니다.

### 📁 폴더 — 용도별
| 폴더 | 용도 |
|------|------|
| `src/` | **웹앱 본체**(React) — 위키·운영챗봇·관리자 화면 소스 |
| `api/` | **서버리스 함수**(Vercel) — Confluence/Jira 프록시·OAuth·동기화·검색요약 |
| `public/` | 정적 파일 + **마이클래스 챗봇 프로토타입**(`myclass-chatbot.html` → `/chatbot`) |
| `supabase/` | **데이터베이스 설계도**(migrations) — 위키·카카오 수집·RLS |
| `scripts/` | 카카오 상담 **수집·대시보드 스크립트** |
| `analysis/` | 분석·프로토타입 작업물(마이클래스 챗봇 디자인·문서) |
| `docs/` | 설계·운영·연동 **문서 모음** (아래 [문서](#문서) 색인) |
| `e2e/` | **E2E 테스트**(Playwright) |
| `.github/` | GitHub Actions(CI·배포) · 기여/보안 정책 문서 |
| `.claude/` · `.codex/` | AI 에이전트(Claude·Codex) 설정 |

### 📄 루트 설정 파일 — *옮기면 빌드/배포가 깨져 그대로 유지*
| 파일 | 용도 |
|------|------|
| `package.json` · `package-lock.json` | 의존성·실행 스크립트 |
| `vite.config.js` · `index.html` | 빌드 도구(Vite) 설정·진입점 |
| `vercel.json` · `.vercelignore` | 배포(Vercel) 설정 |
| `eslint.config.js` · `jsconfig.json` | 코드 검사·경로 별칭 |
| `components.json` | shadcn/ui 설정 |
| `playwright.config.js` | E2E 테스트 설정 |
| `.env.example` | 환경변수 **목록·설명**(실제 키는 `.env`, 커밋 금지) |
| `.gitignore` · `.nvmrc` · `.mcp.json` | Git 제외 · Node 버전 · MCP |
| `README.md` · `CLAUDE.md` · `AGENTS.md` | 소개 · AI 작업 규칙 |

### 📂 `src/` 내부
```
src/
├── components/   # chatbot · common · integrations · search · ui(shadcn 28개)
├── pages/        # 라우트 페이지 (Home·Guide·FAQ·Admin)
├── hooks/        # React Query 훅
├── data/         # 가이드·FAQ·분석 시드(폴백)
├── lib/          # supabase·db·confluence·utils
├── store/        # Auth·Search·I18n
└── locales/      # 다국어 (ko·en)

api/  서버리스 함수 (confluence·jira·oauth·sync·search-summary)
```

---

## 문서

### 설정 / 운영
- [DEPLOYMENT](./docs/DEPLOYMENT.md) — 배포 가이드
- [DEVELOPMENT](./docs/DEVELOPMENT.md) — 개발 환경
- [CRON_SYNC_SETUP](./docs/CRON_SYNC_SETUP.md) — 가이드 원본 자동 동기화
- [PIPELINE_SETUP](./docs/PIPELINE_SETUP.md) — 데이터 파이프라인

### 연동
- [JIRA_CONFLUENCE_INTEGRATION](./docs/JIRA_CONFLUENCE_INTEGRATION.md) — Jira/Confluence OAuth 2.0
- [KAKAO_WEBHOOK_SETUP](./docs/KAKAO_WEBHOOK_SETUP.md) — 카카오 문의 webhook
- [KAKAO_PARTNER_SETUP](./docs/KAKAO_PARTNER_SETUP.md) — 카카오 상담 수집
- [scripts/README-kakao-sync](./scripts/README-kakao-sync.md) — 수집 스크립트 사용법

### 설계 / 명세 / 분석
- [chatbot-design](./docs/chatbot-design.md) — 챗봇 설계
- [서비스 기능 정의서](./docs/AMS_Wiki_서비스기능정의서.md) — 서비스 기능 명세
- [상세 기능정의서 (SRS)](./docs/상세기능정의서.md) — 요구사항 명세
- [ams-wiki-roadmap](./docs/ams-wiki-roadmap.md) — 로드맵
- [manager-inquiries-analysis](./docs/manager-inquiries-analysis.md) — 실장 문의 분석

### 디자인 시스템
- [docs/shadcn-ui/](./docs/shadcn-ui/README.md) — shadcn/ui 철학·CLI·테마·v4 마이그레이션 (17개 주제)

### 기여 · 정책
- [CONTRIBUTING](./.github/CONTRIBUTING.md) — 기여 가이드
- [SECURITY](./.github/SECURITY.md) — 보안 정책(취약점 제보)

---

## 링크

- [라이브 데모](https://sdij-wiki.vercel.app)
- [Vercel 대시보드](https://vercel.com/layr8xs-projects/sdij-wiki)
- [shadcn/ui 문서](https://ui.shadcn.com) · [Supabase 문서](https://supabase.com/docs)

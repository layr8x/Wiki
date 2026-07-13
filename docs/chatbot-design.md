# AMS Wiki 챗봇 - 디자인 시스템 & 통합 가이드

> 본 문서: 2026-05-19 세션 산출물 통합본  
> 위치: `src/components/chatbot/`  
> 상태: P0 컴포넌트 구현 완료, Layout 마운트 대기

---

## 0. 결론 (TL;DR)

1. **챗봇은 4단계 로드맵으로 점진 출시** (컨플 위클리 2072379811 확정): ① FAQ 하드코딩 → ② 위키 RAG → ③ 게시판 자동등록 → ④ NL2SQL.
2. **메인 벤치마크 = Intercom Fin** (Resolution Rate 50%+, ROI 3-6개월). 박미혜의 "답 못하면 Slack" 요구가 Fin 표준 fallback 패턴과 정확히 일치.
3. **브랜드 #161616 + 포인트 #0043CE + Pretendard** (Onyx 정책). shadcn/ui 28개 컴포넌트와 100% 호환. 별도 토큰 추가 없이 인라인 컬러로 처리 (`src/components/chatbot/Chatbot.jsx`).
4. **회원병합 가이드 효과 -77%로 입증** (4/27 배포, 일평균 3.1→0.7건). 본 챗봇 정당성의 데이터 증거.
5. **5/26 위키 1차 노출에 챗봇 미포함 권장** (콘텐츠 25개 마감 5/25 위험). 챗봇 1차 베타 6월 1주.

---

## 1. 글로벌 권위 5종 - 적용 원칙

| 권위 | 핵심 원칙 | 본 챗봇 적용 |
|---|---|---|
| **NN/G** (425건 분석) | 능력 명시, outcome-oriented | `CapabilityBox` 컴포넌트 |
| **Google Conversation Design** | 인지부하 최소화, 응답 4행 이내 | Message 14sp Pretendard, 명확한 break |
| **Microsoft M365 Agents SDK** | Adaptive Cards + 최소 3 변형 | `GuideCard` + 후속 액션 Quick Replies |
| **Intercom Fin** | AI Agent 라벨, 자동 제목, 6종 CTA | Header AI Agent 라벨, 자동 의도 분석 |
| **W3C WCAG 2.2** | 키보드 내비, 대비 4.5:1+ | Cmd+/, ESC, ARIA, #0043CE on white = 8.59:1 (AAA) |

---

## 2. 컴포넌트 카탈로그

src/components/chatbot/ 폴더 구조:

```
chatbot/
├── Chatbot.jsx         # 메인 + 모든 sub-component (단일 파일 컴포지션)
├── useChatbot.js       # 상태 + 액션 훅
├── intents.js          # 의도 분석 + 응답 생성 규칙
└── index.js            # barrel export
```

### 2.1 P0 컴포넌트 (구현 완료)

| 컴포넌트 | 역할 | 신뢰도 근거 |
|---|---|---|
| `ChatbotFAB` | 우측 하단 진입 버튼 (#0043CE 56×56dp) | Channel.io · Intercom 표준 |
| `ChatbotWidget` | 메인 위젯 (400×640dp) | shadcn/ui 패턴 |
| `ChatbotHeader` | 브랜드 #161616 + point radial glow + AI Agent 라벨 | Intercom Fin Identity |
| `MessageBubble` | User #0043CE / Bot muted | 양분 시각 표준 |
| `QuickReply` | 최대 3개 hover #0043CE | NN/G overchoice 회피 |
| `GuideCard` | 좌측 3px #0043CE bar + 카테고리 + 신뢰도 | Carbon DS feature-card |
| `ContextBanner` | 현재 화면 인지 (point-soft 배경) | NN/G 컨텍스트 인식 |
| `CapabilityBox` | ✓/✗ 능력 명시 | NN/G 필수 |
| `TypingIndicator` | 3-dot pulse 1.5s | 만족도 22%↑ 효과 입증 |
| `EscalationCTA` | warning border + brand 버튼 | Intercom Fin fallback |
| `FeedbackRow` | 👍/👎 24×24dp | CSAT 측정 |
| `ChatbotInput` | autosize input + #0043CE send | shadcn/ui Input 패턴 |
| `ChatbotModeSelector` | 1~4차 데모 (devMode only) | 본 세션 시연용 |

### 2.2 P1 (Phase 2 RAG)
- `Citation` (다중 출처 인용)
- `RelatedDocs` (관련 가이드 추천)

### 2.3 P2 (Phase 3 게시판)
- `TicketPreview` → `DataCard kind="ticket-preview"`로 구현됨

### 2.4 P3 (Phase 4 NL2SQL)
- `SqlDataTable` → `DataCard kind="nl2sql"`로 구현됨
- `PermissionBanner` (권한 화이트리스트 명시)

---

## 3. 토큰

### 3.1 컬러 (사용자 지정)
```js
const CHATBOT_BRAND = '#161616'      // 위젯 헤더 / 보조 CTA / 코드 블록
const CHATBOT_POINT = '#0043CE'      // FAB / User 버블 / Send / 액센트
const CHATBOT_POINT_HOVER = '#0033A0'
const CHATBOT_POINT_SOFT = '#EDF1FB' // 컨텍스트 배너 배경
const CHATBOT_POINT_BORDER = '#B5CAF1'
```

### 3.2 shadcn neutral 토큰과 공존
- 본문 텍스트: `text-foreground` / `text-muted-foreground`
- 배경: `bg-background` / `bg-muted`
- 보더: `border-border`
- 다크모드 자동 호환 (oklch neutral)

### 3.3 타이포그래피 (Pretendard 전용)
- Message body: 13px / 1.55 / 400
- User bubble: 13px / 1.55 / 500
- Guide card title: 13px / 600 / -0.2px tracking
- Meta: 10-11px / 500
- 폰트 패밀리는 `--font-sans` (index.css에 Pretendard 정의됨)

### 3.4 모션
- 위젯 열기: `animate-in fade-in slide-in-from-bottom-2 duration-300`
- 메시지 등장: `animate-in fade-in slide-in-from-bottom-1 duration-300`
- Typing pulse: 1.5s infinite

---

## 4. 사용법

### 4.1 Layout.jsx에 마운트 (권장)

```jsx
// src/components/common/Layout.jsx
import { Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import GlobalHeaderActions from './GlobalHeaderActions'
import { Chatbot } from '@/components/chatbot'

// 라우트별 컨텍스트 매핑
function deriveContext(pathname) {
  if (pathname.startsWith('/guide/cust-merge')) return { key: 'cust-merge', label: '회원 병합' }
  if (pathname.startsWith('/guide/')) return { key: 'guide', label: '가이드' }
  if (pathname.startsWith('/faq')) return { key: 'faq', label: 'FAQ' }
  if (pathname.startsWith('/updates')) return { key: 'updates', label: '기능 업데이트' }
  return { key: 'home', label: '홈' }
}

export default function Layout() {
  const { pathname } = useLocation()
  const ctx = deriveContext(pathname)

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-40 ...">
          <SidebarTrigger className="-ml-1" />
          <GlobalHeaderActions />
        </header>
        <main className="flex-1"><Outlet /></main>
        {/* ↓ 챗봇 마운트 */}
        <Chatbot
          contextKey={ctx.key}
          contextLabel={ctx.label}
          userName="명준"
          devMode={import.meta.env.DEV}
          onOpenGuide={(slug) => window.location.href = `/guide/${slug}`}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
```

### 4.2 단독 페이지 (테스트)

```jsx
// src/pages/ChatbotDemoPage.jsx (신규)
import { Chatbot } from '@/components/chatbot'

export default function ChatbotDemoPage() {
  return (
    <div className="p-6">
      <h1>챗봇 데모</h1>
      <Chatbot contextKey="home" contextLabel="홈" devMode={true} />
    </div>
  )
}
```

### 4.3 단축키
- `Cmd + /` (또는 `Ctrl + /`): 챗봇 토글
- `Esc`: 닫기

---

## 5. 의도 분석 룰 (intents.js)

채널톡 1,116 chat 분석 → 9개 의도 + 키워드 매핑. **본 분석 데이터를 그대로 시드로 사용**.

| Intent | 키워드 | 가이드 | 컨피던스 |
|---|---|---|---|
| `cust-merge` | 병합·이관·통합회원·로컬회원 | `cust-merge-v2` | 0.92 |
| `class-withdraw` | 퇴반·입반·출결마감 | `class-withdraw` | 0.88 |
| `bill-refund` | 환불·중복결제·승인번호 | `bill-refund` | 0.85 |
| `video-error` | 영상·재생·9203·플레이어 | `player-trouble-9203` | 0.86 |
| `okta-auth` | OKTA·로그인·비밀번호 | `okta-trouble` | 0.78 |
| `app-install` | 앱 설치·가입하기·활성화 | `app-install` | 0.84 |
| `unpaid` | 미납·연체·납부기한 | `bill-unpaid` (NL2SQL) | 0.78 |
| `qr-attend` | QR·출결·브릿지관 | `qr-attendance` | 0.82 |
| `book-link` | 교재·교재 연결 | `book-link` | 0.80 |

**컨피던스 임계값**: 70% 미만 → 명확화 질문 (Disambiguation, Watson 표준)

**부정 시그널**: `안돼|왜|급해|아직|오류|먹통` 등 → 자동 에스컬레이션 옵션 강조 (시스템 오류 부정시그널 42.1% 통계 기반)

---

## 6. 4단계 단계별 동작

### 6.1 1차 FAQ (6월 1주 베타)
- 키워드 매칭 → 가이드 카드 + 신뢰도 표시 + 👍/👎
- **소요**: 1주 (콘텐츠 의존)
- **시드**: 카카오 매뉴얼 v1.0 (컨플 1845723524, 13KB)

### 6.2 2차 RAG (7-8월)
- Vector DB (pgvector) + Claude API
- 가이드 본문 청크 (500자 + 100 overlap)
- 응답에 인용 카드 자동 첨부
- **소요**: 2주 (개발) + 1주 (검증)
- **권장**: PoC는 Notion AI Q&A로 1주 검증

### 6.3 3차 게시판 자동등록 (9월)
- 자유 입력 → 의도 + 본문 분석 → AMS 게시판 자동 등록
- 박미혜의 "자유 입력" + 엄나윤의 "옵션 한정" 양측 충족
- Supabase board 테이블 인서트

### 6.4 4차 NL2SQL (Q4)
- 자연어 → Anthropic Tool Use API → 화이트리스트 함수 → AMS DB
- ⚠️ **권한 모델 미설계 시 致命 위험** - 데이터 거버넌스 워크숍 선행 필수
- Read-only 함수만 노출

---

## 7. 측정 지표 (HEART + Intercom Fin 표준)

| 지표 | 목표 (1단계) | 측정 |
|---|---|---|
| Resolution Rate | ≥ 40% | 세션 종료 이벤트 |
| First Response Time | ≤ 2초 (P95) | 클라이언트 타이밍 |
| Containment Rate | ≥ 50% | 종료 이벤트 |
| Task Success | ≥ 70% | 샘플링 + 👍/👎 |
| CSAT 👍 비율 | ≥ 80% | 메시지 후 피드백 |

→ Supabase 테이블 `chatbot_sessions` + `chatbot_feedback` 신규 필요

---

## 8. 시각 자료
- 라이브 시안: 본 세션 `AMS_Wiki_프로토타입_v1_20260519.html` (인터랙티브)
- 토큰 매핑: `AMS_챗봇_시안_v3_Brand_20260519.html`
- 방법론 보고서: `AMS_챗봇_UXUI_리서치_20260519.html`

---

## 9. 안티 패턴 회피 체크

- [x] 모호한 인사 ("무엇이든 물어보세요") → CapabilityBox로 능력 명시
- [x] Quick Reply 4개+ → 최대 3개 강제
- [x] 타이핑 인디케이터 없음 → 1.5s pulse 적용
- [x] 핸드오프 메뉴 숨김 → EscalationCTA 항상 노출
- [x] 자유/옵션 양자택일 → 하이브리드 (입력창 + Quick Reply 동시)
- [x] 응답 길이 무제한 → max-w-[85%] + line-height 1.55
- [x] 동일 답변 반복 → intents.js에 변형 응답 마련 (RAG 단계에서 LLM이 처리)
- [x] 챗봇 vs 사람 구분 부재 → "AI Agent" 라벨 헤더
- [ ] 권한 검증 없는 NL2SQL → **4차 진입 전 워크숍 필수**

---

## 10. 다음 액션 (D-7)

| Day | 액션 | 담당 |
|---|---|---|
| 5/19 (오늘) | 본 PR 제안 (chatbot/ 신규) | 명준 |
| 5/20 | Layout.jsx에 `<Chatbot />` 마운트 + 컨텍스트 매핑 | 명준 |
| 5/21 | ChatbotDemoPage.jsx로 e2e 시연 | 명준 + 박미혜 |
| 5/22 | 박미혜·이혜빈 리뷰 → devMode 해제 시점 결정 | 4인 회의 |
| 6월 1주 | Supabase 스키마 추가 (`chatbot_sessions`, `chatbot_feedback`) | 이혜빈 |
| 6월 2주 | 카카오 매뉴얼 v1.0 콘텐츠를 intents.js에 흡수 | 김수민 |
| 6월 4주 | 챗봇 1차 정식 출시 | 박미혜 공지 |

---

*참고: 본 문서는 2026-05-19 명준 세션 산출물. 회의록·컨플 v2 분석·UX/UI 리서치 보고서를 코드베이스 단일 출처로 통합.*

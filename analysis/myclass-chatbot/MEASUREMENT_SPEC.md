# 마이클래스 챗봇 — 측정 설계서 (Analytics Measurement Spec)

> ⚠️ 2026-07-02 갱신 — 정본은 v6 4메뉴. SSOT = `public/myclass-chatbot.html` + `기획서_v6_요약.md`. (옛 8메뉴 `prototype.html` 기록은 폐기)

> **목적**: "챗봇이 실제로 효과가 있는가"를 숫자로 알기 위한 측정 이벤트·지표 정의.
> **배경**: GA4 분석 결과 현재 앱에는 챗봇 효과 측정용 이벤트가 **계측되어 있지 않음**(자가해결·상담 연결 모두 0건). 본 문서는 그 공백을 메우는 설계안이다.
> **SSOT**: `public/myclass-chatbot.html`(NODES·헬퍼·배열 기준) · 연결: `DATA_ANALYSIS.md`(기존 GA4 근거)
> **상태**: 설계안(개발 연동 시 실제 GA4/gtag 스키마에 맞춰 확정 — [확인필요] 표기)

---

## 0. 한 줄 요약
챗봇의 **North Star = 자가해결율**(self-resolution rate). `자가해결율 = chatbot_close(resolved=true) / chatbot_open`(상담 연결 없이 해결로 끝난 세션). 이 값이 오르고 상담 연결이 줄면 챗봇이 일하는 것이다.

---

## 1. 핵심 지표 (KPI)

| 지표 | 정의 | 왜 보나 |
|---|---|---|
| **자가해결율** (North Star) | 상담 연결 없이 '해결됐어요'/완료로 끝난 세션 비율 | 챗봇의 본질 효과(디플렉션) |
| **상담 연결율** | 상담 연결(전화, 지점별)로 넘어간 비율 | 어디서·왜 사람에게 가는지 |
| **메뉴별 진입·완주** | 4개 메뉴(attend·pay·time·overall) 진입 수 · 해결 도달률 | 어떤 메뉴가 효과 있나/막히나 |
| **이탈 노드 Top** | 해결도 상담 연결도 없이 닫은 직전 노드 | 시나리오 구멍 발견 |
| **만족도** | 해결됐어요(😄) / 아직 안 됐어요(😭) 비율 | 체감 품질 |
| **컨텍스트 전환** | 지점·자녀 변경(`chatbot_ctx_change`) 빈도 | 학부모 다자녀·다지점 사용 패턴 |

---

## 2. 이벤트 스키마 (GA4 커스텀 이벤트)

> 명명: `chatbot_*` 스네이크케이스. 모든 파라미터는 **PII 비포함**(노드ID·카테고리·채널만). 사용자 식별은 앱의 기존 로그인 컨텍스트 사용([확인필요]).
> ✅ **SSOT 배선 완료** — 아래 이벤트는 `public/myclass-chatbot.html`(v6 4메뉴)의 `track()` 헬퍼로 `window.dataLayer`에 푸시됨(헤드리스 렌더로 발화 검증). 프로덕션 전환 시 `track()` 내부만 gtag로 교체하면 됨.

| event_name | 발생 시점(SSOT 함수) | 주요 파라미터 |
|---|---|---|
| `chatbot_open` | `openChat(ctx)` | `entry_context`: normal·payment·auth·recruitment |
| `chatbot_menu_select` | 메뉴 타일 클릭 (`menuGrid`) | `menu_key`: **attend·pay·time·overall** |
| `chatbot_node_view` | `go(node)` 진입 | `node_id`: 예) at_today·at_course·en_check·pay_wait·pay_history·time_table·time_rounds·time_end·m_overall |
| `chatbot_satisfaction` | 😄/😭 (`satis` 피드백) | `rating`: up·down |
| `chatbot_phone` | 상담 연결/전화 연결(`openConsultModal`·`phoneConnect`) | (지점별 전화 연결 = v6 유일 핸드오프) |
| `chatbot_copy` | 번호 복사 버튼(copybtn) | `copy_type`: 상담실 번호 |
| `chatbot_ctx_change` | 지점·자녀 변경 | (전환된 컨텍스트) |
| `chatbot_close` | `closeChat` | `resolved`(bool) · `nodes_visited`(int) |

> **자가해결 산출**: 별도 `chatbot_self_resolved` 이벤트 대신, 만족도 😄(`rating:up`) 시 세션 `resolved=true`로 표시되고 `chatbot_close`의 `resolved`로 집계된다. 자가해결율 = `close(resolved=true) / open`.
> (옛 8메뉴 이벤트 `chatbot_quickfaq_click`·`chatbot_self_action`·`chatbot_handoff`(카톡 채널)·`chatbot_handoff_open`·`chatbot_banner_click`, 앱 본체 `auth_sms_*`(특강 인증)는 v6 UI에 해당 요소가 없어 **폐기**. v6 홈에는 진입 배너·'자주 찾는 것' 칩이 없고, 핸드오프는 지점별 전화 하나다.)

---

## 3. 퍼널 & 대시보드

**핵심 퍼널**
```
chatbot_open → chatbot_menu_select → chatbot_node_view
  → (close(resolved=true)  |  chatbot_phone)
```

| 대시보드 카드 | 쿼리 개념 |
|---|---|
| 자가해결율 추이 | close(resolved=true) / open (일·주) |
| 상담 연결율 | chatbot_phone / open |
| 메뉴별 해결률 | menu_select(menu_key) 대비 그 흐름의 close(resolved=true) |
| 이탈 노드 Top10 | close(resolved=false) 직전 node_id 빈도 |
| 만족도 | satisfaction up / (up+down) |
| 컨텍스트 전환 | ctx_change 세션 비율(학부모 다자녀) |

---

## 4. 구현 메모 (프로토타입 → 프로덕션)

✅ **SSOT(`public/myclass-chatbot.html`)에 배선 완료.** 아래 **얇은 `track()` 헬퍼** 한 개로 위 이벤트를 `window.dataLayer`에 연결했고, 프로덕션 전환 시 `track()` 내부 전송만 gtag로 교체한다([확인필요]):

```js
function track(event, params){ try{ (window.dataLayer=window.dataLayer||[]).push({event, ...params}); }catch(_){} }
// 연결 지점(예):
// openChat(c)         → track('chatbot_open',{entry_context:c})
// menuGrid 타일         → track('chatbot_menu_select',{menu_key:m.k})   // attend·pay·time·overall
// go(k)               → track('chatbot_node_view',{node_id:k})
// satis 😄/😭          → track('chatbot_satisfaction',{rating})        // up 시 __resolved=true
// openConsultModal()  → track('chatbot_phone')                          // v6 유일 핸드오프(지점별 전화)
// closeChat()         → track('chatbot_close',{resolved:__resolved, nodes_visited:__nv})
```

- **단일 수정점**: `go()`·`openChat()`·`closeChat()`·`satis()`·`openConsultModal()`에만 1줄씩 → 전 노드 자동 커버.
- **세션 상태**: `nodes_visited`(`__nv`)·`resolved`(`__resolved`)는 세션 변수로 누적 후 `chatbot_close`에서 1회 전송.

---

## 5. 프라이버시 & 정직성
- 이벤트에 이름·전화·계좌 등 **PII 미포함**. node_id·카테고리·채널·불리언만.
- 측정은 효과 개선용이며, **부정확한 추정 지표는 만들지 않음**(예: 감정점수는 데이터 null → 미측정).
- 실제 이벤트명·파라미터·전송 방식은 앱 GA4 설정에 맞춰 **[확인필요]** 항목을 개발팀과 확정.

---

## 6. 성공 기준(예시 목표 — 합의 필요)
| 지표 | 1차 목표 |
|---|---|
| 자가해결율 | ≥ 40% (야간 ≥ 60%) |
| 상담 연결 중 '자가해결 시도 후' 비율 | ≥ 90% |
| 만족도(😄) | ≥ 80% |

---

## 7. 효과 증명 설계 — "전화가 정말 줄었나" (2026-06-18 추가)

> 최종 KPI는 **AMS 전화 상담 감소**(category별). 그러나 전화 감소는 **후행지표**라 한 달 뒤에야 보이고, 계절성·다른 변화와 섞여 **챗봇 효과로 귀속하기 어렵다.** 그래서 선행지표를 먼저 잡고, 대조군을 처음부터 설계한다. (근거: `DATA_ANALYSIS.md` §2~§4)

### 7.1 지표 사슬 (선행 → 후행)
| 단계 | 지표 | 데이터원 | 주기 |
|---|---|---|---|
| **선행1 — 사용** | 챗봇 진입·메뉴별 진입(특히 출결·보강·입반) | `chatbot_*` 이벤트 | 일 |
| **선행2 — 자가완결** | 결석·지각 **셀프 신고 수**, 보강/동보 셀프조회 수, 자가해결율 | 이벤트 | 일 |
| **후행 — 전화 감소** | AMS category별 상담 건수(출결·보강·입반·결제) | AMS 월간 export 재집계 | 월 |
| **귀속 보조** | 전화 1건당 챗봇 셀프완결 대체 추정(매칭) | AMS×이벤트 교차 | 월 |

→ 핵심: **출결·보강(전화 30.8%)** 의 셀프 신고·조회가 늘면(선행) → 다음 달 AMS 출결 category 전화가 줄어야(후행). 둘이 함께 움직이면 귀속 신뢰↑.

### 7.2 대조군 (효과 귀속 함정 회피)
챗봇만 단독 배포되는 깨끗한 실험이 어렵다면 아래 자연 대조군 중 택1:
| 설계 | 처치 | 대조 | 주의 |
|---|---|---|---|
| **A. 지점 분할** | 대치단과 먼저 배포 | 미배포 지점 동기간 | 지점 특성차 보정 필요 |
| **B. 전후 동월** | 배포 후 N월 | 전년 동월(계절성 상쇄) | 정원·정책 변화 체크 |
| **C. category 차분** | 챗봇이 다루는 category(출결·입반·결제) | 안 다루는 category(설명회·컴플레인) | 같은 채널 내 비교라 외생충격 상쇄 |

→ **권장 = C(category 차분)**: 같은 전화 채널 안에서 "챗봇이 흡수하는 유형"만 선택적으로 줄면, 계절성·전체 트래픽 변동을 자동 상쇄해 **귀속이 가장 깨끗**하다.

### 7.3 베이스라인 (2026-01~06, 이번 분석 = 측정 0점)
배포 전 기준선으로 고정: 월평균 총 **70,700건** · 출결·보강 **21,758/월** · 입반·대기 **18,857/월** · 결제 **5,972/월**. (6월 부분치 보정 전 — 배포 후 동일 기준으로 재집계해 비교)

### 7.4 함정 체크리스트
- [ ] 6월처럼 **부분 집계 월**을 전월과 직접 비교하지 말 것(일할 환산).
- [ ] **챗봇 배포 전엔 어떤 감소도 챗봇 효과 아님**(현재는 baseline일 뿐).
- [ ] 전화 감소가 **다른 원인**(앱 개선·정원 변동·문자 자동화)과 겹치지 않는지 같은 창에서 확인.
- [ ] 학부모 92% — 챗봇이 **학생만** 쓰면 전화(학부모)는 안 줄 수 있음 → 학부모 도달률을 선행지표에 포함.

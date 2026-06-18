# 마이클래스 챗봇 — 측정 설계서 (Analytics Measurement Spec)

> **목적**: "챗봇이 실제로 효과가 있는가"를 숫자로 알기 위한 측정 이벤트·지표 정의.
> **배경**: GA4 분석 결과 현재 앱에는 챗봇 효과 측정용 이벤트가 **계측되어 있지 않음**(자가해결·핸드오프·인증 성공/실패 모두 0건). 본 문서는 그 공백을 메우는 설계안이다.
> **SSOT**: `prototype.html`(NODES·헬퍼·배열 기준) · 연결: `DATA_ANALYSIS.md`(기존 GA4 근거)
> **상태**: 설계안(개발 연동 시 실제 GA4/gtag 스키마에 맞춰 확정 — [확인필요] 표기)

---

## 0. 한 줄 요약
챗봇의 **North Star = 자가해결율**(self-resolution rate). `자가해결율 = chatbot_self_resolved / chatbot_open`. 이 값이 오르고 핸드오프가 줄면 챗봇이 일하는 것이다.

---

## 1. 핵심 지표 (KPI)

| 지표 | 정의 | 왜 보나 |
|---|---|---|
| **자가해결율** (North Star) | 핸드오프 없이 '다 해결됐어요'/완료로 끝난 세션 비율 | 챗봇의 본질 효과(디플렉션) |
| **핸드오프율 (채널별)** | 전화 / 마이클래스 카톡 / LIVE 카톡으로 넘어간 비율 | 어디로, 왜 사람에게 가는지 |
| **메뉴별 진입·완주** | 8개 메뉴(account·pay·enroll·live·attend·time·quit·help) 진입 수 · 해결 도달률 | 어떤 메뉴가 효과 있나/막히나 |
| **이탈 노드 Top** | 해결도 핸드오프도 없이 닫은 직전 노드 | 시나리오 구멍 발견 |
| **만족도** | 도움됐어요 / 아쉬웠어요 비율 | 체감 품질 |
| **배너 전환율** | 진입 배너 클릭 / 노출 | 선제 안내 효과(결제·로그인·특강) |
| **특강 본인인증 성공/실패** | 인증 시도 대비 성공률 | GA4 6월 최대 마찰 정량화 |

---

## 2. 이벤트 스키마 (GA4 커스텀 이벤트)

> 명명: `chatbot_*` 스네이크케이스. 모든 파라미터는 **PII 비포함**(노드ID·카테고리·채널만). 사용자 식별은 앱의 기존 로그인 컨텍스트 사용([확인필요]).

| event_name | 발생 시점(프로토타입 함수) | 주요 파라미터 |
|---|---|---|
| `chatbot_open` | `openChat(ctx)` | `entry_context`: normal·payment·auth·recruitment |
| `chatbot_menu_select` | 메뉴 타일 클릭 (`menuGrid`) | `menu_key`: account·pay·enroll·live·attend·time·quit·help |
| `chatbot_node_view` | `go(node)` 진입 | `node_id`: 예) pay_status·pay_sms·pay_va·pay_cert·en_reg·en_waitset·en_check·en_wait·at_makeup·time_table |
| `chatbot_quickfaq_click` | 홈 '자주 찾는 것' 칩 | `faq`: refund·makeup·app |
| `chatbot_self_resolved` | '다 해결됐어요' 또는 핸드오프 없이 `endActions` 종료 | `last_node` |
| `chatbot_handoff` | `handoff` / `handoffTech` / `handoffLive` 호출 | `channel`: phone·myclass_kakao·live_kakao / `reason` |
| `chatbot_handoff_open` | '전화 연결' / '카카오톡 상담 열기' 실제 클릭 | `channel` |
| `chatbot_satisfaction` | 👍/👎 (`endActions` 피드백) | `rating`: up·down / `last_node` |
| `chatbot_banner_click` | 진입 배너 클릭 (`setBanner`) | `context`: payment·auth·recruitment |
| `chatbot_copy` | 번호 복사 버튼(copybtn) | `copy_type`: phone(상담실 전화)·sms(상담실 문자)·account(가상계좌) |
| `chatbot_close` | `closeChat` | `resolved`(bool) · `nodes_visited`(int) |

### 앱 본체(챗봇 밖) 추가 권고 — GA4 공백 해소
| event_name | 화면 | 파라미터 |
|---|---|---|
| `auth_sms_request` | `/recruitment-special` 인증번호 받기 | `screen` |
| `auth_sms_result` | 인증하기 결과 | `result`: success·fail / `fail_reason`[확인필요] |

→ 현재는 클릭 반복(인증번호 받기 1.47회·인증하기 1.44회)으로만 추정. 성공/실패 결과 이벤트가 있어야 특강 마찰을 **정량화**할 수 있다.

---

## 3. 퍼널 & 대시보드

**핵심 퍼널**
```
chatbot_open → chatbot_menu_select → chatbot_node_view
  → (chatbot_self_resolved  |  chatbot_handoff)
```

| 대시보드 카드 | 쿼리 개념 |
|---|---|
| 자가해결율 추이 | self_resolved / open (일·주) |
| 핸드오프 채널 분포 | handoff group by channel |
| 메뉴별 해결률 | menu_select 대비 그 흐름의 self_resolved |
| 이탈 노드 Top10 | close(resolved=false) 직전 node_id 빈도 |
| 배너 전환 | banner_click / open(entry_context≠normal) |
| 만족도 | satisfaction up / (up+down) |
| 특강 인증 성공률 | auth_sms_result success / auth_sms_request |

---

## 4. 구현 메모 (프로토타입 → 프로덕션)

현재 프로토타입은 데모라 미계측. 프로덕션 전환 시 **얇은 `track()` 헬퍼** 한 개로 위 이벤트를 연결한다(예시, 실제 전송은 gtag/dataLayer [확인필요]):

```js
function track(event, params){ try{ (window.dataLayer=window.dataLayer||[]).push({event, ...params}); }catch(_){} }
// 연결 지점(예):
// openChat(c)       → track('chatbot_open',{entry_context:c})
// menuGrid 타일       → track('chatbot_menu_select',{menu_key:m.k})
// go(k)             → track('chatbot_node_view',{node_id:k})
// handoff(reason)   → track('chatbot_handoff',{channel:'phone',reason})
// handoffTech       → track('chatbot_handoff',{channel:'myclass_kakao',reason})
// handoffLive       → track('chatbot_handoff',{channel:'live_kakao',reason})
```

- **단일 수정점**: `go()`·`handoff*()`·`openChat()`·`closeChat()`·`endActions()`에만 1줄씩 → 전 노드 자동 커버.
- **세션 상태**: `nodes_visited`·`resolved`는 세션 변수로 누적 후 `chatbot_close`에서 1회 전송.

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
| 핸드오프 중 '자가해결 시도 후' 비율 | ≥ 90% |
| 만족도(👍) | ≥ 80% |
| 특강 인증 성공률 | 측정 시작 후 베이스라인 확보 → +10%p |

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

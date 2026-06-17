# 마이클래스 챗봇 — 측정 설계서 (Analytics Measurement Spec)

> **목적**: "챗봇이 실제로 효과가 있는가"를 숫자로 알기 위한 측정 이벤트·지표 정의.
> **배경**: GA4 분석 결과 현재 앱에는 챗봇 효과 측정용 이벤트가 **계측되어 있지 않음**(자가해결·핸드오프·인증 성공/실패 모두 0건). 본 문서는 그 공백을 메우는 설계안이다.
> **연결 문서**: `FINAL_PROCESS.md`(SSOT) · `DATA_ANALYSIS.md`(기존 GA4 근거)
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
| **메뉴별 진입·완주** | 8개 메뉴 진입 수 · 해결 도달률 | 어떤 메뉴가 효과 있나/막히나 |
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
| `chatbot_menu_select` | 메뉴 타일 클릭 (`menuGrid`) | `menu_key`: account·pay·enroll·live·attend·time·help·quit |
| `chatbot_node_view` | `go(node)` 진입 | `node_id`: 예) pay_status, live_video |
| `chatbot_quickfaq_click` | 홈 '자주 찾는 것' 칩 | `faq`: refund·makeup·app |
| `chatbot_self_resolved` | '다 해결됐어요' 또는 핸드오프 없이 `endActions` 종료 | `last_node` |
| `chatbot_handoff` | `handoff` / `handoffTech` / `handoffLive` 호출 | `channel`: phone·myclass_kakao·live_kakao / `reason` |
| `chatbot_handoff_open` | '전화 연결' / '카카오톡 상담 열기' 실제 클릭 | `channel` |
| `chatbot_satisfaction` | 👍/👎 (`endActions` 피드백) | `rating`: up·down / `last_node` |
| `chatbot_banner_click` | 진입 배너 클릭 (`setBanner`) | `context`: payment·auth·recruitment |
| `chatbot_copy` | 번호 복사 버튼 | `copy_type`: phone·sms |
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

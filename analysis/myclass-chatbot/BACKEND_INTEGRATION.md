# 마이클래스 챗봇 — 백엔드 연동 명세 (API Integration Spec)

> **목적**: 현재 **목업(가짜 데이터)** 인 조회 카드를 실데이터로 바꾸기 위한 API 목록·연결 방식 정의.
> **상태**: 설계안. 엔드포인트·필드는 **제안값**이며 실제 마이클래스 백엔드 계약에 맞춰 확정([확인필요]).
> **연결 문서**: `FINAL_PROCESS.md`(SSOT) · `MEASUREMENT_SPEC.md`
> **무결성 원칙**: 실시간·민감 데이터(잔여석·대기순번·정산)는 캐시 금지, API 오류 시 **추정 표시 대신 상담원/채널로 라우팅**.

---

## 0. 전제
- 챗봇은 **이미 로그인된 앱 내부**에서 동작 → 본인확인 절차 불필요. 기존 세션/토큰(JWT 등) **재사용**([확인필요]).
- 모든 조회는 `GET /me/*`(본인 스코프). 쓰기는 `POST`.
- 응답 표준: `{ ok: boolean, data?: ..., error?: { code, message } }` ([확인필요]).
- 핸드오프(전화·카카오)는 외부 채널 → **API 아님**. 링크/전화만.

---

## 1. 조회(GET) — 목업 카드 → 실 API 매핑

| 챗봇 노드 | 카드 내용(현 목업) | 제안 엔드포인트 | 응답 필드(예) |
|---|---|---|---|
| `pay_status` | 납부 현황(월·항목·상태·금액·기한·합계미납) | `GET /me/payments/status` | `items[]{label,state,amount}`, `due_date`, `unpaid_total` |
| `pay_va` | 가상계좌(은행·계좌·입금금액) | `GET /me/payments/virtual-account` | `bank`, `account_no`, `amount` |
| `en_check` | 등록 현황(강좌·상태·다음결제) | `GET /me/enrollments` | `[]{course,state}`, `next_payment_date` |
| `en_wait` | 대기 접수 현황(강좌·순번·접수일) | `GET /me/waitlists` | `[]{course,position,applied_at}` ⚠실시간 |
| `m_live`(배송) | 교재 배송 현황(상태·택배사·송장) | `GET /me/textbook/shipping` | `status`, `courier`, `tracking_no` |
| `m_time`(시간표) | 이번 주 시간표(요일시간·강좌·강의실) | `GET /me/schedule?week=current` | `[]{slot,course,room}` |
| `m_time`(강의실) | 강의실 안내(강좌·호실) | `GET /me/classrooms` | `[]{course,room}` |
| `m_attend`(오늘출결) | 오늘 출결(강좌·체크인·상태) | `GET /me/attendance/today` | `course`, `checked_in_at`, `state` |
| `at_makeup` | 동영상 보강(주차·상태·기한) | `GET /me/makeup?course=&week=` | `state`, `watch_deadline`, `progress` |

⚠ **실시간 필수**: `en_wait`(대기순번)·잔여석은 캐시하지 말 것. 충원·마감이 분 단위로 바뀜.

---

## 2. 쓰기(POST) — 신청·요청

| 챗봇 액션 | 제안 엔드포인트 | 비고 |
|---|---|---|
| 입반 신청 문자 받기(`en_reg`) | `POST /me/enrollments/apply-link` | 신청 링크 SMS 발송 |
| 대기 접수(`en_waitset`) | `POST /me/waitlists` | 중복 접수 방지(서버에서 1건 보장) |
| 충원 알림 신청(`en_wait`) | `POST /me/waitlists/{id}/notify` | |
| 납입증명서 발급(`pay_cert`) | `POST /me/payments/certificate` | 비동기 → 문자 회신 |
| 결제 문자 재발송(`pay_sms`) | `POST /me/payments/sms-resend` | |
| 보강 신청(`at_makeup`) | `POST /me/makeup` | 수강료 차감 룰 서버 검증 |
| 보강 자료 문자(`at_makeup`) | `POST /me/makeup/material-sms` | |

> 실제 **결제 실행**은 외부 PG로 이동(현 `pay_fail`의 '결제창'처럼). 챗봇은 링크/문자까지만.

---

## 3. 프론트 연동 패턴 (스켈레톤은 준비 완료)

현재 `cardLoad(html)`는 **480ms 더미 지연 후 렌더**(스켈레톤 → blur cross-fade). 실 API 연동 시 더미 지연을 **fetch로 교체**만 하면 된다:

```js
async function cardApi(fetcher, render){
  const r = el(`<div class="row bot fadein"><div class="card"><div class="skelwrap">
    <div class="skel"></div><div class="skel"></div><div class="skel"></div></div></div></div>`);
  log.appendChild(r); scrollEnd();
  try{
    const data = await fetcher();                 // GET /me/...
    const c = r.querySelector('.card');
    c.classList.add('revealing'); c.innerHTML = render(data);
    requestAnimationFrame(()=>c.classList.remove('revealing'));
  }catch(e){
    r.remove();
    botSay('지금 정보를 불러오지 못했어요. 정확한 확인을 위해 바로 도와드릴게요.');
    handoff('조회 오류');                          // 무결성: 추정 표시 금지 → 사람에게
  }
  scrollEnd();
}
```

- 스켈레톤·blur·reduced-motion 처리는 이미 구현됨 → 로딩 UX 추가 작업 거의 없음.
- **에러 = 핸드오프**: API 실패 시 틀린/빈 카드를 보이지 않고 상담원/채널로 연결(ZERO 허위정보).

---

## 4. 인증·보안 ([확인필요])
- 세션 재사용: 앱 WebView/인앱브라우저의 기존 토큰 주입 방식 확인.
- 본인 스코프 강제: 서버가 토큰의 사용자 == 조회 대상 보장(IDOR 방지).
- 카카오 채널 딥링크(`pf.kakao.com/_VGAQn`, `_TkpPG`)는 외부 — 토큰 비포함.

---

## 5. 단계적 적용 권고
| 단계 | 범위 |
|---|---|
| 1차 | 읽기 전용 조회(납부·대기·배송·시간표·출결) — 위험 낮고 효용 큼 |
| 2차 | 쓰기(보강 신청·대기 접수·문자 재발송) — 서버 검증 룰 확정 후 |
| 3차 | 결제 링크·증명서 비동기 — PG·문자 시스템 연동 |

> 모든 `[확인필요]`는 실제 백엔드 계약(엔드포인트·필드·인증)에 맞춰 개발팀과 확정한다. 본 문서는 매핑·패턴·원칙의 기준선이다.

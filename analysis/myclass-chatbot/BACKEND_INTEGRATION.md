# 마이클래스 챗봇 — 백엔드 연동 명세 (API Integration Spec)

> **목적**: 현재 **목업(가짜 데이터)** 인 조회 카드를 실데이터로 바꾸기 위한 API 목록·연결 방식 정의.
> **상태**: 설계안. 엔드포인트·필드는 **제안값**이며 실제 마이클래스 백엔드 계약에 맞춰 확정([확인필요]).
> **SSOT**: `prototype.html` (NODES·헬퍼·배열 구조가 진실의 단일 출처) · 연결: `MEASUREMENT_SPEC.md`
> **무결성 원칙**: 실시간·민감 데이터(잔여석·대기순번·정산)는 캐시 금지, API 오류 시 **추정 표시 대신 상담/채널로 라우팅(핸드오프)**.

---

## 0. 전제 · 데이터 표시 규칙

- 챗봇은 **이미 로그인된 앱 내부**에서 동작 → **별도 본인확인(온보딩) 없음**. 기존 세션/토큰(JWT 등) **재사용**([확인필요]).
- 모든 조회는 `GET /me/*`(본인 스코프). 쓰기는 `POST`.
- 응답 표준: `{ ok: boolean, data?: ..., error?: { code, message } }` ([확인필요]).
- **핸드오프는 3채널** → 모두 외부, **API 아님**(링크/전화만):
  - **전화 상담실**(`handoff`) — 대치 캠퍼스 고3 상담실. 전화 `02-552-2373`·문자 `010-5423-2378`.
  - **마이클래스 카톡**(`handoffTech`) — 앱·로그인·영상·인증 등 기술 문제. `pf.kakao.com/_VGAQn`.
  - **LIVE 카톡**(`handoffLive`) — 라이브(별도 서비스) 입반·환불·반납·라→현. `pf.kakao.com/_TkpPG`.

### PII 노출 규칙(§0 — 프론트 표시 기준)

| 데이터 | 규칙 | 비고 |
|---|---|---|
| 사용자 휴대폰(발송 대상) | **마스킹** `010-****-1234` | 결제·자료·링크 문자 안내 시 |
| 택배 송장 | **마스킹** `****1234` | |
| **가상계좌 번호** | **의도적 전체 노출** + 복사 버튼 | 본인 입금용 → 마스킹하면 못 씀 |
| **상담실 전화·문자** | **의도적 전체 노출** | `02-552-2373` / `010-5423-2378` |

> API 응답에서 마스킹 대상은 **서버에서 마스킹**해 내려주거나, 프론트가 표시 직전 마스킹. 가상계좌·상담실 번호는 전체값을 그대로 표시한다.

---

## 1. 조회(GET) — 목업 카드 → 실 API 매핑

| 챗봇 노드 | 카드 내용(현 목업) | 제안 엔드포인트 | 응답 필드(예) |
|---|---|---|---|
| `pay_status` | 납부 현황 — **항목 배열**(미납 여러 건 + 완납 혼재, 항목별 유형·강좌·금액·기한) | `GET /me/payments/status` | `items[]{type,course,amount,paid,due_date}`, `unpaid_total`, `unpaid_count` |
| `pay_sms` | 미납 항목 목록(건별 재발송용) | `GET /me/payments/status`(재사용) | `items[].paid==false` 만 사용 |
| `pay_va` | 가상계좌(은행·**계좌번호 전체**·예금주·금액·기한) | `GET /me/payments/virtual-account` | `bank`, `account_no`(전체), `holder`, `amount`, `due_date` |
| `en_reg` / `regPick(area)` | 영역→강좌. 영역별 **신청 가능 강좌 목록**(시간·강의실·잔여석) | `GET /me/courses?area=&status=open` | `[]{course,schedule,room,seats_left}` ⚠실시간 |
| `en_waitset` / `waitPick(area)` | 영역→강좌. 영역별 **마감 강좌 목록**(대기 인원) | `GET /me/courses?area=&status=closed` | `[]{course,schedule,room,wait_count}` ⚠실시간 |
| `en_check` | 내 등록 현황 — 강좌별 상태 + **강좌마다 다른 결제일** | `GET /me/enrollments` | `[]{course,area,state,pay_note}`(종강예정/결제기한/매월정기 등 강좌별) |
| `en_wait` | 대기 접수 현황(강좌·순번·충원여부) | `GET /me/waitlists` | `[]{course,position,filled}` ⚠실시간 |
| `m_live`(배송) | 교재 배송 현황(상태·택배사·송장 마스킹) | `GET /me/textbook/shipping` | `status`, `courier`, `tracking_no`(마스킹) |
| `time_table` | 주간 시간표(요일·시각·과목·강좌·강의실, 이번/다음 주) | `GET /me/schedule?week=current|next` | `[]{day,time,end,sub,course,room,makeup?}` |
| `m_time`(강의실) | 강의실 안내(강좌·호실) | `GET /me/classrooms` | `[]{course,room}` |
| `m_attend`(오늘출결) | 오늘 출결(강좌·체크인·상태) | `GET /me/attendance/today` | `course`, `checked_in_at`, `state` |
| `at_week` | 주간 출결(최근 6주 히트맵·출석률) | `GET /me/attendance/weekly` | `[]{course,weeks[]}`, `rate` |
| `at_makeup` / `makeupWeeks(course)` | 동영상 보강 — **강좌→주차**. 수강 강좌별 주차 목록(상태·기한·진도율) | `GET /me/makeup/courses` → `GET /me/makeup?course=&week=` | 강좌목록 / `state`,`watch_deadline`,`progress` |

⚠ **실시간 필수**: `en_wait`(대기순번)·`regPick`/`waitPick`의 잔여석·대기인원은 캐시하지 말 것. 충원·마감이 분 단위로 바뀜.

---

## 2. 쓰기(POST) — 신청·요청

| 챗봇 액션 | 제안 엔드포인트 | 비고 |
|---|---|---|
| 입반 신청 링크 문자(`regPick`) | `POST /me/enrollments/apply-link` | 신청 링크 SMS 발송(마스킹 번호로 안내) |
| 대기 접수(`waitPick`) | `POST /me/waitlists` | 중복 접수 방지(서버에서 1건 보장, "여러 번 신청해도 순번 안 빨라짐") |
| 충원 알림 신청(`en_wait`) | `POST /me/waitlists/{id}/notify` | |
| **결제 문자 재발송 — 건별**(`pay_sms`) | `POST /me/payments/sms-resend` `{ item: <id> }` | 특정 미납 1건 링크 |
| **결제 문자 재발송 — 전체**(`pay_sms`) | `POST /me/payments/sms-resend` `{ all: true }` | 미납 전체 링크 일괄 |
| 보강 신청(`makeupWeek`) | `POST /me/makeup` | 수강료 차감 룰 서버 검증(일부 제외) |
| 보강 자료(동보) 문자(`makeupWeek`) | `POST /me/makeup/material-sms` | 출결 2위 항목(동보자료수령 31,690) |
| **결석·지각 셀프 신고**(`at_absent`) ⭐ | `POST /me/attendance/report` `{ course_id, kind: absent\|late, date }` | **전화 최대 자가해결(≈5.8만)**. 담당 강사·출결시스템 통지. 신고 후 보강(`/me/makeup`) 연계 |
| 현금영수증 발급(`pay_etc`) | `POST /me/payments/cash-receipt` | |

> 실제 **결제 실행**은 외부 PG로 이동(현 `pay_fail`·`pay_status`의 '납부하기 화면'처럼). 챗봇은 링크/문자까지만.

### 2.1 납입증명서 — 자가발급 API 아님(상담 연결) [확인필요]

- **`pay_cert` / `cert_period` / `cert_item` / `certIssue()` 는 챗봇이 직접 발급하지 않는다.**
- 현재 설계: **상담 선생님이 결제내역에서 엑셀 파일(.xlsx)로 발급** → 등록된 문자·이메일로 송부.
- 챗봇 역할 = 발급 **범위 접수**(연도/기간/항목)만 받아 **전화 상담실 핸드오프**(`handoff('납입증명서 발급 · ...')`)로 연결.
- 자가발급 API(`POST /me/payments/certificate` 비동기 발급) 가능 여부는 백엔드 확인 후 결정([확인필요]). 확인 전까지 **단정 금지**, 상담 연결 유지.

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
- **에러 = 핸드오프**: API 실패 시 틀린/빈 카드를 보이지 않고 적절한 채널(전화·마이클래스 카톡·LIVE 카톡)로 연결(ZERO 허위정보).
- **단일 출처 배열 유지**: 프로토타입의 `PAYITEMS`처럼 `pay_status`·`pay_sms`·`pay_va`가 같은 납부 데이터를 공유한다. 실 API도 납부 항목 응답 하나를 세 노드가 재사용해 **항상 일치**시킨다.

---

## 4. 인증·보안 ([확인필요])
- 세션 재사용: 앱 WebView/인앱브라우저의 기존 토큰 주입 방식 확인(온보딩 없음 전제).
- 본인 스코프 강제: 서버가 토큰의 사용자 == 조회 대상 보장(IDOR 방지).
- 카카오 채널 딥링크(`pf.kakao.com/_VGAQn` 마이클래스, `_TkpPG` LIVE)는 외부 — 토큰 비포함.

---

## 5. 단계적 적용 권고
| 단계 | 범위 |
|---|---|
| 1차 | 읽기 전용 조회(납부 배열·등록·대기·배송·시간표·출결·보강) — 위험 낮고 효용 큼 |
| 2차 | 쓰기(보강 신청·대기 접수·결제 문자 건별/전체 재발송) — 서버 검증 룰 확정 후 |
| 3차 | 결제 링크·잔여석/대기인원 실시간 — PG·문자 시스템 연동 |
| — | 납입증명서 자가발급은 [확인필요] 해소 전까지 상담 핸드오프 유지 |

> 모든 `[확인필요]`는 실제 백엔드 계약(엔드포인트·필드·인증·납입증명서 발급 주체)에 맞춰 개발팀과 확정한다. 본 문서는 매핑·패턴·원칙의 기준선이며 SSOT는 `prototype.html`이다.

# 마이클래스 챗봇 - 백엔드 연동 명세 (API Integration Spec)

> ⚠️ 2026-07-02 갱신 - 정본은 v6 4메뉴. SSOT = `public/myclass-chatbot.html` + `기획서_v6_요약.md`. (옛 8메뉴 `prototype.html` 기록은 폐기)

> **목적**: 현재 **목업(가짜 데이터)** 인 조회 카드를 실데이터로 바꾸기 위한 API 목록·연결 방식 정의.
> **상태**: 설계안. 엔드포인트·필드는 **제안값**이며 실제 마이클래스 백엔드 계약에 맞춰 확정([확인필요]).
> **SSOT**: `public/myclass-chatbot.html`(NODES·헬퍼·배열 구조가 진실의 단일 출처) · 연결: `MEASUREMENT_SPEC.md` · 콘텐츠 정본: `기획서_v6_요약.md`
> **무결성 원칙**: 실시간·민감 데이터(잔여석·정산)는 캐시 금지, API 오류 시 **추정 표시 대신 상담 연결로 라우팅(핸드오프)**.

---

## 0. 전제 · 데이터 표시 규칙

- 챗봇은 **이미 로그인된 앱 내부**에서 동작 → **별도 본인확인(온보딩) 없음**. 기존 세션/토큰(JWT 등) **재사용**([확인필요]).
- 모든 조회는 `GET /me/*`(본인/자녀 스코프). 쓰기는 `POST`.
- 응답 표준: `{ ok: boolean, data?: ..., error?: { code, message } }` ([확인필요]).
- **핸드오프 = 상담 연결(전화) 하나**(v6, SERP-8270): 종료화면 하단 `[상담 연결]` → **지점별 연락처 모달**(`openConsultModal`) → `tel:` 통화. **API 아님**(전화만).
  - 대치 캠퍼스 연락처 예: 고3 `02-552-2373` · 수학스쿨 `02-552-2378` · 고2·고1 `02-554-2373` · 특목센터 `02-565-2373`(SSOT `CAMPUSES`).
  - 목동·반포·분당은 번호 미설정(연동 예정) → 대표번호 폴백 안내.
  - (옛 8메뉴의 "3채널 라우팅: 전화 상담실 · 마이클래스 카톡 · LIVE 카톡"은 v3 설계 기록으로 **폐기** - v6는 지점별 전화 상담 연결로 단순화. `[상담 등록]` 버튼도 제거.)

### PII 노출 규칙(0장 - 프론트 표시 기준)

| 데이터 | 규칙 | 비고 |
|---|---|---|
| 사용자 휴대폰(발송 대상, 표시 시) | **마스킹** `010-****-1234` | |
| **지점 상담실 전화·문자** | **의도적 전체 노출** + tel:/복사 | 통화용 → 마스킹하면 못 씀 |
| 학생/자녀 이름(본인 화면) | 본인 컨텍스트라 실명 표시 허용 | 김시대 |

> API 응답에서 마스킹 대상은 **서버에서 마스킹**해 내려주거나, 프론트가 표시 직전 마스킹. 상담실 번호는 전체값을 그대로 표시한다.

### 0.1 맥락(지점/학생) 바인딩 - 모든 조회는 선택된 지점·학생의 AMS 데이터 기준 ⭐

> 챗봇의 모든 조회 데이터는 **현재 선택된 지점·학생의 실제 AMS 회원 데이터**로 채운다. 프로토타입은 이 바인딩을 **더미(김시대 외 자녀 3명)**로 시연하며, **실제 회원 데이터는 저장소에 하드코딩하지 않고 런타임에 조회**한다.

- **컨텍스트(`CTX`)**: `{ student(학생), campus(지점), grade(학년) }`. 모든 `GET /me/*`는 이 컨텍스트의 학생을 대상으로 한다.
  - **학생 앱**: 진입 시 앱의 현재 선택 지점이 기본값. 챗봇 안에서 **지점 변경** 가능(4개 지점: 대치·목동·반포·분당). 지점은 상담실 연결처 등 지점별 데이터에 반영.
  - **학부모 앱**: `CHILDREN` 배열(김시대·대치·고3 / 이시대·목동·고2 / 박시대·반포·고1 / 최시대·분당·중3). 챗봇 안에서 **자녀(학생) 변경** 가능 → 결제·출결·시간표가 그 자녀 데이터로 전환. 컨텍스트 변경 시 `chatbot_ctx_change` 발화(→ `MEASUREMENT_SPEC.md`).
- **회원 식별**: 대상 학생은 **AMS 회원 식별자**(예: `localMemberSerialNo`)로 지정. 챗봇은 식별자를 들고 `GET /me/*`(또는 보호자 권한 시 `GET /members/{id}/*`)를 호출 → 서버가 해당 회원의 AMS 데이터로 응답. 예: `https://ams.sdij.com/customer/member/detail?localMemberSerialNo=…`는 **운영자(staff) 조회 화면**이며, 챗봇은 동일 회원을 **본인/보호자 스코프 API**로 조회한다(staff 화면 직접 노출 아님).
- **권한**: 학생=본인 스코프. 학부모=보호자-자녀 연결(통합회원) 검증 후 자녀 스코프. 타인 회원 조회 차단([확인필요]).
- **PII**: 이름·연락처 등은 0장 규칙대로. **실제 회원의 개인정보를 프로토타입/저장소에 적재하지 않는다**(데모는 더미만).

---

## 1. 조회(GET) - 목업 카드 → 실 API 매핑 (v6 4메뉴)

> 노드ID = SSOT 함수명. 카드 데이터는 현재 SSOT의 목업 배열(오른쪽 "현 목업 소스")을 실 API로 교체한다.

### 출결·보강 (`m_attend`)

| 챗봇 노드 | 카드 내용(현 목업 소스) | 제안 엔드포인트 | 응답 필드(예) |
|---|---|---|---|
| `at_today` | 오늘 출석 현황 - 강좌별 수업시간·출결상태(출석 tag+시각 / 출석예정) | `GET /me/attendance/today` | `[]{course,time,state,checked_at}` |
| `at_course` → 강좌칩 | 입반 완료 강좌 목록(입반 예정 제외) - 보강 확인 대상 | `GET /me/courses?status=enrolled` | `[]{course}` (`COURSES`) |
| `atVideoMakeup(c)` | 동영상보강 지급 내역 - `회차 / 마이클래스(VOD) / 시청 기한 / N분 제공(M분 시청)` | `GET /me/makeup/video?course=` | `[]{round, source, watch_deadline, total_min, watched_min, state}` (`VIDEO_MAKEUP`) |
| `atOther(c)` | 타반보강 가능 일정 - `회차 / 날짜(요일) / 시각 / 강의실` | `GET /me/makeup/otherclass?course=` | `[]{round, date, time, room}` (`OTHERCLASS`) ⚠실시간 |
| `atVideoExtra(c)` | 추가영상 내역 - `회차 / 지급일 / 시청 기한 / 상태` | `GET /me/makeup/extra?course=` | `[]{round, issued_at, watch_deadline, state}` (`VIDEO_EXTRA`) |
| `en_check` | 입반된 강좌 현황 - 과목 Tag + 강좌 풀네임(완료 배지 없음) | `GET /me/enrollments?status=confirmed` | `[]{course, subject}` (`COURSES`) |

### 납부·결제 (`m_pay`)

| 챗봇 노드 | 카드 내용(현 목업 소스) | 제안 엔드포인트 | 응답 필드(예) |
|---|---|---|---|
| `pay_wait` | 납부 현황 - **[납부필요]** + **[납부대기·가상계좌 입금 대기]** 2섹션(수강료·교재비·합계·납부기한) | `GET /me/payments/status` | `due{course,items[]{label,desc,amount},total,due_date}`, `pending{label,items[],total,due_date}` (`PAY_DUE`·`PAY_PENDING`) |
| `pay_history` | 결제 내역(최근 3개월) - `날짜 / 강좌(이름만, 외 N건) / 금액 / 수단(카드사) / 상태` | `GET /me/payments/history?months=3` | `[]{date, course, method, card, amount, refund_amount, more_count, status}` (`PAY_HISTORY`) |

### 수업·시간표 (`m_time`)

| 챗봇 노드 | 카드 내용(현 목업 소스) | 제안 엔드포인트 | 응답 필드(예) |
|---|---|---|---|
| `time_table` | 주간 시간표(이번/다음 주) - `요일 / 시각 / 강좌명(이름만) / 강의실` + 타반보강 뱃지 | `GET /me/schedule?week=current|next` | `range`, `[]{day, time, course, room}` (`TT.this`·`TT.next`) |
| `time_rounds` → `roundsResult(c)` | 강좌별 전체 회차 일정 - `회차 / 날짜(요일) / 시각` + 진행 상태 | `GET /me/courses/rounds?course=` | `list[]{round, date, time}`, `progress` (`ROUNDS`) |
| `time_end` | 강좌별 종강일 - `강좌 → YYYY-MM-DD` | `GET /me/courses/end-dates` | `[]{course, end_date}` (`ENDDATES`) |

### 전반 (`m_overall`)

| 챗봇 노드 | 카드 내용(현 목업 소스) | 제안 엔드포인트 | 응답 필드(예) |
|---|---|---|---|
| `m_overall` → 강좌칩 | 전반 가능 강좌 목록(`강좌 요일 시각 정원/잔여`) | `GET /me/courses/transferable` | `[]{course, schedule, seats}` (`OVERALL`) ⚠실시간 |
| `altResult(c)` | 같은 강사 다른 시간대 강좌(**지점단과별**) | `GET /me/courses/alt-time?course=` | `[]{campus_track, course, day, time}` (`ALT_SAME`) ⚠실시간 |

⚠ **실시간 필수**: 전반(`OVERALL`·`ALT_SAME`)·타반보강(`OTHERCLASS`)의 잔여석·가능 일정은 캐시하지 말 것. 정원/일정이 분 단위로 바뀜.

---

## 2. 쓰기(POST) - 신청·요청

> v6 4메뉴는 **조회 중심**이다. 현재 SSOT의 유일한 쓰기성 액션은 아래 하나이며, 나머지는 조회/상담 연결로 끝난다.

| 챗봇 액션 | 제안 엔드포인트 / 처리 | 비고 |
|---|---|---|
| **납부하기**(`pay_wait` 하단 CTA) | 외부 PG 결제창 이동(마이클래스 '납부하기' 화면) | 챗봇은 **이동·복귀 안내**까지만. 결제 실행은 외부 PG |

> 옛 8메뉴의 쓰기(입반 신청 링크·대기 접수·결제 문자 재발송·보강 신청·결석 셀프 신고·현금영수증·납입증명서 발급)는 v6 4메뉴 UI에 **없다**. 향후 쓰기 확장(예: 보강 신청·셀프 신고) 시 서버 검증 룰 확정 후 추가([확인필요]) - 현재는 설계 범위 밖.

---

## 3. 프론트 연동 패턴 (스켈레톤은 준비 완료)

현재 `cardLoad(html, delayUnits)`는 **더미 지연 후 렌더**(스켈레톤 → blur cross-fade; `pay_wait`·`pay_history`에서 사용 중). 실 API 연동 시 더미 지연을 **fetch로 교체**만 하면 된다:

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
    consultEnd(backTarget);                        // 무결성: 추정 표시 금지 → 상담 연결
  }
  scrollEnd();
}
```

- 스켈레톤·blur·reduced-motion 처리는 이미 구현됨 → 로딩 UX 추가 작업 거의 없음.
- **에러 = 핸드오프**: API 실패 시 틀린/빈 카드를 보이지 않고 **상담 연결(전화)**로 연결(ZERO 허위정보).
- **단일 출처 배열 유지**: SSOT의 `PAY_DUE`/`PAY_PENDING`처럼 한 납부 응답을 `pay_wait`가 섹션별로 재사용한다. 실 API도 응답 하나를 노드가 공유해 **항상 일치**시킨다. 빈 상태(완납·내역 없음·강좌 없음)의 문구는 `기획서_v6_요약.md 3장` 정본을 따른다.

---

## 4. 인증·보안 ([확인필요])
- 세션 재사용: 앱 WebView/인앱브라우저의 기존 토큰 주입 방식 확인(온보딩 없음 전제).
- 본인/자녀 스코프 강제: 서버가 토큰의 사용자 == 조회 대상(또는 보호자-자녀 연결) 보장(IDOR 방지).
- 상담 연결은 `tel:` 딥링크(외부 통화) - 토큰 비포함, API 아님.

---

## 5. 단계적 적용 권고 (v6 4메뉴)
| 단계 | 범위 |
|---|---|
| 1차 | 읽기 전용 조회(출결·보강·납부·결제·시간표) - 위험 낮고 효용 큼. 매핑 = 1장 |
| 2차 | 실시간 조회(전반·타반보강 잔여/일정) - 캐시 금지, 실시간 소스 연동 |
| 3차 | 납부하기 결제 링크(외부 PG 왕복) - PG 연동 |
| - | 쓰기 확장(보강 신청·셀프 신고 등)은 [확인필요] 해소 전까지 조회/상담 연결 유지 |

> 모든 `[확인필요]`는 실제 백엔드 계약(엔드포인트·필드·인증)에 맞춰 개발팀과 확정한다. 본 문서는 매핑·패턴·원칙의 기준선이며 SSOT는 `public/myclass-chatbot.html`, 콘텐츠 정본은 `기획서_v6_요약.md`이다.

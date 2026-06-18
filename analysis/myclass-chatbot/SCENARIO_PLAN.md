# 마이클래스 챗봇 — 시나리오 기획서 (기획자 검토용)

> **목적**: 챗봇의 전체 대화 시나리오를 한눈에 검토할 수 있게 **플로우(흐름도)·도표**로 정리한 문서.
> **대상 화면**: `analysis/myclass-chatbot/prototype.html` (= 배포본 `public/myclass-chatbot.html` → https://sdij-wiki.vercel.app/chatbot )
> **연결 문서**: `FINAL_PROCESS.md`(SSOT) · `BACKEND_INTEGRATION.md`(API 연동) · `MEASUREMENT_SPEC.md`(측정) · `DESIGN_TOKENS.md`(디자인)
> **원칙**: 모든 안내는 실제 상담 해결방법 근거 · **ZERO 허위정보**(불확실하면 추정 대신 사람에게 연결).

---

## 0. 한 줄 요약

학생·학부모가 **상담원 없이 스스로 문제를 해결(자가해결)** 하게 돕고, 안 되면 **정확한 채널로 연결**하는 챗봇.
챗봇 명칭은 **"마이클래스 도우미"**(서브 "문제를 바로 해결하도록 도와드려요"), 사용자 호칭은 **"상담 선생님"**.
8개 메뉴 · 약 81개 대화 상태(막다른 길 0) · 3개 연결 채널로 구성.

---

## 🔖 도표 보는 법 (범례)

```mermaid
flowchart LR
  A["진입/메뉴"]:::menu
  B["대화 분기<br/>(질문·선택)"]:::step
  C["조회 카드<br/>(데이터 표시)"]:::card
  D["자가해결 종료 ✓"]:::solve
  E["상담 연결<br/>(사람에게)"]:::hand
  A --> B --> C --> D
  B -.안 되면.-> E
  classDef menu fill:#161616,color:#ffffff,stroke:#161616;
  classDef step fill:#ffffff,color:#161616,stroke:#161616;
  classDef card fill:#f4f4f4,color:#161616,stroke:#c6c6c6;
  classDef solve fill:#eaf6ee,color:#14532d,stroke:#3f9d63;
  classDef hand fill:#fdecec,color:#7a1f1f,stroke:#d06a6a,stroke-dasharray:4 3;
```

| 색/모양 | 의미 |
|---|---|
| ⬛ 검정 | 메뉴·진입점 |
| ⬜ 흰색 | 대화 분기(사용자 선택) |
| 🟫 회색 | 조회 카드(데이터 표시 — **실데이터 연동 필요**) |
| 🟩 초록 | 자가해결로 마무리 |
| 🟥 빨강(점선) | 사람(상담)에게 연결 = 핸드오프 |

---

## 1. 진입점 & 종료

### 진입(Entry)
| 진입 | 트리거 | 첫 화면 |
|---|---|---|
| 일반 | 헤더 챗봇 아이콘 클릭 | 홈(8개 메뉴 + 자주 찾는 것) |
| 결제 맥락 | 결제 화면에서 진입(배너) | "결제가 안 되시나요?" → 결제 흐름 |
| 로그인 맥락 | 로그인 실패 맥락(배너) | "로그인이 안 되시나요?" → 계정 흐름 |
| 특강 맥락 | 특강 신청 맥락(배너) | "특강 본인인증 도와드릴게요" → 인증 흐름 |

### 종료(Exit)
모든 흐름의 끝에서 **`처음으로` / `다 해결됐어요`** 제공 → '다 해결됐어요' 선택 시 **만족도(👍/👎)** 수집 → 추가 상담 또는 대화 닫기.

---

## 2. 전체 메뉴 맵

```mermaid
flowchart TD
  H["🏠 홈<br/>무엇을 도와드릴까요?"]:::menu
  H --> M1["① 계정·로그인·앱"]:::menu
  H --> M2["② 미납·결제·환불"]:::menu
  H --> M3["③ 입반·등록·대기"]:::menu
  H --> M4["④ 라이브·교재·배송"]:::menu
  H --> M5["⑤ 출결·보강"]:::menu
  H --> M6["⑥ 수업·시간표"]:::menu
  H --> M7["⑧ 상담원·자주묻는것"]:::menu
  H --> M8["⑦ 퇴원·전반"]:::menu
  H --> FAQ["자주 찾는 것<br/>환불 / 보강 / 앱"]:::step

  M1 -.기술문제.-> CT["📱 마이클래스 카톡"]:::hand
  M2 -.정산·환불.-> CP["☎ 대치 캠퍼스 상담실"]:::hand
  M3 -.학사 확인.-> CP
  M4 -.라이브 전반.-> CL["💬 시대인재 LIVE 카톡"]:::hand
  M5 -.영상 오류.-> CT
  M7 -.일반 상담.-> CP
  M8 -.퇴원·환불.-> CP

  classDef menu fill:#161616,color:#ffffff,stroke:#161616;
  classDef step fill:#ffffff,color:#161616,stroke:#161616;
  classDef hand fill:#fdecec,color:#7a1f1f,stroke:#d06a6a,stroke-dasharray:4 3;
```

> 홈의 메뉴 노출 순서는 **상담원·자주묻는것**을 마지막에 둬, 우선 자가해결을 유도.

---

## 3. 채널 라우팅 (핸드오프 3종)

어디로 연결하느냐가 챗봇의 핵심. **문제 성격**에 따라 채널이 갈립니다.

```mermaid
flowchart LR
  Q{"문제 성격은?"}:::step
  Q -->|"학사·계정·결제·환불·일반"| C1["☎ 대치 캠퍼스 상담실<br/>전화 02-552-2373<br/>문자 010-5423-2378"]:::hand
  Q -->|"앱·로그인·영상 기술오류"| C2["📱 시대인재 마이클래스<br/>카카오톡 상담"]:::hand
  Q -->|"라이브 강의 전반"| C3["💬 시대인재 LIVE<br/>카카오톡 상담"]:::hand
  classDef step fill:#ffffff,color:#161616,stroke:#161616;
  classDef hand fill:#fdecec,color:#7a1f1f,stroke:#d06a6a,stroke-dasharray:4 3;
```

| 채널 | 담당 | 연결되는 문의 |
|---|---|---|
| **대치 캠퍼스 상담실** (`handoff`) | 대치 캠퍼스 고3 상담실<br>전화 02-552-2373 · 문자 010-5423-2378 | 통합회원·자녀계정, 환불(회차 기준)·오입금, 결제수단(카드) 변경, **납입증명서 발급(상담 선생님이 엑셀 .xlsx)**, 반 변경/전반, 연구소 교재비, 현장보강, 서바이벌 커리큘럼, 종강/휴강, 퇴원, 자습실, 컨설팅, 일반 상담 |
| **마이클래스 카톡** (`handoffTech`) | 기술 담당<br>pf.kakao.com/_VGAQn | 로그인 실패, 앱 오류(흰화면·튕김·업데이트 후·설치), 영상 재생 오류, 특강 본인인증 문자 미수신 |
| **시대인재 LIVE 카톡** (`handoffLive`) | 라이브 담당<br>pf.kakao.com/_TkpPG | 라이브 입반·교재 반납·환불·라→현강 이동 등 라이브 서비스 전반 (**기술지원 아닌 라이브 일반 상담**) |

> 사람 연결 시 호칭은 **"상담 선생님"**. 야간(22~08시)에는 핸드오프 시 "문자로 남겨두면 운영 시작 시 먼저 연락" 안내가 자동 추가됨.

---

## 4. 메뉴별 상세 플로우

### ① 계정·로그인·앱

```mermaid
flowchart TD
  A["① 계정·로그인·앱"]:::menu
  A --> L["로그인이 안 돼요"]:::step
  A --> U["통합회원·계정 연결"]:::step
  A --> P["앱이 안 돼요"]:::step

  L --> L1["아이디·비밀번호 기억 안 남<br/>→ 통합회원(이메일 ID) 안내<br/>아이디 찾기·비밀번호 재설정"]:::step
  L1 -.안 되면.-> CP["☎ 대치 캠퍼스 상담실"]:::hand
  L -.기술.-> CT["📱 마이클래스 카톡"]:::hand
  U --> U1["통합회원 / 자녀 계정 연결"]:::step --> CP
  P --> P1["흰 화면 / 튕김 / 업데이트 후 / 설치 안됨<br/>→ 업데이트·재설치 등 자가해결"]:::step
  P1 -.안 되면.-> CT

  classDef menu fill:#161616,color:#ffffff,stroke:#161616;
  classDef step fill:#ffffff,color:#161616,stroke:#161616;
  classDef hand fill:#fdecec,color:#7a1f1f,stroke:#d06a6a,stroke-dasharray:4 3;
```

> **정직성 포인트**: 로그인은 **시대인재 통합회원(아이디=이메일+비밀번호)** 기준으로 안내(소셜 로그인 아님).

### ② 미납·결제·환불

```mermaid
flowchart TD
  B["② 미납·결제·환불"]:::menu
  B --> S["미납·납부 현황"]:::step
  B --> SMS["결제 문자 다시 받기"]:::step
  B --> F["결제가 안 돼요"]:::step
  B --> R["환불 알아보기"]:::step
  B --> E["영수증·결제수단"]:::step

  S --> SC["📄 납부 현황 카드<br/>(항목별 미납/완납·강좌명·기한·합계)"]:::card
  SC --> PAY["지금 결제하기 → 납부하기 화면"]:::solve
  SC --> VA["🏦 가상계좌 카드<br/>(계좌·합계·복사)"]:::card
  SC --> CERT["납입증명서<br/>연도/기간/항목 선택"]:::step
  SC --> SMS
  SMS --> SMS2["미납 N건 → 건별/전체 링크 발송"]:::solve
  CERT -.상담 선생님이 엑셀 발급.-> CP["☎ 대치 캠퍼스 상담실"]:::hand
  F --> F1["재시도 / 문자 재발송"]:::step
  F1 -.안 되면.-> CP
  R --> CP
  E --> E1["현금영수증(자가) / 카드변경 / 오입금"]:::step
  E1 -.카드변경·오입금.-> CP

  classDef menu fill:#161616,color:#ffffff,stroke:#161616;
  classDef step fill:#ffffff,color:#161616,stroke:#161616;
  classDef card fill:#f4f4f4,color:#161616,stroke:#c6c6c6;
  classDef solve fill:#eaf6ee,color:#14532d,stroke:#3f9d63;
  classDef hand fill:#fdecec,color:#7a1f1f,stroke:#d06a6a,stroke-dasharray:4 3;
```

> **데이터 일관성**: 납부 현황·결제 문자·가상계좌는 **하나의 미납 목록(SSOT)** 을 공유 → 미납 여러 건을 모두 동일하게 표시.

### ③ 입반·등록·대기

```mermaid
flowchart TD
  C["③ 입반·등록·대기"]:::menu
  C --> RG["수강신청·입반"]:::step
  C --> CK["내 등록 확인"]:::step
  C --> WT["대기 접수 현황"]:::step
  C --> SP["특강 본인인증 안 됨"]:::step
  C --> TR["반 변경(전반)"]:::step

  RG --> RG1["영역 선택<br/>국어·수학·과학·영어"]:::step
  RG1 --> RG2["강좌 선택(잔여석)<br/>→ 수강신청 화면 / 신청 문자"]:::solve
  RG -.마감 강좌.-> WS["마감 대기: 영역→강좌 선택→접수"]:::step
  CK --> CKC["📋 내 등록 현황 카드<br/>(강좌별 상태·결제일 상이)"]:::card
  WT --> WTC["⏳ 대기 현황 카드<br/>(충원/대기N번·순번)"]:::card
  WTC --> WTI["대기 상태 안내(모든 경우)"]:::step
  SP -.문자 미수신.-> CT["📱 마이클래스 카톡"]:::hand
  TR --> TR1["강좌 선택 → 같은 강사 다른 시간"]:::step --> CP["☎ 대치 캠퍼스 상담실"]:::hand

  classDef menu fill:#161616,color:#ffffff,stroke:#161616;
  classDef step fill:#ffffff,color:#161616,stroke:#161616;
  classDef card fill:#f4f4f4,color:#161616,stroke:#c6c6c6;
  classDef solve fill:#eaf6ee,color:#14532d,stroke:#3f9d63;
  classDef hand fill:#fdecec,color:#7a1f1f,stroke:#d06a6a,stroke-dasharray:4 3;
```

### ④ 라이브·교재·배송

```mermaid
flowchart TD
  D["④ 라이브·교재·배송"]:::menu
  D --> D1["라이브 입반 / 교재 반납 / 환불 / 라→현 이동"]:::step
  D --> D4["라이브 결제·수강료"]:::step
  D --> D2["복습·추가영상"]:::step
  D --> D3["교재 배송 조회"]:::step

  D1 --> CL["💬 시대인재 LIVE 카톡<br/>라이브 일반 상담(학생·강좌·요청내용)"]:::hand
  D4 --> D4c["💳 라이브 결제 카드<br/>수강료·교재비·합계 → 결제 문자"]:::card
  D2 --> D2a["앱 → 수강 강좌 → 강좌 상세보기 → 강의 목록"]:::step
  D2a -.영상 안 열림.-> VID["영상 오류 진단<br/>(라이선스/버퍼링/PC크롬/앱종료)"]:::step
  VID -.안 되면.-> CT["📱 마이클래스 카톡"]:::hand
  D3 --> D3c["🚚 배송 현황 카드 → 택배사 추적"]:::card

  classDef menu fill:#161616,color:#ffffff,stroke:#161616;
  classDef step fill:#ffffff,color:#161616,stroke:#161616;
  classDef card fill:#f4f4f4,color:#161616,stroke:#c6c6c6;
  classDef hand fill:#fdecec,color:#7a1f1f,stroke:#d06a6a,stroke-dasharray:4 3;
```

> **정직성 포인트**: 라이브 입반·반납·환불은 **기술지원이 아니라 라이브 일반 상담**으로 연결(요청내용 중심).

### ⑤ 출결·보강

```mermaid
flowchart TD
  E["⑤ 출결·보강"]:::menu
  E --> MK["동영상 보강"]:::step
  E --> TD["오늘 출석 확인"]:::step
  E --> WK["주간 출결 현황"]:::step
  E --> AB["결석·지각 미리 신고"]:::step
  E --> FB["현장 보강 문의"]:::step

  MK --> MK1["강좌 선택(수강 강좌 전체)<br/>→ 주차 선택"]:::step
  MK1 --> MK2["신청가능/시청중/준비중<br/>→ 신청·이어보기·자료문자"]:::solve
  TD --> TDC["✅ 오늘 출결 카드(체크인)"]:::card
  WK --> WKC["📅 주간 출결 히트맵<br/>(출석·지각·결석·예정)"]:::card
  AB --> MK
  FB -.가능여부.-> CP["☎ 대치 캠퍼스 상담실"]:::hand

  classDef menu fill:#161616,color:#ffffff,stroke:#161616;
  classDef step fill:#ffffff,color:#161616,stroke:#161616;
  classDef card fill:#f4f4f4,color:#161616,stroke:#c6c6c6;
  classDef solve fill:#eaf6ee,color:#14532d,stroke:#3f9d63;
  classDef hand fill:#fdecec,color:#7a1f1f,stroke:#d06a6a,stroke-dasharray:4 3;
```

### ⑥ 수업·시간표

```mermaid
flowchart TD
  F["⑥ 수업·시간표"]:::menu
  F --> T1["내 시간표<br/>(이번 주 / 다음 주 전환)"]:::card
  F --> T2["강의실 위치"]:::card
  F --> T3["서바이벌 커리큘럼"]:::step
  F --> T4["종강일·휴강 안내"]:::step
  T3 -.정확한 구성.-> CP["☎ 대치 캠퍼스 상담실"]:::hand
  T4 -.변동 일정.-> CP
  classDef menu fill:#161616,color:#ffffff,stroke:#161616;
  classDef step fill:#ffffff,color:#161616,stroke:#161616;
  classDef card fill:#f4f4f4,color:#161616,stroke:#c6c6c6;
  classDef hand fill:#fdecec,color:#7a1f1f,stroke:#d06a6a,stroke-dasharray:4 3;
```

### ⑦ 퇴원·전반 (리텐션)

```mermaid
flowchart TD
  G["⑦ 퇴원·전반"]:::menu
  G --> R1["시간 안 맞음 → 강좌별 대체 시간"]:::step
  G --> R2["난이도 안 맞음 → 수준별 반"]:::step
  G --> R3["강사 변경"]:::step
  G --> R4["라이브로 이동"]:::step
  R1 & R2 & R3 -.그래도 퇴원.-> QR["퇴원·환불 접수(회차 기준)"]:::step
  QR --> CP["☎ 대치 캠퍼스 상담실"]:::hand
  R4 --> M4["④ 라이브 흐름"]:::menu
  classDef menu fill:#161616,color:#ffffff,stroke:#161616;
  classDef step fill:#ffffff,color:#161616,stroke:#161616;
  classDef hand fill:#fdecec,color:#7a1f1f,stroke:#d06a6a,stroke-dasharray:4 3;
```

> **리텐션 설계**: 퇴원 의사 → 곧바로 접수하지 않고 **대안(시간·난이도·강사·라이브)** 을 먼저 제시.

### ⑧ 상담원·자주묻는것

```mermaid
flowchart TD
  Hh["⑧ 상담원·자주묻는것"]:::menu
  Hh --> Q1["자주 묻는 것(FAQ)"]:::step
  Hh --> Q2["전화·상담 연락처"]:::card
  Hh --> Q3["교재 수령 위치(내 강좌 전체)"]:::card
  Hh --> Q4["설명회·컨설팅 예약"]:::card
  Hh --> Q5["자습실 이용"]:::step
  Hh --> Q6["상담원 연결"]:::step
  Q5 & Q6 --> CP["☎ 대치 캠퍼스 상담실"]:::hand
  classDef menu fill:#161616,color:#ffffff,stroke:#161616;
  classDef step fill:#ffffff,color:#161616,stroke:#161616;
  classDef card fill:#f4f4f4,color:#161616,stroke:#c6c6c6;
  classDef hand fill:#fdecec,color:#7a1f1f,stroke:#d06a6a,stroke-dasharray:4 3;
```

---

## 5. 조회 카드(데이터) 인벤토리

현재는 **목업(예시 데이터)**. 실서비스 전환 시 아래 카드에 실데이터 연동 필요 → 상세 매핑은 `BACKEND_INTEGRATION.md`.

| 카드 | 메뉴 | 표시 내용 | 실시간 |
|---|---|---|---|
| 납부 현황 | ② | 항목별 미납/완납·강좌명·기한·합계 | – |
| 가상계좌 | ② | 은행·계좌·합계·복사 | – |
| 내 등록 현황 | ③ | 강좌별 상태·결제일 | – |
| 대기 접수 현황 | ③ | 충원/대기순번 | ⚠ 분 단위 변동 |
| 교재 배송 | ④ | 상태·택배사·송장 | – |
| 오늘/주간 출결 | ⑤ | 체크인·6주 히트맵 | – |
| 동영상 보강 | ⑤ | 주차별 상태·진도율 | – |
| 내 시간표 | ⑥ | 요일·강좌·강의실(주 전환) | – |
| 강의실/교재 위치 | ⑥⑧ | 강좌별 위치 | – |

> ⚠ **대기순번·잔여석**은 캐시 금지(충원·마감이 분 단위로 변함). API 오류 시 추정 표시 대신 상담 연결.

---

## 6. 자가해결 vs 핸드오프 — 설계 원칙

```mermaid
flowchart LR
  IN["문의 진입"]:::menu --> TRY["자가해결 시도<br/>(안내·조회·신청)"]:::step
  TRY -->|"해결됨"| OK["✓ 종료 + 만족도"]:::solve
  TRY -->|"불확실·권한·정산 필요"| HO["사람에게 연결"]:::hand
  HO --> OK
  classDef menu fill:#161616,color:#ffffff,stroke:#161616;
  classDef step fill:#ffffff,color:#161616,stroke:#161616;
  classDef solve fill:#eaf6ee,color:#14532d,stroke:#3f9d63;
  classDef hand fill:#fdecec,color:#7a1f1f,stroke:#d06a6a,stroke-dasharray:4 3;
```

1. **자가해결 우선** — 조회·안내·신청은 챗봇 안에서 마무리.
2. **불확실하면 사람** — 권한·정산·개인확인이 필요하면 추정하지 않고 정확한 채널로.
3. **ZERO 허위정보** — 검증 안 된 메뉴 경로·교재명·명칭은 단정하지 않음.
4. **맥락에 맞는 채널** — 학사=대치 캠퍼스 상담실(상담 선생님) / 앱·영상=마이클래스 카톡 / 라이브=LIVE 카톡.

---

## 7. 측정 포인트 (효과 검증)

North Star = **자가해결율** = `핸드오프 없이 종료 / 챗봇 오픈`. 상세 이벤트·KPI는 `MEASUREMENT_SPEC.md`.

| 지표 | 의미 |
|---|---|
| 자가해결율 | 챗봇이 실제로 일했는가(디플렉션) |
| 채널별 핸드오프율 | 어디로·왜 사람에게 가나 |
| 메뉴별 진입·완주 | 어떤 메뉴가 효과/막힘 |
| 이탈 노드 Top | 시나리오 구멍 |
| 만족도(👍/👎) | 체감 품질 |

---

> 본 문서는 **검토·합의용 기획서**입니다. 흐름·문구·채널은 실제 운영 정책에 맞춰 조정하며, 변경 시 SSOT(`FINAL_PROCESS.md`)와 본 문서를 함께 갱신합니다.

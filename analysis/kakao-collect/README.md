# 카카오 상담 데이터 수집 — 자료 인덱스

카카오 파트너센터(비즈니스 채팅)의 학생·학부모↔학원 상담을 5분마다 자동 수집해 분석용 DB에 쌓는
**무중단 파이프라인**의 문서·코드·인프라를 한곳에서 찾도록 정리한 지도입니다.
(관련 파일이 저장소 여러 폴더에 흩어져 있어, 여기서 **연관끼리 묶어** 링크합니다.)

---

## 1. 이 폴더 (문서 — Confluence 업로드용)

| 파일 | 용도 | 대상 독자 |
|---|---|---|
| **[카카오상담수집_작업회고.md](./카카오상담수집_작업회고.md)** | **과정·문제해결·배운점·AI 활용법** (역량 공유용) | 팀·상급자 |
| **[카카오상담수집_컨플루언스.md](./카카오상담수집_컨플루언스.md)** | **성과·수치·분석 인사이트** (결과 소개용) | 팀·상급자·의사결정자 |
| [카카오상담수집_인포그래픽.png](./카카오상담수집_인포그래픽.png) | 1장 요약 인포그래픽 (발표·공유용) | 전체 |
| [카카오상담수집_흐름도.png](./카카오상담수집_흐름도.png) | 전체 흐름도 (Mermaid 미지원 환경 대체 이미지) | 전체 |

> **두 문서는 짝(companion)입니다** — "어떻게 했나"(작업회고)와 "무엇을 이뤘나"(컨플루언스)를 나눠 담았습니다.

---

## 2. 수집 실행 코드 — `scripts/`

| 파일 | 역할 |
|---|---|
| `scripts/kakao-partner-collect-once.mjs` | **현재 정본 수집 1사이클** (증분 폴링, pg_cron·Edge Function이 호출) |
| `scripts/kakao-partner-multi-stream.mjs` | 3채널 동시 수집(supervisor) — 상시 데몬형 |
| `scripts/kakao-partner-stream.mjs` | 단일 채널 실시간/폴링 데몬 |
| `scripts/kakao-partner-bootstrap.mjs` | 최초 1회 채팅 메타 백필 |
| `scripts/kakao-partner-backfill.mjs` · `-backfill-missing.mjs` | 과거 메시지·누락분 회수 |
| `scripts/kakao-partner-refresh-cookie.mjs` | 로그인 쿠키 자동 갱신·배달 |
| `scripts/kakao-partner-status.mjs` | 수집 상태·heartbeat·마지막 오류 점검 |
| `scripts/kakao-partner-export-csv.mjs` · `-dashboard.mjs` · `-sheets-sync.mjs` | 정제 CSV 추출 · 로컬 대시보드 · 시트 동기화 |
| `scripts/classify-kakao-stream.mjs` · `classify-kakao-csv.mjs` | Claude 기반 카테고리·감정 자동 분류 |
| `scripts/lib/kakao-partner-client.mjs` | 파트너센터 REST 클라이언트(쿠키 인증) |
| `scripts/lib/kakao-sanitize.mjs` | **PII(개인정보) 마스킹 공통 모듈** (저장 전 마스킹) |
| `scripts/lib/kakao-cookie.mjs` | 쿠키 추출·관리 |
| `scripts/lib/__tests__/kakao-sanitize.test.js` | 마스킹 규칙 검증 테스트 |

---

## 3. 인프라·스케줄 — `supabase/` · `.github/` · `launchd/`

| 파일 | 역할 |
|---|---|
| `supabase/functions/kakao-collect/index.ts` | **현재 수집 실행 서버**(항상 켜진 Edge Function) |
| `supabase/migrations/20260512_kakao_partner.sql` | 적재 테이블(chats·messages·stream_state) + RLS |
| `supabase/migrations/20260524_kakao_partner_stream_health.sql` | heartbeat·오류 기록 컬럼 |
| `supabase/migrations/20260526_kakao_mask_functions.sql` | 표시용 2차 마스킹 함수 |
| `supabase/migrations/20260527_kakao_category_sentiment.sql` | 카테고리·감정 컬럼 + 집계 RPC |
| `supabase/migrations/20260617_kakao_partner_secrets.sql` | 쿠키 자동 배달 보관함(RLS 잠금) |
| `supabase/migrations/20260617_kakao_collect_pg_cron_dispatch.sql` | pg_cron 5분 트리거(1차) |
| `supabase/migrations/20260625_kakao_collect_edge_function.sql` | **pg_cron → Edge Function 직접 호출**(현재 정본) |
| `.github/workflows/kakao-collect.yml` | 수동 폴백용 GitHub Actions 경로 |
| `scripts/launchd/com.amswiki.kakao-*.plist` | (구) 맥북 상시 실행·쿠키 갱신 — 인프라 이전 전 방식 |

---

## 4. 분석 결과 — `analysis/myclass-chatbot/`

| 파일 | 역할 |
|---|---|
| `analysis/myclass-chatbot/DATA_ANALYSIS.md` | **3채널 교차분석 전문**(전화 42만 + 카카오 3채널 + GA4) — 회고/성과 문서의 인사이트 근거 |

---

## 5. 셋업·운영 가이드 — `docs/`

| 파일 | 역할 |
|---|---|
| `docs/KAKAO_PARTNER_SETUP.md` | 수집 셋업·운영·트러블슈팅 (마이그레이션·쿠키·pg_cron·PAT) |
| `docs/KAKAO_WEBHOOK_SETUP.md` | (별개 서비스) 카카오 챗봇 webhook 수집 셋업 |

---

## 6. 데이터 흐름 한눈에

```
카카오 파트너센터 (반출 기능 없음)
        │  세션 쿠키로 내부 통신 직접 호출 (증분 폴링)
        ▼
pg_cron(5분) ──▶ Edge Function(kakao-collect) ──▶ PII 마스킹(kakao-sanitize)
        ▲                                                    │
   회사 맥 크롬                                              ▼
 (6시간마다 쿠키 자동 배달)              Supabase 테이블(chats·messages·state)
                                                             │
                                          Claude 자동 분류(카테고리·감정)
                                                             ▼
                                          3채널 교차분석 → 챗봇 우선순위 의사결정
```

*(개인정보 원문은 저장소·문서에 미반입. 수치는 2026‑06‑30 기준 라이브 DB 실측.)*

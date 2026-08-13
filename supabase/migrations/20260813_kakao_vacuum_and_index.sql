-- 20260813_kakao_vacuum_and_index.sql
--
-- 대시보드가 만성적으로 느렸던 진짜 원인 (2026-08-13 실측)
--   kakao_partner_messages : 마지막 자동 정리 2026-07-18 (26일 전)
--   kakao_partner_chats    : 자동 정리·통계 수집 이력 자체가 없음(전부 null)
--
-- 정리(vacuum)가 밀리면 "가시성 맵"이 갱신되지 않아, 인덱스만 읽으면 될 조회도 테이블 본문을
-- 다시 읽는다. 이 테이블은 raw jsonb 때문에 한 블록에 행이 1개꼴이라 그 비용이 그대로 응답시간이 된다.
--   실측: 상담 품질 지표 18,850ms → (vacuum 후) 157ms.
--
-- ⚠️ 아래 vacuum 은 마이그레이션으로 실행할 수 없다(트랜잭션 안에서 못 돈다).
--    프로덕션에는 2026-08-13 에 수동 실행 완료. 새 환경을 세울 때만 한 번 돌리면 된다.
--    vacuum (analyze) public.kakao_partner_messages;
--    vacuum (analyze) public.kakao_partner_chats;

-- 상담 품질 지표는 기간 안의 모든 메시지를 대화방별로 훑는다. 필요한 컬럼을 전부 인덱스에 담아
-- 테이블 본문을 아예 안 읽게 한다(index-only scan, 실측 Heap Fetches 0).
create index if not exists kakao_msg_quality_idx
  on public.kakao_partner_messages (sent_at)
  include (chat_id, sender_type, profile_id);

-- 기본 자동 정리 기준은 "전체 행의 20%가 바뀌면"이다. 110만 행이면 22만 건이 쌓여야 도는 셈이라
-- 사실상 안 돈다. 이 두 테이블은 5분마다 새 행이 들어오므로 기준을 낮춘다.
alter table public.kakao_partner_messages set (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold     = 1000,
  autovacuum_analyze_threshold    = 1000
);
alter table public.kakao_partner_chats set (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_threshold     = 500,
  autovacuum_analyze_threshold    = 500
);

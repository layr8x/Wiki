-- 20260706_jandi_backfill_progress.sql
-- 잔디(JANDI) 백필 진행률 컬럼 — Edge Function(jandi-backfill)의 재개(resume) 상태 저장용.
--
-- 배경: 백필 대상(3개 방 전체 과거 대화)이 한 번의 Edge Function 실행시간 예산을 넘을 수 있어,
--   방마다 "어디까지 백필했는지"(backfill_cursor)와 "끝까지 다 했는지"(backfill_done)를 저장해
--   다음 호출이 이어받게 한다. jandi_channels.last_link_id(증분 수집용, 최신 커서)와는 별개.

alter table jandi_channels
  add column if not exists backfill_cursor text,
  add column if not exists backfill_done boolean default false;

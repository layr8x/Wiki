-- 20260706_kakao_backfill_missing_messages_perf_index.sql
-- 백필(kakao_chats_missing_messages) 이 profile_id 필터 + chat_id 정렬을 쓰는데
-- 기존 idx_kakao_partner_chats_profile 은 (profile_id, last_log_send_at desc) 라 안 맞아
-- kakao_partner_chats_pkey(chat_id) 전체(5채널 4.3만행)를 훑으며 profile_id 를 Filter 로 거르고 있었다.
-- LIVE 채널은 91.7% 완료된 시점부터 남은 후보가 희소해져 이 스캔이 스테이트먼트 타임아웃에 걸리기 시작함
-- (2026-07-06 02:20~02:40, 5회 연속 timeout, 진행 0). profile_id+chat_id 복합 인덱스로 해당 채널
-- 범위만 바로 스캔하도록 보완한다. 속도(cron 주기·배치 크기)는 변경하지 않음 — 순수 인덱스 추가.
--
-- ⚠️ 참고: 이 인덱스만으로는 8초 role 제한을 못 넘겼다(실측). 진짜 수정은 뒤이은
-- 20260706_kakao_backfill_messages_cursor.sql 의 커서(cursor) 도입.

create index if not exists idx_kakao_partner_chats_profile_chatid
  on public.kakao_partner_chats (profile_id, chat_id);

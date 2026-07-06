-- 20260706_kakao_backfill_messages_cursor.sql
-- 백필 진행 정지의 진짜 원인 수정: kakao_chats_missing_messages 가 매 호출마다 chat_id
-- 오름차순으로 "profile_id 전체" 를 처음부터 다시 스캔 -> 이미 끝난 앞부분(LIVE 채널 기준
-- 3.2만행)을 매번 다시 건너뛰어야 해서, 남은 후보가 희소해질수록(2026-07-06 기준 91.7% 완료)
-- 스캔 비용이 계속 커져 결국 8초 role 제한(authenticator statement_timeout)을 넘겨
-- 02:20~03시대 계속 timeout, 진행 0 이 됐다(통계 갱신·복합 인덱스 추가만으로는 8초 안에
-- 안 들어옴 — 실측 확인, 20260706_kakao_chats_missing_messages_timeout_override.sql 참고).
--
-- 고침: profile_id 별 "마지막으로 안전하게 넘어간 지점"을 kakao_partner_stream_state 에
-- 커서(backfill_msg_cursor)로 저장해두고, 다음 호출은 그 지점 이후만 스캔
-- (idx_kakao_partner_chats_profile_chatid 가 이 range scan 을 지원). 커서는
-- supabase/functions/kakao-backfill/index.ts 의 runMessages() 가 실패(failed) 없이
-- 완전히 처리된 배치일 때만 전진시킨다(일시 오류가 있으면 커서를 그대로 둬 다음 회차에
-- 재시도 — 데이터 손실 방지 원칙 유지). kakao-collect(실시간 수집)는 이 변경과 무관, 손대지 않음.
--
-- 실측(2026-07-06): 적용 전 EXPLAIN ANALYZE 15초(_rcpPG, 32,334행 스캔) -> 적용 후 실제
-- 호출 1회 processed=25 upserted=669 failures=0 정상 완료 확인.

alter table public.kakao_partner_stream_state
  add column if not exists backfill_msg_cursor text;

create or replace function public.kakao_chats_missing_messages(p_pid text, p_lim int default 50, p_after text default null)
returns table(chat_id text)
language sql stable security invoker set search_path = '' as $$
  select c.chat_id
  from public.kakao_partner_chats c
  where c.profile_id = p_pid
    and (p_after is null or c.chat_id > p_after)
    and not exists (select 1 from public.kakao_partner_messages m where m.chat_id = c.chat_id)
    and not exists (select 1 from public.kakao_backfill_empty e where e.chat_id = c.chat_id)
  order by c.chat_id
  limit p_lim;
$$;

grant execute on function public.kakao_chats_missing_messages(text, int, text) to anon, authenticated, service_role;

-- 20260703_kakao_backfill_missing_messages.sql
-- 신규 편입 채널(_rcpPG=LIVE, _rkbcn=통합로그인) 전체 기간 백필 지원.
-- kakao-backfill 함수(mode=messages)가 "메시지가 아직 없는 대화"만 골라 처리하도록 하는 RPC.
-- 발굴(mode=chats)과 동시에 돌아도 누락 없고(=race free), 남은 대화가 0이면 자연 종료.
-- 채널 목록 자체는 supabase/functions/kakao-collect 의 PROFILE_IDS(5개)로 관리(CLAUDE.md §16 정본).
create or replace function public.kakao_chats_missing_messages(p_pid text, p_lim int default 50)
returns table(chat_id text) language sql stable security invoker set search_path = '' as $$
  select c.chat_id
  from public.kakao_partner_chats c
  where c.profile_id = p_pid
    and not exists (select 1 from public.kakao_partner_messages m where m.chat_id = c.chat_id)
  order by c.chat_id
  limit p_lim;
$$;
grant execute on function public.kakao_chats_missing_messages(text, int) to anon, authenticated, service_role;

-- 참고(운영): 대량 1회 백필은 임시 pg_cron 3종으로 구동 후, 완료되면 제거한다.
--   cron.unschedule('kakao-bf-chats-rcp');  -- _rcpPG 대화 발굴
--   cron.unschedule('kakao-bf-msg-rcp');    -- _rcpPG 메시지
--   cron.unschedule('kakao-bf-msg-rkb');    -- _rkbcn 메시지
-- 상시 증분 수집은 kakao-collect(5채널) + kakao-collect-dispatch cron 이 담당.

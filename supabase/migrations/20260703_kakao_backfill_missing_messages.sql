-- 20260703_kakao_backfill_missing_messages.sql
-- 신규 편입 채널(_rcpPG=LIVE, _rkbcn=통합로그인) 전체 기간 백필 지원.
-- kakao-backfill 함수(mode=messages)가 "메시지가 아직 없는 대화"만 골라 처리하도록 하는 RPC.
-- 발굴(mode=chats)과 동시에 돌아도 누락 없고(=race free), 남은 대화가 0이면 자연 종료.
-- 채널 목록 자체는 supabase/functions/kakao-collect 의 PROFILE_IDS(5개)로 관리(CLAUDE.md §16 정본).

-- 백필 중 발견(2026-07-03): 카카오 chatlogs API가 로그 0건을 반환하는 대화가 있음
--   (보존기간 경과·사용자 퇴장 등, 예: _rkbcn 3건 실측 status 200 / items 0 / has_prev false).
--   이 대화들이 chat_id 오름차순 큐 앞을 막아 같은 대화를 무한 재시도 -> 백필 정체.
--   해결: "원천에 로그 없음"으로 판정된 대화를 kakao_backfill_empty 에 기록해 큐에서 제외.
--   일시 오류(fetch/upsert 실패)는 기록하지 않아 다음 회차 자동 재시도(데이터 손실 방지).
--   메타(닉네임·마지막 메시지·일시)는 kakao_partner_chats 에 보존되므로 원천이 주는 데이터는 전부 저장.
create table if not exists public.kakao_backfill_empty (
  chat_id text primary key,
  profile_id text not null,
  checked_at timestamptz not null default now()
);
alter table public.kakao_backfill_empty enable row level security;
grant select, insert, update on public.kakao_backfill_empty to service_role;

create or replace function public.kakao_chats_missing_messages(p_pid text, p_lim int default 50)
returns table(chat_id text) language sql stable security invoker set search_path = '' as $$
  select c.chat_id
  from public.kakao_partner_chats c
  where c.profile_id = p_pid
    and not exists (select 1 from public.kakao_partner_messages m where m.chat_id = c.chat_id)
    and not exists (select 1 from public.kakao_backfill_empty e where e.chat_id = c.chat_id)
  order by c.chat_id
  limit p_lim;
$$;
grant execute on function public.kakao_chats_missing_messages(text, int) to anon, authenticated, service_role;

-- 참고(운영): 대량 1회 백필은 임시 pg_cron 으로 구동 후, 완료되면 제거한다.
--   kakao-bf-chats-rcp : _rcpPG 대화 발굴  -> 2026-07-03 완료(has_next=false, 35,249건) 후 제거됨.
--   kakao-bf-msg-rkb   : _rkbcn 메시지    -> 2026-07-03 완주(437건 수집 + empty 3건) 후 제거됨.
--   kakao-bf-msg-rcp   : _rcpPG 메시지    -> 진행 중. 완주(remaining 0) 확인 후 cron.unschedule.
-- 상시 증분 수집은 kakao-collect(5채널) + kakao-collect-dispatch cron 이 담당.

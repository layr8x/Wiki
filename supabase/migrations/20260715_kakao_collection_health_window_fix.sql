-- 수집 건강 판정 시간 창 교정 — 알림 플래핑(만료↔지연 반복) 제거 (2026-07-15)
--
-- 문제(실측): auth(로그인 만료) 인정 창이 15분인데 수집 주기는 20분이라, 10분마다 도는
-- 알림 검사에서 판정이 auth ↔ heartbeat 로 매번 뒤집혔다. 통합 알림의 "원인 변경 시 즉시
-- 재알림" 규칙과 겹쳐 10분마다 빨강/주황이 번갈아 발송되는 스팸이 됨(사용자 스크린샷).
--
-- 수정: auth 창 45분(수집 주기 20분의 2배 + 여유 — 한 번 건너뛰어도 유지),
--       heartbeat 경고 25분(프런트 db.js HEARTBEAT_OK_MIN=25 와 일치, 기존 15분은
--       정상 주기(20분) 막바지에도 경고로 뒤집히는 오탐).
-- 회복 지연 없음: 수집이 성공하면 last_error 가 즉시 null 로 초기화돼 auth 는 바로 해제된다.
create or replace function public.kakao_collection_health()
returns table(profile_id text, channel_label text, hb_age_min numeric, last_error text, hrs_since_msg numeric, avg_per_day numeric, gap_threshold_h numeric, health text, health_reason text)
language sql
stable
set search_path to ''
as $$
  with act as (
    select s.profile_id,
      case s.profile_id when '_xfxilXn' then '콘텐츠' when '_rcpPG' then 'LIVE' when '_rkbcn' then '통합로그인' when '_TkpPG' then 'LIVE 기술지원'
                        when '_VGAQn' then '마이클래스' else s.profile_id end as channel_label,
      s.last_heartbeat_at, s.last_error, s.last_error_at,
      (select max(m.sent_at) from public.kakao_partner_messages m where m.profile_id = s.profile_id) as last_msg_at,
      (select count(*) from public.kakao_partner_chats c
         where c.profile_id = s.profile_id and c.last_log_send_at >= now() - interval '30 days') as chats_30d
    from public.kakao_partner_stream_state s
  ),
  calc as (
    select profile_id, channel_label, last_heartbeat_at, last_error, last_error_at, last_msg_at,
      round(chats_30d / 30.0, 2) as avg_per_day,
      round(least(greatest((24.0 / greatest(chats_30d / 30.0, 0.1)) * 3.0, 6.0), 72.0), 1) as gap_threshold_h
    from act
  )
  select profile_id, channel_label,
    round(extract(epoch from (now() - last_heartbeat_at)) / 60.0, 1) as hb_age_min,
    last_error,
    round(extract(epoch from (now() - last_msg_at)) / 3600.0, 1) as hrs_since_msg,
    avg_per_day, gap_threshold_h,
    case
      when last_error is not null and last_error_at > now() - interval '45 min' then 'critical'
      when last_heartbeat_at < now() - interval '25 min' then 'warning'
      else 'ok'
    end as health,
    case
      when last_error is not null and last_error_at > now() - interval '45 min' then 'auth'
      when last_heartbeat_at < now() - interval '25 min' then 'heartbeat'
      when extract(epoch from (now() - last_msg_at)) / 3600.0 > gap_threshold_h then 'gap'
      else 'ok'
    end as health_reason
  from calc
  order by profile_id;
$$;

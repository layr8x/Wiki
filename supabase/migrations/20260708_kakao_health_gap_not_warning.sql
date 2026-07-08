-- =============================================================================
-- 카카오 수집 헬스: gap(문의 뜸함)을 warning 에서 제외 — 알림 스팸 제거
-- =============================================================================
-- 배경(2026-07-08 사용자 지적): 저트래픽 채널(콘텐츠·통합로그인)이 "새 상담이 뜸해요"
--   알림을 밤새 1시간마다 반복 발송해 순수 스팸이 됐다. gap 은 고장이 아니라 그냥 문의가
--   없는 정상 상태(알림 문구조차 "프로그램은 정상"이라 안내)라 알릴 이유가 없다.
--   실제 수집 중단은 auth(쿠키 만료)·heartbeat(수집 정체)로 충분히 커버된다.
-- 조치: health 계산에서 gap 분기를 제거해 gap 은 health='ok' 로 낮춘다. health_reason='gap'
--   은 대시보드 정보용으로 유지. (kakao-alert 엣지함수도 auth/heartbeat 만 알리도록 이중 보강.)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.kakao_collection_health()
 RETURNS TABLE(profile_id text, channel_label text, hb_age_min numeric, last_error text, hrs_since_msg numeric, avg_per_day numeric, gap_threshold_h numeric, health text, health_reason text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
      when last_error is not null and last_error_at > now() - interval '15 min' then 'critical'
      when last_heartbeat_at < now() - interval '15 min' then 'warning'
      else 'ok'
    end as health,
    case
      when last_error is not null and last_error_at > now() - interval '15 min' then 'auth'
      when last_heartbeat_at < now() - interval '15 min' then 'heartbeat'
      when extract(epoch from (now() - last_msg_at)) / 3600.0 > gap_threshold_h then 'gap'
      else 'ok'
    end as health_reason
  from calc
  order by profile_id;
$function$;

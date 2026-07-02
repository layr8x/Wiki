-- 20260702_kakao_status_slash_command.sql
-- kakao_status_summary() RPC — 파이프라인 현재 상태(수집 헬스·분류 진행률·감정분석 진행률·
-- 진행 중인 알림)를 한 번에 묶어 반환한다.
--
-- ⚠️ 2026-07-02 업데이트: 원래 이 RPC는 Slack 슬래시 명령(/카카오상태, kakao-status Edge
-- Function)이 즉시 조회용으로 쓰려고 만들었으나, 그 기능은 워크스페이스 관리자 승인이 필요해
-- (현실적으로 승인 가능성이 낮다고 판단) 폐기했다(kakao-status 함수·토큰 제거,
-- supabase/functions/kakao-status 디렉터리 삭제). 이 RPC 자체는 kakao-daily-summary
-- (supabase/migrations/20260702_kakao_daily_summary.sql, 관리자 승인 불요 경로)가 계속
-- 사용 중이라 유지한다. 이제 이름은 "슬래시 명령용"이 아니라 "상태 조회용 공용 RPC"로 읽을 것.

create or replace function public.kakao_status_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'channels', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'channel', h.channel_label,
        'health', h.health,
        'hrs_since_msg', h.hrs_since_msg,
        'hb_age_min', h.hb_age_min
      )), '[]'::jsonb)
      from public.kakao_collection_health() h
    ),
    'classify', jsonb_build_object(
      'unclassified', (select count(*) from public.kakao_partner_chats where category is null),
      'review_queue', (select count(*) from public.kakao_partner_chats
                          where category_confidence = 0.30 and category_model = 'rule')
    ),
    'sentiment', jsonb_build_object(
      'done', (select count(*) from public.kakao_partner_messages
                  where sender_type = 'user' and sentiment is not null),
      'total_user_msgs', (select count(*) from public.kakao_partner_messages where sender_type = 'user')
    ),
    'active_alerts', (
      select coalesce(jsonb_agg(alert_key), '[]'::jsonb)
      from public.kakao_partner_alert_state where status = 'alerting'
    ),
    'generated_at', now()
  );
$$;

grant execute on function public.kakao_status_summary() to anon, authenticated;

-- 점검: select kakao_status_summary();

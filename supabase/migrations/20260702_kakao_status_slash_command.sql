-- 20260702_kakao_status_slash_command.sql
-- Slack 슬래시 명령(예: /카카오상태)으로 파이프라인 현재 상태를 즉시 조회하기 위한 RPC + 토큰.
--
-- 배경: kakao-alert(supabase/migrations/20260702_kakao_alert_pipeline.sql)는 "이상이 있을
-- 때만" 알린다. 이 마이그레이션은 그와 별개로 "지금 당장" 상태를 사람이 원할 때 물어볼 수
-- 있게, 수집 헬스·분류 진행률·감정분석 진행률·진행 중인 알림을 한 번에 묶어 반환하는 RPC를
-- 추가한다. Slack 쪽 호출은 supabase/functions/kakao-status 가 처리(동기 응답, 봇 토큰 불요).

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

-- 슬래시 명령 Request URL 인증용 토큰(1회 발급, 재적용해도 기존 값 유지).
-- 이 값은 Slack 앱 설정(Slash Commands > Request URL)에 사람이 직접 붙여넣어야 하므로,
-- kakao-collect/-classify/-alert 와 달리 값 자체를 사람이 한 번은 봐야 한다.
insert into public.kakao_partner_secrets(key, value, updated_at)
values ('kakao_status_token', encode(gen_random_bytes(24), 'hex'), now())
on conflict (key) do nothing;

-- 점검: select kakao_status_summary();
--       select value from kakao_partner_secrets where key = 'kakao_status_token';

-- 일일 요약 정지 원인 수정: kakao_status_summary 의 감정분석 카운트를 최근 30일로 한정 (2026-07-15)
--
-- 문제(실측): 백필로 kakao_partner_messages 가 110만 행으로 늘자, 전체 누적 카운트 2개
-- (sender_type='user' 전체 / sentiment 완료 전체)가 60초를 넘겨 kakao_status_summary 가
-- 8초 statement_timeout 에 걸림 → kakao-daily-summary 가 매일 09시 500으로 실패
-- → 일일 요약 슬랙 발송·스냅샷 저장이 7/9 이후 전부 중단.
--
-- 수정: 감정분석 done/total 을 "최근 30일" 범위로 한정(부분 인덱스 kakao_msg_user_idx ·
-- kakao_msg_sentiment_trend_idx 의 sent_at 범위 스캔 → 0.1초 미만 실측). 운영 지표로도
-- 30일 커버리지가 전체 역사 누적보다 유의미. sentiment.window_days 로 범위를 명시한다.
create or replace function public.kakao_status_summary()
returns jsonb
language sql
stable
set search_path to ''
as $$
  select jsonb_build_object(
    'channels', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'channel', h.channel_label, 'health', h.health, 'health_reason', h.health_reason,
        'hrs_since_msg', h.hrs_since_msg, 'hb_age_min', h.hb_age_min,
        'avg_per_day', h.avg_per_day, 'gap_threshold_h', h.gap_threshold_h
      )), '[]'::jsonb)
      from public.kakao_collection_health() h
    ),
    'classify', jsonb_build_object(
      'unclassified', (select count(*) from public.kakao_partner_chats where category is null),
      'review_queue', (select count(*) from public.kakao_partner_chats
                          where category_confidence = 0.30 and category_model = 'rule')
    ),
    'sentiment', jsonb_build_object(
      'window_days', 30,
      'done', (select count(*) from public.kakao_partner_messages
                 where sender_type = 'user' and sentiment is not null
                   and sent_at >= now() - interval '30 days'),
      'total_user_msgs', (select count(*) from public.kakao_partner_messages
                            where sender_type = 'user'
                              and sent_at >= now() - interval '30 days')
    ),
    'active_alerts', (
      select coalesce(jsonb_agg(alert_key), '[]'::jsonb)
      from public.kakao_partner_alert_state where status = 'alerting'
    ),
    'generated_at', now()
  );
$$;

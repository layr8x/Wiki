-- 20260708_kakao_sentiment_trend_window_optimize.sql
-- kakao_sentiment_trend: agg CTE 가 전체 기간(감정 라벨 전건)을 훑어 18.8초 → 8초 초과로
-- daily-summary 를 statement timeout 으로 실패시켰다. FILTER 가 이미 14일 이내만 집계하므로
-- WHERE 에 14일 창을 추가해 스캔 자체를 줄인다(출력 동일). 인덱스 kakao_msg_sentiment_trend_idx 와 함께 사용.
-- 결과(실측): 18.8s → 1.6s.
CREATE OR REPLACE FUNCTION public.kakao_sentiment_trend(min_samples integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with ch as (
    select pid, label from public.kakao_channel
  ),
  agg as (
    select profile_id,
      count(*) filter (where sent_at >= now() - interval '7 days') as cur_total,
      count(*) filter (where sent_at >= now() - interval '7 days' and sentiment = 'negative') as cur_neg,
      count(*) filter (where sent_at >= now() - interval '14 days' and sent_at < now() - interval '7 days') as prev_total,
      count(*) filter (where sent_at >= now() - interval '14 days' and sent_at < now() - interval '7 days' and sentiment = 'negative') as prev_neg
    from public.kakao_partner_messages
    where sender_type = 'user' and sentiment is not null
      and sent_at >= now() - interval '14 days'
    group by profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'channel', ch.label,
    'cur_total', coalesce(a.cur_total, 0),
    'cur_neg', coalesce(a.cur_neg, 0),
    'cur_rate', case when coalesce(a.cur_total, 0) > 0 then round(100.0 * a.cur_neg / a.cur_total) else 0 end,
    'prev_total', coalesce(a.prev_total, 0),
    'prev_neg', coalesce(a.prev_neg, 0),
    'prev_rate', case when coalesce(a.prev_total, 0) > 0 then round(100.0 * a.prev_neg / a.prev_total) else 0 end,
    'worsening', (
      coalesce(a.cur_total, 0) >= min_samples and coalesce(a.prev_total, 0) >= min_samples
      and (100.0 * a.cur_neg / a.cur_total - 100.0 * a.prev_neg / nullif(a.prev_total, 0)) >= 5
      and (100.0 * a.cur_neg / a.cur_total) >= 5
    )
  ) order by coalesce(a.cur_total, 0) desc), '[]'::jsonb)
  from ch left join agg a on a.profile_id = ch.pid;
$function$;

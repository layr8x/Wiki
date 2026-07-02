-- 20260703_kakao_sentiment_trend.sql
-- 일일 요약 고도화 2차 (D): 감정 악화 조기경보용 RPC.
--
-- 배경: 채널별 부정 감정 "비율"은 이미 보이지만, 그 비율이 "지난주 대비 나빠지고 있는지"는
-- 없었다. 불만은 어느 순간 임계를 넘기 전에 완만히 쌓이므로, 주간 변화(악화)를 조기에 잡는다.
--
-- 정제 기준(오경보 방지):
--   * 표본 게이트: 이번주·지난주 각각 min_samples(기본 30) 이상 감정 스코어가 있어야 비교.
--     (감정 커버리지가 아직 낮아, 표본이 적으면 비율이 요동쳐 오경보가 난다.)
--   * 악화 판정(worsening=true): 위 게이트 통과 + 이번주 부정률 - 지난주 부정률 >= 5%p 상승
--     + 이번주 부정률 자체가 5% 이상(사소한 0->저율 상승은 무시).
--   * 참고: LLM 분류(ANTHROPIC_API_KEY) 활성화 시 감정 커버리지가 올라가 이 신호가 더 정확해진다.
create or replace function public.kakao_sentiment_trend(min_samples int default 30)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with ch as (
    select unnest(array['_VGAQn', '_TkpPG', '_xfxilXn']) as pid,
           unnest(array['마이클래스', '라이브', '시대인재C']) as label
  ),
  agg as (
    select profile_id,
      count(*) filter (where sent_at >= now() - interval '7 days') as cur_total,
      count(*) filter (where sent_at >= now() - interval '7 days' and sentiment = 'negative') as cur_neg,
      count(*) filter (where sent_at >= now() - interval '14 days' and sent_at < now() - interval '7 days') as prev_total,
      count(*) filter (where sent_at >= now() - interval '14 days' and sent_at < now() - interval '7 days' and sentiment = 'negative') as prev_neg
    from public.kakao_partner_messages
    where sender_type = 'user' and sentiment is not null
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
$$;

grant execute on function public.kakao_sentiment_trend(int) to anon, authenticated;

-- 점검: select jsonb_pretty(kakao_sentiment_trend(30));

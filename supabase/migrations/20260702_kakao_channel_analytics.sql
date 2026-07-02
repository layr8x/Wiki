-- 20260702_kakao_channel_analytics.sql
-- 이상탐지·일일요약 알림을 "채널별 + 원인별 + 진단 가능"하게 고도화.
--
-- 배경: 초기 알림(20260702_kakao_alert_pipeline.sql)은 세 가지 한계가 있었다.
--   ① 원인 오진: 라이브 채널은 30일 평균 하루 0.8건인데(저트래픽), 6시간 무메시지 고정
--      임계로는 "정상 상태"를 "수집 중단"으로 오판하고 "쿠키 재발급"을 잘못 권고했다.
--   ② 채널 미구분: "환불 급증"만 알리고 어느 채널(실측상 시대인재C 집중)인지 못 짚었다.
--   ③ 진단 불가: 원인·해결을 유추할 맥락(채널 분포·평소 대비·지속 시간)이 없었다.
-- 이 마이그레이션은 위 셋을 데이터로 해결한다:
--   - 헬스 임계를 "채널별 평소 유입 간격 상대값"으로(저트래픽 채널 오탐 제거) + 원인 태그.
--   - 급증 알림에 채널 분해(어느 채널에 몰렸는지) 추가.
--   - 채널별 최근 문의 Top·감정·평소대비를 반환하는 kakao_channel_analysis 신설.
--
-- 의존 순서상 status_summary → collection_health 를 먼저 DROP 후 재생성(반환 컬럼 변경).

drop function if exists public.kakao_status_summary();
drop function if exists public.kakao_collection_health();
drop function if exists public.kakao_category_spike(numeric, int);

-- ─── 1) 채널 인식 수집 헬스 ───────────────────────────────────────────────
-- gap_threshold_h = 그 채널 평소 유입 간격(24/일평균)의 3배, 하한 6h·상한 72h.
--   → 시대인재C(하루 11.4건)≈6h, 마이클래스(5.4건)≈13h, 라이브(0.8건)≈72h.
-- health_reason: auth(쿠키 만료) / heartbeat(수집기 지연) / gap(유입 없음) / ok.
--   원인이 명확히 갈려 알림에서 정확한 조치를 안내할 수 있다.
create or replace function public.kakao_collection_health()
returns table(
  profile_id text, channel_label text, hb_age_min numeric, last_error text,
  hrs_since_msg numeric, avg_per_day numeric, gap_threshold_h numeric,
  health text, health_reason text
)
language sql stable security invoker set search_path = '' as $$
  with act as (
    select s.profile_id,
      case s.profile_id when '_xfxilXn' then '시대인재C' when '_TkpPG' then '라이브'
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
      when extract(epoch from (now() - last_msg_at)) / 3600.0 > gap_threshold_h then 'warning'
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
$$;

-- ─── 2) 채널 분해가 포함된 카테고리 급증 ─────────────────────────────────
-- 오늘 급증한 카테고리마다, 그게 어느 채널에 몰렸는지 channel_breakdown 으로 반환.
create or replace function public.kakao_category_spike(min_ratio numeric default 2.0, min_count int default 5)
returns table(d date, category text, cnt bigint, baseline_7d numeric, ratio numeric, channel_breakdown jsonb)
language sql stable security invoker set search_path = '' as $$
  with daily as (
    select date_trunc('day', c.last_log_send_at)::date as d, c.category, count(*) as cnt
    from public.kakao_partner_chats c where c.category is not null group by 1, 2
  ),
  roll as (
    select d, category, cnt,
      avg(cnt) over (partition by category order by d rows between 7 preceding and 1 preceding) as baseline_7d
    from daily
  ),
  spikes as (
    select d, category, cnt, round(baseline_7d, 1) as baseline_7d, round(cnt / nullif(baseline_7d, 0), 2) as ratio
    from roll
    where baseline_7d is not null and cnt >= min_count and cnt > baseline_7d * min_ratio and d = current_date
  )
  select s.d, s.category, s.cnt, s.baseline_7d, s.ratio,
    (select coalesce(jsonb_agg(jsonb_build_object('channel', cl, 'cnt', ccnt) order by ccnt desc), '[]'::jsonb)
     from (
       select case c.profile_id when '_xfxilXn' then '시대인재C' when '_TkpPG' then '라이브'
                                when '_VGAQn' then '마이클래스' else c.profile_id end as cl,
              count(*) as ccnt
       from public.kakao_partner_chats c
       where c.category = s.category and date_trunc('day', c.last_log_send_at)::date = current_date
       group by 1
     ) t) as channel_breakdown
  from spikes s
  order by s.ratio desc;
$$;

-- ─── 3) 채널별 분석(일일 요약의 '채널별 구분' 섹션용) ────────────────────
-- 채널마다: 최근 window_days 문의 Top3 카테고리 + 감정(긍/중/부) + 30일 평소 일평균.
-- 24시간은 채널당 표본이 너무 작아(라이브 하루 1건 미만) window_days 기본 7로 둔다.
create or replace function public.kakao_channel_analysis(window_days int default 7)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with ch as (
    select unnest(array['_VGAQn', '_TkpPG', '_xfxilXn']) as pid,
           unnest(array['마이클래스', '라이브', '시대인재C']) as label
  ),
  ranked as (
    select c.profile_id, c.category, count(*) as cnt,
      row_number() over (partition by c.profile_id order by count(*) desc) as rn
    from public.kakao_partner_chats c
    where c.category is not null and c.last_log_send_at >= now() - (window_days || ' days')::interval
    group by c.profile_id, c.category
  ),
  cat as (
    select profile_id,
      jsonb_agg(jsonb_build_object('category', category, 'cnt', cnt) order by cnt desc) filter (where rn <= 3) as top3,
      sum(cnt) as total
    from ranked group by profile_id
  ),
  sen as (
    select m.profile_id,
      count(*) filter (where m.sentiment = 'positive') as pos,
      count(*) filter (where m.sentiment = 'neutral') as neu,
      count(*) filter (where m.sentiment = 'negative') as neg,
      count(*) as total
    from public.kakao_partner_messages m
    where m.sentiment is not null and m.sent_at >= now() - (window_days || ' days')::interval
    group by m.profile_id
  ),
  base as (
    select c.profile_id, round(count(*) / 30.0, 1) as avg_per_day_30d
    from public.kakao_partner_chats c
    where c.last_log_send_at >= now() - interval '30 days'
    group by c.profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'channel', ch.label,
    'chats', coalesce(cat.total, 0),
    'top_categories', coalesce(cat.top3, '[]'::jsonb),
    'sentiment', jsonb_build_object('pos', coalesce(sen.pos, 0), 'neu', coalesce(sen.neu, 0),
                                    'neg', coalesce(sen.neg, 0), 'total', coalesce(sen.total, 0)),
    'avg_per_day_30d', coalesce(base.avg_per_day_30d, 0)
  ) order by coalesce(cat.total, 0) desc), '[]'::jsonb)
  from ch
  left join cat on cat.profile_id = ch.pid
  left join sen on sen.profile_id = ch.pid
  left join base on base.profile_id = ch.pid;
$$;

-- ─── 4) 상태 요약(변경 없음, health 재생성 뒤 재생성만) ──────────────────
create or replace function public.kakao_status_summary()
returns jsonb
language sql stable security invoker set search_path = '' as $$
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
      'done', (select count(*) from public.kakao_partner_messages where sender_type = 'user' and sentiment is not null),
      'total_user_msgs', (select count(*) from public.kakao_partner_messages where sender_type = 'user')
    ),
    'active_alerts', (
      select coalesce(jsonb_agg(alert_key), '[]'::jsonb)
      from public.kakao_partner_alert_state where status = 'alerting'
    ),
    'generated_at', now()
  );
$$;

grant execute on function public.kakao_collection_health() to anon, authenticated;
grant execute on function public.kakao_category_spike(numeric, int) to anon, authenticated;
grant execute on function public.kakao_channel_analysis(int) to anon, authenticated;
grant execute on function public.kakao_status_summary() to anon, authenticated;

-- 점검:
--   select * from kakao_collection_health();
--   select * from kakao_category_spike();
--   select jsonb_pretty(kakao_channel_analysis(7));

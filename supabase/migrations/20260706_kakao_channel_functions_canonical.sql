-- 20260706_kakao_channel_functions_canonical.sql
-- 5채널 정본 테이블(public.kakao_channel, 20260703_kakao_channel_canonical.sql)을 실제로
-- join 하도록 분석 RPC 8개를 재정의한다.
--
-- 배경: 20260703_kakao_channel_canonical.sql 은 정본 테이블만 만들고, 주석에 "각 함수를
-- 이 테이블 기준으로 재정의했다"고만 적어뒀을 뿐 실제 재정의 SQL은 커밋되지 않았다(§16/§17
-- 점검에서 발견). 운영 DB에는 누군가 직접 SQL을 실행해 이미 5채널로 고쳐져 있었지만, 그
-- 변경분이 마이그레이션 파일로 캡처되지 않아 저장소만 옛 3채널(_VGAQn/_TkpPG/_xfxilXn ↔
-- 마이클래스/라이브/시대인재C) 하드코딩 배열·CASE문을 그대로 갖고 있었다. 이 상태로 DB를
-- 재구축(재해복구·새 브랜치·`supabase db reset`)하면 LIVE(_rcpPG)·통합로그인(_rkbcn)이 조용히
-- 다시 빠진다. 이 마이그레이션은 그 실사용 정의를 저장소에 캡처(commit)한다.
--
-- 아래 각 함수는 최신(가장 나중에 적용되는) 정의를 그대로 가져오되, 하드코딩 배열/CASE 만
-- `public.kakao_channel` 테이블 참조로 교체했다. 그 외 로직은 원본과 동일.
--
-- 미포함(의도적, 별도 개편 예정): kakao_hourly_inflow 는 채널별 고정 컬럼(cnt_my/cnt_live/cnt_sdc)
--   구조라 5채널 확장 시 반환 스키마 자체가 바뀌어야 함 — 이번 캡처 범위 밖(기존 계획대로 보류).

-- ─── kakao_sla_status (최종 정의: 20260703_kakao_waiting_precision.sql) ───
create or replace function public.kakao_sla_status()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with ch as (select pid, label from public.kakao_channel),
  active as (select distinct chat_id from public.kakao_partner_chats where last_log_send_at >= now() - interval '7 days'),
  last_msg as (
    select distinct on (m.chat_id) m.chat_id, m.profile_id, m.sender_type, m.sent_at, m.message
    from public.kakao_partner_messages m
    where m.chat_id in (select chat_id from active)
    order by m.chat_id, m.sent_at desc
  ),
  waiting as (
    select profile_id,
      count(*) filter (where sender_type = 'user' and not public.kakao_is_closing(message)) as waiting,
      round(max(public.kakao_business_minutes(sent_at, now())) filter (where sender_type = 'user' and not public.kakao_is_closing(message)) / 60.0, 1) as oldest_wait_h
    from last_msg group by profile_id
  ),
  frt as (
    select profile_id,
      round(percentile_cont(0.5) within group (order by bmin)) as median_frt_min,
      count(*) as answered
    from (
      select t.profile_id, public.kakao_business_minutes(t.fu, t.fm) as bmin
      from (
        select m.chat_id, m.profile_id,
          min(m.sent_at) filter (where m.sender_type = 'user') fu,
          min(m.sent_at) filter (where m.sender_type = 'manager') fm
        from public.kakao_partner_messages m
        where m.sent_at >= now() - interval '7 days'
        group by m.chat_id, m.profile_id
      ) t
      where t.fu is not null and t.fm is not null and t.fm > t.fu and (t.fm - t.fu) < interval '14 days'
    ) z group by profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'channel', ch.label, 'waiting', coalesce(w.waiting, 0),
    'oldest_wait_h', coalesce(w.oldest_wait_h, 0),
    'median_first_response_min', coalesce(f.median_frt_min, 0),
    'answered_n', coalesce(f.answered, 0)
  ) order by coalesce(w.waiting, 0) desc), '[]'::jsonb)
  from ch left join waiting w on w.profile_id = ch.pid left join frt f on f.profile_id = ch.pid;
$$;

-- ─── kakao_action_chats (최종 정의: 20260703_kakao_waiting_precision.sql) ───
create or replace function public.kakao_action_chats(limit_n int default 6)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with ch as (select pid, label from public.kakao_channel),
  active as (select distinct chat_id from public.kakao_partner_chats where last_log_send_at >= now() - interval '7 days'),
  last_msg as (
    select distinct on (m.chat_id) m.chat_id, m.profile_id, m.sender_type, m.sent_at, m.message
    from public.kakao_partner_messages m
    where m.chat_id in (select chat_id from active)
    order by m.chat_id, m.sent_at desc
  ),
  pending as (
    select lm.chat_id, lm.profile_id, lm.sent_at, lm.message
    from last_msg lm
    where lm.sender_type = 'user' and not public.kakao_is_closing(lm.message)
  )
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
    select (select label from ch where ch.pid = p.profile_id) as channel,
      (select nickname from public.kakao_partner_chats c where c.chat_id = p.chat_id limit 1) as nickname,
      round(public.kakao_business_minutes(p.sent_at, now()) / 60.0, 1) as waited_h,
      left(regexp_replace(coalesce(p.message, ''), '\s+', ' ', 'g'), 42) as preview
    from pending p
    order by public.kakao_business_minutes(p.sent_at, now()) desc
    limit limit_n
  ) x;
$$;

-- ─── kakao_sla_attainment (최종 정의: 20260703_kakao_sla_business_hours.sql) ───
create or replace function public.kakao_sla_attainment(days int default 7)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with ch as (select pid, label from public.kakao_channel),
  frt as (
    select m.chat_id, m.profile_id,
      min(m.sent_at) filter (where m.sender_type = 'user') fu,
      min(m.sent_at) filter (where m.sender_type = 'manager') fm
    from public.kakao_partner_messages m
    where m.sent_at >= now() - make_interval(days => days)
    group by m.chat_id, m.profile_id
  ),
  d as (
    select profile_id, public.kakao_business_minutes(fu, fm) as mins
    from frt where fu is not null and fm is not null and fm > fu and (fm - fu) < interval '14 days'
  ),
  a as (
    select profile_id, count(*) answered,
      round(100.0 * count(*) filter (where mins <= 30) / count(*)) within_30,
      round(100.0 * count(*) filter (where mins <= 60) / count(*)) within_60,
      count(*) filter (where mins > 120) over_2h
    from d group by profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'channel', ch.label, 'answered', coalesce(a.answered, 0),
    'within_30', coalesce(a.within_30, 0), 'within_60', coalesce(a.within_60, 0),
    'over_2h', coalesce(a.over_2h, 0)
  ) order by coalesce(a.answered, 0) desc), '[]'::jsonb)
  from ch left join a on a.profile_id = ch.pid;
$$;

-- ─── kakao_weekly_trend (최종 정의: 20260703_kakao_sla_trend.sql) ───
create or replace function public.kakao_weekly_trend(min_count int default 3)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with ch as (select pid, label from public.kakao_channel),
  cur as (
    select profile_id, category, count(*) as c from public.kakao_partner_chats
    where last_log_send_at >= now() - interval '7 days' and category is not null and category <> '기타'
    group by 1, 2
  ),
  prev as (
    select profile_id, category, count(*) as c from public.kakao_partner_chats
    where last_log_send_at >= now() - interval '14 days' and last_log_send_at < now() - interval '7 days'
      and category is not null and category <> '기타'
    group by 1, 2
  ),
  joined as (
    select coalesce(cur.profile_id, prev.profile_id) as pid,
           coalesce(cur.category, prev.category) as category,
           coalesce(cur.c, 0) as cur_c, coalesce(prev.c, 0) as prev_c
    from cur full join prev on cur.profile_id = prev.profile_id and cur.category = prev.category
  ),
  rising as (
    select pid, category, cur_c, prev_c, (cur_c - prev_c) as delta,
      row_number() over (partition by pid order by (cur_c - prev_c) desc) as rn
    from joined
    where cur_c >= min_count and cur_c > prev_c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'channel', ch.label,
    'rising', coalesce((
      select jsonb_agg(jsonb_build_object('category', r.category, 'cur', r.cur_c, 'prev', r.prev_c, 'delta', r.delta) order by r.delta desc)
      from rising r where r.pid = ch.pid and r.rn <= 2), '[]'::jsonb)
  )), '[]'::jsonb)
  from ch;
$$;

-- ─── kakao_sentiment_trend (최종 정의: 20260703_kakao_sentiment_trend.sql) ───
create or replace function public.kakao_sentiment_trend(min_samples int default 30)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with ch as (select pid, label from public.kakao_channel),
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

-- ─── kakao_channel_analysis (최종 정의: 20260702_kakao_channel_analytics.sql) ───
create or replace function public.kakao_channel_analysis(window_days int default 7)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with ch as (select pid, label from public.kakao_channel),
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

-- ─── kakao_insights (최종 정의: 20260703_kakao_insights_bundle.sql) ───
create or replace function public.kakao_insights()
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'quality', jsonb_build_object(
      'total_chats', (select count(*) from public.kakao_partner_chats),
      'etc_cnt', (select count(*) from public.kakao_partner_chats where category = '기타'),
      'etc_pct', (select round(100.0 * count(*) filter (where category = '기타') / nullif(count(*), 0), 1)
                  from public.kakao_partner_chats where category is not null),
      'unclassified', (select count(*) from public.kakao_partner_chats where category is null),
      'mock_cnt', (select count(*) from public.kakao_partner_chats where category = '모의고사·서바이벌'),
      'sent_total', (select count(*) from public.kakao_partner_messages where sender_type = 'user' and message is not null),
      'sent_done', (select count(*) from public.kakao_partner_messages where sender_type = 'user' and sentiment is not null),
      'sent_neg_pct', (select round(100.0 * count(*) filter (where sentiment = 'negative')
                       / nullif(count(*) filter (where sentiment is not null), 0), 1)
                       from public.kakao_partner_messages where sender_type = 'user')
    ),
    'top_categories', (select jsonb_agg(jsonb_build_object('category', category, 'cnt', c) order by c desc)
      from (select category, count(*) c from public.kakao_partner_chats
            where last_log_send_at >= now() - interval '30 days' and category is not null
            group by category order by count(*) desc limit 7) x),
    'topic_pain', public.kakao_topic_pain(14),
    'sla', public.kakao_sla_attainment(7),
    'sla_status', public.kakao_sla_status(),
    'weekly', public.kakao_weekly_trend(3),
    'hourly', public.kakao_hourly_inflow(14),
    'channels', public.kakao_channel_analysis(7),
    'unanswered', (
      select coalesce(jsonb_build_object('total', sum(cnt), 'by_channel', jsonb_object_agg(label, cnt)),
                      jsonb_build_object('total', 0, 'by_channel', '{}'::jsonb))
      from (
        select cl.label, count(*) cnt
        from public.kakao_partner_chats c
        join public.kakao_channel cl on cl.pid = c.profile_id
        where c.last_log_send_at >= now() - interval '30 days'
          and exists(select 1 from public.kakao_partner_messages m where m.chat_id = c.chat_id and m.sender_type = 'user')
          and not exists(select 1 from public.kakao_partner_messages m where m.chat_id = c.chat_id and m.sender_type = 'manager')
        group by cl.label
      ) u
    )
  );
$$;

-- ─── kakao_collection_health (최종 정의: 20260702_kakao_channel_analytics.sql) ───
create or replace function public.kakao_collection_health()
returns table(
  profile_id text, channel_label text, hb_age_min numeric, last_error text,
  hrs_since_msg numeric, avg_per_day numeric, gap_threshold_h numeric,
  health text, health_reason text
)
language sql stable security invoker set search_path = '' as $$
  with act as (
    select s.profile_id,
      coalesce(kc.label, s.profile_id) as channel_label,
      s.last_heartbeat_at, s.last_error, s.last_error_at,
      (select max(m.sent_at) from public.kakao_partner_messages m where m.profile_id = s.profile_id) as last_msg_at,
      (select count(*) from public.kakao_partner_chats c
         where c.profile_id = s.profile_id and c.last_log_send_at >= now() - interval '30 days') as chats_30d
    from public.kakao_partner_stream_state s
    left join public.kakao_channel kc on kc.pid = s.profile_id
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

-- ─── kakao_category_spike (최종 정의: 20260702_kakao_channel_analytics.sql) ───
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
       select coalesce(kc.label, c.profile_id) as cl,
              count(*) as ccnt
       from public.kakao_partner_chats c
       left join public.kakao_channel kc on kc.pid = c.profile_id
       where c.category = s.category and date_trunc('day', c.last_log_send_at)::date = current_date
       group by 1
     ) t) as channel_breakdown
  from spikes s
  order by s.ratio desc;
$$;

grant execute on function public.kakao_sla_status() to anon, authenticated;
grant execute on function public.kakao_action_chats(int) to anon, authenticated;
grant execute on function public.kakao_sla_attainment(int) to anon, authenticated;
grant execute on function public.kakao_weekly_trend(int) to anon, authenticated;
grant execute on function public.kakao_sentiment_trend(int) to anon, authenticated;
grant execute on function public.kakao_channel_analysis(int) to anon, authenticated;
grant execute on function public.kakao_insights() to anon, authenticated;
grant execute on function public.kakao_collection_health() to anon, authenticated;
grant execute on function public.kakao_category_spike(numeric, int) to anon, authenticated;

-- ─── mask_text 멱등성 보수(부가 발견, PII 점검) ───
-- 이름 문자셋에 '*' 를 포함해야 이미 마스킹된 값(예: 홍*동)에 재실행해도 안전(멱등)하다.
-- (핵심 로직 src/lib/maskPII.js 의 LABEL_NAME_RE 는 [가-힣*]{1,4} — 이 함수만 '*' 누락돼 있었음.)
-- 그 외 치환 방식(통짜 [이름] vs 부분마스킹)·단독줄 이름 처리 여부는 현재 미사용 보조 함수라
-- 이번엔 손대지 않음(확인 필요 항목으로 별도 보고).
create or replace function public.mask_text(p text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case when p is null then null else
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
      p,
      '\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}', '[카드번호]', 'g'),
      '\d{6}[-\s]?[1-4]\d{6}', '[주민번호]', 'g'),
      '[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})', '***@\1', 'g'),
      '(01[016-9])[-.\s]?(\d{3,4})[-.\s]?(\d{4})', '\1-****-\3', 'g'),
      '(0\d{1,3})[-.\s](\d{3,4})[-.\s](\d{4})', '\1-****-\3', 'g'),
      '(회원명|가입자명|학생명|학생이름|학부모명|학부모이름|보호자명|자녀명|성함|이름)(\s*[:：]\s*)([가-힣*]{1,4})', '\1\2[이름]', 'g')
  end
$$;

-- 점검:
--   select jsonb_pretty(kakao_sla_status()); select jsonb_pretty(kakao_action_chats());
--   select jsonb_pretty(kakao_sla_attainment()); select jsonb_pretty(kakao_weekly_trend());
--   select jsonb_pretty(kakao_sentiment_trend()); select jsonb_pretty(kakao_channel_analysis());
--   select jsonb_pretty(kakao_insights()); select * from kakao_collection_health();
--   select * from kakao_category_spike();

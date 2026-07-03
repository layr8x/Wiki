-- 20260703_kakao_sla_business_hours.sql
-- 응답 시간 지표를 "영업 분"(kakao_business_minutes, 평일 09~19시 KST) 기준으로 재정의.
-- kakao_sla_status · kakao_sla_attainment · kakao_topic_pain 의 첫 응답/대기 시간을 교체.
-- (야간·주말 대기 제외로, 마이클래스 135분→6분처럼 실제 서비스 지연만 남는다.)

create or replace function public.kakao_sla_status()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with ch as (select unnest(array['_VGAQn','_TkpPG','_xfxilXn']) pid, unnest(array['마이클래스','라이브','시대인재C']) label),
  active as (select distinct chat_id from public.kakao_partner_messages where sent_at >= now() - interval '48 hours'),
  last_msg as (
    select distinct on (m.chat_id) m.chat_id, m.profile_id, m.sender_type, m.sent_at
    from public.kakao_partner_messages m
    where m.chat_id in (select chat_id from active)
    order by m.chat_id, m.sent_at desc
  ),
  waiting as (
    select profile_id,
      count(*) filter (where sender_type = 'user') as waiting,
      round(max(public.kakao_business_minutes(sent_at, now())) filter (where sender_type = 'user') / 60.0, 1) as oldest_wait_h
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

create or replace function public.kakao_sla_attainment(days int default 7)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with ch as (select unnest(array['_VGAQn','_TkpPG','_xfxilXn']) pid, unnest(array['마이클래스','라이브','시대인재C']) label),
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

create or replace function public.kakao_topic_pain(days int default 14)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with rc as (
    select chat_id, category from public.kakao_partner_chats
    where last_log_send_at >= now() - make_interval(days => days) and category is not null and category <> '기타'
  ),
  frt as (
    select m.chat_id,
      min(m.sent_at) filter (where m.sender_type = 'user') fu,
      min(m.sent_at) filter (where m.sender_type = 'manager') fm
    from public.kakao_partner_messages m
    where m.chat_id in (select chat_id from rc) group by m.chat_id
  ),
  per as (
    select rc.category, public.kakao_business_minutes(frt.fu, frt.fm) as mins
    from rc join frt on frt.chat_id = rc.chat_id
    where frt.fu is not null and frt.fm is not null and frt.fm > frt.fu and (frt.fm - frt.fu) < interval '14 days'
  ),
  negc as (
    select rc.category,
      count(*) filter (where m.sentiment is not null) scored,
      count(*) filter (where m.sentiment = 'negative') neg
    from rc join public.kakao_partner_messages m on m.chat_id = rc.chat_id and m.sender_type = 'user'
    group by rc.category
  ),
  agg as (
    select rc.category, count(distinct rc.chat_id) chats,
      (select round(percentile_cont(0.5) within group (order by p.mins)) from per p where p.category = rc.category) median_frt_min,
      coalesce((select round(100.0 * n.neg / nullif(n.scored, 0)) from negc n where n.category = rc.category), 0) neg_rate
    from rc group by rc.category
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'category', category, 'chats', chats, 'median_frt_min', coalesce(median_frt_min, 0), 'neg_rate', neg_rate
  ) order by chats desc), '[]'::jsonb) from agg;
$$;

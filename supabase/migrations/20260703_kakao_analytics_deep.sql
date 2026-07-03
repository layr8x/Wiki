-- 20260703_kakao_analytics_deep.sql
-- 고도화 3차: 심화 분석 RPC 3종. 일일 Slack(간결 유지)을 넘어, 드릴다운 대시보드·주간 리포트가
-- 쓸 "깊은 데이터"를 제공한다. 모두 읽기 전용 집계이며 파이프라인 동작에는 영향 없음.

-- ─── (1) 카테고리 페인 매트릭스: 어느 문의가 느리고/부정적인가 ───
-- 채널 무관 카테고리별: 건수 · 첫 응답 중앙값(분) · 부정 감정률(%).
-- 목적: "환불은 많은데 첫 응답이 제일 느리다" 같은 개선 우선순위를 한눈에.
create or replace function public.kakao_topic_pain(days int default 14)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with rc as (
    select chat_id, category from public.kakao_partner_chats
    where last_log_send_at >= now() - make_interval(days => days)
      and category is not null and category <> '기타'
  ),
  frt as (
    select m.chat_id,
      min(m.sent_at) filter (where m.sender_type = 'user') as fu,
      min(m.sent_at) filter (where m.sender_type = 'manager') as fm
    from public.kakao_partner_messages m
    where m.chat_id in (select chat_id from rc)
    group by m.chat_id
  ),
  per as (
    select rc.category, extract(epoch from (frt.fm - frt.fu)) / 60.0 as mins
    from rc join frt on frt.chat_id = rc.chat_id
    where frt.fu is not null and frt.fm is not null and frt.fm > frt.fu and (frt.fm - frt.fu) < interval '48 hours'
  ),
  negc as (
    select rc.category,
      count(*) filter (where m.sentiment is not null) as scored,
      count(*) filter (where m.sentiment = 'negative') as neg
    from rc join public.kakao_partner_messages m on m.chat_id = rc.chat_id and m.sender_type = 'user'
    group by rc.category
  ),
  agg as (
    select rc.category,
      count(distinct rc.chat_id) as chats,
      (select round(percentile_cont(0.5) within group (order by p.mins)) from per p where p.category = rc.category) as median_frt_min,
      coalesce((select round(100.0 * n.neg / nullif(n.scored, 0)) from negc n where n.category = rc.category), 0) as neg_rate
    from rc group by rc.category
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'category', category, 'chats', chats,
    'median_frt_min', coalesce(median_frt_min, 0), 'neg_rate', neg_rate
  ) order by chats desc), '[]'::jsonb) from agg;
$$;

-- ─── (2) 응답 SLA 달성률: 30분/60분 내 첫 응답 비율 ───
-- 채널별: 답변 건수 · 30분 내 % · 60분 내 % · 2시간 초과 건수.
-- 목적: 중앙값 하나가 아니라 "목표(30분) 대비 얼마나 지키는가"를 KPI로.
create or replace function public.kakao_sla_attainment(days int default 7)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with ch as (
    select unnest(array['_VGAQn', '_TkpPG', '_xfxilXn']) as pid,
           unnest(array['마이클래스', '라이브', '시대인재C']) as label
  ),
  frt as (
    select m.chat_id, m.profile_id,
      min(m.sent_at) filter (where m.sender_type = 'user') as fu,
      min(m.sent_at) filter (where m.sender_type = 'manager') as fm
    from public.kakao_partner_messages m
    where m.sent_at >= now() - make_interval(days => days)
    group by m.chat_id, m.profile_id
  ),
  d as (
    select profile_id, extract(epoch from (fm - fu)) / 60.0 as mins
    from frt
    where fu is not null and fm is not null and fm > fu and (fm - fu) < interval '48 hours'
  ),
  a as (
    select profile_id,
      count(*) as answered,
      round(100.0 * count(*) filter (where mins <= 30) / count(*)) as within_30,
      round(100.0 * count(*) filter (where mins <= 60) / count(*)) as within_60,
      count(*) filter (where mins > 120) as over_2h
    from d group by profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'channel', ch.label,
    'answered', coalesce(a.answered, 0),
    'within_30', coalesce(a.within_30, 0),
    'within_60', coalesce(a.within_60, 0),
    'over_2h', coalesce(a.over_2h, 0)
  ) order by coalesce(a.answered, 0) desc), '[]'::jsonb)
  from ch left join a on a.profile_id = ch.pid;
$$;

-- ─── (3) 시간대 유입 패턴: 상담 인력 배치 근거 ───
-- KST 시각(0~23) × 채널 고객 메시지 수. 목적: 피크 시간대에 상담 인력 집중.
create or replace function public.kakao_hourly_inflow(days int default 14)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with base as (
    select extract(hour from (m.sent_at at time zone 'Asia/Seoul'))::int as hr,
           m.profile_id
    from public.kakao_partner_messages m
    where m.sender_type = 'user' and m.sent_at >= now() - make_interval(days => days)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'hr', hr,
    'my', cnt_my, 'live', cnt_live, 'sdc', cnt_sdc, 'total', cnt_my + cnt_live + cnt_sdc
  ) order by hr), '[]'::jsonb)
  from (
    select hr,
      count(*) filter (where profile_id = '_VGAQn') as cnt_my,
      count(*) filter (where profile_id = '_TkpPG') as cnt_live,
      count(*) filter (where profile_id = '_xfxilXn') as cnt_sdc
    from base group by hr
  ) z;
$$;

grant execute on function public.kakao_topic_pain(int) to anon, authenticated;
grant execute on function public.kakao_sla_attainment(int) to anon, authenticated;
grant execute on function public.kakao_hourly_inflow(int) to anon, authenticated;

-- 점검: select jsonb_pretty(kakao_topic_pain(14)); select jsonb_pretty(kakao_sla_attainment(7)); select jsonb_pretty(kakao_hourly_inflow(14));

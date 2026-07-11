-- 20260711_kakao_topic_pain_avoid_repeated_subquery.sql
-- 목적: public.kakao_topic_pain() 이 27초까지 걸려(오늘 고친 kakao_sla_status 의 20초보다 더 나쁨),
--   kakao_insights() 번들에 묶여 kakao-insights Slack "심화 분석" 리포트가 사실상 동작 불가 상태였다.
--
-- 원인: agg CTE 안에서 median_frt_min·neg_rate 를 "카테고리마다" 상관 서브쿼리
--   (select ... from per p where p.category = rc.category) 로 구했는데, per 자체가
--   1,376개 대화 전체의 첫 응답시간을 계산하는 무거운 CTE(kakao_partner_messages 를
--   chat_id IN (...) 로 훑어 대화당 ~40건씩 가져옴)라서, 카테고리 13종마다 이 무거운 계산이
--   사실상 반복됐다(EXPLAIN ANALYZE 로 SubPlan loops=13 확인).
--
-- 수정: per 를 카테고리별로 한 번만 집계(percentile_cont)한 per_agg CTE 로 분리해 rc 에
--   LEFT JOIN 하는 방식으로 재작성 — 무거운 계산이 정확히 1번만 실행되도록.
--
-- 실측(2026-07-11): 11.6~27초 → 535ms(약 20~50배). 같은 스냅샷 안에서 기존 방식과 결과 대조,
--   13개 카테고리 전부(chats·median_frt_min·neg_rate) 정확히 일치 확인 후 적용.
-- 이 마이그레이션이 바꾸는 것은 median_frt_min·neg_rate 를 구하는 방식뿐 — 최종 결과값은
-- 기존과 100% 동일. kakao_insights()·kakao-insights 배치 모두 안전.

create or replace function public.kakao_topic_pain(days int default 14)
returns jsonb
language sql
stable
set search_path = ''
as $$
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
  per_agg as (
    select category, round(percentile_cont(0.5) within group (order by mins)) as median_frt_min
    from per group by category
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
      coalesce(max(pa.median_frt_min), 0) as median_frt_min,
      coalesce(round(100.0 * max(n.neg) / nullif(max(n.scored), 0)), 0) as neg_rate
    from rc
    left join per_agg pa on pa.category = rc.category
    left join negc n on n.category = rc.category
    group by rc.category
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'category', category, 'chats', chats, 'median_frt_min', median_frt_min, 'neg_rate', neg_rate
  ) order by chats desc), '[]'::jsonb) from agg;
$$;

grant execute on function public.kakao_topic_pain(int) to anon, authenticated;

-- 점검(적용 후):
--   explain (analyze, buffers) select public.kakao_topic_pain(14); -- 1초 이내인지 확인.
--   select jsonb_pretty(kakao_topic_pain(14)); -- 카테고리별 chats·median_frt_min·neg_rate 정상 확인.

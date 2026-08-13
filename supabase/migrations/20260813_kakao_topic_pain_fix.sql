-- 20260813_kakao_topic_pain_fix.sql
--
-- kakao_topic_pain 은 "어디가 아픈가"(카테고리별 건수·부정 감정률·첫 응답 시간)를 알려주는
-- 가장 값어치 있는 분석인데, 29.3초가 걸려 대시보드 조회 제한(8초)을 넘었다. 그래서 지금까지
-- 주 1회 슬랙 리포트에서만 쓰였다. 원인은 두 가지였고, 둘 다 같은 자리에서 나왔다.
--
-- 문제 1) 메시지 조회에 기간 제한이 없었다.
--   최근 14일에 활동한 대화방의 **과거 전체 메시지**를 훑었다. 그래서 느렸고,
--   더 나쁘게는 "첫 응답 시간"이 최근 응답이 아니라 그 대화방의 맨 처음 대화를 잰 값이었다.
--   카카오는 고객당 대화방이 하나로 계속 이어지므로, 몇 달 전 첫 인사를 재고 있었던 셈이다.
--   실측 차이: 라이브 7분 → 15분, 입반·등록 55분 → 17분, 시간표·수업 18분 → 40분.
--
-- 문제 2) 기간이 파라미터라 실행계획이 무너졌다.
--   기간 제한을 넣고도 13.5초였다. 같은 쿼리를 리터럴('14 days')로 돌리면 37ms.
--   플래너가 몇 건이 걸릴지 못 가늠해 나쁜 계획을 고르는 것이었다(364배 차이).
--   정수 파라미터를 본문에 직접 넣어 매번 상수로 계획하게 한다(days 는 integer 라 주입 위험 없음).
--
-- 결과: 29,311ms → 41ms (715배). 반환 형식은 그대로라 주간 슬랙 리포트는 영향 없다.
create or replace function public.kakao_topic_pain(days integer default 14)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  result jsonb;
  d integer := greatest(coalesce(days, 14), 1);
begin
  execute format($q$
    with rc as (
      select chat_id, category from public.kakao_partner_chats
      where last_log_send_at >= now() - interval '%s days'
        and category is not null and category <> '기타'
    ),
    msg as (
      select m.chat_id, m.sender_type, m.sent_at, m.sentiment
      from public.kakao_partner_messages m
      where m.sent_at >= now() - interval '%s days'
        and m.chat_id in (select chat_id from rc)
    ),
    frt as (
      select chat_id,
        min(sent_at) filter (where sender_type = 'user')    as fu,
        min(sent_at) filter (where sender_type = 'manager') as fm
      from msg group by chat_id
    ),
    per as (
      select rc.category, public.kakao_business_minutes(frt.fu, frt.fm) as mins
      from rc join frt on frt.chat_id = rc.chat_id
      where frt.fu is not null and frt.fm is not null and frt.fm > frt.fu
    ),
    per_agg as (
      select category, round(percentile_cont(0.5) within group (order by mins)) as median_frt_min
      from per group by category
    ),
    negc as (
      select rc.category,
        count(*) filter (where m.sentiment is not null)  as scored,
        count(*) filter (where m.sentiment = 'negative') as neg
      from rc join msg m on m.chat_id = rc.chat_id and m.sender_type = 'user'
      group by rc.category
    ),
    agg as (
      select rc.category, count(distinct rc.chat_id) as chats,
        coalesce(max(pa.median_frt_min), 0) as median_frt_min,
        coalesce(round(100.0 * max(n.neg) / nullif(max(n.scored), 0)), 0) as neg_rate
      from rc
      left join per_agg pa on pa.category = rc.category
      left join negc n on n.category = rc.category
      group by rc.category
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'category', category, 'chats', chats,
      'median_frt_min', median_frt_min, 'neg_rate', neg_rate
    ) order by chats desc), '[]'::jsonb) from agg
  $q$, d, d) into result;
  return result;
end;
$function$;

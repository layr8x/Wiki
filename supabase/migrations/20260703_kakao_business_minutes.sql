-- 20260703_kakao_business_minutes.sql
-- 운영시간(평일 09:00~19:00 KST) 내 경과 "영업 분"만 계산. 야간·주말은 제외.
-- 배경: "첫 응답 135분" 같은 벽시계 지표는 밤에 온 문의를 아침에 답한 걸 지연으로 오판한다.
--   실제 상담원 응답 시각 분포(30일)가 평일 09~19시에 집중돼, 이 창을 운영시간으로 본다.
-- 예: 금 18:50 접수 → 월 09:10 응답 = 20분(금 10분 + 월 10분), 주말은 0.
create or replace function public.kakao_business_minutes(t1 timestamptz, t2 timestamptz)
returns numeric
language sql immutable set search_path = '' as $$
  with p as (select least(t1, t2) as a, greatest(t1, t2) as b),
  d as (
    select generate_series(
      (date_trunc('day', (select a from p) at time zone 'Asia/Seoul'))::date,
      (date_trunc('day', (select b from p) at time zone 'Asia/Seoul'))::date,
      interval '1 day'
    )::date as day
  )
  select coalesce(round(sum(
    greatest(0, extract(epoch from (
      least((select b from p), ((day + time '19:00') at time zone 'Asia/Seoul'))
      - greatest((select a from p), ((day + time '09:00') at time zone 'Asia/Seoul'))
    )) / 60.0)
  )), 0)::numeric
  from d
  where extract(isodow from day) between 1 and 5;
$$;

grant execute on function public.kakao_business_minutes(timestamptz, timestamptz) to anon, authenticated;

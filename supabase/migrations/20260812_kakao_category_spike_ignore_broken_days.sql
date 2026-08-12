-- 20260812_kakao_category_spike_ignore_broken_days.sql
--
-- 문제(2026-08-12 사용자 지적 "알림이 너무 잦다"):
--   새벽 내내 "문의가 갑자기 늘었어요" 알림이 쏟아졌다. 실제로는 문의가 안 늘었다.
--   원인은 비교 기준(baseline)이 오염된 것 — 2026-07-25~08-11 수집이 멈춰 있던 18일이
--   "문의가 거의 없던 날"로 기록됐고, 이 함수는 최근 7일 평균을 기준으로 삼는다.
--   그래서 수집이 되살아난 오늘(정상 수준 165건)이 "평소보다 11배"로 잡혔다.
--   실측: 라이브 baseline 4.6건(실제 43.6건) → ratio 11.8배(실제 1.2배).
--
-- 해결: 수집이 정상이 아니었던 날은 기준 계산에서 뺀다.
--   "정상이 아닌 날" 판정 = 그날 전체 대화량이 최근 28일 상위 10%(p90)의 30%에도 못 미치는 날.
--   평균이나 중앙값을 쓰면 공백일이 다수일 때 기준 자체가 같이 무너져 판정이 안 된다
--   (실측: 28일 중 18일이 공백 → 중앙값 15건 → 공백일이 "정상"으로 통과). 상위값 기준이라야
--   공백을 공백으로 골라낸다.
--
-- 검증(적용 전 시뮬레이션): 오늘 알림 대상이 4개 → 1개(기타)로 줄고, 라이브·환불·계정 은
--   전부 정상 범위로 판정됐다. 라이브 1.24배 · 환불 0.94배 · 계정 0.61배.
create or replace function public.kakao_category_spike(
  min_ratio numeric default 2.0,
  min_count integer default 5
)
returns table (d date, category text, cnt bigint, baseline_7d numeric, ratio numeric, channel_breakdown jsonb)
language sql
stable
set search_path to ''
as $function$
  with daily_total as (
    select date_trunc('day', c.last_log_send_at)::date as d, count(*) as total
    from public.kakao_partner_chats c
    where c.last_log_send_at >= current_date - 28
    group by 1
  ),
  -- 최근 28일 중 "수집이 정상이던 날"의 규모 기준값
  ref as (select percentile_disc(0.9) within group (order by total) as p90 from daily_total),
  valid_day as (
    select dt.d from daily_total dt, ref where dt.total >= 0.3 * ref.p90
  ),
  daily as (
    select date_trunc('day', c.last_log_send_at)::date as d, c.category, count(*) as cnt
    from public.kakao_partner_chats c where c.category is not null group by 1, 2
  ),
  -- 기준(baseline)은 정상이던 날만으로 계산한다. 오늘 자신은 아래에서 따로 본다.
  daily_valid as (
    select dl.* from daily dl
    where dl.d in (select d from valid_day) or dl.d = current_date
  ),
  roll as (
    select d, category, cnt,
      avg(cnt) over (partition by category order by d rows between 7 preceding and 1 preceding) as baseline_7d
    from daily_valid
  ),
  spikes as (
    select d, category, cnt, round(baseline_7d, 1) as baseline_7d, round(cnt / nullif(baseline_7d, 0), 2) as ratio
    from roll
    where baseline_7d is not null and cnt >= min_count and cnt > baseline_7d * min_ratio and d = current_date
  )
  select s.d, s.category, s.cnt, s.baseline_7d, s.ratio,
    (select coalesce(jsonb_agg(jsonb_build_object('channel', cl, 'cnt', ccnt) order by ccnt desc), '[]'::jsonb)
     from (
       select case c.profile_id when '_xfxilXn' then '콘텐츠' when '_rcpPG' then 'LIVE' when '_rkbcn' then '통합로그인' when '_TkpPG' then 'LIVE 기술지원'
                                when '_VGAQn' then '마이클래스' else c.profile_id end as cl,
              count(*) as ccnt
       from public.kakao_partner_chats c
       where c.category = s.category and date_trunc('day', c.last_log_send_at)::date = current_date
       group by 1
     ) t) as channel_breakdown
  from spikes s
  order by s.ratio desc;
$function$;

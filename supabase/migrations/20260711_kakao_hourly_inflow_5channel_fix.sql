-- 20260711_kakao_hourly_inflow_5channel_fix.sql
-- 목적: public.kakao_hourly_inflow() 가 아직 옛 3채널 구조(cnt_my/cnt_live/cnt_sdc 고정 컬럼)를
--   쓰고 있어 5채널 확장(20260703_kakao_channel_canonical.sql) 이후 두 채널이 통째로 빠지고,
--   남은 라벨도 하나 잘못 붙어 있었다.
--
-- 구체적 오류(수정 전):
--   - cnt_my  = _VGAQn(마이클래스) — 정상
--   - cnt_live = _TkpPG — 이름은 "live"지만 실제로는 "LIVE 기술지원" 부채널. 메인 LIVE(_rcpPG)는
--     집계에서 완전히 빠져 있었다.
--   - cnt_sdc = _xfxilXn(콘텐츠) — 라벨명 "sdc"는 구 명칭 "시대인재C"의 잔재.
--   - 통합로그인(_rkbcn)은 어디에도 없음.
--   - total = cnt_my + cnt_live + cnt_sdc 도 위 3개만 더한 값이라, 실제보다 항상 적게 계산됨.
--   (CLAUDE.md §16 채널 정본 표와 20260706_kakao_channel_functions_canonical.sql 헤더 주석에
--    "kakao_hourly_inflow는 반환 스키마 자체가 바뀌어야 해서 별도 개편 예정으로 범위 밖" 이라고
--    이미 남겨져 있던 항목 — 이번에 처리.)
--
-- 영향 확인: kakao_hourly_inflow는 kakao_insights() 번들에 포함되지만, 그 유일한 소비자인
--   kakao-insights 엣지 함수(Slack 리포트)의 buildBlocks()는 d.hourly 를 전혀 참조하지 않는다
--   (grep 확인, src/·supabase/functions/ 전체에 cnt_my/cnt_live/cnt_sdc/kakao_hourly_inflow 참조
--   없음) — 즉 현재는 계산만 되고 아무 데도 안 쓰이는 상태라, 반환 구조를 바꿔도 깨지는 화면이 없다.
--
-- 수정: kakao_channel 정본 테이블을 조인해 시간대별로 5채널 전부를 동적으로 집계
--   (`by_channel: {"채널명": 건수, ...}` + `total`, 다른 정본 함수들과 동일한 채널 조인 패턴).
--   프로필ID→라벨 하드코딩을 없애 앞으로 채널이 늘어도 코드 수정 없이 반영된다.
--
-- 검증(2026-07-11): 24개 시간대, 5채널 라벨 정상 표시, 14일 합계 6,743건(기존 3채널 합보다
--   자연히 더 큼 — 누락됐던 2채널이 이제 포함되므로 의도된 차이).

create or replace function public.kakao_hourly_inflow(days int default 14)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with ch as (select pid, label from public.kakao_channel),
  base as (
    select extract(hour from (m.sent_at at time zone 'Asia/Seoul'))::int as hr, m.profile_id
    from public.kakao_partner_messages m
    where m.sender_type = 'user' and m.sent_at >= now() - make_interval(days => days)
  ),
  counts as (
    select hr, profile_id, count(*) as cnt from base group by hr, profile_id
  ),
  hourly as (
    select c.hr,
      jsonb_object_agg(coalesce(ch.label, c.profile_id), c.cnt) as by_channel,
      sum(c.cnt) as total
    from counts c
    left join ch on ch.pid = c.profile_id
    group by c.hr
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'hr', hr, 'by_channel', by_channel, 'total', total
  ) order by hr), '[]'::jsonb)
  from hourly;
$$;

grant execute on function public.kakao_hourly_inflow(int) to anon, authenticated;

-- 점검(적용 후):
--   select jsonb_pretty(kakao_hourly_inflow(14) -> 0); -- by_channel에 5채널 라벨 정상 표시되는지 확인.
--   select jsonb_array_length(kakao_hourly_inflow(14)); -- 24 이하인지 확인.

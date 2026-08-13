-- 20260813_kakao_quality_insights.sql
--
-- 왜 만드나 (2026-08-13 사용자 지시: "데이터 수집에 국한하지 말고 실시간 분석으로 가치있는 인사이트를")
--   지금 플랫폼은 "몇 건 수집됐나"와 "지금 몇 건 밀렸나"까지만 보여준다. 정작 운영을 바꾸는 질문
--   "우리가 제대로 답하고 있나"에는 아무 지표도 없다. 이 함수가 그 답을 만든다.
--
-- 세 가지 품질 지표 (전부 [측정] — 원문 데이터에서 직접 센 값이다)
--   1. 무응답 종료   대화의 마지막 말이 고객이고 그 뒤로 조용한 경우. 실측 LIVE 26.6%.
--   2. 재문의       같은 대화방에서 문의가 두 번 이상 시작된 경우. 한 번에 해결 못 했다는 뜻. 실측 22.8%.
--   3. 여러 번 오감  답변을 받고도 고객이 3번 이상 더 말한 문의. 실측 66.2%.
--
-- ⚠️ 판정 규칙(해석이 들어간 부분이라 화면에도 같이 적어야 한다)
--   · "문의 세션" = 고객 메시지 중, 그 대화방의 직전 메시지와 24시간 이상 벌어진 것을 새 문의의 시작으로 본다.
--     카카오 채널은 고객 1명당 대화방이 하나로 계속 이어져서, 대화방 수로는 문의 횟수를 셀 수 없다
--     (실측: 대화방 기준으로 세면 재문의가 0건으로 나온다).
--   · "무응답 종료" 는 마지막 고객 메시지가 2시간 넘게 지난 것만 센다. 방금 들어온 문의를 무응답으로
--     오해하지 않기 위해서다.
--   · 24시간·2시간·3회는 임계값이다. 운영 기준이 정해지면 인자로 조정한다.
create or replace function public.kakao_quality_insights(
  p_days integer default 14
)
returns jsonb
language sql
stable
set search_path to ''
as $$
-- materialized: 기본(inline)으로 두면 base 를 참조하는 갈래마다 테이블을 다시 훑는다.
-- 한 번만 읽고 재사용하도록 못 박는다.
with base as materialized (
  select m.chat_id, m.profile_id, m.sent_at, m.sender_type,
         lag(m.sent_at) over (partition by m.chat_id order by m.sent_at) as prev_at,
         row_number() over (partition by m.chat_id order by m.sent_at desc) as rn_desc
  from public.kakao_partner_messages m
  where m.sent_at >= now() - make_interval(days => greatest(p_days, 1))
),
sess as (
  select chat_id, profile_id, sender_type,
         sum(case when sender_type = 'user' and (prev_at is null or sent_at - prev_at > interval '24 hours')
                  then 1 else 0 end)
           over (partition by chat_id order by sent_at rows unbounded preceding) as sess_no
  from base
),
per_session as (
  select chat_id, min(profile_id) as profile_id, sess_no,
         count(*) filter (where sender_type = 'user')    as user_turns,
         count(*) filter (where sender_type = 'manager') as mgr_turns
  from sess
  where sess_no > 0
  group by chat_id, sess_no
),
sess_agg as (
  select profile_id,
         count(*)                                                  as sessions,
         count(distinct chat_id)                                   as chats,
         count(*) filter (where mgr_turns = 0)                     as no_answer,
         count(*) filter (where mgr_turns > 0 and user_turns >= 3) as many_turns
  from per_session group by profile_id
),
-- 대화방의 마지막 메시지 = base 에서 이미 매긴 rn_desc=1 (별도 스캔 없음)
end_agg as (
  select profile_id,
         count(*) as ended_chats,
         count(*) filter (where sender_type = 'user' and sent_at < now() - interval '2 hours') as no_reply_end
  from base where rn_desc = 1 group by profile_id
),
merged as (
  select coalesce(s.profile_id, e.profile_id) as profile_id,
         coalesce(s.sessions, 0) as sessions, coalesce(s.chats, 0) as chats,
         coalesce(s.no_answer, 0) as no_answer, coalesce(s.many_turns, 0) as many_turns,
         coalesce(e.ended_chats, 0) as ended_chats, coalesce(e.no_reply_end, 0) as no_reply_end
  from sess_agg s full outer join end_agg e on e.profile_id = s.profile_id
),
labeled as (
  select case profile_id
           when '_VGAQn' then '마이클래스' when '_rcpPG' then 'LIVE'
           when '_TkpPG' then 'LIVE 기술지원' when '_xfxilXn' then '콘텐츠'
           when '_rkbcn' then '통합로그인' else profile_id end as channel,
         sessions, chats, no_answer, many_turns, ended_chats, no_reply_end
  from merged
),
overall as (
  select coalesce(sum(sessions), 0) as sessions, coalesce(sum(chats), 0) as chats,
         coalesce(sum(no_answer), 0) as no_answer, coalesce(sum(many_turns), 0) as many_turns,
         coalesce(sum(ended_chats), 0) as ended_chats, coalesce(sum(no_reply_end), 0) as no_reply_end
  from labeled
)
select jsonb_build_object(
  'window_days', greatest(p_days, 1),
  'computed_at', now(),
  'overall', (select jsonb_build_object(
      'sessions', o.sessions, 'chats', o.chats,
      'repeat_pct', case when o.sessions > 0 then round(100.0 * (o.sessions - o.chats) / o.sessions, 1) else 0 end,
      'no_answer_pct', case when o.sessions > 0 then round(100.0 * o.no_answer / o.sessions, 1) else 0 end,
      'many_turns_pct', case when (o.sessions - o.no_answer) > 0 then round(100.0 * o.many_turns / (o.sessions - o.no_answer), 1) else 0 end,
      'no_reply_end', o.no_reply_end,
      'no_reply_end_pct', case when o.ended_chats > 0 then round(100.0 * o.no_reply_end / o.ended_chats, 1) else 0 end
    ) from overall o),
  'by_channel', (select coalesce(jsonb_agg(jsonb_build_object(
      'channel', c.channel, 'sessions', c.sessions, 'chats', c.chats,
      'repeat_pct', case when c.sessions > 0 then round(100.0 * (c.sessions - c.chats) / c.sessions, 1) else 0 end,
      'no_answer_pct', case when c.sessions > 0 then round(100.0 * c.no_answer / c.sessions, 1) else 0 end,
      'many_turns_pct', case when (c.sessions - c.no_answer) > 0 then round(100.0 * c.many_turns / (c.sessions - c.no_answer), 1) else 0 end,
      'no_reply_end', c.no_reply_end,
      'no_reply_end_pct', case when c.ended_chats > 0 then round(100.0 * c.no_reply_end / c.ended_chats, 1) else 0 end
    ) order by c.no_reply_end desc, c.sessions desc), '[]'::jsonb) from labeled c)
);
$$;

revoke execute on function public.kakao_quality_insights(integer) from public, anon;
grant  execute on function public.kakao_quality_insights(integer) to authenticated, service_role;

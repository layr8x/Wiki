-- 20260813_kakao_action_chats_add_ids.sql
-- 목적: "지금 처리할 대화" 목록의 각 행을 눌러 그 대화로 바로 갈 수 있게 하려면
--   화면이 chat_id 와 profile_id 를 알아야 한다. 함수는 이미 두 값을 내부에서 다루고 있으면서
--   (pending CTE 의 p.chat_id / p.profile_id) 바깥으로 내보내지 않고 버리고 있었다.
--   그래서 목록은 "지금 뭘 해야 하는지"를 말해 주면서도 정작 그리로 갈 방법이 없었다.
--
-- 바꾸는 것: 반환 jsonb 에 chat_id · profile_id 두 키를 추가하는 것뿐.
--   pending 필터·채널/닉네임 조회·정렬·limit_n·성능 구조(LATERAL + log_id 2차 정렬 키)는
--   20260710_kakao_action_chats_lateral_rewrite.sql 원본과 100% 동일하다.
--   ⚠️ 그 2차 정렬 키(log_id)는 같은 초에 겹친 메시지에서 결과가 실행마다 달라지던 문제를 고친
--   것이라 반드시 유지해야 한다(그 마이그레이션 주석 참고).
--
-- 기존 화면 영향: 없음. jsonb 에 키가 늘어날 뿐이라 예전 키만 읽던 쪽은 그대로 동작한다.

create or replace function public.kakao_action_chats(limit_n int default 6)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with ch as (select pid, label from public.kakao_channel),
  active as (select distinct chat_id from public.kakao_partner_chats where last_log_send_at >= now() - interval '7 days'),
  last_msg as (
    select lm.chat_id, lm.profile_id, lm.sender_type, lm.sent_at, lm.message
    from active a
    cross join lateral (
      select m.chat_id, m.profile_id, m.sender_type, m.sent_at, m.message
      from public.kakao_partner_messages m
      where m.chat_id = a.chat_id
      order by m.sent_at desc, m.log_id::bigint desc
      limit 1
    ) lm
  ),
  pending as (
    select lm.chat_id, lm.profile_id, lm.sent_at, lm.message
    from last_msg lm
    where lm.sender_type = 'user' and not public.kakao_is_closing(lm.message)
  )
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
    select
      p.chat_id,
      p.profile_id,
      (select label from ch where ch.pid = p.profile_id) as channel,
      (select nickname from public.kakao_partner_chats c where c.chat_id = p.chat_id limit 1) as nickname,
      round(public.kakao_business_minutes(p.sent_at, now()) / 60.0, 1) as waited_h,
      left(regexp_replace(coalesce(p.message, ''), '\s+', ' ', 'g'), 42) as preview
    from pending p
    order by public.kakao_business_minutes(p.sent_at, now()) desc
    limit limit_n
  ) x;
$$;

grant execute on function public.kakao_action_chats(int) to anon, authenticated;

-- 점검(적용 후):
--   select jsonb_pretty(kakao_action_chats(6)); -- chat_id·profile_id 가 들어 있고 waited_h 내림차순인지 확인.

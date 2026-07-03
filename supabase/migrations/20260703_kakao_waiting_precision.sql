-- 20260703_kakao_waiting_precision.sql
-- 정밀 검수 2차: "대기(미응답)" 지표 정밀화.
-- 발견: 마지막 고객 메시지가 "감사합니다" 같은 종료 인사인데도 대기로 집계돼, 대기 수가 3배가량
--   부풀려져 있었다(예: 대기 9건 중 6건이 감사 인사, 진짜 미응답은 3건). 담당자가 이미 끝난 대화를
--   쫓게 만드는 오류라 교정한다. + 담당자가 바로 찾도록 "지금 답 기다리는 대화" 리스트도 제공.

-- 종료 판정: 질문·요청 신호가 있으면 대기, 없고 감사/인사/자가해결/단답이면 종료.
create or replace function public.kakao_is_closing(msg text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when msg is null or length(trim(msg)) = 0 then true
    when msg ~ '\?|가능|해주|부탁|어떻게|언제|되나요|인가요|문의|여쭤|주세요|알려|취소|환불|안내|신청|해도' then false
    when msg ~ '감사|고마|수고|알겠|잘 받았|확인했|넵|넹|고맙|수고하|찾았|해결됐|해결했|알아냈|됐습니다' then true
    when length(trim(msg)) <= 3 then true
    else false
  end;
$$;
grant execute on function public.kakao_is_closing(text) to anon, authenticated;

-- SLA: 대기는 최근 7일 활성 대화 중 "마지막=고객 & 비종료"만. oldest_wait 도 영업시간 기준.
create or replace function public.kakao_sla_status()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with ch as (select unnest(array['_VGAQn','_TkpPG','_xfxilXn']) pid, unnest(array['마이클래스','라이브','시대인재C']) label),
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

-- 행동 리스트: SLA 대기와 100% 동일 집합에서 상위 N개(오래 기다린 순). 담당자용 닉네임·미리보기 포함.
create or replace function public.kakao_action_chats(limit_n int default 6)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with ch as (select unnest(array['_VGAQn','_TkpPG','_xfxilXn']) pid, unnest(array['마이클래스','라이브','시대인재C']) label),
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
grant execute on function public.kakao_action_chats(int) to anon, authenticated;

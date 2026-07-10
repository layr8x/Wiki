-- 20260710_kakao_action_chats_lateral_rewrite.sql
-- 목적: public.kakao_action_chats() 도 kakao_sla_status() 와 완전히 동일한 last_msg CTE 패턴을
--   써서 같은 두 가지 문제(느림 + 동률 시 비결정적 결과)를 그대로 안고 있어 함께 수정한다.
--   (배경: 20260710_kakao_sla_status_lateral_rewrite.sql 참고 — 같은 조사 중 발견.)
--
-- ① 성능: EXPLAIN ANALYZE 실측(2026-07-10) 11,194ms(11.2초) — 8초 role statement_timeout 을
--   이미 넘기고 있었다(kakao-daily-summary 배치가 매일 이 함수를 호출: index.ts:210). last_msg를
--   kakao_sla_status와 동일하게 LATERAL(각 활성 대화마다 옆에서 서브쿼리 실행) + LIMIT 1 구조로
--   재작성해 idx_kakao_partner_messages_chat_time(chat_id, sent_at desc) 로 대화당 1건만 바로 찾도록 함.
--
-- ② ⚠️ 정확성(성능보다 더 중요한 발견): 기존 last_msg 는 DISTINCT ON (chat_id) 에 2차 정렬 키가 없어
--   같은 초에 메시지가 겹치는 대화에서 결과가 실행마다 달라졌다. 실측으로 직접 확인:
--   같은 로직을 독립적으로 3번 실행 → "지금 답 기다리는 대화" 건수가 30건 → 20건 → 20건으로 달라짐
--   (같은 순간 데이터, 같은 코드, 매번 다른 답 — 재현성 없음). log_id(카카오 단조증가 ID)를 2차
--   정렬 키로 추가(`order by sent_at desc, log_id::bigint desc`)한 결정적 버전으로 같은 스냅샷에서
--   재확인하니 10건으로 안정적으로 수렴(기존 방식도 같은 2차 키를 주면 동일하게 10건 — 즉 "10건"이
--   맞는 답이고, 2차 키 없이 나오던 30·20건은 우연히 뽑힌 메시지에 따라 부풀려진 값이었다).
--   이 함수는 kakao-daily-summary 배치가 매일 호출해 "지금 처리할 대화" 목록을 만드는 데 쓰인다 —
--   즉 담당자에게 실제보다 최대 3배 부풀려진(또는 널뛰는) 우선순위 목록을 보여주고 있었을 가능성.
--
-- 이 마이그레이션이 바꾸는 것은 last_msg CTE 하나뿐. pending 필터·채널/닉네임 조회·정렬·limit_n
-- 로직은 원본과 100% 동일.

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

-- 점검(적용 후):
--   explain (analyze, buffers) select public.kakao_action_chats(6); -- 8초 대비 충분히 낮은지 확인.
--   select jsonb_pretty(kakao_action_chats(6)); -- 6건 이하로, waited_h 내림차순인지 확인.

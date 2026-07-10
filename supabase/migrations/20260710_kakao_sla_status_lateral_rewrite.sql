-- 20260710_kakao_sla_status_lateral_rewrite.sql
-- 목적: public.kakao_sla_status() 가 프로덕션(/admin/consults, kakao-daily-summary 배치 양쪽)에서
--   PostgREST 를 통해 간헐적 HTTP 500(statement timeout)을 반환하는 문제 수정.
--
-- ⚠️ 조사 경과(중요, 다음 세션 참고): 처음엔 frt CTE(중앙값 첫 응답시간)가 sent_at 하나로만 필터링해
--   색인이 없다고 가정했으나, 실제로는 kakao_msg_sent_at_idx(sent_at) 가 DB에 이미 존재했다(이전
--   세션이 execute_sql 로 직접 추가했지만 마이그레이션 파일로 캡처하지 않아 저장소와 DB가 어긋나 있었음
--   — 20260708_kakao_analytics_perf_indexes.sql 헤더가 경고한 것과 같은 종류의 드리프트).
--   그런데도 실측(2026-07-10, EXPLAIN ANALYZE) 결과 함수는 여전히 20.2초가 걸렸다 — 진짜 원인은 따로 있었다.
--
-- 진짜 원인: last_msg CTE가 DISTINCT ON (chat_id) ... WHERE chat_id IN (활성 대화 736개) 로 짜여 있는데,
--   PostgreSQL 플래너가 "대화당 최신 메시지 1건만" 인덱스로 바로 찾아가지 못하고, 대화당 평균 41건씩
--   총 30,409행을 전부 가져온 뒤 정렬(Incremental Sort)·중복제거(Unique) 하고 있었다 — 이 한 단계만
--   16.4초(전체 20.2초 중 대부분). frt 쪽은 이미 색인이 있어 3.5~3.7초 정도였다.
--
-- 수정: last_msg를 "활성 대화 각각에 대해 LATERAL(=각 행마다 옆에서 서브쿼리 하나씩 실행) + LIMIT 1"
--   구조로 재작성 — 기존 idx_kakao_partner_messages_chat_time(chat_id, sent_at desc) 인덱스를 이용해
--   대화당 딱 1건만 바로 찾아간다(41건 긁어와 정렬하지 않음).
--   실측: 20,192ms → 3,107ms(약 6.5배, 이마저도 프론트 SLA 위젯 자체가 8초 role 제한과 비교해 충분한 여유).
--
-- ⚠️ 결과값 동일성 검증(2026-07-10, 같은 트랜잭션 스냅샷 안에서 기존 방식 vs 새 방식 직접 대조):
--   1차 대조에서 735건 중 54건 불일치 발견 — sent_at 이 "초" 단위라 같은 초에 메시지가 여러 건 겹치는
--   대화(예: 사용자 메시지 + 카카오 system 이벤트가 같은 초)에서, 기존 DISTINCT ON 은 명시적 동률 처리
--   기준이 없어(2차 정렬 키 없음) 실행 계획에 따라 어느 쪽을 고를지가 원래도 불확정이었다(재현성 없는
--   잠재 결함, 이번에 발견). log_id(카카오가 부여하는 단조증가 ID, sent_at보다 정밀)를 2차 정렬 키로
--   추가(`order by sent_at desc, log_id::bigint desc`)하니 0건 불일치로 완전히 일치 — 이 2차 키를
--   최종 함수에도 반영해 "초 단위로 겹치는 경우 더 나중에 실제로 발생한 이벤트"를 결정적으로 고르도록
--   개선했다(막연한 동률 처리 → 명시적 규칙). 활성 대화의 약 7%가 이 동률 케이스였다.
--
-- 이 마이그레이션이 바꾸는 것은 last_msg CTE 하나뿐이다. waiting·frt CTE, 최종 select 는 원본과
-- 100% 동일 — /admin/consults 와 kakao-daily-summary 배치 모두 안전.
--
-- 참고: kakao_action_chats() 도 동일한 DISTINCT ON 패턴을 그대로 쓰고 있어 같은 위험이 있다(이번
--   범위 밖 — 별도 확인 필요 항목으로 분리 보고함).

create or replace function public.kakao_sla_status()
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

grant execute on function public.kakao_sla_status() to anon, authenticated;

-- 점검(적용 후):
--   explain (analyze, buffers) select public.kakao_sla_status(); -- 8초 대비 충분히 낮은지(목표 4초 이하) 확인.
--   select jsonb_pretty(kakao_sla_status()); -- 채널 5개·수치 형태가 정상인지 확인.

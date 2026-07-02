-- 20260703_kakao_sla_trend.sql
-- 일일 요약 고도화 2차: (A) 응답 현황(SLA) + (B) 주간 추세 RPC.
--
-- 배경: 채널별 문의 분포·감정까지는 보이지만, "지금 답을 못 받고 기다리는 학부모가 몇 명인지",
-- "평균 첫 응답이 얼마나 걸리는지", "지난주 대비 어떤 문의가 늘고 있는지"는 없었다. 이 셋은
-- 학부모 불만이 터지기 전에 선제 대응할 근거라, 일일 요약(매일 09시 KST)에 붙인다.

-- ─── (A) 응답 현황(SLA) ───────────────────────────────────────────────
-- 채널별 지표(정제 기준):
--   waiting = 최근 48시간 활동 대화 중 "마지막 메시지가 고객"인 것(지금 답 기다림).
--     48시간 창으로 제한해, 옛날에 고객이 "감사합니다"로 끝낸 대화를 오집계하지 않는다.
--   oldest_wait_h = 그중 가장 오래 기다린 시간(창이 48h라 최대 48).
--   median_first_response_min = 최근 7일 첫 응답(첫 고객 발화 -> 첫 상담원 응답)의 중앙값.
--     48시간 넘게 걸린 건(사실상 방치·야간)을 빼고 median 을 써서 소수 outlier 왜곡 제거.
create or replace function public.kakao_sla_status()
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with ch as (
    select unnest(array['_VGAQn', '_TkpPG', '_xfxilXn']) as pid,
           unnest(array['마이클래스', '라이브', '시대인재C']) as label
  ),
  active as (
    select distinct chat_id from public.kakao_partner_messages where sent_at >= now() - interval '48 hours'
  ),
  last_msg as (
    select distinct on (m.chat_id) m.chat_id, m.profile_id, m.sender_type, m.sent_at
    from public.kakao_partner_messages m
    where m.chat_id in (select chat_id from active)
    order by m.chat_id, m.sent_at desc
  ),
  waiting as (
    select profile_id,
      count(*) filter (where sender_type = 'user') as waiting,
      round(extract(epoch from (now() - min(sent_at) filter (where sender_type = 'user'))) / 3600.0, 1) as oldest_wait_h
    from last_msg group by profile_id
  ),
  frt as (
    select profile_id,
      round(percentile_cont(0.5) within group (order by mins)) as median_frt_min,
      count(*) as answered
    from (
      select t.profile_id, extract(epoch from (t.fm - t.fu)) / 60.0 as mins
      from (
        select m.chat_id, m.profile_id,
          min(m.sent_at) filter (where m.sender_type = 'user') as fu,
          min(m.sent_at) filter (where m.sender_type = 'manager') as fm
        from public.kakao_partner_messages m
        where m.sent_at >= now() - interval '7 days'
        group by m.chat_id, m.profile_id
      ) t
      where t.fu is not null and t.fm is not null and t.fm > t.fu and (t.fm - t.fu) < interval '48 hours'
    ) z group by profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'channel', ch.label,
    'waiting', coalesce(w.waiting, 0),
    'oldest_wait_h', coalesce(w.oldest_wait_h, 0),
    'median_first_response_min', coalesce(f.median_frt_min, 0),
    'answered_n', coalesce(f.answered, 0)
  ) order by coalesce(w.waiting, 0) desc), '[]'::jsonb)
  from ch
  left join waiting w on w.profile_id = ch.pid
  left join frt f on f.profile_id = ch.pid;
$$;

-- ─── (B) 주간 추세 ───────────────────────────────────────────────────
-- 채널별: 이번 주(최근 7일) vs 지난 주(7~14일 전) 카테고리 건수 비교, 늘고 있는 상위 2개.
--   기타는 노이즈라 제외. 급증(하루) 이전의 "완만한 상승"을 조기 포착.
create or replace function public.kakao_weekly_trend(min_count int default 3)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with ch as (
    select unnest(array['_VGAQn', '_TkpPG', '_xfxilXn']) as pid,
           unnest(array['마이클래스', '라이브', '시대인재C']) as label
  ),
  cur as (
    select profile_id, category, count(*) as c from public.kakao_partner_chats
    where last_log_send_at >= now() - interval '7 days' and category is not null and category <> '기타'
    group by 1, 2
  ),
  prev as (
    select profile_id, category, count(*) as c from public.kakao_partner_chats
    where last_log_send_at >= now() - interval '14 days' and last_log_send_at < now() - interval '7 days'
      and category is not null and category <> '기타'
    group by 1, 2
  ),
  joined as (
    select coalesce(cur.profile_id, prev.profile_id) as pid,
           coalesce(cur.category, prev.category) as category,
           coalesce(cur.c, 0) as cur_c, coalesce(prev.c, 0) as prev_c
    from cur full join prev on cur.profile_id = prev.profile_id and cur.category = prev.category
  ),
  rising as (
    select pid, category, cur_c, prev_c, (cur_c - prev_c) as delta,
      row_number() over (partition by pid order by (cur_c - prev_c) desc) as rn
    from joined
    where cur_c >= min_count and cur_c > prev_c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'channel', ch.label,
    'rising', coalesce((
      select jsonb_agg(jsonb_build_object('category', r.category, 'cur', r.cur_c, 'prev', r.prev_c, 'delta', r.delta) order by r.delta desc)
      from rising r where r.pid = ch.pid and r.rn <= 2), '[]'::jsonb)
  )), '[]'::jsonb)
  from ch;
$$;

grant execute on function public.kakao_sla_status() to anon, authenticated;
grant execute on function public.kakao_weekly_trend(int) to anon, authenticated;

-- 점검: select jsonb_pretty(kakao_sla_status()); select jsonb_pretty(kakao_weekly_trend(3));

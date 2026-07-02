-- 20260702_kakao_alert_pipeline.sql
-- 상담 데이터 이상탐지를 "검증된 SQL"에서 "자동 Slack 알림"으로 전환.
--
-- 배경: analysis/outputs/08_이상탐지_알림.md 가 수집중단·카테고리급증 탐지 SQL을 설계하고
-- 실제 실행까지 검증했으나("실행 확인 완료"), 알림 발송 자체는 "예정"으로 남아 있었다(문서
-- §4 "연동 방식(택1)"). 그 SQL을 RPC 함수로 옮기고, supabase/functions/kakao-alert 가
-- pg_cron(10분)으로 주기 호출해 이상 감지 시 Slack으로 보낸다.

-- 1) 알림 중복 억제 상태 테이블 — 같은 사고를 반복 알리지 않고, 해소되면 복구 알림 1회.
create table if not exists public.kakao_partner_alert_state (
  alert_key         text primary key,
  status            text not null default 'ok' check (status in ('ok','alerting')),
  first_alert_at    timestamptz,
  last_notified_at  timestamptz,
  last_payload      jsonb,
  updated_at        timestamptz not null default now()
);

alter table public.kakao_partner_alert_state enable row level security;
-- 정책 미정의 → service_role 전용(kakao_partner_secrets 과 동일 보안 모델). 운영 상태값이라
-- PII 는 아니지만, 외부 노출 시 수집 인프라 상태가 드러나므로 anon/authenticated 접근 차단.

-- 2) RPC ① 수집 헬스 — heartbeat/에러/메시지공백을 함께 판정해야 "심장은 뛰는데 데이터 0"
--    같은 함정을 잡는다(08번 문서 §2 이식, 2026-06-26 실제 사고에서 검증된 로직).
create or replace function public.kakao_collection_health()
returns table(
  profile_id      text,
  channel_label   text,
  hb_age_min      numeric,
  last_error      text,
  hrs_since_msg   numeric,
  health          text  -- 'ok' | 'warning' | 'critical'
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.profile_id,
    case s.profile_id when '_xfxilXn' then '시대인재C'
                      when '_TkpPG'   then '라이브'
                      when '_VGAQn'   then '마이클래스' else s.profile_id end as channel_label,
    round(extract(epoch from (now() - s.last_heartbeat_at))/60.0, 1) as hb_age_min,
    s.last_error,
    (select round(extract(epoch from (now() - max(m.sent_at)))/3600.0, 1)
       from public.kakao_partner_messages m where m.profile_id = s.profile_id) as hrs_since_msg,
    case
      when s.last_error is not null and s.last_error_at > now() - interval '15 min'
           then 'critical'
      when (select max(m.sent_at) from public.kakao_partner_messages m
              where m.profile_id = s.profile_id) < now() - interval '6 hours'
           then 'warning'
      when s.last_heartbeat_at < now() - interval '15 min'
           then 'warning'
      else 'ok'
    end as health
  from public.kakao_partner_stream_state s
  order by s.profile_id;
$$;

-- 3) RPC ② 카테고리 급증 — 오늘자만 대상(알림용). 과거 추세 조회는 08번 문서 §1-2 SQL을
--    직접 실행. baseline_7d 는 "그 카테고리의 직전 7일 평균"(요일·계절성 보정은 추후 과제).
create or replace function public.kakao_category_spike(min_ratio numeric default 2.0, min_count int default 5)
returns table(
  d            date,
  category     text,
  cnt          bigint,
  baseline_7d  numeric,
  ratio        numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with daily as (
    select date_trunc('day', c.last_log_send_at)::date as d, c.category, count(*) as cnt
    from public.kakao_partner_chats c
    where c.category is not null
    group by 1, 2
  ),
  roll as (
    select d, category, cnt,
      avg(cnt) over (partition by category order by d
                     rows between 7 preceding and 1 preceding) as baseline_7d
    from daily
  )
  select d, category, cnt, round(baseline_7d, 1) as baseline_7d,
         round(cnt / nullif(baseline_7d, 0), 2) as ratio
  from roll
  where baseline_7d is not null
    and cnt >= min_count
    and cnt > baseline_7d * min_ratio
    and d = current_date
  order by ratio desc;
$$;

grant execute on function public.kakao_collection_health() to anon, authenticated;
grant execute on function public.kakao_category_spike(numeric, int) to anon, authenticated;

-- 4) 자동 실행용 토큰 발급(1회, 재적용해도 기존 값 유지)
insert into public.kakao_partner_secrets(key, value, updated_at)
values ('kakao_alert_token', encode(gen_random_bytes(24), 'hex'), now())
on conflict (key) do nothing;

-- 5) pg_cron 등록(10분마다). SLACK_WEBHOOK_URL 을 Edge Function 시크릿에 추가하면(Dashboard >
--    Edge Functions > kakao-alert > Secrets) 다음 실행부터 자동으로 Slack 발송이 켜진다.
--    미설정 상태로 둬도 함수는 정상 동작하며 로그 + kakao_partner_alert_state 테이블에는 계속 기록된다.
create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('kakao-alert-dispatch');
exception when others then null;
end $$;

select cron.schedule(
  'kakao-alert-dispatch',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := (select 'https://bnszzjaupayakkahmwsu.supabase.co/functions/v1/kakao-alert?token=' || value
              from kakao_partner_secrets where key = 'kakao_alert_token'),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
    where exists (select 1 from kakao_partner_secrets where key = 'kakao_alert_token');
  $job$
);

-- 점검 쿼리(참고):
--   select * from kakao_partner_alert_state order by updated_at desc;
--   select * from kakao_collection_health();
--   select * from kakao_category_spike();
--   select jobname, schedule, active from cron.job where jobname='kakao-alert-dispatch';

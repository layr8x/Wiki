-- 20260702_kakao_daily_summary.sql
-- 매일 정해진 시각에 파이프라인 상태를 Slack으로 자동 발송(관리자 승인 불필요 경로).
--
-- 배경: kakao-status(Slack 슬래시 명령)는 워크스페이스에 새 "Commands" 권한을 추가하는
-- 것이라 관리자 승인이 필요했다(대기/거절 가능성 있음). 반면 kakao-alert가 이미 쓰는
-- SLACK_WEBHOOK_URL(수신 웹훅) 경로는 추가 승인 없이 이미 열려 있다. 이 마이그레이션은
-- 그 열려 있는 경로로 "물어보면 답한다" 대신 "매일 알아서 올라온다"를 구현한다.

-- 자동 실행용 토큰 발급(1회, 재적용해도 기존 값 유지)
insert into public.kakao_partner_secrets(key, value, updated_at)
values ('kakao_daily_summary_token', encode(gen_random_bytes(24), 'hex'), now())
on conflict (key) do nothing;

-- pg_cron 등록 — 매일 09:00 KST(=00:00 UTC) 1회.
-- 시각을 바꾸려면 schedule 의 두 값(시:분, UTC 기준)을 조정 — 예: 08:30 KST → '30 23 * * *'.
create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('kakao-daily-summary-dispatch');
exception when others then null;
end $$;

select cron.schedule(
  'kakao-daily-summary-dispatch',
  '0 0 * * *',
  $job$
    select net.http_post(
      url := (select 'https://bnszzjaupayakkahmwsu.supabase.co/functions/v1/kakao-daily-summary?token=' || value
              from kakao_partner_secrets where key = 'kakao_daily_summary_token'),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (select 1 from kakao_partner_secrets where key = 'kakao_daily_summary_token');
  $job$
);

-- 점검: select jobname, schedule, active from cron.job where jobname='kakao-daily-summary-dispatch';

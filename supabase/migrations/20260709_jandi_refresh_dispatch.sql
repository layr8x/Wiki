-- 20260709_jandi_refresh_dispatch.sql
-- 잔디 서버측 무중단 토큰 갱신(jandi-refresh) 디스패치.
-- access token 이 REFRESH_BEFORE_MS(4h) 이내로 남으면 refresh_token 으로 서버가 스스로 갱신한다
-- (맥 스튜디오·브라우저 불필요). 자주 불러도 함수 내부에서 신선하면 skip 하므로 30분 간격으로 확인.

insert into jandi_secrets (key, value)
values ('jandi_refresh_dispatch_token', gen_random_uuid()::text)
on conflict (key) do nothing;

select cron.schedule(
  'jandi-refresh-dispatch',
  '7,37 * * * *',
  $$
    select net.http_post(
      url := (select 'https://bnszzjaupayakkahmwsu.supabase.co/functions/v1/jandi-refresh?token=' || value
              from jandi_secrets where key = 'jandi_refresh_dispatch_token'),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (select 1 from jandi_secrets where key = 'jandi_refresh_dispatch_token');
  $$
);

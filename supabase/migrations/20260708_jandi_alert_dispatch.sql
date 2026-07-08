-- =============================================================================
-- 잔디(JANDI) 워치독 디스패치 — pg_cron 10분 주기로 jandi-alert 호출
-- =============================================================================
-- 카카오 kakao-alert-dispatch 와 동일 패턴. 분(minute)은 :00 을 피해 3,13,...53 오프셋
-- (전 세계 크론이 :00 에 몰리는 것을 피함). jandi-alert 이 토큰 만료 임박·채널 정체·오류를
-- 감시해 Slack 으로 알린다. 선행: 20260708_jandi_alert.sql (jandi_alert_token 생성).
-- =============================================================================

select cron.schedule(
  'jandi-alert-dispatch',
  '3,13,23,33,43,53 * * * *',
  $$
    select net.http_post(
      url := (select 'https://bnszzjaupayakkahmwsu.supabase.co/functions/v1/jandi-alert?token=' || value
              from jandi_secrets where key = 'jandi_alert_token'),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
    where exists (select 1 from jandi_secrets where key = 'jandi_alert_token');
  $$
);

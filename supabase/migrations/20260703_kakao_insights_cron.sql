-- 20260703_kakao_insights_cron.sql
-- 심화 분석 Slack 리포트(kakao-insights) 주간 스케줄: 매주 월요일 09:10 KST(=월 00:10 UTC).
-- 일일 요약(09:00)과 분리해, 밀도 높은 심화 분석은 주 1회 전달. 토큰은 kakao_partner_secrets 에서 조회.
select cron.schedule('kakao-insights-dispatch', '10 0 * * 1', $cmd$
    select net.http_post(
      url := (select 'https://bnszzjaupayakkahmwsu.supabase.co/functions/v1/kakao-insights?token=' || value
              from kakao_partner_secrets where key = 'kakao_insights_token'),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (select 1 from kakao_partner_secrets where key = 'kakao_insights_token');
  $cmd$);

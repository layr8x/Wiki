-- 20260625_kakao_collect_edge_function.sql
-- 카카오 수집 트리거를 GitHub Actions(workflow_dispatch) → Supabase Edge Function 직접 호출로 전환.
--
-- 배경: 저장소가 비공개라 GitHub Actions 무료 실행시간(월 ~2,000분)에 한도가 있다. 5분마다
--   돌리면 매달 중순쯤 소진돼 작업이 "러너 미배정"으로 즉시 실패하고 수집이 멈춘다(2026-06
--   실제 발생: 6/18~). Edge Function(supabase/functions/kakao-collect)은 항상 켜진 Supabase
--   안에서 직접 돌아 GitHub Actions 사용시간 0 → 매달 멈추는 일이 사라진다.
--
--   (전) pg_cron ──▶ GitHub workflow_dispatch ──▶ Actions 러너 ──▶ collect-once.mjs
--   (후) pg_cron ──▶ net.http_post ──▶ Edge Function kakao-collect (Actions 0)
--
-- 인증: kakao_partner_secrets.key='kakao_collect_token' 의 토큰을 ?token= 으로 전달(함수가 비교).
--   토큰 최초 생성(1회, 값은 커밋 금지):
--     insert into kakao_partner_secrets(key,value,updated_at)
--     values('kakao_collect_token', encode(gen_random_bytes(24),'hex'), now())
--     on conflict (key) do update set value=excluded.value, updated_at=now();
-- 쿠키: kakao_partner_secrets.key='kakao_partner_cookie' (담당자 기기 Chrome 6h 자동 배달, 함수가 읽음).
-- 함수 배포는 SQL 마이그레이션 밖(별도): `supabase functions deploy kakao-collect --no-verify-jwt`
--   또는 MCP deploy_edge_function. (이 파일은 cron 트리거만 전환.)

select cron.alter_job(
  (select jobid from cron.job where jobname = 'kakao-collect-dispatch'),
  schedule := '*/5 * * * *',
  command := $job$
    select net.http_post(
      url := (select 'https://bnszzjaupayakkahmwsu.supabase.co/functions/v1/kakao-collect?token=' || value
              from kakao_partner_secrets where key = 'kakao_collect_token'),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    )
    where exists (select 1 from kakao_partner_secrets where key = 'kakao_collect_token');
  $job$
);

-- 점검: select jobname, schedule, active from cron.job where jobname='kakao-collect-dispatch';
--       select id, status_code, left(content,200) from net._http_response order by created desc limit 5;

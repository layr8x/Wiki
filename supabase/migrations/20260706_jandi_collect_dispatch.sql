-- 20260706_jandi_collect_dispatch.sql
-- 잔디(JANDI) 상시 수집 자동화 — pg_cron 이 5분마다 Edge Function(jandi-collect) 직접 호출.
--
-- 카카오(kakao-collect-dispatch)와 동일 패턴. 항상 켜진 Supabase 안에서 도는 pg_cron 이
-- net.http_post 로 Edge Function 을 5분마다 두드린다 → GitHub Actions 사용시간 0, 무인 상시 수집.
--
--   pg_cron ──▶ net.http_post ──▶ Edge Function jandi-collect ──▶ jandi_messages
--
-- 선행 조건(이 파일 전에 1회):
--   1) supabase/migrations/20260706_jandi.sql 적용(테이블·시드).
--   2) `supabase functions deploy jandi-collect --no-verify-jwt` (함수 배포).
--   3) 시크릿 2개 등록(값은 커밋 금지):
--        insert into jandi_secrets(key,value)
--          values('jandi_access_token','eyJ...(잔디 로그인 토큰, 수명 ~12h)')
--          on conflict (key) do update set value=excluded.value, updated_at=now();
--        insert into jandi_secrets(key,value)
--          values('jandi_collect_token', encode(gen_random_bytes(24),'hex'))
--          on conflict (key) do update set value=excluded.value, updated_at=now();
--   상세: docs/JANDI_SETUP.md
--
-- 인증: jandi_secrets.key='jandi_collect_token' 을 ?token= 으로 전달(함수가 비교).
-- ⚠️ access token 수명이 ~12h 로 짧다 → 만료 시 수집이 멈춘다. jandi_access_token 을 주기적으로
--    갱신 배달하는 잡(scripts/jandi-refresh-token.mjs, docs §4-C)을 함께 돌려야 무인 운영이 성립.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 재적용 안전(멱등): 기존 잡이 있으면 먼저 해제.
select cron.unschedule('jandi-collect-dispatch')
where exists (select 1 from cron.job where jobname = 'jandi-collect-dispatch');

select cron.schedule('jandi-collect-dispatch', '*/5 * * * *', $job$
  select net.http_post(
    url := (select 'https://bnszzjaupayakkahmwsu.supabase.co/functions/v1/jandi-collect?token=' || value
            from jandi_secrets where key = 'jandi_collect_token'),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  where exists (select 1 from jandi_secrets where key = 'jandi_collect_token');
$job$);

-- 점검: select jobname, schedule, active from cron.job where jobname='jandi-collect-dispatch';
--       select id, status_code, left(content,200) from net._http_response order by created desc limit 5;

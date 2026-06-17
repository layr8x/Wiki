-- 20260617_kakao_collect_pg_cron_dispatch.sql
-- "더 확실한 자동장치": 카카오 수집 트리거를 GitHub 자체 cron 에서 Supabase pg_cron 으로.
--
-- 배경: GitHub Actions 의 schedule(cron) 은 무료 러너 부하에 따라 첫 실행이 수십 분~수
-- 시간 지연되거나 건너뛰는 경우가 있어 "5분마다"가 보장되지 않는다(특히 새 워크플로).
-- 반면 Supabase Postgres 는 상시 가동이며 pg_cron 은 분 단위로 정확히 실행된다.
-- 그래서 항상 켜진 Supabase 가 5분마다 GitHub 의 workflow_dispatch 를 호출(pg_net)해
-- 검증된 수집 워크플로(.github/workflows/kakao-collect.yml)를 깨운다.
--
--   pg_cron(*/5) ──▶ pg_net.http_post ──▶ GitHub workflow_dispatch ──▶ 수집 실행
--
-- GitHub 의 네이티브 schedule 트리거는 베스트에포트 백업으로 그대로 둔다(concurrency
-- group + 멱등 upsert 로 중복 무해).
--
-- 보안: GitHub Fine-grained PAT(해당 저장소 Actions: write 1개 권한)을 Supabase Vault 에
-- 암호화 저장하고, cron 잡이 실행 시점에만 복호화해 Authorization 헤더로 사용한다.
-- PAT 값 자체는 이 파일/저장소 어디에도 두지 않는다.

-- 1) 확장 활성화(멱등)
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 2) GitHub PAT 를 Vault 에 저장 — 토큰 발급/교체 시 1회 수동 실행(값은 커밋 금지).
--    최초 등록:
--      select vault.create_secret(
--        'github_pat_xxx...',            -- Fine-grained PAT (repo: sdij-wiki, Actions: Read and write)
--        'github_actions_pat',
--        'kakao-collect 5분 디스패치용 GitHub PAT');
--    교체(이미 있을 때):
--      select vault.update_secret(
--        (select id from vault.secrets where name = 'github_actions_pat'),
--        'github_pat_새토큰...', 'github_actions_pat', 'kakao-collect 5분 디스패치용 GitHub PAT');

-- 3) 5분마다 GitHub Actions(kakao-collect.yml) 를 dispatch (멱등 재설치)
do $$
begin
  perform cron.unschedule('kakao-collect-dispatch');
exception when others then null;  -- 잡이 없으면 무시
end $$;

select cron.schedule(
  'kakao-collect-dispatch',
  '*/5 * * * *',
  $job$
  -- Vault 에 github_actions_pat 가 있을 때만 호출(토큰 미등록 시 무의미한 401 호출 방지).
  select net.http_post(
    url := 'https://api.github.com/repos/layr8x/sdij-wiki/actions/workflows/kakao-collect.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_actions_pat'),
      'Accept', 'application/vnd.github+json',
      'User-Agent', 'supabase-pg-cron',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('ref', 'main')
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'github_actions_pat');
  $job$
);

-- 점검 쿼리(참고)
--   실행 이력 : select * from cron.job_run_details where jobid =
--               (select jobid from cron.job where jobname='kakao-collect-dispatch')
--               order by start_time desc limit 10;
--   호출 응답 : select id, status_code, created from net._http_response order by created desc limit 10;
--               (GitHub dispatch 성공 = status_code 204)
--   일시중지 : select cron.unschedule('kakao-collect-dispatch');

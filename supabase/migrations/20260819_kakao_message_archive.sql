-- 20260819_kakao_message_archive.sql
-- 카카오 상담 메시지 자동 백업+정리 파이프라인.
--
-- 배경: Supabase 무료 요금제 DB 용량 한도(500MB)를 kakao_partner_messages 하나가
-- 넘겼다(2026-08-19 실측 1,233MB, 그 중 이 테이블이 1,074MB). 유예기간은 9월 4일까지 —
-- 그 이후엔 이 프로젝트의 모든 API 요청이 막힐 수 있다(Fair Use Policy).
--
-- 대부분은 LIVE 채널의 오래된 기록이다(102만 건 중 최근 90일 것은 6.6%뿐, 2023-12부터 누적).
-- 무작정 지우지 않고, Storage(별도 저장공간, DB 용량과 무관)에 먼저 압축 저장한 뒤 확인되면
-- 그때만 DB에서 지운다. kakao-archive Edge Function(pg_cron 10분마다)이 이 일을 한다.

-- pg_cron/pg_net 은 이미 설치돼 있다. `create extension if not exists` 로 재실행하면
-- Supabase 관리형 확장의 사후 훅 스크립트가 다시 돌면서 권한 충돌로 실패한다(2026-08-19 실측:
-- "dependent privileges exist" — 이미 설치된 확장을 건드리지 말 것).

-- 백업 실행 기록 — 언제 어느 채널의 무엇이 어디로 백업됐는지 추적(감사·복구용).
create table if not exists public.kakao_archive_log (
  id bigint generated always as identity primary key,
  profile_id text not null,
  object_path text not null,
  row_count integer not null,
  min_sent_at timestamptz,
  max_sent_at timestamptz,
  bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists kakao_archive_log_profile_idx on public.kakao_archive_log (profile_id, created_at desc);

-- 백업 파일을 담을 저장공간(비공개 — 마스킹된 상담 내용이라도 공개 다운로드는 금지).
insert into storage.buckets (id, name, public)
values ('kakao-archive', 'kakao-archive', false)
on conflict (id) do nothing;

-- 자동 실행용 토큰 발급(1회, 재적용해도 기존 값 유지)
insert into public.kakao_partner_secrets(key, value, updated_at)
values ('kakao_archive_token', encode(gen_random_bytes(24), 'hex'), now())
on conflict (key) do nothing;

-- pg_cron 등록 — 10분마다. 정상 상태(백업할 오래된 메시지가 없음)에서는 즉시 끝나 부담 없다.
do $$
begin
  perform cron.unschedule('kakao-archive-dispatch');
exception when others then null;
end $$;

select cron.schedule(
  'kakao-archive-dispatch',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := (select 'https://bnszzjaupayakkahmwsu.supabase.co/functions/v1/kakao-archive?token=' || value
              from kakao_partner_secrets where key = 'kakao_archive_token'),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    )
    where exists (select 1 from kakao_partner_secrets where key = 'kakao_archive_token');
  $job$
);

-- 점검: select jobname, schedule, active from cron.job where jobname='kakao-archive-dispatch';
-- 점검: select * from kakao_archive_log order by created_at desc limit 20;

-- 20260702_kakao_classify_pipeline.sql
-- 카카오 상담 분류·감정 분석을 "사람이 수동 실행"에서 "pg_cron 자동 실행"으로 전환.
--
-- 배경(실측, 2026-07-02): kakao_partner_chats.category_classified_at 을 확인해보니 분류된
-- 7,195건 전부가 2026-06-17 단 하루에 몰려 있고, 이후 완전히 멈춰 있었다(신규 chat 207건이
-- category IS NULL 로 방치). sentiment 는 40,261건의 user 메시지 중 0건 처리
-- (analysis/outputs/00_운영화_체크리스트.md · 회고 문서의 "남은 과제"). 원인은 분류가
-- scripts/classify-kakao-stream.mjs 를 사람이 수동 npm run 해야만 동작했고, kakao-collect
-- (수집) 파이프라인처럼 상시 자동화돼 있지 않았기 때문이다.
--
-- 또한 category_confidence 가 정확히 0.70/0.30 두 값만 존재하는 실측 패턴
-- (analysis/outputs/05_상담분류_고도화.md §1-3)은 이 값들이 "출처 불명 레거시 키워드
-- 분류기"의 산출물임을 뜻한다 — 그 분류기 코드는 이 저장소 어디에도 커밋된 적이 없다.
--
-- 이 마이그레이션은 supabase/functions/kakao-classify 를 pg_cron(15분)으로 무인 실행시킨다.
-- 분류 방식은 함수가 자동 감지한다: ANTHROPIC_API_KEY 시크릿이 있으면 Claude Haiku(LLM,
-- 05번 문서의 권고안), 없으면 재구성 키워드 규칙(first-user-message 기준)으로 폴백한다.

-- 1) 분류 출처 추적 컬럼(관측성). 값:
--    'rule'    — 레거시(원본 미상, 이 저장소에 없음, last_message 기준으로 추정)
--    'rule_v2' — 이 파이프라인의 재구성 규칙(first-user-message 기준)
--    'llm'     — Claude Haiku
--    'lexicon' — (sentiment 전용) 키워드 사전 폴백
alter table public.kakao_partner_chats
  add column if not exists category_model text;
alter table public.kakao_partner_messages
  add column if not exists sentiment_model text;

-- 2) 기존 분류 결과에 출처를 소급 표기(분류 값 자체는 건드리지 않음 — 메타데이터만 채움).
--    이렇게 해야 ③의 "레거시 기타 재검토 큐"가 정확히 골라진다.
update public.kakao_partner_chats
   set category_model = 'rule'
 where category is not null and category_model is null;

-- 3) 재검토 큐 조회 최적화(레거시 '기타'/0.30 건만 대상 — 확정 분류는 절대 안 건드림)
create index if not exists chats_category_review_idx
  on public.kakao_partner_chats (category_confidence, category_model)
  where category_confidence = 0.30;

-- 4) 자동 실행용 토큰 발급(1회, 재적용해도 기존 값 유지 — kakao_collect_token 과 동일 패턴)
insert into public.kakao_partner_secrets(key, value, updated_at)
values ('kakao_classify_token', encode(gen_random_bytes(24), 'hex'), now())
on conflict (key) do nothing;

-- 5) pg_cron 등록(15분마다) — kakao-collect-dispatch 와 동일 패턴(토큰 비교 인증).
--    함수 배포는 이 파일 밖(별도): `supabase functions deploy kakao-classify --no-verify-jwt`
--    또는 MCP deploy_edge_function.
--    ANTHROPIC_API_KEY 를 Edge Function 시크릿에 추가하면(Dashboard > Edge Functions >
--    kakao-classify > Secrets) 다음 실행부터 자동으로 LLM 분류로 격상된다(재배포 불필요 —
--    함수가 매 요청마다 Deno.env 를 읽음).
create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('kakao-classify-dispatch');
exception when others then null; -- 잡이 없으면 무시(최초 적용)
end $$;

select cron.schedule(
  'kakao-classify-dispatch',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := (select 'https://bnszzjaupayakkahmwsu.supabase.co/functions/v1/kakao-classify?token=' || value
              from kakao_partner_secrets where key = 'kakao_classify_token'),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    )
    where exists (select 1 from kakao_partner_secrets where key = 'kakao_classify_token');
  $job$
);

-- 점검 쿼리(참고):
--   select jobname, schedule, active from cron.job where jobname='kakao-classify-dispatch';
--   select id, status_code, left(content,200) from net._http_response order by created desc limit 5;
--   select category_model, count(*) from kakao_partner_chats group by 1 order by 2 desc;
--   select count(*) from kakao_partner_chats where category is null;             -- 미분류 잔여
--   select count(*) from kakao_partner_messages where sender_type='user' and sentiment is null;

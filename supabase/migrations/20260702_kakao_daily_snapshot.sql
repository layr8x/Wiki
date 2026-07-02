-- 20260702_kakao_daily_snapshot.sql
-- 일일 요약(kakao-daily-summary)의 실제 이력 저장소.
--
-- 배경: Slack으로 보내는 일일 요약 메시지 자체는 어디에도 안 쌓여, "며칠 전엔 어땠는지"
-- 나중에 다시 볼 방법이 없었다. 이 테이블은 매일 계산한 요약(운영 상태 + 오늘의 카테고리·
-- 감정 분석)을 날짜별로 남겨, 나중에 추세 비교·주간 리포트 등에 재사용할 수 있게 한다.

create table if not exists public.kakao_partner_daily_snapshot (
  snapshot_date date primary key,
  summary       jsonb not null,
  created_at    timestamptz not null default now()
);

alter table public.kakao_partner_daily_snapshot enable row level security;
-- 정책 미정의 → service_role 전용(다른 kakao_partner_* 운영 테이블과 동일 보안 모델).
-- 대시보드 등에서 공개 조회가 필요해지면 이후 별도 마이그레이션으로 anon select 정책 추가.

-- 점검: select snapshot_date, summary from kakao_partner_daily_snapshot order by snapshot_date desc limit 7;

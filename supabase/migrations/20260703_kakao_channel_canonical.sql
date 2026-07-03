-- 20260703_kakao_channel_canonical.sql
-- 채널 명칭 정본화(단일 진실원). 기존엔 각 분석 RPC·리포트에 채널 매핑
--   (array['_VGAQn','_TkpPG','_xfxilXn'] <-> array['마이클래스','라이브','시대인재C'])이
--   인라인으로 흩어져 있었고 명칭도 일부 틀렸음. 5채널 정본으로 통일(CLAUDE.md §16).
create table if not exists public.kakao_channel (
  pid text primary key,
  label text not null,
  ord int not null
);
insert into public.kakao_channel(pid,label,ord) values
  ('_VGAQn','마이클래스',1),
  ('_rcpPG','LIVE',2),
  ('_TkpPG','LIVE 기술지원',3),
  ('_xfxilXn','콘텐츠',4),
  ('_rkbcn','통합로그인',5)
on conflict (pid) do update set label=excluded.label, ord=excluded.ord;
grant select on public.kakao_channel to anon, authenticated, service_role;
alter table public.kakao_channel enable row level security;
drop policy if exists kakao_channel_read on public.kakao_channel;
create policy kakao_channel_read on public.kakao_channel for select to anon, authenticated using (true);

-- 분석 RPC 채널 매핑을 정본 테이블로 재지정(2026-07-03 적용).
--   배열형 CTE 함수: ch as (select unnest(array[...]) pid, unnest(array[...]) label)
--     -> ch as (select pid, label from public.kakao_channel)
--     (kakao_sla_status·kakao_action_chats·kakao_sla_attainment·kakao_insights·
--      kakao_channel_analysis·kakao_sentiment_trend·kakao_weekly_trend)
--   CASE형 라벨 함수: case profile_id when '_xfxilXn' then '시대인재C' ... end
--     -> 5채널 정식명 CASE로 확장(kakao_category_spike·kakao_collection_health).
-- (실제 재정의는 각 함수 정의를 정본 테이블 기준으로 create or replace 하여 반영.)
-- 미반영(구조상 하드코딩): kakao_hourly_inflow 는 채널별 고정 컬럼(cnt_*) 구조라
--   5채널 확장 시 반환 스키마 변경 필요 -> 별도 개편 예정(현재 리포트 영향 낮음).

-- 슬랙 리포트 엣지 함수(kakao-daily-summary·kakao-insights)의 CHANNEL_PRIORITY/
--   CHANNEL_BY_PID 상수도 5채널 정식명으로 갱신(코드 참조).

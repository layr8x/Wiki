-- 20260715_lock_down_analytics_function_execute.sql
-- 전수 검수 보안 하드닝 (2026-07-15). 프로덕션에 apply_migration 으로 이미 적용됨.
--
-- A) 재장애 방지: kakao_refresh_analytics_cache 는 예전 장애를 유발한 무거운 전수집계 함수인데
--    PUBLIC EXECUTE 라 누구나(anon/authenticated) RPC로 호출해 DB를 반복 부하줄 수 있었다.
--    cron/service_role/postgres 만 남기고 PUBLIC 회수. (읽기 함수는 캐시만 읽으므로 영향 없음)
revoke execute on function public.kakao_refresh_analytics_cache() from public;

-- B) 분석 read RPC 3종은 SECURITY DEFINER 라 RLS를 우회해 집계값을 돌려준다. 관리자 대시보드
--    (AdminOverviewPage, 로그인 필수)에서만 쓰이며 비로그인 공개 경로는 없음(검수 확인). 따라서
--    anon/PUBLIC 실행을 회수해 비로그인자에게 집계 데이터가 노출되지 않게 한다. authenticated 유지.
revoke execute on function public.get_chat_category_distribution(integer) from public, anon;
revoke execute on function public.get_response_time_distribution(integer) from public, anon;
revoke execute on function public.get_sentiment_trend(integer)          from public, anon;

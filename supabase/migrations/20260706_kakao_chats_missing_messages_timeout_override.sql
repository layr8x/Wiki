-- 20260706_kakao_chats_missing_messages_timeout_override.sql
-- 진짜 원인 조사 중 발견: authenticator 역할(Data API 접속 계정) 기본 statement_timeout=8s 인데,
-- LIVE 채널이 91.7% 처리된 지금 kakao_chats_missing_messages 실행이 실제로 약 15초 걸림(실측,
-- EXPLAIN ANALYZE). 8초 제한에 걸려 2026-07-06 02:20~02:40 5회 연속
-- "canceling statement due to statement timeout"로 진행 0.
--
-- ⚠️ 실측 결과: 이 함수 레벨 SET 만으로는 "호출 세션이 이미 더 짧은 statement_timeout 을
-- 설정해둔 경우"(authenticator 의 8s 세션 기본값이 정확히 이 경우) 그 8초 제한을 못 늦춘다
-- (동일 세션에서 SET statement_timeout='8s' 후 호출 시 여전히 8초에 취소되는 것을 실측 확인).
-- 진짜 수정은 뒤이은 20260706_kakao_backfill_messages_cursor.sql 의 커서 도입(스캔량 자체를
-- 줄임)이며, 이 SET 은 다른 호출 경로(예: 관리자 세션처럼 기본 제한이 더 느슨한 경우)에서
-- 이 함수 하나가 무한정 오래 도는 것을 막는 방어적 상한으로만 남겨둔다. 역할 전역 8초
-- 제한은 손대지 않음(다른 API 호출 보호).

alter function public.kakao_chats_missing_messages(text, int)
  set statement_timeout = '25000';

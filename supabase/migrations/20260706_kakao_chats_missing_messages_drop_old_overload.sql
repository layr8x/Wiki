-- 20260706_kakao_chats_missing_messages_drop_old_overload.sql
-- create or replace function 은 파라미터 목록이 다르면(p_after 추가) 기존 (text,int) 함수를
-- 대체하지 않고 별도 오버로드를 새로 만든다 -> 2-인자 호출이 모호(ambiguous)해짐(실측 확인,
-- "function kakao_chats_missing_messages(unknown, integer) is not unique" 에러).
-- 옛 (text,int) 시그니처를 명시적으로 제거해 (text,int,text default null) 하나만 남긴다.

drop function if exists public.kakao_chats_missing_messages(text, int);

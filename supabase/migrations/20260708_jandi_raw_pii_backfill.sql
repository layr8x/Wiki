-- 20260708_jandi_raw_pii_backfill.sql
-- 목적(보안/데이터 최소화):
--  잔디 수집기가 raw jsonb 에 원본 레코드를 통째로 저장하면서 raw->message->content 에
--  "마스킹 이전" 원문(전화/이름 등 PII)이 그대로 남아 있었다(message 컬럼은 마스킹되지만 raw 는 우회).
--  코드(jandi-collect, scripts/lib/jandi-client.mjs)는 sanitizeRaw 로 본문을 빼도록 고쳤고,
--  이미 쌓인 행의 raw->message->content 를 제거한다(메타데이터는 보존).
-- 실행 시점 대상: 333행(전부 raw->message->content 보유). 멱등(이미 제거된 행은 매칭 안 됨).

update jandi_messages
set raw = raw #- '{message,content}'
where raw #> '{message,content}' is not null;

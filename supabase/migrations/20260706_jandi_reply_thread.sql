-- 20260706_jandi_reply_thread.sql
-- 잔디(JANDI) 댓글(스레드 답글) 그룹핑 지원 — 부모 메시지 참조 컬럼 추가.
--
-- 잔디 메시지의 message.feedbackId 는 "이 메시지가 어떤 메시지에 대한 댓글/답글인지"를
-- 가리킨다(그 대상의 message_id 값, -1 이면 댓글 아님). 관리자 화면에서 원글 아래 댓글을
-- 묶어 보여주기 위해 저장해둔다.

alter table jandi_messages
  add column if not exists reply_to_message_id text;

create index if not exists idx_jandi_messages_reply_to
  on jandi_messages (reply_to_message_id) where reply_to_message_id is not null;

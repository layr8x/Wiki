-- 20260708_kakao_sentiment_backlog_index.sql
-- 목적(분석 파이프라인 복구):
--  kakao-classify 의 감정 미처리 조회
--    select log_id, message from kakao_partner_messages
--    where sender_type='user' and sentiment is null and message is not null
--    order by sent_at desc limit N
--  가 맞는 인덱스가 없어 약 46만 행을 통째로 훑어(top-N heapsort) 콜드 10.7초 → Edge Function 의
--  8초 statement_timeout 을 넘겨 실패했고, 그 실패를 함수가 삼켜 감정 0건을 쓰고도 200 을 반환했다
--  (겉으론 크론·HTTP 성공). 조건 일치 행만 sent_at 내림차순으로 담는 부분 인덱스로 top-N 을
--  인덱스 스캔(실측 7.5ms)으로 전환한다. 처리된 행은 sentiment 가 채워져 인덱스에서 빠지므로
--  인덱스는 미처리 백로그만큼만 유지된다.
-- 주의: CONCURRENTLY 는 트랜잭션 밖에서만 가능(운영 반영은 execute_sql 로 직접 실행함).
--       마이그레이션 파일로는 기록용이며, 재현 시 psql 등 비트랜잭션 컨텍스트에서 실행할 것.

create index concurrently if not exists kakao_msg_sentiment_backlog_idx
  on kakao_partner_messages (sent_at desc)
  where sender_type = 'user' and sentiment is null and message is not null;

-- 분석 신선도 워치독(kakao-alert)이 "최근 분류 시각" 을 빠르게 읽도록 부분 인덱스.
create index concurrently if not exists kakao_msg_sentiment_classified_at_idx
  on kakao_partner_messages (sentiment_classified_at desc)
  where sentiment_classified_at is not null;

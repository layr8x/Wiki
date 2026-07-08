-- 20260708_kakao_analytics_perf_indexes.sql
-- 목적(분석 파이프라인 복구 - 일일요약):
--  kakao-daily-summary 가 부르는 집계 RPC 2개가 1M행 messages 를 전체 스캔해 8초 Edge 제한을
--  넘겨(각각 18.8s / 12.0s) daily-summary 전체를 statement timeout 으로 실패시켜, 일일요약
--  스냅샷이 며칠째 저장되지 않았다(2026-07-03 이후 정지). 두 RPC 의 감정 집계는 실제로는
--  최근 14일(혹은 window_days)만 필요한데 전체 기간을 훑던 것이 원인.
--  ① kakao_sentiment_trend: 함수에 14일 창 WHERE 추가(별도 마이그레이션) + 아래 인덱스.
--  ② kakao_channel_analysis: sen CTE(sentiment is not null, sent_at 창)가 아래 인덱스를 사용.
-- 결과(실측): sentiment_trend 18.8s→1.6s, channel_analysis 12.0s→1.4s.
-- 주의: CONCURRENTLY 는 트랜잭션 밖 실행 필요(운영 반영은 execute_sql 로 직접 실행함, 기록용).

-- sentiment_trend 용(감정 라벨된 user 메시지, sent_at 범위)
create index concurrently if not exists kakao_msg_sentiment_trend_idx
  on kakao_partner_messages (sent_at)
  where sender_type = 'user' and sentiment is not null;

-- channel_analysis 의 sen CTE 용(sender_type 무관, sentiment 라벨 전건)
create index concurrently if not exists kakao_msg_sentiment_notnull_sentat_idx
  on kakao_partner_messages (sent_at)
  where sentiment is not null;

-- kakao_status_summary 의 total_user_msgs = count(*) where sender_type='user' 가 1M행을
-- 전체 스캔해 13.5s → 8초 초과. user 메시지 부분 인덱스로 index-only count(1.6s)로 전환.
create index concurrently if not exists kakao_msg_user_idx
  on kakao_partner_messages (sent_at)
  where sender_type = 'user';

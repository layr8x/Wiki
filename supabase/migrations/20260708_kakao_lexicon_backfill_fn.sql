-- 20260708_kakao_lexicon_backfill_fn.sql
-- 감정 백로그(약 46만건) 일괄 분류용 배치 함수.
-- kakao-classify 의 어휘사전(lexicon) 분류를 SQL 로 동일 포팅:
--   pos/neg = 각 사전 단어의 포함 개수, score=(pos-neg)*0.4 clamp[-1,1],
--   pos>neg → positive / neg>pos → negative / 같으면 neutral. (엣지함수 lexicon 과 결과 동일)
-- 한 번에 batch_n 행만 처리하고 처리 건수를 반환 → pg_cron 이 매분 호출해 서버측에서 드레인
-- (MCP/클라이언트 60초 타임아웃 회피). 드레인 완료 후 임시 cron('kakao-lexicon-backfill-temp')은 제거.
-- 신규 유입은 kakao-classify(인덱스 적용 후 즉시 처리)가 담당하므로 이 함수는 과거분 소진 전용.
create or replace function public.kakao_lexicon_backfill_batch(batch_n integer default 25000)
returns integer
language plpgsql
as $$
declare updated integer;
begin
  with batch as (
    select log_id, message from public.kakao_partner_messages
    where sender_type='user' and sentiment is null and message is not null
    limit batch_n
  ), scored as (
    select log_id,
      ((position('감사' in message)>0)::int + (position('고맙' in message)>0)::int + (position('좋아요' in message)>0)::int
       + (position('확인했' in message)>0)::int + (position('해결' in message)>0)::int + (position('잘 됐' in message)>0)::int
       + (position('잘됐' in message)>0)::int + (position('👍' in message)>0)::int) as pos,
      ((position('화나' in message)>0)::int + (position('짜증' in message)>0)::int + (position('답답' in message)>0)::int
       + (position('실망' in message)>0)::int + (position('불만' in message)>0)::int + (position('컴플레인' in message)>0)::int
       + (position('항의' in message)>0)::int + (position('안돼' in message)>0)::int + (position('안 돼' in message)>0)::int
       + (position('왜 안' in message)>0)::int + (position('도대체' in message)>0)::int + (position('제발' in message)>0)::int
       + (position('ㅠ' in message)>0)::int + (position('ㅜ' in message)>0)::int) as neg
    from batch
  ), upd as (
    update public.kakao_partner_messages m
    set sentiment = case when s.pos>s.neg then 'positive' when s.neg>s.pos then 'negative' else 'neutral' end,
        sentiment_score = greatest(-1.0, least(1.0, (s.pos - s.neg)*0.4)),
        sentiment_model = 'lexicon-backfill',
        sentiment_classified_at = now()
    from scored s where m.log_id = s.log_id
    returning 1
  )
  select count(*) into updated from upd;
  return updated;
end $$;

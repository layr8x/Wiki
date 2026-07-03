-- 20260703_kakao_sentiment_lexicon_v2.sql
-- 감정 사전 정밀 확장(무비용). 기존 14개 부정어가 은근한 불만("지연","아직도 못 받았","화가 나",
--   "왜 이렇게")을 놓쳐 부정률이 과소집계되던 것을 보정. 부정률 3.5% -> 3.9%.
-- 오탐 방지: 표본 검증에서 오탐이 잦던 '잘못'/'실수'(고객 본인 실수)·'별로'(개별로 오매칭) 등은 제외.
-- 방향: neutral -> negative 만 추가(기존 라벨은 건드리지 않음, 보수적).
update public.kakao_partner_messages
set sentiment = 'negative', sentiment_score = -0.4, sentiment_model = 'lexicon_v2', sentiment_classified_at = now()
where sender_type = 'user' and sentiment = 'neutral' and message is not null
  and (message like '%지연%' or message like '%아직도%' or message like '%최악%' or message like '%실망스%'
    or message like '%못 받았%' or message like '%화가 나%' or message like '%왜 이렇게%' or message like '%왜 이리%'
    or message like '%누락%' or message like '%불편%');

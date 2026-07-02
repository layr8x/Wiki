-- 20260703_kakao_legacy_mock_fix.sql
-- 정밀 검수 중 발견: 레거시 분류기(category_model='rule', 전체의 약 70%)에는 '모의고사·서바이벌'
-- 카테고리가 없어서, 서바이벌·모의고사·응시·등수 관련 대화가 계정/교재/대기/환불 등으로 흩어져 있었다.
-- (레거시를 rule_v3로 재판정 시 52%가 다른 카테고리, 그중 1,134건이 명백한 모의고사·서바이벌.)
-- 영향: 최근 30일 모의고사 문의가 133건으로 과소집계되던 것이 실제 216건으로 교정됨(문의 1위).
--
-- 조치(보수적): 레거시 'rule' 중 "모의고사·서바이벌 전용 키워드"가 명백한 대화만 정정.
--   계정<->라이브 같은 키워드 중첩으로 애매한 이동은 손대지 않는다(오분류 유발 방지 · LLM 도입 시 정밀 해소).
with tgt as (
  select c.chat_id,
    coalesce((select string_agg(message, ' ' order by sent_at asc) from (
      select message, sent_at from public.kakao_partner_messages
      where chat_id = c.chat_id and sender_type = 'user' and message is not null
      order by sent_at asc limit 3) q), c.last_message, '') as t
  from public.kakao_partner_chats c
  where c.category_model = 'rule' and c.category <> '모의고사·서바이벌'
),
res as (
  -- 우선순위상 더 좁은 카테고리(환불·통합·미납)에 먼저 걸리지 않고 모의고사 규칙에 걸리는 것만 채택.
  select chat_id, case
    when t ~ '환불' then '환불'
    when t ~ '통합\s*회원|계정\s*통합|형제.{0,4}계정|자매.{0,4}계정' then '통합회원'
    when t ~ '미납|결제|수강료|납부|가상계좌|청구|카드\s*승인|중복\s*결제|환급' then '미납·결제'
    when t ~ '서바이벌|서바\s|서프|전국\s*모의|모의\s*평가|모의고사|모평|응시|성적표|등수|채점|분석\s*결과|해설[지강]' then '모의고사·서바이벌'
    else '기타' end as v3
  from tgt
)
update public.kakao_partner_chats c
set category = '모의고사·서바이벌', category_confidence = 0.65, category_model = 'rule_v3', category_classified_at = now()
from res where res.chat_id = c.chat_id and res.v3 = '모의고사·서바이벌';

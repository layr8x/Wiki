-- 20260703_kakao_reclassify_cron.sql
-- 매일 08:50 KST(=23:50 UTC): 신규 유입 중 '기타'로 떨어진 대화를 rule_v3 규칙으로 재분류.
-- 목적: 분류 함수(kakao-classify)의 라이브 버전을 재배포하지 않고도 기타 비중을 낮게 유지.
--   (rule_v3 = 모의고사·서바이벌 신설 + 영상재생/기기/사이트 보강 + 첫 3개 고객 메시지 결합.
--    함수 index.ts 의 RULE_ENGINE 과 동일 규칙. 둘을 함께 갱신할 것.)
select cron.schedule('kakao-reclassify-etc', '50 23 * * *', $cmd$
  with tgt as (
    select c.chat_id,
      coalesce((select string_agg(message, ' ' order by sent_at asc) from (
        select message, sent_at from kakao_partner_messages
        where chat_id = c.chat_id and sender_type = 'user' and message is not null
        order by sent_at asc limit 3) q), c.last_message, '') as t
    from kakao_partner_chats c where c.category = '기타'
  ),
  res as (
    select chat_id,
      case
        when t ~ '환불' then '환불'
        when t ~ '통합\s*회원|계정\s*통합|형제.{0,4}계정|자매.{0,4}계정' then '통합회원'
        when t ~ '미납|결제|수강료|납부|가상계좌|청구|카드\s*승인|중복\s*결제|환급' then '미납·결제'
        when t ~ '서바이벌|서바\s|서프|전국\s*모의|모의\s*평가|모의고사|모평|응시|성적표|등수|채점|분석\s*결과|해설[지강]' then '모의고사·서바이벌'
        when t ~ '출석|출결|보강|결석' then '출결·보강'
        when t ~ '입반|반\s*배정|수강\s*신청|개강|접수|인강|인터넷\s*강의|온라인\s*강의|정규반|신청\s*내역' then '입반·등록'
        when t ~ '대기|웨이팅' then '대기'
        when t ~ '시간표|커리큘럼|강의실|강사|수업\s*시간' then '시간표·수업'
        when t ~ '교재|배송|택배|도착|미수령|문제집|도서' then '교재·배송'
        when t ~ '퇴원|그만\s*두|수강\s*취소|재수강\s*안' then '퇴원·취소'
        when t ~ '설명회|컨설팅|입시\s*상담' then '설명회·컨설팅'
        when t ~* '라이브|LIVE' then '라이브'
        when t ~ '로그인|아이디|비밀번호|비번|계정|앱|접속|인증|회원가입|연동|오류|에러|튕|먹통|실행|진입|플레이어|비디오|재생|영상|아이패드|맥북|mac\s*os|다운로드|버퍼|끊김|수강.{0,4}안|홈페이지|사이트' then '계정·로그인·앱'
        else '기타'
      end as cat
    from tgt
  )
  update kakao_partner_chats c
  set category = res.cat, category_confidence = 0.65, category_model = 'rule_v3', category_classified_at = now()
  from res where res.chat_id = c.chat_id and res.cat <> '기타';
$cmd$);

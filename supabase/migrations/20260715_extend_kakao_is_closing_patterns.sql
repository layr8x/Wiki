-- 마무리 인사(closing) 판정 보강 — "지금 처리할 대화" 오탐 제거 (2026-07-15)
--
-- 문제(모바일 실측): 고객의 마무리 인사 3종이 closing으로 안 잡혀, 이미 끝난 대화가
-- "지금 처리할 대화"에 24~44시간 대기로 계속 남았다.
--   · "다음에다시하겠습니다."  → '다음에'
--   · "네 참고하겠습니다"      → '참고하'
--   · "좋은하루보내세요"       → '좋은 ?하루'
--
-- 안전성: 질문/요청 패턴(?·가능·해주·부탁·되나요…)이 먼저 평가돼 false를 반환하므로,
-- "다음에 언제 되나요?" 같은 문의는 이 추가 패턴에 도달하기 전에 대기(비종결)로 분류된다.
create or replace function public.kakao_is_closing(msg text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select case
    when msg is null or length(trim(msg)) = 0 then true
    when msg ~ '\?|가능|해주|부탁|어떻게|언제|되나요|인가요|문의|여쭤|주세요|알려|취소|환불|안내|신청|해도' then false
    when msg ~ '감사|고마|수고|알겠|잘 받았|확인했|넵|넹|고맙|수고하|찾았|해결됐|해결했|알아냈|됐습니다|참고하|다음에|좋은 ?하루' then true
    when length(trim(msg)) <= 3 then true
    else false
  end;
$$;

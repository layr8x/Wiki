-- =============================================================================
-- 잔디(JANDI) 수집 대상 방 추가: 재종 데스크 업무 · 전체공지
-- =============================================================================
-- 배경: 김명준님 요청(2026-07-08)으로 신규 방 2개 추가.
--   jandi-collect Edge Function 은 jandi_channels 에서 is_active=true 인 방을
--   동적으로 조회해 폴링하므로(코드 재배포 불필요), 이 행만 추가하면
--   기존 pg_cron(5분 주기) 이 다음 실행부터 자동으로 이 방들도 수집한다.
-- 참고: 이 시점 jandi_access_token 이 만료 상태였음(2026-07-07 14시경 만료,
--   auth 401 기록). 토큰이 재발급된 이후부터 실제 수집이 시작된다.
-- =============================================================================

insert into jandi_channels (room_id, team_id, label, url) values
  ('31495551', '29522216', '재종 데스크 업무', 'https://flytofreedom.jandi.com/app/#!/room/31495551'),
  ('29522222', '29522216', '전체공지',       'https://flytofreedom.jandi.com/app/#!/room/29522222')
on conflict (room_id) do update set
  team_id = excluded.team_id,
  label   = excluded.label,
  url     = excluded.url,
  is_active = true,
  updated_at = now();

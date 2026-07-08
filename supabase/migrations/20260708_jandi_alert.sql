-- =============================================================================
-- 잔디(JANDI) 수집 워치독 — 알림 상태 테이블 + 인증 토큰
-- =============================================================================
-- 배경: 잔디 토큰(access token, 수명 ~12h)이 만료되고 갱신이 실패하면 5개 방 수집이
--   한꺼번에 조용히 멈춘다(2026-07 실측: 약 18시간 방치됨). 카카오는 kakao-alert 워치독이
--   이미 이 실패를 Slack 으로 알리는데, 잔디는 감시가 전혀 없었다. 카카오와 동일한 구조로
--   잔디 워치독(jandi-alert)을 추가한다. 상세: docs/JANDI_SETUP.md
-- 적용: Supabase Dashboard > SQL Editor 에 붙여넣고 RUN (또는 mcp apply_migration).
-- =============================================================================

-- ─── 알림 상태(쿨다운·중복억제) — kakao_partner_alert_state 와 동일 형태 ──────────
create table if not exists jandi_alert_state (
  alert_key         text primary key,       -- 예: 'token', 'health:31495011'
  status            text not null,          -- 'ok' | 'alerting'
  first_alert_at    timestamptz,            -- 경보 최초 시작(지속시간 계산용)
  last_notified_at  timestamptz,            -- 마지막 알림 발송(쿨다운 기준)
  last_payload      jsonb,
  updated_at        timestamptz default now()
);

alter table jandi_alert_state enable row level security;
-- 정책 0 → service_role 전용(외부 접근 차단). 카카오와 동일.

-- ─── 워치독 자체 호출 인증 토큰 (없으면 생성) ────────────────────────────────
insert into jandi_secrets (key, value)
values ('jandi_alert_token', gen_random_uuid()::text)
on conflict (key) do nothing;

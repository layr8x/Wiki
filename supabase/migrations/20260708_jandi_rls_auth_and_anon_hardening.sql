-- 20260708_jandi_rls_auth_and_anon_hardening.sql
-- 목적(보안):
--  (1) 잔디 3개 테이블의 비로그인(anon) 전체 읽기 제거 → 로그인 직원(authenticated) 전용.
--      2026-07-06 신설 시 카카오가 이미 고친 취약 패턴(using(true), role=public)을 복제했었음.
--      잔디는 직원이 학생/학부모(미성년 포함) 사례를 논의하는 내부방 → PII.
--  (2) 카카오/잔디 민감 테이블 SELECT 정책에 '익명 로그인 세션 배제' 조건 추가.
--      Supabase Anonymous Sign-Ins 가 켜져 있으면 누구나 authenticated 세션을 발급받을 수 있어
--      authenticated-전용 방어가 무력화될 수 있음 → is_anonymous 클레임이 true 인 세션은 배제.
--  (3) anon 역할의 잔디 테이블 GRANT 회수(2중 방어, 최소권한).
-- 관리자 페이지(/admin/consults, /admin/jandi)는 로그인 후 접근이라 authenticated 세션으로 동작 → 호환.
-- 쓰기(INSERT/UPDATE/DELETE)는 정책 미정의 → 기존대로 service_role 전용.

-- ── (1)+(2) 잔디: anon 정책 제거 후 authenticated + 익명배제 재생성 ──
drop policy if exists "anon_read_jandi_channels" on jandi_channels;
drop policy if exists "anon_read_jandi_messages" on jandi_messages;
drop policy if exists "anon_read_jandi_state"    on jandi_stream_state;
drop policy if exists "auth_read_jandi_channels" on jandi_channels;
drop policy if exists "auth_read_jandi_messages" on jandi_messages;
drop policy if exists "auth_read_jandi_state"    on jandi_stream_state;

create policy "auth_read_jandi_channels"
  on jandi_channels     for select to authenticated
  using ((select auth.jwt() ->> 'is_anonymous')::boolean is not true);
create policy "auth_read_jandi_messages"
  on jandi_messages     for select to authenticated
  using ((select auth.jwt() ->> 'is_anonymous')::boolean is not true);
create policy "auth_read_jandi_state"
  on jandi_stream_state for select to authenticated
  using ((select auth.jwt() ->> 'is_anonymous')::boolean is not true);

-- ── (2) 카카오: 기존 authenticated 정책에 익명배제 조건 추가 ──
drop policy if exists "auth_read_chats"    on kakao_partner_chats;
drop policy if exists "auth_read_messages" on kakao_partner_messages;
drop policy if exists "auth_read_state"    on kakao_partner_stream_state;

create policy "auth_read_chats"
  on kakao_partner_chats        for select to authenticated
  using ((select auth.jwt() ->> 'is_anonymous')::boolean is not true);
create policy "auth_read_messages"
  on kakao_partner_messages     for select to authenticated
  using ((select auth.jwt() ->> 'is_anonymous')::boolean is not true);
create policy "auth_read_state"
  on kakao_partner_stream_state for select to authenticated
  using ((select auth.jwt() ->> 'is_anonymous')::boolean is not true);

-- ── (3) anon 역할 테이블 GRANT 회수(정책이 이미 막지만 최소권한 원칙) ──
revoke select on jandi_channels, jandi_messages, jandi_stream_state from anon;

-- ── (4) 시크릿/알림상태 테이블은 anon 스키마 노출 자체를 제거(서비스롤 전용) ──
-- RLS-no-policy 로 이미 anon 읽기는 0건이나, GraphQL 스키마 가시성까지 없애 최소권한 강화.
revoke select on jandi_secrets, jandi_alert_state,
                 kakao_partner_secrets, kakao_partner_alert_state from anon;

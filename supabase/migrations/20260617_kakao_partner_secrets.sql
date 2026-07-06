-- 20260617_kakao_partner_secrets.sql
-- 카카오 파트너 쿠키 자동 배달용 비밀 저장소.
-- 회사 자산 맥 스튜디오의 Chrome 이 6시간마다 최신 세션 쿠키를 여기에 upsert → GitHub Actions 수집기가
-- 매 실행 시 최신 쿠키를 읽어감(쿠키 만료 수동 갱신 제거). service_role 전용.
--
-- 보안: 세션 쿠키는 계정 로그인 권한과 동등 → anon/authenticated 모두 접근 불가.
-- RLS 활성 + 정책 미정의 → service_role(키 우회)만 읽기/쓰기 가능.

create table if not exists kakao_partner_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table kakao_partner_secrets enable row level security;

-- 잔여 정책 제거 (멱등). 정책을 만들지 않음 → service_role 외 모든 접근 차단.
drop policy if exists "auth_read_secrets" on kakao_partner_secrets;
drop policy if exists "anon_read_secrets" on kakao_partner_secrets;

comment on table kakao_partner_secrets is
  '카카오 파트너 쿠키 등 스크립트 전용 비밀(service_role 전용). anon/authenticated 접근 차단.';

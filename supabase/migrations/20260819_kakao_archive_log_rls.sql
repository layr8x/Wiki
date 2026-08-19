-- 20260819_kakao_archive_log_rls.sql
-- kakao_archive_log 는 기본적으로 RLS(Row Level Security, DB가 어느 행을 보여줄지 정하는 규칙)가
-- 켜진 채로 생성됐지만 정책이 하나도 없어 서비스 역할(service_role) 외엔 아무도 못 읽었다.
-- "전체 다운로드"가 백업분까지 합쳐서 받으려면 로그인한 화면(프런트엔드)이 이 표를 읽어
-- 어떤 백업 파일이 있는지 알아야 한다 — kakao_partner_messages 와 같은 기준(로그인 계정만,
-- 익명 로그인 제외)으로 읽기를 허용한다.

create policy "auth_read_archive_log" on public.kakao_archive_log
  for select to authenticated
  using (((select (auth.jwt() ->> 'is_anonymous'::text)))::boolean is not true);

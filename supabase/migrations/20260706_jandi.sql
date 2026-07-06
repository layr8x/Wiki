-- =============================================================================
-- 잔디(JANDI) 팀 대화 수집 — 채널별(방별) 메시지 적재
-- =============================================================================
-- 적용: Supabase Dashboard > SQL Editor 에 전체 붙여넣고 RUN
-- 의존: 없음 (카카오 테이블과 완전 분리)
--
-- 배경: 잔디는 "대화 전체"를 내보내는 웹훅이 없다(아웃고잉 웹훅은 트리거 단어로 시작하는
--   메시지만 전송). 따라서 카카오 파트너센터와 동일하게, 로그인 세션의 access token 으로
--   잔디 내부 REST(i1.jandi.com/message-api/v2)를 방별로 증분 폴링해 적재한다.
--   상세: docs/JANDI_SETUP.md
-- =============================================================================

create extension if not exists pg_trgm;

-- ─── 채널(방) 메타 ───────────────────────────────────────────────────────────
create table if not exists jandi_channels (
  -- 잔디 방 ID (URL 의 /room/<id>) 예: "31495011"
  room_id            text primary key,
  -- 잔디 팀 ID (전 채널 공통) 예: "29522216"
  team_id            text not null,
  -- 사람이 읽는 채널명
  label              text,
  -- 원본 방 URL
  url                text,

  -- 증분 수집 커서: 마지막으로 적재한 메시지의 link_id (방 내 단조 증가)
  last_link_id       text,
  -- 마지막 활동(표시용)
  last_message       text,
  last_message_at    timestamptz,

  is_active          boolean default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- ─── 메시지 ─────────────────────────────────────────────────────────────────
create table if not exists jandi_messages (
  room_id            text not null references jandi_channels(room_id) on delete cascade,
  -- 방 내 메시지 커서(단조 증가). 증분 수집·중복 제거 기준.
  link_id            text not null,
  -- 잔디 message.id (글로벌). 편집돼도 유지.
  message_id         text,
  team_id            text not null,

  -- 보낸 사람(멤버 ID). 이름 매핑은 후속(멤버 API 확정 시). raw 에 원본 보존.
  writer_id          text,
  writer_name        text,

  content_type       text,     -- text/comment/sticker/file/... (잔디 contentType)
  message            text,     -- 본문(방어적 추출 + PII 라이트 마스킹)
  attachments        jsonb,    -- 첨부/파일/스티커 등 부가 정보

  created_at         timestamptz,   -- 메시지 작성 시각
  raw                jsonb,         -- 원본 레코드 통째 저장(매핑 변경 대비 — 재수집 불필요)
  ingested_at        timestamptz default now(),
  source             text not null default 'rest',

  primary key (room_id, link_id)
);

create index if not exists idx_jandi_messages_room_time
  on jandi_messages (room_id, created_at desc);
create index if not exists idx_jandi_messages_team_time
  on jandi_messages (team_id, created_at desc);
create index if not exists idx_jandi_messages_text_trgm
  on jandi_messages using gin (message gin_trgm_ops);

-- ─── 스트림 상태(수집 헬스/커서) ─────────────────────────────────────────────
create table if not exists jandi_stream_state (
  room_id            text primary key,
  last_seen_link_id  text,
  last_heartbeat_at  timestamptz default now(),
  last_error         text,
  last_error_at      timestamptz,
  total_messages     bigint default 0
);

-- ─── 시크릿 보관함(잔디 access token / 수집기 인증 토큰) ──────────────────────
-- RLS 활성 + 정책 0 → service_role 전용(외부 접근 완전 차단). 카카오와 동일 패턴.
create table if not exists jandi_secrets (
  key                text primary key,   -- 'jandi_access_token' | 'jandi_collect_token'
  value              text not null,
  updated_at         timestamptz default now()
);

-- ─── updated_at 자동 갱신 트리거(공용 함수 재사용) ───────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_jandi_channels_updated on jandi_channels;
create trigger trg_jandi_channels_updated
  before update on jandi_channels
  for each row execute function set_updated_at();

-- ─── RLS: anon 읽기 허용(관리자 화면), 쓰기는 service_role 만 ────────────────
alter table jandi_channels     enable row level security;
alter table jandi_messages     enable row level security;
alter table jandi_stream_state enable row level security;
alter table jandi_secrets      enable row level security;

drop policy if exists "anon_read_jandi_channels" on jandi_channels;
drop policy if exists "anon_read_jandi_messages" on jandi_messages;
drop policy if exists "anon_read_jandi_state"    on jandi_stream_state;

create policy "anon_read_jandi_channels"
  on jandi_channels for select using (true);
create policy "anon_read_jandi_messages"
  on jandi_messages for select using (true);
create policy "anon_read_jandi_state"
  on jandi_stream_state for select using (true);
-- jandi_secrets: SELECT 정책 없음 → service_role 만. INSERT/UPDATE/DELETE 정책도 없음.

-- ─── 채널 3개 시드 (사용자 지정) ─────────────────────────────────────────────
insert into jandi_channels (room_id, team_id, label, url) values
  ('31495011', '29522216', '시대 APP 기획/문의',            'https://flytofreedom.jandi.com/app/#!/room/31495011'),
  ('31962045', '29522216', '시대 APP 실험실',               'https://flytofreedom.jandi.com/app/#!/room/31962045'),
  ('33385655', '29522216', '재종통합행정 + 플랫폼서비스실 소통방', 'https://flytofreedom.jandi.com/app/#!/room/33385655')
on conflict (room_id) do update
  set team_id = excluded.team_id,
      label   = excluded.label,
      url     = excluded.url;

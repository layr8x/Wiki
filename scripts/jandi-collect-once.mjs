#!/usr/bin/env node
// scripts/jandi-collect-once.mjs
// 1회성 잔디(JANDI) 방별 증분 수집 — GitHub Actions cron 폴백용(주 수집은 Edge Function).
//
// 동작(방마다):
//   1) 토큰 유효성 확인(방 1건 ping) — 만료(401/403)면 마지막에 비정상 종료(exit 1)
//      → 워크플로 "실패" 알림(= 토큰 갱신 신호). 일시 오류는 성공 종료(오탐 방지).
//   2) jandi_channels.last_link_id 를 커서로 로드.
//   3) 최신 페이지(count=50) 수집 → 커서보다 과거로 갭이 있으면 type=old 로 최대 MAX_PAGES 페이지백필.
//   4) 멱등 upsert(PK: room_id+link_id) → 채널 커서/last_message + heartbeat 갱신.
//
// 실행:
//   node --env-file=.env.local scripts/jandi-collect-once.mjs
//   env: JANDI_ACCESS_TOKEN(폴백), JANDI_TEAM_ID, JANDI_MEMBER_ID(선택),
//        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { JandiClient, extractRecords, messageToRow, linkIdNum, maskCustomerInfo } from './lib/jandi-client.mjs';
import { getAdminClient } from './lib/supabase-admin.mjs';
import { maskBody, stripLoneSurrogates } from './lib/kakao-sanitize.mjs';

const TOKEN_ENV = process.env.JANDI_ACCESS_TOKEN;          // 폴백/시드용(1차 출처는 jandi_secrets)
const TEAM_ID = process.env.JANDI_TEAM_ID || '29522216';
const MEMBER_ID = process.env.JANDI_MEMBER_ID || null;
const TOKEN_KEY = 'jandi_access_token';
const PAGE = Number(process.env.JANDI_PAGE_SIZE || 50);
const MAX_PAGES = Number(process.env.JANDI_MAX_PAGES || 8);   // 방·1회당 갭 백필 상한(시간 방어)

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);
const isAuthError = (e) => e && (e.status === 401 || e.status === 403);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const missing = [['SUPABASE_URL', SUPABASE_URL], ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_KEY]]
  .filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.log(`[skip] 필수 시크릿 미설정(${missing.join(', ')}) — 수집 건너뜀.`);
  process.exit(0);
}

const supabase = getAdminClient();

// 토큰 출처: ① jandi_secrets 보관함(권장) → ② env 폴백.
async function resolveToken() {
  try {
    const { data, error } = await supabase
      .from('jandi_secrets').select('value, updated_at').eq('key', TOKEN_KEY).maybeSingle();
    if (!error && data?.value) { log(`token source: supabase (updated ${data.updated_at})`); return data.value; }
  } catch { /* 테이블 미적용 → env 폴백 */ }
  if (TOKEN_ENV) { log('token source: env (fallback)'); return TOKEN_ENV; }
  return null;
}

async function loadChannels() {
  const { data, error } = await supabase
    .from('jandi_channels').select('room_id, team_id, label, last_link_id').eq('is_active', true);
  if (error) throw new Error('jandi_channels load: ' + error.message);
  return data || [];
}

function sanitizeRow(row) {
  const out = { ...row };
  if (out.message != null) out.message = maskCustomerInfo(stripLoneSurrogates(maskBody(out.message)));
  return out;
}

async function upsertRows(rows) {
  const valid = rows.filter((r) => r.link_id);
  if (!valid.length) return 0;
  const { error } = await supabase.from('jandi_messages').upsert(valid, { onConflict: 'room_id,link_id' });
  if (error) { log('upsert fail:', error.message); return -1; }
  return valid.length;
}

async function persistHeartbeat(roomId, lastSeen, lastError) {
  try {
    await supabase.from('jandi_stream_state').upsert({
      room_id: roomId,
      last_seen_link_id: lastSeen || null,
      last_heartbeat_at: new Date().toISOString(),
      last_error: lastError,
      last_error_at: lastError ? new Date().toISOString() : null,
    }, { onConflict: 'room_id' });
  } catch (e) { log(`[${roomId}] state persist fail:`, e.message); }
}

// 방 1개 증분 수집.
async function collectRoom(client, ch) {
  const roomId = String(ch.room_id);
  const teamId = String(ch.team_id);
  const cursor = ch.last_link_id ? linkIdNum(ch.last_link_id) : 0;

  // 최신 페이지
  const first = await client.roomMessages(roomId, { count: PAGE });
  let recs = extractRecords(first);
  const collected = [...recs];

  // 커서보다 과거로 갭이 있으면 type=old 로 백필
  let pages = 1;
  if (cursor > 0 && recs.length) {
    let oldest = Math.min(...recs.map((r) => linkIdNum(r?.linkId ?? r?.id)));
    while (oldest > cursor && pages < MAX_PAGES) {
      const page = await client.roomMessages(roomId, { count: PAGE, linkId: oldest, type: 'old' });
      const more = extractRecords(page);
      if (!more.length) break;
      collected.push(...more);
      oldest = Math.min(...more.map((r) => linkIdNum(r?.linkId ?? r?.id)));
      pages++;
    }
  }

  // 매핑 + 마스킹 + upsert (시스템 이벤트 레코드는 messageToRow 가 null 반환 → 제외)
  const rows = collected.map((r) => messageToRow(r, roomId, teamId)).filter(Boolean).map(sanitizeRow);
  const n = await upsertRows(rows);
  if (n < 0) { await persistHeartbeat(roomId, ch.last_link_id, 'upsert failed'); return { roomId, error: 'upsert' }; }

  // 채널 커서/last_message 갱신(최신 페이지 기준)
  const newest = rows.reduce((acc, r) => (linkIdNum(r.link_id) > linkIdNum(acc?.link_id) ? r : acc), rows[0] || null);
  if (newest?.link_id) {
    await supabase.from('jandi_channels').update({
      last_link_id: newest.link_id,
      last_message: newest.message ? newest.message.slice(0, 200) : null,
      last_message_at: newest.created_at || null,
    }).eq('room_id', roomId);
  }
  await persistHeartbeat(roomId, newest?.link_id || ch.last_link_id, null);
  log(`[${roomId}] ${ch.label || ''} done: fetched=${collected.length} upserted=${n} pages=${pages}`);
  return { roomId, upserted: n, pages };
}

// ─── 메인 ───────────────────────────────────────────────────────────────────
const token = await resolveToken();
if (!token) { console.log('[skip] 사용할 토큰 없음(jandi_secrets·JANDI_ACCESS_TOKEN 비어있음).'); process.exit(0); }

const channels = await loadChannels();
if (!channels.length) { console.log('[skip] 활성 채널 없음(jandi_channels).'); process.exit(0); }

const client = new JandiClient({ accessToken: token, teamId: TEAM_ID, memberId: MEMBER_ID });

// 토큰 유효성 1회 확인(첫 방 ping)
try {
  await client.ping(channels[0].room_id);
} catch (e) {
  if (isAuthError(e)) {
    await persistHeartbeat(channels[0].room_id, channels[0].last_link_id, `auth ${e.status}`);
    console.error(`❌ 잔디 토큰 만료(HTTP ${e.status}) — jandi_secrets.jandi_access_token 갱신 필요(docs/JANDI_SETUP.md).`);
    process.exit(1);
  }
  console.error('잔디 ping 오류(일시적일 수 있음):', e.message);
  process.exit(0);
}

let authExpired = false;
for (const ch of channels) {
  try {
    await collectRoom(client, ch);
  } catch (e) {
    if (isAuthError(e)) { authExpired = true; log(`[${ch.room_id}] auth ${e.status}`); break; }
    log(`[${ch.room_id}] channel error:`, e.message);
  }
}

if (authExpired) {
  console.error('❌ 잔디 토큰 만료 — jandi_secrets.jandi_access_token 갱신 필요.');
  process.exit(1);
}
process.exit(0);

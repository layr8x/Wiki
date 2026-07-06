#!/usr/bin/env node
// scripts/jandi-backfill.mjs
// 잔디 방별 "전체 대화" 백필 — 각 방을 최신부터 과거 끝까지 type=old 로 페이지백해 전량 적재.
// 증분 수집(jandi-collect-once / edge function)과 별개인 1회성 대량 수집.
//
// 실행:
//   node --env-file=.env.local scripts/jandi-backfill.mjs            # 전 채널
//   node --env-file=.env.local scripts/jandi-backfill.mjs 31495011   # 특정 방만
//   env: JANDI_ACCESS_TOKEN(폴백), JANDI_TEAM_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   옵션 env: JANDI_BACKFILL_MAX_PAGES(방당 상한, 기본 100000=사실상 무제한)

import { JandiClient, extractRecords, messageToRow, linkIdNum, recLinkId } from './lib/jandi-client.mjs';
import { getAdminClient } from './lib/supabase-admin.mjs';
import { maskBody, stripLoneSurrogates } from './lib/kakao-sanitize.mjs';

const TOKEN_ENV = process.env.JANDI_ACCESS_TOKEN;
const TEAM_ID = process.env.JANDI_TEAM_ID || '29522216';
const MEMBER_ID = process.env.JANDI_MEMBER_ID || null;
const PAGE = Number(process.env.JANDI_PAGE_SIZE || 100);
const MAX_PAGES = Number(process.env.JANDI_BACKFILL_MAX_PAGES || 100000);
const onlyRoom = process.argv.slice(2).find((a) => !a.startsWith('-')) || null;

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);
const isAuthError = (e) => e && (e.status === 401 || e.status === 403);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요');
  process.exit(1);
}
const supabase = getAdminClient();

async function resolveToken() {
  try {
    const { data } = await supabase.from('jandi_secrets').select('value').eq('key', 'jandi_access_token').maybeSingle();
    if (data?.value) return data.value;
  } catch { /* env 폴백 */ }
  return TOKEN_ENV || null;
}

function sanitizeRow(row) {
  const out = { ...row };
  if (out.message != null) out.message = stripLoneSurrogates(maskBody(out.message));
  return out;
}

async function upsert(rows) {
  const valid = rows.filter((r) => r.link_id);
  if (!valid.length) return 0;
  // 큰 배치는 500건씩 나눠 upsert.
  let total = 0;
  for (let i = 0; i < valid.length; i += 500) {
    const chunk = valid.slice(i, i + 500);
    const { error } = await supabase.from('jandi_messages').upsert(chunk, { onConflict: 'room_id,link_id' });
    if (error) { log('upsert fail:', error.message); return -1; }
    total += chunk.length;
  }
  return total;
}

async function backfillRoom(client, room) {
  const roomId = String(room.room_id);
  const teamId = String(room.team_id || TEAM_ID);
  log(`[${roomId}] ${room.label || ''} 백필 시작`);

  let cursor = null;          // 마지막으로 받은 페이지의 가장 오래된 linkId
  let pages = 0;
  let grand = 0;
  let newestLink = null;
  const seen = new Set();

  while (pages < MAX_PAGES) {
    const res = cursor
      ? await client.roomMessages(roomId, { count: PAGE, linkId: cursor, type: 'old' })
      : await client.roomMessages(roomId, { count: PAGE });
    const recs = extractRecords(res);
    if (!recs.length) break;

    // 실제 대화 행(시스템 이벤트 제외) — 페이지 전체가 이벤트뿐이어도(rows 0건)
    // 아래 커서 전진은 raw recs 기준이라 조기 종료되지 않는다.
    const rows = recs.map((r) => messageToRow(r, roomId, teamId)).filter(Boolean).map(sanitizeRow);
    if (rows.length) {
      for (const r of rows) {
        const n = linkIdNum(r.link_id);
        if (newestLink == null || n > linkIdNum(newestLink)) newestLink = r.link_id;
      }
      const n = await upsert(rows);
      if (n < 0) { log(`[${roomId}] upsert 실패 — 중단`); break; }
      grand += rows.length;
    }
    pages++;

    // 다음 커서 = 이번 페이지의 가장 오래된 linkId(raw 레코드 기준, 이벤트 포함)
    const oldest = recs.reduce((a, r) => {
      const id = recLinkId(r);
      return id != null && linkIdNum(id) < linkIdNum(a) ? id : a;
    }, recLinkId(recs[0]));
    if (oldest == null || seen.has(oldest)) { log(`[${roomId}] 커서 정체(${oldest}) — 끝으로 판단, 중단`); break; }
    seen.add(oldest);
    cursor = oldest;

    if (pages % 10 === 0) log(`[${roomId}] ...${pages}페이지 / ${grand}건`);
    if (recs.length < PAGE) break;  // 마지막 페이지
  }

  // 채널 커서/last_message 갱신
  if (newestLink) {
    await supabase.from('jandi_channels').update({ last_link_id: newestLink }).eq('room_id', roomId);
  }
  log(`[${roomId}] 백필 완료: ${grand}건 / ${pages}페이지`);
  return { roomId, total: grand, pages };
}

// ─── 메인 ───────────────────────────────────────────────────────────────────
const token = await resolveToken();
if (!token) { console.error('토큰 없음(jandi_secrets·JANDI_ACCESS_TOKEN)'); process.exit(1); }

let q = supabase.from('jandi_channels').select('room_id, team_id, label').eq('is_active', true);
if (onlyRoom) q = q.eq('room_id', onlyRoom);
const { data: channels, error } = await q;
if (error) { console.error('채널 로드 실패:', error.message); process.exit(1); }
if (!channels?.length) { console.error('대상 채널 없음'); process.exit(1); }

const client = new JandiClient({ accessToken: token, teamId: TEAM_ID, memberId: MEMBER_ID });

for (const room of channels) {
  try {
    await backfillRoom(client, room);
  } catch (e) {
    if (isAuthError(e)) {
      console.error(`❌ 토큰 만료(HTTP ${e.status}) — 갱신 후 재실행(docs/JANDI_SETUP.md)`);
      process.exit(1);
    }
    log(`[${room.room_id}] 오류:`, e.message);
  }
}
log('전체 백필 종료');
process.exit(0);

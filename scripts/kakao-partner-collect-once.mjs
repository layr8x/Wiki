#!/usr/bin/env node
// scripts/kakao-partner-collect-once.mjs
// 1회성 카카오 파트너센터 증분 수집 — 상시 스케줄러(GitHub Actions cron)용.
//
// 배경:
//   기존 상시 데몬(kakao-partner-stream.mjs)은 사용자 맥북의 launchd 에서만 돌아,
//   노트북이 잠자기/종료되면 수집이 멈춰 매일 데이터 갭이 발생했다(통째로 빈 날 다수).
//   실측상 실제 수집은 100% "REST 증분 폴링" 경로로만 이뤄진다(WS push 적재=0).
//   → 그 폴링 1사이클을 떼어내 항상 켜진 클라우드에서 5분마다 호출하면, 노트북 상태와
//     무관하게 끊김 없이 수집이 이어진다.
//
// 동작(채널마다):
//   1. me() 로 쿠키 유효성 확인 — 만료(401/403)면 마지막에 비정상 종료(exit 1).
//      → GitHub Actions 워크플로가 "실패" 처리되어 저장소 소유자에게 알림 메일 발송
//        (= "쿠키 갱신하세요" 신호). 일시적 네트워크 오류는 성공 종료해 오탐 알림 방지.
//   2. DB(kakao_partner_chats)의 last_log_id 를 변경감지 커서로 적재.
//   3. chats/search → last_log_id 가 바뀐 채팅만 chatlogs(size=200) 재수집 → upsert(멱등).
//   4. 채팅 메타 upsert + stream_state heartbeat 갱신.
//      ※ 재수집 실패한 채팅은 메타를 갱신하지 않아 DB 커서가 보존됨 → 다음 실행에서 재시도
//        (영구 누락 방지).
//
// 실행:
//   node --env-file=.env.local scripts/kakao-partner-collect-once.mjs   (로컬 검증)
//   환경변수: KAKAO_PARTNER_COOKIE, KAKAO_PARTNER_PROFILE_IDS(또는 _ID),
//             SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { KakaoPartnerClient, chatToRow, logToRow } from './lib/kakao-partner-client.mjs';
import { getAdminClient } from './lib/supabase-admin.mjs';
import { sanitizeMessageRow, sanitizeChatRow } from './lib/kakao-sanitize.mjs';

const COOKIE = process.env.KAKAO_PARTNER_COOKIE;
const IDS = (process.env.KAKAO_PARTNER_PROFILE_IDS || process.env.KAKAO_PARTNER_PROFILE_ID || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const PAGE_SIZE = Number(process.env.KAKAO_PARTNER_PAGE_SIZE || 100);
const LOGS_SIZE = Number(process.env.KAKAO_PARTNER_LOGS_SIZE || 200);

const isAuthError = (e) => e && (e.status === 401 || e.status === 403);
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

if (!COOKIE) { console.error('KAKAO_PARTNER_COOKIE 가 비어있음'); process.exit(1); }
if (IDS.length === 0) { console.error('KAKAO_PARTNER_PROFILE_IDS / KAKAO_PARTNER_PROFILE_ID 가 비어있음'); process.exit(1); }

const supabase = getAdminClient();

// DB 의 채팅별 last_log_id 를 메모리 커서로 적재 (변경 감지 기준).
async function primeCursors(profileId) {
  const cursors = new Map();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('kakao_partner_chats')
      .select('chat_id, last_log_id')
      .eq('profile_id', profileId)
      .order('chat_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) { log(`[${profileId}] prime error:`, error.message); break; }
    if (!data || data.length === 0) break;
    for (const r of data) if (r.last_log_id) cursors.set(String(r.chat_id), String(r.last_log_id));
    if (data.length < PAGE) break;
  }
  return cursors;
}

// 변경된 채팅의 최신 메시지 페이지를 upsert. 반환: upsert 건수(실패 시 -1).
async function fetchRecent(client, profileId, chatId) {
  try {
    const res = await client.chatLogs(chatId, { size: LOGS_SIZE });
    const items = res?.items || [];
    if (!items.length) return 0;
    const rows = items.map((it) => sanitizeMessageRow(logToRow(it, chatId, profileId)));
    const { error } = await supabase
      .from('kakao_partner_messages').upsert(rows, { onConflict: 'log_id' });
    if (error) { log(`[${profileId}] upsert ${chatId} fail:`, error.message); return -1; }
    return rows.length;
  } catch (e) {
    log(`[${profileId}] chatlogs ${chatId} fail:`, e.message);
    return -1;
  }
}

// stream_state heartbeat 갱신. last_error/last_error_at 은 헬스 마이그레이션
// (2026-05-24) 적용 환경에서만 존재 → best-effort 로 분리 upsert.
async function persistHeartbeat(profileId, lastSeenLogId, lastError) {
  const patch = { profile_id: profileId, last_heartbeat_at: new Date().toISOString() };
  if (lastSeenLogId) patch.last_seen_log_id = lastSeenLogId;
  try {
    await supabase.from('kakao_partner_stream_state').upsert(patch, { onConflict: 'profile_id' });
    try {
      await supabase.from('kakao_partner_stream_state').upsert(
        {
          profile_id: profileId,
          last_error: lastError,
          last_error_at: lastError ? new Date().toISOString() : null,
        },
        { onConflict: 'profile_id' },
      );
    } catch { /* last_error 컬럼 미존재 시 무시 */ }
  } catch (e) {
    log(`[${profileId}] state persist fail:`, e.message);
  }
}

// 채널 1개 1회 수집. 쿠키 만료면 authExpired=true 로 throw (상위에서 종료코드 결정).
async function collectChannel(profileId) {
  const client = new KakaoPartnerClient({ cookie: COOKIE, profileId });

  // 1) 인증 확인 — 만료면 즉시 throw (모든 채널 동일 쿠키라 더 진행 의미 없음)
  try {
    const me = await client.me();
    log(`[${profileId}] auth ok: ${me.email || me.id || 'unknown'}`);
  } catch (e) {
    if (isAuthError(e)) {
      await persistHeartbeat(profileId, null, `auth ${e.status}: ${e.message}`.slice(0, 300));
      const err = new Error(`쿠키 만료(HTTP ${e.status}) — KAKAO_PARTNER_COOKIE 갱신 필요`);
      err.authExpired = true;
      throw err;
    }
    throw e;
  }

  // 2) 변경감지 커서 적재
  const cursors = await primeCursors(profileId);

  // 3) 채팅 목록 → last_log_id 가 바뀐 채팅만 메시지 재수집
  const res = await client.searchChats({ size: PAGE_SIZE });
  const items = Array.isArray(res?.items) ? res.items : [];
  let changed = 0;
  let upserted = 0;
  let lastSeen = null;
  const metaRows = [];
  for (const it of items) {
    const cid = String(it.id);
    const apiLast = it.last_log_id ? String(it.last_log_id) : null;
    if (apiLast && cursors.get(cid) !== apiLast) {
      changed++;
      const n = await fetchRecent(client, profileId, cid);
      // 실패(-1) → 이 채팅 메타는 갱신하지 않음(DB 커서 보존) → 다음 실행 재시도
      if (n < 0) continue;
      upserted += n;
      lastSeen = apiLast;
    }
    metaRows.push(sanitizeChatRow(chatToRow(it, profileId)));
  }

  // 4) 재수집 성공/미변경 채팅의 메타만 upsert
  if (metaRows.length) {
    const { error } = await supabase
      .from('kakao_partner_chats').upsert(metaRows, { onConflict: 'chat_id' });
    if (error) log(`[${profileId}] chats upsert fail:`, error.message);
  }

  await persistHeartbeat(profileId, lastSeen, null);
  log(`[${profileId}] done: scanned=${items.length} changed=${changed} upserted=${upserted}`);
}

let authExpired = false;
for (const pid of IDS) {
  try {
    await collectChannel(pid);
  } catch (e) {
    if (e.authExpired) { authExpired = true; log(`[${pid}] ${e.message}`); break; }
    // 일시적 채널 오류는 다음 실행에서 재시도 → 워크플로는 성공 처리(오탐 알림 방지)
    log(`[${pid}] channel error:`, e.message);
  }
}

if (authExpired) {
  console.error('❌ 카카오 쿠키 만료 — GitHub 저장소 Secrets 의 KAKAO_PARTNER_COOKIE 를 갱신하세요.');
  process.exit(1);
}
process.exit(0);

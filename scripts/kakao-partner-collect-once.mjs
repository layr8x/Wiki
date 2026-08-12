#!/usr/bin/env node
// scripts/kakao-partner-collect-once.mjs
// 1회성 카카오 파트너센터 증분 수집 — 현재 운영 경로.
//
// 어디서 도는가 (2026-08-12 확정):
//   회사 자산 맥 스튜디오의 launchd(scripts/launchd/com.amswiki.kakao-collect.plist)가
//   5분마다 이 스크립트를 실행한다.
//   왜 클라우드가 아닌가: 동일 쿠키·동일 헤더로 A/B 한 결과 맥 스튜디오=200, 클라우드(Supabase
//   Edge Function)=401 이었다. 카카오가 클라우드 IP 를 막는다 — 쿠키를 아무리 잘 갱신해도
//   클라우드에선 통과할 수 없다(2026-07-25~08-12 수집 전면 중단의 진짜 원인).
//   ※ 예전 주석의 "항상 켜진 클라우드에서 5분마다" 전제는 폐기됨.
//
// 동작(채널마다):
//   1. me() 로 쿠키 유효성 확인 — 만료(401/403)면 마지막에 비정상 종료(exit 1).
//      → 로그(~/Library/Logs/ams-wiki/kakao-collect.err.log)에 남고, 대시보드의 수집 알림이
//        뜬다(= "Chrome 재로그인 필요" 신호). 일시적 네트워크 오류는 성공 종료해 오탐 방지.
//   2. DB(kakao_partner_chats)의 last_log_id 를 변경감지 커서로 적재.
//   3. chats/search → last_log_id 가 바뀐 채팅만 chatlogs(size=200) 재수집 → upsert(멱등).
//      ※ 메시지 저장 전에 부모 행(chats)부터 upsert — 외래키 위반 방지(아래 주석 참고).
//   4. 채팅 메타 upsert + stream_state heartbeat 갱신.
//      ※ 재수집 실패한 채팅은 커서를 전진시키지 않아 다음 실행에서 재시도(영구 누락 방지).
//
// 실행:
//   node --env-file=.env.local scripts/kakao-partner-collect-once.mjs   (로컬 검증)
//   환경변수: KAKAO_PARTNER_COOKIE, KAKAO_PARTNER_PROFILE_IDS(또는 _ID),
//             SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { KakaoPartnerClient, chatToRow, logToRow } from './lib/kakao-partner-client.mjs';
import { getAdminClient } from './lib/supabase-admin.mjs';
import { sanitizeMessageRow, sanitizeChatRow } from './lib/kakao-sanitize.mjs';

const COOKIE_ENV = process.env.KAKAO_PARTNER_COOKIE; // 폴백/시드용 (1차 출처는 Supabase 보관함)
const IDS = (process.env.KAKAO_PARTNER_PROFILE_IDS || process.env.KAKAO_PARTNER_PROFILE_ID || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const COOKIE_KEY = 'kakao_partner_cookie'; // kakao_partner_secrets.key
const PAGE_SIZE = Number(process.env.KAKAO_PARTNER_PAGE_SIZE || 100);
const LOGS_SIZE = Number(process.env.KAKAO_PARTNER_LOGS_SIZE || 200);

const isAuthError = (e) => e && (e.status === 401 || e.status === 403);
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

// 필수 시크릿(Supabase 자격증명) 미설정 시(머지 직후 ~ 사용자가 Secret 등록 전)에는
// "실패"가 아니라 "스킵"으로 처리해, 5분마다 실패 알림이 쏟아지는 것을 막는다.
// (쿠키 '만료'는 실제 시도 중 401/403 → exit 1 로 알림)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const missing = [
  ['SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_KEY],
].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.log(`[skip] 필수 시크릿 미설정(${missing.join(', ')}) — 수집 건너뜀. GitHub Secrets 등록 후 자동 시작.`);
  process.exit(0);
}
if (IDS.length === 0) {
  console.log('[skip] 수집할 채널 ID 없음 (KAKAO_PARTNER_PROFILE_IDS / KAKAO_PARTNER_PROFILE_ID).');
  process.exit(0);
}

const supabase = getAdminClient();

// 쿠키 출처: ① Supabase 보관함(맥 스튜디오 Chrome 이 6시간마다 자동 배달) 우선 → ② GitHub Secret 폴백.
// 보관함 쿠키가 항상 최신이라 만료 수동 갱신이 사라진다.
async function resolveCookie() {
  try {
    const { data, error } = await supabase
      .from('kakao_partner_secrets')
      .select('value, updated_at')
      .eq('key', COOKIE_KEY)
      .maybeSingle();
    if (!error && data?.value) {
      log(`cookie source: supabase (updated ${data.updated_at})`);
      return data.value;
    }
  } catch { /* 테이블 미적용 등 → env 폴백 */ }
  if (COOKIE_ENV) {
    log('cookie source: env secret (fallback)');
    return COOKIE_ENV;
  }
  return null;
}

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

// 카카오가 호출 도중 새 로그인 토큰을 내려주면(Set-Cookie) 그 값을 보관함에 되돌려 저장한다.
// 안 하면 카카오가 옛 토큰을 무효화하는 순간부터 401 이 나 수집이 조용히 멈춘다.
async function persistRotatedCookie(cookie) {
  try {
    const { error } = await supabase
      .from('kakao_partner_secrets')
      .upsert({ key: COOKIE_KEY, value: cookie, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    log('cookie rotated → 보관함 갱신 완료');
  } catch (e) {
    log('cookie rotated → 보관함 갱신 실패(다음 실행에서 재시도):', e.message);
  }
}

// 채널 1개 1회 수집. 쿠키 만료면 authExpired=true 로 throw (상위에서 종료코드 결정).
// session.cookie 는 채널 간 공유 — 앞 채널에서 토큰이 갱신되면 뒤 채널부터 새 값으로 호출한다.
async function collectChannel(profileId, session) {
  const client = new KakaoPartnerClient({ cookie: session.cookie, profileId });

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
    const chatRow = sanitizeChatRow(chatToRow(it, profileId));
    if (apiLast && cursors.get(cid) !== apiLast) {
      changed++;
      // ⚠️ 버그 수정(2026-08-12): kakao_partner_messages.chat_id 는 kakao_partner_chats 를
      // 참조하는 외래키(FK = 부모 행이 먼저 있어야 자식 행을 넣을 수 있는 규칙)다.
      // 처음 보는 대화방은 부모 행(chats)이 아직 없어, 메시지부터 저장하면
      // "violates foreign key constraint kakao_partner_messages_chat_id_fkey" 로 통째 실패한다
      // (= 새 대화의 첫 메시지 묶음이 영구 유실). 맥 스튜디오 첫 복구 실행에서 전 채널 실측.
      // → 메시지 저장 전에 부모 행부터 upsert 한다.
      //
      // ※ 단, 이때 last_log_id(= 변경감지 커서)는 "예전 값 그대로" 넣는다.
      //   여기서 최신값으로 올려버리면, 이어지는 메시지 저장이 실패했을 때 다음 실행이
      //   "변경 없음"으로 오판해 그 메시지들을 영영 안 가져온다. 커서는 메시지 저장이
      //   성공한 뒤 아래 배치 upsert 에서만 전진시킨다.
      const { error: preErr } = await supabase
        .from('kakao_partner_chats')
        .upsert({ ...chatRow, last_log_id: cursors.get(cid) ?? null }, { onConflict: 'chat_id' });
      if (preErr) { log(`[${profileId}] pre-upsert chat ${cid} fail:`, preErr.message); continue; }
      const n = await fetchRecent(client, profileId, cid);
      // 실패(-1) → 이 채팅 메타는 갱신하지 않음(DB 커서 보존) → 다음 실행 재시도
      if (n < 0) continue;
      upserted += n;
      lastSeen = apiLast;
    }
    metaRows.push(chatRow);
  }

  // 4) 재수집 성공/미변경 채팅의 메타만 upsert
  if (metaRows.length) {
    const { error } = await supabase
      .from('kakao_partner_chats').upsert(metaRows, { onConflict: 'chat_id' });
    if (error) log(`[${profileId}] chats upsert fail:`, error.message);
  }

  await persistHeartbeat(profileId, lastSeen, null);
  if (client.rotated) { session.cookie = client.cookie; session.rotated = true; }
  log(`[${profileId}] done: scanned=${items.length} changed=${changed} upserted=${upserted}`);
}

const cookie = await resolveCookie();
if (!cookie) {
  console.log('[skip] 사용할 쿠키 없음 (Supabase 보관함·KAKAO_PARTNER_COOKIE 모두 비어있음) — 건너뜀.');
  process.exit(0);
}

const session = { cookie, rotated: false };
let authExpired = false;
for (const pid of IDS) {
  try {
    await collectChannel(pid, session);
  } catch (e) {
    if (e.authExpired) { authExpired = true; log(`[${pid}] ${e.message}`); break; }
    // 일시적 채널 오류는 다음 실행에서 재시도 → 워크플로는 성공 처리(오탐 알림 방지)
    log(`[${pid}] channel error:`, e.message);
  }
}

if (session.rotated) await persistRotatedCookie(session.cookie);

if (authExpired) {
  console.error('❌ 카카오 쿠키 만료 — 맥 스튜디오 Chrome 재로그인(자동 배달, 다음 6h 주기 픽업) 또는 GitHub Secrets 의 KAKAO_PARTNER_COOKIE 수동 갱신 필요.');
  process.exit(1);
}
process.exit(0);

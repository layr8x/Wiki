#!/usr/bin/env node
// scripts/kakao-partner-backfill-missing.mjs
// "메시지가 0건인 대화방"만 골라 과거 메시지를 채워 넣는 복구 스크립트 (전 채널).
//
// 언제 쓰나:
//   수집기 버그·일시 오류로 대화방(kakao_partner_chats)은 저장됐는데 메시지가 통째로
//   비어 있는 경우. 대표 사례가 2026-08-12 에 확인된 외래키(FK) 순서 버그다 — 처음 보는
//   대화방의 메시지를 부모 행보다 먼저 저장하려다 전량 실패했고, 그 뒤 채팅 메타만 저장돼
//   "메시지 0건 + 커서는 최신" 상태로 굳었다(= 증분 수집기가 영영 다시 안 가져옴).
//   수집기 자체는 고쳤으므로(collect-once 의 pre-upsert), 이 스크립트는 그때 유실된
//   과거분을 되메우는 1회성 복구용이다. 여러 번 돌려도 안전(멱등).
//
// 실행 (담당자 기기(맥북 에어)):
//   node --env-file=.env.local scripts/kakao-partner-backfill-missing.mjs
//   환경변수: KAKAO_PARTNER_PROFILE_IDS(또는 _ID), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//            (쿠키는 collect-once 와 동일하게 Supabase 보관함 우선, 없으면 KAKAO_PARTNER_COOKIE)
//   옵션: KAKAO_BACKFILL_MAX_CHATS(채널당 상한, 기본 5000) · KAKAO_BACKFILL_CONC(동시 실행, 기본 4)

import { KakaoPartnerClient, logToRow } from './lib/kakao-partner-client.mjs';
import { getAdminClient } from './lib/supabase-admin.mjs';
import { sanitizeMessageRow } from './lib/kakao-sanitize.mjs';

const IDS = (process.env.KAKAO_PARTNER_PROFILE_IDS || process.env.KAKAO_PARTNER_PROFILE_ID || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const MAX_CHATS = Number(process.env.KAKAO_BACKFILL_MAX_CHATS || 5000);
const CONC = Number(process.env.KAKAO_BACKFILL_CONC || 4);
const PAGE = 500;      // chatlogs 한 번에 가져오는 건수
const MAX_PAGES = 50;  // 대화방 1개당 상한 (=최대 25,000건)

const supabase = getAdminClient();
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

if (!IDS.length) { console.log('[skip] KAKAO_PARTNER_PROFILE_IDS 미설정.'); process.exit(0); }

// 쿠키는 수집기와 동일 출처(보관함 우선) — 담당자 기기(맥북 에어) Chrome 이 6시간마다 검증 후 배달한다.
async function resolveCookie() {
  const { data } = await supabase.from('kakao_partner_secrets')
    .select('value').eq('key', 'kakao_partner_cookie').maybeSingle();
  return data?.value || process.env.KAKAO_PARTNER_COOKIE || null;
}

// 메시지가 하나도 없는 대화방 목록 (RPC — kakao_backfill_empty 에 기록된 "원래 빈 방"은 제외됨).
//
// ⚠️ 조회가 실패하면 반드시 던진다. 예전에는 실패해도 break 로 빠져나가 빈 배열을 돌려줬고,
//    호출부가 그걸 "복구 대상 0개"로 찍어 정상 완료처럼 보였다(2026-08-13 실측 —
//    LIVE 채널이 statement timeout 으로 실패했는데 로그는 "0개 복구 시작 / 총 +0건 복구").
//    실제로 복구할 게 있는 상황에서 같은 일이 나면 조용히 건너뛴다. 겉지표가 아니라 최종
//    산출물을 봐야 한다는 22-4 교훈과 같은 함정이다.
async function listMissing(profileId) {
  const out = [];
  let after = null;
  while (out.length < MAX_CHATS) {
    const { data, error } = await supabase.rpc('kakao_chats_missing_messages', {
      p_pid: profileId, p_lim: Math.min(500, MAX_CHATS - out.length), p_after: after,
    });
    if (error) {
      const hint = /timeout/i.test(error.message)
        ? ' (대화방이 많아 조회가 8초 제한을 넘김 — p_after 커서를 이어 쓰거나 인덱스 점검 필요)'
        : '';
      throw new Error(`목록 조회 실패: ${error.message}${hint}`);
    }
    if (!data?.length) break;
    for (const r of data) out.push(String(r.chat_id));
    after = out[out.length - 1];
    if (data.length < 500) break;
  }
  return out;
}

// 대화방 1개의 과거 메시지를 끝까지(상한 내) 받아 저장. 반환: {total, empty, error}
async function backfillChat(client, profileId, chatId) {
  let total = 0;
  let oldest = null;
  for (let p = 0; p < MAX_PAGES; p++) {
    const qs = p === 0 ? `size=${PAGE}` : `since=${oldest}&direction=prev&size=${PAGE}`;
    let res;
    try {
      res = await client._fetch(`/api/profiles/${profileId}/chats/${chatId}/chatlogs?${qs}`);
    } catch (e) {
      return { total, error: e.message, status: e.status };
    }
    const items = res?.items || [];
    if (!items.length) break;
    // ⚠️ 개인정보 마스킹 필수 — 수집기(collect-once)와 완전히 동일한 경로를 쓴다.
    //    (예전 버전은 자체 매핑을 써서 마스킹을 건너뛰고 원문을 그대로 적재했다.)
    const rows = items.map((it) => sanitizeMessageRow(logToRow(it, chatId, profileId)));
    const { error } = await supabase
      .from('kakao_partner_messages').upsert(rows, { onConflict: 'log_id' });
    if (error) return { total, error: error.message };
    total += rows.length;
    oldest = rows[0].log_id;
    if (!res.has_prev) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return { total, empty: total === 0 };
}

const cookie = await resolveCookie();
if (!cookie) { console.log('[skip] 사용할 쿠키 없음.'); process.exit(0); }

let grandTotal = 0;
let authExpired = false;
const listFailed = [];   // 목록 조회 자체가 실패한 채널 — "0개"와 구분해서 끝에 알린다

for (const profileId of IDS) {
  if (authExpired) break;
  const client = new KakaoPartnerClient({ cookie, profileId });
  try {
    const me = await client.me();
    log(`[${profileId}] auth ok: ${me.email || me.id || 'unknown'}`);
  } catch (e) {
    if (e.status === 401 || e.status === 403) { authExpired = true; log(`[${profileId}] 쿠키 만료(HTTP ${e.status})`); break; }
    log(`[${profileId}] auth 확인 실패:`, e.message); continue;
  }

  let chats;
  try {
    chats = await listMissing(profileId);
  } catch (e) {
    // 조회 실패는 "복구할 게 없음"이 아니다 — 채널을 실패로 표시하고 계속한 뒤, 끝에서
    // 0 이 아닌 종료 코드로 알린다(예약 실행에서도 실패가 드러나도록).
    console.error(`[${profileId}] ${e.message}`);
    listFailed.push(profileId);
    continue;
  }
  log(`[${profileId}] 메시지 0건 대화방 ${chats.length}개 복구 시작`);
  if (!chats.length) continue;

  const queue = chats.slice();
  const emptyRows = [];
  const start = Date.now();
  let done = 0, sum = 0;

  async function worker() {
    while (queue.length && !authExpired) {
      const chatId = queue.shift();
      if (!chatId) break;
      const { total, empty, error, status } = await backfillChat(client, profileId, chatId);
      done++; sum += total;
      if (status === 401 || status === 403) { authExpired = true; log(`[${profileId}] 쿠키 만료 — 중단`); break; }
      if (error) console.error(`  [${chatId}] ${error}`);
      // 카카오에도 로그가 없는 "원래 빈 방" → 기록해 다음 실행에서 재시도하지 않는다.
      else if (empty) emptyRows.push({ chat_id: chatId, profile_id: profileId });
      if (done % 20 === 0 || done === chats.length) {
        const eta = ((Date.now() - start) / done * (chats.length - done) / 1000).toFixed(0);
        log(`  [${profileId}] ${done}/${chats.length} · +${sum}건 · 남은시간 약 ${eta}s`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  if (emptyRows.length) {
    const { error } = await supabase
      .from('kakao_backfill_empty').upsert(emptyRows, { onConflict: 'chat_id' });
    if (error) log(`[${profileId}] 빈 방 기록 실패:`, error.message);
    else log(`[${profileId}] 원래 빈 방 ${emptyRows.length}개 기록(다음 실행에서 제외)`);
  }
  grandTotal += sum;
  log(`[${profileId}] 완료: +${sum}건 / 대화방 ${chats.length}개`);
}

log(`[done] 총 +${grandTotal}건 복구`);

if (listFailed.length) {
  console.error(
    `❌ 목록 조회 실패 채널 ${listFailed.length}개: ${listFailed.join(', ')}\n` +
    '   이 채널들은 "복구 대상 0개"가 아니라 "확인하지 못함"입니다. 위 +0건을 정상으로 읽지 마세요.',
  );
}
process.exit(authExpired || listFailed.length ? 1 : 0);

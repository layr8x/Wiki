// supabase/functions/kakao-backfill/index.ts
// 신규 편입 채널(_rcpPG=LIVE메인, _rkbcn=통합로그인 등)의 "모든 기간" 상담 데이터 일괄 수집(1회성, 재개 가능).
//   mode=chats    : chats/search 를 since 커서로 끝까지 페이지네이션 -> 채팅 메타 upsert(PII 마스킹).
//   mode=messages : pid의 채팅을 chat_id 오름차순으로 훑으며 chatlogs 를 has_prev 로 과거까지 -> 메시지 upsert.
//                   진행 커서(kakao_partner_stream_state.backfill_msg_cursor)를 자동 저장·재사용해
//                   매번 처음부터 다시 스캔하지 않는다(?after= 로 수동 override 도 가능). 1회 호출당
//                   chats 개만 처리(Edge 시간제한 방어).
// 인증: kakao_partner_secrets.key='kakao_collect_token'. 쿠키: key='kakao_partner_cookie'.
// 마스킹·클라이언트·매퍼는 kakao-collect 와 동일 로직 이식.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const BASE = 'https://business.kakao.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ───────── PII 마스킹 (kakao-collect 이식, 동일) ─────────
const NAME_LABELS = '회원명|가입자명|학생명|학생이름|학부모명|학부모이름|보호자명|자녀명|성함|이름';
const CARD_RE = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
// 주민등록번호 성별코드 1-4=내국인, 5-8=외국인(둘 다 가림)
const RRN_RE = /\b\d{6}[-\s]?[1-8]\d{6}\b/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const MOBILE_RE = /(01[016-9])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g;
// 국제표기 휴대폰(+82-10-…)
const INTL_MOBILE_RE = /(\+82[-.\s]?1[016-9])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g;
const LANDLINE_RE = /(0\d{1,3})[-.\s](\d{3,4})[-.\s](\d{4})/g;
const LABEL_NAME_RE = new RegExp('(' + NAME_LABELS + ')(\\s*[:：]\\s*)([가-힣*]{1,4})', 'g');
const HAS_PHONE_OR_EMAIL_RE = /(01[016-9][-.\s]?\d{3,4}[-.\s]?\d{4})|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;
const STANDALONE_NAME_RE = /(^|\n)[ \t]*([가-힣]{2,4})[ \t]*(?=\r?\n|$)/g;
// 전화 앞 이름 규칙(kakao-collect 이식 — backfill 누락분 보강): "신승윤 010-…" 형태
const NON_NAME_BEFORE_PHONE = new Set([
  '연락처', '전화번호', '휴대폰', '휴대전화', '핸드폰', '연락', '번호',
  '문의', '접수', '상담', '아래', '여기', '이쪽', '저쪽', '카톡', '팀',
]);
const INLINE_NAME_BEFORE_PHONE_RE =
  /(^|[\s,.\n])([가-힣]{2,4})(?=\s*(?:01[016-9][-.\s]?\d{3,4}[-.\s]?\d{4}|0\d{1,3}[-.\s]\d{3,4}[-.\s]\d{4}))/g;

function stripLoneSurrogates(s: any) {
  if (s == null) return s;
  return String(s).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}
function isNonNameBeforePhone(name: string) {
  for (const w of NON_NAME_BEFORE_PHONE) {
    if (name.startsWith(w)) return true;
  }
  return false;
}
function maskName(name: any) {
  if (name == null) return name;
  const s = String(name).trim();
  if (!s) return s;
  const ch = [...s];
  if (ch.length === 1) return '*';
  if (ch.length === 2) return ch[0] + '*';
  return ch[0] + '*'.repeat(ch.length - 2) + ch[ch.length - 1];
}
function maskBody(text: any) {
  if (text == null) return text;
  let s = String(text);
  const formLike = HAS_PHONE_OR_EMAIL_RE.test(s);
  s = s.replace(CARD_RE, '[카드번호]');
  s = s.replace(RRN_RE, '[주민번호]');
  s = s.replace(EMAIL_RE, '***@$1');
  s = s.replace(INLINE_NAME_BEFORE_PHONE_RE, (m: string, pre: string, name: string) =>
    isNonNameBeforePhone(name) ? m : pre + maskName(name));
  s = s.replace(INTL_MOBILE_RE, '$1-****-$3');
  s = s.replace(MOBILE_RE, '$1-****-$3');
  s = s.replace(LANDLINE_RE, '$1-****-$3');
  s = s.replace(LABEL_NAME_RE, (_m: string, label: string, sep: string, name: string) => label + sep + maskName(name));
  if (formLike) s = s.replace(STANDALONE_NAME_RE, (_m: string, pre: string, name: string) => pre + maskName(name));
  return s;
}
function sanitizeMessageRow(row: any) {
  if (!row) return row;
  const out = { ...row };
  if (out.message != null) out.message = stripLoneSurrogates(maskBody(out.message));
  out.raw = row.raw && row.raw.manager != null ? { manager: row.raw.manager } : null;
  return out;
}
function sanitizeChatRow(row: any) {
  if (!row) return row;
  const out = { ...row };
  if (out.nickname) out.nickname = stripLoneSurrogates(maskName(out.nickname));
  if (out.last_message != null) out.last_message = stripLoneSurrogates(maskBody(out.last_message));
  out.raw = null;
  return out;
}

// ───────── 카카오 REST ─────────
async function kfetch(cookie: string, pid: string, path: string, post = false, bodyObj: any = {}) {
  const url = path.startsWith('http') ? path : BASE + path;
  const res = await fetch(url, {
    method: post ? 'POST' : 'GET',
    headers: {
      'user-agent': UA,
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'cookie': cookie,
      'referer': BASE + '/' + pid + '/chats',
      ...(post ? { 'content-type': 'application/json' } : {}),
    },
    body: post ? JSON.stringify(bodyObj) : undefined,
  });
  if (!res.ok) {
    const b = await res.text().catch(() => '');
    const e: any = new Error('HTTP ' + res.status + ' ' + path + ' :: ' + b.slice(0, 160));
    e.status = res.status;
    throw e;
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}
function chatToRow(item: any, profileId: string) {
  const u = item.talk_user || {};
  return {
    chat_id: String(item.id), profile_id: profileId,
    user_id: u.id ? String(u.id) : null, nickname: u.nickname || null,
    profile_image_url: u.profile_image_url || null, user_type: u.user_type ?? 0,
    last_log_id: item.last_log_id ? String(item.last_log_id) : null,
    last_message: item.last_message ?? null,
    last_log_send_at: item.last_log_send_at ? new Date(item.last_log_send_at).toISOString() : null,
    is_read: !!item.is_read, is_done: !!item.is_done, is_blocked: !!item.is_blocked,
    is_starred: !!item.is_starred, is_deleted: !!item.is_deleted,
    unread_count: item.unread_count ?? 0, assignee_id: item.assignee_id ?? 0,
    raw: item, remote_version: item.version ?? null,
  };
}
function logToRow(item: any, chatId: string, profileId: string) {
  const isManager = !!item.manager;
  const author = item.author || {};
  const senderType = isManager ? 'manager' : (author.user_type === 0 ? 'user' : 'system');
  const senderId = isManager ? String(item.manager?.id ?? '') : String(author.id ?? '');
  return {
    log_id: String(item.id), chat_id: String(chatId), profile_id: profileId,
    sender_type: senderType, sender_id: senderId || null,
    message: item.message ?? item.text ?? item.content ?? null,
    message_type: item.type ?? null,
    attachments: item.attachment && Object.keys(item.attachment).length ? item.attachment : null,
    sent_at: item.send_at ? new Date(item.send_at).toISOString()
      : item.created_at ? new Date(item.created_at).toISOString() : new Date().toISOString(),
    raw: item, source: 'rest_backfill',
  };
}
async function getSecret(key: string): Promise<string | null> {
  const { data } = await supabase.from('kakao_partner_secrets').select('value').eq('key', key).maybeSingle();
  return (data as any)?.value ?? null;
}

// ───────── mode=chats : 전체 채팅 발굴 ─────────
async function runChats(cookie: string, pid: string, maxPages: number, sinceStart: string | null) {
  let since = sinceStart || null;
  let discovered = 0, pages = 0, hasNext = true;
  for (let p = 0; p < maxPages; p++) {
    const res: any = await kfetch(cookie, pid, '/api/profiles/' + pid + '/chats/search?size=100' + (since ? '&since=' + since : ''), true, {});
    pages++;
    const items = Array.isArray(res?.items) ? res.items : [];
    if (!items.length) { hasNext = false; break; }
    const rows = items.map((it: any) => sanitizeChatRow(chatToRow(it, pid)));
    const { error } = await supabase.from('kakao_partner_chats').upsert(rows, { onConflict: 'chat_id' });
    if (error) { log('[' + pid + '] chats upsert fail:', error.message); break; }
    discovered += rows.length;
    hasNext = !!res.has_next;
    const last = items[items.length - 1];
    since = last?.last_log_id ? String(last.last_log_id) : null;
    if (!hasNext || !since) { hasNext = false; break; }
    await sleep(200);
  }
  return { mode: 'chats', pid, discovered, pages, has_next: hasNext, next_since: since };
}

// ───────── mode=messages : 채팅별 chatlogs 과거까지 ─────────
async function backfillChatMessages(cookie: string, pid: string, chatId: string, maxLogPages: number): Promise<{ total: number; failed: boolean }> {
  let oldest: string | null = null;
  let total = 0;
  let failed = false;
  for (let pg = 0; pg < maxLogPages; pg++) {
    const qs = pg === 0 ? 'size=500' : 'since=' + oldest + '&direct=prev&size=500';
    let res: any;
    try {
      res = await kfetch(cookie, pid, '/api/profiles/' + pid + '/chats/' + chatId + '/chatlogs?' + qs);
    } catch (e: any) { log('[' + pid + '] chatlogs ' + chatId + ' fail:', e.message); failed = true; break; }
    const items = res?.items || [];
    if (!items.length) break;
    const rows = items.map((it: any) => sanitizeMessageRow(logToRow(it, chatId, pid)));
    const { error } = await supabase.from('kakao_partner_messages').upsert(rows, { onConflict: 'log_id' });
    if (error) { log('[' + pid + '] msg upsert ' + chatId + ' fail:', error.message); failed = true; break; }
    total += rows.length;
    oldest = rows[0].log_id;
    if (!res.has_prev) break;
    await sleep(120);
  }
  return { total, failed };
}
async function runMessages(cookie: string, pid: string, explicitAfter: string | null, maxChats: number, maxLogPages: number) {
  // 메시지가 아직 없는 대화만 골라 처리(발굴과 동시 실행해도 누락 없음, 자기종료).
  // 카카오가 로그 0건을 반환한 대화(보존기간 경과 등)는 kakao_backfill_empty 에 기록해
  // 큐에서 제외(같은 대화 무한 재시도로 큐가 막히는 것 방지). 일시 오류(failed)는 기록하지
  // 않아 다음 회차에 자동 재시도(손실 방지).
  //
  // 커서(backfill_msg_cursor): profile_id 전체를 chat_id 오름차순으로 매번 처음부터 다시
  // 스캔하면, 완료 비율이 올라갈수록(예: LIVE 채널 91.7%) 이미 끝난 앞부분을 건너뛰는 비용이
  // 계속 커져 결국 8초 statement_timeout 을 넘긴다(2026-07-06 실측). kakao_partner_stream_state
  // 에 "여기까지는 안전하게 넘어갔다"는 지점을 저장해두고 다음 호출은 그 뒤부터만 스캔한다.
  // 일시 오류(failed)가 하나라도 있었던 배치는 커서를 전진시키지 않아 재시도를 보장한다.
  let after = explicitAfter;
  if (!after) {
    const { data: stateRow } = await supabase
      .from('kakao_partner_stream_state').select('backfill_msg_cursor').eq('profile_id', pid).maybeSingle();
    after = (stateRow as any)?.backfill_msg_cursor || null;
  }
  const { data, error } = await supabase.rpc('kakao_chats_missing_messages', { p_pid: pid, p_lim: maxChats, p_after: after });
  if (error) return { mode: 'messages', pid, error: error.message };
  const chats = ((data as any[]) || []).map((r: any) => (typeof r === 'string' ? r : r.chat_id)).filter(Boolean);
  let processed = 0, upserted = 0, emptied = 0, failures = 0;
  let lastChatId: string | null = null;
  for (const cid of chats) {
    const { total, failed } = await backfillChatMessages(cookie, pid, String(cid), maxLogPages);
    upserted += total; processed++; lastChatId = String(cid);
    if (failed) failures++;
    if (total === 0 && !failed) {
      const { error: eErr } = await supabase.from('kakao_backfill_empty')
        .upsert({ chat_id: String(cid), profile_id: pid }, { onConflict: 'chat_id' });
      if (eErr) log('[' + pid + '] empty mark ' + cid + ' fail:', eErr.message); else emptied++;
    }
    await sleep(60);
  }
  let newCursor = after;
  if (failures === 0 && lastChatId) {
    newCursor = lastChatId;
    const { error: cErr } = await supabase.from('kakao_partner_stream_state')
      .upsert({ profile_id: pid, backfill_msg_cursor: newCursor }, { onConflict: 'profile_id' });
    if (cErr) log('[' + pid + '] cursor persist fail:', cErr.message);
  }
  return { mode: 'messages', pid, processed, upserted, emptied, failures, last_chat_id: lastChatId, cursor: newCursor, remaining_more: chats.length === maxChats };
}

// ───────── HTTP ─────────
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const expected = await getSecret('kakao_collect_token');
  if (!expected || token !== expected) return json({ error: 'unauthorized' }, 401);

  const cookie = await getSecret('kakao_partner_cookie');
  if (!cookie) return json({ error: 'no cookie in kakao_partner_secrets' });

  const pid = url.searchParams.get('pid') || '';
  if (!pid) return json({ error: 'pid required' }, 400);
  const mode = url.searchParams.get('mode') || 'chats';

  try {
    if (mode === 'chats') {
      const maxPages = Math.min(Number(url.searchParams.get('pages') || 80), 200);
      const since = url.searchParams.get('since');
      return json(await runChats(cookie, pid, maxPages, since));
    }
    if (mode === 'messages') {
      const maxChats = Math.min(Number(url.searchParams.get('chats') || 40), 120);
      const maxLogPages = Math.min(Number(url.searchParams.get('logpages') || 4), 20);
      const after = url.searchParams.get('after');
      return json(await runMessages(cookie, pid, after, maxChats, maxLogPages));
    }
    return json({ error: 'unknown mode' }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message || e), status: e?.status ?? null }, 200);
  }
});

// supabase/functions/kakao-collect/index.ts
// 카카오 파트너센터 증분 수집 — Supabase Edge Function (pg_cron 이 주기 호출).
//
// 왜: 기존엔 GitHub Actions(5분 cron)가 scripts/kakao-partner-collect-once.mjs 를 돌렸으나,
//   비공개 저장소 Actions 무료시간이 매달 소진돼 수집이 멈췄다(2026-06 발생). 이 함수는
//   "항상 켜진" Supabase 안에서 직접 돌아 GitHub Actions 사용시간 0 → 영영 안 멈춘다.
//
// 인증: verify_jwt=false. 대신 DB(kakao_partner_secrets.key='kakao_collect_token')에 저장된
//   토큰을 ?token= 으로 받아 비교(레거시 anon 키 비활성 환경 대응 + 추가 시크릿 설정 0).
// 쿠키: kakao_partner_secrets.key='kakao_partner_cookie' (맥북 Chrome 이 6h마다 자동 배달).
// DB 자격증명: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 Edge 런타임이 자동 주입.
//
// 동작(채널마다, scripts/kakao-partner-collect-once.mjs 이식):
//   me() 인증확인 → DB last_log_id 커서 적재 → chats/search(100) → 바뀐 채팅만
//   chatlogs(200) 재수집 upsert(멱등) → 채팅 메타 upsert → heartbeat.
//   ※ 1회 호출당 채널별 MAX_CHANGED 건만 처리(Edge 시간제한 방어). 미처리분은 커서 보존 →
//     다음 호출에서 이어 처리(영구 누락 없음).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// 시대인재 운영 채널 5개(사용자 확정 정리본 2026-07-03):
//   _VGAQn=마이클래스 / _rcpPG=LIVE(메인) / _TkpPG=LIVE(기술지원) / _xfxilXn=콘텐츠 / _rkbcn=통합로그인 안내
//   기존엔 3개(_xfxilXn·_TkpPG·_VGAQn)만 수집 → _rcpPG(메인 LIVE)·_rkbcn 누락분 추가.
const PROFILE_IDS = ['_VGAQn', '_rcpPG', '_TkpPG', '_xfxilXn', '_rkbcn'];
const PAGE_SIZE = 100;       // chats/search (카카오 API cap=100)
const LOGS_SIZE = 200;       // chatlogs 페이지 크기
const MAX_CHANGED = 80;      // 1회 호출당 채널별 재수집 상한(시간제한 방어)
const JITTER_MS = 150;       // 요청 간 랜덤 지연(서버 cron이라 짧게)

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const isAuthError = (e: any) => e && (e.status === 401 || e.status === 403);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

// ───────────────────── PII 마스킹 (scripts/lib/kakao-sanitize.mjs 이식) ─────────────────────
const NAME_LABELS = '회원명|가입자명|학생명|학생이름|학부모명|학부모이름|보호자명|자녀명|성함|이름';
const CARD_RE = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
const RRN_RE = /\b\d{6}[-\s]?[1-4]\d{6}\b/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const MOBILE_RE = /(01[016-9])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g;
const LANDLINE_RE = /(0\d{1,3})[-.\s](\d{3,4})[-.\s](\d{4})/g;
const LABEL_NAME_RE = new RegExp('(' + NAME_LABELS + ')(\\s*[:：]\\s*)([가-힣*]{1,4})', 'g');
const HAS_PHONE_OR_EMAIL_RE = /(01[016-9][-.\s]?\d{3,4}[-.\s]?\d{4})|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;
const STANDALONE_NAME_RE = /(^|\n)[ \t]*([가-힣]{2,4})[ \t]*(?=\r?\n|$)/g;

function stripLoneSurrogates(s: any) {
  if (s == null) return s;
  return String(s).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
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
  s = s.replace(MOBILE_RE, '$1-****-$3');
  s = s.replace(LANDLINE_RE, '$1-****-$3');
  s = s.replace(LABEL_NAME_RE, (_m: string, label: string, sep: string, name: string) => label + sep + maskName(name));
  if (formLike) s = s.replace(STANDALONE_NAME_RE, (_m: string, pre: string, name: string) => pre + maskName(name));
  return s;
}
function sanitizeRaw(raw: any) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw.manager != null ? { manager: raw.manager } : null;
}
function sanitizeMessageRow(row: any) {
  if (!row) return row;
  const out = { ...row };
  if (out.message != null) out.message = stripLoneSurrogates(maskBody(out.message));
  out.raw = sanitizeRaw(out.raw);
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

// ───────────────────── 카카오 파트너 REST 클라이언트 (kakao-partner-client.mjs 이식) ─────────────────────
const BASE = 'https://business.kakao.com';
const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

class KakaoPartnerClient {
  cookie: string; profileId: string; userAgent: string; jitterMs: number;
  constructor({ cookie, profileId, userAgent = DEFAULT_UA, jitterMs = JITTER_MS }: any) {
    if (!cookie) throw new Error('cookie required');
    if (!profileId) throw new Error('profileId required');
    this.cookie = cookie; this.profileId = profileId; this.userAgent = userAgent; this.jitterMs = jitterMs;
  }
  async _jitter() { await new Promise((r) => setTimeout(r, Math.floor(Math.random() * this.jitterMs) + 100)); }
  async _fetch(path: string, opts: any = {}) {
    await this._jitter();
    const url = path.startsWith('http') ? path : BASE + path;
    const res = await fetch(url, {
      ...opts,
      headers: {
        'user-agent': this.userAgent,
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'cookie': this.cookie,
        'referer': `${BASE}/${this.profileId}/chats`,
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err: any = new Error(`HTTP ${res.status} ${path} :: ${body.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  }
  me() { return this._fetch('/api/users/me'); }
  searchChats({ size = 100, since = null, body = {} }: any = {}) {
    const qs = since ? `size=${size}&since=${since}` : `size=${size}`;
    return this._fetch(`/api/profiles/${this.profileId}/chats/search?${qs}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
  }
  chatLogs(chatId: string, { size = 200 }: any = {}) {
    return this._fetch(`/api/profiles/${this.profileId}/chats/${chatId}/chatlogs?size=${size}`);
  }
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

// ───────────────────── 수집 (collect-once.mjs 이식) ─────────────────────
async function getSecret(key: string): Promise<string | null> {
  const { data } = await supabase.from('kakao_partner_secrets').select('value').eq('key', key).maybeSingle();
  return (data as any)?.value ?? null;
}
async function primeCursors(profileId: string) {
  const cursors = new Map<string, string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('kakao_partner_chats').select('chat_id, last_log_id')
      .eq('profile_id', profileId).order('chat_id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) { log(`[${profileId}] prime error:`, error.message); break; }
    if (!data || data.length === 0) break;
    for (const r of data as any[]) if (r.last_log_id) cursors.set(String(r.chat_id), String(r.last_log_id));
    if (data.length < PAGE) break;
  }
  return cursors;
}
async function fetchRecent(client: KakaoPartnerClient, profileId: string, chatId: string) {
  try {
    const res: any = await client.chatLogs(chatId, { size: LOGS_SIZE });
    const items = res?.items || [];
    if (!items.length) return 0;
    const rows = items.map((it: any) => sanitizeMessageRow(logToRow(it, chatId, profileId)));
    const { error } = await supabase.from('kakao_partner_messages').upsert(rows, { onConflict: 'log_id' });
    if (error) { log(`[${profileId}] upsert ${chatId} fail:`, error.message); return -1; }
    return rows.length;
  } catch (e: any) { log(`[${profileId}] chatlogs ${chatId} fail:`, e.message); return -1; }
}
async function persistHeartbeat(profileId: string, lastSeenLogId: string | null, lastError: string | null) {
  const patch: any = { profile_id: profileId, last_heartbeat_at: new Date().toISOString() };
  if (lastSeenLogId) patch.last_seen_log_id = lastSeenLogId;
  try {
    await supabase.from('kakao_partner_stream_state').upsert(patch, { onConflict: 'profile_id' });
    try {
      await supabase.from('kakao_partner_stream_state').upsert(
        { profile_id: profileId, last_error: lastError, last_error_at: lastError ? new Date().toISOString() : null },
        { onConflict: 'profile_id' });
    } catch { /* last_error 컬럼 미존재 무시 */ }
  } catch (e: any) { log(`[${profileId}] state persist fail:`, e.message); }
}
async function collectChannel(profileId: string, cookie: string) {
  const client = new KakaoPartnerClient({ cookie, profileId });
  try {
    const me: any = await client.me();
    log(`[${profileId}] auth ok: ${me.email || me.id || 'unknown'}`);
  } catch (e: any) {
    if (isAuthError(e)) {
      await persistHeartbeat(profileId, null, `auth ${e.status}`.slice(0, 300));
      const err: any = new Error('cookie expired'); err.authExpired = true; throw err;
    }
    throw e;
  }
  const cursors = await primeCursors(profileId);
  const res: any = await client.searchChats({ size: PAGE_SIZE });
  const items = Array.isArray(res?.items) ? res.items : [];
  let changed = 0, upserted = 0, capped = false;
  let lastSeen: string | null = null;
  const metaRows: any[] = [];
  for (const it of items) {
    const cid = String(it.id);
    const apiLast = it.last_log_id ? String(it.last_log_id) : null;
    const isChanged = !!apiLast && cursors.get(cid) !== apiLast;
    if (isChanged) {
      if (changed >= MAX_CHANGED) { capped = true; continue; }   // 상한 초과 → 커서 보존(메타 미갱신)
      changed++;
      const n = await fetchRecent(client, profileId, cid);
      if (n < 0) continue;                                       // 실패 → 커서 보존
      upserted += n; lastSeen = apiLast;
    }
    metaRows.push(sanitizeChatRow(chatToRow(it, profileId)));
  }
  if (metaRows.length) {
    const { error } = await supabase.from('kakao_partner_chats').upsert(metaRows, { onConflict: 'chat_id' });
    if (error) log(`[${profileId}] chats upsert fail:`, error.message);
  }
  await persistHeartbeat(profileId, lastSeen, null);
  log(`[${profileId}] done: scanned=${items.length} changed=${changed} upserted=${upserted} capped=${capped}`);
  return { profile_id: profileId, scanned: items.length, changed, upserted, capped };
}

// ───────────────────── HTTP 핸들러 ─────────────────────
Deno.serve(async (req: Request) => {
  // 1) 토큰 인증 (?token= 또는 Authorization: Bearer)
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const expected = await getSecret('kakao_collect_token');
  if (!expected || token !== expected) return json({ error: 'unauthorized' }, 401);

  // 2) 쿠키 (DB 우선)
  const cookie = await getSecret('kakao_partner_cookie');
  if (!cookie) return json({ status: 'skip', reason: 'no cookie in kakao_partner_secrets' });

  // 3) 채널별 수집
  const channels: any[] = [];
  let authExpired = false;
  for (const pid of PROFILE_IDS) {
    try {
      channels.push(await collectChannel(pid, cookie));
    } catch (e: any) {
      if (e.authExpired) { authExpired = true; channels.push({ profile_id: pid, error: 'cookie expired' }); break; }
      log(`[${pid}] channel error:`, e.message);
      channels.push({ profile_id: pid, error: String(e.message || e) });
    }
  }
  return json({ status: authExpired ? 'auth_expired' : 'ok', at: new Date().toISOString(), channels });
});

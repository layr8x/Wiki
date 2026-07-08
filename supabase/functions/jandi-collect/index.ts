// supabase/functions/jandi-collect/index.ts
// 잔디(JANDI) 방별 증분 수집 — Supabase Edge Function (pg_cron 이 주기 호출).
//
// 카카오(kakao-collect)와 동일 구조. 잔디는 대화 전체를 내보내는 웹훅이 없어(아웃고잉 웹훅은
// 트리거 단어 한정), 로그인 세션 access token 으로 내부 API(i1.jandi.com/message-api/v2)를
// 방별로 폴링해 적재한다. 상세: docs/JANDI_SETUP.md
//
// 인증(함수 호출): verify_jwt=false. jandi_secrets.key='jandi_collect_token' 을 ?token= 으로 비교.
// 토큰(잔디): jandi_secrets.key='jandi_access_token' (수명 ~12h → 주기적 갱신 배달 필요).
// DB 자격증명: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 Edge 런타임이 자동 주입.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const BASE = 'https://i1.jandi.com';
const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const PAGE = 50;
const MAX_PAGES = 8;      // 방·1회당 갭 백필 상한(Edge 시간 방어)
const JITTER_MS = 120;

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const isAuthError = (e: any) => e && (e.status === 401 || e.status === 403);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const linkIdNum = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
// 잔디 access token(JWT) 의 exp(만료, epoch ms) 디코드. 파싱 불가면 null.
// 이미 만료된 토큰으로 요청을 쏘면 방마다 401 을 받아 시간·로그만 낭비하고,
// 첫 방에서 break 하면 나머지 방은 heartbeat 정체로만 보여 장애 범위가 과소보고된다(관측 개선).
function jwtExpMs(token: string | null): number | null {
  try {
    const p = String(token).split('.')[1];
    if (!p) return null;
    const b64 = p.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(p.length / 4) * 4, '=');
    const payload = JSON.parse(atob(b64));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch { return null; }
}

// ── PII 라이트 마스킹(카드/주민/전화/이메일 — 직원 이름은 유지) ──
const CARD_RE = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
const RRN_RE = /\b\d{6}[-\s]?[1-4]\d{6}\b/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const MOBILE_RE = /(01[016-9])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g;
// ── 고객(학생·학부모) 개인정보 마스킹 — 사용자 승인된 "광범위" 범위.
// 이름+학번 붙여쓴 패턴(예 "조은호3491") 및 "학생/학부모/자녀/보호자 OOO" 문맥의 이름.
// ⚠️ 한글 이름은 직원/학생 구분이 안 돼 문맥 일치 시 직원 이름도 가려질 수 있음(트레이드오프 인지).
const STUDENT_ID_ATTACHED_RE = /[가-힣]{2,4}\d{3,6}(?![가-힣\d])/g;
const STUDENT_CTX_NAME_RE = /(학생|학부모|자녀|보호자)\s*([가-힣]{2,4})(?=님|이|가|은|는|을|를|,|\.|\s|$)/g;
function stripLoneSurrogates(s: any) {
  if (s == null) return s;
  return String(s).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}
function maskBody(text: any) {
  if (text == null) return text;
  let s = String(text);
  s = s.replace(CARD_RE, '[카드번호]').replace(RRN_RE, '[주민번호]')
       .replace(EMAIL_RE, '***@$1').replace(MOBILE_RE, '$1-****-$3');
  s = s.replace(STUDENT_ID_ATTACHED_RE, '[학생정보]').replace(STUDENT_CTX_NAME_RE, '$1 ***');
  return s;
}

// ── 잔디 REST 클라이언트 ──
class JandiClient {
  accessToken: string; teamId: string; memberId: string | null;
  constructor(accessToken: string, teamId: string, memberId: string | null = null) {
    this.accessToken = accessToken; this.teamId = String(teamId); this.memberId = memberId ? String(memberId) : null;
  }
  async _jitter() { await new Promise((r) => setTimeout(r, Math.floor(Math.random() * JITTER_MS) + 80)); }
  async _fetch(path: string) {
    await this._jitter();
    const headers: Record<string, string> = {
      'user-agent': DEFAULT_UA,
      // ⚠️ 잔디 API 는 버전드 Accept 필수. 일반 application/json 이면 406
      // {code:40600, msg:"version:accept"} 로 거절됨(2026-07 실측). message-api = v2.
      'accept': 'application/vnd.tosslab.jandi-v2+json',
      'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'authorization': `Bearer ${this.accessToken}`, 'x-team-id': this.teamId,
      'x-user-agent': 'Jandi/26.12 (web; Mac OS; 10.15; Browser; Chrome;)',
      'referer': 'https://flytofreedom.jandi.com/',
    };
    if (this.memberId) headers['x-member-id'] = this.memberId;
    const res = await fetch(BASE + path, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err: any = new Error(`HTTP ${res.status} ${path} :: ${body.slice(0, 200)}`); err.status = res.status; throw err;
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  }
  roomMessages(roomId: string, { count = PAGE, linkId = null as any, type = null as any } = {}) {
    const qs = new URLSearchParams({ count: String(count) });
    if (linkId) qs.set('linkId', String(linkId));
    if (type) qs.set('type', type);
    return this._fetch(`/message-api/v2/teams/${this.teamId}/rooms/${roomId}/messages?${qs.toString()}`);
  }
}

function extractRecords(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.records)) return res.records;
  if (Array.isArray(res.messages)) return res.messages;
  if (Array.isArray(res.data)) return res.data;
  return [];
}
// 방 "멤버 초대/입장/퇴장" 등 시스템 이벤트 레코드(status='event', 실제 대화 아님) 판별.
// 실측(2026-07): { status:'event', messageId:-1, info:{eventType:'member_invited',...}, ... }
// 형태로 message 필드 자체가 없다 — 대화 목록에 섞이면 "본문 없음" 빈 줄로 보여 혼동을 준다.
function isEventRecord(rec: any): boolean {
  return !rec || rec.status === 'event' || rec.message == null || typeof rec.message !== 'object';
}
// 스티커/파일/이미지 등 본문(body/text)이 없는 첨부형 콘텐츠용 안내 문구.
// ⚠️ content 객체를 그대로 JSON.stringify 하면 "{"richText":[],"stickerId":"11",...}" 같은
// 원본 덤프가 그대로 노출된다(실측 2026-07) — 사람이 읽는 라벨로 대체한다.
const CONTENT_TYPE_LABELS: Record<string, string> = {
  sticker: '스티커', file: '파일', image: '이미지', video: '동영상',
  poll: '투표', todo: '할일', album: '앨범', link: '링크', card: '카드',
};
function contentPlaceholder(contentType: string | null): string {
  return `[${(contentType && CONTENT_TYPE_LABELS[contentType]) || contentType || '첨부'}]`;
}
// raw(원본 레코드) 축소 저장기. ⚠️ rec.message.content 에는 "마스킹 이전" 원문 PII 가 들어 있어
// 통째로 저장하면(예전 raw: rec) message 컬럼의 마스킹이 무의미해진다(카카오는 sanitizeRaw 로 이미 축소).
// 매핑·디버깅에 필요한 구조 메타데이터만 남기고 본문(content/text)은 버린다.
function sanitizeRaw(rec: any): any {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null;
  const out: any = {
    status: rec.status ?? null,
    linkId: rec.linkId ?? rec.link_id ?? rec.id ?? null,
    roomId: rec.roomId ?? null,
    teamId: rec.teamId ?? null,
    fromEntity: rec.fromEntity ?? null,
    writerId: rec.writerId ?? null,
    time: rec.time ?? rec.createdAt ?? rec.created_at ?? null,
  };
  const m = rec.message && typeof rec.message === 'object' ? rec.message : null;
  if (m) {
    out.message = {
      id: m.id ?? null,
      writerId: m.writerId ?? null,
      fromEntity: m.fromEntity ?? null,
      contentType: m.contentType ?? m.type ?? null,
      feedbackId: m.feedbackId ?? null,
      createdAt: m.createdAt ?? m.created_at ?? null,
      // content(본문)·text 는 마스킹 이전 원문이라 제외.
    };
  }
  return out;
}
function messageToRow(rec: any, roomId: string, teamId: string): any {
  if (isEventRecord(rec)) return null;
  const msg = rec.message;
  const linkId = rec?.linkId ?? rec?.link_id ?? rec?.id ?? msg?.linkId ?? null;
  const messageId = msg?.id ?? rec?.messageId ?? rec?.message_id ?? null;
  const writerId = msg?.writerId ?? rec?.writerId ?? msg?.fromEntity ?? rec?.fromEntity ?? null;
  const writerName = msg?.writerName ?? msg?.writer?.name ?? rec?.writer?.name ?? rec?.info?.name ?? null;
  const contentType = msg?.contentType ?? msg?.type ?? rec?.contentType ?? null;
  const body = msg?.content && typeof msg.content === 'object'
    ? (msg.content.body ?? msg.content.text ?? contentPlaceholder(contentType))
    : (msg?.text ?? msg?.body ?? rec?.text ?? null);
  const createdRaw = msg?.createdAt ?? msg?.created_at ?? rec?.createdAt ?? rec?.created_at ?? rec?.time ?? null;
  let createdAt: string | null = null;
  if (createdRaw != null) { const d = new Date(createdRaw); createdAt = isNaN(d.getTime()) ? null : d.toISOString(); }
  let attachments: any = null;
  const c = msg?.content;
  if (c && typeof c === 'object' && (c.fileUrl || c.type === 'file' || c.stickerId || c.image)) attachments = c;
  const bodyStr = typeof body === 'string' ? body : (body != null ? JSON.stringify(body) : null);
  const replyTo = msg?.feedbackId != null && msg.feedbackId !== -1 ? String(msg.feedbackId) : null;
  return {
    room_id: String(roomId), link_id: linkId != null ? String(linkId) : null,
    message_id: messageId != null ? String(messageId) : null, team_id: String(teamId),
    writer_id: writerId != null ? String(writerId) : null, writer_name: writerName || null,
    content_type: contentType || null,
    message: bodyStr != null ? stripLoneSurrogates(maskBody(bodyStr)) : null,
    attachments, created_at: createdAt, raw: sanitizeRaw(rec), source: 'rest',
    reply_to_message_id: replyTo,
  };
}

async function getSecret(key: string): Promise<string | null> {
  const { data } = await supabase.from('jandi_secrets').select('value').eq('key', key).maybeSingle();
  return (data as any)?.value ?? null;
}
async function persistHeartbeat(roomId: string, lastSeen: string | null, lastError: string | null) {
  try {
    await supabase.from('jandi_stream_state').upsert({
      room_id: roomId, last_seen_link_id: lastSeen || null, last_heartbeat_at: new Date().toISOString(),
      last_error: lastError, last_error_at: lastError ? new Date().toISOString() : null,
    }, { onConflict: 'room_id' });
  } catch (e: any) { log(`[${roomId}] state persist fail:`, e.message); }
}

async function collectRoom(client: JandiClient, ch: any) {
  const roomId = String(ch.room_id), teamId = String(ch.team_id);
  const cursor = ch.last_link_id ? linkIdNum(ch.last_link_id) : 0;
  const first = await client.roomMessages(roomId, { count: PAGE });
  const collected: any[] = [...extractRecords(first)];
  let pages = 1;
  if (cursor > 0 && collected.length) {
    let oldest = Math.min(...collected.map((r) => linkIdNum(r?.linkId ?? r?.id)));
    while (oldest > cursor && pages < MAX_PAGES) {
      const more = extractRecords(await client.roomMessages(roomId, { count: PAGE, linkId: oldest, type: 'old' }));
      if (!more.length) break;
      collected.push(...more);
      oldest = Math.min(...more.map((r) => linkIdNum(r?.linkId ?? r?.id)));
      pages++;
    }
  }
  const rows = collected.map((r) => messageToRow(r, roomId, teamId)).filter((r) => r && r.link_id);
  if (rows.length) {
    const { error } = await supabase.from('jandi_messages').upsert(rows, { onConflict: 'room_id,link_id' });
    if (error) { await persistHeartbeat(roomId, ch.last_link_id, 'upsert: ' + error.message); return { room_id: roomId, error: error.message }; }
  }
  const newest = rows.reduce((a, r) => (linkIdNum(r.link_id) > linkIdNum(a?.link_id) ? r : a), rows[0] || null);
  if (newest?.link_id) {
    await supabase.from('jandi_channels').update({
      last_link_id: newest.link_id, last_message: newest.message ? newest.message.slice(0, 200) : null,
      last_message_at: newest.created_at || null,
    }).eq('room_id', roomId);
  }
  await persistHeartbeat(roomId, newest?.link_id || ch.last_link_id, null);
  log(`[${roomId}] done: fetched=${collected.length} upserted=${rows.length} pages=${pages}`);
  return { room_id: roomId, upserted: rows.length, pages };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const expected = await getSecret('jandi_collect_token');
  if (!expected || token !== expected) return json({ error: 'unauthorized' }, 401);

  const accessToken = await getSecret('jandi_access_token');
  if (!accessToken) return json({ status: 'skip', reason: 'no jandi_access_token in jandi_secrets' });
  const teamId = (await getSecret('jandi_team_id')) || '29522216';
  const memberId = await getSecret('jandi_member_id');

  const { data: channels, error } = await supabase
    .from('jandi_channels').select('room_id, team_id, label, last_link_id').eq('is_active', true);
  if (error) return json({ status: 'error', reason: 'channels: ' + error.message }, 500);
  if (!channels || !channels.length) return json({ status: 'skip', reason: 'no active channels' });

  // 토큰이 이미 만료됐으면 요청을 쏘지 않고, 활성 방 전부를 동일 사유로 표시(장애 범위 정확 보고).
  const expMs = jwtExpMs(accessToken);
  if (expMs != null && expMs <= Date.now()) {
    const ageMin = Math.round((Date.now() - expMs) / 60000);
    const reason = `token_expired (${ageMin}m ago)`;
    for (const ch of channels) await persistHeartbeat(String(ch.room_id), ch.last_link_id, reason);
    return json({ status: 'auth_expired', reason, at: new Date().toISOString(),
      rooms: channels.map((c: any) => ({ room_id: c.room_id, error: 'token expired' })) });
  }

  const client = new JandiClient(accessToken, teamId, memberId);
  const results: any[] = [];
  let authExpired = false;
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    try {
      results.push(await collectRoom(client, ch));
    } catch (e: any) {
      if (isAuthError(e)) {
        authExpired = true;
        // 인증 실패 = 남은 방도 같은 토큰이라 전부 실패한다. 남은 방 전부를 동일 사유로 표시해
        // 응답 본문과 heartbeat 가 실제 중단 범위(전 방)를 반영하게 한다(첫 방만 보고하던 문제 교정).
        for (let j = i; j < channels.length; j++) {
          await persistHeartbeat(String(channels[j].room_id), channels[j].last_link_id, `auth ${e.status}`);
          results.push({ room_id: channels[j].room_id, error: 'token expired' });
        }
        break;
      }
      log(`[${ch.room_id}] channel error:`, e.message);
      results.push({ room_id: ch.room_id, error: String(e.message || e) });
    }
  }
  return json({ status: authExpired ? 'auth_expired' : 'ok', at: new Date().toISOString(), rooms: results });
});

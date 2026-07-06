// supabase/functions/jandi-backfill/index.ts
// 잔디(JANDI) 이전 모든 대화 1회성 백필 — 서버측(Edge Function) 실행.
// jandi_access_token 을 서버측에서만 읽어 쓴다(외부에 노출 안 됨). 재시도/재개 안전(멱등).
// 방당 실행시간 예산을 넘으면 진행률(backfill_cursor)을 저장해두고 종료 — 다음 호출이 이어서 진행.
// 인증: jandi-collect 와 동일하게 jandi_secrets.jandi_collect_token 을 ?token= 으로 비교.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const BASE = 'https://i1.jandi.com';
const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const PAGE = 100;
const PAGE_BUDGET = 300;   // 호출당 총 페이지 상한(Edge 실행시간 방어) — 모자라면 다음 호출이 이어감
const JITTER_MS = 60;

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const isAuthError = (e: any) => e && (e.status === 401 || e.status === 403);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const linkIdNum = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// ── PII 라이트 마스킹(카드/주민/전화/이메일 — 이름은 내부 구성원이라 유지) ──
const CARD_RE = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
const RRN_RE = /\b\d{6}[-\s]?[1-4]\d{6}\b/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const MOBILE_RE = /(01[016-9])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g;
function stripLoneSurrogates(s: any) {
  if (s == null) return s;
  return String(s).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}
function maskBody(text: any) {
  if (text == null) return text;
  let s = String(text);
  s = s.replace(CARD_RE, '[카드번호]').replace(RRN_RE, '[주민번호]')
       .replace(EMAIL_RE, '***@$1').replace(MOBILE_RE, '$1-****-$3');
  return s;
}

// ── 잔디 REST 클라이언트 ──
class JandiClient {
  accessToken: string; teamId: string; memberId: string | null;
  constructor(accessToken: string, teamId: string, memberId: string | null = null) {
    this.accessToken = accessToken; this.teamId = String(teamId); this.memberId = memberId ? String(memberId) : null;
  }
  async _jitter() { await new Promise((r) => setTimeout(r, Math.floor(Math.random() * JITTER_MS) + 40)); }
  async _fetch(path: string) {
    await this._jitter();
    const headers: Record<string, string> = {
      'user-agent': DEFAULT_UA,
      // ⚠️ 잔디 API 는 버전드 Accept 필수. 일반 application/json 이면 406(2026-07 실측).
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
function isEventRecord(rec: any): boolean {
  return !rec || rec.status === 'event' || rec.message == null || typeof rec.message !== 'object';
}
// 레코드의 linkId(커서용)만 추출 — 이벤트 레코드도 포함해 페이지네이션 판단에 쓴다.
function recLinkId(rec: any): string | null {
  const v = rec?.linkId ?? rec?.link_id ?? rec?.id ?? null;
  return v != null ? String(v) : null;
}
function messageToRow(rec: any, roomId: string, teamId: string): any {
  if (isEventRecord(rec)) return null;
  const msg = rec.message;
  const linkId = rec?.linkId ?? rec?.link_id ?? rec?.id ?? msg?.linkId ?? null;
  const messageId = msg?.id ?? rec?.messageId ?? rec?.message_id ?? null;
  const writerId = msg?.writerId ?? rec?.writerId ?? msg?.fromEntity ?? rec?.fromEntity ?? null;
  const writerName = msg?.writerName ?? msg?.writer?.name ?? rec?.writer?.name ?? rec?.info?.name ?? null;
  const contentType = msg?.contentType ?? msg?.type ?? rec?.contentType ?? null;
  const body = (msg?.content && (msg.content.body ?? msg.content.text ?? msg.content)) ?? msg?.text ?? msg?.body ?? rec?.text ?? null;
  const createdRaw = msg?.createdAt ?? msg?.created_at ?? rec?.createdAt ?? rec?.created_at ?? rec?.time ?? null;
  let createdAt: string | null = null;
  if (createdRaw != null) { const d = new Date(createdRaw); createdAt = isNaN(d.getTime()) ? null : d.toISOString(); }
  let attachments: any = null;
  const c = msg?.content;
  if (c && typeof c === 'object' && (c.fileUrl || c.type === 'file' || c.stickerId || c.image)) attachments = c;
  const bodyStr = typeof body === 'string' ? body : (body != null ? JSON.stringify(body) : null);
  // 댓글(스레드 답글)이면 msg.feedbackId 가 부모 메시지의 message_id 를 가리킨다(-1 이면 없음).
  const replyTo = msg?.feedbackId != null && msg.feedbackId !== -1 ? String(msg.feedbackId) : null;
  return {
    room_id: String(roomId), link_id: linkId != null ? String(linkId) : null,
    message_id: messageId != null ? String(messageId) : null, team_id: String(teamId),
    writer_id: writerId != null ? String(writerId) : null, writer_name: writerName || null,
    content_type: contentType || null,
    message: bodyStr != null ? stripLoneSurrogates(maskBody(bodyStr)) : null,
    attachments, created_at: createdAt, raw: null, source: 'rest-backfill',
    reply_to_message_id: replyTo,
  };
}

async function getSecret(key: string): Promise<string | null> {
  const { data } = await supabase.from('jandi_secrets').select('value').eq('key', key).maybeSingle();
  return (data as any)?.value ?? null;
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
    .from('jandi_channels')
    .select('room_id, team_id, label, backfill_cursor, backfill_done')
    .eq('is_active', true).eq('backfill_done', false);
  if (error) return json({ status: 'error', reason: 'channels: ' + error.message }, 500);
  if (!channels || !channels.length) return json({ status: 'done', reason: 'all rooms already backfilled' });

  const client = new JandiClient(accessToken, teamId, memberId);
  const results: any[] = [];
  let pagesUsed = 0;
  let authExpired = false;

  for (const ch of channels) {
    if (authExpired) break;
    const roomId = String(ch.room_id), roomTeam = String(ch.team_id || teamId);
    let cursor: number | null = ch.backfill_cursor ? linkIdNum(ch.backfill_cursor) : null;
    let pages = 0, fetched = 0, upserted = 0, doneRoom = false, firstLinkId: number | null = null;
    try {
      while (pagesUsed < PAGE_BUDGET) {
        const res: any = cursor
          ? await client.roomMessages(roomId, { count: PAGE, linkId: cursor, type: 'old' })
          : await client.roomMessages(roomId, { count: PAGE });
        if (firstLinkId == null && res?.firstLinkId != null) firstLinkId = linkIdNum(res.firstLinkId);
        const recs = extractRecords(res);
        if (!recs.length) { doneRoom = true; break; }
        // 실제 대화 행(시스템 이벤트 제외) — 페이지 전체가 이벤트뿐이어도(rows 0건)
        // 아래 커서 전진은 raw recs 기준이라 조기 종료되지 않는다.
        const rows = recs.map((r) => messageToRow(r, roomId, roomTeam)).filter(Boolean);
        if (rows.length) {
          const { error: upErr } = await supabase.from('jandi_messages').upsert(rows, { onConflict: 'room_id,link_id' });
          if (upErr) { results.push({ room_id: roomId, error: 'upsert: ' + upErr.message }); break; }
          upserted += rows.length;
        }
        fetched += rows.length;
        pages++; pagesUsed++;
        // 다음 커서 = 이번 페이지의 가장 오래된 linkId(raw 레코드 기준, 이벤트 포함)
        const oldestId = recs.reduce((a: string | null, r: any) => {
          const id = recLinkId(r);
          return id != null && (a == null || linkIdNum(id) < linkIdNum(a)) ? id : a;
        }, null as string | null);
        const oldestNum = linkIdNum(oldestId);
        if (oldestId == null || (cursor != null && oldestNum >= cursor)) { doneRoom = true; break; }   // 커서 정체 = 끝
        cursor = oldestNum;
        if (recs.length < PAGE || (firstLinkId != null && oldestNum <= firstLinkId)) { doneRoom = true; break; }
      }
    } catch (e: any) {
      if (isAuthError(e)) { authExpired = true; results.push({ room_id: roomId, error: 'token expired' }); break; }
      results.push({ room_id: roomId, error: e.message });
    }
    await supabase.from('jandi_channels')
      .update({ backfill_cursor: cursor != null ? String(cursor) : null, backfill_done: doneRoom })
      .eq('room_id', roomId);
    log(`[${roomId}] pages=${pages} fetched=${fetched} upserted=${upserted} done=${doneRoom}`);
    results.push({ room_id: roomId, pages, fetched, upserted, done: doneRoom });
  }

  const remaining = await supabase.from('jandi_channels').select('room_id', { count: 'exact', head: true })
    .eq('is_active', true).eq('backfill_done', false);
  return json({
    status: authExpired ? 'auth_expired' : 'ok',
    at: new Date().toISOString(),
    rooms: results,
    remaining_rooms: remaining.count ?? null,
  });
});

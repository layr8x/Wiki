// scripts/lib/jandi-client.mjs
// 잔디(JANDI) 내부 REST 클라이언트 — access token 인증.
//
// 잔디는 대화 전체를 내보내는 웹훅이 없어(아웃고잉 웹훅=트리거 단어 한정), 카카오와 동일하게
// 로그인 세션의 access token 으로 내부 API(i1.jandi.com/message-api/v2)를 방별로 폴링한다.
// 엔드포인트/인증/팀·방 ID 는 잔디 웹앱 네트워크 캡처(HAR)에서 확인. 상세: docs/JANDI_SETUP.md
//
// 인증: Authorization: Bearer <access_token>  (+ X-Team-ID 헤더).
//   access token 은 JWT 이며 수명이 약 12시간으로 짧다 → jandi_secrets 보관함에서 최신값을 읽는다.
//   만료 시 401/403 → 상위 수집기가 재로그인/갱신 신호로 처리.

const BASE = 'https://i1.jandi.com';
const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

export class JandiClient {
  constructor({ accessToken, teamId, memberId = null, userAgent = DEFAULT_UA, jitterMs = 300 } = {}) {
    if (!accessToken) throw new Error('JandiClient: accessToken required');
    if (!teamId) throw new Error('JandiClient: teamId required');
    this.accessToken = accessToken;
    this.teamId = String(teamId);
    this.memberId = memberId ? String(memberId) : null;
    this.userAgent = userAgent;
    this.jitterMs = jitterMs;
  }

  // 만료 후 갱신된 토큰으로 런타임 교체.
  setAccessToken(token) {
    if (token && token !== this.accessToken) { this.accessToken = token; return true; }
    return false;
  }

  async _jitter() {
    const ms = Math.floor(Math.random() * this.jitterMs) + 80;
    await new Promise((r) => setTimeout(r, ms));
  }

  async _fetch(path, opts = {}) {
    await this._jitter();
    const url = path.startsWith('http') ? path : BASE + path;
    const headers = {
      'user-agent': this.userAgent,
      // ⚠️ 잔디 API 는 버전드 Accept 를 요구한다. 일반 application/json 이면 406
      // {code:40600, msg:"version:accept"} 로 거절됨(2026-07 실측). message-api 는 v2.
      'accept': 'application/vnd.tosslab.jandi-v2+json',
      'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'authorization': `Bearer ${this.accessToken}`,
      'x-team-id': this.teamId,
      // 실제 잔디 웹 클라이언트가 보내는 커스텀 UA(필수는 아니나 정합성 위해 동봉).
      'x-user-agent': 'Jandi/26.12 (web; Mac OS; 10.15; Browser; Chrome;)',
      'referer': 'https://flytofreedom.jandi.com/',
      ...(opts.headers || {}),
    };
    if (this.memberId) headers['x-member-id'] = this.memberId;
    const res = await fetch(url, { ...opts, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status} ${path} :: ${body.slice(0, 200)}`);
      err.status = res.status; // 401/403 → 토큰 만료 판정
      throw err;
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  }

  // ─── 방 메시지 페이지 ────────────────────────────────────────────────────
  // linkId 없이 호출 → 최신 count 건.
  // type='old' + linkId=<cursor> → cursor 보다 과거 count 건(백필/갭 메우기).
  // 반환은 잔디 원본(응답 shape 은 first-collection 에서 검증 — raw 통째 저장하므로 무손실).
  roomMessages(roomId, { count = 50, linkId = null, type = null } = {}) {
    const qs = new URLSearchParams({ count: String(count) });
    if (linkId) qs.set('linkId', String(linkId));
    if (type) qs.set('type', type);
    return this._fetch(
      `/message-api/v2/teams/${this.teamId}/rooms/${roomId}/messages?${qs.toString()}`,
    );
  }

  // 인증 확인용 경량 호출(방 1건 최신 메시지). 401/403 이면 토큰 만료.
  async ping(roomId) {
    return this.roomMessages(roomId, { count: 1 });
  }
}

// ─── 잔디 응답 → 레코드 배열 정규화 ──────────────────────────────────────────
// 응답 shape 가 { records: [...] } / { messages: [...] } / 바로 배열 어느 것이어도 견디게.
export function extractRecords(res) {
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
export function isEventRecord(rec) {
  return !rec || rec.status === 'event' || rec.message == null || typeof rec.message !== 'object';
}

// 레코드의 linkId(커서용)만 추출 — 이벤트 레코드도 포함해 페이지네이션 판단에 쓴다
// (messageToRow 는 이벤트를 null 로 걸러내므로, 커서 전진은 이 함수로 별도 계산해야
//  "이벤트만 있는 페이지"에서 백필이 조기 종료되지 않는다).
export function recLinkId(rec) {
  const v = rec?.linkId ?? rec?.link_id ?? rec?.id ?? null;
  return v != null ? String(v) : null;
}

// ─── 레코드 1건 → jandi_messages row (방어적 매핑) ───────────────────────────
// 정확한 키 이름이 캡처에 없어(응답 본문 미포함), 흔한 후보를 순서대로 시도하고
// 원본(raw)을 통째 저장한다 → 표시 매핑이 어긋나도 데이터 손실 없음(재수집 불필요).
// 시스템 이벤트 레코드는 null 반환(호출부에서 filter(Boolean)) — 실제 대화가 아님.
export function messageToRow(rec, roomId, teamId) {
  if (isEventRecord(rec)) return null;
  const msg = rec.message;
  const linkId = rec?.linkId ?? rec?.link_id ?? rec?.id ?? msg?.linkId ?? null;
  const messageId = msg?.id ?? rec?.messageId ?? rec?.message_id ?? null;
  const writerId = msg?.writerId ?? rec?.writerId ?? msg?.fromEntity ?? rec?.fromEntity ?? null;
  const writerName = msg?.writerName ?? msg?.writer?.name ?? rec?.writer?.name ?? rec?.info?.name ?? null;
  const contentType = msg?.contentType ?? msg?.type ?? rec?.contentType ?? null;
  const body =
    (msg?.content && (msg.content.body ?? msg.content.text ?? msg.content))
    ?? msg?.text ?? msg?.body ?? rec?.text ?? null;
  // msg.createdAt(ISO) 우선, 없으면 레코드 최상위 time(밀리초 epoch)로 폴백.
  const createdRaw = msg?.createdAt ?? msg?.created_at ?? rec?.createdAt ?? rec?.created_at ?? rec?.time ?? null;
  let createdAt = null;
  if (createdRaw != null) {
    const d = new Date(createdRaw);
    createdAt = isNaN(d.getTime()) ? null : d.toISOString();
  }
  // 첨부: content 가 객체(파일/스티커 등)면 부가정보로 보존.
  let attachments = null;
  const c = msg?.content;
  if (c && typeof c === 'object' && (c.fileUrl || c.type === 'file' || c.stickerId || c.image)) {
    attachments = c;
  }
  // 댓글(스레드 답글)이면 msg.feedbackId 가 부모 메시지의 message_id 를 가리킨다(-1 이면 없음).
  const replyTo = msg?.feedbackId != null && msg.feedbackId !== -1 ? String(msg.feedbackId) : null;
  return {
    room_id: String(roomId),
    link_id: linkId != null ? String(linkId) : null,
    message_id: messageId != null ? String(messageId) : null,
    team_id: String(teamId),
    writer_id: writerId != null ? String(writerId) : null,
    writer_name: writerName || null,
    content_type: contentType || null,
    message: typeof body === 'string' ? body : (body != null ? JSON.stringify(body) : null),
    attachments,
    created_at: createdAt,
    raw: rec ?? null,
    source: 'rest',
    reply_to_message_id: replyTo,
  };
}

// linkId 비교용 숫자화(잔디 linkId 는 큰 정수). 문자열 비교 대신 안전 비교.
export function linkIdNum(v) {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

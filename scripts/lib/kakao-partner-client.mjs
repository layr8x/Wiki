// scripts/lib/kakao-partner-client.mjs
// 카카오 비즈니스 파트너센터 REST 클라이언트 (cookie 인증)
//
// .env.local 에 KAKAO_PARTNER_COOKIE 와 KAKAO_PARTNER_PROFILE_ID 가 있어야 함.
// cookie 추출 방법: docs/KAKAO_PARTNER_SETUP.md 참고.

const BASE = 'https://business.kakao.com';
const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

export class KakaoPartnerClient {
  constructor({ cookie, profileId, userAgent = DEFAULT_UA, jitterMs = 400 } = {}) {
    if (!cookie) throw new Error('KakaoPartnerClient: cookie required');
    if (!profileId) throw new Error('KakaoPartnerClient: profileId required');
    this.cookie = cookie;
    this.profileId = profileId;
    this.userAgent = userAgent;
    this.jitterMs = jitterMs;
    this.rotated = false; // 카카오가 응답으로 새 토큰을 내려준 적이 있으면 true
  }

  // 카카오는 호출 도중 로그인 토큰(_kawlt 등)을 갱신해 Set-Cookie 로 돌려줄 때가 있다.
  // 이걸 무시하고 처음 쿠키만 계속 쓰면, 카카오 쪽에서 옛 토큰을 무효화하는 순간
  // 다음 호출부터 401 이 나고 수집이 조용히 멈춘다(2026-07-25 중단의 재발 방지책).
  // → 응답에 실린 새 값을 쿠키 보따리에 합쳐 이후 호출부터 최신 토큰을 쓴다.
  _absorbSetCookie(res) {
    let list = [];
    try { list = res.headers.getSetCookie?.() ?? []; } catch { /* 구버전 런타임 */ }
    if (!list.length) { const one = res.headers.get('set-cookie'); if (one) list = [one]; }
    if (!list.length) return;

    const jar = new Map();
    for (const part of this.cookie.split(';')) {
      const s = part.trim();
      if (!s) continue;
      const i = s.indexOf('=');
      if (i > 0) jar.set(s.slice(0, i), s.slice(i + 1));
    }
    let changed = false;
    for (const sc of list) {
      const first = String(sc).split(';')[0].trim();
      const i = first.indexOf('=');
      if (i <= 0) continue;
      const name = first.slice(0, i);
      const val = first.slice(i + 1);
      // 삭제 지시(빈 값/deleted)는 무시 — 멀쩡한 세션을 스스로 깎지 않기 위해.
      if (!val || val === 'deleted') continue;
      if (jar.get(name) !== val) { jar.set(name, val); changed = true; }
    }
    if (changed) {
      this.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
      this.rotated = true;
    }
  }

  // 쿠키 만료 후 갱신된 값으로 런타임 교체 (장시간 데몬 자가복구용).
  setCookie(cookie) {
    if (cookie && cookie !== this.cookie) {
      this.cookie = cookie;
      return true;
    }
    return false;
  }

  // 인간 트래픽 모방용 random delay
  async _jitter() {
    const ms = Math.floor(Math.random() * this.jitterMs) + 100;
    await new Promise((r) => setTimeout(r, ms));
  }

  async _fetch(path, opts = {}) {
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
    if (res.ok) this._absorbSetCookie(res);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status} ${path} :: ${body.slice(0, 200)}`);
      err.status = res.status; // 401/403 → 쿠키 만료 판정에 사용
      throw err;
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  }

  // ─── 사용자 정보 (인증 검증용) ────────────────────────────────────────────
  me() {
    return this._fetch('/api/users/me');
  }

  // ─── 채팅 목록 (페이징) ──────────────────────────────────────────────────
  // 실측: size cap=100, since 는 query string + last 채팅의 last_log_id 값.
  // body 는 query 필터 ({status, keyword, labels, isBlocked, isStarred}). 비우면 전체.
  searchChats({ size = 100, since = null, body = {} } = {}) {
    const qs = since ? `size=${size}&since=${since}` : `size=${size}`;
    return this._fetch(
      `/api/profiles/${this.profileId}/chats/search?${qs}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
  }

  // 단일 채팅 메타
  getChat(chatId) {
    return this._fetch(`/api/profiles/${this.profileId}/chats/${chatId}`);
  }

  // 단일 채팅의 최신 메시지 페이지(size 건). REST 증분 수집/백필 공통 경로.
  chatLogs(chatId, { size = 200 } = {}) {
    return this._fetch(`/api/profiles/${this.profileId}/chats/${chatId}/chatlogs?size=${size}`);
  }

  // 진행 중 상담 (assignment 상태 확인용)
  getConsult() {
    return this._fetch(`/api/profiles/${this.profileId}/chats/consult`);
  }

  // 매니저 / 라벨 메타
  getManagers() {
    return this._fetch(`/api/profiles/${this.profileId}/managers`);
  }
  getChatLabels() {
    return this._fetch(`/api/profiles/${this.profileId}/chat_labels`);
  }
}

// ─── 카카오 응답 → DB row 매핑 ─────────────────────────────────────────────
export function chatToRow(item, profileId) {
  const u = item.talk_user || {};
  return {
    chat_id: String(item.id),
    profile_id: profileId,
    user_id: u.id ? String(u.id) : null,
    nickname: u.nickname || null,
    profile_image_url: u.profile_image_url || null,
    user_type: u.user_type ?? 0,
    last_log_id: item.last_log_id ? String(item.last_log_id) : null,
    last_message: item.last_message ?? null,
    last_log_send_at: item.last_log_send_at
      ? new Date(item.last_log_send_at).toISOString()
      : null,
    is_read: !!item.is_read,
    is_done: !!item.is_done,
    is_blocked: !!item.is_blocked,
    is_starred: !!item.is_starred,
    is_deleted: !!item.is_deleted,
    unread_count: item.unread_count ?? 0,
    assignee_id: item.assignee_id ?? 0,
    raw: item,
    remote_version: item.version ?? null,
  };
}

// ─── 카카오 chatlogs item → kakao_partner_messages row 매핑 ────────────────
// REST 조회 경로(증분 폴링/백필) 공통. 상시 데몬과 1회성 수집기가 동일 row 를
// 생성하도록 단일 정의로 유지한다. source 는 항상 'rest_backfill'.
export function logToRow(item, chatId, profileId) {
  const isManager = !!item.manager;
  const author = item.author || {};
  const senderType = isManager ? 'manager' : (author.user_type === 0 ? 'user' : 'system');
  const senderId = isManager ? String(item.manager?.id ?? '') : String(author.id ?? '');
  return {
    log_id: String(item.id),
    chat_id: String(chatId),
    profile_id: profileId,
    sender_type: senderType,
    sender_id: senderId || null,
    message: item.message ?? item.text ?? item.content ?? null,
    message_type: item.type ?? null,
    attachments: item.attachment && Object.keys(item.attachment).length ? item.attachment : null,
    sent_at: item.send_at ? new Date(item.send_at).toISOString()
      : item.created_at ? new Date(item.created_at).toISOString() : new Date().toISOString(),
    raw: item,
    source: 'rest_backfill',
  };
}

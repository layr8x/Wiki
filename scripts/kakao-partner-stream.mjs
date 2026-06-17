#!/usr/bin/env node
// scripts/kakao-partner-stream.mjs
// 파트너센터 SockJS WebSocket 실시간 스트림.
//
// 동작:
//  1. /ws/info 에서 SockJS 서버 능력 확인
//  2. wss://pf-capi.kakao.com/ws/<server>/<session>/websocket 직접 연결
//     (SockJS 핸드셰이크: 'o' 수신 → 'connect' 메시지 송신)
//  3. 서버가 push 하는 모든 frame 을 파싱해서 supabase 적재
//  4. 일정 주기로 REST 폴백: chats/search 조회 → 새 last_log_id 가 있는데
//     메시지가 없는 채팅은 갭 발생 → 알림 (메시지 endpoint 확정 시 백필 추가)
//
// 첫 가동 시 페이로드 구조 학습용으로 모든 frame 을 raw 로 콘솔 + 파일에 덤프.
//
// 실행:
//   node --env-file=.env.local scripts/kakao-partner-stream.mjs

import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { KakaoPartnerClient, chatToRow, logToRow } from './lib/kakao-partner-client.mjs';
import { getAdminClient } from './lib/supabase-admin.mjs';
import { readCookieFromEnvFile, maybeRefreshCookie, envFilePath } from './lib/kakao-cookie.mjs';
import { sanitizeMessageRow, sanitizeChatRow } from './lib/kakao-sanitize.mjs';

const PROFILE_ID = process.env.KAKAO_PARTNER_PROFILE_ID;
const COOKIE = process.env.KAKAO_PARTNER_COOKIE;
const WS_HOST = process.env.KAKAO_PARTNER_WS_HOST || 'pf-capi.kakao.com';
const POLL_FALLBACK_MS = Number(process.env.KAKAO_PARTNER_POLL_MS || 60_000);
const DUMP_RAW = process.env.KAKAO_PARTNER_DUMP_RAW !== 'false';
const DUMP_PATH = process.env.KAKAO_PARTNER_DUMP_PATH || './kakao-partner-raw.log';
// 쿠키 만료 시 Chrome 에서 자동 재추출 시도 (macOS 데몬 머신 기준). '0' 으로 비활성.
const AUTO_REFRESH = process.env.KAKAO_PARTNER_AUTO_REFRESH !== '0';
const isAuthError = (e) => e && (e.status === 401 || e.status === 403);

// SockJS 표준
function randomServerId() {
  return String(Math.floor(Math.random() * 1000)).padStart(3, '0');
}
function randomSessionId() {
  return Math.random().toString(36).substring(2, 10);
}

class KakaoStream {
  constructor() {
    this.client = new KakaoPartnerClient({ cookie: COOKIE, profileId: PROFILE_ID });
    this.supabase = getAdminClient();
    this.ws = null;
    this.reconnects = 0;
    this.shouldRun = true;
    this.lastSeenLogId = null;
    this._pollTimer = null;
    this.lastLogByChat = new Map();
    this.envPath = envFilePath();
  }

  _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  log(...args) {
    const ts = new Date().toISOString();
    console.log(`[${ts}]`, ...args);
  }

  appendRaw(line) {
    if (!DUMP_RAW) return;
    try {
      fs.appendFileSync(DUMP_PATH, line + '\n', 'utf8');
    } catch (e) {
      console.error('[dump] append failed', e.message);
    }
  }

  // 쿠키 만료(401/403) 시 자가복구:
  //  1) .env.local 을 다시 읽어 외부에서 갱신된 쿠키를 픽업 (무비용)
  //  2) macOS 라면 Chrome 로컬 쿠키에서 재추출(refresh 스크립트) 후 재읽기
  // 복구되면 true. (다채널 동시 폭주는 lockfile 쿨다운으로 방지)
  async _recoverAuth() {
    const fromEnv = readCookieFromEnvFile(this.envPath);
    if (fromEnv && this.client.setCookie(fromEnv)) {
      this.log('cookie reloaded from .env.local');
      return true;
    }
    if (AUTO_REFRESH) {
      this.log('attempting cookie refresh from Chrome…');
      const ok = maybeRefreshCookie({ cwd: process.cwd() });
      const next = readCookieFromEnvFile(this.envPath);
      if (next && this.client.setCookie(next)) {
        this.log('cookie refreshed + reloaded');
        return true;
      }
      this.log(`cookie refresh ${ok ? 'ran but value unchanged' : 'unavailable (non-mac/Chrome 로그아웃?)'}`);
    }
    return false;
  }

  // 인증이 살아날 때까지 재시도 (데몬은 죽지 않고 쿠키 갱신을 기다림).
  async _ensureAuth() {
    let attempt = 0;
    while (this.shouldRun) {
      try {
        const me = await this.client.me();
        this.log(`auth ok: ${me.email || me.id || 'unknown'}`);
        await this._persistState({ last_error: null });
        return true;
      } catch (e) {
        this.log(`auth check failed${e.status ? ' HTTP ' + e.status : ''}: ${e.message}`);
        await this._persistState({ last_error: `auth ${e.status || ''}: ${e.message}`.slice(0, 300) });
        if (isAuthError(e)) await this._recoverAuth();
        const backoff = Math.min(5 * 60_000, 5000 * 2 ** Math.min(attempt, 6));
        const jitter = Math.floor(Math.random() * 2000);
        this.log(`retry auth in ${backoff + jitter}ms`);
        await this._sleep(backoff + jitter);
        attempt++;
      }
    }
    return false;
  }

  async start() {
    // 인증 검증 (쿠키 만료 시 죽지 않고 복구를 기다림)
    if (!(await this._ensureAuth())) return;

    // 직전 상태 로드
    const { data: state } = await this.supabase
      .from('kakao_partner_stream_state')
      .select('*')
      .eq('profile_id', PROFILE_ID)
      .maybeSingle();
    if (state) {
      this.lastSeenLogId = state.last_seen_log_id;
      this.log(`resumed from last_seen_log_id=${this.lastSeenLogId}`);
    }

    // 종료 시그널
    process.on('SIGINT', () => this.stop('SIGINT'));
    process.on('SIGTERM', () => this.stop('SIGTERM'));

    // 증분 수집 기준 프라이밍 + REST 증분 폴링 시작
    await this._primeLastLog();
    this._startPollFallback();

    // WS 루프
    while (this.shouldRun) {
      try {
        await this._connectAndPump();
      } catch (e) {
        this.log('ws loop error:', e.message);
      }
      if (!this.shouldRun) break;
      const backoff = Math.min(30_000, 1000 * 2 ** Math.min(this.reconnects, 5));
      const jitter = Math.floor(Math.random() * 2000);
      this.log(`reconnect in ${backoff + jitter}ms (attempt ${this.reconnects + 1})`);
      await new Promise((r) => setTimeout(r, backoff + jitter));
      this.reconnects++;
    }
  }

  async _connectAndPump() {
    // SockJS info ping (cookie 살아있는지도 확인됨)
    const infoUrl = `https://${WS_HOST}/ws/info?t=${Date.now()}`;
    const infoRes = await fetch(infoUrl, {
      headers: { cookie: this.client.cookie, 'user-agent': 'kakao-partner-stream/1.0' },
    });
    if (!infoRes.ok) {
      if (infoRes.status === 401 || infoRes.status === 403) await this._recoverAuth();
      throw new Error(`ws/info HTTP ${infoRes.status}`);
    }
    const info = await infoRes.json();
    if (!info.websocket) throw new Error('server reports websocket=false');

    const serverId = randomServerId();
    const sessionId = randomSessionId();
    const wsUrl = `wss://${WS_HOST}/ws/${serverId}/${sessionId}/websocket`;
    this.log(`connecting ${wsUrl}`);

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          cookie: this.client.cookie,
          origin: 'https://business.kakao.com',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        },
      });
      this.ws = ws;

      const settle = (err) => {
        ws.removeAllListeners();
        if (err) reject(err);
        else resolve();
      };

      ws.on('open', () => this.log('ws open'));
      ws.on('error', (e) => settle(e));
      ws.on('close', (code, reason) => {
        this.log(`ws close ${code} ${reason?.toString()}`);
        settle();
      });
      ws.on('message', (data) => this._handleFrame(data.toString()).catch((e) => {
        this.log('handleFrame error:', e.message);
      }));

      // 상태 기록
      this._persistState({ ws_session_id: sessionId, ws_server_id: serverId });
    });
  }

  // SockJS frame 파서
  // 'o'           : open
  // 'h'           : heartbeat
  // 'a[...]'      : array of messages (JSON-encoded strings)
  // 'm"..."'      : single message
  // 'c[code,msg]' : close
  async _handleFrame(raw) {
    this.appendRaw(`<- ${raw}`);
    if (!raw) return;
    const head = raw[0];

    if (head === 'o') {
      this.log('sockjs OPEN — sending CONNECT');
      // STOMP CONNECT — destination subscribe 는 CONNECTED 받은 뒤
      this._sendFrame('CONNECT\naccept-version:1.1,1.0\nheart-beat:10000,10000\n\n\x00');
      return;
    }
    if (head === 'h') return; // heartbeat
    if (head === 'c') {
      this.log('sockjs CLOSE frame:', raw);
      try { this.ws.close(); } catch {}
      return;
    }

    let payloads = [];
    try {
      if (head === 'a') payloads = JSON.parse(raw.slice(1));
      else if (head === 'm') payloads = [JSON.parse(raw.slice(1))];
      else return;
    } catch (e) {
      this.log('frame parse fail:', e.message, raw.slice(0, 120));
      return;
    }

    for (const p of payloads) {
      await this._handlePayload(p);
    }
  }

  _sendFrame(s) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const wire = JSON.stringify([s]);
    this.appendRaw(`-> ${wire}`);
    this.ws.send(wire);
  }

  // 페이로드 분기 — 첫 가동 시엔 구조 모르니 모두 raw 저장 + 휴리스틱 추출
  async _handlePayload(p) {
    let obj = p;
    if (typeof p === 'string') {
      // STOMP frame: COMMAND\nh1:v1\n...\n\nbody
      const headEnd = p.indexOf('\n\n');
      if (headEnd >= 0) {
        const headPart = p.slice(0, headEnd);
        const lines = headPart.split('\n');
        const stompCommand = lines[0];
        const stompHeaders = {};
        for (const ln of lines.slice(1)) {
          const ci = ln.indexOf(':');
          if (ci > 0) stompHeaders[ln.slice(0, ci)] = ln.slice(ci + 1);
        }
        const body = p.slice(headEnd + 2).replace(/[\s\u0000]+$/, '');

        if (stompCommand === 'CONNECTED') {
          const dest = `/topic/profiles-${PROFILE_ID}`;
          const subId = `sub-${Date.now()}`;
          this.log(`STOMP connected, SUBSCRIBE ${dest}`);
          this._sendFrame(`SUBSCRIBE\nid:${subId}\ndestination:${dest}\n\n `);
          return;
        }
        if (stompCommand === 'ERROR') {
          this.log('STOMP ERROR:', headPart, body.slice(0, 200));
          return;
        }
        if (body) {
          try { obj = JSON.parse(body); }
          catch { obj = { _body: body.slice(0,400), _headers: stompHeaders, _command: stompCommand }; }
        } else {
          obj = { _command: stompCommand, _headers: stompHeaders };
        }
      } else {
        try { obj = JSON.parse(p); } catch { obj = { _raw: p }; }
      }
    }

    // 휴리스틱: log_id, chat_id, message 가 보이면 메시지 row 생성
    const logId = obj?.log_id || obj?.id || obj?.message?.log_id;
    const chatId = obj?.chat_id || obj?.message?.chat_id;
    const messageText = obj?.message?.text || obj?.text || obj?.last_message;

    if (logId && chatId) {
      const row = {
        log_id: String(logId),
        chat_id: String(chatId),
        profile_id: PROFILE_ID,
        sender_type: obj?.author?.type || obj?.sender_type || null,
        sender_id: obj?.author?.id || obj?.sender_id || null,
        message: messageText || null,
        message_type: obj?.type || obj?.message_type || null,
        attachments: obj?.attachments || null,
        sent_at: obj?.send_at
          ? new Date(obj.send_at).toISOString()
          : obj?.sent_at
          ? new Date(obj.sent_at).toISOString()
          : new Date().toISOString(),
        raw: obj,
        source: 'ws_push',
      };
      const safeRow = sanitizeMessageRow(row);
      try {
        const { error } = await this.supabase
          .from('kakao_partner_messages')
          .upsert(safeRow, { onConflict: 'log_id' });
        if (error) throw error;
        this.lastSeenLogId = safeRow.log_id;
        await this._persistState({
          last_seen_log_id: safeRow.log_id,
          total_messages_inc: 1,
        });
      } catch (e) {
        this.log('upsert message fail:', e.message);
      }
    } else {
      // 알 수 없는 frame → 로그만
      this.log('payload (unmatched):', JSON.stringify(obj).slice(0, 200));
    }
  }

  async _persistState({ ws_session_id, ws_server_id, last_seen_log_id, total_messages_inc, last_error } = {}) {
    const patch = {
      profile_id: PROFILE_ID,
      last_heartbeat_at: new Date().toISOString(),
    };
    if (ws_session_id) patch.ws_session_id = ws_session_id;
    if (ws_server_id) patch.ws_server_id = ws_server_id;
    if (last_seen_log_id) patch.last_seen_log_id = last_seen_log_id;
    if (this.reconnects > 0) patch.total_reconnects = this.reconnects;
    try {
      await this.supabase
        .from('kakao_partner_stream_state')
        .upsert(patch, { onConflict: 'profile_id' });
      // 헬스/에러 컬럼은 별도 best-effort upsert — 마이그레이션(2026-05-24) 미적용이어도 heartbeat 는 보존.
      if (last_error !== undefined) {
        try {
          await this.supabase
            .from('kakao_partner_stream_state')
            .upsert(
              { profile_id: PROFILE_ID, last_error, last_error_at: last_error ? new Date().toISOString() : null },
              { onConflict: 'profile_id' },
            );
        } catch { /* last_error/last_error_at 컬럼 미존재 시 무시 */ }
      }
      if (total_messages_inc) {
        // 카운터 증가는 RPC 가 깔끔하지만 일단 단순 update
        await this.supabase.rpc('increment_kakao_partner_total_messages', {
          p_profile_id: PROFILE_ID,
          p_inc: total_messages_inc,
        }).catch(() => {}); // RPC 미존재 시 silent
      }
    } catch (e) {
      this.log('state persist fail:', e.message);
    }
  }

  // DB chats.last_log_id 를 메모리에 적재 (첫 폴에서 전체 재조회 방지)
  async _primeLastLog() {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.supabase
        .from('kakao_partner_chats')
        .select('chat_id, last_log_id')
        .eq('profile_id', PROFILE_ID)
        .order('chat_id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) { this.log('prime error:', error.message); break; }
      if (!data || data.length === 0) break;
      for (const r of data) if (r.last_log_id) this.lastLogByChat.set(String(r.chat_id), String(r.last_log_id));
      if (data.length < PAGE) break;
    }
    this.log(`primed ${this.lastLogByChat.size} chat cursors`);
  }

  // 변경된 채팅의 최신 메시지 페이지(no-since=최신 N건)를 가져와 upsert (idempotent)
  async _fetchRecent(chatId) {
    try {
      const res = await this.client.chatLogs(chatId, { size: 200 });
      const items = res?.items || [];
      if (!items.length) return 0;
      const rows = items.map((it) => sanitizeMessageRow(logToRow(it, chatId, PROFILE_ID)));
      const { error } = await this.supabase
        .from('kakao_partner_messages').upsert(rows, { onConflict: 'log_id' });
      if (error) { this.log(`upsert ${chatId} fail:`, error.message); return -1; }
      this.lastSeenLogId = rows[rows.length - 1].log_id;
      return rows.length;
    } catch (e) {
      this.log(`chatlogs ${chatId} fail:`, e.message);
      return -1;
    }
  }

  // 증분 폴링: 채팅 목록을 받아 last_log_id 가 바뀐 채팅만 메시지 재수집.
  // (WS push 휴리스틱이 실데이터와 안 맞아 미동작 → REST 증분이 실제 수집 경로)
  _startPollFallback() {
    const tick = async () => {
      if (!this.shouldRun) return;
      try {
        const res = await this.client.searchChats({ size: 100 });
        const items = Array.isArray(res?.items) ? res.items : [];
        let changed = 0;
        let upserted = 0;
        for (const it of items) {
          const cid = String(it.id);
          const apiLast = it.last_log_id ? String(it.last_log_id) : null;
          if (!apiLast) continue;
          if (this.lastLogByChat.get(cid) !== apiLast) {
            changed++;
            const n = await this._fetchRecent(cid);
            // 실패(-1)면 커서 미전진 → 다음 tick 에서 재시도(영구 누락 차단)
            if (n >= 0) {
              upserted += n;
              this.lastLogByChat.set(cid, apiLast);
            }
          }
        }
        if (items.length) {
          const rows = items.map((it) => sanitizeChatRow(chatToRow(it, PROFILE_ID)));
          await this.supabase.from('kakao_partner_chats').upsert(rows, { onConflict: 'chat_id' });
        }
        await this._persistState({ last_error: null }); // 정상 폴 → 에러 상태 해제
        if (changed) this.log(`poll: ${changed} chats changed, ${upserted} msg-rows upserted`);
      } catch (e) {
        this.log(`poll error${e.status ? ' HTTP ' + e.status : ''}:`, e.message);
        await this._persistState({ last_error: `poll ${e.status || ''}: ${e.message}`.slice(0, 300) });
        // 쿠키 만료면 자가복구 시도 — 다음 tick 에서 새 쿠키로 재시도.
        if (isAuthError(e)) await this._recoverAuth();
      } finally {
        if (this.shouldRun) this._pollTimer = setTimeout(tick, POLL_FALLBACK_MS);
      }
    };
    this._pollTimer = setTimeout(tick, 3000);
  }

  stop(reason) {
    this.log(`stop signal: ${reason}`);
    this.shouldRun = false;
    if (this._pollTimer) clearTimeout(this._pollTimer);
    try { this.ws?.close(); } catch {}
    setTimeout(() => process.exit(0), 500);
  }
}

new KakaoStream().start().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});

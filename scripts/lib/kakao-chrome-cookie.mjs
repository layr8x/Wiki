// scripts/lib/kakao-chrome-cookie.mjs
// Chrome 로컬 쿠키 저장소에서 카카오 비즈니스 쿠키를 꺼내고, 그 쿠키가 파트너센터에서
// 실제로 통하는지 확인하는 공용 코드.
//
// 왜 따로 뺐나: 같은 로직을 kakao-partner-refresh-cookie.mjs(6시간마다 갱신·배달)와
// kakao-cloud-ip-test.mjs(클라우드에서 되는지 판별)가 같이 쓴다. 한쪽만 고쳐 두 코드가
// 서로 다르게 동작하면 "맥에서는 통과인데 배달된 건 다른 쿠키" 같은 진단 불가능한 상태가
// 된다 — 실제로 2026-07 에 프로필 선택 로직이 어긋나 17일간 수집이 멈춘 적이 있다.

import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const BASE = 'https://business.kakao.com';
export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

const HOME = os.homedir();
const CHROME = path.join(HOME, 'Library/Application Support/Google/Chrome');

const pw = () =>
  execFileSync('security', [
    'find-generic-password', '-w', '-s', 'Chrome Safe Storage', '-a', 'Chrome',
  ]).toString().trim();

const IV = Buffer.alloc(16, 0x20);

function makeDecrypt() {
  const key = crypto.pbkdf2Sync(pw(), 'saltysalt', 1003, 16, 'sha1');
  return function decrypt(u8) {
    const buf = Buffer.from(u8);
    if (buf.length < 4) return null;
    if (buf.subarray(0, 3).toString('latin1') !== 'v10') return buf.toString('utf8');
    const dec = crypto.createDecipheriv('aes-128-cbc', key, IV);
    dec.setAutoPadding(false);
    let out = Buffer.concat([dec.update(buf.subarray(3)), dec.final()]);
    const pad = out[out.length - 1];
    if (pad >= 1 && pad <= 16) out = out.subarray(0, out.length - pad);
    if (out.length > 32) {
      let ctrl = false;
      for (let i = 0; i < 32; i++) { if (out[i] < 0x20 || out[i] > 0x7e) { ctrl = true; break; } }
      if (ctrl) out = out.subarray(32);
    }
    return out.toString('utf8');
  };
}

function readProfile(dir, decrypt) {
  // Chrome 이 열어둔 DB 를 직접 읽으면 잠금에 걸리므로 임시 폴더로 복사해 읽는다.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-'));
  try {
    for (const f of ['Cookies', 'Cookies-wal', 'Cookies-shm']) {
      const src = path.join(dir, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tmp, f));
    }
    if (!fs.existsSync(path.join(tmp, 'Cookies'))) return null;
    const db = new DatabaseSync(path.join(tmp, 'Cookies'), { readOnly: false });
    const rows = db.prepare(
      "SELECT host_key, name, encrypted_value FROM cookies " +
      "WHERE host_key IN ('.kakao.com','business.kakao.com','.business.kakao.com','kakao.com')"
    ).all();
    db.close();
    rows.sort((a, b) => (a.host_key.startsWith('.kakao') ? 0 : 1) - (b.host_key.startsWith('.kakao') ? 0 : 1));
    const map = new Map();
    for (const r of rows) {
      const v = decrypt(r.encrypted_value);
      if (v != null && v !== '') map.set(r.name, v);
    }
    return map;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * _kawlt(로그인 토큰)를 가진 Chrome 프로필을 "전부" 최근 수정순으로 돌려준다.
 *
 * 하나만 고르지 않는 이유: Chrome 에 카카오 계정이 여러 개 물려 있으면(예 gmail 계정 /
 * kakao 계정) 파트너센터 권한이 없는 프로필이 더 최근에 수정될 수 있다. 그 쿠키를
 * 배달하면 수집기가 401 을 맞는다. 실제로 2026-07-25 부터 17일간 수집이 조용히 멈춘
 * 원인이 이것이었다 — 그래서 호출부는 반드시 verifyCookie 로 걸러 쓴다.
 */
export function listCookieCandidates() {
  const decrypt = makeDecrypt();
  const out = [];
  for (const name of fs.readdirSync(CHROME)) {
    const dir = path.join(CHROME, name);
    if (!fs.existsSync(path.join(dir, 'Cookies'))) continue;
    let map;
    try { map = readProfile(dir, decrypt); } catch { continue; }
    if (map && map.has('_kawlt')) {
      out.push({
        name,
        map,
        mtime: fs.statSync(path.join(dir, 'Cookies')).mtimeMs,
        cookie: [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
      });
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

// 카카오가 응답으로 내려주는 갱신 토큰(Set-Cookie)을 흡수한다. kakao-collect(Edge Function)의
// KakaoPartnerClient._absorbSetCookie 와 동일한 로직 — 카카오가 호출마다 세션 토큰을 굴리므로
// (브라우저가 로그인을 유지하는 원리), 검증 호출 자체가 이 함수로 넘겨받은 스냅샷을 한 걸음
// 앞질러 버린다. 회전분을 안 받으면 "검증은 통과했는데 그 값을 보관함에 올리면 이미 무효"가
// 된다(2026-08-19 실측 — 로컬 검증 직후 클라우드 수집이 즉시 401).
function absorbSetCookie(cookie, res) {
  let list = [];
  try { list = res.headers.getSetCookie?.() ?? []; } catch { /* 구버전 런타임 */ }
  if (!list.length) { const one = res.headers.get('set-cookie'); if (one) list = [one]; }
  if (!list.length) return cookie;
  const jar = new Map();
  for (const part of cookie.split(';')) {
    const s = part.trim(); if (!s) continue;
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
    if (!val || val === 'deleted') continue;
    if (jar.get(name) !== val) { jar.set(name, val); changed = true; }
  }
  return changed ? [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') : cookie;
}

/** 수집기(kakao-collect)와 똑같은 두 호출을 흉내낸다 — 통과하면 수집도 통과한다.
 *  각 호출의 Set-Cookie 회전분을 흡수해 최종 cookie 를 함께 돌려준다(그래야 이 검증
 *  때문에 회전된 값이 아니라 검증 "후" 최신 값이 보관함에 올라간다). */
export async function verifyCookie(cookie, profileId = process.env.KAKAO_VERIFY_PROFILE_ID || '_VGAQn') {
  let cur = cookie;
  const me = await fetch(`${BASE}/api/users/me`, {
    headers: {
      'user-agent': UA,
      accept: 'application/json, text/plain, */*',
      'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
      cookie: cur,
    },
  });
  if (me.ok) cur = absorbSetCookie(cur, me);
  if (!me.ok) return { ok: false, why: `me ${me.status}`, meStatus: me.status, chatsStatus: null, cookie: cur };
  const chats = await fetch(`${BASE}/api/profiles/${profileId}/chats/search?size=1`, {
    method: 'POST',
    headers: {
      'user-agent': UA,
      accept: 'application/json, text/plain, */*',
      'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
      cookie: cur,
      'content-type': 'application/json',
      referer: `${BASE}/${profileId}/chats`,
    },
    body: '{}',
  });
  if (chats.ok) cur = absorbSetCookie(cur, chats);
  return {
    ok: chats.ok,
    why: chats.ok ? '' : `chats ${chats.status}`,
    meStatus: me.status,
    chatsStatus: chats.status,
    cookie: cur,
  };
}

/** 후보를 순서대로 검증해 처음 통과하는 것을 돌려준다. 없으면 null.
 *  반환하는 cookie 는 검증 호출들이 회전시킨 "이후" 값 — 원본 스냅샷이 아니다. */
export async function pickWorkingCookie(candidates, onTry) {
  for (const c of candidates) {
    const r = await verifyCookie(c.cookie);
    onTry?.(c, r);
    if (r.ok) return { ...c, cookie: r.cookie, verify: r };
  }
  return null;
}

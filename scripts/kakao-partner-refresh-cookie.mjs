#!/usr/bin/env node
// scripts/kakao-partner-refresh-cookie.mjs
// Chrome 로컬 쿠키 저장소에서 카카오 비즈니스 쿠키를 추출해 .env.local 의
// KAKAO_PARTNER_COOKIE 를 갱신한다. 쿠키 만료(보통 1~4주) 시 실행.
//
// 전제: Chrome 으로 business.kakao.com 에 로그인되어 있어야 함.
// 실행: npm run kakao:refresh-cookie
//   (최초 실행 시 "Chrome Safe Storage" 키체인 접근 허용 팝업 → 항상 허용)
// Supabase 에 올린 쿠키는 pg_cron 이 5분마다 호출하는 kakao-collect Edge Function 이 읽어간다.

import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAdminClient } from './lib/supabase-admin.mjs';

// 추출한 쿠키를 Supabase 보관함(kakao_partner_secrets)에 upsert → GitHub Actions 수집기가
// 매 실행 시 최신 쿠키를 읽어감(쿠키 만료 수동 갱신 제거). 자격증명(SUPABASE_URL/
// SERVICE_ROLE_KEY)은 --env-file=.env.local 로 주입(또는 데몬에서 상속)된 process.env 사용.
// 수집기와 동일하게 supabase-js 클라이언트로 적재. best-effort: 실패해도 .env.local 갱신엔 무영향.
async function pushCookieToSupabase(cookie) {
  if (!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('[refresh] SUPABASE_URL/SERVICE_ROLE_KEY 미설정 → Supabase 배달 생략. (node --env-file=.env.local 로 실행)');
    return;
  }
  try {
    const sb = getAdminClient();
    const { error } = await sb
      .from('kakao_partner_secrets')
      .upsert(
        { key: 'kakao_partner_cookie', value: cookie, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
    if (error) throw error;
    console.log('[refresh] Supabase 보관함에 쿠키 배달 완료 (GitHub 수집기가 픽업)');
  } catch (e) {
    console.log('[refresh] Supabase 배달 생략/실패:', e.message);
  }
}

const HOME = os.homedir();
const CHROME = path.join(HOME, 'Library/Application Support/Google/Chrome');

const pw = execFileSync('security',
  ['find-generic-password', '-w', '-s', 'Chrome Safe Storage', '-a', 'Chrome']).toString().trim();
const key = crypto.pbkdf2Sync(pw, 'saltysalt', 1003, 16, 'sha1');
const IV = Buffer.alloc(16, 0x20);

function decrypt(u8) {
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
}

function readProfile(dir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-'));
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
  fs.rmSync(tmp, { recursive: true, force: true });
  rows.sort((a, b) => (a.host_key.startsWith('.kakao') ? 0 : 1) - (b.host_key.startsWith('.kakao') ? 0 : 1));
  const map = new Map();
  for (const r of rows) {
    const v = decrypt(r.encrypted_value);
    if (v != null && v !== '') map.set(r.name, v);
  }
  return map;
}

// _kawlt(로그인 토큰) 보유 프로필을 "전부" 후보로 수집(최근 수정순).
// 왜: 예전엔 mtime 이 가장 최근인 프로필 1개만 골랐다. Chrome 에 카카오 계정이 여러 개
//   물려 있으면(예: gmail 계정 / kakao 계정) 파트너센터 권한이 없는 프로필이 더 최근에
//   수정될 수 있고, 그 쿠키를 배달하면 수집기가 401 을 맞는다. 실제로 2026-07-25 부터
//   17일간 수집이 조용히 멈춘 원인이 이것이었다. → 이제 "실제로 통하는" 쿠키만 배달한다.
const candidates = [];
for (const name of fs.readdirSync(CHROME)) {
  const dir = path.join(CHROME, name);
  if (!fs.existsSync(path.join(dir, 'Cookies'))) continue;
  let map;
  try { map = readProfile(dir); } catch { continue; }
  if (map && map.has('_kawlt')) {
    const mtime = fs.statSync(path.join(dir, 'Cookies')).mtimeMs;
    candidates.push({ name, map, mtime });
  }
}
candidates.sort((a, b) => b.mtime - a.mtime);

if (!candidates.length) {
  console.error('[refresh] _kawlt 쿠키를 가진 Chrome 프로필을 못 찾음. Chrome 으로 business.kakao.com 에 로그인했는지 확인.');
  process.exit(1);
}

// 파트너센터에서 실제로 인증되고 채널 조회까지 되는지 확인(권한 없는 계정 걸러냄).
// 수집기(kakao-collect)와 동일한 호출을 그대로 흉내내므로, 통과하면 수집도 통과한다.
const BASE = 'https://business.kakao.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const VERIFY_PROFILE = process.env.KAKAO_VERIFY_PROFILE_ID || '_VGAQn'; // 마이클래스(주 채널)

async function verifyCookie(cookie) {
  const headers = {
    'user-agent': UA,
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
    cookie,
  };
  const me = await fetch(`${BASE}/api/users/me`, { headers });
  if (!me.ok) return { ok: false, why: `me ${me.status}` };
  const chats = await fetch(`${BASE}/api/profiles/${VERIFY_PROFILE}/chats/search?size=1`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json', referer: `${BASE}/${VERIFY_PROFILE}/chats` },
    body: '{}',
  });
  if (!chats.ok) return { ok: false, why: `chats ${chats.status}` };
  return { ok: true };
}

let best = null;
for (const c of candidates) {
  const cookie = [...c.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const r = await verifyCookie(cookie);
  console.log(`[refresh] 후보 profile="${c.name}" cookies=${c.map.size} → ${r.ok ? '통과' : '탈락(' + r.why + ')'}`);
  if (r.ok) { best = { ...c, cookie }; break; }
}

if (!best) {
  // 통하는 쿠키가 하나도 없으면 보관함을 덮어쓰지 않는다(마지막 정상 쿠키 보존).
  console.error('[refresh] 검증 통과한 프로필 없음 → 배달 생략(기존 쿠키 유지). '
    + 'Chrome 에서 파트너센터 권한 계정으로 business.kakao.com 에 로그인 필요.');
  process.exit(2);
}

const cookieStr = best.cookie;
console.log(`[refresh] 선택 profile="${best.name}" cookies=${best.map.size} length=${cookieStr.length} (검증 통과)`);

const envPath = path.join(process.cwd(), '.env.local');
let env = fs.readFileSync(envPath, 'utf8');
const newVal = cookieStr.replace(/'/g, '');

// Supabase 보관함으로 자동 배달 (GitHub Actions 수집기의 1차 쿠키 출처).
// 변경 여부와 무관하게 매번 갱신해 보관함을 항상 최신으로 유지(만료 자동 예방).
await pushCookieToSupabase(newVal);

// 기존 값과 동일하면 쓰기/재시작 생략 → 주기적 cron 실행이 데몬을 헛되이 끊지 않게 함.
const prev = env.match(/^KAKAO_PARTNER_COOKIE='?([^'\n]*)'?$/m);
if (prev && prev[1] === newVal) {
  console.log('[refresh] 쿠키 변경 없음 → .env.local/데몬 그대로 유지');
  process.exit(0);
}

fs.writeFileSync(envPath + '.bak', env);
const line = "KAKAO_PARTNER_COOKIE='" + newVal + "'";
env = /^KAKAO_PARTNER_COOKIE=.*$/m.test(env)
  ? env.replace(/^KAKAO_PARTNER_COOKIE=.*$/m, line)
  : env + '\n' + line + '\n';
fs.writeFileSync(envPath, env);
console.log('[refresh] .env.local 갱신 (backup: .env.local.bak)');

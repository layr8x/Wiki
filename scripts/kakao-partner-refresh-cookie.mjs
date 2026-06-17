#!/usr/bin/env node
// scripts/kakao-partner-refresh-cookie.mjs
// Chrome 로컬 쿠키 저장소에서 카카오 비즈니스 쿠키를 추출해 .env.local 의
// KAKAO_PARTNER_COOKIE 를 갱신한다. 쿠키 만료(보통 1~4주) 시 실행.
//
// 전제: Chrome 으로 business.kakao.com 에 로그인되어 있어야 함.
// 실행: npm run kakao:refresh-cookie
//   (최초 실행 시 "Chrome Safe Storage" 키체인 접근 허용 팝업 → 항상 허용)
// 갱신 후 데몬 재시작까지 자동 시도.

import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 추출한 쿠키를 Supabase 보관함(kakao_partner_secrets)에 upsert → GitHub Actions 수집기가
// 매 실행 시 최신 쿠키를 읽어감(쿠키 만료 수동 갱신 제거). .env.local 의 service_role 자격증명 사용.
// best-effort: 실패해도 .env.local 갱신/데몬 동작에는 영향 없음.
async function pushCookieToSupabase(envText, cookie) {
  const pick = (k) => {
    const m = envText.match(new RegExp('^' + k + '=(.*)$', 'm'));
    if (!m) return '';
    let v = m[1].trim();
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    return v;
  };
  const url = pick('SUPABASE_URL') || pick('VITE_SUPABASE_URL');
  const key = pick('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    console.log('[refresh] SUPABASE_URL/SERVICE_ROLE_KEY 미설정 → Supabase 배달 생략 (.env.local 만 갱신)');
    return;
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/kakao_partner_secrets`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([{ key: 'kakao_partner_cookie', value: cookie, updated_at: new Date().toISOString() }]),
    });
    if (res.ok) console.log('[refresh] Supabase 보관함에 쿠키 배달 완료 (GitHub 수집기가 픽업)');
    else console.log(`[refresh] Supabase 배달 실패 HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
  } catch (e) {
    console.log('[refresh] Supabase 배달 오류:', e.message);
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

// _kawlt(로그인 토큰) 보유 프로필 중 가장 최근 것 선택
let best = null;
for (const name of fs.readdirSync(CHROME)) {
  const dir = path.join(CHROME, name);
  if (!fs.existsSync(path.join(dir, 'Cookies'))) continue;
  let map;
  try { map = readProfile(dir); } catch { continue; }
  if (map && map.has('_kawlt')) {
    const mtime = fs.statSync(path.join(dir, 'Cookies')).mtimeMs;
    if (!best || mtime > best.mtime) best = { name, map, mtime };
  }
}

if (!best) {
  console.error('[refresh] _kawlt 쿠키를 가진 Chrome 프로필을 못 찾음. Chrome 으로 business.kakao.com 에 로그인했는지 확인.');
  process.exit(1);
}

const cookieStr = [...best.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
console.log(`[refresh] profile="${best.name}" cookies=${best.map.size} length=${cookieStr.length} has_kawlt=${best.map.has('_kawlt')}`);

const envPath = path.join(process.cwd(), '.env.local');
let env = fs.readFileSync(envPath, 'utf8');
const newVal = cookieStr.replace(/'/g, '');

// Supabase 보관함으로 자동 배달 (GitHub Actions 수집기의 1차 쿠키 출처).
// 변경 여부와 무관하게 매번 갱신해 보관함을 항상 최신으로 유지(만료 자동 예방).
await pushCookieToSupabase(env, newVal);

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

// 데몬이 직접 호출한 자가복구/cron 경로에서는 재시작 생략 (자기 자신 kill 방지).
// 실행 중 데몬은 .env.local 을 재읽어 새 쿠키를 픽업한다.
if (process.env.KAKAO_SKIP_DAEMON_RESTART === '1') {
  console.log('[refresh] KAKAO_SKIP_DAEMON_RESTART=1 → 데몬 재시작 생략 (실행 중 데몬이 .env.local 재읽음)');
} else {
  // 데몬 재시작(있으면)
  try {
    const uid = process.getuid();
    execSync(`launchctl kickstart -k gui/${uid}/com.amswiki.kakao-stream`, { stdio: 'ignore' });
    console.log('[refresh] launchd 데몬 재시작 완료 (com.amswiki.kakao-stream)');
  } catch {
    console.log('[refresh] 데몬 미등록/재시작 생략 — 수동 실행 시 npm run kakao:stream:all');
  }
}

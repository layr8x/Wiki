#!/usr/bin/env node
// scripts/jandi-refresh-token.mjs
// 잔디(JANDI) access token 자동 갱신 — 로그인 세션에서 새 토큰을 꺼내
// jandi_secrets.jandi_access_token 에 배달한다. (카카오 "쿠키 배달부"의 잔디판.)
//
// 왜 필요한가: 잔디 access token 은 JWT 이며 수명이 ~12시간으로 짧다(카카오 쿠키 1~4주보다 훨씬
//   짧음). 만료되면 수집기가 401 로 멈춘다. 잔디에는 공개된 refresh 엔드포인트가 없어(HAR 미포함),
//   로그인 세션에서 앱이 발급받아 쓰는 토큰을 그대로 가로채는 방식이 가장 확실하다.
//
// 방식(공통): Playwright 로 잔디 팀 앱을 열고 → 앱이 i1.jandi.com 을 호출할 때 요청 헤더의
//   `authorization: Bearer <JWT>` 를 가로채 → 그 값을 jandi_secrets 에 upsert.
//   (토큰의 저장 위치(localStorage 키 등)에 의존하지 않아 견고.)
//
// 두 가지 로그인 모드:
//  ● 모드 A — 전용 크롬 프로필 재사용 (권장, 자격증명 불필요·SSO/MFA 안 막힘)
//     JANDI_CHROME_USER_DATA_DIR 을 설정하면 그 프로필로 브라우저를 연다. 최초 1회만
//     `JANDI_HEADLESS=false` 로 실행해 사람이 로그인 → 세션이 그 프로필에 저장됨.
//     이후엔 헤드리스로 돌려도 이미 로그인돼 있어 토큰만 가로채 배달한다.
//  ● 모드 B — 이메일/비밀번호 헤드리스 로그인 (폴백)
//     JANDI_EMAIL / JANDI_PASSWORD 로 매번 새로 로그인. ⚠️ 회사 SSO/2단계 인증(MFA)이면 막힐 수 있음.
//
// 실행: npm run jandi:refresh-token
//   공통 필수 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   모드 A env: JANDI_CHROME_USER_DATA_DIR(전용 프로필 경로)
//   모드 B env: JANDI_EMAIL, JANDI_PASSWORD
//   선택 env: JANDI_LOGIN_URL(기본 www.jandi.com/landing/signin),
//             JANDI_TEAM_URL(기본 flytofreedom.jandi.com), JANDI_HEADLESS(기본 true),
//             JANDI_REFRESH_TIMEOUT_MS(기본 60000; 최초 수동 로그인용은 아래 LOGIN_WAIT_MS)
//
// ⚠️ 보안: 자격증명·프로필은 사내 신뢰 PC(맥 스튜디오) .env.local 에만. 절대 커밋 금지.

import { getAdminClient } from './lib/supabase-admin.mjs';

const EMAIL = process.env.JANDI_EMAIL;
const PASSWORD = process.env.JANDI_PASSWORD;
const USER_DATA_DIR = process.env.JANDI_CHROME_USER_DATA_DIR || null; // 설정 시 모드 A
const LOGIN_URL = process.env.JANDI_LOGIN_URL || 'https://www.jandi.com/landing/signin';
const TEAM_URL = process.env.JANDI_TEAM_URL || 'https://flytofreedom.jandi.com/';
const HEADLESS = String(process.env.JANDI_HEADLESS ?? 'true') !== 'false';
const TIMEOUT_MS = Number(process.env.JANDI_REFRESH_TIMEOUT_MS || 60000);
const LOGIN_WAIT_MS = Number(process.env.JANDI_LOGIN_WAIT_MS || 180000); // 최초 수동 로그인 대기(헤드풀)
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

// 가로챈 JWT 를 저장하기 전 "신선한지" 검증한다.
// ⚠️ 배경(2026-07 실측): 전용 크롬 프로필의 로그인 세션이 만료되면, 헤드리스로 앱을 열어도
//   새 토큰을 발급받지 못하고 캐시/서비스워커에 남아있던 "옛 토큰"이 i1 요청에 실려 나간다.
//   그걸 그대로 저장하면 이미 죽은 토큰을 계속 덮어써(겉보기엔 "갱신 완료") 수집이 조용히 멈춘다.
//   그래서 exp 가 미래이고 iat 가 최근인 토큰만 저장하고, 아니면 큰 소리로 실패시킨다.
const FRESH_MIN_REMAIN_MS = Number(process.env.JANDI_MIN_TOKEN_REMAIN_MS || 60 * 60 * 1000); // 최소 잔여 1h
const FRESH_MAX_AGE_MS = Number(process.env.JANDI_MAX_TOKEN_AGE_MS || 6 * 60 * 60 * 1000);   // 발급 후 6h 이내

function decodeJwtPayload(jwt) {
  const part = String(jwt).split('.')[1];
  if (!part) throw new Error('JWT payload 없음(형식 오류)');
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

// 신선하지 않으면 throw. 신선하면 { expMs, iatMs } 반환.
function assertFreshToken(jwt) {
  let claims;
  try { claims = decodeJwtPayload(jwt); } catch (e) { throw new Error('토큰 디코드 실패: ' + e.message); }
  const now = Date.now();
  const expMs = Number(claims.exp) * 1000;
  const iatMs = claims.iat ? Number(claims.iat) * 1000 : null;
  if (!Number.isFinite(expMs)) throw new Error('토큰에 exp 없음');
  const remain = expMs - now;
  if (remain < FRESH_MIN_REMAIN_MS) {
    throw new Error(
      `가로챈 토큰이 이미 만료/임박(잔여 ${Math.round(remain / 60000)}분, 만료 ${new Date(expMs).toISOString()}). ` +
      '전용 크롬 프로필의 로그인 세션이 끊긴 것으로 보입니다. ' +
      '`JANDI_HEADLESS=false npm run jandi:refresh-token` 로 한 번 재로그인하세요. ' +
      '(죽은 토큰을 덮어쓰지 않도록 저장을 중단합니다.)',
    );
  }
  if (iatMs != null && now - iatMs > FRESH_MAX_AGE_MS) {
    throw new Error(
      `가로챈 토큰이 오래됨(발급 ${new Date(iatMs).toISOString()}, ${Math.round((now - iatMs) / 3600000)}h 전). ` +
      '캐시에 남은 옛 토큰일 가능성이 큽니다 — 저장하지 않습니다. 전용 프로필 재로그인이 필요합니다.',
    );
  }
  return { expMs, iatMs };
}

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

function requireEnv() {
  const miss = [];
  if (!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) miss.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) miss.push('SUPABASE_SERVICE_ROLE_KEY');
  // 모드 A(프로필) 가 아니면 이메일/비번 필요.
  if (!USER_DATA_DIR) {
    if (!EMAIL) miss.push('JANDI_EMAIL (또는 JANDI_CHROME_USER_DATA_DIR)');
    if (!PASSWORD) miss.push('JANDI_PASSWORD (또는 JANDI_CHROME_USER_DATA_DIR)');
  }
  if (miss.length) {
    console.error(`[refresh] 필수 env 미설정: ${miss.join(', ')} (node --env-file=.env.local 로 실행)`);
    process.exit(1);
  }
}

// @playwright/test 는 devDependency 로 설치돼 있고 chromium 을 re-export 한다.
async function loadChromium() {
  try {
    const mod = await import('@playwright/test');
    if (mod.chromium) return mod.chromium;
  } catch { /* 아래 폴백 */ }
  const mod = await import('playwright');
  return mod.chromium;
}

// 로그인 폼 채우기(모드 B) — 셀렉터가 바뀔 수 있어 후보를 순서대로 시도(견고성).
async function fillLogin(page) {
  const emailSel = ['input[name="email"]', 'input[type="email"]', 'input[autocomplete="username"]', 'input[placeholder*="이메일"]'];
  const passSel = ['input[name="password"]', 'input[type="password"]', 'input[autocomplete="current-password"]'];
  const submitSel = ['button[type="submit"]', 'button:has-text("로그인")', 'button:has-text("Sign in")', 'input[type="submit"]'];
  const tryFill = async (sels, value) => {
    for (const s of sels) {
      const el = page.locator(s).first();
      if (await el.count().catch(() => 0)) { await el.fill(value, { timeout: 8000 }); return true; }
    }
    return false;
  };
  if (!(await tryFill(emailSel, EMAIL))) throw new Error('이메일 입력란을 못 찾음(로그인 폼 변경 가능성).');
  if (!(await tryFill(passSel, PASSWORD))) throw new Error('비밀번호 입력란을 못 찾음.');
  for (const s of submitSel) {
    const el = page.locator(s).first();
    if (await el.count().catch(() => 0)) { await el.click({ timeout: 8000 }).catch(() => {}); return; }
  }
  await page.keyboard.press('Enter');
}

async function pushToken(accessToken, memberId) {
  const sb = getAdminClient();
  const { error } = await sb.from('jandi_secrets').upsert(
    { key: 'jandi_access_token', value: accessToken, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) throw new Error('jandi_secrets upsert: ' + error.message);
  log('jandi_secrets.jandi_access_token 갱신 완료(수집기가 다음 실행에 픽업).');
  if (memberId) {
    await sb.from('jandi_secrets').upsert(
      { key: 'jandi_member_id', value: memberId, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    ).then(({ error: e }) => e && log('member_id upsert 생략:', e.message));
  }
}

// 페이지의 i1.jandi.com 요청 헤더에서 Bearer 토큰을 "모두" 모은다.
// ⚠️ 첫 요청에서 멈추면 안 된다 — 앱은 로드 직후 캐시/재시도로 옛 토큰을 한 번 흘린 뒤,
//   세션이 살아있으면 곧 새 토큰으로 재요청한다. 그래서 로드 창 동안 나온 토큰을 전부 담아두고
//   나중에 가장 신선한(exp 최대) 것을 고른다. 세션이 죽었으면 옛 토큰만 모여 assertFreshToken 에서 걸린다.
function attachCapture(page, box) {
  const onRequest = (req) => {
    const u = req.url();
    if (!u.includes('i1.jandi.com')) return;
    const h = req.headers();
    const auth = h['authorization'] || h['Authorization'];
    const m = auth && auth.match(/Bearer\s+(eyJ[\w-]+\.[\w-]+\.[\w-]+)/i);
    if (!m) return;
    const token = m[1];
    if (box.seen.has(token)) return;
    box.seen.add(token);
    box.tokens.push({ token, memberId: h['x-member-id'] || h['X-Member-ID'] || null });
  };
  page.on('request', onRequest);
  return () => page.off('request', onRequest);
}

// 모은 토큰 중 exp(만료시각) 가 가장 늦은(=가장 신선한) 것을 고른다. 없으면 null.
function pickFreshest(box) {
  let best = null;
  let bestExp = -Infinity;
  for (const cand of box.tokens) {
    let exp = -Infinity;
    try { exp = Number(decodeJwtPayload(cand.token).exp) * 1000; } catch { /* skip */ }
    if (exp > bestExp) { bestExp = exp; best = cand; }
  }
  return best;
}

async function waitAtLeastOne(box, deadline) {
  while (box.tokens.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 500));
}

// 모드 A: 전용 프로필 재사용(자격증명 없이 이미 로그인된 세션 활용).
async function runPersistent(chromium) {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: HEADLESS, userAgent: UA, locale: 'ko-KR',
  });
  const box = { tokens: [], seen: new Set() };
  const page = context.pages()[0] || await context.newPage();
  const detach = attachCapture(page, box);
  try {
    log(`[모드A] 프로필=${USER_DATA_DIR} 로 팀 앱 이동: ${TEAM_URL}`);
    await page.goto(TEAM_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS }).catch(() => {});
    const deadline = Date.now() + (HEADLESS ? TIMEOUT_MS : LOGIN_WAIT_MS);
    if (!HEADLESS) log(`[모드A] 로그인 창이 뜨면 로그인하세요. 최대 ${Math.round(LOGIN_WAIT_MS / 1000)}초 대기…`);
    await waitAtLeastOne(box, deadline);
    // ★ 살아있는 토큰 강제: 첫 요청이 캐시된 옛 토큰이었을 수 있으므로, 세션이 유효하면
    //   새로고침 때 앱이 만료 토큰을 갱신해 재요청한다 → 더 신선한 토큰을 추가로 확보한다.
    if (box.tokens.length && Date.now() < deadline) {
      log('[모드A] 라이브 토큰 확보를 위해 재적재(reload)…');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS }).catch(() => {});
      await page.waitForTimeout(Math.min(8000, Math.max(0, deadline - Date.now())));
    }
    if (box.tokens.length === 0) {
      throw new Error(
        '토큰 캡처 실패 — 이 프로필에 로그인 세션이 없어 보입니다. ' +
        '`JANDI_HEADLESS=false npm run jandi:refresh-token` 로 한 번 재로그인하세요.',
      );
    }
  } finally {
    detach();
    await context.close().catch(() => {});
  }
  return { picked: pickFreshest(box), count: box.tokens.length };
}

// 모드 B: 이메일/비밀번호 헤드리스 로그인(폴백). 매번 새로 로그인하므로 세션 만료에 강함.
async function runCredentials(chromium) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await context.newPage();
  const box = { tokens: [], seen: new Set() };
  const detach = attachCapture(page, box);
  try {
    log(`[모드B] 로그인 페이지 이동: ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await fillLogin(page);
    await page.waitForTimeout(3000);
    await page.goto(TEAM_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS }).catch(() => {});
    await waitAtLeastOne(box, Date.now() + TIMEOUT_MS);
    if (box.tokens.length === 0) {
      throw new Error('Bearer 토큰 캡처 실패(로그인 실패·SSO/MFA·셀렉터 변경 가능성). ' +
        '전용 프로필 모드(JANDI_CHROME_USER_DATA_DIR) 사용을 권장합니다.');
    }
  } finally {
    detach();
    await browser.close().catch(() => {});
  }
  return { picked: pickFreshest(box), count: box.tokens.length };
}

async function main() {
  requireEnv();
  const chromium = await loadChromium();
  const { picked, count } = USER_DATA_DIR ? await runPersistent(chromium) : await runCredentials(chromium);
  if (!picked) throw new Error('토큰을 하나도 확보하지 못했습니다.');
  // ★ 저장 전 신선도 검증 — 죽은/오래된 토큰이면 여기서 실패시켜 덮어쓰기를 막는다.
  const { expMs, iatMs } = assertFreshToken(picked.token);
  log(`토큰 ${count}개 중 가장 신선한 것 선택(발급 ${iatMs ? new Date(iatMs).toISOString() : '?'}, 만료 ${new Date(expMs).toISOString()}).`);
  await pushToken(picked.token, picked.memberId);
}

main().then(() => process.exit(0)).catch((e) => { console.error('[refresh] 실패:', e.message); process.exit(1); });

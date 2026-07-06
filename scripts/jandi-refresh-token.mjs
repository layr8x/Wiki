#!/usr/bin/env node
// scripts/jandi-refresh-token.mjs
// 잔디(JANDI) access token 자동 갱신 — 헤드리스 로그인으로 새 토큰을 꺼내
// jandi_secrets.jandi_access_token 에 배달한다. (카카오 "쿠키 배달부"의 잔디판.)
//
// 왜 필요한가: 잔디 access token 은 JWT 이며 수명이 ~12시간으로 짧다(카카오 쿠키 1~4주보다 훨씬
//   짧음). 만료되면 수집기가 401 로 멈춘다. 잔디에는 공개된 refresh 엔드포인트가 없어(HAR 미포함),
//   로그인 세션을 다시 열어 발급되는 토큰을 그대로 가로채는 방식이 가장 확실하다.
//
// 방식: Playwright 로 잔디 웹에 로그인 → 앱이 i1.jandi.com 을 호출할 때 요청 헤더의
//   `authorization: Bearer <JWT>` 를 가로채 → 그 값을 jandi_secrets 에 upsert.
//   (토큰의 저장 위치(localStorage 키 등)에 의존하지 않아 견고. 앱은 로그인 직후 반드시
//    i1.jandi.com 을 호출하므로 헤더 캡처가 확실하다.)
//
// 실행: npm run jandi:refresh-token   (node --env-file=.env.local scripts/jandi-refresh-token.mjs)
//   필요 env: JANDI_EMAIL, JANDI_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   선택 env: JANDI_LOGIN_URL(기본 https://www.jandi.com/landing/signin),
//             JANDI_TEAM_URL(기본 https://flytofreedom.jandi.com/),
//             JANDI_HEADLESS(기본 true), JANDI_REFRESH_TIMEOUT_MS(기본 60000)
//
// ⚠️ 보안: JANDI_EMAIL/PASSWORD = 잔디 로그인 자격증명. .env.local(로컬) 또는 CI Secret 에만 두고
//   절대 커밋 금지. 회사 SSO/2단계 인증(MFA)을 쓰면 헤드리스 로그인이 막힐 수 있다(그 경우 이
//   스크립트는 실패로 종료 → docs/JANDI_SETUP.md 2번의 수동 토큰 추출로 갱신). 클라우드 CI 에서
//   회사 계정으로 로그인하면 보안 경고가 뜰 수 있으므로, 사내 신뢰 PC 의 cron 실행을 권장한다.

import { getAdminClient } from './lib/supabase-admin.mjs';

const EMAIL = process.env.JANDI_EMAIL;
const PASSWORD = process.env.JANDI_PASSWORD;
const LOGIN_URL = process.env.JANDI_LOGIN_URL || 'https://www.jandi.com/landing/signin';
const TEAM_URL = process.env.JANDI_TEAM_URL || 'https://flytofreedom.jandi.com/';
const HEADLESS = String(process.env.JANDI_HEADLESS ?? 'true') !== 'false';
const TIMEOUT_MS = Number(process.env.JANDI_REFRESH_TIMEOUT_MS || 60000);
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

function requireEnv() {
  const miss = [];
  if (!EMAIL) miss.push('JANDI_EMAIL');
  if (!PASSWORD) miss.push('JANDI_PASSWORD');
  if (!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) miss.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) miss.push('SUPABASE_SERVICE_ROLE_KEY');
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

// 로그인 폼 채우기 — 셀렉터가 바뀔 수 있어 후보를 순서대로 시도(견고성).
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
  await page.keyboard.press('Enter'); // 버튼 못 찾으면 엔터로 제출
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

async function main() {
  requireEnv();
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await context.newPage();

  // 로그인 후 앱이 호출하는 i1.jandi.com 요청 헤더에서 Bearer 토큰을 가로챈다.
  let captured = null;      // { token, memberId }
  const onRequest = (req) => {
    if (captured) return;
    const u = req.url();
    if (!u.includes('i1.jandi.com')) return;
    const h = req.headers();
    const auth = h['authorization'] || h['Authorization'];
    const m = auth && auth.match(/Bearer\s+(eyJ[\w-]+\.[\w-]+\.[\w-]+)/i);
    if (m) captured = { token: m[1], memberId: h['x-member-id'] || h['X-Member-ID'] || null };
  };
  page.on('request', onRequest);

  try {
    log(`로그인 페이지 이동: ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await fillLogin(page);

    // 로그인 완료 후 팀 앱으로 이동해 API 호출을 유발(토큰 캡처 보장).
    const deadline = Date.now() + TIMEOUT_MS;
    await page.waitForTimeout(3000);
    await page.goto(TEAM_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS }).catch(() => {});
    while (!captured && Date.now() < deadline) {
      await page.waitForTimeout(1000);
    }
    if (!captured) throw new Error('Bearer 토큰 캡처 실패(로그인 실패·SSO/MFA·셀렉터 변경 가능성). 수동 갱신 필요.');

    log(`토큰 캡처 성공(len=${captured.token.length}${captured.memberId ? `, member_id=${captured.memberId}` : ''}).`);
    await pushToken(captured.token, captured.memberId);
  } finally {
    page.off('request', onRequest);
    await browser.close().catch(() => {});
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('[refresh] 실패:', e.message); process.exit(1); });

#!/usr/bin/env node
// scripts/kakao-partner-refresh-cookie.mjs
// Chrome 로컬 쿠키 저장소에서 카카오 비즈니스 쿠키를 추출해 .env.local 의
// KAKAO_PARTNER_COOKIE 를 갱신하고, Supabase 보관함(kakao_partner_secrets)에도 배달한다.
//
// 전제: Chrome 으로 business.kakao.com 에 파트너센터 권한 계정으로 로그인되어 있어야 함.
// 실행: npm run kakao:refresh-cookie
//   (최초 실행 시 "Chrome Safe Storage" 키체인 접근 허용 팝업 → 항상 허용)
//
// 쿠키를 읽어가는 쪽(2026-08 현재): 같은 기기의 com.amswiki.kakao-collect(5분마다).
//   ⚠️ 옛 주석은 "pg_cron 이 부르는 kakao-collect Edge Function 이 읽어간다"고 적혀 있었으나
//   그 크론은 2026-08-12 에 비활성화됐다(수집을 기기로 옮김). 되살릴 때만 다시 유효하다.
//
// 쿠키 추출·검증 로직은 scripts/lib/kakao-chrome-cookie.mjs 공용 모듈에 있다
// (kakao-cloud-ip-test.mjs 와 같은 코드를 써야 진단이 어긋나지 않는다).

import fs from 'node:fs';
import path from 'node:path';
import { listCookieCandidates, pickWorkingCookie } from './lib/kakao-chrome-cookie.mjs';
import { getAdminClient } from './lib/supabase-admin.mjs';

// 추출한 쿠키를 Supabase 보관함(kakao_partner_secrets)에 upsert. 자격증명(SUPABASE_URL/
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
    console.log('[refresh] Supabase 보관함에 쿠키 배달 완료');
  } catch (e) {
    console.log('[refresh] Supabase 배달 생략/실패:', e.message);
  }
}

const candidates = listCookieCandidates();
if (!candidates.length) {
  console.error('[refresh] _kawlt 쿠키를 가진 Chrome 프로필을 못 찾음. Chrome 으로 business.kakao.com 에 로그인했는지 확인.');
  process.exit(1);
}

const best = await pickWorkingCookie(candidates, (c, r) =>
  console.log(`[refresh] 후보 profile="${c.name}" cookies=${c.map.size} → ${r.ok ? '통과' : '탈락(' + r.why + ')'}`));

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

// Supabase 보관함으로 자동 배달 (수집기의 1차 쿠키 출처).
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

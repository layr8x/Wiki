#!/usr/bin/env node
// scripts/kakao-cloud-ip-test.mjs
//
// 질문 하나만 판별한다: **카카오가 막는 게 "클라우드 IP" 인가, 아니면 "묵은 쿠키" 인가?**
//
// 왜 필요한가
//   2026-08-12 에 "맥에서 200 / Supabase 에서 401" 을 관찰하고 '카카오가 클라우드 IP 를
//   차단한다'고 결론냈다. 그런데 두 호출 사이에 4분이 있었고, 카카오는 응답마다 Set-Cookie 로
//   세션 토큰을 굴린다(그래서 브라우저는 로그인이 유지된다). 즉 같은 관찰이
//     (A) 클라우드 IP 차단
//     (B) 맥 Chrome 이 토큰을 굴려서, 보관함에 저장돼 있던 스냅샷이 이미 무효
//   둘 다로 설명된다. (A)면 수집을 클라우드로 옮길 수 없고, (B)면 옮길 수 있다.
//   결론이 정반대로 갈리는데 한 번도 갈라서 재본 적이 없다.
//
// 어떻게 가르나
//   갓 뽑은 쿠키(수 초 이내)를 맥과 클라우드에서 "거의 동시에" 써 본다.
//     · 맥 200 + 클라우드 200 → IP 차단 아님. 원인은 쿠키 신선도 = 클라우드 수집 가능.
//     · 맥 200 + 클라우드 401 → IP 차단 확정. 클라우드 수집 불가.
//     · 맥 401            → 로그인부터 안 된 것. Chrome 로그인 확인 후 다시.
//   마지막에 맥에서 한 번 더 확인해, 클라우드 호출이 토큰을 굴려버린 것은 아닌지도 본다.
//
// 실행 (맥북 에어에서, Chrome 으로 business.kakao.com 로그인된 상태):
//   node --env-file=.env.local scripts/kakao-cloud-ip-test.mjs
//
// 이 스크립트가 보관함(kakao_partner_secrets)의 쿠키를 갱신한다 — 정상 갱신과 같은 동작이라
// 부작용이 없다. 메시지 본문은 주고받지 않는다(상태코드와 건수만).

import { listCookieCandidates, pickWorkingCookie, verifyCookie } from './lib/kakao-chrome-cookie.mjs';
import { getAdminClient } from './lib/supabase-admin.mjs';

const PROBE_PIDS = process.env.KAKAO_TEST_PIDS || '_VGAQn,_rcpPG';
const line = (s = '') => console.log(s);

function need(name) {
  const v = process.env[name] || (name === 'SUPABASE_URL' ? process.env.VITE_SUPABASE_URL : null);
  if (!v) {
    console.error(`[test] ${name} 이 없습니다. node --env-file=.env.local 로 실행하세요.`);
    process.exit(1);
  }
  return v;
}

const SUPABASE_URL = need('SUPABASE_URL');
need('SUPABASE_SERVICE_ROLE_KEY');
const sb = getAdminClient();

// ── 1. Chrome 에서 갓 뽑은 쿠키 확보 ───────────────────────────────────────────
line('[1/5] Chrome 쿠키 추출·검증 중...');
const candidates = listCookieCandidates();
if (!candidates.length) {
  console.error('[test] _kawlt 쿠키를 가진 Chrome 프로필이 없습니다. Chrome 으로 business.kakao.com 에 로그인하세요.');
  process.exit(1);
}
const picked = await pickWorkingCookie(candidates, (c, r) =>
  line(`      후보 profile="${c.name}" → ${r.ok ? '통과' : '탈락(' + r.why + ')'}`));

if (!picked) {
  console.error('\n[판정] 맥에서부터 인증 실패 — 클라우드를 논할 단계가 아닙니다.');
  console.error('       Chrome 에서 파트너센터 권한 계정으로 business.kakao.com 에 로그인한 뒤 다시 실행하세요.');
  process.exit(2);
}
line(`      선택 profile="${picked.name}" (맥에서 me=${picked.verify.meStatus} chats=${picked.verify.chatsStatus})`);

// ── 2. 보관함에 즉시 배달 (클라우드가 읽어갈 쿠키를 지금 것으로) ────────────────
line('[2/5] 보관함(kakao_partner_secrets)에 쿠키 배달 중...');
{
  const { error } = await sb.from('kakao_partner_secrets').upsert(
    { key: 'kakao_partner_cookie', value: picked.cookie, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) { console.error('[test] 배달 실패:', error.message); process.exit(1); }
}

// ── 3. 클라우드(Supabase Edge Function)에서 같은 쿠키로 호출 ───────────────────
line('[3/5] 클라우드(Supabase)에서 같은 쿠키로 호출 중...');
const { data: tokRow } = await sb.from('kakao_partner_secrets')
  .select('value').eq('key', 'kakao_collect_token').maybeSingle();
if (!tokRow?.value) {
  console.error('[test] kakao_collect_token 이 보관함에 없습니다(kakao-probe 인증용).');
  process.exit(1);
}
const probeUrl = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/kakao-probe?pids=${encodeURIComponent(PROBE_PIDS)}`;
let cloud;
try {
  const res = await fetch(probeUrl, { headers: { authorization: `Bearer ${tokRow.value}` } });
  cloud = await res.json();
} catch (e) {
  console.error('[test] 클라우드 호출 실패:', e.message);
  process.exit(1);
}

// ── 4. 맥에서 재확인 (클라우드 호출이 토큰을 굴려버린 건 아닌지) ────────────────
line('[4/5] 맥에서 재확인 중...');
const after = await verifyCookie(picked.cookie);

// ── 5. 판정 ───────────────────────────────────────────────────────────────────
const cloudChannels = cloud?.channels || [];
const cloudOk = cloudChannels.length > 0 && cloudChannels.every((c) => c.accessible);
const cloudStatuses = cloudChannels.map((c) => `${c.pid}=${c.status}`).join(' ');

line('');
line('[5/5] 결과');
line('  ┌──────────────────────┬────────────────────────────────');
line(`  │ 맥 (호출 전)         │ me=${picked.verify.meStatus} chats=${picked.verify.chatsStatus}`);
line(`  │ 클라우드 (Supabase)  │ me=${cloud?.me_status} ${cloudStatuses}`);
line(`  │ 맥 (호출 후)         │ me=${after.meStatus} chats=${after.chatsStatus}`);
line('  └──────────────────────┴────────────────────────────────');
line('');

if (cloudOk) {
  line('판정: 클라우드 IP 차단이 아닙니다. ✅');
  line('  갓 뽑은 쿠키로는 클라우드에서도 통과합니다. 2026-08-12 의 401 은 IP 가 아니라');
  line('  "보관함 쿠키가 이미 낡아 있었던 것"이 원인입니다.');
  line('  → 수집을 클라우드로 되돌릴 수 있습니다. 단, 쿠키를 자주(수 분 단위) 최신으로');
  line('    유지하거나 응답의 Set-Cookie 를 흡수해 되돌려 저장해야 합니다.');
} else if (after.ok) {
  line('판정: 클라우드 IP 차단이 맞습니다. ❌');
  line('  같은 쿠키가 방금 맥에서는 통과했는데 클라우드에서는 거부됐고, 호출 직후 맥에서');
  line('  다시 확인해도 여전히 통과합니다 — 쿠키가 죽은 게 아니라 호출 위치가 문제입니다.');
  line('  → 수집은 기기(맥북 에어)에서 돌려야 합니다.');
} else {
  line('판정: 판별 불가 ⚠️');
  line('  클라우드 호출 뒤 맥에서도 실패했습니다 = 그 사이 토큰이 굴러갔을 수 있습니다.');
  line('  Chrome 에서 파트너센터 탭을 새로고침한 뒤 다시 한 번 실행해 주세요.');
}
line('');
line('원본 응답: ' + JSON.stringify(cloud));

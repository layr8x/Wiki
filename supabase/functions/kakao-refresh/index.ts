// supabase/functions/kakao-refresh/index.ts
// 카카오 파트너센터 로그인 쿠키 서버측 자동 갱신 — 담당자 기기(Chrome) 없이.
//
// 배경
//   수집 자체는 2026-08-13 에 클라우드로 옮겼지만, 쿠키 공급은 여전히 담당자 기기의 Chrome
//   로그인 세션에 의존했다(= 단일 장애점). 기기를 오래 꺼두면 쿠키가 만료돼 수집이 멈춘다.
//   잔디는 이미 같은 문제를 서버측 갱신(jandi-refresh)으로 없앴다 — 그 방식을 카카오에 적용한다.
//
// 왜 가능한가 (2026-08-13 실측)
//   카카오 쿠키는 잔디와 같은 2단 구조다.
//     _kawlt   = 실제 로그인 토큰. 수명 **약 24시간** (_kawltea 에 만료 epoch 가 들어 있음)
//     _karmt   = 자동로그인(remember me) 토큰. 수명 **약 29일** (_karmtea)
//   브라우저는 _kawlt 가 죽으면 _karmt 로 새 _kawlt 를 자동 발급받는다("자동 로그인").
//   이 함수는 그 동작을 그대로 재현한다 — 새 인증수단을 만드는 게 아니라, 이미 우리가 가진
//   자동로그인 토큰으로 브라우저와 똑같이 세션을 잇는 것이다.
//   ※ 어제 26시간 된 쿠키가 401 이었던 것도 이 24시간 수명 때문이었다(IP 차단이 아니었음).
//
// 실행 정책
//   _kawlt 가 REFRESH_BEFORE_MS 이상 남아 있으면 skip. 임계 이하일 때만 갱신한다
//   (불필요한 토큰 회전을 아낀다 — jandi-refresh 와 같은 원칙).
//
// 안전장치
//   · 갱신 결과를 반드시 실호출(me + chats/search)로 **검증한 뒤에만** 보관함에 저장한다.
//     검증 실패 시 기존 쿠키를 그대로 둔다(멀쩡한 세션을 스스로 깎지 않는다).
//   · `?probe=1` 은 저장하지 않고 결과만 보고한다(쿠키 값은 절대 반환하지 않음 — 이름만).
//
// 인증: verify_jwt=false. kakao_partner_secrets.key='kakao_collect_token' 을 ?token= 으로 비교.
//
// ⚠️⚠️ 현재 상태: **미완성 — 크론에 걸지 말 것.** 자동로그인을 실제로 일으키는 호출을 아직 못 찾았다.
//
// 2026-08-13 probe 실측(값은 안 남기고 상태·쿠키이름만 기록):
//   ① https://business.kakao.com/{pid}/chats
//        → 200, Set-Cookie 없음, 리다이렉트 없음.
//          로그인 여부와 무관하게 SPA 껍데기를 돌려준다. 인증은 화면이 뜬 뒤 XHR 에서 일어나므로
//          이 페이지를 긁는 것으로는 자동로그인 흐름이 시작되지 않는다.
//   ② https://accounts.kakao.com/login/?continue=...
//        → 200, Set-Cookie = [_maldive_oauth_webapp_session_key, _kau]. **_kawlt 안 옴.**
//          즉 "로그인 페이지를 그렸을" 뿐이고, 자동로그인이 자동으로 수행되지는 않았다.
//   ③ https://accounts.kakao.com/weblogin/create_session?continue=...
//        → 404. 그런 엔드포인트 없음(추측이었음).
//
// 남은 일: 자동로그인은 로그인 페이지가 뜬 뒤 **JS 가 별도로 호출**하는 것으로 보인다.
//   엔드포인트를 더 찍어보며 찾지 말 것 — 남의 인증 서버를 무작정 두드리는 셈이다.
//   잔디 때와 같은 방법으로 확보한다: 담당자 기기 Chrome DevTools 네트워크 탭에서
//   실제 자동로그인이 일어나는 순간의 요청(URL·메서드·헤더·바디)을 캡처해 그대로 재현한다.
//   (jandi-refresh 도 "웹앱 번들의 AuthApi 를 역참조해 확인"한 것이지 추측이 아니었다.)
//
// 지금도 쓸모: kawlt_left_h / karmt_left_d 를 돌려주므로 **쿠키 잔여 수명 감시**로는 바로 쓸 수 있다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const BIZ = 'https://business.kakao.com';
const VERIFY_PROFILE = Deno.env.get('KAKAO_VERIFY_PROFILE_ID') || '_VGAQn';

// _kawlt 수명이 약 24시간이라, 6시간 남았을 때 갱신하면 하루 3~4회만 돈다.
const REFRESH_BEFORE_MS = 6 * 60 * 60 * 1000;
const MAX_HOPS = 6;

// 자동로그인에 필요한 "지속" 쿠키. 갱신 시도 때는 죽은 _kawlt/_kawltea 를 빼고 이것만 보낸다
// — 브라우저가 만료된 토큰을 버리고 자동로그인으로 넘어가는 상태를 그대로 만든다.
const PERSISTENT = new Set([
  '_karmt', '_karmtea', '_kau', '_kadu', '_kahai', '_karb',
  'webid', 'webid_ts', '_T_ANO', '__T_', '__T_SECURE', 'user_country_code',
]);

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const parseJar = (cookie: string): Map<string, string> => {
  const jar = new Map<string, string>();
  for (const part of cookie.split(';')) {
    const s = part.trim();
    if (!s) continue;
    const i = s.indexOf('=');
    if (i > 0) jar.set(s.slice(0, i), s.slice(i + 1));
  }
  return jar;
};
const toCookie = (jar: Map<string, string>) => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

/** 응답의 Set-Cookie 를 jar 에 흡수. 삭제 지시(빈 값)는 무시한다. 새로 들어온 이름 목록을 돌려준다. */
function absorb(res: Response, jar: Map<string, string>): string[] {
  let list: string[] = [];
  try { list = (res.headers as any).getSetCookie?.() ?? []; } catch { /* 구버전 런타임 */ }
  if (!list.length) { const one = res.headers.get('set-cookie'); if (one) list = [one]; }
  const got: string[] = [];
  for (const sc of list) {
    const first = String(sc).split(';')[0].trim();
    const i = first.indexOf('=');
    if (i <= 0) continue;
    const name = first.slice(0, i);
    const val = first.slice(i + 1);
    if (!val || val === 'deleted') continue;
    if (jar.get(name) !== val) { jar.set(name, val); got.push(name); }
  }
  return got;
}

const headers = (cookie: string, referer?: string) => ({
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
  cookie,
  ...(referer ? { referer } : {}),
});

// 자동로그인이 실제로 일어나는 곳은 파트너센터가 아니라 카카오 계정 서버다.
// ⚠️ 실측(2026-08-13): `business.kakao.com/{pid}/chats` 는 로그인 여부와 무관하게 200 을
//    돌려준다(SPA 껍데기). 인증 검사는 화면이 뜬 뒤 XHR 에서 일어나므로, 그 페이지를 긁어서는
//    자동로그인 흐름이 시작되지 않는다 — Set-Cookie 도 리다이렉트도 없다.
//    그래서 브라우저가 401 을 만났을 때 가는 곳(accounts.kakao.com 로그인 진입 + continue)을
//    직접 두드린다. _karmt 가 살아 있으면 계정 서버가 새 _kawlt 를 붙여 continue 로 되돌려보낸다.
const ENTRY_POINTS = [
  `https://accounts.kakao.com/login/?continue=${encodeURIComponent(`${BIZ}/${VERIFY_PROFILE}/chats`)}`,
  `https://accounts.kakao.com/weblogin/create_session?continue=${encodeURIComponent(BIZ)}`,
];

/**
 * 자동로그인 재현: 만료된 _kawlt 를 뺀 지속 쿠키만 들고 계정 서버에 들어가,
 * 브라우저처럼 리다이렉트를 수동으로 따라가며(redirect: manual) 새 _kawlt 를 받는다.
 */
async function autoLogin(jar: Map<string, string>): Promise<{ hops: any[]; gotKawlt: boolean }> {
  const hops: any[] = [];

  for (const entry of ENTRY_POINTS) {
    let url = entry;
    let referer: string | undefined;
    for (let i = 0; i < MAX_HOPS; i++) {
      let res: Response;
      try {
        res = await fetch(url, { headers: headers(toCookie(jar), referer), redirect: 'manual' });
      } catch (e) {
        hops.push({ host: new URL(url).host, error: String((e as any)?.message || e) });
        break;
      }
      const got = absorb(res, jar);
      const loc = res.headers.get('location');
      // 값은 절대 남기지 않는다 — 어느 호스트에서 어떤 "이름"의 쿠키가 왔는지만 기록.
      hops.push({ host: new URL(url).host, status: res.status, set_cookie_names: got, redirected: Boolean(loc) });
      if (got.includes('_kawlt')) return { hops, gotKawlt: true };
      if (!loc) break;
      referer = url;
      url = new URL(loc, url).toString();
    }
    if (jar.has('_kawlt')) return { hops, gotKawlt: true };
  }
  return { hops, gotKawlt: false };
}

/** 수집기와 동일한 두 호출로 실제 통하는지 확인한다. 통과해야만 저장한다. */
async function verify(cookie: string) {
  const h = { ...headers(cookie), accept: 'application/json, text/plain, */*' };
  const me = await fetch(`${BIZ}/api/users/me`, { headers: h });
  if (!me.ok) return { ok: false, me: me.status, chats: null as number | null };
  const chats = await fetch(`${BIZ}/api/profiles/${VERIFY_PROFILE}/chats/search?size=1`, {
    method: 'POST',
    headers: { ...h, 'content-type': 'application/json', referer: `${BIZ}/${VERIFY_PROFILE}/chats` },
    body: '{}',
  });
  return { ok: chats.ok, me: me.status, chats: chats.status };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: tok } = await supabase.from('kakao_partner_secrets')
    .select('value').eq('key', 'kakao_collect_token').maybeSingle();
  if (!tok?.value || token !== tok.value) return json({ error: 'unauthorized' }, 401);

  const probe = url.searchParams.get('probe') === '1';
  const force = url.searchParams.get('force') === '1';

  const { data: row } = await supabase.from('kakao_partner_secrets')
    .select('value').eq('key', 'kakao_partner_cookie').maybeSingle();
  const cookie = (row as any)?.value as string | undefined;
  if (!cookie) return json({ error: 'no cookie in kakao_partner_secrets' }, 500);

  const jar = parseJar(cookie);
  const kawlteaSec = Number(jar.get('_kawltea') || 0);
  const karmteaSec = Number(jar.get('_karmtea') || 0);
  const now = Date.now();
  const kawltLeftMs = kawlteaSec ? kawlteaSec * 1000 - now : 0;
  const karmtLeftMs = karmteaSec ? karmteaSec * 1000 - now : 0;

  const state = {
    kawlt_left_h: Math.round((kawltLeftMs / 3600000) * 10) / 10,
    karmt_left_d: Math.round((karmtLeftMs / 86400000) * 10) / 10,
    has_karmt: jar.has('_karmt'),
  };

  // 자동로그인 토큰 자체가 없거나 죽었으면 서버가 할 수 있는 일이 없다 — 사람이 로그인해야 한다.
  if (!jar.has('_karmt') || karmtLeftMs <= 0) {
    return json({ status: 'need_human_login', reason: '_karmt 없음 또는 만료', ...state }, 200);
  }

  if (!force && !probe && kawltLeftMs > REFRESH_BEFORE_MS) {
    return json({ status: 'skip', reason: `_kawlt 여유 ${state.kawlt_left_h}h`, ...state });
  }

  // 만료된 로그인 토큰을 버린 상태에서 시작한다(브라우저가 하는 그대로).
  const attempt = new Map(jar);
  attempt.delete('_kawlt');
  attempt.delete('_kawltea');
  for (const k of [...attempt.keys()]) {
    if (!PERSISTENT.has(k) && !k.startsWith('_ga') && !k.startsWith('nkb_') && k !== '_pfdl') attempt.delete(k);
  }

  const { hops, gotKawlt } = await autoLogin(attempt);
  const merged = toCookie(attempt);
  const v = gotKawlt ? await verify(merged) : { ok: false, me: null, chats: null };

  if (probe) {
    return json({ status: 'probe', got_kawlt: gotKawlt, verify: v, hops, ...state });
  }

  if (!gotKawlt || !v.ok) {
    log('자동 갱신 실패 — 기존 쿠키 유지');
    return json({ status: 'failed', reason: gotKawlt ? '검증 실패' : '새 _kawlt 미발급', verify: v, hops, ...state }, 200);
  }

  const { error } = await supabase.from('kakao_partner_secrets').upsert(
    { key: 'kakao_partner_cookie', value: merged, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) return json({ status: 'error', reason: `저장 실패: ${error.message}` }, 500);

  const newLeft = Number(parseJar(merged).get('_kawltea') || 0) * 1000 - Date.now();
  log(`자동 갱신 성공 — _kawlt ${Math.round(newLeft / 3600000)}h 확보`);
  return json({
    status: 'refreshed',
    kawlt_left_h_before: state.kawlt_left_h,
    kawlt_left_h_after: Math.round((newLeft / 3600000) * 10) / 10,
    verify: v,
  });
});

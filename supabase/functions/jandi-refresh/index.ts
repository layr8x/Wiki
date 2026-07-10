// supabase/functions/jandi-refresh/index.ts
// 잔디(JANDI) access token 서버측 무중단 자동 갱신 — Supabase Edge Function (pg_cron 주기 호출).
//
// 배경: 기존 갱신(scripts/jandi-refresh-token.mjs)은 맥 스튜디오의 브라우저 로그인 세션에 의존해,
//   그 세션이 풀리면(=단일 장애점) 수집이 통째로 멈췄다(2026-07-09 실측 장애).
//   이 함수는 브라우저·맥 스튜디오 없이, 잔디 웹앱의 실제 갱신 호출을 서버에서 그대로 재현한다.
//
// 확보 경위: jandi-refresh-token.mjs(브라우저) 실행 시 로그인 세션의 지속 쿠키를 캡처해
//   jandi_secrets.jandi_session_cookie 에 저장했고, 그중 `_jd_.refresh_token` 값을 꺼내
//   jandi_secrets.jandi_refresh_token 으로 별도 보관한다(이 함수가 읽는 값).
//   갱신 호출 자체는 잔디 공식 웹앱 번들(cdn.jandi.com/app/app/*.app.js)의 AuthApi 서비스
//   (`requestAccessTokenWithRefreshToken`)를 역참조해 확인함:
//     POST https://i1.jandi.com/inner-api/token
//     Accept: application/vnd.tosslab.jandi-v4+json
//     Body: {"grant_type":"refresh_token","refresh_token":"<refresh_token>","platform":"web"}
//   응답에 새 access_token 과 "회전된"(rotated) 새 refresh_token 이 함께 온다(1회용 가능성) →
//   반드시 둘 다 저장해야 다음 갱신이 이어진다(새 refresh_token 을 저장 안 하면 체인이 끊김).
//
// 실행 정책: access token 이 아직 넉넉히 남아 있으면(REFRESH_BEFORE_MS 이상) 그냥 skip 해
//   불필요한 refresh_token 소모(회전)를 피한다. 임계 이하일 때만 실제 갱신을 수행한다.
//
// 인증(함수 호출): verify_jwt=false. jandi_secrets.key='jandi_refresh_dispatch_token' 을 ?token= 으로 비교.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const TOKEN_ENDPOINT = 'https://i1.jandi.com/inner-api/token';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
// access token 이 이 시간 이상 남아 있으면 회전(rotation)을 아껴 갱신을 건너뛴다.
const REFRESH_BEFORE_MS = 4 * 60 * 60 * 1000; // 4시간

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

function jwtExpMs(token: string | null): number | null {
  try {
    const p = String(token).split('.')[1];
    if (!p) return null;
    const b64 = p.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(p.length / 4) * 4, '=');
    return typeof JSON.parse(atob(b64)).exp === 'number' ? JSON.parse(atob(b64)).exp * 1000 : null;
  } catch { return null; }
}

async function getSecret(key: string): Promise<string | null> {
  const { data } = await supabase.from('jandi_secrets').select('value').eq('key', key).maybeSingle();
  return (data as any)?.value ?? null;
}
async function setSecret(key: string, value: string) {
  const { error } = await supabase.from('jandi_secrets').upsert(
    { key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' },
  );
  if (error) throw new Error(`secrets upsert(${key}): ${error.message}`);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const expected = await getSecret('jandi_refresh_dispatch_token');
  if (!expected || token !== expected) return json({ error: 'unauthorized' }, 401);

  const currentAccessToken = await getSecret('jandi_access_token');
  const expMs = jwtExpMs(currentAccessToken);
  if (expMs != null) {
    const remainMs = expMs - Date.now();
    if (remainMs > REFRESH_BEFORE_MS) {
      return json({ status: 'skip', reason: 'token still fresh', remain_min: Math.round(remainMs / 60000) });
    }
  }

  const refreshToken = await getSecret('jandi_refresh_token');
  if (!refreshToken) {
    return json({ status: 'error', reason: 'jandi_refresh_token 없음 — 최초 1회 브라우저 로그인(jandi:refresh-token) 필요' }, 200);
  }

  let res: Response;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/vnd.tosslab.jandi-v4+json',
        'user-agent': UA,
      },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken, platform: 'web' }),
    });
  } catch (e: any) {
    log('token endpoint fetch 실패:', e.message);
    return json({ status: 'error', reason: 'fetch: ' + e.message }, 200);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log(`token 갱신 실패 status=${res.status} body=${body.slice(0, 300)}`);
    // refresh_token 자체가 무효(invalid_grant 등)면 재로그인 전까지 반복 실패한다 —
    // jandi_access_token 은 그대로 두어 exp 가 지나면 기존 'token' 워치독(jandi-alert)이 잡는다.
    return json({ status: 'error', reason: `token endpoint ${res.status}`, body: body.slice(0, 300) }, 200);
  }

  const data = await res.json().catch(() => null) as any;
  if (!data?.access_token) {
    return json({ status: 'error', reason: 'access_token 없는 응답' }, 200);
  }

  await setSecret('jandi_access_token', data.access_token);
  // ⚠️ refresh_token 이 회전(rotate)되므로, 새 값이 오면 반드시 갱신해야 다음 회차가 이어진다.
  if (data.refresh_token) await setSecret('jandi_refresh_token', data.refresh_token);

  const newExpMs = jwtExpMs(data.access_token);
  log(`jandi_access_token 서버측 자동 갱신 완료(만료 ${newExpMs ? new Date(newExpMs).toISOString() : '?'}).`);
  return json({ status: 'ok', at: new Date().toISOString(), new_exp: newExpMs ? new Date(newExpMs).toISOString() : null });
});

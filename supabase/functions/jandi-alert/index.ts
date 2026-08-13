// supabase/functions/jandi-alert/index.ts
// 잔디(JANDI) 수집 워치독 — 토큰 만료 임박 + 채널별 수집 헬스 감시, Slack 알림.
// Supabase Edge Function (pg_cron 10분). 카카오 kakao-alert 의 잔디판(같은 Slack 웹훅 재사용).
//
// 왜 필요한가: 잔디 access token(수명 ~12h)이 만료되고 담당자 기기 갱신이 실패하면 5개 방
//   수집이 한꺼번에 조용히 멈춘다(2026-07 실측 18시간 방치). 이 워치독이 (1)토큰 만료 임박,
//   (2)채널 heartbeat 정체, (3)채널 last_error 를 감시해 죽기 "전에" Slack 으로 알린다.
//
// 인증: jandi_secrets.key='jandi_alert_token'. 배포: --no-verify-jwt. 트리거: pg_cron 10분.
// Slack: SLACK_WEBHOOK_URL(카카오와 동일 환경변수) 미설정 시 로그만. 중복억제: 쿨다운 1시간.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL') ?? '';
const COOLDOWN_MS = 60 * 60 * 1000;

// 토큰 만료 임박 임계(기본 2시간). 6h마다 갱신이라 2h 전 경보면 최소 2번 갱신 기회가 남는다.
const TOKEN_WARN_MS = Number(Deno.env.get('JANDI_TOKEN_WARN_MS') || 2 * 60 * 60 * 1000);
// heartbeat 정체 임계(기본 25분). 수집 cron 이 5분 주기라 25분이면 5회 연속 실패.
const HEARTBEAT_STALE_MS = Number(Deno.env.get('JANDI_HEARTBEAT_STALE_MS') || 25 * 60 * 1000);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function sendSlack(text: string) {
  if (!SLACK_WEBHOOK_URL) {
    log('[jandi-alert] SLACK_WEBHOOK_URL 미설정, 로그만:\n' + text);
    return;
  }
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) log('[jandi-alert] slack post fail:', res.status, await res.text().catch(() => ''));
  } catch (e) {
    log('[jandi-alert] slack post error:', (e as Error).message);
  }
}

type AlertState = { alert_key: string; status: string; first_alert_at: string | null; last_notified_at: string | null };

async function getSecret(key: string): Promise<string | null> {
  const { data } = await supabase.from('jandi_secrets').select('value').eq('key', key).maybeSingle();
  return (data as { value?: string } | null)?.value ?? null;
}

async function getState(key: string): Promise<AlertState | null> {
  const { data } = await supabase.from('jandi_alert_state').select('*').eq('alert_key', key).maybeSingle();
  return data as AlertState | null;
}

async function upsertState(key: string, status: string, payload: unknown, firstAlertAt: string | null) {
  await supabase.from('jandi_alert_state').upsert(
    {
      alert_key: key,
      status,
      last_payload: payload,
      first_alert_at: firstAlertAt,
      last_notified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'alert_key' },
  );
}

function shouldNotify(prev: AlertState | null, nowBad: boolean): boolean {
  if (nowBad) {
    if (!prev || prev.status !== 'alerting') return true;
    const last = prev.last_notified_at ? new Date(prev.last_notified_at).getTime() : 0;
    return Date.now() - last > COOLDOWN_MS;
  }
  return !!prev && prev.status === 'alerting';
}

// JWT payload 디코드(exp/iat 추출). 서명 검증은 하지 않음(만료 판정만 목적).
function jwtExpMs(jwt: string): number | null {
  try {
    const part = jwt.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const claims = JSON.parse(atob(b64));
    return Number(claims.exp) * 1000;
  } catch {
    return null;
  }
}

// (1) 토큰 만료 임박/만료 감시 — 5개 방 공통 단일 실패점이라 가장 중요.
async function checkToken(): Promise<string | null> {
  const key = 'token';
  const token = await getSecret('jandi_access_token');
  const expMs = token ? jwtExpMs(token) : null;
  const now = Date.now();
  const remain = expMs != null ? expMs - now : -1;
  const bad = expMs == null || remain < TOKEN_WARN_MS;
  const prev = await getState(key);
  if (!shouldNotify(prev, bad)) return null;

  if (bad) {
    const firstAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
    const payload = { exp: expMs ? new Date(expMs).toISOString() : null, remain_min: Math.round(remain / 60000) };
    const msg =
      remain <= 0
        ? '🔴 *잔디 수집 토큰이 만료됐어요*\n' +
          '잔디 로그인 토큰이 만료돼 5개 방 대화를 못 가져오고 있어요.\n' +
          '👉 잔디 토큰을 다시 발급해 주세요(담당자 기기의 잔디 전용 크롬 프로필 재로그인). 넣으면 자동으로 다시 수집돼요.'
        : '🟠 *잔디 수집 토큰이 곧 만료돼요*\n' +
          '조금 뒤 만료되는데 아직 새 토큰이 안 들어왔어요. 지금 자동 갱신이 안 되고 있을 수 있어요.\n' +
          '👉 담당자 기기의 잔디 토큰 자동 갱신이 도는지 확인해 주세요. 안 되면 전용 크롬 프로필을 한 번 재로그인해 주세요.';
    await sendSlack(msg);
    await upsertState(key, 'alerting', payload, firstAt);
  } else {
    await sendSlack('🟢 *잔디 수집 토큰이 정상으로 돌아왔어요*');
    await upsertState(key, 'ok', { exp: expMs ? new Date(expMs).toISOString() : null }, null);
  }
  return key;
}

// (2)(3) 채널별 수집 헬스 — heartbeat 정체 / last_error.
async function checkChannels(): Promise<string[]> {
  const { data: chans } = await supabase
    .from('jandi_channels')
    .select('room_id, label')
    .eq('is_active', true);
  const { data: states } = await supabase
    .from('jandi_stream_state')
    .select('room_id, last_heartbeat_at, last_error');
  const stateByRoom = new Map((states as any[] || []).map((s) => [s.room_id, s]));
  const now = Date.now();
  const notified: string[] = [];

  for (const ch of (chans as any[]) || []) {
    const key = `health:${ch.room_id}`;
    const st = stateByRoom.get(ch.room_id);
    const hbAge = st?.last_heartbeat_at ? now - new Date(st.last_heartbeat_at).getTime() : Infinity;
    const hasError = !!st?.last_error;
    const stale = hbAge > HEARTBEAT_STALE_MS;
    const bad = hasError || stale;
    const prev = await getState(key);
    if (!shouldNotify(prev, bad)) continue;

    if (bad) {
      const firstAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
      const payload = { hb_age_min: Number.isFinite(hbAge) ? Math.round(hbAge / 60000) : null, last_error: st?.last_error ?? null };
      const msg = hasError
        ? `🟠 *${ch.label}* 잔디 수집에 오류가 있어요\n수집 프로그램이 이 방에서 오류를 만났어요.\n👉 잔디 토큰이 유효한지 확인해 주세요. 계속되면 알려 주세요.`
        : `🟠 *${ch.label}* 잔디 수집이 잠깐 멈춘 것 같아요\n한동안 수집 프로그램 응답이 없어요. 대개 저절로 회복돼요.\n👉 오래 이어지면 잔디 토큰/수집 상태를 확인해 주세요.`;
      await sendSlack(msg);
      await upsertState(key, 'alerting', payload, firstAt);
    } else {
      await sendSlack(`🟢 *${ch.label}* 잔디 수집이 정상으로 돌아왔어요`);
      await upsertState(key, 'ok', null, null);
    }
    notified.push(key);
  }
  return notified;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const expected = await getSecret('jandi_alert_token');
  if (!expected || token !== expected) return json({ error: 'unauthorized' }, 401);

  const tokenKey = await checkToken();
  const channels = await checkChannels();
  const result = {
    at: new Date().toISOString(),
    slack_configured: !!SLACK_WEBHOOK_URL,
    notified: [tokenKey, ...channels].filter(Boolean),
  };
  log('done', JSON.stringify(result));
  return json(result);
});

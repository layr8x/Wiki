// supabase/functions/kakao-alert/index.ts
// 상담 데이터 이상탐지 알림 — Supabase Edge Function (pg_cron 이 주기 호출).
//
// 왜: analysis/outputs/08_이상탐지_알림.md 가 수집중단·카테고리급증 탐지 SQL 을 만들어
//   실행까지 검증했으나("실행 확인 완료"), 실제 발송은 "예정"으로 남아 있었다. 이 함수가 그
//   SQL 을 RPC 로 옮겨 주기 실행하고, 문제 발견 시 Slack 으로 보낸다. SLACK_WEBHOOK_URL 이
//   설정 안 돼 있으면 로그만 남기고 스킵한다(kakao-collect 의 "시크릿 없으면 skip" 관례와 동일 —
//   당장 알림 채널이 없어도 함수 배포·상태 축적은 그대로 시작된다).
//
// 감지 2종(RPC: supabase/migrations/20260702_kakao_alert_pipeline.sql 에서 정의):
//   (A) 수집 중단 — heartbeat/최근 에러/메시지 공백을 함께 봐야 "심장은 뛰는데 데이터 0"
//       같은 함정을 잡는다(kakao_collection_health).
//   (B) 카테고리 급증 — 오늘자 카테고리별 건수가 직전 7일 평균의 N배 초과(kakao_category_spike).
//       결제·계정 문의 급증 = 시스템 장애 조기 신호.
//
// 중복 억제: kakao_partner_alert_state 에 alert_key 별 상태를 저장해 "같은 사고는 쿨다운(1시간)
//   내 1회만" 알리고, 정상으로 돌아오면 "복구" 알림을 1회 보낸다.
//
// 인증: kakao-collect 와 동일 패턴 — kakao_partner_secrets.key='kakao_alert_token' 비교.
// 배포: supabase functions deploy kakao-alert --no-verify-jwt (또는 MCP deploy_edge_function)
// 트리거: supabase/migrations/20260702_kakao_alert_pipeline.sql 의 pg_cron(10분).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL') ?? '';
const COOLDOWN_MS = 60 * 60 * 1000; // 같은 사고 반복 알림 쿨다운(1시간) — 08번 문서 §5 권장

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function sendSlack(text: string) {
  if (!SLACK_WEBHOOK_URL) {
    log('[alert] SLACK_WEBHOOK_URL 미설정 — 로그만 남김:\n' + text);
    return;
  }
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) log('[alert] slack post fail:', res.status, await res.text().catch(() => ''));
  } catch (e) {
    log('[alert] slack post error:', (e as Error).message);
  }
}

type AlertState = {
  alert_key: string;
  status: string;
  first_alert_at: string | null;
  last_notified_at: string | null;
};

async function getState(key: string): Promise<AlertState | null> {
  const { data } = await supabase.from('kakao_partner_alert_state').select('*').eq('alert_key', key).maybeSingle();
  return data as AlertState | null;
}

async function upsertState(key: string, status: string, payload: unknown, firstAlertAt: string | null) {
  await supabase.from('kakao_partner_alert_state').upsert(
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

// 상태 전이(정상↔비정상) 시 항상 알리고, 계속 비정상이면 쿨다운 경과 시에만 재알림.
function shouldNotify(prev: AlertState | null, nowBad: boolean): boolean {
  if (nowBad) {
    if (!prev || prev.status !== 'alerting') return true; // 새로 발생(또는 복구 후 재발생)
    const last = prev.last_notified_at ? new Date(prev.last_notified_at).getTime() : 0;
    return Date.now() - last > COOLDOWN_MS; // 지속 중 — 쿨다운 경과 시 재알림
  }
  return !!prev && prev.status === 'alerting'; // 막 복구됨
}

const HEALTH_LABEL: Record<string, string> = {
  critical: '🔴 수집중단(인증오류)',
  warning: '🟠 신규메시지/heartbeat 끊김',
};

async function checkCollectionHealth(): Promise<string[]> {
  const { data, error } = await supabase.rpc('kakao_collection_health');
  if (error) {
    log('[alert] health rpc fail:', error.message);
    return [];
  }
  const notified: string[] = [];
  for (const row of (data as any[]) || []) {
    const key = `health:${row.profile_id}`;
    const bad = row.health !== 'ok';
    const prev = await getState(key);
    if (!shouldNotify(prev, bad)) continue;

    if (bad) {
      const firstAlertAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
      await sendSlack(
        `${HEALTH_LABEL[row.health] ?? row.health} — ${row.channel_label}\n` +
          (row.last_error ? `• 원인: ${row.last_error}\n` : '') +
          `• 마지막 메시지: ${row.hrs_since_msg ?? '?'}시간 전 · heartbeat: ${row.hb_age_min}분 전\n` +
          `• 조치: 카카오 비즈채팅 쿠키 재발급이 필요할 수 있습니다(운영팀 확인).`,
      );
      await upsertState(key, 'alerting', row, firstAlertAt);
    } else {
      await sendSlack(`🟢 복구됨 — 카카오 상담 수집 정상화 (${row.channel_label})`);
      await upsertState(key, 'ok', row, null);
    }
    notified.push(key);
  }
  return notified;
}

async function checkCategorySpike(): Promise<string[]> {
  const { data, error } = await supabase.rpc('kakao_category_spike', { min_ratio: 2.0, min_count: 5 });
  if (error) {
    log('[alert] spike rpc fail:', error.message);
    return [];
  }
  const spikingToday = new Set(((data as any[]) || []).map((r) => r.category as string));
  const notified: string[] = [];

  for (const row of (data as any[]) || []) {
    const key = `spike:${row.category}`;
    const prev = await getState(key);
    if (!shouldNotify(prev, true)) continue;
    const firstAlertAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
    await sendSlack(
      `🟠 카카오 상담 문의 급증 감지 — ${row.category}\n` +
        `• 오늘 ${row.cnt}건 (직전 7일 평균 ${row.baseline_7d}건, ×${row.ratio})\n` +
        `• 확인 권장: 관련 시스템(앱/결제 등) 장애 여부 점검`,
    );
    await upsertState(key, 'alerting', row, firstAlertAt);
    notified.push(key);
  }

  // 어제까지 alerting 이었는데 오늘 급증 목록에서 빠졌으면 → 복구
  const { data: alertingRows } = await supabase
    .from('kakao_partner_alert_state')
    .select('alert_key')
    .eq('status', 'alerting')
    .like('alert_key', 'spike:%');
  for (const r of (alertingRows as any[]) || []) {
    const category = String(r.alert_key).slice('spike:'.length);
    if (spikingToday.has(category)) continue;
    await sendSlack(`🟢 복구됨 — "${category}" 문의량 정상화`);
    await upsertState(r.alert_key, 'ok', null, null);
    notified.push(r.alert_key);
  }
  return notified;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: secret } = await supabase
    .from('kakao_partner_secrets')
    .select('value')
    .eq('key', 'kakao_alert_token')
    .maybeSingle();
  if (!secret?.value || token !== secret.value) return json({ error: 'unauthorized' }, 401);

  const health = await checkCollectionHealth();
  const spike = await checkCategorySpike();
  const result = {
    at: new Date().toISOString(),
    slack_configured: !!SLACK_WEBHOOK_URL,
    notified: [...health, ...spike],
  };
  log('done', JSON.stringify(result));
  return json(result);
});

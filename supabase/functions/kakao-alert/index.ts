// supabase/functions/kakao-alert/index.ts
// 상담 데이터 이상탐지 알림 (채널별·원인별·진단형). Supabase Edge Function (pg_cron 10분).
//
// 왜(고도화 배경): 초기 버전은 (1) 라이브처럼 하루 1건 미만인 저트래픽 채널의 정상 공백을
//   "수집 중단"으로 오판하고 잘못된 "쿠키 재발급"을 권고했고, (2) 카테고리 급증이 어느 채널에
//   몰렸는지 못 짚었고, (3) 원인·조치를 유추할 맥락이 없었다. 이 버전은 kakao_collection_health
//   (채널별 상대 임계 + health_reason)와 kakao_category_spike(채널 분해)를 써서, 원인을 정확히
//   갈라 조치를 안내하고(인증만료/수집기지연/유입없음), 급증은 몰린 채널과 점검 대상을 짚는다.
//
// 인증: kakao_partner_secrets.key='kakao_alert_token'. 배포: --no-verify-jwt. 트리거: pg_cron 10분.
// Slack: SLACK_WEBHOOK_URL 미설정 시 로그+상태기록만(그레이스풀 스킵). 중복억제: 쿨다운 1시간.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL') ?? '';
const COOLDOWN_MS = 60 * 60 * 1000; // 같은 사고 반복 알림 쿨다운(1시간)

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const kstTime = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });

async function sendSlack(text: string) {
  if (!SLACK_WEBHOOK_URL) {
    log('[alert] SLACK_WEBHOOK_URL 미설정, 로그만:\n' + text);
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

type AlertState = { alert_key: string; status: string; first_alert_at: string | null; last_notified_at: string | null };

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

// 상태 전이 시 항상 알리고, 지속 중이면 쿨다운 경과 시에만 재알림. 정상화되면 1회 복구 알림.
function shouldNotify(prev: AlertState | null, nowBad: boolean): boolean {
  if (nowBad) {
    if (!prev || prev.status !== 'alerting') return true;
    const last = prev.last_notified_at ? new Date(prev.last_notified_at).getTime() : 0;
    return Date.now() - last > COOLDOWN_MS;
  }
  return !!prev && prev.status === 'alerting';
}

// ───────────────────── 수집 헬스 알림 (원인별 정확한 조치) ─────────────────────
function healthMessage(row: any, persistedH: string | null, firstAt: string): string {
  const ch = row.channel_label;
  const hb = row.hb_age_min;
  const hrs = row.hrs_since_msg ?? '?';
  const avg = Number(row.avg_per_day);
  const persist = persistedH ? `\n• ${persistedH}시간째 지속 (첫 감지 ${kstTime(firstAt)} KST)` : '';

  if (row.health_reason === 'auth') {
    return (
      `🔴 카카오 수집 중단 · ${ch}\n` +
      `• 원인: 인증 쿠키 만료로 수집기가 카카오 로그인에 실패했습니다.\n` +
      `• 상태: 마지막 메시지 ${hrs}시간 전 · heartbeat ${hb}분 전\n` +
      `• 조치: 카카오 비즈채팅 쿠키 재발급이 필요합니다(재발급하면 수집기가 자동 픽업). 운영팀 확인.${persist}`
    );
  }
  if (row.health_reason === 'heartbeat') {
    return (
      `🟠 수집기 응답 지연 · ${ch}\n` +
      `• 원인: 수집기 생존신호(heartbeat)가 ${hb}분째 갱신되지 않았습니다(스케줄러/함수 지연 의심).\n` +
      `• 상태: 마지막 메시지 ${hrs}시간 전\n` +
      `• 조치: Supabase Edge Function(kakao-collect)·pg_cron 동작을 확인하세요.${persist}`
    );
  }
  // gap: 유입 없음. 수집기는 정상이므로 쿠키 문제로 오인하지 않도록 명확히 구분.
  return (
    `🟠 유입 뜸함 · ${ch}\n` +
    `• 상태: ${hrs}시간째 신규 상담 없음 (이 채널 평소 하루 ${avg}건, 경보 임계 ${row.gap_threshold_h}h).\n` +
    `• 판단: 수집기는 정상입니다(heartbeat ${hb}분 전). 쿠키 문제가 아니라 실제 상담이 없을 가능성이 큽니다.\n` +
    `• 조치: 임계(${row.gap_threshold_h}h)를 크게 넘겨 지속되면 해당 상담 채널 상태만 가볍게 확인하세요.${persist}`
  );
}

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
      const firstAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
      const persistedH =
        prev?.status === 'alerting' && prev.first_alert_at
          ? ((Date.now() - new Date(prev.first_alert_at).getTime()) / 3600000).toFixed(1)
          : null;
      await sendSlack(healthMessage(row, persistedH, firstAt));
      await upsertState(key, 'alerting', row, firstAt);
    } else {
      await sendSlack(`🟢 복구 · ${row.channel_label} 수집 정상 (마지막 메시지 ${row.hrs_since_msg ?? '?'}시간 전)`);
      await upsertState(key, 'ok', row, null);
    }
    notified.push(key);
  }
  return notified;
}

// ───────────────────── 카테고리 급증 알림 (채널 분해 + 진단) ─────────────────────
const CATEGORY_SYSTEM_HINT: Record<string, string> = {
  '환불': '결제·환불 처리/정책',
  '미납·결제': '결제·수납 시스템',
  '계정·로그인·앱': '앱 로그인/인증 서버',
  '교재·배송': '교재 배송/재고',
  '라이브': '라이브 방송 송출',
  '입반·등록': '수강신청/반배정',
  '대기': '대기(웨이팅) 처리',
  '출결·보강': '출결/보강 처리',
};

function spikeMessage(row: any): string {
  const breakdown = (row.channel_breakdown as any[]) || [];
  const total = breakdown.reduce((s, b) => s + Number(b.cnt || 0), 0);
  const dist = breakdown.map((b) => `${b.channel} ${b.cnt}건`).join(' · ') || '(채널 정보 없음)';
  const top = breakdown[0];
  const topShare = top && total > 0 ? Math.round((100 * Number(top.cnt)) / total) : 0;
  const hint = CATEGORY_SYSTEM_HINT[row.category] || '관련 업무 플로우';

  let diagnosis: string;
  if (top && topShare >= 50) {
    diagnosis = `• 진단: 「${top.channel}」에 집중(${topShare}%). 이 채널의 ${hint} 쪽을 우선 점검하세요.`;
  } else {
    diagnosis = `• 진단: 특정 채널 집중이 아닙니다(고르게 분산). 전사 정책·이벤트·공지 영향 가능성을 확인하세요.`;
  }

  return (
    `🟠 문의 급증 · ${row.category}\n` +
    `• 오늘 ${row.cnt}건 (직전 7일 평균 ${row.baseline_7d}건, ×${row.ratio})\n` +
    `• 채널 분포: ${dist}\n` +
    diagnosis
  );
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
    const firstAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
    await sendSlack(spikeMessage(row));
    await upsertState(key, 'alerting', row, firstAt);
    notified.push(key);
  }

  // 어제까지 alerting 이었는데 오늘 급증 목록에서 빠졌으면 복구.
  const { data: alertingRows } = await supabase
    .from('kakao_partner_alert_state')
    .select('alert_key')
    .eq('status', 'alerting')
    .like('alert_key', 'spike:%');
  for (const r of (alertingRows as any[]) || []) {
    const category = String(r.alert_key).slice('spike:'.length);
    if (spikingToday.has(category)) continue;
    await sendSlack(`🟢 복구 · "${category}" 문의량 정상화`);
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
  const result = { at: new Date().toISOString(), slack_configured: !!SLACK_WEBHOOK_URL, notified: [...health, ...spike] };
  log('done', JSON.stringify(result));
  return json(result);
});

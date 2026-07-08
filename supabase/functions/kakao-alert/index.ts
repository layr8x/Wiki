// supabase/functions/kakao-alert/index.ts
// 상담 데이터 이상탐지 알림 (채널별·원인별·진단형). Supabase Edge Function (pg_cron 10분).
//
// 인증: kakao_partner_secrets.key='kakao_alert_token'. 배포: --no-verify-jwt. 트리거: pg_cron 10분.
// Slack: SLACK_WEBHOOK_URL 미설정 시 로그+상태기록만. 중복억제: 쿨다운 1시간.
// 메시지 원칙: 결론 먼저·평문·행동 한 줄. 비율/평균/임계 같은 계산·해석이 필요한 수치는 노출하지 않는다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL') ?? '';
const COOLDOWN_MS = 60 * 60 * 1000;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

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

function shouldNotify(prev: AlertState | null, nowBad: boolean): boolean {
  if (nowBad) {
    if (!prev || prev.status !== 'alerting') return true;
    const last = prev.last_notified_at ? new Date(prev.last_notified_at).getTime() : 0;
    return Date.now() - last > COOLDOWN_MS;
  }
  return !!prev && prev.status === 'alerting';
}

// 수집 헬스: 원인별 평문 조치. heartbeat/임계/시간수치는 감춘다.
function healthMessage(row: any, persistedH: string | null): string {
  const ch = row.channel_label;
  const persist = persistedH ? `\n(${persistedH}시간째 계속되고 있어요)` : '';
  if (row.health_reason === 'auth') {
    return (
      `🔴 *${ch}* 상담 수집이 멈췄어요\n` +
      `카카오 로그인이 풀려서 새 상담을 못 가져오고 있어요.\n` +
      `👉 카카오 비즈니스 채팅 쿠키를 다시 발급해 주세요. 발급하면 자동으로 다시 수집돼요.${persist}`
    );
  }
  if (row.health_reason === 'heartbeat') {
    return (
      `🟠 *${ch}* 수집이 잠깐 느려요\n` +
      `수집 프로그램 응답이 잠시 없어요. 대개 저절로 회복돼요.\n` +
      `👉 조금 뒤에도 계속되면 알려 주세요.${persist}`
    );
  }
  return (
    `🟠 *${ch}* 새 상담이 뜸해요\n` +
    `한동안 새 문의가 없어요. 프로그램은 정상이라, 그냥 문의가 없는 것일 수 있어요.\n` +
    `👉 지금은 따로 안 하셔도 돼요. 오래 이어지면 채널만 한번 살펴봐 주세요.${persist}`
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
    // ⚠️ 실제 수집 "중단"만 알린다: auth(쿠키 만료)·heartbeat(수집 정체).
    //   'gap'(문의 뜸함)은 저트래픽 채널의 정상 상태라 알리지 않는다 — 밤새 1시간마다
    //   반복 발송돼 순수 스팸이 됐다(2026-07-08 사용자 지적). 수집 헬스는 auth/heartbeat 로
    //   충분히 커버되고, gap 은 대시보드용 정보로만 남긴다.
    const bad = row.health_reason === 'auth' || row.health_reason === 'heartbeat';
    const prev = await getState(key);
    if (!shouldNotify(prev, bad)) continue;

    if (bad) {
      const firstAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
      const persistedH =
        prev?.status === 'alerting' && prev.first_alert_at
          ? ((Date.now() - new Date(prev.first_alert_at).getTime()) / 3600000).toFixed(1)
          : null;
      await sendSlack(healthMessage(row, persistedH));
      await upsertState(key, 'alerting', row, firstAt);
    } else {
      await sendSlack(`🟢 *${row.channel_label}* 수집이 정상으로 돌아왔어요`);
      await upsertState(key, 'ok', row, null);
    }
    notified.push(key);
  }
  return notified;
}

const CATEGORY_SYSTEM_HINT: Record<string, string> = {
  '환불': '결제·환불 처리',
  '미납·결제': '결제·수납',
  '계정·로그인·앱': '앱 로그인/사이트',
  '교재·배송': '교재 배송/재고',
  '라이브': '라이브 방송',
  '입반·등록': '수강신청/반배정',
  '대기': '대기(웨이팅) 처리',
  '출결·보강': '출결/보강',
  '모의고사·서바이벌': '모의고사 응시/성적',
};

// 결론만: "평소보다 N배 많아요". 평균·배수 원값은 감춘다.
function spikeMessage(row: any): string {
  const breakdown = (row.channel_breakdown as any[]) || [];
  const total = breakdown.reduce((s, b) => s + Number(b.cnt || 0), 0);
  const top = breakdown[0];
  const topShare = top && total > 0 ? Math.round((100 * Number(top.cnt)) / total) : 0;
  const mult = Math.max(2, Math.round(Number(row.ratio) || 2));
  const hint = CATEGORY_SYSTEM_HINT[row.category] || '관련 업무';
  const where = top && topShare >= 50 ? ` 특히 *${top.channel}*에 몰려 있어요.` : '';
  const action =
    top && topShare >= 50
      ? `👉 ${top.channel}의 ${hint} 쪽에 문제 없는지 확인해 주세요.`
      : `👉 이벤트·공지 영향일 수 있어요. 최근 안내를 확인해 주세요.`;
  return (
    `🔴 *${row.category}* 문의가 갑자기 늘었어요\n` +
    `오늘 ${row.cnt}건으로 평소보다 ${mult}배 많아요.${where}\n` +
    action
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
  const { data: alertingRows } = await supabase
    .from('kakao_partner_alert_state')
    .select('alert_key')
    .eq('status', 'alerting')
    .like('alert_key', 'spike:%');
  for (const r of (alertingRows as any[]) || []) {
    const category = String(r.alert_key).slice('spike:'.length);
    if (spikingToday.has(category)) continue;
    await sendSlack(`🟢 "${category}" 문의량이 평소 수준으로 돌아왔어요`);
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

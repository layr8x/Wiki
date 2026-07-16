// supabase/functions/kakao-alert/index.ts
// 상담 데이터 이상탐지 알림 (채널별·원인별·진단형). Supabase Edge Function (pg_cron 10분).
//
// 인증: kakao_partner_secrets.key='kakao_alert_token'. 배포: --no-verify-jwt. 트리거: pg_cron 10분.
// Slack: SLACK_WEBHOOK_URL 미설정 시 로그+상태기록만. 중복억제: 지속시간 비례 쿨다운(아래).
// 메시지 원칙: 결론 먼저·평문·행동 한 줄. 비율/평균/임계 같은 계산·해석이 필요한 수치는 노출하지 않는다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL') ?? '';

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

type AlertState = {
  alert_key: string;
  status: string;
  first_alert_at: string | null;
  last_notified_at: string | null;
  last_payload?: any;
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

// 재알림 간격은 장애 지속시간에 비례해 늘린다. 같은 장애를 1시간마다 무한 반복하면
// 알림 채널이 스팸이 된다(2026-07-15 사용자 지적 — 로그인 만료 33시간 동안 매시간 6통씩).
//   지속 6시간까지: 1시간 간격 / 하루까지: 6시간 간격 / 이후: 하루 1번.
function cooldownMs(firstAlertAt: string | null): number {
  const ageMs = firstAlertAt ? Date.now() - new Date(firstAlertAt).getTime() : 0;
  if (ageMs < 6 * 3600_000) return 3600_000;
  if (ageMs < 24 * 3600_000) return 6 * 3600_000;
  return 24 * 3600_000;
}

function shouldNotify(prev: AlertState | null, nowBad: boolean): boolean {
  if (nowBad) {
    if (!prev || prev.status !== 'alerting') return true;
    const last = prev.last_notified_at ? new Date(prev.last_notified_at).getTime() : 0;
    return Date.now() - last > cooldownMs(prev.first_alert_at);
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
      `👉 맥 스튜디오 Chrome에서 business.kakao.com에 다시 로그인해 주세요. 로그인하면 자동으로 다시 수집돼요.${persist}`
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

// 여러 채널이 함께 죽었을 때의 통합 메시지(원인 1개 = 알림 1건).
function globalHealthMessage(reason: 'auth' | 'stall', badRows: any[], persistedH: string | null): string {
  const chs = badRows.map((r) => `*${r.channel_label}*`).join(' · ');
  const persist = persistedH ? `\n(${persistedH}시간째 계속되고 있어요)` : '';
  if (reason === 'auth') {
    return (
      `🔴 카카오 로그인 만료 — 상담 수집이 멈췄어요\n` +
      `로그인이 풀려서 전 채널이 새 상담을 못 가져오고 있어요(영향: ${chs}).\n` +
      `👉 맥 스튜디오 Chrome에서 business.kakao.com에 다시 로그인해 주세요. 로그인하면 자동으로 다시 수집돼요.${persist}`
    );
  }
  return (
    `🟠 상담 수집이 여러 채널에서 지연되고 있어요\n` +
    `영향: ${chs}. 대개 저절로 회복되지만, 오래 이어지면 점검이 필요해요.${persist}`
  );
}

const HEALTH_GLOBAL_KEY = 'health:global';

// 전역 인시던트로 새 상태를 만들 때, 기존 채널별 alerting 상태의 최초 시각을 물려받아
// "N시간째" 표기가 끊기지 않게 한다(구버전 채널별 키 → 통합 키 이행용).
async function earliestHealthFirstAlert(): Promise<string | null> {
  const { data } = await supabase
    .from('kakao_partner_alert_state')
    .select('first_alert_at')
    .like('alert_key', 'health:%')
    .eq('status', 'alerting')
    .not('first_alert_at', 'is', null)
    .order('first_alert_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as any)?.first_alert_at ?? null;
}

async function checkCollectionHealth(): Promise<string[]> {
  const { data, error } = await supabase.rpc('kakao_collection_health');
  if (error) {
    log('[alert] health rpc fail:', error.message);
    return [];
  }
  const rows = (data as any[]) || [];
  const notified: string[] = [];

  // ⚠️ 실제 수집 "중단"만 알린다: auth(로그인 만료)·heartbeat(수집 정체).
  //   'gap'(문의 뜸함)은 저트래픽 채널의 정상 상태라 알리지 않는다(2026-07-08 사용자 지적).
  const badRows = rows.filter((r) => r.health_reason === 'auth' || r.health_reason === 'heartbeat');
  const anyAuth = badRows.some((r) => r.health_reason === 'auth');

  // 원인 1개 = 알림 1건 원칙(2026-07-15 사용자 지적 — 로그인 만료 하나에 채널별 5통씩 발송됨).
  //   수집 함수는 채널을 순서대로 돌다 로그인 실패(401)를 만나면 나머지 채널을 건너뛰므로,
  //   첫 채널만 auth 로 기록되고 나머지는 heartbeat 정체처럼 보인다 — 실제 원인은 하나(쿠키 무효).
  //   그래서 auth 가 하나라도 있으면 로그인 만료 1건으로, 2채널 이상 동시 정체도 1건으로 묶는다.
  let globalReason: 'auth' | 'stall' | null = anyAuth ? 'auth' : badRows.length >= 2 ? 'stall' : null;
  const globalPrev = await getState(HEALTH_GLOBAL_KEY);

  // 원인 고정(sticky): 진행 중 사건의 원인이 auth 였다면, 감지 타이밍상 auth 표시가
  // 잠깐 사라져도(수집 주기 사이 창 이탈) stall 로 강등하지 않는다. 강등을 허용하면
  // 10분마다 만료↔지연으로 뒤집히며 "원인 변경 즉시 재알림"이 매번 발동해 스팸이 됐다
  // (2026-07-15 실측). 완전 회복(badRows 없음) 시에만 사건이 끝난다.
  if (globalReason === 'stall' && globalPrev?.status === 'alerting' && globalPrev.last_payload?.reason === 'auth') {
    globalReason = 'auth';
  }

  if (globalReason) {
    const prevReason = globalPrev?.status === 'alerting' ? globalPrev.last_payload?.reason ?? null : null;
    const reasonChanged = prevReason != null && prevReason !== globalReason;
    if (shouldNotify(globalPrev, true) || reasonChanged) {
      let firstAt = globalPrev?.status === 'alerting' && globalPrev.first_alert_at ? globalPrev.first_alert_at : null;
      if (!firstAt) firstAt = (await earliestHealthFirstAlert()) ?? new Date().toISOString();
      const ageMs = Date.now() - new Date(firstAt).getTime();
      const persistedH = ageMs > 3600_000 ? (ageMs / 3600000).toFixed(1) : null;
      await sendSlack(globalHealthMessage(globalReason, badRows, persistedH));
      await upsertState(HEALTH_GLOBAL_KEY, 'alerting', { reason: globalReason, channels: badRows.map((r) => r.channel_label) }, firstAt);
      notified.push(HEALTH_GLOBAL_KEY);
    }
    // 통합 키가 사건을 대표하는 동안 채널별 키는 조용히 정리(해제 시 "정상" 5연발 방지).
    for (const row of rows) {
      const key = `health:${row.profile_id}`;
      const prev = await getState(key);
      if (prev?.status === 'alerting') await upsertState(key, 'ok', { superseded_by: HEALTH_GLOBAL_KEY }, null);
    }
    return notified;
  }

  // 전역 인시던트 해제 → 회복도 1건으로.
  if (globalPrev?.status === 'alerting') {
    await sendSlack(`🟢 카카오 상담 수집이 전 채널 정상으로 돌아왔어요`);
    await upsertState(HEALTH_GLOBAL_KEY, 'ok', null, null);
    notified.push(HEALTH_GLOBAL_KEY);
  }

  // 단일 채널 이상만 채널별 알림.
  for (const row of rows) {
    const key = `health:${row.profile_id}`;
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

// 대시보드 실시간 RPC 지연/실패 감시(2026-07-10 신규).
// 배경: kakao_sla_status·kakao_action_chats 가 last_msg 조회에 색인이 안 맞아 각각
//   20.2초·11.2초까지 걸려 8초 role statement_timeout 을 넘기고 /admin/consults 에
//   간헐적 500 을 냈던 사고(같은 날 수정·색인/쿼리 재작성으로 3.1초·2.0초로 개선).
//   이 워치독은 그 재발을 자동으로 잡기 위한 것 — 8초 제한에 다가가기 "전에"(5초부터)
//   경보하고, 실제로 타임아웃 나면 즉시 경보한다. 새 RPC를 이 위젯에 추가할 때는 여기도 같이 추가할 것.
const RPC_WARN_MS = 5000; // 8초 제한 대비 여유 3초에서 경보
const DASHBOARD_RPCS: { name: string; label: string; args?: Record<string, unknown> }[] = [
  { name: 'kakao_sla_status', label: 'SLA 현황(North Star 위젯)' },
  { name: 'kakao_action_chats', label: '지금 처리할 대화 위젯', args: { limit_n: 6 } },
];

function rpcHealthMessage(label: string, fnName: string, ms: number | null, errMsg: string | null): string {
  if (errMsg) {
    return (
      `🔴 *${label}* 조회가 실패하고 있어요\n` +
      `대시보드가 쓰는 ${fnName} 함수가 에러를 내고 있어요(${errMsg}).\n` +
      `👉 개발 담당에게 ${fnName} 확인을 요청해 주세요.`
    );
  }
  return (
    `🟠 *${label}* 조회가 느려지고 있어요\n` +
    `${(ms! / 1000).toFixed(1)}초 걸렸어요(8초를 넘으면 화면에 에러가 나요).\n` +
    `👉 개발 담당에게 ${fnName} 색인·쿼리 점검을 요청해 주세요.`
  );
}

async function checkRpcHealth(): Promise<string[]> {
  const notified: string[] = [];
  for (const rpc of DASHBOARD_RPCS) {
    const key = `rpc:${rpc.name}`;
    const t0 = Date.now();
    const { error } = await supabase.rpc(rpc.name, rpc.args ?? {});
    const ms = Date.now() - t0;
    const bad = !!error || ms > RPC_WARN_MS;
    const prev = await getState(key);
    if (!shouldNotify(prev, bad)) continue;

    if (bad) {
      const firstAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
      await sendSlack(rpcHealthMessage(rpc.label, rpc.name, error ? null : ms, error?.message ?? null));
      await upsertState(key, 'alerting', { ms, error: error?.message ?? null }, firstAt);
    } else {
      await sendSlack(`🟢 *${rpc.label}* 조회 속도가 정상으로 돌아왔어요(${(ms / 1000).toFixed(1)}초)`);
      await upsertState(key, 'ok', { ms }, null);
    }
    notified.push(key);
  }
  return notified;
}

// 분석 파이프라인 신선도 감시. 수집(collect)은 살아 있어도 그 뒤 단계(감정분류·일일요약)가
// 조용히 멈추면(예: 인덱스 부재로 8초 타임아웃을 함수가 삼키고 200 반환) 아무도 몰랐다.
// ①감정분류: 미처리 백로그가 있는데도 최근 분류 시각이 오래되면 = 정지.
// ②일일요약: 최신 스냅샷 날짜가 오래되면 = 정지.
const SENTIMENT_STALE_MS = 6 * 60 * 60 * 1000;   // 분류 6시간 이상 정지
const SNAPSHOT_STALE_MS = 40 * 60 * 60 * 1000;   // 일일요약 약 1.7일 이상 없음(하루 1회 + 여유)
async function checkAnalysisFreshness(): Promise<string[]> {
  const notified: string[] = [];

  // ① 감정분류 신선도
  try {
    const { data: last } = await supabase
      .from('kakao_partner_messages')
      .select('sentiment_classified_at')
      .not('sentiment_classified_at', 'is', null)
      .order('sentiment_classified_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { count: backlog } = await supabase
      .from('kakao_partner_messages')
      .select('*', { count: 'exact', head: true })
      .eq('sender_type', 'user')
      .is('sentiment', null)
      .not('message', 'is', null);
    const lastMs = (last as any)?.sentiment_classified_at ? new Date((last as any).sentiment_classified_at).getTime() : 0;
    const bad = (backlog || 0) > 0 && Date.now() - lastMs > SENTIMENT_STALE_MS;
    const key = 'analysis:sentiment';
    const prev = await getState(key);
    if (shouldNotify(prev, bad)) {
      if (bad) {
        const firstAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
        await sendSlack(
          `🟠 *감정 분석*이 밀리고 있어요\n` +
          `상담은 정상 수집되는데, 감정 분석 단계가 한동안 멈춰 미처리가 쌓이고 있어요.\n` +
          `👉 개발 담당에게 kakao-classify 확인을 요청해 주세요.`,
        );
        await upsertState(key, 'alerting', { backlog, last_at: (last as any)?.sentiment_classified_at ?? null }, firstAt);
      } else {
        await sendSlack(`🟢 *감정 분석*이 정상으로 돌아왔어요`);
        await upsertState(key, 'ok', null, null);
      }
      notified.push(key);
    }
  } catch (e) { log('[alert] sentiment freshness fail:', (e as Error).message); }

  // ② 일일요약 스냅샷 신선도
  try {
    const { data: snap } = await supabase
      .from('kakao_partner_daily_snapshot')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const snapMs = (snap as any)?.snapshot_date ? new Date((snap as any).snapshot_date + 'T00:00:00+09:00').getTime() : 0;
    const bad = Date.now() - snapMs > SNAPSHOT_STALE_MS;
    const key = 'analysis:snapshot';
    const prev = await getState(key);
    if (shouldNotify(prev, bad)) {
      if (bad) {
        const firstAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
        await sendSlack(
          `🟠 *일일 요약*이 갱신되지 않고 있어요\n` +
          `매일 만들어지는 상담 요약 스냅샷이 어제·오늘 만들어지지 않았어요.\n` +
          `👉 개발 담당에게 kakao-daily-summary 확인을 요청해 주세요.`,
        );
        await upsertState(key, 'alerting', { last_snapshot: (snap as any)?.snapshot_date ?? null }, firstAt);
      } else {
        await sendSlack(`🟢 *일일 요약*이 정상으로 돌아왔어요`);
        await upsertState(key, 'ok', null, null);
      }
      notified.push(key);
    }
  } catch (e) { log('[alert] snapshot freshness fail:', (e as Error).message); }

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
  const analysis = await checkAnalysisFreshness();
  const rpcHealth = await checkRpcHealth();
  const result = { at: new Date().toISOString(), slack_configured: !!SLACK_WEBHOOK_URL, notified: [...health, ...spike, ...analysis, ...rpcHealth] };
  log('done', JSON.stringify(result));
  return json(result);
});

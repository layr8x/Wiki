// supabase/functions/kakao-alert/index.ts
// 상담 알럿봇 — 상담 운영 + 수집 파이프라인 감시. Supabase Edge Function (pg_cron 10분).
//
// 감시 항목 7가지 (2026-08-19 기준)
//   [운영] 오래 기다리는 상담   checkWaitingSla        영업시간에만 · 영업 6시간 이상 미응답
//   [수집] 수집 중단·지연       checkCollectionHealth  로그인 만료 / heartbeat 정체 · 즉시
//   [수집] 쿠키 만료 예고        checkCookieExpiry      _kawlt 6h 미만 / _karmt 3일 미만 · 즉시
//   [운영] 문의량 급증          checkCategorySpike     야간 보류 · 카테고리 통합 1건
//   [파이프] 감정분류·일일요약  checkAnalysisFreshness 뒤 단계가 조용히 멈춘 것 탐지
//   [파이프] 대시보드 RPC       checkRpcHealth         8초 타임아웃 전에 미리 경보
//   [파이프] 백업 고아 파일     checkArchiveOrphans    Storage 파일 수 vs kakao_archive_log 기록 수 대조
//
// 발송 원칙
//   · 한 번 실행에서 나가는 Slack 메시지는 **최대 1통**(flushOutbox 가 묶어 보냄, 🔴 먼저).
//   · 같은 사건 재알림 간격은 지속시간에 비례해 늘어난다(1시간 → 6시간 → 하루, cooldownMs).
//   · 사람이 조치 못 하는 시간대에는 보내지 않는다(운영 알림=영업시간, 급증=야간 제외).
//     단 수집 중단은 시간 무관 즉시 — 방치할수록 데이터가 유실된다.
//
// 인증: kakao_partner_secrets.key='kakao_alert_token'. 배포: --no-verify-jwt. 트리거: pg_cron 10분.
// Slack: SLACK_WEBHOOK_URL 미설정 시 로그+상태기록만.
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

// ─── 알림 모아 보내기 (2026-08-12) ────────────────────────────────────────────
// 예전에는 검사 항목마다 각자 Slack 을 호출해, 한 번 실행에서 최대 4~5통이 연달아 나갔다.
// 이제는 각 검사가 outbox 에 담기만 하고, 마지막에 **한 통으로 묶어** 보낸다.
// 급한 것(🔴)이 위로 오도록 정렬하고, 맨 아래에 대시보드 링크를 붙여 바로 조치로 잇는다.
const DASHBOARD_URL = 'https://sdij-wiki.vercel.app/admin/consults';
type Level = 'red' | 'orange' | 'green';
const LEVEL_ORDER: Record<Level, number> = { red: 0, orange: 1, green: 2 };
// ⚠️ Edge Function 은 요청마다 새로 뜨지 않고 같은 인스턴스를 재사용한다. 이 배열을 매 요청
//    시작에 비우지 않으면 지난 실행에서 담긴 알림이 다음 실행에 딸려 나간다(중복 발송).
const outbox: { level: Level; text: string }[] = [];
function resetOutbox() {
  outbox.length = 0;
}
function notify(level: Level, text: string) {
  outbox.push({ level, text });
}

async function flushOutbox(): Promise<number> {
  if (!outbox.length) return 0;
  outbox.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const header = outbox.length > 1 ? `📣 상담 알림 ${outbox.length}건\n\n` : '';
  await sendSlack(header + outbox.map((o) => o.text).join('\n\n') + `\n\n대시보드: ${DASHBOARD_URL}`);
  return outbox.length;
}

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
      `👉 수집 기기(맥북 에어) Chrome에서 business.kakao.com에 다시 로그인해 주세요. 로그인하면 자동으로 다시 수집돼요.${persist}`
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
      `👉 수집 기기(맥북 에어) Chrome에서 business.kakao.com에 다시 로그인해 주세요. 로그인하면 자동으로 다시 수집돼요.${persist}`
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
      notify('red', globalHealthMessage(globalReason, badRows, persistedH));
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
    notify('green', `🟢 카카오 상담 수집이 전 채널 정상으로 돌아왔어요`);
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
      notify(row.health_reason === 'auth' ? 'red' : 'orange', healthMessage(row, persistedH));
      await upsertState(key, 'alerting', row, firstAt);
    } else {
      notify('green', `🟢 *${row.channel_label}* 수집이 정상으로 돌아왔어요`);
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

// 문의량 급증 알림은 "지금 사람이 확인해야 하는가"가 기준이다. 아래 셋을 지킨다
// (2026-08-12 사용자 지적 "알림이 너무 잦다" — 새벽 00:10~07:40 에만 6통이 갔다).
//   ① 야간(23시~08시)에는 보내지 않는다 — 그 시간에 상담을 확인할 사람이 없다.
//      상태를 alerting 으로 굳히지 않으므로, 아침에도 계속 튀어 있으면 그때 1통 간다.
//   ② 여러 카테고리가 동시에 튀어도 알림은 1통 — 가장 심한 것만 쓰고 나머지는 "외 N건".
//   ③ 회복(🟢 평소 수준으로 돌아왔어요)은 보내지 않고 상태만 조용히 되돌린다.
//      급증 알림은 조치 안내가 목적이지 상황 중계가 아니다(회복 알림이 통수를 두 배로 만들었다).
// ※ 수집 장애(로그인 만료 등)는 이 규칙과 무관하게 종전대로 즉시 보낸다 — 사람이 고쳐야 낫는다.
const SPIKE_MIN_RATIO = 2.5;   // 평소의 2.5배 (기존 2.0 — 저볼륨 카테고리 노이즈 컷)
const SPIKE_MIN_COUNT = 10;    // 최소 10건 (기존 5 — 3건→7건 같은 건 급증이 아니다)
const SPIKE_QUIET_START_KST = 23;
const SPIKE_QUIET_END_KST = 8;
// 무엇을 확인해야 하는지 짚어주지 못하는 카테고리는 알리지 않는다.
const SPIKE_SKIP_CATEGORIES = new Set(['기타']);

function kstHour(): number {
  return (new Date().getUTCHours() + 9) % 24;
}
function inQuietHours(): boolean {
  const h = kstHour();
  return h >= SPIKE_QUIET_START_KST || h < SPIKE_QUIET_END_KST;
}

async function checkCategorySpike(): Promise<string[]> {
  const { data, error } = await supabase.rpc('kakao_category_spike', {
    min_ratio: SPIKE_MIN_RATIO,
    min_count: SPIKE_MIN_COUNT,
  });
  if (error) {
    log('[alert] spike rpc fail:', error.message);
    return [];
  }
  const rows = ((data as any[]) || []).filter((r) => !SPIKE_SKIP_CATEGORIES.has(r.category));
  const spikingToday = new Set(rows.map((r) => r.category as string));
  const notified: string[] = [];

  // 급증이 끝난 카테고리는 조용히 해제(알림 없음).
  const { data: alertingRows } = await supabase
    .from('kakao_partner_alert_state')
    .select('alert_key')
    .eq('status', 'alerting')
    .like('alert_key', 'spike:%');
  for (const r of (alertingRows as any[]) || []) {
    const category = String(r.alert_key).slice('spike:'.length);
    if (spikingToday.has(category)) continue;
    await upsertState(r.alert_key, 'ok', null, null);
  }

  if (!rows.length) return notified;
  if (inQuietHours()) {
    log(`[alert] 야간(${kstHour()}시 KST) — 급증 ${rows.length}건 발송 보류, 아침에 재평가`);
    return notified;
  }

  // 쿨다운이 끝나 실제로 알릴 수 있는 것만 추린 뒤, 그중 가장 심한 1건으로 대표해 1통만 보낸다.
  const due: any[] = [];
  for (const row of rows) {
    const prev = await getState(`spike:${row.category}`);
    if (shouldNotify(prev, true)) due.push({ row, prev });
  }
  if (!due.length) return notified;

  due.sort((a, b) => Number(b.row.ratio || 0) - Number(a.row.ratio || 0));
  const head = due[0];
  const others = due.length - 1;
  notify('red', spikeMessage(head.row) + (others > 0 ? `\n(같은 시간대에 *${others}개* 카테고리도 함께 늘었어요)` : ''));

  // 함께 늘어난 카테고리도 알린 것으로 처리 — 안 그러면 다음 실행에서 하나씩 또 나간다.
  for (const { row, prev } of due) {
    const key = `spike:${row.category}`;
    const firstAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
    await upsertState(key, 'alerting', row, firstAt);
    notified.push(key);
  }
  return notified;
}

// ─── 오래 기다리는 상담 감시 (2026-08-12 신규) ────────────────────────────────
// 이 알림이 없던 게 알럿봇의 가장 큰 구멍이었다. 지금까지 알럿봇은 "수집 프로그램이
// 살아 있나"만 봤고, 정작 "고객이 답을 못 받고 방치되고 있나"는 아무도 안 봤다.
// 실측(2026-08-12): 마이클래스 40시간·콘텐츠 18.6시간 미응답(영업시간 기준!)인데 알림 0건.
// 아침 9시 일일 요약에만 한 줄 들어갈 뿐이라, 그날 안에 손쓸 방법이 없었다.
//
// 설계:
//   · 기준 시간은 kakao_sla_status 가 주는 **영업 시간**(평일 09~19시 KST)이다. 야간·주말은
//     애초에 세지 않으므로 "6시간"은 실제로 근무일 기준 6시간을 뜻한다.
//   · 알림도 영업시간에만 보낸다 — 밤 10시에 알려도 처리할 사람이 없다. 상태를 굳히지
//     않으므로 다음 근무시간 첫 실행에서 다시 판단한다.
//   · 채널이 여럿이어도 1건으로 묶는다(원인 1개 = 알림 1건 원칙, §22-3과 동일).
//   · 회복은 알리지 않고 상태만 조용히 해제한다.
const SLA_WAIT_ALERT_H = 6;         // 영업시간 기준 6시간 = 근무일 기준 하루의 절반 넘게 방치
const SLA_KEY = 'sla:waiting';

function isBusinessHours(): boolean {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const day = kst.getUTCDay();               // 0=일 … 6=토
  const h = kst.getUTCHours();
  return day >= 1 && day <= 5 && h >= 9 && h < 19;
}

function waitingMessage(bad: any[]): string {
  const detail = bad
    .map((r) => `${r.channel} ${r.waiting}건(가장 오래 영업 ${Math.round(Number(r.oldest_wait_h))}시간)`)
    .join(' · ');
  return (
    `🔴 오래 기다리는 상담이 있어요\n` +
    `${detail}\n` +
    `👉 대시보드 "지금 처리할 대화"에서 오래 기다린 순으로 답변해 주세요.`
  );
}

async function checkWaitingSla(): Promise<string[]> {
  const { data, error } = await supabase.rpc('kakao_sla_status');
  if (error) {
    log('[alert] sla rpc fail:', error.message);
    return [];
  }
  const rows = (data as any[]) || [];
  const bad = rows
    .filter((r) => Number(r.waiting) > 0 && Number(r.oldest_wait_h) >= SLA_WAIT_ALERT_H)
    .sort((a, b) => Number(b.oldest_wait_h) - Number(a.oldest_wait_h));
  const prev = await getState(SLA_KEY);

  if (!bad.length) {
    if (prev?.status === 'alerting') await upsertState(SLA_KEY, 'ok', null, null); // 회복은 조용히
    return [];
  }
  if (!isBusinessHours()) {
    log('[alert] 영업시간 외 — 미응답 상담 알림 보류, 다음 근무시간에 재평가');
    return [];
  }
  if (!shouldNotify(prev, true)) return [];

  const firstAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
  notify('red', waitingMessage(bad));
  await upsertState(SLA_KEY, 'alerting', { channels: bad.map((r) => ({ channel: r.channel, waiting: r.waiting, oldest_wait_h: r.oldest_wait_h })) }, firstAt);
  return [SLA_KEY];
}

// ── [수집] 쿠키 만료 예고 감시 (2026-08-13 신규) ───────────────────────────────
// 왜 필요한가: 지금까지 쿠키는 **만료된 뒤 401 이 나야** 알아챘다(감시 0건 — 실측).
//   수집이 클라우드로 옮겨가면서 보관함 쿠키의 잔여 수명이 곧 수집 생존시간이 됐으므로,
//   "이미 죽었다"가 아니라 "곧 죽는다"를 알려야 한다.
// 쿠키 2단 구조(2026-08-13 실측): _kawlt 로그인 토큰 약 24시간 / _karmt 자동로그인 약 29일.
//   _kawlt 는 담당자 기기가 다시 공급하면 회복되므로 기기가 꺼져 있을 때만 문제가 된다.
//   _karmt 가 마르면 사람이 직접 로그인하는 것 말고는 방법이 없다 — 이쪽이 더 급하다.
const COOKIE_KEY = 'cookie_expiry';
const KAWLT_WARN_H = 6;   // 로그인 토큰 6시간 미만
const KARMT_WARN_D = 3;   // 자동로그인 토큰 3일 미만

async function checkCookieExpiry(): Promise<string[]> {
  const { data, error } = await supabase
    .from('kakao_partner_secrets').select('value').eq('key', 'kakao_partner_cookie').maybeSingle();
  if (error || !(data as any)?.value) {
    log('[alert] cookie read fail:', error?.message ?? 'no row');
    return [];
  }
  // 만료 epoch 만 읽는다. 쿠키 값 자체는 로그·알림 어디에도 남기지 않는다.
  const jar = new Map<string, string>();
  for (const part of String((data as any).value).split(';')) {
    const s = part.trim();
    const i = s.indexOf('=');
    if (i > 0) jar.set(s.slice(0, i), s.slice(i + 1));
  }
  const now = Date.now();
  const kawltH = Number(jar.get('_kawltea') || 0) ? (Number(jar.get('_kawltea')) * 1000 - now) / 3600000 : null;
  const karmtD = Number(jar.get('_karmtea') || 0) ? (Number(jar.get('_karmtea')) * 1000 - now) / 86400000 : null;

  const karmtBad = karmtD !== null && karmtD < KARMT_WARN_D;
  const kawltBad = kawltH !== null && kawltH < KAWLT_WARN_H;
  const bad = karmtBad || kawltBad;

  const prev = await getState(COOKIE_KEY);
  if (!bad) {
    if (prev?.status === 'alerting') await upsertState(COOKIE_KEY, 'ok', null, null); // 회복은 조용히
    return [];
  }
  if (!shouldNotify(prev, true)) return [];

  // 자동로그인 토큰이 마르는 쪽이 훨씬 심각하다 — 사람이 로그인하는 것 외에 복구 수단이 없다.
  const msg = karmtBad
    ? `🔴 카카오 자동 로그인이 곧 풀려요 (남은 기간 ${karmtD!.toFixed(1)}일)\n` +
      `이게 끝나면 수집이 멈추고, 서버가 스스로 되살릴 방법이 없어요.\n` +
      `👉 수집 기기 Chrome 에서 business.kakao.com 에 다시 로그인해 주세요("로그인 유지" 체크).`
    : `🟠 카카오 로그인 토큰이 ${kawltH!.toFixed(1)}시간 뒤 만료돼요\n` +
      `수집 기기가 켜져 있으면 자동으로 갱신되니 대개 조치가 필요 없어요.\n` +
      `👉 기기를 오래 꺼두실 예정이면 켜 두시거나, 미리 한 번 로그인해 주세요.`;

  const firstAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
  notify(karmtBad ? 'red' : 'orange', msg);
  await upsertState(COOKIE_KEY, 'alerting', { kawlt_h: kawltH, karmt_d: karmtD }, firstAt);
  return [COOKIE_KEY];
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
      notify(error ? 'red' : 'orange', rpcHealthMessage(rpc.label, rpc.name, error ? null : ms, error?.message ?? null));
      await upsertState(key, 'alerting', { ms, error: error?.message ?? null }, firstAt);
    } else {
      notify('green', `🟢 *${rpc.label}* 조회 속도가 정상으로 돌아왔어요(${(ms / 1000).toFixed(1)}초)`);
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
        notify('orange',
          `🟠 *감정 분석*이 밀리고 있어요\n` +
          `상담은 정상 수집되는데, 감정 분석 단계가 한동안 멈춰 미처리가 쌓이고 있어요.\n` +
          `👉 개발 담당에게 kakao-classify 확인을 요청해 주세요.`,
        );
        await upsertState(key, 'alerting', { backlog, last_at: (last as any)?.sentiment_classified_at ?? null }, firstAt);
      } else {
        notify('green', `🟢 *감정 분석*이 정상으로 돌아왔어요`);
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
        notify('orange',
          `🟠 *일일 요약*이 갱신되지 않고 있어요\n` +
          `매일 만들어지는 상담 요약 스냅샷이 어제·오늘 만들어지지 않았어요.\n` +
          `👉 개발 담당에게 kakao-daily-summary 확인을 요청해 주세요.`,
        );
        await upsertState(key, 'alerting', { last_snapshot: (snap as any)?.snapshot_date ?? null }, firstAt);
      } else {
        notify('green', `🟢 *일일 요약*이 정상으로 돌아왔어요`);
        await upsertState(key, 'ok', null, null);
      }
      notified.push(key);
    }
  } catch (e) { log('[alert] snapshot freshness fail:', (e as Error).message); }

  return notified;
}

// ── [수집] 백업 고아 파일 감시 (2026-08-19 신규) ──────────────────────────────
// 왜 필요한가: kakao-archive 는 Storage 업로드 + DB 원본 삭제까지 끝낸 뒤 마지막으로
//   kakao_archive_log 에 "이 파일이 어디 있다"는 기록을 남긴다. 이 마지막 기록만 실패하면
//   파일은 Storage에 멀쩡히 있는데 "전체 다운로드"가 찾을 방법이 없는 고아가 된다 — 데이터
//   유실은 아니지만 발견 불가능은 유실과 같은 결과다. kakao-archive 자체는 이 실패를
//   hadFailure 로만 보고하고 아무도 그 응답을 상시로 보지 않으므로, 여기서 Storage 파일 수와
//   기록 수를 직접 대조한다.
const ARCHIVE_ORPHAN_KEY = 'archive:orphans';
const ARCHIVE_CHANNELS = ['_VGAQn', '_rcpPG', '_TkpPG', '_xfxilXn', '_rkbcn'];

async function countArchiveFiles(profileId: string): Promise<number> {
  let total = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from('kakao-archive').list(profileId, { limit: 1000, offset });
    if (error) { log('[alert] archive storage list fail:', profileId, error.message); return -1; }
    total += data?.length ?? 0;
    if (!data || data.length < 1000) break;
  }
  return total;
}

async function checkArchiveOrphans(): Promise<string[]> {
  const bad: { channel: string; orphans: number }[] = [];
  for (const profileId of ARCHIVE_CHANNELS) {
    const filesN = await countArchiveFiles(profileId);
    if (filesN < 0) continue; // 목록 조회 자체가 실패 — 이번엔 판단 보류(다음 실행에서 재시도)
    const { count: logN, error } = await supabase
      .from('kakao_archive_log').select('*', { count: 'exact', head: true }).eq('profile_id', profileId);
    if (error) { log('[alert] archive_log count fail:', profileId, error.message); continue; }
    const orphans = filesN - (logN ?? 0);
    if (orphans > 0) bad.push({ channel: profileId, orphans });
  }

  const prev = await getState(ARCHIVE_ORPHAN_KEY);
  if (!bad.length) {
    if (prev?.status === 'alerting') await upsertState(ARCHIVE_ORPHAN_KEY, 'ok', null, null); // 회복은 조용히
    return [];
  }
  if (!shouldNotify(prev, true)) return [];

  const detail = bad.map((b) => `${b.channel} ${b.orphans}개`).join(' · ');
  const firstAt = prev?.status === 'alerting' && prev.first_alert_at ? prev.first_alert_at : new Date().toISOString();
  notify('orange',
    `🟠 백업 파일 중 일부가 기록에서 빠졌어요\n` +
    `${detail} — Storage 에는 저장돼 있지만 "전체 다운로드"가 못 찾아요(데이터 유실은 아니에요).\n` +
    `👉 개발 담당에게 kakao_archive_log 누락분 확인을 요청해 주세요.`,
  );
  await upsertState(ARCHIVE_ORPHAN_KEY, 'alerting', { channels: bad }, firstAt);
  return [ARCHIVE_ORPHAN_KEY];
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

  // 검사는 각자 outbox 에 담기만 하고, 발송은 아래에서 한 통으로 묶어 한 번만 한다.
  resetOutbox();
  const health = await checkCollectionHealth();
  const cookie = await checkCookieExpiry();
  const waiting = await checkWaitingSla();
  const spike = await checkCategorySpike();
  const analysis = await checkAnalysisFreshness();
  const rpcHealth = await checkRpcHealth();
  const archiveOrphans = await checkArchiveOrphans();
  const messages = await flushOutbox();
  const result = {
    at: new Date().toISOString(),
    slack_configured: !!SLACK_WEBHOOK_URL,
    business_hours: isBusinessHours(),
    slack_messages_sent: messages ? 1 : 0,
    notified: [...health, ...cookie, ...waiting, ...spike, ...analysis, ...rpcHealth, ...archiveOrphans],
  };
  log('done', JSON.stringify(result));
  return json(result);
});

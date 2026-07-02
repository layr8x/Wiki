// supabase/functions/kakao-daily-summary/index.ts
// 카카오 상담 파이프라인 상태를 매일 정해진 시각에 Slack으로 자동 발송.
//
// 왜: kakao-status(슬래시 명령 /카카오상태)는 새 "Commands" 권한이 필요해 워크스페이스
//   관리자 승인이 있어야 켤 수 있었다(승인 대기·거절 가능성 있음). 반면 이미 kakao-alert가
//   쓰고 있는 SLACK_WEBHOOK_URL(수신 웹훅)은 추가 권한·승인 없이 이미 열려 있는 경로다.
//   그래서 "물어보면 답한다" 대신 "매일 정해진 시각에 알아서 올라온다" 방식으로 같은 정보를
//   제공한다 — 관리자 승인 불필요, 지금 바로 동작.
//
// 동작: pg_cron 이 매일 1회(기본 09:00 KST = 00:00 UTC) 호출 → kakao_status_summary()(운영
//   상태) + get_chat_category_distribution/get_sentiment_trend(오늘의 상담 내용 분석, 기존
//   대시보드용 RPC 재사용) 조회 → SLACK_WEBHOOK_URL 로 직접 POST. 이어서 그 결과를
//   kakao_partner_daily_snapshot 테이블에 날짜별로 남겨, "며칠 전엔 어땠는지" 나중에
//   다시 꺼내볼 수 있게 한다(슬랙 메시지 자체는 안 쌓이므로 이 테이블이 실제 이력 저장소).
//   SLACK_WEBHOOK_URL 미설정 시 로그만 남기고 스킵(kakao-collect 의 "시크릿 없으면 skip" 관례).
//
// 인증: kakao-collect 와 동일 패턴 — kakao_partner_secrets.key='kakao_daily_summary_token' 비교.
// 배포: supabase functions deploy kakao-daily-summary --no-verify-jwt
// 트리거: supabase/migrations/20260702_kakao_daily_summary.sql 의 pg_cron(매일 1회).

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

const HEALTH_EMOJI: Record<string, string> = { ok: '🟢', warning: '🟠', critical: '🔴' };

function fmtDelta(n: number): string {
  if (n > 0) return `+${n.toLocaleString()}`;
  if (n < 0) return `${n.toLocaleString()}`;
  return '변화 없음';
}

function formatDailySummary(summary: any, categoryTop: any[], sentimentToday: any[], yesterday: any | null): string {
  const channels = (summary?.channels ?? []) as any[];
  const channelLines = channels
    .map((c) => `${HEALTH_EMOJI[c.health] ?? '⚪'} ${c.channel} — heartbeat ${c.hb_age_min}분 전 · 마지막 메시지 ${c.hrs_since_msg ?? '?'}시간 전`)
    .join('\n');

  const cls = summary?.classify ?? {};
  const sen = summary?.sentiment ?? {};
  const sentTotal = Number(sen.total_user_msgs || 0);
  const sentDone = Number(sen.done || 0);
  const sentPct = sentTotal > 0 ? ((100 * sentDone) / sentTotal).toFixed(1) : '0';

  const alerts = (summary?.active_alerts ?? []) as string[];
  const alertLine = alerts.length ? `⚠️ 진행 중인 알림: ${alerts.join(', ')}` : '✅ 현재 진행 중인 알림 없음';

  const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });

  const topCategoryLine = categoryTop.length
    ? categoryTop.slice(0, 5).map((r) => `${r.category} ${r.cnt}건(${r.pct}%)`).join(' · ')
    : '(최근 24시간 분류된 대화 없음)';

  const sentSum = sentimentToday.reduce(
    (acc, r) => ({ pos: acc.pos + Number(r.positive || 0), neu: acc.neu + Number(r.neutral || 0), neg: acc.neg + Number(r.negative || 0) }),
    { pos: 0, neu: 0, neg: 0 },
  );
  const sentimentLine = `긍정 ${sentSum.pos} · 중립 ${sentSum.neu} · 부정 ${sentSum.neg}`;

  // 어제 대비 변화 — kakao_partner_daily_snapshot 에 어제 기록이 있을 때만 표시.
  let deltaLines: string[] = [];
  if (yesterday) {
    const yCls = yesterday.classify ?? {};
    const ySen = yesterday.sentiment ?? {};
    const reviewDelta = (Number(cls.review_queue ?? 0)) - (Number(yCls.review_queue ?? 0));
    const sentDoneDelta = sentDone - Number(ySen.done ?? 0);
    deltaLines = [
      ``,
      `*📈 어제 대비*`,
      `재검토 큐: ${fmtDelta(reviewDelta)}건 (어제 ${yCls.review_queue ?? '?'}건 → 오늘 ${cls.review_queue ?? '?'}건)`,
      `감정분석 처리: ${fmtDelta(sentDoneDelta)}건`,
    ];
  } else {
    deltaLines = [``, `*📈 어제 대비*`, `(어제 기록 없음 — 내일부터 비교 표시됩니다)`];
  }

  return [
    `📅 *카카오 상담 파이프라인 일일 요약* — ${today}`,
    ``,
    `*수집*`,
    channelLines || '(채널 정보 없음)',
    ``,
    `*분류*`,
    `미분류 대기: ${cls.unclassified ?? '?'}건`,
    `레거시 '기타' 재검토 큐: ${cls.review_queue ?? '?'}건 남음`,
    ``,
    `*감정분석 진행률*`,
    `${sentDone.toLocaleString()} / ${sentTotal.toLocaleString()}건 처리 (${sentPct}%)`,
    ``,
    `*📊 오늘의 상담 분석 (최근 24시간)*`,
    `가장 많은 문의: ${topCategoryLine}`,
    `오늘 감정: ${sentimentLine}`,
    ...deltaLines,
    ``,
    alertLine,
  ].join('\n');
}

async function sendSlack(text: string) {
  if (!SLACK_WEBHOOK_URL) {
    log('[daily-summary] SLACK_WEBHOOK_URL 미설정 — 로그만 남김:\n' + text);
    return false;
  }
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    log('[daily-summary] slack post fail:', res.status, await res.text().catch(() => ''));
    return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: secret } = await supabase
    .from('kakao_partner_secrets')
    .select('value')
    .eq('key', 'kakao_daily_summary_token')
    .maybeSingle();
  if (!secret?.value || token !== secret.value) return json({ error: 'unauthorized' }, 401);

  const { data: summary, error } = await supabase.rpc('kakao_status_summary');
  if (error) {
    log('status rpc fail:', error.message);
    return json({ error: error.message }, 500);
  }

  // 오늘의 상담 내용 분석 — 대시보드가 이미 쓰는 RPC 재사용(20260527_kakao_category_sentiment.sql).
  const { data: categoryDist, error: catErr } = await supabase.rpc('get_chat_category_distribution', { window_days: 1 });
  if (catErr) log('category rpc fail:', catErr.message);
  const { data: sentimentTrend, error: senErr } = await supabase.rpc('get_sentiment_trend', { window_days: 1 });
  if (senErr) log('sentiment trend rpc fail:', senErr.message);

  const categoryTop = (categoryDist as any[]) || [];
  const sentimentToday = (sentimentTrend as any[]) || [];

  // 어제 스냅샷 조회(있으면 "어제 대비" 비교 표시).
  const snapshotDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD
  const yesterdayDate = new Date(new Date(snapshotDate + 'T00:00:00Z').getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  const { data: yesterdaySnap } = await supabase
    .from('kakao_partner_daily_snapshot')
    .select('summary')
    .eq('snapshot_date', yesterdayDate)
    .maybeSingle();

  const text = formatDailySummary(summary, categoryTop, sentimentToday, (yesterdaySnap as any)?.summary ?? null);
  const sent = await sendSlack(text);

  // 이력 저장 — 슬랙 메시지 자체는 안 쌓이므로, 실제 조회 가능한 이력은 이 테이블에 남긴다.
  const { error: snapErr } = await supabase.from('kakao_partner_daily_snapshot').upsert(
    { snapshot_date: snapshotDate, summary: { ...summary, category_top: categoryTop, sentiment_today: sentimentToday } },
    { onConflict: 'snapshot_date' },
  );
  if (snapErr) log('snapshot save fail:', snapErr.message);

  log('daily summary done', JSON.stringify({ sent, slack_configured: !!SLACK_WEBHOOK_URL, snapshot_saved: !snapErr }));
  return json({ sent, slack_configured: !!SLACK_WEBHOOK_URL, snapshot_saved: !snapErr, at: new Date().toISOString() });
});

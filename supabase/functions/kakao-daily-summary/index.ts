// supabase/functions/kakao-daily-summary/index.ts
// 카카오 상담 파이프라인 일일 요약. pg_cron 매일 09:00 KST.
// 메시지 원칙: 결론 먼저·평문. 비율·평균 같은 계산·해석이 필요한 수치는 노출하지 않는다.
// 응답 속도는 운영시간(평일 09~19시) 기준 영업분/영업시간(kakao_sla_status). 야간·주말 제외.
// 인증: kakao_partner_secrets.key='kakao_daily_summary_token'. Slack: SLACK_WEBHOOK_URL 미설정 시 로그만.

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

const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : 0);
const num = (v: unknown) => Number(v ?? 0);
function fmtDelta(n: number): string {
  if (n > 0) return `+${n.toLocaleString()}`;
  if (n < 0) return `${n.toLocaleString()}`;
  return '0';
}

const CHANNEL_BY_PID: Record<string, string> = { _xfxilXn: '시대인재C', _TkpPG: '라이브', _VGAQn: '마이클래스' };
function friendlyAlert(key: string): string {
  if (key.startsWith('health:')) return `${CHANNEL_BY_PID[key.slice('health:'.length)] || key.slice(7)} 수집`;
  if (key.startsWith('spike:')) return `${key.slice('spike:'.length)} 급증`;
  if (key.startsWith('milestone:')) return '재분류 완료';
  return key;
}

const CATEGORY_HINT: Record<string, string> = {
  '환불': '결제·환불',
  '미납·결제': '결제·수납',
  '계정·로그인·앱': '앱 로그인/사이트',
  '교재·배송': '교재 배송',
  '라이브': '라이브 송출',
  '모의고사·서바이벌': '모의고사 응시/성적',
};

const HEMOJI: Record<string, string> = { ok: '🟢', warning: '🟠', critical: '🔴' };

// "오늘 볼 것": 조치가 필요한 항목만 모음
function buildActions(channels: any[], sla: any[], spikes: any[], sentTrend: any[]): { lines: string[]; hasRed: boolean } {
  const lines: string[] = [];
  let hasRed = false;

  for (const c of channels) {
    if (c.health === 'ok') continue;
    if (c.health_reason === 'auth') { lines.push(`🔴 *${c.channel}* 수집이 멈췄어요 · 쿠키 재발급 필요`); hasRed = true; }
    else if (c.health_reason === 'heartbeat') lines.push(`🟠 *${c.channel}* 수집이 잠깐 느려요`);
    else lines.push(`🟠 *${c.channel}* 새 상담이 뜸해요 (프로그램은 정상)`);
  }

  // 응답 지연/대기 누적. 운영시간 기준(med·oldest 는 영업분/영업시간, 야간·주말 제외).
  for (const s of sla) {
    const w = num(s.waiting), oldest = num(s.oldest_wait_h), med = num(s.median_first_response_min), ans = num(s.answered_n);
    const slow = ans >= 5 && med >= 60;
    const queue = w >= 5 || oldest >= 8;
    if (!slow && !queue) continue;
    const red = med >= 90 || oldest >= 16;
    if (red) hasRed = true;
    const parts: string[] = [];
    if (queue) parts.push(`대기 ${w}건(최장 영업 ${Math.round(oldest)}시간)`);
    if (slow) parts.push(`첫 응답 ${med}분`);
    lines.push(`${red ? '🔴' : '🟠'} *${s.channel}* ${slow ? '응답 지연' : '대기 누적'} · ${parts.join(', ')} → 오전 중 우선 처리`);
  }

  // 카테고리 급증. "평소보다 N배" 결론만(평균·배수 원값 노출 금지)
  for (const s of spikes) {
    const bd = (s.channel_breakdown as any[]) || [];
    const total = bd.reduce((a, b) => a + num(b.cnt), 0);
    const top = bd[0];
    const share = top && total ? pct(num(top.cnt), total) : 0;
    const hint = CATEGORY_HINT[s.category] || '관련 업무';
    const mult = Math.max(2, Math.round(num(s.ratio) || 2));
    const tail = top && share >= 50 ? `${top.channel} ${hint} 확인` : '이벤트·공지 영향 확인';
    lines.push(`🔴 *${s.category}* 문의 급증 · 오늘 ${s.cnt}건, 평소보다 ${mult}배 → ${tail}`);
  }

  for (const c of sentTrend) {
    if (!c.worsening) continue;
    lines.push(`🟠 *${c.channel} 감정 악화* · 부정 ${c.prev_rate}%→${c.cur_rate}% → 상담 내용 점검`);
  }

  return { lines, hasRed };
}

// 채널별 통합 블록: 상태·대기·문의 Top·감정·추세를 한 덩어리로
function channelBlock(label: string, coll: any, ana: any, s: any, tr: any): any {
  const hEmo = coll ? (HEMOJI[coll.health] || '⚪') : '⚪';
  const avg = coll?.avg_per_day ?? ana?.avg_per_day_30d ?? '?';
  const low = Number(avg) < 1 ? ' · 저트래픽' : '';
  const line1 = `${hEmo} *${label}*  ·  하루 ${avg}건${low}`;

  const w = num(s?.waiting);
  const wait = w > 0 ? `대기 *${w}건* (최장 영업 ${Math.round(num(s.oldest_wait_h))}시간)` : '대기 *0건*';
  const frt = num(s?.answered_n) >= 5 ? ` · 첫 응답 *${s.median_first_response_min}분*` : '';
  const line2 = `　⤷ ${wait}${frt}`;

  const chats = num(ana?.chats);
  const tops = ((ana?.top_categories as any[]) || []).slice(0, 2).map((t) => `${t.category} ${pct(num(t.cnt), chats)}%`).join(' · ') || '분류 없음';
  const sTot = num(ana?.sentiment?.total);
  const sen = sTot > 0 ? `부정 *${pct(num(ana.sentiment.neg), sTot)}%*` : '표본 부족';
  const line3 = `　⤷ 문의 ${tops}  ·  감정 ${sen}`;

  const rising = (tr?.rising as any[]) || [];
  const line4 = rising.length ? `　⤷ 📈 ${rising.map((r) => `${r.category} ${r.prev}→${r.cur}`).join(' · ')}` : '';

  return { type: 'section', text: { type: 'mrkdwn', text: [line1, line2, line3, line4].filter(Boolean).join('\n') } };
}

function buildBlocks(summary: any, analysis: any[], spikes: any[], sla: any[], trend: any[], sentTrend: any[], yesterday: any | null): { blocks: any[]; fallback: string } {
  const dateShort = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
  const channels = (summary?.channels ?? []) as any[];
  const cls = summary?.classify ?? {};
  const sen = summary?.sentiment ?? {};

  const { lines: actions, hasRed } = buildActions(channels, sla, spikes, sentTrend);
  const worseningN = sentTrend.filter((c) => c.worsening).length;

  const totalWaiting = sla.reduce((a, s) => a + num(s.waiting), 0);
  const collBad = channels.some((c) => c.health !== 'ok');
  const emo = hasRed ? '🔴' : actions.length ? '🟠' : '🟢';
  const label = hasRed ? '조치 필요' : actions.length ? '주의' : '정상';
  const statusText = `${emo} *${label}*   ·   대기 ${totalWaiting}명   ·   이상 ${spikes.length + worseningN}건   ·   수집 ${collBad ? '점검' : '정상'}`;

  const actionText = actions.length ? actions.map((a) => `• ${a}`).join('\n') : '🟢 특이사항 없음 (급증·감정 악화·장기 지연 없음)';

  const order = [...analysis].sort((a, b) => num(b.chats) - num(a.chats)).map((c) => c.channel);
  for (const c of ['시대인재C', '마이클래스', '라이브']) if (!order.includes(c)) order.push(c);
  const find = (arr: any[], k: string) => arr.find((x) => x.channel === k);
  const channelBlocks = order.map((lb) => channelBlock(lb, find(channels, lb), find(analysis, lb), find(sla, lb), find(trend, lb)));

  const sentTotal = num(sen.total_user_msgs), sentDone = num(sen.done);
  let yestStr = '';
  if (yesterday) {
    const rq = num(cls.review_queue) - num((yesterday.classify ?? {}).review_queue);
    const sd = sentDone - num((yesterday.sentiment ?? {}).done);
    yestStr = `   ·   어제比 재검토 ${fmtDelta(rq)}, 감정 ${fmtDelta(sd)}`;
  }
  const alerts = (summary?.active_alerts ?? []) as string[];
  const alertStr = alerts.length ? `   ·   ⚠️ ${alerts.map(friendlyAlert).join(', ')}` : '';
  const metaText = `미분류 ${cls.unclassified ?? '?'} · 재검토큐 ${cls.review_queue ?? '?'} · 감정분석 ${pct(sentDone, sentTotal)}% (${sentDone.toLocaleString()}/${sentTotal.toLocaleString()})${yestStr}${alertStr}`;

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📅 카카오 상담 요약 · ${dateShort}`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: statusText } },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `*⚡ 오늘 볼 것*\n${actionText}` } },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: '*📊 채널별 현황 (최근 7일)*' } },
    ...channelBlocks,
    { type: 'divider' },
    { type: 'context', elements: [{ type: 'mrkdwn', text: metaText }] },
  ];

  const fallback = `카카오 상담 요약 ${dateShort} · ${label} · 대기 ${totalWaiting}명 · 이상 ${spikes.length + worseningN}건`;
  return { blocks, fallback };
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
  const { data: analysisRaw, error: aErr } = await supabase.rpc('kakao_channel_analysis', { window_days: 7 });
  if (aErr) log('channel analysis rpc fail:', aErr.message);
  const { data: spikeRaw, error: sErr } = await supabase.rpc('kakao_category_spike', { min_ratio: 2.0, min_count: 5 });
  if (sErr) log('spike rpc fail:', sErr.message);
  const { data: slaRaw, error: slErr } = await supabase.rpc('kakao_sla_status');
  if (slErr) log('sla rpc fail:', slErr.message);
  const { data: trendRaw, error: tErr } = await supabase.rpc('kakao_weekly_trend', { min_count: 3 });
  if (tErr) log('weekly trend rpc fail:', tErr.message);
  const { data: sentTrendRaw, error: stErr } = await supabase.rpc('kakao_sentiment_trend', { min_samples: 30 });
  if (stErr) log('sentiment trend rpc fail:', stErr.message);

  const analysis = (analysisRaw as any[]) || [];
  const spikes = (spikeRaw as any[]) || [];
  const sla = (slaRaw as any[]) || [];
  const trend = (trendRaw as any[]) || [];
  const sentTrend = (sentTrendRaw as any[]) || [];

  const snapshotDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const yesterdayDate = new Date(new Date(snapshotDate + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
  const { data: ySnap } = await supabase
    .from('kakao_partner_daily_snapshot')
    .select('summary')
    .eq('snapshot_date', yesterdayDate)
    .maybeSingle();

  const { blocks, fallback } = buildBlocks(summary, analysis, spikes, sla, trend, sentTrend, (ySnap as any)?.summary ?? null);
  const sent = await sendSlack(fallback, blocks);

  const { error: snapErr } = await supabase.from('kakao_partner_daily_snapshot').upsert(
    { snapshot_date: snapshotDate, summary: { ...summary, channel_analysis: analysis, spikes, sla, weekly_trend: trend, sentiment_trend: sentTrend } },
    { onConflict: 'snapshot_date' },
  );
  if (snapErr) log('snapshot save fail:', snapErr.message);

  log('daily summary done', JSON.stringify({ sent, slack_configured: !!SLACK_WEBHOOK_URL, snapshot_saved: !snapErr }));
  return json({ sent, slack_configured: !!SLACK_WEBHOOK_URL, snapshot_saved: !snapErr, at: new Date().toISOString() });
});

async function sendSlack(fallback: string, blocks: unknown[]): Promise<boolean> {
  if (!SLACK_WEBHOOK_URL) {
    log('[daily-summary] SLACK_WEBHOOK_URL 미설정, 로그만:\n' + fallback);
    return false;
  }
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: fallback, blocks }),
  });
  if (!res.ok) {
    log('[daily-summary] slack post fail:', res.status, await res.text().catch(() => ''));
    return false;
  }
  return true;
}

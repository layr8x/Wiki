// supabase/functions/kakao-daily-summary/index.ts
// 카카오 상담 파이프라인 일일 요약 (채널별 분석 + 이상 징후 진단형). pg_cron 매일 09:00 KST.
//
// 왜(고도화 배경): 초기 요약은 3채널을 뭉뚱그린 전체 수치만 줘서, 어느 채널에 무슨 문제가
//   생기는지·왜 그런지·무엇을 할지를 유추할 수 없었다. 이 버전은 (1) 수집 상태를 채널별 평소
//   유입량 기준으로 정확히 판정하고, (2) 채널별 최근 7일 문의 Top·감정을 구분해 보여주고,
//   (3) 급증·부정감정 상승 같은 이상 징후를 채널과 함께 짚어 "문제 예측·원인·조치"가 가능하게 한다.
//
// 인증: kakao_partner_secrets.key='kakao_daily_summary_token'. 배포: --no-verify-jwt.
// 데이터: kakao_status_summary(운영상태+채널헬스) · kakao_channel_analysis(채널별 7일) ·
//   kakao_category_spike(급증). 이력: kakao_partner_daily_snapshot(어제 대비 + 추세 보관).
// Slack: SLACK_WEBHOOK_URL 미설정 시 로그만.

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
function fmtDelta(n: number): string {
  if (n > 0) return `+${n.toLocaleString()}`;
  if (n < 0) return `${n.toLocaleString()}`;
  return '변화 없음';
}

// 진행 중인 알림 키를 사람이 읽는 문구로.
const CHANNEL_BY_PID: Record<string, string> = { _xfxilXn: '시대인재C', _TkpPG: '라이브', _VGAQn: '마이클래스' };
function friendlyAlert(key: string): string {
  if (key.startsWith('health:')) return `${CHANNEL_BY_PID[key.slice('health:'.length)] || key.slice(7)} 수집 상태`;
  if (key.startsWith('spike:')) return `${key.slice('spike:'.length)} 문의 급증`;
  if (key.startsWith('milestone:')) return '재분류 완료';
  return key;
}

// ── 수집 상태(채널별, 원인 반영) ──
function collectionLines(channels: any[]): string {
  const emoji: Record<string, string> = { ok: '🟢', warning: '🟠', critical: '🔴' };
  return channels
    .map((c) => {
      const head = `${emoji[c.health] ?? '⚪'} ${c.channel} · 마지막 ${c.hrs_since_msg ?? '?'}시간 전`;
      const lowTraffic = Number(c.avg_per_day) < 1 ? ' 저트래픽' : '';
      if (c.health === 'ok') return `${head} (평소 하루 ${c.avg_per_day}건${lowTraffic}, 정상)`;
      if (c.health_reason === 'auth') return `${head} (수집 중단: 쿠키 만료, 재발급 필요)`;
      if (c.health_reason === 'heartbeat') return `${head} (수집기 지연, 함수·스케줄러 점검)`;
      return `${head} (유입 뜸함, 평소 ${c.avg_per_day}건·임계 ${c.gap_threshold_h}h. 쿠키 문제 아님)`;
    })
    .join('\n');
}

// ── 채널별 분석(최근 7일): 문의 Top3 + 부정 감정률 ──
function channelSection(analysis: any[]): string {
  if (!analysis.length) return '(채널 분석 데이터 없음)';
  return analysis
    .map((c) => {
      const chats = Number(c.chats || 0);
      const low = Number(c.avg_per_day_30d) < 1 ? ' (저트래픽)' : '';
      const tops = (c.top_categories as any[]) || [];
      const topLine = tops.length
        ? tops.map((t) => `${t.category} ${t.cnt}(${pct(Number(t.cnt), chats)}%)`).join(' · ')
        : '(분류된 문의 없음)';
      const s = c.sentiment || {};
      const sTotal = Number(s.total || 0);
      const senLine =
        sTotal > 0 ? `감정: 부정 ${s.neg} / ${sTotal} (${pct(Number(s.neg), sTotal)}%)` : '감정: 표본 부족';
      return `🔸 ${c.channel} · ${chats}건${low}\n   문의 Top: ${topLine}\n   ${senLine}`;
    })
    .join('\n');
}

// ── 이상 징후(문제 예측): 급증 채널 분해 + 부정감정 상승 채널 ──
const CATEGORY_HINT: Record<string, string> = {
  '환불': '결제·환불',
  '미납·결제': '결제·수납',
  '계정·로그인·앱': '앱 로그인/인증',
  '교재·배송': '교재 배송',
  '라이브': '라이브 송출',
};
function anomalySection(spikes: any[], analysis: any[]): string {
  const lines: string[] = [];

  for (const s of spikes) {
    const bd = (s.channel_breakdown as any[]) || [];
    const dist = bd.map((b) => `${b.channel} ${b.cnt}`).join(' · ') || '채널 정보 없음';
    const top = bd[0];
    const total = bd.reduce((a: number, b: any) => a + Number(b.cnt || 0), 0);
    const share = top && total ? pct(Number(top.cnt), total) : 0;
    const hint = CATEGORY_HINT[s.category] || '관련 업무';
    const tail = top && share >= 50 ? `${top.channel} ${hint} 우선 점검` : '전 채널 분산(정책·이벤트 확인)';
    lines.push(`🟠 ${s.category} 급증: 오늘 ${s.cnt}건(평소 ${s.baseline_7d}, ×${s.ratio}) · ${dist} → ${tail}`);
  }

  // 부정 감정 비율이 눈에 띄게 높은 채널(표본 20건 이상, 8% 초과) 사전 경고.
  for (const c of analysis) {
    const s = c.sentiment || {};
    const t = Number(s.total || 0);
    if (t >= 20 && pct(Number(s.neg), t) > 8) {
      lines.push(`🟠 ${c.channel} 부정 감정 비율 높음: ${s.neg}/${t} (${pct(Number(s.neg), t)}%) → 최근 문의 내용 점검 권장`);
    }
  }

  return lines.length ? lines.join('\n') : '특이사항 없음 (급증·부정감정 상승 채널 없음)';
}

function formatDaily(summary: any, analysis: any[], spikes: any[], yesterday: any | null): string {
  const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
  const cls = summary?.classify ?? {};
  const sen = summary?.sentiment ?? {};
  const sentTotal = Number(sen.total_user_msgs || 0);
  const sentDone = Number(sen.done || 0);
  const alerts = (summary?.active_alerts ?? []) as string[];

  let delta = '';
  if (yesterday) {
    const yCls = yesterday.classify ?? {};
    const ySen = yesterday.sentiment ?? {};
    const rq = Number(cls.review_queue ?? 0) - Number(yCls.review_queue ?? 0);
    const sd = sentDone - Number(ySen.done ?? 0);
    delta =
      `\n*어제 대비*\n` +
      `재검토 큐: ${fmtDelta(rq)}건 (어제 ${yCls.review_queue ?? '?'} → 오늘 ${cls.review_queue ?? '?'})\n` +
      `감정분석 처리: ${fmtDelta(sd)}건`;
  } else {
    delta = `\n*어제 대비*\n(어제 기록 없음, 내일부터 비교 표시)`;
  }

  const alertLine = alerts.length
    ? `⚠️ 진행 중인 알림: ${alerts.map(friendlyAlert).join(', ')}`
    : '✅ 진행 중인 알림 없음';

  return [
    `📅 *카카오 상담 파이프라인 일일 요약* · ${today}`,
    ``,
    `*수집 (채널별 상태)*`,
    collectionLines((summary?.channels ?? []) as any[]),
    ``,
    `*분류·감정 진행*`,
    `미분류 ${cls.unclassified ?? '?'}건 · 레거시 '기타' 재검토 큐 ${(cls.review_queue ?? 0).toLocaleString?.() ?? cls.review_queue}건`,
    `감정분석 ${sentDone.toLocaleString()} / ${sentTotal.toLocaleString()}건 (${pct(sentDone, sentTotal)}%)`,
    ``,
    `*채널별 분석 (최근 7일)*`,
    channelSection(analysis),
    ``,
    `*이상 징후 / 주의*`,
    anomalySection(spikes, analysis),
    delta,
    ``,
    alertLine,
  ].join('\n');
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

  const analysis = (analysisRaw as any[]) || [];
  const spikes = (spikeRaw as any[]) || [];

  // 어제 스냅샷(어제 대비용)
  const snapshotDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const yesterdayDate = new Date(new Date(snapshotDate + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
  const { data: ySnap } = await supabase
    .from('kakao_partner_daily_snapshot')
    .select('summary')
    .eq('snapshot_date', yesterdayDate)
    .maybeSingle();

  const text = formatDaily(summary, analysis, spikes, (ySnap as any)?.summary ?? null);
  const sent = await sendSlack(text);

  // 이력 저장(어제 대비 + 채널별 추세 보관)
  const { error: snapErr } = await supabase.from('kakao_partner_daily_snapshot').upsert(
    { snapshot_date: snapshotDate, summary: { ...summary, channel_analysis: analysis, spikes } },
    { onConflict: 'snapshot_date' },
  );
  if (snapErr) log('snapshot save fail:', snapErr.message);

  log('daily summary done', JSON.stringify({ sent, slack_configured: !!SLACK_WEBHOOK_URL, snapshot_saved: !snapErr }));
  return json({ sent, slack_configured: !!SLACK_WEBHOOK_URL, snapshot_saved: !snapErr, at: new Date().toISOString() });
});

async function sendSlack(text: string): Promise<boolean> {
  if (!SLACK_WEBHOOK_URL) {
    log('[daily-summary] SLACK_WEBHOOK_URL 미설정, 로그만:\n' + text);
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

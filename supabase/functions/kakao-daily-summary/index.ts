// supabase/functions/kakao-daily-summary/index.ts
// 카카오 상담 파이프라인 상태를 매일 정해진 시각에 Slack으로 자동 발송.
//
// 왜: kakao-status(슬래시 명령 /카카오상태)는 새 "Commands" 권한이 필요해 워크스페이스
//   관리자 승인이 있어야 켤 수 있었다(승인 대기·거절 가능성 있음). 반면 이미 kakao-alert가
//   쓰고 있는 SLACK_WEBHOOK_URL(수신 웹훅)은 추가 권한·승인 없이 이미 열려 있는 경로다.
//   그래서 "물어보면 답한다" 대신 "매일 정해진 시각에 알아서 올라온다" 방식으로 같은 정보를
//   제공한다 — 관리자 승인 불필요, 지금 바로 동작.
//
// 동작: pg_cron 이 매일 1회(기본 09:00 KST = 00:00 UTC) 호출 → kakao_status_summary() RPC
//   조회 → SLACK_WEBHOOK_URL 로 직접 POST. SLACK_WEBHOOK_URL 미설정 시 로그만 남기고 스킵
//   (kakao-collect 의 "시크릿 없으면 skip" 관례와 동일).
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

function formatDailySummary(summary: any): string {
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
    `*감정분석*`,
    `${sentDone.toLocaleString()} / ${sentTotal.toLocaleString()}건 처리 (${sentPct}%)`,
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

  const text = formatDailySummary(summary);
  const sent = await sendSlack(text);
  log('daily summary done', JSON.stringify({ sent, slack_configured: !!SLACK_WEBHOOK_URL }));
  return json({ sent, slack_configured: !!SLACK_WEBHOOK_URL, at: new Date().toISOString() });
});

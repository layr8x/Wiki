// supabase/functions/kakao-status/index.ts
// 카카오 상담 파이프라인 상태를 Slack 슬래시 명령(예: /카카오상태)으로 즉시 조회.
//
// 왜: kakao-alert(이상 있을 때만 알림)와 별개로, "지금 당장 상태가 어떤지" 사람이 원할 때
//   바로 물어볼 수 있는 경로가 없었다. Supabase 대시보드를 열지 않아도 Slack에서 명령어
//   한 줄로 수집·분류·감정분석·진행 중인 알림을 한눈에 볼 수 있게 한다.
//
// 동작: Slack 이 슬래시 명령을 이 함수의 URL로 POST(application/x-www-form-urlencoded)
//   → kakao_status_summary() RPC 로 현재 상태 조회 → 3초 안에 Slack 메시지 포맷으로 응답.
//   (동기 응답이라 별도 Slack API 호출/봇 토큰이 필요 없음 — 응답 JSON 을 그대로 반환.)
//
// 인증: kakao-collect 와 동일 패턴이나, 사람이 Slack 앱 설정 화면에 Request URL 을 직접
//   붙여넣어야 하므로 쿼리스트링에 토큰을 그대로 포함한 URL 을 사용한다
//   (kakao_partner_secrets.key='kakao_status_token').
// 배포: supabase functions deploy kakao-status --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const HEALTH_EMOJI: Record<string, string> = { ok: '🟢', warning: '🟠', critical: '🔴' };

function formatStatus(summary: any, requestedBy: string | null): string {
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

  const askedBy = requestedBy ? `요청: <@${requestedBy}>\n` : '';

  return [
    `📊 *카카오 상담 파이프라인 상태* (실시간)`,
    askedBy.trim(),
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
  ]
    .filter((l) => l !== '')
    .join('\n');
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const { data: secret } = await supabase
    .from('kakao_partner_secrets')
    .select('value')
    .eq('key', 'kakao_status_token')
    .maybeSingle();
  if (!secret?.value || token !== secret.value) return json({ error: 'unauthorized' }, 401);

  let userId: string | null = null;
  try {
    if (req.method === 'POST') {
      const form = await req.formData();
      userId = (form.get('user_id') as string) || null;
    }
  } catch (e) {
    log('form parse fail (non-Slack test call?):', (e as Error).message);
  }

  const { data: summary, error } = await supabase.rpc('kakao_status_summary');
  if (error) {
    log('status rpc fail:', error.message);
    return json({ response_type: 'ephemeral', text: `상태 조회 실패: ${error.message}` });
  }

  const text = formatStatus(summary, userId);
  log('status served', JSON.stringify({ userId }));
  return json({ response_type: 'in_channel', text });
});

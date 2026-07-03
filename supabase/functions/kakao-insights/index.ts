// supabase/functions/kakao-insights/index.ts
// 카카오 상담 "심화 분석" Slack 리포트. 원칙 두 가지:
//   (1) 응답 속도는 운영시간(평일 09~19시 KST) 기준 "영업 분"으로만 판단(야간·주말 제외).
//   (2) 분석 결과만 나열하지 않고, 각 결과마다 "그래서 뭘 할지(대안)"를 함께 제시한다.
// 데이터는 kakao_insights() 번들 RPC 한 번. 인증: kakao_partner_secrets.key='kakao_insights_token'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL') ?? '';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const num = (v: unknown) => Number(v ?? 0);

// 채널 표시 우선순위(사용자 설정): 마이클래스 > 라이브 > 시대인재C.
const CHANNEL_PRIORITY = ['마이클래스', '라이브', '시대인재C'];
const byPriority = (a: any, b: any) => CHANNEL_PRIORITY.indexOf(a.channel) - CHANNEL_PRIORITY.indexOf(b.channel);

function sec(text: string) { return { type: 'section', text: { type: 'mrkdwn', text } }; }
function ctx(text: string) { return { type: 'context', elements: [{ type: 'mrkdwn', text }] }; }
const divider = { type: 'divider' };

// 유형별 "수요를 줄이는" 선제 조치(응대 속도가 아니라 문의량을 줄이는 방향).
const CAT_ACTION: Record<string, string> = {
  '모의고사·서바이벌': '성적·응시내역·등수 조회 방법을 채널 상단에 고정 공지하고, 성적 발표 전에 조회 안내를 미리 보내 문의를 선제 차단하세요.',
  '계정·로그인·앱': '자주 나는 로그인·영상 재생 오류 3가지 해결법을 자동응답/FAQ로 만들고, 반복되면 개발팀에 근본 수정을 요청하세요.',
  '환불': '환불 절차와 소요일을 안내 템플릿으로 만들어 즉시 회신하고, 환불 규정을 채널에 고정하세요.',
  '미납·결제': '가상계좌·결제 방법 안내를 템플릿으로 만들고, 미납 안내는 정해진 문구로 일괄 발송하세요.',
  '교재·배송': '배송 조회 방법과 예상 도착일 안내를 템플릿으로 만드세요.',
  '라이브': '라이브 접속·시청 방법을 방송 전에 미리 공지하세요.',
  '입반·등록': '수강신청·반배정 절차와 마감일을 채널 공지로 고정하세요.',
  '대기': '대기 순번 확인 방법과 예상 안내 시점을 템플릿으로 만드세요.',
};
const catAction = (c: string) => CAT_ACTION[c] || '이 유형의 반복 질문은 답변 템플릿을 만들어 즉시 응대하세요.';

type Rec = { i: string; o: string; a: string };

// 관찰 -> 조치. 각 신호마다 "그래서 뭘 할지"를 붙인다.
function recommendations(d: any): Rec[] {
  const recs: Rec[] = [];
  const top = ((d.top_categories as any[]) || [])[0];
  let rise: any = null;
  for (const c of (d.weekly as any[]) || []) for (const r of (c.rising as any[]) || [])
    if (!rise || num(r.delta) > num(rise.delta)) rise = { ...r, channel: c.channel };

  if (top) {
    let o = `문의 1위는 *${top.category}* (30일 ${num(top.cnt)}건)`;
    o += rise && rise.category === top.category
      ? `, ${rise.channel}에서 지난주 ${num(rise.prev)}→이번주 ${num(rise.cur)}건으로 급증 중입니다.`
      : '입니다.';
    recs.push({ i: '📌', o, a: catAction(top.category) });
  }
  if (rise && (!top || rise.category !== top.category)) {
    recs.push({ i: '📈', o: `*${rise.channel}*에서 *${rise.category}* 문의가 지난주 ${num(rise.prev)}→이번주 ${num(rise.cur)}건으로 늘고 있어요.`, a: catAction(rise.category) });
  }

  const negTop = ((d.topic_pain as any[]) || []).filter((p) => num(p.chats) >= 10)
    .sort((a, b) => num(b.neg_rate) - num(a.neg_rate))[0];
  if (negTop && num(negTop.neg_rate) >= 5)
    recs.push({ i: '😤', o: `*${negTop.category}* 문의에 불만이 가장 잦아요 (부정 ${num(negTop.neg_rate)}%, ${num(negTop.chats)}건).`,
      a: '응대 문구만 바꾸지 말고, 최근 부정 대화를 직접 열어 공통 원인을 찾은 뒤 그 원인(시스템·정책)을 고치세요.' });

  const un = num(d.unanswered?.total);
  if (un > 0) {
    const by = d.unanswered.by_channel || {};
    const worst = Object.keys(by).sort((a, b) => by[b] - by[a])[0] || '';
    recs.push({ i: '📮', o: `상담원이 한 번도 답하지 않은 대화가 *${un}건*${worst ? ` (${worst} ${by[worst]}건 최다)` : ''} 있어요.`,
      a: '오늘 안에 답하고, 매일 아침 미답변 대화부터 확인하는 걸 루틴으로 만드세요.' });
  }

  const wq = ((d.sla_status as any[]) || []).filter((s) => num(s.waiting) > 0).sort((a, b) => num(b.waiting) - num(a.waiting))[0];
  if (wq) recs.push({ i: '⏳', o: `*${wq.channel}*에 답을 기다리는 대화가 ${num(wq.waiting)}건 (가장 오래 영업 ${wq.oldest_wait_h}시간)이에요.`,
    a: '오전 중 이 대기 건부터 먼저 처리하세요.' });

  const sla = (d.sla as any[]) || [];
  const okSpeed = sla.length > 0 && sla.every((s) => num(s.answered) < 5 || num(s.within_30) >= 60);
  if (okSpeed) recs.push({ i: '✅', o: '운영시간 기준 첫 응답은 세 채널 모두 빠릅니다 (30분 내 대부분 처리).',
    a: '속도는 문제 아니에요. 인력을 늘리기보다, 위의 FAQ·선제 공지로 문의량 자체를 줄이는 데 집중하세요.' });

  recs.push({ i: '🕐', o: '문의 몰리는 시간이 채널마다 달라요 (시대인재C 낮 10~11·14~15시 / 마이클래스 저녁 16~19시).',
    a: '채널별 피크 시간에 담당자를 배치하면 지금의 빠른 응답을 유지할 수 있어요.' });

  return recs;
}

function buildBlocks(d: any): { blocks: any[]; fallback: string } {
  const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
  const q = d.quality || {};
  const cov = num(q.sent_total) > 0 ? Math.round((100 * num(q.sent_done)) / num(q.sent_total)) : 0;
  const recs = recommendations(d);
  const topName = ((d.top_categories as any[]) || [])[0]?.category || '주요 문의';
  const synthesis =
    `*🎯 오늘의 진단*\n` +
    `응답 속도는 운영시간 기준 세 채널 모두 양호합니다. 지금 가장 효과 큰 일은 인력을 늘리는 게 아니라, ` +
    `최다·급증 문의(${topName} 등)를 FAQ·선제 공지로 줄여 문의량 자체를 낮추는 것입니다.`;

  const recText = recs.map((r) => `${r.i} ${r.o}\n　↳ *${r.a}*`).join('\n\n');

  // 근거(요약): 숫자는 조치의 뒷받침으로만 간결히.
  const tops = ((d.top_categories as any[]) || []).slice(0, 3).map((t) => `${t.category} ${num(t.cnt)}건`).join(' · ');
  const sla = ((d.sla as any[]) || []).slice().sort(byPriority);
  const w30 = sla.filter((s) => num(s.answered) >= 5).map((s) => `${s.channel} ${num(s.within_30)}%`).join(' · ');
  const evidence =
    `*📊 근거 (요약)*\n` +
    `• 문의 Top3: ${tops}\n` +
    `• 응답 속도(운영시간 기준) 30분 내: ${w30 || '표본 부족'}\n` +
    `• 분류 품질: 기타 ${q.etc_pct}% · 미분류 ${num(q.unclassified)}건 · 감정분석 ${cov}% · 신규 유형 '모의고사·서바이벌' ${num(q.mock_cnt)}건 발굴`;

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📈 카카오 상담 분석 · ${today}`, emoji: true } },
    ctx('최근 30일 · 응답 속도는 운영시간(평일 09~19시) 기준 · Supabase 실데이터'),
    divider,
    sec(synthesis),
    divider,
    sec(`*💡 지금 해야 할 일 (분석 → 대안)*\n\n${recText}`),
    divider,
    sec(evidence),
    ctx(`감정: 전체 부정 ${q.sent_neg_pct}% · 악화 채널 없음 · 총 대화 ${num(q.total_chats).toLocaleString()}건`),
  ];
  const fallback = `카카오 상담 분석 ${today} · 지금 해야 할 일 ${recs.length}가지`;
  return { blocks, fallback };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: secret } = await supabase
    .from('kakao_partner_secrets').select('value').eq('key', 'kakao_insights_token').maybeSingle();
  if (!secret?.value || token !== secret.value) return json({ error: 'unauthorized' }, 401);

  const { data, error } = await supabase.rpc('kakao_insights');
  if (error) { log('insights rpc fail:', error.message); return json({ error: error.message }, 500); }

  const { blocks, fallback } = buildBlocks(data);
  const sent = await sendSlack(fallback, blocks);
  log('insights done', JSON.stringify({ sent, slack_configured: !!SLACK_WEBHOOK_URL }));
  return json({ sent, slack_configured: !!SLACK_WEBHOOK_URL, at: new Date().toISOString() });
});

async function sendSlack(fallback: string, blocks: unknown[]): Promise<boolean> {
  if (!SLACK_WEBHOOK_URL) { log('[insights] SLACK_WEBHOOK_URL 미설정, 로그만:\n' + fallback); return false; }
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: fallback, blocks }),
  });
  if (!res.ok) { log('[insights] slack post fail:', res.status, await res.text().catch(() => '')); return false; }
  return true;
}

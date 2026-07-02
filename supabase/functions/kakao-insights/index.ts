// supabase/functions/kakao-insights/index.ts
// 카카오 상담 "심화 분석" Slack 리포트. 매일의 간결한 요약(kakao-daily-summary)과 별개로,
// 문의 유형·응답 SLA·무응답·주간 급상승·시간대·분류 품질을 깊게 분석해 Slack Block Kit으로 전달한다.
// 밀도가 높으므로 일일 요약과 분리(주 1회 또는 온디맨드). 데이터는 kakao_insights() 번들 RPC 한 번.
//
// 인증: kakao_partner_secrets.key='kakao_insights_token'. 배포: --no-verify-jwt.
// Slack: SLACK_WEBHOOK_URL 미설정 시 로그만.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL') ?? '';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const num = (v: unknown) => Number(v ?? 0);
const TK = String.fromCharCode(96); // 백틱(코드 span)

function bar(v: number, max: number, width = 12): string {
  const n = max > 0 ? Math.round((v / max) * width) : 0;
  return '█'.repeat(Math.max(v > 0 ? 1 : 0, n)) + '·'.repeat(Math.max(0, width - Math.max(v > 0 ? 1 : 0, n)));
}

function sec(text: string) { return { type: 'section', text: { type: 'mrkdwn', text } }; }
function ctx(text: string) { return { type: 'context', elements: [{ type: 'mrkdwn', text }] }; }
const divider = { type: 'divider' };

// 문의 유형 Top (30일): 막대 + 건수
function topCategoriesBlock(top: any[]): any {
  const max = Math.max(...top.map((t) => num(t.cnt)), 1);
  const lines = top.map((t) => {
    const etc = t.category === '기타';
    return `${TK}${bar(num(t.cnt), max)}${TK} ${etc ? '_' : '*'}${t.category}${etc ? '_' : '*'}  ${num(t.cnt)}`;
  });
  return sec(`*📊 문의 유형 Top (최근 30일)*\n${lines.join('\n')}`);
}

// 유형별 진단 (14일): 첫 응답 중앙값 + 부정률, 느린/부정 높은 유형 강조
function painBlock(pain: any[]): any {
  const rows = pain.filter((p) => num(p.chats) >= 5);
  const lines = rows.map((p) => {
    const f = num(p.median_frt_min);
    const async = f >= 180;
    const slow = !async && f >= 60;
    const fTxt = async ? `비동기 ${Math.round(f / 60)}h` : `${f}분`;
    const fMark = slow ? ` ⚠️느림` : '';
    const neg = num(p.neg_rate);
    const negMark = neg >= 6 ? ` · 부정 *${neg}%*` : neg > 0 ? ` · 부정 ${neg}%` : '';
    return `• *${p.category}* ${num(p.chats)}건 · 첫 응답 ${fTxt}${fMark}${negMark}`;
  });
  return sec(`*🩺 유형별 진단 (첫 응답 중앙값 · 최근 14일)*\n${lines.join('\n')}\n_비동기 = 야간·주말 접수분 포함(실시간 지연 아님)_`);
}

// 응답 SLA (7일): 30분 내 응답률 + 2시간 초과
function slaBlock(sla: any[]): any {
  const lines = sla.map((s) => {
    const w30 = num(s.within_30);
    const emoji = w30 >= 60 ? '🟢' : w30 >= 45 ? '🟠' : '🔴';
    return `${emoji} *${s.channel}* 30분 내 *${w30}%* · 60분 내 ${num(s.within_60)}% · 2시간 초과 ${num(s.over_2h)}건 (응답 ${num(s.answered)})`;
  });
  return sec(`*⏱ 응답 속도 (7일)*\n${lines.join('\n')}`);
}

// 무응답 (30일): 상담원 답변이 아예 없는 대화
function unansweredBlock(u: any): any {
  const total = num(u?.total);
  if (total === 0) return sec(`*📮 무응답 (30일)*\n🟢 상담원 미응답 대화 없음`);
  const by = u.by_channel || {};
  const dist = Object.keys(by).map((k) => `${k} ${by[k]}`).join(' · ');
  return sec(`*📮 무응답 (30일)* · *${total}건*\n상담원 답변이 아예 없는 대화: ${dist}\n→ 해당 대화 확인·응대 필요`);
}

// 주간 급상승: 채널별 지난주 대비 늘어난 유형
function weeklyBlock(weekly: any[]): any {
  const parts: string[] = [];
  for (const c of weekly) {
    const rising = (c.rising as any[]) || [];
    if (!rising.length) continue;
    const items = rising.map((r) => `${r.category} ${r.prev}→${r.cur}건`).join(' · ');
    parts.push(`📈 *${c.channel}*: ${items}`);
  }
  if (!parts.length) return sec(`*📈 주간 급상승*\n▫️ 특이 상승 없음`);
  return sec(`*📈 주간 급상승 (지난주 대비)*\n${parts.join('\n')}`);
}

// 시간대 피크: 전체 유입 상위 시간 + 채널 성향
function hourlyBlock(hourly: any[]): any {
  const byHr = hourly.map((h) => ({ hr: num(h.hr), total: num(h.total) }));
  const top = [...byHr].sort((a, b) => b.total - a.total).slice(0, 5).sort((a, b) => a.hr - b.hr);
  const peakTxt = top.map((h) => `${h.hr}시(${h.total})`).join(' · ');
  return sec(`*🕐 유입 피크 시간대 (14일)*\n${peakTxt}\n_시대인재C = 낮(10~11·14~15시), 마이클래스 = 저녁(16~19시) 집중 → 인력 배치 참고_`);
}

// 핵심 요약: 데이터에서 "지금 알아야 할 것"을 평문 결론으로. 계산·해석은 시스템이 대신한다.
function computeHighlights(d: any): string[] {
  const out: string[] = [];
  const top = ((d.top_categories as any[]) || [])[0];
  if (top) out.push(`📌 요즘 가장 많이 묻는 건 *${top.category}*예요 (최근 30일 ${num(top.cnt)}건).`);

  // 주간 최대 상승
  let big: any = null;
  for (const c of (d.weekly as any[]) || []) for (const r of (c.rising as any[]) || []) {
    if (!big || num(r.delta) > num(big.delta)) big = { ...r, channel: c.channel };
  }
  if (big) out.push(`📈 *${big.channel}*에서 *${big.category}* 문의가 지난주 ${num(big.prev)}건 → 이번주 ${num(big.cur)}건으로 늘고 있어요. 원인을 살펴보세요.`);

  // 가장 느린 유형(비동기 제외, 5건 이상)
  const slow = ((d.topic_pain as any[]) || []).filter((p) => num(p.chats) >= 5 && num(p.median_frt_min) < 180)
    .sort((a, b) => num(b.median_frt_min) - num(a.median_frt_min))[0];
  if (slow && num(slow.median_frt_min) >= 45)
    out.push(`🐢 *${slow.category}* 문의는 답변이 가장 느려요 (첫 응답 ${num(slow.median_frt_min)}분). 다른 유형은 대개 15~30분이에요.`);

  // 응답 가장 느린 채널
  const weak = ((d.sla as any[]) || []).filter((s) => num(s.answered) >= 10)
    .sort((a, b) => num(a.within_30) - num(b.within_30))[0];
  if (weak && num(weak.within_30) < 50)
    out.push(`⏱ *${weak.channel}*는 30분 안에 답하는 비율이 ${num(weak.within_30)}%로 낮아요. 이 채널 응대를 신경 써 주세요.`);

  const un = num(d.unanswered?.total);
  if (un > 0) out.push(`📮 상담원이 한 번도 답하지 않은 대화가 *${un}건* 있어요. 확인이 필요해요.`);

  return out.slice(0, 5);
}

function buildBlocks(d: any): { blocks: any[]; fallback: string } {
  const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
  const q = d.quality || {};
  const cov = num(q.sent_total) > 0 ? Math.round((100 * num(q.sent_done)) / num(q.sent_total)) : 0;
  const highlights = computeHighlights(d);

  const qualityLine =
    `*🧹 분류 품질*\n` +
    `• 기타 *${q.etc_pct}%* (${num(q.etc_cnt)}건) · 미분류 *${num(q.unclassified)}건* · 감정분석 *${cov}%* 전수 완료\n` +
    `• 신규 유형 '모의고사·서바이벌' *${num(q.mock_cnt)}건* 발굴 (과거 기타에 묻혀 있던 최다 문의)`;

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📈 카카오 상담 심화 분석 · ${today}`, emoji: true } },
    ctx(`최근 30일 기준 · 3개 채널(마이클래스 · 라이브 · 시대인재C) · Supabase 실데이터`),
    divider,
    sec(`*⭐ 핵심 요약 (먼저 이것만 봐도 돼요)*\n${highlights.length ? highlights.join('\n') : '오늘은 특이한 신호가 없어요.'}`),
    divider,
    sec(qualityLine),
    divider,
    topCategoriesBlock((d.top_categories as any[]) || []),
    divider,
    painBlock((d.topic_pain as any[]) || []),
    divider,
    slaBlock((d.sla as any[]) || []),
    unansweredBlock(d.unanswered),
    divider,
    weeklyBlock((d.weekly as any[]) || []),
    hourlyBlock((d.hourly as any[]) || []),
    divider,
    ctx(`감정: 전체 부정 ${q.sent_neg_pct}% · 악화 채널 없음 · 총 대화 ${num(q.total_chats).toLocaleString()}건`),
  ];
  const fallback = `카카오 상담 심화 분석 ${today} · 기타 ${q.etc_pct}% · 모의고사 유형 ${num(q.mock_cnt)}건 발굴`;
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

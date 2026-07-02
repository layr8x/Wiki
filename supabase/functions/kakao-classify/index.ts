// supabase/functions/kakao-classify/index.ts
// 카카오 파트너 채팅 카테고리·감정 자동 분류 — Supabase Edge Function (pg_cron 이 주기 호출).
//
// 왜: 기존 분류는 scripts/classify-kakao-stream.mjs 를 사람이 수동으로 실행해야만 동작했다.
//   실측(2026-07-02) 결과 category_classified_at 이 2026-06-17 단 하루에만 몰려 있고(7,195건)
//   이후 완전히 멈춰 신규 chat 207건이 미분류로 방치돼 있었다. sentiment 는 40,261건의 user
//   메시지 중 0건 처리(analysis/outputs 문서의 "남은 과제"). 원인은 분류가 kakao-collect(수집)
//   처럼 상시 자동화돼 있지 않고 사람의 npm run 실행에만 의존했기 때문이다. 이 함수는 수집과
//   동일하게 pg_cron 이 주기 호출해, 사람이 잊어도 분류가 멈추지 않게 한다.
//
// 분류 입력 개선(analysis/outputs/05_상담분류_고도화.md §8 실측 발견 반영): 기존(출처 불명
//   레거시) 분류기는 chats.last_message(대화의 "마지막" 메시지 — 실측상 대부분 상담원의 종료
//   인사)를 기준으로 분류해 실제 문의 내용을 못 읽고 '기타'로 떨어지는 경우가 많았다. 이 함수는
//   그 대화의 "첫 user 메시지"(실제 문의 내용)를 기준으로 분류한다.
//
// 분류 방식(2단계 폴백, 자동 감지 — 재배포 없이 전환됨):
//   ANTHROPIC_API_KEY 시크릿이 있으면 → Claude Haiku few-shot 분류(연속 신뢰도, category_model='llm').
//     05번 문서가 권고한 방향(규칙 대신 LLM, 신뢰도 임계 적용).
//   없으면 → 재구성한 한국어 키워드 규칙으로 폴백(category_model='rule_v2', confidence 0.70/0.30 —
//     기존 레거시(category_model='rule')와 같은 컨벤션이나 입력을 first-user-message 로 교정).
//   ⚠️ 재구성 규칙은 이 저장소에 커밋된 적 없는 라이브 DB 의 레거시 분류기를 05번 문서의 실측
//   사례로 근사한 것이라 완벽하지 않다. ANTHROPIC_API_KEY 를 Supabase Edge Function 시크릿에
//   등록하면 다음 실행부터 자동으로 LLM 분류로 격상된다.
//
// 처리 대상(1회 호출당, Edge Function 시간제한 방어로 상한 — LIMITS 참고):
//   ① category IS NULL 인 채팅(신규 유입) — 최우선.
//   ② category_confidence=0.30 AND category_model='rule' (레거시 '기타' 중 아직 한 번도
//      재검토 안 된 것) — 재분류 큐. 처리되면 model 이 'rule_v2'/'llm' 로 바뀌어 같은 행이
//      무한 재처리되지 않는다(수렴). 기존 확정 분류(confidence=0.70)는 절대 건드리지 않는다.
//   ③ sentiment IS NULL 인 user 메시지(최신순 — 대시보드가 최근 30일 위주라 최신 우선이 유리).
//
// 인증: kakao-collect 와 동일 패턴 — kakao_partner_secrets.key='kakao_classify_token' 비교.
// 배포: supabase functions deploy kakao-classify --no-verify-jwt (또는 MCP deploy_edge_function)
// 트리거: supabase/migrations/20260702_kakao_classify_pipeline.sql 의 pg_cron(15분).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL') ?? '';
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const LLM_ENABLED = ANTHROPIC_KEY.length > 0;
const MODEL = 'claude-haiku-4-5'; // scripts/classify-kakao-stream.mjs 와 동일 모델(기존 검증된 선택)
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ───────────────────── 재분류 완료 마일스톤 알림 ─────────────────────
// 레거시 '기타' 재검토 큐(§②)가 0건이 되면(=한 번 수렴하면) 05번 문서(analysis/outputs/
// 05_상담분류_고도화.md)가 예측했던 개선폭이 실제로 얼마나 됐는지 최종 결과를 1회만 Slack
// 으로 알린다. kakao_partner_alert_state 를 재사용해 중복 발송을 막는다(kakao-alert 와
// 같은 테이블·컨벤션 — 이 함수는 그 테이블에 새 alert_key 를 하나 더 얹을 뿐).
async function sendSlack(text: string) {
  if (!SLACK_WEBHOOK_URL) {
    log('[milestone] SLACK_WEBHOOK_URL 미설정 — 로그만 남김:\n' + text);
    return;
  }
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) log('[milestone] slack post fail:', res.status, await res.text().catch(() => ''));
  } catch (e) {
    log('[milestone] slack post error:', (e as Error).message);
  }
}

async function checkReclassifyMilestone() {
  const { count: remaining } = await supabase
    .from('kakao_partner_chats')
    .select('*', { count: 'exact', head: true })
    .eq('category_confidence', 0.3)
    .eq('category_model', 'rule');
  if ((remaining ?? 0) > 0) return; // 아직 큐가 안 비었음 — 평소처럼 조용히 넘어감

  const MILESTONE_KEY = 'milestone:reclassify_complete';
  const { data: state } = await supabase
    .from('kakao_partner_alert_state')
    .select('status')
    .eq('alert_key', MILESTONE_KEY)
    .maybeSingle();
  if (state?.status === 'ok') return; // 이미 알렸음 — 재발송 안 함(수렴 후 무한 반복 방지)

  const { count: totalClassified } = await supabase
    .from('kakao_partner_chats')
    .select('*', { count: 'exact', head: true })
    .not('category', 'is', null);
  const { count: etcCount } = await supabase
    .from('kakao_partner_chats')
    .select('*', { count: 'exact', head: true })
    .eq('category', '기타');
  const etcPct = totalClassified ? ((100 * (etcCount ?? 0)) / totalClassified).toFixed(1) : '?';

  await sendSlack(
    `🎉 레거시 '기타' 재분류 큐 완료!\n` +
      `최종 '기타' 비중: *${etcPct}%* (전체 ${totalClassified ?? '?'}건 중 ${etcCount ?? '?'}건)\n` +
      `(재분류 전 실측 28.3% — analysis/outputs/05_상담분류_고도화.md §1)\n` +
      `분류 방식: ${LLM_ENABLED ? 'LLM(Claude)' : '재구성 키워드 규칙'}`,
  );
  await supabase.from('kakao_partner_alert_state').upsert(
    {
      alert_key: MILESTONE_KEY,
      status: 'ok',
      last_payload: { etc_pct: etcPct, total_classified: totalClassified, etc_count: etcCount },
      last_notified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'alert_key' },
  );
  log('[milestone] reclassify complete notified, etc_pct=', etcPct);
}

// 1회 호출당 처리 상한(Edge Function 시간제한 방어). LLM 모드는 네트워크 호출이 섞여 더 보수적으로.
const LIMITS = LLM_ENABLED
  ? { newChats: 18, reviewChats: 12, sentiments: 20 }
  : { newChats: 100, reviewChats: 80, sentiments: 150 };

// ───────────────────── 카테고리 taxonomy(라이브 DB 실측 기준 — 05번 문서 §1-1) ─────────────────────
const CATEGORIES: { id: string; desc: string }[] = [
  { id: '계정·로그인·앱', desc: '로그인/아이디/비밀번호/앱·사이트 접속·영상 재생·기기 오류' },
  { id: '환불', desc: '결제 취소·환불 요청' },
  { id: '모의고사·서바이벌', desc: '서바이벌 프로·전국모의평가·모의고사 응시/성적/등수/해설' },
  { id: '라이브', desc: '라이브(실시간) 수업 관련' },
  { id: '교재·배송', desc: '교재 배송·미수령·재고' },
  { id: '입반·등록', desc: '반 배정·수강신청·개강' },
  { id: '미납·결제', desc: '수강료 결제·미납·가상계좌' },
  { id: '대기', desc: '대기(웨이팅) 관련' },
  { id: '출결·보강', desc: '출석/결석/보강' },
  { id: '통합회원', desc: '형제자매 등 계정 통합' },
  { id: '시간표·수업', desc: '시간표·커리큘럼·강사·강의실' },
  { id: '퇴원·취소', desc: '퇴원·수강 취소' },
  { id: '설명회·컨설팅', desc: '입시설명회·상담 신청' },
  { id: '기타', desc: '위 어디에도 해당 없음(단순 인사·확인 등 의도 없는 응답)' },
];
const ALLOWED_CATEGORIES = new Set(CATEGORIES.map((c) => c.id));

const CATEGORY_SYSTEM = `당신은 학원 고객상담 카테고리 분류기다. 학부모·학생이 학원에 보낸 카카오톡 상담의 첫 문의 메시지를 읽고, 아래 13개 카테고리 중 가장 적합한 하나를 고른다.

카테고리:
${CATEGORIES.map((c) => `- ${c.id}: ${c.desc}`).join('\n')}

예시:
- "앱 켤 때마다 오류나요 확인 부탁드려요" → 계정·로그인·앱
- "비밀번호를 잊어버렸어요 재설정 어떻게 하나요" → 계정·로그인·앱
- "결제한 수강료 환불 가능할까요" → 환불
- "로그인이 계속 안 되는데 확인해주세요" → 계정·로그인·앱
- "교재가 아직도 안 왔어요 배송 확인 부탁드려요" → 교재·배송
- "이번 학기 시간표랑 커리큘럼 알 수 있을까요" → 시간표·수업
- "지금 입반 신청 가능한가요" → 입반·등록
- "네 감사합니다" → 기타

출력(JSON만, 다른 텍스트 없이): {"category":"<id>","confidence":0.0~1.0}
confidence 는 분류 확신도. 의도가 불명확하거나 단순 인사/확인이면 기타 + 낮은 confidence.`;

const SENTIMENT_SYSTEM = `당신은 한국어 감정 분류기다. 학부모·학생이 학원에 보낸 카카오톡 메시지의 감정을 평가한다.
출력(JSON만): {"sentiment":"positive|neutral|negative","score":-1.0~1.0}
기준: positive(+0.3 이상)=감사·만족·칭찬, negative(-0.3 이하)=불만·분노·항의·실망, neutral=단순 정보 요청.
score 는 강도. 매우 화남 -0.9, 보통 부정 -0.5, 살짝 만족 +0.3.`;

async function callClaude(system: string, user: string, maxTokens = 100): Promise<string> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function extractJson(text: string): any | null {
  const m = text.match(/\{[^}]+\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

async function classifyCategoryLLM(text: string): Promise<{ category: string; confidence: number } | null> {
  try {
    const reply = await callClaude(CATEGORY_SYSTEM, text.slice(0, 500));
    const parsed = extractJson(reply);
    if (!parsed || !ALLOWED_CATEGORIES.has(parsed.category)) return null;
    return { category: parsed.category, confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)) };
  } catch (e) {
    log('classify-llm fail:', (e as Error).message);
    return null;
  }
}

async function classifySentimentLLM(text: string): Promise<{ sentiment: string; score: number } | null> {
  try {
    const reply = await callClaude(SENTIMENT_SYSTEM, text.slice(0, 300));
    const parsed = extractJson(reply);
    if (!parsed || !['positive', 'neutral', 'negative'].includes(parsed.sentiment)) return null;
    return { sentiment: parsed.sentiment, score: Math.min(1, Math.max(-1, Number(parsed.score) || 0)) };
  } catch (e) {
    log('sentiment-llm fail:', (e as Error).message);
    return null;
  }
}

// ───────────────────── 규칙 기반 폴백(ANTHROPIC_API_KEY 미설정 시) ─────────────────────
// 주의: 라이브 DB 의 기존(category_model='rule') 값은 이 저장소에 커밋된 적 없는 레거시
// 분류기의 산출물이라 원본 규칙을 알 수 없다. 아래는 05번 문서(analysis/outputs/05_상담분류_고도화.md)
// §3·§8 의 실측 사례를 근거로 재구성한 근사치이며, ANTHROPIC_API_KEY 등록 시 자동으로 LLM
// 분류가 이를 대체한다. 순서 = 우선순위(좁은 카테고리를 넓은 카테고리보다 먼저 검사).
// 우선순위 순(좁은 카테고리 먼저). rule_v3: 모의고사·서바이벌 신설 + 영상재생/기기/사이트 기술문의 보강.
// SQL 일괄 재분류(migration 20260703_kakao_backfill_reclassify)와 동일 규칙. 둘을 함께 갱신할 것.
const RULE_ENGINE: { category: string; re: RegExp }[] = [
  { category: '환불', re: /환불/ },
  { category: '통합회원', re: /통합\s*회원|계정\s*통합|형제.{0,4}계정|자매.{0,4}계정/ },
  { category: '미납·결제', re: /미납|결제|수강료|납부|가상계좌|청구|카드\s*승인|중복\s*결제|환급/ },
  { category: '모의고사·서바이벌', re: /서바이벌|서바\s|서프|전국\s*모의|모의\s*평가|모의고사|모평|응시|성적표|등수|채점|분석\s*결과|해설[지강]/ },
  { category: '출결·보강', re: /출석|출결|보강|결석/ },
  { category: '입반·등록', re: /입반|반\s*배정|수강\s*신청|개강|접수|인강|인터넷\s*강의|온라인\s*강의|정규반|신청\s*내역/ },
  { category: '대기', re: /대기|웨이팅/ },
  { category: '시간표·수업', re: /시간표|커리큘럼|강의실|강사|수업\s*시간/ },
  { category: '교재·배송', re: /교재|배송|택배|도착|미수령|문제집|도서/ },
  { category: '퇴원·취소', re: /퇴원|그만\s*두|수강\s*취소|재수강\s*안/ },
  { category: '설명회·컨설팅', re: /설명회|컨설팅|입시\s*상담/ },
  { category: '라이브', re: /라이브|LIVE/i },
  { category: '계정·로그인·앱', re: /로그인|아이디|비밀번호|비번|계정|앱|접속|인증|회원가입|연동|오류|에러|튕|먹통|실행|진입|플레이어|비디오|재생|영상|아이패드|맥북|mac\s*os|다운로드|버퍼|끊김|수강.{0,4}안|홈페이지|사이트/i },
];
function classifyCategoryRule(text: string): { category: string; confidence: number } {
  for (const r of RULE_ENGINE) if (r.re.test(text)) return { category: r.category, confidence: 0.7 };
  return { category: '기타', confidence: 0.3 };
}

const NEG_WORDS = ['화나', '짜증', '답답', '실망', '불만', '컴플레인', '항의', '안돼', '안 돼', '왜 안', '도대체', '제발', 'ㅠ', 'ㅜ'];
const POS_WORDS = ['감사', '고맙', '좋아요', '확인했', '해결', '잘 됐', '잘됐', '👍'];
function classifySentimentLexicon(text: string): { sentiment: string; score: number } {
  const neg = NEG_WORDS.filter((w) => text.includes(w)).length;
  const pos = POS_WORDS.filter((w) => text.includes(w)).length;
  const score = Math.max(-1, Math.min(1, (pos - neg) * 0.4));
  const sentiment = score >= 0.3 ? 'positive' : score <= -0.3 ? 'negative' : 'neutral';
  return { sentiment, score };
}

// ───────────────────── 채팅 카테고리 분류 ─────────────────────
// 첫 3개 고객 메시지를 이어붙여 분류에 사용. "문의드려도 될까요?" 같은 오프너 뒤에 실제 의도가
// 오는 경우가 많아, 첫 메시지 하나만 보면 기타로 오분류된다(재분류 진단으로 확인).
async function firstUserMessage(chatId: string, fallback: string | null): Promise<string> {
  const { data } = await supabase
    .from('kakao_partner_messages')
    .select('message')
    .eq('chat_id', chatId)
    .eq('sender_type', 'user')
    .not('message', 'is', null)
    .order('sent_at', { ascending: true })
    .limit(3);
  const joined = ((data as any[]) || []).map((r) => r.message).filter(Boolean).join(' ').trim();
  return (joined || fallback || '').toString().trim();
}

async function classifyChatBatch(rows: { chat_id: string; last_message: string | null }[]) {
  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    const text = await firstUserMessage(row.chat_id, row.last_message);
    if (!text) {
      fail++;
      continue;
    }
    let result: { category: string; confidence: number } | null = null;
    let model = 'rule_v3';
    if (LLM_ENABLED) {
      result = await classifyCategoryLLM(text);
      if (result) model = 'llm';
      await sleep(150);
    }
    if (!result) {
      result = classifyCategoryRule(text);
      model = 'rule_v3';
    }
    const { error } = await supabase
      .from('kakao_partner_chats')
      .update({
        category: result.category,
        category_confidence: result.confidence,
        category_classified_at: new Date().toISOString(),
        category_model: model,
      })
      .eq('chat_id', row.chat_id);
    if (error) {
      fail++;
      log('update chat fail:', error.message);
    } else ok++;
  }
  return { ok, fail };
}

async function classifySentimentBatch(rows: { log_id: string; message: string | null }[]) {
  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    const text = (row.message || '').trim();
    if (!text) {
      fail++;
      continue;
    }
    let result: { sentiment: string; score: number } | null = null;
    let model = 'lexicon';
    if (LLM_ENABLED) {
      result = await classifySentimentLLM(text);
      if (result) model = 'llm';
      await sleep(150);
    }
    if (!result) {
      result = classifySentimentLexicon(text);
      model = 'lexicon';
    }
    const { error } = await supabase
      .from('kakao_partner_messages')
      .update({
        sentiment: result.sentiment,
        sentiment_score: result.score,
        sentiment_classified_at: new Date().toISOString(),
        sentiment_model: model,
      })
      .eq('log_id', row.log_id);
    if (error) {
      fail++;
      log('update msg fail:', error.message);
    } else ok++;
  }
  return { ok, fail };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: secret } = await supabase
    .from('kakao_partner_secrets')
    .select('value')
    .eq('key', 'kakao_classify_token')
    .maybeSingle();
  if (!secret?.value || token !== secret.value) return json({ error: 'unauthorized' }, 401);

  const summary: Record<string, unknown> = { llm_enabled: LLM_ENABLED, at: new Date().toISOString() };

  // ① 신규 미분류 채팅(최우선)
  const { data: newChats, error: newErr } = await supabase
    .from('kakao_partner_chats')
    .select('chat_id, last_message')
    .is('category', null)
    .order('last_log_send_at', { ascending: false })
    .limit(LIMITS.newChats);
  if (newErr) log('select newChats fail:', newErr.message);
  summary.new_chats = await classifyChatBatch((newChats as any[]) || []);

  // ② 레거시 '기타'(0.30) 재검토 큐 — 처리되면 category_model 이 바뀌어 다시 안 걸림(수렴)
  const { data: reviewChats, error: revErr } = await supabase
    .from('kakao_partner_chats')
    .select('chat_id, last_message')
    .eq('category_confidence', 0.3)
    .eq('category_model', 'rule')
    .order('last_log_send_at', { ascending: false })
    .limit(LIMITS.reviewChats);
  if (revErr) log('select reviewChats fail:', revErr.message);
  summary.review_chats = await classifyChatBatch((reviewChats as any[]) || []);

  // ③ 감정 미분류 user 메시지(최신순)
  const { data: msgs, error: msgErr } = await supabase
    .from('kakao_partner_messages')
    .select('log_id, message')
    .eq('sender_type', 'user')
    .is('sentiment', null)
    .not('message', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(LIMITS.sentiments);
  if (msgErr) log('select msgs fail:', msgErr.message);
  summary.sentiments = await classifySentimentBatch((msgs as any[]) || []);

  await checkReclassifyMilestone();

  log('done', JSON.stringify(summary));
  return json(summary);
});

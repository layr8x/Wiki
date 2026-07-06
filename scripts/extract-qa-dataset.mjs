#!/usr/bin/env node
// scripts/extract-qa-dataset.mjs
// 카카오 상담 메시지 → "학부모 질문 ↔ 상담원 답변" Q-A 데이터셋(JSONL) 추출.
//
// 스펙: analysis/outputs/04_LLM_데이터셋_스펙.md
//  - 추출 로직: 같은 chat_id 안에서 user(질문) 바로 다음 manager(답변) 인접쌍을 1쌍으로.
//  - PII 2차 마스킹: 전화/계좌/이메일/실명 패턴을 [전화]·[계좌]·[이메일]·[이름] 치환.
//  - 노이즈/중복 제거: 빈말·자동안내·템플릿 답변 정규화 후 dedup.
//
// 실행:
//   npm run extract:qa-dataset                       # 기본 ./qa-dataset.jsonl
//   npm run extract:qa-dataset -- --out=./out.jsonl  # 출력 경로 지정
//   npm run extract:qa-dataset -- --min-len=2 --keep-noise --no-dedup
//
// ⚠️ 출력 jsonl 에는 상담 원문(대외비·PII)이 들어간다. .gitignore 되는 경로로만 저장하고,
//    저장소에 커밋하지 말 것. 샘플은 analysis/outputs/data/qa_dataset_sample.jsonl (≤20행, 추가 마스킹).

import { getAdminClient } from './lib/supabase-admin.mjs';
import fs from 'node:fs';
import path from 'node:path';

// ── 인자 파싱 ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const hit = argv.find((a) => a === `--${k}` || a.startsWith(`--${k}=`));
  if (!hit) return d;
  const [, v] = hit.split('=');
  return v === undefined ? true : v;
};
const OUT = String(arg('out', path.join(process.cwd(), 'qa-dataset.jsonl')));
const MIN_LEN = Number(arg('min-len', 2));          // 질문·답변 최소 글자수(공백제거 후)
const KEEP_NOISE = Boolean(arg('keep-noise', false)); // 노이즈 제거 끄기
const DO_DEDUP = !arg('no-dedup', false);            // 중복 제거(기본 on)
const PAGE = 1000;                                    // Supabase 페이지 크기

// 채널 매핑 (profile_id → 채널명)  ── 스펙 2-1 (5채널 정본, CLAUDE.md §16)
const CHANNELS = {
  _VGAQn: '마이클래스',
  _rcpPG: 'LIVE',
  _TkpPG: 'LIVE 기술지원',
  _xfxilXn: '콘텐츠',
  _rkbcn: '통합로그인',
};
const PROFILE_IDS = (process.env.KAKAO_PARTNER_PROFILE_IDS || Object.keys(CHANNELS).join(','))
  .split(',').map((s) => s.trim()).filter(Boolean);

// ── PII 2차 마스킹 ──────────────────────────────────────────────────────────
// 스펙 5단계. 1차(수집시) 마스킹이 남긴 잔존 PII + 새 패턴을 [토큰]으로 치환.
// 순서 중요: 이메일 → 계좌 → 전화 → 학번/긴숫자 → 실명.
const PII_RULES = [
  // 이메일 (부분 마스킹된 ***@naver.com 형태 포함)
  [/[\w.+\-*]+@[\w\-]+(?:\.[\w\-]+)+/g, '[이메일]'],
  // 계좌번호 (은행명 동반 또는 하이픈 구분 10자리 이상 숫자열)
  [/(?:\d{2,6}[-\s]){2,}\d{2,6}(?:\d)?/g, (m) => (m.replace(/[^\d]/g, '').length >= 10 ? '[계좌]' : m)],
  // 휴대폰: 010-1234-5678 / 010 1234 5678 / 01012345678 / 부분마스킹 010-****-1234
  [/01[016-9][-\s]?[\d*]{3,4}[-\s]?\d{4}/g, '[전화]'],
  // 일반 전화: 02-123-4567, 031-123-4567 등
  [/0\d{1,2}[-\s]\d{3,4}[-\s]\d{4}/g, '[전화]'],
  // 남은 마스킹조각 포함 7자리+ 숫자열(학번·일련번호 등) → [번호]
  [/\b[\d*]{0,4}\d{7,}\b/g, '[번호]'],
  // 로그인 아이디 추정: 영문+숫자 혼합 6자+ 토큰(예: dldbstjd0415). URL/도메인 조각은 제외.
  [/(?<![\w.\/])(?=[a-z]*\d)(?=\d*[a-z])[a-z\d]{6,}(?![\w.@])/gi, (m) => (/^(?:live|http|https|www|sdij|sdijon|kakao|naver|gmail|android|samsung|galaxy|iphone|ipad)$/i.test(m) ? m : '[아이디]')],
];

// 실명 추정: "이름.김종희", "이름: 홍길동", "성함 홍길동", "한*준", "김 승 주" 등.
// 보수적으로 — 라벨(이름/성함/학생/회원/본인)이 붙은 경우 + 부분마스킹 이름(가운데 *)만 치환.
const NAME_RULES = [
  // "이름.김종희" / "이름:홍길동" / "성함 홍길동" → 라벨 보존, 이름만 [이름]
  [/(이름|성함|학생명|회원명|본인|학생)\s*[.:]?\s*([가-힣]{2,4})(?=\s|$|입니다|이에요|예요|이요|님)/g, '$1 [이름]'],
  // 부분 마스킹된 이름: 한*준, 이*성, 김*수 (가운데 * 포함 2~4자 한글)
  [/[가-힣]\*[가-힣]{1,2}/g, '[이름]'],
  [/[가-힣]{1,2}\*[가-힣]?/g, '[이름]'],
];

function maskPII(text) {
  if (!text) return text;
  let s = String(text);
  for (const [re, rep] of PII_RULES) s = s.replace(re, rep);
  for (const [re, rep] of NAME_RULES) s = s.replace(re, rep);
  return s;
}

// 마스킹 잔존 검사: 치환 후에도 PII 흔적(전화/계좌 패턴)이 남았는지 카운트.
const RESIDUAL_RE = /01[016-9][-\s]?\d{3,4}[-\s]?\d{4}|[\w.+\-]+@[\w\-]+\.[\w\-]+|(?:\d[-\s]?){10,}/;
function hasResidualPII(text) {
  return RESIDUAL_RE.test(String(text || ''));
}

// ── 노이즈 필터 ─────────────────────────────────────────────────────────────
// 내용 없는 빈말/감탄/순수 인사. 질문 또는 답변이 이런 패턴이면 드롭.
const NOISE_RE = /^[\s]*(넵*|네+|예+|넹+|응+|ㅎ+|ㅋ+|ㅠ+|ㅜ+|감사+합?니?다?|고맙습니다|알겠습니다|확인했습니다|좋아요|굿|ok|👍|오케이|넵넵|넹넹|네네|괜찮아요|아니요|아뇨)[\s~!.?ㅎㅋ👍😊^]*$/i;
// 답변이 사실상 자동/정형 인사만인 경우(질문엔 적용 안 함)
const GREETING_ONLY_RE = /^[\s]*안녕하세요[.,!\s]*(시대인재입니다|시대인재[.\s]*)?[.\s]*$/;

function isNoise(q, a) {
  const qs = q.trim();
  const as = a.trim();
  if (NOISE_RE.test(qs)) return true;       // 질문이 빈말
  if (NOISE_RE.test(as)) return true;       // 답변이 빈말
  if (GREETING_ONLY_RE.test(as)) return true; // 답변이 인사뿐
  return false;
}

// ── 정규화(중복 제거용 키) ──────────────────────────────────────────────────
// 공백·기호·URL 제거 후 소문자화 — 템플릿 답변(채널이동 안내 등) 압축.
function normKey(q, a) {
  const norm = (s) => String(s)
    .replace(/https?:\/\/\S+/g, '')   // URL 제거
    .replace(/[\s\r\n]+/g, '')        // 공백 제거
    .replace(/[^\p{L}\p{N}]/gu, '')   // 기호 제거
    .toLowerCase();
  return norm(q) + '||' + norm(a);
}

// ── 메인 추출 ───────────────────────────────────────────────────────────────
const sb = getAdminClient();

// 한 채널의 chat 카테고리 맵(chat_id → {category, conf})을 미리 적재.
async function loadChatMeta(pid) {
  const map = new Map();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('kakao_partner_chats')
      .select('chat_id, category, category_confidence')
      .eq('profile_id', pid)
      .order('chat_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    for (const r of data) map.set(String(r.chat_id), { category: r.category, conf: r.category_confidence });
    if (data.length < PAGE) break;
  }
  return map;
}

// 채널 단위로 메시지를 chat_id별로 모아 인접쌍 생성.
async function extractChannel(pid, chatMeta, sink, stats) {
  // chat_id별 메시지 버킷 (메모리). 채널당 수만건 수준이라 충분.
  const byChat = new Map();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('kakao_partner_messages')
      .select('chat_id, sender_type, message, message_type, sent_at')
      .eq('profile_id', pid)
      .in('sender_type', ['user', 'manager'])
      .eq('message_type', '1')
      .order('chat_id', { ascending: true })
      .order('sent_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    for (const m of data) {
      if (!m.message || !String(m.message).trim()) continue;
      const k = String(m.chat_id);
      if (!byChat.has(k)) byChat.set(k, []);
      byChat.get(k).push(m);
    }
    if (data.length < PAGE) break;
  }

  for (const [chatId, msgs] of byChat) {
    msgs.sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
    for (let i = 0; i < msgs.length - 1; i++) {
      const cur = msgs[i];
      const nxt = msgs[i + 1];
      // 인접쌍: 현재 user → 다음 manager
      if (cur.sender_type !== 'user' || nxt.sender_type !== 'manager') continue;
      const qRaw = String(cur.message).trim();
      const aRaw = String(nxt.message).trim();
      if (qRaw.length < MIN_LEN || aRaw.length < MIN_LEN) continue;
      stats.rawPairs++;

      // 2차 PII 마스킹
      const question = maskPII(qRaw);
      const answer = maskPII(aRaw);

      // 노이즈 제거
      if (!KEEP_NOISE && isNoise(question, answer)) { stats.droppedNoise++; continue; }

      // 마스킹 잔존 검사
      if (hasResidualPII(question) || hasResidualPII(answer)) stats.residual++;

      const meta = chatMeta.get(chatId) || {};
      const conf = meta.conf == null ? null : Number(meta.conf);
      sink({
        chat_id: chatId,
        channel: CHANNELS[pid] || pid,
        question,
        answer,
        category: meta.category ?? null,
        category_conf: conf,
        asked_at: cur.sent_at,
        pii_masked: true,
        _key: DO_DEDUP ? normKey(question, answer) : null,
      });
      stats.byChannel[CHANNELS[pid] || pid] = (stats.byChannel[CHANNELS[pid] || pid] || 0) + 1;
    }
  }
}

async function main() {
  const t0 = Date.now();
  const stats = { rawPairs: 0, droppedNoise: 0, droppedDup: 0, residual: 0, written: 0, byChannel: {} };
  const seen = new Set();
  let seq = 0;

  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  const ws = fs.createWriteStream(OUT, { encoding: 'utf8' });

  const sink = (row) => {
    if (DO_DEDUP && row._key) {
      if (seen.has(row._key)) { stats.droppedDup++; return; }
      seen.add(row._key);
    }
    seq += 1;
    const { _key, ...rest } = row;
    const out = { id: `qa_${String(seq).padStart(6, '0')}`, ...rest };
    ws.write(JSON.stringify(out) + '\n');
    stats.written += 1;
  };

  for (const pid of PROFILE_IDS) {
    const label = CHANNELS[pid] || pid;
    process.stderr.write(`[extract] ${label} (${pid}) ...\n`);
    const chatMeta = await loadChatMeta(pid);
    await extractChannel(pid, chatMeta, sink, stats);
  }

  await new Promise((res) => ws.end(res));

  // ── 요약 ──
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n==== Q-A 데이터셋 추출 요약 ====');
  console.log(`출력 파일      : ${path.resolve(OUT)}`);
  console.log(`원시 인접쌍    : ${stats.rawPairs.toLocaleString()} (질문·답변 ≥ ${MIN_LEN}자)`);
  console.log(`노이즈 제거    : ${stats.droppedNoise.toLocaleString()}${KEEP_NOISE ? ' (비활성)' : ''}`);
  console.log(`중복 제거      : ${stats.droppedDup.toLocaleString()}${DO_DEDUP ? '' : ' (비활성)'}`);
  console.log(`최종 저장 건수 : ${stats.written.toLocaleString()}`);
  console.log(`마스킹 잔존    : ${stats.residual.toLocaleString()} (0 이어야 통과 — 5-1 점검)`);
  console.log('\n-- 채널별 분포(최종) --');
  for (const [ch, n] of Object.entries(stats.byChannel).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ch.padEnd(8)} ${n.toLocaleString().padStart(7)}`);
  }
  console.log(`\n소요 ${sec}s`);
  if (stats.residual > 0) {
    console.warn(`\n⚠️ 마스킹 잔존 ${stats.residual}건 — PII_RULES 보강 필요. 커밋·외부공유 금지.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
// 최종 분석 데이터 패키지 export
// 산출: docs/cs-analysis-package/ 디렉토리에 CSV·JSON 일체
import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const pg = new Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: true },
});
await pg.connect();

const OUT = '/Users/layr8x/Library/Mobile Documents/com~apple~CloudDocs/MacStudio-MJ/ams-wiki/docs/cs-analysis-package';
fs.mkdirSync(OUT, { recursive: true });

// ─── 카테고리 분류 룰 (고객용) ─────────────────────────────────────────────
const CATEGORY_RULES = {
  '영상재생/콘텐츠':       /(재생|버퍼|버벅|끊김|화질|로딩|튕김|영상|동영상|복습|다운로드|VOD|vod|플레이어|시청)/i,
  '학원등록연동/회원이관':  /(이관|통합|연동|학원등록|등록 연동|회원검색|학사정보|학사관리|중복가입|계정통합)/i,
  'QR/출석':              /(QR|qr|출석|결석|지각|체크인|체크 인|출결|출석부)/i,
  '학부모/계정통합':       /(학부모|보호자|자녀|아이|부모|아들|딸|학부모앱|학부모 앱|자녀추가|자녀 추가)/i,
  '환불/결제':             /(환불|취소|환급|결제|입금|카드|결제수단|영수증|승인|무통장|중복결제|결제오류)/i,
  '로그인/계정':           /(로그인|비밀번호|패스워드|아이디|회원가입|인증번호|이메일 인증|로그아웃)/i,
  '강좌 신청/수강':        /(신청|수강신청|강좌|강의|수업|예약|등록|커리큘럼)/i,
  '교재/배송':             /(교재|문제집|배송|택배|책|프린트)/i,
  '시간표/일정':           /(시간표|일정|개강|종강|보강|휴강|스케줄)/i,
  '강사/강좌 정보':        /(선생님|쌤|강사|이신혁|현정훈|장재원|피어슨|시그니처)/i,
  '앱 설치/오류':          /(앱 설치|어플 설치|설치 링크|업데이트|버전|에러|오류|작동 안)/i,
};
const NEG = /(안 ?돼|안되|안 되|안 ?됨|되지 않|되지않|왜|아직|또|다시|짜증|불편|이상|문제|오류|에러|버그|먹통|튕|렉|느려|급|화|당황|불안|곤란|답답|일주일|며칠|몇 ?일|망)/i;
const POS = /(감사|고맙|좋|친절|빨라|빠른|만족|이해|알겠|확인|잘 ?돼|잘되)/i;

function classify(msg) {
  if (!msg) return '기타';
  for (const [k, re] of Object.entries(CATEGORY_RULES)) if (re.test(msg)) return k;
  return '기타';
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

function writeCSV(file, headers, rows) {
  const out = [headers.join(',')];
  for (const r of rows) out.push(headers.map((h) => csvEscape(r[h])).join(','));
  fs.writeFileSync(path.join(OUT, file), out.join('\n') + '\n');
  console.error(`  ${file} (${rows.length} rows)`);
}

// ─── 1. 고객 채팅 + 분류 결과 CSV ─────────────────────────────────────────
console.error('[1] customer chats (1,423)...');
const { rows: chats } = await pg.query(`
  select c.chat_id, c.nickname, c.last_log_send_at, c.last_message,
    c.unread_count, c.is_done,
    (select count(*) from kakao_partner_messages where chat_id=c.chat_id) msgs,
    (select count(*) from kakao_partner_messages where chat_id=c.chat_id and sender_type='user') user_msgs,
    (select count(*) from kakao_partner_messages where chat_id=c.chat_id and sender_type='manager') mgr_msgs,
    (select string_agg(message,' | ' order by sent_at) from kakao_partner_messages
       where chat_id=c.chat_id and sender_type='user' limit 1) user_text,
    (select sender_type from kakao_partner_messages where chat_id=c.chat_id
       order by sent_at desc limit 1) last_sender
  from kakao_partner_chats c
  order by c.last_log_send_at desc nulls last
`);
const chatRows = chats.map((c) => {
  const category = classify(c.user_text || '');
  const text = c.user_text || '';
  const negHits = (text.match(NEG) || []).length;
  const posHits = (text.match(POS) || []).length;
  const polarity = negHits > posHits ? 'negative' : posHits > negHits ? 'positive' : 'neutral';
  return {
    chat_id: c.chat_id,
    nickname: c.nickname,
    last_activity: c.last_log_send_at?.toISOString?.()?.slice(0, 19),
    category,
    polarity,
    msgs: c.msgs,
    user_msgs: c.user_msgs,
    mgr_msgs: c.mgr_msgs,
    last_sender: c.last_sender,
    dropped: c.last_sender === 'user' ? 'Y' : 'N',
    last_message_preview: (c.last_message || '').slice(0, 80),
    representative: (c.user_text || '').slice(0, 200),
  };
});
writeCSV('01_customer_chats.csv', Object.keys(chatRows[0]), chatRows);

// ─── 2. 고객 메시지 raw + 카테고리 + 감정 ─────────────────────────────────
console.error('[2] customer messages (14,250)...');
const { rows: msgs } = await pg.query(`
  select m.chat_id, c.nickname, m.sender_type,
    m.sent_at, m.message, m.message_type, m.log_id,
    m.raw->'manager'->>'name' manager_name
  from kakao_partner_messages m
  left join kakao_partner_chats c on c.chat_id=m.chat_id
  order by m.sent_at
`);
const msgRows = msgs.map((m) => {
  const cat = m.sender_type === 'user' ? classify(m.message || '') : '';
  const neg = m.message && NEG.test(m.message) ? 1 : 0;
  return {
    sent_at: m.sent_at?.toISOString?.()?.slice(0, 19),
    chat_id: m.chat_id,
    nickname: m.nickname,
    sender: m.sender_type,
    manager: m.manager_name || '',
    msg_type: m.message_type,
    category: cat,
    neg,
    message: (m.message || '').slice(0, 500),
  };
});
writeCSV('02_customer_messages.csv', Object.keys(msgRows[0]), msgRows);

// ─── 3. 카테고리 집계 ────────────────────────────────────────────────────
console.error('[3] category summary...');
const catSummary = (() => {
  const agg = {};
  for (const c of chatRows) {
    if (!agg[c.category]) agg[c.category] = { count: 0, neg: 0, dropped: 0, total_msgs: 0 };
    agg[c.category].count++;
    if (c.polarity === 'negative') agg[c.category].neg++;
    if (c.dropped === 'Y') agg[c.category].dropped++;
    agg[c.category].total_msgs += c.msgs;
  }
  const total = chatRows.length;
  return Object.entries(agg).map(([cat, v]) => ({
    category: cat,
    chats: v.count,
    pct: ((v.count / total) * 100).toFixed(1),
    negative_chats: v.neg,
    neg_pct: ((v.neg / v.count) * 100).toFixed(1),
    dropped_chats: v.dropped,
    drop_pct: ((v.dropped / v.count) * 100).toFixed(1),
    avg_msgs: (v.total_msgs / v.count).toFixed(1),
  })).sort((a, b) => b.chats - a.chats);
})();
writeCSV('03_category_summary.csv', Object.keys(catSummary[0]), catSummary);

// ─── 4. 매니저별 통계 ────────────────────────────────────────────────────
console.error('[4] manager stats...');
const { rows: mgrAgg } = await pg.query(`
  select raw->'manager'->>'name' name, raw->'manager'->>'id' id,
    count(*) msgs, count(distinct chat_id) chats,
    min(sent_at) first_msg, max(sent_at) last_msg
  from kakao_partner_messages
  where sender_type='manager' and raw->'manager' is not null
  group by name, id order by msgs desc
`);
writeCSV('04_manager_stats.csv', ['name','id','msgs','chats','first_msg','last_msg'],
  mgrAgg.map((m) => ({
    name: m.name, id: m.id, msgs: m.msgs, chats: m.chats,
    first_msg: m.first_msg?.toISOString?.()?.slice(0, 10),
    last_msg: m.last_msg?.toISOString?.()?.slice(0, 10),
  })));

// ─── 5. 응답시간 분포 (운영시간 bucket) ───────────────────────────────────
console.error('[5] response time...');
const { rows: respBuckets } = await pg.query(`
  with ordered as (
    select chat_id, sender_type, sent_at,
      lag(sent_at) over (partition by chat_id order by sent_at) prev_at,
      lag(sender_type) over (partition by chat_id order by sent_at) prev_type
    from kakao_partner_messages where sender_type in ('user','manager')
  ),
  pairs as (
    select extract(epoch from (sent_at - prev_at))/60 wait_min,
      case
        when extract(dow from prev_at + interval '9 hours') between 1 and 5
             and extract(hour from prev_at + interval '9 hours') between 10 and 19 then 'weekday_in'
        when extract(dow from prev_at + interval '9 hours') in (0,6)
             and extract(hour from prev_at + interval '9 hours') between 10 and 19 then 'weekend_in'
        else 'outside'
      end bucket
    from ordered where sender_type='manager' and prev_type='user'
  )
  select bucket, count(*) n,
    round(avg(wait_min)::numeric,1) avg_min,
    round((percentile_cont(0.5) within group (order by wait_min))::numeric,1) p50_min,
    round((percentile_cont(0.9) within group (order by wait_min))::numeric,1) p90_min,
    count(*) filter (where wait_min <= 5) le5,
    count(*) filter (where wait_min <= 30) le30,
    count(*) filter (where wait_min > 480) over8h
  from pairs group by bucket order by bucket
`);
writeCSV('05_response_time.csv', Object.keys(respBuckets[0]), respBuckets);

// ─── 6. 시즌별 (월별) ────────────────────────────────────────────────────
console.error('[6] monthly...');
const { rows: monthly } = await pg.query(`
  with first_msg as (
    select chat_id, min(sent_at) first_at from kakao_partner_messages group by chat_id
  ),
  new_per_month as (
    select to_char(date_trunc('month', first_at + interval '9 hours'), 'YYYY-MM') ym, count(*) new_chats
    from first_msg group by ym
  ),
  msgs_per_month as (
    select to_char(date_trunc('month', sent_at + interval '9 hours'), 'YYYY-MM') ym, count(*) total_msgs
    from kakao_partner_messages group by ym
  )
  select n.ym, n.new_chats, coalesce(m.total_msgs, 0) total_msgs
  from new_per_month n left join msgs_per_month m on n.ym=m.ym order by n.ym
`);
writeCSV('06_monthly.csv', Object.keys(monthly[0]), monthly);

// ─── 7. 시간대 × 요일 매트릭스 ────────────────────────────────────────────
console.error('[7] hour x dow heatmap...');
const { rows: heat } = await pg.query(`
  select extract(dow from sent_at + interval '9 hours')::int dow,
    extract(hour from sent_at + interval '9 hours')::int hour_kst,
    count(*) filter (where sender_type='user') u,
    count(*) filter (where sender_type='manager') m
  from kakao_partner_messages group by dow, hour_kst order by dow, hour_kst
`);
writeCSV('07_hour_dow_heatmap.csv', Object.keys(heat[0]), heat);

// ─── 8. 카테고리별 대표 메시지 (top 5 longest per category) ───────────────
console.error('[8] representative messages...');
const repr = {};
for (const c of chatRows) {
  if (!repr[c.category]) repr[c.category] = [];
  repr[c.category].push({
    chat_id: c.chat_id, nickname: c.nickname,
    polarity: c.polarity, msgs: c.msgs,
    representative: c.representative,
  });
}
const reprFlat = [];
for (const [cat, list] of Object.entries(repr)) {
  list.sort((a, b) => (b.representative?.length || 0) - (a.representative?.length || 0));
  for (const r of list.slice(0, 5)) reprFlat.push({ category: cat, ...r });
}
writeCSV('08_representative_messages.csv', Object.keys(reprFlat[0]), reprFlat);

// ─── 9. 통계 메타데이터 (1장 요약) ───────────────────────────────────────
const meta = {
  generated_at: new Date().toISOString(),
  period: { start: '2025-12-22', end: '2026-05-12', days: 142 },
  customer_channel: {
    total_chats: chatRows.length,
    total_messages: msgs.length,
    dropped_chats: chatRows.filter((c) => c.dropped === 'Y').length,
    drop_rate_pct: ((chatRows.filter((c) => c.dropped === 'Y').length / chatRows.length) * 100).toFixed(1),
  },
  response_time_weekday_in: respBuckets.find((b) => b.bucket === 'weekday_in'),
  top_categories: catSummary.slice(0, 5),
  top_managers: mgrAgg.slice(0, 5).map((m) => ({ name: m.name, msgs: m.msgs, chats: m.chats })),
};
fs.writeFileSync(path.join(OUT, '00_metadata.json'), JSON.stringify(meta, null, 2));
console.error('  00_metadata.json');

// ─── 10. README ──────────────────────────────────────────────────────────
const readme = `# CS 분석 데이터 패키지

생성: ${meta.generated_at}
기간: ${meta.period.start} ~ ${meta.period.end} (${meta.period.days}일)
출처: Supabase \`kakao_partner_messages\` + \`kakao_partner_chats\` (PR #37 실시간 데몬 수집)

## 파일 목록

| 파일 | 설명 | 행 수 |
|---|---|---|
| 00_metadata.json | 패키지 요약 + 검증 가능 통계 | — |
| 01_customer_chats.csv | 고객 채팅방 (카테고리·감정·드롭 분류) | ${chatRows.length} |
| 02_customer_messages.csv | 고객 메시지 raw + 카테고리·감정 | ${msgs.length} |
| 03_category_summary.csv | 카테고리별 집계 (인입·부정·드롭) | ${catSummary.length} |
| 04_manager_stats.csv | 매니저별 부하 통계 | ${mgrAgg.length} |
| 05_response_time.csv | 운영시간 bucket별 응답시간 분포 | ${respBuckets.length} |
| 06_monthly.csv | 월별 신규 채팅·총 메시지 | ${monthly.length} |
| 07_hour_dow_heatmap.csv | 시간대 × 요일 매트릭스 | ${heat.length} |
| 08_representative_messages.csv | 카테고리별 대표 메시지 (top 5) | ${reprFlat.length} |

## 분류 룰

카테고리 11종 + 기타 (\`scripts/export-cs-package.mjs\` 의 CATEGORY_RULES).
감정: NEG 키워드 hit > POS hit → negative, 반대 → positive, 동률 → neutral.

## 단과톡방 raw

별도 파일: \`uploads/단과톡방 25.11.03-26.05.11.txt\` (5,689 메시지, 210명, 190일).
파싱·분류: \`scripts/analyze-dangua-talkroom.mjs\`.

## 재현

\`\`\`bash
node --env-file=.env.local scripts/export-cs-package.mjs
\`\`\`
`;
fs.writeFileSync(path.join(OUT, 'README.md'), readme);
console.error('  README.md');

await pg.end();
console.error(`\n[done] ${OUT}`);

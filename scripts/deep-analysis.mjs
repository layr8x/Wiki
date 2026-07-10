#!/usr/bin/env node
// 다각도 심층 분석 — 시계열 추이 + 매트릭스 + 매니저 specialty + 반복고객
import { Client } from 'pg';
import fs from 'node:fs';
const pg = new Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: true },
});
await pg.connect();

const CATEGORY_RULES = {
  '영상재생/콘텐츠':       /(재생|버퍼|버벅|끊김|화질|로딩|튕김|영상|동영상|복습|다운로드|VOD|vod|플레이어|시청)/i,
  '학원등록연동/회원이관':  /(이관|통합|연동|학원등록|회원검색|학사정보|중복가입|계정통합)/i,
  'QR/출석':              /(QR|qr|출석|결석|지각|체크인|출결|출석부)/i,
  '학부모/계정통합':       /(학부모|보호자|자녀|아이|부모|아들|딸|학부모앱)/i,
  '환불/결제':             /(환불|취소|환급|결제|입금|카드|영수증|승인|중복결제)/i,
  '로그인/계정':           /(로그인|비밀번호|패스워드|아이디|회원가입|인증번호|이메일 인증)/i,
  '강좌 신청/수강':        /(신청|수강신청|강좌|강의|수업|예약|등록|커리큘럼)/i,
  '교재/배송':             /(교재|문제집|배송|택배|책|프린트)/i,
  '시간표/일정':           /(시간표|일정|개강|종강|보강|휴강|스케줄)/i,
  '강사/강좌 정보':        /(선생님|쌤|강사|이신혁|현정훈|장재원|피어슨|시그니처)/i,
  '앱 설치/오류':          /(앱 설치|설치 링크|업데이트|버전|에러|오류|작동 안)/i,
};
const NEG = /(안 ?돼|안되|안 되|안 ?됨|되지 않|왜|아직|짜증|불편|이상|문제|오류|에러|버그|먹통|튕|렉|느려|급|화|당황|답답|일주일|며칠|망)/i;

function classify(m) {
  if (!m) return '기타';
  for (const [k, re] of Object.entries(CATEGORY_RULES)) if (re.test(m)) return k;
  return '기타';
}
const isNeg = (m) => m && NEG.test(m);

// ─── 1. 월별 카테고리 추이 (stacked) ────────────────────────────────────
console.error('[1] monthly category trends...');
const { rows: monthMsgs } = await pg.query(`
  select to_char(date_trunc('month', sent_at + interval '9 hours'), 'YYYY-MM') ym,
    chat_id, message
  from kakao_partner_messages
  where sender_type='user' and message is not null
  order by ym, chat_id
`);
const monthly = {};
const seenChats = new Set();
for (const r of monthMsgs) {
  if (seenChats.has(r.chat_id)) continue;
  seenChats.add(r.chat_id);
  const cat = classify(r.message);
  if (!monthly[r.ym]) monthly[r.ym] = {};
  monthly[r.ym][cat] = (monthly[r.ym][cat] || 0) + 1;
}
// 채팅별 first user message 카테고리로 월별 집계 (위 코드는 모든 user msg 1회만 카운트)
// 실제로는 chat_id 첫 등장 시점이 분석 기준 → 정확한 first-touch 분석

// ─── 2. 시간대 × 카테고리 매트릭스 ────────────────────────────────────────
console.error('[2] hour x category...');
const hourCat = {};
const { rows: hourMsgs } = await pg.query(`
  select extract(hour from sent_at + interval '9 hours')::int h, message
  from kakao_partner_messages
  where sender_type='user' and message is not null
`);
for (const r of hourMsgs) {
  const cat = classify(r.message);
  if (!hourCat[r.h]) hourCat[r.h] = {};
  hourCat[r.h][cat] = (hourCat[r.h][cat] || 0) + 1;
}

// ─── 3. 카테고리별 응답시간 추이 (월별) ───────────────────────────────────
console.error('[3] category response time by month...');
const { rows: respByMonth } = await pg.query(`
  with ordered as (
    select chat_id, sender_type, sent_at, message,
      lag(sent_at) over (partition by chat_id order by sent_at) prev_at,
      lag(sender_type) over (partition by chat_id order by sent_at) prev_type,
      lag(message) over (partition by chat_id order by sent_at) prev_msg
    from kakao_partner_messages
    where sender_type in ('user','manager')
  ),
  pairs as (
    select to_char(date_trunc('month', prev_at + interval '9 hours'), 'YYYY-MM') ym,
      prev_msg, extract(epoch from (sent_at - prev_at))/60 wait_min,
      case when extract(dow from prev_at + interval '9 hours') between 1 and 5
             and extract(hour from prev_at + interval '9 hours') between 10 and 19
        then 'in' else 'out' end bucket
    from ordered where sender_type='manager' and prev_type='user' and prev_msg is not null
  )
  select ym, prev_msg, wait_min, bucket from pairs where bucket='in'
`);
const catRespMonth = {};
for (const r of respByMonth) {
  const cat = classify(r.prev_msg);
  const key = `${r.ym}|${cat}`;
  if (!catRespMonth[key]) catRespMonth[key] = [];
  catRespMonth[key].push(Number(r.wait_min));
}
const catRespAgg = Object.entries(catRespMonth).map(([k, arr]) => {
  const [ym, cat] = k.split('|');
  arr.sort((a, b) => a - b);
  return { ym, category: cat, n: arr.length,
    p50: arr[Math.floor(arr.length/2)]?.toFixed(1) || null,
    avg: (arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(1),
  };
}).sort((a, b) => a.ym.localeCompare(b.ym) || a.category.localeCompare(b.category));

// ─── 4. 매니저별 카테고리 specialty (누가 뭘 잘 처리?) ────────────────────
console.error('[4] manager specialty...');
const { rows: mgrMsgs } = await pg.query(`
  select m.raw->'manager'->>'name' mgr, m.chat_id, m.sent_at,
    (select message from kakao_partner_messages
       where chat_id=m.chat_id and sender_type='user' order by sent_at limit 1) user_first
  from kakao_partner_messages m
  where sender_type='manager' and raw->'manager' is not null
`);
const mgrSpecialty = {};
for (const r of mgrMsgs) {
  if (!r.mgr || !r.user_first) continue;
  const cat = classify(r.user_first);
  if (!mgrSpecialty[r.mgr]) mgrSpecialty[r.mgr] = {};
  mgrSpecialty[r.mgr][cat] = (mgrSpecialty[r.mgr][cat] || 0) + 1;
}

// ─── 5. 반복 사용자 (동일 nickname 다른 chat_id) ─────────────────────────
console.error('[5] repeat customers...');
const { rows: repeat } = await pg.query(`
  select nickname, count(distinct chat_id) chats,
    min(last_log_send_at) first_seen, max(last_log_send_at) last_seen
  from kakao_partner_chats
  where nickname is not null and nickname != ''
  group by nickname having count(distinct chat_id) > 1
  order by chats desc limit 30
`);

// ─── 6. 부정감정 → 응답시간·드롭 상관 ─────────────────────────────────────
console.error('[6] negative emotion correlation...');
const { rows: negRows } = await pg.query(`
  with first_user as (
    select distinct on (chat_id) chat_id, message, sent_at from kakao_partner_messages
    where sender_type='user' order by chat_id, sent_at
  ),
  resp as (
    select fu.chat_id, fu.message u_msg,
      (select min(m.sent_at) from kakao_partner_messages m
        where m.chat_id=fu.chat_id and m.sender_type='manager' and m.sent_at > fu.sent_at) first_resp_at,
      fu.sent_at u_at,
      (select sender_type from kakao_partner_messages
        where chat_id=fu.chat_id order by sent_at desc limit 1) last_sender
    from first_user fu
  )
  select chat_id, u_msg,
    extract(epoch from (first_resp_at - u_at))/60 first_resp_min, last_sender
  from resp
`);
const negCorr = { neg: { resp: [], drop: 0, total: 0 }, pos_neutral: { resp: [], drop: 0, total: 0 } };
for (const r of negRows) {
  const key = isNeg(r.u_msg) ? 'neg' : 'pos_neutral';
  negCorr[key].total++;
  if (r.first_resp_min != null) negCorr[key].resp.push(Number(r.first_resp_min));
  if (r.last_sender === 'user') negCorr[key].drop++;
}
function stat(arr) {
  if (!arr.length) return {};
  const s = arr.slice().sort((a, b) => a - b);
  return { n: s.length, p50: s[Math.floor(s.length/2)].toFixed(1),
    avg: (s.reduce((x, y) => x + y, 0) / s.length).toFixed(1) };
}

// ─── 7. 첫 응답 후 user 추가 메시지 비율 (해결 여부 추정) ────────────────
console.error('[7] resolution proxy...');
const { rows: resolution } = await pg.query(`
  with first_pair as (
    select chat_id,
      min(sent_at) filter (where sender_type='user') u_first,
      min(sent_at) filter (where sender_type='manager') m_first
    from kakao_partner_messages group by chat_id
  )
  select fp.chat_id,
    (select count(*) from kakao_partner_messages
       where chat_id=fp.chat_id and sender_type='user' and sent_at > fp.m_first) user_after_mgr,
    (select message from kakao_partner_messages
       where chat_id=fp.chat_id and sender_type='user' order by sent_at limit 1) first_msg
  from first_pair fp where fp.m_first is not null
`);
const resPattern = {};
for (const r of resolution) {
  if (!r.first_msg) continue;
  const cat = classify(r.first_msg);
  if (!resPattern[cat]) resPattern[cat] = { total: 0, no_follow_up: 0, follow_up: 0 };
  resPattern[cat].total++;
  if (Number(r.user_after_mgr) === 0) resPattern[cat].no_follow_up++;
  else resPattern[cat].follow_up++;
}

// ─── 8. 강사명/강좌명 시즌별 등장 ─────────────────────────────────────────
console.error('[8] instructor seasonality...');
const TEACHERS = ['이신혁','현정훈','장재원','피어슨','시그니처','킬러','준킬러'];
const teacherMonth = {};
for (const t of TEACHERS) teacherMonth[t] = {};
const { rows: teachMsgs } = await pg.query(`
  select to_char(date_trunc('month', sent_at + interval '9 hours'), 'YYYY-MM') ym, message
  from kakao_partner_messages where sender_type='user' and message is not null
`);
for (const r of teachMsgs) {
  for (const t of TEACHERS) {
    if (r.message.includes(t)) teacherMonth[t][r.ym] = (teacherMonth[t][r.ym] || 0) + 1;
  }
}

// ─── 9. 단일 카테고리 deep dive: 통합회원 추이 ────────────────────────────
console.error('[9] 통합회원 deep dive...');
const { rows: integDeep } = await pg.query(`
  with first_user as (
    select distinct on (chat_id) chat_id, message, sent_at
    from kakao_partner_messages where sender_type='user' order by chat_id, sent_at
  )
  select to_char(date_trunc('week', sent_at + interval '9 hours'), 'YYYY-MM-DD') week,
    count(*) total,
    count(*) filter (where message ~* '이관|통합|연동') integ,
    count(*) filter (where message ~* 'PASS|본인인증') pass_auth
  from first_user
  group by week order by week
`);

// 결과 저장
const OUT = '/Users/layr8x/Library/Mobile Documents/com~apple~CloudDocs/MacStudio-MJ/ams-wiki/docs/cs-analysis-package';
const result = {
  monthly_category: monthly,
  hour_category: hourCat,
  category_response_by_month: catRespAgg,
  manager_specialty: mgrSpecialty,
  repeat_customers: repeat,
  negative_correlation: {
    negative: { ...stat(negCorr.neg.resp), drop_rate: ((negCorr.neg.drop/negCorr.neg.total)*100).toFixed(1)+'%', total: negCorr.neg.total },
    positive_neutral: { ...stat(negCorr.pos_neutral.resp), drop_rate: ((negCorr.pos_neutral.drop/negCorr.pos_neutral.total)*100).toFixed(1)+'%', total: negCorr.pos_neutral.total },
  },
  resolution_pattern: Object.entries(resPattern).map(([cat, v]) => ({
    category: cat, total: v.total, no_follow_up: v.no_follow_up,
    no_follow_pct: ((v.no_follow_up/v.total)*100).toFixed(1)+'%',
  })).sort((a, b) => b.total - a.total),
  teacher_seasonality: teacherMonth,
  integration_weekly: integDeep,
};
fs.writeFileSync(OUT + '/12_deep_analysis.json', JSON.stringify(result, null, 2));
console.error('[done] 12_deep_analysis.json');

// 핵심 발견 콘솔 출력
console.log('\n=== 핵심 발견 ===');
console.log('1. 부정감정 vs 일반 응답시간/드롭:');
console.log('   부정:', result.negative_correlation.negative);
console.log('   일반:', result.negative_correlation.positive_neutral);
console.log('\n2. resolution pattern (top 5):');
for (const r of result.resolution_pattern.slice(0, 5)) console.log('  ', r);
console.log('\n3. 반복 고객 top 5:');
for (const r of repeat.slice(0, 5)) console.log('  ', r);
console.log('\n4. 매니저 specialty (차*희 vs 황*규):');
console.log('  차*희:', mgrSpecialty['차*희']);
console.log('  황*규:', mgrSpecialty['황*규']);
console.log('\n5. 통합회원 주간 추이 (마지막 5주):');
for (const r of integDeep.slice(-5)) console.log('  ', r);

await pg.end();

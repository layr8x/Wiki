#!/usr/bin/env node
// 시대인재 마이클래스 CS 교차 분석
// 입력:
//   1) myclass: supabase kakao_partner_messages (14,250건, 25-12 ~ 26-05)
//   2) 단과 오픈채팅: uploads/단과_kakao_chats_-260310.csv
// 산출:
//   docs/CS_분석리포트.md (마크다운)
//   docs/CS_분석리포트.html (HTML)

import fs from 'node:fs';
import { Client } from 'pg';

const pg = new Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: true },
});
await pg.connect();

// ─── 분류 규칙 ────────────────────────────────────────────────────────────
// 고객 상담 카테고리 (12개)
const CATEGORY_RULES = {
  '영상재생/콘텐츠':       /(재생|버퍼|버벅|끊김|화질|로딩|튕김|로딩|영상|동영상|복습|다운로드|VOD|vod|플레이어|시청)/i,
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
  '기타':                  /^/, // 모든 카테고리 누락 시 fallback
};

// 직원 내부 이슈 카테고리 (8개)
const STAFF_RULES = {
  '계정이관/통합':         /(이관|통합|로컬 미사용|통합계정|중복|회원이관)/i,
  '출결 시스템':           /(출석|결석|QR|qr|출석부|체크인)/i,
  '결제/환불 오류':        /(환불|결제|결제오류|중복결제|결제 취소)/i,
  '수강료/청구 오류':      /(수강료|청구|미납|수업료|학원비)/i,
  '영상/콘텐츠 시스템':    /(영상|재생|업로드|복습|VOD|vod|동영상)/i,
  '회원검색/학사정보':     /(회원검색|학사정보|학사관리|학적)/i,
  '대기/수강신청':         /(대기|신청 접수|수강신청)/i,
  '기타':                  /^/,
};

// 부정 감정 키워드
const NEGATIVE = /(안 ?돼|안되|안 되|안 됨|안돼요|되지 않|되지않|왜|아직도|또|다시|짜증|불편|불만|이상|이상해|이상함|문제|오류|에러|에러나|문제 ?있|버그|먹통|꺼|꺼져|꺼졌|튕|튕겨|튕김|렉|렉걸|렉걸려|느려|느림|급해|급함|화|화나|짜증|짜증나|당황|불안|곤란|답답|답답해|답답함|일주일|며칠|몇 ?일|왜 ?이래|어이없|미치|미쳤|망함|망|환불.{0,4}안|확인.{0,4}안)/i;
const POSITIVE = /(감사|고맙|좋아요|좋습니다|친절|빨라|빠른|만족|이해|알겠|확인|좋네요|됐어요|되네요|잘 ?돼|잘되|네 ?감사)/i;

function classify(msg, rules) {
  if (!msg) return '기타';
  for (const [cat, re] of Object.entries(rules)) {
    if (cat === '기타') continue;
    if (re.test(msg)) return cat;
  }
  return '기타';
}

function sentiment(msg) {
  if (!msg) return { polarity: 'neutral', neg: 0, pos: 0 };
  const negHits = (msg.match(new RegExp(NEGATIVE, 'g')) || []).length;
  const posHits = (msg.match(new RegExp(POSITIVE, 'g')) || []).length;
  if (negHits > posHits) return { polarity: 'negative', neg: negHits, pos: posHits };
  if (posHits > negHits) return { polarity: 'positive', neg: negHits, pos: posHits };
  return { polarity: 'neutral', neg: negHits, pos: posHits };
}

// ─── 1) 고객 채팅 — supabase 14,250건 분류 ────────────────────────────────
console.error('[1] loading myclass messages from supabase...');
const { rows: msgs } = await pg.query(`
  select m.chat_id, c.nickname, m.sender_type, m.message, m.sent_at,
    extract(epoch from m.sent_at) sent_epoch
  from kakao_partner_messages m
  left join kakao_partner_chats c on c.chat_id = m.chat_id
  where m.message is not null
  order by m.chat_id, m.sent_at
`);
console.error(`  loaded ${msgs.length} messages`);

// 채팅별 묶기 + 첫 user 메시지로 카테고리 결정
const chats = new Map();
for (const m of msgs) {
  if (!chats.has(m.chat_id)) {
    chats.set(m.chat_id, { chat_id: m.chat_id, nickname: m.nickname, msgs: [] });
  }
  chats.get(m.chat_id).msgs.push(m);
}
console.error(`  ${chats.size} chats`);

// 채팅별 카테고리·감정·응답시간
const chatStats = [];
for (const c of chats.values()) {
  const userMsgs = c.msgs.filter((m) => m.sender_type === 'user');
  const mgrMsgs = c.msgs.filter((m) => m.sender_type === 'manager');
  // 카테고리 = 모든 user 메시지 concat 으로 판정 (첫 메시지 외 후속도 반영)
  const userText = userMsgs.map((m) => m.message).join(' ').slice(0, 2000);
  const category = classify(userText, CATEGORY_RULES);

  // 감정 = user 메시지 전체에서 누적 hit
  let negSum = 0, posSum = 0;
  for (const u of userMsgs) {
    const s = sentiment(u.message);
    negSum += s.neg; posSum += s.pos;
  }
  const polarity = negSum > posSum ? 'negative' : posSum > negSum ? 'positive' : 'neutral';

  // 응답시간: 첫 user 메시지 → 첫 manager 메시지
  let firstResp = null;
  for (let i = 0; i < c.msgs.length; i++) {
    if (c.msgs[i].sender_type === 'user') {
      for (let j = i + 1; j < c.msgs.length; j++) {
        if (c.msgs[j].sender_type === 'manager') {
          firstResp = (Number(c.msgs[j].sent_epoch) - Number(c.msgs[i].sent_epoch)) / 60;
          break;
        }
      }
      break;
    }
  }
  // 대표 user 메시지 (가장 긴 것)
  const repr = userMsgs.slice().sort((a, b) => (b.message?.length || 0) - (a.message?.length || 0))[0]?.message || '';

  chatStats.push({
    chat_id: c.chat_id,
    nickname: c.nickname,
    category,
    polarity,
    negSum, posSum,
    user_msgs: userMsgs.length,
    mgr_msgs: mgrMsgs.length,
    first_resp_min: firstResp,
    representative: repr.slice(0, 200),
    sent_at_first: c.msgs[0]?.sent_at,
  });
}

// 카테고리 집계
function summarize(stats, rules) {
  const cats = Object.keys(rules);
  const agg = {};
  for (const cat of cats) agg[cat] = { count: 0, neg: 0, pos: 0, resp: [] };
  for (const s of stats) {
    if (!agg[s.category]) agg[s.category] = { count: 0, neg: 0, pos: 0, resp: [] };
    agg[s.category].count++;
    if (s.polarity === 'negative') agg[s.category].neg++;
    if (s.polarity === 'positive') agg[s.category].pos++;
    if (s.first_resp_min != null) agg[s.category].resp.push(s.first_resp_min);
  }
  const total = stats.length;
  return Object.entries(agg)
    .map(([cat, v]) => {
      const resp = v.resp.slice().sort((a, b) => a - b);
      const median = resp.length ? resp[Math.floor(resp.length / 2)] : null;
      const avg = resp.length ? resp.reduce((a, b) => a + b, 0) / resp.length : null;
      return {
        category: cat,
        count: v.count,
        pct: total ? ((v.count / total) * 100).toFixed(1) : '0',
        neg_count: v.neg,
        neg_pct: v.count ? ((v.neg / v.count) * 100).toFixed(1) : '0',
        median_resp_min: median != null ? median.toFixed(1) : null,
        avg_resp_min: avg != null ? avg.toFixed(1) : null,
      };
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
}

const myclassSummary = summarize(chatStats, CATEGORY_RULES);
console.error('[1] myclass summary ready, top:', myclassSummary[0]);

// ─── 2) 단과 오픈채팅 CSV 파싱 ────────────────────────────────────────────
console.error('[2] loading 단과 CSV...');
const DANGUA_PATH = process.env.DANGUA_CSV ||
  '/Users/layr8x/Library/Application Support/Claude/local-agent-mode-sessions/60b1cdb6-51c7-412d-bf67-13eca0e665ec/a0920c98-0b1a-4b0d-85ad-b8db77d32766/local_6d744ee6-3535-4799-b92b-99906a45de0b/uploads/단과_kakao_chats_-260310.csv';
const danguaCSV = fs.readFileSync(DANGUA_PATH, 'utf8');
// 간단 CSV 파서
const danguaRows = (() => {
  const lines = danguaCSV.replace(/^﻿/, '').split(/\r?\n/);
  const header = lines[0].split(',');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.trim()) continue;
    // Date, User, Message 패턴: "yyyy-mm-dd hh:mm:ss","..","..."
    const m = ln.match(/^([^,]+),"([^"]*)","(.*)"$/);
    if (m) out.push({ Date: m[1], User: m[2], Message: m[3] });
    else {
      // 멀티라인 인용문 대응: 다음 줄들이 따옴표 닫힘 까지 누적
      let buf = ln;
      while (i + 1 < lines.length && (buf.match(/"/g) || []).length % 2 === 1) {
        i++; buf += '\n' + lines[i];
      }
      const m2 = buf.match(/^([^,]+),"([^"]*)","((?:.|\n)*)"$/);
      if (m2) out.push({ Date: m2[1], User: m2[2], Message: m2[3] });
    }
  }
  return out;
})();
// 실질 이슈 메시지 (User 가 있고 시스템 메시지 아닌 것)
const staffRows = danguaRows.filter((r) => r.User && r.User !== '' && !r.Message.includes('카카오톡 대화'));
console.error(`  staff rows: ${staffRows.length}`);

const staffStats = staffRows.map((r) => ({
  date: r.Date,
  user: r.User,
  msg: r.Message,
  category: classify(r.Message, STAFF_RULES),
  polarity: sentiment(r.Message).polarity,
}));
const staffSummary = summarize(staffStats, STAFF_RULES);
console.error('[2] dangua summary ready, top:', staffSummary[0]);

// ─── 3) 시즌별 (월별) 신규 채팅 ────────────────────────────────────────────
const monthly = (await pg.query(`
  with first_msg as (
    select chat_id, min(sent_at) first_at from kakao_partner_messages group by chat_id
  )
  select to_char(date_trunc('month', first_at + interval '9 hours'), 'YYYY-MM') ym,
    count(*) new_chats
  from first_msg group by ym order by ym
`)).rows;

// ─── 4) 매니저 부하 ───────────────────────────────────────────────────────
const mgrLoad = (await pg.query(`
  select raw->'manager'->>'name' name, count(*) msgs, count(distinct chat_id) chats
  from kakao_partner_messages
  where sender_type='manager' and raw->'manager' is not null
  group by name order by msgs desc limit 15
`)).rows;

// ─── 5) 운영시간 응답 시간 ────────────────────────────────────────────────
const respByBucket = (await pg.query(`
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
    count(*) filter (where wait_min <= 30) le30
  from pairs group by bucket order by bucket
`)).rows;

// ─── 6) 채팅 종료 패턴 (드롭) ─────────────────────────────────────────────
const dropPattern = (await pg.query(`
  with last_msg as (
    select distinct on (chat_id) chat_id, sender_type
    from kakao_partner_messages order by chat_id, sent_at desc
  )
  select sender_type, count(*) n from last_msg group by sender_type
`)).rows;

// ─── 7) 대표 메시지 (representative) — 카테고리별 ──────────────────────────
const topByCat = {};
for (const cat of Object.keys(CATEGORY_RULES)) {
  if (cat === '기타') continue;
  topByCat[cat] = chatStats
    .filter((s) => s.category === cat && s.representative.length > 20)
    .sort((a, b) => b.representative.length - a.representative.length)
    .slice(0, 3)
    .map((s) => ({
      nickname: s.nickname,
      polarity: s.polarity,
      excerpt: s.representative.slice(0, 150),
    }));
}

await pg.end();

const out = {
  myclass: {
    total_chats: chatStats.length,
    total_messages: msgs.length,
    summary: myclassSummary,
    top_by_category: topByCat,
  },
  dangua: {
    total_messages: staffRows.length,
    unique_users: new Set(staffRows.map((r) => r.User)).size,
    summary: staffSummary,
  },
  monthly_new_chats: monthly,
  manager_load: mgrLoad,
  response_time: respByBucket,
  drop_pattern: dropPattern,
};

fs.writeFileSync('/tmp/cs_analysis.json', JSON.stringify(out, null, 2));
console.error('[done] /tmp/cs_analysis.json');
console.log(JSON.stringify({ myclass: out.myclass.summary, dangua: out.dangua.summary }, null, 2));

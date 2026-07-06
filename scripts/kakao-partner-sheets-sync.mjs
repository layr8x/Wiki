#!/usr/bin/env node
// scripts/kakao-partner-sheets-sync.mjs
// Supabase kakao_partner_messages → 기존 Google Sheet 채널별 탭에 증분 append.
// 인증: GCP 서비스계정(JSON) RS256 JWT (googleapis 의존성 없음).
// 커서: 채널별 마지막 log_id (state 파일). 신규(log_id > 커서)만 append → 중복/누락 없음.
// 보낸이: 상담원(차*희) / 고객(송유림) / 시스템
//
// 사전 준비:
//  1) GCP 서비스계정 생성 + Sheets API 사용 설정 + JSON 키 다운로드
//  2) 대상 시트를 서비스계정 client_email 로 "편집자" 공유
//  3) JSON 키를 ./google-service-account.json 에 두거나 GOOGLE_APPLICATION_CREDENTIALS 로 경로 지정
// 실행: npm run kakao:sheets-sync

import { getAdminClient } from './lib/supabase-admin.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sb = getAdminClient();
const SHEET_ID = process.env.KAKAO_SHEETS_ID || '1mDuH5aBDVQm8N1kBjFev1VGUmHtOoFasyuv-k8pKiIw';
const CRED_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'google-service-account.json');
const STATE_PATH = path.join(process.cwd(), '.sheets-sync-state.json');
const CHANNELS = [
  { id: '_VGAQn', tab: '마이클래스' },
  { id: '_rcpPG', tab: 'LIVE' },
  { id: '_TkpPG', tab: 'LIVE 기술지원' },
  { id: '_xfxilXn', tab: '콘텐츠' },
  { id: '_rkbcn', tab: '통합로그인' },
];
const HEADER = ['보낸시각(KST)', '보낸이', '채팅ID', '메시지유형', '메시지'];
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

function senderText(m, nick) {
  if (m.sender_type === 'manager') return m.manager_name ? '상담원(' + m.manager_name + ')' : '상담원';
  if (m.sender_type === 'user') { const n = nick.get(String(m.chat_id)) || ''; return n ? '고객(' + n + ')' : '고객'; }
  return '시스템';
}
function clean(s) {
  if (s == null) return '';
  let o = '';
  for (const c of String(s)) { const k = c.charCodeAt(0); o += (k < 32 || k === 127) ? ' ' : c; }
  return o.replace(/\s+/g, ' ').trim();
}
function kst(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso)).replace('T', ' ');
  } catch { return iso; }
}
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function getAccessToken(cred) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: cred.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + claim);
  const sig = b64url(signer.sign(cred.private_key));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + header + '.' + claim + '.' + sig,
  });
  const j = await res.json();
  if (!res.ok) throw new Error('token error: ' + JSON.stringify(j));
  return j.access_token;
}
async function gfetch(token, url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(opts.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('sheets ' + res.status + ': ' + JSON.stringify(j).slice(0, 300));
  return j;
}
async function ensureTabs(token) {
  const meta = await gfetch(token, SHEETS + '/' + SHEET_ID + '?fields=sheets.properties(title)');
  const existing = new Set((meta.sheets || []).map((s) => s.properties.title));
  const toAdd = CHANNELS.filter((c) => !existing.has(c.tab));
  if (toAdd.length) {
    await gfetch(token, SHEETS + '/' + SHEET_ID + ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: toAdd.map((c) => ({ addSheet: { properties: { title: c.tab } } })) }) });
    for (const c of toAdd) {
      await gfetch(token, SHEETS + '/' + SHEET_ID + '/values/' + encodeURIComponent("'" + c.tab + "'!A1") + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { method: 'POST', body: JSON.stringify({ values: [HEADER] }) });
    }
    console.log('created tabs:', toAdd.map((c) => c.tab).join(', '));
  }
}
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return {}; } }
function saveState(s) { fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); }
async function nickmap(pid) {
  const map = new Map();
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('kakao_partner_chats').select('chat_id,nickname').eq('profile_id', pid).order('chat_id').range(f, f + 999);
    if (!data || !data.length) break;
    for (const r of data) map.set(String(r.chat_id), r.nickname || '');
    if (data.length < 1000) break;
  }
  return map;
}
async function syncChannel(token, ch, state) {
  let cursor = state[ch.id] || '0';
  const nick = await nickmap(ch.id);
  let appended = 0;
  for (;;) {
    const { data, error } = await sb.from('kakao_partner_messages')
      .select('log_id,chat_id,sender_type,message,message_type,sent_at, manager_name:raw->manager->>name')
      .eq('profile_id', ch.id).gt('log_id', cursor).order('log_id', { ascending: true }).limit(2000);
    if (error) throw error;
    if (!data || !data.length) break;
    const values = data.map((m) => [kst(m.sent_at), senderText(m, nick), m.chat_id, m.message_type || '', clean(m.message)]);
    await gfetch(token, SHEETS + '/' + SHEET_ID + '/values/' + encodeURIComponent("'" + ch.tab + "'!A1") + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { method: 'POST', body: JSON.stringify({ values }) });
    appended += values.length;
    cursor = data[data.length - 1].log_id;
    state[ch.id] = cursor;
    saveState(state);
    if (data.length < 2000) break;
  }
  console.log(ch.tab + ': +' + appended + ' rows (cursor=' + cursor + ')');
  return appended;
}
async function main() {
  if (!fs.existsSync(CRED_PATH)) {
    console.error('[sheets-sync] 서비스계정 키 없음: ' + CRED_PATH + '\n  GCP 서비스계정 JSON을 이 경로에 두고, 시트를 그 client_email로 편집자 공유하세요.');
    process.exit(2);
  }
  const cred = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const token = await getAccessToken(cred);
  await ensureTabs(token);
  const state = loadState();
  let total = 0;
  for (const ch of CHANNELS) total += await syncChannel(token, ch, state);
  console.log('[sheets-sync] done. appended ' + total + ' rows @ ' + new Date().toISOString());
}
main().catch((e) => { console.error('[sheets-sync] fatal', e.message); process.exit(1); });

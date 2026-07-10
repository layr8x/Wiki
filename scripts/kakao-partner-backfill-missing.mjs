#!/usr/bin/env node
// 메시지 0건인 채팅(아직 백필 안 된)만 처리
import { KakaoPartnerClient } from './lib/kakao-partner-client.mjs';
import { getAdminClient } from './lib/supabase-admin.mjs';
import { Client as PgClient } from 'pg';

const PROFILE_ID = process.env.KAKAO_PARTNER_PROFILE_ID;
const COOKIE = process.env.KAKAO_PARTNER_COOKIE;

const client = new KakaoPartnerClient({ cookie: COOKIE, profileId: PROFILE_ID });
const supabase = getAdminClient();

// pg 로 직접 조회 (limit 우회)
const pg = new PgClient({
  connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: true },
});
await pg.connect();
const { rows } = await pg.query(`
  select c.chat_id, c.nickname
  from kakao_partner_chats c
  where c.profile_id = $1
    and not exists (select 1 from kakao_partner_messages m where m.chat_id = c.chat_id)
  order by c.last_log_send_at desc nulls last
`, [PROFILE_ID]);
await pg.end();
console.log(`[plan] ${rows.length} chats missing messages`);

function logToRow(item, chatId) {
  const isManager = !!item.manager;
  const author = item.author || {};
  const senderType = isManager ? 'manager' : (author.user_type === 0 ? 'user' : 'system');
  const senderId = isManager ? String(item.manager?.id ?? '') : String(author.id ?? '');
  return {
    log_id: String(item.id),
    chat_id: String(chatId),
    profile_id: PROFILE_ID,
    sender_type: senderType,
    sender_id: senderId || null,
    message: item.message ?? item.text ?? item.content ?? null,
    message_type: item.type ?? null,
    attachments: item.attachment && Object.keys(item.attachment).length ? item.attachment : null,
    sent_at: item.send_at ? new Date(item.send_at).toISOString() : (item.created_at ? new Date(item.created_at).toISOString() : null),
    raw: item,
    source: 'rest_backfill',
  };
}

async function backfillChat(chatId) {
  let total = 0;
  let oldest = null;
  for (let p = 0; p < 50; p++) {
    const qs = p === 0 ? 'size=500' : `since=${oldest}&direction=prev&size=500`;
    let res;
    try { res = await client._fetch(`/api/profiles/${PROFILE_ID}/chats/${chatId}/chatlogs?${qs}`); }
    catch (e) { return { total, error: e.message }; }
    const items = res?.items || [];
    if (!items.length) break;
    const docs = items.map((it) => logToRow(it, chatId));
    const { error } = await supabase.from('kakao_partner_messages').upsert(docs, { onConflict: 'log_id' });
    if (error) return { total, error: error.message };
    total += docs.length;
    oldest = docs[0].log_id;
    if (!res.has_prev) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return { total };
}

const CONC = 8;
const queue = rows.slice();
const start = Date.now();
let grand = 0, done = 0;
async function worker() {
  while (queue.length) {
    const c = queue.shift();
    if (!c) break;
    const { total, error } = await backfillChat(c.chat_id);
    grand += total; done++;
    if (done % 20 === 0 || done === rows.length) {
      const eta = ((Date.now()-start)/done*(rows.length-done)/1000).toFixed(0);
      console.log(`[${done}/${rows.length}] grand=${grand} eta=${eta}s`);
    }
    if (error) console.error(`  [${c.chat_id}] ${error}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}
await Promise.all(Array.from({length:CONC},worker));
console.log(`\n[done] +${grand} messages across ${rows.length} chats in ${((Date.now()-start)/1000).toFixed(1)}s`);

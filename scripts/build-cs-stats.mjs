// scripts/build-cs-stats.mjs
// 빌드 시 카카오 상담 비PII 집계를 public/cs-stats.json 으로 생성한다.
// (Vercel 서버리스 함수 12개 한도를 피하려고 라이브 API 대신 "빌드타임 정적 스냅샷"으로 운용.)
// dashboard-cs.html 이 /cs-stats.json 을 fetch. 이 스크립트는 절대 빌드를 깨지 않는다:
//   Supabase env 없거나 어떤 에러든 → 경고만 찍고 정상 종료(대시보드는 하드코딩 폴백 사용).

import { writeFileSync } from 'node:fs'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OUT = 'public/cs-stats.json'
const CH = { _xfxilXn: '시대인재C', _TkpPG: '라이브', _VGAQn: '마이클래스' }

function skip(msg) { console.warn('[build-cs-stats] 건너뜀:', msg, '— 대시보드는 스냅샷 폴백 사용'); process.exit(0) }

if (!URL || !KEY) skip('Supabase env 없음(VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')

const { createClient } = await import('@supabase/supabase-js').catch(() => ({}))
if (!createClient) skip('@supabase/supabase-js 로드 실패')
const sb = createClient(URL, KEY)

async function pageAll(table, columns, filter) {
  const rows = []
  const size = 1000
  for (let from = 0; ; from += size) {
    let q = sb.from(table).select(columns).range(from, from + size - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < size) break
  }
  return rows
}
async function countOf(table, filter) {
  let q = sb.from(table).select('*', { count: 'exact', head: true })
  if (filter) q = filter(q)
  const { count, error } = await q
  if (error) throw error
  return count || 0
}

try {
  const now = Date.now()

  // 1) 대화: profile_id + category 전수 → 채널/카테고리 집계
  const chats = await pageAll('kakao_partner_chats', 'profile_id,category')
  const totalChats = chats.length
  const catAll = {}, perCh = {}
  for (const r of chats) {
    const cat = r.category || '기타'
    catAll[cat] = (catAll[cat] || 0) + 1
    const ch = CH[r.profile_id] || r.profile_id
    perCh[ch] = perCh[ch] || { total: 0, cats: {} }
    perCh[ch].total++
    perCh[ch].cats[cat] = (perCh[ch].cats[cat] || 0) + 1
  }

  // 2) 채널: 메시지 수 + 마지막 메시지 시각
  const chMeta = {}
  for (const pid of Object.keys(CH)) {
    const messages = await countOf('kakao_partner_messages', (q) => q.eq('profile_id', pid))
    const { data: lm } = await sb.from('kakao_partner_messages').select('sent_at').eq('profile_id', pid)
      .order('sent_at', { ascending: false }).limit(1)
    chMeta[pid] = { messages, lastMsg: lm && lm[0] ? lm[0].sent_at : null }
  }
  const channels = Object.keys(CH).map((pid) => ({
    name: CH[pid], messages: chMeta[pid].messages,
    chats: (perCh[CH[pid]] && perCh[CH[pid]].total) || 0, lastMsg: chMeta[pid].lastMsg,
  })).sort((a, b) => b.messages - a.messages)
  const totalMsgs = channels.reduce((s, c) => s + c.messages, 0)

  // 3) 카테고리 분포(전체) + 채널별 상위3('기타' 제외)
  const categories = Object.entries(catAll).map(([name, n]) => ({ name, pct: (n / totalChats) * 100 }))
    .sort((a, b) => b.pct - a.pct)
  const channelTop = {}
  for (const [ch, v] of Object.entries(perCh)) {
    channelTop[ch] = Object.entries(v.cats).filter(([c]) => c !== '기타')
      .map(([cat, n]) => ({ cat, pct: (n / v.total) * 100 })).sort((a, b) => b.pct - a.pct).slice(0, 3)
  }

  // 4) 발신자 구성
  const senderSplit = []
  for (const t of ['user', 'manager', 'system']) {
    const n = await countOf('kakao_partner_messages', (q) => q.eq('sender_type', t))
    senderSplit.push({ type: t, pct: totalMsgs ? (n / totalMsgs) * 100 : 0 })
  }

  // 5) 일별 추세 (최근 22일)
  const cutoff = new Date(now - 21 * 86400000); cutoff.setHours(0, 0, 0, 0)
  const recent = await pageAll('kakao_partner_messages', 'sent_at', (q) => q.gte('sent_at', cutoff.toISOString()))
  const byDay = {}
  for (const r of recent) { const k = String(r.sent_at).slice(5, 10); byDay[k] = (byDay[k] || 0) + 1 }
  const dailyTrend = []
  for (let i = 21; i >= 0; i--) {
    const dt = new Date(now - i * 86400000)
    const k = String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0')
    dailyTrend.push({ d: k, msgs: byDay[k] || 0 })
  }

  // 6) health
  const { data: states } = await sb.from('kakao_partner_stream_state')
    .select('profile_id,last_heartbeat_at,last_error,last_error_at')
  const health = (states || []).map((s) => {
    const errRecent = s.last_error && s.last_error_at && now - new Date(s.last_error_at).getTime() < 15 * 60000
    const last = chMeta[s.profile_id] && chMeta[s.profile_id].lastMsg
    const hrsSinceMsg = last ? (now - new Date(last).getTime()) / 3600000 : Infinity
    const hbAge = s.last_heartbeat_at ? (now - new Date(s.last_heartbeat_at).getTime()) / 60000 : Infinity
    let status = '🟢'
    if (errRecent) status = '🔴'
    else if (hrsSinceMsg > 6 || hbAge > 15) status = '🟠'
    return { channel: CH[s.profile_id] || s.profile_id, status }
  })

  const payload = {
    totals: { messages: totalMsgs, chats: totalChats, channels: channels.length },
    channels, categories, channelTop, senderSplit, dailyTrend, health,
    asOf: new Date(now).toISOString(),
  }
  writeFileSync(OUT, JSON.stringify(payload))
  console.log(`[build-cs-stats] ${OUT} 생성 — 메시지 ${totalMsgs} / 대화 ${totalChats} / health ${health.map((h) => h.status).join('')}`)
} catch (e) {
  skip('집계 중 오류: ' + (e && e.message))
}

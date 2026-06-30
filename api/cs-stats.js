// api/cs-stats.js
// 카카오 3채널 상담 라이브 대시보드용 비PII(개인정보 없음) 집계 API.
//
// 반환: 누적 메시지/대화 수, 채널별 수집량, 문의 유형 분포, 채널별 상위 유형,
//       발신자 구성, 일별 수집 추세(최근 21일), 채널별 수집 건강도(health).
//   → public/dashboard-cs.html 이 이 엔드포인트를 fetch 해 렌더한다.
//
// 설계 노트:
// - Supabase JS 에는 GROUP BY 가 없어, 큰 테이블(messages 8.5만행)은 전수 스캔을 피하고
//   count+head(행 전송 없음) 쿼리를 채널/발신자별로 반복해 집계한다.
// - 분포가 필요한 category(chats 7천행)는 컬럼 1개만 페이지로 받아 JS 에서 집계.
// - 일별 추세는 최근 21일 sent_at 만 select(트래픽 최소화).
// - health 판정 로직은 api/cs-health-alert.js 와 동일 규칙(같은 운영 기준).
// - 캐시: s-maxage=300(5분) — Vercel 엣지에서 5분 캐싱, 백그라운드 갱신.
// - 개인정보 원문(메시지 본문·발신자명)은 일절 반환하지 않는다(집계 수치만).

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// profile_id → 채널 표시명 (수집 스트림과 동일 매핑)
const CHANNEL = { _xfxilXn: '시대인재C', _TkpPG: '라이브', _VGAQn: '마이클래스' }
const PROFILE_IDS = Object.keys(CHANNEL)

// ── 헬스 판정 (api/cs-health-alert.js 와 동일 규칙) ──
function classifyHealth(s, lastMsgAt, now) {
  const errRecent =
    !!(s.last_error && s.last_error_at && now - new Date(s.last_error_at).getTime() < 15 * 60 * 1000)
  const hbAgeMin = s.last_heartbeat_at ? (now - new Date(s.last_heartbeat_at).getTime()) / 60000 : Infinity
  const hrsSinceMsg = lastMsgAt ? (now - new Date(lastMsgAt).getTime()) / 3600000 : Infinity
  let status = '🟢'
  if (errRecent) status = '🔴'
  else if (hrsSinceMsg > 6) status = '🟠'
  else if (hbAgeMin > 15) status = '🟠'
  return {
    errRecent,
    hbAgeMin: Number.isFinite(hbAgeMin) ? Math.round(hbAgeMin * 10) / 10 : null,
    hrsSinceMsg: Number.isFinite(hrsSinceMsg) ? Math.round(hrsSinceMsg * 10) / 10 : null,
    status,
  }
}

// 필터 조건으로 행 수만(head:true → 본문 전송 없음) 센다.
async function countRows(table, apply) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true })
  if (apply) q = apply(q)
  const { count, error } = await q
  if (error) throw error
  return count || 0
}

// 채널별 최신 메시지 시각 (profile_id별 max(sent_at))
async function lastMsgPerChannel() {
  const out = {}
  for (const pid of PROFILE_IDS) {
    const { data } = await supabase
      .from('kakao_partner_messages')
      .select('sent_at')
      .eq('profile_id', pid)
      .order('sent_at', { ascending: false })
      .limit(1)
    out[pid] = data && data[0] ? data[0].sent_at : null
  }
  return out
}

// 한 컬럼만 페이지로 전부 받아 JS 에서 카운트 (chats 7천행 정도에 적합).
async function fetchColumn(table, columns, pageSize = 1000) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
  }
  return rows
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const now = Date.now()

    // 1) 누적 총계 (head count → 행 전송 없음)
    const [messagesTotal, chatsTotal] = await Promise.all([
      countRows('kakao_partner_messages'),
      countRows('kakao_partner_chats'),
    ])

    // 2) 채널별 메시지/대화 수 (채널마다 count 쿼리 — 전수 스캔 회피)
    const channelCounts = await Promise.all(
      PROFILE_IDS.map(async (pid) => {
        const [msgs, chats] = await Promise.all([
          countRows('kakao_partner_messages', (q) => q.eq('profile_id', pid)),
          countRows('kakao_partner_chats', (q) => q.eq('profile_id', pid)),
        ])
        return { pid, name: CHANNEL[pid], chats, messages: msgs }
      })
    )

    // 3) 발신자 구성 (user/manager/system count)
    const SENDERS = ['user', 'manager', 'system']
    const senderCounts = await Promise.all(
      SENDERS.map((t) => countRows('kakao_partner_messages', (q) => q.eq('sender_type', t)))
    )
    const senderSplit = SENDERS.map((type, i) => ({
      type,
      pct: pct(senderCounts[i], messagesTotal),
    }))

    // 4) 문의 유형 분포 + 채널별 상위 유형 — chats 의 category 만 페이지로 받아 집계
    const chatRows = await fetchColumn('kakao_partner_chats', 'profile_id,category,last_log_send_at')
    const catTotal = {}            // 전체 유형별 건수
    const catByChannel = {}        // 채널별 유형별 건수
    const chatLastSend = {}        // 채널별 last_log_send_at max (보조 신선도)
    for (const pid of PROFILE_IDS) catByChannel[pid] = {}
    for (const r of chatRows) {
      const cat = r.category || '기타'
      catTotal[cat] = (catTotal[cat] || 0) + 1
      if (catByChannel[r.profile_id]) {
        catByChannel[r.profile_id][cat] = (catByChannel[r.profile_id][cat] || 0) + 1
      }
      if (r.last_log_send_at) {
        const cur = chatLastSend[r.profile_id]
        if (!cur || r.last_log_send_at > cur) chatLastSend[r.profile_id] = r.last_log_send_at
      }
    }
    const chatsDenom = chatRows.length || chatsTotal
    const categories = Object.entries(catTotal)
      .map(([name, n]) => ({ name, n, pct: pct(n, chatsDenom) }))
      .sort((a, b) => b.n - a.n)
      .map(({ name, pct }) => ({ name, pct }))

    // 채널별 상위 3 유형 ('기타' 제외, 채널 내 비중)
    const channelTop = {}
    for (const pid of PROFILE_IDS) {
      const tot = Object.values(catByChannel[pid]).reduce((s, v) => s + v, 0)
      channelTop[CHANNEL[pid]] = Object.entries(catByChannel[pid])
        .filter(([c]) => c !== '기타')
        .map(([cat, n]) => ({ cat, pct: pct(n, tot) }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 3)
    }

    // 5) 일별 수집 추세 (최근 21일, KST 기준 날짜) — 기간 필터 + sent_at 만 select
    //    (전수 스캔 방지: gte(since) 필터로 최근 21일치만 가져온다)
    const since = new Date(now - 21 * 24 * 3600 * 1000).toISOString()
    const dailyTrend = await (async () => {
      const map = {}
      const pageSize = 1000
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from('kakao_partner_messages')
          .select('sent_at')
          .gte('sent_at', since)
          .order('sent_at', { ascending: true })
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        for (const r of data) {
          // UTC → KST(+9) 날짜로 그룹핑
          const d = new Date(new Date(r.sent_at).getTime() + 9 * 3600 * 1000)
          const key = `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
          map[key] = (map[key] || 0) + 1
        }
        if (data.length < pageSize) break
      }
      return Object.entries(map)
        .map(([d, msgs]) => ({ d, msgs }))
        .sort((a, b) => (a.d < b.d ? -1 : 1))
        .slice(-21)
    })()

    // 6) health — stream_state + 채널별 최신 메시지 시각
    const { data: states } = await supabase
      .from('kakao_partner_stream_state')
      .select('profile_id,last_heartbeat_at,last_error,last_error_at')
    const lastMsg = await lastMsgPerChannel()
    const health = (states || []).map((s) => {
      const c = classifyHealth(s, lastMsg[s.profile_id], now)
      return {
        channel: CHANNEL[s.profile_id] || s.profile_id,
        hbAgeMin: c.hbAgeMin,
        errRecent: c.errRecent,
        hrsSinceMsg: c.hrsSinceMsg,
        status: c.status,
      }
    })

    // 채널 응답 (메시지 desc) — lastMsg 시각 부착
    const channels = channelCounts
      .map((c) => ({
        name: c.name,
        chats: c.chats,
        messages: c.messages,
        lastMsg: lastMsg[c.pid] || chatLastSend[c.pid] || null,
      }))
      .sort((a, b) => b.messages - a.messages)

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json({
      totals: { messages: messagesTotal, chats: chatsTotal, channels: PROFILE_IDS.length },
      channels,
      categories,
      channelTop,
      senderSplit,
      dailyTrend,
      health,
      asOf: new Date(now).toISOString(),
    })
  } catch (e) {
    console.error('cs-stats error:', e)
    return res.status(500).json({ error: String(e?.message || e) })
  }
}

// api/cs-health-alert.js
// 카카오 상담 수집 헬스체크 + 변화 시에만 Slack 알림 (Vercel Cron 호출).
//
// 동작: stream_state(인증오류/heartbeat) + messages 최근 수집 시각으로 채널별 건강도를 판정.
//   🔴 수집중단(최근 에러) / 🟠 신규메시지 끊김·heartbeat 끊김 / 🟢 정상.
//   직전 상태(kakao_partner_secrets.key='cs_health_last_alert')와 비교해 "바뀔 때만" 알림(스팸 방지·복구 통지).
//   SLACK_WEBHOOK_URL 환경변수가 있으면 Slack 전송, 없으면 판정 결과만 반환(no-op).
//
// 배포: vercel.json crons 에 등록(아래). 선택 보호: CRON_SECRET 설정 시 Authorization 검사.
// 참고: 더 촘촘한 주기(5분)를 원하면 기존 pg_cron(카카오 수집)과 같은 방식으로 이 URL을 호출해도 됨.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const CHANNEL = { _xfxilXn: '시대인재C', _TkpPG: '라이브', _VGAQn: '마이클래스' }

function classify(s, lastMsgAt, now) {
  const errRecent =
    s.last_error && s.last_error_at && now - new Date(s.last_error_at).getTime() < 15 * 60 * 1000
  const hbAgeMin = s.last_heartbeat_at ? (now - new Date(s.last_heartbeat_at).getTime()) / 60000 : Infinity
  const hrsSinceMsg = lastMsgAt ? (now - new Date(lastMsgAt).getTime()) / 3600000 : Infinity
  let status = '🟢', reason = '정상'
  if (errRecent) { status = '🔴'; reason = '수집중단(인증오류)' }
  else if (hrsSinceMsg > 6) { status = '🟠'; reason = '신규메시지 끊김' }
  else if (hbAgeMin > 15) { status = '🟠'; reason = 'heartbeat 끊김' }
  return { status, reason, hbAgeMin: Math.round(hbAgeMin * 10) / 10, hrsSinceMsg: Math.round(hrsSinceMsg * 10) / 10 }
}

async function lastMsgPerChannel() {
  // 채널별 최신 메시지 시각 (profile_id별 max(sent_at))
  const out = {}
  for (const pid of Object.keys(CHANNEL)) {
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

export default async function handler(req, res) {
  // 선택 보호: CRON_SECRET 설정 시 Vercel Cron 의 Authorization 검사
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'] || ''
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'unauthorized' })
    }
  }
  try {
    const now = Date.now()
    const { data: states, error } = await supabase
      .from('kakao_partner_stream_state')
      .select('profile_id,last_heartbeat_at,last_error,last_error_at')
    if (error) throw error
    const lastMsg = await lastMsgPerChannel()

    const health = (states || []).map((s) => {
      const c = classify(s, lastMsg[s.profile_id], now)
      return {
        channel: CHANNEL[s.profile_id] || s.profile_id,
        ...c,
        lastError: s.last_error ? String(s.last_error).slice(0, 80) : null,
      }
    })
    const unhealthy = health.filter((h) => h.status !== '🟢')
    const stateKey = health.map((h) => `${h.channel}:${h.status}`).sort().join('|')

    // 직전 알림 상태와 비교 (변화 시에만 알림)
    const { data: prev } = await supabase
      .from('kakao_partner_secrets')
      .select('value')
      .eq('key', 'cs_health_last_alert')
      .maybeSingle()
    const changed = !prev || prev.value !== stateKey

    let notified = false
    const webhook = process.env.SLACK_WEBHOOK_URL
    if (changed && webhook) {
      const text = unhealthy.length
        ? `🔴 카카오 상담 수집 이상\n` +
          unhealthy.map((h) => `• ${h.channel}: ${h.reason} (마지막 수집 ${h.hrsSinceMsg}h 전)`).join('\n') +
          `\n조치: 카카오 비즈채팅 쿠키 재발급 → \`npm run kakao:refresh-cookie\``
        : `🟢 카카오 상담 수집 정상 복구 — 전 채널 수집 재개`
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        notified = true
      } catch (_) { /* 전송 실패는 무시(다음 주기 재시도) */ }
    }
    // 상태 기록
    if (changed) {
      await supabase
        .from('kakao_partner_secrets')
        .upsert({ key: 'cs_health_last_alert', value: stateKey, updated_at: new Date().toISOString() })
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ ok: true, changed, notified, unhealthy: unhealthy.length, health })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) })
  }
}

// src/lib/db.js
// Supabase 데이터 접근 레이어 — mockData 폴백 포함
// Supabase 미설정 시 로컬 mockData.js에서 자동으로 데이터를 읽습니다.

import { supabase, isSupabaseEnabled } from './supabase'
import { STORAGE_KEYS } from './storageKeys'
import { GUIDES, MODULE_TREE, RECENT_GUIDES, POPULAR_GUIDES } from '../data/mockData'

// ─── helpers ────────────────────────────────────────────────────────────────

/** Supabase row → 앱 내부 guide 객체 변환 */
function rowToGuide(row) {
  return {
    id:            row.id,
    type:          row.type,
    module:        row.module,
    title:         row.title,
    tldr:          row.tldr,
    path:          row.path,
    amsUrl:        row.ams_url,
    confluenceId:  row.confluence_id,
    confluenceUrl: row.confluence_url,
    targets:       row.targets || [],
    tags:          row.tags   || [],
    author:        row.author,
    version:       row.version,
    status:        row.status,
    views:         row.views,
    helpful:       row.helpful,
    helpfulRate:   row.helpful_rate,
    steps:         row.steps,
    mainItemsTable:row.main_items_table,
    cases:         row.cases,
    cautions:      row.cautions,
    troubleTable:  row.trouble_table,
    responses:     row.responses,
    decisionTable: row.decision_table,
    referenceData: row.reference_data,
    policyDiff:    row.policy_diff,
    updated:       row.updated_at?.slice(0, 10),
    updated_at:    row.updated_at,
  }
}

// ─── 가이드 조회 ─────────────────────────────────────────────────────────────

/** 전체 가이드 목록 (Supabase 또는 mockData 폴백)
 *
 * limit 기본값이 100이던 시절, guides 테이블에는 이미 135건이 published 상태로
 * 들어 있었다. 목록 화면(GuideListPage)이 limit을 넘기지 않아 35건이 조용히 잘려
 * 나갔고, 화면에는 오류 없이 100건만 떠서 누락을 눈치채기 어려웠다.
 * 500으로 올려 여유를 둔다(현재 135건, .range는 요청 수보다 적으면 있는 만큼만 준다).
 */
export async function fetchGuides({ module: mod, type, search, limit = 500, offset = 0 } = {}) {
  if (isSupabaseEnabled) {
    let q = supabase
      .from('guides')
      .select('id,type,module,title,tldr,author,version,views,helpful,helpful_rate,targets,tags,updated_at,status')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (mod)    q = q.eq('module', mod)
    if (type)   q = q.eq('type', type)
    if (search) q = q.or(`title.ilike.%${search}%,tldr.ilike.%${search}%`)

    const { data, error } = await q
    if (error) throw error
    return (data || []).map(rowToGuide)
  }

  // ── mockData 폴백 ──────────────────────────────────────────────────────────
  let list = Object.entries(GUIDES).map(([id, g]) => ({ id, ...g }))
  if (mod)    list = list.filter(g => g.module === mod)
  if (type)   list = list.filter(g => g.type  === type)
  if (search) {
    const q = search.toLowerCase()
    list = list.filter(g =>
      g.title?.toLowerCase().includes(q) ||
      g.tldr?.toLowerCase().includes(q)
    )
  }
  return list.slice(offset, offset + limit)
}

/** 단일 가이드 조회 */
export async function fetchGuide(id) {
  if (isSupabaseEnabled) {
    const { data, error } = await supabase
      .from('guides')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return rowToGuide(data)
  }
  const g = GUIDES[id]
  if (!g) throw new Error(`가이드를 찾을 수 없습니다: ${id}`)
  return { id, ...g }
}

/** 모듈별 가이드 수 집계 */
export async function fetchModuleStats() {
  if (isSupabaseEnabled) {
    const { data, error } = await supabase
      .from('guides')
      .select('module')
      .eq('status', 'published')
    if (error) throw error
    const counts = {}
    for (const row of data || []) {
      counts[row.module] = (counts[row.module] || 0) + 1
    }
    return counts
  }
  const counts = {}
  for (const g of Object.values(GUIDES)) {
    counts[g.module] = (counts[g.module] || 0) + 1
  }
  return counts
}

/** 최근 업데이트 가이드 */
export async function fetchRecentGuides(n = 8) {
  if (isSupabaseEnabled) {
    const { data, error } = await supabase
      .from('guides')
      .select('id,type,module,title,views,helpful,helpful_rate,author,version,tags,updated_at')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(n)
    if (error) throw error
    return (data || []).map(rowToGuide)
  }
  return RECENT_GUIDES.slice(0, n)
}

/** 인기 가이드 (조회수 기준) */
export async function fetchPopularGuides(n = 5) {
  if (isSupabaseEnabled) {
    const { data, error } = await supabase
      .from('guides')
      .select('id,type,module,title,views,helpful,helpful_rate,author,version,tags,updated_at')
      .eq('status', 'published')
      .order('views', { ascending: false })
      .limit(n)
    if (error) throw error
    return (data || []).map(rowToGuide)
  }
  return POPULAR_GUIDES.slice(0, n)
}

// ─── 전문 검색 ───────────────────────────────────────────────────────────────

/** 빠른 검색 (title + tldr ilike) */
export async function searchGuides(query, limit = 20) {
  if (!query?.trim()) return []
  if (isSupabaseEnabled) {
    const { data, error } = await supabase
      .from('guides')
      .select('id,type,module,title,tldr,updated_at')
      .eq('status', 'published')
      .or(`title.ilike.%${query}%,tldr.ilike.%${query}%,tags.cs.{${query}}`)
      .limit(limit)
    if (error) throw error

    // 검색 로그 기록 (비동기, 실패 무시)
    supabase.from('search_logs').insert({ query, result_count: data?.length || 0 }).then(() => {})

    return (data || []).map(rowToGuide)
  }
  const q = query.toLowerCase()
  return Object.entries(GUIDES)
    .filter(([, g]) =>
      g.title?.toLowerCase().includes(q) ||
      g.tldr?.toLowerCase().includes(q) ||
      g.module?.toLowerCase().includes(q)
    )
    .slice(0, limit)
    .map(([id, g]) => ({ id, ...g }))
}

// ─── 피드백 ──────────────────────────────────────────────────────────────────

// 익명 세션 ID — 중복 피드백 방지. SSR-safe 가드.
function getFeedbackSessionId() {
  if (typeof window === 'undefined') return null
  try {
    let sid = localStorage.getItem(STORAGE_KEYS.feedbackSessionId)
    if (!sid) {
      sid = (crypto?.randomUUID?.() ?? `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
      localStorage.setItem(STORAGE_KEYS.feedbackSessionId, sid)
    }
    return sid
  } catch {
    return null
  }
}

/** 가이드 피드백 저장 */
export async function submitFeedback({ guideId, vote, comment }) {
  if (isSupabaseEnabled) {
    const sessionId = getFeedbackSessionId()
    const { error } = await supabase
      .from('guide_feedback')
      .insert({ guide_id: guideId, vote, comment: comment || null, session_id: sessionId })
    if (error) throw error

    // helpful 카운터 증가 (올바른 RPC — views 가 아니라 helpful)
    if (vote === 'helpful') {
      const { error: rpcErr } = await supabase.rpc('increment_guide_helpful', { guide_id_param: guideId })
      if (rpcErr) throw rpcErr
    }
    return true
  }
  // mock: 로컬 스토리지에 임시 저장
  const key = `${STORAGE_KEYS.feedbackMockPrefix}${guideId}`
  localStorage.setItem(key, JSON.stringify({ vote, comment, ts: Date.now() }))
  return true
}

/** 피드백 통계 조회 */
export async function fetchFeedbackStats(guideId) {
  if (isSupabaseEnabled) {
    const { data, error } = await supabase.rpc('get_guide_stats', { guide_id_param: guideId })
    if (error) throw error
    return data
  }
  const guide = GUIDES[guideId]
  if (!guide) return { total: 0, helpful: 0, helpfulRate: 0 }
  return {
    total:      guide.helpful || 0,
    helpful:    guide.helpful || 0,
    helpfulRate:guide.helpfulRate || 0,
    needsImprovement: 0,
  }
}

// ─── 조회수 증가 ─────────────────────────────────────────────────────────────

export async function incrementViews(guideId) {
  if (isSupabaseEnabled) {
    await supabase.rpc('increment_guide_views', { guide_id_param: guideId })
  }
  // mockData는 in-memory이므로 변경 불필요
}

// ─── 챗봇 FAQ 조회수 (분류별 TOP 5 정렬용 · 누적) ──────────────────────────
/** 전체 FAQ 누적 조회수 맵 { faq_id: views } (Supabase 미연결 시 빈 객체) */
export async function fetchFaqViews() {
  if (!isSupabaseEnabled) return {}
  const { data, error } = await supabase.from('faq_views').select('faq_id,views')
  if (error) return {}
  const map = {}
  for (const r of data || []) map[r.faq_id] = r.views
  return map
}

/** FAQ 클릭 시 누적 조회수 +1 (익명 RPC, 실패 무시) */
export async function incrementFaqView(faqId) {
  if (!isSupabaseEnabled || !faqId) return
  try { await supabase.rpc('increment_faq_view', { p_faq_id: faqId }) } catch { /* noop */ }
}

// ─── 통계 대시보드 ───────────────────────────────────────────────────────────

export async function fetchDashboardStats() {
  if (isSupabaseEnabled) {
    // 만족도(helpfulRate)는 head:true count 로 정확 집계한다. 예전엔 vote 행을 실제로
    // 받아와(.data) 그 길이로 비율을 냈는데, PostgREST 기본 1,000행 상한에 걸려 피드백이
    // 1,000건을 넘으면 임의의 1,000행 기준으로 비율이 틀어졌다(잘린 줄도 모르고 KPI 오도).
    const [guidesRes, helpfulRes, feedbackRes, searchRes] = await Promise.all([
      supabase.from('guides').select('id,views,helpful').eq('status', 'published'),
      supabase.from('guide_feedback').select('id', { count: 'exact', head: true }).eq('vote', 'helpful'),
      supabase.from('guide_feedback').select('id', { count: 'exact', head: true }),
      supabase.from('search_logs').select('id', { count: 'exact', head: true }),
    ])
    const guides  = guidesRes.data  || []
    const totalGuides = guides.length
    const totalViews  = guides.reduce((s, g) => s + (g.views || 0), 0)
    const helpful       = helpfulRes.count || 0
    const feedbackTotal = feedbackRes.count || 0
    return {
      totalGuides,
      totalViews,
      helpfulRate: feedbackTotal > 0 ? Math.round(100 * helpful / feedbackTotal) : 0,
      searchCount: searchRes.count || 0,
    }
  }
  // Supabase 미연결 fallback — 실제 운영 데이터(SSOT) 기반.
  // 출처: 실장님 시트 25 Q&A (officialQa.js) + FVSOL 컨플 130 페이지 + AMS 1 페이지 (confluence-sources.js)
  // 누적 조회수/만족도는 Supabase 연결 후 실측. 현재는 정직하게 0/null.
  const _legacyMockGuides = Object.values(GUIDES)
  // 동적 import 회피 — Vite tree-shaking 위해 모듈 상단 import 사용 권장이나
  // 순환 의존성 회피 위해 require-style 동적 import.
  let totalGuides = 156
  let recentDate = '2026-05-20'
  try {
    const { OFFICIAL_QA } = await import('@/data/officialQa')
    const { FVSOL_GROUPS, AMS_GUIDES } = await import('@/data/guides/confluence-sources')
    const officialCount = OFFICIAL_QA?.length || 0
    const fvsolCount = (FVSOL_GROUPS || []).reduce((s, g) => s + g.pages.length, 0)
    const amsCount = (AMS_GUIDES || []).length
    totalGuides = officialCount + fvsolCount + amsCount
    recentDate = (AMS_GUIDES?.[0]?.updatedAt) || recentDate
  } catch {
    // fallback 정적값
  }
  return {
    totalGuides,
    totalViews: null,     // 측정 전 (Supabase 미연결)
    helpfulRate: null,
    searchCount: null,
    recentDate,
  }
}

// ─── 카카오 상담 응답시간 분포 ─────────────────────────────────────────────
/**
 * 학부모(user) 메시지 후 직원(manager) 첫 응답까지의 시간 분포.
 * 윈도우(일) 단위로 6개 버킷에 집계해 반환.
 * Supabase 미연결 시 null 반환 (그래프 카드가 자동으로 숨겨짐).
 */
export async function fetchResponseTimeDistribution(windowDays = 90) {
  if (!isSupabaseEnabled) return null
  const { data, error } = await supabase.rpc('get_response_time_distribution', {
    window_days: windowDays,
  })
  if (error) throw error
  return (data || []).map(row => ({
    bucket: row.bucket.replace(/^\d+\.\s*/, ''),
    cnt:    Number(row.cnt),
    pct:    Number(row.pct),
  }))
}

// ─── 카카오 채팅 카테고리 분포 (AI 분류 결과) ───────────────────────────
export async function fetchChatCategoryDistribution(windowDays = 90) {
  if (!isSupabaseEnabled) return null
  const { data, error } = await supabase.rpc('get_chat_category_distribution', {
    window_days: windowDays,
  })
  if (error) throw error
  return (data || []).map(row => ({
    category:      row.category,
    cnt:           Number(row.cnt),
    pct:           Number(row.pct),
    negativeRate:  Number(row.negative_rate),
  }))
}

// ─── 카카오 감정 추세 (일별) ────────────────────────────────────────────
export async function fetchSentimentTrend(windowDays = 30) {
  if (!isSupabaseEnabled) return null
  const { data, error } = await supabase.rpc('get_sentiment_trend', {
    window_days: windowDays,
  })
  if (error) throw error
  return (data || []).map(row => ({
    day:      row.day,
    positive: Number(row.positive),
    neutral:  Number(row.neutral),
    negative: Number(row.negative),
  }))
}

// ─── 카카오 실시간 대기·SLA 현황 (채널별) ──────────────────────────────────
export async function fetchKakaoSlaStatus() {
  if (!isSupabaseEnabled) return null
  const { data, error } = await supabase.rpc('kakao_sla_status')
  if (error) throw error
  return (data || []).map(row => ({
    channel:                 row.channel,
    waiting:                 Number(row.waiting),
    answeredN:               Number(row.answered_n),
    oldestWaitH:             Number(row.oldest_wait_h),
    medianFirstResponseMin:  Number(row.median_first_response_min),
  }))
}

// ─── 카카오 지금 처리할 대화 (대기 중 상위 N건, 오래 기다린 순) ────────────
export async function fetchKakaoActionChats(limitN = 6) {
  if (!isSupabaseEnabled) return null
  const { data, error } = await supabase.rpc('kakao_action_chats', { limit_n: limitN })
  if (error) throw error
  return (data || []).map(row => ({
    // chatId·profileId 는 목록에서 그 대화로 바로 갈 때 쓴다(20260813 마이그레이션에서 추가).
    chatId:    row.chat_id,
    profileId: row.profile_id,
    channel:   row.channel,
    nickname:  row.nickname,
    waitedH:   Number(row.waited_h),
    preview:   row.preview,
  }))
}

// ─── 카카오 카테고리 이상 급증 (오늘, 최근 7일 평균 대비) ──────────────────
export async function fetchKakaoCategorySpike(minRatio = 2.0, minCount = 5) {
  if (!isSupabaseEnabled) return null
  const { data, error } = await supabase.rpc('kakao_category_spike', {
    min_ratio: minRatio, min_count: minCount,
  })
  if (error) throw error
  return (data || []).map(row => ({
    date:             row.d,
    category:         row.category,
    cnt:              Number(row.cnt),
    baseline7d:       Number(row.baseline_7d),
    ratio:            Number(row.ratio),
    channelBreakdown: row.channel_breakdown || [],
  }))
}

// ─── 카카오 감정 추세 (채널별, 이번주 vs 지난주 부정 비율) ─────────────────
export async function fetchKakaoSentimentByChannel(minSamples = 30) {
  if (!isSupabaseEnabled) return null
  const { data, error } = await supabase.rpc('kakao_sentiment_trend', {
    min_samples: minSamples,
  })
  if (error) throw error
  return (data || []).map(row => ({
    channel:    row.channel,
    curNeg:     Number(row.cur_neg),
    curRate:    Number(row.cur_rate),
    prevNeg:    Number(row.prev_neg),
    curTotal:   Number(row.cur_total),
    prevRate:   Number(row.prev_rate),
    worsening:  Boolean(row.worsening),
    prevTotal:  Number(row.prev_total),
  }))
}

// ─── 카카오 채널별 수집 파이프라인 상태 ────────────────────────────────────
// ⚠️ RPC 원본의 health/health_reason 필드는 20분 주기 수집 대비 15분 임계값이
// 너무 타이트해서, 주기 후반 5분 구간마다 정상 상태에서도 'warning'이 뜬다
// (실측 확인됨 — 기준2: 허위 경고 방지를 위해 그대로 노출하지 않음). 원시
// 수치(hb_age_min 등)만 받아 20분 주기 기준 여유를 둔 25분 임계값으로
// 프론트에서 재계산한다. RPC 쪽 임계값 자체는 kakao-daily-summary·
// kakao-alert 등 다른 소비자도 함께 쓰는 공유 자원이라, 별도 승인 없이
// 직접 고치지 않고 백그라운드 작업으로 분리해 뒀다.
export async function fetchKakaoCollectionHealth() {
  if (!isSupabaseEnabled) return null
  const { data, error } = await supabase.rpc('kakao_collection_health')
  if (error) throw error
  const HEARTBEAT_OK_MIN = 25 // 수집 주기 20분 + 여유 5분
  return (data || []).map(row => {
    const hbAgeMin = Number(row.hb_age_min)
    const hasAuthError = row.last_error != null
    const health = hasAuthError ? 'critical' : (hbAgeMin > HEARTBEAT_OK_MIN ? 'warning' : 'ok')
    return {
      profileId:     row.profile_id,
      channelLabel:  row.channel_label,
      hbAgeMin,
      lastError:     row.last_error,
      hrsSinceMsg:   Number(row.hrs_since_msg),
      avgPerDay:     Number(row.avg_per_day),
      health,
      healthReason:  hasAuthError ? 'auth' : (health === 'warning' ? 'heartbeat' : 'ok'),
    }
  })
}

// ─── 잔디 KST 자정 ISO (오늘 메시지량 집계 기준) ───────────────────────────
function jandiStartOfTodayKst() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  const ymd = `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`
  return new Date(`${ymd}T00:00:00+09:00`).toISOString()
}

// ─── 잔디: 오늘 메시지량 (5개 방 합산) ──────────────────────────────────────
// RPC 없음(잔디는 sentiment/category 분류 파이프라인 자체가 없음 — count-only
// 직접 조회로 계산. jandi_messages 는 2만여 건 규모라 count 쿼리로 충분히 가벼움.
export async function fetchJandiTodayCount() {
  if (!isSupabaseEnabled) return null
  const { count, error } = await supabase
    .from('jandi_messages').select('*', { count: 'exact', head: true })
    .gte('created_at', jandiStartOfTodayKst())
  if (error) throw error
  return count ?? 0
}

// ─── 잔디: 최근 N일 활성 작성자 수(익명 writer_id 기준) ───────────────────
// ⚠️ writer_name 은 100% NULL 확인됨(2026-07-10 실측) — 실명 랭킹은 만들 수
// 없어 [미측정]. writer_id(익명 ID) 기준 distinct 카운트만 [측정] 가능.
export async function fetchJandiActiveWriters(days = 7) {
  if (!isSupabaseEnabled) return null
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('jandi_messages').select('writer_id')
    .gte('created_at', since).not('writer_id', 'is', null)
  if (error) throw error
  return new Set((data || []).map((r) => r.writer_id)).size
}

// ─── 잔디: 스레드(댓글) 참여율 ──────────────────────────────────────────────
export async function fetchJandiReplyRate(days = 30) {
  if (!isSupabaseEnabled) return null
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const [totalQ, replyQ] = await Promise.all([
    supabase.from('jandi_messages').select('*', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('jandi_messages').select('*', { count: 'exact', head: true })
      .gte('created_at', since).not('reply_to_message_id', 'is', null),
  ])
  if (totalQ.error) throw totalQ.error
  if (replyQ.error) throw replyQ.error
  const total = totalQ.count ?? 0
  const replies = replyQ.count ?? 0
  return { total, replies, rate: total > 0 ? (replies / total) * 100 : 0 }
}

// ─── 모듈 트리 (항상 mockData) ───────────────────────────────────────────────
export function getModuleTree() { return MODULE_TREE }

// ─── 어드민 전용: 상태 무관 가이드 목록 ─────────────────────────────────────
/**
 * 어드민 테이블용 — status 필터를 직접 지정할 수 있다 (기본: 전체).
 * published/draft/archived 전부 포함.
 */
export async function fetchAdminGuides({ status = 'all', module: mod, search } = {}) {
  if (isSupabaseEnabled) {
    let q = supabase
      .from('guides')
      .select('id,type,module,title,tldr,author,version,views,helpful,status,updated_at')
      .order('updated_at', { ascending: false })
    if (status !== 'all') q = q.eq('status', status)
    if (mod)              q = q.eq('module', mod)
    if (search)           q = q.or(`title.ilike.%${search}%,tldr.ilike.%${search}%`)

    const { data, error } = await q
    if (error) throw error
    return (data || []).map(rowToGuide)
  }

  // mockData: status 속성이 없으므로 'published' 로 간주
  let list = Object.entries(GUIDES).map(([id, g]) => ({
    id,
    ...g,
    status: g.status || 'published',
  }))
  if (status !== 'all') list = list.filter(g => g.status === status)
  if (mod)              list = list.filter(g => g.module === mod)
  if (search) {
    const q = search.toLowerCase()
    list = list.filter(g =>
      g.title?.toLowerCase().includes(q) || g.tldr?.toLowerCase().includes(q)
    )
  }
  return list
}

/** 가이드 status 변경 (발행/해제/보관) — 어드민 전용 */
export async function updateGuideStatus(id, status) {
  if (!['draft', 'published', 'archived'].includes(status)) {
    throw new Error(`잘못된 status: ${status}`)
  }
  if (isSupabaseEnabled) {
    const { error } = await supabase
      .from('guides')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return true
  }
  // mock: 콘솔 경고만. 재로드 시 사라짐을 개발자가 인지해야 함.
  if (import.meta.env.DEV) {
    console.warn('[updateGuideStatus] mock 모드에서는 영속되지 않습니다:', id, status)
  }
  return true
}

/** 가이드 upsert — 에디터 저장/발행 */
export async function upsertGuide(guide) {
  if (isSupabaseEnabled) {
    // 앱 내부 camelCase → DB snake_case 매핑
    const row = {
      id:              guide.id,
      type:            guide.type,
      module:          guide.module,
      title:           guide.title,
      tldr:            guide.tldr,
      path:            guide.path,
      ams_url:         guide.amsUrl,
      confluence_id:   guide.confluenceId,
      confluence_url:  guide.confluenceUrl,
      targets:         guide.targets || [],
      tags:            guide.tags    || [],
      author:          guide.author,
      version:         guide.version,
      status:          guide.status || 'draft',
      steps:           guide.steps,
      main_items_table:guide.mainItemsTable,
      cases:           guide.cases,
      cautions:        guide.cautions,
      trouble_table:   guide.troubleTable,
      responses:       guide.responses,
      decision_table:  guide.decisionTable,
      reference_data:  guide.referenceData,
      policy_diff:     guide.policyDiff,
      updated_at:      new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('guides')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single()
    if (error) throw error
    return rowToGuide(data)
  }
  // mock: 개발 모드에서만 경고
  if (import.meta.env.DEV) {
    console.warn('[upsertGuide] mock 모드에서는 영속되지 않습니다:', guide.id)
  }
  return guide
}

/** 가이드 삭제 — 기본은 soft delete (archived). hard=true 시 실제 삭제 */
export async function deleteGuide(id, { hard = false } = {}) {
  if (!hard) return updateGuideStatus(id, 'archived')
  if (isSupabaseEnabled) {
    const { error } = await supabase.from('guides').delete().eq('id', id)
    if (error) throw error
  }
  return true
}

// ─── 어드민 전용: 피드백 수신함 ──────────────────────────────────────────────
/** Supabase guide_feedback 최신순 (최대 n건) */
export async function fetchAdminFeedback({ limit = 100 } = {}) {
  if (isSupabaseEnabled) {
    const { data, error } = await supabase
      .from('guide_feedback')
      .select('id,guide_id,vote,comment,session_id,created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data || []).map(r => ({
      id:        r.id,
      source:    'supabase',
      guideId:   r.guide_id,
      vote:      r.vote,
      comment:   r.comment,
      sessionId: r.session_id,
      createdAt: r.created_at,
    }))
  }
  return []
}

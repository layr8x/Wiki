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

/** 전체 가이드 목록 (Supabase 또는 mockData 폴백) */
export async function fetchGuides({ module: mod, type, search, limit = 100, offset = 0 } = {}) {
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
    // 누적 카운터(guides.views)와 별개로 시점 기록 — 관리자 대시보드 추세(일별 조회 추이) 집계용.
    // 실패해도 카운터 증가는 이미 끝났으니 조용히 무시.
    supabase.from('guide_views')
      .insert({ guide_id: guideId, session_id: getFeedbackSessionId() })
      .then(({ error }) => { if (error && import.meta.env.DEV) console.warn('[incrementViews] guide_views insert 실패:', error.message) })
  }
  // mockData는 in-memory이므로 변경 불필요
}

// ─── 검색 로그 ───────────────────────────────────────────────────────────────
/** 검색어·결과 건수 기록 — 관리자 대시보드 검색 추이 집계용. fire-and-forget. */
export function logSearch(query, resultCount) {
  if (!isSupabaseEnabled || !query?.trim()) return
  supabase.from('search_logs')
    .insert({ query: query.trim(), result_count: resultCount })
    .then(({ error }) => { if (error && import.meta.env.DEV) console.warn('[logSearch] 실패:', error.message) })
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
    const [guidesRes, feedbackRes, , searchRes] = await Promise.all([
      supabase.from('guides').select('id,views,helpful').eq('status', 'published'),
      supabase.from('guide_feedback').select('vote', { count: 'exact', head: false }),
      supabase.from('guide_views').select('id', { count: 'exact', head: true }),
      supabase.from('search_logs').select('id', { count: 'exact', head: true }),
    ])
    const guides  = guidesRes.data  || []
    const totalGuides = guides.length
    const totalViews  = guides.reduce((s, g) => s + (g.views || 0), 0)
    const helpful     = (feedbackRes.data || []).filter(f => f.vote === 'helpful').length
    const feedbackTotal = feedbackRes.data?.length || 0
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

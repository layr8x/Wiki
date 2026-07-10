// src/hooks/useGuides.js
// React Query 기반 가이드 데이터 훅 — Supabase/mockData 자동 전환

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchGuides,
  fetchGuide,
  fetchRecentGuides,
  fetchPopularGuides,
  searchGuides,
  submitFeedback,
  fetchFeedbackStats,
  incrementViews,
  fetchDashboardStats,
  fetchModuleStats,
  fetchResponseTimeDistribution,
  fetchChatCategoryDistribution,
  fetchSentimentTrend,
  fetchKakaoSlaStatus,
  fetchKakaoCategorySpike,
  fetchKakaoSentimentByChannel,
  fetchKakaoCollectionHealth,
} from '../lib/db'

// ─── 전체 가이드 목록 ─────────────────────────────────────────────────────────
export function useGuideList({ module: mod, type, search } = {}) {
  return useQuery({
    queryKey: ['guides', { mod, type, search }],
    queryFn: () => fetchGuides({ module: mod, type, search }),
    staleTime: 5 * 60 * 1000,
    gcTime:    10 * 60 * 1000,
  })
}

// ─── 단일 가이드 상세 ─────────────────────────────────────────────────────────
export function useGuide(id) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['guide', id],
    queryFn: async () => {
      const guide = await fetchGuide(id)
      // 조회수 증가 (fire-and-forget — 실패해도 사용자 경험에는 영향 없음, 진단용 로깅만 유지)
      incrementViews(id).catch((err) => {
        if (import.meta.env.DEV) console.warn('[useGuide] incrementViews 실패:', err)
      })
      return guide
    },
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
    placeholderData: () =>
      qc.getQueryData(['guides'])?.find(g => g.id === id) ?? undefined,
  })
}

// ─── 최근 업데이트 ───────────────────────────────────────────────────────────
export function useRecentGuides(n = 8) {
  return useQuery({
    queryKey: ['guides', 'recent', n],
    queryFn: () => fetchRecentGuides(n),
    staleTime: 2 * 60 * 1000,
  })
}

// ─── 인기 가이드 ─────────────────────────────────────────────────────────────
export function usePopularGuides(n = 5) {
  return useQuery({
    queryKey: ['guides', 'popular', n],
    queryFn: () => fetchPopularGuides(n),
    staleTime: 5 * 60 * 1000,
  })
}

// ─── 검색 ────────────────────────────────────────────────────────────────────
export function useSearchGuides(query) {
  return useQuery({
    queryKey: ['guides', 'search', query],
    queryFn: () => searchGuides(query),
    enabled: Boolean(query?.trim()),
    staleTime: 30 * 1000,
  })
}

// ─── 피드백 제출 ─────────────────────────────────────────────────────────────
export function useSubmitFeedback(guideId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ vote, comment }) => submitFeedback({ guideId, vote, comment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feedback', guideId] })
      qc.invalidateQueries({ queryKey: ['guide', guideId] })
    },
  })
}

// ─── 피드백 통계 ─────────────────────────────────────────────────────────────
export function useFeedbackStats(guideId) {
  return useQuery({
    queryKey: ['feedback', guideId],
    queryFn: () => fetchFeedbackStats(guideId),
    enabled: Boolean(guideId),
    staleTime: 60 * 1000,
  })
}

// ─── 대시보드 통계 ───────────────────────────────────────────────────────────
export function useDashboardStats() {
  return useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: fetchDashboardStats,
    staleTime: 5 * 60 * 1000,
  })
}

// ─── 모듈별 가이드 수 ────────────────────────────────────────────────────────
export function useModuleStats() {
  return useQuery({
    queryKey: ['stats', 'modules'],
    queryFn: fetchModuleStats,
    staleTime: 10 * 60 * 1000,
  })
}

// ─── 카카오 상담 응답시간 분포 ───────────────────────────────────────────────
export function useResponseTimeDistribution(windowDays = 90) {
  return useQuery({
    queryKey: ['stats', 'response-time-distribution', windowDays],
    queryFn: () => fetchResponseTimeDistribution(windowDays),
    staleTime: 10 * 60 * 1000,
  })
}

// ─── 카카오 채팅 카테고리 분포 ──────────────────────────────────────────────
export function useChatCategoryDistribution(windowDays = 90) {
  return useQuery({
    queryKey: ['stats', 'chat-category-distribution', windowDays],
    queryFn: () => fetchChatCategoryDistribution(windowDays),
    staleTime: 10 * 60 * 1000,
  })
}

// ─── 카카오 감정 추세 ───────────────────────────────────────────────────────
export function useSentimentTrend(windowDays = 30) {
  return useQuery({
    queryKey: ['stats', 'sentiment-trend', windowDays],
    queryFn: () => fetchSentimentTrend(windowDays),
    staleTime: 10 * 60 * 1000,
  })
}

// ─── 카카오 실시간 대기·SLA (North Star — 캐시 아님, 짧은 staleTime) ───────
export function useKakaoSlaStatus() {
  return useQuery({
    queryKey: ['kakao-live', 'sla-status'],
    queryFn: fetchKakaoSlaStatus,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })
}

// ─── 카카오 카테고리 이상 급증 ──────────────────────────────────────────────
export function useKakaoCategorySpike() {
  return useQuery({
    queryKey: ['kakao-live', 'category-spike'],
    queryFn: () => fetchKakaoCategorySpike(),
    staleTime: 5 * 60 * 1000,
  })
}

// ─── 카카오 채널별 감정 추세(이번주 vs 지난주) ─────────────────────────────
export function useKakaoSentimentByChannel() {
  return useQuery({
    queryKey: ['kakao-live', 'sentiment-by-channel'],
    queryFn: () => fetchKakaoSentimentByChannel(),
    staleTime: 5 * 60 * 1000,
  })
}

// ─── 카카오 채널별 수집 파이프라인 상태 ────────────────────────────────────
export function useKakaoCollectionHealth() {
  return useQuery({
    queryKey: ['kakao-live', 'collection-health'],
    queryFn: fetchKakaoCollectionHealth,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })
}

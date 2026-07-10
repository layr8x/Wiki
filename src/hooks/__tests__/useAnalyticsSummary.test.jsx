// src/hooks/__tests__/useAnalyticsSummary.test.js
// isTruncated 안전장치 검증 — limit(FETCH_CAP) 초과 시 조용히 통계가 틀려지는 것을 막는 로직.
// (실제 원인: build-cs-stats.mjs/Kakao 대시보드에서 겪은 "잘렸는데 티 안 남" 버그와 같은 유형)
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAnalyticsSummary } from '../useAnalyticsSummary'

const mockState = vi.hoisted(() => ({ rows: [], trueCount: 0 }))

vi.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: {
    from: () => ({
      select: (_cols, opts) => {
        const isCountQuery = !!(opts && opts.count)
        const chain = {
          gte: () => chain,
          eq: () => chain,
          limit: () => chain,
          then: (resolve) =>
            resolve(
              isCountQuery
                ? { count: mockState.trueCount, error: null }
                : { data: mockState.rows, error: null }
            ),
        }
        return chain
      },
    }),
  },
}))

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function rowsOf(n) {
  return Array.from({ length: n }, () => ({ sent_at: new Date().toISOString() }))
}

describe('useAnalyticsSummary — isTruncated 안전장치', () => {
  beforeEach(() => {
    mockState.rows = []
    mockState.trueCount = 0
  })

  it('실제 총 건수 == fetch된 건수 → isTruncated=false', async () => {
    mockState.rows = rowsOf(5)
    mockState.trueCount = 5
    const { result } = renderHook(
      () => useAnalyticsSummary({ key: 'not-truncated', table: 't', dateColumn: 'sent_at' }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data.isTruncated).toBe(false)
    expect(result.current.data.trueCount).toBe(5)
    expect(result.current.data.fetchedCount).toBe(5)
  })

  it('실제 총 건수 > fetch 상한 → isTruncated=true, 실제/반영 건수 모두 보고', async () => {
    mockState.rows = rowsOf(5) // 테스트 속도를 위해 소량 샘플로 "상한 초과" 상황을 흉내
    mockState.trueCount = 250000 // FETCH_CAP(200000) 초과
    const { result } = renderHook(
      () => useAnalyticsSummary({ key: 'truncated', table: 't', dateColumn: 'sent_at' }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data.isTruncated).toBe(true)
    expect(result.current.data.trueCount).toBe(250000)
    expect(result.current.data.fetchedCount).toBe(5)
  })
})

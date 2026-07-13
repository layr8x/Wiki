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
          order: () => chain,
          range: () => chain,
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

// daysAgo=0 → 이번주(최근 7일), daysAgo=10 → 지난주(8~14일 전) 버킷에 떨어지도록
function rowsAt(daysAgo, n) {
  const t = Date.now() - daysAgo * 24 * 60 * 60 * 1000
  return Array.from({ length: n }, () => ({ sent_at: new Date(t).toISOString() }))
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
    mockState.trueCount = 250000 // FETCH_CAP(20000) 초과
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

describe('useAnalyticsSummary — 저볼륨 채널 표본 부족 가드', () => {
  beforeEach(() => {
    mockState.rows = []
    mockState.trueCount = 0
  })

  it('14일 합계 10건 미만 → z값이 유의 기준을 넘어도 lowSample=true, significant/isAnomaly 강제 false', async () => {
    // 이번주 8건 · 지난주 1건 → 합계 9건(<10). raw z = (8-1)/sqrt(9) ≈ 2.33 (>=1.96, "유의"로 보이는 값)
    // 이지만 표본이 너무 적어 보류돼야 한다 — 통합로그인류 채널에서 "+700%, 통계적으로 유의미"가
    // 뜨던 실제 재현 사례.
    mockState.rows = [...rowsAt(0, 8), ...rowsAt(10, 1)]
    mockState.trueCount = 9
    const { result } = renderHook(
      () => useAnalyticsSummary({ key: 'low-sample', table: 't', dateColumn: 'sent_at' }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data.thisWeekTotal).toBe(8)
    expect(result.current.data.lastWeekTotal).toBe(1)
    expect(result.current.data.lowSample).toBe(true)
    expect(result.current.data.significant).toBe(false)
    expect(result.current.data.isAnomaly).toBe(false)
  })

  it('14일 합계 10건 이상 + 실제 유의미한 차이 → lowSample=false, significant=true', async () => {
    // 이번주 80건 · 지난주 20건 → 합계 100건(>=10). z = (80-20)/sqrt(100) = 6 → 유의.
    mockState.rows = [...rowsAt(0, 80), ...rowsAt(10, 20)]
    mockState.trueCount = 100
    const { result } = renderHook(
      () => useAnalyticsSummary({ key: 'enough-sample', table: 't', dateColumn: 'sent_at' }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data.thisWeekTotal).toBe(80)
    expect(result.current.data.lastWeekTotal).toBe(20)
    expect(result.current.data.lowSample).toBe(false)
    expect(result.current.data.significant).toBe(true)
  })
})

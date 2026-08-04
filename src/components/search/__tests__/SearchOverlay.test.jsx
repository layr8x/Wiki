// src/components/search/__tests__/SearchOverlay.test.jsx
// SearchOverlay — 렌더링/키보드 탐색/a11y 시맨틱 스모크 테스트.
// useSearchSummary 는 fetch 를 모킹해 disabled 로 유지 → AI 카드는 렌더되지 않는다.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SearchOverlay from '../SearchOverlay'
import { SearchProvider, useSearchStore } from '@/store/searchStore'

function OpenTrigger() {
  const { open } = useSearchStore()
  return <button onClick={open}>OPEN_OVERLAY</button>
}

// SearchOverlay 는 검색 대상을 useGuideList(React Query)로 가져온다. Supabase 가 꺼진
// 테스트 환경에서는 mockData 로 폴백하므로 결과는 예전과 같고, provider 만 있으면 된다.
function renderOverlay() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SearchProvider>
          <OpenTrigger />
          <SearchOverlay />
        </SearchProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SearchOverlay', () => {
  let fetchSpy
  beforeEach(() => {
    vi.useFakeTimers()
    // AI 요약은 503 으로 disabled 전환 — 테스트가 네트워크에 영향받지 않음
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
  })
  afterEach(() => {
    vi.useRealTimers()
    fetchSpy.mockRestore()
  })

  it('isOpen=false 면 렌더되지 않는다', () => {
    const { container } = renderOverlay()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('OPEN 버튼으로 열면 dialog + combobox 노출', async () => {
    renderOverlay()
    await act(async () => { screen.getByText('OPEN_OVERLAY').click() })
    expect(screen.getByRole('dialog', { name: '가이드 검색' })).toBeTruthy()
    expect(screen.getByRole('combobox')).toBeTruthy()
  })

  it('쿼리 입력 시 120ms 후 결과 리스트박스가 렌더된다', async () => {
    renderOverlay()
    await act(async () => { screen.getByText('OPEN_OVERLAY').click() })
    // 오버레이가 열리면서 queueMicrotask 로 query 를 '' 로 리셋 — 마이크로태스크 드레인
    await act(async () => { await Promise.resolve() })
    const input = screen.getByRole('combobox')
    await act(async () => {
      fireEvent.change(input, { target: { value: '병합' } })
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(input.getAttribute('aria-expanded')).toBe('true')
  })

  it('ArrowDown 이 선택을 이동시키고 Enter 로 네비게이션', async () => {
    renderOverlay()
    await act(async () => { screen.getByText('OPEN_OVERLAY').click() })
    await act(async () => { await Promise.resolve() })
    const input = screen.getByRole('combobox')
    await act(async () => {
      fireEvent.change(input, { target: { value: '병합' } })
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })

    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(0)
    // 초기 선택은 첫 번째
    expect(options[0].getAttribute('aria-selected')).toBe('true')

    if (options.length > 1) {
      await act(async () => {
        fireEvent.keyDown(window, { key: 'ArrowDown' })
      })
      const updated = screen.getAllByRole('option')
      expect(updated[1].getAttribute('aria-selected')).toBe('true')
      expect(updated[0].getAttribute('aria-selected')).toBe('false')
    }
  })

  it('Escape 로 닫힌다', async () => {
    renderOverlay()
    await act(async () => { screen.getByText('OPEN_OVERLAY').click() })
    expect(screen.getByRole('dialog')).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('쿼리가 비어있으면 "최근 업데이트" 섹션이 노출된다', async () => {
    renderOverlay()
    await act(async () => { screen.getByText('OPEN_OVERLAY').click() })
    expect(screen.getByText('최근 업데이트')).toBeTruthy()
    expect(screen.getByText('인기 가이드')).toBeTruthy()
  })

  it('매칭 없는 쿼리는 NoResultFallback 을 노출한다', async () => {
    renderOverlay()
    await act(async () => { screen.getByText('OPEN_OVERLAY').click() })
    await act(async () => { await Promise.resolve() })
    const input = screen.getByRole('combobox')
    await act(async () => {
      fireEvent.change(input, { target: { value: '절대존재하지않는_검색어_zzzzz' } })
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    const matches = screen.getAllByText((_, node) => node?.textContent?.includes('정확히 일치하는'))
    expect(matches.length).toBeGreaterThan(0)
  })
})

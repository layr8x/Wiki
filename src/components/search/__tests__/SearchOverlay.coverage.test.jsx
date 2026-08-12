// src/components/search/__tests__/SearchOverlay.coverage.test.jsx
//
// 검색이 "어디까지" 뒤지는지에 대한 회귀 테스트.
//
// 예전에는 SearchOverlay 가 mockData 의 GUIDES(35건)만 훑어서, guides 테이블에 실제로
// 들어 있는 135건 중 100건은 검색으로 절대 찾을 수 없었다. 목록 화면과 상세 페이지에는
// 멀쩡히 있는데 검색만 못 하는 상태라 눈치채기 어려웠다.
//
// 이 테스트는 "DB에서 온 목록에만 있고 mockData 에는 없는 문서"를 검색으로 찾을 수 있는지
// 확인한다. 검색 대상이 mockData 로 되돌아가면 이 테스트가 깨진다.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// mockData 에는 없는, DB 에만 있는 문서를 흉내 낸다.
const DB_ONLY_GUIDE = {
  id: 'ams-9999999999',
  type: 'SOP',
  module: 'AMS/수강관리',
  title: '초코바나나 특별 정산 처리 가이드',
  tldr: '초코바나나 항목이 붙은 수강료를 정산할 때의 절차입니다.',
  targets: [],
}

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    // useGuideList → fetchGuides. DB 응답을 흉내 내 mockData 밖 문서를 하나 끼워 넣는다.
    fetchGuides: vi.fn(async () => [DB_ONLY_GUIDE]),
  }
})

import SearchOverlay from '../SearchOverlay'
import { SearchProvider, useSearchStore } from '@/store/searchStore'

function OpenTrigger() {
  const { open } = useSearchStore()
  return <button onClick={open}>OPEN_OVERLAY</button>
}

function renderOverlay() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
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

describe('SearchOverlay 검색 범위', () => {
  let fetchSpy
  beforeEach(() => {
    // AI 요약은 503 으로 비활성 — 이 테스트는 키워드 검색 범위만 본다.
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
  })
  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('mockData 에 없고 DB 목록에만 있는 문서도 검색된다', async () => {
    renderOverlay()
    await act(async () => { screen.getByText('OPEN_OVERLAY').click() })
    // 오버레이가 열리며 queueMicrotask 로 query 리셋 + React Query 조회가 끝나기를 기다린다.
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    const input = screen.getByRole('combobox')
    await act(async () => {
      fireEvent.change(input, { target: { value: '초코바나나' } })
    })
    // 검색은 120ms 디바운스
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })

    expect(screen.getByText(DB_ONLY_GUIDE.title)).toBeTruthy()
  })
})

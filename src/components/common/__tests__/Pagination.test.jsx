// src/components/common/__tests__/Pagination.test.jsx
// Pagination — Astryx 디자인시스템 Pagination 래퍼: 페이지 이동, aria-current,
// 이전/다음 disabled, ellipsis 표기, 정보 텍스트.
// (버튼 접근성 라벨·ellipsis 마크업은 @astryxdesign/core/Pagination 내부 구현이라
//  "Go to page N" 등 컴포넌트가 실제로 내보내는 영문 라벨 기준으로 검증한다.)
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Pagination from '../Pagination'

function buildPagination(overrides = {}) {
  return {
    currentPage: 1,
    totalPages:  5,
    totalItems:  50,
    startIndex:  1,
    endIndex:    10,
    hasPrevPage: false,
    hasNextPage: true,
    goToPage:    vi.fn(),
    ...overrides,
  }
}

describe('Pagination', () => {
  it('totalPages 가 1 이하이면 렌더하지 않는다', () => {
    const { container } = render(
      <Pagination pagination={buildPagination({ totalPages: 1 })} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('nav 래퍼에 aria-label 이 있다', () => {
    render(<Pagination pagination={buildPagination()} />)
    expect(screen.getByRole('navigation', { name: '페이지 네비게이션' })).toBeTruthy()
  })

  it('현재 페이지 버튼에 aria-current="page" 가 붙는다', () => {
    render(<Pagination pagination={buildPagination({ currentPage: 3 })} />)
    const current = screen.getByRole('button', { name: 'Go to page 3' })
    expect(current.getAttribute('aria-current')).toBe('page')
  })

  it('현재가 아닌 페이지 버튼은 aria-current 가 없다', () => {
    render(<Pagination pagination={buildPagination({ currentPage: 3 })} />)
    const other = screen.getByRole('button', { name: 'Go to page 2' })
    expect(other.hasAttribute('aria-current')).toBe(false)
  })

  it('페이지 번호 클릭은 goToPage 를 호출한다', () => {
    const goToPage = vi.fn()
    render(<Pagination pagination={buildPagination({ goToPage })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }))
    expect(goToPage).toHaveBeenCalledWith(2)
  })

  it('이전 버튼 비활성 상태와 다음 버튼 활성 상태 (첫 페이지)', () => {
    render(<Pagination pagination={buildPagination()} />)
    expect(screen.getByRole('button', { name: 'Go to previous page' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Go to next page' }).disabled).toBe(false)
  })

  it('이전 버튼은 goToPage(currentPage - 1) 를 호출한다', () => {
    const goToPage = vi.fn()
    render(
      <Pagination
        pagination={buildPagination({ currentPage: 3, hasPrevPage: true, goToPage })}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Go to previous page' }))
    expect(goToPage).toHaveBeenCalledWith(2)
  })

  it('다음 버튼은 goToPage(currentPage + 1) 를 호출한다', () => {
    const goToPage = vi.fn()
    render(
      <Pagination
        pagination={buildPagination({ currentPage: 3, hasNextPage: true, goToPage })}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(goToPage).toHaveBeenCalledWith(4)
  })

  it('totalPages 가 많으면 ellipsis + 경계 페이지 노출', () => {
    render(
      <Pagination
        pagination={buildPagination({ currentPage: 6, totalPages: 12 })}
      />
    )
    // 양쪽에 ellipsis 표시 (Astryx Pagination 은 '…' 한 글자로 렌더)
    const ellipses = screen.getAllByText('…')
    expect(ellipses.length).toBe(2)
    // 첫/끝 페이지 버튼 존재
    expect(screen.getByRole('button', { name: 'Go to page 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go to page 12' })).toBeTruthy()
    // 현재 페이지 좌우 1개씩 포함 (siblingCount 기본값 1 → 5,6,7)
    for (const p of [5, 6, 7]) {
      expect(screen.getByRole('button', { name: `Go to page ${p}` })).toBeTruthy()
    }
  })

  it('ellipsis 는 aria-hidden 이다 (AT 에 노출되지 않음)', () => {
    render(
      <Pagination pagination={buildPagination({ currentPage: 6, totalPages: 12 })} />
    )
    for (const el of screen.getAllByText('…')) {
      expect(el.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('정보 텍스트 "start ~ end / 총 N개" 노출', () => {
    render(
      <Pagination
        pagination={buildPagination({ startIndex: 11, endIndex: 20, totalItems: 47 })}
      />
    )
    expect(screen.getByText('11 ~ 20 / 총 47개')).toBeTruthy()
  })
})

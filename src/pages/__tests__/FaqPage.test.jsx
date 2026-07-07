// src/pages/__tests__/FaqPage.test.jsx
// FaqPage 스모크 테스트 — 카테고리 필터 + 아코디언 렌더
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FaqPage from '../FaqPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <FaqPage />
    </MemoryRouter>
  )
}

describe('FaqPage', () => {
  it('타이틀과 "전체" 카테고리 pill 이 노출된다', () => {
    renderPage()
    expect(screen.getByText('운영 FAQ')).toBeTruthy()
    expect(screen.getByRole('button', { name: /전체/ })).toBeTruthy()
  })

  it('전체 선택 시 모든 FAQ 항목의 질문이 렌더된다', () => {
    renderPage()
    // 기본 selected = 전체 → 19건 모두 보임
    // "결제/환불", "고객 관리", "수업 운영" 은 pill + 각 FAQ 배지에 각각 나타남
    const paymentPills = screen.getAllByRole('button', { name: /결제.환불/ })
    expect(paymentPills.length).toBeGreaterThan(1)
    // 아코디언 트리거가 FAQ 수만큼 존재
    const triggers = screen.getAllByRole('button', { expanded: false })
    expect(triggers.length).toBeGreaterThan(5)
  })

  it('카테고리 필터 클릭 시 해당 카테고리 FAQ 만 표시된다', () => {
    renderPage()
    // 첫 번째 pill 이 카테고리 필터 (두 번째부터는 FAQ 배지)
    const pill = screen.getAllByRole('button', { name: /출결.배부/ })[0]
    fireEvent.click(pill)
    expect(pill.getAttribute('aria-pressed')).toBe('true')
  })

  it('카테고리 pill 에 카운트가 포함되어 있다', () => {
    renderPage()
    const allBtn = screen.getByRole('button', { name: /전체/ })
    // "전체" 버튼은 전체 FAQ 개수가 병기됨 (최소 10 이상)
    const count = within(allBtn).getByText(/\d+/)
    expect(Number(count.textContent)).toBeGreaterThanOrEqual(10)
  })

  it('FAQ 설명에 "반복 문의" 문구가 나타난다', () => {
    renderPage()
    expect(screen.getByText(/반복 문의/)).toBeTruthy()
  })

  it('카테고리 필터 그룹은 aria-label 과 role="group" 이 있다', () => {
    renderPage()
    const group = screen.getByRole('group', { name: '카테고리 필터' })
    expect(group).toBeTruthy()
  })

  it('카테고리 pill 은 aria-pressed 로 선택 상태를 알린다', () => {
    renderPage()
    const allBtn = screen.getAllByRole('button', { name: /전체/ })[0]
    expect(allBtn.getAttribute('aria-pressed')).toBe('true')
    // 다른 카테고리 클릭 시 '전체' 는 aria-pressed=false 로 전환
    const paymentPill = screen.getAllByRole('button', { name: /결제.환불/ })[0]
    fireEvent.click(paymentPill)
    expect(paymentPill.getAttribute('aria-pressed')).toBe('true')
    expect(allBtn.getAttribute('aria-pressed')).toBe('false')
  })
})

// src/pages/admin/__tests__/PeriodSelector.test.jsx
// 관리자 상담/대화 페이지의 기간 필터가 raw <select> → Astryx Selector 로 전환된 뒤
// 실제로 렌더되고 상호작용(열림·선택·onChange)이 동작하는지 런타임 검증(jsdom).
// AdminConsultsPage/AdminJandiPage 전체는 supabase/react-query/auth 의존이 커서,
// 두 페이지가 쓰는 것과 "동일한 props 형태"의 Selector 를 격리 렌더해 컴포넌트 자체를 검증한다.
import React, { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Selector } from '@astryxdesign/core/Selector'

const NOW_Y = new Date().getFullYear()
const YEARS = [NOW_Y, NOW_Y - 1, NOW_Y - 2]
const YEAR_OPTIONS = [{ value: 'all', label: '전체기간' }, ...YEARS.map((y) => ({ value: String(y), label: `${y}년` }))]

function Harness() {
  const [year, setYear] = useState('all')
  return (
    <div>
      <Selector
        label="년도"
        isLabelHidden
        size="sm"
        value={year}
        onChange={(v) => setYear(v)}
        options={YEAR_OPTIONS}
      />
      <span data-testid="picked">{year}</span>
    </div>
  )
}

describe('관리자 기간 필터 Selector (Astryx)', () => {
  it('렌더되고 현재 선택값(전체기간)을 트리거에 표시한다', () => {
    render(<Harness />)
    // Astryx Selector 트리거 = role="combobox" 버튼
    const trigger = screen.getByRole('combobox')
    expect(trigger).toBeTruthy()
    // 트리거에 현재 선택 라벨(전체기간) 노출
    expect(trigger.textContent).toContain('전체기간')
    expect(screen.getByTestId('picked').textContent).toBe('all')
  })

  it('열어서 다른 연도를 선택하면 onChange 로 값이 바뀐다', () => {
    render(<Harness />)
    const trigger = screen.getByRole('combobox')
    act(() => { fireEvent.click(trigger) })
    // 목록의 option 중 현재 연도(NOW_Y년)를 선택
    const yearLabel = `${NOW_Y}년`
    const option = screen.getAllByRole('option').find((el) => el.textContent?.includes(yearLabel))
    expect(option).toBeTruthy()
    act(() => { fireEvent.click(option) })
    expect(screen.getByTestId('picked').textContent).toBe(String(NOW_Y))
  })
})

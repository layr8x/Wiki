// src/components/search/__tests__/NoResultFallback.test.jsx
// NoResultFallback — 유사 가이드 제안, 피드백 큐 적재, 콜백 전달, 제출 상태 전이
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import NoResultFallback from '../NoResultFallback'

const FEEDBACK_QUEUE_KEY = STORAGE_KEYS.feedbackQueue

describe('NoResultFallback', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('질의어를 그대로 노출한다', () => {
    render(<NoResultFallback query="환불 절차" onGoTo={() => {}} onNavigateFeedback={() => {}} />)
    // 헤더에 쿼리 노출 — &ldquo;/&rdquo; 로 인해 smart quote 가 실제 텍스트. 내용 포함 여부만 체크.
    // (Astryx Text는 기본적으로 <span>으로 렌더되므로 특정 태그를 강제하지 않는다.)
    expect(screen.getAllByText(/환불 절차/).length).toBeGreaterThan(0)
    // 헤더 + 폼 안 인용 — 최소 2회 등장
    const occurrences = screen.getAllByText((_, node) =>
      node?.textContent?.includes('환불 절차') ?? false
    )
    expect(occurrences.length).toBeGreaterThanOrEqual(2)
  })

  it('빈 쿼리면 관련 가이드를 보이지 않는다', () => {
    const { container } = render(
      <NoResultFallback query="" onGoTo={() => {}} onNavigateFeedback={() => {}} />
    )
    expect(screen.queryByText('이런 가이드는 어떠세요?')).toBeNull()
    // 유사도 헤더(`이런 가이드는 어떠세요?`)가 없는 것으로 충분
    expect(container.textContent).not.toContain('이런 가이드는 어떠세요?')
  })

  it('제출 버튼 클릭 시 localStorage 에 missing-guide 엔트리가 쌓인다', () => {
    vi.useFakeTimers()
    render(<NoResultFallback query="QR 출석" onGoTo={() => {}} onNavigateFeedback={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText(/OT 절차/), { target: { value: '비콘 연동 포함' } })
    fireEvent.click(screen.getByRole('button', { name: /요청 보내기/ }))

    // 250ms setTimeout 이후에 submitted 상태로 전환
    act(() => { vi.advanceTimersByTime(300) })

    const stored = JSON.parse(localStorage.getItem(FEEDBACK_QUEUE_KEY))
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      kind:  'missing-guide',
      query: 'QR 출석',
      note:  '비콘 연동 포함',
    })
    expect(stored[0].createdAt).toBeTruthy()

    // 접수 완료 UI 노출
    expect(screen.getByText('접수 완료')).toBeTruthy()
    vi.useRealTimers()
  })

  it('제출 완료 후에는 버튼/textarea 가 비활성화된다', () => {
    vi.useFakeTimers()
    render(<NoResultFallback query="hello" onGoTo={() => {}} onNavigateFeedback={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /요청 보내기/ }))
    act(() => { vi.advanceTimersByTime(300) })

    const submitBtn = screen.getByRole('button', { name: /제출됨/ })
    expect(submitBtn.disabled).toBe(true)
    expect(screen.getByPlaceholderText(/OT 절차/).disabled).toBe(true)
    vi.useRealTimers()
  })

  it('연속 클릭은 1회만 적재한다 (submitting 가드)', () => {
    vi.useFakeTimers()
    render(<NoResultFallback query="hello" onGoTo={() => {}} onNavigateFeedback={() => {}} />)
    const btn = screen.getByRole('button', { name: /요청 보내기/ })
    fireEvent.click(btn)
    fireEvent.click(btn) // submitting 중 재클릭
    fireEvent.click(btn)
    act(() => { vi.advanceTimersByTime(300) })

    const stored = JSON.parse(localStorage.getItem(FEEDBACK_QUEUE_KEY))
    expect(stored).toHaveLength(1)
    vi.useRealTimers()
  })

  it('"상세 요청 작성" 링크는 onNavigateFeedback 에 현재 쿼리를 넘긴다', () => {
    const onNavigateFeedback = vi.fn()
    render(
      <NoResultFallback query="강사 지원" onGoTo={() => {}} onNavigateFeedback={onNavigateFeedback} />
    )
    fireEvent.click(screen.getByText(/상세 요청 작성/))
    expect(onNavigateFeedback).toHaveBeenCalledWith('강사 지원')
  })

  it('localStorage 큐는 최근 100개로 제한된다', () => {
    vi.useFakeTimers()
    // 사전에 120개 엔트리 주입
    const preload = Array.from({ length: 120 }, (_, i) => ({ kind: 'missing-guide', query: `q${i}` }))
    localStorage.setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(preload))

    render(<NoResultFallback query="새 요청" onGoTo={() => {}} onNavigateFeedback={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /요청 보내기/ }))
    act(() => { vi.advanceTimersByTime(300) })

    const stored = JSON.parse(localStorage.getItem(FEEDBACK_QUEUE_KEY))
    expect(stored).toHaveLength(100)
    // 가장 오래된 항목은 잘려나가고 새 항목이 마지막에 쌓임
    expect(stored[stored.length - 1].query).toBe('새 요청')
    expect(stored[0].query).not.toBe('q0')
    vi.useRealTimers()
  })
})

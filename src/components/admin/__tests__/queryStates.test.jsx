// src/components/admin/__tests__/queryStates.test.js
// 조회 실패 안내 문구의 한국어 조사 선택 검증.
//
// 왜 테스트가 필요한가: 화면마다 라벨이 다른데(가이드 목록 / 응답시간 분포 / 피드백 목록 …)
// 조사를 잘못 고르면 "분포을 불러오지 못했습니다" 처럼 어색하게 읽힌다. 눈으로 다 확인하기
// 어려운 자리라 규칙을 고정해 둔다.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryError } from '../QueryStates'

const titleOf = (label) => {
  const { unmount } = render(<QueryError label={label} />)
  const el = screen.getByText(new RegExp(label))
  const text = el.textContent
  unmount()
  return text
}

describe('조회 실패 안내 문구', () => {
  it('받침이 있으면 "을"', () => {
    // 목록(ㄱ) · 현황(ㅇ) · 인원(ㄴ)
    expect(titleOf('가이드 목록')).toBe('가이드 목록을 불러오지 못했습니다')
    expect(titleOf('수집 현황')).toBe('수집 현황을 불러오지 못했습니다')
  })

  it('받침이 없으면 "를"', () => {
    // 분포 · 추세 · 통계
    expect(titleOf('응답시간 분포')).toBe('응답시간 분포를 불러오지 못했습니다')
    expect(titleOf('감정 추세')).toBe('감정 추세를 불러오지 못했습니다')
    expect(titleOf('대시보드 통계')).toBe('대시보드 통계를 불러오지 못했습니다')
  })

  it('한글이 아니면 "를"로 둔다', () => {
    expect(titleOf('SLA')).toBe('SLA를 불러오지 못했습니다')
  })

  // getByText 는 못 찾으면 스스로 던지므로, 존재 여부는 호출 자체가 검증이다
  // (이 저장소에는 jest-dom 매처가 붙어 있지 않다).
  it('오류 메시지가 없으면 기본 안내를 보여준다', () => {
    render(<QueryError label="피드백 목록" />)
    expect(screen.getByText('잠시 후 다시 시도해 주세요.')).toBeTruthy()
  })

  it('오류 메시지가 있으면 그대로 보여준다 (원인을 감추지 않는다)', () => {
    render(<QueryError label="피드백 목록" error={new Error('connection refused')} />)
    expect(screen.getByText('connection refused')).toBeTruthy()
  })
})

// src/lib/__tests__/plainSummary.test.js
// 카드 요약문에서 마크다운 표기를 걷어내는 함수 — 실제로 화면에 새던 문자열로 검증.
import { describe, it, expect } from 'vitest'
import { plainSummary } from '../plainSummary'

describe('plainSummary', () => {
  it('실제로 목록에 새던 문장을 정리한다', () => {
    // 2026-08-13 가이드 목록 스크린샷에서 그대로 가져온 문자열.
    const raw =
      '신한캠퍼스(신캠) 결제는 일반 PG/VAN과 달리 **부분환불 불가** · **분할결제 불가** · ' +
      '**AMS 직접 취소 불가** 등 고유 제약이 있습니다.'
    const out = plainSummary(raw)
    expect(out).not.toContain('*')
    expect(out).toContain('부분환불 불가')
    expect(out).toContain('분할결제 불가')
    expect(out).toContain('AMS 직접 취소 불가')
  })

  it('굵게·기울임·취소선 표기를 벗기고 글자는 남긴다', () => {
    expect(plainSummary('**굵게**')).toBe('굵게')
    expect(plainSummary('*기울임*')).toBe('기울임')
    expect(plainSummary('***둘다***')).toBe('둘다')
    expect(plainSummary('__밑줄__')).toBe('밑줄')
    expect(plainSummary('~~취소~~')).toBe('취소')
  })

  it('링크는 글자만 남기고 주소를 버린다', () => {
    expect(plainSummary('[환불 가이드](https://example.com/a?b=1)')).toBe('환불 가이드')
  })

  it('이미지는 대체 문구만 남긴다', () => {
    expect(plainSummary('![도표](/img/a.png) 참고')).toBe('도표 참고')
  })

  it('코드 표기 안쪽 글자를 남긴다', () => {
    expect(plainSummary('`fetchAll()` 을 쓴다')).toBe('fetchAll() 을 쓴다')
  })

  it('줄머리 표기(제목·인용·목록·번호)를 지운다', () => {
    expect(plainSummary('## 제목')).toBe('제목')
    expect(plainSummary('> 인용문')).toBe('인용문')
    expect(plainSummary('- 항목')).toBe('항목')
    expect(plainSummary('1. 첫째')).toBe('첫째')
  })

  it('여러 줄을 한 줄로 모은다 (카드는 한 덩어리로 자른다)', () => {
    expect(plainSummary('첫 줄\n\n둘째 줄')).toBe('첫 줄 둘째 줄')
  })

  it('마크다운이 없으면 원문을 그대로 둔다', () => {
    const plain = '출결 처리 가이드입니다. 수업 시작 전에 확인하세요.'
    expect(plainSummary(plain)).toBe(plain)
  })

  it('값이 없어도 터지지 않는다', () => {
    expect(plainSummary(undefined)).toBe('')
    expect(plainSummary(null)).toBe('')
    expect(plainSummary('')).toBe('')
    expect(plainSummary(123)).toBe('')
  })

  it('별표가 짝이 안 맞아도 글자를 잃지 않는다', () => {
    // 요약을 중간에서 자르면 여는 별표만 남는 경우가 생긴다.
    expect(plainSummary('부분환불 **불가')).toContain('불가')
  })
})

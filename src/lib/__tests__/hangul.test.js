// src/lib/__tests__/hangul.test.js
//
// 한글 오타 교정이 실제로 작동하는지 확인한다.
// 예전 구현(글자 단위 bigram)은 한글 오타를 하나도 못 잡았다. 그 회귀를 막는 게 목적이다.

import { describe, it, expect } from 'vitest'
import { toJamo, similarity } from '../hangul'

describe('toJamo', () => {
  it('한글을 초성·중성·종성으로 쪼갠다', () => {
    expect(toJamo('출석')).toBe('ㅊㅜㄹㅅㅓㄱ')
    expect(toJamo('가')).toBe('ㄱㅏ')       // 종성 없음
    expect(toJamo('값')).toBe('ㄱㅏㅄ')      // 겹받침은 한 덩어리
  })

  it('한글이 아닌 글자는 소문자로만 바꿔 그대로 둔다', () => {
    expect(toJamo('AMS 2026!')).toBe('ams 2026!')
  })

  it('한글과 영문이 섞여도 처리한다', () => {
    // ㅚ·ㅝ 같은 겹모음은 그 자체로 하나의 중성이라 더 쪼개지 않는다(표준 자모 분해).
    expect(toJamo('AMS 회원')).toBe('ams ㅎㅚㅇㅝㄴ')
  })

  it('빈 값에도 터지지 않는다', () => {
    expect(toJamo('')).toBe('')
    expect(toJamo(null)).toBe('')
    expect(toJamo(undefined)).toBe('')
  })
})

describe('similarity — 한글 오타', () => {
  // 이게 핵심이다. 자모 분해 없이 글자 단위로만 비교하면 아래 값들이 훨씬 낮거나 0이 된다.
  const cases = [
    ['출석', '출섹'],
    ['환불', '환볼'],
    ['결제', '겹제'],
    ['출결', '츨결'],
    ['회원병합', '회언병합'],
  ]

  it.each(cases)('"%s" 와 오타 "%s" 가 서로 닮은 것으로 잡힌다', (right, typo) => {
    expect(similarity(right, typo)).toBeGreaterThan(0.3)
  })

  it('한 글자 오타는 무관한 단어보다 확실히 더 닮았다', () => {
    const typoScore = similarity('출석', '출섹')
    const unrelated = similarity('출석', '환불')
    expect(typoScore).toBeGreaterThan(unrelated)
  })

  it('같은 문자열은 1', () => {
    expect(similarity('수강료 환불', '수강료 환불')).toBe(1)
  })

  it('겹치는 게 없으면 0', () => {
    expect(similarity('출석', 'xyz')).toBe(0)
  })

  it('빈 값은 0 (예외를 던지지 않는다)', () => {
    expect(similarity('', '출석')).toBe(0)
    expect(similarity(null, undefined)).toBe(0)
  })
})

describe('similarity — 예전 구현이 못 하던 것', () => {
  // 글자 단위 bigram 을 그대로 재현해 비교한다. 자모 분해가 실제로 이득인지 증명하는 테스트다.
  function oldSimilarity(a, b) {
    const bg = (str) => {
      const s = (str || '').toLowerCase().replace(/\s+/g, '')
      if (s.length < 2) return new Set(s ? [s] : [])
      const out = new Set()
      for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
      return out
    }
    const A = bg(a), B = bg(b)
    if (A.size === 0 || B.size === 0) return 0
    let inter = 0
    for (const x of A) if (B.has(x)) inter++
    return (2 * inter) / (A.size + B.size)
  }

  it.each([
    ['출석', '출섹'],
    ['결제', '겹제'],
    ['출결', '츨결'],
  ])('"%s" ↔ "%s": 자모 방식이 예전보다 높은 점수를 낸다', (right, typo) => {
    expect(similarity(right, typo)).toBeGreaterThan(oldSimilarity(right, typo))
  })
})

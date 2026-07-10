import { describe, it, expect } from 'vitest'
import { maskCustomerInfo } from '../jandi-client.mjs'

describe('maskCustomerInfo — 이름+학번 붙여쓴 패턴', () => {
  it('이름+학번 붙어쓴 패턴을 [학생정보]로 치환', () => {
    expect(maskCustomerInfo('조은호3491 학생입니다')).toBe('[학생정보] 학생입니다')
  })
})

describe('maskCustomerInfo — 이름→라벨 순서(2026-07 보강, 실사용 패턴)', () => {
  it('"이름 학생이" 순서를 가림 (실측: 신성호 학생이)', () => {
    expect(maskCustomerInfo('신성호 학생이 같이 노출되어 확인 요청드립니다'))
      .toBe('*** 학생이 같이 노출되어 확인 요청드립니다')
  })
  it('이름+괄호 학번+학생 순서를 가림 (실측: 김진성(77904938) 학생)', () => {
    expect(maskCustomerInfo('브릿지관 54번 김진성(77904938) 학생 패드 사용하다가'))
      .toBe('브릿지관 54번 *** (****) 학생 패드 사용하다가')
  })
  it('"이름 학부모님" 순서를 가림', () => {
    expect(maskCustomerInfo('김민준 학부모님께 안내드렸습니다'))
      .toBe('*** 학부모님께 안내드렸습니다')
  })
})

describe('maskCustomerInfo — 라벨→이름 순서 규칙 제거 (2026-07, 정밀도 0에 가까워 폐기)', () => {
  it('"학생 OOO" 순서는 더 이상 가리지 않는다(과거엔 애먼 단어를 지웠음)', () => {
    expect(maskCustomerInfo('학생 정보를 확인해 주세요')).toBe('학생 정보를 확인해 주세요')
  })
})

describe('maskCustomerInfo — 오탐 방지(흔한 낱말·학년 표현은 그대로 유지)', () => {
  it('"초등학생"은 이름으로 오인해 가리지 않는다', () => {
    expect(maskCustomerInfo('초등학생')).toBe('초등학생')
  })
  it('"고등학생"은 그대로 유지', () => {
    expect(maskCustomerInfo('고등학생')).toBe('고등학생')
  })
  it('"전체 학부모"는 그대로 유지', () => {
    expect(maskCustomerInfo('전체 학부모')).toBe('전체 학부모')
  })
  it('"모든 학생"은 그대로 유지', () => {
    expect(maskCustomerInfo('모든 학생')).toBe('모든 학생')
  })
  it('"동일한 학생"은 그대로 유지 (실측 사례)', () => {
    expect(maskCustomerInfo('동일한 학생')).toBe('동일한 학생')
  })
})

describe('maskCustomerInfo — null/빈 문자열 보존', () => {
  it('null 은 그대로 반환', () => {
    expect(maskCustomerInfo(null)).toBe(null)
  })
  it('빈 문자열은 그대로 반환', () => {
    expect(maskCustomerInfo('')).toBe('')
  })
})

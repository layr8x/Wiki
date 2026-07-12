import { describe, it, expect } from 'vitest'
import { maskName, maskBody } from '../maskPII'

describe('maskPII.maskName', () => {
  it('외자/2자/3자+ 규칙', () => {
    expect(maskName('홍')).toBe('*')
    expect(maskName('김철')).toBe('김*')
    expect(maskName('홍길동')).toBe('홍*동')
    expect(maskName('남궁민수')).toBe('남**수')
  })
  it('멱등 + null 보존', () => {
    expect(maskName(maskName('홍길동'))).toBe('홍*동')
    expect(maskName(null)).toBe(null)
  })
})

describe('maskPII.maskBody', () => {
  it('전화/이메일/주민/카드', () => {
    expect(maskBody('010-1234-5678')).toBe('010-****-5678')
    expect(maskBody('a.b@example.com')).toBe('***@example.com')
    expect(maskBody('901231-1234567')).toBe('[주민번호]')
    expect(maskBody('1234-5678-9012-3456')).toBe('[카드번호]')
  })
  it('라벨 이름 + 폼 단독줄 이름', () => {
    expect(maskBody('학생이름: 홍길동')).toBe('학생이름: 홍*동')
    expect(maskBody('홍길동\n010-1234-5678')).toBe('홍*동\n010-****-5678')
  })
  it('문장 안에서 이름 바로 뒤에 전화번호가 오는 경우도 마스킹', () => {
    expect(maskBody('신승윤 010-1234-5624입니다')).toBe('신*윤 010-****-5624입니다')
    expect(maskBody('저는 김철수이고 연락처는 010-9999-8888 입니다')).toBe(
      '저는 김철수이고 연락처는 010-****-8888 입니다',
    )
  })
  it('전화번호 앞 낱말이 이름이 아니면 건드리지 않음(오탐 방지)', () => {
    expect(maskBody('연락처 010-1234-5678 입니다')).toBe('연락처 010-****-5678 입니다')
    expect(maskBody('전화번호 010-1234-5678로 부탁드려요')).toBe('전화번호 010-****-5678로 부탁드려요')
  })
  it('PII 없으면 그대로, null 보존, 멱등', () => {
    expect(maskBody('수업 문의')).toBe('수업 문의')
    expect(maskBody(null)).toBe(null)
    const c = '학생이름: 홍길동\n010-1234-5678 / a@b.com'
    expect(maskBody(maskBody(c))).toBe(maskBody(c))
  })
})

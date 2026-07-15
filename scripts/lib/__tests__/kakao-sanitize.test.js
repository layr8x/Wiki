import { describe, it, expect } from 'vitest'
import {
  maskName,
  maskBody,
  sanitizeRaw,
  sanitizeMessageRow,
  sanitizeChatRow,
} from '../kakao-sanitize.mjs'

describe('maskName', () => {
  it('외자(1글자)는 *', () => {
    expect(maskName('홍')).toBe('*')
  })
  it('2글자는 앞글자 + *', () => {
    expect(maskName('김철')).toBe('김*')
  })
  it('3글자는 가운데만 가림', () => {
    expect(maskName('홍길동')).toBe('홍*동')
  })
  it('4글자는 가운데 전부 가림', () => {
    expect(maskName('남궁민수')).toBe('남**수')
  })
  it('앞뒤 공백 제거 후 처리', () => {
    expect(maskName('  홍길동  ')).toBe('홍*동')
  })
  it('멱등성 — 이미 마스킹된 이름 재적용', () => {
    expect(maskName(maskName('홍길동'))).toBe('홍*동')
    expect(maskName(maskName('김철'))).toBe('김*')
  })
  it('null/빈 문자열 보존', () => {
    expect(maskName(null)).toBe(null)
    expect(maskName('')).toBe('')
  })
})

describe('maskBody — 연락처/식별번호', () => {
  it('휴대폰 가운데 마스킹 (구분자 있음)', () => {
    expect(maskBody('연락처 010-1234-5678 입니다')).toBe('연락처 010-****-5678 입니다')
  })
  it('휴대폰 구분자 없는 11자리', () => {
    expect(maskBody('01012345678')).toBe('010-****-5678')
  })
  it('011 등 구형 번호', () => {
    expect(maskBody('011-123-4567')).toBe('011-****-4567')
  })
  it('유선(지역번호) 가운데 마스킹', () => {
    expect(maskBody('02-123-4567')).toBe('02-****-4567')
    expect(maskBody('031-123-4567')).toBe('031-****-4567')
  })
  it('국제표기 휴대폰(+82) 가운데 마스킹', () => {
    expect(maskBody('+82-10-9876-5432 로 연락주세요')).toBe('+82-10-****-5432 로 연락주세요')
    expect(maskBody('+821098765432')).toBe('+8210-****-5432')
  })
  it('이메일 로컬부 마스킹, 도메인 보존', () => {
    expect(maskBody('메일 hong.gildong@example.com 으로')).toBe('메일 ***@example.com 으로')
  })
  it('주민등록번호(내국인 1-4) → [주민번호]', () => {
    expect(maskBody('901231-1234567')).toBe('[주민번호]')
  })
  it('주민등록번호(외국인 5-8) → [주민번호]', () => {
    expect(maskBody('900101-5234567')).toBe('[주민번호]')
    expect(maskBody('051224-7654321')).toBe('[주민번호]')
  })
  it('카드 16자리 → [카드번호]', () => {
    expect(maskBody('1234-5678-9012-3456')).toBe('[카드번호]')
    expect(maskBody('1234567890123456')).toBe('[카드번호]')
  })
})

describe('maskBody — 이름', () => {
  it('라벨 뒤 이름 마스킹(라벨 보존)', () => {
    expect(maskBody('학생이름: 홍길동')).toBe('학생이름: 홍*동')
    expect(maskBody('이름:김철수')).toBe('이름:김*수')
  })
  it('폼 제출형: 전화가 있으면 줄 단독 이름 마스킹', () => {
    const input = '홍길동\n010-1234-5678'
    expect(maskBody(input)).toBe('홍*동\n010-****-5678')
  })
  it('문장 안에서 이름 바로 뒤에 전화번호가 오는 경우도 마스킹', () => {
    expect(maskBody('신승윤 010-1234-5624입니다')).toBe('신*윤 010-****-5624입니다')
  })
  it('전화번호 앞 낱말이 이름이 아니면 건드리지 않음(오탐 방지)', () => {
    expect(maskBody('연락처 010-1234-5678 입니다')).toBe('연락처 010-****-5678 입니다')
  })
  it('전화/이메일이 없으면 줄 단독 이름은 건드리지 않음', () => {
    expect(maskBody('홍길동')).toBe('홍길동')
    expect(maskBody('안녕하세요 반갑습니다')).toBe('안녕하세요 반갑습니다')
  })
  it('5자 이상 줄은 이름으로 보지 않음', () => {
    expect(maskBody('안녕하세요\nhong@example.com')).toBe('안녕하세요\n***@example.com')
  })
})

describe('maskBody — 일반/멱등', () => {
  it('PII 없는 본문은 그대로', () => {
    expect(maskBody('수업 문의드립니다')).toBe('수업 문의드립니다')
  })
  it('null/undefined 보존', () => {
    expect(maskBody(null)).toBe(null)
    expect(maskBody(undefined)).toBe(undefined)
  })
  it('멱등성 — 두 번 통과해도 동일', () => {
    const cases = [
      '연락처 010-1234-5678 / a@b.com',
      '학생이름: 홍길동\n010-9999-8888',
      '카드 1234-5678-9012-3456 주민 901231-1234567',
    ]
    for (const c of cases) {
      expect(maskBody(maskBody(c))).toBe(maskBody(c))
    }
  })
})

describe('sanitizeRaw', () => {
  it('manager 만 보존', () => {
    expect(sanitizeRaw({ manager: { id: 1, name: '상담원' }, user: { phone: '010' } })).toEqual({
      manager: { id: 1, name: '상담원' },
    })
  })
  it('manager 없으면 null', () => {
    expect(sanitizeRaw({ user: { nickname: '고객' } })).toBe(null)
  })
  it('비객체/배열/null → null', () => {
    expect(sanitizeRaw(null)).toBe(null)
    expect(sanitizeRaw('x')).toBe(null)
    expect(sanitizeRaw([1, 2])).toBe(null)
  })
})

describe('sanitizeMessageRow', () => {
  it('본문 마스킹 + raw 축소', () => {
    const row = {
      log_id: '1',
      chat_id: '2',
      message: '연락처 010-1234-5678',
      raw: { manager: { name: '김상담' }, text: '010-1234-5678' },
    }
    const out = sanitizeMessageRow(row)
    expect(out.message).toBe('연락처 010-****-5678')
    expect(out.raw).toEqual({ manager: { name: '김상담' } })
    expect(out.log_id).toBe('1')
  })
  it('고객 메시지 raw 는 null', () => {
    const out = sanitizeMessageRow({ message: 'hi', raw: { author: { id: 'x' } } })
    expect(out.raw).toBe(null)
  })
})

describe('sanitizeChatRow', () => {
  it('nickname/last_message 마스킹, raw 폐기', () => {
    const out = sanitizeChatRow({
      chat_id: '1',
      nickname: '홍길동',
      last_message: '제 번호는 010-1234-5678',
      raw: { talk_user: { nickname: '홍길동' } },
    })
    expect(out.nickname).toBe('홍*동')
    expect(out.last_message).toBe('제 번호는 010-****-5678')
    expect(out.raw).toBe(null)
    expect(out.chat_id).toBe('1')
  })
})

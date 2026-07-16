// src/lib/maskPII.js
// 화면 표시용 2차 PII 마스킹 (defense-in-depth).
// 데이터는 적재 시 이미 마스킹되지만(scripts/lib/kakao-sanitize.mjs), 레거시 행이나
// 만약의 누락에 대비해 표시 직전에도 한 번 더 가린다.
// 핵심 규칙은 데몬측 kakao-sanitize.mjs 와 동일하며, 양쪽 모두 테스트로 고정한다.

const NAME_LABELS =
  '회원명|가입자명|학생명|학생이름|학부모명|학부모이름|보호자명|자녀명|성함|이름'

const CARD_RE = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g
// 주민등록번호 성별코드 1-4=내국인, 5-8=외국인(둘 다 가림)
const RRN_RE = /\b\d{6}[-\s]?[1-8]\d{6}\b/g
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g
const MOBILE_RE = /(01[016-9])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g
// 국제표기 휴대폰(+82-10-…)
const INTL_MOBILE_RE = /(\+82[-.\s]?1[016-9])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g
const LANDLINE_RE = /(0\d{1,3})[-.\s](\d{3,4})[-.\s](\d{4})/g
const LABEL_NAME_RE = new RegExp(
  '(' + NAME_LABELS + ')(\\s*[:：]\\s*)([가-힣*]{1,4})',
  'g',
)
const HAS_PHONE_OR_EMAIL_RE =
  /(01[016-9][-.\s]?\d{3,4}[-.\s]?\d{4})|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/
const STANDALONE_NAME_RE = /(^|\n)[ \t]*([가-힣]{2,4})[ \t]*(?=\r?\n|$)/g
// 전화번호 앞에 흔히 오지만 사람 이름이 아닌 낱말(오탐 방지용 제외 목록)
const NON_NAME_BEFORE_PHONE = new Set([
  '연락처', '전화번호', '휴대폰', '휴대전화', '핸드폰', '연락', '번호',
  '문의', '접수', '상담', '아래', '여기', '이쪽', '저쪽', '카톡', '팀',
])
// 라벨/줄바꿈 없이 이름이 전화번호 바로 앞에 오는 패턴 — "신승윤 010-1234-5678입니다"
const INLINE_NAME_BEFORE_PHONE_RE =
  /(^|[\s,.\n])([가-힣]{2,4})(?=\s*(?:01[016-9][-.\s]?\d{3,4}[-.\s]?\d{4}|0\d{1,3}[-.\s]\d{3,4}[-.\s]\d{4}))/g
// 이미 가운데가 가려진 전화번호(010-****-5678) 앞에 이름이 남아있는 경우 — 이 버그가
// 있던 동안 이미 저장된 과거 메시지는 전화번호만 가려진 채라 원본 숫자가 없다. 표시
// 단계에서 이런 레거시 행까지 잡으려면 별도 패턴(가운데가 숫자 대신 *)이 필요하다.
const INLINE_NAME_BEFORE_MASKED_PHONE_RE =
  /(^|[\s,.\n])([가-힣]{2,4})(?=\s*(?:01[016-9][-.\s]?\*{3,4}[-.\s]?\d{4}|0\d{1,3}[-.\s]\*{3,4}[-.\s]\d{4}))/g

// 조사(는/은/이/가/로 등)가 붙어도 걸리도록 접두 일치로 판정 — "번호는"도 "번호"로 제외됨.
function isNonNameBeforePhone(name) {
  for (const w of NON_NAME_BEFORE_PHONE) {
    if (name.startsWith(w)) return true
  }
  return false
}

// 이름 마스킹: 외자→*, 2자→앞+*, 3자+→앞+가운데(*)+뒤.
export function maskName(name) {
  if (name == null) return name
  const s = String(name).trim()
  if (!s) return s
  const ch = [...s]
  if (ch.length === 1) return '*'
  if (ch.length === 2) return ch[0] + '*'
  return ch[0] + '*'.repeat(ch.length - 2) + ch[ch.length - 1]
}

// 본문 마스킹(이메일/전화/주민/카드/라벨이름/폼 단독줄 이름). 멱등.
export function maskBody(text) {
  if (text == null) return text
  let s = String(text)
  const formLike = HAS_PHONE_OR_EMAIL_RE.test(s)
  s = s.replace(CARD_RE, '[카드번호]')
  s = s.replace(RRN_RE, '[주민번호]')
  s = s.replace(EMAIL_RE, '***@$1')
  s = s.replace(INLINE_NAME_BEFORE_PHONE_RE, (m, pre, name) =>
    isNonNameBeforePhone(name) ? m : pre + maskName(name))
  s = s.replace(INLINE_NAME_BEFORE_MASKED_PHONE_RE, (m, pre, name) =>
    isNonNameBeforePhone(name) ? m : pre + maskName(name))
  s = s.replace(INTL_MOBILE_RE, '$1-****-$3')
  s = s.replace(MOBILE_RE, '$1-****-$3')
  s = s.replace(LANDLINE_RE, '$1-****-$3')
  s = s.replace(LABEL_NAME_RE, (_m, label, sep, name) => label + sep + maskName(name))
  if (formLike) {
    s = s.replace(STANDALONE_NAME_RE, (_m, pre, name) => pre + maskName(name))
  }
  return s
}

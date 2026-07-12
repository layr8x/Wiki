// scripts/lib/kakao-sanitize.mjs
// 카카오 파트너 상담 데이터 PII 마스킹 — 적재 계층 공통 모듈.
//
// 정책(확정): option 1 = 저장 전 비가역 마스킹. 원본(raw)은 상담원(manager)만 보존,
// 고객 PII 는 평문으로 보관하지 않는다. 디스플레이 마스킹은 2차 방어.
//
// 핸드오프(2026-05-22) §2.3 마스킹 규칙 재구축:
//  - 전화(휴대폰 01[016-9] / 유선 지역번호): 가운데 자리 마스킹 → 010-****-5678
//  - 이메일: 로컬부 마스킹 → ***@domain
//  - 주민등록번호 → [주민번호]
//  - 카드 16자리 → [카드번호]
//  - 이름: 가운데 글자 마스킹(외자→*, 2자→김*, 3자+→홍*동)
//  - 라벨 뒤 이름: (회원명|가입자명|학생명|…|이름)[:：] [가-힣]{1,4} → 라벨 + maskName(이름)
//  - 닉네임(고객): maskName
//  - 줄 단독 이름(폼 제출형: 본문에 전화/이메일이 있을 때, 2~4 한글만 있는 줄) → maskName

const NAME_LABELS =
  '회원명|가입자명|학생명|학생이름|학부모명|학부모이름|보호자명|자녀명|성함|이름';

// 16자리 카드(4-4-4-4, 구분자 -/공백 허용)
const CARD_RE = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
// 주민등록번호 6자리-[1-4]+6자리
const RRN_RE = /\b\d{6}[-\s]?[1-4]\d{6}\b/g;
// 이메일 (로컬부만 가림, 도메인 보존)
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
// 휴대폰 01[016-9]
const MOBILE_RE = /(01[016-9])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g;
// 유선(지역번호): 구분자 필수 — 무작위 긴 숫자열 오마스킹 방지
const LANDLINE_RE = /(0\d{1,3})[-.\s](\d{3,4})[-.\s](\d{4})/g;
// 라벨: 이름 (이름 그룹은 마스킹 문자 '*' 도 허용 → 재적용 시 멱등)
const LABEL_NAME_RE = new RegExp(
  '(' + NAME_LABELS + ')(\\s*[:：]\\s*)([가-힣*]{1,4})',
  'g',
);
// 본문에 전화/이메일 존재 여부 (폼 제출형 판정)
const HAS_PHONE_OR_EMAIL_RE =
  /(01[016-9][-.\s]?\d{3,4}[-.\s]?\d{4})|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;
// 줄 단독 한글 이름(2~4자)
const STANDALONE_NAME_RE = /(^|\n)[ \t]*([가-힣]{2,4})[ \t]*(?=\r?\n|$)/g;
// 전화번호 앞에 흔히 오지만 사람 이름이 아닌 낱말(오탐 방지용 제외 목록)
const NON_NAME_BEFORE_PHONE = new Set([
  '연락처', '전화번호', '휴대폰', '휴대전화', '핸드폰', '연락', '번호',
  '문의', '접수', '상담', '아래', '여기', '이쪽', '저쪽', '카톡', '팀',
]);
// 라벨/줄바꿈 없이 이름이 전화번호 바로 앞에 오는 패턴 — "신승윤 010-1234-5678입니다"
const INLINE_NAME_BEFORE_PHONE_RE =
  /(^|[\s,.\n])([가-힣]{2,4})(?=\s*(?:01[016-9][-.\s]?\d{3,4}[-.\s]?\d{4}|0\d{1,3}[-.\s]\d{3,4}[-.\s]\d{4}))/g;

// 깨진 유니코드(짝 안 맞는 surrogate) 제거. Postgres JSON 파서가 거부함.
// 예: 깨진 이모지 1바이트만 남은 경우 → 제거.
export function stripLoneSurrogates(s) {
  if (s == null) return s;
  return String(s).replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '',
  );
}

// 조사(는/은/이/가/로 등)가 붙어도 걸리도록 접두 일치로 판정 — "번호는"도 "번호"로 제외됨.
function isNonNameBeforePhone(name) {
  for (const w of NON_NAME_BEFORE_PHONE) {
    if (name.startsWith(w)) return true;
  }
  return false;
}

// 이름 마스킹: 외자→*, 2자→앞+*, 3자+→앞+가운데(*)+뒤.
export function maskName(name) {
  if (name == null) return name;
  const s = String(name).trim();
  if (!s) return s;
  const ch = [...s];
  if (ch.length === 1) return '*';
  if (ch.length === 2) return ch[0] + '*';
  return ch[0] + '*'.repeat(ch.length - 2) + ch[ch.length - 1];
}

// 본문 마스킹(이메일/전화/주민/카드/라벨이름/단독줄이름).
// 멱등: 이미 마스킹된 문자열을 다시 통과시켜도 동일 결과.
export function maskBody(text) {
  if (text == null) return text;
  let s = String(text);
  const formLike = HAS_PHONE_OR_EMAIL_RE.test(s);

  s = s.replace(CARD_RE, '[카드번호]');
  s = s.replace(RRN_RE, '[주민번호]');
  s = s.replace(EMAIL_RE, '***@$1');
  s = s.replace(INLINE_NAME_BEFORE_PHONE_RE, (m, pre, name) =>
    isNonNameBeforePhone(name) ? m : pre + maskName(name));
  s = s.replace(MOBILE_RE, '$1-****-$3');
  s = s.replace(LANDLINE_RE, '$1-****-$3');
  s = s.replace(LABEL_NAME_RE, (_m, label, sep, name) => label + sep + maskName(name));
  if (formLike) {
    s = s.replace(STANDALONE_NAME_RE, (_m, pre, name) => pre + maskName(name));
  }
  return s;
}

// raw JSONB 축소: 상담원(manager) 메타만 보존, 고객 PII 제거.
export function sanitizeRaw(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw.manager != null ? { manager: raw.manager } : null;
}

// kakao_partner_messages row 정제 (적재 직전).
export function sanitizeMessageRow(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.message != null) out.message = stripLoneSurrogates(maskBody(out.message));
  out.raw = sanitizeRaw(out.raw);
  return out;
}

// kakao_partner_chats row 정제 (적재 직전). nickname/last_message 마스킹, raw 폐기.
export function sanitizeChatRow(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.nickname) out.nickname = stripLoneSurrogates(maskName(out.nickname));
  if (out.last_message != null) {
    out.last_message = stripLoneSurrogates(maskBody(out.last_message));
  }
  out.raw = null;
  return out;
}

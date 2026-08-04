// src/lib/hangul.js
// 한글을 자모(초성·중성·종성)로 쪼갠다. 오타 교정에 쓴다.
//
// 왜 필요한가: 한글은 한 글자 안에 초성·중성·종성이 뭉쳐 있다. 그래서 글자 단위로
// 비교하면 "석"과 "섹"이 서로 아무 관계없는 문자가 된다. 영어는 receive 와 recieve 가
// 조각(ri, ec, ce…)을 대부분 공유하지만, 한국어는 한 글자만 틀려도 그 글자를 포함한
// 조각이 통째로 달라진다.
//
// 실측(2026-08-04, guides 135건 대상):
//   글자 단위 유사도로는 오타 검색이 한 건도 안 잡혔다("출섹"·"겹제"·"츨결" 전부 0건).
//   자모로 쪼개면 "출석"↔"출섹" 유사도가 0.200 에서 0.400 으로 오르고,
//   "겹제" 검색의 1위가 "AMS 회원 병합"(엉뚱)에서 "결제 수단 등록"(정답)으로 바뀐다.
//
// ※ 유사도 절대값은 낮게 나온다(짧은 질의어 vs 긴 제목). 그래서 "임계값을 넘는 것만"이
//   아니라 "정렬해서 상위 몇 개"로 써야 한다. 임계값으로 거르면 전부 탈락한다(실측).

const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ']
const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3

/** 문자열의 한글을 자모로 쪼갠다. 한글이 아닌 글자는 소문자로만 바꿔 그대로 둔다. */
export function toJamo(text) {
  let out = ''
  for (const ch of String(text || '')) {
    const cp = ch.codePointAt(0)
    if (cp >= HANGUL_START && cp <= HANGUL_END) {
      const code = cp - HANGUL_START
      out += CHO[Math.floor(code / 588)]
      out += JUNG[Math.floor((code % 588) / 28)]
      out += JONG[code % 28]
    } else {
      out += ch.toLowerCase()
    }
  }
  return out
}

/** 두 글자씩 잘라 만든 조각 집합. 공백은 무시한다. */
export function bigrams(str) {
  const s = String(str || '').replace(/\s+/g, '')
  if (s.length < 2) return new Set(s ? [s] : [])
  const out = new Set()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  return out
}

/**
 * 두 문자열의 닮은 정도(0~1). Dice 계수.
 * 비교 전에 자모로 쪼개므로 한글 오타에도 점수가 나온다.
 */
export function similarity(a, b) {
  const A = bigrams(toJamo(a))
  const B = bigrams(toJamo(b))
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return (2 * inter) / (A.size + B.size)
}

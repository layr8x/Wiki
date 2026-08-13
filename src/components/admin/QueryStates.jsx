// src/components/admin/QueryStates.jsx
// 관리자 화면의 "조회 실패 / 결과 없음" 두 상태를 한 곳에서 만든다.
//
// 왜 필요한가 (2026-08-13 UX 감사)
//   5개 화면 중 3개가 **조회 실패를 데이터 0으로 보여주고 있었다.** 오류 화면과 빈 화면의
//   픽셀이 완전히 같았다(md5 동일). 즉 서버가 죽어도 화면은 "가이드 0개"라고 단언했다.
//   카카오 수집이 18일간 멈춘 걸 아무도 못 알아챈 사고와 같은 유형이다.
//   "값이 0"과 "값을 못 읽음"은 다른 사실이고, 섞으면 판단이 틀어진다.
//
// 표현을 고르는 기준 (Astryx 문서)
//   - 오류는 Banner. EmptyState 문서가 "즉시 조치가 필요한 오류에는 EmptyState 대신 Banner"라고 명시.
//   - 결과 없음은 EmptyState. 제목만 두지 말고 다음에 뭘 할 수 있는지까지 준다.
//
// ⚠️ 개인정보: 빈 상태 설명에 **검색어 원문을 넣지 않는다.** 상담 본문 검색어에는 이름·전화번호가
//   들어갈 수 있고, 그게 화면 캡처·공유 문서로 새어 나간다. 방 이름·기간까지만 적는다.
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'

/**
 * 조회 실패 알림. 무엇이 실패했는지 + 원인 + 다시 시도.
 *
 * @param {object}   props
 * @param {string}   props.label     실패한 대상(예: '가이드 목록')
 * @param {Error}    [props.error]   react-query 가 준 오류
 * @param {Function} [props.onRetry] 보통 useQuery 의 refetch
 * @param {string}   [props.className]
 */
/**
 * 한국어 조사 "을/를" 고르기. 마지막 글자에 받침이 있으면 "을", 없으면 "를".
 * "통계을(를)" 처럼 괄호를 달아 두면 화면에서 읽기 거슬리고, 특히 소리로 읽어주는 기능에서는
 * 괄호까지 그대로 읽혀 문장이 끊긴다.
 * 한글 음절은 0xAC00 부터 28개 종성 단위로 배열돼 있어 나머지가 0이면 받침이 없다.
 */
function objectParticle(word) {
  const last = String(word || '').trim().slice(-1)
  const code = last.charCodeAt(0)
  if (!last || code < 0xac00 || code > 0xd7a3) return '를'   // 한글이 아니면(영문·숫자) 기본값
  return (code - 0xac00) % 28 === 0 ? '를' : '을'
}

export function QueryError({ label, error, onRetry, className }) {
  return (
    <Banner
      status="error"
      title={`${label}${objectParticle(label)} 불러오지 못했습니다`}
      description={error?.message || '잠시 후 다시 시도해 주세요.'}
      endContent={onRetry ? <Button label="다시 시도" variant="secondary" size="sm" onClick={onRetry} /> : undefined}
      className={className}
    />
  )
}

/**
 * 결과 없음. 필터 때문에 비었는지(→ 필터를 풀 수 있게), 원래 비었는지를 구분해 쓴다.
 *
 * @param {object}    props
 * @param {string}    props.title
 * @param {string}    [props.description] 검색어 원문은 넣지 말 것(위 주석 참고)
 * @param {ReactNode} [props.actions]
 * @param {boolean}   [props.isCompact]  카드 안처럼 좁은 자리에서 true
 */
export function QueryEmpty({ title, description, actions, isCompact = true }) {
  return <EmptyState title={title} description={description} actions={actions} isCompact={isCompact} />
}

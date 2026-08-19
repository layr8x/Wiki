// src/lib/csvExport.js
// 대용량 메시지 테이블을 CSV 로 전부 내려받기 위한 커서(keyset) 페이지 넘김.
//
// 왜 공용으로 뺐나 (2026-08-13)
//   카카오 상담·잔디 대화 두 화면이 같은 코드를 각자 갖고 있었고, 둘 다 같은 결함이 있었다.
//   예전 방식은 range(from, from+999) 로 건너뛰는(offset) 페이지 넘김이었는데,
//   LIVE 채널은 메시지가 102만 건이라 1,024번을 요청해야 했다. 건너뛰기 방식은 뒤로 갈수록
//   앞의 행을 전부 세고 지나가야 해서, 50만 번째 페이지 한 장이 60초를 넘겨 타임아웃났다(실측).
//   다른 채널은 5만 건 이하라 티가 안 나서 "LIVE 만 안 된다"로 보였다.
//
// 커서 방식이 왜 빠른가
//   "마지막으로 받은 시각보다 이전 것"만 인덱스로 바로 찾으므로 몇 번째 페이지든 속도가 같다.
//   실측 5,000건 255ms(깊이 무관), LIVE 기준 요청 1,024회 → 205회.
//
// 같은 시각(동률) 처리
//   경계에서 잘리지 않도록 lte 로 겹쳐 받고 고유 id 로 중복을 제거한다.
//   실데이터 최대 동률은 20건(LIVE)으로 페이지 크기 5,000건에 한참 못 미쳐 누락 위험이 없다.
//   만에 하나 한 페이지가 전부 같은 시각이면 더 진행할 수 없으므로 그 자리에서 멈춘다(무한 루프 방지).
//
// ⚠️ 2026-08-19 버그 수정 — "받은 개수가 요청보다 적으면 끝" 가정이 틀렸다.
//   Supabase 프로젝트의 API 설정(Max Rows, 기본값 1000)이 PostgREST 요청 하나가 돌려줄 수
//   있는 행 수를 강제로 제한한다. 코드가 `.limit(5000)`을 걸어도 서버가 실제로는 1000건만
//   돌려줄 수 있다는 뜻이다. 그 상태에서 "받은 게 요청보다 적으니 끝"이라고 판단하면
//   1000 < 5000 이 항상 참이 돼 **첫 페이지에서 바로 멈춘다** — 실제로는 훨씬 더 남아 있는데도.
//   (실장님이 보고한 "CSV가 액셀에서 1001개(=데이터 1000 + 머리글 1)만 보인다"가 이 증상이다.)
//   고친 방식: 몇 건을 받았든 상관없이 계속 요청하고, "이번 페이지에서 새로 추가된 행이
//   0건"(=커서를 더 진행시킬 새 데이터가 없음) 이거나 "빈 응답"일 때만 멈춘다. 서버가 한 번에
//   얼마를 돌려주든 항상 올바르게 끝까지 받는다.

export const CSV_PAGE = 5000

/**
 * 커서 방식으로 조건에 맞는 행을 전부 받아온다.
 *
 * @param {object}   opts
 * @param {Function} opts.buildQuery  (limit) => supabase 쿼리빌더. 정렬은 시간 내림차순이어야 한다.
 * @param {string}   opts.timeColumn  커서로 쓸 시간 컬럼명 (예: 'sent_at')
 * @param {string}   opts.idColumn    중복 제거에 쓸 고유 컬럼명 (예: 'log_id')
 * @param {Function} [opts.onProgress] 지금까지 받은 건수 콜백(오래 걸릴 때 진행 표시용)
 * @param {number}   [opts.pageSize]  한 번에 받을 건수(서버 Max Rows 설정이 더 낮으면 그쪽이 우선한다)
 * @param {number}   [opts.maxPages]  안전 상한 — 서버가 요청보다 훨씬 적게 돌려줄 수 있어 넉넉히 잡는다
 * @returns {Promise<object[]>} 중복 없는 전체 행
 */
export async function fetchAllByCursor({
  buildQuery,
  timeColumn,
  idColumn,
  onProgress,
  pageSize = CSV_PAGE,
  maxPages = 100000,
}) {
  const out = []
  const seen = new Set()
  let cursor = null

  for (let page = 0; page < maxPages; page++) {
    let q = buildQuery(pageSize)
    if (cursor) q = q.lte(timeColumn, cursor)

    const { data, error } = await q
    if (error) throw error
    if (!data || !data.length) break

    let added = 0
    for (const row of data) {
      const id = String(row[idColumn])
      if (seen.has(id)) continue
      seen.add(id)
      out.push(row)
      added++
    }
    onProgress?.(out.length)

    // 겹쳐 받은 것이 전부 중복 = 커서를 더 진행시킬 새 데이터가 없다(진짜 끝, 또는 같은
    // 시각에 pageSize 건 이상 몰림). 여기서만 멈춘다 — "받은 개수 < pageSize"는 서버가
    // Max Rows 설정으로 덜 돌려준 것일 수 있어 끝났다는 근거가 되지 못한다(위 주석 참고).
    if (added === 0) break
    cursor = data[data.length - 1][timeColumn]
  }
  return out
}

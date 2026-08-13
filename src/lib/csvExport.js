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

export const CSV_PAGE = 5000

/**
 * 커서 방식으로 조건에 맞는 행을 전부 받아온다.
 *
 * @param {object}   opts
 * @param {Function} opts.buildQuery  (limit) => supabase 쿼리빌더. 정렬은 시간 내림차순이어야 한다.
 * @param {string}   opts.timeColumn  커서로 쓸 시간 컬럼명 (예: 'sent_at')
 * @param {string}   opts.idColumn    중복 제거에 쓸 고유 컬럼명 (예: 'log_id')
 * @param {Function} [opts.onProgress] 지금까지 받은 건수 콜백(오래 걸릴 때 진행 표시용)
 * @param {number}   [opts.pageSize]  한 번에 받을 건수
 * @param {number}   [opts.maxPages]  안전 상한
 * @returns {Promise<object[]>} 중복 없는 전체 행
 */
export async function fetchAllByCursor({
  buildQuery,
  timeColumn,
  idColumn,
  onProgress,
  pageSize = CSV_PAGE,
  maxPages = 1000,
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

    // 겹쳐 받은 것이 전부 중복 = 같은 시각에 pageSize 건 이상 몰림. 더 진행할 수 없다.
    if (added === 0) break
    if (data.length < pageSize) break
    cursor = data[data.length - 1][timeColumn]
  }
  return out
}

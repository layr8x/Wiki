// src/pages/admin/__tests__/csvPagination.test.js
// CSV 전체 내려받기의 페이지 넘김 로직 검증.
//
// 왜 필요한가 (2026-08-13 사용자 신고 "라이브 csv 데이터 다운로드가 안 되는 문제"):
//   예전 코드는 range(from, from+999) 로 건너뛰는 방식이었다. LIVE 채널은 메시지가 102만 건이라
//   1,024번을 요청해야 하는데, 건너뛰기 방식은 뒤로 갈수록 앞 행을 전부 세고 지나가야 해서
//   50만 번째 페이지 한 장이 60초를 넘겨 타임아웃났다(실측). 다른 채널은 5만 건 이하라
//   티가 안 나서 "LIVE 만 안 된다"로 보였다.
//   → 커서(keyset) 방식으로 바꿨고, 이 테스트가 그 로직이 다시 깨지지 않게 고정한다.
//
// 검증 포인트
//   1. 페이지 크기의 배수든 아니든 전부 받아온다(누락 없음).
//   2. 같은 시각(sent_at) 이 여러 건이어도 중복 없이 정확히 한 번씩 받는다.
//      (겹쳐 받는 lte 커서라 중복 제거가 반드시 동작해야 한다 — 실데이터 최대 동률 20건)
//   3. 요청 횟수가 건수에 비례한다(건너뛰기 방식처럼 폭증하지 않는다).
//   4. 서버가 요청한 pageSize 보다 적게 돌려줘도(Supabase 프로젝트 API 설정의 Max Rows) 전부 받는다
//      (2026-08-19 실장님 신고 "CSV가 액셀에서 1001개만 보인다" 재현·재발 방지 — 이 대역이
//      옛날엔 `.limit()` 요청을 그대로 다 들어주기만 해서, 서버가 실제로는 그보다 적게 돌려주는
//      실제 운영 상황을 흉내내지 못했다. 그래서 이 버그가 테스트를 통과한 채로 배포됐었다.)
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── supabase 대역: order/limit/lte/eq/ilike/gte/lt 체이닝을 흉내내고 고정 데이터에서 잘라준다.
// state.cap 을 두면 실제 Supabase 처럼 `.limit()` 이 얼마든 요청보다 적게 돌려줄 수 있는
// 상황(프로젝트 API 설정의 Max Rows)을 재현한다.
const state = { rows: [], calls: 0, cap: null }

vi.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: {
    from: () => {
      const f = { lte: null, limit: 5000 }
      const self = {
        select: () => self,
        eq: () => self,
        ilike: () => self,
        gte: () => self,
        lt: () => self,
        order: () => self,
        limit: (n) => { f.limit = n; return self },
        lte: (_col, v) => { f.lte = v; return self },
        then(resolve) {
          state.calls++
          // 최신순 정렬 + 커서(lte) 적용 + limit — 서버 Max Rows(state.cap)가 있으면
          // 클라이언트가 요청한 limit 보다 우선한다(실제 PostgREST 동작 재현).
          const effectiveLimit = state.cap ? Math.min(f.limit, state.cap) : f.limit
          const rows = state.rows
            .filter((r) => (f.lte ? r.sent_at <= f.lte : true))
            .sort((a, b) => (a.sent_at < b.sent_at ? 1 : a.sent_at > b.sent_at ? -1 : 0))
            .slice(0, effectiveLimit)
          return Promise.resolve({ data: rows, error: null }).then(resolve)
        },
      }
      return self
    },
  },
}))

const { fetchAllByCursor, CSV_PAGE } = await import('@/lib/csvExport')

// 카카오 상담 화면이 쓰는 것과 동일한 호출 형태
const { supabase } = await import('@/lib/supabase')
const fetchAllForCsv = ({ onProgress }) => fetchAllByCursor({
  timeColumn: 'sent_at',
  idColumn: 'log_id',
  onProgress,
  buildQuery: (limit) => supabase.from('kakao_partner_messages')
    .select('*').eq('profile_id', '_rcpPG').order('sent_at', { ascending: false }).limit(limit),
})

// n건 생성. tie 만큼 같은 시각을 공유하게 만들어 동률 처리까지 검증한다.
function makeRows(n, tie = 1) {
  const base = Date.UTC(2026, 0, 1)
  return Array.from({ length: n }, (_, i) => ({
    log_id: String(1000000 + i),
    chat_id: String(500 + (i % 37)),
    sender_type: i % 3 === 0 ? 'user' : 'manager',
    message: '메시지 ' + i,
    message_type: 'text',
    sent_at: new Date(base + Math.floor(i / tie) * 60000).toISOString(),
    manager_name: null,
  }))
}

beforeEach(() => { state.calls = 0; state.cap = null })

describe('CSV 전체 내려받기 페이지 넘김', () => {
  it('페이지 크기보다 적으면 한 번에 다 받는다', async () => {
    state.rows = makeRows(120)
    const out = await fetchAllForCsv({ profileId: '_VGAQn', query: '', year: 'all', month: 'all' })
    expect(out).toHaveLength(120)
    // 1번으로 데이터를 다 받은 뒤, "더 없다"를 실제로 확인하는 빈 페이지 1번이 더 나간다
    // (2026-08-19 수정 — "받은 개수 < 요청 개수"만으로 끝났다고 단정하지 않는다. 아래
    // "서버가 적게 돌려줘도" 테스트가 그 이유다).
    expect(state.calls).toBe(2)
  })

  it('페이지 크기를 넘겨도 누락·중복 없이 전부 받는다', async () => {
    state.rows = makeRows(12_345)
    const out = await fetchAllForCsv({ profileId: '_rcpPG', query: '', year: 'all', month: 'all' })
    expect(out).toHaveLength(12_345)
    expect(new Set(out.map((r) => r.log_id)).size).toBe(12_345)
  })

  it('같은 시각 메시지가 섞여 있어도 정확히 한 번씩만 받는다', async () => {
    // 실데이터 최대 동률은 20건(LIVE). 넉넉히 20으로 재현한다.
    state.rows = makeRows(10_000, 20)
    const out = await fetchAllForCsv({ profileId: '_rcpPG', query: '', year: 'all', month: 'all' })
    expect(out).toHaveLength(10_000)
    expect(new Set(out.map((r) => r.log_id)).size).toBe(10_000)
  })

  it('요청 횟수가 건수에 비례한다 (건너뛰기 방식처럼 폭증하지 않음)', async () => {
    state.rows = makeRows(50_000)
    await fetchAllForCsv({ profileId: '_rcpPG', query: '', year: 'all', month: 'all' })
    // 5,000건씩이므로 10~12회면 충분하다. 예전 1,000건 방식이면 50회였다.
    expect(state.calls).toBeLessThanOrEqual(12)
  })

  it('진행 건수를 알려준다 (오래 걸릴 때 멈춘 것처럼 보이지 않게)', async () => {
    state.rows = makeRows(12_000)
    const seen = []
    await fetchAllForCsv({ profileId: '_rcpPG', query: '', year: 'all', month: 'all', onProgress: (n) => seen.push(n) })
    expect(seen.length).toBeGreaterThan(1)
    expect(seen[seen.length - 1]).toBe(12_000)
    // 단조 증가여야 한다
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
  })

  it('결과가 없으면 빈 배열을 돌려준다', async () => {
    state.rows = []
    const out = await fetchAllForCsv({ profileId: '_rkbcn', query: '', year: 'all', month: 'all' })
    expect(out).toEqual([])
  })

  it('서버가 Max Rows 설정으로 요청보다 적게 돌려줘도 전부 받는다 (2026-08-19 실장님 신고 재현)', async () => {
    // 코드는 pageSize=5000(CSV_PAGE)으로 요청하지만, 서버(Supabase 프로젝트 API 설정의
    // Max Rows)가 매번 최대 1000건까지만 돌려준다고 가정한다 — 실제 운영에서 벌어진 상황.
    // 고치기 전 코드는 "1000 < 5000이니 끝났다"고 오판해 첫 페이지(1000건 + CSV 머리글 1줄
    // = 액셀에서 "1001개")에서 멈췄다.
    state.cap = 1000
    state.rows = makeRows(12_345)
    const out = await fetchAllForCsv({ profileId: '_rcpPG', query: '', year: 'all', month: 'all' })
    expect(out).toHaveLength(12_345)
    expect(new Set(out.map((r) => r.log_id)).size).toBe(12_345)
    // 캡(1000)보다 훨씬 많은 요청을 했다는 뜻 — 첫 페이지에서 멈추지 않았다는 증거.
    expect(state.calls).toBeGreaterThan(12)
  })
})

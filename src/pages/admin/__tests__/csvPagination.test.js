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
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── supabase 대역: order/limit/lte/eq/ilike/gte/lt 체이닝을 흉내내고 고정 데이터에서 잘라준다.
const state = { rows: [], calls: 0 }

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
          // 최신순 정렬 + 커서(lte) 적용 + limit
          const rows = state.rows
            .filter((r) => (f.lte ? r.sent_at <= f.lte : true))
            .sort((a, b) => (a.sent_at < b.sent_at ? 1 : a.sent_at > b.sent_at ? -1 : 0))
            .slice(0, f.limit)
          return Promise.resolve({ data: rows, error: null }).then(resolve)
        },
      }
      return self
    },
  },
}))

const { fetchAllForCsv } = await import('../AdminConsultsPage.jsx')

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

beforeEach(() => { state.calls = 0 })

describe('CSV 전체 내려받기 페이지 넘김', () => {
  it('페이지 크기보다 적으면 한 번에 다 받는다', async () => {
    state.rows = makeRows(120)
    const out = await fetchAllForCsv({ profileId: '_VGAQn', query: '', year: 'all', month: 'all' })
    expect(out).toHaveLength(120)
    expect(state.calls).toBe(1)
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
})

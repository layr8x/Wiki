// tools/design-audit/admin/mock-supabase.js
// 관리자 화면 렌더 하네스용 Supabase 대역(stub).
//
// 왜 필요한가: /admin/* 은 로그인 + 실데이터가 있어야 열린다. 화면 정합·UX 검토를 하려면
//   매번 사람이 로그인해서 눈으로 보는 수밖에 없었다(§15-2의 "눈대중" 문제). 이 대역이
//   실제 페이지 코드를 그대로 두고 데이터 층만 갈아끼워, 어떤 상태든(정상·빈 목록·에러·로딩)
//   재현 가능한 화면으로 만든다.
//
// 대체 지점은 `@/lib/supabase` 한 곳뿐이다 — 페이지·훅이 전부 이 모듈을 거치므로,
// 페이지 코드는 한 줄도 고치지 않는다(= 보이는 화면이 실제 화면과 같음이 보장된다).

import { FIXTURES, rpcFixture } from './fixtures.js'

export const isSupabaseEnabled = true

// 화면 상태 전환용. ?state=empty / ?state=error / ?state=loading 로 렌더한다.
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const STATE = params.get('state') || 'ok'

function settle(rows) {
  if (STATE === 'error') return Promise.resolve({ data: null, error: { message: '조회에 실패했습니다(하네스 강제 오류)' }, count: null })
  if (STATE === 'empty') return Promise.resolve({ data: [], error: null, count: 0 })
  if (STATE === 'loading') return new Promise(() => {})   // 영원히 pending → 스켈레톤 상태 캡처
  return Promise.resolve({ data: rows, error: null, count: Array.isArray(rows) ? rows.length : 0 })
}

// PostgREST 체이닝을 흉내낸다. 모든 필터는 no-op — 어떤 조건이 와도 고정 픽스처를 돌려준다.
// (레이아웃·상태를 보는 게 목적이라 필터 정확도는 필요 없다.)
function builder(table) {
  const rows = FIXTURES[table] ?? []
  const self = {
    _rows: rows,
    then(resolve, reject) { return settle(self._rows).then(resolve, reject) },
  }
  const passthrough = [
    'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
    'not', 'or', 'filter', 'order', 'range', 'limit', 'match', 'contains',
  ]
  for (const m of passthrough) self[m] = () => self
  self.single = () => settle(self._rows[0] ?? null)
  self.maybeSingle = () => settle(self._rows[0] ?? null)
  self.insert = () => self
  self.update = () => self
  self.upsert = () => self
  self.delete = () => self
  return self
}

export const supabase = {
  from: (table) => builder(table),
  rpc: (name) => {
    const rows = rpcFixture(name)
    const self = {
      then(resolve, reject) { return settle(rows).then(resolve, reject) },
    }
    for (const m of ['select', 'eq', 'order', 'limit', 'single', 'maybeSingle']) self[m] = () => self
    return self
  },
  // /admin/* 은 manage_users 권한을 요구한다 → 하네스 세션은 관리자 역할로 고정.
  auth: {
    getSession: () =>
      Promise.resolve({
        data: {
          session: {
            user: {
              id: 'harness-user',
              email: 'harness@local',
              user_metadata: { role: 'admin', full_name: '디자인 검토' },
              app_metadata: { provider: 'email' },
            },
          },
        },
        error: null,
      }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: () => Promise.resolve({ error: null }),
  },
  channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
  removeChannel: () => {},
}

export default supabase

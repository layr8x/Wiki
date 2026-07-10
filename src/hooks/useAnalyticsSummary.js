// src/hooks/useAnalyticsSummary.js
// 공용 "분석 요약" 집계 훅 — 카카오 상담/잔디 대화 등 시계열 메시지 로그 공통 사용.
//
// 적용 방법론(로컬 CLAUDE.md 7번 규칙 준수 — 이름+풀이, [측정]/[추정]/[미측정] 구분):
// - KPI 트리 / North Star: 최근 7일 합계를 headline 지표로 선정
// - 가설검정(간이 z검정): 금주 vs 전주 카운트 차이가 표본변동 범위를 벗어나는지 판정
//   (두 표본 모두 같은 발생률이라는 귀무가설 하에서 SE = sqrt(n1+n2) 정규근사, |z|>=1.96 이면 유의)
// - 통계적 공정관리(SPC, DMAIC "관리(Control)" 단계 응용): 최근 14일 평균 ± 2표준편차를
//   관리상한/하한으로 보고, 최근 값이 이 밖이면 "이상치" 배지
// - 민감도(분모) 분석: summary.basis 에 집계 기준(테이블·기간·필터)을 명시해 반환 → 화면에서 각주로 노출
// - [미측정] 이중차분(대조군 없음, 이 위젯엔 부적합) · RICE우선순위(백로그 도구, 실시간 헤더엔 부적합)
//
// 데이터: timestamp 컬럼만 조회(본문 미조회 — PII 노출 최소화), 최근 30일 범위로 제한.
import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseEnabled } from '@/lib/supabase'

const DAY_MS = 24 * 60 * 60 * 1000
const TREND_DAYS = 14

// KST 기준 'YYYY-MM-DD' 버킷 키
function kstDateKey(iso) {
  const d = new Date(iso)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0 }
function stddev(arr, m) {
  if (arr.length < 2) return 0
  const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1)
  return Math.sqrt(v)
}

// 두 카운트(같은 길이 기간) 차이의 유의성 — 정규근사 z검정(포아송 발생률 비교의 표준 근사).
function twoCountZTest(n1, n2) {
  const se = Math.sqrt(n1 + n2)
  if (se === 0) return { z: 0, significant: false }
  const z = (n1 - n2) / se
  return { z, significant: Math.abs(z) >= 1.96 }
}

export function useAnalyticsSummary({ key, table, dateColumn, filters = {}, enabled = true }) {
  return useQuery({
    queryKey: ['analytics-summary', key, table, dateColumn, JSON.stringify(filters)],
    enabled: isSupabaseEnabled && enabled,
    staleTime: 5 * 60 * 1000,
    retry: 0,
    queryFn: async () => {
      const since = new Date(Date.now() - (TREND_DAYS + 7) * DAY_MS).toISOString()
      let q = supabase.from(table).select(dateColumn).gte(dateColumn, since).limit(200000)
      for (const [col, val] of Object.entries(filters)) {
        if (val != null) q = q.eq(col, val)
      }
      const { data, error } = await q
      if (error) throw error

      // 일자별 버킷 (최근 TREND_DAYS+7일)
      const buckets = new Map()
      for (const row of data || []) {
        const key = kstDateKey(row[dateColumn])
        buckets.set(key, (buckets.get(key) || 0) + 1)
      }
      const days = []
      const today = new Date()
      for (let i = TREND_DAYS + 6; i >= 0; i--) {
        const d = new Date(today.getTime() - i * DAY_MS)
        const key = kstDateKey(d.toISOString())
        days.push({ date: key, count: buckets.get(key) || 0 })
      }
      const trend = days.slice(-TREND_DAYS) // 최근 14일 (스파크라인 + 관리도)
      const thisWeek = days.slice(-7)
      const lastWeek = days.slice(-14, -7)
      const thisWeekTotal = thisWeek.reduce((a, d) => a + d.count, 0)
      const lastWeekTotal = lastWeek.reduce((a, d) => a + d.count, 0)
      const pctChange = lastWeekTotal > 0 ? ((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100 : null

      const trendCounts = trend.map((d) => d.count)
      const m = mean(trendCounts)
      const sd = stddev(trendCounts, m)
      const upper = m + 2 * sd
      const lower = Math.max(0, m - 2 * sd)
      const latest = trend[trend.length - 1]
      const isAnomaly = sd > 0 && (latest.count > upper || latest.count < lower)

      const { significant } = twoCountZTest(thisWeekTotal, lastWeekTotal)

      return {
        thisWeekTotal,
        lastWeekTotal,
        pctChange,
        significant,
        dailyAvg: thisWeekTotal / 7,
        trend,
        controlBand: { mean: m, upper, lower },
        isAnomaly,
        latestDay: latest,
        basis: { table, dateColumn, filters, windowDays: TREND_DAYS },
      }
    },
  })
}

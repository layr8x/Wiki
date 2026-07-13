// src/hooks/useAnalyticsSummary.js
// 공용 "분석 요약" 집계 훅 — 카카오 상담/잔디 대화 등 시계열 메시지 로그 공통 사용.
//
// 적용 방법론(로컬 CLAUDE.md 7번 규칙 준수 — 이름+풀이, [측정]/[추정]/[미측정] 구분):
// - KPI 트리 / North Star: 최근 7일 합계를 headline 지표로 선정
// - 가설검정(간이 z검정): 금주 vs 전주 카운트 차이가 표본변동 범위를 벗어나는지 판정
//   (두 표본 모두 같은 발생률이라는 귀무가설 하에서 SE = sqrt(n1+n2) 정규근사, |z|>=1.96 이면 유의)
// - 통계적 공정관리(SPC, DMAIC "관리(Control)" 단계 응용): 최근 14일 평균 ± 2표준편차를
//   관리상한/하한으로 보고, 최근 값이 이 밖이면 "이상치" 배지
// - 민감도(분모) 분석: summary.basis 에 집계 기준(테이블·기간·필터)을 명시해 반환 → 화면에서 각주로 노출.
//   count-only 쿼리로 실제 총 건수(trueCount)를 함께 확인해, limit(FETCH_CAP) 초과 시
//   isTruncated로 알림 — 잘린 채 조용히 틀린 통계를 보여주는 것을 방지.
// - 민감도(표본크기) 분석: z검정·SPC 관리도는 표본이 작으면 신뢰 불가 — 14일 합계가
//   MIN_SAMPLE_FOR_SIGNIFICANCE(10건) 미만이면 lowSample=true 로 두 판정 모두 보류.
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

// 정규근사 z검정과 ±2표준편차 관리도는 둘 다 표본이 충분히 클 때 성립하는 근사식이다.
// 통합로그인·LIVE기술지원처럼 하루 0~1건 나오는 채널은 "1건→8건"만 돼도 계산상 z값이
// 1.96을 넘고 관리상한도 쉽게 뚫려 "+700%, 통계적으로 유의미한 변화"·"이상치"가 동시에
// 뜨는데, 절대량이 작아 실제로는 그냥 하루치 노이즈일 가능성이 크다 — 계산은 틀리지
// 않았지만 비전문가에게 과신을 유발한다. 14일 합계가 이 미만이면 두 판정 모두 보류한다.
const MIN_SAMPLE_FOR_SIGNIFICANCE = 10

export function useAnalyticsSummary({ key, table, dateColumn, filters = {}, enabled = true }) {
  return useQuery({
    queryKey: ['analytics-summary', key, table, dateColumn, JSON.stringify(filters)],
    enabled: isSupabaseEnabled && enabled,
    staleTime: 5 * 60 * 1000,
    retry: 0,
    queryFn: async () => {
      const since = new Date(Date.now() - (TREND_DAYS + 7) * DAY_MS).toISOString()
      // Supabase 앞단의 PostgREST(=DB를 자동으로 REST API로 열어주는 서버)는 프로젝트 기본
      // 설정상 한 번의 요청에 최대 1,000행만 돌려준다 — .limit(FETCH_CAP)으로 더 크게 요청해도
      // 서버가 조용히 1,000행에서 잘라버려, 21일치 데이터가 실제로 몇 천 건만 돼도 매번
      // isTruncated 경고가 뜨는 원인이었다. CSV 다운로드(AdminConsultsPage.jsx)와 동일하게
      // 1,000건씩 나눠 끝까지 받아오도록 수정 — 이러면 이 경고는 정말 극단적인 물량일 때만 뜬다.
      const FETCH_CAP = 20000 // 21일 윈도우 실제 볼륨 대비 넉넉한 안전 상한(최대 20회 왕복)
      async function fetchAllDates() {
        const out = []
        for (let from = 0; from < FETCH_CAP; from += 1000) {
          let q = supabase.from(table).select(dateColumn).gte(dateColumn, since)
            .order(dateColumn, { ascending: true }).range(from, from + 999)
          for (const [col, val] of Object.entries(filters)) {
            if (val != null) q = q.eq(col, val)
          }
          const { data, error } = await q
          if (error) throw error
          if (!data || !data.length) break
          out.push(...data)
          if (data.length < 1000) break
        }
        return out
      }
      // 실제 총 건수를 별도 count-only 쿼리로 확인 — 위 페이지네이션도 FETCH_CAP을 넘는
      // 초극단적 물량에서는 잘릴 수 있으니, 그 경우에도 조용히 틀린 통계를 보여주지 않고
      // isTruncated로 명시적으로 알린다(기준2: 허위/오차 없이 완벽한 결과).
      let countQ = supabase.from(table).select('*', { count: 'exact', head: true }).gte(dateColumn, since)
      for (const [col, val] of Object.entries(filters)) {
        if (val != null) countQ = countQ.eq(col, val)
      }
      const [data, { count: trueCount, error: countError }] = await Promise.all([fetchAllDates(), countQ])
      if (countError) throw countError
      const fetchedCount = data.length
      const isTruncated = typeof trueCount === 'number' && trueCount > fetchedCount

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

      // thisWeekTotal + lastWeekTotal == trend(14일) 합계 — z검정·관리도 둘 다 이 14일
      // 표본에 기반하므로 같은 기준 하나로 표본 부족 여부를 판단한다.
      const lowSample = thisWeekTotal + lastWeekTotal < MIN_SAMPLE_FOR_SIGNIFICANCE
      const isAnomaly = !lowSample && sd > 0 && (latest.count > upper || latest.count < lower)
      const { significant: rawSignificant } = twoCountZTest(thisWeekTotal, lastWeekTotal)
      const significant = !lowSample && rawSignificant

      return {
        thisWeekTotal,
        lastWeekTotal,
        pctChange,
        significant,
        lowSample,
        dailyAvg: thisWeekTotal / 7,
        trend,
        controlBand: { mean: m, upper, lower },
        isAnomaly,
        latestDay: latest,
        isTruncated,
        trueCount,
        fetchedCount,
        basis: { table, dateColumn, filters, windowDays: TREND_DAYS, fetchCap: FETCH_CAP, minSampleForSignificance: MIN_SAMPLE_FOR_SIGNIFICANCE },
      }
    },
  })
}

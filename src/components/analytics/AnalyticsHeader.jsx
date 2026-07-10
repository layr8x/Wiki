// src/components/analytics/AnalyticsHeader.jsx
// 공용 "분석 요약" 헤더 — 카카오 상담/잔디 대화 등 동종 페이지에 동일 스펙으로 재사용.
// (local/CLAUDE.md 18번 규칙: 동종 페이지는 셸/헤더/KPI/툴바를 공유 — 메시지 렌더링만 차별화)
//
// 레이아웃 = 피라미드 원칙(두괄식): 헤드라인 지표를 가장 위·가장 크게, 근거(추세·기준)는 아래.
// 색·간격·라운드는 전부 Astryx 토큰(var) 또는 primitive prop — raw hex/px 없음.
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { Text } from '@astryxdesign/core/Text'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import {
  TrendUp as TrendUpIcon,
  TrendDown as TrendDownIcon,
  Minus as FlatIcon,
  Warning as WarningIcon,
} from '@phosphor-icons/react'
import { useAnalyticsSummary } from '@/hooks/useAnalyticsSummary'
import './AnalyticsHeader.astryx.css'

// 관리도(SPC control band)를 포함한 14일 추세 스파크라인. Astryx에 차트 프리미티브가 없어
// primitive로 표현 불가한 시각화만 인라인 SVG(토큰 색상)로 직접 그린다.
function Sparkline({ trend, controlBand }) {
  const w = 280
  const h = 56
  const pad = 4
  const max = Math.max(controlBand.upper, ...trend.map((d) => d.count), 1)
  const x = (i) => pad + (i / (trend.length - 1)) * (w - pad * 2)
  const y = (v) => h - pad - (v / max) * (h - pad * 2)
  const linePath = trend.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.count)}`).join(' ')
  const bandTop = y(controlBand.upper)
  const bandBottom = y(controlBand.lower)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="anh-spark" role="img" aria-label="최근 14일 추세">
      {/* 관리도 밴드: 평균 ± 2표준편차(정상 변동 범위) */}
      <rect x={pad} y={bandTop} width={w - pad * 2} height={Math.max(0, bandBottom - bandTop)} className="anh-spark-band" />
      <path d={linePath} className="anh-spark-line" fill="none" />
      {trend.map((d, i) => (
        <circle
          key={d.date}
          cx={x(i)}
          cy={y(d.count)}
          r={i === trend.length - 1 ? 3 : 1.6}
          className={i === trend.length - 1 ? 'anh-spark-dot-last' : 'anh-spark-dot'}
        />
      ))}
    </svg>
  )
}

function TrendBadge({ pctChange, significant }) {
  if (pctChange == null) return <Badge variant="neutral" label="전주 데이터 없음" />
  const up = pctChange > 0
  const flat = Math.abs(pctChange) < 0.5
  const Icon = flat ? FlatIcon : up ? TrendUpIcon : TrendDownIcon
  const variant = flat ? 'neutral' : up ? 'success' : 'error'
  const pct = Math.abs(pctChange).toFixed(1)
  const label = flat ? '전주 대비 변화 없음' : `전주 대비 ${up ? '+' : '-'}${pct}%`
  return (
    <HStack gap={2} vAlign="center">
      <Badge variant={variant} icon={<Icon size={12} />} label={label} />
      <Text type="supporting" size="sm">
        {significant ? '(통계적으로 유의미한 변화)' : '(오차범위 내 변동으로 추정)'}
      </Text>
    </HStack>
  )
}

// key: react-query 캐시 키 접미사, table/dateColumn/filters: 집계 대상, title: 헤드라인 라벨
export function AnalyticsHeader({ analyticsKey, table, dateColumn, filters, title }) {
  const { data, isLoading, isError } = useAnalyticsSummary({ key: analyticsKey, table, dateColumn, filters })

  if (isLoading) {
    return (
      <Card padding={5} className="anh-card">
        <div className="anh-skel" />
      </Card>
    )
  }
  if (isError || !data) {
    return (
      <Card padding={5} className="anh-card">
        <Text type="supporting">분석 요약을 불러오지 못했습니다.</Text>
      </Card>
    )
  }

  const filterNote = Object.entries(data.basis.filters || {})
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${v}`).join(', ')

  return (
    <Card padding={5} className="anh-card">
      {data.isTruncated && (
        <Badge
          variant="error"
          icon={<WarningIcon size={12} />}
          label={`집계 범위 내 실제 ${data.trueCount.toLocaleString('ko-KR')}건 중 ${data.fetchedCount.toLocaleString('ko-KR')}건만 반영됨 — 아래 수치는 불완전할 수 있음`}
          className="anh-truncated-warning"
        />
      )}
      <div className="anh-grid">
        {/* 두괄식 헤드라인: 가장 중요한 숫자를 가장 크게, 가장 먼저 */}
        <VStack gap={1} className="anh-headline">
          <Text type="supporting" size="sm">{title} · 최근 7일 (North Star 지표)</Text>
          <HStack gap={3} vAlign="baseline">
            <Text as="span" size="3xl" weight="bold" hasTabularNumbers>
              {data.thisWeekTotal.toLocaleString('ko-KR')}
            </Text>
            <Text as="span" type="supporting">건</Text>
          </HStack>
          <TrendBadge pctChange={data.pctChange} significant={data.significant} />
        </VStack>

        {/* 보조 지표: 일평균 + 이상치 여부(SPC) */}
        <VStack gap={1} className="anh-sub">
          <Text type="supporting" size="sm">일평균</Text>
          <Text as="span" size="xl" weight="semibold" hasTabularNumbers>
            {data.dailyAvg.toFixed(1)}건/일
          </Text>
          {data.isAnomaly && (
            <Badge variant="warning" icon={<WarningIcon size={12} />} label="관리 범위 이탈(이상치)" />
          )}
        </VStack>

        {/* 추세 스파크라인 + 관리도 */}
        <VStack gap={1} className="anh-trend">
          <Text type="supporting" size="sm">최근 14일 추세 (음영 = 평균±2표준편차 관리 범위)</Text>
          <Sparkline trend={data.trend} controlBand={data.controlBand} />
        </VStack>
      </div>

      {/* 민감도(분모) 분석 각주: 계산 기준 명시 — 방법론 태그 [측정]/[추정]/[미측정] */}
      <Text type="supporting" size="xs" className="anh-footnote">
        [측정] 현재 필터 기준({filterNote || '전체'}) {data.isTruncated ? `실제 ${data.trueCount.toLocaleString('ko-KR')}건 중 ${data.fetchedCount.toLocaleString('ko-KR')}건만` : '실측'} 집계 · [추정] 통계적 유의성은 정규근사 z검정 간이 판정 ·
        [미측정] 대조군 인과추론(이중차분)은 대조군 부재로 이 위젯엔 미적용
      </Text>
    </Card>
  )
}

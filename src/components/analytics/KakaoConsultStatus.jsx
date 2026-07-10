// src/components/analytics/KakaoConsultStatus.jsx
// 카카오 상담 실시간 운영 현황 — "지금 뭐가 급한가"에 집중한 위젯.
// AnalyticsHeader(문의량 추세, 캐시 기반)와는 별개로 전부 실시간 RPC 직접 호출.
//
// KPI 트리 확정 근거(2026-07-10 sdij-data-analysis 조사):
//   North Star = 실시간 미해결 대기 건수(5채널 합산) — 반드시 캐시가 아닌 실시간이어야 함
//   (daily_snapshot 캐시가 배치 실패로 최대 2일 지연될 수 있음을 확인).
//   하위지표: SLA(중앙값 응답시간) · 카테고리 이상 급증 · 감정 추세 악화 채널 · 수집 파이프라인 상태.
//
// 색·간격·라운드는 전부 Astryx 토큰/prop — raw hex/px 없음.
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Banner } from '@astryxdesign/core/Banner'
import { Text } from '@astryxdesign/core/Text'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import { Divider } from '@astryxdesign/core/Divider'
import { Table, proportional } from '@astryxdesign/core/Table'
import { TrendUp as TrendUpIcon } from '@phosphor-icons/react'
import {
  useKakaoSlaStatus,
  useKakaoCategorySpike,
  useKakaoSentimentByChannel,
  useKakaoCollectionHealth,
} from '@/hooks/useGuides'
import './KakaoConsultStatus.astryx.css'

const HEALTH_VARIANT = { ok: 'success', warning: 'warning', critical: 'error' }
const HEALTH_LABEL = { ok: '정상 수집 중', warning: '수집 지연', critical: '로그인 만료' }

const SLA_COLUMNS = [
  { key: 'channel', header: '채널', width: proportional(1.2) },
  { key: 'waiting', header: '대기', width: proportional(0.8), align: 'end' },
  {
    key: 'medianFirstResponseMin', header: '중앙값 응답', width: proportional(1), align: 'end',
    renderCell: (row) => `${row.medianFirstResponseMin}분`,
  },
  {
    key: 'oldestWaitH', header: '최장 대기', width: proportional(1), align: 'end',
    renderCell: (row) => (row.oldestWaitH > 0 ? `${row.oldestWaitH.toFixed(1)}시간` : '—'),
  },
]

const HEALTH_COLUMNS = [
  {
    key: 'channelLabel', header: '채널', width: proportional(1.2),
    renderCell: (row) => (
      <HStack gap={2} vAlign="center">
        <StatusDot
          variant={HEALTH_VARIANT[row.health]}
          label={HEALTH_LABEL[row.health]}
          isPulsing={row.health !== 'ok'}
        />
        <Text as="span">{row.channelLabel}</Text>
      </HStack>
    ),
  },
  {
    key: 'hbAgeMin', header: '마지막 수집', width: proportional(1), align: 'end',
    renderCell: (row) => `${row.hbAgeMin.toFixed(0)}분 전`,
  },
  {
    key: 'avgPerDay', header: '일평균', width: proportional(1), align: 'end',
    renderCell: (row) => `${row.avgPerDay.toFixed(1)}건`,
  },
]

export function KakaoConsultStatus() {
  const { data: sla, isLoading: slaLoading } = useKakaoSlaStatus()
  const { data: spikes, isLoading: spikeLoading } = useKakaoCategorySpike()
  const { data: sentiment, isLoading: sentLoading } = useKakaoSentimentByChannel()
  const { data: health, isLoading: healthLoading } = useKakaoCollectionHealth()

  const totalWaiting = sla ? sla.reduce((sum, row) => sum + row.waiting, 0) : null
  const worseningChannels = sentiment ? sentiment.filter((row) => row.worsening) : []

  return (
    <Card padding={5} className="kcs-card">
      {/* 두괄식: North Star를 가장 위 · 가장 크게 */}
      <VStack gap={1} className="kcs-headline">
        <Text type="supporting" size="sm">지금 밀린 상담 (North Star · 5채널 합산, 실시간)</Text>
        {slaLoading ? (
          <div className="kcs-skel kcs-skel-headline" />
        ) : (
          <HStack gap={3} vAlign="baseline">
            <Text as="span" size="3xl" weight="bold" hasTabularNumbers>
              {(totalWaiting ?? 0).toLocaleString('ko-KR')}
            </Text>
            <Text as="span" type="supporting">건 대기 중</Text>
          </HStack>
        )}
      </VStack>

      {!spikeLoading && spikes && spikes.length > 0 && (
        <Banner
          status="warning"
          title={`오늘 "${spikes[0].category}" 문의가 평소보다 ${spikes[0].ratio.toFixed(1)}배 늘었습니다`}
          description={`최근 7일 평균 ${spikes[0].baseline7d.toFixed(1)}건 → 오늘 ${spikes[0].cnt}건`}
          className="kcs-spike-banner"
        />
      )}

      <Divider className="kcs-divider" />

      <Text weight="semibold" size="sm" className="kcs-section-title">채널별 응답 현황(SLA)</Text>
      {slaLoading ? (
        <div className="kcs-skel kcs-skel-table" />
      ) : (
        <Table data={sla || []} columns={SLA_COLUMNS} idKey="channel" density="compact" dividers="rows" />
      )}

      <Divider className="kcs-divider" />

      <Text weight="semibold" size="sm" className="kcs-section-title">수집 파이프라인 상태</Text>
      {healthLoading ? (
        <div className="kcs-skel kcs-skel-table" />
      ) : (
        <Table data={health || []} columns={HEALTH_COLUMNS} idKey="profileId" density="compact" dividers="rows" />
      )}

      {!sentLoading && worseningChannels.length > 0 && (
        <>
          <Divider className="kcs-divider" />
          <VStack gap={2} className="kcs-section-title">
            <Text weight="semibold" size="sm">부정감정 비율 상승 채널</Text>
            <HStack gap={2} wrap="wrap">
              {worseningChannels.map((row) => (
                <Badge
                  key={row.channel}
                  variant="error"
                  icon={<TrendUpIcon size={12} />}
                  label={`${row.channel} 부정 ${row.prevRate}%→${row.curRate}%`}
                />
              ))}
            </HStack>
          </VStack>
        </>
      )}

      <Text type="supporting" size="xs" className="kcs-footnote">
        [측정] 대기·SLA·수집상태는 실시간 직접 조회(캐시 아님) · [측정] 카테고리 급증은 최근 7일 평균 대비 오늘 실적(비율 2배 이상, 최소 5건) ·
        [측정] 감정 추세는 이번주 vs 지난주 부정 비율 비교
      </Text>
    </Card>
  )
}

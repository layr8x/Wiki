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
import { List } from '@astryxdesign/core/List'
import { Item } from '@astryxdesign/core/Item'
import { TrendUp as TrendUpIcon, CheckCircle as CheckIcon } from '@phosphor-icons/react'
import {
  useKakaoSlaStatus,
  useKakaoActionChats,
  useKakaoCategorySpike,
  useKakaoSentimentByChannel,
  useKakaoCollectionHealth,
} from '@/hooks/useGuides'
import { maskName, maskBody } from '@/lib/maskPII'
import './KakaoConsultStatus.astryx.css'

const HEALTH_VARIANT = { ok: 'success', warning: 'warning', critical: 'error' }
const HEALTH_LABEL = { ok: '정상 수집 중', warning: '수집 지연', critical: '로그인 만료' }

// 채널 배지 색(AdminConsultsPage의 CHANNEL_BADGE와 동일 계열 — 페이지 전체 색 일관성).
const CHANNEL_BADGE = {
  '마이클래스': 'blue', 'LIVE': 'green', 'LIVE 기술지원': 'teal', '콘텐츠': 'purple', '통합로그인': 'orange',
}

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

// RPC 호출이 실패했을 때(관측됨: kakao_sla_status가 간헐적으로 500) "0건"처럼
// 오해할 수 있는 값을 보여주지 않고 명확히 실패를 알리기 위한 공용 배지.
// (기준2: 허위/오차 없이 완벽한 결과 — 조용히 빈 값을 보여주는 것보다 실패를 알리는 게 낫다)
function ErrorNote({ label }) {
  return <Text type="supporting" size="sm" className="kcs-error">{label} 불러오기 실패 — 새로고침해 주세요</Text>
}

export function KakaoConsultStatus() {
  const { data: sla, isLoading: slaLoading, isError: slaError } = useKakaoSlaStatus()
  const { data: actionChats, isLoading: actionLoading, isError: actionError } = useKakaoActionChats(6)
  const { data: spikes, isLoading: spikeLoading, isError: spikeError } = useKakaoCategorySpike()
  const { data: sentiment, isLoading: sentLoading, isError: sentError } = useKakaoSentimentByChannel()
  const { data: health, isLoading: healthLoading, isError: healthError } = useKakaoCollectionHealth()

  const totalWaiting = sla ? sla.reduce((sum, row) => sum + row.waiting, 0) : null
  const worseningChannels = sentiment ? sentiment.filter((row) => row.worsening) : []

  return (
    <Card padding={5} className="kcs-card">
      {/* 두괄식: North Star를 가장 위 · 가장 크게 */}
      <VStack gap={1} className="kcs-headline">
        <Text type="supporting" size="sm">지금 밀린 상담 (North Star · 5채널 합산, 실시간)</Text>
        {slaLoading ? (
          <div className="kcs-skel kcs-skel-headline" />
        ) : slaError ? (
          <ErrorNote label="대기 건수" />
        ) : (
          <HStack gap={3} vAlign="baseline">
            <Text as="span" size="3xl" weight="bold" hasTabularNumbers>
              {(totalWaiting ?? 0).toLocaleString('ko-KR')}
            </Text>
            <Text as="span" type="supporting">건 대기 중</Text>
          </HStack>
        )}
      </VStack>

      {spikeError && (
        <Text type="supporting" size="sm" className="kcs-error kcs-spike-banner">
          카테고리 급증 확인 실패 — 새로고침해 주세요
        </Text>
      )}
      {!spikeLoading && !spikeError && spikes && spikes.length > 0 && (
        <Banner
          status="warning"
          title={`오늘 "${spikes[0].category}" 문의가 평소보다 ${spikes[0].ratio.toFixed(1)}배 늘었습니다`}
          description={`최근 7일 평균 ${spikes[0].baseline7d.toFixed(1)}건 → 오늘 ${spikes[0].cnt}건`}
          className="kcs-spike-banner"
        />
      )}

      <Divider className="kcs-divider" />

      {/* 사용자(상담원) 입장 데이터: 집계 숫자뿐 아니라 "지금 뭘 눌러서 처리해야 하는지" 실제 대화 목록.
          kakao_action_chats 기반 — 오래 기다린 순 상위 6건. */}
      <Text weight="semibold" size="sm" className="kcs-section-title">지금 처리할 대화</Text>
      {actionLoading ? (
        <div className="kcs-skel kcs-skel-list" />
      ) : actionError ? (
        <ErrorNote label="지금 처리할 대화" />
      ) : actionChats && actionChats.length > 0 ? (
        <List hasDividers density="compact" className="kcs-action-list">
          {actionChats.map((c, i) => (
            <Item
              key={`${c.channel}-${i}`}
              density="compact"
              startContent={
                <div className="kcs-action-badge">
                  <Badge variant={CHANNEL_BADGE[c.channel] || 'neutral'} label={c.channel} />
                </div>
              }
              label={maskName(c.nickname) || '(닉네임 없음)'}
              description={maskBody(c.preview) || '(내용 없음)'}
              descriptionLines={1}
              endContent={
                <Text as="span" type="supporting" size="sm" hasTabularNumbers className="kcs-action-wait">
                  {c.waitedH.toFixed(1)}시간 대기
                </Text>
              }
            />
          ))}
        </List>
      ) : (
        <HStack gap={2} vAlign="center" className="kcs-action-empty">
          <CheckIcon size={16} weight="fill" className="kcs-action-empty-icon" />
          <Text type="supporting" size="sm">지금 답 기다리는 대화가 없습니다</Text>
        </HStack>
      )}

      <Divider className="kcs-divider" />

      <Text weight="semibold" size="sm" className="kcs-section-title">채널별 응답 현황(SLA)</Text>
      {slaLoading ? (
        <div className="kcs-skel kcs-skel-table" />
      ) : slaError ? (
        <ErrorNote label="SLA 표" />
      ) : (
        <Table data={sla || []} columns={SLA_COLUMNS} idKey="channel" density="compact" dividers="rows" />
      )}

      <Divider className="kcs-divider" />

      <Text weight="semibold" size="sm" className="kcs-section-title">수집 파이프라인 상태</Text>
      {healthLoading ? (
        <div className="kcs-skel kcs-skel-table" />
      ) : healthError ? (
        <ErrorNote label="수집 파이프라인 상태" />
      ) : (
        <Table data={health || []} columns={HEALTH_COLUMNS} idKey="profileId" density="compact" dividers="rows" />
      )}

      {sentError && (
        <>
          <Divider className="kcs-divider" />
          <ErrorNote label="감정 추세" />
        </>
      )}
      {!sentLoading && !sentError && worseningChannels.length > 0 && (
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
        [측정] 대기·SLA·수집상태·지금 처리할 대화는 실시간 직접 조회(캐시 아님) · [측정] 지금 처리할 대화는 5채널 통합 대기 중 오래 기다린 순 상위 6건 ·
        [측정] 카테고리 급증은 최근 7일 평균 대비 오늘 실적(비율 2배 이상, 최소 5건) · [측정] 감정 추세는 이번주 vs 지난주 부정 비율 비교
      </Text>
    </Card>
  )
}

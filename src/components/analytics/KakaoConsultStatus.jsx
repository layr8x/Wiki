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
import { Banner } from '@astryxdesign/core/Banner'
import { Text } from '@astryxdesign/core/Text'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import { Divider } from '@astryxdesign/core/Divider'
import { Table, proportional } from '@astryxdesign/core/Table'
import { List } from '@astryxdesign/core/List'
import { Item } from '@astryxdesign/core/Item'
import { Collapsible } from '@astryxdesign/core/Collapsible'
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

// 수집 상태는 글자로 적는다. 예전에는 8px 점의 색깔만으로 정상·지연·만료를 구분했고
// 상태 이름은 읽어주는 기능에만 있었다 — 색을 구분하기 어려운 사람에게는 아무 정보가 없었고,
// 실제로 수집이 18일간 멈춘 걸 아무도 못 알아챈 자리라 판단이 틀렸을 때 비용이 크다.
// 색만 진하게 쓰는 건 "지금 조치가 필요한" 두 상태뿐이고, 정상은 조용한 회색으로 둔다
// (Astryx Badge 지침: 정상 항목마다 success 배지를 붙이지 말 것).
const HEALTH_BADGE = {
  ok:       { label: '정상',        variant: 'neutral' },
  warning:  { label: '지연',        variant: 'warning' },
  critical: { label: '로그인 만료', variant: 'error' },
}

// 채널 배지 색(AdminConsultsPage의 CHANNEL_BADGE와 동일 계열 — 페이지 전체 색 일관성).
const CHANNEL_BADGE = {
  '마이클래스': 'blue', 'LIVE': 'green', 'LIVE 기술지원': 'teal', '콘텐츠': 'purple', '통합로그인': 'orange',
}

// 대기시간 표시: 1시간 미만은 분 단위(원본 waited_h가 0.1시간=6분 단위로 반올림돼 있어
// 분 값도 정확한 초 단위가 아닌 근사치), 그 이상은 기존처럼 시간 단위.
function formatActionWait(waitedH) {
  if (waitedH < 1) {
    const min = Math.round(waitedH * 60)
    return min <= 0 ? '방금 접수' : `${min}분 대기`
  }
  return `${waitedH.toFixed(1)}시간 대기`
}
function formatOldestWait(waitedH) {
  if (waitedH <= 0) return '—'
  if (waitedH < 1) return `${Math.max(1, Math.round(waitedH * 60))}분`
  return `${waitedH.toFixed(1)}시간`
}

// 대기시간 긴급도 색 구분. [추정] 확정된 SLA(=Service Level Agreement, 응답 목표 시간) 값이
// 따로 없어 상담 운영상 통상적인 기준(2시간·6시간)으로 잠정 설정 — 실제 목표치가 있으면 조정.
function waitUrgencyClass(waitedH) {
  if (waitedH >= 6) return 'kcs-wait-critical'
  if (waitedH >= 2) return 'kcs-wait-warning'
  return ''
}

// 열 최소폭 명시: Table 기본 최소폭은 열당 120px라 4열 = 480px가 되어 모바일(~390px)에서
// 뒤쪽 열이 카드 밖으로 잘려 나갔다(실측 — "중앙값 응답"이 "중앙"까지만 보임).
// 값이 짧은 숫자 열이므로 실제 콘텐츠 폭에 맞춰 낮춰 한 화면에 다 들어가게 한다.
const SLA_COLUMNS = [
  { key: 'channel', header: '채널', width: proportional(1.2, { minWidth: 100 }) },
  { key: 'waiting', header: '대기', width: proportional(0.8, { minWidth: 48 }), align: 'end' },
  {
    // 단위는 값이 아니라 헤더에 둔다(숫자 열이 값마다 "분"을 달고 다니면 눈으로 비교하기 어렵다).
    key: 'medianFirstResponseMin', header: '중앙값 첫 응답(분)', width: proportional(1, { minWidth: 84 }), align: 'end',
    renderCell: (row) => row.medianFirstResponseMin.toLocaleString('ko-KR'),
  },
  {
    key: 'oldestWaitH', header: '최장 대기', width: proportional(1, { minWidth: 76 }), align: 'end',
    renderCell: (row) => (
      <Text as="span" hasTabularNumbers className={waitUrgencyClass(row.oldestWaitH)}>
        {formatOldestWait(row.oldestWaitH)}
      </Text>
    ),
  },
]

const HEALTH_COLUMNS = [
  { key: 'channelLabel', header: '채널', width: proportional(1.2, { minWidth: 100 }) },
  {
    // 배지가 앞에 오는 칸이라 왼쪽 정렬로 둔다(오른쪽 정렬이면 머리글만 오른쪽에 붙어 어긋난다).
    key: 'hbAgeMin', header: '마지막 수집', width: proportional(1.2, { minWidth: 128 }),
    // 하트비트(생존 신호)는 로그인 만료로 수집이 "실패"해도 갱신된다 — 실패 채널에
    // "19분 전"처럼 방금 수집한 듯한 시각을 보여주면 오해를 부른다(실측). 그래서 만료일 때는
    // 시각을 아예 안 쓰고 상태 배지만 남긴다.
    renderCell: (row) => {
      const badge = HEALTH_BADGE[row.health] || HEALTH_BADGE.warning
      return (
        <HStack gap={2} vAlign="center">
          <Badge label={badge.label} variant={badge.variant} />
          {row.healthReason !== 'auth' && (
            <Text as="span" hasTabularNumbers>{`${row.hbAgeMin.toFixed(0)}분 전`}</Text>
          )}
        </HStack>
      )
    },
  },
  {
    key: 'avgPerDay', header: '일평균', width: proportional(1, { minWidth: 64 }), align: 'end',
    renderCell: (row) => `${row.avgPerDay.toFixed(1)}건`,
  },
]

// RPC 호출이 실패했을 때(관측됨: kakao_sla_status가 간헐적으로 500) "0건"처럼
// 오해할 수 있는 값을 보여주지 않고 명확히 실패를 알리기 위한 공용 배지.
// (기준2: 허위/오차 없이 완벽한 결과 — 조용히 빈 값을 보여주는 것보다 실패를 알리는 게 낫다)
function ErrorNote({ label }) {
  return <Text type="supporting" size="sm" className="kcs-error">{label} 불러오기 실패 — 새로고침해 주세요</Text>
}

/**
 * @param {object}   props
 * @param {Function} [props.onSelectChat] 목록의 한 행을 눌렀을 때 호출. `{ chatId, profileId }` 를 받는다.
 *   주면 행이 눌리는 요소가 되고, 안 주면 예전처럼 정적 목록으로 남는다(대시보드처럼 이동할 목적지가
 *   없는 자리에서 헛클릭을 만들지 않기 위해서다).
 */
export function KakaoConsultStatus({ onSelectChat }) {
  const { data: sla, isLoading: slaLoading, isError: slaError } = useKakaoSlaStatus()
  const { data: actionChats, isLoading: actionLoading, isError: actionError } = useKakaoActionChats(6)
  const { data: spikes, isLoading: spikeLoading, isError: spikeError } = useKakaoCategorySpike()
  const { data: sentiment, isLoading: sentLoading, isError: sentError } = useKakaoSentimentByChannel()
  const { data: health, isLoading: healthLoading, isError: healthError } = useKakaoCollectionHealth()

  const totalWaiting = sla ? sla.reduce((sum, row) => sum + row.waiting, 0) : null
  const worseningChannels = sentiment ? sentiment.filter((row) => row.worsening) : []

  // SLA 표·파이프라인 상태 표는 "이상 없으면 안 봐도 되는" 참고 정보라 기본은 접어두고,
  // 지연·장애가 있을 때만 자동으로 펼쳐서 눈에 띄게 한다(정상 채널까지 매번 표로 나열하면
  // 화면 위쪽을 다 차지해 정작 "지금 처리할 대화"가 아래로 밀려남).
  const slaAlerts = sla ? sla.filter((row) => waitUrgencyClass(row.oldestWaitH) !== '') : []
  const healthAlerts = health ? health.filter((row) => row.health !== 'ok') : []

  // 수집이 멈추면 대기·응답 수치가 "마지막 수집 시점" 기준으로 굳는다 — 이걸 모르고 보면
  // 이미 답변된 대화가 24시간+ 대기로 보이는 착시가 생긴다(실측). 원인과 조치까지 배너로 안내.
  const authDown = health ? health.some((row) => row.healthReason === 'auth') : false
  const allStale = !authDown && health != null && health.length > 0 && health.every((row) => row.health !== 'ok')
  const staleMin = allStale ? Math.round(Math.min(...health.map((row) => row.hbAgeMin))) : 0

  return (
    <Card padding={5} className="kcs-card">
      {/* 두괄식: North Star를 가장 위 · 가장 크게 */}
      <VStack gap={1} className="kcs-headline">
        {/* 화면에는 뜻이 바로 읽히는 말로 쓰고, 이게 North Star 지표라는 사실은 각주로 내린다.
            "밀린"·"North Star"는 이 화면을 처음 보는 직원에게 설명이 필요한 표현이었다. */}
        <Text type="supporting" size="sm">지금 답을 기다리는 상담 (5채널 합산, 실시간)</Text>
        {slaLoading ? (
          <div className="kcs-skel kcs-skel-headline" />
        ) : slaError ? (
          <ErrorNote label="대기 건수" />
        ) : (
          <HStack gap={3} vAlign="baseline">
            <Text as="span" type="display-2" weight="bold" hasTabularNumbers>
              {(totalWaiting ?? 0).toLocaleString('ko-KR')}
            </Text>
            <Text as="span" type="supporting">건 대기 중</Text>
          </HStack>
        )}
      </VStack>

      {authDown && (
        <Banner
          status="error"
          title="카카오 로그인 만료 — 수집이 중단되었습니다"
          description="맥 스튜디오 Chrome에서 business.kakao.com에 다시 로그인해야 재개됩니다. 아래 대기·응답 수치는 마지막 수집 시점 기준이라 실제와 다를 수 있습니다."
          className="kcs-spike-banner"
        />
      )}
      {allStale && (
        <Banner
          status="warning"
          title={`수집 지연 — 마지막 수집 ${staleMin.toLocaleString('ko-KR')}분 전`}
          description="아래 대기·응답 수치가 최신이 아닐 수 있습니다. 수집 파이프라인 상태를 확인해 주세요."
          className="kcs-spike-banner"
        />
      )}
      {spikeError && (
        <Text type="supporting" size="sm" className="kcs-error kcs-spike-banner">
          카테고리 급증 확인 실패 — 새로고침해 주세요
        </Text>
      )}
      {!spikeLoading && !spikeError && spikes && spikes.length > 0 && (
        // "라이브"는 문의 유형 이름이면서 이 화면 아래에 채널 이름으로도 나온다(LIVE·LIVE 기술지원).
        // 어느 쪽인지 헷갈리므로 "유형"을 붙이고, 이미 받아 두고도 안 쓰던 채널별 내역을 함께 보여
        // 어느 채널을 열어야 하는지 바로 알 수 있게 한다(새로 조회하지 않는다).
        <Banner
          status="warning"
          title={`오늘 '${spikes[0].category}' 유형 문의가 평소보다 ${spikes[0].ratio.toFixed(1)}배 늘었습니다`}
          description={
            `최근 7일 평균 ${spikes[0].baseline7d.toFixed(1)}건 → 오늘 ${spikes[0].cnt}건`
            + (spikes[0].channelBreakdown?.length
              ? ` (${spikes[0].channelBreakdown.map((b) => `${b.channel} ${b.cnt}건`).join(' · ')})`
              : '')
          }
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
              key={c.chatId || `${c.channel}-${i}`}
              density="compact"
              // 이 위젯은 화면에서 유일하게 "지금 뭘 해야 하는지"를 말하는 자리인데, 정작 그리로 갈
              // 방법이 없어 눈으로만 읽고 아래 목록에서 다시 찾아야 했다.
              // Astryx Item 지침이 "Item 으로 화면 간 이동 금지"라 새 주소로 보내지 않고, 같은 화면의
              // 채널 필터를 바꾸고 그 대화로 스크롤하는 방식으로 처리한다.
              // 지침대로 행 안에 버튼을 따로 넣지 않는다(행 자체가 눌리는 요소).
              onClick={onSelectChat && c.chatId
                ? () => onSelectChat({ chatId: c.chatId, profileId: c.profileId })
                : undefined}
              startContent={
                <div className="kcs-action-badge">
                  <Badge variant={CHANNEL_BADGE[c.channel] || 'neutral'} label={c.channel} />
                </div>
              }
              label={maskName(c.nickname) || '(닉네임 없음)'}
              description={maskBody(c.preview) || '(내용 없음)'}
              descriptionLines={2}
              endContent={
                <Text
                  as="span"
                  type="supporting"
                  size="sm"
                  hasTabularNumbers
                  className={`kcs-action-wait ${waitUrgencyClass(c.waitedH)}`}
                >
                  {formatActionWait(c.waitedH)}
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

      {slaLoading ? (
        <>
          <Text weight="semibold" size="sm" className="kcs-section-title">채널별 응답 현황 (응답 목표 시간 기준)</Text>
          <div className="kcs-skel kcs-skel-table" />
        </>
      ) : slaError ? (
        <>
          <Text weight="semibold" size="sm" className="kcs-section-title">채널별 응답 현황 (응답 목표 시간 기준)</Text>
          <ErrorNote label="SLA 표" />
        </>
      ) : (
        <Collapsible
          defaultIsOpen={slaAlerts.length > 0}
          className="kcs-collapsible"
          trigger={
            // Collapsible 트리거는 한 줄을 전제로 만들어진 영역이라(내용-콘텐츠 간격이 4px뿐)
            // 줄바꿈이 생기면 바로 아래 표와 겹쳐 보인다 — 절대 두 줄로 안 넘어가게 wrap 금지.
            <HStack gap={2} vAlign="center" wrap="nowrap">
              <Text weight="semibold" size="sm">채널별 응답 현황 (응답 목표 시간 기준)</Text>
              {slaAlerts.length > 0 ? (
                <Badge variant="warning" label={`지연 ${slaAlerts.length}채널`} />
              ) : (
                <Text type="supporting" size="sm">전 채널 정상</Text>
              )}
            </HStack>
          }
        >
          {/* 표를 div 로 한 겹 더 감싸지 말 것 — Astryx Table 이 자체 가로 스크롤 래퍼를
              갖고 있어, 그 위에 overflow 상자를 씌우면 세로로 잘린다(CSS 파일 주석 참고). */}
          <Table data={sla || []} columns={SLA_COLUMNS} idKey="channel" density="compact" dividers="rows" />
        </Collapsible>
      )}

      <Divider className="kcs-divider" />

      {healthLoading ? (
        <>
          <Text weight="semibold" size="sm" className="kcs-section-title">수집 파이프라인 상태</Text>
          <div className="kcs-skel kcs-skel-table" />
        </>
      ) : healthError ? (
        <>
          <Text weight="semibold" size="sm" className="kcs-section-title">수집 파이프라인 상태</Text>
          <ErrorNote label="수집 파이프라인 상태" />
        </>
      ) : (
        <Collapsible
          defaultIsOpen={healthAlerts.length > 0}
          className="kcs-collapsible"
          trigger={
            <HStack gap={2} vAlign="center" wrap="nowrap">
              <Text weight="semibold" size="sm">수집 파이프라인 상태</Text>
              {healthAlerts.length > 0 ? (
                <Badge variant="error" label={`이상 ${healthAlerts.length}채널`} />
              ) : (
                <Text type="supporting" size="sm">전 채널 정상 수집 중</Text>
              )}
            </HStack>
          }
        >
          <Table data={health || []} columns={HEALTH_COLUMNS} idKey="profileId" density="compact" dividers="rows" />
        </Collapsible>
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
        맨 위 "지금 답을 기다리는 상담"이 이 화면의 North Star 지표(= 팀이 가장 먼저 보는 대표 숫자)입니다 ·
        [측정] 대기·응답 현황·수집상태·지금 처리할 대화는 실시간 직접 조회(캐시 아님) · [측정] 지금 처리할 대화는 5채널 통합 대기 중 오래 기다린 순 상위 6건 ·
        [측정] 카테고리 급증은 최근 7일 평균 대비 오늘 실적(비율 2배 이상, 최소 5건) · [측정] 감정 추세는 이번주 vs 지난주 부정 비율 비교 ·
        [추정] 응답 목표 시간은 확정된 값이 없어 2시간·6시간을 잠정 기준으로 색을 나눕니다
      </Text>
    </Card>
  )
}

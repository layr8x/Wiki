// src/components/analytics/JandiStatus.jsx
// 잔디 대화 실시간 현황 — 카카오와 달리 고객 응대 SLA 개념이 없는 내부 팀 채팅이라
// "위험 신호"가 아닌 "활동 현황" 톤으로 구성. 3개 지표 전부 실시간 직접 조회.
//
// 지표 확정 근거(2026-07-10 sdij-data-analysis 조사):
//   writer_name 이 전 건 NULL로 확인되어 실명 랭킹은 [미측정] 처리, 아래 3개만 채택.
//   오늘 메시지량 · 최근 7일 활성 작성자(익명 ID) · 최근 30일 스레드(댓글) 참여율.
//
// 색·간격·라운드는 전부 Astryx 토큰/prop — raw hex/px 없음.
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import { Divider } from '@astryxdesign/core/Divider'
import {
  useJandiTodayCount,
  useJandiActiveWriters,
  useJandiReplyRate,
} from '@/hooks/useGuides'
import './JandiStatus.astryx.css'

// 조회가 실패했을 때 0을 단언하지 않기 위한 표기. 카카오 위젯의 ErrorNote 와 같은 톤.
function ErrorNote({ label }) {
  return <Text type="supporting" size="sm" className="js-error">{label} 불러오기 실패 — 새로고침해 주세요</Text>
}

function StatBlock({ label, value, suffix, isLoading, isError }) {
  return (
    <VStack gap={1} className="js-stat">
      <Text type="supporting" size="sm">{label}</Text>
      {isLoading ? (
        <Skeleton width={80} height={32} />
      ) : isError ? (
        <ErrorNote label={label} />
      ) : (
        <HStack gap={2} vAlign="baseline">
          <Text as="span" type="display-3" weight="bold" hasTabularNumbers>{value}</Text>
          {suffix && <Text as="span" type="supporting">{suffix}</Text>}
        </HStack>
      )}
    </VStack>
  )
}

export function JandiStatus() {
  // ⚠️ isError 를 받는다. 예전에는 안 받아서 조회 실패가 "오늘 0건"으로 보였다 —
  //    내부 팀 채팅이 조용한 날과 수집이 죽은 날을 구분할 수 없었다.
  const { data: todayCount, isLoading: todayLoading, isError: todayError } = useJandiTodayCount()
  const { data: activeWriters, isLoading: writersLoading, isError: writersError } = useJandiActiveWriters(7)
  const { data: replyStats, isLoading: replyLoading, isError: replyError } = useJandiReplyRate(30)

  return (
    <Card padding={5} className="js-card">
      <VStack gap={1} className="js-headline">
        <Text type="supporting" size="sm">오늘 대화량 (North Star · 5개 방 합산, 실시간)</Text>
        {todayLoading ? (
          <Skeleton width={160} height={44} />
        ) : todayError ? (
          <ErrorNote label="오늘 대화량" />
        ) : (
          <HStack gap={3} vAlign="baseline">
            <Text as="span" type="display-2" weight="bold" hasTabularNumbers>
              {(todayCount ?? 0).toLocaleString('ko-KR')}
            </Text>
            <Text as="span" type="supporting">건</Text>
          </HStack>
        )}
      </VStack>

      <Divider className="js-divider" />

      <div className="js-grid">
        <StatBlock
          label="최근 7일 활성 작성자"
          value={(activeWriters ?? 0).toLocaleString('ko-KR')}
          suffix="명"
          isLoading={writersLoading}
          isError={writersError}
        />
        <StatBlock
          label="최근 30일 스레드(댓글) 참여율"
          value={replyStats ? replyStats.rate.toFixed(1) : '—'}
          suffix="%"
          isLoading={replyLoading}
          isError={replyError}
        />
      </div>

      <Text type="supporting" size="xs" className="js-footnote">
        [측정] 전부 실시간 직접 조회(캐시 아님) · [미측정] 작성자 실명 기준 랭킹은
        writer_name 컬럼이 전부 비어있어 계산 불가(익명 ID로만 인원수 집계)
      </Text>
    </Card>
  )
}

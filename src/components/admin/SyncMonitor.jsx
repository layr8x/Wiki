// src/components/admin/SyncMonitor.jsx
// Cron Job 동기화 상태 모니터링 대시보드 — Astryx(디자인시스템) 표면.
//   - 데이터 로직(sync_logs 조회·5분 폴링)은 100% 유지
//   - 시각 요소만 Astryx primitive(Card/VStack/HStack/Heading/Text/Badge/Button/Banner)로 교체
//   - 전역 <Theme>(AdminLayout)에서 토큰/모드를 상속하므로 이 컴포넌트는 Theme/CSS 를 감싸지 않음

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CheckCircle, WarningCircle, Clock, ArrowsClockwise } from '@phosphor-icons/react'

import { Card } from '@astryxdesign/core/Card'
import { VStack } from '@astryxdesign/core/VStack'
import { HStack } from '@astryxdesign/core/HStack'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Banner } from '@astryxdesign/core/Banner'

import './SyncMonitor.astryx.css'

// provider → Astryx Badge variant (Jira/Confluence 색 계열 구분)
const PROVIDER_BADGE = {
  jira: 'blue',
  confluence: 'purple',
}

// 로그 상태 → 아이콘 컴포넌트 + data-status(색상은 co-located css 토큰으로 처리)
function statusMeta(status) {
  if (status === 'success') return { icon: CheckCircle, key: 'success' }
  if (status === 'error') return { icon: WarningCircle, key: 'error' }
  return { icon: Clock, key: 'pending' }
}

function SyncLogRow({ log, countLabel, countValue }) {
  const { icon: Icon, key } = statusMeta(log.status)
  return (
    <div className="sm-row" data-status={key}>
      <HStack gap={3} vAlign="start">
        <Icon size={20} weight="fill" className="sm-row-icon" />
        <VStack gap={0.5} hAlign="stretch" className="sm-row-body">
          <Text weight="medium" size="sm">
            {log.status === 'success' ? '✅ 성공' : '❌ 실패'}
          </Text>
          <Text type="supporting">{log.message}</Text>
          {countValue > 0 && (
            <Text weight="semibold" size="sm">{countLabel}: {countValue}개</Text>
          )}
        </VStack>
        <Text type="supporting" className="sm-row-time" hasTabularNumbers>
          {new Date(log.synced_at).toLocaleTimeString('ko-KR')}
        </Text>
      </HStack>
    </div>
  )
}

function ProviderSection({ label, variant, logs, countLabel, countKey }) {
  return (
    <VStack gap={3} hAlign="stretch">
      <HStack gap={2} vAlign="center">
        <Badge variant={variant} label={label} />
        <Text type="supporting">{logs.length}개 기록</Text>
      </HStack>
      <VStack gap={2} hAlign="stretch">
        {logs.slice(0, 5).map(log => (
          <SyncLogRow key={log.id} log={log} countLabel={countLabel} countValue={log[countKey]} />
        ))}
        {logs.length === 0 && (
          <Text type="supporting" className="sm-empty">아직 실행된 동기화가 없습니다</Text>
        )}
      </VStack>
    </VStack>
  )
}

export function SyncMonitor() {
  const [syncLogs, setSyncLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)

  useEffect(() => {
    loadSyncLogs()
    // 5분마다 새로고침
    const interval = setInterval(loadSyncLogs, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  async function loadSyncLogs() {
    try {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .order('synced_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setSyncLogs(data || [])
      setLastSync(new Date())
    } catch (err) {
      console.error('Failed to load sync logs:', err)
    } finally {
      setLoading(false)
    }
  }

  const groupedLogs = {
    jira: syncLogs.filter(log => log.provider === 'jira'),
    confluence: syncLogs.filter(log => log.provider === 'confluence'),
  }

  return (
    <Card padding={6}>
      <VStack gap={6} hAlign="stretch">

        <div className="sm-header">
          <VStack gap={1}>
            <Heading level={3}>🔄 Cron Job 동기화 모니터</Heading>
            <Text type="supporting">
              Jira/Confluence 자동 동기화 상태
            </Text>
          </VStack>
          <Button
            variant="secondary"
            size="sm"
            label="새로고침"
            icon={<ArrowsClockwise size={16} />}
            onClick={loadSyncLogs}
            isDisabled={loading}
          />
        </div>

        {/* 마지막 갱신 시간 */}
        {lastSync && (
          <Text type="supporting" className="sm-lastsync">
            마지막 갱신: {lastSync.toLocaleTimeString('ko-KR')}
          </Text>
        )}

        {/* Jira 로그 */}
        <ProviderSection
          label="Jira"
          variant={PROVIDER_BADGE.jira}
          logs={groupedLogs.jira}
          countLabel="이슈"
          countKey="issue_count"
        />

        {/* Confluence 로그 */}
        <ProviderSection
          label="Confluence"
          variant={PROVIDER_BADGE.confluence}
          logs={groupedLogs.confluence}
          countLabel="페이지"
          countKey="page_count"
        />

        {/* 스케줄 정보 */}
        <Banner status="info" title="📅 동기화 스케줄" defaultIsExpanded>
          <ul className="sm-schedule-list">
            <li>🔵 Jira: 6시간마다 (00:00, 06:00, 12:00, 18:00)</li>
            <li>🟣 Confluence: 6시간마다 (01:00, 07:00, 13:00, 19:00)</li>
          </ul>
        </Banner>

      </VStack>
    </Card>
  )
}

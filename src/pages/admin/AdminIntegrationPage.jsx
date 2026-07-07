// src/pages/admin/AdminIntegrationPage.jsx
// 관리자 페이지: Jira/Confluence OAuth 설정 — Astryx(Meta 디자인시스템) 표면.
//   - 자식 컴포넌트(JiraConfluenceSettings/SyncMonitor)·라우팅은 그대로 유지
//   - 페이지 래퍼의 시각 요소만 Astryx primitive(VStack/Heading/Text)로 교체
//   - 전역 <Theme>(AdminLayout)에서 토큰/모드를 상속하므로 이 페이지는 Theme/CSS 를 감싸지 않음

import { VStack } from '@astryxdesign/core/VStack'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'

import { JiraConfluenceSettings } from '@/components/integrations/JiraConfluenceSettings'
import { SyncMonitor } from '@/components/admin/SyncMonitor'
import './AdminIntegrationPage.astryx.css'

export default function AdminIntegrationPage() {
  return (
    <div className="ai-shell">
      <VStack gap={8} hAlign="stretch">

        {/* ─── 헤더 ─────────────────────────────────────────────── */}
        <header>
          <VStack gap={1.5}>
            <Heading level={1}>🔗 외부 연동</Heading>
            <Text type="supporting">
              Jira, Confluence 등 외부 서비스와 안전하게 연동합니다.
            </Text>
          </VStack>
        </header>

        {/* Jira/Confluence 설정 */}
        <section>
          <JiraConfluenceSettings />
        </section>

        {/* Cron 동기화 모니터 */}
        <section>
          <SyncMonitor />
        </section>

      </VStack>
    </div>
  )
}

// src/components/integrations/JiraConfluenceSettings.jsx
// Jira/Confluence OAuth 통합 설정 UI — Astryx(디자인시스템) 표면.
//   - 데이터 로직(계정 로드·OAuth 연결 시작·연결 해제)·Supabase·fetch 호출은 100% 유지
//   - 시각 요소만 Astryx primitive(Card/VStack/HStack/Heading/Text/Badge/Button/Spinner/Banner)로 교체
//   - 전역 <Theme>(AdminLayout)에서 토큰/모드를 상속하므로 이 컴포넌트는 Theme/CSS 를 감싸지 않음

import { useCallback, useEffect, useState } from 'react'
import { supabase, isSupabaseEnabled } from '@/lib/supabase'
import { CheckCircle } from '@phosphor-icons/react'

import { Card } from '@astryxdesign/core/Card'
import { VStack } from '@astryxdesign/core/VStack'
import { HStack } from '@astryxdesign/core/HStack'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Banner } from '@astryxdesign/core/Banner'

import './JiraConfluenceSettings.astryx.css'

// provider → Astryx Badge variant (Jira/Confluence 색 계열 구분)
const PROVIDER_BADGE = {
  jira: 'blue',
  confluence: 'purple',
}
const PROVIDER_LABEL = {
  jira: 'Jira',
  confluence: 'Confluence',
}

export function JiraConfluenceSettings() {
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)

  // 현재 사용자 및 통합 로드
  const loadData = useCallback(async () => {
    if (!isSupabaseEnabled) {
      setError('Supabase 환경변수(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)가 설정되지 않았습니다.')
      setLoading(false)
      return
    }
    try {
      // loading 초기값이 true 라 mount 시점 setLoading(true) 는 불필요
      // (effect 내 동기 setState 경고 회피).
      const { data: sessionData, error: authError } = await supabase.auth.getSession()

      if (authError || !sessionData.session) {
        setError('로그인이 필요합니다')
        return
      }

      // OAuth 통합 조회
      const { data, error: dbError } = await supabase
        .from('oauth_integrations')
        .select('*')
        .eq('user_id', sessionData.session.user.id)

      if (dbError) throw dbError
      setIntegrations(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // mount 시 1회 비동기 데이터 페치 — setState 는 모두 await 이후 발생.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [loadData])

  // OAuth 연결 시작
  async function startConnect() {
    try {
      setConnecting(true)
      setError(null)

      const response = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'jira' }),
      })

      if (!response.ok) {
        throw new Error('Failed to start OAuth')
      }

      const { authUrl } = await response.json()
      // Atlassian OAuth 페이지로 리다이렉트
      window.location.href = authUrl
    } catch (err) {
      setError(err.message)
      setConnecting(false)
    }
  }

  // 통합 연결 해제
  async function disconnect(provider, cloudId) {
    if (!confirm('정말로 이 통합을 해제하시겠습니까?')) return

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) return

      const response = await fetch('/api/oauth/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({ provider, cloudId }),
      })

      if (!response.ok) throw new Error('Disconnect failed')

      // UI 업데이트
      setIntegrations(integrations.filter(
        i => !(i.provider === provider && i.cloud_id === cloudId)
      ))
    } catch (err) {
      setError(err.message)
    }
  }

  // 통합별 그룹화
  const groupedIntegrations = integrations.reduce((acc, integration) => {
    const key = `${integration.provider}-${integration.cloud_id}`
    if (!acc[key]) {
      acc[key] = { ...integration, count: 1 }
    } else {
      acc[key].count++
    }
    return acc
  }, {})

  if (loading) {
    return (
      <Card padding={6}>
        <VStack gap={4} hAlign="stretch">
          <Heading level={3}>Jira & Confluence</Heading>
          <VStack hAlign="center" className="jcs-loading">
            <Spinner label="불러오는 중…" />
          </VStack>
        </VStack>
      </Card>
    )
  }

  return (
    <Card padding={6}>
      <VStack gap={6} hAlign="stretch">

        <VStack gap={1.5}>
          <Heading level={3}>Jira & Confluence 연동</Heading>
          <Text type="supporting">
            Atlassian 계정으로 안전하게 연결합니다. API 키나 토큰 입력이 필요 없습니다.
          </Text>
        </VStack>

        {error && (
          <Banner status="error" title="오류 발생" description={error} />
        )}

        {/* 연결된 통합 목록 */}
        {Object.keys(groupedIntegrations).length > 0 && (
          <VStack gap={3} hAlign="stretch">
            <Text weight="semibold">연결된 계정</Text>
            <VStack gap={3} hAlign="stretch">
              {Object.values(groupedIntegrations).map(integration => (
                <div
                  key={`${integration.provider}-${integration.cloud_id}`}
                  className="jcs-account-row"
                >
                  <HStack gap={3} vAlign="center" hAlign="between">
                    <VStack gap={1} hAlign="stretch">
                      <HStack gap={2} vAlign="center">
                        <CheckCircle size={18} weight="fill" className="jcs-check-icon" />
                        <Text weight="medium" className="jcs-cap">{integration.provider}</Text>
                        <Badge
                          variant={PROVIDER_BADGE[integration.provider] || 'neutral'}
                          label={PROVIDER_LABEL[integration.provider] || integration.provider}
                        />
                      </HStack>
                      <Text type="supporting">계정: {integration.atlassian_email}</Text>
                      {integration.site_url && (
                        <Text type="supporting">사이트: {new URL(integration.site_url).hostname}</Text>
                      )}
                      {integration.expires_at && (
                        <Text type="supporting">토큰 갱신: {new Date(integration.expires_at).toLocaleDateString('ko-KR')}</Text>
                      )}
                    </VStack>
                    <Button
                      variant="destructive"
                      size="sm"
                      label="해제"
                      onClick={() => disconnect(integration.provider, integration.cloud_id)}
                    />
                  </HStack>
                </div>
              ))}
            </VStack>
          </VStack>
        )}

        {/* 연결 버튼 */}
        <VStack gap={3} hAlign="stretch">
          <Text weight="semibold">새 계정 추가</Text>
          <Text type="supporting">
            Atlassian 계정으로 로그인하여 Jira 및 Confluence에 접근합니다.
          </Text>
          <Button
            label="Atlassian 계정으로 연결"
            variant="primary"
            size="lg"
            isLoading={connecting}
            onClick={startConnect}
            className="jcs-connect-btn"
          />
        </VStack>

        {/* 안내 */}
        <Banner status="info" title="안내" defaultIsExpanded>
          <ul className="jcs-info-list">
            <li>API 키 노출 없이 안전한 OAuth 인증</li>
            <li>Jira 이슈 검색 및 생성 가능</li>
            <li>Confluence 페이지 검색 및 편집 가능</li>
            <li>토큰은 자동으로 갱신됩니다</li>
          </ul>
        </Banner>

      </VStack>
    </Card>
  )
}

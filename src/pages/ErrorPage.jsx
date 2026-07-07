// src/pages/ErrorPage.jsx
// 구조: 큰 상태 코드 + 메시지 + 복구 액션 3개 — Astryx 표면으로 마이그레이션.
//   - props(statusCode/message)·복구 네비게이션 동작은 그대로 유지
//   - 시각 요소는 Astryx primitive(Button/Heading/Text)로 교체, 레이아웃/배경은 co-located CSS(토큰 only)
import {
  House as Home,
  MagnifyingGlass as Search,
  ArrowLeft,
} from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'

import { VStack } from '@astryxdesign/core/VStack'
import { HStack } from '@astryxdesign/core/HStack'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import './ErrorPage.astryx.css'

export default function ErrorPage({ statusCode = 404, message = '찾을 수 없는 페이지입니다.' }) {
  const navigate = useNavigate()

  return (
    <div className="ep-shell">
      {/* 배경 그리드 — 은은한 폴리시 */}
      <div className="ep-grid" aria-hidden="true" />

      <VStack gap={6} hAlign="center">
        <p className="ep-code">{statusCode}</p>
        <VStack gap={2} hAlign="center">
          <Heading level={1}>{message}</Heading>
          <Text type="supporting" className="ep-desc">
            요청하신 주소가 변경되었거나 삭제되었을 수 있습니다.<br />
            가이드 목록에서 다시 찾아보세요.
          </Text>
        </VStack>
        <HStack gap={2}>
          <Button
            label="이전으로"
            variant="secondary"
            size="sm"
            icon={<ArrowLeft size={14} />}
            onClick={() => navigate(-1)}
          />
          <Button
            label="홈으로"
            variant="primary"
            size="sm"
            icon={<Home size={14} />}
            onClick={() => navigate('/')}
          />
          <Button
            label="가이드 검색"
            variant="ghost"
            size="sm"
            icon={<Search size={14} />}
            onClick={() => navigate('/guides')}
          />
        </HStack>
      </VStack>
    </div>
  )
}

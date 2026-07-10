// src/components/common/RouteBoundary.jsx
// 라우트 단위 ErrorBoundary + Suspense 조합 헬퍼.
// pathname 변경 시 자동 리셋 → 에러 페이지에서 다른 메뉴로 이동 가능.
import React, { Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { ErrorBoundary } from './ErrorBoundary'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { VStack } from '@astryxdesign/core/VStack'
import { Grid } from '@astryxdesign/core/Grid'
import './RouteBoundary.astryx.css'

function DefaultSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="페이지 로딩 중" className="rb-skel-shell">
      <VStack gap={4}>
        <Skeleton width={128} height={16} />
        <Skeleton width="66%" height={40} />
        <Skeleton width="100%" height={16} />
        <Skeleton width="83%" height={16} />
        <Grid columns={{ minWidth: 200, max: 3 }} gap={4}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`sk-${i}`} width="100%" height={128} radius="rounded" index={i} />
          ))}
        </Grid>
      </VStack>
    </div>
  )
}

export function RouteBoundary({ children, fallback }) {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary variant="page" resetKey={pathname}>
      <Suspense fallback={fallback ?? <DefaultSkeleton />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

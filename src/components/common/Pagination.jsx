// src/components/common/Pagination.jsx — 페이지네이션 컴포넌트 (Astryx 디자인시스템)
import React from 'react'
import { Pagination as AstryxPagination } from '@astryxdesign/core/Pagination'
import { VStack } from '@astryxdesign/core/VStack'
import { Text } from '@astryxdesign/core/Text'
import './Pagination.astryx.css'

export default function Pagination({ pagination }) {
  const {
    currentPage,
    totalPages,
    startIndex,
    endIndex,
    totalItems,
    goToPage,
  } = pagination

  if (totalPages <= 1) return null

  return (
    <VStack gap={4} hAlign="center" className="pagination-wrap">
      {/* 정보 텍스트 — 스크린리더가 페이지 변경을 인지하도록 aria-live */}
      <Text type="supporting" aria-live="polite">
        {startIndex} ~ {endIndex} / 총 {totalItems}개
      </Text>

      {/* 페이지 네비게이션 — hasPrevPage/hasNextPage는 Astryx Pagination이
          page/totalPages로 자체 계산하므로 별도 전달 불필요.
          goToPage는 usePagination 훅에서 1~totalPages 범위로 클램프되므로
          경계값 호출(첫/마지막 페이지에서 이전/다음)도 안전하다. */}
      <AstryxPagination
        page={currentPage}
        onChange={goToPage}
        totalPages={totalPages}
        totalItems={totalItems}
        variant="pages"
        label="페이지 네비게이션"
      />
    </VStack>
  )
}

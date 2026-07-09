// src/components/common/GlobalHeaderActions.jsx — Astryx 디자인시스템
// Layout 상단 헤더의 검색 + 액션 영역 (로고/제목은 AppSidebar 헤더로 이동)
import { useEffect } from 'react'
import {
  MagnifyingGlass as Search,
} from '@phosphor-icons/react'
import { Button } from '@astryxdesign/core/Button'
import { Kbd } from '@astryxdesign/core/Kbd'
import { Divider } from '@astryxdesign/core/Divider'
import { HStack } from '@astryxdesign/core/HStack'
import { useSearchStore } from '@/store/searchStore.jsx'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'
import './GlobalHeaderActions.astryx.css'

export default function GlobalHeaderActions() {
  const { open } = useSearchStore()

  // 단축키 로직은 마이그레이션 전과 동일하게 유지 — "/" 와 ⌘K(Windows는 Ctrl+K) 모두
  // 입력창에 포커스가 없을 때만 검색 오버레이를 연다. 화면에 보이는 힌트만 Kbd로 정리.
  useEffect(() => {
    const h = (e) => {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault()
        open()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  return (
    <HStack gap={2} vAlign="center" hAlign="between" className="gha-root">
      {/* 검색 트리거 — Kbd가 플랫폼(Mac=⌘K, 그 외=Ctrl+K)에 맞춰 자동 표시.
          "/" 단축키도 그대로 동작하므로 힌트는 mod+k 하나로 정리(두 단축키 모두
          동일 동작을 하므로 하나만 보여줘도 충분 — 좁은 화면에서는 숨김). */}
      <Button
        variant="secondary"
        size="sm"
        label="가이드 검색..."
        icon={<Search size={14} />}
        onClick={open}
        endContent={(
          <span className="gha-kbd">
            <Kbd keys="mod+k" />
          </span>
        )}
      />

      {/* height를 명시해 Divider(height:100%)가 실제로 채워질 기준을 확보 —
          ThemeToggle·UserMenu 버튼 크기(size="sm")와 동일한 토큰. */}
      <HStack gap={1} vAlign="center" height="var(--size-element-sm)">
        <ThemeToggle />
        <Divider orientation="vertical" />
        <UserMenu />
      </HStack>
    </HStack>
  )
}

// src/components/common/ThemeToggle.jsx — Astryx 디자인시스템
import { Moon, Sun } from '@phosphor-icons/react'
import { IconButton } from '@astryxdesign/core/IconButton'
import { useDarkMode } from '@/hooks/useDarkMode'

export default function ThemeToggle() {
  const { isDark, toggle } = useDarkMode()
  const label = isDark ? '라이트 모드 전환' : '다크 모드 전환'

  return (
    <IconButton
      label={label}
      tooltip={label}
      icon={isDark ? <Sun size={18} /> : <Moon size={18} />}
      variant="ghost"
      size="sm"
      onClick={toggle}
    />
  )
}

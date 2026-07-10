// src/components/common/UserMenu.jsx — Astryx DropdownMenu + Dialog 기반 유저 메뉴
// 토스트(useToast)만 예외적으로 shadcn 유지: 앱 전역 ToastProvider(App.jsx)가 shadcn 기반이라
// 이 컴포넌트 하나만 바꿔서는 대체 불가 — 전역 토스트 마이그레이션은 별도 작업으로 분리.
import { useState } from 'react'
import {
  SignOut as LogOut,
  Gear as Settings,
  SignIn as LogIn,
} from '@phosphor-icons/react'
import { useAuth, ROLE_LABELS } from '@/store/authStore'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Avatar } from '@astryxdesign/core/Avatar'
import { Badge } from '@astryxdesign/core/Badge'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { VStack } from '@astryxdesign/core/VStack'

export default function UserMenu() {
  const { user, isAuthenticated, loginWithEmail, logout } = useAuth()
  const { toast } = useToast()
  const [loginOpen, setLoginOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleEmailLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await loginWithEmail(email, password)
      setLoginOpen(false)
      toast({ title: '로그인 성공', description: '환영합니다!', variant: 'success' })
    } catch (err) {
      toast({ title: '로그인 실패', description: err.message || '이메일/비밀번호를 확인하세요', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    toast({ title: '로그아웃 완료', variant: 'info' })
  }

  const roleLabel = user?.role ? ROLE_LABELS[user.role] : null

  const menuItems = [
    {
      type: 'section',
      items: [
        {
          label: user?.name,
          description: user?.email,
          endContent: roleLabel ? <Badge label={roleLabel} variant="neutral" /> : undefined,
          isDisabled: true,
        },
      ],
    },
    { type: 'divider' },
    { label: '설정', icon: <Settings size={14} /> },
    { label: '로그아웃', icon: <LogOut size={14} />, onClick: handleLogout },
  ]

  return (
    <>
      {isAuthenticated ? (
        <DropdownMenu
          button={{
            label: user?.name || '메뉴',
            icon: <Avatar name={user?.name} src={user?.avatar} size="xsmall" />,
            variant: 'ghost',
            size: 'sm',
          }}
          items={menuItems}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          icon={<LogIn size={14} />}
          label="로그인"
          onClick={() => setLoginOpen(true)}
        />
      )}

      {/* 로그인 다이얼로그 */}
      <Dialog isOpen={loginOpen} onOpenChange={setLoginOpen} purpose="form" width={360}>
        <DialogHeader title="AMS Wiki 로그인" subtitle="계속하려면 로그인하세요." onOpenChange={setLoginOpen} />
        <form onSubmit={handleEmailLogin}>
          <VStack gap={3} padding={4}>
            <TextInput
              type="email"
              label="이메일"
              value={email}
              onChange={(value) => setEmail(value)}
              isRequired
              hasAutoFocus
            />
            <TextInput
              type="password"
              label="비밀번호"
              value={password}
              onChange={(value) => setPassword(value)}
              isRequired
            />
            <Button type="submit" label={loading ? '로그인 중...' : '로그인'} variant="primary" isLoading={loading} />
          </VStack>
        </form>
      </Dialog>
    </>
  )
}

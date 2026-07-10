// src/components/common/UserMenu.jsx — Astryx DropdownMenu + Dialog 기반 유저 메뉴
import { useState } from 'react'
import {
  SignOut as LogOut,
  Gear as Settings,
  SignIn as LogIn,
} from '@phosphor-icons/react'
import { useAuth, ROLE_LABELS } from '@/store/authStore'
import { useToast } from '@astryxdesign/core/Toast'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout } from '@astryxdesign/core/Layout'
import { LayoutContent } from '@astryxdesign/core/Layout'
import { LayoutFooter } from '@astryxdesign/core/Layout'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Avatar } from '@astryxdesign/core/Avatar'
import { VStack } from '@astryxdesign/core/VStack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'

export default function UserMenu() {
  const { user, isAuthenticated, loginWithEmail, logout } = useAuth()
  const toast = useToast()
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
      toast({ body: '로그인 성공 — 환영합니다!' })
    } catch (err) {
      toast({ body: '로그인 실패: ' + (err.message || '이메일/비밀번호를 확인하세요'), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    toast({ body: '로그아웃 완료' })
  }

  const roleLabel = user?.role ? ROLE_LABELS[user.role] : null

  return (
    <>
      {isAuthenticated ? (
        <DropdownMenu
          button={{
            label: user?.name || '사용자',
            icon: <Avatar src={user?.avatar} name={user?.name} size="small" />,
            variant: 'ghost',
            size: 'sm',
          }}
          items={[
            {
              type: 'section',
              title: user?.name,
              items: [
                { label: user?.email || '', isDisabled: true },
                ...(roleLabel ? [{ label: roleLabel, isDisabled: true }] : []),
              ],
            },
            { type: 'divider' },
            { label: '설정', icon: <Settings size={14} /> },
            { label: '로그아웃', icon: <LogOut size={14} />, onClick: handleLogout },
          ]}
        />
      ) : (
        <Button variant="ghost" size="sm" label="로그인" icon={<LogIn size={14} />} onClick={() => setLoginOpen(true)} />
      )}

      {/* 로그인 다이얼로그 */}
      <Dialog isOpen={loginOpen} onOpenChange={setLoginOpen} purpose="form" width={380}>
        <Layout
          header={<DialogHeader title="AMS Wiki 로그인" subtitle="계속하려면 로그인하세요." onOpenChange={setLoginOpen} />}
          content={
            <LayoutContent>
              <form onSubmit={handleEmailLogin} id="user-login-form">
                <VStack gap={3}>
                  <TextInput
                    label="이메일"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    isRequired
                    autoComplete="email"
                  />
                  <TextInput
                    label="비밀번호"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    isRequired
                    autoComplete="current-password"
                  />
                </VStack>
              </form>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <Button
                label={loading ? '로그인 중...' : '로그인'}
                variant="primary"
                type="submit"
                form="user-login-form"
                isDisabled={loading}
              />
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  )
}

// src/store/__tests__/authStore.test.jsx
// authStore — isSupabaseEnabled=false 경로 (localStorage 폴백) + 권한/역할 검증.
// 테스트 환경에는 VITE_SUPABASE_URL 이 없어 fallback 경로가 활성화된다.
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../authStore'
import { ROLES } from '../authConstants'
import { STORAGE_KEYS } from '@/lib/storageKeys'

// .env.local 에 실제 Supabase 자격증명이 있어도(로컬 개발용) 이 스위트는 항상
// fallback 경로를 검증해야 하므로 명시적으로 mock 한다. env 부재에 암묵적으로
// 기대면 안 됨 — src/hooks/__tests__/useAnalyticsSummary.test.jsx 와 동일 패턴.
vi.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: false,
  supabase: null,
}))

function Probe() {
  const auth = useAuth()
  return (
    <div>
      <div data-testid="loading">{auth.isLoading ? '1' : '0'}</div>
      <div data-testid="auth">{auth.isAuthenticated ? '1' : '0'}</div>
      <div data-testid="email">{auth.user?.email || ''}</div>
      <div data-testid="role">{auth.user?.role || ''}</div>
      <div data-testid="canView">{auth.hasPermission('view') ? '1' : '0'}</div>
      <div data-testid="canEdit">{auth.hasPermission('edit') ? '1' : '0'}</div>
      <div data-testid="canDelete">{auth.hasPermission('delete') ? '1' : '0'}</div>
      <div data-testid="isOperator">{auth.hasRole(ROLES.OPERATOR) ? '1' : '0'}</div>
      <div data-testid="courseAccess">{auth.canAccess('course') ? '1' : '0'}</div>
      <div data-testid="payrollAccess">{auth.canAccess('payroll') ? '1' : '0'}</div>

      <button onClick={() => auth.loginWithEmail('ops@example.com', 'x')}>LOGIN</button>
      <button onClick={() => auth.logout()}>LOGOUT</button>
    </div>
  )
}

async function renderAuth() {
  const r = render(<AuthProvider><Probe /></AuthProvider>)
  // 초기화가 queueMicrotask 로 감싸져 있으므로 loading=0 될 때까지 대기
  await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('0'))
  return r
}

describe('AuthProvider (fallback path)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('초기에는 isLoading=true → 마이크로태스크 후 false, user=null', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(screen.getByTestId('loading').textContent).toBe('1')
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('0'))
    expect(screen.getByTestId('auth').textContent).toBe('0')
  })

  it('localStorage 에 저장된 사용자가 있으면 복원한다', async () => {
    localStorage.setItem(STORAGE_KEYS.authUser, JSON.stringify({
      id: 'u1', email: 'saved@x.com', name: 'saved', role: ROLES.ADMIN,
    }))
    await renderAuth()
    expect(screen.getByTestId('auth').textContent).toBe('1')
    expect(screen.getByTestId('email').textContent).toBe('saved@x.com')
    expect(screen.getByTestId('role').textContent).toBe(ROLES.ADMIN)
  })

  it('깨진 JSON 은 조용히 무시되고 authUser 키가 제거된다', async () => {
    localStorage.setItem(STORAGE_KEYS.authUser, '{not-json')
    await renderAuth()
    expect(screen.getByTestId('auth').textContent).toBe('0')
    expect(localStorage.getItem(STORAGE_KEYS.authUser)).toBeNull()
  })

  it('loginWithEmail 은 OPERATOR 역할로 사용자 생성 + localStorage 저장', async () => {
    await renderAuth()
    await act(async () => { screen.getByText('LOGIN').click() })
    expect(screen.getByTestId('auth').textContent).toBe('1')
    expect(screen.getByTestId('email').textContent).toBe('ops@example.com')
    expect(screen.getByTestId('role').textContent).toBe(ROLES.OPERATOR)

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.authUser))
    expect(stored.email).toBe('ops@example.com')
    expect(stored.role).toBe(ROLES.OPERATOR)
    expect(stored.provider).toBe('demo')
  })

  it('logout 은 user/localStorage 를 모두 비운다', async () => {
    await renderAuth()
    await act(async () => { screen.getByText('LOGIN').click() })
    expect(screen.getByTestId('auth').textContent).toBe('1')

    await act(async () => { screen.getByText('LOGOUT').click() })
    expect(screen.getByTestId('auth').textContent).toBe('0')
    expect(localStorage.getItem(STORAGE_KEYS.authUser)).toBeNull()
  })

  it('OPERATOR 는 view 만 허용, edit/delete 는 거부된다', async () => {
    await renderAuth()
    await act(async () => { screen.getByText('LOGIN').click() })
    expect(screen.getByTestId('canView').textContent).toBe('1')
    expect(screen.getByTestId('canEdit').textContent).toBe('0')
    expect(screen.getByTestId('canDelete').textContent).toBe('0')
  })

  it('ADMIN 으로 복원되면 edit/delete 포함 모든 권한을 가진다', async () => {
    localStorage.setItem(STORAGE_KEYS.authUser, JSON.stringify({
      id: 'a1', email: 'admin@x.com', role: ROLES.ADMIN,
    }))
    await renderAuth()
    expect(screen.getByTestId('canEdit').textContent).toBe('1')
    expect(screen.getByTestId('canDelete').textContent).toBe('1')
  })

  it('로그인 전(=GUEST)에는 edit/delete false, view 는 true', async () => {
    await renderAuth()
    expect(screen.getByTestId('canView').textContent).toBe('1')
    expect(screen.getByTestId('canEdit').textContent).toBe('0')
    expect(screen.getByTestId('canDelete').textContent).toBe('0')
  })

  it('hasRole 은 단순 동등성 비교', async () => {
    await renderAuth()
    await act(async () => { screen.getByText('LOGIN').click() })
    expect(screen.getByTestId('isOperator').textContent).toBe('1')
  })

  it('canAccess — OPERATOR 는 course 접근 가능, payroll 은 차단', async () => {
    await renderAuth()
    await act(async () => { screen.getByText('LOGIN').click() })
    // MODULE_ACCESS.OPERATOR = ['course', 'operation', 'message']
    expect(screen.getByTestId('courseAccess').textContent).toBe('1')
    expect(screen.getByTestId('payrollAccess').textContent).toBe('0')
  })

  it('useAuth 를 Provider 밖에서 호출하면 에러', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/AuthProvider/)
    spy.mockRestore()
  })
})

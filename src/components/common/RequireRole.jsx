// src/components/common/RequireRole.jsx
// 라우트 가드 — 권한 없는 사용자를 로그인/403으로 리다이렉트한다.
//
// 사용 예:
//   <Route element={<RequireRole permission="edit" />}>
//     <Route path="/editor" element={<EditorPage />} />
//   </Route>
//
//   <Route element={<RequireRole permission="manage_users" fallback="/" />}>
//     <Route path="/admin/*" element={<AdminLayout />}>...</Route>
//   </Route>
//
// 주의: UI 가드일 뿐이며, 실제 데이터 접근 제어는 반드시 Supabase RLS 등 서버 정책으로
// 이중 차단해야 한다 (docs/검수보고서.md §1.1 S-3 참조).

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/store/authStore'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { VStack } from '@astryxdesign/core/VStack'
import './RequireRole.astryx.css'

export function RequireRole({ permission, role, fallback = '/' }) {
  const { isAuthenticated, isLoading, hasPermission, hasRole } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="rr-loading-shell" role="status" aria-label="권한 확인 중">
        <VStack gap={4}>
          <Skeleton width={160} height={24} />
          <Skeleton width="100%" height={16} />
          <Skeleton width="83%" height={16} />
        </VStack>
      </div>
    )
  }

  if (!isAuthenticated) {
    // 로그인이 없으므로 홈으로 보내고 드롭다운 로그인 폼을 이용하게 한다.
    return <Navigate to={fallback} replace state={{ from: location, needsLogin: true }} />
  }

  const permissionOk = permission ? hasPermission(permission) : true
  const roleOk       = role       ? hasRole(role)           : true

  if (!permissionOk || !roleOk) {
    return <Navigate to={fallback} replace state={{ from: location, forbidden: true }} />
  }

  return <Outlet />
}

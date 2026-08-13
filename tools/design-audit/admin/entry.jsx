// tools/design-audit/admin/entry.jsx
// 관리자 화면 렌더 하네스 진입점.
//
// 실제 App.jsx 와 같은 provider 를 쓰되, 라우터만 MemoryRouter 로 바꿔 원하는 경로를
// 바로 열 수 있게 한다(로그인 흐름 없이). 데이터 층은 vite alias 로 mock-supabase 가
// 대신 들어가므로, 페이지·컴포넌트 코드는 손대지 않은 그대로 렌더된다.
//
// 사용: ?route=/admin/consults&state=ok|empty|error|loading&mode=light|dark

import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import '@/index.css'
import '@/App.astryx.css'

import { ToastViewport } from '@astryxdesign/core/Toast'
import { I18nProvider } from '@/store/i18nStore'
import { AuthProvider } from '@/store/authStore'
import { SearchProvider } from '@/store/searchStore'
import AdminLayout from '@/layouts/AdminLayout'
import AdminOverviewPage from '@/pages/admin/AdminOverviewPage'
import AdminConsultsPage from '@/pages/admin/AdminConsultsPage'
import AdminJandiPage from '@/pages/admin/AdminJandiPage'
import AdminGuidesPage from '@/pages/admin/AdminGuidesPage'
import AdminFeedbackPage from '@/pages/admin/AdminFeedbackPage'

const params = new URLSearchParams(location.search)
const route = params.get('route') || '/admin/consults'
const mode = params.get('mode') || 'dark'

// ⚠️ 클래스만 미리 붙이면 안 된다(2026-08-13 감사가 잡아낸 하네스 결함).
//    useDarkMode() 가 마운트 시 localStorage 의 'ams-wiki:theme' 를 읽어 클래스를 다시 쓰기 때문에,
//    저장값이 없으면 light 로 덮어써 버린다. 그래서 ?mode=dark 로 찍은 스크린샷 50장이
//    전부 실은 라이트였다(실측: 두 모드의 카드 배경이 똑같이 rgb(255,255,255)).
//    → 진실의 원천은 저장값이다. 앱이 뜨기 전에 저장값을 먼저 심고, 클래스도 같이 맞춘다.
try { localStorage.setItem('ams-wiki:theme', mode) } catch { /* 무시 */ }
document.documentElement.classList.toggle('dark', mode === 'dark')

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false, staleTime: Infinity } },
})

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <ToastViewport position="bottomEnd" maxVisible={3}>
      <I18nProvider>
        <AuthProvider>
          <SearchProvider>
            <MemoryRouter initialEntries={[route]}>
              <Routes>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminOverviewPage />} />
                  <Route path="consults" element={<AdminConsultsPage />} />
                  <Route path="jandi" element={<AdminJandiPage />} />
                  <Route path="guides" element={<AdminGuidesPage />} />
                  <Route path="feedback" element={<AdminFeedbackPage />} />
                </Route>
              </Routes>
            </MemoryRouter>
          </SearchProvider>
        </AuthProvider>
      </I18nProvider>
    </ToastViewport>
  </QueryClientProvider>,
)

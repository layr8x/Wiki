// src/App.jsx — Astryx 디자인시스템 + React Query + Toast + 모든 Provider
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { VStack } from '@astryxdesign/core/VStack'
import { Grid } from '@astryxdesign/core/Grid'
import Layout from './components/common/AstryxAppFrame'
import './App.astryx.css'

/**
 * Suspense fallback — lazy route 로드 중 표시될 placeholder.
 * 2026-05-19 v5: 누락된 정의 보강 (이전엔 ReferenceError로 마운트 실패)
 */
function PageSkeleton() {
  return (
    <VStack gap={4} className="page-skeleton" role="status" aria-label="페이지 로딩 중">
      <Skeleton width="66%" height={36} />
      <Skeleton width="100%" height={20} />
      <Skeleton width="83%" height={20} />
      <Grid columns={{ minWidth: 200, max: 3 }} gap={3} className="page-skeleton-grid">
        <Skeleton width="100%" height={112} />
        <Skeleton width="100%" height={112} />
        <Skeleton width="100%" height={112} />
      </Grid>
    </VStack>
  )
}
// SearchOverlay: 닫힌 상태(초기값)에선 null만 렌더 — 위키 전체 가이드 데이터(GUIDES 등)를
// 끌고 다니므로 lazy 전환해 첫 진입 번들에서 제외. 단축키(Cmd+K)는 GlobalHeaderActions가
// 독립적으로 처리하므로 청크 로드 전에도 정상 동작.
const SearchOverlay = lazy(() => import('./components/search/SearchOverlay'))
import { SearchProvider } from './store/searchStore'
import { I18nProvider } from './store/i18nStore'
import { AuthProvider } from './store/authStore'
import { ToastViewport } from '@astryxdesign/core/Toast'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { RouteBoundary } from './components/common/RouteBoundary'
import { RequireRole } from './components/common/RequireRole'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'

// 코드 스플리팅 (lazy loading)
const HomePage             = lazy(() => import('./pages/HomePage'))
const GuideListPage        = lazy(() => import('./pages/GuideListPage'))
const GuidePage            = lazy(() => import('./pages/GuidePage'))
const FaqPage              = lazy(() => import('./pages/FaqPage'))
const UpdatesPage          = lazy(() => import('./pages/UpdatesPage'))
const CreateGuidePage      = lazy(() => import('./pages/CreateGuidePage'))
const EditorPage           = lazy(() => import('./pages/EditorPage'))
const FeedbackPage         = lazy(() => import('./pages/FeedbackPage'))
const ErrorPage            = lazy(() => import('./pages/ErrorPage'))
const AdminLayout          = lazy(() => import('./layouts/AdminLayout'))
const AdminOverviewPage    = lazy(() => import('./pages/admin/AdminOverviewPage'))
const AdminGuidesPage      = lazy(() => import('./pages/admin/AdminGuidesPage'))
const AdminFeedbackPage    = lazy(() => import('./pages/admin/AdminFeedbackPage'))
const AdminIntegrationPage = lazy(() => import('./pages/admin/AdminIntegrationPage'))
const AdminConsultsPage    = lazy(() => import('./pages/admin/AdminConsultsPage'))
const AdminJandiPage       = lazy(() => import('./pages/admin/AdminJandiPage'))
const ChatbotPopupPage     = lazy(() => import('./components/chatbot').then(m => ({ default: m.ChatbotPopupPage })))
const AstryxPocPage        = lazy(() => import('./pages/AstryxPocPage'))

// React Query 클라이언트
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
})

export default function App() {
  return (
    <ErrorBoundary variant="global">
      <QueryClientProvider client={queryClient}>
        <ToastViewport position="bottomEnd" maxVisible={3}>
          <I18nProvider>
            <AuthProvider>
              <SearchProvider>
                  <BrowserRouter>
                  <Routes>
                    {/* AMS 챗봇 별도 창 (/ams-chatbot) — 레이아웃 없이 창 전체. /chatbot 은 마이클래스(별개 서비스)가 사용 */}
                    <Route path="/ams-chatbot" element={
                      <Suspense fallback={<PageSkeleton />}><ChatbotPopupPage /></Suspense>
                    } />

                    {/* Astryx 마이그레이션 PoC (/astryx-poc) — 격리 검증용, 레이아웃 없음 */}
                    <Route path="/astryx-poc" element={
                      <Suspense fallback={<PageSkeleton />}><AstryxPocPage /></Suspense>
                    } />

                    {/* 새 가이드 작성 — 편집 권한 필요, 레이아웃 없이 전체 화면 */}
                    <Route element={<RequireRole permission="edit" />}>
                      <Route path="/create" element={
                        <Suspense fallback={<PageSkeleton />}>
                          <CreateGuidePage />
                        </Suspense>
                      } />
                    </Route>

                    {/* 에디터 — 편집 권한 필요, 레이아웃 없이 전체 화면 */}
                    <Route element={<RequireRole permission="edit" />}>
                      <Route path="/editor" element={
                        <RouteBoundary><EditorPage /></RouteBoundary>
                      } />
                    </Route>

                    {/* 어드민 — 관리자 권한 필요 */}
                    <Route element={<RequireRole permission="manage_users" />}>
                      <Route path="/admin" element={
                        <RouteBoundary><AdminLayout /></RouteBoundary>
                      }>
                        <Route index element={
                          <RouteBoundary><AdminOverviewPage /></RouteBoundary>
                        } />
                        <Route path="guides" element={
                          <RouteBoundary><AdminGuidesPage /></RouteBoundary>
                        } />
                        <Route path="feedback" element={
                          <RouteBoundary><AdminFeedbackPage /></RouteBoundary>
                        } />
                        <Route path="integration" element={
                          <Suspense fallback={<PageSkeleton />}><AdminIntegrationPage /></Suspense>
                        } />
                        <Route path="consults" element={
                          <RouteBoundary><AdminConsultsPage /></RouteBoundary>
                        } />
                        <Route path="jandi" element={
                          <RouteBoundary><AdminJandiPage /></RouteBoundary>
                        } />
                      </Route>
                    </Route>

                    {/* 기본 레이아웃 */}
                    <Route element={<Layout />}>
                      <Route path="/" element={
                        <RouteBoundary><HomePage /></RouteBoundary>
                      } />
                      <Route path="/guides" element={
                        <RouteBoundary><GuideListPage /></RouteBoundary>
                      } />
                      <Route path="/guides/:id" element={
                        <RouteBoundary><GuidePage /></RouteBoundary>
                      } />
                      <Route path="/modules/:moduleId" element={
                        <RouteBoundary><GuideListPage /></RouteBoundary>
                      } />
                      <Route path="/faq" element={
                        <RouteBoundary><FaqPage /></RouteBoundary>
                      } />
                      <Route path="/updates" element={
                        <RouteBoundary><UpdatesPage /></RouteBoundary>
                      } />
                      <Route path="/feedback" element={
                        <RouteBoundary><FeedbackPage /></RouteBoundary>
                      } />
                      <Route path="/404" element={
                        <RouteBoundary>
                          <ErrorPage statusCode={404} message="찾을 수 없는 페이지입니다." />
                        </RouteBoundary>
                      } />
                      <Route path="*" element={
                        <RouteBoundary>
                          <ErrorPage statusCode={404} message="찾을 수 없는 페이지입니다." />
                        </RouteBoundary>
                      } />
                    </Route>
                  </Routes>
                  <Suspense fallback={null}>
                    <SearchOverlay />
                  </Suspense>
                  </BrowserRouter>
                  <Analytics />
                  <SpeedInsights />
              </SearchProvider>
            </AuthProvider>
          </I18nProvider>
        </ToastViewport>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

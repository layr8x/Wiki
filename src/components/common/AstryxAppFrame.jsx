// src/components/common/AstryxAppFrame.jsx
// Astryx(Meta 디자인시스템) 앱 골격 — 기존 shadcn Layout(sidebar-07)을 대체.
//   - AppShell: 사이드바 + 상단바 + 모바일 서랍 + 콘텐츠 영역을 한 프레임으로 관리
//   - SideNav: 브랜드 헤더 + 메뉴/모듈/최근/관리 섹션 (SPA 라우팅 = LinkProvider)
//   - TopNav: 검색 + 테마 토글 + 사용자 메뉴
//   - 전체를 <Theme>로 감싸 앱 전역을 Astryx 토큰/모드로 통일 (다크모드는 .dark 클래스 동기화)
//   - 챗봇 통합은 기존과 동일하게 유지(ErrorBoundary + Suspense 격리)
import { Outlet, useLocation, Link as RRLink } from 'react-router-dom'
import { useMemo, useEffect, lazy, Suspense, Component } from 'react'
import {
  BookOpen, Calendar, CaretRight as ChevronRight, ClipboardText as ClipboardList,
  CreditCard, FileText, House as Home, Lifebuoy as LifeBuoy, ChatText as MessageSquare,
  PaperPlaneTilt as Send, PencilSimple as PencilLine, Gear as Settings, Sparkle as Sparkles,
  Shield, Users, MagnifyingGlass as Search, Moon, Sun,
} from '@phosphor-icons/react'

import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { LinkProvider } from '@astryxdesign/core/Link'
import { AppShell, useAppShellMobile } from '@astryxdesign/core/AppShell'
import { SideNav } from '@astryxdesign/core/SideNav'
import { TopNav } from '@astryxdesign/core/TopNav'
import { NavHeadingMenu, NavHeadingMenuItem } from '@astryxdesign/core/NavMenu'
import { Button } from '@astryxdesign/core/Button'

import '@astryxdesign/core/astryx.css'
import '@astryxdesign/theme-neutral/theme.css'

import { getModuleTree } from '@/lib/db'
import { useRecentGuides } from '@/hooks/useGuides'
import { useAuth } from '@/store/authStore'
import { useSearchStore } from '@/store/searchStore.jsx'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useAstryxMode } from '@/lib/astryxMode'
import RouterLink from './RouterLink'
import UserMenu from './UserMenu'
import './AstryxAppFrame.css'

// ─── 챗봇 feature flag (기존과 동일) ──────────────────────────────────
const CHATBOT_ENABLED = import.meta.env.VITE_CHATBOT_ENABLED !== 'false'
const Chatbot = lazy(() => import('@/components/chatbot').then(m => ({ default: m.Chatbot })))

class ChatbotErrorBoundary extends Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error('[Chatbot] 위젯 마운트 실패 — 본 앱 영향 없음:', error, info)
  }
  render() { return this.state.hasError ? null : this.props.children }
}

const ICON_MAP = { ClipboardList, BookOpen, Calendar, CreditCard, Users, MessageSquare, Settings }
const PRIMARY_NAV = [
  { title: '홈', to: '/', icon: Home },
  { title: '전체 가이드', to: '/guides', icon: FileText },
  { title: '업데이트', to: '/updates', icon: Sparkles },
  { title: 'FAQ', to: '/faq', icon: LifeBuoy },
  { title: '새 가이드 작성', to: '/editor', icon: PencilLine },
]
const SECONDARY_NAV = [
  { title: '피드백', to: '/feedback', icon: Send },
  { title: '설정', to: '/settings', icon: Settings },
]

// ─── 브랜드 마크 (기존 app-sidebar에서 이관) ──────────────────────────
function BrandWordmark(props) {
  return (
    <svg viewBox="0 0 101 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AMS Wiki" {...props}>
      <path d="M24.8254 4.31474H22.0796V27.7246H24.8254V4.31474Z" />
      <path d="M4 19.882H7.05895L11.7657 9.95085L16.4724 19.882H19.5313L11.7657 4.03938L4 19.882Z" />
      <path d="M71.7717 4.31474H68.9477V21.3393H71.7717V4.31474Z" />
      <path d="M58.7104 19.8426H55.8472V28H71.2611L72.3591 25.4787H58.7104V19.8426Z" />
      <path d="M31.8455 7.03444H38.2782V4.55248H28.9823V19.8033H38.1608L39.2587 17.241H31.8455V7.03444Z" />
      <path d="M93.6951 4.31474V10.9754H91.3409V4.39343H88.636V27.6459H91.3409V13.6164H93.6951V28H96.4V4.31474H93.6951Z" />
      <path d="M86.0469 6.9951L87.1057 4.55248H76.007V6.9951H79.7707V10.1476L75.3006 19.8033H78.0854L81.1835 13.1426L84.2816 19.8033H87.1057L82.6339 10.1476V6.9951H86.0469Z" />
      <path d="M46.2788 10.9754H43.9247V4.39343H41.2197V27.6459H43.9247V13.6164H46.2788V28H48.9838V4.31474H46.2788V10.9754Z" />
      <path d="M55.1033 10.6606C55.1033 8.05901 56.1621 6.4836 58.6337 6.4836C60.908 6.4836 62.2816 7.94262 62.2816 10.6606C62.2816 13.3787 60.9487 14.8377 58.6337 14.8377C56.3187 14.8377 55.1033 13.3393 55.1033 10.6606ZM65.1432 10.6606C65.0649 6.40492 62.2408 4 58.6321 4C54.7493 4 52.1602 6.75901 52.1602 10.6606C52.1602 15.0738 55.2974 17.3213 58.6321 17.3213C62.2017 17.3213 65.1432 14.7984 65.1432 10.6606Z" />
    </svg>
  )
}

function deriveChatbotContext(pathname) {
  if (pathname === '/' || pathname === '') return { key: 'home', label: '홈' }
  if (pathname.startsWith('/faq')) return { key: 'home', label: 'FAQ' }
  if (pathname.startsWith('/updates')) return { key: 'home', label: '기능 업데이트' }
  if (pathname.startsWith('/feedback')) return { key: 'home', label: '피드백' }
  if (pathname.startsWith('/guides/member-merge')) return { key: 'cust-merge', label: '회원 병합 가이드' }
  if (pathname.startsWith('/guides/refund')) return { key: 'bill-refund', label: '환불 가이드' }
  if (pathname.startsWith('/guides/attendance')) return { key: 'class-mgmt', label: '출결 처리 가이드' }
  if (pathname.startsWith('/guides/enrollment')) return { key: 'class-mgmt', label: '입반 처리 가이드' }
  if (pathname.startsWith('/guides/qr-trouble')) return { key: 'player', label: 'QR 출석 트러블슈팅' }
  if (pathname.startsWith('/guides/payment')) return { key: 'bill-list', label: '결제 수단 가이드' }
  if (pathname.startsWith('/guides/')) return { key: 'home', label: '가이드' }
  if (pathname === '/guides') return { key: 'home', label: '가이드 목록' }
  if (pathname.startsWith('/modules/customer')) return { key: 'cust-search', label: '고객 관리' }
  if (pathname.startsWith('/modules/billing')) return { key: 'bill-list', label: '청구/수납' }
  if (pathname.startsWith('/modules/operation')) return { key: 'class-mgmt', label: '수업운영' }
  if (pathname.startsWith('/modules/')) return { key: 'home', label: '모듈' }
  if (pathname.startsWith('/admin')) return { key: 'home', label: '관리자' }
  if (pathname.startsWith('/editor')) return { key: 'home', label: '에디터' }
  return { key: 'home', label: '홈' }
}

/* ─── 사이드바 내용 (데스크탑 + 모바일 서랍 공용) ─────────────────────── */
function SideNavContent() {
  const { canAccess, hasPermission } = useAuth()
  const { data: recentGuidesData } = useRecentGuides(5)
  const recents = recentGuidesData ?? []
  const visibleModules = getModuleTree().filter(mod => canAccess(mod.id))
  const isAdmin = hasPermission('manage_users')

  return (
    <SideNav
      className="app-sidenav"
      header={
        <RRLink to="/" aria-label="시대인재 홈" className="astryx-brand">
          <BrandWordmark className="astryx-brand-mark" />
        </RRLink>
      }
    >
      <NavHeadingMenu>
        {PRIMARY_NAV.map(item => (
          <NavHeadingMenuItem key={item.to} href={item.to} icon={<item.icon size={20} />} label={item.title} />
        ))}
      </NavHeadingMenu>

      <NavHeadingMenu>
        {visibleModules.map(mod => {
          const Icon = ICON_MAP[mod.icon] ?? FileText
          return (
            <NavHeadingMenuItem
              key={mod.id}
              href={`/modules/${mod.id}`}
              icon={<Icon size={20} />}
              label={mod.label}
              description={`가이드 ${mod.guides.length}개`}
            />
          )
        })}
      </NavHeadingMenu>

      {recents.length > 0 && (
        <NavHeadingMenu>
          {recents.map(g => (
            <NavHeadingMenuItem key={g.id} href={`/guides/${g.id}`} label={g.title} />
          ))}
        </NavHeadingMenu>
      )}

      <NavHeadingMenu>
        {isAdmin && (
          <NavHeadingMenuItem href="/admin" icon={<Shield size={20} />} label="관리자" />
        )}
        {SECONDARY_NAV.map(item => (
          <NavHeadingMenuItem key={item.to} href={item.to} icon={<item.icon size={20} />} label={item.title} />
        ))}
      </NavHeadingMenu>
    </SideNav>
  )
}

/* ─── 상단바 ─────────────────────────────────────────────────────────── */
function AstryxThemeToggle() {
  const { isDark, toggle } = useDarkMode()
  return (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      label={isDark ? '라이트 모드로' : '다크 모드로'}
      icon={isDark ? <Sun size={18} /> : <Moon size={18} />}
      onClick={toggle}
    />
  )
}

function AppTopNav() {
  const { open } = useSearchStore()
  return (
    <TopNav
      label="상단 내비게이션"
      startContent={
        <button type="button" className="astryx-search" onClick={open} aria-label="가이드 검색">
          <Search size={16} />
          <span className="astryx-search-text">가이드 검색</span>
          <span className="astryx-search-kbd"><kbd>⌘K</kbd></span>
        </button>
      }
      endContent={
        <div className="astryx-topnav-actions">
          <AstryxThemeToggle />
          <UserMenu />
        </div>
      }
    />
  )
}

// AppShell의 모바일 서랍은 라우터를 모른다 — 메뉴 항목을 눌러 페이지가 이동해도
// 서랍이 스스로 닫히지 않는다(열린 채로 새 페이지를 가림). 경로가 바뀔 때마다
// 닫아주는 역할만 하는 렌더 없는 컴포넌트. AppShell의 자식이어야
// useAppShellMobile() 컨텍스트를 읽을 수 있다.
function CloseMobileNavOnNavigate() {
  const { pathname } = useLocation()
  const { closeMobileNav } = useAppShellMobile()
  // closeMobileNav 는 AppShell 안에서 isMobileNavOpen 이 바뀔 때마다 새 참조로
  // 재생성된다 — 의존성 배열에 넣으면 "열기" 자체가 effect를 재실행시켜 곧바로
  // 다시 닫아버리는 피드백 루프가 생긴다. pathname 변경에만 반응하도록 고정.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { closeMobileNav() }, [pathname])
  return null
}

export default function AstryxAppFrame() {
  const { pathname } = useLocation()
  const mode = useAstryxMode()
  const chatbotCtx = useMemo(() => deriveChatbotContext(pathname), [pathname])
  const devMode = import.meta.env.DEV

  return (
    <Theme theme={neutralTheme} mode={mode}>
      <LinkProvider component={RouterLink}>
        <AppShell
          height="fill"
          contentPadding={0}
          sideNav={<SideNavContent />}
          topNav={<AppTopNav />}
          // mobileNav.content 를 직접 넘기면 AppShell 자체 드로어(열기/닫기 토글 연결)가
          // 통째로 비활성화되고 content 가 감싸지지 않은 채 그대로 렌더링만 됨(모바일에서
          // 햄버거를 눌러도 아무 반응 없음). content 를 넘기지 않으면 AppShell 이 위의
          // sideNav 를 재사용해 토글 가능한 드로어를 자동 구성한다.
          mobileNav={{ hasToggle: true }}
        >
          <CloseMobileNavOnNavigate />
          <div className="astryx-content">
            <Outlet />
          </div>

          {CHATBOT_ENABLED && (
            <ChatbotErrorBoundary>
              <Suspense fallback={null}>
                <Chatbot
                  contextKey={chatbotCtx.key}
                  contextLabel={chatbotCtx.label}
                  userName="명준"
                  devMode={devMode}
                  onOpenGuide={(slug) => { window.location.assign(`/guides/${slug}`) }}
                />
              </Suspense>
            </ChatbotErrorBoundary>
          )}
        </AppShell>
      </LinkProvider>
    </Theme>
  )
}

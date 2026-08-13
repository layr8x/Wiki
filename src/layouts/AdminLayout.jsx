// src/layouts/AdminLayout.jsx — 어드민 전용 레이아웃 (Astryx AppShell)
// 엔드유저 프레임(AstryxAppFrame)과 동일한 골격을 쓰되, 어드민 전용 내비게이션과
// 브레드크럼 상단바를 사용한다. 전역 <Theme>로 감싸 어드민 화면도 Astryx 토큰/모드 공유.
import { Outlet, useLocation, Link as RRLink } from 'react-router-dom'
import { useEffect } from 'react'
import {
  ChartBar as BarChart3, Tray, ChatsCircle as Chats, Headset, FileText,
  House as Home, PencilSimple as PencilLine, ArrowSquareOut as ExternalLink,
  Moon, Sun, CaretRight as ChevronRight,
} from '@phosphor-icons/react'

import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { LinkProvider } from '@astryxdesign/core/Link'
import { AppShell, useAppShellMobile } from '@astryxdesign/core/AppShell'
import { SideNav, SideNavSection, SideNavItem } from '@astryxdesign/core/SideNav'
import { TopNav } from '@astryxdesign/core/TopNav'
import { Button } from '@astryxdesign/core/Button'

import '@astryxdesign/core/astryx.css'
import '@astryxdesign/theme-neutral/theme.css'

import { useAuth } from '@/store/authStore'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useAstryxMode } from '@/lib/astryxMode'
import RouterLink from '@/components/common/RouterLink'
import '@/components/common/AstryxAppFrame.css'
import './AdminLayout.astryx.css'

const BREADCRUMB_LABEL = {
  admin: '관리자', guides: '가이드 관리', feedback: '피드백 수신함',
  consults: '카카오 상담', jandi: '잔디 대화',
}

// 3개 카테고리: 개요(현황 파악) / 콘텐츠 관리(가이드 CRUD) / 상담·대화(외부 채널 로그).
// 대시보드는 위키+카카오 지표가 섞인 전사 현황판이라 콘텐츠 관리와 분리된 별도 카테고리로 둔다.
const ADMIN_NAV_GROUPS = [
  {
    label: '개요',
    items: [
      { title: '대시보드', to: '/admin', icon: BarChart3, perm: 'view' },
    ],
  },
  {
    label: '콘텐츠 관리',
    items: [
      { title: '가이드 관리', to: '/admin/guides', icon: FileText, perm: 'edit' },
      { title: '새 가이드 작성', to: '/editor', icon: PencilLine, perm: 'edit' },
      { title: '피드백 수신함', to: '/admin/feedback', icon: Tray, perm: 'edit' },
    ],
  },
  {
    label: '상담·대화',
    items: [
      { title: '카카오 상담', to: '/admin/consults', icon: Headset, perm: 'edit' },
      { title: '잔디 대화', to: '/admin/jandi', icon: Chats, perm: 'edit' },
    ],
  },
]

function buildBreadcrumbs(pathname) {
  const segments = pathname.split('/').filter(Boolean)
  const crumbs = []
  let cumulative = ''
  segments.forEach((seg, idx) => {
    cumulative += `/${seg}`
    crumbs.push({ href: cumulative, label: BREADCRUMB_LABEL[seg] || seg, isLast: idx === segments.length - 1 })
  })
  return crumbs
}

function AdminSideNav() {
  const { hasPermission } = useAuth()
  const { pathname } = useLocation()
  const visibleGroups = ADMIN_NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => hasPermission(i.perm)) }))
    .filter(g => g.items.length > 0)

  return (
    <SideNav
      className="app-sidenav"
      header={
        <RRLink to="/admin" aria-label="AMS Wiki 관리자" className="admin-brand">
          <span className="admin-brand-icon"><BarChart3 weight="bold" size={16} /></span>
          <span className="admin-brand-text">
            <span className="admin-brand-title">관리자</span>
            <span className="admin-brand-sub">AMS Wiki</span>
          </span>
        </RRLink>
      }
      footer={
        <RRLink to="/" className="admin-exit">
          <Home size={18} />
          <span>사용자 사이트</span>
          <ExternalLink size={14} className="admin-exit-ext" />
        </RRLink>
      }
    >
      {visibleGroups.map(group => (
        <SideNavSection key={group.label} title={group.label}>
          {group.items.map(item => (
            <SideNavItem
              key={item.to}
              href={item.to}
              icon={item.icon}
              label={item.title}
              isSelected={pathname === item.to}
            />
          ))}
        </SideNavSection>
      ))}
    </SideNav>
  )
}

function AdminThemeToggle() {
  const { isDark, toggle } = useDarkMode()
  return (
    <Button isIconOnly variant="ghost" size="sm"
      label={isDark ? '라이트 모드로' : '다크 모드로'}
      icon={isDark ? <Sun size={18} /> : <Moon size={18} />}
      onClick={toggle} />
  )
}

function AdminTopNav({ crumbs }) {
  return (
    <TopNav
      label="관리자 상단 내비게이션"
      startContent={
        // 화면 읽어주는 기능이 aria-label 값을 그대로 읽는다. 화면 전체가 한국어인데 여기만 영어였다.
        <nav aria-label="현재 위치" className="admin-crumbs">
          {crumbs.map((c, i) => (
            <span key={c.href} className="admin-crumb-seg">
              {i > 0 && <ChevronRight size={12} className="admin-crumb-sep" />}
              {c.isLast
                ? <span className="admin-crumb-current">{c.label}</span>
                : <RRLink to={c.href} className="admin-crumb-link">{c.label}</RRLink>}
            </span>
          ))}
        </nav>
      }
      endContent={<div className="astryx-topnav-actions"><AdminThemeToggle /></div>}
    />
  )
}

// AppShell 모바일 서랍은 라우터를 모른다 — 메뉴 항목을 눌러 이동해도 서랍이
// 스스로 닫히지 않는다. 경로 변경 시 닫아주는 렌더 없는 컴포넌트(AppShell의
// 자식이어야 useAppShellMobile() 컨텍스트를 읽을 수 있다).
function CloseMobileNavOnNavigate() {
  const { pathname } = useLocation()
  const { closeMobileNav } = useAppShellMobile()
  // closeMobileNav 는 isMobileNavOpen 이 바뀔 때마다 새 참조로 재생성된다 —
  // 의존성 배열에 넣으면 "열기" 자체가 effect를 재실행시켜 곧바로 다시
  // 닫아버리는 피드백 루프가 생긴다. pathname 변경에만 반응하도록 고정.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { closeMobileNav() }, [pathname])
  return null
}

export default function AdminLayout() {
  const location = useLocation()
  const mode = useAstryxMode()
  const crumbs = buildBreadcrumbs(location.pathname)

  return (
    <Theme theme={neutralTheme} mode={mode}>
      <LinkProvider component={RouterLink}>
        <AppShell
          height="fill"
          contentPadding={0}
          sideNav={<AdminSideNav />}
          topNav={<AdminTopNav crumbs={crumbs} />}
          // mobileNav.content 를 직접 넘기면 AppShell 자체 드로어(열기/닫기 토글)가
          // 비활성화된다 — content 없이 두면 위 sideNav 를 재사용해 자동 구성.
          // ⚠️ hasToggle:false + <MobileNavToggle label="메뉴 열기" /> 직접 배치는 하지 말 것.
          // 좁은 폭에서 AppShell 은 자체 "모바일 바"를 그리고 TopNav 를 그 안에 다른 모드로
          // 렌더한다 — 직접 놓은 토글은 startContent 째로 사라져 햄버거가 통째로 없어진다(실측).
          // 그래서 자동 생성 버튼을 쓴다. 그 버튼의 읽어주는 이름이 "Open navigation"(영어)로
          // 고정인 건 Astryx 쪽 옵션이 없어 남는 문제다(계획서 4장 보류 항목).
          mobileNav={{ hasToggle: true }}
        >
          <CloseMobileNavOnNavigate />
          <div className="astryx-content">
            <Outlet />
          </div>
        </AppShell>
      </LinkProvider>
    </Theme>
  )
}

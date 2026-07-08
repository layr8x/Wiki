// src/components/admin-sidebar.jsx
// 어드민 전용 사이드바 — 엔드유저 사이드바(app-sidebar)와 분리 운영한다.
import * as React from "react"
import { NavLink, Link, useLocation } from "react-router-dom"
import {
  ChartBar as BarChart3,
  Tray,
  ChatsCircle as Chats,
  Headset,
  FileText,
  House as Home,
  PencilSimple as PencilLine,
  ArrowSquareOut as ExternalLink,
} from '@phosphor-icons/react'
import { useAuth } from "@/store/authStore"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { NavUser } from "@/components/nav-user"

const ADMIN_NAV_GROUPS = [
  {
    label: "관리",
    items: [
      { title: "대시보드", to: "/admin", icon: BarChart3, end: true, perm: 'view' },
      { title: "가이드 관리", to: "/admin/guides", icon: FileText, perm: 'edit' },
      { title: "새 가이드 작성", to: "/editor", icon: PencilLine, perm: 'edit' },
      { title: "피드백 수신함", to: "/admin/feedback", icon: Tray, perm: 'edit' },
    ],
  },
  {
    label: "카카오 상담",
    items: [
      { title: "상담 로그", to: "/admin/consults", icon: Headset, perm: 'edit' },
    ],
  },
  {
    label: "잔디 대화",
    items: [
      { title: "대화 로그", to: "/admin/jandi", icon: Chats, perm: 'edit' },
    ],
  },
]

export function AdminSidebar({ ...props }) {
  const location = useLocation()
  const currentPath = location.pathname
  const { user, hasPermission } = useAuth()

  const visibleGroups = ADMIN_NAV_GROUPS
    .map(group => ({ ...group, items: group.items.filter(item => hasPermission(item.perm)) }))
    .filter(group => group.items.length > 0)

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="px-3 py-3 group-data-[collapsible=icon]:px-1.5 group-data-[collapsible=icon]:py-2">
        <Link
          to="/admin"
          aria-label="AMS Wiki 관리자"
          className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80"
        >
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BarChart3 weight="bold" className="size-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">관리자</span>
            <span className="text-xs text-muted-foreground">AMS Wiki</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild tooltip={item.title} isActive={
                      item.end ? currentPath === item.to : currentPath.startsWith(item.to)
                    }>
                      <NavLink to={item.to} end={item.end}>
                        <item.icon />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild size="sm" tooltip="사용자 사이트로 이동">
                  <Link to="/">
                    <Home />
                    <span>사용자 사이트</span>
                    <ExternalLink className="ml-auto size-3.5 opacity-60" />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {user && <NavUser user={user} />}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

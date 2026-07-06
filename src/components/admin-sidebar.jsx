// src/components/admin-sidebar.jsx
// 어드민 전용 사이드바 — 엔드유저 사이드바(app-sidebar)와 분리 운영한다.
import * as React from "react"
import { NavLink, Link, useLocation } from "react-router-dom"
import {
  ChartBar as BarChart3,
  ChatText as MessageSquare,
  ChatsCircle as Chats,
  FileText,
  House as Home,
  PencilSimple as PencilLine,
  Users,
  ArrowSquareOut as ExternalLink,
  PlugsConnected,
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

const ADMIN_NAV = [
  { title: "대시보드", to: "/admin", icon: BarChart3, end: true, perm: 'view' },
  { title: "가이드 관리", to: "/admin/guides", icon: FileText, perm: 'edit' },
  { title: "새 가이드 작성", to: "/editor", icon: PencilLine, perm: 'edit' },
  { title: "피드백 수신함", to: "/admin/feedback", icon: MessageSquare, perm: 'edit' },
  { title: "카카오 상담", to: "/admin/consults", icon: MessageSquare, perm: 'edit' },
  { title: "잔디 대화", to: "/admin/jandi", icon: Chats, perm: 'edit' },
  { title: "외부 연동", to: "/admin/integration", icon: PlugsConnected, perm: 'manage_users' },
  { title: "사용자 관리", to: "/admin/users", icon: Users, perm: 'manage_users' },
]

export function AdminSidebar({ ...props }) {
  const location = useLocation()
  const currentPath = location.pathname
  const { user, hasPermission } = useAuth()

  const visibleNav = ADMIN_NAV.filter(item => hasPermission(item.perm))

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
        <SidebarGroup>
          <SidebarGroupLabel>관리</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNav.map((item) => (
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

// src/pages/HomePage.jsx
// 독자 유용성 중심 대시보드 — Astryx(Meta 디자인시스템) 표면으로 마이그레이션.
//   - 데이터 훅(react-query)·라우팅(react-router)·정보구조는 그대로 유지
//   - 시각 요소는 Astryx primitive(Card/Badge/Button/Heading/Text/VStack/HStack/Grid)로 교체
//   - AstryxThemeRegion 이 이 표면만 감싸 [data-astryx-theme] 스코프를 적용(사이드바/헤더는 shadcn 유지)
import { Link, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchDashboardStats, getModuleTree } from '@/lib/db'
import { useRecentGuides, usePopularGuides, useGuideList } from '@/hooks/useGuides'
import {
  ClipboardText as ClipboardList,
  BookOpen,
  Calendar,
  CreditCard,
  Users,
  ChatText as MessageSquare,
  Gear as Settings,
  ArrowRight,
  Clock,
  FileText,
  CaretRight as ChevronRight,
  Bell,
  ChatCircle as MessageCircle,
  PencilSimple as PencilLine,
  Eye,
} from '@phosphor-icons/react'

import AstryxThemeRegion from '@/components/common/AstryxThemeRegion'
import { VStack } from '@astryxdesign/core/VStack'
import { HStack } from '@astryxdesign/core/HStack'
import { Grid } from '@astryxdesign/core/Grid'
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'

import { useRecentlyViewed } from '@/hooks/useRecentlyViewed'
import { getGuideType } from '@/lib/guideTypes'
import './HomePage.astryx.css'

const ICON_MAP = { ClipboardList, BookOpen, Calendar, CreditCard, Users, MessageSquare, Settings }

// 모듈 → Astryx 색 패밀리(틴트칩). 기존 MODULE_TINT 색 계열 유지
const MODULE_FAMILY = {
  recruit: 'blue',
  course: 'green',
  operation: 'purple',
  billing: 'orange',
  customer: 'pink',
  message: 'cyan',
  system: 'gray',
}

// shadcn 가이드유형 variant → Astryx Badge variant (없는 값은 neutral)
const BADGE_VARIANT = {
  default: 'neutral',
  secondary: 'neutral',
  outline: 'neutral',
  new: 'info',
  success: 'success',
  destructive: 'error',
  warning: 'warning',
}
const toBadgeVariant = (v) => BADGE_VARIANT[v] ?? 'neutral'

/* 섹션 제목 — h2 + 설명 + 우측 "전체 보기" 링크 */
function SectionHead({ title, description, link, linkLabel = '전체 보기' }) {
  return (
    <div className="home-row-between home-sechead">
      <VStack gap={0.5}>
        <Heading level={3}>{title}</Heading>
        {description && <Text type="supporting">{description}</Text>}
      </VStack>
      {link && (
        <Link to={link} className="home-muted home-link-sm">
          {linkLabel}
          <ArrowRight size={14} />
        </Link>
      )}
    </div>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const { entries: recentlyViewed } = useRecentlyViewed()
  const moduleTree = getModuleTree()

  // 실제 DB 통계 — Supabase 미설정 시 mockData 기반 값이 폴백으로 반환됨 (db.js)
  const { data: stats } = useQuery({
    queryKey: ['home', 'dashboard-stats'],
    queryFn: fetchDashboardStats,
    staleTime: 5 * 60 * 1000,
  })

  const { data: recentGuidesData } = useRecentGuides(5)
  const { data: popularGuidesData } = usePopularGuides(5)
  const { data: allGuides } = useGuideList()

  const recent5 = recentGuidesData ?? []
  const popularGuides = popularGuidesData ?? []
  const totalGuides = stats?.totalGuides ?? (allGuides?.length ?? 0)

  const recentlyViewedGuides = useMemo(() => {
    if (!allGuides) return []
    const byId = new Map(allGuides.map(g => [g.id, g]))
    return recentlyViewed
      .map(e => (byId.has(e.id) ? { ...byId.get(e.id), viewedAt: e.viewedAt } : null))
      .filter(Boolean)
      .slice(0, 4)
  }, [allGuides, recentlyViewed])

  const statCards = [
    {
      label: '등록 가이드',
      value: `${(stats?.totalGuides ?? totalGuides).toLocaleString('ko-KR')}개`,
      footerTitle: '시트 Q&A + 컨플 인덱스 합산',
      footerDesc: '실장님 SSOT 25 + FVSOL 130 + AMS 1',
    },
    {
      label: '누적 조회수',
      value: stats?.totalViews != null ? stats.totalViews.toLocaleString('ko-KR') : '집계 전',
      footerTitle: stats?.helpfulRate != null ? `만족도 ${stats.helpfulRate}%` : 'Supabase 연결 후 실측',
      footerDesc: 'View/Feedback 로깅 활성화 시 표시',
    },
    {
      label: '최근 업데이트',
      value: stats?.recentDate ?? '2026-05-20',
      footerTitle: '회원상세 환불 팝업 추후 입력 기능',
      footerDesc: 'AMS · 청구·환불 (Confluence 2076704794)',
    },
  ]

  return (
    <AstryxThemeRegion>
      <div className="home-shell">
        <VStack gap={8} hAlign="stretch">

          {/* ─── 헤더 ─────────────────────────────────────────────── */}
          <div className="home-row-between home-header">
            <VStack gap={1.5}>
              <Heading level={1}>대시보드</Heading>
              <Text type="supporting">AMS 운영 가이드 통합 위키</Text>
            </VStack>
            <HStack gap={2}>
              <Button
                label="새 가이드 작성"
                variant="secondary"
                size="sm"
                icon={<PencilLine size={14} />}
                onClick={() => navigate('/editor')}
              />
              <Button
                label="전체 가이드"
                variant="primary"
                size="sm"
                endContent={<ArrowRight size={14} />}
                onClick={() => navigate('/guides')}
              />
            </HStack>
          </div>

          {/* ─── Stat Cards (3) ───────────────────────────────────── */}
          <Grid columns={{ minWidth: 240, max: 3 }} gap={4}>
            {statCards.map((s) => (
              <Card key={s.label} padding={5}>
                <VStack gap={2}>
                  <Text type="supporting">{s.label}</Text>
                  <Heading level={2}>{s.value}</Heading>
                  <VStack gap={0.5}>
                    <Text type="label" maxLines={1}>{s.footerTitle}</Text>
                    <Text type="supporting">{s.footerDesc}</Text>
                  </VStack>
                </VStack>
              </Card>
            ))}
          </Grid>

          {/* ─── 최근 본 가이드 ───────────────────────────────────── */}
          <section>
            <SectionHead
              title="최근 본 가이드"
              description="이어서 보거나 관련 가이드로 빠르게 이동하세요"
            />
            {recentlyViewedGuides.length === 0 ? (
              <div className="home-empty">
                <span className="home-empty-icon"><Clock size={18} /></span>
                <Text weight="medium">아직 열람한 가이드가 없습니다</Text>
                <Text type="supporting">
                  아래 카테고리에서 관심 있는 가이드를 열어보세요. 여기에 최근 본 항목이 쌓입니다.
                </Text>
              </div>
            ) : (
              <Grid columns={{ minWidth: 220, max: 4 }} gap={3}>
                {recentlyViewedGuides.map((g) => {
                  const tm = getGuideType(g.type)
                  return (
                    <Link key={g.id} to={`/guides/${g.id}`} className="home-link">
                      <Card className="home-card" padding={4}>
                        <VStack gap={2}>
                          <div className="home-row-between">
                            <Badge label={tm.shortLabel} variant={toBadgeVariant(tm.variant)} />
                            <Text type="supporting" hasTabularNumbers>{g.module}</Text>
                          </div>
                          <Text weight="semibold" maxLines={2}>{g.title}</Text>
                          <Text type="supporting" maxLines={2}>{g.tldr}</Text>
                        </VStack>
                      </Card>
                    </Link>
                  )
                })}
              </Grid>
            )}
          </section>

          {/* ─── 카테고리 ─────────────────────────────────────────── */}
          <section>
            <SectionHead
              title="카테고리"
              description="AMS 메뉴 구조 기준 모듈별 가이드"
              link="/guides"
            />
            <Grid columns={{ minWidth: 240, max: 4 }} gap={3}>
              {moduleTree.map((mod) => {
                const Icon = ICON_MAP[mod.icon] ?? FileText
                const family = MODULE_FAMILY[mod.id] ?? 'gray'
                return (
                  <Link key={mod.id} to={`/modules/${mod.id}`} className="home-link">
                    <Card className="home-card" padding={5}>
                      <VStack gap={3}>
                        <HStack gap={3} vAlign="center">
                          <span className="home-tint" data-family={family}><Icon size={16} /></span>
                          <div className="home-grow">
                            <Text weight="semibold">{mod.label}</Text>
                          </div>
                          <Badge label={String(mod.guides.length)} variant="neutral" />
                        </HStack>
                        <Text type="supporting" maxLines={2}>
                          {mod.guides.slice(0, 3).map(g => g.label).join(' · ')}
                        </Text>
                        <span className="home-muted home-cta">
                          가이드 열기 <ChevronRight size={12} />
                        </span>
                      </VStack>
                    </Card>
                  </Link>
                )
              })}
            </Grid>
          </section>

          {/* ─── 최근 업데이트 + 자주 찾는 가이드 2-col ──────────── */}
          <div className="home-bottom">
            {/* 최근 업데이트 */}
            <Card padding={0}>
              <div className="home-cardhead home-row-between home-alend">
                <VStack gap={1}>
                  <Heading level={3}>최근 업데이트</Heading>
                  <Text type="supporting">새로 추가되거나 수정된 가이드</Text>
                </VStack>
                <Link to="/updates" className="home-muted home-link-xs">
                  전체 보기 <ArrowRight size={12} />
                </Link>
              </div>
              <ul className="home-list">
                {recent5.map((g, idx) => {
                  const isNew = idx < 3
                  return (
                    <li key={g.id} className="home-li">
                      <Link to={`/guides/${g.id}`} className="home-listrow">
                        <Badge label={g.module} variant="neutral" />
                        <div className="home-grow">
                          <Text weight="medium" maxLines={1}>{g.title}</Text>
                        </div>
                        {isNew && <Badge label="NEW" variant="info" />}
                        <Text type="supporting" hasTabularNumbers>{g.updated_at}</Text>
                        <ChevronRight size={14} className="home-hoverfade" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Card>

            {/* 사이드: 자주 찾는 가이드 + 빠른 링크 */}
            <VStack gap={6} hAlign="stretch">
              {/* 자주 찾는 가이드 (조회수 Top 5) */}
              <Card padding={0}>
                <div className="home-cardhead">
                  <VStack gap={1}>
                    <Heading level={4}>자주 찾는 가이드</Heading>
                    <Text type="supporting">조회수 Top 5</Text>
                  </VStack>
                </div>
                <ol className="home-list">
                  {popularGuides.map((g, idx) => (
                    <li key={g.id} className="home-li">
                      <Link to={`/guides/${g.id}`} className="home-listrow compact">
                        <span className="home-muted home-rank home-tabnum">{idx + 1}</span>
                        <div className="home-grow">
                          <Text maxLines={1}>{g.title}</Text>
                        </div>
                        <span className="home-muted home-tabnum home-cta">
                          <Eye size={11} />{g.views ?? 0}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </Card>

              {/* 빠른 링크 */}
              <Card padding={0}>
                <div className="home-cardhead">
                  <Heading level={4}>빠른 링크</Heading>
                </div>
                <div className="home-quicklist">
                  {[
                    { to: '/faq', Icon: MessageCircle, label: 'FAQ', desc: '반복 문의 해결' },
                    { to: '/updates', Icon: Bell, label: '업데이트 이력', desc: '정책 및 기능 변경' },
                    { to: '/feedback', Icon: MessageSquare, label: '오류 제보', desc: '개선 요청 제출' },
                  ].map((item) => (
                    <Link key={item.to} to={item.to} className="home-quick">
                      <span className="home-muted"><item.Icon size={16} /></span>
                      <div className="home-grow">
                        <Text weight="medium">{item.label}</Text>
                        <Text type="supporting">{item.desc}</Text>
                      </div>
                      <ChevronRight size={14} className="home-muted" />
                    </Link>
                  ))}
                </div>
              </Card>
            </VStack>
          </div>

        </VStack>
      </div>
    </AstryxThemeRegion>
  )
}

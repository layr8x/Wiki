// src/pages/GuideListPage.jsx
// 가이드 목록 — Astryx(Meta 디자인시스템) 표면으로 마이그레이션.
//   - 데이터 훅(react-query)·라우팅(react-router)·필터/정렬/검색/페이지네이션 상태는 그대로 유지
//   - 시각 요소는 Astryx primitive(Card/Badge/Button/Heading/Text/VStack/HStack/Grid/Divider/TextInput)로 교체
//   - 전역 <Theme>(AstryxAppFrame)에서 토큰/모드를 상속하므로 이 페이지는 Theme/CSS 를 감싸지 않음
import { useState, useMemo, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { plainSummary } from '@/lib/plainSummary'
import {
  MagnifyingGlass as Search,
  Eye,
  ThumbsUp,
  Clock,
  FileX,
  CaretRight as ChevronRight,
} from '@phosphor-icons/react'
import { getModuleTree } from '@/lib/db'
import { useGuideList } from '@/hooks/useGuides'
import { usePagination } from '@/hooks/usePagination'
import Pagination from '@/components/common/Pagination'

import { VStack } from '@astryxdesign/core/VStack'
import { Grid } from '@astryxdesign/core/Grid'
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Divider } from '@astryxdesign/core/Divider'
import { TextInput } from '@astryxdesign/core/TextInput'

import { getGuideType, GUIDE_TYPE_FILTER } from '@/lib/guideTypes'
import './GuideListPage.astryx.css'

// 정렬 선택지.
//
// "인기순"은 조회수가 실제로 쌓였을 때만 낸다. 조회 로깅을 켜기 전에는 전 가이드가
// 0이라 이 정렬이 순서를 하나도 바꾸지 못했다. 눌러도 목록이 그대로인데 버튼은
// 눌린 상태로 남으니, 쓰는 사람은 화면이 고장 났다고 읽는다.
const SORT_BASE = [
  { value: 'updated', label: '최신순' },
  { value: 'title',   label: '제목순' },
]
const SORT_WITH_VIEWS = [
  { value: 'updated', label: '최신순' },
  { value: 'views',   label: '인기순' },
  { value: 'title',   label: '제목순' },
]

// 가이드 타입 → Astryx Badge variant (guideTypes.js 의 shadcn variant 는 색 계열 기준으로 매핑)
const TYPE_BADGE_VARIANT = {
  SOP: 'blue',
  DECISION: 'purple',
  REFERENCE: 'neutral',
  TROUBLE: 'red',
  RESPONSE: 'green',
  POLICY: 'yellow',
}
const toBadgeVariant = (typeKey) => TYPE_BADGE_VARIANT[typeKey] ?? 'neutral'

export default function GuideListPage() {
  const { moduleId } = useParams()
  const [search, setSearch]   = useState('')
  const [typeFilter, setType] = useState('ALL')
  const [sort, setSort]       = useState('updated')

  const moduleTree = getModuleTree()
  const currentModule = useMemo(
    () => moduleId ? moduleTree.find(m => m.id === moduleId) : null,
    [moduleId, moduleTree]
  )

  const { data: fetchedGuides, isLoading } = useGuideList({
    module: currentModule?.label,
  })
  const allGuides = useMemo(() => fetchedGuides ?? [], [fetchedGuides])

  // 조회수가 하나라도 쌓였을 때만 "인기순"을 낸다(위 SORT_BASE 주석 참고).
  const hasViewData = useMemo(() => allGuides.some(g => (g.views ?? 0) > 0), [allGuides])
  const sortOptions = hasViewData ? SORT_WITH_VIEWS : SORT_BASE

  // 선택값을 되돌리는 대신 실제로 쓸 값을 그때그때 계산한다. 상태를 고치려고
  // effect 에서 setSort 를 부르면 렌더가 한 번 더 돌고, 목록에 없는 값이 잠깐
  // 선택된 채로 그려진다. 파생값이면 그런 중간 상태가 아예 없다.
  const effectiveSort = !hasViewData && sort === 'views' ? 'updated' : sort

  const filtered = useMemo(() => {
    let list = allGuides
    if (typeFilter !== 'ALL') list = list.filter(g => g.type === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(g =>
        g.title?.toLowerCase().includes(q) ||
        g.tldr?.toLowerCase().includes(q) ||
        g.module?.toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      if (effectiveSort === 'views') return (b.views ?? 0) - (a.views ?? 0)
      if (effectiveSort === 'title') return a.title.localeCompare(b.title, 'ko')
      return (b.updated ?? '').localeCompare(a.updated ?? '')
    })
    return list
  }, [allGuides, typeFilter, search, effectiveSort])

  const pagination = usePagination(filtered, 24) // 3-col × 8행
  useEffect(() => { pagination.reset() }, [typeFilter, search, sort, moduleId]) // eslint-disable-line react-hooks/exhaustive-deps

  const breadcrumbs = [
    { label: '홈', to: '/' },
    { label: '가이드', to: '/guides' },
    ...(currentModule ? [{ label: currentModule.label }] : []),
  ]

  return (
    <div className="gl-shell">
      <VStack gap={6} hAlign="stretch">

        {/* ─── 헤더 ─────────────────────────────────────────────── */}
        <header>
          <nav aria-label="Breadcrumb" className="gl-crumbs">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="gl-crumb">
                {i > 0 && <ChevronRight size={12} className="gl-crumb-sep" />}
                {b.to ? (
                  <Link to={b.to} className="gl-crumb-link">{b.label}</Link>
                ) : (
                  <span className="gl-crumb-current">{b.label}</span>
                )}
              </span>
            ))}
          </nav>
          <VStack gap={1.5}>
            <Heading level={1}>{currentModule ? currentModule.label : '전체 가이드'}</Heading>
            <Text type="supporting">
              {currentModule
                ? `${currentModule.label} 관련 ${filtered.length}개 가이드`
                : `AMS 운영 가이드 전체 ${allGuides.length}개`}
            </Text>
          </VStack>
        </header>

        {/* ─── 툴바: 검색 + 정렬 + 필터 ─────────────────────────── */}
        <VStack gap={3} hAlign="stretch">
          <div className="gl-toolbar-row">
            <div className="gl-search">
              <TextInput
                label="가이드 검색"
                isLabelHidden
                placeholder="가이드 제목, 요약, 모듈로 검색..."
                value={search}
                onChange={(v) => setSearch(v)}
                startIcon={<Search size={16} />}
                hasClear
                width="100%"
              />
            </div>
            <div className="gl-seg" role="group" aria-label="정렬">
              {sortOptions.map(o => (
                <Button
                  key={o.value}
                  label={o.label}
                  size="sm"
                  variant={effectiveSort === o.value ? 'primary' : 'ghost'}
                  onClick={() => setSort(o.value)}
                />
              ))}
            </div>
          </div>
          <div className="gl-chips" role="group" aria-label="가이드 유형 필터">
            {GUIDE_TYPE_FILTER.map(f => (
              <Button
                key={f.value}
                label={f.label}
                size="sm"
                variant={typeFilter === f.value ? 'primary' : 'secondary'}
                onClick={() => setType(f.value)}
              />
            ))}
          </div>
        </VStack>

        <Divider />

        {/* ─── 결과 ─────────────────────────────────────────────── */}
        {isLoading ? (
          <Grid columns={{ minWidth: 280, max: 3 }} gap={4}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`g-sk-${i}`} className="gl-skel" />
            ))}
          </Grid>
        ) : filtered.length === 0 ? (
          <div className="gl-empty">
            <span className="gl-empty-icon"><FileX size={18} /></span>
            <Text weight="medium">검색 결과가 없습니다</Text>
            <Text type="supporting">다른 키워드로 검색하거나 필터를 초기화해 보세요.</Text>
            <div className="gl-empty-action">
              <Button
                label="필터 초기화"
                variant="secondary"
                size="sm"
                onClick={() => { setSearch(''); setType('ALL') }}
              />
            </div>
          </div>
        ) : (
          <Grid columns={{ minWidth: 280, max: 3 }} gap={4}>
            {pagination.currentItems.map(g => {
              const typeMeta = getGuideType(g.type)
              return (
                <Link key={g.id} to={`/guides/${g.id}`} className="gl-link">
                  <Card className="gl-card" padding={0}>
                    <div className="gl-card-head">
                      <div className="gl-row-between">
                        <Badge label={typeMeta.shortLabel} variant={toBadgeVariant(g.type)} />
                        <Text type="supporting" hasTabularNumbers>{g.module}</Text>
                      </div>
                      <Text className="gl-title" weight="semibold" maxLines={2}>{g.title}</Text>
                    </div>
                    <div className="gl-card-body">
                      <Text type="supporting" maxLines={3}>{plainSummary(g.tldr)}</Text>
                    </div>
                    <div className="gl-card-foot">
                      {/* 0 은 내보내지 않는다. 조건이 `!= null` 이라 조회 로깅을 켜기 전에도
                          카드마다 "조회 0 · 좋아요 0" 이 붙었다. 35장이면 70개가 화면에
                          깔리는데 전부 같은 값이라 아무 구분도 못 한다. 지식베이스 목록
                          사례(Veeam)도 제목·요약·날짜·유형만 싣고 참여 지표는 없었다. */}
                      <div className="gl-metas">
                        {g.views > 0 && (
                          <span className="gl-meta"><Eye size={11} />{g.views}</span>
                        )}
                        {g.helpful > 0 && (
                          <span className="gl-meta"><ThumbsUp size={11} />{g.helpful}</span>
                        )}
                      </div>
                      {g.updated && (
                        <span className="gl-meta"><Clock size={11} />{g.updated}</span>
                      )}
                    </div>
                  </Card>
                </Link>
              )
            })}
          </Grid>
        )}

        {!isLoading && filtered.length > 0 && pagination.totalPages > 1 && (
          <div>
            <Pagination pagination={pagination} />
          </div>
        )}

      </VStack>
    </div>
  )
}

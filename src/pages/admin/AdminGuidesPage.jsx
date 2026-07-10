// src/pages/admin/AdminGuidesPage.jsx — /admin/guides
// 가이드 관리(어드민) — Astryx(Meta 디자인시스템) 표면으로 마이그레이션.
//   - 데이터 훅(react-query)·라우팅·상태 탭/모듈 필터/검색/페이지네이션·행 액션(편집/발행/보관 등)은 100% 유지
//   - 시각 요소만 Astryx primitive(Card/Badge/Button/Heading/Text/VStack/HStack/Selector/Table)로 교체
//   - 전역 <Theme>(AdminLayout)에서 토큰/모드를 상속하므로 이 페이지는 Theme/astryx.css 를 감싸지 않음
//   - 표현 못하는 레이아웃(툴바·세그먼트·hover·스켈레톤)은 co-located CSS(토큰 only)
//   - 유지한 shadcn: 삭제 확인 Dialog(교체 리스크 회피)
import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MagnifyingGlass as Search,
  PencilSimple as Pencil,
  PaperPlaneTilt,
  EyeSlash,
  ArrowCounterClockwise,
  Archive,
} from '@phosphor-icons/react'
import { fetchAdminGuides, updateGuideStatus, deleteGuide, getModuleTree } from '@/lib/db'
import { GUIDE_TYPES } from '@/lib/guideTypes'

import { VStack } from '@astryxdesign/core/VStack'
import { HStack } from '@astryxdesign/core/HStack'
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Table, useTablePagination, paginateData, proportional, pixel } from '@astryxdesign/core/Table'

// 유지한 shadcn: 삭제 확인 Dialog
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/store/authStore'
import './AdminGuidesPage.astryx.css'

const STATUS_TABS = [
  { value: 'all',       label: '전체' },
  { value: 'published', label: '발행됨' },
  { value: 'draft',     label: '임시저장' },
  { value: 'archived',  label: '보관됨' },
]

// 상태 → Astryx Badge variant (발행=success, 임시저장=warning, 보관=neutral)
const STATUS_BADGE_VARIANT = {
  published: 'success',
  draft:     'warning',
  archived:  'neutral',
}

const STATUS_LABEL = {
  published: '발행',
  draft:     '임시저장',
  archived:  '보관',
}

// 가이드 타입 → Astryx Badge variant (색 계열 기준 매핑)
const TYPE_BADGE_VARIANT = {
  SOP: 'blue',
  DECISION: 'purple',
  REFERENCE: 'neutral',
  TROUBLE: 'red',
  RESPONSE: 'green',
  POLICY: 'yellow',
}
const toTypeVariant = (typeKey) => TYPE_BADGE_VARIANT[typeKey] ?? 'neutral'
const typeLabel = (typeKey) => GUIDE_TYPES[typeKey]?.shortLabel ?? typeKey

const PAGE_SIZE = 25

export default function AdminGuidesPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { hasPermission } = useAuth()
  const moduleTree = getModuleTree()
  const moduleLabelById = useMemo(
    () => new Map(moduleTree.map(m => [m.id, m.label])),
    [moduleTree]
  )
  const moduleOptions = useMemo(
    () => [{ value: 'all', label: '전체 모듈' }, ...moduleTree.map(m => ({ value: m.id, label: m.label }))],
    [moduleTree]
  )

  const [status, setStatus]   = useState('all')
  const [moduleF, setModuleF] = useState('all')
  const [search, setSearch]   = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [page, setPage] = useState(1)

  const { data: guides = [], isLoading } = useQuery({
    queryKey: ['admin', 'guides', { status, moduleF, search }],
    queryFn:  () => fetchAdminGuides({
      status,
      module: moduleF === 'all' ? undefined : moduleF,
      search: search.trim() || undefined,
    }),
    staleTime: 30 * 1000,
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, nextStatus }) => updateGuideStatus(id, nextStatus),
    onSuccess: (_, { nextStatus }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'guides'] })
      qc.invalidateQueries({ queryKey: ['guides'] })
      toast({ title: `가이드 상태가 "${STATUS_LABEL[nextStatus]}"(으)로 변경되었습니다.` })
    },
    onError: (err) => toast({ variant: 'destructive', title: '상태 변경 실패', description: String(err?.message || err) }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteGuide(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'guides'] })
      qc.invalidateQueries({ queryKey: ['guides'] })
      toast({ title: '가이드가 보관 처리되었습니다.' })
      setDeleteTarget(null)
    },
    onError: (err) => toast({ variant: 'destructive', title: '삭제 실패', description: String(err?.message || err) }),
  })

  const canEdit    = hasPermission('edit')
  const canPublish = hasPermission('publish')
  const canDelete  = hasPermission('delete')

  const stats = useMemo(() => {
    const by = { all: guides.length, published: 0, draft: 0, archived: 0 }
    for (const g of guides) by[g.status] = (by[g.status] || 0) + 1
    return by
  }, [guides])

  // 필터 변경 시 1페이지로 리셋 — 결과가 줄었는데 빈 페이지를 보여주는 것 방지
  useEffect(() => { setPage(1) }, [status, moduleF, search])

  const paginationPlugin = useTablePagination({
    page,
    onPageChange: setPage,
    totalItems: guides.length,
    pageSize: PAGE_SIZE,
  })
  const pageItems = useMemo(() => paginateData(guides, page, PAGE_SIZE), [guides, page])

  const columns = useMemo(() => [
    {
      key: 'title',
      header: '제목',
      width: proportional(3),
      renderCell: (g) => (
        <VStack gap={0.5}>
          <Link to={`/guides/${g.id}`} className="ag-title">{g.title}</Link>
          <Text type="supporting" maxLines={1} className="ag-tldr">{g.tldr}</Text>
        </VStack>
      ),
    },
    {
      key: 'module',
      header: '모듈',
      width: proportional(1.5),
      renderCell: (g) => <Text>{moduleLabelById.get(g.module) || g.module}</Text>,
    },
    {
      key: 'type',
      header: '타입',
      width: proportional(1),
      renderCell: (g) => <Badge label={typeLabel(g.type)} variant={toTypeVariant(g.type)} />,
    },
    {
      key: 'status',
      header: '상태',
      width: proportional(1),
      renderCell: (g) => (
        <Badge
          label={STATUS_LABEL[g.status] || g.status}
          variant={STATUS_BADGE_VARIANT[g.status] ?? 'neutral'}
        />
      ),
    },
    {
      key: 'updated',
      header: '수정일',
      width: pixel(110),
      renderCell: (g) => (
        <Text type="supporting" hasTabularNumbers>
          {g.updated || g.updated_at?.slice(0, 10) || '—'}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: '액션',
      width: pixel(168),
      align: 'end',
      renderCell: (g) => (
        <HStack gap={1} vAlign="center" hAlign="end">
          {canEdit && (
            <Button
              isIconOnly size="sm" variant="ghost"
              label="편집"
              icon={<Pencil size={16} />}
              onClick={() => navigate(`/editor?id=${g.id}`)}
            />
          )}
          {canPublish && g.status !== 'published' && g.status !== 'archived' && (
            <Button
              isIconOnly size="sm" variant="ghost"
              label="발행하기"
              icon={<PaperPlaneTilt size={16} />}
              onClick={() => statusMutation.mutate({ id: g.id, nextStatus: 'published' })}
            />
          )}
          {canPublish && g.status === 'published' && (
            <Button
              isIconOnly size="sm" variant="ghost"
              label="발행 해제"
              icon={<EyeSlash size={16} />}
              onClick={() => statusMutation.mutate({ id: g.id, nextStatus: 'draft' })}
            />
          )}
          {/* 보관 상태 → 복원 (임시저장으로 되돌림) */}
          {canEdit && g.status === 'archived' && (
            <Button
              isIconOnly size="sm" variant="ghost"
              label="복원 (임시저장으로)"
              icon={<ArrowCounterClockwise size={16} />}
              onClick={() => statusMutation.mutate({ id: g.id, nextStatus: 'draft' })}
            />
          )}
          {/* 보관 상태 → 바로 재발행 */}
          {canPublish && g.status === 'archived' && (
            <Button
              isIconOnly size="sm" variant="ghost"
              label="바로 재발행"
              icon={<PaperPlaneTilt size={16} />}
              onClick={() => statusMutation.mutate({ id: g.id, nextStatus: 'published' })}
            />
          )}
          {canDelete && g.status !== 'archived' && (
            <Button
              isIconOnly size="sm" variant="destructive"
              label="보관함으로 이동"
              icon={<Archive size={16} />}
              onClick={() => setDeleteTarget(g)}
            />
          )}
        </HStack>
      ),
    },
  ], [moduleLabelById, canEdit, canPublish, canDelete, navigate, statusMutation])

  return (
    <div className="ag-shell">
      <VStack gap={6} hAlign="stretch">

        {/* ─── 헤더 ─────────────────────────────────────────────── */}
        <header className="ag-header">
          <VStack gap={1.5}>
            <Heading level={1}>가이드 관리</Heading>
            <Text type="supporting">
              {stats.all.toLocaleString('ko-KR')}개의 가이드가 관리 범위에 있습니다.
            </Text>
          </VStack>
          <Button label="새 가이드 작성" onClick={() => navigate('/editor')} />
        </header>

        {/* ─── 카드: 툴바 + 테이블 ───────────────────────────────── */}
        <Card className="ag-card" padding={0}>
          {/* 툴바: 상태 세그먼트 + 모듈 필터 + 검색 */}
          <div className="ag-toolbar">
            <div className="ag-seg" role="group" aria-label="상태 필터">
              {STATUS_TABS.map((t) => (
                <Button
                  key={t.value}
                  label={t.label}
                  size="sm"
                  variant={status === t.value ? 'primary' : 'ghost'}
                  onClick={() => setStatus(t.value)}
                />
              ))}
            </div>

            <div className="ag-module">
              <Selector
                label="모듈 필터"
                isLabelHidden
                options={moduleOptions}
                value={moduleF}
                onChange={setModuleF}
                size="sm"
              />
            </div>

            <div className="ag-search">
              <TextInput
                label="가이드 검색"
                isLabelHidden
                placeholder="제목/TL;DR 검색"
                value={search}
                onChange={(v) => setSearch(v)}
                startIcon={<Search size={16} />}
                hasClear
                width="100%"
              />
            </div>
          </div>

          {/* 테이블 */}
          {isLoading ? (
            <div className="ag-skel-wrap">
              <VStack gap={3}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={`ag-sk-${i}`} width="100%" height={40} index={i} />
                ))}
              </VStack>
            </div>
          ) : guides.length === 0 ? (
            <div className="ag-empty-cell">
              <Text type="supporting">조건에 해당하는 가이드가 없습니다.</Text>
            </div>
          ) : (
            <Table
              data={pageItems}
              columns={columns}
              idKey="id"
              hasHover
              plugins={{ pagination: paginationPlugin }}
            />
          )}
        </Card>

      </VStack>

      {/* 삭제(보관) 확인 — shadcn Dialog 유지 (교체 리스크 회피) */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>가이드를 보관하시겠습니까?</DialogTitle>
            <DialogDescription>
              "{deleteTarget?.title}" 가이드는 보관함으로 이동하며, 사용자 사이트에서는 더 이상 노출되지 않습니다.
              이 작업은 언제든 되돌릴 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button label="취소" variant="secondary" onClick={() => setDeleteTarget(null)} />
            <Button
              label={deleteMutation.isPending ? '처리 중…' : '보관'}
              variant="destructive"
              isDisabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

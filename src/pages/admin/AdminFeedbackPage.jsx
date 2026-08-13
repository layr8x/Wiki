// src/pages/admin/AdminFeedbackPage.jsx — /admin/feedback
// 로컬 큐(NoResultFallback 등) + Supabase guide_feedback 머지 뷰
//   - 데이터 훅(react-query)·라우팅(react-router)·탭 필터·로컬 큐 비우기 액션은 그대로 유지
//   - 시각 요소는 Astryx primitive(VStack/HStack/Card/Badge/Button/Heading/Text/Table)로 교체
//   - 전역 <Theme>(AdminLayout)에서 토큰/모드를 상속하므로 이 페이지는 Theme/CSS 를 감싸지 않음
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trash, ArrowsClockwise as RefreshIcon } from '@phosphor-icons/react'

import { fetchAdminFeedback } from '@/lib/db'
import { useToast } from '@astryxdesign/core/Toast'
import { QueryError, QueryEmpty } from '@/components/admin/QueryStates'
import { STORAGE_KEYS } from '@/lib/storageKeys'

import { VStack } from '@astryxdesign/core/VStack'
import { HStack } from '@astryxdesign/core/HStack'
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Table, useTablePagination, paginateData, proportional, pixel } from '@astryxdesign/core/Table'

import './AdminFeedbackPage.astryx.css'

const FEEDBACK_QUEUE_KEY = STORAGE_KEYS.feedbackQueue
const PAGE_SIZE = 25

// 라벨/색/탭 필터의 키는 실제로 저장되는 vote 값과 정확히 일치해야 한다.
//   /feedback 폼(FeedbackPage) → error·missing·improvement·other
//   가이드 상세 투표(GuidePage) → helpful·needs_improvement
//   검색 실패 로컬 큐(NoResultFallback) → missing-guide(kind)
// (이전 버전은 not-helpful·bug·praise 같은 저장되지 않는 값을 가정해 "오류/개선" 탭이 항상
//  비고, 유형 뱃지가 영어 원문으로 표시되며, 오류·개선 제보가 "가이드 요청" 탭으로 오분류됐다.)
const KIND_LABEL = {
  'missing-guide':     '가이드 요청',
  'missing':           '내용 추가 요청',
  'other':             '기타 문의',
  'helpful':           '도움됨',
  'needs_improvement': '개선 필요',
  'error':             '오류 제보',
  'improvement':       '개선 제안',
}

// 피드백 유형 → Astryx Badge variant (색 계열 기준)
//   오류 제보 → error(red) · 개선 필요/개선 제안 → purple · 요청류 → blue · 도움됨 → success · 기타 → neutral
const KIND_BADGE_VARIANT = {
  'missing-guide':     'blue',
  'missing':           'blue',
  'other':             'neutral',
  'helpful':           'success',
  'needs_improvement': 'purple',
  'error':             'error',
  'improvement':       'purple',
}
const toKindVariant = (kind) => KIND_BADGE_VARIANT[kind] ?? 'neutral'

const TABS = [
  { value: 'all',      label: '전체' },
  { value: 'requests', label: '가이드 요청' },
  { value: 'issues',   label: '오류/개선' },
  { value: 'praise',   label: '칭찬' },
]

function readLocalQueue() {
  try {
    const raw = localStorage.getItem(FEEDBACK_QUEUE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return []
    return arr.map((entry, i) => ({
      id:        `local-${i}-${entry.createdAt || ''}`,
      source:    'local',
      kind:      entry.kind,
      query:     entry.query,
      note:      entry.note,
      guideId:   entry.guideId,
      createdAt: entry.createdAt,
    }))
  } catch {
    return []
  }
}

export default function AdminFeedbackPage() {
  const toast = useToast()
  const [tab, setTab] = useState('all')
  const [localItems, setLocalItems] = useState(() => readLocalQueue())
  const [page, setPage] = useState(1)
  // 탭이 바뀌면 1페이지로 리셋 — useEffect 대신 렌더 중 상태 조정(react.dev 권장 패턴)으로
  // 처리해 "탭 변경 렌더" 다음에 "리셋 렌더"가 한 번 더 도는 캐스케이딩 렌더를 없앤다.
  const [prevTab, setPrevTab] = useState(tab)
  if (tab !== prevTab) {
    setPrevTab(tab)
    setPage(1)
  }

  const { data: remote = [], isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['admin', 'feedback'],
    queryFn:  () => fetchAdminFeedback({ limit: 200 }),
    staleTime: 60 * 1000,
  })

  // 다른 탭/창에서 로컬 큐가 변경되면 동기화
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === FEEDBACK_QUEUE_KEY) setLocalItems(readLocalQueue())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const clearLocal = () => {
    localStorage.removeItem(FEEDBACK_QUEUE_KEY)
    setLocalItems([])
    toast({ body: '로컬 큐를 비웠습니다. — 서버에 저장된 피드백은 영향을 받지 않습니다.' })
  }

  // 통합 뷰: 로컬 → 원격 순
  const merged = useMemo(() => [
    ...localItems.map(l => ({ ...l, kind: l.kind || 'missing-guide' })),
    ...remote.map(r => ({
      id:        r.id,
      source:    'supabase',
      kind:      r.vote,
      note:      r.comment,
      guideId:   r.guideId,
      createdAt: r.createdAt,
    })),
  ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
  [localItems, remote])

  // 탭 필터도 실제 vote 값 기준(위 KIND_LABEL 주석 참고). 7종이 빠짐없이 한 탭에는 속하게 한다.
  const filtered = useMemo(() => tab === 'all'
    ? merged
    : merged.filter(item => {
        if (tab === 'requests') return ['missing-guide', 'missing', 'other'].includes(item.kind)
        if (tab === 'issues')   return ['error', 'improvement', 'needs_improvement'].includes(item.kind)
        if (tab === 'praise')   return item.kind === 'helpful'
        return true
      }),
  [tab, merged])

  const paginationPlugin = useTablePagination({
    page,
    onPageChange: setPage,
    totalItems: filtered.length,
    pageSize: PAGE_SIZE,
  })
  const pageItems = useMemo(() => paginateData(filtered, page, PAGE_SIZE), [filtered, page])

  const showSkeleton = isLoading && remote.length === 0

  const columns = useMemo(() => [
    {
      key: 'kind',
      header: '유형',
      width: pixel(120),
      renderCell: (item) => (
        <Badge label={KIND_LABEL[item.kind] || item.kind || '기타'} variant={toKindVariant(item.kind)} />
      ),
    },
    {
      key: 'content',
      header: '내용',
      width: proportional(3),
      renderCell: (item) => (
        <VStack gap={0.5}>
          {item.query && (
            <Text type="supporting">검색어: &ldquo;{item.query}&rdquo;</Text>
          )}
          <Text maxLines={2}>{item.note || '내용 없음'}</Text>
        </VStack>
      ),
    },
    {
      key: 'guideId',
      header: '가이드',
      width: pixel(120),
      renderCell: (item) => (
        item.guideId ? (
          <Link to={`/guides/${item.guideId}`} className="af-guide-link">{item.guideId}</Link>
        ) : (
          <span className="af-dash">—</span>
        )
      ),
    },
    {
      key: 'source',
      header: '출처',
      width: pixel(100),
      renderCell: (item) => (
        <Badge label={item.source === 'local' ? '로컬' : '서버'} variant="neutral" />
      ),
    },
    {
      key: 'createdAt',
      header: '일시',
      width: pixel(150),
      renderCell: (item) => (
        <Text type="supporting" hasTabularNumbers>
          {item.createdAt?.slice(0, 16).replace('T', ' ') || '—'}
        </Text>
      ),
    },
  ], [])

  return (
    <div className="af-shell">
      <VStack gap={6} hAlign="stretch">

        {/* ─── 헤더 ─────────────────────────────────────────────── */}
        <div className="af-row-between af-header">
          <VStack gap={1.5}>
            <Heading level={1}>피드백 수신함</Heading>
            <Text type="supporting">
              {/* 로딩·실패일 때 "서버 0건"이라고 단언하지 않는다. */}
              이 브라우저에 임시 저장 {localItems.length}건 · 서버{' '}
              {isLoading ? '불러오는 중…' : isError ? '확인 필요' : `${remote.length}건`}
            </Text>
          </VStack>
          {/* 상담·잔디 화면과 같은 배치: 마지막 갱신 시각 + 새로고침.
              언제 기준 숫자인지 안 보이면, 멈춘 화면을 최신으로 착각한다. */}
          <HStack gap={2} vAlign="center">
            {dataUpdatedAt > 0 && !isError && (
              <Text type="supporting" hasTabularNumbers>
                마지막 갱신 {new Date(dataUpdatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
            <Button
              label="새로고침"
              variant="secondary"
              size="sm"
              icon={<RefreshIcon size={16} />}
              onClick={() => refetch()}
              isDisabled={isLoading}
            />
            {localItems.length > 0 && (
              <Button
                label="이 브라우저 임시 저장 비우기"
                variant="secondary"
                size="sm"
                icon={<Trash size={14} />}
                onClick={clearLocal}
              />
            )}
          </HStack>
        </div>

        {/* ─── 유형 필터(세그먼트) ───────────────────────────────── */}
        <div className="af-seg" role="group" aria-label="피드백 유형 필터">
          {TABS.map(t => (
            <Button
              key={t.value}
              label={t.label}
              size="sm"
              variant={tab === t.value ? 'primary' : 'ghost'}
              onClick={() => setTab(t.value)}
            />
          ))}
        </div>

        {/* ─── 결과 ─────────────────────────────────────────────── */}
        {showSkeleton ? (
          <Card padding={0}>
            <div className="af-skel-wrap">
              <VStack gap={3}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={`af-sk-${i}`} width="100%" height={20} index={i} />
                ))}
              </VStack>
            </div>
          </Card>
        ) : isError ? (
          <QueryError label="피드백 목록" error={error} onRetry={refetch} />
        ) : filtered.length === 0 ? (
          <QueryEmpty
            title="접수된 피드백이 없습니다"
            description={tab === 'all'
              ? '사용자가 남긴 피드백이 접수되면 이곳에 유형별로 쌓입니다.'
              : '고른 유형에 해당하는 피드백이 없습니다.'}
            actions={tab !== 'all' ? <Button label="전체 보기" variant="secondary" size="sm" onClick={() => setTab('all')} /> : undefined}
          />
        ) : (
          <Card padding={0}>
            <Table
              data={pageItems}
              columns={columns}
              idKey="id"
              hasHover
              plugins={{ pagination: paginationPlugin }}
            />
          </Card>
        )}

      </VStack>
    </div>
  )
}

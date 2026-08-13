// src/pages/admin/AdminFeedbackPage.jsx — /admin/feedback
// 로컬 큐(NoResultFallback 등) + Supabase guide_feedback 머지 뷰
//   - 데이터 훅(react-query)·라우팅(react-router)·탭 필터·로컬 큐 비우기 액션은 그대로 유지
//   - 시각 요소는 Astryx primitive(VStack/HStack/Card/Badge/Button/Heading/Text/Table)로 교체
//   - 전역 <Theme>(AdminLayout)에서 토큰/모드를 상속하므로 이 페이지는 Theme/CSS 를 감싸지 않음
import { useEffect, useMemo, useState } from 'react'
import { Link as RRLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trash, ArrowsClockwise as RefreshIcon } from '@phosphor-icons/react'

import { fetchAdminFeedback } from '@/lib/db'
import { useToast } from '@astryxdesign/core/Toast'
import { QueryError, QueryEmpty } from '@/components/admin/QueryStates'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { useIsMobile } from '@/hooks/use-mobile'

import { VStack } from '@astryxdesign/core/VStack'
import { HStack } from '@astryxdesign/core/HStack'
import { Link } from '@astryxdesign/core/Link'
import { Dialog } from '@astryxdesign/core/Dialog'
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Table, useTablePagination, paginateData, proportional, pixel } from '@astryxdesign/core/Table'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'

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

// 피드백 본문 저장 포맷은 `[유형] 제목\n\n본문` 이다(FeedbackPage.jsx 68행).
// ⚠️ **저장 포맷은 건드리지 않는다**(과거 데이터 호환). 보여줄 때만 접두를 떼고 제목/본문을 나눈다.
// 접두를 떼는 이유: 바로 옆 칸에 같은 뜻의 유형 배지가 이미 있어 두 번 읽게 된다.
function parseNote(note) {
  const stripped = String(note || '').replace(/^\[[^\]]+\]\s*/, '').trim()
  const [head, ...rest] = stripped.split('\n\n')
  return { title: (head || '').trim(), body: rest.join('\n\n').trim(), full: stripped }
}

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
  const isMobile = useIsMobile()
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
  // 판정을 한 곳에 모아 두면 목록과 탭 옆 건수가 어긋날 일이 없다.
  const inTab = (item, t) => {
    if (t === 'all')      return true
    if (t === 'requests') return ['missing-guide', 'missing', 'other'].includes(item.kind)
    if (t === 'issues')   return ['error', 'improvement', 'needs_improvement'].includes(item.kind)
    if (t === 'praise')   return item.kind === 'helpful'
    return true
  }
  const filtered = useMemo(() => merged.filter((item) => inTab(item, tab)), [tab, merged])

  // 탭 옆 건수 — 이미 받아 둔 목록을 한 번 세면 되므로 추가 조회가 없다.
  const tabCounts = useMemo(() => {
    const by = {}
    for (const t of TABS) by[t.value] = merged.filter((item) => inTab(item, t.value)).length
    return by
  }, [merged])

  const paginationPlugin = useTablePagination({
    page,
    onPageChange: setPage,
    totalItems: filtered.length,
    pageSize: PAGE_SIZE,
  })
  const pageItems = useMemo(() => paginateData(filtered, page, PAGE_SIZE), [filtered, page])

  const showSkeleton = isLoading && remote.length === 0
  const [detailItem, setDetailItem] = useState(null)

  // 390px 에서 표의 43%(264px)가 화면 밖이었고 가로 스크롤 신호도 없었다(스크롤바 두께 0px).
  // 고정 열을 붙여 봐야 610px 를 밀어야 해서 소용이 없다 → **좁은 폭에서는 열 자체를 줄인다.**
  // 일시·가이드는 내용 칸 안의 보조 줄로 합치고, 전문은 "자세히"로 연다.
  const columns = useMemo(() => {
    const kind = {
      key: 'kind',
      header: '유형',
      width: isMobile ? pixel(96) : pixel(120),
      renderCell: (item) => (
        <Badge label={KIND_LABEL[item.kind] || item.kind || '기타'} variant={toKindVariant(item.kind)} />
      ),
    }
    const content = {
      key: 'content',
      header: '내용',
      width: proportional(3),
      renderCell: (item) => {
        const { title, body } = parseNote(item.note)
        return (
          <VStack gap={0.5}>
            {item.query && <Text type="supporting">검색어: &ldquo;{item.query}&rdquo;</Text>}
            <Text maxLines={2}>{title || '내용 없음'}</Text>
            {!isMobile && body && <Text type="supporting" maxLines={1}>{body}</Text>}
            {isMobile && (
              <Text type="supporting" hasTabularNumbers>
                {item.createdAt?.slice(0, 16).replace('T', ' ') || '—'}
                {item.guideId ? ` · ${item.guideId}` : ''}
              </Text>
            )}
          </VStack>
        )
      },
    }
    const guide = {
      key: 'guideId',
      header: '가이드',
      width: pixel(140),
      renderCell: (item) => (
        item.guideId
          // 예전에는 16x16 짜리 수제 <a> 였고 밑줄이 없어 링크 단서가 색뿐인데
          // 그 색이 본문과 대비 1.4:1(다크)이었다 → 디자인시스템 Link + 항상 밑줄.
          ? <Link as={RRLink} to={`/guides/${item.guideId}`} hasUnderline>{item.guideId}</Link>
          : <span className="af-dash">—</span>
      ),
    }
    // 값이 항상 '서버' 하나뿐이면 열을 둘 이유가 없다(헤더에 이미 건수가 적혀 있다).
    const source = {
      key: 'source',
      header: '출처',
      width: pixel(100),
      renderCell: (item) => (
        <Badge label={item.source === 'local' ? '이 브라우저' : '서버'} variant="neutral" />
      ),
    }
    const createdAt = {
      key: 'createdAt',
      header: '일시',
      width: pixel(150),
      renderCell: (item) => (
        <Text type="supporting" hasTabularNumbers>
          {item.createdAt?.slice(0, 16).replace('T', ' ') || '—'}
        </Text>
      ),
    }
    const detail = {
      key: 'detail',
      // 96px — 80px 이면 "자세히" 버튼(실측 86px)이 6px 잘린다.
      header: '전문',
      width: pixel(96),
      align: 'end',
      renderCell: (item) => (
        <Button label="자세히" variant="ghost" size="sm" onClick={() => setDetailItem(item)} />
      ),
    }
    return isMobile
      ? [kind, content, detail]
      : [kind, content, guide, ...(localItems.length > 0 ? [source] : []), createdAt, detail]
  }, [isMobile, localItems.length])

  return (
    <div className="admin-shell">
      <VStack gap={6} hAlign="stretch">

        {/* ─── 헤더 ─────────────────────────────────────────────── */}
        <div className="admin-page-header">
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
        {/* 상담·가이드 화면과 같은 컴포넌트. 건수는 이미 받아 둔 merged 를 한 번 세면 되므로
            추가 조회가 없다. */}
        <div className="af-seg">
          <SegmentedControl value={tab} onChange={setTab} label="피드백 유형 필터" size="sm">
            {TABS.map((t) => (
              <SegmentedControlItem key={t.value} value={t.value} label={`${t.label} ${tabCounts[t.value] ?? 0}`} />
            ))}
          </SegmentedControl>
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

        {/* 전문 보기. 표 안에서는 두 줄로 잘라 두고, 전체는 여기서 읽는다.
            좁은 화면에서 잘라낸 일시·가이드도 여기에 다시 나온다(정보를 지우는 게 아니라 옮긴 것). */}
        <Dialog isOpen={detailItem !== null} onOpenChange={(open) => { if (!open) setDetailItem(null) }} width={560}>
          {detailItem && (
            <VStack gap={4} hAlign="stretch">
              <HStack gap={2} vAlign="center">
                <Badge
                  label={KIND_LABEL[detailItem.kind] || detailItem.kind || '기타'}
                  variant={toKindVariant(detailItem.kind)}
                />
                <Text type="supporting" hasTabularNumbers>
                  {detailItem.createdAt?.slice(0, 16).replace('T', ' ') || '—'}
                </Text>
              </HStack>

              {detailItem.query && (
                <Text type="supporting">검색어: &ldquo;{detailItem.query}&rdquo;</Text>
              )}

              <VStack gap={1} hAlign="stretch">
                <Heading level={4}>{parseNote(detailItem.note).title || '내용 없음'}</Heading>
                {parseNote(detailItem.note).body && (
                  <Text as="p" className="af-detail-body">{parseNote(detailItem.note).body}</Text>
                )}
              </VStack>

              <HStack gap={3} vAlign="center">
                <Text type="supporting">가이드</Text>
                {detailItem.guideId
                  ? <Link as={RRLink} to={`/guides/${detailItem.guideId}`} hasUnderline>{detailItem.guideId}</Link>
                  : <Text type="supporting">연결된 가이드 없음</Text>}
              </HStack>

              <HStack gap={2} hAlign="end">
                <Button label="닫기" variant="secondary" size="sm" onClick={() => setDetailItem(null)} />
              </HStack>
            </VStack>
          )}
        </Dialog>

      </VStack>
    </div>
  )
}

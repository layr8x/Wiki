// src/pages/admin/AdminFeedbackPage.jsx — /admin/feedback
// 로컬 큐(NoResultFallback 등) + Supabase guide_feedback 머지 뷰
//   - 데이터 훅(react-query)·라우팅(react-router)·탭 필터·로컬 큐 비우기 액션은 그대로 유지
//   - 시각 요소는 Astryx primitive(VStack/HStack/Card/Badge/Button/Heading/Text)로 교체
//   - 전역 <Theme>(AdminLayout)에서 토큰/모드를 상속하므로 이 페이지는 Theme/CSS 를 감싸지 않음
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trash } from '@phosphor-icons/react'

import { fetchAdminFeedback } from '@/lib/db'
import { usePagination } from '@/hooks/usePagination'
import Pagination from '@/components/common/Pagination'
import { useToast } from '@/components/ui/toast'
import { STORAGE_KEYS } from '@/lib/storageKeys'

import { VStack } from '@astryxdesign/core/VStack'
import { HStack } from '@astryxdesign/core/HStack'
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'

import './AdminFeedbackPage.astryx.css'

const FEEDBACK_QUEUE_KEY = STORAGE_KEYS.feedbackQueue

const KIND_LABEL = {
  'missing-guide': '가이드 요청',
  'helpful':       '도움됨',
  'not-helpful':   '개선 필요',
  'praise':        '칭찬',
  'bug':           '오류 제보',
}

// 피드백 유형 → Astryx Badge variant (shadcn VOTE_VARIANT 를 색 계열 기준으로 매핑)
//   오류 제보 → error(red) · 개선 필요 → purple · 가이드 요청 → blue(추가요청)
//   도움됨 → success · 칭찬 → green
const KIND_BADGE_VARIANT = {
  'missing-guide': 'blue',
  'helpful':       'success',
  'not-helpful':   'purple',
  'praise':        'green',
  'bug':           'error',
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
  const { toast } = useToast()
  const [tab, setTab] = useState('all')
  const [localItems, setLocalItems] = useState(() => readLocalQueue())

  const { data: remote = [], isLoading } = useQuery({
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
    toast({ title: '로컬 큐를 비웠습니다.', description: '서버에 저장된 피드백은 영향을 받지 않습니다.' })
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

  const filtered = useMemo(() => tab === 'all'
    ? merged
    : merged.filter(item => {
        if (tab === 'requests') return item.kind === 'missing-guide' || !item.guideId
        if (tab === 'issues')   return item.kind === 'not-helpful' || item.kind === 'bug'
        if (tab === 'praise')   return item.kind === 'helpful' || item.kind === 'praise'
        return true
      }),
  [tab, merged])

  const pagination = usePagination(filtered, 25)
  useEffect(() => { pagination.reset() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const showSkeleton = isLoading && remote.length === 0

  return (
    <div className="af-shell">
      <VStack gap={6} hAlign="stretch">

        {/* ─── 헤더 ─────────────────────────────────────────────── */}
        <div className="af-row-between af-header">
          <VStack gap={1.5}>
            <Heading level={1}>피드백 수신함</Heading>
            <Text type="supporting">
              로컬 큐 {localItems.length}건 · 서버 {remote.length}건
            </Text>
          </VStack>
          {localItems.length > 0 && (
            <Button
              label="로컬 큐 비우기"
              variant="secondary"
              size="sm"
              icon={<Trash size={14} />}
              onClick={clearLocal}
            />
          )}
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
            <div className="af-table-wrap">
              <VStack gap={0} hAlign="stretch">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={`af-sk-${i}`} className="af-skel-row">
                    <div className="af-skel" />
                  </div>
                ))}
              </VStack>
            </div>
          </Card>
        ) : filtered.length === 0 ? (
          <div className="af-empty">
            <span className="af-empty-icon"><Trash size={18} /></span>
            <Text weight="medium">접수된 피드백이 없습니다</Text>
            <Text type="supporting">
              사용자가 남긴 피드백이 접수되면 이곳에 유형별로 쌓입니다.
            </Text>
          </div>
        ) : (
          <Card padding={0}>
            <div className="af-table-wrap">
              <table className="af-table af-tmin640">
                <thead>
                  <tr>
                    <th className="af-col-type">유형</th>
                    <th>내용</th>
                    <th className="af-col-guide">가이드</th>
                    <th className="af-col-source">출처</th>
                    <th className="af-col-date">일시</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.currentItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Badge
                          label={KIND_LABEL[item.kind] || item.kind || '기타'}
                          variant={toKindVariant(item.kind)}
                        />
                      </td>
                      <td className="af-content">
                        {item.query && (
                          <Text type="supporting">검색어: &ldquo;{item.query}&rdquo;</Text>
                        )}
                        <Text maxLines={2}>{item.note || '내용 없음'}</Text>
                      </td>
                      <td>
                        {item.guideId ? (
                          <Link to={`/guides/${item.guideId}`} className="af-guide-link">
                            {item.guideId}
                          </Link>
                        ) : (
                          <span className="af-dash">—</span>
                        )}
                      </td>
                      <td>
                        <Badge
                          label={item.source === 'local' ? '로컬' : '서버'}
                          variant="neutral"
                        />
                      </td>
                      <td className="af-date">
                        {item.createdAt?.slice(0, 16).replace('T', ' ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="af-pagination">
                <HStack gap={0} hAlign="center">
                  <Pagination pagination={pagination} />
                </HStack>
              </div>
            )}
          </Card>
        )}

      </VStack>
    </div>
  )
}

// src/components/search/NoResultFallback.jsx
// 검색 결과가 0건일 때 노출되는 폴백 — 관련 가이드 제안 + 개선 요청 퀵 폼.
//
// 제안 로직: bigram 기반 단순 유사도(제목/tldr/module/targets 연결 텍스트 vs 질의어)
//  - 외부 라이브러리 없이 동작 (검색 오버레이 번들에 부담 없음)
//  - 점수 0 제외, 상위 5개까지 노출
//
// 개선 요청: localStorage 큐(`ams-wiki:feedback:queue:v1`)에 적재.
//  - 백엔드 연결 전 임시 저장소. 제출 형식은 서버 API 와 동일 스키마로 맞춤.
//
// Astryx(디자인시스템) 마이그레이션: 데이터/제출 로직은 100% 유지, 시각 요소만
// Astryx primitive(VStack/HStack/EmptyState/Card/Item/Badge/TextArea/Button/Text)로 교체.

import { useMemo, useState } from 'react'
import {
  Compass,
  PaperPlaneTilt,
  SealCheck,
  FileText,
  Sparkle,
  ArrowRight,
} from '@phosphor-icons/react'
import { GUIDES } from '@/data/mockData'
import { similarity } from '@/lib/hangul'
import { useAiSearch } from '@/hooks/useAiSearch'
import { STORAGE_KEYS } from '@/lib/storageKeys'

import { VStack } from '@astryxdesign/core/VStack'
import { HStack } from '@astryxdesign/core/HStack'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Card } from '@astryxdesign/core/Card'
import { Item } from '@astryxdesign/core/Item'
import { Badge } from '@astryxdesign/core/Badge'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Button } from '@astryxdesign/core/Button'
import { Spinner } from '@astryxdesign/core/Spinner'
import './NoResultFallback.astryx.css'

const FEEDBACK_QUEUE_KEY = STORAGE_KEYS.feedbackQueue

// 유사도는 lib/hangul.js 로 옮겼다. 예전에는 여기서 글자 단위 bigram 을 썼는데,
// 한글은 한 글자에 초성·중성·종성이 뭉쳐 있어 "석"과 "섹"이 아무 조각도 공유하지 않는다.
// 그래서 오타를 하나도 못 잡았다(실측: "출섹"·"겹제"·"츨결" 전부 0건).
// 이제 자모로 쪼갠 뒤 비교하므로 한 글자 오타에도 점수가 나온다.

// mockData 의 GUIDES 는 35건뿐인데 guides 테이블에는 135건이 있다. 검색 팔레트는 이미
// DB 전량을 보도록 고쳤으므로, 폴백 제안도 같은 목록을 받아 쓴다. 못 받았을 때만
// mockData 로 되돌아간다(로컬 개발·DB 조회 실패).
const MOCK_GUIDE_LIST = Object.entries(GUIDES).map(([id, g]) => ({ id, ...g }))

function suggestRelatedGuides(query, guides, limit = 5) {
  const q = (query || '').trim()
  if (!q) return []
  const pool = guides?.length ? guides : MOCK_GUIDE_LIST
  const scored = pool.map(g => {
    const bag = [g.title, g.tldr, g.module, ...(g.targets || [])].filter(Boolean).join(' ')
    return { id: g.id, guide: g, score: similarity(q, bag) }
  })
  // 임계값으로 거르지 않고 점수순 상위만 남긴다. 짧은 질의어 대 긴 제목이라
  // 유사도 절대값이 원래 낮게 나와서(실측 0.09~0.41), 문턱을 세우면 전부 탈락한다.
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function queueFeedback(entry) {
  try {
    const raw = localStorage.getItem(FEEDBACK_QUEUE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    const next = Array.isArray(arr) ? arr : []
    next.push(entry)
    localStorage.setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(next.slice(-100)))
    return true
  } catch {
    return false
  }
}

export default function NoResultFallback({ query, guides, onGoTo, onGoToRoute, onNavigateFeedback }) {
  const related = useMemo(() => suggestRelatedGuides(query, guides), [query, guides])
  const ai = useAiSearch(query)
  const goRoute = onGoToRoute || ((route) => { const m = /^\/guides\/(.+)$/.exec(route || ''); if (m) onGoTo(m[1]) })
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (submitting || submitted) return
    setSubmitting(true)
    const ok = queueFeedback({
      kind: 'missing-guide',
      query,
      note: note.trim(),
      createdAt: new Date().toISOString(),
    })
    setTimeout(() => {
      setSubmitting(false)
      if (ok) setSubmitted(true)
    }, 250)
  }

  return (
    <VStack gap={4} paddingInline={3} paddingBlock={4} className="nrf-root">
      <EmptyState
        isCompact
        icon={<Compass size={20} />}
        title={`“${query}” 에 정확히 일치하는 가이드가 없습니다`}
        description="유사 주제 가이드를 대신 확인하거나, 필요한 가이드를 요청해 주세요"
      />

      {ai.status === 'loading' && (
        <Card variant="muted" padding={3} className="nrf-ai-loading">
          <HStack gap={2} align="center">
            <Spinner size="sm" aria-label="AI가 위키 전체에서 답을 찾는 중" />
            <Text type="supporting">AI가 위키 전체에서 답을 찾는 중…</Text>
          </HStack>
        </Card>
      )}

      {ai.status === 'ready' && ai.answer && (
        <Card variant="blue" padding={3} className="nrf-ai-answer">
          <VStack gap={2}>
            <HStack gap={1.5} align="center">
              <Sparkle size={13} weight="fill" className="nrf-ai-icon" />
              <Text type="label" weight="semibold" className="nrf-ai-label">AI 검색 답변</Text>
            </HStack>
            <Text type="body" as="p" className="nrf-ai-text">{ai.answer}</Text>
            {ai.sources?.length > 0 && (
              <VStack as="ul" gap={1} className="nrf-ai-sources">
                {ai.sources.map(s => (
                  <Item
                    key={s.id}
                    as="li"
                    density="compact"
                    onClick={() => goRoute(s.route)}
                    startContent={<FileText size={12} />}
                    label={s.title}
                    endContent={<Text type="supporting" className="nrf-source-type">{s.type}</Text>}
                  />
                ))}
              </VStack>
            )}
          </VStack>
        </Card>
      )}

      {related.length > 0 && (
        <VStack gap={1.5}>
          <Text type="supporting" weight="medium" as="p">이런 가이드는 어떠세요?</Text>
          <VStack as="ul" gap={1} className="nrf-related-list">
            {related.map(({ id, guide, score }) => (
              <Item
                key={id}
                as="li"
                align="start"
                onClick={() => onGoTo(id)}
                startContent={<FileText size={13} />}
                label={guide.title}
                description={`${guide.module} · ${guide.tldr?.split('\n')[0]?.slice(0, 56) ?? ''}`}
                endContent={<Text type="supporting" className="nrf-related-score">{Math.round(score * 100)}%</Text>}
              />
            ))}
          </VStack>
        </VStack>
      )}

      <form onSubmit={handleSubmit} className="nrf-feedback-form">
        <Card padding={3}>
          <VStack gap={2}>
            <HStack justify="between" align="center">
              <Text type="supporting" weight="medium">가이드 추가 요청</Text>
              {submitted && (
                <Badge variant="success" icon={<SealCheck size={11} weight="fill" />} label="접수 완료" />
              )}
            </HStack>
            <Text type="supporting" as="p">
              검색한 키워드 <Text as="span" weight="medium" color="primary">&ldquo;{query}&rdquo;</Text>{' '}
              관련 가이드가 필요하신가요? 어떤 내용이 필요한지 알려주시면 우선 검토합니다.
            </Text>
            <TextArea
              label="가이드 추가 요청 내용"
              isLabelHidden
              value={note}
              onChange={setNote}
              isDisabled={submitted}
              placeholder="예: 신규 강사 첫 출근일 OT 절차가 필요합니다"
              rows={2}
              maxLength={500}
            />
            <HStack justify="between" align="center">
              <Button
                variant="ghost"
                size="sm"
                label="상세 요청 작성"
                endContent={<ArrowRight size={12} />}
                onClick={() => onNavigateFeedback(query)}
              />
              <Button
                type="submit"
                size="sm"
                icon={<PaperPlaneTilt size={12} weight="fill" />}
                label={submitted ? '제출됨' : submitting ? '전송 중...' : '요청 보내기'}
                isDisabled={submitting || submitted}
              />
            </HStack>
          </VStack>
        </Card>
      </form>
    </VStack>
  )
}

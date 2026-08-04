// src/components/search/SearchOverlay.jsx — Astryx Dialog 기반 커맨드팔레트 검색 오버레이
//
// Astryx(디자인시스템) 마이그레이션 메모:
//  - 데이터 로직(디바운스 검색·AI 요약 훅·키보드 내비게이션·localStorage 등)은 100% 그대로 유지.
//  - 시각 요소만 Astryx primitive(Dialog/Layout/TextInput/Item/Badge/Card/Spinner/Kbd/Divider)로 교체.
//  - 원래대로 `isOpen` 이 false 면 컴포넌트 자체를 렌더하지 않는다(early return 유지) — Dialog를
//    상시 마운트하는 방식(예: UserMenu.jsx)이 더 "정석"이지만, 그렇게 하면 닫혀 있는 동안에도
//    NoResultFallback 내부의 AI 검색 fetch(useAiSearch/useSearchSummary)가 언마운트되지 않아
//    계속 실행되는 회귀가 생긴다 — 기존 동작(닫히면 전체 언마운트 → 진행 중 요청도 정리)을
//    그대로 지키기 위한 선택.
//  - Dialog의 position prop은 top/right/bottom/left 를 전부 지정해야 하는데, top 만 주면
//    수평 중앙정렬이 깨진다(자세한 이유는 co-located CSS 주석 참고) — 그래서 위치는 CSS로 오버라이드.
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MagnifyingGlass as Search,
  ArrowRight,
  Clock,
  TrendUp as TrendingUp,
  Sparkle,
  File as FileText,
} from '@phosphor-icons/react'
import { useSearchStore } from '@/store/searchStore.jsx'
import { GUIDES, RECENT_GUIDES, SEARCH_SYNONYMS } from '@/data/mockData'
import { useGuideList } from '@/hooks/useGuides'
import { useSearchSummary } from '@/hooks/useSearchSummary'
import NoResultFallback from '@/components/search/NoResultFallback'
import { getGuideType } from '@/lib/guideTypes'

import { Dialog } from '@astryxdesign/core/Dialog'
import { Layout } from '@astryxdesign/core/Layout'
import { LayoutHeader } from '@astryxdesign/core/Layout'
import { LayoutContent } from '@astryxdesign/core/Layout'
import { LayoutFooter } from '@astryxdesign/core/Layout'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Item } from '@astryxdesign/core/Item'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import { Divider } from '@astryxdesign/core/Divider'
import { Kbd } from '@astryxdesign/core/Kbd'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import './SearchOverlay.astryx.css'

// 가이드 타입(guideTypes.js) → Astryx Badge 색 variant.
// guideTypes.js 의 `variant`/`tone` 필드는 shadcn 전용 raw tailwind 값이라 건드리지 않고,
// 이미 마이그레이션된 다른 화면(GuidePage.jsx/GuideListPage.jsx/HomePage.jsx)과 동일하게
// 이 화면 전용 로컬 매핑을 둔다.
const TYPE_BADGE_VARIANT = {
  SOP: 'blue',
  DECISION: 'purple',
  REFERENCE: 'neutral',
  TROUBLE: 'red',
  RESPONSE: 'green',
  POLICY: 'yellow',
}
const toTypeVariant = (typeKey) => TYPE_BADGE_VARIANT[typeKey] ?? 'neutral'

// 타입 아이콘 칩 배경 — Badge에는 'gray' variant가 없어 별도 매핑(HomePage.jsx 의 home-tint/
// MODULE_FAMILY 패턴과 동일한 기법, --color-background-*/--color-icon-* 토큰만 사용).
const TYPE_ICON_TONE = {
  SOP: 'blue',
  DECISION: 'purple',
  REFERENCE: 'gray',
  TROUBLE: 'red',
  RESPONSE: 'green',
  POLICY: 'yellow',
}
const toIconTone = (typeKey) => TYPE_ICON_TONE[typeKey] ?? 'gray'

// mockData의 GUIDES는 35건뿐인데 실제 guides 테이블에는 135건이 published로 들어 있다.
// 예전에는 이 함수가 GUIDES만 훑어서, 검색이 전체 문서의 26%만 대상으로 삼고 있었다
// (나머지 100건은 /guides 목록과 상세 페이지에는 있는데 검색으로는 절대 못 찾음).
// 이제 대상 목록을 인자로 받아 DB에서 온 전체 목록을 넘길 수 있게 한다.
//
// 검색 방식(부분일치 + 동의어 확장)은 그대로 둔다. 색인형 검색 라이브러리를 얹어 보는 실험도
// 했는데, 한국어는 조사가 붙어서 단어 단위로 끊는 순간 재현율이 오히려 떨어졌다
// (실측: '출석' 12건→5건, '환불' 61건→30건). 부분일치가 우리 데이터에는 더 맞는다.
function searchGuides(query, guides) {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  const expandedTerms = [q]
  for (const [canonical, synonyms] of Object.entries(SEARCH_SYNONYMS)) {
    if (synonyms.some(s => s.toLowerCase().includes(q)) || q.includes(canonical.toLowerCase())) {
      expandedTerms.push(canonical.toLowerCase())
    }
  }
  return guides
    .filter(g => {
      const text = [g.title, g.tldr, g.module, g.path, ...(g.targets || [])].join(' ').toLowerCase()
      return expandedTerms.some(t => text.includes(t))
    })
    .slice(0, 8)
}

// DB 조회 전(또는 Supabase 미설정)에는 mockData로라도 검색이 되게 하는 폴백.
const MOCK_GUIDE_LIST = Object.entries(GUIDES).map(([id, g]) => ({ id, ...g }))

export default function SearchOverlay() {
  const { isOpen, close } = useSearchStore()
  const navigate  = useNavigate()
  const [query, setQuery]    = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(0)
  const [loading, setLoading]  = useState(false)
  const inputRef = useRef(null)

  // 검색 대상 = guides 테이블 전량. GuideListPage가 쓰는 것과 같은 쿼리 키라
  // React Query 캐시를 공유한다(검색 때문에 요청이 한 번 더 나가지 않는다).
  const { data: dbGuides } = useGuideList()
  const guidePool = dbGuides?.length ? dbGuides : MOCK_GUIDE_LIST

  const prevOpen = useRef(isOpen)
  useEffect(() => {
    if (isOpen && !prevOpen.current) {
      // Reset in microtask to avoid sync setState in effect
      queueMicrotask(() => { setQuery(''); setResults([]); setSelected(0) })
      setTimeout(() => inputRef.current?.focus(), 50)
      document.body.classList.add('search-open')
    }
    if (!isOpen && prevOpen.current) {
      document.body.classList.remove('search-open')
    }
    prevOpen.current = isOpen
  }, [isOpen])

  useEffect(() => {
    if (!query.trim()) {
      const t = setTimeout(() => setResults([]), 0)
      return () => clearTimeout(t)
    }
    const loadTimer = setTimeout(() => setLoading(true), 0)
    const timer = setTimeout(() => {
      setResults(searchGuides(query, guidePool)); setSelected(0); setLoading(false)
    }, 120)
    return () => { clearTimeout(loadTimer); clearTimeout(timer) }
  }, [query, guidePool])

  const summary = useSearchSummary(query, results)

  const goTo = useCallback((id) => { navigate('/guides/' + id); close() }, [navigate, close])
  const goToRoute = useCallback((route) => { navigate(route || '/'); close() }, [navigate, close])
  const openFeedback = useCallback((topic) => {
    const qs = topic ? `?topic=${encodeURIComponent(topic)}` : ''
    navigate('/feedback' + qs); close()
  }, [navigate, close])

  useEffect(() => {
    if (!isOpen) return
    const h = (e) => {
      if (e.key === 'Escape') { close(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, Math.max(0, results.length - 1))) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(0, s - 1)) }
      if (e.key === 'Enter' && results[selected]) goTo(results[selected].id)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [isOpen, results, selected, close, goTo])

  if (!isOpen) return null

  const recent  = RECENT_GUIDES.slice(0, 5)
  const popular = [...RECENT_GUIDES].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 4)
  const showResults = query.trim().length > 0

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={close}
      purpose="info"
      width={672}
      maxHeight="80vh"
      padding={0}
      className="so-dialog"
      aria-label="가이드 검색"
    >
      <Layout
        header={
          <LayoutHeader padding={0} hasDivider>
            <div className="so-searchbar">
              <div className="so-search-field">
                <TextInput
                  ref={inputRef}
                  label="가이드 검색"
                  isLabelHidden
                  value={query}
                  onChange={setQuery}
                  placeholder="가이드 검색... (예: 병합, 환불, QR 출석)"
                  startIcon={loading ? <Spinner size="sm" aria-label="검색 중" /> : <Search size={16} />}
                  autoComplete="off"
                  width="100%"
                  role="combobox"
                  aria-expanded={showResults && results.length > 0}
                  aria-controls="search-results-listbox"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    showResults && results.length > 0 ? `search-result-${selected}` : undefined
                  }
                />
              </div>
              <Kbd keys="escape" className="so-esc-hint" />
            </div>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            {showResults ? (
              results.length === 0 && !loading ? (
                <NoResultFallback
                  query={query}
                  guides={guidePool}
                  onGoTo={goTo}
                  onGoToRoute={goToRoute}
                  onNavigateFeedback={openFeedback}
                />
              ) : results.length === 0 ? (
                <div className="so-loading">
                  <Spinner size="md" label="검색 중..." />
                </div>
              ) : (
                <div className="so-results">
                  <AiSummaryCard summary={summary} onSourceClick={goTo} />
                  <Text
                    as="p"
                    type="supporting"
                    weight="medium"
                    id="search-results-count"
                    className="so-count"
                  >검색 결과 {results.length}건</Text>
                  <ul
                    id="search-results-listbox"
                    role="listbox"
                    aria-labelledby="search-results-count"
                    className="so-listbox"
                  >
                  {results.map((g, i) => {
                    const meta = getGuideType(g.type)
                    const TypeIcon = meta.icon
                    const isSelected = selected === i
                    return (
                      <Item
                        key={g.id}
                        as="li"
                        id={`search-result-${i}`}
                        role="option"
                        aria-selected={isSelected}
                        isHighlighted={isSelected}
                        align="start"
                        onClick={() => goTo(g.id)}
                        onMouseEnter={() => setSelected(i)}
                        startContent={
                          <span className="so-type-icon" data-tone={toIconTone(g.type)}>
                            <TypeIcon size={13} />
                          </span>
                        }
                        label={
                          <span className="so-result-title">
                            <Text as="span" weight="medium" maxLines={1} className="so-result-titletext">
                              {g.title}
                            </Text>
                            <Badge label={meta.label} variant={toTypeVariant(g.type)} />
                          </span>
                        }
                        description={`${g.module} · ${g.tldr?.split('\n')[0]?.slice(0, 60) ?? ''}`}
                        endContent={<ArrowRight size={13} className="so-arrow" />}
                      />
                    )
                  })}
                  </ul>
                </div>
              )
            ) : (
              <div className="so-lists">
                <div className="so-section-label">
                  <Clock size={11} />
                  <Text type="supporting" weight="medium">최근 업데이트</Text>
                </div>
                {recent.map(g => {
                  const meta = getGuideType(GUIDES[g.id]?.type)
                  const TypeIcon = meta.icon
                  return (
                    <Item
                      key={g.id}
                      onClick={() => goTo(g.id)}
                      startContent={
                        <span className="so-type-icon so-type-icon--sm" data-tone={toIconTone(GUIDES[g.id]?.type)}>
                          <TypeIcon size={11} />
                        </span>
                      }
                      label={g.title}
                      endContent={<Text type="supporting">{g.module?.split('/')[0]}</Text>}
                    />
                  )
                })}
                <Divider className="so-divider" />
                <div className="so-section-label">
                  <TrendingUp size={11} />
                  <Text type="supporting" weight="medium">인기 가이드</Text>
                </div>
                {popular.map(g => (
                  <Item
                    key={g.id}
                    onClick={() => goTo(g.id)}
                    label={g.title}
                    endContent={g.views ? <Text type="supporting">{g.views.toLocaleString()} 조회</Text> : null}
                  />
                ))}
              </div>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter padding={0} hasDivider>
            <div className="so-footer">
              <div className="so-footer-hints">
                <span className="so-hint">
                  <Kbd keys="up+down" />
                  <Text as="span" type="supporting">이동</Text>
                </span>
                <span className="so-hint">
                  <Kbd keys="enter" />
                  <Text as="span" type="supporting">열기</Text>
                </span>
                <span className="so-hint">
                  <Kbd keys="escape" />
                  <Text as="span" type="supporting">닫기</Text>
                </span>
              </div>
              <Text type="supporting" className="so-footer-mobile">탭하여 열기</Text>
              <Text type="supporting">{Object.keys(GUIDES).length}개 가이드</Text>
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

function AiSummaryCard({ summary, onSourceClick }) {
  if (summary.status === 'idle' || summary.status === 'disabled') return null
  // 결과가 있지만 요약할 만큼 충분치 않은 경우 — 조용히 생략 (기존 동작 유지)
  if (summary.status === 'empty') return null

  if (summary.status === 'loading') {
    return (
      <Card variant="blue" padding={3} className="so-ai-card" aria-live="polite">
        <HStack gap={2} align="center" justify="between">
          <HStack gap={1.5} align="center">
            <Sparkle size={12} weight="fill" className="so-ai-icon" />
            <Text type="label" weight="medium" className="so-ai-label">AI 요약</Text>
          </HStack>
          <Spinner size="sm" aria-label="AI 요약 불러오는 중" />
        </HStack>
        <VStack gap={1.5} className="so-ai-skeleton">
          <Skeleton width="90%" height={10} index={0} />
          <Skeleton width="72%" height={10} index={1} />
        </VStack>
      </Card>
    )
  }

  // error 상태는 과거 조용히 사라졌음 — 최소한의 피드백 노출
  if (summary.status === 'error') {
    return (
      <Card variant="blue" padding={3} className="so-ai-card" role="status">
        <HStack gap={2} align="center">
          <Sparkle size={12} />
          <Text type="supporting">AI 요약을 불러오지 못했습니다</Text>
        </HStack>
        <Text type="supporting" className="so-ai-error">
          {summary.error || '잠시 후 다시 시도해주세요. 검색 결과는 아래에 정상 표시됩니다.'}
        </Text>
      </Card>
    )
  }

  if (summary.status === 'ready') {
    const sources = (summary.sources || []).map(id => ({ id, guide: GUIDES[id] })).filter(s => s.guide)
    return (
      <Card variant="blue" padding={3} className="so-ai-card" aria-live="polite">
        <HStack gap={2} align="center" justify="between">
          <HStack gap={1.5} align="center">
            <Sparkle size={12} weight="fill" className="so-ai-icon" />
            <Text type="label" weight="medium" className="so-ai-label">AI 요약</Text>
          </HStack>
          <Text type="supporting">Claude Haiku 4.5</Text>
        </HStack>
        <Text type="body" className="so-ai-summary">{summary.summary}</Text>
        {sources.length > 0 && (
          <HStack gap={1.5} wrap="wrap" className="so-ai-sources">
            {sources.map(({ id, guide }) => (
              <Button
                key={id}
                variant="secondary"
                size="sm"
                icon={<FileText size={9} />}
                label={guide.title.length > 22 ? guide.title.slice(0, 22) + '…' : guide.title}
                tooltip={guide.title}
                onClick={() => onSourceClick(id)}
              />
            ))}
          </HStack>
        )}
      </Card>
    )
  }
  return null
}

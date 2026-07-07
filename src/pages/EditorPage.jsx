// src/pages/EditorPage.jsx
// 구조: 좌측 사이드바(가이드 리스트) + 우측 편집 영역
// 발행된 가이드 페이지(GuidePage)의 모든 섹션을 type별로 노출하여 편집할 수 있도록 구성
//
// Astryx(Meta 디자인시스템) 마이그레이션 — 이 페이지는 App.jsx에서 AstryxAppFrame 밖의
// standalone 라우트(/editor)로 렌더되므로 AstryxThemeRegion 으로 자체 <Theme> 영역을 연다.
//   - 폼 컨트롤(Input/Textarea/Select/Checkbox/Sheet/Tabs)은 shadcn 그대로 유지 —
//     value/onChange/자동저장 연동·Sheet open state·Tabs value 100% 동일.
//   - 헤더/툴바·섹션 카드·행 추가/삭제 버튼·스켈레톤 등 크롬(시각 레이어)만 Astryx로 교체.
import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAutosave } from '@/hooks/useAutosave'
import { useIsMobile } from '@/hooks/use-mobile'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchGuide, upsertGuide } from '@/lib/db'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/store/authStore'
import {
  ArrowLeft,
  FloppyDisk as Save,
  PaperPlaneTilt as Send,
  Plus,
  Trash as Trash2,
  Eye,
  EyeSlash as EyeOff,
  User,
  ClockCounterClockwise as History,
  Hash,
  ListChecks,
  GitFork,
  BookOpen,
  Wrench,
  ChatCircle,
  Megaphone,
} from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

import { VStack } from '@astryxdesign/core/VStack'
import { Card } from '@astryxdesign/core/Card'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Divider } from '@astryxdesign/core/Divider'

import AstryxThemeRegion from '@/components/common/AstryxThemeRegion'
import './EditorPage.astryx.css'

// 좌측 사이드바 — 새 가이드 작성 시작점.
// 발행된 가이드 목록이 아니라 "어떤 타입으로 만들 것인가" 템플릿 picker.
// 선택 시 우측 본문 탭이 해당 type의 빈 섹션 구조로 자동 구성됩니다.
const TEMPLATES = [
  { type: 'SOP',       fullName: '절차형',     desc: '단계별 작업 절차 정리',         icon: ListChecks },
  { type: 'DECISION',  fullName: '판단분기',   desc: '조건/상황별 판단 기준 매트릭스', icon: GitFork    },
  { type: 'REFERENCE', fullName: '참조형',     desc: '용어 사전, 코드값, 표준 데이터',  icon: BookOpen   },
  { type: 'TROUBLE',   fullName: '트러블슈팅', desc: '오류·증상별 해결 방법 정리',     icon: Wrench     },
  { type: 'RESPONSE',  fullName: '대응매뉴얼', desc: '시나리오별 고객 응대 스크립트',   icon: ChatCircle },
  { type: 'POLICY',    fullName: '정책공지',   desc: '정책 변경, 전/후 비교, 영향 범위', icon: Megaphone  },
]

const MODULES = ['고객(원생) 관리','상품 관리','강좌 관리','수업운영 관리','입반/퇴반 관리','청구/수납/결제/환불','메시지 관리','공통/시스템','전략/운영']
const GUIDE_TYPES = [
  { value: 'SOP',       label: 'SOP · 절차형'    },
  { value: 'DECISION',  label: 'DECISION · 판단분기' },
  { value: 'REFERENCE', label: 'REFERENCE · 참조형' },
  { value: 'TROUBLE',   label: 'TROUBLE · 트러블슈팅' },
  { value: 'RESPONSE',  label: 'RESPONSE · 대응매뉴얼' },
  { value: 'POLICY',    label: 'POLICY · 정책공지' },
]
// DB 컬럼값(draft/review/published/archived) 과 UI 한글 라벨 매핑.
// 과거엔 한글 문자열만 썼고 저장 시 무시됐음(H5) → DB 값으로 일원화.
const STATUS_OPTIONS = [
  { value: 'draft',     label: '작성중' },
  { value: 'review',    label: '검수중' },
  { value: 'published', label: '배포완료' },
  { value: 'archived',  label: '보관' },
]
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s.label]))

// 가이드 타입/상태 → Astryx Badge variant (GuidePage와 동일 계열로 시각 일관성 유지)
const TYPE_BADGE_VARIANT = {
  SOP: 'blue',
  DECISION: 'purple',
  REFERENCE: 'neutral',
  TROUBLE: 'red',
  RESPONSE: 'green',
  POLICY: 'yellow',
}
const toTypeVariant = (t) => TYPE_BADGE_VARIANT[t] ?? 'neutral'

const STATUS_BADGE_VARIANT = {
  draft:     'neutral',
  review:    'warning',
  published: 'success',
  archived:  'neutral',
}
const toStatusVariant = (s) => STATUS_BADGE_VARIANT[s] ?? 'neutral'

const STATUS_OPTIONS_FOR_DECISION = [
  { value: 'safe',   label: '허용' },
  { value: 'warn',   label: '주의' },
  { value: 'danger', label: '불가' },
]
const SEVERITY_OPTIONS = [
  { value: 'critical', label: '긴급' },
  { value: 'high',     label: '높음' },
  { value: 'medium',   label: '보통' },
  { value: 'low',      label: '낮음' },
]

// type별로 노출할 섹션 — 발행 가이드(GuidePage) 구조와 1:1 매핑
const SECTIONS_BY_TYPE = {
  SOP:       ['cautions', 'steps', 'mainItemsTable', 'cases'],
  DECISION:  ['cautions', 'decisionTable', 'cases'],
  REFERENCE: ['cautions', 'mainItemsTable', 'referenceData'],
  TROUBLE:   ['cautions', 'troubleTable', 'cases'],
  RESPONSE:  ['cautions', 'decisionTable', 'responses'],
  POLICY:    ['cautions', 'policyDiff', 'mainItemsTable', 'decisionTable', 'steps'],
}

const SECTION_META = {
  cautions:       { label: '주의사항',          desc: '반드시 확인해야 할 항목' },
  steps:          { label: '처리 절차',         desc: '단계별 작업 절차' },
  mainItemsTable: { label: '주요 항목',         desc: '필드/설명/필수 여부' },
  cases:          { label: '케이스별 처리',     desc: '상황별 대응 방법' },
  decisionTable:  { label: '판단 기준',         desc: '조건/처리/상태 매트릭스' },
  troubleTable:   { label: '자주 발생하는 오류', desc: '오류/원인/해결/심각도' },
  responses:      { label: '응답 스크립트',     desc: '시나리오별 응대문' },
  referenceData:  { label: '참조 데이터',       desc: '용어 사전 / 코드값' },
  policyDiff:     { label: '정책 비교 (전/후)',  desc: '변경 전후 비교' },
}

// 버전 이력은 아직 백엔드 스키마(guide_versions 테이블)가 없음 → 플레이스홀더.
// 실제 구현 전까지 가짜 이름·날짜를 보여주지 않는다.
const VERSION_HISTORY_PLACEHOLDER = true

// 리스트 행 식별자 — React key 안정성을 위한 내부 전용 ID.
// DB/자동저장으로 나갈 때는 stripIds() 로 제거한다.
let __uidCounter = 0
function uid() {
  return `r-${Date.now().toString(36)}-${(__uidCounter++).toString(36)}`
}
function withId(o) { return { _id: uid(), ...o } }

function createEmptyContent() {
  return {
    cautions:       [''],
    steps:          [withId({ title: '', desc: '' })],
    mainItemsTable: [withId({ field: '', desc: '', required: false })],
    cases:          [withId({ label: '', action: '', note: '' })],
    decisionTable:  [withId({ cond: '', action: '', note: '', status: 'safe' })],
    troubleTable:   [withId({ issue: '', cause: '', solution: '', severity: 'medium' })],
    responses:      [withId({ scenario: '', script: '' })],
    referenceData:  [withId({ term: '', definition: '' })],
    policyDiff:     { before: '', after: '' },
  }
}

// 기존 데이터(DB/로컬드래프트)에 _id 가 없으면 보강
function ensureIds(arr) {
  if (!Array.isArray(arr)) return arr
  return arr.map(x => (x && typeof x === 'object' ? (x._id ? x : withId(x)) : x))
}

// 저장 직전 _id 제거 (DB 스키마 오염 방지)
function stripIds(arr) {
  if (!Array.isArray(arr)) return arr
  return arr.map(x => {
    if (x && typeof x === 'object' && '_id' in x) {
      const { _id, ...rest } = x
      return rest
    }
    return x
  })
}

const DRAFT_KEY = 'ams-wiki:editor:draft:v1'
const DEFAULT_META = {
  title:   '',
  module:  '고객(원생) 관리',
  type:    'SOP',
  status:  'draft',
  targets: '운영자, 실장',
  tldr:    '',
  version: 'v0.1',
  confluenceId: '',
}

function formatRelative(ts) {
  if (!ts) return ''
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diff < 5)   return '방금'
  if (diff < 60)  return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  return `${Math.floor(diff / 3600)}시간 전`
}

// 마운트 이전 1회 동기 복원 — Vite CSR이므로 window 안전.
// useState lazy-init으로 처리해 이펙트 내 setState 규칙을 준수하고 첫 렌더부터 복원된 값 사용.
function loadInitialDraft() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.data?.meta && parsed?.data?.content) {
      const c = parsed.data.content
      return {
        meta: { ...DEFAULT_META, ...parsed.data.meta },
        content: {
          cautions:       c.cautions       ?? [''],
          steps:          ensureIds(c.steps          ?? []),
          mainItemsTable: ensureIds(c.mainItemsTable ?? []),
          cases:          ensureIds(c.cases          ?? []),
          decisionTable:  ensureIds(c.decisionTable  ?? []),
          troubleTable:   ensureIds(c.troubleTable   ?? []),
          responses:      ensureIds(c.responses      ?? []),
          referenceData:  ensureIds(c.referenceData  ?? []),
          policyDiff:     c.policyDiff     ?? { before: '', after: '' },
        },
        savedAt: parsed.savedAt ?? null,
      }
    }
  } catch { /* ignore */ }
  return null
}

// DB guide → 에디터 content 매핑 (guide.X 가 null/undefined 여도 빈 템플릿으로 채움)
function guideToContent(guide) {
  const fallback = createEmptyContent()
  if (!guide) return fallback
  return {
    cautions:       guide.cautions       ?? fallback.cautions,
    steps:          ensureIds(guide.steps          ?? fallback.steps),
    mainItemsTable: ensureIds(guide.mainItemsTable ?? fallback.mainItemsTable),
    cases:          ensureIds(guide.cases          ?? fallback.cases),
    decisionTable:  ensureIds(guide.decisionTable  ?? fallback.decisionTable),
    troubleTable:   ensureIds(guide.troubleTable   ?? fallback.troubleTable),
    responses:      ensureIds(guide.responses      ?? fallback.responses),
    referenceData:  ensureIds(guide.referenceData  ?? fallback.referenceData),
    policyDiff:     guide.policyDiff     ?? fallback.policyDiff,
  }
}

function guideToMeta(guide) {
  if (!guide) return DEFAULT_META
  return {
    title:        guide.title   ?? '',
    module:       guide.module  ?? DEFAULT_META.module,
    type:         guide.type    ?? 'SOP',
    status:       guide.status  ?? 'draft',
    targets:      Array.isArray(guide.targets) ? guide.targets.join(', ') : (guide.targets ?? ''),
    tldr:         guide.tldr    ?? '',
    version:      guide.version ?? 'v0.1',
    confluenceId: guide.confluenceId ?? '',
  }
}

export default function EditorPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editingId = searchParams.get('id') || null
  const qc = useQueryClient()
  const { toast } = useToast()
  const { hasPermission } = useAuth()

  // 기존 가이드 로드 (편집 모드)
  const { data: existingGuide, isLoading: loadingExisting, error: loadError } = useQuery({
    queryKey: ['guide', editingId],
    queryFn:  () => fetchGuide(editingId),
    enabled:  Boolean(editingId),
    staleTime: 0,
    retry: 1,
  })

  // 로드 실패 시 한 번만 토스트 — 같은 err 재호출 방지
  const [loadErrorShownFor, setLoadErrorShownFor] = useState(null)
  if (loadError && loadErrorShownFor !== editingId) {
    setLoadErrorShownFor(editingId)
    toast({
      variant: 'destructive',
      title: '가이드를 불러오지 못했습니다',
      description: loadError?.message || '네트워크 또는 권한을 확인해 주세요.',
    })
  }

  // 초기 상태를 draft 스냅샷 하나로 묶어 관리 → lazy initializer 한 번만 호출.
  // 편집 모드일 때는 draft 복원을 건너뛴다 (DB 데이터가 우선).
  const [draftInit] = useState(() => (editingId ? null : loadInitialDraft()))
  const [selectedType, setSelectedType] = useState(() => draftInit?.meta?.type ?? 'SOP')
  const [meta, setMeta] = useState(() => draftInit?.meta ?? DEFAULT_META)
  const [content, setContent] = useState(() => draftInit?.content ?? createEmptyContent())
  const [restoredAt, setRestoredAt] = useState(() => draftInit?.savedAt ?? null)
  const [preview, setPreview] = useState(false)
  // 좁은 화면(<768)에서 툴바 버튼을 아이콘 전용으로 축소 — 라벨 텍스트가 겹치는 것을 방지
  // (shadcn 사이드바가 이미 쓰는 것과 동일한 breakpoint 훅 재사용)
  const isMobile = useIsMobile()

  // 기존 가이드 로드 완료 → 에디터 상태 프리필 (1회).
  // React 권장 패턴: 외부 데이터 변화에 의한 파생 상태 초기화는 렌더 도중 동기 setState 로 처리.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [hydratedFor, setHydratedFor] = useState(editingId ? null : 'new')
  const hydrated = hydratedFor === (editingId || 'new')
  if (editingId && existingGuide && hydratedFor !== existingGuide.id) {
    setHydratedFor(existingGuide.id)
    setMeta(guideToMeta(existingGuide))
    setContent(guideToContent(existingGuide))
    setSelectedType(existingGuide.type ?? 'SOP')
  }

  // 발행 / 임시저장 — DB upsert
  const upsertMutation = useMutation({
    mutationFn: ({ nextStatus }) => upsertGuide({
      id:     editingId || `g-${Date.now().toString(36)}`,
      type:   meta.type,
      module: meta.module,
      title:  meta.title,
      tldr:   meta.tldr,
      targets: meta.targets ? meta.targets.split(',').map(s => s.trim()).filter(Boolean) : [],
      version: meta.version,
      confluenceId: meta.confluenceId,
      steps:          stripIds(content.steps),
      mainItemsTable: stripIds(content.mainItemsTable),
      cases:          stripIds(content.cases),
      cautions:       content.cautions,
      troubleTable:   stripIds(content.troubleTable),
      responses:      stripIds(content.responses),
      decisionTable:  stripIds(content.decisionTable),
      referenceData:  stripIds(content.referenceData),
      policyDiff:     content.policyDiff,
      status: nextStatus,
    }),
    onSuccess: (saved, { nextStatus }) => {
      qc.invalidateQueries({ queryKey: ['guides'] })
      qc.invalidateQueries({ queryKey: ['admin', 'guides'] })
      qc.invalidateQueries({ queryKey: ['guide', saved.id] })
      toast({
        title: nextStatus === 'published' ? '가이드를 발행했습니다.' : '임시저장되었습니다.',
      })
      if (nextStatus === 'published') navigate(`/guides/${saved.id}`)
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: '저장 실패', description: String(err?.message || err) })
    },
  })

  const canPublish = hasPermission('publish')
  const validateForPublish = () => {
    if (!meta.title?.trim()) return '제목을 입력해 주세요.'
    if (!meta.tldr?.trim())  return '핵심 요약(TL;DR)을 입력해 주세요.'
    return null
  }
  const handlePublish = () => {
    const err = validateForPublish()
    if (err) { toast({ variant: 'destructive', title: '발행 불가', description: err }); return }
    upsertMutation.mutate({ nextStatus: 'published' })
  }
  const handleSaveToDb = () => {
    // 사용자가 고른 meta.status 를 존중 — draft/review 저장 시 조용히 발행 상태로 바뀌거나
    // 이미 발행된 가이드가 draft 로 돌아가는 현상을 방지.
    const nextStatus = STATUS_LABEL[meta.status] ? meta.status : 'draft'
    upsertMutation.mutate({ nextStatus })
  }

  const sections = useMemo(
    () => SECTIONS_BY_TYPE[meta.type] ?? SECTIONS_BY_TYPE.SOP,
    [meta.type],
  )

  // 자동 저장: 5초 디바운스 + localStorage fallback
  const autosave = useAutosave({
    key: DRAFT_KEY,
    data: { meta, content },
    delay: 5000,
  })

  // 템플릿 변경 = 본문 sections 구조가 달라지므로 content를 초기화.
  // title/module/tldr/targets 등 메타 입력값은 보존(사용자가 이미 입력했을 수 있음).
  const handleSelectTemplate = (type) => {
    setSelectedType(type)
    setMeta(m => ({ ...m, type }))
    setContent(createEmptyContent())
  }

  const updateContent = (key, value) => {
    setContent(c => ({ ...c, [key]: value }))
  }

  const handleSave = () => autosave.saveNow()

  const handleDiscardDraft = () => {
    autosave.clearDraft()
    setMeta(DEFAULT_META)
    setContent(createEmptyContent())
    setSelectedType('SOP')
    setRestoredAt(null)
  }

  // Ctrl/⌘+S — 전역 저장 단축키 (폼 포커스 중에도 동작)
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        autosave.saveNow()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [autosave])

  const templateButtons = TEMPLATES.map(t => {
    const Icon = t.icon
    const isSelected = selectedType === t.type
    return (
      <ClickableCard
        key={t.type}
        label={`${t.fullName} 템플릿 선택`}
        onClick={() => handleSelectTemplate(t.type)}
        variant={isSelected ? 'default' : 'transparent'}
        padding={3}
        className={cn('ep-tpl-card', isSelected && 'is-selected')}
      >
        <div className="ep-tpl-head">
          <Icon size={16} weight={isSelected ? 'fill' : 'regular'} className="ep-tpl-icon" />
          <Badge label={t.type} variant={isSelected ? 'info' : 'neutral'} />
          <Text weight={isSelected ? 'semibold' : 'medium'}>{t.fullName}</Text>
        </div>
        <Text type="supporting" className="ep-tpl-desc">{t.desc}</Text>
      </ClickableCard>
    )
  })

  // 편집 모드에서 가이드 데이터 로딩 중 → 스켈레톤 화면
  if (editingId && loadingExisting && !hydrated) {
    return (
      <AstryxThemeRegion>
        <div className="ep-skel-shell">
          <div className="ep-skel ep-skel-title" />
          <div className="ep-skel ep-skel-sub" />
          <div className="ep-skel ep-skel-block-sm" />
          <div className="ep-skel ep-skel-block-lg" />
        </div>
      </AstryxThemeRegion>
    )
  }

  // 편집 모드인데 데이터를 못 가져왔을 때 — 빈 에디터로 묵묵히 진입하는 대신 명시적 에러 UI
  if (editingId && loadError && !existingGuide) {
    return (
      <AstryxThemeRegion>
        <div className="ep-error-shell">
          <Heading level={3}>가이드를 불러오지 못했습니다</Heading>
          <Text type="supporting">
            {loadError?.message || '네트워크 오류 또는 권한 문제일 수 있습니다.'}
          </Text>
          <div className="ep-error-actions">
            <Button label="뒤로" variant="secondary" size="sm" onClick={() => navigate(-1)} />
            <Button
              label="다시 시도"
              variant="primary"
              size="sm"
              onClick={() => qc.invalidateQueries({ queryKey: ['guide', editingId] })}
            />
          </div>
        </div>
      </AstryxThemeRegion>
    )
  }

  return (
    <AstryxThemeRegion>
      <div className="ep-shell">
        {/* ─── 좌측 사이드바: 가이드 타입 템플릿 picker (lg+ 전용) ─── */}
        <aside className="ep-sidebar">
          <div className="ep-sidebar-head">
            <Button label="나가기" variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => navigate('/')} />
          </div>
          <div className="ep-sidebar-title">
            <Text weight="semibold">가이드 타입 선택</Text>
            <Text type="supporting" className="ep-sidebar-desc">
              선택한 타입에 맞는 섹션이<br />본문에 자동 구성됩니다
            </Text>
          </div>
          <div className="ep-sidebar-list">
            {templateButtons}
          </div>
        </aside>

        {/* ─── 우측 편집 영역 ─── */}
        <div className="ep-main">
          {/* Top bar */}
          <header className="ep-toolbar">
            <div className="ep-toolbar-left">
              {/* 모바일/태블릿: 뒤로가기 + 템플릿 Sheet */}
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                className="ep-mobile-only"
                label="나가기"
                icon={<ArrowLeft size={14} />}
                onClick={() => navigate('/')}
              />
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    className="ep-mobile-only"
                    label="가이드 타입 선택"
                    icon={<ListChecks size={15} />}
                  />
                </SheetTrigger>
                <SheetContent side="left" className="w-[85vw] max-w-xs p-0">
                  <SheetHeader className="border-b p-4">
                    <SheetTitle className="text-sm">가이드 타입 선택</SheetTitle>
                    <Text type="supporting" className="ep-sheet-tpl-desc">
                      선택한 타입에 맞는 섹션이 본문에 자동 구성됩니다
                    </Text>
                  </SheetHeader>
                  <div className="ep-sheet-tpl-list">
                    {templateButtons}
                  </div>
                </SheetContent>
              </Sheet>
              <Hash size={14} className="ep-hash" />
              <Text
                weight="medium"
                maxLines={1}
                className={cn('ep-title', !meta.title && 'is-empty')}
              >
                {meta.title || '제목 없음'}
              </Text>
              <Badge
                label={STATUS_LABEL[meta.status] || meta.status}
                variant={toStatusVariant(meta.status)}
                className="ep-status-badge"
              />
              <Badge label={meta.type} variant={toTypeVariant(meta.type)} />
            </div>
            <div className="ep-toolbar-right">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly={isMobile}
                    label="버전 이력"
                    icon={<History size={14} />}
                    tooltip={isMobile ? '버전 이력' : undefined}
                  />
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md">
                  <SheetHeader>
                    <SheetTitle>버전 이력</SheetTitle>
                  </SheetHeader>
                  <VStack gap={3} className="mt-6 px-4">
                    {/* 현재 편집 중인 가이드의 메타 — 저장된 version 만 표시 */}
                    {editingId && existingGuide && (
                      <Card className="ep-vh-card" padding={4}>
                        <div className="ep-vh-row">
                          <Badge label={existingGuide.version || meta.version || 'v0.1'} variant="neutral" />
                          <Text type="supporting" hasTabularNumbers>
                            {existingGuide.updated || existingGuide.updated_at?.slice(0, 10) || '—'}
                          </Text>
                        </div>
                        <Text type="body">현재 저장된 버전</Text>
                        {existingGuide.author && (
                          <Text type="supporting">
                            <User size={10} className="inline" /> {existingGuide.author}
                          </Text>
                        )}
                      </Card>
                    )}
                    {VERSION_HISTORY_PLACEHOLDER && (
                      <div className="ep-vh-note">
                        <Text type="supporting">
                          전체 버전 이력은 준비 중입니다.<br />
                          추후 <span className="ep-vh-code">guide_versions</span> 테이블 연동 시 제공됩니다.
                        </Text>
                      </div>
                    )}
                  </VStack>
                </SheetContent>
              </Sheet>
              <Button
                variant="ghost"
                size="sm"
                isIconOnly={isMobile}
                label={preview ? '편집' : '미리보기'}
                icon={preview ? <EyeOff size={14} /> : <Eye size={14} />}
                onClick={() => setPreview(p => !p)}
                tooltip={isMobile ? (preview ? '편집' : '미리보기') : undefined}
              />
              <Divider orientation="vertical" className="ep-vdivider" />
              <AutosaveIndicator status={autosave.status} savedAt={autosave.savedAt} />
              <Button
                variant="secondary"
                size="sm"
                isIconOnly={isMobile}
                label={(autosave.status === 'saving' || upsertMutation.isPending) ? '저장 중' : '임시저장'}
                icon={<Save size={14} />}
                endContent={!isMobile ? <kbd className="ep-kbd">⌘S</kbd> : undefined}
                isDisabled={autosave.status === 'saving' || upsertMutation.isPending}
                onClick={editingId ? handleSaveToDb : handleSave}
                tooltip={editingId ? '임시저장 (DB)' : '임시저장 (로컬)'}
              />
              {canPublish && (
                <Button
                  variant="primary"
                  size="sm"
                  isIconOnly={isMobile}
                  label={upsertMutation.isPending ? '저장 중…' : '발행'}
                  icon={<Send size={14} />}
                  isDisabled={upsertMutation.isPending}
                  onClick={handlePublish}
                  tooltip="발행"
                />
              )}
            </div>
          </header>

          {restoredAt && (
            <div className="ep-restore">
              <Badge label="임시저장본 복원됨" variant="warning" />
              <Text type="supporting" className="ep-restore-text">
                마지막 자동 저장: {new Date(restoredAt).toLocaleString()}
              </Text>
              <div className="ep-restore-actions">
                <Button label="새로 시작 (임시저장본 삭제)" variant="ghost" size="sm" onClick={handleDiscardDraft} />
                <Button label="확인" variant="ghost" size="sm" onClick={() => setRestoredAt(null)} />
              </div>
            </div>
          )}

          {/* 본문 */}
          <div className="ep-content">
            <main className="ep-content-main">
              <div className="ep-content-inner">
                <Tabs defaultValue="content" className="w-full">
                  <TabsList>
                    <TabsTrigger value="content">본문</TabsTrigger>
                    <TabsTrigger value="meta">메타 정보</TabsTrigger>
                  </TabsList>

                  {/* 본문 탭 */}
                  <TabsContent value="content" className="ep-tab-body">
                    {preview ? (
                      <PreviewPane meta={meta} content={content} sections={sections} />
                    ) : (
                      <>
                        {/* 제목 */}
                        <div className="ep-field">
                          <Label htmlFor="editor-title">제목</Label>
                          <Input
                            id="editor-title"
                            value={meta.title}
                            onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
                            className="text-lg font-semibold h-11"
                          />
                        </div>

                        {/* 핵심 요약 (모든 type 공통) */}
                        <SectionFrame title="핵심 요약" desc="이 가이드가 어떤 문제를 해결하는지 한 문단으로 요약">
                          <Textarea
                            placeholder="예: 학생이 마이클래스에서 직접 수강정보 연동을 하지 못하는 경우..."
                            value={meta.tldr}
                            onChange={e => setMeta(m => ({ ...m, tldr: e.target.value }))}
                            rows={3}
                          />
                        </SectionFrame>

                        {/* type별 섹션 */}
                        {sections.map(sec => (
                          <SectionFrame
                            key={sec}
                            title={SECTION_META[sec].label}
                            desc={SECTION_META[sec].desc}
                          >
                            {sec === 'cautions'       && <CautionsEditor       items={content.cautions}       onChange={v => updateContent('cautions', v)} />}
                            {sec === 'steps'          && <StepsEditor          items={content.steps}          onChange={v => updateContent('steps', v)} />}
                            {sec === 'mainItemsTable' && <MainItemsEditor      items={content.mainItemsTable} onChange={v => updateContent('mainItemsTable', v)} />}
                            {sec === 'cases'          && <CasesEditor          items={content.cases}          onChange={v => updateContent('cases', v)} />}
                            {sec === 'decisionTable'  && <DecisionTableEditor  items={content.decisionTable}  onChange={v => updateContent('decisionTable', v)} />}
                            {sec === 'troubleTable'   && <TroubleTableEditor   items={content.troubleTable}   onChange={v => updateContent('troubleTable', v)} />}
                            {sec === 'responses'      && <ResponsesEditor      items={content.responses}      onChange={v => updateContent('responses', v)} />}
                            {sec === 'referenceData'  && <ReferenceDataEditor  items={content.referenceData}  onChange={v => updateContent('referenceData', v)} />}
                            {sec === 'policyDiff'     && <PolicyDiffEditor     value={content.policyDiff}     onChange={v => updateContent('policyDiff', v)} />}
                          </SectionFrame>
                        ))}
                      </>
                    )}
                  </TabsContent>

                  {/* 메타 정보 탭 */}
                  <TabsContent value="meta" className="mt-6 space-y-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>모듈</Label>
                        <Select value={meta.module} onValueChange={v => setMeta(m => ({ ...m, module: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>유형</Label>
                        <Select value={meta.type} onValueChange={v => setMeta(m => ({ ...m, type: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {GUIDE_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Text type="supporting" className="ep-meta-help">
                          유형 변경 시 본문 탭에 노출되는 섹션이 자동 변경됩니다.
                        </Text>
                      </div>
                      <div className="space-y-2">
                        <Label>상태</Label>
                        <Select value={meta.status} onValueChange={v => setMeta(m => ({ ...m, status: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editor-targets">대상 (쉼표 구분)</Label>
                        <Input
                          id="editor-targets"
                          placeholder="예: 운영자, 실장"
                          value={meta.targets}
                          onChange={e => setMeta(m => ({ ...m, targets: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editor-version">버전</Label>
                        <Input
                          id="editor-version"
                          placeholder="예: v1.0"
                          value={meta.version}
                          onChange={e => setMeta(m => ({ ...m, version: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editor-confluence">Confluence Page ID</Label>
                        <Input
                          id="editor-confluence"
                          placeholder="예: 1815216142"
                          value={meta.confluenceId}
                          onChange={e => setMeta(m => ({ ...m, confluenceId: e.target.value }))}
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </main>
          </div>
        </div>
      </div>
    </AstryxThemeRegion>
  )
}

// ─── 자동 저장 상태 인디케이터 ──────────────────────────────
function AutosaveIndicator({ status, savedAt }) {
  const [, force] = useState(0)
  // savedAt 기준 '~초 전' 표시를 위해 10초마다 리렌더
  useEffect(() => {
    if (!savedAt) return
    const id = setInterval(() => force(x => x + 1), 10_000)
    return () => clearInterval(id)
  }, [savedAt])

  const { label, variant } = (() => {
    if (status === 'saving') return { label: '자동 저장 중…', variant: 'neutral' }
    if (status === 'error')  return { label: '자동 저장 실패', variant: 'error' }
    if (savedAt)              return { label: `자동 저장 · ${formatRelative(savedAt)}`, variant: 'success' }
    return { label: '자동 저장 대기', variant: 'warning' }
  })()

  return <Badge label={label} variant={variant} className="ep-autosave" />
}

// ─── 섹션 프레임 (Astryx Card + Heading/Text) ────────────────
function SectionFrame({ title, desc, children }) {
  return (
    <Card className="ep-section-card" padding={5}>
      <div className="ep-section-head">
        <Heading level={4}>{title}</Heading>
        <Text type="supporting">{desc}</Text>
      </div>
      <div className="ep-section-body">{children}</div>
    </Card>
  )
}

// ─── 리스트 행 추가/삭제 공통 헬퍼 ──────────────────────────
function ListRow({ onRemove, children }) {
  return (
    <div className="ep-row">
      <div className="ep-row-body">{children}</div>
      <Button
        variant="ghost"
        size="sm"
        isIconOnly
        label="행 삭제"
        icon={<Trash2 size={14} />}
        onClick={onRemove}
      />
    </div>
  )
}

function AddRowButton({ onAdd, label = '행 추가' }) {
  return (
    <Button variant="secondary" size="sm" label={label} icon={<Plus size={12} />} onClick={onAdd} />
  )
}

// ─── 주의사항 ────────────────────────────────────────────────
function CautionsEditor({ items, onChange }) {
  const update = (i, v) => onChange(items.map((x, idx) => idx === i ? v : x))
  const add    = () => onChange([...items, ''])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      {items.map((c, i) => (
        <ListRow key={i} onRemove={() => remove(i)}>
          <Textarea
            value={c}
            onChange={e => update(i, e.target.value)}
            rows={2}
            placeholder="예: 병합 작업 전 FROM/TO 회원을 반드시 재확인하세요."
          />
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="주의사항 추가" />
    </div>
  )
}

// ─── 처리 절차 ───────────────────────────────────────────────
function StepsEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ title: '', desc: '' })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      {items.map((s, i) => (
        <ListRow key={s._id ?? i} onRemove={() => remove(i)}>
          <div className="ep-row-head">
            <Badge label={`단계 ${i + 1}`} variant="neutral" />
            <Input
              value={s.title}
              onChange={e => update(i, 'title', e.target.value)}
              placeholder="단계 제목"
              className="font-medium"
            />
          </div>
          <Textarea
            value={s.desc}
            onChange={e => update(i, 'desc', e.target.value)}
            rows={2}
            placeholder="단계별 상세 설명"
          />
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="단계 추가" />
    </div>
  )
}

// ─── 주요 항목 (mainItemsTable) ──────────────────────────────
function MainItemsEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ field: '', desc: '', required: false })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <ListRow key={it._id ?? i} onRemove={() => remove(i)}>
          <div className="grid grid-cols-12 gap-2">
            <Input
              className="col-span-3"
              value={it.field}
              onChange={e => update(i, 'field', e.target.value)}
              placeholder="항목명"
            />
            <Textarea
              className="col-span-7"
              rows={1}
              value={it.desc}
              onChange={e => update(i, 'desc', e.target.value)}
              placeholder="설명"
            />
            <label className="col-span-2 flex items-center gap-2 text-xs">
              <Checkbox
                checked={it.required}
                onCheckedChange={v => update(i, 'required', !!v)}
              />
              필수
            </label>
          </div>
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="항목 추가" />
    </div>
  )
}

// ─── 케이스 ──────────────────────────────────────────────────
function CasesEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ label: '', action: '', note: '' })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      {items.map((c, i) => (
        <ListRow key={c._id ?? i} onRemove={() => remove(i)}>
          <div className="ep-row-head">
            <Badge label={`Case ${i + 1}`} variant="neutral" />
            <Input
              value={c.label}
              onChange={e => update(i, 'label', e.target.value)}
              placeholder="케이스 라벨"
              className="font-medium"
            />
          </div>
          <Textarea
            value={c.action}
            onChange={e => update(i, 'action', e.target.value)}
            rows={2}
            placeholder="대응 방법"
          />
          <Input
            value={c.note}
            onChange={e => update(i, 'note', e.target.value)}
            placeholder="Note (선택)"
            className="text-xs"
          />
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="케이스 추가" />
    </div>
  )
}

// ─── 판단 기준 (decisionTable) ──────────────────────────────
function DecisionTableEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ cond: '', action: '', note: '', status: 'safe' })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      {items.map((r, i) => (
        <ListRow key={r._id ?? i} onRemove={() => remove(i)}>
          <div className="grid grid-cols-12 gap-2">
            <Input
              className="col-span-4"
              value={r.cond}
              onChange={e => update(i, 'cond', e.target.value)}
              placeholder="조건"
            />
            <Input
              className="col-span-4"
              value={r.action}
              onChange={e => update(i, 'action', e.target.value)}
              placeholder="처리"
            />
            <Input
              className="col-span-2"
              value={r.note}
              onChange={e => update(i, 'note', e.target.value)}
              placeholder="비고"
            />
            <Select value={r.status} onValueChange={v => update(i, 'status', v)}>
              <SelectTrigger className="col-span-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS_FOR_DECISION.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="판단 행 추가" />
    </div>
  )
}

// ─── 트러블슈팅 (troubleTable) ──────────────────────────────
function TroubleTableEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ issue: '', cause: '', solution: '', severity: 'medium' })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      {items.map((r, i) => (
        <ListRow key={r._id ?? i} onRemove={() => remove(i)}>
          <div className="grid grid-cols-12 gap-2">
            <Input
              className="col-span-3"
              value={r.issue}
              onChange={e => update(i, 'issue', e.target.value)}
              placeholder="오류"
            />
            <Input
              className="col-span-3"
              value={r.cause}
              onChange={e => update(i, 'cause', e.target.value)}
              placeholder="원인"
            />
            <Input
              className="col-span-4"
              value={r.solution}
              onChange={e => update(i, 'solution', e.target.value)}
              placeholder="해결"
            />
            <Select value={r.severity} onValueChange={v => update(i, 'severity', v)}>
              <SelectTrigger className="col-span-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="오류 행 추가" />
    </div>
  )
}

// ─── 응답 스크립트 ──────────────────────────────────────────
function ResponsesEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ scenario: '', script: '' })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      {items.map((r, i) => (
        <ListRow key={r._id ?? i} onRemove={() => remove(i)}>
          <div className="ep-row-head">
            <Badge label={`시나리오 ${i + 1}`} variant="neutral" />
            <Input
              value={r.scenario}
              onChange={e => update(i, 'scenario', e.target.value)}
              placeholder="시나리오 (예: 환불 거절 항의)"
              className="font-medium"
            />
          </div>
          <Textarea
            value={r.script}
            onChange={e => update(i, 'script', e.target.value)}
            rows={3}
            placeholder='응답 스크립트 (예: "학원법 제18조에 따라...")'
          />
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="시나리오 추가" />
    </div>
  )
}

// ─── 참조 데이터 (referenceData) ────────────────────────────
function ReferenceDataEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ term: '', definition: '' })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      {items.map((r, i) => (
        <ListRow key={r._id ?? i} onRemove={() => remove(i)}>
          <div className="grid grid-cols-12 gap-2">
            <Input
              className="col-span-3 font-mono"
              value={r.term}
              onChange={e => update(i, 'term', e.target.value)}
              placeholder="용어"
            />
            <Textarea
              className="col-span-9"
              rows={1}
              value={r.definition}
              onChange={e => update(i, 'definition', e.target.value)}
              placeholder="정의"
            />
          </div>
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="용어 추가" />
    </div>
  )
}

// ─── 정책 비교 (policyDiff) ────────────────────────────────
function PolicyDiffEditor({ value, onChange }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">변경 전</Label>
        <Textarea
          rows={4}
          value={value.before}
          onChange={e => onChange({ ...value, before: e.target.value })}
          placeholder="변경 전 정책 내용"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-primary">변경 후</Label>
        <Textarea
          rows={4}
          value={value.after}
          onChange={e => onChange({ ...value, after: e.target.value })}
          placeholder="변경 후 정책 내용"
          className="border-primary/30"
        />
      </div>
    </div>
  )
}

// ─── 미리보기 ──────────────────────────────────────────────
function PreviewPane({ meta, content, sections }) {
  return (
    <article className="prose-ams">
      <Heading level={1}>{meta.title || '(제목 없음)'}</Heading>
      <div className="ep-preview-meta">
        <Badge label={meta.type} variant={toTypeVariant(meta.type)} />
        <Text type="supporting">{meta.module}</Text>
        <Text type="supporting">·</Text>
        <Text type="supporting">{STATUS_LABEL[meta.status] || meta.status}</Text>
        {meta.version && (
          <>
            <Text type="supporting">·</Text>
            <Text type="supporting" hasTabularNumbers>{meta.version}</Text>
          </>
        )}
      </div>
      {meta.tldr && (
        <Card className="ep-preview-tldr" padding={0}>
          <div className="ep-preview-tldr-body">
            <Text type="body">{meta.tldr}</Text>
          </div>
        </Card>
      )}
      {sections.includes('cautions') && content.cautions.some(Boolean) && (
        <Card className="ep-preview-caution" padding={0}>
          <div className="ep-preview-caution-head">
            <Text weight="semibold">반드시 확인하세요</Text>
          </div>
          <ul className="ep-preview-caution-list">
            {content.cautions.filter(Boolean).map((c, i) => (
              <li key={i}>
                <span>•</span>
                <Text type="body">{c}</Text>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Text type="supporting" className="ep-preview-note">
        ※ 본문 미리보기는 발행 시 GuidePage 구조로 렌더링됩니다.
      </Text>
    </article>
  )
}

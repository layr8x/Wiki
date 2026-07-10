// src/pages/EditorPage.jsx
// 구조: 좌측 사이드바(가이드 리스트) + 우측 편집 영역
// 발행된 가이드 페이지(GuidePage)의 모든 섹션을 type별로 노출하여 편집할 수 있도록 구성
//
// Astryx(Meta 디자인시스템) 마이그레이션 — 이 페이지는 App.jsx에서 AstryxAppFrame 밖의
// standalone 라우트(/editor)로 렌더되므로 AstryxThemeRegion 으로 자체 <Theme> 영역을 연다.
//   - 폼 컨트롤 포함 전체가 Astryx primitive (TextInput/TextArea/Selector/CheckboxInput/
//     TabList+Tab/Dialog) — shadcn 없음. value/onChange/자동저장 연동은 100% 동일 로직 유지,
//     시그니처만 Astryx 규약((value)=>void)에 맞춤.
//   - Sheet(모바일 템플릿 선택·버전 이력)는 Astryx에 슬라이드 패널 primitive가 없어
//     Dialog(표준 중앙 모달) + Layout/LayoutContent(헤더·스크롤 본문 구성)로 대체.
//   - 마크다운 에디터 로직(자동저장·미리보기·행 추가/삭제 등)과 헤더/툴바·섹션 카드 등
//     이미 Astryx로 돼있던 크롬은 그대로 유지.
import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAutosave } from '@/hooks/useAutosave'
import { useIsMobile } from '@/hooks/use-mobile'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchGuide, upsertGuide } from '@/lib/db'
import { useToast } from '@astryxdesign/core/Toast'
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
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'

import { VStack } from '@astryxdesign/core/VStack'
import { Grid, GridSpan } from '@astryxdesign/core/Grid'
import { Card } from '@astryxdesign/core/Card'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Divider } from '@astryxdesign/core/Divider'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Selector } from '@astryxdesign/core/Selector'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { TabList, Tab } from '@astryxdesign/core/TabList'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'

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
  const toast = useToast()
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
      body: '가이드를 불러오지 못했습니다 - ' + (loadError?.message || '네트워크 또는 권한을 확인해 주세요.'),
      type: 'error',
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
  const isMobile = useIsMobile()
  // 본문/메타 정보 탭 — Astryx TabList는 완전 제어형이라 로컬 상태로 관리
  const [activeTab, setActiveTab] = useState('content')
  // 모바일 "가이드 타입 선택" 드로어 / "버전 이력" 드로어 — Astryx Dialog는 완전 제어형
  const [mobileTemplateOpen, setMobileTemplateOpen] = useState(false)
  const [versionOpen, setVersionOpen] = useState(false)

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
        body: nextStatus === 'published' ? '가이드를 발행했습니다.' : '임시저장되었습니다.',
      })
      if (nextStatus === 'published') navigate(`/guides/${saved.id}`)
    },
    onError: (err) => {
      toast({ body: '저장 실패 - ' + String(err?.message || err), type: 'error' })
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
    if (err) { toast({ body: '발행 불가 - ' + err, type: 'error' }); return }
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
    setMobileTemplateOpen(false)
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
        className={`ep-tpl-card${isSelected ? ' is-selected' : ''}`}
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
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                className="ep-mobile-only"
                label="가이드 타입 선택"
                icon={<ListChecks size={15} />}
                onClick={() => setMobileTemplateOpen(true)}
              />
              <Dialog isOpen={mobileTemplateOpen} onOpenChange={setMobileTemplateOpen} width={340}>
                <Layout
                  header={
                    <DialogHeader
                      title="가이드 타입 선택"
                      subtitle="선택한 타입에 맞는 섹션이 본문에 자동 구성됩니다"
                      onOpenChange={setMobileTemplateOpen}
                    />
                  }
                  content={<LayoutContent>{templateButtons}</LayoutContent>}
                />
              </Dialog>
              <Hash size={14} className="ep-hash" />
              <Text
                weight="medium"
                maxLines={1}
                className={`ep-title${!meta.title ? ' is-empty' : ''}`}
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
              <Button
                variant="ghost"
                size="sm"
                isIconOnly={isMobile}
                label="버전 이력"
                icon={<History size={14} />}
                tooltip={isMobile ? '버전 이력' : undefined}
                onClick={() => setVersionOpen(true)}
              />
              <Dialog isOpen={versionOpen} onOpenChange={setVersionOpen} width={420}>
                <Layout
                  header={<DialogHeader title="버전 이력" onOpenChange={setVersionOpen} />}
                  content={
                    <LayoutContent>
                      <VStack gap={3}>
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
                    </LayoutContent>
                  }
                />
              </Dialog>
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
                <TabList value={activeTab} onChange={setActiveTab} hasDivider>
                  <Tab value="content" label="본문" />
                  <Tab value="meta" label="메타 정보" />
                </TabList>

                {/* 본문 탭 */}
                {activeTab === 'content' && (
                  <div className="ep-tab-body">
                    {preview ? (
                      <PreviewPane meta={meta} content={content} sections={sections} />
                    ) : (
                      <>
                        {/* 제목 */}
                        <div className="ep-field">
                          <TextInput
                            label="제목"
                            size="lg"
                            value={meta.title}
                            onChange={v => setMeta(m => ({ ...m, title: v }))}
                          />
                        </div>

                        {/* 핵심 요약 (모든 type 공통) */}
                        <SectionFrame title="핵심 요약" desc="이 가이드가 어떤 문제를 해결하는지 한 문단으로 요약">
                          <TextArea
                            label="핵심 요약"
                            isLabelHidden
                            placeholder="예: 학생이 마이클래스에서 직접 수강정보 연동을 하지 못하는 경우..."
                            value={meta.tldr}
                            onChange={v => setMeta(m => ({ ...m, tldr: v }))}
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
                  </div>
                )}

                {/* 메타 정보 탭 */}
                {activeTab === 'meta' && (
                  <div className="ep-tab-body">
                    <Grid columns={{ minWidth: 240 }} gap={4}>
                      <Selector
                        label="모듈"
                        options={MODULES}
                        value={meta.module}
                        onChange={v => setMeta(m => ({ ...m, module: v }))}
                      />
                      <Selector
                        label="유형"
                        options={GUIDE_TYPES}
                        value={meta.type}
                        onChange={v => setMeta(m => ({ ...m, type: v }))}
                        description="유형 변경 시 본문 탭에 노출되는 섹션이 자동 변경됩니다."
                      />
                      <Selector
                        label="상태"
                        options={STATUS_OPTIONS}
                        value={meta.status}
                        onChange={v => setMeta(m => ({ ...m, status: v }))}
                      />
                      <TextInput
                        label="대상 (쉼표 구분)"
                        placeholder="예: 운영자, 실장"
                        value={meta.targets}
                        onChange={v => setMeta(m => ({ ...m, targets: v }))}
                      />
                      <TextInput
                        label="버전"
                        placeholder="예: v1.0"
                        value={meta.version}
                        onChange={v => setMeta(m => ({ ...m, version: v }))}
                      />
                      <TextInput
                        label="Confluence Page ID"
                        placeholder="예: 1815216142"
                        value={meta.confluenceId}
                        onChange={v => setMeta(m => ({ ...m, confluenceId: v }))}
                      />
                    </Grid>
                  </div>
                )}
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
    <VStack gap={2}>
      {items.map((c, i) => (
        <ListRow key={i} onRemove={() => remove(i)}>
          <TextArea
            label={`주의사항 ${i + 1}`}
            isLabelHidden
            value={c}
            onChange={v => update(i, v)}
            rows={2}
            placeholder="예: 병합 작업 전 FROM/TO 회원을 반드시 재확인하세요."
          />
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="주의사항 추가" />
    </VStack>
  )
}

// ─── 처리 절차 ───────────────────────────────────────────────
function StepsEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ title: '', desc: '' })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <VStack gap={2}>
      {items.map((s, i) => (
        <ListRow key={s._id ?? i} onRemove={() => remove(i)}>
          <div className="ep-row-head">
            <Badge label={`단계 ${i + 1}`} variant="neutral" />
            <TextInput
              className="ep-row-fill"
              label={`단계 ${i + 1} 제목`}
              isLabelHidden
              value={s.title}
              onChange={v => update(i, 'title', v)}
              placeholder="단계 제목"
            />
          </div>
          <TextArea
            label={`단계 ${i + 1} 설명`}
            isLabelHidden
            value={s.desc}
            onChange={v => update(i, 'desc', v)}
            rows={2}
            placeholder="단계별 상세 설명"
          />
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="단계 추가" />
    </VStack>
  )
}

// ─── 주요 항목 (mainItemsTable) ──────────────────────────────
function MainItemsEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ field: '', desc: '', required: false })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <VStack gap={2}>
      {items.map((it, i) => (
        <ListRow key={it._id ?? i} onRemove={() => remove(i)}>
          <Grid columns={12} gap={2}>
            <GridSpan columns={3}>
              <TextInput
                label={`항목 ${i + 1} 항목명`}
                isLabelHidden
                value={it.field}
                onChange={v => update(i, 'field', v)}
                placeholder="항목명"
              />
            </GridSpan>
            <GridSpan columns={7}>
              <TextArea
                label={`항목 ${i + 1} 설명`}
                isLabelHidden
                rows={1}
                value={it.desc}
                onChange={v => update(i, 'desc', v)}
                placeholder="설명"
              />
            </GridSpan>
            <GridSpan columns={2}>
              <CheckboxInput
                label="필수"
                size="sm"
                value={it.required}
                onChange={v => update(i, 'required', v)}
              />
            </GridSpan>
          </Grid>
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="항목 추가" />
    </VStack>
  )
}

// ─── 케이스 ──────────────────────────────────────────────────
function CasesEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ label: '', action: '', note: '' })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <VStack gap={2}>
      {items.map((c, i) => (
        <ListRow key={c._id ?? i} onRemove={() => remove(i)}>
          <div className="ep-row-head">
            <Badge label={`Case ${i + 1}`} variant="neutral" />
            <TextInput
              className="ep-row-fill"
              label={`Case ${i + 1} 라벨`}
              isLabelHidden
              value={c.label}
              onChange={v => update(i, 'label', v)}
              placeholder="케이스 라벨"
            />
          </div>
          <TextArea
            label={`Case ${i + 1} 대응 방법`}
            isLabelHidden
            value={c.action}
            onChange={v => update(i, 'action', v)}
            rows={2}
            placeholder="대응 방법"
          />
          <TextInput
            label={`Case ${i + 1} 비고`}
            isLabelHidden
            isOptional
            value={c.note}
            onChange={v => update(i, 'note', v)}
            placeholder="Note (선택)"
          />
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="케이스 추가" />
    </VStack>
  )
}

// ─── 판단 기준 (decisionTable) ──────────────────────────────
function DecisionTableEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ cond: '', action: '', note: '', status: 'safe' })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <VStack gap={2}>
      {items.map((r, i) => (
        <ListRow key={r._id ?? i} onRemove={() => remove(i)}>
          <Grid columns={12} gap={2}>
            <GridSpan columns={4}>
              <TextInput
                label={`판단 ${i + 1} 조건`}
                isLabelHidden
                value={r.cond}
                onChange={v => update(i, 'cond', v)}
                placeholder="조건"
              />
            </GridSpan>
            <GridSpan columns={4}>
              <TextInput
                label={`판단 ${i + 1} 처리`}
                isLabelHidden
                value={r.action}
                onChange={v => update(i, 'action', v)}
                placeholder="처리"
              />
            </GridSpan>
            <GridSpan columns={2}>
              <TextInput
                label={`판단 ${i + 1} 비고`}
                isLabelHidden
                value={r.note}
                onChange={v => update(i, 'note', v)}
                placeholder="비고"
              />
            </GridSpan>
            <GridSpan columns={2}>
              <Selector
                label={`판단 ${i + 1} 상태`}
                isLabelHidden
                options={STATUS_OPTIONS_FOR_DECISION}
                value={r.status}
                onChange={v => update(i, 'status', v)}
              />
            </GridSpan>
          </Grid>
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="판단 행 추가" />
    </VStack>
  )
}

// ─── 트러블슈팅 (troubleTable) ──────────────────────────────
function TroubleTableEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ issue: '', cause: '', solution: '', severity: 'medium' })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <VStack gap={2}>
      {items.map((r, i) => (
        <ListRow key={r._id ?? i} onRemove={() => remove(i)}>
          <Grid columns={12} gap={2}>
            <GridSpan columns={3}>
              <TextInput
                label={`오류 ${i + 1}`}
                isLabelHidden
                value={r.issue}
                onChange={v => update(i, 'issue', v)}
                placeholder="오류"
              />
            </GridSpan>
            <GridSpan columns={3}>
              <TextInput
                label={`오류 ${i + 1} 원인`}
                isLabelHidden
                value={r.cause}
                onChange={v => update(i, 'cause', v)}
                placeholder="원인"
              />
            </GridSpan>
            <GridSpan columns={4}>
              <TextInput
                label={`오류 ${i + 1} 해결`}
                isLabelHidden
                value={r.solution}
                onChange={v => update(i, 'solution', v)}
                placeholder="해결"
              />
            </GridSpan>
            <GridSpan columns={2}>
              <Selector
                label={`오류 ${i + 1} 심각도`}
                isLabelHidden
                options={SEVERITY_OPTIONS}
                value={r.severity}
                onChange={v => update(i, 'severity', v)}
              />
            </GridSpan>
          </Grid>
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="오류 행 추가" />
    </VStack>
  )
}

// ─── 응답 스크립트 ──────────────────────────────────────────
function ResponsesEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ scenario: '', script: '' })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <VStack gap={2}>
      {items.map((r, i) => (
        <ListRow key={r._id ?? i} onRemove={() => remove(i)}>
          <div className="ep-row-head">
            <Badge label={`시나리오 ${i + 1}`} variant="neutral" />
            <TextInput
              className="ep-row-fill"
              label={`시나리오 ${i + 1}`}
              isLabelHidden
              value={r.scenario}
              onChange={v => update(i, 'scenario', v)}
              placeholder="시나리오 (예: 환불 거절 항의)"
            />
          </div>
          <TextArea
            label={`시나리오 ${i + 1} 응답 스크립트`}
            isLabelHidden
            value={r.script}
            onChange={v => update(i, 'script', v)}
            rows={3}
            placeholder='응답 스크립트 (예: "학원법 제18조에 따라...")'
          />
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="시나리오 추가" />
    </VStack>
  )
}

// ─── 참조 데이터 (referenceData) ────────────────────────────
function ReferenceDataEditor({ items, onChange }) {
  const update = (i, key, v) => onChange(items.map((x, idx) => idx === i ? { ...x, [key]: v } : x))
  const add    = () => onChange([...items, withId({ term: '', definition: '' })])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <VStack gap={2}>
      {items.map((r, i) => (
        <ListRow key={r._id ?? i} onRemove={() => remove(i)}>
          <Grid columns={12} gap={2}>
            <GridSpan columns={3}>
              <TextInput
                label={`용어 ${i + 1}`}
                isLabelHidden
                className="ep-mono"
                value={r.term}
                onChange={v => update(i, 'term', v)}
                placeholder="용어"
              />
            </GridSpan>
            <GridSpan columns={9}>
              <TextArea
                label={`용어 ${i + 1} 정의`}
                isLabelHidden
                rows={1}
                value={r.definition}
                onChange={v => update(i, 'definition', v)}
                placeholder="정의"
              />
            </GridSpan>
          </Grid>
        </ListRow>
      ))}
      <AddRowButton onAdd={add} label="용어 추가" />
    </VStack>
  )
}

// ─── 정책 비교 (policyDiff) ────────────────────────────────
function PolicyDiffEditor({ value, onChange }) {
  return (
    <Grid columns={{ minWidth: 260 }} gap={3}>
      <TextArea
        label="변경 전"
        rows={4}
        value={value.before}
        onChange={v => onChange({ ...value, before: v })}
        placeholder="변경 전 정책 내용"
      />
      <TextArea
        label="변경 후"
        rows={4}
        value={value.after}
        onChange={v => onChange({ ...value, after: v })}
        placeholder="변경 후 정책 내용"
      />
    </Grid>
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

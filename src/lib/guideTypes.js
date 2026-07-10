// src/lib/guideTypes.js
// 가이드 타입·심각도·판단결과 단일 정의.
// 페이지별로 라벨/아이콘/뱃지 variant 가 드리프트되지 않도록 여기서만 관리한다.
import {
  BookOpen,
  GitBranch,
  FileText,
  Warning,
  ChatText,
  SealCheck,
} from '@phosphor-icons/react'

// ─── 가이드 타입 ──────────────────────────────────────────────────────────
// key = GUIDES[*].type 에 저장되는 문자열
// variant = Astryx Badge variant
// icon = @phosphor-icons/react 컴포넌트 참조
// tone = 비-뱃지 컨텍스트(검색 오버레이 아이콘 칩 등) 용 틴트 pair
export const GUIDE_TYPES = {
  SOP: {
    id: 'SOP',
    label: '절차형',
    shortLabel: '절차',
    variant: 'sop',
    icon: BookOpen,
    tone: { text: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-500/10' },
  },
  DECISION: {
    id: 'DECISION',
    label: '판단분기',
    shortLabel: '판단',
    variant: 'decision',
    icon: GitBranch,
    tone: { text: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-500/10' },
  },
  REFERENCE: {
    id: 'REFERENCE',
    label: '참조형',
    shortLabel: '참조',
    variant: 'reference',
    icon: FileText,
    tone: { text: 'text-slate-600 dark:text-slate-400',     bg: 'bg-slate-500/10' },
  },
  TROUBLE: {
    id: 'TROUBLE',
    label: '트러블슈팅',
    shortLabel: '트러블',
    variant: 'trouble',
    icon: Warning,
    tone: { text: 'text-red-600 dark:text-red-400',         bg: 'bg-red-500/10' },
  },
  RESPONSE: {
    id: 'RESPONSE',
    label: '대응매뉴얼',
    shortLabel: '대응',
    variant: 'response',
    icon: ChatText,
    tone: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  },
  POLICY: {
    id: 'POLICY',
    label: '정책공지',
    shortLabel: '정책',
    variant: 'policy',
    icon: SealCheck,
    tone: { text: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-500/10' },
  },
}

// 필터/선택 UI 용 "전체" 항목 포함 리스트
export const GUIDE_TYPE_FILTER = [
  { value: 'ALL', label: '전체' },
  ...Object.values(GUIDE_TYPES).map(t => ({ value: t.id, label: t.shortLabel })),
]

// 타입 키 → 메타. 미지정/미지원 키는 SOP 로 폴백.
export function getGuideType(key) {
  return GUIDE_TYPES[key] ?? GUIDE_TYPES.SOP
}

// ─── 심각도 (트러블슈팅) ──────────────────────────────────────────────────
export const SEVERITY = {
  critical: { id: 'critical', label: '긴급',   variant: 'critical' },
  high:     { id: 'high',     label: '높음',   variant: 'high' },
  medium:   { id: 'medium',   label: '보통',   variant: 'medium' },
  low:      { id: 'low',      label: '낮음',   variant: 'low' },
}

// ─── 판단 결과 (DECISION 타입) ────────────────────────────────────────────
export const DECISION_STATUS = {
  safe:   { id: 'safe',   label: '허용',   variant: 'safe' },
  warn:   { id: 'warn',   label: '주의',   variant: 'warn' },
  danger: { id: 'danger', label: '불가',   variant: 'danger' },
}

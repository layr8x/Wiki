// src/components/search/NoResultFallback.jsx
// 검색 결과가 0건일 때 노출되는 폴백 — 관련 가이드 제안 + 개선 요청 퀵 폼.
//
// 제안 로직: bigram 기반 단순 유사도(제목/tldr/module/targets 연결 텍스트 vs 질의어)
//  - 외부 라이브러리 없이 동작 (검색 오버레이 번들에 부담 없음)
//  - 점수 0 제외, 상위 5개까지 노출
//
// 개선 요청: localStorage 큐(`ams-wiki:feedback:queue:v1`)에 적재.
//  - 백엔드 연결 전 임시 저장소. 제출 형식은 서버 API 와 동일 스키마로 맞춤.

import React, { useMemo, useState } from 'react'
import {
  Compass,
  PaperPlaneTilt,
  SealCheck,
  FileText,
  Sparkle,
} from '@phosphor-icons/react'
import { GUIDES } from '@/data/mockData'
import { useAiSearch } from '@/hooks/useAiSearch'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { STORAGE_KEYS } from '@/lib/storageKeys'

const FEEDBACK_QUEUE_KEY = STORAGE_KEYS.feedbackQueue

function bigrams(str) {
  const s = (str || '').toLowerCase().replace(/\s+/g, '')
  if (s.length < 2) return new Set(s ? [s] : [])
  const out = new Set()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  return out
}

function similarity(a, b) {
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return (2 * inter) / (A.size + B.size) // Dice 계수
}

function suggestRelatedGuides(query, limit = 5) {
  const q = (query || '').trim()
  if (!q) return []
  const scored = Object.entries(GUIDES).map(([id, g]) => {
    const bag = [g.title, g.tldr, g.module, ...(g.targets || [])].filter(Boolean).join(' ')
    return { id, guide: g, score: similarity(q, bag) }
  })
  return scored
    .filter(s => s.score > 0.05)
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

export default function NoResultFallback({ query, onGoTo, onGoToRoute, onNavigateFeedback }) {
  const related = useMemo(() => suggestRelatedGuides(query), [query])
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
    <div className="px-3 py-4 space-y-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Compass size={20} className="text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">&ldquo;{query}&rdquo; 에 정확히 일치하는 가이드가 없습니다</p>
        <p className="text-xs text-muted-foreground">유사 주제 가이드를 대신 확인하거나, 필요한 가이드를 요청해 주세요</p>
      </div>

      {ai.status === 'loading' && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
          <Sparkle size={15} weight="fill" className="animate-pulse text-primary" />
          AI가 위키 전체에서 답을 찾는 중…
        </div>
      )}

      {ai.status === 'ready' && ai.answer && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Sparkle size={13} weight="fill" /> AI 검색 답변
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{ai.answer}</p>
          {ai.sources?.length > 0 && (
            <ul className="space-y-1 pt-0.5">
              {ai.sources.map(s => (
                <li key={s.id}>
                  <button
                    onClick={() => goRoute(s.route)}
                    className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
                  >
                    <FileText size={12} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{s.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground/70">{s.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {related.length > 0 && (
        <div>
          <p className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">이런 가이드는 어떠세요?</p>
          <ul className="space-y-1">
            {related.map(({ id, guide, score }) => (
              <li key={id}>
                <button
                  onClick={() => onGoTo(id)}
                  className="flex w-full items-start gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2 text-left hover:bg-accent transition-colors"
                >
                  <FileText size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{guide.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{guide.module} · {guide.tldr?.split('\n')[0]?.slice(0, 56)}</p>
                  </div>
                  <span className="shrink-0 self-center text-xs text-muted-foreground/60">{Math.round(score * 100)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">가이드 추가 요청</p>
          {submitted && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <SealCheck size={11} weight="fill" />
              접수 완료
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          검색한 키워드 <span className="font-medium text-foreground">&ldquo;{query}&rdquo;</span>{' '}
          관련 가이드가 필요하신가요? 어떤 내용이 필요한지 알려주시면 우선 검토합니다.
        </p>
        <Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          disabled={submitted}
          placeholder="예: 신규 강사 첫 출근일 OT 절차가 필요합니다"
          rows={2}
          maxLength={500}
          className="mt-2 resize-none text-sm"
        />
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onNavigateFeedback(query)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            상세 요청 작성 →
          </button>
          <Button type="submit" size="sm" disabled={submitting || submitted}>
            <PaperPlaneTilt size={12} weight="fill" />
            {submitted ? '제출됨' : submitting ? '전송 중...' : '요청 보내기'}
          </Button>
        </div>
      </form>
    </div>
  )
}

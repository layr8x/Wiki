// src/hooks/useAiSearch.js
// 질의어로 /api/ai-search 를 호출해 "의미 기반" 답변 + 근거 문서를 가져온다.
// (키워드 검색이 0건일 때 폴백으로 사용 — 위키 전체 카탈로그 181개를 AI가 의미로 검색)
//
// - 500ms 디바운스 + AbortController 로 이전 요청 취소
// - 질의가 2글자 미만이거나 enabled=false 면 호출하지 않음
// - 서버가 ANTHROPIC_API_KEY 미설정(503)이면 조용히 비활성화 (세션 내 재시도 차단)

import { useEffect, useRef, useState } from 'react'
import { authHeaders } from '@/lib/apiAuth'

const DEBOUNCE_MS = 500
const MIN_QUERY_LEN = 2

export function useAiSearch(query, enabled = true) {
  const [state, setState] = useState({ status: 'idle', answer: '', sources: [], error: null })
  const abortRef = useRef(null)
  const disabledRef = useRef(false)

  useEffect(() => {
    const q = (query || '').trim()
    if (disabledRef.current) return

    if (!enabled || q.length < MIN_QUERY_LEN) {
      const t = setTimeout(() => setState({ status: 'idle', answer: '', sources: [], error: null }), 0)
      return () => clearTimeout(t)
    }

    const ctrl = new AbortController()
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = ctrl

    const timer = setTimeout(async () => {
      setState(prev => ({ ...prev, status: 'loading', error: null }))
      try {
        const res = await fetch('/api/search-summary', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ mode: 'ai-search', query: q }),
          signal: ctrl.signal,
        })
        if (res.status === 503) {
          disabledRef.current = true
          setState({ status: 'disabled', answer: '', sources: [], error: null })
          return
        }
        if (!res.ok) {
          setState({ status: 'error', answer: '', sources: [], error: `HTTP ${res.status}` })
          return
        }
        const data = await res.json()
        if (!data?.answer) {
          setState({ status: 'empty', answer: '', sources: [], error: null })
          return
        }
        setState({ status: 'ready', answer: data.answer, sources: data.sources || [], error: null })
      } catch (err) {
        if (err?.name === 'AbortError') return
        setState({ status: 'error', answer: '', sources: [], error: String(err?.message || err) })
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query, enabled])

  return state
}

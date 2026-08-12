// src/hooks/useSearchSummary.js
// 검색어 + 결과 상위 N개를 기반으로 /api/search-summary 를 호출해 AI 요약을 가져온다.
// - 400ms 디바운스 + AbortController 로 이전 요청을 즉시 취소
// - 질의가 2글자 미만이거나 결과가 2개 미만이면 호출하지 않음
// - 서버가 ANTHROPIC_API_KEY 미설정(503)이면 조용히 비활성화 (hidden 상태)

import { useEffect, useRef, useState } from 'react'
import { authHeaders } from '@/lib/apiAuth'

const DEBOUNCE_MS = 400
const MIN_QUERY_LEN = 2
const MIN_RESULTS = 2
const MAX_GUIDES = 6

export function useSearchSummary(query, results) {
  const [state, setState] = useState({ status: 'idle', summary: '', sources: [], error: null })
  const abortRef = useRef(null)
  const disabledRef = useRef(false) // 서버가 비활성(키 미설정)이면 세션 내내 재시도 차단

  useEffect(() => {
    const q = (query || '').trim()
    if (disabledRef.current) return

    const tooShort = q.length < MIN_QUERY_LEN || !Array.isArray(results) || results.length < MIN_RESULTS

    // 상태 전이는 모두 타이머 콜백 안에서만 — 이펙트 본문에서 setState 금지 규칙 준수.
    if (tooShort) {
      const resetTimer = setTimeout(() => {
        setState({ status: 'idle', summary: '', sources: [], error: null })
      }, 0)
      return () => clearTimeout(resetTimer)
    }

    const guides = results.slice(0, MAX_GUIDES).map(g => ({
      id: g.id,
      title: g.title,
      tldr: g.tldr,
      module: g.module,
      type: g.type,
    }))

    const ctrl = new AbortController()
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = ctrl

    const timer = setTimeout(async () => {
      setState(prev => ({ ...prev, status: 'loading', error: null }))
      try {
        const res = await fetch('/api/search-summary', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ query: q, guides }),
          signal: ctrl.signal,
        })
        if (res.status === 503) {
          disabledRef.current = true
          setState({ status: 'disabled', summary: '', sources: [], error: null })
          return
        }
        if (!res.ok) {
          setState({ status: 'error', summary: '', sources: [], error: `HTTP ${res.status}` })
          return
        }
        const data = await res.json()
        if (!data?.summary) {
          setState({ status: 'empty', summary: '', sources: [], error: null })
          return
        }
        setState({ status: 'ready', summary: data.summary, sources: data.sources || [], error: null })
      } catch (err) {
        if (err?.name === 'AbortError') return
        setState({ status: 'error', summary: '', sources: [], error: String(err?.message || err) })
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query, results])

  return state
}

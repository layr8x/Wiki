// src/pages/admin/AdminJandiPage.jsx — /admin/jandi
// 잔디(JANDI) 3채널 대화 로그 뷰어 (jandi_messages, RLS anon read).
// 방별 단일 타임라인(카카오의 채팅별 스레드와 다름) + 검색/기간 + 현재필터 CSV.
import { useState } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase, isSupabaseEnabled } from '@/lib/supabase'
import { maskBody } from '@/lib/maskPII'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  MagnifyingGlass as Search,
  ChatText as MessageSquare,
  User,
  ArrowsClockwise as RefreshIcon,
  DownloadSimple as DownloadIcon,
} from '@phosphor-icons/react'

// 시드(jandi_channels)와 동일한 3개 방.
const CHANNELS = [
  { id: '31495011', label: '시대 APP 기획/문의' },
  { id: '31962045', label: '시대 APP 실험실' },
  { id: '33385655', label: '재종통합행정 + 플랫폼서비스실' },
]
const PAGE_SIZE = 50
const NOW_Y = new Date().getFullYear()
const YEARS = [NOW_Y, NOW_Y - 1, NOW_Y - 2]
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

const fmtKST = (iso) => {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso))
  } catch { return iso.slice(0, 16).replace('T', ' ') }
}
const fmtKstFull = (iso) => {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(iso)).replace('T', ' ')
  } catch { return iso }
}
const writerLabel = (m) => m.writer_name || (m.writer_id ? '멤버 ' + String(m.writer_id).slice(-6) : '알 수 없음')

// 최신순 정렬 + 댓글(스레드 답글)을 원글 아래로 묶기.
// reply_to_message_id 가 현재 로딩된 목록 안의 원글을 가리키면 그 아래 자식으로,
// 원글이 목록 밖(오래돼서 안 불러와짐)이면 독립 항목(orphan 표시)으로 취급.
// ⚠️ 그룹 정렬은 "원글 시각"이 아니라 "그룹 내 가장 최근 활동 시각" 기준 — 이 방은
// 댓글(답글)이 전체 메시지의 70%를 차지해, 원글 시각으로만 정렬하면 방금 달린 새 댓글이
// 훨씬 오래된 원글 위치에 묻혀 "최신순이 이상해 보이는" 문제가 생긴다(실사용 데이터로 확인).
function groupThreads(rows) {
  const byMessageId = new Map(rows.map((r) => [r.message_id, r]))
  const childrenOf = new Map()
  const roots = []
  for (const r of rows) {
    const parent = r.reply_to_message_id
    if (parent && parent !== r.message_id && byMessageId.has(parent)) {
      if (!childrenOf.has(parent)) childrenOf.set(parent, [])
      childrenOf.get(parent).push(r)
    } else {
      roots.push(r)
    }
  }
  const groups = roots.map((root) => {
    const children = (childrenOf.get(root.message_id) || [])
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')) // 스레드 내부는 오래된 순
    const latest = children.length ? children[children.length - 1].created_at : root.created_at
    return { root, children, latest: latest || root.created_at || '' }
  })
  groups.sort((a, b) => (b.latest || '').localeCompare(a.latest || '')) // 그룹은 최근 활동순
  return groups
}

function periodRange(year, month) {
  if (year === 'all') return null
  const y = Number(year)
  const pad = (n) => String(n).padStart(2, '0')
  if (month === 'all') {
    return {
      gte: new Date(y + '-01-01T00:00:00+09:00').toISOString(),
      lt: new Date((y + 1) + '-01-01T00:00:00+09:00').toISOString(),
    }
  }
  const m = Number(month)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return {
    gte: new Date(y + '-' + pad(m) + '-01T00:00:00+09:00').toISOString(),
    lt: new Date(ny + '-' + pad(nm) + '-01T00:00:00+09:00').toISOString(),
  }
}

function useChannelCount(roomId) {
  return useQuery({
    queryKey: ['jandi-count', roomId],
    enabled: isSupabaseEnabled,
    retry: 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('jandi_messages').select('*', { count: 'exact', head: true }).eq('room_id', roomId)
      if (error) throw error
      return count ?? 0
    },
  })
}

function useMessages(roomId, query, year, month, limit) {
  return useQuery({
    queryKey: ['jandi-messages', roomId, query, year, month, limit],
    enabled: isSupabaseEnabled,
    placeholderData: keepPreviousData,
    retry: 0,
    queryFn: async () => {
      let q = supabase
        .from('jandi_messages')
        .select('link_id, message_id, writer_id, writer_name, content_type, message, created_at, reply_to_message_id')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (query.trim()) q = q.ilike('message', '%' + query.trim() + '%')
      const range = periodRange(year, month)
      if (range) q = q.gte('created_at', range.gte).lt('created_at', range.lt)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })
}

function MessageRow({ m, isReply = false }) {
  return (
    <div className={'flex items-start gap-3 py-2' + (isReply ? ' pl-1' : '')}>
      <span className="w-20 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{fmtKST(m.created_at)}</span>
      <Badge variant="secondary" size="sm" className="mt-0.5 max-w-[140px] shrink-0 truncate">
        <User className="mr-1 size-3 shrink-0" />{writerLabel(m)}
      </Badge>
      {isReply && <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">↳ 댓글</span>}
      {!isReply && m.reply_to_message_id && (
        <span className="mt-0.5 shrink-0 text-xs text-muted-foreground" title="원글이 현재 목록 범위 밖입니다">💬 답글</span>
      )}
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-foreground">
        {maskBody(m.message) || <span className="text-muted-foreground">({m.content_type || '본문 없음'})</span>}
      </p>
    </div>
  )
}

function ChannelKpi({ ch }) {
  const { data, isLoading, isError } = useChannelCount(ch.id)
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{ch.label}</CardTitle>
        <MessageSquare className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-24" /> : (
          <div className="text-2xl font-semibold tabular-nums">
            {isError ? '—' : (data ?? 0).toLocaleString('ko-KR')}
            <span className="ml-1 text-sm font-normal text-muted-foreground">개</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

async function fetchAllForCsv({ roomId, query, year, month }) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from('jandi_messages')
      .select('link_id, writer_id, writer_name, content_type, message, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .range(from, from + 999)
    if (query.trim()) q = q.ilike('message', '%' + query.trim() + '%')
    const range = periodRange(year, month)
    if (range) q = q.gte('created_at', range.gte).lt('created_at', range.lt)
    const { data, error } = await q
    if (error) throw error
    if (!data || !data.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

function buildCsv(rows, channelLabel) {
  const head = ['채널', '시각(KST)', '작성자', '유형', '메시지']
  const esc = (v) => {
    const s = v == null ? '' : String(v).replace(/[\r\n]+/g, ' ')
    return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = [head.join(',')]
  for (const m of rows) {
    lines.push([
      channelLabel, fmtKstFull(m.created_at), writerLabel(m),
      m.content_type || '', maskBody(m.message) || '',
    ].map(esc).join(','))
  }
  return '﻿' + lines.join('\r\n')
}

function downloadBlob(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const selCls = 'h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-foreground/40'

export default function AdminJandiPage() {
  const [channel, setChannel] = useState(CHANNELS[0].id)
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('all')
  const [month, setMonth] = useState('all')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [csvLoading, setCsvLoading] = useState(false)

  const qc = useQueryClient()
  const { data: rows = [], isLoading, isFetching, isError, error } = useMessages(channel, query, year, month, limit)

  const reset = () => setLimit(PAGE_SIZE)
  const onChannel = (id) => { setChannel(id); reset() }
  const onSearch = (e) => { e.preventDefault(); setQuery(input); reset() }

  // 표시용: 최신순 정렬 + 댓글(스레드 답글)은 원글 아래로 그룹핑.
  const threads = groupThreads(rows)
  const channelLabel = CHANNELS.find((c) => c.id === channel)?.label || channel

  const onRefresh = () => {
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] || '').startsWith('jandi-') })
  }

  const onDownloadCsv = async () => {
    setCsvLoading(true)
    try {
      const all = await fetchAllForCsv({ roomId: channel, query, year, month })
      const csv = buildCsv(all, channelLabel)
      const today = new Date().toISOString().slice(0, 10)
      const tag = year === 'all' ? '전체기간' : (year + (month === 'all' ? '' : '-' + String(month).padStart(2, '0')))
      downloadBlob(csv, `jandi_${channelLabel}_${tag}_${today}.csv`)
    } catch (e) {
      alert('CSV 다운로드 실패: ' + (e?.message || e))
    } finally {
      setCsvLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">잔디 대화</h1>
        <p className="mt-1 text-sm text-muted-foreground">JANDI 3채널 실시간 수집 데이터 · 방별 타임라인</p>
      </header>

      {!isSupabaseEnabled && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Supabase 환경변수(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)가 설정되지 않았습니다.
        </CardContent></Card>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CHANNELS.map((ch) => <ChannelKpi key={ch.id} ch={ch} />)}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="채널 선택">
          {CHANNELS.map((ch) => (
            <button
              key={ch.id} onClick={() => onChannel(ch.id)} aria-pressed={channel === ch.id}
              className={'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors '
                + (channel === ch.id ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground')}
            >{ch.label}</button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <select className={selCls} value={year} onChange={(e) => { setYear(e.target.value); reset() }} aria-label="년도">
            <option value="all">전체기간</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select className={selCls} value={month} onChange={(e) => { setMonth(e.target.value); reset() }} disabled={year === 'all'} aria-label="월">
            <option value="all">전체월</option>
            {MONTHS.map((m) => <option key={m} value={m}>{Number(m)}월</option>)}
          </select>
        </div>

        <form onSubmit={onSearch} className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="메시지 검색 후 Enter"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-foreground/40" />
        </form>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">
            {channelLabel}{year !== 'all' ? ' · ' + year + '년' + (month !== 'all' ? ' ' + Number(month) + '월' : '') : ''}{query ? ' · "' + query + '"' : ''}
            {rows.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">{rows.length}개 메시지</span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {isFetching && !csvLoading && <span className="text-xs text-muted-foreground">불러오는 중…</span>}
            {csvLoading && <span className="text-xs text-muted-foreground">CSV 준비 중…</span>}
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isFetching}>
              <RefreshIcon className="mr-1 size-4" /> 새로고침
            </Button>
            <Button variant="outline" size="sm" onClick={onDownloadCsv} disabled={csvLoading || isLoading}>
              <DownloadIcon className="mr-1 size-4" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="py-10 text-center text-sm text-destructive">불러오기 실패: {error?.message || '오류'}</p>
          ) : isLoading ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : threads.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">조건에 맞는 메시지가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {threads.map(({ root, children }) => (
                <li key={root.link_id}>
                  <MessageRow m={root} />
                  {children.length > 0 && (
                    <ul className="ml-8 border-l border-border/40 pl-3">
                      {children.map((c) => <MessageRow key={c.link_id} m={c} isReply />)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!isLoading && !isError && rows.length >= limit && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>더 보기 (+{PAGE_SIZE})</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// src/pages/admin/AdminConsultsPage.jsx — /admin/consults
// 카카오 파트너센터 5채널 상담 로그 뷰어 (kakao_partner_messages, RLS authenticated read).
// 기능: 채팅별 스레드 그룹 + 새로고침 + 현재필터 전체 CSV 다운로드.
// 채널 정본: CLAUDE.md §16 (kakao_channel 테이블과 동일 목록 — 변경 시 함께 갱신).
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase, isSupabaseEnabled } from '@/lib/supabase'
import { maskBody, maskName } from '@/lib/maskPII'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  MagnifyingGlass as Search,
  ChatText as MessageSquare,
  User,
  Headset,
  Gear as Cog,
  ArrowsClockwise as RefreshIcon,
  DownloadSimple as DownloadIcon,
} from '@phosphor-icons/react'

const CHANNELS = [
  { id: '_VGAQn', label: '마이클래스' },
  { id: '_rcpPG', label: 'LIVE' },
  { id: '_TkpPG', label: 'LIVE 기술지원' },
  { id: '_xfxilXn', label: '콘텐츠' },
  { id: '_rkbcn', label: '통합로그인' },
]
const PAGE_SIZE = 50
const NOW_Y = new Date().getFullYear()
const YEARS = [NOW_Y, NOW_Y - 1, NOW_Y - 2]
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

const SENDER_META = {
  manager: { base: '상담원', variant: 'default', icon: Headset },
  user: { base: '고객', variant: 'secondary', icon: User },
  system: { base: '시스템', variant: 'outline', icon: Cog },
}

// 보낸이 표기: 상담원(차*희) / 고객(송유림) / 시스템
function senderText(m, nickMap) {
  const meta = SENDER_META[m.sender_type] || SENDER_META.system
  let name = ''
  if (m.sender_type === 'manager') name = m.manager_name || ''
  else if (m.sender_type === 'user') name = nickMap.get(String(m.chat_id)) || ''
  return name ? meta.base + '(' + name + ')' : meta.base
}

const fmtKST = (iso) => {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso))
  } catch { return iso.slice(0, 16).replace('T', ' ') }
}

// CSV 풀-덤프용 시각 포맷 (sv-SE = "YYYY-MM-DD HH:MM:SS")
const fmtKstFull = (iso) => {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(iso)).replace('T', ' ')
  } catch { return iso }
}

// 전체/년/월 → KST 기준 [gte, lt) ISO 범위
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

function useChannelCount(profileId) {
  return useQuery({
    queryKey: ['kakao-count', profileId],
    enabled: isSupabaseEnabled,
    retry: 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('kakao_partner_chats').select('*', { count: 'exact', head: true }).eq('profile_id', profileId)
      if (error) throw error
      return count ?? 0
    },
  })
}

function useNicknames(profileId) {
  return useQuery({
    queryKey: ['kakao-nick', profileId],
    enabled: isSupabaseEnabled,
    staleTime: 10 * 60 * 1000,
    retry: 0,
    queryFn: async () => {
      const map = new Map()
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('kakao_partner_chats').select('chat_id, nickname').eq('profile_id', profileId)
          .order('chat_id', { ascending: true }).range(from, from + 999)
        if (error) throw error
        if (!data || !data.length) break
        for (const r of data) map.set(String(r.chat_id), maskName(r.nickname || ''))
        if (data.length < 1000) break
      }
      return map
    },
  })
}

function useMessages(profileId, query, year, month, limit) {
  return useQuery({
    queryKey: ['kakao-messages', profileId, query, year, month, limit],
    enabled: isSupabaseEnabled,
    placeholderData: keepPreviousData,
    retry: 0,
    queryFn: async () => {
      let q = supabase
        .from('kakao_partner_messages')
        .select('log_id, chat_id, sender_type, message, message_type, sent_at, manager_name:raw->manager->>name')
        .eq('profile_id', profileId)
        .order('sent_at', { ascending: false })
        .limit(limit)
      if (query.trim()) q = q.ilike('message', '%' + query.trim() + '%')
      const range = periodRange(year, month)
      if (range) q = q.gte('sent_at', range.gte).lt('sent_at', range.lt)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })
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

// 현재 필터의 메시지를 1,000건씩 페이지네이션으로 전부 받아 CSV 빌드.
async function fetchAllForCsv({ profileId, query, year, month }) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from('kakao_partner_messages')
      .select('log_id, chat_id, sender_type, message, message_type, sent_at, manager_name:raw->manager->>name')
      .eq('profile_id', profileId)
      .order('sent_at', { ascending: false })
      .range(from, from + 999)
    if (query.trim()) q = q.ilike('message', '%' + query.trim() + '%')
    const range = periodRange(year, month)
    if (range) q = q.gte('sent_at', range.gte).lt('sent_at', range.lt)
    const { data, error } = await q
    if (error) throw error
    if (!data || !data.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

function buildCsv(rows, nickMap, channelLabel) {
  const head = ['채널', '시각(KST)', '채팅ID', '고객', '보낸이', '메시지유형', '메시지']
  const esc = (v) => {
    const s = v == null ? '' : String(v).replace(/[\r\n]+/g, ' ')
    return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = [head.join(',')]
  for (const m of rows) {
    const meta = SENDER_META[m.sender_type] || SENDER_META.system
    const managerName = m.sender_type === 'manager' ? (m.manager_name || '') : ''
    const sender = managerName ? meta.base + '(' + managerName + ')' : meta.base
    lines.push([
      channelLabel,
      fmtKstFull(m.sent_at),
      m.chat_id,
      nickMap.get(String(m.chat_id)) || '',
      sender,
      m.message_type || '',
      maskBody(m.message) || '',
    ].map(esc).join(','))
  }
  return '﻿' + lines.join('\r\n')
}

function downloadBlob(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const selCls = 'h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-foreground/40'

export default function AdminConsultsPage() {
  const [channel, setChannel] = useState(CHANNELS[0].id)
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('all')
  const [month, setMonth] = useState('all')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [csvLoading, setCsvLoading] = useState(false)

  const qc = useQueryClient()
  const { data: nickMap = new Map() } = useNicknames(channel)
  const { data: rows = [], isLoading, isFetching, isError, error } = useMessages(channel, query, year, month, limit)

  const reset = () => setLimit(PAGE_SIZE)
  const onChannel = (id) => { setChannel(id); reset() }
  const onSearch = (e) => { e.preventDefault(); setQuery(input); reset() }

  // 채팅별 스레드 그룹: 같은 chat_id 의 메시지를 시간 오름차순으로 묶고, 그룹은 최근 활동 기준 내림차순.
  const grouped = useMemo(() => {
    const map = new Map()
    for (const m of rows) {
      const key = String(m.chat_id)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(m)
    }
    const groups = []
    for (const [chatId, msgs] of map) {
      msgs.sort((a, b) => (a.sent_at || '').localeCompare(b.sent_at || ''))
      groups.push({
        chatId,
        messages: msgs,
        latestAt: msgs[msgs.length - 1]?.sent_at || '',
        count: msgs.length,
        nickname: nickMap.get(chatId) || '',
      })
    }
    groups.sort((a, b) => (b.latestAt || '').localeCompare(a.latestAt || ''))
    return groups
  }, [rows, nickMap])

  const channelLabel = CHANNELS.find((c) => c.id === channel)?.label || channel

  const onRefresh = () => {
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] || '').startsWith('kakao-') })
  }

  const onDownloadCsv = async () => {
    setCsvLoading(true)
    try {
      const all = await fetchAllForCsv({ profileId: channel, query, year, month })
      const csv = buildCsv(all, nickMap, channelLabel)
      const today = new Date().toISOString().slice(0, 10)
      const tag = year === 'all' ? '전체기간' : (year + (month === 'all' ? '' : '-' + String(month).padStart(2, '0')))
      downloadBlob(csv, `kakao_${channelLabel}_${tag}_${today}.csv`)
    } catch (e) {
      alert('CSV 다운로드 실패: ' + (e?.message || e))
    } finally {
      setCsvLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">카카오 상담 로그</h1>
        <p className="mt-1 text-sm text-muted-foreground">파트너센터 5채널 실시간 수집 데이터 · 채팅별 스레드 그룹</p>
      </header>

      {!isSupabaseEnabled && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Supabase 환경변수(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)가 설정되지 않았습니다.
        </CardContent></Card>
      )}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {CHANNELS.map((ch) => <ChannelKpi key={ch.id} ch={ch} />)}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="채널 선택">
          {CHANNELS.map((ch) => (
            <button
              key={ch.id} onClick={() => onChannel(ch.id)} aria-pressed={channel === ch.id}
              className={'inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors '
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
            상담 스레드{year !== 'all' ? ' · ' + year + '년' + (month !== 'all' ? ' ' + Number(month) + '월' : '') : ''}{query ? ' · "' + query + '"' : ''}
            {grouped.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {grouped.length}개 채팅 · {rows.length}개 메시지
              </span>
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
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : grouped.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">조건에 맞는 메시지가 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {grouped.map((g) => (
                <Card key={g.chatId} className="overflow-hidden border-border/60 py-0">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 bg-muted/40 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="secondary" size="sm" className="shrink-0">
                        <User className="mr-1 size-3" />고객
                      </Badge>
                      <span className="truncate font-medium">{g.nickname || '(닉네임 없음)'}</span>
                      <span className="hidden truncate text-xs text-muted-foreground sm:inline">#{g.chatId.slice(-12)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                      <span className="tabular-nums">{g.count}건</span>
                      <span className="tabular-nums">최근 {fmtKST(g.latestAt)}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2">
                    <ul className="divide-y divide-border/40">
                      {g.messages.map((m) => {
                        const meta = SENDER_META[m.sender_type] || SENDER_META.system
                        const Icon = meta.icon
                        return (
                          <li key={m.log_id} className="flex items-start gap-3 py-2">
                            <span className="w-20 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{fmtKST(m.sent_at)}</span>
                            <Badge variant={meta.variant} size="sm" className="mt-0.5 max-w-[140px] shrink-0 truncate">
                              <Icon className="mr-1 size-3 shrink-0" />{senderText(m, nickMap)}
                            </Badge>
                            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-foreground">
                              {maskBody(m.message) || <span className="text-muted-foreground">(본문 없음)</span>}
                            </p>
                          </li>
                        )
                      })}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
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

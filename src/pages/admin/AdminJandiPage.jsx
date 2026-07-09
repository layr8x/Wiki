// src/pages/admin/AdminJandiPage.jsx — /admin/jandi
// 잔디(JANDI) 5채널 대화 로그 뷰어 (jandi_messages, RLS anon read).
// 방별 단일 타임라인(카카오의 채팅별 스레드와 다름) + 검색/기간 + 현재필터 CSV.
//   - 데이터 훅(react-query/Supabase)·필터·기간·채널선택·페이지네이션·CSV·스레드 그룹핑은 100% 유지
//   - 시각 요소만 Astryx primitive(Card/Badge/Button/Heading/Text/VStack/HStack/Grid/TextInput)로 교체
//   - 전역 <Theme>(AdminLayout)에서 토큰/모드를 상속하므로 이 페이지는 Theme/astryx.css 를 감싸지 않음
import { useState } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase, isSupabaseEnabled } from '@/lib/supabase'
import { maskBody } from '@/lib/maskPII'
import {
  MagnifyingGlass as Search,
  ChatText as MessageSquare,
  User,
  ArrowsClockwise as RefreshIcon,
  DownloadSimple as DownloadIcon,
} from '@phosphor-icons/react'

import { VStack } from '@astryxdesign/core/VStack'
import { Grid } from '@astryxdesign/core/Grid'
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'

import './AdminJandiPage.astryx.css'

// jandi_channels 와 동일한 5개 방.
const CHANNELS = [
  { id: '31495011', label: '시대 APP 기획/문의' },
  { id: '31962045', label: '시대 APP 실험실' },
  { id: '33385655', label: '재종통합행정 + 플랫폼서비스실' },
  { id: '31495551', label: '재종 데스크 업무' },
  { id: '29522222', label: '전체공지' },
]
const PAGE_SIZE = 50
const NOW_Y = new Date().getFullYear()
const YEARS = [NOW_Y, NOW_Y - 1, NOW_Y - 2]
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
// Astryx Selector 옵션(기간 필터) — 네이티브 select 대신 디자인시스템 드롭다운 사용.
const YEAR_OPTIONS = [{ value: 'all', label: '전체기간' }, ...YEARS.map((y) => ({ value: String(y), label: `${y}년` }))]
const MONTH_OPTIONS = [{ value: 'all', label: '전체월' }, ...MONTHS.map((m) => ({ value: m, label: `${Number(m)}월` }))]

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
    const messages = [root, ...children]                                      // 카드 본문(시간 오름차순)
    const latest = children.length ? children[children.length - 1].created_at : root.created_at
    return { root, children, messages, count: messages.length, latest: latest || root.created_at || '' }
  })
  groups.sort((a, b) => (b.latest || '').localeCompare(a.latest || '')) // 그룹은 최근 활동순
  return groups
}

// 스레드 카드 제목(원글 요약) — 본문 첫 줄을 잘라 씀. 없으면 유형 라벨.
function threadTitle(root) {
  const s = (root.message || '').replace(/\s+/g, ' ').trim()
  if (s) return s.length > 60 ? s.slice(0, 60) + '…' : s
  return '(' + (root.content_type || '내용 없음') + ')'
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
    <li className={'aj-msg' + (isReply ? ' aj-msg-reply' : '')}>
      <Text as="span" type="supporting" hasTabularNumbers className="aj-msg-time">{fmtKST(m.created_at)}</Text>
      <Badge variant="neutral" label={writerLabel(m)} icon={<User size={12} />} className="aj-msg-who" />
      {isReply && <span className="aj-msg-tag">↳ 댓글</span>}
      {!isReply && m.reply_to_message_id && (
        <span className="aj-msg-tag" title="원글이 현재 목록 범위 밖입니다">💬 답글</span>
      )}
      <p className="aj-msg-body">
        {maskBody(m.message) || <span className="aj-msg-empty">({m.content_type || '본문 없음'})</span>}
      </p>
    </li>
  )
}

function ChannelKpi({ ch }) {
  const { data, isLoading, isError } = useChannelCount(ch.id)
  return (
    <Card className="aj-kpi">
      <div className="aj-kpi-head">
        <Text type="supporting" maxLines={1}>{ch.label}</Text>
        <MessageSquare size={16} className="aj-kpi-icon" />
      </div>
      {isLoading ? (
        <div className="aj-skel aj-skel-kpi" />
      ) : (
        <div className="aj-kpi-value">
          <Text as="span" size="2xl" weight="semibold" hasTabularNumbers>
            {isError ? '—' : (data ?? 0).toLocaleString('ko-KR')}
          </Text>
          <Text as="span" type="supporting">개</Text>
        </div>
      )}
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
  const onSearch = () => { setQuery(input); reset() }

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
    <div className="aj-shell">
      <VStack gap={6} hAlign="stretch">

        {/* ─── 헤더 ─────────────────────────────────────────────── */}
        <VStack gap={1}>
          <Heading level={1}>잔디 대화</Heading>
          <Text type="supporting">JANDI 5채널 실시간 수집 데이터 · 방별 타임라인</Text>
        </VStack>

        {!isSupabaseEnabled && (
          <Card variant="muted">
            <Text type="supporting">
              Supabase 환경변수(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)가 설정되지 않았습니다.
            </Text>
          </Card>
        )}

        {/* ─── 채널별 메시지 수 (KPI) ───────────────────────────── */}
        <Grid columns={{ minWidth: 200, max: 5 }} gap={4}>
          {CHANNELS.map((ch) => <ChannelKpi key={ch.id} ch={ch} />)}
        </Grid>

        {/* ─── 툴바: 채널 탭 + 기간 + 검색 ───────────────────────── */}
        <div className="aj-toolbar">
          <div className="aj-tabs" role="group" aria-label="채널 선택">
            {CHANNELS.map((ch) => (
              <Button
                key={ch.id}
                label={ch.label}
                size="sm"
                variant={channel === ch.id ? 'primary' : 'secondary'}
                onClick={() => onChannel(ch.id)}
              />
            ))}
          </div>

          <div className="aj-selects">
            <Selector
              label="년도"
              isLabelHidden
              size="sm"
              value={year}
              onChange={(v) => { setYear(v); reset() }}
              options={YEAR_OPTIONS}
            />
            <Selector
              label="월"
              isLabelHidden
              size="sm"
              value={month}
              onChange={(v) => { setMonth(v); reset() }}
              options={MONTH_OPTIONS}
              isDisabled={year === 'all'}
            />
          </div>

          <div className="aj-search">
            <TextInput
              label="메시지 검색"
              isLabelHidden
              placeholder="메시지 검색 후 Enter"
              value={input}
              onChange={(v) => setInput(v)}
              onEnter={onSearch}
              startIcon={<Search size={16} />}
              hasClear
              width="100%"
            />
          </div>
        </div>

        {/* ─── 결과 카드 ─────────────────────────────────────────── */}
        <Card padding={0} className="aj-main">
          <div className="aj-main-head">
            <div className="aj-main-title">
              <Text weight="semibold">
                {channelLabel}{year !== 'all' ? ' · ' + year + '년' + (month !== 'all' ? ' ' + Number(month) + '월' : '') : ''}{query ? ' · "' + query + '"' : ''}
              </Text>
              {threads.length > 0 && (
                <Text type="supporting" hasTabularNumbers>
                  {threads.length}개 대화 · {rows.length}개 메시지
                </Text>
              )}
            </div>
            <div className="aj-main-actions">
              {isFetching && !csvLoading && <Text type="supporting">불러오는 중…</Text>}
              {csvLoading && <Text type="supporting">CSV 준비 중…</Text>}
              <Button label="새로고침" variant="secondary" size="sm" icon={<RefreshIcon size={14} />} onClick={onRefresh} isDisabled={isFetching} />
              <Button label="CSV" variant="secondary" size="sm" icon={<DownloadIcon size={14} />} onClick={onDownloadCsv} isDisabled={csvLoading || isLoading} />
            </div>
          </div>

          <div className="aj-main-body">
            {isError ? (
              <Text as="p" className="aj-state aj-error">불러오기 실패: {error?.message || '오류'}</Text>
            ) : isLoading ? (
              <div className="aj-skel-list">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aj-skel aj-skel-thread" />)}
              </div>
            ) : threads.length === 0 ? (
              <Text as="p" type="supporting" className="aj-state">조건에 맞는 메시지가 없습니다.</Text>
            ) : (
              <VStack gap={4} hAlign="stretch">
                {threads.map((t) => (
                  <div key={t.root.link_id} className="aj-thread">
                    <div className="aj-thread-head">
                      <div className="aj-thread-head-l">
                        <Badge variant="neutral" label={writerLabel(t.root)} icon={<User size={12} />} className="aj-thread-who" />
                        <Text weight="medium" maxLines={1} className="aj-thread-title">{threadTitle(t.root)}</Text>
                      </div>
                      <div className="aj-thread-meta">
                        <Text as="span" type="supporting" hasTabularNumbers>{t.count}건</Text>
                        <Text as="span" type="supporting" hasTabularNumbers>최근 {fmtKST(t.latest)}</Text>
                      </div>
                    </div>
                    <ul className="aj-msglist">
                      {t.messages.map((m, i) => (
                        <MessageRow key={m.link_id} m={m} isReply={i > 0} />
                      ))}
                    </ul>
                  </div>
                ))}
              </VStack>
            )}

            {!isLoading && !isError && rows.length >= limit && (
              <div className="aj-more">
                <Button label={`더 보기 (+${PAGE_SIZE})`} variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)} />
              </div>
            )}
          </div>
        </Card>

      </VStack>
    </div>
  )
}

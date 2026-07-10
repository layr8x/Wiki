// src/pages/admin/AdminConsultsPage.jsx — /admin/consults
// 카카오 파트너센터 5채널 상담 로그 뷰어 (kakao_partner_messages, RLS authenticated read).
// 기능: 채팅별 스레드 그룹 + 새로고침 + 현재필터 전체 CSV 다운로드.
// 채널 정본: CLAUDE.md §16 (kakao_channel 테이블과 동일 목록 — 변경 시 함께 갱신).
//
// Astryx(디자인시스템) 표면으로 마이그레이션:
//   - 데이터 훅(react-query)·Supabase 쿼리·필터(채널/기간/검색)·페이지네이션·CSV·스레드 그룹핑은 100% 유지
//   - 시각 요소만 Astryx primitive(VStack/HStack/Grid/Card/Badge/Button/Heading/Text/Divider/TextInput)로 교체
//   - 전역 <Theme>(AdminLayout)에서 토큰/모드를 상속하므로 이 페이지는 Theme/astryx.css 를 감싸지 않음
//   - primitive 로 표현 못하는 레이아웃(마스터/디테일·필터바·말풍선 틴트·테이블)만 co-located CSS(토큰 only)
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase, isSupabaseEnabled } from '@/lib/supabase'
import { maskBody, maskName } from '@/lib/maskPII'
import {
  MagnifyingGlass as Search,
  ChatText as MessageSquare,
  User,
  Headset,
  Gear as Cog,
  ArrowsClockwise as RefreshIcon,
  DownloadSimple as DownloadIcon,
} from '@phosphor-icons/react'

import { VStack } from '@astryxdesign/core/VStack'
import { HStack } from '@astryxdesign/core/HStack'
import { Grid } from '@astryxdesign/core/Grid'
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Divider } from '@astryxdesign/core/Divider'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { AnalyticsHeader } from '@/components/analytics/AnalyticsHeader'
import { KakaoConsultStatus } from '@/components/analytics/KakaoConsultStatus'
import './AdminConsultsPage.astryx.css'

const CHANNELS = [
  { id: '_VGAQn', label: '마이클래스' },
  { id: '_rcpPG', label: 'LIVE' },
  { id: '_TkpPG', label: 'LIVE 기술지원' },
  { id: '_xfxilXn', label: '콘텐츠' },
  { id: '_rkbcn', label: '통합로그인' },
]
// 채널 → Astryx Badge variant (색 계열로 5채널 구분)
const CHANNEL_BADGE = {
  _VGAQn: 'blue',
  _rcpPG: 'green',
  _TkpPG: 'teal',
  _xfxilXn: 'purple',
  _rkbcn: 'orange',
}
const PAGE_SIZE = 50
const NOW_Y = new Date().getFullYear()
const YEARS = [NOW_Y, NOW_Y - 1, NOW_Y - 2]
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
// Astryx Selector 옵션(기간 필터) — 네이티브 select 대신 디자인시스템 드롭다운 사용.
const YEAR_OPTIONS = [{ value: 'all', label: '전체기간' }, ...YEARS.map((y) => ({ value: String(y), label: `${y}년` }))]
const MONTH_OPTIONS = [{ value: 'all', label: '전체월' }, ...MONTHS.map((m) => ({ value: m, label: `${Number(m)}월` }))]

// base = 표기 라벨, variant = Astryx Badge variant(상담원/고객/시스템 구분), icon = 아이콘
const SENDER_META = {
  manager: { base: '상담원', variant: 'info', icon: Headset },
  user: { base: '고객', variant: 'neutral', icon: User },
  system: { base: '시스템', variant: 'warning', icon: Cog },
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
    <Card className="ac-kpi">
      <div className="ac-kpi-head">
        <Badge label={ch.label} variant={CHANNEL_BADGE[ch.id]} />
        <MessageSquare size={16} className="ac-kpi-icon" />
      </div>
      {/* 위 AnalyticsHeader의 "최근 7일" 헤드라인과 혼동되지 않도록 스코프 명시(기준2) */}
      <Text type="supporting" size="sm">전체 누적</Text>
      {isLoading ? (
        <div className="ac-skel ac-skel-kpi" />
      ) : (
        <div className="ac-kpi-value">
          <Text as="span" size="2xl" weight="semibold" hasTabularNumbers>
            {isError ? '—' : (data ?? 0).toLocaleString('ko-KR')}
          </Text>
          <Text as="span" type="supporting">개</Text>
        </div>
      )}
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
  const { data: rows = [], isLoading, isFetching, isError, error, dataUpdatedAt } = useMessages(channel, query, year, month, limit)

  const reset = () => setLimit(PAGE_SIZE)
  const onChannel = (id) => { setChannel(id); reset() }
  const onSearch = () => { setQuery(input); reset() }

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

  const titleSuffix = (year !== 'all' ? ' · ' + year + '년' + (month !== 'all' ? ' ' + Number(month) + '월' : '') : '')
    + (query ? ' · "' + query + '"' : '')

  return (
    <div className="ac-shell">
      <VStack gap={6} hAlign="stretch">

        {/* ─── 헤더 ─────────────────────────────────────────────── */}
        <VStack gap={1}>
          <Heading level={1}>카카오 상담 로그</Heading>
          <Text type="supporting">파트너센터 5채널 실시간 수집 데이터 · 채팅별 스레드 그룹</Text>
        </VStack>

        {!isSupabaseEnabled && (
          <Card variant="muted">
            <Text type="supporting">
              Supabase 환경변수(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)가 설정되지 않았습니다.
            </Text>
          </Card>
        )}

        {/* ─── 실시간 운영 현황 (North Star: 지금 밀린 상담) ─────── */}
        <KakaoConsultStatus />

        {/* ─── 분석 요약 (방법론 기반 상단 통계 영역) ───────────── */}
        <AnalyticsHeader
          analyticsKey="kakao-consults"
          table="kakao_partner_messages"
          dateColumn="sent_at"
          filters={{ profile_id: channel }}
          title={channelLabel + ' 문의량'}
        />

        {/* ─── 채널별 건수 KPI ──────────────────────────────────── */}
        <Grid columns={{ minWidth: 200, max: 5 }} gap={4}>
          {CHANNELS.map((ch) => <ChannelKpi key={ch.id} ch={ch} />)}
        </Grid>

        {/* ─── 툴바: 채널 + 기간 + 검색 ─────────────────────────── */}
        <div className="ac-toolbar">
          <div className="ac-chips" role="group" aria-label="채널 선택">
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

          <div className="ac-selects">
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

          <div className="ac-search">
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

        {/* ─── 결과 패널 ────────────────────────────────────────── */}
        <Card className="ac-panel" padding={0}>
          <div className="ac-panel-head">
            <div className="ac-panel-titlewrap">
              <Text weight="semibold">상담 스레드{titleSuffix}</Text>
              {grouped.length > 0 && (
                <Text type="supporting" hasTabularNumbers>
                  {grouped.length}개 채팅 · {rows.length}개 메시지
                </Text>
              )}
            </div>
            <div className="ac-panel-actions">
              {isFetching && !csvLoading && <Text type="supporting">불러오는 중…</Text>}
              {csvLoading && <Text type="supporting">CSV 준비 중…</Text>}
              {/* 실시간 구독 없이 수동 새로고침 방식이라, 화면이 "지금 상태"처럼 보이지 않도록
                  마지막으로 실제 데이터를 받아온 시각을 명시(기준2: 오래된 데이터를 최신처럼
                  보여주지 않기 — 카카오 통계 대시보드에서 발견된 것과 같은 유형의 위험 예방). */}
              {!isFetching && dataUpdatedAt > 0 && (
                <Text type="supporting" size="sm">
                  마지막 갱신 {new Date(dataUpdatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
              <Button variant="secondary" size="sm" label="새로고침" icon={<RefreshIcon size={16} />} onClick={onRefresh} isDisabled={isFetching} />
              <Button variant="secondary" size="sm" label="CSV" icon={<DownloadIcon size={16} />} onClick={onDownloadCsv} isDisabled={csvLoading || isLoading} />
            </div>
          </div>

          <Divider />

          <div className="ac-panel-body">
            {isError ? (
              <Text as="p" className="ac-state ac-error">불러오기 실패: {error?.message || '오류'}</Text>
            ) : isLoading ? (
              <VStack gap={2} hAlign="stretch">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="ac-skel ac-skel-thread" />)}
              </VStack>
            ) : grouped.length === 0 ? (
              <Text as="p" type="supporting" className="ac-state">조건에 맞는 메시지가 없습니다.</Text>
            ) : (
              <VStack gap={4} hAlign="stretch">
                {grouped.map((g) => (
                  <div key={g.chatId} className="ac-thread">
                    <div className="ac-thread-head">
                      <div className="ac-thread-id">
                        <Badge label="고객" variant="neutral" icon={<User size={12} />} />
                        <Text weight="medium" maxLines={1} className="ac-thread-nick">{g.nickname || '(닉네임 없음)'}</Text>
                        <Text type="supporting" className="ac-thread-hash">#{g.chatId.slice(-12)}</Text>
                      </div>
                      <div className="ac-thread-meta">
                        <Text type="supporting" hasTabularNumbers>{g.count}건</Text>
                        <Text type="supporting" hasTabularNumbers>최근 {fmtKST(g.latestAt)}</Text>
                      </div>
                    </div>
                    <ul className="ac-msgs">
                      {g.messages.map((m) => {
                        const meta = SENDER_META[m.sender_type] || SENDER_META.system
                        const Icon = meta.icon
                        return (
                          <li key={m.log_id} className="ac-msg" data-dir={m.sender_type === 'user' ? 'in' : 'out'}>
                            <span className="ac-msg-time">{fmtKST(m.sent_at)}</span>
                            <Badge className="ac-msg-sender" variant={meta.variant} label={senderText(m, nickMap)} icon={<Icon size={12} />} />
                            <div className="ac-msg-bubble">
                              {maskBody(m.message) || <span className="ac-msg-empty">(본문 없음)</span>}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </VStack>
            )}

            {!isLoading && !isError && rows.length >= limit && (
              <HStack hAlign="center" className="ac-more">
                <Button variant="secondary" size="sm" label={`더 보기 (+${PAGE_SIZE})`} onClick={() => setLimit((l) => l + PAGE_SIZE)} />
              </HStack>
            )}
          </div>
        </Card>

      </VStack>
    </div>
  )
}

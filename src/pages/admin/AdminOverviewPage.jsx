// src/pages/admin/AdminOverviewPage.jsx — /admin 대시보드
// Astryx(Meta 디자인시스템) 표면으로 마이그레이션.
//   - 데이터 훅(react-query)·라우팅(react-router)·집계 통계는 100% 그대로 유지
//   - 시각 요소만 Astryx primitive(Card/Badge/Button/Heading/Text/VStack/Grid)로 교체
//   - 전역 <Theme>(AdminLayout)에서 토큰/모드를 상속하므로 이 페이지는 Theme/CSS 를 감싸지 않음
import { Link, useNavigate } from 'react-router-dom'
import {
  useDashboardStats,
  useModuleStats,
  useRecentGuides,
  useResponseTimeDistribution,
  useChatCategoryDistribution,
  useSentimentTrend,
} from '@/hooks/useGuides'
import { getModuleTree } from '@/lib/db'
import {
  FileText,
  Eye,
  ThumbsUp,
  MagnifyingGlass as Search,
  PencilSimple as PencilLine,
} from '@phosphor-icons/react'

import { VStack } from '@astryxdesign/core/VStack'
import { Grid } from '@astryxdesign/core/Grid'
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'

import './AdminOverviewPage.astryx.css'

const KPI_ITEMS = [
  { key: 'totalGuides', label: '총 가이드', icon: FileText, suffix: '개' },
  { key: 'totalViews',  label: '누적 조회', icon: Eye,      suffix: '회' },
  { key: 'helpfulRate', label: '도움됨률', icon: ThumbsUp,  suffix: '%' },
  { key: 'searchCount', label: '검색 수',   icon: Search,   suffix: '회' },
]

function formatNumber(n) {
  if (typeof n !== 'number') return '—'
  return n.toLocaleString('ko-KR')
}

// 응답시간 버킷별 톤 (빠를수록 안전, 느릴수록 위험). Astryx 아이콘 색 토큰으로 매핑.
const BUCKET_TONE = {
  '0-5분':    'green',
  '5-30분':   'green',
  '30-60분':  'yellow',
  '1-3시간':  'yellow',
  '3-24시간': 'orange',
  '24시간+':  'red',
}

// 카테고리 id → 한글 라벨 매핑 (classify-kakao-csv.mjs 와 일치)
const CATEGORY_LABELS = {
  'video-content':     '영상재생/콘텐츠',
  'school-link':       '학원등록연동',
  'qr-attendance':     'QR/출석',
  'parent-account':    '학부모/계정통합',
  'refund-payment':    '환불/결제',
  'enrollment':        '수강신청/대기',
  'app-access':        '앱 접근/실행',
  'login-auth':        '로그인/인증',
  'app-bug':           '앱 버그/오류',
  'textbook-delivery': '교재/배송',
  'class-info':        '강좌/수업 정보',
  'misc':              '기타',
}

/* 분포 바 한 줄 — 라벨 + 우측 메타 + 토큰 트랙/필 */
function StatBar({ label, right, pct, tone = 'primary' }) {
  return (
    <div className="ov-bar">
      <div className="ov-bar-head">
        <Text type="body" weight="medium">{label}</Text>
        <Text type="supporting" hasTabularNumbers as="span">{right}</Text>
      </div>
      <div className="ov-bar-track">
        <div className="ov-bar-fill" data-tone={tone} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function AdminOverviewPage() {
  const navigate = useNavigate()
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: moduleStats = {}, isLoading: modsLoading } = useModuleStats()
  const { data: recents = [], isLoading: recentsLoading } = useRecentGuides(8)
  const { data: rtDist, isLoading: rtLoading } = useResponseTimeDistribution(90)
  const { data: catDist, isLoading: catLoading } = useChatCategoryDistribution(90)
  const { data: sentTrend, isLoading: sentLoading } = useSentimentTrend(30)

  return (
    <div className="ov-shell">
      <VStack gap={8} hAlign="stretch">

        {/* ─── 헤더 ─────────────────────────────────────────────── */}
        <div className="ov-header ov-row-between">
          <VStack gap={1.5}>
            <Heading level={1}>대시보드</Heading>
            <Text type="supporting">AMS Wiki 전체 현황을 한눈에 확인합니다.</Text>
          </VStack>
          <Button
            label="새 가이드 작성"
            variant="primary"
            size="sm"
            icon={<PencilLine size={14} />}
            onClick={() => navigate('/editor')}
          />
        </div>

        {/* ─── KPI 카드 (4) ─────────────────────────────────────── */}
        <Grid columns={{ minWidth: 200, max: 4 }} gap={4}>
          {KPI_ITEMS.map((item) => {
            const Icon = item.icon
            const value = stats?.[item.key]
            return (
              <Card key={item.key} padding={5}>
                <VStack gap={2}>
                  <div className="ov-row-between">
                    <Text type="supporting">{item.label}</Text>
                    <span className="ov-kpi-icon"><Icon size={16} /></span>
                  </div>
                  {statsLoading ? (
                    <div className="ov-skel ov-skel-kpi" />
                  ) : (
                    <div className="ov-kpi-value">
                      <Heading level={3}>{formatNumber(value)}</Heading>
                      <Text type="supporting" as="span">{item.suffix}</Text>
                    </div>
                  )}
                </VStack>
              </Card>
            )
          })}
        </Grid>

        {/* ─── 내부 위키 통계 2열 (모듈 분포 + 최근 업데이트) ───── */}
        <Grid columns={{ minWidth: 320, max: 2 }} gap={6}>

          {/* 모듈별 가이드 분포 */}
          <Card padding={0}>
            <div className="ov-cardhead">
              <Heading level={4}>모듈별 가이드 분포</Heading>
            </div>
            <div className="ov-cardbody">
              <VStack gap={3} hAlign="stretch">
                {modsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="ov-skel ov-skel-bar" />
                  ))
                ) : (
                  getModuleTree().map((mod) => {
                    // moduleStats는 Supabase guides.module 컬럼(한글 라벨) 기준으로 집계됨 — mod.id(영문 슬러그) 아님
                    const count = moduleStats[mod.label] || 0
                    const max = Math.max(...Object.values(moduleStats), 1)
                    const pct = Math.round((count / max) * 100)
                    return (
                      <StatBar key={mod.id} label={mod.label} right={count} pct={pct} />
                    )
                  })
                )}
              </VStack>
            </div>
          </Card>

          {/* 최근 업데이트 */}
          <Card padding={0}>
            <div className="ov-cardhead ov-row-between">
              <Heading level={4}>최근 업데이트</Heading>
              <Button
                label="전체 보기"
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin/guides')}
              />
            </div>
            {recentsLoading ? (
              <div className="ov-cardbody">
                <VStack gap={2} hAlign="stretch">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="ov-skel ov-skel-row" />
                  ))}
                </VStack>
              </div>
            ) : recents.length === 0 ? (
              <div className="ov-cardbody ov-empty">
                <Text type="supporting">최근 업데이트된 가이드가 없습니다.</Text>
              </div>
            ) : (
              <ul className="ov-list">
                {recents.slice(0, 6).map((g) => (
                  <li key={g.id} className="ov-li">
                    <Link to={`/editor?id=${g.id}`} className="link ov-listrow">
                      <div className="ov-grow">
                        <Text className="ov-listrow-title" weight="medium" maxLines={1}>{g.title}</Text>
                      </div>
                      <div className="ov-listrow-meta">
                        <Badge label={g.type} variant="neutral" />
                        <Text type="supporting" hasTabularNumbers as="span">
                          {g.updated || g.updated_at?.slice(0, 10) || '—'}
                        </Text>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Grid>

        {/* ─── 카카오 상담 응답시간 분포 (최근 90일) ────────────── */}
        {(rtLoading || (rtDist && rtDist.length > 0)) && (
          <Card padding={0}>
            <div className="ov-cardhead">
              <VStack gap={1}>
                <Heading level={4}>카카오 상담 응답시간 분포 (최근 90일)</Heading>
                <Text type="supporting">
                  학부모 메시지 후 직원 첫 응답까지 걸린 시간을 6개 구간으로 집계.
                </Text>
              </VStack>
            </div>
            <div className="ov-cardbody">
              <VStack gap={3} hAlign="stretch">
                {rtLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="ov-skel ov-skel-bar" />
                  ))
                ) : (
                  rtDist.map((row) => {
                    const maxPct = Math.max(...rtDist.map(r => r.pct), 1)
                    const widthPct = (row.pct / maxPct) * 100
                    const tone = BUCKET_TONE[row.bucket] || 'primary'
                    return (
                      <StatBar
                        key={row.bucket}
                        label={row.bucket}
                        right={`${formatNumber(row.cnt)}건 · ${row.pct}%`}
                        pct={widthPct}
                        tone={tone}
                      />
                    )
                  })
                )}
              </VStack>
            </div>
          </Card>
        )}

        {/* ─── 카카오 상담 카테고리 분포 (AI 분류) ──────────────── */}
        {(catLoading || (catDist && catDist.length > 0)) && (
          <Card padding={0}>
            <div className="ov-cardhead">
              <VStack gap={1}>
                <Heading level={4}>카카오 상담 카테고리 분포 (최근 90일, AI 분류)</Heading>
                <Text type="supporting">
                  채팅방을 Claude AI 가 12개 카테고리로 자동 분류. 부정 감정 비율도 함께 표시.
                </Text>
              </VStack>
            </div>
            <div className="ov-cardbody">
              <VStack gap={3} hAlign="stretch">
                {catLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="ov-skel ov-skel-bar" />
                  ))
                ) : (
                  catDist.map((row) => {
                    const maxPct = Math.max(...catDist.map(r => r.pct), 1)
                    const widthPct = (row.pct / maxPct) * 100
                    const label = CATEGORY_LABELS[row.category] || row.category
                    const isHot = row.negativeRate >= 30
                    return (
                      <StatBar
                        key={row.category}
                        label={label}
                        pct={widthPct}
                        tone={isHot ? 'red' : 'primary'}
                        right={
                          <>
                            {formatNumber(row.cnt)}건 · {row.pct}%
                            {row.negativeRate > 0 && (
                              <span className={isHot ? 'ov-neg ov-neg-hot' : 'ov-neg'}>
                                {' '}· 부정 {row.negativeRate}%
                              </span>
                            )}
                          </>
                        }
                      />
                    )
                  })
                )}
              </VStack>
            </div>
          </Card>
        )}

        {/* ─── 학부모 감정 추세 (일별) ──────────────────────────── */}
        {(sentLoading || (sentTrend && sentTrend.length > 0)) && (
          <Card padding={0}>
            <div className="ov-cardhead">
              <VStack gap={1}>
                <Heading level={4}>학부모 감정 추세 (최근 30일)</Heading>
                <Text type="supporting">
                  일별 학부모 메시지의 긍정·중립·부정 비율. 부정이 갑자기 늘어나면 위험 신호.
                </Text>
              </VStack>
            </div>
            <div className="ov-cardbody">
              {sentLoading ? (
                <div className="ov-skel ov-skel-sent" />
              ) : (
                <div className="ov-sent">
                  {sentTrend.map((d) => {
                    const total = d.positive + d.neutral + d.negative
                    if (total === 0) return <div key={d.day} className="ov-sent-col" />
                    const posH = (d.positive / total) * 100
                    const neuH = (d.neutral / total) * 100
                    const negH = (d.negative / total) * 100
                    return (
                      <div
                        key={d.day}
                        className="ov-sent-col ov-sent-stack"
                        title={`${d.day} · 긍정 ${d.positive} / 중립 ${d.neutral} / 부정 ${d.negative}`}
                      >
                        <div className="ov-sent-seg" data-tone="neg" style={{ height: `${negH}%` }} />
                        <div className="ov-sent-seg" data-tone="neu" style={{ height: `${neuH}%` }} />
                        <div className="ov-sent-seg" data-tone="pos" style={{ height: `${posH}%` }} />
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="ov-legend">
                <span className="ov-legend-item"><span className="ov-dot" data-tone="pos" /> 긍정</span>
                <span className="ov-legend-item"><span className="ov-dot" data-tone="neu" /> 중립</span>
                <span className="ov-legend-item"><span className="ov-dot" data-tone="neg" /> 부정</span>
              </div>
            </div>
          </Card>
        )}

      </VStack>
    </div>
  )
}

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
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { QueryError, QueryEmpty } from '@/components/admin/QueryStates'

import './AdminOverviewPage.astryx.css'

const KPI_ITEMS = [
  { key: 'totalGuides', label: '총 가이드', icon: FileText, suffix: '개' },
  { key: 'totalViews',  label: '누적 조회', icon: Eye,      suffix: '회' },
  { key: 'helpfulRate', label: '도움됨률', icon: ThumbsUp,  suffix: '%' },
  { key: 'searchCount', label: '검색 수',   icon: Search,   suffix: '회' },
]

// 감정 추세 카드에 필요한 요약값. 그림만으로는 "부정이 늘었나"를 알 수 없어 글로도 둔다.
// 마지막 7일과 그 앞 7일의 부정 비율을 비교한다(알럿봇의 감정 추세 판정과 같은 기준).
function summarizeSentiment(trend) {
  const empty = { last7: '—', prev7: '—', delta: null, ticks: [], aria: '감정 추세 데이터 없음' }
  if (!trend || trend.length === 0) return empty
  const rate = (rows) => {
    const t = rows.reduce((s, d) => s + d.positive + d.neutral + d.negative, 0)
    const n = rows.reduce((s, d) => s + d.negative, 0)
    return t > 0 ? Math.round((n / t) * 1000) / 10 : null
  }
  const last = trend.slice(-7)
  const prev = trend.slice(-14, -7)
  const l = rate(last)
  const p = rate(prev)
  const days = trend.map((d) => d.day)
  const tick = (iso) => (iso || '').slice(5).replace('-', '/')
  return {
    last7: l ?? '—',
    prev7: p ?? '—',
    delta: l !== null && p !== null ? Math.round((l - p) * 10) / 10 : null,
    ticks: days.length >= 3 ? [tick(days[0]), tick(days[Math.floor(days.length / 2)]), tick(days[days.length - 1])] : days.map(tick),
    aria: l !== null && p !== null
      ? `최근 ${trend.length}일 학부모 감정 추세. 부정 비율이 그 앞 7일 ${p}%에서 최근 7일 ${l}%로 바뀌었습니다.`
      : `최근 ${trend.length}일 학부모 감정 추세.`,
  }
}

function formatNumber(n) {
  if (typeof n !== 'number') return '—'
  return n.toLocaleString('ko-KR')
}

// 응답시간 버킷별 색 (빠를수록 안전, 느릴수록 위험). Astryx ProgressBar 의 variant 로 매핑.
// 쓸 수 있는 값은 accent·success·warning·error·neutral 다섯 가지라, 예전 수제 막대의
// 노랑·주황 두 단계는 warning 하나로 합쳐진다(둘의 색 차이가 크지 않아 실사용 손실은 없다).
const BUCKET_VARIANT = {
  '0-5분':    'success',
  '5-30분':   'success',
  '30-60분':  'warning',
  '1-3시간':  'warning',
  '3-24시간': 'warning',
  '24시간+':  'error',
}

/* 분포 바 한 줄 — 라벨 + 우측 메타 + Astryx ProgressBar.
   막대는 디자인시스템 컴포넌트를 쓴다(CLAUDE.md 18장 — 수제 div 로 흉내내지 않는다).
   label 은 필수 prop 이고, 왼쪽에 이미 같은 글자가 보이므로 isLabelHidden 으로 감춘다
   (읽어주는 기능에는 남는다). */
function StatBar({ label, right, value, max = 100, variant = 'accent' }) {
  return (
    <div className="ov-bar">
      <div className="ov-bar-head">
        <Text type="body" weight="medium">{label}</Text>
        <Text type="supporting" hasTabularNumbers as="span">{right}</Text>
      </div>
      <ProgressBar label={label} isLabelHidden value={value} max={max} variant={variant} />
    </div>
  )
}

export default function AdminOverviewPage() {
  const navigate = useNavigate()
  // ⚠️ isError·refetch 를 반드시 받는다. 예전에는 넷 다 안 받아서, 조회가 실패해도 화면이
  //    "가이드 0개 · 조회 0회"라고 단언했다(오류 화면과 빈 화면의 픽셀이 완전히 같았다).
  const { data: stats, isLoading: statsLoading, isError: statsError, error: statsErr, refetch: statsRefetch } = useDashboardStats()
  const { data: moduleStats = {}, isLoading: modsLoading, isError: modsError, error: modsErr, refetch: modsRefetch } = useModuleStats()
  const { data: recents = [], isLoading: recentsLoading, isError: recentsError, error: recentsErr, refetch: recentsRefetch } = useRecentGuides(8)
  const { data: rtDist, isLoading: rtLoading, isError: rtError, error: rtErr, refetch: rtRefetch } = useResponseTimeDistribution(90)
  const { data: catDist, isLoading: catLoading, isError: catError, error: catErr, refetch: catRefetch } = useChatCategoryDistribution(90)
  const { data: sentTrend, isLoading: sentLoading, isError: sentError, error: sentErr, refetch: sentRefetch } = useSentimentTrend(30)
  const sentSummary = summarizeSentiment(sentTrend)

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

        {statsError && <QueryError label="대시보드 통계" error={statsErr} onRetry={statsRefetch} />}

        {/* ─── KPI 카드 (4) ─────────────────────────────────────── */}
        {/* minWidth 200 이면 768px 에서 3+1 로 접혀 넷째 카드만 혼자 줄을 차지한다.
            160 으로 낮추면 4열이 유지된다(390px 에서 2열이 됐을 때 "4,630회" 같은 값이
            줄바꿈되지 않는 것까지 실측 확인). */}
        <Grid columns={{ minWidth: 160, max: 4 }} gap={4}>
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
                    <Skeleton width={96} height={32} />
                  ) : statsError ? (
                    // 실패를 0으로 바꾸지 않는다 — 아래 배너가 원인과 다시 시도를 알린다.
                    <Text type="supporting">확인 필요</Text>
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
              <VStack gap={1}>
                <Heading level={4}>모듈별 가이드 분포</Heading>
                <Text type="supporting">막대 길이는 가장 많은 모듈을 기준으로 한 상대 길이입니다.</Text>
              </VStack>
            </div>
            <div className="ov-cardbody">
              <VStack gap={3} hAlign="stretch">
                {modsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} width="100%" height={32} index={i} />
                  ))
                ) : modsError ? (
                  <QueryError label="모듈별 분포" error={modsErr} onRetry={modsRefetch} />
                ) : (
                  getModuleTree().map((mod) => {
                    // moduleStats는 Supabase guides.module 컬럼(한글 라벨) 기준으로 집계됨 — mod.id(영문 슬러그) 아님
                    const count = moduleStats[mod.label] || 0
                    // 여기는 비율이 아니라 개수라 합이 100이 되지 않는다 → 가장 많은 모듈을
                    // 기준으로 한 상대 길이를 그대로 쓴다(카드 부제에 그 기준을 적어 뒀다).
                    const max = Math.max(...Object.values(moduleStats), 1)
                    return (
                      <StatBar key={mod.id} label={mod.label} right={count} value={count} max={max} />
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
                    <Skeleton key={i} width="100%" height={40} index={i} />
                  ))}
                </VStack>
              </div>
            ) : recentsError ? (
              <div className="ov-cardbody">
                <QueryError label="최근 업데이트" error={recentsErr} onRetry={recentsRefetch} />
              </div>
            ) : recents.length === 0 ? (
              <div className="ov-cardbody">
                <QueryEmpty
                  title="최근 업데이트된 가이드가 없습니다"
                  description="가이드를 새로 쓰거나 고치면 여기에 나타납니다."
                  actions={<Button label="새 가이드 작성" variant="secondary" size="sm" onClick={() => navigate('/editor')} />}
                />
              </div>
            ) : (
              <ul className="ov-list">
                {recents.slice(0, 6).map((g) => (
                  <li key={g.id} className="ov-li">
                    <Link to={`/editor?id=${g.id}`} className="link ov-listrow">
                      <div className="ov-grow">
                        {/* 두 줄까지 — 390px 에서 "교재 배송 프로세스" 같은 제목이 5px 모자라 끝이 잘렸다.
                            넉넉한 폭에서는 어차피 한 줄에 들어가 높이 변화가 없다. */}
                        <Text className="ov-listrow-title" weight="medium" maxLines={2}>{g.title}</Text>
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

        {/* ─── 카카오 상담 분석 3종 ─────────────────────────────
            세로로만 쌓여 있어 1440px 화면에서 오른쪽이 비는데도 스크롤이 2.5화면이었다
            (실측 2,100px). 가로 공간을 써서 접힌 곳 아래로 밀리는 양을 줄인다.
            좁은 화면(720px 미만)에서는 자동으로 1열로 돌아간다. */}
        <Grid columns={{ minWidth: 360, max: 2 }} gap={6}>
        {/* 예전에는 데이터가 없으면 카드가 통째로 사라져, 조회 실패인지 원래 없는지 알 수 없었다.
            카드는 항상 두고 안쪽에서 로딩·실패·없음을 구분한다. */}
        {(
          <Card padding={0}>
            <div className="ov-cardhead ov-row-between">
              <VStack gap={1}>
                <Heading level={4}>카카오 상담 응답시간 분포 (최근 90일)</Heading>
                <Text type="supporting">
                  학부모 메시지 후 직원 첫 응답까지 걸린 시간을 6개 구간으로 집계.
                  90일 누적이라 오늘 상황은 카카오 상담 화면에서 확인합니다.
                </Text>
              </VStack>
            {/* 이 대시보드 본문의 링크는 전부 /editor?id= 였고 상담 화면으로 가는 링크가 하나도
                없었다. 여기서 이상을 발견해도 어디서 자세히 보는지 알 수 없었다. */}
            <Button
              label="상담 로그에서 보기"
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/consults')}
            />
            </div>
            <div className="ov-cardbody">
              <VStack gap={3} hAlign="stretch">
                {rtLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} width="100%" height={32} index={i} />
                  ))
                ) : rtError ? (
                  <QueryError label="응답시간 분포" error={rtErr} onRetry={rtRefetch} />
                ) : !rtDist || rtDist.length === 0 ? (
                  <QueryEmpty title="최근 90일 응답 기록이 없습니다" description="학부모 메시지에 직원이 답한 기록이 모이면 여기에 나타납니다." />
                ) : (
                  rtDist.map((row) => (
                    // 막대 길이 = 전체 대비 비율 그대로. 예전에는 1위 값을 분모로 써서
                    // 라벨이 44%인 행도 막대는 늘 꽉 찼다(2026-08-13 감사).
                    <StatBar
                      key={row.bucket}
                      label={row.bucket}
                      right={`${formatNumber(row.cnt)}건 · ${row.pct}%`}
                      value={row.pct}
                      max={100}
                      variant={BUCKET_VARIANT[row.bucket] || 'accent'}
                    />
                  ))
                )}
              </VStack>
            </div>
          </Card>
        )}

        {/* ─── 카카오 상담 카테고리 분포 (AI 분류) ──────────────── */}
        {(
          <Card padding={0}>
            <div className="ov-cardhead ov-row-between">
              <VStack gap={1}>
                <Heading level={4}>카카오 상담 카테고리 분포 (최근 90일, AI 분류)</Heading>
                <Text type="supporting">
                  채팅방을 Claude AI 가 12개 카테고리로 자동 분류. 부정 감정 비율도 함께 표시.
                  오늘 갑자기 늘어난 유형은 카카오 상담 화면에서 확인합니다.
                </Text>
              </VStack>
            {/* 이 대시보드 본문의 링크는 전부 /editor?id= 였고 상담 화면으로 가는 링크가 하나도
                없었다. 여기서 이상을 발견해도 어디서 자세히 보는지 알 수 없었다. */}
            <Button
              label="상담 로그에서 보기"
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/consults')}
            />
            </div>
            <div className="ov-cardbody">
              <VStack gap={3} hAlign="stretch">
                {catLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} width="100%" height={32} index={i} />
                  ))
                ) : catError ? (
                  <QueryError label="카테고리 분포" error={catErr} onRetry={catRefetch} />
                ) : !catDist || catDist.length === 0 ? (
                  <QueryEmpty title="최근 90일 분류 결과가 없습니다" description="AI 분류가 돌면 여기에 나타납니다." />
                ) : (
                  catDist.map((row) => {
                    // category 컬럼 값이 이미 한글 라벨(카카오 AI 분류 결과)이라 별도 매핑 불필요.
                    const label = row.category
                    const isHot = row.negativeRate >= 30
                    return (
                      // 막대 길이 = 전체 대비 비율 그대로(응답시간 분포와 같은 기준).
                      <StatBar
                        key={row.category}
                        label={label}
                        value={row.pct}
                        max={100}
                        variant={isHot ? 'error' : 'accent'}
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
        {(
          <Card padding={0}>
            <div className="ov-cardhead ov-row-between">
              <VStack gap={1}>
                <Heading level={4}>학부모 감정 추세 (최근 30일)</Heading>
                <Text type="supporting">
                  일별 학부모 메시지의 긍정·중립·부정 비율. 부정이 갑자기 늘어나면 위험 신호.
                  어느 채널인지는 카카오 상담 화면에서 확인합니다.
                </Text>
              </VStack>
            {/* 이 대시보드 본문의 링크는 전부 /editor?id= 였고 상담 화면으로 가는 링크가 하나도
                없었다. 여기서 이상을 발견해도 어디서 자세히 보는지 알 수 없었다. */}
            <Button
              label="상담 로그에서 보기"
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/consults')}
            />
            </div>
            <div className="ov-cardbody">
              {sentLoading ? (
                <Skeleton width="100%" height={128} />
              ) : sentError ? (
                <QueryError label="감정 추세" error={sentErr} onRetry={sentRefetch} />
              ) : !sentTrend || sentTrend.length === 0 ? (
                <QueryEmpty title="최근 30일 감정 분석 결과가 없습니다" description="학부모 메시지가 분류되면 여기에 나타납니다." />
              ) : (
                <>
                  {/* 막대 30개에 눈금이 하나도 없고 수치는 브라우저 기본 말풍선(title)뿐이라,
                      터치·키보드로는 값에 닿을 방법이 없었다(1440px 에서 막대 하나가 13px,
                      390px 에서 6px). 차트 전체를 하나의 그림으로 읽히게 하고, 이 카드의 목적
                      (부정 증가 감지)에 필요한 숫자는 아래 한 줄로 항상 보이게 둔다.
                      막대 30개를 각각 포커스 대상으로 만들지 않는다 — 정지점 30개는 오히려 손해다. */}
                  <div className="ov-sent" role="img" aria-label={sentSummary.aria}>
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
                  {/* 날짜 눈금 3개(시작·중간·끝). 30개를 다 넣을 자리가 없다. */}
                  <div className="ov-sent-axis">
                    {sentSummary.ticks.map((t, i) => (
                      <Text key={i} type="supporting" as="span" hasTabularNumbers>{t}</Text>
                    ))}
                  </div>
                  {/* 이 카드의 목적은 "부정이 늘고 있는가" 하나다. 그 답을 그림에 기대지 않고 글로 둔다. */}
                  <Text type="supporting" as="p" className="ov-sent-note">
                    최근 7일 부정 비율 {sentSummary.last7}% · 그 앞 7일 {sentSummary.prev7}%
                    {sentSummary.delta !== null && (
                      <span className={sentSummary.delta > 0 ? 'ov-neg-hot' : undefined}>
                        {' '}({sentSummary.delta > 0 ? '+' : ''}{sentSummary.delta}%p)
                      </span>
                    )}
                  </Text>
                </>
              )}
              <div className="ov-legend">
                <span className="ov-legend-item"><span className="ov-dot" data-tone="pos" /> 긍정</span>
                <span className="ov-legend-item"><span className="ov-dot" data-tone="neu" /> 중립</span>
                <span className="ov-legend-item"><span className="ov-dot" data-tone="neg" /> 부정</span>
              </div>
            </div>
          </Card>
        )}
        </Grid>

      </VStack>
    </div>
  )
}

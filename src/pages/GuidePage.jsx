// src/pages/GuidePage.jsx
// 가이드 상세 — Astryx(Meta 디자인시스템) 표면으로 마이그레이션.
//   - 데이터 훅(useGuide/useSubmitFeedback)·라우팅(useParams)·remount(key)·voted state·
//     최근열람 track·타입/심각도/판단 메타는 100% 유지. 시각 레이어만 Astryx로 교체.
//   - 전역 <Theme>(AstryxAppFrame)에서 토큰/모드를 상속하므로 이 페이지는 Theme/astryx.css 를 감싸지 않음
//   - 표현 못하는 레이아웃(메타바·콜아웃·테이블·스텝번호·피드백·스켈레톤)은 co-located CSS(토큰 only)
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  ArrowSquareOut as ExternalLink,
  Clock,
  Warning as AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  User,
  FileText,
  GitBranch,
  ShieldCheck,
  CheckCircle as CheckCircle2,
} from '@phosphor-icons/react'

import { VStack } from '@astryxdesign/core/VStack'
import { Grid } from '@astryxdesign/core/Grid'
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Divider } from '@astryxdesign/core/Divider'

import { useGuide, useSubmitFeedback } from '@/hooks/useGuides'
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed'
import { getGuideType, SEVERITY, DECISION_STATUS } from '@/lib/guideTypes'
import './GuidePage.astryx.css'

// 가이드 타입 → Astryx Badge variant (색 계열 기준 매핑)
const TYPE_BADGE_VARIANT = {
  SOP: 'blue',
  DECISION: 'purple',
  REFERENCE: 'neutral',
  TROUBLE: 'red',
  RESPONSE: 'green',
  POLICY: 'yellow',
}
const toTypeVariant = (typeKey) => TYPE_BADGE_VARIANT[typeKey] ?? 'neutral'

// 심각도(트러블) → Astryx Badge variant
const SEVERITY_BADGE_VARIANT = {
  critical: 'error',
  high: 'red',
  medium: 'orange',
  low: 'neutral',
}
// 판단결과(DECISION) → Astryx Badge variant
const DECISION_BADGE_VARIANT = {
  safe: 'green',
  warn: 'orange',
  danger: 'red',
}

// 스크린샷 로드 실패 시 플레이스홀더로 교체
function onImgError(e) {
  if (!e.currentTarget.dataset.fallback) {
    e.currentTarget.dataset.fallback = '1'
    e.currentTarget.src = '/placeholder-screenshot.svg'
  }
}

function GuideFigure({ src, alt, name }) {
  return (
    <figure className="gp-figure">
      <img src={src} alt={alt} loading="lazy" onError={onImgError} />
      {name && <figcaption>{name}</figcaption>}
    </figure>
  )
}

export default function GuidePage() {
  const { id } = useParams()
  // id가 바뀌면 내부 컴포넌트가 재마운트되어 voted state가 자동 초기화됨
  // (effect + setState 를 피하는 공식 패턴: https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes)
  return <GuidePageInner key={id} id={id} />
}

function GuidePageInner({ id }) {
  const navigate = useNavigate()
  const { data: guide, isLoading, isError } = useGuide(id)
  const { mutateAsync: submit, isPending: isSubmitting } = useSubmitFeedback(id)
  const [voted, setVoted] = useState(null)
  const { track } = useRecentlyViewed()

  useEffect(() => {
    if (guide) track(id)
  }, [id, guide, track])

  if (isLoading) {
    return (
      <div className="gp-shell">
        <VStack gap={4} hAlign="stretch">
          <div className="gp-skel gp-skel-crumb" />
          <div className="gp-skel gp-skel-title" />
          <div className="gp-skel gp-skel-line" />
          <div className="gp-skel gp-skel-block" />
        </VStack>
      </div>
    )
  }

  if (isError || !guide) {
    return (
      <div className="gp-shell">
        <div className="gp-empty">
          <span className="gp-empty-icon"><FileText size={18} /></span>
          <Text weight="medium">가이드를 찾을 수 없습니다</Text>
          <Text type="supporting">id: {id}</Text>
          <div className="gp-empty-action">
            <Button
              label="가이드 목록으로"
              variant="secondary"
              size="sm"
              onClick={() => navigate('/guides')}
            />
          </div>
        </div>
      </div>
    )
  }

  const tm = getGuideType(guide.type)
  const TypeIcon = tm.icon

  const handleVote = async (vote) => {
    if (voted) return
    setVoted(vote)
    try { await submit({ vote }) } catch { /* no-op */ }
  }

  const breadcrumbs = [
    { label: '홈', to: '/' },
    { label: '가이드', to: '/guides' },
    { label: guide.module },
  ]

  return (
    <div className="gp-shell">
      <VStack gap={0} hAlign="stretch">

        {/* ─── 헤더 ─────────────────────────────────────────────── */}
        <header className="gp-header">
          <nav aria-label="Breadcrumb" className="gp-crumbs">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="gp-crumb">
                {i > 0 && <span className="gp-crumb-sep">/</span>}
                {b.to ? (
                  <Link to={b.to} className="gp-crumb-link">{b.label}</Link>
                ) : (
                  <span className="gp-crumb-current">{b.label}</span>
                )}
              </span>
            ))}
          </nav>
          <VStack gap={1.5}>
            <Heading level={1}>{guide.title}</Heading>
            {guide.path && <Text type="supporting">{guide.path}</Text>}
          </VStack>

          {/* 메타바 — 유형 / 버전 / 작성자 / 수정일 / 대상 */}
          <div className="gp-meta">
            <Badge label={tm.label} variant={toTypeVariant(guide.type)} icon={<TypeIcon size={12} />} />
            {guide.version && (
              <span className="gp-meta-item"><GitBranch size={12} /> {guide.version}</span>
            )}
            {guide.author && (
              <span className="gp-meta-item"><User size={12} /> {guide.author}</span>
            )}
            {guide.updated && (
              <span className="gp-meta-item"><Clock size={12} /> {guide.updated}</span>
            )}
            {guide.targets?.length > 0 && (
              <span className="gp-meta-item"><ShieldCheck size={12} /> {guide.targets.join(', ')}</span>
            )}
            {guide.confluenceUrl && (
              <a
                href={`${guide.confluenceUrl}/${encodeURIComponent(guide.title.replace(/\s+/g, '+'))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="gp-meta-link"
              >
                <ExternalLink size={12} /> Confluence 원본
              </a>
            )}
          </div>
        </header>

        {/* 핵심 요약 */}
        {guide.tldr && (
          <Card className="gp-tldr" padding={0}>
            <div className="gp-tldr-body">
              <Text type="label" className="gp-tldr-eyebrow">핵심 요약</Text>
              <p className="gp-tldr-text">{guide.tldr}</p>
            </div>
          </Card>
        )}

        {/* 주의사항 */}
        {guide.cautions?.length > 0 && (
          <Card className="gp-caution" padding={0}>
            <div className="gp-caution-head">
              <AlertTriangle size={14} className="gp-caution-icon" />
              <span className="gp-caution-title">반드시 확인하세요</span>
            </div>
            <ul className="gp-caution-list">
              {guide.cautions.map((c, i) => (
                <li key={i}><span className="gp-caution-bullet">•</span><span>{c}</span></li>
              ))}
            </ul>
          </Card>
        )}

        {/* ─── SOP: 단계 ──────────────────────────────────────────── */}
        {guide.steps && (
          <section className="gp-section">
            <h2 className="gp-sec-title">처리 절차</h2>
            <ol className="gp-steps">
              {guide.steps.map((s, i) => (
                <li key={i}>
                  <Card padding={0}>
                    <div className="gp-step-head">
                      <span className="gp-step-num">{i + 1}</span>
                      <span className="gp-step-title">{s.title}</span>
                    </div>
                    <div className="gp-step-body">
                      {s.desc && <p className="prose-ams gp-prose-sm">{s.desc}</p>}
                      {s.image?.url && (
                        <GuideFigure src={s.image.url} alt={s.image.name} name={s.image.name} />
                      )}
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ─── 주요 항목 테이블 ─────────────────────────────────── */}
        {guide.mainItemsTable && (
          <section className="gp-section">
            <h2 className="gp-sec-title">주요 항목</h2>
            <div className="gp-table-wrap">
              <table className="gp-table gp-tmin520">
                <thead>
                  <tr>
                    <th className="gp-col-40">항목</th>
                    <th>설명</th>
                    <th className="gp-col-20 gp-center">필수</th>
                  </tr>
                </thead>
                <tbody>
                  {guide.mainItemsTable.map((it, i) => (
                    <tr key={i}>
                      <td className="gp-strong">{it.field}</td>
                      <td className="gp-muted">{it.desc}</td>
                      <td className="gp-center">
                        {it.required
                          ? <Badge label="필수" variant="red" />
                          : <span className="gp-muted gp-xs">선택</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ─── 케이스별 처리 ────────────────────────────────────── */}
        {guide.cases && (
          <section className="gp-section">
            <h2 className="gp-sec-title">케이스별 처리</h2>
            <VStack gap={3} hAlign="stretch">
              {guide.cases.map((c, i) => {
                const images = c.images?.length ? c.images : (c.image ? [c.image] : [])
                return (
                  <Card key={i} padding={0}>
                    <div className="gp-case-body">
                      <p className="gp-case-label">Case {i + 1}. {c.label}</p>
                      <p className="prose-ams gp-prose-sm">{c.action}</p>
                      {images.length > 0 && (
                        images.length > 1 ? (
                          <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
                            {images.map((img, j) => (
                              <GuideFigure
                                key={j}
                                src={img.url}
                                alt={img.name || `Case ${i + 1} image ${j + 1}`}
                                name={img.name}
                              />
                            ))}
                          </Grid>
                        ) : (
                          <GuideFigure
                            src={images[0].url}
                            alt={images[0].name || `Case ${i + 1} image`}
                            name={images[0].name}
                          />
                        )
                      )}
                      {c.note && (
                        <p className="gp-note"><span className="gp-note-tag">Note.</span> {c.note}</p>
                      )}
                    </div>
                  </Card>
                )
              })}
            </VStack>
          </section>
        )}

        {/* ─── 판단 테이블 ──────────────────────────────────────── */}
        {guide.decisionTable && (
          <section className="gp-section">
            <h2 className="gp-sec-title">판단 기준</h2>
            <div className="gp-table-wrap">
              <table className="gp-table gp-tmin640">
                <thead>
                  <tr>
                    <th>조건</th>
                    <th>처리</th>
                    <th className="gp-col-40">비고</th>
                    <th className="gp-col-20 gp-center">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {guide.decisionTable.map((r, i) => {
                    const st = DECISION_STATUS[r.status]
                    return (
                      <tr key={i}>
                        <td className="gp-strong">{r.cond}</td>
                        <td>{r.action}</td>
                        <td className="gp-muted gp-xs">{r.note}</td>
                        <td className="gp-center">
                          <Badge
                            label={st?.label ?? r.status}
                            variant={DECISION_BADGE_VARIANT[r.status] ?? 'neutral'}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ─── 트러블 테이블 ─────────────────────────────────────── */}
        {guide.troubleTable && (
          <section className="gp-section">
            <h2 className="gp-sec-title">자주 발생하는 오류</h2>
            <div className="gp-table-wrap">
              <table className="gp-table gp-tmin720">
                <thead>
                  <tr>
                    <th className="gp-col-25">오류</th>
                    <th className="gp-col-25">원인</th>
                    <th>해결</th>
                    <th className="gp-col-24 gp-center">심각도</th>
                  </tr>
                </thead>
                <tbody>
                  {guide.troubleTable.map((r, i) => {
                    const sv = SEVERITY[r.severity]
                    return (
                      <tr key={i}>
                        <td className="gp-strong">{r.issue}</td>
                        <td className="gp-muted">{r.cause}</td>
                        <td>{r.solution}</td>
                        <td className="gp-center">
                          <Badge
                            label={sv?.label ?? r.severity}
                            variant={SEVERITY_BADGE_VARIANT[r.severity] ?? 'neutral'}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ─── CS 응답 매뉴얼 ────────────────────────────────────── */}
        {guide.responses && (
          <section className="gp-section">
            <h2 className="gp-sec-title">응답 스크립트</h2>
            <VStack gap={3} hAlign="stretch">
              {guide.responses.map((r, i) => (
                <Card key={i} padding={0}>
                  <div className="gp-resp-body">
                    <Badge label={`시나리오 ${i + 1}`} variant="green" />
                    <p className="gp-resp-scenario">{r.scenario}</p>
                    <p className="gp-resp-script">&ldquo;{r.script}&rdquo;</p>
                  </div>
                </Card>
              ))}
            </VStack>
          </section>
        )}

        {/* ─── 참조 데이터 ───────────────────────────────────────── */}
        {guide.referenceData && (
          <section className="gp-section">
            <h2 className="gp-sec-title">참조 데이터</h2>
            <div className="gp-table-wrap">
              <table className="gp-table gp-tmin480">
                <thead>
                  <tr>
                    <th className="gp-col-40">용어</th>
                    <th>정의</th>
                  </tr>
                </thead>
                <tbody>
                  {guide.referenceData.map((r, i) => (
                    <tr key={i}>
                      <td className="gp-strong gp-mono">{r.term}</td>
                      <td className="gp-muted">{r.definition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ─── 정책 비교 ─────────────────────────────────────────── */}
        {guide.policyDiff && (
          <section className="gp-section">
            <h2 className="gp-sec-title">정책 비교 (전/후)</h2>
            <Grid columns={{ minWidth: 260, max: 2 }} gap={4}>
              <Card padding={0}>
                <div className="gp-diff-head gp-diff-before">변경 전</div>
                <div className="gp-diff-body gp-muted">{guide.policyDiff.before}</div>
              </Card>
              <Card className="gp-diff-after-card" padding={0}>
                <div className="gp-diff-head gp-diff-after">변경 후</div>
                <div className="gp-diff-body">{guide.policyDiff.after}</div>
              </Card>
            </Grid>
          </section>
        )}

        <div className="gp-divider"><Divider /></div>

        {/* ─── 유용성 피드백 ─────────────────────────────────────── */}
        <section>
          <Card padding={0}>
            <div className="gp-feedback">
              <div>
                <Text weight="medium">이 가이드가 도움이 되셨나요?</Text>
                <Text type="supporting">피드백은 가이드 개선에 사용됩니다.</Text>
              </div>
              <div className="gp-vote">
                {voted === 'helpful' ? (
                  <Badge label="소중한 피드백 감사합니다" variant="success" icon={<CheckCircle2 size={12} />} />
                ) : voted === 'needs_improvement' ? (
                  <Badge label="피드백이 기록되었습니다" variant="warning" icon={<CheckCircle2 size={12} />} />
                ) : (
                  <>
                    <Button
                      label="유용합니다"
                      variant="secondary"
                      size="sm"
                      icon={<ThumbsUp size={14} />}
                      isDisabled={isSubmitting}
                      onClick={() => handleVote('helpful')}
                    />
                    <Button
                      label="개선이 필요합니다"
                      variant="secondary"
                      size="sm"
                      icon={<ThumbsDown size={14} />}
                      isDisabled={isSubmitting}
                      onClick={() => handleVote('needs_improvement')}
                    />
                  </>
                )}
              </div>
            </div>
          </Card>
        </section>

      </VStack>
    </div>
  )
}

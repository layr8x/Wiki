// src/pages/FeedbackPage.jsx
// 구조: 헤더 → 타입 선택 카드 4개 → 제목/내용 입력 → 제출
// Astryx(Meta 디자인시스템) 표면으로 마이그레이션.
//   - 데이터 훅 없음. 폼 상태·검증·submitFeedback 제출·라우팅은 그대로 유지
//   - 시각 chrome(헤더/카드/버튼/라벨/오류배너)는 Astryx primitive로 교체
//   - 입력 컨트롤(Input/Textarea)도 Astryx(TextInput/TextArea)로 전환 — shadcn 잔재 제거
//   - 타입 선택 카드도 네이티브 <button> 대신 Astryx SelectableCard(단일 선택 카드)로 교체
import { useId, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChatCircle as MessageCircle,
  CheckCircle as CheckCircle2,
  Warning as AlertTriangle,
  BookOpen,
  Lightbulb,
  PaperPlaneTilt as Send,
  ArrowLeft,
  CaretRight as ChevronRight,
} from '@phosphor-icons/react'

import { VStack } from '@astryxdesign/core/VStack'
import { HStack } from '@astryxdesign/core/HStack'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { SelectableCard } from '@astryxdesign/core/SelectableCard'
import { FieldLabel } from '@astryxdesign/core/Field'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Banner } from '@astryxdesign/core/Banner'

import { submitFeedback } from '@/lib/db'
import './FeedbackPage.astryx.css'

const TYPES = [
  { id: 'error',       Icon: AlertTriangle, label: '오류 제보',       desc: '가이드 내용이 실제와 다릅니다',   family: 'red' },
  { id: 'missing',     Icon: BookOpen,      label: '내용 추가 요청',   desc: '필요한 가이드가 없습니다',       family: 'blue' },
  { id: 'improvement', Icon: Lightbulb,     label: '개선 제안',        desc: '더 나은 방법이 있습니다',        family: 'purple' },
  { id: 'other',       Icon: MessageCircle, label: '기타 문의',        desc: '위 항목에 해당되지 않습니다',    family: 'green' },
]

export default function FeedbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillTopic = searchParams.get('topic')?.slice(0, 200) ?? ''
  const [selectedType, setSelectedType] = useState(prefillTopic ? 'missing' : null)
  const [title, setTitle]   = useState(prefillTopic ? `"${prefillTopic}" 관련 가이드 추가 요청` : '')
  const [body, setBody]     = useState(prefillTopic ? `검색어 "${prefillTopic}" 에 대한 가이드가 필요합니다.\n\n어떤 상황/업무에서 필요한지 적어주세요:\n` : '')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)

  const typeInputId = useId()
  const typeLabelId = useId()

  const canSubmit = selectedType && title.trim().length > 0 && body.trim().length > 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      await submitFeedback({
        guideId: null,
        vote: selectedType,
        comment: `[${selectedType}] ${title}\n\n${body}`,
      })
      setSubmitted(true)
    } catch (err) {
      // 저장 실패는 반드시 사용자에게 노출 — 과거엔 성공으로 처리해 피드백이 조용히 증발했음
      if (import.meta.env.DEV) console.error('[FeedbackPage] submitFeedback failed', err)
      setError(err?.message || '제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="fb-shell">
        <div className="fb-success">
          <span className="fb-success-icon">
            <CheckCircle2 size={28} />
          </span>
          <VStack gap={1} hAlign="center">
            <Heading level={3}>피드백이 접수되었습니다</Heading>
            <Text type="supporting">
              빠른 시일 내 검토 후 가이드에 반영됩니다. 소중한 의견 감사합니다.
            </Text>
          </VStack>
          <HStack gap={2}>
            <Button
              label="홈으로"
              variant="secondary"
              size="sm"
              onClick={() => navigate('/')}
            />
            <Button
              label="다른 제보 보내기"
              variant="primary"
              size="sm"
              onClick={() => {
                setSubmitted(false); setSelectedType(null); setTitle(''); setBody('')
              }}
            />
          </HStack>
        </div>
      </div>
    )
  }

  return (
    <div className="fb-shell">
      <header className="fb-header">
        <nav aria-label="Breadcrumb" className="fb-crumb">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }}>홈</a>
          <span className="fb-crumb-sep"><ChevronRight size={12} /></span>
          <span className="fb-crumb-cur">피드백</span>
        </nav>
        <VStack gap={1.5}>
          <Heading level={1}>피드백 제출</Heading>
          <Text type="supporting">
            가이드 내용이 다르거나, 추가가 필요한 가이드가 있으면 알려주세요.
          </Text>
        </VStack>
      </header>

      <form onSubmit={handleSubmit} className="fb-form">
        {/* 1. 타입 선택 */}
        <div className="fb-field">
          <FieldLabel
            label="1. 제보 유형"
            inputID={typeInputId}
            labelID={typeLabelId}
            isGroupLabel
            isRequired
          />
          <div role="group" aria-labelledby={typeLabelId}>
            <Grid columns={{ minWidth: 260, max: 2 }} gap={3}>
              {TYPES.map(t => {
                const active = selectedType === t.id
                return (
                  <SelectableCard
                    key={t.id}
                    label={`${t.label}. ${t.desc}`}
                    isSelected={active}
                    onChange={() => setSelectedType(t.id)}
                    padding={4}
                  >
                    <div className="fb-type-row">
                      <span className="fb-tint" data-family={t.family}>
                        <t.Icon size={18} />
                      </span>
                      <span className="fb-type-body">
                        <Text weight="semibold">{t.label}</Text>
                        <Text type="supporting">{t.desc}</Text>
                      </span>
                      {active && <CheckCircle2 size={16} className="fb-type-check" aria-hidden="true" />}
                    </div>
                  </SelectableCard>
                )
              })}
            </Grid>
          </div>
        </div>

        {/* 2. 제목 */}
        <div className="fb-field">
          <TextInput
            label="2. 제목"
            isRequired
            placeholder="예: 회원 병합 가이드 3단계 스크린샷이 구버전"
            value={title}
            onChange={(v) => setTitle(v)}
            maxLength={80}
          />
          <div className="fb-count">{title.length} / 80</div>
        </div>

        {/* 3. 내용 */}
        <div className="fb-field">
          <TextArea
            label="3. 상세 내용"
            isRequired
            placeholder="구체적인 상황, 현재 가이드와 실제의 차이, 개선 제안 등을 자세히 적어주세요."
            value={body}
            onChange={(v) => setBody(v.slice(0, 1000))}
            rows={8}
            maxLength={1000}
          />
        </div>

        {/* 오류 배너 */}
        {error && <Banner status="error" title={error} />}

        {/* 제출 */}
        <div className="fb-footer">
          <Button
            label="취소"
            variant="ghost"
            size="sm"
            icon={<ArrowLeft size={14} />}
            onClick={() => navigate('/')}
          />
          <Button
            label={loading ? '제출 중...' : '제출하기'}
            variant="primary"
            type="submit"
            endContent={<Send size={14} />}
            isDisabled={!canSubmit || loading}
            isLoading={loading}
          />
        </div>
      </form>
    </div>
  )
}

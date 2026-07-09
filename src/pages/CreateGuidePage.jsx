// src/pages/CreateGuidePage.jsx
// 새 가이드 작성 — 2단계 위저드(템플릿 선택 → 기본 정보).
//
// Astryx(Meta 디자인시스템) 마이그레이션 — App.jsx에서 AstryxAppFrame 밖의 standalone
// 라우트(/create)로 렌더되므로 AstryxThemeRegion 으로 자체 <Theme> 영역을 연다.
//   - 폼 컨트롤(TextInput/TextArea/Selector)도 Astryx로 전환 — value/onChange 시그니처만
//     Astryx 컨벤션(값 직접 전달)에 맞춰 래핑, step 위저드/저장/검증 로직은 그대로.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { upsertGuide } from '@/lib/db'
import { useToast } from '@astryxdesign/core/Toast'
import { useAuth } from '@/store/authStore'
import {
  ArrowLeft,
  ListChecks,
  GitFork,
  BookOpen,
  Wrench,
  ChatCircle,
  Megaphone,
  Plus,
} from '@phosphor-icons/react'

import { Card } from '@astryxdesign/core/Card'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Selector } from '@astryxdesign/core/Selector'
import { VStack } from '@astryxdesign/core/VStack'

import AstryxThemeRegion from '@/components/common/AstryxThemeRegion'
import './CreateGuidePage.astryx.css'

const TEMPLATES = [
  { type: 'SOP', fullName: '절차형', desc: '단계별 작업 절차 정리', icon: ListChecks },
  { type: 'DECISION', fullName: '판단분기', desc: '조건/상황별 판단 기준', icon: GitFork },
  { type: 'REFERENCE', fullName: '참조형', desc: '정의/규정/가이드라인', icon: BookOpen },
  { type: 'TROUBLESHOOT', fullName: '문제해결', desc: '이슈 트러블슈팅', icon: Wrench },
  { type: 'FAQ', fullName: 'FAQ형', desc: '자주 묻는 질문 모음', icon: ChatCircle },
  { type: 'ANNOUNCEMENT', fullName: '공지형', desc: '중요 소식 및 알림', icon: Megaphone },
]

const MODULES = [
  { id: 'SOP', name: '운영 절차' },
  { id: 'SALES', name: '영업' },
  { id: 'CS', name: '고객 지원' },
  { id: 'MARKETING', name: '마케팅' },
  { id: 'PRODUCT', name: '상품 기획' },
  { id: 'TECH', name: '기술' },
  { id: 'HR', name: '인사' },
]

export default function CreateGuidePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [step, setStep] = useState('template') // template | details | edit
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    module: '',
    description: '',
  })

  const createMutation = useMutation({
    mutationFn: (newGuide) => upsertGuide(newGuide),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['guides'] })
      toast({ body: '가이드 생성됨 — 새 가이드가 생성되었습니다' })
      navigate(`/editor?id=${result.id}`)
    },
    onError: (error) => {
      toast({ body: '오류 — ' + error.message, type: 'error' })
    },
  })

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template)
    setStep('details')
  }

  const handleCreate = async () => {
    if (!formData.title.trim() || !formData.module) {
      toast({ body: '필수 항목 입력 — 제목과 모듈을 선택해주세요', type: 'error' })
      return
    }

    const newGuide = {
      title: formData.title,
      type: selectedTemplate.type,
      module: formData.module,
      description: formData.description,
      content: { sections: [] },
      status: 'draft',
      created_by: user?.id,
    }

    createMutation.mutate(newGuide)
  }

  return (
    <AstryxThemeRegion>
      <div className="cgp-shell">
        <div className="cgp-inner">
          <Button
            variant="ghost"
            size="sm"
            label="뒤로"
            icon={<ArrowLeft size={16} />}
            onClick={() => navigate(-1)}
            className="cgp-back"
          />

          {step === 'template' && (
            <>
              <div className="cgp-head">
                <Heading level={1}>새 가이드 작성</Heading>
                <Text type="supporting" className="cgp-head-desc">가이드 유형을 선택하세요</Text>
              </div>

              <div className="cgp-tpl-grid">
                {TEMPLATES.map((template) => {
                  const IconComponent = template.icon
                  return (
                    <ClickableCard
                      key={template.type}
                      label={`${template.fullName} 템플릿 선택`}
                      onClick={() => handleSelectTemplate(template)}
                      padding={5}
                      className="cgp-tpl-card"
                    >
                      <span className="cgp-tpl-icon">
                        <IconComponent size={24} />
                      </span>
                      <Text weight="semibold" className="cgp-tpl-title">{template.fullName}</Text>
                      <Text type="supporting" className="cgp-tpl-desc">{template.desc}</Text>
                    </ClickableCard>
                  )
                })}
              </div>
            </>
          )}

          {step === 'details' && (
            <>
              <div className="cgp-details-head">
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  label="템플릿 선택으로"
                  icon={<ArrowLeft size={20} />}
                  onClick={() => setStep('template')}
                />
                <div>
                  <Heading level={2}>기본 정보</Heading>
                  <div className="cgp-details-title">
                    <Text type="supporting">선택:</Text>
                    <Badge label={selectedTemplate.fullName} variant="info" />
                  </div>
                </div>
              </div>

              <Card className="cgp-form-card" padding={6}>
                <div className="cgp-form-title">
                  <Heading level={4}>가이드 정보</Heading>
                </div>
                <VStack gap={6} className="cgp-form-fields">
                  <TextInput
                    label="제목"
                    isRequired
                    placeholder="가이드 제목을 입력하세요"
                    value={formData.title}
                    onChange={(title) => setFormData({ ...formData, title })}
                  />

                  <Selector
                    label="모듈"
                    isRequired
                    placeholder="모듈 선택"
                    options={MODULES.map((mod) => ({ value: mod.id, label: mod.name }))}
                    value={formData.module}
                    onChange={(module) => setFormData({ ...formData, module })}
                  />

                  <TextArea
                    label="설명"
                    isOptional
                    placeholder="가이드 개요를 입력하세요 (선택사항)"
                    value={formData.description}
                    onChange={(description) => setFormData({ ...formData, description })}
                    rows={4}
                  />
                </VStack>
              </Card>

              <div className="cgp-actions">
                <Button variant="secondary" label="뒤로" onClick={() => setStep('template')} />
                <Button
                  variant="primary"
                  label={createMutation.isPending ? '생성 중...' : '가이드 작성 시작'}
                  icon={<Plus size={16} />}
                  isLoading={createMutation.isPending}
                  onClick={handleCreate}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </AstryxThemeRegion>
  )
}

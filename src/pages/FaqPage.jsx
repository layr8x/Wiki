// src/pages/FaqPage.jsx
// 구조: 헤더(브레드크럼+제목) → 카테고리 pill → 아코디언(펼침/접힘)
//
// Astryx(Meta 디자인시스템) 표면으로 마이그레이션.
//   - 데이터(officialQa + managerFaq 병합)·필터·펼침/접힘 로직은 100% 유지
//   - 시각 요소만 Astryx primitive(Card/Badge/Heading/Text/VStack/HStack)로 교체
//   - 전역 <Theme>(AstryxAppFrame)가 토큰/모드를 제공하므로 여기서 Theme로 감싸지 않는다
//
// 분류·내용 단일화: 챗봇 대메뉴(CHIP_MENU) 7개와 "동일한 분류 + 동일한 데이터"로
// 노출한다. 챗봇이 칩에서 보여주는 공식 Q&A(officialQa, getQaByCategory)와
// 매니저 FAQ(managerFaq)를 같은 7개 분류로 합쳐, 챗봇과 위키 FAQ가 어긋나지 않게 한다.
import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CaretRight as ChevronRight, CaretDown as ChevronDown } from '@phosphor-icons/react'

import { VStack } from '@astryxdesign/core/VStack'
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'

import { CHIP_MENU } from '@/components/chatbot/chatbotConfig'
import { getQaByCategory } from '@/data/officialQa'
import { MANAGER_FAQ } from '@/data/managerFaq'
import './FaqPage.astryx.css'

// 챗봇 7개 대메뉴와 동일하게 구성. 각 분류 = 공식 Q&A(payment+refund 병합 포함) + 매니저 FAQ.
const FAQ_ITEMS = CHIP_MENU.flatMap((chip) =>
  [
    ...getQaByCategory(chip.id),
    ...MANAGER_FAQ.filter((f) => f.category === chip.label),
  ].map((item) => ({ ...item, cat: chip.label }))
)

const CATEGORIES = ['전체', ...CHIP_MENU.map((c) => c.label)]

export default function FaqPage() {
  const [category, setCategory] = useState('전체')
  const [openKey, setOpenKey] = useState(null)

  const filtered = useMemo(
    () => (category === '전체' ? FAQ_ITEMS : FAQ_ITEMS.filter((f) => f.cat === category)),
    [category]
  )

  return (
    <div className="faq-shell">
      <VStack gap={8} hAlign="stretch">

        {/* ─── 헤더 ─────────────────────────────────────────────── */}
        <header>
          <VStack gap={3} hAlign="stretch">
            <nav aria-label="Breadcrumb" className="faq-crumbs">
              <Link to="/" className="faq-crumb-link">홈</Link>
              <ChevronRight size={12} className="faq-crumb-sep" />
              <span className="faq-crumb-cur">FAQ</span>
            </nav>
            <VStack gap={1.5}>
              <Heading level={1}>운영 FAQ</Heading>
              <Text type="supporting">
                {`상담실장님들이 가장 자주 묻는 반복 문의 ${FAQ_ITEMS.length}개 문항 · 챗봇과 동일한 7개 분류`}
              </Text>
            </VStack>
          </VStack>
        </header>

        {/* ─── 카테고리 pill ────────────────────────────────────── */}
        <div className="faq-pills" role="group" aria-label="카테고리 필터">
          {CATEGORIES.map((cat) => {
            const count = cat === '전체'
              ? FAQ_ITEMS.length
              : FAQ_ITEMS.filter((f) => f.cat === cat).length
            const active = category === cat
            return (
              <button
                key={cat}
                type="button"
                onClick={() => { setCategory(cat); setOpenKey(null) }}
                aria-pressed={active}
                className="faq-pill"
                data-active={active || undefined}
              >
                {cat}
                <span className="faq-pill-count">{count}</span>
              </button>
            )
          })}
        </div>

        {/* ─── 아코디언 ─────────────────────────────────────────── */}
        <Card padding={0}>
          {filtered.length === 0 ? (
            <div className="faq-empty">
              <Text type="supporting">
                ‘오류신고’는 접수 메뉴예요. 등록된 FAQ 문항은 없습니다.
              </Text>
            </div>
          ) : (
            <ul className="faq-list">
              {filtered.map((item, i) => {
                const key = `${category}-${i}`
                const open = openKey === key
                return (
                  <li key={key} className="faq-item">
                    <button
                      type="button"
                      className="faq-trigger"
                      aria-expanded={open}
                      onClick={() => setOpenKey(open ? null : key)}
                    >
                      <span className="faq-trigger-main">
                        <Badge label={item.cat} variant="neutral" />
                        <Text weight="medium" className="faq-question">{item.q}</Text>
                      </span>
                      <ChevronDown
                        size={16}
                        className="faq-chevron"
                        data-open={open || undefined}
                      />
                    </button>
                    <div className="faq-panel" data-open={open || undefined}>
                      <div className="faq-panel-inner">
                        <Text as="p" type="body" className="faq-answer">{item.a}</Text>
                        {item.guideId && (
                          <Link to={`/guides/${item.guideId}`} className="faq-guide-link">
                            관련 가이드 보기 <ChevronRight size={12} />
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

      </VStack>
    </div>
  )
}

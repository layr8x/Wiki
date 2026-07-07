// src/pages/UpdatesPage.jsx
// 구조: 헤더(브레드크럼+타이틀) → 타입 필터 → 월 그룹별 타임라인
// Astryx(Meta 디자인시스템) 표면으로 마이그레이션.
//   - 필터/월 그룹핑 로직·라우팅은 그대로 유지, 시각 요소만 Astryx primitive로 교체
//   - 전역 <Theme>(AstryxAppFrame)가 테마를 제공하므로 여기서 Theme/CSS를 import 하지 않음
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkle as Sparkles,
  Gear as FileCog,
  BookOpen,
  Warning as AlertTriangle,
  CaretRight as ChevronRight,
} from '@phosphor-icons/react'

import { VStack } from '@astryxdesign/core/VStack'
import { HStack } from '@astryxdesign/core/HStack'
import { Card } from '@astryxdesign/core/Card'
import { Badge } from '@astryxdesign/core/Badge'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'

import './UpdatesPage.astryx.css'

const UPDATES_DATA = [
  { date:'2026-04-15', type:'feature', title:'AMS 운영 위키 베타 오픈', desc:'흩어져 있던 운영 가이드를 한 곳에 모은 통합 위키 시스템이 오픈되었습니다. 모집/접수부터 청구/환불까지 21개 가이드를 검색 한 번으로 찾아보세요.', guideId:null },
  { date:'2026-04-12', type:'guide',   title:'강좌 생성 가이드 v2.0 업데이트', desc:'단기 특강, 연간반 설정 케이스와 강사 미등록 오류 해결 방법이 추가되었습니다.', guideId:'course-create' },
  { date:'2026-04-10', type:'policy',  title:'환불 정책 개정 — 교재비 별도 정산 기준 명확화', desc:'개강 전 취소 시 교재비 반환 절차가 별도로 명시되었습니다.', guideId:'refund-policy' },
  { date:'2026-04-06', type:'guide',   title:'문자 발송 가이드 신규 추가', desc:'SMS/LMS 발송 방법, 변수 사용법, 대량 발송 승인 절차를 포함합니다.', guideId:'sms-send' },
  { date:'2026-04-01', type:'policy',  title:'2026년 환불 정책 변경 적용', desc:'수강료 및 교재비 환불 산정 기준이 새롭게 개정되었습니다.', guideId:'refund-policy' },
  { date:'2026-03-25', type:'feature', title:'QR 출석 트러블슈팅 가이드 v3.2 업데이트', desc:'현장 기기별 인식 실패 원인이 추가되었습니다.', guideId:'qr-trouble' },
  { date:'2026-03-20', type:'feature', title:'회원 병합 시 녹취록 첨부 기능 추가', desc:'학부모 동의 녹취록 파일을 직접 첨부할 수 있는 기능이 추가되었습니다.', guideId:'member-merge' },
  { date:'2026-03-14', type:'guide',   title:'전반 처리 가이드 업데이트', desc:'전반 처리 불가 케이스에 "혜택(쿠폰) 변경" 항목이 추가되었습니다.', guideId:'class-transfer' },
  { date:'2026-03-04', type:'guide',   title:'청구 생성 가이드 v1.8 업데이트', desc:'수강예정회차 확인 절차 강조 및 연결교재 추가 청구 케이스가 신규 추가되었습니다.', guideId:'billing-guide' },
  { date:'2026-02-04', type:'guide',   title:'전환결제 처리 가이드 v2.0 릴리즈', desc:'온라인 전환 시 결제요청 URL 발송 기능이 추가되었습니다.', guideId:'payment-switch' },
]

// 타입별 아이콘 · Astryx Badge variant(색 패밀리) · 라벨.
// 기존 shadcn 틴트(sop=blue, policy=amber, response=emerald, trouble=red)를
// Astryx 색 variant(blue/yellow/green/red)로 대응.
const TYPE_CFG = {
  feature: { icon: Sparkles,      variant: 'blue',   family: 'blue',   label: '기능 개선' },
  policy:  { icon: FileCog,       variant: 'yellow', family: 'yellow', label: '정책 변경' },
  guide:   { icon: BookOpen,      variant: 'green',  family: 'green',  label: '가이드 업데이트' },
  alert:   { icon: AlertTriangle, variant: 'red',    family: 'red',    label: '긴급 공지' },
}

const TYPE_FILTERS = [
  { value: 'all',     label: '전체' },
  { value: 'feature', label: '기능 개선' },
  { value: 'policy',  label: '정책 변경' },
  { value: 'guide',   label: '가이드' },
]

export default function UpdatesPage() {
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(
    () => filter === 'all' ? UPDATES_DATA : UPDATES_DATA.filter(u => u.type === filter),
    [filter]
  )

  // 월별 그룹
  const grouped = useMemo(() => {
    const map = new Map()
    for (const item of filtered) {
      const key = item.date.slice(0, 7) // "2026-04"
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(item)
    }
    return Array.from(map.entries())
  }, [filtered])

  return (
    <div className="up-shell">
      <VStack gap={8} hAlign="stretch">

        {/* ─── 헤더 ─────────────────────────────────────────────── */}
        <VStack gap={3} hAlign="stretch">
          <nav aria-label="Breadcrumb" className="up-crumbs">
            <Link to="/" className="up-crumb-link">홈</Link>
            <ChevronRight size={12} className="up-crumb-sep" />
            <span className="up-crumb-current">업데이트</span>
          </nav>
          <VStack gap={1.5}>
            <Heading level={1}>업데이트 이력</Heading>
            <Text type="supporting">
              {`AMS 기능 개선 및 주요 정책 변경 사항 · ${UPDATES_DATA.length}건`}
            </Text>
          </VStack>
        </VStack>

        {/* ─── 타입 필터 ────────────────────────────────────────── */}
        <div className="up-filters" role="group" aria-label="업데이트 타입 필터">
          {TYPE_FILTERS.map(f => {
            const count = f.value === 'all'
              ? UPDATES_DATA.length
              : UPDATES_DATA.filter(u => u.type === f.value).length
            const active = filter === f.value
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={active}
                data-active={active}
                className="up-filter"
              >
                {f.label}
                <span className="up-filter-count">{count}</span>
              </button>
            )
          })}
        </div>

        {/* ─── 타임라인 ─────────────────────────────────────────── */}
        <VStack gap={10} hAlign="stretch">
          {grouped.map(([month, items]) => (
            <section key={month}>
              <h3 className="up-month">{month.replace('-', '년 ')}월</h3>
              <div className="up-timeline">
                {items.map((item, idx) => {
                  const cfg = TYPE_CFG[item.type] ?? TYPE_CFG.feature
                  const Icon = cfg.icon
                  return (
                    <div key={idx} className="up-item">
                      {/* 아이콘 노드 */}
                      <span className="up-node" data-family={cfg.family}>
                        <Icon size={11} />
                      </span>

                      {/* 카드 */}
                      <Card className="up-card" padding={4}>
                        <VStack gap={1.5}>
                          <HStack gap={2} vAlign="center">
                            <Badge label={cfg.label} variant={cfg.variant} />
                            <Text type="supporting" hasTabularNumbers>{item.date}</Text>
                          </HStack>
                          <Text weight="semibold">{item.title}</Text>
                          <Text type="supporting">{item.desc}</Text>
                          {item.guideId && (
                            <Link to={`/guides/${item.guideId}`} className="up-guide-link">
                              관련 가이드 보기 <ChevronRight size={12} />
                            </Link>
                          )}
                        </VStack>
                      </Card>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </VStack>

      </VStack>
    </div>
  )
}

// src/lib/__tests__/db.test.js
// db.js — mockData 폴백 경로 검증.
// 테스트 환경에는 VITE_SUPABASE_URL 이 없어 isSupabaseEnabled=false 로 폴백된다.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  fetchGuides,
  fetchGuide,
  fetchModuleStats,
  fetchRecentGuides,
  fetchPopularGuides,
  searchGuides,
  submitFeedback,
  fetchFeedbackStats,
  incrementViews,
  fetchDashboardStats,
  getModuleTree,
  fetchAdminGuides,
  updateGuideStatus,
  upsertGuide,
  deleteGuide,
  fetchAdminFeedback,
} from '../db'
import { GUIDES, MODULE_TREE } from '@/data/mockData'
import { STORAGE_KEYS } from '@/lib/storageKeys'

// .env.local 에 실제 Supabase 자격증명이 있어도(로컬 개발용) 이 스위트는 항상
// mockData fallback 경로를 검증해야 하므로 명시적으로 mock 한다. env 부재에
// 암묵적으로 기대면 안 됨 — src/hooks/__tests__/useAnalyticsSummary.test.jsx 와 동일 패턴.
vi.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: false,
  supabase: null,
}))

describe('db.js (mockData fallback)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('fetchGuides', () => {
    it('파라미터 없으면 전체 목록 반환', async () => {
      const all = await fetchGuides()
      expect(all.length).toBe(Object.keys(GUIDES).length)
      expect(all[0]).toHaveProperty('id')
      expect(all[0]).toHaveProperty('title')
    })

    it('module 필터 적용', async () => {
      const list = await fetchGuides({ module: '고객(원생) 관리' })
      expect(list.length).toBeGreaterThan(0)
      expect(list.every(g => g.module === '고객(원생) 관리')).toBe(true)
    })

    it('type 필터 적용', async () => {
      const list = await fetchGuides({ type: 'SOP' })
      expect(list.length).toBeGreaterThan(0)
      expect(list.every(g => g.type === 'SOP')).toBe(true)
    })

    it('search 는 title/tldr 에 대해 대소문자 무시 매치', async () => {
      const list = await fetchGuides({ search: '병합' })
      expect(list.length).toBeGreaterThan(0)
      expect(list.some(g => g.title?.includes('병합'))).toBe(true)
    })

    it('limit/offset 페이지네이션 적용', async () => {
      const page1 = await fetchGuides({ limit: 5, offset: 0 })
      const page2 = await fetchGuides({ limit: 5, offset: 5 })
      expect(page1.length).toBe(5)
      expect(page2.length).toBe(5)
      expect(page1[0].id).not.toBe(page2[0].id)
    })
  })

  describe('fetchGuide', () => {
    it('id 로 단일 가이드 반환', async () => {
      const g = await fetchGuide('member-merge')
      expect(g.id).toBe('member-merge')
      expect(g.title).toContain('병합')
    })

    it('없는 id 는 에러', async () => {
      await expect(fetchGuide('__none__')).rejects.toThrow(/찾을 수 없습니다/)
    })
  })

  describe('fetchModuleStats', () => {
    it('모듈별 가이드 수 맵 반환', async () => {
      const counts = await fetchModuleStats()
      expect(typeof counts).toBe('object')
      const total = Object.values(counts).reduce((a, b) => a + b, 0)
      expect(total).toBe(Object.keys(GUIDES).length)
    })
  })

  describe('fetchRecentGuides / fetchPopularGuides', () => {
    it('기본 n=8 이하, 명시적 n 존중', async () => {
      const r = await fetchRecentGuides(3)
      expect(r.length).toBeLessThanOrEqual(3)

      const p = await fetchPopularGuides(2)
      expect(p.length).toBeLessThanOrEqual(2)
    })
  })

  describe('searchGuides (fulltext)', () => {
    it('빈 쿼리 → 빈 배열', async () => {
      expect(await searchGuides('')).toEqual([])
      expect(await searchGuides('   ')).toEqual([])
    })

    it('매치되는 쿼리는 결과 반환', async () => {
      const list = await searchGuides('병합', 10)
      expect(list.length).toBeGreaterThan(0)
      expect(list.length).toBeLessThanOrEqual(10)
    })

    it('모듈명 부분 매칭도 허용', async () => {
      const list = await searchGuides('고객')
      expect(list.length).toBeGreaterThan(0)
    })
  })

  describe('submitFeedback', () => {
    it('vote/comment 를 mock prefix 키에 저장', async () => {
      await submitFeedback({ guideId: 'member-merge', vote: 'helpful', comment: '감사합니다' })
      const key = `${STORAGE_KEYS.feedbackMockPrefix}member-merge`
      const stored = JSON.parse(localStorage.getItem(key))
      expect(stored.vote).toBe('helpful')
      expect(stored.comment).toBe('감사합니다')
      expect(typeof stored.ts).toBe('number')
    })
  })

  describe('fetchFeedbackStats', () => {
    it('없는 가이드는 0 통계', async () => {
      const stats = await fetchFeedbackStats('__none__')
      expect(stats).toEqual({ total: 0, helpful: 0, helpfulRate: 0 })
    })

    it('가이드 있으면 helpful/helpfulRate 반환', async () => {
      const stats = await fetchFeedbackStats('member-merge')
      expect(stats).toHaveProperty('total')
      expect(stats).toHaveProperty('helpful')
      expect(stats).toHaveProperty('helpfulRate')
      expect(stats.needsImprovement).toBe(0)
    })
  })

  describe('incrementViews', () => {
    it('mock 모드에서는 noop — 에러 없이 완료', async () => {
      await expect(incrementViews('member-merge')).resolves.toBeUndefined()
    })
  })

  describe('fetchDashboardStats', () => {
    it('mock 집계 — SSOT 기반 totalGuides + 미측정값 null', async () => {
      const s = await fetchDashboardStats()
      // mock 폴백은 실제 SSOT(officialQa + FVSOL + AMS) 합계를 반환 (GUIDES 개수와 무관)
      expect(typeof s.totalGuides).toBe('number')
      expect(s.totalGuides).toBeGreaterThan(0)
      // Supabase 미연결 시 조회수/만족도/검색수는 측정 전이라 null
      expect(s.totalViews).toBeNull()
      expect(s.helpfulRate).toBeNull()
      expect(s.searchCount).toBeNull()
    })
  })

  describe('getModuleTree', () => {
    it('mockData MODULE_TREE 를 그대로 반환', () => {
      expect(getModuleTree()).toBe(MODULE_TREE)
    })
  })

  describe('fetchAdminGuides', () => {
    it('status=all 이 기본, 전체 반환', async () => {
      const list = await fetchAdminGuides()
      expect(list.length).toBe(Object.keys(GUIDES).length)
    })

    it('status=published 필터', async () => {
      const list = await fetchAdminGuides({ status: 'published' })
      expect(list.every(g => g.status === 'published')).toBe(true)
    })

    it('search 필터 — title/tldr ilike', async () => {
      const list = await fetchAdminGuides({ search: '병합' })
      expect(list.length).toBeGreaterThan(0)
    })
  })

  describe('updateGuideStatus', () => {
    it('허용 status 는 true 반환', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const ok = await updateGuideStatus('member-merge', 'archived')
      expect(ok).toBe(true)
      spy.mockRestore()
    })

    it('잘못된 status 는 에러', async () => {
      await expect(updateGuideStatus('x', 'invalid-status')).rejects.toThrow(/잘못된 status/)
    })
  })

  describe('upsertGuide', () => {
    it('mock 모드에서 입력 guide 객체 그대로 반환', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const input = { id: 'test', title: 'T', module: 'M' }
      const out = await upsertGuide(input)
      expect(out).toEqual(input)
      spy.mockRestore()
    })
  })

  describe('deleteGuide', () => {
    it('hard=false(기본) 는 archived 로 상태 변경', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const ok = await deleteGuide('member-merge')
      expect(ok).toBe(true)
      spy.mockRestore()
    })

    it('hard=true 는 true 반환 (mock 은 noop)', async () => {
      const ok = await deleteGuide('x', { hard: true })
      expect(ok).toBe(true)
    })
  })

  describe('fetchAdminFeedback', () => {
    it('mock 모드에서는 빈 배열', async () => {
      expect(await fetchAdminFeedback()).toEqual([])
    })
  })
})

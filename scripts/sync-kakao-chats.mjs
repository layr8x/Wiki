#!/usr/bin/env node
/**
 * scripts/sync-kakao-chats.mjs
 *
 * 카카오 비즈니스 채널 채팅 자동 수집기 (Playwright 기반).
 * business.kakao.com 채널의 모든 상담 채팅을 CSV로 추출.
 *
 * ─── 왜 이 스크립트가 필요한가 ─────────────────────────────────────────
 * 마이클래스 CS 상담 분석 데이터셋(src/data/csInsights.js)의 원본은
 * 카카오 비즈니스에서 수동 export 한 CSV. 이를 주기적·자동으로 갱신하기 위함.
 * 본 스크립트는 사용자 PC에서 실행되며, 사용자가 카카오 비즈니스에
 * 로그인된 세션의 쿠키를 .env.local 에 저장해두면 자동으로 동작.
 *
 * ─── 환경변수 (.env.local) ─────────────────────────────────────────────
 *   KAKAO_BUSINESS_COOKIE       필수. document.cookie 전체를 그대로 복사
 *   KAKAO_CHANNEL_ID            필수. 채널 식별자 (URL 의 _XXXX 부분)
 *   KAKAO_OUTPUT_CSV            선택. 기본 data/kakao-chats-{date}.csv
 *   KAKAO_MAX_THREADS           선택. 기본 0 (= 전체)
 *   KAKAO_HEADLESS              선택. 기본 true. false 시 브라우저 창 표시(디버그)
 *   KAKAO_MASK_PII              선택. 기본 true. 학생명/번호/이메일 마스킹
 *   KAKAO_SINCE_DAYS            선택. 기본 0 (= 전체). 예: 30 → 최근 30일만
 *
 * ─── 사용 ──────────────────────────────────────────────────────────────
 *   1) npm install   (Playwright 자동 설치 안되면)
 *   2) npx playwright install chromium
 *   3) .env.local 에 KAKAO_BUSINESS_COOKIE / KAKAO_CHANNEL_ID 입력
 *   4) node scripts/sync-kakao-chats.mjs
 *      → data/kakao-chats-YYYY-MM-DD.csv 생성
 *
 * ─── 쿠키 추출 방법 ────────────────────────────────────────────────────
 *   1) Chrome 으로 https://business.kakao.com 로그인
 *   2) DevTools (F12) > Console 탭
 *   3) document.cookie 입력 후 엔터
 *   4) 따옴표 안 전체 문자열 복사 (예: "_kawlt=xxx; _kahai=yyy; ...")
 *   5) .env.local 에 KAKAO_BUSINESS_COOKIE='복사한 문자열' 저장
 *
 * ─── 주의 ──────────────────────────────────────────────────────────────
 *   - 본 스크립트는 사용자 본인의 채널 데이터를 본인이 직접 추출하기 위한 것.
 *   - 카카오 비즈니스 ToS 검토 후 사용 권장.
 *   - 추출된 CSV 에는 학생/학부모 개인정보가 포함될 수 있으므로
 *     KAKAO_MASK_PII=true (기본) 옵션으로 자동 마스킹 권장.
 *   - 쿠키는 절대 git 커밋 금지 (.env.local 은 .gitignore 에 포함).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { maskName, maskBody } from '../src/lib/maskPII.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ─── .env.local 파싱 (sync-confluence.mjs 와 동일 패턴) ──────────────────
async function loadEnv() {
  try {
    const raw = await readFile(resolve(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const [, k, v] = m
      if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, '')
    }
  } catch { /* .env.local 없음 — 환경변수로만 구동 */ }
}

await loadEnv()

// ─── 설정 ─────────────────────────────────────────────────────────────────
const COOKIE        = process.env.KAKAO_BUSINESS_COOKIE
const CHANNEL_ID    = process.env.KAKAO_CHANNEL_ID
const OUTPUT_CSV    = process.env.KAKAO_OUTPUT_CSV
                       || resolve(ROOT, `data/kakao-chats-${new Date().toISOString().slice(0,10)}.csv`)
const MAX_THREADS   = Number(process.env.KAKAO_MAX_THREADS || 0)
const HEADLESS      = (process.env.KAKAO_HEADLESS || 'true').toLowerCase() !== 'false'
const MASK_PII      = (process.env.KAKAO_MASK_PII || 'true').toLowerCase() !== 'false'
const SINCE_DAYS    = Number(process.env.KAKAO_SINCE_DAYS || 0)

const BASE_URL      = 'https://business.kakao.com'
const CHATS_PATH    = (id) => `/${id}/chats`

if (!COOKIE || !CHANNEL_ID) {
  console.error('❌ KAKAO_BUSINESS_COOKIE 와 KAKAO_CHANNEL_ID 가 필요합니다.')
  console.error('   .env.local 에 다음을 추가하세요:')
  console.error('   KAKAO_BUSINESS_COOKIE=_kawlt=...; _kahai=...; ...')
  console.error('   KAKAO_CHANNEL_ID=_VGAQn   (URL 의 _XXXX 부분)')
  process.exit(1)
}

// ─── Playwright 동적 import (devDependency) ─────────────────────────────
let chromium
try {
  ({ chromium } = await import('playwright'))
} catch {
  console.error('❌ playwright 가 설치되어 있지 않습니다.')
  console.error('   다음을 실행하세요:')
  console.error('   npm install -D playwright')
  console.error('   npx playwright install chromium')
  process.exit(1)
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────
const log = (...a) => console.log('[kakao-sync]', ...a)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// 쿠키 문자열 → Playwright cookies 배열
function parseCookieString(raw, domain = '.kakao.com') {
  return raw.split(';').map(p => {
    const idx = p.indexOf('=')
    if (idx < 0) return null
    const name = p.slice(0, idx).trim()
    const value = p.slice(idx + 1).trim()
    return { name, value, domain, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }
  }).filter(Boolean)
}

// PII 마스킹: 핵심 로직(src/lib/maskPII.js — kakao-sanitize.mjs 와 동일 규칙)을 그대로 재사용.
//   ⚠️ 예전엔 이 스크립트만 자체 정규식을 썼는데, 주민번호·카드번호 패턴이 아예 없고
//   휴대폰번호도 통짜로 지워버렸으며, 특히 이름 정규식(/[가-힣]{1}([가-힣]{1,2})/g)이
//   라벨·줄 경계 없이 "아무 한글 2~3자 연속"에 매칭돼 일반 문장(예: "안녕하세요")까지
//   별표로 훼손하는 버그가 있었다(마스킹 누락이 아니라 반대로 본문 오염). 핵심 로직 재사용으로 교정.
function maskPII(text) {
  if (!text || !MASK_PII) return text
  return maskBody(text)
}
// 발신자명(sender_name)은 필드 전체가 이름이므로 라벨 매칭 없이 바로 부분마스킹 적용.
function maskSenderName(name) {
  if (!name || !MASK_PII) return name
  return maskName(name)
}

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ')
  return /[",]/.test(s) ? `"${s}"` : s
}

// ─── 메인 수집 로직 ──────────────────────────────────────────────────────
async function collectChats() {
  log(`headless=${HEADLESS}, mask_pii=${MASK_PII}, since_days=${SINCE_DAYS || 'all'}, max=${MAX_THREADS || 'all'}`)
  log(`channel: ${CHANNEL_ID}`)

  const browser = await chromium.launch({ headless: HEADLESS })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
    locale: 'ko-KR',
  })
  await ctx.addCookies(parseCookieString(COOKIE))
  const page = await ctx.newPage()

  // 인증 검증
  log('로그인 세션 검증 중...')
  await page.goto(`${BASE_URL}${CHATS_PATH(CHANNEL_ID)}`, { waitUntil: 'domcontentloaded', timeout: 30000 })

  // 로그인 페이지로 리다이렉트되면 쿠키 만료
  const url = page.url()
  if (url.includes('accounts.kakao.com') || url.includes('login')) {
    log('❌ 인증 실패 — 쿠키가 만료되었거나 잘못되었습니다.')
    log(`   현재 URL: ${url}`)
    log('   브라우저 DevTools 에서 document.cookie 를 다시 추출해 .env.local 에 갱신하세요.')
    await browser.close()
    process.exit(2)
  }

  // 채팅 목록 로딩 대기 (셀렉터는 카카오 비즈니스 페이지 변경에 따라 갱신 필요)
  // 실제 구조 확인 후 SELECTORS 객체를 조정해야 합니다.
  const SELECTORS = {
    chatList:       '[data-testid="chat-list"], .chat-list, [class*="ChatList"]',
    chatThread:     '[data-testid="chat-thread"], .chat-thread, [class*="ChatThread"], li[class*="chat"]',
    chatTitle:      '[class*="title"], [class*="Title"], h3, .name',
    chatMessages:   '[data-testid="message"], .message, [class*="Message"]',
    messageSender:  '[class*="sender"], [class*="Sender"], .author',
    messageBody:    '[class*="body"], [class*="Body"], .text',
    messageTime:    '[class*="time"], [class*="Time"], time',
    loadMore:       'button[class*="more"], [class*="LoadMore"], [class*="Pagination"] button',
  }

  log('채팅 목록 로딩 대기...')
  try {
    await page.waitForSelector(SELECTORS.chatList, { timeout: 15000 })
  } catch {
    log('⚠️  채팅 목록 셀렉터를 찾지 못했습니다. 페이지 구조가 변경된 것 같습니다.')
    log('    KAKAO_HEADLESS=false 로 실행해서 페이지 구조를 확인 후')
    log('    이 스크립트의 SELECTORS 객체를 갱신해주세요.')
    await page.screenshot({ path: 'data/kakao-debug.png', fullPage: true }).catch(() => {})
    log('    디버그 스크린샷: data/kakao-debug.png')
    await browser.close()
    process.exit(3)
  }

  // 무한 스크롤 또는 페이지네이션 처리
  log('전체 채팅 목록 로드 중 (스크롤)...')
  let prevCount = 0
  for (let i = 0; i < 200; i++) {
    const count = await page.locator(SELECTORS.chatThread).count()
    if (count === prevCount && i > 5) break
    if (MAX_THREADS && count >= MAX_THREADS) break
    prevCount = count
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await sleep(500)
  }
  log(`발견된 채팅 thread: ${prevCount}건`)

  // 각 thread 클릭 → 메시지 추출
  const rows = []
  const threads = await page.locator(SELECTORS.chatThread).all()
  const limit = MAX_THREADS ? Math.min(MAX_THREADS, threads.length) : threads.length
  const sinceDate = SINCE_DAYS ? new Date(Date.now() - SINCE_DAYS * 86400000) : null

  for (let i = 0; i < limit; i++) {
    try {
      await threads[i].click()
      await sleep(400)
      const title = (await page.locator(SELECTORS.chatTitle).first().textContent().catch(() => '')) || ''

      // 메시지 영역에서 모든 메시지 수집
      const messages = await page.locator(SELECTORS.chatMessages).all()
      for (const msg of messages) {
        const sender = (await msg.locator(SELECTORS.messageSender).textContent().catch(() => '')) || ''
        const body   = (await msg.locator(SELECTORS.messageBody).textContent().catch(() => '')) || ''
        const time   = (await msg.locator(SELECTORS.messageTime).textContent().catch(() => '')) || ''
        const isoTime = parseTime(time)
        if (sinceDate && isoTime && new Date(isoTime) < sinceDate) continue
        if (!body.trim()) continue
        rows.push({
          thread_index: i + 1,
          thread_title: maskPII(title.trim()),
          message_time: isoTime,
          sender_type:  detectSenderType(sender),
          sender_name:  maskSenderName(sender.trim()),
          message:      maskPII(body.trim()),
        })
      }

      if ((i + 1) % 10 === 0) log(`진행: ${i + 1}/${limit} thread, 누적 메시지 ${rows.length}건`)
    } catch (err) {
      log(`⚠️  thread ${i + 1} 수집 실패: ${err.message}`)
    }
  }

  await browser.close()
  return rows
}

function detectSenderType(senderName) {
  if (!senderName) return 'unknown'
  if (/봇|bot|시스템|관리자|상담원|운영자/.test(senderName)) return '상담원'
  return '고객'
}

// 카카오 시간 표기를 ISO 로 (가능한 한)
function parseTime(s) {
  if (!s) return ''
  const cleaned = s.trim()
  // 예: "오후 2:30", "2026.05.12", "방금 전" — 가장 단순 처리만
  if (/^\d{4}\.\d{1,2}\.\d{1,2}/.test(cleaned)) {
    return cleaned.replace(/\./g, '-').slice(0, 10)
  }
  return cleaned
}

// ─── CSV 저장 ────────────────────────────────────────────────────────────
async function writeCSV(rows, path) {
  const header = ['thread_index', 'thread_title', 'message_time', 'sender_type', 'sender_name', 'message']
  const lines = [header.join(',')]
  for (const r of rows) lines.push(header.map(k => csvEscape(r[k])).join(','))
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, lines.join('\n'), 'utf8')
}

// ─── 실행 ────────────────────────────────────────────────────────────────
const startTime = Date.now()
const rows = await collectChats()
await writeCSV(rows, OUTPUT_CSV)

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
log(`✅ ${rows.length}개 메시지 → ${OUTPUT_CSV} (${elapsed}s)`)
log('   다음 단계: analyze.py 로 분류 → src/data/csInsights.js 갱신')

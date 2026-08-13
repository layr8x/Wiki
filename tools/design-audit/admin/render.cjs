#!/usr/bin/env node
// tools/design-audit/admin/render.cjs
// 관리자 화면을 실제 코드 그대로 렌더해 스크린샷으로 남긴다(로그인·실데이터 불필요).
//
// 사용:
//   node tools/design-audit/admin/render.cjs                    # 전 화면 × 폭 × 라이트/다크
//   node tools/design-audit/admin/render.cjs --screen consults --width 1440 --mode dark
//   node tools/design-audit/admin/render.cjs --state empty      # 빈 목록 상태
//   node tools/design-audit/admin/render.cjs --screen overview --height 2600   # 아래쪽 카드까지 한 장에
//   node tools/design-audit/admin/render.cjs --audit            # 스크린샷 + 잘림/대비 자동 점검
//
// 산출물: tools/design-audit/admin/out/<screen>_<mode>_<width>[_<state>].png
//        --audit 시 out/audit.json (요소별 잘림·겹침·폰트 크기 측정값)
//
// 전제: 먼저 하네스를 빌드해야 한다.
//   npx vite build --config tools/design-audit/admin/vite.harness.config.js

const { chromium } = require('playwright')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const HERE = __dirname
const DIST = path.join(HERE, 'dist')
const OUT = path.join(HERE, 'out')

const SCREENS = {
  overview: '/admin',
  consults: '/admin/consults',
  jandi: '/admin/jandi',
  guides: '/admin/guides',
  feedback: '/admin/feedback',
}
// 실사용 폭: 노트북(1440)·외부 모니터(1920)·좁은 창(1024)·태블릿(768)·모바일(390)
const WIDTHS = [390, 768, 1024, 1440, 1920]
const MODES = ['dark', 'light']

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const only = arg('screen', null)
const onlyWidth = arg('width', null)
const onlyMode = arg('mode', null)
const state = arg('state', 'ok')
const doAudit = process.argv.includes('--audit')
const fullPage = !process.argv.includes('--viewport')
// ⚠️ 관리자 화면 껍데기(AppShell)는 본문에 자체 스크롤 상자를 쓴다. 그래서 문서 높이가 늘 창 높이와
//    같고, fullPage 스크린샷을 찍어도 창 높이(1000px)에서 잘린다. 아래쪽 카드까지 한 장에 담으려면
//    창 자체를 키워야 한다 → --height 로 창 높이를 지정한다(기본 1000).
const viewportH = Number(arg('height', 1000))

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }

function serve(root, port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0])
      let file = path.join(root, url === '/' ? '/harness.html' : url)
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'harness.html')
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
    })
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

// 화면에서 "잘림·겹침·너무 작은 글자"를 숫자로 잡는다. 눈대중 금지(CLAUDE.md §15-2).
const AUDIT_FN = () => {
  const out = { clippedX: [], clippedY: [], tinyText: [], overflowBody: false, tapTargets: [] }
  const label = (el) => {
    const cls = (el.className || '').toString().split(' ').filter((c) => !/^x[a-z0-9]{5,}$/.test(c)).slice(0, 3).join('.')
    const txt = (el.textContent || '').trim().slice(0, 28)
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`
  }
  // 스크린리더 전용(눈에 안 보이는) 요소는 "잘림"이 아니다. 1×1 로 클립해 두는 게 정상 구현이라
  // 걸러내지 않으면 화면마다 오탐이 4~6건씩 쌓여 진짜 문제가 묻힌다(실측 — 이 필터 전 15건 중 12건이 오탐).
  const isVisuallyHidden = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width <= 2 || r.height <= 2) return true
    const cs = getComputedStyle(el)
    return cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)' || cs.opacity === '0'
  }
  document.querySelectorAll('body *').forEach((el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || !el.clientHeight) return
    if (isVisuallyHidden(el)) return
    const clipsX = cs.overflowX !== 'visible'
    const clipsY = cs.overflowY !== 'visible'
    if (clipsX && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
      out.clippedX.push({ el: label(el), client: el.clientWidth, scroll: el.scrollWidth })
    }
    if (clipsY && el.scrollHeight > el.clientHeight + 1 && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') {
      out.clippedY.push({ el: label(el), client: el.clientHeight, scroll: el.scrollHeight })
    }
    // 말줄임(…)으로 내용이 사라진 곳
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
      out.clippedX.push({ el: label(el), client: el.clientWidth, scroll: el.scrollWidth, ellipsis: true })
    }
    const fs = parseFloat(cs.fontSize)
    if (fs && fs < 12 && (el.textContent || '').trim().length > 1 && el.children.length === 0) {
      out.tinyText.push({ el: label(el), px: fs })
    }
  })
  // 누르기 어려운 크기 판정. 기준은 WCAG 2.2 Target Size (Minimum) 의 24x24 CSS px.
  // ⚠️ 요소 자체 상자로만 재면 안 된다 — 아이콘 span 이 작아도 실제로 클릭을 받는 건
  //    부모 버튼인 경우가 많아 오탐이 쏟아진다(수정 전 27건 중 26건이 오탐이었다).
  //    가장 바깥의 클릭 대상(button/a/role=button)을 기준으로 잰다.
  const TAP_MIN = 24
  document.querySelectorAll('button, a[href], [role="button"]').forEach((el) => {
    if (isVisuallyHidden(el)) return
    // 이 요소가 다른 클릭 대상 안에 들어 있으면 바깥쪽이 실제 대상이다 → 건너뛴다.
    if (el.parentElement?.closest('button, a[href], [role="button"]')) return
    // WCAG 2.2 는 "문장 안에 흐르는 링크"(inline)는 이 기준에서 제외한다. 표 안 제목 링크나
    // 브레드크럼처럼 글자 높이 그대로인 것들을 경고하면 실제 문제가 묻힌다.
    if (getComputedStyle(el).display.startsWith('inline')) return
    const r = el.getBoundingClientRect()
    if (r.height < TAP_MIN || r.width < TAP_MIN) {
      out.tapTargets.push({ el: label(el), w: Math.round(r.width), h: Math.round(r.height) })
    }
  })
  out.overflowBody = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  out.docScrollW = document.documentElement.scrollWidth
  out.docClientW = document.documentElement.clientWidth
  return out
}

;(async () => {
  if (!fs.existsSync(path.join(DIST, 'harness.html'))) {
    console.error('하네스 빌드가 없습니다. 먼저 실행하세요:\n  npx vite build --config tools/design-audit/admin/vite.harness.config.js')
    process.exit(1)
  }
  fs.mkdirSync(OUT, { recursive: true })
  const server = await serve(DIST, 8901)
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

  const screens = only ? { [only]: SCREENS[only] } : SCREENS
  const widths = onlyWidth ? [Number(onlyWidth)] : WIDTHS
  const modes = onlyMode ? [onlyMode] : MODES
  const audit = {}

  for (const [name, route] of Object.entries(screens)) {
    if (!route) { console.error(`알 수 없는 화면: ${name}`); continue }
    for (const mode of modes) {
      for (const width of widths) {
        const page = await browser.newPage({ viewport: { width, height: viewportH }, deviceScaleFactor: 1 })
        const errors = []
        page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)))
        const url = `http://127.0.0.1:8901/harness.html?route=${encodeURIComponent(route)}&mode=${mode}&state=${state}`
        await page.goto(url, { waitUntil: 'networkidle' })
        await page.waitForTimeout(500)   // 차트·리스트 렌더 여유
        const suffix = state === 'ok' ? '' : `_${state}`
        const file = path.join(OUT, `${name}_${mode}_${width}${suffix}.png`)
        await page.screenshot({ path: file, fullPage })
        if (doAudit) {
          const r = await page.evaluate(AUDIT_FN)
          r.pageErrors = errors
          audit[`${name}_${mode}_${width}${suffix}`] = r
          const bad = r.clippedX.length + r.clippedY.length
          console.log(`${name.padEnd(9)} ${mode.padEnd(5)} ${String(width).padStart(4)}px  ${bad ? '❌ 잘림 ' + bad : '✅'}  가로넘침 ${r.overflowBody ? '❌' : '✅'}  작은글자 ${r.tinyText.length}  작은버튼 ${r.tapTargets.length}${errors.length ? '  JS오류 ' + errors.length : ''}`)
        } else {
          console.log(`저장: ${path.relative(process.cwd(), file)}`)
        }
        await page.close()
      }
    }
  }

  if (doAudit) {
    // ⚠️ 언제·어느 커밋을 잰 결과인지 남긴다. 낡은 audit.json 을 근거로 판단하는 사고를 막는다
    //    (CLAUDE.md 15장: "죽은 노드와 비교한 '맞췄다'는 무의미").
    let commit = '(unknown)'
    try { commit = require('node:child_process').execSync('git rev-parse --short HEAD', { cwd: path.join(HERE, '../../..') }).toString().trim() } catch { /* 무시 */ }
    audit._meta = { measuredAt: new Date().toISOString(), commit, widths: WIDTHS, modes: MODES, state }
    fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(audit, null, 1))
    console.log(`\n상세: ${path.relative(process.cwd(), path.join(OUT, 'audit.json'))}`)
  }
  await browser.close()
  server.close()
})()

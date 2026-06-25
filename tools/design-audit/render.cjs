#!/usr/bin/env node
/*
 * design-audit/render.js — 챗봇 화면을 Figma 기준폭(400px)으로 "충실 렌더"한다.
 *
 * 왜 필요한가: 헤드리스 브라우저는 Pretendard(jsdelivr)·Material Symbols(gstatic) CDN을
 * 차단해서, 그냥 찍으면 대체 폰트(글자 더 큼)로 렌더돼 "빌드가 10% 크다"는 착시가 생긴다.
 * 이 스크립트는 동봉한 로컬 폰트(fonts/)를 강제 주입해 Figma와 1:1 크기로 맞춘다.
 *
 * 사용법:
 *   node tools/design-audit/render.js <screen> [--parent] [--full]
 *     <screen>  screens.json 의 화면 키 (예: time_end, pay_history)
 *     --parent  학부모 페이지(myclass-chatbot-parent.html)로 렌더
 *     --full    헤더까지 포함(#sheet). 기본은 본문만(#log)
 *   결과: tools/design-audit/out/L_<screen>.png
 *
 * 사전: Playwright(전역 설치 가능). NODE_PATH 안 잡아도 전역에서 자동 탐색 시도.
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function loadChromium() {
  try { return require('playwright').chromium; } catch (_) {}
  try {
    const g = execSync('npm root -g').toString().trim();
    return require(path.join(g, 'playwright')).chromium;
  } catch (e) {
    console.error('Playwright를 찾을 수 없습니다. `npm i -g playwright` 또는 `export NODE_PATH=$(npm root -g)` 후 다시 실행하세요.');
    process.exit(1);
  }
}

const DIR = __dirname;
const ROOT = path.resolve(DIR, '..', '..');
const OUT = path.join(DIR, 'out');
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'screens.json'), 'utf8'));

const args = process.argv.slice(2);
const screen = args.find(a => !a.startsWith('--'));
const isParent = args.includes('--parent');
const full = args.includes('--full');

if (!screen || !cfg.screens[screen]) {
  console.error('화면 키를 지정하세요. 사용 가능:', Object.keys(cfg.screens).join(', '));
  process.exit(1);
}

const htmlRel = isParent ? cfg.htmlParent : cfg.htmlStudent;
const FILE = 'file://' + path.join(ROOT, htmlRel);
const PRE = fs.readFileSync(path.join(DIR, 'fonts', 'pretendard.woff2'));
const TTF = 'file://' + path.join(DIR, 'fonts', 'ms300.ttf');
const W = cfg.phoneWidth || 400;
const navSteps = cfg.screens[screen].nav || [];

const CSS = `@font-face{font-family:'Material Symbols Rounded';font-style:normal;font-weight:300;src:url('${TTF}') format('truetype');}
 html,body{margin:0!important;padding:0!important}
 .phone{width:${W}px!important;max-width:${W}px!important${full ? ";height:866px!important" : ";height:auto!important"}}
 ${full ? "" : ".sheet{position:static!important;height:auto!important;max-height:none!important} .log{height:auto!important;max-height:none!important;overflow:visible!important}"}`;

(async () => {
  const chromium = loadChromium();
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W + 40, height: 2600 }, deviceScaleFactor: 2 });
  await p.route(/cdn\.jsdelivr\.net.*Pretendard.*\.woff2/, r => r.fulfill({ contentType: 'font/woff2', body: PRE }));
  await p.addInitScript(() => { window.__noTyping = true; });
  await p.goto(FILE);
  await p.addStyleTag({ content: CSS });
  await p.waitForTimeout(300);
  await p.click('#openBtn');
  await p.waitForTimeout(350);
  await p.evaluate(() => document.fonts.ready);
  for (const t of navSteps) {
    const l = p.locator(`.mtile:has-text("${t}"), .chip:has-text("${t}")`).last();
    await l.scrollIntoViewIfNeeded();
    await l.click();
    await p.waitForTimeout(420);
  }
  await p.waitForTimeout(250);
  await p.evaluate(() => document.fonts.ready);
  const ok = await p.evaluate(() => ({
    pre: document.fonts.check("16px 'Pretendard Variable'"),
    ms: document.fonts.check("24px 'Material Symbols Rounded'"),
  }));
  if (!ok.pre || !ok.ms) console.warn('⚠️ 폰트 로드 확인 실패:', JSON.stringify(ok), '— 크기 비교 신뢰도 낮음');
  fs.mkdirSync(OUT, { recursive: true });
  const outName = `L_${screen}${isParent ? '_parent' : ''}${full ? '_full' : ''}.png`;
  await p.locator(full ? '#sheet' : '#log').screenshot({ path: path.join(OUT, outName) });
  console.log('saved', path.join('out', outName), JSON.stringify(ok), '| figma node:', cfg.screens[screen].figma || '(없음)');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

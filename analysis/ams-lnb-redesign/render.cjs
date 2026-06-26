#!/usr/bin/env node
/* AMS LNB 리디자인 렌더러 — 데스크탑 뷰포트 + 로컬 Pretendard 주입(헤드리스 CDN 차단 우회).
 * 사용: node analysis/ams-lnb-redesign/render.cjs
 * 산출: out/wiki-light.png (라이트=Wiki), out/ams-dark.png (다크=AMS),
 *       out/light-expanded.png (서브그룹), out/light-collapsed.png (rail) */
const fs = require('fs');
const path = require('path');

function findPlaywright() {
  for (const p of [process.cwd(), __dirname]) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch {}
  }
  return require('playwright');
}

(async () => {
  const { chromium } = findPlaywright();
  const DIR = __dirname;
  const OUT = path.join(DIR, 'out');
  fs.mkdirSync(OUT, { recursive: true });

  const fontPath = path.resolve(DIR, '../../tools/design-audit/fonts/pretendard.woff2');
  const fontB64 = fs.readFileSync(fontPath).toString('base64');
  const fontCss = `@font-face{font-family:'Pretendard';font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${fontB64}) format('woff2');}`;

  const url = 'file://' + path.join(DIR, 'index.html');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const prep = async () => { await page.addStyleTag({ content: fontCss }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(220); };

  // 1) 라이트 = AMS Wiki
  await page.goto(url, { waitUntil: 'networkidle' });
  await prep();
  await page.screenshot({ path: path.join(OUT, 'wiki-light.png') });
  console.log('✓ out/wiki-light.png');

  // 2) 다크 = AMS (테마 토글)
  await page.evaluate(() => document.getElementById('themeToggle').click());
  await page.waitForTimeout(280);
  await page.screenshot({ path: path.join(OUT, 'ams-dark.png') });
  console.log('✓ out/ams-dark.png');
  // 다크 해제
  await page.evaluate(() => document.getElementById('themeToggle').click());
  await page.waitForTimeout(200);

  // 3) 라이트 + 강좌/교재 서브그룹 펼침
  await page.evaluate(() => { const h = [...document.querySelectorAll('.grp-head')].find(x => x.textContent.includes('강좌/교재')); h && h.click(); });
  await page.waitForTimeout(120);
  await page.evaluate(() => { const s = [...document.querySelectorAll('.subgrp-head')].find(x => x.textContent.includes('강좌관리')); s && s.click(); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, 'light-expanded.png') });
  console.log('✓ out/light-expanded.png');

  // 4) 접힘 rail
  await page.evaluate(() => document.getElementById('toggle').click());
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, 'light-collapsed.png') });
  console.log('✓ out/light-collapsed.png');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

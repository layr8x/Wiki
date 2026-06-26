#!/usr/bin/env node
/* AMS LNB 리디자인 렌더러 — 데스크탑 뷰포트 + 로컬 Pretendard 주입(헤드리스 CDN 차단 우회).
 * 사용: node analysis/ams-lnb-redesign/render.cjs
 * 산출: out/shell.png (기본), out/shell-collapsed.png (접힘) */
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900}, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: fontCss });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);

  await page.screenshot({ path: path.join(OUT, 'shell.png') });
  console.log('✓ out/shell.png');

  // 강좌/교재 그룹 열어 서브그룹 보이게
  await page.evaluate(() => { window.state && (window.state.open.course = true, window.state.subopen['sub:강좌관리'] = true); document.querySelector('#nav'); });
  // 위 evaluate는 state가 클로저라 안 먹을 수 있어, 클릭으로 연다
  await page.evaluate(() => {
    const heads = [...document.querySelectorAll('.grp-head')];
    const course = heads.find(h => h.textContent.includes('강좌/교재'));
    if (course) course.click();
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const sh = [...document.querySelectorAll('.subgrp-head')].find(h => h.textContent.includes('강좌관리'));
    if (sh) sh.click();
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, 'shell-expanded.png') });
  console.log('✓ out/shell-expanded.png');

  // collapsed rail
  await page.evaluate(() => document.getElementById('toggle').click());
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, 'shell-collapsed.png') });
  console.log('✓ out/shell-collapsed.png');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

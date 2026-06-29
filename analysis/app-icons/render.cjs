#!/usr/bin/env node
/* 앱 아이콘 시안 보드 렌더 — 로컬 Pretendard 주입(헤드리스 CDN 차단 우회) → out/concepts.png
 * 사용: node analysis/app-icons/render.cjs */
const fs = require('fs');
const path = require('path');
function findPlaywright(){ for(const p of [process.cwd(), __dirname]){ try{ return require(require.resolve('playwright',{paths:[p]})); }catch{} } return require('playwright'); }
(async () => {
  const { chromium } = findPlaywright();
  const DIR = __dirname, OUT = path.join(DIR,'out'); fs.mkdirSync(OUT,{recursive:true});
  const fontB64 = fs.readFileSync(path.resolve(DIR,'../../tools/design-audit/fonts/pretendard.woff2')).toString('base64');
  const fontCss = `@font-face{font-family:'Pretendard';font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${fontB64}) format('woff2');}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:1280,height:1400}, deviceScaleFactor:2 });
  await page.goto('file://'+path.join(DIR,'concepts.html'), { waitUntil:'networkidle' });
  await page.addStyleTag({ content: fontCss });
  await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT,'concepts.png'), fullPage:true });
  console.log('✓ out/concepts.png');
  // 추천 컨셉 1행만 크롭용으로 별도(상단 일부)
  await browser.close();
})().catch(e=>{ console.error(e); process.exit(1); });

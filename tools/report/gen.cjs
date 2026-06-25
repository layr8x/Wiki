#!/usr/bin/env node
/*
 * tools/report/gen.cjs — 범용 A4 리포트 생성기.
 * 데이터(JSON 스펙)를 template.html 에 주입하고 Pretendard 폰트를 입혀 PNG + PDF 로 굽는다.
 *
 * 사용법:
 *   node tools/report/gen.cjs <spec.json> [out_base]
 *     <spec.json>  리포트 데이터(README.md / example.json 참고)
 *     out_base     출력 경로 접두(기본: spec 경로에서 .json 제거) → <out_base>.png / .pdf
 * 예) node tools/report/gen.cjs tools/report/example.json tools/report/out/inquiry
 *
 * 폰트는 tools/design-audit/fonts/pretendard.woff2 재사용(헤드리스 CDN 차단 우회).
 */
const path = require('path');
const fs = require('fs');
function loadChromium() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright',
    path.resolve(process.cwd(), 'node_modules/playwright')]) {
    try { return require(p).chromium; } catch (_) {}
  }
  throw new Error('Playwright 를 찾을 수 없습니다.');
}

const DIR = __dirname;
const specPath = process.argv[2];
if (!specPath) { console.error('사용법: node tools/report/gen.cjs <spec.json> [out_base]'); process.exit(1); }
const outBase = process.argv[3] || specPath.replace(/\.json$/, '');
const R = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const PRE = fs.readFileSync(path.resolve(DIR, '..', 'design-audit', 'fonts', 'pretendard.woff2'));

(async () => {
  const chromium = loadChromium();
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const p = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await p.route(/.*pretendard.*\.woff2/i, (r) => r.fulfill({ contentType: 'font/woff2', body: PRE }));
  await p.addInitScript((data) => { window.REPORT = data; }, R);
  await p.goto('file://' + path.resolve(DIR, 'template.html'));
  await p.addStyleTag({ content: `@font-face{font-family:'Pretendard Variable';font-weight:100 900;src:url('https://x/pretendard.woff2') format('woff2');}` });
  await p.waitForTimeout(300);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const elp = await p.$('.page');
  await elp.screenshot({ path: outBase + '.png' });
  await p.pdf({ path: outBase + '.pdf', format: 'A4', printBackground: true });
  await b.close();
  console.log('✓ 저장:', outBase + '.png', '+', outBase + '.pdf');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });

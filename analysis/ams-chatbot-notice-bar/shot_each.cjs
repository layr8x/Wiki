const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
  const dir = path.join(__dirname, 'charts_png');
  const names = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
  for (const n of names) {
    const page = await browser.newPage({ viewport: { width: 960, height: 620 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(path.join(dir, n)).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const div = await page.$('#wrap');
    await div.screenshot({ path: path.join(dir, n.replace('.html', '.png')) });
    await page.close();
  }
  await browser.close();
  console.log('done', names.length);
})();

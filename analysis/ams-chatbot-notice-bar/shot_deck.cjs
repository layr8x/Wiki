const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1340, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(__dirname, '260720_AMS챗봇_알림바_결정과근거_덱.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const slides = await page.$$('.slide');
  console.log('slides', slides.length);
  for (let i = 0; i < slides.length; i++) {
    await slides[i].screenshot({ path: path.join(__dirname, `deck_${String(i+1).padStart(2,'0')}.png`) });
  }
  await browser.close();
  console.log('done');
})();

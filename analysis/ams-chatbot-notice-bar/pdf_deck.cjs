const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(__dirname, '260720_AMS챗봇_알림바_결정과근거_덱.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(__dirname, '260720_AMS챗봇_알림바_결정과근거_덱.pdf'), width: '13.333in', height: '7.5in', printBackground: true, margin: {top:0,bottom:0,left:0,right:0} });
  await browser.close();
  console.log('deck pdf ok');
})();

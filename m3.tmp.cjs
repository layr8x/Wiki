const { chromium } = require('playwright')
const http = require('node:http'); const fs=require('node:fs'); const path=require('node:path')
const DIST='/home/user/sdij-wiki/tools/design-audit/admin/dist'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'}
function serve(root,port){return new Promise(r=>{const s=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,u==='/'?'/harness.html':u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(root,'harness.html');res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});s.listen(port,'127.0.0.1',()=>r(s))})}
;(async()=>{
const server=await serve(DIST,8914)
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'})
const go=async(route,mode,width)=>{const p=await browser.newPage({viewport:{width,height:1200}});await p.goto(`http://127.0.0.1:8914/harness.html?route=${encodeURIComponent(route)}&mode=${mode}&state=ok`,{waitUntil:'networkidle'});await p.waitForTimeout(400);return p}

for (const [n,r] of [['guides','/admin/guides'],['feedback','/admin/feedback']]){
 for(const w of [390,768,1024,1440]){
  const p=await go(r,'light',w)
  const d=await p.evaluate(()=>{const el=document.querySelector('.astryx-table-scroll-wrapper'); if(!el) return null
    const cs=getComputedStyle(el)
    return {client:el.clientWidth,scroll:el.scrollWidth,hiddenPx:el.scrollWidth-el.clientWidth, tabindex:el.getAttribute('tabindex'), role:el.getAttribute('role'), ariaLabel:el.getAttribute('aria-label'), overflowX:cs.overflowX, sb:cs.scrollbarWidth,
      hiddenCols:[...document.querySelectorAll('th')].filter(t=>{const b=t.getBoundingClientRect(); const wb=el.getBoundingClientRect(); return b.right>wb.right+1}).map(t=>t.textContent.trim())}})
  console.log(n,w,JSON.stringify(d))
  await p.close()
 }
}
// segmented filter semantics
for (const [n,r] of [['guides','/admin/guides'],['feedback','/admin/feedback'],['consults','/admin/consults']]){
  const p=await go(r,'light',1440)
  console.log('SEG',n,JSON.stringify(await p.evaluate(()=>{
    const g=document.querySelector('[role="group"]'); if(!g) return null
    return {label:g.getAttribute('aria-label'), btns:[...g.querySelectorAll('button')].map(b=>({t:b.textContent.trim(),pressed:b.getAttribute('aria-pressed'),cur:b.getAttribute('aria-current'),sel:b.getAttribute('aria-selected'),cls:b.className.split(' ').slice(0,3).join('.')}))}
  }),null,0))
  await p.close()
}
// theme check: is dark actually dark?
for(const m of ['light','dark']){
  const p=await go('/admin','${m}'==='x'?m:m,1440)
  console.log('THEME',m,await p.evaluate(()=>getComputedStyle(document.body).backgroundColor+' | html.dark='+document.documentElement.classList.contains('dark')+' | text-secondary='+getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary')+' | disabled='+getComputedStyle(document.documentElement).getPropertyValue('--color-text-disabled')))
  await p.close()
}
await browser.close(); server.close()
})()

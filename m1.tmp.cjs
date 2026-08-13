const { chromium } = require('playwright')
const http = require('node:http'); const fs=require('node:fs'); const path=require('node:path')
const DIST='/home/user/sdij-wiki/tools/design-audit/admin/dist'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'}
function serve(root,port){return new Promise(r=>{const s=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,u==='/'?'/harness.html':u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(root,'harness.html');res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});s.listen(port,'127.0.0.1',()=>r(s))})}
;(async()=>{
const server=await serve(DIST,8912)
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'})
const go=async(route,mode,width)=>{const p=await browser.newPage({viewport:{width,height:1000}});await p.goto(`http://127.0.0.1:8912/harness.html?route=${encodeURIComponent(route)}&mode=${mode}&state=ok`,{waitUntil:'networkidle'});await p.waitForTimeout(400);return p}

// 1) guides table horizontal scroll at 390
let p=await go('/admin/guides','light',390)
console.log('=== GUIDES 390 scroll wrappers')
console.log(JSON.stringify(await p.evaluate(()=>{
  const out=[]
  document.querySelectorAll('*').forEach(el=>{
    const cs=getComputedStyle(el)
    if((cs.overflowX==='auto'||cs.overflowX==='scroll') && el.scrollWidth>el.clientWidth+1){
      out.push({cls:el.className.toString().slice(0,80), client:el.clientWidth, scroll:el.scrollWidth, hidden:el.offsetHeight})
    }
  })
  const tbl=document.querySelector('table')
  return {wrappers:out, tableW: tbl&&tbl.getBoundingClientRect().width, ths:[...document.querySelectorAll('th')].map(t=>({t:t.textContent.trim(),x:Math.round(t.getBoundingClientRect().x),w:Math.round(t.getBoundingClientRect().width)}))}
}),null,1))

// 2) icon button geometry + hit area
console.log('=== icon button box')
console.log(JSON.stringify(await p.evaluate(()=>{
  const b=[...document.querySelectorAll('button.astryx-button')].find(x=>x.className.includes('ghost')&&x.getBoundingClientRect().width<32)
  if(!b) return null
  const cs=getComputedStyle(b); const before=getComputedStyle(b,'::before'); const after=getComputedStyle(b,'::after')
  const r=b.getBoundingClientRect()
  return {rect:{w:r.width,h:r.height}, padding:cs.padding, minH:cs.minHeight, minW:cs.minWidth, aria:b.getAttribute('aria-label'), title:b.getAttribute('title'),
    before:{content:before.content,w:before.width,h:before.height,inset:before.inset,pos:before.position},
    after:{content:after.content,w:after.width,h:after.height,inset:after.inset,pos:after.position}}
}),null,1))
await p.close()

// 3) focus-visible
p=await go('/admin/consults','light',1440)
console.log('=== focus ring (tab 6 times)')
const fr=[]
for(let i=0;i<8;i++){
  await p.keyboard.press('Tab')
  fr.push(await p.evaluate(()=>{const e=document.activeElement; if(!e) return null; const cs=getComputedStyle(e);
    return {tag:e.tagName, cls:(e.className||'').toString().slice(0,60), txt:(e.textContent||'').trim().slice(0,20), outline:cs.outline, outlineOffset:cs.outlineOffset, boxShadow:cs.boxShadow.slice(0,90)}}))
}
console.log(JSON.stringify(fr,null,1))
await p.close()
await browser.close(); server.close()
})()

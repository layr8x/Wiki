const { chromium } = require('playwright')
const http = require('node:http'); const fs=require('node:fs'); const path=require('node:path')
const DIST='/home/user/sdij-wiki/tools/design-audit/admin/dist'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'}
function serve(root,port){return new Promise(r=>{const s=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,u==='/'?'/harness.html':u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(root,'harness.html');res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});s.listen(port,'127.0.0.1',()=>r(s))})}
;(async()=>{
const server=await serve(DIST,8917)
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'})
const go=async(route,mode,width)=>{const ctx=await browser.newContext({viewport:{width,height:1200}});await ctx.addInitScript(m=>{try{localStorage.setItem('ams-wiki:theme',m)}catch(e){}},mode);const p=await ctx.newPage();await p.goto(`http://127.0.0.1:8917/harness.html?route=${encodeURIComponent(route)}&mode=${mode}&state=ok`,{waitUntil:'networkidle'});await p.waitForTimeout(400);return p}
const p=await go('/admin/guides','light',390)
console.log(JSON.stringify(await p.evaluate(()=>{
  const out=[]
  document.querySelectorAll('button,a[href],[role=button]').forEach(el=>{
    const r=el.getBoundingClientRect(); if(r.width<2) return
    if(r.height<24||r.width<24) out.push({tag:el.tagName,cls:(el.className||'').toString().replace(/x[a-z0-9]{5,}/g,'').trim().slice(0,40), txt:(el.textContent||'').trim().slice(0,14), aria:el.getAttribute('aria-label'), w:Math.round(r.width),h:Math.round(r.height), parentH:Math.round(el.parentElement.getBoundingClientRect().height), parentCls:(el.parentElement.className||'').toString().replace(/x[a-z0-9]{5,}/g,'').trim().slice(0,30)})
  })
  return out
}),null,1))
// icon-only button accessible name
console.log('ICONBTN', JSON.stringify(await p.evaluate(()=>{
  const b=[...document.querySelectorAll('button.astryx-button.ghost.sm')].filter(x=>x.getBoundingClientRect().width<32)
  return b.slice(0,4).map(x=>({aria:x.getAttribute('aria-label'), title:x.getAttribute('title'), txt:x.textContent.trim(), labelledby:x.getAttribute('aria-labelledby')}))
}),null,0))
await p.close()
await browser.close(); server.close()
})()

const { chromium } = require('playwright')
const http = require('node:http'); const fs=require('node:fs'); const path=require('node:path')
const DIST='/home/user/sdij-wiki/tools/design-audit/admin/dist'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'}
function serve(root,port){return new Promise(r=>{const s=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,u==='/'?'/harness.html':u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(root,'harness.html');res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});s.listen(port,'127.0.0.1',()=>r(s))})}
const CONTRAST=`(()=>{
 const parse=(c)=>{const m=c.match(/[\\d.]+/g); if(!m) return null; return m.slice(0,3).map(Number).concat([m[3]!==undefined?Number(m[3]):1])}
 const lum=(rgb)=>{const [r,g,b]=rgb.slice(0,3).map(v=>{v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}); return 0.2126*r+0.7152*g+0.0722*b}
 const bgOf=(el)=>{let n=el; while(n&&n!==document.documentElement){const c=parse(getComputedStyle(n).backgroundColor); if(c&&c[3]>0.5) return c; n=n.parentElement} return [255,255,255,1]}
 const ratio=(a,b)=>{const l1=lum(a),l2=lum(b); const [hi,lo]=l1>l2?[l1,l2]:[l2,l1]; return (hi+0.05)/(lo+0.05)}
 const out=[]
 document.querySelectorAll('body *').forEach(el=>{
   if(el.children.length) return
   const t=(el.textContent||'').trim(); if(t.length<1) return
   const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden') return
   const r=el.getBoundingClientRect(); if(r.width<2||r.height<2) return
   const fg=parse(cs.color||cs.fill); if(!fg) return
   const fsz=parseFloat(cs.fontSize); const w=parseInt(cs.fontWeight)||400
   const large = fsz>=24 || (fsz>=18.66 && w>=700)
   const cr=ratio(fg,bgOf(el))
   const min = large?3:4.5
   if(cr<min) out.push({txt:t.slice(0,26), cls:(el.className||'').toString().slice(0,45), px:fsz, cr:Math.round(cr*100)/100, need:min, color:cs.color, tag:el.tagName})
 })
 // svg text
 document.querySelectorAll('svg text').forEach(el=>{
   const cs=getComputedStyle(el); const fg=parse(cs.fill); if(!fg) return
   const cr=ratio(fg,[255,255,255,1]); const fsz=parseFloat(cs.fontSize)
   out.push({txt:(el.textContent||'').trim(), cls:'SVGTEXT '+el.getAttribute('class'), px:fsz, cr:Math.round(cr*100)/100, need:4.5, color:cs.fill, tag:'text'})
 })
 return out
})()`
;(async()=>{
const server=await serve(DIST,8913)
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'})
const go=async(route,mode,width)=>{const p=await browser.newPage({viewport:{width,height:1200}});await p.goto(`http://127.0.0.1:8913/harness.html?route=${encodeURIComponent(route)}&mode=${mode}&state=ok`,{waitUntil:'networkidle'});await p.waitForTimeout(400);return p}
for(const [name,route] of Object.entries({overview:'/admin',consults:'/admin/consults',jandi:'/admin/jandi',guides:'/admin/guides',feedback:'/admin/feedback'})){
  for(const mode of ['light','dark']){
    const p=await go(route,mode,1440)
    const res=await p.evaluate(CONTRAST)
    const uniq=new Map(); res.forEach(r=>{const k=r.cls+'|'+r.px+'|'+r.cr; if(!uniq.has(k))uniq.set(k,r)})
    console.log(`--- ${name} ${mode}: ${uniq.size} low-contrast kinds`)
    ;[...uniq.values()].sort((a,b)=>a.cr-b.cr).slice(0,10).forEach(r=>console.log('   ',JSON.stringify(r)))
    await p.close()
  }
}
// guides table wrapper at multiple widths
for(const w of [390,768,1024,1440]){
  const p=await go('/admin/guides','light',w)
  console.log('guides',w,JSON.stringify(await p.evaluate(()=>{const el=document.querySelector('.astryx-table-scroll-wrapper');const cs=el?getComputedStyle(el):null;return el?{client:el.clientWidth,scroll:el.scrollWidth, scrollbarW:el.offsetHeight-el.clientHeight, sbWidth:cs.scrollbarWidth, overflowX:cs.overflowX}:null})))
  await p.close()
}
// statusdot render check on consults (expand collapsible)
const p=await go('/admin/consults','light',1440)
console.log('statusdot', JSON.stringify(await p.evaluate(()=>{
  const d=document.querySelector('.astryx-statusdot')
  if(!d) return 'none-visible'
  const r=d.getBoundingClientRect(); const cs=getComputedStyle(d)
  return {aria:d.getAttribute('aria-label'), text:d.textContent, w:r.width,h:r.height, bg:cs.backgroundColor}
})))
console.log('sentiment chart aria', JSON.stringify(await p.evaluate(()=>{
  const s=document.querySelector('.ov-sent'); return s? {role:s.getAttribute('role'),aria:s.getAttribute('aria-label')} : 'not-on-this-page'
})))
await p.close()
const p2=await go('/admin','light',1440)
console.log('overview charts a11y', JSON.stringify(await p2.evaluate(()=>{
  const out={}
  const s=document.querySelector('.ov-sent'); out.sent = s? {role:s.getAttribute('role'),aria:s.getAttribute('aria-label'), cols:s.children.length, colTitle:s.children[0]&&s.children[0].getAttribute('title'), tabindex:s.children[0]&&s.children[0].getAttribute('tabindex')}:null
  const b=document.querySelector('.ov-bar'); out.bar = b? {cls:b.className, role:b.getAttribute('role'), aria:b.getAttribute('aria-label')}:null
  out.barsAll=[...document.querySelectorAll('[class*=ov-bar]')].slice(0,3).map(e=>({c:e.className,role:e.getAttribute('role')}))
  return out
}),null,1))
await p2.close()
await browser.close(); server.close()
})()

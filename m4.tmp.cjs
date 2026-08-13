const { chromium } = require('playwright')
const http = require('node:http'); const fs=require('node:fs'); const path=require('node:path')
const DIST='/home/user/sdij-wiki/tools/design-audit/admin/dist'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'}
function serve(root,port){return new Promise(r=>{const s=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,u==='/'?'/harness.html':u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(root,'harness.html');res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});s.listen(port,'127.0.0.1',()=>r(s))})}
const CONTRAST=`(()=>{
 const parse=(c)=>{const m=(c||'').match(/[\\d.]+/g); if(!m) return null; return m.slice(0,3).map(Number).concat([m[3]!==undefined?Number(m[3]):1])}
 const lum=(rgb)=>{const [r,g,b]=rgb.slice(0,3).map(v=>{v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}); return 0.2126*r+0.7152*g+0.0722*b}
 const bgOf=(el)=>{let n=el; while(n&&n!==document.documentElement){const c=parse(getComputedStyle(n).backgroundColor); if(c&&c[3]>0.5) return c; n=n.parentElement} const b=parse(getComputedStyle(document.body).backgroundColor); return b&&b[3]>0.5?b:[255,255,255,1]}
 const ratio=(a,b)=>{const l1=lum(a),l2=lum(b); const [hi,lo]=l1>l2?[l1,l2]:[l2,l1]; return (hi+0.05)/(lo+0.05)}
 const out=[]
 document.querySelectorAll('body *').forEach(el=>{
   if(el.children.length) return
   const t=(el.textContent||'').trim(); if(t.length<1) return
   const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden') return
   const r=el.getBoundingClientRect(); if(r.width<2||r.height<2) return
   const fg=parse(cs.color); if(!fg) return
   const fsz=parseFloat(cs.fontSize); const w=parseInt(cs.fontWeight)||400
   const large = fsz>=24 || (fsz>=18.66 && w>=700)
   const cr=ratio(fg,bgOf(el)); const min=large?3:4.5
   if(cr<min) out.push({txt:t.slice(0,24), cls:(el.className||'').toString().replace(/x[a-z0-9]{5,}/g,'').trim().slice(0,40), px:fsz, cr:Math.round(cr*100)/100, color:cs.color})
 })
 document.querySelectorAll('svg text').forEach(el=>{
   const cs=getComputedStyle(el); const fg=parse(cs.fill); if(!fg) return
   const cr=ratio(fg,bgOf(el.closest('svg')))
   out.push({txt:(el.textContent||'').trim(), cls:'SVG '+(el.getAttribute('class')||''), px:parseFloat(cs.fontSize), cr:Math.round(cr*100)/100, color:cs.fill})
 })
 return out
})()`
;(async()=>{
const server=await serve(DIST,8916)
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'})
const go=async(route,mode,width)=>{
  const ctx=await browser.newContext({viewport:{width,height:1200}})
  await ctx.addInitScript(m=>{try{localStorage.setItem('ams-wiki:theme',m)}catch(e){}}, mode)
  const p=await ctx.newPage()
  await p.goto(`http://127.0.0.1:8916/harness.html?route=${encodeURIComponent(route)}&mode=${mode}&state=ok`,{waitUntil:'networkidle'})
  await p.waitForTimeout(500); return p}
for(const m of ['light','dark']){
  const p=await go('/admin',m,1440)
  console.log('THEME',m,await p.evaluate(()=>getComputedStyle(document.body).backgroundColor+' dark='+document.documentElement.classList.contains('dark')))
  await p.close()
}
for(const [n,r] of Object.entries({overview:'/admin',consults:'/admin/consults',jandi:'/admin/jandi'})){
 for(const m of ['light','dark']){
  const p=await go(r,m,1440)
  const res=await p.evaluate(CONTRAST)
  const uq=new Map(); res.forEach(x=>{const k=x.cls+'|'+x.px+'|'+x.cr; if(!uq.has(k))uq.set(k,x)})
  console.log(`--- ${n} ${m}`)
  ;[...uq.values()].sort((a,b)=>a.cr-b.cr).slice(0,8).forEach(x=>console.log('   ',JSON.stringify(x)))
  await p.close()
 }
}
// segmented filters real semantics
for(const [n,r,sel] of [['guides','/admin/guides','.ag-seg'],['feedback','/admin/feedback','.af-seg'],['consults','/admin/consults','.ac-chips']]){
  const p=await go(r,'light',1440)
  console.log('SEG',n,JSON.stringify(await p.evaluate(s=>{const g=document.querySelector(s); if(!g) return null
    return {aria:g.getAttribute('aria-label'), role:g.getAttribute('role'), btns:[...g.querySelectorAll('button')].map(b=>({t:b.textContent.trim(),pressed:b.getAttribute('aria-pressed'),cur:b.getAttribute('aria-current'),sel:b.getAttribute('aria-selected')}))}},sel)))
  await p.close()
}
// expand pipeline collapsible + statusdot visible label check
const p=await go('/admin/consults','light',1440)
const trig=await p.$$('.kcs-collapsible button, .kcs-collapsible [role=button]')
for(const t of trig){ try{ await t.click() }catch(e){} }
await p.waitForTimeout(300)
console.log('HEALTH TABLE', JSON.stringify(await p.evaluate(()=>{
  const rows=[...document.querySelectorAll('tr')].map(r=>r.textContent.trim()).filter(t=>t.includes('분 전')||t.includes('만료'))
  const dots=[...document.querySelectorAll('.astryx-statusdot')].map(d=>({aria:d.getAttribute('aria-label'), bg:getComputedStyle(d).backgroundColor, w:d.getBoundingClientRect().width, txt:d.textContent}))
  return {rows,dots}
}),null,1))
await p.screenshot({path:'tools/design-audit/admin/out/_probe_consults_expanded.png', fullPage:false})
await p.close()
await browser.close(); server.close()
})()

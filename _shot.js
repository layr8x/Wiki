const {chromium}=require("playwright");
const path=require("path");
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:460,height:1000,deviceScaleFactor:2}});
  await pg.addInitScript(()=>{window.__noTyping=true;});
  await pg.goto("file://"+path.resolve("public/myclass-chatbot.html"));
  await pg.waitForTimeout(300);
  await pg.click("#openBtn");
  await pg.waitForTimeout(600);
  async function shot(name){const s=await pg.$(".sheet");await s.screenshot({path:"/tmp/shot_"+name+".png"});}
  await pg.click(".ctxsel");await pg.waitForTimeout(300);await shot("dropdown");
  await pg.click(".ctxsel");await pg.waitForTimeout(200);
  const go=async(txt)=>{await pg.evaluate(()=>document.getElementById("homeBtn").click());await pg.waitForTimeout(150);
    await pg.evaluate(t=>{[...document.querySelectorAll(".mtile")].find(m=>m.textContent.includes(t))?.click();},txt);await pg.waitForTimeout(350);};
  const sub=async(txt)=>{await pg.evaluate(t=>{[...document.querySelectorAll(".qr .chip")].find(c=>c.textContent.includes(t))?.click();},txt);await pg.waitForTimeout(450);};
  await go("수업·시간표");await sub("내 시간표");await shot("timetable");
  await go("납부·결제");await sub("납부 대기 현황");await shot("paywait");
  await go("납부·결제");await sub("결제 내역");await shot("payhistory");
  await go("수업·시간표");await sub("종강일 확인");await shot("enddate");
  // 학부모 드롭다운
  await pg.goto("file://"+path.resolve("public/myclass-chatbot-parent.html"));
  await pg.waitForTimeout(300);await pg.click("#openBtn");await pg.waitForTimeout(600);
  await pg.click(".ctxsel");await pg.waitForTimeout(300);await shot("dropdown_parent");
  await b.close();console.log("스크린샷 완료");
})().catch(e=>{console.log("ERR:",e.message);process.exit(1);});

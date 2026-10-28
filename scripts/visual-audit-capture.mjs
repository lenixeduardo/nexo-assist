import {chromium} from 'playwright';
import {readFileSync,mkdirSync} from 'node:fs';

mkdirSync('artifacts/visual-audit',{recursive:true});
const browser=await chromium.launch({headless:true});
for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
 const res=await page.goto('https://nexo-assist-self.vercel.app/',{waitUntil:'networkidle',timeout:45000});
 await page.locator('.login-screen').waitFor({timeout:12000});
 await page.evaluate(()=>document.fonts.ready);
 const metrics=await page.evaluate(()=>{
  const sel=['.login-screen','.login-showcase','.login-right','.showcase-main h1','.login-form-container h2','.login-form-container form','.demo-chat'];
  return {viewport:{width:innerWidth,height:innerHeight},pageTitle:document.title,loadedFonts:[...document.fonts].filter(x=>x.status==='loaded').map(x=>x.family),elements:Object.fromEntries(sel.map(s=>{const el=document.querySelector(s);if(!el)return [s,null];const c=getComputedStyle(el),r=el.getBoundingClientRect();return [s,{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),fontFamily:c.fontFamily,fontSize:c.fontSize,color:c.color,background:c.backgroundColor,display:c.display}]}))};
 });
 console.log('VISUAL_METRICS_'+name.toUpperCase()+'='+JSON.stringify({http:res.status(),...metrics}));
 const path='artifacts/visual-audit/production-login-'+name+'.jpg';
 await page.screenshot({path,type:'jpeg',quality:78});
 console.log('VISUAL_IMAGE_'+name.toUpperCase()+'_BEGIN');
 console.log(readFileSync(path).toString('base64'));
 console.log('VISUAL_IMAGE_'+name.toUpperCase()+'_END');
 await page.close();
}
await browser.close();

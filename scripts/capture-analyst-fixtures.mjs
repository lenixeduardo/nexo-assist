import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.NEXO_VISUAL_FIXTURE_BASE_URL||'http://127.0.0.1:4174';
const dir='artifacts/visual-audit/fixture';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const results=[];
try{
 let ready=false;
 for(let i=0;i<35;i++){try{const r=await fetch(base+'/');if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}
 if(!ready)throw Error('Fixture server did not become ready');
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('[name=email]').fill('rafael.lima@nexo.com.br');
 await page.locator('[name=password]').fill('fixture-only');
 await page.locator('#login-form button[type=submit]').click();
 await page.locator('.analyst-shell').waitFor({timeout:25000});
 await page.locator('[data-select]').first().waitFor({timeout:20000});
 await page.evaluate(()=>document.fonts.ready);
 const capture=async(name,selector)=>{await page.locator(selector).waitFor();await page.screenshot({path:dir+'/'+name+'.png',fullPage:false});const data=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.body.scrollWidth,background:getComputedStyle(document.querySelector('.analyst-shell')).backgroundColor,queueBackground:getComputedStyle(document.querySelector('.queue')).backgroundColor,railBackground:getComputedStyle(document.querySelector('.rail')).backgroundColor,optionButtons:[...document.querySelectorAll('.queue-filters button')].map(x=>({label:x.textContent.trim(),background:getComputedStyle(x).backgroundColor,color:getComputedStyle(x).color}))}));results.push({name,...data});};
 await capture('04-analyst-queue','.queue');
 await page.locator('[data-select="visual-bruno-active"]').click();
 await page.locator('.analyst-main .composer').waitFor({timeout:20000});
 await capture('05-analyst-active','.analyst-main .composer');
 writeFileSync(dir+'/fixture-screenshot-proof.json',JSON.stringify({base,results},null,2));
 console.log('ANALYST_FIXTURE_SCREENSHOTS='+JSON.stringify(results));
 if(results.some(r=>r.scrollWidth>r.width))throw Error('Horizontal overflow in fixture screenshot');
}finally{await browser.close()}

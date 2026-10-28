import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.NEXO_AUDIT_URL||'https://nexo-assist-self.vercel.app/';
const credentials=[
 {role:'employee',email:process.env.NEXO_AUDIT_EMPLOYEE_EMAIL,password:process.env.NEXO_AUDIT_EMPLOYEE_PASSWORD},
 {role:'analyst',email:process.env.NEXO_AUDIT_ANALYST_EMAIL,password:process.env.NEXO_AUDIT_ANALYST_PASSWORD}
];
mkdirSync('artifacts/visual-audit/authenticated',{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
async function snap(page,label,selector){await page.locator(selector).first().waitFor({timeout:20000});await page.evaluate(()=>document.fonts.ready);const path='artifacts/visual-audit/authenticated/'+label+'.png';await page.screenshot({path,fullPage:false});const metrics=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],title:document.title,bodyScrollWidth:document.body.scrollWidth,hasHorizontalOverflow:document.body.scrollWidth>innerWidth}));results.push({screen:label,status:'captured',path,...metrics});}
for(const c of credentials){
 if(!c.email||!c.password){results.push({role:c.role,status:'not_tested',reason:'Missing protected GitHub Actions audit credentials'});continue;}
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 try{
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('.login-screen').waitFor({timeout:25000});
  await page.locator('[name=email]').fill(c.email);
  await page.locator('[name=password]').fill(c.password);
  await page.locator('#login-form button[type=submit]').click();
  const expected=c.role==='employee'?'.shell':'.analyst-shell';
  await page.locator(expected).waitFor({timeout:25000});
  if(c.role==='employee'){
   await snap(page,'02-employee-chat',expected);
   const hasMessages=await page.locator('.message').count();
   if(hasMessages)await snap(page,'03-employee-ticket-query',expected);
   else results.push({screen:'03-employee-ticket-query',status:'not_tested',reason:'No conversation history for the employee'});
   await page.locator('[data-nav=profile]').click();
   await snap(page,'06-employee-profile','.profile-center');
  }else{
   await snap(page,'04-analyst-queue',expected);
   const active=page.locator('.analyst-main .composer');
   if(!(await active.count())){
    const count=await page.locator('[data-select]').count();
    for(let i=0;i<count;i++){
     await page.locator('[data-select]').nth(i).click();
     if(await active.count())break;
    }
   }
   if(await active.count())await snap(page,'05-analyst-active','.analyst-main');
   else results.push({screen:'05-analyst-active',status:'not_tested',reason:'No active assigned conversation; audit did not assume or modify production tickets'});
  }
 }catch(err){results.push({role:c.role,status:'error',message:String(err.message).slice(0,260)});}
 await context.close();
}
await browser.close();
writeFileSync('artifacts/visual-audit/authenticated/results.json',JSON.stringify({base,results},null,2));
console.log('AUTHENTICATED_AUDIT_RESULTS='+JSON.stringify(results));
if(results.some(r=>r.status==='error'||(r.status==='not_tested'&&r.role))){console.error('Authenticated visual audit failed: required login was not verified.');process.exitCode=1;}else if(results.some(r=>r.status==='not_tested')){console.warn('Authenticated visual audit PARTIAL: some production states require existing tickets. See results.json; do not treat untested screens as approved.');}

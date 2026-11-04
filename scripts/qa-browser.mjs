/** Deterministic browser QA against an isolated, real PostgreSQL app.
 * Never points at the production application or Supabase.
 * Does NOT assert real Mistral compatibility.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';

if (process.env.NODE_ENV !== 'test' ||
    process.env.NEXO_ISOLATED_TEST_DB !== 'true' ||
    !/^postgres(?:ql)?:\/\/[^@]+@(?:localhost|127\.0\.0\.1):5432\//.test(process.env.DATABASE_URL||'')) {
 throw new Error('QA_SAFETY: run only with isolated localhost PostgreSQL and NODE_ENV=test');
}
const PORT=process.env.QA_PORT||'4398';
const BASE='http://127.0.0.1:'+PORT;
const DIR='artifacts/qa-browser';
mkdirSync(DIR,{recursive:true});
const report={environment:'isolated PostgreSQL; deterministic rules; real Chromium',realMistralTested:false,checks:[],screenshots:[],errors:[]};
const check=(name,ok,detail='')=>{report.checks.push({name,pass:!!ok,detail});assert.ok(ok,name+(detail?': '+detail:''))};
let server=null,browser=null;
async function login(page,email) {
 await page.goto(BASE,{waitUntil:'domcontentloaded'});
 await page.locator('#login-form').waitFor({timeout:25000});
 await page.locator('input[name=email]').fill(email);
 await page.locator('input[name=password]').fill('isolated-test-password');
 await page.locator('#login-form button[type=submit]').click();
 await page.locator('.shell, .analyst-shell').waitFor({timeout:30000});
}
async function capture(page,name){
 const path=DIR+'/'+name+'.png';
 await page.screenshot({path,animations:'disabled'});
 report.screenshots.push(path);
 const d=await page.evaluate(()=>({width:window.innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth}));
 check(name+' no document overflow',Math.max(d.documentWidth,d.bodyWidth)<=d.width+1,JSON.stringify(d));
}
async function send(page,message){
 await page.locator('#send-form textarea').fill(message);
 await page.locator('#send-form button[type=submit]').click();
 await page.waitForFunction(()=>{const b=document.querySelector('#send-form button[type=submit]');return !!b&&!b.disabled},{timeout:30000});
}
async function run(){
 server=spawn(process.execPath,['dist/server.js'],{
  env:{...process.env,PORT,APP_AUTH_USERS_JSON:'',APP_DEMO_LOGIN:'true',USE_MASTRA:'false',SEED_DEMO_TICKETS:'true',NODE_ENV:'test'},stdio:['ignore','pipe','pipe']
 });
 let stderr='';server.stderr.on('data',b=>{stderr+=String(b).slice(0,500)});
 let ready=false;
 for(let i=0;i<80;i++){try{const r=await fetch(BASE+'/api/health');if(r.ok){ready=true;break}}catch{}await sleep(250)}
 check('isolated server started',ready,stderr.slice(0,250));
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(BASE,{waitUntil:'domcontentloaded'});
 await page.locator('.login-screen').waitFor();
 await capture(page,'01-login-desktop');
 check('login has no invented metrics',await page.getByText('72%',{exact:true}).count()===0);
 await login(page,'ana.souza@nexo.com.br');
 check('employee shell',await page.locator('.shell').count()===1);
 await capture(page,'02-employee-chat');
 await page.locator('[data-nav=profile]').click();
 await page.locator('.profile-center').waitFor();
 await capture(page,'06-profile');
 await page.locator('[data-nav=chat]').click();
 await send(page,'Minha impressora está travando, só eu, tenho alternativa de usar outra impressora');
 await page.locator('[data-confirm]').first().waitFor({timeout:30000});
 await capture(page,'03-ticket-draft');
 await page.locator('[data-edit]').last().click();
 const editor=page.locator('[data-draft-edit-form]').last();
 await editor.waitFor({state:'visible'});
 await editor.locator('textarea').fill('Impressora está travando; somente eu, tenho alternativa em outro setor.');
 await editor.locator('[type=submit]').click();
 await page.getByText('Impressora está travando; somente eu, tenho alternativa em outro setor.',{exact:true}).first().waitFor({timeout:15000});
 check('draft editable with inline form',true);
 await page.locator('[data-confirm]').last().click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-confirm]').length===0,{timeout:30000});
 check('draft confirmation completed',true);
 const ticketResponse=await page.evaluate(async()=>{const r=await fetch('/api/tickets');return {status:r.status,data:await r.json()}});
 check('ticket persisted through HTTP',ticketResponse.status===200&&ticketResponse.data.tickets.some(t=>t.title.includes('impressora')||t.title.includes('Impressora')));
 await page.locator('[data-new]').first().click();
 await send(page,'Quero falar com um analista');
 await page.waitForFunction(()=>document.querySelector('.chat-state')?.textContent.includes('Aguardando analista'),{timeout:30000});
 check('human handoff suspends agent',true);
 const userConversation=await page.evaluate(async()=>{const r=await fetch('/api/conversations');return (await r.json()).conversations[0]});
 check('handoff state persisted',userConversation.state==='WAITING_ANALYST');
 const ac=await browser.newContext({viewport:{width:1440,height:900}});
 const analyst=await ac.newPage();
 analyst.on('pageerror',e=>report.errors.push(String(e)));
 await login(analyst,'rafael.lima@nexo.com.br');
 await analyst.locator('[data-action=assume]').first().waitFor({timeout:30000});
 await capture(analyst,'04-analyst-queue');
 await analyst.locator('[data-action=assume]').first().click();
 await analyst.locator('#analyst-send').waitFor({timeout:30000});
 await capture(analyst,'05-analyst-active');
 await analyst.locator('#analyst-send textarea').fill('Chamado recebido pela equipe de TI em ambiente de testes.');
 await analyst.locator('#analyst-send button[type=submit]').click();
 await analyst.getByText('Chamado recebido pela equipe de TI em ambiente de testes.').first().waitFor({timeout:30000});
 check('analyst sends real persisted message',true);
 await analyst.locator('[data-action=return]').first().click();
 await analyst.waitForFunction(()=>!document.querySelector('[data-action=return]'),{timeout:30000});
 check('analyst returns to agent',true);
 await ac.close();
 await context.close();
 for(const width of [375,390,768]){
  const mobileContext=await browser.newContext({viewport:{width,height:844},isMobile:false});
  const mobile=await mobileContext.newPage();
  mobile.on('pageerror',e=>report.errors.push(String(e)));
  await login(mobile,'bruno.tavares@nexo.com.br');
  await capture(mobile,'07-mobile-chat-'+width);
  if(width===375){
   await mobile.locator('[data-menu]').click();
   check('mobile drawer opens',await mobile.locator('#side.open').count()===1);
   await mobile.keyboard.press('Escape');
   check('mobile drawer closes on Escape',await mobile.locator('#side.open').count()===0);
  }
  await mobileContext.close();
 }
 check('no browser exceptions',report.errors.length===0,report.errors.join('; ').slice(0,500));
}
try{await run()}catch(e){report.error=String(e.stack||e).slice(0,1500);process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(server){server.kill();await Promise.race([new Promise(r=>server.once('exit',r)),sleep(2500)])}
 report.passed=report.checks.filter(x=>x.pass).length;
 report.total=report.checks.length;
 report.status=process.exitCode===1?'FAIL':'PASS';
 writeFileSync(DIR+'/results.json',JSON.stringify(report,null,2));
 console.log('QA_BROWSER_SUMMARY='+JSON.stringify({status:report.status,passed:report.passed,total:report.total,screenshots:report.screenshots,error:report.error||null,errors:report.errors}));
}

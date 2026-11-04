/** Deterministic browser QA against an isolated, real PostgreSQL app.
 * Never points at the production application or Supabase.
 * Does NOT assert real Mistral compatibility.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
import {newConversation,saveMessage} from '../dist/postgres-db.js';
import {execute} from '../dist/postgres.js';


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
 // Wait for the actual HTTP POST, not merely a button state. The old check
 // could pass before the click handler disabled its button, causing flaky QA.
 const responseWait=page.waitForResponse(r=>r.request().method()==='POST'&&/\/api\/conversations\/[^/]+\/messages$/.test(new URL(r.url()).pathname),{timeout:30000});
 await page.locator('#send-form button[type=submit]').click();
 const response=await responseWait;
 check('employee message request completed',response.ok(),'HTTP '+response.status());
 await page.waitForFunction(text=>[...document.querySelectorAll('.message.user .bubble')].some(node=>node.textContent?.trim()===text),message,{timeout:15000});
}
// Visual test fixtures live only in a fresh isolated PostgreSQL database.
// They are real persisted conversations, never synthetic DOM data or production seeds.
async function seedAnalystVisualQueue(){
 const cases=[
  {id:'u-carla',text:'Preciso de acesso ao SAP ainda hoje; minha conta não tem permissão.',reply:'Vou registrar o pedido e encaminhar para a equipe de suporte.',state:'WAITING_ANALYST'},
  {id:'u-bruno',text:'Meu notebook está com acesso à rede, mas preciso falar com o suporte.',reply:'Entendi. Um analista poderá acompanhar o atendimento.',state:'WAITING_ANALYST'},
  {id:'u-diego',text:'Tenho um incidente na estação de trabalho e preciso de ajuda.',reply:'Vou verificar os próximos passos do atendimento.',state:'WAITING_ANALYST'},
  {id:'u-carla',text:'Meu Outlook não consegue sincronizar, podem me ajudar?',reply:'Encaminhei seu caso para a equipe de suporte.',state:'WAITING_ANALYST'},
  {id:'u-bruno',text:'Preciso atualizar a permissão da pasta do projeto.',reply:'Um atendente já está verificando a solicitação.',state:'ANALYST_ACTIVE'},
  {id:'u-diego',text:'Minha VPN caiu e preciso de ajuda agora.',reply:'Encaminhei sua solicitação a um atendente.',state:'WAITING_ANALYST'},
 ];
 for(const item of cases){
  const c=await newConversation(item.id);
  await saveMessage(c.id,'USER',item.text,item.id);
  await saveMessage(c.id,'AGENT',item.reply);
  const assignment=item.state==='ANALYST_ACTIVE'?'u-rafael':null;
  await execute('UPDATE conversations SET state=?,assigned_analyst_id=?,version=version+1,updated_at=? WHERE id=?',item.state,assignment,new Date().toISOString(),c.id);
 }
 check('isolated queue fixtures persisted',true);
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
 // The original Pencil chat contains prior turns; reproduce their density as
 // actual records in the isolated database rather than adding screenshot-only DOM.
 const draftConv=await page.evaluate(async()=>{const r=await fetch('/api/conversations');return (await r.json()).conversations[0]});
 await saveMessage(draftConv.id,'USER','Minha impressora trava desde ontem, ao tentar imprimir relatórios.','u-ana');
 await saveMessage(draftConv.id,'AGENT','Entendi. Quem está sendo afetado? Existe uma alternativa para continuar trabalhando?');
 await saveMessage(draftConv.id,'USER','Só eu. Tenho alternativa de usar outra impressora.','u-ana');
 await send(page,'Minha impressora está travando, só eu, tenho alternativa de usar outra impressora');
 await page.locator('[data-confirm]').first().waitFor({timeout:30000});
 await page.waitForFunction(()=>{const b=document.querySelector('[data-confirm]'),r=b?.getBoundingClientRect();return !!r&&r.top>60&&r.bottom<innerHeight-85},null,{timeout:10000});
 check('new draft confirmation controls visible after multi-turn conversation',true);
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
 await page.locator('.empty-chat').waitFor({state:'visible',timeout:15000});
 await seedAnalystVisualQueue();
 const statusConv=await page.evaluate(async()=>{const r=await fetch('/api/conversations');return (await r.json()).conversations[0]});
 await saveMessage(statusConv.id,'USER','Qual o status dos meus chamados?','u-ana');
 await saveMessage(statusConv.id,'AGENT','Você tem 3 chamados abertos. Sobre qual deles quer saber?');
 await saveMessage(statusConv.id,'USER','INC-20311 · Notebook lento após atualização','u-ana');
 await saveMessage(statusConv.id,'AGENT','Esse chamado está sem atualização há 5 dias, além do prazo previsto. Quer que eu chame um analista?');
 await saveMessage(statusConv.id,'USER','Está parado há 5 dias.','u-ana');
 await sleep(20);
 await send(page,'Quero falar com um analista.');
 await page.waitForFunction(()=>document.querySelector('.chat-state')?.textContent.includes('Aguardando analista'),{timeout:30000});
 check('human handoff suspends agent',true);
 await capture(page,'03-ticket-status');
 const userConversation=await page.evaluate(async()=>{const r=await fetch('/api/conversations');return (await r.json()).conversations[0]});
 check('handoff state persisted',userConversation.state==='WAITING_ANALYST');
 const ac=await browser.newContext({viewport:{width:1440,height:900}});
 const analyst=await ac.newPage();
 analyst.on('pageerror',e=>report.errors.push(String(e)));
 await login(analyst,'rafael.lima@nexo.com.br');
 await analyst.locator('[data-action=assume]').first().waitFor({timeout:30000});
 check('analyst shows multiple real queue conversations',(await analyst.locator('[data-select]').count())>=6);
 check('analyst displays last-message previews',(await analyst.locator('.queue-preview').first().textContent()).trim().length>0);
 check('analyst has colored avatar variants',(await analyst.locator('.queue-avatar[class*=tone-]').count())>=6);
 await analyst.locator('.analyst-ticket-section').first().waitFor({timeout:15000});
 check('analyst groups tickets mentioned in the conversation',await analyst.getByText('Desta conversa',{exact:true}).count()>=1);
 await capture(analyst,'04-analyst-queue');
 await analyst.locator('[data-action=assume]').first().click();
 await analyst.locator('#analyst-send').waitFor({timeout:30000});
 await analyst.setViewportSize({width:1567,height:900});
 check('assigned analyst actions are in header',(await analyst.locator('.analyst-top-actions [data-action=return]').count())===1&&(await analyst.locator('.analyst-top-actions [data-action=close]').count())===1);
 check('assigned analyst has no redundant footer action bar',(await analyst.locator('.analyst-actions').count())===0);
 await analyst.locator('#analyst-send textarea').fill('Olá, Ana! Aqui é o Rafael. Vou analisar seu chamado e acompanhar o atendimento.');
 await analyst.locator('#analyst-send button[type=submit]').click();
 await analyst.getByText('Olá, Ana! Aqui é o Rafael. Vou analisar seu chamado e acompanhar o atendimento.').first().waitFor({timeout:30000});
 check('analyst sends real persisted message',true);
 await capture(analyst,'05-analyst-active');
 await analyst.locator('[data-action=return]').first().click();
 let returned=false,returnState='UNKNOWN';
 for(let i=0;i<60;i++){
  returnState=await page.evaluate(async id=>{
   const r=await fetch('/api/conversations/'+id);
   if(!r.ok)return 'HTTP_'+r.status;
   return (await r.json()).conversation.state;
  },userConversation.id);
  if(returnState==='AGENT_ACTIVE'){returned=true;break;}
  await sleep(300);
 }
 check('analyst returns to agent in persisted conversation',returned,returnState);
 await ac.close();
 await context.close();
 // Exercise the real status-selection pathway from employee login through the HTTP agent.
 const selectionContext=await browser.newContext({viewport:{width:1440,height:900}});
 const selectionPage=await selectionContext.newPage();
 selectionPage.on('pageerror',e=>report.errors.push(String(e)));
 await login(selectionPage,'ana.souza@nexo.com.br');
 await selectionPage.locator('[data-new]').first().click();
 // Creating a new conversation is asynchronous: wait for the new chat shell,
 // otherwise the old form may be removed between fill() and click().
 await selectionPage.locator('.empty-chat').waitFor({state:'visible',timeout:15000});
 await send(selectionPage,'Qual o status dos meus chamados?');
 const selectionDiagnostics=await selectionPage.evaluate(()=>({state:document.querySelector('.chat-state')?.textContent,agentMessages:[...document.querySelectorAll('.message.agent .bubble')].slice(-2).map(x=>x.textContent?.slice(0,300)),ticketChoices:[...document.querySelectorAll('[data-ticket]')].map(x=>x.dataset.ticket),toast:document.querySelector('#toast')?.textContent?.slice(0,150)}));
 console.log('TICKET_SELECTION_DIAGNOSTICS='+JSON.stringify(selectionDiagnostics));
 await capture(selectionPage,'03-ticket-selection');
 await selectionPage.locator('[data-ticket="INC-20311"]').waitFor({timeout:30000});
 check('status selection renders actual ticket title',await selectionPage.getByText('Notebook lento após atualização',{exact:false}).count()>0);
 await selectionPage.locator('[data-ticket="INC-20311"]').click();
 await selectionPage.locator('.ticket-status-card').waitFor({timeout:30000});
 check('status detail uses real authorized ticket ID',(await selectionPage.locator('.ticket-status-card .ticket-id').first().textContent())?.trim().endsWith('INC-20311'));
 check('status detail shows real ticket description',(await selectionPage.locator('.ticket-status-description').textContent())?.includes('atualização'));
 check('status detail exposes four real metadata fields',(await selectionPage.locator('.ticket-status-grid>div').count())===4);
 await selectionPage.locator('.ticket-status-card').scrollIntoViewIfNeeded();
 await capture(selectionPage,'03-ticket-detail');
 await selectionContext.close();
 // Impact choices are accessible, optional and submit through the real chat API.
 const impactContext=await browser.newContext({viewport:{width:1440,height:900}});
 const impactPage=await impactContext.newPage();
 impactPage.on('pageerror',e=>report.errors.push(String(e)));
 await login(impactPage,'bruno.tavares@nexo.com.br');
 await impactPage.locator('[data-new]').first().click();
 await impactPage.locator('.empty-chat').waitFor({state:'visible',timeout:15000});
 await send(impactPage,'Meu teclado parou de funcionar.');
 await impactPage.locator('.agent-choice[data-suggest="Só eu"]').waitFor({timeout:30000});
 check('agent presents real impact decision choices',await impactPage.locator('.agent-choice').count()===4);
 await impactPage.locator('.agent-choice[data-suggest="Só eu"]').click();
 await impactPage.locator('.message.user .bubble').filter({hasText:'Só eu'}).first().waitFor({timeout:30000});
 check('impact choice submits through real employee chat',true);
 await impactContext.close();
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

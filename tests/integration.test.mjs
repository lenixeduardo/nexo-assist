import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tmp=mkdtempSync(join(tmpdir(),'nexo-tests-'));
const port=33000+Math.floor(Math.random()*20000);
const origin=`http://127.0.0.1:${port}`;
let child;let cookies={};let convo;
async function api(path,method='GET',data,as='ana'){
 const r=await fetch(origin+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(cookies[as]?{'Cookie':cookies[as]}:{})},body:data?JSON.stringify(data):undefined});const json=await r.json();return {status:r.status,data:json,cookie:r.headers.get('set-cookie')};
}
async function login(as,email){const r=await api('/api/login','POST',{email,password:'anything'});assert.equal(r.status,200,JSON.stringify(r.data));cookies[as]=r.cookie.split(';')[0];return r.data.user}
async function msg(text,as='ana',c=convo){return api(`/api/conversations/${c}/messages`,'POST',{text},as)}
before(async()=>{child=spawn(process.execPath,['dist/server.js'],{cwd:root,env:{...process.env,DB_PATH:join(tmp,'test.sqlite'),PORT:String(port),APP_SESSION_SECRET:'integration-test-secret-123456789012345',LLM_API_KEY:'',TICKET_SERVICE_DOWN:'false'},stdio:'pipe'});let ready=false;for(let i=0;i<80;i++){if(child.exitCode!==null)break;try{const r=await fetch(origin+'/api/health');if(r.ok){ready=true;break}}catch{}await wait(100)}assert.ok(ready,'server should start')});
after(()=>{child?.kill('SIGTERM');rmSync(tmp,{recursive:true,force:true})});

test('health, sessions, roles and scoped ticket access',async()=>{
 const health=await api('/api/health');assert.equal(health.status,200);
 let unauth=await api('/api/tickets');assert.equal(unauth.status,401);
 const ana=await login('ana','ana.souza@nexo.com.br');assert.equal(ana.role,'EMPLOYEE');
 await login('bruno','bruno.tavares@nexo.com.br');await login('analyst','rafael.lima@nexo.com.br');
 const mine=await api('/api/tickets');assert.equal(mine.status,200);assert.ok(mine.data.tickets.every(t=>t.owner_user_id==='u-ana'));
 const forbidden=await api('/api/tickets/INC-30002');assert.equal(forbidden.status,404);
 const own=await api('/api/tickets/INC-20311');assert.equal(own.status,200);
 const analystCannot=await api('/api/tickets','GET',undefined,'analyst');assert.equal(analystCannot.status,403);
 convo=(await api('/api/conversations','POST',{})).data.conversation.id;assert.ok(convo);
});

test('ticket status without id shows own tickets and traced tool',async()=>{
 const r=await msg('Qual o status dos meus chamados?');assert.equal(r.status,200);assert.match(r.data.response.text,/INC-20311/);assert.equal(r.data.response.ui.type,'ticket_selection');assert.equal(r.data.response.trace.intent,'TICKET_STATUS');assert.ok(r.data.response.trace.actions.some(a=>a.name==='listMyTickets'));
 assert.ok(!r.data.response.text.includes('INC-30002'));
});

test('audit API exposes ordered evidence linked to message trace IDs',async()=>{
 const res=await api(`/api/conversations/${convo}/audit`);
 assert.equal(res.status,200,JSON.stringify(res.data));assert.ok(res.data.traces.length>=1);
 const [entry]=res.data.traces;assert.equal(entry.run.mode,'deterministic');
 assert.equal(entry.run.status,'COMPLETED');assert.ok(entry.events.some(x=>x.kind==='TOOL_CALL'));
 assert.ok(entry.events.some(x=>x.kind==='TOOL_RESULT'));
 assert.ok(entry.events.some(x=>x.kind==='DECISION'));
 assert.ok(entry.events.every((event,i)=>event.seq===i+1));
 const conversationDetail=await api(`/api/conversations/${convo}`);
 const agentMessage=conversationDetail.data.messages.find(x=>x.trace?.traceId);
 assert.ok(agentMessage);assert.equal(agentMessage.trace.traceId,entry.run.trace_id);
});
test('audit endpoint enforces employee ownership and analyst visibility',async()=>{
 const other=await api(`/api/conversations/${convo}/audit`,'GET',undefined,'bruno');assert.equal(other.status,404);
 const analyst=await api(`/api/conversations/${convo}/audit`,'GET',undefined,'analyst');assert.equal(analyst.status,403);
 const noSession=await api(`/api/conversations/${convo}/audit`,'GET',undefined,'missing');assert.equal(noSession.status,401);
});

test('Windows 11 does not get Windows 10 VPN instructions',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 let r=await msg('Meu notebook não conecta na VPN, erro 809', 'ana',c);assert.match(r.data.response.text,/Windows 10 ou Windows 11/);
 r=await msg('É Windows 11','ana',c);assert.doesNotMatch(r.data.response.text,/reinstale o cliente VPN/i);
});

test('new ticket draft, confirmation and idempotent replay',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 let r=await msg('Minha impressora está travando, só eu, tenho alternativa de usar outra impressora','ana',c);
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.response.trace.decision,'PROPOSE_DRAFT');const id=r.data.response.ui.draftId;
 const draft=(await api(`/api/drafts/${id}`)).data.draft;assert.equal(draft.category,'Hardware');assert.equal(draft.priority,'MEDIA');assert.equal(draft.status,'PENDING_CONFIRMATION');
 const beforeTickets=(await api('/api/tickets')).data.tickets.length;
 const confirmed=await api(`/api/drafts/${id}/confirm`,'POST',{version:draft.version,idempotencyKey:'unique-confirm-001'});
 assert.equal(confirmed.status,200,JSON.stringify(confirmed.data));assert.match(confirmed.data.ticket.id,/INC-/);
 assert.equal((await api('/api/tickets')).data.tickets.length,beforeTickets+1);
 const replay=await api(`/api/drafts/${id}/confirm`,'POST',{version:draft.version,idempotencyKey:'unique-confirm-001'});
 assert.equal(replay.status,200);assert.equal(replay.data.ticket.id,confirmed.data.ticket.id);
 assert.equal((await api('/api/tickets')).data.tickets.length,beforeTickets+1);
 const stale=await api(`/api/drafts/${id}/confirm`,'POST',{version:draft.version,idempotencyKey:'another-key'});assert.equal(stale.status,409);
});

test('duplicate detection prevents new draft for known problem',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 const r=await msg('Preciso de um segundo monitor para home office, só eu, sem urgência','ana',c);
 assert.equal(r.status,200);assert.match(r.data.response.text,/REQ-10442/);assert.notEqual(r.data.response.trace.decision,'PROPOSE_DRAFT');
});

test('out-of-scope message does not create ticket',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 const r=await msg('Preciso saber como pedir férias ao RH','ana',c);assert.equal(r.data.response.trace.intent,'OUT_OF_SCOPE');assert.equal(r.data.response.trace.decision,'REFUSE');
});

test('handoff pauses agent, analyst assumes, replies and returns',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 const a=await msg('Quero falar com um analista','ana',c);assert.equal(a.status,200);assert.equal(a.data.response.trace.decision,'TRANSFER');assert.equal(a.data.conversation.state,'WAITING_ANALYST');
 const b=await msg('Tenho mais informações','ana',c);assert.equal(b.status,200);assert.equal(b.data.paused,true);
 const queue=await api('/api/analyst/queue','GET',undefined,'analyst');assert.ok(queue.data.conversations.some(x=>x.id===c));
 let trans=await api(`/api/analyst/conversations/${c}/assume`,'POST',{},'analyst');assert.equal(trans.status,200);assert.equal(trans.data.conversation.state,'ANALYST_ACTIVE');
 const during=await msg('Fala comigo Nexo','ana',c);assert.equal(during.data.paused,true);
 const reply=await api(`/api/analyst/conversations/${c}/message`,'POST',{text:'Vou verificar o seu problema.'},'analyst');assert.equal(reply.status,200);
 trans=await api(`/api/analyst/conversations/${c}/return`,'POST',{},'analyst');assert.equal(trans.status,200);assert.equal(trans.data.conversation.state,'AGENT_ACTIVE');
 const detail=await api(`/api/conversations/${c}`);assert.ok(detail.data.messages.some(m=>m.role==='ANALYST'));
});

test('analyst cannot read active private conversation',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 const blocked=await api(`/api/conversations/${c}`,'GET',undefined,'analyst');assert.equal(blocked.status,403);
});

test('simulated outage surfaces explicit failure with no ticket creation',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 const toggled=await api('/api/demo/outage','POST',{ms:2200},'analyst');assert.equal(toggled.status,200);
 const a=await msg('Qual o status dos meus chamados?','ana',c);assert.equal(a.status,200);assert.match(a.data.response.text,/indisponível/);
 await wait(2250);
 const b=await msg('Qual o status dos meus chamados?','ana',c);assert.equal(b.status,200);assert.equal(b.data.response.trace.actions[0].outcome,'OK');
});

test('session message counter persists across requests',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 const r=await msg('Como funciona o horário de atendimento?','ana',c);assert.equal(r.status,200);
 const details=await api(`/api/conversations/${c}`);assert.equal(details.data.conversation.session_count,1);assert.ok(details.data.messages.length>=2);
});

test('resolved ticket within seven days can be reopened after confirmation',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 const r=await msg('Reabrir INC-20150: O acesso ao SAP continua bloqueado depois do atendimento anterior','ana',c);
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.response.trace.decision,'PROPOSE_DRAFT');
 const d=(await api(`/api/drafts/${r.data.response.ui.draftId}`)).data.draft;assert.equal(d.action,'REOPEN');
 const result=await api(`/api/drafts/${d.id}/confirm`,'POST',{version:d.version,idempotencyKey:'reopen-20150'});
 assert.equal(result.status,200);assert.equal(result.data.ticket.status,'ABERTO');assert.equal(result.data.ticket.resolved_at,null);
});

test('resolved ticket beyond seven days cannot be reopened',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 const r=await msg('Reabrir INC-19010: O Outlook continua travando','ana',c);
 assert.equal(r.status,200);assert.equal(r.data.response.trace.decision,'REFUSE');
});

test('team outage escalates as CRITICAL without unauthorized creation',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 const before=(await api('/api/tickets')).data.tickets.length;
 const r=await msg('A rede da minha equipe inteira parou, ninguém consegue trabalhar e todo o setor está parado','ana',c);
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.response.trace.decision,'TRANSFER');assert.equal(r.data.conversation.state,'WAITING_ANALYST');
 assert.ok(r.data.response.trace.policyRules.includes('P_CRITICAL_TEAM'));
 assert.equal((await api('/api/tickets')).data.tickets.length,before);
});

test('analyst can close and cannot send to closed conversation',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 await msg('Quero falar com analista','ana',c);
 const assume=await api(`/api/analyst/conversations/${c}/assume`,'POST',{},'analyst');assert.equal(assume.status,200);
 const end=await api(`/api/analyst/conversations/${c}/close`,'POST',{},'analyst');assert.equal(end.data.conversation.state,'CLOSED');
 const denied=await msg('Ainda está aí?','ana',c);assert.equal(denied.status,409);
});

test('login rejects unknown identity',async()=>{
 const bad=await api('/api/login','POST',{email:'fake@nexo.com.br',password:'whatever'});assert.equal(bad.status,401);
});

test('cross-user conversation access blocked',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 const forbidden=await api(`/api/conversations/${c}`,'GET',undefined,'bruno');assert.equal(forbidden.status,404);
});

test('edit and cancel draft never change a ticket',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 const r=await msg('Meu teclado está com problema, só eu, consigo usar outro teclado como alternativa','ana',c);
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.response.trace.decision,'PROPOSE_DRAFT');
 const id=r.data.response.ui.draftId;const d=(await api(`/api/drafts/${id}`)).data.draft;
 const changed=await api(`/api/drafts/${id}`,'PATCH',{version:d.version,description:'Teclado USB deixa de responder durante reuniões'});assert.equal(changed.status,200);
 const canceled=await api(`/api/drafts/${id}/cancel`,'POST',{});assert.equal(canceled.status,200);
 const invalid=await api(`/api/drafts/${id}/confirm`,'POST',{version:d.version+1,idempotencyKey:'cancelled-key'});assert.equal(invalid.status,409);
});

test('30 user messages per session blocks 31st while preserving history',async()=>{
 const c=(await api('/api/conversations','POST',{})).data.conversation.id;
 for(let i=0;i<30;i++){const r=await msg('Qual é o horário de atendimento do service desk?','ana',c);assert.equal(r.status,200,`failure at ${i+1}: ${JSON.stringify(r.data)}`)}
 const limit=await msg('Mais uma pergunta','ana',c);assert.equal(limit.status,429);assert.equal(limit.data.error.code,'SESSION_MESSAGE_LIMIT');
 const detail=await api(`/api/conversations/${c}`);assert.equal(detail.data.conversation.session_count,30);assert.equal(detail.data.messages.filter(m=>m.role==='USER').length,30);
});

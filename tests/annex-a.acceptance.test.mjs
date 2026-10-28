import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import * as db from '../dist/postgres-db.js';
import {transaction,execute,closePool} from '../dist/postgres.js';
import {receiveMessage} from '../dist/agent.js';
import {auditForConversation} from '../dist/postgres-audit.js';
import {classify,priorityFor,ticketSla,canReopen,dueDate} from '../dist/policy.js';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required; use an isolated test database');
const rollback=Symbol('rollback');
async function scenario(fn){
 const previous={demo:process.env.SEED_DEMO_TICKETS,mastra:process.env.USE_MASTRA};
 process.env.SEED_DEMO_TICKETS='true';process.env.USE_MASTRA='false';
 try{await transaction(async()=>{await db.seed();await fn();throw rollback})}catch(e){if(e!==rollback)throw e}
 finally{for(const [key,value] of [['SEED_DEMO_TICKETS',previous.demo],['USE_MASTRA',previous.mastra]])if(value===undefined)delete process.env[key];else process.env[key]=value}
}
const chat=async(text,user='u-ana')=>{const c=await db.newConversation(user);return {c,result:await receiveMessage(user,c.id,text)}};
test.after(closePool);
test('A1: INC/REQ and all six categories',()=>{
 for(const [text,type,category] of [['VPN parou','INC','Rede e VPN'],['Solicitar monitor','REQ','Hardware'],['Senha bloqueada','INC','Acesso'],['Instalar software','REQ','Software'],['Outlook travando','INC','E-mail'],['Falha desconhecida','INC','Outros']])assert.deepEqual(classify(text),{type,category});
});
test('A2: all priorities, first/update deadlines and seven-day boundary',()=>{
 for(const [facts,priority] of [[{affected:'TEAM',blocked:true},'CRITICA'],[{affected:'COMPANY'},'CRITICA'],[{affected:'SELF',blocked:true},'ALTA'],[{todayDeadline:true},'ALTA'],[{hasWorkaround:true},'MEDIA'],[{request:true},'BAIXA']])assert.equal(priorityFor(facts).priority,priority);
 const now=new Date('2026-10-28T12:00:00Z');
 for(const priority of ['CRITICA','ALTA','MEDIA','BAIXA']){const last='2026-10-01T12:00:00Z';const t={priority,status:'ABERTO',opened_at:'2026-09-01T12:00:00Z',last_updated_at:last};assert.equal(ticketSla(t,now).dueAt,dueDate(priority,new Date(last)).toISOString());assert.equal(ticketSla(t,now).overdue,true);assert.equal(ticketSla({...t,status:'RESOLVIDO'},now).overdue,false)}
 assert.equal(canReopen({status:'RESOLVIDO',resolved_at:'2026-10-21T12:00:00Z'},now),true);assert.equal(canReopen({status:'RESOLVIDO',resolved_at:'2026-10-21T11:59:59Z'},now),false);
});
test('A3: collect required facts, draft all required fields, confirm idempotently',()=>scenario(async()=>{
 const c=await db.newConversation('u-ana');let r=await receiveMessage('u-ana',c.id,'Meu mouse está quebrado');assert.equal(r.response.trace.decision,'ASK');assert.ok(r.response.trace.missingFields.includes('affected'));
 r=await receiveMessage('u-ana',c.id,'Meu mouse está quebrado, só eu, tenho alternativa de usar outro mouse');assert.equal(r.response.ui.type,'draft');
 const d=await db.getDraft('u-ana',r.response.ui.draftId);for(const key of ['title','description','type','category','priority','affected'])assert.ok(d[key]);assert.equal(d.priority,'MEDIA');
 const before=(await db.listMyTickets('u-ana')).length;const first=await db.confirmDraft('u-ana',d.id,d.version,'annex-confirm');const replay=await db.confirmDraft('u-ana',d.id,d.version,'annex-confirm');assert.equal(replay.replay,true);assert.equal(replay.ticket.id,first.ticket.id);assert.equal((await db.listMyTickets('u-ana')).length,before+1);
}));
test('A4: existing incident is not duplicated, updates require confirmation',()=>scenario(async()=>{
 const c=await db.newConversation('u-ana');const before=(await db.listMyTickets('u-ana')).length;
 const dup=await receiveMessage('u-ana',c.id,'Meu notebook lento após atualização Windows, só eu, tenho alternativa');assert.ok(dup.response.trace.policyRules.includes('NO_DUPLICATE'));assert.equal((await db.listMyTickets('u-ana')).length,before);
 const original=await db.getMyTicket('u-ana','INC-20311');const r=await receiveMessage('u-ana',c.id,'Atualizar INC-20311: reinstalei o driver e o notebook continua lento.');const d=await db.getDraft('u-ana',r.response.ui.draftId);assert.equal(d.action,'UPDATE');assert.equal((await db.getMyTicket('u-ana','INC-20311')).description,original.description);
 const updated=await db.confirmDraft('u-ana',d.id,d.version,'annex-update');assert.ok(updated.ticket.description.includes('reinstalei'));assert.ok(new Date(updated.ticket.last_updated_at)>new Date(original.last_updated_at));
}));
test('A5: recent resolved incident reopens after confirmation; older incident is refused',()=>scenario(async()=>{
 const {c,result}=await chat('Reabrir INC-20150: minha conta SAP voltou a ficar bloqueada.');const d=await db.getDraft('u-ana',result.response.ui.draftId);assert.equal(d.action,'REOPEN');assert.equal((await db.getMyTicket('u-ana','INC-20150')).status,'RESOLVIDO');assert.equal((await db.confirmDraft('u-ana',d.id,d.version,'annex-reopen')).ticket.status,'ABERTO');
 const old=await receiveMessage('u-ana',c.id,'Reabrir INC-19010: Outlook voltou a travar ao abrir anexos.');assert.equal(old.response.trace.decision,'REFUSE');
}));
test('A6: requested, critical, overdue and uncertain handoffs include context',()=>scenario(async()=>{
 for(const [text,reason] of [['Quero falar com um analista','USER_REQUEST'],['Meu software parou para minha equipe e ninguém consegue trabalhar','CRITICAL'],['Qual o status do chamado INC-20311?','OVERDUE'],['zqxv 843 desconhecido','LOW_CONFIDENCE']]){
  const {c,result}=await chat(text);assert.equal(result.conversation.state,'WAITING_ANALYST',text);const h=await db.findOne('SELECT * FROM handoffs WHERE conversation_id=?',c.id);assert.equal(h.reason,reason);assert.ok(h.summary.length>10);
  const paused=await receiveMessage('u-ana',c.id,'Complemento enquanto aguardo');assert.equal(paused.paused,true);assert.equal((await auditForConversation(c.id)).length,1);
 }
}));
test('A7: analyst assumes, responds, returns and closes with the agent paused',()=>scenario(async()=>{
 const {c}=await chat('Quero falar com um analista');assert.ok((await db.analystQueue()).some(x=>x.id===c.id));await db.analystTransition('u-rafael',c.id,'assume');assert.equal((await receiveMessage('u-ana',c.id,'Mais contexto')).paused,true);await db.analystSend('u-rafael',c.id,'Recebido pelo analista');assert.ok((await db.messagesFor(c.id)).some(x=>x.role==='ANALYST'));await db.analystTransition('u-rafael',c.id,'return');assert.equal((await db.getConversation(c.id)).state,'AGENT_ACTIVE');await db.handoff(c.id,'u-ana','USER_REQUEST','Retorno solicitado pelo funcionário');await db.analystTransition('u-rafael',c.id,'assume');await db.analystTransition('u-rafael',c.id,'close');await assert.rejects(receiveMessage('u-ana',c.id,'Continuar'),e=>e.code==='CONVERSATION_LOCKED');
}));
test('A8: two actual employees cannot read or mutate each other’s tickets, drafts or conversations',()=>scenario(async()=>{
 assert.ok((await db.listMyTickets('u-bruno')).some(t=>t.id==='INC-30002'));await assert.rejects(db.getMyTicket('u-ana','INC-30002'),e=>e.code==='NOT_FOUND');await assert.rejects(db.getMyTicket('u-bruno','INC-20311'),e=>e.code==='NOT_FOUND');
 const {c,result}=await chat('Meu teclado não funciona, só eu, tenho alternativa de usar outro teclado');const id=result.response.ui.draftId;await assert.rejects(db.getDraft('u-bruno',id),e=>e.code==='NOT_FOUND');await assert.rejects(db.confirmDraft('u-bruno',id,1,'cross-owner'),e=>e.code==='NOT_FOUND');await assert.rejects(db.getConversation(c.id,'u-bruno'),e=>e.code==='NOT_FOUND');
}));
test('A9: out-of-scope requests redirect without tickets; article platform is respected',()=>scenario(async()=>{
 for(const text of ['Preciso consultar meu salário com RH','Quero reembolso do financeiro','O ar condicionado da sala quebrou']){const {result}=await chat(text);assert.equal(result.response.trace.intent,'OUT_OF_SCOPE');assert.equal(result.response.trace.decision,'REFUSE')}
 const a=await chat('Como resolver VPN erro 809?');assert.match(a.result.response.text,/Windows 10 ou Windows 11/);const w11=await receiveMessage('u-ana',a.c.id,'Como resolver VPN erro 809 no Windows 11?');assert.match(w11.response.text,/não recomenda|não.*aplicam|necessário abrir/i);
}));
test('supporting: outage makes no mutations and audit preserves ordered redacted decisions',()=>scenario(async()=>{
 const c=await db.newConversation('u-ana');const before=(await db.listMyTickets('u-ana')).length;process.env.TICKET_SERVICE_DOWN='true';let result;
 try{result=await receiveMessage('u-ana',c.id,'Qual o status dos meus chamados?')}finally{delete process.env.TICKET_SERVICE_DOWN}
 assert.match(result.response.text,/indisponível/);assert.equal((await db.listMyTickets('u-ana')).length,before);const [trace]=await auditForConversation(c.id);assert.equal(trace.run.status,'COMPLETED');assert.ok(trace.events.some(x=>x.kind==='TOOL_RESULT'&&x.outcome==='ERROR'));assert.ok(trace.events.every((x,i)=>x.seq===i+1));
}));

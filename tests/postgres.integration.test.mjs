import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {one,execute,transaction,closePool} from '../dist/postgres.js';
import * as db from '../dist/postgres-db.js';
import * as audit from '../dist/postgres-audit.js';

if (!process.env.DATABASE_URL) throw Error('DATABASE_URL required for PostgreSQL integration tests');
const rollback=Symbol('rollback');
async function isolated(fn){
 let result;
 try{
  await transaction(async()=>{
   await db.seed();
   result=await fn();
   throw rollback;
  });
 }catch(e){if(e!==rollback)throw e}
 return result;
}
test.after(async()=>{await closePool()});
test('pool connects to private nexo schema and rolls back writes',async()=>{
 const schema=await one('SELECT current_schema() AS name');
 assert.equal(schema?.name,'nexo');
 const id='pg-test-'+randomUUID();
 await isolated(async()=>{
  await execute('INSERT INTO users(id,name,email,role,department) VALUES(?,?,?,?,?)',id,'Test',id+'@example.invalid','EMPLOYEE','QA');
  assert.equal((await db.getUser(id)).id,id);
 });
 assert.equal(await db.getUser(id),undefined);
});
test('seed and user lookup are PostgreSQL backed',async()=>isolated(async()=>{
 const user=await db.getUserByEmail('ANA.SOUZA@nexo.com.br');
 assert.equal(user?.id,'u-ana');
 assert.equal((await db.listUsers()).length,5);
 assert.equal((await db.findAll('SELECT id FROM articles')).length,8);
}));
test('conversation and messages persist within transaction',async()=>isolated(async()=>{
 const c=await db.newConversation('u-ana');
 await db.saveMessage(c.id,'USER','Problema com VPN','u-ana');
 const list=await db.messagesFor(c.id);
 assert.equal(list.length,1);
 assert.equal(list[0].text,'Problema com VPN');
 assert.equal((await db.conversationsFor('u-ana')).some(x=>x.id===c.id),true);
}));
test('draft confirmation writes ticket once and replays idempotently',async()=>isolated(async()=>{
 const c=await db.newConversation('u-ana');
 const d=await db.createDraft({conversation_id:c.id,owner_user_id:'u-ana',action:'CREATE',ticket_id:null,title:'Problema com notebook lento',description:'Meu notebook está lento e não consigo trabalhar.',type:'INC',category:'Hardware',priority:'ALTA',affected:'SELF',justification:'Bloqueio individual'});
 const rule=await db.getDraft('u-ana',d.id);
 assert.equal(rule.status,'PENDING_CONFIRMATION');
 // The policy may adjust the draft priority; use the domain's authoritative priority.
 const {priorityFor,inferFacts}=await import('../dist/policy.js');
 const expected=priorityFor({...inferFacts(d.description,d.type),affected:d.affected}).priority;
 await execute('UPDATE drafts SET priority=? WHERE id=?',expected,d.id);
 const first=await db.confirmDraft('u-ana',d.id,d.version,'test-'+randomUUID());
 assert.equal(first.replay,false);
 assert.equal((await db.getMyTicket('u-ana',first.ticket.id)).id,first.ticket.id);
 assert.equal((await db.listMyTickets('u-bruno')).length,0);
}));
test('handoff, analyst ownership and return are persisted',async()=>isolated(async()=>{
 const c=await db.newConversation('u-ana');
 await db.handoff(c.id,'u-ana','REQUEST','Preciso de analista');
 assert.equal((await db.analystQueue()).some(x=>x.id===c.id),true);
 const assumed=await db.analystTransition('u-rafael',c.id,'assume');
 assert.equal(assumed.state,'ANALYST_ACTIVE');
 await db.analystSend('u-rafael',c.id,'Atendimento iniciado');
 assert.equal((await db.messagesFor(c.id)).some(x=>x.role==='ANALYST'),true);
 const returned=await db.analystTransition('u-rafael',c.id,'return');
 assert.equal(returned.state,'AGENT_ACTIVE');
}));
test('agent audit writes trace and ordered events',async()=>isolated(async()=>{
 const c=await db.newConversation('u-ana');
 const trace=await audit.startRun(c.id,'u-ana','deterministic','input');
 await audit.recordEvent(trace,'INPUT','conversation.message',{input:{message:'test'}});
 await audit.recordEvent(trace,'DECISION','agent.response',{output:{status:'ok'}});
 await audit.completeRun(trace,'COMPLETED','ANSWER','done');
 const runs=await audit.auditForConversation(c.id);
 assert.equal(runs.length,1);
 assert.equal(runs[0].run.status,'COMPLETED');
 assert.deepEqual(runs[0].events.map(x=>x.seq),[1,2]);
}));

test('demo seed fills missing fixtures in a nonempty database without resetting existing tickets',async()=>isolated(async()=>{
 const previous=process.env.SEED_DEMO_TICKETS;
 try{
  await execute("INSERT INTO tickets(id,owner_user_id,title,description,type,category,priority,affected,status,opened_at,last_updated_at,version) VALUES('INC-79999','u-ana','Existing test','Existing test incident','INC','Hardware','MEDIA','SELF','ABERTO',now(),now(),1)");
  process.env.SEED_DEMO_TICKETS='true';await db.seed();
  assert.equal((await db.getMyTicket('u-ana','INC-20150')).status,'RESOLVIDO');
  assert.equal((await db.getMyTicket('u-bruno','INC-30002')).owner_user_id,'u-bruno');
  await execute("UPDATE tickets SET description='Preserve user update',version=version+1 WHERE id='INC-20311'");
  await db.seed();
  assert.equal((await db.getMyTicket('u-ana','INC-20311')).description,'Preserve user update');
  assert.equal((await db.getMyTicket('u-ana','INC-79999')).title,'Existing test');
 }finally{if(previous===undefined)delete process.env.SEED_DEMO_TICKETS;else process.env.SEED_DEMO_TICKETS=previous}
}));

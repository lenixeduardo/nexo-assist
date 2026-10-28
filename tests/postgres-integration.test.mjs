import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {one,execute,transaction,closePool} from '../dist/postgres.js';
import {seed,getUser,getUserByEmail,newConversation,getConversation,saveMessage,messagesFor,createDraft,confirmDraft,listMyTickets,claimConversation,releaseConversation,handoff,analystQueue,analystTransition,analystSend} from '../dist/postgres-db.js';
import {startRun,recordEvent,completeRun,auditForConversation} from '../dist/postgres-audit.js';

before(async()=>{assert.ok(process.env.DATABASE_URL,'DATABASE_URL is required for PostgreSQL integration tests');await seed()});
after(async()=>{await closePool()});
test('PostgreSQL connects to isolated nexo schema and loads users',async()=>{
 assert.equal((await one('SELECT current_schema() AS schema')).schema,'nexo');
 assert.equal((await getUserByEmail('ana.souza@nexo.com.br')).id,'u-ana');
 assert.equal((await getUser('u-rafael')).role,'ANALYST');
});
test('PostgreSQL transaction rolls back failed writes',async()=>{
 const id='rollback-'+randomUUID();
 await assert.rejects(transaction(async()=>{await execute('INSERT INTO users(id,name,email,role,department) VALUES(?,?,?,?,?)',id,'Rollback',id+'@example.invalid','EMPLOYEE','QA');throw new Error('rollback expected')}),/rollback expected/);
 assert.equal(await one('SELECT id FROM users WHERE id=?',id),undefined);
});
test('Conversation, messages and analyst handoff persist',async()=>{
 const c=await newConversation('u-ana');
 await saveMessage(c.id,'USER','Solicito analista','u-ana');
 assert.equal((await messagesFor(c.id))[0].text,'Solicito analista');
 await handoff(c.id,'u-ana','Atendimento humano','Resumo da solicitação');
 assert.equal((await getConversation(c.id)).state,'WAITING_ANALYST');
 assert.ok((await analystQueue()).some(x=>x.id===c.id));
 await analystTransition('u-rafael',c.id,'assume');
 await analystSend('u-rafael',c.id,'Atendimento iniciado');
 assert.equal((await getConversation(c.id)).assigned_analyst_id,'u-rafael');
 assert.ok((await messagesFor(c.id)).some(x=>x.role==='ANALYST'));
 await analystTransition('u-rafael',c.id,'return');
 assert.equal((await getConversation(c.id)).state,'AGENT_ACTIVE');
});
test('Concurrent conversation claims reject duplicate and release cleanly',async()=>{
 const c=await newConversation('u-ana');
 const token=await claimConversation(c.id,'u-ana');
 await assert.rejects(claimConversation(c.id,'u-ana'),e=>e.code==='CONVERSATION_BUSY');
 await releaseConversation(c.id,token);
 const retry=await claimConversation(c.id,'u-ana');
 await releaseConversation(c.id,retry);
});
test('Draft confirmation is idempotent, creates one ticket, scopes ownership',async()=>{
 const c=await newConversation('u-ana');
 const draft=await createDraft({conversation_id:c.id,owner_user_id:'u-ana',action:'CREATE',ticket_id:null,title:'Impressora teste '+randomUUID().slice(0,8),description:'Impressora travando apenas comigo, sem alternativa, preciso de suporte',type:'INC',category:'Hardware',priority:'ALTA',affected:'SELF',justification:'Teste'});
 // Validation intentionally uses the server-side policy, never trusts a caller-supplied priority.
 const {inferFacts,priorityFor}=await import('../dist/policy.js');
 const expected=priorityFor({...inferFacts(draft.description,draft.type),affected:'SELF'});
 await execute('UPDATE drafts SET priority=?,justification=? WHERE id=?',expected.priority,expected.reason,draft.id);
 const first=await confirmDraft('u-ana',draft.id,draft.version,'test-'+randomUUID());
 assert.equal(first.replay,false);
 const keyRow=await one('SELECT key FROM idempotency_keys WHERE owner_user_id=? AND result_json LIKE ?', 'u-ana','%'+first.ticket.id+'%');
 assert.ok(keyRow);
 const key=keyRow.key.split(':').slice(1).join(':');
 const replay=await confirmDraft('u-ana',draft.id,draft.version,key);
 assert.equal(replay.replay,true);
 assert.equal(replay.ticket.id,first.ticket.id);
 assert.equal((await listMyTickets('u-ana')).filter(x=>x.id===first.ticket.id).length,1);
 await assert.rejects(confirmDraft('u-bruno',draft.id,draft.version,'other-key'),e=>e.code==='NOT_FOUND');
});
test('Agent audit is persisted with sequential events and redaction',async()=>{
 const c=await newConversation('u-ana');
 const traceId=await startRun(c.id,'u-ana','rules','user input');
 await recordEvent(traceId,'TOOL_CALL','test',{input:{authorization:'Bearer secret',text:'Bearer example'}});
 await recordEvent(traceId,'TOOL_RESULT','test',{output:{ok:true}});
 await completeRun(traceId,'COMPLETED','ANSWER','reply');
 const [entry]=await auditForConversation(c.id);
 assert.equal(entry.run.status,'COMPLETED');
 assert.deepEqual(entry.events.map(e=>e.seq),[1,2]);
 assert.equal(entry.events[0].input.authorization,'[redacted]');
 assert.equal(entry.events[1].output.ok,true);
});

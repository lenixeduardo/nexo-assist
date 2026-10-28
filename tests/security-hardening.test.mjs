import test from 'node:test';
import assert from 'node:assert/strict';
import {rmSync} from 'node:fs';
const file=`/tmp/nexo-security-${process.pid}.sqlite`;
process.env.DB_PATH=file;
const db=await import('../dist/db.js');
const {DomainError}=await import('../dist/types.js');
test('analyst queue never exposes conversations being handled by agent',()=>{
 const c=db.newConversation('u-ana');
 assert.ok(!db.analystQueue().some(x=>x.id===c.id));
 assert.throws(()=>db.ensureAnalystAccess(c.id),e=>e.code==='UNAUTHORIZED');
 db.handoff(c.id,'u-ana','USER_REQUEST','Consultoria solicitada');
 assert.ok(db.analystQueue().some(x=>x.id===c.id));
 assert.equal(db.ensureAnalystAccess(c.id).state,'WAITING_ANALYST');
});
test('SQLite claim prevents simultaneous submissions and releases after error',()=>{
 const c=db.newConversation('u-ana');
 const tok=db.claimConversation(c.id,'u-ana');
 assert.throws(()=>db.claimConversation(c.id,'u-ana'),e=>e.code==='CONVERSATION_BUSY'&&e.status===409);
 assert.throws(()=>db.claimConversation(c.id,'u-bruno'),e=>e.code==='NOT_FOUND');
 db.releaseConversation(c.id,tok);
 const tok2=db.claimConversation(c.id,'u-ana');
 assert.notEqual(tok,tok2);db.releaseConversation(c.id,tok2);
});
test('idempotency keys are scoped to a specific draft and replay signals true',()=>{
 const c1=db.newConversation('u-ana'),c2=db.newConversation('u-ana');
 const base={owner_user_id:'u-ana',action:'CREATE',ticket_id:null,type:'INC',category:'Hardware',priority:'MEDIA',affected:'SELF',justification:'teste'};
 const first=db.createDraft({...base,conversation_id:c1.id,title:'Impressora emperrada no setor A',description:'Impressora emperrada no setor A, eu tenho alternativa'});
 const second=db.createDraft({...base,conversation_id:c2.id,title:'Webcam com ruído na reunião',description:'Webcam com ruído na reunião, eu tenho alternativa'});
 const r1=db.confirmDraft('u-ana',first.id,1,'same-key');
 assert.equal(r1.replay,false);
 const replay=db.confirmDraft('u-ana',first.id,1,'same-key');
 assert.equal(replay.replay,true);assert.equal(replay.ticket.id,r1.ticket.id);
 const r2=db.confirmDraft('u-ana',second.id,1,'same-key');
 assert.notEqual(r1.ticket.id,r2.ticket.id);
});
test('read outage never causes ticket mutation; retry after restored availability',()=>{
 const c=db.newConversation('u-ana');
 const before=db.findOne('SELECT count(*) n FROM tickets').n;
 process.env.TICKET_SERVICE_DOWN='true';
 try{assert.throws(()=>db.listMyTickets('u-ana'),e=>e.code==='TICKET_SERVICE_UNAVAILABLE');}
 finally{delete process.env.TICKET_SERVICE_DOWN}
 assert.equal(db.findOne('SELECT count(*) n FROM tickets').n,before);
 assert.ok(db.listMyTickets('u-ana').length>0);
});
test('analyst replies require current ownership, even after handoff',()=>{
 const c=db.newConversation('u-ana');
 assert.throws(()=>db.analystSend('u-rafael',c.id,'x'),e=>e.code==='UNAUTHORIZED');
 db.handoff(c.id,'u-ana','USER_REQUEST','teste');
 db.analystTransition('u-rafael',c.id,'assume');
 assert.deepEqual(db.analystSend('u-rafael',c.id,'Atendimento em andamento'),{ok:true});
 db.analystTransition('u-rafael',c.id,'return');
 assert.throws(()=>db.analystSend('u-rafael',c.id,'Mensagem indevida'),e=>e.code==='UNAUTHORIZED');
});
test.after(()=>{db.db.close();for(const ext of ['','-shm','-wal'])try{rmSync(file+ext)}catch{}});

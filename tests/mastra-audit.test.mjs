import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {rmSync} from 'node:fs';
const file=`/tmp/nexo-mastra-audit-${process.pid}.sqlite`;
process.env.DB_PATH=file;
const {mastraClassify}=await import('../dist/mastra.js');
const {startRun,recordEvent,completeRun,auditForConversation}=await import('../dist/audit.js');
const {newConversation,findOne}=await import('../dist/db.js');
const previous={use:process.env.USE_MASTRA,key:process.env.OPENAI_API_KEY};
process.env.USE_MASTRA='true';

function runtime(intent,toolName,toolArgs,reason='Consulta executada em ferramenta real'){
 const z={string:()=>({min(){return this},max(){return this},optional(){return this}}),boolean:()=>({optional(){return this}}),object:()=>({}),array:()=>({})};
 return {z,createTool:config=>config,Agent:class{
  constructor(spec){this.spec=spec}
  async generate(){if(toolName){for(const name of Array.isArray(toolName)?toolName:[toolName])await this.spec.tools[name].execute(toolArgs?.[name]??toolArgs);}
   return {text:JSON.stringify({intent,confidence:'HIGH',reason}),usage:{totalTokens:42},finishReason:'stop'};}
 }};
}
function ctx(userId='u-ana'){
 const c=newConversation(userId);return {c,traceId:startRun(c.id,userId,'mastra','Audit input')};
}
test('Mastra SDK-shaped tools execute actual scoped database queries and persist inputs/outputs',async()=>{
 const {c,traceId}=ctx();const r=await mastraClassify('u-ana','Qual o status dos meus chamados?',[],c.id,traceId,runtime('TICKET_STATUS','listMyTicketsTool',{}));
 assert.equal(r.intent,'TICKET_STATUS');assert.equal(r.toolCalls,1);assert.equal(r.toolActions[0].name,'mastra.listMyTickets');
 assert.ok(r.toolActions[0].resourceIds.includes('INC-20311'));
 completeRun(traceId,'COMPLETED','ANSWER','resposta');
 const [data]=auditForConversation(c.id);assert.equal(data.run.status,'COMPLETED');
 assert.equal(data.run.model,'openai/gpt-4.1-mini');
 const calls=data.events.filter(e=>e.kind==='TOOL_CALL');const outputs=data.events.filter(e=>e.kind==='TOOL_RESULT');
 assert.equal(calls.length,1);assert.equal(outputs.length,1);assert.ok(outputs[0].output.tickets.every(t=>t.id!=='INC-30002'));
 assert.equal(data.events.at(-1).kind,'MODEL_RESULT');assert.ok(data.events.some(e=>e.name==='mastra.agent.raw-response'));
 assert.ok(data.events.every((event,i)=>event.seq===i+1));
});
test('Mastra knowledge lookup returns real indexed articles and audit evidence',async()=>{
 const {c,traceId}=ctx();const r=await mastraClassify('u-ana','Como resolver o erro VPN 809?',[],c.id,traceId,runtime('KNOWLEDGE_QUESTION','searchKnowledge',{query:'VPN erro 809'}));
 assert.equal(r.intent,'KNOWLEDGE_QUESTION');assert.ok(r.toolActions[0].resourceIds.includes('KB-001'));
 const events=auditForConversation(c.id)[0].events;assert.equal(events.find(x=>x.kind==='TOOL_CALL').input.query,'VPN erro 809');
});
test('Mastra duplicate search is restricted to the authenticated employee',async()=>{
 const a=ctx('u-ana'),b=ctx('u-bruno');
 const ra=await mastraClassify('u-ana','Solicitar monitor',[],a.c.id,a.traceId,runtime('UNCLEAR','findDuplicatesTool',{description:'Segundo monitor para home office'}));
 const rb=await mastraClassify('u-bruno','Solicitar monitor',[],b.c.id,b.traceId,runtime('UNCLEAR','findDuplicatesTool',{description:'Segundo monitor para home office'}));
 assert.equal(ra.toolCalls,1);assert.equal(rb.toolCalls,1);
 const aMatches=auditForConversation(a.c.id)[0].events.find(e=>e.name==='mastra.findPotentialDuplicates'&&e.kind==='TOOL_RESULT').output.matches;
 const bMatches=auditForConversation(b.c.id)[0].events.find(e=>e.name==='mastra.findPotentialDuplicates'&&e.kind==='TOOL_RESULT').output.matches;
 assert.ok(aMatches.some(x=>x.id==='REQ-10442'));assert.equal(bMatches.length,0);
});
test('Mastra create intent uses BOTH duplicate and policy tools before accepting result',async()=>{
 const {c,traceId}=ctx();const r=await mastraClassify('u-ana','Impressora travando só eu com alternativa',[],c.id,traceId,runtime('TICKET_CREATE',['findDuplicatesTool','assessPolicyTool'],{findDuplicatesTool:{description:'Impressora travando só eu com alternativa'},assessPolicyTool:{description:'Impressora travando só eu com alternativa'}}));
 assert.equal(r.intent,'TICKET_CREATE');assert.equal(r.toolCalls,2);
 assert.deepEqual(r.toolActions.map(a=>a.name),['mastra.findPotentialDuplicates','mastra.assessPolicy']);
 assert.ok(auditForConversation(c.id)[0].events.some(e=>e.name==='mastra.assessPolicy'&&e.output?.priority==='MEDIA'));
});
test('Mastra refuses invented status classification without real tool usage and records error',async()=>{
 const {c,traceId}=ctx();await assert.rejects(mastraClassify('u-ana','status',[],c.id,traceId,runtime('TICKET_STATUS',null,{})),/MASTRA_MISSING_REQUIRED_TOOL/);
 assert.equal(auditForConversation(c.id)[0].events.find(e=>e.kind==='ERROR').outcome,'ERROR');
});
test('Mastra rejects malformed confidence and missing reason',async()=>{
 const {c,traceId}=ctx();await assert.rejects(mastraClassify('u-ana','ajuda',[],c.id,traceId,runtime('UNCLEAR',null,{},'')),/MASTRA_INVALID_OUTPUT/);
});
test('real read tool failure produces an auditable error and does not masquerade as success',async()=>{
 const {c,traceId}=ctx();process.env.TICKET_SERVICE_DOWN='true';
 try{await assert.rejects(mastraClassify('u-ana','status',[],c.id,traceId,runtime('TICKET_STATUS','listMyTicketsTool',{})),/MASTRA_RUNTIME_ERROR/)}
 finally{delete process.env.TICKET_SERVICE_DOWN}
 const entry=auditForConversation(c.id)[0];assert.equal(entry.events.find(x=>x.kind==='TOOL_RESULT').outcome,'ERROR');
 assert.ok(entry.events.some(x=>x.kind==='ERROR'));
});
test('Audit redacts credentials and enforces payload bounds',()=>{
 const {c,traceId}=ctx();recordEvent(traceId,'TOOL_CALL','security.check',{input:{authorization:'Bearer secret',apiKey:'sk-topsecret123456',text:'Bearer abcdef'}});
 const event=auditForConversation(c.id)[0].events.at(-1);assert.equal(event.input.authorization,'[redacted]');assert.equal(event.input.apiKey,'[redacted]');assert.equal(event.input.text,'Bearer [redacted]');
});
test.after(()=>{
 if(previous.use===undefined)delete process.env.USE_MASTRA;else process.env.USE_MASTRA=previous.use;
 if(previous.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous.key;
 for(const s of ['', '-wal','-shm'])try{rmSync(file+s)}catch{}
});

/** Real PostgreSQL + Mastra + provider smoke; never injects a runtime. */
import {closePool} from '../dist/postgres.js';
import {newConversation,seed} from '../dist/postgres-db.js';
import {mastraClassify} from '../dist/mastra.js';
import {startRun,completeRun,auditForConversation} from '../dist/postgres-audit.js';
if(process.env.USE_MASTRA!=='true')throw Error('Set USE_MASTRA=true and configure provider authentication.');
const cases=[
 {message:'Qual o status dos meus chamados?',intent:'TICKET_STATUS',required:['mastra.listMyTickets','mastra.getMyTicket']},
 {message:'Como resolver o erro 809 da VPN?',intent:'KNOWLEDGE_QUESTION',required:['mastra.searchKnowledge']},
 {message:'Minha impressora está travando, só eu, e tenho alternativa para imprimir.',intent:'TICKET_CREATE',required:['mastra.findPotentialDuplicates','mastra.assessPolicy']},
];
let failed=false;
try{
 await seed();
 for(const c of cases){
  const conversation=await newConversation('u-ana');const traceId=await startRun(conversation.id,'u-ana','mastra-live',c.message);
  try{
   const result=await mastraClassify('u-ana',c.message,[],conversation.id,traceId);
   const actions=result?.toolActions.filter(x=>x.outcome==='OK').map(x=>x.name)||[];
   const toolsOk=c.intent==='TICKET_CREATE'?c.required.every(x=>actions.includes(x)):c.required.some(x=>actions.includes(x));
   const correct=result?.intent===c.intent&&toolsOk;
   await completeRun(traceId,correct?'COMPLETED':'FAILED',correct?'ANSWER':undefined,result,correct?undefined:'LIVE_SMOKE_ASSERTION_FAILED');
   const [trace]=await auditForConversation(conversation.id);
   const audited=!!trace?.events.some(x=>x.kind==='MODEL_CALL')&&!!trace?.events.some(x=>x.kind==='MODEL_RESULT'&&x.output?.usage);
   console.log(JSON.stringify({intent:result?.intent,model:result?.model,toolActions:actions,traceId,pass:correct&&audited}));if(!correct||!audited)failed=true;
  }catch{failed=true;await completeRun(traceId,'FAILED',undefined,undefined,'LIVE_SMOKE_ERROR');console.error(JSON.stringify({traceId,error:'LIVE_SMOKE_ERROR; inspect redacted audit events'}))}
 }
}finally{await closePool()}
process.exitCode=failed?1:0;

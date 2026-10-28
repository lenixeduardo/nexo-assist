/** Real Mastra+provider smoke. No fake runtime is injected.
 * Execute only after npm install, with USE_MASTRA=true and OPENAI_API_KEY set.
 */
import {randomUUID} from 'node:crypto';
if(process.env.USE_MASTRA!=='true'||!process.env.OPENAI_API_KEY){
 console.error('Configure USE_MASTRA=true e OPENAI_API_KEY antes do smoke live.');process.exit(2);
}
const {newConversation}=await import('../dist/db.js');
const {mastraClassify}=await import('../dist/mastra.js');
const {startRun,completeRun,auditForConversation}=await import('../dist/audit.js');
const cases=[
 {message:'Qual o status dos meus chamados?',intent:'TICKET_STATUS',required:['mastra.listMyTickets','mastra.getMyTicket']},
 {message:'Como resolver o erro 809 da VPN?',intent:'KNOWLEDGE_QUESTION',required:['mastra.searchKnowledge']},
 {message:'Minha impressora está travando, só eu, e tenho alternativa para imprimir.',intent:'TICKET_CREATE',required:['mastra.findPotentialDuplicates','mastra.assessPolicy']},
];
let failed=false;
for(const c of cases){
 const conversation=newConversation('u-ana');const traceId=startRun(conversation.id,'u-ana','mastra-live',c.message);
 try{
  const result=await mastraClassify('u-ana',c.message,[],conversation.id,traceId);
  const actions=result?.toolActions.filter(x=>x.outcome==='OK').map(x=>x.name)||[];
  const toolsOk=c.intent==='TICKET_CREATE'?c.required.every(x=>actions.includes(x)):c.required.some(x=>actions.includes(x));
  const correct=result?.intent===c.intent&&toolsOk;
  completeRun(traceId,correct?'COMPLETED':'FAILED','ANSWER',result,'LIVE_SMOKE_ASSERTION_FAILED');
  console.log(JSON.stringify({test:c.message,intent:result?.intent,model:result?.model,toolActions:actions,traceId,pass:correct}));
  if(!correct)failed=true;
 }catch(e){failed=true;completeRun(traceId,'FAILED',undefined,undefined,'LIVE_SMOKE_ERROR');console.error(JSON.stringify({case:c.message,traceId,error:String(e)}));}
 const [trace]=auditForConversation(conversation.id);if(!trace||!trace.events.some(x=>x.kind==='MODEL_CALL'))failed=true;
}
process.exitCode=failed?1:0;

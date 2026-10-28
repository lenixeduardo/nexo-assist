/** Persistent PostgreSQL audit trail. All writes are awaited. */
import {createHash,randomUUID} from 'node:crypto';
import {execute,query,one,transaction} from './postgres.js';
export type RunStatus='RUNNING'|'COMPLETED'|'FAILED'|'STALE';
export type AuditEventKind='INPUT'|'MODEL_CALL'|'MODEL_RESULT'|'TOOL_CALL'|'TOOL_RESULT'|'POLICY'|'DECISION'|'ERROR';
export const sha=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const sensitive=/password|senha|secret|authorization|cookie|api.?key|token|credential|chave|session/i;
function clean(value:unknown,depth=0):unknown{
 if(depth>5)return '[depth-limit]';
 if(typeof value==='string')return value.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g,'[redacted-key]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').slice(0,1500);
 if(typeof value==='number'||typeof value==='boolean'||value===null)return value;
 if(Array.isArray(value))return value.slice(0,15).map(v=>clean(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).slice(0,30).map(([k,v])=>[k,sensitive.test(k)?'[redacted]':clean(v,depth+1)]));
 return undefined;
}
export const safeJson=(v:unknown):string=>JSON.stringify(clean(v)).slice(0,12000);
export async function startRun(conversationId:string,userId:string,mode:string,input:unknown,traceId=randomUUID()){
 await execute('INSERT INTO agent_runs(trace_id,conversation_id,user_id,mode,status,started_at,input_digest) VALUES(?,?,?,?,?,?,?)',traceId,conversationId,userId,mode,'RUNNING',new Date().toISOString(),sha(input));
 return traceId;
}
export const setRunModel=(traceId:string,model:string)=>execute('UPDATE agent_runs SET model=? WHERE trace_id=?',model,traceId);
export async function recordEvent(traceId:string,kind:AuditEventKind,name:string,details:{input?:unknown;output?:unknown;durationMs?:number;outcome?:string;resourceIds?:string[]}={}){
 const input=details.input===undefined?null:safeJson(details.input),output=details.output===undefined?null:safeJson(details.output);
 return transaction(async()=>{
  await execute('SELECT pg_advisory_xact_lock(hashtext(?))','nexo-audit-'+traceId);
  await execute(`INSERT INTO agent_audit_events(id,trace_id,seq,kind,name,started_at,duration_ms,outcome,input_json,output_json,input_digest,output_digest,resource_ids_json)
 VALUES(?,?,(SELECT COALESCE(MAX(seq),0)+1 FROM agent_audit_events WHERE trace_id=?),?,?,?,?,?,?,?,?,?,?)`,
  randomUUID(),traceId,traceId,kind,name,new Date().toISOString(),details.durationMs??null,details.outcome??'OK',input,output,input?sha(input):null,output?sha(output):null,details.resourceIds?JSON.stringify(details.resourceIds.slice(0,25)):null);
 });
}
export const completeRun=(traceId:string,status:RunStatus,decision?:string,response?:unknown,errorCode?:string)=>execute('UPDATE agent_runs SET status=?,decision=?,finished_at=?,response_digest=?,error_code=? WHERE trace_id=?',status,decision??null,new Date().toISOString(),response===undefined?null:sha(response),errorCode??null,traceId);
export async function auditForConversation(conversationId:string){
 const runs=await query<{trace_id:string;conversation_id:string;user_id:string;mode:string;model:string|null;status:RunStatus;decision:string|null;started_at:string;finished_at:string|null;error_code:string|null;input_digest:string;response_digest:string|null}>('SELECT * FROM agent_runs WHERE conversation_id=? ORDER BY started_at,trace_id',conversationId);
 return Promise.all(runs.map(async run=>({run,events:(await query<{seq:number;kind:string;name:string;started_at:string;duration_ms:number|null;outcome:string;input_json:string|null;output_json:string|null;input_digest:string|null;output_digest:string|null;resource_ids_json:string|null}>('SELECT seq,kind,name,started_at,duration_ms,outcome,input_json,output_json,input_digest,output_digest,resource_ids_json FROM agent_audit_events WHERE trace_id=? ORDER BY seq',run.trace_id)).map(ev=>({...ev,input:ev.input_json?JSON.parse(ev.input_json):null,output:ev.output_json?JSON.parse(ev.output_json):null,resources:ev.resource_ids_json?JSON.parse(ev.resource_ids_json):[],input_json:undefined,output_json:undefined,resource_ids_json:undefined}))})));
}
export const auditRunExists=async(traceId:string)=>!!(await one('SELECT trace_id FROM agent_runs WHERE trace_id=?',traceId));

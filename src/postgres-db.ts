/** PostgreSQL implementation of Nexo Assist domain persistence. */
import {randomUUID} from 'node:crypto';
import {query,one,execute,transaction} from './postgres.js';
import type {Conversation,Draft,Ticket,Trace,User} from './types.js';
import {DomainError} from './types.js';
import {canReopen,sameProblem,inferFacts,priorityFor} from './policy.js';
const iso=()=>new Date().toISOString();
const dt=(v:unknown):string|null=>v==null?null:v instanceof Date?v.toISOString():String(v);
function dates<T>(v:T):T {\n const row=v as Record<string,unknown>;
 for(const key of ['opened_at','last_updated_at','resolved_at','created_at','updated_at']){
  if(key in row && row[key]!=null)row[key]=dt(row[key]);
 }
 return v;
}
export const findOne=async <T>(sql:string,...args:(string|number|null)[]):Promise<T|undefined>=>{
 const row=await one<T>(sql,...args);return row?dates(row):undefined;
};
export const findAll=async <T>(sql:string,...args:(string|number|null)[]):Promise<T[]>=>{
 return (await query<T>(sql,...args)).map(dates);
};
export {transaction};
export async function seed(){
 const users:User[]=[
 {id:'u-ana',name:'Ana Souza',email:'ana.souza@nexo.com.br',role:'EMPLOYEE',department:'Financeiro'},
 {id:'u-bruno',name:'Bruno Tavares',email:'bruno.tavares@nexo.com.br',role:'EMPLOYEE',department:'Operações'},
 {id:'u-carla',name:'Carla Mendes',email:'carla.mendes@nexo.com.br',role:'EMPLOYEE',department:'Comercial'},
 {id:'u-diego',name:'Diego Ramos',email:'diego.ramos@nexo.com.br',role:'EMPLOYEE',department:'Tecnologia'},
 {id:'u-rafael',name:'Rafael Lima',email:'rafael.lima@nexo.com.br',role:'ANALYST',department:'Suporte N2'}];
 for(const u of users)await execute('INSERT INTO users(id,name,email,role,department) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING',u.id,u.name,u.email,u.role,u.department);
 const articles:[string,string,string,string,string,string][]=[
 ['KB-001','VPN erro 809','No Windows 10, reinstale o cliente VPN pelo portal de softwares e reinicie o computador. No Windows 11, abra um chamado; estas instruções NÃO se aplicam.','Rede e VPN','Windows 10;Windows 11','windows-version-required'],
 ['KB-002','Horário de atendimento','O service desk atende de segunda a sexta-feira, das 8h às 18h. Chamados críticos possuem plantão 24 horas.','Outros','Todas','none'],
 ['KB-003','Segunda etapa MFA','Verifique se o relógio do celular está automático e abra novamente o aplicativo autenticador. Nunca compartilhe códigos de autenticação.','Acesso','Todas','none'],
 ['KB-004','Outlook não sincroniza','Verifique a conexão e reinicie o Outlook. Caso a conta corporativa indique bloqueio, abra chamado ao suporte.','E-mail','Windows;macOS','none'],
 ['KB-005','Impressora não aparece','Verifique a conexão à rede corporativa e procure a impressora no catálogo de dispositivos. Se não estiver disponível, solicite atendimento.','Hardware','Windows','none'],
 ['KB-006','Wi-Fi corporativo','Confirme que está selecionada a rede corporativa e que a conectividade geral funciona. Não compartilhe senhas ou credenciais no chat.','Rede e VPN','Todas','none'],
 ['KB-007','Notebook com lentidão','Feche aplicativos não utilizados e reinicie o computador. Se o problema persistir após atualização, registre o incidente.','Hardware','Windows','none'],
 ['KB-008','Instalação de software','Solicite software pelo portal corporativo; instalações não disponíveis no catálogo exigem requisição de TI.','Software','Todas','none']];
 for(const a of articles)await execute('INSERT INTO articles(id,title,body,category,platforms,conditions,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',...a,iso());
 // Demo tickets are opt-in to avoid inserting fake incidents into a production database.
 if(process.env.SEED_DEMO_TICKETS==='true'){
  const count=await one<{n:number}>('SELECT count(*)::int n FROM tickets');
  if(!count?.n){
   const days=(d:number)=>new Date(Date.now()-d*86400000).toISOString();
   const rows:[string,string,string,string,string,string,string,string,string,string,string,string|null][]=[
    ['INC-20311','u-ana','Notebook lento após atualização do Windows','Lentidão após atualização; reiniciar não resolveu.','INC','Hardware','MEDIA','SELF','AGUARDANDO_ANALISTA',days(8),days(6),null],
    ['INC-20298','u-ana','Acesso à pasta Financeiro no SharePoint','Acesso indisponível para relatórios.','INC','Acesso','MEDIA','SELF','EM_ANDAMENTO',days(5),days(3),null],
    ['REQ-10442','u-ana','Segundo monitor para home office','Solicitação de monitor secundário para trabalho remoto.','REQ','Hardware','BAIXA','SELF','APROVADO',days(8),days(7),null],
    ['INC-20150','u-ana','Senha do SAP bloqueada','Conta do SAP bloqueada após múltiplas tentativas.','INC','Acesso','MEDIA','SELF','RESOLVIDO',days(6),days(4),days(4)],
    ['INC-19010','u-ana','Outlook travando','Outlook travava ao abrir anexos.','INC','E-mail','MEDIA','SELF','RESOLVIDO',days(19),days(15),days(15)],
    ['INC-30002','u-bruno','VPN sem conectar — erro 809','VPN de Bruno falha no Windows 11.','INC','Rede e VPN','ALTA','SELF','ABERTO',days(2),days(2),null],
    ['REQ-30003','u-carla','Acesso ao SAP','Necessário acesso ao SAP para o Comercial.','REQ','Acesso','ALTA','SELF','ABERTO',days(1),days(1),null]];
   for(const x of rows)await execute('INSERT INTO tickets(id,owner_user_id,title,description,type,category,priority,affected,status,opened_at,last_updated_at,resolved_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO NOTHING',...x);
  }
 }
}
export const getUser=(id:string)=>findOne<User>('SELECT * FROM users WHERE id=?',id);
export const getUserByEmail=(email:string)=>findOne<User>('SELECT * FROM users WHERE lower(email)=lower(?)',email);
export const listUsers=()=>findAll<User>('SELECT * FROM users ORDER BY role,name');
let outageUntil=0;
export function checkService(){if(process.env.TICKET_SERVICE_DOWN==='true'||Date.now()<outageUntil)throw new DomainError('TICKET_SERVICE_UNAVAILABLE','Serviço de chamados temporariamente indisponível',503)}
export function setOutage(ms:number){outageUntil=Date.now()+Math.min(Math.max(ms,0),30000)}
export async function listMyTickets(userId:string){checkService();return findAll<Ticket>('SELECT * FROM tickets WHERE owner_user_id=? ORDER BY last_updated_at DESC',userId)}
export async function getMyTicket(userId:string,ticketId:string){checkService();const t=await findOne<Ticket>('SELECT * FROM tickets WHERE owner_user_id=? AND id=?',userId,ticketId.toUpperCase());if(!t)throw new DomainError('NOT_FOUND','Chamado não encontrado',404);return t}
export async function findDuplicate(userId:string,title:string,category:string){return (await listMyTickets(userId)).filter(t=>t.category===category&&t.status!=='ENCERRADO'&&(t.status!=='RESOLVIDO'||canReopen(t))&&sameProblem(title,t.title+' '+t.description))}
export async function newConversation(userId:string){const id=randomUUID(),now=iso();await execute("INSERT INTO conversations(id,user_id,state,session_count,version,created_at,updated_at) VALUES(?,?,'AGENT_ACTIVE',0,1,?,?)",id,userId,now,now);return getConversation(id,userId)}
export async function getConversation(id:string,userId?:string){const c=await findOne<Conversation>('SELECT * FROM conversations WHERE id=?',id);if(!c||(userId&&c.user_id!==userId))throw new DomainError('NOT_FOUND','Conversa não encontrada',404);return c}
export const conversationsFor=(userId:string)=>findAll<Conversation>('SELECT * FROM conversations WHERE user_id=? ORDER BY updated_at DESC',userId);
export const messagesFor=(id:string)=>findAll<{id:string;conversation_id:string;sender_id:string|null;role:string;text:string;ui_json:string|null;trace_json:string|null;created_at:string}>('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC,id ASC',id);
export async function saveMessage(conversationId:string,role:string,text:string,senderId?:string,trace?:Trace,ui?:unknown){const id=randomUUID();await execute('INSERT INTO messages(id,conversation_id,sender_id,role,text,ui_json,trace_json,created_at) VALUES(?,?,?,?,?,?,?,?)',id,conversationId,senderId??null,role,text,ui?JSON.stringify(ui):null,trace?JSON.stringify(trace):null,iso());await execute('UPDATE conversations SET updated_at=? WHERE id=?',iso(),conversationId);return id}
export const currentDraft=(id:string)=>findOne<Draft>("SELECT * FROM drafts WHERE conversation_id=? AND status='PENDING_CONFIRMATION' ORDER BY id DESC LIMIT 1",id);
export async function createDraft(input:Omit<Draft,'id'|'status'|'version'>){return transaction(async()=>{await execute("UPDATE drafts SET status='CANCELLED' WHERE conversation_id=? AND status='PENDING_CONFIRMATION'",input.conversation_id);const id='D-'+randomUUID().slice(0,8).toUpperCase();await execute("INSERT INTO drafts(id,conversation_id,owner_user_id,action,ticket_id,title,description,type,category,priority,affected,justification,status,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'PENDING_CONFIRMATION',1)",id,input.conversation_id,input.owner_user_id,input.action,input.ticket_id,input.title,input.description,input.type,input.category,input.priority,input.affected,input.justification);return (await findOne<Draft>('SELECT * FROM drafts WHERE id=?',id))!})}
export async function getDraft(userId:string,id:string){const d=await findOne<Draft>('SELECT * FROM drafts WHERE id=? AND owner_user_id=?',id,userId);if(!d)throw new DomainError('NOT_FOUND','Rascunho não encontrado',404);return d}
export async function cancelDraft(userId:string,id:string){return transaction(async()=>{const d=await getDraft(userId,id);if(d.status!=='PENDING_CONFIRMATION')throw new DomainError('INVALID_TRANSITION','Rascunho não está pendente');await execute("UPDATE drafts SET status='CANCELLED',version=version+1 WHERE id=?",id);return {ok:true}})}
export async function reviseDraft(userId:string,id:string,changes:Partial<Pick<Draft,'title'|'description'|'affected'>>,version:number){return transaction(async()=>{const d=await getDraft(userId,id);if(d.status!=='PENDING_CONFIRMATION'||d.version!==version)throw new DomainError('DRAFT_STALE','Rascunho desatualizado',409);const title=changes.title?.trim()||d.title,description=changes.description?.trim()||d.description,affected=changes.affected||d.affected;if(title.length>180||description.length>3000||title.length<3||description.length<5)throw new DomainError('INVALID_INPUT','Título ou descrição fora dos limites');if(!['SELF','TEAM','COMPANY','UNKNOWN'].includes(affected))throw new DomainError('INVALID_INPUT','Grupo de afetados inválido');const rule=priorityFor({...inferFacts(description,d.type),affected:affected as 'SELF'|'TEAM'|'COMPANY'|'UNKNOWN'});await execute('UPDATE drafts SET title=?,description=?,affected=?,priority=?,justification=?,version=version+1 WHERE id=?',title,description,affected,d.action==='CREATE'?rule.priority:d.priority,d.action==='CREATE'?rule.reason:d.justification,id);return getDraft(userId,id)})}
export async function confirmDraft(userId:string,id:string,version:number,idempotencyKey:string){
 if(!idempotencyKey||idempotencyKey.length>160)throw new DomainError('INVALID_INPUT','Chave de idempotência inválida');
 return transaction(async()=>{
  const scopedKey=`${id}:${idempotencyKey}`;
  // Serialize duplicate confirmations across serverless instances.
  await execute('SELECT pg_advisory_xact_lock(hashtext(?))',scopedKey);
  const replay=await findOne<{result_json:string}>('SELECT result_json FROM idempotency_keys WHERE key=? AND owner_user_id=?',scopedKey,userId);
  if(replay)return {...JSON.parse(replay.result_json) as {ticket:Ticket;replay:boolean},replay:true};
  checkService();
  const draft=await getDraft(userId,id);
  if(draft.status!=='PENDING_CONFIRMATION'||draft.version!==version)throw new DomainError('DRAFT_STALE','Rascunho já alterado ou confirmado',409);
  const c=await getConversation(draft.conversation_id,userId);if(c.state!=='AGENT_ACTIVE')throw new DomainError('CONVERSATION_LOCKED','Esta conversa está com o analista',409);
  if(draft.action==='CREATE'){
   const expected=priorityFor({...inferFacts(draft.description,draft.type),affected:draft.affected as 'SELF'|'TEAM'|'COMPANY'|'UNKNOWN'});
   if(expected.priority!==draft.priority)throw new DomainError('DRAFT_STALE','A prioridade do rascunho não corresponde às regras atuais',409);
  }
  let ticket:Ticket;const now=iso();
  if(draft.action==='CREATE'){
   const duplicates=await findDuplicate(userId,draft.title+' '+draft.description,draft.category);
   const open=duplicates.find(t=>t.status!=='RESOLVIDO');if(open)throw new DomainError('POTENTIAL_DUPLICATE',`Já existe um chamado semelhante: ${open.id}. Atualize o existente.`,409);
   await execute('SELECT pg_advisory_xact_lock(hashtext(?))','nexo-ticket-sequence-'+draft.type);
   const number=(await one<{n:number}>('SELECT count(*)::int n FROM tickets WHERE type=?',draft.type))!.n+20520;
   const ticketId=`${draft.type}-${number}`;
   await execute("INSERT INTO tickets(id,owner_user_id,title,description,type,category,priority,affected,status,opened_at,last_updated_at,resolved_at,version) VALUES(?,?,?,?,?,?,?,?,'ABERTO',?,?,NULL,1)",ticketId,userId,draft.title,draft.description,draft.type,draft.category,draft.priority,draft.affected,now,now);
   ticket=await getMyTicket(userId,ticketId);
  }else{
   if(!draft.ticket_id)throw new DomainError('INVALID_INPUT','Chamado não identificado');
   const t=await getMyTicket(userId,draft.ticket_id);
   if(draft.action==='REOPEN'&&!canReopen(t))throw new DomainError('INVALID_TRANSITION','O período de reabertura expirou',409);
   if(draft.action==='UPDATE'&&['RESOLVIDO','ENCERRADO'].includes(t.status))throw new DomainError('INVALID_TRANSITION','Chamado não permite atualização',409);
   await execute('UPDATE tickets SET description=?,status=?,last_updated_at=?,resolved_at=?,version=version+1 WHERE id=?',`${t.description}\n\nAtualização: ${draft.description}`,draft.action==='REOPEN'?'ABERTO':t.status,now,draft.action==='REOPEN'?null:t.resolved_at,t.id);
   ticket=await getMyTicket(userId,t.id);
  }
  await execute('INSERT INTO ticket_events(id,ticket_id,actor_id,type,content,created_at) VALUES(?,?,?,?,?,?)',randomUUID(),ticket.id,userId,draft.action,draft.description,now);
  await execute("UPDATE drafts SET status='CONFIRMED',version=version+1 WHERE id=?",id);
  const result={ticket,replay:false};
  await execute('INSERT INTO idempotency_keys(key,owner_user_id,result_json) VALUES(?,?,?)',scopedKey,userId,JSON.stringify(result));
  return result;
 });
}
export async function handoff(conversationId:string,userId:string,reason:string,summary:string){return transaction(async()=>{const c=await getConversation(conversationId,userId);if(c.state!=='AGENT_ACTIVE')throw new DomainError('CONVERSATION_LOCKED','Conversa não está com o agente',409);await execute("UPDATE conversations SET state='WAITING_ANALYST',version=version+1,updated_at=? WHERE id=?",iso(),conversationId);const id=randomUUID();await execute('INSERT INTO handoffs(id,conversation_id,reason,summary,created_at) VALUES(?,?,?,?,?)',id,conversationId,reason,summary,iso());return {id,state:'WAITING_ANALYST',summary}})}
export const analystQueue=()=>findAll<Conversation & {user_name:string;user_email:string}>("SELECT c.*,u.name user_name,u.email user_email FROM conversations c JOIN users u ON u.id=c.user_id WHERE c.state IN ('WAITING_ANALYST','ANALYST_ACTIVE') ORDER BY CASE c.state WHEN 'WAITING_ANALYST' THEN 0 ELSE 1 END,c.updated_at DESC LIMIT 100");
export async function analystTransition(actorId:string,conversationId:string,action:'assume'|'return'|'close'){return transaction(async()=>{const c=await getConversation(conversationId);if(action==='assume'){if(c.state!=='WAITING_ANALYST')throw new DomainError('INVALID_TRANSITION','Conversa não está aguardando',409);await execute("UPDATE conversations SET state='ANALYST_ACTIVE',assigned_analyst_id=?,version=version+1,updated_at=? WHERE id=?",actorId,iso(),conversationId)}else{if(c.state!=='ANALYST_ACTIVE'||c.assigned_analyst_id!==actorId)throw new DomainError('UNAUTHORIZED','Atendimento não pertence ao analista',403);await execute('UPDATE conversations SET state=?,assigned_analyst_id=NULL,version=version+1,updated_at=? WHERE id=?',action==='return'?'AGENT_ACTIVE':'CLOSED',iso(),conversationId)}await saveMessage(conversationId,'SYSTEM',action==='assume'?'Analista assumiu o atendimento':action==='return'?'Atendimento devolvido ao agente':'Atendimento encerrado');return getConversation(conversationId)})}
export async function analystSend(actorId:string,conversationId:string,text:string){return transaction(async()=>{const c=await getConversation(conversationId);if(c.state!=='ANALYST_ACTIVE'||c.assigned_analyst_id!==actorId)throw new DomainError('UNAUTHORIZED','Analista não está atendendo esta conversa',403);await saveMessage(conversationId,'ANALYST',text,actorId);return {ok:true}})}
export async function claimConversation(conversationId:string,userId:string){return transaction(async()=>{await getConversation(conversationId,userId);const now=Date.now();await execute('DELETE FROM conversation_processing WHERE started_at<?',now-90000);const token=randomUUID();const added=await execute('INSERT INTO conversation_processing(conversation_id,token,started_at) VALUES(?,?,?) ON CONFLICT(conversation_id) DO NOTHING',conversationId,token,now);if(!added)throw new DomainError('CONVERSATION_BUSY','Esta conversa já está processando uma mensagem',409);return token})}
export const releaseConversation=(id:string,token:string)=>execute('DELETE FROM conversation_processing WHERE conversation_id=? AND token=?',id,token);
export async function ensureAnalystAccess(id:string){const c=await getConversation(id);if(!['WAITING_ANALYST','ANALYST_ACTIVE'].includes(c.state))throw new DomainError('UNAUTHORIZED','Conversa não disponível à equipe de atendimento',403);return c}

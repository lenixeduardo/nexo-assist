import {auditForConversation} from './postgres-audit.js';
import {createServer,IncomingMessage,ServerResponse} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {signToken,verifyToken,cookieFor} from './auth.js';
import {getUser,getUserByEmail,listUsers,newConversation,getConversation,conversationsFor,messagesFor,findOne,listMyTickets,getMyTicket,getDraft,confirmDraft,cancelDraft,reviseDraft,analystQueue,analystTransition,analystSend,setOutage,saveMessage,findAll,ensureAnalystAccess} from './postgres-db.js';
import {receiveMessage} from './agent.js';
import {DomainError} from './types.js';
import type {User,Ticket,Trace} from './types.js';
function authenticated(email:string,password:string):boolean{
 const config=process.env.APP_AUTH_USERS_JSON;
 if(!config)return process.env.NODE_ENV!=='production';
 let users:Record<string,string>;
 try{users=JSON.parse(config) as Record<string,string>}catch{return false}
 const stored=users[email.trim().toLowerCase()];
 if(typeof stored!=='string')return false;
 const parts=stored.split(':');
 if(parts.length!==3||parts[0]!=='scrypt'||!/^[0-9a-f]{32}$/.test(parts[1]!)||!/^[0-9a-f]{128}$/.test(parts[2]!))return false;
 const expected=Buffer.from(parts[2]!,'hex');
 const actual=scryptSync(password,Buffer.from(parts[1]!,'hex'),64,{N:16384,r:8,p:1});
 return timingSafeEqual(actual,expected);
}
const PORT=Number(process.env.PORT||3000);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../public');
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const rate=new Map<string,{start:number,count:number}>();
const loginRate=new Map<string,{start:number,count:number}>();
function limitLogin(req:IncomingMessage){const key=(req.socket.remoteAddress||'local');const now=Date.now();const entry=loginRate.get(key);if(!entry||now-entry.start>60000){loginRate.set(key,{start:now,count:1});return}if(++entry.count>12)throw new DomainError('RATE_LIMITED','Muitas tentativas de login',429);if(loginRate.size>2000)for(const [k,v] of loginRate)if(now-v.start>60000)loginRate.delete(k)}
const locks=new Map<string,Promise<unknown>>();
async function locked<T>(key:string,fn:()=>Promise<T>):Promise<T>{const previous=locks.get(key)||Promise.resolve();let release:()=>void=()=>{};const current=new Promise<void>(r=>{release=r});locks.set(key,current);await previous;try{return await fn()}finally{release();if(locks.get(key)===current)locks.delete(key)}}
function json(res:ServerResponse,data:unknown,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(JSON.stringify(data));}
async function body(req:IncomingMessage):Promise<Record<string,unknown>>{let txt='';for await(const chunk of req){txt+=chunk.toString();if(txt.length>12000)throw new DomainError('INVALID_INPUT','Requisição muito grande',413)}try{const o=JSON.parse(txt||'{}') as unknown;if(typeof o!=='object'||o===null||Array.isArray(o))throw Error();return o as Record<string,unknown>}catch{throw new DomainError('INVALID_INPUT','JSON inválido')}}
const str=(o:Record<string,unknown>,field:string)=>String(o[field]??'');
const httpCookie=(req:IncomingMessage,name:string)=>req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith(name+'='))?.slice(name.length+1);
async function actor(req:IncomingMessage){const id=verifyToken(httpCookie(req,'nexo_session'));const u=await getUser(id);if(!u)throw new DomainError('UNAUTHORIZED','Usuário desconhecido',401);return u;}
function requireAnalyst(u:User){if(u.role!=='ANALYST')throw new DomainError('UNAUTHORIZED','Acesso reservado ao analista',403)}
function limit(u:User){const now=Date.now(),v=rate.get(u.id);if(!v||now-v.start>10*60000){rate.set(u.id,{start:now,count:1});return}v.count++;if(v.count>200)throw new DomainError('RATE_LIMITED','Muitas solicitações. Tente mais tarde.',429)}
function checkOrigin(req:IncomingMessage){if(['POST','PATCH','DELETE','PUT'].includes(req.method||'')){const origin=req.headers.origin;const host=req.headers.host;if(origin&&host){try{if(process.env.APP_PUBLIC_ORIGIN&&origin!==process.env.APP_PUBLIC_ORIGIN)throw new DomainError('UNAUTHORIZED','Origem não autorizada',403);if(new URL(origin).host!==host&&(!process.env.APP_PUBLIC_ORIGIN||origin!==process.env.APP_PUBLIC_ORIGIN))throw new DomainError('UNAUTHORIZED','Origem da requisição inválida',403)}catch(e){if(e instanceof DomainError)throw e;throw new DomainError('UNAUTHORIZED','Origem inválida',403)}}}}
function staticFile(req:IncomingMessage,res:ServerResponse,path:string){const key=path==='/'?'index.html':path.slice(1);if(key.includes('..')||key.startsWith('.'))throw new DomainError('NOT_FOUND','Não encontrado',404);const full=resolve(root,key);if(!full.startsWith(root+'/')||!existsSync(full))throw new DomainError('NOT_FOUND','Página não encontrada',404);res.writeHead(200,{'Content-Type':types[extname(full)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"});res.end(readFileSync(full));}
const toMessages=async(id:string)=>(await messagesFor(id)).map(m=>({id:m.id,role:m.role,text:m.text,createdAt:m.created_at,ui:m.ui_json?JSON.parse(m.ui_json):null,trace:m.trace_json?JSON.parse(m.trace_json):null}));
async function route(req:IncomingMessage,res:ServerResponse){const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);const p=url.pathname,method=req.method||'GET';checkOrigin(req);
 if(p==='/api/health')return json(res,{ok:true,service:'nexo-assist',now:new Date().toISOString()});
 if(p==='/api/login'&&method==='POST'){
 limitLogin(req);if(process.env.NODE_ENV==='production'&&!process.env.APP_AUTH_USERS_JSON)throw new DomainError('AUTH_NOT_CONFIGURED','Autenticação não configurada',503);
 const data=await body(req);const email=str(data,'email').trim(),password=str(data,'password');if(!password||password.length>300)throw new DomainError('INVALID_INPUT','Informe uma senha de demonstração');const user=await getUserByEmail(email);if(!user||!authenticated(email,password))throw new DomainError('UNAUTHORIZED','E-mail ou senha inválidos',401);
 res.setHeader('Set-Cookie',cookieFor(signToken(user.id),process.env.NODE_ENV==='production'));return json(res,{user});}
 if(p==='/api/logout'&&method==='POST'){res.setHeader('Set-Cookie','nexo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,{ok:true})}
 if(!p.startsWith('/api/'))return staticFile(req,res,p);
 const u=await actor(req);limit(u);
 if(p==='/api/me'&&method==='GET')return json(res,{user:u});
 if(p==='/api/demo/users'&&method==='GET')return json(res,{users:await listUsers().map(({id,name,email,role,department})=>({id,name,email,role,department}))});
 if(p==='/api/conversations'&&method==='GET')return json(res,{conversations:u.role==='ANALYST'?await analystQueue():await conversationsFor(u.id)});
 if(p==='/api/conversations'&&method==='POST'){if(u.role!=='EMPLOYEE')throw new DomainError('UNAUTHORIZED','Somente funcionários iniciam conversas',403);return json(res,{conversation:await newConversation(u.id)},201)}
 let m=p.match(/^\/api\/conversations\/([^/]+)$/);
 if(m&&method==='GET'){const c=await getConversation(m[1]!,u.role==='EMPLOYEE'?u.id:undefined);if(u.role==='ANALYST')await ensureAnalystAccess(c.id);return json(res,{conversation:c,messages:await toMessages(c.id),drafts:u.role==='EMPLOYEE'?await findAll('SELECT * FROM drafts WHERE conversation_id=? ORDER BY id DESC',c.id):[]})}
 m=p.match(/^\/api\/conversations\/([^/]+)\/audit$/);
 if(m&&method==='GET'){
  const c=await getConversation(m[1]!,u.role==='EMPLOYEE'?u.id:undefined);
  if(u.role==='ANALYST')await ensureAnalystAccess(c.id);
  return json(res,{conversationId:c.id,traces:await auditForConversation(c.id)});
 }
 m=p.match(/^\/api\/conversations\/([^/]+)\/messages$/);
 if(m&&method==='POST'){if(u.role!=='EMPLOYEE')throw new DomainError('UNAUTHORIZED','Apenas funcionário',403);const data=await body(req);const id=m[1]!;return json(res,await locked(id,()=>receiveMessage(u.id,id,str(data,'text'))))}
 if(p==='/api/tickets'&&method==='GET'){if(u.role==='ANALYST')throw new DomainError('UNAUTHORIZED','Use o painel do analista',403);return json(res,{tickets:await listMyTickets(u.id)})}
 m=p.match(/^\/api\/tickets\/([^/]+)$/);
 if(m&&method==='GET'){if(u.role==='ANALYST')throw new DomainError('UNAUTHORIZED','Use o painel do analista',403);return json(res,{ticket:await getMyTicket(u.id,m[1]!)});}
 m=p.match(/^\/api\/drafts\/([^/]+)$/);
 if(m&&method==='GET')return json(res,{draft:await getDraft(u.id,m[1]!)});
 if(m&&method==='PATCH'){const b=await body(req);const changes:Record<string,string>={};for(const k of ['title','description','affected'])if(typeof b[k]==='string')changes[k]=b[k] as string;return json(res,{draft:await reviseDraft(u.id,m[1]!,changes,Number(b.version))});}
 m=p.match(/^\/api\/drafts\/([^/]+)\/(confirm|cancel)$/);
 if(m&&method==='POST'){
 const b=await body(req);const id=m[1]!,op=m[2]!;
 if(op==='cancel')return json(res,await cancelDraft(u.id,id));
 const key=str(b,'idempotencyKey');const draft=await getDraft(u.id,id);const result=await confirmDraft(u.id,id,Number(b.version),key);const c=await getConversation(draft.conversation_id,u.id);
 const text=`${result.replay?'Operação já confirmada anteriormente.':'Chamado confirmado e registrado.'} ${result.ticket.id} — ${result.ticket.title}`;
 const trace:Trace={intent:draft.action==='CREATE'?'TICKET_CREATE':draft.action==='UPDATE'?'TICKET_UPDATE':'TICKET_REOPEN',extractedFacts:{ticketId:result.ticket.id,draftId:id},missingFields:[],actions:[{name:'confirmDraft',outcome:'OK',resourceIds:[result.ticket.id]}],policyRules:['CONFIRMED_BY_USER','IDEMPOTENCY','OWNERSHIP'],confidenceLabel:'HIGH',justification:'Mutação confirmada no backend após revisão do rascunho.',decision:'ANSWER'};
 if(!result.replay)await saveMessage(c.id,'AGENT',text,undefined,trace);
 return json(res,{...result,text});
 }
 if(p==='/api/analyst/queue'&&method==='GET'){requireAnalyst(u);return json(res,{conversations:await analystQueue()})}
 m=p.match(/^\/api\/analyst\/conversations\/([^/]+)\/tickets$/);
 if(m&&method==='GET'){requireAnalyst(u);const c=await getConversation(m[1]!);await ensureAnalystAccess(c.id);return json(res,{tickets:await listMyTickets(c.user_id)})}
 m=p.match(/^\/api\/analyst\/conversations\/([^/]+)\/(assume|return|close|message)$/);
 if(m&&method==='POST'){requireAnalyst(u);const id=m[1]!,op=m[2]!;
 if(op==='message'){const b=await body(req),text=str(b,'text').trim();if(!text||text.length>3000)throw new DomainError('INVALID_INPUT','Texto inválido');return json(res,await analystSend(u.id,id,text));}
 return json(res,{conversation:await analystTransition(u.id,id,op as 'assume'|'return'|'close')})}
 if(p==='/api/demo/outage'&&method==='POST'){requireAnalyst(u);const b=await body(req);setOutage(Number(b.ms)||5000);return json(res,{ok:true})}
 throw new DomainError('NOT_FOUND','Rota não encontrada',404);
}
const server=createServer((req,res)=>{route(req,res).catch(e=>{if(res.headersSent){res.end();return}const err=e instanceof DomainError?e:new DomainError('INTERNAL_ERROR','Erro interno',500);if(!(e instanceof DomainError))console.error(e);json(res,{error:{code:err.code,message:err.message}},err.status)})});
server.listen(PORT,()=>console.log(`Nexo Assist disponível em http://localhost:${PORT}`));

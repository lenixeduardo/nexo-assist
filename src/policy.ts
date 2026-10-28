import type {Category,Priority,Ticket,TicketType} from './types.js';
export type Facts={affected?:'SELF'|'TEAM'|'COMPANY'|'UNKNOWN';blocked?:boolean;todayDeadline?:boolean;hasWorkaround?:boolean;request?:boolean};
export const CATEGORIES:Category[]=['Acesso','Rede e VPN','Hardware','Software','E-mail','Outros'];
export const PRIORITY_LABELS:Record<Priority,string>={CRITICA:'Crítica',ALTA:'Alta',MEDIA:'Média',BAIXA:'Baixa'};
export function classify(text:string):{type:TicketType;category:Category}{
 const s=text.toLocaleLowerCase('pt-BR');
 const type:TicketType=/(preciso de|solicito|gostaria de|quero (um|uma|acesso)|pedido|solicita[cç][aã]o|novo monitor|licen[cç]a|instalar software)/.test(s)?'REQ':'INC';
 const category:Category=/(vpn|wi-?fi|rede|internet|conex[aã]o|conectar)/.test(s)?'Rede e VPN':/(notebook|monitor|tela|mouse|teclado|impressora|computador|hardware|driver)/.test(s)?'Hardware':/(senha|acesso|permiss[aã]o|sap|mfa|bloquead[oa])/.test(s)?'Acesso':/(outlook|e-?mail|email|caixa postal)/.test(s)?'E-mail':/(programa|software|aplicativo|excel|word|instala[cç][aã]o)/.test(s)?'Software':'Outros';
 return {type,category};
}
export function priorityFor(f:Facts):{priority:Priority;rule:string;reason:string}{
 if(f.affected==='TEAM'||f.affected==='COMPANY')return {priority:'CRITICA',rule:'P_CRITICAL_TEAM',reason:'Serviço parado para equipe ou empresa'};
 if(f.blocked||f.todayDeadline)return {priority:'ALTA',rule:'P_HIGH_BLOCKED_OR_TODAY',reason:f.todayDeadline?'Compromisso no mesmo dia':'Uma pessoa impedida de trabalhar'};
 if(f.request)return {priority:'BAIXA',rule:'P_LOW_REQUEST',reason:'Pedido ou melhoria sem urgência'};
 if(f.hasWorkaround)return {priority:'MEDIA',rule:'P_MEDIUM_WORKAROUND',reason:'Problema com alternativa de trabalho'};
 return {priority:'MEDIA',rule:'P_MEDIUM_DEFAULT',reason:'Impacto limitado, sem bloqueio ou urgência informados'};
}
export function inferFacts(text:string,type:TicketType):Facts{
 const s=text.toLocaleLowerCase('pt-BR');
 return {request:type==='REQ',affected:/(empresa inteira|toda a empresa|todos da empresa)/.test(s)?'COMPANY':/(minha equipe|meu time|nosso setor|todos do setor|equipe inteira)/.test(s)?'TEAM':/(s[oó] eu|somente eu|apenas eu|comigo)/.test(s)?'SELF':'UNKNOWN',blocked:/(n[aã]o consigo trabalhar|n[aã]o consigo trabalhar|imposs[ií]vel trabalhar|parou (tudo|totalmente)|sem conseguir trabalhar|impede.*trabalhar)/.test(s),todayDeadline:/(hoje|ainda hoje|reuni[aã]o.*(\d{1,2}h|\d{1,2}:\d{2})|prazo hoje)/.test(s),hasWorkaround:/(tenho alternativa|contorno|alternativa|consigo usar outro|ainda consigo trabalhar)/.test(s)};
}
export const SLA_MS:Record<Priority,number>={CRITICA:3600000,ALTA:4*3600000,MEDIA:3*10*3600000,BAIXA:5*10*3600000};
// Expediente proposto: weekdays 08:00–18:00 America/Sao_Paulo; no holiday calendar.
const partsFmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function businessInfo(d:Date){const p=partsFmt.formatToParts(d);const take=(t:string)=>p.find(x=>x.type===t)?.value??'';return {weekday:take('weekday'),hour:Number(take('hour')),minute:Number(take('minute'))};}
export function dueDate(priority:Priority,base:Date):Date{
 if(priority==='CRITICA')return new Date(base.getTime()+SLA_MS.CRITICA);
 let left=SLA_MS[priority];let at=base.getTime();let guard=0;
 while(left>0&&guard++<10000){const info=businessInfo(new Date(at));const weekend=['Sat','Sun'].includes(info.weekday);const open=!weekend&&info.hour>=8&&info.hour<18;const step=Math.min(left,60000);
 if(open)left-=step;
 at+=60000;
 }
 return new Date(at);
}
export function ticketSla(t:Ticket,now=new Date()){
 const base=new Date(t.last_updated_at);const due=dueDate(t.priority,base);
 const final=['RESOLVIDO','ENCERRADO'].includes(t.status);
 return {dueAt:due.toISOString(),overdue:!final&&due.getTime()<now.getTime(),label:PRIORITY_LABELS[t.priority]};
}
export function canReopen(t:Ticket,now=new Date()){return t.status==='RESOLVIDO'&&!!t.resolved_at&&now.getTime()-new Date(t.resolved_at).getTime()>=0&&now.getTime()-new Date(t.resolved_at).getTime()<=7*86400000;}
export function sameProblem(a:string,b:string):boolean{
 const norm=(s:string)=>new Set(s.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(w=>w.length>=4&&!['meu','minha','para','desde','erro','problema','nao','apos','esta','esta','preciso','chamado','atualizacao','problema','tenho','alternativa','consigo','outro','outra','como','usar','trabalhar','trabalho','equipamento','funciona','funcionando','meu','minha','este','esta','mais','tem','para','somente','apenas','apos'].includes(w)));
 const x=norm(a),y=norm(b);let common=0;for(const w of x)if(y.has(w))common++;
 const anchors=new Set(['vpn','impressora','teclado','mouse','sap','outlook','monitor','notebook','rede','wifi','sharepoint','windows','email','senha','software','excel','word']);
 const ax=[...x].filter(w=>anchors.has(w)),ay=[...y].filter(w=>anchors.has(w));
 if(ax.length&&ay.length&&!ax.some(w=>ay.includes(w)))return false;
 return common>=2 || (common>=1&&ax.some(w=>ay.includes(w)));

}

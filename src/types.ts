export type Role = 'EMPLOYEE' | 'ANALYST';
export type TicketType = 'INC' | 'REQ';
export type Category = 'Acesso' | 'Rede e VPN' | 'Hardware' | 'Software' | 'E-mail' | 'Outros';
export type Priority = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA';
export type TicketStatus = 'ABERTO'|'EM_ANDAMENTO'|'AGUARDANDO_ANALISTA'|'APROVADO'|'RESOLVIDO'|'ENCERRADO';
export type ConversationState = 'AGENT_ACTIVE'|'WAITING_ANALYST'|'ANALYST_ACTIVE'|'CLOSED';
export type Intent = 'KNOWLEDGE_QUESTION'|'TICKET_STATUS'|'TICKET_CREATE'|'TICKET_UPDATE'|'TICKET_REOPEN'|'HUMAN_HANDOFF'|'OUT_OF_SCOPE'|'UNCLEAR';
export type Decision = 'ANSWER'|'ASK'|'PROPOSE_DRAFT'|'TRANSFER'|'REFUSE';
export type User = {id:string; name:string; email:string; role:Role; department:string};
export type Ticket = {id:string;owner_user_id:string;title:string;description:string;type:TicketType;category:Category;priority:Priority;affected:string;status:TicketStatus;opened_at:string;last_updated_at:string;resolved_at:string|null;version:number};
export type Draft = {id:string;conversation_id:string;owner_user_id:string;action:'CREATE'|'UPDATE'|'REOPEN';ticket_id:string|null;title:string;description:string;type:TicketType;category:Category;priority:Priority;affected:string;justification:string;status:'PENDING_CONFIRMATION'|'CONFIRMED'|'CANCELLED';version:number};
export type Conversation = {id:string;user_id:string;state:ConversationState;assigned_analyst_id:string|null;session_count:number;version:number;created_at:string;updated_at:string};
export type TraceAction = {name:string;outcome:'OK'|'ERROR'|'SKIPPED';resourceIds?:string[];durationMs?:number};
export type Trace = {traceId?:string;intent:Intent; extractedFacts:Record<string,unknown>;missingFields:string[];actions:TraceAction[];policyRules:string[];confidenceLabel:'HIGH'|'MEDIUM'|'LOW';justification:string;decision:Decision};
export type AgentResult = {text:string;ui?:{type:string;ticketIds?:string[];draftId?:string};trace:Trace; transfer?:boolean};
export class DomainError extends Error { constructor(public code:string, message:string, public status=400){super(message);this.name='DomainError'} }

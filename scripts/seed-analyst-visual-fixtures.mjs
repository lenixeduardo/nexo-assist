#!/usr/bin/env node
/**
 * Deterministic analyst UI fixtures for an ISOLATED PostgreSQL test database.
 * Refuses production by default; does not modify live tickets or credentials.
 * Usage: NEXO_FIXTURE_ISOLATED_DB=true DATABASE_URL=postgresql://... node scripts/seed-analyst-visual-fixtures.mjs
 */
import pg from 'pg';
const url=process.env.DATABASE_URL;
if(process.env.NEXO_FIXTURE_ISOLATED_DB!=='true'||!url)throw Error('Refusing fixture write: set NEXO_FIXTURE_ISOLATED_DB=true and a dedicated test DATABASE_URL.');
const parsed=new URL(url);
const host=parsed.hostname.toLowerCase();
if(/supabase|supavisor|pooler|vercel|production|prod\./.test(host)||process.env.NODE_ENV==='production')throw Error('Refusing fixtures on a potentially production database.');
const client=new pg.Client({connectionString:url,ssl:process.env.PGSSL_DISABLE==='true'?false:{rejectUnauthorized:true}});
await client.connect();
const now=new Date('2026-10-28T12:00:00.000Z');
const users=[
 ['u-ana','Ana Souza','ana.souza@nexo.com.br','EMPLOYEE','Financeiro'],
 ['u-bruno','Bruno Tavares','bruno.tavares@nexo.com.br','EMPLOYEE','Operações'],
 ['u-carla','Carla Mendes','carla.mendes@nexo.com.br','EMPLOYEE','Comercial'],
 ['u-diego','Diego Ramos','diego.ramos@nexo.com.br','EMPLOYEE','Tecnologia'],
 ['u-rafael','Rafael Lima','rafael.lima@nexo.com.br','ANALYST','Suporte N2']
];
const conversations=[
 ['visual-ana-waiting','u-ana','WAITING_ANALYST',null,-5],
 ['visual-bruno-active','u-bruno','ANALYST_ACTIVE','u-rafael',-3],
 ['visual-carla-waiting','u-carla','WAITING_ANALYST',null,-9],
 ['visual-diego-agent','u-diego','AGENT_ACTIVE',null,-15]
];
const messages=[
 ['visual-msg-ana-1','visual-ana-waiting','u-ana','user','Preciso de ajuda com o acesso ao SharePoint.',-7],
 ['visual-msg-ana-2','visual-ana-waiting',null,'agent','Encaminhei sua solicitação para um analista.',-5],
 ['visual-msg-bruno-1','visual-bruno-active','u-bruno','user','Minha VPN não conecta, erro 809 no Windows 11.',-6],
 ['visual-msg-bruno-2','visual-bruno-active',null,'agent','Vou transferir seu atendimento para a equipe de TI.',-4],
 ['visual-msg-bruno-3','visual-bruno-active','u-rafael','analyst','Olá, Bruno. Estou verificando sua conexão VPN.',-3],
 ['visual-msg-carla-1','visual-carla-waiting','u-carla','user','Preciso de acesso ao SAP.',-10],
 ['visual-msg-carla-2','visual-carla-waiting',null,'agent','Um atendente dará continuidade.',-9],
 ['visual-msg-diego-1','visual-diego-agent','u-diego','user','Como configurar meu e-mail corporativo?',-15]
];
const tickets=[
 ['INC-20311','u-ana','Notebook lento após atualização do Windows','Lentidão após atualização','INC','Hardware','MEDIA','SELF','AGUARDANDO_ANALISTA',-60],
 ['INC-30002','u-bruno','VPN sem conectar — erro 809','VPN não conecta no Windows 11','INC','Rede e VPN','ALTA','SELF','EM_ANDAMENTO',-30],
 ['REQ-30003','u-carla','Acesso ao SAP','Acesso necessário para área comercial','REQ','Acesso','ALTA','SELF','ABERTO',-20]
];
const ts=m=>new Date(now.getTime()+m*60000);
try{
 await client.query('BEGIN');
 await client.query('SET LOCAL search_path TO nexo, pg_catalog');
 for(const [id,name,email,role,department] of users)await client.query('INSERT INTO users(id,name,email,role,department) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[id,name,email,role,department]);
 for(const [id,user,state,analyst,minutes] of conversations)await client.query('INSERT INTO conversations(id,user_id,state,assigned_analyst_id,session_count,version,created_at,updated_at) VALUES($1,$2,$3,$4,1,1,$5,$5) ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,assigned_analyst_id=EXCLUDED.assigned_analyst_id,updated_at=EXCLUDED.updated_at',[id,user,state,analyst,ts(minutes)]);
 for(const [id,conversation,sender,role,text,minutes] of messages)await client.query('INSERT INTO messages(id,conversation_id,sender_id,role,text,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',[id,conversation,sender,role,text,ts(minutes)]);
 for(const [id,owner,title,description,type,category,priority,affected,status,minutes] of tickets)await client.query('INSERT INTO tickets(id,owner_user_id,title,description,type,category,priority,affected,status,opened_at,last_updated_at,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,1) ON CONFLICT(id) DO NOTHING',[id,owner,title,description,type,category,priority,affected,status,ts(minutes)]);
 const check=await client.query("SELECT state,count(*)::int n FROM conversations WHERE id LIKE 'visual-%' GROUP BY state ORDER BY state");
 const assigned=await client.query("SELECT count(*)::int n FROM conversations WHERE id='visual-bruno-active' AND state='ANALYST_ACTIVE' AND assigned_analyst_id='u-rafael'");
 if(Number(assigned.rows[0]?.n)!==1)throw Error('Active assigned conversation missing');
 await client.query('COMMIT');
 console.log('VISUAL_FIXTURE_PROOF='+JSON.stringify({isolated:true,states:check.rows,activeAssignedToRafael:true,fixtureConversations:4,fixtureMessages:8,fixtureTickets:3}));
}catch(e){await client.query('ROLLBACK');throw e}finally{await client.end()}

/**
 * PostgreSQL connection for Nexo Assist. All tables are isolated in the nexo schema.
 * This module intentionally does not import SQLite or run DDL at runtime.
 */
import pg from 'pg';
import {AsyncLocalStorage} from 'node:async_hooks';

const {Pool}=pg;
type Params=readonly (string|number|boolean|null|undefined)[];
const context=new AsyncLocalStorage<pg.PoolClient>();
let pool:pg.Pool|undefined;

function connection():pg.Pool {
 if(pool)return pool;
 const url=process.env.DATABASE_URL;
 if(!url)throw new Error('DATABASE_URL is required for PostgreSQL');
 let parsed:URL;
 try{parsed=new URL(url)}catch{throw new Error('DATABASE_URL must be a valid PostgreSQL URL')}
 if(!['postgres:','postgresql:'].includes(parsed.protocol))throw new Error('DATABASE_URL must use postgres:// or postgresql://');
 if(process.env.NODE_ENV==='production'&&process.env.PGSSL_DISABLE==='true')throw new Error('PGSSL_DISABLE cannot be true in production');
 pool=new Pool({connectionString:url,max:5,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,
  ssl:process.env.PGSSL_DISABLE==='true'?false:{rejectUnauthorized:true,...(process.env.PGSSL_CA_PEM?{ca:process.env.PGSSL_CA_PEM.replace(/\\n/g,'\n')}: {})}});
 return pool;
}
function placeholders(sql:string):string {
 let i=0;
 return sql.replace(/\?/g,()=>'$'+(++i));
}
function qualified(sql:string):string {
 // The search_path is set on every pooled connection, and on transactions.
 return placeholders(sql);
}
/**
 * Supavisor transaction pooling does not preserve session settings between requests.
 * Use SET LOCAL inside an explicit transaction for each operation, so search_path
 * never leaks to another application sharing this database.
 */
async function scoped<T>(fn:(client:pg.PoolClient)=>Promise<T>):Promise<T>{
 const existing=context.getStore();
 if(existing)return fn(existing);
 const client=await connection().connect();
 let began=false;
 try{
  await client.query('BEGIN');began=true;
  await client.query('SET LOCAL search_path TO nexo, pg_catalog');
  const value=await context.run(client,()=>fn(client));
  await client.query('COMMIT');began=false;
  return value;
 }catch(error){
  if(began)try{await client.query('ROLLBACK')}catch{}
  throw error;
 }finally{client.release()}
}
export async function query<T=pg.QueryResultRow>(sql:string,...values:Params):Promise<T[]>{
 return scoped(async client=>(await client.query(qualified(sql),[...values])).rows as T[]);
}
export async function one<T=pg.QueryResultRow>(sql:string,...values:Params):Promise<T|undefined>{
 return (await query<T>(sql,...values))[0];
}
export async function execute(sql:string,...values:Params):Promise<number>{
 return scoped(async client=>(await client.query(qualified(sql),[...values])).rowCount??0);
}
export async function transaction<T>(fn:()=>Promise<T>):Promise<T>{
 return scoped(async()=>fn());
}
export async function closePool(){if(pool){await pool.end();pool=undefined}}

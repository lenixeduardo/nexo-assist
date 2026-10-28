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
 pool=new Pool({connectionString:url,max:5,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,
  ssl:process.env.PGSSL_DISABLE==='true'?false:{rejectUnauthorized:true}});
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
export async function query<T=pg.QueryResultRow>(sql:string,...values:Params):Promise<T[]>{
 const client=context.getStore();
 if(client)return (await client.query(qualified(sql),[...values])).rows as T[];
 const p=connection();
 const c=await p.connect();
 try{
  await c.query('SET search_path TO nexo, pg_catalog');
  return (await c.query(qualified(sql),[...values])).rows as T[];
 }finally{c.release()}
}
export async function one<T=pg.QueryResultRow>(sql:string,...values:Params):Promise<T|undefined>{
 return (await query<T>(sql,...values))[0];
}
export async function execute(sql:string,...values:Params):Promise<number>{
 const client=context.getStore();
 if(client)return (await client.query(qualified(sql),[...values])).rowCount??0;
 const c=await connection().connect();
 try{
  await c.query('SET search_path TO nexo, pg_catalog');
  return (await c.query(qualified(sql),[...values])).rowCount??0;
 }finally{c.release()}
}
export async function transaction<T>(fn:()=>Promise<T>):Promise<T>{
 if(context.getStore())return fn();
 const c=await connection().connect();
 try{
  await c.query('BEGIN');
  await c.query('SET LOCAL search_path TO nexo, pg_catalog');
  const value=await context.run(c,fn);
  await c.query('COMMIT');
  return value;
 }catch(err){await c.query('ROLLBACK');throw err}
 finally{c.release()}
}
export async function closePool(){if(pool){await pool.end();pool=undefined}}

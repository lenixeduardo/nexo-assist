import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {one,execute,transaction,closePool} from '../dist/postgres.js';

if(!process.env.DATABASE_URL) {
 console.error('DATABASE_URL ausente; teste de integração PostgreSQL não executado.');
 process.exitCode=2;
} else {
 try {
  const schema=await one('SELECT current_schema() AS name');
  assert.equal(schema?.name,'nexo','Conexão não está isolada no esquema nexo');
  const id='nexo-smoke-'+randomUUID();
  const rollback=new Error('SMOKE_ROLLBACK');
  try {
   await transaction(async()=>{
    await execute('INSERT INTO users(id,name,email,role,department) VALUES(?,?,?,?,?)',id,'Teste de migração',id+'@example.invalid','EMPLOYEE','QA');
    assert.equal((await one('SELECT id FROM users WHERE id=?',id))?.id,id);
    throw rollback;
   });
  }catch(e){if(e!==rollback)throw e}
  assert.equal(await one('SELECT id FROM users WHERE id=?',id),undefined,'Rollback não removeu o registro');
  console.log('PASS: conexão, search_path, INSERT, SELECT e ROLLBACK PostgreSQL');
 }catch(e){console.error(e);process.exitCode=1}
 finally{await closePool()}
}

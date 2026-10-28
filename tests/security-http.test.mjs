import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer as createTcpServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {rmSync} from 'node:fs';
const temp=`/tmp/nexo-prod-${process.pid}`;
function freePort(){return new Promise(resolve=>{const s=createTcpServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})})}
async function start(extra){const port=await freePort();const filepath=`${temp}-${port}.sqlite`;
 const env={...process.env,PORT:String(port),DB_PATH:filepath,NODE_ENV:'production',APP_SESSION_SECRET:'test-secret-for-tests-must-be-longer-than-32-characters',...extra};
 const proc=spawn(process.execPath,['--disable-warning=ExperimentalWarning','dist/server.js'],{env,stdio:'ignore'});
 const base=`http://127.0.0.1:${port}`;
 for(let i=0;i<100;i++){try{const response=await fetch(`${base}/api/health`);if(response.ok)return {proc,base,filepath}}catch{}await new Promise(r=>setTimeout(r,50));}
 proc.kill();throw Error('server did not start');
}
function stop(s){s.proc.kill();for(const ext of ['','-wal','-shm'])try{rmSync(s.filepath+ext)}catch{}}
test('production rejects demo credentials unless explicitly enabled',async()=>{const s=await start({APP_DEMO_LOGIN:'false'});try{
 const r=await fetch(`${s.base}/api/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'ana.souza@nexo.com.br',password:'anything'})});
 assert.equal(r.status,403);assert.equal((await r.json()).error.code,'DEMO_LOGIN_DISABLED');
}finally{stop(s)}});
test('explicit production demo uses secure cookie and blocks forged origin',async()=>{const s=await start({APP_DEMO_LOGIN:'true'});try{
 const denied=await fetch(`${s.base}/api/login`,{method:'POST',headers:{'content-type':'application/json','origin':'https://attacker.invalid'},body:'{}'});
 assert.equal(denied.status,403);
 const login=await fetch(`${s.base}/api/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'ana.souza@nexo.com.br',password:'anything'})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);
 const c=await fetch(`${s.base}/api/conversations`,{method:'POST',headers:{'cookie':cookie.split(';')[0]}});
 assert.equal(c.status,201);
 const id=(await c.json()).conversation.id;
 const analyst=await fetch(`${s.base}/api/analyst/queue`,{headers:{cookie:cookie.split(';')[0]}});
 assert.equal(analyst.status,403);
 const audit=await fetch(`${s.base}/api/conversations/${id}/audit`,{headers:{cookie:cookie.split(';')[0]}});
 assert.equal(audit.status,200);
}finally{stop(s)}});

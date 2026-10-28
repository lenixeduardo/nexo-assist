import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer as tcp} from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required for PostgreSQL HTTP integration');
const freePort=()=>new Promise(resolve=>{const s=tcp();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})});
test('HTTP login, conversation, agent handoff, audit and analyst queue use PostgreSQL',async()=>{
 const port=await freePort();
 const proc=spawn(process.execPath,['dist/server.js'],{env:{...process.env,PORT:String(port),APP_DEMO_LOGIN:'true',APP_AUTH_USERS_JSON:'',USE_MASTRA:'false',LLM_API_KEY:'',NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 let logs='';proc.stderr.on('data',b=>logs+=String(b).slice(0,2000));
 const base='http://127.0.0.1:'+port;
 const request=async(path,method='GET',payload,token)=>{
  const res=await fetch(base+path,{method,headers:{...(token?{Cookie:token}:{}),...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined});
  return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')};
 };
 try{
  let ready=false;
  for(let i=0;i<100;i++){try{if((await request('/api/health')).status===200){ready=true;break}}catch{}await sleep(100)}
  assert.equal(ready,true,'Server startup failed: '+logs);
  const login=await request('/api/login','POST',{email:'ana.souza@nexo.com.br',password:'demo'});
  assert.equal(login.status,200,JSON.stringify(login.data));
  const cookie=login.cookie.split(';')[0];
  const created=await request('/api/conversations','POST',{},cookie);
  assert.equal(created.status,201,JSON.stringify(created.data));
  const id=created.data.conversation.id;
  const sent=await request('/api/conversations/'+id+'/messages','POST',{text:'Quero falar com um analista'},cookie);
  assert.equal(sent.status,200,JSON.stringify(sent.data));
  const restored=await request('/api/conversations/'+id,'GET',undefined,cookie);
  assert.equal(restored.status,200,JSON.stringify(restored.data));
  assert.equal(restored.data.conversation.state,'WAITING_ANALYST');
  assert.ok(restored.data.messages.some(m=>m.role==='USER'&&m.text.includes('analista')));
  const audit=await request('/api/conversations/'+id+'/audit','GET',undefined,cookie);
  assert.equal(audit.status,200,JSON.stringify(audit.data));
  assert.ok(audit.data.traces.length>=1);
  const queue=await request('/api/analyst/queue','GET',undefined,cookie);
  assert.equal(queue.status,403);
 }finally{proc.kill();await Promise.race([new Promise(r=>proc.once('exit',r)),sleep(2000)])}
});

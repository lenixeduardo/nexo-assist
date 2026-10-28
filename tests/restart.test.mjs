import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('SQLite persists handoff and chat across a full server restart',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'nexo-restart-'));let server;const port=47000+Math.floor(Math.random()*10000);const url=`http://localhost:${port}`;const env={...process.env,DB_PATH:join(temp,'persistent.sqlite'),PORT:String(port),APP_SESSION_SECRET:'test-persistent-secret-should-be-longer-than-32',LLM_API_KEY:'',TICKET_SERVICE_DOWN:'false'};
 const launch=async()=>{server=spawn(process.execPath,['dist/server.js'],{cwd:root,env,stdio:'ignore'});for(let i=0;i<60;i++){try{const res=await fetch(url+'/api/health');if(res.ok)return}catch{}await delay(100)}throw Error('Server did not start')};
 const req=async(path,method='GET',value,cookie)=>{const response=await fetch(url+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(value?{'Content-Type':'application/json'}:{})},body:value?JSON.stringify(value):undefined});return {body:await response.json(),cookie:response.headers.get('set-cookie'),status:response.status}};
 try{await launch();const auth=await req('/api/login','POST',{email:'ana.souza@nexo.com.br',password:'demo'});const cookie=auth.cookie.split(';')[0];const session=await req('/api/conversations','POST',{},cookie);const id=session.body.conversation.id;
 const handoff=await req(`/api/conversations/${id}/messages`,'POST',{text:'Quero falar com um analista'},cookie);assert.equal(handoff.body.conversation.state,'WAITING_ANALYST');
 server.kill();await new Promise(resolve=>server.once('exit',resolve));await launch();const restored=await req(`/api/conversations/${id}`,'GET',null,cookie);assert.equal(restored.status,200);assert.equal(restored.body.conversation.state,'WAITING_ANALYST');assert.ok(restored.body.messages.some(m=>m.role==='USER'&&m.text.includes('analista')));
 }finally{server?.kill();rmSync(temp,{recursive:true,force:true})}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mastraClassify} from '../dist/mastra.js';

test('Mastra disabled: no model call and explicit null', async()=>{
 const previous=process.env.USE_MASTRA;
 try{process.env.USE_MASTRA='false';assert.equal(await mastraClassify('user','Preciso de VPN',[]),null)}
 finally{if(previous===undefined)delete process.env.USE_MASTRA;else process.env.USE_MASTRA=previous}
});

test('Mastra enabled without credentials: fail closed instead of pretending LLM ran',async()=>{
 const previous=process.env.USE_MASTRA,key=process.env.OPENAI_API_KEY;
 try{process.env.USE_MASTRA='true';delete process.env.OPENAI_API_KEY;await assert.rejects(mastraClassify('user','VPN',[]),/MASTRA_CONFIG_ERROR/)}
 finally{if(previous===undefined)delete process.env.USE_MASTRA;else process.env.USE_MASTRA=previous;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key}
});

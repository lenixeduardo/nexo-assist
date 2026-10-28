import test from 'node:test';
import assert from 'node:assert/strict';
import {retryableInitialization} from '../dist/initialization.js';
test('a transient failed startup can recover on the next request',async()=>{
 let attempts=0;const ready=retryableInitialization(async()=>{if(++attempts===1)throw Error('temporary DB timeout')});
 await assert.rejects(ready(),/temporary DB timeout/);await ready();assert.equal(attempts,2);
});
test('concurrent requests share one successful initialization',async()=>{
 let attempts=0;let release;const gate=new Promise(r=>{release=r});const ready=retryableInitialization(async()=>{attempts++;await gate});
 const a=ready(),b=ready();release();await Promise.all([a,b]);await ready();assert.equal(attempts,1);
});

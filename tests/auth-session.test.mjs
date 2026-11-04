import test from 'node:test';
import assert from 'node:assert/strict';
import {signToken,verifyToken,cookieFor} from '../dist/auth.js';

test('signed session verifies the user and rejects tampering',()=>{
 const token=signToken('u-ana');
 assert.equal(verifyToken(token),'u-ana');
 const [payload,mac]=token.split('.');
 const changed=(mac[0]==='a'?'b':'a')+mac.slice(1);
 assert.throws(()=>verifyToken(payload+'.'+changed),err=>err?.status===401&&err?.code==='UNAUTHORIZED');
});
test('missing or malformed session returns unauthorized',()=>{
 for(const value of [undefined,'','invalid','x.y.z']){
  assert.throws(()=>verifyToken(value),err=>err?.status===401);
 }
});
test('production session cookie has HttpOnly, SameSite and Secure attributes',()=>{
 const cookie=cookieFor(signToken('u-ana'),true);
 for(const flag of ['HttpOnly','SameSite=Lax','Secure','Max-Age=604800'])assert.ok(cookie.includes(flag),flag);
 assert.ok(!cookieFor('token',false).includes('Secure'));
});

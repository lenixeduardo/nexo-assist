import test from 'node:test';
import assert from 'node:assert/strict';
import {safeJson} from '../dist/postgres-audit.js';
test('audits preserve numeric usage while redacting authentication tokens',()=>{
 const v=JSON.parse(safeJson({usage:{inputTokens:42,outputTokens:7,totalTokens:49},token:'opaque-token',NVIDIA_API_KEY:'nvapi-testsecret123456'}));
 assert.deepEqual(v.usage,{inputTokens:42,outputTokens:7,totalTokens:49});assert.equal(v.token,'[redacted]');assert.equal(v.NVIDIA_API_KEY,'[redacted]');
});
test('NVIDIA and OpenAI credentials embedded in text are redacted',()=>{
 const v=JSON.parse(safeJson({text:'nvapi-example_secret_123456 and sk-example_secret_123456 Bearer opaque'}));
 assert.ok(!v.text.includes('example_secret'));assert.ok(!v.text.includes('opaque'));
});

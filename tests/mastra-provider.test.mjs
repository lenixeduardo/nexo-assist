import test from 'node:test';
import assert from 'node:assert/strict';
import {mastraProviderConfig} from '../dist/mastra-provider.js';
test('defaults to direct Mistral AI without NVIDIA, Gateway or OIDC',()=>{
 const c=mastraProviderConfig({MISTRAL_API_KEY:'test-only'});assert.equal(c.provider,'mistral');assert.equal(c.model,'mistral/mistral-small-latest');assert.equal(c.credentialEnv,'MISTRAL_API_KEY');assert.equal(c.configured,true);assert.ok(!JSON.stringify(c).includes('test-only'));
});
test('missing Mistral credential is explicitly reported without substituting another provider',()=>{
 const c=mastraProviderConfig({VERCEL:'1',VERCEL_OIDC_TOKEN:'test-only'});assert.equal(c.configured,false);assert.equal(c.provider,'mistral');
});
test('stale Gateway configuration is rejected',()=>assert.throws(()=>mastraProviderConfig({MASTRA_PROVIDER:'gateway'}),/provedor inválido/));
test('model cannot silently point at a different provider',()=>assert.throws(()=>mastraProviderConfig({MASTRA_PROVIDER:'nvidia',MASTRA_MODEL:'openai/gpt-4.1-mini'}),/modelo.*provedor/));
test('explicit direct OpenAI configuration remains supported',()=>{
 const c=mastraProviderConfig({MASTRA_PROVIDER:'openai',OPENAI_API_KEY:'test-only'});assert.equal(c.model,'openai/gpt-4.1-mini');assert.equal(c.configured,true);
});

test('NVIDIA key cannot authenticate direct Mistral AI',()=>{
 const c=mastraProviderConfig({MASTRA_PROVIDER:'mistral',NVIDIA_API_KEY:'test-only'});assert.equal(c.configured,false);assert.equal(c.credentialEnv,'MISTRAL_API_KEY');
});
test('explicit NVIDIA configuration remains isolated',()=>{
 const c=mastraProviderConfig({MASTRA_PROVIDER:'nvidia',NVIDIA_API_KEY:'test-only'});assert.equal(c.provider,'nvidia');assert.equal(c.configured,true);assert.equal(c.credentialEnv,'NVIDIA_API_KEY');
});

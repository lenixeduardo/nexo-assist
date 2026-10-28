/** Direct provider configuration. Never returns or records credential values. */
const NVIDIA_MODEL='nvidia/nvidia/nemotron-3-super-120b-a12b';
export function mastraProviderConfig(env:Record<string,string|undefined>):{provider:'mistral'|'nvidia'|'openai';model:string;credentialEnv:string;configured:boolean}{
 const provider=env.MASTRA_PROVIDER||'mistral';
 if(provider!=='mistral'&&provider!=='nvidia'&&provider!=='openai')throw new Error('MASTRA_CONFIG_ERROR: provedor inválido');
 const model=env.MASTRA_MODEL||(provider==='mistral'?'mistral/mistral-small-latest':provider==='nvidia'?NVIDIA_MODEL:'openai/gpt-4.1-mini');
 if(!model.startsWith(provider+'/')||model.length<=provider.length+1)throw new Error('MASTRA_CONFIG_ERROR: modelo incompatível com o provedor');
 const credentialEnv=provider==='mistral'?'MISTRAL_API_KEY':provider==='nvidia'?'NVIDIA_API_KEY':'OPENAI_API_KEY';
 return {provider,model,credentialEnv,configured:!!env[credentialEnv]?.trim()};
}

/** Direct provider configuration. Never returns or records credential values. */
const NVIDIA_MODEL='nvidia/mistralai/mistral-large-2-instruct';
export function mastraProviderConfig(env:Record<string,string|undefined>):{provider:'nvidia'|'openai';model:string;credentialEnv:string;configured:boolean}{
 const provider=env.MASTRA_PROVIDER||'nvidia';
 if(provider!=='nvidia'&&provider!=='openai')throw new Error('MASTRA_CONFIG_ERROR: provedor inválido');
 const model=env.MASTRA_MODEL||(provider==='nvidia'?NVIDIA_MODEL:'openai/gpt-4.1-mini');
 if(!model.startsWith(provider+'/')||model.length<=provider.length+1)throw new Error('MASTRA_CONFIG_ERROR: modelo incompatível com o provedor');
 const credentialEnv=provider==='nvidia'?'NVIDIA_API_KEY':'OPENAI_API_KEY';
 return {provider,model,credentialEnv,configured:!!env[credentialEnv]?.trim()};
}

/** Cache successful startup, share concurrent attempts and retry after transient failure. */
export function retryableInitialization(initialize:()=>Promise<void>){
 let ready:Promise<void>|undefined;
 return ()=>{
  if(!ready)ready=Promise.resolve().then(initialize).catch(error=>{ready=undefined;throw error});
  return ready;
 };
}

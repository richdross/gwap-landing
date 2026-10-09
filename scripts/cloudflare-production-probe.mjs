// Read-only Cloudflare Pages deployment status inspection. Never print access tokens.
const token=process.env.CLOUDFLARE_API_TOKEN||"";
async function cf(path){
  const r=await fetch("https://api.cloudflare.com/client/v4"+path,{
    headers:{authorization:"Bearer "+token,"content-type":"application/json"},
    signal:AbortSignal.timeout(16000)
  });
  const x=await r.json().catch(()=>({}));
  return {status:r.status,success:x.success===true,result:x.result||null,code:x.errors?.[0]?.code||null};
}
const report={mode:"read-only",tokenPresent:!!token,project:"gwap-landing"};
if(token){
  try {
    const accounts=await cf("/accounts?per_page=50");
    report.accountList={status:accounts.status,success:accounts.success,count:Array.isArray(accounts.result)?accounts.result.length:0};
    for(const a of (Array.isArray(accounts.result)?accounts.result:[]).slice(0,15)){
      const p=await cf("/accounts/"+encodeURIComponent(a.id)+"/pages/projects/gwap-landing");
      if(!p.success)continue;
      report.projectFound=true;
      report.projectInfo={productionBranch:p.result?.production_branch,subdomain:p.result?.subdomain,created:p.result?.created_on,latestDeploymentId:p.result?.latest_deployment?.id||null,latestDeploymentHash:p.result?.latest_deployment?.deployment_trigger?.metadata?.commit_hash||null};
      const deployments=await cf("/accounts/"+encodeURIComponent(a.id)+"/pages/projects/gwap-landing/deployments?per_page=5");
      report.deployments={status:deployments.status,success:deployments.success,items:(Array.isArray(deployments.result)?deployments.result:[]).slice(0,5).map(d=>({
        id:d.id,environment:d.environment,created:d.created_on,
        stage:d.latest_stage?.status||null,
        commit:d.deployment_trigger?.metadata?.commit_hash||null
      }))};
      break;
    }
    if(!report.projectFound)report.projectFound=false;
  }catch(e){report.error=String(e?.name||"network_error").slice(0,100);}
}
console.log("CLOUDFLARE_PAGES_METADATA "+JSON.stringify(report));

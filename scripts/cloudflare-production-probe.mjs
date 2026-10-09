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
      const discovered=await cf("/accounts/"+encodeURIComponent(a.id)+"/pages/projects?per_page=50");
      const allProjects=Array.isArray(discovered.result)?discovered.result:[];
      report.projectDiscovery={status:discovered.status,success:discovered.success,projectCount:allProjects.length,candidates:allProjects.filter(x=>/gwap/i.test(String(x.name||"")+String(x.subdomain||""))).map(x=>({name:x.name,subdomain:x.subdomain}))};
      const target=allProjects.find(x=>x.subdomain==="gwap-landing.pages.dev")||allProjects.find(x=>x.name==="gwap-landing");
      if(!target)continue;
      const p=await cf("/accounts/"+encodeURIComponent(a.id)+"/pages/projects/"+encodeURIComponent(target.name));
      report.projectGetStatus=p.status;
      if(!p.success)continue;
      report.projectFound=true;
      report.projectInfo={productionBranch:p.result?.production_branch,subdomain:p.result?.subdomain,created:p.result?.created_on,latestDeploymentId:p.result?.latest_deployment?.id||null,latestDeploymentHash:p.result?.latest_deployment?.deployment_trigger?.metadata?.commit_hash||null};
      const deployments=await cf("/accounts/"+encodeURIComponent(a.id)+"/pages/projects/"+encodeURIComponent(target.name)+"/deployments?per_page=5");
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
if (token) {
  try {
    const zones=await cf("/zones?name=gwapgang.com");
    const zoneList=Array.isArray(zones.result)?zones.result:[];
    const zone={status:zones.status,success:zones.success,found:zoneList.length>0};
    if(zoneList.length){
      const id=encodeURIComponent(zoneList[0].id);
      const phases=["http_request_firewall_custom","http_request_firewall_managed"];
      zone.rules=[];
      for(const phase of phases){
        const answer=await cf("/zones/"+id+"/rulesets/phases/"+phase+"/entrypoint");
        const rows=Array.isArray(answer.result?.rules)?answer.result.rules:[];
        zone.rules.push({phase,status:answer.status,success:answer.success,
          count:rows.length,
          mentionsBlog:rows.filter(x=>String(x.expression||"").includes("/blog")).length,
          challengeOrBlock:rows.filter(x=>/challenge|block/i.test(String(x.action||""))).length
        });
      }
    }
    console.log("CLOUDFLARE_ZONE_TRIAGE "+JSON.stringify(zone));
  } catch(e) { console.log("CLOUDFLARE_ZONE_TRIAGE "+JSON.stringify({error:String(e?.name||"network_error")})); }
}

console.log("CLOUDFLARE_PAGES_METADATA "+JSON.stringify(report));

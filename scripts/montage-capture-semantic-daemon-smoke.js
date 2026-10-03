"use strict";
// Actual daemon verification branch with a synthetic JSX VM panel. No live AE.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {startDaemon,pollPanel,commandEcho,pause}=require("./network-test-fixture"),{createVisualProject}=require("./placeholder-visual-fixture");
async function main(){const project=createVisualProject();let replacements=0;
 const fixture=await startDaemon({automationToken:"semantic-auto",panelToken:"semantic-panel",adminToken:"semantic-admin",devAdmin:true,commandTimeoutMs:4000,
  setupRuntime(runtime){fs.writeFileSync(path.join(runtime,"logs","edit-session-active.json"),JSON.stringify({id:"synthetic-semantic-session",status:"active",checkpoint:{sourceFile:"C:/Synthetic/Protected.aep"},operations:[]}));}});
 async function withPanel(action){let done=false,response,error;await pollPanel(fixture,{projectFile:project.read("app.project.file.fsName")});const promise=action().then(r=>{response=r;done=true;},e=>{error=e;done=true;});const deadline=Date.now()+30000;
  while(!done && Date.now()<deadline){const p=await pollPanel(fixture,{projectFile:project.read("app.project.file.fsName")}),c=p.body.command;if(!c){await pause(10);continue;}
   if(c.script.includes("replaceSource("))replacements++;const echo=commandEcho(c);assert.equal((await fixture.request({path:"/bridge/submitted",token:fixture.panelToken,body:echo})).status,200);
   const raw=project.execute(c.script);assert.equal((await fixture.request({path:"/bridge/result",token:fixture.panelToken,body:{...echo,ok:true,result:JSON.stringify(raw)}})).status,200);
  }assert(done,"bounded synthetic daemon deadline");await promise;if(error)throw error;return response;
 }
 const post=(route,body)=>fixture.request({path:route,token:fixture.panelToken,body,timeoutMs:30000});
 try{
  const plan={summary:"Synthetic exact source replacement",targetProject:{file:"C:/Synthetic/Protected.aep"},risk:"high",requiresCheckpoint:true,steps:[
   {tool:"replace_layer_source",args:{compItemIndex:1,compName:project.read("child.name"),layerIndices:[1],sourceItemIndex:4,sourceItemName:project.read("b.name"),sourceItemType:"footage",expectedCompItemId:10,expectedLayerId:11,expectedPreviousSourceItemId:100,expectedSourceItemId:101}},
   {tool:"get_layer_details",args:{compItemId:10,layerId:11,responseView:"placeholder"}},{tool:"get_project_info",args:{}}]};
  const proposed=await withPanel(()=>post("/agents/plan/propose",{plan}));assert.equal(proposed.status,200,proposed.text);const a=proposed.body.proposal;assert(a,proposed.text);
  const dry=await withPanel(()=>post("/agents/plan/run",{actionId:a.actionId,dryRun:true}));assert(dry.body.run.ok,dry.text);assert.equal(replacements,0);
  const r=await withPanel(()=>post("/agents/plan/run",{actionId:a.actionId,payloadHash:a.action.payloadHash,previewHash:a.action.previewHash,riskLevel:a.risk.level,riskPolicyVersion:a.confirmation.riskPolicyVersion,confirmationToken:a.confirmation.confirmationToken,confirmedBySurface:a.confirmation.surface,dryRun:false,confirm:true,allowMutations:true}));
  assert(r.body.run,r.text);const run=r.body.run;assert.equal(run.ok,true,JSON.stringify(run.semanticVerification));assert.equal(run.semanticVerification.status,"passed");assert.equal(replacements,1);assert.equal(project.read("target.source.id"),101);
  const step=run.steps[0];assert.equal(step.independentReadBack.length,1);assert.equal(step.independentReadBack[0].source,"server_typed_readback");assert.equal(step.independentReadBack[0].tool,"get_layer_details");assert.deepEqual(step.independentReadBack[0].args,{compItemId:10,layerId:11});
  assert.equal(step.result.verification.ok,true);assert.equal(step.result.verification.readBack[0].result.layer.source.itemId,101);
  console.log("PASS: isolated actual daemon replacement attaches immediate exact typed source read; full native source + compact corroboration verify; one synthetic mutation, liveAE0.");
 }finally{await fixture.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

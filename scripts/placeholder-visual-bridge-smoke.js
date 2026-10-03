#!/usr/bin/env node
"use strict";
const assert=require("assert/strict"),fs=require("fs"),path=require("path");
const {startDaemon,pollPanel,commandEcho,pause}=require("./network-test-fixture");
const {createVisualProject,request}=require("./placeholder-visual-fixture");
async function main(){
 const project=createVisualProject();let serviceMutations=0;
 const fixture=await startDaemon({automationToken:"visual-auto",panelToken:"visual-panel",adminToken:"visual-admin",devAdmin:true,commandTimeoutMs:4000,
 setupRuntime(runtime){fs.writeFileSync(path.join(runtime,"logs","edit-session-active.json"),JSON.stringify({id:"visual-synthetic-session",status:"active",checkpoint:{sourceFile:"C:/Synthetic/Protected.aep"},operations:[]}));}});
 const post=(route,body,token=fixture.panelToken)=>fixture.request({path:route,token,body,timeoutMs:30000});
 async function withPanel(action){let done=false,response,error;await pollPanel(fixture,{projectFile:project.read('app.project.file.fsName')});const pending=action().then(value=>{response=value;done=true;},value=>{error=value;done=true;});const deadline=Date.now()+35000;
  while(!done && Date.now()<deadline){const polled=await pollPanel(fixture,{projectFile:project.read('app.project.file.fsName')});const command=polled.body.command;if(!command){await pause(10);continue;}
   const script=command.script;assert(script.includes("bitsPerChannel: project ? project.bitsPerChannel") || script.includes("__codexPlaceholderInventory") || script.includes("__phReadService") || script.includes("__phGeometry") || script.includes("sameNameLayerCount: sameNameLayers.length") || script.includes("saveFrameToPng") || script.includes("review_items_require_exact_registered_cleanup"),"Bounded fake panel rejects unexpected command");
   if(script.includes('app.beginUndoGroup("Codex Create Placeholder Review")') || script.includes('app.beginUndoGroup("Codex Cleanup Placeholder Review")'))serviceMutations++;
   const echo=commandEcho(command);assert.equal((await post("/bridge/submitted",echo)).status,200);const raw=project.execute(script);const result=await post("/bridge/result",{...echo,ok:true,result:JSON.stringify(raw)});assert.equal(result.status,200,result.text);
  }
  assert(done,"Bounded fake panel deadline exceeded");await pending;if(error)throw error;return response;
 }
 async function call(name,args={},isError=false){const response=await withPanel(()=>post("/tools/call",{name,arguments:args},fixture.automationToken));assert.equal(response.status,200,response.text);const result=response.body.result;assert.equal(Boolean(result.isError),isError,JSON.stringify(result));return JSON.parse(result.content[0].text);}
 async function direct(name,args,isError=false){const response=await withPanel(()=>post("/dev/tool/"+name,args,fixture.adminToken));assert.equal(response.status,isError ? 500 : 200,response.text);return response.body.result ? JSON.parse(response.body.result.content[0].text) : response.body;}
 try{
  const catalog=await fixture.request({path:"/tools",token:fixture.automationToken});const names=new Set(catalog.body.tools.map(tool=>tool.name));for(const name of ["propose_placeholder_cover","verify_placeholder_coverage","build_placeholder_visual_review_plan","create_placeholder_review_comps","get_placeholder_review_manifest","verify_placeholder_visual_review"])assert(names.has(name));
  assert.equal(serviceMutations,0);
  const coverage=await call("verify_placeholder_coverage",{target:{compItemId:10,layerId:11}});assert(coverage.covered && coverage.eligible);assert(!coverage.artisticAccepted);
  const build=await call("build_placeholder_visual_review_plan",request);assert(build.ok,JSON.stringify(build));assert.equal(build.plan.steps.length,7);assert.deepEqual(build.plan.steps.at(-1),{tool:"get_project_info",args:{}});assert(build.plan.steps.every(step=>names.has(step.tool)));assert.equal(serviceMutations,0);
  const proposal=await withPanel(()=>post("/agents/plan/propose",{plan:build.plan}));assert(proposal.body.proposal,proposal.text);const preview=await withPanel(()=>post("/agents/plan/run",{actionId:proposal.body.proposal.actionId,dryRun:true}));assert(preview.body.run.ok,preview.text);assert.equal(serviceMutations,0);
  const accepted=await withPanel(()=>post("/placeholder/protection",{action:"accept"}));assert.equal(accepted.status,200,accepted.text);
  const action=proposal.body.proposal;
  const execution=await withPanel(()=>post("/agents/plan/run",{actionId:action.actionId,payloadHash:action.action.payloadHash,previewHash:action.action.previewHash,riskLevel:action.risk.level,riskPolicyVersion:action.confirmation.riskPolicyVersion,confirmationToken:action.confirmation.confirmationToken,confirmedBySurface:action.confirmation.surface,dryRun:false,confirm:true,allowMutations:true}));
  assert.equal(execution.body.run.ok,true,JSON.stringify(execution.body.run.semanticVerification));assert.equal(execution.body.run.semanticVerification.status,"passed");assert(execution.body.run.semanticVerification.readBackCount>0);
  assert(execution.body.run,execution.text);const first=execution.body.run.steps[0];const created=first.result;assert(created && created.registered && created.owner,JSON.stringify(first));assert.equal(created.items.length,4);assert.equal(serviceMutations,1);assert.equal(project.read('child.numLayers+root.numLayers'),3);
  const acceptedAfter=await call("get_placeholder_protection");assert(acceptedAfter.drift[0].ok,JSON.stringify(acceptedAfter.drift));
  const usage=await call("get_placeholder_usage",{roots:[{compItemId:20}]});assert(usage.complete);assert.equal(usage.scope.excludedReviewItemIds.length,4);
  assert.equal(execution.body.run.steps.length,7,execution.text);
  for(const step of execution.body.run.steps.slice(1,5)){assert(step.result.file.sha256 && step.result.resolutionFactor.restored);}
  const manifest=await call("get_placeholder_review_manifest",{owner:created.owner});assert.equal(manifest.manifest.frames.length,3);assert(manifest.manifest.frames.every(frame=>frame.image));assert(!JSON.stringify(manifest.manifest).includes("Synthetic/a.mp4"));assert.equal(manifest.inspectionReason,"inspection_images_outside_workspace");
  for(const change of ['target.startTime=0.1;','a.file.fsName="C:/Synthetic/relinked.mp4";','target.source=b;']){
   project.change(change);const changed=await call("get_placeholder_review_manifest",{owner:created.owner},true);assert(["review_content_changed_after_capture","stale_review_sample_mapping","review_source_changed"].includes(changed.code),JSON.stringify(changed));project.change('target.startTime=0;a.file.fsName="C:/Synthetic/a.mp4";target.source=a;');
  }
  project.change('failRender=true;');const failedRender=await withPanel(()=>post("/dev/tool/save_comp_frame_png",{reviewOwner:created.owner,reviewItemId:created.items[0].itemId,time:0,outputFileName:"synthetic-render-failure.png"},fixture.adminToken));assert.equal(failedRender.status,500);assert.deepEqual(project.read('items.filter(function(item){return item.id==='+created.items[0].itemId+';})[0].resolutionFactor'),[2,2]);project.change('failRender=false;');
  project.change('target.property("ADBE Transform Group").property("ADBE Position").value=[2,2];');const drift=await call("get_placeholder_review_manifest",{owner:created.owner},true);assert.equal(drift.code,"review_content_changed_after_capture");
  project.change('target.property("ADBE Transform Group").property("ADBE Position").value=[960,540];items.unshift(new CompItem(900,"Index shift"));child._layers.reverse();target.index=2;other.index=1;');
  const moved=await call("get_placeholder_review_manifest",{owner:created.owner});assert.equal(moved.manifest.frames.length,3);
  project.change('items.filter(function(item){return item.name.indexOf("AE_AGENT_REVIEW_")===0;})[0].comment="foreign";');const dirty=await call("get_placeholder_protection");assert(!dirty.drift[0].ok,"Unverified service ID is not excluded from protected dependency closure");
  const bad=await call("get_placeholder_review_manifest",{owner:created.owner},true);assert.equal(bad.code,"review_artifact_drift");
  project.change(`items.filter(function(item){return item.name.indexOf("AE_AGENT_REVIEW_")===0;})[0].comment=${JSON.stringify("AE_AGENT_REVIEW:v1:"+acceptedAfter.projectKey+":"+created.owner)};`);
  const foreign=await withPanel(()=>post("/dev/tool/cleanup_test_items",{namePrefix:"AE_",confirm:true},fixture.adminToken));assert.equal(foreign.status,500);assert.equal(serviceMutations,1);
  // Wrong ID set is rejected before a deletion command.
  const wrong=await withPanel(()=>post("/dev/tool/cleanup_test_items",{owner:created.owner,itemIds:[created.items[0].itemId],confirm:true},fixture.adminToken));assert.equal(wrong.status,500);assert(wrong.text.includes("exact_registered_ids"));assert.equal(serviceMutations,1);
  const cleanup=await withPanel(()=>post("/dev/tool/cleanup_test_items",{owner:created.owner,itemIds:created.items.map(item=>item.itemId),confirm:true},fixture.adminToken));assert.equal(cleanup.status,200,cleanup.text);const removed=cleanup.body.result;assert(removed.absenceVerified);assert.equal(serviceMutations,2);assert.equal(project.read('items.length'),5);
  const after=await call("get_placeholder_protection");assert.equal(Object.keys(after.reviewArtifacts).length,0);assert(after.drift[0].ok,JSON.stringify(after.drift));
  console.log("PASS: isolated actual catalog/schema/ordinary plan preview, server UUID registration, native PNG exports/hash/restore, source/time/transform drift, stable index movement, verified-only protection/usage exclusions, exact cleanup/unregister; no live AE/CEP/provider.");
 }finally{await fixture.stop();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

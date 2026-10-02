#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {runMontageBridgeSmoke}=require("./montage-pipeline-bridge-smoke");
const {createVisualProject}=require("./placeholder-visual-fixture");
const {startDaemon,pollPanel,commandEcho,pause}=require("./network-test-fixture");
const {ROOT_FRESHNESS_BLOCKED,CAPTURE_BINDING_BLOCKER}=require("../mcp-server/montage-root-png");
const projectMemory=require("../mcp-server/project-intent-memory");

async function ownerRootProof(){
 const project=createVisualProject({nativeFilesystem:true});
 project.change(`target.stretch=200;target.outPoint=6;child.frameRate=root.frameRate=a.frameRate=b.frameRate=30;
  var exportCount=0;var saveFrame=CompItem.prototype.saveFrameToPng;CompItem.prototype.saveFrameToPng=function(t,f){exportCount++;return saveFrame.call(this,t,f);};`);
 const fixture=await startDaemon({automationToken:"m5-owner-auto",panelToken:"m5-owner-panel",adminToken:"m5-owner-admin",devAdmin:true,commandTimeoutMs:5000,
  setupRuntime(runtime){fs.writeFileSync(path.join(runtime,"logs","edit-session-active.json"),JSON.stringify({id:"m5-owner-session",status:"active",checkpoint:{sourceFile:project.read("app.project.file.fsName")},operations:[]}));}});
 const post=(route,body,token=fixture.panelToken)=>fixture.request({path:route,token,body,timeoutMs:30000});
 let hook=null;
 async function withPanel(action){let done=false,response,error;await pollPanel(fixture,{projectFile:project.read("app.project.file.fsName")});
  const pending=action().then(r=>{response=r;done=true;},e=>{error=e;done=true;});const deadline=Date.now()+35000;
  while(!done && Date.now()<deadline){const polled=await pollPanel(fixture,{projectFile:project.read("app.project.file.fsName")}),command=polled.body.command;
   if(!command){await pause(10);continue;}if(hook)hook(command.script);
   const echo=commandEcho(command);assert.equal((await post("/bridge/submitted",echo)).status,200);
   const raw=project.execute(command.script);assert.equal((await post("/bridge/result",{...echo,ok:true,result:JSON.stringify(raw)})).status,200);
  }
  assert(done,"M5 fake panel deadline");await pending;if(error)throw error;return response;
 }
 async function call(name,args={},isError=false){const response=await withPanel(()=>post("/tools/call",{name,arguments:args},fixture.automationToken));
  assert.equal(response.status,200,response.body?.code);const result=response.body.result,payload=JSON.parse(result.content[0].text);
  assert.equal(Boolean(result.isError),isError,payload.code);return payload;
 }
 async function direct(args,error=false){const response=await withPanel(()=>post("/dev/tool/save_comp_frame_png",args,fixture.adminToken));
  assert.equal(response.status,error ? 500 : 200,response.body?.code || response.body?.error);
  return response.body.result ?? response.body;
 }
 try{
  const accepted=await withPanel(()=>post("/placeholder/protection",{action:"accept"}));assert.equal(accepted.status,200,accepted.body?.error);
  assert.equal((await call("get_placeholder_protection")).acceptedPlaceholders[0].timing.stretch,200);
  const samples=[0,89/30,179/30].map((rootTime,i)=>({rootTime,targetTime:rootTime,sourceTime:rootTime/2,roles:[["first"],["middle"],["last"]][i]}));
  const request={targets:[{target:{compItemId:10,layerId:11},rootCompItemId:20,routeLayerIds:[21],samples,viewKinds:["root_comp"]}]};
  const built=await call("build_placeholder_visual_review_plan",request);assert.equal(built.ok,true);
  const wrongMapping=JSON.parse(JSON.stringify(request));wrongMapping.targets[0].samples[2].sourceTime+=0.001;
  assert.equal((await call("build_placeholder_visual_review_plan",wrongMapping,true)).code,"stale_review_sample_mapping");
  const wrongGrid=JSON.parse(JSON.stringify(request));wrongGrid.targets[0].samples[0]={rootTime:0.01,targetTime:0.01,sourceTime:0.005,roles:["first"]};
  assert.equal((await call("build_placeholder_visual_review_plan",wrongGrid,true)).code,"affine_review_sample_off_grid");
  const proposed=await withPanel(()=>post("/agents/plan/propose",{plan:built.plan}));assert.equal(proposed.status,200,proposed.body?.code);
  const action=proposed.body.proposal;
  const preview=await withPanel(()=>post("/agents/plan/run",{actionId:action.actionId,dryRun:true}));assert.equal(preview.body.run.ok,true,preview.body.run.errorCode);
  const executed=await withPanel(()=>post("/agents/plan/run",{actionId:action.actionId,payloadHash:action.action.payloadHash,previewHash:action.action.previewHash,
   riskLevel:action.risk.level,riskPolicyVersion:action.confirmation.riskPolicyVersion,confirmationToken:action.confirmation.confirmationToken,confirmedBySurface:action.confirmation.surface,
   dryRun:false,confirm:true,allowMutations:true}));
  assert(executed.body.run.steps.every(s=>s.status==="completed"),executed.body.run.errorCode);
  const created=executed.body.run.steps[0].result;assert(created.registered && created.owner);
  const state=projectMemory.readProjectState(project.read("app.project.file.fsName"),{statePath:path.join(fixture.runtimeDir,"state","project-intent-state.json")});
  const spec=state.reviewArtifacts[created.owner].spec;
  assert.equal(spec.targets[0].layer.stretch,200);assert.equal(spec.targets[0].samples.at(-1).sourceTime,179/60);
  const controls=spec.controls.map(control=>created.items.find(row=>row.name===control.name));assert.equal(controls.length,3);assert(controls.every(Boolean));
  for(let i=0;i<controls.length;i++){
   const actual=project.read(`items.filter(function(item){return item.id===${controls[i].itemId};})[0]._layers[0] && (function(){var c=items.filter(function(item){return item.id===${controls[i].itemId};})[0],l=c._layers[0];return {sourceId:l.source.id,start:l.startTime,stretch:l.stretch};})()`);
   assert.equal(actual.sourceId,20);assert(Math.abs(actual.start+samples[i].rootTime)<1e-12);assert.equal(actual.stretch,100);
   const image=executed.body.run.steps[i+1].result;assert.equal(image.comp.itemId,controls[i].itemId);assert(image.file.sha256 && image.file.pngComplete && image.resolutionFactor.restored);
   assert.deepEqual(image.rootFreshness,ROOT_FRESHNESS_BLOCKED);
  }
  assert.equal(project.read("target.stretch"),200);
  const manifest=await call("get_placeholder_review_manifest",{owner:created.owner});assert.equal(manifest.manifest.frames.length,3);
  const index=project.read("items.indexOf(root)+1"),base={compItemIndex:index,expectedCompItemId:20,time:0,outputFileName:"m5-stable-root.png",idempotencyKey:"m5-root-capture",idempotencyScope:"m5-test"};
  const before=project.read("exportCount");await direct({...base,expectedCompItemId:999,outputFileName:"m5-wrong-id.png"},true);
  assert.equal(project.read("exportCount"),before);assert.equal(fs.existsSync(path.join(fixture.runtimeDir,"generated-exports","m5-wrong-id.png")),false);
  const image=await direct(base);assert.equal(image.comp.itemId,20);assert.equal(image.file.pngComplete,true);assert.equal(image.captureBinding.code,CAPTURE_BINDING_BLOCKER);
  assert.deepEqual(image.rootFreshness,ROOT_FRESHNESS_BLOCKED);
  project.change("root.id=201;");const count=project.read("exportCount");await direct(base,true);assert.equal(project.read("exportCount"),count);project.change("root.id=20;");
  await direct(base,true);assert.equal(project.read("exportCount"),count,"Unknown root graph prohibits cache reuse");
  for(const time of [10,0.01]){await direct({...base,time,outputFileName:"m5-time-negative.png",idempotencyKey:`time-${time}`},true);assert.equal(project.read("exportCount"),count);}
  hook=script=>{if(script.includes("saveFrameToPng")){hook=null;project.change("root.id=201;");}};
  await direct({...base,outputFileName:"m5-native-race.png",idempotencyKey:"race"},true);assert.equal(project.read("exportCount"),count);project.change("root.id=20;");
  assert.equal(fs.existsSync(path.join(fixture.runtimeDir,"generated-exports","m5-native-race.png")),false);
  console.log("PASS: M5 actual owner root_comp mapping/registration, PNG full SHA/IEND/restore/stable ID/grid/native race/cache blockers; no canonical render binding or artistic proof");
 }finally{await fixture.stop();}
}
async function main(){
 const proof=await runMontageBridgeSmoke({stretch:200});assert.equal(proof.technical,"passed");assert.equal(proof.stretch,200);
 assert(proof.rootPackets.length>0);assert(proof.rootPackets.every(p=>p.completeRootRenderState===false && p.rootFreshness.code==="unsupported_unknown_render_graph" && p.captureBinding.code===CAPTURE_BINDING_BLOCKER));
 await ownerRootProof();
}
module.exports={main,ownerRootProof};
if(require.main===module)main().catch(error=>{console.error("M5 affine bridge proof failed:",error.message);console.error(String(error.stack).split("\n").filter(s=>s.includes(" at ")).slice(0,3).join("\n"));process.exitCode=1;});

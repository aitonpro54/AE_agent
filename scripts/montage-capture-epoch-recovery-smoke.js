"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto");
const helper=require("../mcp-server/plan-run-reconciliation"),semantic=require("../mcp-server/semantic-verification"),{sha256}=require("../mcp-server/review-evidence"),{normalizeProject}=require("../mcp-server/proposal-state");
const capture=require("../mcp-server/montage-capture-service");
const copy=v=>JSON.parse(JSON.stringify(v));let passed=0;function test(name,fn){try{fn();passed++;}catch(e){console.error(name);throw e;}}
function fixture(){const runId=crypto.randomUUID(),commandId=crypto.randomUUID(),applicationRunId=crypto.randomUUID(),file="C:/Synthetic/epoch-project.aep",projectKey=sha256(normalizeProject(file));
 const args={sourceItemId:2,applicationRunIds:[applicationRunId]},safe={...args,verifyAfter:true,idempotencyKey:"epoch-test",idempotencyScope:"epoch-test"};
 const plan={steps:[{tool:"reload_montage_material_source",args}]},provenance={schema:"ae-agent-run-provenance.v1",actionId:"server-epoch-action",proposalRevision:2,planSha256:sha256(plan),projectId:projectKey};
 const facts={sourceItemId:2,file:"C:/Synthetic/source.mp4",ownedTargets:[{compItemId:5,layerId:17}]},nativeBracket={nativeReload:{schema:"ae-agent-native-source-reload.v1",operationExecuted:true,before:facts,after:facts,readerId:crypto.randomUUID()}},independentNativeRead={nativeReload:{...nativeBracket.nativeReload,operationExecuted:false,readerId:crypto.randomUUID()}};
 const epoch={schema:"ae-agent-native-source-load-epoch.v1",epochId:crypto.randomUUID(),commandId,runId,actionId:provenance.actionId,proposalRevision:2,planSha256:provenance.planSha256,stepIndex:1,sourceItemId:2,projectKey,sha256:"a".repeat(64),byteLength:12,nativeOperation:"reload",independentReadBackVerified:true,ownedUsedInComplete:true,
 scope:{sourceItemId:2,projectFile:file,applicationRunIds:[applicationRunId]},nativeBracket,independentNativeRead};
 const current={ok:true,epoch},result={ok:true,sourceLoadEpoch:epoch,verification:{ok:true,scope:"independent_native_source_load_epoch",sourceLoadEvidence:current}};
 const step={index:1,tool:"reload_montage_material_source",args:{},status:"completed",result,commands:[{id:commandId,role:"mutation",state:"completed",ok:true,result:nativeBracket}]};
 const record={schema:"ae-agent-plan-run-record.v1",runId,project:{file},plan,run:{id:runId,provenance,steps:[step],validation:{steps:[{index:1,tool:step.tool,args,safeArgs:safe}]},ok:false,dryRun:false,errorCode:"verification_required",error:"Historical aggregate verification failure"}};
 return {record,args,safe,current,epoch,file};
}
test("empty executed args recover only exact stored validated plan plus bound native epoch",()=>{const f=fixture(),before=copy(f.record);assert.deepEqual(helper.recoverReloadArguments(f.record,1),f.safe);assert.deepEqual(helper.reconciliationReadRequests(f.record),[{stepIndex:1,tool:"get_montage_source_load_evidence",args:{sourceItemId:2}}]);assert.deepEqual(f.record,before);});
for(const edit of [f=>{f.record.run.steps[0].args={wrong:true};},f=>{delete f.record.run.validation;},f=>{f.record.run.validation.steps[0].safeArgs.sourceItemId=3;},f=>{f.epoch.runId=crypto.randomUUID();},f=>{f.epoch.actionId="foreign";},f=>{f.epoch.proposalRevision++;},f=>{f.epoch.planSha256="b".repeat(64);},f=>{f.epoch.stepIndex=2;},f=>{f.epoch.commandId=crypto.randomUUID();},f=>{f.epoch.projectKey="b".repeat(64);},f=>{f.epoch.scope.applicationRunIds=[crypto.randomUUID()];},f=>{f.epoch.nativeBracket.nativeReload.operationExecuted=false;},f=>{f.record.run.steps[0].commands[0].state="timed_out";},f=>{f.record.run.steps[0].commands[0].result={foreign:true};}])
 test("missing/stale/foreign/mismatched reload proof cannot reconstruct args",()=>{const f=fixture();edit(f);assert.equal(helper.recoverReloadArguments(f.record,1),null);assert.doesNotThrow(()=>sha256(helper.reconciliationReadRequests(f.record)));});
test("fresh read-only reconciliation proves historical reload without changing failure or replay",()=>{const f=fixture(),before=copy(f.record),r=helper.reconcilePlanRun({record:f.record,project:{file:f.file},freshReadSteps:[{tool:"get_project_info",status:"completed",result:{file:f.file}},{tool:"get_montage_source_load_evidence",args:{sourceItemId:2},status:"completed",result:f.current}]});
 assert.equal(r.steps[0].mutationStatus,"applied");assert.equal(r.steps[0].verificationStatus,"passed");assert(r.steps[0].argumentsRecovery);assert.equal(r.originalError.code,"verification_required");assert.equal(r.replayAllowed,false);assert.deepEqual(f.record,before);});
for(const [field,value] of [["actionId",undefined],["actionId",""],["actionId"," "],["actionId","x".repeat(257)],["proposalRevision",undefined],["proposalRevision",0],["proposalRevision",1.5],["proposalRevision",Number.MAX_SAFE_INTEGER+1],["planSha256",undefined],["planSha256","bad"],["runId",undefined],["runId","bad"],["stepIndex",0]])
 test("missing-both/invalid tuple cannot validate epoch, recover args, or pass semantic/reconcile: "+field+"="+value,()=>{const f=fixture(),p=f.record.run.provenance;
  if(value===undefined)delete f.epoch[field];else f.epoch[field]=value;
  if(field==="runId"){f.record.run.id=value;f.record.runId=value;}else if(field==="stepIndex"){f.record.run.steps[0].index=value;}else if(value===undefined)delete p[field];else p[field]=value;
  assert.throws(()=>capture.validateLoadEpoch(f.epoch,{projectKey:f.epoch.projectKey}),/invalid_native_source_load_epoch/);
  assert.equal(helper.recoverReloadArguments(f.record,1),null);
  f.record.run.steps[0].args=f.safe;assert.notEqual(semantic.buildSemanticVerification(f.record.plan,f.record.run).status,"passed");
  const reconciled=helper.reconcilePlanRun({record:f.record,project:{file:f.file},freshReadSteps:[{tool:"get_project_info",status:"completed",result:{file:f.file}},{tool:"get_montage_source_load_evidence",args:{sourceItemId:2},status:"completed",result:f.current}]});
  assert.equal(reconciled.steps?.some(s=>s.verificationStatus==="passed"),false);assert.equal(reconciled.replayAllowed,false);
 });
test("new properly recorded reload includes one genuine server-attached source read",()=>{const f=fixture(),run=f.record.run,step=run.steps[0];step.args=f.safe;run.ok=true;
 step.independentReadBack=[{index:2,tool:"get_montage_source_load_evidence",args:{sourceItemId:2},status:"completed",result:f.current,source:"server_typed_readback",observedAt:"2026-10-03T00:00:00.000Z"}];
 const s=semantic.buildSemanticVerification(f.record.plan,run);assert.equal(s.status,"passed");assert.equal(s.readBackCount,1);
 for(const edit of [x=>{x.run.provenance.proposalRevision++;},x=>{x.run.provenance.planSha256="c".repeat(64);},x=>{x.run.steps[0].args={};},x=>{x.run.steps[0].independentReadBack[0].source="client";},x=>{x.run.steps[0].independentReadBack[0].args.sourceItemId=3;},x=>{x.run.steps[0].independentReadBack[0].status="failed";}]){const changed=copy(f.record);edit(changed);assert.notEqual(semantic.buildSemanticVerification(changed.plan,changed.run).status,"passed");}
});
console.log(`PASS: ${passed} exact source epoch args recovery/binding and future server-attached read cases; nativeAE0, immutable writes0.`);

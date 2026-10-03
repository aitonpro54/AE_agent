"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const capture=require("../mcp-server/montage-capture-service"),{compileMontagePipeline}=require("../mcp-server/montage-pipeline");
const {createValidMontageFixture,createPlanRunRecordFixture}=require("./montage-fixture"),{policyHash}=require("../mcp-server/montage-plan-guard");
const {deepClone,stableJson}=require("../mcp-server/montage-contract"),{createVisualProject}=require("./placeholder-visual-fixture");
let count=0;function test(name,fn){try{fn();count++;}catch(e){console.error(name);throw e;}}
function baseline(){const fixture=createValidMontageFixture(),state={...fixture.manifest.project,projectKey:fixture.manifest.project.projectKey,revision:fixture.manifest.project.revision,
 acceptedPlaceholders:[],groupMappings:[],constraints:null,reviewArtifacts:{}};
 for(const t of fixture.observations.targets)t.protection.policyHash=policyHash(state);
 const c=compileMontagePipeline(fixture);assert(c.ok,JSON.stringify(c.blockers));const unit=c.units[0],record=createPlanRunRecordFixture({unit});
 record.run.ok=true;record.run.dryRun=false;record.run.semanticVerification={status:"passed",unverifiedMutationCount:0};return {state,unit,record,binding:capture.resolveApplicationRecord(record,state)};}
test("persisted application authority retains exact canonical frame selection",()=>{const {record,state,binding}=baseline();assert.equal(binding.applicationRunId,record.runId);assert.equal(binding.planSha256,record.run.provenance.planSha256);assert.equal(binding.unitContentHash,record.plan.montagePipeline.unitContentHash);
 assert.deepEqual(capture.resolveApplicationRecord(record,state,[binding.frames[1].frameId]).frames,[binding.frames[1]]);assert.deepEqual(capture.canonicalReviewInput(binding).targets[0].samples[0].canonicalFrame,binding.frames[0]);});
for(const change of [r=>{delete r.plan.montagePipeline.captureRequirements;},r=>{r.run.ok=false;},r=>{r.run.dryRun=true;},r=>{r.run.steps[0].status="unknown";},r=>{r.run.semanticVerification.status="needs_review";},r=>{r.run.provenance.planSha256="f".repeat(64);},r=>{r.plan.montagePipeline.captureRequirements.frameRequirements[0].rootTime+=1;},r=>{r.plan.montagePipeline.unitContentHash="f".repeat(64);}])
 test("legacy/stale/foreign application cannot become capture proof",()=>{const {record,state}=baseline();change(record);assert.throws(()=>capture.resolveApplicationRecord(record,state));});
test("foreign duplicate frame selection rejected",()=>{const {record,state,binding}=baseline();assert.throws(()=>capture.resolveApplicationRecord(record,state,["foreign"]));assert.throws(()=>capture.resolveApplicationRecord(record,state,[binding.frames[0].frameId,binding.frames[0].frameId]));});
test("original exact policy/revision is never semantically waived",()=>{const {record,state}=baseline();state.revision++;assert.throws(()=>capture.resolveApplicationRecord(record,state),/canonical_original_policy_revision_changed/);});
test("bounded actual emitted root GUID probe remains diagnostic and fails closed for unknown thread",()=>{const f=require("./montage-native-fixture").createMontageNativeFixture();try{
 f.change('app.project.revision=1;app.project.colorManagementSystem=0;var guidReads=[];CompItem.prototype.getRenderGUID=function(time,thread,trace){guidReads.push({id:this.id,time:time,thread:thread,trace:trace});return "01234567-89ab-cdef-0123-456789abcdef";};FootageItem.prototype.getRenderGUID=CompItem.prototype.getRenderGUID;');
 const read=()=>f.execute(`JSON.stringify((function(){${capture.nativeRootProbeScript(100,[1.2])}})())`);
 const blocked=read();assert.equal(blocked.completeRootRenderState,false);assert.equal(blocked.nativeGUID.state.complete,false);assert(blocked.nativeGUID.state.samples.every(s=>s.items.every(r=>r.guid===null)));assert.equal(f.getWrites(),0);
 f.change('var ProjectThread={MainThread:17};');const observed=read();assert.equal(observed.completeRootRenderState,false);assert(observed.nativeGUID.state.samples.some(s=>s.rootTime===1.2 && s.items.some(r=>r.itemId===100 && r.guid)));assert.equal(f.getWrites(),0);
 f.change('CompItem.prototype.getRenderGUID=function(){return {wait:function(){return "not-a-guid";}};};');assert(read().nativeGUID.state.samples.every(s=>s.items.filter(r=>r.kind==="comp").every(r=>r.guid===null)));assert.equal(f.getWrites(),0);
}finally{f.cleanup();}});
test("only own registration/image additions may advance owner revision",()=>{const {binding,state}=baseline(),owner=crypto.randomUUID(),record={owner,canonicalBinding:binding};
 capture.registerOwnerPolicy(record,state);state.revision++;state.reviewArtifacts[owner]=record;capture.assertOwnerPolicy(record,state);
 capture.advanceOwnerPolicy(record,state);state.revision++;capture.assertOwnerPolicy(record,state);
 for(const edit of [s=>{s.revision++;},s=>{s.constraints={manual:true};},s=>{s.reviewArtifacts[crypto.randomUUID()]={foreign:true};}]){const changed=deepClone(state);edit(changed);assert.throws(()=>capture.assertOwnerPolicy(record,changed),/policy_transition_changed/);}
 assert.equal(record.capturePolicy.originalPolicyHash,binding.originalPolicy.sha256);assert.equal(record.capturePolicy.originalRevision,binding.originalPolicy.revision);});
test("one proposal session authorizes only exact complete stored-run peer partitions",()=>{
 const base=baseline(),fixture=createValidMontageFixture();for(const t of fixture.observations.targets)t.protection.policyHash=policyHash(base.state);
 const compiled=compileMontagePipeline(fixture),records=compiled.units.map(u=>{const r=createPlanRunRecordFixture({unit:u,runId:crypto.randomUUID()});r.run.ok=true;r.run.dryRun=false;r.run.semanticVerification={status:"passed",unverifiedMutationCount:0};return r;});
 const all=capture.resolveApplicationRecords(records,base.state),ids=records.map(r=>r.runId),frames=all.applications.map(b=>b.frames.map(f=>f.frameId)),plan={steps:frames.map(frameIds=>({tool:"create_placeholder_review_comps",args:{applicationRunIds:ids,frameIds}}))};
 const execution={runId:crypto.randomUUID(),actionId:"server-action",proposalRevision:2,planSha256:"a".repeat(64)},state=deepClone(base.state);
 const peers=frames.map((frameIds,index)=>{const b=capture.resolveApplicationRecords(records,null,frameIds);return {owner:crypto.randomUUID(),canonicalBinding:b,captureSession:capture.createCaptureSession(b,{...execution,stepIndex:index+1},plan)};});
 capture.preflightOwnerRegistration(peers[0],state);capture.registerOwnerPolicy(peers[0],state);state.reviewArtifacts[peers[0].owner]=peers[0];state.revision++;
 capture.advanceOwnerPolicy(peers[0],state);state.revision++;
 capture.preflightOwnerRegistration(peers[1],state);capture.registerOwnerPolicy(peers[1],state);state.reviewArtifacts[peers[1].owner]=peers[1];state.revision++;
 for(const peer of peers)capture.assertOwnerPolicy(peer,state);capture.advanceOwnerPolicy(peers[1],state);state.revision++;for(const peer of peers)capture.assertOwnerPolicy(peer,state);
 assert.equal(peers[0].capturePolicy.originalRevision,base.binding.originalPolicy.revision);assert.equal(peers[0].captureSession.sessionId,peers[1].captureSession.sessionId);
 const replay=deepClone(peers[1]);assert.throws(()=>capture.preflightOwnerRegistration(replay,state),/participant_replay/);
 const wrong=deepClone(peers[1]);wrong.captureSession.execution.actionId="foreign";assert.throws(()=>capture.preflightOwnerRegistration(wrong,state),/peer_mismatch/);
 const foreign=deepClone(state);foreign.reviewArtifacts[crypto.randomUUID()]={owner:"foreign"};assert.throws(()=>capture.assertOwnerPolicy(peers[0],foreign),/policy_transition_changed/);
 const incomplete=deepClone(plan);incomplete.steps.pop();assert.throws(()=>capture.createCaptureSession(peers[0].canonicalBinding,{...execution,stepIndex:1},incomplete),/coverage_mismatch/);
 const duplicate=deepClone(plan);duplicate.steps[1].args.frameIds.push(frames[0][0]);assert.throws(()=>capture.createCaptureSession(peers[0].canonicalBinding,{...execution,stepIndex:1},duplicate),/coverage_mismatch/);
});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"ae-montage-capture-"));
try{
 test("full file observations detect same-path external replacement and have operation budgets",()=>{const file=path.join(temp,"material.mp4");fs.writeFileSync(file,"initial bytes");const ref={sourceItemId:2,file,metadata:{width:320,height:180,pixelAspect:1,duration:10,fps:25}},ledger={bytes:0,requests:0};
  const first=capture.readContributingFiles([ref],{materialReadRequests:1},ledger);assert(first[0].sha256 && first[0].identity);assert.throws(()=>capture.readContributingFiles([ref],{materialReadRequests:1},ledger),/file_budget/);
  const other=path.join(temp,"replace.tmp");fs.writeFileSync(other,"changed bytes");fs.renameSync(other,file);const after=capture.readContributingFiles([ref]);assert.notEqual(first[0].sha256,after[0].sha256);assert.notEqual(stableJson(first),stableJson(after));
  assert.throws(()=>capture.assertSourceLoadEpochs(after,{projectKey:"x"}),/native_source_load_epoch_unproven/);});
 test("disk hash without a native load epoch never proves AE decoder freshness",()=>{const file=path.join(temp,"source.mp4");fs.writeFileSync(file,"bytes");const row=capture.readContributingFiles([{sourceItemId:100,file,metadata:{width:1920,height:1080,pixelAspect:1,duration:10,fps:25}}])[0];
  assert.throws(()=>capture.assertSourceLoadEpochs([row],{projectKey:"p",sourceLoadEpochs:{100:{sha256:row.sha256,byteLength:row.byteLength,complete:true}}}),/unproven/);});
 test("actual emitted reload script is read-only until complete exact usedIn native preflight",()=>{const project=createVisualProject();project.change(`function FileSource(file){this.file={fsName:file};this.isStill=false;this.reload=function(){reloadCalls++;};}var reloadCalls=0;a.mainSource=new FileSource(a.file.fsName);a.useProxy=false;
 Object.defineProperty(FootageItem.prototype,"usedIn",{get:function(){var src=this;return items.filter(function(c){return c instanceof CompItem && c._layers.some(function(l){return l.source===src;});});}});`);
  const scope={projectFile:project.read("app.project.file.fsName"),projectKey:"p",sourceItemId:100,material:{path:project.read("a.file.fsName")},ownedTargets:[{compItemId:10,layerId:11}]};
  const readonly=project.body(capture.nativeSourceScopeScript(scope));assert.equal(readonly.nativeReload.operationExecuted,false);assert.equal(project.read("reloadCalls"),0);
  const loaded=project.body(capture.nativeSourceScopeScript(scope,{reload:true}));assert.equal(loaded.nativeReload.operationExecuted,true);assert.deepEqual(loaded.nativeReload.before,loaded.nativeReload.after);assert.equal(project.read("reloadCalls"),1);
  project.change('root.__insert(new AVLayer(999,"Foreign",a));');assert.throws(()=>project.body(capture.nativeSourceScopeScript(scope,{reload:true})),/foreign_or_shared/);assert.equal(project.read("reloadCalls"),1);
  project.change('root._layers.shift();a.mainSource.reload=null;');assert.throws(()=>project.body(capture.nativeSourceScopeScript(scope,{reload:true})),/reload_unavailable/);assert.equal(project.read("reloadCalls"),1);
 });
 test("owner store exact 2MiB write limit preserves previous readable state",()=>{const memory=require("../mcp-server/project-intent-memory"),service=require("../mcp-server/placeholder-review-service"),project=createVisualProject(),file=project.read("app.project.file.fsName"),key=memory.projectStateKey(file);
  // Reuse the actual native service fixture through the inventory script emitter.
  const request=require("./placeholder-visual-fixture").request,target={target:{compItemId:10,layerId:11},rootCompItemId:20,sourceItemId:100,sourceKey:"a".repeat(64),routeLayerIds:[21],route:[{compItemId:20,id:21,sourceItemId:10,startTime:0,inPoint:0,outPoint:10,stretch:100,timeRemapEnabled:false,enabled:true,compDuration:10,compFrameRate:25,childDuration:10,childFrameRate:25}],layer:{id:11,sourceItemId:100,startTime:0,inPoint:0,outPoint:4,stretch:100,timeRemapEnabled:false,enabled:true},
    viewKinds:["target_comp"],samples:request.targets[0].samples.map((s,index)=>({...s,index})),comp:{itemId:10,width:320,height:180,pixelAspect:1,duration:10,frameRate:25},root:{itemId:20,width:320,height:180,pixelAspect:1,duration:10,frameRate:25},source:{itemId:100,file:"C:/Synthetic/a.mp4",footageMissing:false,width:1920,height:1080,pixelAspect:1,duration:10,frameRate:25}};
  const spec=service.createServiceSpecification([target],key),created=project.body(service.createServiceScript(spec,file)),receipt=project.body(service.readServiceScript(created.createdItemIds));
  const record={schema:spec.schema,owner:spec.owner,projectKey:key,spec,receipt,receiptHash:service.hash(receipt),images:[],provenance:{noise:"x".repeat(2*1024*1024)}};
  const statePath=path.join(temp,"state.json"),controller=memory.createProjectStateController({statePath});controller.setConstraints(file,null,0);const prior=fs.readFileSync(statePath,"utf8");
  assert.throws(()=>controller.registerReview(file,record,1),/project_state_size_limit/);assert.equal(fs.readFileSync(statePath,"utf8"),prior);assert.equal(controller.read(file).revision,1);
 });
 test("native reload epoch round-trip and exact same-run policy transition cannot waive unrelated revisions",()=>{
  const {record,state}=baseline(),q=record.plan.montagePipeline.captureRequirements,execution={runId:crypto.randomUUID(),actionId:"source-action",planSha256:"a".repeat(64),proposalRevision:1,stepIndex:2};
  capture.assertReloadPolicy([record],state,execution);const changed=deepClone(state);changed.revision++;assert.throws(()=>capture.assertReloadPolicy([record],changed,execution),/policy_revision_changed/);
  const file=path.join(temp,"reload-proof.mp4");fs.writeFileSync(file,"full material bytes");const project=createVisualProject();project.change(`function FileSource(file){this.file={fsName:file};this.isStill=false;this.reload=function(){};}a.file.fsName=${JSON.stringify(file)};a.mainSource=new FileSource(a.file.fsName);a.useProxy=false;
   Object.defineProperty(FootageItem.prototype,"usedIn",{get:function(){var src=this;return items.filter(function(c){return c instanceof CompItem && c._layers.some(function(l){return l.source===src;});});}});`);
  const scope={projectFile:project.read("app.project.file.fsName"),projectKey:state.projectKey,sourceItemId:100,material:{path:file},ownedTargets:[{compItemId:10,layerId:11}],applicationRunIds:[record.runId]};
  const nativeBracket=project.body(capture.nativeSourceScopeScript(scope,{reload:true})),independentNativeRead=project.body(capture.nativeSourceScopeScript(scope));
  const metadata={width:1920,height:1080,pixelAspect:1,duration:10,fps:25},observed=capture.readContributingFiles([{sourceItemId:100,file,metadata}])[0];
  const epoch={schema:"ae-agent-native-source-load-epoch.v1",epochId:crypto.randomUUID(),sourceItemId:100,projectKey:state.projectKey,file,sha256:observed.sha256,byteLength:observed.byteLength,fileIdentity:observed.identity,metadata,
   nativeOperation:"reload",commandId:crypto.randomUUID(),...execution,stepIndex:1,scope,nativeBracket,independentNativeRead,independentReadBackVerified:true,ownedUsedInComplete:true,
   policyTransition:{originalRevision:q.project.revision,originalPolicyHash:q.policy.policyHash,manifestHash:q.manifest.sha256,materialsHash:q.materials.sha256,toRevision:changed.revision,policyHashAfter:policyHash(changed),semanticSha256:capture.semanticPolicyHash(changed),reviewOwnersHash:require("../mcp-server/review-evidence").sha256(changed.reviewArtifacts)}};
  changed.sourceLoadEpochs={100:epoch};capture.validateLoadEpoch(epoch,changed);capture.assertSourceLoadEpochs([observed],changed);capture.assertReloadPolicy([record],changed,execution);
  const manual=deepClone(changed);manual.revision++;assert.throws(()=>capture.assertReloadPolicy([record],manual,execution),/policy_revision_changed/);
  const foreign=deepClone(changed);foreign.reviewArtifacts.foreign={};assert.throws(()=>capture.assertReloadPolicy([record],foreign,execution),/policy_revision_changed/);
  assert.throws(()=>capture.assertReloadPolicy([record],changed,{...execution,runId:crypto.randomUUID()}),/policy_revision_changed/);
  const unknown=deepClone(epoch);unknown.nativeBracket.nativeReload.operationExecuted=false;assert.throws(()=>capture.validateLoadEpoch(unknown,changed),/invalid_native_source_load_epoch/);
  const semantic=require("../mcp-server/semantic-verification").buildSemanticVerification;
  const proof={ok:true,sourceLoadEpoch:epoch,verification:{ok:true,scope:"independent_native_source_load_epoch",sourceLoadEvidence:{ok:true,epoch}}},args={sourceItemId:100,applicationRunIds:[record.runId]},projectFile=scope.projectFile;
  const run={id:epoch.runId,provenance:{actionId:epoch.actionId,proposalRevision:epoch.proposalRevision,planSha256:epoch.planSha256},ok:true,dryRun:false,steps:[{index:1,tool:"reload_montage_material_source",args,status:"completed",result:proof},{index:2,tool:"get_project_info",status:"completed",result:{file:projectFile}}]};
  assert.equal(semantic({steps:run.steps},run).status,"passed");delete proof.verification;assert.notEqual(semantic({steps:run.steps},run).status,"passed");
 });
 test("protected source reload rejected without SAFE_ADDITIONS waiver",()=>{const {checkProtectedSteps}=require("../mcp-server/placeholder-protection"),p=createVisualProject();const snapshot={target:{compItemId:10,layerId:11},source:{itemId:100},dependencies:[]};
  const inv={complete:true,comps:[],sources:[]},result=checkProtectedSteps({accepted:[snapshot],inventory:inv,steps:[{tool:"reload_montage_material_source",args:{sourceItemId:100}}]});assert(!result.ok);assert.equal(result.conflicts[0].reason,"accepted_source_reload_forbidden");assert.equal(p.read("undo.length"),0);});
 test("unknown reload reconciliation remains unknown even matching source bytes",()=>{const {reconcilePlanRun}=require("../mcp-server/plan-run-reconciliation"),file="C:/Synthetic/Protected.aep";
  const record={schema:"ae-agent-plan-run-record.v1",runId:crypto.randomUUID(),project:{file},plan:{steps:[{tool:"reload_montage_material_source",args:{sourceItemId:100,applicationRunIds:[crypto.randomUUID()]}}]},run:{steps:[{index:1,tool:"reload_montage_material_source",status:"failed",args:{sourceItemId:100},commands:[{id:crypto.randomUUID(),role:"mutation",state:"timed_out",submittedAt:"2026-10-03T00:00:00.000Z"}]}]}};
  const result=reconcilePlanRun({record,project:{file},freshReadSteps:[{tool:"get_project_info",status:"completed",result:{file}},{tool:"get_montage_source_load_evidence",status:"completed",args:{sourceItemId:100},result:{ok:true,epoch:{sha256:"a".repeat(64)}}}]});assert.equal(result.steps[0].mutationStatus,"unknown");assert.equal(result.replayAllowed,false);});
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log(`PASS: ${count} canonical owner/load negative and actual emitted JSX VM cases; AE calls0, provider calls0.`);

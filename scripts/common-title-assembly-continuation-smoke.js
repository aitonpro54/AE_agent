"use strict";
// Deterministic offline evidence and CDP responses only. No logs, sockets, AE, CEP or provider calls.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),Module=require("node:module"),{pathToFileURL}=require("node:url");
const production=require("../mcp-server/common-title-assembly-recovery"),control=require("../mcp-server/cep-panel-control"),records=require("../mcp-server/plan-run-records"),evidence=require("../mcp-server/review-evidence"),contract=require("../cep-panel/panel-action-contract"),png=require("../mcp-server/generated-export-recovery");
const {normalizeProject}=require("../mcp-server/proposal-state");
const copy=v=>JSON.parse(JSON.stringify(v)),hash=v=>records.digest(JSON.stringify(v)),now=Date.parse("2026-10-09T16:51:00.000Z"),at=offset=>new Date(now+offset).toISOString();
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
let checks=0;
function rejects(fn,code){assert.throws(fn,e=>e.code===code);checks++;}

function fixtureRecovery(script){
  // Bind the unchanged validators to synthetic reviewed evidence in an uncached module.
  // Only the immutable script digest and exported fixture identity objects differ;
  // no validator is replaced and the production module's pinned authority stays intact.
  const file=require.resolve("../mcp-server/common-title-assembly-recovery"),source=fs.readFileSync(file,"utf8"),needle='const SCRIPT_SHA="'+production.SCRIPT_SHA+'";';
  assert.equal(source.split(needle).length,2);
  const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(path.dirname(file));
  loaded._compile(source.replace(needle,'const SCRIPT_SHA="'+records.digest(script)+'";'),file);
  return loaded.exports;
}

function pngFixture(r){
  const file="C:/Synthetic/Continuation.aep",args={expectedCompItemId:10,expectedCompName:"Fixture",time:1,outputFileName:"fixture.png",resolutionFactor:[1,1],allowOverwrite:false,deleteAfterReadBack:false,verifyAfter:true};
  const plan={targetProject:{file},steps:[{tool:"save_comp_frame_png",args}]},provenance={schema:"ae-agent-run-provenance.v1",actionId:"act_synthetic_png",proposalRevision:1,payloadHash:"sha256:"+"a".repeat(64),planSha256:evidence.sha256(plan),projectId:evidence.sha256(normalizeProject(file)),projectRevision:null,projectRevisionReason:"in_memory_revision_not_observed"};
  function command(n,result){return {id:id(n),leaseId:id(n+10),executionId:r.PNG.runId,leaseOwner:{panelConnectionId:"synthetic-connection",panelGeneration:"synthetic-old"},role:"mutation",state:"completed",lifecycleState:"completed",ok:true,neverSubmitted:false,history:["queued","leased","submitted","completed"],createdAt:at(-10000+n),leasedAt:at(-9900+n),submittedAt:at(-9800+n),completedAt:at(-9700+n),result};}
  const probe=command(1,{id:10,name:"Fixture",duration:5,frameRate:30,time:0}),native=command(2,{comp:{itemId:10,name:"Fixture",width:2,height:2,frameRate:30,duration:5},frame:{time:1,frameNumber:30},resolutionFactor:{before:[4,4],applied:[1,1],after:[4,4],restored:true},postVerification:{outputFileExists:false,resolutionFactorRestored:true}});
  native.submittedAt=at(-9600);native.completedAt=at(-9500);
  const error="Generated PNG output verification failed: fixture missing.",run={id:r.PNG.runId,provenance,dryRun:false,confirm:true,allowMutations:true,ok:false,startedAt:at(-11000),finishedAt:at(-9000),outcome:{execution:{status:"failed"}},safety:{editSessionFinished:true},editSessionFinished:{status:"finished"},m100Action:{actionId:provenance.actionId,payloadHash:provenance.payloadHash},executedCount:0,skippedCount:0,failedCount:1,error,validation:{ok:true,steps:[{index:1,tool:"save_comp_frame_png",valid:true,safeArgs:copy(args)}]},steps:[{index:1,tool:"save_comp_frame_png",args:copy(args),status:"failed",isError:true,mutationResultIsError:true,error,commands:[probe,native]}]};
  const record={schema:"ae-agent-plan-run-record.v1",runId:run.id,project:{file},plan,run},binding={panelInstanceId:"synthetic-old",panelLifecycleEpoch:1,panelGeneration:"synthetic-old"};
  const local={requestId:r.PNG.requestId,action:"plan.run",state:"unknown",phase:"outcome_unresolved",runId:run.id,signature:"b".repeat(64),binding,panelInstanceId:binding.panelInstanceId,epoch:binding.panelLifecycleEpoch,generation:binding.panelGeneration,result:{run:copy(run)}};
  const receipt={...provenance,schema:png.SCHEMA,recoveryId:r.PNG.recoveryId,originalRequestId:r.PNG.requestId,originalAction:"plan.run",runId:run.id,runEnvelopeSha256:png.hash(record),originalBinding:binding,transportIdentityHash:evidence.sha256(local.signature),terminal:"failed",reasonCode:"generated_png_missing_after_native_terminal",steps:[{artifact:{status:"missing"}}],replayAllowed:false,artisticAccepted:false};
  const saved={schema:png.ENVELOPE,sha256:png.hash(receipt),receipt};r.PNG.sha256=saved.sha256;
  local.recoveryReference={schema:png.SCHEMA,originalRequestId:r.PNG.requestId,runId:run.id,recoveryId:r.PNG.recoveryId,sha256:saved.sha256};
  return {pngSaved:saved,pngRecord:record,pngLocal:local,pngRemote:copy(local)};
}

function fixture(){
  const file="C:/Synthetic/Continuation.aep",baseline={project:{file,numItems:40},queueItems:0,comps:Array.from({length:11},(_,i)=>({id:i+1,name:"TITR_"+String(i+1).padStart(2,"0"),acceptedId:i+101,layers:[{id:i+101,text:"Fixture "+i}]}))};
  let script="    var baseline = "+JSON.stringify(baseline)+';\n    var targetName = "TITR_ALL_VARIANTS_20261009";\n';script=script.padEnd(94378," ");
  const r=fixtureRecovery(script),oldRuntime={gitCommit:"synthetic-original",sourceSha256:"a".repeat(64)},oldBinding={panelInstanceId:"synthetic-panel",panelLifecycleEpoch:2,panelGeneration:"synthetic-old"},leaseOwner={panelConnectionId:"synthetic-connection",panelGeneration:oldBinding.panelGeneration};
  const plan={steps:[{tool:"checkpoint_project",args:{}},{tool:"run_extendscript",args:{script}},{tool:"get_project_info",args:{}}]};
  Object.assign(r.EXPECTED,{planSha256:evidence.sha256(plan),projectId:evidence.sha256(normalizeProject(file))});
  const command={id:"46c48624-f17d-448b-a546-6abde406295b",executionId:r.RUN_ID,leaseId:id(30),leaseOwner,role:"mutation",state:"timed_out_after_submit",timedOutFrom:"submitted",ok:false,result:null,history:["queued","leased","submitted","timed_out_after_submit"],createdAt:at(-180000),leasedAt:at(-179900),submittedAt:at(-179800),completedAt:at(-120000)};
  const checkpoint={sourceFile:file,label:"titles-common-comp-before-20261009",bytes:31213688,createdAt:at(-181000)};
  const run={id:r.RUN_ID,dryRun:false,confirm:true,allowMutations:true,ok:false,startedAt:at(-182000),finishedAt:at(-119000),provenance:{...r.EXPECTED,runtime:oldRuntime},m100Action:{confirmedBySurface:"cep-panel",actionId:r.EXPECTED.actionId,payloadHash:r.EXPECTED.payloadHash},safety:{allowWithoutCheckpoint:false,allowRawExtendscript:true,rawExtendscriptGate:{status:"approved"}},checkpoint,validation:{ok:true,steps:[{}, {safeArgs:{script}}]},steps:[{tool:"checkpoint_project",status:"completed",result:copy(checkpoint)},{tool:"run_extendscript",status:"failed",errorCode:"timed_out_after_submit",args:{script,timeoutMs:60000},commands:[command]}]};
  const record={schema:"ae-agent-plan-run-record.v1",runId:r.RUN_ID,project:{file},plan,run},local={requestId:r.REQUEST_ID,action:"plan.run",state:"unknown",phase:"outcome_unresolved",runId:r.RUN_ID,replayAllowed:false,signature:"c".repeat(64),binding:oldBinding,panelInstanceId:oldBinding.panelInstanceId,epoch:oldBinding.panelLifecycleEpoch,generation:oldBinding.panelGeneration,result:{run:contract.redactState(run)}};
  const barrier={command:{id:id(31),executionId:id(32),leaseId:id(33),leaseOwner,state:"completed",lifecycleState:"completed",submittedAt:at(-61100),completedAt:at(-60100)},ok:true,lifecycleState:"completed",receiptDigest:"d".repeat(64),result:{file,numItems:41,revision:10}};
  const oldStatus={pendingCommands:0,inflightCommands:[],lastPanelInfo:leaseOwner,recentEvents:[{runtime:oldRuntime,type:"ae_command_result",details:{id:barrier.command.id,ok:true,lifecycleState:"completed"}}]},oldPanel={...oldBinding,bridgeConnection:{panelConnectionId:leaseOwner.panelConnectionId},nativeControlIdle:true};
  const installed={indexPath:path.resolve(__dirname,"../.codex-runtime/offline-continuation/CEP/extensions/com.codex.aemcpbridge/index.html"),hashes:{fixture:"e".repeat(64)},loadedOldScriptHashes:r.continuationLoadedHashes(),historicalNormalizedHashes:r.continuationLoadedHashes()},target={type:"page",url:pathToFileURL(installed.indexPath).href,webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/offline-continuation-fixture"};
  const configuration={host:"127.0.0.1",port:3001,credentialIdentity:"f".repeat(64)},value={...r.createCapsule({record,local,remote:local,retained:barrier,status:oldStatus,panel:oldPanel,installed,runtime:oldRuntime,now:now-60000}),capsuleId:id(34),configuration},capsule={schema:r.ENVELOPE,sha256:hash(value),value};
  Object.assign(r.HISTORY,{capsuleSha256:capsule.sha256,capsuleId:value.capsuleId,moduleSha256:value.collectorModuleSha256});
  const verifierRuntime={gitCommit:r.HISTORY.gitCommit,sourceSha256:r.HISTORY.sourceSha256},m={schema:"ae-agent-common-title-reload-authorization.v1",scopeId:r.HISTORY.maintenanceId,status:"reload_authorized",capsuleSha256:capsule.sha256,runId:r.RUN_ID,originalRequestId:r.REQUEST_ID,expiresAt:value.expiresAt,currentBinding:oldBinding,verifierRuntime,installed,target:{url:target.url,webSocketDebuggerUrl:target.webSocketDebuggerUrl},guardReleased:false,replayAllowed:false},maintenance={schema:r.ENVELOPE,sha256:hash(m),value:m};
  r.HISTORY.maintenanceSha256=maintenance.sha256;
  const generation="recovery-"+r.HISTORY.scopeId,p2Binding={panelInstanceId:oldBinding.panelInstanceId,panelLifecycleEpoch:3,panelGeneration:generation},p2Local={requestId:r.HISTORY.p2RequestId,action:"plan.reconcile",state:"completed",phase:"completed",replayAllowed:false,acceptedAt:r.HISTORY.createdAt,completedAt:r.HISTORY.completedAt,signature:"1".repeat(64),binding:p2Binding,panelInstanceId:p2Binding.panelInstanceId,epoch:p2Binding.panelLifecycleEpoch,generation,result:{runId:r.RUN_ID,reconciliation:{status:"incomplete",reasonCode:"ae_execution_failed",runId:r.RUN_ID},admissionGuardReleased:false}};
  const retained={ok:false,lifecycleState:"failed",receiptDigest:r.HISTORY.receiptDigest,error:r.HISTORY.error,result:null,code:"ae_execution_failed",command:{id:r.HISTORY.commandId,executionId:r.HISTORY.executionId,leaseId:r.HISTORY.leaseId,state:"failed",lifecycleState:"failed",errorCode:"ae_execution_failed",leaseOwner:{panelConnectionId:leaseOwner.panelConnectionId,panelGeneration:generation},...Object.fromEntries(["createdAt","leasedAt","submittedAt","completedAt"].map(k=>[k,r.HISTORY[k]]))}};
  const status={pendingCommands:0,inflightCommands:[],activeEditSession:null,projectLifecycle:{blocked:false,pending:false},startedAt:at(-90000),lastPanelInfo:retained.command.leaseOwner,recentEvents:[{runtime:verifierRuntime}]};
  const panel={protocolVersion:contract.PROTOCOL_VERSION,...p2Binding,panelLifecycleEpoch:4,bridgeConnection:{panelConnectionId:leaseOwner.panelConnectionId},connected:false,running:false,activeAction:null,actionStorage:"ready",busy:true,recoveryTransport:{scopeId:r.HISTORY.scopeId,state:"failed",connecting:false,freshReconcileRequired:true},unresolvedActions:[{requestId:r.REQUEST_ID,runId:r.RUN_ID,action:"plan.run"},{requestId:r.PNG.requestId,runId:r.PNG.runId,action:"plan.run"}]};
  return {r,panel,installed,target,barrier,oldStatus,oldPanel,oldRuntime,context:{capsule,maintenance,record,local,remote:copy(local),...pngFixture(r),p2Local,p2Remote:copy(p2Local),retained,before:copy(status),after:copy(status),loadedHashes:r.continuationLoadedHashes(),configuration,now}};
}

async function select(f,{before=f.panel,after=before,reasons=[],available=reasons.length===0}={}){
  let reads=0;
  const catalog=contract.ACTION_CATALOG.map(row=>({...copy(row),availability:{available:row.name==="plan.reconcile"?available:true,reasonCodes:row.name==="plan.reconcile"?reasons:[]}}));
  const api={protocolVersion:contract.PROTOCOL_VERSION,state:()=>copy(reads++===0?before:after),catalog:()=>copy(catalog)};
  const service=control.createPanelControlService({inspectInstalledTarget:()=>copy(f.installed),fetchCdpTargets:async()=>[copy(f.target)],evaluateViaCdp:async(_url,expression)=>copy(vm.runInNewContext(expression,{window:{AEAgentPanelActions:api}}))});
  return service.maintenanceTarget();
}

async function main(){
  const f=fixture(),{r,context}=f,selected=await select(f);
  assert.equal(selected.state.busy,true);assert.equal(selected.state.nativeControlIdle,false);assert.equal(selected.state.failedRecoveryCaptureIdle,true);checks+=3;
  const value=r.createContinuation({...context,selected}),saved={schema:r.ENVELOPE,sha256:r.hash(value),value};
  assert.equal(r.validateContinuation(saved,context,now).continuationId,value.continuationId);assert.equal(value.guardReleased,false);assert.equal(value.replayAllowed,false);assert.equal(value.historicalBodyProven,false);checks+=4;
  rejects(()=>production.recognize(context.record.plan.steps[1].args.script),"common_title_script_unrecognized");
  rejects(()=>production.createContinuation({...context,selected}),"common_title_historical_lineage_invalid");
  const closedBarrierPanel={...f.oldPanel,nativeControlIdle:selected.state.nativeControlIdle,failedRecoveryCaptureIdle:selected.state.failedRecoveryCaptureIdle};
  rejects(()=>r.validateBarrier(context.record,f.barrier,f.oldStatus,closedBarrierPanel,now-60000),"common_title_completed_host_barrier_missing_or_stale");
  rejects(()=>r.createCapsule({record:context.record,local:context.local,remote:context.remote,retained:f.barrier,status:f.oldStatus,panel:closedBarrierPanel,installed:f.installed,runtime:f.oldRuntime,now:now-60000}),"common_title_completed_host_barrier_missing_or_stale");
  const ordinary=copy(f.panel);ordinary.recoveryTransport=null;const ordinaryTarget=await select(f,{before:ordinary});assert.equal(ordinaryTarget.state.nativeControlIdle,true);assert.equal(ordinaryTarget.state.failedRecoveryCaptureIdle,false);checks+=2;
  const stateChanges=[s=>{s.activeAction={requestId:id(70),action:"plan.reconcile"};},s=>{s.actionStorage="unavailable";},s=>{s.connected=true;},s=>{s.running=true;},s=>{s.recoveryTransport.connecting=true;},s=>{s.recoveryTransport.state="ready";},s=>{s.recoveryTransport=null;},s=>{delete s.activeAction;},s=>{delete s.connected;}];
  for(const change of stateChanges){const state=copy(f.panel);change(state);for(const phase of ["before","after"]){const seen=await select(f,{before:phase==="before"?state:f.panel,after:phase==="after"?state:f.panel});assert.equal(seen.state.failedRecoveryCaptureIdle,false);rejects(()=>r.createContinuation({...context,selected:seen}),seen.state.actionStorage==="ready"?"common_title_continuation_capture_context_invalid":"common_title_continuation_guards_changed");}}
  for(const reasons of [["panel_busy"],["action_in_flight"],["trusted_guard_refresh_pending"],["host_startup_guard"]]){const seen=await select(f,{reasons});assert.equal(seen.state.failedRecoveryCaptureIdle,false);rejects(()=>r.createContinuation({...context,selected:seen}),"common_title_continuation_capture_context_invalid");}
  const denied=await select(f,{available:false});assert.equal(denied.state.failedRecoveryCaptureIdle,false);checks++;
  const changed=copy(f.panel);changed.recoveryTransport.scopeId=id(71);const incoherent=await select(f,{after:changed});assert.equal(incoherent.state.failedRecoveryCaptureIdle,false);checks++;
  for(const key of ["panelInstanceId","panelLifecycleEpoch","panelGeneration"]){const state=copy(f.panel);state[key]=key==="panelLifecycleEpoch"?99:"foreign";await assert.rejects(()=>select(f,{after:state}),e=>e.code==="maintenance_panel_binding_changed");checks++;}
  const contextChanges=[c=>{c.selected.state.recoveryTransport.scopeId=id(72);},c=>{c.selected.state.panelInstanceId="foreign";},c=>{c.selected.state.panelLifecycleEpoch++;},c=>{c.selected.state.panelGeneration="foreign";},c=>{c.selected.state.bridgeConnection.panelConnectionId="foreign";},c=>{c.selected.installed.hashes.fixture="0".repeat(64);},c=>{c.selected.target.webSocketDebuggerUrl+="-foreign";},c=>{c.loadedHashes["panel.js"]="0".repeat(64);},c=>{c.configuration.port++;},c=>{c.after.startedAt=at(-80000);},c=>{c.after.recentEvents[0].runtime.sourceSha256="0".repeat(64);}];
  for(const change of contextChanges){const c=copy({...context,selected});change(c);rejects(()=>r.createContinuation(c),"common_title_continuation_capture_context_invalid");}
  for(const change of [c=>{c.before.pendingCommands=1;},c=>{c.after.inflightCommands=[{id:id(73)}];},c=>{c.after.activeEditSession={id:id(74)};},c=>{c.after.projectLifecycle.blocked=true;}]){const c=copy({...context,selected});change(c);rejects(()=>r.createContinuation(c),"common_title_writer_not_idle");}
  for(const change of [c=>{c.retained.receiptDigest="0".repeat(64);},c=>{c.retained.command.executionId=id(75);},c=>{c.retained.command.state="submitted";}]){const c=copy({...context,selected});change(c);rejects(()=>r.createContinuation(c),"common_title_failed_verifier_terminal_unproven");}
  const p2=copy({...context,selected});p2.p2Remote.result.admissionGuardReleased=true;rejects(()=>r.createContinuation(p2),"common_title_failed_p2_receipt_unproven");
  const guards=copy({...context,selected});guards.selected.state.unresolvedActions.pop();rejects(()=>r.createContinuation(guards),"common_title_continuation_guards_changed");
  const badPNG=copy({...context,selected});badPNG.pngSaved.sha256="0".repeat(64);rejects(()=>r.createContinuation(badPNG),"recovery_envelope_invalid");
  rejects(()=>r.validateContinuation(saved,context,now-1),"common_title_continuation_invalid_or_expired");
  rejects(()=>r.validateContinuation(saved,context,now+r.TTL),"common_title_continuation_invalid_or_expired");
  const tampered=copy(saved);tampered.value.guardReleased=true;tampered.sha256=r.hash(tampered.value);rejects(()=>r.validateContinuation(tampered,context,now),"common_title_continuation_invalid_or_expired");
  assert.equal(production.SCRIPT_SHA,"9d4bfaeb6dcf9ed0695ee009abb47ccbaf888b2ea775568df5572771e2e22262");assert.notEqual(production.HISTORY.capsuleSha256,r.HISTORY.capsuleSha256);checks+=2;
  console.log(JSON.stringify({ok:true,checks,scope:"offline production maintenanceTarget + unchanged continuation validators bound to deterministic synthetic evidence",failedTransportCapture:true,nativeBarrierRemainsClosed:true,liveProof:false,replayAllowed:false}));
}
main().catch(error=>{console.error(error.stack || error);process.exitCode=1;});

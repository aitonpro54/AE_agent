"use strict";
// Isolated VM and temporary store only. No daemon, AE, MCP or UI connection.
const assert=require("assert/strict"),fs=require("fs"),path=require("path"),crypto=require("crypto"),vm=require("vm");
const c=require("../mcp-server/project-lifecycle-contract"),t=require("../mcp-server/project-lifecycle-transition"),m=require("../mcp-server/project-intent-memory");
const protection=require("../mcp-server/placeholder-protection"),{fixture}=require("./project-lifecycle-fixture");
const {createProjectLifecycleService}=require("../mcp-server/project-lifecycle-service"),{createLifecycleBridgeAdapter}=require("../mcp-server/project-lifecycle-bridge-adapter");
const {createProposalState,CONTRACT_VERSION}=require("../mcp-server/proposal-state"),save=require("../mcp-server/project-save");
const {verifyLifecycleStep}=require("../mcp-server/project-lifecycle-verification"),{buildSemanticVerification}=require("../mcp-server/semantic-verification");
let checks=0;
async function reject(promise,code) {checks++;await assert.rejects(promise,e=>!code || e.code===code || String(e.message).includes(code));}
function writeStore(f,mutate) {const store=f.storage.load();mutate(store,store.pendingLifecycle);fs.writeFileSync(f.statePath,JSON.stringify(store));}
function originalRecord(pending) {return {plan:{steps:[{tool:pending.operation,args:pending.args}]},run:{id:pending.authorization.runId,dryRun:false,ok:false,finishedAt:new Date().toISOString(),provenance:{actionId:pending.authorization.actionId,payloadHash:pending.authorization.payloadHash},steps:[{commands:[{state:"failed"}]}]}};}
function actualDaemonIdle(scope) {
  const source=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8"),start=source.indexOf("  isRecoveryIdle: "),end=source.indexOf("  retireContext: async",start);
  assert(start>0&&end>start);
  const callback=source.slice(start,end).replace(/^  isRecoveryIdle:\s*/,"").replace(/,\s*$/,"");
  return vm.runInNewContext("("+callback+")",scope);
}
async function setup(options,fn) {
  const f=fixture(options);try {
    if (options.protected) {
      const inventory=c.validateInventory(JSON.parse(JSON.stringify(f.execute("(function(){"+c.nativeInventoryScript()+"})()"))));
      const evidence=JSON.parse(JSON.stringify(f.execute("(function(){"+protection.aeSupportScript+"return __phEvidence(app.project.item(2),app.project.item(2).layer(1),[]);})()")));
      writeStore(f,store=>{const state=store.projectState[m.projectStateKey(f.source)];
        state.acceptedPlaceholders=[protection.snapshotFromEvidence(evidence,{complete:true,comps:[{itemId:2,layers:inventory.items[1].layers}]},[])];
        state.groupMappings=[{mediaKey:"fixture",groupId:"group",provenance:"user_confirmed",confirmed:true}];
        state.constraints={distinctGroups:true,disallowSourceOverlap:true,selectedTargets:[{compItemId:2,layerId:101}]};});
    }
    f.setNativeHook(data=>{if(data.facts.phase===(options.phase || "open_final") && data.when===(options.when || "after")) throw Object.assign(new Error("original unknown delivery"),{code:"lifecycle_native_failed"});});
    const operation=options.operation || "save_project_as",originalArgs=f.args();
    await reject(f.service.execute(operation,originalArgs,f.context));f.setNativeHook(null);
    const pending=f.storage.load().pendingLifecycle,args={transitionId:pending.transitionId},commands=[];
    const origin={ok:false,runId:pending.authorization.runId,actionId:pending.authorization.actionId,errorCode:pending.errorCode};
    const service=createProjectLifecycleService({...f.deps,
      assertRecoveryIdle:()=>options.recoveryBusy!==true,
      sourceCheckpoint:async()=>{throw new Error("recovery must never create checkpoint");},
      verifyManualAuthorization:async(context,hints)=>Object.freeze({...await f.deps.verifyManualAuthorization(context,hints),actionId:options.oldAuthority ? pending.authorization.actionId : "recovery-action",runId:options.oldAuthority ? pending.authorization.runId : "recovery-run"}),
      readNative:async(script,cap)=>{const id=crypto.randomUUID(),facts=t.phaseCapabilityFacts(cap);t.validateCommandCapability(cap,{rawScript:script,commandId:id});
        const result=await f.deps.readNative(script,cap);commands.push({id,role:facts.readOnly?"readback":"mutation",lifecycleReadbackRole:facts.readbackRole,state:"completed",ok:true,executionId:"recovery-run",completedAt:new Date().toISOString(),result});return result;}});
    await fn({f,pending,args,service,origin,commands});
  } finally {f.dispose();}
}
async function unchangedDenial(options,mutate,code) {
  await setup(options,async s=>{await mutate(s);const before=fs.readFileSync(s.f.statePath),count=s.f.calls.filter(r=>!r.readOnly).length;
    await reject(s.service.recover(s.args,s.f.context),code);assert(fs.readFileSync(s.f.statePath).equals(before));assert.equal(s.f.calls.filter(r=>!r.readOnly).length,count);checks++;});
}
async function main() {
  await setup({protected:true},async({f,pending,args,service,origin,commands})=>{
    assert.equal(pending.phase,"open_final_submitted");assert.equal(pending.status,"unknown");assert.equal(f.runtime.app.project.file.fsName,f.target);
    const before=fs.readFileSync(f.statePath),source=fs.readFileSync(f.source),sourcePolicy=c.clone(f.storage.load().projectState[m.projectStateKey(f.source)]),mutationCount=f.calls.filter(r=>!r.readOnly).length;
    const assessed=await service.assessRecovery(args);assert(fs.readFileSync(f.statePath).equals(before));assert.equal(assessed.pins.nativeHash,c.hash(assessed.inventory.native));
    await reject(f.service.finalize(args,f.context),"lifecycle_finalize_requires_persisted_final_proof");
    const receipt=await service.execute("recover_project_lifecycle",args,f.context);c.verifyReceipt(receipt);
    assert.equal(receipt.recovery.nativeMutations,0);assert.equal(receipt.recovery.origin.pendingHash,c.hash(pending));assert.equal(receipt.recovery.origin.errorCode,pending.errorCode);
    assert.deepEqual(receipt.authorization,pending.authorization);assert.equal(receipt.recoveredBy.runId,"recovery-run");assert.equal(receipt.generation,1);
    const store=f.storage.load();assert.equal(store.pendingLifecycle,null);assert.equal(store.lifecycleGeneration,1);assert.deepEqual(c.clone(store.projectState[m.projectStateKey(f.source)]),sourcePolicy);
    assert.deepEqual(c.clone(store.projectState[m.projectStateKey(f.target)]),pending.targetState);assert(fs.readFileSync(f.source).equals(source));assert(fs.existsSync(pending.stageFile.path));assert(fs.existsSync(pending.checkpoint.path));
    assert.equal(f.calls.filter(r=>!r.readOnly).length,mutationCount);assert.deepEqual(origin,{ok:false,runId:"fixture-run",actionId:"fixture-action",errorCode:pending.errorCode});checks++;
    const step={index:1,tool:"recover_project_lifecycle",args,status:"completed",mutatesProject:true,result:{ok:true,lifecycleReceipt:receipt,recoveryReadbacks:service.recoveryReadbacks(receipt)},commands};
    const plan={targetProject:{file:f.target},steps:[{tool:step.tool,args}]},run={id:"recovery-run",ok:true,dryRun:false,provenance:{actionId:"recovery-action",payloadHash:c.hash("fixture-plan")},steps:[step]};
    assert(verifyLifecycleStep(step,run).reads.length>=3);const semantic=buildSemanticVerification(plan,run);assert.equal(semantic.status,"passed");assert.equal(semantic.verificationScope,"project_lifecycle_state_only_recovery_proof");
    for(const mutate of [s=>delete s.result.lifecycleReceipt.recoveredBy,s=>s.result.lifecycleReceipt.recoveredBy.runId="fixture-run",s=>s.result.lifecycleReceipt.recoveredBy.inputHash=c.hash("fake"),s=>s.result.lifecycleReceipt.recovery.origin.status="active",s=>s.result.lifecycleReceipt.recovery.nativeMutations=1,s=>s.commands=[],s=>s.commands.splice(1),s=>delete s.result.recoveryReadbacks,s=>s.commands.forEach(r=>{r.executionId="fixture-run";}),s=>s.commands.push({...s.commands[0],id:crypto.randomUUID(),role:"mutation"})]) {
      const copy=c.clone(run);mutate(copy.steps[0]);assert.notEqual(buildSemanticVerification(plan,copy).status,"passed");checks++;
    }
    // A frozen clock gives every read the proof timestamp. Exact private command
    // witnesses, not timestamps, establish post-retirement/post-commit ordering.
    const frozen=c.clone(run);frozen.steps[0].commands.forEach(row=>{row.completedAt=receipt.recovery.provenAt;});
    assert.equal(buildSemanticVerification(plan,frozen).status,"passed");checks++;
    for (const mutate of [
      s=>{s.commands=s.commands.filter(row=>!row.lifecycleReadbackRole).slice(-2);},
      s=>{s.commands=s.commands.filter(row=>row.id!==s.result.recoveryReadbacks.postRetirement.commandId);},
      s=>{s.commands=s.commands.filter(row=>row.id!==s.result.recoveryReadbacks.postCommit.commandId);},
      s=>{const w=s.result.recoveryReadbacks;[w.postRetirement.commandId,w.postCommit.commandId]=[w.postCommit.commandId,w.postRetirement.commandId];},
      s=>{s.result.recoveryReadbacks.postCommit.commandId=s.result.recoveryReadbacks.postRetirement.commandId;},
      s=>{const pre=s.commands.filter(row=>!row.lifecycleReadbackRole).slice(-2);s.result.recoveryReadbacks.postRetirement.commandId=pre[0].id;s.result.recoveryReadbacks.postCommit.commandId=pre[1].id;},
      s=>{s.result.recoveryReadbacks.runId="foreign-run";},
      s=>{s.commands.find(row=>row.id===s.result.recoveryReadbacks.postCommit.commandId).ok=false;},
      s=>{s.commands.find(row=>row.id===s.result.recoveryReadbacks.postRetirement.commandId).state="failed";},
      s=>{s.commands.find(row=>row.id===s.result.recoveryReadbacks.postCommit.commandId).result.native.revision++;},
      s=>{s.commands.find(row=>row.id===s.result.recoveryReadbacks.postCommit.commandId).result.items[0].name="changed";},
      s=>{s.commands.find(row=>row.id===s.result.recoveryReadbacks.postRetirement.commandId).lifecycleReadbackRole="recovery_post_commit";}
    ]) {const copy=c.clone(frozen);mutate(copy.steps[0]);assert.notEqual(buildSemanticVerification(plan,copy).status,"passed");checks++;}
    await reject(service.recover(args,f.context));
  });
  for(const options of [{when:"before"},{phase:"save_stage"},{operation:"create_named_project"},{operation:"open_project",phase:"open_target",open:true},{recoveryBusy:true},{oldAuthority:true},{enabled:false}]) {
    if(options.enabled===false) continue; // Disabled fixture cannot create original pending; tested on existing V2 below.
    await unchangedDenial(options,async()=>{});
  }
  for(const field of ["force","proof","authorization","expectedNative","phase","confirm","targetProjectFile","capability"]) await setup({},async s=>{
    await reject(s.service.recover({...s.args,[field]:true},s.f.context),"lifecycle_invalid_input");checks++;
  });
  for(const key of ["checkpoint","stageReservation","stageNative","stageInventory","stageFile","targetFile"]) await unchangedDenial({},async s=>writeStore(s.f,(_,p)=>{delete p[key];}));
  for(const mutate of [
    s=>{s.f.runtime.app.project.dirty=true;},s=>{s.f.runtime.app.project.file.fsName=s.f.source;},s=>{s.f.runtime.app.project.item(1).id=800;},
    s=>{s.f.runtime.app.project.item(2).layer(1).id=800;},s=>{s.f.runtime.app.project.item(2).layer(1).source=s.f.runtime.app.project.item(3);},
    s=>{s.f.runtime.app.project.item(2).layer(1).inPoint=0.2;},s=>{s.f.runtime.app.project.item(1).mainSource.file.fsName+="-changed";},
    s=>{s.f.runtime.app.project.item(1).footageMissing=true;},s=>{s.f.execute("app.project.item(1).proxySource=new FileSource(__proxy);app.project.item(1).useProxy=true;");},
    s=>{s.f.runtime.app.project.item(1).name="foreign item";},s=>{s.f.runtime.app.project.item(2).layer(1).transform["ADBE Position"]=[90,90];}
  ]) await unchangedDenial({protected:true},async s=>mutate(s));
  for(const [key,type] of Object.entries(c.SETTINGS)) for(const invalid of [false,true]) await unchangedDenial({},async s=>{
    const value=s.f.runtime.app.project[key];s.f.runtime.app.project[key]=invalid ? (type==="number" ? NaN : type==="boolean" ? "unknown" : false) : type==="number" ? value+1 : type==="boolean" ? !value : value+"-changed";
  });
  for(const key of ["sourceBefore","checkpoint","stageFile","targetFile"]) for(const drift of ["content","identity","missing","symlink"]) await unchangedDenial({},async s=>{
    const file=s.pending[key].path;
    if(drift==="content")fs.writeFileSync(file,"changed file");
    if(drift==="identity"){const copy=file+".replacement.aep";fs.copyFileSync(file,copy);fs.unlinkSync(file);fs.renameSync(copy,file);}
    if(drift==="missing")fs.unlinkSync(file);
    if(drift==="symlink"){const copy=file+".real.aep";fs.renameSync(file,copy);try{fs.symlinkSync(copy,file);}catch(e){if(e.code!=="EPERM")throw e;fs.writeFileSync(file,"symlink unavailable: equivalent missing original identity");}}
  });
  await unchangedDenial({},async s=>{fs.unlinkSync(s.f.target);fs.linkSync(s.pending.stageFile.path,s.f.target);});
  for(const mutate of [
    (store,p)=>{p.stageNative.file=p.args.targetProjectFile;},(store,p)=>{p.stageNative.dirty=true;},(store,p)=>{p.stageReservation.bytes=1;},
    (store,p)=>{p.checkpoint.label="foreign";},(store,p)=>{p.checkpoint.snapshotScope="memory";},(store,p)=>{p.targetState.revision++;},
    (store,p)=>{p.targetState.inheritedOwnership=[{owner:crypto.randomUUID(),itemIds:[1],sourceKey:p.sourceState.projectKey,transitionId:p.transitionId,proofValidity:"invalid"}];},
    (store,p)=>{store.projectState[m.projectStateKey(p.args.expectedSourceProjectFile)].revision++;},(store,p)=>{store.projectState[m.projectStateKey(p.args.targetProjectFile)]=t.defaultState(p.args.targetProjectFile);},
    (store,p)=>{store.lifecycleGeneration++;},(store,p)=>{p.baseGeneration++;}
  ]) await unchangedDenial({},async s=>writeStore(s.f,mutate));
  for(const fault of ["store_missing","store_corrupt","marker_missing","marker_corrupt","disabled"]) await setup({},async s=>{
    const restarted=t.createLifecycleStorage({statePath:s.f.statePath,enabled:fault!=="disabled"});
    if(fault==="store_missing")fs.unlinkSync(s.f.statePath);if(fault==="store_corrupt")fs.writeFileSync(s.f.statePath,"{broken");
    if(fault==="marker_missing")fs.unlinkSync(t.markerPath(s.f.statePath));if(fault==="marker_corrupt")fs.writeFileSync(t.markerPath(s.f.statePath),"{broken");
    const service=createProjectLifecycleService({...s.f.deps,storage:restarted,assertRecoveryIdle:()=>true});await reject(service.assessRecovery(s.args));
  });
  await setup({},async s=>{
    const old=m.MAX_STATE_LOGICAL_BYTES;m.MAX_STATE_LOGICAL_BYTES=Buffer.byteLength(JSON.stringify(s.f.storage.load()))+1;
    try {const before=fs.readFileSync(s.f.statePath);await reject(s.service.assessRecovery(s.args),"lifecycle_store_capacity");assert(fs.readFileSync(s.f.statePath).equals(before));}finally{m.MAX_STATE_LOGICAL_BYTES=old;}
  });
  await setup({},async s=>{
    const p=s.pending,assessed=await s.service.assessRecovery(s.args),authority={actionId:"isolated-recovery",runId:"isolated-run",payloadHash:c.hash("isolated"),inputHash:c.hash({name:"recover_project_lifecycle",args:s.args}),sourcePolicyHash:p.sourcePolicyHash,targetPolicyHash:p.targetPolicyHash};
    const lease=s.f.storage.acquireRecoveryAdmission(authority,p.transitionId,assessed.pins.pendingHash,()=>true);
    try {assert.throws(()=>s.f.storage.acquireRecoveryAdmission(authority,p.transitionId,assessed.pins.pendingHash,()=>true),e=>e.code==="lifecycle_concurrent_admission");
      await reject(s.f.storage.withPhaseCapability(lease,p,"open_final",p.stageNative,c.phaseScript({operation:p.operation,phase:"open_final",expectedNative:p.stageNative,destinationProjectFile:s.f.target}),()=>assert.fail("native must not dispatch")),"lifecycle_recovery_native_mutation_forbidden");
      assert.throws(()=>s.f.storage.update(lease,p.transitionId,current=>{current.authorization.actionId="rewritten";}),e=>e.code==="lifecycle_recovery_origin_changed");
      assert.throws(()=>m.createProjectStateController({statePath:s.f.statePath}).setConstraints(s.f.source,null,0));checks++;
    } finally {s.f.storage.releaseAdmission(lease);}
  });
  for(const fault of ["retirement","after_retirement_inventory","commit"]) await setup({},async s=>{
    let retired=false;const storage=fault==="commit"?{...s.f.storage,commit:()=>{throw new Error("isolated commit fault");}}:s.f.storage;
    const service=createProjectLifecycleService({...s.f.deps,storage,assertRecoveryIdle:()=>true,
      verifyManualAuthorization:async(ctx,hints)=>Object.freeze({...await s.f.deps.verifyManualAuthorization(ctx,hints),actionId:"recovery-action",runId:"recovery-run"}),
      retireContext:async()=>{retired=true;if(fault==="retirement")throw new Error("isolated retirement fault");if(fault==="after_retirement_inventory")s.f.runtime.app.project.dirty=true;return {sessionClosed:true,proposalRetired:true,cachesInvalidated:true,desiredEnabledPreserved:true};}});
    const mutations=s.f.calls.filter(r=>!r.readOnly).length;await reject(service.recover(s.args,s.f.context));const proven=s.f.storage.load().pendingLifecycle;
    assert(retired);assert(proven.proof&&proven.recovery);assert.equal(proven.status,"unknown");assert.equal(proven.recovery.origin.errorCode,s.pending.errorCode);assert.equal(s.f.calls.filter(r=>!r.readOnly).length,mutations);
    await reject(service.recover(s.args,s.f.context),"lifecycle_recovery_ineligible");
    await reject(service.finalize(s.args,s.f.context),"lifecycle_recovery_authority_reused");
    s.f.runtime.app.project.dirty=false;
    const finalize=createProjectLifecycleService({...s.f.deps,assertRecoveryIdle:()=>true,
      verifyManualAuthorization:async(ctx,hints)=>Object.freeze({...await s.f.deps.verifyManualAuthorization(ctx,hints),actionId:"finalize-action",runId:"finalize-run"})});
    const receipt=await finalize.finalize(s.args,s.f.context);assert.equal(receipt.finalizedBy.runId,"finalize-run");assert.equal(receipt.recoveredBy.runId,"recovery-run");assert.equal(receipt.authorization.runId,"fixture-run");checks++;
  });
  for(const fault of ["proof_write_unknown","commit_unknown","terminal_read"]) await setup({},async s=>{
    let inject=true,committed=false;
    const storage={...s.f.storage,
      update:(...args)=>{const value=s.f.storage.update(...args);if(fault==="proof_write_unknown"&&inject&&value.recovery){inject=false;throw new Error("proof write delivered, acknowledgement lost");}return value;},
      commit:(...args)=>{const value=s.f.storage.commit(...args);committed=true;if(fault==="commit_unknown")throw new Error("commit delivered, acknowledgement lost");return value;}};
    const service=createProjectLifecycleService({...s.f.deps,storage,assertRecoveryIdle:()=>true,
      verifyManualAuthorization:async(ctx,hints)=>Object.freeze({...await s.f.deps.verifyManualAuthorization(ctx,hints),actionId:"recovery-action",runId:"recovery-run"}),
      readNative:async(script,cap)=>{if(fault==="terminal_read"&&committed)throw new Error("terminal read interrupted");return s.f.deps.readNative(script,cap);}});
    const mutations=s.f.calls.filter(r=>!r.readOnly).length;await reject(service.recover(s.args,s.f.context));const actual=s.f.storage.load();
    assert.equal(s.f.calls.filter(r=>!r.readOnly).length,mutations);
    if(fault==="proof_write_unknown") {assert(actual.pendingLifecycle.proof&&actual.pendingLifecycle.recovery);assert.equal(actual.lifecycleGeneration,0);}
    else {assert.equal(actual.pendingLifecycle,null);assert.equal(actual.lifecycleGeneration,1);assert.equal(actual.lifecycleReceipts.at(-1).recoveredBy.runId,"recovery-run");}
    const bytes=fs.readFileSync(s.f.statePath);await reject(service.recover(s.args,s.f.context));assert(fs.readFileSync(s.f.statePath).equals(bytes));checks++;
  });
  await setup({},async s=>{
    let release,entered,reads=0;const waiting=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
    s.f.setNativeHook(async data=>{if(data.when==="before"&&data.facts.readOnly&&++reads===2){entered();await waiting;}});
    const first=s.service.recover(s.args,s.f.context);await started;
    await reject(s.service.recover(s.args,s.f.context),"lifecycle_concurrent_admission");release();await first;checks++;
  });
  // Evaluate the actual daemon admission callback with injected read-only facts.
  // This does not import/start the daemon or access its runtime directories.
  await setup({},async s=>{
    const source=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");
    const original=originalRecord(s.pending);
    const scope={inflightCommands:new Map(),pendingCommands:[],activeEditSession:null,currentProposalState:{current:null},planRunRecords:{readRecord:()=>original},LOG_DIR:"unused-injected-fixture",projectLifecycleContract:c};
    const idle=actualDaemonIdle(scope);assert.equal(idle(s.pending),true);
    for(const mutate of [v=>{v.run.ok=true;},v=>{v.run.dryRun=true;},v=>{delete v.run.finishedAt;},v=>{v.run.provenance.actionId="foreign";},v=>{v.run.provenance.payloadHash=c.hash("foreign");},v=>{v.run.steps[0].commands[0].state="submitted";},v=>{v.plan.steps[0].args={};}]) {
      const saved=c.clone(original);mutate(original);assert.equal(idle(s.pending),false);Object.assign(original,saved);checks++;
    }
    scope.inflightCommands.set("writer",{});assert.equal(idle(s.pending),false);scope.inflightCommands.clear();
    scope.pendingCommands.push({});assert.equal(idle(s.pending),false);scope.pendingCommands.pop();
    scope.activeEditSession={id:"foreign"};assert.equal(idle(s.pending),false);scope.activeEditSession=null;
    scope.currentProposalState.current={executionState:"executing",executionId:s.pending.authorization.runId};assert.equal(idle(s.pending),false);
    const own={record:scope.currentProposalState.current,run:{id:"recovery-new-run"}};own.record.executionId=own.run.id;assert.equal(idle(s.pending,own),true);checks++;
    const directStart=source.indexOf("function m100DirectToolCallBlock("),directEnd=source.indexOf("  if (!M100_DIRECT_TOOL_SOURCES.has(source))",directStart);
    assert(directStart>0&&directEnd>directStart);
    const block=vm.runInNewContext("("+source.slice(directStart,directEnd)+"return null;})",{projectLifecycleContract:c});
    for(const sourceName of ["mcp-adapter","dev-tool","local-admin","api"]) {assert.equal(block(sourceName,"recover_project_lifecycle",s.args,{lifecycleAuthorization:{}}).code,"lifecycle_manual_only");checks++;}
    assert.equal(block("ai-plan-run","recover_project_lifecycle",s.args,{}).code,"lifecycle_manual_only");
    assert.match(source,/if \(lifecycleStep && \(autonomous \|\| allowWithoutCheckpoint\)\)/);checks++;
  });
  // Actual adapter contexts/proposal/dry-run model; no server process is started.
  for(const drift of [null,"native_revision","target_disk","pending","policy","foreign_session","foreign_confirmed","foreign_executing"]) await setup({},async s=>{
    const proposals=createProposalState(),original=originalRecord(s.pending),originalHash=c.hash(original);let idle=true;
    const facts={inflightCommands:new Map(),pendingCommands:[],activeEditSession:null,currentProposalState:proposals,planRunRecords:{readRecord:()=>original},LOG_DIR:"unused-injected-fixture",projectLifecycleContract:c};
    const actualIdle=actualDaemonIdle(facts);
    const adapter=createLifecycleBridgeAdapter({storage:s.f.storage,proposals,readNative:s.f.deps.readNative,sourceCheckpoint:()=>assert.fail("no new checkpoint"),
      isIdle:()=>idle,isRecoveryIdle:(pending,saved)=>idle&&actualIdle(pending,saved),verifyDryRun:(r,n)=>save.verifyDryRunReceipt(r,n,CONTRACT_VERSION),retireContext:async(saved,hints)=>{proposals.retireLifecycle(saved.record,saved.run.id,hints.transitionId);return {sessionClosed:true,proposalRetired:true,cachesInvalidated:true,desiredEnabledPreserved:true};}});
    const before=fs.readFileSync(s.f.statePath),built=await adapter.buildRecovery(s.args);assert.equal(built.nativeMutations,0);assert.equal(built.plan.targetProject.file,s.f.target);assert(fs.readFileSync(s.f.statePath).equals(before));
    const plan=built.plan,record={actionId:"adapter-recovery",payload:{plan},payloadHash:c.hash(plan),executionState:"pending",proposalExpiresAt:new Date(Date.now()+60000).toISOString()};
    proposals.register(record);proposals.bindProject(record,s.f.target);await adapter.preflight(plan,record,true);
    record.dryRunCompletedAt=new Date().toISOString();record.dryRunReceipt={payloadHash:record.payloadHash,contractVersion:CONTRACT_VERSION,stepCount:1,projectFile:s.f.target};
    // Actual runner performs fresh preflight while pending, then confirms and issues
    // a branded execution context. Confirmed foreign work has no observer exception.
    await adapter.preflight(plan,record,false);assert.equal(record.executionState,"pending");
    if(drift==="foreign_confirmed"||drift==="foreign_executing") {
      const foreign={actionId:"foreign-action",payload:{plan},payloadHash:c.hash("foreign"),executionState:"pending",proposalExpiresAt:record.proposalExpiresAt};proposals.register(foreign);foreign.executionState=drift==="foreign_confirmed"?"confirmed":"executing";foreign.executionId="foreign-run";
      const bytes=fs.readFileSync(s.f.statePath);await reject(adapter.preflight(plan,record,false),"lifecycle_recovery_not_idle");assert(fs.readFileSync(s.f.statePath).equals(bytes));assert.equal(c.hash(original),originalHash);return;
    }
    record.confirmedBySurface="cep-panel";record.executionState="confirmed";const run={id:"adapter-recovery-run",dryRun:false};record.executionId=run.id;record.executionState="executing";
    const context=adapter.issueContext({record,run,plan,manual:true});
    if(drift==="native_revision")s.f.runtime.app.project.revision++;
    if(drift==="target_disk")fs.writeFileSync(s.f.target,"changed");
    if(drift==="pending")writeStore(s.f,(_,p)=>{p.errorCode="replaced-original";});
    if(drift==="policy")writeStore(s.f,store=>{store.projectState[m.projectStateKey(s.f.source)].revision++;});
    if(drift==="foreign_session")idle=false;
    if(drift){const bytes=fs.readFileSync(s.f.statePath);await reject(adapter.execute("recover_project_lifecycle",s.args,context));assert(fs.readFileSync(s.f.statePath).equals(bytes));}
    else {const result=await adapter.execute("recover_project_lifecycle",s.args,context);assert.equal(result.recoveredBy.actionId,record.actionId);assert.throws(()=>proposals.assertCurrent(record));}
    assert.equal(c.hash(original),originalHash);
    await reject(adapter.execute("recover_project_lifecycle",s.args,{manual:true}),"lifecycle_manual_authorization_required");checks++;
  });
  const daemon=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");
  const preflight=daemon.indexOf("const lifecyclePreflight = lifecycleStep ? await lifecycle.preflight(prepared.plan, options._m100ActionRecord, dryRun)");
  const confirm="confirmM100ActionProposal(options._m100ActionRecord, options, run)";
  assert(preflight>0&&daemon.indexOf(confirm)>preflight);assert.equal(daemon.split(confirm).length-1,1);checks++;
  console.log("project-lifecycle-recovery-smoke PASS",checks,"isolated VM/store/adapter/verification adversarial checks; no live AE or daemon");
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});

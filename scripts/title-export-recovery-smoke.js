"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto");
const tool=require("../mcp-server/title-export-snapshots"),variants=require("../mcp-server/native-render-variant"),records=require("../mcp-server/plan-run-records");
const root=path.resolve(__dirname,"../.codex-runtime/title-export-recovery-smoke",crypto.randomUUID());fs.mkdirSync(root,{recursive:true});
const daemon=fs.readFileSync(path.resolve(__dirname,"../mcp-server/bridge-daemon.js"),"utf8"),start=daemon.indexOf("function wrapExtendScriptBody(body) {"),end=daemon.indexOf("\nconst EXTENDSCRIPT_BODY_LINE_OFFSET",start);
const wrap=vm.runInNewContext("("+daemon.slice(start,end)+")");
assert(daemon.indexOf("titleExportRecovery.assertNative",daemon.indexOf("function enqueueAeCommand"))<daemon.indexOf("ownedRuntimeService.assertCommandTicket",daemon.indexOf("function enqueueAeCommand")));
let checks=0;
function fixture(mode="ok"){
  const dir=path.join(root,crypto.randomUUID());fs.mkdirSync(dir);const source=path.join(dir,"source.aep"),checkpoint=path.join(dir,"checkpoint.aep");fs.writeFileSync(source,"saved source");fs.copyFileSync(source,checkpoint);
  const args={expectedProjectFile:source,expectedSourceSha25664:tool.fileRecord(source).sha25664,expectedRevision:7,expectedStateHash:"",compItemId:1,variants:[{layerId:11,name:"TITR_01",snapshotFileName:"titr_01_ame_product_20261015.aep"},{layerId:12,name:"TITR_02",snapshotFileName:"titr_02_ame_product_20261015.aep"}]};
  const baseline={projectFile:source,revision:7,controlled:args.variants.map((v,i)=>({id:v.layerId,name:v.name,enabled:i===0,text:v.name})),graph:[],queue:[]};args.expectedStateHash=variants.digest(baseline);
  const targets=args.variants.map(v=>path.join(dir,v.snapshotFileName));for(const file of targets)fs.writeFileSync(file,"");const reservations=targets.map(file=>tool.fileRecord(file,true));
  for(const file of targets){const replacement=file+".new";fs.writeFileSync(replacement,"saved snapshot "+file);fs.renameSync(replacement,file);}
  assert(targets.every((file,i)=>tool.fileRecord(file).inode!==reservations[i].inode),"Atomic save fixture must replace reservation inode");
  const runId=crypto.randomUUID(),commandId=crypto.randomUUID(),owner={panelConnectionId:"panel-test",panelGeneration:"123"};
  const command={id:commandId,role:"mutation",executionId:runId,state:"timed_out_after_submit",timedOutFrom:"submitted",leaseOwner:owner};
  const record={schema:"ae-agent-plan-run-record.v1",runId,plan:{steps:[{tool:tool.TOOL,args}]},project:{file:source},run:{id:runId,dryRun:false,ok:false,provenance:{runtime:{sourceSha256:"a".repeat(64)}},steps:[{tool:tool.TOOL,index:1,args,commands:[{role:"readback",state:"completed",ok:true,result:{snapshot:baseline,dirty:false}},command],exportSnapshots:{schema:tool.SCHEMA,phase:"native_submitted",source:tool.fileRecord(source),checkpoint:tool.fileRecord(checkpoint),targets,reservations,automaticRetryAllowed:false}}]}};
  records.writeRecord(dir,record);const originalBytes=fs.readFileSync(records.fileFor(dir,runId)),selector={schema:tool.RECOVERY_SCHEMA,runId,commandId,runRecordSha256:records.digest(JSON.stringify(record))};
  const marker=path.join(dir,"title-export-recovery-arm.json");fs.writeFileSync(marker,JSON.stringify(selector));
  const log=path.join(dir,"bridge-events.jsonl"),append=(id,script,extra={})=>fs.appendFileSync(log,JSON.stringify({type:"ae_command_queued",runtime:{sourceSha256:"a".repeat(64)},details:{id,script:script.length>1000?script.slice(0,1000)+"...<truncated>":script,scriptSha25664:crypto.createHash("sha256").update(script,"utf8").digest("hex"),...extra}})+"\n");append(commandId,"original",{runId});
  const flags=slot=>args.variants.map((v,i)=>({id:v.layerId,name:v.name,enabled:slot===null?i===0:i===slot}));
  const native={schema:tool.SCHEMA,ok:true,phase:"restored",saved:targets.map((file,i)=>({path:file,revision:8+i,dirty:false,guid:"00000001-0000-0000-0000-000000000000",flags:flags(i)})),restored:{path:source,revision:10,dirty:false,flags:flags(null)}};
  if(mode==="bad-flags")native.saved[1].flags[0].enabled=true;if(mode==="bad-path")native.saved[0].path+="foreign";if(mode==="bad-guid")native.saved[0].guid="forged";if(mode==="bad-schema")native.schema="foreign";if(mode==="bad-type")native.saved[0].dirty="false";
  const context=vm.createContext({__codexMcpBridgeResult:JSON.stringify({ok:true,result:native}),app:{project:{dirty:false}},JSON:undefined}),executor=tool.createExecutor({});
  let recovery,nativeCalls=0,captureCalls=0,actorCalls=0,drift=mode==="readback-drift",guardDenials=0;
  const actor={state:{bridgeConnection:{panelConnectionId:owner.panelConnectionId},panelGeneration:owner.panelGeneration,panelInstanceId:"instance",panelLifecycleEpoch:1,nativeControlIdle:true,activeAction:null,recoveryTransport:null,actionStorage:"ready"}};
  const deps={root:dir,loadRecord:id=>records.readRecord(dir,id,{throwOnError:true}),wrap,readActor:async()=>{actorCalls++;return JSON.parse(JSON.stringify(actor));},commandSettled:()=>mode!=="capture-unknown",readNative:async(body,scope)=>{
    nativeCalls++;if(scope.label==="capture")captureCalls++;
    assert.throws(()=>recovery.assertNative(null,"background"),/native_guard/);guardDenials++;
    recovery.assertNative(scope,wrap(body));assert.throws(()=>recovery.assertNative(scope,wrap(body)),/native_guard/);
    const id=crypto.randomUUID();recovery.queued(scope,id);append(id,wrap(body));
    if(mode==="capture-unknown")throw Object.assign(Error("timed_out_after_submit"),{code:"timed_out_after_submit"});
    if(scope.label==="source_verifier"){
      const capture=path.join(dir,"evidence","title-export-recovery",runId+".capture.json");assert(fs.existsSync(capture),"Raw capture must be durable before verifier");
      const snapshot=JSON.parse(JSON.stringify(baseline));snapshot.revision=10;if(drift)snapshot.controlled[0].enabled=false;
      if(mode==="saved-file-drift")fs.appendFileSync(targets[0],"drift");
      body=body.replace("var nativeSnapshot="+variants.nativeSnapshot.toString(),"var nativeSnapshot=function(){return "+JSON.stringify(snapshot)+";}");
    }
    const value=JSON.parse(vm.runInContext(wrap(body),context));if(mode==="actor-drift"&&scope.label==="capture")actor.state.panelLifecycleEpoch++;
    return value;
  }};
  const boot=()=>{recovery=executor.createRecovery(deps);return recovery;};boot();
  return {dir,args,source,checkpoint,selector,marker,record,targets,log,executor,actor,boot,get recovery(){return recovery;},stats:()=>({nativeCalls,captureCalls,actorCalls,guardDenials}),run:()=>recovery.recover({runId,commandId}),assertOriginal:()=>assert.deepEqual(fs.readFileSync(records.fileFor(dir,runId)),originalBytes),clearDrift:()=>{drift=false;},foreign:()=>append(crypto.randomUUID(),"foreign")};
}
(async()=>{
  const good=fixture();assert.throws(()=>good.recovery.assertNative(null,"background"),/native_guard/);const success=await good.run();assert.equal(success.ok,true);assert.equal(good.stats().captureCalls,1);assert.equal(good.stats().guardDenials,2);assert.equal(good.recovery.status().guardHeld,false);assert.equal(fs.existsSync(good.marker),false);good.assertOriginal();checks++;
  for(const s of success.recovered.snapshots)assert.equal(good.executor.assertSavedSource({sourcePath:s.path,sourceSha25664:s.sha25664,sourceGuid:s.native.guid}),true);checks++;
  await good.run();assert.equal(good.stats().nativeCalls,2);good.boot();assert.equal(good.recovery.status().guardHeld,false);checks++;
  for(const mode of ["bad-flags","bad-path","bad-guid","bad-schema","bad-type","actor-drift","readback-drift","saved-file-drift"]){const f=fixture(mode),r=await f.run();assert.equal(r.ok,false,mode);assert.equal(r.replayAllowed,false);assert.equal(f.recovery.status().guardHeld,false,mode);assert(fs.existsSync(path.join(f.dir,"evidence","title-export-recovery",f.selector.runId+".capture.json")));assert.throws(()=>f.executor.assertSavedSource({sourcePath:f.targets[0]}),/binding_required/);f.assertOriginal();checks++;}
  const resume=fixture("readback-drift");assert.equal((await resume.run()).ok,false);resume.clearDrift();fs.writeFileSync(resume.marker,JSON.stringify(resume.selector));resume.boot();assert.equal((await resume.run()).ok,true);assert.equal(resume.stats().captureCalls,1,"Resume must use durable raw, never recapture global");resume.assertOriginal();checks++;
  const stale=fixture();stale.foreign();assert.equal((await stale.run()).code,"title_recovery_later_native_command");assert.equal(stale.stats().nativeCalls,0);assert.equal(stale.recovery.status().guardHeld,false);checks++;
  const actor=fixture();actor.actor.state.panelGeneration="different";assert.equal((await actor.run()).code,"title_recovery_panel_actor_changed");assert.equal(actor.stats().nativeCalls,0);checks++;
  const source=fixture();fs.appendFileSync(source.source,"drift");assert.equal((await source.run()).code,"title_export_file_changed");assert.equal(source.stats().nativeCalls,0);checks++;
  const cp=fixture();fs.appendFileSync(cp.checkpoint,"drift");assert.equal((await cp.run()).code,"title_export_file_changed");checks++;
  const forged=fixture();await assert.rejects(forged.recovery.recover({...forged.selector,data:"forged"}),/exact_selector/);assert.equal(forged.stats().nativeCalls,0);checks++;
  const corrupt=fixture();fs.writeFileSync(corrupt.marker,JSON.stringify({...corrupt.selector,runRecordSha256:"0".repeat(64)}));assert.throws(corrupt.boot,/original_record_invalid/);checks++;
  const unknown=fixture("capture-unknown");assert.equal((await unknown.run()).guardHeld,true);assert.equal(unknown.recovery.status().guardHeld,true);assert.throws(()=>unknown.recovery.assertNative(null,"background"),/native_guard/);await unknown.run();assert.equal(unknown.stats().captureCalls,1);checks++;
  console.log(JSON.stringify({ok:true,checks,evidence:"offline actual recovery/executor/files/wrapper; no live AE, saves, opens or replay",root}));
})().catch(error=>{console.error(error);process.exitCode=1;});

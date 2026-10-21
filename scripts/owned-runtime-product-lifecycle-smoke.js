"use strict";
// Actual lifecycle modules with bounded private fake OS/HTTP ports. No live work.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto"),vm=require("node:vm");
const supervisor=require("../mcp-server/owned-runtime-supervisor"),product=require("../mcp-server/owned-runtime-product-lifecycle"),service=require("../mcp-server/owned-runtime-service"),authority=require("../mcp-server/owned-runtime-authority"),ledger=require("../mcp-server/native-fixture-attempt-ledger"),r1=require("../mcp-server/owned-runtime-lifecycle"),evidence=require("../mcp-server/review-evidence");
const {fixture}=require("./owned-runtime-supervisor-smoke"),cases=[];const uuid=()=>crypto.randomUUID(),copy=v=>JSON.parse(JSON.stringify(v));
function adapterFixture(f){
  const {EventEmitter}=require("node:events"),{createRequire}=require("node:module"),file=path.resolve(__dirname,"../mcp-server/mcp-adapter.js"),actual=createRequire(file),module={exports:{}};let healthy=false;
  const http={request(_options,callback){const request=new EventEmitter();request.end=()=>queueMicrotask(()=>{if(!healthy){request.emit("error",Error("offline_daemon_absent"));return;}const response=new EventEmitter();response.statusCode=200;response.setEncoding=()=>{};callback(response);response.emit("data",JSON.stringify({ok:true,server:"offline fake health"}));response.emit("end");});return request;}};
  const owned=supervisor.createOwnedRuntimeSupervisor(f.deps),controller={ensure:async()=>{const result=await owned.ensure();if(result.status==="owned_daemon_registered_admission_closed")healthy=true;return result;}};
  const context=vm.createContext({module,exports:module.exports,process:{env:{AE_DAEMON_AUTO_START:"1"},stderr:{write(){}}},Buffer,AbortController,require:name=>name==="http"?http:name==="./owned-runtime-supervisor"?{createOwnedRuntimeSupervisor:()=>controller}:actual(name)});
  vm.runInContext(fs.readFileSync(file,"utf8"),context,{filename:file});return module.exports;
}
async function check(name,fn){await fn();cases.push(name);}
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));}
async function first(){
  const f=fixture({absent:true,product:true});f.p.acceptedServerCoverage=["owned_daemon_lifecycle"];write(path.join(f.base,"policy.json"),f.p);
  write(path.join(f.root,product.MIGRATION_DIR,"result.json"),{ok:true,mode:"applied",applyRun:true,authority:false,oldExitProven:false,replayAllowed:false,daemonLaunched:false,head:"f92e3b01ef3e6c7008298880577e1a2543b2c334",foreignPreserved:7,journalsPreserved:3});
  try{const result=await f.run("ensure");f.options.absent=false;f.initial=result;return f;}catch(e){f.cleanup();throw e;}
}
function repair(f){
  const generation=f.initial.generation,c=supervisor.readCandidate(f.root,generation),row=JSON.parse(ledger.readBytes(path.join(f.base,"daemon-reservations",generation,"registration.json"))),refs={reservationSha256:c.reservation.sha256,startupTicketSha256:c.ticket.sha256,nativeCandidateSha256:c.candidate.sha256,registrationSha256:row.sha256,bootNonce:c.candidate.value.bootNonce};
  const snapshotDir=path.join(f.root,product.MIGRATION_DIR,"known-product-before-repair"),pins=c.reservation.value.sourcePins.map(p=>({...p,name:"source/"+p.name}));
  for(const p of pins){const dest=path.join(snapshotDir,p.name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(f.root,p.name.slice(7)),dest);}
  const metadata=[];for(const name of ["reservation.json","startup-ticket.json","native-candidate.json","registration.json","current-daemon.json","lifetime-events.jsonl"]){const dest=path.join(snapshotDir,name);fs.mkdirSync(path.dirname(dest),{recursive:true});if(name==="lifetime-events.jsonl")fs.writeFileSync(dest,"offline lifetime only");else fs.copyFileSync(name==="current-daemon.json"?path.join(f.base,name):path.join(f.base,"daemon-reservations",generation,name),dest);metadata.push({name,sha256:ledger.hash(ledger.readBytes(dest))});}
  const snapshotFile=path.join(snapshotDir,"snapshot.json");write(snapshotFile,{generation,sourceSha256:c.candidate.value.sourceSha256,registration:supervisor.readDaemonRegistration(f.root),pins,metadata,aeCommandsDelivered:0,writeAdmissionReleased:false,replayAllowed:false,oldExperimentalOutcome:"unknown_preserved"});
  const handleOpenedAt="2026-10-15T16:00:00.000Z",intent={schema:product.INTENT,operationId:uuid(),generation,registration:refs,identity:c.candidate.value.kernelIdentity,argv:c.candidate.value.argv,sourceSha256:c.candidate.value.sourceSha256,authorizationRef:f.p.authorization,migration:product.migration(f.root).value,quiescence:{pendingCommands:0,inflightCommands:0,activeEditSession:null,activeTickets:0,writeAdmission:"retained_audit_and_fresh_adoption_required",neverAdmitted:true,lifecycleDisposition:"fresh_missing_no_work"},snapshotRawSha256:ledger.hash(ledger.readBytes(snapshotFile)),handleOpenedAt,createdAt:handleOpenedAt,replayAllowed:false};
  const dir=path.join(f.base,"product-repair-retirements"),intentFile=path.join(dir,generation+".intent.json");write(intentFile,intent);
  const value={schema:product.REPAIR,kind:"never_admitted_product_repair",operationId:intent.operationId,generation,registration:refs,identity:intent.identity,argv:intent.argv,sourceSha256:intent.sourceSha256,authorizationRef:intent.authorizationRef,migration:intent.migration,intentRawSha256:ledger.hash(ledger.readBytes(intentFile)),quiescence:intent.quiescence,proof:{waitResult:"WAIT_OBJECT_0",exitCode:137,identity:intent.identity,handleOpenedAt,observedAt:"2026-10-15T16:00:01.000Z"},graceful:false,replayAllowed:false,authentication:"0".repeat(64)};value.authentication=product.signed(value,f.key);r1.writeJournalOnce(dir,generation,value);return {generation,dir,intentFile,value,receiptFile:path.join(dir,generation+".json"),snapshotDir};
}
async function main(){
  await check("first_product_genesis_without_legacy_and_closed_write_shutdown_then_ensure",async()=>{const f=await first();try{
    assert.equal(supervisor.readProductStopAuthority(f.root,f.initial.generation),true);const opened=f.counts.open;
    const stopped=await f.run("shutdown");assert.equal(stopped.shutdownExitProven,true);assert.equal(f.counts.shutdown,1);
    f.options.openError="owned_native_process_access_refused";const result=await f.run("ensure");assert.notEqual(result.generation,f.initial.generation);assert.equal(f.counts.open,opened+1);assert.equal(supervisor.readProductStopAuthority(f.root,result.generation),true);
  }finally{f.cleanup();}});
  await check("observed_exit_source_change_and_product_succession",async()=>{const f=await first();try{
    f.setExited(true);fs.writeFileSync(path.join(f.root,"mcp-server/bridge-daemon.js"),"// updated product");f.source.modules[0].sha256=ledger.hash(ledger.readBytes(path.join(f.root,"mcp-server/bridge-daemon.js")));f.source.sourceSha256=evidence.sha256(f.source.modules);
    const result=await f.run("ensure");assert.notEqual(result.generation,f.initial.generation);assert.equal(f.counts.drain,0);assert.equal(supervisor.readProductStopAuthority(f.root,result.generation),true);
  }finally{f.cleanup();}});
  await check("repair_receipt_preserved_old_sources_no_reopen_and_successor_registration",async()=>{const f=await first();try{const r=repair(f);fs.appendFileSync(path.join(f.root,"mcp-server/bridge-daemon.js"),"changed source");const verified=supervisor.readVerifiedProductRepairRetirement(f.root,r.generation);assert.equal(verified.graceful,false);f.options.openError="must_not_reopen_retired_pid";const result=await f.run("ensure");assert.notEqual(result.generation,r.generation);assert.equal(f.counts.open,0);assert.equal(f.counts.drain,0);assert.equal(supervisor.readProductStopAuthority(f.root,result.generation),true);}finally{f.cleanup();}});
  for(const corruption of ["mac","crossgen","false_graceful","snapshot","unknown"]){await check("repair_"+corruption+"_rejected_before_launch",async()=>{const f=await first();try{const r=repair(f),before=f.counts.launch;if(corruption==="snapshot")fs.appendFileSync(path.join(r.snapshotDir,"source/mcp-server/bridge-daemon.js"),"tampered");else if(corruption==="unknown")fs.unlinkSync(r.receiptFile);else{const row=JSON.parse(ledger.readBytes(r.receiptFile));if(corruption==="mac")row.value.authentication="0".repeat(64);if(corruption==="crossgen")row.value.generation=uuid();if(corruption==="false_graceful")row.value.graceful=true;row.sha256=r1.hash(row.value);write(r.receiptFile,row);}await assert.rejects(f.run("ensure"));assert.equal(f.counts.launch,before);assert.equal(f.counts.open,0);}finally{f.cleanup();}});}
  await check("product_stop_fresh_missing_quiescence_and_passive_poll_only",async()=>{
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"product-stop-"));let v={pendingCommands:0,inflightCommands:[],activeEditSession:null,projectLifecycle:{enabled:true,blocked:true,problem:"lifecycle_store_missing",freshMissingStoreReadAllowed:true,generation:0,pending:null},bootstrapIdle:true,nativeExecutionIdle:true,productStopQuiescence:{allChildrenExitProven:true,pendingCleanupJobs:0,pendingNativeAttempts:0,outstandingAttempts:0,transportOutstanding:0,planExecutionState:null}};
    const s=service.createOwnedRuntimeService({journalRoot:tmp,readPolicy:()=>({}),readReadiness:()=>v,readAdmission:()=>false,readProductStopAuthority:()=>true});
    try{assert.equal(s.readiness().ready,true);assert.throws(()=>s.run("execution",()=>{}),/admission_closed/);let finish;const waiting=s.ingress({method:"GET",url:"/bridge/next"},()=>new Promise(resolve=>{finish=resolve;}));assert.equal(s.readiness().activeTickets,1);assert.equal(s.readiness().activeStopTickets,0);assert.equal(s.readiness().ready,true);
      for(const kind of ["observation","completion","intake"]){s.run(kind,()=>assert.equal(s.readiness().ready,false));}
      await s.runBootstrap(async()=>assert.equal(s.readiness().ready,false));
      for(const update of [{pendingCommands:1},{inflightCommands:[{}]},{activeEditSession:{}},{nativeExecutionIdle:false},{bootstrapIdle:false},{productStopQuiescence:{...v.productStopQuiescence,outstandingAttempts:1}},...[undefined,"unknown","confirmed","executing"].map(state=>({productStopQuiescence:{...v.productStopQuiescence,planExecutionState:state}})),{projectLifecycle:{...v.projectLifecycle,freshMissingStoreReadAllowed:false}},{projectLifecycle:{...v.projectLifecycle,problem:"lifecycle_store_corrupt"}}]){const old=v;v={...v,...update};assert.equal(s.readiness().ready,false);v=old;}
      finish();await waiting;assert.equal(s.readiness().activeTickets,0);
    }finally{fs.rmSync(tmp,{recursive:true,force:true});}
  });
  await check("actual_enqueue_and_next_delivery_keep_private_lifecycle_gate_under_passive_ticket",async()=>{
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"product-delivery-")),pending=[],inflight=new Map(),capability={},owner={panelConnectionId:"offline",panelGeneration:"1"};let validations=0,valid=true;
    const s=service.createOwnedRuntimeService({journalRoot:tmp,readPolicy:()=>({}),readReadiness:()=>({}),readAdmission:()=>false,readProductStopAuthority:()=>true});
    const source=fs.readFileSync(path.resolve(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");
    const slice=(start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);assert(from>=0&&to>from);return source.slice(from,to);};
    // The production enqueue path already includes the title-recovery guard.
    // This unrelated read has no title authority; model that private null port.
    const nullContext={getStore:()=>null},context=vm.createContext({initialRuntime:null,ownedRuntimeService:s,crypto,pendingCommands:pending,inflightCommands:inflight,titleExportRecovery:{assertNative(context){assert.equal(context,null);}},titleRecoveryCommandContext:nullContext,
      ameOpenCompExecutor:{assertNative(c){assert.equal(c,null);},queued(c){assert.equal(c,null);}},ameOpenCompCommandContext:nullContext,
      ameJobSourceExecutor:{assertNative(c){assert.equal(c,null);},queued(c){assert.equal(c,null);}},ameJobSourceCommandContext:nullContext,
      titleVerificationExecutor:{assertNative(c){assert.equal(c,null);},queued(c){assert.equal(c,null);}},titleVerificationCommandContext:nullContext,
      panelBootstrapService:{isBusy:()=>false},panelBootstrapReadContext:nullContext,lifecycleCommandContext:{getStore:()=>({capability,rawScript:"fixed read"})},generatedRecoveryReadContext:nullContext,autonomousCommandContext:nullContext,planCommandContext:nullContext,
      lifecycle:{validateCommand(actual){validations++;assert.equal(actual,capability);if(!valid)throw Object.assign(Error("private_lifecycle_refused"),{code:"private_lifecycle_refused"});},phaseFacts:()=>({readbackRole:"read"})},
      capturePlanCommand(){},setTimeout:()=>({}),clearTimeout(){},recordEvent(){},drainWaitingPanels(){},timeoutAeCommand(){},generatedRecoveryLeaseScope:()=>null,expireQueuedCommands(){},panelLeaseOwner:()=>owner,findActiveEvalScriptCommandForOwner:()=>null,rejectRevokedAutonomousCommand:()=>false,commandForPanel:v=>v,
      retainCommandResult(){},settleCommandFailure(command,code){command.reject(Object.assign(Error(code),{code}));},Date,Promise});
    vm.runInContext(slice("function enqueueAeCommand(","function expireQueuedCommands(")+slice("function leaseNextQueuedCommand(","async function retireGeneratedRecoveryForNormalPoll("),context);
    try{
      const read=s.run("observation",()=>context.enqueueAeCommand("fixed read",1000));assert.equal(pending.length,1);
      const delivered=s.ingress({method:"GET",url:"/bridge/next"},()=>{s.assertCommandTicket();assert.throws(()=>s.assertExecutionTicket(),/admission_closed/);return context.leaseNextQueuedCommand({},new URL("http://127.0.0.1/bridge/next"));});
      assert.equal(delivered.lifecycleCapability,capability);assert.equal(delivered.state,"leased");assert.equal(validations,2);delivered.resolve({read:true});inflight.delete(delivered.id);await read;
      const refused=s.run("observation",()=>context.enqueueAeCommand("fixed read",1000));valid=false;const empty=s.ingress({method:"GET",url:"/bridge/next"},()=>context.leaseNextQueuedCommand({},new URL("http://127.0.0.1/bridge/next")));
      assert.equal(empty,null);await assert.rejects(refused,{code:"private_lifecycle_refused"});assert.equal(pending.length,0);assert.equal(inflight.size,0);
    }finally{fs.rmSync(tmp,{recursive:true,force:true});}
  });
  await check("actual_adapter_absent_bridge_uses_supervisor_default_uuid_once",async()=>{
    const f=fixture({absent:true});try{const adapter=adapterFixture(f),results=await Promise.all([adapter.ensureDaemonRunning(),adapter.ensureDaemonRunning()]);assert(results.every(r=>r.ok===true));assert.equal(f.counts.launch,1);const ids=fs.readdirSync(path.join(f.base,"supervisor-operations"));assert.equal(ids.length,1);assert(ledger.UUID.test(ids[0]));}finally{f.cleanup();}
  });
  await check("actual_adapter_unknown_reentry_uses_durable_semantic_key_without_relaunch",async()=>{
    const f=fixture({absent:true,partialSpawn:true});try{const adapter=adapterFixture(f);await assert.rejects(adapter.ensureDaemonRunning());assert.equal(f.counts.launch,1);const ids=fs.readdirSync(path.join(f.base,"supervisor-operations"));assert.equal(ids.length,1);assert(ledger.UUID.test(ids[0]));await assert.rejects(adapter.ensureDaemonRunning());assert.equal(f.counts.launch,1);assert.deepEqual(fs.readdirSync(path.join(f.base,"supervisor-operations")),ids);assert(supervisor.readSupervisor(f.root,ids[0]).rows.unknown);}finally{f.cleanup();}
  });
  process.stdout.write(JSON.stringify({ok:true,cases,scope:"offline actual modules and fake private ports",liveAE:false,actualNativeFactories:0,actualHttp:false})+"\n");
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});

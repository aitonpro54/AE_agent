"use strict";
// Offline production admission/backend/daemon seams. No HTTP, CDP, AE, child,
// replay or durable production-evidence writes; fixtures live only in TEMP.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),Module=require("node:module");
const {fixture,certified,admissionSession}=require("./native-fixture-prephase-recovery-smoke"),recovery=require("../mcp-server/native-fixture-prephase-recovery"),backend=require("../mcp-server/native-fixture-prephase-recovery-backend"),ledger=require("../mcp-server/native-fixture-attempt-ledger"),proof=require("../mcp-server/native-fixture-prephase-recovery-proof"),abandonment=require("../mcp-server/native-fixture-abandonment");
const ROOT=path.resolve(__dirname,".."),checks=[],clone=ledger.clone;
async function test(name,fn) {const f=fixture();try{await fn(f);for(const [relative,digest] of Object.entries(f.originals))assert.equal(ledger.hash(fs.readFileSync(path.join(ROOT,relative))),digest);checks.push(name);}finally{f.dispose();}}
async function setup(f) {await certified(f);return admissionSession(f);}
function runnerBarrier(f,options={}) {
  const filename=require.resolve("../mcp-server/ame-native-fixture-runner"),m=new Module(filename,module),base=Module.createRequire(filename),calls={issuer:0,execute:0,ledger:0},children=[];m.filename=filename;m.paths=module.paths;
  const nativeCounters={prepared:0,launch:0,phase:0,unknown:0,accepted:0};
  m.require=request=>request==="./ame-native-fixture-grant" ? {...base(request),createFixtureGrantIssuer:deps=>options.createIssuer ? options.createIssuer(deps,calls) : ({
    authorize:async()=>{calls.issuer++;if(options.afterIssuer)await options.afterIssuer();return {};},
    prepareChild:async(_cap,id)=>{nativeCounters.prepared++;const d=deps.getOwnedChild(id),child={id};children.push({descriptor:d,child});if(options.afterPrepare)await options.afterPrepare();return {child,manifestBytes:Buffer.from("offline manifest\n"),environment:{}};},
    markUnknown:()=>{nativeCounters.unknown++;},
    acceptReceipt:async()=>{if(++nativeCounters.accepted>1)ledger.fail("offline_phase_barrier_crossed");if(options.afterBoot)await options.afterBoot();return {status:"boot-verified",receipt:{}};},
    issuePhase:async child=>{nativeCounters.phase++;if(options.afterPhase)await options.afterPhase();const d=children.find(row=>row.child===child).descriptor,receipt=path.join(d.rootPath,"signed-fixture.json");if(!fs.existsSync(receipt))fs.writeFileSync(receipt,"{}");return {filename:"signed-create-fixture.grant",bytes:Buffer.from("offline simulated signed grant")};}
  })} : request==="./native-fixture-attempt-ledger" ? {...ledger,assertAdmission:(_root,_exclude,admission)=>{calls.ledger++;recovery.assertAdmission(admission.brand,admission.context,f.repoRoot);}} : request==="./native-fixture-prephase-recovery" && options.afterBind ? {...recovery,bindAdmission:async(...args)=>{const brand=await recovery.bindAdmission(...args);await options.afterBind();return brand;}} : base(request);
  m._compile(fs.readFileSync(filename,"utf8"),filename);
  const processFor=d=>({pid:6100,createdUnixMs:1791696000000,createdAt:"2026-10-11T05:20:00.0000000Z",path:d.executablePath});
  const executor=m.exports.createExecutor({repoRoot:f.repoRoot,assertManualIngress:f.deps.assertManualIngress,prephaseRecoveryReaders:()=>f.deps,getArtifacts:()=>{calls.execute++;if(options.artifacts)return options.artifacts;throw Error("offline_execute_not_allowed");},
    launchChild:async d=>{nativeCounters.launch++;fs.writeFileSync(path.join(d.rootPath,"signed-boot.json"),"{}");return {pid:6100,process:processFor(d)};},inspectProcess:async()=>processFor(children[0].descriptor)});
  return {executor,calls,nativeCounters,children};
}
function offlineArtifacts(f) {
  f.context.record.revision=2;f.context.record.payloadHash="sha256:"+"a".repeat(64);
  const dir=path.join(f.repoRoot,"offline-artifacts");fs.mkdirSync(dir);const binary=path.join(dir,"probe.aex"),pluginPath=path.join(dir,"installed.aex"),executablePath=path.join(dir,"afterfx.exe");fs.writeFileSync(binary,"offline probe");fs.writeFileSync(executablePath,"offline exe");return {binary,pluginPath,executablePath,pluginSha256:ledger.hash(fs.readFileSync(binary)),executableSha256:ledger.hash(fs.readFileSync(executablePath)),receipt:{buildId:"offline"}};
}
function checkpointIssuer(f) {
  const grant=require("../mcp-server/ame-native-fixture-grant"),m100=require("../mcp-server/m100-protocol"),context=f.context,r=context.record,contractVersion="offline-fixture-v2";
  Object.assign(context,{source:"ai-plan-run",confirm:true,autonomous:false,allowWithoutCheckpoint:false,stepCount:1});
  r.payload={kind:"agent_plan",plan:{targetProject:{file:r.project.expectedFile},steps:[{tool:grant.TOOL_NAME,args:context.args}]}};
  Object.assign(r,{revision:2,payloadHash:m100.sha256Payload(r.payload),executionId:context.runId,executionState:"executing",riskLevel:"mutating",confirmedBySurface:"cep-panel",confirmationSurface:"cep-panel",proposalExpiresAt:new Date(f.deps.now()+300000).toISOString()});
  r.dryRunReceipt={payloadHash:r.payloadHash,contractVersion,stepCount:1,projectFile:r.project.expectedFile};fs.writeFileSync(context.checkpoint.checkpointFile,"offline checkpoint");
  return (_deps,calls)=>{
    const issuer=grant.createFixtureGrantIssuer({ownedParent:path.join(f.repoRoot,".codex-runtime","ame-native-fixtures"),contractVersion,now:f.deps.now,getCurrentRecord:()=>r,getCheckpoint:()=>context.checkpoint,getOwnedChild:()=>null,inspectProcess:async()=>false,consumeAttempt:async()=>false,assertManualIngress:f.deps.assertManualIngress,
      filesystem:{...fs.promises,readFile:async(file,...args)=>{const bytes=await fs.promises.readFile(file,...args);if(file===context.checkpoint.checkpointFile)f.primary.revision++;return bytes;}}});
    return {...issuer,authorize:async c=>{calls.issuer++;return issuer.authorize(c);}};
  };
}
async function barrierTests(collectFailures=false) {
  const rows=[
    ["primary drift after final transport read stops before issuer",async f=>{await setup(f);const read=f.deps.readTransportAbsence;let count=0;f.deps.readTransportAbsence=async(...args)=>{const value=await read(...args);if(++count===4)f.primary.revision++;return value;};const t=runnerBarrier(f);await assert.rejects(()=>t.executor.authorize(f.context),e=>e.code==="fixture_prephase_primary_state_changed");assert.equal(t.calls.issuer,0);assert.equal(t.calls.execute,0);}],
    ["primary drift after bind stops before issuer",async f=>{await setup(f);const t=runnerBarrier(f,{afterBind:async()=>{f.primary.dirty=true;}});await assert.rejects(()=>t.executor.authorize(f.context),e=>e.code==="fixture_prephase_primary_state_changed");assert.equal(t.calls.issuer,0);assert.equal(t.calls.execute,0);}],
    ["primary drift in actual issuer checkpointHash await prevents capability return",async f=>{await setup(f);const t=runnerBarrier(f,{createIssuer:checkpointIssuer(f)});await assert.rejects(()=>t.executor.authorize(f.context),e=>e.code==="fixture_prephase_primary_state_changed");assert.equal(t.calls.issuer,1);assert.equal(t.calls.execute,0);}],
    ["primary drift from capability to execute stops before artifacts",async f=>{await setup(f);const t=runnerBarrier(f),cap=await t.executor.authorize(f.context);f.primary.dirty=true;await assert.rejects(()=>t.executor.execute(f.context.args,cap),e=>e.code==="fixture_prephase_primary_state_changed");assert.equal(t.calls.execute,0);assert.equal(t.nativeCounters.launch,0);}],
    ["primary drift in prepareChild await stops before native launch with reserved FS",async f=>{await setup(f);const t=runnerBarrier(f,{artifacts:offlineArtifacts(f),afterPrepare:async()=>{await Promise.resolve();f.primary.revision++;}}),cap=await t.executor.authorize(f.context);await assert.rejects(()=>t.executor.execute(f.context.args,cap),e=>e.code==="fixture_prephase_primary_state_changed");assert.equal(t.nativeCounters.prepared,1);assert.equal(t.nativeCounters.launch,0);assert(fs.existsSync(t.children[0].descriptor.rootPath));assert(ledger.read(ledger.fileFor(f.repoRoot,t.children[0].descriptor.stageId,"reservation")));}],
    ["primary drift before phase issuer stops phase authority after launch",async f=>{await setup(f);const t=runnerBarrier(f,{artifacts:offlineArtifacts(f),afterBoot:async()=>{f.primary.dirty=true;}}),cap=await t.executor.authorize(f.context);await assert.rejects(()=>t.executor.execute(f.context.args,cap),e=>e.code==="fixture_prephase_primary_state_changed");assert.equal(t.nativeCounters.launch,1);assert.equal(t.nativeCounters.phase,0);assert(t.nativeCounters.unknown>0);await assert.rejects(()=>t.executor.execute(f.context.args,cap),e=>e.code==="fixture_runner_authorization_required");}],
    ["primary drift in issuePhase await stops signed grant publication and replay",async f=>{await setup(f);const t=runnerBarrier(f,{artifacts:offlineArtifacts(f),afterPhase:async()=>{await Promise.resolve();f.primary.revision++;const d=t.children[0].descriptor;fs.writeFileSync(path.join(d.rootPath,"signed-fixture.json"),"{}");}}),cap=await t.executor.authorize(f.context);await assert.rejects(()=>t.executor.execute(f.context.args,cap),e=>e.code==="fixture_prephase_primary_state_changed");assert.equal(t.nativeCounters.launch,1);assert.equal(t.nativeCounters.phase,1);assert.equal(fs.existsSync(path.join(t.children[0].descriptor.rootPath,"signed-create-fixture.grant")),false);assert(ledger.read(ledger.fileFor(f.repoRoot,t.children[0].descriptor.stageId,"unknown")));await assert.rejects(()=>t.executor.execute(f.context.args,cap),e=>e.code==="fixture_runner_authorization_required");}]
  ],failures=[];
  for(const [name,fn] of rows)try{await test(name,fn);}catch(error){if(!collectFailures)throw error;failures.push({name,message:error.message});}
  if(failures.length)throw Object.assign(Error("offline admission barrier regressions failed"),{failures});return rows.length;
}
async function denied(f,code) {
  const {executor,calls}=runnerBarrier(f);
  await assert.rejects(async()=>{const cap=await executor.authorize(f.context);await executor.execute(f.context.args,cap);},e=>e.code===code);
  assert.deepEqual(calls,{issuer:0,execute:0,ledger:0});
}
function daemonSeam(f) {
  const source=fs.readFileSync(path.join(ROOT,"mcp-server","bridge-daemon.js"),"utf8"),helperStart=source.indexOf("async function readNativeFixturePrimaryLifecycle()"),helperEnd=source.indexOf("const ameFixtureExecutor =",helperStart),factoryStart=source.indexOf("function nativePrephaseReaders()"),factoryEnd=source.indexOf("function nativePrephaseMaintenanceReaders()",factoryStart);
  const protectionStart=source.indexOf("  if (mutatingExecution && !lifecycleCompletion && !activeEditSessionAtStart && !checkpointStepPresent)"),protectionEnd=source.indexOf("\n  if (lifecycleStep && !dryRun)",protectionStart);
  assert(helperStart>0 && helperEnd>helperStart && factoryEnd>factoryStart && protectionEnd>protectionStart);
  const calls=[],context=vm.createContext({nativeFixturePrephaseBackend:backend,ameFixtureCheckpoints:new Map(),activeEditSession:null,PROJECT_ROOT:f.repoRoot,LOG_DIR:f.evidenceRoot,RUNTIME_IDENTITY:{sourceSha256:f.runtime.loadedRuntimeSha256,modules:[{name:"mcp-server/ame-native-fixture-grant.js",sha256:proof.SOURCES["ame-native-fixture-grant.js"]}]},reviewEvidence:{runtimeIdentity:()=>({sourceSha256:f.runtime.currentRuntimeSha256})},ameFixtureExecutor:{quiescence:f.deps.readExecutorQuiescence,hasAttempt:()=>false},
    getBridgeStatus:()=>f.deps.readBridgeStatus(),currentProposalState:{current:f.context.record,assertCurrent:r=>assert.equal(r,f.context.record)},manualPlanIngress:{assertRequest:r=>assert.equal(r,f.context.record),assertContext:f.deps.assertManualIngress},
    callToolLogged:async(source,name,args)=>{assert.equal(source,"native-fixture-admission-read");assert.equal(name,"get_project_lifecycle_state");assert.equal(Object.keys(args).length,0);calls.push("primary");return {value:clone(f.primary),isError:false};},firstToolPayload:r=>r.value,
    mutatingExecution:true,lifecycleCompletion:false,activeEditSessionAtStart:false,checkpointStepPresent:false,autoEditSession:true,ameFixtureGrant:{TOOL_NAME:"ame_native_fixture_probe"},validation:{steps:[{tool:"ame_native_fixture_probe"}]},options:{_m100ActionRecord:f.context.record},autonomous:null,run:f.protection.entry.run,ameFixturePrimaryBaseline:null,
    autonomousCommandContext:{run:async(_guard,fn)=>fn()},startPlanRunEditSession:async()=>{calls.push("checkpoint");context.activeEditSession=f.protection.activeEditSession;return {ok:true,session:clone(f.protection.activeEditSession),checkpoint:clone(f.context.checkpoint)};},finishRun:()=>{calls.push("blocked");return false;}});
  vm.runInContext(source.slice(helperStart,helperEnd)+source.slice(factoryStart,factoryEnd)+"\nasync function protectFixture(){"+source.slice(protectionStart,protectionEnd)+"}\n",context);
  assert(source.includes("if (ameFixtureContext) rememberNativeFixtureProtection(ameFixtureContext,run,ameFixturePrimaryBaseline);"));
  assert(source.indexOf("rememberNativeFixtureProtection(ameFixtureContext,run,ameFixturePrimaryBaseline);",protectionEnd)<source.indexOf("await ameFixtureExecutor.authorize(ameFixtureContext)",protectionEnd));
  return {context,calls};
}
async function main() {
  await barrierTests();
  await test("owned current auto session passes production backend/predicate before issuer",async f=>{await setup(f);let primaryReads=0;const read=f.deps.readAdmissionProtection;f.deps.readAdmissionProtection=async c=>{primaryReads++;return read(c);};const {executor,calls}=runnerBarrier(f),cap=await executor.authorize(f.context);assert(cap);assert.equal(primaryReads,8);assert.deepEqual(calls,{issuer:1,execute:0,ledger:1});});
  const failures=[
    ["foreign session",f=>{f.protection.activeEditSession.id="foreign";},"fixture_prephase_owned_protection_required"],
    ["prior session",f=>{f.protection.entry.run.safety.activeEditSessionAtStart=true;},"fixture_prephase_owned_protection_required"],
    ["nonautomatic protection",f=>{f.protection.entry.run.safety.protection="active_edit_session";},"fixture_prephase_owned_protection_required"],
    ["wrong run",f=>{f.protection.entry.run.id="wrong-run";},"fixture_prephase_owned_protection_required"],
    ["wrong record identity",f=>{f.protection.entry.record=clone(f.context.record);},"fixture_prephase_owned_protection_required"],
    ["wrong Map checkpoint identity",f=>{f.protection.entry.checkpoint=clone(f.context.checkpoint);},"fixture_prephase_owned_protection_required"],
    ["wrong session checkpoint identity",f=>{f.protection.activeEditSession.checkpoint=clone(f.context.checkpoint);},"fixture_prephase_owned_protection_required"],
    ["foreign checkpoint source",f=>{f.context.checkpoint.sourceFile=path.join(f.repoRoot,"foreign.aep");},"fixture_prephase_owned_protection_required"],
    ["nonempty session operations",f=>{f.protection.activeEditSession.operations.push({tool:"unrelated_mutation"});},"fixture_prephase_owned_protection_required"],
    ["finished session",f=>{f.protection.activeEditSession.status="finished";},"fixture_prephase_owned_protection_required"],
    ["missing session",f=>{f.protection.activeEditSession=null;},"fixture_prephase_owned_protection_required"],
    ["missing Map entry",f=>{f.protection.entry=null;},"fixture_prephase_owned_protection_required"],
    ["missing private reader",f=>{delete f.deps.readAdmissionProtection;},"fixture_prephase_owned_protection_required"],
    ["missing private assertion",f=>{delete f.deps.assertAdmissionProtection;},"fixture_prephase_owned_protection_required"],
    ["missing server baseline",f=>{f.protection.entry.primaryBaseline=null;},"fixture_prephase_primary_state_required"],
    ["unknown project",f=>{f.primary.projectPresent=false;},"fixture_prephase_primary_state_required"],
    ["missing lifecycle evidence",f=>{f.primary=null;},"fixture_prephase_primary_state_required"],
    ["primary file drift",f=>{f.primary.file=path.join(f.repoRoot,"other.aep");},"fixture_prephase_primary_state_changed"],
    ["primary dirty drift",f=>{f.primary.dirty=true;},"fixture_prephase_primary_state_changed"],
    ["primary revision drift",f=>{f.primary.revision++;},"fixture_prephase_primary_state_changed"]
  ];
  for(const key of ["file","dirty","revision"])failures.push(["unsupported lifecycle "+key,f=>{f.primary.supported[key]=false;},"fixture_prephase_primary_state_required"]);
  for(const [name,mutate,code] of failures)await test(name+" denies issuer and execute",async f=>{await setup(f);mutate(f);await denied(f,code);});
  await test("client-shaped witness cannot substitute WeakMap brand",async f=>{await setup(f);const witness=await f.deps.readAdmissionProtection(f.context);f.deps.readAdmissionProtection=async()=>clone(witness);await denied(f,"fixture_prephase_owned_protection_changed");});
  await test("status session must match private owned witness",async f=>{await setup(f);const read=f.deps.readBridgeStatus;f.deps.readBridgeStatus=()=>({...read(),activeEditSession:{...read().activeEditSession,id:"foreign"}});await denied(f,"fixture_prephase_owned_protection_changed");});
  await test("missing status session cannot skip its independent match",async f=>{await setup(f);const read=f.deps.readBridgeStatus;f.deps.readBridgeStatus=()=>{const status=read();delete status.activeEditSession;return status;};await denied(f,"fixture_prephase_owned_protection_changed");});
  for(const driftAt of [2,3,4])await test("primary drift in admission observation "+driftAt+" denies issuer",async f=>{await setup(f);const read=f.deps.readAdmissionProtection;let count=0;f.deps.readAdmissionProtection=async c=>{if(++count===driftAt)f.primary.revision++;return read(c);};await denied(f,"fixture_prephase_primary_state_changed");});
  await test("awaited lifecycle read brackets private Map identity",async f=>{await setup(f);const readers=backend.createReaders({projectRoot:f.repoRoot,evidenceRoot:f.evidenceRoot,panelService:{},assertManualIngress:f.deps.assertManualIngress,getAdmissionProtection:()=>f.protection,readPrimaryProjectLifecycle:async()=>{f.protection.entry={...f.protection.entry};return clone(f.primary);}});f.deps.readAdmissionProtection=readers.readAdmissionProtection;f.deps.assertAdmissionProtection=readers.assertAdmissionProtection;await denied(f,"fixture_prephase_owned_protection_changed");});
  await test("brand reuse rechecks owner operations before later admission",async f=>{await setup(f);const brand=await recovery.bindAdmission(f.context,f.deps);f.protection.activeEditSession.operations.push({tool:"foreign"});assert.throws(()=>recovery.assertAdmission(brand,f.context,f.repoRoot),e=>e.code==="fixture_prephase_owned_protection_required");});
  await test("backend requires the lifecycle reader",async f=>{await setup(f);const readers=backend.createReaders({projectRoot:f.repoRoot,evidenceRoot:f.evidenceRoot,panelService:{},assertManualIngress:f.deps.assertManualIngress,getAdmissionProtection:()=>f.protection});await assert.rejects(()=>readers.readAdmissionProtection(f.context),e=>e.code==="fixture_prephase_primary_state_required");});
  await test("daemon protection and Map factory seam retains real private references",async f=>{await setup(f);const {context,calls}=daemonSeam(f);await context.protectFixture();assert.deepEqual(calls,["primary","checkpoint"]);assert(Object.isFrozen(context.ameFixturePrimaryBaseline));context.rememberNativeFixtureProtection(f.context,context.run,context.ameFixturePrimaryBaseline);const entry=context.ameFixtureCheckpoints.get(f.context.runId);assert.equal(entry.record,f.context.record);assert.equal(entry.run,context.run);assert.equal(entry.checkpoint,f.context.checkpoint);assert.equal(entry.ownedEditSessionId,context.activeEditSession.id);assert(Object.isFrozen(entry));const readers=context.nativePrephaseReaders();f.deps.readAdmissionProtection=readers.readAdmissionProtection;f.deps.assertAdmissionProtection=readers.assertAdmissionProtection;const brand=await recovery.bindAdmission(f.context,f.deps);recovery.assertAdmission(brand,f.context,f.repoRoot);assert.equal(calls.filter(v=>v==="primary").length,7);});
  await test("daemon unsupported baseline stops before checkpoint",async f=>{await setup(f);f.primary.supported.revision=false;const {context,calls}=daemonSeam(f);await context.protectFixture();assert.deepEqual(calls,["primary","blocked"]);assert.equal(context.run.errorCode,"fixture_prephase_primary_state_required");assert.equal(context.ameFixtureCheckpoints.size,0);assert.equal(context.activeEditSession,null);});
  await test("daemon baseline refuses a session appearing during primary read",async f=>{await setup(f);const {context,calls}=daemonSeam(f),read=context.callToolLogged;context.callToolLogged=async(...args)=>{const value=await read(...args);context.activeEditSession=f.protection.activeEditSession;return value;};await context.protectFixture();assert.deepEqual(calls,["primary","blocked"]);assert.equal(context.run.errorCode,"fixture_prephase_owned_protection_required");assert.equal(context.ameFixtureCheckpoints.size,0);});
  for(const mode of ["capture","lookup","maintenance"])await test(mode+" still forbids an active session",async f=>{if(mode!=="capture")await certified(f);admissionSession(f);f.state.activeAction=null;f.guard.controllerIdle=true;if(mode==="maintenance"){f.deps.hasCurrentProposal=()=>false;f.deps.readDaemonRuntime=()=>({daemon:f.runtime.daemon,loadedRuntimeSha256:f.runtime.loadedRuntimeSha256,currentRuntimeSha256:f.runtime.currentRuntimeSha256});}await assert.rejects(()=>mode==="capture" ? recovery.capture({selector:proof.selector()},f.deps) : mode==="lookup" ? recovery.lookup(proof.selector(),f.deps) : recovery.maintenanceQuiescence(f.deps),e=>e.code===(mode==="maintenance" ? "fixture_prephase_maintenance_not_idle" : "fixture_abandonment_writer_not_idle"));});
  await test("abandonment guard still forbids an active session",async f=>{admissionSession(f);f.state.activeAction=null;f.guard.controllerIdle=true;assert.throws(()=>abandonment.guardState(proof.selector(),f.state,f.guard,f.deps.readBridgeStatus(),"lookup"),e=>e.code==="fixture_abandonment_writer_not_idle");});
  process.stdout.write(JSON.stringify({ok:true,checks:checks.length,names:checks,scope:"offline production predicates/backend/daemon Map and runner barrier; no live operations"})+"\n");
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main,barrierTests};

"use strict";

// Offline: actual disposition module, actual CEP sources in VM and authenticated
// isolated loopback HTTP boundary. No CDP, daemon, AE, native launch or provider.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto"), http = require("node:http");
const disposition = require("../mcp-server/ame-fixture-ui-disposition"), records = require("../mcp-server/plan-run-records"), contract = require("../cep-panel/panel-action-contract"), control = require("../mcp-server/cep-panel-control");
const {createBoundary,readJsonObject} = require("../mcp-server/http-boundary"), {createPanelEnvironment} = require("./cep-plan-refresh-smoke");
const createActions = require("../cep-panel/panel-actions");
const SOURCE = fs.readFileSync(path.join(__dirname,"../cep-panel/panel.js"),"utf8"), EXACT = disposition.EXACT, clone = x => JSON.parse(JSON.stringify(x));
const PINS = Object.fromEntries(Object.entries(contract.PIN_SCHEMA.properties).map(([k,v]) => [k,v.enum ? v.enum[0] : v.type === "integer" ? 2 : v.format === "date-time" ? new Date(Date.now()+600000).toISOString() : v.pattern ? "sha256:"+"a".repeat(64) : "synthetic"]));
PINS.actionId = EXACT.actionId; PINS.revision = 2;
const envelope = {protocolVersion:contract.PROTOCOL_VERSION,requestId:EXACT.requestId,action:"plan.run",args:{pins:PINS,confirm:true}};
const selector = {requestId:EXACT.requestId,runId:EXACT.runId};
const reason = "Пользователь рассмотрел неудачный fixture; снять только его admission guard, сохранить неизвестный исторический исход.";
function request(port,token,route,body,headers={}) {
  return new Promise((resolve,reject) => {
    const json = body === undefined ? null : JSON.stringify(body), req = http.request({host:"127.0.0.1",port,path:route,method:json === null ? "GET" : "POST",headers:{"x-ae-bridge-token":token,...(json ? {"content-type":"application/json","content-length":Buffer.byteLength(json)} : {}),...headers}},res => {
      const chunks=[];res.on("data",b => chunks.push(b));res.on("end",() => resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())}));
    });req.on("error",reject);if(json)req.write(json);req.end();
  });
}
function canonicalRecord() {
  const run = {id:EXACT.runId,ok:false,dryRun:false,errorCode:"EPERM",steps:[{index:1,tool:EXACT.tool,status:"failed",errorCode:"EPERM",result:{ok:false,code:"EPERM",automaticRetryAllowed:false}}],
    provenance:{actionId:EXACT.actionId,proposalRevision:2,payloadHash:"sha256:"+"b".repeat(64),planSha256:"c".repeat(64)},m100Action:{actionId:EXACT.actionId,confirmedBySurface:"cep-panel"},
    outcome:{execution:{status:"failed"},mutation:{status:"unknown"},verification:{status:"pending"}}};
  return {schema:"ae-agent-plan-run-record.v1",runId:EXACT.runId,plan:{steps:[{tool:EXACT.tool,args:{fixtureKind:"saved-dirty",restoreDirty:true}}]},run};
}
async function fixture(root,name) {
  const evidenceRoot = path.join(root,name);fs.mkdirSync(evidenceRoot);
  const canonical = canonicalRecord();records.writeRecord(evidenceRoot,canonical);
  const original = {protocolVersion:contract.PROTOCOL_VERSION,requestId:EXACT.requestId,runId:EXACT.runId,action:"plan.run",effect:"protected_plan_run",source:"ui",state:"unknown",phase:"outcome_unresolved",code:"EPERM",delivery:"unknown",replayAllowed:false,
    panelInstanceId:"original-panel",epoch:7,generation:"original-generation",signature:control.computeActionSignature(envelope),result:{run:contract.redactState(canonical.run)}};
  const store = new Map([["codexAePanelActionReceiptsInitialized","1"],["codexAePanelActionReceipts",JSON.stringify({version:1,records:{[EXACT.requestId]:original},tombstones:{},recoveries:{}})],
    ["codexAePanelActionReceiptIndex",JSON.stringify({[EXACT.requestId]:{action:original.action,signature:original.signature}})],["codexAeBridgeToken","fixture-panel"],["codexAeBridgeAutoConnect","0"]]);
  let env = createPanelEnvironment(SOURCE,{storageStore:store}), status = {pendingCommands:0,inflightCommands:[],activeEditSession:null,projectLifecycle:{blocked:false,pending:null},panelBootstrap:{busy:false}}, clock = Date.now(), held = false;
  const panelAssetHashes = Object.fromEntries(["panel-actions.js","panel.js"].map(asset => [asset,disposition.hash(fs.readFileSync(path.join(__dirname,"../cep-panel",asset)))]));
  let runtime = {daemon:{pid:4123,startedAt:new Date(clock-1000).toISOString()},loadedRuntimeSha256:"d".repeat(64),currentRuntimeSha256:"d".repeat(64),panelAssetHashes};
  // Real maintenanceTarget returns this exact binding; Page.id/type are absent.
  let installed = {indexPath:path.join(evidenceRoot,"cep","index.html"),hashes:panelAssetHashes}, target = {url:"file:///exact/index.html",webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/exact-frame"};
  let executor = {quiescent:true,executing:false,pendingCount:0,childProcesses:[]}, transport = {requestId:EXACT.requestId,originalReceiptAbsent:true,pendingCount:0,inflightCount:0}, actorOverride = null, projectionOverride = null, signatureOverride = null;
  const deps = {evidenceRoot,now:() => clock,maintenanceTarget:async() => ({installed:clone(installed),target:clone(target),state:{...clone(env.api.state()),...(actorOverride || {}),nativeControlIdle:true}}),
    readPanelGuard:async value => {const g=clone(env.api.readAmeFixtureUIGuard(value));if(actorOverride)g.currentBinding=clone(actorOverride);if(projectionOverride)g.projection=clone(projectionOverride);if(signatureOverride)g.signatureSha256=signatureOverride;return g;},
    readBridgeStatus:async() => clone(status),readRuntimeIdentity:async() => clone(runtime),readExecutorQuiescence:async() => clone(executor),readTransportAbsence:async() => clone(transport),
    acquireWriterLock:async() => {if(held)throw Error("fixture_writer_busy");held=true;return {release(){held=false;}};}};
  const boundary = createBoundary({automation:"fixture-automation",panel:"fixture-panel"});
  const server = http.createServer(async(req,res) => {
    try {
      boundary.validate(req);const role=boundary.role(req),route=new URL(req.url,"http://127.0.0.1").pathname;let body;
      if(route === "/human-guard-settlement/lookup") {if(role !== "panel")throw Error("role_denied");body={ok:true,settlement:null};}
      else if(route === "/ame/fixture-ui-disposition/lookup") {if(role !== "panel")throw Error("role_denied");body={ok:true,disposition:await disposition.lookup(deps)};}
      else if(route === "/ame/fixture-ui-disposition/capture") {if(role !== "automation")throw Error("role_denied");body={ok:true,capture:await disposition.capture(await readJsonObject(req),deps)};}
      else if(route === "/ame/fixture-ui-disposition/authorize") {if(role !== "automation")throw Error("role_denied");body={ok:true,disposition:await disposition.authorize(await readJsonObject(req),deps)};}
      else throw Error("route_denied");
      res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(body));
    } catch(error) {res.writeHead(error.status || 409,{"content-type":"application/json"});res.end(JSON.stringify({ok:false,code:error.code || error.message}));}
  });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));const port=server.address().port;
  async function answerLookup(override,statusCode) {
    const pending = env.inFlightRequests.find(req => req.path === "/ame/fixture-ui-disposition/lookup");assert(pending,"actual panel trusted GET required");
    const response = await request(port,"fixture-panel",pending.path);pending.respond(statusCode || response.status,override === undefined ? response.body : override);return response;
  }
  const first = env.inFlightRequests.find(req => req.path === "/human-guard-settlement/lookup");assert(first);first.respond(200,{ok:true,settlement:null});await answerLookup();
  const originalBytes=fs.readFileSync(records.fileFor(evidenceRoot,EXACT.runId)), originalProjection=JSON.stringify(env.api.getResult(EXACT.requestId)), privateBytes=JSON.stringify(JSON.parse(store.get("codexAePanelActionReceipts")).records[EXACT.requestId]);
  async function capture() {return disposition.capture(selector,deps);}
  async function authorize(saved) {return disposition.authorize({captureId:saved.value.captureId,confirmation:true,authorizationSource:"explicit_user_chat",reason},deps);}
  function refresh() {assert.equal(env.api.refreshAmeFixtureDisposition().accepted,true);}
  function unchanged() {
    assert.deepEqual(fs.readFileSync(records.fileFor(evidenceRoot,EXACT.runId)),originalBytes);
    assert.equal(JSON.stringify(env.api.getResult(EXACT.requestId)),originalProjection);
    assert.equal(JSON.stringify(JSON.parse(store.get("codexAePanelActionReceipts")).records[EXACT.requestId]),privateBytes);
    assert.equal(env.requestHistory.filter(req => req.path === "/agents/plan/run").length,0);
  }
  return {deps,evidenceRoot,store,canonical,original,port,capture,authorize,refresh,answerLookup,unchanged,get env(){return env;},setEnv(value){env=value;},setStatus:value => {status=value;},setRuntime:value => {runtime=value;},get runtime(){return clone(runtime);},setExecutor:value => {executor=value;},setTransport:value => {transport=value;},setActor:value => {actorOverride=value;},setProjection:value => {projectionOverride=value;},setSignature:value => {signatureOverride=value;},setTarget:value => {target=value;},advance:ms => {clock+=ms;},setLock:value => {held=value;},close:() => new Promise(resolve => server.close(resolve))};
}
async function main() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"ae-fixture-disposition-smoke-")), cases=[];
  async function test(name,fn) {await fn();cases.push(name);}
  async function withFixture(name,fn) {const f=await fixture(root,name);try{await fn(f);}finally{await f.close();}}
  try {
    await test("authenticated capture/authorize/lookup + actual CEP trusted adoption preserve original bytes and unknown/no-replay",() => withFixture("happy",async f => {
      assert.equal(f.env.api.state().unresolvedActions.length,1);const captured=await request(f.port,"fixture-automation","/ame/fixture-ui-disposition/capture",selector);assert.equal(captured.status,200);
      assert.deepEqual(Object.keys(captured.body.capture.value.target).sort(),["url","webSocketDebuggerUrl"]);
      const authorized=await request(f.port,"fixture-automation","/ame/fixture-ui-disposition/authorize",{captureId:captured.body.capture.value.captureId,confirmation:true,authorizationSource:"explicit_user_chat",reason});assert.equal(authorized.status,200);
      assert.equal(f.env.api.state().unresolvedActions.length,1,"disk disposition alone does not adopt");f.refresh();assert.equal(f.env.api.state().ameFixtureDispositionLookupPending,true);await f.answerLookup();
      assert.equal(f.env.api.state().unresolvedActions.length,0);assert.equal(f.env.api.state().ameFixtureDisposition.historicalOutcome,"unknown");assert.equal(f.env.api.getResult(EXACT.requestId).state,"unknown");
      const replay=f.env.invoke(envelope);assert.equal(replay.state,"unknown");assert.equal(replay.replayAllowed,false);assert.equal(f.env.api.state().humanSettlement,null);
      const read=clone(await disposition.lookup(f.deps));assert.equal(read.readBack.dispositionSha256,authorized.body.disposition.sha256);delete read.readBack;
      assert.deepEqual(read,authorized.body.disposition);f.unchanged();
    }));
    await test("selector cannot supply proofs or target another tool/run/request",() => withFixture("selector",async f => {
      for(const value of [{...selector,runId:crypto.randomUUID()},{...selector,requestId:crypto.randomUUID()},{...selector,tool:"save_project"},{...selector,proof:{ok:true}}])await assert.rejects(disposition.capture(value,f.deps),/selector_invalid/);
      assert.equal(f.env.api.readAmeFixtureUIGuard({...selector,proof:{}}),null);assert.equal(f.env.api.refreshAmeFixtureDisposition({proof:true}).accepted,false);f.unchanged();
    }));
    await test("private controllerIdle ignores pending trusted lookup admission but detects actual lifecycle work",() => withFixture("controller-idle",async f => {
      const before=clone(f.env.api.readAmeFixtureUIGuard(selector));assert.equal(before.controllerIdle,true);const c=await f.capture();await f.authorize(c);f.refresh();
      assert.equal(f.env.api.state().ameFixtureDispositionLookupPending,true);assert.equal(f.env.api.state().activeAction,null);
      const pending=clone(f.env.api.readAmeFixtureUIGuard(selector));assert.equal(pending.controllerIdle,true);
      assert.deepEqual(pending.projection,before.projection);assert.equal(pending.signatureSha256,before.signatureSha256);
      const reconcile=clone(f.env.api.catalog()).find(row => row.name === "plan.reconcile");assert.equal(reconcile.availability.available,false);
      assert(reconcile.availability.reasonCodes.includes("fixture_disposition_lookup_pending"),"pending GET still blocks action admission");
      const maintenanceReader=f.deps.maintenanceTarget;
      f.deps.maintenanceTarget=async() => {const selected=await maintenanceReader(),row=clone(f.env.api.catalog()).find(item => item.name === "plan.reconcile"),s=selected.state;
        selected.state.nativeControlIdle=!s.activeAction && !s.recoveryTransport && s.actionStorage === "ready" && (row.availability.available && !row.availability.reasonCodes.length || s.busy === false);return selected;};
      assert.equal((await f.deps.maintenanceTarget()).state.nativeControlIdle,false,"actual catalog-derived idle is blocked by the trusted GET itself");
      await f.answerLookup();assert.equal(f.env.api.state().unresolvedActions.length,0);assert.equal(f.env.api.readAmeFixtureUIGuard(selector).controllerIdle,true);
      assert(f.env.runTimer(timer => timer.delay === 300),"actual panel passive connector refresh starts lifecycle work");
      assert.equal(f.env.api.state().activeAction,null,"passive timer work has no active panel action");
      const busy=clone(f.env.api.readAmeFixtureUIGuard(selector));assert.equal(busy.controllerIdle,false,"actual lifecycle busy must fail private idle proof");
      assert.deepEqual(busy.projection,before.projection);assert.equal(busy.signatureSha256,before.signatureSha256);
      await assert.rejects(disposition.lookup(f.deps),/writer_not_idle/);
      const connector=f.env.inFlightRequests.find(req => req.path.startsWith("/status?"));assert(connector);connector.respond(200,{status:{connector:{connected:true}}});
      assert.equal(f.env.api.readAmeFixtureUIGuard(selector).controllerIdle,true);f.unchanged();
    }));
    await test("trusted historical release survives legitimate same-instance connect epoch/generation change",() => withFixture("connect-epoch",async f => {
      const c=await f.capture();await f.authorize(c);f.refresh();await f.answerLookup();const before=clone(f.env.api.state());assert.equal(before.unresolvedActions.length,0);
      const action={protocolVersion:contract.PROTOCOL_VERSION,requestId:crypto.randomUUID(),action:"bridge.connect",args:{}};assert.equal(f.env.invoke(action).state,"running");
      const idle=f.env.inFlightRequests.find(req => req.path === "/tools/call" && req.body.name === "get_bridge_status");assert(idle);
      idle.respond(200,{result:{content:[{text:JSON.stringify({pendingCommands:0,inflightCommands:[],activeEditSession:null,projectLifecycle:{blocked:false,pending:null}})}]}});
      const current=f.env.inFlightRequests.find(req => req.path === "/agents/plan/current");assert(current);current.respond(200,{ok:true,current:null});
      const after=clone(f.env.api.state());assert.equal(after.panelInstanceId,before.panelInstanceId);assert.notEqual(after.panelLifecycleEpoch,before.panelLifecycleEpoch);assert.notEqual(after.panelGeneration,before.panelGeneration);
      assert.equal(after.unresolvedActions.length,0);assert.equal(after.ameFixtureDisposition.status,"abandoned_reviewed");assert.equal(f.env.api.getResult(EXACT.requestId).state,"unknown");f.unchanged();
    }));
    await test("actual url/ws-only target binding rejects nonfile/nonloopback/missing bindings in capture and durable lookup",async() => {
      const valid={url:"file:///exact/index.html",webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/exact-frame"};
      const invalid={nonfile:{...valid,url:"https://example.test/index.html"},nonloopback:{...valid,webSocketDebuggerUrl:"ws://example.test:8870/devtools/page/exact-frame"},
        localhost:{...valid,webSocketDebuggerUrl:"ws://localhost:8870/devtools/page/exact-frame"},wrongport:{...valid,webSocketDebuggerUrl:"ws://127.0.0.1:8871/devtools/page/exact-frame"},
        missingtarget:null,missingurl:{webSocketDebuggerUrl:valid.webSocketDebuggerUrl},missingws:{url:valid.url}};
      for(const mode of ["capture","lookup"])for(const [kind,target] of Object.entries(invalid))await withFixture("target-"+mode+"-"+kind,async f => {
        if(mode === "lookup"){const c=await f.capture();await f.authorize(c);}
        f.setTarget(target);await assert.rejects(mode === "capture" ? f.capture() : disposition.lookup(f.deps),/frame_source_mismatch/);f.unchanged();
      });
    });
    await test("canonical scope rejects foreign tool/dry-run/nonmanual/wrong provenance",async() => {
      for(const kind of ["tool","dryRun","manual","provenance","status"]){await withFixture("canonical-"+kind,async f => {const value=clone(f.canonical);if(kind === "tool")value.plan.steps[0].tool="save_project";if(kind === "dryRun")value.run.dryRun=true;if(kind === "manual")value.run.m100Action.confirmedBySurface="mcp";if(kind === "provenance")value.run.provenance.actionId="foreign";if(kind === "status")value.run.outcome.execution.status="not_started";records.writeRecord(f.evidenceRoot,value);await assert.rejects(f.capture(),/canonical_scope_mismatch/);});}
    });
    await test("canonical byte/receipt/signature/actor/frame/runtime drift reject fresh authorization",async() => {
      for(const kind of ["canonical","receipt","signature","actor","frame","runtime","daemon","assets"]){await withFixture("drift-"+kind,async f => {const c=await f.capture();
        if(kind === "canonical")fs.appendFileSync(records.fileFor(f.evidenceRoot,EXACT.runId)," ");
        if(kind === "receipt"){const p=clone(f.original);delete p.signature;p.message="changed";f.setProjection(p);}
        if(kind === "signature")f.setSignature("a".repeat(64));
        if(kind === "actor")f.setActor({panelInstanceId:"new-panel",panelLifecycleEpoch:0,panelGeneration:"0"});
        if(kind === "frame")f.setTarget({url:"file:///foreign/index.html",webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/foreign-frame"});
        if(kind === "runtime")f.setRuntime({...f.runtime,currentRuntimeSha256:"e".repeat(64)});
        if(kind === "daemon")f.setRuntime({...f.runtime,daemon:{pid:5555,startedAt:new Date().toISOString()}});
        if(kind === "assets")f.setRuntime({...f.runtime,panelAssetHashes:{"panel-actions.js":"e".repeat(64),"panel.js":"e".repeat(64)}});
        await assert.rejects(f.authorize(c),/capture_drift|runtime_changed|frame_source_mismatch/);assert.equal(fs.existsSync(disposition.fileFor(f.evidenceRoot,"consumption",EXACT.requestId)),false);
      });}
    });
    await test("busy bridge/edit/executor/transport and extra guard reject",async() => {
      for(const kind of ["pending","inflight","edit","executor","transport","guard"]){await withFixture("busy-"+kind,async f => {
        if(kind === "pending")f.setStatus({pendingCommands:1,inflightCommands:[],activeEditSession:null});
        if(kind === "inflight")f.setStatus({pendingCommands:0,inflightCommands:[{id:"command"}],activeEditSession:null});
        if(kind === "edit")f.setStatus({pendingCommands:0,inflightCommands:[],activeEditSession:{id:"writer"}});
        if(kind === "executor")f.setExecutor({quiescent:false,executing:true,pendingCount:1,childProcesses:[]});
        if(kind === "transport")f.setTransport({requestId:EXACT.requestId,originalReceiptAbsent:false,pendingCount:0,inflightCount:0});
        if(kind === "guard"){const reader=f.deps.maintenanceTarget;f.deps.maintenanceTarget=async() => {const s=await reader();s.state.unresolvedActions.push({...s.state.unresolvedActions[0],requestId:crypto.randomUUID()});return s;};}
        await assert.rejects(f.capture(),/writer_not_idle|executor_not_quiescent|transport_not_absent|guard_scope_mismatch/);f.unchanged();
      });}
    });
    await test("TTL, explicit confirmation and lock reject without consuming",() => withFixture("ttl",async f => {
      const c=await f.capture();await assert.rejects(disposition.authorize({captureId:c.value.captureId,confirmation:false,authorizationSource:"explicit_user_chat",reason},f.deps),/explicit_confirmation_required/);
      f.setLock(true);await assert.rejects(f.authorize(c),/writer_busy/);f.setLock(false);f.advance(disposition.TTL);await assert.rejects(f.authorize(c),/capture_stale_or_invalid/);
      assert.equal(fs.existsSync(disposition.fileFor(f.evidenceRoot,"consumption",EXACT.requestId)),false);f.unchanged();
    }));
    await test("atomic consumption wins concurrent authorizations and disallows replay",() => withFixture("double",async f => {
      const c=await f.capture(), results=await Promise.allSettled([f.authorize(c),f.authorize(c)]);assert.equal(results.filter(r => r.status === "fulfilled").length,1);
      await assert.rejects(f.authorize(c),/already_consumed/);await assert.rejects(f.capture(),/already_consumed/);assert.equal((await disposition.lookup(f.deps)).value.historicalOutcome,"unknown");f.unchanged();
    }));
    await test("missing/corrupt/partially written audit fails lookup and adoption",async() => {
      for(const kind of ["missing","corrupt","partial","tampered"]){await withFixture("audit-"+kind,async f => {const c=await f.capture();await f.authorize(c);const file=disposition.fileFor(f.evidenceRoot,kind === "partial" ? "disposition" : "audit",EXACT.requestId);
        if(kind === "missing" || kind === "partial")fs.unlinkSync(file);else if(kind === "corrupt")fs.writeFileSync(file,"{partial");else{const audit=JSON.parse(fs.readFileSync(file));audit.value.confirmation=false;audit.sha256=disposition.hash(audit.value);fs.writeFileSync(file,JSON.stringify(audit));}
        await assert.rejects(disposition.lookup(f.deps),/audit_invalid|partial_audit|Unexpected|Expected/);f.refresh();const response=await f.answerLookup();assert.notEqual(response.status,200);assert.equal(f.env.api.state().unresolvedActions.length,1);f.unchanged();
      });}
    });
    await test("consumption-only crash is permanently unknown and not reauthorized",() => withFixture("crash",async f => {
      const c=await f.capture();fs.mkdirSync(disposition.directory(f.evidenceRoot),{recursive:true});fs.writeFileSync(disposition.fileFor(f.evidenceRoot,"consumption",EXACT.requestId),"{incomplete");
      await assert.rejects(f.authorize(c),/already_consumed/);await assert.rejects(disposition.lookup(f.deps),/partial_audit/);f.unchanged();
    }));
    await test("fully audited lookup remains failclosed on private receipt/signature/current runtime/canonical drift",async() => {
      for(const kind of ["receipt","signature","runtime","canonical"]){await withFixture("lookup-"+kind,async f => {const c=await f.capture();await f.authorize(c);
        if(kind === "receipt"){const p=clone(f.original);delete p.signature;p.message="changed";f.setProjection(p);}
        if(kind === "signature")f.setSignature("a".repeat(64));
        if(kind === "runtime")f.setRuntime({...f.runtime,currentRuntimeSha256:"e".repeat(64)});
        if(kind === "canonical"){fs.appendFileSync(records.fileFor(f.evidenceRoot,EXACT.runId)," ");assert.throws(()=>disposition.lookupAudited(f.evidenceRoot),/original_receipt_or_canonical_drift/);}
        await assert.rejects(disposition.lookup(f.deps),/original_receipt_or_canonical_drift|runtime_changed/);f.refresh();await f.answerLookup();assert.equal(f.env.api.state().unresolvedActions.length,1);
      });}
    });
    await test("fake lookup body, local sidecar and unauthenticated/foreign credential cannot adopt",() => withFixture("untrusted",async f => {
      const c=await f.capture();await f.authorize(c);const proof=await disposition.lookup(f.deps);f.store.set("codexAeAmeFixtureUIDispositionV1",JSON.stringify(proof));assert.equal(f.env.api.state().unresolvedActions.length,1);
      for(const field of ["historicalOutcome","currentActor","readBackEpoch","readBackGeneration","entry","auditSha256","readBack","readBackEntry","readBackRuntime","readBackAssets"]){const fake=clone(proof);if(field === "historicalOutcome")fake.value.historicalOutcome="completed";if(field === "currentActor")fake.readBack.currentActor.panelInstanceId="foreign";if(field === "readBackEpoch")fake.readBack.currentActor.panelLifecycleEpoch+=1;if(field === "readBackGeneration")fake.readBack.currentActor.panelGeneration="foreign-generation";if(field === "entry")fake.value.entry.privateSignatureSha256="a".repeat(64);if(field === "auditSha256")delete fake.auditSha256;
        if(field === "readBack")delete fake.readBack;if(field === "readBackEntry")fake.readBack.entrySha256="a".repeat(64);if(field === "readBackRuntime")fake.readBack.runtime.currentRuntimeSha256="e".repeat(64);if(field === "readBackAssets")fake.readBack.installed.hashes={};fake.sha256=disposition.hash(fake.value);
        f.refresh();await f.answerLookup({ok:true,disposition:fake});assert.equal(f.env.api.state().unresolvedActions.length,1,field);
      }
      f.refresh();await f.answerLookup({ok:true,disposition:proof},401);assert.equal(f.env.api.state().unresolvedActions.length,1);
      assert.notEqual((await request(f.port,"fixture-automation","/ame/fixture-ui-disposition/lookup")).status,200);
      assert.notEqual((await request(f.port,"wrong","/ame/fixture-ui-disposition/lookup")).status,200);
      assert.notEqual((await request(f.port,"fixture-panel","/ame/fixture-ui-disposition/authorize",{})).status,200);
      assert.equal((await request(f.port,"fixture-panel","/ame/fixture-ui-disposition/lookup",undefined,{Origin:"https://evil.test"})).status,403);
      f.unchanged();
    }));
    await test("legitimate reload/daemon/source change and later own children use fresh readBack without changing historical audit",() => withFixture("actor",async f => {
      const c=await f.capture();assert.notDeepEqual(c.value.entry.originalBinding,c.value.currentActor);await f.authorize(c);const proof=await disposition.lookup(f.deps);
      const savedBytes=Object.fromEntries(["audit","capture","consumption","disposition"].map(kind => {const file=disposition.fileFor(f.evidenceRoot,kind,kind === "capture" ? c.value.captureId : EXACT.requestId);return [file,fs.readFileSync(file)];}));
      const reboot=createPanelEnvironment(SOURCE,{storageStore:f.store});f.setEnv(reboot);const pending=reboot.inFlightRequests.find(req => req.path === "/human-guard-settlement/lookup");pending.respond(200,{ok:true,settlement:null});await f.answerLookup({ok:true,disposition:proof});assert.equal(reboot.api.state().unresolvedActions.length,1,"cached metadata cannot pin a new actor");
      f.setRuntime({...f.runtime,daemon:{pid:7777,startedAt:new Date().toISOString()},loadedRuntimeSha256:"f".repeat(64),currentRuntimeSha256:"f".repeat(64)});
      f.setExecutor({quiescent:false,executing:true,pendingCount:1,childProcesses:[{pid:8888}]});f.setTransport({originalReceiptAbsent:false});
      f.deps.readExecutorQuiescence=async() => {throw Error("historical lookup must not demand executor quiescence");};f.deps.readTransportAbsence=async() => {throw Error("historical lookup must not demand original transport absence");};
      f.refresh();await f.answerLookup();assert.equal(reboot.api.state().unresolvedActions.length,0);const fresh=await disposition.lookup(f.deps);assert.equal(fresh.sha256,proof.sha256);assert.notDeepEqual(fresh.readBack.currentActor,proof.readBack.currentActor);assert.notDeepEqual(fresh.readBack.runtime,proof.readBack.runtime);
      for(const [file,bytes] of Object.entries(savedBytes))assert.deepEqual(fs.readFileSync(file),bytes);f.unchanged();
    }));
    await test("continued scopes retain another unknown guard while historical exact guard stays released",() => withFixture("continued",async f => {
      const c=await f.capture();await f.authorize(c);const foreignId=crypto.randomUUID(),store=JSON.parse(f.store.get("codexAePanelActionReceipts")),index=JSON.parse(f.store.get("codexAePanelActionReceiptIndex"));
      store.records[foreignId]={...clone(f.original),requestId:foreignId,runId:crypto.randomUUID()};index[foreignId]={action:"plan.run",signature:f.original.signature};
      f.store.set("codexAePanelActionReceipts",JSON.stringify(store));f.store.set("codexAePanelActionReceiptIndex",JSON.stringify(index));const next=createPanelEnvironment(SOURCE,{storageStore:f.store});f.setEnv(next);
      next.inFlightRequests.find(req => req.path === "/human-guard-settlement/lookup").respond(200,{ok:true,settlement:null});await f.answerLookup();const unresolved=clone(next.api.state().unresolvedActions);assert.equal(unresolved.length,1);assert.equal(unresolved[0].requestId,foreignId);assert.equal(next.api.getResult(EXACT.requestId).state,"unknown");f.unchanged();
    }));
    await test("public methods are frozen pure reads/GET trigger; direct factory without trusted lookup retains guard",() => withFixture("surface",async f => {
      const storage={getItem:key => f.store.get(key) || null,setItem:(key,value) => f.store.set(key,String(value))}, service=createActions(contract,storage);
      service.bind({handlers:{},passive:{},state:() => ({}),availability:() => ({available:true}),lifecycle:() => ({epoch:0,generation:"0",busy:false})});
      assert.equal(service.api.state().unresolvedActions.length,1);assert.deepEqual(Object.keys(service.api).sort(),["catalog","getResult","invoke","protocolVersion","state"]);
      assert(Object.isFrozen(service.api));assert.equal(service.api.refreshAmeFixtureDisposition({}).accepted,false);assert.equal(service.api.adoptAmeFixtureDisposition,undefined);
      const before=f.store.get("codexAePanelActionReceipts");service.api.readAmeFixtureUIGuard(selector);assert.equal(f.store.get("codexAePanelActionReceipts"),before);
    }));
    return {ok:true,scenarios:cases.length,cases,liveAcceptance:false,nativeDispatch:0,providerCalls:0};
  } finally {
    const resolved=path.resolve(root), temporary=path.resolve(os.tmpdir());
    if(!resolved.startsWith(temporary+path.sep) || !path.basename(resolved).startsWith("ae-fixture-disposition-smoke-"))throw Error("smoke_cleanup_target_invalid");
    fs.rmSync(resolved,{recursive:true,force:true});
  }
}
if(require.main === module)main().then(value => process.stdout.write(JSON.stringify(value)+"\n")).catch(error => {process.stderr.write(error.stack+"\n");process.exitCode=1;});
module.exports = {main};

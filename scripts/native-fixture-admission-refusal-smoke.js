"use strict";
// Offline readers/VM and temporary receipt copies only. No daemon, CDP, AE,
// project mutation, process launch, HTTP listener or historical evidence writes.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),Module=require("node:module"),vm=require("node:vm"),crypto=require("node:crypto");
const ledger=require("../mcp-server/native-fixture-attempt-ledger"),proof=require("../mcp-server/native-fixture-admission-refusal-proof"),control=require("../mcp-server/cep-panel-control"),contract=require("../cep-panel/panel-action-contract"),createActions=require("../cep-panel/panel-actions");
const ROOT=path.resolve(__dirname,".."),P=proof.PROFILE,clone=ledger.clone,hash=ledger.hash,checks=[],temporary=fs.mkdtempSync(path.join(os.tmpdir(),"ae-refusal-lookup-"));
const bootstrap=require("../mcp-server/ae-agent-panel-bootstrap"),{pathToFileURL}=require("node:url"),httpBoundary=require("../mcp-server/http-boundary");
const moduleFile=path.join(ROOT,"mcp-server/native-fixture-admission-refusal.js"),source=fs.readFileSync(moduleFile,"utf8"),originalFile=path.join(ROOT,"logs/cep-panel-control",P.requestId+".json"),originalBytes=fs.readFileSync(originalFile),originalHash=hash(originalBytes);
function compiled(overrides={}) {
  const mod=new Module(moduleFile,module);mod.filename=moduleFile;mod.paths=Module._nodeModulePaths(path.dirname(moduleFile));
  const ordinary=mod.require.bind(mod);mod.require=name=>Object.hasOwn(overrides,name) ? overrides[name] : ordinary(name);
  mod._compile(source+"\nmodule.__offline={original,ORIGINAL_PINS,panelProjection};",moduleFile);return mod;
}
const loaded=compiled(),service=loaded.exports,historical=proof.classify(),original=loaded.__offline.original(historical);
const boundSignature=control.computeActionSignature({protocolVersion:contract.PROTOCOL_VERSION,requestId:P.requestId,action:"plan.run",args:{pins:loaded.__offline.ORIGINAL_PINS,confirm:true},expectedState:original.binding});
const panelHashes=Object.fromEntries(["CSXS/manifest.xml","index.html","panel-action-contract.js","panel-actions.js","panel.js","style.css","lib/CSInterface.js"].map(name=>[name,hash(fs.readFileSync(path.join(ROOT,"cep-panel",name)))]));
function fixture() {
  const actor={panelInstanceId:"fresh-panel",panelLifecycleEpoch:3,panelGeneration:"fresh-generation"};
  const state={...actor,activeAction:null,recoveryTransport:null,actionStorage:"ready",nativeControlIdle:true,unresolvedActions:[{requestId:P.requestId,runId:P.runId,action:"plan.run",effect:"protected_plan_run"}]};
  const target={url:"file:///exact/index.html",webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/exact"},installed={indexPath:"C:\\exact\\index.html",hashes:clone(panelHashes)};
  const runtime={daemon:{pid:4100,startedAt:"2026-10-11T10:00:00.000Z"},loadedRuntimeSha256:"e".repeat(64),currentRuntimeSha256:"e".repeat(64),panelAssetHashes:clone(panelHashes),loadedPanelSourcesVerified:true};
  const guard={projection:clone(original.projection),signatureSha256:original.privateSignatureSha256,currentBinding:actor,controllerIdle:true};
  const status={pendingCommands:0,inflightCommands:[],activeEditSession:null,projectLifecycle:{blocked:false,pending:null},panelBootstrap:{busy:false}};
  const primary={projectPresent:true,file:P.projectFile,dirty:false,revision:10,supported:{file:true,dirty:true,revision:true}};
  const linkage={local:clone(original.local),remote:clone(original.projection)},counts={};
  const deps={repoRoot:P.repoRoot,evidenceRoot:P.evidenceRoot,maintenanceTarget:async()=>({state:clone(state),target:clone(target),installed:clone(installed)}),readRecoveryLinkage:async id=>{assert.equal(id,P.requestId);return clone(linkage);},readPanelGuard:async s=>{proof.select(s);return clone(guard);},readBridgeStatus:()=>clone(status),readRuntimeIdentity:async()=>clone(runtime),currentRuntimeSha256:()=>runtime.currentRuntimeSha256,readPrimaryProjectLifecycle:async()=>clone(primary)};
  for(const [name,fn] of Object.entries(deps))if(typeof fn==="function" && name!=="currentRuntimeSha256")deps[name]=async(...args)=>{counts[name]=(counts[name] || 0)+1;return fn(...args);};
  return {actor,state,target,installed,runtime,guard,status,primary,linkage,deps,counts};
}
async function test(name,fn) {await fn();checks.push(name);}
const denied=(fn)=>assert.rejects(fn,error=>/^fixture_/.test(error.code || ""));
function panelFixture(f,foreign=false) {
  const receipt={...clone(original.projection),signature:boundSignature},store=new Map([["codexAePanelActionReceiptsInitialized","1"]]);
  const records={[P.requestId]:receipt},index={[P.requestId]:{action:receipt.action,signature:receipt.signature}};
  let foreignId;
  if(foreign) {foreignId=crypto.randomUUID();records[foreignId]={...clone(receipt),requestId:foreignId,runId:crypto.randomUUID()};index[foreignId]={action:"plan.run",signature:boundSignature};}
  store.set("codexAePanelActionReceipts",JSON.stringify({version:1,records,tombstones:{}}));store.set("codexAePanelActionReceiptIndex",JSON.stringify(index));
  // A fabricated sidecar cannot establish trust: the production closure does
  // not read this key, nor any persistent refusal projection.
  store.set("codexAeNativeFixtureAdmissionRefusalV1",JSON.stringify({schema:service.SCHEMA,selector:proof.selector()}));
  const life={epoch:3,generation:"fresh-generation",busy:false},context={url:"http://127.0.0.1:17321",token:"offline-panel-credential",connection:"offline",role:"panel",running:false,connected:false};
  let answer,error=null,handlerCalls=0,lookups=0,pending;
  const runtime=createActions(contract,{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,String(value))}),api=runtime.api;
  const binding=api.state();Object.assign(f.actor,{panelInstanceId:binding.panelInstanceId});f.state.panelInstanceId=binding.panelInstanceId;
  const ui=runtime.bind({state:()=>({recoveryTransport:null,bridgeConnection:{id:context.connection},running:context.running,connected:context.connected}),lifecycle:()=>life,passive:{},availability:()=>({available:true,reasonCodes:[]}),
    handlers:{"plan.run":()=>{handlerCalls++;},"ui.sidebar.set":(_args,done)=>{handlerCalls++;done(null,{collapsed:true});},"bridge.configure":(_args,done)=>{context.token="changed";done(null,{configured:true});},"bridge.connect":(_args,done)=>{context.running=true;context.connected=true;context.connection="connected";life.generation+="-connected";done(null,{connected:true});}},
    lookupHumanSettlements:done=>done(null,null),nativeFixtureAdmissionRefusalContext:()=>context,
    lookupNativeFixtureAdmissionRefusal:done=>{lookups++;if(pending)pending(done);else done(error,answer);}});
  return {api,ui,store,life,context,foreignId,handlerCalls:()=>handlerCalls,lookups:()=>lookups,answer(value){answer=value;},error(value){error=value;},pending(value){pending=value;},refresh(){let ready;const accepted=ui.refreshTrustedGuards(value=>{ready=value;});return {accepted,ready};}};
}
async function main() {
  await test("fresh fixed proof uses present linkage, reconstructed private signature and loaded runtime",async()=>{
    const f=fixture(),v=await service.lookup(f.deps);assert.equal(v.schema,service.SCHEMA);assert.deepEqual(v.selector,proof.selector());assert.equal(v.entry.privateSignatureSha256,hash(boundSignature));assert.equal(v.entry.panelReceiptHash,hash(original.projection));assert.equal(v.entry.panelRunProjectionHash,hash(original.projection.result.run));
    assert.equal(v.entry.canonicalRunRecordHash,historical.proof.canonicalRunRecordHash);assert.equal(v.readBack.runtime.loadedPanelSourcesVerified,true);assert.equal(service.validatesTransport(v,f.linkage.local),true);
    assert.deepEqual(Object.fromEntries(Object.keys(proof.OUTCOME).map(key=>[key,v[key]])),proof.OUTCOME);assert.equal(v.primaryStateObserved,false);assert.equal(v.readBack.primary,undefined);assert.equal(f.counts.readRecoveryLinkage,4);assert.equal(f.counts.readPrimaryProjectLifecycle,undefined);assert.equal(f.deps.readTransportAbsence,undefined);
  });
  await test("only object key order may differ; actual private projection hash retains its order",async()=>{
    const f=fixture(),reverse=value=>Array.isArray(value) ? value.map(reverse) : value && typeof value==="object" ? Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reverse(value[key])])) : value;
    f.guard.projection=reverse(f.guard.projection);f.linkage.remote=reverse(f.linkage.remote);const v=await service.lookup(f.deps);assert.equal(v.entry.panelReceiptHash,hash(f.guard.projection));assert.equal(v.entry.projectedPinnedReceiptSha256,hash(original.projection));assert.notEqual(v.entry.panelReceiptHash,v.entry.projectedPinnedReceiptSha256);assert.equal(service.validatesTransport(v,f.linkage.local),true);
    for(const change of [value=>{value.extra=true;},value=>{delete value.completedAt;},value=>{value.result.run.steps[0].args.restoreDirty="false";}]){const d=fixture();change(d.guard.projection);await denied(()=>service.lookup(d.deps));}
  });
  for(const [name,mutate] of [
    ["foreign original request",f=>{f.linkage.local.requestId=crypto.randomUUID();}], ["original signature drift",f=>{f.linkage.local.signature="f".repeat(64);}],
    ["private reconstructed signature mismatch",f=>{f.guard.signatureSha256="0".repeat(64);}], ["public original delivery mismatch",f=>{f.linkage.remote.delivery="delivered";}],
    ["actor drift",f=>{f.guard.currentBinding.panelLifecycleEpoch++;}], ["runtime source drift",f=>{f.runtime.currentRuntimeSha256="f".repeat(64);}],
    ["loaded script verification absent",f=>{f.runtime.loadedPanelSourcesVerified=false;}], ["actual installed source mismatch",f=>{f.installed.hashes["panel-actions.js"]="f".repeat(64);}],
    ["pending activity",f=>{f.status.pendingCommands=1;}], ["inflight activity",f=>{f.status.inflightCommands=[{}];}], ["active edit session",f=>{f.status.activeEditSession={};}],
    ["controller active",f=>{f.guard.controllerIdle=false;}], ["panel action active",f=>{f.state.activeAction={action:"plan.run"};}]
  ])await test(name+" fails closed",async()=>{const f=fixture();mutate(f);await denied(()=>service.lookup(f.deps));});
  await test("cold startup does not read primary or wait for disconnected command polling",async()=>{
    const f=fixture(),p=panelFixture(f);f.deps.readPrimaryProjectLifecycle=()=>assert.fail("transport-only lookup must not queue primary read");
    const saved=await service.lookup(f.deps);assert.equal(saved.primaryStateObserved,false);assert.equal(p.context.running,false);assert.equal(p.context.connected,false);p.answer(saved);
    const source=fs.readFileSync(path.join(ROOT,"cep-panel/panel.js"),"utf8"),start=source.indexOf("  function lookupHumanSettlementBeforeConnect(attempt) {"),end=source.indexOf("  lookupHumanSettlementBeforeConnect(0);",start);let connect;
    const context=vm.createContext({panelActionUI:p.ui,tokenEl:{value:"offline-panel"},localStorage:{getItem:()=>"1"},setTimeout:fn=>{fn();},invokePanelUI:(action,args)=>{connect=p.ui.invokeUI({protocolVersion:contract.PROTOCOL_VERSION,requestId:crypto.randomUUID(),action,args:clone(args)});}});vm.runInContext(source.slice(start,end)+"\nlookupHumanSettlementBeforeConnect(0);",context);
    assert.equal(connect.state,"completed",JSON.stringify(connect));assert.equal(p.context.running,true);assert.equal(p.api.state().reconciliationRequired,true,"Connect invalidates actor-bound trust");
    f.actor.panelGeneration=p.life.generation;f.state.panelGeneration=p.life.generation;p.answer(await service.lookup(f.deps));assert.equal(p.refresh().ready,true);assert.equal(p.api.state().reconciliationRequired,false);
  });
  for(const field of ["daemon","target","actor"])await test(field+" changes during bracket",async()=>{const f=fixture(),read=f.deps.maintenanceTarget;let n=0;f.deps.maintenanceTarget=async()=>{const value=await read();if(++n>1){if(field==="daemon")f.runtime.daemon.pid++;if(field==="target")value.target.webSocketDebuggerUrl+="changed";if(field==="actor")value.state.panelGeneration="changed";}return value;};await denied(()=>service.lookup(f.deps));});
  await test("immutable original and identity index byte changes fail closed",async()=>{
    for(const file of [originalFile,original.index.file]) {
      let reads=0;const mockLedger={...ledger,readBytes(name){const value=ledger.readBytes(name);return path.resolve(name)===path.resolve(file) && ++reads>1 ? Buffer.concat([value,Buffer.from(" ")]) : value;}},mod=compiled({"./native-fixture-attempt-ledger":mockLedger});await denied(()=>mod.exports.lookup(fixture().deps));
    }
  });
  await test("panel private exact branch preserves generic UI invariant and keeps original UNKNOWN",async()=>{
    const f=fixture(),p=panelFixture(f);assert.equal(p.api.state().reconciliationRequired,true);const g=p.api.readNativeFixtureGuard(proof.selector());assert.equal(g.signatureSha256,hash(boundSignature));assert.equal(g.projection.source,"programmatic");assert.equal(g.projection.delivery,"unknown");
    assert.equal(p.api.readNativeFixtureGuard({...proof.selector(),requestId:crypto.randomUUID()}),null);assert.equal(p.api.readNativeFixtureGuard({...proof.selector(),pins:{}}),null);
    const saved=await service.lookup(f.deps);p.answer(saved);const initial=p.store.get("codexAePanelActionReceipts");assert.equal(p.refresh().ready,true);assert.equal(p.api.state().reconciliationRequired,false);assert.equal(p.api.getResult(P.requestId).state,"unknown");assert.equal(p.api.getResult(P.requestId).replayAllowed,false);assert.equal(p.store.get("codexAePanelActionReceipts"),initial);
    const duplicate=p.api.invoke({protocolVersion:contract.PROTOCOL_VERSION,requestId:P.requestId,action:"plan.run",args:{pins:loaded.__offline.ORIGINAL_PINS,confirm:true},expectedState:original.binding});assert.equal(duplicate.state,"unknown");assert.equal(p.handlerCalls(),0);
  });
  await test("foreign unknown remains blocking after fixed panel exclusion",async()=>{const f=fixture(),p=panelFixture(f,true);p.answer(await service.lookup(f.deps));assert.equal(p.refresh().ready,true);assert.deepEqual(p.api.state().unresolvedActions.map(row=>row.requestId),[p.foreignId]);});
  await test("cached sidecars, actor restore and config restore never establish or restore trust",async()=>{
    const f=fixture(),p=panelFixture(f);assert.equal(p.api.state().reconciliationRequired,true);p.answer(await service.lookup(f.deps));assert.equal(p.refresh().ready,true);
    p.life.epoch++;assert.equal(p.api.state().reconciliationRequired,true);p.life.epoch--;assert.equal(p.api.state().reconciliationRequired,true);assert.equal(p.refresh().ready,true);
    const token=p.context.token;p.context.token="changed";assert.equal(p.api.state().reconciliationRequired,true);p.context.token=token;assert.equal(p.api.state().reconciliationRequired,true);
  });
  await test("pending lookup blocks effects and actor change during callback cannot adopt",async()=>{const f=fixture(),p=panelFixture(f),saved=await service.lookup(f.deps);let callback;p.pending(done=>{callback=done;});const start=p.refresh();assert.equal(start.accepted.accepted,true);assert.equal(p.api.state().nativeFixtureAdmissionRefusalLookupPending,true);const blocked=p.api.invoke({protocolVersion:contract.PROTOCOL_VERSION,requestId:crypto.randomUUID(),action:"ui.sidebar.set",args:{collapsed:true}});assert.equal(blocked.code,"trusted_guard_refresh_pending");p.life.generation="changed";callback(null,saved);assert.equal(p.api.state().reconciliationRequired,true);assert.equal(p.handlerCalls(),0);});
  await test("server fresh census excludes only exact original and never recurses into public getResult",async()=>{
    const f=fixture(),value=await service.lookup(f.deps),directory=path.join(temporary,"census");fs.mkdirSync(directory);fs.copyFileSync(originalFile,path.join(directory,P.requestId+".json"));
    const identity={action:original.local.action,signature:original.local.signature,binding:original.local.binding};fs.writeFileSync(path.join(directory,"identities.json"),JSON.stringify({schema:"ae-agent.cep-panel-transport.v1",identities:{[P.requestId]:identity}}));
    let calls=0,writes=0,sends=0;const indexPath=path.join(temporary,"CEP","extensions",bootstrap.TARGET.bundleId,"index.html"),target={type:"page",url:pathToFileURL(indexPath).href,webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/exact"};
    const transport=control.createPanelControlService({stateDir:directory,lookupNativeFixtureAdmissionRefusal:async()=>{calls++;return value;},persistReceipt(){writes++;assert.fail("original persistence forbidden");},inspectInstalledTarget:()=>({indexPath,hashes:panelHashes}),fetchCdpTargets:async()=>[target],evaluateViaCdp:async(_url,expression)=>{if(expression.includes("api.invoke("))sends++;assert(expression.includes("api.getResult("),"census invokes no panel methods");return {ok:true,value:clone(original.projection)};}});
    assert.equal((await transport.maintenanceTransportState()).unresolvedCount,0);assert.equal(calls,1);const bytes=fs.readFileSync(path.join(directory,P.requestId+".json")),read=await transport.getResult(P.requestId);assert.equal(read.code,undefined,JSON.stringify(read));assert.equal(read.receipt.state,"unknown");assert(fs.readFileSync(path.join(directory,P.requestId+".json")).equals(bytes));assert.equal(writes,0);assert.equal(calls,1,"getResult must not recurse into fresh service");
    await transport.invoke({protocolVersion:contract.PROTOCOL_VERSION,requestId:P.requestId,action:"plan.run",args:{pins:loaded.__offline.ORIGINAL_PINS,confirm:true}});assert.equal(sends,0);assert.equal(writes,0);
    const foreign=crypto.randomUUID(),row={...clone(original.local),requestId:foreign,runId:crypto.randomUUID()};control.saveDurableReceipt(directory,row);assert.deepEqual((await transport.maintenanceTransportState()).requestIds,[foreign]);
    const input={requestId:crypto.randomUUID(),action:"ui.sidebar.set",args:{collapsed:true}};assert.equal((await transport.invoke(input)).code,"transport_reconciliation_required");assert.equal(writes,0);assert.equal(sends,0);
    value.readBack.runtime.currentRuntimeSha256="f".repeat(64);assert.equal((await transport.maintenanceTransportState()).unresolvedCount,2);
  });
  await test("new invocation needs a fresh exact service verdict; original bytes are preserved",async()=>{
    const f=fixture(),p=panelFixture(f);p.answer(await service.lookup(f.deps));assert.equal(p.refresh().ready,true);
    const directory=path.join(temporary,"invoke"),indexPath=path.join(temporary,"CEP","extensions",bootstrap.TARGET.bundleId,"index.html");fs.mkdirSync(directory);fs.copyFileSync(originalFile,path.join(directory,P.requestId+".json"));fs.writeFileSync(path.join(directory,"identities.json"),JSON.stringify({schema:"ae-agent.cep-panel-transport.v1",identities:{[P.requestId]:{action:original.local.action,signature:original.local.signature,binding:original.local.binding}}}));
    const api={protocolVersion:p.api.protocolVersion,state:args=>p.api.state(args===undefined ? undefined : clone(args)),catalog:()=>p.api.catalog(),getResult:id=>p.api.getResult(id),invoke:value=>p.api.invoke(clone(value))};
    let calls=0;const context=vm.createContext({window:{AEAgentPanelActions:api}}),target={type:"page",url:pathToFileURL(indexPath).href,webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/exact"};
    const transport=control.createPanelControlService({stateDir:directory,lookupNativeFixtureAdmissionRefusal:async()=>{calls++;return service.lookup(f.deps);},inspectInstalledTarget:()=>({indexPath,hashes:panelHashes}),fetchCdpTargets:async()=>[target],evaluateViaCdp:async(_url,expression)=>clone(vm.runInContext(expression,context))});
    const input={requestId:crypto.randomUUID(),action:"ui.sidebar.set",args:{collapsed:true}},result=await transport.invoke(input);assert.equal(result.receipt.state,"completed",JSON.stringify(result));assert.equal(calls,1);assert.equal(p.handlerCalls(),1);assert.equal(hash(fs.readFileSync(path.join(directory,P.requestId+".json"))),originalHash);
  });
  await test("fixed endpoint enforces Host/Origin, panel role, empty query/body and no-store",async()=>{
    const bridge=fs.readFileSync(path.join(ROOT,"mcp-server/bridge-daemon.js"),"utf8"),start=bridge.indexOf('    if (url.pathname.startsWith("/ame/native-fixture-admission-refusal/")) {'),end=bridge.indexOf('    if (url.pathname.startsWith("/ame/native-fixture-prephase-recovery/")) {',start);assert(start>=0 && end>start);
    const boundary=httpBoundary.createBoundary({automation:"offline-auto",panel:"offline-panel"}),context=vm.createContext({nativeFixtureAdmissionRefusal:{lookup:async()=>({schema:service.SCHEMA})},nativeRefusalReaders:()=>({}),requireToken:(req,res)=>{if(boundary.role(req))return true;res.status=401;return false;},writeJson:(res,status,payload)=>{res.status=status;res.payload=payload;}});vm.runInContext("async function route(req,res,url){"+bridge.slice(start,end)+"}",context);
    async function request({method="GET",url="/ame/native-fixture-admission-refusal/lookup",token="offline-panel",headers={}}={}){const req={method,headers:{host:"127.0.0.1:17321",origin:"file://","x-ae-bridge-token":token,...headers}},res={authRole:boundary.role({headers:req.headers}),headers:{},setHeader(key,value){this.headers[key]=value;}};try{boundary.validate(req);await context.route(req,res,new URL(url,"http://127.0.0.1:17321"));}catch(error){res.status=error.status;}return res;}
    const positive=await request();assert.equal(positive.status,200);assert.equal(positive.headers["Cache-Control"],"no-store");assert.equal(positive.payload.credentialRole,"panel");
    for(const options of [{token:"offline-auto"},{headers:{host:"example.org"}},{headers:{origin:"https://example.org"}}])assert.equal((await request(options)).status,403);
    assert.equal((await request({token:"foreign"})).status,401);assert.equal((await request({method:"POST"})).status,404);
    for(const options of [{url:"/ame/native-fixture-admission-refusal/lookup?requestId="+P.requestId},{url:"/ame/native-fixture-admission-refusal/lookup?pins=claimed"},{headers:{"content-length":"2"}},{headers:{"transfer-encoding":"chunked"}}])assert.equal((await request(options)).status,409);
    assert.equal((await request({url:"/ame/native-fixture-admission-refusal/publish"})).status,404);
  });
  await test("new GET callback rejects role and configuration/lifecycle changes",async()=>{
    const panel=fs.readFileSync(path.join(ROOT,"cep-panel/panel.js"),"utf8"),start=panel.indexOf("    nativeFixtureAdmissionRefusalContext:function()"),end=panel.indexOf("    lifecycle:function()",start),context=vm.createContext({getBaseUrl:()=>context.url,getToken:()=>context.token,url:"http://127.0.0.1:17321",token:"offline-panel",panelLifecycleEpoch:1,panelConnectionGeneration:"1",panelConnectionId:"connection",running:false,badgeEl:{textContent:"offline"},window:{AEAgentPanelContract:contract},request:(method,url,body,done)=>{assert.equal(method,"GET");assert.equal(url,"/ame/native-fixture-admission-refusal/lookup");assert.equal(body,null);context.pending=done;}});vm.runInContext("var bindings={"+panel.slice(start,end)+"};",context);
    let value;context.bindings.lookupNativeFixtureAdmissionRefusal((error,result)=>{value={error,result};});context.pending(null,{ok:true,credentialRole:"panel",refusal:{schema:service.SCHEMA}});assert.equal(value.result.schema,service.SCHEMA);
    context.bindings.lookupNativeFixtureAdmissionRefusal(error=>{value=error;});context.pending(null,{ok:true,credentialRole:"automation",refusal:{}});assert.equal(value.code,"fixture_refusal_lookup_failed");
    for(const field of ["url","token","panelLifecycleEpoch","panelConnectionGeneration","panelConnectionId"]){context.bindings.lookupNativeFixtureAdmissionRefusal(error=>{value=error;});const old=context[field];context[field]=typeof old==="number" ? old+1 : old+"changed";context.pending(null,{ok:true,credentialRole:"panel",refusal:{}});assert.equal(value.code,"fixture_refusal_lookup_failed");context[field]=old;}
  });
  await test("only fixed new GET gets 60s timeout; POST/query and general timers unchanged",async()=>{
    const panel=fs.readFileSync(path.join(ROOT,"cep-panel/panel.js"),"utf8"),start=panel.indexOf("  function isFixedGuardLookup("),end=panel.indexOf("  function request(",start),context=vm.createContext({window:{AEAgentPanelContract:contract}});vm.runInContext(panel.slice(start,end),context);
    assert.equal(context.isFixedGuardLookup("GET","/ame/native-fixture-admission-refusal/lookup",null),true);for(const [method,url,body] of [["POST","/ame/native-fixture-admission-refusal/lookup",null],["GET","/ame/native-fixture-admission-refusal/lookup?pins=1",null],["GET","/ame/native-fixture-admission-refusal/lookup",{}]])assert.equal(context.isFixedGuardLookup(method,url,body),false);
    assert.equal(control.TRUSTED_GUARD_REFRESH_TIMEOUT_MS,480000);assert(panel.includes('? 120000'));assert(panel.includes(': 10000;'));
  });
  assert.equal(hash(fs.readFileSync(originalFile)),originalHash);assert.equal(originalHash,"45f392b79f08cf7cd91e83ad643037f186fc47677ac5373342052e39777558d5");
  console.log(JSON.stringify({ok:true,checks:checks.length,names:checks,originalHash,scope:"offline fixed proof + fake readers/VM/temp receipts; no live daemon/CDP/AE/HTTP/process or original writes"}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{assert.equal(path.dirname(temporary),path.resolve(os.tmpdir()));assert(path.basename(temporary).startsWith("ae-refusal-lookup-"));fs.rmSync(temporary,{recursive:true,force:true});});

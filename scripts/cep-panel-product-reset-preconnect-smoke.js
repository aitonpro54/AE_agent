"use strict";
// Actual signed product lineage + production transport, invented CDP only.
// No listener, child, native, AE, provider or private canonical-root access.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),vm=require("node:vm"),Module=require("node:module");
const control=require("../mcp-server/cep-panel-control"),reset=require("../mcp-server/owned-runtime-product-session-reset"),supervisor=require("../mcp-server/owned-runtime-supervisor"),ledger=require("../mcp-server/native-fixture-attempt-ledger"),evidence=require("../mcp-server/review-evidence"),contract=require("../cep-panel/panel-action-contract"),activationFixture=require("./owned-runtime-product-activation-smoke");
const client=require("./owned-runtime-control");
const clone=v=>JSON.parse(JSON.stringify(v)),uuid=()=>crypto.randomUUID(),cases=[];
async function check(name,fn){await fn();cases.push(name);}
async function fixture(fn,{staged=false}={}){
  const f=activationFixture.make(),runtimeIdentity=evidence.runtimeIdentity,namedHashes=evidence.runtimeNamedHashSet,originalRequest=client.request;let sends=0,stateReads=0,resultReads=0,onFinal=()=>{},listenerChange=(_route,value)=>value;
  try{
    evidence.runtimeIdentity=root=>path.resolve(root)===f.root?f.source:runtimeIdentity(root);
    const directory=path.join(f.root,"logs","cep-panel-control"),id=uuid(),binding={panelInstanceId:"old-panel",panelLifecycleEpoch:2,panelGeneration:"old-generation"};
    const remote={protocolVersion:control.PROTOCOL_VERSION,requestId:id,action:"bridge.disconnect",state:"unknown",phase:"bridge_offline",acceptedAt:"2026-10-01T00:00:00.000Z",completedAt:"2026-10-01T00:00:01.000Z",panelInstanceId:binding.panelInstanceId,epoch:2,generation:binding.panelGeneration,code:"bridge_offline",message:"offline fixture",effect:"bridge_control",source:"programmatic",replayAllowed:false};
    const local={...remote,binding,delivery:"delivered",signature:control.computeActionSignature({protocolVersion:control.PROTOCOL_VERSION,requestId:id,action:"bridge.disconnect",args:{},expectedState:binding})};control.saveDurableReceipt(directory,local);
    const entry={requestId:id,entrySha256:ledger.hash(JSON.stringify({...remote,signature:"invented-panel-signature"})),action:remote.action,runId:null,code:remote.code,phase:remote.phase};
    f.authorize();const first=await f.apply(),s=activationFixture.session(f,first.generation),input=activationFixture.witness(s,first.generation);input.panelControl.oldActionEntries=[{requestId:id,entrySha256:entry.entrySha256}];s.activate(input);
    reset.provision("offline explicit pending reset",f.root);const pending=await f.reset();assert.equal(pending.status,"reset_pending_preflight");
    client.request=async(profile,route)=>{const c=supervisor.readDaemonRegistration(f.root);assert.equal(profile.daemon.credentialSha256,c.credentialSha256);let value;
      if(route==="/runtime/owned/status")value={ok:true,owned:true,generation:c.generation,draining:false,closing:false,shutdownEffectPending:null,writeAdmission:"retained_audit_and_fresh_adoption_required",activeTickets:0};
      else{assert.equal(route,"/dev/status");value={ok:true,startedAt:c.serviceStartedAt,humanGuardRuntime:{pid:c.kernelIdentity.pid,startedAt:c.serviceStartedAt,sourceSha256:c.sourceSha256},pendingCommands:0,inflightCommands:[],activeEditSession:null,projectLifecycle:{blocked:false,pending:null}};}return listenerChange(route,value);};
    const state={protocolVersion:control.PROTOCOL_VERSION,assetVersion:require("../package.json").version,panelInstanceId:"fresh-panel",panelLifecycleEpoch:0,panelGeneration:"0",bridgeConnection:{panelConnectionId:"fresh-connection"},connected:false,running:false,pollInFlight:false,nativeBusy:false,physicalInflight:0,activeAction:null,recoveryTransport:null,actionStorage:"ready",busy:true,reconciliationRequired:true,unresolvedActions:[entry],trustedGuardRefresh:{pending:false}};
    const installed={indexPath:path.join(f.root,"CEP","extensions","com.codex.aemcpbridge","index.html"),hashes:{source:"invented"}},page={type:"page",url:require("node:url").pathToFileURL(installed.indexPath).href,webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/invented"};
    reset.createPreconnectControlWitness(f.root,directory,[control.loadDurableReceipt(directory,id)],{selected:{installed,target:{url:page.url,webSocketDebuggerUrl:page.webSocketDebuggerUrl}},state,remote:[remote],runtime:await reset.readPreconnectRuntime(f.root)});
    const api={protocolVersion:control.PROTOCOL_VERSION,state(){stateReads++;return clone(state);},getResult(requestId){resultReads++;if(resultReads===2)onFinal();return requestId===id?clone(remote):null;},invoke(envelope){sends++;return {protocolVersion:control.PROTOCOL_VERSION,requestId:envelope.requestId,action:envelope.action,state:"completed",phase:"completed",panelInstanceId:state.panelInstanceId,epoch:state.panelLifecycleEpoch,generation:state.panelGeneration,replayAllowed:false,result:{connected:false,resetPending:true}};}};
    // Compile the unchanged candidate transport with its fixed __dirname in the
    // owned TEMP root. This is not a production root/fixture option or API.
    const sourceRoot=staged?path.join(f.root,"staged-client"):f.root,inspections=[];
    for(const name of ["mcp-server/cep-panel-control.js","mcp-server/owned-runtime-product-session-reset.js","scripts/cep-panel-product-reset-client.js"]){fs.mkdirSync(path.dirname(path.join(sourceRoot,name)),{recursive:true});fs.copyFileSync(path.resolve(__dirname,"..",name),path.join(sourceRoot,name));}
    if(staged){
      const boot=require("../mcp-server/ae-agent-panel-bootstrap"),extensions=path.dirname(path.dirname(installed.indexPath));
      for(const name of ["CSXS/manifest.xml","index.html","panel-action-contract.js","panel-actions.js","native-probe-startup-guard.js","panel.js","style.css","lib/CSInterface.js"]){
        const lf=fs.readFileSync(path.resolve(__dirname,"../cep-panel",name),"utf8").replace(/\r\n/g,"\n");
        for(const [base,text]of [[path.join(f.root,"cep-panel"),lf],[path.dirname(installed.indexPath),lf],[path.join(sourceRoot,"cep-panel"),lf.replace(/\n/g,"\r\n")]]){const target=path.join(base,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);}
      }
      assert.throws(()=>boot.inspectInstalledTarget([extensions],path.join(sourceRoot,"cep-panel")),error=>error.code==="installed_panel_source_mismatch");
      Object.assign(installed,boot.inspectInstalledTarget([extensions],path.join(f.root,"cep-panel")));
    }
    const file=path.resolve(__dirname,"../mcp-server/cep-panel-control.js"),mod=new Module(path.join(sourceRoot,"mcp-server","cep-panel-control.js"),module);mod.filename=path.join(sourceRoot,"mcp-server","cep-panel-control.js");
    const nativeRequire=Module.createRequire(file);mod.require=name=>name==="node:path"?{...path,resolve(...args){return args.length===1&&args[0]==="C:/Users/Ant/Documents/Codex/AE_agent"?f.root:path.resolve(...args);}}:name==="./ae-agent-panel-bootstrap"?{...nativeRequire(name),inspectInstalledTarget:(...args)=>{inspections.push(args);assert.deepEqual(args,[undefined,path.join(f.root,"cep-panel")]);return staged?nativeRequire(name).inspectInstalledTarget([path.dirname(path.dirname(installed.indexPath))],args[1]):installed;}}:nativeRequire(name);
    mod._compile(fs.readFileSync(file,"utf8")+'\nmodule.exports.__offlineWire=(fetch,evaluate)=>{fetchCdpTargets=fetch;evaluateViaWebSocket=evaluate;};',mod.filename);
    mod.exports.__offlineWire(async()=>[page],async(_url,expression)=>clone(vm.runInNewContext(expression,{window:{AEAgentPanelActions:api}})));
    evidence.runtimeNamedHashSet=root=>path.resolve(root)===sourceRoot?[{name:"mcp-server/cep-panel-control.js",sha256:ledger.hash(fs.readFileSync(path.join(sourceRoot,"mcp-server/cep-panel-control.js")))},{name:"mcp-server/owned-runtime-product-session-reset.js",sha256:ledger.hash(fs.readFileSync(path.join(sourceRoot,"mcp-server/owned-runtime-product-session-reset.js")))}]:namedHashes(root);
    const service=mod.exports.createPanelControlService({stateDir:directory,inspectInstalledTarget:()=>installed,fetchCdpTargets:async()=>[page],evaluateViaCdp:async(_url,expression)=>clone(vm.runInNewContext(expression,{window:{AEAgentPanelActions:api}}))});
    const original=fs.readFileSync(path.join(directory,id+".json")),invoke=(action="bridge.connect",requestId=uuid())=>service.invoke({requestId,action,args:action==="ui.sidebar.set"?{collapsed:true}:{}});
    // Only the test's built-in dependencies are replaced; the exported factory
    // has no production root, CDP, persistence, or callback option.
    await fn({f,sourceRoot,inspections,directory,id,binding,local,remote,entry,state,installed,page,service,pending,first,invoke,clientModule:mod.exports,sends:()=>sends,stateReads:()=>stateReads,onFinal(fn){onFinal=fn;resultReads=0;},listener(fn){listenerChange=fn;},unchanged(){assert.deepEqual(fs.readFileSync(path.join(directory,id+".json")),original);assert.equal(control.loadDurableReceipt(directory,id).state,"unknown");}});
  }finally{client.request=originalRequest;evidence.runtimeIdentity=runtimeIdentity;evidence.runtimeNamedHashSet=namedHashes;f.cleanup();}
}
async function main(){
  if(process.argv.includes("--client-diagnostic-only")){
    await check("read-only client diagnostic exposes exact witness/listener failure without sends or writes",()=>fixture(async t=>{
      const pins=t.clientModule.productResetClientAttestation(),c=t.clientModule.createProductResetMaintenanceClient(pins.clientSha256),before=fs.readFileSync(path.join(t.directory,"identities.json"));
      const good=await c.diagnose();assert.equal(good.ok,true,JSON.stringify(good));assert.equal(good.sent,false);
      t.state.physicalInflight=1;const physical=await c.diagnose();assert.equal(physical.code,"owned_product_preconnect_fresh_idle_required");assert.equal(physical.stage,"preconnect_snapshot");assert.equal(physical.state.physicalInflight,1);t.state.physicalInflight=0;
      t.listener((route,v)=>{if(route==="/runtime/owned/status")v.activeTickets=1;return v;});const listener=await c.diagnose();assert.equal(listener.code,"owned_product_preconnect_listener_not_current_idle");assert.equal(listener.stage,"panel_receipts_and_listener");
      for(const pending of [false,"shutdown_effect_failed",undefined]){t.listener((route,v)=>{if(route==="/runtime/owned/status")v.shutdownEffectPending=pending;return v;});assert.equal((await c.diagnose()).code,"owned_product_preconnect_listener_not_current_idle");}
      assert.equal(t.sends(),0);assert.deepEqual(fs.readFileSync(path.join(t.directory,"identities.json")),before);assert.equal(fs.existsSync(path.join(t.directory,"client-attestation")),false);t.unchanged();
    }));process.stdout.write(JSON.stringify({ok:true,checks:cases.length,cases,liveProof:false})+"\n");return;
  }
  if(process.argv.includes("--client-staging-only")){
    await check("staged client validates installed assets against canonical panel source only",()=>fixture(async t=>{assert.notEqual(t.sourceRoot,t.f.root);const pins=t.clientModule.productResetClientAttestation(),c=t.clientModule.createProductResetMaintenanceClient(pins.clientSha256);assert.equal(pins.sourceRoot,t.sourceRoot);assert.equal(pins.canonicalRoot,t.f.root);assert.equal((await c.state()).ok,true);assert.equal(t.inspections.length,1);assert.equal(t.sends(),0);t.unchanged();},{staged:true}));
    process.stdout.write(JSON.stringify({ok:true,checks:cases.length,cases,liveProof:false})+"\n");return;
  }
  await check("signed pending reset admits one preconnect only; original UNKNOWN/UUID stay immutable",()=>fixture(async t=>{
    const requestId=uuid(),r=await t.invoke("bridge.connect",requestId);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.receipt.result.resetPending,true);assert.equal(t.sends(),1);t.unchanged();
    assert.equal((await t.invoke("bridge.connect",requestId)).receipt.state,"completed");assert.equal(t.sends(),1);
    const old=await t.service.invoke({requestId:t.id,action:"bridge.disconnect",args:{},expectedState:t.binding});assert.equal(old.receipt.state,"unknown");assert.equal(t.sends(),1);t.unchanged();
    assert.equal((await t.invoke("ui.sidebar.set")).code,"transport_reconciliation_required");assert.equal(t.sends(),1);
  }));
  await check("uncovered or additional UNKNOWN blocks before send",()=>fixture(async t=>{t.state.unresolvedActions[0].entrySha256="f".repeat(64);assert.equal((await t.invoke()).code,"transport_reconciliation_required");assert.equal(t.sends(),0);t.unchanged();}));
  await check("extra intact transport UNKNOWN cannot borrow covered entry",()=>fixture(async t=>{control.saveDurableReceipt(t.directory,{...t.local,requestId:uuid()});assert.equal((await t.invoke()).code,"transport_reconciliation_required");assert.equal(t.sends(),0);t.unchanged();}));
  await check("remote/local old identity mismatch fails closed",()=>fixture(async t=>{t.remote.generation="foreign";assert.equal((await t.invoke()).code,"transport_reconciliation_required");assert.equal(t.sends(),0);t.unchanged();}));
  for(const [name,change]of[
    ["physical",t=>t.state.physicalInflight=1],["actor",t=>t.state.panelInstanceId="foreign-panel"],["target",t=>t.page.webSocketDebuggerUrl="ws://127.0.0.1:8870/devtools/page/foreign"],["native busy",t=>t.state.nativeBusy=true],
    ["source",t=>t.f.source.sourceSha256="e".repeat(64)],["config",t=>fs.appendFileSync(path.join(t.f.root,".codex","config.toml"),"# drift")],["grant",t=>fs.appendFileSync(path.join(t.f.base,"product-session-reset-policies",t.first.generation+".json")," ")],
    ["activation",t=>{const a=reset.sessionAnchor(t.f.root,t.first.generation,supervisor.registeredGeneration,()=>"invented offline activation credential");fs.appendFileSync(path.join(t.f.base,"product-session-resets",a.value.operationId,"activation.json")," ");}],
    ["index",t=>fs.appendFileSync(path.join(t.directory,"identities.json")," ")],
    ["local",t=>fs.appendFileSync(path.join(t.directory,t.id+".json")," ")]
  ])await check("final "+name+" drift never dispatches",()=>fixture(async t=>{const requestId=uuid();t.onFinal(()=>change(t));const r=await t.invoke("bridge.connect",requestId);assert.equal(r.ok,false,JSON.stringify(r));assert.equal(t.sends(),0);assert.equal(fs.existsSync(path.join(t.directory,requestId+".json")),false,"deferred accepted remains not_sent");if(name!=="local")t.unchanged();}));
  await check("same-token foreign or busy listener never provides PRECONNECT authority",()=>fixture(async t=>{
    for(const [target,change]of[["/runtime/owned/status",v=>{v.generation=uuid();}],["/runtime/owned/status",v=>{v.writeAdmission="open";}],["/runtime/owned/status",v=>{v.activeTickets=1;}],["/dev/status",v=>{v.humanGuardRuntime.pid++;}],["/dev/status",v=>{v.humanGuardRuntime.sourceSha256="d".repeat(64);}],["/dev/status",v=>{v.startedAt="2026-01-01T00:00:00.000Z";}],["/dev/status",v=>{v.inflightCommands=[{state:"unknown"}];}]]){
      t.listener((route,v)=>{if(route===target)change(v);return v;});
      assert.equal((await t.invoke()).code,"transport_reconciliation_required");assert.equal(t.sends(),0);t.unchanged();
    }
  }));
  await check("listener changes during final observation remain not_sent",()=>fixture(async t=>{const requestId=uuid();t.onFinal(()=>t.listener((route,v)=>{if(route==="/dev/status")v.humanGuardRuntime.pid++;return v;}));const r=await t.invoke("bridge.connect",requestId);assert.equal(r.ok,false);assert.equal(t.sends(),0);assert.equal(fs.existsSync(path.join(t.directory,requestId+".json")),false);t.unchanged();}));
  await check("serialized witness cannot be forged",()=>{assert.throws(()=>reset.assertPreconnectControlWitness({scope:"pending_product_reset_preconnect_only"},".",".",[],{}),/witness_changed/);});
  await check("closed maintenance client uses canonical shared lock/store and durable separate code attestation",()=>fixture(async t=>{
    const pins=t.clientModule.productResetClientAttestation();assert.equal(pins.canonicalRoot,t.f.root);assert.equal(pins.sourceRoot,t.f.root);
    assert.throws(()=>t.clientModule.createProductResetMaintenanceClient("f".repeat(64)),/source_pin_required/);
    const c=t.clientModule.createProductResetMaintenanceClient(pins.clientSha256);assert.deepEqual(Object.keys(c).sort(),["attestation","connect","diagnose","getResult","state"]);
    const id=uuid(),lock=control.acquireControllerLock(t.directory,uuid());try{assert.equal((await c.connect(id)).code,"transport_busy");}finally{lock.release();}
    assert.equal(t.sends(),0);const r=await c.connect(id);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(t.sends(),1);
    const file=path.join(t.directory,"client-attestation",id+".json"),bytes=fs.readFileSync(file),row=JSON.parse(bytes),current=supervisor.readDaemonRegistration(t.f.root);
    assert.equal(row.value.client.clientSha256,pins.clientSha256);assert.deepEqual(row.value.daemon,{generation:current.generation,sourceSha256:current.sourceSha256});assert.match(row.value.witnessSha256,ledger.SHA);assert.equal(row.value.replayAllowed,false);
    assert.equal((await c.connect(id)).ok,true);assert.equal(t.sends(),1);assert.deepEqual(fs.readFileSync(file),bytes);t.unchanged();
  }));
  await check("orphan client attestation never grants retry",()=>fixture(async t=>{
    const pins=t.clientModule.productResetClientAttestation(),c=t.clientModule.createProductResetMaintenanceClient(pins.clientSha256),id=uuid();ledger.writeOnce(path.join(t.directory,"client-attestation",id+".json"),{offline:true});
    assert.equal((await c.connect(id)).code,"product_reset_client_orphan_attestation_no_replay");assert.equal(t.sends(),0);assert.equal(fs.existsSync(path.join(t.directory,id+".json")),false);t.unchanged();
  }));
  await check("final client source drift remains not_sent without attestation or receipt",()=>fixture(async t=>{
    const pins=t.clientModule.productResetClientAttestation(),c=t.clientModule.createProductResetMaintenanceClient(pins.clientSha256),id=uuid();t.onFinal(()=>fs.appendFileSync(path.join(t.f.root,"scripts/cep-panel-product-reset-client.js"),"\n// drift"));
    assert.equal((await c.connect(id)).code,"product_reset_client_source_changed");assert.equal(t.sends(),0);assert.equal(fs.existsSync(path.join(t.directory,id+".json")),false);assert.equal(fs.existsSync(path.join(t.directory,"client-attestation",id+".json")),false);t.unchanged();
  }));
  await check("stale loaded control cannot attest newer disk source",()=>fixture(async t=>{fs.appendFileSync(path.join(t.f.root,"mcp-server/cep-panel-control.js"),"\n// newer disk");assert.throws(()=>t.clientModule.productResetClientAttestation(),/loaded_source_changed/);assert.equal(t.sends(),0);}));
  await check("CLI closed schema rejects root/action/options and missing result UUID",()=>{const cli=require("./cep-panel-product-reset-client");for(const args of [[],["result","--client-sha256","a".repeat(64)],["connect","--root","foreign"],["invoke","--request-id",uuid(),"--client-sha256","a".repeat(64)],["state","--client-sha256","a".repeat(64),"--action","plan.run"]])assert.throws(()=>cli.parse(args),/arguments_invalid/);assert.equal(cli.parse(["attest"]).command,"attest");});
  process.stdout.write(JSON.stringify({ok:true,checks:cases.length,cases,scope:"offline signed lineage and fake CDP; no AE/native/network/provider",liveProof:false})+"\n");
}
if(require.main===module)main().catch(e=>{process.stderr.write((e.stack||String(e))+"\n");process.exitCode=1;});module.exports={main};

"use strict";
// Actual daemon HTTP/queue and full CEP VM, with fake CDP and native host only.
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),vm=require("node:vm"),Module=require("node:module"),crypto=require("node:crypto");
const network=require("./network-test-fixture"),control=require("../mcp-server/cep-panel-control"),contract=require("../cep-panel/panel-action-contract"),records=require("../mcp-server/plan-run-records");
const {makeFixture}=require("./generated-export-recovery-smoke"),{createPanelEnvironment}=require("./cep-plan-refresh-smoke"),{createVisualProject}=require("./placeholder-visual-fixture");
const copy=x=>JSON.parse(JSON.stringify(x)),root=network.createRuntimeDirectory();
async function main(){
  const port=await network.reserveLoopbackPort(),settings={port,automationToken:"reconnect-auto",panelToken:"reconnect-panel",adminToken:"reconnect-admin",devAdmin:true,commandTimeoutMs:1500};
  const envVars=network.isolatedEnvironment(root,settings);for(const key of Object.keys(process.env))if(/^(AE_|CODEBURN|OPENAI|ANTHROPIC|CLAUDE|GEMINI|GOOGLE|OPENROUTER)/i.test(key))delete process.env[key];Object.assign(process.env,envVars);
  fs.writeFileSync(path.join(root,"state","autonomy-preference.json"),JSON.stringify({schema:"ae-agent.autonomy-preference.v2",desiredEnabled:false}));
  const x=makeFixture();x.local.protocolVersion=x.remote.protocolVersion=contract.PROTOCOL_VERSION;
  const store=new Map([["codexAeBridgeUrl",`http://127.0.0.1:${port}`],["codexAeBridgeToken",settings.panelToken],["codexAeBridgeAutoConnect","0"],["codexAePanelConnectionId","isolated-connection"],
    ["codexAePanelActionReceiptsInitialized","1"],["codexAePanelActionReceipts",JSON.stringify({version:1,records:{[x.local.requestId]:{...x.remote,signature:"c".repeat(64)}},tombstones:{}})],
    ["codexAePanelActionReceiptIndex",JSON.stringify({[x.local.requestId]:{action:"plan.run",signature:"c".repeat(64)}})]]);
  const panelPath=path.resolve(__dirname,"../cep-panel/panel.js"),panelSource=fs.readFileSync(panelPath,"utf8").replace(/\}\)\(\);\s*$/, 'window.__recoveryNativeSetter=function(fn){cs.evalScript=fn;};window.__normalReadonlyFixture=function(){running=true;pollInFlight=false;recoveryTransportScope=null;panelConnectionGeneration=Date.now();panelLifecycleEpoch+=1;setBridgeConnected();pollTimer=setTimeout(poll,50);};})();');
  let panel=createPanelEnvironment(panelSource,{storageStore:store}),nativeScripts=[];
  const native=createVisualProject({nativeFilesystem:true});native.change('app.project.revision=7;child.name="Root";child.width=2;child.height=2;child.duration=5;child.frameRate=30;child.resolutionFactor=[4,4];');
  const hookNative=()=>panel.context.window.__recoveryNativeSetter((script,callback)=>{nativeScripts.push(script);assert(!/saveFrameToPng|items\.addComp|beginUndoGroup/.test(script),"Recovery never executes exports/mutations");callback(script.includes("__codexMcpBridgeResult")?JSON.stringify(native.execute(script)):"C:/Synthetic/Protected.aep");});hookNative();
  const installed={indexPath:path.join(root,"CEP","extensions",require("../mcp-server/ae-agent-panel-bootstrap").TARGET.bundleId,"index.html"),hashes:{source:"isolated"}},page={type:"page",url:require("node:url").pathToFileURL(installed.indexPath).href,webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/isolated"};
  const transport=control.createPanelControlService({stateDir:path.join(root,"logs","cep-panel-control"),inspectInstalledTarget:()=>installed,fetchCdpTargets:async()=>[page],evaluateViaCdp:async(_url,expression)=>copy(vm.runInContext(expression,panel.context))});
  control.saveDurableReceipt(path.join(root,"logs","cep-panel-control"),x.local);records.writeRecord(path.join(root,"logs"),x.record);
  const daemonPath=path.resolve(__dirname,"../mcp-server/bridge-daemon.js"),mod=new Module(daemonPath,module);mod.filename=daemonPath;mod.paths=Module._nodeModulePaths(path.dirname(daemonPath));const requireActual=mod.require.bind(mod);
  mod.require=id=>id==="./cep-panel-control"?{...control,createPanelControlService:()=>transport}:requireActual(id);
  const daemonSource=fs.readFileSync(daemonPath,"utf8").replace("  server.listen(PORT, HOST, () => {","  __isolatedServer=server;\n  server.listen(PORT, HOST, () => {");
  mod._compile(daemonSource+'\nlet __isolatedServer;module.exports.__startIsolated=()=>{startHttpBridge();return __isolatedServer;};module.exports.__restartRecoveryScopes=()=>{generatedRecoveryScopes.clear();generatedRecoveryByPanel.clear();};module.exports.__expireRecoveryScopes=()=>{for(const scope of generatedRecoveryScopes.values())scope.expiresAt=Date.now()-1;};',daemonPath);
  const daemon=mod.exports,server=daemon.__startIsolated(),fakeHttp={port};await new Promise(resolve=>server.once("listening",resolve));
  const requests=new Set(),trace=[];
  async function pump(until,{timers=false,holdHandshake=false,holdPreflight=false,postRelease=false,normalTimers=false}={}){
    const deadline=Date.now()+10000;
    while(!until() && Date.now()<deadline){
      for(const req of panel.inFlightRequests.slice()){
        if(requests.has(req) || holdHandshake && req.path.includes("recoveryHandshake=1"))continue;
        if(postRelease && req.path!=="/tools/call" && !req.path.startsWith("/bridge/") && !req.path.startsWith("/agents/plan/current"))continue;
        assert(req.path==="/tools/call" || req.path.startsWith("/bridge/") || postRelease && req.path.startsWith("/agents/plan/current"),"No provider/config requests in private recovery: "+req.path);
        requests.add(req);trace.push(req.path);
        network.request(fakeHttp,{path:req.path,method:req.method,body:req.body===null?undefined:req.body,token:settings.panelToken,headers:req.headers,timeoutMs:10000}).then(response=>{if(holdPreflight && req.path==="/tools/call")req.heldResponse=response;else req.respond(response.status,response.body);},error=>req.error(error.message)).finally(()=>{if(!holdPreflight)requests.delete(req);});
      }
      if(timers)panel.runTimer(timer=>timer.fn.name==="pollRecoveryTransport");
      if(normalTimers)panel.runTimer(timer=>timer.fn.name==="poll");
      await network.pause(5);
    }
    assert(until(),"Bounded pump timed out: "+JSON.stringify({state:panel.api.state(),reconciliations:Object.values(JSON.parse(store.get("codexAePanelActionReceipts")).records).filter(r=>r.action==="plan.reconcile").map(r=>({state:r.state,code:r.code,result:r.result}))}));
  }
  const action=()=>({protocolVersion:contract.PROTOCOL_VERSION,requestId:crypto.randomUUID(),action:"plan.reconcile",args:{runId:x.record.runId}});
  const status=async()=>JSON.parse((await daemon.callTool("get_bridge_status",{})).content[0].text);
  const originalPanelStore=new Map(store),resetPanel=(map=new Map(originalPanelStore))=>{panel=createPanelEnvironment(panelSource,{storageStore:map});hookNative();};
  try{
    assert.equal(panel.api.state().connected,false);assert.equal(panel.api.state().reconciliationRequired,true);
    const preferencesBefore=["codexAeBridgeUrl","codexAeBridgeToken","codexAeBridgeAutoConnect"].map(k=>store.get(k));
    let negativePreflights=0;
    for(const change of [r=>{r.plan.steps[2].tool="execute_extendscript";r.run.provenance.planSha256=require("../mcp-server/review-evidence").sha256(r.plan);},r=>delete r.run.finishedAt,r=>r.run.steps[1].commands[2].state="submitted",r=>r.run.steps[1].commands[2].result.resolutionFactor.after=[1,1]]){
      const altered=copy(x.record);change(altered);records.writeRecord(path.join(root,"logs"),altered);
      const e=action();await transport.invoke(e);await pump(()=>panel.api.getResult(e.requestId)?.state==="completed");assert.equal(panel.api.getResult(e.requestId).result.admissionGuardReleased,false);assert.equal(panel.api.state().recoveryTransport,null);assert.equal(nativeScripts.length,0);negativePreflights++;
    }
    records.writeRecord(path.join(root,"logs"),x.record);
    const localFile=control.createReceiptPath(path.join(root,"logs","cep-panel-control"),x.local.requestId),localBytes=fs.readFileSync(localFile);const wrongLocal=copy(x.local);wrongLocal.result.run.provenance.actionId="foreign-action";control.saveDurableReceipt(path.join(root,"logs","cep-panel-control"),wrongLocal);
    const badLink=action();await transport.invoke(badLink);await pump(()=>panel.api.getResult(badLink.requestId)?.state==="completed");assert.equal(panel.api.state().recoveryTransport,null);assert.equal(nativeScripts.length,0);negativePreflights++;fs.writeFileSync(localFile,localBytes);
    const hardcoreStore=new Map(originalPanelStore),hardcore=JSON.parse(hardcoreStore.get("codexAePanelActionReceipts")),hardcoreIndex=JSON.parse(hardcoreStore.get("codexAePanelActionReceiptIndex"));hardcore.records[x.local.requestId].action="agent.hardcore";hardcoreIndex[x.local.requestId].action="agent.hardcore";hardcoreStore.set("codexAePanelActionReceipts",JSON.stringify(hardcore));hardcoreStore.set("codexAePanelActionReceiptIndex",JSON.stringify(hardcoreIndex));resetPanel(hardcoreStore);
    const unsupportedHardcore=await transport.invoke(action());assert.equal(unsupportedHardcore.receipt.state,"rejected");assert.equal(unsupportedHardcore.receipt.code,"generated_recovery_original_plan_request_required");assert.equal(panel.inFlightRequests.length,0);assert.equal(nativeScripts.length,0);negativePreflights++;resetPanel();
    // A stale trusted P1 response cannot run its continuation.
    const stale=action();await transport.invoke(stale);await pump(()=>panel.inFlightRequests.some(r=>r.heldResponse),{holdPreflight:true});
    const staleResponse=panel.inFlightRequests.find(r=>r.heldResponse);panel.planOps.disconnect();staleResponse.respond(staleResponse.heldResponse.status,staleResponse.heldResponse.body);
    assert.equal(panel.api.getResult(stale.requestId).state,"unknown");assert.equal(panel.api.state().recoveryTransport,null);assert.equal(nativeScripts.length,0);negativePreflights++;
    resetPanel();
    // Failure to persist P1 never starts private connection.
    const failedStore=new Map(originalPanelStore),set=failedStore.set.bind(failedStore);failedStore.set=(key,value)=>{if(key==="codexAePanelActionReceipts" && value.includes('"status":"transport_prerequisite"'))throw Error("synthetic P1 persistence failure");return set(key,value);};resetPanel(failedStore);
    const notPersisted=action();await transport.invoke(notPersisted);await pump(()=>panel.api.getResult(notPersisted.requestId)?.state==="unknown");assert.equal(panel.api.state().recoveryTransport,null);assert.equal(nativeScripts.length,0);negativePreflights++;
    resetPanel();
    // Readiness timeout is terminal for the transport attempt, with no P2/retry.
    const timeout=action();await transport.invoke(timeout);await pump(()=>panel.inFlightRequests.some(r=>r.path.includes("recoveryHandshake=1")),{holdHandshake:true});panel.inFlightRequests.find(r=>r.path.includes("recoveryHandshake=1")).timeout();
    assert.equal(panel.api.getResult(timeout.requestId).state,"completed");assert.equal(panel.api.state().connected,false);assert.equal(nativeScripts.length,0);negativePreflights++;
    resetPanel();
    const expired=action();await transport.invoke(expired);await pump(()=>panel.inFlightRequests.some(r=>r.path.includes("recoveryHandshake=1")),{holdHandshake:true});daemon.__expireRecoveryScopes();await pump(()=>panel.api.state().recoveryTransport?.state==="failed");assert.equal(nativeScripts.length,0);assert.equal(panel.api.state().reconciliationRequired,true);negativePreflights++;
    resetPanel();
    const first=action();const firstAccepted=await transport.invoke(first);assert.equal(firstAccepted.receipt?.state,"running",JSON.stringify(firstAccepted));
    await pump(()=>panel.inFlightRequests.some(r=>r.path.includes("recoveryHandshake=1")),{holdHandshake:true});
    const p1=panel.api.getResult(first.requestId);assert.equal(p1.state,"completed");assert.equal(p1.generation,"0");assert.equal(p1.result.reconciliation.status,"transport_prerequisite");assert.equal(p1.result.admissionGuardReleased,false);assert.equal(nativeScripts.length,0);assert.equal((await status()).pendingCommands,0);
    const prerequisite=p1.result.reconciliation.transportPrerequisite,handshake=panel.inFlightRequests.find(r=>r.path.includes("recoveryHandshake=1"));
    assert.equal(panel.api.state().recoveryTransport.connecting,true);assert.equal(panel.invoke(action()).state,"rejected","Concurrent reconcile is bounded while connecting");
    // A foreign mutation arrives AFTER terminal preflight and BEFORE handshake.
    const foreign=daemon.callTool("create_comp",{name:"Foreign queued",width:320,height:180,duration:2,frameRate:30}).catch(e=>e);await network.pause(10);
    const blocked=await network.request(fakeHttp,{path:handshake.path,token:settings.panelToken});assert.equal(blocked.status,409);assert.equal(blocked.body.code,"generated_recovery_foreign_queue_blocked");assert.equal(blocked.body.command,null);assert.equal((await status()).pendingCommands,1);assert.equal(nativeScripts.length,0);
    handshake.respond(blocked.status,blocked.body);assert.equal(panel.api.state().connected,false);assert.equal(panel.api.state().reconciliationRequired,true);assert.equal(panel.api.getResult(first.requestId).state,"completed");
    await foreign;assert.equal(nativeScripts.length,0,"Foreign mutation was never leased/executed");
    // A NEW P1 explicitly follows the failed readiness attempt; no implicit retry.
    const retry=action();await transport.invoke(retry);await pump(()=>panel.api.state().connected,{timers:false});
    assert.equal(panel.api.getResult(retry.requestId).state,"completed");assert.equal(nativeScripts.length,0);assert.equal(panel.api.state().reconciliationRequired,true);
    const scope=panel.api.getResult(retry.requestId).result.reconciliation.transportPrerequisite;
    assert.equal(panel.invoke({protocolVersion:contract.PROTOCOL_VERSION,requestId:crypto.randomUUID(),action:"bridge.connect",args:{}}).code,"reconciliation_required","No general reconnect exception before release");
    const missing=`/bridge/next?panelConnectionId=${scope.panelConnectionId}&panelGeneration=${scope.nextBinding.panelGeneration}`;
    assert.equal((await network.request(fakeHttp,{path:missing,token:settings.panelToken})).status,409,"Missing selector cannot restore normal delivery");
    const forged=missing+"&recoveryMode=1&recoveryScopeId="+crypto.randomUUID();assert.equal((await network.request(fakeHttp,{path:forged,token:settings.panelToken})).status,409);
    const second=action();await transport.invoke(second);await pump(()=>panel.api.getResult(second.requestId)?.state==="completed",{timers:true});
    const complete=await transport.getResult(second.requestId);assert.equal(complete.ok,true,JSON.stringify(complete));
    const full=complete.receipt.result.reconciliation.generatedExportRecovery;assert.equal(full.receipt.terminal,"failed");assert.equal(full.receipt.steps[0].artifact.status,"missing");assert.equal(nativeScripts.length,3,"Exactly one project→comp→project native window");
    assert(nativeScripts.every(script=>!script.includes("saveFrameToPng")));assert.equal(panel.api.state().reconciliationRequired,false);assert.equal(panel.api.getResult(x.local.requestId).state,"unknown");assert.equal(control.loadDurableReceipt(path.join(root,"logs","cep-panel-control"),x.local.requestId).recoveryReference.sha256,full.sha256);
    assert.deepEqual(["codexAeBridgeUrl","codexAeBridgeToken","codexAeBridgeAutoConnect"].map(k=>panel.storageStore.get(k)),preferencesBefore);assert.equal((await status()).autonomousSession.desiredEnabled,false);
    // Only an explicit ordinary action AFTER full server proof/private adoption
    // may restore normal polling; its first request revalidates the full receipt.
    const restored={protocolVersion:contract.PROTOCOL_VERSION,requestId:crypto.randomUUID(),action:"bridge.connect",args:{}};assert.equal(panel.invoke(restored).state,"running");await pump(()=>panel.api.getResult(restored.requestId)?.state==="completed",{postRelease:true});assert.equal(panel.api.state().recoveryTransport,null);assert.equal(panel.api.state().connected,true);
    assert.deepEqual(["codexAeBridgeUrl","codexAeBridgeToken","codexAeBridgeAutoConnect"].map(k=>panel.storageStore.get(k)),preferencesBefore);
    // Server restart loses transient scopes: old/missing selectors stay blocked.
    daemon.__restartRecoveryScopes();const old=missing+"&recoveryMode=1&recoveryScopeId="+scope.scopeId;
    assert.equal((await network.request(fakeHttp,{path:old,token:settings.panelToken})).status,409);assert.equal((await network.request(fakeHttp,{path:missing,token:settings.panelToken})).status,409);
    assert.equal(trace.filter(p=>p==="/tools/call").length,negativePreflights+3);assert.equal(trace.some(p=>/^\/(agents|usage|autonomy)/.test(p) && !p.startsWith("/agents/plan/current")),false);
    // Connected ordinary setters retain their former selector-based typed reads.
    // This is current postcondition evidence, never PNG terminal/release authority.
    const setter=makeFixture(),setterArgs={compItemIndex:1,layerIndex:1,expectedCompItemId:10,expectedLayerId:11,position:[41,52],verifyAfter:true};
    setter.record.plan.steps=[{tool:"get_project_info",args:{}},{tool:"set_layer_transform",args:setterArgs},{tool:"get_project_info",args:{}}];setter.record.run.provenance.planSha256=require("../mcp-server/review-evidence").sha256(setter.record.plan);setter.record.run.error="synthetic setter timeout";
    Object.assign(setter.record.run.steps[1],{tool:"set_layer_transform",args:copy(setterArgs),error:setter.record.run.error,mutationResult:setter.record.run.error});setter.record.run.validation.steps=setter.record.plan.steps.map((s,i)=>({index:i+1,tool:s.tool,valid:true,safeArgs:copy(s.args)}));setter.record.run.validation.mutatingCount=1;
    for(const receipt of [setter.local,setter.remote]){receipt.protocolVersion=contract.PROTOCOL_VERSION;receipt.result={run:copy(setter.record.run),runId:setter.record.runId};}
    records.writeRecord(path.join(root,"logs"),setter.record);control.saveDurableReceipt(path.join(root,"logs","cep-panel-control"),setter.local);
    const setterStore=new Map([["codexAeBridgeUrl",`http://127.0.0.1:${port}`],["codexAeBridgeToken",settings.panelToken],["codexAeBridgeAutoConnect","0"],["codexAePanelConnectionId","isolated-connection"],["codexAePanelActionReceiptsInitialized","1"],["codexAePanelActionReceipts",JSON.stringify({version:1,records:{[setter.local.requestId]:{...setter.remote,signature:"e".repeat(64)}},tombstones:{}})],["codexAePanelActionReceiptIndex",JSON.stringify({[setter.local.requestId]:{action:"plan.run",signature:"e".repeat(64)}})]]);resetPanel(setterStore);
    const setterAction=()=>({protocolVersion:contract.PROTOCOL_VERSION,requestId:crypto.randomUUID(),action:"plan.reconcile",args:{runId:setter.record.runId}}),disconnected=setterAction(),beforeSetter=nativeScripts.length;
    await transport.invoke(disconnected);await pump(()=>panel.api.getResult(disconnected.requestId)?.state==="completed");assert.equal(nativeScripts.length,beforeSetter);assert.equal(panel.api.state().recoveryTransport,null);assert.equal(panel.api.state().reconciliationRequired,true);
    native.change('target.property("ADBE Transform Group").property("ADBE Position").value=[41,52];');panel.context.window.__normalReadonlyFixture();
    const ordinary=setterAction();await transport.invoke(ordinary);const selected=panel.inFlightRequests.find(r=>r.path==="/tools/call");assert.equal(selected.body.arguments.originalRequestId,setter.local.requestId);
    await pump(()=>panel.api.getResult(ordinary.requestId)?.state==="completed",{normalTimers:true,postRelease:true});const ordinaryReceipt=await transport.getResult(ordinary.requestId),ordinaryResult=ordinaryReceipt.receipt.result.reconciliation;
    assert.equal(ordinaryResult.steps.find(s=>s.tool==="set_layer_transform").mutationStatus,"applied");assert.equal(ordinaryResult.steps.find(s=>s.tool==="set_layer_transform").scope,"current_postconditions_only");assert.equal(ordinaryResult.generatedExportRecovery,undefined);assert.equal(ordinaryReceipt.receipt.result.admissionGuardReleased,false);assert.equal(panel.api.getResult(setter.local.requestId).state,"unknown");assert.equal(panel.api.getResult(setter.local.requestId).recovery,undefined);assert.equal(panel.api.state().reconciliationRequired,true);
    assert.equal(nativeScripts.slice(beforeSetter).filter(s=>s.includes("__codexMcpBridgeResult")).length,3,"Ordinary project→layer→project reads, no mutation replay");
    console.log(JSON.stringify({ok:true,scope:"actual full CEP VM + isolated production HTTP queue + production control/fake CDP/native",negativePreflights,p1NativeDispatches:0,p2NativeReads:3,exports:0,foreignMutationExecuted:0,ordinarySelectorPostconditionsOnly:true,ordinaryCompiledReads:3,originalHistory:"unknown preserved",projection:"durable",cases:["raw/nonterminal/no-restore/foreign linkage no connect or reads","stale response/P1 persistence failure no continuation","readiness timeout/expired scope no retry/P2","P1 persisted before lifecycle transition","foreign mutation between preflight/handshake blocks without lease","same-config private handshake command null","new P2 exact readonly window and missing PNG failed receipt","missing/forged/restarted scope no normal fallback","explicit normal connect after exact adoption only","connected ordinary selector setter reads retain guard","other gates/history/preferences/autonomy unchanged"]}));
  }finally{for(const req of panel.inFlightRequests.slice())req.error("fixture closing");await new Promise(resolve=>server.close(resolve));network.safeRemoveRuntime(root);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

"use strict";
// Narrow passive observer. No effect, user expression, storage write or authority.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{fileURLToPath}=require("node:url");
const REPO=path.resolve(__dirname,".."),ACTION="bridge.disconnect",freshCaptures=new WeakSet();
const ASSETS=Object.freeze(["panel.js","panel-actions.js","panel-action-contract.js"]),PROTOCOL="ae-agent.panel-actions.v1";
const hash=value=>crypto.createHash("sha256").update(value).digest("hex"),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function fail(code){throw Object.assign(Error(code),{code});}
function fixedRead(subjectId){
  var api=window.AEAgentPanelActions;
  if(!api||api.protocolVersion!=="ae-agent.panel-actions.v1"||typeof api.state!=="function")throw Error("causal_api_unavailable");
  var state=api.state(),catalog=api.catalog(),unresolved=state.unresolvedActions;
  if(!Array.isArray(unresolved))throw Error("causal_single_subject_required");
  if(subjectId ? unresolved.length>1||unresolved.some(function(r){return r.requestId!==subjectId||r.action!=="bridge.disconnect";}) : unresolved.length!==1||unresolved[0].action!=="bridge.disconnect")throw Error("causal_single_subject_required");
  var id=subjectId||unresolved[0].requestId,store=localStorage.getItem("codexAePanelActionReceipts"),indexRaw=localStorage.getItem("codexAePanelActionReceiptIndex"),initializedRaw=localStorage.getItem("codexAePanelActionReceiptsInitialized"),physicalRaw=localStorage.getItem("codexAePhysicalEvalScript.v1");
  if(typeof store!=="string"||store.length>5242880||typeof indexRaw!=="string"||indexRaw.length>1048576)throw Error("causal_store_unavailable");
  var parsed=JSON.parse(store);if(parsed.version!==1||!parsed.records||!parsed.records[id]||parsed.tombstones&&parsed.tombstones[id]||parsed.recoveries&&parsed.recoveries[id])throw Error("causal_record_unavailable");
  return {href:location.href,origin:location.origin,requestId:id,rawRecord:JSON.stringify(parsed.records[id]),indexRaw:indexRaw,initializedRaw:initializedRaw,physicalRaw:physicalRaw,connectAvailability:catalog.filter(function(r){return r.name==="bridge.connect";}).map(function(r){return r.availability;}),
    state:{protocolVersion:state.protocolVersion,panelInstanceId:state.panelInstanceId,panelLifecycleEpoch:state.panelLifecycleEpoch,panelGeneration:state.panelGeneration,activeAction:state.activeAction,actionStorage:state.actionStorage,reconciliationRequired:state.reconciliationRequired,
      trustedGuardRefresh:state.trustedGuardRefresh,recoveryTransport:state.recoveryTransport,nativeBusy:state.nativeBusy,physicalInflight:state.physicalInflight,causalLookup:state.causalLookup,panelLifecycleCausal:state.panelLifecycleCausal,humanSettlementLookupPending:state.humanSettlementLookupPending,ameFixtureDispositionLookupPending:state.ameFixtureDispositionLookupPending,nativeFixtureAbandonmentLookupPending:state.nativeFixtureAbandonmentLookupPending,nativeFixturePrephaseLookupPending:state.nativeFixturePrephaseLookupPending,nativeFixtureAdmissionRefusalLookupPending:state.nativeFixtureAdmissionRefusalLookupPending,unresolvedActions:state.unresolvedActions.map(function(r){return {requestId:r.requestId,entrySha256:r.entrySha256,action:r.action,code:r.code,phase:r.phase};})}};
}
const EXPRESSION="("+fixedRead.toString()+")()",expressions=new Set([EXPRESSION]);
function expressionFor(subject){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subject||""))fail("causal_subject_selector_invalid");const expression="("+fixedRead.toString()+")("+JSON.stringify(subject)+")";expressions.add(expression);return expression;}
function assetName(url,installed){
  let u,file;try{u=new URL(url);}catch(_){return null;}
  if(u.protocol!=="file:")fail("causal_unknown_asset");
  try{file=fileURLToPath(u);}catch(_){fail("causal_asset_url_invalid");}
  if(u.protocol!=="file:"||u.hash||u.search&&!/^\?v=[A-Za-z0-9._-]{1,128}$/.test(u.search))fail("causal_asset_url_invalid");
  const relative=path.relative(installed.root,file).replace(/\\/g,"/");
  if(relative.startsWith("..")||path.isAbsolute(relative))fail("causal_unknown_asset");
  if(![...ASSETS,"index.html","lib/CSInterface.js","native-probe-startup-guard.js"].includes(relative))fail("causal_unknown_asset");
  return relative;
}
function validateSnapshot(value,target,options={}){
  if(!value||value.href!==target.url||!["null","file://"].includes(value.origin)||value.initializedRaw!=="1")fail("causal_origin_or_store_changed");
  const state=value.state;
  const actor=state&&{panelInstanceId:state.panelInstanceId,panelLifecycleEpoch:state.panelLifecycleEpoch,panelGeneration:state.panelGeneration};require("./panel-lifecycle-causal").actor(actor);
  const own=options.lookupFrame,frame=state&&state.causalLookup;
  const ownLookup=!!own&&frame?.pending===true&&frame.nonce===own.nonce&&frame.sequence===own.sequence&&same(frame.actor,own.actor)&&same(actor,own.actor)&&state.trustedGuardRefresh?.pending===true&&state.trustedGuardRefresh.sequence===own.sequence;
  if(own&&!ownLookup)fail("causal_own_lookup_mismatch");
  if(!state||state.protocolVersion!==PROTOCOL||state.activeAction!==null||state.actionStorage!=="ready"||!options.subject&&state.reconciliationRequired!==true||state.recoveryTransport!=null||state.trustedGuardRefresh?.pending===true&&!ownLookup)fail("causal_actor_or_guard_changed");
  if(options.subject&&(state.nativeBusy!==false||state.physicalInflight!==0))fail("causal_native_physical_busy");
  if(ownLookup&&[state.humanSettlementLookupPending,state.ameFixtureDispositionLookupPending,state.nativeFixtureAbandonmentLookupPending,state.nativeFixturePrephaseLookupPending,state.nativeFixtureAdmissionRefusalLookupPending].some(v=>v!==false))fail("causal_other_lookup_pending");
  const availability=value.connectAvailability?.[0],ownAvailability=ownLookup&&availability?.available===false&&same(availability.reasonCodes,["trusted_guard_refresh_pending"]);
  if(!Array.isArray(value.connectAvailability)||value.connectAvailability.length!==1||!ownAvailability&&(availability?.available!==true||!Array.isArray(availability.reasonCodes)||availability.reasonCodes.length))fail("causal_private_controller_busy");
  if(value.physicalRaw!==null){let latch;try{latch=JSON.parse(value.physicalRaw);}catch(_){fail("causal_physical_latch_invalid");}if(!latch||typeof latch!=="object"||Array.isArray(latch)||Object.keys(latch).length!==0)fail("causal_physical_latch_busy");}
  if(!Array.isArray(state.unresolvedActions)||(options.subject ? state.unresolvedActions.length>1 : state.unresolvedActions.length!==1))fail("causal_unresolved_identity_count");
  let record,index;try{record=JSON.parse(value.rawRecord);index=JSON.parse(value.indexRaw);}catch(_){fail("causal_storage_json_invalid");}
  const id=value.requestId,entry=index&&index[id],unresolved=state.unresolvedActions[0],entrySha256=hash(value.rawRecord);
  if(!/^[a-f0-9-]{36}$/.test(id||"")||options.subject&&id!==options.subject||JSON.stringify(record)!==value.rawRecord||record.requestId!==id||record.action!==ACTION||record.state!=="unknown"||record.code!=="bridge_offline"||record.phase!=="bridge_offline"||record.httpStatus!==0||record.replayAllowed!==false||!options.subject&&(record.panelInstanceId!==actor.panelInstanceId||record.epoch!==actor.panelLifecycleEpoch||String(record.generation)!==actor.panelGeneration)||!/^[a-f0-9]{64}$/.test(record.signature||"")||entry?.action!==ACTION||entry.signature!==record.signature)fail("causal_receipt_or_index_mismatch");
  if(unresolved&&(unresolved.requestId!==id||unresolved.action!==ACTION||unresolved.code!==record.code||unresolved.phase!==record.phase||unresolved.entrySha256!==entrySha256))fail("causal_current_entry_hash_mismatch");
  // Deliberately never use record.postState.unresolvedActions[].entrySha256.
  return {requestId:id,rawRecord:value.rawRecord,entrySha256,indexRawSha256:hash(value.indexRaw),indexEntry:entry,initializedRaw:value.initializedRaw,initializedRawSha256:hash(value.initializedRaw),actor,state,href:value.href,origin:value.origin,physicalRaw:value.physicalRaw,physicalRawSha256:hash(value.physicalRaw===null?"absent":value.physicalRaw),connectAvailability:value.connectAvailability};
}
async function observer(url,WebSocketCtor=global.WebSocket,expression=EXPRESSION){
  if(!expressions.has(expression))fail("causal_expression_forbidden");
  const endpoint=new URL(url);if(endpoint.protocol!=="ws:"||endpoint.hostname!=="127.0.0.1"||endpoint.port!=="8870"||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!/^\/devtools\/page\/[^/]+$/.test(endpoint.pathname))fail("causal_cdp_endpoint_forbidden");
  if(typeof WebSocketCtor!=="function")fail("causal_websocket_unavailable");
  const ws=new WebSocketCtor(url),pending=new Map(),events=[];let sequence=0,dead=false,fatal=null,sourceIds=null;
  function rejectAll(code){fatal=fatal||code;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Object.assign(Error(code),{code}));}pending.clear();}
  ws.onmessage=event=>{try{if(typeof event.data!=="string"||Buffer.byteLength(event.data)>8*1024*1024)fail("causal_cdp_response_bound");const row=JSON.parse(event.data);if(row.id){const p=pending.get(row.id);if(!p)return;pending.delete(row.id);clearTimeout(p.timer);row.error?p.reject(Object.assign(Error("causal_cdp_refused"),{code:"causal_cdp_refused"})):p.resolve(row.result||{});}else if(row.method){events.push(row);if(events.length>4096)fail("causal_cdp_event_bound");if(row.method==="Debugger.paused")fail("causal_debugger_already_paused");}}catch(error){rejectAll(error.code||"causal_cdp_malformed");}};
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Object.assign(Error("causal_connect_timeout"),{code:"causal_connect_timeout"})),3000);ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=()=>{clearTimeout(timer);reject(Object.assign(Error("causal_connect_failed"),{code:"causal_connect_failed"}));};}).catch(error=>{try{ws.close();}catch(_){}throw error;});
  ws.onerror=()=>rejectAll("causal_cdp_transport_error");ws.onclose=()=>{dead=true;rejectAll("causal_cdp_closed");};
  async function send(method,params={}){
    if(dead||fatal)fail(fatal||"causal_cdp_closed");
    if(!["Runtime.enable","Runtime.disable","Runtime.evaluate","Debugger.enable","Debugger.disable","Debugger.getScriptSource"].includes(method))fail("causal_cdp_method_forbidden");
    if(method==="Runtime.evaluate"&&(params.expression!==expression||!Number.isInteger(params.contextId)||params.returnByValue!==true||params.awaitPromise!==false||params.silent!==true))fail("causal_expression_forbidden");
    if(method==="Debugger.getScriptSource"&&(!sourceIds||!sourceIds.has(params.scriptId)))fail("causal_script_id_forbidden");
    const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(Error("causal_cdp_timeout"),{code:"causal_cdp_timeout"}));},5000);pending.set(id,{resolve,reject,timer});try{ws.send(JSON.stringify({id,method,params}));}catch(_){clearTimeout(timer);pending.delete(id);reject(Object.assign(Error("causal_cdp_send_failed"),{code:"causal_cdp_send_failed"}));}});
  }
  return {events,send,pinScripts(ids){if(sourceIds||!Array.isArray(ids)||ids.length!==3||new Set(ids).size!==3||ids.some(id=>typeof id!=="string"))fail("causal_script_pin_invalid");sourceIds=new Set(ids);},captureError(){if(fatal&&fatal!=="causal_observer_closed")fail(fatal);},healthy(){if(dead||fatal)fail(fatal||"causal_cdp_closed");},async close(){if(dead)return;try{await send("Debugger.disable");}catch(_){}try{await send("Runtime.disable");}catch(_){}dead=true;rejectAll("causal_observer_closed");ws.onopen=ws.onerror=ws.onmessage=ws.onclose=null;try{ws.close();}catch(_){}}};
}
function metadata(events,installed){
  const contexts=new Map(),scripts=new Map();
  for(const row of events){
    if(row.method==="Debugger.scriptFailedToParse")fail("causal_script_parse_failure");
    if(row.method==="Debugger.paused")fail("causal_debugger_already_paused");
    if(row.method==="Runtime.executionContextsCleared"||row.method==="Runtime.executionContextDestroyed")fail("causal_context_drift");
    if(row.method==="Runtime.executionContextCreated"){const c=row.params.context;if(c.auxData?.isDefault){if(!Number.isInteger(c.id)||!c.auxData.frameId||!["file://","null",""] .includes(c.origin))fail("causal_context_invalid");if(contexts.has(c.id))fail("causal_default_context_recreated");contexts.set(c.id,c);}}
    if(row.method==="Debugger.scriptParsed"&&row.params.url){const s=row.params,name=assetName(s.url,installed);if(ASSETS.includes(name)){if(s.hasSourceURL||s.isModule||scripts.has(name)&&scripts.get(name).scriptId!==s.scriptId)fail("causal_loaded_asset_ambiguous");scripts.set(name,s);}}
  }
  if(contexts.size!==1||scripts.size!==3)fail("causal_loaded_context_or_asset_missing");
  const context=[...contexts.values()][0];if([...scripts.values()].some(s=>s.executionContextId!==context.id))fail("causal_asset_context_mismatch");
  return {context:{id:context.id,uniqueId:context.uniqueId||null,origin:context.origin,frameId:context.auxData.frameId},scripts:Object.fromEntries(ASSETS.map(name=>[name,{scriptId:scripts.get(name).scriptId,url:scripts.get(name).url,executionContextId:scripts.get(name).executionContextId}]))};
}
async function capture(deps,options={}){
  const expression=options.subject?expressionFor(options.subject):EXPRESSION;
  const installed=deps.inspectInstalled(),select=async()=>{const target=deps.selectTarget(await deps.targets(),installed);if(!target)fail("causal_target_missing");return target;},target=await select();
  const c=await deps.connect(target.webSocketDebuggerUrl,expression);let result,expectedMetadata;
  try{
    await c.send("Runtime.enable");await c.send("Debugger.enable");const before=metadata(c.events,installed);expectedMetadata=before;c.pinScripts(Object.values(before.scripts).map(s=>s.scriptId));
    async function loaded(){const values={};for(const name of ASSETS){const row=before.scripts[name],reply=await c.send("Debugger.getScriptSource",{scriptId:row.scriptId});if(typeof reply.scriptSource!=="string")fail("causal_asset_source_unavailable");const disk=deps.readAsset(installed,name),sha256=hash(reply.scriptSource),diskSha256=hash(disk);if(options.expectedLoaded&&sha256!==options.expectedLoaded[name]||options.expectedDisk&&diskSha256!==options.expectedDisk[name]||!options.expectedLoaded&&sha256!==diskSha256)fail("causal_loaded_disk_hash_mismatch");values[name]={sha256,diskSha256,matchesDisk:sha256===diskSha256};}return values;}
    async function read(){const r=await c.send("Runtime.evaluate",{expression,contextId:before.context.id,returnByValue:true,silent:true,awaitPromise:false});if(r.exceptionDetails||!r.result||!Object.hasOwn(r.result,"value"))fail("causal_fixed_read_failed");return validateSnapshot(r.result.value,target,options);}
    const assetsBefore=await loaded(),first=await read(),second=await read(),assetsAfter=await loaded();
    c.healthy();if(!same(before,metadata(c.events,installed))||!same(target,await select())||!same(installed,deps.inspectInstalled())||!same(assetsBefore,assetsAfter)||!same(first,second))fail("causal_capture_drift");
    result={schema:"ae-agent.panel-lifecycle-causal-capture.v1",collectedAt:new Date().toISOString(),action:ACTION,target,installed:{root:installed.root,indexPath:installed.indexPath,hashes:installed.hashes},context:before.context,loadedAssets:assetsAfter,...second,adjudicated:false,settlementIssued:false,historicalOutcome:"unknown_preserved",replayAllowed:false,submitProof:false};
  }finally{await c.close();}
  c.captureError();if(!same(expectedMetadata,metadata(c.events,installed)))fail("causal_cleanup_context_drift");
  return result;
}
function production(sourceRoot){
  const bootstrap=require(path.join(REPO,"mcp-server/ae-agent-panel-bootstrap")),control=require(path.join(REPO,"mcp-server/cep-panel-control")),ledger=require(path.join(REPO,"mcp-server/native-fixture-attempt-ledger"));
  return {inspectInstalled:()=>bootstrap.inspectInstalledTarget(undefined,sourceRoot),targets:()=>control.fetchCdpTargets(8870,3000),selectTarget:bootstrap.exactCdpTarget,connect:(url,expression)=>observer(url,global.WebSocket,expression),readAsset:(installed,name)=>ledger.readBytes(path.join(installed.root,name))};
}
async function captureFresh(){
  const store=require("./panel-lifecycle-causal").privateStore(),subject=store.loadSubject(),sourceRoot=store.assertOldAssets(subject);
  // Complete signed eight-asset baseline, not current installation self-hashes.
  // These ignored bytes are only compared as data; never imported or executed.
  const deps=production(sourceRoot),inspect=deps.inspectInstalled;
  deps.inspectInstalled=()=>{store.assertOldAssets(subject);subject.pin.assertUnchanged();subject.policy.assertUnchanged();const installed=inspect(),expected=subject.source.oldInstalledAssetsManifest;if(Object.keys(installed.hashes).length!==Object.keys(expected).length||Object.keys(expected).some(name=>installed.hashes[name]!==expected[name])||hash(require("./native-fixture-attempt-ledger").readBytes(path.join(installed.root,".debug")))!==subject.source.oldDebugSha256)fail("causal_old_installed_manifest_changed");return installed;};
  const value=await capture(deps);freshCaptures.add(value);return value;
}
function assertFresh(value){if(!freshCaptures.has(value))fail("causal_fresh_private_observer_required");}
function newProduction(store,certificate){const deps=production(),inspect=deps.inspectInstalled;deps.inspectInstalled=()=>{const installed=inspect(),pins=certificate.value.authorizedTarget.assets;if(Object.keys(installed.hashes).some(n=>installed.hashes[n]!==pins[n])||hash(require("./native-fixture-attempt-ledger").readBytes(path.join(installed.root,".debug")))!==pins[".debug"])fail("causal_new_installed_manifest_changed");return installed;};return deps;}
async function captureNew(lookupFrame,rearm=false){const store=require("./panel-lifecycle-causal").privateStore(),certificate=store.certificate({allowUnbound:rearm});if(!certificate)fail("causal_certificate_required");const value=await capture(newProduction(store,certificate),{subject:certificate.value.classification.subject.requestId,lookupFrame,expectedLoaded:certificate.value.authorizedTarget.assets,expectedDisk:certificate.value.authorizedTarget.assets});store.certificate({allowUnbound:rearm});freshCaptures.add(value);return value;}
async function captureBeforeUpgrade(){const causal=require("./panel-lifecycle-causal"),store=causal.privateStore(),certificate=store.certificate();if(!certificate)fail("causal_certificate_required");const value=await capture(newProduction(store,certificate),{expectedLoaded:causal.ASSETS,expectedDisk:certificate.value.authorizedTarget.assets});store.certificate();freshCaptures.add(value);return value;}
module.exports={ASSETS,EXPRESSION,validateSnapshot,assetName,metadata,observer,capture,captureFresh,captureForAdoption:frame=>captureNew(frame),captureForRearm:()=>captureNew(undefined,true),captureAfterUpgrade:()=>captureNew(),captureBeforeUpgrade,assertFresh};

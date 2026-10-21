"use strict";
// Offline only: pure synthetic evidence and the existing full-panel VM/fake XHR.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto");
const causal=require("../mcp-server/panel-lifecycle-causal"),observer=require("../mcp-server/panel-lifecycle-causal-observer"),{createPanelEnvironment}=require("./cep-plan-refresh-smoke");
const clone=v=>JSON.parse(JSON.stringify(v)),tests=[],cases=[];
function test(name,fn){cases.push({name,fn});}
function fixture(){
  const actor={panelInstanceId:"panel-synthetic-causal",panelLifecycleEpoch:2,panelGeneration:"123456789"},id="12345678-1234-4123-8123-123456789abc";
  const input={protocolVersion:"ae-agent.panel-actions.v1",requestId:id,action:"bridge.disconnect",args:{},expectedState:clone(actor)};
  const record={protocolVersion:input.protocolVersion,requestId:id,action:input.action,state:"unknown",phase:"bridge_offline",acceptedAt:"2026-10-21T00:00:00.000Z",panelInstanceId:actor.panelInstanceId,epoch:actor.panelLifecycleEpoch,generation:actor.panelGeneration,code:"bridge_offline",message:causal.MESSAGE,effect:"panel_lifecycle",delivery:"unknown",replayAllowed:false,signature:causal.signature(input),source:"programmatic",result:{diagnostic:clone(causal.DIAGNOSTIC)},diagnostic:clone(causal.DIAGNOSTIC),httpStatus:0,completedAt:"2026-10-21T00:00:10.000Z",postState:{unresolvedActions:[{requestId:id,entrySha256:"0".repeat(64)}]}};
  const rawRecord=JSON.stringify(record),entrySha256=causal.hash(rawRecord),indexEntry={action:input.action,signature:record.signature};
  const before={protocolVersion:input.protocolVersion,...actor,busy:false,reconciliationRequired:false,unresolvedActions:[],activeAction:null,actionStorage:"ready",recoveryTransport:null};
  const capture={schema:"ae-agent.panel-lifecycle-causal-capture.v1",collectedAt:"2026-10-21T00:01:00.000Z",requestId:id,action:input.action,actor:clone(actor),context:{id:1,frameId:"synthetic-frame",origin:"file://",uniqueId:"synthetic-context"},target:{url:"file:///C:/synthetic/com.codex.aemcpbridge/index.html",webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/synthetic"},href:"file:///C:/synthetic/com.codex.aemcpbridge/index.html",origin:"file://",loadedAssets:Object.fromEntries(Object.entries(causal.ASSETS).map(([n,p])=>[n,{sha256:p,diskSha256:p,matchesDisk:true}])),rawRecord,entrySha256,indexEntry,indexRawSha256:causal.hash(JSON.stringify({[id]:indexEntry})),initializedRaw:"1",initializedRawSha256:causal.hash("1"),state:{protocolVersion:input.protocolVersion,...actor,activeAction:null,actionStorage:"ready",reconciliationRequired:true,unresolvedActions:[{requestId:id,entrySha256,action:input.action,code:"bridge_offline",phase:"bridge_offline"}]}};
  return {capture,input,before,record};
}
function classify(f){return causal.classify(f.capture,f.input,f.before);}
function replaceRecord(f,mutate,updateOuter=true){const r=JSON.parse(f.capture.rawRecord);mutate(r);f.capture.rawRecord=JSON.stringify(r);f.capture.entrySha256=causal.hash(f.capture.rawRecord);if(updateOuter)f.capture.state.unresolvedActions[0].entrySha256=f.capture.entrySha256;}
test("one synthetic exact recipe is a candidate, never trust or replay",()=>{const f=fixture(),snapshot=JSON.stringify(f),r=classify(f);assert.equal(r.causalResult,"handler_not_submitted");assert.equal(r.authenticatedObservation,false);assert.equal(r.originalOutcome,"unknown_preserved");assert.equal(r.replayAllowed,false);assert.equal(JSON.stringify(f),snapshot);});
test("nested postState SHA is not the final-record pin",()=>{const f=fixture();assert.notEqual(f.record.postState.unresolvedActions[0].entrySha256,f.capture.entrySha256);classify(f);f.capture.state.unresolvedActions[0].entrySha256=f.record.postState.unresolvedActions[0].entrySha256;assert.throws(()=>classify(f),{code:"panel_causal_outer_entry_mismatch"});});
for(const [name,mutate] of [
  ["diagnostic",f=>replaceRecord(f,r=>r.diagnostic.message+=" altered")],
  ["body",f=>replaceRecord(f,r=>r.result.diagnostic.code="other")],
  ["formatted message",f=>replaceRecord(f,r=>r.message+=" altered")],
  ["HTTP status",f=>replaceRecord(f,r=>r.httpStatus=500)],
  ["source asset",f=>f.capture.loadedAssets["panel.js"].sha256="0".repeat(64)],
  ["disk mismatch",f=>f.capture.loadedAssets["panel.js"].matchesDisk=false],
  ["extra loaded asset",f=>f.capture.loadedAssets["other.js"]={sha256:"0".repeat(64)}],
  ["raw hash",f=>f.capture.rawRecord+=" "],
  ["index action",f=>f.capture.indexEntry.action="bridge.connect"],
  ["index signature",f=>f.capture.indexEntry.signature="0".repeat(64)],
  ["initialized",f=>f.capture.initializedRaw="0"],
  ["actor",f=>f.capture.actor.panelLifecycleEpoch++],
  ["input actor",f=>f.input.expectedState.panelInstanceId="panel-other"],
  ["input body",f=>f.input.args.extra=true],
  ["different action",f=>f.input.action="bridge.connect"],
  ["second UNKNOWN",f=>f.capture.state.unresolvedActions.push(clone(f.capture.state.unresolvedActions[0]))],
  ["before busy",f=>f.before.busy=true],
  ["before recovery",f=>f.before.recoveryTransport={state:"connecting"}],
  ["before prior UNKNOWN",f=>f.before.unresolvedActions.push({requestId:"other"})],
  ["current active action",f=>f.capture.state.activeAction={requestId:"other"}],
  ["current storage failure",f=>f.capture.state.actionStorage="failed"],
  ["different origin",f=>f.capture.origin="https://example.invalid"],
  ["original outcome relabel",f=>replaceRecord(f,r=>r.state="error")],
  ["replay enabled",f=>replaceRecord(f,r=>r.replayAllowed=true)],
  ["GET transport failure",f=>replaceRecord(f,r=>{r.phase="transport";r.diagnostic.phase="transport";})],
  ["injected submitProof flag cannot repair an invalid source",f=>{f.capture.submitProof=true;f.capture.loadedAssets["panel.js"].sha256="1".repeat(64);}]
])test("reject altered "+name,()=>{const f=fixture();mutate(f);assert.throws(()=>classify(f),error=>/^panel_causal_/.test(error.code||""));});
test("unreviewed recipe cannot be supplied",()=>{const f=fixture();assert.throws(()=>causal.classify(f.capture,f.input,f.before,{recipe:causal.RECIPE}),{code:"panel_causal_recipe_not_reviewed"});});
test("whole index issuance pin is evidence, not a permanent index freeze",()=>{const f=fixture(),old=classify(f);f.capture.indexRawSha256=causal.hash("new independent receipt metadata");const next=classify(f);assert.deepEqual(old.subject,next.subject);assert.notEqual(old.issuance.indexRawSha256,next.issuance.indexRawSha256);});
function observerSnapshot(){const f=fixture();return {...f.capture,indexRaw:JSON.stringify({[f.input.requestId]:f.capture.indexEntry}),physicalRaw:null,connectAvailability:[{available:true,reasonCodes:[]}],state:{...f.capture.state,trustedGuardRefresh:{pending:false},recoveryTransport:null}};}
test("observer accepts only the single exact current subject and empty physical map",()=>{const v=observerSnapshot();const r=observer.validateSnapshot(v,v.target);assert.equal(r.requestId,v.requestId);assert.equal(r.physicalRaw,null);v.physicalRaw="{}";observer.validateSnapshot(v,v.target);});
for(const [name,mutate] of [
  ["physical latch pending",v=>v.physicalRaw=JSON.stringify({pendingCount:1})],
  ["physical latch corrupt",v=>v.physicalRaw="broken"],
  ["physical latch array",v=>v.physicalRaw="[]"],
  ["physical latch pendingCount is a producer-map key",v=>v.physicalRaw='{"pendingCount":0}'],
  ["physical latch mixed spoof",v=>v.physicalRaw='{"pendingCount":0,"actualPending":{"submittedAt":1}}'],
  ["private controller busy",v=>v.connectAvailability=[{available:false,reasonCodes:["panel_busy"]}]],
  ["pending trusted refresh",v=>v.state.trustedGuardRefresh={pending:true}],
  ["recovery transport",v=>v.state.recoveryTransport={state:"failed"}],
  ["second unresolved",v=>v.state.unresolvedActions.push(clone(v.state.unresolvedActions[0]))]
])test("observer refuses "+name,()=>{const v=observerSnapshot();mutate(v);assert.throws(()=>observer.validateSnapshot(v,v.target),e=>/^causal_/.test(e.code||""));});
test("stored JSON and cache-only proof cannot acquire fresh observer brand",()=>{assert.throws(()=>observer.assertFresh(fixture().capture),{code:"causal_fresh_private_observer_required"});assert.throws(()=>observer.assertFresh({submitProof:true,fresh:true}),{code:"causal_fresh_private_observer_required"});});

const oldPanel=fs.readFileSync(path.join(__dirname,"../cep-panel/panel.js"),"utf8");
function requestVM(){
  const transport=oldPanel.slice(oldPanel.indexOf("  function request(method"),oldPanel.indexOf("  function refreshAppTitle")).replace(/^\s+observeCausalRuntime\(xhr,error\);\r?\n/m,"");
  assert.equal(causal.hash(transport),"8132832a26b00ce598f87275a6e530f573176fa9c9a9f518f32d39315c19bc3c","VM seam retains the reviewed old transport function bytes");
  const source=oldPanel.replace(/\}\)\(\);\s*$/,"window.__causalRequest=request;window.__causalIdle=panelLifecycleIdle;window.__causalDisconnect=panelActionHandlers['bridge.disconnect'];})();");
  const env=createPanelEnvironment(source,{storageStore:new Map()});
  return env;
}
test("duplicate POST XHR terminal callbacks notify once",()=>{const env=requestVM();let calls=0,error;env.window.__causalRequest("POST","/tools/call",{name:"get_bridge_status",arguments:{}},e=>{calls++;error=e;});const req=env.inFlightRequests[env.inFlightRequests.length-1];req.respond(0,null);req.respond(200,{ok:true});assert.equal(calls,1);assert.equal(error.isUnknown,true);assert.equal(error.code,"bridge_offline");});
test("post-submit callback throw cannot become bridge_offline or notify twice",()=>{const env=requestVM();let calls=0;env.window.__causalRequest("POST","/tools/call",{},e=>{calls++;assert.equal(e,null);throw Error("callback storage exception after submit");});const req=env.inFlightRequests[env.inFlightRequests.length-1];req.respond(200,{ok:true});req.respond(0,null);assert.equal(calls,1);});
test("failed GET plan synchronization is not UNKNOWN",()=>{const env=requestVM();let error;env.window.__causalRequest("GET","/agents/plan/current",null,e=>{error=e;});env.inFlightRequests[env.inFlightRequests.length-1].respond(0,null);assert.equal(error.isUnknown,false);});
test("actual disconnect handler never submits after idle POST bridge_offline",()=>{const env=requestVM();let submitted=0,calls=0,observed;env.window.__causalDisconnect({},e=>{calls++;observed=e;},{submit(){submitted++;return true;}});const req=env.inFlightRequests[env.inFlightRequests.length-1];assert.equal(req.path,"/tools/call");assert.equal(req.body.name,"get_bridge_status");req.respond(0,null);req.respond(200,{ok:true});assert.equal(submitted,0);assert.equal(calls,1);assert.equal(observed.code,"bridge_offline");assert.equal(observed.isUnknown,true);});
function idleStatus(){return {result:{content:[{text:JSON.stringify({pendingCommands:0,inflightCommands:[],activeEditSession:null,projectLifecycle:{blocked:false,pending:null}})}]}};}
test("actual handler GET plan failure precedes submit and stays non-UNKNOWN",()=>{const env=requestVM();let submitted=0,observed;env.window.__causalDisconnect({},e=>{observed=e;},{submit(){submitted++;return true;}});env.inFlightRequests[env.inFlightRequests.length-1].respond(200,idleStatus());const req=env.inFlightRequests[env.inFlightRequests.length-1];assert.equal(req.path,"/agents/plan/current");req.respond(0,null);assert.equal(submitted,0);assert.equal(observed.isUnknown,false);});
test("actual handler callback/storage exception after submit never rewrites to bridge_offline",()=>{const env=requestVM();let submitted=0,calls=0,observed="unset";env.window.__causalDisconnect({},e=>{calls++;observed=e;throw Error("storage exception after submit");},{submit(){submitted++;return true;}});env.inFlightRequests[env.inFlightRequests.length-1].respond(200,idleStatus());const req=env.inFlightRequests[env.inFlightRequests.length-1];assert.equal(req.path,"/agents/plan/current");req.respond(200,{ok:true,current:null});req.respond(0,null);assert.equal(submitted,1);assert.equal(calls,1);assert.equal(observed,null);});

function privateFixture(){
  const root="C:\\synthetic-causal",base=path.join(root,"authority","panel-lifecycle-causal"),files=new Map(),fds=new Map(),trusted=new WeakSet();let fd=0;
  const canonical=v=>Array.isArray(v)?"["+v.map(canonical).join(",")+"]":v&&typeof v==="object"?"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}":JSON.stringify(v);
  const rawHash=v=>crypto.createHash("sha256").update(typeof v==="string"||Buffer.isBuffer(v)?v:canonical(v)).digest("hex");
  // Source-byte pin stand-ins only. HMAC, canonical envelopes, tamper detection
  // and CREATE_NEW behavior below use real crypto and virtual private files.
  const pins=new Map(Object.entries(causal.ASSETS).map(([n,h])=>["fixture-old:"+n,h]));
  const fixtureCrypto={...crypto,createHash(algorithm){const chunks=[];return {update(v){chunks.push(Buffer.from(v));return this;},digest(format){const bytes=Buffer.concat(chunks),pin=pins.get(bytes.toString());return pin&&format==="hex"?pin:crypto.createHash(algorithm).update(bytes).digest(format);}};}};
  const error=code=>Object.assign(Error(code),{code}),readBytes=p=>{if(!files.has(p))throw error("ENOENT");return Buffer.from(files.get(p));};
  const exists=p=>files.has(p)||[...files.keys()].some(n=>n.startsWith(p+path.sep));const virtualFs={realpathSync:()=>root,lstatSync(p){if(!exists(p))throw error("ENOENT");return {size:files.get(p)?.length||0,isFile:()=>files.has(p),isDirectory:()=>!files.has(p),isSymbolicLink:()=>false};},readdirSync:p=>[...new Set([...files.keys()].filter(n=>n.startsWith(p+path.sep)).map(n=>n.slice(p.length+1).split(path.sep)[0]))],existsSync:exists,openSync(p,flags){assert.equal(flags,"wx");if(files.has(p))throw error("EEXIST");files.set(p,Buffer.alloc(0));fds.set(++fd,p);return fd;},writeFileSync(n,bytes){assert(fds.has(n));files.set(fds.get(n),Buffer.from(bytes));},fsyncSync(){},closeSync(n){fds.delete(n);}};
  const authority={base:r=>path.join(r,"authority"),runtimeControlFor:r=>{assert.equal(r,root);return {credential(p){assert.equal(p.daemon.port,3456);assert.equal(p.daemon.credentialSha256,rawHash("synthetic-private-token"));return "synthetic-private-token";}};},privateFile(p){const bytes=readBytes(p),rawSha256=rawHash(bytes),value=JSON.parse(bytes);return {rawSha256,value,assertUnchanged(){assert.equal(rawHash(readBytes(p)),rawSha256,"virtual private pin drift");}};}};
  let generation="22345678-1234-4123-8123-123456789abc",sourceSha256="a".repeat(64),loadedSource=null;
  const supervisor={readDaemonRegistration(){return {generation,bootNonce:"42345678-1234-4123-8123-123456789abc",sourceSha256:loadedSource||sourceSha256,kernelIdentity:{pid:321,createdAt:"2026-10-21T00:00:00Z"},serviceStartedAt:"2026-10-21T00:00:01.000Z"};},registeredGeneration(){return {refs:{reservationSha256:"b".repeat(64),registrationSha256:"c".repeat(64)},reservation:{value:{credentialSha256:rawHash("synthetic-private-token")}}};}};
  const control={computeActionSignature:i=>rawHash(JSON.stringify({action:i.action,args:{},expectedState:i.expectedState})),readIndexedReceipt(dir,id){const raw=readBytes(path.join(dir,id+".json")),indexRaw=readBytes(path.join(dir,"identities.json")),row=JSON.parse(raw),index=JSON.parse(indexRaw),identity=index.identities[id];if(!identity||identity.action!==row.action||identity.signature!==row.signature)throw error("receipt_corrupt");return {row,identity,rawReceiptSha256:rawHash(raw),rawIndexSha256:rawHash(indexRaw),identitySha256:rawHash(JSON.stringify(identity))};}};
  const replacements={"node:crypto":fixtureCrypto,"node:fs":virtualFs,"./deployment-mode":{deploymentMode:()=>"product"},"./cep-panel-control":control,"./owned-runtime-authority":authority,"./owned-runtime-lifecycle":{canonical,hash:rawHash},"./native-fixture-attempt-ledger":{readBytes,ensure(){},safeDirectory(){}},"./owned-runtime-supervisor":supervisor,"./review-evidence":{runtimeIdentity:()=>({sourceSha256})},"./panel-lifecycle-causal-observer":{assertFresh(v){if(!trusted.has(v))throw error("causal_fresh_private_observer_required");}}};
  const module={exports:{}};vm.runInNewContext("(function(require,module,exports,__dirname){"+fs.readFileSync(path.join(__dirname,"../mcp-server/panel-lifecycle-causal.js"),"utf8")+"\n})",{Buffer},{})(n=>Object.hasOwn(replacements,n)?replacements[n]:require(n),module,module.exports,path.dirname(path.join(root,"mcp-server","panel-lifecycle-causal.js")));
  const api=module.exports,store=api.privateStore(),f=fixture();f.capture.physicalRawSha256=rawHash("absent");
  const oldInstalledAssetsManifest={};for(const name of causal.STATIC_ASSETS){const raw="fixture-old:"+name;files.set(path.join(base,"subject-assets",name),Buffer.from(raw));if(name!==".debug")oldInstalledAssetsManifest[name]=pins.get(raw)||rawHash(raw);files.set(path.join(root,"cep-panel",name),Buffer.from("fixture-new:"+name));}
  const localRow={...JSON.parse(f.capture.rawRecord),binding:clone(f.capture.actor),delivery:"delivered",signature:control.computeActionSignature(f.input)},localIdentity={action:localRow.action,signature:localRow.signature,binding:localRow.binding},receiptRaw=JSON.stringify(localRow),identityRaw=JSON.stringify(localIdentity),indexRaw=JSON.stringify({schema:"ae-agent.cep-panel-transport.v1",identities:{[f.input.requestId]:localIdentity}}),initializedRaw=JSON.stringify({schema:"ae-agent.cep-panel-transport.v1"});
  const localTransport={namespace:"logs/cep-panel-control",receiptRaw,receiptRawSha256:rawHash(receiptRaw),identityRaw,identityRawSha256:rawHash(identityRaw),indexRawSha256:rawHash(indexRaw),initializedRaw,initializedRawSha256:rawHash(initializedRaw),checkpoint:{kind:"not_owned",present:false}};
  const localDir=path.join(root,"logs","cep-panel-control");files.set(path.join(localDir,f.input.requestId+".json"),Buffer.from(receiptRaw));files.set(path.join(localDir,"identities.json"),Buffer.from(indexRaw));files.set(path.join(localDir,"initialized.json"),Buffer.from(initializedRaw));
  const raw={capture:JSON.stringify(f.capture),input:JSON.stringify(f.input),before:JSON.stringify(f.before)},provisioning={schema:causal.SCHEMA+".provisioning",authorizationRef:{source:"explicit_user_chat",reference:"12345678-1234-4123-8123-123456789abc:panel-lifecycle-causal-technical-recovery"},raw,rawSha256:Object.fromEntries(Object.entries(raw).map(([n,v])=>[n,rawHash(v)])),oldInstalledAssetsManifest,oldDebugSha256:rawHash("fixture-old:.debug"),localTransport};
  files.set(path.join(base,"provisioning.json"),Buffer.from(JSON.stringify(provisioning)));
  function tamper(kind,mutate){const file=path.join(base,kind+".json"),e=JSON.parse(readBytes(file));mutate(e.value);e.sha256=rawHash(e.value);files.set(file,Buffer.from(JSON.stringify(e)));}
  return {api,store,files,base,root,f,trusted,provisioning,tamper,rawHash,localDir,localRow,replacements,authority,supervisor,canonical,setGeneration:v=>{generation=v;},setSource:v=>{sourceSha256=v;},setLoadedSource:v=>{loadedSource=v;}};
}
test("separate signed policy and subject CREATE_NEW; identical provisioning is idempotent",()=>{const x=privateFixture(),p=x.store.provisionOnce(),before=Buffer.from(x.files.get(path.join(x.base,"policy.json")));assert.equal(p.value.nativeExecutionAuthority,false);assert.equal(p.value.humanAbandonAuthority,false);assert.equal(x.store.loadSubject().classification.subject.requestId,x.f.input.requestId);x.store.provisionOnce();assert.deepEqual(x.files.get(path.join(x.base,"policy.json")),before);});
test("fresh memory observer is mandatory for certificate issuance",()=>{const x=privateFixture();x.store.provisionOnce();assert.throws(()=>x.store.issue(x.f.capture),{code:"causal_fresh_private_observer_required"});assert.equal(x.store.read("certificate"),null);});
test("one certificate pins exact runtime and source; second issue preserves bytes",()=>{const x=privateFixture();x.store.provisionOnce();x.trusted.add(x.f.capture);const c=x.store.issue(x.f.capture),bytes=Buffer.from(x.files.get(path.join(x.base,"certificate.json")));assert.equal(x.store.certificate().pin.envelope.sha256,c.envelope.sha256);assert.throws(()=>x.store.issue(x.f.capture),{code:"panel_causal_certificate_already_created"});assert.deepEqual(x.files.get(path.join(x.base,"certificate.json")),bytes);});
test("HMAC rejects forged policy even with recomputed envelope hash",()=>{const x=privateFixture();x.store.provisionOnce();x.tamper("policy",v=>v.authorizationRef.reference="22345678-1234-4123-8123-123456789abc:panel-lifecycle-causal-technical-recovery");assert.throws(()=>x.store.loadPolicy(),{code:"panel_causal_authentication_invalid"});});
test("signed source raw/index drift refuses issuance",()=>{const x=privateFixture();x.store.provisionOnce();x.tamper("subject-source",v=>v.raw.capture+=" ");assert.throws(()=>x.store.loadSubject(),{code:"panel_causal_subject_source_changed"});});
test("source-assets must be complete signed baseline, never installed self-hashes",()=>{const x=privateFixture();x.files.set(path.join(x.base,"subject-assets","style.css"),Buffer.from("changed"));assert.throws(()=>x.store.provisionOnce(),{code:"panel_causal_old_asset_bytes_changed"});assert.equal(x.store.read("policy"),null);});
test("partial signed subject does not auto-authorize policy or certificate",()=>{const x=privateFixture();x.store.provisionOnce();x.files.delete(path.join(x.base,"policy.json"));assert.throws(()=>x.store.provisionOnce(),{code:"panel_causal_partial_provision_readback_only"});assert.equal(x.store.read("certificate"),null);});
test("different runtime generation cannot adopt on same credential",()=>{const x=privateFixture();x.store.provisionOnce();x.trusted.add(x.f.capture);x.store.issue(x.f.capture);x.setGeneration("32345678-1234-4123-8123-123456789abc");assert.throws(()=>x.store.certificate(),{code:"panel_causal_runtime_rearm_required"});});
test("new source and asset bytes refuse existing certificate",()=>{const x=privateFixture();x.store.provisionOnce();x.trusted.add(x.f.capture);x.store.issue(x.f.capture);x.files.set(path.join(x.root,"cep-panel","style.css"),Buffer.from("other source"));assert.throws(()=>x.store.certificate(),{code:"panel_causal_certificate_binding_changed"});});
test("prepare pins full fresh index without permanently freezing other entries",()=>{const x=privateFixture();x.store.provisionOnce();x.f.capture.indexRawSha256=causal.hash("later legitimate independent entry metadata");x.trusted.add(x.f.capture);const c=x.store.issue(x.f.capture);assert.equal(c.value.preparedObservation.issuance.indexRawSha256,x.f.capture.indexRawSha256);assert.notEqual(c.value.preparedObservation.issuance.indexRawSha256,c.value.classification.issuance.indexRawSha256);x.store.certificate();});
function runSync(){for(const item of cases){item.fn();tests.push(item.name);}return {ok:true,scope:"pure classifier, HMAC virtualFS and reviewed old-source VM; no live calls",passed:tests.length,tests};}
if(require.main===module)console.log(JSON.stringify(runSync()));
module.exports={fixture,privateFixture,runSync};

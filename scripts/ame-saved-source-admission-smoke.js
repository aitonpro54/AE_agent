"use strict";
// Offline VMs only: real admission/product ports/executor/fixed native programs.
// No Adobe process, live daemon, queue cleanup, START, save or external service.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),vm=require("node:vm");
const admission=require("../mcp-server/ame-saved-source-admission"),jobs=require("../mcp-server/ame-title-jobs"),presets=require("../mcp-server/ame-presets");
const {createProductDispatch}=require("../mcp-server/ame-product-dispatch"),{createProductReadDispatch}=require("../mcp-server/ame-product-read-dispatch");
const scratch=path.resolve(__dirname,"../.codex-runtime/ame-saved-source-admission/fixtures");fs.mkdirSync(scratch,{recursive:true});
const root=fs.mkdtempSync(path.join(scratch,"bounded-")),copy=v=>JSON.parse(JSON.stringify(v));let checks=0;
async function check(name,run){await run();checks++;console.log("PASS "+name);}
function fixture(label){
  const dir=path.join(root,label);fs.mkdirSync(dir);const source=path.join(dir,"one-existing.aep");fs.writeFileSync(source,"one saved AEP, eleven native composition identities");
  const presetDir=path.join(dir,"presets");fs.mkdirSync(presetDir);fs.writeFileSync(path.join(presetDir,"exact.epr"),"<PremiereData><PresetName>Fixture</PresetName><ExporterName>Fixture</ExporterName></PremiereData>");
  const catalog=()=>presets.scanPresetRoots({roots:[{source:"fixture",path:presetDir}]}),preset=catalog().presets[0];assert(preset);
  let actor=1,ready=true,clock=Date.now(),adds=0,sends=0,nativeReads=0,census=0,readHook=null,dispatchHook=null,guidList=null;
  const forbidden=()=>{throw Error("START, save, launch or foreign queue operation forbidden");};
  class TestDate extends Date{constructor(value){super(arguments.length?value:clock);}static now(){return clock;}}
  function CompItem(id){Object.assign(this,{id,name:"Титр "+id,dynamicLinkGUID:"abcdefab-1234-1234-1234-"+String(id).padStart(12,"0"),duration:10,workAreaStart:1,workAreaDuration:4});}
  const comps=Array.from({length:11},(_,i)=>new CompItem(i+1));
  const project={file:{fsName:source},revision:123,dirty:false,numItems:comps.length,item:i=>comps[i-1],renderQueue:{rendering:false},save:forbidden};
  function File(file){const s=fs.lstatSync(file);this.exists=true;this.alias=s.isSymbolicLink();this.length=s.size;this.modified=s.mtime;}
  const ae=vm.createContext({app:{project},CompItem,File,Date:TestDate,$:{global:{},sleep:ms=>{clock+=ms;}}});
  const frontend={addEventListener:()=>{},getDLItemsAtRoot:file=>{assert.equal(file,source);census++;return guidList||comps.map(c=>c.dynamicLinkGUID);},
    addDLToBatch:(file,format,epr,guid,output)=>{assert.equal(file,source);assert.equal(format,"");assert(comps.some(c=>c.dynamicLinkGUID===guid));assert.equal(epr,path.resolve(preset.canonicalPath));adds++;return {outputFiles:[],setWorkArea:()=>true,addEventListener:()=>{},getEncodeProgress:()=>0,getEncodeTime:()=>0};},removeAllBatchItems:forbidden};
  const host={isBatchRunning:()=>false,addEventListener:()=>{},runBatch:forbidden};
  for(const target of [host,frontend])for(const k of ["getBatchItems","getQueue","batchItems","numBatchItems"])Object.defineProperty(target,k,{get:forbidden});
  const ame=vm.createContext({Date:TestDate,BridgeTalk:{appSpecifier:"ame-26.0"},$:{global:{aeAgentAMEProbeSessionNonce:"session"}},app:{getFrontend:()=>frontend,getEncoderHost:()=>host}});
  function BridgeTalk(){this.send=()=>{sends++;clock++;this.onResult({body:vm.runInContext(this.body,ame,{timeout:2000})});return true;};}
  BridgeTalk.isRunning=()=>true;BridgeTalk.launch=forbidden;BridgeTalk.pump=()=>{};ae.BridgeTalk=BridgeTalk;
  const inspectArgs={expectedProjectFile:source,expectedRevision:123,comps:comps.map(c=>({compItemId:c.id,expectedName:c.name}))};
  const sourceAdmission=admission.createAdmission({captureActor:()=>({connection:"panel",generation:actor}),assertReady:()=>assert(ready,"not idle"),readNative:async body=>{
    nativeReads++;if(readHook)readHook();return {result:vm.runInContext("(function(){"+body+"}())",ae,{timeout:2000})};
  }});
  const contexts=new WeakSet(),assertContext=c=>assert(contexts.has(c)&&c.current,"private current context required");
  const dispatch=async(script,timeout,metadata)=>{assert.equal(timeout,30000);assert.equal(crypto.createHash("sha256").update(script).digest("hex"),metadata.scriptSha25664);if(dispatchHook)dispatchHook(metadata);return {result:vm.runInContext("(function(){"+script+"}())",ae,{timeout:2000})};};
  const product=createProductDispatch({assertProduct:()=>true,assertContext,savedSourceAdmission:sourceAdmission,assertSavedSource:()=>{throw Error("no snapshot producer");},dispatch});
  const reader=createProductReadDispatch({assertProduct:()=>true,dispatch}),dispatchPorts=new WeakMap();
  const port={prepareEnqueue:(...a)=>product.prepareEnqueue(...a),prepareStart:forbidden,assertPreparation:(...a)=>product.assertPreparation(...a),usesSavedSource:(...a)=>product.usesSavedSource(...a),getSavedSourceGuard:(...a)=>product.getSavedSourceGuard(...a),
    authorize:(m,c,p)=>{const selected=m.mutating?product:reader,cap=selected.authorize(m,c,p);dispatchPorts.set(cap,selected);return cap;},assertAuthorization:(cap,...a)=>dispatchPorts.get(cap).assertAuthorization(cap,...a),dispatch:(cap,...a)=>dispatchPorts.get(cap).dispatch(cap,...a)};
  const batchId=crypto.randomUUID(),processInfo={pid:77,startedAt:new Date(clock).toISOString(),path:path.join(dir,"AME.exe")},common={targetSpecifier:"ame-26.0",expectedProcess:{pid:77,startedAt:processInfo.startedAt},expectedSessionNonce:"session"};
  const executor=jobs.createExecutor({stateDir:path.join(dir,"state"),now:()=>clock++,inspectProcesses:async()=>[processInfo],listPresetCatalog:catalog,resolveOutputFilePath:name=>path.join(dir,"outputs",name),assertManualIngress:forbidden,assertSharedQueueIngress:assertContext,assertServerContext:assertContext,runExtendScriptBody:forbidden,nativeDispatchPort:port});
  let report;
  const args=i=>({...common,batchId,queueMode:"shared_queue_v1",sourceProjectFile:source,expectedSourceSha25664:report.source.sha25664,sourceGuid:comps[i].dynamicLinkGUID,presetId:preset.presetId,presetSha25664:preset.sha256,outputFileName:"title-"+i+".mov",range:{startSeconds:1,endSeconds:5}});
  const add=async i=>{const a=args(i),context={args:a,current:true,runId:crypto.randomUUID()};contexts.add(context);return executor.execute(jobs.ENQUEUE,a,executor.authorize(jobs.ENQUEUE,a,context));};
  return {source,comps,project,inspectArgs,sourceAdmission,product,port,executor,common,batchId,args,add,
    inspect:async()=>report=await sourceAdmission.inspect(inspectArgs),status:id=>executor.execute(jobs.STATUS,{...common,batchId,jobId:id}),counts:()=>({adds,sends,nativeReads,census}),
    actor:()=>actor++,ready:v=>{ready=v;},readHook:fn=>{readHook=fn;},dispatchHook:fn=>{dispatchHook=fn;},guidList:v=>{guidList=v;},contexts};
}
(async()=>{
  await check("11-comp native admission; two exact GUIDs from ONE AEP enqueue and own queued STATUS; START=0",async()=>{
    const f=fixture("accepted"),report=await f.inspect();assert.equal(report.executionAuthority,false);assert.equal(report.project.comps.length,11);assert.equal(report.requiresExactAmeGuid,true);
    const a=await f.add(0),b=await f.add(1);for(const r of [a,b]){assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.ownItemAccepted,true);const s=await f.status(r.jobId);assert.equal(s.native.job.status,"queued");assert.equal(s.ownItemAccepted,true);}
    assert.equal(f.counts().adds,2);assert.equal(f.counts().census,2);assert.equal(f.counts().nativeReads,3);
  });
  await check("caller proof/flags/GUID injection cannot mint private admission or capability",async()=>{
    const f=fixture("forgery");await f.inspect();const a=f.args(0);for(const field of ["savedExistingSourceGuard","savedNativeSourceVerified","sourceAdmission","proof"])assert.throws(()=>jobs.validateInput(jobs.ENQUEUE,{...a,[field]:true}),/invalid_input/);
    assert.throws(()=>admission.validateInput({...f.inspectArgs,project:{dirty:false}}),/invalid_input/);
    assert.throws(()=>f.sourceAdmission.assertPreparation({}, {}, {}),/private_capability/);
    const g=fixture("no-admission"),selector={schema:"ae-agent-ame-title-reservation-selector.v1",operation:"enqueue",argsHash:jobs.operationArgsHash(jobs.ENQUEUE,a),sourcePath:g.source};assert.throws(()=>g.product.prepareEnqueue(selector,{args:a}),/private current/);
    const context={args:a,current:true};g.contexts.add(context);assert.throws(()=>g.product.prepareEnqueue(selector,context),/no snapshot producer/);
    assert.equal(f.counts().adds,0);
  });
  await check("dirty/revision/path/name/GUID drift before fresh preparation rejects without AME send",async()=>{
    for(const [name,change] of [["dirty",f=>{f.project.dirty=true;}],["revision",f=>{f.project.revision++;}],["path",f=>{f.project.file.fsName+=".other.aep";}],["name",f=>{f.comps[0].name+=" changed";}],["GUID",f=>{f.comps[0].dynamicLinkGUID=f.comps[1].dynamicLinkGUID;}]]){
      const f=fixture("drift-"+name);await f.inspect();change(f);const r=await f.add(0);assert.equal(r.ok,false);assert.equal(f.counts().sends,0);assert.equal(f.counts().adds,0);
    }
  });
  await check("source change during native read and after admission rejects",async()=>{
    const f=fixture("read-file-change");f.readHook(()=>fs.appendFileSync(f.source," changed during read"));await assert.rejects(f.inspect(),/changed_during_read/);assert.equal(f.sourceAdmission.hasSource(f.source),false);
    const g=fixture("held-file-change");await g.inspect();fs.appendFileSync(g.source," changed afterwards");assert.equal((await g.add(0)).ok,false);assert.equal(g.counts().sends,0);
  });
  await check("connection generation/idle/native read staleness and invalid manifests reject",async()=>{
    const f=fixture("actor-change");await f.inspect();f.actor();assert.equal((await f.add(0)).ok,false);assert.equal(f.counts().sends,0);
    const g=fixture("actor-during-read");g.readHook(()=>g.actor());await assert.rejects(g.inspect(),/changed_during_read/);
    const h=fixture("not-idle");h.ready(false);await assert.rejects(h.inspect(),/not idle/);
    for(const comps of [[],[h.inspectArgs.comps[0],h.inspectArgs.comps[0]],[{compItemId:1,expectedName:"bad",dynamicLinkGUID:"claim"}]])assert.throws(()=>admission.validateInput({...h.inspectArgs,comps}),/manifest_bound|exact_comp|invalid_input/);
  });
  await check("sender rechecks native clean revision/comp and file after Node preparation; no constructor/send effect",async()=>{
    for(const [name,change] of [["dirty",f=>{f.project.dirty=true;}],["revision",f=>{f.project.revision++;}],["guid",f=>{f.comps[0].dynamicLinkGUID="abcdefab-1234-1234-1234-123456789012";}],["file",f=>fs.appendFileSync(f.source," late write")]]){
      const f=fixture("final-"+name);await f.inspect();f.dispatchHook(m=>{if(m.operation==="enqueue")change(f);});const r=await f.add(0);assert.equal(r.ok,false);assert.equal(r.automaticRetryAllowed,false);assert.equal(f.counts().sends,0);assert.equal(f.counts().adds,0);
    }
  });
  await check("mandatory exact AME GUID membership: missing, duplicate and case mismatch never addDL",async()=>{
    for(const [name,list] of [["missing",()=>[]],["duplicate",f=>[f.comps[0].dynamicLinkGUID,f.comps[0].dynamicLinkGUID]],["case",f=>[f.comps[0].dynamicLinkGUID.toUpperCase()]]]){
      const f=fixture("census-"+name);await f.inspect();f.guidList(list(f));const r=await f.add(0);assert.equal(r.ok,false);assert.equal(f.counts().census,1);assert.equal(f.counts().adds,0);
    }
  });
  await check("file and directory aliases/hardlinks are rejected",async()=>{
    const f=fixture("aliases"),link=path.join(path.dirname(f.source),"hardlink.aep");fs.linkSync(f.source,link);await assert.rejects(f.inspect(),/file_identity_invalid/);
    const g=fixture("parent-alias"),alias=path.join(root,"junction");fs.symlinkSync(path.dirname(g.source),alias,process.platform==="win32"?"junction":"dir");await assert.rejects(g.sourceAdmission.inspect({...g.inspectArgs,expectedProjectFile:path.join(alias,path.basename(g.source))}),/directory_alias/);
  });
  await check("used preparation/context cannot dispatch again; restart has no admission authority",async()=>{
    const f=fixture("once"),report=await f.inspect(),a=f.args(0),context={args:a,current:true};f.contexts.add(context);
    const selector={schema:"ae-agent-ame-title-reservation-selector.v1",operation:"enqueue",argsHash:jobs.operationArgsHash(jobs.ENQUEUE,a),processBinding:"a".repeat(64),sourcePath:f.source,sourceSha25664:report.source.sha25664,sourceGuid:a.sourceGuid,range:a.range};
    const cap=await f.product.prepareEnqueue(selector,context);assert.equal(f.product.usesSavedSource(cap,context),false);assert(f.product.getSavedSourceGuard(cap,context));assert.throws(()=>f.product.getSavedSourceGuard({},context),/preparation_required/);assert.throws(()=>f.product.assertPreparation(cap,selector,{...context}),/private current/);
    const unguarded="return {ok:true};",metadataBase={schema:"ae-agent-ame-title-dispatch.v2",operation:"enqueue",mutating:true,processBinding:selector.processBinding,batchId:a.batchId,targetSpecifier:a.targetSpecifier,expectedProcess:a.expectedProcess},missing={...metadataBase,scriptSha25664:crypto.createHash("sha256").update(unguarded).digest("hex")};
    const missingCap=f.product.authorize(missing,context,cap);await assert.rejects(f.product.dispatch(missingCap,unguarded,30000,missing,context),/native_source_guard_required/);
    const script=admission.guardScript(f.product.getSavedSourceGuard(cap,context))+unguarded,metadata={...metadataBase,scriptSha25664:crypto.createHash("sha256").update(script).digest("hex")};
    const dispatchCap=f.product.authorize(metadata,context,cap);await f.product.dispatch(dispatchCap,script,30000,metadata,context);await assert.rejects(f.product.dispatch(dispatchCap,script,30000,metadata,context),/capability_required/);assert.throws(()=>f.product.authorize(metadata,context,cap),/binding_changed/);
    const restarted=admission.createAdmission({captureActor:()=>({}),assertReady:()=>{},readNative:()=>{throw Error("must not read");}});assert.equal(restarted.hasSource(f.source),false);await assert.rejects(restarted.prepare(selector,context),/admission_required/);
  });
  await check("panel generation drift after authorize and re-admission revoke old preparation before dispatch",async()=>{
    for(const mode of ["generation","re-admission"]){const f=fixture("revoke-"+mode),report=await f.inspect(),a=f.args(0),context={args:a,current:true};f.contexts.add(context);
      const selector={schema:"ae-agent-ame-title-reservation-selector.v1",operation:"enqueue",argsHash:jobs.operationArgsHash(jobs.ENQUEUE,a),processBinding:"a".repeat(64),sourcePath:f.source,sourceSha25664:report.source.sha25664,sourceGuid:a.sourceGuid,range:a.range},preparation=await f.product.prepareEnqueue(selector,context);
      f.product.assertPreparation(preparation,selector,context);const script=admission.guardScript(f.product.getSavedSourceGuard(preparation,context))+"return {ok:true};",metadata={schema:"ae-agent-ame-title-dispatch.v2",operation:"enqueue",mutating:true,processBinding:selector.processBinding,batchId:a.batchId,targetSpecifier:a.targetSpecifier,expectedProcess:a.expectedProcess,scriptSha25664:crypto.createHash("sha256").update(script).digest("hex")},cap=f.product.authorize(metadata,context,preparation);
      if(mode==="generation")f.actor();else await f.inspect();await assert.rejects(f.product.dispatch(cap,script,30000,metadata,context),/admission_stale/);assert.equal(f.counts().sends,0);
    }
  });
  await check("actual daemon product context binds owned edit session identity",async()=>{
    const source=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8"),begin=source.indexOf("const productAmeContexts=new WeakMap();"),end=source.indexOf("const titleExportExecutor=",begin),m100=require("../mcp-server/m100-protocol");assert(begin>0&&end>begin);
    const args={queueMode:"shared_queue_v1"},payload={plan:{steps:[]}},record={payload,payloadHash:m100.sha256Payload(payload),confirmedBySurface:"cep-autonomous-session",confirmedBySession:"session-s",actionId:"a",proposalExpiresAt:"future"},authority={sessionHash:"s"};
    const box={deploymentMode:"product",ownedRuntimeStartup:{managed:true},panelControlUsesRetainedTransport:()=>false,m100Protocol:m100,autonomousSession:{authorization:()=>authority},currentProposalState:{assertExecution:()=>{}},projectSave:{verifyDryRunReceipt:()=>{}},AUTONOMY_CONTRACT_VERSION:"test",ameSharedQueue:{MODE:"shared_queue_v1"},manualPlanIngress:{brand:()=>{throw Error("manual only");}}};
    const actual=vm.runInNewContext(source.slice(begin,end)+"\n({brandAmeTitleContext,assertProductAmeContext})",box),context={record,runId:"r",args,checkpoint:{sourceFile:"source.aep"},ownedEditSessionId:"own-session",autonomous:true,confirm:true,allowWithoutCheckpoint:false,stepCount:1};
    actual.brandAmeTitleContext(context,authority);assert.equal(actual.assertProductAmeContext(context),true);context.ownedEditSessionId="other-session";assert.throws(()=>actual.assertProductAmeContext(context),/current_runner_required/);
  });
  await check("actual M100 classifier/catalog adapter and runtime source collector include readonly admission",async()=>{
    const daemon=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");assert(daemon.includes('const ameSavedSourceAdmission = require("./ame-saved-source-admission");'));assert(daemon.includes("  ameSavedSourceAdmission.tool,"));assert(daemon.includes("if(name===ameSavedSourceAdmission.TOOL)"));
    const mutating=daemon.slice(daemon.indexOf("const MUTATING_TOOL_NAMES ="),daemon.indexOf("const MUTATION_SUMMARY_TOOL_NAMES ="));assert(!mutating.includes("ameSavedSourceAdmission"));assert(!mutating.includes(admission.TOOL));
    const knownStart=daemon.indexOf("function knownToolNames() {"),knownEnd=daemon.indexOf("\nfunction m100RiskPolicyStatus",knownStart),riskStart=daemon.indexOf("function classifyM100ToolRisk(name) {"),riskEnd=daemon.indexOf("\nfunction m100DirectEscapeHatchAllowed",riskStart);
    const ctx=vm.createContext({tools:[admission.tool],M100_RISK_POLICY_VERSION:"test",M100_RAW_JSX_TOOL_NAMES:new Set(["run_extendscript","run_extendscript_file"]),M100_DESTRUCTIVE_TOOL_NAMES:new Set(["delete_layer"]),MUTATING_TOOL_NAMES:new Set([jobs.ENQUEUE,jobs.START]),panelBootstrap:{TOOL_NAME:"ensure_ae_agent_panel"}});
    vm.runInContext(daemon.slice(knownStart,knownEnd)+daemon.slice(riskStart,riskEnd),ctx);const risk=vm.runInContext("classifyM100ToolRisk("+JSON.stringify(admission.TOOL)+")",ctx);assert.equal(risk.known,true);assert.equal(risk.riskLevel,"read_only");assert.equal(risk.requiresProposal,false);assert.equal(vm.runInContext('classifyM100ToolRisk("inspect_saved_ame_title_source_forged").known',ctx),false);
    const adapter=fs.readFileSync(path.join(__dirname,"../mcp-server/mcp-adapter.js"),"utf8"),start=adapter.indexOf("async function getTools() {"),end=adapter.indexOf("\nasync function callDaemonTool",start);assert(start>0&&end>start);
    const merge=vm.runInNewContext(adapter.slice(start,end)+"\ngetTools",{productionUsageTools:[],ownedRuntimeTools:[],initialRuntime:null,ensureDaemonRunning:async()=>{},daemonRequest:async()=>({status:200,body:{ok:true,tools:[admission.tool]}}),log:()=>{throw Error("unexpected adapter failure");}}),catalog=await merge();assert.equal(catalog[0].name,admission.TOOL);assert.equal(catalog[0].annotations.readOnlyHint,true);
    const hashes=require("../mcp-server/review-evidence").runtimeNamedHashSet(path.resolve(__dirname,".."));for(const name of ["mcp-server/ame-saved-source-admission.js","mcp-server/ame-product-dispatch.js"]){const pin=hashes.find(p=>p.name===name);assert(pin);assert.equal(pin.sha256,crypto.createHash("sha256").update(fs.readFileSync(path.resolve(__dirname,"..",name))).digest("hex"));}
  });
  console.log(JSON.stringify({ok:true,checks,evidence:"offline actual admission/product dispatch/executor/native VMs; 2 same-AEP jobs, START=0"}));
})().catch(error=>{console.error(error);process.exitCode=1;});

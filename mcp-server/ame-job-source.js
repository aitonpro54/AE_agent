"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const native=require("./ame-job-source-native"),save=require("./project-save"),{stableStringify,sha256Payload}=require("./m100-protocol");
const hashing=require("./ame-job-source-sha256");
const TOOL="create_ame_job_source",INSPECT="inspect_ame_job_source",RECONCILE="reconcile_ame_job_source",SCHEMA="ae-agent-ame-job-source.v1";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,SHA=/^[a-f0-9]{64}$/,GUID=/^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/;
const PROBE_TTL_MS=120000;
const clone=v=>JSON.parse(JSON.stringify(v)),hash=v=>crypto.createHash("sha256").update(Buffer.isBuffer(v)?v:stableStringify(v)).digest("hex"),same=(a,b)=>String(a).replace(/\\/g,"/").toLowerCase()===String(b).replace(/\\/g,"/").toLowerCase();
function fail(code){throw Object.assign(Error(code),{code});}
function object(v,keys){if(!v||typeof v!=="object"||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail("ame_source_invalid_input");}
function local(v){if(typeof v!=="string"||v!==v.trim()||v.length>4096||/[\x00-\x1f]/.test(v)||!path.isAbsolute(v)||/^(\\\\|\/\/)/.test(v)||v.replace(/\\/g,"/").split("/").some(s=>s==="."||s==="..")||process.platform==="win32"&&/:/.test(v.slice(2)))fail("ame_source_canonical_local_path_required");return path.resolve(v);}
function range(v,duration=Infinity){object(v,["startSeconds","endSeconds"]);if(Object.keys(v).length!==2||!Number.isFinite(v.startSeconds)||v.startSeconds<0||!Number.isFinite(v.endSeconds)||v.endSeconds<=v.startSeconds||v.endSeconds>duration+1e-7)fail("ame_source_range_invalid");return {...v};}
function validateInput(name,raw){
  if(name===RECONCILE){object(raw,["runId","commandId"]);if(Object.keys(raw).length!==2||!UUID.test(raw.runId||"")||!UUID.test(raw.commandId||""))fail("ame_source_exact_selector_required");return {...raw};}
  if(![TOOL,INSPECT].includes(name))fail("ame_source_unknown_tool");
  object(raw,name===INSPECT?["expectedProjectFile","compItemId"]:["intentId","expectedProjectFile","expectedSourceSha25664","expectedRevision","expectedStateHash","compItemId","visibilityPatch","range","verifyAfter","checkpointLabel","autoCheckpoint"]);
  const a={expectedProjectFile:local(raw.expectedProjectFile),compItemId:raw.compItemId};
  if(!/\.aep$/i.test(a.expectedProjectFile)||!Number.isSafeInteger(a.compItemId)||a.compItemId<1)fail("ame_source_exact_comp_required");
  if(name===INSPECT)return a;
  if(raw.verifyAfter!==undefined&&raw.verifyAfter!==true)fail("ame_source_verification_required");
  if(!UUID.test(raw.intentId||"")||!SHA.test(raw.expectedSourceSha25664||"")||!SHA.test(raw.expectedStateHash||"")||!Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<0)fail("ame_source_baseline_required");
  Object.assign(a,{intentId:raw.intentId,expectedSourceSha25664:raw.expectedSourceSha25664,expectedRevision:raw.expectedRevision,expectedStateHash:raw.expectedStateHash});
  const patch=raw.visibilityPatch===undefined?[]:raw.visibilityPatch;
  if(!Array.isArray(patch)||patch.length>1000)fail("ame_source_patch_bound");const seen=new Set();
  a.visibilityPatch=patch.map(v=>{object(v,["layerId","expectedEnabled","enabled"]);if(Object.keys(v).length!==3||!Number.isSafeInteger(v.layerId)||v.layerId<1||typeof v.expectedEnabled!=="boolean"||typeof v.enabled!=="boolean"||seen.has(v.layerId))fail("ame_source_exact_patch_required");seen.add(v.layerId);return {...v};});
  if(raw.range!==undefined)a.range=range(raw.range);return a;
}
function directories(dir){
  const result=[];for(let p=local(dir);;p=path.dirname(p)){const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||!same(fs.realpathSync(p),p))fail("ame_source_directory_alias");result.push({path:p,device:String(s.dev),inode:String(s.ino)});if(path.dirname(p)===p)return result;}
}
function makeDirectory(dir){const missing=[];let parent=local(dir);while(!fs.existsSync(parent)){missing.push(parent);parent=path.dirname(parent);}directories(parent);for(const p of missing.reverse()){try{fs.mkdirSync(p,{mode:0o700});}catch(e){if(e.code!=="EEXIST")throw e;}directories(p);}}
function fileRecord(file,empty=false){
  file=local(file);const parents=directories(path.dirname(file)),before=fs.lstatSync(file);
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.ino===0||!same(fs.realpathSync(file),file)||before.size>1024*1024*1024||(!empty&&before.size<1))fail("ame_source_file_identity_invalid");
  const fd=fs.openSync(file,"r"),sha=crypto.createHash("sha256"),buffer=Buffer.alloc(512*1024);let count,bytes=0;
  try{const held=fs.fstatSync(fd);if(before.dev!==held.dev||before.ino!==held.ino)fail("ame_source_file_changed");while((count=fs.readSync(fd,buffer,0,buffer.length,null))){bytes+=count;if(bytes>1024*1024*1024)fail("ame_source_file_bound");sha.update(buffer.subarray(0,count));}}finally{fs.closeSync(fd);}
  const after=fs.lstatSync(file);if(!after.isFile()||after.isSymbolicLink()||after.nlink!==1||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||bytes!==after.size||!same(fs.realpathSync(file),file)||stableStringify(parents)!==stableStringify(directories(path.dirname(file))))fail("ame_source_file_changed");
  return {path:file,sha25664:sha.digest("hex"),bytes:after.size,mtimeMs:after.mtimeMs,ctimeMs:after.ctimeMs,device:String(after.dev),inode:String(after.ino),parents};
}
function unchanged(pin){if(stableStringify(fileRecord(pin.path,pin.bytes===0))!==stableStringify(pin))fail("ame_source_file_changed");}
function observation(o,a){
  if(!o||o.dirty!==false||!same(o.snapshot?.projectFile,a.expectedProjectFile)||o.snapshot.compItemId!==a.compItemId||!Number.isSafeInteger(o.snapshot.revision)||!GUID.test(o.guid||"")||!Array.isArray(o.snapshot.graph)||!o.snapshot.graph.length||o.snapshot.graph.length>100)fail("ame_source_clean_observation_required");
  const root=o.snapshot.graph.find(v=>v.id===a.compItemId);if(!root||!Number.isFinite(root.duration)||root.duration<=0)fail("ame_source_comp_observation_invalid");
  range(o.range,root.duration);if(o.range.startSeconds!==root.workAreaStart||o.range.endSeconds!==root.workAreaStart+root.workAreaDuration)fail("ame_source_work_area_mismatch");return o;
}
function expectedSnapshot(before,a){
  const wanted=clone(before.snapshot),root=wanted.graph.find(v=>v.id===a.compItemId);
  for(const p of a.visibilityPatch){const rows=root.layers.filter(v=>v.id===p.layerId);if(rows.length!==1||rows[0].enabled!==p.expectedEnabled||rows[0].locked)fail("ame_source_visibility_baseline_changed");rows[0].enabled=p.enabled;}
  if(a.range){range(a.range,root.duration);root.workAreaStart=a.range.startSeconds;root.workAreaDuration=a.range.endSeconds-a.range.startSeconds;}return wanted;
}
function equalObservation(o,wanted,file,guid=null){
  observation(o,{expectedProjectFile:file,compItemId:wanted.compItemId});const s=clone(o.snapshot);s.projectFile=wanted.projectFile;s.revision=wanted.revision;
  if(stableStringify(s)!==stableStringify(wanted)||guid!==null&&guid!==o.guid)fail("ame_source_preservation_mismatch");return o;
}
function createExecutor(deps){
  const stateDir=local(deps.stateDir),outputDir=local(deps.outputDir),caps=new WeakMap(),proofs=new Map(),unresolved=new Set();let busy=false,current=null,trustedProbe=null,hashRuntime=null,runtimeRevoked=false;
  function runtime(){if(runtimeRevoked)fail("ame_source_hash_runtime_changed");try{if(!hashRuntime)hashRuntime=hashing.captureRuntime(fileRecord);hashing.assertRuntime(hashRuntime,unchanged);return hashRuntime;}catch(error){runtimeRevoked=true;trustedProbe=null;throw error;}}
  function assertHashRuntime(r,full=false){try{if(runtime().sha25664!==r?.sha25664)fail("ame_source_hash_runtime_changed");hashing.assertRuntime(r,unchanged,full);}catch(error){runtimeRevoked=true;trustedProbe=null;throw error;}}
  const intentFile=id=>path.join(stateDir,id+".attempt.json"),stateFile=id=>path.join(stateDir,id+".state.json"),receiptFile=id=>path.join(stateDir,id+".receipt.json");
  function write(file,value,exclusive=false){makeDirectory(path.dirname(file));const tmp=exclusive?file:file+"."+crypto.randomUUID()+".tmp",fd=fs.openSync(tmp,"wx",0o600);try{fs.writeFileSync(fd,JSON.stringify({schema:SCHEMA,sha25664:hash(value),value}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(!exclusive)fs.renameSync(tmp,file);}
  function read(file){if(!fs.existsSync(file))return null;const pin=fileRecord(file);if(pin.bytes>8*1024*1024)fail("ame_source_receipt_bound");const e=JSON.parse(fs.readFileSync(file,"utf8"));unchanged(pin);if(e.schema!==SCHEMA||e.sha25664!==hash(e.value))fail("ame_source_private_record_changed");return e.value;}
  // One startup scan restores UNKNOWN holds. This owner is the sole journal
  // writer; ordinary source/native reads do not rescan all earlier jobs.
  if(fs.existsSync(stateDir)){directories(stateDir);for(const v of fs.readdirSync(stateDir).filter(v=>/^[a-f0-9-]{36}\.attempt\.json$/.test(v)))if(!["source_ready","failed_before_mutation"].includes(read(stateFile(v.slice(0,36)))?.phase))unresolved.add(v.slice(0,36));}
  function held(){return unresolved.size>0;}
  function phase(a,value){if(["source_ready","failed_before_mutation"].includes(value.phase))unresolved.delete(a.args.intentId);else unresolved.add(a.args.intentId);write(stateFile(a.args.intentId),{runId:a.runId,intentId:a.args.intentId,...value,replayAllowed:false});deps.persist?.({intentId:a.args.intentId,runId:a.runId,...value,replayAllowed:false});}
  async function actor(){
    const v=await deps.readActor(),s=v?.state,t=v?.target;
    if(!s||s.nativeControlIdle!==true||s.activeAction!==null||s.recoveryTransport||s.actionStorage!=="ready"||!s.bridgeConnection?.panelConnectionId||!s.panelInstanceId||!Number.isSafeInteger(s.panelLifecycleEpoch)||s.panelLifecycleEpoch<1||!Number.isSafeInteger(Number(s.panelGeneration))||Number(s.panelGeneration)<1||
      !t||[t.url,t.webSocketDebuggerUrl].some(value=>typeof value!=="string"||!value||value!==value.trim()||value.length>8192||/[\x00-\x1f]/.test(value)))fail("ame_source_actor_not_idle");
    // maintenanceTarget returns exactCdpTarget's URL/WS pair, not a CDP page id.
    // Bind its exact trusted tuple privately; tool arguments cannot supply it.
    return {targetSha25664:hash({url:t.url,webSocketDebuggerUrl:t.webSocketDebuggerUrl}),panelConnectionId:s.bridgeConnection.panelConnectionId,panelGeneration:String(s.panelGeneration),panelInstanceId:s.panelInstanceId,panelLifecycleEpoch:s.panelLifecycleEpoch};
  }
  async function invoke(body,mutation=false,a=null,label="read"){
    if(current)fail("ame_source_concurrent_native_refused");const scope={body,script:deps.wrap(body),mutation,attempt:a,label,prepared:false,used:false,id:null};current=scope;
    try{const r=await deps.native(body,scope,mutation);return r?.result??r;}finally{current=null;}
  }
  function validProbe(p,source,r){if(!p||p.runtimeSha25664!==r.sha25664||p.schema!=="ae-agent-ame-job-source-hash-probe.v1"||p.sha25664!==source.sha25664||p.bytes!==source.bytes||p.bytes>hashing.MAX_BYTES||!Number.isFinite(p.elapsedMs)||p.elapsedMs<0||p.elapsedMs>hashing.PROBE_MS||!Number.isFinite(p.nativeElapsedMs)||p.nativeElapsedMs<0||p.nativeElapsedMs>hashing.PROBE_MS||!Number.isFinite(Date.parse(p.observedAt)))fail("ame_source_trusted_hash_probe_required");return p;}
  async function observedWithProbe(a,source,beforeActor){
    if(source.bytes>hashing.MAX_BYTES)fail("ame_source_hash_byte_bound");
    const r=runtime(),cache=trustedProbe&&trustedProbe.hashRuntime.sha25664===r.sha25664&&Date.now()-trustedProbe.at<PROBE_TTL_MS&&stableStringify(trustedProbe.source)===stableStringify(source)&&stableStringify(trustedProbe.actor)===stableStringify(beforeActor)?trustedProbe:null;
    if(cache){const before=observation(await invoke(native.observeScript(a)),a);assertHashRuntime(r);return {before,probe:{...validProbe(cache.probe,source,r),cacheHit:true},probeAt:cache.at,hashRuntime:r};}
    const started=Date.now(),hashRequest=hashing.buildRequest(r,source.path,started+hashing.PROBE_MS),read=await invoke(native.probeScript({args:a,hashRequest})),p=read?.hashProbe;assertHashRuntime(r);
    if(!hashing.sameFile(p,source)||p.requestSha25664!==hashRequest.requestSha25664||p.nonce!==hashRequest.nonce||p.runtimeSha25664!==r.sha25664)fail("ame_source_hash_probe_file_changed");
    const probe={schema:"ae-agent-ame-job-source-hash-probe.v1",runtimeSha25664:r.sha25664,sha25664:p.sha25664,bytes:p.bytes,elapsedMs:Math.max(p.elapsedMs,Date.now()-started),nativeElapsedMs:p.elapsedMs,observedAt:new Date().toISOString(),budgetMs:hashing.PROBE_MS,maxSupportedBytes:hashing.MAX_BYTES,cacheHit:false};
    return {before:observation(read.observed,a),probe:validProbe(probe,source,r),probeAt:Date.now(),hashRuntime:r};
  }
  function rememberProbe(source,actor,read){assertHashRuntime(read.hashRuntime);trustedProbe={source:clone(source),actor:clone(actor),probe:clone(read.probe),at:read.probeAt,hashRuntime:clone(read.hashRuntime)};}
  function prepareNative(scope,script,body){if(!scope)return;if(scope!==current||scope.prepared||scope.used||!body.endsWith(scope.body)||script!==deps.wrap(body))fail("ame_source_fixed_program_required");scope.prepared=true;scope.script=script;}
  function assertNative(scope,script){if(current&&scope===current&&!scope.used&&scope.script===script){scope.used=true;return;}if(!busy&&!held())return;fail("ame_source_unknown_native_guard");}
  function queued(scope,id){if(!scope||scope!==current)return;if(!scope.prepared||!scope.used||scope.id)fail("ame_source_fixed_program_required");scope.id=id;if(scope.mutation){write(intentFile(scope.attempt.args.intentId)+".command",{runId:scope.attempt.runId,commandId:id,wireScriptSha25664:crypto.createHash("sha256").update(scope.script).digest("hex")},true);phase(scope.attempt,{phase:"native_submitted",commandId:id});}}
  function assertContext(row,a){const c=row.context,r=c.record;if(row.fingerprint!==stableStringify({args:c.args,checkpoint:c.checkpoint,payloadHash:r.payloadHash})||r.payloadHash!==sha256Payload(r.payload)||stableStringify(validateInput(TOOL,c.args))!==stableStringify(a))fail("ame_source_runner_changed");deps.assertRunner(c);save.verifyDryRunReceipt(r,1,c.contractVersion);}
  function authorize(context){const a=validateInput(TOOL,context.args),r=context.record,steps=r?.payload?.plan?.steps;
    if(context.stepCount!==1||steps?.length!==1||steps[0].tool!==TOOL||stableStringify(validateInput(TOOL,steps[0].args))!==stableStringify(a)||!UUID.test(context.runId||"")||!context.checkpoint||!same(context.checkpoint.sourceFile,a.expectedProjectFile))fail("ame_source_exact_runner_required");
    const row={context,fingerprint:stableStringify({args:context.args,checkpoint:context.checkpoint,payloadHash:r.payloadHash}),used:false};assertContext(row,a);const cap=Object.freeze({});caps.set(cap,row);return cap;
  }
  async function inspect(raw){const a=validateInput(INSPECT,raw);if(busy||held())fail("ame_source_unknown_reconcile_required");const source=fileRecord(a.expectedProjectFile),beforeActor=await actor(),observedRead=await observedWithProbe(a,source,beforeActor),observed=observedRead.before;unchanged(source);if(stableStringify(beforeActor)!==stableStringify(await actor()))fail("ame_source_actor_changed");rememberProbe(source,beforeActor,observedRead);return {schema:SCHEMA,ok:true,source,observed,expectedStateHash:hash(observed.snapshot),expectedRevision:observed.snapshot.revision,hashProbe:observedRead.probe,executionAuthority:false,scope:"target_comp_graph_flags_audio_timing_work_area",mediaVerified:false};}
  async function preflight(raw,row=null){const a=validateInput(TOOL,raw);if(busy||held())fail("ame_source_unknown_reconcile_required");if(read(intentFile(a.intentId)))fail("ame_source_intent_consumed_no_replay");
    const source=fileRecord(a.expectedProjectFile);if(source.sha25664!==a.expectedSourceSha25664)fail("ame_source_source_hash_changed");
    const beforeActor=await actor(),observedRead=await observedWithProbe(a,source,beforeActor),before=observedRead.before;if(row)assertContext(row,a);unchanged(source);
    if(before.snapshot.revision!==a.expectedRevision||hash(before.snapshot)!==a.expectedStateHash)fail("ame_source_baseline_changed");
    const compared=await invoke(native.compareScript(a,before));if(row)assertContext(row,a);unchanged(source);
    if(compared?.difference!==null)fail("ame_source_native_baseline_changed");const wanted=expectedSnapshot(before,a);
    if(stableStringify(beforeActor)!==stableStringify(await actor()))fail("ame_source_actor_changed");if(row)assertContext(row,a);
    rememberProbe(source,beforeActor,observedRead);assertHashRuntime(observedRead.hashRuntime,true);return {args:a,source,before,wanted,actor:beforeActor,hashProbe:observedRead.probe,hashRuntime:observedRead.hashRuntime};
  }
  function validateAttempt(a){
    const args=validateInput(TOOL,a?.args),{binding,...facts}=a||{};
    if(a.schema!==SCHEMA||!UUID.test(a.nonce||"")||!UUID.test(a.runId||"")||binding!==hash(facts)||!same(a.source.path,args.expectedProjectFile)||a.source.sha25664!==args.expectedSourceSha25664||hash(a.before.snapshot)!==args.expectedStateHash||a.before.snapshot.revision!==args.expectedRevision||
      stableStringify(a.wanted)!==stableStringify(expectedSnapshot(a.before,args))||!same(a.outputPath,path.join(outputDir,a.nonce+".aep"))||a.checkpoint.sha25664!==a.source.sha25664||a.checkpoint.bytes!==a.source.bytes||same(a.checkpoint.path,a.source.path)||!same(a.reservation.path,a.outputPath)||a.minimumRemainingMs!==2*a.hashProbe?.elapsedMs+30000||a.probeExpiresAt!==Date.parse(a.hashProbe?.observedAt)+PROBE_TTL_MS||a.maxHashBytes!==hashing.MAX_BYTES)fail("ame_source_attempt_changed");
    assertHashRuntime(a.hashRuntime);validProbe(a.hashProbe,a.source,a.hashRuntime);hashing.assertRequest(a.hashRequest,a.hashRuntime,a.outputPath,a.deadline);
    unchanged(a.source);unchanged(a.checkpoint);return a;
  }
  function program(a){return {schema:SCHEMA,nonce:a.nonce,binding:a.binding,runId:a.runId,args:a.args,before:a.before,wanted:a.wanted,source:a.source,checkpoint:a.checkpoint,reservation:a.reservation,deadline:a.deadline,probeExpiresAt:a.probeExpiresAt,minimumRemainingMs:a.minimumRemainingMs,maxHashBytes:a.maxHashBytes,hashRequest:a.hashRequest};}
  function slotValid(slot,a){if(!slot||slot.schema!==SCHEMA||slot.nonce!==a.nonce||slot.binding!==a.binding||slot.runId!==a.runId)fail("ame_source_native_unknown_no_replay");if(slot.state==="unknown"&&slot.ok===false&&typeof slot.error==="string"&&slot.error)fail(slot.error.slice(0,2000));if(slot.state!=="terminal"||slot.ok!==true||slot.phase!=="restored")fail("ame_source_native_unknown_no_replay");equalObservation(slot.saved,a.wanted,a.outputPath);equalObservation(slot.restored,a.before.snapshot,a.source.path,a.before.guid);if(stableStringify(slot.restored.range)!==stableStringify(a.before.range))fail("ame_source_restore_range_changed");}
  async function settle(a,slot,existing=null,row=null){
    validateAttempt(a);slotValid(slot,a);const beforeActor=await actor();if(row&&stableStringify(beforeActor)!==stableStringify(a.actor))fail("ame_source_actor_changed");if(row)assertContext(row,a.args);
    const observed=equalObservation(await invoke(native.observeScript(a.args)),a.before.snapshot,a.source.path,a.before.guid);if(row)assertContext(row,a.args);
    unchanged(a.source);unchanged(a.checkpoint);if(stableStringify(observed.range)!==stableStringify(a.before.range))fail("ame_source_restore_range_changed");
    assertHashRuntime(a.hashRuntime);const saved=fileRecord(a.outputPath);if(!hashing.sameFile(slot.savedFile,saved)||slot.savedFile.requestSha25664!==a.hashRequest.requestSha25664||slot.savedFile.nonce!==a.hashRequest.nonce||slot.savedFile.runtimeSha25664!==a.hashRuntime.sha25664)fail("ame_source_saved_file_readback_changed");if(saved.device===a.source.device&&saved.inode===a.source.inode||saved.device===a.checkpoint.device&&saved.inode===a.checkpoint.inode)fail("ame_source_snapshot_alias");
    if(stableStringify(beforeActor)!==stableStringify(await actor()))fail("ame_source_actor_changed");if(row)assertContext(row,a.args);unchanged(saved);unchanged(a.source);unchanged(a.checkpoint);
    const command=read(intentFile(a.args.intentId)+".command");if(!command||command.runId!==a.runId||!UUID.test(command.commandId||""))fail("ame_source_command_binding_required");
    const receipt={schema:SCHEMA,phase:"source_ready",intentId:a.args.intentId,runId:a.runId,commandId:command.commandId,attemptSha25664:hash(a),sourceStateHash:a.args.expectedStateHash,source:a.source,checkpoint:a.checkpoint,snapshot:{...saved,native:slot.saved,nativeFile:slot.savedFile},restored:observed,native:slot,actor:a.actor,range:slot.saved.range,replayAllowed:false,mediaVerified:false};
    if(existing){if(existing.attemptSha25664!==hash(a)||existing.commandId!==command.commandId||stableStringify(existing.snapshot)!==stableStringify(receipt.snapshot)||stableStringify(existing.native)!==stableStringify(slot))fail("ame_source_receipt_changed");}
    else write(receiptFile(a.args.intentId),receipt,true);
    proofs.set(path.resolve(saved.path).toLowerCase(),{attempt:a,receipt:existing||receipt});phase(a,{phase:"source_ready",commandId:command.commandId,receiptSha25664:hash(existing||receipt)});return result(existing||receipt,!!existing);
  }
  function result(r,adopted=false){const comp=r.restored.snapshot.graph.find(v=>v.id===r.restored.snapshot.compItemId);return {ok:true,schema:SCHEMA,phase:"source_ready",intentId:r.intentId,selector:{runId:r.runId,commandId:r.commandId},receiptSha25664:hash(r),source:r.source,checkpoint:r.checkpoint,snapshot:r.snapshot,range:r.range,restored:{path:r.source.path,nativeProjectFile:r.restored.snapshot.projectFile,dirty:false,revision:r.restored.snapshot.revision,stateHash:r.sourceStateHash,range:r.restored.range,workArea:{startSeconds:comp.workAreaStart,durationSeconds:comp.workAreaDuration}},adopted,replayAllowed:false,mediaVerified:false};}
  function unknown(a,error){return {ok:false,schema:SCHEMA,phase:"unknown",intentId:a?.args?.intentId||null,runId:a?.runId||null,commandId:a?read(intentFile(a.args.intentId)+".command")?.commandId||null:null,code:error?.code||error?.message||"ame_source_unknown",replayAllowed:false,automaticRetryAllowed:false,mediaVerified:false};}
  async function execute(raw,cap){
    const row=caps.get(cap),a=validateInput(TOOL,raw);if(!row||row.used)fail("ame_source_runner_required");assertContext(row,a);const prepared=await preflight(a,row);assertContext(row,a);if(busy||held())fail("ame_source_unknown_reconcile_required");
    const checkpoint=fileRecord(row.context.checkpoint.checkpointFile);if(checkpoint.sha25664!==prepared.source.sha25664||checkpoint.bytes!==prepared.source.bytes||same(checkpoint.path,prepared.source.path))fail("ame_source_checkpoint_changed");
    row.used=true;busy=true;let attempt=null,consumedAttempt=null;
    try{
      makeDirectory(outputDir);assertContext(row,a);const nonce=crypto.randomUUID(),outputPath=path.join(outputDir,nonce+".aep");
      // Durable consumption exists before reservation or native delivery. Collisions
      // and UNKNOWN retain the intent and artifact; neither permits a second SaveAs.
      const preparedAttempt={schema:SCHEMA,args:a,runId:row.context.runId,nonce,outputPath,phase:"prepared",replayAllowed:false};write(intentFile(a.intentId),preparedAttempt,true);consumedAttempt=preparedAttempt;phase(preparedAttempt,{phase:"prepared"});
      const fd=fs.openSync(outputPath,"wx",0o600);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const reservation=fileRecord(outputPath,true);
      const facts={schema:SCHEMA,args:a,runId:row.context.runId,nonce,outputPath,source:prepared.source,checkpoint,before:prepared.before,wanted:prepared.wanted,actor:prepared.actor,reservation,hashProbe:prepared.hashProbe,hashRuntime:prepared.hashRuntime,probeExpiresAt:Date.parse(prepared.hashProbe.observedAt)+PROBE_TTL_MS,minimumRemainingMs:2*prepared.hashProbe.elapsedMs+30000,maxHashBytes:hashing.MAX_BYTES,deadline:Math.min(Date.parse(row.context.record.proposalExpiresAt),Date.now()+120000)};
      facts.hashRequest=hashing.buildRequest(facts.hashRuntime,outputPath,facts.deadline);
      if(!Number.isFinite(facts.deadline)||facts.deadline-Date.now()<facts.minimumRemainingMs)fail("ame_source_hash_admission_budget");attempt={...facts,binding:hash(facts)};write(intentFile(a.intentId)+".bound",attempt,true);phase(attempt,{phase:"reserved"});
      unchanged(prepared.source);unchanged(checkpoint);unchanged(reservation);if(stableStringify(prepared.actor)!==stableStringify(await actor()))fail("ame_source_actor_changed");assertContext(row,a);
      assertHashRuntime(facts.hashRuntime,true);
      if(Date.now()>=facts.probeExpiresAt)fail("ame_source_hash_probe_stale");
      const slot=await invoke(native.createScript(program(attempt)),true,attempt,"create");phase(attempt,{phase:slot?.phase||"unknown"});assertContext(row,a);
      return await settle(attempt,slot,null,row);
    }catch(error){const retained=attempt||consumedAttempt;if(retained)phase(retained,{phase:read(intentFile(a.intentId)+".command")?"unknown":"failed_before_mutation",code:error.code||error.message});return unknown(retained,error);}finally{busy=false;}
  }
  async function reconcile(raw){
    const selector=validateInput(RECONCILE,raw);if(busy)fail("ame_source_busy");busy=true;let a=null;
    try{
      const record=deps.loadRecord(selector.runId),steps=record?.run?.steps,step=steps?.[0],args=validateInput(TOOL,record?.plan?.steps?.[0]?.args),command=read(intentFile(args.intentId)+".command");
      const mutations=step?.commands?.filter(c=>c.role==="mutation")||[];
      if(record.runId!==selector.runId||record.run?.dryRun!==false||steps?.length!==1||record.plan?.steps?.length!==1||step.tool!==TOOL||record.plan.steps[0].tool!==TOOL||stableStringify(validateInput(TOOL,step.args))!==stableStringify(args)||command?.runId!==selector.runId||command.commandId!==selector.commandId||mutations.length!==1||mutations[0].id!==selector.commandId)fail("ame_source_original_command_required");
      a=validateAttempt(read(intentFile(args.intentId)+".bound"));if(a.runId!==selector.runId)fail("ame_source_original_command_required");
      const existing=read(receiptFile(args.intentId));
      const slot=await invoke(native.lookupScript(a));slotValid(slot,a);
      if(existing&&hash(existing.native)!==hash(slot))fail("ame_source_retained_slot_changed");return await settle(a,slot,existing);
    }catch(error){return unknown(a,error);}finally{busy=false;}
  }
  function ownsSource(file){if(typeof file!=="string")return false;const rel=path.relative(outputDir,path.resolve(file));return rel===""||rel!==".."&&!rel.startsWith(".."+path.sep)&&!path.isAbsolute(rel);}
  function assertSavedSource(selector){
    const p=proofs.get(path.resolve(selector?.sourcePath||"").toLowerCase());if(!p||!ownsSource(selector.sourcePath)||selector.sourceSha25664!==p.receipt.snapshot.sha25664||selector.sourceGuid!==p.receipt.snapshot.native.guid||stableStringify(selector.range)!==stableStringify(p.receipt.range))fail("ame_source_private_saved_source_required");
    validateAttempt(p.attempt);const {native:unused,nativeFile:unusedFile,...pin}=p.receipt.snapshot;unchanged(pin);
    if(typeof selector.argsHash!=="string"||!SHA.test(selector.argsHash)||!path.isAbsolute(selector.outputPath||"")||selector.operation!=="enqueue")fail("ame_source_enqueue_intent_required");
    const binding={schema:SCHEMA,intentId:p.receipt.intentId,receiptSha25664:hash(p.receipt),argsHash:selector.argsHash,sourcePath:selector.sourcePath,sourceSha25664:selector.sourceSha25664,sourceGuid:selector.sourceGuid,outputPath:selector.outputPath,range:selector.range};
    const file=intentFile(p.receipt.intentId)+".enqueue-binding",prior=read(file);if(prior){if(stableStringify(prior)!==stableStringify(binding))fail("ame_source_already_bound_to_other_enqueue");}else write(file,binding,true);return true;
  }
  return {authorize,preflight,execute,inspect,reconcile,ownsSource,assertSavedSource,prepareNative,assertNative,queued,status:()=>({busy,guardHeld:held(),replayAllowed:false})};
}
function verifyResult(r,raw){
  const a=validateInput(TOOL,raw),s=r?.snapshot?.native?.snapshot;
  if(r?.ok!==true||r.schema!==SCHEMA||r.phase!=="source_ready"||r.intentId!==a.intentId||r.source?.sha25664!==a.expectedSourceSha25664||!same(r.source?.path,a.expectedProjectFile)||r.checkpoint?.sha25664!==a.expectedSourceSha25664||r.checkpoint.bytes!==r.source.bytes||same(r.checkpoint.path,r.source.path)||
    r.restored?.dirty!==false||!same(r.restored?.path,a.expectedProjectFile)||!same(r.restored?.nativeProjectFile,a.expectedProjectFile)||r.restored.stateHash!==a.expectedStateHash||!Number.isSafeInteger(r.restored.revision)||r.restored.revision<0||!SHA.test(r.receiptSha25664||"")||!SHA.test(r.snapshot?.sha25664||"")||r.snapshot?.nativeFile?.sha25664!==r.snapshot?.sha25664||r.snapshot.nativeFile.bytes!==r.snapshot.bytes||!same(r.snapshot.nativeFile.path,r.snapshot.path)||!(r.snapshot.bytes>0)||!GUID.test(r.snapshot?.native?.guid||"")||r.snapshot?.native?.dirty!==false||!same(s?.projectFile,r.snapshot?.path)||s?.compItemId!==a.compItemId||!Array.isArray(s.graph)||!UUID.test(r.selector?.runId||"")||!UUID.test(r.selector?.commandId||"")||r.replayAllowed!==false||same(r.snapshot.path,r.source.path)||same(r.snapshot.path,r.checkpoint.path))fail("ame_source_result_unverified");
  const baseline=clone(s),roots=baseline.graph.filter(v=>v.id===a.compItemId);if(roots.length!==1)fail("ame_source_result_comp_changed");const root=roots[0];range(r.range,root.duration);range(r.restored.range,root.duration);
  if(stableStringify(r.range)!==stableStringify(r.snapshot.native.range)||r.range.startSeconds!==root.workAreaStart||r.range.endSeconds!==root.workAreaStart+root.workAreaDuration||stableStringify(a.range||r.restored.range)!==stableStringify(r.range))fail("ame_source_result_range_changed");
  for(const p of a.visibilityPatch){const rows=root.layers.filter(v=>v.id===p.layerId);if(rows.length!==1||rows[0].enabled!==p.enabled)fail("ame_source_result_patch_changed");rows[0].enabled=p.expectedEnabled;}
  // Reconstruct the original captured graph. The caller's expectation is checked
  // against actual saved flags/audio/timing, not a copied receipt hash claim.
  if(!Number.isFinite(r.restored.workArea?.startSeconds)||!Number.isFinite(r.restored.workArea?.durationSeconds)||r.restored.workArea.startSeconds!==r.restored.range.startSeconds||r.restored.workArea.startSeconds+r.restored.workArea.durationSeconds!==r.restored.range.endSeconds)fail("ame_source_result_restored_work_area_changed");
  root.workAreaStart=r.restored.workArea.startSeconds;root.workAreaDuration=r.restored.workArea.durationSeconds;
  baseline.projectFile=r.restored.nativeProjectFile;baseline.revision=a.expectedRevision;
  if(hash(baseline)!==a.expectedStateHash)fail("ame_source_result_preservation_changed");
  return {ok:true,scope:"one_saved_native_source_and_independently_restored_source",mediaVerified:false};
}
function toolDefinitions(){
  const common={expectedProjectFile:{type:"string"},compItemId:{type:"integer",minimum:1}},rangeSchema={type:"object",additionalProperties:false,required:["startSeconds","endSeconds"],properties:{startSeconds:{type:"number",minimum:0},endSeconds:{type:"number"}}};
  return [{name:INSPECT,description:`FROZEN / EXPERIMENTAL / UNFINISHED: unavailable for new source work pending separate user scope. Inspect one explicit comp in the current clean saved AEP. No AME read or mutation.`,annotations:{readOnlyHint:true},inputSchema:{type:"object",additionalProperties:false,required:Object.keys(common),properties:common}},
    {name:TOOL,description:"FROZEN / EXPERIMENTAL / UNFINISHED: unavailable for new source creation pending separate user scope. Existing records remain available to exact read-only reconciliation; UNKNOWN never permits replay.",inputSchema:{type:"object",additionalProperties:false,required:[...Object.keys(common),"intentId","expectedSourceSha25664","expectedRevision","expectedStateHash"],properties:{...common,intentId:{type:"string",pattern:UUID.source},expectedSourceSha25664:{type:"string",pattern:SHA.source},expectedRevision:{type:"integer",minimum:0},expectedStateHash:{type:"string",pattern:SHA.source},visibilityPatch:{type:"array",maxItems:1000,items:{type:"object",additionalProperties:false,required:["layerId","expectedEnabled","enabled"],properties:{layerId:{type:"integer",minimum:1},expectedEnabled:{type:"boolean"},enabled:{type:"boolean"}}}},range:rangeSchema}}},
    {name:RECONCILE,description:"Read-only reconciliation/adoption of ONE original source command from durable receipt and retained native keyed slot. Exact original runId/commandId only; fresh restored-source/file/actor checks. Never SaveAs/Open/replay and never reset its downstream enqueue binding.",annotations:{readOnlyHint:true},inputSchema:{type:"object",additionalProperties:false,required:["runId","commandId"],properties:{runId:{type:"string",pattern:UUID.source},commandId:{type:"string",pattern:UUID.source}}}}];
}
module.exports={TOOL,INSPECT,RECONCILE,SCHEMA,validateInput,fileRecord,hash,createExecutor,verifyResult,toolDefinitions};

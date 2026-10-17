"use strict";
// A separate observation of existing files. Never repairs the original export.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const records=require("./plan-run-records"),exportsTool=require("./title-export-snapshots"),variants=require("./native-render-variant");
const {stableStringify,sha256Payload}=require("./m100-protocol"),save=require("./project-save");
const TOOL="verify_title_export_snapshots",LOOKUP="reconcile_title_export_verification",SCHEMA="ae-agent-title-export-verification.v1",SLOT="__aeAgentTitleExportVerificationV1";
const hash=v=>crypto.createHash("sha256").update(typeof v==="string"?v:stableStringify(v)).digest("hex");
const same=(a,b)=>String(a).replace(/\\/g,"/").toLowerCase()===String(b).replace(/\\/g,"/").toLowerCase();
function fail(code){throw Object.assign(Error(code),{code});}
function validateInput(raw){if(!raw||Object.keys(raw).length!==2||Object.keys(raw).some(k=>!["runId","commandId"].includes(k))||typeof raw.runId!=="string"||typeof raw.commandId!=="string"||!records.ID.test(raw.runId)||!records.ID.test(raw.commandId))fail("title_verification_exact_selector_required");return {runId:raw.runId,commandId:raw.commandId};}
function range(v,duration){if(!v||!Number.isFinite(v.startSeconds)||!Number.isFinite(v.endSeconds)||v.startSeconds<0||v.endSeconds<=v.startSeconds||v.endSeconds>duration+1e-7)fail("title_verification_work_area_invalid");return v;}
function unchanged(pin){if(stableStringify(exportsTool.fileRecord(pin.path))!==stableStringify(pin))fail("title_verification_file_changed");}
function original(deps,raw){
  const selector=validateInput(raw),record=deps.loadRecord(selector.runId),step=record.run?.steps?.[0],a=exportsTool.validateInput(record.plan?.steps?.[0]?.args);
  const mutations=step?.commands?.filter(c=>c.role==="mutation")||[],reads=step?.commands?.filter(c=>c.role==="readback"&&c.state==="completed"&&c.ok===true&&c.result?.snapshot)||[];
  if(record.runId!==selector.runId||record.run?.dryRun!==false||record.run?.ok!==false||record.plan.steps.length!==1||record.run.steps.length!==1||step.tool!==exportsTool.TOOL||record.plan.steps[0].tool!==exportsTool.TOOL||
    stableStringify(exportsTool.validateInput(step.args))!==stableStringify(a)||mutations.length!==1||mutations[0].id!==selector.commandId||mutations[0].state!=="timed_out_after_submit"||mutations[0].timedOutFrom!=="submitted"||reads.length!==1||
    step.exportSnapshots?.phase!=="native_submitted"||step.exportSnapshots.automaticRetryAllowed!==false||variants.digest(reads[0].result.snapshot)!==a.expectedStateHash||reads[0].result.snapshot.revision!==a.expectedRevision)fail("title_verification_original_record_invalid");
  const source=step.exportSnapshots.source,checkpoint=step.exportSnapshots.checkpoint,targets=a.variants.map(v=>path.join(path.dirname(a.expectedProjectFile),v.snapshotFileName));
  if(!source||!checkpoint||!same(source.path,a.expectedProjectFile)||source.sha25664!==a.expectedSourceSha25664||checkpoint.sha25664!==source.sha25664||checkpoint.bytes!==source.bytes||same(checkpoint.path,source.path)||
    stableStringify(targets)!==stableStringify(step.exportSnapshots.targets)||new Set(targets.map(v=>v.toLowerCase())).size!==2)fail("title_verification_original_pins_invalid");
  unchanged(source);unchanged(checkpoint);
  return {selector,recordHash:records.digest(JSON.stringify(record)),a,baseline:reads[0].result.snapshot,source,originalCheckpoint:checkpoint,targets};
}
const literal=v=>JSON.stringify(v).replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
function observeScript(a){return `var nativeSnapshot=${variants.nativeSnapshot.toString()};var titleObserve=${nativeObserve.toString()};return titleObserve(${literal(a)});`;}
function nativeObserve(a){
  var s=nativeSnapshot({expectedProjectFile:a.expectedProjectFile,rootCompItemId:a.compItemId,variantCompItemId:a.compItemId,controlledLayerIds:[a.variants[0].layerId,a.variants[1].layerId]}),target=null,i;
  for(i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===a.compItemId)target=app.project.item(i);
  if(!target)throw Error("title_verification_comp_missing");
  return {snapshot:s,dirty:app.project.dirty,guid:String(target.dynamicLinkGUID||""),range:{startSeconds:target.workAreaStart,endSeconds:target.workAreaStart+target.workAreaDuration}};
}
// ES3, synchronous, exactly three opens on success. Errors never trigger restore.
function nativeVerify(p){
  var slots=$.global.__aeAgentTitleExportVerificationV1;if(!slots){slots={};$.global.__aeAgentTitleExportVerificationV1=slots;}
  if(slots[p.nonce])return slots[p.nonce];
  var slot={schema:p.schema,nonce:p.nonce,binding:p.binding,state:"started",phase:"before_open_1",observations:[],error:null};slots[p.nonce]=slot;
  function equal(a,b){return nativeSnapshotDifference(a,b)===null;}
  function bad(c){throw Error(c);}
  function pin(f){var file=new File(f.path);if(!file.exists||file.alias||!equal(file.length,f.bytes)||!file.modified||!equal(Math.floor(file.modified.getTime()/1000),Math.floor(f.mtimeMs/1000)))bad("title_verification_native_file_changed");}
  function pins(){for(var i=0;i<p.pins.length;i++)pin(p.pins[i]);}
  function check(file,index){
    var a={expectedProjectFile:file,compItemId:p.args.compItemId,variants:p.args.variants},o=nativeObserve(a),s=o.snapshot,k,n,j,row;
    if(!equal(o.dirty,false)||!equal(s.projectFile,file))bad("title_verification_current_clean_file_required");
    for(k=0;k<s.controlled.length;k++){row=s.controlled[k];if(!equal(row.enabled,index<0?p.baseline.controlled[k].enabled:equal(row.id,p.args.variants[index].layerId)))bad("title_verification_flags_changed");row.enabled=p.baseline.controlled[k].enabled;}
    for(k=0;k<s.graph.length;k++)if(equal(s.graph[k].id,p.args.compItemId))for(n=0;n<s.graph[k].layers.length;n++){row=s.graph[k].layers[n];for(j=0;j<p.baseline.controlled.length;j++)if(equal(row.id,p.baseline.controlled[j].id))row.enabled=p.baseline.controlled[j].enabled;}
    s.projectFile=p.baseline.projectFile;s.revision=p.baseline.revision;if(!equal(s,p.baseline))bad("title_verification_graph_changed");
    if(!equal(o.range,p.sourceObservation.range)||!equal(o.guid,p.sourceObservation.guid))bad("title_verification_work_area_or_guid_changed");
    // Return the actual observation, not the comparison's normalized copy.
    return nativeObserve(a);
  }
  try{
    var current=p.source.path,currentIndex=-1,i;check(current,currentIndex);pins();
    for(i=0;i<3;i++){
      slot.phase="before_open_"+(i+1);if(new Date().getTime()>=p.deadline)bad("title_verification_deadline");pins();check(current,currentIndex);
      slot.phase="open_"+(i+1)+"_submitted";app.open(new File(i<2?p.targets[i]:p.source.path));
      current=i<2?p.targets[i]:p.source.path;currentIndex=i<2?i:-1;
      var o=check(current,currentIndex);pins();if(i<2)slot.observations.push(o);else slot.restored=o;
      slot.phase="open_"+(i+1)+"_verified";
    }
    slot.ok=true;slot.phase="restored";slot.state="terminal";return slot;
  }catch(e){slot.ok=false;slot.error=String(e.message||e);slot.state="terminal";return slot;}
}
function program(p){return `var nativeSnapshot=${variants.nativeSnapshot.toString()};var nativeSnapshotDifference=${exportsTool.nativeSnapshotDifference.toString()};var nativeObserve=${nativeObserve.toString()};var nativeVerify=${nativeVerify.toString()};return nativeVerify(${literal(p)});`;}
function lookupScript(attempt){return `var slots=$.global.${SLOT};return slots&&Object.prototype.hasOwnProperty.call(slots,${JSON.stringify(attempt.nonce)})?slots[${JSON.stringify(attempt.nonce)}]:null;`;}
function normalizedObservation(o,base,file,index){
  if(!o||o.dirty!==false||!same(o.snapshot?.projectFile,file)||!Number.isSafeInteger(o.snapshot?.revision)||!/^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/.test(o.guid||""))fail("title_verification_observation_invalid");
  range(o.range,o.snapshot.duration);const snapshot=JSON.parse(JSON.stringify(o.snapshot)),wanted=JSON.parse(JSON.stringify(base.baseline));
  if(index>=0){for(const c of wanted.controlled)c.enabled=c.id===base.a.variants[index].layerId;for(const c of wanted.graph)if(c.id===base.a.compItemId)for(const l of c.layers){const row=wanted.controlled.find(v=>v.id===l.id);if(row)l.enabled=row.enabled;}}
  snapshot.projectFile=wanted.projectFile;snapshot.revision=wanted.revision;
  if(stableStringify(snapshot)!==stableStringify(wanted))fail("title_verification_graph_or_flags_changed");return o;
}
function createExecutor(deps){
  const contexts=new WeakMap(),dir=path.join(deps.root,"evidence","title-export-verification");let busy=false,current=null;
  function key(s){return hash(stableStringify(validateInput(s)));}
  function file(s,kind){return path.join(dir,key(s)+"."+kind+".json");}
  function read(s,kind){const f=file(s,kind);if(!fs.existsSync(f))return null;records.containedFile(deps.root,f);if(fs.lstatSync(f).isSymbolicLink()||fs.statSync(f).size>4*1024*1024)fail("title_verification_evidence_invalid");const e=JSON.parse(fs.readFileSync(f,"utf8"));if(e.schema!==SCHEMA||e.sha256!==hash(e.value))fail("title_verification_evidence_invalid");return e.value;}
  function write(s,kind,value,exclusive=false){fs.mkdirSync(dir,{recursive:true});records.containedFile(deps.root,dir);const f=file(s,kind),tmp=exclusive?f:f+"."+crypto.randomUUID()+".tmp",fd=fs.openSync(tmp,"wx");try{fs.writeFileSync(fd,JSON.stringify({schema:SCHEMA,sha256:hash(value),value}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(!exclusive)fs.renameSync(tmp,f);return hash(value);}
  function state(s,value){return write(s,"state",{...(read(s,"state")||{}),...value});}
  function held(){if(!fs.existsSync(dir))return false;const names=fs.readdirSync(dir).filter(v=>/^[a-f0-9]{64}\.attempt\.json$/.test(v));if(names.length>64)fail("title_verification_attempt_budget");return names.some(n=>{const a=JSON.parse(fs.readFileSync(path.join(dir,n),"utf8"));if(a.sha256!==hash(a.value))fail("title_verification_evidence_invalid");const state=read(a.value.selector,"state");return !["verified","failed_restored"].includes(state?.phase);});}
  async function actor(){const v=await deps.readActor(),s=v?.state;if(!s||s.nativeControlIdle!==true||s.activeAction!==null||s.recoveryTransport||s.actionStorage!=="ready"||!s.bridgeConnection?.panelConnectionId||!s.panelInstanceId||!Number.isSafeInteger(s.panelLifecycleEpoch)||s.panelLifecycleEpoch<1||!Number.isSafeInteger(Number(s.panelGeneration))||Number(s.panelGeneration)<1)fail("title_verification_panel_not_idle");return {panelConnectionId:s.bridgeConnection.panelConnectionId,panelGeneration:String(s.panelGeneration),panelInstanceId:s.panelInstanceId,panelLifecycleEpoch:s.panelLifecycleEpoch};}
  async function native(body,label,mutation=false,selector=null){current={body,script:deps.wrap(body),label,selector,prepared:false,used:false,id:null};try{const response=await deps.readNative(body,current,mutation);return response?.result??response;}finally{current=null;}}
  function prepareNative(scope,script,body){if(!scope)return;if(scope!==current||scope.prepared||scope.used||!body.endsWith(scope.body)||script!==deps.wrap(body))fail("title_verification_prepared_script_changed");scope.prepared=true;scope.script=script;if(scope.selector)state(scope.selector,{phase:"native_prepared",wireScriptSha256:hash(script),replayAllowed:false});}
  function assertNative(scope,script){if(!busy&&!held())return;if(!current||scope!==current||scope.used||scope.script!==script)fail("title_verification_native_guard");scope.used=true;}
  function queued(scope,id){if(current&&scope===current){if(!scope.used||scope.id)fail("title_verification_native_guard");scope.id=id;}}
  function pins(base,attempt){if(records.digest(JSON.stringify(deps.loadRecord(base.selector.runId)))!==attempt.recordHash)fail("title_verification_original_record_changed");unchanged(base.source);unchanged(base.originalCheckpoint);for(const p of attempt.snapshots)unchanged(p);unchanged(attempt.checkpoint);}
  async function fresh(base){const o=await native(observeScript(base.a),"source_read");return normalizedObservation(o,base,base.source.path,-1);}
  function result(receipt,rehydrated=false){return {ok:true,schema:SCHEMA,phase:"verified",selector:receipt.selector,receiptSha256:hash(receipt),source:receipt.source,snapshots:receipt.snapshots,observedSourceRange:receipt.sourceObservation.range,rehydrated,savedSourceProofAdopted:true,originalOutcome:"unknown_preserved",replayAllowed:false,mediaVerified:false};}
  function validateAttempt(a,base){if(!a||a.schema!==SCHEMA||stableStringify(a.selector)!==stableStringify(base.selector)||a.recordHash!==base.recordHash||a.baselineHash!==base.a.expectedStateHash||a.binding!==hash({selector:a.selector,recordHash:a.recordHash,baselineHash:a.baselineHash,source:a.source,snapshots:a.snapshots,checkpoint:a.checkpoint,nonce:a.nonce})||a.source.sha25664!==base.source.sha25664||stableStringify(a.targets)!==stableStringify(base.targets)||a.scriptSha256!==hash(program(a.program)))fail("title_verification_attempt_changed");pins(base,a);}
  function validateSlot(slot,a,base){if(!slot||slot.schema!==SCHEMA||slot.nonce!==a.nonce||slot.binding!==a.binding||slot.state!=="terminal")fail("title_verification_slot_unknown");if(slot.ok!==true||slot.phase!=="restored"||slot.observations?.length!==2)fail("title_verification_terminal_failure");for(let i=0;i<2;i++){const o=normalizedObservation(slot.observations[i],base,a.targets[i],i);if(stableStringify(o.range)!==stableStringify(a.sourceObservation.range)||o.guid!==a.sourceObservation.guid)fail("title_verification_snapshot_range_or_guid_changed");}normalizedObservation(slot.restored,base,base.source.path,-1);}
  async function settle(base,a,existing=null,context=null){
    validateAttempt(a,base);deps.assertProtection(context);const before=await actor();if(!existing&&stableStringify(before)!==stableStringify(a.actor))fail("title_verification_actor_changed");let slot;
    if(existing){if(existing.schema!==SCHEMA||existing.attemptHash!==hash(a)||existing.recordHash!==base.recordHash||stableStringify(existing.selector)!==stableStringify(base.selector))fail("title_verification_receipt_changed");slot=existing.native;}
    else slot=await native(lookupScript(a),"lookup");
    // Slot is only evidence. Fresh independent source and file/actor checks are mandatory.
    const observed=await fresh(base);pins(base,a);if(stableStringify(before)!==stableStringify(await actor()))fail("title_verification_actor_changed");
    if(slot?.schema===SCHEMA&&slot.state==="terminal"&&slot.ok===false&&typeof slot.error==="string"&&slot.error&&/^before_open_[123]$|^open_[123]_(?:submitted|verified)$/.test(slot.phase)&&slot.nonce===a.nonce&&slot.binding===a.binding){deps.assertProtection(context);state(base.selector,{phase:"failed_restored",code:slot.error,originalOutcome:"unknown_preserved",replayAllowed:false});return {ok:false,schema:SCHEMA,code:slot.error||"title_verification_terminal_failure",guardHeld:false,replayAllowed:false};}
    validateSlot(slot,a,base);
    if(stableStringify(observed.range)!==stableStringify(a.sourceObservation.range)||observed.guid!==a.sourceObservation.guid)fail("title_verification_source_range_or_guid_changed");
    const snapshots=a.snapshots.map((pin,i)=>({...pin,native:{path:pin.path,revision:slot.observations[i].snapshot.revision,dirty:false,guid:slot.observations[i].guid,range:slot.observations[i].range,flags:slot.observations[i].snapshot.controlled.map(l=>({id:l.id,name:l.name,enabled:l.enabled}))}}));
    const receipt=existing||{schema:SCHEMA,ok:true,phase:"verified",selector:base.selector,recordHash:base.recordHash,attemptHash:hash(a),source:a.source,snapshots,sourceObservation:observed,native:slot,actor:before,verifiedAt:new Date().toISOString(),originalOutcome:"unknown_preserved",replayAllowed:false,mediaVerified:false};
    if(existing&&stableStringify(existing.snapshots)!==stableStringify(snapshots))fail("title_verification_receipt_changed");
    deps.assertProtection(context);if(!existing)write(base.selector,"receipt",receipt,true);pins(base,a);if(stableStringify(before)!==stableStringify(await actor()))fail("title_verification_actor_changed");deps.adopt(snapshots);state(base.selector,{phase:"verified",receiptSha256:hash(receipt),replayAllowed:false});return result(receipt,!!existing);
  }
  async function preflight(raw){const base=original(deps,raw);if(read(base.selector,"attempt"))return {ok:true,consumed:true,reconciliationOnly:true,source:base.source};if(busy||held())fail("title_verification_busy");busy=true;try{const before=await actor(),snapshots=base.targets.map(f=>exportsTool.fileRecord(f)),o=await fresh(base);if(stableStringify(before)!==stableStringify(await actor()))fail("title_verification_actor_changed");unchanged(base.source);unchanged(base.originalCheckpoint);for(const p of snapshots)unchanged(p);return {ok:true,base,snapshots,sourceObservation:o,actor:before,source:base.source};}finally{busy=false;}}
  function authorize(context){const a=validateInput(context.args),r=context.record,steps=r?.payload?.plan?.steps;if(context.stepCount!==1||steps?.length!==1||steps[0].tool!==TOOL||stableStringify(validateInput(steps[0].args))!==stableStringify(a)||r.payloadHash!==sha256Payload(r.payload)||!context.checkpoint)fail("title_verification_runner_required");deps.assertRunner(context);save.verifyDryRunReceipt(r,1,context.contractVersion);const cap=Object.freeze({});contexts.set(cap,{context,fingerprint:stableStringify({args:context.args,checkpoint:context.checkpoint,payloadHash:r.payloadHash}),used:false});return cap;}
  async function execute(raw,cap){
    const row=contexts.get(cap);if(!row||row.used||stableStringify(validateInput(raw))!==stableStringify(validateInput(row.context.args)))fail("title_verification_runner_required");deps.assertRunner(row.context);if(row.fingerprint!==stableStringify({args:row.context.args,checkpoint:row.context.checkpoint,payloadHash:row.context.record.payloadHash}))fail("title_verification_context_changed");row.used=true;
    if(busy)fail("title_verification_busy");const prior=read(raw,"attempt");if(prior)return reconcile(raw);
    deps.assertProtection(row.context);const prepared=await preflight(raw),base=prepared.base,checkpoint=exportsTool.fileRecord(row.context.checkpoint.checkpointFile);
    if(!same(row.context.checkpoint.sourceFile,base.source.path)||checkpoint.sha25664!==base.source.sha25664||checkpoint.bytes!==base.source.bytes||same(checkpoint.path,base.source.path))fail("title_verification_checkpoint_changed");
    busy=true;try{
      deps.assertRunner(row.context);deps.assertProtection(row.context);const before=await actor();if(stableStringify(before)!==stableStringify(prepared.actor))fail("title_verification_actor_changed");
      const nonce=crypto.randomUUID(),a={schema:SCHEMA,selector:base.selector,nonce,recordHash:base.recordHash,baselineHash:base.a.expectedStateHash,source:base.source,snapshots:prepared.snapshots,checkpoint,targets:base.targets,sourceObservation:prepared.sourceObservation,actor:before};
      a.binding=hash({selector:a.selector,recordHash:a.recordHash,baselineHash:a.baselineHash,source:a.source,snapshots:a.snapshots,checkpoint:a.checkpoint,nonce});
      a.program={schema:SCHEMA,nonce,binding:a.binding,args:base.a,baseline:base.baseline,source:base.source,targets:base.targets,sourceObservation:a.sourceObservation,pins:[base.source,base.originalCheckpoint,checkpoint,...a.snapshots],deadline:Math.min(Date.parse(row.context.record.proposalExpiresAt),Date.now()+120000)};a.scriptSha256=hash(program(a.program));pins(base,a);
      // Durable consume precedes even enqueue of the first context-changing script.
      write(base.selector,"attempt",a,true);state(base.selector,{phase:"native_reserved",replayAllowed:false});
      await native(program(a.program),"verify",true,base.selector);return await settle(base,a,null,row.context);
    }catch(error){return {ok:false,schema:SCHEMA,code:error.code||error.message,guardHeld:held(),replayAllowed:false,originalOutcome:"unknown_preserved"};}finally{busy=false;}
  }
  async function reconcile(raw){if(busy)fail("title_verification_busy");busy=true;try{const base=original(deps,raw),a=read(base.selector,"attempt");if(!a)return {ok:false,schema:SCHEMA,code:"title_verification_attempt_missing",replayAllowed:false};return await settle(base,a,read(base.selector,"receipt"));}catch(error){return {ok:false,schema:SCHEMA,code:error.code||error.message,guardHeld:held(),replayAllowed:false,originalOutcome:"unknown_preserved"};}finally{busy=false;}}
  return {preflight,authorize,execute,reconcile,prepareNative,assertNative,queued,status:()=>{try{return {guardHeld:held(),busy,replayAllowed:false};}catch(error){return {guardHeld:true,busy,code:error.code||error.message,replayAllowed:false};}}};
}
function verifyResult(v,args){const a=validateInput(args);if(v?.schema!==SCHEMA||v.ok!==true||v.phase!=="verified"||stableStringify(v.selector)!==stableStringify(a)||v.savedSourceProofAdopted!==true||v.originalOutcome!=="unknown_preserved"||v.replayAllowed!==false||!/^[a-f0-9]{64}$/.test(v.receiptSha256)||v.snapshots?.length!==2||!v.source?.path)fail("title_verification_result_unverified");return {ok:true,scope:"existing_snapshots_and_restored_source",mediaVerified:false};}
function toolDefinitions(){const inputSchema={type:"object",additionalProperties:false,required:["runId","commandId"],properties:{runId:{type:"string",pattern:records.ID.source},commandId:{type:"string",pattern:records.ID.source}}};return [{name:TOOL,description:"Verify two existing snapshots of one unknown export by fixed guarded open/read/restore. Isolated server proposal, fresh dry-run and checkpoint required. Consumes selector once; never saves, exports, enqueues or starts. Original UNKNOWN/noReplay preserved.",inputSchema,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},{name:LOOKUP,description:"Read/reconcile one consumed title snapshot verification selector. Fixed keyed lookup and independent clean-source checks; never repeats opens. May rehydrate private proofs from a verified checksum receipt after restart; UNKNOWN/noReplay preserved.",inputSchema,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:false}}];}
module.exports={TOOL,LOOKUP,SCHEMA,SLOT,validateInput,createExecutor,toolDefinitions,verifyResult,nativeVerify,nativeObserve,program,observeScript,lookupScript};

"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const variants=require("./native-render-variant"),save=require("./project-save"),{stableStringify,sha256Payload}=require("./m100-protocol");
const TOOL="export_two_title_snapshots",SCHEMA="ae-agent-title-export-snapshots.v1";
const RECOVER="recover_title_export_snapshots",RECOVERY_SCHEMA="ae-agent-title-export-recovery.v1";
const hash=value=>crypto.createHash("sha256").update(Buffer.isBuffer(value)?value:stableStringify(value)).digest("hex");
const same=(a,b)=>String(a).replace(/\\/g,"/").toLowerCase()===String(b).replace(/\\/g,"/").toLowerCase();
function fail(code){throw Object.assign(Error(code),{code});}
function validateInput(raw){
  const keys=["expectedProjectFile","expectedSourceSha25664","expectedRevision","expectedStateHash","compItemId","variants"];
  if(!raw || typeof raw!=="object" || Object.keys(raw).some(k=>!keys.includes(k)) ||
    !/^[a-f0-9]{64}$/.test(raw.expectedSourceSha25664 || "") || !/^[a-f0-9]{64}$/.test(raw.expectedStateHash || "") ||
    !Number.isSafeInteger(raw.expectedRevision) || raw.expectedRevision<0 || !Array.isArray(raw.variants) || raw.variants.length!==2)fail("title_export_invalid_input");
  const rows=raw.variants.map((v,index)=>{
    if(!v || Object.keys(v).some(k=>!["layerId","name","snapshotFileName"].includes(k)) || v.name!==`TITR_0${index+1}` ||
      !Number.isSafeInteger(v.layerId) || v.layerId<1 || typeof v.snapshotFileName!=="string" ||
      !new RegExp(`^titr_0${index+1}_ame_product_[0-9]{8}\\.aep$`).test(v.snapshotFileName))fail("title_export_exact_pair_required");
    return {layerId:v.layerId,name:v.name,snapshotFileName:v.snapshotFileName};
  });
  const inspection=variants.validateInput(variants.INSPECT,{expectedProjectFile:raw.expectedProjectFile,rootCompItemId:raw.compItemId,variantCompItemId:raw.compItemId,
    controlledLayerIds:rows.map(v=>v.layerId),variants:rows.map((v,i)=>({variantId:v.name,activeLayerIds:[v.layerId],outputFileName:`titr_0${i+1}.mov`}))});
  return {expectedProjectFile:inspection.expectedProjectFile,expectedSourceSha25664:raw.expectedSourceSha25664,expectedRevision:raw.expectedRevision,
    expectedStateHash:raw.expectedStateHash,compItemId:raw.compItemId,variants:rows};
}
function inspectionArgs(a,file=a.expectedProjectFile){return {expectedProjectFile:file,rootCompItemId:a.compItemId,variantCompItemId:a.compItemId,controlledLayerIds:a.variants.map(v=>v.layerId)};}
function fileRecord(file,empty=false){
  const before=fs.lstatSync(file);if(!before.isFile() || before.isSymbolicLink() || before.nlink!==1 || !same(fs.realpathSync(file),file) || before.size>(512*1024*1024) || (!empty && !before.size))fail("title_export_file_identity_invalid");
  const sha25664=hash(fs.readFileSync(file)),after=fs.lstatSync(file);
  if(before.ino!==after.ino || before.dev!==after.dev || before.size!==after.size || before.mtimeMs!==after.mtimeMs)fail("title_export_file_changed");
  return {path:file,sha25664,bytes:after.size,mtimeMs:Math.floor(after.mtimeMs),device:String(after.dev),inode:String(after.ino)};
}
function unchanged(pin){if(stableStringify(fileRecord(pin.path,pin.bytes===0))!==stableStringify(pin))fail("title_export_file_changed");}
function destinations(a){
  const dir=path.dirname(a.expectedProjectFile);
  if(!same(fs.realpathSync(dir),dir) || fs.lstatSync(dir).isSymbolicLink())fail("title_export_directory_alias");
  return a.variants.map(v=>path.join(dir,v.snapshotFileName));
}
function absent(files){for(const file of files){try{fs.lstatSync(file);fail("title_export_target_exists_no_replay");}catch(e){if(e.code!=="ENOENT")throw e;}}}
function readScript(a){return `var nativeSnapshot=${variants.nativeSnapshot.toString()};return {snapshot:nativeSnapshot(${JSON.stringify(inspectionArgs(a))}),dirty:app.project.dirty};`;}
function rehydrateReadScript(a,files){return `var nativeSnapshot=${variants.nativeSnapshot.toString()};var allowed=${JSON.stringify(files)},current=app.project&&app.project.file?String(app.project.file.fsName):"",selected=null;for(var i=0;i<allowed.length;i++)if(current.toLowerCase().split("\\\\").join("/")===allowed[i].toLowerCase().split("\\\\").join("/"))selected=allowed[i];if(!selected)throw Error("title_recovery_current_project_not_verified");var inspect=${JSON.stringify(inspectionArgs(a))};inspect.expectedProjectFile=selected;var target=null;for(var j=1;j<=app.project.numItems;j++)if(app.project.item(j).id===${a.compItemId})target=app.project.item(j);return {snapshot:nativeSnapshot(inspect),dirty:app.project.dirty,guid:target?String(target.dynamicLinkGUID||""):null};`;}
// Uses the same native String(number) representation as the bridge serializer.
function nativeSnapshotDifference(actual,expected){
  var mismatch=null;
  function sameText(a,b){var i;if(a.length!==b.length)return false;for(i=0;i<a.length;i++)if(a.charCodeAt(i)!==b.charCodeAt(i))return false;return true;}
  function equal(a,b,p){
    var k,n=0,m=0,as,bs,at=typeof a,bt=typeof b,ak,bk;
    // Native primitives can reject === after a JSON round trip. Compare each
    // supported type by value without coercing types or normalizing text.
    if(sameText(at,bt)){
      switch(at){
        case "string":if(sameText(a,b))return true;break;
        case "boolean":if(a){if(b)return true;}else if(!b)return true;break;
        case "number":if(isFinite(a)&&isFinite(b)&&sameText(String(a),String(b)))return true;break;
        case "object":
          if(!a){if(!b)return true;break;}
          if(!b)break;
          ak=Object.prototype.toString.call(a);bk=Object.prototype.toString.call(b);
          if(!sameText(ak,bk))break;
          if(sameText(ak,"[object Array]")){if(a.length!==b.length)break;}
          else if(!sameText(ak,"[object Object]"))break;
          for(k in a)if(Object.prototype.hasOwnProperty.call(a,k)){n++;if(!Object.prototype.hasOwnProperty.call(b,k)){mismatch={path:p+"."+k,actual:"present",expected:"missing"};return false;}if(!equal(a[k],b[k],p+"."+k))return false;}
          for(k in b)if(Object.prototype.hasOwnProperty.call(b,k))m++;
          if(n!==m){mismatch={path:p,actual:"keys:"+n,expected:"keys:"+m};return false;}return true;
      }
    }
    as=String(a);bs=String(b);mismatch={path:p,actual:as.substring(0,120),expected:bs.substring(0,120),actualType:at,expectedType:bt,actualLength:as.length,expectedLength:bs.length};for(k=0;k<Math.max(as.length,bs.length);k++)if(as.charCodeAt(k)!==bs.charCodeAt(k)){mismatch.firstDifference=k;mismatch.actualCode=k<as.length?as.charCodeAt(k):null;mismatch.expectedCode=k<bs.length?bs.charCodeAt(k):null;break;}return false;
  }
  equal(actual,expected,"snapshot");return mismatch;
}
function compareScript(a,baseline){return `var nativeSnapshot=${variants.nativeSnapshot.toString()};var nativeSnapshotDifference=${nativeSnapshotDifference.toString()};var baseline=${JSON.stringify(baseline)};return {difference:nativeSnapshotDifference(nativeSnapshot(${JSON.stringify(inspectionArgs(a))}),baseline),dirty:app.project.dirty};`;}
// Fixed ES3 program. No caller code, arbitrary save destination, render or catch restore.
function nativeExport(a,baseline,sourcePin,reservations,deadline){
  var phase="preflight",saved=[],i,j,target=null,layers=[],initial,finalRead,mismatch=null;
  function norm(v){return String(v||"").replace(/\\/g,"/").toLowerCase();}
  function bad(code){throw new Error(code);}
  function equal(a,b){mismatch=nativeSnapshotDifference(a,b);return mismatch===null;}
  // Admission deadline for the next mutation. A known, verified completion of
  // an already admitted open remains evidence even when it finishes later.
  function clock(){if(new Date().getTime()>=deadline)bad("title_export_deadline");}
  // ExtendScript File.modified exposes whole seconds on Windows. The server
  // retains exact millisecond/inode/SHA checks before and after native execution.
  function filePin(pin,empty){var f=new File(pin.path);if(!f.exists||f.alias||!equal(f.length,pin.bytes)||!f.modified||!equal(Math.floor(f.modified.getTime()/1000),Math.floor(pin.mtimeMs/1000))||empty&&!equal(f.length,0))bad("title_export_native_file_changed");return f;}
  function args(file){return {expectedProjectFile:file,rootCompItemId:a.compItemId,variantCompItemId:a.compItemId,controlledLayerIds:[a.variants[0].layerId,a.variants[1].layerId]};}
  function state(file,slot){
    var s=nativeSnapshot(args(file)),k,n,row,wanted,actual=[];
    if(!equal(app.project.dirty,false))bad("title_export_project_dirty");
    for(k=0;k<s.controlled.length;k++){row=s.controlled[k];wanted=slot===null?baseline.controlled[k].enabled:equal(row.id,a.variants[slot].layerId);if(!equal(row.enabled,wanted))bad("title_export_variant_flags");actual.push({id:row.id,name:row.name,enabled:row.enabled});row.enabled=baseline.controlled[k].enabled;}
    for(k=0;k<s.graph.length;k++)if(equal(s.graph[k].id,a.compItemId))for(n=0;n<s.graph[k].layers.length;n++){row=s.graph[k].layers[n];for(j=0;j<baseline.controlled.length;j++)if(equal(row.id,baseline.controlled[j].id))row.enabled=baseline.controlled[j].enabled;}
    s.projectFile=baseline.projectFile;s.revision=baseline.revision;if(!equal(s,baseline))bad("title_export_preservation_mismatch");
    return actual;
  }
  try{
    clock();filePin(sourcePin,false);for(i=0;i<reservations.length;i++)filePin(reservations[i],true);
    if(!equal(app.project.dirty,false) || !equal(app.project.revision,a.expectedRevision))bad("title_export_source_changed");
    initial=nativeSnapshot(args(a.expectedProjectFile));if(!equal(initial,baseline))bad("title_export_baseline_changed");
    for(i=1;i<=app.project.numItems;i++)if(equal(app.project.item(i).id,a.compItemId))target=app.project.item(i);
    for(i=0;i<2;i++){for(j=1;j<=target.numLayers;j++)if(equal(target.layer(j).id,a.variants[i].layerId))layers[i]=target.layer(j);
      if(!layers[i] || !(layers[i] instanceof TextLayer) || !equal(layers[i].name,a.variants[i].name) || layers[i].locked || !equal(layers[i].enabled,i===0))bad("title_export_exact_pair_changed");}
    for(i=0;i<2;i++){
      clock();filePin(sourcePin,false);filePin(reservations[i],true);
      phase="save_"+(i+1)+"_submitted";
      if(i===1){app.beginUndoGroup("AE Agent: второй экспортный титр");try{layers[0].enabled=false;layers[1].enabled=true;}finally{app.endUndoGroup();}}
      app.project.save(new File(reservations[i].path));
      if(!app.project.file || !equal(norm(app.project.file.fsName),norm(reservations[i].path)) || !equal(app.project.dirty,false) || !(new File(reservations[i].path)).exists || (new File(reservations[i].path)).length<1)bad("title_export_save_readback_failed");
      var flags=state(reservations[i].path,i),guid=String(target.dynamicLinkGUID||"");
      if(!/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(guid))bad("title_export_native_guid_missing");
      saved.push({path:String(app.project.file.fsName),revision:app.project.revision,dirty:false,guid:guid,flags:flags});phase="save_"+(i+1)+"_verified";
    }
    clock();filePin(sourcePin,false);if(!equal(app.project.dirty,false))bad("title_export_restore_dirty");
    phase="restore_submitted";app.open(new File(a.expectedProjectFile));
    finalRead=state(a.expectedProjectFile,null);filePin(sourcePin,false);phase="restored";
    return {schema:"ae-agent-title-export-snapshots.v1",ok:true,phase:phase,saved:saved,restored:{path:String(app.project.file.fsName),revision:app.project.revision,dirty:app.project.dirty,flags:finalRead}};
  }catch(e){return {schema:"ae-agent-title-export-snapshots.v1",ok:false,phase:phase,code:String(e.message||e),mismatch:mismatch,saved:saved,automaticRetryAllowed:false,current:{path:app.project&&app.project.file?String(app.project.file.fsName):null,dirty:app.project?app.project.dirty:null,revision:app.project?app.project.revision:null}};}
}
function exportScript(a,baseline,pin,reservations,deadline){return `var nativeSnapshot=${variants.nativeSnapshot.toString()};var nativeSnapshotDifference=${nativeSnapshotDifference.toString()};var nativeExport=${nativeExport.toString()};return nativeExport(${[a,baseline,pin,reservations,deadline].map(v=>JSON.stringify(v)).join(",")});`;}
function createExecutor(deps){
  const contexts=new WeakMap(),savedSources=new Map();
  function assertContext(context,a){
    const row=contexts.get(context),r=context?.record;
    if(!row || row.record!==r || row.fingerprint!==stableStringify({args:context.args,checkpoint:context.checkpoint,payloadHash:r.payloadHash}) ||
      r.payloadHash!==sha256Payload(r.payload) || stableStringify(validateInput(context.args))!==stableStringify(a))fail("title_export_runner_required");
    deps.assertRunner(context);save.verifyDryRunReceipt(r,1,context.contractVersion);return row;
  }
  function authorize(context){
    const a=validateInput(context.args),steps=context.record?.payload?.plan?.steps;
    if(context.stepCount!==1 || !Array.isArray(steps) || steps.length!==1 || steps[0].tool!==TOOL || stableStringify(validateInput(steps[0].args))!==stableStringify(a) ||
      !context.checkpoint || !same(context.checkpoint.sourceFile,a.expectedProjectFile))fail("title_export_exact_plan_required");
    const cap=Object.freeze({});contexts.set(cap,{record:context.record,context,fingerprint:stableStringify({args:context.args,checkpoint:context.checkpoint,payloadHash:context.record.payloadHash}),used:false});
    return cap;
  }
  async function preflight(raw){
    const a=validateInput(raw),source=fileRecord(a.expectedProjectFile),targets=destinations(a);absent(targets);
    if(source.sha25664!==a.expectedSourceSha25664)fail("title_export_source_hash_changed");
    const native=await deps.readNative(readScript(a));unchanged(source);
    const read=native?.result || native;
    if(read?.dirty!==false || read.snapshot?.revision!==a.expectedRevision || variants.digest(read.snapshot)!==a.expectedStateHash)fail("title_export_source_baseline_changed");
    const compared=await deps.readNative(compareScript(a,read.snapshot)),comparison=compared?.result || compared;unchanged(source);
    if(comparison?.dirty!==false || comparison.difference!==null)throw Object.assign(Error("title_export_native_baseline_changed: "+JSON.stringify(comparison?.difference || null)),{code:"title_export_native_baseline_changed"});
    for(let i=0;i<2;i++){const layer=read.snapshot.controlled.find(l=>l.id===a.variants[i].layerId);if(!layer || layer.name!==a.variants[i].name || layer.enabled!==(i===0))fail("title_export_exact_pair_changed");}
    return {a,source,targets,baseline:read.snapshot};
  }
  async function execute(raw,cap){
    const row=contexts.get(cap);if(!row || row.used)fail("title_export_runner_required");
    const context=row.context,a=validateInput(raw);
    // The private capability references the runner's original context, never tool JSON.
    contexts.set(context,row);assertContext(context,a);
    const prepared=await preflight(a),checkpoint=fileRecord(context.checkpoint.checkpointFile);
    if(checkpoint.sha25664!==prepared.source.sha25664 || checkpoint.bytes!==prepared.source.bytes || same(checkpoint.path,prepared.source.path))fail("title_export_checkpoint_changed");
    assertContext(context,a);row.used=true;
    const evidence={schema:SCHEMA,phase:"reserving",source:prepared.source,checkpoint,targets:prepared.targets,reservations:[],automaticRetryAllowed:false};
    deps.persist(evidence);
    for(const file of prepared.targets){const fd=fs.openSync(file,"wx");try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}evidence.reservations.push(fileRecord(file,true));deps.persist(evidence);}
    unchanged(prepared.source);unchanged(checkpoint);for(const pin of evidence.reservations)unchanged(pin);assertContext(context,a);
    evidence.phase="native_submitted";deps.persist(evidence);
    const deadline=Math.min(Date.parse(context.record.proposalExpiresAt),Date.now()+120000);
    const response=await deps.writeNative(exportScript(a,prepared.baseline,prepared.source,evidence.reservations,deadline),120000),native=response?.result || response;
    evidence.native=native;evidence.phase=native?.phase || "unknown";deps.persist(evidence);
    if(!native?.ok || native.schema!==SCHEMA || native.saved?.length!==2 || native.phase!=="restored")return {ok:false,schema:SCHEMA,code:native?.code || "title_export_unknown",evidence,automaticRetryAllowed:false};
    unchanged(prepared.source);unchanged(checkpoint);
    const snapshots=prepared.targets.map((file,i)=>{if(!same(native.saved[i].path,file) || native.saved[i].dirty!==false)fail("title_export_snapshot_readback_changed");return {...fileRecord(file),native:native.saved[i]};});
    const final=await deps.readNative(readScript(a)),observed=final?.result || final;
    const normalized={...observed?.snapshot,revision:prepared.baseline.revision};
    if(observed?.dirty!==false || stableStringify(normalized)!==stableStringify(prepared.baseline))fail("title_export_restoration_readback_failed");
    unchanged(prepared.source);for(const pin of snapshots){const {native,...file}=pin;unchanged(file);}
    evidence.phase="verified";evidence.snapshots=snapshots;evidence.restored=observed;deps.persist(evidence);
    for(const pin of snapshots)savedSources.set(path.resolve(pin.path).toLowerCase(),JSON.parse(JSON.stringify(pin)));
    return {ok:true,schema:SCHEMA,source:prepared.source,snapshots,restored:{path:a.expectedProjectFile,dirty:false,revision:observed.snapshot.revision,stateHash:variants.digest(normalized)},checkpoint,automaticRetryAllowed:false};
  }
  function assertSavedSource(selector){
    const saved=savedSources.get(path.resolve(selector.sourcePath).toLowerCase());
    if(!saved || saved.sha25664!==selector.sourceSha25664 || saved.native.guid!==selector.sourceGuid)fail("title_export_saved_source_binding_required");
    const {native,...pin}=saved;unchanged(pin);return true;
  }
  return {authorize,preflight,execute,assertSavedSource,createVerification:options=>require("./title-export-verification").createExecutor({...options,adopt:snapshots=>{
    for(const pin of snapshots)savedSources.set(path.resolve(pin.path).toLowerCase(),JSON.parse(JSON.stringify(pin)));
  }}),createRecovery:options=>createRecovery({...options,adopt:snapshots=>{
    for(const pin of snapshots)savedSources.set(path.resolve(pin.path).toLowerCase(),JSON.parse(JSON.stringify(pin)));
  }})};
}
// One startup-selected, read-only reconciliation. A selector never supplies
// native data or execution rights, and the original run record is immutable.
function createRecovery(deps){
  const exact=(v,keys)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(v,k));
  const marker=path.join(deps.root,"title-export-recovery-arm.json");
  let selector=null,record=null,args=null,step=null,command=null,baseline=null,phase="unarmed",held=false,current=null,result=null,storedCapture=null;
  const issued=[];
  const captureBody='return {raw:typeof __codexMcpBridgeResult==="string"?__codexMcpBridgeResult:null};';
  const evidenceFile=kind=>path.join(deps.root,"evidence","title-export-recovery",selector.runId+"."+kind+".json");
  function consume(){if(fs.existsSync(marker)){if(stableStringify(JSON.parse(fs.readFileSync(marker,"utf8")))!==stableStringify(selector))fail("title_recovery_selector_changed");fs.renameSync(marker,marker+".consumed-"+selector.runId);}}
  function stored(kind){
    const file=evidenceFile(kind);if(!fs.existsSync(file))return null;
    require("./plan-run-records").containedFile(deps.root,file);
    if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>4*1024*1024)fail("title_recovery_evidence_invalid");
    const e=JSON.parse(fs.readFileSync(file,"utf8"));if(e.schema!==RECOVERY_SCHEMA||e.sha256!==hash(e.value))fail("title_recovery_evidence_invalid");return e.value;
  }
  function persist(kind,value){
    const file=evidenceFile(kind);fs.mkdirSync(path.dirname(file),{recursive:true});
    require("./plan-run-records").containedFile(deps.root,path.dirname(file));
    if(kind==="receipt"){const previous=stored(kind);value.failures=previous?.failures||[];if(value.ok===false&&value.code)value.failures=value.failures.concat({code:value.code,at:new Date().toISOString()});}
    const temporary=kind==="receipt"?file+"."+crypto.randomUUID()+".tmp":file;
    const fd=fs.openSync(temporary,"wx");try{fs.writeFileSync(fd,JSON.stringify({schema:RECOVERY_SCHEMA,sha256:hash(value),value}),"utf8");fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    if(kind==="receipt")fs.renameSync(temporary,file);
    return file;
  }
  function sourcePins(){unchanged(step.exportSnapshots.source);unchanged(step.exportSnapshots.checkpoint);}
  function assertSuffix(){
    const file=path.join(deps.root,"bridge-events.jsonl"),stat=fs.statSync(file);
    if(stat.size>128*1024*1024)fail("title_recovery_journal_budget");
    const events=fs.readFileSync(file,"utf8").split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)),rows=events.filter(e=>e.type==="ae_command_queued");
    const originals=rows.filter(e=>e.details?.id===selector.commandId);
    if(originals.length!==1||originals[0].details.runId!==selector.runId||originals[0].runtime?.sourceSha256!==record.run.provenance.runtime.sourceSha256)fail("title_recovery_original_command_journal_required");
    const later=rows.slice(rows.indexOf(originals[0])+1).map(e=>e.details?.id);
    if(stableStringify(later)!==stableStringify(issued))fail("title_recovery_later_native_command");
    for(let i=0;i<later.length;i++)if(rows[rows.indexOf(originals[0])+1+i].details.scriptSha25664!==crypto.createHash("sha256").update(deps.wrap(i===0?captureBody:readScript(args)),"utf8").digest("hex"))fail("title_recovery_foreign_native_script");
  }
  function actor(value){
    const s=value?.state,owner=command.leaseOwner;
    if(!s||s.bridgeConnection?.panelConnectionId!==owner.panelConnectionId||String(s.panelGeneration)!==owner.panelGeneration||
      typeof s.panelInstanceId!=="string"||!s.panelInstanceId||!Number.isSafeInteger(s.panelLifecycleEpoch)||s.nativeControlIdle!==true||
      s.activeAction!==null||s.recoveryTransport||s.actionStorage!=="ready")fail("title_recovery_panel_actor_changed");
    return {panelConnectionId:owner.panelConnectionId,panelGeneration:String(s.panelGeneration),panelInstanceId:s.panelInstanceId,panelLifecycleEpoch:s.panelLifecycleEpoch};
  }
  function flags(rows,slot){
    const expected=args.variants.map((v,i)=>({id:v.layerId,name:v.name,enabled:slot===null?i===0:i===slot})).sort((a,b)=>a.id-b.id);
    if(!Array.isArray(rows)||rows.length!==2||rows.some(r=>!exact(r,["id","name","enabled"]))||stableStringify(rows.slice().sort((a,b)=>a.id-b.id))!==stableStringify(expected))fail("title_recovery_native_flags_changed");
  }
  function nativeResult(raw){
    if(typeof raw!=="string"||Buffer.byteLength(raw)>1024*1024)fail("title_recovery_global_invalid");
    let wrapper;try{wrapper=JSON.parse(raw);}catch(_){fail("title_recovery_global_invalid");}
    const n=wrapper?.result,targets=step.exportSnapshots.targets;
    if(!exact(wrapper,["ok","result"])||wrapper.ok!==true||!exact(n,["schema","ok","phase","saved","restored"])||n.schema!==SCHEMA||n.ok!==true||n.phase!=="restored"||!Array.isArray(n.saved)||n.saved.length!==2)fail("title_recovery_global_not_restored");
    for(let i=0;i<2;i++){const row=n.saved[i];if(!exact(row,["path","revision","dirty","guid","flags"])||row.path!==targets[i]||row.dirty!==false||!Number.isSafeInteger(row.revision)||row.revision<0||!/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(row.guid||""))fail("title_recovery_native_saved_invalid");flags(row.flags,i);}
    const r=n.restored;if(!exact(r,["path","revision","dirty","flags"])||r.path!==args.expectedProjectFile||r.dirty!==false||!Number.isSafeInteger(r.revision)||r.revision<0)fail("title_recovery_native_restore_invalid");flags(r.flags,null);return n;
  }
  function loadOriginal(){
    if(!exact(selector,["schema","runId","commandId","runRecordSha256"])||selector.schema!==RECOVERY_SCHEMA||!require("./plan-run-records").ID.test(selector.runId)||!require("./plan-run-records").ID.test(selector.commandId)||!/^[a-f0-9]{64}$/.test(selector.runRecordSha256||""))fail("title_recovery_selector_invalid");
    record=deps.loadRecord(selector.runId);
    if(require("./plan-run-records").digest(JSON.stringify(record))!==selector.runRecordSha256||record.run?.dryRun!==false||record.run?.ok!==false||record.plan?.steps?.length!==1||record.run.steps?.length!==1||record.plan.steps[0].tool!==TOOL)fail("title_recovery_original_record_invalid");
    step=record.run.steps[0];args=validateInput(record.plan.steps[0].args);
    const mutations=step.commands?.filter(c=>c.role==="mutation")||[],saved=step.exportSnapshots;
    command=mutations[0];baseline=step.commands?.find(c=>c.role==="readback"&&c.state==="completed"&&c.ok===true&&c.result?.snapshot)?.result.snapshot;
    if(step.tool!==TOOL||step.index!==1||stableStringify(validateInput(step.args))!==stableStringify(args)||mutations.length!==1||command.id!==selector.commandId||command.executionId!==selector.runId||command.state!=="timed_out_after_submit"||command.timedOutFrom!=="submitted"||!command.leaseOwner?.panelConnectionId||!command.leaseOwner?.panelGeneration||
      saved?.schema!==SCHEMA||saved.phase!=="native_submitted"||saved.automaticRetryAllowed!==false||saved.source?.sha25664!==args.expectedSourceSha25664||saved.source.path!==args.expectedProjectFile||saved.checkpoint?.sha25664!==args.expectedSourceSha25664||saved.checkpoint.path===saved.source.path||
      stableStringify(saved.targets)!==stableStringify(args.variants.map(v=>path.join(path.dirname(args.expectedProjectFile),v.snapshotFileName)))||!Array.isArray(saved.reservations)||saved.reservations.length!==2||saved.reservations.some((p,i)=>p.path!==saved.targets[i]||p.bytes!==0)||
      !baseline||baseline.projectFile!==args.expectedProjectFile||baseline.revision!==args.expectedRevision||variants.digest(baseline)!==args.expectedStateHash)fail("title_recovery_original_record_invalid");
  }
  if(fs.existsSync(marker)){
    if(fs.lstatSync(marker).isSymbolicLink()||fs.statSync(marker).size>1024)fail("title_recovery_selector_invalid");
    selector=JSON.parse(fs.readFileSync(marker,"utf8"));loadOriginal();
    storedCapture=stored("capture");const previous=stored("receipt");
    if(storedCapture){
      if(stableStringify(storedCapture.selector)!==stableStringify(selector)||!require("./plan-run-records").ID.test(storedCapture.commandId))fail("title_recovery_evidence_invalid");
      const ids=previous?.issuedCommandIds||[storedCapture.commandId];
      if(!Array.isArray(ids)||ids[0]!==storedCapture.commandId||new Set(ids).size!==ids.length||ids.some(id=>!require("./plan-run-records").ID.test(id)))fail("title_recovery_evidence_invalid");issued.push(...ids);
    }
    held=true;phase=storedCapture?"captured":fs.existsSync(evidenceFile("attempt"))?"previous_attempt_requires_review":"armed";
    if(previous?.ok===true&&previous.phase==="verified"){consume();held=false;phase="previously_verified";result={...previous,adoptedInCurrentRuntime:false};}else assertSuffix();
  }
  async function native(body,label){
    current={body,script:deps.wrap(body),label,used:false,id:null};
    return deps.readNative(body,current);
  }
  function assertNative(scope,script){
    if(!held)return;
    if(!current||scope!==current||scope.used||scope.script!==script)fail("title_recovery_native_guard");
    scope.used=true;
  }
  function queued(scope,id){if(!held||scope!==current||!scope.used||scope.id)fail("title_recovery_native_guard");scope.id=id;issued.push(id);if(scope.label==="source_verifier")persist("receipt",{ok:false,phase:"verifier_submitted",selector,issuedCommandIds:issued.slice(),replayAllowed:false});}
  async function rehydrate(raw){
    // Consumed startup markers are not rearmed. Only an already verified,
    // server-owned receipt can restore this daemon's private saved-source map.
    selector={schema:RECOVERY_SCHEMA,runId:raw.runId,commandId:raw.commandId,runRecordSha256:null};
    const receipt=stored("receipt");
    if(receipt?.ok!==true||receipt.schema!==RECOVERY_SCHEMA||receipt.phase!=="verified"||receipt.originalRunId!==raw.runId||receipt.originalCommandId!==raw.commandId||receipt.replayAllowed!==false)fail("title_recovery_verified_receipt_required");
    selector.runRecordSha256=receipt.originalRunRecordSha256;loadOriginal();storedCapture=stored("capture");
    if(!storedCapture||!require("./plan-run-records").ID.test(storedCapture.commandId)||receipt.issuedCommandIds?.[0]!==storedCapture.commandId||receipt.captureFile!==evidenceFile("capture")||stableStringify(storedCapture.selector)!==stableStringify(selector)||stableStringify(storedCapture.actor)!==stableStringify(receipt.actor))fail("title_recovery_evidence_invalid");
    const n=nativeResult(storedCapture.raw),saved=receipt.recovered;verifyResult(saved,args);
    if(stableStringify(saved.source)!==stableStringify(step.exportSnapshots.source)||stableStringify(saved.checkpoint)!==stableStringify(step.exportSnapshots.checkpoint)||saved.snapshots.some((s,i)=>stableStringify(s.native)!==stableStringify(n.saved[i])))fail("title_recovery_verified_receipt_changed");
    phase="rehydrating";held=true;
    try{
      sourcePins();for(const s of saved.snapshots){const {native:unused,...pin}=s;unchanged(pin);}
      const before=actor(await deps.readActor());if(stableStringify(before)!==stableStringify(receipt.actor))fail("title_recovery_panel_actor_changed");
      const files=[args.expectedProjectFile,...saved.snapshots.map(s=>s.path)],response=await native(rehydrateReadScript(args,files),"rehydrate_verifier"),observed=response?.result||response;
      const selected=files.findIndex(file=>same(file,observed?.snapshot?.projectFile));if(selected<0||observed?.dirty!==false||!Number.isSafeInteger(observed?.snapshot?.revision))fail("title_recovery_source_readback_changed");
      const expected=JSON.parse(JSON.stringify(baseline));expected.projectFile=files[selected];
      if(selected>0){const snapshot=saved.snapshots[selected-1];if(observed.guid!==snapshot.native.guid)fail("title_recovery_snapshot_guid_changed");
        const flags=snapshot.native.flags,target=expected.graph.filter(c=>c.id===args.compItemId);if(target.length!==1)fail("title_recovery_snapshot_graph_invalid");
        for(const flag of flags){const controlled=expected.controlled.filter(l=>l.id===flag.id),layers=target[0].layers.filter(l=>l.id===flag.id);if(controlled.length!==1||layers.length!==1||controlled[0].name!==flag.name)fail("title_recovery_snapshot_flags_invalid");controlled[0].enabled=flag.enabled;layers[0].enabled=flag.enabled;}
      }
      // Revision is a host session counter; every other structural field is exact.
      const normalized={...observed.snapshot,revision:baseline.revision};if(stableStringify(normalized)!==stableStringify(expected))fail("title_recovery_source_readback_changed");
      sourcePins();for(const s of saved.snapshots){const {native:unused,...pin}=s;unchanged(pin);}
      if(stableStringify(before)!==stableStringify(actor(await deps.readActor())))fail("title_recovery_panel_actor_changed");
      deps.adopt(saved.snapshots);result={...receipt,rehydrated:true,adoptedInCurrentRuntime:true,rehydrationCurrent:{path:files[selected],snapshotIndex:selected-1,guid:observed.guid||null,revision:observed.snapshot.revision,stateHash:variants.digest(observed.snapshot)}};phase="verified";held=false;current=null;return result;
    }catch(error){held=!!current?.id&&!deps.commandSettled(current.id);phase=held?"rehydrate_unknown":"unarmed";current=null;result={ok:false,schema:RECOVERY_SCHEMA,code:error.code||error.message,guardHeld:held,replayAllowed:false};return result;}
  }
  async function recover(raw){
    if(!exact(raw,["runId","commandId"])||!require("./plan-run-records").ID.test(raw.runId)||!require("./plan-run-records").ID.test(raw.commandId))fail("title_recovery_exact_selector_required");
    if(["unarmed","previously_verified"].includes(phase))return rehydrate(raw);
    if(!selector||raw.runId!==selector.runId||raw.commandId!==selector.commandId)fail("title_recovery_exact_selector_required");
    if(!["armed","captured"].includes(phase))return result||{ok:false,schema:RECOVERY_SCHEMA,phase,replayAllowed:false,guardHeld:held};
    phase="checking";held=true;let captured=!!storedCapture,before=null;
    try{
      assertSuffix();sourcePins();before=actor(await deps.readActor());assertSuffix();
      if(!storedCapture){
        persist("attempt",{selector,actor:before,startedAt:new Date().toISOString(),replayAllowed:false});phase="capturing";
        const response=await native(captureBody,"capture"),capture=response?.result||response;
        const value={selector,actor:before,commandId:current.id,raw:capture?.raw,capturedAt:new Date().toISOString(),replayAllowed:false};
        persist("capture",value);storedCapture=value;captured=true;
      }
      const captureFile=evidenceFile("capture");
      if(stableStringify(before)!==stableStringify(storedCapture.actor))fail("title_recovery_panel_actor_changed");
      assertSuffix();const n=nativeResult(storedCapture.raw);sourcePins();
      const snapshots=step.exportSnapshots.targets.map((file,i)=>({...fileRecord(file),native:n.saved[i]}));
      if(stableStringify(before)!==stableStringify(actor(await deps.readActor())))fail("title_recovery_panel_actor_changed");
      phase="verifying";
      const responseRead=await native(readScript(args),"source_verifier"),observed=responseRead?.result||responseRead,normalized={...observed?.snapshot,revision:baseline.revision};
      if(observed?.dirty!==false||stableStringify(normalized)!==stableStringify(baseline))fail("title_recovery_source_readback_changed");
      sourcePins();for(const pin of snapshots){const {native:unused,...file}=pin;unchanged(file);}
      assertSuffix();if(stableStringify(before)!==stableStringify(actor(await deps.readActor())))fail("title_recovery_panel_actor_changed");assertSuffix();
      const recovered={ok:true,schema:SCHEMA,source:step.exportSnapshots.source,checkpoint:step.exportSnapshots.checkpoint,snapshots,restored:{path:args.expectedProjectFile,dirty:false,revision:observed.snapshot.revision,stateHash:variants.digest(normalized)},automaticRetryAllowed:false};
      verifyResult(recovered,args);
      result={ok:true,schema:RECOVERY_SCHEMA,phase:"verified",originalRunId:selector.runId,originalCommandId:selector.commandId,originalRunRecordSha256:selector.runRecordSha256,captureFile,actor:before,issuedCommandIds:issued.slice(),recovered,replayAllowed:false};
      persist("receipt",result);consume();deps.adopt(snapshots);phase="verified";held=false;current=null;return result;
    }catch(error){
      // Unknown native delivery retains the guard; a durable, settled capture
      // permits ordinary reads after terminal failure, never adoption/replay.
      const settled=!current?.id||deps.commandSettled(current.id);
      result={ok:false,schema:RECOVERY_SCHEMA,phase:"failed",selector,code:error.code||error.message,captured,issuedCommandIds:issued.slice(),guardHeld:!settled,replayAllowed:false};
      try{persist("receipt",result);if(!result.guardHeld)consume();}catch(_){result.guardHeld=true;}
      phase=captured?"captured":"failed";held=result.guardHeld;current=null;return result;
    }
  }
  return {recover,assertNative,queued,status:()=>({phase,guardHeld:held,runId:selector?.runId||null,replayAllowed:false})};
}
function verifyResult(result,raw){
  const a=validateInput(raw),files=a.variants.map(v=>path.join(path.dirname(a.expectedProjectFile),v.snapshotFileName));
  if(result?.ok!==true || result.schema!==SCHEMA || result.source?.sha25664!==a.expectedSourceSha25664 || !same(result.source.path,a.expectedProjectFile) ||
    result.checkpoint?.sha25664!==a.expectedSourceSha25664 || result.restored?.dirty!==false || !same(result.restored.path,a.expectedProjectFile) ||
    result.restored.stateHash!==a.expectedStateHash || !Array.isArray(result.snapshots) || result.snapshots.length!==2)fail("title_export_result_unverified");
  for(let i=0;i<2;i++){const s=result.snapshots[i];if(!same(s.path,files[i]) || !/^[a-f0-9]{64}$/.test(s.sha25664||"") || !(s.bytes>0) || s.native?.dirty!==false ||
    !same(s.native.path,s.path) || !/^[a-fA-F0-9-]{36}$/.test(s.native.guid||"") || !a.variants.every((v,j)=>s.native.flags?.some(f=>f.id===v.layerId&&f.name===v.name&&f.enabled===(j===i))))fail("title_export_result_unverified");}
  return {ok:true,scope:"two_new_native_snapshots_and_restored_pinned_source",sourceSha25664:result.source.sha25664,snapshotSha25664:result.snapshots.map(s=>s.sha25664),mediaVerified:false};
}
function toolDefinition(){return {name:TOOL,description:"Create exactly two new saved TITR_01/TITR_02 export snapshots beside the pinned clean source, then restore that same source. One server-proposed autonomous step with checkpoint and read-back; no render or arbitrary save/open.",inputSchema:{type:"object",additionalProperties:false,required:["expectedProjectFile","expectedSourceSha25664","expectedRevision","expectedStateHash","compItemId","variants"],properties:{expectedProjectFile:{type:"string"},expectedSourceSha25664:{type:"string"},expectedRevision:{type:"integer"},expectedStateHash:{type:"string"},compItemId:{type:"integer"},variants:{type:"array",minItems:2,maxItems:2,items:{type:"object",additionalProperties:false,required:["layerId","name","snapshotFileName"],properties:{layerId:{type:"integer"},name:{type:"string"},snapshotFileName:{type:"string"}}}}}}};}
function recoveryToolDefinition(){return {name:RECOVER,description:"Read-only recovery of one startup-armed snapshot command, or rehydrate saved-source proofs from its already verified durable receipt after restart. Rehydrate performs fresh file/source checks without capture, save, open or replay.",annotations:{readOnlyHint:true},inputSchema:{type:"object",additionalProperties:false,required:["runId","commandId"],properties:{runId:{type:"string"},commandId:{type:"string"}}}};}
module.exports={TOOL,SCHEMA,RECOVER,RECOVERY_SCHEMA,validateInput,inspectionArgs,fileRecord,createExecutor,toolDefinition,recoveryToolDefinition,nativeExport,nativeSnapshotDifference,exportScript,readScript,compareScript,verifyResult};

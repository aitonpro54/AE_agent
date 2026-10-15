"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const variants=require("./native-render-variant"),save=require("./project-save"),{stableStringify,sha256Payload}=require("./m100-protocol");
const TOOL="export_two_title_snapshots",SCHEMA="ae-agent-title-export-snapshots.v1";
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
// Uses the same native String(number) representation as the bridge serializer.
function nativeSnapshotDifference(actual,expected){
  var mismatch=null;
  function equal(a,b,p){var k,n=0,m=0;if(a===b||typeof a==="number"&&typeof b==="number"&&String(a)===String(b))return true;if(a===null||b===null||typeof a!=="object"||typeof b!=="object"){mismatch={path:p,actual:String(a).substring(0,120),expected:String(b).substring(0,120)};return false;}for(k in a)if(Object.prototype.hasOwnProperty.call(a,k)){n++;if(!Object.prototype.hasOwnProperty.call(b,k)){mismatch={path:p+"."+k,actual:"present",expected:"missing"};return false;}if(!equal(a[k],b[k],p+"."+k))return false;}for(k in b)if(Object.prototype.hasOwnProperty.call(b,k))m++;if(n!==m){mismatch={path:p,actual:"keys:"+n,expected:"keys:"+m};return false;}return true;}
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
  function filePin(pin,empty){var f=new File(pin.path);if(!f.exists||f.alias||f.length!==pin.bytes||!f.modified||Math.floor(f.modified.getTime()/1000)!==Math.floor(pin.mtimeMs/1000)||empty&&f.length!==0)bad("title_export_native_file_changed");return f;}
  function args(file){return {expectedProjectFile:file,rootCompItemId:a.compItemId,variantCompItemId:a.compItemId,controlledLayerIds:[a.variants[0].layerId,a.variants[1].layerId]};}
  function state(file,slot){
    var s=nativeSnapshot(args(file)),k,n,row,wanted,actual=[];
    if(app.project.dirty!==false)bad("title_export_project_dirty");
    for(k=0;k<s.controlled.length;k++){row=s.controlled[k];wanted=slot===null?baseline.controlled[k].enabled:row.id===a.variants[slot].layerId;if(row.enabled!==wanted)bad("title_export_variant_flags");actual.push({id:row.id,name:row.name,enabled:row.enabled});row.enabled=baseline.controlled[k].enabled;}
    for(k=0;k<s.graph.length;k++)if(s.graph[k].id===a.compItemId)for(n=0;n<s.graph[k].layers.length;n++){row=s.graph[k].layers[n];for(j=0;j<baseline.controlled.length;j++)if(row.id===baseline.controlled[j].id)row.enabled=baseline.controlled[j].enabled;}
    s.projectFile=baseline.projectFile;s.revision=baseline.revision;if(!equal(s,baseline))bad("title_export_preservation_mismatch");
    return actual;
  }
  try{
    clock();filePin(sourcePin,false);for(i=0;i<reservations.length;i++)filePin(reservations[i],true);
    if(app.project.dirty!==false || app.project.revision!==a.expectedRevision)bad("title_export_source_changed");
    initial=nativeSnapshot(args(a.expectedProjectFile));if(!equal(initial,baseline))bad("title_export_baseline_changed");
    for(i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===a.compItemId)target=app.project.item(i);
    for(i=0;i<2;i++){for(j=1;j<=target.numLayers;j++)if(target.layer(j).id===a.variants[i].layerId)layers[i]=target.layer(j);
      if(!layers[i] || !(layers[i] instanceof TextLayer) || layers[i].name!==a.variants[i].name || layers[i].locked || layers[i].enabled!==(i===0))bad("title_export_exact_pair_changed");}
    for(i=0;i<2;i++){
      clock();filePin(sourcePin,false);filePin(reservations[i],true);
      phase="save_"+(i+1)+"_submitted";
      if(i===1){app.beginUndoGroup("AE Agent: второй экспортный титр");try{layers[0].enabled=false;layers[1].enabled=true;}finally{app.endUndoGroup();}}
      app.project.save(new File(reservations[i].path));
      if(!app.project.file || norm(app.project.file.fsName)!==norm(reservations[i].path) || app.project.dirty!==false || !(new File(reservations[i].path)).exists || (new File(reservations[i].path)).length<1)bad("title_export_save_readback_failed");
      var flags=state(reservations[i].path,i),guid=String(target.dynamicLinkGUID||"");
      if(!/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(guid))bad("title_export_native_guid_missing");
      saved.push({path:String(app.project.file.fsName),revision:app.project.revision,dirty:false,guid:guid,flags:flags});phase="save_"+(i+1)+"_verified";
    }
    clock();filePin(sourcePin,false);if(app.project.dirty!==false)bad("title_export_restore_dirty");
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
  return {authorize,preflight,execute,assertSavedSource};
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
module.exports={TOOL,SCHEMA,validateInput,inspectionArgs,fileRecord,createExecutor,toolDefinition,nativeExport,nativeSnapshotDifference,exportScript,readScript,compareScript,verifyResult};

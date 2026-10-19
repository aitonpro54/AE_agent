"use strict";
// Fixed ES3 programs. They inspect one explicit comp graph; they never inspect AME.
const {nativeSnapshotDifference}=require("./title-export-snapshots");
const hashing=require("./ame-job-source-sha256");
const SLOT="__aeAgentAMEJobSourcesV1";
function observe(a){
  function bad(c){throw Error(c);}
  function norm(v){return String(v||"").replace(/\\/g,"/").toLowerCase();}
  function number(v){if(typeof v!=="number"||!isFinite(v))bad("ame_source_native_number_unavailable");return v;}
  function bool(v){if(typeof v!=="boolean")bad("ame_source_native_boolean_unavailable");return v;}
  function optional(v){return v===undefined?null:bool(v);}
  if(!app.project||!app.project.file||norm(app.project.file.fsName)!==norm(a.expectedProjectFile))bad("ame_source_project_changed");
  if(typeof app.project.dirty!=="boolean"||app.project.renderQueue.rendering)bad("ame_source_lifecycle_unavailable_or_rendering");
  var target=null,i,j,graph=[],seen={},total=0;
  for(i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===a.compItemId){if(target)bad("ame_source_ambiguous_comp");target=app.project.item(i);}
  if(!(target instanceof CompItem))bad("ame_source_comp_missing");
  function walk(c,stack){
    var k,l,s,rows=[],next=[],key=String(c.id),n;
    for(n=0;n<stack.length;n++)if(stack[n]===c.id)bad("ame_source_comp_cycle");
    if(seen[key])return;seen[key]=true;if(graph.length>=100)bad("ame_source_graph_bound");
    var node={id:number(c.id),name:String(c.name),width:number(c.width),height:number(c.height),pixelAspect:number(c.pixelAspect),duration:number(c.duration),frameDuration:number(c.frameDuration),displayStartTime:number(c.displayStartTime),workAreaStart:number(c.workAreaStart),workAreaDuration:number(c.workAreaDuration),layers:rows};graph.push(node);
    if(node.duration<=0||node.frameDuration<=0||node.workAreaStart<0||node.workAreaDuration<=0||node.workAreaStart+node.workAreaDuration>node.duration+0.0000001)bad("ame_source_work_area_invalid");
    var ids={};for(k=1;k<=c.numLayers;k++){
      if(++total>1000)bad("ame_source_layer_bound");l=c.layer(k);if(ids[String(l.id)])bad("ame_source_ambiguous_layer");ids[String(l.id)]=true;s=l.source;
      var av=typeof AVLayer!=="undefined"&&l instanceof AVLayer,kind=typeof CameraLayer!=="undefined"&&l instanceof CameraLayer?"camera":typeof LightLayer!=="undefined"&&l instanceof LightLayer?"light":av?"av":"layer";
      rows.push({id:number(l.id),index:k,name:String(l.name),kind:kind,enabled:bool(l.enabled),solo:bool(l.solo),guideLayer:av?bool(l.guideLayer):optional(l.guideLayer),locked:bool(l.locked),audioEnabled:optional(l.audioEnabled),hasAudio:optional(l.hasAudio),
        startTime:number(l.startTime),inPoint:number(l.inPoint),outPoint:number(l.outPoint),stretch:number(l.stretch),parentId:l.parent?number(l.parent.id):null,
        sourceItemId:s?number(s.id):null,sourceFile:s&&s.file?String(s.file.fsName):null,sourceName:s?String(s.name):null,sourceUseProxy:s?optional(s.useProxy):null,
        hasTrackMatte:optional(l.hasTrackMatte),isTrackMatte:optional(l.isTrackMatte),trackMatteLayerId:l.trackMatteLayer?number(l.trackMatteLayer.id):null,trackMatteType:l.trackMatteType===undefined?null:String(l.trackMatteType),
        threeDLayer:optional(l.threeDLayer),collapseTransformation:optional(l.collapseTransformation),motionBlur:optional(l.motionBlur),timeRemapEnabled:optional(l.timeRemapEnabled)});
      if(s instanceof CompItem)next.push(s);
    }
    for(k=0;k<next.length;k++)walk(next[k],stack.concat([c.id]));
  }
  walk(target,[]);
  return {snapshot:{projectFile:String(app.project.file.fsName),revision:number(app.project.revision),compItemId:a.compItemId,graph:graph},dirty:app.project.dirty,
    guid:String(target.dynamicLinkGUID||""),range:{startSeconds:target.workAreaStart,endSeconds:target.workAreaStart+target.workAreaDuration}};
}
function create(p){
  var slots=$.global.__aeAgentAMEJobSourcesV1;if(!slots){slots={};$.global.__aeAgentAMEJobSourcesV1=slots;}
  if(Object.prototype.hasOwnProperty.call(slots,p.nonce))throw Error("ame_source_native_no_replay");
  var count=0,key;for(key in slots)if(Object.prototype.hasOwnProperty.call(slots,key))count++;
  if(count>=256)throw Error("ame_source_retained_slot_bound");
  var slot={schema:p.schema,nonce:p.nonce,binding:p.binding,runId:p.runId,state:"started",phase:"prepared",ok:false,saved:null,restored:null,error:null};slots[p.nonce]=slot;
  function equal(a,b){return nativeSnapshotDifference(a,b)===null;}
  function bad(c){throw Error(c);}
  function clock(){if(new Date().getTime()>=p.deadline)bad("ame_source_deadline");}
  function pin(f,empty){var v=new File(f.path);if(!v.exists||v.alias||!equal(v.length,f.bytes)||!v.modified||!equal(Math.floor(v.modified.getTime()/1000),Math.floor(f.mtimeMs/1000))||empty&&!equal(v.length,0))bad("ame_source_native_file_changed");}
  function check(o,file,wanted){
    if(!equal(o.dirty,false)||!equal(o.snapshot.projectFile,file))bad("ame_source_native_readback_invalid");
    var s=o.snapshot;s.projectFile=wanted.projectFile;s.revision=wanted.revision;
    if(!equal(s,wanted))bad("ame_source_native_preservation_mismatch");
    if(!/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(o.guid))bad("ame_source_native_guid_unavailable");
  }
  try{
    clock();pin(p.source,false);pin(p.checkpoint,false);pin(p.reservation,true);
    var initial=sourceObserve(p.args);if(!equal(initial,p.before))bad("ame_source_native_baseline_changed");
    if(!equal(initial.dirty,false)||!equal(initial.snapshot.revision,p.args.expectedRevision))bad("ame_source_clean_baseline_required");
    var target=null,i,j,layers=[],patch=p.args.visibilityPatch;
    for(i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===p.args.compItemId)target=app.project.item(i);
    // Validate the entire patch before changing its first layer.
    for(i=0;i<patch.length;i++){for(j=1;j<=target.numLayers;j++)if(equal(target.layer(j).id,patch[i].layerId))layers[i]=target.layer(j);
      if(!layers[i]||!equal(layers[i].enabled,patch[i].expectedEnabled)||layers[i].locked)bad("ame_source_visibility_baseline_changed");}
    clock();sourceRuntimeCheck(p.hashRequest.runtime);if(new Date().getTime()>=p.probeExpiresAt)bad("ame_source_hash_probe_stale");if(p.deadline-new Date().getTime()<p.minimumRemainingMs)bad("ame_source_hash_admission_budget");slot.phase="reserved";
    app.beginUndoGroup("AE Agent: один AME источник");try{
      for(i=0;i<patch.length;i++)layers[i].enabled=patch[i].enabled;
      if(p.args.range){target.workAreaStart=p.args.range.startSeconds;target.workAreaDuration=p.args.range.endSeconds-p.args.range.startSeconds;}
    }finally{app.endUndoGroup();}
    slot.phase="patch_applied";clock();pin(p.source,false);pin(p.checkpoint,false);pin(p.reservation,true);
    slot.phase="save_submitted";app.project.save(new File(p.reservation.path));
    var savedArgs={expectedProjectFile:p.reservation.path,compItemId:p.args.compItemId},saved=sourceObserve(savedArgs);
    check(saved,p.reservation.path,p.wanted);var savedFile=new File(p.reservation.path);if(!savedFile.exists||savedFile.alias||savedFile.length<1||!savedFile.modified)bad("ame_source_saved_file_unverified");
    slot.saved=sourceObserve(savedArgs);slot.phase="hashing_saved_source";slot.savedFile=sourceHashFile(p.hashRequest);slot.phase="saved_verified";
    clock();pin(p.source,false);pin(p.checkpoint,false);slot.phase="restore_submitted";app.open(new File(p.source.path));
    var restored=sourceObserve(p.args);check(restored,p.source.path,p.before.snapshot);
    if(!equal(restored.guid,p.before.guid)||!equal(restored.range,p.before.range))bad("ame_source_restore_identity_changed");
    slot.restored=sourceObserve(p.args);pin(p.source,false);pin(p.checkpoint,false);slot.phase="restored";slot.ok=true;slot.state="terminal";return slot;
  }catch(e){slot.error=String(e.message||e);slot.state="unknown";return slot;}
}
function probe(p){var observed=sourceObserve(p.args);if(observed.dirty!==false)throw Error("ame_source_clean_baseline_required");return {observed:observed,hashProbe:sourceHashFile(p.hashRequest)};}
const literal=v=>JSON.stringify(v).replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
function observeScript(a){return `var sourceObserve=${observe.toString()};return sourceObserve(${literal(a)});`;}
function compareScript(a,before){return `var sourceObserve=${observe.toString()};var nativeSnapshotDifference=${nativeSnapshotDifference.toString()};return {difference:nativeSnapshotDifference(sourceObserve(${literal(a)}),${literal(before)})};`;}
function createScript(p){return `var sourceObserve=${observe.toString()};var sourceRuntimeCheck=${hashing.nativeRuntimeCheck.toString()};var sourceHashFile=${hashing.nativeHash.toString()};var nativeSnapshotDifference=${nativeSnapshotDifference.toString()};var sourceCreate=${create.toString()};return sourceCreate(${literal(p)});`;}
function probeScript(p){return `var sourceObserve=${observe.toString()};var sourceRuntimeCheck=${hashing.nativeRuntimeCheck.toString()};var sourceHashFile=${hashing.nativeHash.toString()};var sourceProbe=${probe.toString()};return sourceProbe(${literal(p)});`;}
function lookupScript(p){return `var slots=$.global.${SLOT};return slots&&Object.prototype.hasOwnProperty.call(slots,${literal(p.nonce)})?slots[${literal(p.nonce)}]:null;`;}
module.exports={SLOT,observe,create,observeScript,compareScript,createScript,lookupScript,probeScript};

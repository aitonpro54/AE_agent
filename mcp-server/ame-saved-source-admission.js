"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {stableStringify}=require("./m100-protocol");
const TOOL="inspect_saved_ame_title_source",SCHEMA="ae-agent-ame-saved-source-admission.v1";
const GUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const same=(a,b)=>String(a).replace(/\\/g,"/").toLowerCase()===String(b).replace(/\\/g,"/").toLowerCase();
const clone=v=>JSON.parse(JSON.stringify(v));
function fail(code){throw Object.assign(Error(code),{code});}
function object(v,keys){if(!v||typeof v!=="object"||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail("ame_saved_source_invalid_input");}
function local(v){
  if(typeof v!=="string"||!v||v!==v.trim()||v.length>4096||/[\x00-\x1f\x7f]/.test(v)||!path.isAbsolute(v)||/^(\\\\|\/\/)/.test(v)||v.replace(/\\/g,"/").split("/").some(s=>s==="."||s==="..")||process.platform==="win32"&&/:/.test(v.slice(2)))fail("ame_saved_source_local_path_required");
  return path.resolve(v);
}
function validateInput(raw){
  object(raw,["expectedProjectFile","expectedRevision","comps"]);
  const a={expectedProjectFile:local(raw.expectedProjectFile),expectedRevision:raw.expectedRevision};
  if(path.extname(a.expectedProjectFile).toLowerCase()!==".aep"||!Number.isSafeInteger(a.expectedRevision)||a.expectedRevision<0)fail("ame_saved_source_baseline_required");
  if(!Array.isArray(raw.comps)||raw.comps.length<1||raw.comps.length>64)fail("ame_saved_source_manifest_bound");
  const ids=new Set();a.comps=raw.comps.map(c=>{object(c,["compItemId","expectedName"]);
    if(!Number.isSafeInteger(c.compItemId)||c.compItemId<1||ids.has(c.compItemId)||typeof c.expectedName!=="string"||!c.expectedName||c.expectedName.length>512||/[\x00-\x1f\x7f]/.test(c.expectedName))fail("ame_saved_source_exact_comp_required");
    ids.add(c.compItemId);return {compItemId:c.compItemId,expectedName:c.expectedName};});return a;
}
// Same bounded Node file/pin policy as the saved-source executors. No JSX hash,
// save, alias traversal, command worker, output file or durable authority.
function parents(dir){const rows=[];for(let p=local(dir);;p=path.dirname(p)){const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||!same(fs.realpathSync(p),p))fail("ame_saved_source_directory_alias");rows.push({path:p,device:String(s.dev),inode:String(s.ino)});if(path.dirname(p)===p)return rows;}}
function filePin(file){
  file=local(file);const directories=parents(path.dirname(file)),before=fs.lstatSync(file);
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.ino===0||!same(fs.realpathSync(file),file)||before.size<1||before.size>1024*1024*1024)fail("ame_saved_source_file_identity_invalid");
  const fd=fs.openSync(file,"r"),sha=crypto.createHash("sha256"),buffer=Buffer.alloc(512*1024);let bytes=0,count;
  try{const held=fs.fstatSync(fd);if(held.dev!==before.dev||held.ino!==before.ino)fail("ame_saved_source_file_changed");while((count=fs.readSync(fd,buffer,0,buffer.length,null))){bytes+=count;if(bytes>1024*1024*1024)fail("ame_saved_source_file_bound");sha.update(buffer.subarray(0,count));}}finally{fs.closeSync(fd);}
  const after=fs.lstatSync(file);
  if(!after.isFile()||after.isSymbolicLink()||after.nlink!==1||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||bytes!==after.size||!same(fs.realpathSync(file),file)||stableStringify(directories)!==stableStringify(parents(path.dirname(file))))fail("ame_saved_source_file_changed");
  return {path:file,sha25664:sha.digest("hex"),bytes,mtimeMs:after.mtimeMs,ctimeMs:after.ctimeMs,device:String(after.dev),inode:String(after.ino),parents:directories};
}
// Fixed, bounded, read-only ES3 program. The same implementation also guards
// the AE sender immediately before BridgeTalk construction/send.
function nativeObserve(a){
  function bad(c){throw Error(c);}
  function norm(v){return String(v||"").replace(/\\/g,"/").toLowerCase();}
  var project=app.project;
  function check(){if(!project||app.project!==project||!project.file||norm(project.file.fsName)!==norm(a.expectedProjectFile)||project.dirty!==false||project.revision!==a.expectedRevision||project.renderQueue.rendering)bad("ame_saved_source_native_baseline_changed");}
  check();var rows=[],seen={},i,j,comp,guid;
  for(i=0;i<a.comps.length;i++){
    comp=null;for(j=1;j<=project.numItems;j++)if(project.item(j).id===a.comps[i].compItemId){if(comp)bad("ame_saved_source_native_comp_ambiguous");comp=project.item(j);}
    if(!(comp instanceof CompItem)||comp.name!==a.comps[i].expectedName)bad("ame_saved_source_native_comp_changed");
    guid=comp.dynamicLinkGUID;if(typeof guid!=="string"||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(guid)||/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(guid)||seen[guid.toLowerCase()])bad("ame_saved_source_native_guid_invalid");seen[guid.toLowerCase()]=true;
    if(typeof comp.duration!=="number"||!isFinite(comp.duration)||comp.duration<=0||typeof comp.workAreaStart!=="number"||!isFinite(comp.workAreaStart)||comp.workAreaStart<0||typeof comp.workAreaDuration!=="number"||!isFinite(comp.workAreaDuration)||comp.workAreaDuration<=0||comp.workAreaStart+comp.workAreaDuration>comp.duration+0.0000001)bad("ame_saved_source_native_range_invalid");
    rows.push({compItemId:comp.id,name:String(comp.name),dynamicLinkGUID:guid,duration:comp.duration,workAreaStart:comp.workAreaStart,workAreaDuration:comp.workAreaDuration});
  }
  check();return {projectFile:String(project.file.fsName),revision:project.revision,dirty:false,comps:rows};
}
function nativeGuard(binding){
  // AE's JSON number rendering rounds sub-frame doubles during admission.
  function sameTiming(a,b){return typeof a==="number"&&typeof b==="number"&&isFinite(a)&&isFinite(b)&&Math.abs(a-b)<=0.0000001;}
  var actual=sourceObserve(binding.args),wanted=binding.observed;
  if(actual.projectFile!==wanted.projectFile||actual.revision!==wanted.revision||actual.comps.length!==wanted.comps.length)throw Error("ame_saved_source_native_guard_changed");
  for(var i=0;i<actual.comps.length;i++){var a=actual.comps[i],b=wanted.comps[i];if(a.compItemId!==b.compItemId||a.name!==b.name||a.dynamicLinkGUID!==b.dynamicLinkGUID||!sameTiming(a.duration,b.duration)||!sameTiming(a.workAreaStart,b.workAreaStart)||!sameTiming(a.workAreaDuration,b.workAreaDuration))throw Error("ame_saved_source_native_guard_changed");}
  var file=new File(binding.file.path);if(!file.exists||file.alias||file.length!==binding.file.bytes||!file.modified||Math.floor(file.modified.getTime()/1000)!==Math.floor(binding.file.mtimeMs/1000))throw Error("ame_saved_source_native_file_changed");
}
const literal=v=>JSON.stringify(v).replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
function observeScript(a){return "var sourceObserve="+nativeObserve.toString()+";return sourceObserve("+literal(a)+");";}
function guardScript(binding){return "var sourceObserve="+nativeObserve.toString()+";var sourceGuard="+nativeGuard.toString()+";sourceGuard("+literal(binding)+");";}
function validateObservation(o,a){
  if(!o||o.dirty!==false||!same(o.projectFile,a.expectedProjectFile)||o.revision!==a.expectedRevision||!Array.isArray(o.comps)||o.comps.length!==a.comps.length)fail("ame_saved_source_native_observation_invalid");
  const guids=new Set();for(let i=0;i<a.comps.length;i++){const c=o.comps[i],wanted=a.comps[i];if(!c||c.compItemId!==wanted.compItemId||c.name!==wanted.expectedName||!GUID.test(c.dynamicLinkGUID||"")||/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(c.dynamicLinkGUID)||guids.has(c.dynamicLinkGUID.toLowerCase())||!Number.isFinite(c.duration)||c.duration<=0||!Number.isFinite(c.workAreaStart)||c.workAreaStart<0||!Number.isFinite(c.workAreaDuration)||c.workAreaDuration<=0||c.workAreaStart+c.workAreaDuration>c.duration+1e-7)fail("ame_saved_source_native_observation_invalid");guids.add(c.dynamicLinkGUID.toLowerCase());}return clone(o);
}
function createAdmission(deps){
  if(!deps||["readNative","captureActor","assertReady"].some(k=>typeof deps[k]!=="function"))fail("ame_saved_source_dependencies_required");
  const sources=new Map(),caps=new WeakMap();let busy=false;
  const key=file=>local(file).toLowerCase();
  function ready(context){const v=deps.assertReady(context);if(v===false||v&&typeof v.then==="function"){if(v&&typeof v.catch==="function")v.catch(()=>{});fail("ame_saved_source_synchronous_readiness_required");}}
  function actor(){const v=deps.captureActor();if(!v||typeof v!=="object"||Array.isArray(v)||typeof v.then==="function"||!Object.keys(v).length)fail("ame_saved_source_actor_required");return stableStringify(v);}
  function current(row,context){ready(context);if(sources.get(key(row.args.expectedProjectFile))!==row||actor()!==row.actor)fail("ame_saved_source_admission_stale");if(stableStringify(filePin(row.pin.path))!==stableStringify(row.pin))fail("ame_saved_source_file_changed");}
  async function sample(a,context){
    ready(context);const beforeActor=actor(),pin=filePin(a.expectedProjectFile),r=await deps.readNative(observeScript(a)),observed=validateObservation(r?.result??r,a);
    ready(context);if(actor()!==beforeActor||stableStringify(filePin(pin.path))!==stableStringify(pin))fail("ame_saved_source_changed_during_read");return {args:clone(a),pin,observed,actor:beforeActor};
  }
  async function inspect(raw){
    if(busy)fail("ame_saved_source_busy");busy=true;try{const a=validateInput(raw),row=await sample(a);if(!sources.has(key(a.expectedProjectFile))&&sources.size>=16)fail("ame_saved_source_admission_bound");sources.set(key(a.expectedProjectFile),row);
      return {ok:true,schema:SCHEMA,executionAuthority:false,source:{path:row.pin.path,sha25664:row.pin.sha25664,bytes:row.pin.bytes},project:clone(row.observed),requiresExactAmeGuid:true,sourceRetentionRequired:true,mediaVerified:false};
    }finally{busy=false;}
  }
  function hasSource(file){try{return sources.has(key(file));}catch(_){return false;}}
  async function prepare(selector,context){
    if(busy)fail("ame_saved_source_busy");busy=true;try{const row=sources.get(key(selector.sourcePath));if(!row)fail("ame_saved_source_admission_required");current(row,context);
      const comp=row.observed.comps.find(c=>c.dynamicLinkGUID===selector.sourceGuid);
      if(selector.operation!=="enqueue"||selector.sourceSha25664!==row.pin.sha25664||!comp||!Number.isFinite(selector.range?.startSeconds)||selector.range.startSeconds<0||!Number.isFinite(selector.range?.endSeconds)||selector.range.endSeconds<=selector.range.startSeconds||selector.range.endSeconds>comp.duration+1e-7)fail("ame_saved_source_selector_changed");
      const fresh=await sample(row.args,context);if(fresh.actor!==row.actor||stableStringify(fresh.pin)!==stableStringify(row.pin)||stableStringify(fresh.observed)!==stableStringify(row.observed))fail("ame_saved_source_admission_stale");current(row,context);
      const cap=Object.freeze({});caps.set(cap,{row,context,selector:stableStringify(selector),guard:{args:{...clone(row.args),comps:[{compItemId:comp.compItemId,expectedName:comp.name}]},observed:{...clone(row.observed),comps:[clone(comp)]},file:{path:row.pin.path,bytes:row.pin.bytes,mtimeMs:row.pin.mtimeMs}}});return cap;
    }finally{busy=false;}
  }
  function assertPreparation(cap,selector,context){const r=caps.get(cap);if(!r||r.context!==context||r.selector!==stableStringify(selector))fail("ame_saved_source_private_capability_required");current(r.row,context);return true;}
  function getNativeGuard(cap,context){const r=caps.get(cap);if(!r)fail("ame_saved_source_private_capability_required");assertPreparation(cap,JSON.parse(r.selector),context);return clone(r.guard);}
  return Object.freeze({inspect,hasSource,prepare,assertPreparation,getNativeGuard});
}
const tool={name:TOOL,description:"Read one already-saved clean AEP and 1..64 exact composition IDs/names with native Dynamic Link GUIDs/revision and independent Node file SHA/stability checks. Registers only daemon-local private admission; returned JSON grants no execution rights. Never save, create per-title files, enqueue or START. Retain the source unchanged until native consumption/completion is confirmed.",inputSchema:{type:"object",additionalProperties:false,required:["expectedProjectFile","expectedRevision","comps"],properties:{expectedProjectFile:{type:"string"},expectedRevision:{type:"integer",minimum:0},comps:{type:"array",minItems:1,maxItems:64,items:{type:"object",additionalProperties:false,required:["compItemId","expectedName"],properties:{compItemId:{type:"integer",minimum:1},expectedName:{type:"string",minLength:1,maxLength:512}}}}}},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:false}};
module.exports={TOOL,SCHEMA,tool,validateInput,createAdmission,observeScript,guardScript};

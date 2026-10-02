"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {authorizeMaterialPath,streamFileSha256,verifyMontageMaterials}=require("./montage-materials");
const {readNativeLayer,routeEdge}=require("./montage-native");
const {bindPostRunObservation}=require("./montage-run-bindings");
const {normalizeBudgets,normalizePath}=require("./montage-contract");
const {policyHash}=require("./montage-plan-guard");

// Read actual content, then use the existing material verifier to confirm its
// complete bytes/native metadata/path/fd identities. No expected-data fallback.
function readActualMaterial(mp,inventory) {
  const norm=normalizeBudgets(mp.readBudgets);
  if(norm.blockers.length)return null;
  const b=norm.budgets,auth=authorizeMaterialPath({filePath:mp.path,sourceItemId:mp.sourceItemId,inventory});
  if(!auth.authorized || b.materialReadRequests<2)return null;
  let fd;
  try {
    const real=fs.realpathSync(auth.source.file),dir=fs.realpathSync(path.dirname(auth.source.file)),relative=path.relative(dir,real);
    if(relative.startsWith("..") || path.isAbsolute(relative))return null;
    const pre=fs.statSync(real);
    // Two complete reads remain inside the same bounded total-byte scope.
    if(!pre.isFile() || pre.size<1 || pre.size>b.materialFileBytes || pre.size*2>b.materialTotalBytes)return null;
    fd=fs.openSync(real,"r");const opened=fs.fstatSync(fd);
    const same=(a,z)=>["dev","ino","size","mtimeMs","ctimeMs"].every(k=>a[k]===z[k]);
    if(!same(pre,opened))return null;
    const hash=streamFileSha256(fd,b.materialFileBytes),afterFd=fs.fstatSync(fd);
    if(hash.error || hash.exceeded || !hash.sha256 || hash.totalBytes!==pre.size || !same(pre,afterFd) ||
      !same(pre,fs.statSync(real)) || normalizePath(fs.realpathSync(auth.source.file))!==normalizePath(real))return null;
    const src=auth.source,actual={materialId:mp.materialId,sourceItemId:mp.sourceItemId,path:src.file,sha256:hash.sha256,
      byteLength:hash.totalBytes,width:src.width,height:src.height,pixelAspect:src.pixelAspect,duration:src.duration,fps:src.frameRate,
      provenance:mp.provenance};
    const verified=verifyMontageMaterials({preparedMaterials:{schema:"ae-agent-prepared-materials.v1",revision:mp.materialRevision,materials:[actual]},inventory,budgets:b});
    return verified.ok ? verified.verifiedMaterials[0] : null;
  }catch(_) {return null;}finally {if(fd!==undefined)try{fs.closeSync(fd);}catch(_) {}}
}
async function buildPostRunReadBack(record,deps) {
  const mp=record.plan?.montagePipeline,readBack={projects:[],targets:[],materials:[],routes:[]};
  if(!mp)return undefined;
  const unit={unitId:mp.unitId,assignmentIds:mp.assignmentIds || [],kind:"application",dependsOn:[],plan:record.plan,
    contentHash:mp.unitContentHash,expectedReadBack:record.plan.expectedReadBack,verificationBindings:mp.verificationBindings};
  const pending=[];
  const native=deps.readNativeLayer || ((t,s)=>readNativeLayer(t,s,deps.runExtendScriptBody));
  let current,inventory;
  try {
    current=await deps.currentPlaceholderState();
    inventory=await deps.readPlaceholderInventory();
    if(inventory?.complete!==true)inventory=null;
  }catch(_) {inventory=null;}
  if(inventory) {
    const material=(deps.readActualMaterial || readActualMaterial)(mp,inventory);
    if(material)pending.push(["materials",material]);
  }
  try {
    const exp=unit.expectedReadBack;
    const actual=await native({compItemId:exp.compItemId,layerId:exp.layerId},null);
    pending.push(["targets",{comp:actual.comp,layer:actual.layer,geometry:actual.geometry,transform:actual.transform,footprint:actual.footprint}]);
  }catch(_) { /* Missing native read stays missing, never becomes desired state. */ }
  try {
    if(!Array.isArray(mp.verificationBindings?.route))throw new Error("route_binding_missing");
    const edges=[];
    for(const edge of mp.verificationBindings.route)edges.push(routeEdge(await native({compItemId:edge.parentCompItemId,layerId:edge.layerId},null)));
    pending.push(["routes",{unitId:mp.unitId,edges}]);
  }catch(_) { /* All edges are mandatory; a partial route is not fresh proof. */ }
  try {
    // Re-read the project binding after native/material observations too.
    current=await deps.currentPlaceholderState();
    if(current?.projectFile && current.state)pending.push(["projects",{unitId:mp.unitId,file:current.projectFile,
      projectKey:current.state.projectKey,revision:current.state.revision,policyHash:policyHash(current.state)}]);
  }catch(_) { /* No current project facts: receipt remains incomplete. */ }
  // This is the actual completion time after all readers, never a fabricated
  // future timestamp. Binding rejects a record whose finishedAt lies later.
  const observedAt=new Date().toISOString();
  for(const [kind,observation] of pending) {
    const bound=bindPostRunObservation({record,unit,project:mp.project,observation,readId:crypto.randomUUID(),observedAt});
    if(bound.ok)readBack[kind].push(bound.observation);
  }
  return readBack;
}
module.exports={buildPostRunReadBack,readActualMaterial};

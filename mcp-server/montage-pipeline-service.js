"use strict";
const {validateBuildMontagePipelinePlanInput,structuralPreflight} = require("./montage-tools");
const {compileMontagePipeline} = require("./montage-pipeline");
const {verifyMontageMaterials} = require("./montage-materials");
const {buildSourceUsageMap} = require("./placeholder-usage");
const {normalizeProject} = require("./proposal-state");
const {deepClone,inspectPayloadSafety} = require("./montage-contract");
const {readNativeLayer,routeEdge,narrowFootprintScript,defaultFootprintReader,equal} = require("./montage-native");
const {policyHash} = require("./montage-plan-guard");

const blocked = (blockers,budgets,compilation) => ({ok:false,readiness:"blocked",schema:"ae-agent-montage-compilation.v1",
  previewLocal:true,mutatesProject:false,requiresFreshEvidenceReview:true,units:[],reviewPackets:[],affectedScenes:[],
  blockers,budgets,...(compilation ? {compilation}: {})});
function error(code) {const e=new Error(code);e.code=code;throw e;}
function projectMatches(current,expected) {
  return current?.projectFile && normalizeProject(current.projectFile)===normalizeProject(expected.projectFile) &&
    current.state?.projectKey===expected.projectKey && current.state.revision===expected.revision;
}
function inventoryBounds(inv,b) {
  if(inv?.complete!==true || !Array.isArray(inv.comps) || !Array.isArray(inv.sources) || inv.comps.length>200 || inv.sources.length>1000 || inv.comps.length+inv.sources.length>2000)error("incomplete_inventory");
  const layers=inv.comps.reduce((n,c)=>n+(Array.isArray(c.layers)?c.layers.length:5001),0);
  if(layers>5000 || layers+inv.comps.length+inv.sources.length>b.graphNodes)error("inventory_bounds_exceeded");
  const s=inspectPayloadSafety(inv,b.snapshotBytes);
  if(s.invalid || s.exceeded || s.depthExceeded || s.cycleDetected)error("inventory_payload_exceeds_budget");
}
function nativeDependencyScope(manifest,inventory,targets) {
  const comps=new Map(inventory.comps.map(c=>[c.itemId,c])),sourceIds=new Set(),targetKeys=new Set();
  for(const a of manifest.assignments) {
    const layer=comps.get(a.target.compItemId)?.layers.find(l=>l.id===a.target.layerId);
    if(!layer)error("target_not_in_inventory");
    targetKeys.add(`${a.target.compItemId}:${a.target.layerId}`);sourceIds.add(layer.sourceItemId);
  }
  for(const t of targets)sourceIds.add(t.plannedSourceId);
  return {complete:true,rootCompItemIds:[...new Set(manifest.scenes.map(s=>s.rootCompItemId))].sort((a,b)=>a-b),
    targetKeys:[...targetKeys].sort(),sourceItemIds:[...sourceIds].sort((a,b)=>a-b)};
}
function boundedMaterialReader(budgets,verifier=verifyMontageMaterials) {
  let bytes=0,requests=0;
  return async ({preparedMaterials,inventory})=>{
    const verifiedMaterials=[],ids=new Set(),sources=new Set();
    for(const m of preparedMaterials.materials) {
      if(ids.has(m.materialId) || sources.has(m.sourceItemId))return {ok:false,blockers:[{code:"duplicate_material_binding"}]};
      ids.add(m.materialId);sources.add(m.sourceItemId);
    }
    for(const m of preparedMaterials.materials) {
      const remaining=budgets.materialTotalBytes-bytes,remainingRequests=budgets.materialReadRequests-requests;
      if(remainingRequests<1 || remaining<m.byteLength)return {ok:false,blockers:[{code:"material_operation_budget_exhausted"}]};
      requests++;
      // Sequential single-file verification aborts at the first failure. A file
      // growing during hashing cannot consume the remaining budget repeatedly.
      const r=await verifier({preparedMaterials:{...preparedMaterials,materials:[m]},inventory,
        budgets:{...budgets,materialFileBytes:Math.min(budgets.materialFileBytes,remaining),materialTotalBytes:remaining,materialReadRequests:remainingRequests}});
      if(!r.ok || r.verified!==true)return r;
      bytes+=r.verifiedMaterials[0].byteLength;verifiedMaterials.push(r.verifiedMaterials[0]);
    }
    return {ok:true,verified:true,verifiedMaterials,catalogRevision:preparedMaterials.revision};
  };
}
async function buildMontagePipelinePlan(input,deps={}) {
  const initial=validateBuildMontagePipelinePlanInput(input);
  if(!initial.ok)return {...blocked([{code:initial.code,path:"input",message:initial.error}]),code:initial.code,error:initial.error};
  const preflight=structuralPreflight(input),budgets=preflight.budgets;
  if(!preflight.ok)return blocked(preflight.blockers,budgets);
  try {
    const required=name=>{if(typeof deps[name]!=="function")error(`montage_required_dependency_${name}`);return deps[name];};
    const projectInfo=await required("getProjectInfo")();
    const current=await required("currentPlaceholderState")();
    const validate=required("validateAgentPlanWithRepair"),guard=required("guardPlaceholderPlan");
    const inventoryReader=required("readPlaceholderInventory");
    if(!projectInfo?.file || normalizeProject(projectInfo.file)!==normalizeProject(current.projectFile) || !projectMatches(current,input.manifest.project))error("project_binding_changed");
    const native=deps.readNativeLayer || ((t,id)=>readNativeLayer(t,id,deps.runExtendScriptBody));
    const baselinePolicy=policyHash(current.state),inventory=await inventoryReader();
    inventoryBounds(inventory,budgets);
    if(normalizeProject(inventory.projectFile)!==normalizeProject(current.projectFile))error("inventory_project_changed");
    const materialReader=boundedMaterialReader(budgets,deps.verifyMontageMaterials || verifyMontageMaterials);
    const verified=await materialReader({preparedMaterials:input.preparedMaterials,inventory});
    if(!verified.ok || verified.verified!==true)return blocked(verified.blockers || [{code:"materials_unverified"}],budgets);
    const roots=[...new Set(input.manifest.scenes.map(s=>s.rootCompItemId))].sort((a,b)=>a-b).map(compItemId=>({compItemId}));
    const usage=(deps.buildSourceUsageMap || buildSourceUsageMap)({inventory,roots,groupMappings:current.state.groupMappings,maxNodes:budgets.graphNodes});
    if(!usage.ok || usage.complete!==true)error("incomplete_native_usage");
    const targets=[],sceneMap=new Map(input.manifest.scenes.map(s=>[s.sceneId,s])),matMap=new Map(input.preparedMaterials.materials.map(m=>[m.materialId,m]));
    for(const a of input.manifest.assignments) {
      const mat=matMap.get(a.materialId),scene=sceneMap.get(a.sceneId);
      if(!mat || !scene)error("unresolved_assignment");
      const read=await native(a.target,mat.sourceItemId),route=[];
      let parent=scene.rootCompItemId;
      for(const id of a.routeLayerIds) {
        const edge=routeEdge(await native({compItemId:parent,layerId:id},null));route.push(edge);parent=edge.childCompItemId;
      }
      // Returned readiness requires the actual protection guard for every unit.
      targets.push({target:deepClone(a.target),geometry:read.geometry,transform:read.transform,route,
        targetLayer:read.layer,footprint:read.footprint,protection:{checked:true,ok:true,policyHash:baselinePolicy},plannedSourceId:mat.sourceItemId});
    }
    const observations={schema:"ae-agent-montage-observations.v1",observedAt:new Date().toISOString(),project:{projectFile:current.projectFile,projectKey:current.state.projectKey,revision:current.state.revision},
      inventory,usage,targets:targets.map(({plannedSourceId,...t})=>t),materials:verified.verifiedMaterials,
      dependencyScope:nativeDependencyScope(input.manifest,inventory,targets)};
    const compilation=(deps.compileMontagePipeline || compileMontagePipeline)({manifest:input.manifest,materials:input.preparedMaterials,observations,budgets});
    if(!compilation.ok)return blocked(compilation.blockers,budgets,compilation);
    // Only preview usage sees simulated predecessor releases. All other guards
    // always read native current state. Execution never receives this option.
    const previewInventory=deepClone(inventory);
    const previewMaterials=({preparedMaterials,inventory:currentInventory})=>{
      const result=[];
      for(const m of preparedMaterials.materials) {
        const original=input.preparedMaterials.materials.find(row=>row.materialId===m.materialId),fact=verified.verifiedMaterials.find(row=>row.materialId===m.materialId);
        const initialSource=inventory.sources.find(row=>row.itemId===m.sourceItemId),currentSource=currentInventory.sources.find(row=>row.itemId===m.sourceItemId);
        if(!equal(m,original) || !fact || !equal(initialSource,currentSource))return {ok:false};
        result.push(fact);
      }
      return {ok:true,verified:true,verifiedMaterials:result};
    };
    for(const unit of compilation.units) {
      const prepared=await validate(unit.plan,null,{}, {repairPlan:false});
      if(prepared.validation?.ok!==true || !equal(prepared.plan,unit.plan))error("unit_plan_validation_failed");
      await guard(unit.plan,{montagePreviewInventory:deepClone(previewInventory),montageVerifyMaterials:previewMaterials});
      for(const step of unit.plan.steps) {
        const a=step.args,comp=previewInventory.comps.find(c=>c.itemId===a.expectedCompItemId),layer=comp?.layers.find(l=>l.id===a.expectedLayerId);
        if(!layer)continue;
        if(step.tool==="replace_layer_source")layer.sourceItemId=a.expectedSourceItemId;
        if(step.tool==="set_layer_time_range")for(const k of ["startTime","inPoint","outPoint"])if(a[k]!==undefined)layer[k]=a[k];
      }
    }
    const finalInventory=await inventoryReader();inventoryBounds(finalInventory,budgets);
    if(!equal(finalInventory,inventory))error("native_inventory_changed_during_build");
    for(const t of targets) {
      const actual=await native(t.target,t.plannedSourceId);
      if(!equal(actual.layer,t.targetLayer) || !equal(actual.geometry,t.geometry) || !equal(actual.transform,t.transform) || !equal(actual.footprint,t.footprint))error("native_target_changed_during_build");
      for(const edge of t.route)if(!equal(routeEdge(await native({compItemId:edge.parentCompItemId,layerId:edge.layerId},null)),edge))error("native_route_changed_during_build");
    }
    const finalMaterials=await materialReader({preparedMaterials:input.preparedMaterials,inventory:finalInventory});
    if(!finalMaterials.ok || !equal(finalMaterials.verifiedMaterials,verified.verifiedMaterials))return blocked(finalMaterials.blockers || [{code:"material_changed_during_build"}],budgets);
    const after=await deps.currentPlaceholderState();
    if(!projectMatches(after,input.manifest.project) || policyHash(after.state)!==baselinePolicy)error("project_policy_changed_during_build");
    return {ok:true,readiness:"ready",compilation,previewLocal:true,mutatesProject:false,requiresFreshEvidenceReview:true};
  } catch(e) {return blocked([{code:e.code || "montage_pipeline_service_error",message:e.message}],budgets);}
}
module.exports={buildMontagePipelinePlan,narrowFootprintScript,defaultFootprintReader,nativeDependencyScope,inventoryBounds,projectMatches,boundedMaterialReader};

"use strict";
const {normalizeProject} = require("./proposal-state");
const {computeUnitContentHash} = require("./montage-pipeline");
const {verifyMontageMaterials} = require("./montage-materials");
const {readNativeLayer,routeEdge,equal} = require("./montage-native");
const {sha256,withoutIndices,executionArgsMatch,preciseFacts,completeTransform} = require("./montage-run-bindings");
const {deepClone,inspectPayloadSafety,normalizeBudgets,isPositiveInteger,isSafeId,isSha256,isNonNegativeInteger} = require("./montage-contract");

const policyHash = state => sha256({projectKey:state.projectKey,revision:state.revision,
  constraints:state.constraints ?? null,groupMappings:state.groupMappings ?? [],
  acceptedPlaceholders:(state.acceptedPlaceholders ?? []).map(({acceptedAt,...snapshot})=>snapshot)});
function fail(code) { const e=new Error(code);e.code=code;throw e; }
function materialCatalog(mp) {
  return {schema:"ae-agent-prepared-materials.v1",revision:mp.materialRevision,materials:[{
    materialId:mp.materialId,sourceItemId:mp.sourceItemId,path:mp.path,sha256:mp.sha256,byteLength:mp.byteLength,
    ...mp.metadata,provenance:mp.provenance}]};
}
function assertUnitChain(plan,mp) {
  const b=mp.verificationBindings,e=plan.expectedReadBack,a=mp.intent.assignment,steps=plan.steps;
  if(!Array.isArray(steps) || ![3,4].includes(steps.length) || !e || !equal(a.target,{compItemId:b.target.compItemId,layerId:b.target.layerId}) ||
    !equal(e.rootRange,mp.intent.rootRange) || !equal(e.sourceRange,a.sourceRange) || e.compItemId!==b.target.compItemId || e.layerId!==b.target.layerId ||
    e.sourceItemId!==mp.sourceItemId || e.sourceName!==b.materialSource.name || e.sourceFile!==mp.path || e.layerName!==b.target.layer.name)fail("montage_unit_chain_invalid");
  const tools=steps.length===4 ? ["replace_layer_source","set_layer_time_range","set_layer_transform","get_layer_details"] : ["replace_layer_source","set_layer_time_range","get_layer_details"];
  if(steps.some((s,i)=>s?.tool!==tools[i] || !s.args || typeof s.args!=="object" || Array.isArray(s.args)))fail("montage_unit_chain_invalid");
  const common=["compItemIndex","compName","expectedCompItemId","expectedLayerId","verifyAfter","idempotencyKey","idempotencyScope"];
  const keys={replace_layer_source:[...common,"layerIndices","sourceItemIndex","sourceItemName","sourceItemType","expectedPreviousSourceItemId","expectedSourceItemId"],
    set_layer_time_range:[...common,"layerIndices","startTime","inPoint","outPoint","expectedSourceItemId"],set_layer_transform:[...common,"layerIndex","position","scale"],
    get_layer_details:["compItemIndex","compName","layerIndex","compItemId","layerId","responseView"]};
  for(const step of steps) {
    if(Object.keys(step.args).some(k=>!keys[step.tool].includes(k)))fail("montage_unit_chain_invalid");
    if(step.tool!=="get_layer_details" && (step.args.expectedCompItemId!==b.target.compItemId || step.args.expectedLayerId!==b.target.layerId))fail("montage_unit_chain_invalid");
  }
  const replace=steps[0].args,timing=steps[1].args,read=steps.at(-1).args;
  if(replace.expectedPreviousSourceItemId!==b.target.layer.sourceItemId || replace.expectedSourceItemId!==mp.sourceItemId || replace.sourceItemName!==b.materialSource.name ||
    replace.sourceItemType!=="footage" || timing.expectedSourceItemId!==mp.sourceItemId || read.compItemId!==b.target.compItemId || read.layerId!==b.target.layerId || read.responseView!=="placeholder")fail("montage_unit_chain_invalid");
  let local=[...mp.intent.rootRange];
  for(const edge of b.route)local=local.map(t=>t-edge.startTime);
  const wanted={startTime:local[0]-a.sourceRange[0],inPoint:local[0],outPoint:local[1]};
  if(!preciseFacts(wanted,timing) || !preciseFacts(wanted,e))fail("montage_unit_chain_invalid");
  if(steps.length===4) {
    const transform=steps[2].args,f=plan.placeholderFraming;
    if(!f || !equal(f.target,a.target) || f.sourceItemId!==mp.sourceItemId || !equal(f.geometry,b.target.geometry) || !equal(e.geometry,b.target.geometry) ||
      !preciseFacts({position:e.transform?.position,scale:e.transform?.scale},transform) || !preciseFacts({position:e.transform?.position,scale:e.transform?.scale},f.transform) ||
      !preciseFacts({anchorPoint:b.target.transform.anchorPoint,rotation:b.target.transform.rotation,opacity:b.target.transform.opacity},e.transform))fail("montage_unit_chain_invalid");
  }
}
function expectedTarget(plan,completed=[],validation) {
  const mp=plan.montagePipeline, b=mp.verificationBindings, layer=deepClone(b.target.layer), transform=deepClone(b.target.transform);
  for(const row of completed) {
    // Only the current executor's completed, persisted mutation results can
    // account for an earlier own write. Never infer delivery from an index alone.
    if(row.status!=="completed" || row.mutationResultIsError || !row.mutationResult)continue;
    const step=plan.steps[row.index-1];
    if(!step || !executionArgsMatch(step,row,validation))fail("montage_completed_step_binding_mismatch");
    const a=step.args;
    if(a.expectedCompItemId!==b.target.compItemId || a.expectedLayerId!==b.target.layerId)fail("montage_completed_target_binding_mismatch");
    if(step.tool==="replace_layer_source") {layer.sourceItemId=mp.sourceItemId;layer.source=deepClone(b.materialSource);}
    if(step.tool==="set_layer_time_range")for(const k of ["startTime","inPoint","outPoint"])if(a[k]!==undefined)layer[k]=a[k];
    if(step.tool==="set_layer_transform")for(const k of ["anchorPoint","position","scale","rotation","opacity"])if(a[k]!==undefined)transform[k]=deepClone(a[k]);
  }
  return {layer,transform};
}
async function guardMontagePlan(plan,deps,options={}) {
  const mp=plan.montagePipeline,s=inspectPayloadSafety(mp,262144),b=mp?.verificationBindings;
  if(!mp || s.invalid || s.exceeded || s.depthExceeded || s.cycleDetected || !isSafeId(mp.unitId) ||
    !isPositiveInteger(mp.manifestRevision) || !isPositiveInteger(mp.materialRevision) || !isSafeId(mp.materialId) ||
    !isPositiveInteger(mp.sourceItemId) || !isPositiveInteger(mp.byteLength) || !isSha256(mp.sha256) || !isSha256(mp.unitContentHash) ||
    !isSafeId(mp.project?.projectKey) || !isNonNegativeInteger(mp.project?.revision) || !isSha256(mp.policyHash) ||
    !mp.intent?.assignment || !Array.isArray(mp.intent.rootRange) || !mp.readBudgets || !b?.material || !b?.project || !equal(b.project,mp.project) ||
    !["materialId","sourceItemId","path","sha256","byteLength","metadata","provenance"].every(k=>equal(b.material[k],mp[k])) ||
    !isPositiveInteger(b.target?.compItemId) || !isPositiveInteger(b.target?.layerId) || !b.target.layer?.source ||
    !completeTransform(b.target.transform) || !b.target.geometry || b.target.footprint?.complete!==true ||
    !b.materialSource || !Array.isArray(b.route) || b.route.length>4 || !equal(mp.route,b.route) ||
    b.route.some(e=>![e?.parentCompItemId,e?.childCompItemId,e?.layerId].every(isPositiveInteger) || !completeTransform(e?.transform) || e.footprint?.complete!==true))
    fail("montage_metadata_incomplete");
  assertUnitChain(plan,mp);
  const contentHash=computeUnitContentHash({unitId:mp.unitId,assignment:mp.intent.assignment,rootRange:mp.intent.rootRange,
    material:b.material,crop:mp.intent.assignment.crop,geometry:b.geometry,route:b.route,plan,project:mp.project,
    manifestRevision:mp.manifestRevision,materialRevision:mp.materialRevision});
  if(contentHash!==mp.unitContentHash)fail("montage_unit_content_drift_detected");
  const budget=normalizeBudgets(mp.readBudgets);
  if(budget.blockers.length || mp.byteLength>budget.budgets.materialFileBytes)fail("montage_material_budget_exceeded");
  if(options.montageRunPreflight) {
    const reads=1+plan.steps.filter(s=>s.tool!=="get_layer_details").length;
    if(reads>budget.budgets.materialReadRequests || reads*mp.byteLength>budget.budgets.materialTotalBytes)fail("montage_run_material_budget_exceeded");
  }
  const current=await deps.currentPlaceholderState(),state=current.state;
  if(!current.projectFile || normalizeProject(current.projectFile)!==normalizeProject(mp.project.projectFile))fail("montage_project_drift_detected");
  if(!state || state.projectKey!==mp.project.projectKey || state.revision!==mp.project.revision || policyHash(state)!==mp.policyHash)fail("montage_project_revision_changed");
  const inventory=await deps.readPlaceholderInventory();
  if(inventory?.complete!==true || normalizeProject(inventory.projectFile)!==normalizeProject(current.projectFile))fail("montage_inventory_incomplete");
  const source=inventory.sources.find(s=>s.itemId===mp.sourceItemId);
  if(!source || !["width","height","pixelAspect","duration"].every(k=>source[k]===mp.metadata[k]) || source.frameRate!==mp.metadata.fps)fail("montage_material_metadata_drift_detected");
  // Native path authorization precedes every filesystem call in the verifier.
  const verified=await (deps.verifyMontageMaterials || verifyMontageMaterials)({preparedMaterials:materialCatalog(mp),inventory,budgets:budget.budgets});
  if(!verified.ok)fail("montage_material_drift_detected");
  const native=deps.readNativeLayer || ((t,sid)=>readNativeLayer(t,sid,deps.runExtendScriptBody));
  const actual=await native(b.target,mp.sourceItemId),expected=expectedTarget(plan,options.completedSteps,options.validation);
  if(!equal(actual.footprint,b.target.footprint) || !actual.layer.enabled || actual.layer.locked)fail("montage_target_footprint_drift_detected");
  if(!preciseFacts(withoutIndices(expected.layer),withoutIndices(actual.layer)) || !preciseFacts(expected.transform,actual.transform) ||
    !preciseFacts(b.target.geometry,actual.geometry))fail("montage_target_drift_detected");
  for(const edge of b.route) {
    const fresh=routeEdge(await native({compItemId:edge.parentCompItemId,layerId:edge.layerId},null));
    if(!equal(withoutIndices(fresh),withoutIndices(edge)))fail("montage_route_drift_detected");
  }
  const after=await deps.currentPlaceholderState();
  if(normalizeProject(after.projectFile)!==normalizeProject(current.projectFile) || !after.state || policyHash(after.state)!==mp.policyHash)fail("montage_project_revision_changed");
  return {inventory,actual};
}
module.exports={guardMontagePlan,policyHash,materialCatalog,expectedTarget,assertUnitChain};

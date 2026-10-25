"use strict";

const {deepClone,inspectPayloadSafety,isSafeId,isPositiveInteger,isNonNegativeInteger,isSha256,isAbsolutePath,stableJson} = require("./montage-contract");
const {EPSILON,isGridAligned,isValidStretch,sourceAtRoot} = require("./placeholder-timing");
const SCHEMA = "ae-agent-montage-capture-requirements.v1";
const fail = reason => ({ok:false,reason});

// This is executable intent stored with a server proposal, never native evidence.
function buildCanonicalCaptureRequirements({unitId,assignment,scene,frames,expectedReadBack:e,route,project,
  manifestRevision,materialRevision,manifestHash,materialsHash,policyHash,material} = {}) {
  const input={unitId,assignment,scene,frames,expectedReadBack:e,route,project,manifestRevision,materialRevision,
    manifestHash,materialsHash,policyHash:policyHash ?? null,material};
  const safety=inspectPayloadSafety(input,262144);
  if(safety.invalid || safety.exceeded || safety.cycleDetected || safety.depthExceeded || !isSafeId(unitId) ||
    !isSafeId(assignment?.assignmentId) || !isSafeId(scene?.sceneId) || assignment.sceneId!==scene.sceneId ||
    !isPositiveInteger(scene.rootCompItemId) || !isPositiveInteger(e?.compItemId) || !isPositiveInteger(e?.layerId) ||
    assignment.target?.compItemId!==e.compItemId || assignment.target?.layerId!==e.layerId ||
    ![e.rootRange,e.sourceRange,scene.rootRange].every(r=>Array.isArray(r) && r.length===2 && r.every(Number.isFinite) && r[0]>=0 && r[1]>r[0]) ||
    !Number.isFinite(e.inPoint) || !Number.isFinite(e.outPoint) || e.outPoint<=e.inPoint || !isValidStretch(e.stretch) ||
    e.frameRate!==scene.fps || !e.rootRange.every(t=>isGridAligned(t,scene.fps)) ||
    e.rootRange[0]<scene.rootRange[0] || e.rootRange[1]>scene.rootRange[1] ||
    !Array.isArray(route) || route.length>4 || !Array.isArray(frames) || !frames.length || frames.length>768 ||
    !isAbsolutePath(project?.projectFile) || !isSafeId(project?.projectKey) || !isNonNegativeInteger(project?.revision) ||
    !isPositiveInteger(manifestRevision) || !isPositiveInteger(materialRevision) || !isSha256(manifestHash) || !isSha256(materialsHash) ||
    policyHash!==undefined && policyHash!==null && !isSha256(policyHash) ||
    !isSafeId(material?.materialId) || material.materialId!==assignment.materialId || !isPositiveInteger(material.sourceItemId) ||
    material.sourceItemId!==e.sourceItemId || !isAbsolutePath(material.path) || !isSha256(material.sha256) || !isPositiveInteger(material.byteLength))
    return fail("invalid_canonical_capture_requirements");
  if(route.some((edge,i)=>!isPositiveInteger(edge?.parentCompItemId) || !isPositiveInteger(edge?.childCompItemId) || !isPositiveInteger(edge?.layerId) ||
    edge.stretch!==100 || edge.timeRemapEnabled!==false || !Number.isFinite(edge.startTime) ||
    (i===0 ? edge.parentCompItemId!==scene.rootCompItemId : edge.parentCompItemId!==route[i-1].childCompItemId)) ||
    (route.length ? route.at(-1).childCompItemId!==e.compItemId : scene.rootCompItemId!==e.compItemId) ||
    stableJson(assignment.routeLayerIds)!==stableJson(route.map(edge=>edge.layerId)))return fail("invalid_canonical_capture_route");
  if(stableJson(assignment.sourceRange)!==stableJson(e.sourceRange) ||
    stableJson(assignment.rootRange ?? scene.rootRange)!==stableJson(e.rootRange) ||
    Math.abs((e.sourceRange[1]-e.sourceRange[0])*(e.stretch/100)-(e.rootRange[1]-e.rootRange[0]))>EPSILON ||
    Math.abs(e.outPoint-e.inPoint-(e.rootRange[1]-e.rootRange[0]))>EPSILON)return fail("invalid_canonical_capture_timing");
  const frameIds=new Set(),useFrames=new Set(),normalized=[];
  for(const f of frames) {
    if(!isSafeId(f?.frameId) || frameIds.has(f.frameId) || f.sceneId!==scene.sceneId || f.assignmentId!==assignment.assignmentId ||
      f.compItemId!==e.compItemId || !isNonNegativeInteger(f.rootFrame) || !Number.isFinite(f.rootTime) ||
      Math.abs(f.rootTime-f.rootFrame/scene.fps)>EPSILON || !isGridAligned(f.rootTime,scene.fps) ||
      f.rootTime<e.rootRange[0] || f.rootTime>=e.rootRange[1] || useFrames.has(f.rootFrame) ||
      ![f.roles,f.reasons].every(a=>Array.isArray(a) && a.length>0 && a.every(v=>typeof v==="string" && v.length>0 && v.length<=512) && new Set(a).size===a.length))
      return fail("invalid_canonical_capture_frame");
    const targetTime=e.inPoint+f.rootTime-e.rootRange[0],sourceTime=sourceAtRoot(e.rootRange[0],e.sourceRange[0],f.rootTime,e.stretch);
    let mapped=f.rootTime;
    for(const edge of route)mapped-=edge.startTime;
    if(Math.abs(mapped-targetTime)>EPSILON || targetTime<e.inPoint || targetTime>=e.outPoint || sourceTime<e.sourceRange[0] || sourceTime>=e.sourceRange[1])
      return fail("invalid_canonical_capture_frame_mapping");
    frameIds.add(f.frameId);useFrames.add(f.rootFrame);
    normalized.push({frameId:f.frameId,sceneId:f.sceneId,assignmentId:f.assignmentId,unitId,
      target:{compItemId:e.compItemId,layerId:e.layerId},sourceItemId:e.sourceItemId,rootCompItemId:scene.rootCompItemId,rootFrame:f.rootFrame,
      rootTime:f.rootFrame/scene.fps,targetTime,sourceTime,observedStretch:e.stretch,routeLayerIds:route.map(edge=>edge.layerId),
      roles:[...f.roles].sort(),reasons:[...f.reasons].sort()});
  }
  normalized.sort((a,b)=>a.rootFrame-b.rootFrame || a.frameId.localeCompare(b.frameId));
  return {ok:true,requirements:{schema:SCHEMA,unitId,assignmentId:assignment.assignmentId,sceneId:scene.sceneId,
    project:deepClone(project),manifest:{revision:manifestRevision,sha256:manifestHash},materials:{revision:materialRevision,sha256:materialsHash},
    policy:{projectRevision:project.revision,policyHash:policyHash ?? null},material:deepClone(material),
    rootCompItemId:scene.rootCompItemId,target:{compItemId:e.compItemId,layerId:e.layerId},sceneRange:deepClone(scene.rootRange),
    rootRange:deepClone(e.rootRange),sourceRange:deepClone(e.sourceRange),fps:scene.fps,stretch:e.stretch,
    targetRange:[e.inPoint,e.outPoint],route:deepClone(route),frameRequirements:normalized,
    provenance:{kind:"canonical_application_plan",nativeCaptureRequired:true},completeRootRenderState:false}};
}

// Resolve only a selection from persisted requirements. There is no client time/hash override.
function selectCanonicalCaptureFrames(requirements,selection) {
  const s=inspectPayloadSafety({requirements,selection:selection ?? null},262144);
  if(s.invalid || s.exceeded || s.cycleDetected || s.depthExceeded || requirements?.schema!==SCHEMA ||
    !Array.isArray(requirements.frameRequirements) || !requirements.frameRequirements.length ||
    new Set(requirements.frameRequirements.map(f=>f.frameId)).size!==requirements.frameRequirements.length)
    return fail("missing_canonical_capture_requirements");
  if(selection===undefined)return {ok:true,frames:deepClone(requirements.frameRequirements)};
  if(!Array.isArray(selection) || !selection.length || selection.length>768 || selection.some(id=>!isSafeId(id)) || new Set(selection).size!==selection.length)
    return fail("invalid_canonical_capture_selection");
  const ids=new Set(selection),frames=requirements.frameRequirements.filter(f=>ids.has(f.frameId));
  if(frames.length!==ids.size)return fail("foreign_canonical_capture_frame");
  return {ok:true,frames:deepClone(frames)};
}

function verifyCanonicalCaptureCoverage(requirements,capturedFrames) {
  const selected=selectCanonicalCaptureFrames(requirements);
  if(!selected.ok)return selected;
  const s=inspectPayloadSafety(capturedFrames,262144);
  if(s.invalid || s.exceeded || s.cycleDetected || s.depthExceeded || !Array.isArray(capturedFrames) || capturedFrames.length>768)
    return fail("invalid_canonical_capture_coverage");
  const ids=new Set();
  for(const frame of capturedFrames) {
    if(ids.has(frame?.frameId))return fail("duplicate_canonical_capture_frame");
    ids.add(frame?.frameId);
    const expected=selected.frames.find(f=>f.frameId===frame?.frameId);
    if(!expected || stableJson(frame)!==stableJson(expected))return fail("canonical_capture_frame_mismatch");
  }
  if(selected.frames.some(f=>!ids.has(f.frameId)))return fail("canonical_capture_coverage_incomplete");
  return {ok:true,frames:selected.frames};
}

module.exports={SCHEMA,buildCanonicalCaptureRequirements,selectCanonicalCaptureFrames,verifyCanonicalCaptureCoverage};

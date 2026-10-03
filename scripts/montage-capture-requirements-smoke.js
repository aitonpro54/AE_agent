"use strict";
const assert=require("node:assert/strict");
const {compileMontagePipeline,computeUnitContentHash}=require("../mcp-server/montage-pipeline");
const {buildPerUseRootPackets}=require("../mcp-server/montage-root-png");
const {SCHEMA,buildCanonicalCaptureRequirements,selectCanonicalCaptureFrames,verifyCanonicalCaptureCoverage}=require("../mcp-server/montage-capture-requirements");
const {computeRequiredFrameCoverage}=require("../mcp-server/montage-coverage");
const {createValidMontageFixture,createCropSamples}=require("./montage-fixture");
const {buildSourceUsageMap}=require("../mcp-server/placeholder-usage");
const {deepClone,stableJson}=require("../mcp-server/montage-contract");
let passed=0;
function test(name,action){try{action();passed++;}catch(e){console.error("FAIL "+name);throw e;}}
function compiled(stretch=100){
  const f=createValidMontageFixture();
  if(stretch!==100){
    const a=f.manifest.assignments[0],o=f.observations.targets[0],k=stretch/100;
    f.observations.inventory.comps[1].layers[0].stretch=stretch;o.targetLayer.stretch=stretch;
    f.materials.materials[0].duration=f.observations.inventory.sources[0].duration=o.geometry.source.duration=f.observations.materials[0].metadata.duration=20;
    a.sourceRange=[0,6/k];a.shots.forEach((s,i)=>{s.sourceRange=[i*2/k,(i+1)*2/k];});
    a.crop.samples=createCropSamples(a.sourceRange,[2/k,4/k],30,{stretch,rootRange:a.rootRange});
    f.observations.usage=buildSourceUsageMap({inventory:f.observations.inventory,roots:[{compItemId:100}]});
    f.manifest.frameCoverage=[...computeRequiredFrameCoverage({scenes:f.manifest.scenes,assignments:f.manifest.assignments,fps:30,
      timingByAssignment:new Map([["assign_1",{stretch}],["assign_2",{stretch:100}]])}).values()];
  }
  const c=compileMontagePipeline(f);assert.equal(c.ok,true,JSON.stringify(c.blockers));return {f,c};
}
function builderInput(unit){
  const mp=unit.plan.montagePipeline,req=mp.captureRequirements;
  return {unitId:unit.unitId,assignment:mp.intent.assignment,scene:{sceneId:req.sceneId,rootCompItemId:req.rootCompItemId,rootRange:req.sceneRange,fps:req.fps},
    frames:unit.frameRequirements,expectedReadBack:unit.plan.expectedReadBack,route:mp.route,project:mp.project,
    manifestRevision:mp.manifestRevision,materialRevision:mp.materialRevision,manifestHash:req.manifest.sha256,materialsHash:req.materials.sha256,
    policyHash:mp.policyHash,material:mp.verificationBindings.material};
}
function unitHash(plan){const mp=plan.montagePipeline;return computeUnitContentHash({unitId:mp.unitId,assignment:mp.intent.assignment,rootRange:mp.intent.rootRange,
  material:mp.verificationBindings.material,crop:mp.intent.assignment.crop,geometry:mp.verificationBindings.geometry,route:mp.route,plan,project:mp.project,
  manifestRevision:mp.manifestRevision,materialRevision:mp.materialRevision});}

test("exact canonical frames are persisted before executable unit hash",()=>{
  const {c}=compiled();
  for(const unit of c.units){
    const req=unit.plan.montagePipeline.captureRequirements;assert.equal(req.schema,SCHEMA);assert.equal(req.completeRootRenderState,false);
    assert.equal(req.manifest.sha256,c.manifestHash);assert.equal(req.materials.sha256,c.materialsHash);assert.equal(req.unitId,unit.unitId);
    assert.equal(unitHash(unit.plan),unit.contentHash);assert.equal(req.frameRequirements.length,unit.frameRequirements.length);
    assert.deepEqual(buildCanonicalCaptureRequirements(builderInput(unit)).requirements,req);
    assert(req.frameRequirements.every(f=>f.rootTime<req.rootRange[1] && f.assignmentId===req.assignmentId && f.unitId===req.unitId));
  }
  for(const packet of c.rootPngPackets)for(const frame of packet.frames){
    const unit=c.units.find(u=>u.unitId===frame.unitId),req=unit.plan.montagePipeline.captureRequirements;
    assert.deepEqual(frame,req.frameRequirements.find(f=>f.frameId===frame.frameId));
  }
});
for(const field of ["roles","reasons","targetTime","sourceTime","routeLayerIds","frameId"])
  test(`canonical ${field} tamper changes unit hash`,()=>{
    const {c}=compiled(),p=deepClone(c.units[0].plan),frame=p.montagePipeline.captureRequirements.frameRequirements[0];
    if(Array.isArray(frame[field]))frame[field].push(field==="routeLayerIds"?999:"foreign_requirement");
    else frame[field]=typeof frame[field]==="number"?frame[field]+1:"foreign_frame";
    assert.notEqual(unitHash(p),c.units[0].contentHash);
  });
test("missing legacy requirements cannot become canonical capture",()=>{
  const {c}=compiled();assert.equal(selectCanonicalCaptureFrames(undefined).ok,false);
  const p=deepClone(c.units[0].plan);delete p.montagePipeline.captureRequirements;assert.notEqual(unitHash(p),c.units[0].contentHash);
});
test("server stored selection rejects foreign and duplicate frame IDs",()=>{
  const req=compiled().c.units[0].plan.montagePipeline.captureRequirements,ids=req.frameRequirements.map(f=>f.frameId);
  assert.deepEqual(selectCanonicalCaptureFrames(req).frames,req.frameRequirements);
  assert.deepEqual(selectCanonicalCaptureFrames(req,[ids.at(-1),ids[0]]).frames,[req.frameRequirements[0],req.frameRequirements.at(-1)]);
  assert.equal(selectCanonicalCaptureFrames(req,["foreign_frame"]).ok,false);
  assert.equal(selectCanonicalCaptureFrames(req,[ids[0],ids[0]]).ok,false);
  assert.equal(selectCanonicalCaptureFrames(req,[{frameId:ids[0],sourceTime:1}]).ok,false);
  assert.equal(selectCanonicalCaptureFrames(req,[]).ok,false);
});
test("exact coverage rejects omissions, repeats, wrong time and foreign units",()=>{
  const {c}=compiled(),req=c.units[0].plan.montagePipeline.captureRequirements,frames=deepClone(req.frameRequirements);
  assert.equal(verifyCanonicalCaptureCoverage(req,frames).ok,true);
  assert.equal(verifyCanonicalCaptureCoverage(req,frames.slice(1)).reason,"canonical_capture_coverage_incomplete");
  assert.equal(verifyCanonicalCaptureCoverage(req,[...frames,frames[0]]).reason,"duplicate_canonical_capture_frame");
  for(const change of [f=>f.rootTime+=1/30,f=>f.sourceTime+=1/30,f=>f.unitId="foreign_unit",f=>f.rootFrame++,f=>f.roles.pop(),f=>f.routeLayerIds.push(999)]){
    const altered=deepClone(frames);change(altered[0]);assert.equal(verifyCanonicalCaptureCoverage(req,altered).ok,false);
  }
  assert.equal(verifyCanonicalCaptureCoverage(req,c.units[1].plan.montagePipeline.captureRequirements.frameRequirements).ok,false);
});
test("builder rejects omitted, duplicate, foreign and exclusive outPoint frames",()=>{
  const input=builderInput(compiled().c.units[0]);
  for(const change of [i=>i.frames=[],i=>i.frames.push(deepClone(i.frames[0])),i=>i.frames[0].sceneId="foreign_scene",
    i=>i.frames[0].rootTime=i.expectedReadBack.rootRange[1],i=>i.frames[0].rootTime+=0.01,i=>delete i.frames[0].roles,
    i=>i.route[0].stretch=200,i=>i.route[0].startTime+=1]){
    const altered=deepClone(input);change(altered);assert.equal(buildCanonicalCaptureRequirements(altered).ok,false);
  }
});
test("fractional affine samples survive persist/hash/packet/coverage",()=>{
  for(const stretch of [50,125,200]){
    const {c}=compiled(stretch),u=c.units[0],req=u.plan.montagePipeline.captureRequirements,last=req.frameRequirements.at(-1);
    assert.equal(req.stretch,stretch);assert(Math.abs(last.sourceTime-(179/30)/(stretch/100))<1e-12);assert.equal(unitHash(u.plan),u.contentHash);
    assert.equal(verifyCanonicalCaptureCoverage(req,req.frameRequirements).ok,true);
    assert.equal(stableJson(c.rootPngPackets.flatMap(p=>p.frames).find(f=>f.frameId===last.frameId)),stableJson(last));
  }
});
test("root packet canonical mismatch stays blocked",()=>{
  const {f,c}=compiled(),units=deepClone(c.units);units[0].plan.montagePipeline.captureRequirements.frameRequirements[0].sourceTime+=1;
  const result=buildPerUseRootPackets({reviewPackets:c.reviewPackets,units,manifest:f.manifest});
  assert.equal(result.ok,false);assert.equal(result.blockers[0].code,"canonical_root_packet_frame_mismatch");
});
console.log(`Montage canonical capture requirements smoke: ${passed} offline cases passed.`);

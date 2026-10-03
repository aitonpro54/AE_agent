"use strict";
const {deepClone,inspectPayloadSafety,isPositiveInteger,isNonNegativeInteger,isSafeId,normalizeBudgets}=require("./montage-contract");
const {isValidStretch,isGridAligned,sourceAtRoot,EPSILON}=require("./placeholder-timing");
const {SCHEMA:CAPTURE_REQUIREMENTS_SCHEMA}=require("./montage-capture-requirements");
const ROOT_FRAME_BINDING_SCHEMA="ae-agent-root-frame-binding.v1";
const ROOT_FRAME_BINDING_SCOPE="selected-target-route-root-metadata";
const ROOT_FRESHNESS_BLOCKED=Object.freeze({status:"blocked",code:"unsupported_unknown_render_graph"});
const CAPTURE_BINDING_BLOCKER="missing_canonical_unit_material_capture_binding";
const buildRootFreshness=()=>({...ROOT_FRESHNESS_BLOCKED});

// No canonical unit/material binding exists in the current owner export API.
// Caller hashes/timestamps cannot create one. There is deliberately no hash or
// binding constructor that could turn declarations into native capture proof.
function validateRootCaptureBinding() {return {ok:false,reason:CAPTURE_BINDING_BLOCKER};}

function buildPerUseRootPackets({reviewPackets,units,manifest,budgets}={}) {
  const blocked=code=>({ok:false,packets:[],blockers:[{code}]});
  const input={reviewPackets,units,manifest,budgets:budgets || {}},safe=inspectPayloadSafety(input,4194304);
  if(safe.invalid || safe.exceeded || safe.cycleDetected || safe.depthExceeded)return blocked("invalid_root_packet_scope");
  const norm=normalizeBudgets(budgets);
  if(norm.blockers.length || !Array.isArray(reviewPackets) || !Array.isArray(units) || units.length>norm.budgets.assignments || reviewPackets.length>norm.budgets.frameCoverage)return blocked("invalid_root_packet_scope");
  if(!Array.isArray(manifest?.scenes) || !Array.isArray(manifest?.assignments))return blocked("missing_root_packet_manifest_binding");
  const packets=[];
  for(const packet of reviewPackets) {
    if(!isSafeId(packet.packetId) || !Array.isArray(packet.inputs?.targets) || packet.inputs.targets.length>4 || !Array.isArray(packet.frameIds))return blocked("invalid_root_packet_scope");
    const frames=[];
    for(const request of packet.inputs.targets) {
      const matches=units.filter(u=>u.expectedReadBack?.compItemId===request.target?.compItemId && u.expectedReadBack?.layerId===request.target?.layerId);
      if(matches.length!==1 || !isPositiveInteger(request.rootCompItemId) || !Array.isArray(request.samples) || request.samples.length>24)return blocked("missing_root_packet_unit_binding");
      const unit=matches[0],e=unit.expectedReadBack,stretch=unit.verificationBindings?.target?.layer?.stretch;
      const assignment=manifest.assignments.find(a=>unit.assignmentIds?.includes(a.assignmentId));
      const scene=manifest.scenes.find(s=>s.sceneId===assignment?.sceneId);
      if(!scene || scene.rootCompItemId!==request.rootCompItemId || scene.fps!==e.frameRate)return blocked("missing_root_packet_scene_binding");
      if(!isValidStretch(stretch) || e.stretch!==stretch || !Array.isArray(e.rootRange) || !Array.isArray(e.sourceRange))return blocked("missing_root_packet_timing_binding");
      for(const sample of request.samples) {
        if(!isGridAligned(sample.rootTime,e.frameRate) || !Number.isFinite(sample.targetTime) || !Number.isFinite(sample.sourceTime) ||
          sample.rootTime<e.rootRange[0] || sample.rootTime>=e.rootRange[1] || sample.rootTime<scene.rootRange[0] || sample.rootTime>=scene.rootRange[1])return blocked("invalid_root_packet_frame_mapping");
        const rootFrame=Math.round(sample.rootTime*e.frameRate),sourceTime=sourceAtRoot(e.rootRange[0],e.sourceRange[0],sample.rootTime,stretch);
        const targetTime=e.inPoint+sample.rootTime-e.rootRange[0];
        if(!isNonNegativeInteger(rootFrame) || Math.abs(sourceTime-sample.sourceTime)>EPSILON || Math.abs(targetTime-sample.targetTime)>EPSILON)return blocked("invalid_root_packet_frame_mapping");
        const requirements=(unit.frameRequirements || []).filter(f=>f.rootFrame===rootFrame && packet.frameIds.includes(f.frameId));
        if(!requirements.length || requirements.some(f=>!isSafeId(f.frameId)))return blocked("missing_root_packet_frame_binding");
        for(const f of requirements){
          const canonical=unit.plan?.montagePipeline?.captureRequirements;
          const persisted=canonical?.frameRequirements?.find(row=>row.frameId===f.frameId);
          if(canonical && (canonical.schema!==CAPTURE_REQUIREMENTS_SCHEMA || !persisted || persisted.unitId!==unit.unitId ||
            persisted.rootCompItemId!==request.rootCompItemId || persisted.rootFrame!==rootFrame ||
            Math.abs(persisted.rootTime-sample.rootTime)>EPSILON || Math.abs(persisted.targetTime-sample.targetTime)>EPSILON ||
            Math.abs(persisted.sourceTime-sample.sourceTime)>EPSILON))return blocked("canonical_root_packet_frame_mismatch");
          frames.push(persisted ? deepClone(persisted) : {frameId:f.frameId,sceneId:f.sceneId,assignmentId:f.assignmentId,unitId:unit.unitId,
          target:deepClone(request.target),rootCompItemId:request.rootCompItemId,rootFrame,rootTime:sample.rootTime,targetTime:sample.targetTime,
          sourceTime:sample.sourceTime,observedStretch:stretch,roles:deepClone(f.roles),reasons:deepClone(f.reasons)});
        }
      }
    }
    if(frames.length>24 || packet.frameIds.some(id=>!frames.some(f=>f.frameId===id)))return blocked("root_packet_coverage_incomplete");
    packets.push({packetId:`root_${packet.packetId}`,scope:"per_use_root_frames",builderTool:packet.builderTool,
      inputs:{targets:packet.inputs.targets.map(t=>({...deepClone(t),viewKinds:['root_comp']}))},dependsOn:deepClone(packet.dependsOn),frameIds:deepClone(packet.frameIds),frames,
      requiresFreshBuild:true,completeRootRenderState:false,rootFreshness:buildRootFreshness(),
      captureBinding:{status:"blocked",code:CAPTURE_BINDING_BLOCKER},status:"blocked",replayAllowed:false,reuseAllowed:false,artisticAccepted:false,
      budget:deepClone(packet.budget)});
  }
  return {ok:true,packets,blockers:[]};
}
module.exports={ROOT_FRAME_BINDING_SCHEMA,ROOT_FRAME_BINDING_SCOPE,ROOT_FRESHNESS_BLOCKED,CAPTURE_BINDING_BLOCKER,
  buildRootFreshness,validateRootCaptureBinding,buildPerUseRootPackets};

"use strict";
// Canonical owner/capture adapter. Only the daemon supplies stored records and
// actual native observations; request hashes, times and completion flags have
// no authority here. Readers never reload a source or mutate the project.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {sha256,recordBinding,preciseFacts,withoutIndices}=require("./montage-run-bindings");
const {stableJson,deepClone,normalizeBudgets,normalizePath,isSha256,inspectPayloadSafety}=require("./montage-contract");
const {normalizeProject}=require("./proposal-state");
const {policyHash}=require("./montage-plan-guard");
const {selectCanonicalCaptureFrames,verifyCanonicalCaptureCoverage}=require("./montage-capture-requirements");
const {streamFileSha256}=require("./montage-materials");
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCHEMA="ae-agent-montage-owner-binding.v1",COLLECTION_SCHEMA="ae-agent-montage-owner-bindings.v1",CAPTURE_SCHEMA="ae-agent-montage-native-capture.v1";
function validExecutionBinding(e){return !!e && UUID.test(e.runId || "") && typeof e.actionId==="string" && e.actionId.length>0 && e.actionId.length<=256 &&
 e.actionId.trim()===e.actionId && !/[\u0000-\u001f]/.test(e.actionId) && Number.isSafeInteger(e.proposalRevision) && e.proposalRevision>0 && isSha256(e.planSha256) &&
 Number.isSafeInteger(e.stepIndex) && e.stepIndex>0;}
function fail(code,details){throw Object.assign(new Error(code),{code,details});}
function semanticPolicy(state){return {projectKey:state.projectKey,constraints:state.constraints ?? null,groupMappings:state.groupMappings ?? [],acceptedPlaceholders:(state.acceptedPlaceholders ?? []).map(({acceptedAt,...s})=>s)};}
const semanticPolicyHash=state=>sha256(semanticPolicy(state));
const applications=b=>b?.schema===COLLECTION_SCHEMA ? b.applications : [b];
const projectKeyFor=b=>applications(b)[0]?.requirements?.project?.projectKey;
const foreignOwnersHash=(state,owner,sessionId)=>sha256(Object.fromEntries(Object.entries(state.reviewArtifacts || {}).filter(([id,r])=>id!==owner && (!sessionId || r.captureSession?.sessionId!==sessionId))));
function resolveApplicationRecord(record,state,selection){
 const mp=record?.plan?.montagePipeline,r=record?.run;
 if(!mp?.captureRequirements)fail("missing_canonical_unit_material_capture_binding");
 const unit={unitId:mp.unitId,plan:record.plan,contentHash:mp.unitContentHash,expectedReadBack:record.plan.expectedReadBack};
 const invalid=recordBinding(record,unit,mp.project);if(invalid)fail("canonical_application_"+invalid);
 if(r.ok!==true || r.dryRun!==false || !Number.isFinite(Date.parse(r.finishedAt)) || r.semanticVerification?.status!=="passed" ||
   r.semanticVerification.unverifiedMutationCount>0 || r.steps.length!==record.plan.steps.length ||
   r.steps.some(s=>s.status!=="completed" || s.isError===true))fail("canonical_application_not_successfully_verified");
 const content=require("./montage-pipeline").computeUnitContentHash({unitId:mp.unitId,assignment:mp.intent?.assignment,
   material:{...mp.verificationBindings?.material,...mp.metadata},rootRange:mp.intent?.rootRange,crop:mp.intent?.assignment?.crop,
   geometry:mp.verificationBindings?.target?.geometry,plan:record.plan,project:mp.project,manifestRevision:mp.manifestRevision,
   materialRevision:mp.materialRevision,route:mp.verificationBindings?.route});
 if(content!==mp.unitContentHash || !isSha256(mp.unitContentHash))fail("canonical_unit_hash_mismatch");
 const q=mp.captureRequirements;
 if(q.unitId!==mp.unitId || q.project.projectKey!==mp.project.projectKey || q.project.revision!==mp.project.revision ||
   normalizeProject(q.project.projectFile)!==normalizeProject(mp.project.projectFile) || q.policy.policyHash!==mp.policyHash ||
   q.material.sourceItemId!==mp.sourceItemId || q.material.sha256!==mp.sha256 || q.material.byteLength!==mp.byteLength ||
   normalizePath(q.material.path)!==normalizePath(mp.path))fail("canonical_requirements_run_mismatch");
 if(state && (state.projectKey!==q.project.projectKey || state.revision!==q.project.revision || policyHash(state)!==q.policy.policyHash))fail("canonical_original_policy_revision_changed");
 const selected=selectCanonicalCaptureFrames(q,selection);if(!selected.ok)fail(selected.reason);
 if(selected.frames.length>24)fail("canonical_owner_frame_budget_requires_selection");
 return {schema:SCHEMA,applicationRunId:record.runId,actionId:r.provenance.actionId,proposalRevision:r.provenance.proposalRevision,
   planSha256:r.provenance.planSha256,unitId:mp.unitId,unitContentHash:mp.unitContentHash,requirements:deepClone(q),frames:selected.frames,
   originalPolicy:{revision:q.project.revision,sha256:q.policy.policyHash},completeRootRenderState:false};
}
function resolveApplicationRecords(records,state,selection){
 if(!Array.isArray(records) || !records.length || records.length>4 || new Set(records.map(r=>r?.runId)).size!==records.length)fail("canonical_application_runs_invalid");
 const bound=records.map(r=>resolveApplicationRecord(r,state)),first=bound[0];
 if(bound.some(b=>b.requirements.manifest.sha256!==first.requirements.manifest.sha256 || b.requirements.materials.sha256!==first.requirements.materials.sha256 ||
   stableJson(b.originalPolicy)!==stableJson(first.originalPolicy) || b.requirements.project.projectKey!==first.requirements.project.projectKey || b.requirements.fps!==first.requirements.fps) ||
   new Set(bound.map(b=>b.unitId)).size!==bound.length)fail("canonical_application_set_mismatch");
 const all=bound.flatMap(b=>b.frames);if(new Set(all.map(f=>f.frameId)).size!==all.length)fail("canonical_application_frame_collision");
 if(selection!==undefined && (!Array.isArray(selection) || !selection.length || selection.length>24 || new Set(selection).size!==selection.length || selection.some(id=>!all.some(f=>f.frameId===id))))fail("invalid_canonical_capture_selection");
 const frames=selection===undefined ? all : all.filter(f=>selection.includes(f.frameId));
 return {schema:COLLECTION_SCHEMA,applications:bound,frames,originalPolicy:first.originalPolicy,completeRootRenderState:false};
}
function partitionCaptureBinding(binding){
 const packets=[];let ids=[];
 for(const b of applications(binding)){
  const selected=b.frames.filter(f=>binding.frames.some(s=>s.frameId===f.frameId));if(!selected.length)continue;
  if(selected.length>24)fail("canonical_owner_frame_budget_requires_selection");
  if(ids.length+selected.length>24){packets.push(ids);ids=[];}ids.push(...selected.map(f=>f.frameId));
 }
 if(ids.length)packets.push(ids);return packets;
}
function canonicalReviewInput(binding){
 return {targets:applications(binding).map(b=>({rootCompItemId:b.requirements.rootCompItemId,target:deepClone(b.requirements.target),
   routeLayerIds:b.requirements.route.map(e=>e.layerId),viewKinds:["root_comp"],samples:b.frames.filter(f=>binding.frames.some(s=>s.frameId===f.frameId)).map(f=>({rootTime:f.rootTime,targetTime:f.targetTime,sourceTime:f.sourceTime,
     roles:f.roles,canonicalFrame:deepClone(f)}))})).filter(t=>t.samples.length)};
}
function createCaptureSession(binding,execution,plan){
 const ids=applications(binding).map(b=>b.applicationRunId).sort(),participants=[];
 for(const [index,step] of (plan?.steps || []).entries())if(step.tool==="create_placeholder_review_comps"){
  const a=step.args,planned=(a.applicationRunIds || (a.applicationRunId ? [a.applicationRunId] : [])).slice().sort();
  if(stableJson(ids)!==stableJson(planned) || !Array.isArray(a.frameIds) || !a.frameIds.length)fail("canonical_capture_session_plan_mismatch");
  participants.push({stepIndex:index+1,frameIds:[...a.frameIds].sort()});
 }
 const all=applications(binding).flatMap(b=>b.frames.map(f=>f.frameId)).sort(),approved=participants.flatMap(p=>p.frameIds).sort();
 if(participants.length>8 || !participants.length || stableJson(all)!==stableJson(approved) || new Set(approved).size!==approved.length ||
   !participants.some(p=>p.stepIndex===execution.stepIndex && stableJson(p.frameIds)===stableJson(binding.frames.map(f=>f.frameId).sort())))fail("canonical_capture_session_coverage_mismatch");
 const identity={runId:execution.runId,actionId:execution.actionId,proposalRevision:execution.proposalRevision,planSha256:execution.planSha256};
 return {schema:"ae-agent-montage-capture-session.v1",sessionId:sha256(identity),execution:identity,
   applicationsSha256:sha256(applications(binding)),participants,creationStepIndex:execution.stepIndex};
}
function sessionPeers(record,state){return record.captureSession ? Object.values(state.reviewArtifacts || {}).filter(r=>r.captureSession?.sessionId===record.captureSession.sessionId) : [];}
function assertSessionCompatibility(record,peer){
 const a=record.captureSession,b=peer.captureSession;
 if(!a || !b || a.sessionId!==b.sessionId || a.applicationsSha256!==b.applicationsSha256 || stableJson(a.execution)!==stableJson(b.execution) ||
   stableJson(a.participants)!==stableJson(b.participants) || stableJson(record.canonicalBinding.originalPolicy)!==stableJson(peer.canonicalBinding.originalPolicy))fail("canonical_capture_session_peer_mismatch");
}
function assertOwnerPolicy(record,state){
 const p=record.capturePolicy,b=record.canonicalBinding;
 if(!b || ![SCHEMA,COLLECTION_SCHEMA].includes(b.schema) || !p || state.projectKey!==projectKeyFor(b) ||
   p.expectedRevision!==state.revision || p.expectedPolicyHash!==policyHash(state) || p.semanticSha256!==semanticPolicyHash(state) ||
   p.foreignOwnersSha256!==foreignOwnersHash(state,record.owner,record.captureSession?.sessionId))fail("canonical_capture_policy_transition_changed");
 for(const peer of sessionPeers(record,state))assertSessionCompatibility(record,peer);
}
function registerOwnerPolicy(record,state){
 const b=record.canonicalBinding;if(!b)return;
 const peers=sessionPeers(record,state);
 if(peers.length){for(const peer of peers){assertSessionCompatibility(record,peer);assertOwnerPolicy(peer,state);}
  if(peers.some(p=>p.captureSession.creationStepIndex===record.captureSession.creationStepIndex))fail("canonical_capture_session_participant_replay");
 }else if(state.revision!==b.originalPolicy.revision || policyHash(state)!==b.originalPolicy.sha256)fail("canonical_original_policy_revision_changed");
 record.capturePolicy={originalRevision:b.originalPolicy.revision,originalPolicyHash:b.originalPolicy.sha256,registeredRevision:state.revision+1,
   expectedRevision:state.revision+1,expectedPolicyHash:policyHash({...state,revision:state.revision+1}),semanticSha256:semanticPolicyHash(state),foreignOwnersSha256:foreignOwnersHash(state,record.owner,record.captureSession?.sessionId)};
 for(const peer of peers){peer.capturePolicy.expectedRevision=state.revision+1;peer.capturePolicy.expectedPolicyHash=policyHash({...state,revision:state.revision+1});}
}
function preflightOwnerRegistration(record,state){
 const peers=sessionPeers(record,state);
 if(peers.length){for(const peer of peers){assertSessionCompatibility(record,peer);assertOwnerPolicy(peer,state);}if(peers.some(p=>p.captureSession.creationStepIndex===record.captureSession.creationStepIndex))fail("canonical_capture_session_participant_replay");}
 else if(state.revision!==record.canonicalBinding.originalPolicy.revision || policyHash(state)!==record.canonicalBinding.originalPolicy.sha256)fail("canonical_original_policy_revision_changed");
}
function advanceOwnerPolicy(record,state){
 assertOwnerPolicy(record,state);record.capturePolicy.expectedRevision=state.revision+1;record.capturePolicy.expectedPolicyHash=policyHash({...state,revision:state.revision+1});
 for(const peer of sessionPeers(record,state)){peer.capturePolicy.expectedRevision=state.revision+1;peer.capturePolicy.expectedPolicyHash=policyHash({...state,revision:state.revision+1});}
}
function bindingForFrame(record,frame){const b=applications(record.canonicalBinding).find(b=>b.unitId===frame?.unitId);if(!b)fail("canonical_capture_unit_missing");return b;}
function frameForItem(record,itemId){
 const item=record.receipt.items.find(i=>i.itemId===itemId),control=record.spec.controls.find(c=>c.name===item?.name);
 if(!control)return null;return record.spec.targets[control.targetIndex].samples[control.sampleIndex].canonicalFrame || null;
}
function validateBindingShape(record){
 if(!record.canonicalBinding)return;
 const b=record.canonicalBinding,p=record.capturePolicy;
 const units=applications(b),selected=units.flatMap(u=>u.frames.filter(f=>b.frames.some(s=>s.frameId===f.frameId)));
 if(![SCHEMA,COLLECTION_SCHEMA].includes(b.schema) || units.length>4 || units.some(u=>u.schema!==SCHEMA || !UUID.test(u.applicationRunId || "") || !isSha256(u.planSha256) || !isSha256(u.unitContentHash) ||
   !selectCanonicalCaptureFrames(u.requirements,u.frames.map(f=>f.frameId)).ok || stableJson(selectCanonicalCaptureFrames(u.requirements,u.frames.map(f=>f.frameId)).frames)!==stableJson(u.frames)) ||
   !Array.isArray(b.frames) || !b.frames.length || b.frames.length>24 || stableJson(selected)!==stableJson(b.frames) ||
   record.spec.controls.some(c=>c.viewKind!=="root_comp") || record.spec.controls.length!==b.frames.length ||
   record.spec.targets.some(t=>t.samples.some(s=>!b.frames.some(f=>stableJson(f)===stableJson(s.canonicalFrame)))) ||
   p && (!Number.isSafeInteger(p.expectedRevision) || !isSha256(p.expectedPolicyHash) || !isSha256(p.semanticSha256) || !isSha256(p.foreignOwnersSha256)))fail("invalid_canonical_review_binding");
 if(record.captureSession){const s=record.captureSession;
  if(s.schema!=="ae-agent-montage-capture-session.v1" || !isSha256(s.sessionId) || s.applicationsSha256!==sha256(units) || !Array.isArray(s.participants) || s.participants.length>8 ||
    !s.participants.some(p=>p.stepIndex===s.creationStepIndex && stableJson(p.frameIds)===stableJson(b.frames.map(f=>f.frameId).sort())))fail("invalid_canonical_capture_session");
 }
}
function assertFreshApplication(binding,record){
 const current=resolveApplicationRecord(record,null,binding.frames.map(f=>f.frameId));
 if(stableJson(current)!==stableJson(binding))fail("canonical_application_record_changed");
}
async function assertFreshTarget(binding,application,deps){
 assertFreshApplication(binding,application);const mp=application.plan.montagePipeline,exp=application.plan.expectedReadBack;
 const actual=await deps.readNativeLayer(exp,null);
 const baseline=mp.verificationBindings.target;
 const expectedLayer={...baseline.layer,sourceItemId:exp.sourceItemId,source:mp.verificationBindings.materialSource,startTime:exp.startTime,inPoint:exp.inPoint,outPoint:exp.outPoint};
 if(!preciseFacts(withoutIndices(expectedLayer),withoutIndices(actual.layer)) || !preciseFacts({...baseline.transform,...exp.transform},actual.transform) ||
   !preciseFacts(exp.geometry,actual.geometry) || stableJson(actual.footprint)!==stableJson(baseline.footprint))fail("canonical_target_final_state_changed");
 const route=[];for(const e of mp.verificationBindings.route)route.push(await deps.readRouteEdge({compItemId:e.parentCompItemId,layerId:e.layerId}));
 if(stableJson(withoutIndices(route))!==stableJson(withoutIndices(mp.verificationBindings.route)))fail("canonical_route_changed");
 return {readId:crypto.randomUUID(),observedAt:new Date().toISOString(),target:actual,route};
}
function readContributingFiles(references,budgetOptions,ledger={bytes:0,requests:0}){
 const norm=normalizeBudgets(budgetOptions);if(norm.blockers.length)fail("canonical_capture_file_budget_invalid");
 const b=norm.budgets;if(!Array.isArray(references) || !references.length || references.length>b.materials)fail("canonical_contributing_file_scope_invalid");
 const ids=new Set(),rows=[];let total=0;
 for(const source of references){
  const itemId=source.sourceItemId ?? source.itemId,file=source.file ?? source.path;
  if(!Number.isSafeInteger(itemId) || itemId<1 || ids.has(itemId) || typeof file!=="string" || !path.isAbsolute(file))fail("canonical_contributing_source_unknown");ids.add(itemId);
  let fd;try{
   const real=fs.realpathSync(file),before=fs.statSync(real);if(!before.isFile() || before.size<1 || before.size>b.materialFileBytes || ledger.bytes+before.size>b.materialTotalBytes || ledger.requests>=b.materialReadRequests)fail("canonical_contributing_file_budget");
   ledger.requests++;
   fd=fs.openSync(real,"r");const identity=s=>Object.fromEntries(["dev","ino","size","mtimeMs","ctimeMs"].map(k=>[k,s[k]])),opened=fs.fstatSync(fd);
   if(stableJson(identity(before))!==stableJson(identity(opened)))fail("canonical_contributing_file_changed");
   const read=streamFileSha256(fd,Math.min(b.materialFileBytes,b.materialTotalBytes-ledger.bytes));ledger.bytes+=read.totalBytes;
   if(read.error || read.exceeded || read.totalBytes!==before.size || !isSha256(read.sha256) || stableJson(identity(before))!==stableJson(identity(fs.fstatSync(fd))) ||
      stableJson(identity(before))!==stableJson(identity(fs.statSync(real))) || fs.realpathSync(file)!==real)fail("canonical_contributing_file_changed");
   total+=read.totalBytes;rows.push({sourceItemId:itemId,file:normalizePath(file),realPath:normalizePath(real),nativeMetadata:deepClone(source),identity:identity(before),sha256:read.sha256,byteLength:read.totalBytes});
  }finally{if(fd!==undefined)fs.closeSync(fd);}
 }
 return rows.sort((a,z)=>a.sourceItemId-z.sourceItemId);
}
function assertMaterialFiles(binding,files){const m=binding.requirements.material,f=files.find(f=>f.sourceItemId===m.sourceItemId);
 if(!f || f.file!==normalizePath(m.path) || f.sha256!==m.sha256 || f.byteLength!==m.byteLength)fail("canonical_material_changed");}
function assertSourceLoadEpochs(files,state){
 // The native decode cache is not proven by disk hashes. Only a separate gated
 // import/reload receipt may establish this; capture cannot invent an epoch.
 for(const file of files){const e=state.sourceLoadEpochs?.[file.sourceItemId];
  if(!e || e.schema!=="ae-agent-native-source-load-epoch.v1" || e.projectKey!==state.projectKey || e.sourceItemId!==file.sourceItemId ||
    normalizePath(e.file)!==file.file || e.sha256!==file.sha256 || e.byteLength!==file.byteLength || !validExecutionBinding(e) || !UUID.test(e.commandId || "") ||
    !UUID.test(e.epochId || "") || !UUID.test(e.runId || "") || !Number.isSafeInteger(e.stepIndex) || e.stepIndex<1 ||
    e.nativeOperation!=="reload" && e.nativeOperation!=="import" || e.independentReadBackVerified!==true || e.ownedUsedInComplete!==true ||
    stableJson(e.fileIdentity)!==stableJson(file.identity))fail("native_source_load_epoch_unproven");
  if(stableJson(e.metadata)!==stableJson(file.nativeMetadata.metadata))fail("native_source_load_metadata_changed");
 }
}
function graphModule(){return require("./montage-root-render");}
function graphOptions(record,itemId){const frame=frameForItem(record,itemId),binding=bindingForFrame(record,frame);return {rootCompItemId:itemId,projectFile:record.receipt.projectFile,projectKey:record.projectKey,fps:binding.requirements.fps};}
function validateGraph(record,itemId,observation){const v=graphModule().validateRootRenderGraph(observation,graphOptions(record,itemId));if(!v.ok)fail("unsupported_unknown_render_graph",v.blockers);return v;}
function assertGraphs(record,itemId,before,after){const v=graphModule().compareRootRenderGraphs(before,after,graphOptions(record,itemId));if(!v.ok)fail("canonical_root_render_state_changed",v.blockers);return v;}
function nativeCaptureParts(record,itemId,before){
 const options={rootCompItemId:itemId,rootTimes:[0],readerId:crypto.randomUUID(),budgets:normalizeBudgets().budgets};
 return {support:graphModule().rootRenderReaderFunctionSource()+"\n"+graphModule().rootRenderCanonicalFactsFunctionSource()+`\nfunction __captureGraphFacts(g){return __codexStringify(aeAgentRootRenderCanonicalFacts(g));}`,
  before:`var __captureGraphBefore=aeAgentReadRootRender(${JSON.stringify(options)});if(__captureGraphFacts(__captureGraphBefore)!==__captureGraphFacts(${JSON.stringify(before)}))throw new Error("canonical_root_changed_before_native_save");`,
  after:`var __captureGraphAfter=aeAgentReadRootRender(${JSON.stringify({...options,readerId:crypto.randomUUID()})});if(__captureGraphFacts(__captureGraphAfter)!==__captureGraphFacts(__captureGraphBefore))throw new Error("canonical_root_changed_during_native_save");`,
  result:"nativeCaptureGraph:{before:__captureGraphBefore,after:__captureGraphAfter},"};
}
async function observeGraph(record,itemId,run){const readerId=crypto.randomUUID(),native=await run(graphModule().nativeRootRenderScript({rootCompItemId:itemId,rootTimes:[0],readerId}));
 if(native?.ok===false || !native?.result)fail("canonical_root_native_read_failed");return native.result;}
function validateCaptureReceipt(record,image){
 const c=image.canonicalCapture;if(!c || c.schema!==CAPTURE_SCHEMA || c.owner!==record.owner || c.itemId!==image.itemId ||
   stableJson(c.application)!==stableJson(bindingForFrame(record,frameForItem(record,image.itemId))) || c.png.sha256!==image.sha256 || c.png.byteLength!==image.byteLength ||
   c.completeRootRenderState!==true || !UUID.test(c.captureId || "") || !UUID.test(c.export.runId || "") || !UUID.test(c.export.commandId || "") ||
   typeof c.export.actionId!=="string" || !c.export.actionId || !Number.isSafeInteger(c.export.proposalRevision) || c.export.proposalRevision<1 ||
   !Number.isSafeInteger(c.export.stepIndex) || c.export.stepIndex<1 || !isSha256(c.export.planSha256) || c.png.pngComplete!==true || c.resolutionFactor?.restored!==true ||
   stableJson(c.resolutionFactor.applied)!=="[1,1]" || stableJson(c.resolutionFactor.before)!==stableJson(c.resolutionFactor.after))fail("invalid_canonical_capture_receipt");
 const frame=frameForItem(record,image.itemId);if(!frame || stableJson(c.frame)!==stableJson(frame))fail("canonical_capture_frame_mismatch");
 validateGraph(record,image.itemId,c.graph.before);assertGraphs(record,image.itemId,c.graph.before,c.graph.after);assertGraphs(record,image.itemId,c.graph.before,c.graph.final);
 const binding=bindingForFrame(record,frame),mapped=graphModule().mapRootRenderSample({...c.graph.before,rootCompItemId:frame.rootCompItemId},{...frame,routeLayerIds:binding.requirements.route.map(e=>e.layerId)});
 if(!mapped.ok || mapped.sourceItemId!==binding.requirements.material.sourceItemId)fail("canonical_capture_native_mapping_mismatch");
 if(stableJson(c.files.before)!==stableJson(c.files.after))fail("canonical_capture_contributing_files_changed");assertMaterialFiles(binding,c.files.before);
}
async function verifyCurrentCaptures(record,state,deps){
 assertOwnerPolicy(record,state);const records=new Map();for(const binding of applications(record.canonicalBinding)){const application=deps.readApplication(binding.applicationRunId);await assertFreshTarget(binding,application,deps);records.set(binding.unitId,application);}
 const captured=[],ledger={bytes:0,requests:0};
 const peers=sessionPeers(record,state),owners=peers.length ? peers : [record];
 for(const owner of owners){assertOwnerPolicy(owner,state);for(const image of owner.images){const frame=frameForItem(owner,image.itemId);if(!frame)continue;
  const application=records.get(frame.unitId);if(!application)fail("canonical_capture_session_foreign_unit");
  const dimensions=require("./placeholder-visual-review").readImage(image,deps.exportRoot),registered=owner.receipt.items.find(i=>i.itemId===image.itemId);
  if(dimensions.width!==registered.width || dimensions.height!==registered.height)fail("canonical_capture_peer_png_dimensions_changed");
  validateCaptureReceipt(owner,image);const now=await observeGraph(owner,image.itemId,deps.run);assertGraphs(owner,image.itemId,image.canonicalCapture.graph.final,now);
  const v=validateGraph(owner,image.itemId,now),files=readContributingFiles(v.sourceReferences,application.plan.montagePipeline.readBudgets,ledger);
  if(stableJson(files)!==stableJson(image.canonicalCapture.files.after))fail("canonical_capture_stale_contributing_file");assertSourceLoadEpochs(files,state);captured.push(frame);
 }}
 const units=applications(record.canonicalBinding).map(binding=>({unitId:binding.unitId,...verifyCanonicalCaptureCoverage(binding.requirements,captured.filter(f=>f.unitId===binding.unitId))}));
 const coverage={ok:units.every(u=>u.ok),units};
 return {ok:true,completeRootRenderState:record.canonicalBinding.frames.every(f=>captured.some(c=>c.frameId===f.frameId)),coverage,artisticAccepted:false};
}
function assertReloadPolicy(records,state,execution){
 const q=records[0]?.plan?.montagePipeline?.captureRequirements;
 if(!q || records.some(r=>stableJson(r.plan?.montagePipeline?.captureRequirements?.policy)!==stableJson(q.policy) ||
   r.plan?.montagePipeline?.captureRequirements?.manifest?.sha256!==q.manifest.sha256 || r.plan?.montagePipeline?.captureRequirements?.materials?.sha256!==q.materials.sha256))fail("native_reload_policy_set_mismatch");
 if(state.revision===q.project.revision && policyHash(state)===q.policy.policyHash)return;
 const previous=Object.values(state.sourceLoadEpochs || {}).filter(e=>e.runId===execution?.runId && e.actionId===execution?.actionId && e.planSha256===execution?.planSha256 && e.proposalRevision===execution?.proposalRevision);
 const last=previous.find(e=>e.policyTransition?.toRevision===state.revision);
 if(!last || last.policyTransition.originalRevision!==q.project.revision || last.policyTransition.originalPolicyHash!==q.policy.policyHash ||
   last.policyTransition.manifestHash!==q.manifest.sha256 || last.policyTransition.materialsHash!==q.materials.sha256 ||
   last.policyTransition.policyHashAfter!==policyHash(state) || last.policyTransition.semanticSha256!==semanticPolicyHash(state) ||
   last.policyTransition.reviewOwnersHash!==sha256(state.reviewArtifacts || {}) || previous.some(e=>e.stepIndex>=execution.stepIndex))fail("native_reload_policy_revision_changed");
 for(const e of previous)validateLoadEpoch(e,state);
}
function resolveReloadScope(records,state,sourceItemId,inventory,execution){
 if(!Array.isArray(records) || !records.length || records.length>32 || !inventory || inventory.complete!==true || new Set(records.map(r=>r.runId)).size!==records.length)fail("native_reload_scope_invalid");
 assertReloadPolicy(records,state,execution);
 const bindings=records.map(r=>resolveApplicationRecord(r,null,[r.plan?.montagePipeline?.captureRequirements?.frameRequirements?.[0]?.frameId]));
 if(bindings.some(b=>b.requirements.material.sourceItemId!==sourceItemId))fail("native_reload_source_binding_mismatch");
 const material=bindings[0].requirements.material;
 if(bindings.some(b=>stableJson(b.requirements.material)!==stableJson(material)))fail("native_reload_material_binding_mismatch");
 const owned=bindings.map(b=>b.requirements.target),keys=new Set(owned.map(t=>t.compItemId+":"+t.layerId));
 if(keys.size!==owned.length)fail("native_reload_duplicate_consumer");
 const source=inventory.sources.find(s=>s.itemId===sourceItemId);
 if(!source || source.type!=="footage" || source.hasVideo!==true || source.footageMissing!==false || normalizePath(source.file)!==normalizePath(material.path))fail("native_reload_source_unavailable");
 const actual=[];for(const c of inventory.comps)for(const l of c.layers)if(l.sourceItemId===sourceItemId)actual.push({compItemId:c.itemId,layerId:l.id});
 if(actual.length!==owned.length || actual.some(t=>!keys.has(t.compItemId+":"+t.layerId)))fail("native_reload_foreign_or_shared_consumer");
 return {projectKey:state.projectKey,projectFile:bindings[0].requirements.project.projectFile,sourceItemId,material,ownedTargets:owned,applicationRunIds:records.map(r=>r.runId).sort()};
}
function nativeSourceScopeScript(scope,{reload=false,readerId=crypto.randomUUID()}={}){
 return `var scope=${JSON.stringify(scope)},readerId=${JSON.stringify(readerId)};
 function np(p){return String(p).replace(/\\\\/g,"/").toLowerCase();}
 if(!app.project || !app.project.file || np(app.project.file.fsName)!==np(scope.projectFile))throw new Error("native_reload_project_changed");
 if(app.project.numItems>2000)throw new Error("native_reload_item_budget");
 var source=null;for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===scope.sourceItemId)source=app.project.item(i);
 if(!source || !(source instanceof FootageItem) || !source.file || !(source.mainSource instanceof FileSource) || source.footageMissing!==false || source.hasVideo!==true || source.mainSource.isStill!==false || source.useProxy!==false || !source.mainSource.file || np(source.file.fsName)!==np(scope.material.path) || np(source.mainSource.file.fsName)!==np(scope.material.path))throw new Error("native_reload_source_changed_or_unsupported");
 function read(){var used=source.usedIn;if(!(used instanceof Array) || used.length>200)throw new Error("native_reload_used_in_unknown");var targets=[];
  for(var p=0;p<used.length;p++){var c=null;for(var ci=1;ci<=app.project.numItems;ci++)if(app.project.item(ci).id===used[p].id)c=app.project.item(ci);if(!c || !(c instanceof CompItem)||c.numLayers>5000)throw new Error("native_reload_used_in_unsupported");for(var l=1;l<=c.numLayers;l++){var a=c.layer(l);if(a.source && a.source.id===source.id)targets.push({compItemId:c.id,layerId:a.id});}}
  if(targets.length!==scope.ownedTargets.length)throw new Error("native_reload_foreign_or_shared_consumer");
  for(var t=0;t<targets.length;t++){var found=false;for(var o=0;o<scope.ownedTargets.length;o++)if(targets[t].compItemId===scope.ownedTargets[o].compItemId && targets[t].layerId===scope.ownedTargets[o].layerId)found=true;if(!found)throw new Error("native_reload_foreign_or_shared_consumer");}
  return {sourceItemId:source.id,file:source.file.fsName,mainSourceFile:source.mainSource.file.fsName,name:source.name,width:source.width,height:source.height,pixelAspect:source.pixelAspect,duration:source.duration,fps:source.frameRate,footageMissing:source.footageMissing,hasVideo:source.hasVideo,isStill:source.mainSource.isStill,useProxy:source.useProxy,ownedTargets:targets};}
 var before=read();
 ${reload ? 'if(typeof source.mainSource.reload!=="function")throw new Error("native_source_reload_unavailable");source.mainSource.reload();' : ''}
 var after=read();return {nativeReload:{schema:"ae-agent-native-source-reload.v1",readerId:readerId,operationExecuted:${reload},before:before,after:after}};`;
}
function sourceFileReference(scope,native){
 const n=native?.nativeReload?.after,m=scope.material;
 if(!n || n.sourceItemId!==scope.sourceItemId || normalizePath(n.file)!==normalizePath(m.path) || n.footageMissing!==false || n.hasVideo!==true || n.isStill!==false || n.useProxy!==false ||
   !preciseFacts(m.metadata || {width:m.width,height:m.height,pixelAspect:m.pixelAspect,duration:m.duration,fps:m.fps},n))fail("native_reload_metadata_unproven");
 return {sourceItemId:n.sourceItemId,file:n.file,metadata:{width:n.width,height:n.height,pixelAspect:n.pixelAspect,duration:n.duration,fps:n.fps}};
}
function validateLoadEpoch(e,state){
 if(!e || e.schema!=="ae-agent-native-source-load-epoch.v1" || e.projectKey!==state.projectKey || !UUID.test(e.commandId || "") || !UUID.test(e.epochId || "") ||
   !validExecutionBinding(e) || !isSha256(e.sha256) || !Number.isSafeInteger(e.byteLength) || e.byteLength<1 ||
   e.nativeOperation!=="reload" || e.independentReadBackVerified!==true || e.ownedUsedInComplete!==true || !e.scope || e.scope.sourceItemId!==e.sourceItemId ||
   !e.nativeBracket || e.nativeBracket.nativeReload?.operationExecuted!==true || !e.independentNativeRead || e.independentNativeRead.nativeReload?.operationExecuted!==false ||
   stableJson(e.nativeBracket.nativeReload.before)!==stableJson(e.nativeBracket.nativeReload.after) || stableJson(e.nativeBracket.nativeReload.after)!==stableJson(e.independentNativeRead.nativeReload.after))fail("invalid_native_source_load_epoch");
}
function nativeRootProbeScript(rootCompItemId,rootTimes){
 if(!Number.isSafeInteger(rootCompItemId) || rootCompItemId<1 || !Array.isArray(rootTimes) || !rootTimes.length || rootTimes.length>24 ||
   rootTimes.some(t=>typeof t!=="number" || !Number.isFinite(t) || t<0) || new Set(rootTimes).size!==rootTimes.length)fail("invalid_native_root_probe_intent");
 const emitted=graphModule().nativeRootRenderProbeScript({rootCompItemId,rootTimes,readerId:crypto.randomUUID()});
 return `var revisionBefore=app.project.revision,colorManagementBefore=app.project.colorManagementSystem;
 var graph=(function(){${emitted}})();
 var revisionAfter=app.project.revision,colorManagementAfter=app.project.colorManagementSystem;
 var blockers=[];for(var b=0;b<graph.blockers.length;b++)if(String(graph.blockers[b].path).indexOf("nativeRenderState")===0)blockers.push(graph.blockers[b]);
 if(typeof revisionBefore!=="number" || revisionBefore!==revisionAfter)blockers.push({code:"native_project_revision_unknown_or_changed"});
 if(colorManagementBefore===undefined || colorManagementBefore!==colorManagementAfter)blockers.push({code:"native_color_management_unknown_or_changed"});
 return {schema:"ae-agent-montage-root-render-probe.v1",graph:graph,nativeGUID:{state:graph.nativeRenderState || null,blockers:blockers,complete:!!graph.nativeRenderState && graph.nativeRenderState.complete===true && blockers.length===0},
  nativeProject:{revisionBefore:revisionBefore,revisionAfter:revisionAfter,colorManagementBefore:colorManagementBefore,colorManagementAfter:colorManagementAfter},completeRootRenderState:false,artisticAccepted:false};`;
}
module.exports={SCHEMA,COLLECTION_SCHEMA,CAPTURE_SCHEMA,applications,bindingForFrame,resolveApplicationRecord,resolveApplicationRecords,partitionCaptureBinding,createCaptureSession,preflightOwnerRegistration,canonicalReviewInput,semanticPolicyHash,foreignOwnersHash,registerOwnerPolicy,advanceOwnerPolicy,assertOwnerPolicy,
 frameForItem,validateBindingShape,assertFreshApplication,assertFreshTarget,readContributingFiles,assertMaterialFiles,assertSourceLoadEpochs,
 validateGraph,assertGraphs,observeGraph,nativeCaptureParts,validateCaptureReceipt,verifyCurrentCaptures,fail,
 resolveReloadScope,assertReloadPolicy,nativeSourceScopeScript,sourceFileReference,validateLoadEpoch,validExecutionBinding,nativeRootProbeScript};

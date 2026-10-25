"use strict";

// Programmatic UNKNOWN disposition. The original receipt/index/canonical/private
// panel row are immutable. Only the server's private R1 authority may supply facts.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ledger=require("./native-fixture-attempt-ledger"),legacy=require("./native-fixture-abandonment"),authority=require("./owned-runtime-authority"),contract=require("../cep-panel/panel-action-contract");
const SCHEMA="ae-agent.native-fixture-retained-disposition.v1",TTL=10*60000;
const MANAGED="ae-agent.native-fixture-managed-disposition.v1";
const OUTCOME=Object.freeze({historicalOutcome:"unknown",nativeExecutionProven:false,replayAllowed:false});
const {hash,clone,same,fail,SHA,UUID}=ledger;
const KINDS=Object.freeze(["capture","consumption","audit","disposition","group-retirement","adoption"]);
const freshLookups=new WeakSet(),admissionLeases=new Map();
function isRetainedReceipt(r) {
  const run=r?.result?.run;
  return !!r && r.action==="plan.run" && r.effect==="protected_plan_run" && r.source==="programmatic" && r.state==="unknown" && r.phase==="outcome_unresolved" && ["unknown","delivered"].includes(r.delivery) && r.replayAllowed===false &&
    /^fixture_[a-z0-9_]+$/.test(r.code || "") && run?.ok===false && run.dryRun===false && run.errorCode===r.code && run.m100Action?.confirmedBySurface==="cep-panel" && run.provenance?.actionId===run.m100Action.actionId && run.steps?.length===1 && run.steps[0].tool==="ame_native_fixture_probe";
}
function directory(root){return path.join(root,"evidence","native-fixture-retained");}
function fileFor(root,kind,id){if(!KINDS.includes(kind) || !UUID.test(id || ""))fail("retained_file_selector_invalid");return path.join(directory(root),id+"."+kind+".json");}
function read(root,kind,id){const file=fileFor(root,kind,id);if(!fs.existsSync(file))return null;const row=JSON.parse(ledger.readBytes(file));if(row.schema!==SCHEMA+".envelope" || !SHA.test(row.sha256 || "") || hash(row.value)!==row.sha256)fail("retained_sidecar_corrupt");return row;}
function write(root,kind,id,value,metadata={}){return ledger.writeOnce(fileFor(root,kind,id),value,{schema:SCHEMA+".envelope",...metadata});}
function projection(row){const p=contract.sanitizeReceipt(row);delete p.nativeFixtureRetained;delete p.nativeFixtureManaged;return p;}
function requireReaders(deps){for(const k of ["loadOwnedWitness","maintenanceTarget","readPanelGuard","readBridgeStatus","readRuntimeIdentity","readTransportRetained","readExecutorQuiescence","readChildState"])if(typeof deps[k]!=="function")fail("retained_private_reader_required");}
function inventory(deps,s,proof,owned) {
  const context={runId:s.runId,actionId:proof.run.provenance.actionId,proposalRevision:proof.run.provenance.proposalRevision,payloadHash:proof.run.provenance.payloadHash || null},items=ledger.attemptInventory(deps.repoRoot,context),stages=owned.profile.stages.slice().sort((a,b)=>a.role.localeCompare(b.role));
  if(items.length!==2 || items.some(v=>v.legacyLayout) || !same(items.map(v=>v.descriptor.role),["capture","stage"]) || items.some((v,i)=>!same(v.descriptor,stages[i].descriptor) || !ledger.sameProcess(v.process,{pid:stages[i].identity.pid,createdUnixMs:Date.parse(stages[i].identity.birthUtc),createdAt:stages[i].identity.birthUtc,path:stages[i].identity.imagePath})))fail("retained_full_owned_attempt_set_required");
  const nativeAttempts=proof.run.steps[0].result?.nativeAttempts || proof.run.steps[0].nativeAttempts;
  if(nativeAttempts!==undefined && !same(nativeAttempts,items.map(v=>({stageId:v.descriptor.stageId,role:v.descriptor.role,runId:s.runId,replayAllowed:false}))))fail("retained_canonical_attempt_inventory_mismatch");
  return {context,inventory:items,inventorySha256:hash(items)};
}
function entry(s,proof,guard,transport,owned,currentActor) {
  const p=projection(guard?.projection),r=transport?.row,pins=owned.manifest.originalPins,c=owned.profile.context;
  if(!isRetainedReceipt(p) || !isRetainedReceipt(r) || p.delivery!=="unknown" || p.requestId!==s.requestId || p.runId!==s.runId || r.requestId!==s.requestId || r.runId!==s.runId || !same(p.result.run,contract.redactState(proof.run)) || !same(r.result.run,p.result.run) || !same(guard.currentBinding,currentActor) ||
    !SHA.test(guard.signatureSha256 || "") || guard.signatureSha256!==pins.privateSignatureSha256 || guard.privateRecordSha256!==pins.privateRecordSha256 || guard.privateIndexEntrySha256!==pins.privateIndexEntrySha256 || hash(p)!==pins.panelReceiptSha256 || proof.canonicalRunRecordHash!==pins.canonicalRawSha256 ||
    transport.rawReceiptSha256!==pins.transportReceiptRawSha256 || transport.rawIndexSha256!==pins.transportIndexRawSha256 || transport.identitySha256!==pins.transportIdentitySha256 || !SHA.test(r.signature || "") || !same(r.binding,legacy.actor({panelInstanceId:p.panelInstanceId,panelLifecycleEpoch:p.epoch,panelGeneration:p.generation})) ||
    c.actionId!==proof.run.provenance.actionId || c.proposalRevision!==proof.run.provenance.proposalRevision || c.payloadHash!==proof.run.provenance.payloadHash)fail("retained_original_binding_mismatch");
  // These domains are deliberately distinct: a transport digest is never a
  // substitute for the private panel's signed selector digest.
  return {originalRequestId:s.requestId,runId:s.runId,action:p.action,effect:p.effect,actionId:c.actionId,instanceId:c.instanceId,proposalRevision:c.proposalRevision,payloadHash:c.payloadHash,
    originalBinding:clone(r.binding),privateSignatureSha256:guard.signatureSha256,transportSignature:r.signature,panelReceiptHash:hash(p),privateRecordSha256:guard.privateRecordSha256,privateIndexEntrySha256:guard.privateIndexEntrySha256,
    transportReceiptRawSha256:transport.rawReceiptSha256,transportIndexRawSha256:transport.rawIndexSha256,transportIdentitySha256:transport.identitySha256,canonicalRunRecordHash:proof.canonicalRunRecordHash,canonicalRunProjectionHash:proof.canonicalRunProjectionHash};
}
function runtimePin(v,owned) {
  if(!v || !SHA.test(v.loadedRuntimeSha256 || "") || !SHA.test(v.currentRuntimeSha256 || "") || !v.panelAssetHashes || Object.values(v.panelAssetHashes).some(x=>!SHA.test(x)))fail("retained_runtime_invalid");
  const pair={daemon:v.daemon,loadedRuntimeSha256:v.loadedRuntimeSha256,currentRuntimeSha256:v.currentRuntimeSha256};
  if(!owned.manifest.acceptedRuntimePairs.some(p=>same(p.daemon?.ownedGeneration?owned.resolveRuntimePair(p,pair):p,pair)))fail("retained_runtime_pair_not_authorized");return clone(v);
}
async function snapshot(deps,s,mode="capture") {
  // R1's immutable original launch witness remains evidence after its shutdown
  // grant expires. Both original retirement proofs below are mandatory; only
  // the new R2 capture TTL/current policy authorize this read-only disposition.
  requireReaders(deps);const owned=await deps.loadOwnedWitness(s,{fresh:false});owned.assertUnchanged();
  const selected=await deps.maintenanceTarget(),currentActor=legacy.actor(selected.state),proof=legacy.canonical(deps.evidenceRoot,s),group=inventory(deps,s,proof,owned);
  const guard=await deps.readPanelGuard(s),transport=await deps.readTransportRetained(s),e=entry(s,proof,guard,transport,owned,currentActor),status=await deps.readBridgeStatus();
  legacy.guardState(s,selected.state,guard,status,mode);const executor=await deps.readExecutorQuiescence();
  if(executor?.executing!==false)fail("retained_executor_not_idle");
  const members=[];
  for(const item of group.inventory){
    const proofFile=ledger.fileFor(deps.repoRoot,item.descriptor.stageId,"retirement-proof"),retired=ledger.read(proofFile);
    if(!retired)fail("retained_original_observer_proof_required");ledger.validateRetirement(retired.value,item.process);
    const child=await deps.readChildState(item.descriptor,item.process,"trusted_process_handle");
    if(!child || child.status!=="absent_inventory_is_not_exit_proof")fail("retained_child_drift_or_alive");
    members.push({stageId:item.descriptor.stageId,role:item.descriptor.role,descriptor:item.descriptor,process:item.process,originalProofSha256:retired.sha256,originalProofRawSha256:hash(ledger.readBytes(proofFile)),proof:retired.value,child});
  }
  const runtime=runtimePin(await deps.readRuntimeIdentity(),owned);legacy.frameEvidence(selected,runtime);
  const finalGuard=await deps.readPanelGuard(s),finalTransport=await deps.readTransportRetained(s),after=await deps.maintenanceTarget(),finalStatus=await deps.readBridgeStatus();
  legacy.sameTarget(selected,after,currentActor);legacy.guardState(s,after.state,finalGuard,finalStatus,mode);
  if(!same(e,entry(s,legacy.canonical(deps.evidenceRoot,s),finalGuard,finalTransport,owned,currentActor)) || !same(group,inventory(deps,s,proof,owned)))fail("retained_original_or_inventory_changed");
  for(const member of members){const file=ledger.fileFor(deps.repoRoot,member.stageId,"retirement-proof");if(hash(ledger.readBytes(file))!==member.originalProofRawSha256 || !same(await deps.readChildState(member.descriptor,member.process,"trusted_process_handle"),member.child))fail("retained_late_child_or_proof_drift");}
  owned.assertUnchanged();return {selector:s,entry:e,attemptGroup:group,members,currentActor,target:clone(selected.target),installed:clone(selected.installed),runtime,executor:clone(executor),authority:{manifestRawSha256:owned.manifestRawSha256,profileSha256:owned.profileSha256,generation:owned.profile.generation,policyRawSha256:owned.policyRawSha256,authorizationRef:owned.manifest.authorizationRef,acceptedServerCoverage:owned.manifest.acceptedServerCoverage}};
}
async function bracket(deps,s,mode){const a=await snapshot(deps,s,mode),b=await snapshot(deps,s,mode);if(!same(a,b))fail("retained_fresh_bracket_changed");return b;}
function reserved(root,id){return ["consumption","audit","disposition","group-retirement"].some(k=>fs.existsSync(fileFor(root,k,id)));}
const time=deps=>deps.now?deps.now():Date.now();
async function capture(input,deps){authority.exact(input,["selector"],"retained_client_evidence_forbidden");const s=legacy.selector(input.selector);if(reserved(deps.evidenceRoot,s.requestId))fail("retained_consumed_readback_only");const observed=await bracket(deps,s,"capture"),t=time(deps),id=crypto.randomUUID();return write(deps.evidenceRoot,"capture",id,{schema:SCHEMA+".capture",captureId:id,createdAt:new Date(t).toISOString(),expiresAt:new Date(t+TTL).toISOString(),observed,...OUTCOME});}
function validCapture(captured,id,now){const c=captured?.value,t=Date.parse(c?.createdAt);if(!c || c.schema!==SCHEMA+".capture" || c.captureId!==id || !Number.isFinite(t) || Date.parse(c.expiresAt)!==t+TTL || now<t || now>=t+TTL)fail("retained_capture_invalid_or_stale");return c;}
async function authorize(input,deps){
  authority.exact(input,["captureId"],"retained_policy_reference_only");if(!UUID.test(input.captureId || ""))fail("retained_capture_selector_invalid");
  const captured=read(deps.evidenceRoot,"capture",input.captureId),c=validCapture(captured,input.captureId,time(deps)),s=legacy.selector(c.observed.selector);
  if(typeof deps.acquireWriterLock!=="function")fail("retained_writer_lock_required");const lock=await deps.acquireWriterLock();
  if(typeof lock?.release!=="function")fail("retained_writer_lock_required");
  try{
    if(reserved(deps.evidenceRoot,s.requestId))fail("retained_consumed_readback_only");validCapture(captured,input.captureId,time(deps));
    if(!same(await bracket(deps,s,"capture"),c.observed))fail("retained_locked_capture_drift");
    const id=crypto.randomUUID(),createdAt=new Date(time(deps)).toISOString(),consumed=write(deps.evidenceRoot,"consumption",s.requestId,{schema:SCHEMA+".consumption",captureId:c.captureId,captureSha256:captured.sha256,dispositionId:id,selector:s,createdAt,...OUTCOME});
    const value={schema:SCHEMA,dispositionId:id,captureId:c.captureId,captureSha256:captured.sha256,selector:s,createdAt,status:"abandoned_reviewed",guardDisposition:"released",entry:c.observed.entry,attemptGroup:c.observed.attemptGroup,authority:c.observed.authority,authorizationSource:"owned_runtime_policy",authorizationRef:c.observed.authority.authorizationRef,acceptedServerCoverage:c.observed.authority.acceptedServerCoverage,...OUTCOME};
    const audit=write(deps.evidenceRoot,"audit",s.requestId,{schema:SCHEMA+".audit",dispositionId:id,captureId:c.captureId,captureSha256:captured.sha256,consumptionSha256:consumed.sha256,dispositionSha256:hash(value),observed:c.observed,authorizationSource:"owned_runtime_policy",authorizationRef:value.authorizationRef,...OUTCOME});
    const saved=write(deps.evidenceRoot,"disposition",s.requestId,value,{auditSha256:audit.sha256,consumptionSha256:consumed.sha256});
    // Final commit requires both ORIGINAL observer proofs. The R1 shutdown
    // result is never read here and cannot stand in for either proof.
    write(deps.evidenceRoot,"group-retirement",s.requestId,{schema:SCHEMA+".group-retirement",selector:s,inventorySha256:c.observed.attemptGroup.inventorySha256,dispositionSha256:saved.sha256,auditSha256:audit.sha256,members:c.observed.members,...OUTCOME});
    return saved;
  }finally{await lock.release();}
}
function lookupAudited(input,deps) {
  const s=legacy.selector(input),saved=read(deps.evidenceRoot,"disposition",s.requestId);
  if(!saved){if(reserved(deps.evidenceRoot,s.requestId))fail("retained_partial_audit");return null;}
  const v=saved.value,captured=read(deps.evidenceRoot,"capture",v.captureId),audit=read(deps.evidenceRoot,"audit",s.requestId),consumed=read(deps.evidenceRoot,"consumption",s.requestId),group=read(deps.evidenceRoot,"group-retirement",s.requestId),c=captured?.value;
  if(!c || c.schema!==SCHEMA+".capture" || v.schema!==SCHEMA || !same(v.selector,s) || v.status!=="abandoned_reviewed" || v.guardDisposition!=="released" || Object.entries(OUTCOME).some(([k,x])=>v[k]!==x) || v.authorizationSource!=="owned_runtime_policy" || !same(v.authorizationRef,v.authority?.authorizationRef) || !same(v.acceptedServerCoverage,authority.CAPABILITIES) || !audit || !consumed || !group ||
    v.captureSha256!==captured.sha256 || saved.auditSha256!==audit.sha256 || saved.consumptionSha256!==consumed.sha256 || audit.value.dispositionSha256!==saved.sha256 || audit.value.consumptionSha256!==consumed.sha256 || audit.value.captureSha256!==captured.sha256 || consumed.value.captureSha256!==captured.sha256 || consumed.value.dispositionId!==v.dispositionId || !same(audit.value.observed,c.observed) ||
    !same(v.entry,c.observed.entry) || !same(v.attemptGroup,c.observed.attemptGroup) || !same(v.authority,c.observed.authority) || group.value.schema!==SCHEMA+".group-retirement" || group.value.dispositionSha256!==saved.sha256 || group.value.auditSha256!==audit.sha256 || group.value.inventorySha256!==v.attemptGroup.inventorySha256 || !same(group.value.members,c.observed.members))fail("retained_audit_invalid");
  const proof=legacy.canonical(deps.evidenceRoot,s);if(proof.canonicalRunRecordHash!==v.entry.canonicalRunRecordHash || !same(ledger.attemptInventory(deps.repoRoot,v.attemptGroup.context),v.attemptGroup.inventory))fail("retained_original_or_inventory_changed");
  if(group.value.members.length!==2)fail("retained_two_original_proofs_required");
  for(const m of group.value.members){const p=ledger.read(ledger.fileFor(deps.repoRoot,m.stageId,"retirement-proof"));if(!p || p.sha256!==m.originalProofSha256 || hash(ledger.readBytes(ledger.fileFor(deps.repoRoot,m.stageId,"retirement-proof")))!==m.originalProofRawSha256 || !same(p.value,m.proof))fail("retained_original_proof_changed");ledger.validateRetirement(p.value,m.process);}
  return saved;
}
async function lookup(input,deps) {
  const s=legacy.selector(input),saved=lookupAudited(s,deps);if(!saved)return null;
  const observed=await bracket(deps,s,"lookup"),v=saved.value;
  if(!same(observed.entry,v.entry) || !same(observed.attemptGroup,v.attemptGroup) || !same(observed.authority,v.authority))fail("retained_lookup_authority_or_original_drift");
  const g=read(deps.evidenceRoot,"group-retirement",s.requestId);
  const result={...saved,readBack:{schema:SCHEMA+".read-back",dispositionSha256:saved.sha256,entrySha256:hash(v.entry),currentActor:observed.currentActor,runtime:observed.runtime,installed:observed.installed,attemptInventorySha256:v.attemptGroup.inventorySha256,groupRetirementSha256:g.sha256,nativeAdmissionBlocked:false,...OUTCOME}};
  freshLookups.add(result);return result;
}
function matchesPanel(row,saved,remote) {
  if(!isRetainedReceipt(row) || !saved?.readBack || !remote || remote.nativeFixtureRetained?.sha256!==saved.sha256 || remote.nativeFixtureRetained?.entrySha256!==hash(saved.value.entry) || hash(projection(remote))!==saved.value.entry.panelReceiptHash)return false;
  return row.requestId===saved.value.selector.requestId && row.runId===saved.value.selector.runId && row.signature===saved.value.entry.transportSignature;
}
function confirmPanelAdoption(saved,remote,{repoRoot,evidenceRoot,assertCurrent}={}) {
  if(!freshLookups.has(saved) || typeof assertCurrent!=="function" || !matchesPanel({source:"programmatic",state:"unknown",phase:"outcome_unresolved",delivery:"delivered",replayAllowed:false,action:"plan.run",effect:"protected_plan_run",code:remote?.code,result:remote?.result,requestId:saved.value.selector.requestId,runId:saved.value.selector.runId,signature:saved.value.entry.transportSignature},saved,remote) || !same(remote.nativeFixtureRetained.currentActor,saved.readBack.currentActor))fail("retained_fresh_server_lookup_and_panel_adoption_required");
  const expected={currentActor:clone(saved.readBack.currentActor),runtime:clone(saved.readBack.runtime),policyRawSha256:saved.value.authority.policyRawSha256};
  function assertFresh(){assertCurrent(expected);const owned=authority.loadRetained(repoRoot,saved.value.selector);if(owned.manifestRawSha256!==saved.value.authority.manifestRawSha256 || owned.profileSha256!==saved.value.authority.profileSha256 || owned.policyRawSha256!==expected.policyRawSha256)fail("retained_admission_authority_changed");owned.assertUnchanged();}
  assertFresh();admissionLeases.set(path.resolve(repoRoot)+":"+saved.value.selector.requestId,{saved,evidenceRoot,assertFresh});
  return {schema:SCHEMA+".fresh-adoption",selector:saved.value.selector,dispositionSha256:saved.sha256,currentActor:expected.currentActor,admissionReleased:true,...OUTCOME};
}
function validLedgerRetirement(repoRoot,descriptor) {
  const manifestFile=path.join(authority.base(repoRoot),"retained-authority.json");if(!fs.existsSync(manifestFile))return false;
  const loaded=authority.privateFile(manifestFile),manifest=authority.validateManifest(loaded.value),lease=admissionLeases.get(path.resolve(repoRoot)+":"+manifest.selector.requestId);
  if(!lease)return false;lease.assertFresh();
  const saved=lookupAudited(manifest.selector,{repoRoot,evidenceRoot:lease.evidenceRoot});
  if(!saved || saved.sha256!==lease.saved.sha256 || !saved.value.attemptGroup.inventory.some(i=>same(i.descriptor,descriptor)))return false;
  loaded.assertUnchanged();return true;
}
function currentAdmission(repoRoot) {
  try{const loaded=authority.privateFile(path.join(authority.base(repoRoot),"retained-authority.json")),manifest=authority.validateManifest(loaded.value),lease=admissionLeases.get(path.resolve(repoRoot)+":"+manifest.selector.requestId);if(!lease)return false;lease.assertFresh();const saved=lookupAudited(manifest.selector,{repoRoot,evidenceRoot:lease.evidenceRoot});loaded.assertUnchanged();return saved?.sha256===lease.saved.sha256;}catch(_){return false;}
}
async function renewAdmission(repoRoot,{context,assertManualIngress,readPanelGuard,readRuntimeIdentity}={}) {
  if(typeof assertManualIngress!=="function" || typeof readPanelGuard!=="function" || typeof readRuntimeIdentity!=="function")fail("retained_private_renewal_readers_required");
  const manifest=authority.privateFile(path.join(authority.base(repoRoot),"retained-authority.json")),m=authority.validateManifest(manifest.value),lease=admissionLeases.get(path.resolve(repoRoot)+":"+m.selector.requestId);
  if(!lease)fail("retained_existing_fresh_adoption_lease_required");
  const saved=lease.saved,expected=saved.readBack;
  function verify(guard,runtime){assertManualIngress(context);lease.assertFresh();const owned=authority.loadRetained(repoRoot,m.selector),proof=legacy.canonical(lease.evidenceRoot,m.selector),transport=require("./cep-panel-control").readIndexedReceipt(path.join(lease.evidenceRoot,"cep-panel-control"),m.selector.requestId),remote={...guard.projection,nativeFixtureRetained:guard.adoption};if(!same(entry(m.selector,proof,guard,transport,owned,expected.currentActor),saved.value.entry) || !matchesPanel(transport.row,saved,remote) || !same(guard.adoption?.currentActor,expected.currentActor) || !same(runtime,expected.runtime))fail("retained_renewal_actor_runtime_or_adoption_changed");lookupAudited(m.selector,{repoRoot,evidenceRoot:lease.evidenceRoot});owned.assertUnchanged();manifest.assertUnchanged();}
  assertManualIngress(context);lease.assertFresh();
  const before=await readPanelGuard(m.selector),runtime=await readRuntimeIdentity();verify(before,runtime);
  const after=await readPanelGuard(m.selector),finalRuntime=await readRuntimeIdentity();verify(after,finalRuntime);
  // Renewal validates an existing private lease during the exact current manual
  // operation. It cannot mint a lease, authorize capture, or relax idle gates.
  return {schema:SCHEMA+".lease-renewal",selector:m.selector,dispositionSha256:saved.sha256,...OUTCOME};
}
function managedFile(root,runId){if(!UUID.test(runId || ""))fail("owned_managed_run_selector_invalid");return path.join(authority.base(root),"fixture-cleanup-jobs",runId,"audit-group.json");}
function managedSignature(v,key){const {authentication,...data}=v;return crypto.createHmac("sha256",key).update(require("./owned-runtime-lifecycle").canonical(data)).digest("hex");}
function managedKey(){const c=require("../scripts/owned-runtime-control");return c.credential({daemon:{port:3456,credentialSha256:c.credentialFingerprint()}});}
function managedInventory(root,context){return ledger.attemptInventory(root,{runId:context.runId,actionId:context.actionId,proposalRevision:context.proposalRevision,payloadHash:context.payloadHash});}
function validateManagedGroup(root,runId,{key=managedKey()}={}) {
  const loaded=authority.privateFile(managedFile(root,runId)),row=loaded.value,v=row.value;
  authority.exact(row,["schema","sha256","value"]);authority.exact(v,["schema","selector","context","issuer","canonicalRawSha256","inventory","inventorySha256","proofs","completionSha256","authorizationRef","policyRawSha256","originalDispositionSha256","historicalOutcome","nativeExecutionProven","replayAllowed","authentication"]);
  if(row.schema!==require("./owned-runtime-lifecycle").SCHEMA+".envelope" || row.sha256!==require("./owned-runtime-lifecycle").hash(v) || v.schema!==MANAGED || v.context.runId!==runId || v.selector.runId!==runId || !UUID.test(v.selector.requestId || "") || !SHA.test(v.authentication || "") || v.authentication!==managedSignature(v,key) || v.replayAllowed!==false || !["unknown","not_inferred"].includes(v.historicalOutcome) || v.nativeExecutionProven!==false || !Array.isArray(v.inventory) || v.inventory.length!==2 || !same(v.inventory.map(i=>i.descriptor.role),["capture","stage"]) || v.inventorySha256!==hash(v.inventory) || !Array.isArray(v.proofs) || v.proofs.length!==2)fail("owned_managed_disposition_invalid");
  const policy=authority.loadPolicy(root,"native_fixture_disposition",v.authorizationRef),manifest=authority.privateFile(path.join(authority.base(root),"retained-authority.json")),m=authority.validateManifest(manifest.value),original=lookupAudited(m.selector,{repoRoot:root,evidenceRoot:path.join(root,"logs")});
  if(policy.rawSha256!==v.policyRawSha256 || original?.sha256!==v.originalDispositionSha256 || !same(managedInventory(root,v.context),v.inventory))fail("owned_managed_disposition_scope_changed");
  const canonical=authority.privateFile(require("./plan-run-records").fileFor(path.join(root,"logs"),runId)),record=require("./plan-run-records").readRecord(path.join(root,"logs"),runId,{throwOnError:true});
  if(canonical.rawSha256!==v.canonicalRawSha256 || !record.run.finishedAt || record.run.steps?.length!==1 || record.run.steps[0].tool!=="ame_native_fixture_probe" || record.run.provenance?.actionId!==v.context.actionId || record.run.provenance?.proposalRevision!==v.context.proposalRevision || record.run.provenance?.payloadHash!==v.context.payloadHash || !["completed","failed"].includes(record.run.outcome?.execution?.status))fail("owned_managed_canonical_changed");
  for(let i=0;i<2;i++){const item=v.inventory[i],p=v.proofs[i],actual=ledger.read(ledger.fileFor(root,item.descriptor.stageId,"retirement-proof"));if(!actual || p.stageId!==item.descriptor.stageId || p.sha256!==actual.sha256 || p.rawSha256!==hash(ledger.readBytes(ledger.fileFor(root,p.stageId,"retirement-proof"))) || !same(p.proof,actual.value))fail("owned_managed_original_proof_changed");ledger.validateRetirement(actual.value,item.process);}
  if(v.completionSha256!==null){const complete=ledger.read(ledger.completionFile(root,runId));if(!complete || complete.sha256!==v.completionSha256 || !v.inventory.every(i=>ledger.validCompletion(root,i.descriptor,ledger.read(ledger.fileFor(root,i.descriptor.stageId,"reservation")))))fail("owned_managed_native_completion_changed");}
  const issuer=require("./owned-runtime-supervisor").readCandidate(root,v.issuer.generation);if(issuer.candidate.sha256!==v.issuer.nativeCandidateSha256 || issuer.reservation.sha256!==v.issuer.reservationSha256 || issuer.ticket.sha256!==v.issuer.startupTicketSha256)fail("owned_managed_issuer_changed");
  loaded.assertUnchanged();policy.assertUnchanged();canonical.assertUnchanged();manifest.assertUnchanged();return {row,record};
}
async function auditManagedCleanup(root,job,input,deps,{key=managedKey()}={}) {
  if(job.children.length!==2 || !same(job.children.map(c=>c.descriptor.role),["capture","stage"]))return {coveredDispositionVerified:false,status:"children_closed_audit_pending",...OUTCOME};
  const manifest=authority.privateFile(path.join(authority.base(root),"retained-authority.json")),m=authority.validateManifest(manifest.value),lease=admissionLeases.get(path.resolve(root)+":"+m.selector.requestId);
  if(!lease)fail("owned_managed_existing_adoption_required");lease.assertFresh();
  const context={runId:job.runId,actionId:input.context.record.actionId,proposalRevision:input.context.record.revision,payloadHash:input.context.record.payloadHash},items=managedInventory(root,context);
  if(items.length!==2 || !same(items.map(i=>i.descriptor),job.children.map(c=>c.descriptor)) || !same(items.map(i=>i.process),job.children.map(c=>c.process)))fail("owned_managed_complete_registered_inventory_required");
  const proofs=items.map(item=>{const p=ledger.read(ledger.fileFor(root,item.descriptor.stageId,"retirement-proof"));if(!p || !input.proofs.some(proof=>proof.stageId===item.descriptor.stageId && same(proof.originalProof,p.value)))fail("owned_managed_two_original_proofs_required");ledger.validateRetirement(p.value,item.process);return {stageId:item.descriptor.stageId,sha256:p.sha256,rawSha256:hash(ledger.readBytes(ledger.fileFor(root,item.descriptor.stageId,"retirement-proof"))),proof:p.value};});
  const policy=authority.loadPolicy(root,"native_fixture_disposition",m.authorizationRef),registered=require("./owned-runtime-supervisor").readDaemonRegistration(root),issuer=registered && require("./owned-runtime-supervisor").readCandidate(root,registered.generation);
  if(!registered || !issuer)fail("owned_managed_private_issuer_required");
  let completionSha256=null;if(job.outcome==="succeeded"){const completion=ledger.read(ledger.completionFile(root,job.runId));if(!completion || !items.every(i=>ledger.validCompletion(root,i.descriptor,ledger.read(ledger.fileFor(root,i.descriptor.stageId,"reservation")))))fail("owned_managed_native_success_completion_required");completionSha256=completion.sha256;}
  const before=await deps.readPanelGuard(m.selector),runtime=await deps.readRuntimeIdentity(),expected=lease.saved.readBack;
  if(!matchesPanel({requestId:m.selector.requestId,runId:m.selector.runId,signature:lease.saved.value.entry.transportSignature,...projection(before.projection)},lease.saved,{...before.projection,nativeFixtureRetained:before.adoption}) || !same(before.currentBinding,expected.currentActor) || !same(runtime,expected.runtime))fail("owned_managed_fresh_panel_adoption_required");lease.assertFresh();policy.assertUnchanged();manifest.assertUnchanged();
  const dir=path.dirname(managedFile(root,job.runId));if(!fs.existsSync(managedFile(root,job.runId))){const v={schema:MANAGED,selector:{requestId:input.context.requestId,runId:job.runId},context,issuer:{generation:registered.generation,reservationSha256:issuer.reservation.sha256,startupTicketSha256:issuer.ticket.sha256,nativeCandidateSha256:issuer.candidate.sha256},canonicalRawSha256:input.rawSha256,inventory:items,inventorySha256:hash(items),proofs,completionSha256,authorizationRef:m.authorizationRef,policyRawSha256:policy.rawSha256,originalDispositionSha256:lease.saved.sha256,historicalOutcome:job.outcome==="succeeded"?"not_inferred":"unknown",nativeExecutionProven:false,replayAllowed:false,authentication:"0".repeat(64)};v.authentication=managedSignature(v,key);ledger.ensure(dir);require("./owned-runtime-lifecycle").writeJournalOnce(dir,"audit-group",v);}
  const group=validateManagedGroup(root,job.runId,{key}),after=await deps.readPanelGuard(m.selector),afterRuntime=await deps.readRuntimeIdentity();lease.assertFresh();if(!same(before,after) || !same(runtime,afterRuntime))fail("owned_managed_audit_actor_or_runtime_changed");
  // The original retained adoption is renewed by a fixed fresh getResult
  // bracket. A stored managed group alone never opens ledger admission.
  if(completionSha256!==null)return {coveredDispositionVerified:true,dispositionSha256:group.row.sha256,status:"cleanup_audited",...OUTCOME};
  const adopted=admissionLeases.get("managed:"+path.resolve(root)+":"+job.runId);
  if(adopted){adopted.assertFresh();if(adopted.groupSha256===group.row.sha256)return {coveredDispositionVerified:true,dispositionSha256:group.row.sha256,status:"cleanup_audited",...OUTCOME};}
  return {coveredDispositionVerified:false,dispositionSha256:group.row.sha256,status:"children_closed_audit_pending",...OUTCOME};
}
function managedBindingFile(root,runId){return path.join(path.dirname(managedFile(root,runId)),"panel-binding.json");}
function managedPanelEntry(s,group,guard,transport){
  const p=projection(guard.projection),r=transport.row,c=group.row.value.context,run=group.record.run;
  if(!isRetainedReceipt(p) || !isRetainedReceipt(r) || p.requestId!==s.requestId || p.runId!==s.runId || r.requestId!==s.requestId || r.runId!==s.runId || !same(p.result.run,contract.redactState(run)) || !same(r.result.run,p.result.run) || !SHA.test(guard.privateRecordSha256 || "") || !SHA.test(guard.privateIndexEntrySha256 || "") || !SHA.test(guard.signatureSha256 || "") || !SHA.test(r.signature || ""))fail("owned_managed_exact_indexed_future_receipt_required");
  return {originalRequestId:s.requestId,runId:s.runId,action:p.action,effect:p.effect,actionId:c.actionId,proposalRevision:c.proposalRevision,payloadHash:c.payloadHash,originalBinding:clone(r.binding),privateSignatureSha256:guard.signatureSha256,privateRecordSha256:guard.privateRecordSha256,privateIndexEntrySha256:guard.privateIndexEntrySha256,transportSignature:r.signature,transportReceiptRawSha256:transport.rawReceiptSha256,transportIndexRawSha256:transport.rawIndexSha256,transportIdentitySha256:transport.identitySha256,panelReceiptHash:hash(p),canonicalRunRecordHash:group.row.value.canonicalRawSha256,canonicalRunProjectionHash:hash(contract.redactState(run))};
}
async function lookupManaged(input,deps,{key}={}){
  const selected=legacy.selector(input),s={requestId:selected.requestId,runId:selected.runId};if(!fs.existsSync(managedFile(deps.repoRoot,s.runId)))return null;
  key=key || managedKey();
  const root=deps.repoRoot,group=validateManagedGroup(root,s.runId,{key}),v=group.row.value;if(!same(v.selector,s) || v.completionSha256!==null)return null;
  const a=await deps.maintenanceTarget(),currentActor=legacy.actor(a.state),guard=await deps.readPanelGuard(s),transport=await deps.readTransportRetained(s),runtime=await deps.readRuntimeIdentity();
  const owned=authority.loadRetained(root,authority.validateManifest(authority.privateFile(path.join(authority.base(root),"retained-authority.json")).value).selector);runtimePin(runtime,owned);
  if(a.state.nativeControlIdle!==true || guard.controllerIdle!==true || !same(guard.currentBinding,currentActor))fail("owned_managed_fresh_idle_panel_required");
  if(transport.ownedGeneration!==v.issuer.generation || transport.indexKind!=="owned_receipt_checkpoint")fail("owned_managed_transport_issuer_generation_changed");
  const e=managedPanelEntry(s,group,guard,transport),bindingFile=managedBindingFile(root,s.runId);
  if(!fs.existsSync(bindingFile)){const b={schema:MANAGED+".panel-binding",groupSha256:group.row.sha256,entry:e,replayAllowed:false,authentication:"0".repeat(64)};b.authentication=managedSignature(b,key);require("./owned-runtime-lifecycle").writeJournalOnce(path.dirname(bindingFile),"panel-binding",b);}
  const bound=authority.privateFile(bindingFile),b=bound.value.value;if(bound.value.sha256!==require("./owned-runtime-lifecycle").hash(b) || b.schema!==MANAGED+".panel-binding" || b.groupSha256!==group.row.sha256 || !same(b.entry,e) || b.authentication!==managedSignature(b,key) || b.replayAllowed!==false)fail("owned_managed_future_original_binding_changed");
  const end=await deps.readPanelGuard(s),last=await deps.readRuntimeIdentity(),finalTarget=await deps.maintenanceTarget();if(!same(guard,end) || !same(runtime,last) || !same(legacy.actor(finalTarget.state),currentActor) || finalTarget.state.nativeControlIdle!==true)fail("owned_managed_lookup_actor_runtime_or_receipt_changed");
  bound.assertUnchanged();owned.assertUnchanged();validateManagedGroup(root,s.runId,{key});
  const value={schema:MANAGED,selector:s,entry:e,attemptGroup:{context:v.context,inventory:v.inventory,inventorySha256:v.inventorySha256},status:"abandoned_reviewed",guardDisposition:"released",authorizationSource:"owned_runtime_policy",authorizationRef:v.authorizationRef,acceptedServerCoverage:authority.CAPABILITIES,groupSha256:group.row.sha256,...OUTCOME};
  const saved={schema:MANAGED+".envelope",sha256:hash(value),value,readBack:{schema:MANAGED+".read-back",dispositionSha256:hash(value),entrySha256:hash(e),currentActor,runtime,installed:a.installed,attemptInventorySha256:v.inventorySha256,groupRetirementSha256:group.row.sha256,nativeAdmissionBlocked:false,...OUTCOME}};freshLookups.add(saved);return saved;
}
function confirmManagedAdoption(saved,remote,{repoRoot,evidenceRoot,assertCurrent,key=managedKey()}={}){
  if(!freshLookups.has(saved) || saved.value.schema!==MANAGED || typeof assertCurrent!=="function" || remote?.nativeFixtureManaged?.sha256!==saved.sha256 || remote.nativeFixtureManaged.entrySha256!==hash(saved.value.entry) || remote.nativeFixtureManaged.groupRetirementSha256!==saved.value.groupSha256 || !same(remote.nativeFixtureManaged.currentActor,saved.readBack.currentActor) || hash(projection(remote))!==saved.value.entry.panelReceiptHash)fail("owned_managed_corresponding_fresh_panel_adoption_required");
  const group=validateManagedGroup(repoRoot,saved.value.selector.runId,{key}),expected={currentActor:clone(saved.readBack.currentActor),runtime:clone(saved.readBack.runtime),policyRawSha256:group.row.value.policyRawSha256};
  function assertFresh(){assertCurrent(expected);const actual=validateManagedGroup(repoRoot,saved.value.selector.runId,{key});if(actual.row.sha256!==group.row.sha256)fail("owned_managed_admission_group_changed");}
  assertFresh();admissionLeases.set("managed:"+path.resolve(repoRoot)+":"+saved.value.selector.runId,{saved,groupSha256:group.row.sha256,assertFresh,key});return {admissionReleased:true,...OUTCOME};
}
function isFreshManagedCleanupAdoption(saved,indexed,response,{repoRoot}={}){
  if(!freshLookups.has(saved) || saved.value?.schema!==MANAGED || response?.ok!==false || response.replayed!==false)return false;
  const s=saved.value.selector,e=saved.value.entry,r=indexed?.row,lease=admissionLeases.get("managed:"+path.resolve(repoRoot)+":"+s.runId);
  if(!lease || lease.saved!==saved || lease.groupSha256!==saved.value.groupSha256 || !isRetainedReceipt(r) || r.requestId!==s.requestId || r.runId!==s.runId || r.action!==e.action || r.effect!==e.effect || r.signature!==e.transportSignature || !same(r.binding,e.originalBinding) || indexed.rawReceiptSha256!==e.transportReceiptRawSha256 || indexed.rawIndexSha256!==e.transportIndexRawSha256 || indexed.identitySha256!==e.transportIdentitySha256 || !same(response.receipt,projection(r)))return false;
  lease.assertFresh();const group=validateManagedGroup(repoRoot,s.runId,{key:lease.key});
  return group.row.sha256===saved.value.groupSha256 && group.row.value.context.actionId===e.actionId && group.row.value.context.proposalRevision===e.proposalRevision && group.row.value.context.payloadHash===e.payloadHash;
}
function validManagedRetirement(root,d){const reservation=ledger.read(ledger.fileFor(root,d.stageId,"reservation"));if(!reservation || !fs.existsSync(managedFile(root,reservation.value.runId)))return false;const lease=admissionLeases.get("managed:"+path.resolve(root)+":"+reservation.value.runId);if(!lease)return false;lease.assertFresh();const group=validateManagedGroup(root,reservation.value.runId,{key:lease.key});return group.row.sha256===lease.groupSha256 && group.row.value.inventory.some(i=>same(i.descriptor,d));}
module.exports={SCHEMA,MANAGED,TTL,OUTCOME,isRetainedReceipt,directory,fileFor,read,projection,inventory,entry,runtimePin,snapshot,bracket,capture,authorize,lookupAudited,lookup,matchesPanel,confirmPanelAdoption,validLedgerRetirement,currentAdmission,renewAdmission,managedFile,validateManagedGroup,auditManagedCleanup,lookupManaged,confirmManagedAdoption,isFreshManagedCleanupAdoption,validManagedRetirement};

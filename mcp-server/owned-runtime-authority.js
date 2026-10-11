"use strict";

// One private provisioning root shared with R1. Tool/HTTP callers cannot supply
// files, policy, identities, executable paths or launch witnesses.
const fs=require("node:fs"),path=require("node:path");
const ledger=require("./native-fixture-attempt-ledger"),r1=require("./owned-runtime-lifecycle");
const POLICY="ae-agent.owned-runtime-policy.v1",RETAINED="ae-agent.native-fixture-retained-authority.v1";
const PROFILE="migration-fixture-children-v1";
const CAPABILITIES=Object.freeze(["native_fixture_disposition","panel_retained_reload","owned_daemon_lifecycle"]);
const PIN_KEYS=Object.freeze(["canonicalRawSha256","transportReceiptRawSha256","transportIndexRawSha256","transportIdentitySha256","privateRecordSha256","privateIndexEntrySha256","panelReceiptSha256","privateSignatureSha256"]);
const ACTUAL_RUNTIME_ROOT=path.resolve("C:/Users/Ant/Documents/Codex/AE_agent"),FIXED_CONTROL_SHA256="0914cbd9cdcdc941d3548ef0133523b6326ce15b3e98479f5c358ef203dcf738";
function runtimeControlFor(root=path.resolve(__dirname,"..")) {
  // Staged maintenance must use the genuine ROOT's strict fixed-config reader.
  // No credential path, environment token or fallback is accepted from a caller.
  if(path.resolve(root)===ACTUAL_RUNTIME_ROOT){const file=path.join(ACTUAL_RUNTIME_ROOT,"scripts","owned-runtime-control.js");if(ledger.hash(ledger.readBytes(file))!==FIXED_CONTROL_SHA256)ledger.fail("owned_runtime_fixed_control_source_changed");return require(file);}
  // Existing private dependency fixtures replace this module's methods offline.
  return require("../scripts/owned-runtime-control");
}
function exact(v,keys,code="owned_authority_contract_invalid") {
  if(!v || typeof v!=="object" || Array.isArray(v) || Object.keys(v).sort().join(",")!==keys.slice().sort().join(",") || Object.getOwnPropertySymbols(v).length || Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!Object.hasOwn(d,"value")))ledger.fail(code);
}
function base(root){return path.join(path.resolve(root),".codex-runtime","owned-runtime-maintenance");}
function sameKernelIdentity(a,b){const win=require("./owned-runtime-win32");win.validateIdentity(a);win.validateIdentity(b);return r1.canonical(a)===r1.canonical(b);}
function privateFile(file) {
  const stat=fs.lstatSync(file,{bigint:true}),bytes=ledger.readBytes(file),rawSha256=ledger.hash(bytes),value=r1.freeze(JSON.parse(bytes));
  function assertUnchanged(){const b=ledger.readBytes(file),s=fs.lstatSync(file,{bigint:true});if(s.dev!==stat.dev || s.ino!==stat.ino || s.size!==stat.size || s.mtimeNs!==stat.mtimeNs || ledger.hash(b)!==rawSha256)ledger.fail("owned_authority_file_changed");}
  assertUnchanged();return {value,rawSha256,assertUnchanged};
}
function authorization(v) {
  exact(v,["source","reference"]);if(v.source!=="explicit_user_chat" || typeof v.reference!=="string" || !v.reference.trim() || v.reference.length>512)ledger.fail("owned_policy_authorization_invalid");return v;
}
function validatePolicy(v) {
  exact(v,["schema","generation","enabled","authorization","acceptedServerCoverage"]);
  if(v.schema!==POLICY || !/^[A-Za-z0-9_-]{1,128}$/.test(v.generation || "") || typeof v.enabled!=="boolean")ledger.fail("owned_policy_invalid");authorization(v.authorization);
  if(!Array.isArray(v.acceptedServerCoverage) || !v.acceptedServerCoverage.length || v.acceptedServerCoverage.some(x=>!CAPABILITIES.includes(x)) || new Set(v.acceptedServerCoverage).size!==v.acceptedServerCoverage.length)ledger.fail("owned_policy_coverage_invalid");return v;
}
function loadPolicy(root,capability,reference) {
  if(!CAPABILITIES.includes(capability))ledger.fail("owned_policy_capability_invalid");
  const loaded=privateFile(path.join(base(root),"policy.json")),p=validatePolicy(loaded.value);
  if(!p.enabled || !p.acceptedServerCoverage.includes(capability) || reference && !ledger.same(p.authorization,reference))ledger.fail("owned_policy_disabled_or_scope_missing");
  return {...loaded,policy:p};
}
function validateManifest(v) {
  exact(v,["schema","generation","profileId","profileRawSha256","selector","originalPins","acceptedRuntimePairs","authorizationRef","acceptedServerCoverage"]);
  if(v.schema!==RETAINED || !/^[A-Za-z0-9_-]{1,128}$/.test(v.generation || "") || v.profileId!==PROFILE || !ledger.SHA.test(v.profileRawSha256 || ""))ledger.fail("owned_retained_authority_invalid");
  exact(v.selector,["requestId","runId"]);if(!ledger.UUID.test(v.selector.requestId || "") || !ledger.UUID.test(v.selector.runId || ""))ledger.fail("owned_retained_selector_invalid");
  exact(v.originalPins,PIN_KEYS);if(Object.values(v.originalPins).some(x=>!ledger.SHA.test(x || "")))ledger.fail("owned_retained_original_pins_invalid");
  authorization(v.authorizationRef);
  if(!ledger.same(v.acceptedServerCoverage,CAPABILITIES))ledger.fail("owned_retained_coverage_invalid");
  if(!Array.isArray(v.acceptedRuntimePairs) || !v.acceptedRuntimePairs.length || v.acceptedRuntimePairs.length>4)ledger.fail("owned_retained_runtime_pair_invalid");
  for(const pair of v.acceptedRuntimePairs){
    if(pair.daemon && Object.hasOwn(pair.daemon,"ownedGeneration")){exact(pair,["daemon","loadedRuntimeSha256","currentRuntimeSha256","reservationSha256","startupTicketSha256","bootNonce"]);exact(pair.daemon,["ownedGeneration"]);if(!ledger.UUID.test(pair.daemon.ownedGeneration || "") || !ledger.UUID.test(pair.bootNonce || "") || !ledger.SHA.test(pair.reservationSha256 || "") || !ledger.SHA.test(pair.startupTicketSha256 || ""))ledger.fail("owned_retained_runtime_pair_invalid");}
    else {exact(pair,["daemon","loadedRuntimeSha256","currentRuntimeSha256"]);exact(pair.daemon,["pid","startedAt"]);if(!Number.isSafeInteger(pair.daemon.pid) || pair.daemon.pid<1 || !Number.isFinite(Date.parse(pair.daemon.startedAt)))ledger.fail("owned_retained_runtime_pair_invalid");}
    if(!ledger.SHA.test(pair.loadedRuntimeSha256 || "") || !ledger.SHA.test(pair.currentRuntimeSha256 || ""))ledger.fail("owned_retained_runtime_pair_invalid");
  }
  return v;
}
function loadRetained(root,selector,{fresh=false,now=Date.now}={}) {
  const manifest=privateFile(path.join(base(root),"retained-authority.json")),m=validateManifest(manifest.value);
  if(!ledger.same(m.selector,selector))ledger.fail("owned_retained_selector_not_provisioned");
  const profileFile=path.join(base(root),"profiles",PROFILE+".json"),loaded=privateFile(profileFile);
  if(loaded.rawSha256!==m.profileRawSha256)ledger.fail("owned_retained_profile_changed");
  const profile=r1.validateProfile(loaded.value,{command:"inspect",profile:PROFILE,runId:selector.runId,stageId:loaded.value.stages?.[0]?.stageId});
  if(profile.context.requestId!==selector.requestId || profile.context.runId!==selector.runId || profile.generation!==m.generation || fresh && (now()<Date.parse(profile.issuedAt) || now()>=Date.parse(profile.expiresAt)))ledger.fail("owned_retained_context_or_freshness_invalid");
  r1.pinFiles(profile,path.resolve(root));
  const policy=loadPolicy(root,"native_fixture_disposition",m.authorizationRef);
  function assertUnchanged(){manifest.assertUnchanged();loaded.assertUnchanged();policy.assertUnchanged();r1.pinFiles(profile,path.resolve(root));loadPolicy(root,"native_fixture_disposition",m.authorizationRef);}
  assertUnchanged();return {manifest:m,manifestRawSha256:manifest.rawSha256,profile,profileSha256:r1.hash(profile),policy:policy.policy,policyRawSha256:policy.rawSha256,assertUnchanged,resolveRuntimePair:(pair,runtime)=>resolveRuntimePair(root,pair,runtime)};
}
function resolveRuntimePair(root,pair,runtime) {
  if(!pair.daemon?.ownedGeneration)return pair;
  const registration=require("./owned-runtime-supervisor").readDaemonRegistration(root);
  if(!registration)ledger.fail("owned_retained_successor_registration_required");
  if(registration.generation!==pair.daemon.ownedGeneration){const successor=runtime && require("./owned-runtime-supervisor").resolveRetainedSuccession(root,pair,runtime);if(!successor)ledger.fail("owned_retained_successor_registration_required");return {daemon:{pid:successor.kernelIdentity.pid,startedAt:successor.serviceStartedAt},loadedRuntimeSha256:successor.sourceSha256,currentRuntimeSha256:successor.sourceSha256};}
  if(registration.bootNonce!==pair.bootNonce || registration.reservationSha256!==pair.reservationSha256 || registration.startupTicketSha256!==pair.startupTicketSha256 || registration.sourceSha256!==pair.loadedRuntimeSha256)ledger.fail("owned_retained_successor_registration_required");
  return {daemon:{pid:registration.kernelIdentity.pid,startedAt:registration.serviceStartedAt},loadedRuntimeSha256:pair.loadedRuntimeSha256,currentRuntimeSha256:pair.currentRuntimeSha256};
}
async function readCleanupNativeResult(root,job,input,{inspectProcess=require("./ame-native-fixture-runner").inspectProcess}={}) {
  // Only the memory-branded lifecycle factory calls this reader. Its job is not
  // an HTTP ownership claim; every process is checked against the fixed private
  // launch ledger and the same root-provisioned protected inventory.
  const manifest=privateFile(path.join(base(root),"retained-authority.json")),m=validateManifest(manifest.value),owned=loadRetained(root,m.selector),win=require("./owned-runtime-win32");
  const registered=require("./owned-runtime-supervisor").readDaemonRegistration(root);
  if(!registered)ledger.fail("owned_cleanup_registered_daemon_required");
  const native=input.nativeReadback;
  if(job.outcome==="succeeded" && (native?.schema!=="ae-agent.native-fixture-readback.v1" || native.producer!=="private_signed_fixture_cache" || native.authorization?.runId!==job.runId || native.authorization?.proposalId!==input.context.record.actionId || native.ok!==true))ledger.fail("owned_cleanup_private_native_readback_required");
  const policy=loadPolicy(root,"native_fixture_disposition",m.authorizationRef),canonical=privateFile(input.canonicalPath);
  if(canonical.rawSha256!==input.rawSha256)ledger.fail("owned_cleanup_canonical_changed");
  async function exactKernel(expected) {
    win.validateIdentity(expected);const observed=await inspectProcess(expected.pid);
    if(!observed || String(observed.createdFileTime)!==expected.birthFileTime || ledger.birthIdentity(observed.createdAt)!==expected.birthUtc || String(observed.path).toLowerCase()!==expected.imagePath.toLowerCase() || ledger.hash(ledger.readBytes(expected.imagePath))!==expected.executableSha256)ledger.fail("owned_cleanup_process_identity_changed");
  }
  const protectedIdentities=owned.profile.protected.filter(v=>!ledger.same(v,owned.profile.daemon.identity));
  if(protectedIdentities.length!==owned.profile.protected.length-1)ledger.fail("owned_cleanup_original_protected_daemon_required");
  const migration=require("./owned-runtime-supervisor").readProtectedInventory(root);
  for(const identity of migration.identities){if(identity.pid===owned.profile.daemon.identity.pid)ledger.fail("owned_cleanup_legacy_protected_target_invalid");const prior=protectedIdentities.find(v=>v.pid===identity.pid);if(prior && !ledger.same(prior,identity))ledger.fail("owned_cleanup_protected_identity_drift");if(!prior)protectedIdentities.push(identity);}
  migration.assertUnchanged();protectedIdentities.push(registered.kernelIdentity);
  if(new Set(protectedIdentities.map(v=>v.pid)).size!==protectedIdentities.length)ledger.fail("owned_cleanup_protected_inventory_collision");
  for(const expected of protectedIdentities)await exactKernel(expected);
  const children=[];
  for(const child of job.children) {
    const d=ledger.descriptor(root,child.descriptor),launch=ledger.read(ledger.fileFor(root,d.stageId,"launch")),reservation=ledger.read(ledger.fileFor(root,d.stageId,"reservation"));
    if(!launch || !reservation || reservation.value.runId!==job.runId || reservation.value.actionId!==input.context.record.actionId || !ledger.same(reservation.value.descriptor,d) || !ledger.sameProcess(launch.value.process,child.process))ledger.fail("owned_cleanup_original_launch_required");
    const kernel=win.validateIdentity(child.kernelIdentity);
    if(kernel.pid!==child.process.pid || kernel.birthUtc!==ledger.birthIdentity(child.process.createdAt) || kernel.imagePath.toLowerCase()!==d.executablePath.toLowerCase() || kernel.executableSha256!==d.executableSha256 || protectedIdentities.some(v=>v.pid===kernel.pid))ledger.fail("owned_cleanup_child_identity_mismatch");
    const proofFile=ledger.fileFor(root,d.stageId,"retirement-proof"),proof=ledger.read(proofFile);
    if(proof){const pinned=privateFile(proofFile);ledger.validateRetirement(proof.value,child.process);pinned.assertUnchanged();children.push({stageId:d.stageId,kernelIdentity:kernel,identityVerified:true,originalRetirementProof:proof.value});}
    else {await exactKernel(kernel);children.push({stageId:d.stageId,kernelIdentity:kernel,identityVerified:true});}
  }
  manifest.assertUnchanged();owned.assertUnchanged();migration.assertUnchanged();policy.assertUnchanged();canonical.assertUnchanged();
  return {verified:true,canonicalRawSha256:input.rawSha256,children,protectedIdentities};
}
function currentTransportDirectory(root,evidenceRoot=path.join(root,"logs")){
  const registered=require("./owned-runtime-supervisor").readDaemonRegistration(root);if(!registered)ledger.fail("owned_transport_registered_generation_required");
  return path.join(evidenceRoot,"cep-panel-control","owned",registered.generation);
}
function selectTransportDirectory(root,evidenceRoot,selector){
  exact(selector,["requestId","runId"]);if(!ledger.UUID.test(selector.requestId || "") || !ledger.UUID.test(selector.runId || ""))ledger.fail("owned_transport_selector_invalid");
  const manifest=privateFile(path.join(base(root),"retained-authority.json")),m=validateManifest(manifest.value);
  if(ledger.same(selector,m.selector)){loadRetained(root,m.selector).assertUnchanged();manifest.assertUnchanged();return path.join(evidenceRoot,"cep-panel-control");}
  const retained=require("./native-fixture-retained"),file=retained.managedFile(root,selector.runId);
  if(fs.existsSync(file)){const group=retained.validateManagedGroup(root,selector.runId).row.value;if(!ledger.same(group.selector,selector))ledger.fail("owned_transport_managed_selector_mismatch");return path.join(evidenceRoot,"cep-panel-control","owned",group.issuer.generation);}
  return currentTransportDirectory(root,evidenceRoot);
}
function receiptTransportDirectory(root,evidenceRoot,requestId){
  if(!ledger.UUID.test(requestId || ""))ledger.fail("owned_transport_selector_invalid");
  const manifest=privateFile(path.join(base(root),"retained-authority.json")),m=validateManifest(manifest.value);if(m.selector.requestId===requestId)return selectTransportDirectory(root,evidenceRoot,m.selector);
  const jobs=path.join(base(root),"fixture-cleanup-jobs");if(fs.existsSync(jobs)){const names=fs.readdirSync(jobs);if(names.length>1000)ledger.fail("owned_transport_job_inventory_budget");for(const id of names){if(!ledger.UUID.test(id))ledger.fail("owned_transport_foreign_job");const file=require("./native-fixture-retained").managedFile(root,id);if(!fs.existsSync(file))continue;const row=privateFile(file);if(row.value.value?.selector?.requestId===requestId)return selectTransportDirectory(root,evidenceRoot,{requestId,runId:id});}}
  return currentTransportDirectory(root,evidenceRoot);
}
function readPredecessorTransportInventory(root,pair,current,{supervisor=require("./owned-runtime-supervisor"),readIndexedReceipt=require("./cep-panel-control").readIndexedReceipt}={}) {
  if(!current || !ledger.UUID.test(current.generation || "") || !ledger.UUID.test(pair?.daemon?.ownedGeneration || ""))ledger.fail("owned_cutover_predecessor_registration_required");
  if(current.generation===pair.daemon.ownedGeneration)return {rows:[],assertUnchanged(){}};
  const runtime={daemon:{pid:current.kernelIdentity.pid,startedAt:current.serviceStartedAt},loadedRuntimeSha256:current.sourceSha256,currentRuntimeSha256:current.sourceSha256};
  function assertChain(){const verified=supervisor.resolveRetainedSuccession(root,pair,runtime);if(!verified || verified.generation!==current.generation)ledger.fail("owned_cutover_predecessor_chain_required");}
  // The existing supervisor verifies every signed amendment, exact held exit,
  // reservation and registration. Its factual exit never settles receipts.
  assertChain();const directory=path.join(base(root),"daemon-succession"),names=fs.readdirSync(directory).sort(),pins=names.map(name=>privateFile(path.join(directory,name))),edges=supervisor.validateSuccessionPath(pins.map(p=>p.value.value),pair.daemon.ownedGeneration,current.generation),rows=[],namespaceChecks=[];
  for(const edge of edges){
    const seal=privateFile(path.join(base(root),"supervisor-operations",edge.operationId,"final-stop-inventory.json"));
    if(seal.value.sha256!==edge.operation.finalInventorySha256)ledger.fail("owned_cutover_predecessor_inventory_changed");pins.push(seal);
    const generation=edge.predecessorGeneration,prefix="logs/cep-panel-control/owned/"+generation+"/",transport=path.join(root,"logs","cep-panel-control","owned",generation),files=new Map(seal.value.value.files.filter(f=>f.path.startsWith(prefix)).map(f=>[f.path,f.rawSha256]));
    if(["prior_verified_startup_retirement","prior_verified_maintenance_retirement"].includes(edge.operation.evidenceKind)){
      const maintenance=edge.operation.evidenceKind==="prior_verified_maintenance_retirement",retired=maintenance?supervisor.readVerifiedMaintenanceRetirement(root,generation):supervisor.readVerifiedStartupRetirement(root,generation);if(!retired || retired.operationId!==edge.operation.sourceOperationId || retired.row.sha256!==edge.operation.source?.[maintenance?"maintenanceRetirementReceiptSha256":"startupRetirementReceiptSha256"] || !ledger.same(retired.source,edge.operation.source) || !["absent","initialized_empty"].includes(retired.namespace?.kind))ledger.fail("owned_cutover_startup_retirement_required");
      const witnessed=new Map(retired.namespace.files.map(f=>[f.path,f.rawSha256]));if(!ledger.same([...files.entries()].sort(),[...witnessed.entries()].sort()))ledger.fail("owned_cutover_startup_namespace_inventory_changed");namespaceChecks.push(retired.assertUnchanged);
      if(retired.namespace.kind==="absent"){
        if(files.size || fs.existsSync(transport))ledger.fail("owned_cutover_startup_namespace_late_appearance");namespaceChecks.push(()=>{if(fs.existsSync(transport))ledger.fail("owned_cutover_startup_namespace_late_appearance");});continue;
      }
    }
    if(!files.has(prefix+"identities.json") || !files.has(prefix+"initialized.json") || !fs.existsSync(transport))ledger.fail("owned_cutover_predecessor_transport_missing");
    ledger.safeDirectory(transport);const actual=[],transportNames=fs.readdirSync(transport).sort();let checkpointNames=null;
    for(const name of transportNames){
      if(name==="index-checkpoints"){const checkpoints=path.join(transport,name);ledger.safeDirectory(checkpoints);checkpointNames=fs.readdirSync(checkpoints).sort();for(const receipt of checkpointNames){if(!ledger.UUID.test(receipt.replace(/\.json$/,"")) || !receipt.endsWith(".json"))ledger.fail("owned_cutover_predecessor_transport_partial");actual.push(prefix+name+"/"+receipt);}}
      else {if(!["identities.json","initialized.json"].includes(name) && (!name.endsWith(".json") || !ledger.UUID.test(name.slice(0,-5))))ledger.fail("owned_cutover_predecessor_transport_partial");actual.push(prefix+name);}
    }
    namespaceChecks.push(()=>{ledger.safeDirectory(transport);if(!ledger.same(transportNames,fs.readdirSync(transport).sort()) || checkpointNames && !ledger.same(checkpointNames,fs.readdirSync(path.join(transport,"index-checkpoints")).sort()))ledger.fail("owned_cutover_predecessor_namespace_changed");});
    if(!ledger.same(actual.sort(),[...files.keys()].sort()))ledger.fail("owned_cutover_predecessor_inventory_changed");
    const local=new Map();for(const relative of actual){const pin=privateFile(path.join(root,...relative.split("/")));if(pin.rawSha256!==files.get(relative))ledger.fail("owned_cutover_predecessor_transport_changed");pins.push(pin);local.set(relative,pin);}
    const index=local.get(prefix+"identities.json").value,marker=local.get(prefix+"initialized.json").value;
    if(marker.schema!=="ae-agent.cep-panel-transport.v1" || index.schema!==marker.schema || !index.identities || typeof index.identities!=="object" || Array.isArray(index.identities) || Object.keys(index.identities).length>1000)ledger.fail("owned_cutover_predecessor_index_invalid");
    const ids=Object.keys(index.identities).sort();
    if(actual.some(name=>name!==prefix+"identities.json" && name!==prefix+"initialized.json" && !ids.some(id=>name===prefix+id+".json" || name===prefix+"index-checkpoints/"+id+".json")))ledger.fail("owned_cutover_predecessor_transport_partial");
    for(const id of ids){const row=readIndexedReceipt(transport,id);if(row.ownedGeneration!==generation || row.indexKind!=="owned_receipt_checkpoint" || files.get(prefix+id+".json")!==row.rawReceiptSha256 || files.get(prefix+"index-checkpoints/"+id+".json")!==row.rawIndexSha256)ledger.fail("owned_cutover_predecessor_receipt_changed");rows.push(row);if(rows.length>4096)ledger.fail("owned_cutover_predecessor_receipt_budget");}
  }
  function assertUnchanged(){if(!ledger.same(names,fs.readdirSync(directory).sort()))ledger.fail("owned_cutover_predecessor_chain_changed");namespaceChecks.forEach(check=>check());pins.forEach(p=>p.assertUnchanged());assertChain();}
  assertUnchanged();return {rows,assertUnchanged};
}
function readOriginalTransportInventory(root,{supervisor=require("./owned-runtime-supervisor"),readIndexedReceipt=require("./cep-panel-control").readIndexedReceipt}={}) {
  // The initial successor's private reservation selects the native migration
  // journal. Current namespaces never replace the sealed predecessor inventory.
  const manifest=privateFile(path.join(base(root),"retained-authority.json")),m=validateManifest(manifest.value),initial=m.acceptedRuntimePairs.filter(p=>p.daemon?.ownedGeneration);
  if(initial.length!==1)ledger.fail("owned_cutover_initial_generation_required");
  const pair=initial[0],current=supervisor.readDaemonRegistration(root),chain=supervisor.readCandidate(root,pair.daemon.ownedGeneration),reservation=chain.reservation.value,operationId=reservation.operationId;
  if(!current || !ledger.UUID.test(operationId || "") || chain.reservation.sha256!==pair.reservationSha256 || chain.ticket.sha256!==pair.startupTicketSha256 || reservation.bootNonce!==pair.bootNonce || reservation.sourceSha256!==pair.loadedRuntimeSha256 || pair.loadedRuntimeSha256!==pair.currentRuntimeSha256)ledger.fail("owned_cutover_reserved_generation_invalid");
  resolveRuntimePair(root,pair,{daemon:{pid:current.kernelIdentity.pid,startedAt:current.serviceStartedAt},loadedRuntimeSha256:current.sourceSha256,currentRuntimeSha256:current.sourceSha256});
  const journal=supervisor.readSupervisor(root,operationId).rows,profile=privateFile(path.join(base(root),"profiles",supervisor.LEGACY+".json")),p=profile.value;
  const intent=journal?.intent?.value,attempt=journal?.["native-legacy-attempt"]?.value,result=journal?.["native-legacy-result"]?.value,exit=journal?.["exit-result"]?.value,launch=journal?.["launch-intent"]?.value,finished=journal?.result?.value,seal=journal?.["final-stop-inventory"],v=seal?.value;
  if(journal?.unknown || p.schema!==supervisor.SCHEMA+".legacy-profile" || p.profileId!==supervisor.LEGACY || p.policy?.transition!=="native_forced_legacy_transition" || !ledger.same(p.authorizationRef,m.authorizationRef) || p.successor?.generation!==reservation.generation || p.successor.bootNonce!==pair.bootNonce || p.successor.reservationSha256!==pair.reservationSha256 || p.successor.startupTicketSha256!==pair.startupTicketSha256 || p.sourcePair?.currentSourceSha256!==reservation.sourceSha256 ||
    intent?.schema!==supervisor.SCHEMA+".intent" || intent.operationId!==operationId || intent.targetGeneration!==p.generation || !["ensure","restart"].includes(intent.command) || intent.desiredSourceSha256!==reservation.sourceSha256 || intent.replayAllowed!==false || !ledger.same(intent.authorizationRef,m.authorizationRef) ||
    attempt?.schema!==supervisor.SCHEMA+".native-legacy-attempt" || attempt.operationId!==operationId || attempt.profileRawSha256!==profile.rawSha256 || !sameKernelIdentity(attempt.identity,p.daemon.identity) || attempt.replayAllowed!==false || !Number.isFinite(Date.parse(attempt.attemptedAt)) ||
    result?.schema!==supervisor.SCHEMA+".native-legacy-result" || !sameKernelIdentity(result.identity,p.daemon.identity) || result.shutdownExitProven!==true || !r1.exitProof(result.wait) || result.replayAllowed!==false ||
    exit?.schema!==supervisor.SCHEMA+".held-handle-exit" || exit.targetGeneration!==p.generation || exit.shutdownExitProven!==true || exit.replayAllowed!==false || !sameKernelIdentity(exit.proof?.identity,p.daemon.identity) || !r1.exitProof({...exit.proof,signaled:true}) || exit.proof.waitResult!==result.wait.waitResult || exit.proof.exitCode!==result.wait.exitCode ||
    launch?.generation!==reservation.generation || launch.reservationSha256!==chain.reservation.sha256 || launch.startupTicketSha256!==chain.ticket.sha256 || launch.replayAllowed!==false || finished?.ok!==true || finished.status!=="owned_daemon_registered_admission_closed" || finished.generation!==reservation.generation || finished.writeAdmissionReleased!==false || finished.replayAllowed!==false)ledger.fail("owned_cutover_original_exit_inventory_binding_invalid");
  require("./owned-runtime-win32").validateIdentity(p.daemon.identity);
  const issued=supervisor.loadCurrentDaemonRegistration(root,{generation:reservation.generation,bootNonce:reservation.bootNonce,pid:chain.candidate.value.kernelIdentity.pid,argv:chain.candidate.value.argv,sourceSha256:reservation.sourceSha256,serviceStartedAt:finished.registration?.serviceStartedAt});
  if(!ledger.same(issued,finished.registration))ledger.fail("owned_cutover_initial_registration_changed");
  const key=r1.hash({command:intent.command==="ensure"?"restart":intent.command,targetGeneration:intent.targetGeneration,desiredSourceSha256:intent.desiredSourceSha256}),keyFile=privateFile(path.join(base(root),"supervisor-operation-keys",key+".json")),keyValue=keyFile.value.value;
  if(keyFile.value.sha256!==r1.hash(keyValue) || keyValue?.schema!==supervisor.SCHEMA+".operation-key" || keyValue.operationId!==operationId || keyValue.key!==key || keyValue.replayAllowed!==false)ledger.fail("owned_cutover_operation_key_invalid");
  exact(v,["schema","files","inventorySha256","ingressFenced","historicalOutcome","replayAllowed"],"owned_cutover_sealed_inventory_invalid");
  if(v.schema!==supervisor.SCHEMA+".sealed-inventory" || !Array.isArray(v.files) || v.files.length>4096 || v.inventorySha256!==r1.hash(v.files) || v.ingressFenced!==false || v.historicalOutcome!=="unknown" || v.replayAllowed!==false)ledger.fail("owned_cutover_sealed_inventory_invalid");
  const paths=new Map();for(const f of v.files){exact(f,["path","rawSha256"]);if(typeof f.path!=="string" || path.isAbsolute(f.path) || f.path.includes("\\") || f.path.split("/").some(x=>!x || x==="." || x==="..") || !ledger.SHA.test(f.rawSha256 || "") || paths.has(f.path))ledger.fail("owned_cutover_sealed_inventory_invalid");paths.set(f.path,f.rawSha256);}
  const capsule=privateFile(path.join(root,"logs","evidence","native-fixture-retained-maintenance","capture.json"));
  if(p.capsule?.path!==path.join(root,"logs","evidence","native-fixture-retained-maintenance","capture.json") || p.capsule.rawSha256!==capsule.rawSha256 || p.capsule.envelopeSha256!==capsule.value.sha256 || capsule.value.sha256!==ledger.hash(capsule.value.value) || capsule.value.value?.schema!=="ae-agent.native-fixture-retained-maintenance.v1.capture" || capsule.value.value.replayAllowed!==false || capsule.value.value.observed?.authority?.manifestRawSha256!==manifest.rawSha256)ledger.fail("owned_cutover_original_capsule_invalid");
  const directory=path.join(root,"logs","cep-panel-control"),index=privateFile(path.join(directory,"identities.json")),data=index.value;
  if(index.rawSha256!==m.originalPins.transportIndexRawSha256 || paths.get("logs/cep-panel-control/identities.json")!==index.rawSha256 || data.schema!=="ae-agent.cep-panel-transport.v1" || !data.identities || Array.isArray(data.identities) || Object.keys(data.identities).length>1000)ledger.fail("owned_cutover_original_index_changed");
  const rows=[];for(const id of Object.keys(data.identities).sort()){const row=readIndexedReceipt(directory,id);if(row.rawIndexSha256!==index.rawSha256 || paths.get("logs/cep-panel-control/"+id+".json")!==row.rawReceiptSha256)ledger.fail("owned_cutover_original_receipt_changed");rows.push(row);}
  const journalPins=Object.keys(journal).map(k=>{const pin=privateFile(path.join(base(root),"supervisor-operations",operationId,k+".json"));if(!ledger.same(pin.value,journal[k]))ledger.fail("owned_cutover_journal_changed");return pin;}),receiptPins=rows.map(row=>privateFile(require("./cep-panel-control").createReceiptPath(directory,row.row.requestId)));
  const predecessors=readPredecessorTransportInventory(root,pair,current,{supervisor,readIndexedReceipt}),allRows=[...rows,...predecessors.rows];
  if(new Set(allRows.map(r=>r.row.requestId)).size!==allRows.length)ledger.fail("owned_cutover_request_namespace_collision");
  function assertUnchanged(){manifest.assertUnchanged();profile.assertUnchanged();keyFile.assertUnchanged();capsule.assertUnchanged();index.assertUnchanged();journalPins.forEach(p=>p.assertUnchanged());receiptPins.forEach(p=>p.assertUnchanged());predecessors.assertUnchanged();const latest=supervisor.readDaemonRegistration(root);if(!ledger.same(latest,current))ledger.fail("owned_cutover_current_generation_changed");}
  assertUnchanged();return {generation:current.generation,operationId,finalInventorySha256:seal.sha256,rows:allRows,assertUnchanged};
}
// An old audited runtime is usable only as an exact registration on the
// unique, fully HMAC-verified path from the immutable anchor to current.
function readPredecessorAudit(root,auditedRuntime,current){
  const supervisor=require("./owned-runtime-supervisor"),manifest=privateFile(path.join(base(root),"retained-authority.json")),m=validateManifest(manifest.value),pairs=m.acceptedRuntimePairs.filter(p=>p.daemon?.ownedGeneration);
  if(pairs.length!==1 || !current)ledger.fail("owned_panel_reload_current_r2_audit_required");const pair=pairs[0],runtime={daemon:{pid:current.kernelIdentity.pid,startedAt:current.serviceStartedAt},loadedRuntimeSha256:current.sourceSha256,currentRuntimeSha256:current.sourceSha256};
  function chain(){if(!ledger.same(supervisor.resolveRetainedSuccession(root,pair,runtime),current))ledger.fail("owned_panel_reload_current_r2_audit_required");}chain();
  const dir=path.join(base(root),"daemon-succession"),names=fs.readdirSync(dir).sort(),pins=names.map(n=>privateFile(path.join(dir,n))),edges=supervisor.validateSuccessionPath(pins.map(p=>p.value.value),pair.daemon.ownedGeneration,current.generation),matches=[];
  for(const e of edges){const candidate=supervisor.readCandidate(root,e.predecessorGeneration).candidate.value,reg=supervisor.loadCurrentDaemonRegistration(root,{generation:candidate.generation,bootNonce:candidate.bootNonce,pid:candidate.kernelIdentity.pid,argv:candidate.argv,sourceSha256:candidate.sourceSha256});
    if(auditedRuntime?.daemon?.pid===reg.kernelIdentity.pid && auditedRuntime.daemon.startedAt===reg.serviceStartedAt && auditedRuntime.loadedRuntimeSha256===reg.sourceSha256 && auditedRuntime.currentRuntimeSha256===reg.sourceSha256)matches.push({reg,edge:e});}
  if(matches.length!==1)ledger.fail("owned_panel_reload_current_r2_audit_required");const match=matches[0];if(match.edge.operation.evidenceKind!=="prior_verified_maintenance_retirement")ledger.fail("owned_panel_reload_current_r2_audit_required");
  const retirement=supervisor.readVerifiedMaintenanceRetirement(root,match.reg.generation);if(!retirement || retirement.row.sha256!==match.edge.operation.source.maintenanceRetirementReceiptSha256)ledger.fail("owned_panel_reload_current_r2_audit_required");
  function assertUnchanged(){manifest.assertUnchanged();pins.forEach(p=>p.assertUnchanged());retirement.assertUnchanged();if(!ledger.same(names,fs.readdirSync(dir).sort()))ledger.fail("owned_panel_reload_predecessor_chain_changed");chain();}
  assertUnchanged();return {generation:match.reg.generation,registration:match.reg,retirementReceiptSha256:retirement.row.sha256,successionPathSha256:ledger.hash(edges),stageRefs:retirement.acquisition.state.panelReloadStage.files,assertUnchanged};
}
function inspectRetainedInstalledTarget(root) {
  if(path.resolve(root)!==path.resolve(__dirname,"..") || !process.env.APPDATA)ledger.fail("owned_retained_installed_namespace_required");
  const manifest=privateFile(path.join(base(root),"retained-authority.json")),m=validateManifest(manifest.value),owned=loadRetained(root,m.selector);
  const installedRoot=path.join(process.env.APPDATA,"Adobe","CEP","extensions","com.codex.aemcpbridge");
  // Structural namespace/ID/menu/duplicate checks are the existing bootstrap
  // contract. The installed bytes are a read-only preimage, sealed by capture.
  const selected=require("./ae-agent-panel-bootstrap").inspectInstalledTarget(undefined,installedRoot);
  if(path.resolve(selected.root)!==path.resolve(installedRoot))ledger.fail("owned_retained_installed_namespace_required");
  for(const [asset,digest] of Object.entries(selected.hashes))if(ledger.hash(ledger.readBytes(path.join(selected.root,asset)))!==digest)ledger.fail("owned_retained_installed_preimage_changed");
  manifest.assertUnchanged();owned.assertUnchanged();return selected;
}
module.exports={POLICY,RETAINED,PROFILE,CAPABILITIES,PIN_KEYS,runtimeControlFor,base,privateFile,validatePolicy,validateManifest,loadPolicy,loadRetained,resolveRuntimePair,readCleanupNativeResult,currentTransportDirectory,selectTransportDirectory,receiptTransportDirectory,readPredecessorTransportInventory,readOriginalTransportInventory,inspectRetainedInstalledTarget,readPredecessorAudit,exact};

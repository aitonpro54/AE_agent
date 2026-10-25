"use strict";
// Fixed server readers only; no process inventory, close, native grants or keys.
const fs=require("node:fs"),path=require("node:path");
const existing=require("./native-fixture-abandonment-backend"),proof=require("./native-fixture-prephase-recovery-proof"),ledger=require("./native-fixture-attempt-ledger"),bootstrap=require("./ae-agent-panel-bootstrap"),control=require("./cep-panel-control");
const lifecycleState=require("./project-lifecycle-state"),{normalizeProject}=require("./proposal-state");
function primaryProject(value,expectedFile) {
  const p=lifecycleState.normalizeProjectLifecycleState(value),expected=normalizeProject(expectedFile);
  if(p.projectPresent!==true || p.supported.file!==true || p.supported.dirty!==true || p.supported.revision!==true || p.project!=="named" || !expected)ledger.fail("fixture_prephase_primary_state_required");
  if(normalizeProject(p.file)!==expected)ledger.fail("fixture_prephase_primary_state_changed");
  return Object.freeze({file:expected,dirty:p.dirty,revision:p.revision});
}
function checkpointProjection(cp) {
  return {label:cp?.label || null,sourceFile:normalizeProject(cp?.sourceFile),checkpointFile:normalizeProject(cp?.checkpointFile),bytes:cp?.bytes || null,createdAt:cp?.createdAt || null};
}
// Exact approved installed 3.3.1 bytes before this bounded panel update. Both
// script bodies match fb29a72 after line-ending normalization; authority here
// uses these original byte hashes, never normalized text or a Git label.
const APPROVED_OLD_ASSETS=Object.freeze({
  "CSXS/manifest.xml":"1d159ca7a1a95ee4733e396dfb7df1b0c079e3269b342b0ac3d1e9c601590af7",
  "index.html":"bee9e52f7d7262cddcddbd0efdf3aa14f17011ffb18c997d592bc5d4f2c6beee",
  "panel-action-contract.js":"78937c094982cc68cc7c06e85955e09b5c5d5fe741f5c5a84a52c816ea0328df",
  "panel-actions.js":"d8bcd31a4c00e3c5b08241f7cc2b38dec7e7dfe473016b6c01a1693e1471fd56",
  "panel.js":"b499f10ca3b89b733415fdfdda61ccefedc41a8b586f758739e576c5b5b8f898",
  "style.css":"7b02db47543f180d1c3ba2ec40e73911fc7f7fb2c4d815a265bae962ccb0e343",
  "lib/CSInterface.js":"67a3d2a4bc38d7facbf2fdfbd67e68f734321bd47fdeafa858fda284241356c1"
});
function assertApprovedInstalledHashes(hashes) {
  const assets=Object.keys(APPROVED_OLD_ASSETS),keys=hashes && Object.keys(hashes);
  if(!keys || keys.length!==assets.length || keys.some(key=>!assets.includes(key)))ledger.fail("fixture_prephase_installed_assets_not_approved");
  const desired=Object.fromEntries(assets.map(asset=>[asset,ledger.hash(ledger.readBytes(path.resolve(__dirname,"..","cep-panel",asset)))]));
  if(![APPROVED_OLD_ASSETS,desired].some(set=>assets.every(asset=>hashes[asset]===set[asset])))ledger.fail("fixture_prephase_installed_assets_not_approved");
}
function installedHistoricalTarget() {
  const roots=[process.env.APPDATA && path.join(process.env.APPDATA,"Adobe","CEP","extensions"),process.env.CommonProgramFiles && path.join(process.env.CommonProgramFiles,"Adobe","CEP","extensions"),process.env["CommonProgramFiles(x86)"] && path.join(process.env["CommonProgramFiles(x86)"],"Adobe","CEP","extensions")].filter(Boolean);
  const found=[...new Set(roots)].map(root=>path.join(root,bootstrap.TARGET.bundleId)).filter(root=>fs.existsSync(path.join(root,"index.html")));
  if(found.length!==1)ledger.fail("fixture_prephase_installed_target_ambiguous");
  // Self-source inspection retains exact installed identity/uniqueness checks.
  // Then accept one whole approved old set OR the current repository byte set;
  // a partial copy or arbitrary installed revision cannot enter this reader.
  // Generic control continues to require installed == repository source.
  const target=bootstrap.inspectInstalledTarget(undefined,found[0]);
  assertApprovedInstalledHashes(target.hashes);
  return target;
}
function createReaders(deps) {
  const panelService=deps.panelService || control.createPanelControlService({inspectInstalledTarget:installedHistoricalTarget}),base=existing.createReaders({...deps,panelService});
  const protections=new WeakMap();
  function ownedProtection(context) {
    deps.assertManualIngress(context);
    if(typeof deps.getAdmissionProtection!=="function")ledger.fail("fixture_prephase_owned_protection_required");
    const observed=deps.getAdmissionProtection(context),entry=observed?.entry,session=observed?.activeEditSession,cp=context?.checkpoint;
    if(!entry || entry.record!==context.record || entry.run?.id!==context.runId || entry.checkpoint!==cp || entry.run.safety?.activeEditSessionAtStart!==false || entry.run.safety.protection!=="auto_edit_session" ||
      !entry.ownedEditSessionId || !session || session.id!==entry.ownedEditSessionId || session.status!=="active" || session.checkpoint!==cp || !Array.isArray(session.operations) || session.operations.length!==0 ||
      !cp || !normalizeProject(cp.checkpointFile) || normalizeProject(cp.sourceFile)!==normalizeProject(context.record.project?.expectedFile) || !normalizeProject(context.record.project?.expectedFile))ledger.fail("fixture_prephase_owned_protection_required");
    const baseline=entry.primaryBaseline;
    if(!baseline || baseline.file!==normalizeProject(context.record.project.expectedFile) || typeof baseline.dirty!=="boolean" || !Number.isSafeInteger(baseline.revision) || baseline.revision<0)ledger.fail("fixture_prephase_primary_state_required");
    return {entry,session,projection:{schema:"ae-agent.native-fixture-admission-protection.v1",runId:context.runId,actionId:context.record.actionId,ownedEditSessionId:session.id,checkpoint:checkpointProjection(cp),primary:ledger.clone(baseline)}};
  }
  return {...base,assertManualIngress:deps.assertManualIngress,currentRuntimeSha256:deps.currentRuntimeSha256,hasCurrentProposal:deps.hasCurrentProposal,
    async readAdmissionProtection(context) {
      const before=ownedProtection(context);
      if(typeof deps.readPrimaryProjectLifecycle!=="function")ledger.fail("fixture_prephase_primary_state_required");
      const primary=primaryProject(await deps.readPrimaryProjectLifecycle(),context.record.project.expectedFile),after=ownedProtection(context);
      if(before.entry!==after.entry || before.session!==after.session || !ledger.same(before.projection,after.projection))ledger.fail("fixture_prephase_owned_protection_changed");
      if(!ledger.same(primary,after.projection.primary))ledger.fail("fixture_prephase_primary_state_changed");
      const witness=Object.freeze(after.projection);protections.set(witness,{context,entry:after.entry,session:after.session,projection:ledger.clone(witness)});return witness;
    },
    assertAdmissionProtection(context,witness,statusSession) {
      const saved=witness && protections.get(witness),current=ownedProtection(context);
      if(!saved || saved.context!==context || saved.entry!==current.entry || saved.session!==current.session || !ledger.same(saved.projection,witness) || !ledger.same(witness,current.projection))ledger.fail("fixture_prephase_owned_protection_changed");
      if(arguments.length>=3 && (!statusSession || statusSession.id!==witness.ownedEditSessionId || statusSession.status!=="active" || statusSession.operationCount!==0 || statusSession.latestOperation!==null || !ledger.same(checkpointProjection(statusSession.checkpoint),witness.checkpoint)))ledger.fail("fixture_prephase_owned_protection_changed");
    },
    readDaemonRuntime() {const v=deps.readBridgeStatus().humanGuardRuntime;return {daemon:{pid:v.pid,startedAt:v.startedAt},loadedRuntimeSha256:deps.loadedRuntimeSha256,currentRuntimeSha256:deps.currentRuntimeSha256()};},
    readIssuerIsolation() {
      const loaded=deps.loadedRuntimeModules.filter(m=>m.name==="mcp-server/ame-native-fixture-grant.js");
      if(loaded.length!==1)ledger.fail("fixture_prephase_loaded_issuer_unknown");
      return {originalAttemptPresent:deps.hasAttempt(proof.PROFILE.stageId),originalAuthorityImportAvailable:false,
        loadedIssuerSha256:loaded[0].sha256,currentIssuerSha256:ledger.hash(ledger.readBytes(path.join(deps.projectRoot,"mcp-server","ame-native-fixture-grant.js")))};
    }
  };
}
module.exports={createReaders,APPROVED_OLD_ASSETS,assertApprovedInstalledHashes,primaryProject};

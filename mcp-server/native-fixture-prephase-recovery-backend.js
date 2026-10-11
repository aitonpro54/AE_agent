"use strict";
// Fixed server readers only; no process inventory, close, native grants or keys.
const fs=require("node:fs"),path=require("node:path");
const existing=require("./native-fixture-abandonment-backend"),proof=require("./native-fixture-prephase-recovery-proof"),ledger=require("./native-fixture-attempt-ledger"),bootstrap=require("./ae-agent-panel-bootstrap"),control=require("./cep-panel-control");
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
  return {...base,assertManualIngress:deps.assertManualIngress,currentRuntimeSha256:deps.currentRuntimeSha256,hasCurrentProposal:deps.hasCurrentProposal,
    readDaemonRuntime() {const v=deps.readBridgeStatus().humanGuardRuntime;return {daemon:{pid:v.pid,startedAt:v.startedAt},loadedRuntimeSha256:deps.loadedRuntimeSha256,currentRuntimeSha256:deps.currentRuntimeSha256()};},
    readIssuerIsolation() {
      const loaded=deps.loadedRuntimeModules.filter(m=>m.name==="mcp-server/ame-native-fixture-grant.js");
      if(loaded.length!==1)ledger.fail("fixture_prephase_loaded_issuer_unknown");
      return {originalAttemptPresent:deps.hasAttempt(proof.PROFILE.stageId),originalAuthorityImportAvailable:false,
        loadedIssuerSha256:loaded[0].sha256,currentIssuerSha256:ledger.hash(ledger.readBytes(path.join(deps.projectRoot,"mcp-server","ame-native-fixture-grant.js")))};
    }
  };
}
module.exports={createReaders,APPROVED_OLD_ASSETS,assertApprovedInstalledHashes};

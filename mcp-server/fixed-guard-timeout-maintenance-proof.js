"use strict";
// Filesystem-only audit for the exact consumed predecessor deployment. This is
// inspection identity evidence, never reload, admission or execution authority.
const fs=require("node:fs"),path=require("node:path"),ledger=require("./native-fixture-attempt-ledger"),human=require("./human-guard-settlement"),ame=require("./ame-fixture-ui-disposition"),native=require("./native-fixture-abandonment"),recovery=require("./native-fixture-prephase-recovery"),proof=require("./native-fixture-prephase-recovery-proof"),records=require("./plan-run-records"),control=require("./cep-panel-control"),bootstrap=require("./ae-agent-panel-bootstrap");
const {hash,same,clone,fail,SHA}=ledger,SCHEMA="ae-agent.native-fixture-prephase-maintenance.v1",ASSETS=human.ASSETS,COPY_ASSETS=["panel-actions.js","panel.js"];
const FIXED_PARENT_PINS=Object.freeze({
  "capture":"105902fcb1cb18b3494f5d77113ebe1270ed10bf14f7d14387693fd377e4868c",
  "apply-attempt":"ad1ee0129b2df4a0d4113a01f2c569026a31614a8b380ecd92f4cff9c1248bf2",
  "backup-index":"d0fc01b154e891b8eab41f8fdba6d36ba953358e65206e5afc473b66973f2670",
  "reload-attempt":"15054bb38f8baf6bc2358533b13026f8e05636fda9d7f11840a2de2e9a16b06b",
  "reload-result":"02673a6d0008d25d787f059e56fa98b0ed988ad5657cb06603b8dab820cf5c9a",
  fileBytesSha256:Object.freeze({
    "capture":"f3c608a0a4dbf7c0ae547cb7ba205ea61049421d80b112c5dce537abb6c52352",
    "apply-attempt":"e74b0907d85deade13f0052ce99eca8cb216c93dd92f5aa2d4a8174b92002095",
    "backup-index":"339db5e4af837248073f58ceefab62df2c7f91b972ddfe70007c21c3df548b0e",
    "reload-attempt":"fbb9341ec835fb23828bac523e82e5ac4bdf47eee9bae70eb472eebddd6d001a",
    "reload-result":"23a30c8760e878cd91a5dcfddf27b2cf6e32faa7a2d3272b66694a89b3c0db3f"
  }),
  certificateSha256:"d0964fee7554f56b3744b56c5d93cece2f18a6e27ac023ca3d8f8d2ec10dcafc",
  timerPanelSha256:"2682022122fc4b229670ffe794456c98fcb07680dfb30cd10ffd8b039ef0c1fc"
});
const KINDS=["capture","apply-attempt","backup-index","reload-attempt","reload-result"];
function directory(root){return path.join(root,"evidence","native-fixture-prephase-maintenance-20261011");}
function hashSet(value){return value && same(Object.keys(value).sort(),ASSETS.slice().sort()) && Object.values(value).every(v=>SHA.test(v || ""));}
// Explicit private Node core for synthetic offline evidence. No CLI/MCP caller
// can replace the production pins or the trusted lookup functions below.
function auditConsumedChain({repoRoot,evidenceRoot},pins) {
  const dir=directory(evidenceRoot);ledger.safeDirectory(dir);
  if(!same(fs.readdirSync(dir).sort(),KINDS.map(k=>k+".json").concat("backups").sort()))fail("guard_timeout_parent_inventory_changed");
  const rows={},fileBytesSha256={};
  for(const kind of KINDS){const bytes=ledger.readBytes(path.join(dir,kind+".json")),row=JSON.parse(bytes);if(row.schema!==SCHEMA+".envelope" || row.value?.schema!==SCHEMA+"."+kind || row.sha256!==pins[kind] || hash(row.value)!==row.sha256)fail("guard_timeout_parent_chain_changed");
    fileBytesSha256[kind]=hash(bytes);if(fileBytesSha256[kind]!==pins.fileBytesSha256?.[kind])fail("guard_timeout_parent_bytes_changed");rows[kind]=row;}
  const capture=rows.capture,observed=capture.value.observed,apply=rows["apply-attempt"].value,backup=rows["backup-index"].value,reload=rows["reload-attempt"].value,result=rows["reload-result"].value;
  if(!observed || observed.trust?.certificate?.sha256!==pins.certificateSha256 || apply.captureSha256!==capture.sha256 || apply.certificateSha256!==pins.certificateSha256 || apply.replayAllowed!==false ||
    backup.captureSha256!==capture.sha256 || backup.applyAttemptSha256!==rows["apply-attempt"].sha256 || reload.captureSha256!==capture.sha256 || reload.applyAttemptSha256!==rows["apply-attempt"].sha256 || reload.backupSha256!==rows["backup-index"].sha256 ||
    reload.certificateSha256!==pins.certificateSha256 || reload.status!=="reserved_before_sole_send" || reload.replayAllowed!==false || result.reloadAttemptSha256!==rows["reload-attempt"].sha256 || result.status!=="reload_submitted" || result.replayAllowed!==false ||
    [apply,reload].some(v=>!["target","actor","runtime"].every(k=>same(v[k],observed[k]))) || capture.value.replayAllowed!==false)fail("guard_timeout_parent_chain_changed");
  const backups=path.join(dir,"backups");ledger.safeDirectory(backups);
  if(!same(fs.readdirSync(backups).sort(),COPY_ASSETS.slice().sort()) || !same(backup.hashes,Object.fromEntries(COPY_ASSETS.map(a=>[a,observed.installed?.hashes?.[a]]))))fail("guard_timeout_parent_backup_changed");
  const backupBytesSha256={};for(const asset of COPY_ASSETS){const bytes=ledger.readBytes(path.join(backups,asset));backupBytesSha256[asset]=hash(bytes);if(backupBytesSha256[asset]!==backup.hashes[asset])fail("guard_timeout_parent_backup_changed");}
  if(!hashSet(observed.desiredAssetHashes) || !hashSet(observed.installed.hashes))fail("guard_timeout_parent_assets_invalid");
  const desiredAssetHashes=Object.fromEntries(ASSETS.map(a=>[a,hash(ledger.readBytes(path.join(repoRoot,"cep-panel",a)))]));
  if(desiredAssetHashes["panel.js"]!==pins.timerPanelSha256 || ASSETS.some(a=>a!=="panel.js" && desiredAssetHashes[a]!==observed.desiredAssetHashes[a]))fail("guard_timeout_source_delta_invalid");
  const index=JSON.parse(ledger.readBytes(path.join(evidenceRoot,"cep-panel-control","identities.json")));
  if(index.schema!=="ae-agent.cep-panel-transport.v1" || !index.identities || !Array.isArray(observed.originals) || observed.originals.length!==7)fail("guard_timeout_parent_original_changed");
  for(const original of observed.originals){const s=original.selector;if(!ledger.UUID.test(s?.requestId || "") || !ledger.UUID.test(s?.runId || "") || original.entry?.originalRequestId!==s.requestId || original.entry.runId!==s.runId ||
    original.entry.action!=="plan.run" || original.entry.effect!=="protected_plan_run" || hash(ledger.readBytes(records.fileFor(evidenceRoot,s.runId)))!==original.canonicalBytesSha256 || original.canonicalBytesSha256!==original.entry.canonicalRunRecordHash)fail("guard_timeout_parent_original_changed");
    const file=control.createReceiptPath(path.join(evidenceRoot,"cep-panel-control"),s.requestId);
    if(original.transportOriginalAbsent===true){if(Object.hasOwn(index.identities,s.requestId) || fs.existsSync(file))fail("guard_timeout_parent_original_changed");}
    else {const local=control.loadDurableReceipt(path.join(evidenceRoot,"cep-panel-control"),s.requestId);if(!local || local.phase==="receipt_storage" || hash(ledger.readBytes(file))!==original.transportBytesSha256)fail("guard_timeout_parent_original_changed");}
  }
  return {capture,observed,parentPins:{envelopeHashes:Object.fromEntries(KINDS.map(k=>[k,rows[k].sha256])),fileBytesSha256,backupBytesSha256},predecessorAssetHashes:clone(observed.desiredAssetHashes),predecessorLoadedHashes:clone(observed.desiredLoadedHashes),desiredAssetHashes};
}
function auditParent(options) {
  const audited=auditConsumedChain(options,FIXED_PARENT_PINS),p=audited.observed.trust;
  const certificate=recovery.lookupAudited(proof.selector(),options),h=human.lookup(options.evidenceRoot),a=ame.lookupAudited(options.evidenceRoot),ns=audited.observed.originals.slice(3,6).map(o=>native.lookupAudited(o.selector,options));
  function matches(saved,pin){return saved && saved.schema===pin.schema && saved.sha256===pin.sha256 && (!pin.auditSha256 || saved.auditSha256===pin.auditSha256) && (!pin.consumptionSha256 || saved.consumptionSha256===pin.consumptionSha256);}
  if(!matches(certificate,p.certificate) || !matches(h,p.human) || !matches(a,p.ame) || ns.some((n,i)=>!matches(n,p.native[i])) ||
    !same([h.value.entries[0],h.value.entries[1],a.value.entry,...ns.map(n=>n.value.entry),certificate.value.entry],audited.observed.originals.map(o=>o.entry)))fail("guard_timeout_parent_trusted_audit_changed");
  return audited;
}
function assertInspectionHashes(hashes,audited){if(!hashSet(hashes) || ![audited.predecessorAssetHashes,audited.desiredAssetHashes].some(set=>ASSETS.every(a=>hashes[a]===set[a])))fail("guard_timeout_inspection_assets_not_approved");}
function inspectInstalledTarget(options){const audited=auditParent(options),roots=[process.env.APPDATA && path.join(process.env.APPDATA,"Adobe","CEP","extensions"),process.env.CommonProgramFiles && path.join(process.env.CommonProgramFiles,"Adobe","CEP","extensions"),process.env["CommonProgramFiles(x86)"] && path.join(process.env["CommonProgramFiles(x86)"],"Adobe","CEP","extensions")].filter(Boolean),found=[...new Set(roots)].map(root=>path.join(root,bootstrap.TARGET.bundleId)).filter(root=>fs.existsSync(path.join(root,"index.html")));
  if(found.length!==1)fail("guard_timeout_inspection_target_ambiguous");
  const selected=bootstrap.inspectInstalledTarget(undefined,found[0]);assertInspectionHashes(selected.hashes,audited);
  if(selected.indexPath.toLowerCase()!==audited.observed.installed.indexPath.toLowerCase())fail("guard_timeout_inspection_target_changed");return selected;
}
module.exports={FIXED_PARENT_PINS,ASSETS,directory,auditConsumedChain,auditParent,assertInspectionHashes,inspectInstalledTarget};

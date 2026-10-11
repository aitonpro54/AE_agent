"use strict";

// Fixed, read-only backend observations. The caller supplies UUID references,
// never process evidence, receipt bytes, paths, CDP expressions or native grants.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const control=require("./cep-panel-control"),legacy=require("./ame-fixture-ui-backend"),abandonment=require("./native-fixture-abandonment"),ledger=require("./native-fixture-attempt-ledger");
const runner=require("./ame-native-fixture-runner");
function createReaders(deps) {
  return {evidenceRoot:deps.evidenceRoot,repoRoot:deps.projectRoot,maintenanceTarget:()=>deps.panelService.maintenanceTarget(),readBridgeStatus:deps.readBridgeStatus,
    async readPanelGuard(value) {
      const s=abandonment.selector(value),selected=await deps.panelService.maintenanceTarget();
      const retained=require("./native-fixture-retained"),managed=fs.existsSync(retained.managedFile(deps.projectRoot,s.runId));
      const dir=managed?require("./owned-runtime-authority").selectTransportDirectory(deps.projectRoot,deps.evidenceRoot,s):path.join(deps.evidenceRoot,"cep-panel-control"),local=control.loadDurableReceipt(dir,s.requestId);
      if(retained.isRetainedReceipt(local) || managed)return readRetainedPanelGuard(selected,s);
      const expression="(function(){var api=window.AEAgentPanelActions;if(!api||typeof api.readNativeFixtureGuard!=='function')return null;return api.readNativeFixtureGuard("+JSON.stringify(s)+");})()";
      return control.evaluateViaWebSocket(selected.target.webSocketDebuggerUrl,expression,5000);
    },
    readTransportRetained(value){const s=abandonment.selector(value),dir=fs.existsSync(require("./native-fixture-retained").managedFile(deps.projectRoot,s.runId))?require("./owned-runtime-authority").selectTransportDirectory(deps.projectRoot,deps.evidenceRoot,s):path.join(deps.evidenceRoot,"cep-panel-control");return control.readIndexedReceipt(dir,s.requestId);},
    loadOwnedWitness(value,options){return require("./owned-runtime-authority").loadRetained(deps.projectRoot,abandonment.selector(value),options);},
    async readRuntimeIdentity() {
      const selected=await deps.panelService.maintenanceTarget();await legacy.loadedPanelSources(selected);const runtime=deps.readBridgeStatus().humanGuardRuntime;
      return {daemon:{pid:runtime.pid,startedAt:runtime.startedAt},loadedRuntimeSha256:deps.loadedRuntimeSha256,currentRuntimeSha256:deps.currentRuntimeSha256(),panelAssetHashes:selected.installed.hashes};
    },
    readTransportAbsence(value) {
      const s=abandonment.selector(value),dir=path.join(deps.evidenceRoot,"cep-panel-control"),row=control.loadDurableReceipt(dir,s.requestId);
      const index=JSON.parse(fs.readFileSync(path.join(dir,"identities.json"),"utf8"));
      if(row!==null || index.schema!=="ae-agent.cep-panel-transport.v1" || !index.identities || Object.hasOwn(index.identities,s.requestId))ledger.fail("fixture_abandonment_transport_present_or_corrupt");
      const status=deps.readBridgeStatus();return {requestId:s.requestId,originalReceiptAbsent:true,pendingCount:status.pendingCommands,inflightCount:status.inflightCommands.length};
    },
    readExecutorQuiescence:()=>deps.executorQuiescence(),
    async readChildState(d,p,identitySource) {
      let current;
      if(identitySource==="trusted_process_handle") {
        const row=await (deps.inspectProcess || runner.inspectProcess)(p.pid);current=row ? [{...row,createdAt:row.createdAt}] : [];
      } else if(identitySource==="historical_cim") {
        const rows=await (deps.inspectAE || legacy.inventoryAE)();if(!Array.isArray(rows))ledger.fail("fixture_abandonment_process_inventory_invalid");current=rows.filter(r=>r.pid===p.pid);
      } else ledger.fail("fixture_abandonment_identity_reader_required");
      if(current.length>1)return {status:"unknown"};
      if(!current.length)return {status:"absent_inventory_is_not_exit_proof"};
      const row=current[0];
      if(ledger.birthIdentity(row.createdAt)!==ledger.birthIdentity(p.createdAt) || Date.parse(row.createdAt)!==p.createdUnixMs || String(row.path).toLowerCase()!==d.executablePath.toLowerCase())return {status:"identity_mismatch"};
      if(ledger.hash(ledger.readBytes(d.executablePath))!==d.executableSha256 || ledger.hash(ledger.readBytes(d.pluginPath))!==d.pluginSha256)return {status:"identity_mismatch"};
      return {status:"alive_exact",pid:p.pid,createdUnixMs:p.createdUnixMs};
    },
    acquireWriterLock:()=>control.acquireControllerLock(path.join(deps.evidenceRoot,"cep-panel-control"),crypto.randomUUID())
  };
}
async function readRetainedPanelGuard(selected,value,evaluate=control.evaluateViaWebSocket) {
  const s=abandonment.selector(value);
  // This fixed selector reads the ORIGINAL persisted private row and index.
  // Neither arbitrary expressions nor caller-authored evidence enter the API.
  const expression="(function(s){var api=window.AEAgentPanelActions;if(!api||!window.localStorage)return null;var before=api.state(),publicBefore=api.getResult(s.requestId),raw=localStorage.getItem('codexAePanelActionReceipts'),indexRaw=localStorage.getItem('codexAePanelActionReceiptIndex'),parsed=JSON.parse(raw),index=JSON.parse(indexRaw),row=parsed.records[s.requestId],identity=index[s.requestId],publicAfter=api.getResult(s.requestId),after=api.state();if(raw!==localStorage.getItem('codexAePanelActionReceipts')||indexRaw!==localStorage.getItem('codexAePanelActionReceiptIndex')||JSON.stringify(publicBefore)!==JSON.stringify(publicAfter)||before.panelInstanceId!==after.panelInstanceId||before.panelLifecycleEpoch!==after.panelLifecycleEpoch||before.panelGeneration!==after.panelGeneration)return null;return {privateRecord:row,indexEntry:identity,publicProjection:publicAfter,currentBinding:{panelInstanceId:after.panelInstanceId,panelLifecycleEpoch:after.panelLifecycleEpoch,panelGeneration:after.panelGeneration},controllerIdle:after.activeAction===null&&!after.recoveryTransport&&after.actionStorage==='ready',storeVersion:parsed.version};})("+JSON.stringify(s)+")";
  const v=await evaluate(selected.target.webSocketDebuggerUrl,expression,5000),r=v?.privateRecord,i=v?.indexEntry;
  if(v?.storeVersion!==1 || !r || r.requestId!==s.requestId || r.runId!==s.runId || typeof r.signature!=="string" || !i || i.action!==r.action || i.signature!==r.signature || !require("./native-fixture-retained").isRetainedReceipt(r) || !ledger.same(require("./native-fixture-retained").projection(v.publicProjection),controlProjection(r)))ledger.fail("retained_private_indexed_panel_record_required");
  return {projection:controlProjection(r),adoption:v.publicProjection.nativeFixtureRetained || null,signatureSha256:ledger.hash(r.signature),privateRecordSha256:ledger.hash(r),privateIndexEntrySha256:ledger.hash(i),currentBinding:v.currentBinding,controllerIdle:v.controllerIdle};
}
function controlProjection(r){return require("./native-fixture-retained").projection(r);}
module.exports={createReaders,readRetainedPanelGuard};

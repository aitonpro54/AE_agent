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
      const expression="(function(){var api=window.AEAgentPanelActions;if(!api||typeof api.readNativeFixtureGuard!=='function')return null;return api.readNativeFixtureGuard("+JSON.stringify(s)+");})()";
      return control.evaluateViaWebSocket(selected.target.webSocketDebuggerUrl,expression,5000);
    },
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
module.exports={createReaders};

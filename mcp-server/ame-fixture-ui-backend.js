"use strict";
// Backend readers for the one historical fixture disposition. No native calls,
// replay, transport manufacture or general-purpose CDP expressions.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const {execFile} = require("node:child_process"), {pathToFileURL} = require("node:url");
const control = require("./cep-panel-control"), disposition = require("./ame-fixture-ui-disposition");
const SHA = value => crypto.createHash("sha256").update(value).digest("hex");
const normalized = value => value.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
function fail(code) { throw Object.assign(Error(code), {code}); }
async function loadedPanelSources(selected) {
  const address = selected.target.webSocketDebuggerUrl;
  if (!/^ws:\/\/127\.0\.0\.1:8870\//.test(address) || typeof WebSocket !== "function") fail("fixture_disposition_cdp_target_invalid");
  const socket = new WebSocket(address), scripts = [], pending = new Map(); let sequence = 0;
  let rejectOpen;
  const opened = new Promise((resolve,reject) => { rejectOpen=reject;socket.onopen = resolve; socket.onerror = () => {reject(Error("fixture_disposition_cdp_failed"));rejectAll("fixture_disposition_cdp_failed");}; });
  const rejectAll = code => { for (const p of pending.values()) p.reject(Error(code)); pending.clear(); };
  const timer = setTimeout(() => {rejectOpen(Error("fixture_disposition_cdp_timeout"));rejectAll("fixture_disposition_cdp_timeout");socket.close();}, 10000);
  socket.onclose = () => {rejectOpen(Error("fixture_disposition_cdp_closed"));rejectAll("fixture_disposition_cdp_closed");};
  socket.onmessage = event => {
    try {
      if (typeof event.data !== "string" || Buffer.byteLength(event.data) > 2*1024*1024) fail("fixture_disposition_cdp_budget");
      const message = JSON.parse(event.data);
      if (message.method === "Debugger.scriptParsed") {if(scripts.length>=1000)fail("fixture_disposition_cdp_budget");scripts.push(message.params);}
      if (pending.has(message.id)) { const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(Error("fixture_disposition_cdp_request_failed")):p.resolve(message.result); }
    } catch (_) {rejectAll("fixture_disposition_cdp_response_invalid");socket.close();}
  };
  const send = async (method,params={}) => {await opened;return new Promise((resolve,reject) => {const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});};
  try {
    await send("Debugger.enable");
    for (const asset of ["panel-action-contract.js","panel-actions.js","panel.js"]) {
      const file = path.join(path.dirname(selected.installed.indexPath),asset), url = pathToFileURL(file).href;
      const matches = scripts.filter(row => {try {const u=new URL(row.url);u.search="";u.hash="";return u.href===url;} catch (_) {return false;}});
      if (matches.length !== 1) fail("fixture_disposition_loaded_source_ambiguous");
      const source = await send("Debugger.getScriptSource",{scriptId:matches[0].scriptId});
      if (typeof source.scriptSource !== "string" || SHA(normalized(source.scriptSource)) !== SHA(normalized(fs.readFileSync(file,"utf8")))) fail("fixture_disposition_loaded_source_mismatch");
    }
  } finally {clearTimeout(timer);socket.close();}
}
function inventoryAE() {
  const command = "$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter \"Name='AfterFX.exe'\" | ForEach-Object { $aeRow=$_; $parentRow=Get-CimInstance Win32_Process -Filter ('ProcessId='+$aeRow.ParentProcessId); [pscustomobject]@{pid=[int]$aeRow.ProcessId; createdAt=$aeRow.CreationDate.ToUniversalTime().ToString('o'); path=$aeRow.ExecutablePath; parentPid=[int]$aeRow.ParentProcessId; parentCreatedAt=if($parentRow){$parentRow.CreationDate.ToUniversalTime().ToString('o')}else{$null}; parentPath=$parentRow.ExecutablePath; commandLine=$aeRow.CommandLine} }) -Compress";
  return new Promise((resolve,reject) => execFile(path.join(process.env.SystemRoot || "C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe"),["-NoLogo","-NoProfile","-NonInteractive","-Command",command],{windowsHide:true,timeout:5000,maxBuffer:128*1024},(error,out) => {
    if (error) return reject(Error("fixture_disposition_process_inventory_failed"));
    try {const rows=JSON.parse(out.replace(/^\uFEFF/,""));if(!Array.isArray(rows))throw Error();resolve(rows);} catch (_) {reject(Error("fixture_disposition_process_inventory_invalid"));}
  }));
}
function preExistingAE(rows) {
  const image="c:\\program files\\adobe\\adobe after effects 2026\\support files\\afterfx.exe";
  const known=new Map([[31728,"2026-10-10T04:09:13.0045200Z"],[38316,"2026-10-10T13:52:55.0433830Z"],[36520,"2026-10-10T13:54:03.5742640Z"]]);
  return Array.isArray(rows) && rows.length>=1 && rows.length<=3 && new Set(rows.map(r=>r.pid)).size===rows.length && rows.some(r=>r.pid===31728) && rows.every(r =>
    known.has(r.pid) && Date.parse(r.createdAt)===Date.parse(known.get(r.pid)) && String(r.path).toLowerCase()===image &&
    (r.pid===31728 || r.parentPid===28468 && Date.parse(r.parentCreatedAt)===Date.parse("2026-10-10T04:09:15.6469480Z") &&
      String(r.parentPath).toLowerCase()===image.replace("afterfx.exe","dynamiclinkmanager.exe") && String(r.commandLine).trim()==="-m"));
}
function createReaders(deps) {
  const service = deps.panelService, root=deps.evidenceRoot;
  return {
    evidenceRoot:root, maintenanceTarget:() => service.maintenanceTarget(), readBridgeStatus:deps.readBridgeStatus,
    async readPanelGuard(selector) {
      disposition.selector(selector); const selected=await service.maintenanceTarget();
      const expression="(function(){var api=window.AEAgentPanelActions;if(!api||typeof api.readAmeFixtureUIGuard!=='function')return null;return api.readAmeFixtureUIGuard("+JSON.stringify(selector)+");})()";
      return control.evaluateViaWebSocket(selected.target.webSocketDebuggerUrl,expression,5000);
    },
    async readRuntimeIdentity() {
      const selected=await service.maintenanceTarget();await loadedPanelSources(selected);
      const runtime=deps.readBridgeStatus().humanGuardRuntime;
      return {daemon:{pid:runtime.pid,startedAt:runtime.startedAt},loadedRuntimeSha256:deps.loadedRuntimeSha256,
        currentRuntimeSha256:deps.currentRuntimeSha256(),panelAssetHashes:selected.installed.hashes};
    },
    readTransportAbsence(selector) {
      disposition.selector(selector); const directory=path.join(root,"cep-panel-control");
      const row=control.loadDurableReceipt(directory,selector.requestId);
      const index=JSON.parse(fs.readFileSync(path.join(directory,"identities.json"),"utf8"));
      if (row !== null || index.schema !== "ae-agent.cep-panel-transport.v1" || !index.identities || Object.hasOwn(index.identities,selector.requestId)) fail("fixture_disposition_transport_present_or_corrupt");
      const status=deps.readBridgeStatus();return {requestId:selector.requestId,originalReceiptAbsent:true,pendingCount:status.pendingCommands,inflightCount:status.inflightCommands.length};
    },
    async readExecutorQuiescence() {
      const local=deps.executorQuiescence(), rows=await (deps.inspectAE || inventoryAE)(), fixtureRoot=path.join(deps.projectRoot,".codex-runtime","ame-native-fixtures");
      // This closed maintenance applies only to the install-denied run. Any
      // observed native fixture tree or unknown AE host requires reconciliation.
      // Two exact pre-existing Dynamic Link children are foreign and untouched.
      if (local.executing || local.pendingCount || local.descriptorCount || fs.existsSync(fixtureRoot) && fs.readdirSync(fixtureRoot).length || !preExistingAE(rows)) fail("fixture_disposition_executor_not_quiescent");
      return {quiescent:true,executing:false,pendingCount:0,childProcesses:[]};
    },
    acquireWriterLock:() => control.acquireControllerLock(path.join(root,"cep-panel-control"),crypto.randomUUID())
  };
}
module.exports={createReaders,loadedPanelSources,inventoryAE,preExistingAE};

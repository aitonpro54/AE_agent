"use strict";

// Private application-UI service. Never accepts caller scripts, paths or IDs.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const {spawn, execFile} = require("child_process");
const {fileURLToPath} = require("url");
const {selectCepPanelTarget,isCepExtensionUrl} = require("../scripts/cep-panel-target");

const TARGET = Object.freeze({bundleId:"com.codex.aemcpbridge", extensionId:"com.codex.aemcpbridge.panel", menu:"AE Agent 3.3.1", version:"3.3.1"});
const TOOL_NAME = "ensure_ae_agent_panel";
const tool = {name:TOOL_NAME, description:"Open/activate the fixed installed AE Agent CEP panel in one already-running After Effects, or reconnect its exact existing CDP page. Changes application panel UI only; never project contents. Success requires fresh panel connectivity and the ordinary native typed get_project_info. Unknown delivery blocks replay.",
  annotations:{readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:false},
  inputSchema:{type:"object",additionalProperties:false,properties:{timeoutMs:{type:"integer",minimum:1,maximum:30000,description:"Overall deadline in milliseconds, default 30000."}}}};
function problem(code, message, evidence) { return Object.assign(new Error(message || code), {code,evidence}); }
function validateInput(args) {
  if (!args || typeof args!=="object" || Array.isArray(args) || Object.keys(args).some(key=>key!=="timeoutMs")) throw problem("invalid_bootstrap_arguments","Only timeoutMs is accepted.");
  const timeoutMs=args.timeoutMs===undefined ? 30000 : args.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs<1 || timeoutMs>30000) throw problem("invalid_bootstrap_timeout","timeoutMs must be an integer from 1 to 30000.");
  return {timeoutMs};
}
function assertIdle(status) {
  if (!status || !Number.isInteger(status.pendingCommands) || !Array.isArray(status.inflightCommands)) throw problem("bridge_idle_unproven");
  if (status.pendingCommands!==0 || status.inflightCommands.length) throw problem("bridge_commands_unfinished","Pending/inflight commands must be reconciled before bootstrap or another project read.", {pendingCommands:status.pendingCommands,inflightCommands:status.inflightCommands});
  if (["confirmed","executing"].includes(status.planExecutionState)) throw problem("bridge_plan_unfinished");
  const life=status.projectLifecycle;
  const freshRead=life && life.enabled===true && life.blocked===true && life.problem==="lifecycle_store_missing" && life.generation===0 &&
    life.freshMissingStoreReadAllowed===true && !status.activeEditSession;
  if (!life || life.pending || life.pendingTransition || life.activeTransition || (!freshRead && (life.blocked!==false || life.problem))) throw problem("project_lifecycle_unfinished");
  // Keep the active manual session; it is not itself a panel-reload blocker.
}
function selectRunningAE(rows) {
  if (!Array.isArray(rows)) throw problem("ae_process_inventory_invalid");
  if (rows.length===0) throw problem("ae_not_running","After Effects must already be running; no application will be launched.");
  if (rows.length!==1) throw problem("ae_instance_ambiguous","Multiple AfterFX processes exist (including instances without a main window).",rows.map(r=>({pid:r.pid,executable:r.executable,createdAt:r.createdAt})));
  const row=rows[0];
  if (!Number.isInteger(row.pid) || row.pid<1 || !row.createdAt || typeof row.executable!=="string" || !path.win32.isAbsolute(row.executable) || path.win32.basename(row.executable).toLowerCase()!=="afterfx.exe") throw problem("ae_process_identity_unproven");
  return {pid:row.pid,executable:row.executable,createdAt:String(row.createdAt)};
}
function sameProcess(a,b) { return a.pid===b.pid && a.executable.toLowerCase()===b.executable.toLowerCase() && a.createdAt===b.createdAt; }
function discoverRunningAE(timeoutMs) {
  if (process.platform!=="win32") return Promise.reject(problem("native_bootstrap_platform_unsupported"));
  const command="$ErrorActionPreference='Stop'; $rows=@(Get-CimInstance Win32_Process -Filter \"Name='AfterFX.exe'\" | ForEach-Object { [pscustomobject]@{pid=[int]$_.ProcessId; executable=$_.ExecutablePath; createdAt=$_.CreationDate.ToUniversalTime().ToString('o')} }); ConvertTo-Json -InputObject $rows -Compress";
  const exe=path.join(process.env.SystemRoot || "C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
  return new Promise((resolve,reject)=>execFile(exe,["-NoLogo","-NoProfile","-NonInteractive","-Command",command],{windowsHide:true,timeout:Math.max(1,Math.min(3000,timeoutMs)),maxBuffer:128*1024},(error,out)=>{
    if(error) return reject(problem("ae_process_discovery_failed",error.message));
    try {resolve(JSON.parse(out.replace(/^\uFEFF/,"")));} catch(_) {reject(problem("ae_process_inventory_invalid"));}
  }));
}
function extensionRoots() {
  return [...new Set([process.env.APPDATA && path.join(process.env.APPDATA,"Adobe","CEP","extensions"),
    process.env.CommonProgramFiles && path.join(process.env.CommonProgramFiles,"Adobe","CEP","extensions"),
    process.env["CommonProgramFiles(x86)"] && path.join(process.env["CommonProgramFiles(x86)"],"Adobe","CEP","extensions")].filter(Boolean))];
}
const sha = file=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function inspectInstalledTarget(roots=extensionRoots(), sourceRoot=path.resolve(__dirname,"..","cep-panel")) {
  const copies=[], menus=[];
  for (const base of roots) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base,{withFileTypes:true})) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const root=path.join(base,entry.name),manifest=path.join(root,"CSXS","manifest.xml");
      if (!fs.existsSync(manifest)) continue;
      const xml=fs.readFileSync(manifest,"utf8");
      const matchingMenus=(xml.match(/<Menu>\s*AE Agent 3\.3\.1\s*<\/Menu>/g)||[]).length;
      for(let i=0;i<matchingMenus;i++) menus.push(root);
      if (/\bId\s*=\s*["']com\.codex\.aemcpbridge\.panel["']/.test(xml)) copies.push({root,manifest,xml});
    }
  }
  if (!copies.length) throw problem("installed_panel_missing");
  if (copies.length!==1 || menus.length!==1 || path.resolve(menus[0])!==path.resolve(copies[0].root)) throw problem("installed_panel_ambiguous","Exact extension ID or menu title has multiple installed owners.",{copies:copies.map(c=>c.root),menuOwners:menus});
  const c=copies[0];
  if (path.basename(c.root)!==TARGET.bundleId || !/ExtensionBundleId="com\.codex\.aemcpbridge"/.test(c.xml) || !/ExtensionBundleVersion="3\.3\.1"/.test(c.xml) || !/<Host\s+Name="AEFT"/.test(c.xml) || !/<Extension\s+Id="com\.codex\.aemcpbridge\.panel"\s+Version="3\.3\.1"/.test(c.xml) || !/<MainPath>\.\/index\.html<\/MainPath>/.test(c.xml)) throw problem("installed_panel_identity_mismatch");
  const hashes={};
  for (const asset of ["CSXS/manifest.xml","index.html","panel-action-contract.js","panel-actions.js","panel.js","style.css","lib/CSInterface.js"]) {
    const installed=path.join(c.root,asset), source=path.join(sourceRoot,asset);
    if (!fs.existsSync(installed) || !fs.existsSync(source) || sha(installed)!==sha(source)) throw problem("installed_panel_source_mismatch",`Installed ${asset} differs from this repository.`);
    hashes[asset]=sha(installed);
  }
  const root=fs.realpathSync(c.root);
  // A redirect outside the installed namespace must not become a native target.
  if (path.resolve(root).toLowerCase()!==path.resolve(c.root).toLowerCase()) throw problem("installed_panel_redirected");
  return {...TARGET,root,indexPath:path.join(root,"index.html"),hashes};
}
function assertNoScriptMenuCollision(ae) {
  const roots=[path.join(path.dirname(ae.executable),"Scripts")];
  function scan(dir) {
    if(!fs.existsSync(dir)) return;
    for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
      const p=path.join(dir,e.name);
      if(e.isDirectory()) {if(e.name==="ScriptUI Panels") scan(p);}
      else if(e.isFile() && /\.(jsx|jsxbin)$/i.test(e.name) && path.basename(e.name,path.extname(e.name))===TARGET.menu) throw problem("native_menu_title_collision",p);
    }
  }
  roots.forEach(scan);
}

// Exported for offline VM checks and root's fixed capability probe, never as an MCP input.
function generateBootstrapJsx({requestId,deadline,ackPath,probeOnly=false}) {
  if (!/^[a-f0-9-]{36}$/.test(requestId) || !Number.isSafeInteger(deadline) || typeof ackPath!=="string") throw problem("private_bootstrap_pin_invalid");
  return `(function () { try {
    var requestId = ${JSON.stringify(requestId)}, deadline = ${deadline}, ack = new File(${JSON.stringify(ackPath.replace(/\\/g,"/"))});
    if (ack.exists) return;
    function receipt(state, commandId) {
      ack.encoding = "UTF-8";
      if (!ack.open("w")) throw new Error("bootstrap_ack_unwritable");
      try { if (!ack.write('{"requestId":"' + requestId + '","state":"' + state + '","commandId":' + (commandId || 0) + '}')) throw new Error("bootstrap_ack_write_failed"); }
      finally { ack.close(); }
    }
    if ((new Date()).getTime() >= deadline) { receipt("expired", 0); return; }
    if (typeof app.findMenuCommandId !== "function" || typeof app.executeCommand !== "function") { receipt("unsupported_api", 0); return; }
    var commandId;
    try { commandId = app.findMenuCommandId(${JSON.stringify(TARGET.menu)}); }
    catch (_) { receipt("lookup_failed", 0); return; }
    if (typeof commandId !== "number" || commandId <= 0 || Math.floor(commandId) !== commandId) { receipt("command_unavailable", 0); return; }
    ${probeOnly ? 'receipt("capability_available", commandId); return;' : `receipt("executing", commandId);
    if ((new Date()).getTime() >= deadline) { receipt("expired", commandId); return; }
    try { app.executeCommand(commandId); }
    catch (_) { receipt("execution_unknown", commandId); return; }
    receipt("executed", commandId);`}
  } catch (__bootstrapServiceError) { /* No unhandled AE script dialog; durable caller state remains unknown. */ }
  }());\n`;
}
function dispatchNative(ae,scriptPath) {
  return new Promise((resolve,reject)=>{
    const child=spawn(ae.executable,["-r",scriptPath],{windowsHide:true,stdio:"ignore",shell:false});
    child.once("error",error=>reject(problem("native_submission_failed",error.message)));
    child.once("spawn",()=>{child.unref();resolve({cliPid:child.pid});});
    // Exit code cannot establish whether the forwarded JSX executed.
    child.on("exit",()=>{});
  });
}
function discoverCdp(timeoutMs) {
  return new Promise((resolve,reject)=>{
    const req=http.get("http://127.0.0.1:8870/json/list",res=>{
      let body=""; res.setEncoding("utf8");
      res.on("data",s=>{body+=s;if(body.length>256*1024) req.destroy(problem("cdp_inventory_too_large"));});
      res.on("end",()=>{try {if(res.statusCode!==200) throw problem("cdp_unavailable");resolve(JSON.parse(body));}catch(e){reject(e.code ? e : problem("cdp_inventory_invalid"));}});
    });
    req.setTimeout(Math.max(1,Math.min(timeoutMs,1000)),()=>req.destroy(problem("cdp_unavailable")));
    req.on("error",reject);
  });
}
function exactCdpTarget(pages,installed) {
  if(!Array.isArray(pages)) throw problem("cdp_inventory_invalid");
  const bundlePages=pages.filter(p=>p && p.type==="page" && isCepExtensionUrl(p.url,TARGET.bundleId));
  const matches=pages.filter(p=>p && p.type==="page" && (()=>{try{return fileURLToPath(p.url).toLowerCase()===installed.indexPath.toLowerCase();}catch(_){return false;}})());
  if(bundlePages.length>1 || matches.length>1) throw problem("cdp_target_ambiguous");
  if(!matches.length) {if(bundlePages.length) throw problem("cdp_target_identity_mismatch");return null;}
  let selected;
  try {selected=selectCepPanelTarget(pages,{extensionId:TARGET.bundleId,port:8870});}
  catch(e) {throw problem("cdp_target_invalid",e.message);}
  if(selected!==matches[0]) throw problem("cdp_target_ambiguous");
  const ws=new URL(selected.webSocketDebuggerUrl);
  if(ws.protocol!=="ws:" || ws.hostname!=="127.0.0.1" || ws.port!=="8870" || ws.search || !/^\/devtools\/page\/[^/]+$/.test(ws.pathname)) throw problem("cdp_endpoint_untrusted");
  return {url:selected.url,webSocketDebuggerUrl:selected.webSocketDebuggerUrl};
}
async function reconnectCdp(target,timeoutMs,beforeSend) {
  if(typeof WebSocket!=="function") throw problem("cdp_runtime_unsupported");
  const deadline=Date.now()+timeoutMs;
  const remaining=()=>{const ms=deadline-Date.now();if(ms<=0) throw problem("cdp_reload_unknown");return ms;};
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  try {
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(problem("cdp_connect_timeout")),remaining());ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=()=>{clearTimeout(timer);reject(problem("cdp_connect_failed"));};});
    await beforeSend();
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(problem("cdp_reload_unknown")),remaining());
      ws.onmessage=e=>{try {const m=JSON.parse(e.data);if(m.id===1){clearTimeout(timer);m.error ? reject(problem("cdp_reload_rejected")) : resolve();}}catch(_){}};
      ws.onerror=()=>{clearTimeout(timer);reject(problem("cdp_reload_unknown"));};
      ws.send(JSON.stringify({id:1,method:"Page.reload",params:{ignoreCache:true}}));
    });
  } finally {ws.close();}
}

function createPanelBootstrapService(deps) {
  const stateDir=path.resolve(deps.stateDir), statePath=path.join(stateDir,"attempt.json"), lockPath=path.join(stateDir,"service.lock");
  const now=deps.now || Date.now, pause=deps.pause || (ms=>new Promise(r=>setTimeout(r,ms)));
  const discover=deps.discoverAE || discoverRunningAE, installed=deps.inspectInstalled || inspectInstalledTarget;
  let running=false;
  function load() {if(!fs.existsSync(statePath)) return null;try {const r=JSON.parse(fs.readFileSync(statePath,"utf8"));if(r.schema!==1 || !/^[a-f0-9-]{36}$/.test(r.requestId)) throw Error();return r;}catch(_){throw problem("bootstrap_record_corrupt");}}
  function save(r) {const temp=statePath+"."+process.pid+".tmp";fs.writeFileSync(temp,JSON.stringify(r,null,2),{mode:0o600});fs.renameSync(temp,statePath);}
  function ackFor(r) {
    const ackPath=path.join(stateDir,r.requestId+".ack.json");
    if(!fs.existsSync(ackPath)) return null;
    try {const a=JSON.parse(fs.readFileSync(ackPath,"utf8").replace(/^\uFEFF/,""));return a.requestId===r.requestId && Number.isInteger(a.commandId) && ["expired","unsupported_api","lookup_failed","command_unavailable","executing","execution_unknown","executed"].includes(a.state) ? a : null;}catch(_){return null;}
  }
  function snapshot() {try {const r=load();return r ? {requestId:r.requestId,stage:r.stage,deadline:r.deadline,delivery:r.delivery,ae:r.ae || null,target:r.target || null,cli:r.cli || null,projectReadCommand:r.projectReadCommand || null,ack:ackFor(r)} : null;}catch(e){return {stage:"record_failure",code:e.code};}}
  async function ensure(raw) {
    let stage="input", record=null, lock=null, ownsRun=false;
    try {
      const {timeoutMs}=validateInput(raw || {}), deadline=now()+timeoutMs;
      if(running) throw problem("bootstrap_busy");
      running=true;ownsRun=true;
      fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
      try {lock=fs.openSync(lockPath,"wx",0o600);fs.writeFileSync(lock,String(process.pid));}
      catch(e) {
        if(e.code!=="EEXIST") throw e;
        const owner=Number(fs.readFileSync(lockPath,"utf8"));
        if(!Number.isInteger(owner)||owner<1) throw problem("bootstrap_lock_unproven");
        try {process.kill(owner,0);throw problem("bootstrap_busy");}catch(err){if(err.code!=="ESRCH") throw err;}
        fs.unlinkSync(lockPath);lock=fs.openSync(lockPath,"wx",0o600);fs.writeFileSync(lock,String(process.pid));
      }
      const remaining=()=>{const ms=deadline-now();if(ms<=0) throw problem("bootstrap_timeout");return ms;};
      stage="preflight";let status=deps.getStatus();assertIdle(status);
      record=load();
      if(record && record.stage==="project_read_unknown") throw problem("project_read_unknown","Previous typed project read has no terminal result. Reconcile it; no automatic replay.");
      let pending=record && !["verified","not_executed","project_read_not_delivered"].includes(record.stage);
      if(pending && record.delivery==="native") {
        const ack=ackFor(record);
        if(ack && ["expired","unsupported_api","lookup_failed","command_unavailable"].includes(ack.state)) {record.stage="not_executed";record.ack=ack;save(record);pending=false;}
      }
      if(pending && !status.panelConnected) throw problem("bootstrap_submitted_unknown","Previous bootstrap has no verified connection. Observe/reconcile its receipt; do not repeat native or reload.",snapshot());
      if(pending && now()<record.deadline) throw problem("bootstrap_submitted_unknown","Previous JSX may still execute before its deadline.",snapshot());
      let resultStatus="already_connected";
      if(!status.panelConnected) {
        stage="target";
        const ae=selectRunningAE(await discover(remaining())), target=installed();
        (deps.assertNoCollision || assertNoScriptMenuCollision)(ae);
        let cdp=null;
        try {const pages=await (deps.discoverCdp || discoverCdp)(remaining());cdp=exactCdpTarget(pages,target);}catch(e){if(!["cdp_unavailable","ECONNREFUSED","ECONNRESET"].includes(e.code)) throw e;}
        record={schema:1,requestId:crypto.randomUUID(),deadline,stage:"prepared",delivery:cdp ? "cdp" : "native",ae,target,createdAt:now()};
        const scriptPath=path.join(stateDir,record.requestId+".jsx"), ackPath=path.join(stateDir,record.requestId+".ack.json");
        if(!cdp) fs.writeFileSync(scriptPath,generateBootstrapJsx({requestId:record.requestId,deadline,ackPath}),{mode:0o600});
        save(record);
        const recheck=async()=>{
          assertIdle(deps.getStatus());remaining();
          const latest=selectRunningAE(await discover(remaining()));
          if(!sameProcess(ae,latest)) throw problem("ae_process_identity_changed");
          const fresh=installed();if(JSON.stringify(fresh)!==JSON.stringify(target)) throw problem("installed_panel_changed");
          if(cdp){const latestPage=exactCdpTarget(await (deps.discoverCdp || discoverCdp)(remaining()),target);if(!latestPage || latestPage.webSocketDebuggerUrl!==cdp.webSocketDebuggerUrl) throw problem("cdp_target_changed");}
          assertIdle(deps.getStatus());remaining();
          record.stage="submitted_unknown";save(record);
        };
        stage=cdp ? "cdp_reconnect" : "native_dispatch";
        try {
          if(cdp) {await (deps.reconnectCdp || reconnectCdp)(cdp,remaining(),recheck);record.reloadAcknowledged=true;}
          else {await recheck();record.cli=await (deps.dispatchNative || dispatchNative)(ae,scriptPath);}
          save(record);
        } catch(e) {if(record.stage==="prepared") {record.stage="not_executed";save(record);}throw e;}
        stage="wait_connection";
        while(true) {
          const ack=cdp ? null : ackFor(record);
          if(ack && ["expired","unsupported_api","lookup_failed","command_unavailable"].includes(ack.state)) {record.ack=ack;record.stage="not_executed";save(record);throw problem("native_"+ack.state);}
          if(ack && ack.state==="execution_unknown") throw problem("native_execution_unknown");
          status=deps.getStatus();assertIdle(status);
          if(status.panelConnected && (cdp || ack && ack.state==="executed")) break;
          await pause(Math.min(100,remaining()));
        }
        resultStatus=cdp ? "reconnected" : "opened";
      }
      stage="project_read";assertIdle(deps.getStatus());
      const before=deps.getStatus(), owner=before.lastPanelInfo && {id:before.lastPanelInfo.panelConnectionId,generation:before.lastPanelInfo.panelGeneration};
      const budget=remaining();
      // Write before enqueue so a daemon crash cannot forget a possibly-delivered read.
      record=record || {schema:1,requestId:crypto.randomUUID(),deadline,delivery:"none",createdAt:now()};
      record.stage="project_read_unknown";save(record);
      const read=Promise.resolve().then(()=>deps.readProject(budget, pins=>{record.projectReadCommand=pins;save(record);}));
      let timer;
      let project;
      try {project=await Promise.race([read,new Promise((_,reject)=>{timer=setTimeout(()=>reject(problem("project_read_timeout")),budget);})]);}
      finally {clearTimeout(timer);}
      if(!project || typeof project!=="object" || !Object.prototype.hasOwnProperty.call(project,"file") || !Number.isInteger(project.numItems) || project.numItems<0) throw problem("project_read_invalid");
      const after=deps.getStatus();
      if(!after.panelConnected || owner && (!after.lastPanelInfo || owner.id!==after.lastPanelInfo.panelConnectionId || owner.generation!==after.lastPanelInfo.panelGeneration)) throw problem("panel_connection_changed");
      record.stage="verified";record.verifiedAt=now();save(record);
      return {ok:true,status:resultStatus,stage:"verified",panelConnected:true,projectInfo:project,evidence:snapshot()};
    } catch(e) {
      if(stage==="project_read" && record && record.stage==="project_read_unknown" && (e.phase==="before_delivery" || e.lifecycleState==="expired_before_delivery")) {
        record.stage="project_read_not_delivered";record.readFailure=e.code || "before_delivery";
        try {save(record);}catch(_) { /* Preserve the older durable unknown if storage failed. */ }
      }
      return {ok:false,status:"failure",stage,reason:e.code || "bootstrap_failed",message:e.message,evidence:e.evidence || snapshot(),panelConnected:Boolean(deps.getStatus().panelConnected)};
    } finally {if(lock!==null){fs.closeSync(lock);fs.unlinkSync(lockPath);}if(ownsRun) running=false;}
  }
  return {ensure,snapshot,isBusy:()=>running};
}
// Closed operator recovery for one historical read, never an ensure fallback.
// The raw UNKNOWN is archived byte-for-byte; absence is not an exit/completion
// proof. A separate ordinary ensure owns any new UI action and project read.
const STALE_READ=Object.freeze({requestId:"fa30d4da-acb9-4f0b-85b8-54d5a0455092",rawSha256:"1bef1895f410c3e4b47abfb71b62639fc833cd76dad8a728c16cac6e2c59e339",
  commandId:"684d9327-e685-4ad4-8dce-e9f6a8f826b8",executionId:"aa39999f-abb6-423c-8d0b-9288d47aa4ff",
  generation:"efd27532-cf82-4546-83ce-ea71e0dc009b",operationId:"6da63cd2-bc3d-49d0-b723-2cc5aa63b151",
  oldAE:Object.freeze({pid:28492,createdAt:"2026-10-19T10:01:45.2324690Z",executable:"C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files\\AfterFX.exe"}),
  replacementProcess:Object.freeze({pid:28492,createdAt:"2026-10-21T04:42:19.6388487Z",executable:"C:\\WINDOWS\\system32\\conhost.exe"}),
  currentAE:Object.freeze({pid:10068,createdAt:"2026-10-21T04:43:27.0820424Z",executable:"C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files\\AfterFX.exe"}),
  absenceHelperSha256:"ea4b5bf53cf83721a60a2afa8616e8022cd81e42e809c7c5a371b382b7f9d199"});
const staleHash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function staleCheck(ok,code){if(!ok)throw problem("bootstrap_stale_"+code);}
function staleRecord(bytes,rawSha256=STALE_READ.rawSha256){
  staleCheck(staleHash(bytes)===rawSha256,"original_bytes_changed");const r=JSON.parse(bytes);
  staleCheck(r.requestId===STALE_READ.requestId&&r.stage==="project_read_unknown"&&r.delivery==="cdp"&&sameProcess(r.ae,STALE_READ.oldAE)&&r.projectReadCommand?.id===STALE_READ.commandId&&r.projectReadCommand.executionId===STALE_READ.executionId,"original_identity_changed");return r;
}
function staleAuthority(root){
  const authority=require("./owned-runtime-authority"),supervisor=require("./owned-runtime-supervisor"),reset=require("./owned-runtime-product-session-reset"),ledger=require("./native-fixture-attempt-ledger");
  const reg=supervisor.readDaemonRegistration(root);staleCheck(reg?.generation===STALE_READ.generation,"exact_reset_required");
  const control=authority.runtimeControlFor(root),keyReader=v=>control.credential({daemon:{port:3456,credentialSha256:v.credentialSha256}}),key=keyReader(reg);
  const anchor=reset.sessionAnchor(root,reg.generation,supervisor.registeredGeneration,keyReader),policy=reset.policy(root),pointer=authority.privateFile(path.join(authority.base(root),"current-daemon.json"));
  staleCheck(anchor?.value.generation===STALE_READ.generation&&anchor.value.operationId===STALE_READ.operationId,"exact_reset_required");
  function assertUnchanged(){anchor.assertUnchanged();policy.assertUnchanged();pointer.assertUnchanged();staleCheck(ledger.same(supervisor.readDaemonRegistration(root),reg),"registration_changed");staleCheck(reset.currentStatus(root,reg,supervisor.registeredGeneration,keyReader)?.status==="reset_pending_preflight","reset_preflight_changed");}
  assertUnchanged();
  return {key,reg,anchorSha256:anchor.pins.productResetAnchorRawSha256,policySha256:policy.rawSha256,assertUnchanged,
    async status(){assertUnchanged();return control.request({daemon:{port:3456,credentialSha256:reg.credentialSha256}},"/dev/status");}};
}
function staleReceiptAuthority(root){
  const authority=require("./owned-runtime-authority"),supervisor=require("./owned-runtime-supervisor"),reset=require("./owned-runtime-product-session-reset"),control=authority.runtimeControlFor(root);
  const chain=supervisor.registeredGeneration(root,STALE_READ.generation),keyReader=v=>control.credential({daemon:{port:3456,credentialSha256:v.credentialSha256}}),key=keyReader(chain.reservation.value),anchor=reset.sessionAnchor(root,STALE_READ.generation,supervisor.registeredGeneration,keyReader);
  staleCheck(anchor?.value.operationId===STALE_READ.operationId,"exact_reset_required");anchor.assertUnchanged();return {key,anchorSha256:anchor.pins.productResetAnchorRawSha256};
}
// Reuse the already reviewed read-only kernel from the fixed absence helper.
// Its old reset protocol is not invoked or broadened. No input/host code, UI,
// launch, close or termination primitive is exposed by this fixed query.
async function probeStaleBootstrapProcesses(){
  const win=require("./owned-runtime-win32"),ledger=require("./native-fixture-attempt-ledger");win.verifyPolicy();
  const bytes=ledger.readBytes(path.join(__dirname,"../scripts/cep-panel-reset-physical-fence-absence.ps1"));staleCheck(staleHash(bytes)===STALE_READ.absenceHelperSha256,"native_source_changed");
  const kernel=/Add-Type -TypeDefinition @'\r?\n([\s\S]+?)\r?\n'@/.exec(bytes.toString("utf8"));staleCheck(kernel,"native_source_invalid");
  const script=`$ErrorActionPreference='Stop'; Add-Type -TypeDefinition @'\n${kernel[1]}\n'@\n$old=[IntPtr]::Zero;$current=[IntPtr]::Zero;try {
  $errorCode=$null;try{$old=[ResetExternalAbsenceKernel]::Open(28492)}catch{$why=$_.Exception;while($why.InnerException){$why=$why.InnerException};if($why -is [ComponentModel.Win32Exception]){$errorCode=$why.NativeErrorCode};if($errorCode -ne 87){throw 'old_absence_unknown'}}
  $oldProof=@{pid=28492;state='absent';win32Error=87}
  if($old -ne [IntPtr]::Zero){$replacement=[ResetExternalAbsenceKernel]::Read($old);$oldProof=@{pid=28492;state='pid_reused';win32Error=$null;actual=@{pid=$replacement.pid;createdAt=$replacement.birthUtc;executable=$replacement.imagePath}}}
  $current=[ResetExternalAbsenceKernel]::Open(10068);$identity=[ResetExternalAbsenceKernel]::Read($current);if([ResetExternalAbsenceKernel]::Signaled($current)){throw 'current_exited'}
  $rows=@(Get-CimInstance Win32_Process -Filter "Name='AfterFX.exe'" -ErrorAction Stop);if($rows.Count -ne 1 -or $rows[0].ProcessId -ne 10068){throw 'current_ambiguous'}
  @{readOnly=$true;old=$oldProof;current=@{pid=$identity.pid;createdAt=$identity.birthUtc;executable=$identity.imagePath};observedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 5 -Compress
}finally{if($old -ne [IntPtr]::Zero){[ResetExternalAbsenceKernel]::Close($old)};if($current -ne [IntPtr]::Zero){[ResetExternalAbsenceKernel]::Close($current)}}`;
  return new Promise((resolve,reject)=>execFile(win.POLICY.executable,["-NoLogo","-NoProfile","-NonInteractive","-Command",script],{windowsHide:true,timeout:10000,maxBuffer:32768},(error,out)=>{
    if(error)return reject(problem("bootstrap_stale_native_absence_unproven"));try{resolve(JSON.parse(out.replace(/^\uFEFF/,"")));}catch(_){reject(problem("bootstrap_stale_native_response_invalid"));}
  }));
}
function createStaleBootstrapReconciler(deps={}){
  const root=path.resolve(deps.root||path.join(__dirname,"..")),stateDir=path.join(root,"logs","ae-agent-panel-bootstrap"),active=path.join(stateDir,"attempt.json"),directory=path.join(stateDir,"retired",STALE_READ.requestId),archive=path.join(directory,"original-attempt.json"),receipt=path.join(directory,"disposition.json");
  const ledger=require("./native-fixture-attempt-ledger"),r1=require("./owned-runtime-lifecycle"),canonical=r1.canonical;
  const sign=(value,key)=>crypto.createHmac("sha256",key).update(canonical(value)).digest("hex");
  // Private offline fixture seam; the closed CLI always pins reviewed bytes.
  const originalSha256=deps.originalSha256||STALE_READ.rawSha256,readOriginal=file=>staleRecord(ledger.readBytes(file),originalSha256);
  const disposition={oldOutcome:"unknown_preserved",oldExitProven:false,oldCommandsReplayAllowed:false,oldExternalEffectsAdjudicated:false,replayAllowed:false,newEnsureRequired:true};
  function inspect(){
    const activeExists=fs.existsSync(active),archiveExists=fs.existsSync(archive),receiptExists=fs.existsSync(receipt);
    if(archiveExists)readOriginal(archive);
    if(receiptExists){
      staleCheck(archiveExists,"archive_missing");const row=JSON.parse(ledger.readBytes(receipt)),{authentication,...v}=row.value||{},facts=(deps.receiptAuthority||staleReceiptAuthority)(root);
      staleCheck(row.schema===r1.SCHEMA+".envelope"&&row.sha256===r1.hash(row.value)&&authentication===sign(v,facts.key)&&v.schema==="ae-agent.bootstrap-stale-read-disposition.v1"&&v.requestId===STALE_READ.requestId&&v.commandId===STALE_READ.commandId&&v.executionId===STALE_READ.executionId&&v.originalRawSha256===originalSha256&&v.generation===STALE_READ.generation&&v.operationId===STALE_READ.operationId&&v.anchorSha256===facts.anchorSha256&&Object.keys(disposition).every(k=>v[k]===disposition[k]),"disposition_invalid");
    }
    let oldActive=activeExists;if(activeExists&&archiveExists&&receiptExists){const r=JSON.parse(ledger.readBytes(active));staleCheck(r.schema===1&&/^[a-f0-9-]{36}$/.test(r.requestId),"active_record_invalid");oldActive=r.requestId===STALE_READ.requestId;}
    return {ok:true,status:archiveExists&&receiptExists&&!oldActive?"stale_read_retired":archiveExists||receiptExists?"stale_read_partial_readback_only":"stale_read_not_retired",requestId:STALE_READ.requestId,activeExists,archiveExists,receiptExists,...disposition};
  }
  async function reconcile(){
    let lock;try{
      ledger.safeDirectory(stateDir);lock=fs.openSync(path.join(stateDir,"service.lock"),"wx",0o600);fs.writeFileSync(lock,String(process.pid));
      const prior=inspect();if(prior.status!=="stale_read_not_retired")return prior;
      const original=ledger.readBytes(active);staleRecord(original,originalSha256);const facts=(deps.authority||staleAuthority)(root),moduleHash=staleHash(ledger.readBytes(__filename));
      function unchanged(){facts.assertUnchanged();staleCheck(staleHash(ledger.readBytes(__filename))===moduleHash,"maintenance_source_changed");readOriginal(active);}
      async function status(){unchanged();const s=await facts.status();assertIdle(s);staleCheck(s.activeEditSession===null&&s.humanGuardRuntime?.pid===facts.reg.kernelIdentity.pid&&s.humanGuardRuntime.startedAt===facts.reg.serviceStartedAt&&s.humanGuardRuntime.sourceSha256===facts.reg.sourceSha256,"daemon_idle_or_identity_changed");staleCheck(s.panelBootstrap?.requestId===STALE_READ.requestId&&s.panelBootstrap.stage==="project_read_unknown"&&s.panelBootstrap.projectReadCommand?.id===STALE_READ.commandId&&s.panelBootstrap.projectReadCommand.executionId===STALE_READ.executionId,"daemon_bootstrap_changed");return s;}
      async function probe(){const p=await (deps.probe||probeStaleBootstrapProcesses)(),age=(deps.now||Date.now)()-Date.parse(p?.observedAt),old=p?.old,replacement=old?.actual;
        const absent=old?.state==="absent"&&old.win32Error===87,reused=old?.state==="pid_reused"&&old.win32Error===null&&replacement&&typeof replacement.executable==="string"&&sameProcess(replacement,STALE_READ.replacementProcess);
        staleCheck(p?.readOnly===true&&old?.pid===STALE_READ.oldAE.pid&&(absent||reused)&&p.current&&sameProcess(p.current,STALE_READ.currentAE)&&Number.isFinite(age)&&age>=0&&age<=30000,"native_absence_unproven");return p;}
      await status();const first=await probe();await status();const final=await probe();await status();unchanged();
      ledger.ensure(directory);
      const fd=fs.openSync(archive,"wx",0o600);try{fs.writeFileSync(fd,original);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}readOriginal(archive);
      const value={schema:"ae-agent.bootstrap-stale-read-disposition.v1",requestId:STALE_READ.requestId,commandId:STALE_READ.commandId,executionId:STALE_READ.executionId,originalRawSha256:originalSha256,generation:STALE_READ.generation,operationId:STALE_READ.operationId,anchorSha256:facts.anchorSha256,policySha256:facts.policySha256,moduleSha256:moduleHash,nativeHelperSha256:STALE_READ.absenceHelperSha256,firstNativeObservation:first,finalNativeObservation:final,...disposition,retiredAt:new Date().toISOString()};
      const signed={...value,authentication:sign(value,facts.key)},row=r1.writeJournalOnce(directory,"disposition",signed);staleCheck(row.sha256===r1.hash(signed),"archive_receipt_changed");
      unchanged();readOriginal(archive);inspect();
      // Retire only this active pointer after durable raw archive + signed
      // disposition exist. Never label the original read completed/not_sent.
      fs.unlinkSync(active);return inspect();
    }finally{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(path.join(stateDir,"service.lock"));}}
  }
  return {inspect,reconcile};
}
module.exports={TOOL_NAME,TARGET,tool,validateInput,assertIdle,selectRunningAE,inspectInstalledTarget,generateBootstrapJsx,createPanelBootstrapService,exactCdpTarget,createStaleBootstrapReconciler,STALE_READ};
if(require.main===module){(async()=>{const args=process.argv.slice(2);staleCheck(args.length===1&&["stale-read-status","reconcile-stale-read"].includes(args[0]),"closed_cli_required");const s=createStaleBootstrapReconciler();process.stdout.write(JSON.stringify(args[0]==="stale-read-status"?s.inspect():await s.reconcile())+"\n");})().catch(e=>{process.stdout.write(JSON.stringify({ok:false,code:e.code||"bootstrap_stale_recovery_unknown",replayAllowed:false})+"\n");process.exitCode=1;});}

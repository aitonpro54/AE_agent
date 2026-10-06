"use strict";

// Private application-UI service. Never accepts caller scripts, paths or IDs.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const {spawn, execFile} = require("child_process");
const {fileURLToPath} = require("url");
const {selectCepPanelTarget,isCepExtensionUrl} = require("../scripts/cep-panel-target");

const TARGET = Object.freeze({bundleId:"com.codex.aemcpbridge", extensionId:"com.codex.aemcpbridge.panel", menu:"AE Agent 3.3.0", version:"3.3.0"});
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
  if (!life || life.blocked!==false || life.pending || life.problem) throw problem("project_lifecycle_unfinished");
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
      const matchingMenus=(xml.match(/<Menu>\s*AE Agent 3\.3\.0\s*<\/Menu>/g)||[]).length;
      for(let i=0;i<matchingMenus;i++) menus.push(root);
      if (/\bId\s*=\s*["']com\.codex\.aemcpbridge\.panel["']/.test(xml)) copies.push({root,manifest,xml});
    }
  }
  if (!copies.length) throw problem("installed_panel_missing");
  if (copies.length!==1 || menus.length!==1 || path.resolve(menus[0])!==path.resolve(copies[0].root)) throw problem("installed_panel_ambiguous","Exact extension ID or menu title has multiple installed owners.",{copies:copies.map(c=>c.root),menuOwners:menus});
  const c=copies[0];
  if (path.basename(c.root)!==TARGET.bundleId || !/ExtensionBundleId="com\.codex\.aemcpbridge"/.test(c.xml) || !/ExtensionBundleVersion="3\.3\.0"/.test(c.xml) || !/<Host\s+Name="AEFT"/.test(c.xml) || !/<Extension\s+Id="com\.codex\.aemcpbridge\.panel"\s+Version="3\.3\.0"/.test(c.xml) || !/<MainPath>\.\/index\.html<\/MainPath>/.test(c.xml)) throw problem("installed_panel_identity_mismatch");
  const hashes={};
  for (const asset of ["CSXS/manifest.xml","index.html","panel.js","style.css","lib/CSInterface.js"]) {
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
module.exports={TOOL_NAME,TARGET,tool,validateInput,assertIdle,selectRunningAE,inspectInstalledTarget,generateBootstrapJsx,createPanelBootstrapService,exactCdpTarget};

"use strict";

// Private application-UI service. Never accepts caller scripts, paths or IDs.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const {spawn, execFile} = require("child_process");
const {fileURLToPath} = require("url");
const {selectCepPanelTarget,isCepExtensionUrl} = require("../scripts/cep-panel-target");
const recoveryState=require("./session-recovery-state");

const TARGET = Object.freeze({bundleId:"com.codex.aemcpbridge", extensionId:"com.codex.aemcpbridge.panel", menu:"AE Agent 3.3.4", version:"3.3.4"});
const TOOL_NAME = "ensure_ae_agent_panel";
const RECOVERY_TOOL_NAME="recover_ae_agent_panel";
const recoveryTool={name:RECOVERY_TOOL_NAME,description:"Reconcile the private active panel-bootstrap attempt using exact authenticated native results, or one separately identified fixed project read through the existing physical native latch. Preserves old UNKNOWN, never replays old commands or UI. Accepts no selectors. A successful reconciliation requires a separate fresh ensure.",annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false},inputSchema:{type:"object",additionalProperties:false,properties:{}}};
const tool = {name:TOOL_NAME, description:"Open/activate the fixed installed AE Agent CEP panel in one already-running After Effects, or reconnect its exact existing CDP page. Changes application panel UI only; never project contents. Success requires fresh panel connectivity and the ordinary native typed get_project_info. Unknown delivery blocks replay.",
  annotations:{readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:false},
  inputSchema:{type:"object",additionalProperties:false,properties:{timeoutMs:{type:"integer",minimum:1,maximum:30000,description:"Overall deadline in milliseconds, default 30000."}}}};
function problem(code, message, evidence) { return Object.assign(new Error(message || code), {code,evidence}); }
function acquireServiceLock(lockPath){
  const ledger=require("./native-fixture-attempt-ledger"),newOwner=()=>JSON.stringify({schema:2,pid:process.pid,token:crypto.randomUUID()}),absent=pid=>{if(!Number.isInteger(pid)||pid<1)throw problem("bootstrap_lock_unproven");try{process.kill(pid,0);return false;}catch(error){if(error.code==="ESRCH")return true;throw problem("bootstrap_lock_owner_unproven");}},owner=bytes=>{const text=bytes.toString("utf8");if(/^\d+$/.test(text))return Number(text);let row;try{row=JSON.parse(text);}catch(_){throw problem("bootstrap_lock_unproven");}if(row.schema!==2||!recoveryState.UUID.test(row.token||""))throw problem("bootstrap_lock_unproven");return row.pid;};
  function create(){const fd=fs.openSync(lockPath,"wx",0o600);fs.writeFileSync(fd,newOwner());fs.fsyncSync(fd);return fd;}
  ledger.safeDirectory(path.dirname(lockPath));
  try{return create();}
  catch(error){
    if(error.code!=="EEXIST")throw error;
    const bytes=ledger.readBytes(lockPath),stat=fs.lstatSync(lockPath),pid=owner(bytes);if(!absent(pid))throw problem("bootstrap_busy");
    // Append-only claimant CAS serializes stale reclaimers. A crashed claimant
    // is superseded only after strict process absence, under a NEW claim UUID.
    // A claim never grants native authority and never removes another lock.
    const sha=recoveryState.hash(bytes),claims=path.join(path.dirname(lockPath),"service-lock-reclaims",recoveryState.hash(Buffer.from(sha+":"+stat.dev+":"+stat.ino)));ledger.ensure(claims);
    const names=fs.readdirSync(claims).sort();if(names.length>128)throw problem("bootstrap_lock_reclaim_budget");
    for(let n=0;n<names.length;n++)if(names[n]!==String(n).padStart(4,"0")+".json")throw problem("bootstrap_lock_claim_corrupt");
    if(names.length){const prior=JSON.parse(ledger.readBytes(path.join(claims,names.at(-1))));if(prior.originalRawSha256!==sha||!recoveryState.UUID.test(prior.token||""))throw problem("bootstrap_lock_claim_corrupt");if(!absent(prior.pid))throw problem("bootstrap_busy");}
    const claimPath=path.join(claims,String(names.length).padStart(4,"0")+".json");let claim;
    try{claim=fs.openSync(claimPath,"wx",0o600);fs.writeFileSync(claim,JSON.stringify({schema:1,pid:process.pid,token:crypto.randomUUID(),originalRawSha256:sha}));fs.fsyncSync(claim);}catch(claimError){if(claimError.code==="EEXIST")throw problem("bootstrap_busy");throw claimError;}finally{if(claim!==undefined)fs.closeSync(claim);}
    const current=fs.lstatSync(lockPath);if(current.dev!==stat.dev||current.ino!==stat.ino||!ledger.readBytes(lockPath).equals(bytes)||!absent(pid))throw problem("bootstrap_lock_changed");
    fs.unlinkSync(lockPath);return create();
  }
}
function releaseServiceLock(fd,file){const held=fs.fstatSync(fd);fs.closeSync(fd);const current=fs.lstatSync(file);if(held.dev!==current.dev||held.ino!==current.ino)throw problem("bootstrap_lock_owner_changed");fs.unlinkSync(file);}
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
      const matchingMenus=(xml.match(/<Menu>\s*AE Agent 3\.3\.4\s*<\/Menu>/g)||[]).length;
      for(let i=0;i<matchingMenus;i++) menus.push(root);
      if (/\bId\s*=\s*["']com\.codex\.aemcpbridge\.panel["']/.test(xml)) copies.push({root,manifest,xml});
    }
  }
  if (!copies.length) throw problem("installed_panel_missing");
  if (copies.length!==1 || menus.length!==1 || path.resolve(menus[0])!==path.resolve(copies[0].root)) throw problem("installed_panel_ambiguous","Exact extension ID or menu title has multiple installed owners.",{copies:copies.map(c=>c.root),menuOwners:menus});
  const c=copies[0];
  if (path.basename(c.root)!==TARGET.bundleId || !/ExtensionBundleId="com\.codex\.aemcpbridge"/.test(c.xml) || !/ExtensionBundleVersion="3\.3\.4"/.test(c.xml) || !/<Host\s+Name="AEFT"/.test(c.xml) || !/<Extension\s+Id="com\.codex\.aemcpbridge\.panel"\s+Version="3\.3\.4"/.test(c.xml) || !/<MainPath>\.\/index\.html<\/MainPath>/.test(c.xml)) throw problem("installed_panel_identity_mismatch");
  const hashes={};
  for (const asset of ["CSXS/manifest.xml","index.html","panel-action-contract.js","panel-actions.js","native-probe-startup-guard.js","panel.js","style.css","lib/CSInterface.js"]) {
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
function dispatchNative(ae,scriptPath,assertScope=()=>{}) {
  return new Promise((resolve,reject)=>{
    assertScope();
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
async function reconnectCdp(target,timeoutMs,beforeSend,assertScope=()=>{}) {
  if(typeof WebSocket!=="function") throw problem("cdp_runtime_unsupported");
  const deadline=Date.now()+timeoutMs;
  const remaining=()=>{const ms=deadline-Date.now();if(ms<=0) throw problem("cdp_reload_unknown");return ms;};
  assertScope();
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  try {
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(problem("cdp_connect_timeout")),remaining());ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=()=>{clearTimeout(timer);reject(problem("cdp_connect_failed"));};});
    await beforeSend();
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(problem("cdp_reload_unknown")),remaining());
      ws.onmessage=e=>{try {const m=JSON.parse(e.data);if(m.id===1){clearTimeout(timer);m.error ? reject(problem("cdp_reload_rejected")) : resolve();}}catch(_){}};
      ws.onerror=()=>{clearTimeout(timer);reject(problem("cdp_reload_unknown"));};
      try{assertScope();ws.send(JSON.stringify({id:1,method:"Page.reload",params:{ignoreCache:true}}));}catch(error){clearTimeout(timer);reject(error);}
    });
  } finally {ws.close();}
}

function createPanelBootstrapService(deps) {
  const baseStateDir=path.resolve(deps.stateDir),services=new Map(),ledger=require("./native-fixture-attempt-ledger");
  function resolve(){
    const scope=deps.resolveSessionScope?deps.resolveSessionScope():null;
    if(scope===null)return {directory:baseStateDir,key:"legacy",scope:null};
    if(!scope||typeof scope.directory!=="string"||!path.isAbsolute(scope.directory)||path.resolve(scope.directory)!==scope.directory||!scope.binding||typeof scope.binding!=="object"||Array.isArray(scope.binding)||typeof scope.assertUnchanged!=="function")throw problem("bootstrap_session_namespace_invalid");
    scope.assertUnchanged();const binding=JSON.parse(JSON.stringify(scope.binding));
    return {directory:scope.directory,key:scope.directory+"\0"+recoveryState.canonical(binding),binding,scope};
  }
  function checkMarker(selected,create){
    if(!selected.scope)return;
    selected.scope.assertUnchanged();const directory=selected.directory,file=path.join(directory,"scope.json");
    if(fs.existsSync(directory))ledger.safeDirectory(directory);
    if(!fs.existsSync(file)){
      if(fs.existsSync(directory)&&fs.readdirSync(directory).length)throw problem("bootstrap_session_scope_marker_missing");
      if(!create)return;
      ledger.ensure(directory);selected.scope.assertUnchanged();let fd;
      try{fd=fs.openSync(file,"wx",0o600);fs.writeFileSync(fd,JSON.stringify(selected.binding));fs.fsyncSync(fd);}catch(error){if(error.code!=="EEXIST")throw error;}finally{if(fd!==undefined)fs.closeSync(fd);}
    }
    let binding;try{binding=JSON.parse(ledger.readBytes(file));}catch(error){throw problem("bootstrap_session_scope_marker_invalid");}
    if(recoveryState.canonical(binding)!==recoveryState.canonical(selected.binding))throw problem("bootstrap_session_scope_binding_changed");
    selected.scope.assertUnchanged();
  }
  function selectedService(create){
    const selected=resolve();checkMarker(selected,create);
    function assertScope(){const current=resolve();if(current.key!==selected.key)throw problem("bootstrap_session_namespace_changed");checkMarker(current,false);}
    if(!services.has(selected.key)){
      const guarded={...deps,stateDir:selected.directory,assertScope};
      for(const name of ["getStatus","getOrigin","getDeliveryFence","readProject","readResult","discoverAE","inspectInstalled","assertNoCollision","discoverCdp","reconnectCdp","dispatchNative","pause"]){
        if(typeof deps[name]==="function")guarded[name]=(...args)=>{assertScope();return deps[name](...args);};
      }
      services.set(selected.key,createScopedPanelBootstrapService(guarded));
    }
    return services.get(selected.key);
  }
  function unavailable(error){const code=typeof error.code==="string"&&/^[a-z0-9_]+$/.test(error.code)?error.code:"bootstrap_session_namespace_unavailable";return {stage:["bootstrap_session_namespace_pending_current","bootstrap_session_namespace_pending_activation"].includes(code)?"namespace_pending":"namespace_unavailable",code,busy:true,admissionBlocked:true,replayAllowed:false,automaticReplayAllowed:false};}
  function snapshot(){try{const value=selectedService(false).snapshot();return value?.stage==="record_failure"&&value.code?.startsWith("bootstrap_session_")?unavailable({code:value.code}):value;}catch(error){return unavailable(error);}}
  function isBusy(){try{return selectedService(false).isBusy();}catch(_){return true;}}
  return {snapshot,isBusy,ensure:raw=>{validateInput(raw||{});return selectedService(true).ensure(raw);},recover:raw=>{if(raw!==undefined&&(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).length))throw problem("invalid_bootstrap_recovery_arguments");return selectedService(true).recover(raw);},
    observeTerminal:(...args)=>selectedService(true).observeTerminal(...args),captureRecoveryBinding:(...args)=>selectedService(false).captureRecoveryBinding(...args),
    recoveryChallenge:(...args)=>selectedService(false).recoveryChallenge(...args),acceptRecoveryEpoch:(...args)=>selectedService(true).acceptRecoveryEpoch(...args)};
}
function createScopedPanelBootstrapService(deps) {
  const stateDir=path.resolve(deps.stateDir), statePath=path.join(stateDir,"attempt.json"), lockPath=path.join(stateDir,"service.lock");
  const now=deps.now || Date.now, pause=deps.pause || (ms=>new Promise(r=>setTimeout(r,ms)));
  const discover=deps.discoverAE || discoverRunningAE, installed=deps.inspectInstalled || inspectInstalledTarget;
  let running=false;
  function load() {deps.assertScope?.();if(!fs.existsSync(statePath)) return null;try {const r=JSON.parse(fs.readFileSync(statePath,"utf8"));if(r.schema!==1 || !/^[a-f0-9-]{36}$/.test(r.requestId)) throw Error();return r;}catch(_){throw problem("bootstrap_record_corrupt");}}
  function save(r) {deps.assertScope?.();const temp=statePath+"."+process.pid+".tmp";fs.writeFileSync(temp,JSON.stringify(r,null,2),{mode:0o600});fs.renameSync(temp,statePath);}
  function ackFor(r) {
    deps.assertScope?.();
    const ackPath=path.join(stateDir,r.requestId+".ack.json");
    if(!fs.existsSync(ackPath)) return null;
    try {const a=JSON.parse(fs.readFileSync(ackPath,"utf8").replace(/^\uFEFF/,""));return a.requestId===r.requestId && Number.isInteger(a.commandId) && ["expired","unsupported_api","lookup_failed","command_unavailable","executing","execution_unknown","executed"].includes(a.state) ? a : null;}catch(_){return null;}
  }
  function snapshot() {try {const r=load();return r ? {requestId:r.requestId,stage:r.stage,deadline:r.deadline,delivery:r.delivery,ae:r.ae || null,target:r.target || null,cli:r.cli || null,projectReadCommand:r.projectReadCommand || null,ack:ackFor(r),...(r.stage==="project_read_unknown"?{recovery:recovery.status()}: {})} : null;}catch(e){return {stage:"record_failure",code:e.code};}}
  const recovery=createBootstrapRecovery({stateDir,statePath,assertScope:deps.assertScope,load,ackFor,getStatus:deps.getStatus,getOrigin:deps.getOrigin,getDeliveryFence:deps.getDeliveryFence,readProject:deps.readProject,readResult:deps.readResult,recoveryKey:deps.recoveryKey,assertIdle,now,isBusy:()=>running,setBusy:v=>{running=v;}});
  async function ensure(raw) {
    let stage="input", record=null, lock=null, ownsRun=false;
    try {
      deps.assertScope?.();
      const {timeoutMs}=validateInput(raw || {}), deadline=now()+timeoutMs;
      if(running) throw problem("bootstrap_busy");
      running=true;ownsRun=true;
      fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
      lock=acquireServiceLock(lockPath);
      const remaining=()=>{const ms=deadline-now();if(ms<=0) throw problem("bootstrap_timeout");return ms;};
      stage="preflight";let status=deps.getStatus();assertIdle(status);
      record=load();
      if(record && record.stage==="project_read_unknown") throw problem("project_read_unknown","Previous typed project read has no terminal result. Use recover_ae_agent_panel with empty arguments; no automatic replay.");
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
        deps.assertScope?.();
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
          if(cdp) {await (deps.reconnectCdp || reconnectCdp)(cdp,remaining(),recheck,deps.assertScope);record.reloadAcknowledged=true;}
          else {await recheck();deps.assertScope?.();record.cli=await (deps.dispatchNative || dispatchNative)(ae,scriptPath,deps.assertScope);}
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
      if(deps.getOrigin)record.origin=deps.getOrigin();
      record.stage="project_read_unknown";save(record);
      let queueCallbackOpen=true;
      const read=Promise.resolve().then(()=>deps.readProject(budget, pins=>{if(!queueCallbackOpen||load()?.requestId!==record.requestId)throw problem("bootstrap_read_owner_changed");record.projectReadCommand={...pins,tool:"get_project_info",...(record.origin?{origin:record.origin}:{})};save(record);return {kind:"bootstrap",pins:record.projectReadCommand};}));
      let timer;
      let project;
      try {project=await Promise.race([read,new Promise((_,reject)=>{timer=setTimeout(()=>reject(problem("project_read_timeout")),budget);})]);}
      finally {queueCallbackOpen=false;clearTimeout(timer);}
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
      return {ok:false,status:"failure",stage,reason:e.code || "bootstrap_failed",message:e.message,evidence:e.evidence || snapshot(),panelConnected:Boolean(deps.getStatus().panelConnected),...(record?.stage==="project_read_unknown"?{automaticReplayAllowed:false,replayAllowed:false,nextAction:{tool:RECOVERY_TOOL_NAME,arguments:{}}}:{})};
    } finally {if(lock!==null)releaseServiceLock(lock,lockPath);if(ownsRun) running=false;}
  }
  return {ensure,snapshot,isBusy:()=>running||recovery.admissionBlocked(),recover:recovery.recover,observeTerminal:recovery.observeTerminal,captureRecoveryBinding:recovery.capture,recoveryChallenge:recovery.challenge,acceptRecoveryEpoch:recovery.activate};
}

// Shared with ensure under service.lock. Recovery selects only the private
// active pointer; immutable original bytes, witnesses and dispositions survive
// daemon/result-map loss. No old command is ever resubmitted.
function createBootstrapRecovery(deps){
  const {stateDir,statePath}=deps,R=recoveryState,ledger=require("./native-fixture-attempt-ledger"),base=path.join(stateDir,"recovery"),witnessDir=path.join(stateDir,"terminal-witnesses");
  function key(create=false){deps.assertScope?.();if(deps.recoveryKey)return deps.recoveryKey;const file=path.join(stateDir,"recovery.key");if(!fs.existsSync(file)){if(!create)throw problem("bootstrap_recovery_key_missing");const fd=fs.openSync(file,"wx",0o600);try{fs.writeFileSync(fd,crypto.randomBytes(32));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}const bytes=fs.readFileSync(file);if(bytes.length!==32)throw problem("bootstrap_recovery_key_invalid");return bytes;}
  function sign(value,create=false){return crypto.createHmac("sha256",key(create)).update(R.canonical(value)).digest("hex");}
  function read(file){deps.assertScope?.();if(!fs.existsSync(file))return null;const row=JSON.parse(ledger.readBytes(file)),{authentication,...value}=row;if(authentication!==sign(value))throw problem("bootstrap_recovery_record_invalid");return value;}
  function write(file,value){deps.assertScope?.();ledger.ensure(path.dirname(file));if(fs.existsSync(file)){const prior=read(file);if(!R.same(prior,value))throw problem("bootstrap_recovery_record_conflict");return prior;}const fd=fs.openSync(file,"wx",0o600);try{fs.writeFileSync(fd,JSON.stringify({...value,authentication:sign(value,true)}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return read(file);}
  function observeTerminal(binding,row){
    deps.assertScope?.();
    if(!binding||!binding.pins||!R.UUID.test(binding.pins.id||""))return;
    row.observedOrigin=deps.getOrigin?.();
    const value={...row,tool:"get_project_info",origin:binding.pins.origin};
    // A timeout is a transport outcome. Never turn it, or a late ignored ACK,
    // into a native completion. Save accepted native/never-delivered facts only.
    if(!R.exactTerminal(binding.pins,value))return;
    write(path.join(witnessDir,binding.pins.id+".json"),{schema:1,binding,terminal:value});
  }
  async function terminal(pins){
    if(!pins||!R.UUID.test(pins.id||""))return null;
    const durable=read(path.join(witnessDir,pins.id+".json"));
    if(durable){if(!R.same(durable.binding.pins,pins))throw problem("bootstrap_recovery_terminal_binding_changed");return durable.terminal;}
    return deps.readResult?await deps.readResult(pins):null;
  }
  function origin(){const value=deps.getOrigin?.();if(!R.origin(value))throw problem("bootstrap_recovery_actor_or_source_unproven");return value;}
  function uiTerminal(attempt){if(attempt.delivery==="none")return true;if(attempt.delivery==="native")return deps.ackFor(attempt)?.state==="executed";return attempt.delivery==="cdp"&&attempt.reloadAcknowledged===true;}
  function capture(){
    deps.assertScope?.();
    if(!fs.existsSync(statePath))return null;const raw=ledger.readBytes(statePath),attempt=deps.load();if(attempt.stage!=="project_read_unknown")return null;
    const sha=R.hash(raw),dir=path.join(base,sha),barriers=[];
    if(fs.existsSync(dir))for(const name of fs.readdirSync(dir).filter(n=>/^barrier-\d+$/.test(n)).sort()){const row=read(path.join(dir,name,"pins.json"));if(row)barriers.push({operationId:row.operationId,pins:row.pins});}
    return {originalRawSha256:sha,requestId:attempt.requestId,projectReadCommand:attempt.projectReadCommand||null,barriers};
  }
  function epoch(){const cover=capture();if(!cover)return null;const dir=path.join(base,cover.originalRawSha256);if(!fs.existsSync(dir))return null;const names=fs.readdirSync(dir).filter(n=>/^epoch-\d+$/.test(n)).sort((a,b)=>Number(a.slice(6))-Number(b.slice(6)));if(!names.length)return null;const directory=path.join(dir,names.at(-1)),intent=read(path.join(directory,"intent.json"));if(!intent)throw problem("bootstrap_recovery_epoch_intent_missing");return {directory,intent,activation:read(path.join(directory,"activation.json")),index:Number(names.at(-1).slice(6)),cover};}
  function epochPending(){try{const e=epoch();return !!e&&!e.activation;}catch(_){return true;}}
  function admissionBlocked(){try{return deps.load()?.stage==="project_read_unknown";}catch(_){return true;}}
  function challenge(actor){const e=epoch();if(!e||e.activation)return null;const exact=R.same(actor,e.intent.origin.actor)||R.same(actor,e.intent.nextActor),historical=!exact&&R.actor(actor)&&actor.panelConnectionId===e.intent.origin.actor.panelConnectionId&&/^[1-9]\d*$/.test(actor.panelGeneration)&&Number(actor.panelGeneration)>Number(e.intent.nextActor.panelGeneration);if(!exact&&!historical)throw problem("bootstrap_recovery_epoch_actor_changed");return {...e.intent,schema:"ae-agent.bootstrap-recovery-epoch.v1.challenge",historicalReceiptOnly:historical};}
  function requestEpoch(attempt,sha,before){
    const prior=epoch();if(prior&&!prior.activation)return {ok:false,status:"blocked",reason:"bootstrap_recovery_epoch_pending",replayAllowed:false,nextAction:{tool:RECOVERY_TOOL_NAME,arguments:{},mode:"observe_epoch_ack"}};
    const cover=capture(),generation=crypto.randomUUID(),nextActor={...before.actor,panelLifecycleEpoch:before.actor.panelLifecycleEpoch+1,panelGeneration:String(Math.max(deps.now(),Number(before.actor.panelGeneration)||0)+1)},directory=path.join(base,sha,"epoch-"+(prior?prior.index+1:0));
    write(path.join(directory,"intent.json"),{schema:1,generation,challenge:crypto.randomUUID(),origin:before,nextActor,coveredBootstrap:cover,createdAt:new Date(deps.now()).toISOString()});
    return {ok:false,status:"blocked",reason:"bootstrap_recovery_epoch_pending",replayAllowed:false,automaticReplayAllowed:false,nextAction:{tool:RECOVERY_TOOL_NAME,arguments:{},mode:"observe_epoch_ack"}};
  }
  function activate(input){
    deps.assertScope?.();
    let lock;try{
      if(deps.isBusy())throw problem("bootstrap_busy");lock=acquireServiceLock(path.join(stateDir,"service.lock"));
      const e=epoch();if(!e)throw problem("bootstrap_recovery_epoch_absent");
      if(input?.kind==="request_fresh_epoch"){
        if(Object.keys(input).sort().join(",")!==["kind","generation","challenge","actor","physicalInflight","panelControl","deliveryFenceActor"].sort().join(","))throw problem("bootstrap_recovery_epoch_input_invalid");
        const i=e.intent,actual=origin(),c=input.panelControl;
        if(e.activation||input.generation!==i.generation||input.challenge!==i.challenge||!R.same(actual.actor,input.actor)||!R.same(input.deliveryFenceActor,input.actor)||actual.actor.panelConnectionId!==i.origin.actor.panelConnectionId||!(/^[1-9]\d*$/.test(actual.actor.panelGeneration)&&Number(actual.actor.panelGeneration)>Number(i.nextActor.panelGeneration))||input.physicalInflight!==0||!c||c.nativeControlIdle!==true||c.activeAction!==null||c.recoveryTransport!==null||c.actionStorage!=="ready"||!Array.isArray(c.oldActionEntries)||c.oldActionEntries.length||!R.same(e.cover,i.coveredBootstrap))throw problem("bootstrap_recovery_fresh_epoch_unproven");
        deps.assertIdle(deps.getStatus());
        write(path.join(e.directory,"superseded-unknown.json"),{schema:1,generation:i.generation,intentSha256:R.hash(Buffer.from(R.canonical(i))),coveredBootstrap:i.coveredBootstrap,revokingActor:actual.actor,deliveryFenceActor:input.deliveryFenceActor,physicalInflight:0,oldOutcome:"unknown_preserved",replayAllowed:false});
        const generation=crypto.randomUUID(),nextActor={...actual.actor,panelLifecycleEpoch:actual.actor.panelLifecycleEpoch+1,panelGeneration:String(Math.max(deps.now(),Number(actual.actor.panelGeneration))+1)},directory=path.join(base,e.cover.originalRawSha256,"epoch-"+(e.index+1));
        const intent=write(path.join(directory,"intent.json"),{schema:1,generation,challenge:crypto.randomUUID(),origin:actual,nextActor,coveredBootstrap:e.cover,supersededGeneration:i.generation,createdAt:new Date(deps.now()).toISOString()});
        return {ok:true,status:"bootstrap_recovery_fresh_epoch_pending",bootstrapRecovery:{...intent,schema:"ae-agent.bootstrap-recovery-epoch.v1.challenge",historicalReceiptOnly:false}};
      }
      if(!input||Object.keys(input).sort().join(",")!==["generation","challenge","previousActor","actor","physicalInflight","panelControl","project"].sort().join(","))throw problem("bootstrap_recovery_epoch_input_invalid");
      const i=e.intent,p=input.project,c=input.panelControl;
      if(input.generation!==i.generation||input.challenge!==i.challenge||!R.same(input.previousActor,i.origin.actor)||!R.same(input.actor,i.nextActor)||input.physicalInflight!==0||!p||p.challenge!==i.challenge||p.projectPresent!==true||typeof p.file!=="string"||typeof p.dirty!=="boolean"||!Number.isSafeInteger(p.revision)||p.revision<0||p.rendering!==false||!c||c.nativeControlIdle!==true||c.activeAction!==null||c.recoveryTransport!==null||c.actionStorage!=="ready"||!Array.isArray(c.oldActionEntries)||c.oldActionEntries.length||!R.same(e.cover,i.coveredBootstrap))throw problem("bootstrap_recovery_epoch_physical_fence_unproven");
      deps.assertIdle(deps.getStatus());const actual=origin(),historical=!R.same(actual.actor,i.origin.actor)&&!R.same(actual.actor,i.nextActor);
      if(e.activation){if(!R.same(e.activation.payload,input))throw problem("bootstrap_recovery_epoch_terminal_conflict");return {ok:true,status:"bootstrap_recovery_epoch_active",activation:e.activation,...(historical?{historicalReceiptOnly:true}:{})};}
      // A resumed exact panel ACK may reach a successor backend. It is still
      // tied to the durable challenge/coverage and the actual changed actor.
      if(historical&&!(actual.actor.panelConnectionId===i.origin.actor.panelConnectionId&&/^[1-9]\d*$/.test(actual.actor.panelGeneration)&&Number(actual.actor.panelGeneration)>Number(i.nextActor.panelGeneration)))throw problem("bootstrap_recovery_epoch_actor_changed");
      const activation=write(path.join(e.directory,"activation.json"),{schema:1,generation:i.generation,originalRawSha256:e.cover.originalRawSha256,kind:"bootstrap_epoch",previousActor:i.origin.actor,actor:i.nextActor,coveredBootstrap:i.coveredBootstrap,origin:{actor:i.nextActor,runtime:actual.runtime},payload:input,replayAllowed:false,oldOutcome:"unknown_preserved"});
      return {ok:true,status:"bootstrap_recovery_epoch_active",activation,...(historical?{historicalReceiptOnly:true}:{})};
    }finally{if(lock!==undefined)releaseServiceLock(lock,path.join(stateDir,"service.lock"));}
  }
  function fence(attempt,sha,before,barrier){const e=epoch();if(e?.activation){const v=e.activation;if(R.deliveryFence(v,attempt,sha,before,{barrier:barrier||null}))return v;}return deps.getDeliveryFence?.(attempt,sha,before,barrier);}
  function status(){const pending=epochPending();return {state:pending?"epoch_pending":"reconciliation_required",currentAdmission:pending?"blocked_pending_epoch":"reconciliation_required",historicalOutcome:"unknown_preserved",replayAllowed:false,automaticReplayAllowed:false,nextAction:{tool:RECOVERY_TOOL_NAME,arguments:{},mode:pending?"observe_epoch_ack":"reconcile"}};}
  async function recover(raw={}){
    deps.assertScope?.();
    if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).length)throw problem("invalid_bootstrap_recovery_arguments");
    let lock=null,owns=false;
    const result=(state,extra={})=>({ok:state!=="blocked",status:state,replayAllowed:false,automaticReplayAllowed:false,...extra});
    try{
      if(deps.isBusy())throw problem("bootstrap_busy");deps.setBusy(true);owns=true;
      fs.mkdirSync(stateDir,{recursive:true,mode:0o700});lock=acquireServiceLock(path.join(stateDir,"service.lock"));
      if(!fs.existsSync(statePath))return result("no_active_attempt",{newEnsureRequired:true,nextAction:{tool:TOOL_NAME,arguments:{}}});
      const original=ledger.readBytes(statePath),sha=R.hash(original),attempt=deps.load(),dir=path.join(base,sha),originalFile=path.join(dir,"original-attempt.json");
      if(attempt.stage!=="project_read_unknown")return result("no_unknown_project_read",{newEnsureRequired:true,nextAction:{tool:TOOL_NAME,arguments:{}}});
      function unchanged(){deps.assertScope?.();if(!fs.existsSync(statePath)||R.hash(ledger.readBytes(statePath))!==sha)throw problem("bootstrap_recovery_active_pointer_changed");}
      function archive(){ledger.ensure(dir);if(fs.existsSync(originalFile)){if(!ledger.readBytes(originalFile).equals(original))throw problem("bootstrap_recovery_archive_changed");}else{const fd=fs.openSync(originalFile,"wx",0o600);try{fs.writeFileSync(fd,original);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}}
      function retire(classified,evidence){
        unchanged();archive();
        const file=path.join(dir,"disposition.json"),prior=read(file);
        const disposition=prior||write(file,{schema:1,requestId:attempt.requestId,originalRawSha256:sha,...classified,evidence,retiredAt:new Date(deps.now()).toISOString()});
        if(disposition.originalRawSha256!==sha||disposition.replayAllowed!==false||!["completed_observed","failed_observed","not_delivered_proven","epoch_fenced_unknown"].includes(disposition.state))throw problem("bootstrap_recovery_disposition_invalid");
        unchanged();fs.unlinkSync(statePath);
        return result(disposition.state,{oldOutcome:disposition.oldOutcome||disposition.state,originalRawSha256:sha,newEnsureRequired:true,nextAction:{tool:TOOL_NAME,arguments:{}}});
      }
      const prior=read(path.join(dir,"disposition.json"));
      if(prior)return retire(prior,prior.evidence);
      const oldTerminal=await terminal(attempt.projectReadCommand);unchanged();
      let classified=R.classify({attempt,terminal:oldTerminal,originalRawSha256:sha,uiTerminal:uiTerminal(attempt)});
      if(classified.state!=="blocked")return retire(classified,{kind:"exact_terminal",terminal:oldTerminal});
      if(!uiTerminal(attempt))return result("blocked",{reason:classified.reason,nextAction:{kind:"observe_application_ui_receipt",automaticReplayAllowed:false}});
      unchanged();archive();
      let index=0,barrierDir=path.join(dir,"barrier-"+index);while(fs.existsSync(path.join(dir,"barrier-"+(index+1)))){index++;barrierDir=path.join(dir,"barrier-"+index);}
      let intentFile=path.join(barrierDir,"intent.json"),pinsFile=path.join(barrierDir,"pins.json"),notQueuedFile=path.join(barrierDir,"not-enqueued.json");
      let intent=read(intentFile),pinsRow=read(pinsFile),notQueued=read(notQueuedFile);
      if(intent&&intent.originalRawSha256!==sha)throw problem("bootstrap_recovery_barrier_binding_invalid");
      // Durable accepted terminal evidence can finish a receipt/CAS crash even
      // after backend restart. Its before/after origins were captured in the
      // native result handler, rather than reconstructed from newer disk bytes.
      if(pinsRow){
        if(!intent||pinsRow.operationId!==intent.operationId||pinsRow.originalRawSha256!==sha||!R.same(pinsRow.pins.origin,intent.origin))throw problem("bootstrap_recovery_barrier_binding_invalid");
        const exact=await terminal(pinsRow.pins);unchanged();
        const resumed=R.classify({attempt,originalRawSha256:sha,uiTerminal:true,barrier:{originalRawSha256:sha,before:intent.origin,after:exact?.observedOrigin,pins:pinsRow.pins,terminal:exact,deliveryFence:intent.deliveryFence}});
        if(resumed.state!=="blocked")return retire(resumed,{kind:"physical_barrier",operationId:intent.operationId,pins:pinsRow.pins,terminal:exact,before:intent.origin,after:exact.observedOrigin});
        deps.assertIdle(deps.getStatus());const current=origin(),epochFence=fence(attempt,sha,current,{operationId:intent.operationId,pins:pinsRow.pins});
        if(!R.deliveryFence(epochFence,attempt,sha,current,{barrier:{operationId:intent.operationId,pins:pinsRow.pins}}))return requestEpoch(attempt,sha,current);
        // A new signed physical reset epoch covers this exact old barrier.
        // Preserve it UNKNOWN and allocate a NEW identity in that new epoch.
        write(path.join(barrierDir,"epoch-fenced-unknown.json"),{schema:1,operationId:intent.operationId,pins:pinsRow.pins,deliveryFence:epochFence,replayAllowed:false,oldOutcome:"unknown_preserved"});
        index++;barrierDir=path.join(dir,"barrier-"+index);intentFile=path.join(barrierDir,"intent.json");pinsFile=path.join(barrierDir,"pins.json");notQueuedFile=path.join(barrierDir,"not-enqueued.json");intent=null;pinsRow=null;notQueued=null;
      }
      deps.assertIdle(deps.getStatus());const before=origin();unchanged();
      if(intent){
        // The queue callback durably writes pins BEFORE actual enqueue. Missing
        // pins therefore prove this barrier was never enqueued; retain that
        // evidence and use a new operation identity, never replay its identity.
        if(!notQueued)notQueued=write(notQueuedFile,{schema:1,operationId:intent.operationId,originalRawSha256:sha,reason:"pins_before_enqueue_absent"});
        if(notQueued.operationId!==intent.operationId||notQueued.originalRawSha256!==sha)throw problem("bootstrap_recovery_not_enqueued_invalid");
        index++;barrierDir=path.join(dir,"barrier-"+index);intentFile=path.join(barrierDir,"intent.json");pinsFile=path.join(barrierDir,"pins.json");notQueuedFile=path.join(barrierDir,"not-enqueued.json");intent=null;notQueued=null;
      }
      const deliveryFence=fence(attempt,sha,before);
      if(!R.deliveryFence(deliveryFence,attempt,sha,before))return requestEpoch(attempt,sha,before);
      if(!intent){intent=write(intentFile,{schema:1,operationId:crypto.randomUUID(),originalRawSha256:sha,origin:before,deliveryFence,createdAt:new Date(deps.now()).toISOString()});}
      // An interrupted callback may have queued work. A bare intent is not a
      // non-delivery proof; no second barrier is submitted on reentry.
      if(pinsRow){
        if(pinsRow.operationId!==intent.operationId||pinsRow.originalRawSha256!==sha||!R.same(pinsRow.pins.origin,before))throw problem("bootstrap_recovery_barrier_binding_invalid");
      }
      else{
        try{
          await deps.readProject(10000,pins=>{
            unchanged();if(!R.same(origin(),before))throw problem("bootstrap_recovery_actor_changed");
            pinsRow=write(pinsFile,{schema:1,operationId:intent.operationId,originalRawSha256:sha,pins:{...pins,tool:"get_project_info",origin:before}});
            return {kind:"recovery_barrier",operationId:intent.operationId,originalRawSha256:sha,pins:pinsRow.pins};
          });
        }catch(error){
          if(!fs.existsSync(pinsFile)&&(error.phase==="before_delivery"||error.lifecycleState==="expired_before_delivery"))write(notQueuedFile,{schema:1,operationId:intent.operationId,originalRawSha256:sha,reason:error.code||"before_delivery"});
          return result("blocked",{reason:error.code||"recovery_barrier_unknown",nextAction:{tool:RECOVERY_TOOL_NAME,arguments:{},mode:"read_back_only"}});
        }
      }
      const exact=await terminal(pinsRow.pins),after=origin();unchanged();deps.assertIdle(deps.getStatus());
      classified=R.classify({attempt,originalRawSha256:sha,uiTerminal:true,barrier:{originalRawSha256:sha,before,after,pins:pinsRow.pins,terminal:exact,deliveryFence:intent.deliveryFence}});
      if(classified.state==="blocked")return result("blocked",{reason:classified.reason,nextAction:{tool:RECOVERY_TOOL_NAME,arguments:{},mode:"read_back_only"}});
      return retire(classified,{kind:"physical_barrier",operationId:intent.operationId,pins:pinsRow.pins,terminal:exact,before,after});
    }catch(error){return result("blocked",{reason:error.code||"bootstrap_recovery_unknown",nextAction:{kind:error.code==="EEXIST"?"observe_service_lock_owner":"inspect_recovery_evidence"}});}
    finally{if(lock!==null)releaseServiceLock(lock,path.join(stateDir,"service.lock"));if(owns)deps.setBusy(false);}
  }
  return {recover,observeTerminal,capture,epochPending,admissionBlocked,challenge,activate,status};
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
module.exports={TOOL_NAME,RECOVERY_TOOL_NAME,TARGET,tool,recoveryTool,validateInput,assertIdle,selectRunningAE,inspectInstalledTarget,generateBootstrapJsx,createPanelBootstrapService,exactCdpTarget,createStaleBootstrapReconciler,STALE_READ};
if(require.main===module){(async()=>{const args=process.argv.slice(2);staleCheck(args.length===1&&["stale-read-status","reconcile-stale-read"].includes(args[0]),"closed_cli_required");const s=createStaleBootstrapReconciler();process.stdout.write(JSON.stringify(args[0]==="stale-read-status"?s.inspect():await s.reconcile())+"\n");})().catch(e=>{process.stdout.write(JSON.stringify({ok:false,code:e.code||"bootstrap_stale_recovery_unknown",replayAllowed:false})+"\n");process.exitCode=1;});}

#!/usr/bin/env node
"use strict";
// Explicit maintenance only; no daemon restart, install, native dispatch, reset or ordinary panel reload.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),http=require("node:http"),crypto=require("node:crypto"),{spawnSync}=require("node:child_process"),{pathToFileURL}=require("node:url");
const recovery=require("../mcp-server/common-title-assembly-recovery"),records=require("../mcp-server/plan-run-records"),control=require("../mcp-server/cep-panel-control"),bootstrap=require("../mcp-server/ae-agent-panel-bootstrap");
const ROOT=path.resolve(__dirname,".."),LOG=path.join(ROOT,"logs"),ASSETS=["CSXS/manifest.xml","index.html","panel-action-contract.js","panel-actions.js","panel.js","style.css","lib/CSInterface.js"];
const fail=code=>{throw Object.assign(new Error(code),{code});},sha=value=>crypto.createHash("sha256").update(value).digest("hex"),normalized=s=>String(s).replace(/^\uFEFF/,"").replace(/\r\n/g,"\n");
function parse(argv){const a=argv.slice(2),command=a.shift() || "help";if(command==="help" && !a.length)return {command};if(command==="reload" && !a.length)return {command};if(command!=="capture" || a.length!==2 || a[0]!=="--barrier-command-id" || !records.ID.test(a[1]))fail("common_title_maintenance_cli_invalid");return {command,barrierId:a[1]};}
function config(){
  const env={};for(const line of fs.readFileSync(path.join(ROOT,".env"),"utf8").split(/\r?\n/)){const m=line.match(/^\s*(AE_BRIDGE_TOKEN|AE_BRIDGE_HOST|AE_BRIDGE_PORT)\s*=\s*(.*?)\s*$/);if(m){let v=m[2];if((v[0]==='"' && v.endsWith('"')) || (v[0]==="'" && v.endsWith("'")))v=v.slice(1,-1);env[m[1]]=v;}}
  const host=process.env.AE_BRIDGE_HOST || env.AE_BRIDGE_HOST || "127.0.0.1",port=Number(process.env.AE_BRIDGE_PORT || env.AE_BRIDGE_PORT || 3456),token=process.env.AE_BRIDGE_TOKEN || env.AE_BRIDGE_TOKEN;
  if(host!=="127.0.0.1" || !Number.isSafeInteger(port) || port<1 || port>65535 || typeof token!=="string" || !token || /[\r\n]/.test(token))fail("common_title_maintenance_configuration_invalid");return {host,port,token};
}
function request(c,route,body){return new Promise((resolve,reject)=>{const json=body===undefined?null:JSON.stringify(body),req=http.request({host:c.host,port:c.port,path:route,method:json===null?"GET":"POST",headers:{authorization:"Bearer "+c.token,...(json!==null?{"content-type":"application/json","content-length":Buffer.byteLength(json)}:{})}},res=>{let size=0,chunks=[];res.on("data",b=>{size+=b.length;if(size>2*1024*1024){req.destroy(Error("common_title_response_budget"));return;}chunks.push(b);});res.on("end",()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(res.statusCode!==200 || value.ok!==true)fail(value.code || "common_title_server_request_failed");resolve(value);}catch(e){reject(e);}});});req.setTimeout(5000,()=>req.destroy(Error("common_title_server_timeout")));req.on("error",reject);if(json!==null)req.write(json);req.end();});}
function historicalAssets(record){
  const commit=record.run.provenance.runtime.gitCommit,temp=fs.mkdtempSync(path.join(os.tmpdir(),"common-title-old-assets-")),expected={};
  if(!/^[a-f0-9]{40}$/.test(commit))fail("common_title_old_commit_invalid");
  // Trusted local history is an identity reference, never executable recovery code.
  const roots=[process.env.APPDATA && path.join(process.env.APPDATA,"Adobe","CEP","extensions"),process.env.CommonProgramFiles && path.join(process.env.CommonProgramFiles,"Adobe","CEP","extensions"),process.env["CommonProgramFiles(x86)"] && path.join(process.env["CommonProgramFiles(x86)"],"Adobe","CEP","extensions")].filter(Boolean);
  const candidates=[...new Set(roots)].map(base=>path.join(base,bootstrap.TARGET.bundleId)).filter(p=>fs.existsSync(path.join(p,"index.html")));
  if(candidates.length!==1)fail("common_title_installed_target_ambiguous");
  for(const asset of ASSETS){const read=spawnSync("git",["show",commit+":cep-panel/"+asset],{cwd:ROOT,encoding:"utf8",windowsHide:true,maxBuffer:2*1024*1024});if(read.status!==0)fail("common_title_old_asset_history_missing");const installed=fs.readFileSync(path.join(candidates[0],asset));if(sha(normalized(installed.toString("utf8")))!==sha(normalized(read.stdout)))fail("common_title_old_installed_asset_mismatch");const file=path.join(temp,asset);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,installed);expected[asset]=sha(normalized(read.stdout));}
  const inspect=()=>({...bootstrap.inspectInstalledTarget(undefined,temp),historicalNormalizedHashes:expected});return {inspect,expected};
}
function cdp(url){
  if(!/^ws:\/\/127\.0\.0\.1:8870\//.test(url) || typeof WebSocket!=="function")fail("common_title_cdp_target_invalid");
  const socket=new WebSocket(url),pending=new Map(),scripts=[],opened=new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=()=>reject(Error("common_title_cdp_failed"));}),timer=setTimeout(()=>{for(const p of pending.values())p.reject(Error("common_title_cdp_timeout"));socket.close();},10000);let sequence=0;
  socket.onmessage=e=>{try{if(typeof e.data!=="string" || Buffer.byteLength(e.data)>2*1024*1024)fail("common_title_cdp_response_budget");const m=JSON.parse(e.data);if(m.method==="Debugger.scriptParsed")scripts.push(m.params);if(m.id && pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error("common_title_cdp_request_failed")):p.resolve(m.result);}}catch(_){socket.close();}};
  return {scripts,async send(method,params={}){if(!["Debugger.enable","Debugger.getScriptSource","Page.reload"].includes(method))fail("common_title_cdp_method_forbidden");await opened;return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});},close(){clearTimeout(timer);socket.close();}};
}
async function loadedOldHashes(target,installed,expected,open=cdp){
  const connection=open(target.webSocketDebuggerUrl);try{await connection.send("Debugger.enable");const result={};for(const asset of ["panel-action-contract.js","panel-actions.js","panel.js"]){const url=pathToFileURL(path.join(path.dirname(installed.indexPath),asset)).href,match=connection.scripts.filter(s=>{try{const parsed=new URL(s.url);parsed.search="";parsed.hash="";return parsed.href===url;}catch(_){return false;}});if(match.length!==1)fail("common_title_loaded_old_source_ambiguous");const source=await connection.send("Debugger.getScriptSource",{scriptId:match[0].scriptId});const hash=sha(normalized(source.scriptSource));if(hash!==expected[asset])fail("common_title_loaded_old_source_mismatch");result[asset]=hash;}return result;}finally{connection.close();}
}
async function run(argv,deps={}){
  const options=parse(argv);if(options.command==="help")return {ok:true,commands:["capture --barrier-command-id <completed-native-command-uuid>","reload"],notes:"Capture before maintenance restart/install. Reload only after server validates the durable capsule; one exact installed target, historical guard retained. No automatic retry."};
  const logDir=deps.logDir || LOG,c=deps.config || config(),httpRequest=deps.request || ((route,body)=>request(c,route,body)),record=records.readRecord(logDir,recovery.RUN_ID,{throwOnError:true});recovery.inspectRecord(record);
  if(options.command==="capture"){
    if(recovery.read(logDir,"capsule") || recovery.read(logDir,"maintenance"))fail("common_title_maintenance_capture_already_exists");
    const historical=deps.historical || historicalAssets(record),service=deps.service || control.createPanelControlService({inspectInstalledTarget:historical.inspect}),lock=control.acquireControllerLock(path.join(logDir,"cep-panel-control"),crypto.randomUUID());
    try{const before=await httpRequest("/dev/status"),retained=(await httpRequest("/results/"+options.barrierId)).result,original=await service.readRecoveryLinkage(recovery.REQUEST_ID),selected=await service.maintenanceTarget();
      const loaded=await (deps.loadedOldHashes || loadedOldHashes)(selected.target,selected.installed,historical.expected),after=await httpRequest("/dev/status");recovery.idle(before);recovery.idle(after);
      if(before.startedAt!==after.startedAt || before.lastPanelInfo?.panelConnectionId!==after.lastPanelInfo?.panelConnectionId || before.lastPanelInfo?.panelGeneration!==after.lastPanelInfo?.panelGeneration || selected.state.unresolvedActions?.length!==1 || selected.state.unresolvedActions[0].requestId!==recovery.REQUEST_ID)fail("common_title_capture_context_changed");
      const capsule=recovery.createCapsule({record,local:original.local,remote:original.remote,retained,status:after,panel:selected.state,installed:{...selected.installed,loadedOldScriptHashes:loaded},runtime:record.run.provenance.runtime});const saved=recovery.write(logDir,"capsule",{...capsule,configuration:{host:c.host,port:c.port,credentialIdentity:sha(c.token)}});
      return {ok:true,status:"maintenance_capsule_saved",sha256:saved.sha256,capsuleId:saved.value.capsuleId,expiresAt:saved.value.expiresAt,guardReleased:false,replayAllowed:false};
    }finally{lock.release();}
  }
  const capsule=recovery.read(logDir,"capsule"),local=control.loadDurableReceipt(path.join(logDir,"cep-panel-control"),recovery.REQUEST_ID);recovery.validateCapsule(capsule,record,local);
  if(capsule.value.configuration?.host!==c.host || capsule.value.configuration?.port!==c.port || capsule.value.configuration?.credentialIdentity!==sha(c.token))fail("common_title_maintenance_configuration_changed");
  // Authorization is durably reserved server-side before the first UI send. Unknown send is never replayed.
  const authorization=(await httpRequest("/common-title-recovery/maintenance",{runId:recovery.RUN_ID,originalRequestId:recovery.REQUEST_ID})).authorization,scope=authorization?.value;
  if(authorization?.schema!==recovery.ENVELOPE || recovery.hash(scope)!==authorization.sha256 || scope.status!=="reload_authorized" || scope.capsuleSha256!==capsule.sha256 || Date.parse(scope.expiresAt)<=Date.now())fail("common_title_reload_authorization_invalid");
  // The daemon's authorization lock ends with its response; the loader owns the next critical section.
  // A failed acquisition consumes that durable reservation too: there is no second UI attempt.
  const lock=control.acquireControllerLock(path.join(logDir,"cep-panel-control"),scope.scopeId);
  try{
    const currentConfig=deps.config || config();
    if(currentConfig.host!==c.host || currentConfig.port!==c.port || sha(currentConfig.token)!==capsule.value.configuration.credentialIdentity)fail("common_title_maintenance_configuration_changed");
    recovery.validateCapsule(capsule,record,local);recovery.idle(await httpRequest("/dev/status"));
    const service=deps.service || control.createPanelControlService(),selected=await service.maintenanceTarget(),original=await service.readRecoveryLinkage(recovery.REQUEST_ID);recovery.validateLinkage(record,original.local,original.remote);
    const state=selected.state,binding=capsule.value.oldPanelBinding;
    if(JSON.stringify(selected.installed)!==JSON.stringify(scope.installed) || selected.target.url!==scope.target.url || selected.target.webSocketDebuggerUrl!==scope.target.webSocketDebuggerUrl || state.panelInstanceId!==binding.panelInstanceId || state.panelLifecycleEpoch!==binding.panelLifecycleEpoch || state.panelGeneration!==binding.panelGeneration || state.bridgeConnection?.panelConnectionId!==capsule.value.panelConnectionId || state.nativeControlIdle!==true || state.unresolvedActions?.length!==1 || state.unresolvedActions[0].requestId!==recovery.REQUEST_ID)fail("common_title_reload_target_changed");
    recovery.idle(await httpRequest("/dev/status"));recovery.validateCapsule(capsule,record,original.local);
    if(Date.parse(scope.expiresAt)<=Date.now())fail("common_title_reload_authorization_invalid");
    const connection=(deps.cdp || cdp)(selected.target.webSocketDebuggerUrl);try{await connection.send("Page.reload",{ignoreCache:true});}catch(_){return {ok:false,status:"reload_outcome_unknown",replayAllowed:false,guardReleased:false};}finally{connection.close();}
    return {ok:true,status:"reload_submitted",scopeId:scope.scopeId,guardReleased:false,replayAllowed:false,next:"Read the restored historical guard; invoke a fresh manual plan.reconcile P1, then a separate P2 after the empty readonly handshake."};
  }finally{lock.release();}
}
if(require.main===module)run(process.argv).catch(e=>({ok:false,code:e.code || e.message || "common_title_maintenance_failed",guardReleased:false,replayAllowed:false})).then(result=>{process.stdout.write(JSON.stringify(result)+"\n");if(!result.ok)process.exitCode=1;});
module.exports={parse,run,loadedOldHashes,cdp,historicalAssets,config};

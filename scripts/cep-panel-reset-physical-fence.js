#!/usr/bin/env node
"use strict";

// Fixed operator CLI. No caller PID, target, script, path, credential or mode
// overrides. The only AE launch here forwards its fixed read service with -r;
// closing/reopening the application remains with the sole human/UI controller.
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),readline=require("node:readline"),{spawn,execFile}=require("node:child_process");
const fence=require("../mcp-server/cep-panel-reset-physical-fence"),authority=require("../mcp-server/owned-runtime-authority"),supervisor=require("../mcp-server/owned-runtime-supervisor"),reset=require("../mcp-server/owned-runtime-product-session-reset"),control=require("../mcp-server/cep-panel-control"),bootstrap=require("../mcp-server/ae-agent-panel-bootstrap");
const ROOT=path.resolve(__dirname,".."),FILE=__filename,HELPER=path.join(__dirname,"cep-panel-reset-physical-fence-helper.ps1"),PS="C:/Users/Ant/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe";
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Only existing named read APIs, evaluated on our own paused event's frame.
// No caller expression, properties, host code, or write operation is accepted.
const PAUSED_READ_EXPRESSION="(function(){var api=window.AEAgentPanelActions;if(!api||typeof api.state!==\"function\"||typeof api.catalog!==\"function\")return {ok:false};return {ok:true,state:api.state(),catalog:api.catalog()};})()";
function fail(code){throw Object.assign(Error(code),{code});}
function check(ok,code){if(!ok)fail(code);}
function parse(argv){const a=argv.slice(2);check(a.length===1&&["inspect","prepare-held-exit","readback","recover","__watch-held-exit"].includes(a[0]),"fence_closed_cli_required");if(a[0]==="__watch-held-exit")check(/^[a-f0-9-]{36}$/.test(process.env.AE_RESET_FENCE_WATCHER_TICKET||""),"fence_internal_watcher_required");return a[0];}
function pins(){return [FILE,path.join(ROOT,"mcp-server","cep-panel-reset-physical-fence.js"),HELPER].map(file=>({name:path.relative(ROOT,file).replace(/\\/g,"/"),sha256:fence.hash(require("../mcp-server/native-fixture-attempt-ledger").readBytes(file))}));}
function loadAuthority(){
  const reg=supervisor.readDaemonRegistration(ROOT);check(reg,"fence_registered_daemon_required");
  const privateControl=authority.runtimeControlFor(ROOT),key=privateControl.credential({daemon:{port:3456,credentialSha256:reg.credentialSha256}}),keyReader=v=>privateControl.credential({daemon:{port:3456,credentialSha256:v.credentialSha256}}),anchor=reset.sessionAnchor(ROOT,reg.generation,supervisor.registeredGeneration,keyReader),policy=reset.policy(ROOT);
  check(anchor&&anchor.value.generation===fence.GENERATION&&reg.generation===fence.GENERATION&&anchor.value.operationId===fence.OPERATION,"fence_exact_reset_anchor_required");
  const status=reset.currentStatus(ROOT,reg,supervisor.registeredGeneration,keyReader);anchor.assertUnchanged();policy.assertUnchanged();
  return {operationId:status.operationId,generation:status.generation,status:status.status,key,anchorSha256:anchor.pins.productResetAnchorRawSha256,policySha256:policy.rawSha256,sourcePins:pins()};
}
function verifyPwsh(){const p=require("../mcp-server/owned-runtime-win32").POLICY;check(p.executable===PS&&fence.hash(require("../mcp-server/native-fixture-attempt-ledger").readBytes(PS))===p.executableSha256,"fence_pwsh_source_changed");}
function runPs(source){verifyPwsh();return new Promise((resolve,reject)=>execFile(PS,["-NoLogo","-NoProfile","-NonInteractive","-Command",source],{windowsHide:true,timeout:10000,maxBuffer:256*1024},(error,out)=>{if(error){reject(Object.assign(Error("fence_census_failed"),{code:"fence_census_failed"}));return;}try{resolve(JSON.parse(out.replace(/^\uFEFF/,"")));}catch(_){reject(Object.assign(Error("fence_census_invalid"),{code:"fence_census_invalid"}));}}));}
async function census(){const rows=await runPs("$ErrorActionPreference='Stop'; $rows=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -ceq 'AfterFX.exe' -or $_.Name -ceq 'CEPHtmlEngine.exe' } | ForEach-Object { [pscustomobject]@{name=$_.Name;pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;imagePath=$_.ExecutablePath;birthFileTime=$_.CreationDate.ToUniversalTime().ToFileTimeUtc().ToString();birthUtc=$_.CreationDate.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffffffZ')} }); ConvertTo-Json -InputObject $rows -Compress");check(Array.isArray(rows),"fence_census_invalid");return rows.sort((a,b)=>(a.name==="AfterFX.exe"?-1:b.name==="AfterFX.exe"?1:a.pid-b.pid));}
function targets(){return new Promise((resolve,reject)=>{const req=http.get("http://127.0.0.1:8870/json/list",res=>{let text="";res.setEncoding("utf8");res.on("data",s=>{text+=s;if(text.length>256*1024)req.destroy();});res.on("end",()=>{try{check(res.statusCode===200,"fence_cdp_inventory_failed");const rows=JSON.parse(text);check(Array.isArray(rows),"fence_cdp_inventory_invalid");resolve(rows);}catch(e){reject(e);}});});req.setTimeout(2000,()=>req.destroy());req.on("error",e=>reject(Object.assign(Error(e.code==="ECONNREFUSED"?"fence_cdp_absent":"fence_cdp_unknown"),{code:e.code==="ECONNREFUSED"?"fence_cdp_absent":"fence_cdp_unknown"})));});}
async function connect(target){
  const ws=new WebSocket(target.webSocketDebuggerUrl),waiting=new Map(),listeners=new Set();let sequence=0,dead=false;
  const close=()=>{dead=true;for(const p of waiting.values()){clearTimeout(p.timer);p.reject(Object.assign(Error("fence_cdp_closed"),{code:"fence_cdp_closed"}));}waiting.clear();ws.close();};
  ws.onmessage=e=>{try{check(typeof e.data==="string"&&e.data.length<2*1024*1024,"fence_cdp_response_budget");const row=JSON.parse(e.data);if(row.id){const p=waiting.get(row.id);if(!p)return;waiting.delete(row.id);clearTimeout(p.timer);row.error?p.reject(Object.assign(Error("fence_cdp_method_failed"),{code:"fence_cdp_method_failed"})):p.resolve(row.result);}else for(const f of listeners)f(row);}catch(_){close();}};
  ws.onclose=()=>{if(!dead)close();};
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>{close();reject(Object.assign(Error("fence_cdp_connect_timeout"),{code:"fence_cdp_connect_timeout"}));},3000);ws.onopen=()=>{clearTimeout(t);resolve();};ws.onerror=()=>{clearTimeout(t);reject(Object.assign(Error("fence_cdp_connect_failed"),{code:"fence_cdp_connect_failed"}));};});
  return {close,on:f=>{listeners.add(f);return()=>listeners.delete(f);},send(method,params={}){check(["Page.getFrameTree","DOMStorage.enable","DOMStorage.getDOMStorageItems","DOMStorage.setDOMStorageItem","Debugger.enable","Debugger.pause","Debugger.resume","Debugger.evaluateOnCallFrame"].includes(method),"fence_cdp_method_forbidden");if(method==="Debugger.evaluateOnCallFrame")check(params.expression===PAUSED_READ_EXPRESSION&&params.returnByValue===true&&params.silent===true&&typeof params.callFrameId==="string"&&Object.keys(params).sort().join(",")==="callFrameId,expression,returnByValue,silent","fence_paused_expression_forbidden");check(!dead,"fence_cdp_closed");return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{waiting.delete(id);reject(Object.assign(Error("fence_cdp_timeout_no_replay"),{code:"fence_cdp_timeout_no_replay"}));},5000);waiting.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}};
}
async function storage(c){const tree=await c.send("Page.getFrameTree"),frame=tree.frameTree?.frame;check(frame&&frame.securityOrigin==="file://","fence_storage_origin_invalid");await c.send("DOMStorage.enable");const storageId={securityOrigin:frame.securityOrigin,isLocalStorage:true};return {frame:{id:frame.id,loaderId:frame.loaderId,url:frame.url},async read(key){const r=await c.send("DOMStorage.getDOMStorageItems",{storageId});check(Array.isArray(r.entries),"fence_storage_invalid");const rows=r.entries.filter(v=>v[0]===key);check(rows.length<=1,"fence_storage_duplicate");return rows.length?rows[0][1]:null;},write:(key,value)=>{check([fence.KEY,fence.ARCHIVE_KEY].includes(key),"fence_storage_key_forbidden");return c.send("DOMStorage.setDOMStorageItem",{storageId,key,value});}};}
async function pauseTarget(target,{open=connect,sleep=pause}={}){
  const c=await open(target);let paused=false,owned=false,requested=false,callFrameId=null;
  const remove=c.on(e=>{
    if(e.method==="Debugger.paused"){paused=true;if(requested){owned=true;callFrameId=e.params?.callFrames?.[0]?.callFrameId||null;}}
    if(e.method==="Debugger.resumed"){paused=false;owned=false;callFrameId=null;}
  });
  try{
    // Attach first: an existing pause notification belongs to someone else.
    await c.send("Debugger.enable");await sleep(100);
    check(!paused,"fence_target_already_paused");
    requested=true;await c.send("Debugger.pause");
    for(let n=0;!paused&&n<30;n++)await sleep(100);
    check(paused&&owned&&typeof callFrameId==="string"&&callFrameId.length>0,"fence_own_pause_event_missing");
    const s=await storage(c);
    check(JSON.stringify(s.frame)===JSON.stringify(target.frame),"fence_frame_changed_at_pause");
    function assertOwned(){check(owned&&paused,"fence_own_pause_lost");}
    return {owned:true,pausedEvent:true,
      async snapshot(){assertOwned();const response=await c.send("Debugger.evaluateOnCallFrame",{callFrameId,expression:PAUSED_READ_EXPRESSION,returnByValue:true,silent:true});assertOwned();const value=response.result?.value;check(!response.exceptionDetails&&value?.ok===true&&value.state&&Array.isArray(value.catalog),"fence_paused_named_state_unknown");const connectAction=value.catalog.find(item=>item.name==="bridge.connect");return {...value.state,connectAvailability:connectAction?.availability};},
      async read(key){assertOwned();const value=await s.read(key);assertOwned();return value;},
      async write(key,value){assertOwned();await s.write(key,value);assertOwned();},
      async resume(){try{assertOwned();await c.send("Debugger.resume");}finally{remove();c.close();}},
      close(){remove();c.close();}
    };
  }catch(e){
    if(owned&&paused)try{await c.send("Debugger.resume");}catch(_){}
    remove();c.close();throw e;
  }
}
function productionPanel(){const service=control.createPanelControlService();
  async function metadata(){const reg=supervisor.readDaemonRegistration(ROOT);check(reg,"fence_registered_daemon_required");const status=await authority.runtimeControlFor(ROOT).request({daemon:{port:3456,credentialSha256:reg.credentialSha256}},"/dev/status");check(status.humanGuardRuntime?.pid===reg.kernelIdentity.pid&&status.humanGuardRuntime.startedAt===reg.serviceStartedAt&&status.humanGuardRuntime.sourceSha256===reg.sourceSha256&&status.pendingCommands===0&&Array.isArray(status.inflightCommands)&&status.inflightCommands.length===0&&!["confirmed","executing"].includes(status.planExecutionState)&&!status.projectLifecycle?.pending,"fence_active_daemon_work_or_identity_changed");const selected=await service.maintenanceTarget(),catalog=await service.catalog();check(catalog.ok===true,"fence_catalog_unavailable");const item=catalog.actions.find(r=>r.name==="bridge.connect"),after=await service.state();check(after.ok&&after.state.panelInstanceId===selected.state.panelInstanceId&&after.state.panelLifecycleEpoch===selected.state.panelLifecycleEpoch&&after.state.panelGeneration===selected.state.panelGeneration,"fence_actor_changed");return {...selected,state:{...after.state,connectAvailability:item?.availability}};}
  return {async snapshot(){const m=await metadata(),c=await connect(m.target);try{const s=await storage(c);return {...m,target:{...m.target,frame:s.frame},raw:await s.read(fence.KEY),archiveRaw:await s.read(fence.ARCHIVE_KEY)};}finally{c.close();}},async gone(old){try{return !(await targets()).some(r=>r.webSocketDebuggerUrl===old.webSocketDebuggerUrl||r.url===old.url);}catch(e){if(e.code==="fence_cdp_absent")return true;throw e;}},async sameTarget(old){const current=bootstrap.exactCdpTarget(await targets(),bootstrap.inspectInstalledTarget());if(!current||current.url!==old.url||current.webSocketDebuggerUrl!==old.webSocketDebuggerUrl)return false;const c=await connect(old);try{return JSON.stringify((await storage(c)).frame)===JSON.stringify(old.frame);}finally{c.close();}},pause:pauseTarget};
}
async function hold(){
  verifyPwsh();
  const child=spawn(PS,["-NoLogo","-NoProfile","-NonInteractive","-File",HELPER],{windowsHide:true,stdio:["ignore","pipe","pipe"]});child.stderr.resume();const queue=[],waiters=[];let failure=null;
  function deliver(v){if(waiters.length)waiters.shift().resolve(v);else queue.push(v);}
  const lines=readline.createInterface({input:child.stdout});lines.on("line",line=>{try{check(Buffer.byteLength(line)<512*1024,"fence_native_response_budget");deliver(JSON.parse(line.replace(/^\uFEFF/,"")));}catch(_){failure=Object.assign(Error("fence_native_response_invalid"),{code:"fence_native_response_invalid"});for(const w of waiters.splice(0))w.reject(failure);}});
  child.on("error",()=>{failure=Object.assign(Error("fence_native_helper_failed"),{code:"fence_native_helper_failed"});for(const w of waiters.splice(0))w.reject(failure);});
  const closed=new Promise(resolve=>child.on("close",code=>{failure=Object.assign(Error("fence_native_helper_closed"),{code:"fence_native_helper_closed"});for(const w of waiters.splice(0))w.reject(failure);resolve(code);}));
  const next=()=>{if(queue.length)return Promise.resolve(queue.shift());if(failure)return Promise.reject(failure);return new Promise((resolve,reject)=>waiters.push({resolve,reject}));};
  const ready=await next();check(ready.schema==="ae-agent.cep-reset-physical-fence.v1"&&ready.status==="ready"&&ready.readOnly===true,"fence_native_handles_not_ready");const normalize=r=>fence.identity({...r,birthFileTime:r.birthFileTimeUtc||r.birthFileTime}),identities=[ready.root,...ready.cep].map(normalize);
  return {identities,async waitAll(){const done=await next(),exitCode=await closed;check(exitCode===0&&done.schema===ready.schema&&done.status==="completed"&&done.treeQuiescent===true&&done.readOnly===true&&done.globalAeCepCensusEmpty===true&&done.quiescentSamples>=3&&done.readyAt===ready.observedAt,"fence_native_exit_unknown");const all=[done.root,...done.cep,...done.lineage];check(done.heldHandleCount===all.length,"fence_native_held_count_mismatch");return {identities:all.map(r=>({identity:normalize(r),waitResult:r.waitResult,signaled:r.signaled===true,exitCode:r.exitCode})),nativeProof:done,helperExitCode:exitCode};},async dispose(){lines.close();child.stdout.destroy();child.stderr.destroy();/* No kill: the bounded helper owns/relinquishes its read-only handles. */}};
}
function production(){let recovery;
  const deps={root:ROOT,authority:loadAuthority,census,panel:productionPanel(),hold,safeRead:file=>require("../mcp-server/native-fixture-attempt-ledger").readBytes(file),async launchWatcher(ticket){const child=spawn(process.execPath,[FILE,"__watch-held-exit"],{windowsHide:true,detached:true,stdio:"ignore",env:{...process.env,AE_RESET_FENCE_WATCHER_TICKET:ticket}});await new Promise((resolve,reject)=>{child.once("spawn",resolve);child.once("error",()=>reject(Object.assign(Error("fence_watcher_launch_unknown"),{code:"fence_watcher_launch_unknown"})));});child.unref();for(let n=0;n<60;n++){const r=recovery.readback();if(r.rows["held-ready"]||r.rows.failure)return;await pause(250);}fail("fence_watcher_ready_unknown_readback_only");},barrier:{async send(host,scriptPath,processes){const observed=fence.validateTree(await census());check(observed.host.birthFileTime===host.birthFileTime&&JSON.stringify(observed.processes)===JSON.stringify(processes),"fence_native_presend_host_tree_changed");const child=spawn(fence.AE,["-r",scriptPath],{windowsHide:true,stdio:"ignore",shell:false});await new Promise((resolve,reject)=>{child.once("spawn",resolve);child.once("error",()=>reject(Object.assign(Error("fence_native_submission_unknown"),{code:"fence_native_submission_unknown"})));});child.unref();},async ack(p){while(Date.now()<=p.deadline){if(fs.existsSync(p.ackPath)){try{return JSON.parse(require("../mcp-server/native-fixture-attempt-ledger").readBytes(p.ackPath).toString("utf8").replace(/^\uFEFF/,""));}catch(_){fail("fence_native_ack_invalid");}}await pause(100);}fail("fence_native_barrier_timeout_no_replay");}}};
  recovery=fence.createRecovery(deps);return recovery;
}
async function run(argv,create=production){const command=parse(argv),r=create();if(command==="inspect")return r.inspect();if(command==="prepare-held-exit")return r.prepare();if(command==="recover")return r.recover();if(command==="__watch-held-exit")return r.watch(process.env.AE_RESET_FENCE_WATCHER_TICKET);return r.readback();}
module.exports={parse,run,loadAuthority,census,connect,storage,pauseTarget,productionPanel,hold,production,PAUSED_READ_EXPRESSION};
if(require.main===module)run(process.argv).then(v=>process.stdout.write(JSON.stringify(v)+"\n")).catch(e=>{process.stdout.write(JSON.stringify({ok:false,code:/^fence_[a-z0-9_]+$/.test(e.code||"")?e.code:"fence_recovery_refused",...fence.UNKNOWN})+"\n");process.exitCode=1;});

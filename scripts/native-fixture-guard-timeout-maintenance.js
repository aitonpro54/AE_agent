#!/usr/bin/env node
"use strict";
// One successor of the consumed 2026-10-11 deployment. Inspection evidence is
// not admission authority; the original UNKNOWN records are never rewritten.
const fs=require("node:fs"),path=require("node:path");
const base=require("./native-fixture-prephase-maintenance"),cdp=require("./common-title-assembly-maintenance"),ledger=require("../mcp-server/native-fixture-attempt-ledger"),recovery=require("../mcp-server/native-fixture-prephase-recovery"),native=require("../mcp-server/native-fixture-abandonment");
const parentProof=require("../mcp-server/fixed-guard-timeout-maintenance-proof");
const {hash,same,clone,fail}=ledger,SCHEMA="ae-agent.fixed-guard-timeout-maintenance.v1",TTL=10*60*1000,REFRESH_BUDGET=420000;
const PARENT_ACTOR=Object.freeze({panelInstanceId:"panel-1791693881417-v6yd9qmia8",panelLifecycleEpoch:1,panelGeneration:"1791693943388"});
const KINDS=Object.freeze(["capture","attempt","backup","reload-reserve","reload-result","read-back"]),SELF_SHA256=hash(ledger.readBytes(__filename));
function parse(argv){const a=argv.slice(2),command=a.shift() || "help";if(!["help","capture","apply-once","read-back"].includes(command) || a.length)fail("guard_timeout_fixed_scope_required");return {command};}
function directory(root){return path.join(root,"evidence","native-fixture-guard-timeout-maintenance-20261011");}
function fileFor(root,kind){if(!KINDS.includes(kind))fail("guard_timeout_kind_invalid");return path.join(directory(root),kind+".json");}
function read(root,kind){const file=fileFor(root,kind);if(!fs.existsSync(file))return null;const saved=JSON.parse(ledger.readBytes(file));if(saved.schema!==SCHEMA+".envelope" || saved.sha256!==hash(saved.value) || saved.value?.schema!==SCHEMA+"."+kind)fail("guard_timeout_envelope_invalid");return saved;}
function write(root,kind,value){return ledger.writeOnce(fileFor(root,kind),{schema:SCHEMA+"."+kind,...value},{schema:SCHEMA+".envelope"});}
function inventory(root){const dir=directory(root);if(!fs.existsSync(dir))return [];ledger.safeDirectory(dir);const names=fs.readdirSync(dir).sort(),allowed=KINDS.map(k=>k+".json").concat("backups");if(names.some(n=>!allowed.includes(n)))fail("guard_timeout_extra_files");for(const n of names){if(n==="backups")ledger.safeDirectory(path.join(dir,n));else read(root,n.slice(0,-5));}return names;}
function configPin(c){return {host:c.host,port:c.port,credentialIdentity:hash(c.token)};}
function selfPin(){const current=hash(ledger.readBytes(__filename));if(current!==SELF_SHA256)fail("guard_timeout_loaded_helper_source_changed");return current;}
function context(deps){const ctx=base.context(deps);ctx.auditParent=deps.auditParent || (()=>parentProof.auditParent({repoRoot:ctx.root,evidenceRoot:ctx.logDir}));if(!deps.loadedHashes)ctx.loaded=(selected,expected)=>cdp.loadedOldHashes(selected.target,selected.installed,expected,deps.cdp || cdp.cdp);ctx.sleep=deps.sleep || (ms=>new Promise(resolve=>setTimeout(resolve,ms)));return ctx;}
function assertParentMatch(parent,observed){
  if(!same(observed.trust,parent.observed.trust) || !same(observed.originals,parent.observed.originals) || !same(observed.target,parent.observed.target) || observed.installed.indexPath!==parent.observed.installed.indexPath || !same(observed.desiredAssetHashes,parent.desiredAssetHashes))fail("guard_timeout_parent_scope_drift");
}
function assertDelta(parent){const keys=base.ASSETS;if(!same(Object.keys(parent.predecessorAssetHashes).sort(),keys.slice().sort()) || !same(Object.keys(parent.desiredAssetHashes).sort(),keys.slice().sort()) || parent.predecessorAssetHashes["panel.js"]===parent.desiredAssetHashes["panel.js"] || keys.some(k=>k!=="panel.js" && parent.predecessorAssetHashes[k]!==parent.desiredAssetHashes[k]))fail("guard_timeout_only_panel_js_delta_required");}
function checkTransport(value){if(value?.unresolvedCount!==0 || !Array.isArray(value.requestIds) || value.requestIds.length)fail("guard_timeout_transport_guards_remain");}
async function observe(ctx,{installedHashes,loadedHashes,released=false,freshCertificate=false}={}){
  const parent=ctx.auditParent();assertDelta(parent);
  const status=await ctx.request("/dev/status"),selected=await ctx.service.maintenanceTarget(),proposal=await ctx.request("/agents/plan/current");
  // running:true is the poll loop. Actual controller/editor work is still forbidden.
  base.assertIdle(status,selected.state,proposal,true);base.assertGuards(selected.state,released);
  const observed={actor:native.actor(selected.state),connection:{connected:selected.state.connected,running:selected.state.running},target:base.targetPin(selected),installed:clone(selected.installed),runtime:base.runtimePin(status,ctx.currentSource()),desiredAssetHashes:base.assetHashes(ctx.source),desiredLoadedHashes:base.normalizedHashes(ctx.source),loadedHashes:await ctx.loaded(selected,loadedHashes),implementationSha256:selfPin(),selected};
  if(observed.connection.connected!==true || observed.connection.running!==true)fail("guard_timeout_connected_poll_idle_required");
  if(!same(observed.installed.hashes,installedHashes) || !same(base.assetHashes(path.dirname(selected.installed.indexPath)),installedHashes) || !same(observed.loadedHashes,loadedHashes))fail("guard_timeout_assets_drift");
  const trusted=await (ctx.deps.trustedDispositions || base.trustedDispositions)(ctx,observed);observed.trust=base.trustPin(trusted);observed.originals=await (ctx.deps.originals || base.originals)(ctx,observed,trusted);assertParentMatch(parent,observed);
  const inspection=await ctx.request("/ame/native-fixture-prephase-recovery/maintenance-quiescence");base.assertMaintenanceQuiescence(inspection,observed);
  if(freshCertificate)base.assertFreshCertificate((await ctx.request("/ame/native-fixture-prephase-recovery/maintenance-read-back")).certificate,trusted,observed);
  checkTransport(await ctx.service.maintenanceTransportState());
  const after=await ctx.request("/dev/status"),again=await ctx.service.maintenanceTarget(),current=await ctx.request("/agents/plan/current");base.assertIdle(after,again.state,current,true);base.assertGuards(again.state,released);
  if(!same(observed.actor,native.actor(again.state)) || !same(observed.connection,{connected:again.state.connected,running:again.state.running}) || !same(observed.target,base.targetPin(again)) || !same(observed.installed,again.installed) || !same(observed.runtime,base.runtimePin(after,ctx.currentSource())) || !same(observed.desiredAssetHashes,base.assetHashes(ctx.source)) || !same(parent.parentPins,ctx.auditParent().parentPins))fail("guard_timeout_observation_bracket_drift");
  return {...observed,selected:undefined,parentPins:parent.parentPins};
}
function compare(observed,captured,{copied=false,reloaded=false}={}){base.compare(observed,captured,{installedChanged:copied,reloaded});if(reloaded && observed.actor.panelInstanceId===captured.actor.panelInstanceId || observed.implementationSha256!==captured.implementationSha256 || !same(observed.connection,captured.connection) || !same(observed.parentPins,captured.parentPins) || !same(observed.desiredLoadedHashes,captured.desiredLoadedHashes))fail("guard_timeout_successor_pins_drift");}
function captureValid(ctx,saved,fresh=true){const c=saved?.value,t=Date.parse(c?.createdAt);if(!c || !Number.isFinite(t) || Date.parse(c.expiresAt)!==t+TTL || fresh && (ctx.now()<t || ctx.now()>=t+TTL) || c.replayAllowed!==false || c.predecessorGuardReleaseProven!==false || c.precopyCertificateStatus!=="audited_only_intermediate_installed_frame" || c.observed?.actor?.panelInstanceId!==PARENT_ACTOR.panelInstanceId || !same(c.configuration,configPin(ctx.c)) || c.observed?.implementationSha256!==selfPin() || !same(c.observed.parentPins,ctx.auditParent().parentPins))fail("guard_timeout_capture_invalid_or_stale");return c;}
function ensure(dir){if(!fs.existsSync(dir)){ensure(path.dirname(dir));fs.mkdirSync(dir);}ledger.safeDirectory(dir);}
function backupBytes(ctx,bytes){const file=path.join(directory(ctx.logDir),"backups","panel.js");ensure(path.dirname(file));const fd=fs.openSync(file,"wx",0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(hash(ledger.readBytes(file))!==hash(bytes))fail("guard_timeout_backup_changed");}
function validateBackup(ctx,captured,saved,attempt){const dir=path.join(directory(ctx.logDir),"backups");if(!saved || saved.value.captureSha256!==captured.sha256 || saved.value.attemptSha256!==attempt.sha256 || saved.value.asset!=="panel.js" || saved.value.replayAllowed!==false || saved.value.sha256!==captured.value.observed.installed.hashes["panel.js"])fail("guard_timeout_backup_chain_invalid");ledger.safeDirectory(dir);if(!same(fs.readdirSync(dir),["panel.js"]) || hash(ledger.readBytes(path.join(dir,"panel.js")))!==saved.value.sha256)fail("guard_timeout_backup_changed");}
function copyPanel(ctx,captured){const old=captured.value.observed,file=path.join(path.dirname(old.installed.indexPath),"panel.js"),bytes=ledger.readBytes(path.join(ctx.source,"panel.js"));if(hash(bytes)!==old.desiredAssetHashes["panel.js"] || hash(ledger.readBytes(file))!==old.installed.hashes["panel.js"])fail("guard_timeout_copy_baseline_drift");const before=fs.lstatSync(file),fd=fs.openSync(file,"r+");try{const opened=fs.fstatSync(fd);if(opened.dev!==before.dev || opened.ino!==before.ino || opened.nlink!==1 || !opened.isFile())fail("guard_timeout_copy_file_changed");fs.writeFileSync(fd,bytes);fs.ftruncateSync(fd,bytes.length);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function idleForBootstrap(status,state,proposal){if(status.pendingCommands!==0 || !Array.isArray(status.inflightCommands) || status.inflightCommands.length || status.activeEditSession!==null || status.projectLifecycle?.blocked || status.projectLifecycle?.pending || status.panelBootstrap?.busy || proposal.current!==null || state.activeAction!==null || state.recoveryTransport || state.actionStorage!=="ready" || state.chat?.inFlight===true || state.plan?.pins || /^(running|executing|submitted)$/.test(state.plan?.state || ""))fail("guard_timeout_bootstrap_controller_changed");const guards=state.unresolvedActions;if(!Array.isArray(guards) || guards.some((g,i)=>!base.EXACT.some(s=>g.requestId===s.requestId && g.runId===s.runId && g.action==="plan.run" && g.effect==="protected_plan_run") || guards.findIndex(r=>r.requestId===g.requestId)!==i))fail("guard_timeout_bootstrap_extra_guard");}
function pendingBootstrap(state){return state.trustedGuardRefresh?.pending===true || ["humanSettlementLookupPending","ameFixtureDispositionLookupPending","nativeFixtureAbandonmentLookupPending","nativeFixturePrephaseRecoveryLookupPending"].some(k=>state[k]===true);}
async function waitBootstrap(ctx,captured){
  const old=captured.value.observed,deadline=ctx.now()+REFRESH_BUDGET;let instance,stable;
  do {
    const parent=ctx.auditParent(),selected=await ctx.service.maintenanceTarget(),status=await ctx.request("/dev/status"),proposal=await ctx.request("/agents/plan/current"),state=selected.state;idleForBootstrap(status,state,proposal);
    if(typeof state.panelInstanceId!=="string" || !state.panelInstanceId || state.panelInstanceId===old.actor.panelInstanceId || instance && instance!==state.panelInstanceId || !same(base.targetPin(selected),old.target) || selected.installed.indexPath!==old.installed.indexPath || !same(selected.installed.hashes,old.desiredAssetHashes) || !same(await ctx.loaded(selected,old.desiredLoadedHashes),old.desiredLoadedHashes) || !same(base.runtimePin(status,ctx.currentSource()),old.runtime) || !same(parent.parentPins,old.parentPins))fail("guard_timeout_post_reload_pins_unproven");
    instance=state.panelInstanceId;
    if(!pendingBootstrap(state) && same({connected:state.connected,running:state.running},old.connection)){
      const current=native.actor(state);if(stable && same(stable,current))return current;stable=current;
    }else stable=undefined;
    if(ctx.now()>=deadline)fail("guard_timeout_bootstrap_pending_readback_only");
    await ctx.sleep(Math.min(250,deadline-ctx.now()));
  }while(ctx.now()<=deadline);
  fail("guard_timeout_bootstrap_pending_readback_only");
}
async function run(argv,deps={}){
  const args=parse(argv);if(args.command==="help")return {ok:true,commands:["capture","apply-once","read-back"],scope:"fixed successor timer repair; panel.js only; prior deployment remains consumed; no restart/native dispatch/replay"};
  const ctx=context(deps),names=inventory(ctx.logDir);
  if(args.command==="capture"){
    if(names.length)fail("guard_timeout_capture_exists_or_partial");const lock=ctx.lock();
    try {
      if(inventory(ctx.logDir).length)fail("guard_timeout_capture_exists_or_partial");const parent=ctx.auditParent(),opts={installedHashes:parent.predecessorAssetHashes,loadedHashes:parent.predecessorLoadedHashes};assertDelta(parent);
      const observed=await observe(ctx,opts),again=await observe(ctx,opts);if(!same(observed,again) || observed.actor.panelInstanceId!==PARENT_ACTOR.panelInstanceId)fail("guard_timeout_capture_frame_changed");
      const time=ctx.now(),saved=write(ctx.logDir,"capture",{createdAt:new Date(time).toISOString(),expiresAt:new Date(time+TTL).toISOString(),configuration:configPin(ctx.c),observed,predecessorGuardReleaseProven:false,precopyCertificateStatus:"audited_only_intermediate_installed_frame",replayAllowed:false});
      return {ok:true,status:"guard_timeout_capture_saved",captureSha256:saved.sha256,certificateSha256:observed.trust.certificate.sha256,predecessorGuardReleaseProven:false,guardReleased:false,...recovery.OUTCOME};
    }finally{lock.release();}
  }
  const captured=read(ctx.logDir,"capture"),c=captureValid(ctx,captured,args.command!=="read-back"),old=c.observed;
  if(args.command==="apply-once"){
    if(!same(names,["capture.json"]))fail("guard_timeout_apply_consumed_or_partial");const lock=ctx.lock();
    try {
      if(!same(inventory(ctx.logDir),["capture.json"]))fail("guard_timeout_apply_consumed_or_partial");captureValid(ctx,captured);
      compare(await observe(ctx,{installedHashes:old.installed.hashes,loadedHashes:old.loadedHashes}),old);
      const attempt=write(ctx.logDir,"attempt",{createdAt:new Date(ctx.now()).toISOString(),captureSha256:captured.sha256,parentPins:old.parentPins,certificateSha256:old.trust.certificate.sha256,replayAllowed:false});
      const bytes=ledger.readBytes(path.join(path.dirname(old.installed.indexPath),"panel.js"));if(hash(bytes)!==old.installed.hashes["panel.js"])fail("guard_timeout_backup_baseline_drift");backupBytes(ctx,bytes);
      const backup=write(ctx.logDir,"backup",{createdAt:new Date(ctx.now()).toISOString(),captureSha256:captured.sha256,attemptSha256:attempt.sha256,asset:"panel.js",sha256:hash(bytes),replayAllowed:false});validateBackup(ctx,captured,backup,attempt);
      compare(await observe(ctx,{installedHashes:old.installed.hashes,loadedHashes:old.loadedHashes}),old);captureValid(ctx,captured);copyPanel(ctx,captured);
      const afterOptions={installedHashes:old.desiredAssetHashes,loadedHashes:old.loadedHashes};compare(await observe(ctx,afterOptions),old,{copied:true});
      validateBackup(ctx,captured,backup,attempt);captureValid(ctx,captured);compare(await observe(ctx,afterOptions),old,{copied:true});captureValid(ctx,captured);
      const reserve=write(ctx.logDir,"reload-reserve",{createdAt:new Date(ctx.now()).toISOString(),captureSha256:captured.sha256,attemptSha256:attempt.sha256,backupSha256:backup.sha256,parentPins:old.parentPins,certificateSha256:old.trust.certificate.sha256,actor:old.actor,target:old.target,runtime:old.runtime,status:"reserved_before_sole_send",replayAllowed:false});
      let result="reload_outcome_unknown",connection;
      try{connection=(deps.cdp || cdp.cdp)(old.target.webSocketDebuggerUrl);await connection.send("Page.reload",{ignoreCache:true});result="reload_submitted";}catch(_){/* Unknown is consumed; read-back is the only recovery. */}finally{if(connection)connection.close();}
      write(ctx.logDir,"reload-result",{createdAt:new Date(ctx.now()).toISOString(),reloadReserveSha256:reserve.sha256,status:result,replayAllowed:false});
      return {ok:result==="reload_submitted",status:result,guardReleased:false,predecessorGuardReleaseProven:false,...recovery.OUTCOME,next:"read-back only; never repeat either deployment"};
    }finally{lock.release();}
  }
  const attempt=read(ctx.logDir,"attempt"),backup=read(ctx.logDir,"backup"),reserve=read(ctx.logDir,"reload-reserve"),result=read(ctx.logDir,"reload-result");
  if(!attempt || !reserve || attempt.value.captureSha256!==captured.sha256 || attempt.value.certificateSha256!==old.trust.certificate.sha256 || attempt.value.replayAllowed!==false || reserve.value.captureSha256!==captured.sha256 || reserve.value.attemptSha256!==attempt.sha256 || reserve.value.backupSha256!==backup?.sha256 || !same(attempt.value.parentPins,old.parentPins) || !same(reserve.value.parentPins,old.parentPins) || reserve.value.certificateSha256!==old.trust.certificate.sha256 || reserve.value.status!=="reserved_before_sole_send" || reserve.value.replayAllowed!==false || ["actor","target","runtime"].some(k=>!same(reserve.value[k],old[k])) || result && (result.value.reloadReserveSha256!==reserve.sha256 || result.value.replayAllowed!==false || !["reload_submitted","reload_outcome_unknown"].includes(result.value.status)))fail("guard_timeout_partial_chain_readback_only");
  validateBackup(ctx,captured,backup,attempt);
  const newActor=await waitBootstrap(ctx,captured);
  // The dedicated refresh owns its own controller lock and may be repeated
  // after a completed/known bootstrap failure. No reload is repeated here.
  const refreshed=await ctx.service.refreshTrustedGuards({},REFRESH_BUDGET);if(refreshed?.ok!==true)fail("guard_timeout_fresh_refresh_failed_readback_only");
  const lock=ctx.lock();
  try {
    const options={installedHashes:old.desiredAssetHashes,loadedHashes:old.desiredLoadedHashes,released:true,freshCertificate:true},observed=await observe(ctx,options);compare(observed,old,{copied:true,reloaded:true});if(!same(observed.actor,newActor))fail("guard_timeout_refresh_actor_changed");
    const selected=await ctx.service.maintenanceTarget();base.releasedDispositions(selected.state,old.trust);if(!same(native.actor(selected.state),newActor))fail("guard_timeout_readback_actor_changed");
    const again=await observe(ctx,options);if(!same(observed,again))fail("guard_timeout_readback_bracket_drift");validateBackup(ctx,captured,backup,attempt);
    const previous=read(ctx.logDir,"read-back"),value={createdAt:new Date(ctx.now()).toISOString(),captureSha256:captured.sha256,reloadReserveSha256:reserve.sha256,parentPins:old.parentPins,certificateSha256:old.trust.certificate.sha256,currentActor:newActor,runtime:observed.runtime,installedHashes:observed.installed.hashes,loadedScriptHashes:observed.loadedHashes,originalReceiptsUnchanged:true,predecessorGuardReleaseProven:false,unresolvedPanel:0,unresolvedTransport:0,...recovery.OUTCOME};
    if(previous){if(previous.value.captureSha256!==captured.sha256 || previous.value.reloadReserveSha256!==reserve.sha256 || !same(previous.value.parentPins,old.parentPins) || !same(previous.value.currentActor,newActor))fail("guard_timeout_readback_identity_changed");}else write(ctx.logDir,"read-back",value);
    return {ok:true,status:"guards_released",certificateSha256:old.trust.certificate.sha256,currentActor:newActor,originalReceiptsUnchanged:true,predecessorGuardReleaseProven:false,unresolvedPanel:0,unresolvedTransport:0,guardReleased:true,...recovery.OUTCOME};
  }finally{lock.release();}
}
if(require.main===module)run(process.argv).then(value=>process.stdout.write(JSON.stringify(value)+"\n")).catch(error=>{process.stdout.write(JSON.stringify({ok:false,code:error.code || "guard_timeout_maintenance_failed",guardReleased:false,replayAllowed:false})+"\n");process.exitCode=1;});
module.exports={run,parse,SCHEMA,TTL,REFRESH_BUDGET,PARENT_ACTOR,directory,fileFor,read,observe,compare};

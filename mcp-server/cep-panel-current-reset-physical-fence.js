"use strict";

// Standalone operator recovery; not a daemon admission component. A legacy map
// has no owner identity. Only a new, complete held-context exit cycle fences it.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const old=require("./cep-panel-reset-physical-fence"),ledger=require("./native-fixture-attempt-ledger");
const SCHEMA="ae-agent.current-reset-physical-fence.v1",KEY=old.KEY,ARCHIVE_KEY="codexAePhysicalEvalScript.currentResetArchive.v1",TTL=1800000;
const UNKNOWN=Object.freeze({...old.UNKNOWN,capturedContextExitProven:false,resetPreflightStillRequired:true});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),hash=old.hash;
function fail(code){throw Object.assign(Error(code),{code});}
function check(value,code){if(!value)fail(code);}
function actor(state){return {panelInstanceId:state.panelInstanceId,panelLifecycleEpoch:state.panelLifecycleEpoch,panelGeneration:state.panelGeneration};}
function idle(state){
  check(state&&state.activeAction===null&&state.recoveryTransport===null&&state.actionStorage==="ready"&&state.nativeBusy===false&&state.running===false&&state.pollInFlight===false&&state.physicalInflight===1,"current_fence_panel_work_present");
  check(!["confirmed","executing"].includes(state.plan?.state)&&!state.trustedGuardRefresh?.pending,"current_fence_plan_or_guard_busy");
  for(const key of ["humanSettlementLookupPending","ameFixtureDispositionLookupPending","nativeFixtureAbandonmentLookupPending","nativeFixturePrephaseLookupPending","nativeFixtureAdmissionRefusalLookupPending"])check(state[key]!==true,"current_fence_guard_lookup_busy");
  const entries=state.unresolvedActions;check(Array.isArray(entries)&&entries.length<=120,"current_fence_action_snapshot_invalid");
  const values=entries.map(e=>{check(ledger.UUID.test(e.requestId||"")&&ledger.SHA.test(e.entrySha256||""),"current_fence_action_snapshot_invalid");return {requestId:e.requestId,entrySha256:e.entrySha256};}).sort((a,b)=>a.requestId.localeCompare(b.requestId));
  check(new Set(values.map(e=>e.requestId)).size===values.length,"current_fence_action_snapshot_invalid");return values;
}
function createRecovery(deps){
  const now=deps.now||Date.now,initial=deps.authority();check(ledger.UUID.test(initial.operationId||"")&&ledger.UUID.test(initial.generation||""),"current_fence_reset_binding_invalid");
  const dir=path.join(deps.root,".codex-runtime","current-reset-physical-fences",initial.operationId),file=name=>path.join(dir,name+".json");
  const binding=a=>({operationId:a.operationId,generation:a.generation,anchorSha256:a.anchorSha256,policySha256:a.policySha256,intentSha256:a.intentSha256,currentSha256:a.currentSha256,registrationSha256:a.registrationSha256,configSha256:a.configSha256,sourcePins:a.sourcePins});
  const expected=binding(initial);check(typeof initial.key==="string"&&initial.key.length>0,"current_fence_private_key_required");
  function authority(pending=true){const a=deps.authority();check(same(binding(a),expected)&&a.key===initial.key,"current_fence_authority_changed");check(pending?a.status==="reset_pending_preflight":["reset_pending_preflight","reset_active"].includes(a.status),"current_fence_pending_reset_required");return a;}
  const signature=value=>crypto.createHmac("sha256",initial.key).update(JSON.stringify(value)).digest("hex");
  function read(name){if(!fs.existsSync(file(name)))return null;const bytes=ledger.readBytes(file(name)),row=JSON.parse(bytes);check(row.schema===SCHEMA+".envelope"&&row.sha256===hash(row.value)&&row.authentication===signature(row.value)&&same(row.value.binding,expected),"current_fence_record_invalid");return row;}
  function write(name,value){authority();ledger.ensure(dir);const data={schema:SCHEMA+"."+name,binding:expected,createdAt:new Date(now()).toISOString(),...value,...UNKNOWN},row={schema:SCHEMA+".envelope",sha256:hash(data),value:data,authentication:signature(data)},fd=fs.openSync(file(name),"wx",0o600);try{fs.writeFileSync(fd,JSON.stringify(row));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return row;}
  function grant(){authority();const row=read("authority");check(row&&row.value.capability==="retire_exact_legacy_map_after_held_context_exit"&&Number.isSafeInteger(row.value.deadline)&&Date.parse(row.value.createdAt)<=now()&&row.value.deadline>now()&&row.value.deadline-now()<=TTL,"current_fence_grant_required_or_expired");return row;}
  async function locked(name,action){ledger.ensure(dir);let fd;try{fd=fs.openSync(path.join(dir,name+".lock"),"wx",0o600);return await action();}catch(error){if(error.code==="EEXIST")fail("current_fence_controller_busy_or_unknown");throw error;}finally{if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(path.join(dir,name+".lock"));}}}
  async function snapshot(){authority();const rows=await deps.census(),tree=old.validateTree(rows),panel=await deps.panel.snapshot();old.legacy(panel.raw,tree.host);const unresolved=idle(panel.state);return {host:tree.host,processes:tree.processes,panel,unresolved};}
  function pins(s){return {host:s.host,processes:s.processes,actor:actor(s.panel.state),target:s.panel.target,installed:s.panel.installed,raw:s.panel.raw,archiveRaw:s.panel.archiveRaw,unresolved:s.unresolved};}
  function bound(s,value){check(same(pins(s),value),"current_fence_snapshot_changed");}
  function summary(){authority(false);const rows={};for(const name of ["authority","prepare","watcher-consumed","held-ready","held-exit","recover-once","barrier-pending","barrier-completed","archive","retirement-intent","retired","failure"]){const row=read(name);if(row)rows[name]={sha256:row.sha256,value:row.value};}return {ok:true,operationId:initial.operationId,generation:initial.generation,status:rows.retired?"legacy_latch_retired_reset_preflight_required":rows.failure?"unknown_readback_only":rows["held-exit"]?"captured_contexts_exited":rows["held-ready"]?"held_handles_ready":rows.prepare?"prepare_consumed":rows.authority?"authorized":"not_authorized",...UNKNOWN,rows};}
  async function inspect(){const s=await snapshot();return {ok:true,operationId:initial.operationId,generation:initial.generation,host:s.host,actor:actor(s.panel.state),target:s.panel.target,latchSha256:hash(s.panel.raw),latchEntries:Object.keys(JSON.parse(s.panel.raw)).length,...UNKNOWN};}
  async function authorize(reference){check(typeof reference==="string"&&reference.trim().length>0&&reference.length<=512,"current_fence_operator_reference_required");return locked("operator",async()=>{authority();if(read("authority"))return summary();const before=await snapshot(),after=await snapshot();bound(after,pins(before));write("authority",{capability:"retire_exact_legacy_map_after_held_context_exit",authorization:{source:"explicit_user_chat",reference},deadline:now()+TTL,old:pins(before)});return summary();});}
  async function prepare(){return locked("operator",async()=>{const g=grant();if(read("prepare"))return summary();const s=await snapshot();bound(s,g.value.old);const ticket=crypto.randomUUID();write("prepare",{authoritySha256:g.sha256,old:g.value.old,ticketSha256:hash(ticket)});await deps.launchWatcher(ticket);return summary();});}
  async function watch(ticket){return locked("watcher",async()=>{const g=grant(),p=read("prepare");check(p&&p.value.authoritySha256===g.sha256&&p.value.ticketSha256===hash(ticket)&&!read("watcher-consumed"),"current_fence_watcher_once_required");write("watcher-consumed",{prepareSha256:p.sha256});let held;try{
    const before=await snapshot();bound(before,p.value.old);held=await deps.hold();check(held.identities.length===p.value.old.processes.length&&held.identities.every((v,i)=>old.sameCimProcess(v,p.value.old.processes[i])),"current_fence_held_identity_changed");
    const after=await snapshot();bound(after,p.value.old);write("held-ready",{prepareSha256:p.sha256,identities:held.identities,oldActor:p.value.old.actor,oldTarget:p.value.old.target});
    const result=await held.waitAll();grant();const exits=result.identities;
    check(Array.isArray(exits)&&exits.length>=held.identities.length&&held.identities.every(expected=>exits.some(r=>same(r.identity,expected)))&&new Set(exits.map(r=>r.identity.pid+":"+r.identity.birthFileTime)).size===exits.length,"current_fence_exit_identity_invalid");
    check(exits.every(r=>same(old.identity(r.identity),r.identity)&&r.waitResult==="WAIT_OBJECT_0"&&r.signaled===true&&Number.isInteger(r.exitCode))&&result.helperExitCode===0&&result.nativeProof?.treeQuiescent===true&&result.nativeProof.globalAeCepCensusEmpty===true&&result.nativeProof.quiescentSamples>=3,"current_fence_held_exit_unproven");
    check((await deps.census()).length===0&&await deps.panel.gone(p.value.old.target),"current_fence_old_context_still_present");
    write("held-exit",{prepareSha256:p.sha256,heldReadySha256:read("held-ready").sha256,oldActor:p.value.old.actor,oldTarget:p.value.old.target,exits,nativeProof:result.nativeProof,helperExitCode:result.helperExitCode,capturedContextExitObserved:true,oldExactPageGone:true});return summary();
  }catch(error){if(!read("failure"))write("failure",{stage:"held-exit",code:/^[a-z0-9_]+$/.test(error.code||"")?error.code:"current_fence_exit_unknown"});throw error;}finally{if(held)await held.dispose();}});}
  async function recover(){return locked("operator",async()=>{const g=grant(),p=read("prepare"),exit=read("held-exit");check(p&&exit&&exit.value.prepareSha256===p.sha256&&!read("failure"),"current_fence_full_held_exit_required");if(read("recover-once"))return summary();
    const s=await snapshot(),oldPins=p.value.old,closedAt=Date.parse(exit.value.createdAt);
    check(s.panel.raw===oldPins.raw&&s.panel.archiveRaw===oldPins.archiveRaw&&same(s.unresolved,oldPins.unresolved)&&same(s.panel.installed,oldPins.installed),"current_fence_legacy_map_or_install_changed");
    check(Date.parse(s.host.birthUtc)>closedAt&&s.processes.every(v=>Date.parse(v.birthUtc)>closedAt)&&s.panel.target.webSocketDebuggerUrl!==oldPins.target.webSocketDebuggerUrl&&s.panel.target.frame.loaderId!==oldPins.target.frame.loaderId&&actor(s.panel.state).panelInstanceId!==oldPins.actor.panelInstanceId,"current_fence_new_context_required");
    check(!s.processes.some(v=>exit.value.exits.some(e=>same(v,e.identity)))&&await deps.panel.gone(oldPins.target),"current_fence_old_owner_returned");
    const fresh=pins(s);write("recover-once",{authoritySha256:g.sha256,heldExitSha256:exit.sha256,newContext:fresh});
    let heldPause,own=false;
    try{
      const nonce=crypto.randomUUID(),deadline=Math.min(now()+30000,g.value.deadline),ackPath=path.join(dir,"native-barrier.ack.json"),scriptPath=path.join(dir,"native-barrier.jsx"),script=old.barrierJsx({nonce,deadline,ackPath});check(!fs.existsSync(ackPath)&&!fs.existsSync(scriptPath),"current_fence_native_files_exist");
      const fd=fs.openSync(scriptPath,"wx",0o600);try{fs.writeFileSync(fd,script);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      const pending=write("barrier-pending",{heldExitSha256:exit.sha256,newContext:fresh,nonce,deadline,ackPath,scriptPath,scriptSha256:hash(script)});
      const presend=await snapshot();bound(presend,fresh);grant();check(now()<deadline&&hash(ledger.readBytes(scriptPath))===pending.value.scriptSha256,"current_fence_barrier_expired_or_changed");
      await deps.barrier.send(s.host,scriptPath,s.processes);const project=await deps.barrier.ack(pending.value);old.validateProject(project,nonce);const after=await snapshot();bound(after,fresh);
      const completed=write("barrier-completed",{pendingSha256:pending.sha256,heldExitSha256:exit.sha256,newContext:fresh,project,hostBinding:"sole_identity_before_after_conditional_not_pid_targeting"});
      const valid=()=>{grant();check(now()<deadline&&now()-Date.parse(completed.value.createdAt)>=0&&now()-Date.parse(completed.value.createdAt)<30000,"current_fence_barrier_receipt_stale");};valid();
      heldPause=await deps.panel.pause(s.panel.target);check(heldPause.owned===true&&heldPause.pausedEvent===true,"current_fence_own_pause_required");own=true;
      const tree=old.validateTree(await deps.census());check(same(tree.host,s.host)&&same(tree.processes,s.processes),"current_fence_tree_changed_at_pause");const state=await heldPause.snapshot();check(same(actor(state),fresh.actor)&&same(idle(state),fresh.unresolved),"current_fence_actor_changed_at_pause");
      check(await deps.panel.sameTarget(s.panel.target)&&await deps.panel.gone(oldPins.target),"current_fence_page_changed_at_pause");
      check(await heldPause.read(KEY)===oldPins.raw&&await heldPause.read(ARCHIVE_KEY)===oldPins.archiveRaw,"current_fence_paused_map_cas_failed");valid();
      const archive=write("archive",{authoritySha256:g.sha256,prepareSha256:p.sha256,heldExitSha256:exit.sha256,barrierSha256:completed.sha256,old:oldPins,newContext:fresh,capturedContextExitObserved:true});
      write("retirement-intent",{archiveSha256:archive.sha256,newContext:fresh,method:"full_held_context_exit_then_own_paused_exact_storage_cas"});valid();
      await heldPause.write(ARCHIVE_KEY,JSON.stringify(archive));check(await heldPause.read(ARCHIVE_KEY)===JSON.stringify(archive),"current_fence_archive_readback_unknown");valid();
      check(await deps.panel.sameTarget(s.panel.target)&&same(old.validateTree(await deps.census()).processes,s.processes)&&await heldPause.read(KEY)===oldPins.raw,"current_fence_presend_map_or_context_changed");valid();
      await heldPause.write(KEY,"{}");check(await heldPause.read(KEY)==="{}","current_fence_map_readback_unknown");valid();
      write("retired",{archiveSha256:archive.sha256,heldExitSha256:exit.sha256,barrierSha256:completed.sha256,capturedContextExitObserved:true,oldPhysicalRawSha256:hash(oldPins.raw)});return summary();
    }catch(error){if(!read("failure"))write("failure",{stage:"recovery",code:/^[a-z0-9_]+$/.test(error.code||"")?error.code:"current_fence_recovery_unknown"});throw error;}
    finally{if(own)await heldPause.resume();else if(heldPause?.close)await heldPause.close();}
  });}
  return Object.freeze({inspect,authorize,prepare,watch,recover,readback:summary,directory:dir});
}
module.exports={SCHEMA,KEY,ARCHIVE_KEY,TTL,UNKNOWN,actor,idle,createRecovery};

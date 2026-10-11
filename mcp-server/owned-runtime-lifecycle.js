"use strict";

// Dependencies are private trusted authority. They are never supplied by a tool
// caller. Durable files and hashes bind evidence; they cannot mint ownership.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ledger=require("./native-fixture-attempt-ledger"),{validateIdentity}=require("./owned-runtime-win32");
const SCHEMA="ae-agent.owned-runtime-shutdown.v1",PROFILE_SCHEMA="ae-agent.owned-runtime-profile.v1";
const OUTCOME=Object.freeze({historicalOutcome:"unknown",nativeExecutionProven:false,replayAllowed:false,admissionReleased:false,originalLaunchRetirementProven:false});
function fail(code){throw Object.assign(Error(code),{code});}
function exact(v,keys,code="owned_contract_invalid"){if(!v || typeof v!=="object" || Array.isArray(v) || Object.keys(v).sort().join(",")!==keys.slice().sort().join(","))fail(code);}
function canonical(v){if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";if(v && typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";return JSON.stringify(v);}
const hash=v=>crypto.createHash("sha256").update(Buffer.isBuffer(v)?v:canonical(v)).digest("hex");
const copy=v=>JSON.parse(JSON.stringify(v));
function freeze(v){if(v && typeof v==="object"){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function selector(v){exact(v,["command","profile","runId","stageId"],"owned_selector_invalid");if(!["inspect","close-once","read-back"].includes(v.command) || !/^[a-z][a-z0-9-]{0,63}$/.test(v.profile || "") || !ledger.UUID.test(v.runId || "") || !ledger.TOKEN.test(v.stageId || ""))fail("owned_selector_invalid");return freeze(copy(v));}
function binding(p){const c=p.context;return {runId:c.runId,requestId:c.requestId,actionId:c.actionId,instanceId:c.instanceId,proposalRevision:c.proposalRevision,payloadHash:c.payloadHash};}
function validateProfile(p,s) {
  exact(p,["schema","profileId","generation","issuedAt","expiresAt","context","canonicalBindingSha256","canonicalRecord","daemon","protected","protectedInventorySha256","stages","policy"]);
  if(p.schema!==PROFILE_SCHEMA || p.profileId!==s.profile || !/^[a-zA-Z0-9_-]{1,128}$/.test(p.generation || "") || !Number.isFinite(Date.parse(p.issuedAt)) || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt)<=Date.parse(p.issuedAt))fail("owned_profile_invalid");
  exact(p.context,["runId","requestId","actionId","instanceId","proposalRevision","payloadHash"]);
  if(p.context.runId!==s.runId || !ledger.UUID.test(p.context.requestId || "") || !ledger.UUID.test(p.context.instanceId || "") || !/^act_[a-f0-9]{32}$/.test(p.context.actionId || "") || !Number.isInteger(p.context.proposalRevision) || p.context.proposalRevision<1 || !/^sha256:[a-f0-9]{64}$/.test(p.context.payloadHash || "") || hash(binding(p))!==p.canonicalBindingSha256)fail("owned_canonical_binding_invalid");
  exact(p.canonicalRecord,["path","rawSha256","envelopeSha256"]);
  if(typeof p.canonicalRecord.path!=="string" || !path.isAbsolute(p.canonicalRecord.path) || !ledger.SHA.test(p.canonicalRecord.rawSha256 || "") || !ledger.SHA.test(p.canonicalRecord.envelopeSha256 || ""))fail("owned_canonical_record_pin_invalid");
  exact(p.daemon,["identity","startedAt","loadedRuntimeSha256","port","credentialSha256"]);validateIdentity(p.daemon.identity);
  if(!Number.isFinite(Date.parse(p.daemon.startedAt)) || !ledger.SHA.test(p.daemon.loadedRuntimeSha256 || "") || !ledger.SHA.test(p.daemon.credentialSha256 || "") || !Number.isInteger(p.daemon.port) || p.daemon.port<1 || p.daemon.port>65535)fail("owned_daemon_pin_invalid");
  if(!Array.isArray(p.protected) || !p.protected.length || p.protected.length>64 || hash(p.protected)!==p.protectedInventorySha256)fail("owned_protected_inventory_invalid");
  p.protected.forEach(validateIdentity);
  if(!p.protected.some(x=>canonical(x)===canonical(p.daemon.identity)) || new Set(p.protected.map(x=>x.pid)).size!==p.protected.length)fail("owned_protected_inventory_invalid");
  if(!Array.isArray(p.stages) || p.stages.length!==2 || new Set(p.stages.map(x=>x.stageId)).size!==2 || p.stages.map(x=>x.role).sort().join(",")!=="capture,stage")fail("owned_stage_inventory_invalid");
  for(const w of p.stages){exact(w,["stageId","role","identity","descriptor","pins"]);validateIdentity(w.identity);
    if(!ledger.TOKEN.test(w.stageId || "") || w.descriptor?.stageId!==w.stageId || w.descriptor?.role!==w.role || w.descriptor.executablePath?.toLowerCase()!==w.identity.imagePath.toLowerCase() || w.descriptor.executableSha256!==w.identity.executableSha256 || p.protected.some(x=>x.pid===w.identity.pid))fail("owned_stage_identity_invalid");
    exact(w.pins,["reservation","launch","manifest","unknown"]);
    for(const key of Object.keys(w.pins)){exact(w.pins[key],["path","rawSha256","valueSha256"]);if(typeof w.pins[key].path!=="string" || !path.isAbsolute(w.pins[key].path) || !ledger.SHA.test(w.pins[key].rawSha256 || "") || key!=="manifest" && !ledger.SHA.test(w.pins[key].valueSha256 || "") || key==="manifest" && w.pins[key].valueSha256!==null)fail("owned_witness_pin_invalid");}
  }
  if(p.stages[0].identity.pid===p.stages[1].identity.pid || !p.stages.some(w=>w.stageId===s.stageId))fail("owned_stage_not_allowed");
  exact(p.policy,["disposableFixture","allowForce","gracefulDeadlineMs","forceDeadlineMs"]);
  if(p.policy.disposableFixture!==true || typeof p.policy.allowForce!=="boolean" || !Number.isInteger(p.policy.gracefulDeadlineMs) || p.policy.gracefulDeadlineMs<1 || p.policy.gracefulDeadlineMs>30000 || !Number.isInteger(p.policy.forceDeadlineMs) || p.policy.forceDeadlineMs<1 || p.policy.forceDeadlineMs>30000)fail("owned_policy_invalid");
  return freeze(copy(p));
}
function pinFiles(p,repoRoot) {
  const canonicalPath=path.join(repoRoot,"logs","evidence","plan-runs",p.context.runId+".json");
  if(p.canonicalRecord.path!==canonicalPath)fail("owned_canonical_record_path_invalid");
  const bytes=ledger.readBytes(canonicalPath),envelope=JSON.parse(bytes),record=envelope.record;
  if(crypto.createHash("sha256").update(bytes).digest("hex")!==p.canonicalRecord.rawSha256 || envelope.schema!=="ae-agent-plan-run-record-envelope.v1" || envelope.sha256!==p.canonicalRecord.envelopeSha256 || ledger.hash(record)!==envelope.sha256 || record?.schema!=="ae-agent-plan-run-record.v1" || record.runId!==p.context.runId || record.run?.id!==p.context.runId || record.run.provenance?.actionId!==p.context.actionId || record.run.provenance?.proposalRevision!==p.context.proposalRevision || record.run.provenance?.payloadHash!==p.context.payloadHash)fail("owned_canonical_record_changed");
  for(const w of p.stages){
    const d=ledger.descriptor(repoRoot,w.descriptor);
    const expected={reservation:ledger.fileFor(repoRoot,w.stageId,"reservation"),launch:ledger.fileFor(repoRoot,w.stageId,"launch"),unknown:ledger.fileFor(repoRoot,w.stageId,"unknown"),manifest:path.join(d.rootPath,"launch.manifest")};
    const values={};
    for(const [key,pin] of Object.entries(w.pins)){
      if(pin.path!==expected[key])fail("owned_witness_path_invalid");const bytes=ledger.readBytes(pin.path);
      if(crypto.createHash("sha256").update(bytes).digest("hex")!==pin.rawSha256)fail("owned_witness_changed");
      if(key!=="manifest"){const row=JSON.parse(bytes);if(row.schema!==ledger.SCHEMA+".envelope" || row.sha256!==pin.valueSha256 || ledger.hash(row.value)!==pin.valueSha256)fail("owned_witness_envelope_invalid");values[key]=row.value;}
    }
    const r=values.reservation,l=values.launch,u=values.unknown;
    if(r.schema!==ledger.SCHEMA+".reservation" || canonical(r.descriptor)!==canonical(d) || r.runId!==p.context.runId || r.actionId!==p.context.actionId || r.proposalRevision!==p.context.proposalRevision || r.payloadHash!==p.context.payloadHash || r.manifestSha256!==w.pins.manifest.rawSha256 || r.replayAllowed!==false ||
      l.schema!==ledger.SCHEMA+".launch" || l.reservationSha256!==w.pins.reservation.valueSha256 || l.descriptorSha256!==ledger.hash(d) || l.replayAllowed!==false || !ledger.sameProcess(l.process,{pid:w.identity.pid,createdAt:w.identity.birthUtc,createdUnixMs:Date.parse(w.identity.birthUtc),path:w.identity.imagePath}) ||
      u.schema!==ledger.SCHEMA+".unknown" || u.descriptorSha256!==ledger.hash(d) || u.historicalOutcome!=="unknown" || u.nativeExecutionProven!==false || u.replayAllowed!==false)fail("owned_original_witness_binding_invalid");
  }
}
function journalDirectory(root,s){return path.join(root,s.runId,s.stageId);}
function writeOnce(dir,kind,value){ledger.ensure(dir);const file=path.join(dir,kind+".json"),row={schema:SCHEMA+".envelope",sha256:hash(value),value:copy(value)},fd=fs.openSync(file,"wx",0o600);try{fs.writeFileSync(fd,JSON.stringify(row));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(hash(JSON.parse(ledger.readBytes(file)).value)!==row.sha256)fail("owned_journal_readback_failed");return row;}
const JOURNAL_KINDS=Object.freeze(["intent","graceful-intent","graceful-result","force-intent","force-result","result"]);
function readJournal(dir){if(!fs.existsSync(dir))return {};ledger.safeDirectory(dir);const rows={};for(const name of fs.readdirSync(dir)){if(!JOURNAL_KINDS.some(k=>name===k+".json"))fail("owned_journal_foreign_or_partial");const row=JSON.parse(ledger.readBytes(path.join(dir,name)));if(row.schema!==SCHEMA+".envelope" || hash(row.value)!==row.sha256)fail("owned_journal_corrupt_readback_only");rows[name.slice(0,-5)]=row;}return rows;}
function exitProof(wait){if(wait?.signaled===true && wait.waitResult==="WAIT_OBJECT_0" && Number.isInteger(wait.exitCode) && wait.exitCode>=0 && wait.exitCode<=4294967295)return {waitResult:"WAIT_OBJECT_0",exitCode:wait.exitCode};if(wait?.signaled===false && wait.waitResult==="WAIT_TIMEOUT" && wait.exitCode==null)return null;fail("owned_wait_result_invalid");}
function createOwnedRuntimeLifecycle({repoRoot,journalRoot,loadTrustedProfile,checkOriginalRegistration,native,now=Date.now,checkWitnesses=pinFiles,writeJournal=writeOnce}={}) {
  if(typeof repoRoot!=="string" || typeof journalRoot!=="string" || typeof loadTrustedProfile!=="function" || typeof checkOriginalRegistration!=="function" || !native?.open)fail("owned_private_dependencies_required");
  async function authority(s,baseline=null){
    if(baseline)baseline.assertUnchanged();
    const loaded=await loadTrustedProfile(s.profile);
    if(!loaded || typeof loaded.assertUnchanged!=="function")fail("owned_trusted_provision_required");
    const p=validateProfile(loaded.profile,s),pin=hash(p);loaded.assertUnchanged();
    if(baseline && pin!==baseline.pin)fail("owned_policy_generation_changed");
    if(now()<Date.parse(p.issuedAt) || now()>=Date.parse(p.expiresAt))fail("owned_profile_stale");
    checkWitnesses(p,repoRoot);loaded.assertUnchanged();
    const state=await checkOriginalRegistration(p,p.stages.find(w=>w.stageId===s.stageId));loaded.assertUnchanged();
    // The adapter is authenticated and local. Its registration bit is not
    // ownership evidence; the separately provisioned witness supplies that.
    if(!state || state.registered!==true || state.originalDaemonVerified!==true || state.idle!==true || state.generation!==p.generation || state.canonicalBindingSha256!==p.canonicalBindingSha256 || state.protectedInventorySha256!==p.protectedInventorySha256)fail("owned_original_registration_not_verified");
    checkWitnesses(p,repoRoot);if(baseline)baseline.assertUnchanged();return {p,pin,assertUnchanged:loaded.assertUnchanged};
  }
  return Object.freeze({async run(input){
    const s=selector(input),dir=journalDirectory(journalRoot,s);
    if(s.command==="read-back"){
      const rows=readJournal(dir);let fresh=false;
      try{const a=await authority(s);fresh=!rows.intent || rows.intent.value.profileSha256===a.pin;}catch(_){/* Stale original actor allows historical read-back only. */}
      return {ok:true,status:rows.result?.value.status || (fs.existsSync(dir)?"consumed_partial_or_unknown":"no_shutdown_attempt"),profileFresh:fresh,consumed:fs.existsSync(dir),shutdownExitProven:rows.result?.value.shutdownExitProven===true,result:rows.result?.value || null,...OUTCOME};
    }
    const initial=await authority(s),w=initial.p.stages.find(x=>x.stageId===s.stageId);
    if(s.command==="close-once" && fs.existsSync(dir))fail("owned_shutdown_consumed_readback_only");
    const provisioned=await loadTrustedProfile(s.profile);provisioned.assertUnchanged();if(hash(provisioned.profile)!==initial.pin)fail("owned_profile_changed_before_open");
    const nativeAuthority={profilePath:provisioned.profilePath,profileRawSha256:provisioned.profileRawSha256,generation:initial.p.generation,runId:s.runId,stageId:s.stageId,expiresAt:initial.p.expiresAt};
    const handle=await native.open(w.identity,initial.p.protected,{mode:s.command==="close-once"?"close":"inspect",authority:nativeAuthority});
    let consumed=false,intent=null,observedExit=null,graceful="already_signaled",forced=false;
    function observeExit(wait){
      const proof=exitProof(wait);
      // A signaled held handle is a fact about a completed exit. Capture it
      // synchronously before another await can revoke future authority.
      if(proof && !observedExit)observedExit=freeze({schema:"ae-agent.owned-runtime-shutdown-handle-result.v1",identity:w.identity,...proof,observedAt:new Date(now()).toISOString()});
      return observedExit;
    }
    function result(status,extra={}){return {schema:SCHEMA+".result",intentSha256:intent?.sha256 || null,status,shutdownExitProven:!!observedExit,shutdownProof:observedExit,graceful,forced,...extra,...OUTCOME};}
    try{
      await authority(s,initial);initial.assertUnchanged();
      const inspection=await handle.inspect(),inspectedExit=observeExit(inspection.wait);await authority(s,initial);
      if(s.command==="inspect")return {ok:true,status:"owned_shutdown_inspected",profileSha256:initial.pin,generation:initial.p.generation,identity:w.identity,windows:inspection.windows,wait:inspection.wait,shutdownExitProven:!!inspectedExit,...OUTCOME};
      // Exclusive mkdir is the cross-factory reservation. It is never removed,
      // even if writing/fsync of the following intent fails before an effect.
      ledger.ensure(path.dirname(dir));fs.mkdirSync(dir);consumed=true;ledger.safeDirectory(dir);
      intent=writeJournal(dir,"intent",{schema:SCHEMA+".intent",selector:s,profileSha256:initial.pin,generation:initial.p.generation,canonicalBindingSha256:initial.p.canonicalBindingSha256,protectedInventorySha256:initial.p.protectedInventorySha256,identity:w.identity,createdAt:new Date(now()).toISOString(),...OUTCOME});
      let wait=inspection.wait,proof=inspectedExit;
      if(!proof){
        await authority(s,initial);initial.assertUnchanged();
        const before=await handle.inspect();proof=observeExit(before.wait);await authority(s,initial);initial.assertUnchanged();
        if(!proof){
          const windows=before.windows;
          if(!windows || !Number.isInteger(windows.count) || windows.count<0 || windows.count>1 && windows.hwnd!==null || windows.count===1 && (typeof windows.hwnd!=="string" || !/^-?\d+$/.test(windows.hwnd)))fail("owned_window_contract_invalid");
          if(windows.count===1){
            writeJournal(dir,"graceful-intent",{schema:SCHEMA+".graceful-intent",intentSha256:intent.sha256,hwnd:windows.hwnd,status:"reserved_before_single_WM_CLOSE",...OUTCOME});
            await authority(s,initial);initial.assertUnchanged();
            const sent=await handle.graceful(windows.hwnd);await authority(s,initial);
            if(sent?.status!=="wm_close_submitted" || sent.exitProven!==false)fail("owned_graceful_transport_unknown");
            graceful="submitted";writeJournal(dir,"graceful-result",{schema:SCHEMA+".graceful-result",status:graceful,...OUTCOME});
            wait=await handle.wait(initial.p.policy.gracefulDeadlineMs);proof=observeExit(wait);await authority(s,initial);
            if(!proof)graceful="deadline_elapsed";
          }else{
            graceful=windows.count===0?"no_owned_top_level_window":"ambiguous_owned_top_level_windows";
            writeJournal(dir,"graceful-result",{schema:SCHEMA+".graceful-result",status:"unavailable",reason:graceful,...OUTCOME});
          }
          if(!proof && initial.p.policy.allowForce){
            await authority(s,initial);initial.assertUnchanged();
            const current=await handle.wait(0);proof=observeExit(current);await authority(s,initial);
            if(!proof){
              writeJournal(dir,"force-intent",{schema:SCHEMA+".force-intent",intentSha256:intent.sha256,status:"reserved_before_single_TerminateProcess",reason:graceful,...OUTCOME});
              await authority(s,initial);initial.assertUnchanged();
              const sent=await handle.force();forced=true;
              if(sent?.status!=="termination_submitted" || sent.exitProven!==false)fail("owned_force_transport_unknown");
              await authority(s,initial);writeJournal(dir,"force-result",{schema:SCHEMA+".force-result",status:"submitted",...OUTCOME});
              wait=await handle.wait(initial.p.policy.forceDeadlineMs);proof=observeExit(wait);
              // A later authority failure cannot erase an observed held-handle
              // exit. The result stays separate from original observer proof.
            }
          }
        }
      }
      const saved=result(proof?"shutdown_exit_observed":"shutdown_unknown_readback_only");
      writeJournal(dir,"result",saved);return {ok:!!proof,...saved};
    }catch(e){
      if(consumed && !fs.existsSync(path.join(dir,"result.json"))){try{writeJournal(dir,"result",result(observedExit?"shutdown_exit_observed":"shutdown_refused_or_unknown_readback_only",{followupRefused:true,code:/^owned_[a-z0-9_]+$/.test(e.code || e.message || "")?(e.code || e.message):"owned_shutdown_failed"}));}catch(_){/* A partial reservation remains consumed. */}}
      throw e;
    }finally{await handle.dispose();}
  }});
}
module.exports={createOwnedRuntimeLifecycle,validateProfile,pinFiles,selector,binding,canonical,hash,freeze,SCHEMA,PROFILE_SCHEMA,OUTCOME,journalDirectory,readJournal,writeJournalOnce:writeOnce,exitProof};

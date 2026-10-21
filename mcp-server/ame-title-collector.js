"use strict";
// Durable read-only lifecycle. Transport is injected and is called only with
// STATUS. Neither a receipt nor this journal grants enqueue/START authority.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const jobs = require("./ame-title-jobs"), pending = require("./ame-title-pending");
const hash = v => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex"), clone = v => JSON.parse(JSON.stringify(v));
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const same = (a,b) => typeof a === "string" && typeof b === "string" && a.replace(/\\/g,"/").toLowerCase() === b.replace(/\\/g,"/").toLowerCase();
function callbackProof(sender, entry, item, manifest, receivedAt) {
  const a = jobs.validateInput(jobs.ENQUEUE,item.plan.steps[0].args), r = entry.pendingReceipt;
  assert.equal(r.argsSha25664,hash(a)); assert.equal(sender?.callback,"result"); assert.equal(sender.requestNonce,entry.requestNonce); assert.equal(sender.operationBinding,entry.operationBinding);
  assert(typeof sender.responseBody === "string" && Buffer.byteLength(sender.responseBody,"utf8") <= 524288);
  const n = JSON.parse(sender.responseBody), j = n.job, d = j?.dispatchDiagnostic, w = d?.workAreaCallAck;
  assert.equal(n.schema,jobs.NATIVE_SCHEMA); assert(["job_enqueued","output_binding_unverified_after_submit"].includes(n.code));
  assert.equal(n.requestNonce,entry.requestNonce); assert.equal(n.operationBinding,entry.operationBinding); assert.equal(n.appSpecifier,manifest.targetSpecifier); assert.equal(n.sessionNonce,manifest.expectedSessionNonce); assert.equal(n.nativeJobId,null);
  assert(n.error == null);assert.equal(j?.pendingGroupId,a.pendingGroupId);
  assert(Number.isFinite(n.observedAt) && Number.isFinite(receivedAt) && n.observedAt <= receivedAt && n.observedAt >= r.groupCreatedAt);
  assert.equal(j?.handleKey,entry.jobId); assert.equal(j.enqueueRequestNonce,entry.requestNonce); assert.equal(j.processBinding,entry.processBinding); assert.equal(j.sourceGuid,a.sourceGuid);
  assert(same(j.sourcePath,a.sourceProjectFile) && same(j.outputPath,entry.outputPath)); assert.equal(j.presetIdentity,manifest.pin.presetIdentity); assert.deepEqual(j.range,a.range); assert(uuid.test(j.retainedWrapperSessionNonce || ""));
  assert.equal(j.wrapperDiagnostic?.type,"object"); assert.equal(j.wrapperDiagnostic.isNull,false); assert.equal(j.workAreaApplied,true); assert.equal(j.status,"queued");
  assert.equal(j.nativeCompletionObserved,false); assert.equal(j.nativeResult,null); assert.equal(j.hostCompletion,null); assert.equal(j.wrapperCompletion,null); assert.deepEqual(j.readErrors,[]);
  assert.equal(d?.phase,"association_readback"); assert.equal(d.addDLInvoked,true); assert.equal(d.addDLReturned,true); assert.equal(d.error,null); assert.deepEqual(d.creationFailures,[]);
  assert.equal(w?.type,3); assert.equal(w.result,true); assert.equal(w.startSeconds,a.range.startSeconds); assert.equal(w.endSeconds,a.range.endSeconds); assert(Number.isFinite(w.observedAt) && w.observedAt <= receivedAt && w.observedAt >= n.observedAt && w.observedAt >= r.groupCreatedAt);
  assert.equal(n.nativeAssociationVerified,n.code === "job_enqueued"); assert.equal(j.nativeAssociationVerified,n.nativeAssociationVerified);
  const checks = {batchStopped:n.batchRunning === false,exactAssociation:n.nativeAssociationVerified === true,noEarlyEncoding:j.earlyEncodingObserved === false,noProvisionalEvents:Array.isArray(j.provisionalHostEvents) && j.provisionalHostEvents.length === 0,exactOutputCallAck:j.outputBindingEvidence === "exact_addDL_call_argument_ack",independentGetterNotClaimed:j.independentOutputGetterVerified === false,generatedOutputNotClaimed:j.generatedOutputVerified === false,zeroProgress:j.getEncodeProgress === 0,zeroEncodeTime:j.getEncodeTime === 0,emptyOutputFiles:Array.isArray(j.outputFiles) && j.outputFiles.length === 0};
  const fullQueuedProof = Object.values(checks).every(Boolean);
  return {jobId:entry.jobId,batchId:entry.batchId,stage:fullQueuedProof && n.code === "job_enqueued" ? "native_callback_received" : "submitted_unverified",originalCode:n.code,fullQueuedProof,queuedProofChecks:checks,
    nativeCallbackBodySha25664:crypto.createHash("sha256").update(sender.responseBody,"utf8").digest("hex"),nativeAssociationVerified:n.nativeAssociationVerified,ownItemAccepted:false,completionVerified:false,mediaVerified:false};
}
function validateRead(raw, entry, manifest) {
  const a = jobs.validateInput(jobs.STATUS,raw);
  assert.equal(a.batchId,entry.batchId); assert.equal(a.jobId,entry.jobId); assert.equal(a.targetSpecifier,manifest.targetSpecifier); assert.deepEqual(a.expectedProcess,manifest.expectedProcess); assert.equal(a.expectedSessionNonce,manifest.expectedSessionNonce); assert.equal(a.readTransport,pending.MODE);
  for (const key of ["originalRunId","acceptanceOnly","afterReadTimeoutNonce","afterReadUnavailableNonce"]) assert.equal(a[key],undefined);
  return a;
}
function censusRetry(value, args) {
  const g = value?.readGuard;
  return !!(args.readRequestNonce && value.schema === jobs.SCHEMA && value.code === "ame_title_read_census_unavailable" && value.ok === false && value.sameReadRetryAllowed === true && value.currentStatusObserved === false && value.executionAuthority === false &&
    value.batchId === args.batchId && value.jobId === args.jobId && value.requestNonce === args.readRequestNonce && hash(value.retryArgs) === hash(args) &&
    g?.schema === "ae-agent-ame-title-read-guard.v1" && g.phase === "pre_native_dispatch" && g.dispatchInvoked === false && g.readRequestNonce === args.readRequestNonce && g.batchId === args.batchId && g.jobId === args.jobId && hash(g.expectedProcess) === hash(args.expectedProcess) &&
    (["inspect_error"].includes(g.census?.reason) && g.census.processes === null || g.census?.reason === "no_process_observed" && Array.isArray(g.census.processes) && g.census.processes.length === 0));
}
function atomic(file,value) {
  const tmp = file + "." + crypto.randomUUID() + ".tmp", fd = fs.openSync(tmp,"wx");
  try {fs.writeFileSync(fd,JSON.stringify(value)+"\n","utf8");fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  fs.renameSync(tmp,file);
}
function createCollector(options) {
  const {directory,entries,items,manifest,call} = options, now = options.now || Date.now;
  assert(manifest?.pin && /^[a-f0-9]{64}$/.test(manifest.pin.processBinding) && /^[a-f0-9]{64}$/.test(manifest.pin.presetIdentity),"fresh_manifest_process_and_preset_pins_required");
  assert(path.isAbsolute(directory)); assert.equal(typeof call,"function"); assert(Array.isArray(entries) && entries.length >= 1 && entries.length <= pending.MAX_GROUP_ITEMS && items.length === entries.length);
  const input = clone({entries,items,manifest}), inputHash = hash(input), deadline = entries[0].pendingReceipt.groupDeadline;
  const ids = new Set(), jobsSeen = new Set(), outputs = new Set();
  for (let i=0;i<entries.length;i++) {
    const e=entries[i],a=jobs.validateInput(jobs.ENQUEUE,items[i].plan.steps[0].args),r=e.pendingReceipt;
    assert.equal(items[i].plan.steps.length,1);assert.equal(items[i].plan.steps[0].tool,jobs.ENQUEUE);assert.equal(a.pendingGroupId,entries[0].pendingReceipt.pendingGroupId);
    assert.equal(a.queueMode,"shared_queue_v1");assert.equal(a.enqueueTransport,pending.MODE);assert(uuid.test(r.pendingGroupId||""));assert.equal(r.pendingGroupId,a.pendingGroupId);assert(uuid.test(r.runId||""));
    assert.equal(a.targetSpecifier,manifest.targetSpecifier);assert.deepEqual(a.expectedProcess,manifest.expectedProcess);assert.equal(a.expectedSessionNonce,manifest.expectedSessionNonce);
    assert(same(a.sourceProjectFile,manifest.source?.path));assert.equal(a.expectedSourceSha25664,manifest.source.sha25664);assert.equal(a.presetId,manifest.presetId);assert.equal(a.presetSha25664,manifest.presetSha25664);
    assert(Number.isSafeInteger(r.groupCreatedAt)&&Number.isSafeInteger(r.groupDeadline)&&r.groupDeadline-r.groupCreatedAt===pending.GROUP_BUDGET_MS);assert(/^[a-f0-9]{64}$/.test(r.groupCommonBinding||"")&&/^[a-f0-9]{64}$/.test(r.groupMemberBinding||""));
    assert.equal(r.schema,pending.SCHEMA);assert.equal(r.batchId,a.batchId);assert.equal(e.batchId,a.batchId);assert.equal(r.jobId,e.jobId);assert.equal(r.requestNonce,e.requestNonce);assert.equal(r.operationBinding,e.operationBinding);assert.equal(r.argsSha25664,hash(a));
    assert.equal(r.operationBinding,hash({operation:"enqueue",jobId:e.jobId,args:a}));assert.equal(r.processBinding,manifest.pin.processBinding);assert.equal(e.processBinding,r.processBinding);assert.equal(r.outputPath,e.outputPath);
    assert.equal(r.groupMemberBinding,hash({jobId:e.jobId,batchId:a.batchId,requestNonce:e.requestNonce,operationBinding:e.operationBinding,sourceGuid:a.sourceGuid,range:a.range,outputPath:e.outputPath}));
    assert.equal(r.groupDeadline,deadline);assert.equal(r.groupCreatedAt,entries[0].pendingReceipt.groupCreatedAt);assert.equal(r.groupCommonBinding,entries[0].pendingReceipt.groupCommonBinding);assert.equal(r.groupDeadline,r.groupCreatedAt+pending.GROUP_BUDGET_MS);assert.equal(r.budgetMs,pending.GROUP_BUDGET_MS);
    assert(uuid.test(e.jobId) && uuid.test(e.batchId) && uuid.test(e.requestNonce));assert(!ids.has(e.batchId) && !jobsSeen.has(e.jobId) && !outputs.has(e.outputPath.toLowerCase()));ids.add(e.batchId);jobsSeen.add(e.jobId);outputs.add(e.outputPath.toLowerCase());
    validateRead(e.statusArgs,e,manifest);
  }
  fs.mkdirSync(directory,{recursive:true});assert.equal(fs.lstatSync(directory).isSymbolicLink(),false);assert(same(fs.realpathSync(directory),directory));
  const lock = path.join(directory,"collector.lock"), token = crypto.randomUUID(), admission=path.join(directory,"collector.admission"),admissionToken=crypto.randomUUID();
  // Serialize the entire old-owner census/reclaim/new-lock transaction. A stale
  // admission is deliberately NOT reclaimed by PID: that repeats the same race.
  const claim=fs.openSync(admission,"wx");try {fs.writeFileSync(claim,JSON.stringify({schema:"ae-agent-ame-collector-admission.v1",pid:process.pid,token:admissionToken}));fs.fsyncSync(claim);}finally {fs.closeSync(claim);}
  try {
    if (fs.existsSync(lock)) {
      const prior=JSON.parse(fs.readFileSync(lock,"utf8"));assert(Number.isSafeInteger(prior.pid)&&prior.pid>0&&uuid.test(prior.token));
      let alive=true;try {process.kill(prior.pid,0);} catch(error) {if(error.code==="ESRCH")alive=false;else throw error;}
      assert.equal(alive,false,"collector_already_running_or_owner_unknown");fs.unlinkSync(lock);
    }
    const fd=fs.openSync(lock,"wx");try {fs.writeFileSync(fd,JSON.stringify({pid:process.pid,token}));fs.fsyncSync(fd);}finally {fs.closeSync(fd);}
  } finally {
    const own=JSON.parse(fs.readFileSync(admission,"utf8"));assert.equal(own.token,admissionToken,"collector_admission_owner_changed");fs.unlinkSync(admission);
  }
  let sequence=0,previousHash=null,closed=false,roundBusy=false;
  const states=entries.map(e=>({reads:0,args:validateRead(e.statusArgs,e,manifest),guardRetries:0,nextAttemptAt:0,pendingIntent:null,terminal:null,blocked:null}));
  function reduce(event) {
    if(event.kind==="opened") {assert.equal(event.inputHash,inputHash);return;}
    assert(Number.isInteger(event.index)&&event.index>=0&&event.index<entries.length);const s=states[event.index];
    if(event.kind==="intent") {assert(!s.pendingIntent&&!s.terminal&&!s.blocked);validateRead(event.args,entries[event.index],manifest);assert.equal(hash(event.args),hash(s.args));s.pendingIntent=event;s.reads++;return;}
    assert(s.pendingIntent);assert.equal(event.intentId,s.pendingIntent.id);const args=s.pendingIntent.args;
    if(event.kind==="transport_unknown") {if(!args.readRequestNonce)s.blocked={code:"initial_read_outcome_unknown_no_replay",automaticRetryAllowed:false};return;}
    assert.equal(event.kind,"response");s.pendingIntent=null;
    const v=event.value;
    if(censusRetry(v,args)) {
      s.guardRetries++;if(s.guardRetries>3)s.blocked={code:"read_census_retry_bound",automaticRetryAllowed:false};
      else s.nextAttemptAt=event.at+Math.min(30000,1000*2**(s.guardRetries-1));return;
    }
    if(v?.batchId!==entries[event.index].batchId||v?.jobId!==entries[event.index].jobId) {s.blocked={code:"read_response_identity_missing_or_changed",automaticRetryAllowed:false};return;}
    if(v.originalSender?.callback==="result") {
      try {s.terminal=callbackProof(v.originalSender,entries[event.index],items[event.index],manifest,Date.parse(v.observedAt));}
      catch(error) {s.blocked={code:"retained_unknown_callback",reason:error.message.slice(0,1000),automaticRetryAllowed:false};}return;
    }
    if(pending.isPendingStatus(v,args)) {const next=validateRead(v.reconcileArgs,entries[event.index],manifest);if(args.readRequestNonce)assert.equal(v.requestNonce,args.readRequestNonce);s.args=next;s.guardRetries=0;s.nextAttemptAt=0;return;}
    s.blocked={code:v?.code||"retained_unknown_read",automaticRetryAllowed:false};
  }
  function append(event) {
    const record={schema:"ae-agent-ame-title-collector-event.v1",sequence:sequence+1,previousHash,event}, envelope={record,sha25664:hash(record)};
    atomic(path.join(directory,String(record.sequence).padStart(8,"0")+".json"),envelope);sequence=record.sequence;previousHash=envelope.sha25664;reduce(event);
  }
  try {
    const files=fs.readdirSync(directory).filter(f=>/^\d{8}\.json$/.test(f)).sort();
    for(const file of files) {const e=JSON.parse(fs.readFileSync(path.join(directory,file),"utf8")),r=e.record;assert.equal(r.schema,"ae-agent-ame-title-collector-event.v1");assert.equal(r.sequence,sequence+1);assert.equal(r.previousHash,previousHash);assert.equal(e.sha25664,hash(r));sequence=r.sequence;previousHash=e.sha25664;reduce(r.event);}
    if(!sequence)append({kind:"opened",inputHash,at:now()});
    // A persisted exact nonce is already a retained-slot read. A no-nonce
    // interrupted initial STATUS cannot be safely reconstructed by this client.
    for(const s of states)if(s.pendingIntent&&!s.pendingIntent.args.readRequestNonce)s.blocked={code:"initial_read_outcome_unknown_no_replay",automaticRetryAllowed:false};
  } catch(error) {close();throw error;}
  function close() {if(closed)return;assert.equal(roundBusy,false,"collector_round_busy");closed=true;const own=JSON.parse(fs.readFileSync(lock,"utf8"));assert.equal(own.token,token,"collector_lock_owner_changed");fs.unlinkSync(lock);}
  function snapshot() {return clone({schema:"ae-agent-ame-title-collector-state.v1",inputHash,sequence,deadline,states,startCalls:0,enqueueCalls:0,ownAcceptanceClaimed:false,completionVerified:false,mediaVerified:false});}
  async function round() {
    assert.equal(closed,false);assert.equal(roundBusy,false,"collector_round_busy");roundBusy=true;
    try {
    if(now()>=deadline)return snapshot();
    for(let i=0;i<states.length;i++) {
      const s=states[i];if(s.terminal||s.blocked||now()<s.nextAttemptAt||now()>=deadline)continue;
      const args=validateRead(s.pendingIntent?.args||s.args,entries[i],manifest);
      if(!s.pendingIntent)append({kind:"intent",id:crypto.randomUUID(),index:i,args,at:now()});
      // A thrown transport outcome leaves this exact intent durable. A restarted
      // collector can only repeat an already-known retained-slot nonce.
      let response;
      try {response=await call(jobs.STATUS,clone(args));}
      catch(error) {
        if(!args.readRequestNonce)s.blocked={code:"initial_read_outcome_unknown_no_replay",automaticRetryAllowed:false};
        append({kind:"transport_unknown",index:i,intentId:s.pendingIntent.id,error:String(error.message||error).slice(0,1000),at:now()});throw error;
      }
      const value=response?.value===undefined?response:response.value;
      append({kind:"response",index:i,intentId:s.pendingIntent.id,value:clone(value),at:now()});
    }
    return snapshot();
    } finally {roundBusy=false;}
  }
  return {round,snapshot,close};
}
module.exports={createCollector,callbackProof,censusRetry,validateRead};

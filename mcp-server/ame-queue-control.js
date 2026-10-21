"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const jobs = require("./ame-title-jobs"), running = require("./ame-running"), protocol = require("./m100-protocol");
const START = "start_ame_queue", PAUSE = "pause_ame_queue", STATUS = "get_ame_queue_start_status", SCHEMA = "ae-agent-ame-queue-start.v1", NATIVE_SCHEMA = "ae-agent-ame-global-start-native.v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = value => crypto.createHash("sha256").update(protocol.stableStringify(value)).digest("hex");
const processBindingFor = (a, p) => crypto.createHash("sha256").update(JSON.stringify({ target: a.targetSpecifier, session: a.expectedSessionNonce, pid: p.pid, startedAt: p.startedAt, path: String(p.path).replace(/\\/g, "/").toLowerCase() })).digest("hex");
function fail(code) { throw Object.assign(Error(code), { code }); }
function validateInput(name, raw = {}) {
  if (![START, PAUSE, STATUS].includes(name) || !raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(k => !["targetSpecifier", "expectedProcess", "expectedSessionNonce", "timeoutMs", ...(name===PAUSE?["pauseRequestId","parentStartRequestId"]:["startRequestId"]), ...([START,PAUSE].includes(name) ? ["globalQueue", "verifyAfter", "idempotencyKey", "idempotencyScope", "checkpointLabel", "autoCheckpoint",...(name===START?["resumeFromPauseId"]:[])] : ["completionWitness","pauseRequestId"])].includes(k))) fail("ame_queue_invalid_input");
  const base = jobs.validateInput(jobs.STATUS, { targetSpecifier: raw.targetSpecifier, expectedProcess: raw.expectedProcess, expectedSessionNonce: raw.expectedSessionNonce,
    timeoutMs: raw.timeoutMs, batchId: "00000000-0000-4000-8000-000000000000", jobId: "00000000-0000-4000-8000-000000000000" });
  if (!Object.hasOwn(base, "expectedSessionNonce") || !UUID.test((name===PAUSE?raw.parentStartRequestId:raw.startRequestId) || "") || [START,PAUSE].includes(name) && raw.globalQueue !== true) fail("ame_queue_explicit_global_intent_required");
  if ([START,PAUSE].includes(name) && raw.verifyAfter === false) fail("ame_queue_independent_readback_required");
  if(raw.pauseRequestId!==undefined&&(typeof raw.pauseRequestId!=="string"||!UUID.test(raw.pauseRequestId)||raw.completionWitness!==undefined))fail("ame_queue_pause_selector_invalid");
  if(name===PAUSE&&raw.pauseRequestId===undefined)fail("ame_queue_pause_selector_invalid");
  if(raw.resumeFromPauseId!==undefined&&(name!==START||typeof raw.resumeFromPauseId!=="string"||!UUID.test(raw.resumeFromPauseId)||raw.resumeFromPauseId===raw.startRequestId))fail("ame_queue_resume_selector_invalid");
  delete base.batchId; delete base.jobId;
  if (Object.hasOwn(raw, "completionWitness")) {
    const w = raw.completionWitness;
    if (name !== STATUS || !w || typeof w !== "object" || Array.isArray(w) || Object.keys(w).length !== 2 || Object.keys(w).some(k => !["batchId", "jobId"].includes(k)) || !UUID.test(w.batchId || "") || !UUID.test(w.jobId || "")) fail("ame_queue_completion_selector_invalid");
    base.completionWitness = { batchId: w.batchId, jobId: w.jobId };
  }
  return { ...base, ...(name===PAUSE?{pauseRequestId:raw.pauseRequestId,parentStartRequestId:raw.parentStartRequestId}:{startRequestId:raw.startRequestId}), ...([START,PAUSE].includes(name) ? { globalQueue: true } : {}),...(name===STATUS&&raw.pauseRequestId?{pauseRequestId:raw.pauseRequestId}:{}),...(raw.resumeFromPauseId?{resumeFromPauseId:raw.resumeFromPauseId}:{}) };
}
function statusArgs(name,raw){const a=validateInput(name,raw);if(name===PAUSE){const {globalQueue,parentStartRequestId,...pins}=a;return validateInput(STATUS,{...pins,startRequestId:parentStartRequestId});}const {globalQueue,resumeFromPauseId,...pins}=a;return validateInput(STATUS,pins);}
function write(file, value, exclusive = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = exclusive ? file : file + "." + crypto.randomUUID() + ".tmp", fd = fs.openSync(temporary, "wx");
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } if (!exclusive) fs.renameSync(temporary, file);
}
// Fixed ES3 program. Only host state and our global START marker are read.
// It never accesses the title wrapper slot, frontend, queue items or files.
function nativeGlobalStart(a) {
  function str(v) { var out = [], key, i; if (v === null || v === undefined) return "null"; if (typeof v === "boolean" || typeof v === "number") return String(v); if (typeof v === "string") { var s='"'; for(i=0;i<v.length;i++){var c=v.charCodeAt(i);if(c===34||c===92)s+='\\'+v.charAt(i);else if(c<32||c===8232||c===8233){var h=c.toString(16);while(h.length<4)h="0"+h;s+='\\u'+h;}else s+=v.charAt(i);}return s+'"'; } if(Object.prototype.toString.call(v)==="[object Array]"){for(i=0;i<v.length;i++)out.push(str(v[i]));return "["+out.join(",")+"]";} for(key in v)if(Object.prototype.hasOwnProperty.call(v,key))out.push(str(key)+":"+str(v[key]));return "{"+out.join(",")+"}"; }
  var reply = {schema:"ae-agent-ame-global-start-native.v1",requestNonce:a.requestNonce,operationBinding:a.operationBinding,appSpecifier:String(BridgeTalk.appSpecifier),sessionNonce:$.global.aeAgentAMEProbeSessionNonce || null,observedAt:new Date().getTime(),batchRunning:null,batchEncoderStatus:null,start:null,code:"unknown"};
  function done(code){reply.code=code;return str(reply);}
  if(reply.appSpecifier!==a.targetSpecifier || reply.sessionNonce!==a.expectedSessionNonce)return done("target_session_changed");
  var host, marker=$.global.aeAgentAMEGlobalQueueStartV1;
  if(typeof app.getEncoderHost!=="function")return done("encoder_host_unsupported");host=app.getEncoderHost();
  if(!host || typeof host.isBatchRunning!=="function")return done("batch_running_unknown");
  reply.batchRunning=host.isBatchRunning();
  if(typeof reply.batchRunning!=="boolean")return done("batch_running_unknown");
  if(typeof host.getBatchEncoderStatus==="function"){try{var hostStatus=host.getBatchEncoderStatus();if(typeof hostStatus==="string")reply.batchEncoderStatus=hostStatus;}catch(statusError){reply.batchEncoderStatus=null;}}
  var pause=$.global.aeAgentAMEGlobalQueuePauseV1;
  function parentExact(){return marker&&marker.startRequestId===a.parentStartRequestId&&marker.requestNonce===a.parentRequestNonce&&marker.operationBinding===a.parentOperationBinding&&marker.processBinding===a.processBinding&&marker.invoked===true;}
  function pauseExact(){return pause&&pause.pauseRequestId===a.pauseRequestId&&pause.requestNonce===a.pauseRequestNonce&&pause.operationBinding===a.pauseOperationBinding&&pause.parentStartRequestId===a.parentStartRequestId&&pause.parentRequestNonce===a.parentRequestNonce&&pause.parentOperationBinding===a.parentOperationBinding&&pause.processBinding===a.processBinding&&pause.invoked===true;}
  if(a.operation==="global_pause_status"){
    if(!parentExact()||!pauseExact())return done("global_pause_marker_unavailable");reply.start=marker;reply.pause=pause;return done("global_pause_observed");
  }
  if(a.operation==="global_pause"){
    if(!parentExact()||!a.parentDispatchSha25664||!/^[a-f0-9]{64}$/.test(a.parentDispatchSha25664)||marker.accepted!==a.parentAccepted||reply.batchEncoderStatus!=="running"||reply.batchRunning!==true)return done("pause_parent_running_unverified");
    if(pause&&pause.parentRequestNonce===marker.requestNonce)return done("global_pause_already_reserved");
    if(typeof host.pauseBatch!=="function")return done("pause_batch_unsupported");
    pause={pauseRequestId:a.pauseRequestId,requestNonce:a.requestNonce,operationBinding:a.operationBinding,parentStartRequestId:a.parentStartRequestId,parentRequestNonce:marker.requestNonce,parentOperationBinding:marker.operationBinding,processBinding:a.processBinding,invoked:true,invokedAt:new Date().getTime(),accepted:null,resumedByRequestNonce:null};
    $.global.aeAgentAMEGlobalQueuePauseV1=pause;reply.start=marker;reply.pause=pause;
    var pauseResult=host.pauseBatch();if(pauseResult===true)pause.accepted=true;else if(pauseResult===false)pause.accepted=false;
    return done("global_pause_invoked");
  }
  if(a.operation==="global_start_status") {
    if(!marker || marker.startRequestId!==a.startRequestId || marker.processBinding!==a.processBinding || marker.requestNonce!==a.startRequestNonce || marker.operationBinding!==a.startOperationBinding)return done("global_start_marker_unavailable");
    reply.start=marker;return done("global_start_observed");
  }
  if(a.operation!=="global_start")return done("operation_invalid");
  if(marker && marker.startRequestId===a.startRequestId){reply.start=marker;return done("global_start_already_reserved");}
  var resume=a.resumePauseProof;
  if(a.resumeFromPauseId){
    if(!resume||resume.schema!=="ae-agent-ame-paused-enqueue.v1"||resume.pauseRequestId!==a.resumeFromPauseId||!parentExact()||!pauseExact()||pause.resumedByRequestNonce!==null||reply.batchEncoderStatus!=="paused"||resume.parentRequestNonce!==marker.requestNonce||resume.pauseRequestNonce!==pause.requestNonce||typeof resume.proofSha25664!=="string"||!/^[a-f0-9]{64}$/.test(resume.proofSha25664))return done("resume_pause_unverified");
    var members=a.resumeMembers,slot=$.global.aeAgentAMETitleJobsV1,k,e,w,expected={},count=0;
    if(!members||members.length<1||members.length>11||!slot)return done("resume_group_unverified");
    for(k=0;k<members.length;k++){w=members[k];if(expected[w.jobId])return done("resume_group_unverified");expected[w.jobId]=true;e=slot.jobs[w.jobId];if(!e||e.enqueueRequestNonce!==w.requestNonce||e.batchId!==w.batchId||e.processBinding!==a.processBinding||e.pendingGroupId!==w.pendingGroupId||e.sourcePath!==w.sourcePath||e.sourceGuid!==w.sourceGuid||e.outputPath!==w.outputPath||e.presetIdentity!==w.presetIdentity||e.range.startSeconds!==w.range.startSeconds||e.range.endSeconds!==w.range.endSeconds||e.addDLInvoked!==true||e.addDLReturned!==true||e.nativePhase!=="association_readback"||e.nativeError||!e.creationFailures||e.creationFailures.length||e.workAreaApplied!==true||!e.workAreaCallAck||e.workAreaCallAck.type!==3||e.workAreaCallAck.result!==true||e.workAreaCallAck.startSeconds!==e.range.startSeconds||e.workAreaCallAck.endSeconds!==e.range.endSeconds||e.earlyEncodingObserved===true||!e.pauseEvidence||e.pauseEvidence.preVerified!==true||e.pauseEvidence.postVerified!==true||e.pauseEvidence.pauseRequestNonce!==pause.requestNonce)return done("resume_group_unverified");}
    for(k in slot.jobs)if(Object.prototype.hasOwnProperty.call(slot.jobs,k)){e=slot.jobs[k];if(e.pauseEvidence&&e.pauseEvidence.pauseRequestNonce===pause.requestNonce){if(!expected[k]||++count>11)return done("resume_group_changed");}}if(count!==members.length)return done("resume_group_changed");
    pause.resumedByRequestNonce=a.requestNonce;
  }else if(marker){
    if(marker.processBinding!==a.processBinding || marker.requestNonce!==a.previousRequestNonce)return done("previous_global_start_unresolved");
    if(marker.accepted!==true){
      // Only a server-generated private sidecar can enter this fixed argument.
      // A fresh stopped sample alone never releases an unknown prior START.
      var proof=a.previousCycleProof;
      if(!proof || proof.schema!=="ae-agent-ame-cycle-release.v1" || proof.startRequestId!==marker.startRequestId || proof.requestNonce!==marker.requestNonce || proof.operationBinding!==marker.operationBinding || proof.processBinding!==marker.processBinding || proof.accepted!==marker.accepted || marker.invoked!==true || typeof proof.sidecarSha25664!=="string" || !/^[a-f0-9]{64}$/.test(proof.sidecarSha25664) || typeof proof.observedAt!=="number" || proof.observedAt>reply.observedAt || reply.batchEncoderStatus!=="stopped")return done("previous_global_start_unresolved");
    }
  }
  if(!a.resumeFromPauseId&&reply.batchEncoderStatus==="paused")return done("explicit_resume_required");
  if(!a.resumeFromPauseId&&reply.batchRunning!==false)return done("batch_running_or_unknown");
  if(typeof host.runBatch!=="function")return done("run_batch_unsupported");
  var previousListener=$.global.aeAgentAMEGlobalQueueListenerV1,generation=previousListener?previousListener.generation:0;
  if(previousListener && typeof host.removeEventListener==="function"){try{previousListener.host.removeEventListener("onBatchEncoderStatusChanged",previousListener.listener);generation=0;}catch(detachError){}}
  if(generation>=64)return done("global_start_listener_bound");
  marker={startRequestId:a.startRequestId,requestNonce:a.requestNonce,operationBinding:a.operationBinding,processBinding:a.processBinding,invoked:false,accepted:null,invokedAt:null,rawReturnType:null,rawReturn:null,events:[]};
  if(a.resumeFromPauseId){marker.resumeFromPauseId=a.resumeFromPauseId;marker.parentStartRequestId=a.parentStartRequestId;marker.parentRequestNonce=a.parentRequestNonce;}
  $.global.aeAgentAMEGlobalQueueStartV1=marker;reply.start=marker;
  if(typeof host.addEventListener==="function"){
    var ownMarker=marker;
    var listener=function(event){
      if($.global.aeAgentAMEGlobalQueueStartV1!==ownMarker || ownMarker.requestNonce!==a.requestNonce || !ownMarker.invoked || ownMarker.events.length>=16)return;
      var status=event&&event.batchEncoderStatus;
      if(typeof status!=="string")return;
      if(status!=="running" && status!=="stopped")return;
      ownMarker.events.push({status:status,observedAt:new Date().getTime()});
    };
    try{host.addEventListener("onBatchEncoderStatusChanged",listener);$.global.aeAgentAMEGlobalQueueListenerV1={marker:marker,host:host,listener:listener,generation:generation+1};}catch(listenerError){return done("global_start_listener_unavailable");}
  }
  marker.invokedAt=new Date().getTime();marker.invoked=true;
  var accepted=host.runBatch();marker.rawReturnType=typeof accepted;
  if(typeof accepted==="boolean" || typeof accepted==="string" || typeof accepted==="number" && isFinite(accepted))marker.rawReturn=accepted;
  // Explicit branches avoid ExtendScript's mixed/nested conditional ambiguity.
  if(accepted===true)marker.accepted=true;else if(accepted===false)marker.accepted=false;else marker.accepted=null;
  return done(marker.accepted===true?"global_start_accepted":"global_start_unknown");
}
function messageScript(a) { return "(" + nativeGlobalStart.toString() + ")(" + jobs.fixedDataExpression(a) + ");"; }
// A separate read sender never replaces an enqueue/global START descriptor or
// its late callback. Its bounded retired reads contain no mutation authority.
function nativeGlobalRead(a, body) {
  var current=$.global.aeAgentAMEGlobalQueueReadV1,history=$.global.aeAgentAMEGlobalQueueReadHistoryV1;
  if(!history){history=[];$.global.aeAgentAMEGlobalQueueReadHistoryV1=history;}
  function result(code,slot){return {schema:"ae-agent-ame-title-send.v1",requestNonce:a.requestNonce,code:code,callback:slot?slot.callback:null,responseBody:slot?slot.body:null};}
  if(a.operation!=="global_start_status"&&a.operation!=="global_pause_status")return result("read_operation_invalid",null);
  if(current&&(!current.callback||current.callback==="timeout")){
    if(history.length>=64)return result("global_read_history_bound",null);
    history.push(current);
  }
  if(!BridgeTalk.isRunning(a.targetSpecifier))return result("target_not_running",null);
  var slot={requestNonce:a.requestNonce,operationBinding:a.operationBinding,callback:null,body:null,message:null},message=new BridgeTalk();slot.message=message;
  $.global.aeAgentAMEGlobalQueueReadV1=slot;
  message.target=a.targetSpecifier;message.body=body;message.timeout=Math.ceil(a.timeoutMs/1000);
  message.onResult=function(r){var value=String(r.body||"");if(value.length>65536){slot.callback="oversize";slot.body=null;}else{slot.body=value;slot.callback="result";}};
  message.onError=function(){slot.callback="error";};message.onTimeout=function(){if(!slot.callback)slot.callback="timeout";};
  try{message.send(Math.ceil(a.timeoutMs/1000));}catch(sendError){return result("send_unknown",slot);}
  var until=new Date().getTime()+250;
  while(!slot.callback&&new Date().getTime()<until){if(typeof BridgeTalk.pump!=="function"||typeof $.sleep!=="function")break;BridgeTalk.pump();if(!slot.callback)$.sleep(20);}
  return result(slot.callback||"unknown",slot);
}
function readCommandScript(a) { return "return ("+nativeGlobalRead.toString()+")("+jobs.fixedDataExpression(a)+","+jobs.fixedStringExpression(messageScript(a))+");"; }
function assertProposalContext(context, currentRecord, contractVersion) {
  running.assertProposalContext(context, currentRecord, contractVersion);
  const plan = context.record.payload?.plan, step = plan?.steps?.[0];
  if (![START,PAUSE].includes(step?.tool) || plan.runtimeBindings || step.resultBindings || step.bindings || plan.montagePipeline ||
      context.record.payloadHash !== protocol.sha256Payload(context.record.payload) || hash(validateInput(step.tool, step.args || {})) !== hash(validateInput(step.tool, context.args))) fail("ame_queue_exact_proposal_required");
}
function readLegacyStartBlockers(stateDir, processBinding) {
  // Local compatibility guards only. Never validate/load saved jobs or acceptance.
  // Legacy reservations remain immutable UNKNOWN, so inspect only their linked
  // batch START resolution. Missing/corrupt resolution fails closed.
  const batches = path.join(stateDir, "batches"), starts = path.join(stateDir, "starts");
  const read = file => { if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 16 * 1024 * 1024) fail("ame_queue_legacy_start_unknown"); return JSON.parse(fs.readFileSync(file, "utf8")); };
  const files = directory => fs.existsSync(directory) ? fs.readdirSync(directory).filter(n => UUID.test(n.slice(0, -5)) && n.endsWith(".json")) : [];
  const names = new Set([...files(batches), ...files(starts)]); if (names.size > 4096) fail("ame_queue_legacy_start_budget");
  for (const name of names) {
    const batch = fs.existsSync(path.join(batches, name)) ? read(path.join(batches, name)) : null;
    const reserved = fs.existsSync(path.join(starts, name)) ? read(path.join(starts, name)) : null;
    const bound = batch?.processBinding || reserved?.sharedQueueReceipt?.binding?.processBinding || reserved?.manualQueueReceipt?.manifest?.processBinding;
    // A new PID/session is not proof that an old global START never ran.
    // Its exact original lane must first resolve; do not reissue it elsewhere.
    if (!bound && (reserved || batch?.start)) fail("ame_queue_legacy_start_unknown");
    if ((reserved || batch?.start) && !(batch?.start?.transportResolved === true && batch.start.state === "accepted" && (!reserved || batch.start.requestNonce === reserved.requestNonce))) fail("ame_queue_legacy_start_unresolved");
  }
}
function createExecutor(deps) {
  if (!path.isAbsolute(deps.stateDir || "") || ["inspectProcesses", "inspectTransport", "runExtendScriptBody", "assertServerProposalContext", "assertLegacyStartClear"].some(k => typeof deps[k] !== "function")) fail("ame_queue_dependencies_required");
  const caps = new WeakMap(), now = deps.now || Date.now; let busy = false;
  const fileFor = id => path.join(deps.stateDir, "intents", id + ".json"), lockFor = binding => path.join(deps.stateDir, "bindings", binding + ".json");
  const receiptFor = id => path.join(deps.stateDir, "dispatch-receipts", id + ".json"), cycleFor = id => path.join(deps.stateDir, "cycles", id + ".json");
  const pauseFor=id=>path.join(deps.stateDir,"pauses",id+".json"),pauseDispatchFor=id=>path.join(deps.stateDir,"pause-dispatches",id+".json"),pauseProofFor=id=>path.join(deps.stateDir,"pause-proofs",id+".json");
  function readFile(file) { const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>1048576)fail("ame_queue_record_invalid");return JSON.parse(fs.readFileSync(file,"utf8")); }
  const identity = s => ({argsHash:s.argsHash,requestNonce:s.requestNonce,operationBinding:s.operationBinding,processBinding:s.processBinding,reservedAt:s.reservedAt,authorization:s.authorization});
  function exactMarker(s,n) { const m=n?.start;return !!(m&&m.startRequestId===s.args.startRequestId&&m.requestNonce===s.requestNonce&&m.operationBinding===s.operationBinding&&m.processBinding===s.processBinding&&m.invoked===true&&[true,false,null].includes(m.accepted)); }
  function receipt(s) {
    if(!fs.existsSync(receiptFor(s.args.startRequestId)))return null;
    const r=readFile(receiptFor(s.args.startRequestId));
    if(r.schema!=="ae-agent-ame-global-dispatch-receipt.v1"||r.intentSha25664!==hash(identity(s))||!exactMarker(s,r.native)||r.native.schema!==NATIVE_SCHEMA||r.native.requestNonce!==s.requestNonce||r.native.operationBinding!==s.operationBinding||r.native.appSpecifier!==s.args.targetSpecifier||r.native.sessionNonce!==s.args.expectedSessionNonce||!["global_start_accepted","global_start_unknown"].includes(r.native.code)||r.terminal?.callback!=="result"||r.terminal?.code!=="result"||r.terminal.nativeSha25664!==hash(r.native)||!Number.isFinite(r.native.observedAt)||r.native.observedAt<Date.parse(s.reservedAt)||!Number.isFinite(Date.parse(r.recordedAt)))fail("ame_queue_dispatch_receipt_changed");
    return r;
  }
  function retainReceipt(s,n,origin,terminal) {
    if(!exactMarker(s,n)||n.requestNonce!==s.requestNonce||n.operationBinding!==s.operationBinding||!["global_start_accepted","global_start_unknown"].includes(n.code))return null;
    const prior=receipt(s);if(prior)return prior;
    const r={schema:"ae-agent-ame-global-dispatch-receipt.v1",intentSha25664:hash(identity(s)),recordedAt:new Date(now()).toISOString(),origin,terminal:{callback:"result",code:"result",nativeSha25664:hash(n),...(terminal?{responseBody:terminal.responseBody}: {})},native:n};
    write(receiptFor(s.args.startRequestId),r,true);return receipt(s);
  }
  function backfillReceipt(s) {
    if(typeof deps.readRunRecord!=="function")return null;
    const record=deps.readRunRecord(s.authorization.runId),run=record?.run,step=run?.steps?.[0],n=step?.result?.native,p=step?.result;
    // Only the daemon's digest-checked server record is a backfill source. The
    // public STATUS accepts a selector, never caller evidence or file paths.
    if(record?.runId!==s.authorization.runId||record.unavailable||run?.id!==s.authorization.runId||run.dryRun!==false||run.provenance?.actionId!==s.authorization.proposalId||run.steps?.length!==1||record.plan?.steps?.length!==1||step.tool!==START||record.plan.steps[0].tool!==START||hash(validateInput(START,step.args))!==s.argsHash||hash(validateInput(START,record.plan.steps[0].args))!==s.argsHash||p?.schema!==SCHEMA||p.startRequestId!==s.args.startRequestId||p.requestNonce!==s.requestNonce||p.processBinding!==s.processBinding||!running.sameProcess(p.process,s.process)||hash(p.authorization)!==hash(s.authorization)||!Number.isFinite(Date.parse(run.startedAt))||Date.parse(run.startedAt)>Date.parse(s.reservedAt)||!Number.isFinite(Date.parse(run.finishedAt))||n?.observedAt>Date.parse(run.finishedAt)||n?.observedAt<Date.parse(s.reservedAt))return null;
    return retainReceipt(s,n,{kind:"server_run_record",runId:run.id,recordSha25664:hash(record)},null);
  }
  function stopped(s,n) { return !!(n?.schema===NATIVE_SCHEMA&&n.code==="global_start_observed"&&exactMarker(s,n)&&n.appSpecifier===s.args.targetSpecifier&&n.sessionNonce===s.args.expectedSessionNonce&&UUID.test(n.requestNonce||"")&&n.requestNonce!==s.requestNonce&&n.operationBinding===hash({operation:"global_start_status",startRequestId:s.args.startRequestId,requestNonce:n.requestNonce})&&n.batchRunning===false&&n.batchEncoderStatus==="stopped"); }
  function sameDispatch(r,n) { const a=r?.native?.start,b=n?.start;return !!(a&&b&&a.accepted===b.accepted&&(a.invokedAt??null)===(b.invokedAt??null)&&(a.rawReturnType??null)===(b.rawReturnType??null)&&(a.rawReturn??null)===(b.rawReturn??null)); }
  function eventCycle(s,n) {
    const m=n?.start,events=m?.events;if(!stopped(s,n)||!Number.isFinite(m.invokedAt)||m.invokedAt<Date.parse(s.reservedAt)||!Array.isArray(events)||events.length>16)return false;
    let runningAt=null;
    for(const e of events){if(!e||!["running","stopped"].includes(e.status)||!Number.isFinite(e.observedAt)||e.observedAt<m.invokedAt||e.observedAt>n.observedAt)return false;if(e.status==="running")runningAt=e.observedAt;else if(runningAt!==null&&e.observedAt>=runningAt)return true;}
    return false;
  }
  function ownCycle(s,r,n,own,selector) {
    const out=own?.status,c=own?.acceptance,p=out?.acceptanceReceipt,j=out?.native?.job,h=j?.hostCompletion,t=out?.native,started=r.native.start.invokedAt??r.native.observedAt;
    const samePath=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.replace(/\\/g,"/").toLowerCase()===b.replace(/\\/g,"/").toLowerCase();
    const jsonHash=v=>crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
    return !!(stopped(s,n)&&sameDispatch(r,n)&&r.native.start.accepted===false&&out?.schema===jobs.SCHEMA&&out.ok===true&&out.code==="job_observed"&&out.currentStatusObserved===true&&out.ownItemAccepted===true&&out.acceptanceState==="accepted"&&out.nativeAssociationVerified===true&&out.nativeCompletionObserved===true&&out.completionVerified===true&&out.nativeResult==="True"&&out.batchId===selector.batchId&&out.jobId===selector.jobId&&running.sameProcess(out.process,s.process)&&p?.schema==="ae-agent-ame-own-item-acceptance.v2"&&p.jobId===selector.jobId&&p.batchId===selector.batchId&&UUID.test(p.enqueueRequestNonce||"")&&UUID.test(p.readRequestNonce||"")&&p.enqueueRequestNonce!==s.requestNonce&&p.readRequestNonce!==s.requestNonce&&p.processBinding===s.processBinding&&p.nativeSessionNonce===s.args.expectedSessionNonce&&c?.receiptSha25664===jsonHash(p)&&Number.isFinite(Date.parse(c.acceptedAt))&&Date.parse(c.acceptedAt)<started&&Number.isFinite(p.observedAt)&&p.observedAt<=Date.parse(c.acceptedAt)&&p.observedAt<started&&t?.schema===jobs.NATIVE_SCHEMA&&t.code==="job_observed"&&t.appSpecifier===s.args.targetSpecifier&&t.sessionNonce===s.args.expectedSessionNonce&&UUID.test(t.requestNonce||"")&&t.requestNonce!==p.enqueueRequestNonce&&t.requestNonce!==p.readRequestNonce&&t.requestNonce!==s.requestNonce&&t.operationBinding===jsonHash({operation:"status",jobId:p.jobId})&&t.nativeAssociationVerified===true&&t.batchRunning===false&&Number.isFinite(t.observedAt)&&t.observedAt>=h?.observedAt&&n.observedAt>=t.observedAt&&j?.handleKey===p.jobId&&j.enqueueRequestNonce===p.enqueueRequestNonce&&j.retainedWrapperSessionNonce===p.retainedWrapperSessionNonce&&j.processBinding===p.processBinding&&j.sourceGuid===p.sourceGuid&&j.presetIdentity===p.presetIdentity&&hash(j.range)===hash(p.range)&&samePath(j.sourcePath,p.sourcePath)&&samePath(j.outputPath,p.outputPath)&&j.nativeAssociationVerified===true&&j.workAreaApplied===true&&j.nativeCompletionObserved===true&&j.nativeResult==="True"&&j.completionOrigin==="host_exact_paths"&&j.status==="native_finished"&&(Array.isArray(j.outputFiles)&&j.outputFiles.length===1&&samePath(j.outputFiles[0],p.outputPath)||jobs.exactTerminalXmpOutput(j,p.sourcePath,p.outputPath,t.observedAt))&&Array.isArray(j.readErrors)&&j.readErrors.length===0&&h?.result==="True"&&samePath(h.sourceFilePath,p.sourcePath)&&samePath(h.outputFilePath,p.outputPath)&&Number.isFinite(h.observedAt)&&h.observedAt>started&&h.observedAt<=t.observedAt);
  }
  function cycle(s) {
    if(!fs.existsSync(cycleFor(s.args.startRequestId)))return null;
    const proof=readFile(cycleFor(s.args.startRequestId)),r=receipt(s),p=proof.payload;
    if(!r||proof.schema!=="ae-agent-ame-global-cycle-sidecar.v1"||proof.sha25664!==hash(p)||p?.intentSha25664!==hash(identity(s))||p.dispatchReceiptSha25664!==hash(r)||p.state!=="cycle_observed_stopped"||!stopped(s,p.native)||!sameDispatch(r,p.native)||!Number.isFinite(p.native.observedAt)||p.native.observedAt<r.native.observedAt||!(p.origin==="native_events"?eventCycle(s,p.native):p.origin==="own_completion"&&ownCycle(s,r,p.native,p.own,p.selector)))fail("ame_queue_cycle_proof_changed");
    return proof;
  }
  function settle(s,r,n,own,selector) {
    const old=cycle(s);if(old)return old;
    const events=eventCycle(s,n);if(!r||!sameDispatch(r,n)||!events&&!ownCycle(s,r,n,own,selector))return null;
    const payload={state:"cycle_observed_stopped",intentSha25664:hash(identity(s)),dispatchReceiptSha25664:hash(r),origin:events?"native_events":"own_completion",native:n,...(!events?{own,selector}:{}),recordedAt:new Date(now()).toISOString()};
    write(cycleFor(s.args.startRequestId),{schema:"ae-agent-ame-global-cycle-sidecar.v1",sha25664:hash(payload),payload},true);return cycle(s);
  }
  function result(code, extra = {}) { return {schema:SCHEMA,ok:false,code,globalQueueStart:true,nativeQueueCompositionVerified:false,completionVerified:false,mediaVerified:false,automaticRetryAllowed:false,noReplay:true,observedAt:new Date(now()).toISOString(),...extra}; }
  function load(id) { if (!fs.existsSync(fileFor(id))) return null; const value = JSON.parse(fs.readFileSync(fileFor(id), "utf8")); if (value.schema !== SCHEMA || value.args.startRequestId !== id || value.argsHash !== hash(value.args) || !UUID.test(value.requestNonce || "") || !["unknown_outcome", "accepted"].includes(value.state)) fail("ame_queue_intent_corrupt_no_replay"); return value; }
  function continued(s){const directory=path.join(deps.stateDir,"intents"),names=fs.readdirSync(directory);if(names.length>4096)fail("ame_queue_intent_budget");return names.some(name=>{if(!UUID.test(name.slice(0,-5)))return false;const next=load(name.slice(0,-5));if(!next.args.resumeFromPauseId||next.state!=="accepted"&&!cycle(next))return false;const p=loadPause(next.args.resumeFromPauseId),r=receipt(next);return p.args.parentStartRequestId===s.args.startRequestId&&r?.native?.start?.parentRequestNonce===s.requestNonce&&r.native.start.resumeFromPauseId===p.args.pauseRequestId;});}
  function assertNoUnknownIntent(allowedParent=null) {
    const directory = path.join(deps.stateDir, "intents");
    if (!fs.existsSync(directory)) return;
    const files = fs.readdirSync(directory).filter(name => name.endsWith(".json"));
    if (files.length > 4096) fail("ame_queue_intent_budget");
    for (const name of files) {
      if (!UUID.test(name.slice(0, -5))) fail("ame_queue_previous_start_unknown");
      const prior=load(name.slice(0,-5));if(prior.state!=="accepted"&&!cycle(prior)&&prior.args.startRequestId!==allowedParent&&!continued(prior))fail("ame_queue_previous_start_unknown");
    }
  }
  function assertAuthorization(cap, raw) { const row=caps.get(cap),a=validateInput(row?.name||START,raw); if(!row || !row.active || row.argsHash!==hash(a))fail("ame_queue_proposal_authorization_required");deps.assertServerProposalContext(row.context);return row; }
  function authorize(context) { const name=context.record?.payload?.plan?.steps?.[0]?.tool|| (Object.hasOwn(context.args,"parentStartRequestId")?PAUSE:START),args=validateInput(name,context.args);if(![START,PAUSE].includes(name))fail("ame_queue_proposal_authorization_required");deps.assertServerProposalContext(context);const cap=Object.freeze({});caps.set(cap,{context,name,argsHash:hash(args),active:true});return cap; }
  async function pin(a, original) { const rows=await deps.inspectProcesses(); if(!Array.isArray(rows)||rows.length!==1||!running.sameProcess(rows[0],rows[0])||rows[0].pid!==a.expectedProcess.pid||new Date(rows[0].startedAt).toISOString()!==a.expectedProcess.startedAt||original&&!running.sameProcess(rows[0],original))fail("ame_queue_process_binding_changed");return rows[0]; }
  async function ready(a,p) { const read=await deps.inspectTransport({targetSpecifier:a.targetSpecifier,...(a.expectedSessionNonce===null?{}:{expectedSessionNonce:a.expectedSessionNonce}),timeoutMs:a.timeoutMs});await pin(a,p);if(read?.schema!=="ae-agent-ame-transport.v1"||read.deliveryVerified!==true||read.targetSpecifier!==a.targetSpecifier||read.ame?.sessionNonce!==a.expectedSessionNonce)fail("ame_queue_transport_readiness_unverified");return read; }
  async function send(a, stored, operation, context, reconcile = false, previousRequestNonce = null, previousCycleProof = null) {
    const requestNonce=reconcile?stored.requestNonce:crypto.randomUUID(), operationBinding=operation==="global_start"?stored.operationBinding:hash({operation,startRequestId:a.startRequestId,requestNonce});
    const {completionWitness,...pins}=a;
    const args={...pins,operation,processBinding:stored.processBinding,requestNonce,operationBinding,startRequestNonce:stored.requestNonce,startOperationBinding:stored.operationBinding,previousRequestNonce,previousCycleProof,...(stored.resume?stored.resume:{}),...(reconcile?{reconcileRequestNonce:stored.requestNonce}:{})};
    if(operation==="global_start"&&!reconcile){args.requestNonce=stored.requestNonce;args.operationBinding=stored.operationBinding;}
    await pin(a,stored.process);if(context)deps.assertServerProposalContext(context);
    if(operation==="global_start"&&!reconcile)deps.assertLegacyStartClear(stored.processBinding);
    const sentAfter=now(),script=operation==="global_start_status"?readCommandScript(args):jobs.fixedCommandScript(args,reconcile?"":messageScript(args));
    const raw=await deps.runExtendScriptBody(script,30000,{mutating:operation==="global_start"&&!reconcile});
    await pin(a,stored.process);if(context)deps.assertServerProposalContext(context);
    const reply=raw&&Object.hasOwn(raw,"result")?raw.result:raw;
    if(reply?.schema!=="ae-agent-ame-title-send.v1"||reply.requestNonce!==args.requestNonce||reply.code!=="result"||reply.callback!=="result"||typeof reply.responseBody!=="string"||Buffer.byteLength(reply.responseBody)>65536)return null;
    const n=JSON.parse(reply.responseBody);
    if(n.schema!==NATIVE_SCHEMA||n.requestNonce!==args.requestNonce||n.operationBinding!==args.operationBinding||n.appSpecifier!==a.targetSpecifier||n.sessionNonce!==a.expectedSessionNonce||!Number.isFinite(n.observedAt)||n.observedAt<(operation==="global_start_status"?sentAfter:Date.parse(stored.reservedAt))||n.observedAt>now()+60000)return null;
    if(operation==="global_start")retainReceipt(stored,n,{kind:reconcile?"retained_sender":"dispatch_callback"},reply);
    return n;
  }
  function accepted(stored,n) { const s=n?.start;return !!(s&&s.startRequestId===stored.args.startRequestId&&s.requestNonce===stored.requestNonce&&s.operationBinding===stored.operationBinding&&s.processBinding===stored.processBinding&&s.invoked===true&&s.accepted===true); }
  function loadPause(id){if(!UUID.test(id||"")||!fs.existsSync(pauseFor(id)))fail("ame_queue_pause_missing");const p=readFile(pauseFor(id));if(p.schema!=="ae-agent-ame-pause-intent.v1"||p.args.pauseRequestId!==id||p.argsHash!==hash(validateInput(PAUSE,p.args))||p.operationBinding!==hash({operation:"global_pause",args:p.args,processBinding:p.processBinding})||!UUID.test(p.requestNonce||""))fail("ame_queue_pause_changed");return p;}
  function pauseParent(p){const s=load(p.args.parentStartRequestId);if(!s||s.processBinding!==p.processBinding||!running.sameProcess(s.process,p.process)||s.args.targetSpecifier!==p.args.targetSpecifier||s.args.expectedSessionNonce!==p.args.expectedSessionNonce||processBindingFor(p.args,p.process)!==p.processBinding)fail("ame_queue_pause_parent_changed");return s;}
  function exactPause(p,s,n){const v=n?.pause;return !!(n?.schema===NATIVE_SCHEMA&&n.appSpecifier===p.args.targetSpecifier&&n.sessionNonce===p.args.expectedSessionNonce&&exactMarker(s,n)&&v?.pauseRequestId===p.args.pauseRequestId&&v.requestNonce===p.requestNonce&&v.operationBinding===p.operationBinding&&v.parentStartRequestId===s.args.startRequestId&&v.parentRequestNonce===s.requestNonce&&v.parentOperationBinding===s.operationBinding&&v.processBinding===p.processBinding&&v.invoked===true&&Number.isFinite(v.invokedAt)&&v.invokedAt>=Date.parse(p.reservedAt));}
  async function pauseSend(p,s,operation,context){
    await pin(p.args,p.process);if(context)deps.assertServerProposalContext(context);
    const requestNonce=operation==="global_pause"?p.requestNonce:crypto.randomUUID(),operationBinding=operation==="global_pause"?p.operationBinding:hash({operation,pauseRequestId:p.args.pauseRequestId,requestNonce}),r=receipt(s);
    const a={...p.args,operation,processBinding:p.processBinding,requestNonce,operationBinding,parentRequestNonce:s.requestNonce,parentOperationBinding:s.operationBinding,parentAccepted:r?.native?.start?.accepted,parentDispatchSha25664:r?hash(r):null,pauseRequestNonce:p.requestNonce,pauseOperationBinding:p.operationBinding};
    const before=now(),script=operation==="global_pause_status"?readCommandScript(a):jobs.fixedCommandScript(a,messageScript(a)),raw=await deps.runExtendScriptBody(script,30000,{mutating:operation==="global_pause"});await pin(p.args,p.process);if(context)deps.assertServerProposalContext(context);
    const reply=raw&&Object.hasOwn(raw,"result")?raw.result:raw;if(reply?.schema!=="ae-agent-ame-title-send.v1"||reply.requestNonce!==requestNonce||reply.code!=="result"||reply.callback!=="result"||typeof reply.responseBody!=="string"||Buffer.byteLength(reply.responseBody)>65536)return null;const n=JSON.parse(reply.responseBody);
    if(n.schema!==NATIVE_SCHEMA||n.requestNonce!==requestNonce||n.operationBinding!==operationBinding||!exactPause(p,s,n)||!Number.isFinite(n.observedAt)||n.observedAt<before||n.observedAt>now()+60000)return null;
    if(operation==="global_pause"&&n.code==="global_pause_invoked"&&!fs.existsSync(pauseDispatchFor(p.args.pauseRequestId)))write(pauseDispatchFor(p.args.pauseRequestId),{schema:"ae-agent-ame-pause-dispatch.v1",intentSha25664:hash(p),native:n},true);return n;
  }
  async function observePause(p){const s=pauseParent(p);await ready(p.args,p.process);const n=await pauseSend(p,s,"global_pause_status",null);let proof=null;
    if(fs.existsSync(pauseDispatchFor(p.args.pauseRequestId))){const d=readFile(pauseDispatchFor(p.args.pauseRequestId));if(d.schema!=="ae-agent-ame-pause-dispatch.v1"||d.intentSha25664!==hash(p)||!exactPause(p,s,d.native)||d.native.code!=="global_pause_invoked")fail("ame_queue_pause_dispatch_changed");if(n?.code==="global_pause_observed"&&n.batchEncoderStatus==="paused"&&n.pause.resumedByRequestNonce===null){const payload={intentSha25664:hash(p),dispatchSha25664:hash(d),native:n};proof={schema:"ae-agent-ame-paused-proof.v1",sha25664:hash(payload),payload};write(pauseProofFor(p.args.pauseRequestId),proof);}}
    return {p,s,n,proof};
  }
  function pauseResult(observed){const {p,n,proof}=observed;return result(proof?"ame_queue_pause_observed":"ame_queue_pause_unknown",{ok:!!proof,globalQueueStart:false,globalQueuePause:true,pauseObserved:!!proof,pauseRequestId:p.args.pauseRequestId,parentStartRequestId:p.args.parentStartRequestId,requestNonce:p.requestNonce,process:p.process,processBinding:p.processBinding,native:n,pauseProofSha25664:proof?.sha25664||null,statusArgs:statusArgs(PAUSE,p.args),authorization:p.authorization});}
  async function pauseQueue(a,cap){const authority=assertAuthorization(cap,a);authority.active=false;if(fs.existsSync(pauseFor(a.pauseRequestId))){const p=loadPause(a.pauseRequestId);if(p.argsHash!==hash(a))fail("ame_queue_pause_changed");return result("ame_queue_pause_already_reserved",{globalQueueStart:false,globalQueuePause:true,pauseRequestId:a.pauseRequestId,noReplay:true});}
    const s=load(a.parentStartRequestId);if(!s)fail("ame_queue_pause_parent_missing");const process=await pin(a,s.process);if(s.args.targetSpecifier!==a.targetSpecifier||s.args.expectedSessionNonce!==a.expectedSessionNonce||processBindingFor(a,process)!==s.processBinding)fail("ame_queue_pause_parent_changed");await ready(a,process);const r=receipt(s);if(!r)fail("ame_queue_pause_parent_dispatch_required");const current=await send(statusArgs(START,s.args),s,"global_start_status",null);if(!exactMarker(s,current)||!sameDispatch(r,current)||current.batchRunning!==true||current.batchEncoderStatus!=="running")fail("ame_queue_pause_parent_running_required");
    const lock=readFile(lockFor(s.processBinding));if(lock.startRequestId!==s.args.startRequestId)fail("ame_queue_pause_parent_changed");const p={schema:"ae-agent-ame-pause-intent.v1",args:a,argsHash:hash(a),process,processBinding:s.processBinding,requestNonce:crypto.randomUUID(),operationBinding:hash({operation:"global_pause",args:a,processBinding:s.processBinding}),reservedAt:new Date(now()).toISOString(),authorization:{runId:authority.context.runId,proposalId:authority.context.record.actionId}};
    deps.assertServerProposalContext(authority.context);write(pauseFor(a.pauseRequestId),p,true);await pauseSend(p,s,"global_pause",authority.context);return pauseResult(await observePause(p));
  }
  async function preparePausedEnqueue(a){const p=loadPause(a.pauseRequestId);if(p.args.targetSpecifier!==a.targetSpecifier||p.args.expectedSessionNonce!==a.expectedSessionNonce||hash(p.args.expectedProcess)!==hash(a.expectedProcess))fail("ame_queue_pause_enqueue_pins_changed");const observed=await observePause(p);if(!observed.proof)fail("ame_queue_pause_not_observed");const {s,n,proof}=observed;return Object.freeze({schema:"ae-agent-ame-paused-enqueue.v1",pauseRequestId:p.args.pauseRequestId,parentStartRequestId:s.args.startRequestId,parentRequestNonce:s.requestNonce,parentOperationBinding:s.operationBinding,pauseRequestNonce:p.requestNonce,pauseOperationBinding:p.operationBinding,processBinding:p.processBinding,targetSpecifier:a.targetSpecifier,sessionNonce:a.expectedSessionNonce,observedAt:n.observedAt,proofSha25664:proof.sha25664});}
  async function status(a) {
    if(a.pauseRequestId){const p=loadPause(a.pauseRequestId);if(p.args.parentStartRequestId!==a.startRequestId||hash(statusArgs(PAUSE,p.args))!==hash(a))fail("ame_queue_pause_selector_changed");return pauseResult(await observePause(p));}
    const stored=load(a.startRequestId);if(!stored)return result("ame_queue_intent_missing");
    const {completionWitness,...pins}=a;
    if(hash(pins)!==hash(statusArgs(START,stored.args)))fail("ame_queue_intent_binding_changed");
    await pin(a,stored.process);await ready(a,stored.process);
    // Reconcile the original sender without resend. A lost ACK never turns
    // queueRunning=false into permission to invoke runBatch again.
    let dispatch=receipt(stored);
    if(!dispatch){try{await send(a,stored,"global_start",null,true);}catch(_){/* Fresh read below still has to run. */}dispatch=receipt(stored);if(!dispatch){try{dispatch=backfillReceipt(stored);}catch(_){/* Missing/invalid evidence grants nothing; still observe current host. */}}}
    if(stored.state!=="accepted"&&accepted(stored,dispatch?.native)){stored.state="accepted";write(fileFor(a.startRequestId),stored);}
    // Never short-circuit on ACK=false: this is an independent current host read.
    let n=await send(a,stored,"global_start_status",null),proof=cycle(stored),own=null;
    if(!proof&&stored.state!=="accepted"&&dispatch&&eventCycle(stored,n))proof=settle(stored,dispatch,n,null,null);
    if(!proof&&completionWitness&&dispatch&&stopped(stored,n)&&typeof deps.inspectOwnCompletion==="function"){
      const {startRequestId,...ownPins}=pins;
      own=await deps.inspectOwnCompletion({...ownPins,batchId:completionWitness.batchId,jobId:completionWitness.jobId});
      await pin(a,stored.process);
      n=await send(a,stored,"global_start_status",null);
      proof=settle(stored,dispatch,n,own,completionWitness);
    }
    const ack=n?.code==="global_start_observed"&&accepted(stored,n),settled=!!proof&&stopped(stored,n),ok=ack||settled;
    return result(settled?"ame_queue_cycle_observed_stopped":ok?"ame_queue_start_observed":"ame_queue_start_unknown",{ok,unknownOutcome:stored.state!=="accepted",startRequestId:a.startRequestId,requestNonce:stored.requestNonce,process:stored.process,processBinding:stored.processBinding,native:n,dispatchAcceptanceVerified:ack,executionCycleObservedStopped:settled,cycleProofSha25664:proof?.sha25664||null,dispatchReceiptSha25664:dispatch?hash(dispatch):null,...(own?{completionWitnessStatus:{code:own.status?.code,pending:own.status?.pending===true,currentStatusObserved:own.status?.currentStatusObserved===true}}:{})});
  }
  async function start(a,cap) {
    const authority=assertAuthorization(cap,a);authority.active=false;
    const old=load(a.startRequestId);if(old){if(old.argsHash!==hash(a))fail("ame_queue_intent_binding_changed");return result("ame_queue_start_already_reserved",{unknownOutcome:old.state!=="accepted",startRequestId:a.startRequestId,requestNonce:old.requestNonce,noReplay:true});}
    const resumePause=a.resumeFromPauseId?loadPause(a.resumeFromPauseId):null;
    assertNoUnknownIntent(resumePause?.args.parentStartRequestId||null);
    const process=await pin(a),transport=await ready(a,process);deps.assertServerProposalContext(authority.context);
    if(!resumePause&&transport.ame?.reads?.isBatchRunning!==false)fail("ame_queue_stopped_state_required");
    const processBinding=processBindingFor(a,process);deps.assertLegacyStartClear(processBinding);
    const lockFile=lockFor(processBinding);let previous=null,resume=null,group=null;
    if(resumePause){
      if(resumePause.processBinding!==processBinding||typeof deps.inspectPausedGroup!=="function"||typeof deps.assertPausedGroup!=="function")fail("ame_queue_resume_private_group_required");
      const ref=await preparePausedEnqueue({...a,pauseRequestId:a.resumeFromPauseId});
      group=await deps.inspectPausedGroup({...a,pauseRequestId:a.resumeFromPauseId});
      if(group?.verified!==true||group.members?.length<1||group.members.length>11)fail("ame_queue_resume_group_unverified");
      const fresh=await preparePausedEnqueue({...a,pauseRequestId:a.resumeFromPauseId});
      if(fresh.parentRequestNonce!==ref.parentRequestNonce||fresh.pauseRequestNonce!==ref.pauseRequestNonce)fail("ame_queue_resume_pause_changed");
      resume={parentStartRequestId:fresh.parentStartRequestId,parentRequestNonce:fresh.parentRequestNonce,parentOperationBinding:fresh.parentOperationBinding,pauseRequestId:fresh.pauseRequestId,pauseRequestNonce:fresh.pauseRequestNonce,pauseOperationBinding:fresh.pauseOperationBinding,resumePauseProof:fresh,resumeMembers:group.members};
    }
    if(fs.existsSync(lockFile)) {
      const lock=JSON.parse(fs.readFileSync(lockFile,"utf8"));previous=load(lock.startRequestId);
      if(!previous||previous.processBinding!==processBinding||resume&&previous.args.startRequestId!==resume.parentStartRequestId||!resume&&previous.state!=="accepted"&&!cycle(previous))fail("ame_queue_previous_start_unknown");
      if(!resume){const observed=await status(validateInput(STATUS,statusArgs(START,previous.args)));if(!observed.ok||observed.native.batchRunning!==false||observed.native.batchEncoderStatus==="paused")fail("ame_queue_previous_start_not_stopped");}
    }
    if(resume&&!previous)fail("ame_queue_resume_parent_lock_missing");
    deps.assertServerProposalContext(authority.context);if(group)deps.assertPausedGroup({...a,pauseRequestId:a.resumeFromPauseId},group);
    const stored={schema:SCHEMA,args:a,argsHash:hash(a),process,processBinding,requestNonce:crypto.randomUUID(),operationBinding:hash({operation:"global_start",args:a,processBinding}),state:"unknown_outcome",reservedAt:new Date(now()).toISOString(),authorization:{runId:authority.context.runId,proposalId:authority.context.record.actionId},...(resume?{resume}:{})};
    // The binding lock is never removed. Its next owner requires proven prior
    // acceptance and fresh stopped status; intents remain permanently once-only.
    write(fileFor(a.startRequestId),stored,true);
    if(!previous)write(lockFile,{startRequestId:a.startRequestId},true);else write(lockFile,{startRequestId:a.startRequestId});
    const previousCycle=previous&&cycle(previous),previousCycleProof=previousCycle?{schema:"ae-agent-ame-cycle-release.v1",startRequestId:previous.args.startRequestId,requestNonce:previous.requestNonce,operationBinding:previous.operationBinding,processBinding:previous.processBinding,accepted:previousCycle.payload.native.start.accepted,observedAt:previousCycle.payload.native.observedAt,sidecarSha25664:previousCycle.sha25664}:null;
    const n=await send(a,stored,"global_start",authority.context,false,previous?.requestNonce||null,previousCycleProof);
    if(n?.code==="global_start_accepted"&&accepted(stored,n)){stored.state="accepted";write(fileFor(a.startRequestId),stored);}
    return result(stored.state==="accepted"?"ame_queue_start_accepted":"ame_queue_start_unknown",{ok:stored.state==="accepted",unknownOutcome:stored.state!=="accepted",startRequestId:a.startRequestId,requestNonce:stored.requestNonce,process,processBinding,native:n,authorization:stored.authorization,dispatchAcceptanceVerified:stored.state==="accepted"});
  }
  async function execute(name,raw,cap) {const a=validateInput(name,raw);if(busy)fail("ame_queue_writer_busy");busy=true;try{return await(name===START?start(a,cap):name===PAUSE?pauseQueue(a,cap):status(a));}catch(error){const stored=a.startRequestId?load(a.startRequestId):null;return result(error.code||"ame_queue_unknown",{error:String(error.message).slice(0,1000),...(stored?{unknownOutcome:true,startRequestId:a.startRequestId,requestNonce:stored.requestNonce,noReplay:true}:{})});}finally{busy=false;}}
  return {authorize,assertAuthorization:(cap,raw)=>!!assertAuthorization(cap,raw),execute,preparePausedEnqueue};
}
function verifyReadBack(args,payload,read,run) {
  if(Object.hasOwn(args,"parentStartRequestId")){
    const a=validateInput(PAUSE,args),p=payload?.native,r=read?.native,v=p?.pause,w=r?.pause;
    return !!(payload?.schema===SCHEMA&&payload.ok===true&&payload.code==="ame_queue_pause_observed"&&payload.pauseObserved===true&&read?.schema===SCHEMA&&read.ok===true&&read.pauseObserved===true&&payload.pauseRequestId===a.pauseRequestId&&read.pauseRequestId===a.pauseRequestId&&payload.parentStartRequestId===a.parentStartRequestId&&read.parentStartRequestId===a.parentStartRequestId&&payload.authorization?.runId===run?.id&&payload.authorization?.proposalId===run?.provenance?.actionId&&payload.processBinding===processBindingFor(a,payload.process)&&running.sameProcess(payload.process,read.process)&&p.schema===NATIVE_SCHEMA&&r.schema===NATIVE_SCHEMA&&p.code==="global_pause_observed"&&r.code==="global_pause_observed"&&p.batchEncoderStatus==="paused"&&r.batchEncoderStatus==="paused"&&p.requestNonce!==r.requestNonce&&p.appSpecifier===a.targetSpecifier&&r.appSpecifier===a.targetSpecifier&&p.sessionNonce===a.expectedSessionNonce&&r.sessionNonce===a.expectedSessionNonce&&v?.pauseRequestId===a.pauseRequestId&&v.invoked===true&&v.requestNonce===payload.requestNonce&&v.processBinding===payload.processBinding&&v.parentStartRequestId===a.parentStartRequestId&&v.resumedByRequestNonce===null&&hash(v)===hash(w)&&Number.isFinite(p.observedAt)&&r.observedAt>=p.observedAt&&/^[a-f0-9]{64}$/.test(payload.pauseProofSha25664||"")&&/^[a-f0-9]{64}$/.test(read.pauseProofSha25664||""));
  }
  const a=validateInput(START,args),n=payload?.native,r=read?.native,s=n?.start;
  return !!(payload.schema===SCHEMA&&payload.ok===true&&payload.code==="ame_queue_start_accepted"&&payload.globalQueueStart===true&&payload.dispatchAcceptanceVerified===true&&
    payload.startRequestId===a.startRequestId&&payload.process?.pid===a.expectedProcess.pid&&payload.process?.startedAt===a.expectedProcess.startedAt&&payload.processBinding===processBindingFor(a,payload.process)&&
    payload.authorization?.runId===run?.id&&payload.authorization?.proposalId===run?.provenance?.actionId&&s?.invoked===true&&s.accepted===true&&
    s.startRequestId===a.startRequestId&&s.requestNonce===payload.requestNonce&&s.processBinding===payload.processBinding&&s.operationBinding===hash({operation:"global_start",args:a,processBinding:payload.processBinding})&&
    read.schema===SCHEMA&&read.ok===true&&read.code==="ame_queue_start_observed"&&read.startRequestId===a.startRequestId&&read.requestNonce===payload.requestNonce&&
    running.sameProcess(payload.process,read.process)&&payload.processBinding===read.processBinding&&n.schema===NATIVE_SCHEMA&&r?.schema===NATIVE_SCHEMA&&
    n.code==="global_start_accepted"&&r.code==="global_start_observed"&&n.requestNonce===payload.requestNonce&&r.requestNonce!==n.requestNonce&&
    n.appSpecifier===a.targetSpecifier&&r.appSpecifier===a.targetSpecifier&&n.sessionNonce===a.expectedSessionNonce&&r.sessionNonce===a.expectedSessionNonce&&
    n.operationBinding===s.operationBinding&&r.start?.invoked===true&&r.start.accepted===true&&r.start.startRequestId===s.startRequestId&&r.start.requestNonce===s.requestNonce&&r.start.operationBinding===s.operationBinding&&r.start.processBinding===s.processBinding&&Number.isFinite(n.observedAt)&&Number.isFinite(r.observedAt)&&r.observedAt>=n.observedAt&&payload.nativeQueueCompositionVerified===false&&payload.mediaVerified===false);
}
const properties={targetSpecifier:{type:"string",pattern:"^ame-[0-9]{1,3}\\.[0-9]{1,3}$"},expectedProcess:jobs.tools[0].inputSchema.properties.expectedProcess,expectedSessionNonce:{type:["string","null"]},timeoutMs:{type:"integer",minimum:1000,maximum:10000},startRequestId:{type:"string",pattern:UUID.source}};
const tools=[{name:START,description:"Explicit global AME runBatch() for the whole ready queue, including user jobs. Independent of title count/batches; no item enumeration, enqueue, media/preset proof or completion pipeline. Requires separate isolated server proposal, dry-run and current manual/autonomous grant. Durable once intent prevents replay. A different START requires prior ACK or a private observed-stopped cycle proof plus a fresh stopped read.",inputSchema:{type:"object",additionalProperties:false,required:["targetSpecifier","expectedProcess","expectedSessionNonce","startRequestId","globalQueue"],properties:{...properties,globalQueue:{type:"boolean",enum:[true]}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},{name:STATUS,description:"Independently read one exact retained global START marker and fresh host running/status even if its ACK was false. Never runBatch or enqueue. Optional completionWitness selects one own batchId/jobId for an internal fresh typed completion read; accepts no caller proof. Only exact pre-START acceptance plus post-START host completion, or retained running-to-stopped events, can create a private cycle sidecar. The original dispatch UNKNOWN/false ACK and permanent noReplay remain unchanged. Stopped/files alone never release a new START.",inputSchema:{type:"object",additionalProperties:false,required:["targetSpecifier","expectedProcess","expectedSessionNonce","startRequestId"],properties:{...properties,completionWitness:{type:"object",additionalProperties:false,required:["batchId","jobId"],properties:{batchId:{type:"string",pattern:UUID.source},jobId:{type:"string",pattern:UUID.source}}}}},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:false}}];
tools[0].inputSchema.properties.resumeFromPauseId={type:"string",pattern:UUID.source};
tools[0].description+=" resumeFromPauseId explicitly continues one privately observed pause with a NEW startRequestId, after all tied group originals have exact terminal addDL/work-area ACK; never replays its parent START.";
tools[1].inputSchema.properties.pauseRequestId={type:"string",pattern:UUID.source};
tools[1].description+=" Optional pauseRequestId selects the exact child pause of startRequestId. A fresh retained invoked marker plus host status paused creates private enqueue proof; ACK alone grants nothing.";
const {startRequestId:unusedStart,...pauseProperties}=properties;
tools.push({name:PAUSE,description:"Explicit once-only pauseBatch for one exact current invoked global START. Requires isolated proposal/dry-run/grant and a fresh running sample matching its authoritative dispatch receipt. Independent STATUS must verify the same pause marker and paused host state; pause ACK alone is not proof. Never enqueues or resumes.",inputSchema:{type:"object",additionalProperties:false,required:["targetSpecifier","expectedProcess","expectedSessionNonce","pauseRequestId","parentStartRequestId","globalQueue"],properties:{...pauseProperties,pauseRequestId:{type:"string",pattern:UUID.source},parentStartRequestId:{type:"string",pattern:UUID.source},globalQueue:{type:"boolean",enum:[true]}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}});
module.exports={START,PAUSE,MUTATIONS:[START,PAUSE],STATUS,SCHEMA,NATIVE_SCHEMA,tools,validateInput,statusArgs,assertProposalContext,readLegacyStartBlockers,createExecutor,messageScript,verifyReadBack};

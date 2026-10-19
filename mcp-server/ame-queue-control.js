"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const jobs = require("./ame-title-jobs"), running = require("./ame-running"), protocol = require("./m100-protocol");
const START = "start_ame_queue", STATUS = "get_ame_queue_start_status", SCHEMA = "ae-agent-ame-queue-start.v1", NATIVE_SCHEMA = "ae-agent-ame-global-start-native.v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = value => crypto.createHash("sha256").update(protocol.stableStringify(value)).digest("hex");
const processBindingFor = (a, p) => crypto.createHash("sha256").update(JSON.stringify({ target: a.targetSpecifier, session: a.expectedSessionNonce, pid: p.pid, startedAt: p.startedAt, path: String(p.path).replace(/\\/g, "/").toLowerCase() })).digest("hex");
function fail(code) { throw Object.assign(Error(code), { code }); }
function validateInput(name, raw = {}) {
  if (![START, STATUS].includes(name) || !raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(k => !["targetSpecifier", "expectedProcess", "expectedSessionNonce", "timeoutMs", "startRequestId", ...(name === START ? ["globalQueue", "verifyAfter", "idempotencyKey", "idempotencyScope", "checkpointLabel", "autoCheckpoint"] : [])].includes(k))) fail("ame_queue_invalid_input");
  const base = jobs.validateInput(jobs.STATUS, { targetSpecifier: raw.targetSpecifier, expectedProcess: raw.expectedProcess, expectedSessionNonce: raw.expectedSessionNonce,
    timeoutMs: raw.timeoutMs, batchId: "00000000-0000-4000-8000-000000000000", jobId: "00000000-0000-4000-8000-000000000000" });
  if (!Object.hasOwn(base, "expectedSessionNonce") || !UUID.test(raw.startRequestId || "") || name === START && raw.globalQueue !== true) fail("ame_queue_explicit_global_intent_required");
  if (name === START && raw.verifyAfter === false) fail("ame_queue_independent_readback_required");
  delete base.batchId; delete base.jobId;
  return { ...base, startRequestId: raw.startRequestId, ...(name === START ? { globalQueue: true } : {}) };
}
function write(file, value, exclusive = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = exclusive ? file : file + "." + crypto.randomUUID() + ".tmp", fd = fs.openSync(temporary, "wx");
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } if (!exclusive) fs.renameSync(temporary, file);
}
// Fixed ES3 program. Only queueRunning and our global START marker are read.
// It never accesses the title wrapper slot, frontend, queue items or files.
function nativeGlobalStart(a) {
  function str(v) { var out = [], key, i; if (v === null || v === undefined) return "null"; if (typeof v === "boolean" || typeof v === "number") return String(v); if (typeof v === "string") { var s='"'; for(i=0;i<v.length;i++){var c=v.charCodeAt(i);if(c===34||c===92)s+='\\'+v.charAt(i);else if(c<32||c===8232||c===8233){var h=c.toString(16);while(h.length<4)h="0"+h;s+='\\u'+h;}else s+=v.charAt(i);}return s+'"'; } for(key in v)if(Object.prototype.hasOwnProperty.call(v,key))out.push(str(key)+":"+str(v[key]));return "{"+out.join(",")+"}"; }
  var reply = {schema:"ae-agent-ame-global-start-native.v1",requestNonce:a.requestNonce,operationBinding:a.operationBinding,appSpecifier:String(BridgeTalk.appSpecifier),sessionNonce:$.global.aeAgentAMEProbeSessionNonce || null,observedAt:new Date().getTime(),batchRunning:null,start:null,code:"unknown"};
  function done(code){reply.code=code;return str(reply);}
  if(reply.appSpecifier!==a.targetSpecifier || reply.sessionNonce!==a.expectedSessionNonce)return done("target_session_changed");
  var host, marker=$.global.aeAgentAMEGlobalQueueStartV1;
  if(typeof app.getEncoderHost!=="function")return done("encoder_host_unsupported");host=app.getEncoderHost();
  if(!host || typeof host.isBatchRunning!=="function")return done("batch_running_unknown");
  reply.batchRunning=host.isBatchRunning();
  if(typeof reply.batchRunning!=="boolean")return done("batch_running_unknown");
  if(a.operation==="global_start_status") {
    if(!marker || marker.startRequestId!==a.startRequestId || marker.processBinding!==a.processBinding || marker.requestNonce!==a.startRequestNonce)return done("global_start_marker_unavailable");
    reply.start=marker;return done("global_start_observed");
  }
  if(a.operation!=="global_start")return done("operation_invalid");
  if(marker && marker.startRequestId===a.startRequestId){reply.start=marker;return done("global_start_already_reserved");}
  if(marker && (marker.processBinding!==a.processBinding || marker.requestNonce!==a.previousRequestNonce || marker.accepted!==true))return done("previous_global_start_unresolved");
  if(reply.batchRunning!==false)return done("batch_running_or_unknown");
  if(typeof host.runBatch!=="function")return done("run_batch_unsupported");
  marker={startRequestId:a.startRequestId,requestNonce:a.requestNonce,operationBinding:a.operationBinding,processBinding:a.processBinding,invoked:true,accepted:null};
  $.global.aeAgentAMEGlobalQueueStartV1=marker;reply.start=marker;
  var accepted=host.runBatch();marker.accepted=accepted===true?true:accepted===false?false:null;
  return done(marker.accepted===true?"global_start_accepted":"global_start_unknown");
}
function messageScript(a) { return "(" + nativeGlobalStart.toString() + ")(" + JSON.stringify(a) + ");"; }
function assertProposalContext(context, currentRecord, contractVersion) {
  running.assertProposalContext(context, currentRecord, contractVersion);
  const plan = context.record.payload?.plan, step = plan?.steps?.[0];
  if (step?.tool !== START || plan.runtimeBindings || step.resultBindings || step.bindings || plan.montagePipeline ||
      context.record.payloadHash !== protocol.sha256Payload(context.record.payload) || hash(validateInput(START, step.args || {})) !== hash(validateInput(START, context.args))) fail("ame_queue_exact_proposal_required");
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
  function result(code, extra = {}) { return {schema:SCHEMA,ok:false,code,globalQueueStart:true,nativeQueueCompositionVerified:false,completionVerified:false,mediaVerified:false,automaticRetryAllowed:false,noReplay:true,observedAt:new Date(now()).toISOString(),...extra}; }
  function load(id) { if (!fs.existsSync(fileFor(id))) return null; const value = JSON.parse(fs.readFileSync(fileFor(id), "utf8")); if (value.schema !== SCHEMA || value.args.startRequestId !== id || value.argsHash !== hash(value.args) || !UUID.test(value.requestNonce || "") || !["unknown_outcome", "accepted"].includes(value.state)) fail("ame_queue_intent_corrupt_no_replay"); return value; }
  function assertNoUnknownIntent() {
    const directory = path.join(deps.stateDir, "intents");
    if (!fs.existsSync(directory)) return;
    const files = fs.readdirSync(directory).filter(name => name.endsWith(".json"));
    if (files.length > 4096) fail("ame_queue_intent_budget");
    for (const name of files) {
      if (!UUID.test(name.slice(0, -5)) || load(name.slice(0, -5)).state !== "accepted") fail("ame_queue_previous_start_unknown");
    }
  }
  function assertAuthorization(cap, raw) { const a=validateInput(START,raw),row=caps.get(cap); if(!row || !row.active || row.argsHash!==hash(a))fail("ame_queue_proposal_authorization_required");deps.assertServerProposalContext(row.context);return row; }
  function authorize(context) { const args=validateInput(START,context.args);deps.assertServerProposalContext(context);const cap=Object.freeze({});caps.set(cap,{context,argsHash:hash(args),active:true});return cap; }
  async function pin(a, original) { const rows=await deps.inspectProcesses(); if(!Array.isArray(rows)||rows.length!==1||!running.sameProcess(rows[0],rows[0])||rows[0].pid!==a.expectedProcess.pid||new Date(rows[0].startedAt).toISOString()!==a.expectedProcess.startedAt||original&&!running.sameProcess(rows[0],original))fail("ame_queue_process_binding_changed");return rows[0]; }
  async function ready(a,p) { const read=await deps.inspectTransport({targetSpecifier:a.targetSpecifier,...(a.expectedSessionNonce===null?{}:{expectedSessionNonce:a.expectedSessionNonce}),timeoutMs:a.timeoutMs});await pin(a,p);if(read?.schema!=="ae-agent-ame-transport.v1"||read.deliveryVerified!==true||read.targetSpecifier!==a.targetSpecifier||read.ame?.sessionNonce!==a.expectedSessionNonce)fail("ame_queue_transport_readiness_unverified");return read; }
  async function send(a, stored, operation, context, reconcile = false, previousRequestNonce = null) {
    const requestNonce=reconcile?stored.requestNonce:crypto.randomUUID(), operationBinding=operation==="global_start"?stored.operationBinding:hash({operation,startRequestId:a.startRequestId,requestNonce});
    const args={...a,operation,processBinding:stored.processBinding,requestNonce,operationBinding,startRequestNonce:stored.requestNonce,previousRequestNonce,...(reconcile?{reconcileRequestNonce:stored.requestNonce}:{})};
    if(operation==="global_start"&&!reconcile){args.requestNonce=stored.requestNonce;args.operationBinding=stored.operationBinding;}
    await pin(a,stored.process);if(context)deps.assertServerProposalContext(context);
    if(operation==="global_start"&&!reconcile)deps.assertLegacyStartClear(stored.processBinding);
    const raw=await deps.runExtendScriptBody(jobs.fixedCommandScript(args,reconcile?"":messageScript(args)),30000,{mutating:operation==="global_start"&&!reconcile});
    await pin(a,stored.process);if(context)deps.assertServerProposalContext(context);
    const reply=raw&&Object.hasOwn(raw,"result")?raw.result:raw;
    if(reply?.schema!=="ae-agent-ame-title-send.v1"||reply.requestNonce!==args.requestNonce||reply.code!=="result"||reply.callback!=="result"||typeof reply.responseBody!=="string"||Buffer.byteLength(reply.responseBody)>65536)return null;
    const n=JSON.parse(reply.responseBody);
    if(n.schema!==NATIVE_SCHEMA||n.requestNonce!==args.requestNonce||n.operationBinding!==args.operationBinding||n.appSpecifier!==a.targetSpecifier||n.sessionNonce!==a.expectedSessionNonce||!Number.isFinite(n.observedAt)||n.observedAt<Date.parse(stored.reservedAt)||n.observedAt>now()+60000)return null;
    return n;
  }
  function accepted(stored,n) { const s=n?.start;return !!(s&&s.startRequestId===stored.args.startRequestId&&s.requestNonce===stored.requestNonce&&s.operationBinding===stored.operationBinding&&s.processBinding===stored.processBinding&&s.invoked===true&&s.accepted===true); }
  async function status(a) {
    const stored=load(a.startRequestId);if(!stored)return result("ame_queue_intent_missing");
    if(hash({...a,globalQueue:true})!==stored.argsHash)fail("ame_queue_intent_binding_changed");
    await pin(a,stored.process);await ready(a,stored.process);
    // Reconcile the original sender without resend. A lost ACK never turns
    // queueRunning=false into permission to invoke runBatch again.
    if(stored.state!=="accepted") { const original=await send(a,stored,"global_start",null,true);if(!accepted(stored,original))return result("ame_queue_start_unknown",{unknownOutcome:true,startRequestId:a.startRequestId,requestNonce:stored.requestNonce});stored.state="accepted";write(fileFor(a.startRequestId),stored); }
    const n=await send(a,stored,"global_start_status",null);
    const ok=n?.code==="global_start_observed"&&accepted(stored,n);
    return result(ok?"ame_queue_start_observed":"ame_queue_start_unknown",{ok,unknownOutcome:!ok,startRequestId:a.startRequestId,requestNonce:stored.requestNonce,process:stored.process,processBinding:stored.processBinding,native:n,dispatchAcceptanceVerified:ok});
  }
  async function start(a,cap) {
    const authority=assertAuthorization(cap,a);authority.active=false;
    const old=load(a.startRequestId);if(old){if(old.argsHash!==hash(a))fail("ame_queue_intent_binding_changed");return result("ame_queue_start_already_reserved",{unknownOutcome:old.state!=="accepted",startRequestId:a.startRequestId,requestNonce:old.requestNonce,noReplay:true});}
    assertNoUnknownIntent();
    const process=await pin(a),transport=await ready(a,process);deps.assertServerProposalContext(authority.context);
    if(transport.ame?.reads?.isBatchRunning!==false)fail("ame_queue_stopped_state_required");
    const processBinding=processBindingFor(a,process);deps.assertLegacyStartClear(processBinding);
    const lockFile=lockFor(processBinding);let previous=null;
    if(fs.existsSync(lockFile)) {
      const lock=JSON.parse(fs.readFileSync(lockFile,"utf8"));previous=load(lock.startRequestId);
      if(!previous||previous.processBinding!==processBinding||previous.state!=="accepted")fail("ame_queue_previous_start_unknown");
      const {globalQueue,...previousReadArgs}=previous.args;
      const observed=await status(validateInput(STATUS,previousReadArgs));if(!observed.ok||observed.native.batchRunning!==false)fail("ame_queue_previous_start_not_stopped");
    }
    const stored={schema:SCHEMA,args:a,argsHash:hash(a),process,processBinding,requestNonce:crypto.randomUUID(),operationBinding:hash({operation:"global_start",args:a,processBinding}),state:"unknown_outcome",reservedAt:new Date(now()).toISOString(),authorization:{runId:authority.context.runId,proposalId:authority.context.record.actionId}};
    // The binding lock is never removed. Its next owner requires proven prior
    // acceptance and fresh stopped status; intents remain permanently once-only.
    write(fileFor(a.startRequestId),stored,true);
    if(!previous)write(lockFile,{startRequestId:a.startRequestId},true);else write(lockFile,{startRequestId:a.startRequestId});
    const n=await send(a,stored,"global_start",authority.context,false,previous?.requestNonce||null);
    if(n?.code==="global_start_accepted"&&accepted(stored,n)){stored.state="accepted";write(fileFor(a.startRequestId),stored);}
    return result(stored.state==="accepted"?"ame_queue_start_accepted":"ame_queue_start_unknown",{ok:stored.state==="accepted",unknownOutcome:stored.state!=="accepted",startRequestId:a.startRequestId,requestNonce:stored.requestNonce,process,processBinding,native:n,authorization:stored.authorization,dispatchAcceptanceVerified:stored.state==="accepted"});
  }
  async function execute(name,raw,cap) {const a=validateInput(name,raw);if(busy)fail("ame_queue_writer_busy");busy=true;try{return await(name===START?start(a,cap):status(a));}catch(error){const stored=load(a.startRequestId);return result(error.code||"ame_queue_unknown",{error:String(error.message).slice(0,1000),...(stored?{unknownOutcome:true,startRequestId:a.startRequestId,requestNonce:stored.requestNonce,noReplay:true}:{})});}finally{busy=false;}}
  return {authorize,assertAuthorization:(cap,raw)=>!!assertAuthorization(cap,raw),execute};
}
function verifyReadBack(args,payload,read,run) {
  const a=validateInput(START,args),n=payload?.native,r=read?.native,s=n?.start;
  return !!(payload.schema===SCHEMA&&payload.ok===true&&payload.code==="ame_queue_start_accepted"&&payload.globalQueueStart===true&&payload.dispatchAcceptanceVerified===true&&
    payload.startRequestId===a.startRequestId&&payload.process?.pid===a.expectedProcess.pid&&payload.process?.startedAt===a.expectedProcess.startedAt&&payload.processBinding===processBindingFor(a,payload.process)&&
    payload.authorization?.runId===run?.id&&payload.authorization?.proposalId===run?.provenance?.actionId&&s?.invoked===true&&s.accepted===true&&
    s.startRequestId===a.startRequestId&&s.requestNonce===payload.requestNonce&&s.processBinding===payload.processBinding&&s.operationBinding===hash({operation:"global_start",args:a,processBinding:payload.processBinding})&&
    read.schema===SCHEMA&&read.ok===true&&read.code==="ame_queue_start_observed"&&read.startRequestId===a.startRequestId&&read.requestNonce===payload.requestNonce&&
    running.sameProcess(payload.process,read.process)&&payload.processBinding===read.processBinding&&n.schema===NATIVE_SCHEMA&&r?.schema===NATIVE_SCHEMA&&
    n.code==="global_start_accepted"&&r.code==="global_start_observed"&&n.requestNonce===payload.requestNonce&&r.requestNonce!==n.requestNonce&&
    n.appSpecifier===a.targetSpecifier&&r.appSpecifier===a.targetSpecifier&&n.sessionNonce===a.expectedSessionNonce&&r.sessionNonce===a.expectedSessionNonce&&
    n.operationBinding===s.operationBinding&&hash(s)===hash(r.start)&&Number.isFinite(n.observedAt)&&Number.isFinite(r.observedAt)&&r.observedAt>=n.observedAt&&payload.nativeQueueCompositionVerified===false&&payload.mediaVerified===false);
}
const properties={targetSpecifier:{type:"string",pattern:"^ame-[0-9]{1,3}\\.[0-9]{1,3}$"},expectedProcess:jobs.tools[0].inputSchema.properties.expectedProcess,expectedSessionNonce:{type:["string","null"]},timeoutMs:{type:"integer",minimum:1000,maximum:10000},startRequestId:{type:"string",pattern:UUID.source}};
const tools=[{name:START,description:"Explicit global AME runBatch() for the whole ready queue, including user jobs. Independent of title count/batches; no item enumeration, enqueue, media/preset proof or completion pipeline. Requires separate isolated server proposal, dry-run and current manual/autonomous grant. Durable once intent and UNKNOWN locks prevent replay.",inputSchema:{type:"object",additionalProperties:false,required:["targetSpecifier","expectedProcess","expectedSessionNonce","startRequestId","globalQueue"],properties:{...properties,globalQueue:{type:"boolean",enum:[true]}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},{name:STATUS,description:"Read/reconcile only one exact global START intent and retained native marker. Never runBatch, enqueue or inspect individual jobs. Reconciles a retained terminal sender reply; a missing native callback remains UNKNOWN/noReplay and blocks subsequent intents across restarts. Stopped alone is never proof a lost START did not execute.",inputSchema:{type:"object",additionalProperties:false,required:["targetSpecifier","expectedProcess","expectedSessionNonce","startRequestId"],properties},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:false}}];
module.exports={START,STATUS,SCHEMA,NATIVE_SCHEMA,tools,validateInput,assertProposalContext,readLegacyStartBlockers,createExecutor,messageScript,verifyReadBack};

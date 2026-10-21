"use strict";

const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{AsyncLocalStorage}=require("node:async_hooks");
const ledger=require("./native-fixture-attempt-ledger"),r1=require("./owned-runtime-lifecycle"),authority=require("./owned-runtime-authority");
const SCHEMA="ae-agent.owned-runtime-service.v1",OPERATIONS=Object.freeze(["drain","shutdown"]);
function fail(code){throw Object.assign(Error(code),{code});}
function operationKey(v){return r1.hash({targetGeneration:v.targetGeneration,operation:v.operation,desiredSourceSha256:v.desiredSourceSha256});}
function operationDirectory(root,id){if(!ledger.UUID.test(id || ""))fail("owned_service_operation_selector_invalid");return path.join(root,"daemon-operations",id);}
function validateOperationIntent(v){authority.exact(v,["schema","operationId","targetGeneration","operation","desiredSourceSha256","authorizationRef","createdAt","replayAllowed"],"owned_service_intent_invalid");if(v.schema!==SCHEMA+".intent" || !ledger.UUID.test(v.operationId || "") || !ledger.UUID.test(v.targetGeneration || "") || !OPERATIONS.includes(v.operation) || !ledger.SHA.test(v.desiredSourceSha256 || "") || v.authorizationRef?.source!=="explicit_user_chat" || typeof v.authorizationRef.reference!=="string" || !v.authorizationRef.reference || !Number.isFinite(Date.parse(v.createdAt)) || v.replayAllowed!==false)fail("owned_service_intent_invalid");return v;}
function reserveOperation(root,input){
  const v=validateOperationIntent(input),key=operationKey(v),keys=path.join(root,"daemon-operation-keys"),file=path.join(keys,key+".json");ledger.ensure(keys);
  if(fs.existsSync(file)){const existing=JSON.parse(ledger.readBytes(file));if(existing.schema!==SCHEMA+".operation-key" || existing.key!==key || !ledger.UUID.test(existing.operationId || ""))fail("owned_service_operation_key_corrupt");return {consumed:true,operationId:existing.operationId,key};}
  const fd=fs.openSync(file,"wx",0o600);try{fs.writeFileSync(fd,JSON.stringify({schema:SCHEMA+".operation-key",key,operationId:v.operationId,replayAllowed:false}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  const dir=operationDirectory(root,v.operationId);ledger.ensure(dir);const intent=r1.writeJournalOnce(dir,"intent",v);return {consumed:false,operationId:v.operationId,key,intent};
}
function readOperation(root,id){const dir=operationDirectory(root,id);if(!fs.existsSync(dir))fail("owned_service_private_operation_required");ledger.safeDirectory(dir);const rows={};for(const name of fs.readdirSync(dir)){if(!["intent.json","drain-ack.json","shutdown-ack.json"].includes(name))fail("owned_service_partial_or_foreign_operation");const row=JSON.parse(ledger.readBytes(path.join(dir,name)));if(row.schema!==r1.SCHEMA+".envelope" || r1.hash(row.value)!==row.sha256)fail("owned_service_operation_corrupt");rows[name.slice(0,-5)]=row;}validateOperationIntent(rows.intent?.value);const v=rows.intent.value,key=operationKey(v),keyRow=JSON.parse(ledger.readBytes(path.join(root,"daemon-operation-keys",key+".json")));if(keyRow.key!==key || keyRow.operationId!==id || v.operationId!==id)fail("owned_service_operation_key_mismatch");return rows;}
function ingressKind(req){
  let url;try{url=new URL(req.url,"http://127.0.0.1");}catch(_){return "execution";}
  const p=url.pathname;
  if(p.startsWith("/runtime/owned/"))return "control";
  if(req.method==="GET" && ["/bridge/next","/next"].includes(p))return "passive_wait";
  if(req.method==="OPTIONS" || req.method==="GET")return "observation";
  if(req.method==="POST" && ["/bridge/bootstrap-recovery-epoch","/bridge/reset-session","/bridge/heartbeat","/bridge/result","/bridge/submitted","/bridge/command-state","/bridge/results","/heartbeat","/result","/command/state"].includes(p))return "completion";
  // Tool bodies are unknown before the body await. A pre-drain ticket has
  // execution entitlement; a post-drain ticket can only read/complete.
  if(req.method==="POST" && ["/tools/call","/mcp/tools/call"].includes(p))return "intake";
  if(req.method==="POST" && ["/ame/native-fixture-abandonment/capture","/ame/native-fixture-abandonment/authorize","/ame/native-fixture-abandonment/retire"].includes(p))return "intake";
  return "execution";
}
function createOwnedRuntimeService({initialRuntime=null,generation=null,readRegistration,readAdmission,journalRoot,readPolicy,readReadiness,readProductStopAuthority,closeServer,closeIdleWaiters,now=Date.now}={}) {
  const initialApi=require("./owned-runtime-initial-runtime"),initial=initialRuntime===null?initialApi.createInitialRuntime():initialApi.assertInitialRuntime(initialRuntime);
  if(initial){
    initialApi.assertInitialRuntime(initial);
    // No retained registration/admission OR, HTTP method heuristic or nested
    // executionContext can reach a handler while the native protocol is absent.
    return Object.freeze({run:()=>{initial.assertIngress();},ingress:()=>{initial.assertIngress();},assertExecutionTicket:initial.assertCommand,assertCommandTicket:initial.assertCommand,status:initial.status,readiness:initial.readiness,drainOnce:()=>{initial.assertIngress();},shutdownOnce:()=>{initial.assertIngress();}});
  }
  if(typeof journalRoot!=="string" || typeof readPolicy!=="function" || typeof readReadiness!=="function")fail("owned_service_private_dependencies_required");
  if(generation!==null && !ledger.UUID.test(generation || ""))fail("owned_service_generation_invalid");
  const context=new AsyncLocalStorage(),tickets=new Set();let draining=false,closing=false,drainOperation=null,shutdownEffectPending=null;
  function registration(){return typeof readRegistration==="function"?readRegistration():generation?{generation}:null;}
  function registeredGeneration(){const value=registration();if(value!==null && !ledger.UUID.test(value?.generation || ""))fail("owned_service_registration_invalid");return value?.generation || null;}
  function admissionOpen(){return typeof readAdmission!=="function" || readAdmission()===true;}
  function assertAllowed(kind,ticket){if(!["execution","observation","completion","intake","control","passive_wait"].includes(kind))fail("owned_service_ticket_kind_invalid");if(closing && kind!=="control")fail("owned_service_shutdown_committed");if(kind==="execution" && !admissionOpen())fail("owned_service_retained_admission_closed");if(draining && kind==="execution" && !ticket?.executionEntitled)fail("owned_service_draining_new_execution_rejected");}
  function assertExecutionTicket(){const t=context.getStore();if(t?.bootstrapEntitled)fail("owned_service_bootstrap_execution_forbidden");assertAllowed("execution",t);if(!t?.executionEntitled && draining)fail("owned_service_execution_ticket_required");}
  function assertCommandTicket(){const t=context.getStore();if(t?.bootstrapEntitled){if(t.kind!=="bootstrap_project_read")fail("owned_service_bootstrap_project_read_required");assertBootstrapAllowed();return;}if(t && ["observation","completion","passive_wait"].includes(t.kind)){assertAllowed(t.kind,t);return;}assertExecutionTicket();}
  function run(kind,fn){
    const parent=context.getStore();if(parent?.bootstrapEntitled)fail("owned_service_bootstrap_scope_required");assertAllowed(kind,parent);if(parent)return context.run({...parent,kind},fn);
    // Observations and exact result delivery never need execution admission.
    // Intake retains its pre-drain entitlement; execution still checks live proof.
    const ticket={id:crypto.randomUUID(),kind,executionEntitled:["intake","execution"].includes(kind) && !draining && !closing && admissionOpen(),startedAt:now()};
    if(kind!=="control")tickets.add(ticket);
    try{const value=context.run(ticket,fn);if(value && typeof value.then==="function")return Promise.resolve(value).finally(()=>tickets.delete(ticket));tickets.delete(ticket);return value;}catch(e){tickets.delete(ticket);throw e;}
  }
  function assertBootstrapAllowed(){if(closing)fail("owned_service_shutdown_committed");if(draining)fail("owned_service_draining_new_execution_rejected");}
  function runBootstrap(fn){
    assertBootstrapAllowed();if(context.getStore()?.bootstrapEntitled)fail("owned_service_bootstrap_scope_required");
    const ticket={id:crypto.randomUUID(),kind:"bootstrap",bootstrapEntitled:true,executionEntitled:false,startedAt:now()};tickets.add(ticket);
    try{return Promise.resolve(context.run(ticket,fn)).finally(()=>tickets.delete(ticket));}catch(error){tickets.delete(ticket);throw error;}
  }
  function runBootstrapProjectRead(fn){
    const ticket=context.getStore();assertBootstrapAllowed();if(!ticket?.bootstrapEntitled || ticket.kind!=="bootstrap")fail("owned_service_bootstrap_ticket_required");
    return context.run({...ticket,kind:"bootstrap_project_read"},fn);
  }
  function status(){const current=registeredGeneration();return {ok:true,schema:SCHEMA+".status",owned:current!==null,generation:current,draining,closing,writeAdmission:admissionOpen()?"open":"retained_audit_and_fresh_adoption_required",activeTickets:tickets.size,drainOperationId:drainOperation,shutdownEffectPending,replayAllowed:false};}
  function privateOperation(input,operation){authority.exact(input,["operationId"],"owned_service_body_operation_id_only");const current=registeredGeneration();if(!current)fail("owned_service_registration_required");const rows=readOperation(journalRoot,input.operationId),v=rows.intent.value;if(v.targetGeneration!==current || v.operation!==operation)fail("owned_service_operation_generation_mismatch");const policy=readPolicy();if(policy.enabled!==true || !policy.acceptedServerCoverage?.includes("owned_daemon_lifecycle") || !ledger.same(policy.authorization,v.authorizationRef))fail("owned_service_policy_disabled_or_changed");return rows;}
  function readiness(){
    const v=readReadiness(),l=v?.projectLifecycle,q=v?.productStopQuiescence;
    let product=false;try{product=typeof readProductStopAuthority==="function" && readProductStopAuthority()===true;}catch(_){/* Missing/partial product provenance stays closed. */}
    const fresh=l?.enabled===true && l.blocked===true && l.problem==="lifecycle_store_missing" && l.freshMissingStoreReadAllowed===true && l.generation===0 && l.pending===null;
    const lifecycleIdle=product?l?.enabled===true && l.pending===null && (l.blocked===false || fresh):!!l && !l.pending && l.blocked===false;
    const ownedIdle=product?q?.allChildrenExitProven===true && q.pendingCleanupJobs===0 && q.pendingNativeAttempts===0 && q.outstandingAttempts===0 && q.transportOutstanding===0 && (q.planExecutionState===null || ["pending","completed","failed","cancelled","expired","superseded"].includes(q.planExecutionState)):admissionOpen() && v?.ownedChildrenProofs===true && v.retainedCapsulePreserved===true;
    const activeStopTickets=[...tickets].filter(t=>!product || t.kind!=="passive_wait").length;
    return {activeTickets:tickets.size,activeStopTickets,details:v,stopAuthority:product?"registered_product":"retained",ready:ownedIdle && activeStopTickets===0 && v?.pendingCommands===0 && Array.isArray(v.inflightCommands) && !v.inflightCommands.length && v.activeEditSession===null && lifecycleIdle && v.bootstrapIdle===true && v.nativeExecutionIdle===true};
  }
  function drainOnce(input){const rows=privateOperation(input,"drain");if(rows["drain-ack"])return {ok:true,status:"drain_ack_retained",ack:rows["drain-ack"],readiness:readiness(),...status()};if(rows["shutdown-ack"])fail("owned_service_shutdown_already_committed");draining=true;drainOperation=input.operationId;const ack=r1.writeJournalOnce(operationDirectory(journalRoot,input.operationId),"drain-ack",{schema:SCHEMA+".drain-ack",operationId:input.operationId,targetGeneration:rows.intent.value.targetGeneration,intentSha256:rows.intent.sha256,acknowledgedAt:new Date(now()).toISOString(),draining:true,replayAllowed:false});return {ok:true,status:"draining",ack,readiness:readiness()};}
  function shutdownOnce(input,res){
    const rows=privateOperation(input,"shutdown");if(rows["shutdown-ack"])return {ok:true,status:"shutdown_ack_retained",ack:rows["shutdown-ack"],exitProven:false,replayAllowed:false};
    if(!draining || !drainOperation)fail("owned_service_drain_required");const ready=readiness();if(!ready.ready)return {ok:false,status:"drain_pending_remains_alive",readiness:ready,exitProven:false,replayAllowed:false};
    if(!res || typeof res.once!=="function")fail("owned_service_response_finish_required");
    // fsync completes inside writeJournalOnce before the caller sends a response.
    const ack=r1.writeJournalOnce(operationDirectory(journalRoot,input.operationId),"shutdown-ack",{schema:SCHEMA+".shutdown-ack",operationId:input.operationId,targetGeneration:rows.intent.value.targetGeneration,intentSha256:rows.intent.sha256,drainOperationId:drainOperation,acknowledgedAt:new Date(now()).toISOString(),status:"shutdown_committed_after_response_finish",exitProven:false,replayAllowed:false});
    closing=true;
    res.once("finish",()=>{try{privateOperation(input,"shutdown");if(!readiness().ready)fail("owned_service_shutdown_readiness_changed_after_ack");if(closeIdleWaiters)closeIdleWaiters();if(closeServer)closeServer();}catch(error){shutdownEffectPending=error.code || "owned_service_shutdown_authority_changed_after_ack";}});
    return {ok:true,status:"shutdown_acknowledged",ack,exitProven:false,replayAllowed:false};
  }
  return Object.freeze({run,runBootstrap,runBootstrapProjectRead,ingress:(req,fn)=>run(ingressKind(req),fn),assertExecutionTicket,assertCommandTicket,status,readiness,drainOnce,shutdownOnce,get context(){return context;}});
}
module.exports={SCHEMA,OPERATIONS,operationKey,operationDirectory,validateOperationIntent,reserveOperation,readOperation,ingressKind,createOwnedRuntimeService};

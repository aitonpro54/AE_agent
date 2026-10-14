"use strict";
// Finite source-body tests. Every native/HTTP observation below is a private
// authority=false fixture; this driver never imports the daemon or addon.
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),{EventEmitter}=require("node:events");
const source=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");
const begin=source.indexOf("function trustedFail("),end=source.indexOf("\nfunction toolResult(",begin);
if(begin<0||end<begin||source.indexOf("function trustedFail(",begin+1)>=0)throw Error("fixture_unique_source_boundary_required");
const body=source.slice(begin,end);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function assert(value,code){if(!value)throw Object.assign(Error(code),{code});}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture(changes={}){
  const effects=[],role=Object.freeze({fixtureOnly:true}),cap=Object.freeze({fixtureOnly:true}),poll={req:{aborted:false},res:{destroyed:false,writableEnded:false}};
  const state={role,target:cap,cep:{assertCurrent(){},close(){effects.push("cep-close");}},server:null,transport:{async close(){effects.push("transport-close");}},heldPoll:poll,
    pollWaiter:null,activeTool:null,projects:new Map(),serial:Promise.resolve(),closing:false,pump:null,targetWaiters:new Set(),requests:new Set(),bootstrapStarted:false,
    initialNextSeen:false,startupCallbacks:0,startupCounts:new Map(),connection:null,pumpWork:null,dispositionError:null,drainAcknowledged:false,shutdownAcknowledged:false};
  const events=[...(changes.events||[])],runtime={assertIngress(){if(changes.readClosed)throw Object.assign(Error("fixture_read_closed"),{code:"fixture_read_closed"});}};
  const native={assertOriginalDispositionCurrent(){effects.push("disposition-guard");},assertCapturedCurrent(){},async pollOriginalEvent(){effects.push("poll");return events.length?events.shift():null;},
    originalEventKind(_role,event){return event.kind;},async acknowledgeOriginalDisposition(_role,event){effects.push("ack-"+event.kind);if(changes.ackFailure)throw Object.assign(Error("fixture_native_pending"),{code:"fixture_native_pending"});},
    async verifyTool(){effects.push("verify");return cap;},async takeChallenge(){effects.push("challenge");return cap;},async captureObservationFixed(){effects.push("capture");return cap;},
    async submitObservation(){effects.push("submit");},async captureLocalStatusFixed(){effects.push("status-terminal");return {terminal:cap,value:{ok:true,fixtureOnly:true}};},
    async captureOriginalAeFixed(){effects.push("preactor");return changes.preactor?changes.preactor.promise:cap;}};
  native.bindProjectFixed=async()=>{effects.push("bind-project");return cap;};native.describeProject=()=>({id:"fixture-native-command",script:"fixture-sealed-read"});
  native.originalDeadlineProjectionFixed=()=>({remainingSessionMs:30000,remainingCommandMs:30000});
  native.selectProject=async()=>{effects.push("select-project");return changes.selection?changes.selection.promise:cap;};native.guardProject=async()=>{effects.push("guard-project");return cap;};
  const transport={async retainAuthenticatedRequest(){effects.push("retain");return changes.retain?changes.retain.promise:cap;},requestCapability(){return cap;}};
  const timers=[];const fixtureTimeout=changes.manualDeadlines?(callback,delay)=>{if(delay!==30000)return setTimeout(callback,delay);const timer={callback,active:true};timers.push(timer);return timer;}:setTimeout;
  const fixtureClear=timer=>{if(timer&&typeof timer==="object"&&Object.hasOwn(timer,"active"))timer.active=false;else clearTimeout(timer);};
  const context={trustedReadDaemon:state,initialRuntime:runtime,trustedNative:native,trustedHttp:transport,Buffer,URL,Reflect,Object,Promise,Map,Set,JSON,
    currentProposalState:{current:null,assertCurrent(value){assert(value!==null,"fixture_no_current_proposal");}},ownedFixedTitleProposals:new WeakMap(),ownedFixedTitleManualReceipts:new WeakMap(),
    setTimeout:fixtureTimeout,clearTimeout:fixtureClear,setInterval,clearInterval,process:{stderr:{write(){effects.push("diagnostic");}},exitCode:null},
    writeJson(res,status,value){effects.push("response");res.result={status,value};},toolResult(value){return {content:[{type:"text",text:JSON.stringify(value)}],isError:false};},
    fs:{existsSync(){return false;}},EDIT_SESSION_ACTIVE_FILE:"fixture-only",getBridgeStatus:()=>({ok:true,fixtureOnly:true})};
  vm.createContext(context);vm.runInContext(body+"\nglobalThis.fixtureApi={trustedTool,trustedDispositionTick,trustedQuery,trustedPollIdentity,trustedChargeStartup,trustedWaitTarget,trustedHoldPoll};",context,{timeout:1000});
  function response(){const res=new EventEmitter();Object.assign(res,{writableEnded:false,writableFinished:false,destroyed:false});return res;}
  return {api:context.fixtureApi,state,effects,context,response,cap,fireDeadlines(){for(const timer of timers)if(timer.active){timer.active=false;timer.callback();}}};
}
async function main(){const cases=[];async function run(name,check){await check();cases.push({name,result:"PASS"});}
  const tool=Buffer.from('{"args":{},"name":"get_bridge_status"}');
  await run("concurrent_tool_refused_before_native_retain",async()=>{const f=fixture();f.state.activeTool={error:null};let error;try{await f.api.trustedTool({},f.response(),tool);}catch(value){error=value;}
    assert(error?.code==="owned_initial_concurrent_tool_refused"&&f.effects.length===0,"fixture_concurrent_tool_effect");});
  await run("tool_latch_precedes_first_await",async()=>{const hold=deferred(),f=fixture({retain:hold}),res=f.response(),first=f.api.trustedTool({},res,tool);
    assert(f.state.activeTool&&f.effects.includes("retain")&&!f.effects.includes("verify"),"fixture_tool_latch_missing");let denied=false;try{await f.api.trustedTool({},f.response(),tool);}catch{denied=true;}
    assert(denied&&f.effects.filter(value=>value==="retain").length===1,"fixture_second_retain");hold.resolve(f.cap);await first;await tick();assert(res.result.status===200&&f.state.activeTool===null,"fixture_tool_terminal_missing");});
  await run("lost_ingress_before_verify_denies_original_operation",async()=>{const hold=deferred(),f=fixture({retain:hold}),res=f.response(),work=f.api.trustedTool({},res,tool);
    res.emit("close");let denied=false;try{await work;}catch(error){denied=error.code==="owned_initial_original_tool_response_lost";}
    assert(denied&&f.state.activeTool!==null,"fixture_lost_request_released_pending");hold.resolve(f.cap);await tick();assert(!f.effects.includes("verify")&&f.state.activeTool===null,"fixture_lost_request_verified");});
  await run("lost_bootstrap_retains_slot_until_original_capture_settles",async()=>{const held=deferred(),f=fixture({preactor:held}),res=f.response();f.state.target=null;f.state.cep=null;
    const work=f.api.trustedTool({},res,Buffer.from('{"args":{},"name":"ensure_ae_agent_panel"}'));await tick();assert(f.effects.includes("preactor"),"fixture_original_capture_missing");
    res.emit("close");try{await work;}catch{}assert(f.state.activeTool!==null&&f.state.bootstrapStarted,"fixture_bootstrap_pending_owner_lost");held.resolve(f.cap);await tick();
    assert(f.state.activeTool===null&&!f.effects.includes("response"),"fixture_bootstrap_false_response");});
  await run("completed_terminal_survives_late_response_close",async()=>{const f=fixture(),res=f.response();await f.api.trustedTool({},res,tool);res.writableFinished=true;res.emit("close");await tick();
    assert(res.result.status===200&&f.effects.filter(value=>value==="status-terminal").length===1&&f.state.activeTool===null,"fixture_completed_job_invalidated");});
  await run("pump_skips_active_native_tool",async()=>{const f=fixture({events:[{kind:"drain"}]});f.state.activeTool={};assert(f.api.trustedDispositionTick()===undefined&&f.effects.length===0,"fixture_pump_during_tool");});
  await run("bracket_observation_uses_original_event_once",async()=>{const f=fixture({events:[{kind:"observation"}]});await f.api.trustedDispositionTick();await tick();
    assert(f.effects.filter(value=>value==="capture").length===1&&f.effects.filter(value=>value==="submit").length===1&&!f.effects.includes("challenge"),"fixture_event_replaced_with_new_challenge");});
  await run("drain_and_shutdown_use_disposition_without_read_gate",async()=>{const f=fixture({readClosed:true,events:[{kind:"drain"},{kind:"shutdown"}]});await f.api.trustedDispositionTick();await tick();
    assert(f.state.drainAcknowledged&&f.effects.indexOf("transport-close")<f.effects.indexOf("ack-drain"),"fixture_d21_before_actual_close");await f.api.trustedDispositionTick();await tick();
    assert(f.state.shutdownAcknowledged&&f.context.process.exitCode===0&&f.effects.includes("cep-close"),"fixture_d22_missing");});
  await run("native_missing_terminal_cannot_be_js_close_ack",async()=>{const f=fixture({readClosed:true,ackFailure:true,events:[{kind:"drain"},{kind:"shutdown"}]});try{await f.api.trustedDispositionTick();}catch{}await tick();
    assert(f.state.dispositionError&&!f.state.drainAcknowledged,"fixture_deterministic_pending_promoted");f.api.trustedDispositionTick();assert(f.effects.filter(value=>value==="poll").length===1&&!f.effects.includes("ack-shutdown"),"fixture_disposition_replay");});
  await run("shutdown_without_d21_refused_once",async()=>{const f=fixture({events:[{kind:"shutdown"}]});try{await f.api.trustedDispositionTick();}catch{}await tick();
    assert(f.state.dispositionError&&!f.effects.includes("ack-shutdown"),"fixture_shutdown_order_bypass");});
  await run("panel_query_exact_keys_and_unique_values",()=>{const f=fixture(),valid="http://127.0.0.1/bridge/next?panelConnectionId=c&panelGeneration=1&panelInstanceId=i&panelLifecycleEpoch=1&projectFile=";
    assert(f.api.trustedPollIdentity(new URL(valid)).panelGeneration==="1","fixture_fixed_query_denied");for(const invalid of [valid+"&extra=1",valid+"&panelGeneration=2",valid.replace("panelInstanceId=i","panelInstanceId=")]){let denied=false;try{f.api.trustedPollIdentity(new URL(invalid));}catch{denied=true;}assert(denied,"fixture_query_wildcard");}});
  await run("startup_null_current_is_one_service_before_original_next",()=>{const f=fixture();f.api.trustedChargeStartup("/agents/plan/current");assert(f.state.startupCallbacks===1&&f.state.startupCounts.get("startup:null-current")===1,"fixture_startup_null_not_counted");let refused=false;try{f.api.trustedChargeStartup("/agents/plan/current");}catch{refused=true;}assert(refused&&f.state.startupCallbacks===1,"fixture_startup_null_replayed");const late=fixture();late.state.initialNextSeen=true;try{late.api.trustedChargeStartup("/agents/plan/current");throw Error("fixture_late_null_allowed");}catch(error){assert(error.message!=="fixture_late_null_allowed","fixture_late_null_allowed");}});
  await run("held_original_poll_deadline_closes_exact_socket_once_and_is_sticky",()=>{const f=fixture({manualDeadlines:true}),res=f.response();f.state.heldPoll=null;const req={socket:{destroy(){f.effects.push("original-poll-close");res.emit("close");}}};f.api.trustedHoldPoll({req,res});assert(f.state.heldPoll!==null,"fixture_poll_not_retained");f.fireDeadlines();f.fireDeadlines();assert(f.state.idlePollClosed&&f.state.heldPoll===null&&f.effects.filter(value=>value==="original-poll-close").length===1,"fixture_original_poll_deadline_not_closed_once");});
  await run("held_original_poll_loss_sets_sticky_closed_without_replacement",()=>{const f=fixture({manualDeadlines:true}),res=f.response();f.state.heldPoll=null;f.api.trustedHoldPoll({req:{socket:{}},res});res.emit("close");f.fireDeadlines();assert(f.state.idlePollClosed&&f.state.heldPoll===null,"fixture_poll_loss_not_sticky");});
  await run("captured_target_releases_startup_before_panel_admission",async()=>{const f=fixture();f.state.target=null;const res=f.response(),work=f.api.trustedWaitTarget({aborted:false},res);assert(f.state.targetWaiters.size===1,"fixture_startup_not_held");
    f.state.target=f.cap;for(const waiter of [...f.state.targetWaiters])waiter.resolve();await work;assert(f.state.targetWaiters.size===0&&f.effects.length===0,"fixture_startup_requires_challenge");});
  await run("delayed_original_selection_deadline_is_handled_and_keeps_owner",async()=>{
    const selection=deferred(),f=fixture({selection,manualDeadlines:true}),res=f.response();let unhandled=0;const observe=()=>{unhandled++;};process.on("unhandledRejection",observe);
    try{const pending=f.api.trustedTool({},res,Buffer.from('{"args":{},"name":"get_project_info"}'));const responseOutcome=pending.catch(error=>error);
      await tick();assert(f.effects.includes("select-project")&&f.state.projects.size===1&&f.state.activeTool!==null,"fixture_native_selection_not_owned");
      f.fireDeadlines();const error=await responseOutcome;await tick();assert(error.code==="owned_initial_project_terminal_timeout"&&error.unknown&&unhandled===0,"fixture_deadline_not_immediately_handled");
      assert(f.state.activeTool!==null&&f.state.projects.size===1&&!f.effects.includes("guard-project"),"fixture_pending_original_owner_released_on_deadline");
      selection.resolve(f.cap);await tick();await tick();assert(f.state.activeTool===null&&f.state.projects.size===0&&f.effects.filter(value=>value==="select-project").length===1&&!f.effects.includes("guard-project")&&unhandled===0,"fixture_late_native_selection_replayed_or_unhandled");
    }finally{process.removeListener("unhandledRejection",observe);}
  });
  process.stdout.write(JSON.stringify({schema:"ae-agent.trusted-read-route-source-proof.v1",authority:false,nativeFactories:0,actualHttp:false,actualInspector:false,productionReady:false,cases,ok:true})+"\n");
}
main().catch(error=>{process.stderr.write(JSON.stringify({authority:false,code:error.code||error.message||"fixture_unknown"})+"\n");process.exitCode=1;});

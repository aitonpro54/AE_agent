"use strict";
// Offline finite VM checks only: no addon, pipe, process creation or AE access.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,".."),runtimeSource=fs.readFileSync(path.join(root,"mcp-server/owned-runtime-initial-runtime.js"),"utf8");
const clientSource=fs.readFileSync(path.join(root,"mcp-server/owned-runtime-initial-native-client.js"),"utf8");
function fixture({failure=null,hold=null}={}){
  const counts={factory:0,open:0,ensure:0,status:0,observe:0,revoke:0},role={};let pending=false;
  const retained={schema:"ae-agent.owned-runtime-retained-observation.v1",snapshotAvailable:true,unknown:!!failure,
    nativeWorkPending:false,productionAuthority:false,replayAllowed:false,originalBroker:{held:true,state:"exited",exitCode:2},
    retainedIo:{retained:0,pending:0,completed:0,unavailable:0},lastExchange:{verb:2,phase:"read",waitBudgetMs:"30000",elapsedMs:"30001"}};
  const native={selectedFixed:()=>true,openControllerFixed(){counts.factory++;return role;},assertCurrent(actual){assert.equal(actual,role);},
    async open(){counts.open++;if(hold){pending=true;await hold;pending=false;}},async ensure(){counts.ensure++;if(failure)throw failure;return {operation:2};},
    async status(){counts.status++;return {state:4};},executionProfileFixed:()=>"two_title_media_v1",
    observeRetainedFixed(actual){assert.equal(actual,role);counts.observe++;return Object.freeze({...retained,nativeWorkPending:pending,snapshotAvailable:!pending});},
    async revoke(){counts.revoke++;}};
  const module={exports:{}},context=vm.createContext({module,exports:module.exports,process:{env:{}},Buffer,setTimeout,clearTimeout,
    require(name){if(name==="./deployment-mode")return {deploymentMode:()=>"initial-owned"};if(name==="./owned-runtime-initial-native-client")return native;
      if(name==="./owned-runtime-initial-source-census")return {requested:()=>false};
      if(name==="./owned-runtime-initial-observers")return {bindLoadedNodeFixed:async()=>({assertCurrent(){}})};
      if(name==="node:http")return {request(){throw Error("unexpected_HTTP");}};
      if(name==="./owned-runtime-initial-title-plan"||name==="./owned-runtime-ui-baseline")return {};
      throw Error("unexpected_require:"+name);}});
  new vm.Script(runtimeSource).runInContext(context);
  return {runtime:module.exports.createInitialRuntime(),counts,args:()=>new vm.Script("({})").runInContext(context)};
}
async function main(){const cases=[];const run=async(name,body)=>{await body();cases.push({name,result:"PASS"});};
  await run("cold_status_does_not_construct_or_observe",async()=>{const f=fixture();assert.equal((await f.runtime.readStatus(f.args())).status,"CLOSED");assert.equal(f.counts.factory,0);assert.equal(f.counts.observe,0);});
  await run("healthy_status_is_passive_and_keeps_authority_separate",async()=>{const f=fixture();await f.runtime.ensure(f.args());const calls=f.counts.status;
    const observed=await f.runtime.readStatus(f.args());assert.equal(observed.status,"ORIGINAL_TARGET_HELD");assert.equal(observed.available,true);
    assert.equal(observed.retained.productionAuthority,false);assert.equal(observed.retained.replayAllowed,false);assert.equal(f.counts.status,calls);assert.equal(f.counts.observe,1);});
  await run("unknown_original_result_remains_readable_without_replay",async()=>{const f=fixture({failure:Object.assign(Error("trusted_original_io_timeout_no_replay"),{unknown:true})});
    await assert.rejects(f.runtime.ensure(f.args()),/timeout_no_replay/);const observed=await f.runtime.readStatus(f.args());
    assert.equal(observed.status,"UNKNOWN");assert.equal(observed.available,false);assert.equal(observed.replayAllowed,false);
    assert.equal(observed.retained.originalBroker.state,"exited");assert.equal(observed.retained.lastExchange.verb,2);assert.equal(observed.retained.lastExchange.phase,"read");
    assert.equal(observed.retained.lastExchange.waitBudgetMs,"30000");await assert.rejects(f.runtime.ensure(f.args()),/original_unknown/);
    assert.equal(f.counts.ensure,1);assert.equal(f.counts.status,0);assert.equal(f.counts.factory,1);});
  await run("status_does_not_queue_behind_pending_original_open",async()=>{let settle;const f=fixture({hold:new Promise(resolve=>{settle=resolve;})});const work=f.runtime.ensure(f.args());
    while(!f.counts.open)await new Promise(resolve=>setImmediate(resolve));const observed=await f.runtime.readStatus(f.args());
    assert.equal(observed.retained.nativeWorkPending,true);assert.equal(observed.retained.snapshotAvailable,false);assert.equal(f.counts.status,0);settle();await work;});
  await run("revoke_does_not_make_observation_a_new_admission",async()=>{const f=fixture({failure:Object.assign(Error("unknown"),{unknown:true})});await assert.rejects(f.runtime.ensure(f.args()));
    await f.runtime.shutdown(f.args());const observed=await f.runtime.readStatus(f.args());assert.equal(observed.status,"REVOKED");assert.equal(observed.available,false);assert.equal(f.counts.revoke,1);assert.equal(f.counts.observe,1);});
  await run("native_wrapper_observes_same_closed_role_without_current_gate",async()=>{const calls={factory:0,observe:0,assert:0,revoke:0};
    const original={assertSessionCurrent(){calls.assert++;throw Error("current_gate_must_not_run");},observeRetainedFixed(){calls.observe++;return {snapshotAvailable:true,productionAuthority:false};},async revokeOnce(){calls.revoke++;}};
    const addon={openControllerFixed(){calls.factory++;return original;},bindOriginalDaemonFixed(){throw Error("daemon_factory_must_not_run");}};
    const module={exports:{}},context=vm.createContext({module,exports:module.exports,__dirname:path.join(root,"mcp-server"),process:{platform:"win32",arch:"x64",version:"v24.19.0",versions:{napi:"8"},env:{}},
      require(name){if(name==="./deployment-mode")return {deploymentMode:()=>"initial-owned"};if(name==="node:path")return path;if(name==="node:fs")return {existsSync:()=>true,lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false}),realpathSync:value=>value};if(name.endsWith(".node"))return addon;throw Error("unexpected_require");}});
    new vm.Script(clientSource).runInContext(context);const api=module.exports,role=api.openControllerFixed();assert.equal(api.observeRetainedFixed(role).snapshotAvailable,true);
    await api.revoke(role);assert.equal(api.observeRetainedFixed(role).snapshotAvailable,true);assert.throws(()=>api.observeRetainedFixed({}),/original_role_required/);
    assert.equal(calls.factory,1);assert.equal(calls.observe,2);assert.equal(calls.assert,0);assert.equal(calls.revoke,1);});
  await run("native_observer_has_no_effect_or_authority_transition",()=>{const source=fs.readFileSync(path.join(root,"native/owned-runtime-local-session/local_session_native_client.cpp"),"utf8");
    const observer=source.slice(source.indexOf("RetainedRuntimeObservation NativeClient::ObserveRetainedFixed()"),source.indexOf("std::shared_ptr<Capability> NativeClient::BeginCompletionFixed"));
    assert(observer.includes("std::try_to_lock"));assert(observer.includes("GetOverlappedResult"));assert(observer.includes("WaitForSingleObject(broker,0)"));
    for(const forbidden of ["Exchange(","CancelIoEx(","CloseHandle(","CreateProcess","AssertCurrent(","data_->unknown=","data_->revoked="])assert(!observer.includes(forbidden),forbidden);
    const creation=source.slice(source.indexOf("CreatedChild NativeClient::CreateOriginalDaemonFixed"),source.indexOf("struct ProjectCapture final"));
    assert(creation.includes("enrollment.OriginalProductionSeal()"));assert(!creation.includes("OpenFixed("));assert(creation.includes("!original->Fresh()"));
    for(const join of ["resolved.installation!=installed.installation","resolved.lineage!=installed.lineage","resolved.policyHash!=installed.policyHash","detail::SamePin(resolved.runtime,installed.runtime)"])assert(creation.includes(join),join);
    assert(source.includes("kIoMs=1000"));assert(source.includes("kStartupReplyReadMs=30000"));});
  return {schema:"ae-agent.startup-observation-offline-smoke.v1",ok:true,cases,actualNativeFactories:0,actualHttp:false,actualAe:false,productionAuthority:false};
}
main().then(result=>process.stdout.write(JSON.stringify(result)+"\n"),error=>{process.stderr.write(error.stack+"\n");process.exitCode=1;});

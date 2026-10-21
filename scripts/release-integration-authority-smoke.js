"use strict";
// Evaluate the actual merged bridge callbacks with private offline dependencies.
// No daemon, network, native helper, production files or installed CEP effects.
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");
const transportSource=source.slice(source.indexOf("function panelControlUsesRetainedTransport()"),source.indexOf("\nconst panelControlService",source.indexOf("function panelControlUsesRetainedTransport()")));
const start=source.indexOf("const ownedRuntimeService=require(\"./owned-runtime-service\")");
const callbacks=source.slice(start,source.indexOf("\nfunction closeOwnedRuntimeHttpServer",start)).replace("const ownedRuntimeService=","var ownedRuntimeService=");
let cases=0;
function fixture({initial=false,resetReady=true,initialReady=true,product=true,retained=false}={}){
  const flags={resetReady,initialReady,product,retained},calls={initial:0,productStop:0};
  const context={process:{env:{AE_OWNED_RUNTIME_GENERATION:"generation"}},path,LOG_DIR:"offline",PROJECT_ROOT:"offline",RUNTIME_IDENTITY:{sourceSha256:"offline-source"},
    ownedRuntimeStartup:{managed:true,requiresRetainedAdoption:true,generation:"generation",initialRecovery:initial},initialRuntime:null,
    autonomousSession:{publicStatus:()=>({connectionReady:true})},
    ownedRuntimeAuthority:{base:()=>"offline",privateFile:()=>{throw Error("no retained fixture");}},
    productSessionResetState:()=>({admissionReady:()=>flags.resetReady}),
    panelControlService:{cutoverReadiness:()=>({ready:flags.retained,outstanding:[]})},panelBootstrapService:{isBusy:()=>false},
    ownedFixtureLifecycle:{quiescence:()=>({allChildrenExitProven:true,pendingCleanupJobs:0})},
    ameFixtureExecutor:{quiescence:()=>({executing:false,pendingCleanupJobs:0,pendingCount:0,outstandingAttempts:[]})},
    currentProposalState:{current:null},getBridgeStatus:()=>({}),closeOwnedRuntimeHttpServer(){},
    require(name){
      if(name==="./owned-runtime-service")return {createOwnedRuntimeService:options=>options};
      if(name==="./owned-runtime-initial-recovery")return {admissionReady(){calls.initial++;return flags.initialReady;}};
      if(name==="./native-fixture-retained")return {currentAdmission:()=>flags.retained};
      if(name==="./owned-runtime-supervisor")return {readDaemonRegistration:()=>({generation:"generation"}),readProductStopAuthority(){calls.productStop++;return flags.product;}};
      throw Error("unexpected offline dependency: "+name);
    }};
  vm.createContext(context);vm.runInContext(transportSource+"\n"+callbacks,context);
  return {flags,calls,context,service:context.ownedRuntimeService};
}
for(const initial of [false,true])for(const resetReady of [false,true])for(const laneReady of [false,true]){
  const f=fixture({initial,resetReady,initialReady:laneReady,product:laneReady});
  assert.equal(!!f.service.readAdmission(),resetReady&&laneReady,"reset must AND with each authority lane");cases++;
  assert.equal(f.service.readProductStopAuthority(),initial?false:laneReady,"legacy recovery cannot become product stop authority");cases++;
}
{
  const f=fixture({initial:true});assert.equal(f.context.panelControlUsesRetainedTransport(),false);assert.equal(f.calls.productStop,0);cases++;
  const ready=f.service.readReadiness();assert.equal(ready.ownedChildrenProofs,true);assert.equal(ready.retainedCapsulePreserved,true);
  assert.equal(ready.productStopQuiescence.allChildrenExitProven,true);assert.equal(ready.productStopQuiescence.pendingCleanupJobs,0);cases++;
  f.flags.initialReady=false;assert.equal(f.service.readReadiness().ownedChildrenProofs,false);cases++;
}
{
  const f=fixture({product:false,retained:true});assert.equal(f.service.readAdmission(),true);assert.equal(f.calls.initial,0);cases++;
  f.flags.retained=false;assert.equal(f.service.readAdmission(),false);cases++;
  f.flags.product=true;f.flags.resetReady=false;assert.equal(f.service.readAdmission(),false);cases++;
}
console.log(JSON.stringify({ok:true,cases,scope:"actual merged bridge callbacks, offline VM only",nativeEffects:0}));

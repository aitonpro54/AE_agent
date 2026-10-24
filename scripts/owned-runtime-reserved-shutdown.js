#!/usr/bin/env node
"use strict";
// Reviewed staged client, actual runtime dependencies, no source installation.
// The root controller installs its reviewed source after the exit notification,
// then sends one typed restart command while this client retains the exit HANDLE.
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),Module=require("node:module"),readline=require("node:readline");
const ACTUAL_ROOT=path.resolve("C:/Users/Ant/Documents/Codex/AE_agent"),SOURCE_ROOT=path.resolve(__dirname,".."),ENGINE=path.join(SOURCE_ROOT,"mcp-server/owned-runtime-graceful-continuation.js"),UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,SHA=/^[a-f0-9]{64}$/;
function fail(code){throw Object.assign(Error(code),{code});}
function parse(args){
 const command=args[0],names=["--runtime-root","--generation","--parent-operation-id","--shutdown-operation-id","--source-sha256","--pid","--restart-operation-id"];
 if(!["inspect-fs","continue-once"].includes(command)||args.length!==1+names.length*2)fail("graceful_reserved_client_arguments_invalid");
 const values={command};for(let n=0;n<names.length;n++){if(args[n*2+1]!==names[n])fail("graceful_reserved_client_arguments_invalid");values[names[n].slice(2)]=args[n*2+2];}
 if(path.resolve(values["runtime-root"])!==ACTUAL_ROOT||!["generation","parent-operation-id","shutdown-operation-id","restart-operation-id"].every(k=>UUID.test(values[k]))||!SHA.test(values["source-sha256"])||!/^\d+$/.test(values.pid)||!Number.isSafeInteger(Number(values.pid))||Number(values.pid)<1||new Set([values["parent-operation-id"],values["shutdown-operation-id"],values["restart-operation-id"]]).size!==3)fail("graceful_reserved_client_target_invalid");return values;
}
function loadEngine(root){
 const L=require(path.join(root,"mcp-server/native-fixture-attempt-ledger")),raw=L.readBytes(ENGINE),m=new Module(ENGINE,module),allowed=new Set(["owned-runtime-authority","native-fixture-attempt-ledger","owned-runtime-lifecycle","owned-runtime-product-session-reset","owned-runtime-service","review-evidence","owned-runtime-supervisor"]);
 m.filename=ENGINE;m.paths=module.paths;m.require=name=>{if(name.startsWith("node:"))return require(name);if(!name.startsWith("./")||!allowed.has(name.slice(2)))fail("graceful_reserved_client_dependency_refused");return require(path.join(root,"mcp-server",name.slice(2)));};m._compile(raw.toString("utf8"),ENGINE);return {engine:m.exports,sha256:L.hash(raw)};
}
function transport(root,input){
 const C=require(path.join(root,"scripts/owned-runtime-control"));return (profile,route,body)=>{
  if(!["/runtime/owned/status","/runtime/owned/shutdown-once"].includes(route)||route.endsWith("status")&&body!==undefined||route.endsWith("shutdown-once")&&(!body||Object.keys(body).join(",")!=="operationId"||body.operationId!==input["shutdown-operation-id"]))fail("graceful_reserved_client_route_refused");
  const token=C.credential(profile),bytes=body===undefined?null:Buffer.from(JSON.stringify(body));return new Promise((resolve,reject)=>{
   let settled=false,req;function done(error,value){if(settled)return;settled=true;clearTimeout(timer);if(error)reject(Object.assign(Error(error),{code:error}));else resolve(value);}
   const timer=setTimeout(()=>{req?.destroy();done("graceful_reserved_client_transport_unknown");},60000);
   req=http.request({host:"127.0.0.1",port:3456,path:route,method:bytes?"POST":"GET",agent:false,headers:{"x-ae-bridge-token":token,connection:"close",...(bytes?{"content-type":"application/json","content-length":bytes.length}:{})}},res=>{let size=0;const chunks=[];res.on("data",b=>{if((size+=b.length)>2097152){req.destroy();done("graceful_reserved_client_response_budget");}else chunks.push(b);});res.on("end",()=>{try{const value=JSON.parse(Buffer.concat(chunks));if(res.statusCode!==200||value?.ok!==true)fail("graceful_reserved_client_authenticated_refusal");done(null,value);}catch(_){done("graceful_reserved_client_authenticated_refusal");}});res.on("error",()=>done("graceful_reserved_client_transport_unknown"));res.on("aborted",()=>done("graceful_reserved_client_transport_unknown"));});req.on("error",()=>done("graceful_reserved_client_transport_unknown"));if(bytes)req.write(bytes);req.end();
  });
 };
}
function nextRestart(input){
 if(!input||Object.keys(input).sort().join(",")!=="command,sourceSha256"||input.command!=="restart"||!SHA.test(input.sourceSha256||""))fail("graceful_reserved_client_restart_input_invalid");return input.sourceSha256;
}
async function run(args){
 const input=parse(args),root=ACTUAL_ROOT,L=require(path.join(root,"mcp-server/native-fixture-attempt-ledger")),S=require(path.join(root,"mcp-server/owned-runtime-supervisor")),E=require(path.join(root,"mcp-server/review-evidence")),A=require(path.join(root,"mcp-server/owned-runtime-authority")),R=require(path.join(root,"mcp-server/owned-runtime-lifecycle")),loaded=loadEngine(root),registration=S.readDaemonRegistration(root);
 if(!registration||registration.generation!==input.generation||registration.kernelIdentity.pid!==Number(input.pid)||registration.sourceSha256!==input["source-sha256"]||E.runtimeIdentity(root).sourceSha256!==registration.sourceSha256)fail("graceful_reserved_client_exact_target_changed");
 const originalOperationId=input["parent-operation-id"],shutdownOperationId=input["shutdown-operation-id"],pins=[{path:__filename,rawSha256:L.hash(L.readBytes(__filename))},{path:ENGINE,rawSha256:loaded.sha256}],f=loaded.engine.reservedFacts(root,input.generation,originalOperationId,shutdownOperationId);
 f.assertUnchanged();f.old.assertNotCommitted();
 const restartKey=R.hash({command:"restart",targetGeneration:input.generation,desiredSourceSha256:input["source-sha256"]});if(fs.existsSync(path.join(A.base(root),"supervisor-operation-keys",restartKey+".json")))fail("graceful_reserved_client_restart_key_consumed");
 if(input.command==="inspect-fs")return {ok:true,status:"graceful_reserved_client_fs_checked_no_effect",generation:input.generation,sourceSha256:registration.sourceSha256,originalOperationId,shutdownOperationId,helperCodePins:pins,nativeObserved:false,freshIdleObserved:false,replayAllowed:false};
 return loaded.engine.continueReservedShutdownOnce({root,generation:input.generation,originalOperationId,shutdownOperationId,native:S.createDaemonNativeBackend(),request:transport(root,input),codePins:()=>pins,async afterExit({proof,baseline,assertHistoricalUnchanged}){
  // No controller lease is held here. The standalone process object remains held
  // until normal restart completes/refuses. Input cannot choose another command,
  // operation ID, root, identity, credential, helper, provider or force path.
  const lines=readline.createInterface({input:process.stdin,terminal:false});
  const next=new Promise((resolve,reject)=>{lines.once("line",line=>{try{resolve(nextRestart(JSON.parse(line)));}catch(_){reject(Object.assign(Error("graceful_reserved_client_restart_input_invalid"),{code:"graceful_reserved_client_restart_input_invalid"}));}});lines.once("close",()=>reject(Object.assign(Error("graceful_reserved_client_restart_input_missing"),{code:"graceful_reserved_client_restart_input_missing"})));});
  process.stdout.write(JSON.stringify({ok:true,status:"graceful_reserved_exit_observed_waiting_restart",generation:input.generation,proof,originalOutcome:"unknown",gracefulSuccessionClaimed:false,replayAllowed:false})+"\n");
  let expected;try{expected=await next;}finally{lines.close();}
  assertHistoricalUnchanged();const current=S.readDaemonRegistration(root);if(R.canonical(current)!==R.canonical(baseline.registration)||E.runtimeIdentity(root).sourceSha256!==expected)fail("graceful_reserved_client_successor_source_changed");
  const id=input["restart-operation-id"],newKey=R.hash({command:"restart",targetGeneration:input.generation,desiredSourceSha256:expected});if(fs.existsSync(path.join(A.base(root),"supervisor-operation-keys",newKey+".json"))||fs.existsSync(path.join(A.base(root),"supervisor-operations",id)))fail("graceful_reserved_client_restart_key_consumed");
  const result=await S.createOwnedRuntimeSupervisor({repoRoot:root}).restart(id);assertHistoricalUnchanged();return result;
 }});
}
module.exports={parse,loadEngine,transport,nextRestart,run};
if(require.main===module)run(process.argv.slice(2)).then(v=>process.stdout.write(JSON.stringify(v)+"\n")).catch(e=>{process.stdout.write(JSON.stringify({ok:false,code:/^[a-z0-9_]+$/.test(e.code||"")?e.code:"graceful_reserved_client_unknown_readback_only",replayAllowed:false})+"\n");process.exitCode=1;});

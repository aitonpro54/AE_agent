"use strict";
// Actual lifecycle modules and extracted production guards. No daemon/process,
// sockets, native addon or live AE. The canonical getter runs in an AE-shaped VM.
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),vm=require("node:vm");
const t=require("../mcp-server/project-lifecycle-transition"),c=require("../mcp-server/project-lifecycle-contract"),m=require("../mcp-server/project-intent-memory");
const state=require("../mcp-server/project-lifecycle-state"),bootstrap=require("../mcp-server/ae-agent-panel-bootstrap");
const {createLifecycleBridgeAdapter}=require("../mcp-server/project-lifecycle-bridge-adapter"),{fixture}=require("./project-lifecycle-fixture");
const daemon=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8"),panel=fs.readFileSync(path.join(__dirname,"../cep-panel/panel.js"),"utf8");
let checks=0;
const rejects=(work,code)=>assert.rejects(work,error=>error.code===code),throws=(work,code)=>assert.throws(work,error=>error.code===code);
const empty=()=>({schema:m.PROJECT_STATE_SCHEMA,projectState:{}});
function fresh(){const root=fs.mkdtempSync(path.join(os.tmpdir(),"ae-startup-read-")),statePath=path.join(root,"state.json");
  const storage=t.createLifecycleStorage({statePath,enabled:true});return {root,statePath,storage,dispose(){
    const resolved=path.resolve(root);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith("ae-startup-read-"))throw Error("unsafe_cleanup");fs.rmSync(resolved,{recursive:true,force:true});}};}
async function using(fn){const f=fresh();try{await fn(f);}finally{f.dispose();}}
function idleState(){return {activeEditSession:null,currentProposalState:{current:null},pendingCommands:[],inflightCommands:new Map()};}
function realIdle(input){const begin=daemon.indexOf("isBootstrapReadIdle: commandId =>"),end=daemon.indexOf("  isRecoveryIdle:",begin);
  assert(begin>=0&&end>begin);const expression=daemon.slice(begin+"isBootstrapReadIdle: ".length,end).trim().replace(/,$/,"");return vm.runInNewContext("("+expression+")",input);}
function adapter(f,input=idleState(),beforeDelivery){let calls=0;const idle=realIdle(input);let own;
  const api=createLifecycleBridgeAdapter({storage:f.storage,isBootstrapReadIdle:idle,sourceCheckpoint:()=>assert.fail("read cannot checkpoint"),readNative:async(body,cap,timeoutMs)=>{
    calls++;assert.equal(body,state.nativeProjectInfoBody());assert.equal(timeoutMs,321);assert.equal(t.phaseCapabilityFacts(cap).readOnly,true);
    own=cap;api.validateCommand(cap,body,"own-read");input.pendingCommands.push("own-read");input.inflightCommands.set("own-read",{});
    if(beforeDelivery)await beforeDelivery({cap,body,input});
    input.pendingCommands.shift();api.validateCommand(cap,body,"own-read");input.inflightCommands.delete("own-read");
    const project={file:{fsName:"C:/fixture/real-read.aep"},numItems:427,bitsPerChannel:16,revision:7,framesCountType:0,activeItem:{name:"MAIN",typeName:"Composition"}};
    return {ok:true,result:vm.runInNewContext("(function(){"+body+"})()",{app:{project},FramesCountType:{FC_START_0:0,FC_START_1:1}})};
  }});return {api,get calls(){return calls;},get cap(){return own;}};}
function status(lifecycle,extra={}){return {pendingCommands:0,inflightCommands:[],activeEditSession:null,planExecutionState:null,projectLifecycle:lifecycle,...extra};}
function panelIdle(value,allow,plan){const start=panel.indexOf("  function panelLifecycleIdle("),end=panel.indexOf("  var panelActionHandlers",start);assert(start>=0&&end>start);
  const context=vm.createContext({panelLifecycleGuard:false,panelActionBusy:()=>false,currentBridgePlan:plan||null,
    request(_method,_route,_body,done){done(null,{result:{content:[{text:JSON.stringify(value)}]}});},refreshCurrentBridgePlan(_options,done){done(null);}});
  vm.runInContext(panel.slice(start,end)+";this.check=panelLifecycleIdle;",context);let called=false,error;
  context.check(value=>{called=true;error=value;},allow);assert(called);return error;}
async function main(){
  await using(async f=>{const projection=f.storage.pendingProjection();assert.equal(projection.freshMissingStoreReadAllowed,true);assert.equal(projection.blocked,true);
    throws(()=>f.storage.assertMutationAllowed(),"lifecycle_store_missing");throws(()=>m.atomicProjectStateWrite(empty(),{statePath:f.statePath,enabled:true}),"lifecycle_store_missing");
    const a=adapter(f),result=await a.api.readProjectInfo(321);assert.equal(result.result.file,"C:/fixture/real-read.aep");assert.equal(result.result.numItems,427);
    assert.equal(a.calls,1);throws(()=>a.api.validateCommand(a.cap,state.nativeProjectInfoBody(),"own-read"),"lifecycle_phase_capability_required");
    assert.equal(fs.readdirSync(f.root).length,0);assert.equal(f.storage.pendingProjection().blocked,true);checks+=4;
    bootstrap.assertIdle(status(projection));assert.equal(panelIdle(status(projection),true),null);assert.equal(panelIdle(status(projection),false).code,"bridge_busy");checks+=3;
    for(const extra of [{pendingCommands:1},{inflightCommands:[{state:"unknown"}]},{activeEditSession:{id:"foreign"}},{planExecutionState:"confirmed"},{planExecutionState:"executing"}]){
      assert.throws(()=>bootstrap.assertIdle(status(projection,extra)));checks++;}
    for(const extra of [{pendingCommands:1},{inflightCommands:[{}]},{activeEditSession:{id:"foreign"}},{planExecutionState:"confirmed"},{planExecutionState:"executing"}]){assert.equal(panelIdle(status(projection,extra),true).code,"bridge_busy");checks++;}
    for(const plan of [{state:"confirmed"},{state:"executing"}]){assert.equal(panelIdle(status(projection),true,plan).code,"bridge_busy");checks++;}
    for(const change of [{pending:{}},{pendingTransition:{}},{activeTransition:{}},{generation:1},{enabled:false},{problem:"lifecycle_store_corrupt"},{freshMissingStoreReadAllowed:false}]){
      const modified={...projection,...change};assert.throws(()=>bootstrap.assertIdle(status(modified)));assert.equal(panelIdle(status(modified),true).code,"bridge_busy");checks+=2;}
  });
  for(const contents of ["null","{}","not-json",JSON.stringify(empty())])await using(async f=>{fs.writeFileSync(f.statePath,contents);assert.equal(f.storage.pendingProjection().freshMissingStoreReadAllowed,false);
    const a=adapter(f);await rejects(a.api.readProjectInfo(321),"lifecycle_bootstrap_read_ineligible");assert.equal(a.calls,0);checks++;});
  await using(async f=>{fs.writeFileSync(t.markerPath(f.statePath),JSON.stringify({schema:t.MARKER,storePathHash:c.hash(path.resolve(f.statePath))}));
    assert.equal(f.storage.pendingProjection().freshMissingStoreReadAllowed,false);fs.unlinkSync(t.markerPath(f.statePath));
    assert.equal(f.storage.pendingProjection().freshMissingStoreReadAllowed,false);await rejects(adapter(f).api.readProjectInfo(321),"lifecycle_bootstrap_read_ineligible");checks+=2;});
  await using(async f=>{fs.writeFileSync(f.statePath,JSON.stringify(empty()));assert.equal(f.storage.pendingProjection().freshMissingStoreReadAllowed,false);fs.unlinkSync(f.statePath);
    assert.equal(f.storage.pendingProjection().freshMissingStoreReadAllowed,false);await rejects(adapter(f).api.readProjectInfo(321),"lifecycle_bootstrap_read_ineligible");checks++;});
  await using(async f=>{const denied={...fs,existsSync:()=>false,lstatSync(){throw Object.assign(Error("access denied"),{code:"EACCES"});}};
    const storage=t.createLifecycleStorage({statePath:f.statePath,enabled:true,filesystem:denied});assert.equal(storage.pendingProjection().freshMissingStoreReadAllowed,false);
    await rejects(storage.withProjectInfoReadCapability(()=>assert.fail("ambiguous absence"),()=>true),"lifecycle_bootstrap_read_ineligible");checks++;});
  await using(async f=>{fs.writeFileSync(f.statePath,JSON.stringify({schema:t.V2,projectState:{},pendingLifecycle:null,lifecycleReceipts:[],lifecycleGeneration:0}));
    assert.equal(f.storage.pendingProjection().problem,"lifecycle_marker_missing");await rejects(adapter(f).api.readProjectInfo(321),"lifecycle_bootstrap_read_ineligible");checks++;});
  for(const busy of [s=>{s.activeEditSession={id:"foreign"};},s=>{s.currentProposalState.current={executionState:"confirmed"};},s=>{s.currentProposalState.current={executionState:"executing"};},s=>s.pendingCommands.push("foreign"),s=>s.inflightCommands.set("foreign",{})]){
    await using(async f=>{const input=idleState();busy(input);const a=adapter(f,input);await rejects(a.api.readProjectInfo(321),"lifecycle_bootstrap_read_ineligible");assert.equal(a.calls,0);checks++;});}
  await using(async f=>{const a=adapter(f,idleState(),({cap,body})=>throws(()=>a.api.validateCommand(cap,body+"app.newProject();","own-read"),"lifecycle_phase_capability_mismatch"));
    await a.api.readProjectInfo(321);checks++;});
  for(const drift of [({f})=>fs.writeFileSync(f.statePath,JSON.stringify(empty())),({f})=>fs.writeFileSync(t.markerPath(f.statePath),"corrupt"),
    ({input})=>{input.activeEditSession={id:"foreign"};},({input})=>{input.currentProposalState.current={executionState:"executing"};},({input})=>input.pendingCommands.push("foreign"),({input})=>input.inflightCommands.set("foreign",{})]){
    await using(async f=>{const a=adapter(f,idleState(),args=>drift({...args,f}));await rejects(a.api.readProjectInfo(321),"lifecycle_bootstrap_read_ineligible");checks++;});}
  await using(async f=>{fs.writeFileSync(f.statePath,JSON.stringify(empty()));const lease=f.storage.acquireAdmission({},()=>true);fs.unlinkSync(f.statePath);
    try{assert.equal(f.storage.pendingProjection().freshMissingStoreReadAllowed,false);await rejects(adapter(f).api.readProjectInfo(321),"lifecycle_bootstrap_read_ineligible");checks++;}finally{f.storage.releaseAdmission(lease);}});
  await using(async f=>{let lease;const a=adapter(f,idleState(),()=>{fs.writeFileSync(f.statePath,JSON.stringify(empty()));lease=f.storage.acquireAdmission({},()=>true);fs.unlinkSync(f.statePath);});
    try{await rejects(a.api.readProjectInfo(321),"lifecycle_bootstrap_read_ineligible");checks++;}finally{if(lease)f.storage.releaseAdmission(lease);}});
  // Real durable pending from the existing service; no native mutation needed.
  const f=fixture({nativeHook:({when,facts})=>{if(when==="before"&&!facts.readOnly)throw Error("offline_stop_before_mutation");}});try{await assert.rejects(f.service.execute("save_project_as",f.args(),f.context));assert(f.storage.pendingProjection().pending);
    await rejects(f.storage.withProjectInfoReadCapability(()=>assert.fail("pending must not reach callback"),()=>true),"lifecycle_bootstrap_read_ineligible");checks++;}finally{f.dispose();}
  await using(async f=>{const module={exports:{}},serviceSource=fs.readFileSync(path.join(__dirname,"../mcp-server/owned-runtime-service.js"),"utf8");
    vm.runInNewContext(serviceSource,{module,exports:module.exports,URL,require(name){if(name==="./owned-runtime-initial-runtime")return {createInitialRuntime:()=>null};return name.startsWith(".")?require(path.join(__dirname,"../mcp-server",name)):require(name);}});
    const service=module.exports.createOwnedRuntimeService({journalRoot:f.root,readPolicy:()=>({}),readReadiness:()=>({}),readAdmission:()=>false});
    await service.run("intake",()=>service.run("observation",()=>service.assertCommandTicket()));
    throws(()=>service.run("execution",()=>assert.fail("write admission remains closed")),"owned_service_retained_admission_closed");checks++;
    // Execute the actual HTTP route and logging dispatcher sources without a
    // listener. This checks intake -> typed observation, not a socket/auth proof.
    const a=adapter(f),wrapperStart=daemon.indexOf("function callToolLogged(source, name, args, executionContext)"),wrapperEnd=daemon.indexOf("async function callToolLoggedImpl",wrapperStart);
    const routeStart=daemon.indexOf('    if (url.pathname === "/mcp/tools/call"'),routeEnd=daemon.indexOf('    if (url.pathname.startsWith("/dev/tool/")',routeStart);
    const readStart=daemon.indexOf('  if (name === "get_project_info") {'),readEnd=daemon.indexOf('  if (name === "set_project_frames_count_type")',readStart);
    assert(wrapperStart>0&&wrapperEnd>wrapperStart&&routeStart>0&&routeEnd>routeStart&&readStart>0&&readEnd>readStart);
    const context=vm.createContext({URL,initialRuntime:null,deploymentMode:"product",ownedRuntimeService:service,lifecycle:a.api,
      panelBootstrap:bootstrap,panelBootstrapReadContext:{getStore:()=>null},panelControl:{isPanelControlTool:()=>false},
      toolByName:name=>({annotations:{readOnlyHint:name==="get_project_info"}}),MUTATING_TOOL_NAMES:new Set(["create_comp"]),
      PANEL_BOOTSTRAP_AUTHORITY:Symbol(),PANEL_CONTROL_AUTHORITY:Symbol(),autonomousSession:{authorization:()=>null},
      OWNED_TRUSTED_PROJECT_BODY:state.nativeProjectInfoBody(),runExtendScriptBody:()=>assert.fail("fresh fixed read must use capability"),
      toolResult:result=>({content:[{type:"text",text:JSON.stringify(result)}]}),decorateDaemonToolResult:(_name,result)=>result,
      requireToken:(_req,res)=>{res.authRole="automation";return true;},readJsonBody:async req=>req.testBody,
      writeJson:(res,status,body)=>{res.status=status;res.body=body;},m100HttpFailure:error=>({ok:false,code:error.code})});
    vm.runInContext('async function callToolLoggedImpl(source,name,args,executionContext){'+daemon.slice(readStart,readEnd)+'throw Error("unexpected_tool");}\n'+
      daemon.slice(wrapperStart,wrapperEnd)+'\nthis.router=async function(req,res){const url=new URL(req.url,"http://fixture");'+daemon.slice(routeStart,routeEnd)+'};',context);
    async function dispatch(name,marker="codex-stdio-v1"){const req={url:"/mcp/tools/call",method:"POST",headers:{"x-ae-mcp-adapter":marker},testBody:{name,arguments:{}}},res={};
      await service.ingress(req,()=>context.router(req,res));return res;}
    // Adapter's dependency budget is asserted so make this normal read's value
    // explicit; it is test-only context, not a bootstrap or execution grant.
    const originalRead=a.api.readProjectInfo;a.api.readProjectInfo=()=>originalRead(321);
    const read=await dispatch("get_project_info");assert.equal(read.status,200);assert.equal(JSON.parse(read.body.result.content[0].text).numItems,427);assert.equal(a.calls,1);
    const write=await dispatch("create_comp");assert.equal(write.status,500);assert.equal(write.body.code,"owned_service_retained_admission_closed");
    assert.equal((await dispatch("get_project_info","foreign")).status,403);assert.equal(a.calls,1);checks+=3;
  });
  // Production integration retains canonical-body equality and both command gates.
  assert(daemon.includes("const OWNED_TRUSTED_PROJECT_BODY = projectLifecycleState.nativeProjectInfoBody();"));
  assert(daemon.includes("? await lifecycle.readProjectInfo(timeoutMs)"));assert.equal((daemon.match(/lifecycle\.validateCommand\(command\.lifecycleCapability/g)||[]).length,1);checks++;
  console.log(JSON.stringify({ok:true,checks,actualDaemon:false,actualAe:false,nativeProcesses:0,stateProvisioned:false}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

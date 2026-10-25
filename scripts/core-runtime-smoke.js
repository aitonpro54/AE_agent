"use strict";
// Isolated product transport proof. No AE, CEP/CDP/bootstrap, native factory,
// provider, production endpoint, production state or actual credentials.
const assert=require("assert"),fs=require("fs"),path=require("path"),crypto=require("crypto"),{spawn}=require("child_process"),readline=require("readline");
const fixtureApi=require("./network-test-fixture");
const ROOT=path.resolve(__dirname,".."),digest=f=>crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
async function main(){
  const options={automationToken:crypto.randomBytes(32).toString("hex"),panelToken:crypto.randomBytes(32).toString("hex")};
  let fixture,adapter;const pending=new Map();let serial=0,stderr="";
  try{
    fixture=await fixtureApi.startDaemon(options);assert.notStrictEqual(fixture.port,3456);
    const adapterFile=path.join(fixture.launchRoot,"mcp-server/mcp-adapter.js"),daemonFile=path.join(fixture.launchRoot,"mcp-server/bridge-daemon.js");
    for(const [file,name]of [[adapterFile,"mcp-adapter.js"],[daemonFile,"bridge-daemon.js"]])assert.strictEqual(digest(file),digest(path.join(ROOT,"mcp-server",name)));
    assert.strictEqual(fixture.child.spawnargs[1],daemonFile);
    const env=fixtureApi.isolatedEnvironment(fixture.runtimeDir,{...options,port:fixture.port});
    assert.strictEqual(env.AE_DAEMON_AUTO_START,"0");assert.strictEqual(env.AE_BRIDGE_PORT,String(fixture.port));
    adapter=spawn(process.execPath,[adapterFile],{cwd:fixture.launchRoot,env,windowsHide:true,stdio:["pipe","pipe","pipe"]});
    adapter.stderr.on("data",b=>{stderr=(stderr+b).slice(-16000);});
    readline.createInterface({input:adapter.stdout}).on("line",line=>{const v=JSON.parse(line),p=pending.get(v.id);if(p){pending.delete(v.id);clearTimeout(p.timer);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result);}});
    function rpc(method,params){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error("isolated adapter timeout: "+stderr));},8000);pending.set(id,{resolve,reject,timer});adapter.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n");});}
    const init=await rpc("initialize",{});assert(init.instructions.includes("fixed deterministic"));assert(!init.instructions.includes("search_solutions"));
    const catalog=await rpc("tools/list",{}),names=catalog.tools.map(x=>x.name);
    for(const name of ["build_solution_plan","get_current_ai_agent_plan","propose_ai_agent_plan","run_ai_agent_plan","get_project_info"])assert(names.includes(name),name);
    for(const name of ["search_solutions","get_solution","list_solution_candidates","get_solution_candidate","list_ai_agents","chat_with_ai_agent","plan_with_ai_agent","run_agent_hardcore_session","get_task_usage","get_usage_history"])assert(!names.includes(name),name);
    const payload=r=>JSON.parse(r.content[0].text);
    const call=(name,args={})=>rpc("tools/call",{name,arguments:args});
    const status=payload(await call("get_bridge_status"));assert.strictEqual(status.humanGuardRuntime.pid,fixture.child.pid);assert.strictEqual(status.port,fixture.port);assert.strictEqual(status.panelConnected,false);
    const expected=require("../mcp-server/review-evidence").runtimeIdentity(ROOT);assert.strictEqual(status.humanGuardRuntime.sourceSha256,expected.sourceSha256);
    const unknown=await call("build_solution_plan",{solutionId:"removed-recipe",inputs:{}});assert.strictEqual(unknown.isError,true);assert.match(JSON.stringify(unknown),/Unsupported Core plan builder/);
    const builder=require("../mcp-server/solution-plan-builder"),id=builder.SUPPORTED_SOLUTION_IDS[0],inputs=builder.getBuilderContract(id).example;
    const built=payload(await call("build_solution_plan",{solutionId:id,inputs}));assert.strictEqual(built.ok,true);assert(built.plan.steps.length>0);
    // Valid stable identities and checkpoint arguments ensure that authority,
    // rather than a late input error, is the observed reason for rejection.
    for(const [name,args]of [
      ["update_text_layer",{compItemIndex:1,layerIndex:1,expectedCompItemId:101,expectedLayerId:201,text:"must not execute",autoCheckpoint:true,checkpointLabel:"isolated",confirm:true}],
      ["set_property_value",{compItemIndex:1,layerIndex:1,expectedCompItemId:101,expectedLayerId:201,propertyPath:["ADBE Transform Group","ADBE Opacity"],value:50,autoCheckpoint:true,confirm:true}],
      ["run_ai_agent_plan",{plan:{steps:[{tool:"update_text_layer",args:{compItemIndex:1,layerIndex:1,expectedCompItemId:101,expectedLayerId:201,text:"must not execute"}}]},dryRun:false,allowMutations:true,confirm:true}]
    ]){const direct=await call(name,args),blocked=payload(direct);assert.strictEqual(direct.isError,true,name);assert.strictEqual(blocked.code,"proposal_required",name);assert.strictEqual(blocked.m100.riskLevel,"mutating",name);assert.strictEqual(blocked.m100.requiresProposal,true,name);assert.strictEqual(blocked.m100.ignoredClientConfirmation,true,name);}
    const after=payload(await call("get_bridge_status"));assert.strictEqual(after.pendingCommands,0);assert.strictEqual(after.inflightCommands.length,0);
    console.log(JSON.stringify({ok:true,proof:"isolated offline product adapter+daemon",port:fixture.port,daemonPid:fixture.child.pid,adapterPid:adapter.pid,tools:names.length,sourceSha256:expected.sourceSha256,adapterSha256:digest(adapterFile),daemonSha256:digest(daemonFile),checks:["Core snapshot hashes and child argv","MCP initialize/catalog","pid and source-set readback","fixed builder success and unknown rejection","direct mutation refused without dispatch"],liveAE:false,nativeFactories:0}));
  }finally{
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error("fixture stopping"));}pending.clear();
    if(adapter)await fixtureApi.stopChild(adapter);
    if(fixture)await fixture.stop();
  }
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});

"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),{EventEmitter}=require("node:events");
const file=path.resolve(__dirname,"../mcp-server/owned-runtime-initial-runtime.js"),source=fs.readFileSync(file,"utf8");
function fixture(profile="shared_queue_v1",refuseRead=false){
  const sent=[],intents=[],role={},cap=()=>({});let binding=0;
  const native={selectedFixed:()=>true,openControllerFixed:()=>role,assertCurrent(){},open:async()=>{},ensure:async()=>({operation:2}),status:async()=>({state:4}),executionProfileFixed:()=>profile,
    beginBracket:async()=>cap(),beginRead:async()=>cap(),adoptBracket:async()=>cap(),beginExecutionFixed:async(_r,_a,intent)=>{intents.push(intent);return cap();},locator:()=>Buffer.from("01","hex"),
    fixedTransport:()=>Buffer.from(JSON.stringify({host:"127.0.0.1",port:3456,automationToken:"offline-only"})),revoke:async()=>{},sharedQueueStateFixed:()=>({ok:true,terminalMask:3,successMask:3,ownJobsQuiescent:true})};
  const http={request(_options,callback){const request=new EventEmitter();request.setTimeout=()=>{};request.destroy=()=>{};request.end=body=>queueMicrotask(()=>{
    const input=JSON.parse(body);sent.push(input);const reply=new EventEmitter();reply.complete=true;reply.statusCode=refuseRead&&input.name==="inspect_ame_title_queue_manifest"?409:200;callback(reply);
    const value={ok:true,slot:input.args.variantSlot,result:{ok:true},fixtureAuthority:false};reply.emit("data",Buffer.from(JSON.stringify({ok:true,result:{content:[{type:"text",text:JSON.stringify(value)}],isError:false}})));reply.emit("end");
  });return request;}};
  const context=vm.createContext({Buffer,URL,setTimeout,clearTimeout,Promise,process:{env:{}},module:{exports:{}},require(name){
    if(name==="./owned-runtime-initial-native-client")return native;
    if(name==="./owned-runtime-initial-source-census")return {requested:()=>false};
    if(name==="./owned-runtime-initial-observers")return {bindLoadedNodeFixed:async()=>({assertCurrent(){binding++;}})};
    if(name==="./owned-runtime-initial-title-plan")return {buildFixedTitlePlan:()=>({}),selectFixedTitleOperation:()=>({})};
    if(name==="./owned-runtime-ui-baseline")return {};
    if(name==="node:http")return http;throw Error("unexpected offline import "+name);
  }});vm.runInContext(source,context,{filename:file});const runtime=context.module.exports.createInitialRuntime();
  const own=value=>{context.json=JSON.stringify(value);return vm.runInContext("JSON.parse(json)",context);};
  const execute=(operation,slot)=>runtime.callTool("run_ai_agent_plan",own({actionId:"action",payloadRef:"payload",payloadHash:"payload-hash",previewHash:"preview",riskLevel:"mutating",riskPolicyVersion:"version",ownedTitleOperation:operation,variantSlot:slot,
    ownedTitleProgram:{schema:"ae-agent.owned-runtime-fixed-title-operation.v1",operation,slot,manifestSha25664:"a".repeat(64),facts:{}}}));
  return {runtime,sent,intents,execute,own,get binding(){return binding;}};
}
async function main(){
  const f=fixture();await f.runtime.ensure(f.own({}));const result=await f.execute("enqueue",1);assert.equal(JSON.parse(result.content[0].text).immediateOwnQueueRead.slot,1);assert.deepEqual(f.sent.slice(-2).map(x=>x.name),["run_ai_agent_plan","inspect_ame_title_queue_manifest"]);
  await f.execute("enqueue",2);assert.equal(f.sent.at(-1).args.variantSlot,2);await f.execute("restore",2);assert.deepEqual(f.sent.slice(-4).map(x=>x.name),["run_ai_agent_plan","get_bridge_status","get_project_info","get_bridge_status"]);
  const status=await f.runtime.callTool("get_ame_title_job_status",f.own({variantSlot:1}));assert.equal(JSON.parse(status.content[0].text).ownJobsQuiescent,true);
  const failed=fixture("shared_queue_v1",true);await failed.runtime.ensure(failed.own({}));await assert.rejects(()=>failed.execute("enqueue",1));const count=failed.sent.length;assert.equal(failed.runtime.status().status,"UNKNOWN");await assert.rejects(()=>failed.execute("enqueue",1));assert.equal(failed.sent.length,count);
  const legacy=fixture("two_title_media_v1");await legacy.runtime.ensure(legacy.own({}));await assert.rejects(()=>legacy.execute("stage",1),{code:"owned_initial_fixed_execute_producer_unbound"});
  await assert.rejects(()=>f.execute("start",1),{code:"owned_initial_shared_START_exact_slot"});
  process.stdout.write("owned-runtime shared queue runtime: PASS (offline VM, immediate own reads 2/2, restore READ, native state, UNKNOWN noReplay, profile isolation)\n");
}
main().catch(error=>{process.stderr.write(error.stack+"\n");process.exitCode=1;});

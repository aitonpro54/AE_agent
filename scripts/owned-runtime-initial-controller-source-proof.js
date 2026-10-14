"use strict";
// Controller source VM with explicit fake native/HTTP endpoints. No addon,
// actual controller/broker/daemon, socket, provider, AE/AME or disk mutation.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),{EventEmitter}=require("node:events");
function fixture(){const counts={factory:0,requests:0,read:0,execution:0,serverOnly:0,brackets:0},caps=new WeakSet(),calls=[];let closed=false,nextError=null,hold=null;
  const role={},own=()=>{const cap={};caps.add(cap);return cap;},current=cap=>{if(closed)throw Error("fixture_source_closed");if(cap!==undefined)assert(caps.has(cap));};
  const native={selectedFixed:()=>true,openControllerFixed:()=>{counts.factory++;return role;},assertCurrent:(_role,cap)=>{assert.equal(_role,role);current(cap);},open:async()=>{},ensure:async()=>({operation:2}),status:async()=>({state:4}),
    beginBracket:async()=>{counts.brackets++;return own();},adoptBracket:async()=>own(),beginPanel:async()=>own(),beginRead:async(_role,name)=>{counts.read++;calls.push({name,kind:"READ"});return own();},
    beginExecutionFixed:async(_role,read,intent)=>{current(read);counts.execution++;calls.push({name:intent.name,kind:"EXEC_PREP",intent});if(hold)await hold;if(nextError)throw nextError;return own();},
    beginServerOnlyFixed:async(_role,name,body)=>{counts.serverOnly++;calls.push({name,kind:"SERVER_ONLY",body});if(nextError)throw nextError;return own();},
    locator:(_role,cap)=>{current(cap);return Buffer.alloc(69,1);},fixedTransport:()=>Buffer.from(JSON.stringify({automationToken:"fixture",host:"127.0.0.1",port:3456})),revoke:async()=>{closed=true;}};
  const http={request(options,callback){counts.requests++;const request=new EventEmitter();request.setTimeout=()=>{};request.destroy=()=>{};request.end=body=>{calls.push({http:options,body:Buffer.from(body)});
      const reply=new EventEmitter();reply.statusCode=200;reply.complete=true;callback(reply);reply.emit("data",Buffer.from(JSON.stringify({ok:true,result:{content:[{type:"text",text:"fixture"}]}})));reply.emit("end");};return request;}};
  const module={exports:{}},context=vm.createContext({module,exports:module.exports,process:{env:{}},Buffer,console,setTimeout,clearTimeout,
    require:name=>({"./owned-runtime-initial-native-client":native,"./owned-runtime-initial-source-census":{requested:()=>false},"./owned-runtime-initial-observers":{bindLoadedNodeFixed:async()=>({assertCurrent:()=>current()})},"node:http":http})[name]});
  new vm.Script(fs.readFileSync(path.join(__dirname,"../mcp-server/owned-runtime-initial-runtime.js"),"utf8")).runInContext(context);const runtime=module.exports.createInitialRuntime();
  return {runtime,counts,calls,arg:text=>new vm.Script(`(${text})`).runInContext(context),close:()=>{closed=true;},error:error=>{nextError=error;},hold:promise=>{hold=promise;}};
}
async function main(){const cases=[];async function check(name,body){await body();cases.push({name,result:"PASS"});}
  await check("import_catalog_status_do_not_boot_and_deep_catalog_frozen",async()=>{const f=fixture();assert.equal(f.counts.factory,0);
    assert.deepEqual(Array.from(f.runtime.tools,tool=>tool.name),["ensure_ae_agent_panel","get_bridge_status","get_project_info","search_solutions","get_solution","get_comp_details","get_layer_details","inspect_title_variants","inspect_ame_title_sources","inspect_ame_title_queue_manifest","build_solution_plan","propose_ai_agent_plan","run_ai_agent_plan"]);f.runtime.status();
    assert(Object.isFrozen(f.runtime.tools[4].inputSchema.properties.toolNames.items));
    for(const name of ["inspect_ame_title_sources","inspect_ame_title_queue_manifest"]){const schema=f.runtime.tools.find(tool=>tool.name===name).inputSchema,slot=schema.properties.variantSlot;assert(Object.isFrozen(schema.properties));assert(Object.isFrozen(slot));assert.equal(slot.type,"integer");assert.equal(slot.minimum,1);assert.equal(slot.maximum,2);}
    assert.equal(f.counts.requests,0);});
  await check("AME_source_inspections_use_exact_variant_slots_and_original_C5",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));
    for(const [name,slot] of [["inspect_ame_title_sources",1],["inspect_ame_title_sources",2],["inspect_ame_title_queue_manifest",1],["inspect_ame_title_queue_manifest",2]]){
      await f.runtime.callTool(name,f.arg(`({variantSlot:${slot}})`));const intent=f.calls.filter(call=>call.kind==="EXEC_PREP").at(-1).intent;
      assert.equal(intent.name,name);assert.equal(intent.kind,5);assert.equal(intent.slot,slot);assert.equal(intent.leaf,4);assert(intent.canonicalBody.equals(f.calls.filter(call=>call.http).at(-1).body));}
    assert.equal(f.counts.execution,4);assert.equal(f.counts.requests,7);assert.equal(f.counts.factory,1);});
  await check("AME_source_inspection_caller_selectors_and_invalid_slots_refused_before_C5",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));
    for(const name of ["inspect_ame_title_sources","inspect_ame_title_queue_manifest"])for(const arg of ['{variantSlot:0}','{variantSlot:3}','{variantSlot:1,slot:1}','{variantSlot:1,kind:5}','{variantSlot:1,operation:"sources"}'])
      await assert.rejects(f.runtime.callTool(name,f.arg(arg)));
    assert.equal(f.counts.execution,0);assert.equal(f.counts.requests,0);assert.equal(f.counts.serverOnly,0);assert.equal(f.counts.factory,1);});
  await check("library_exact_SERVER_ONLY_canonical_body_with_no_READ",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));await f.runtime.callTool("search_solutions",f.arg('{query:"two",limit:2}'));
    assert.equal(f.counts.brackets,0);assert.equal(f.counts.serverOnly,1);const first=f.calls.find(c=>c.kind==="SERVER_ONLY"),sent=f.calls.find(c=>c.http);assert.equal(first.body.toString(),'{"args":{"limit":2,"query":"two"},"name":"search_solutions"}');assert(first.body.equals(sent.body));});
  await check("readonly_exact_C5_intent_native_READ_and_same_sent_body",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));await f.runtime.callTool("get_comp_details",f.arg('{includeLayers:true,compItemId:1}'));
    assert.equal(f.counts.brackets,1);assert.equal(f.counts.read,3);assert.equal(f.counts.execution,1);const intent=f.calls.find(c=>c.kind==="EXEC_PREP").intent;assert.equal(intent.kind,5);assert.equal(intent.slot,0);assert.equal(intent.leaf,4);
    assert.equal(Object.keys(intent).sort().join(","),"canonicalBody,kind,leaf,name,slot");assert(intent.canonicalBody.equals(f.calls.filter(c=>c.http).at(-1).body));});
  await check("writes_alternate_selector_and_response_projection_refused_before_C5",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));
    for(const [name,arg] of [["run_ai_agent_plan","{}"],["start_ame_title_batch","{}"],["get_comp_details","{kind:6,slot:1}"],["get_layer_details",'{layerId:1,responseView:"placeholder"}']])await assert.rejects(f.runtime.callTool(name,f.arg(arg)));
    assert.equal(f.counts.requests,0);assert.equal(f.counts.execution,0);assert.equal(f.counts.serverOnly,0);});
  await check("input_accessors_symbols_sparse_and_toJSON_are_never_invoked",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));
    for(const arg of ['({get query(){throw Error("getter_invoked");}})','({query:"q",[Symbol("x")]:true})','({query:"q",toJSON(){throw Error("toJSON_invoked");}})','({id:"id",toolNames:[,"x"]})']){
      await assert.rejects(f.runtime.callTool("get_solution",f.arg(arg)),error=>!/getter_invoked|toJSON_invoked/.test(error.message));}
    assert.equal(f.counts.requests,0);assert.equal(f.counts.serverOnly,0);});
  await check("huge_array_and_depth_input_bounds_refuse_without_C5",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));
    await assert.rejects(f.runtime.callTool("get_solution",f.arg('({id:"id",toolNames:new Array(1000000000)})')));await assert.rejects(f.runtime.callTool("get_solution",f.arg('({id:"id",toolNames:'+"[".repeat(13)+'"x"'+"]".repeat(13)+'})')));
    assert.equal(f.counts.requests,0);assert.equal(f.counts.serverOnly,0);});
  await check("expired_EXEC_PREP_is_not_implicitly_retried_or_renewed",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));f.error(Object.assign(Error("expired"),{code:"trusted_read_revalidation_required"}));
    await assert.rejects(f.runtime.callTool("get_comp_details",f.arg("{compItemId:1}")));assert.equal(f.counts.brackets,1);assert.equal(f.counts.execution,1);assert.equal(f.counts.requests,3);});
  await check("unknown_call_keeps_original_lifetime_closed_and_no_replay",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));f.error(Object.assign(Error("lost_ACK"),{unknown:true}));
    await assert.rejects(f.runtime.callTool("get_comp_details",f.arg("{compItemId:1}")));assert.equal(f.runtime.status().status,"UNKNOWN");await assert.rejects(f.runtime.callTool("get_comp_details",f.arg("{compItemId:1}")));assert.equal(f.counts.execution,1);assert.equal(f.counts.factory,1);});
  await check("post_LASTawait_source_loss_denies_HTTP_original_call_once",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));let settle;f.hold(new Promise(resolve=>{settle=resolve;}));
    const work=f.runtime.callTool("get_comp_details",f.arg("{compItemId:1}"));while(!f.counts.execution)await new Promise(resolve=>setImmediate(resolve));f.close();settle();await assert.rejects(work,/fixture_source_closed/);assert.equal(f.counts.requests,3);assert.equal(f.counts.execution,1);});
  await check("finite_build_uses_exact_own_READ_C5_scope_and_same_body",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));await f.runtime.callTool("build_solution_plan",f.arg('{solutionId:"owned-runtime-two-title-fixed-v1"}'));
    const intent=f.calls.find(c=>c.kind==="EXEC_PREP").intent;assert.equal(intent.name,"build_solution_plan");assert.equal(intent.kind,5);assert.equal(intent.slot,0);assert.equal(intent.leaf,4);assert(intent.canonicalBody.equals(f.calls.filter(c=>c.http).at(-1).body));});
  await check("caller_plan_or_other_build_selector_refused_before_C5",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));for(const arg of ['{solutionId:"other"}','{solutionId:"owned-runtime-two-title-fixed-v1",plan:{}}','{solutionId:"owned-runtime-two-title-fixed-v1",ready:true}'])await assert.rejects(f.runtime.callTool("build_solution_plan",f.arg(arg)));assert.equal(f.counts.execution,0);assert.equal(f.counts.requests,0);});
  await check("finite_proposal_exact_scoped_C5_and_original_body",async()=>{for(const [operation,slot,leaf] of [["checkpoint",0,14],["clean_copy",1,15],["stage",2,5],["enqueue",1,6],["start",2,7],["restore",2,8]]){const f=fixture();await f.runtime.ensure(f.arg("{}"));
    await f.runtime.callTool("propose_ai_agent_plan",f.arg(`({ownedTitleOperation:"${operation}",variantSlot:${slot}})`));const intent=f.calls.find(c=>c.kind==="EXEC_PREP").intent;
    assert.equal(intent.name,"propose_ai_agent_plan");assert.equal(intent.slot,slot);assert.equal(intent.leaf,leaf);assert.equal(intent.kind,5);assert(intent.canonicalBody.equals(f.calls.filter(c=>c.http).at(-1).body));}});
  await check("finite_proposal_caller_plan_and_wrong_scope_refused_before_C5",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));for(const arg of ['{ownedTitleOperation:"checkpoint",variantSlot:1}','{ownedTitleOperation:"stage",variantSlot:0}','{ownedTitleOperation:"stage",variantSlot:1,plan:{}}','{ownedTitleOperation:"stage",variantSlot:1,ready:true}','{ownedTitleOperation:"other",variantSlot:1}'])await assert.rejects(f.runtime.callTool("propose_ai_agent_plan",f.arg(arg)));assert.equal(f.counts.execution,0);assert.equal(f.counts.requests,0);});
  await check("finite_dry_run_has_exact_same_C5_scope_and_no_EXEC",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));await f.runtime.callTool("run_ai_agent_plan",f.arg('{actionId:"a",payloadRef:"p",payloadHash:"h",previewHash:"v",riskLevel:"mutating",riskPolicyVersion:"m100-risk-v1",ownedTitleOperation:"checkpoint",variantSlot:0,dryRun:true}'));
    const intent=f.calls.find(c=>c.kind==="EXEC_PREP").intent;assert.equal(intent.name,"run_ai_agent_plan");assert.equal(intent.kind,5);assert.equal(intent.leaf,14);assert.equal(intent.slot,0);assert(intent.canonicalBody.equals(f.calls.filter(c=>c.http).at(-1).body));});
  await check("dry_run_false_generic_plan_confirmation_and_extra_fields_refused_before_C5",async()=>{const f=fixture();await f.runtime.ensure(f.arg("{}"));for(const extra of ['dryRun:false','dryRun:true,confirm:true','dryRun:true,plan:{}','dryRun:true,ownedTitleProgram:{}']){
    await assert.rejects(f.runtime.callTool("run_ai_agent_plan",f.arg('{actionId:"a",payloadRef:"p",payloadHash:"h",previewHash:"v",riskLevel:"mutating",riskPolicyVersion:"m100-risk-v1",ownedTitleOperation:"checkpoint",variantSlot:0,'+extra+'}')));}assert.equal(f.counts.execution,0);assert.equal(f.counts.requests,0);});
  return {schema:"ae-agent.initial-controller-source-proof.v1",cases,ok:true,actualNativeFactories:0,actualHttp:false,actualAe:false,productionAuthority:false,actualEffects:0};
}
main().then(result=>process.stdout.write(JSON.stringify(result)+"\n"),error=>{process.stderr.write(error.stack+"\n");process.exitCode=1;});

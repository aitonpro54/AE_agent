"use strict";
// Actual isolated HTTP daemon + MCP/CEP gates; AE evaluation is an offline VM.
const assert = require("assert/strict"), fs = require("fs"), path = require("path"), crypto = require("crypto"), http = require("http"), vm = require("vm");
const {spawn} = require("child_process");
const {fixture} = require("./project-lifecycle-fixture");
const {isolatedEnvironment, reserveLoopbackPort, stopChild} = require("./network-test-fixture");
const {commandIdentity} = require("./fake-project-panel");
const c = require("../mcp-server/project-lifecycle-contract"), m = require("../mcp-server/project-intent-memory"), p = require("../mcp-server/placeholder-protection");
const transition = require("../mcp-server/project-lifecycle-transition");
const ROOT = path.resolve(__dirname, ".."), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function payload(response) { const result = response.body.result; return result && result.content ? JSON.parse(result.content[0].text) : null; }
let checks = 0;
async function scenario(options, fn) {
  const f = fixture(), port = await reserveLoopbackPort(), token = "offline-lifecycle-automation", panelToken = "offline-lifecycle-panel", adminToken = "offline-lifecycle-admin";
  const env = isolatedEnvironment(f.root, {port, automationToken:token, panelToken, adminToken, devAdmin:true, commandTimeoutMs:4000});
  env.AE_PROJECT_LIFECYCLE_ENABLED = options.enabled === false ? "0" : "1";
  const statePath = path.join(env.AE_BRIDGE_STATE_DIR, "project-intent-state.json");
  const policy = m.loadProjectStateStore({statePath:f.statePath});
  if (options.open) { fs.writeFileSync(f.target,"existing offline target disk"); policy.projectState[m.projectStateKey(f.target)]=transition.defaultState(f.target); }
  if (options.policy) {
    const native = c.validateInventory(JSON.parse(JSON.stringify(f.execute("(function(){" + c.nativeInventoryScript() + "})()"))));
    const evidence = JSON.parse(JSON.stringify(f.execute("(function(){" + p.aeSupportScript + "return __phEvidence(app.project.item(2),app.project.item(2).layer(1),[]);})()")));
    const source = policy.projectState[m.projectStateKey(f.source)];
    source.acceptedPlaceholders = [p.snapshotFromEvidence(evidence, {complete:true, comps:[{itemId:2,layers:native.items[1].layers}]}, [])];
    source.groupMappings = [{mediaKey:"fixture-media", groupId:"fixture-group", provenance:"user_confirmed", confirmed:true}];
    source.constraints = {distinctGroups:true, disallowSourceOverlap:true, selectedTargets:[{compItemId:2,layerId:101}]};
  }
  if (options.store !== false) fs.writeFileSync(statePath, JSON.stringify(policy));
  let child = null, stderr = "", nativeHook = null; const commands = [];
  function request(route, body, credential = token, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({hostname:"127.0.0.1",port,path:route,method:body === undefined ? "GET" : "POST",headers:{"content-type":"application/json","x-ae-bridge-token":credential,...headers},timeout:6000}, res => {
        let raw=""; res.on("data",chunk=>{raw+=chunk;}); res.on("end",()=>{try{resolve({status:res.statusCode,body:JSON.parse(raw)});}catch(error){reject(error);}});
      }); req.on("error",reject); req.on("timeout",()=>req.destroy(new Error("fixture request timeout: "+route))); req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  async function start() {
    child=spawn(process.execPath,[path.join(ROOT,"mcp-server/bridge-daemon.js")],{cwd:ROOT,env,windowsHide:true,stdio:["ignore","ignore","pipe"]});
    child.stderr.on("data",chunk=>{stderr=(stderr+chunk).slice(-20000);});
    for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error(stderr);try{if((await request("/health")).body.ok)return;}catch(_){}await pause(30);}throw new Error("daemon not ready: "+stderr);
  }
  function panelRoute() { return "/bridge/next?" + new URLSearchParams({panelConnectionId:"lifecycle-offline-panel",panelGeneration:"1",projectFile:f.runtime.app.project.file.fsName}); }
  async function pump(action) {
    await request(panelRoute(), undefined, panelToken); let finished = false;
    const pending = Promise.resolve().then(action).finally(()=>{finished=true;}); pending.catch(()=>{});
    const deadline = Date.now()+25000;
    while(!finished){if(Date.now()>deadline)throw new Error("bounded fixture pump exceeded 25s");const polled=await request(panelRoute(),undefined,panelToken);const command=polled.body.command;
      if(!command){await pause(5);continue;}commands.push(command);
      const identity=commandIdentity(command);assert.equal((await request("/bridge/submitted",identity,panelToken)).body.ok,true);
      let raw; try { if(nativeHook)await nativeHook("before",command);raw=f.execute(command.script);if(nativeHook)await nativeHook("after",command); }
      catch(error){raw=JSON.stringify({ok:false,error:String(error)});}
      assert.equal(typeof raw,"string");
      const done=await request("/bridge/result",{...identity,ok:true,result:raw},panelToken);assert.equal(done.body.ok,true,JSON.stringify(done.body));
    }return pending;
  }
  const tool = (name,args={}) => pump(()=>request("/mcp/tools/call",{name,arguments:args},token,{"x-ae-mcp-adapter":"codex-stdio-v1"}));
  const propose = plan => pump(()=>request("/agents/plan/propose",{plan,repairPlan:false},panelToken));
  const fields = proposal => ({actionId:proposal.actionId,payloadHash:proposal.action.payloadHash,previewHash:proposal.action.previewHash,riskLevel:proposal.risk.level,riskPolicyVersion:proposal.confirmation.riskPolicyVersion,confirmationToken:proposal.confirmation.confirmationToken,confirmedBySurface:proposal.confirmation.surface,confirmedBySession:proposal.confirmation.sessionId||""});
  const run = (proposal,opts) => pump(()=>request("/agents/plan/run",{...fields(proposal),...opts},panelToken));
  try { await start(); await fn({f,env,statePath,commands,request,pump,tool,propose,run,fields,policy,setHook:fn=>{nativeHook=fn;},restart:async()=>{await stopChild(child);child=null;await start();}}); }
  finally { await stopChild(child); f.dispose(); }
}
async function main() {
  await scenario({policy:true},async s=>{
    const tools=(await s.request("/tools")).body.tools;
    for(const name of c.MUTATIONS){const definition=tools.find(t=>t.name===name);assert(definition);assert.equal(definition.inputSchema.additionalProperties,false);assert(!("idempotencyKey" in definition.inputSchema.properties));assert(!("verifyAfter" in definition.inputSchema.properties));checks++;}
    const args=s.f.args(), plan={summary:"Offline protected copy",targetProject:{file:s.f.source},risk:"high",steps:[{tool:"save_project_as",args}]};
    for(const extra of [{overwrite:true},{authorization:{confirmed:true}},{phase:"save_stage"},{verifyAfter:false},{idempotencyKey:"fake"}]) {
      const invalid=await s.request("/agents/plan/validate",{plan:{...plan,steps:[{tool:"save_project_as",args:{...args,...extra}}]},repairPlan:false});assert.equal(invalid.body.validation.ok,false);checks++;
    }
    for(const malformed of [{...plan,steps:[...plan.steps,{tool:"get_project_info",args:{}}]},{...plan,steps:[{...plan.steps[0],resultBindings:{}}]}]){assert.equal((await s.request("/agents/plan/validate",{plan:malformed,repairPlan:false})).body.validation.ok,false);checks++;}
    const direct=await s.request("/mcp/tools/call",{name:"save_project_as",arguments:args},undefined,{"x-ae-mcp-adapter":"codex-stdio-v1"});assert.equal(payload(direct).code,"lifecycle_manual_only");checks++;
    const admin=await s.request("/dev/tool/save_project_as",args,"offline-lifecycle-admin");assert.equal(admin.status,403);checks++;
    const state=payload(await s.tool("get_project_lifecycle_state"));assert.equal(state.file,s.f.source);assert.equal(state.lifecycle.enabled,true);checks++;
    const invalidState=await s.request("/dev/tool/get_project_lifecycle_state?phase=save_stage",undefined,"offline-lifecycle-admin");assert.equal(invalidState.body.result.code,"invalid_lifecycle_state_input");checks++;
    const built=payload(await s.tool("build_project_lifecycle_plan",{operation:"save_project_as",targetProjectFile:s.f.target,checkpointLabel:"offline"}));assert.equal(built.projectMutations,0);assert.equal(built.plan.steps.length,1);checks++;
    const recipe=payload(await s.tool("build_solution_plan",{solutionId:"guarded-project-lifecycle",inputs:{operation:"save_project_as",targetProjectFile:s.f.target,checkpointLabel:"offline"}}));assert.equal(recipe.ok,true,JSON.stringify(recipe));assert.equal(recipe.projectMutations,0);assert.equal(recipe.validation.ok,true);checks++;
    const proposed=await s.propose(plan);assert.equal(proposed.body.ok,true,JSON.stringify(proposed.body));const proposal=proposed.body.proposal;assert.equal(proposal.risk.level,"destructive");
    const missingDry=await s.run(proposal,{dryRun:false,confirm:true,allowMutations:true,autoEditSession:true});assert.equal(missingDry.body.run.errorCode,"project_save_dry_run_required");checks++;
    const dry=await s.run(proposal,{dryRun:true});assert.equal(dry.body.run.ok,true,JSON.stringify(dry.body));assert(dry.body.run.lifecyclePreflight);assert.equal(dry.body.run.executedCount,0);checks++;
    const sourceBytes=fs.readFileSync(s.f.source), sourceState=c.clone(s.policy.projectState[m.projectStateKey(s.f.source)]);
    const actual=await s.run(proposal,{dryRun:false,confirm:true,allowMutations:true,autoEditSession:true});assert.equal(actual.body.run.ok,true,JSON.stringify({code:actual.body.code,error:actual.body.run.error,steps:actual.body.run.steps.map(step=>({tool:step.tool,status:step.status,error:step.error,commands:step.commands && step.commands.length})),semantic:actual.body.run.semanticVerification}));
    assert.equal(actual.body.run.semanticVerification.status,"passed"); const receipt=actual.body.run.steps[0].result.lifecycleReceipt;c.verifyReceipt(receipt);assert(fs.readFileSync(s.f.source).equals(sourceBytes));
    const store=m.loadProjectStateStore({statePath:s.statePath});assert.equal(store.lifecycleGeneration,1);assert.equal(store.pendingLifecycle,null);assert.deepEqual(c.clone(store.projectState[m.projectStateKey(s.f.source)]),sourceState);
    const target=store.projectState[m.projectStateKey(s.f.target)];assert.deepEqual(target.acceptedPlaceholders,sourceState.acceptedPlaceholders);assert.deepEqual(target.groupMappings,sourceState.groupMappings);assert.deepEqual(target.constraints,sourceState.constraints);assert.equal(Object.keys(target.reviewArtifacts).length,0);
    assert(actual.body.run.steps[0].commands.some(row=>row.role==="readback"&&row.state==="completed"&&row.ok===true&&row.executionId===actual.body.run.id&&row.completedAt));checks++;
    const replay=await s.run(proposal,{dryRun:false,confirm:true,allowMutations:true,autoEditSession:true});assert.equal(replay.body.ok,false);checks++;
    assert.equal(s.commands.filter(cmd=>cmd.script.includes("app.project.save(__lcDestination)")).length,1);assert.equal(s.commands.filter(cmd=>cmd.script.includes("app.open(__lcDestination)")).length,1);checks++;
  });
  await scenario({enabled:false},async s=>{
    assert.equal(payload(await s.tool("get_project_lifecycle_state")).lifecycle.enabled,false);
    const built=payload(await s.tool("build_project_lifecycle_plan",{operation:"save_project_as",targetProjectFile:s.f.target,checkpointLabel:"offline"}));assert.equal(built.code,"lifecycle_disabled");
    assert.equal(fs.existsSync(s.statePath+".lifecycle-initialized.json"),false);checks++;
  });
  for (const operation of ["open_project","create_named_project"])await scenario({open:operation==="open_project"},async s=>{
    const args={...s.f.args(),...(operation==="open_project"?{expectedTargetSavedSha25664:c.hash(fs.readFileSync(s.f.target))}:{})},sourceBytes=fs.readFileSync(s.f.source);
    const plan={summary:"Offline "+operation,targetProject:{file:s.f.source},risk:"high",steps:[{tool:operation,args}]},proposal=(await s.propose(plan)).body.proposal;
    assert(proposal);assert.equal((await s.run(proposal,{dryRun:true})).body.run.ok,true);
    const actual=await s.run(proposal,{dryRun:false,confirm:true,allowMutations:true,autoEditSession:true});assert.equal(actual.body.run.ok,true,JSON.stringify({code:actual.body.code,error:actual.body.run.error,semantic:actual.body.run.semanticVerification}));
    assert.equal(actual.body.run.semanticVerification.status,"passed");assert(fs.readFileSync(s.f.source).equals(sourceBytes));if(operation==="create_named_project")assert.equal(s.f.runtime.app.project.numItems,0);checks++;
  });
  await scenario({},async s=>{
    const args=s.f.args(),plan={summary:"Collision",targetProject:{file:s.f.source},risk:"high",steps:[{tool:"save_project_as",args}]};
    fs.writeFileSync(s.f.target,"collision");const proposal=(await s.propose(plan)).body.proposal;assert(proposal);
    const dry=await s.run(proposal,{dryRun:true});assert.equal(dry.body.run.errorCode,"lifecycle_target_exists");assert.equal(s.commands.filter(cmd=>cmd.script.includes("app.project.save(__lcDestination)")).length,0);checks++;
  });
  await scenario({},async s=>{
    const args=s.f.args(),plan={summary:"Autonomy must deny lifecycle",targetProject:{file:s.f.source},risk:"high",steps:[{tool:"save_project_as",args}]};
    const proposal=(await s.propose(plan)).body.proposal;const dry=await s.run(proposal,{dryRun:true});assert.equal(dry.body.run.ok,true);
    const autonomy=await s.request("/autonomy/session",{enabled:true,panelConnectionId:"lifecycle-offline-panel",panelGeneration:"1"},"offline-lifecycle-panel");assert.equal(autonomy.body.ok,true,JSON.stringify(autonomy.body));
    const direct=await s.tool("run_ai_agent_plan",{...s.fields(proposal),dryRun:false});const directPayload=payload(direct);assert.equal(directPayload.errorCode || directPayload.code || directPayload.run?.errorCode,"lifecycle_manual_only",JSON.stringify(directPayload));
    assert.equal(s.commands.filter(cmd=>cmd.script.includes("app.project.save(__lcDestination)")).length,0);checks++;
  });
  await scenario({},async s=>{
    const args=s.f.args(),plan={summary:"Stale approved native pins",targetProject:{file:s.f.source},risk:"high",steps:[{tool:"save_project_as",args}]};
    const proposal=(await s.propose(plan)).body.proposal;assert.equal((await s.run(proposal,{dryRun:true})).body.run.ok,true);s.f.runtime.app.project.revision++;
    const stale=await s.run(proposal,{dryRun:false,confirm:true,allowMutations:true,autoEditSession:true});assert.equal(stale.body.run.ok,false);assert.equal(s.commands.filter(cmd=>cmd.script.includes("app.project.save(__lcDestination)")).length,0);assert.equal(fs.existsSync(s.statePath+".lifecycle-initialized.json"),false);checks++;
  });
  for(const corruption of ["missing","corrupt"])await scenario({store:corruption!=="missing"},async s=>{
    if(corruption==="corrupt")fs.writeFileSync(s.statePath,"{broken");
    const state=payload(await s.tool("get_project_lifecycle_state"));assert.equal(state.file,s.f.source);assert.equal(state.lifecycle.problem,"lifecycle_store_"+(corruption==="missing"?"missing":"corrupt"));
    const writer=await s.request("/dev/tool/create_comp",{name:"must-block",width:1920,height:1080,duration:3,frameRate:25},"offline-lifecycle-admin");assert.equal(writer.body.ok,false);assert.equal(writer.body.m100Message?.error?.code || writer.body.code,"lifecycle_store_"+(corruption==="missing"?"missing":"corrupt"));
    const reconciled=payload(await s.tool("reconcile_project_lifecycle",{transitionId:crypto.randomUUID()}));assert.equal(reconciled.stateWrites,false);assert.equal(reconciled.nativeReplay,false);checks++;
  });
  await scenario({},async s=>{
    const args=s.f.args(),plan={summary:"Offline failure",targetProject:{file:s.f.source},risk:"high",steps:[{tool:"save_project_as",args}]};
    const proposal=(await s.propose(plan)).body.proposal;assert.equal((await s.run(proposal,{dryRun:true})).body.run.ok,true);
    s.setHook((when,command)=>{if(when==="after"&&command.script.includes("app.project.save(__lcDestination)"))throw new Error("offline delivery outcome withheld");});
    const failed=await s.run(proposal,{dryRun:false,confirm:true,allowMutations:true,autoEditSession:true});assert.equal(failed.body.run.ok,false);
    const before=m.loadProjectStateStore({statePath:s.statePath}),pending=before.pendingLifecycle;assert(pending&&pending.possibleDelivery);assert.equal(pending.status,"unknown");
    const nativeMutations=s.commands.filter(cmd=>cmd.script.includes("app.project.save(__lcDestination)")||cmd.script.includes("app.open(__lcDestination)")).length;
    s.setHook(null);const storeBytes=fs.readFileSync(s.statePath);const rec=payload(await s.tool("reconcile_project_lifecycle",{transitionId:pending.transitionId}));assert.equal(rec.nativeReplay,false);assert(fs.readFileSync(s.statePath).equals(storeBytes));
    await s.restart();const state=payload(await s.tool("get_project_lifecycle_state"));assert.equal(state.lifecycle.pending.transitionId,pending.transitionId);assert.equal(state.lifecycle.blocked,true);
    const blocked=await s.request("/dev/tool/create_comp",{name:"blocked",width:1920,height:1080,duration:3,frameRate:25},"offline-lifecycle-admin");assert.equal(blocked.body.ok,false);
    assert.equal(s.commands.filter(cmd=>cmd.script.includes("app.project.save(__lcDestination)")||cmd.script.includes("app.open(__lcDestination)")).length,nativeMutations);checks++;
  });
  await scenario({},async s=>{
    const args=s.f.args(),plan={summary:"Offline proven final with interrupted read-back",targetProject:{file:s.f.source},risk:"high",steps:[{tool:"save_project_as",args}]};
    const proposal=(await s.propose(plan)).body.proposal;assert.equal((await s.run(proposal,{dryRun:true})).body.run.ok,true);
    let targetReads=0;
    s.setHook((when,command)=>{if(when==="before"&&command.script.includes(c.VERSION+".inventory")&&s.f.runtime.app.project.file.fsName===s.f.target&&++targetReads===2)throw new Error("offline final read interrupted after retirement");});
    const failed=await s.run(proposal,{dryRun:false,confirm:true,allowMutations:true,autoEditSession:true});assert.equal(failed.body.run.ok,false);
    const pending=m.loadProjectStateStore({statePath:s.statePath}).pendingLifecycle;assert(pending&&pending.proof);assert.equal(pending.phase,"final_proven");s.setHook(null);
    await s.restart();const freshPlan={summary:"State-only finalize",targetProject:{file:s.f.target},risk:"high",steps:[{tool:"finalize_project_lifecycle",args:{transitionId:pending.transitionId}}]};
    const fresh=(await s.propose(freshPlan)).body.proposal;assert(fresh);assert.equal((await s.run(fresh,{dryRun:true})).body.run.ok,true);
    const nativeMutations=s.commands.filter(cmd=>cmd.script.includes("app.project.save(__lcDestination)")||cmd.script.includes("app.open(__lcDestination)")||cmd.script.includes("app.newProject()")).length;
    const finalized=await s.run(fresh,{dryRun:false,confirm:true,allowMutations:true});assert.equal(finalized.body.run.ok,true,JSON.stringify({code:finalized.body.code,error:finalized.body.run.error,semantic:finalized.body.run.semanticVerification}));
    assert.equal(finalized.body.run.semanticVerification.status,"passed");const receipt=finalized.body.run.steps[0].result.lifecycleReceipt;assert.equal(receipt.finalizedBy.runId,finalized.body.run.id);assert.equal(receipt.authorization.runId,failed.body.run.id);
    assert.equal(s.commands.filter(cmd=>cmd.script.includes("app.project.save(__lcDestination)")||cmd.script.includes("app.open(__lcDestination)")||cmd.script.includes("app.newProject()")).length,nativeMutations);assert.equal(m.loadProjectStateStore({statePath:s.statePath}).pendingLifecycle,null);checks++;
  });
  console.log("project-lifecycle-bridge-smoke PASS",checks,"actual isolated daemon/MCP/CEP gates; native scripts evaluated offline in VM");
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});

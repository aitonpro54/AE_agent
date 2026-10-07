"use strict";

// Production full-panel VM, fake XHR/CSInterface only. No daemon/CDP/AE/provider calls.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const contract=require("../cep-panel/panel-action-contract");
const createService=require("../cep-panel/panel-actions");
const {createPanelEnvironment,makeActionProposal,makeCurrentPlan}=require("./cep-plan-refresh-smoke");
const panel=fs.readFileSync(path.join(__dirname,"../cep-panel/panel.js"),"utf8");
const coverage=new Set(),scenarios=[];
function test(name,fn) {fn();scenarios.push(name);}
function envelope(action,args,id) {return {protocolVersion:contract.PROTOCOL_VERSION,requestId:id || crypto.randomUUID(),action,args:args || {}};}
function copy(value) {return JSON.parse(JSON.stringify(value));}
const agents=[
  ["openai-cli","openai",false],["openai-api","openai",true],["gemini-api","gemini",true],
  ["claude-api","claude",true],["openrouter","openrouter",true],["ollama-local","ollama",false]
].map(([id,provider,requiresApiKey])=>({id,provider,label:id,configured:true,canChat:true,reachable:true,
  modelAvailable:true,model:"fixture-model",models:["fixture-model"],requiresApiKey,
  codexStatus:id === "openai-cli"?{installed:true,loggedIn:true}:undefined,setupAction:id === "openai-cli"?"codex_login":undefined}));
function fixture(options={}) {
  const env=createPanelEnvironment(panel,options);
  let current=null,runSeq=0,emergencyDisabled=false;
  const bodyFor=req=>{
    if(req.path === "/tools/call") {
      const result=req.body.name === "get_bridge_status" ? {pendingCommands:0,inflightCommands:[],activeEditSession:null,projectLifecycle:{blocked:false,pending:null}} :
        {status:"reconciled",steps:[{index:1,tool:"create_comp",mutationStatus:"applied"}],replayAllowed:false};
      return {result:{content:[{text:JSON.stringify(result)}]}};
    }
    if(req.path === "/agents/plan/current") return {ok:true,current:copy(current)};
    if(req.path === "/agents/plan/adopt") {
      const proposal=makeActionProposal("adopted-"+(++runSeq),"confirm_"+"a".repeat(48));
      proposal.revision=current.revision+1;
      proposal.confirmation.sessionId=req.body.confirmationSessionId;
      proposal.risk=copy(current.proposal.risk);proposal.action.kind=current.proposal.action.kind;
      const plan=copy(current.plan),validation=copy(current.validation);
      current=makeCurrentPlan(proposal.actionId,proposal.revision,copy(proposal));
      current.plan=plan;current.validation=validation;
      delete current.proposal.confirmation.confirmationToken;
      return {ok:true,proposal,revision:proposal.revision,plan:copy(current.plan),validation:copy(current.validation)};
    }
    if(req.path === "/agents/plan/run") return {ok:true,run:{id:"run-"+(++runSeq),ok:true,dryRun:req.body.dryRun,
      validation:copy(current.validation),outcome:{execution:{status:"completed"},mutation:{status:req.body.dryRun?"not_started":"applied"},verification:{status:"passed"}}}};
    if(req.path === "/agents/dev-request") return {ok:true,bundle:{path:"fixture-bundle"}};
    if(req.path.indexOf("/agents/readiness?") === 0) {
      const id=new URL("http://fixture"+req.path).searchParams.get("agentId");
      return {readiness:{agent:copy(agents.find(a=>a.id===id)),configured:true,canChat:true,reachable:true,modelAvailable:true,status:"ready"}};
    }
    if(req.path.indexOf("/agents?") === 0) return {agents:copy(agents),defaultAgentId:"openai-cli"};
    if(req.path === "/agents/key") return {ok:true,readiness:{agent:copy(agents.find(a=>a.id===req.body.agentId)),canChat:true,reachable:true,modelAvailable:true}};
    if(req.path === "/agents/setup") return {setup:{launched:false,message:"fixture setup ready"}};
    if(req.path === "/agents/chat") return {result:{text:"Ответ VM без сети",model:"fixture-model"}};
    if(req.path === "/agents/plan" || req.path === "/agents/plan/propose") {
      current=makeCurrentPlan("from-chat-"+(++runSeq),1);
      return req.path === "/agents/plan/propose" ? {proposal:copy(current.proposal),validation:copy(current.validation),repairedPlan:copy(current.plan)} :
        {result:{plan:copy(current.plan),planValidation:copy(current.validation),m100ActionProposal:copy(current.proposal),requestId:current.proposal.requestId}};
    }
    if(req.path === "/agents/hardcore/run") return {session:{sessionId:"fixture-hardcore",status:"verified",ok:true,attempts:[],
      finalRun:{id:"fixture-hardcore-no-effect",ok:true,executedCount:0,validation:{mutatingCount:0},steps:[],
        outcome:{execution:{status:"not_started"},mutation:{status:"not_started"},verification:{status:"not_required"}}}}};
    if(req.path === "/autonomy/session") return {session:{desiredEnabled:req.body?req.body.enabled:env.desiredEnabled || false,connectionReady:true}};
    if(req.path === "/placeholder/protection") return {ok:true,acceptedCount:1,groupMappings:[{groupId:"group-vm"}],constraints:{distinctGroups:true,disallowSourceOverlap:true}};
    if(req.path === "/emergency-disable") {emergencyDisabled=true;return {status:{connector:{connected:true,emergencyDisabled:true}}};}
    if(req.path.indexOf("/status?")===0) return {status:{connector:{connected:true,publicUrlConfigured:true,writeActionsEnabled:!emergencyDisabled,emergencyDisabled,exposedToolsSnapshot:[]}}};
    if(req.path === "/usage" || req.path === "/usage/refresh") return {usage:{sources:{native:{status:"available"}}}};
    return {ok:true,command:null,version:"3.3.0"};
  };
  function drain() {
    let guard=0;
    while(env.inFlightRequests.length) {
      assert(++guard<100,"Bounded fake fixture must terminate");
      const req=env.inFlightRequests[0],body=bodyFor(req);
      if(req.path === "/autonomy/session" && req.body) env.desiredEnabled=req.body.enabled;
      req.respond(200,body);
    }
  }
  function invoke(action,args={},options={}) {
    coverage.add(action);const request=envelope(action,args,options.requestId),initial=env.invoke(request);
    if(!options.hold && /^(accepted|running)$/.test(initial.state)) drain();
    const result=env.api.getResult(request.requestId) || initial;
    if(!options.allowFailure && !options.hold) assert.equal(result.state,"completed",action+": "+JSON.stringify(result));
    return {request,initial,result};
  }
  function connect() {invoke("bridge.configure",{url:"http://127.0.0.1:8777",panelToken:"fixture-panel-private"});invoke("bridge.connect");}
  function pins() {return copy(env.api.state().plan.pins);}
  function setCurrent(value) {
    if(current && value && value.actionId !== current.actionId) value.revision=value.proposal.revision=current.revision+1;
    current=value;
  }
  return {env,invoke,drain,connect,pins,setCurrent,getCurrent:()=>current};
}

test("strict contract/schema/redaction/frozen service",()=>{
  for(const def of contract.ACTION_CATALOG) {
    const args={};for(const key of def.schema.required || []) {
      const schema=def.schema.properties[key];
      args[key]=schema.type==="string"?schema.enum?.[0] || "x":schema.type==="boolean"?true:schema.type==="object"?{}:1;
    }
    args.selector="#save";
    assert.equal(contract.validateEnvelope(envelope(def.name,args)).ok,false,def.name+" extra fields");
  }
  assert.equal(contract.validateEnvelope(envelope("ui.sidebar.set",{collapsed:"true"})).ok,false);
  assert.equal(contract.validateEnvelope(envelope("ui.sidebar.set",{collapsed:true},"not-uuid")).ok,false);
  assert.equal(contract.validateEnvelope(envelope("plan.run",{confirm:true,pins:{actionId:"only"}})).ok,false);
  for(const url of ["https://localhost","http://localhost:70000","http://localhost/path","http://localhost?token=x","http://localhost@evil","http://localhost\\@evil","http://localhost#x"]) assert.equal(contract.validateLoopbackUrl(url),false,url);
  const poison=JSON.parse('{"__proto__":{}}');assert.equal(contract.validateEnvelope(poison).ok,false);
  const env=fixture().env;
  assert(Object.isFrozen(env.api));assert.deepEqual(Object.keys(env.api).sort(),["catalog","getResult","invoke","protocolVersion","state"]);
  assert.equal(env.window.AEAgentPanelActionBootstrap,undefined);
  const cat=env.api.catalog();assert.equal(cat.length,48);assert(cat.every(item=>item.schema.additionalProperties===false));
  const sanitized=contract.redactState(cat);
  assert(sanitized.find(item=>item.name==="chat.send").schema.properties.prompt);
  assert(sanitized.find(item=>item.name==="bridge.configure").schema.properties.panelToken.writeOnly);
  assert(!JSON.stringify(env.api.state()).includes("fixture-panel-private"));
});

test("actual UI/listeners and all local/provider handlers",()=>{
  const f=fixture();f.connect();const {env}=f;
  f.invoke("ui.sidebar.set",{collapsed:true});env.elements.get("collapseSidebarButton").click();assert.equal(env.api.state().preferences.sidebarCollapsed,false);
  f.invoke("ui.diagnostics.set",{open:true});env.elements.get("diagnosticsButton").click();assert.equal(env.api.state().preferences.diagnosticsOpen,false);
  for(const group of ["gemini","claude","openrouter","local","openai"]) f.invoke("provider.group.set",{group});
  f.invoke("provider.authMode.set",{mode:"api"});f.invoke("provider.agent.set",{agentId:"openai-api"});
  f.invoke("provider.model.set",{model:"fixture-model"});f.invoke("provider.freeOnly.set",{enabled:true});
  f.invoke("provider.refresh");f.invoke("provider.detectLocal");f.invoke("provider.agent.set",{agentId:"openai-api"});
  const expected={agentId:"openai-api",model:"fixture-model"};
  f.invoke("provider.check",expected);f.invoke("provider.selfTest",expected);
  const key="fixture-api-private";f.invoke("provider.key.save",{...expected,key});
  assert.equal(env.requestHistory.find(r=>r.path==="/agents/key").body.apiKey,key);
  assert(!env.storageStore.get("codexAePanelActionReceipts").includes(key),"Receipt persistence is secret-free");
  agents[0].codexStatus.loggedIn=false;f.invoke("provider.refresh");
  f.invoke("provider.agent.set",{agentId:"openai-cli"});f.invoke("provider.setup",{agentId:"openai-cli",model:"fixture-model",action:"codex_login"});
  agents[0].codexStatus.loggedIn=true;
  assert.equal(env.requestHistory.find(r=>r.path==="/agents/setup").body.action,"codex_login");
  f.invoke("chat.mode.set",{mode:"chat"});f.invoke("chat.optimization.set",{enabled:false});f.invoke("chat.prompt.set",{prompt:"VM draft"});
  f.invoke("workflow.preset.set",{presetId:"basic-animation"});f.invoke("workflow.insert",{presetId:"basic-animation"});
  assert.equal(env.api.state().chat.mode,"plan");assert.equal(env.api.state().chat.optimization,true);
  assert.match(env.elements.get("chatPrompt").value,/анимацию/);
  const list=f.invoke("chat.sessions.list",{limit:2}).result.result;
  assert(list.sessions.length<=2);
  f.invoke("logs.get",{limit:1});
});

test("actual chat async snapshots, history, clear, busy and unknown no replay",()=>{
  const f=fixture();f.connect();const {env}=f;f.invoke("chat.mode.set",{mode:"chat"});
  const args={prompt:"Привет VM",agentId:"openai-cli",model:"fixture-model",sessionId:env.api.state().chat.sessionId,mode:"chat"};
  const sent=f.invoke("chat.send",args,{hold:true});assert.equal(sent.initial.state,"running");
  env.elements.get("chatPrompt").value="Late draft";
  const req=env.inFlightRequests.find(r=>r.path==="/agents/chat");assert.equal(req.body.messages[0].content,args.prompt);
  const before=env.requestHistory.length;
  const duplicate=env.invoke(sent.request);assert.equal(duplicate.state,"running");assert.equal(env.requestHistory.length,before);
  const conflict=env.invoke({...sent.request,args:{...args,prompt:"Changed"}});assert.equal(conflict.code,"duplicate_request_id_conflict");
  const busy=f.invoke("chat.clear",{sessionId:args.sessionId,confirm:true},{allowFailure:true});assert.equal(busy.result.state,"rejected");
  env.elements.get("newChatButton").click();assert.equal(env.api.state().chat.sessionId,args.sessionId);
  const passive=f.invoke("chat.transcript.get",{limit:1});assert.equal(passive.result.result.messages.length,1);
  f.drain();assert.equal(env.api.getResult(sent.request.requestId).state,"completed");
  const transcript=f.invoke("chat.transcript.get",{}).result.result;assert(transcript.messages.length>=2);assert(transcript.messages.some(item=>/Ответ VM/.test(item.text)));
  f.invoke("chat.new");const nextId=env.api.state().chat.sessionId;assert.notEqual(nextId,args.sessionId);
  f.invoke("chat.session.select",{sessionId:args.sessionId});f.invoke("chat.clear",{sessionId:args.sessionId,confirm:true});
  const timed=f.invoke("chat.send",{...args,prompt:"May be submitted"},{hold:true});
  env.inFlightRequests.find(r=>r.path==="/agents/chat").timeout();
  assert.equal(env.api.getResult(timed.request.requestId).state,"unknown");
  const count=env.requestHistory.length;env.invoke(timed.request);assert.equal(env.requestHistory.length,count);
  const restored=fixture({storageStore:env.storageStore});assert.equal(restored.env.api.getResult(timed.request.requestId).state,"unknown");
  const stored=env.storageStore.get("codexAePanelActionReceipts");
  assert(!stored.includes("May be submitted"),"Content is hashed in the signature");
  const blocked=f.invoke("chat.send",{...args,prompt:"New ID cannot bypass unknown"},{allowFailure:true});
  assert.equal(blocked.result.code,"reconciliation_required");assert.equal(env.requestHistory.length,count);
  const fresh=fixture();fresh.connect();fresh.invoke("chat.mode.set",{mode:"chat"});
  const unfinished=fresh.invoke("chat.send",{...args,sessionId:fresh.env.api.state().chat.sessionId,prompt:"Persisted in-flight"},{hold:true});
  const reboot=fixture({storageStore:fresh.env.storageStore});
  assert.equal(reboot.env.api.getResult(unfinished.request.requestId).state,"unknown");
  const rebootCount=reboot.env.requestHistory.length;reboot.env.invoke(unfinished.request);assert.equal(reboot.env.requestHistory.length,rebootCount);
  assert.equal(reboot.env.invoke(envelope("chat.new",{})).code,"reconciliation_required");
});

test("Hardcore/provider unknown outcomes retain durable guard across new UUIDs and reload",()=>{
  const f=fixture();f.connect();const {env}=f;f.invoke("chat.mode.set",{mode:"hardcore"});
  const args={prompt:"Hardcore may continue on server",agentId:"openai-cli",model:"fixture-model",
    sessionId:env.api.state().chat.sessionId,mode:"hardcore",confirm:true};
  const first=f.invoke("agent.hardcore",args,{hold:true});
  env.inFlightRequests.find(r=>r.path==="/agents/hardcore/run").timeout();
  assert.equal(env.api.getResult(first.request.requestId).state,"unknown");
  assert.equal(env.api.state().reconciliationRequired,true);assert.equal(env.api.state().busy,true);
  assert.equal(env.api.state().unresolvedActions[0].requestId,first.request.requestId);
  const rejected=f.invoke("agent.hardcore",args,{allowFailure:true});assert.equal(rejected.result.code,"reconciliation_required");
  assert.equal(env.requestHistory.filter(r=>r.path==="/agents/hardcore/run").length,1);
  const catalog=env.api.catalog();assert.equal(catalog.find(row=>row.name==="agent.hardcore").availability.available,false);
  f.invoke("chat.sessions.list");f.invoke("chat.transcript.get");f.invoke("logs.get");f.invoke("plan.current",{fresh:true});
  f.invoke("connector.refresh");f.invoke("connector.emergencyDisable",{confirm:true});
  assert.equal(env.api.state().reconciliationRequired,true,"Emergency disable never declares the original command terminal");
  const foreign=f.invoke("plan.reconcile",{runId:"foreign-run"},{allowFailure:true});assert.equal(foreign.result.code,"reconciliation_identity_required");
  const restored=fixture({storageStore:env.storageStore});
  assert.equal(restored.env.api.state().reconciliationRequired,true);
  assert.equal(restored.env.invoke(envelope("agent.hardcore",args)).code,"reconciliation_required");
  restored.invoke("logs.get");restored.invoke("connector.refresh");restored.invoke("connector.emergencyDisable",{confirm:true});
  assert.equal(restored.env.requestHistory.filter(r=>r.path==="/agents/hardcore/run").length,0);
  const store=JSON.parse(env.storageStore.get("codexAePanelActionReceipts"));
  delete store.records[first.request.requestId];env.storageStore.set("codexAePanelActionReceipts",JSON.stringify(store));
  const missing=fixture({storageStore:env.storageStore});
  assert.equal(missing.env.api.getResult(first.request.requestId).code,"receipt_record_missing");
  assert.equal(missing.env.api.state().reconciliationRequired,true);
  assert.equal(missing.env.invoke(envelope("chat.new",{})).code,"reconciliation_required");
  const provider=fixture();provider.connect();
  const check=provider.invoke("provider.check",{agentId:"openai-cli",model:"fixture-model"},{hold:true});
  provider.env.inFlightRequests.find(r=>r.path.startsWith("/agents/readiness?")).timeout();
  assert.equal(provider.env.api.getResult(check.request.requestId).state,"unknown");
  assert.equal(provider.env.invoke(envelope("provider.refresh",{})).code,"reconciliation_required");
  const selfTest=fixture();selfTest.connect();
  const probes=selfTest.invoke("provider.selfTest",{agentId:"openai-cli",model:"fixture-model"},{hold:true});
  const firstProbe=selfTest.env.inFlightRequests.find(r=>r.path.startsWith("/agents/readiness?"));
  const probeCount=selfTest.env.requestHistory.filter(r=>r.path.startsWith("/agents/readiness?")).length;
  firstProbe.timeout();
  assert.equal(selfTest.env.api.getResult(probes.request.requestId).state,"unknown");
  assert.equal(selfTest.env.requestHistory.filter(r=>r.path.startsWith("/agents/readiness?")).length,probeCount,"Unknown provider probe stops further automated probes");
  assert.equal(selfTest.env.invoke(envelope("provider.selfTest",{agentId:"openai-cli",model:"fixture-model"})).code,"reconciliation_required");
  const healthy=fixture();healthy.connect();healthy.invoke("chat.mode.set",{mode:"hardcore"});
  healthy.invoke("agent.hardcore",{...args,sessionId:healthy.env.api.state().chat.sessionId});
  healthy.invoke("agent.hardcore",{...args,sessionId:healthy.env.api.state().chat.sessionId});
  assert.equal(healthy.env.requestHistory.filter(r=>r.path==="/agents/hardcore/run").length,2,"Verified terminal completion permits the next action");
});

test("same-run reconciliation remains callable but postconditions/foreign evidence cannot release unknown guard",()=>{
  const f=fixture();f.connect();const {env}=f;f.setCurrent(makeCurrentPlan("unknown-run",1));
  f.invoke("plan.current",{fresh:true});f.invoke("plan.prepare",{pins:f.pins()});
  const submitted=f.invoke("plan.run",{pins:f.pins(),confirm:true},{hold:true});
  env.inFlightRequests.find(r=>r.path==="/agents/plan/current").respond(200,{ok:true,current:copy(f.getCurrent())});
  env.inFlightRequests.find(r=>r.path==="/agents/plan/run").respond(0,{run:{id:"same-unknown-run",ok:false,
    validation:{mutatingCount:1},outcome:{execution:{status:"unknown"},mutation:{status:"unknown"}}}});
  assert.equal(env.api.getResult(submitted.request.requestId).state,"unknown");
  const reconcile=f.invoke("plan.reconcile",{runId:"same-unknown-run"},{hold:true});
  assert.equal(reconcile.initial.state,"running");
  env.inFlightRequests.find(r=>r.path==="/tools/call").respond(200,{result:{content:[{text:JSON.stringify({
    schema:"ae-agent-plan-reconciliation.v1",runId:"foreign-run",status:"reconciled",sameProject:true,steps:[],replayAllowed:false})}]}});
  assert.equal(env.api.getResult(reconcile.request.requestId).state,"error");
  assert.equal(env.api.state().reconciliationRequired,true);
  const exact=f.invoke("plan.reconcile",{runId:"same-unknown-run"},{hold:true});
  env.inFlightRequests.find(r=>r.path==="/tools/call").respond(200,{result:{content:[{text:JSON.stringify({
    schema:"ae-agent-plan-reconciliation.v1",runId:"same-unknown-run",status:"reconciled",sameProject:true,
    steps:[{index:1,mutationStatus:"applied",scope:"current_postconditions_only"}],replayAllowed:false})}]}});
  assert.equal(env.api.getResult(exact.request.requestId).state,"completed");
  assert.equal(env.api.getResult(exact.request.requestId).result.admissionGuardReleased,false);
  assert.equal(env.api.state().reconciliationRequired,true);
  const restored=fixture({storageStore:env.storageStore});
  restored.invoke("plan.reconcile",{runId:"same-unknown-run"});
  assert.equal(restored.env.api.state().reconciliationRequired,true);
});

test("Hardcore HTTP success is not execution proof: nested/attempt unknown and partial error preserve guard",()=>{
  function submit(status,session,extra={}) {
    const f=fixture();f.connect();f.invoke("chat.mode.set",{mode:"hardcore"});
    const args={prompt:"Hardcore result classification",agentId:"openai-cli",model:"fixture-model",
      sessionId:f.env.api.state().chat.sessionId,mode:"hardcore",confirm:true};
    const sent=f.invoke("agent.hardcore",args,{hold:true});
    f.env.inFlightRequests.find(r=>r.path==="/agents/hardcore/run").respond(status,{session,...extra});
    return {f,args,sent,result:f.env.api.getResult(sent.request.requestId)};
  }
  const counterexample={finalRun:{outcome:{execution:{status:"unknown"},mutation:{status:"unknown"}}}};
  const exact=submit(200,counterexample);assert.equal(exact.result.state,"unknown");
  assert.equal(exact.result.outcome.execution.status,"unknown");assert.equal(exact.result.result.executed,null);
  assert.equal(exact.f.env.invoke(envelope("agent.hardcore",exact.args)).code,"reconciliation_required");
  assert.equal(exact.f.env.requestHistory.filter(r=>r.path==="/agents/hardcore/run").length,1,"Exact reviewer counterexample cannot emit a second POST");
  const restored=fixture({storageStore:exact.f.env.storageStore});
  assert.equal(restored.env.api.getResult(exact.sent.request.requestId).state,"unknown");
  assert.equal(restored.env.invoke(envelope("agent.hardcore",exact.args)).code,"reconciliation_required");
  assert.equal(restored.env.requestHistory.filter(r=>r.path==="/agents/hardcore/run").length,0);
  const oldStore=JSON.parse(exact.f.env.storageStore.get("codexAePanelActionReceipts"));
  oldStore.records[exact.sent.request.requestId].state="completed"; // Older classifier treated HTTP200 as completion.
  exact.f.env.storageStore.set("codexAePanelActionReceipts",JSON.stringify(oldStore));
  const upgraded=fixture({storageStore:exact.f.env.storageStore});
  assert.equal(upgraded.env.api.getResult(exact.sent.request.requestId).state,"unknown");
  assert.equal(upgraded.env.invoke(envelope("agent.hardcore",exact.args)).code,"reconciliation_required");
  const missing=submit(200,{sessionId:"attempt-without-final",status:"needs_review",finalRun:null,
    attempts:[{index:1,status:"run-needs-reconciliation",run:null,finishedAt:new Date().toISOString()}]});
  assert.equal(missing.result.state,"unknown");assert.equal(missing.f.env.api.state().reconciliationRequired,true);
  assert.equal(missing.f.env.invoke(envelope("agent.hardcore",missing.args)).code,"reconciliation_required");
  const ongoing=submit(200,{status:"completed",finalRun:null,attempts:[{index:1,status:"running",run:{id:"ongoing-attempt",
    outcome:{execution:{status:"completed"},mutation:{status:"not_started"}},steps:[{status:"running",commands:[{id:"ongoing-command",state:"submitted"}]}]}}]});
  assert.equal(ongoing.result.state,"unknown");assert.equal(ongoing.result.runId,"ongoing-attempt");
  const partialRun={id:"partial-hardcore-run",ok:false,validation:{mutatingCount:1},
    errorCode:"partial_failure",outcome:{execution:{status:"failed"},mutation:{status:"applied"},verification:{status:"pending"}}};
  const partial=submit(500,{status:"needs_review",finalRun:partialRun,attempts:[{index:1,status:"run-needs-reconciliation",run:partialRun}]},
    {code:"partial_failure",error:"Original partial execution error"});
  assert.equal(partial.result.state,"unknown");assert.equal(partial.result.httpStatus,500);assert.equal(partial.result.code,"partial_failure");
  assert.equal(partial.result.runId,"partial-hardcore-run");assert.equal(partial.result.outcome.mutation.status,"applied");
  assert.equal(partial.result.result.executed,true);assert.equal(partial.result.result.run.errorCode,"partial_failure");
  assert.equal(partial.f.env.invoke(envelope("agent.hardcore",partial.args)).code,"reconciliation_required");
  const terminalRun={id:"known-terminal-hardcore",ok:true,validation:{mutatingCount:1},
    outcome:{execution:{status:"completed"},mutation:{status:"applied"},verification:{status:"passed"}},
    steps:[{status:"completed",commands:[{id:"completed-command",state:"completed"}]}]};
  const healthy=submit(200,{status:"verified",ok:true,finalRun:terminalRun,attempts:[{index:1,status:"verified",run:terminalRun}]});
  assert.equal(healthy.result.state,"completed");assert.equal(healthy.result.runId,"known-terminal-hardcore");
  assert.equal(healthy.f.env.api.state().reconciliationRequired,false);
  const next=healthy.f.invoke("agent.hardcore",healthy.args);
  assert.equal(next.result.state,"completed");assert.equal(next.result.result.executed,false,"Explicit no-effect run evidence remains a valid completion");
  assert.equal(healthy.f.env.requestHistory.filter(r=>r.path==="/agents/hardcore/run").length,2,"Known terminal Hardcore permits next action");
  const noEffect=submit(200,{status:"needs_review",attempts:[{index:1,status:"plan-needs-review",run:null,dryRun:null}]});
  assert.equal(noEffect.result.state,"completed");assert.equal(noEffect.result.result.executed,false);
});

test("actual bridge/placeholder/autonomy/connector callbacks and postreads",()=>{
  const f=fixture();f.connect();const {env}=f;
  f.invoke("autonomy.refresh");const enabled=f.invoke("autonomy.set",{enabled:true});assert.equal(enabled.result.postState.autonomy.desiredEnabled,true);
  f.invoke("placeholder.refresh");f.invoke("placeholder.accept",{useSelectedProperties:true});
  assert.equal(env.requestHistory.find(r=>r.path==="/placeholder/protection" && r.body?.action==="accept").body.useSelectedProperties,true);
  f.invoke("placeholder.mapGroup",{groupId:"group-vm"});f.invoke("placeholder.constraints.set",{distinctGroups:true,disallowSourceOverlap:true});
  f.invoke("placeholder.release",{confirm:true});f.invoke("connector.refresh");f.invoke("connector.emergencyDisable",{confirm:true});f.invoke("usage.refresh");
  const posts=env.requestHistory.filter(r=>r.path==="/placeholder/protection" && r.method==="POST");
  assert.equal(posts.length,4);assert.equal(env.requestHistory.filter(r=>r.path==="/placeholder/protection" && r.method==="GET").length,6);
  f.invoke("bridge.disconnect");assert.equal(env.api.state().running,false);
});

test("actual prepare/adopt only dry-run, exact pins and protected typed/raw/save/lifecycle run",()=>{
  const f=fixture();f.connect();const {env}=f;
  f.setCurrent(makeCurrentPlan("tokenless",1));f.invoke("plan.current",{fresh:true});
  const oldPins=f.pins(),deny=f.invoke("plan.run",{pins:oldPins,confirm:true},{allowFailure:true});
  assert.equal(deny.result.code,"proposal_adoption_required");
  const prepared=f.invoke("plan.prepare",{pins:oldPins});
  assert.equal(prepared.result.result.executed,false);assert(prepared.result.result.acceptedDryRunId);
  assert.notEqual(prepared.result.result.pins.actionId,oldPins.actionId);
  assert(env.requestHistory.filter(r=>r.path==="/agents/plan/run").every(r=>r.body.dryRun),"Prepare never executes");
  const posts=env.requestHistory.filter(r=>r.path==="/agents/plan/run").length;
  f.invoke("plan.run",{pins:oldPins,confirm:true},{allowFailure:true});
  assert.equal(env.requestHistory.filter(r=>r.path==="/agents/plan/run").length,posts,"Stale pins cannot POST");
  const adoptedProposal=env.planOps.getLastPlanResult().m100ActionProposal;
  adoptedProposal.confirmation.sessionId="another-panel-chat";
  const drift=f.invoke("plan.run",{pins:f.pins(),confirm:true},{allowFailure:true});
  assert.equal(drift.result.state,"rejected");assert.equal(env.requestHistory.filter(r=>r.path==="/agents/plan/run").length,posts,"Session drift cannot POST");
  // Fresh sync discarded the mismatched private token. Explicit preparation reacquires it for this session.
  f.invoke("plan.prepare",{pins:f.pins()});
  f.invoke("plan.dryRun",{pins:f.pins()});const run=f.invoke("plan.run",{pins:f.pins(),confirm:true});
  assert.equal(run.result.result.executed,true);assert.equal(run.result.result.executionRequested,true);
  assert.equal(env.requestHistory.filter(r=>r.path==="/agents/plan/run").at(-1).body.confirmedBySurface,"cep-panel");
  f.invoke("plan.reconcile",{runId:run.result.result.runId});
  for(const [kind,tool] of [["raw_jsx","run_extendscript"],["mutating","save_project"],["mutating","create_named_project"]]) {
    const canonical=makeCurrentPlan("protected-"+tool,1);canonical.proposal.risk.level=kind;
    canonical.plan.steps=[{tool,args:{},mutatesProject:true}];
    if(kind==="raw_jsx") canonical.validation.classification={blocksRun:true,rawExtendscriptStepCount:1};
    f.setCurrent(canonical);f.invoke("plan.current",{fresh:true});f.invoke("plan.prepare",{pins:f.pins()});
    f.invoke("plan.run",{pins:f.pins(),confirm:true});
    const body=env.requestHistory.filter(r=>r.path==="/agents/plan/run").at(-1).body;
    if(kind==="raw_jsx") {assert.equal(body.allowRawExtendscript,true);assert(body.rawExtendscriptDryRunId);}
  }
});

test("plan errors preserve mutation evidence; timeout and stale callbacks cannot replay",()=>{
  const f=fixture();f.connect();const {env}=f;f.setCurrent(makeCurrentPlan("denied",1));f.invoke("plan.current",{fresh:true});f.invoke("plan.prepare",{pins:f.pins()});
  const pending=f.invoke("plan.run",{pins:f.pins(),confirm:true},{hold:true});f.drain=function(){};
  // Fresh canonical GET is the only preflight request.
  env.inFlightRequests.find(r=>r.path==="/agents/plan/current").respond(200,{ok:true,current:copy(f.getCurrent())});
  const req=env.inFlightRequests.find(r=>r.path==="/agents/plan/run");
  req.respond(400,{run:{id:"applied-error",ok:false,errorCode:"verify_failed",error:"Original error",
    validation:{mutatingCount:1},outcome:{execution:{status:"failed"},mutation:{status:"applied"},verification:{status:"pending"}}}});
  const result=env.api.getResult(pending.request.requestId);assert.equal(result.state,"error");assert.equal(result.runId,"applied-error");assert.equal(result.result.executed,true);
  assert.equal(result.result.run.outcome.mutation.status,"applied");
  const count=env.requestHistory.length;env.invoke(pending.request);assert.equal(env.requestHistory.length,count);
  const stale=fixture();stale.connect();stale.invoke("chat.mode.set",{mode:"chat"});
  const staleArgs={prompt:"Submitted before lifecycle drift",agentId:"openai-cli",model:"fixture-model",sessionId:stale.env.api.state().chat.sessionId,mode:"chat"};
  const staleSend=stale.invoke("chat.send",staleArgs,{hold:true});
  stale.env.planOps.disconnect(); // Test-only external lifecycle change, beyond the guarded service.
  stale.env.inFlightRequests.find(r=>r.path==="/agents/chat").respond(200,{result:{text:"stale-result-must-not-be-applied"}});
  assert.equal(stale.env.api.getResult(staleSend.request.requestId).state,"unknown");
  assert(!stale.env.elements.get("chatTranscript").childNodes.some(node=>JSON.stringify(node.textContent).includes("stale-result-must-not-be-applied")));
  assert(!stale.env.storageStore.get("codexAeChatTranscript").includes("stale-result-must-not-be-applied"));
});

test("actual plan/chat recovery, explicit Hardcore and dev-request eligibility",()=>{
  const f=fixture();f.connect();const {env}=f;
  const args={prompt:"Сделай план VM",agentId:"openai-cli",model:"fixture-model",sessionId:env.api.state().chat.sessionId,mode:"plan"};
  f.invoke("agent.plan",args);f.invoke("plan.current",{fresh:true});
  f.invoke("chat.new");f.invoke("chat.session.select",{sessionId:args.sessionId});
  // Saved history recovery uses the existing /propose handler, without an arbitrary plan transport.
  env.planOps.setLastPlanResult(null);f.invoke("plan.recover");
  f.invoke("plan.current",{fresh:true});const current=f.getCurrent();
  current.validation.classification={blocksRun:true,rawExtendscriptStepCount:1};current.plan.steps=[{tool:"run_extendscript",args:{},mutatesProject:true}];
  f.invoke("plan.current",{fresh:true});f.invoke("plan.devRequest");
  assert.equal(env.requestHistory.find(r=>r.path==="/agents/dev-request").body.openCodexApp,false);
  f.invoke("chat.mode.set",{mode:"hardcore"});
  const hc={...args,mode:"hardcore",confirm:true};f.invoke("agent.hardcore",hc);
  assert.equal(env.requestHistory.filter(r=>r.path==="/agents/hardcore/run").length,1);
});

test("reload durable receipt restoration and fresh bridge idle/lifecycle gates",()=>{
  const f=fixture();f.connect();const {env}=f;
  const pending=f.invoke("panel.reload",{}, {hold:true});
  env.inFlightRequests.find(r=>r.path==="/tools/call").respond(200,{result:{content:[{text:JSON.stringify({pendingCommands:0,inflightCommands:[],activeEditSession:null,projectLifecycle:{blocked:true,pending:{phase:"unknown"}}})}]}});
  assert.equal(env.api.getResult(pending.request.requestId).state,"rejected");
  const reload=f.invoke("panel.reload",{}, {allowFailure:true});
  assert.equal(reload.result.state,"running");assert.match(env.window.location.href,/reload=/);
  const restored=fixture({storageStore:env.storageStore});
  assert.equal(restored.env.api.getResult(reload.request.requestId).state,"completed");
  const before=restored.env.requestHistory.length;restored.env.invoke(reload.request);assert.equal(restored.env.requestHistory.length,before);
});

test("storage corruption, missing store, admission failure and unresolved capacity fail closed",()=>{
  function store(initial) {let value=initial;const other=new Map();
    if(initial && initial[0]==="{") {try {const parsed=JSON.parse(initial),index={};for(const [id,r] of Object.entries({...parsed.records,...parsed.tombstones})) index[id]={action:r.action,signature:r.signature};other.set("codexAePanelActionReceiptIndex",JSON.stringify(index));} catch(_) {}}
    return {getItem:key=>key==="codexAePanelActionReceipts"?value:other.get(key)||null,setItem:(key,next)=>{if(key==="codexAePanelActionReceipts") value=next;else other.set(key,next);},value:()=>value,other};}
  function runtime(storage) {
    const service=createService(contract,storage);let writes=0;
    service.bind({handlers:{"ui.sidebar.set":(args,done)=>{writes++;done(null,{collapsed:args.collapsed});}},passive:{},
      lifecycle:()=>({epoch:0,generation:"0",busy:false}),state:()=>({assetVersion:"3.3.0",preferences:{}}),availability:()=>({available:true,reasonCodes:[]})});
    return {api:service.api,writes:()=>writes};
  }
  const bad=runtime(store("{bad"));assert.equal(bad.api.invoke(envelope("ui.sidebar.set",{collapsed:true})).state,"rejected");assert.equal(bad.writes(),0);
  const noStore=runtime({getItem:key=>key.endsWith("Initialized")?"1":null,setItem:()=>{throw Error("must not initialize");}});
  assert.equal(noStore.api.getResult(crypto.randomUUID()).state,"unknown");
  const failing=runtime({getItem:()=>null,setItem:()=>{throw Error("quota");}});
  assert.equal(failing.api.invoke(envelope("ui.sidebar.set",{collapsed:true})).state,"rejected");assert.equal(failing.writes(),0);
  let accessorReads=0;const accessor=envelope("ui.sidebar.set",{collapsed:true});
  Object.defineProperty(accessor,"requestId",{get:()=>{accessorReads++;return crypto.randomUUID();}});
  assert.equal(runtime(store(null)).api.invoke(accessor).state,"rejected");assert.equal(accessorReads,0);
  const memory=store(null),r=runtime(memory),e=envelope("ui.sidebar.set",{collapsed:true});
  r.api.invoke(e);assert.equal(r.writes(),1);r.api.invoke(e);assert.equal(r.writes(),1);
  const persisted=JSON.parse(memory.value());assert.match(persisted.records[e.requestId].signature,/^[a-f0-9]{64}$/);
  const expectedSignature=crypto.createHash("sha256").update(JSON.stringify({action:"ui.sidebar.set",args:{collapsed:true},expectedState:{}})).digest("hex");
  assert.equal(persisted.records[e.requestId].signature,expectedSignature,"Browser SHA256 agrees with Node");
  memory.setItem("codexAePanelActionReceipts",JSON.stringify({version:1,records:{},tombstones:{}}));
  const missing=runtime(memory);assert.equal(missing.api.getResult(e.requestId).state,"unknown");
  missing.api.invoke(e);assert.equal(missing.writes(),0,"A selectively missing indexed record never re-executes");
  const records={};for(let i=0;i<120;i++){const id=crypto.randomUUID();records[id]={...envelope("ui.sidebar.set",{collapsed:true},id),state:"unknown",signature:"x"};delete records[id].args;}
  const full=runtime(store(JSON.stringify({version:1,records,tombstones:{}})));
  assert.equal(full.api.invoke(envelope("ui.sidebar.set",{collapsed:true})).code,"receipt_store_capacity_exceeded");assert.equal(full.writes(),0);
});

assert.deepEqual([...coverage].sort(),contract.ACTION_CATALOG.map(item=>item.name).sort(),"Every catalog action exercises its actual handler");
console.log(JSON.stringify({ok:true,mode:"offline-full-panel-vm",actionsCovered:coverage.size,scenarios,productionNetworkCalls:0,liveAeCalls:0}));

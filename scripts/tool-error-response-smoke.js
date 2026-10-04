#!/usr/bin/env node
"use strict";

const assert = require("assert/strict");
const { SCHEMA, decorateToolResult, buildGuidance, sanitizeHttpFailure } = require("../mcp-server/tool-error-response");
const { projectPlanRunSummary } = require("../mcp-server/plan-run-response");
const runId = "12345678-1234-1234-1234-123456789abc";
const otherId = "22345678-1234-1234-1234-123456789abc";
const exposedTools = [
  { name: "reconcile_plan_run", inputSchema: { type: "object", properties: {runId: {type:"string"}}, required:["runId"] } },
  { name: "get_plan_run_evidence", inputSchema: { type: "object", properties: {runId: {type:"string"},limitChars:{type:"integer",minimum:1,maximum:12000}}, required:["runId"] } },
  { name: "get_current_ai_agent_plan", inputSchema: { type: "object", properties: {} } },
  { name: "wait_for_plan_state", inputSchema: { type: "object", properties: {actionId:{type:"string"},instanceId:{type:"string"},revision:{type:"integer"},waitMs:{type:"integer",minimum:0,maximum:30000}},required:["actionId","instanceId","revision"] } },
  { name: "wait_for_bridge_state", inputSchema: { type: "object", properties: {targetState:{type:"string",enum:["connected","idle","connected_and_idle","any"]},waitMs:{type:"integer",minimum:0,maximum:30000}} } }
];
const actualRecoveryTools = [
  { name: "reconcile_plan_run", inputSchema: { type: "object", additionalProperties: false,
    properties: {runId:{type:"string",description:"Server plan run UUID."},stepIndices:{type:"array",minItems:1,maxItems:50,items:{type:"integer",minimum:1}}}, required:["runId"] } },
  { name: "get_plan_run_evidence", inputSchema: { type: "object", properties: {
    runId:{type:"string",description:"Server plan run UUID."},stepIndex:{type:"integer",minimum:1},offset:{type:"integer",minimum:0},limitChars:{type:"integer",minimum:1,maximum:12000}
  }, required:["runId"] } }
];
const context = {toolName:"run_ai_agent_plan",daemonAvailable:true,panelConnected:true,exposedTools};
const result = (p, isError = true) => ({content:[{type:"text",text:JSON.stringify(p)}],isError});
const guidance = r => JSON.parse(r.content.at(-1).text);
const run = {id:runId,ok:false,errorCode:"command_timeout",error:"Unknown execution outcome",dryRun:false,steps:[],
  provenance:{schema:"ae-agent-run-provenance.v1",actionId:"action-a",proposalRevision:3,planSha256:"a".repeat(64)},
  repairDirective:{eligible:true,automaticReplayAllowed:false,runId},outcome:{mutation:{status:"unknown"}}};
let cases = 0;
function test(name, fn) { fn(); cases++; }
test("legacy result and canonical run stay untouched", () => {
  const r = result(run), before = JSON.stringify(r), runBefore = JSON.stringify(run);
  Object.freeze(r.content[0]); Object.freeze(r.content); Object.freeze(r);
  const decorated = decorateToolResult(r, context);
  assert.equal(JSON.stringify(r),before); assert.equal(JSON.stringify(run),runBefore);
  assert.equal(decorated.content[0],r.content[0]); assert.equal(decorated.isError,true);
  assert.deepEqual(JSON.parse(decorated.content[0].text).repairDirective,run.repairDirective);
  assert.deepEqual(guidance(decorated).nextAction.arguments,{runId});
  assert.equal(guidance(decorated).automaticReplayAllowed,false);
  assert.equal(decorateToolResult(decorated,context),decorated);
});
test("full and actual summary projection bind the same exact run", () => {
  const full = guidance(decorateToolResult(result(run),context));
  const summary = guidance(decorateToolResult(result(projectPlanRunSummary(run)),context));
  assert.deepEqual(summary.identity,full.identity); assert.deepEqual(summary.nextAction,full.nextAction);
  const unbound = {...run,diagnostic:{code:"command_timeout",phase:"ae_execution"},m100Message:{requestId:""}};
  assert.deepEqual(buildGuidance(unbound,context).nextAction,buildGuidance(projectPlanRunSummary(unbound),context).nextAction);
  const manual = {...run,errorCode:"m100_proposal_required",diagnostic:{phase:"confirmation_validation"},safety:{status:"blocked_m100_confirmation_required"}};
  assert.deepEqual(buildGuidance(manual,context).nextAction,buildGuidance(projectPlanRunSummary(manual),context).nextAction);
  assert.equal(buildGuidance(manual,context).nextAction.kind,"stop");
});
test("no executionId/run identity conversion or request borrowing", () => {
  const g = buildGuidance({ok:false,executionId:runId,code:"command_timeout"},{...context,arguments:{runId,actionId:"client-action"}});
  assert.deepEqual(g.identity,{}); assert.equal(g.nextAction.kind,"stop");
});
test("invalid/conflicting identity stops", () => {
  for (const p of [{...run,id:"../escape"},{...run,actionId:"other-action"},{...run,provenance:{...run.provenance,proposalRevision:0}}]) {
    assert.equal(buildGuidance(p,context).nextAction.reasonCode,"identity_ambiguous");
  }
});
test("unknown outcome remains unknown; eligible repair grants nothing", () => {
  const g = buildGuidance(run,context);
  assert.equal(g.nextAction.tool,"reconcile_plan_run");
  assert.equal(JSON.stringify(g).includes("not_applied"),false);
  assert.equal(JSON.stringify(g).includes("run_ai_agent_plan"),false);
});
test("missing or corrupt durable records and manual/auth stop", () => {
  for (const code of ["run_record_missing","record_integrity_failed","run_record_invalid","m100_confirmation_required","lifecycle_manual_only","autonomous_session_revoked","auth_failed","step_evidence_binding_mismatch"]) {
    assert.equal(buildGuidance({...run,errorCode:code},context).nextAction.kind,"stop");
  }
  assert.equal(buildGuidance({...run,recordWarning:"run_record_update_failed"},context).nextAction.kind,"stop");
  const gated = buildGuidance({ok:false,code:"proposal_required",message:"Manual proposal gate",m100:{diagnostic:{code:"proposal_required",phase:"confirmation_validation"}}},context);
  assert.equal(gated.nextAction.kind,"stop");assert.equal(gated.error.phase,"confirmation_validation");assert.equal(gated.error.message,"Manual proposal gate");
  assert.equal(guidance(decorateToolResult({content:[{type:"text",text:"confirmation required"}],isError:true},{...context,panelConnected:false})).nextAction.kind,"stop");
});
test("transport cannot use remembered tools; disconnected live daemon can wait", () => {
  assert.equal(buildGuidance(run,{...context,transportUnavailable:true}).nextAction.reasonCode,"daemon_transport_unavailable");
  const g = buildGuidance(run,{...context,panelConnected:false});
  assert.equal(g.nextAction.tool,"wait_for_bridge_state"); assert.equal(g.identity.runId,runId);
});
test("exposed tool required contract must actually accept arguments", () => {
  for (const list of [[],[exposedTools[0],exposedTools[0]], [{...exposedTools[0],inputSchema:{...exposedTools[0].inputSchema,required:["runId","proof"]}}]]) {
    assert.equal(buildGuidance(run,{...context,exposedTools:list}).nextAction.kind,"stop");
  }
  const actualRun = buildGuidance(run,{...context,exposedTools:actualRecoveryTools});
  assert.equal(actualRun.nextAction.tool,"reconcile_plan_run");
  const actualEvidence = buildGuidance({runId,status:"incomplete",replayAllowed:false},{...context,toolName:"reconcile_plan_run",exposedTools:actualRecoveryTools});
  assert.equal(actualEvidence.nextAction.tool,"get_plan_run_evidence");
  for (const invalidSchema of [
    {type:"object",properties:{runId:{type:"string"}},required:["runId"],allOf:[{required:["proof"]}]},
    {type:"object",properties:{runId:{type:"string",allOf:[{minLength:37}]}},required:["runId"]},
    {type:"object",properties:{runId:{type:"string",minLength:37}},required:["runId"]},
    {type:"object",properties:{runId:{type:"string",maxLength:1}},required:["runId"]},
    {type:"object",properties:{runId:{type:"string",pattern:"^NEW-"}},required:["runId"]}
  ]) {
    const blocked=buildGuidance(run,{...context,exposedTools:[{name:"reconcile_plan_run",inputSchema:invalidSchema}]});
    assert.equal(blocked.nextAction.kind,"stop");
  }
});
test("running wait timeout is blocking observation without execution error", () => {
  const r=result({ok:true,timedOut:true,state:"running",actionId:"a",instanceId:"i",revision:4,lastRun:{id:otherId}},false);
  const d=decorateToolResult(r,{...context,toolName:"wait_for_plan_state"});
  assert.equal(d.isError,false); assert.equal(guidance(d).error,null);
  assert.deepEqual(guidance(d).nextAction.arguments,{actionId:"a",instanceId:"i",revision:4,waitMs:1000});
  assert.equal(guidance(d).identity.runId,undefined);
});
test("stale wait pins inspect current and never target echoed/history IDs", () => {
  for (const state of ["superseded","expired","nonready"]) {
    const g=buildGuidance({state,actionId:"echoed-old",instanceId:"echoed-instance",revision:2,lastRun:{id:otherId}}, {...context,toolName:"wait_for_plan_state"});
    assert.equal(g.nextAction.tool,"get_current_ai_agent_plan"); assert.equal(g.identity.actionId,undefined); assert.equal(g.identity.runId,undefined);
  }
  assert.equal(buildGuidance({state:"nonready",stateToken:"corrupted_snapshot"},{...context,toolName:"wait_for_plan_state"}).nextAction.kind,"stop");
});
test("incomplete reconciliation suggests historical evidence only", () => {
  const d=decorateToolResult(result({schema:"ae-agent-plan-reconciliation.v1",runId,status:"incomplete",originalError:"old",replayAllowed:false},false),{...context,toolName:"reconcile_plan_run"});
  const g=guidance(d); assert.equal(d.isError,false); assert.equal(g.error,null);
  assert.equal(g.nextAction.tool,"get_plan_run_evidence"); assert.equal(g.nextAction.reasonCode,"inspect_historical_run_evidence");
  assert.deepEqual(g.nextAction.arguments,{runId,limitChars:6000});
  const absent=buildGuidance({runId,status:"unknown",reasonCode:"run_record_missing"},{...context,toolName:"reconcile_plan_run"});
  assert.equal(absent.nextAction.kind,"stop"); assert.equal(absent.identity.runId,undefined);
});
test("success unchanged; bridge wait timeout observation", () => {
  const r=result({ok:true},false); assert.equal(decorateToolResult(r,context),r);
  const d=decorateToolResult(result({ok:true,timedOut:true,panelConnected:false},false),{...context,toolName:"wait_for_bridge_state"});
  assert.equal(guidance(d).error,null); assert.equal(d.isError,false);
});
test("HTTP diagnostic allowlist, redaction, bounds", () => {
  const p=sanitizeHttpFailure({code:"failed",phase:"ae_execution",actionId:"a",executionId:runId,commandId:"c",requestId:"r",
    confirmationToken:"secret-value",tree:{huge:"x".repeat(5000)},diagnostic:{message:"confirmationToken=secret-value Bearer abcdefghijklmnop",actionId:"a",executionId:runId,sessionAuthority:{token:"s"},rawPreview:"secret"}},500);
  assert.equal(p.executionId,runId); assert.equal(p.diagnostic.executionId,runId);
  assert.equal(JSON.stringify(p).includes("secret-value"),false); assert.equal(JSON.stringify(p).includes("rawPreview"),false);
  assert.equal(JSON.stringify(p).includes("sessionAuthority"),false);
  const envTokens=sanitizeHttpFailure({error:'AE_BRIDGE_PANEL_TOKEN=panel-secret "ae_bridge_token": "bridge-secret"',
    diagnostic:{message:"'Ae_Bridge_Panel_Token'='quoted-panel-secret'"}},500);
  for(const secret of ["panel-secret","bridge-secret","quoted-panel-secret"]) assert.equal(JSON.stringify(envTokens).includes(secret),false);
  assert.ok(JSON.stringify(buildGuidance({...run,error:"x".repeat(100000),confirmationToken:"secret"},context)).length<2000);
  const oversized={content:[{type:"text",text:"x".repeat(2*1024*1024+1)}],isError:true};
  const decorated=decorateToolResult(oversized,{...context,panelConnected:false});
  assert.equal(decorated.content[0],oversized.content[0]);assert.equal(guidance(decorated).nextAction.reasonCode,"response_payload_unavailable");
});
test("only a separate top-level appended guidance object suppresses decoration", () => {
  const nested=result({ok:false,schema:SCHEMA,nested:{schema:SCHEMA}},true);
  const decorated=decorateToolResult(nested,context);
  assert.equal(decorated.content.length,2);
  assert.equal(JSON.parse(decorated.content[0].text).schema,SCHEMA);
  const pretty={...decorated,content:[decorated.content[0],{...decorated.content[1],text:JSON.stringify(JSON.parse(decorated.content[1].text),null,2)}]};
  assert.equal(decorateToolResult(pretty,context),pretty);
  assert.equal(pretty.content.length,2);
});
assert.equal(guidance(decorateToolResult(result(run),context)).schema,SCHEMA);
process.stdout.write(JSON.stringify({ok:true,cases,scope:"offline pure guidance contract"})+"\n");

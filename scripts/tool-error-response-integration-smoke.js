#!/usr/bin/env node
"use strict";

// Isolated wire fixture: ephemeral loopback HTTP endpoint and stdio adapter.
// The production daemon is imported but never started; no native/CEP requests.
const assert = require("assert/strict");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");
const { decorateDaemonToolResult } = require("../mcp-server/bridge-daemon");
const { projectPlanRunSummary } = require("../mcp-server/plan-run-response");
const { runtimeIdentity } = require("../mcp-server/review-evidence");
const runId = "12345678-1234-1234-1234-123456789abc";
const legacy = (value, isError) => ({content:[{type:"text",text:JSON.stringify(value)}],isError});
const guidance = result => JSON.parse(result.content[1].text);

async function main() {
  // Helper-only code drift must change the same named-module composite identity
  // used by the actual daemon, not an independent hash implementation.
  const repo = path.resolve(__dirname,".."), baseline = runtimeIdentity(repo);
  assert.ok(baseline.modules.some(row=>row.name === "mcp-server/tool-error-response.js"));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(),"ae-guidance-identity-"));
  try {
    fs.mkdirSync(path.join(fixtureRoot,"mcp-server"));
    for(const row of baseline.modules) fs.copyFileSync(path.join(repo,row.name),path.join(fixtureRoot,row.name));
    assert.equal(runtimeIdentity(fixtureRoot).sourceSha256,baseline.sourceSha256);
    fs.appendFileSync(path.join(fixtureRoot,"mcp-server/tool-error-response.js"),"\n// isolated fixture drift\n");
    assert.notEqual(runtimeIdentity(fixtureRoot).sourceSha256,baseline.sourceSha256);
  } finally {
    // Only the absolute, generated fixture root is removed.
    assert.equal(path.dirname(fixtureRoot),path.resolve(os.tmpdir()));
    fs.rmSync(fixtureRoot,{recursive:true,force:true});
  }
  let requests = 0;
  const run = {id:runId,startedAt:"2026-10-04T00:00:00.000Z",ok:false,errorCode:"command_timeout",error:"Unknown execution outcome",dryRun:false,steps:[],
    provenance:{schema:"ae-agent-run-provenance.v1",actionId:"a",proposalRevision:1,planSha256:"a".repeat(64)},
    repairDirective:{eligible:false,automaticReplayAllowed:false},outcome:{mutation:{status:"unknown"}}};
  const server = http.createServer((req,res) => {
    if(req.url === "/health") {res.end(JSON.stringify({ok:true,server:"isolated-fixture"}));return;}
    if(req.url === "/tools") {res.end(JSON.stringify({ok:true,tools:[{name:"reconcile_plan_run",inputSchema:{type:"object",properties:{runId:{type:"string"}},required:["runId"]}}]}));return;}
    if(req.url !== "/mcp/tools/call") {res.writeHead(404);res.end("{}");return;}
    let text="";
    req.on("data",chunk=>{text+=chunk;});
    req.on("end",()=>{
      requests++;
      const body=JSON.parse(text);
      assert.equal(req.headers["x-ae-mcp-adapter"],"codex-stdio-v1");
      assert.equal(req.headers["x-ae-bridge-token"],"isolated-fixture-token");
      if(body.name === "transport_lost") {req.socket.destroy();return;}
      if(body.name === "http_failure") {
        res.writeHead(500);
        res.end(JSON.stringify({ok:false,code:"command_timeout",phase:"ae_execution",error:"Unknown outcome",
          actionId:"a",executionId:runId,commandId:"c",requestId:"r",confirmationToken:"never-copy",
          diagnostic:{code:"command_timeout",phase:"ae_execution",message:"secret=never-copy",actionId:"a",executionId:runId,commandId:"c",requestId:"r",rawPreview:"never-copy",sessionAuthority:{token:"never-copy"}},
          guidance:{schema:"ae-agent-tool-guidance.v1",nextAction:{kind:"tool",tool:"run_ai_agent_plan",arguments:{confirm:true}}}}));return;
      }
      const payload=body.name === "run_ai_agent_plan" ? (body.arguments.responseView === "summary" ? projectPlanRunSummary(run) : run)
        : {ok:true,timedOut:true,panelConnected:false,idle:true,state:"disconnected_idle"};
      const result=decorateDaemonToolResult(body.name,legacy(payload,body.name === "run_ai_agent_plan"));
      res.end(JSON.stringify({ok:true,tool:body.name,result}));
    });
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const child=spawn(process.execPath,[path.resolve(__dirname,"../mcp-server/mcp-adapter.js")],{
    cwd:path.resolve(__dirname,".."),windowsHide:true,stdio:["pipe","pipe","pipe"],
    env:{...process.env,AE_BRIDGE_HOST:"127.0.0.1",AE_BRIDGE_PORT:String(server.address().port),AE_BRIDGE_TOKEN:"isolated-fixture-token",AE_DAEMON_AUTO_START:"0",AE_DAEMON_HTTP_TIMEOUT_MS:"2000"}
  });
  const pending=new Map(); let serial=0, stderr="";
  child.stderr.on("data",chunk=>{stderr=(stderr+chunk).slice(-4000);});
  const lines=readline.createInterface({input:child.stdout});
  lines.on("line",line=>{
    const response=JSON.parse(line),entry=pending.get(response.id);
    if(entry) {clearTimeout(entry.timer);pending.delete(response.id);entry.resolve(response);}
  });
  child.on("exit",()=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(new Error(`Fixture adapter exited: ${stderr}`));}pending.clear();});
  function rpc(method,params) {
    return new Promise((resolve,reject)=>{
      const id=++serial;
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Fixture RPC timeout: ${method}`));},5000);
      pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n");
    });
  }
  let cases=1;
  try {
    const listed=await rpc("tools/list");assert.ok(listed.result.tools.some(t=>t.name === "reconcile_plan_run"));
    const full=(await rpc("tools/call",{name:"run_ai_agent_plan",arguments:{}})).result;
    const summary=(await rpc("tools/call",{name:"run_ai_agent_plan",arguments:{responseView:"summary"}})).result;
    assert.deepEqual(JSON.parse(full.content[0].text),run);assert.deepEqual(JSON.parse(summary.content[0].text),projectPlanRunSummary(run));
    assert.equal(full.isError,true);assert.deepEqual(guidance(full).identity,guidance(summary).identity);
    assert.deepEqual(guidance(full).nextAction,guidance(summary).nextAction);
    assert.equal(guidance(full).nextAction.tool,"wait_for_bridge_state");cases++;
    const wait=(await rpc("tools/call",{name:"wait_for_bridge_state",arguments:{waitMs:0}})).result;
    assert.equal(wait.isError,false);assert.equal(guidance(wait).error,null);assert.equal(guidance(wait).automaticReplayAllowed,false);cases++;
    const rejected=(await rpc("tools/call",{name:"http_failure",arguments:{runId:"client-untrusted"}})).result;
    const p=JSON.parse(rejected.content[0].text);
    assert.equal(p.actionId,"a");assert.equal(p.executionId,runId);assert.equal(p.commandId,"c");assert.equal(p.requestId,"r");
    assert.equal(p.diagnostic.executionId,runId);assert.equal(JSON.stringify(rejected).includes("never-copy"),false);
    assert.equal(guidance(rejected).identity.runId,undefined);assert.equal(guidance(rejected).nextAction.kind,"stop");cases++;
    const lost=(await rpc("tools/call",{name:"transport_lost",arguments:{actionId:"client-untrusted",runId}})).result;
    assert.equal(JSON.parse(lost.content[0].text).code,"bridge_unreachable");
    assert.equal(guidance(lost).nextAction.reasonCode,"daemon_transport_unavailable");assert.deepEqual(guidance(lost).identity,{});
    assert.equal(JSON.stringify(lost).includes("not_applied"),false);assert.equal(guidance(lost).automaticReplayAllowed,false);cases++;
    assert.equal(requests,5);
    process.stdout.write(JSON.stringify({ok:true,cases,scope:"isolated HTTP/stdio fixture; no live daemon or AE"})+"\n");
  } finally {
    lines.close();child.stdin.end();
    if(child.exitCode === null) child.kill();
    for(const entry of pending.values()) clearTimeout(entry.timer);
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{process.stderr.write(error.stack+"\n");process.exitCode=1;});

"use strict";

// Offline contract checks: local HTTP fixture and MCP initialize only; no AE or model calls.
const assert = require("assert");
const http = require("http");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");
const { TEXT_LAYOUT_POLICY, isTextLayoutRequest } = require("../mcp-server/text-layout-policy");
const { buildPlannerContext, FINAL_POLICY, MAX_PLANNER_CHARS } = require("../mcp-server/planner-context");

const tools = [
  {name:"get_active_comp", description:"Read active composition", inputSchema:{}},
  {name:"get_layer_details", description:"Inspect a layer", inputSchema:{}},
  {name:"update_text_layer", description:"Edit text and font", inputSchema:{}},
  {name:"align_layers_to_time", description:"Align clips to current time", inputSchema:{}}
];
const mutatingNames = new Set(["update_text_layer", "align_layers_to_time"]);
const countPolicy = (text) => text.split(TEXT_LAYOUT_POLICY).length - 1;
function planner(prompt, optimization, solutionHints, memorySection) {
  return buildPlannerContext({args:{prompt, promptOptimization:optimization}, tools, mutatingNames,
    snapshot:{available:false}, solutionHints, memorySection});
}

async function initializeAdapter() {
  const child = spawn(process.execPath, [path.join(__dirname, "../mcp-server/mcp-adapter.js")], {
    env:{...process.env, AE_DAEMON_AUTO_START:"0"}, windowsHide:true, stdio:["pipe", "pipe", "pipe"]
  });
  const lines = readline.createInterface({input:child.stdout});
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("MCP initialize fixture timed out")), 5000);
      child.on("error", (error) => {clearTimeout(timeout); reject(error);});
      child.on("exit", () => {clearTimeout(timeout); reject(new Error("Adapter exited before initialize"));});
      lines.on("line", (line) => {
        const reply = JSON.parse(line);
        if (reply.id !== 1) return;
        clearTimeout(timeout);
        if (reply.error) reject(new Error(reply.error.message)); else resolve(reply.result);
      });
      child.stdin.write(JSON.stringify({jsonrpc:"2.0", id:1, method:"initialize",
        params:{protocolVersion:"2025-03-26", capabilities:{}, clientInfo:{name:"text-policy-fixture",version:"1"}}})+"\n");
    });
  } finally {lines.close(); child.kill();}
}

async function providerDefaults() {
  const managed = ["AE_AGENT_SYSTEM_PROMPT", "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "CODEX_CLI_PATH"];
  const saved = new Map(managed.map((name) => [name, process.env[name]]));
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (req.method !== "POST" || req.url !== "/chat/completions") {res.writeHead(404); res.end(); return;}
    requests.push(JSON.parse(raw));
    res.writeHead(200, {"content-type":"application/json"});
    res.end(JSON.stringify({choices:[{message:{role:"assistant",content:"fixture"}}]}));
  });
  const modulePath = require.resolve("../mcp-server/ai-agents");
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    process.env.AE_AGENT_SYSTEM_PROMPT = "";
    process.env.OPENAI_API_KEY = "local-fixture-key";
    process.env.OPENAI_MODEL = "local-fixture-model";
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${server.address().port}`;
    process.env.CODEX_CLI_PATH = path.join(__dirname, "nonexistent-text-policy-cli-fixture.exe");
    delete require.cache[modulePath];
    let {chatWithAgent} = require(modulePath);
    const base = {agentId:"openai-api", prompt:"Отредактируй титры", skipReadinessCheck:true, timeoutMs:2000};
    await chatWithAgent(base);
    assert.equal(countPolicy(requests.at(-1).messages[0].content), 1);
    await chatWithAgent({...base, system:"Explicit custom system"});
    assert.equal(requests.at(-1).messages[0].content, "Explicit custom system");
    await chatWithAgent({...base, messages:[{role:"system",content:"History system"},{role:"user",content:"Keep history"}]});
    assert.equal(requests.at(-1).messages[0].content, "History system");
    await chatWithAgent({...base, useDefaultSystemPrompt:false});
    assert(!requests.at(-1).messages.some((message) => message.role === "system"));
    process.env.AE_AGENT_SYSTEM_PROMPT = "Configured custom system";
    delete require.cache[modulePath];
    ({chatWithAgent} = require(modulePath));
    await chatWithAgent(base);
    assert.equal(requests.at(-1).messages[0].content, "Configured custom system");
  } finally {
    for (const [name, value] of saved) {if (value === undefined) delete process.env[name]; else process.env[name] = value;}
    delete require.cache[modulePath];
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  assert(TEXT_LAYOUT_POLICY.includes("Правила оформления текста AE Agent"));
  assert(TEXT_LAYOUT_POLICY.includes("левое или правое выравнивание"));
  for (const optimization of [false, true]) {
    for (const request of ["Измени шрифт участников афиши", "Balance typography in the credits"]) {
      const result = planner(request, optimization);
      assert.equal(countPolicy(result.text), 1);
      assert(result.text.includes(request));
      assert(result.text.endsWith(FINAL_POLICY));
      assert(result.text.length <= MAX_PLANNER_CHARS);
      assert.equal(result.metadata.truncated, false);
    }
    assert.equal(countPolicy(planner("align_layers_to_time clips at current time", optimization).text), 0);
    const hinted = planner("Apply the reviewed operation", optimization,
      {retrieval:{entries:[{preferredTools:["update_text_layer"]}]}});
    assert.equal(countPolicy(hinted.text), 1);
  }
  assert(isTextLayoutRequest("Сверстай надпись", []));
  assert(isTextLayoutRequest("Сделай равными имена на афише", []));
  assert(!isTextLayoutRequest("Импортируй видео и измени длительность", []));
  assert(isTextLayoutRequest("Use selected operation", ["create_shapes_from_text"]));
  assert(!isTextLayoutRequest("Trim the footage duration", []));
  assert.throws(() => planner("text "+"x".repeat(12000), false), /exceeds 12000/);
  assert.throws(() => planner("Change text", true, undefined, "x".repeat(MAX_PLANNER_CHARS)), /not truncated/);
  const initialized = await initializeAdapter();
  assert.equal(countPolicy(initialized.instructions), 1);
  assert(initialized.instructions.includes("search_solutions"));
  assert(initialized.instructions.includes("dry run"));
  assert(initialized.instructions.includes("raw JSX and destructive"));
  await providerDefaults();
  console.log(JSON.stringify({ok:true, textPolicy:true, ruEnPlanner:true, optimizationParity:true,
    unrelatedTimingOmitted:true, bounded:true, mcpInitialize:true, providerDefaults:true,
    customSystemsPreserved:true, liveAeCommands:0, liveModelCalls:0}));
}
main().catch((error) => {console.error(error.stack); process.exitCode=1;});

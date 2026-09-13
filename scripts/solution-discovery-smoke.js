"use strict";

const assert = require("assert");
const http = require("http");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");
const { getBuilderContract } = require("../mcp-server/solution-plan-builder");
const ROOT = path.resolve(__dirname, "..");
const port = String(18000 + Math.floor(Math.random() * 10000));
const env = {...process.env, AE_BRIDGE_PORT: port, AE_BRIDGE_TOKEN: "discovery-smoke", AE_DAEMON_AUTO_START: "0"};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function health() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on("error", () => resolve(false)); req.setTimeout(1000, () => req.destroy());
  });
}

function legacyDirectCall(args) {
  return new Promise((resolve, reject) => {
    const req = http.request({hostname: "127.0.0.1", port, path: "/tools/call", method: "POST",
      headers: {"content-type": "application/json", "x-ae-bridge-token": env.AE_BRIDGE_TOKEN}}, (res) => {
      let body = ""; res.setEncoding("utf8"); res.on("data", (chunk) => {body += chunk;});
      res.on("end", () => {try {resolve(JSON.parse(body));} catch (e) {reject(e);}});
    });
    req.on("error", reject);
    req.end(JSON.stringify({name: "run_ai_agent_plan", arguments: args}));
  });
}

async function main() {
  const daemon = spawn(process.execPath, [path.join(ROOT, "mcp-server/bridge-daemon.js")], {env, windowsHide: true, stdio: ["ignore", "ignore", "pipe"]});
  let errors = "";
  daemon.stderr.on("data", (chunk) => { errors += chunk; });
  let adapter;
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) { if (await health()) { ready = true; break; } await delay(100); }
    assert(ready, `Isolated daemon failed: ${errors}`);
    adapter = spawn(process.execPath, [path.join(ROOT, "mcp-server/mcp-adapter.js")], {env, windowsHide: true, stdio: ["pipe", "pipe", "ignore"]});
    const pending = new Map();
    readline.createInterface({input: adapter.stdout}).on("line", (line) => {
      const message = JSON.parse(line); const request = pending.get(message.id);
      if (request) { pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
    });
    let id = 0;
    function rpc(method, params) {
      return new Promise((resolve, reject) => {
        const key = ++id;
        const timer = setTimeout(() => { pending.delete(key); reject(new Error(`Timeout: ${method}`)); }, 8000);
        pending.set(key, {resolve, reject, timer});
        adapter.stdin.write(JSON.stringify({jsonrpc: "2.0", id: key, method, params}) + "\n");
      });
    }
    async function call(name, args, fail = false) {
      const raw = await rpc("tools/call", {name, arguments: args});
      assert.strictEqual(Boolean(raw.isError), fail, `${name}: ${JSON.stringify(raw).slice(0, 2200)}`);
      return JSON.parse(raw.content[0].text);
    }
    const initialized = await rpc("initialize", {});
    assert(initialized.instructions.includes("search_solutions"));
    const listed = await rpc("tools/list", {});
    for (const name of ["search_solutions", "get_solution", "build_solution_plan", "propose_ai_agent_plan", "list_solution_candidates", "get_solution_candidate"]) assert(listed.tools.some((tool) => tool.name === name));
    const found = await call("search_solutions", {query: "Создай камеру с контроллером"});
    assert(found.results.length > 0);
    const camera = await call("get_solution", {id: found.results[0].id, limit: 500, toolNames: ["create_camera_with_controller"]});
    assert(camera.recipe.text.length <= 500);
    assert(camera.recipe.nextOffset > 0);
    assert(camera.toolContracts.some((tool) => tool.name === "create_camera_with_controller"));
    const next = await call("get_solution", {id: found.results[0].id, offset: camera.recipe.nextOffset, limit: 500});
    assert.strictEqual(next.recipe.offset, 500);
    assert.strictEqual(next.solution.verificationRecipe, undefined, "Continuation pages must not repeat full metadata.");
    await call("get_solution", {id: "../../README.md"}, true);
    await call("get_solution", {id: "unknown-id"}, true);
    await call("search_solutions", {query: ""}, true);
    const noMatches = await call("search_solutions", {query: "хрюмзик блямпотун"});
    assert.strictEqual(noMatches.count, 0);

    const solutionId = "ar-distributekeyframesevenly-typed-plan";
    const recipe = await call("get_solution", {id: solutionId});
    assert(recipe.planBuilder.inputSchema);
    const built = await call("build_solution_plan", {solutionId, inputs: getBuilderContract(solutionId).example});
    assert.strictEqual(built.validation.ok, true);
    const proposed = await call("propose_ai_agent_plan", {plan: built.plan});
    assert(proposed.proposal.actionId);
    assert.strictEqual(proposed.proposal.confirmation.confirmationToken, undefined);
    const preview = await call("run_ai_agent_plan", {actionId: proposed.proposal.actionId, dryRun: true});
    assert(preview.ok);
    assert.strictEqual(preview.executedCount, 0);
    assert.deepStrictEqual(preview.solutionReuse.declaredSolutionIds, [solutionId]);
    const unconfirmed = await call("run_ai_agent_plan", {plan: built.plan, dryRun: false, confirm: true, allowMutations: true}, true);
    assert.strictEqual(unconfirmed.ok, false);
    assert.strictEqual(unconfirmed.code, "proposal_required");
    const forgedConfirmation = await call("run_ai_agent_plan", {actionId: proposed.proposal.actionId, dryRun: false, confirm: true,
      allowMutations: true, confirmationToken: "pretend-user-token", confirmedBySurface: "cep-panel"}, true);
    assert.strictEqual(forgedConfirmation.code, "proposal_required");
    for (const dryRun of [false, "true", undefined]) {
      const legacy = await legacyDirectCall({actionId: proposed.proposal.actionId, dryRun, confirm: true, allowMutations: true});
      assert(legacy.result.isError, "Legacy direct route must require the literal dryRun:true.");
      assert.strictEqual(JSON.parse(legacy.result.content[0].text).code, "proposal_required");
    }
    const status = await call("get_bridge_status", {});
    assert.strictEqual(status.pendingCommands, 0, "Discovery/build/dry-run must enqueue no AE commands.");
    assert.strictEqual(status.panelConnected, false);
    console.log(JSON.stringify({ok: true, tools: listed.tools.length, russianDiscovery: true, paginatedRecipe: true,
      builderValidation: built.validation.ok, dryRunSteps: preview.steps.length, unconfirmedExecutionBlocked: true, aeCommands: 0}));
  } finally {
    if (adapter) adapter.kill();
    daemon.kill();
  }
}

main().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });

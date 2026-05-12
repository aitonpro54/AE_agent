"use strict";

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const daemonPath = path.join(__dirname, "..", "mcp-server", "bridge-daemon.js");
const adapterPath = path.join(__dirname, "..", "mcp-server", "mcp-adapter.js");
const nodePath = process.execPath;
const port = String(3457 + Math.floor(Math.random() * 1000));
const token = "smoke-test-token";

function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function requestJsonWithOptions(options, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : {} });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForResponse(stdout, id, timeoutMs) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const lines = stdout.join("").trim().split(/\n+/).filter(Boolean);
      for (const line of lines) {
        const message = JSON.parse(line);
        if (message.id === id) {
          clearInterval(timer);
          resolve(message);
          return;
        }
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for JSON-RPC response " + id));
      }
    }, 25);
  });
}

async function main() {
  const daemon = spawn(nodePath, [daemonPath], {
    env: {
      ...process.env,
      AE_BRIDGE_PORT: port,
      AE_BRIDGE_TOKEN: token
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const daemonStderr = [];
  daemon.stderr.setEncoding("utf8");
  daemon.stderr.on("data", (chunk) => daemonStderr.push(chunk));

  await wait(500);

  const adapter = spawn(nodePath, [adapterPath], {
    env: {
      ...process.env,
      AE_BRIDGE_PORT: port,
      AE_BRIDGE_TOKEN: token
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  const stdout = [];
  const adapterStderr = [];

  adapter.stdout.setEncoding("utf8");
  adapter.stderr.setEncoding("utf8");
  adapter.stdout.on("data", (chunk) => stdout.push(chunk));
  adapter.stderr.on("data", (chunk) => adapterStderr.push(chunk));

  adapter.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "0.0.0" }
    }
  }) + "\n");

  adapter.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  }) + "\n");

  await wait(250);

  adapter.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "list_comps",
      arguments: {}
    }
  }) + "\n");

  const next = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/bridge/next",
    method: "GET",
    headers: {
      "x-ae-bridge-token": token
    }
  });

  if (!next.body.command || !next.body.command.id || !next.body.command.script) {
    throw new Error("Expected pending AE command from bridge");
  }

  await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/bridge/result",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    id: next.body.command.id,
    ok: true,
    result: JSON.stringify({
      ok: true,
      result: [{ itemIndex: 1, name: "Smoke Comp", width: 1920, height: 1080 }]
    })
  });

  await waitForResponse(stdout, 3, 2000);

  const health = await requestJson(`http://127.0.0.1:${port}/health`);
  const agents = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/agents",
    method: "GET",
    headers: {
      "x-ae-bridge-token": token
    }
  });
  const agentsTool = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/dev/tool/list_ai_agents",
    method: "GET",
    headers: {
      "x-ae-bridge-token": token
    }
  });
  const readiness = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/agents/readiness?agentId=openrouter&checkModels=0",
    method: "GET",
    headers: {
      "x-ae-bridge-token": token
    }
  });
  const agentLog = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/agents/log?limit=5",
    method: "GET",
    headers: {
      "x-ae-bridge-token": token
    }
  });
  const badKeySave = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/agents/key",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    agentId: "openrouter",
    apiKey: "short"
  });
  const planRun = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/agents/plan/run",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    dryRun: true,
    requestId: "smoke-plan-run",
    plan: {
      summary: "Smoke-test the AE plan runner endpoint.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Read bridge status",
          tool: "get_bridge_status",
          args: {}
        }
      ]
    }
  });
  const ignoredBindingRun = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/agents/plan/run",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    dryRun: false,
    confirm: true,
    requestId: "smoke-ignored-binding-run",
    plan: {
      summary: "Smoke-test ignored extra result bindings.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Read bridge status with extra binding",
          tool: "get_bridge_status",
          args: {},
          resultBindings: {
            compName: "previous.missing"
          }
        }
      ]
    }
  });
  const mutatingPlan = {
    summary: "Smoke-test mutating plan safety.",
    risk: "low",
    requiresCheckpoint: false,
    steps: [
      {
        title: "Create temporary comp",
        tool: "create_test_comp",
        args: {
          name: "Codex Test Safe Run Smoke",
          width: 320,
          height: 180,
          duration: 1,
          frameRate: 24,
          openInViewer: false
        }
      }
    ]
  };
  const mutatingDryRun = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/agents/plan/run",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    dryRun: true,
    requestId: "smoke-mutating-dry-run",
    plan: mutatingPlan
  });
  const mutatingBlocked = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/agents/plan/run",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    dryRun: false,
    confirm: true,
    allowMutations: true,
    requestId: "smoke-mutating-blocked-run",
    plan: mutatingPlan
  });
  adapter.kill();
  daemon.kill();

  const lines = stdout.join("").trim().split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));

  if (lines.length < 3) {
    throw new Error("Expected initialize, tools/list, and tool call responses");
  }

  if (!health.body.ok || health.body.server !== "codex-ae-mcp-bridge" || health.body.version !== "0.25.0") {
    throw new Error("Unexpected health response");
  }
  if (!agents.body.ok || !Array.isArray(agents.body.agents) || !agents.body.agents.length) {
    throw new Error("Unexpected agents response");
  }
  if (!agentsTool.body.ok || !agentsTool.body.result || !Array.isArray(agentsTool.body.result.agents)) {
    throw new Error("Unexpected list_ai_agents tool response");
  }
  if (!readiness.body.ok || !readiness.body.readiness || readiness.body.readiness.agent.id !== "openrouter") {
    throw new Error("Unexpected readiness response");
  }
  if (!agentLog.body.ok || !Array.isArray(agentLog.body.events)) {
    throw new Error("Unexpected AI agent log response");
  }
  if (badKeySave.status !== 400 || badKeySave.body.ok !== false) {
    throw new Error("Unexpected API key validation response");
  }
  if (
    planRun.status !== 200 ||
    planRun.body.ok !== true ||
    !planRun.body.run ||
    planRun.body.run.dryRun !== true ||
    !Array.isArray(planRun.body.run.steps) ||
    planRun.body.run.steps.length !== 1 ||
    planRun.body.run.steps[0].status !== "ready" ||
    !planRun.body.run.finishedAt
  ) {
    throw new Error("Unexpected plan runner dry-run response");
  }
  if (
    mutatingDryRun.status !== 200 ||
    mutatingDryRun.body.ok !== true ||
    mutatingDryRun.body.run.validation.mutatingCount !== 1 ||
    mutatingDryRun.body.run.steps[0].status !== "ready"
  ) {
    throw new Error("Unexpected mutating plan dry-run response");
  }
  if (
    ignoredBindingRun.status !== 200 ||
    ignoredBindingRun.body.ok !== true ||
    ignoredBindingRun.body.run.steps[0].status !== "completed"
  ) {
    throw new Error("Unexpected ignored result binding run response");
  }
  if (
    mutatingBlocked.status !== 400 ||
    mutatingBlocked.body.ok !== false ||
    !mutatingBlocked.body.run ||
    mutatingBlocked.body.run.safety.status !== "blocked_missing_edit_session" ||
    String(mutatingBlocked.body.run.error || "").indexOf("autoEditSession:true") < 0
  ) {
    throw new Error("Mutating plan without checkpoint/edit session was not blocked");
  }

  const toolNames = lines[1].result.tools.map((tool) => tool.name);
  for (const expectedTool of ["get_ai_agent_log", "list_ai_agents", "check_ai_agent_readiness", "chat_with_ai_agent", "plan_with_ai_agent", "validate_ai_agent_plan", "run_ai_agent_plan", "start_edit_session", "get_edit_session_status", "finish_edit_session", "list_edit_sessions", "checkpoint_project", "list_project_checkpoints", "get_project_checkpoint_details", "delete_project_checkpoint", "restore_project_checkpoint"]) {
    if (!toolNames.includes(expectedTool)) {
      throw new Error("Missing expected tool: " + expectedTool);
    }
  }
  const createTextTool = lines[1].result.tools.find((tool) => tool.name === "create_text_layer");
  if (!createTextTool.inputSchema.properties.autoCheckpoint || !createTextTool.inputSchema.properties.checkpointLabel || !createTextTool.inputSchema.properties.idempotencyKey || !createTextTool.inputSchema.properties.verifyAfter) {
    throw new Error("create_text_layer is missing safety schema fields");
  }
  const validatePlanTool = lines[1].result.tools.find((tool) => tool.name === "validate_ai_agent_plan");
  if (!validatePlanTool || !validatePlanTool.inputSchema.properties.plan) {
    throw new Error("validate_ai_agent_plan is missing plan schema");
  }
  const runPlanTool = lines[1].result.tools.find((tool) => tool.name === "run_ai_agent_plan");
  if (!runPlanTool || !runPlanTool.inputSchema.properties.dryRun || !runPlanTool.inputSchema.properties.allowMutations || !runPlanTool.inputSchema.properties.autoEditSession) {
    throw new Error("run_ai_agent_plan is missing run safety schema");
  }

  console.log(JSON.stringify({
    ok: true,
    responses: lines.length,
    tools: toolNames,
    listCompsResult: lines[2].result.content[0].text,
    agents: agents.body.agents.map((agent) => agent.id),
    readiness: readiness.body.readiness.status,
    planRun: planRun.body.run.steps[0].status,
    ignoredBindingRun: ignoredBindingRun.body.run.steps[0].status,
    mutatingDryRun: mutatingDryRun.body.run.steps[0].status,
    mutatingBlocked: mutatingBlocked.body.run.safety.status,
    health: health.body,
    adapterLogs: adapterStderr.join("").trim().split(/\n+/).filter(Boolean),
    daemonLogs: daemonStderr.join("").trim().split(/\n+/).filter(Boolean)
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

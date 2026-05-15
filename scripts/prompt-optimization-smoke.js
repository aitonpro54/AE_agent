"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { PLANNER_USE } = require("../mcp-server/solution-library");
const { PLANNER_USE: MEMORY_PLANNER_USE } = require("../mcp-server/project-intent-memory");

const daemonPath = path.join(__dirname, "..", "mcp-server", "bridge-daemon.js");
const nodePath = process.execPath;
const bridgePort = String(4300 + Math.floor(Math.random() * 1000));
const bridgeToken = "prompt-optimization-smoke-token";
const model = "capture-model";
const captured = [];

function requestJson(options, payload) {
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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function writeJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writePromptSolutionRegistry(tempDir) {
  const registryPath = path.join(tempDir, "solutions.json");
  const registry = {
    schema: "ae-solution-registry.v1",
    solutionSchema: "ae-solution.v1",
    updatedAt: "2026-05-15",
    policy: {
      trackedStatuses: ["recipe", "typed-tool-candidate", "tool"],
      candidateLocation: "logs/solution-candidates/",
      plannerUse: PLANNER_USE,
      executionRule: "Solutions are advisory metadata; execution still uses validated Agent plans."
    },
    solutions: [
      {
        schema: "ae-solution.v1",
        id: "centered-title-recipe",
        title: "Create Centered Title Recipe",
        status: "recipe",
        tags: ["text", "title", "layout"],
        intent: {
          summary: "Create a centered title text layer in the active comp.",
          appliesWhen: ["The user asks for a centered title layer."]
        },
        inputs: [
          {
            name: "titleText",
            type: "string",
            required: true,
            description: "Title text requested by the user."
          }
        ],
        targetAssumptions: ["An active composition exists."],
        execution: {
          mode: "typed-plan",
          mutating: true,
          riskLevel: "medium",
          recipePath: "recipes/README.md",
          scriptPath: null,
          preferredTools: ["get_active_comp", "create_text_layer", "get_selected_layers"]
        },
        requiredSafetyGates: {
          planValidation: true,
          explicitConfirmation: true,
          allowMutations: true,
          idempotency: true,
          checkpointOrEditSession: true,
          postMutationReadBack: true
        },
        verificationRecipe: {
          summary: "Read back the created title layer.",
          steps: ["Use get_selected_layers or get_layer_details to verify text and position."],
          expectedEvidence: ["Created text layer has the expected title text and centered position."]
        },
        testedAeContext: {
          aeVersion: null,
          panelVersion: "AE Agent 1.0.0",
          bridgeVersion: "1.0.0",
          projectKind: "synthetic",
          notes: []
        },
        promotionHistory: [
          {
            date: "2026-05-15",
            from: "candidate",
            to: "recipe",
            reviewer: "codex",
            evidence: "Prompt smoke fixture.",
            commit: null
          }
        ],
        notes: []
      }
    ]
  };
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
  return registryPath;
}

function writePromptIntentMemory(tempDir) {
  const memoryPath = path.join(tempDir, "project-intent-memory.json");
  const memory = {
    schema: "ae-project-intent-memory.v1",
    entrySchema: "ae-project-intent-memory-entry.v1",
    updatedAt: "2026-05-15",
    policy: {
      plannerUse: MEMORY_PLANNER_USE,
      maxPromptChars: 1800,
      maxRetrievedEntries: 4,
      storageRule: "Local reviewed project intent only; no secrets, raw transcripts, public/tunnel URLs, full project scans, or user absolute paths."
    },
    entries: [
      {
        schema: "ae-project-intent-memory-entry.v1",
        id: "temporary-title-generated-prefix",
        status: "active",
        category: "generated-prefix",
        title: "Temporary Title Generated Prefix",
        summary: "Use Codex QA naming for temporary generated title assets and keep cleanup scoped to generated names.",
        tags: ["title", "generated-assets", "temporary", "cleanup"],
        appliesWhen: [
          "The user asks to create a temporary generated title layer or comp.",
          "Cleanup should avoid user-named project assets."
        ],
        priority: 9,
        confidence: "high",
        source: {
          kind: "prompt-smoke",
          date: "2026-05-15",
          reviewed: true
        },
        notes: ["Verify targets before any mutation."]
      }
    ]
  };
  fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2) + "\n", "utf8");
  return memoryPath;
}

async function waitForBridge() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    try {
      const response = await requestJson({
        hostname: "127.0.0.1",
        port: bridgePort,
        path: "/health",
        method: "GET"
      });
      if (response.body && response.body.ok) return response.body;
    } catch (_error) {}
    await delay(100);
  }
  throw new Error("Bridge did not become ready.");
}

function messageText(request, role) {
  const messages = request && Array.isArray(request.messages) ? request.messages : [];
  return messages.filter((message) => message.role === role).map((message) => String(message.content || "")).join("\n");
}

async function bridgeRequest(pathname, method, payload) {
  return requestJson({
    hostname: "127.0.0.1",
    port: bridgePort,
    path: pathname,
    method,
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": bridgeToken
    }
  }, payload);
}

async function waitForBridgeCommand(label) {
  const startedAt = Date.now();
  let response = null;
  while (Date.now() - startedAt < 8000) {
    response = await bridgeRequest("/bridge/next", "GET");
    if (response.body && response.body.command && response.body.command.id) return response.body.command;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label} context command.`);
}

async function postBridgeCommandResult(command, result) {
  const response = await bridgeRequest("/bridge/result", "POST", {
    id: command.id,
    ok: true,
    result: JSON.stringify({
      ok: true,
      result
    })
  });
  if (response.status !== 200 || !response.body || response.body.ok !== true) {
    throw new Error(`Could not post result for command ${command.id}.`);
  }
}

async function serviceOnlineContextSnapshot() {
  const activeCompCommand = await waitForBridgeCommand("active comp");
  if (String(activeCompCommand.script || "").indexOf("selectedLayers") < 0) {
    throw new Error("Expected project context snapshot to request get_active_comp.");
  }
  await postBridgeCommandResult(activeCompCommand, {
    itemIndex: 12,
    name: "Snapshot Comp",
    width: 1920,
    height: 1080,
    duration: 8,
    frameRate: 24,
    numLayers: 2,
    time: 1.25,
    selectedLayers: [
      {
        index: 2,
        name: "Selected Precomp Layer",
        matchName: "ADBE AV Layer",
        enabled: true,
        locked: false,
        startTime: 0,
        inPoint: 0,
        outPoint: 8,
        source: {
          itemIndex: 34,
          name: "Snapshot Source Precomp",
          type: "comp",
          typeName: "Composition"
        }
      }
    ]
  });

  const renderQueueCommand = await waitForBridgeCommand("render queue");
  if (String(renderQueueCommand.script || "").indexOf("renderQueue") < 0) {
    throw new Error("Expected project context snapshot to request get_render_queue_status.");
  }
  await postBridgeCommandResult(renderQueueCommand, {
    totalItems: 2,
    returned: 1,
    items: [
      {
        index: 1,
        status: 1,
        comp: {
          itemIndex: 12,
          name: "Snapshot Comp",
          type: "comp",
          typeName: "Composition"
        }
      }
    ]
  });
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-solution-prompt-"));
  const solutionRegistryPath = writePromptSolutionRegistry(tempDir);
  const projectIntentMemoryPath = writePromptIntentMemory(tempDir);
  const provider = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/models") {
        writeJson(res, 200, { data: [{ id: model, object: "model" }] });
        return;
      }

      if (req.method === "POST" && req.url === "/chat/completions") {
        const body = await readJsonBody(req);
        captured.push(body);
        const isPlan = messageText(body, "user").indexOf("Return one JSON object") >= 0;
        const content = isPlan
          ? JSON.stringify({
              summary: "Prompt optimization smoke plan",
              risk: "low",
              requiresCheckpoint: false,
              clarifyingQuestion: null,
              steps: [
                {
                  title: "Read bridge status",
                  intent: "Verify bridge availability.",
                  tool: "get_bridge_status",
                  args: {},
                  mutatesProject: false,
                  verifyAfter: false
                }
              ]
            })
          : "Prompt optimization smoke chat";
        writeJson(res, 200, {
          id: "chatcmpl-smoke",
          object: "chat.completion",
          model,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content
              }
            }
          ]
        });
        return;
      }

      writeJson(res, 404, { error: "not found" });
    } catch (error) {
      writeJson(res, 500, { error: error.message || String(error) });
    }
  });

  const providerPort = await listen(provider);
  const daemon = spawn(nodePath, [daemonPath], {
    env: {
      ...process.env,
      AE_BRIDGE_PORT: bridgePort,
      AE_BRIDGE_TOKEN: bridgeToken,
      AE_AGENT_PROVIDERS_JSON: JSON.stringify([
        {
          id: "prompt-smoke",
          label: "Prompt Smoke",
          provider: "prompt-smoke",
          apiStyle: "openai",
          baseUrl: `http://127.0.0.1:${providerPort}`,
          model,
          models: [model],
          requiresApiKey: false
        }
      ]),
      AE_SOLUTION_REGISTRY_PATH: solutionRegistryPath,
      AE_PROJECT_INTENT_MEMORY_PATH: projectIntentMemoryPath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const daemonStderr = [];
  daemon.stderr.setEncoding("utf8");
  daemon.stderr.on("data", (chunk) => daemonStderr.push(chunk));

  try {
    await waitForBridge();

    const headers = {
      "content-type": "application/json",
      "x-ae-bridge-token": bridgeToken
    };
    const chat = await requestJson({
      hostname: "127.0.0.1",
      port: bridgePort,
      path: "/agents/chat",
      method: "POST",
      headers
    }, {
      agentId: "prompt-smoke",
      model,
      prompt: "Summarize the active comp.",
      promptOptimization: true
    });

    const plan = await requestJson({
      hostname: "127.0.0.1",
      port: bridgePort,
      path: "/agents/plan",
      method: "POST",
      headers
    }, {
      agentId: "prompt-smoke",
      model,
      prompt: "Create a centered title layer.",
      promptOptimization: true
    });

    await bridgeRequest("/bridge/next", "GET");
    const onlinePlanPromise = requestJson({
      hostname: "127.0.0.1",
      port: bridgePort,
      path: "/agents/plan",
      method: "POST",
      headers
    }, {
      agentId: "prompt-smoke",
      model,
      prompt: "Use the selected precomp layer as context.",
      promptOptimization: false
    });
    await serviceOnlineContextSnapshot();
    const onlinePlan = await onlinePlanPromise;

    if (chat.status !== 200 || !chat.body.ok || !chat.body.result) {
      throw new Error("Prompt optimization chat request failed.");
    }
    if (plan.status !== 200 || !plan.body.ok || !plan.body.result || !plan.body.result.planParseOk) {
      throw new Error("Prompt optimization plan request failed.");
    }
    if (onlinePlan.status !== 200 || !onlinePlan.body.ok || !onlinePlan.body.result || !onlinePlan.body.result.planParseOk) {
      throw new Error("Online project context plan request failed.");
    }
    if (captured.length < 3) {
      throw new Error("Expected provider to capture chat and two plan requests.");
    }

    const chatSystem = messageText(captured[0], "system");
    const planUser = messageText(captured[1], "user");
    const onlinePlanUser = messageText(captured[2], "user");
    if (chatSystem.indexOf("Prompt Optimization is enabled") < 0) {
      throw new Error("Chat prompt optimization instruction was not sent to provider.");
    }
    if (planUser.indexOf("Prompt Optimization is enabled") < 0 || planUser.indexOf("Return one JSON object") < 0) {
      throw new Error("Plan prompt optimization instruction was not sent to provider.");
    }
    if (
      planUser.indexOf("Project intent memory hints") < 0 ||
      planUser.indexOf("Temporary Title Generated Prefix") < 0 ||
      planUser.indexOf("local inspectable advisory memory") < 0 ||
      planUser.indexOf("provider secrets") < 0
    ) {
      throw new Error("Plan prompt did not include bounded project intent memory hints.");
    }
    if (!plan.body.result.planProjectIntentMemory || plan.body.result.planProjectIntentMemory.returned < 1) {
      throw new Error("Plan result did not expose project intent memory retrieval metadata.");
    }
    if (planUser.indexOf("C:\\") >= 0 || planUser.indexOf("trycloudflare") >= 0) {
      throw new Error("Plan prompt should not include absolute paths or tunnel URLs from memory.");
    }
    if (
      planUser.indexOf("Reviewed solution hints") < 0 ||
      planUser.indexOf("Create Centered Title Recipe") < 0 ||
      planUser.indexOf("advisory") < 0 ||
      planUser.indexOf("normal MCP plan steps") < 0
    ) {
      throw new Error("Plan prompt did not include advisory solution retrieval hints.");
    }
    if (planUser.indexOf("Current project context snapshot") < 0 || planUser.indexOf("CEP panel is offline") < 0) {
      throw new Error("Plan prompt did not include the compact project context snapshot.");
    }
    if (!plan.body.result.planContextSnapshot || !plan.body.result.planContextSnapshot.bridge || plan.body.result.planContextSnapshot.bridge.panelConnected !== false) {
      throw new Error("Plan result did not expose the offline project context snapshot.");
    }
    if (
      onlinePlanUser.indexOf("Snapshot Comp") < 0 ||
      onlinePlanUser.indexOf("Snapshot Source Precomp") < 0 ||
      onlinePlanUser.indexOf("selectedSourceHints") < 0 ||
      onlinePlanUser.indexOf("renderQueue") < 0
    ) {
      throw new Error("Plan prompt did not include the online project context snapshot.");
    }
    const onlineSnapshot = onlinePlan.body.result.planContextSnapshot;
    if (
      !onlineSnapshot ||
      !onlineSnapshot.activeComp ||
      onlineSnapshot.activeComp.name !== "Snapshot Comp" ||
      !Array.isArray(onlineSnapshot.selectedSourceHints) ||
      !onlineSnapshot.selectedSourceHints.length ||
      onlineSnapshot.selectedSourceHints[0].bindingHint !== "{{selectedPrecompItemIndex}}" ||
      !onlineSnapshot.renderQueue ||
      onlineSnapshot.renderQueue.totalItems !== 2
    ) {
      throw new Error("Online project context snapshot was not compacted as expected.");
    }

    console.log(JSON.stringify({
      ok: true,
      captured: captured.length,
      chat: {
        status: chat.status,
        text: chat.body.result.text,
        systemIncludesOptimization: chatSystem.indexOf("Prompt Optimization is enabled") >= 0
      },
      plan: {
        status: plan.status,
        summary: plan.body.result.plan.summary,
        userPromptIncludesOptimization: planUser.indexOf("Prompt Optimization is enabled") >= 0,
        userPromptIncludesSolutionHints: planUser.indexOf("Create Centered Title Recipe") >= 0,
        userPromptIncludesIntentMemory: planUser.indexOf("Temporary Title Generated Prefix") >= 0,
        projectIntentMemoryReturned: plan.body.result.planProjectIntentMemory.returned,
        userPromptIncludesContextSnapshot: planUser.indexOf("Current project context snapshot") >= 0,
        contextPanelConnected: plan.body.result.planContextSnapshot.bridge.panelConnected
      },
      onlinePlan: {
        status: onlinePlan.status,
        summary: onlinePlan.body.result.plan.summary,
        activeComp: onlineSnapshot.activeComp.name,
        selectedSourceHint: onlineSnapshot.selectedSourceHints[0],
        renderQueueTotalItems: onlineSnapshot.renderQueue.totalItems,
        userPromptIncludesContextSnapshot: onlinePlanUser.indexOf("Snapshot Comp") >= 0
      }
    }, null, 2));
  } finally {
    daemon.kill();
    provider.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

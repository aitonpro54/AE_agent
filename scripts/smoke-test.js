"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const daemonPath = path.join(__dirname, "..", "mcp-server", "bridge-daemon.js");
const adapterPath = path.join(__dirname, "..", "mcp-server", "mcp-adapter.js");
const nodePath = process.execPath;
const port = String(3457 + Math.floor(Math.random() * 1000));
const token = "smoke-test-token";
const repoRoot = path.join(__dirname, "..");

function smokeArtifactDir() {
  const dir = path.join(repoRoot, "logs", "hardcore-sessions", "smoke-" + port);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeSmokeRegistryAndMemory(dir) {
  const registryPath = path.join(dir, "solutions.json");
  const memoryPath = path.join(dir, "project-intent-memory.json");
  fs.copyFileSync(path.join(repoRoot, "registry", "solutions.json"), registryPath);
  fs.copyFileSync(path.join(repoRoot, "registry", "project-intent-memory.json"), memoryPath);
  return { registryPath, memoryPath };
}

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

async function waitForPendingCommand(port, token, timeoutMs) {
  const startedAt = Date.now();
  let next = null;
  while (Date.now() - startedAt < timeoutMs) {
    next = await requestJsonWithOptions({
      hostname: "127.0.0.1",
      port,
      path: "/bridge/next",
      method: "GET",
      headers: {
        "x-ae-bridge-token": token
      }
    });
    if (next.body.command && next.body.command.id && next.body.command.script) return next;
    await wait(50);
  }
  return next;
}

async function callQueuedDevTool(port, token, toolName, payload, scriptSnippets, fakeResult) {
  const promise = requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/dev/tool/" + toolName,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, payload || {});
  const command = await waitForPendingCommand(port, token, 5000);
  if (!command.body.command || !command.body.command.id || !command.body.command.script) {
    throw new Error("Expected queued AE command for " + toolName);
  }
  for (const snippet of scriptSnippets || []) {
    if (command.body.command.script.indexOf(snippet) < 0) {
      throw new Error("Expected " + toolName + " script to include: " + snippet);
    }
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
    id: command.body.command.id,
    ok: true,
    result: JSON.stringify({
      ok: true,
      result: fakeResult || { ok: true, tool: toolName }
    })
  });
  const response = await promise;
  if (response.status !== 200 || !response.body.ok) {
    throw new Error("Unexpected " + toolName + " response");
  }
  return { response, command };
}

async function main() {
  const smokeDir = smokeArtifactDir();
  const smokeStores = writeSmokeRegistryAndMemory(smokeDir);
  const daemon = spawn(nodePath, [daemonPath], {
    env: {
      ...process.env,
      AE_BRIDGE_PORT: port,
      AE_BRIDGE_TOKEN: token,
      AE_AGENT_HARDCORE_SESSION_DIR: smokeDir,
      AE_AGENT_DEV_REQUEST_DIR: path.join(smokeDir, "dev-requests"),
      AE_SOLUTION_CANDIDATE_DIR: path.join(smokeDir, "solution-candidates"),
      AE_SOLUTION_REGISTRY_PATH: smokeStores.registryPath,
      AE_PROJECT_INTENT_MEMORY_PATH: smokeStores.memoryPath
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

  await waitForResponse(stdout, 2, 5000);

  adapter.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "list_comps",
      arguments: {}
    }
  }) + "\n");

  const next = await waitForPendingCommand(port, token, 5000);

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

  const layerAttributeSetPromise = requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/dev/tool/set_property_value",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    layerIndex: [1, 2],
    propertyPath: "threeDLayer",
    value: true,
    verifyAfter: false
  });
  const layerAttributeCommand = await waitForPendingCommand(port, token, 5000);
  if (!layerAttributeCommand.body.command || layerAttributeCommand.body.command.script.indexOf("var layerIndices = [1,2]") < 0) {
    throw new Error("Expected set_property_value to accept multiple layer indexes.");
  }
  if (layerAttributeCommand.body.command.script.indexOf("isThreeDLayerAttribute") < 0) {
    throw new Error("Expected set_property_value to handle the threeDLayer layer attribute.");
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
    id: layerAttributeCommand.body.command.id,
    ok: true,
    result: JSON.stringify({
      ok: true,
      result: {
        comp: { itemIndex: 1, name: "Smoke Comp" },
        layer: null,
        layers: [
          { index: 1, name: "Smoke Layer 1", threeDLayer: true },
          { index: 2, name: "Smoke Layer 2", threeDLayer: true }
        ],
        property: null,
        properties: [
          { name: "threeDLayer", value: true },
          { name: "threeDLayer", value: true }
        ]
      }
    })
  });
  const layerAttributeSet = await layerAttributeSetPromise;

  const alignLayersPromise = requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/dev/tool/align_layers_to_time",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    layerIndices: [1, 2],
    targetTime: 3,
    align: "inPoint",
    verifyAfter: false
  });
  const alignLayersCommand = await waitForPendingCommand(port, token, 5000);
  if (!alignLayersCommand.body.command || alignLayersCommand.body.command.script.indexOf("Codex Align Layers To Time") < 0) {
    throw new Error("Expected align_layers_to_time to queue a narrow layer timing command.");
  }
  if (alignLayersCommand.body.command.script.indexOf("targetTime - layer.inPoint") < 0) {
    throw new Error("Expected align_layers_to_time to align visible inPoint by default.");
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
    id: alignLayersCommand.body.command.id,
    ok: true,
    result: JSON.stringify({
      ok: true,
      result: {
        comp: { itemIndex: 1, name: "Smoke Comp", time: 3 },
        targetTime: 3,
        align: "inPoint",
        changedCount: 2,
        layers: [
          { index: 1, name: "Smoke Layer 1", inPoint: 3 },
          { index: 2, name: "Smoke Layer 2", inPoint: 3 }
        ]
      }
    })
  });
  const alignLayers = await alignLayersPromise;

  const queuedToolResponses = [];
  queuedToolResponses.push(await callQueuedDevTool(port, token, "set_comp_work_area", {
    duration: 2,
    verifyAfter: false
  }, ["Codex Set Comp Work Area", "comp.workAreaStart"], {
    comp: { itemIndex: 1, name: "Smoke Comp" },
    workAreaStart: 0,
    workAreaDuration: 2
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "set_layer_time_range", {
    layerIndices: [1, 2],
    inPoint: 0.5,
    duration: 1.5,
    verifyAfter: false
  }, ["Codex Set Layer Time Range", "__codexResolveLayers"], {
    changedCount: 2,
    layers: [{ index: 1, name: "Layer 1" }, { index: 2, name: "Layer 2" }]
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "stagger_layers", {
    layerIndices: [1, 2],
    startTime: 0,
    gap: 0.25,
    verifyAfter: false
  }, ["Codex Stagger Layers", "gap - overlap"], {
    changedCount: 2,
    layers: [{ index: 1, name: "Layer 1" }, { index: 2, name: "Layer 2" }]
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "split_layers_at_time", {
    layerIndices: [1],
    time: 1,
    verifyAfter: false
  }, ["Codex Split Layers At Time", "splitLayer"], {
    changedCount: 1,
    split: [{ original: { index: 2, name: "Layer 1" }, newLayer: { index: 1, name: "Layer 1" } }]
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "precompose_layers", {
    layerIndices: [1, 2],
    newCompName: "Smoke Precomp",
    openInViewer: false,
    verifyAfter: false
  }, ["Codex Precompose Layers", "precompose"], {
    comp: { itemIndex: 3, name: "Smoke Precomp" },
    layerIndices: [1, 2]
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "replace_layer_source", {
    layerIndices: [1],
    sourceItemIndex: 2,
    verifyAfter: false
  }, ["Codex Replace Layer Source", "replaceSource"], {
    sourceItem: { itemIndex: 2, name: "Smoke Source", type: "footage" },
    changedCount: 1,
    layers: [{ index: 1, name: "Layer 1" }]
  }));
  const deepDuplicateQueuedResponse = await callQueuedDevTool(port, token, "deep_duplicate_precomp_sources", {
    layerIndex: 1,
    sourceCompItemIndex: 3,
    nameSuffix: " Smoke Copy",
    unavailableFootagePolicy: "reuse",
    verifyAfter: false
  }, ["Codex Deep Duplicate Precomp Sources", "__codexDuplicateItemDeep", "__codexDuplicateFootageItem", "__codexDuplicateSolidFootageItem", "unavailableFootagePolicy", "replaceSource(newComp"], {
    comp: { itemIndex: 1, name: "Smoke Comp" },
    layer: { index: 1, name: "Smoke Precomp Smoke Copy", source: { itemIndex: 4, name: "Smoke Precomp Smoke Copy", type: "comp" } },
    originalComp: { itemIndex: 3, name: "Smoke Precomp", type: "comp" },
    duplicateComp: { itemIndex: 4, name: "Smoke Precomp Smoke Copy", type: "comp", numLayers: 2 },
    changedCount: 1,
    duplicatedItemCount: 2,
    duplicatedFootageCount: 1,
    reusedFootageCount: 1,
    relinkedLayerCount: 1,
    duplicatedItems: [
      { source: { itemIndex: 3, name: "Smoke Precomp" }, duplicate: { itemIndex: 4, name: "Smoke Precomp Smoke Copy" } },
      { source: { itemIndex: 5, name: "Smoke Solid" }, duplicate: { itemIndex: 6, name: "Smoke Solid Smoke Copy" } }
    ]
  });
  queuedToolResponses.push(deepDuplicateQueuedResponse);
  queuedToolResponses.push(await callQueuedDevTool(port, token, "rename_layers", {
    layerIndices: [1, 2],
    mode: "prefix",
    prefix: "Smoke ",
    verifyAfter: false
  }, ["Codex Rename Layers", "__codexRenameValue"], {
    changedCount: 2,
    renamed: [{ index: 1, before: "A", after: "Smoke A" }]
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "rename_project_items", {
    itemIndices: [1],
    mode: "suffix",
    suffix: " Smoke",
    verifyAfter: false
  }, ["Codex Rename Project Items", "__codexRenameValue"], {
    changedCount: 1,
    renamed: [{ itemIndex: 1, before: "Comp", after: "Comp Smoke" }]
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "update_text_layer", {
    layerIndex: 1,
    text: "Smoke",
    fontSize: 42,
    verifyAfter: false
  }, ["Codex Update Text Layer", "__codexApplyTextDocumentPatch"], {
    layer: { index: 1, name: "Text" },
    text: { kind: "TextDocument", text: "Smoke" }
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "create_shape_layer", {
    shape: "rectangle",
    name: "Smoke Shape",
    size: [320, 180],
    verifyAfter: false
  }, ["Codex Create Shape Layer", "ADBE Vector Shape - Rect"], {
    layer: { index: 1, name: "Smoke Shape" },
    shape: { type: "rectangle", size: [320, 180] }
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "fit_layer_to_comp", {
    layerIndices: [1],
    mode: "contain",
    verifyAfter: false
  }, ["Codex Fit Layer To Comp", "__codexLayerSourceSize"], {
    changedCount: 1,
    layers: [{ index: 1, name: "Layer 1" }]
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "set_property_keyframes", {
    layerIndex: 1,
    propertyPath: "ADBE Transform Group.ADBE Opacity",
    keyframes: [{ time: 0, value: 0 }, { time: 1, value: 100 }],
    verifyAfter: false
  }, ["Codex Set Property Keyframes", "setValueAtTime"], {
    layer: { index: 1, name: "Layer 1" },
    keyframeCount: 2
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "apply_keyframe_ease", {
    layerIndex: 1,
    propertyPath: "ADBE Transform Group.ADBE Opacity",
    keyIndices: [1, 2],
    interpolation: "bezier",
    verifyAfter: false
  }, ["Codex Apply Keyframe Ease", "__codexTemporalEaseDimensions", "setTemporalEaseAtKey"], {
    layer: { index: 1, name: "Layer 1" },
    keyIndices: [1, 2]
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "set_expression", {
    layerIndex: 1,
    propertyPath: "ADBE Transform Group.ADBE Opacity",
    expression: "value",
    verifyAfter: false
  }, ["Codex Set Expression", "canSetExpression"], {
    layer: { index: 1, name: "Layer 1" },
    expression: "value"
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "clear_expression", {
    layerIndex: 1,
    propertyPath: "ADBE Transform Group.ADBE Opacity",
    verifyAfter: false
  }, ["Codex Clear Expression", "expressionValue"], {
    layer: { index: 1, name: "Layer 1" },
    expression: ""
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "add_comp_to_render_queue", {
    compItemIndex: 1,
    outputPath: "smoke-output.mov",
    verifyAfter: false
  }, ["Codex Add Comp To Render Queue", "renderQueue.items.add"], {
    comp: { itemIndex: 1, name: "Smoke Comp" },
    renderQueueItem: { index: 1, comp: { itemIndex: 1, name: "Smoke Comp" } }
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "set_render_queue_output", {
    renderQueueItemIndex: 1,
    outputPath: "smoke-output.mov",
    verifyAfter: false
  }, ["Codex Set Render Queue Output", "outputModule.file"], {
    renderQueueItem: { index: 1, outputModules: [{ index: 1, file: "smoke-output.mov" }] }
  }));
  queuedToolResponses.push(await callQueuedDevTool(port, token, "get_render_queue_status", {
    limit: 5
  }, ["app.project.renderQueue", "__codexRenderQueueItemInfo"], {
    totalItems: 1,
    returned: 1,
    items: [{ index: 1, comp: { itemIndex: 1, name: "Smoke Comp" } }]
  }));

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
  const targetSummaryValidation = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/dev/tool/validate_ai_agent_plan",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    plan: {
      summary: "Smoke-test target summaries.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Trim selected layers",
          tool: "set_layer_time_range",
          args: {
            compItemIndex: 1,
            layerIndices: [1, 2],
            inPoint: 0,
            duration: 1
          }
        }
      ]
    }
  });
  const itemAliasValidation = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/dev/tool/validate_ai_agent_plan",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    plan: {
      summary: "Smoke-test project item index alias normalization.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Rename selected source precomp through alias",
          tool: "rename_project_items",
          args: {
            itemIndexes: [7],
            mode: "suffix",
            suffix: " Smoke"
          }
        }
      ]
    }
  });
  const deepDuplicateValidation = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/dev/tool/validate_ai_agent_plan",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    requestId: "smoke-deep-duplicate-validation",
    plan: {
      summary: "Smoke-test deep duplicate selected precomp source tree as a typed tool.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        {
          title: "Deep duplicate selected precomp sources",
          tool: "deep_duplicate_precomp_sources",
          args: {
            layerIndex: 1,
            sourceCompItemIndex: 7,
            nameSuffix: " copy smoke",
            unavailableFootagePolicy: "reuse"
          }
        }
      ]
    }
  });
  const deepDuplicateDryRun = await requestJsonWithOptions({
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
    requestId: "smoke-deep-duplicate-dry-run",
    plan: {
      summary: "Dry-run the typed deep duplicate precomp tool.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        {
          title: "Deep duplicate selected precomp sources",
          tool: "deep_duplicate_precomp_sources",
          args: {
            layerIndex: 1,
            sourceCompItemIndex: 7,
            nameSuffix: " copy smoke",
            unavailableFootagePolicy: "reuse"
          }
        }
      ]
    }
  });
  const hardcoreSession = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/agents/hardcore/run",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    prompt: "Smoke-test Agent Hardcore retry loop and knowledge capture.",
    maxAttempts: 2,
    projectOwner: true,
    reasoning_effort: "xhigh",
    allowMutations: true,
    autoEditSession: true,
    allowRawFallback: true,
    autoPromoteKnowledge: true,
    attemptPlans: [
      {
        summary: "Fail one typed tool to exercise dev handoff.",
        risk: "low",
        requiresCheckpoint: false,
        steps: [
          {
            title: "Read missing checkpoint details",
            tool: "get_project_checkpoint_details",
            args: {
              checkpointFile: "missing-hardcore-smoke-checkpoint.aep"
            }
          }
        ]
      },
      {
        summary: "Read-only verified Hardcore smoke.",
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
    ]
  });
  const memoryToolPlanValidation = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/dev/tool/validate_ai_agent_plan",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    plan: {
      summary: "Smoke-test local memory tools stay out of AE Agent plans.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Do not update memory inside an AE plan",
          tool: "update_project_intent_memory",
          args: {
            confirm: true,
            dryRun: true
          }
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
  const unresolvedSelectedPrecompLayerRun = await requestJsonWithOptions({
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
    requestId: "smoke-unresolved-selected-precomp-layer-binding",
    plan: {
      summary: "Smoke-test selected precomp layer binding diagnostics.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Read bridge status",
          tool: "get_bridge_status",
          args: {}
        },
        {
          title: "Read selected precomp layer without selection context",
          tool: "get_layer_details",
          args: {
            layerIndex: "{{selectedPrecompLayerIndex}}"
          }
        }
      ]
    }
  });
  const unresolvedSelectedSourceCompRun = await requestJsonWithOptions({
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
    requestId: "smoke-unresolved-selected-source-comp-binding",
    plan: {
      summary: "Smoke-test selected source comp binding diagnostics.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Read bridge status",
          tool: "get_bridge_status",
          args: {}
        },
        {
          title: "Read selected source comp without selection context",
          tool: "get_comp_details",
          args: {
            compItemIndex: "{{selectedPrecompItemIndex}}"
          }
        }
      ]
    }
  });
  const unresolvedSelectedLayerRun = await requestJsonWithOptions({
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
    requestId: "smoke-unresolved-selected-layer-binding",
    plan: {
      summary: "Smoke-test selected layer binding diagnostics.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Read bridge status",
          tool: "get_bridge_status",
          args: {}
        },
        {
          title: "Read selected layer without selection context",
          tool: "get_layer_details",
          args: {
            layerIndex: "{{selectedLayerIndex}}"
          }
        }
      ]
    }
  });
  const namedCompBindingRunPromise = requestJsonWithOptions({
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
    requestId: "smoke-named-comp-binding-run",
    plan: {
      summary: "Smoke-test common named comp runtime bindings.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Inspect active comp",
          tool: "get_active_comp",
          args: {}
        },
        {
          title: "List layers by named active comp binding",
          tool: "list_layers",
          args: {
            compItemIndex: "{{compItemIndex}}"
          }
        },
        {
          title: "Read selected precomp layer through layer binding",
          tool: "get_layer_details",
          args: {
            layerIndex: "{{selectedPrecompLayerIndex}}"
          }
        },
        {
          title: "Read selected source precomp through itemIndexes binding",
          tool: "get_comp_details",
          args: {
            compItemIndex: "{{itemIndexes}}",
            includeLayers: false
          }
        },
        {
          title: "Read details through wrapped step shorthand",
          tool: "get_comp_details",
          args: {
            compItemIndex: "{{steps.1.result}}",
            includeLayers: false
          }
        },
        {
          title: "List selected precomp source layers",
          tool: "list_layers",
          args: {
            compItemIndex: "{{selectedPrecompItemIndex}}"
          }
        }
      ]
    }
  });
  const activeCompBindingCommand = await waitForPendingCommand(port, token, 5000);
  if (!activeCompBindingCommand.body.command || activeCompBindingCommand.body.command.script.indexOf("app.project.activeItem") < 0) {
    throw new Error("Expected get_active_comp command for named binding smoke.");
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
    id: activeCompBindingCommand.body.command.id,
    ok: true,
    result: JSON.stringify({
      ok: true,
      result: {
        itemIndex: 1,
        name: "Smoke Active Comp",
        width: 1920,
        height: 1080,
        duration: 5,
        frameRate: 24,
        numLayers: 1,
        time: 0,
        selectedLayers: [
          {
            index: 1,
            name: "Smoke Precomp Layer",
            source: {
              itemIndex: 7,
              name: "Smoke Source Precomp",
              type: "comp",
              typeName: "Composition"
            }
          }
        ]
      }
    })
  });
  const activeCompListCommand = await waitForPendingCommand(port, token, 5000);
  if (!activeCompListCommand.body.command || activeCompListCommand.body.command.script.indexOf("app.project.item(1)") < 0) {
    throw new Error("Expected named {{compItemIndex}} binding to resolve to active comp item 1.");
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
    id: activeCompListCommand.body.command.id,
    ok: true,
    result: JSON.stringify({
      ok: true,
      result: {
        comp: { itemIndex: 1, name: "Smoke Active Comp", numLayers: 1 },
        layers: [{ index: 1, name: "Smoke Precomp Layer" }]
      }
    })
  });
  const selectedPrecompLayerBindingCommand = await waitForPendingCommand(port, token, 5000);
  if (!selectedPrecompLayerBindingCommand.body.command || selectedPrecompLayerBindingCommand.body.command.script.indexOf("comp.layer(1)") < 0) {
    throw new Error("Expected {{selectedPrecompLayerIndex}} binding to resolve to selected layer index 1.");
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
    id: selectedPrecompLayerBindingCommand.body.command.id,
    ok: true,
    result: JSON.stringify({
      ok: true,
      result: {
        layer: {
          index: 1,
          name: "Smoke Precomp Layer",
          source: {
            itemIndex: 7,
            name: "Smoke Source Precomp",
            type: "comp",
            typeName: "Composition"
          }
        }
      }
    })
  });
  const itemIndexesBindingCommand = await waitForPendingCommand(port, token, 5000);
  if (!itemIndexesBindingCommand.body.command || itemIndexesBindingCommand.body.command.script.indexOf("__codexResolveComp(7)") < 0) {
    throw new Error("Expected {{itemIndexes}} binding to resolve to selected source comp item 7.");
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
    id: itemIndexesBindingCommand.body.command.id,
    ok: true,
    result: JSON.stringify({
      ok: true,
      result: {
        itemIndex: 7,
        name: "Smoke Source Precomp",
        type: "comp",
        width: 1920,
        height: 1080,
        duration: 5,
        frameRate: 24,
        numLayers: 0,
        layersReturned: 0,
        layers: []
      }
    })
  });
  const wrappedStepBindingCommand = await waitForPendingCommand(port, token, 5000);
  if (!wrappedStepBindingCommand.body.command || wrappedStepBindingCommand.body.command.script.indexOf("__codexResolveComp(1)") < 0) {
    throw new Error("Expected wrapped {{steps.1.result}} binding to resolve to active comp item 1.");
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
    id: wrappedStepBindingCommand.body.command.id,
    ok: true,
    result: JSON.stringify({
      ok: true,
      result: {
        itemIndex: 1,
        name: "Smoke Active Comp",
        type: "comp",
        width: 1920,
        height: 1080,
        duration: 5,
        frameRate: 24,
        numLayers: 1,
        selectedLayerIndices: [1],
        layersReturned: 0,
        layers: []
      }
    })
  });
  const selectedPrecompBindingCommand = await waitForPendingCommand(port, token, 5000);
  if (!selectedPrecompBindingCommand.body.command || selectedPrecompBindingCommand.body.command.script.indexOf("app.project.item(7)") < 0) {
    throw new Error("Expected {{selectedPrecompItemIndex}} binding to resolve to selected source comp item 7.");
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
    id: selectedPrecompBindingCommand.body.command.id,
    ok: true,
    result: JSON.stringify({
      ok: true,
      result: {
        comp: { itemIndex: 7, name: "Smoke Source Precomp", numLayers: 0 },
        layers: []
      }
    })
  });
  const namedCompBindingRun = await namedCompBindingRunPromise;
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
  const rawExtendscriptPlan = {
    summary: "Smoke-test raw ExtendScript execution gate.",
    risk: "medium",
    requiresCheckpoint: false,
    steps: [
      {
        title: "Run raw script only after explicit dry-run gate",
        tool: "run_extendscript",
        args: {
          script: "return { ok: true, smoke: 'raw-gate' };"
        }
      }
    ]
  };
  const rawExtendscriptDryRun = await requestJsonWithOptions({
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
    requestId: "smoke-raw-extendscript-gate",
    plan: rawExtendscriptPlan
  });
  const rawExtendscriptWrongGate = await requestJsonWithOptions({
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
    allowRawExtendscript: true,
    rawExtendscriptDryRunId: "wrong-dry-run-id",
    requestId: "smoke-raw-extendscript-gate",
    plan: rawExtendscriptPlan
  });
  const rawExtendscriptAfterDryRun = await requestJsonWithOptions({
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
    allowRawExtendscript: true,
    rawExtendscriptDryRunId: rawExtendscriptDryRun.body && rawExtendscriptDryRun.body.run ? rawExtendscriptDryRun.body.run.id : "",
    requestId: "smoke-raw-extendscript-gate",
    plan: rawExtendscriptPlan
  });
  const devRequest = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/agents/dev-request",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    source: "smoke-test",
    title: "Smoke typed tool escalation",
    goal: "Create a typed bridge tool for the raw smoke workflow. OPENAI_API_KEY=sk-smoke-secret",
    reason: "Raw ExtendScript workaround should become a typed tool.",
    desiredTool: "A typed bridge tool that replaces the raw smoke script.",
    acceptanceCriteria: [
      "Dev request bundle is compact.",
      "Start prompt lists targeted context only."
    ],
    targetFiles: ["mcp-server/bridge-daemon.js", "scripts/smoke-test.js"],
    planResult: {
      requestId: "smoke-raw-extendscript-gate",
      plan: rawExtendscriptPlan,
      planValidation: rawExtendscriptDryRun.body && rawExtendscriptDryRun.body.run ? rawExtendscriptDryRun.body.run.validation : null
    },
    runResult: {
      ok: false,
      error: "Provider token Bearer smoke-secret-token and path C:\\Users\\Ant\\Documents\\Codex\\AE_agent\\private.aep must be redacted."
    },
    openCodexApp: false
  });
  const devRequestBundle = devRequest.body && devRequest.body.bundle ? devRequest.body.bundle : null;
  const devRequestDir = devRequestBundle && devRequestBundle.directory
    ? path.join(__dirname, "..", devRequestBundle.directory)
    : "";
  const devRequestFile = devRequestBundle && devRequestBundle.requestFile
    ? path.join(__dirname, "..", devRequestBundle.requestFile)
    : "";
  const devEvidenceFile = devRequestBundle && devRequestBundle.evidenceFile
    ? path.join(__dirname, "..", devRequestBundle.evidenceFile)
    : "";
  const devStartPromptFile = devRequestBundle && devRequestBundle.startPromptFile
    ? path.join(__dirname, "..", devRequestBundle.startPromptFile)
    : "";
  const devCandidateFile = devRequestBundle && devRequestBundle.candidateFile
    ? path.join(__dirname, "..", devRequestBundle.candidateFile)
    : "";
  const devRequestText = devRequestFile && fs.existsSync(devRequestFile) ? fs.readFileSync(devRequestFile, "utf8") : "";
  const devEvidenceText = devEvidenceFile && fs.existsSync(devEvidenceFile) ? fs.readFileSync(devEvidenceFile, "utf8") : "";
  const devStartPromptText = devStartPromptFile && fs.existsSync(devStartPromptFile) ? fs.readFileSync(devStartPromptFile, "utf8") : "";
  const devCandidateText = devCandidateFile && fs.existsSync(devCandidateFile) ? fs.readFileSync(devCandidateFile, "utf8") : "";
  adapter.kill();
  daemon.kill();

  const lines = stdout.join("").trim().split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));

  if (lines.length < 3) {
    throw new Error("Expected initialize, tools/list, and tool call responses");
  }

  if (!health.body.ok || health.body.server !== "codex-ae-mcp-bridge" || health.body.version !== "1.0.10") {
    throw new Error("Unexpected health response");
  }
  if (!agents.body.ok || !Array.isArray(agents.body.agents) || !agents.body.agents.length) {
    throw new Error("Unexpected agents response");
  }
  if (layerAttributeSet.status !== 200 || !layerAttributeSet.body.ok || !Array.isArray(layerAttributeSet.body.result.layers) || layerAttributeSet.body.result.layers.length !== 2) {
    throw new Error("Expected set_property_value to set threeDLayer on multiple selected-layer indexes");
  }
  if (alignLayers.status !== 200 || !alignLayers.body.ok || alignLayers.body.result.changedCount !== 2) {
    throw new Error("Expected align_layers_to_time to align multiple layer timings");
  }
  if (queuedToolResponses.length !== 19 || queuedToolResponses.some((item) => item.response.status !== 200 || !item.response.body.ok)) {
    throw new Error("Expected all new typed tool queue smokes to pass");
  }
  const deepDuplicateQueuedPayload = deepDuplicateQueuedResponse.response.body.result || {};
  if (
    deepDuplicateQueuedPayload.rootCompItemIndex !== 4 ||
    deepDuplicateQueuedPayload.duplicatedRootCompItemIndex !== 4 ||
    !Array.isArray(deepDuplicateQueuedPayload.createdItemIndices) ||
    deepDuplicateQueuedPayload.createdItemIndices.join(",") !== "4,6" ||
    !Array.isArray(deepDuplicateQueuedPayload.duplicatedProjectItemIndices) ||
    deepDuplicateQueuedPayload.duplicatedProjectItemIndices.join(",") !== "4,6"
  ) {
    throw new Error("Deep duplicate result aliases did not expose read-back binding fields");
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
    !planRun.body.run.finishedAt ||
    !planRun.body.run.validation.classification ||
    planRun.body.run.validation.classification.category !== "safe typed-tool"
  ) {
    throw new Error("Unexpected plan runner dry-run response");
  }
  if (
    targetSummaryValidation.status !== 200 ||
    targetSummaryValidation.body.ok !== true ||
    !targetSummaryValidation.body.result ||
    !targetSummaryValidation.body.result.steps ||
    String(targetSummaryValidation.body.result.steps[0].targetSummary || "").indexOf("layers 1,2") < 0 ||
    !targetSummaryValidation.body.result.classification ||
    targetSummaryValidation.body.result.classification.category !== "risky"
  ) {
    throw new Error("Plan validation did not include the expected affected target summary");
  }
  if (
    itemAliasValidation.status !== 200 ||
    itemAliasValidation.body.ok !== true ||
    !itemAliasValidation.body.result ||
    !itemAliasValidation.body.result.steps ||
    !Array.isArray(itemAliasValidation.body.result.steps[0].safeArgs.itemIndices) ||
    itemAliasValidation.body.result.steps[0].safeArgs.itemIndices[0] !== 7 ||
    Object.prototype.hasOwnProperty.call(itemAliasValidation.body.result.steps[0].safeArgs, "itemIndexes")
  ) {
    throw new Error("Plan validation did not normalize itemIndexes to itemIndices");
  }
  const deepDuplicateStep = deepDuplicateValidation.body.result && deepDuplicateValidation.body.result.steps
    ? deepDuplicateValidation.body.result.steps[0]
    : null;
  if (
    deepDuplicateValidation.status !== 200 ||
    deepDuplicateValidation.body.ok !== true ||
    !deepDuplicateStep ||
    deepDuplicateStep.tool !== "deep_duplicate_precomp_sources" ||
    deepDuplicateStep.valid !== true ||
    deepDuplicateStep.executable !== true ||
    deepDuplicateStep.mutatesProject !== true ||
    deepDuplicateValidation.body.result.classification.rawExtendscriptStepCount !== 0 ||
    String(deepDuplicateStep.targetSummary || "").indexOf("source comp #7") < 0 ||
    deepDuplicateStep.safeArgs.verifyAfter !== true ||
    !deepDuplicateStep.safeArgs.idempotencyKey
  ) {
    throw new Error("Deep duplicate precomp source workflow did not validate as a typed mutating tool");
  }
  if (
    deepDuplicateDryRun.status !== 200 ||
    deepDuplicateDryRun.body.ok !== true ||
    !deepDuplicateDryRun.body.run ||
    deepDuplicateDryRun.body.run.validation.classification.rawExtendscriptStepCount !== 0 ||
    deepDuplicateDryRun.body.run.validation.mutatingCount !== 1 ||
    deepDuplicateDryRun.body.run.steps[0].tool !== "deep_duplicate_precomp_sources" ||
    deepDuplicateDryRun.body.run.steps[0].status !== "ready"
  ) {
    throw new Error("Deep duplicate precomp source workflow did not dry-run as a typed plan");
  }
  if (
    hardcoreSession.status !== 200 ||
    hardcoreSession.body.ok !== true ||
    !hardcoreSession.body.session ||
    hardcoreSession.body.session.status !== "verified" ||
    hardcoreSession.body.session.attempts.length !== 2 ||
    hardcoreSession.body.session.attempts[0].status !== "run-needs-review" ||
    hardcoreSession.body.session.attempts[1].status !== "verified" ||
    hardcoreSession.body.session.projectOwner !== true ||
    hardcoreSession.body.session.reasoningEffort !== "xhigh" ||
    !Array.isArray(hardcoreSession.body.session.typedToolFailures) ||
    hardcoreSession.body.session.typedToolFailures.length !== 1 ||
    hardcoreSession.body.session.typedToolFailures[0].tool !== "get_project_checkpoint_details" ||
    !hardcoreSession.body.session.typedToolFailures[0].bundle ||
    !hardcoreSession.body.session.typedToolFailures[0].bundle.startPrompt ||
    String(hardcoreSession.body.session.typedToolFailures[0].bundle.startPrompt).indexOf("Continue development") < 0 ||
    !hardcoreSession.body.session.artifacts ||
    !hardcoreSession.body.session.artifacts.sessionArtifact ||
    !hardcoreSession.body.session.artifacts.candidate ||
    !hardcoreSession.body.session.artifacts.solutionPromotion ||
    hardcoreSession.body.session.artifacts.solutionPromotion.ok !== true ||
    !hardcoreSession.body.session.artifacts.projectMemory ||
    hardcoreSession.body.session.artifacts.projectMemory.ok !== true
  ) {
    throw new Error("Agent Hardcore session did not retry, verify, and capture validated knowledge artifacts");
  }
  if (
    memoryToolPlanValidation.status !== 200 ||
    memoryToolPlanValidation.body.ok !== true ||
    !memoryToolPlanValidation.body.result ||
    memoryToolPlanValidation.body.result.ok !== false ||
    !memoryToolPlanValidation.body.result.classification ||
    memoryToolPlanValidation.body.result.classification.category !== "unsupported" ||
    String((memoryToolPlanValidation.body.result.steps[0].warnings || []).join(" ")).indexOf("not available for AI Agent plans") < 0
  ) {
    throw new Error("Project Intent Memory update tool should not be available inside AE Agent plans");
  }
  if (
    mutatingDryRun.status !== 200 ||
    mutatingDryRun.body.ok !== true ||
    mutatingDryRun.body.run.validation.mutatingCount !== 1 ||
    mutatingDryRun.body.run.validation.classification.category !== "risky" ||
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
    unresolvedSelectedPrecompLayerRun.status !== 400 ||
    unresolvedSelectedPrecompLayerRun.body.ok !== false ||
    !unresolvedSelectedPrecompLayerRun.body.run ||
    unresolvedSelectedPrecompLayerRun.body.run.steps[1].status !== "blocked" ||
    String(unresolvedSelectedPrecompLayerRun.body.run.steps[1].reason || "").indexOf("no selected precomp layer") < 0
  ) {
    throw new Error("Unexpected unresolved selected precomp layer binding diagnostic");
  }
  if (
    unresolvedSelectedSourceCompRun.status !== 400 ||
    unresolvedSelectedSourceCompRun.body.ok !== false ||
    !unresolvedSelectedSourceCompRun.body.run ||
    unresolvedSelectedSourceCompRun.body.run.steps[1].status !== "blocked" ||
    String(unresolvedSelectedSourceCompRun.body.run.steps[1].reason || "").indexOf("no selected precomp source comp") < 0
  ) {
    throw new Error("Unexpected unresolved selected source comp binding diagnostic");
  }
  if (
    unresolvedSelectedLayerRun.status !== 400 ||
    unresolvedSelectedLayerRun.body.ok !== false ||
    !unresolvedSelectedLayerRun.body.run ||
    unresolvedSelectedLayerRun.body.run.steps[1].status !== "blocked" ||
    String(unresolvedSelectedLayerRun.body.run.steps[1].reason || "").indexOf("no selected layer") < 0
  ) {
    throw new Error("Unexpected unresolved selected layer binding diagnostic");
  }
  if (
    namedCompBindingRun.status !== 200 ||
    namedCompBindingRun.body.ok !== true ||
    !namedCompBindingRun.body.run ||
    namedCompBindingRun.body.run.steps.length !== 6 ||
    namedCompBindingRun.body.run.steps.some((step) => step.status !== "completed") ||
    Number(namedCompBindingRun.body.run.steps[1].args.compItemIndex) !== 1 ||
    Number(namedCompBindingRun.body.run.steps[2].args.layerIndex) !== 1 ||
    Number(namedCompBindingRun.body.run.steps[3].args.compItemIndex) !== 7 ||
    Number(namedCompBindingRun.body.run.steps[4].args.compItemIndex) !== 1 ||
    Number(namedCompBindingRun.body.run.steps[5].args.compItemIndex) !== 7
  ) {
    throw new Error("Unexpected named comp runtime binding run response");
  }
  if (
    mutatingBlocked.status !== 400 ||
    mutatingBlocked.body.ok !== false ||
    !mutatingBlocked.body.run ||
    mutatingBlocked.body.run.safety.status !== "blocked_missing_edit_session" ||
    String(mutatingBlocked.body.run.error || "").indexOf("autoEditSession:true") < 0 ||
    String(mutatingBlocked.body.run.recoveryHint || "").indexOf("No project change was started") < 0
  ) {
    throw new Error("Mutating plan without checkpoint/edit session was not blocked");
  }
  if (
    rawExtendscriptDryRun.status !== 200 ||
    rawExtendscriptDryRun.body.ok !== true ||
    !rawExtendscriptDryRun.body.run ||
    rawExtendscriptDryRun.body.run.validation.classification.rawExtendscriptStepCount !== 1 ||
    rawExtendscriptDryRun.body.run.validation.classification.blocksRun !== true ||
    !rawExtendscriptDryRun.body.run.safety.rawExtendscriptGate ||
    rawExtendscriptDryRun.body.run.safety.rawExtendscriptGate.status !== "dry-run-approved" ||
    rawExtendscriptDryRun.body.run.steps[0].status !== "ready"
  ) {
    throw new Error("Raw ExtendScript dry-run did not record an execution gate approval");
  }
  if (
    rawExtendscriptWrongGate.status !== 400 ||
    rawExtendscriptWrongGate.body.ok !== false ||
    !rawExtendscriptWrongGate.body.run ||
    rawExtendscriptWrongGate.body.run.safety.status !== "blocked_raw_extendscript_gate" ||
    String(rawExtendscriptWrongGate.body.run.error || "").indexOf("same current plan") < 0
  ) {
    throw new Error("Raw ExtendScript run without matching dry-run gate was not blocked");
  }
  if (
    rawExtendscriptAfterDryRun.status !== 400 ||
    rawExtendscriptAfterDryRun.body.ok !== false ||
    !rawExtendscriptAfterDryRun.body.run ||
    !rawExtendscriptAfterDryRun.body.run.safety.rawExtendscriptGate ||
    rawExtendscriptAfterDryRun.body.run.safety.rawExtendscriptGate.status !== "approved" ||
    rawExtendscriptAfterDryRun.body.run.safety.status !== "blocked_missing_edit_session" ||
    String(rawExtendscriptAfterDryRun.body.run.error || "").indexOf("autoEditSession:true") < 0
  ) {
    throw new Error("Raw ExtendScript dry-run gate did not unlock the normal edit-session safety check");
  }
  if (
    devRequest.status !== 200 ||
    devRequest.body.ok !== true ||
    !devRequestBundle ||
    !devRequestBundle.requestFile ||
    !devRequestBundle.evidenceFile ||
    !devRequestBundle.startPromptFile ||
    !devRequestBundle.startPrompt ||
    !devRequestBundle.candidateFile ||
    !fs.existsSync(devRequestFile) ||
    !fs.existsSync(devEvidenceFile) ||
    !fs.existsSync(devStartPromptFile) ||
    !fs.existsSync(devCandidateFile)
  ) {
    throw new Error("Dev request bundle was not created");
  }
  if (!devRequest.body.codexApp || devRequest.body.codexApp.skipped !== true) {
    throw new Error("Dev request smoke should not launch Codex App when openCodexApp is false");
  }
  if (
    /sk-smoke-secret|smoke-secret-token|C:\\Users\\Ant\\Documents\\Codex\\AE_agent/.test(devRequestText + devEvidenceText + devStartPromptText + devCandidateText)
  ) {
    throw new Error("Dev request bundle leaked a secret or absolute project path");
  }
  if (
    devStartPromptText.indexOf("dev-requests/") < 0 ||
    devStartPromptText.indexOf("specs/target-app.md") < 0 ||
    devStartPromptText.indexOf("plans/target-app-execplan.md") < 0 ||
    devStartPromptText.indexOf("mcp-server/bridge-daemon.js") < 0 ||
    /rg --files|Get-ChildItem -Recurse/i.test(devStartPromptText)
  ) {
    throw new Error("Dev request start prompt is not targeted");
  }
  if (devRequestDir && devRequestDir.indexOf(path.join(__dirname, "..", "logs", "dev-requests")) === 0) {
    fs.rmSync(devRequestDir, { recursive: true, force: true });
  }

  const toolNames = lines[1].result.tools.map((tool) => tool.name);
  for (const expectedTool of ["get_ai_agent_log", "get_project_intent_memory", "update_project_intent_memory", "list_ai_agents", "check_ai_agent_readiness", "chat_with_ai_agent", "plan_with_ai_agent", "validate_ai_agent_plan", "run_ai_agent_plan", "run_agent_hardcore_session", "start_edit_session", "get_edit_session_status", "finish_edit_session", "list_edit_sessions", "checkpoint_project", "list_project_checkpoints", "get_project_checkpoint_details", "delete_project_checkpoint", "restore_project_checkpoint", "set_comp_work_area", "set_layer_time_range", "stagger_layers", "split_layers_at_time", "precompose_layers", "replace_layer_source", "deep_duplicate_precomp_sources", "rename_layers", "rename_project_items", "update_text_layer", "create_shape_layer", "fit_layer_to_comp", "set_property_keyframes", "apply_keyframe_ease", "set_expression", "clear_expression", "add_comp_to_render_queue", "set_render_queue_output", "get_render_queue_status"]) {
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
  if (!runPlanTool || !runPlanTool.inputSchema.properties.dryRun || !runPlanTool.inputSchema.properties.allowMutations || !runPlanTool.inputSchema.properties.autoEditSession || !runPlanTool.inputSchema.properties.rawExtendscriptDryRunId) {
    throw new Error("run_ai_agent_plan is missing run safety schema");
  }
  const hardcoreTool = lines[1].result.tools.find((tool) => tool.name === "run_agent_hardcore_session");
  if (!hardcoreTool || !hardcoreTool.inputSchema.properties.maxAttempts || !hardcoreTool.inputSchema.properties.autoPromoteKnowledge || !hardcoreTool.inputSchema.properties.autoEditSession || !hardcoreTool.inputSchema.properties.allowRawFallback || !hardcoreTool.inputSchema.properties.reasoning_effort) {
    throw new Error("run_agent_hardcore_session is missing autopilot schema");
  }
  const setWorkAreaTool = lines[1].result.tools.find((tool) => tool.name === "set_comp_work_area");
  if (!setWorkAreaTool.inputSchema.properties.idempotencyKey || !setWorkAreaTool.inputSchema.properties.verifyAfter) {
    throw new Error("set_comp_work_area is missing safety schema fields");
  }
  const deepDuplicateTool = lines[1].result.tools.find((tool) => tool.name === "deep_duplicate_precomp_sources");
  if (!deepDuplicateTool.inputSchema.properties.idempotencyKey || !deepDuplicateTool.inputSchema.properties.verifyAfter || !deepDuplicateTool.inputSchema.properties.unavailableFootagePolicy) {
    throw new Error("deep_duplicate_precomp_sources is missing safety schema fields");
  }
  const renderQueueStatusTool = lines[1].result.tools.find((tool) => tool.name === "get_render_queue_status");
  if (renderQueueStatusTool.inputSchema.properties.idempotencyKey) {
    throw new Error("get_render_queue_status should remain read-only");
  }

  console.log(JSON.stringify({
    ok: true,
    responses: lines.length,
    tools: toolNames,
    listCompsResult: lines[2].result.content[0].text,
    agents: agents.body.agents.map((agent) => agent.id),
    layerAttributeSet: layerAttributeSet.body.result.layers.length,
    alignLayers: alignLayers.body.result.changedCount,
    queuedTypedTools: queuedToolResponses.length,
    readiness: readiness.body.readiness.status,
    planRun: planRun.body.run.steps[0].status,
    targetSummary: targetSummaryValidation.body.result.steps[0].targetSummary,
    itemAlias: itemAliasValidation.body.result.steps[0].safeArgs.itemIndices,
    deepDuplicatePlan: {
      validation: deepDuplicateStep.status || (deepDuplicateStep.valid ? "valid" : "invalid"),
      dryRun: deepDuplicateDryRun.body.run.steps[0].status,
      rawExtendscriptStepCount: deepDuplicateDryRun.body.run.validation.classification.rawExtendscriptStepCount
    },
    hardcoreSession: {
      status: hardcoreSession.body.session.status,
      attempts: hardcoreSession.body.session.attempts.length,
      typedToolFailure: hardcoreSession.body.session.typedToolFailures[0].tool,
      candidate: hardcoreSession.body.session.artifacts.candidate.path
    },
    ignoredBindingRun: ignoredBindingRun.body.run.steps[0].status,
    unresolvedSelectedPrecompLayerBinding: unresolvedSelectedPrecompLayerRun.body.run.steps[1].reason,
    unresolvedSelectedSourceCompBinding: unresolvedSelectedSourceCompRun.body.run.steps[1].reason,
    unresolvedSelectedLayerBinding: unresolvedSelectedLayerRun.body.run.steps[1].reason,
    namedCompBindingRun: namedCompBindingRun.body.run.steps.map((step) => step.status),
    mutatingDryRun: mutatingDryRun.body.run.steps[0].status,
    mutatingBlocked: mutatingBlocked.body.run.safety.status,
    rawExtendscriptGate: {
      dryRun: rawExtendscriptDryRun.body.run.safety.rawExtendscriptGate.status,
      wrongGate: rawExtendscriptWrongGate.body.run.safety.status,
      afterDryRun: rawExtendscriptAfterDryRun.body.run.safety.status
    },
    devRequest: {
      requestFile: devRequestBundle.requestFile,
      startPromptFile: devRequestBundle.startPromptFile,
      startPromptReturned: devRequestBundle.startPrompt.indexOf("Continue development") >= 0,
      candidateFile: devRequestBundle.candidateFile
    },
    health: health.body,
    adapterLogs: adapterStderr.join("").trim().split(/\n+/).filter(Boolean),
    daemonLogs: daemonStderr.join("").trim().split(/\n+/).filter(Boolean)
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

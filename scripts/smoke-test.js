"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const bridgeDaemon = require("../mcp-server/bridge-daemon");
const {panelRoute, completeCommand, failCommand, isProjectInfo} = require("./fake-project-panel");
const {isolatedEnvironment, reserveLoopbackPort} = require("./network-test-fixture");

const daemonPath = path.join(__dirname, "..", "mcp-server", "bridge-daemon.js");
const adapterPath = path.join(__dirname, "..", "mcp-server", "mcp-adapter.js");
const nodePath = process.execPath;
let port = 0;
const token = "smoke-test-token";
const panelToken = `${token}-panel`;
const smokeProjectFile = "C:\\Synthetic\\Autonomy.aep";
const repoRoot = path.join(__dirname, "..");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

async function waitForPendingCommand(port, _legacyToken, timeoutMs) {
  const startedAt = Date.now();
  let next = null;
  while (Date.now() - startedAt < timeoutMs) {
    next = await requestJsonWithOptions({
      hostname: "127.0.0.1",
      port,
      path: panelRoute("legacy-smoke-panel", smokeProjectFile),
      method: "GET",
      headers: {
        "x-ae-bridge-token": panelToken
      }
    });
    if (next.body.command && next.body.command.id && next.body.command.script) return next;
    await wait(50);
  }
  return next;
}

async function prepareTypedTool(port, _legacyToken, toolName, payload, scriptSnippets, fakeResult) {
  const fixtureResult = fakeResult === undefined ? {ok: true, tool: toolName} : fakeResult;
  const prepared = await bridgeDaemon.prepareToolScript(toolName, payload || {}, fixtureResult);
  const command = {body: {command: {script: prepared.script}}};
  if (!prepared.script) throw new Error("Expected prepared AE script for " + toolName);
  for (const snippet of scriptSnippets || []) {
    if (command.body.command.script.indexOf(snippet) < 0) {
      throw new Error("Expected " + toolName + " script to include: " + snippet);
    }
  }
  if (!prepared.result || prepared.result.isError) {
    throw new Error("Unexpected prepared " + toolName + " result");
  }
  const resultText = prepared.result.content && prepared.result.content[0]
    ? prepared.result.content[0].text : "";
  let result = resultText;
  try { result = JSON.parse(resultText); } catch (_error) {}
  const response = {status: 200, body: {ok: true, result}};
  return { response, command };
}

async function callRejectedDevToolWithoutQueuedCommand(port, _legacyToken, toolName, payload, expectedMessage) {
  if (!expectedMessage) throw new Error("Expected an exact rejection message for " + toolName);
  let prepared = null;
  let text = "";
  try {
    prepared = await bridgeDaemon.prepareToolScript(toolName, payload || {});
    if (prepared.script) throw new Error(toolName + " prepared AE work before rejecting invalid input");
    if (!prepared.result || !prepared.result.isError) {
      throw new Error(toolName + " did not return an error result for invalid input");
    }
    text = prepared.result && prepared.result.content && prepared.result.content[0]
      ? prepared.result.content[0].text : "";
  } catch (error) {
    text = error.message || String(error);
  }
  const response = {status: 500, body: {ok: false, result: text}};
  if (text !== expectedMessage) {
    throw new Error("Unexpected rejected " + toolName + " response: " + JSON.stringify(text));
  }
  return response;
}

async function assertHardcoreAttemptBlockedWithoutMutationCommands(port, label, plan, expected) {
  let settled = false;
  let response = null;
  let requestError = null;
  const inspectionCommands = [];
  const mutationCommands = [];
  const pending = requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/agents/hardcore/run",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": panelToken
    }
  }, {
    prompt: `Reject ${label} Agent Hardcore attempt.`,
    maxAttempts: 1,
    projectOwner: true,
    allowMutations: true,
    autoEditSession: true,
    allowRawFallback: true,
    autoPromoteKnowledge: false,
    attemptPlans: [plan]
  }).then((value) => { response = value; }, (error) => { requestError = error; }).finally(() => { settled = true; });

  const deadline = Date.now() + 5000;
  while (!settled && Date.now() < deadline) {
    const next = await requestJsonWithOptions({
      hostname: "127.0.0.1",
      port,
      path: panelRoute("legacy-smoke-panel", smokeProjectFile),
      method: "GET",
      headers: {"x-ae-bridge-token": panelToken}
    });
    if (next.body.command) {
      if (isProjectInfo(next.body.command)) {
        inspectionCommands.push(next.body.command);
        await completeCommand(port, panelToken, next.body.command, {
          file: smokeProjectFile,
          numItems: 1,
          activeItemName: "Smoke Comp"
        });
      } else {
        mutationCommands.push(next.body.command);
        await failCommand(port, panelToken, next.body.command, `${label} negative fixture rejects mutation commands`);
      }
    } else {
      await wait(10);
    }
  }
  await pending;
  if (requestError) throw requestError;
  if (!settled || !response) throw new Error(`${label} Agent Hardcore rejection did not return`);
  const attempt = response.body && response.body.session && response.body.session.attempts
    ? response.body.session.attempts[0] : null;
  const run = attempt && (attempt.run || attempt.dryRun);
  const classification = attempt && attempt.planResult && attempt.planResult.planValidation
    ? attempt.planResult.planValidation.classification : null;
  if (
    response.status !== 200 || response.body.ok !== false || !attempt || !run ||
    attempt.status !== expected.attemptStatus || run.errorCode !== expected.errorCode ||
    !classification || classification.rawExtendscriptStepCount !== expected.rawExtendscriptStepCount
  ) {
    throw new Error(`Unexpected ${label} Agent Hardcore scope response: ` + JSON.stringify({
      status: response.status,
      ok: response.body && response.body.ok,
      attemptStatus: attempt && attempt.status,
      blocker: attempt && attempt.blocker,
      runErrorCode: run && run.errorCode,
      runError: run && run.error,
      rawExtendscriptStepCount: classification && classification.rawExtendscriptStepCount
    }));
  }
  if (mutationCommands.length) {
    throw new Error(`${label} Agent Hardcore scope check queued ${mutationCommands.length} mutation command(s): ` + JSON.stringify(
      mutationCommands.map((command) => String(command.script || "").slice(-180))
    ));
  }
  return {errorCode: run.errorCode, inspectionCommands: inspectionCommands.length};
}

async function main() {
  port = await reserveLoopbackPort();
  const smokeDir = smokeArtifactDir();
  const smokeStores = writeSmokeRegistryAndMemory(smokeDir);
  const daemonEnv = isolatedEnvironment(smokeDir, {
    port,
    automationToken: token,
    panelToken,
    devAdmin: false,
    commandTimeoutMs: 10000
  });
  Object.assign(daemonEnv, {
    AE_AGENT_HARDCORE_SESSION_DIR: smokeDir,
    AE_AGENT_DEV_REQUEST_DIR: path.join(smokeDir, "dev-requests"),
    AE_SOLUTION_CANDIDATE_DIR: path.join(smokeDir, "solution-candidates"),
    AE_SOLUTION_REGISTRY_PATH: smokeStores.registryPath,
    AE_PROJECT_INTENT_MEMORY_PATH: smokeStores.memoryPath
  });
  const daemon = spawn(nodePath, [daemonPath], {
    env: daemonEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const daemonStderr = [];
  daemon.stderr.setEncoding("utf8");
  daemon.stderr.on("data", (chunk) => daemonStderr.push(chunk));

  let daemonReady = false;
  const daemonReadyDeadline = Date.now() + 5000;
  while (!daemonReady && Date.now() < daemonReadyDeadline) {
    if (daemon.exitCode !== null) {
      throw new Error("Bridge daemon exited during smoke startup: " + daemonStderr.join("").trim());
    }
    try {
      const startupHealth = await requestJson(`http://127.0.0.1:${port}/health`);
      daemonReady = startupHealth.body && startupHealth.body.ok === true;
    } catch (_error) {
      await wait(50);
    }
  }
  if (!daemonReady) throw new Error("Bridge daemon did not become ready: " + daemonStderr.join("").trim());

  const adapter = spawn(nodePath, [adapterPath], {
    env: daemonEnv,
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

  await completeCommand(port, panelToken, next.body.command,
    [{ itemIndex: 1, name: "Smoke Comp", width: 1920, height: 1080 }]);

  await waitForResponse(stdout, 3, 2000);

  const layerAttributeSet = (await prepareTypedTool(port, token, "set_property_value", {
    layerIndex: [1, 2],
    propertyPath: "threeDLayer",
    value: true,
    verifyAfter: false
  }, ["var layerIndices = [1,2]", "layerAttributeSetters"], {
        comp: { itemIndex: 1, name: "Smoke Comp" },
        layer: null,
        layers: [
          { index: 1, name: "Smoke Layer 1", threeDLayer: true, collapseTransformation: false, motionBlur: false },
          { index: 2, name: "Smoke Layer 2", threeDLayer: true, collapseTransformation: false, motionBlur: false }
        ],
        property: null,
        properties: [
          { name: "threeDLayer", propertyPath: [{ name: "threeDLayer", matchName: "threeDLayer" }], value: true },
          { name: "threeDLayer", propertyPath: [{ name: "threeDLayer", matchName: "threeDLayer" }], value: true }
        ]
      })).response;

  const alignLayers = (await prepareTypedTool(port, token, "align_layers_to_time", {
    layerIndices: [1, 2],
    targetTime: 3,
    align: "inPoint",
    verifyAfter: false
  }, ["Codex Align Layers To Time", "targetTime - layer.inPoint"], {
        comp: { itemIndex: 1, name: "Smoke Comp", time: 3 },
        targetTime: 3,
        align: "inPoint",
        changedCount: 2,
        layers: [
          { index: 1, name: "Smoke Layer 1", inPoint: 3 },
          { index: 2, name: "Smoke Layer 2", inPoint: 3 }
        ]
      })).response;

  const preparedToolResponses = [];
  preparedToolResponses.push(await prepareTypedTool(port, token, "set_comp_properties", {
    compName: "Smoke Comp",
    width: 1280,
    height: 720,
    pixelAspect: 1,
    duration: 6,
    frameRate: 30,
    bgColor: [0.1, 0.2, 0.3],
    displayStartTime: 1,
    verifyAfter: false
  }, ["Codex Set Comp Properties", "__codexCompProperties", "comp.width", "__codexColorNear", "postVerification"], {
    comp: {
      itemIndex: 1,
      name: "Smoke Comp",
      width: 1280,
      height: 720,
      pixelAspect: 1,
      duration: 6,
      frameRate: 30,
      bgColor: [26 / 255, 51 / 255, 77 / 255],
      displayStartTime: 1,
      numLayers: 2
    },
    updatedFields: ["width", "height", "pixelAspect", "duration", "frameRate", "displayStartTime", "bgColor"],
    postVerification: {
      ok: true,
      layerCountUnchanged: true,
      fieldMatches: {
        width: true,
        height: true,
        pixelAspect: true,
        duration: true,
        frameRate: true,
        bgColor: true,
        displayStartTime: true
      }
    }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "set_comp_work_area", {
    duration: 2,
    verifyAfter: false
  }, ["Codex Set Comp Work Area", "comp.workAreaStart"], {
    comp: { itemIndex: 1, name: "Smoke Comp" },
    workAreaStart: 0,
    workAreaDuration: 2
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "get_comp_details", {
    compItemIndex: 1,
    includeLayers: false
  }, ["workAreaStart: comp.workAreaStart", "workAreaDuration: comp.workAreaDuration"], {
    itemIndex: 1,
    name: "Smoke Comp",
    type: "comp",
    workAreaStart: 0,
    workAreaDuration: 2,
    layersReturned: 0
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "set_layer_time_range", {
    layerIndices: [1, 2],
    inPoint: 0.5,
    duration: 1.5,
    verifyAfter: false
  }, ["Codex Set Layer Time Range", "__codexResolveLayers"], {
    changedCount: 2,
    layers: [{ index: 1, name: "Layer 1" }, { index: 2, name: "Layer 2" }]
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "stagger_layers", {
    layerIndices: [1, 2],
    startTime: 0,
    gap: 0.25,
    verifyAfter: false
  }, ["Codex Stagger Layers", "gap - overlap"], {
    changedCount: 2,
    layers: [{ index: 1, name: "Layer 1" }, { index: 2, name: "Layer 2" }]
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "split_layers_at_time", {
    layerIndices: [1],
    time: 1,
    verifyAfter: false
  }, ["Codex Split Layers At Time", "splitLayer"], {
    changedCount: 1,
    split: [{ original: { index: 2, name: "Layer 1" }, newLayer: { index: 1, name: "Layer 1" } }]
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "precompose_layers", {
    layerIndices: [1, 2],
    newCompName: "Smoke Precomp",
    openInViewer: false,
    verifyAfter: false
  }, ["Codex Precompose Layers", "precompose"], {
    comp: { itemIndex: 3, name: "Smoke Precomp" },
    layerIndices: [1, 2]
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "replace_layer_source", {
    layerIndices: [1],
    sourceItemIndex: 2,
    verifyAfter: false
  }, ["Codex Replace Layer Source", "replaceSource"], {
    sourceItem: { itemIndex: 2, name: "Smoke Source", type: "footage" },
    changedCount: 1,
    layers: [{ index: 1, name: "Layer 1" }]
  }));
  const deepDuplicatePreparedResponse = await prepareTypedTool(port, token, "deep_duplicate_precomp_sources", {
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
  preparedToolResponses.push(deepDuplicatePreparedResponse);
  preparedToolResponses.push(await prepareTypedTool(port, token, "rename_layers", {
    layerIndices: [1, 2],
    mode: "prefix",
    prefix: "Smoke ",
    verifyAfter: false
  }, ["Codex Rename Layers", "__codexRenameValue"], {
    changedCount: 2,
    renamed: [{ index: 1, before: "A", after: "Smoke A" }]
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "rename_project_items", {
    itemIndices: [1],
    mode: "suffix",
    suffix: " Smoke",
    verifyAfter: false
  }, ["Codex Rename Project Items", "__codexRenameValue"], {
    changedCount: 1,
    renamed: [{ itemIndex: 1, before: "Comp", after: "Comp Smoke" }]
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "update_text_layer", {
    layerIndex: 1,
    text: "Smoke",
    fontSize: 42,
    verifyAfter: false
  }, ["Codex Update Text Layer", "__codexApplyTextDocumentPatch"], {
    layer: { index: 1, name: "Text" },
    text: { kind: "TextDocument", text: "Smoke" }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "create_shape_layer", {
    shape: "rectangle",
    name: "Smoke Shape",
    size: [320, 180],
    verifyAfter: false
  }, ["Codex Create Shape Layer", "ADBE Vector Shape - Rect"], {
    layer: { index: 1, name: "Smoke Shape" },
    shape: { type: "rectangle", size: [320, 180] }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "create_camera_layer", {
    name: "Smoke Camera",
    pointOfInterest: [320, 180, 0],
    position: [320, 180, -900],
    zoom: 600,
    verifyAfter: false
  }, ["Codex Create Camera Layer", "ADBE Camera Zoom"], {
    layer: { index: 1, name: "Smoke Camera" },
    camera: { pointOfInterest: [320, 180, 0], position: [320, 180, -900], zoom: 600 }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "create_layer_mask", {
    layerIndex: 1,
    name: "Smoke Mask",
    vertices: [[120, 80], [520, 80], [520, 280], [120, 280]],
    maskMode: "add",
    verifyAfter: false
  }, ["Codex Create Layer Mask", "ADBE Mask Shape"], {
    layer: { index: 1, name: "Layer 1" },
    mask: {
      name: "Smoke Mask",
      maskMode: "add",
      inverted: false,
      shape: { vertexCount: 4, vertices: [[120, 80], [520, 80], [520, 280], [120, 280]] }
    }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "set_layer_mask", {
    compName: "Smoke Comp",
    layerIndex: 1,
    operation: "update",
    maskIndex: 1,
    expectedMaskName: "Smoke Mask",
    vertices: [[140, 90], [500, 90], [500, 260], [140, 260]],
    maskMode: "subtract",
    inverted: true,
    opacity: 75,
    feather: [4, 4],
    expansion: 2,
    verifyAfter: false
  }, ["Codex Set Layer Mask", "__codexMaskInfo", "requestedMaskIndex", "MaskMode.SUBTRACT"], {
    comp: { itemIndex: 1, name: "Smoke Comp" },
    layer: { index: 1, name: "Layer 1" },
    operation: "update",
    beforeMask: {
      propertyIndex: 1,
      name: "Smoke Mask",
      maskMode: "add",
      inverted: false,
      shape: { vertexCount: 4 }
    },
    mask: {
      propertyIndex: 1,
      name: "Smoke Mask",
      maskMode: "subtract",
      inverted: true,
      shape: { vertexCount: 4, vertices: [[140, 90], [500, 90], [500, 260], [140, 260]] },
      opacity: 75,
      feather: [4, 4],
      expansion: 2
    },
    postVerification: {
      ok: true,
      operation: "update",
      beforeMaskCount: 1,
      afterMaskCount: 1,
      expectedMaskCountAfter: 1,
      maskCountMatches: true,
      verticesMatch: true,
      maskModeMatches: true,
      invertedMatches: true,
      opacityMatches: true,
      featherMatches: true,
      expansionMatches: true
    }
  }));
  const smokePathGeometry = {
    closed: true,
    vertices: [[100, 80], [500, 80], [500, 260], [100, 260]],
    inTangents: [[0, 0], [-20, 0], [0, -20], [20, 0]],
    outTangents: [[20, 0], [0, 20], [-20, 0], [0, -20]]
  };
  const smokePathPropertyPath = [
    "ADBE Root Vectors Group",
    "ADBE Vector Group",
    "ADBE Vectors Group",
    "ADBE Vector Shape"
  ];
  preparedToolResponses.push(await prepareTypedTool(port, token, "get_path_geometry", {
    compName: "Smoke Comp",
    layerIndex: 1,
    targetKind: "shape",
    propertyPath: smokePathPropertyPath,
    includeKeyframes: true
  }, ["__codexPathGeometryInfo", "ADBE Vector Shape"], {
    comp: { itemIndex: 1, name: "Smoke Comp" },
    layer: { index: 1, name: "Smoke Shape" },
    targetKind: "shape",
    property: {
      name: "Path",
      matchName: "ADBE Vector Shape",
      propertyPath: smokePathPropertyPath.map((segment) => ({ name: segment, matchName: segment })),
      geometry: { kind: "Shape", vertexCount: 4, ...smokePathGeometry },
      numKeys: 0,
      keyframes: []
    }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "set_path_geometry", {
    compName: "Smoke Comp",
    layerIndex: 1,
    targetKind: "shape",
    propertyPath: smokePathPropertyPath,
    geometry: smokePathGeometry,
    verifyAfter: false
  }, ["Codex Set Path Geometry", "__codexBuildShapeFromGeometry", "ADBE Vector Shape"], {
    comp: { itemIndex: 1, name: "Smoke Comp" },
    layer: { index: 1, name: "Smoke Shape" },
    targetKind: "shape",
    property: {
      name: "Path",
      matchName: "ADBE Vector Shape",
      propertyPath: smokePathPropertyPath.map((segment) => ({ name: segment, matchName: segment })),
      geometry: { kind: "Shape", vertexCount: 4, ...smokePathGeometry },
      numKeys: 0,
      keyframes: []
    },
    postVerification: {
      ok: true,
      targetKind: "shape",
      propertyMatchName: "ADBE Vector Shape",
      geometryMatches: true,
      keyframesMatch: true,
      requestedKeyframeCount: 0,
      afterKeyframeCount: 0,
      clearExisting: false
    }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "duplicate_layer", {
    compName: "Smoke Comp",
    layerIndex: 1,
    sourceName: "Smoke Source",
    name: "Smoke Source Copy",
    verifyAfter: false
  }, ["Codex Duplicate Layer", "sourceLayer.duplicate()"], {
    comp: { itemIndex: 1, name: "Smoke Comp", numLayers: 2 },
    source: { index: 1, name: "Smoke Source" },
    sourceAfter: { index: 2, name: "Smoke Source" },
    duplicate: { index: 1, name: "Smoke Source Copy" },
    layer: { index: 1, name: "Smoke Source Copy" }
  }));
  const duplicateLayersPreparedResponse = await prepareTypedTool(port, token, "duplicate_layers", {
    compName: "Smoke Comp",
    layerIndices: [1, 2],
    sourceNames: ["Smoke Source A", "Smoke Source B"],
    nameSuffix: " Copy",
    verifyAfter: false
  }, ["Codex Duplicate Layers", "__codexDuplicateLayersUndoOpen", "sourceRefs", "sourceLayerForCopy.duplicate()", "requestedIndex > comp.numLayers", "sourceLayer.locked"], {
    comp: { itemIndex: 1, name: "Smoke Comp", numLayersBefore: 2, numLayersAfter: 4 },
    requestedLayerIndices: [1, 2],
    layerCountBefore: 2,
    layerCountAfter: 4,
    duplicateCount: 2,
    pairs: [
      {
        requestedLayerIndex: 1,
        source: { index: 1, name: "Smoke Source A" },
        sourceAfter: { index: 2, name: "Smoke Source A" },
        duplicate: { index: 1, name: "Smoke Source A Copy" }
      },
      {
        requestedLayerIndex: 2,
        source: { index: 2, name: "Smoke Source B" },
        sourceAfter: { index: 4, name: "Smoke Source B" },
        duplicate: { index: 3, name: "Smoke Source B Copy" }
      }
    ],
    layers: [{ index: 1, name: "Smoke Source A Copy" }, { index: 3, name: "Smoke Source B Copy" }],
    postVerification: {
      ok: true,
      beforeLayerCount: 2,
      afterLayerCount: 4,
      expectedLayerCountAfter: 4,
      requestedCount: 2,
      duplicateCount: 2,
      layerCountDelta: 2,
      layerCountMatches: true,
      pairCountMatches: true,
      sourceNameMatches: true,
      duplicateNameMatches: true,
      pairNameMatches: true
    }
  });
  preparedToolResponses.push(duplicateLayersPreparedResponse);
  preparedToolResponses.push(await prepareTypedTool(port, token, "delete_layer", {
    compName: "Smoke Comp",
    layerIndex: 3,
    expectedLayerName: "Smoke Delete Target",
    verifyAfter: false
  }, ["Codex Delete Layer", "layer.remove()", "expectedLayerName", "Layer is locked"], {
    comp: { itemIndex: 1, name: "Smoke Comp", numLayersBefore: 4, numLayersAfter: 3 },
    layerCountBefore: 4,
    layerCountAfter: 3,
    requestedLayerIndex: 3,
    expectedLayerName: "Smoke Delete Target",
    deletedLayer: { index: 3, id: 101, name: "Smoke Delete Target", locked: false },
    layerAtDeletedIndexAfter: { index: 3, name: "Layer After Deleted Target" },
    postVerification: {
      ok: true,
      beforeLayerCount: 4,
      afterLayerCount: 3,
      expectedLayerCountAfter: 3,
      layerCountDelta: -1,
      layerCountMatches: true,
      deletedLayerId: 101,
      deletedLayerIdAbsent: true,
      expectedLayerName: "Smoke Delete Target",
      sameNameCountBefore: 1,
      sameNameCountAfter: 0,
      sameNameCountDecremented: true,
      deletedLayerNameAbsentAtOriginalIndex: true
    }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "add_comp_marker", {
    compName: "Smoke Comp",
    time: 1.1,
    comment: "Smoke Comp Marker",
    duration: 0,
    expectedMarkerCountBefore: 0,
    verifyAfter: false
  }, ["Codex Add Composition Marker", "comp.markerProperty", "MarkerValue", "__codexCompMarkers"], {
    comp: { itemIndex: 1, name: "Smoke Comp", duration: 4, frameRate: 24, workAreaStart: 0, workAreaDuration: 4 },
    marker: { keyIndex: 1, time: 1.1, comment: "Smoke Comp Marker", duration: 0 },
    markersBefore: {
      count: 0,
      returned: 0,
      truncated: false,
      orderedBy: "comp.markerProperty.keyTime",
      items: []
    },
    markers: {
      count: 1,
      returned: 1,
      truncated: false,
      orderedBy: "comp.markerProperty.keyTime",
      items: [{ keyIndex: 1, time: 1.1, comment: "Smoke Comp Marker", duration: 0 }]
    },
    postVerification: {
      ok: true,
      markerCountBefore: 0,
      markerCountAfter: 1,
      expectedMarkerCountAfter: 1,
      markerCountIncremented: true,
      timeMatches: true,
      commentMatches: true,
      durationMatches: true
    }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "add_layer_marker", {
    compName: "Smoke Comp",
    layerIndex: 1,
    time: 1.25,
    comment: "Smoke Marker",
    duration: 0.5,
    verifyAfter: false
  }, ["Codex Add Layer Marker", "MarkerValue", "__codexMarkerInfo"], {
    comp: { itemIndex: 1, name: "Smoke Comp" },
    layer: { index: 1, name: "Smoke Layer", markerCount: 1 },
    marker: { keyIndex: 1, time: 1.25, comment: "Smoke Marker", duration: 0.5 },
    markers: {
      count: 1,
      returned: 1,
      truncated: false,
      items: [{ keyIndex: 1, time: 1.25, comment: "Smoke Marker", duration: 0.5 }]
    }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "add_layer_marker", {
    compName: "Smoke Comp",
    layerIndex: 1,
    time: 1.75,
    comment: "",
    duration: 0,
    verifyAfter: false
  }, ["Codex Add Layer Marker", "var markerComment = \"\";", "new MarkerValue(markerComment)", "__codexMarkerInfo"], {
    comp: { itemIndex: 1, name: "Smoke Comp" },
    layer: { index: 1, name: "Smoke Layer", markerCount: 2 },
    marker: { keyIndex: 2, time: 1.75, comment: "", duration: 0 },
    markers: {
      count: 2,
      returned: 2,
      truncated: false,
      items: [
        { keyIndex: 1, time: 1.25, comment: "Smoke Marker", duration: 0.5 },
        { keyIndex: 2, time: 1.75, comment: "", duration: 0 }
      ]
    }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "update_layer_marker", {
    compName: "Smoke Comp",
    layerIndex: 1,
    markerIndex: 1,
    targetComment: "Smoke Marker",
    comment: "Smoke Marker Updated",
    time: 1.5,
    duration: 0.75,
    verifyAfter: false
  }, ["Codex Update Layer Marker", "__codexFindMarkerKey", "setValueAtTime"], {
    comp: { itemIndex: 1, name: "Smoke Comp" },
    layer: { index: 1, name: "Smoke Layer", markerCount: 1 },
    markerBefore: { keyIndex: 1, time: 1.25, comment: "Smoke Marker", duration: 0.5 },
    marker: { keyIndex: 1, time: 1.5, comment: "Smoke Marker Updated", duration: 0.75 },
    markers: {
      count: 1,
      returned: 1,
      truncated: false,
      items: [{ keyIndex: 1, time: 1.5, comment: "Smoke Marker Updated", duration: 0.75 }]
    }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "delete_layer_marker", {
    compName: "Smoke Comp",
    layerIndex: 1,
    markerIndex: 1,
    targetComment: "Smoke Marker Updated",
    verifyAfter: false
  }, ["Codex Delete Layer Marker", "__codexFindMarkerKey", "removeKey"], {
    comp: { itemIndex: 1, name: "Smoke Comp" },
    layer: { index: 1, name: "Smoke Layer", markerCount: 0 },
    markerDeleted: { keyIndex: 1, time: 1.5, comment: "Smoke Marker Updated", duration: 0.75 },
    markers: {
      count: 0,
      returned: 0,
      truncated: false,
      items: []
    }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "fit_layer_to_comp", {
    layerIndices: [1],
    mode: "contain",
    verifyAfter: false
  }, ["Codex Fit Layer To Comp", "__codexLayerSourceSize"], {
    changedCount: 1,
    layers: [{ index: 1, name: "Layer 1" }]
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "set_property_keyframes", {
    layerIndex: 1,
    propertyPath: "ADBE Transform Group.ADBE Opacity",
    keyframes: [{ time: 0, value: 0 }, { time: 1, value: 100 }],
    verifyAfter: false
  }, ["Codex Set Property Keyframes", "setValueAtTime"], {
    layer: { index: 1, name: "Layer 1" },
    keyframeCount: 2
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "apply_keyframe_ease", {
    layerIndex: 1,
    propertyPath: "ADBE Transform Group.ADBE Opacity",
    keyIndices: [1, 2],
    interpolation: "bezier",
    verifyAfter: false
  }, ["Codex Apply Keyframe Ease", "__codexTemporalEaseDimensions", "setTemporalEaseAtKey"], {
    layer: { index: 1, name: "Layer 1" },
    keyIndices: [1, 2]
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "set_expression", {
    layerIndex: 1,
    propertyPath: "ADBE Transform Group.ADBE Opacity",
    expression: "value",
    verifyAfter: false
  }, ["Codex Set Expression", "canSetExpression"], {
    layer: { index: 1, name: "Layer 1" },
    expression: "value"
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "clear_expression", {
    layerIndex: 1,
    propertyPath: "ADBE Transform Group.ADBE Opacity",
    verifyAfter: false
  }, ["Codex Clear Expression", "expressionValue"], {
    layer: { index: 1, name: "Layer 1" },
    expression: ""
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "add_comp_to_render_queue", {
    compItemIndex: 1,
    outputPath: "smoke-output.mov",
    verifyAfter: false
  }, ["Codex Add Comp To Render Queue", "renderQueue.items.add"], {
    comp: { itemIndex: 1, name: "Smoke Comp" },
    renderQueueItem: { index: 1, comp: { itemIndex: 1, name: "Smoke Comp" } }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "set_render_queue_output", {
    renderQueueItemIndex: 1,
    outputPath: "smoke-output.mov",
    verifyAfter: false
  }, ["Codex Set Render Queue Output", "outputModule.file"], {
    renderQueueItem: { index: 1, outputModules: [{ index: 1, file: "smoke-output.mov" }] }
  }));
  preparedToolResponses.push(await prepareTypedTool(port, token, "get_render_queue_status", {
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
      "x-ae-bridge-token": panelToken
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
      "x-ae-bridge-token": panelToken
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
  const classificationWarningDryRun = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/agents/plan/run",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": panelToken
    }
  }, {
    dryRun: true,
    requestId: "smoke-classification-warning-dry-run",
    plan: {
      summary: "Smoke-test validation-ok classification warnings do not block dry-run.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Read bridge status",
          tool: "get_bridge_status",
          args: {}
        },
        {
          title: "Planner note that should be skipped",
          tool: null,
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
      "x-ae-bridge-token": panelToken
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
  const hardcoreAutonomy = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/autonomy/session",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": panelToken
    }
  }, {
    enabled: true,
    panelConnectionId: "legacy-smoke-panel",
    panelGeneration: "1"
  });
  if (hardcoreAutonomy.status !== 200 || !hardcoreAutonomy.body.session || hardcoreAutonomy.body.session.active !== true) {
    throw new Error("Expected explicit autonomous session for Agent Hardcore smoke");
  }
  const hardcoreSession = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/agents/hardcore/run",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": panelToken
    }
  }, {
    prompt: "Smoke-test Agent Hardcore retry loop and knowledge capture.",
    maxAttempts: 3,
    projectOwner: true,
    reasoning_effort: "xhigh",
    allowMutations: true,
    autoEditSession: true,
    allowRawFallback: true,
    autoPromoteKnowledge: true,
    attemptPlans: [
      {
        summary: "Reject pseudo steps that are not real MCP tool work.",
        risk: "low",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Read bridge status before pseudo action",
            tool: "get_bridge_status",
            args: {}
          },
          {
            title: "Pseudo action without MCP tool",
            tool: null,
            args: {}
          }
        ]
      },
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
  const hardcoreDestructiveBlocked = await assertHardcoreAttemptBlockedWithoutMutationCommands(port, "destructive", {
    summary: "Reject destructive execution in autonomous Agent Hardcore.",
    risk: "high",
    requiresCheckpoint: true,
    steps: [{
      title: "Attempt destructive layer deletion",
      tool: "delete_layer",
      args: {
        compName: "Smoke Comp",
        layerIndex: 1,
        expectedLayerName: "Smoke Layer",
        confirm: true
      }
    }]
  }, {
    attemptStatus: "run-needs-review",
    errorCode: "autonomous_session_scope_blocked",
    rawExtendscriptStepCount: 0
  });
  const hardcoreRawBlocked = await assertHardcoreAttemptBlockedWithoutMutationCommands(port, "raw", {
    summary: "Reject raw ExtendScript in autonomous Agent Hardcore.",
    risk: "high",
    requiresCheckpoint: false,
    steps: [{
      title: "Attempt raw ExtendScript",
      tool: "run_extendscript",
      args: {script: "return {ok:true};"}
    }]
  }, {
    attemptStatus: "dry-run-needs-review",
    errorCode: "plan_step_blocked",
    rawExtendscriptStepCount: 1
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
      "x-ae-bridge-token": panelToken
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
      "x-ae-bridge-token": panelToken
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
      "x-ae-bridge-token": panelToken
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
      "x-ae-bridge-token": panelToken
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
      "x-ae-bridge-token": panelToken
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
  await completeCommand(port, panelToken, activeCompBindingCommand.body.command, {
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
      });
  const activeCompListCommand = await waitForPendingCommand(port, token, 5000);
  if (!activeCompListCommand.body.command || activeCompListCommand.body.command.script.indexOf("app.project.item(1)") < 0) {
    throw new Error("Expected named {{compItemIndex}} binding to resolve to active comp item 1.");
  }
  await completeCommand(port, panelToken, activeCompListCommand.body.command, {
        comp: { itemIndex: 1, name: "Smoke Active Comp", numLayers: 1 },
        layers: [{ index: 1, name: "Smoke Precomp Layer" }]
      });
  const selectedPrecompLayerBindingCommand = await waitForPendingCommand(port, token, 5000);
  if (!selectedPrecompLayerBindingCommand.body.command || selectedPrecompLayerBindingCommand.body.command.script.indexOf("comp.layer(1)") < 0) {
    throw new Error("Expected {{selectedPrecompLayerIndex}} binding to resolve to selected layer index 1.");
  }
  await completeCommand(port, panelToken, selectedPrecompLayerBindingCommand.body.command, {
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
      });
  const itemIndexesBindingCommand = await waitForPendingCommand(port, token, 5000);
  if (!itemIndexesBindingCommand.body.command || itemIndexesBindingCommand.body.command.script.indexOf("__codexResolveComp(7") < 0) {
    throw new Error("Expected {{itemIndexes}} binding to resolve to selected source comp item 7.");
  }
  await completeCommand(port, panelToken, itemIndexesBindingCommand.body.command, {
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
      });
  const wrappedStepBindingCommand = await waitForPendingCommand(port, token, 5000);
  if (!wrappedStepBindingCommand.body.command || wrappedStepBindingCommand.body.command.script.indexOf("__codexResolveComp(1") < 0) {
    throw new Error("Expected wrapped {{steps.1.result}} binding to resolve to active comp item 1.");
  }
  await completeCommand(port, panelToken, wrappedStepBindingCommand.body.command, {
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
      });
  const selectedPrecompBindingCommand = await waitForPendingCommand(port, token, 5000);
  if (!selectedPrecompBindingCommand.body.command || selectedPrecompBindingCommand.body.command.script.indexOf("app.project.item(7)") < 0) {
    throw new Error("Expected {{selectedPrecompItemIndex}} binding to resolve to selected source comp item 7.");
  }
  await completeCommand(port, panelToken, selectedPrecompBindingCommand.body.command, {
        comp: { itemIndex: 7, name: "Smoke Source Precomp", numLayers: 0 },
        layers: []
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
      "x-ae-bridge-token": panelToken
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
      "x-ae-bridge-token": panelToken
    }
  }, {
    dryRun: false,
    confirm: true,
    allowMutations: true,
    requestId: "smoke-mutating-blocked-run",
    plan: mutatingPlan
  });
  const directUnsafeDeleteLayer = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/tools/call",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    name: "delete_layer",
    arguments: {
      compName: "Smoke Comp",
      layerIndex: 1,
      expectedLayerName: "Smoke Layer",
      confirm: true
    }
  });
  const directUnsafeDeletePayload = JSON.parse(directUnsafeDeleteLayer.body.result.content[0].text);
  const invalidSetCompProperties = await callRejectedDevToolWithoutQueuedCommand(port, token, "set_comp_properties", {
    compName: "Smoke Comp",
    opacity: 50,
    verifyAfter: false
  }, "Unsupported set_comp_properties fields: opacity");
  const emptySetCompProperties = await callRejectedDevToolWithoutQueuedCommand(port, token, "set_comp_properties", {
    compName: "Smoke Comp",
    verifyAfter: false
  }, "At least one approved comp property update is required.");
  const invalidSetLayerMask = await callRejectedDevToolWithoutQueuedCommand(port, token, "set_layer_mask", {
    layerIndex: 1,
    operation: "delete",
    maskIndex: 1,
    verifyAfter: false
  }, "compItemIndex or compName is required for set_layer_mask.");
  const missingCompSetLayerMask = await callRejectedDevToolWithoutQueuedCommand(port, token, "set_layer_mask", {
    layerIndex: 1,
    operation: "update",
    maskIndex: 1,
    opacity: 50,
    verifyAfter: false
  }, "compItemIndex or compName is required for set_layer_mask.");
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
      "x-ae-bridge-token": panelToken
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
      "x-ae-bridge-token": panelToken
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
      "x-ae-bridge-token": panelToken
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
  const fakePrivateProjectPath = path.join(repoRoot, "private.aep");
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
      error: `Provider token Bearer smoke-secret-token and path ${fakePrivateProjectPath} must be redacted.`
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
  const duplicateLayersEmptyRejection = await callRejectedDevToolWithoutQueuedCommand(port, token, "duplicate_layers", {
    layerIndices: [],
    verifyAfter: false
  }, "layerIndices must be a non-empty array of positive 1-based integers.");
  const duplicateLayersDuplicateRejection = await callRejectedDevToolWithoutQueuedCommand(port, token, "duplicate_layers", {
    layerIndices: [1, 1],
    verifyAfter: false
  }, "layerIndices must not contain duplicate layer indexes.");
  const duplicateLayersNonPositiveRejection = await callRejectedDevToolWithoutQueuedCommand(port, token, "duplicate_layers", {
    layerIndices: [1, 0],
    verifyAfter: false
  }, "layerIndices must contain only positive 1-based integers.");
  adapter.kill();
  daemon.kill();

  const lines = stdout.join("").trim().split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));

  if (lines.length < 3) {
    throw new Error("Expected initialize, tools/list, and tool call responses");
  }

  if (!health.body.ok || health.body.server !== "codex-ae-mcp-bridge" || health.body.version !== "3.2.0") {
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
  if (preparedToolResponses.length !== 34 || preparedToolResponses.some((item) => item.response.status !== 200 || !item.response.body.ok)) {
    throw new Error("Expected all new typed tool queue smokes to pass");
  }
  const deepDuplicatePreparedPayload = deepDuplicatePreparedResponse.response.body.result || {};
  if (
    deepDuplicatePreparedPayload.rootCompItemIndex !== 4 ||
    deepDuplicatePreparedPayload.duplicatedRootCompItemIndex !== 4 ||
    !Array.isArray(deepDuplicatePreparedPayload.createdItemIndices) ||
    deepDuplicatePreparedPayload.createdItemIndices.join(",") !== "4,6" ||
    !Array.isArray(deepDuplicatePreparedPayload.duplicatedProjectItemIndices) ||
    deepDuplicatePreparedPayload.duplicatedProjectItemIndices.join(",") !== "4,6"
  ) {
    throw new Error("Deep duplicate result aliases did not expose read-back binding fields");
  }
  const duplicateLayersPreparedPayload = duplicateLayersPreparedResponse.response.body.result || {};
  if (
    duplicateLayersPreparedPayload.layerCountBefore !== 2 ||
    duplicateLayersPreparedPayload.layerCountAfter !== 4 ||
    duplicateLayersPreparedPayload.duplicateCount !== 2 ||
    duplicateLayersPreparedPayload.layerCountAfter - duplicateLayersPreparedPayload.layerCountBefore !== 2 ||
    !Array.isArray(duplicateLayersPreparedPayload.pairs) ||
    duplicateLayersPreparedPayload.pairs.length !== 2 ||
    !duplicateLayersPreparedPayload.pairs[0].source ||
    !duplicateLayersPreparedPayload.pairs[0].duplicate ||
    duplicateLayersPreparedPayload.pairs[0].source.name !== "Smoke Source A" ||
    duplicateLayersPreparedPayload.pairs[0].duplicate.name !== "Smoke Source A Copy" ||
    duplicateLayersPreparedPayload.pairs[1].source.name !== "Smoke Source B" ||
    duplicateLayersPreparedPayload.pairs[1].duplicate.name !== "Smoke Source B Copy" ||
    !duplicateLayersPreparedPayload.postVerification ||
    duplicateLayersPreparedPayload.postVerification.ok !== true ||
    duplicateLayersPreparedPayload.postVerification.beforeLayerCount !== 2 ||
    duplicateLayersPreparedPayload.postVerification.afterLayerCount !== 4 ||
    duplicateLayersPreparedPayload.postVerification.requestedCount !== 2 ||
    duplicateLayersPreparedPayload.postVerification.duplicateCount !== 2 ||
    duplicateLayersPreparedPayload.postVerification.layerCountDelta !== 2 ||
    duplicateLayersPreparedPayload.postVerification.layerCountMatches !== true ||
    duplicateLayersPreparedPayload.postVerification.pairCountMatches !== true ||
    duplicateLayersPreparedPayload.postVerification.sourceNameMatches !== true ||
    duplicateLayersPreparedPayload.postVerification.duplicateNameMatches !== true ||
    duplicateLayersPreparedPayload.postVerification.pairNameMatches !== true
  ) {
    throw new Error("duplicate_layers result did not expose deterministic one-duplicate-per-source read-back and post-verification fields");
  }
  if (
    duplicateLayersEmptyRejection.status !== 500 ||
    duplicateLayersDuplicateRejection.status !== 500 ||
    duplicateLayersNonPositiveRejection.status !== 500
  ) {
    throw new Error("Expected duplicate_layers to reject empty, duplicate, and non-positive layerIndices before queueing AE work");
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
    classificationWarningDryRun.status !== 200 ||
    classificationWarningDryRun.body.ok !== true ||
    !classificationWarningDryRun.body.run ||
    classificationWarningDryRun.body.run.validation.classification.category !== "needs clarification" ||
    classificationWarningDryRun.body.run.validation.classification.blocksRun !== false ||
    classificationWarningDryRun.body.run.validation.classification.allowsDryRun !== true ||
    classificationWarningDryRun.body.run.steps.length !== 2 ||
    classificationWarningDryRun.body.run.steps[0].status !== "ready" ||
    classificationWarningDryRun.body.run.steps[1].status !== "skipped"
  ) {
    throw new Error("Validation-ok classification warning blocked dry-run or failed to skip non-tool step");
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
    hardcoreSession.body.session.attempts.length !== 3 ||
    hardcoreSession.body.session.attempts[0].status !== "run-needs-tool-plan" ||
    String(hardcoreSession.body.session.attempts[0].blocker || "").indexOf("real MCP tool calls") < 0 ||
    hardcoreSession.body.session.attempts[1].status !== "run-needs-review" ||
    hardcoreSession.body.session.attempts[2].status !== "verified" ||
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
    mutatingBlocked.body.run.safety.status !== "blocked_m100_confirmation_required" ||
    mutatingBlocked.body.run.errorCode !== "m100_confirmation_required" ||
    String(mutatingBlocked.body.run.error || "").indexOf("server-owned M100 action proposal") < 0
  ) {
    throw new Error("Mutating plan without an M100 proposal was not blocked");
  }
  if (
    directUnsafeDeleteLayer.status !== 200 ||
    !directUnsafeDeleteLayer.body.result ||
    directUnsafeDeleteLayer.body.result.isError !== true ||
    directUnsafeDeletePayload.code !== "proposal_required" ||
    !directUnsafeDeletePayload.m100 ||
    directUnsafeDeletePayload.m100.riskLevel !== "destructive" ||
    directUnsafeDeletePayload.m100.ignoredClientConfirmation !== true
  ) {
    throw new Error("Direct unsafe delete_layer call did not fail closed as destructive M100");
  }
  if (
    invalidSetCompProperties.status !== 500 ||
    emptySetCompProperties.status !== 500 ||
    invalidSetLayerMask.status !== 500 ||
    missingCompSetLayerMask.status !== 500 ||
    String(invalidSetCompProperties.body.result || "").indexOf("Unsupported set_comp_properties fields") < 0 ||
    String(emptySetCompProperties.body.result || "").indexOf("At least one approved comp property update is required") < 0 ||
    String(invalidSetLayerMask.body.result || "").indexOf("compItemIndex or compName is required for set_layer_mask") < 0 ||
    String(missingCompSetLayerMask.body.result || "").indexOf("compItemIndex or compName is required for set_layer_mask") < 0
  ) {
    throw new Error("set_comp_properties or set_layer_mask validation did not fail closed");
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
    rawExtendscriptWrongGate.body.run.safety.status !== "blocked_m100_confirmation_required" ||
    rawExtendscriptWrongGate.body.run.errorCode !== "m100_confirmation_required"
  ) {
    throw new Error("Raw ExtendScript run without an M100 proposal was not blocked");
  }
  if (
    rawExtendscriptAfterDryRun.status !== 400 ||
    rawExtendscriptAfterDryRun.body.ok !== false ||
    !rawExtendscriptAfterDryRun.body.run ||
    rawExtendscriptAfterDryRun.body.run.safety.status !== "blocked_m100_confirmation_required" ||
    rawExtendscriptAfterDryRun.body.run.errorCode !== "m100_confirmation_required"
  ) {
    throw new Error("Raw ExtendScript dry-run gate bypassed the M100 proposal requirement");
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
    new RegExp(`sk-smoke-secret|smoke-secret-token|${escapeRegExp(fakePrivateProjectPath)}`).test(
      devRequestText + devEvidenceText + devStartPromptText + devCandidateText
    )
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
  for (const expectedTool of ["get_ai_agent_log", "get_project_intent_memory", "update_project_intent_memory", "list_ai_agents", "check_ai_agent_readiness", "chat_with_ai_agent", "plan_with_ai_agent", "validate_ai_agent_plan", "run_ai_agent_plan", "run_agent_hardcore_session", "start_edit_session", "get_edit_session_status", "finish_edit_session", "list_edit_sessions", "checkpoint_project", "list_project_checkpoints", "get_project_checkpoint_details", "delete_project_checkpoint", "restore_project_checkpoint", "list_project_folder_items", "create_comp", "create_project_folder", "move_project_items_to_folder", "set_layer_metadata", "set_layer_blending_mode", "set_layer_track_matte", "set_project_item_metadata", "set_project_frames_count_type", "get_layer_essential_properties", "get_essential_graphics_controllers", "add_property_to_essential_graphics", "set_comp_properties", "refresh_comp_panel", "set_comp_work_area", "set_layer_time_range", "stagger_layers", "split_layers_at_time", "precompose_layers", "replace_layer_source", "deep_duplicate_precomp_sources", "rename_layers", "rename_project_items", "update_text_layer", "create_camera_layer", "create_layer_mask", "set_layer_mask", "export_text_to_file", "save_comp_frame_png", "duplicate_layer", "duplicate_layers", "set_layer_selection", "set_layer_parent", "delete_layer", "add_comp_marker", "add_layer_marker", "update_layer_marker", "delete_layer_marker", "create_shape_layer", "fit_layer_to_comp", "set_property_keyframes", "apply_keyframe_ease", "set_expression", "clear_expression", "add_comp_to_render_queue", "set_render_queue_output", "get_render_queue_status"]) {
    if (!toolNames.includes(expectedTool)) {
      throw new Error("Missing expected tool: " + expectedTool);
    }
  }
  const compDetailsTool = lines[1].result.tools.find((tool) => tool.name === "get_comp_details");
  if (!compDetailsTool || !compDetailsTool.inputSchema.properties.compName || !compDetailsTool.inputSchema.properties.includeMarkers || !compDetailsTool.inputSchema.properties.markerLimit) {
    throw new Error("get_comp_details is missing composition marker read schema fields");
  }
  const createTextTool = lines[1].result.tools.find((tool) => tool.name === "create_text_layer");
  if (!createTextTool.inputSchema.properties.autoCheckpoint || !createTextTool.inputSchema.properties.checkpointLabel || !createTextTool.inputSchema.properties.idempotencyKey || !createTextTool.inputSchema.properties.verifyAfter) {
    throw new Error("create_text_layer is missing safety schema fields");
  }
  const createCameraTool = lines[1].result.tools.find((tool) => tool.name === "create_camera_layer");
  if (!createCameraTool || !createCameraTool.inputSchema.properties.autoCheckpoint || !createCameraTool.inputSchema.properties.checkpointLabel || !createCameraTool.inputSchema.properties.idempotencyKey || !createCameraTool.inputSchema.properties.verifyAfter) {
    throw new Error("create_camera_layer is missing safety schema fields");
  }
  const createMaskTool = lines[1].result.tools.find((tool) => tool.name === "create_layer_mask");
  if (!createMaskTool || !createMaskTool.inputSchema.properties.autoCheckpoint || !createMaskTool.inputSchema.properties.checkpointLabel || !createMaskTool.inputSchema.properties.idempotencyKey || !createMaskTool.inputSchema.properties.verifyAfter) {
    throw new Error("create_layer_mask is missing safety schema fields");
  }
  const setLayerMaskTool = lines[1].result.tools.find((tool) => tool.name === "set_layer_mask");
  if (!setLayerMaskTool || !setLayerMaskTool.inputSchema.properties.autoCheckpoint || !setLayerMaskTool.inputSchema.properties.checkpointLabel || !setLayerMaskTool.inputSchema.properties.idempotencyKey || !setLayerMaskTool.inputSchema.properties.verifyAfter || !setLayerMaskTool.inputSchema.properties.operation || !setLayerMaskTool.inputSchema.properties.layerIndex || !setLayerMaskTool.inputSchema.properties.maskIndex || !setLayerMaskTool.inputSchema.properties.expectedMaskName) {
    throw new Error("set_layer_mask is missing safety schema fields");
  }
  if (
    String(setLayerMaskTool.description || "").indexOf("compItemIndex or compName") < 0 ||
    String(setLayerMaskTool.inputSchema.properties.compItemIndex.description || "").indexOf("does not default to the active comp") < 0 ||
    String(setLayerMaskTool.inputSchema.properties.compName.description || "").indexOf("does not default to the active comp") < 0
  ) {
    throw new Error("set_layer_mask schema does not document explicit comp targeting");
  }
  const setCompPropertiesTool = lines[1].result.tools.find((tool) => tool.name === "set_comp_properties");
  if (!setCompPropertiesTool || !setCompPropertiesTool.inputSchema.properties.autoCheckpoint || !setCompPropertiesTool.inputSchema.properties.checkpointLabel || !setCompPropertiesTool.inputSchema.properties.idempotencyKey || !setCompPropertiesTool.inputSchema.properties.verifyAfter || !setCompPropertiesTool.inputSchema.properties.compItemIndex || !setCompPropertiesTool.inputSchema.properties.width || !setCompPropertiesTool.inputSchema.properties.bgColor || !setCompPropertiesTool.inputSchema.properties.displayStartFrame || !setCompPropertiesTool.inputSchema.properties.preserveNestedFrameRate || setCompPropertiesTool.inputSchema.properties.opacity) {
    throw new Error("set_comp_properties is missing bounded safety schema fields");
  }
  const setProjectFramesCountTypeTool = lines[1].result.tools.find((tool) => tool.name === "set_project_frames_count_type");
  if (!setProjectFramesCountTypeTool || !setProjectFramesCountTypeTool.inputSchema.properties.framesCountType || !setProjectFramesCountTypeTool.inputSchema.properties.expectedCurrentFramesCountType) {
    throw new Error("set_project_frames_count_type is missing bounded safety schema fields");
  }
  const duplicateLayerTool = lines[1].result.tools.find((tool) => tool.name === "duplicate_layer");
  if (!duplicateLayerTool || !duplicateLayerTool.inputSchema.properties.autoCheckpoint || !duplicateLayerTool.inputSchema.properties.checkpointLabel || !duplicateLayerTool.inputSchema.properties.idempotencyKey || !duplicateLayerTool.inputSchema.properties.verifyAfter || !duplicateLayerTool.inputSchema.properties.sourceName) {
    throw new Error("duplicate_layer is missing safety schema fields");
  }
  const duplicateLayersTool = lines[1].result.tools.find((tool) => tool.name === "duplicate_layers");
  if (!duplicateLayersTool || !duplicateLayersTool.inputSchema.properties.autoCheckpoint || !duplicateLayersTool.inputSchema.properties.checkpointLabel || !duplicateLayersTool.inputSchema.properties.idempotencyKey || !duplicateLayersTool.inputSchema.properties.verifyAfter || !duplicateLayersTool.inputSchema.properties.layerIndices || !duplicateLayersTool.inputSchema.properties.sourceNames) {
    throw new Error("duplicate_layers is missing safety schema fields");
  }
  const deleteLayerTool = lines[1].result.tools.find((tool) => tool.name === "delete_layer");
  if (!deleteLayerTool || !deleteLayerTool.inputSchema.properties.autoCheckpoint || !deleteLayerTool.inputSchema.properties.checkpointLabel || !deleteLayerTool.inputSchema.properties.idempotencyKey || !deleteLayerTool.inputSchema.properties.verifyAfter || !deleteLayerTool.inputSchema.properties.layerIndex || !deleteLayerTool.inputSchema.properties.expectedLayerName || deleteLayerTool.inputSchema.properties.layerIndices) {
    throw new Error("delete_layer is missing destructive safety schema fields");
  }
  const addLayerMarkerTool = lines[1].result.tools.find((tool) => tool.name === "add_layer_marker");
  if (!addLayerMarkerTool || !addLayerMarkerTool.inputSchema.properties.autoCheckpoint || !addLayerMarkerTool.inputSchema.properties.checkpointLabel || !addLayerMarkerTool.inputSchema.properties.idempotencyKey || !addLayerMarkerTool.inputSchema.properties.verifyAfter || !addLayerMarkerTool.inputSchema.properties.layerIndex || !addLayerMarkerTool.inputSchema.properties.comment) {
    throw new Error("add_layer_marker is missing safety schema fields");
  }
  const addCompMarkerTool = lines[1].result.tools.find((tool) => tool.name === "add_comp_marker");
  if (!addCompMarkerTool || !addCompMarkerTool.inputSchema.properties.autoCheckpoint || !addCompMarkerTool.inputSchema.properties.checkpointLabel || !addCompMarkerTool.inputSchema.properties.idempotencyKey || !addCompMarkerTool.inputSchema.properties.verifyAfter || !addCompMarkerTool.inputSchema.properties.compName || !addCompMarkerTool.inputSchema.properties.time || !addCompMarkerTool.inputSchema.properties.comment || !addCompMarkerTool.inputSchema.properties.expectedMarkerCountBefore) {
    throw new Error("add_comp_marker is missing safety schema fields");
  }
  const addEssentialGraphicsTool = lines[1].result.tools.find((tool) => tool.name === "add_property_to_essential_graphics");
  if (!addEssentialGraphicsTool || !addEssentialGraphicsTool.inputSchema.properties.autoCheckpoint || !addEssentialGraphicsTool.inputSchema.properties.checkpointLabel || !addEssentialGraphicsTool.inputSchema.properties.idempotencyKey || !addEssentialGraphicsTool.inputSchema.properties.verifyAfter || !addEssentialGraphicsTool.inputSchema.properties.compName || !addEssentialGraphicsTool.inputSchema.properties.layerIndex || !addEssentialGraphicsTool.inputSchema.properties.propertyPath || !addEssentialGraphicsTool.inputSchema.properties.controllerName || !addEssentialGraphicsTool.inputSchema.properties.expectedControllerCountBefore) {
    throw new Error("add_property_to_essential_graphics is missing safety schema fields");
  }
  for (const readOnlyEssentialToolName of ["get_layer_essential_properties", "get_essential_graphics_controllers"]) {
    const readOnlyEssentialTool = lines[1].result.tools.find((tool) => tool.name === readOnlyEssentialToolName);
    if (!readOnlyEssentialTool || readOnlyEssentialTool.inputSchema.properties.idempotencyKey) {
      throw new Error(readOnlyEssentialToolName + " should remain read-only");
    }
  }
  const updateLayerMarkerTool = lines[1].result.tools.find((tool) => tool.name === "update_layer_marker");
  if (!updateLayerMarkerTool || !updateLayerMarkerTool.inputSchema.properties.autoCheckpoint || !updateLayerMarkerTool.inputSchema.properties.checkpointLabel || !updateLayerMarkerTool.inputSchema.properties.idempotencyKey || !updateLayerMarkerTool.inputSchema.properties.verifyAfter || !updateLayerMarkerTool.inputSchema.properties.layerIndex || !updateLayerMarkerTool.inputSchema.properties.markerIndex || !updateLayerMarkerTool.inputSchema.properties.targetTime) {
    throw new Error("update_layer_marker is missing safety schema fields");
  }
  const deleteLayerMarkerTool = lines[1].result.tools.find((tool) => tool.name === "delete_layer_marker");
  if (!deleteLayerMarkerTool || !deleteLayerMarkerTool.inputSchema.properties.autoCheckpoint || !deleteLayerMarkerTool.inputSchema.properties.checkpointLabel || !deleteLayerMarkerTool.inputSchema.properties.idempotencyKey || !deleteLayerMarkerTool.inputSchema.properties.verifyAfter || !deleteLayerMarkerTool.inputSchema.properties.layerIndex || !deleteLayerMarkerTool.inputSchema.properties.markerIndex || !deleteLayerMarkerTool.inputSchema.properties.targetTime) {
    throw new Error("delete_layer_marker is missing safety schema fields");
  }
  for (const mutatingProjectToolName of ["create_comp", "create_project_folder", "move_project_items_to_folder"]) {
    const mutatingProjectTool = lines[1].result.tools.find((tool) => tool.name === mutatingProjectToolName);
    if (!mutatingProjectTool || !mutatingProjectTool.inputSchema.properties.autoCheckpoint || !mutatingProjectTool.inputSchema.properties.checkpointLabel || !mutatingProjectTool.inputSchema.properties.idempotencyKey || !mutatingProjectTool.inputSchema.properties.verifyAfter) {
      throw new Error(mutatingProjectToolName + " is missing safety schema fields");
    }
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
  const folderListTool = lines[1].result.tools.find((tool) => tool.name === "list_project_folder_items");
  if (!folderListTool || folderListTool.inputSchema.properties.idempotencyKey) {
    throw new Error("list_project_folder_items should remain read-only");
  }

  console.log(JSON.stringify({
    ok: true,
    responses: lines.length,
    tools: toolNames,
    listCompsResult: lines[2].result.content[0].text,
    agents: agents.body.agents.map((agent) => agent.id),
    layerAttributeSet: layerAttributeSet.body.result.layers.length,
    alignLayers: alignLayers.body.result.changedCount,
    preparedTypedTools: preparedToolResponses.length,
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
      candidate: hardcoreSession.body.session.artifacts.candidate.path,
      rawBlocked: hardcoreRawBlocked,
      destructiveBlocked: hardcoreDestructiveBlocked
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

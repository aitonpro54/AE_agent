"use strict";

const assert = require("assert");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { classifyAgentPlan } = require("../mcp-server/plan-risk-classifier");

const daemonPath = path.join(__dirname, "..", "mcp-server", "bridge-daemon.js");
const nodePath = process.execPath;
const port = String(4650 + Math.floor(Math.random() * 1000));
const token = "plan-classification-smoke-token";
const REQUEST_TIMEOUT_MS = 10000;

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
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Timed out waiting for ${options.method || "GET"} ${options.path}`));
    });
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bridgePost(pathname, payload) {
  return requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: pathname,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, payload);
}

function bridgeGet(pathname) {
  return requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: pathname,
    method: "GET"
  });
}

async function waitForBridgeHealth(child) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < 7000) {
    if (child.exitCode !== null) break;
    try {
      const response = await bridgeGet("/health");
      if (response.status === 200 && response.body && response.body.ok === true) {
        return response.body;
      }
    } catch (error) {
      lastError = error;
    }
    await wait(100);
  }
  throw new Error(`Bridge did not become healthy for plan classification smoke: ${lastError ? lastError.message : "not ready"}`);
}

async function validatePlan(id, plan, expectedCategory, extraAssertions) {
  const response = await bridgePost("/agents/plan/validate", {
    requestId: `plan-classification-${id}`,
    plan
  });
  assert.strictEqual(response.status, 200, `${id}: validate endpoint status`);
  assert.strictEqual(response.body.ok, true, `${id}: validate endpoint ok`);
  assert(response.body.validation, `${id}: validation missing`);
  assert(response.body.classification, `${id}: classification missing`);
  assert.strictEqual(response.body.validation.classification.category, expectedCategory, `${id}: validation classification`);
  assert.strictEqual(response.body.classification.category, expectedCategory, `${id}: top-level classification`);
  if (extraAssertions) extraAssertions(response.body.validation.classification, response.body.validation);
  return response.body.validation.classification;
}

function assertContextSignals() {
  const plan = {
    summary: "Create generated QA comp.",
    risk: "medium",
    requiresCheckpoint: false,
    steps: [
      {
        title: "Create generated comp",
        tool: "create_test_comp",
        args: {
          name: "Codex Risk Fixture",
          width: 640,
          height: 360,
          duration: 1,
          frameRate: 24
        }
      }
    ]
  };
  const validation = {
    ok: true,
    stepCount: 1,
    executableCount: 1,
    mutatingCount: 1,
    unknownToolCount: 0,
    invalidStepCount: 0,
    requiresCheckpoint: false,
    warnings: [],
    steps: [
      {
        index: 1,
        title: "Create generated comp",
        tool: "create_test_comp",
        valid: true,
        executable: true,
        mutatesProject: true,
        targetSummary: "new comp Codex Risk Fixture",
        missingRequired: [],
        boundRequired: [],
        warnings: []
      }
    ]
  };
  const classification = classifyAgentPlan(plan, validation, {
    solutionHints: {
      ok: true,
      returned: 1,
      entries: [
        {
          id: "fixture-reviewed-jsx",
          status: "recipe",
          mutating: true,
          riskLevel: "high",
          rawExtendscriptRisk: true
        }
      ],
      toolMatches: []
    },
    projectIntentMemory: {
      ok: true,
      returned: 1,
      entries: [
        {
          id: "fixture-generated-prefixes",
          category: "generated-assets",
          priority: "high"
        }
      ]
    }
  });

  assert.strictEqual(classification.category, "risky");
  assert.strictEqual(classification.contextSignals.solutionHints.rawExtendscriptHints, 1);
  assert.strictEqual(classification.contextSignals.solutionHints.highRiskHints, 1);
  assert.strictEqual(classification.contextSignals.projectIntentMemory.returned, 1);
  assert(classification.riskSignals.some((line) => line.indexOf("raw ExtendScript") >= 0));
  assert(classification.safetySignals.some((line) => line.indexOf("Project intent memory") >= 0));
}

async function main() {
  assertContextSignals();

  const child = spawn(nodePath, [daemonPath], {
    env: {
      ...process.env,
      AE_BRIDGE_PORT: port,
      AE_BRIDGE_TOKEN: token
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stderr = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  try {
    const health = await waitForBridgeHealth(child);
    const safe = await validatePlan("safe", {
      summary: "Read bridge state only.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Read bridge status",
          tool: "get_bridge_status",
          args: {}
        }
      ]
    }, "safe typed-tool", (classification) => {
      assert.strictEqual(classification.blocksRun, false);
      assert.strictEqual(classification.tone, "read-only");
    });

    const needsClarification = await validatePlan("ambiguous", {
      summary: "Need target details before changing selected layers.",
      risk: "low",
      requiresCheckpoint: false,
      clarifyingQuestion: "Which selected layers should be changed?",
      steps: []
    }, "needs clarification", (classification, validation) => {
      assert.strictEqual(validation.ok, false);
      assert.strictEqual(classification.blocksRun, true);
      assert.strictEqual(classification.allowsDryRun, false);
      assert.strictEqual(classification.tone, "blocked");
      assert(classification.runRecommendation.indexOf("Resolve the missing executable MCP steps") >= 0);
    });

    const risky = await validatePlan("risky", {
      summary: "Create a generated test comp.",
      risk: "medium",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Create generated comp",
          tool: "create_test_comp",
          args: {
            name: "Codex Classification Smoke",
            width: 640,
            height: 360,
            duration: 1,
            frameRate: 24,
            openInViewer: false
          }
        }
      ]
    }, "risky", (classification) => {
      assert.strictEqual(classification.blocksRun, false);
      assert.strictEqual(classification.tone, "mutating");
      assert(classification.riskSignals.some((line) => line.indexOf("mutating") >= 0));
    });

    const unsupported = await validatePlan("unsupported", {
      summary: "Try a local operator tool inside an Agent plan.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Update memory from plan",
          tool: "update_project_intent_memory",
          args: {
            confirm: true,
            operation: "disable",
            id: "fixture"
          }
        }
      ]
    }, "unsupported", (classification) => {
      assert.strictEqual(classification.blocksRun, true);
      assert.strictEqual(classification.allowsDryRun, false);
    });

    console.log(JSON.stringify({
      ok: true,
      bridge: {
        version: health.version,
        panelConnected: health.panelConnected
      },
      classifications: {
        safe: safe.category,
        ambiguous: needsClarification.category,
        risky: risky.category,
        unsupported: unsupported.category
      }
    }, null, 2));
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

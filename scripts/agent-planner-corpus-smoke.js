"use strict";

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const {
  AGENT_SCENARIO_MUTATING_TOOLS,
  buildAgentPlannerRegressionCorpus,
  exactPlanPrompt
} = require("./agent-scenario-fixtures");

const daemonPath = path.join(__dirname, "..", "mcp-server", "bridge-daemon.js");
const nodePath = process.execPath;
const port = String(4550 + Math.floor(Math.random() * 1000));
const token = "agent-planner-corpus-smoke-token";
const REQUEST_TIMEOUT_MS = 10000;

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
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

function sameArray(left, right) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function countMutatingSteps(plan) {
  return Array.isArray(plan && plan.steps)
    ? plan.steps.filter((step) => AGENT_SCENARIO_MUTATING_TOOLS.has(step.tool)).length
    : 0;
}

function validateStaticCorpus(corpus) {
  assertOk(corpus && corpus.schema === "agent-planner-regression-corpus.v1", "Unexpected planner corpus schema.");
  assertOk(Array.isArray(corpus.scenarios) && corpus.scenarios.length > 0, "Planner corpus has no scenarios.");

  const ids = new Set();
  for (const scenario of corpus.scenarios) {
    assertOk(scenario && typeof scenario.id === "string" && scenario.id, "Scenario id is required.");
    assertOk(!ids.has(scenario.id), `Duplicate scenario id: ${scenario.id}`);
    ids.add(scenario.id);

    const plan = scenario.plan || {};
    const steps = Array.isArray(plan.steps) ? plan.steps : [];
    const expected = scenario.expected || {};
    const toolSequence = steps.map((step) => step.tool);
    const stepTitles = steps.map((step) => step.title);

    assertOk(steps.length > 0, `${scenario.id}: fixture plan has no steps.`);
    assertOk(scenario.prompt === exactPlanPrompt(plan), `${scenario.id}: prompt does not match the exact plan fixture.`);
    assertOk(expected.stepCount === steps.length, `${scenario.id}: expected step count does not match fixture plan.`);
    assertOk(expected.mutatingCount === countMutatingSteps(plan), `${scenario.id}: expected mutating count does not match fixture plan.`);
    assertOk(sameArray(expected.toolSequence, toolSequence), `${scenario.id}: expected tool sequence does not match fixture plan.`);
    assertOk(sameArray(expected.stepTitles, stepTitles), `${scenario.id}: expected step titles do not match fixture plan.`);
    for (const expectedTool of expected.tools || []) {
      assertOk(toolSequence.includes(expectedTool), `${scenario.id}: expected tool is missing from fixture plan: ${expectedTool}`);
    }
    assertOk(!toolSequence.includes("run_extendscript") && !toolSequence.includes("run_extendscript_file"), `${scenario.id}: fixture must use typed tools, not raw ExtendScript.`);
    if (expected.mutatingCount > 1) {
      assertOk(plan.requiresCheckpoint === true, `${scenario.id}: multi-step mutating fixture must require checkpoint protection.`);
    }
  }
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
  throw new Error(`Bridge did not become healthy for planner corpus smoke: ${lastError ? lastError.message : "not ready"}`);
}

function assertValidationShape(scenario, validation) {
  const expected = scenario.expected;
  assertOk(validation && validation.ok === true, `${scenario.id}: validation failed.`);
  assertOk(validation.stepCount === expected.stepCount, `${scenario.id}: validation step count mismatch.`);
  assertOk(validation.mutatingCount === expected.mutatingCount, `${scenario.id}: validation mutating count mismatch.`);
  assertOk(validation.unknownToolCount === 0, `${scenario.id}: validation found unknown tools.`);
  assertOk(validation.invalidStepCount === 0, `${scenario.id}: validation found invalid steps.`);
  assertOk(Array.isArray(validation.steps) && validation.steps.length === expected.stepCount, `${scenario.id}: validation steps length mismatch.`);
  assertOk(sameArray(validation.steps.map((step) => step.tool), expected.toolSequence), `${scenario.id}: validation tool sequence mismatch.`);
  assertOk(validation.steps.every((step) => step.executable === true), `${scenario.id}: all fixture steps must be executable in validation.`);
}

async function validateScenarioThroughBridge(scenario) {
  const validationResponse = await bridgePost("/agents/plan/validate", {
    requestId: `planner-corpus-validate-${scenario.id}`,
    plan: scenario.plan
  });
  assertOk(validationResponse.status === 200 && validationResponse.body.ok === true, `${scenario.id}: /agents/plan/validate failed.`);
  assertValidationShape(scenario, validationResponse.body.validation);

  const dryRunResponse = await bridgePost("/agents/plan/run", {
    requestId: `planner-corpus-dry-run-${scenario.id}`,
    dryRun: true,
    plan: scenario.plan
  });
  assertOk(dryRunResponse.status === 200 && dryRunResponse.body.ok === true, `${scenario.id}: /agents/plan/run dry-run failed.`);

  const run = dryRunResponse.body.run || {};
  assertOk(run.dryRun === true, `${scenario.id}: plan runner did not report dryRun:true.`);
  assertOk(run.ok === true, `${scenario.id}: plan runner dry-run was not ok.`);
  assertOk(run.executedCount === 0, `${scenario.id}: dry-run must not execute bridge tools.`);
  assertValidationShape(scenario, run.validation);
  assertOk(Array.isArray(run.steps) && run.steps.length === scenario.expected.stepCount, `${scenario.id}: dry-run steps length mismatch.`);
  assertOk(run.steps.every((step) => step.status === "ready"), `${scenario.id}: every fixture dry-run step must be ready.`);
  assertOk(run.steps.every((step) => !Object.prototype.hasOwnProperty.call(step, "result")), `${scenario.id}: dry-run must not include executed tool results.`);

  return {
    id: scenario.id,
    stepCount: scenario.expected.stepCount,
    mutatingCount: scenario.expected.mutatingCount,
    dryRunStatuses: run.steps.map((step) => step.status)
  };
}

async function main() {
  const corpus = buildAgentPlannerRegressionCorpus();
  validateStaticCorpus(corpus);

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
    const scenarios = [];
    for (const scenario of corpus.scenarios) {
      scenarios.push(await validateScenarioThroughBridge(scenario));
    }

    console.log(JSON.stringify({
      ok: true,
      corpus: {
        schema: corpus.schema,
        source: corpus.source,
        fixturePrefix: corpus.fixturePrefix,
        scenarioCount: corpus.scenarios.length
      },
      bridge: {
        version: health.version,
        panelConnected: health.panelConnected
      },
      scenarios
    }, null, 2));
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

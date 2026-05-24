"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const CONTRACT_PATH = ".codex-audit/sdk-ao-pattern-intake/214-status-dashboard-contract.json";
const PARENT_ACTIVITY_PATH = ".codex-audit/sdk-ao-pattern-intake/212-activity-session-schema.json";
const PARENT_ESCALATION_PATH = ".codex-audit/sdk-ao-pattern-intake/213-stuck-escalation-design.json";
const RENDERER_PATH = path.join(repo, "scripts", "render-roadmap-supervisor-status-dashboard.js");

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function assertIncludesAll(actualValues, expectedValues, label) {
  for (const expected of expectedValues) {
    assert(
      actualValues.includes(expected),
      `${label} must include ${expected}`,
    );
  }
}

function assertFalseClaims(contract) {
  for (const claim of contract.machineCheck.requiredFalseBoundaryClaims) {
    assert.strictEqual(
      contract.boundaryClaims[claim],
      false,
      `boundary claim ${claim} must remain false`,
    );
  }
}

function assertContractShape(contract, parentActivity, parentEscalation) {
  assert.strictEqual(contract.schema, contract.machineCheck.requiredSchema);
  assert.strictEqual(contract.milestone, 214);
  assert.strictEqual(parentActivity.schema, contract.machineCheck.requiredParentSchemas[0]);
  assert.strictEqual(parentEscalation.schema, contract.machineCheck.requiredParentSchemas[1]);
  assert.strictEqual(contract.source.notRuntimeBehavior, true);
  assert.strictEqual(contract.source.notAnAoIntegration, true);
  assert.strictEqual(contract.dashboardContract.format, contract.machineCheck.requiredFormat);
  assert.strictEqual(contract.dashboardContract.inputMode, contract.machineCheck.requiredInputMode);
  assert.strictEqual(contract.dashboardContract.defaultOutput, contract.machineCheck.requiredDefaultOutput);
  assert.strictEqual(contract.dashboardContract.noDefaultWrites, true);
  assert.strictEqual(contract.cliContract.script, contract.machineCheck.requiredRendererScript);

  assertIncludesAll(
    contract.dashboardContract.requiredSummaryFields,
    contract.machineCheck.requiredSummaryFields,
    "dashboard summary fields",
  );
  assertIncludesAll(
    contract.fixtureExpectations.map((entry) => entry.sessionState),
    contract.machineCheck.requiredFixtureStates,
    "fixture states",
  );
  assert(contract.cliContract.forbiddenSideEffects.includes("start web server"));
  assert(contract.cliContract.forbiddenSideEffects.includes("install packages"));
  assert(contract.cliContract.forbiddenSideEffects.includes("run live AE/CEP"));
  assertFalseClaims(contract);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonl(filePath, events) {
  fs.writeFileSync(filePath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
}

function makeSession(root, name, state, events, report) {
  const sessionRoot = path.join(root, name);
  fs.mkdirSync(sessionRoot, { recursive: true });
  writeJson(path.join(sessionRoot, "state.json"), state);
  writeJsonl(path.join(sessionRoot, "events.jsonl"), events);
  if (report) {
    writeJson(path.join(sessionRoot, "reports", `${state.queueItemId}.json`), report);
  }
}

function buildFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-m214-dashboard-"));

  makeSession(
    root,
    "active-session",
    {
      sessionId: "active-session",
      queueItemId: "m214-ao-static-status-dashboard",
      role: "writer",
      state: "active",
      validation: {
        status: "running",
      },
      changedPaths: [
        ".codex-audit/sdk-ao-pattern-intake/214-status-dashboard-contract.json",
        "scripts/render-roadmap-supervisor-status-dashboard.js",
      ],
      handoffPath: ".codex/handoff.md",
      reportPath: "reports/m214-ao-static-status-dashboard.json",
      nextAction: "Continue bounded validation or planned-path work.",
    },
    [
      {
        ts: "2026-05-24T18:00:00.000Z",
        sessionId: "active-session",
        taskId: "m214-ao-static-status-dashboard",
        role: "writer",
        event: "active",
        state: "active",
        message: "Rendering fixture dashboard.",
      },
    ],
    {
      validation: {
        status: "running",
      },
    },
  );

  makeSession(
    root,
    "done-session",
    {
      sessionId: "done-session",
      taskId: "m213-ao-stuck-escalation-design",
      role: "writer",
      lifecycleStatus: "done",
      validationResult: "passed",
      changedPaths: [
        ".codex-audit/sdk-ao-pattern-intake/213-stuck-escalation-design.json",
      ],
      handoffPath: ".codex/handoff.md",
      nextAction: "Continue to the next queue item.",
    },
    [
      {
        ts: "2026-05-24T17:34:00.000Z",
        sessionId: "done-session",
        taskId: "m213-ao-stuck-escalation-design",
        role: "writer",
        event: "done",
        state: "done",
        message: "Validation passed.",
      },
    ],
    null,
  );

  makeSession(
    root,
    "stuck-session",
    {
      sessionId: "stuck-session",
      queueItemId: "m214-ao-static-status-dashboard",
      role: "reviewer",
      state: "stuck",
      validationResult: "blocked",
      blockers: [
        "validation output stopped advancing",
      ],
      changedPaths: [],
      handoffPath: ".codex/handoff.md",
      nextAction: "Stop and hand off with blockers before retrying.",
    },
    [
      {
        ts: "2026-05-24T18:10:00.000Z",
        sessionId: "stuck-session",
        taskId: "m214-ao-static-status-dashboard",
        role: "reviewer",
        event: "stuck",
        state: "stuck",
        message: "No fresh activity observed.",
        nextAction: "Stop and hand off with blockers before retrying.",
      },
    ],
    {
      blockers: [
        "validation output stopped advancing",
      ],
    },
  );

  return root;
}

function runRenderer(args) {
  return childProcess.execFileSync(process.execPath, [RENDERER_PATH, ...args], {
    cwd: repo,
    encoding: "utf8",
  });
}

function assertRendererOutput(markdown) {
  assert(markdown.includes("# Roadmap Supervisor Status Dashboard"));
  assert(markdown.includes("## active-session"));
  assert(markdown.includes("## stuck-session"));
  assert(markdown.includes("## done-session"));
  assert(markdown.includes("Lifecycle status: `active`"));
  assert(markdown.includes("Lifecycle status: `stuck`"));
  assert(markdown.includes("Lifecycle status: `done`"));
  assert(markdown.includes("Validation result: `running`"));
  assert(markdown.includes("Validation result: `blocked`"));
  assert(markdown.includes("Validation result: `passed`"));
  assert(markdown.includes("validation output stopped advancing"));
  assert(markdown.includes("scripts/render-roadmap-supervisor-status-dashboard.js"));
  assert(markdown.includes("Handoff path: `.codex/handoff.md`"));
  assert(markdown.includes("Report path: `reports/m214-ao-static-status-dashboard.json`"));
  assert(markdown.includes("Next action: Continue bounded validation or planned-path work."));
  assert(markdown.includes("Next action: Stop and hand off with blockers before retrying."));
  assert(markdown.includes("Next action: Continue to the next queue item."));
}

function assertRendererSourceIsStaticOnly() {
  const source = fs.readFileSync(RENDERER_PATH, "utf8");
  assert(!source.includes("createServer"), "renderer must not start a server");
  assert(!source.includes("listen("), "renderer must not listen on a port");
  assert(!source.includes("child_process"), "renderer must not spawn child processes");
  assert(!source.includes("package.json"), "renderer must not inspect package manifests");
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const parentActivity = readJson(PARENT_ACTIVITY_PATH);
  const parentEscalation = readJson(PARENT_ESCALATION_PATH);
  assertContractShape(contract, parentActivity, parentEscalation);
  assertRendererSourceIsStaticOnly();

  const fixtureRoot = buildFixture();
  const markdown = runRenderer(["--session-root", fixtureRoot]);
  assertRendererOutput(markdown);

  const outputPath = path.join(fixtureRoot, "dashboard.md");
  const outputStdout = runRenderer(["--session-root", fixtureRoot, "--output", outputPath]);
  assert.strictEqual(outputStdout, "");
  assertRendererOutput(fs.readFileSync(outputPath, "utf8"));

  console.log("SDK AO status dashboard smoke: pass");
}

if (require.main === module) {
  main();
}

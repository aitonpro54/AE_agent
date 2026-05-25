"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const CONTRACT_PATH = ".codex-audit/sdk-ao-pattern-intake/aux-008-feedback-router-contract.json";
const QUEUE_PATH = ".codex-audit/sdk-roadmap-supervisor/aux-005-aux-008-support-queue.json";
const ROUTER_PATH = path.join(repo, "scripts", "route-roadmap-feedback-packet.js");
const QUEUE_ITEM_ID = "aux-008-feedback-router-contract";
const QUEUE_LABEL = "AUX-008";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function assertIncludesAll(actualValues, expectedValues, label) {
  for (const expected of expectedValues) {
    assert(actualValues.includes(expected), `${label} must include ${expected}`);
  }
}

function assertFalseClaims(contract) {
  for (const claim of contract.machineCheck.requiredFalseBoundaryClaims) {
    assert.strictEqual(contract.boundaryClaims[claim], false, `boundary claim ${claim} must remain false`);
  }
}

function assertContractShape(contract, queue) {
  assert.strictEqual(contract.schema, contract.machineCheck.requiredSchema);
  assert.strictEqual(contract.auxiliaryId, contract.machineCheck.requiredAuxiliaryId);
  assert.strictEqual(contract.source.queuePath, contract.machineCheck.requiredQueuePath);
  assert.strictEqual(contract.source.queueItemId, contract.machineCheck.requiredQueueItemId);
  assert.strictEqual(contract.source.notRuntimeBehavior, true);
  assert.strictEqual(contract.source.notAnAoIntegration, true);
  assert.strictEqual(contract.routerContract.script, contract.machineCheck.requiredRouterScript);
  assert.strictEqual(contract.routerContract.inputMode, contract.machineCheck.requiredInputMode);
  assert.strictEqual(contract.routerContract.defaultOutput, contract.machineCheck.requiredDefaultOutput);
  assert.strictEqual(contract.routerContract.noDefaultWrites, true);
  assert.strictEqual(contract.routerContract.noSourceEditsFromFeedback, true);
  assert.strictEqual(contract.routerContract.noCommandRetries, true);
  assert.strictEqual(contract.routerContract.noAutoFixes, true);
  assert.strictEqual(contract.routerContract.noGithubIssueOrPrCreation, true);
  assert.strictEqual(contract.routerContract.noUnboundedTasks, true);

  const queueItem = queue.queueItems.find((item) => item.id === contract.machineCheck.requiredQueueItemId);
  assert(queueItem, "queue must include the AUX-008 item");
  assert.strictEqual(queueItem.label, QUEUE_LABEL);
  assert(queueItem.plannedPaths.includes(CONTRACT_PATH), "queue planned paths must include contract");
  assert(queueItem.plannedPaths.includes(contract.machineCheck.requiredRouterScript), "queue planned paths must include router script");
  assert(queueItem.plannedPaths.includes(contract.machineCheck.requiredSmokeScript), "queue planned paths must include smoke script");
  assert.strictEqual(queue.sourceContext.boundaries.runAO, false);
  assert.strictEqual(queue.sourceContext.boundaries.localOllama, false);
  assert.strictEqual(queue.sourceContext.boundaries.liveCepAe, false);
  assert.strictEqual(queue.sourceContext.boundaries.dependencies, false);
  assert.strictEqual(queue.sourceContext.boundaries.push, false);
  assert.strictEqual(queue.sourceContext.boundaries.pullRequest, false);

  assertIncludesAll(contract.routerContract.acceptedPacketTypes, contract.machineCheck.requiredPacketTypes, "packet types");
  assertIncludesAll(contract.routerContract.routeClasses, contract.machineCheck.requiredRouteClasses, "route classes");
  assertIncludesAll(contract.routerContract.taskEnvelopeRequiredFields, contract.machineCheck.requiredTaskEnvelopeFields, "task envelope fields");
  assertIncludesAll(contract.routerContract.forbiddenTaskActions, contract.machineCheck.requiredForbiddenTaskActions, "forbidden task actions");
  assertIncludesAll(contract.fixtureExpectations.map((fixture) => fixture.id), contract.machineCheck.requiredFixtureIds, "fixture ids");
  assertFalseClaims(contract);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runRouter(args) {
  return childProcess.spawnSync(process.execPath, [ROUTER_PATH, ...args], {
    cwd: repo,
    encoding: "utf8",
  });
}

function parseRouterJson(result) {
  assert(result.stdout, "router must write JSON to stdout");
  return JSON.parse(result.stdout);
}

function assertRouterSourceIsReadOnly() {
  const source = fs.readFileSync(ROUTER_PATH, "utf8");
  const forbiddenTokens = [
    ["write", "FileSync"].join(""),
    ["append", "FileSync"].join(""),
    ["mkdir", "Sync"].join(""),
    ["child", "_process"].join(""),
    ["exec", "FileSync"].join(""),
    ["spawn", "Sync"].join(""),
  ];
  for (const token of forbiddenTokens) {
    assert(!source.includes(token), `router source must not contain ${token}`);
  }
}

function assertBoundedEnvelope(route, expectedClass, expectedNextAction) {
  assert.strictEqual(route.feedbackClass, expectedClass);
  assert.strictEqual(route.nextRequiredAction, expectedNextAction);
  assert.strictEqual(route.requiresFreshApproval, true);
  assert.strictEqual(route.implementationAllowed, false);
  assert(route.forbiddenActions.includes("auto_fix"));
  assert(route.forbiddenActions.includes("retry_command"));
  assert(route.forbiddenActions.includes("push_or_pr"));
  assert(route.forbiddenActions.includes("github_issue_or_action"));
  assert(route.forbiddenActions.includes("run_live_cep_ae"));
  assert(route.forbiddenActions.includes("use_local_ollama"));
}

function assertSingleRoute(result, expectedClass, expectedNextAction, expectedOk = true) {
  const packet = parseRouterJson(result);
  assert.strictEqual(packet.schema, "roadmap-feedback-router-result.v1");
  assert.strictEqual(packet.ok, expectedOk);
  assert.strictEqual(packet.routeCount, 1);
  assertBoundedEnvelope(packet.routes[0], expectedClass, expectedNextAction);
  return packet.routes[0];
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const queue = readJson(QUEUE_PATH);
  assertContractShape(contract, queue);
  assertRouterSourceIsReadOnly();

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-aux-008-feedback-router-"));

  const validationPath = path.join(root, "validation-failure.json");
  writeJson(validationPath, {
    queueItemId: QUEUE_ITEM_ID,
    label: QUEUE_LABEL,
    validation: {
      status: "failed",
      command: "node scripts/example-smoke.js",
      exitCode: 1,
    },
    plannedPaths: [
      "scripts/example-smoke.js",
      "plans/target-app-execplan.md",
    ],
    changedPaths: [
      "scripts/example-smoke.js",
    ],
    validationCommands: [
      "node scripts/example-smoke.js",
    ],
  });
  const validationResult = runRouter(["--validation", validationPath]);
  assert.strictEqual(validationResult.status, 0, validationResult.stderr);
  const validationRoute = assertSingleRoute(validationResult, "validation_failure", "create_bounded_validation_repair_task");
  assert(validationRoute.plannedPaths.includes("scripts/example-smoke.js"));
  assert(validationRoute.validationCommands.includes("node scripts/example-smoke.js"));

  const reviewerPath = path.join(root, "reviewer-blocking.json");
  writeJson(reviewerPath, {
    decision: "blocking_finding",
    summary: "planned path violation",
    findings: [
      {
        severity: "blocking",
        message: "package path changed",
      },
    ],
    plannedPaths: [
      "plans/target-app-execplan.md",
    ],
  });
  const reviewerResult = runRouter(["--reviewer", reviewerPath]);
  assert.strictEqual(reviewerResult.status, 0, reviewerResult.stderr);
  assertSingleRoute(reviewerResult, "reviewer_blocking", "create_bounded_reviewer_followup_task");

  const contextPath = path.join(root, "context-pressure.json");
  writeJson(contextPath, {
    schema: "roadmap-context-pressure-result.v1",
    ok: false,
    level: "mandatory_handoff",
    stop: true,
    implementationAllowed: false,
    stopReasons: [
      "context_mandatory_handoff_threshold",
    ],
    nextRequiredAction: "stop_implementation_update_handoff",
  });
  const contextResult = runRouter(["--context", contextPath]);
  assert.strictEqual(contextResult.status, 0, contextResult.stderr);
  const contextRoute = assertSingleRoute(contextResult, "context_pressure", "stop_and_update_handoff");
  assert(contextRoute.plannedPaths.includes(".codex/handoff.md"));
  assert.strictEqual(contextRoute.validationCommands.length, 0);

  const analyzerPath = path.join(root, "analyzer-packet.json");
  writeJson(analyzerPath, {
    schema: "roadmap-failure-analyzer-packet.v1",
    failureClass: "validation_failure",
    command: "npm.cmd run check:rules",
    status: "failed",
    suspectedCause: {
      summary: "contract smoke failed",
      confidence: "medium",
    },
    nextBoundedTask: {
      goal: "Repair the failing contract smoke only inside planned paths.",
      plannedPaths: [
        "scripts/example-smoke.js",
      ],
      validationCommands: [
        "node scripts/example-smoke.js",
      ],
    },
  });
  const analyzerResult = runRouter(["--analyzer", analyzerPath]);
  assert.strictEqual(analyzerResult.status, 0, analyzerResult.stderr);
  const analyzerRoute = assertSingleRoute(analyzerResult, "analyzer_packet", "create_bounded_analyzer_followup_task");
  assert(analyzerRoute.plannedPaths.includes("scripts/example-smoke.js"));

  const unknownPath = path.join(root, "unknown-feedback.json");
  writeJson(unknownPath, {
    schema: "unrecognized-feedback.v1",
    note: "no known status fields",
  });
  const unknownResult = runRouter(["--validation", unknownPath]);
  assert.strictEqual(unknownResult.status, 1);
  const unknownRoute = assertSingleRoute(unknownResult, "unknown_feedback", "manual_triage_with_new_bounded_queue_item", false);
  assert.strictEqual(unknownRoute.plannedPaths.length, 0);
  assert.strictEqual(unknownRoute.validationCommands.length, 0);

  const markdownResult = runRouter(["--validation", validationPath, "--format", "markdown"]);
  assert.strictEqual(markdownResult.status, 0, markdownResult.stderr);
  assert(markdownResult.stdout.includes("# Roadmap Feedback Router"));
  assert(markdownResult.stdout.includes("## validation_failure"));
  assert(markdownResult.stdout.includes("Next required action: `create_bounded_validation_repair_task`"));

  console.log("sdk ao feedback router smoke passed");
}

main();

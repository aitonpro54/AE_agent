"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const REVIEW_PATH =
  ".codex-audit/sdk-feature-conveyor/184-ae-agent-feature-conveyor-review.json";
const READINESS_PATH =
  ".codex-audit/sdk-feature-conveyor/184-ae-agent-feature-conveyor-readiness.json";
const GOVERNANCE_PATH =
  ".codex-audit/sdk-feature-conveyor/184-ae-agent-feature-conveyor-governance.json";
const QUEUE_PATH = ".codex-audit/sdk-feature-conveyor/184-dakkshin-intake-feature-queue.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function readText(repoPath) {
  return fs.readFileSync(path.join(repo, repoPath), "utf8");
}

function assertFileExists(repoPath) {
  assert(fs.existsSync(path.join(repo, repoPath)), `Expected file to exist: ${repoPath}`);
}

function assertIncludes(list, value, label) {
  assert(Array.isArray(list), `${label} must be an array.`);
  assert(list.includes(value), `${label} must include ${value}.`);
}

function assertIncludesAll(source, snippets, sourceName) {
  for (const snippet of snippets) {
    assert(source.includes(snippet), `${sourceName} must include: ${snippet}`);
  }
}

function assertFalseBoundaryFlags(artifact, boundaryPath = "sourceContext.behaviorBoundary") {
  const boundary = artifact.sourceContext?.behaviorBoundary;
  for (const flag of artifact.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      boundary?.[flag],
      false,
      `${artifact.schema} ${boundaryPath}.${flag} must remain false.`,
    );
  }
}

function assertQueueItem(item) {
  assert.strictEqual(item.mode, "local-only", `${item.id} must be local-only.`);
  assert.strictEqual(item.status, "queued", `${item.id} must stay queued.`);
  assert.strictEqual(
    item.executionApprovalState,
    "pending-explicit-approval",
    `${item.id} must not be executable in M184.`,
  );
  assert.strictEqual(item.explicitApprovalText, null, `${item.id} must not carry approval text.`);
  assert.strictEqual(item.maxAiTurns, 0, `${item.id} must not allow AI turns.`);
  assert(Array.isArray(item.plannedPaths) && item.plannedPaths.length > 0);
  assertIncludes(item.stopGates, "validation-failed", `${item.id} stop gates`);
  assertIncludes(item.stopGates, "context-pressure", `${item.id} stop gates`);
}

function main() {
  const review = readJson(REVIEW_PATH);
  const readiness = readJson(READINESS_PATH);
  const governance = readJson(GOVERNANCE_PATH);
  const queue = readJson(QUEUE_PATH);
  const current = readJson(".codex-audit/sdk-current-state.json");
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");
  const policy = readText("orchestrator/adapters/ae-agent-sdk-policy.mjs");

  assert.strictEqual(review.schema, "sdk-feature-conveyor-review.v1");
  assert.strictEqual(readiness.schema, "sdk-feature-conveyor-readiness.v1");
  assert.strictEqual(governance.schema, "sdk-feature-conveyor-governance.v1");
  assert.strictEqual(queue.schema, "sdk-ae-agent-feature-conveyor-queue.v1");
  assert.strictEqual(review.milestone, 184);
  assert.strictEqual(readiness.sourceReviewPacket, REVIEW_PATH);
  assert.strictEqual(readiness.queueArtifact, QUEUE_PATH);
  assert.deepStrictEqual(governance.sourcePackets, [REVIEW_PATH, READINESS_PATH, QUEUE_PATH]);

  assertFalseBoundaryFlags(review);
  assertFalseBoundaryFlags(queue);
  for (const field of governance.machineCheck.requiredFalseFields) {
    assert.strictEqual(governance[field], false, `${field} must remain false.`);
  }

  assert.strictEqual(review.reviewedLane.featureExecutionApproved, false);
  assert.strictEqual(readiness.featureExecutionApproved, false);
  assert.strictEqual(governance.featureConveyorExecutionApproved, false);
  assert.strictEqual(governance.dakkshinFeatureImplementationApproved, false);
  assert.strictEqual(queue.commandRunner.executionApprovedNow, false);
  assert.strictEqual(queue.commandRunner.sdkThreadCreatedByDryRun, false);
  assert.strictEqual(queue.commandRunner.autoCommit, false);
  assert.strictEqual(queue.commandRunner.autoPush, false);

  assert.deepStrictEqual(
    queue.queueItems.map((item) => item.id),
    [
      "m185-dakkshin-intake-scope-brief",
      "m186-dakkshin-intake-tool-gap-map",
      "m187-dakkshin-intake-implementation-slice-plan",
    ],
  );
  for (const item of queue.queueItems) {
    assertQueueItem(item);
    assert(
      item.plannedPaths.every((repoPath) => !repoPath.startsWith("cep-panel/")),
      `${item.id} must not plan CEP-panel paths.`,
    );
    assertIncludes(
      item.forbiddenActions,
      "run live CEP/After Effects validation",
      `${item.id} forbidden actions`,
    );
  }

  assertIncludes(
    queue.globalStopGates,
    "no-dakkshin-implementation-in-m184",
    "global stop gates",
  );
  assertIncludes(queue.globalStopGates, "no-cep-panel-sdk-write", "global stop gates");
  assertIncludes(queue.globalStopGates, "no-package-install", "global stop gates");
  assertIncludes(queue.globalStopGates, "no-dependency-change", "global stop gates");
  assertIncludes(queue.globalStopGates, "no-push-by-default", "global stop gates");

  for (const repoPath of [
    REVIEW_PATH,
    READINESS_PATH,
    GOVERNANCE_PATH,
    QUEUE_PATH,
    "orchestrator/run-ae-agent-feature-conveyor.mjs",
    "scripts/sdk-ae-agent-feature-conveyor-readiness-smoke.js",
    "scripts/sdk-ae-agent-feature-conveyor-command-smoke.js",
  ]) {
    assertFileExists(repoPath);
  }

  for (const [scriptName, command] of Object.entries(queue.machineCheck.requiredPackageScripts)) {
    assert.strictEqual(packageJson.scripts?.[scriptName], command, `${scriptName} mismatch`);
  }
  for (const [scriptName, command] of Object.entries(readiness.machineCheck.requiredPackageScripts)) {
    assert.strictEqual(packageJson.scripts?.[scriptName], command, `${scriptName} mismatch`);
  }

  assertIncludesAll(readme, queue.machineCheck.requiredReadmeSnippets, "README");
  for (const [repoPath, snippets] of Object.entries(queue.machineCheck.requiredSourceSnippets)) {
    assertIncludesAll(readText(repoPath), snippets, repoPath);
  }

  assert(policy.includes("featureConveyorReviewSchema"));
  assert(policy.includes("currentFeatureConveyorPackets"));
  assert(
    current.currentDirectCheckSets.some(
      (entry) => entry.id === "m184-feature-conveyor-readiness",
    ),
    "current SDK state must include M184 feature conveyor readiness.",
  );
  assertIncludes(
    current.machineCheck.requiredCurrentSetIds,
    "m184-feature-conveyor-readiness",
    "current required set ids",
  );

  console.log("SDK AE Agent feature conveyor readiness smoke: pass");
}

if (require.main === module) {
  main();
}

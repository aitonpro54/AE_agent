"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function readText(repoPath) {
  return fs.readFileSync(path.join(repo, repoPath), "utf8");
}

function assertFileExists(repoPath) {
  assert(fs.existsSync(path.join(repo, repoPath)), `Expected file to exist: ${repoPath}`);
}

function assertIncludesAll(source, snippets, label) {
  for (const snippet of snippets) {
    assert(source.includes(snippet), `${label} must include: ${snippet}`);
  }
}

function main() {
  const contract = readJson(".codex-audit/sdk-roadmap-supervisor/199-roadmap-supervisor-contract.json");
  const readiness = readJson(".codex-audit/sdk-roadmap-supervisor/199-roadmap-supervisor-readiness.json");
  const governance = readJson(".codex-audit/sdk-roadmap-supervisor/199-roadmap-supervisor-governance.json");
  const queue = readJson(".codex-audit/sdk-roadmap-supervisor/199-roadmap-supervisor-queue.json");
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");
  const runner = readText("orchestrator/run-ae-agent-roadmap-supervisor.mjs");

  assert.strictEqual(contract.schema, "sdk-roadmap-supervisor-contract.v1");
  assert.strictEqual(readiness.schema, "sdk-roadmap-supervisor-readiness.v1");
  assert.strictEqual(governance.schema, "sdk-roadmap-supervisor-governance.v1");
  assert.strictEqual(queue.schema, "sdk-roadmap-supervisor-queue.v1");
  assert.deepStrictEqual(contract.numberingDecision.implementedAs, ["M199", "M200", "M201"]);
  assert.strictEqual(contract.approvalContract.defaultMaxItems, 3);
  assert.strictEqual(contract.approvalContract.defaultMaxMinutes, 180);
  assert.strictEqual(contract.approvalContract.hardMaxItems, 5);
  assert.strictEqual(contract.approvalContract.hardMaxMinutes, 300);
  assert.strictEqual(contract.executionModel.writerConcurrency, 1);
  assert.strictEqual(contract.executionModel.reviewerConcurrency, 2);
  assert.strictEqual(contract.executionModel.readOnlyLiveConnectivity, true);
  assert.strictEqual(readiness.readiness.liveCheckAvailable, true);
  assert.strictEqual(readiness.readiness.requireLiveConnectivityAvailable, true);
  assert.strictEqual(readiness.readiness.itemLiveValidationAvailable, true);
  assert.strictEqual(readiness.readiness.queueHashApprovalAvailable, true);
  assert.strictEqual(readiness.readiness.roadmapSdkRunnerAvailable, true);
  assert.strictEqual(readiness.readiness.roadmapSdkCliWriterFallbackAvailable, true);
  assert.strictEqual(readiness.readiness.singleApprovalChainAvailable, true);
  assert.strictEqual(governance.mustRemainFalse.autoPush, false);
  assert.strictEqual(governance.mustRemainFalse.dependencyChanges, false);
  assert.strictEqual(governance.mustRemainFalse.cepPanelSdkWrites, false);
  assert.strictEqual(governance.mustRemainFalse.parallelWriters, false);
  assert.strictEqual(readiness.readiness.autoCommitAfterValidation, true);
  assert.strictEqual(readiness.readiness.autoPush, false);
  assert.strictEqual(readiness.readiness.liveCepAeAllowedByDefault, false);

  for (const repoPath of [
    contract.runner.path,
    contract.runner.readinessSmoke,
    contract.runner.commandSmoke,
    readiness.contract,
    readiness.queue,
    ...governance.sourceArtifacts,
  ]) {
    assertFileExists(repoPath);
  }

  assert.strictEqual(
    packageJson.scripts?.["codex:orchestrator:ae-agent-roadmap-supervisor"],
    "node orchestrator/run-ae-agent-roadmap-supervisor.mjs",
  );
  assert.strictEqual(
    packageJson.scripts?.["codex:orchestrator:ae-agent-roadmap-supervisor-readiness:smoke"],
    "node scripts/sdk-ae-agent-roadmap-supervisor-readiness-smoke.js",
  );
  assert.strictEqual(
    packageJson.scripts?.["codex:orchestrator:ae-agent-roadmap-supervisor:smoke"],
    "node scripts/sdk-ae-agent-roadmap-supervisor-command-smoke.js",
  );

  assertIncludesAll(runner, [
    "DEFAULT_MAX_MINUTES = 180",
    "HARD_MAX_ITEMS = 5",
    "REVIEWER_LIMIT = 2",
    "buildSupervisorApprovalText",
    "queueSha256",
    "roadmap-sdk",
    "runRoadmapSdkWriter",
    "runRoadmapCliWriter",
    "model_reasoning_effort=\\\"high\\\"",
    "web_search",
    "liveCheck",
    "runLiveConnectivityCheck",
    "runItemLiveValidation",
    "requireLiveConnectivity",
    "runUntilBudget",
    "noLiveCepAeUnlessPerItemApproved=true",
    "Missing exact --live-approval-text",
    "Unsafe roadmap supervisor flag rejected",
  ], "roadmap supervisor runner");
  assertIncludesAll(readme, [
    "AE Agent roadmap supervisor",
    "codex:orchestrator:ae-agent-roadmap-supervisor",
    "sdk-roadmap-supervisor-contract.v1",
    "--live-check",
    "--require-live-connectivity",
    "queueSha256",
    "roadmap-sdk",
    "--engine cli",
    "single approval",
    "--run-until-budget",
    "noPush=true",
  ], "orchestrator README");

  console.log("SDK AE Agent roadmap supervisor readiness smoke: pass");
}

if (require.main === module) {
  main();
}

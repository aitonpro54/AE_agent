"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const PLAN_PATH =
  ".codex-audit/sdk-orchestrator-extraction/158-sdk-orchestrator-extraction-cleanup-plan.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function flattenCandidatePaths(plan) {
  return plan.classification.candidatesForArchiveSquashSummary.flatMap(
    (candidate) => candidate.paths || [],
  );
}

function flattenMustNotRemovePaths(plan) {
  return plan.classification.filesMustNotBeRemoved.flatMap((entry) => entry.paths || []);
}

function assertIncludes(list, value, label) {
  assert(Array.isArray(list), `${label} must be an array.`);
  assert(list.includes(value), `${label} must include ${value}.`);
}

function main() {
  const plan = readJson(PLAN_PATH);

  assert.strictEqual(plan.schema, "sdk-orchestrator-extraction-cleanup-plan.v1");
  assert.strictEqual(plan.milestone, 158);
  assert.strictEqual(plan.sourceContext.currentBoundary.sdkState, "controlled milestone conveyor, not general repo autopilot");
  assert.strictEqual(plan.sourceContext.currentBoundary.cepPanelSdkWritesEnabled, false);
  assert.strictEqual(plan.sourceContext.currentBoundary.cepPanelPanelJsEditableThroughSdk, false);
  assert.strictEqual(plan.sourceContext.currentBoundary.newSdkThreadOrNetworkProofApproved, false);
  assert.strictEqual(plan.sourceContext.currentBoundary.cleanupPerformed, false);
  assert.strictEqual(plan.sourceContext.currentBoundary.deletionPerformed, false);

  for (const bucket of plan.machineCheck.requiredBuckets) {
    assert(
      Array.isArray(plan.classification[bucket]) && plan.classification[bucket].length > 0,
      `${bucket} must be present and non-empty.`,
    );
  }

  const mustNotRemovePaths = flattenMustNotRemovePaths(plan);
  for (const required of [
    "orchestrator/run-write-capable-scaffold.mjs",
    ".codex-audit/sdk-production-readiness/152-sdk-production-code-provider-smokes-ready.json",
    ".codex-audit/sdk-milestone-conveyor/157-sdk-conveyor-commit-handoff-loop-gate.json",
    "scripts/provider-api-smoke.js",
    "scripts/provider-contract-smoke.js",
    "cep-panel/panel.js",
    "plans/target-app-execplan.md",
    ".codex/handoff.md",
  ]) {
    assertIncludes(mustNotRemovePaths, required, "filesMustNotBeRemoved paths");
  }

  for (const repoPath of plan.machineCheck.mustExist) {
    assert(fs.existsSync(path.join(repo, repoPath)), `machineCheck.mustExist missing: ${repoPath}`);
  }

  const candidatePaths = new Set(flattenCandidatePaths(plan));
  for (const currentPath of plan.machineCheck.currentEvidenceMustNotBeArchiveCandidates) {
    assert(
      !candidatePaths.has(currentPath),
      `current evidence must not be an archive/squash candidate: ${currentPath}`,
    );
  }

  for (const candidate of plan.classification.candidatesForArchiveSquashSummary) {
    assert.strictEqual(candidate.immediateAction, "none");
    assert(Array.isArray(candidate.safeOnlyAfter) && candidate.safeOnlyAfter.length >= 2);
  }

  for (const phase of plan.safeAeAgentCleanupPlan) {
    assert(Number.isInteger(phase.phase), "cleanup phase must have an integer phase number.");
    assert(Array.isArray(phase.actions) && phase.actions.length > 0);
    assert(Array.isArray(phase.exitCriteria) && phase.exitCriteria.length > 0);
  }

  assertIncludes(
    plan.recommendedStandaloneToolStructure.proposedTree,
    "src/core/operation-envelope.mjs",
    "standalone tool tree",
  );
  assertIncludes(
    plan.recommendedStandaloneToolStructure.proposedTree,
    "src/adapters/ae-agent-policy.example.json",
    "standalone tool tree",
  );

  for (const modulePath of plan.machineCheck.requiredStandaloneModules) {
    assertIncludes(
      plan.recommendedStandaloneToolStructure.proposedTree,
      modulePath,
      "required standalone modules",
    );
  }

  for (const forbidden of [
    "SDKThread/network proof",
    "CEP-panel SDK write",
    "edit cep-panel/panel.js through SDK",
    "live CEP/After Effects validation",
    "external-provider/OpenAI CLI planner validation",
    "mutating-live validation",
    "package install",
    "dependency change",
    "push",
  ]) {
    assertIncludes(plan.validationPlan.notRunByDesign, forbidden, "notRunByDesign");
  }

  console.log("SDK orchestrator extraction cleanup smoke: pass");
}

if (require.main === module) {
  main();
}

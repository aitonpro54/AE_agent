"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const ARTIFACT_PATH =
  ".codex-audit/sdk-milestone-conveyor/173-ae-agent-cleanup-conveyor-queue.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function readText(repoPath) {
  return fs.readFileSync(path.join(repo, repoPath), "utf8");
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

function byId(items, id) {
  return items.find((item) => item.id === id);
}

function assertQueuedLocalOnly(item) {
  assert.strictEqual(item.mode, "local-only", `${item.id} must be local-only.`);
  assert.strictEqual(item.approvalRequired, false, `${item.id} must not require approval.`);
  assert.strictEqual(item.explicitApprovalText, null, `${item.id} must not carry approval text.`);
  assert.strictEqual(item.maxSdkThreadRuns, 0, `${item.id} must not allow SDKThread runs.`);
  assert.strictEqual(item.status, "queued", `${item.id} must remain queued.`);
  assert(Array.isArray(item.plannedPaths) && item.plannedPaths.length > 0);
  assertIncludes(item.stopGates, "validation-failed", `${item.id} stop gates`);
  assertIncludes(item.stopGates, "context-pressure", `${item.id} stop gates`);
}

function main() {
  const artifact = readJson(ARTIFACT_PATH);
  const previous = readJson(artifact.sourceContext.previousArtifact);
  const baseSpec = readJson(artifact.sourceContext.baseConveyorSpec);
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");

  assert.strictEqual(artifact.schema, "sdk-ae-agent-cleanup-conveyor-queue.v1");
  assert.strictEqual(artifact.milestone, 173);
  assert.strictEqual(previous.schema, "sdk-adapter-interface-design-review.v1");
  assert.strictEqual(baseSpec.schema, "sdk-milestone-conveyor-spec.v1");
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.queueOnly, true);
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.localOnly, true);

  for (const flag of artifact.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      artifact.sourceContext.behaviorBoundary[flag],
      false,
      `${flag} must remain false.`,
    );
  }

  assert.strictEqual(artifact.queueContract.defaultMode, "local-only");
  assert.strictEqual(artifact.queueContract.defaultApprovalRequired, false);
  assert.strictEqual(artifact.queueContract.defaultMaxSdkThreadRuns, 0);
  for (const blocked of [
    "SDKThread/network proof",
    "CEP-panel SDK write",
    "live CEP/After Effects validation",
    "mutating-live validation",
    "archive/delete/squash cleanup",
    "push",
    "PR creation",
  ]) {
    assertIncludes(artifact.queueContract.notAnApprovalFor, blocked, "notAnApprovalFor");
    assertIncludes(
      artifact.nextRecommendedState.blockedWorkWithoutSeparateApproval,
      blocked,
      "blockedWorkWithoutSeparateApproval",
    );
  }

  assert.deepStrictEqual(
    artifact.queueItems.map((item) => item.id),
    [
      "m174-roadmap-active-state-split",
      "m175-runtime-artifact-cleanup-note",
      "m176-sdk-current-history-split",
      "m177-sdk-smoke-consolidation-plan",
    ],
  );

  for (const item of artifact.queueItems) {
    assertQueuedLocalOnly(item);
  }

  const roadmap = byId(artifact.queueItems, "m174-roadmap-active-state-split");
  assertIncludes(roadmap.plannedPaths, "plans/target-app-execplan.md", "M174 planned paths");
  assertIncludes(
    roadmap.plannedPaths,
    "plans/archive/target-app-execplan-history-2026-05.md",
    "M174 planned paths",
  );
  assertIncludes(
    roadmap.allowedActions,
    "move historical milestone detail into an archive file instead of deleting it",
    "M174 allowed actions",
  );
  assertIncludes(
    roadmap.forbiddenActions,
    "change CEP panel, bridge, provider, or AE runtime behavior",
    "M174 forbidden actions",
  );

  const runtime = byId(artifact.queueItems, "m175-runtime-artifact-cleanup-note");
  for (const dir of ["backups/", "logs/", "snapshots/", ".codex-runtime/", "pro-review-bundles/"]) {
    assertIncludes(runtime.affectedIgnoredRuntimeDirs, dir, "M175 affected runtime dirs");
  }
  assertIncludes(
    runtime.forbiddenActions,
    "delete ignored runtime artifacts",
    "M175 forbidden actions",
  );
  assertIncludes(
    runtime.stopGates,
    "external-archive-move-needs-approval",
    "M175 stop gates",
  );

  const split = byId(artifact.queueItems, "m176-sdk-current-history-split");
  assertIncludes(split.plannedPaths, ".codex-audit/sdk-current-state.json", "M176 planned paths");
  assertIncludes(split.plannedPaths, ".codex-audit/sdk-history-index.json", "M176 planned paths");
  assertIncludes(
    split.forbiddenActions,
    "enable CEP-panel SDK writes",
    "M176 forbidden actions",
  );

  const consolidate = byId(artifact.queueItems, "m177-sdk-smoke-consolidation-plan");
  assertIncludes(
    consolidate.plannedPaths,
    ".codex-audit/sdk-smoke-consolidation-plan.json",
    "M177 planned paths",
  );
  assertIncludes(
    consolidate.allowedActions,
    "keep existing milestone-specific smokes until replacement coverage is green",
    "M177 allowed actions",
  );
  assertIncludes(
    consolidate.forbiddenActions,
    "delete old smoke scripts before replacement coverage passes",
    "M177 forbidden actions",
  );

  for (const gate of [
    "one-queue-item-per-milestone",
    "no-sdkthread-without-fresh-explicit-approval",
    "no-live-cep-ae-without-fresh-explicit-approval",
    "no-runtime-artifact-delete-or-move-without-fresh-explicit-approval",
    "no-push-by-default",
    "context-pressure",
  ]) {
    assertIncludes(artifact.globalStopGates, gate, "global stop gates");
  }

  assert.strictEqual(
    packageJson.scripts?.[artifact.machineCheck.requiredPackageScript],
    artifact.machineCheck.requiredPackageScriptCommand,
  );

  for (const [repoPath, snippets] of Object.entries(artifact.machineCheck.requiredSourceSnippets)) {
    assertIncludesAll(readText(repoPath), snippets, repoPath);
  }

  assertIncludesAll(readme, artifact.machineCheck.requiredReadmeSnippets, "README");

  console.log("SDK AE Agent cleanup conveyor queue smoke: pass");
}

if (require.main === module) {
  main();
}

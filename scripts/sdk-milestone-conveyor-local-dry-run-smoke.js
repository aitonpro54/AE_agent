"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const PROOF_PATH =
  ".codex-audit/sdk-milestone-conveyor/155-sdk-milestone-conveyor-local-dry-run.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function findScope(spec, scope) {
  return spec.allowedScopes.find((entry) => entry.scope === scope);
}

function matchesAllowlist(repoPath, pattern) {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -"/**".length);
    return repoPath === prefix || repoPath.startsWith(`${prefix}/`);
  }
  return repoPath === pattern;
}

function pathsAllowed(plannedPaths, allowlist) {
  return plannedPaths.every((plannedPath) =>
    allowlist.some((pattern) => matchesAllowlist(plannedPath, pattern)),
  );
}

function simulateQueueItem(spec, queueItem) {
  const scope = findScope(spec, queueItem.scope);
  const scopeAllowed = Boolean(scope?.modes.includes(queueItem.mode));
  const plannedPathsAllowed = Boolean(
    scope && pathsAllowed(queueItem.plannedPaths, scope.plannedPathAllowlist),
  );

  if (!scopeAllowed || !plannedPathsAllowed) {
    return {
      schema: "sdk-milestone-conveyor-local-state.v1",
      queueItemId: queueItem.id,
      sourceSpecSchema: spec.schema,
      dryRun: true,
      deterministic: true,
      status: "stopped",
      stopGate: "scope-or-path-outside-allowlist",
      stopReason: "queue item scope, mode, or planned paths are outside the conveyor allowlist",
      scopeAllowed,
      plannedPathsAllowed,
      wouldInvokeRunner: false,
      sdkThreadCreated: false,
      networkAccessed: false,
      operationFileWritten: false,
      changedPaths: [],
      autoCommit: false,
      autoPush: false,
      nextAction: "Correct the queue item or stop the milestone.",
    };
  }

  if (queueItem.mode === "sdk-write" && !queueItem.explicitApprovalText) {
    return {
      schema: "sdk-milestone-conveyor-local-state.v1",
      queueItemId: queueItem.id,
      sourceSpecSchema: spec.schema,
      dryRun: true,
      deterministic: true,
      status: "stopped",
      stopGate: "no-explicit-approval",
      stopReason: "sdk-write queue item is missing explicitApprovalText",
      scopeAllowed,
      plannedPathsAllowed,
      wouldInvokeRunner: false,
      sdkThreadCreated: false,
      networkAccessed: false,
      operationFileWritten: false,
      changedPaths: [],
      autoCommit: false,
      autoPush: false,
      nextAction: "Record exact explicit approval before creating an operation file or invoking SDKThread.",
    };
  }

  return {
    schema: "sdk-milestone-conveyor-local-state.v1",
    queueItemId: queueItem.id,
    sourceSpecSchema: spec.schema,
    dryRun: true,
    deterministic: true,
    status: "ready-local-only",
    stopGate: null,
    stopReason: null,
    scopeAllowed,
    plannedPathsAllowed,
    wouldInvokeRunner: false,
    sdkThreadCreated: false,
    networkAccessed: false,
    operationFileWritten: false,
    changedPaths: [],
    autoCommit: false,
    autoPush: false,
    nextAction: "Dry-run complete; a separate approved milestone must invoke any real runner.",
  };
}

function assertRequiredQueueFields(spec, queueItem) {
  for (const field of spec.queueItemSchema.requiredFields) {
    assert(
      Object.prototype.hasOwnProperty.call(queueItem, field),
      `Queue item is missing required field: ${field}`,
    );
  }
}

function main() {
  const proof = readJson(PROOF_PATH);
  const spec = readJson(proof.sourceSpec);

  assert.strictEqual(proof.schema, "sdk-milestone-conveyor-local-dry-run-proof.v1");
  assert.strictEqual(proof.milestone, 155);
  assert.strictEqual(proof.localOnly, true);
  assert.strictEqual(proof.sdkThreadAllowed, false);
  assert.strictEqual(proof.networkAllowed, false);

  assert.strictEqual(spec.schema, "sdk-milestone-conveyor-spec.v1");
  assertRequiredQueueFields(spec, proof.queueItem);
  assert.strictEqual(proof.queueItem.scope, "docs-audit");
  assert.strictEqual(proof.queueItem.mode, "sdk-write");
  assert.strictEqual(proof.queueItem.approvalRequired, true);
  assert.strictEqual(proof.queueItem.explicitApprovalText, null);
  assert.strictEqual(proof.queueItem.maxSdkThreadRuns, 1);
  assert.deepStrictEqual(proof.queueItem.plannedPaths, [
    ".codex-audit/sdk-milestone-conveyor/156-sdk-conveyor-sdkthread-proof.json",
  ]);

  const localState = simulateQueueItem(spec, proof.queueItem);
  assert.deepStrictEqual(localState, proof.expectedLocalState);
  assert.strictEqual(localState.status, "stopped");
  assert.strictEqual(localState.stopGate, "no-explicit-approval");
  assert.strictEqual(localState.wouldInvokeRunner, false);
  assert.strictEqual(localState.sdkThreadCreated, false);
  assert.strictEqual(localState.networkAccessed, false);
  assert.strictEqual(localState.operationFileWritten, false);
  assert.deepStrictEqual(localState.changedPaths, []);
  assert.strictEqual(localState.autoCommit, false);
  assert.strictEqual(localState.autoPush, false);

  for (const required of [
    "scope: docs-audit",
    "mode: sdk-write",
    "planned path: .codex-audit/sdk-milestone-conveyor/156-sdk-conveyor-sdkthread-proof.json",
    "maxSdkThreadRuns: 1",
    "no retry on disconnect/failure",
  ]) {
    assert(
      proof.approvalFieldsRequiredBeforeSdkThread.includes(required),
      `Missing approval requirement: ${required}`,
    );
  }

  for (const forbidden of [
    "SDKThread creation",
    "network access",
    "operation file write",
    "CEP-panel SDK write",
    "production-code SDK write",
    "external-provider/OpenAI CLI planner validation",
    "mutating-live validation",
    "package install or dependency change",
    "push",
  ]) {
    assert(proof.notPerformed.includes(forbidden), `Proof must not perform: ${forbidden}`);
  }

  console.log("SDK milestone conveyor local dry-run smoke: pass");
}

if (require.main === module) {
  main();
}

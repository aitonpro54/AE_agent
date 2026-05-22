"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const SPEC_PATH =
  ".codex-audit/sdk-milestone-conveyor/154-sdk-milestone-conveyor-spec.json";
const DRY_RUN_PATH =
  ".codex-audit/sdk-milestone-conveyor/155-sdk-milestone-conveyor-local-dry-run.json";
const PROOF_PATH =
  ".codex-audit/sdk-milestone-conveyor/156-sdk-conveyor-sdkthread-proof.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function main() {
  const spec = readJson(SPEC_PATH);
  const dryRun = readJson(DRY_RUN_PATH);
  const proof = readJson(PROOF_PATH);

  assert.strictEqual(spec.schema, "sdk-milestone-conveyor-spec.v1");
  assert.deepStrictEqual(spec.m154SeriesBoundary.allowedSdkThreadProofs, [
    {
      milestone: 156,
      scope: "docs-audit",
      mode: "sdk-write",
      maxSdkThreadRuns: 1,
      plannedPathAllowlist: [".codex-audit/sdk-milestone-conveyor/**"],
    },
  ]);

  assert.strictEqual(dryRun.schema, "sdk-milestone-conveyor-local-dry-run-proof.v1");
  assert.strictEqual(dryRun.expectedLocalState.stopGate, "no-explicit-approval");
  assert.strictEqual(dryRun.expectedLocalState.sdkThreadCreated, false);
  assert.strictEqual(dryRun.expectedLocalState.networkAccessed, false);
  assert.strictEqual(dryRun.expectedLocalState.operationFileWritten, false);

  assert.strictEqual(proof.schema, "sdk-milestone-conveyor-sdkthread-proof.v1");
  assert.strictEqual(proof.operationId, "m156-sdk-milestone-conveyor-docs-audit-proof");
  assert.strictEqual(proof.milestone, 156);
  assert.strictEqual(proof.scope, "docs-audit");
  assert.strictEqual(proof.mode, "sdk-write");
  assert.strictEqual(proof.plannedPath, PROOF_PATH);
  assert.strictEqual(proof.proofStatus, "completed");
  assert.strictEqual(proof.sdkThreadCreated, true);
  assert.strictEqual(proof.networkUsed, true);
  assert.strictEqual(proof.autoPush, false);
  assert(Array.isArray(proof.evidence), "Proof evidence must be an array.");
  assert.strictEqual(proof.evidence.length, 1);
  assert.match(proof.evidence[0], /only the planned docs-audit conveyor proof artifact/);

  for (const forbidden of [
    "CEP-panel SDK writes",
    "editing cep-panel/panel.js through SDK",
    "production-code SDK writes",
    "production-code allowlist expansion",
    "live CEP/AE checks",
    "external-provider/OpenAI CLI planner",
    "mutating-live validation",
    "package install or dependency changes",
    "push",
  ]) {
    assert(
      spec.m154SeriesBoundary.notApproved.includes(forbidden),
      `M156 proof must not relax boundary: ${forbidden}`,
    );
  }

  console.log("SDK milestone conveyor SDKThread proof smoke: pass");
}

if (require.main === module) {
  main();
}

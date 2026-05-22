"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const BOUNDARY_PATH = path.join(
  repo,
  ".codex-audit",
  "sdk-post-multi-file-readiness",
  "150-sdk-post-multi-file-governance-boundary.json",
);

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function findExclusion(artifact, id) {
  const match = artifact.remainingExclusions.find((item) => item.id === id);
  assert(match, `Missing remaining exclusion: ${id}`);
  return match;
}

function evidenceById(artifact, id) {
  const match = artifact.validatedNarrowEvidence.find((item) => item.id === id);
  assert(match, `Missing validated evidence: ${id}`);
  return match;
}

function main() {
  const boundary = JSON.parse(fs.readFileSync(BOUNDARY_PATH, "utf8"));
  const launchReadiness = readJson(boundary.sourceArtifacts.launchReadinessSummary);
  const productionReadiness = readJson(boundary.sourceArtifacts.productionReadiness);
  const iterativeReliability = readJson(boundary.sourceArtifacts.iterativeCommandReliability);
  const multiFileContract = readJson(boundary.sourceArtifacts.multiFilePlannedContract);
  const multiFileProof = readJson(boundary.sourceArtifacts.multiFileRealProof);

  assert.strictEqual(boundary.schema, "sdk-post-multi-file-governance-boundary.v1");
  assert.strictEqual(boundary.milestone, 150);
  assert.strictEqual(boundary.verdict.overall, "post-multi-file-local-gated");
  assert.strictEqual(boundary.verdict.productionReady, false);
  assert.strictEqual(boundary.verdict.narrowProductionCodeLane, "production-ready");
  assert.strictEqual(boundary.verdict.multiFileOrchestratorFixtureLane, "proof-passed-local-gated");
  assert.strictEqual(boundary.verdict.generalSdkWorkflow, "not-production-ready");
  assert.match(boundary.verdict.reason, /does not approve general SDK repo-edit autonomy/);

  assert.strictEqual(launchReadiness.schema, "sdk-launch-readiness-summary.v1");
  assert.strictEqual(launchReadiness.verdict.generalSdkWorkflow, "not-production-ready");
  assert.strictEqual(productionReadiness.schema, "sdk-production-readiness.v1");
  assert.strictEqual(productionReadiness.verdict.overall, "narrow-lane-production-ready");
  assert.strictEqual(productionReadiness.verdict.productionReady, true);
  assert.deepStrictEqual(productionReadiness.claimedScope.plannedPathAllowlist, [
    "scripts/provider-contract-smoke.js",
  ]);

  assert.strictEqual(iterativeReliability.schema, "sdk-iterative-cmd-reliability-gate.v1");
  assert.strictEqual(iterativeReliability.verdict.iterativeCmdReliability, "passed");
  assert.strictEqual(iterativeReliability.verdict.generalSdkWorkflow, "not-production-ready");
  assert.strictEqual(multiFileContract.schema, "sdk-multi-file-planned-operation-contract.v1");
  assert.strictEqual(multiFileContract.verdict.multiFilePlannedOperationContract, "local-pass");
  assert.strictEqual(multiFileContract.verdict.sdkThreadProofRun, false);
  assert.strictEqual(multiFileProof.schema, "sdk-multi-file-real-proof-gate.v1");
  assert.strictEqual(multiFileProof.verdict.multiFileSdkThreadProof, "passed");
  assert.strictEqual(multiFileProof.verdict.generalSdkWorkflow, "not-production-ready");

  assert.deepStrictEqual(evidenceById(boundary, "m146-production-code-single-file").plannedPaths, [
    "scripts/provider-contract-smoke.js",
  ]);
  assert.deepStrictEqual(
    evidenceById(boundary, "m147-iterative-command-single-fixture").plannedPaths,
    iterativeReliability.operation.plannedPaths,
  );
  assert.deepStrictEqual(
    evidenceById(boundary, "m148-multi-file-local-contract").plannedPaths,
    multiFileContract.operation.plannedPaths,
  );
  assert.deepStrictEqual(
    evidenceById(boundary, "m149-multi-file-real-proof").plannedPaths,
    multiFileProof.operation.plannedPaths,
  );

  assert.deepStrictEqual(boundary.currentBoundary.allowedProductionReadyClaims, [
    "production-code:scripts/provider-contract-smoke.js",
  ]);
  assert(
    boundary.currentBoundary.mustNotClaim.includes(
      "general SDK autopilot repo edits are production-ready",
    ),
    "M150 boundary must forbid general SDK production-ready claims.",
  );
  assert(
    boundary.currentBoundary.mustNotClaim.includes(
      "CEP-panel SDK writes are enabled or production-ready",
    ),
    "M150 boundary must keep CEP-panel SDK writes disabled.",
  );

  assert.strictEqual(findExclusion(boundary, "general-sdk-workflow").status, "not-production-ready");
  assert.strictEqual(
    findExclusion(boundary, "broader-production-code-sdk-writes").status,
    "not-production-ready",
  );
  assert.strictEqual(
    findExclusion(boundary, "cep-panel-sdk-writes").status,
    "not-production-ready",
  );
  assert.strictEqual(
    findExclusion(boundary, "external-provider-or-openai-cli-planner-validation").status,
    "not-run",
  );
  assert.strictEqual(
    findExclusion(boundary, "live-cep-ae-or-mutating-live-validation").status,
    "not-run",
  );
  assert.strictEqual(
    findExclusion(boundary, "package-install-or-dependency-changes").status,
    "not-run",
  );
  assert.strictEqual(boundary.nextRecommendedMilestone.id, "M151");

  console.log("SDK post-multi-file governance smoke: pass");
}

if (require.main === module) {
  main();
}

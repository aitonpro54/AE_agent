"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const PRODUCTION_READINESS_PATH = path.join(
  repo,
  ".codex-audit",
  "sdk-production-readiness",
  "146-sdk-production-ready.json",
);
const LAUNCH_READINESS_PATH = path.join(
  repo,
  ".codex-audit",
  "sdk-launch-readiness",
  "144-sdk-launch-readiness-summary.json",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function findExclusion(artifact, id) {
  const match = artifact.remainingExclusions.find((item) => item.id === id);
  assert(match, `Missing remaining exclusion: ${id}`);
  return match;
}

function main() {
  const artifact = readJson(PRODUCTION_READINESS_PATH);
  const launchReadiness = readJson(LAUNCH_READINESS_PATH);

  assert.strictEqual(artifact.schema, "sdk-production-readiness.v1");
  assert.strictEqual(
    artifact.supersedes,
    ".codex-audit/sdk-production-readiness/145-sdk-production-ready.json",
  );
  assert.strictEqual(
    artifact.sourceLaunchReadinessSummary,
    ".codex-audit/sdk-launch-readiness/144-sdk-launch-readiness-summary.json",
  );
  assert.strictEqual(
    artifact.sourceGovernanceReportSchema,
    launchReadiness.sourceGovernanceReportSchema,
  );
  assert.strictEqual(artifact.productionReadyDefinition, "narrow-lane-production-ready");

  assert.deepStrictEqual(artifact.claimedScope, {
    scope: "production-code",
    plannedPathAllowlist: ["scripts/provider-contract-smoke.js"],
    generalSdkWorkflowIncluded: false,
    broaderProductionCodeWritesIncluded: false,
    cepPanelWritesIncluded: false,
  });

  assert.strictEqual(artifact.verdict.productionReady, true);
  assert.strictEqual(artifact.verdict.overall, "narrow-lane-production-ready");
  assert.strictEqual(artifact.verdict.narrowProductionCodeLane, "production-ready");
  assert.strictEqual(artifact.verdict.generalSdkWorkflow, "not-production-ready");
  assert.match(artifact.verdict.reason, /bounded M146 SDKThread\/network proof completed/);

  assert.deepStrictEqual(artifact.completedProof.plannedPaths, [
    "scripts/provider-contract-smoke.js",
  ]);
  assert.strictEqual(artifact.completedProof.scope, "production-code");
  assert.strictEqual(artifact.completedProof.mode, "sdk-write");
  assert.strictEqual(artifact.completedProof.localEnvelopeValidation.allowed, true);
  assert.deepStrictEqual(artifact.completedProof.localEnvelopeValidation.violations, []);
  assert.strictEqual(artifact.completedProof.sdkThreadCreated, true);
  assert.strictEqual(artifact.completedProof.sdkThreadCompleted, true);
  assert.strictEqual(artifact.completedProof.sdkThreadId, "019e4abe-638f-7bc1-901d-5bd7bbbbd6bf");
  assert.strictEqual(artifact.completedProof.plannedFileChangedBySdk, true);
  assert.strictEqual(artifact.completedProof.sdkWritePostContract.verdict, "pass");
  assert.deepStrictEqual(artifact.completedProof.sdkWritePostContract.actualChangedFiles, [
    "scripts/provider-contract-smoke.js",
  ]);
  assert.deepStrictEqual(artifact.completedProof.sdkWritePostContract.outOfScopeFiles, []);
  assert.deepStrictEqual(artifact.completedProof.sdkWritePostContract.missingPlannedChanges, []);
  assert.strictEqual(artifact.completedProof.plannedPathPrecondition.mode, "existing-source-update");

  assert.strictEqual(artifact.approval.userApprovalRecorded, true);
  assert.match(artifact.approval.restrictedScope, /one bounded SDKThread\/network proof/);

  const localEvidenceIds = artifact.localEvidence.map((item) => item.id);
  assert.deepStrictEqual(localEvidenceIds, [
    "m146-local-preflight-governance-report",
    "m146-local-preflight-production-readiness-smoke",
    "m146-local-preflight-check-rules",
  ]);
  for (const item of artifact.localEvidence) {
    assert.strictEqual(item.status, "pass", `Local evidence did not pass: ${item.id}`);
  }

  assert(
    artifact.requiredBeforeGeneralSdkProductionReady.some((item) =>
      item.includes("general SDK autopilot repo edits"),
    ),
    "Artifact must keep general SDK production readiness gated.",
  );
  assert(
    artifact.requiredBeforeGeneralSdkProductionReady.some((item) =>
      item.includes("CEP-panel SDK writes"),
    ),
    "Artifact must keep CEP-panel SDK writes gated.",
  );

  assert.strictEqual(
    findExclusion(artifact, "general-sdk-autopilot-repo-edits").status,
    "not-production-ready",
  );
  assert.strictEqual(
    findExclusion(artifact, "broader-production-code-sdk-writes").status,
    "not-production-ready",
  );
  assert.strictEqual(
    findExclusion(artifact, "cep-panel-sdk-writes").status,
    "not-production-ready",
  );
  assert.strictEqual(
    findExclusion(artifact, "external-provider-or-openai-cli-planner-validation").status,
    "not-run",
  );
  assert.strictEqual(
    findExclusion(artifact, "live-cep-ae-or-mutating-live-validation").status,
    "not-run",
  );
  assert.strictEqual(
    findExclusion(artifact, "package-install-or-dependency-changes").status,
    "not-run",
  );

  console.log("SDK production readiness smoke: pass");
}

if (require.main === module) {
  main();
}

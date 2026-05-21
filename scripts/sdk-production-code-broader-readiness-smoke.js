"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const PROOF_REPO_PATH =
  ".codex-audit/sdk-production-readiness/152-sdk-production-code-provider-smokes-ready.json";
const EXPECTED_PLANNED_PATHS = [
  "scripts/provider-api-smoke.js",
  "scripts/provider-contract-smoke.js",
];

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function assertExpectedPaths(actual, message) {
  assert.deepStrictEqual(actual, EXPECTED_PLANNED_PATHS, message);
}

function findExclusion(artifact, id) {
  const match = artifact.remainingExclusions.find((item) => item.id === id);
  assert(match, `Missing remaining exclusion: ${id}`);
  return match;
}

function main() {
  const artifact = readJson(PROOF_REPO_PATH);
  const governance = readJson(artifact.sourceGovernancePacket);
  const enablement = readJson(artifact.sourceEnablementPacket);
  const review = readJson(artifact.sourceReviewPacket);
  const readiness = readJson(artifact.sourceReadinessPacket);
  const approvalDecision = readJson(artifact.sourceApprovalDecisionPacket);

  assert.strictEqual(artifact.schema, "sdk-production-code-broader-readiness.v1");
  assert.strictEqual(artifact.milestone, 152);
  assert.strictEqual(
    artifact.supersedes,
    ".codex-audit/sdk-production-readiness/146-sdk-production-ready.json",
  );
  assert.strictEqual(artifact.productionReadyDefinition, "two-file-provider-smoke-production-code-ready");

  assert.deepStrictEqual(artifact.claimedScope, {
    scope: "production-code",
    plannedPathAllowlist: EXPECTED_PLANNED_PATHS,
    providerSmokeFilesIncluded: true,
    generalSdkWorkflowIncluded: false,
    broadProductionCodeWritesIncluded: false,
    cepPanelWritesIncluded: false,
    externalProviderOrOpenAiCliPlannerValidationIncluded: false,
    liveCepAeOrMutatingLiveValidationIncluded: false,
    dependencyChangesIncluded: false,
  });

  assert.strictEqual(artifact.verdict.productionReady, true);
  assert.strictEqual(artifact.verdict.overall, "two-file-provider-smoke-lane-ready");
  assert.strictEqual(artifact.verdict.productionCodeProviderSmokeLane, "production-ready");
  assert.strictEqual(
    artifact.verdict.narrowProductionCodeLane,
    "superseded-by-two-file-provider-smoke-lane",
  );
  assert.strictEqual(artifact.verdict.generalSdkWorkflow, "not-production-ready");
  assert.match(artifact.verdict.reason, /bounded M152 SDKThread\/network proof completed/);
  assert.match(artifact.verdict.reason, /General SDK workflow/);

  assert.strictEqual(
    artifact.completedProof.operationId,
    "m152-production-code-provider-smokes-broader-proof",
  );
  assert.strictEqual(
    artifact.completedProof.operationFile,
    ".codex-runtime/sdk/operations/m152-production-code-provider-smokes-broader-proof.json",
  );
  assert.strictEqual(
    artifact.completedProof.runtimeLog,
    ".codex/sdk/logs/2026-05-21T18-39-26-878Z-m152-production-code-provider-smokes-broader-proof-sdk-write.json",
  );
  assert.strictEqual(artifact.completedProof.scope, "production-code");
  assert.strictEqual(artifact.completedProof.mode, "sdk-write");
  assertExpectedPaths(artifact.completedProof.plannedPaths, "Unexpected proof planned paths.");
  assert.strictEqual(artifact.completedProof.localEnvelopeValidation.allowed, true);
  assert.deepStrictEqual(artifact.completedProof.localEnvelopeValidation.violations, []);
  assert.strictEqual(artifact.completedProof.sdkThreadCreated, true);
  assert.strictEqual(artifact.completedProof.sdkThreadCompleted, true);
  assert.strictEqual(artifact.completedProof.sdkThreadId, "019e4bd4-abe1-7fa3-944f-e962361bee9f");
  assert.strictEqual(artifact.completedProof.plannedFileChangedBySdk, true);
  assert.strictEqual(artifact.completedProof.sdkWritePostContract.verdict, "pass");
  assertExpectedPaths(
    artifact.completedProof.sdkWritePostContract.actualChangedFiles,
    "Unexpected proof changed files.",
  );
  assert.deepStrictEqual(artifact.completedProof.sdkWritePostContract.outOfScopeFiles, []);
  assert.deepStrictEqual(artifact.completedProof.sdkWritePostContract.missingPlannedChanges, []);
  assert.strictEqual(artifact.completedProof.plannedPathPrecondition.mode, "existing-source-update");
  assertExpectedPaths(
    artifact.completedProof.plannedPathPrecondition.existingPlannedPaths,
    "Unexpected proof existing planned paths.",
  );
  assert.deepStrictEqual(artifact.completedProof.plannedPathPrecondition.missingPlannedPaths, []);
  assert.strictEqual(artifact.completedProof.threadOptions.approvalPolicy, "never");
  assert.strictEqual(artifact.completedProof.threadOptions.networkAccessEnabled, false);
  assert.strictEqual(artifact.completedProof.threadOptions.webSearchMode, "disabled");
  assert.strictEqual(artifact.completedProof.postDiffCheck.ok, true);

  assert.strictEqual(artifact.approval.userApprovalRecorded, true);
  assert.strictEqual(
    artifact.approval.approvalRecordSource,
    ".codex-audit/sdk-write-lane-approval-decisions/152-production-code-provider-smokes-approval-decision.json",
  );
  assert.match(artifact.approval.restrictedScope, /scripts\/provider-api-smoke\.js/);
  assert.match(artifact.approval.restrictedScope, /scripts\/provider-contract-smoke\.js/);

  assert.deepStrictEqual(
    artifact.sdkChanges.map((item) => item.path),
    EXPECTED_PLANNED_PATHS,
  );
  assert.match(artifact.sdkChanges[0].summary, /Gemini request content role remains user/);
  assert.match(artifact.sdkChanges[1].summary, /OpenAI API provider exposes uiModes/);

  const localEvidenceIds = artifact.localEvidence.map((item) => item.id);
  assert.deepStrictEqual(localEvidenceIds, [
    "m152-local-preflight-node-checks",
    "m152-local-preflight-write-scaffold-contract",
    "m152-local-preflight-operation-envelope",
    "m152-local-preflight-governance-report",
    "m152-sdkthread-proof",
  ]);
  for (const item of artifact.localEvidence) {
    assert.strictEqual(item.status, "pass", `Local evidence did not pass: ${item.id}`);
  }

  assert.strictEqual(
    findExclusion(artifact, "general-sdk-autopilot-repo-edits").status,
    "not-production-ready",
  );
  assert.strictEqual(
    findExclusion(artifact, "production-code-outside-provider-smokes").status,
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

  assert.strictEqual(governance.schema, "sdk-launch-governance.v1");
  assert.strictEqual(governance.state, "local-gated");
  assert.deepStrictEqual(governance.productionCodePlannedPathAllowlist, EXPECTED_PLANNED_PATHS);
  assert.strictEqual(governance.cepPanelSdkWriteEnabled, false);
  assert.strictEqual(governance.newSdkThreadRunApproved, false);
  assert.strictEqual(governance.broadProductionCodeWritesApproved, false);
  assert.strictEqual(governance.externalNetworkRetryApproved, false);

  assert.strictEqual(enablement.schema, "sdk-write-lane-enablement.v1");
  assert.strictEqual(enablement.approvalState, "approved");
  assert.strictEqual(enablement.explicitApprovalRecorded, true);
  assert.strictEqual(enablement.scope, "production-code");
  assert.strictEqual(enablement.sdkWriteEnabled, true);
  assert.deepStrictEqual(enablement.plannedPathAllowlist, EXPECTED_PLANNED_PATHS);

  assert.strictEqual(review.schema, "sdk-scope-expansion-review.v1");
  assert.strictEqual(review.decision, "approved");
  assert.strictEqual(review.sdkWriteEnabled, false);
  assert.deepStrictEqual(review.plannedPathAllowlist, EXPECTED_PLANNED_PATHS);

  assert.strictEqual(readiness.schema, "sdk-write-lane-readiness.v1");
  assert.strictEqual(readiness.readiness, "ready-for-approval");
  assert.strictEqual(readiness.approvalState, "pending-explicit-approval");
  assert.strictEqual(readiness.sdkWriteEnabled, false);
  assert.deepStrictEqual(readiness.plannedPathAllowlist, EXPECTED_PLANNED_PATHS);

  assert.strictEqual(approvalDecision.schema, "sdk-write-lane-approval-decision.v1");
  assert.strictEqual(approvalDecision.approvalState, "approved");
  assert.strictEqual(approvalDecision.explicitApprovalRecorded, true);
  assert.strictEqual(approvalDecision.sdkWriteEnabled, false);
  assert.deepStrictEqual(approvalDecision.plannedPathAllowlist, EXPECTED_PLANNED_PATHS);

  console.log("SDK production-code broader readiness smoke: pass");
}

if (require.main === module) {
  main();
}

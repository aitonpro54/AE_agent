"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const PRODUCTION_READINESS_PATH = path.join(
  repo,
  ".codex-audit",
  "sdk-production-readiness",
  "145-sdk-production-ready.json",
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

  assert.strictEqual(artifact.verdict.productionReady, false);
  assert.strictEqual(artifact.verdict.overall, "blocked-by-escalation-policy");
  assert.strictEqual(artifact.verdict.narrowProductionCodeLane, "blocked-not-production-ready");
  assert.strictEqual(artifact.verdict.generalSdkWorkflow, "not-production-ready");
  assert.match(artifact.verdict.reason, /SDKThread\/network attempt was rejected/);

  assert.deepStrictEqual(artifact.plannedProof.plannedPaths, [
    "scripts/provider-contract-smoke.js",
  ]);
  assert.strictEqual(artifact.plannedProof.scope, "production-code");
  assert.strictEqual(artifact.plannedProof.mode, "sdk-write");
  assert.strictEqual(artifact.plannedProof.localEnvelopeValidation.allowed, true);
  assert.deepStrictEqual(artifact.plannedProof.localEnvelopeValidation.violations, []);

  assert.strictEqual(artifact.restrictedActionAttempt.userApprovalRecorded, true);
  assert.strictEqual(artifact.restrictedActionAttempt.escalationRequested, true);
  assert.strictEqual(artifact.restrictedActionAttempt.escalationReviewerDecision, "rejected");
  assert.strictEqual(artifact.restrictedActionAttempt.rejectionClass, "unacceptable-risk");
  assert.strictEqual(artifact.restrictedActionAttempt.sdkThreadCreated, false);
  assert.strictEqual(artifact.restrictedActionAttempt.sdkThreadCompleted, false);
  assert.strictEqual(artifact.restrictedActionAttempt.realWriteWork, false);

  const localEvidenceIds = artifact.localEvidence.map((item) => item.id);
  assert.deepStrictEqual(localEvidenceIds, [
    "m145-local-preflight-governance-report",
    "m145-local-preflight-launch-readiness-smoke",
    "m145-local-preflight-check-rules",
  ]);
  for (const item of artifact.localEvidence) {
    assert.strictEqual(item.status, "pass", `Local evidence did not pass: ${item.id}`);
  }

  assert(
    artifact.requiredBeforeProductionReady.some((item) =>
      item.includes("completed bounded SDKThread/network proof"),
    ),
    "Artifact must require a completed SDKThread/network proof before production-ready.",
  );
  assert(
    artifact.requiredBeforeProductionReady.some((item) =>
      item.includes("productionReady:true only for the exact validated scope"),
    ),
    "Artifact must require a superseding exact-scope production-ready artifact.",
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

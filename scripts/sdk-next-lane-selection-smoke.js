"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const NEXT_LANE_PATH = ".codex-audit/sdk-next-lane/153-sdk-next-lane-selection.json";
const CURRENT_PROVIDER_SMOKE_PATHS = [
  "scripts/provider-api-smoke.js",
  "scripts/provider-contract-smoke.js",
];
const CEP_PANEL_CANDIDATE_PATHS = ["cep-panel/panel.js"];

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function main() {
  const nextLane = readJson(NEXT_LANE_PATH);
  const currentReadiness = readJson(nextLane.sourceCurrentReadiness);
  const currentGovernance = readJson(nextLane.sourceCurrentGovernance);
  const candidateReview = readJson(nextLane.sourceCandidateReviewPacket);

  assert.strictEqual(nextLane.schema, "sdk-next-lane-selection.v1");
  assert.strictEqual(nextLane.milestone, 153);
  assert.strictEqual(
    nextLane.sourceCurrentReadiness,
    ".codex-audit/sdk-production-readiness/152-sdk-production-code-provider-smokes-ready.json",
  );
  assert.strictEqual(
    nextLane.sourceCurrentGovernance,
    ".codex-audit/sdk-launch-governance/152-sdk-production-code-provider-smokes-governance.json",
  );
  assert.strictEqual(
    nextLane.sourceCandidateReviewPacket,
    ".codex-audit/sdk-scope-expansion-reviews/132-cep-panel-composer-review.json",
  );

  assert.strictEqual(currentReadiness.schema, "sdk-production-code-broader-readiness.v1");
  assert.strictEqual(currentReadiness.verdict.productionReady, true);
  assert.deepStrictEqual(
    currentReadiness.claimedScope.plannedPathAllowlist,
    CURRENT_PROVIDER_SMOKE_PATHS,
  );
  assert.strictEqual(currentReadiness.claimedScope.cepPanelWritesIncluded, false);

  assert.strictEqual(currentGovernance.schema, "sdk-launch-governance.v1");
  assert.strictEqual(currentGovernance.state, "local-gated");
  assert.deepStrictEqual(
    currentGovernance.productionCodePlannedPathAllowlist,
    CURRENT_PROVIDER_SMOKE_PATHS,
  );
  assert.strictEqual(currentGovernance.cepPanelSdkWriteEnabled, false);
  assert.strictEqual(currentGovernance.newSdkThreadRunApproved, false);
  assert.strictEqual(currentGovernance.externalNetworkRetryApproved, false);
  assert.strictEqual(currentGovernance.broadProductionCodeWritesApproved, false);

  assert.strictEqual(candidateReview.schema, "sdk-scope-expansion-review.v1");
  assert.strictEqual(candidateReview.scope, "cep-panel");
  assert.strictEqual(candidateReview.decision, "proposed");
  assert.strictEqual(candidateReview.sdkWriteEnabled, false);
  assert.deepStrictEqual(candidateReview.plannedPathAllowlist, CEP_PANEL_CANDIDATE_PATHS);

  assert.deepStrictEqual(nextLane.currentProductionReadyClaim, {
    scope: "production-code",
    status: "production-ready",
    plannedPathAllowlist: CURRENT_PROVIDER_SMOKE_PATHS,
  });
  assert.strictEqual(nextLane.selectedNextLane.id, "cep-panel-composer-local-preflight");
  assert.strictEqual(nextLane.selectedNextLane.scope, "cep-panel");
  assert.strictEqual(nextLane.selectedNextLane.status, "candidate-only");
  assert.strictEqual(nextLane.selectedNextLane.sdkWriteEnabled, false);
  assert.deepStrictEqual(nextLane.selectedNextLane.plannedPathAllowlist, CEP_PANEL_CANDIDATE_PATHS);
  assert.match(nextLane.selectedNextLane.reason, /does not enable CEP-panel SDK writes/);
  assert.match(nextLane.selectedNextLane.reason, /does not .*approve a new SDKThread\/network proof/);

  for (const forbidden of [
    "new SDKThread/network proof",
    "cep-panel SDK write enablement",
    "live CEP/After Effects validation",
    "external-provider/OpenAI CLI planner validation",
    "mutating-live validation",
    "package install or dependency changes",
    "general SDK autopilot repo edits",
  ]) {
    assert(
      nextLane.notApprovedByThisMilestone.includes(forbidden),
      `M153 must not approve: ${forbidden}`,
    );
  }

  assert(
    nextLane.requiredBeforeEnablement.some((item) => item.includes("explicit user approval")),
    "M153 must require explicit approval before enablement.",
  );
  assert(
    nextLane.requiredBeforeEnablement.some((item) => item.includes("sdkWriteEnabled:false")),
    "M153 must require disabled readiness before enablement.",
  );
  assert(
    nextLane.requiredBeforeEnablement.some((item) => item.includes("before SDKThread creation")),
    "M153 must require local rejection checks before SDKThread creation.",
  );

  assert.strictEqual(nextLane.recommendedNextMilestone.id, "M154");
  assert.strictEqual(nextLane.recommendedNextMilestone.title, "CEP-panel SDK Lane Local Preflight");
  assert(
    nextLane.recommendedNextMilestone.allowedWork.includes(
      "create a CEP-panel readiness packet with sdkWriteEnabled:false",
    ),
    "M154 recommendation must remain pre-enable.",
  );
  assert(
    nextLane.recommendedNextMilestone.forbiddenWithoutFreshApproval.includes(
      "run SDKThread/network proof",
    ),
    "M154 recommendation must keep SDKThread proof approval-gated.",
  );
  assert(
    nextLane.recommendedNextMilestone.forbiddenWithoutFreshApproval.includes(
      "enable CEP-panel sdk-write",
    ),
    "M154 recommendation must keep CEP-panel enablement approval-gated.",
  );

  assert.deepStrictEqual(nextLane.validationPlan, [
    "Run node --check scripts/sdk-next-lane-selection-smoke.js.",
    "Run npm.cmd run codex:orchestrator:next-lane:smoke.",
    "Run npm.cmd run check:rules.",
    "Run git diff --check.",
  ]);

  console.log("SDK next-lane selection smoke: pass");
}

if (require.main === module) {
  main();
}

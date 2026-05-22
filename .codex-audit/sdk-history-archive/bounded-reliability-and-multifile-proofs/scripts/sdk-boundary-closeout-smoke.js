"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const CLOSEOUT_PATH = path.join(
  repo,
  ".codex-audit",
  "sdk-post-multi-file-readiness",
  "151-sdk-boundary-closeout.json",
);

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function main() {
  const closeout = JSON.parse(fs.readFileSync(CLOSEOUT_PATH, "utf8"));
  const boundary = readJson(closeout.sourceBoundaryArtifact);

  assert.strictEqual(closeout.schema, "sdk-boundary-closeout.v1");
  assert.strictEqual(closeout.milestone, 151);
  assert.strictEqual(
    closeout.sourceBoundaryArtifact,
    ".codex-audit/sdk-post-multi-file-readiness/150-sdk-post-multi-file-governance-boundary.json",
  );
  assert.strictEqual(closeout.closeoutDecision.selectedAction, "push-branch-after-closeout-commit");
  assert.strictEqual(closeout.closeoutDecision.branch, "codex/roadmap-1.3-planning");
  assert.strictEqual(closeout.closeoutDecision.remote, "origin");

  assert.strictEqual(boundary.schema, "sdk-post-multi-file-governance-boundary.v1");
  assert.strictEqual(boundary.verdict.overall, closeout.claimsAtCloseout.overall);
  assert.strictEqual(boundary.verdict.productionReady, closeout.claimsAtCloseout.productionReady);
  assert.strictEqual(
    boundary.verdict.narrowProductionCodeLane,
    closeout.claimsAtCloseout.narrowProductionCodeLane,
  );
  assert.strictEqual(
    boundary.verdict.multiFileOrchestratorFixtureLane,
    closeout.claimsAtCloseout.multiFileOrchestratorFixtureLane,
  );
  assert.strictEqual(
    boundary.verdict.generalSdkWorkflow,
    closeout.claimsAtCloseout.generalSdkWorkflow,
  );
  assert.deepStrictEqual(boundary.currentBoundary.allowedProductionReadyClaims, [
    `production-code:${closeout.claimsAtCloseout.narrowProductionCodePath}`,
  ]);

  assert(
    closeout.commitsSelectedForPublish.some((item) => item.commit === "500b973"),
    "M151 closeout must publish the M149 commit.",
  );
  assert(
    closeout.commitsSelectedForPublish.some((item) => item.commit === "e42fa6a"),
    "M151 closeout must publish the M150 commit.",
  );
  assert(
    closeout.commitsSelectedForPublish.some((item) => item.commit === "m151-closeout-commit"),
    "M151 closeout must include the closeout commit placeholder.",
  );
  assert(
    closeout.mustNotStartWithoutNewApproval.includes("CEP-panel SDK writes"),
    "M151 closeout must keep CEP-panel SDK writes gated.",
  );
  assert(
    closeout.mustNotStartWithoutNewApproval.includes("mutating-live validation"),
    "M151 closeout must keep mutating-live validation gated.",
  );
  assert.strictEqual(closeout.handoffPolicy.updateHandoffAfterPush, true);
  assert.strictEqual(closeout.handoffPolicy.recordPushResultOutsideCommittedArtifact, true);
  assert.strictEqual(closeout.nextRecommendedMilestone.id, "M152");

  console.log("SDK boundary closeout smoke: pass");
}

if (require.main === module) {
  main();
}

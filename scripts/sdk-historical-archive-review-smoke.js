"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const REVIEW_PATH =
  ".codex-audit/sdk-orchestrator-extraction/164-sdk-historical-archive-review.json";

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

function assertFileExists(repoPath, label) {
  assert(fs.existsSync(path.join(repo, repoPath)), `${label} must exist: ${repoPath}`);
}

function flattenCandidatePaths(review) {
  return review.archiveMoveCandidateSets.flatMap((entry) => entry.currentPaths || []);
}

function pathJoinInvocation(repoPath) {
  const [directory, fileName] = repoPath.split("/");
  return `path.join("${directory}", "${fileName}")`;
}

function main() {
  const review = readJson(REVIEW_PATH);
  const migration = readJson(review.sourceContext.previousArtifact);
  const historicalIndex = readJson(review.sourceContext.historicalIndexArtifact);
  const packageJson = readJson("package.json");
  const runner = readText("orchestrator/run-buffered-acceptance.mjs");
  const readme = readText("orchestrator/README.md");

  assert.strictEqual(review.schema, "sdk-historical-archive-review.v1");
  assert.strictEqual(review.milestone, 164);
  assert.strictEqual(review.sourceContext.previousMilestone, 163);
  assert.strictEqual(
    review.sourceContext.previousArtifact,
    ".codex-audit/sdk-orchestrator-extraction/163-sdk-historical-smoke-migration.json",
  );
  assert.strictEqual(migration.schema, "sdk-historical-smoke-migration.v1");
  assert.strictEqual(historicalIndex.schema, "sdk-historical-evidence-index.v1");

  for (const flag of review.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      review.sourceContext.behaviorBoundary[flag],
      false,
      `${flag} must remain false.`,
    );
  }

  assert.strictEqual(review.reviewAction.reviewCreated, true);
  assert.strictEqual(review.reviewAction.archiveMoveCandidateSetsIdentified, true);
  assert.strictEqual(review.reviewAction.currentEvidenceRemainsDirectlyChecked, true);
  assert.strictEqual(review.reviewAction.historicalFilesRemainInPlace, true);
  assert.strictEqual(review.reviewAction.archiveMoveAllowedNow, false);
  assert.strictEqual(review.reviewAction.archiveMovePerformed, false);
  assert.strictEqual(review.reviewAction.deleteAllowedNow, false);
  assert.strictEqual(review.reviewAction.deletionPerformed, false);
  assert.strictEqual(review.reviewAction.squashAllowedNow, false);
  assert.strictEqual(review.reviewAction.squashPerformed, false);

  assert.strictEqual(
    migration.migrationAction.archiveMoveAllowedNow,
    review.machineCheck.requiredPreviousMigrationAction.archiveMoveAllowedNow,
  );
  assert.strictEqual(
    migration.migrationAction.deleteAllowedNow,
    review.machineCheck.requiredPreviousMigrationAction.deleteAllowedNow,
  );
  assert.strictEqual(
    migration.migrationAction.squashAllowedNow,
    review.machineCheck.requiredPreviousMigrationAction.squashAllowedNow,
  );
  assert.strictEqual(
    historicalIndex.historyAction.archiveMoveAllowedNow,
    review.machineCheck.requiredHistoricalIndexAction.archiveMoveAllowedNow,
  );
  assert.strictEqual(
    historicalIndex.historyAction.deleteAllowedNow,
    review.machineCheck.requiredHistoricalIndexAction.deleteAllowedNow,
  );
  assert.strictEqual(
    historicalIndex.historyAction.squashAllowedNow,
    review.machineCheck.requiredHistoricalIndexAction.squashAllowedNow,
  );

  assert.strictEqual(
    packageJson.scripts?.[review.machineCheck.requiredPackageScript],
    review.machineCheck.requiredPackageScriptCommand,
  );

  const candidateSetIds = review.archiveMoveCandidateSets.map((entry) => entry.id);
  for (const setId of review.machineCheck.requiredCandidateSetIds) {
    assertIncludes(candidateSetIds, setId, "archive candidate set ids");
  }

  const candidatePaths = new Set(flattenCandidatePaths(review));
  for (const repoPath of review.machineCheck.candidatePathsMustExist) {
    assert(candidatePaths.has(repoPath), `candidate path must be reviewed: ${repoPath}`);
    assertFileExists(repoPath, "candidate path");
  }

  const historicalArtifacts = new Set(
    historicalIndex.historicalEvidenceIndex.flatMap((entry) => entry.artifacts || []),
  );
  for (const repoPath of historicalArtifacts) {
    assert(candidatePaths.has(repoPath), `historical index artifact must be reviewed: ${repoPath}`);
  }

  for (const scriptPath of migration.machineCheck.retainedHistoricalSmokeScripts) {
    assertIncludes(
      review.machineCheck.retiredHistoricalSmokeScriptsMustRemainInPlace,
      scriptPath,
      "retired historical smoke scripts",
    );
    assert(candidatePaths.has(scriptPath), `retired historical smoke script must be reviewed: ${scriptPath}`);
    assertFileExists(scriptPath, "retired historical smoke script");
  }

  for (const entry of review.archiveMoveCandidateSets) {
    assert.strictEqual(entry.decision, "candidate-for-future-archive-move");
    assert.strictEqual(entry.moveAllowedNow, false);
    assert.strictEqual(entry.deleteAllowedNow, false);
    assert.strictEqual(entry.squashAllowedNow, false);
    assert(Array.isArray(entry.preMoveRequirements) && entry.preMoveRequirements.length > 0);
    assert(Array.isArray(entry.currentPaths) && entry.currentPaths.length > 0);
  }

  for (const repoPath of review.nonCandidateCurrentEvidence) {
    assertFileExists(repoPath, "non-candidate current evidence");
    assert(!candidatePaths.has(repoPath), `current evidence must not be an archive candidate: ${repoPath}`);
  }

  for (const repoPath of review.machineCheck.currentEvidenceMustNotBeCandidates) {
    assertFileExists(repoPath, "current evidence exclusion");
    assert(!candidatePaths.has(repoPath), `machine-check current evidence must not be a candidate: ${repoPath}`);
  }

  assert.strictEqual(review.proposedFutureArchivePolicy.deleteInsteadOfMoveAllowed, false);
  assert.strictEqual(review.proposedFutureArchivePolicy.squashCommitsAllowed, false);
  assert.strictEqual(review.proposedFutureArchivePolicy.mustKeepCurrentEvidenceInPlace, true);

  for (const snippet of review.machineCheck.requiredReadmeSnippets) {
    assert(readme.includes(snippet), `README must include: ${snippet}`);
  }

  assert(
    runner.includes(pathJoinInvocation("scripts/sdk-historical-archive-review-smoke.js")) &&
      runner.includes("SDK historical archive review smoke: pass"),
    "check:rules must run and report the M164 historical archive review smoke.",
  );

  console.log("SDK historical archive review smoke: pass");
}

if (require.main === module) {
  main();
}

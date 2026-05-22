"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  ARCHIVE_MOVE_PATH,
  archivePathFor,
} = require("./sdk-history-archive-paths");

const repo = path.resolve(__dirname, "..");

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function readText(repoPath) {
  return fs.readFileSync(path.join(repo, repoPath), "utf8");
}

function assertFileExists(repoPath, label) {
  assert(fs.existsSync(path.join(repo, repoPath)), `${label} must exist: ${repoPath}`);
}

function flattenReviewCandidatePaths(review) {
  return review.archiveMoveCandidateSets.flatMap((entry) => entry.currentPaths || []);
}

function flattenMovedOriginalPaths(move) {
  return move.movedCandidateSets.flatMap((entry) => entry.originalPaths || []);
}

function assertSameSet(actualValues, expectedValues, label) {
  const actual = [...new Set(actualValues)].sort();
  const expected = [...new Set(expectedValues)].sort();
  assert.deepStrictEqual(actual, expected, `${label} must match.`);
}

function pathJoinInvocation(repoPath) {
  const [directory, fileName] = repoPath.split("/");
  return `path.join("${directory}", "${fileName}")`;
}

function main() {
  const move = readJson(ARCHIVE_MOVE_PATH);
  const review = readJson(move.sourceContext.previousArtifact);
  const migration = readJson(move.sourceContext.historicalSmokeMigrationArtifact);
  const historicalIndex = readJson(move.sourceContext.historicalIndexArtifact);
  const packageJson = readJson("package.json");
  const runner = readText("orchestrator/run-buffered-acceptance.mjs");
  const readme = readText("orchestrator/README.md");
  const archiveReadme = readText(move.metadataPreservation.humanReadableArchiveReadme);

  assert.strictEqual(move.schema, "sdk-historical-archive-move.v1");
  assert.strictEqual(move.milestone, 165);
  assert.strictEqual(move.sourceContext.previousMilestone, 164);
  assert.strictEqual(
    move.sourceContext.previousArtifact,
    ".codex-audit/sdk-orchestrator-extraction/164-sdk-historical-archive-review.json",
  );
  assert.strictEqual(review.schema, "sdk-historical-archive-review.v1");
  assert.strictEqual(migration.schema, "sdk-historical-smoke-migration.v1");
  assert.strictEqual(historicalIndex.schema, "sdk-historical-evidence-index.v1");

  for (const flag of move.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      move.sourceContext.behaviorBoundary[flag],
      false,
      `${flag} must remain false.`,
    );
  }

  assert.strictEqual(move.sourceContext.behaviorBoundary.archiveMovePerformed, true);
  assert.strictEqual(move.moveAction.moveByGitOnly, true);
  assert.strictEqual(move.moveAction.archiveMovePerformed, true);
  assert.strictEqual(move.moveAction.movedOnlyReviewedM164Candidates, true);
  assert.strictEqual(move.moveAction.currentEvidenceRemainsDirectlyChecked, true);
  assert.strictEqual(move.moveAction.retiredHistoricalSmokeScriptsMoved, true);
  assert.strictEqual(move.moveAction.deleteAllowedNow, false);
  assert.strictEqual(move.moveAction.deletionPerformed, false);
  assert.strictEqual(move.moveAction.squashAllowedNow, false);
  assert.strictEqual(move.moveAction.squashPerformed, false);

  assert.strictEqual(move.archiveRoot, move.machineCheck.requiredArchiveRoot);
  assertFileExists(move.machineCheck.requiredArchiveReadme, "archive README");

  assert.strictEqual(
    packageJson.scripts?.[move.machineCheck.requiredPackageScript],
    move.machineCheck.requiredPackageScriptCommand,
  );

  const movedSetIds = move.movedCandidateSets.map((entry) => entry.id);
  for (const setId of move.machineCheck.requiredCandidateSetIds) {
    assert(movedSetIds.includes(setId), `moved candidate sets must include ${setId}`);
  }

  assertSameSet(
    flattenMovedOriginalPaths(move),
    flattenReviewCandidatePaths(review),
    "M165 moved original paths and M164 reviewed candidate paths",
  );

  const movedOriginalPaths = flattenMovedOriginalPaths(move);
  assert.strictEqual(
    movedOriginalPaths.length,
    move.machineCheck.requiredMoveCount,
    "M165 moved path count must match the expected reviewed candidate count.",
  );

  for (const originalPath of movedOriginalPaths) {
    const archivePath = archivePathFor(move, originalPath);
    assert(archivePath, `archive path must be computable for ${originalPath}`);
    assert(
      archivePath.startsWith(`${move.archiveRoot}/`),
      `archive path must stay under archive root: ${archivePath}`,
    );
    assert(
      !fs.existsSync(path.join(repo, originalPath)),
      `moved original path must no longer exist in active location: ${originalPath}`,
    );
    assertFileExists(archivePath, "archived historical candidate");
  }

  const movedOriginalSet = new Set(movedOriginalPaths);
  for (const artifactPath of historicalIndex.historicalEvidenceIndex.flatMap(
    (entry) => entry.artifacts || [],
  )) {
    assert(movedOriginalSet.has(artifactPath), `historical artifact must be moved: ${artifactPath}`);
  }

  for (const scriptPath of migration.machineCheck.retainedHistoricalSmokeScripts) {
    assert(movedOriginalSet.has(scriptPath), `retired smoke script must be moved: ${scriptPath}`);
  }

  for (const currentPath of move.machineCheck.currentEvidenceMustRemainInPlace) {
    assertFileExists(currentPath, "current evidence");
    assert(!movedOriginalSet.has(currentPath), `current evidence must not be moved: ${currentPath}`);
  }

  for (const currentPath of review.nonCandidateCurrentEvidence) {
    assertFileExists(currentPath, "M164 non-candidate current evidence");
    assert(!movedOriginalSet.has(currentPath), `M164 non-candidate must not be moved: ${currentPath}`);
  }

  for (const snippet of move.machineCheck.requiredReadmeSnippets) {
    assert(readme.includes(snippet), `README must include: ${snippet}`);
  }

  assert(
    archiveReadme.includes("M165 moves the M164-reviewed historical archive candidates") &&
      archiveReadme.includes("Delete and squash remain blocked"),
    "archive README must summarize the M165 move-only cleanup.",
  );

  assert(
    runner.includes(pathJoinInvocation("scripts/sdk-historical-archive-move-smoke.js")) &&
      runner.includes("SDK historical archive move smoke: pass"),
    "check:rules must run and report the M165 historical archive move smoke.",
  );

  console.log("SDK historical archive move smoke: pass");
}

if (require.main === module) {
  main();
}

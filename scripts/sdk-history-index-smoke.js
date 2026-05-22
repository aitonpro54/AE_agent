"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function readText(repoPath) {
  return fs.readFileSync(path.join(repo, repoPath), "utf8");
}

function assertIncludesAll(source, snippets, sourceName) {
  for (const snippet of snippets) {
    assert(source.includes(snippet), `${sourceName} must include: ${snippet}`);
  }
}

function main() {
  const history = readJson(".codex-audit/sdk-history-index.json");
  const consolidation = readJson(".codex-audit/sdk-smoke-consolidation-plan.json");
  const current = readJson(".codex-audit/sdk-current-state.json");
  const historicalEvidence = readJson(history.sourceContext.historicalEvidenceIndex);
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");

  assert.strictEqual(history.schema, "sdk-history-index.v1");
  assert.strictEqual(consolidation.schema, "sdk-smoke-consolidation-plan.v1");
  assert.strictEqual(historicalEvidence.schema, "sdk-historical-evidence-index.v1");
  assert.strictEqual(current.schema, "sdk-current-state.v1");
  assert.strictEqual(
    history.defaultReadPolicy.routineValidation,
    "Read this index and the current-state artifact first.",
  );

  for (const flag of history.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      history.sourceContext.behaviorBoundary[flag],
      false,
      `${flag} must remain false in history index.`,
    );
  }
  for (const flag of consolidation.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      consolidation.sourceContext.behaviorBoundary[flag],
      false,
      `${flag} must remain false in consolidation plan.`,
    );
  }

  const historySetIds = history.historySets.map((entry) => entry.id);
  for (const setId of history.machineCheck.requiredHistorySetIds) {
    assert(historySetIds.includes(setId), `history index must include ${setId}`);
  }
  for (const set of history.historySets) {
    assert(set.verdict && set.verdict.length > 20, `${set.id} must include a verdict.`);
    assert(
      ["do-not-reread-by-default", "read-only-when-needed"].includes(set.defaultAction),
      `${set.id} must have a bounded defaultAction.`,
    );
  }

  const activeSmokeIds = consolidation.smokeSurfaceStatus
    .filter((entry) => entry.status.startsWith("active"))
    .map((entry) => entry.id);
  for (const smokeId of consolidation.machineCheck.requiredActiveSmokeIds) {
    assert(activeSmokeIds.includes(smokeId), `active smoke surface must include ${smokeId}`);
  }
  assert.strictEqual(consolidation.consolidationPolicy.replacementCoverageReady, false);
  assert.strictEqual(consolidation.consolidationPolicy.existingMilestoneSpecificSmokesRetained, true);
  assert.strictEqual(consolidation.consolidationPolicy.deleteOldSmokeScriptsBeforeReplacementGreen, false);
  assert.strictEqual(consolidation.consolidationPolicy.dropCheckRulesAssertionsWithoutEquivalentCoverage, false);

  for (const [scriptName, command] of Object.entries(
    consolidation.machineCheck.requiredPackageScripts,
  )) {
    assert.strictEqual(packageJson.scripts?.[scriptName], command, `${scriptName} command mismatch`);
  }

  assertIncludesAll(readme, history.machineCheck.requiredReadmeSnippets, "README");
  assertIncludesAll(readme, consolidation.machineCheck.requiredReadmeSnippets, "README");

  for (const [repoPath, snippets] of Object.entries(history.machineCheck.requiredSourceSnippets)) {
    assertIncludesAll(readText(repoPath), snippets, repoPath);
  }
  for (const [repoPath, snippets] of Object.entries(consolidation.machineCheck.requiredSourceSnippets)) {
    assertIncludesAll(readText(repoPath), snippets, repoPath);
  }

  console.log("SDK history index smoke: pass");
}

if (require.main === module) {
  main();
}

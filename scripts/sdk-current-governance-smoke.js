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

function assertFileExists(repoPath) {
  assert(fs.existsSync(path.join(repo, repoPath)), `Expected file to exist: ${repoPath}`);
}

function assertIncludesAll(source, snippets, sourceName) {
  for (const snippet of snippets) {
    assert(source.includes(snippet), `${sourceName} must include: ${snippet}`);
  }
}

function main() {
  const current = readJson(".codex-audit/sdk-current-state.json");
  const consolidation = readJson(".codex-audit/sdk-smoke-consolidation-plan.json");
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");

  assert.strictEqual(current.schema, "sdk-current-state.v1");
  assert.strictEqual(consolidation.schema, "sdk-smoke-consolidation-plan.v1");
  assert.strictEqual(current.currentSdkBaseline.state, "local-gated-ae-agent-specific");
  assert.deepStrictEqual(current.currentSdkBaseline.productionCodeSdkWriteAllowlist, [
    "scripts/provider-api-smoke.js",
    "scripts/provider-contract-smoke.js",
  ]);
  assert.strictEqual(current.currentSdkBaseline.cepPanelSdkWritesEnabled, false);
  assert.strictEqual(consolidation.consolidationPolicy.existingMilestoneSpecificSmokesRetained, true);
  assert.strictEqual(consolidation.consolidationPolicy.replacementCoverageReady, false);

  for (const flag of current.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      current.sourceContext.behaviorBoundary[flag],
      false,
      `${flag} must remain false in current state.`,
    );
  }

  const currentSetIds = current.currentDirectCheckSets.map((entry) => entry.id);
  for (const setId of current.machineCheck.requiredCurrentSetIds) {
    assert(currentSetIds.includes(setId), `current state must include ${setId}`);
  }

  for (const set of current.currentDirectCheckSets) {
    assert.strictEqual(set.status, "current-direct-check", `${set.id} must be directly checked.`);
    assert(set.packageScripts.includes("check:rules"), `${set.id} must keep check:rules coverage.`);
    for (const repoPath of set.artifacts) {
      assertFileExists(repoPath);
    }
    for (const repoPath of set.scriptPaths) {
      assertFileExists(repoPath);
    }
  }

  for (const [scriptName, command] of Object.entries(
    consolidation.machineCheck.requiredPackageScripts,
  )) {
    assert.strictEqual(packageJson.scripts?.[scriptName], command, `${scriptName} command mismatch`);
  }
  assert.strictEqual(
    packageJson.scripts?.["check:rules"],
    "node orchestrator/run-buffered-acceptance.mjs --contract-smoke",
  );

  assertIncludesAll(readme, current.machineCheck.requiredReadmeSnippets, "README");
  assertIncludesAll(readme, consolidation.machineCheck.requiredReadmeSnippets, "README");

  for (const [repoPath, snippets] of Object.entries(consolidation.machineCheck.requiredSourceSnippets)) {
    assertIncludesAll(readText(repoPath), snippets, repoPath);
  }

  console.log("SDK current governance smoke: pass");
}

if (require.main === module) {
  main();
}

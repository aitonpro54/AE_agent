"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const CURRENT_STATE_PATH = ".codex-audit/sdk-current-state.json";
const HISTORY_INDEX_PATH = ".codex-audit/sdk-history-index.json";

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

function assertFalseBoundaryFlags(artifact) {
  for (const flag of artifact.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      artifact.sourceContext.behaviorBoundary[flag],
      false,
      `${artifact.schema} ${flag} must remain false.`,
    );
  }
}

function main() {
  const current = readJson(CURRENT_STATE_PATH);
  const history = readJson(HISTORY_INDEX_PATH);
  const queue = readJson(current.sourceContext.queueArtifact);
  const featureQueue = readJson(current.sourceContext.featureConveyorQueueArtifact);
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");

  assert.strictEqual(current.schema, "sdk-current-state.v1");
  assert(current.milestone >= 176, "current SDK state milestone must be M176 or later.");
  assert.strictEqual(history.schema, "sdk-history-index.v1");
  assert.strictEqual(history.milestone, 176);
  assert.strictEqual(queue.schema, "sdk-ae-agent-cleanup-conveyor-queue.v1");
  assert.strictEqual(featureQueue.schema, "sdk-ae-agent-feature-conveyor-queue.v1");
  assert.strictEqual(current.currentSdkBaseline.state, "local-gated-ae-agent-specific");
  assert.strictEqual(
    current.currentSdkBaseline.featureConveyorState,
    "m186-approved-not-executed",
  );
  assert.strictEqual(current.currentSdkBaseline.cepPanelSdkWritesEnabled, false);
  assert.deepStrictEqual(
    current.currentSdkBaseline.productionCodeSdkWriteAllowlist,
    current.machineCheck.requiredProductionCodeSdkWriteAllowlist,
  );
  assert.strictEqual(
    current.currentSdkBaseline.checkRulesCommand,
    "node orchestrator/run-buffered-acceptance.mjs --contract-smoke",
  );

  assertFalseBoundaryFlags(current);
  assertFalseBoundaryFlags(history);

  const currentSetIds = current.currentDirectCheckSets.map((entry) => entry.id).sort();
  assert.deepStrictEqual(currentSetIds, current.machineCheck.requiredCurrentSetIds.slice().sort());
  for (const set of current.currentDirectCheckSets) {
    assert.strictEqual(set.status, "current-direct-check", `${set.id} must stay current.`);
    assert(set.verdict && set.verdict.length > 20, `${set.id} must include a verdict.`);
    for (const repoPath of [...set.artifacts, ...set.scriptPaths]) {
      assertFileExists(repoPath);
    }
    assert(set.packageScripts.includes("check:rules"), `${set.id} must include check:rules.`);
  }

  const historySetIds = history.historySets.map((entry) => entry.id).sort();
  assert.deepStrictEqual(historySetIds, history.machineCheck.requiredHistorySetIds.slice().sort());
  for (const set of history.historySets) {
    assert(set.verdict && set.verdict.length > 20, `${set.id} must include a verdict.`);
    assert.notStrictEqual(set.status, "current-direct-check", `${set.id} must not be current.`);
  }
  assert.strictEqual(
    history.defaultReadPolicy.currentEvidence,
    "Current M152+ evidence stays in .codex-audit/sdk-current-state.json and remains directly checked.",
  );

  assert.strictEqual(
    packageJson.scripts?.[current.machineCheck.requiredPackageScript],
    current.machineCheck.requiredPackageScriptCommand,
  );
  assert.strictEqual(
    packageJson.scripts?.[history.machineCheck.requiredPackageScript],
    history.machineCheck.requiredPackageScriptCommand,
  );

  assertIncludesAll(readme, current.machineCheck.requiredReadmeSnippets, "README");
  assertIncludesAll(readme, history.machineCheck.requiredReadmeSnippets, "README");

  for (const [repoPath, snippets] of Object.entries(current.machineCheck.requiredSourceSnippets)) {
    assertIncludesAll(readText(repoPath), snippets, repoPath);
  }
  for (const [repoPath, snippets] of Object.entries(history.machineCheck.requiredSourceSnippets)) {
    assertIncludesAll(readText(repoPath), snippets, repoPath);
  }

  console.log("SDK current/history index smoke: pass");
}

if (require.main === module) {
  main();
}

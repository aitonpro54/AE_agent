"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const INDEX_PATH =
  ".codex-audit/sdk-orchestrator-extraction/162-sdk-historical-evidence-index.json";
const M161_PATH =
  ".codex-audit/sdk-orchestrator-extraction/161-ae-agent-adapter-config.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function assertIncludes(list, value, label) {
  assert(Array.isArray(list), `${label} must be an array.`);
  assert(list.includes(value), `${label} must include ${value}.`);
}

function collectArtifacts(entries) {
  return entries.flatMap((entry) => entry.artifacts || []);
}

function findById(entries, id, label) {
  const match = entries.find((entry) => entry.id === id);
  assert(match, `${label} must include ${id}.`);
  return match;
}

function main() {
  const index = readJson(INDEX_PATH);
  const m161 = readJson(M161_PATH);
  const packageJson = readJson("package.json");

  assert.strictEqual(index.schema, "sdk-historical-evidence-index.v1");
  assert.strictEqual(index.milestone, 162);
  assert.strictEqual(index.sourceContext.previousMilestone, 161);
  assert.strictEqual(index.sourceContext.previousArtifact, M161_PATH);
  assert.strictEqual(m161.schema, "sdk-ae-agent-adapter-config.v1");
  assert.strictEqual(
    index.sourceContext.safeAeAgentCleanupPlanPhase,
    "phase-4-summarize-historical-sdk-evidence",
  );

  for (const flag of index.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      index.sourceContext.behaviorBoundary[flag],
      false,
      `${flag} must remain false.`,
    );
  }

  assert.strictEqual(
    packageJson.scripts?.[index.machineCheck.requiredPackageScript],
    "node scripts/sdk-historical-evidence-index-smoke.js",
  );

  for (const repoPath of index.machineCheck.mustExist) {
    assert(fs.existsSync(path.join(repo, repoPath)), `machineCheck.mustExist missing: ${repoPath}`);
  }

  const currentIds = index.currentEvidenceStillDirectlyChecked.map((entry) => entry.id);
  for (const currentId of index.machineCheck.requiredCurrentSetIds) {
    assertIncludes(currentIds, currentId, "current evidence set ids");
  }

  const historicalIds = index.historicalEvidenceIndex.map((entry) => entry.id);
  for (const historicalId of index.machineCheck.requiredHistoricalSetIds) {
    assertIncludes(historicalIds, historicalId, "historical evidence set ids");
  }

  const currentArtifacts = new Set(collectArtifacts(index.currentEvidenceStillDirectlyChecked));
  const historicalArtifacts = new Set(collectArtifacts(index.historicalEvidenceIndex));
  for (const currentPath of index.machineCheck.currentEvidenceMustRemainDirectlyChecked) {
    assert(
      currentArtifacts.has(currentPath) || fs.existsSync(path.join(repo, currentPath)),
      `current evidence must be directly checked or exist: ${currentPath}`,
    );
    assert(
      !historicalArtifacts.has(currentPath),
      `current evidence must not be historical-only: ${currentPath}`,
    );
  }

  const currentProduction = findById(
    index.currentEvidenceStillDirectlyChecked,
    "current-production-code-provider-smoke-lane",
    "current evidence",
  );
  assert.strictEqual(currentProduction.verdict, "two-file-provider-smoke-lane-ready");
  assertIncludes(
    currentProduction.smokeEntrypoints,
    "npm.cmd run codex:orchestrator:governance-report",
    "current production smoke entrypoints",
  );

  const singleFileHistory = findById(
    index.historicalEvidenceIndex,
    "superseded-single-file-production-readiness",
    "historical evidence",
  );
  assertIncludes(
    singleFileHistory.artifacts,
    ".codex-audit/sdk-production-readiness/145-sdk-production-ready.json",
    "single-file history artifacts",
  );
  assertIncludes(
    singleFileHistory.artifacts,
    ".codex-audit/sdk-production-readiness/146-sdk-production-ready.json",
    "single-file history artifacts",
  );
  assertIncludes(
    singleFileHistory.supersededBy,
    "current-production-code-provider-smoke-lane",
    "single-file history supersededBy",
  );

  const reliabilityHistory = findById(
    index.historicalEvidenceIndex,
    "bounded-reliability-and-multifile-proofs",
    "historical evidence",
  );
  assertIncludes(
    reliabilityHistory.artifacts,
    "orchestrator/fixtures/sdk-write/m149-multi-file-alpha.json",
    "bounded reliability artifacts",
  );

  for (const entry of index.historicalEvidenceIndex) {
    assert.strictEqual(entry.status, "historical-indexed-keep-in-place");
    assert(Array.isArray(entry.commitRefs) && entry.commitRefs.length > 0);
    assert(Array.isArray(entry.supersededBy) && entry.supersededBy.length > 0);
    assert.strictEqual(entry.retention.keepInPlace, true);
    assert.strictEqual(entry.retention.immediateAction, "none");
  }

  const supersessionEdges = index.supersessionChain.map((edge) => `${edge.from} -> ${edge.to}`);
  for (const requiredEdge of index.machineCheck.requiredSupersessionEdges) {
    assertIncludes(supersessionEdges, requiredEdge, "supersession edges");
  }

  assert.strictEqual(index.historyAction.indexCreated, true);
  assert.strictEqual(index.historyAction.currentEvidenceRemainsDirectlyChecked, true);
  assert.strictEqual(index.historyAction.archiveMoveAllowedNow, false);
  assert.strictEqual(index.historyAction.deleteAllowedNow, false);
  assert.strictEqual(index.historyAction.squashAllowedNow, false);

  console.log("SDK historical evidence index smoke: pass");
}

if (require.main === module) {
  main();
}

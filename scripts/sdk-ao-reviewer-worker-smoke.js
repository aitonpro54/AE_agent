"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const CONTRACT_PATH = ".codex-audit/sdk-ao-pattern-intake/aux-005-reviewer-worker-contract.json";
const QUEUE_PATH = ".codex-audit/sdk-roadmap-supervisor/aux-005-aux-008-support-queue.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function assertIncludesAll(actualValues, expectedValues, label) {
  for (const expected of expectedValues) {
    assert(
      actualValues.includes(expected),
      `${label} must include ${expected}`,
    );
  }
}

function assertFalseClaims(contract) {
  for (const claim of contract.machineCheck.requiredFalseBoundaryClaims) {
    assert.strictEqual(
      contract.boundaryClaims[claim],
      false,
      `boundary claim ${claim} must remain false`,
    );
  }
}

function assertContractShape(contract, queue) {
  assert.strictEqual(contract.schema, contract.machineCheck.requiredSchema);
  assert.strictEqual(contract.auxiliaryId, contract.machineCheck.requiredAuxiliaryId);
  assert.strictEqual(contract.source.auxiliaryId, contract.machineCheck.requiredAuxiliaryId);
  assert.strictEqual(contract.source.queuePath, contract.machineCheck.requiredQueuePath);
  assert.strictEqual(contract.source.queueItemId, contract.machineCheck.requiredQueueItemId);
  assert.strictEqual(contract.source.notRuntimeBehavior, true);
  assert.strictEqual(contract.source.notAnAoIntegration, true);

  const queueItem = queue.queueItems.find((item) => item.id === contract.machineCheck.requiredQueueItemId);
  assert(queueItem, "queue must include the AUX-005 item");
  assert.strictEqual(queueItem.label, contract.machineCheck.requiredAuxiliaryId);
  assert(queueItem.plannedPaths.includes(CONTRACT_PATH), "queue planned paths must include contract");
  assert(queueItem.plannedPaths.includes(contract.machineCheck.requiredSmokeScript), "queue planned paths must include smoke");
  assert.strictEqual(queue.sourceContext.boundaries.runAO, false);
  assert.strictEqual(queue.sourceContext.boundaries.liveCepAe, false);
  assert.strictEqual(queue.sourceContext.boundaries.dependencies, false);
  assert.strictEqual(queue.sourceContext.boundaries.push, false);
  assert.strictEqual(queue.sourceContext.boundaries.pullRequest, false);

  assert.strictEqual(contract.reviewerContract.inputMode, contract.machineCheck.requiredInputMode);
  assert.strictEqual(contract.reviewerContract.defaultOutput, contract.machineCheck.requiredDefaultOutput);
  assert.strictEqual(contract.reviewerContract.noFileEdits, true);
  assert.strictEqual(contract.reviewerContract.noCommandRetries, true);
  assert.strictEqual(contract.reviewerContract.noAutoFixes, true);
  assert.strictEqual(contract.reviewerContract.noDefaultWrites, true);

  assertIncludesAll(
    contract.reviewerContract.requiredInputs,
    contract.machineCheck.requiredInputs,
    "reviewer inputs",
  );
  assertIncludesAll(
    contract.reviewerContract.allowedOutputs,
    contract.machineCheck.requiredOutputs,
    "reviewer outputs",
  );
  assertIncludesAll(
    contract.reviewerContract.forbiddenReviewerSideEffects,
    contract.machineCheck.requiredForbiddenReviewerSideEffects,
    "forbidden reviewer side effects",
  );
  assertFalseClaims(contract);
}

function hasUnplannedPath(inputs) {
  return inputs.changedPaths.some((changedPath) => !inputs.plannedPaths.includes(changedPath));
}

function decideFixture(inputs) {
  if (inputs.validationStatus !== "passed") {
    return "blocking_finding";
  }
  if (inputs.forbiddenActionEvidence.length > 0 || hasUnplannedPath(inputs)) {
    return "blocking_finding";
  }
  if (!inputs.handoffFresh) {
    return "needs_handoff_refresh";
  }
  if (inputs.minorFinding) {
    return "non_blocking_finding";
  }
  return "pass";
}

function assertFixtureDecisions(contract) {
  const observedDecisions = new Set();
  for (const fixture of contract.fixtureReviewerDecisions) {
    assert(fixture.id, "fixture must have an id");
    assert(fixture.inputs, `${fixture.id} must include inputs`);
    assert(Number.isInteger(fixture.inputs.boundedLogTailLines), `${fixture.id} must include bounded log tail line count`);
    assert(
      fixture.inputs.boundedLogTailLines <= contract.reviewerContract.boundedLogTailDefaultLines,
      `${fixture.id} log tail must stay bounded by default reviewer budget`,
    );
    const decision = decideFixture(fixture.inputs);
    assert.strictEqual(
      decision,
      fixture.expectedDecision,
      `${fixture.id} expected decision must match fixture rule`,
    );
    observedDecisions.add(decision);
  }
  assertIncludesAll(
    Array.from(observedDecisions),
    contract.machineCheck.requiredFixtureDecisions,
    "fixture reviewer decisions",
  );
}

function assertSmokeSourceDoesNotMutate() {
  const source = fs.readFileSync(__filename, "utf8");
  const forbiddenTokens = [
    ["write", "File", "Sync"].join(""),
    ["append", "File", "Sync"].join(""),
    ["child", "_", "process"].join(""),
    ["exec", "File", "Sync"].join(""),
  ];
  for (const token of forbiddenTokens) {
    assert(!source.includes(token), `smoke source must not contain ${token}`);
  }
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const queue = readJson(QUEUE_PATH);
  assertContractShape(contract, queue);
  assertFixtureDecisions(contract);
  assertSmokeSourceDoesNotMutate();

  console.log("sdk ao reviewer worker smoke passed");
}

if (require.main === module) {
  main();
}

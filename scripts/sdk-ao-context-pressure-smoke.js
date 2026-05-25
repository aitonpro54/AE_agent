"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const CONTRACT_PATH = ".codex-audit/sdk-ao-pattern-intake/aux-007-context-pressure-gate-contract.json";
const QUEUE_PATH = ".codex-audit/sdk-roadmap-supervisor/aux-005-aux-008-support-queue.json";
const GUARD_PATH = path.join(repo, "scripts", "check-roadmap-context-pressure.js");
const QUEUE_ITEM_ID = "aux-007-context-pressure-gate";
const QUEUE_LABEL = "AUX-007";

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
  assert.strictEqual(contract.source.queuePath, contract.machineCheck.requiredQueuePath);
  assert.strictEqual(contract.source.queueItemId, contract.machineCheck.requiredQueueItemId);
  assert.strictEqual(contract.source.notRuntimeBehavior, true);
  assert.strictEqual(contract.source.notAnAoIntegration, true);
  assert.strictEqual(contract.guardContract.script, contract.machineCheck.requiredGuardScript);
  assert.strictEqual(contract.guardContract.inputMode, contract.machineCheck.requiredInputMode);
  assert.strictEqual(contract.guardContract.defaultOutput, contract.machineCheck.requiredDefaultOutput);
  assert.strictEqual(contract.guardContract.noDefaultWrites, true);
  assert.strictEqual(contract.guardContract.noImplementationContinuationAfterMandatoryHandoff, true);
  assert.strictEqual(contract.guardContract.noBroadValidationInHardCeiling, true);
  assert.strictEqual(contract.guardContract.noCommandRetries, true);
  assert.strictEqual(contract.guardContract.noAutoFixes, true);

  const queueItem = queue.queueItems.find((item) => item.id === contract.machineCheck.requiredQueueItemId);
  assert(queueItem, "queue must include the AUX-007 item");
  assert.strictEqual(queueItem.label, contract.machineCheck.requiredAuxiliaryId);
  assert(queueItem.plannedPaths.includes(CONTRACT_PATH), "queue planned paths must include contract");
  assert(queueItem.plannedPaths.includes(contract.machineCheck.requiredGuardScript), "queue planned paths must include guard script");
  assert(queueItem.plannedPaths.includes(contract.machineCheck.requiredSmokeScript), "queue planned paths must include smoke script");
  assert.strictEqual(queue.sourceContext.boundaries.runAO, false);
  assert.strictEqual(queue.sourceContext.boundaries.localOllama, false);
  assert.strictEqual(queue.sourceContext.boundaries.liveCepAe, false);
  assert.strictEqual(queue.sourceContext.boundaries.dependencies, false);
  assert.strictEqual(queue.sourceContext.boundaries.push, false);
  assert.strictEqual(queue.sourceContext.boundaries.pullRequest, false);

  assertIncludesAll(
    contract.guardContract.stopReasons,
    contract.machineCheck.requiredStopReasons,
    "stop reasons",
  );
  assertIncludesAll(
    contract.fixtureExpectations.map((fixture) => fixture.id),
    contract.machineCheck.requiredFixtureIds,
    "fixture ids",
  );
  assertFalseClaims(contract);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildFixture(root, id, metrics, state = {}) {
  const dir = path.join(root, id);
  const metricsPath = path.join(dir, "metrics.json");
  const statePath = path.join(dir, "state.json");
  writeJson(metricsPath, {
    queueItemId: QUEUE_ITEM_ID,
    label: QUEUE_LABEL,
    updatedAt: "2026-05-25T12:00:00.000Z",
    context: metrics,
  });
  writeJson(statePath, {
    queueItemId: QUEUE_ITEM_ID,
    label: QUEUE_LABEL,
    status: "running",
    updatedAt: "2026-05-25T12:00:00.000Z",
    contextPressure: state,
  });
  return {
    metricsPath,
    statePath,
  };
}

function runGuard(fixture, extraArgs = []) {
  return childProcess.spawnSync(process.execPath, [
    GUARD_PATH,
    "--state",
    fixture.statePath,
    "--metrics",
    fixture.metricsPath,
    ...extraArgs,
  ], {
    cwd: repo,
    encoding: "utf8",
  });
}

function parseGuardJson(result) {
  assert(result.stdout, "guard must write JSON to stdout");
  return JSON.parse(result.stdout);
}

function assertGuardSourceIsReadOnly() {
  const source = fs.readFileSync(GUARD_PATH, "utf8");
  const forbiddenTokens = [
    ["write", "FileSync"].join(""),
    ["append", "FileSync"].join(""),
    ["mkdir", "Sync"].join(""),
    ["child", "_process"].join(""),
    ["exec", "FileSync"].join(""),
    ["spawn", "Sync"].join(""),
  ];
  for (const token of forbiddenTokens) {
    assert(!source.includes(token), `guard source must not contain ${token}`);
  }
}

function assertPacket(packet, expected) {
  assert.strictEqual(packet.schema, "roadmap-context-pressure-result.v1");
  assert.strictEqual(packet.level, expected.level);
  assert.strictEqual(packet.ok, expected.ok);
  assert.strictEqual(packet.implementationAllowed, expected.ok);
  assert.strictEqual(packet.nextRequiredAction, expected.nextRequiredAction);
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const queue = readJson(QUEUE_PATH);
  assertContractShape(contract, queue);
  assertGuardSourceIsReadOnly();

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-aux-007-context-pressure-"));

  const below = buildFixture(root, "below-threshold", {
    tokenCount: 120000,
    percent: 48,
  });
  const belowResult = runGuard(below);
  assert.strictEqual(belowResult.status, 0, belowResult.stderr);
  const belowPacket = parseGuardJson(belowResult);
  assertPacket(belowPacket, {
    level: "below_threshold",
    ok: true,
    nextRequiredAction: "continue_current_bounded_item",
  });
  assert.deepStrictEqual(belowPacket.stopReasons, []);

  const prepare = buildFixture(root, "prepare-handoff", {
    tokenCount: 151000,
    percent: 61,
  });
  const prepareResult = runGuard(prepare);
  assert.strictEqual(prepareResult.status, 0, prepareResult.stderr);
  const preparePacket = parseGuardJson(prepareResult);
  assertPacket(preparePacket, {
    level: "prepare_handoff",
    ok: true,
    nextRequiredAction: "prepare_handoff_soon",
  });
  assert(preparePacket.warningReasons.includes("context_prepare_handoff_threshold"));

  const mandatory = buildFixture(root, "mandatory-handoff", {
    tokenCount: 186000,
    percent: 73,
  });
  const mandatoryResult = runGuard(mandatory);
  assert.strictEqual(mandatoryResult.status, 1);
  const mandatoryPacket = parseGuardJson(mandatoryResult);
  assertPacket(mandatoryPacket, {
    level: "mandatory_handoff",
    ok: false,
    nextRequiredAction: "stop_implementation_update_handoff",
  });
  assert(mandatoryPacket.stopReasons.includes("context_mandatory_handoff_threshold"));

  const hard = buildFixture(root, "hard-ceiling", {
    tokenCount: 196000,
    percent: 77,
  });
  const hardResult = runGuard(hard);
  assert.strictEqual(hardResult.status, 1);
  const hardPacket = parseGuardJson(hardResult);
  assertPacket(hardPacket, {
    level: "hard_ceiling",
    ok: false,
    nextRequiredAction: "only_handoff_text_allowed",
  });
  assert(hardPacket.stopReasons.includes("context_hard_ceiling_threshold"));

  const markdownResult = runGuard(prepare, ["--format", "markdown"]);
  assert.strictEqual(markdownResult.status, 0, markdownResult.stderr);
  assert(markdownResult.stdout.includes("# Roadmap Context Pressure"));
  assert(markdownResult.stdout.includes("Level: `prepare_handoff`"));
  assert(markdownResult.stdout.includes("Next required action: `prepare_handoff_soon`"));

  console.log("sdk ao context pressure smoke passed");
}

main();

"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const CONTRACT_PATH = ".codex-audit/sdk-ao-pattern-intake/aux-006-handoff-freshness-guard-contract.json";
const QUEUE_PATH = ".codex-audit/sdk-roadmap-supervisor/aux-005-aux-008-support-queue.json";
const GUARD_PATH = path.join(repo, "scripts", "check-roadmap-handoff-freshness.js");
const QUEUE_ITEM_ID = "aux-006-handoff-freshness-guard";
const QUEUE_LABEL = "AUX-006";
const COMMIT = "abc1234";

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
  assert.strictEqual(contract.guardContract.noHandoffAutoUpdate, true);
  assert.strictEqual(contract.guardContract.noCommandRetries, true);
  assert.strictEqual(contract.guardContract.noAutoFixes, true);

  const queueItem = queue.queueItems.find((item) => item.id === contract.machineCheck.requiredQueueItemId);
  assert(queueItem, "queue must include the AUX-006 item");
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
    contract.guardContract.requiredInputs,
    contract.machineCheck.requiredInputs,
    "guard inputs",
  );
  assertIncludesAll(
    contract.guardContract.rejectionReasons,
    contract.machineCheck.requiredRejectionReasons,
    "rejection reasons",
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

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function baseReport(overrides = {}) {
  return {
    queueItemId: QUEUE_ITEM_ID,
    label: QUEUE_LABEL,
    completedAt: "2026-05-25T10:30:00.000Z",
    validation: {
      status: "passed",
      command: "node scripts/sdk-ao-handoff-freshness-smoke.js",
    },
    completedBy: {
      commit: COMMIT,
      supervisorSession: QUEUE_ITEM_ID,
    },
    plannedPaths: [
      CONTRACT_PATH,
      "scripts/check-roadmap-handoff-freshness.js",
      "scripts/sdk-ao-handoff-freshness-smoke.js",
      "plans/target-app-execplan.md",
      ".codex/handoff.md",
    ],
    validationCommands: [
      "node --check scripts/check-roadmap-handoff-freshness.js",
      "node --check scripts/sdk-ao-handoff-freshness-smoke.js",
      "node scripts/sdk-ao-handoff-freshness-smoke.js",
    ],
    ...overrides,
  };
}

function baseState(overrides = {}) {
  return {
    queueItemId: QUEUE_ITEM_ID,
    label: QUEUE_LABEL,
    status: "completed",
    updatedAt: "2026-05-25T10:30:00.000Z",
    completedBy: {
      commit: COMMIT,
      supervisorSession: QUEUE_ITEM_ID,
    },
    handoffPath: ".codex/handoff.md",
    ...overrides,
  };
}

function handoffText({ timestamp = "2026-05-25T10:31:00.000Z", commit = COMMIT, includeNextPrompt = true } = {}) {
  const lines = [
    "# Handoff: AUX-006 handoff freshness guard",
    "",
    `Handoff timestamp: ${timestamp}`,
    "",
    "## Current Goal",
    "",
    "Complete AUX-006 handoff freshness guard.",
    "",
    "## Commit",
    "",
    `Created: ${commit}.`,
    "",
  ];
  if (includeNextPrompt) {
    lines.push(
      "## Exact Next Prompt",
      "",
      "Continue with AUX-007 after committing AUX-006 from a clean tree.",
      "",
    );
  }
  return lines.join("\n");
}

function buildFixture(root, id, report, state, handoff) {
  const dir = path.join(root, id);
  const reportPath = path.join(dir, "report.json");
  const statePath = path.join(dir, "state.json");
  const handoffPath = path.join(dir, "handoff.md");
  writeJson(reportPath, report);
  writeJson(statePath, state);
  writeText(handoffPath, handoff);
  return {
    reportPath,
    statePath,
    handoffPath,
  };
}

function runGuard(fixture, format = "json") {
  return childProcess.spawnSync(process.execPath, [
    GUARD_PATH,
    "--report",
    fixture.reportPath,
    "--state",
    fixture.statePath,
    "--handoff",
    fixture.handoffPath,
    "--format",
    format,
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
    "writeFileSync",
    "appendFileSync",
    "mkdirSync",
    "child_process",
    "execFileSync",
    "spawnSync",
  ];
  for (const token of forbiddenTokens) {
    assert(!source.includes(token), `guard source must not contain ${token}`);
  }
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const queue = readJson(QUEUE_PATH);
  assertContractShape(contract, queue);
  assertGuardSourceIsReadOnly();

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-aux-006-handoff-freshness-"));

  const fresh = buildFixture(root, "fresh", baseReport(), baseState(), handoffText());
  const freshResult = runGuard(fresh);
  assert.strictEqual(freshResult.status, 0, freshResult.stderr);
  const freshPacket = parseGuardJson(freshResult);
  assert.strictEqual(freshPacket.ok, true);
  assert.strictEqual(freshPacket.status, "fresh");
  assert.deepStrictEqual(freshPacket.reasons, []);
  assert.strictEqual(freshPacket.expected.commit, COMMIT);
  assert.strictEqual(freshPacket.expected.nextPromptPresent, true);

  const stale = buildFixture(
    root,
    "stale",
    baseReport(),
    baseState(),
    handoffText({ timestamp: "2026-05-25T10:00:00.000Z" }),
  );
  const staleBefore = fs.readFileSync(stale.handoffPath, "utf8");
  const staleResult = runGuard(stale);
  assert.strictEqual(staleResult.status, 1);
  const stalePacket = parseGuardJson(staleResult);
  assert.strictEqual(stalePacket.ok, false);
  assert(stalePacket.reasons.includes("stale_handoff"));
  assert.strictEqual(fs.readFileSync(stale.handoffPath, "utf8"), staleBefore, "guard must not edit stale handoff");

  const missingCommit = buildFixture(
    root,
    "missing-commit",
    baseReport({ completedBy: {} }),
    baseState({ completedBy: {} }),
    handoffText({ commit: "" }),
  );
  const missingCommitResult = runGuard(missingCommit);
  assert.strictEqual(missingCommitResult.status, 1);
  const missingCommitPacket = parseGuardJson(missingCommitResult);
  assert.strictEqual(missingCommitPacket.ok, false);
  assert(missingCommitPacket.reasons.includes("missing_commit"));

  const missingNextPrompt = buildFixture(
    root,
    "missing-next-prompt",
    baseReport(),
    baseState(),
    handoffText({ includeNextPrompt: false }),
  );
  const missingNextPromptResult = runGuard(missingNextPrompt);
  assert.strictEqual(missingNextPromptResult.status, 1);
  const missingNextPromptPacket = parseGuardJson(missingNextPromptResult);
  assert.strictEqual(missingNextPromptPacket.ok, false);
  assert(missingNextPromptPacket.reasons.includes("missing_next_prompt"));

  const markdownResult = runGuard(fresh, "markdown");
  assert.strictEqual(markdownResult.status, 0, markdownResult.stderr);
  assert(markdownResult.stdout.includes("# Roadmap Handoff Freshness"));
  assert(markdownResult.stdout.includes("Status: `fresh`"));
  assert(markdownResult.stdout.includes(`Commit: \`${COMMIT}\``));

  console.log("sdk ao handoff freshness smoke passed");
}

main();

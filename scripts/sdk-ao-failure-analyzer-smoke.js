"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const CONTRACT_PATH = ".codex-audit/sdk-ao-pattern-intake/aux-004-readonly-failure-analyzer-contract.json";
const AUX_PARENT_ACTIVITY_PATH = ".codex-audit/sdk-ao-pattern-intake/aux-001-activity-session-schema.json";
const AUX_PARENT_ESCALATION_PATH = ".codex-audit/sdk-ao-pattern-intake/aux-002-stuck-escalation-design.json";
const AUX_PARENT_DASHBOARD_PATH = ".codex-audit/sdk-ao-pattern-intake/aux-003-status-dashboard-contract.json";
const LEGACY_PARENT_ACTIVITY_PATH = ".codex-audit/sdk-ao-pattern-intake/212-activity-session-schema.json";
const LEGACY_PARENT_ESCALATION_PATH = ".codex-audit/sdk-ao-pattern-intake/213-stuck-escalation-design.json";
const LEGACY_PARENT_DASHBOARD_PATH = ".codex-audit/sdk-ao-pattern-intake/214-status-dashboard-contract.json";
const QUEUE_PATH = ".codex-audit/sdk-roadmap-supervisor/211-ao-inspired-pipeline-hardening-queue.json";
const ANALYZER_PATH = path.join(repo, "scripts", "create-roadmap-failure-analyzer-packet.js");

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

function assertContractShape(contract, auxParents, legacyParents, queue) {
  assert.strictEqual(contract.schema, contract.machineCheck.requiredSchema);
  assert.strictEqual(contract.auxiliaryId, contract.machineCheck.requiredAuxiliaryId);
  assert.strictEqual(contract.source.queueItemId, contract.machineCheck.requiredQueueItemId);
  assert.strictEqual(contract.source.legacyQueueItemId, contract.machineCheck.legacyQueueItemId);
  assert.deepStrictEqual(
    auxParents.map((parent) => parent.schema),
    contract.machineCheck.requiredParentCompatibilitySchemas,
  );
  assert.deepStrictEqual(
    legacyParents.map((parent) => parent.schema),
    contract.machineCheck.requiredLegacyParentSchemas,
  );
  assert.strictEqual(contract.source.queuePath, contract.machineCheck.requiredQueuePath);
  assert.strictEqual(contract.source.notRuntimeBehavior, true);
  assert.strictEqual(contract.source.notAnAoIntegration, true);
  assert.strictEqual(contract.packetContract.format, contract.machineCheck.requiredFormat);
  assert.strictEqual(contract.packetContract.inputMode, contract.machineCheck.requiredInputMode);
  assert.strictEqual(contract.packetContract.defaultOutput, contract.machineCheck.requiredDefaultOutput);
  assert.strictEqual(contract.packetContract.noDefaultWrites, true);
  assert.strictEqual(contract.cliContract.script, contract.machineCheck.requiredAnalyzerScript);
  assert(queue.queueItems.some((item) => item.id === contract.machineCheck.requiredQueueItemId));
  assert(queue.sourceContext.auxiliaryLabelDecision.includes("AUX-###"));

  assertIncludesAll(
    contract.packetContract.requiredPacketFields,
    contract.machineCheck.requiredPacketFields,
    "packet fields",
  );
  assertIncludesAll(
    contract.packetContract.failureClasses,
    contract.machineCheck.requiredFailureClasses,
    "failure classes",
  );
  assertIncludesAll(
    contract.cliContract.forbiddenSideEffects,
    [
      "edit source files",
      "retry commands",
      "run live AE/CEP",
      "install dependencies",
      "create branch, worktree, push, PR, GitHub issue, or GitHub Action",
    ],
    "forbidden CLI side effects",
  );
  assertFalseClaims(contract);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonl(filePath, events) {
  fs.writeFileSync(filePath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
}

function writeLines(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function buildValidationFailureFixture(root) {
  const sessionRoot = path.join(root, "validation-session");
  const reportPath = path.join(root, "validation-report.json");
  const logPath = path.join(root, "validation.log");

  writeJson(reportPath, {
    taskId: "aux-004-ao-readonly-failure-analyzer",
    command: "node scripts/sdk-ao-failure-analyzer-smoke.js",
    status: "failed",
    validation: {
      result: "failed",
      exitCode: 1,
      command: "node scripts/sdk-ao-failure-analyzer-smoke.js",
    },
    changedPaths: [
      ".codex-audit/sdk-ao-pattern-intake/aux-004-readonly-failure-analyzer-contract.json",
      "scripts/create-roadmap-failure-analyzer-packet.js",
    ],
    plannedPaths: [
      ".codex-audit/sdk-ao-pattern-intake/aux-004-readonly-failure-analyzer-contract.json",
      "scripts/create-roadmap-failure-analyzer-packet.js",
      "scripts/sdk-ao-failure-analyzer-smoke.js",
      "plans/target-app-execplan.md",
      ".codex/handoff.md",
    ],
    validationCommands: [
      "node --check scripts/create-roadmap-failure-analyzer-packet.js",
      "node scripts/sdk-ao-failure-analyzer-smoke.js",
    ],
  });

  fs.mkdirSync(sessionRoot, { recursive: true });
  writeJson(path.join(sessionRoot, "state.json"), {
    sessionId: "validation-session",
    queueItemId: "aux-004-ao-readonly-failure-analyzer",
    role: "writer",
    state: "errored",
    validationResult: "failed",
    command: "node scripts/sdk-ao-failure-analyzer-smoke.js",
    changedPaths: [
      "scripts/create-roadmap-failure-analyzer-packet.js",
    ],
  });
  writeJsonl(path.join(sessionRoot, "events.jsonl"), [
    {
      ts: "2026-05-24T19:00:00.000Z",
      event: "validation_started",
      state: "active",
      command: "node scripts/sdk-ao-failure-analyzer-smoke.js",
    },
    {
      ts: "2026-05-24T19:01:00.000Z",
      event: "validation_failed",
      state: "errored",
      command: "node scripts/sdk-ao-failure-analyzer-smoke.js",
      exitCode: 1,
    },
  ]);
  writeLines(logPath, [
    "line 1: setup",
    "line 2: running smoke",
    "line 3: checking packet",
    "line 4: AssertionError: expected validation result",
    "line 5: failure summary",
    "line 6: command exited with 1",
  ]);

  return {
    reportPath,
    logPath,
    sessionRoot,
  };
}

function buildStuckSessionFixture(root) {
  const sessionRoot = path.join(root, "stuck-session");
  fs.mkdirSync(sessionRoot, { recursive: true });
  writeJson(path.join(sessionRoot, "state.json"), {
    sessionId: "stuck-session",
    queueItemId: "aux-004-ao-readonly-failure-analyzer",
    role: "writer",
    state: "stuck",
    status: "stuck",
    blockers: [
      "no activity heartbeat for 15 minutes",
    ],
    plannedPaths: [
      ".codex-audit/sdk-ao-pattern-intake/aux-004-readonly-failure-analyzer-contract.json",
      "scripts/create-roadmap-failure-analyzer-packet.js",
    ],
    changedPaths: [],
    validationCommands: [
      "node scripts/sdk-ao-failure-analyzer-smoke.js",
    ],
  });
  writeJsonl(path.join(sessionRoot, "events.jsonl"), [
    {
      ts: "2026-05-24T19:10:00.000Z",
      event: "active",
      state: "active",
      command: "node scripts/sdk-ao-failure-analyzer-smoke.js",
    },
    {
      ts: "2026-05-24T19:30:00.000Z",
      event: "stuck",
      state: "stuck",
      message: "No fresh activity observed.",
      nextAction: "Stop and hand off with blockers before retrying.",
    },
  ]);
  return {
    sessionRoot,
  };
}

function runAnalyzer(args) {
  return childProcess.execFileSync(process.execPath, [ANALYZER_PATH, ...args], {
    cwd: repo,
    encoding: "utf8",
  });
}

function assertPacketSafety(packet) {
  assert(packet.repairPrompt, "packet must include a repair prompt");
  assert(packet.nextBoundedTask, "packet must include nextBoundedTask");
  assert(packet.nextBoundedTask.goal, "next bounded task must include goal");
  assertIncludesAll(
    packet.forbiddenAutoActions,
    [
      "auto_fix",
      "retry_command",
      "run_live_cep_ae",
      "install_dependencies",
      "push_or_pr",
    ],
    "packet forbidden auto-actions",
  );
  assert(packet.repairPrompt.includes("Do not auto-fix"));
  assert(packet.repairPrompt.includes("run live AE/CEP"));
  assert(packet.repairPrompt.includes("install dependencies"));
  assert(packet.repairPrompt.includes("push"));
  assert(packet.nextBoundedTask.stopConditions.includes("dependency_or_package_change_needed"));
  assert(packet.nextBoundedTask.stopConditions.includes("live_cep_ae_needed"));
}

function assertAnalyzerSourceIsReadOnly() {
  const source = fs.readFileSync(ANALYZER_PATH, "utf8");
  assert(!source.includes("writeFileSync"), "analyzer must not write files");
  assert(!source.includes("appendFileSync"), "analyzer must not append files");
  assert(!source.includes("child_process"), "analyzer must not run commands");
  assert(!source.includes("execFileSync"), "analyzer must not retry commands");
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const auxParents = [
    readJson(AUX_PARENT_ACTIVITY_PATH),
    readJson(AUX_PARENT_ESCALATION_PATH),
    readJson(AUX_PARENT_DASHBOARD_PATH),
  ];
  const legacyParents = [
    readJson(LEGACY_PARENT_ACTIVITY_PATH),
    readJson(LEGACY_PARENT_ESCALATION_PATH),
    readJson(LEGACY_PARENT_DASHBOARD_PATH),
  ];
  const queue = readJson(QUEUE_PATH);
  assertContractShape(contract, auxParents, legacyParents, queue);
  assertAnalyzerSourceIsReadOnly();

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-aux-004-failure-analyzer-"));
  const validationFixture = buildValidationFailureFixture(root);
  const validationPacket = JSON.parse(runAnalyzer([
    "--report",
    validationFixture.reportPath,
    "--log",
    validationFixture.logPath,
    "--session",
    validationFixture.sessionRoot,
    "--tail-lines",
    "4",
  ]));
  assert.strictEqual(validationPacket.failureClass, "validation_failure");
  assert.strictEqual(validationPacket.command, "node scripts/sdk-ao-failure-analyzer-smoke.js");
  assert(validationPacket.relevantLogTail.includes("AssertionError: expected validation result"));
  assert(!validationPacket.relevantLogTail.includes("line 1: setup"));
  assert(validationPacket.changedPaths.includes("scripts/create-roadmap-failure-analyzer-packet.js"));
  assert.strictEqual(validationPacket.suspectedCause.confidence, "high");
  assertPacketSafety(validationPacket);

  const stuckFixture = buildStuckSessionFixture(root);
  const stuckPacket = JSON.parse(runAnalyzer([
    "--session",
    stuckFixture.sessionRoot,
    "--format",
    "json",
  ]));
  assert.strictEqual(stuckPacket.failureClass, "stuck_session");
  assert(stuckPacket.repairPrompt.includes("stuck_session"));
  assert(stuckPacket.repairPrompt.includes("Do not auto-fix"));
  assertPacketSafety(stuckPacket);

  const markdown = runAnalyzer([
    "--session",
    stuckFixture.sessionRoot,
    "--format",
    "markdown",
  ]);
  assert(markdown.includes("# Roadmap Failure Analyzer Packet"));
  assert(markdown.includes("Failure class: `stuck_session`"));
  assert(markdown.includes("## Repair Prompt"));
  assert(markdown.includes("## Forbidden Auto-Actions"));
  assert(markdown.includes("`run_live_cep_ae`"));

  console.log("sdk ao failure analyzer smoke passed");
}

main();

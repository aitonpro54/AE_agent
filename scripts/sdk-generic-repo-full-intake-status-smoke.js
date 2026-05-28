"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const runner = path.join(repo, "orchestrator", "full-intake-status.mjs");

function run(args) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createFixture() {
  const parent = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, "full-intake-status-"));
  assert(root.startsWith(`${parent}${path.sep}`), `unexpected temp path: ${root}`);
  const target = path.join(root, "target");
  const runId = "fixture-compact";
  const runRoot = path.join(target, ".codex-runtime", "sdk", "generic-repo-full-intake", runId);
  fs.mkdirSync(runRoot, { recursive: true });
  writeJson(path.join(runRoot, "state.json"), {
    schema: "generic-repo-full-intake.state.v1",
    runId,
    status: "running",
    updatedAt: "2026-05-27T15:00:00.000Z",
    items: [
      {
        candidateId: "tool-completed",
        sourcePath: "Layers/Completed.jsx",
        status: "completed",
        commitId: "abc123",
        completedAt: "2026-05-27T14:55:00.000Z"
      }
    ],
    completedCandidateIds: ["tool-completed"],
    blockedCandidateIds: [],
    skippedCandidateIds: [],
    commitIds: ["abc123"]
  });
  fs.writeFileSync(
    path.join(runRoot, "events.jsonl"),
    [
      JSON.stringify({ event: "candidate_started", candidateId: "tool-completed", at: "2026-05-27T14:50:00.000Z" }),
      JSON.stringify({ event: "candidate_completed", candidateId: "tool-completed", commitId: "abc123", at: "2026-05-27T14:55:00.000Z" }),
      JSON.stringify({ event: "candidate_started", candidateId: "tool-running", at: "2026-05-27T15:00:00.000Z" }),
      ""
    ].join("\n"),
    "utf8"
  );
  writeJson(path.join(runRoot, "queue-supervisor", "fixture-import", "batch-report.json"), {
    schema: "generic-repo-queue-supervisor.batch-report.v1",
    ok: false,
    status: "failed_during_import",
    runId: "fixture-import",
    selectedCandidateIds: ["tool-running"],
    importedCandidateCount: 0,
    blockedCandidateCount: 0,
    nextCandidate: { id: "tool-running" },
    importer: {
      runId: "queue-fixture-import",
      error: "implementation-child-run-timeout: queue-batch-1-fixture"
    },
    items: [
      {
        candidateId: "tool-running",
        status: "failed_importer",
        reason: "implementation-child-run-timeout: queue-batch-1-fixture"
      }
    ]
  });
  return { root, target, runId, runRoot };
}

function removeFixture(root) {
  if (process.env.KEEP_FULL_INTAKE_STATUS_FIXTURE === "1") {
    return;
  }
  const parent = path.resolve(os.tmpdir());
  if (!root || !root.startsWith(`${parent}${path.sep}`)) {
    throw new Error(`refusing to remove unexpected temp path: ${root}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
}

function assertJsonCompactStatus() {
  const fixture = createFixture();
  try {
    const result = run([
      "--target-repo",
      fixture.target,
      "--run-id",
      fixture.runId,
      "--json",
      "--no-processes",
      "--write-status"
    ]);
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.schema, "generic-repo-full-intake.compact-status.v1");
    assert.strictEqual(output.status, "running");
    assert.strictEqual(output.currentCandidate.candidateId, "tool-running");
    assert.strictEqual(output.currentCandidate.source, "events.jsonl");
    assert.strictEqual(output.counts.completed, 1);
    assert.strictEqual(output.latestBatchReports.length, 1);
    assert.strictEqual(output.latestBatchReports[0].importerError, "implementation-child-run-timeout: queue-batch-1-fixture");
    assert(output.nextAction.includes("stale run") || output.nextAction.includes("compact status"));
    const compactPath = path.join(fixture.runRoot, "compact-status.json");
    assert(fs.existsSync(compactPath), "compact-status.json should be written when requested.");
    const written = JSON.parse(fs.readFileSync(compactPath, "utf8"));
    assert.strictEqual(written.currentCandidate.candidateId, "tool-running");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertHumanOutputStaysSmall() {
  const fixture = createFixture();
  try {
    const result = run([
      "--target-repo",
      fixture.target,
      "--run-id",
      fixture.runId,
      "--compact",
      "--no-processes",
      "--event-limit",
      "5",
      "--batch-limit",
      "1"
    ]);
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert(result.stdout.includes("Full-intake compact status: fixture-compact"));
    assert(result.stdout.includes("Current: tool-running"));
    assert(result.stdout.includes("Latest batch: fixture-import -> failed_during_import"));
    assert(!result.stdout.includes("single-candidate-ledger"), "compact output must not point users at huge ledgers.");
    assert(result.stdout.split(/\r?\n/).filter(Boolean).length <= 14, "compact output should remain chat-small.");
  } finally {
    removeFixture(fixture.root);
  }
}

function main() {
  assertJsonCompactStatus();
  assertHumanOutputStaysSmall();
  console.log(JSON.stringify({ ok: true, smoke: "generic-repo-full-intake-status" }, null, 2));
}

main();

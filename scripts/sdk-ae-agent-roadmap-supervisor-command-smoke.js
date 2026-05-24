"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const runner = path.join(repo, "orchestrator/run-ae-agent-roadmap-supervisor.mjs");

function run(args, cwd = repo) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
  });
}

function parseJson(result) {
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function sh(cwd, args) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function initRepo(temp) {
  sh(temp, ["git", "init"]);
  fs.writeFileSync(path.join(temp, "base.txt"), "base\n", "utf8");
  fs.writeFileSync(path.join(temp, ".gitignore"), ".codex-runtime/\n", "utf8");
  sh(temp, ["git", "add", "base.txt", ".gitignore"]);
  sh(temp, [
    "git",
    "-c",
    "user.name=Smoke",
    "-c",
    "user.email=smoke@example.local",
    "commit",
    "-m",
    "base",
  ]);
}

function createTempRepo(name) {
  const parent = path.resolve(os.tmpdir());
  const temp = fs.mkdtempSync(path.join(parent, `roadmap-supervisor-smoke-${name}-`));
  assert(
    temp.startsWith(`${parent}${path.sep}`) &&
      path.basename(temp).startsWith(`roadmap-supervisor-smoke-${name}-`),
    `unexpected temp path: ${temp}`,
  );
  initRepo(temp);
  return temp;
}

function removeTempRepo(temp) {
  const parent = path.resolve(os.tmpdir());
  if (
    temp &&
    temp.startsWith(`${parent}${path.sep}`) &&
    path.basename(temp).startsWith("roadmap-supervisor-smoke-")
  ) {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function item(id, milestone, options = {}) {
  const planned = options.plannedPaths || [`${id}.txt`, ".codex/handoff.md"];
  return {
    id,
    milestone,
    title: id,
    dependencies: options.dependencies || [],
    runner: {
      kind: "fixture",
      action: options.action || "write-planned",
      writePaths: options.writePaths || planned,
      unplannedPath: options.unplannedPath,
    },
    mode: "fixture",
    plannedPaths: planned,
    forbiddenPaths: ["cep-panel/**", "package-lock.json", "node_modules/**"],
    allowedCommands: options.allowedCommands || ["git diff --check"],
    validationCommands: options.validationCommands || ["git diff --check"],
    reviewerTasks: options.reviewerTasks || [],
    reviewerBlocking: options.reviewerBlocking || false,
    approval: {
      state: options.approvalState || "approved",
      freshRequired: true,
    },
    maxChildRuns: options.maxChildRuns ?? 1,
    maxMinutes: options.maxMinutes || 5,
    commitPolicy: {
      autoCommit: true,
      message: options.commitMessage || `test: ${id}`,
    },
    handoffPolicy: {
      required: true,
      path: ".codex/handoff.md",
    },
    stopGates: [
      "dirty-git-before-execution",
      "missing-exact-fresh-approval",
      "dependency-not-completed",
      "changed-path-outside-planned-paths",
      "validation-failed",
      "context-pressure",
    ],
    status: options.status || "queued",
  };
}

function writeQueue(temp, items) {
  const queuePath = path.join(temp, ".codex-audit", "sdk-roadmap-supervisor", "queue.json");
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.writeFileSync(queuePath, JSON.stringify({
    schema: "sdk-roadmap-supervisor-queue.v1",
    queueItems: items,
  }, null, 2), "utf8");
  sh(temp, ["git", "add", ".codex-audit/sdk-roadmap-supervisor/queue.json"]);
  sh(temp, [
    "git",
    "-c",
    "user.name=Smoke",
    "-c",
    "user.email=smoke@example.local",
    "commit",
    "-m",
    "queue",
  ]);
  return ".codex-audit/sdk-roadmap-supervisor/queue.json";
}

function approvalFor(temp, queuePath, extra = []) {
  const plan = parseJson(run(["--plan-only", "--queue", queuePath, "--json", ...extra], temp));
  assert.strictEqual(plan.childRunsCreated, false);
  assert.strictEqual(plan.sdkThreadCreated, false);
  assert.strictEqual(plan.runtimeStateWritten, false);
  return plan.approvalText;
}

function assertDefaultPlanOnly() {
  const result = parseJson(run(["--plan-only", "--json"]));
  assert.strictEqual(result.mode, "plan-only");
  assert.strictEqual(result.childRunsCreated, false);
  assert.strictEqual(result.sdkThreadCreated, false);
  assert.strictEqual(result.maxItems, 3);
  assert.strictEqual(result.maxMinutes, 180);
  assert.match(result.approvalText, /noPush=true/);
  assert(result.items.some((entry) => entry.id === "m199-roadmap-supervisor-contract-preview"));
}

function assertUnsafeFlagsRejected() {
  for (const flag of ["--push", "--pr", "--dependency", "--live", "--cep-panel-sdk-write"]) {
    const result = run(["--plan-only", flag]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /Unsafe roadmap supervisor flag rejected/);
  }
}

function assertWrongApprovalFails() {
  const temp = createTempRepo("wrong-approval");
  try {
    const queuePath = writeQueue(temp, [item("one", 1)]);
    const result = run([
      "--execute-one",
      "--queue",
      queuePath,
      "--item",
      "one",
      "--approval-text",
      "wrong",
    ], temp);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /Missing exact --approval-text/);
  } finally {
    removeTempRepo(temp);
  }
}

function assertDirtyTreeFails() {
  const temp = createTempRepo("dirty");
  try {
    const queuePath = writeQueue(temp, [item("one", 1)]);
    const approval = approvalFor(temp, queuePath, ["--max-items", "1"]);
    fs.writeFileSync(path.join(temp, "dirty.txt"), "dirty\n", "utf8");
    const result = run([
      "--execute-one",
      "--queue",
      queuePath,
      "--item",
      "one",
      "--max-items",
      "1",
      "--approval-text",
      approval,
    ], temp);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /dirty git state/);
  } finally {
    removeTempRepo(temp);
  }
}

function assertExecuteOneCommits() {
  const temp = createTempRepo("execute-one");
  try {
    const queuePath = writeQueue(temp, [item("one", 1)]);
    const approval = approvalFor(temp, queuePath, ["--max-items", "1"]);
    const result = parseJson(run([
      "--execute-one",
      "--queue",
      queuePath,
      "--item",
      "one",
      "--max-items",
      "1",
      "--session-id",
      "execute-one",
      "--approval-text",
      approval,
      "--json",
    ], temp));
    assert.strictEqual(result.mode, "execute-one");
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.results[0].item, "one");
    assert(fs.existsSync(path.join(temp, result.finalReportPath)));
    assert.strictEqual(sh(temp, ["git", "status", "--porcelain"]), "");
    assert.strictEqual(sh(temp, ["git", "log", "-1", "--format=%s"]), "test: one");
  } finally {
    removeTempRepo(temp);
  }
}

function assertUnplannedPathFails() {
  const temp = createTempRepo("unplanned");
  try {
    const queuePath = writeQueue(temp, [item("one", 1, {
      action: "write-unplanned",
      unplannedPath: "surprise.txt",
    })]);
    const approval = approvalFor(temp, queuePath, ["--max-items", "1"]);
    const result = run([
      "--execute-one",
      "--queue",
      queuePath,
      "--item",
      "one",
      "--max-items",
      "1",
      "--approval-text",
      approval,
    ], temp);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /outside plannedPaths/);
    assert.strictEqual(sh(temp, ["git", "log", "--oneline"]).split(/\r?\n/).length, 2);
  } finally {
    removeTempRepo(temp);
  }
}

function assertValidationFailureStops() {
  const temp = createTempRepo("validation");
  try {
    const queuePath = writeQueue(temp, [
      item("one", 1, {
        allowedCommands: ["missing-roadmap-supervisor-validation-command"],
        validationCommands: ["missing-roadmap-supervisor-validation-command"],
      }),
      item("two", 2, { dependencies: ["one"] }),
    ]);
    const approval = approvalFor(temp, queuePath, ["--max-items", "2"]);
    const result = run([
      "--run-until-budget",
      "--queue",
      queuePath,
      "--max-items",
      "2",
      "--approval-text",
      approval,
    ], temp);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /Validation failed/);
    assert.strictEqual(sh(temp, ["git", "log", "--oneline"]).split(/\r?\n/).length, 2);
  } finally {
    removeTempRepo(temp);
  }
}

function assertRunUntilBudgetAndResume() {
  const temp = createTempRepo("budget");
  try {
    const queuePath = writeQueue(temp, [
      item("one", 1, { reviewerTasks: [{ id: "risk", kind: "noop" }] }),
      item("two", 2, { dependencies: ["one"] }),
    ]);
    const approvalOne = approvalFor(temp, queuePath, ["--max-items", "1"]);
    const first = parseJson(run([
      "--run-until-budget",
      "--queue",
      queuePath,
      "--max-items",
      "1",
      "--session-id",
      "budget-session",
      "--reviewers",
      "parallel",
      "--approval-text",
      approvalOne,
      "--json",
    ], temp));
    assert.strictEqual(first.stopReason, "max-items");
    assert.deepStrictEqual(first.completedItems, ["one"]);
    assert.strictEqual(first.results[0].reviewerResults.length, 1);
    assert.strictEqual(sh(temp, ["git", "log", "-1", "--format=%s"]), "test: one");

    const approvalTwo = approvalFor(temp, queuePath, ["--max-items", "2"]);
    const second = parseJson(run([
      "--run-until-budget",
      "--queue",
      queuePath,
      "--max-items",
      "2",
      "--resume-session",
      "budget-session",
      "--approval-text",
      approvalTwo,
      "--json",
    ], temp));
    assert.strictEqual(second.results.length, 1);
    assert.deepStrictEqual(second.completedItems, ["one", "two"]);
    assert.strictEqual(sh(temp, ["git", "log", "-1", "--format=%s"]), "test: two");
    assert.strictEqual(sh(temp, ["git", "status", "--porcelain"]), "");
  } finally {
    removeTempRepo(temp);
  }
}

function main() {
  assertDefaultPlanOnly();
  assertUnsafeFlagsRejected();
  assertWrongApprovalFails();
  assertDirtyTreeFails();
  assertExecuteOneCommits();
  assertUnplannedPathFails();
  assertValidationFailureStops();
  assertRunUntilBudgetAndResume();

  console.log("SDK AE Agent roadmap supervisor command smoke: pass");
}

if (require.main === module) {
  main();
}

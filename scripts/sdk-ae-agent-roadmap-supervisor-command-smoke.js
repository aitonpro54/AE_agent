"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const runner = path.join(repo, "orchestrator/run-ae-agent-roadmap-supervisor.mjs");

function run(args, cwd = repo, options = {}) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd,
    encoding: "utf8",
    env: options.env || process.env,
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
  fs.writeFileSync(path.join(temp, ".gitignore"), ".codex/\n.codex-runtime/\nbin/\n", "utf8");
  fs.mkdirSync(path.join(temp, "orchestrator"), { recursive: true });
  fs.mkdirSync(path.join(temp, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(temp, "bin"), { recursive: true });
  fs.writeFileSync(
    path.join(temp, "orchestrator", "codex-sdk-orchestrator.mjs"),
    [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "if (process.env.FAKE_CODEX_SDK_FAIL_PARSE === '1') {",
      "  console.error('Failed to parse item: SUCCESS: The process with PID 16172 (child process of PID 12936) has been terminated.');",
      "  process.exit(1);",
      "}",
      "const promptIndex = process.argv.indexOf('--prompt');",
      "const prompt = promptIndex === -1 ? '' : process.argv[promptIndex + 1] || '';",
      "const match = prompt.match(/<roadmap_item_json>\\n([\\s\\S]*?)\\n<\\/roadmap_item_json>/);",
      "if (!match) { console.log('read-only reviewer no-op'); process.exit(0); }",
      "const item = JSON.parse(match[1]);",
      "for (const repoPath of item.plannedPaths || []) {",
      "  const target = path.join(process.cwd(), repoPath.replace(/\\\\/g, '/'));",
      "  fs.mkdirSync(path.dirname(target), { recursive: true });",
      "  fs.writeFileSync(target, `roadmap-sdk wrote ${item.id}\\n`, 'utf8');",
      "}",
      "console.log(`roadmap-sdk wrote ${item.id}`);",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(temp, "bin", "fake-codex-cli.mjs"),
    [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "const prompt = fs.readFileSync(0, 'utf8');",
      "const match = prompt.match(/<roadmap_item_json>\\n([\\s\\S]*?)\\n<\\/roadmap_item_json>/);",
      "if (!match) { console.log('read-only reviewer no-op'); process.exit(0); }",
      "const item = JSON.parse(match[1]);",
      "for (const repoPath of item.plannedPaths || []) {",
      "  const target = path.join(process.cwd(), repoPath.replace(/\\\\/g, '/'));",
      "  fs.mkdirSync(path.dirname(target), { recursive: true });",
      "  fs.writeFileSync(target, `roadmap-cli wrote ${item.id}\\n`, 'utf8');",
      "}",
      "console.log(`roadmap-cli wrote ${item.id}`);",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(temp, "bin", "codex.cmd"),
    [
      "@echo off",
      "node \"%~dp0fake-codex-cli.mjs\" %*",
      "",
    ].join("\r\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(temp, "bin", "verify-roadmap-args.cmd"),
    [
      "@echo off",
      "if \"%~1\"==\"alpha beta\" if \"%~2\"==\"plain\" exit /b 0",
      "echo unexpected args [%~1] [%~2] 1>&2",
      "exit /b 7",
      "",
    ].join("\r\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(temp, "scripts", "cep-panel-cdp-smoke.js"),
    [
      '"use strict";',
      "const mode = process.argv[2];",
      "if (mode === 'inspect' || mode === 'connector-status-smoke') {",
      "  console.log(JSON.stringify({ ok: true, mode }));",
      "  process.exit(0);",
      "}",
      "console.error('unexpected mode ' + mode);",
      "process.exit(1);",
      "",
    ].join("\n"),
    "utf8",
  );
  sh(temp, [
    "git",
    "add",
    "base.txt",
    ".gitignore",
    "orchestrator/codex-sdk-orchestrator.mjs",
    "scripts/cep-panel-cdp-smoke.js",
  ]);
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

function envWithFakeCodex(temp, extra = {}) {
  const env = { ...process.env, ...extra };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  env[pathKey] = `${path.join(temp, "bin")}${path.delimiter}${env[pathKey] || ""}`;
  return env;
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
  const runner = options.runner || (
    options.runnerKind === "roadmap-sdk"
      ? { kind: "roadmap-sdk" }
      : {
          kind: "fixture",
          action: options.action || "write-planned",
          writePaths: options.writePaths || planned,
          unplannedPath: options.unplannedPath,
        }
  );
  return {
    id,
    milestone,
    title: id,
    dependencies: options.dependencies || [],
    runner,
    mode: options.mode || (runner.kind === "roadmap-sdk" ? "sdk-write" : "fixture"),
    plannedPaths: planned,
    forbiddenPaths: ["cep-panel/**", "package-lock.json", "node_modules/**"],
    allowedActions: options.allowedActions || [`complete ${id} within planned paths`],
    forbiddenActions: options.forbiddenActions || ["push", "create a PR", "install packages"],
    allowedCommands: options.allowedCommands || ["git diff --check"],
    validationCommands: options.validationCommands || ["git diff --check"],
    reviewerTasks: options.reviewerTasks || [],
    reviewerBlocking: options.reviewerBlocking || false,
    liveValidation: options.liveValidation || {
      mode: "none",
      commands: [],
    },
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
  assert.match(result.approvalText, /queueSha256=[a-f0-9]{64}/);
  assert.match(result.approvalText, /itemIds=/);
  assert.match(result.approvalText, /liveBindings=/);
  assert(result.items.some((entry) => entry.id === "m199-roadmap-supervisor-contract-preview"));
}

function assertLiveCheckPasses() {
  const temp = createTempRepo("live-check");
  try {
    const queuePath = writeQueue(temp, [item("one", 1)]);
    const result = parseJson(run([
      "--live-check",
      "--queue",
      queuePath,
      "--session-id",
      "live-check",
      "--json",
    ], temp));
    assert.strictEqual(result.mode, "live-check");
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(
      result.liveConnectivityResults.map((entry) => entry.id),
      ["live-cep-inspect", "live-connector-status-smoke"],
    );
    assert(fs.existsSync(path.join(temp, result.finalReportPath)));
    assert.strictEqual(sh(temp, ["git", "status", "--porcelain"]), "");
  } finally {
    removeTempRepo(temp);
  }
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

function assertSupervisorFinalizesIgnoredHandoff() {
  const temp = createTempRepo("ignored-handoff");
  try {
    const queuePath = writeQueue(temp, [item("one", 1, {
      runner: {
        kind: "fixture",
        action: "write-planned",
        writePaths: ["one.txt"],
      },
    })]);
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
      "ignored-handoff",
      "--approval-text",
      approval,
      "--json",
    ], temp));
    assert.strictEqual(result.ok, true);
    assert.match(
      fs.readFileSync(path.join(temp, ".codex", "handoff.md"), "utf8"),
      /finalized by deterministic roadmap supervisor/,
    );
    assert.strictEqual(sh(temp, ["git", "status", "--porcelain"]), "");
    assert.strictEqual(sh(temp, ["git", "log", "-1", "--format=%s"]), "test: one");
  } finally {
    removeTempRepo(temp);
  }
}

function assertQueueHashApprovalBinding() {
  const temp = createTempRepo("queue-hash");
  try {
    let queuePath = writeQueue(temp, [item("one", 1)]);
    const approval = approvalFor(temp, queuePath, ["--max-items", "1"]);
    queuePath = writeQueue(temp, [item("one", 1), item("two", 2, { dependencies: ["one"] })]);
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
    assert.match(result.stderr, /Missing exact --approval-text/);
    assert.match(result.stderr, /queueSha256=/);
    assert.match(result.stderr, /itemIds=one,two/);
  } finally {
    removeTempRepo(temp);
  }
}

function assertRoadmapSdkExecuteOneCommits() {
  const temp = createTempRepo("roadmap-sdk-one");
  try {
    const queuePath = writeQueue(temp, [item("one", 1, {
      runnerKind: "roadmap-sdk",
      approvalState: "pending-explicit-approval",
    })]);
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
      "roadmap-sdk-one",
      "--approval-text",
      approval,
      "--json",
    ], temp));
    assert.strictEqual(result.mode, "execute-one");
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.results[0].item, "one");
    assert.match(fs.readFileSync(path.join(temp, "one.txt"), "utf8"), /roadmap-sdk wrote one/);
    assert.strictEqual(sh(temp, ["git", "status", "--porcelain"]), "");
    assert.strictEqual(sh(temp, ["git", "log", "-1", "--format=%s"]), "test: one");
  } finally {
    removeTempRepo(temp);
  }
}

function assertRoadmapSdkCliExecuteOneCommits() {
  const temp = createTempRepo("roadmap-sdk-cli");
  try {
    const queuePath = writeQueue(temp, [item("one", 1, {
      runnerKind: "roadmap-sdk",
      approvalState: "pending-explicit-approval",
    })]);
    const approval = approvalFor(temp, queuePath, ["--max-items", "1"]);
    const result = parseJson(run([
      "--execute-one",
      "--queue",
      queuePath,
      "--item",
      "one",
      "--engine",
      "cli",
      "--max-items",
      "1",
      "--session-id",
      "roadmap-sdk-cli",
      "--approval-text",
      approval,
      "--json",
    ], temp, {
      env: envWithFakeCodex(temp, { FAKE_CODEX_SDK_FAIL_PARSE: "1" }),
    }));
    assert.strictEqual(result.mode, "execute-one");
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.results[0].item, "one");
    assert.match(fs.readFileSync(path.join(temp, "one.txt"), "utf8"), /roadmap-cli wrote one/);
    assert.strictEqual(sh(temp, ["git", "status", "--porcelain"]), "");
    assert.strictEqual(sh(temp, ["git", "log", "-1", "--format=%s"]), "test: one");
    const childLog = fs.readFileSync(
      path.join(temp, ".codex-runtime", "sdk", "roadmap-supervisor", "roadmap-sdk-cli", "children", "one.log"),
      "utf8",
    );
    assert.match(childLog, /roadmap-cli wrote one/);
    assert.doesNotMatch(childLog, /Failed to parse item/);
  } finally {
    removeTempRepo(temp);
  }
}

function assertRequireLiveConnectivityAndItemLiveValidation() {
  const temp = createTempRepo("item-live");
  try {
    const liveCommand = "node scripts/cep-panel-cdp-smoke.js inspect";
    const queuePath = writeQueue(temp, [item("one", 1, {
      liveValidation: {
        approvalRequired: true,
        approvalText: "I approve generated-only item live validation",
        commands: [liveCommand],
        mode: "generated-only-command",
        mutatingLive: true,
      },
    })]);
    const approval = approvalFor(temp, queuePath, ["--max-items", "1"]);
    const missingLiveApproval = run([
      "--execute-one",
      "--queue",
      queuePath,
      "--item",
      "one",
      "--max-items",
      "1",
      "--require-live-connectivity",
      "--approval-text",
      approval,
    ], temp);
    assert.notStrictEqual(missingLiveApproval.status, 0);
    assert.match(missingLiveApproval.stderr, /Missing exact --live-approval-text/);

    sh(temp, ["git", "reset", "--hard", "HEAD"]);
    sh(temp, ["git", "clean", "-fd"]);
    const result = parseJson(run([
      "--execute-one",
      "--queue",
      queuePath,
      "--item",
      "one",
      "--max-items",
      "1",
      "--session-id",
      "item-live",
      "--require-live-connectivity",
      "--approval-text",
      approval,
      "--live-approval-text",
      "I approve generated-only item live validation",
      "--json",
    ], temp));
    assert.strictEqual(result.results[0].liveConnectivityResults.length, 2);
    assert.strictEqual(result.results[0].itemLiveValidationResults.length, 1);
    assert.strictEqual(sh(temp, ["git", "status", "--porcelain"]), "");
  } finally {
    removeTempRepo(temp);
  }
}

function assertSingleApprovalLiveBindingRuns() {
  const temp = createTempRepo("single-approval-live");
  try {
    const liveCommand = "node scripts/cep-panel-cdp-smoke.js inspect";
    const queuePath = writeQueue(temp, [item("one", 1, {
      approvalState: "pending-explicit-approval",
      runnerKind: "roadmap-sdk",
      liveValidation: {
        approvalRequired: true,
        approvalText: "I approve generated-only item live validation",
        commands: [liveCommand],
        generatedOnlyLive: true,
        mode: "generated-only-command",
        mutatingLive: true,
        noUserAssetMutation: true,
      },
    })]);
    const approval = approvalFor(temp, queuePath, ["--max-items", "1"]);
    assert.match(approval, /liveBindings=one:generatedOnlyLive=true:noUserAssetMutation=true:command=/);
    assert(approval.includes(encodeURIComponent(liveCommand)));
    const result = parseJson(run([
      "--execute-one",
      "--queue",
      queuePath,
      "--item",
      "one",
      "--max-items",
      "1",
      "--session-id",
      "single-approval-live",
      "--approval-text",
      approval,
      "--json",
    ], temp));
    assert.strictEqual(result.results[0].itemLiveValidationResults.length, 1);
    assert.strictEqual(sh(temp, ["git", "status", "--porcelain"]), "");
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

function assertWindowsCmdValidationCommandRuns() {
  if (process.platform !== "win32") {
    return;
  }
  const temp = createTempRepo("cmd-validation");
  try {
    const queuePath = writeQueue(temp, [item("one", 1, {
      allowedCommands: ["bin\\verify-roadmap-args.cmd \"alpha beta\" plain"],
      validationCommands: ["bin\\verify-roadmap-args.cmd \"alpha beta\" plain"],
    })]);
    const approval = approvalFor(temp, queuePath, ["--max-items", "1"]);
    const result = parseJson(run([
      "--execute-one",
      "--queue",
      queuePath,
      "--item",
      "one",
      "--max-items",
      "1",
      "--approval-text",
      approval,
      "--json",
    ], temp));
    assert.strictEqual(result.results[0].validationResults[0].status, 0);
    assert.strictEqual(sh(temp, ["git", "status", "--porcelain"]), "");
  } finally {
    removeTempRepo(temp);
  }
}

function assertRunUntilBudgetAndResume() {
  const temp = createTempRepo("budget");
  try {
    const queuePath = writeQueue(temp, [
      item("one", 1, {
        approvalState: "pending-explicit-approval",
        reviewerTasks: [{ id: "risk", kind: "noop" }],
        runnerKind: "roadmap-sdk",
      }),
      item("two", 2, {
        approvalState: "pending-explicit-approval",
        dependencies: ["one"],
        runnerKind: "roadmap-sdk",
      }),
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
  assertLiveCheckPasses();
  assertUnsafeFlagsRejected();
  assertWrongApprovalFails();
  assertDirtyTreeFails();
  assertExecuteOneCommits();
  assertSupervisorFinalizesIgnoredHandoff();
  assertQueueHashApprovalBinding();
  assertRoadmapSdkExecuteOneCommits();
  assertRoadmapSdkCliExecuteOneCommits();
  assertRequireLiveConnectivityAndItemLiveValidation();
  assertSingleApprovalLiveBindingRuns();
  assertUnplannedPathFails();
  assertValidationFailureStops();
  assertWindowsCmdValidationCommandRuns();
  assertRunUntilBudgetAndResume();

  console.log("SDK AE Agent roadmap supervisor command smoke: pass");
}

if (require.main === module) {
  main();
}

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");
const path = require("path");
const { pathToFileURL } = require("url");

const repo = path.resolve(__dirname, "..");
const artifact = require(path.join(
  repo,
  ".codex-audit/sdk-milestone-conveyor/173-ae-agent-cleanup-conveyor-queue.json",
));

function run(args) {
  return spawnSync(process.execPath, ["orchestrator/run-ae-agent-cleanup-conveyor.mjs", ...args], {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
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

async function assertCommitAwareAllowlist() {
  const tempParent = path.resolve(os.tmpdir());
  const tempRoot = fs.mkdtempSync(path.join(tempParent, "ae-agent-conveyor-"));
  const temp = path.resolve(tempRoot);
  assert(
    temp.startsWith(`${tempParent}${path.sep}`) &&
      path.basename(temp).startsWith("ae-agent-conveyor-"),
    `unexpected temp path: ${temp}`,
  );
  try {
    sh(temp, ["git", "init"]);
    fs.writeFileSync(path.join(temp, "base.md"), "base\n", "utf8");
    sh(temp, ["git", "add", "base.md"]);
    sh(temp, ["git", "-c", "user.name=Smoke", "-c", "user.email=smoke@example.local", "commit", "-m", "base"]);
    const preHead = sh(temp, ["git", "rev-parse", "HEAD"]);

    fs.writeFileSync(path.join(temp, "planned.md"), "planned\n", "utf8");
    sh(temp, ["git", "add", "planned.md"]);
    sh(temp, [
      "git",
      "-c",
      "user.name=Smoke",
      "-c",
      "user.email=smoke@example.local",
      "commit",
      "-m",
      "planned",
    ]);

    const runner = await import(
      pathToFileURL(path.join(repo, "orchestrator/run-ae-agent-cleanup-conveyor.mjs")).href
    );
    const ok = runner.validatePostRunChanges(temp, ["planned.md"], preHead);
    assert.strictEqual(ok.headChanged, true);
    assert.deepStrictEqual(ok.committedChangedPaths, ["planned.md"]);

    fs.writeFileSync(path.join(temp, "unplanned.md"), "unplanned\n", "utf8");
    sh(temp, ["git", "add", "unplanned.md"]);
    sh(temp, [
      "git",
      "-c",
      "user.name=Smoke",
      "-c",
      "user.email=smoke@example.local",
      "commit",
      "-m",
      "unplanned",
    ]);

    assert.throws(
      () => runner.validatePostRunChanges(temp, ["planned.md"], preHead),
      /outside queue allowlist: unplanned.md/,
    );
  } finally {
    if (temp.startsWith(`${tempParent}${path.sep}`) && path.basename(temp).startsWith("ae-agent-conveyor-")) {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
}

async function main() {
  const runnerModule = await import(
    pathToFileURL(path.join(repo, "orchestrator/run-ae-agent-cleanup-conveyor.mjs")).href
  );
  assert.strictEqual(runnerModule.DEFAULT_CHILD_MODEL, "gpt-5.3-codex");
  assert.strictEqual(runnerModule.DEFAULT_CHILD_REASONING, "high");

  assert.strictEqual(
    artifact.commandRunner.packageScript,
    "codex:orchestrator:ae-agent-cleanup-conveyor",
  );
  assert.strictEqual(artifact.commandRunner.sdkThreadCreatedByDryRun, false);
  assert.strictEqual(artifact.commandRunner.preRunDirtyGitAllowed, false);
  assert.strictEqual(artifact.commandRunner.autoCommit, false);
  assert.strictEqual(artifact.commandRunner.autoPush, false);
  assert.strictEqual(
    artifact.commandRunner.executionLogDirectory,
    ".codex-runtime/sdk/cleanup-conveyor-logs",
  );
  assert.strictEqual(artifact.commandRunner.executionOutputMode, "log-file-by-default");
  assert.strictEqual(artifact.commandRunner.postRunCommitAwarePathAllowlist, true);

  const dryRun = parseJson(run(["--all", "--json"]));
  assert.strictEqual(dryRun.mode, "dry-run");
  assert.strictEqual(dryRun.sdkThreadCreated, false);
  assert.strictEqual(dryRun.executionLogMode, "log-file-on-execute");
  assert.strictEqual(dryRun.executionLogDirectory, ".codex-runtime/sdk/cleanup-conveyor-logs");
  assert.strictEqual(dryRun.tailLines, 80);
  assert.deepStrictEqual(dryRun.items, [
    "m174-roadmap-active-state-split",
    "m175-runtime-artifact-cleanup-note",
    "m176-sdk-current-history-split",
    "m177-sdk-smoke-consolidation-plan",
  ]);
  assert(dryRun.plannedPaths.includes("plans/target-app-execplan.md"));
  assert(dryRun.plannedPaths.includes(".codex-audit/sdk-current-state.json"));
  assert(dryRun.plannedPaths.includes(".codex-audit/sdk-smoke-consolidation-plan.json"));
  assert.match(dryRun.executeCommand, /--execute-sdk/);
  assert.match(dryRun.executeCommand, /I approve one SDK cleanup conveyor workspace-write run/);
  assert.match(dryRun.executeCliCommand, /--engine cli/);
  assert.match(dryRun.executeCliCommand, /I approve one Codex CLI cleanup conveyor workspace-write run/);

  const cliDryRun = parseJson(run(["--all", "--engine", "cli", "--json"]));
  assert.strictEqual(cliDryRun.mode, "dry-run");
  assert.strictEqual(cliDryRun.engine, "cli");
  assert.strictEqual(cliDryRun.sdkThreadCreated, false);

  const customTail = parseJson(run(["--all", "--tail-lines", "12", "--json"]));
  assert.strictEqual(customTail.tailLines, 12);

  const customLogDir = parseJson(
    run(["--all", "--log-dir", ".codex-runtime/sdk/custom-cleanup-logs", "--json"]),
  );
  assert.strictEqual(customLogDir.executionLogDirectory, ".codex-runtime/sdk/custom-cleanup-logs");

  const single = parseJson(run(["--item", "m174-roadmap-active-state-split", "--json"]));
  assert.deepStrictEqual(single.items, ["m174-roadmap-active-state-split"]);
  assert(single.plannedPaths.includes("plans/archive/target-app-execplan-history-2026-05.md"));

  const missingApproval = run(["--all", "--execute-sdk", "--approval-text", "wrong"]);
  assert.notStrictEqual(missingApproval.status, 0);
  assert.match(missingApproval.stderr, /Missing exact --approval-text/);

  const missingCliApproval = run(["--all", "--engine", "cli", "--execute", "--approval-text", "wrong"]);
  assert.notStrictEqual(missingCliApproval.status, 0);
  assert.match(missingCliApproval.stderr, /Codex CLI cleanup conveyor/);

  const unknown = run(["--item", "missing"]);
  assert.notStrictEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown queue item/);

  const invalidTail = run(["--all", "--tail-lines", "0"]);
  assert.notStrictEqual(invalidTail.status, 0);
  assert.match(invalidTail.stderr, /Invalid value for --tail-lines/);

  const invalidLogDir = run(["--all", "--log-dir", "logs/conveyor"]);
  assert.notStrictEqual(invalidLogDir.status, 0);
  assert.match(invalidLogDir.stderr, /must stay under \.codex-runtime/);

  await assertCommitAwareAllowlist();

  console.log("SDK AE Agent cleanup conveyor command smoke: pass");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

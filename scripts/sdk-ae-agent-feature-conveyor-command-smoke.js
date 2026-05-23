"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");
const path = require("path");
const { pathToFileURL } = require("url");

const repo = path.resolve(__dirname, "..");
const queue = require(path.join(
  repo,
  ".codex-audit/sdk-feature-conveyor/184-dakkshin-intake-feature-queue.json",
));

function run(args) {
  return spawnSync(process.execPath, ["orchestrator/run-ae-agent-feature-conveyor.mjs", ...args], {
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
  const tempRoot = fs.mkdtempSync(path.join(tempParent, "ae-agent-feature-conveyor-"));
  const temp = path.resolve(tempRoot);
  assert(
    temp.startsWith(`${tempParent}${path.sep}`) &&
      path.basename(temp).startsWith("ae-agent-feature-conveyor-"),
    `unexpected temp path: ${temp}`,
  );
  try {
    sh(temp, ["git", "init"]);
    fs.writeFileSync(path.join(temp, "base.md"), "base\n", "utf8");
    sh(temp, ["git", "add", "base.md"]);
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
      pathToFileURL(path.join(repo, "orchestrator/run-ae-agent-feature-conveyor.mjs")).href
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
    if (
      temp.startsWith(`${tempParent}${path.sep}`) &&
      path.basename(temp).startsWith("ae-agent-feature-conveyor-")
    ) {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
}

async function main() {
  assert.strictEqual(queue.commandRunner.packageScript, "codex:orchestrator:ae-agent-feature-conveyor");
  assert.strictEqual(queue.commandRunner.sdkThreadCreatedByDryRun, false);
  assert.strictEqual(queue.commandRunner.executionApprovedNow, false);
  assert.strictEqual(queue.commandRunner.preRunDirtyGitAllowed, false);
  assert.strictEqual(queue.commandRunner.autoCommit, false);
  assert.strictEqual(queue.commandRunner.autoPush, false);

  const dryRun = parseJson(run(["--all", "--json"]));
  assert.strictEqual(dryRun.mode, "dry-run");
  assert.strictEqual(dryRun.sdkThreadCreated, false);
  assert.strictEqual(dryRun.executionApproved, false);
  assert.deepStrictEqual(dryRun.blockedBy, ["per-item-feature-execution-approval-missing"]);
  assert.strictEqual(dryRun.executionLogMode, "log-file-on-execute");
  assert.strictEqual(dryRun.executionLogDirectory, ".codex-runtime/sdk/feature-conveyor-logs");
  assert.strictEqual(dryRun.tailLines, 80);
  assert.deepStrictEqual(dryRun.items, [
    "m185-dakkshin-intake-scope-brief",
    "m186-dakkshin-intake-tool-gap-map",
    "m187-dakkshin-intake-implementation-slice-plan",
  ]);
  assert(dryRun.plannedPaths.includes(".codex/handoff.md"));
  assert(dryRun.plannedPaths.includes("plans/target-app-execplan.md"));
  assert.match(dryRun.executeCommand, /future-approved-item/);
  assert.match(dryRun.executeCliCommand, /--engine cli/);

  const cliDryRun = parseJson(run(["--all", "--engine", "cli", "--json"]));
  assert.strictEqual(cliDryRun.mode, "dry-run");
  assert.strictEqual(cliDryRun.engine, "cli");
  assert.strictEqual(cliDryRun.sdkThreadCreated, false);
  assert.strictEqual(cliDryRun.executionApproved, false);

  const customTail = parseJson(run(["--all", "--tail-lines", "12", "--json"]));
  assert.strictEqual(customTail.tailLines, 12);

  const customLogDir = parseJson(
    run(["--all", "--log-dir", ".codex-runtime/sdk/custom-feature-conveyor-logs", "--json"]),
  );
  assert.strictEqual(
    customLogDir.executionLogDirectory,
    ".codex-runtime/sdk/custom-feature-conveyor-logs",
  );

  const single = parseJson(run(["--item", "m185-dakkshin-intake-scope-brief", "--json"]));
  assert.deepStrictEqual(single.items, ["m185-dakkshin-intake-scope-brief"]);
  assert(single.plannedPaths.includes(".codex-audit/sdk-feature-conveyor/dakkshin-intake/m185-scope-brief.md"));

  const missingApproval = run(["--item", "m185-dakkshin-intake-scope-brief", "--execute-sdk", "--approval-text", "wrong"]);
  assert.notStrictEqual(missingApproval.status, 0);
  assert.match(missingApproval.stderr, /Missing exact --approval-text/);

  const exactButUnapproved = run([
    "--item",
    "m185-dakkshin-intake-scope-brief",
    "--execute-sdk",
    "--approval-text",
    "I approve one SDK feature conveyor workspace-write run for the selected queued feature item planned paths only",
  ]);
  assert.notStrictEqual(exactButUnapproved.status, 0);
  assert.match(exactButUnapproved.stderr, /Feature conveyor execution is not approved/);

  const missingCliApproval = run([
    "--item",
    "m185-dakkshin-intake-scope-brief",
    "--engine",
    "cli",
    "--execute",
    "--approval-text",
    "wrong",
  ]);
  assert.notStrictEqual(missingCliApproval.status, 0);
  assert.match(missingCliApproval.stderr, /Codex CLI feature conveyor/);

  const unknown = run(["--item", "missing"]);
  assert.notStrictEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown feature queue item/);

  const invalidTail = run(["--all", "--tail-lines", "0"]);
  assert.notStrictEqual(invalidTail.status, 0);
  assert.match(invalidTail.stderr, /Invalid value for --tail-lines/);

  const invalidLogDir = run(["--all", "--log-dir", "logs/conveyor"]);
  assert.notStrictEqual(invalidLogDir.status, 0);
  assert.match(invalidLogDir.stderr, /must stay under \.codex-runtime/);

  const unsafeNetwork = run(["--all", "--network"]);
  assert.notStrictEqual(unsafeNetwork.status, 0);
  assert.match(unsafeNetwork.stderr, /Unknown option: --network/);

  await assertCommitAwareAllowlist();

  console.log("SDK AE Agent feature conveyor command smoke: pass");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

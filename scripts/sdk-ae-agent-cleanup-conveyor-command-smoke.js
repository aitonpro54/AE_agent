"use strict";

const assert = require("assert");
const { spawnSync } = require("child_process");
const path = require("path");

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

function main() {
  assert.strictEqual(
    artifact.commandRunner.packageScript,
    "codex:orchestrator:ae-agent-cleanup-conveyor",
  );
  assert.strictEqual(artifact.commandRunner.sdkThreadCreatedByDryRun, false);
  assert.strictEqual(artifact.commandRunner.preRunDirtyGitAllowed, false);
  assert.strictEqual(artifact.commandRunner.autoCommit, false);
  assert.strictEqual(artifact.commandRunner.autoPush, false);

  const dryRun = parseJson(run(["--all", "--json"]));
  assert.strictEqual(dryRun.mode, "dry-run");
  assert.strictEqual(dryRun.sdkThreadCreated, false);
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

  const single = parseJson(run(["--item", "m174-roadmap-active-state-split", "--json"]));
  assert.deepStrictEqual(single.items, ["m174-roadmap-active-state-split"]);
  assert(single.plannedPaths.includes("plans/archive/target-app-execplan-history-2026-05.md"));

  const missingApproval = run(["--all", "--execute-sdk", "--approval-text", "wrong"]);
  assert.notStrictEqual(missingApproval.status, 0);
  assert.match(missingApproval.stderr, /Missing exact --approval-text/);

  const unknown = run(["--item", "missing"]);
  assert.notStrictEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown queue item/);

  console.log("SDK AE Agent cleanup conveyor command smoke: pass");
}

if (require.main === module) {
  main();
}

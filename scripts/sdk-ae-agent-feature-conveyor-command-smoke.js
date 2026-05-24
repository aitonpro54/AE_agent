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
const LIVE_VALIDATION_APPROVAL_TEXT =
  "I approve one M188 staged live AE validation run for M187 advisory recipes using generated-only mutations";
const M190_LIVE_VALIDATION_APPROVAL_TEXT =
  "I approve one M190 Full UI Agent live conveyor validation run for new typed tools using OpenAI CLI and generated-only mutations";
const M191_LIVE_VALIDATION_APPROVAL_TEXT =
  "I approve one M191 live CEP AE validation run for generated-only mask safety checks inside After Effects";
const M198_LIVE_VALIDATION_APPROVAL_TEXT =
  "I approve one M198 live CEP AE validation run for generated-only marker lifecycle checks using OpenAI CLI";

function run(args, cwd = repo) {
  const runner = cwd === repo
    ? "orchestrator/run-ae-agent-feature-conveyor.mjs"
    : path.join(repo, "orchestrator/run-ae-agent-feature-conveyor.mjs");
  return spawnSync(process.execPath, [runner, ...args], {
    cwd,
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

function writeTempLiveQueue(temp) {
  const queuePath = path.join(
    temp,
    ".codex-audit",
    "sdk-feature-conveyor",
    "184-dakkshin-intake-feature-queue.json",
  );
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.writeFileSync(queuePath, JSON.stringify({
    schema: queue.schema,
    queueItems: [
      queue.queueItems.find((item) => item.id === "m188-dakkshin-advisory-field-validation"),
      queue.queueItems.find((item) => item.id === "m190-full-ui-agent-new-tools-validation"),
      queue.queueItems.find((item) => item.id === "m191-mask-safety-live-validation"),
      queue.queueItems.find((item) => item.id === "m198-marker-lifecycle-live-validation"),
    ],
  }, null, 2), "utf8");
}

function assertLiveValidationDirtyGitBlock() {
  const tempParent = path.resolve(os.tmpdir());
  const tempRoot = fs.mkdtempSync(path.join(tempParent, "ae-agent-feature-live-"));
  const temp = path.resolve(tempRoot);
  assert(
    temp.startsWith(`${tempParent}${path.sep}`) &&
      path.basename(temp).startsWith("ae-agent-feature-live-"),
    `unexpected temp path: ${temp}`,
  );
  try {
    sh(temp, ["git", "init"]);
    writeTempLiveQueue(temp);
    fs.writeFileSync(path.join(temp, "dirty.txt"), "dirty\n", "utf8");
    const result = run([
      "--item",
      "m188-dakkshin-advisory-field-validation",
      "--validate-live",
      "--stage",
      "read-only",
    ], temp);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /dirty git state/);
  } finally {
    if (
      temp.startsWith(`${tempParent}${path.sep}`) &&
      path.basename(temp).startsWith("ae-agent-feature-live-")
    ) {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
}

async function main() {
  assert.strictEqual(queue.commandRunner.packageScript, "codex:orchestrator:ae-agent-feature-conveyor");
  assert.strictEqual(queue.commandRunner.sdkThreadCreatedByDryRun, false);
  assert.strictEqual(queue.commandRunner.executionApprovedNow, true);
  assert.strictEqual(queue.commandRunner.preRunDirtyGitAllowed, false);
  assert.strictEqual(queue.commandRunner.autoCommit, false);
  assert.strictEqual(queue.commandRunner.autoPush, false);

  const dryRun = parseJson(run(["--all", "--json"]));
  assert.strictEqual(dryRun.mode, "dry-run");
  assert.strictEqual(dryRun.sdkThreadCreated, false);
  assert.strictEqual(dryRun.executionApproved, true);
  assert.deepStrictEqual(dryRun.blockedBy, []);
  assert.strictEqual(dryRun.executionLogMode, "log-file-on-execute");
  assert.strictEqual(dryRun.executionLogDirectory, ".codex-runtime/sdk/feature-conveyor-logs");
  assert.strictEqual(dryRun.tailLines, 80);
  assert.deepStrictEqual(dryRun.items, [
    "m185-dakkshin-intake-scope-brief",
    "m186-dakkshin-intake-tool-gap-map",
    "m187-dakkshin-intake-implementation-slice-plan",
    "m188-dakkshin-advisory-field-validation",
    "m190-full-ui-agent-new-tools-validation",
    "m191-mask-safety-live-validation",
    "m198-marker-lifecycle-live-validation",
  ]);
  assert(dryRun.plannedPaths.includes(".codex/handoff.md"));
  assert(dryRun.plannedPaths.includes("plans/target-app-execplan.md"));
  assert.match(dryRun.executeCommand, /future-approved-item/);
  assert.match(dryRun.executeCliCommand, /--engine cli/);

  const cliDryRun = parseJson(run(["--all", "--engine", "cli", "--json"]));
  assert.strictEqual(cliDryRun.mode, "dry-run");
  assert.strictEqual(cliDryRun.engine, "cli");
  assert.strictEqual(cliDryRun.sdkThreadCreated, false);
  assert.strictEqual(cliDryRun.executionApproved, true);

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
  assert.strictEqual(single.executionApproved, false);
  assert(single.plannedPaths.includes(".codex-audit/sdk-feature-conveyor/dakkshin-intake/m185-scope-brief.md"));

  const approvedSingle = parseJson(run(["--item", "m186-dakkshin-intake-tool-gap-map", "--json"]));
  assert.deepStrictEqual(approvedSingle.items, ["m186-dakkshin-intake-tool-gap-map"]);
  assert.strictEqual(approvedSingle.executionApproved, true);
  assert.deepStrictEqual(approvedSingle.blockedBy, []);
  assert(approvedSingle.plannedPaths.includes(".codex-audit/sdk-feature-conveyor/dakkshin-intake/m186-tool-gap-map.md"));

  const liveSingle = parseJson(run(["--item", "m188-dakkshin-advisory-field-validation", "--json"]));
  assert.deepStrictEqual(liveSingle.items, ["m188-dakkshin-advisory-field-validation"]);
  assert.strictEqual(liveSingle.executionApproved, false);
  assert(liveSingle.plannedPaths.includes(".codex-runtime/sdk/feature-conveyor-live-logs/"));

  const m190Single = parseJson(run(["--item", "m190-full-ui-agent-new-tools-validation", "--json"]));
  assert.deepStrictEqual(m190Single.items, ["m190-full-ui-agent-new-tools-validation"]);
  assert.strictEqual(m190Single.executionApproved, false);
  assert(m190Single.plannedPaths.includes("logs/agent-run-reports/"));

  const m191Single = parseJson(run(["--item", "m191-mask-safety-live-validation", "--json"]));
  assert.deepStrictEqual(m191Single.items, ["m191-mask-safety-live-validation"]);
  assert.strictEqual(m191Single.executionApproved, false);
  assert(m191Single.plannedPaths.includes("logs/agent-run-reports/"));

  const m198Single = parseJson(run(["--item", "m198-marker-lifecycle-live-validation", "--json"]));
  assert.deepStrictEqual(m198Single.items, ["m198-marker-lifecycle-live-validation"]);
  assert.strictEqual(m198Single.executionApproved, false);
  assert(m198Single.plannedPaths.includes("logs/agent-run-reports/"));

  const liveDryRunBlocked = parseJson(run([
    "--item",
    "m188-dakkshin-advisory-field-validation",
    "--validate-live",
    "--stage",
    "mutating",
    "--dry-run",
    "--json",
  ]));
  assert.strictEqual(liveDryRunBlocked.mode, "live-validation-dry-run");
  assert.strictEqual(liveDryRunBlocked.sdkThreadCreated, false);
  assert.strictEqual(liveDryRunBlocked.liveValidationStage, "mutating");
  assert(liveDryRunBlocked.blockedBy.includes("allow-mutating-live-flag-missing"));
  assert(liveDryRunBlocked.blockedBy.includes("exact-mutating-live-approval-text-missing"));
  assert(liveDryRunBlocked.plannedCommands.some((command) => command.id === "m187-generated-mutating-field-smoke"));
  assert(!liveDryRunBlocked.plannedCommands.some((command) => /openai-cli/i.test(command.command)));

  const liveDryRunApproved = parseJson(run([
    "--item",
    "m188-dakkshin-advisory-field-validation",
    "--validate-live",
    "--stage",
    "both",
    "--allow-mutating-live",
    "--approval-text",
    LIVE_VALIDATION_APPROVAL_TEXT,
    "--dry-run",
    "--json",
  ]));
  assert.strictEqual(liveDryRunApproved.liveValidationApproved, true);
  assert.deepStrictEqual(liveDryRunApproved.blockedBy, []);
  assert.deepStrictEqual(
    liveDryRunApproved.plannedCommands.map((command) => command.id),
    [
      "read-only-live-reliability",
      "m187-read-only-field-smoke",
      "m187-generated-mutating-field-smoke",
      "mutating-live-local-reliability",
    ],
  );

  const m190LiveDryRunApproved = parseJson(run([
    "--item",
    "m190-full-ui-agent-new-tools-validation",
    "--validate-live",
    "--stage",
    "both",
    "--allow-mutating-live",
    "--approval-text",
    M190_LIVE_VALIDATION_APPROVAL_TEXT,
    "--dry-run",
    "--json",
  ]));
  assert.strictEqual(m190LiveDryRunApproved.liveValidationApproved, true);
  assert.deepStrictEqual(m190LiveDryRunApproved.blockedBy, []);
  assert.deepStrictEqual(
    m190LiveDryRunApproved.plannedCommands.map((command) => command.id),
    [
      "m190-live-cep-inspect",
      "m190-full-ui-agent-openai-cli-new-tools-smoke",
    ],
  );
  assert(m190LiveDryRunApproved.plannedCommands.some((command) => /full-ui-agent-new-tools-openai-cli-smoke/.test(command.command)));
  assert(!m190LiveDryRunApproved.plannedCommands.some((command) => /ollama|openrouter/i.test(command.command)));

  const m191LiveDryRunApproved = parseJson(run([
    "--item",
    "m191-mask-safety-live-validation",
    "--validate-live",
    "--stage",
    "both",
    "--allow-mutating-live",
    "--approval-text",
    M191_LIVE_VALIDATION_APPROVAL_TEXT,
    "--dry-run",
    "--json",
  ]));
  assert.strictEqual(m191LiveDryRunApproved.liveValidationApproved, true);
  assert.deepStrictEqual(m191LiveDryRunApproved.blockedBy, []);
  assert.deepStrictEqual(
    m191LiveDryRunApproved.plannedCommands.map((command) => command.id),
    [
      "m191-live-cep-inspect",
      "m191-full-ui-agent-openai-cli-mask-safety-smoke",
    ],
  );
  assert(m191LiveDryRunApproved.plannedCommands.some((command) => /full-ui-agent-mask-safety-openai-cli-smoke/.test(command.command)));
  assert(!m191LiveDryRunApproved.plannedCommands.some((command) => /ollama|openrouter/i.test(command.command)));

  const m198LiveDryRunApproved = parseJson(run([
    "--item",
    "m198-marker-lifecycle-live-validation",
    "--validate-live",
    "--stage",
    "both",
    "--allow-mutating-live",
    "--approval-text",
    M198_LIVE_VALIDATION_APPROVAL_TEXT,
    "--dry-run",
    "--json",
  ]));
  assert.strictEqual(m198LiveDryRunApproved.liveValidationApproved, true);
  assert.deepStrictEqual(m198LiveDryRunApproved.blockedBy, []);
  assert.deepStrictEqual(
    m198LiveDryRunApproved.plannedCommands.map((command) => command.id),
    [
      "m198-live-cep-inspect",
      "m198-full-ui-agent-openai-cli-marker-lifecycle-smoke",
    ],
  );
  assert(m198LiveDryRunApproved.plannedCommands.some((command) => /full-ui-agent-marker-lifecycle-openai-cli-smoke/.test(command.command)));
  assert(!m198LiveDryRunApproved.plannedCommands.some((command) => /ollama|openrouter/i.test(command.command)));

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

  const missingLiveApproval = run([
    "--item",
    "m188-dakkshin-advisory-field-validation",
    "--validate-live",
    "--stage",
    "mutating",
    "--allow-mutating-live",
    "--approval-text",
    "wrong",
  ]);
  assert.notStrictEqual(missingLiveApproval.status, 0);
  assert.match(missingLiveApproval.stderr, /M188 staged live AE validation/);

  const missingM190LiveApproval = run([
    "--item",
    "m190-full-ui-agent-new-tools-validation",
    "--validate-live",
    "--stage",
    "mutating",
    "--allow-mutating-live",
    "--approval-text",
    "wrong",
  ]);
  assert.notStrictEqual(missingM190LiveApproval.status, 0);
  assert.match(missingM190LiveApproval.stderr, /M190 Full UI Agent live conveyor validation/);

  const missingM191LiveApproval = run([
    "--item",
    "m191-mask-safety-live-validation",
    "--validate-live",
    "--stage",
    "mutating",
    "--allow-mutating-live",
    "--approval-text",
    "wrong",
  ]);
  assert.notStrictEqual(missingM191LiveApproval.status, 0);
  assert.match(missingM191LiveApproval.stderr, /M191 live CEP AE validation/);

  const sdkExecuteLiveItem = run([
    "--item",
    "m188-dakkshin-advisory-field-validation",
    "--execute-sdk",
    "--approval-text",
    "I approve one SDK feature conveyor workspace-write run for the selected queued feature item planned paths only",
  ]);
  assert.notStrictEqual(sdkExecuteLiveItem.status, 0);
  assert.match(sdkExecuteLiveItem.stderr, /Feature conveyor execution is not approved/);

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
  assertLiveValidationDirtyGitBlock();

  console.log("SDK AE Agent feature conveyor command smoke: pass");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

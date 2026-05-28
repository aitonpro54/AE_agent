"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const runner = path.join(repo, "orchestrator/run-generic-repo-queue-supervisor.mjs");

function sh(cwd, args) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function run(args, cwd = repo, env = {}) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60000,
  });
}

function parseJson(result) {
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function parseBlockedJson(result, code) {
  assert.notStrictEqual(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert(output.blockers.some((entry) => entry.code === code), `expected blocker ${code}`);
  assert.match(result.stderr, new RegExp(code));
  return output;
}

function createFixture(name) {
  const parent = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, `generic-queue-supervisor-${name}-`));
  assert(root.startsWith(`${parent}${path.sep}`), `unexpected temp path: ${root}`);
  const target = path.join(root, "target");
  const source = path.join(root, "source-checkout");
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(path.join(source, "Layers"), { recursive: true });
  fs.mkdirSync(path.join(source, "Compositions"), { recursive: true });
  fs.writeFileSync(path.join(source, "package.json"), `${JSON.stringify({ name: "fixture-source" }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(source, "README.md"), "# source\n", "utf8");
  fs.writeFileSync(
    path.join(source, "Layers", "Replace_Text_In_Layer_Name.jsx"),
    "function replaceTextInLayerName() { return true; }\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(source, "Compositions", "Add_Background_Layer.jsx"),
    "function addBackgroundLayer() { return true; }\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(source, "Compositions", "Needs_Lane.jsx"),
    "function needsLane() { return true; }\n",
    "utf8",
  );
  fs.writeFileSync(path.join(target, ".gitignore"), ".codex-runtime/\n", "utf8");
  fs.writeFileSync(path.join(target, "README.md"), "# target\n", "utf8");
  sh(target, ["git", "init"]);
  sh(target, ["git", "add", ".gitignore", "README.md"]);
  sh(target, [
    "git",
    "-c",
    "user.name=Smoke",
    "-c",
    "user.email=smoke@example.local",
    "commit",
    "-m",
    "base",
  ]);
  const head = sh(target, ["git", "rev-parse", "HEAD"]);
  const branch = sh(target, ["git", "branch", "--show-current"]);
  return { branch, head, root, source, target };
}

function removeFixture(root) {
  const parent = path.resolve(os.tmpdir());
  if (
    root &&
    root.startsWith(`${parent}${path.sep}`) &&
    path.basename(root).startsWith("generic-queue-supervisor-")
  ) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function entry(overrides = {}) {
  return {
    id: "tool-layers-replace-text-in-layer-name",
    sourcePath: "Layers/Replace_Text_In_Layer_Name.jsx",
    name: "Replace Text In Layer Name",
    description: "Replace text in selected layer names.",
    sourceSha256: "fixture",
    sourceBytes: 1234,
    status: "queued",
    classification: "existing_typed_tools_recipe_only",
    shortReason: "Fixture safe rename recipe.",
    suggestedTools: ["get_active_comp", "get_selected_layers", "rename_layers", "get_comp_details"],
    liveGate: {
      required: false,
      status: "not_required_for_read_only_or_skip",
    },
    implementation: {
      sliceId: null,
      plannedPaths: [],
    },
    safetySignals: {
      usesCompMarkers: false,
      usesLayerMarkers: false,
      usesSettings: false,
      usesFileIo: false,
      usesRenderQueue: false,
      usesSelection: true,
      destructiveCleanup: false,
      expressionMutation: false,
      keyframeMutation: false,
      propertyTraversal: false,
      thirdPartyAssumption: false,
    },
    classificationSource: "fixture",
    queueRank: 1,
    nextAction: "queued_after_prior_safe_candidates",
    ...overrides,
  };
}

function writeFakeCodex(root) {
  const binDir = path.join(root, "fake-bin");
  fs.mkdirSync(binDir, { recursive: true });
  const fakeScript = path.join(binDir, "fake-codex.js");
  fs.writeFileSync(
    fakeScript,
    [
      '"use strict";',
      'const fs = require("fs");',
      'const path = require("path");',
      'const cdIndex = process.argv.indexOf("--cd");',
      'const cwd = cdIndex >= 0 ? process.argv[cdIndex + 1] : process.cwd();',
      'let input = "";',
      'process.stdin.setEncoding("utf8");',
      'process.stdin.on("data", (chunk) => { input += chunk; });',
      'process.stdin.on("end", () => {',
      '  if (!input.includes("AUX-021 generic repository importer child-run execution wrapper")) {',
      '    console.error("missing AUX-021 wrapper");',
      '    process.exit(9);',
      '  }',
      '  const match = input.match(/<child_run_intent_json>\\n([\\s\\S]*?)\\n<\\/child_run_intent_json>/);',
      '  const intent = match ? JSON.parse(match[1]) : { plannedPaths: [] };',
      '  const relative = process.env.FAKE_CODEX_WRITE_PATH || intent.plannedPaths.find((item) => /\\.js$/i.test(item)) || intent.plannedPaths[0];',
      '  if (!relative) {',
      '    console.error("missing planned path");',
      '    process.exit(8);',
      '  }',
      '  const absolute = path.join(cwd, relative);',
      '  fs.mkdirSync(path.dirname(absolute), { recursive: true });',
      '  fs.writeFileSync(absolute, `// fake queue import\\nmodule.exports = ${JSON.stringify(relative)};\\n`, "utf8");',
      '  if (process.env.FAKE_CODEX_HUGE_STDOUT === "1") {',
      '    console.log("H".repeat(512 * 1024));',
      '    console.error("E".repeat(256 * 1024));',
      '  }',
      '  console.log(`fake codex wrote ${relative}`);',
      '});',
      "",
    ].join("\n"),
    "utf8",
  );

  if (process.platform === "win32") {
    fs.writeFileSync(path.join(binDir, "codex.cmd"), '@echo off\r\nnode "%~dp0fake-codex.js" %*\r\n', "utf8");
  } else {
    const binPath = path.join(binDir, "codex");
    fs.writeFileSync(binPath, `#!/bin/sh\nnode "${fakeScript}" "$@"\n`, "utf8");
    fs.chmodSync(binPath, 0o755);
  }
  return binDir;
}

function fakeCodexEnv(binDir) {
  const currentPath = process.env.PATH || process.env.Path || "";
  const nextPath = `${binDir}${path.delimiter}${currentPath}`;
  return {
    PATH: nextPath,
    Path: nextPath,
  };
}

function validLedger(fixture, entries = null) {
  const ledgerEntries =
    entries ||
    [
      entry(),
      entry({
        id: "tool-compositions-add-background-layer",
        sourcePath: "Compositions/Add_Background_Layer.jsx",
        classification: "small_safe_typed_tool_library_recipe_addition",
        liveGate: {
          required: true,
          status: "registered",
          command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-fixture-openai-cli-smoke",
        },
        suggestedTools: ["get_active_comp", "create_shape_layer", "add_effect", "get_layer_details"],
        queueRank: 2,
      }),
      entry({
        id: "tool-compositions-needs-lane",
        sourcePath: "Compositions/Needs_Lane.jsx",
        classification: "live_lane_needed",
        liveGate: {
          required: true,
          status: "needed_or_reusable_lane_required",
        },
        queueRank: null,
        nextAction: "await_serial_slice_selection",
      }),
    ];
  return {
    schema: "generic-repo-importer.fixture-ledger.v1",
    updatedAt: "2026-05-27T00:00:00.000Z",
    source: {
      repo: "https://example.invalid/source.git",
      checkout: fixture.source,
      revision: "fixture-source-head",
      jsxCandidateCount: ledgerEntries.length,
      licenseFile: null,
    },
    target: {
      repoPath: fixture.target,
      branch: fixture.branch,
      head: fixture.head,
      remoteName: "ae-agent",
      remoteBranch: fixture.branch,
      remoteHead: fixture.head,
    },
    constraints: {
      noLocalOllama: true,
      noDependencyOrPackageChanges: true,
      noRawJsxCopiedIntoProduct: true,
      noUserAssetMutation: true,
      parallelAllowedOnlyFor: ["read-only analysis", "importer-owned detached worktree child implementations"],
      serialGates: [
        "controlled merge",
        "non-live validation",
        "read-only CEP/CDP preflight",
        "generated-only OpenAI CLI live acceptance",
        "plan update",
        "handoff update",
        "commit",
        "remote safety check",
        "push",
      ],
    },
    classificationBuckets: {
      existing_typed_tools_recipe_only: 1,
      small_safe_typed_tool_library_recipe_addition: 1,
      live_lane_needed: 1,
    },
    entries: ledgerEntries,
    nextCandidate: {
      id: ledgerEntries[0].id,
      sourcePath: ledgerEntries[0].sourcePath,
      classification: ledgerEntries[0].classification,
      suggestedTools: ledgerEntries[0].suggestedTools,
      reason: "Fixture next candidate.",
    },
  };
}

function writeLedger(fixture, ledger, name = "queue-ledger.json") {
  const ledgerPath = path.join(fixture.root, name);
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return ledgerPath;
}

function assertPlanOnlySuccess() {
  const fixture = createFixture("success");
  try {
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const output = parseJson(
      run(["--plan-only", "--ledger", ledgerPath, "--target-repo", fixture.target, "--max-items", "2", "--json"]),
    );
    assert.strictEqual(output.schema, "generic-repo-queue-supervisor.plan-only.v1");
    assert.strictEqual(output.auxiliaryId, "AUX-031");
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.status, "plan_only_ready");
    assert.deepStrictEqual(output.selectedCandidateIds, [
      "tool-layers-replace-text-in-layer-name",
      "tool-compositions-add-background-layer",
    ]);
    assert.strictEqual(output.safetyPolicy.liveParallelismAllowed, false);
    assert.strictEqual(output.safetyPolicy.localOllamaAllowed, false);
    assert.strictEqual(output.safetyPolicy.worktreesAllowed, false);
    assert.strictEqual(output.safetyPolicy.childRunsAllowed, false);
    assert(output.phasePolicy.parallelizablePreparationPhases.includes("read_only_ledger_candidate_analysis"));
    assert(output.phasePolicy.serialPhases.includes("generated_only_openai_cli_live_acceptance"));
    assert(output.sharedTrackedFiles.every((item) => item.owner === "serial-merge/shared-owner"));
    assert(output.runList[0].plannedPaths.includes("registry/solutions.json"));
    assert(output.runList[0].plannedPaths.includes("scripts/solution-library-validation-smoke.js"));
    assert(output.runList[0].plannedPaths.includes("plans/target-app-execplan.md"));
    assert(output.runList[0].plannedPaths.includes(".codex/handoff.md"));
    assert.strictEqual(output.runList[1].liveGate.supervisorStatus, "ready");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertDirtyTargetFailsClosed() {
  const fixture = createFixture("dirty");
  try {
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    fs.appendFileSync(path.join(fixture.target, "README.md"), "dirty tracked change\n", "utf8");
    fs.writeFileSync(path.join(fixture.target, "untracked.txt"), "dirty\n", "utf8");
    const output = parseBlockedJson(
      run(["--plan-only", "--ledger", ledgerPath, "--target-repo", fixture.target, "--json"]),
      "target-repo-dirty",
    );
    assert(output.target.changedPaths.includes("README.md"));
    assert(!output.target.changedPaths.includes("EADME.md"));
    assert(output.target.changedPaths.includes("untracked.txt"));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertMissingLedgerFieldsFailClosed() {
  const fixture = createFixture("missing-field");
  try {
    const ledger = validLedger(fixture);
    delete ledger.target.branch;
    const ledgerPath = writeLedger(fixture, ledger);
    const result = run(["--plan-only", "--ledger", ledgerPath, "--target-repo", fixture.target, "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /ledger\.target\.branch/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertUnsafeRankedClassificationFailsClosed() {
  const fixture = createFixture("unsafe-ranked");
  try {
    const ledgerPath = writeLedger(
      fixture,
      validLedger(fixture, [
        entry({
          classification: "live_lane_needed",
          liveGate: { required: true, status: "needed_or_reusable_lane_required" },
          queueRank: 1,
        }),
      ]),
    );
    parseBlockedJson(
      run(["--plan-only", "--ledger", ledgerPath, "--target-repo", fixture.target, "--json"]),
      "unsafe-ranked-candidate",
    );
  } finally {
    removeFixture(fixture.root);
  }
}

function assertRequiredLiveLaneMissingFailsClosed() {
  const fixture = createFixture("live-missing");
  try {
    const ledgerPath = writeLedger(
      fixture,
      validLedger(fixture, [
        entry({
          liveGate: { required: true, status: "needed_or_reusable_lane_required" },
        }),
      ]),
    );
    const output = parseBlockedJson(
      run(["--plan-only", "--ledger", ledgerPath, "--target-repo", fixture.target, "--json"]),
      "required-live-lane-missing",
    );
    assert.strictEqual(output.runList[0].status, "blocked_before_execution");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertBatchRecordsMissingLiveLaneAndContinues() {
  const fixture = createFixture("batch-missing-lane-continues");
  try {
    const eligiblePath = "scripts/imported-tools/tool-compositions-add-background-layer.js";
    const ledgerPath = writeLedger(
      fixture,
      validLedger(fixture, [
        entry({
          id: "tool-compositions-add-assorted-composition-guides",
          sourcePath: "Compositions/Add_Assorted_Composition_Guides.jsx",
          liveGate: { required: true, status: "needed_or_reusable_lane_required" },
          queueRank: 1,
        }),
        entry({
          id: "tool-compositions-add-background-layer",
          sourcePath: "Compositions/Add_Background_Layer.jsx",
          classification: "small_safe_typed_tool_library_recipe_addition",
          liveGate: {
            required: true,
            status: "registered",
            command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-fixture-openai-cli-smoke",
          },
          implementation: {
            sliceId: null,
            plannedPaths: [eligiblePath],
          },
          suggestedTools: ["get_active_comp", "create_shape_layer", "get_layer_details"],
          queueRank: 2,
        }),
      ]),
    );
    const binDir = writeFakeCodex(fixture.root);
    const output = parseJson(
      run(
        [
          "--batch",
          "--ledger",
          ledgerPath,
          "--target-repo",
          fixture.target,
          "--max-items",
          "2",
          "--run-id",
          "b1",
          "--json",
        ],
        repo,
        fakeCodexEnv(binDir),
      ),
    );
    assert.strictEqual(output.schema, "generic-repo-queue-supervisor.batch-report.v1");
    assert.strictEqual(output.auxiliaryId, "AUX-038");
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.status, "imported_non_live_validated");
    assert.strictEqual(output.items[0].status, "blocked_needs_live_lane");
    assert.strictEqual(output.items[1].status, "imported_non_live_validated");
    assert.deepStrictEqual(output.blockedCandidateIds, ["tool-compositions-add-assorted-composition-guides"]);
    assert.deepStrictEqual(output.eligibleCandidateIds, ["tool-compositions-add-background-layer"]);
    assert.strictEqual(output.validation.nonLiveValidationRun, true);
    assert.strictEqual(output.validation.nonLiveValidationComplete, true);
    assert.strictEqual(output.validation.liveCepAeRun, false);
    assert.strictEqual(output.validation.localOllamaUsed, false);
    assert.strictEqual(output.validation.fallbackProviderUsed, false);
    assert(!Object.prototype.hasOwnProperty.call(output.importer, "result"));
    assert(output.importer.resultSummary.nonLiveValidationComplete);
    assert(output.importer.resultSummary.resultSummaryPath.endsWith("result-summary.json"));
    assert(fs.existsSync(path.join(fixture.target, output.reportPath)), "batch report must be written");
    assert(fs.existsSync(path.join(fixture.target, output.importer.manifestPath)), "batch manifest must be written");
    assert(fs.existsSync(path.join(fixture.target, eligiblePath)), "eligible candidate should be imported");
    assert(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]).includes(eligiblePath));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertBatchReportDoesNotEmbedHugeImporterOutput() {
  const fixture = createFixture("batch-huge-output");
  try {
    const eligiblePath = "scripts/imported-tools/tool-layers-replace-text-in-layer-name.js";
    const ledgerPath = writeLedger(
      fixture,
      validLedger(fixture, [
        entry({
          implementation: {
            sliceId: null,
            plannedPaths: [eligiblePath],
          },
        }),
      ]),
    );
    const binDir = writeFakeCodex(fixture.root);
    const output = parseJson(
      run(
        [
          "--batch",
          "--ledger",
          ledgerPath,
          "--target-repo",
          fixture.target,
          "--max-items",
          "1",
          "--run-id",
          "huge-output",
          "--json",
        ],
        repo,
        { ...fakeCodexEnv(binDir), FAKE_CODEX_HUGE_STDOUT: "1" },
      ),
    );
    const reportText = fs.readFileSync(path.join(fixture.target, output.reportPath), "utf8");
    assert(reportText.length < 64 * 1024, `batch report should stay compact, got ${reportText.length}`);
    assert(!reportText.includes("HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH"));
    assert(!Object.prototype.hasOwnProperty.call(output.importer, "result"));
    assert(output.importer.resultSummary.resultSummaryPath.endsWith("result-summary.json"));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertBatchAllBlockedWritesReportWithoutFailure() {
  const fixture = createFixture("batch-all-blocked");
  try {
    const ledgerPath = writeLedger(
      fixture,
      validLedger(fixture, [
        entry({
          id: "tool-compositions-add-assorted-composition-guides",
          sourcePath: "Compositions/Add_Assorted_Composition_Guides.jsx",
          liveGate: { required: true, status: "needed_or_reusable_lane_required" },
          queueRank: 1,
        }),
        entry({
          id: "tool-compositions-add-background-layer",
          sourcePath: "Compositions/Add_Background_Layer.jsx",
          classification: "small_safe_typed_tool_library_recipe_addition",
          liveGate: { required: true, status: "needed_or_reusable_lane_required" },
          queueRank: 2,
        }),
      ]),
    );
    const output = parseJson(
      run([
        "--batch",
        "--ledger",
        ledgerPath,
        "--target-repo",
        fixture.target,
        "--max-items",
        "2",
        "--run-id",
        "b2",
        "--json",
      ]),
    );
    assert.strictEqual(output.status, "completed_with_blocked_candidates");
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.eligibleCandidateCount, 0);
    assert.strictEqual(output.blockedCandidateCount, 2);
    assert.strictEqual(output.importer.skippedReason, "no_eligible_candidates");
    assert(fs.existsSync(path.join(fixture.target, output.reportPath)), "blocked batch report must be written");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertForbiddenCandidatePathsFailClosed() {
  const fixture = createFixture("forbidden-paths");
  try {
    const ledgerPath = writeLedger(
      fixture,
      validLedger(fixture, [
        entry({
          implementation: {
            sliceId: null,
            plannedPaths: [
              "package.json",
              "cep-panel/raw-copy.jsx",
              `${fixture.source.replace(/\\/g, "/")}/source-write.js`,
            ],
          },
        }),
      ]),
    );
    const result = run(["--plan-only", "--ledger", ledgerPath, "--target-repo", fixture.target, "--json"]);
    assert.notStrictEqual(result.status, 0);
    const output = JSON.parse(result.stdout);
    const blockerCodes = output.blockers.map((item) => item.code);
    assert(blockerCodes.includes("dependency-package-change-forbidden"));
    assert(blockerCodes.includes("raw-jsx-copy-forbidden"));
    assert(blockerCodes.includes("source-repo-write-forbidden"));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertContextPressureFailsClosed() {
  const fixture = createFixture("context");
  try {
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    parseBlockedJson(
      run([
        "--plan-only",
        "--ledger",
        ledgerPath,
        "--target-repo",
        fixture.target,
        "--context-percent",
        "70",
        "--json",
      ]),
      "context-pressure",
    );
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLocalOllamaPolicyFailsClosed() {
  const fixture = createFixture("local-ollama");
  try {
    const ledger = validLedger(fixture);
    ledger.constraints.noLocalOllama = false;
    const ledgerPath = writeLedger(fixture, ledger);
    const result = run(["--plan-only", "--ledger", ledgerPath, "--target-repo", fixture.target, "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /ledger\.constraints\.noLocalOllama must be true/);
  } finally {
    removeFixture(fixture.root);
  }
}

function main() {
  assertPlanOnlySuccess();
  assertDirtyTargetFailsClosed();
  assertMissingLedgerFieldsFailClosed();
  assertUnsafeRankedClassificationFailsClosed();
  assertRequiredLiveLaneMissingFailsClosed();
  assertBatchRecordsMissingLiveLaneAndContinues();
  assertBatchReportDoesNotEmbedHugeImporterOutput();
  assertBatchAllBlockedWritesReportWithoutFailure();
  assertForbiddenCandidatePathsFailClosed();
  assertContextPressureFailsClosed();
  assertLocalOllamaPolicyFailsClosed();
  console.log("SDK generic repo queue supervisor smoke: pass");
}

if (require.main === module) {
  main();
}

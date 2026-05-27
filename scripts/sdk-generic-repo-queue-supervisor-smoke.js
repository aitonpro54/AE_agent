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

function run(args, cwd = repo) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd,
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
    fs.writeFileSync(path.join(fixture.target, "untracked.txt"), "dirty\n", "utf8");
    const output = parseBlockedJson(
      run(["--plan-only", "--ledger", ledgerPath, "--target-repo", fixture.target, "--json"]),
      "target-repo-dirty",
    );
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
  assertForbiddenCandidatePathsFailClosed();
  assertContextPressureFailsClosed();
  assertLocalOllamaPolicyFailsClosed();
  console.log("SDK generic repo queue supervisor smoke: pass");
}

if (require.main === module) {
  main();
}

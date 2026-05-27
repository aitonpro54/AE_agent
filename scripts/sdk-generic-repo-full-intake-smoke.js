"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const runner = path.join(repo, "orchestrator/run-generic-repo-full-intake.mjs");

function sh(cwd, args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function run(args, cwd = repo, env = {}) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function parseJson(result) {
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function createFixture(name) {
  const parent = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, `generic-full-intake-${name}-`));
  assert(root.startsWith(`${parent}${path.sep}`), `unexpected temp path: ${root}`);
  const target = path.join(root, "target");
  const source = path.join(root, "source-checkout");
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(path.join(source, "Compositions"), { recursive: true });
  fs.mkdirSync(path.join(source, "Layers"), { recursive: true });
  fs.writeFileSync(path.join(source, "README.md"), "# Source fixture\n", "utf8");
  fs.writeFileSync(path.join(source, "LICENSE"), "Fixture license\n", "utf8");
  fs.writeFileSync(path.join(source, "package.json"), "{\"name\":\"source-fixture\"}\n", "utf8");
  fs.writeFileSync(
    path.join(source, "Compositions", "Add_Composition_Guide.jsx"),
    "function addCompositionGuide() { return true; }\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(source, "Compositions", "Add_Posterize_Time_Adjustment_Layer.jsx"),
    "function addPosterizeTimeAdjustmentLayer() { return true; }\n",
    "utf8"
  );
  fs.writeFileSync(path.join(source, "Layers", "Read_Only_Fixture.jsx"), "function readOnlyTool() { return true; }\n", "utf8");
  fs.writeFileSync(path.join(source, "Layers", "Extend_All_Layers.jsx"), "function extendAllLayers() { return true; }\n", "utf8");
  fs.writeFileSync(path.join(source, "Layers", "Shift_Layer_Start_Time.jsx"), "function shiftLayerStartTime() { return true; }\n", "utf8");

  fs.mkdirSync(path.join(target, "plans"), { recursive: true });
  fs.mkdirSync(path.join(target, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(target, ".gitignore"), ".codex-runtime/\n.codex/\n", "utf8");
  fs.writeFileSync(
    path.join(target, "plans", "target-app-execplan.md"),
    [
      "# Target App Execution Plan",
      "",
      "## Progress",
      "",
      "- [x] Fixture baseline.",
      "",
      "## Decision Log",
      "",
      "- Fixture decision.",
      "",
      "## Validation",
      "",
      "| Item | Requirement | Evidence |",
      "| --- | --- | --- |",
      "| Fixture | Baseline | Passed. |",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(target, "scripts", "cep-panel-cdp-smoke.js"),
    [
      '"use strict";',
      "const command = process.argv[2] || 'inspect';",
      "if (command === 'inspect' || command === 'connector-status-smoke' || /openai-cli-smoke$/.test(command)) {",
      "  console.log(JSON.stringify({ ok: true, command }));",
      "  process.exit(0);",
      "}",
      "console.error(`unexpected command ${command}`);",
      "process.exit(2);",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(path.join(target, "scripts", "fail-live-lane.js"), "process.exit(7);\n", "utf8");

  sh(target, ["git", "init", "-b", "main"]);
  sh(target, ["git", "config", "user.name", "Fixture"]);
  sh(target, ["git", "config", "user.email", "fixture@example.local"]);
  sh(target, ["git", "add", "."]);
  sh(target, ["git", "commit", "-m", "fixture baseline"]);

  const head = sh(target, ["git", "rev-parse", "HEAD"]);
  return { root, source, target, head };
}

function removeFixture(root) {
  if (process.env.KEEP_GENERIC_FULL_INTAKE_FIXTURES === "1") {
    return;
  }
  const parent = path.resolve(os.tmpdir());
  if (!root || !root.startsWith(`${parent}${path.sep}`)) {
    throw new Error(`refusing to remove unexpected temp path: ${root}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
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
      '  fs.writeFileSync(absolute, `// fake full-intake import\\nmodule.exports = ${JSON.stringify(relative)};\\n`, "utf8");',
      '  console.log(`fake codex wrote ${relative}`);',
      '});',
      ""
    ].join("\n"),
    "utf8"
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
    Path: nextPath
  };
}

function entry(overrides = {}) {
  return {
    id: "tool-compositions-add-composition-guide",
    sourcePath: "Compositions/Add_Composition_Guide.jsx",
    name: "Add Composition Guide",
    description: "Fixture composition guide.",
    sourceSha256: "fixture",
    sourceBytes: 128,
    status: "queued",
    classification: "small_safe_typed_tool_library_recipe_addition",
    shortReason: "Fixture safe candidate.",
    suggestedTools: ["create_comp", "create_shape_layer", "get_comp_details", "get_layer_details"],
    liveGate: { required: true, status: "needed_or_reusable_lane_required" },
    implementation: {
      sliceId: "fixture-composition-guide-import",
      plannedPaths: ["scripts/imported-tools/composition-guide.js"]
    },
    safetySignals: {},
    queueRank: 1,
    ...overrides
  };
}

function posterizeEntry(overrides = {}) {
  return entry({
    id: "tool-compositions-add-posterize-time-adjustment-layer",
    sourcePath: "Compositions/Add_Posterize_Time_Adjustment_Layer.jsx",
    name: "Add Posterize Time Adjustment Layer",
    description: "Fixture generated shape/effect-style layer candidate.",
    suggestedTools: ["get_active_comp", "create_shape_layer", "add_effect", "get_layer_details"],
    implementation: {
      sliceId: "fixture-posterize-time-import",
      plannedPaths: ["scripts/imported-tools/posterize-time.js"]
    },
    ...overrides
  });
}

function timingEntry(overrides = {}) {
  return entry({
    id: "tool-layers-extend-all-layers",
    sourcePath: "Layers/Extend_All_Layers.jsx",
    name: "Extend All Layers",
    description: "Fixture generated layer timing candidate.",
    suggestedTools: ["get_active_comp", "get_selected_layers", "set_layer_time_range", "stagger_layers", "get_comp_details"],
    implementation: {
      sliceId: "fixture-layer-timing-import",
      plannedPaths: ["scripts/imported-tools/layer-timing.js"]
    },
    ...overrides
  });
}

function validLedger(fixture, entries = null) {
  const ledgerEntries = entries || [entry()];
  return {
    schema: "generic-repo-importer.fixture-ledger.v1",
    source: {
      repo: "fixture/source",
      checkout: fixture.source,
      revision: "fixture"
    },
    target: {
      repoPath: fixture.target,
      branch: "main",
      head: fixture.head,
      remoteName: "fixture",
      remoteBranch: "main"
    },
    constraints: {
      noLocalOllama: true,
      noDependencyOrPackageChanges: true,
      noRawJsxCopiedIntoProduct: true,
      noUserAssetMutation: true
    },
    entries: ledgerEntries,
    nextCandidate: {
      id: ledgerEntries[0].id,
      sourcePath: ledgerEntries[0].sourcePath,
      classification: ledgerEntries[0].classification,
      suggestedTools: ledgerEntries[0].suggestedTools,
      reason: "Fixture next candidate."
    }
  };
}

function writeLedger(fixture, ledger, name = "queue-ledger.json") {
  const ledgerPath = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", "fixture-intake", name);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return ledgerPath;
}

function writeRegistry(fixture, overrides = {}) {
  const entries = Object.prototype.hasOwnProperty.call(overrides, "entries")
    ? overrides.entries
    : [
        {
          candidateId: "tool-compositions-add-composition-guide",
          laneId: "fixture-composition-guide-openai-cli",
          command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-fixture-openai-cli-smoke",
          providerPath: "openai-cli",
          scope: "fixture generated-only OpenAI CLI lane",
          plannedPaths: ["scripts/cep-panel-cdp-smoke.js"],
          nonLiveValidationCommands: ["node --check scripts/cep-panel-cdp-smoke.js"],
          ...(overrides.entry || {})
        }
      ];
  const registry = {
    schema: "generic-repo-live-lane-registry.v1",
    entries
  };
  const registryPath = path.join(fixture.root, "live-lane-registry.json");
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return registryPath;
}

function runFullIntakeFixture(fixture, ledgerPath, registryPath, runId, maxItems, env = {}) {
  return run(
    [
      "--ledger",
      ledgerPath,
      "--live-lane-registry",
      registryPath,
      "--run-id",
      runId,
      "--max-items",
      String(maxItems),
      "--target-repo",
      fixture.target,
      "--json"
    ],
    repo,
    env
  );
}

function assertCompletedCandidateAndAutoLane() {
  const fixture = createFixture("registry-lane");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-registry-lane",
        1,
        fakeCodexEnv(binDir)
      )
    );
    assert.strictEqual(output.schema, "generic-repo-full-intake.run.v1");
    assert.strictEqual(output.auxiliaryId, "AUX-043");
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.status, "completed");
    assert.strictEqual(output.items.length, 1);
    assert.strictEqual(output.items[0].status, "completed");
    assert.strictEqual(output.items[0].liveLaneStatus, "passed");
    assert.strictEqual(output.items[0].liveRerunStatus, "passed");
    assert(output.commits.length === 1, "completed candidate should commit reviewable changes");

    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    const completed = ledger.entries.find((item) => item.id === "tool-compositions-add-composition-guide");
    assert.strictEqual(completed.status, "completed");
    assert.strictEqual(completed.liveGate.status, "passed");
    assert.strictEqual(completed.liveGate.laneId, "fixture-composition-guide-openai-cli");
    assert.strictEqual(completed.liveGate.templateSource, "registry");
    assert.strictEqual(completed.liveGate.synthesized, false);
    assert.strictEqual(completed.implementation.commit, output.commits[0]);
    assert(fs.existsSync(path.join(fixture.target, "scripts", "imported-tools", "composition-guide.js")));
    assert(fs.readFileSync(path.join(fixture.target, "plans", "target-app-execplan.md"), "utf8").includes("full-intake:fixture-registry-lane:tool-compositions-add-composition-guide"));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertSynthesizedAutoLaneCompletesWithoutRegistryEntry() {
  const fixture = createFixture("synth-lane");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [posterizeEntry()]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-synth-lane",
        1,
        fakeCodexEnv(binDir)
      )
    );
    assert.strictEqual(output.status, "completed");
    assert.strictEqual(output.items[0].candidateId, "tool-compositions-add-posterize-time-adjustment-layer");
    assert.strictEqual(output.items[0].liveLaneStatus, "passed");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    const completed = ledger.entries.find((item) => item.id === "tool-compositions-add-posterize-time-adjustment-layer");
    assert.strictEqual(completed.status, "completed");
    assert.strictEqual(completed.liveGate.status, "passed");
    assert.strictEqual(completed.liveGate.templateSource, "auto_synthesis");
    assert.strictEqual(completed.liveGate.synthesized, true);
    assert.strictEqual(completed.liveGate.synthesisFamily, "generated-shape-effect-layer");
    assert(completed.liveGate.laneId.includes("auto-generated-shape-effect-layer"));
    assert(fs.existsSync(path.join(fixture.target, completed.liveGate.synthesisEvidence)));
    assert(fs.existsSync(path.join(fixture.target, output.items[0].liveLaneReport)));
    assert(fs.existsSync(path.join(fixture.target, "scripts", "imported-tools", "posterize-time.js")));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertAutoLaneSynthesisFailClosedEvidence() {
  const fixture = createFixture("synth-fail");
  try {
    const unsafe = posterizeEntry({
      id: "tool-compositions-file-io-layer",
      sourcePath: "Compositions/File_IO_Layer.jsx",
      safetySignals: { usesFileIo: true },
      queueRank: 1
    });
    const ambiguous = posterizeEntry({
      id: "tool-layers-shape-and-rename-ambiguous",
      sourcePath: "Layers/Shape_And_Rename_Ambiguous.jsx",
      suggestedTools: ["get_active_comp", "get_selected_layers", "create_shape_layer", "add_effect", "rename_layers", "get_comp_details"],
      safetySignals: {},
      queueRank: 2
    });
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [unsafe, ambiguous]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(runFullIntakeFixture(fixture, ledgerPath, registryPath, "fixture-synth-fail", 2));
    assert.strictEqual(output.status, "completed_with_blocked_candidates");
    assert.deepStrictEqual(output.items.map((item) => item.status), [
      "blocked_live_lane_synthesis_unsafe",
      "blocked_live_lane_synthesis_ambiguous"
    ]);
    for (const item of output.items) {
      assert(item.liveLaneReport, `${item.candidateId}: expected live lane report`);
      const report = JSON.parse(fs.readFileSync(path.join(fixture.target, item.liveLaneReport), "utf8"));
      assert.strictEqual(report.ok, false);
      assert(report.synthesisReport, `${item.candidateId}: expected synthesis evidence path`);
      const synthesis = JSON.parse(fs.readFileSync(path.join(fixture.target, report.synthesisReport), "utf8"));
      assert.strictEqual(synthesis.status, item.status);
      assert.strictEqual(synthesis.ok, false);
      assert(Array.isArray(synthesis.candidateTools));
    }
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "blocked_live_lane_synthesis_unsafe");
    assert.strictEqual(ledger.entries[1].status, "blocked_live_lane_synthesis_ambiguous");
    assert.strictEqual(ledger.entries[0].failClosed.status, "blocked_live_lane_synthesis_unsafe");
    assert.strictEqual(ledger.entries[1].failClosed.status, "blocked_live_lane_synthesis_ambiguous");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertUnsafeCandidateSkipAndContinue() {
  const fixture = createFixture("unsafe-skip");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const unsafe = entry({
      id: "tool-unsafe-render-queue-delete",
      sourcePath: "Unsafe.jsx",
      classification: "unsafe_destructive_operation",
      liveGate: { required: false, status: "not_required_for_read_only_or_skip" },
      implementation: { sliceId: "unsafe", plannedPaths: ["scripts/imported-tools/unsafe.js"] },
      queueRank: 1
    });
    const safe = entry({
      id: "tool-layers-read-only-fixture",
      sourcePath: "Layers/Read_Only_Fixture.jsx",
      classification: "existing_typed_tools_recipe_only",
      liveGate: { required: false, status: "not_required_for_read_only_or_skip" },
      implementation: { sliceId: "read-only-fixture", plannedPaths: ["scripts/imported-tools/read-only-fixture.js"] },
      queueRank: 2
    });
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [unsafe, safe]));
    const registryPath = writeRegistry(fixture);
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-unsafe-skip",
        2,
        fakeCodexEnv(binDir)
      )
    );
    assert.strictEqual(output.status, "completed_with_blocked_or_skipped_candidates");
    assert.strictEqual(output.items[0].candidateId, "tool-unsafe-render-queue-delete");
    assert.strictEqual(output.items[0].status, "skipped_unsafe_candidate");
    assert.strictEqual(output.items[1].candidateId, "tool-layers-read-only-fixture");
    assert.strictEqual(output.items[1].status, "completed");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries.find((item) => item.id === "tool-layers-read-only-fixture").status, "completed");
    const skipped = ledger.entries.find((item) => item.id === "tool-unsafe-render-queue-delete");
    assert.strictEqual(skipped.status, "skipped_unsafe_candidate");
    assert.strictEqual(skipped.failClosed.status, "skipped_unsafe_candidate");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLiveLaneFailureEvidence() {
  const fixture = createFixture("live-failure");
  try {
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture, {
      entry: {
        nonLiveValidationCommands: ["node scripts/fail-live-lane.js"]
      }
    });
    const output = parseJson(runFullIntakeFixture(fixture, ledgerPath, registryPath, "fixture-live-failure", 1));
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.status, "completed_with_blocked_candidates");
    assert.strictEqual(output.items[0].status, "blocked_live_lane_validation_failed");
    assert(output.items[0].liveLaneReport, "blocked live lane should record report path");
    const reportPath = path.join(fixture.target, output.items[0].liveLaneReport);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.strictEqual(report.status, "blocked_live_lane_validation_failed");
    assert.strictEqual(report.failedCommand.exitCode, 7);
    assert(fs.existsSync(path.join(fixture.target, report.failedCommand.logPath)));
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "blocked_live_lane_validation_failed");
    assert.strictEqual(ledger.entries[0].liveGate.status, "blocked_live_lane_validation_failed");
    assert.strictEqual(ledger.entries[0].failClosed.status, "blocked_live_lane_validation_failed");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertQueuedLedgerStaleBlockedStateIsRetried() {
  const fixture = createFixture("stale-blocked-resume");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [posterizeEntry()]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const runId = "fixture-stale-blocked-resume";
    const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-full-intake", runId);
    fs.mkdirSync(runRoot, { recursive: true });
    fs.writeFileSync(
      path.join(runRoot, "state.json"),
      `${JSON.stringify(
        {
          schema: "generic-repo-full-intake.state.v1",
          auxiliaryId: "AUX-043",
          runId,
          status: "completed_with_blocked_candidates",
          startedAt: "2026-05-27T00:00:00.000Z",
          updatedAt: "2026-05-27T00:00:00.000Z",
          ledgerPath,
          maxItems: 1,
          resumeCount: 0,
          items: [
            {
              candidateId: "tool-compositions-add-posterize-time-adjustment-layer",
              status: "blocked_live_lane_template_missing"
            }
          ],
          completedCandidateIds: [],
          blockedCandidateIds: ["tool-compositions-add-posterize-time-adjustment-layer"],
          skippedCandidateIds: [],
          commitIds: []
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        runId,
        1,
        fakeCodexEnv(binDir)
      )
    );
    assert.strictEqual(output.resumed, true);
    assert.strictEqual(output.status, "completed");
    assert.strictEqual(output.items[0].candidateId, "tool-compositions-add-posterize-time-adjustment-layer");
    assert.strictEqual(output.items[0].status, "completed");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "completed");
    assert.strictEqual(ledger.entries[0].liveGate.templateSource, "auto_synthesis");
    const state = JSON.parse(fs.readFileSync(path.join(runRoot, "state.json"), "utf8"));
    assert.strictEqual(state.items[0].status, "completed");
    assert.deepStrictEqual(state.blockedCandidateIds, []);
    assert.strictEqual(state.maxItems, 1);
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertResolutionTicketRequeuesBlockedFamily() {
  const fixture = createFixture("resolution-family");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const first = timingEntry({
      status: "blocked_live_lane_synthesis_incomplete",
      failClosed: {
        status: "blocked_live_lane_synthesis_incomplete",
        reason: "candidate_tools_do_not_match_a_supported_auto_lane_family"
      },
      liveGate: { required: true, status: "blocked_live_lane_synthesis_incomplete" },
      queueRank: 1
    });
    const second = timingEntry({
      id: "tool-layers-shift-layer-start-time",
      sourcePath: "Layers/Shift_Layer_Start_Time.jsx",
      status: "blocked_live_lane_synthesis_incomplete",
      failClosed: {
        status: "blocked_live_lane_synthesis_incomplete",
        reason: "candidate_tools_do_not_match_a_supported_auto_lane_family"
      },
      implementation: {
        sliceId: "fixture-layer-shift-import",
        plannedPaths: ["scripts/imported-tools/layer-shift.js"]
      },
      liveGate: { required: true, status: "blocked_live_lane_synthesis_incomplete" },
      queueRank: 2
    });
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [first, second]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-resolution-family",
        1,
        fakeCodexEnv(binDir)
      )
    );
    assert.strictEqual(output.status, "completed");
    assert.strictEqual(output.resolutionQueue.openTicketCount, 0);
    assert.strictEqual(output.resolutionQueue.terminalTicketCount, 1);
    assert.deepStrictEqual(output.resolutionQueue.requeuedCandidateIds.sort(), [
      "tool-layers-extend-all-layers",
      "tool-layers-shift-layer-start-time"
    ]);
    assert.strictEqual(output.resolutionQueue.tickets[0].type, "live-lane-family");

    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    const completed = ledger.entries.find((item) => item.id === "tool-layers-extend-all-layers");
    const queued = ledger.entries.find((item) => item.id === "tool-layers-shift-layer-start-time");
    assert.strictEqual(completed.status, "completed");
    assert.strictEqual(completed.liveGate.synthesisFamily, "layer-timing-generated-only");
    assert.strictEqual(queued.status, "queued");
    assert.strictEqual(queued.liveGate.status, "passed");
    assert.strictEqual(queued.liveGate.command, "node scripts/cep-panel-cdp-smoke.js full-ui-agent-layer-timing-openai-cli-smoke");
    assert(fs.existsSync(path.join(fixture.target, output.resolutionQueue.tickets[0].path)));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function writeChildTimeoutEvidence(fixture, entryToRecover) {
  const importerRunId = "queue-fixture-child-timeout-import";
  const batchRunId = "fixture-child-timeout-import";
  const batchId = "queue-batch-1-childtimeout";
  const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", importerRunId);
  const childResultDir = path.join(runRoot, "implementation", "child-run-results");
  fs.mkdirSync(childResultDir, { recursive: true });

  const worktreePath = path.join(runRoot, "worktrees", batchId);
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  sh(fixture.target, ["git", "worktree", "add", "--detach", worktreePath, "HEAD"]);
  const recoveredPath = "scripts/imported-tools/recovered-child-timeout.js";
  fs.mkdirSync(path.join(worktreePath, "scripts", "imported-tools"), { recursive: true });
  fs.writeFileSync(
    path.join(worktreePath, recoveredPath),
    "// recovered from timed-out child\nmodule.exports = 'child-timeout';\n",
    "utf8"
  );

  const childResult = {
    schema: "generic-repo-tool-importer.implementation-child-run-result.v1",
    runId: importerRunId,
    manifestHash: "fixture-child-timeout",
    batchId,
    status: "failed_timeout",
    timeoutMs: 600000,
    plannedPaths: [recoveredPath],
    changedPaths: [recoveredPath],
    unplannedPaths: [],
    plannedPathGate: "passed",
    actualWorktreePath: worktreePath,
    actualWorktreeRelativePath: path.relative(fixture.target, worktreePath).replace(/\\/g, "/"),
    worktreeCreated: true,
    childRunCreated: true,
    controlledMergeApplied: false,
    validationCommandsRun: false,
    liveCepAeRun: false,
    localOllamaUsed: false,
    fallbackProviderUsed: false,
    dependencyChanged: false,
    productRuntimeEdited: false
  };
  fs.writeFileSync(path.join(childResultDir, `${batchId}.json`), `${JSON.stringify(childResult, null, 2)}\n`, "utf8");

  const batchReportPath = path.join(
    fixture.target,
    ".codex-runtime",
    "sdk",
    "generic-repo-full-intake",
    "fixture-child-timeout",
    "queue-supervisor",
    batchRunId,
    "batch-report.json"
  );
  const relativeBatchReportPath = path.relative(fixture.target, batchReportPath).replace(/\\/g, "/");
  fs.mkdirSync(path.dirname(batchReportPath), { recursive: true });
  const batchReport = {
    schema: "generic-repo-queue-supervisor.batch-report.v1",
    ok: false,
    status: "failed_during_import",
    runId: batchRunId,
    reportPath: relativeBatchReportPath,
    importer: {
      manifestPath: null,
      runId: importerRunId,
      result: null,
      error: `implementation-child-run-timeout: ${batchId}`
    },
    items: [
      {
        candidateId: entryToRecover.id,
        sourcePath: entryToRecover.sourcePath,
        status: "failed_importer",
        reason: `implementation-child-run-timeout: ${batchId}`,
        importerRunId,
        plannedPaths: [recoveredPath]
      }
    ]
  };
  fs.writeFileSync(batchReportPath, `${JSON.stringify(batchReport, null, 2)}\n`, "utf8");
  return { batchReportPath: relativeBatchReportPath, recoveredPath };
}

function assertChildTimeoutResolutionRecoversImporterWorktreePatch() {
  const fixture = createFixture("child-timeout-recovery");
  try {
    const failed = entry({
      id: "tool-layers-child-timeout-recovery",
      sourcePath: "Layers/Read_Only_Fixture.jsx",
      classification: "existing_typed_tools_recipe_only",
      liveGate: { required: false, status: "not_required_for_read_only_or_skip" },
      implementation: {
        sliceId: "fixture-child-timeout-recovery",
        plannedPaths: ["scripts/imported-tools/recovered-child-timeout.js"]
      },
      status: "failed_import",
      queueRank: 1
    });
    const evidence = writeChildTimeoutEvidence(fixture, failed);
    failed.failClosed = {
      status: "failed_import",
      reason: "batch-importer-failed: implementation-child-run-timeout: queue-batch-1-childtimeout",
      batchReport: evidence.batchReportPath
    };
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [failed]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-child-timeout",
        1
      )
    );
    assert.strictEqual(output.status, "completed");
    assert.strictEqual(output.items[0].status, "completed");
    assert.strictEqual(output.items[0].importStatus, "imported_non_live_validated");
    assert(fs.existsSync(path.join(fixture.target, evidence.recoveredPath)));
    const recovered = fs.readFileSync(path.join(fixture.target, evidence.recoveredPath), "utf8");
    assert(recovered.includes("child-timeout"));
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "completed");
    assert.strictEqual(ledger.entries[0].implementation.importerNonLiveReport.includes("recovery-validation-report.json"), true);
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertResumeFromState() {
  const fixture = createFixture("resume");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const env = fakeCodexEnv(binDir);
    const first = parseJson(runFullIntakeFixture(fixture, ledgerPath, registryPath, "fixture-resume", 1, env));
    assert.strictEqual(first.status, "completed");
    const second = parseJson(runFullIntakeFixture(fixture, ledgerPath, registryPath, "fixture-resume", 1, env));
    assert.strictEqual(second.resumed, true);
    assert.strictEqual(second.status, "completed_no_candidates");
    const state = JSON.parse(fs.readFileSync(path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-full-intake", "fixture-resume", "state.json"), "utf8"));
    assert(state.resumeCount >= 1);
    assert.deepStrictEqual(state.completedCandidateIds, ["tool-compositions-add-composition-guide"]);
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function main() {
  assertCompletedCandidateAndAutoLane();
  assertSynthesizedAutoLaneCompletesWithoutRegistryEntry();
  assertAutoLaneSynthesisFailClosedEvidence();
  assertUnsafeCandidateSkipAndContinue();
  assertLiveLaneFailureEvidence();
  assertQueuedLedgerStaleBlockedStateIsRetried();
  assertResolutionTicketRequeuesBlockedFamily();
  assertChildTimeoutResolutionRecoversImporterWorktreePatch();
  assertResumeFromState();
  console.log(JSON.stringify({ ok: true, smoke: "generic-repo-full-intake" }, null, 2));
}

main();

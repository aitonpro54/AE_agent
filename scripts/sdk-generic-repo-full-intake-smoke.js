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
  fs.writeFileSync(path.join(source, "Layers", "Read_Only_Fixture.jsx"), "function readOnlyTool() { return true; }\n", "utf8");

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
  const registry = {
    schema: "generic-repo-live-lane-registry.v1",
    entries: [
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
    ]
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
  const fixture = createFixture("completed-auto-lane");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-completed-auto-lane",
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
    assert.strictEqual(completed.implementation.commit, output.commits[0]);
    assert(fs.existsSync(path.join(fixture.target, "scripts", "imported-tools", "composition-guide.js")));
    assert(fs.readFileSync(path.join(fixture.target, "plans", "target-app-execplan.md"), "utf8").includes("full-intake:fixture-completed-auto-lane:tool-compositions-add-composition-guide"));
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
    assert.strictEqual(ledger.entries.find((item) => item.id === "tool-unsafe-render-queue-delete").status, "queued");
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
    assert.strictEqual(ledger.entries[0].status, "queued");
    assert.strictEqual(ledger.entries[0].liveGate.status, "needed_or_reusable_lane_required");
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
  assertUnsafeCandidateSkipAndContinue();
  assertLiveLaneFailureEvidence();
  assertResumeFromState();
  console.log(JSON.stringify({ ok: true, smoke: "generic-repo-full-intake" }, null, 2));
}

main();

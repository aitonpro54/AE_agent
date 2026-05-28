"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const runner = path.join(repo, "orchestrator/run-generic-repo-importer-supervisor.mjs");

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

function assertNoParentFacingRuntimeLeak(text) {
  for (const forbidden of [
    '"items"',
    '"runList"',
    '"tickets"',
    '"prompt"',
    '"stdout"',
    '"stderr"',
    '"transcript"',
    '"runtimeState"'
  ]) {
    assert(!text.includes(forbidden), `parent-facing output leaked ${forbidden}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function snapshot(target, relativePath) {
  const absolute = path.join(target, relativePath);
  const stats = fs.statSync(absolute);
  return {
    path: relativePath.replace(/\\/g, "/"),
    exists: true,
    sha256: sha256File(absolute),
    bytes: stats.size,
  };
}

function createFixture(name) {
  const parent = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, `generic-importer-supervisor-${name}-`));
  assert(root.startsWith(`${parent}${path.sep}`), `unexpected temp path: ${root}`);
  const target = path.join(root, "target");
  const source = path.join(root, "source");
  fs.mkdirSync(path.join(target, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(target, "registry"), { recursive: true });
  fs.mkdirSync(path.join(target, "recipes"), { recursive: true });
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, "README.md"), "# source\n", "utf8");
  fs.writeFileSync(path.join(target, ".gitignore"), ".codex-runtime/\n", "utf8");
  fs.writeFileSync(path.join(target, "scripts", "solution-library-validation-smoke.js"), "console.log('base');\n", "utf8");
  fs.writeFileSync(path.join(target, "registry", "solutions.json"), "{\"schema\":\"base\"}\n", "utf8");
  sh(target, ["git", "init"]);
  sh(target, ["git", "add", ".gitignore", "scripts/solution-library-validation-smoke.js", "registry/solutions.json"]);
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

  fs.writeFileSync(path.join(target, "scripts", "solution-library-validation-smoke.js"), "console.log('imported');\n", "utf8");
  fs.writeFileSync(path.join(target, "registry", "solutions.json"), "{\"schema\":\"imported\"}\n", "utf8");
  fs.writeFileSync(path.join(target, "recipes", "reset-composition-work-area-typed-plan.md"), "# Reset work area\n", "utf8");

  const runId = `aux025-${name}`;
  const runRoot = path.join(target, ".codex-runtime", "sdk", "generic-repo-importer", runId);
  fs.mkdirSync(path.join(runRoot, "validation"), { recursive: true });
  const ownedDirtyPaths = [
    "recipes/reset-composition-work-area-typed-plan.md",
    "registry/solutions.json",
    "scripts/solution-library-validation-smoke.js",
  ];
  const manifest = {
    schema: "generic-repo-tool-importer.manifest.v1",
    run: {
      runId,
      requestedGoal: "Fixture closeout for reset work area importer.",
      localOllama: false,
      webSearch: "disabled",
    },
    sourceRepo: {
      inputKind: "local-path",
      location: source,
      revision: "fixture",
    },
    targetRepo: {
      path: target,
      allowedWritePaths: ownedDirtyPaths,
      forbiddenWritePaths: ["package.json", "package-lock.json", "node_modules/**"],
    },
    liveAcceptance: {
      providerPath: "OpenAI CLI through Codex CLI only",
      generatedOnlyPolicy: {
        required: true,
        generatedPrefix: "Codex QA Fixture",
      },
    },
  };
  const manifestPath = path.join(runRoot, "manifest.normalized.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const state = {
    schema: "generic-repo-tool-importer.command-skeleton.v1",
    runId,
    status: "stopped",
    currentPhase: "non_live_validation_complete",
    nextPhase: "live_acceptance",
    stopReason: "stopped_before_live_acceptance",
    manifestPath,
    targetRepo: target,
    targetHead: head,
    targetBranch: branch,
    runRoot: `.codex-runtime/sdk/generic-repo-importer/${runId}`,
    ownedDirtyPaths,
    flags: {
      validationCommandsRun: true,
      nonLiveValidationComplete: true,
      liveCepAeRun: false,
      localOllamaUsed: false,
      dependencyChanged: false,
      fallbackProviderUsed: false,
    },
  };
  fs.writeFileSync(path.join(runRoot, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  const report = {
    schema: "generic-repo-tool-importer.non-live-validation.v1",
    runId,
    status: "passed",
    touchedPaths: ownedDirtyPaths,
    ownedDirtyPaths,
    afterSnapshot: ownedDirtyPaths.map((relativePath) => snapshot(target, relativePath)),
  };
  fs.writeFileSync(path.join(runRoot, "validation", "non-live-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { root, target, runId, runRoot, statePath: path.join(runRoot, "state.json") };
}

function removeFixture(root) {
  const parent = path.resolve(os.tmpdir());
  if (
    root &&
    root.startsWith(`${parent}${path.sep}`) &&
    path.basename(root).startsWith("generic-importer-supervisor-")
  ) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function assertStatusInspection() {
  const fixture = createFixture("status");
  try {
    const output = parseJson(run(["--state", fixture.statePath, "--status", "--session-id", "status-fixture", "--json"], fixture.target));
    assert.strictEqual(output.schema, "generic-repo-importer-supervisor.status.v1");
    assert.strictEqual(output.auxiliaryId, "AUX-025");
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.currentPhase, "non_live_validation_complete");
    assert.strictEqual(output.nextAction.phase, "live_acceptance");
    assert.strictEqual(output.validation.status, "passed");
    assert.strictEqual(output.validation.snapshotStatus, "matched");
    assert.deepStrictEqual(output.blockers, []);
    assert(fs.existsSync(path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer-supervisor", "status-fixture", "status-report.json")));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertCompactStatusInspection() {
  const fixture = createFixture("compact-status");
  try {
    const result = run(["--state", fixture.statePath, "--status", "--session-id", "compact-status-fixture", "--compact-json"], fixture.target);
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert(result.stdout.length < 8192, `compact supervisor output too large: ${result.stdout.length}`);
    assertNoParentFacingRuntimeLeak(result.stdout);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.schema, "generic-repo-importer-supervisor.parent-compact-output.v1");
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.validation.status, "passed");
    assert.strictEqual(output.proofEnvelope.contractComplete, true);
    assert(output.artifacts.statusReport.path.endsWith("status-report.json"));
    assert(output.artifacts.proofEnvelope.path.endsWith("proof-envelope.json"));
    assert(fs.existsSync(path.join(fixture.target, output.artifacts.statusReport.path)));
    assert(fs.existsSync(path.join(fixture.target, output.artifacts.proofEnvelope.path)));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertDirtyUnownedFailsClosed() {
  const fixture = createFixture("dirty-unowned");
  try {
    fs.writeFileSync(path.join(fixture.target, "unowned.txt"), "dirty\n", "utf8");
    const result = run(["--state", fixture.statePath, "--status", "--session-id", "dirty-fixture", "--json"], fixture.target);
    assert.notStrictEqual(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.ok, false);
    assert(output.blockers.some((entry) => entry.code === "target-repo-dirty-unowned"));
    assert.match(result.stderr, /target-repo-dirty-unowned/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertMissingReportFailsClosed() {
  const fixture = createFixture("missing-report");
  try {
    fs.rmSync(path.join(fixture.runRoot, "validation", "non-live-report.json"), { force: true });
    const result = run(["--state", fixture.statePath, "--status", "--session-id", "missing-report-fixture", "--json"], fixture.target);
    assert.notStrictEqual(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert(output.blockers.some((entry) => entry.code === "non-live-report-missing"));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertStaleReportFailsClosed() {
  const fixture = createFixture("stale-report");
  try {
    fs.writeFileSync(path.join(fixture.target, "recipes", "reset-composition-work-area-typed-plan.md"), "# drifted\n", "utf8");
    const result = run(["--state", fixture.statePath, "--status", "--session-id", "stale-report-fixture", "--json"], fixture.target);
    assert.notStrictEqual(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert(output.blockers.some((entry) => entry.code === "non-live-report-stale"));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertNextActionAndHandoffArtifact() {
  const fixture = createFixture("handoff");
  try {
    const output = parseJson(
      run(["--state", fixture.statePath, "--closeout", "--write-handoff", "--session-id", "handoff-fixture", "--json"], fixture.target),
    );
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.closeout.status, "closed_with_live_unavailable");
    assert.match(output.closeout.reason, /no reset-work-area generated-only live acceptance lane/);
    assert.strictEqual(output.handoffPath, ".codex/handoff.md");
    const handoff = fs.readFileSync(path.join(fixture.target, ".codex", "handoff.md"), "utf8");
    assert.match(handoff, /AUX-025 generic repo importer supervisor/);
    const statusReport = readJson(path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer-supervisor", "handoff-fixture", "status-report.json"));
    assert.strictEqual(statusReport.handoffPath, ".codex/handoff.md");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertAncestorHeadDriftGate() {
  const fixture = createFixture("ancestor-drift");
  try {
    fs.writeFileSync(path.join(fixture.target, "README.md"), "# support commit\n", "utf8");
    sh(fixture.target, ["git", "add", "README.md"]);
    sh(fixture.target, [
      "git",
      "-c",
      "user.name=Smoke",
      "-c",
      "user.email=smoke@example.local",
      "commit",
      "-m",
      "support commit",
    ]);

    const blocked = run(["--state", fixture.statePath, "--status", "--session-id", "ancestor-blocked", "--json"], fixture.target);
    assert.notStrictEqual(blocked.status, 0);
    const blockedOutput = JSON.parse(blocked.stdout);
    assert(blockedOutput.blockers.some((entry) => entry.code === "branch-or-head-drift"));

    const allowed = parseJson(
      run(["--state", fixture.statePath, "--status", "--allow-ancestor-head-drift", "--session-id", "ancestor-allowed", "--json"], fixture.target),
    );
    assert.strictEqual(allowed.ok, true);
    assert.strictEqual(allowed.targetHeadDrift.mode, "ancestor");
    assert.strictEqual(allowed.targetHeadDrift.allowed, true);
  } finally {
    removeFixture(fixture.root);
  }
}

assertStatusInspection();
assertCompactStatusInspection();
assertDirtyUnownedFailsClosed();
assertMissingReportFailsClosed();
assertStaleReportFailsClosed();
assertNextActionAndHandoffArtifact();
assertAncestorHeadDriftGate();

console.log(JSON.stringify({ ok: true, smoke: "sdk-generic-repo-importer-supervisor" }, null, 2));

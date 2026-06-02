"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const runner = path.join(repo, "orchestrator/run-generic-repo-auto-intake.mjs");

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

function assertCompactOutputBounded(rawOutput) {
  assert(rawOutput.length < 12000, "compact output should remain bounded");
  for (const forbidden of [
    '"files"',
    '"entries"',
    '"stdout"',
    '"stderr"',
    '"transcript"',
    '"RAW_JSX_SENTINEL"',
    "eval(RAW_JSX_SENTINEL",
  ]) {
    assert(!rawOutput.includes(forbidden), `compact output leaked ${forbidden}`);
  }
}

function createFixture(name) {
  const parent = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, `generic-auto-intake-${name}-`));
  assert(root.startsWith(`${parent}${path.sep}`), `unexpected temp path: ${root}`);
  const source = path.join(root, "source-checkout");
  fs.mkdirSync(path.join(source, "Scripts"), { recursive: true });
  fs.mkdirSync(path.join(source, "Docs"), { recursive: true });
  fs.writeFileSync(path.join(source, "README.md"), "# Fixture without license\n", "utf8");
  fs.writeFileSync(path.join(source, "Docs", "usage.md"), "Fixture docs\n", "utf8");
  fs.writeFileSync(
    path.join(source, "Scripts", "Inspect_Selected_Layers.jsx"),
    "function inspectSelectedLayers() { return app.project ? true : false; }\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(source, "Scripts", "Helper.jsxinc"),
    "function helperOnly() { return true; }\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(source, "Scripts", "Unsafe_System.jsx"),
    "var RAW_JSX_SENTINEL = 'must-not-copy'; eval(RAW_JSX_SENTINEL);\n",
    "utf8",
  );
  return { root, source };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repo, relativePath), "utf8"));
}

function assertRuntimePathSafe(relativePath) {
  const absolute = path.resolve(repo, relativePath);
  const runtimeRoot = path.resolve(repo, ".codex-runtime", "sdk", "generic-repo-importer");
  assert(absolute.startsWith(`${runtimeRoot}${path.sep}`), `unexpected runtime path: ${absolute}`);
  return absolute;
}

function assertNoRawJsxContentInArtifacts(artifactTexts) {
  for (const text of artifactTexts) {
    assert(!text.includes("RAW_JSX_SENTINEL"), "artifact leaked raw JSX source content");
    assert(!text.includes("must-not-copy"), "artifact leaked raw JSX string literal");
  }
}

function autoIntakeFixtureSmoke() {
  const fixture = createFixture("missing-license");
  let runtimeRoot = null;
  try {
    const result = run([
      "--repo",
      fixture.source,
      "--run-id",
      "auto-intake-fixture-smoke",
      "--context-percent",
      "5",
      "--parallel-candidate-limit",
      "2",
      "--compact-json",
    ]);
    const output = parseJson(result);
    assertCompactOutputBounded(result.stdout);
    assert.strictEqual(output.schema, "generic-repo-auto-intake.parent-compact-output.v1");
    assert.strictEqual(output.status, "auto_intake_plan_ready");
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.source.inputKind, "local-path");
    assert.strictEqual(output.source.license.status, "missing");
    assert.strictEqual(output.source.license.referenceOnlyDefault, true);
    assert.strictEqual(output.safetyPolicy.localOllamaAllowed, false);
    assert.strictEqual(output.safetyPolicy.fallbackProviderAllowed, false);
    assert.strictEqual(output.safetyPolicy.liveCepAeAllowed, false);
    assert.strictEqual(output.safetyPolicy.rawJsxCopyAllowed, false);
    assert.strictEqual(output.parallel.mode, "plan_only");
    assert.strictEqual(output.parallel.worktrees.created, 0);
    assert.strictEqual(output.parallel.candidatesExecuted, 0);
    assert.strictEqual(output.parallel.centralSourceMerge, false);
    assert.strictEqual(output.parallel.selectedCandidateIds.length, 2);

    runtimeRoot = assertRuntimePathSafe(output.artifacts.runRoot);
    for (const artifactName of ["inventory", "ledger", "parallelPlan", "status", "proof", "handoff"]) {
      assert(fs.existsSync(path.join(repo, output.artifacts[artifactName])), `${artifactName} should exist`);
    }

    const inventory = readJson(output.artifacts.inventory);
    const ledger = readJson(output.artifacts.ledger);
    const plan = readJson(output.artifacts.parallelPlan);
    const status = readJson(output.artifacts.status);
    const proof = readJson(output.artifacts.proof);
    const artifactTexts = ["inventory", "ledger", "parallelPlan", "status", "proof"].map((name) =>
      fs.readFileSync(path.join(repo, output.artifacts[name]), "utf8"),
    );

    assert.strictEqual(inventory.schema, "generic-repo-auto-intake.inventory.v1");
    assert.strictEqual(inventory.counts["license-like"], 0);
    assert.strictEqual(inventory.counts.jsx, 2);
    assert.strictEqual(inventory.counts.jsxinc, 1);
    assert.strictEqual(inventory.counts.markdown, 2);
    assert.strictEqual(ledger.schema, "generic-repo-auto-intake.queue-ledger.v1");
    assert.strictEqual(ledger.constraints.noLocalOllama, true);
    assert.strictEqual(ledger.constraints.noFallbackProviders, true);
    assert.strictEqual(ledger.constraints.noLiveCepAe, true);
    assert.strictEqual(ledger.constraints.noDependencyOrPackageChanges, true);
    assert.strictEqual(ledger.constraints.noRawJsxCopiedIntoProduct, true);
    assert.strictEqual(ledger.licensePolicy.referenceOnlyDefault, true);
    assert.strictEqual(ledger.entries.length, 3);
    assert(!Object.prototype.hasOwnProperty.call(ledger, "nextCandidate"), "missing license should not expose queued nextCandidate");
    assert(ledger.entries.every((entry) => entry.referenceOnly === true), "all missing-license entries should be reference-only");
    assert(ledger.entries.every((entry) => entry.status === "reference_only"), "all missing-license entries should be reference-only status");
    assert(ledger.entries.every((entry) => entry.implementation.rawJsxCopyAllowed === false));
    assert(ledger.entries.every((entry) => entry.implementation.plannedPaths.length === 0));
    assert(ledger.entries.every((entry) => entry.failClosed?.rawJsxCopyBlocked === true));

    const unsafe = ledger.entries.find((entry) => entry.sourcePath.endsWith("Unsafe_System.jsx"));
    assert(unsafe, "unsafe fixture candidate should be inventoried");
    assert.strictEqual(unsafe.classification, "unsafe_skip_tool_gap");
    assert.strictEqual(unsafe.riskFlags.highRisk, true);

    assert.strictEqual(plan.schema, "generic-repo-full-intake.parallel-candidate-plan.v1");
    assert.strictEqual(plan.mode, "auto_intake_parallel_plan_only");
    assert.strictEqual(plan.execution.candidatesExecuted, 0);
    assert.strictEqual(plan.execution.childWorktreesCreated, 0);
    assert.strictEqual(plan.execution.centralSourceMerge, false);
    assert.strictEqual(plan.selectedCandidateIds.length, 2);
    assert(plan.candidates.every((candidate) => candidate.referenceOnly === true));
    assert(plan.candidates.every((candidate) => candidate.rawJsxCopyAllowed === false));
    assert(!plan.selectedCandidateIds.includes(unsafe.id), "unsafe candidate must not be selected for parallel plan");

    assert.strictEqual(status.schema, "generic-repo-auto-intake.status.v1");
    assert.strictEqual(status.counts.referenceOnlyCandidates, 3);
    assert.strictEqual(proof.schema, "generic-repo-auto-intake.proof.v1");
    assert.strictEqual(proof.contractComplete, true);
    assert.strictEqual(proof.assertions.missingOrUnrecognizedLicenseReferenceOnly, true);
    assert.strictEqual(proof.assertions.rawJsxCopyBlocked, true);
    assert.strictEqual(proof.assertions.noCandidateExecution, true);
    assert.strictEqual(proof.assertions.noChildWorktrees, true);
    assert.strictEqual(proof.assertions.noCentralSourceMerge, true);
    assertNoRawJsxContentInArtifacts(artifactTexts);
  } finally {
    if (runtimeRoot && fs.existsSync(runtimeRoot)) {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    }
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

autoIntakeFixtureSmoke();
console.log("sdk-generic-repo-auto-intake-smoke: ok");

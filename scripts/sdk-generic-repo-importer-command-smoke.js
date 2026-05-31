"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const runner = path.join(repo, "orchestrator/run-generic-repo-tool-importer.mjs");

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

function createTempFixture(name) {
  const parent = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, `generic-importer-${name}-`));
  assert(
    root.startsWith(`${parent}${path.sep}`) &&
      path.basename(root).startsWith(`generic-importer-${name}-`),
    `unexpected temp path: ${root}`,
  );

  const target = path.join(root, "target");
  const source = path.join(root, "source");
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, "tool.js"), "export function tool() { return true; }\n", "utf8");
  fs.mkdirSync(path.join(source, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(source, "scripts", "smoke.js"), "console.log('fixture smoke');\n", "utf8");
  fs.writeFileSync(
    path.join(source, "package.json"),
    `${JSON.stringify({ scripts: { smoke: "node scripts/smoke.js" } }, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(path.join(source, "LICENSE"), "Fixture license\n", "utf8");

  sh(target, ["git", "init"]);
  fs.writeFileSync(path.join(target, ".gitignore"), ".codex-runtime/\n", "utf8");
  fs.writeFileSync(path.join(target, "README.md"), "# target\n", "utf8");
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

  return { root, source, target };
}

function removeFixture(root) {
  const parent = path.resolve(os.tmpdir());
  if (
    root &&
    root.startsWith(`${parent}${path.sep}`) &&
    path.basename(root).startsWith("generic-importer-")
  ) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function validManifest(fixture, runId = "aux015-valid") {
  return {
    schema: "generic-repo-tool-importer.manifest.v1",
    run: {
      runId,
      createdAt: "2026-05-26T00:00:00.000Z",
      requestedGoal: "Import a generic repository tool fixture without starting analysis.",
      codexCliOnly: true,
      resumable: true,
      resumeFromState: true,
      defaultModel: "gpt-5.3-codex",
      webSearch: "disabled",
    },
    sourceRepo: {
      inputKind: "local-path",
      location: fixture.source,
      revision: "fixture",
      allowedReadRoots: [fixture.source],
      deniedReadRoots: [".git", "node_modules"],
    },
    targetRepo: {
      path: fixture.target,
      allowedWritePaths: ["orchestrator/**", "scripts/**", ".codex-audit/sdk-generic-repo-importer/**"],
      forbiddenWritePaths: [".git/**", "node_modules/**", "package.json", "package-lock.json", "cep-panel/**"],
      branchPolicy: "do-not-create-branch-by-default",
      pushPolicy: "manual-user-approval-required",
    },
    intake: {
      fingerprintFiles: ["package.json", "README.md"],
      inventoryRules: ["fixture-only"],
      licensePolicy: "classify-before-import",
      secretPolicy: "reject-secrets",
      sizeLimits: {
        maxFiles: 100,
        maxBytes: 1048576,
      },
    },
    analysis: {
      toolDiscovery: { enabled: true },
      automationDiscovery: { enabled: true },
      contractExtraction: { enabled: true },
      riskClassification: { enabled: true },
      readBackRequirements: { required: true },
      batching: {
        maxParallelAnalysisWorkers: 1,
        maxParallelImplementationBatches: 1,
      },
    },
    implementation: {
      batchWorktrees: { mode: "future-isolated-per-tool-or-batch" },
      plannedPathsPerBatch: [],
      codexCliInvocation: {
        engine: "codex-cli",
        sandbox: "workspace-write",
        approvalPolicy: "never",
        webSearch: "disabled",
        localOllama: false,
      },
      reviewerPolicy: { readOnly: true },
      artifactPolicy: { runtimeOnlyUntilPromotion: true },
    },
    merge: {
      supervisor: "single controlled merge supervisor",
      mergePlan: { mode: "future-controlled-merge" },
      diffPolicy: { plannedPathsOnly: true },
      conflictPolicy: { failClosed: true },
      plannedPathGate: { required: true },
    },
    validation: {
      nonLiveCommands: ["node --check <touched-js-files>", "git diff --check"],
      nodeCheckTouchedJs: true,
      gitDiffCheck: true,
      semanticVerification: { requiredBeforeLive: true },
      reportPath: "validation/non-live-report.json",
    },
    liveAcceptance: {
      queue: "serial-live-ae-cep-acceptance-queue",
      lock: "locks/live-ae-cep.lock",
      mode: "generated-only-openai-cli-when-available",
      providerPath: "OpenAI CLI through Codex CLI only",
      flow: ["m100_proposal", "dry_run", "confirmed_run", "read_back", "semantic_verification"],
      generatedOnlyPolicy: { required: true },
      readBackPolicy: { required: true },
      semanticVerification: { required: true },
    },
    approvals: {
      manualUserApprovalRequiredFor: ["push", "pull_request"],
      automaticSafetyGatesFor: [
        "external repository intake",
        "parallel analysis",
        "parallel implementation worktrees",
        "dependency change rejection",
        "controlled merge",
        "non-live validation",
        "generated-only live queue gating",
      ],
    },
    safety: {
      forbiddenActions: [
        "use_local_ollama",
        "use_external_provider_fallback",
        "write_source_repository",
        "push_without_manual_user_approval",
        "create_pr_without_manual_user_approval",
        "run_live_cep_ae_without_serial_lock",
        "run_mutating_live_without_m100_flow",
        "merge_unvalidated_batch",
        "change_dependencies_without_manifest_allowance",
        "continue_after_context_hard_handoff",
      ],
      forbiddenPaths: [".git/**", "node_modules/**", "package.json", "package-lock.json", "cep-panel/**"],
      stopGates: [
        "manifest-schema-invalid",
        "target-repo-dirty-unowned",
        "source-repo-write-attempt",
        "local-ollama-selected",
        "dependency-change-requested",
        "context-pressure",
      ],
      auditEvidence: { required: true },
    },
  };
}

function writeManifest(root, manifest, name = "importer.manifest.json") {
  const manifestPath = path.join(root, name);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
      '  const mode = process.env.FAKE_CODEX_MODE || "success";',
      '  if (!input.includes("AUX-021 generic repository importer child-run execution wrapper")) {',
      '    console.error("missing AUX-021 wrapper");',
      '    process.exit(9);',
      '  }',
      '  if (mode === "fail") {',
      '    console.error("fake codex failure");',
      '    process.exit(7);',
      '  }',
      '  if (mode === "large-output") {',
      '    process.stdout.write("L".repeat(3 * 1024 * 1024));',
      '  }',
      '  if (mode !== "no-change") {',
      '    const relative = process.env.FAKE_CODEX_WRITE_PATH || "scripts/imported-tools/tool-tool.js";',
      '    const absolute = path.join(cwd, relative);',
      '    fs.mkdirSync(path.dirname(absolute), { recursive: true });',
      '    fs.writeFileSync(absolute, `// fake imported output\\nmodule.exports = ${JSON.stringify(mode)};\\n`, "utf8");',
      '  }',
      '  console.log(`fake codex ${mode}`);',
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

function fakeCodexEnv(binDir, mode, writePath) {
  const currentPath = process.env.PATH || process.env.Path || "";
  const nextPath = `${binDir}${path.delimiter}${currentPath}`;
  return {
    FAKE_CODEX_MODE: mode,
    FAKE_CODEX_WRITE_PATH: writePath || "",
    PATH: nextPath,
    Path: nextPath,
  };
}

function assertValidRunArtifacts(output, fixture, runId) {
  assert.strictEqual(output.schema, "generic-repo-tool-importer.command-skeleton.v1");
  assert.strictEqual(output.auxiliaryId, "AUX-015");
  assert.strictEqual(output.runId, runId);
  assert.strictEqual(output.status, "stopped_before_analysis");
  assert.strictEqual(output.nextPhase, "analysis");
  assert.strictEqual(output.analysisStarted, false);
  assert.strictEqual(output.worktreesCreated, false);
  assert.strictEqual(output.liveCepAeRun, false);
  assert.strictEqual(output.localOllamaUsed, false);

  const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", runId);
  assert.strictEqual(output.runRoot, runRoot);
  for (const fileName of [
    "state.json",
    "events.jsonl",
    "manifest.original.json",
    "manifest.normalized.json",
    "supervisor-plan.json",
  ]) {
    assert(fs.existsSync(path.join(runRoot, fileName)), `${fileName} must exist`);
  }

  const state = readJson(path.join(runRoot, "state.json"));
  assert.strictEqual(state.status, "stopped");
  assert.strictEqual(state.currentPhase, "initialized");
  assert.strictEqual(state.nextPhase, "analysis");
  assert.strictEqual(state.stopReason, "stopped_before_analysis");
  assert.strictEqual(state.flags.analysisStarted, false);
  assert.strictEqual(state.flags.worktreesCreated, false);
  assert.strictEqual(state.flags.liveCepAeRun, false);
  assert.strictEqual(state.flags.localOllamaUsed, false);

  const normalized = readJson(path.join(runRoot, "manifest.normalized.json"));
  assert.strictEqual(normalized._meta.manifestHash, state.manifestHash);
  assert.strictEqual(normalized._meta.sourceContractPath.endsWith("aux-014-generic-repo-importer-contract.json"), true);
  assert.strictEqual(normalized.run.defaultModel, "gpt-5.3-codex");

  const supervisorPlan = readJson(path.join(runRoot, "supervisor-plan.json"));
  assert.strictEqual(supervisorPlan.schema, "generic-repo-tool-importer.supervisor-plan.v1");
  assert.strictEqual(supervisorPlan.auxiliaryId, "AUX-015");
  assert.strictEqual(supervisorPlan.status, "stopped_before_analysis");
  assert.strictEqual(supervisorPlan.codexCliSemantics.engine, "codex-cli");
  assert.strictEqual(supervisorPlan.codexCliSemantics.localOllama, false);
  assert.strictEqual(supervisorPlan.codexCliSemantics.executionStarted, false);
  assert.strictEqual(supervisorPlan.forbiddenBoundaries.worktreeCreation, false);
  assert.strictEqual(supervisorPlan.forbiddenBoundaries.liveCepAeRun, false);

  const events = fs.readFileSync(path.join(runRoot, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse);
  assert.deepStrictEqual(events.map((event) => event.event), ["run_initialized", "stopped_before_analysis"]);

  assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain"]), "");
}

function assertValidManifestFixture() {
  const fixture = createTempFixture("valid");
  try {
    const manifestPath = writeManifest(fixture.root, validManifest(fixture, "aux015-valid"));
    const output = parseJson(run(["--manifest", manifestPath, "--json"]));
    assert.strictEqual(output.resumed, false);
    assertValidRunArtifacts(output, fixture, "aux015-valid");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertInvalidSchemaFixture() {
  const fixture = createTempFixture("invalid-schema");
  try {
    const manifest = validManifest(fixture, "aux015-invalid-schema");
    manifest.schema = "wrong.schema";
    const manifestPath = writeManifest(fixture.root, manifest);
    const result = run(["--manifest", manifestPath, "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /manifest\.schema must be generic-repo-tool-importer\.manifest\.v1/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLocalOllamaRejectedFixture() {
  const fixture = createTempFixture("local-ollama");
  try {
    const manifest = validManifest(fixture, "aux015-local-rejected");
    manifest.liveAcceptance.providerPath = "Local/Ollama";
    const manifestPath = writeManifest(fixture.root, manifest);
    const result = run(["--manifest", manifestPath, "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /Local\/Ollama/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertDirtyUnownedTargetFixture() {
  const fixture = createTempFixture("dirty-target");
  try {
    fs.writeFileSync(path.join(fixture.target, "unowned.txt"), "dirty\n", "utf8");
    const manifestPath = writeManifest(fixture.root, validManifest(fixture, "aux015-dirty-target"));
    const result = run(["--manifest", manifestPath, "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /target-repo-dirty-unowned/);
    const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", "aux015-dirty-target");
    assert.strictEqual(fs.existsSync(runRoot), false);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertResumeFromStateFixture() {
  const fixture = createTempFixture("resume");
  try {
    const manifestPath = writeManifest(fixture.root, validManifest(fixture, "aux015-resume"));
    const first = parseJson(run(["--manifest", manifestPath, "--json"]));
    assert.strictEqual(first.resumed, false);

    const second = parseJson(run(["--manifest", manifestPath, "--json"]));
    assert.strictEqual(second.resumed, true);

    const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", "aux015-resume");
    const state = readJson(path.join(runRoot, "state.json"));
    assert.strictEqual(state.resumeCount, 1);
    assert.strictEqual(state.nextPhase, "analysis");
    assert.strictEqual(state.flags.analysisStarted, false);

    const events = fs.readFileSync(path.join(runRoot, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse);
    assert.deepStrictEqual(events.map((event) => event.event), [
      "run_initialized",
      "stopped_before_analysis",
      "resume_from_state_checked",
      "stopped_before_analysis",
    ]);
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertAnalysisArtifacts(output, fixture, runId) {
  assert.strictEqual(output.schema, "generic-repo-tool-importer.command-skeleton.v1");
  assert.strictEqual(output.auxiliaryId, "AUX-016");
  assert.strictEqual(output.runId, runId);
  assert.strictEqual(output.status, "stopped_after_analysis");
  assert.strictEqual(output.currentPhase, "analysis_complete");
  assert.strictEqual(output.nextPhase, "implementation_planning");
  assert.strictEqual(output.analysisStarted, true);
  assert.strictEqual(output.analysisCompleted, true);
  assert.strictEqual(output.worktreesCreated, false);
  assert.strictEqual(output.liveCepAeRun, false);
  assert.strictEqual(output.localOllamaUsed, false);

  const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", runId);
  const state = readJson(path.join(runRoot, "state.json"));
  assert.strictEqual(state.auxiliaryId, "AUX-016");
  assert.strictEqual(state.status, "stopped");
  assert.strictEqual(state.currentPhase, "analysis_complete");
  assert.strictEqual(state.nextPhase, "implementation_planning");
  assert.strictEqual(state.stopReason, "stopped_before_implementation_worktrees");
  assert.strictEqual(state.flags.analysisStarted, true);
  assert.strictEqual(state.flags.analysisCompleted, true);
  assert.strictEqual(state.flags.worktreesCreated, false);
  assert.strictEqual(state.flags.liveCepAeRun, false);
  assert.strictEqual(state.flags.localOllamaUsed, false);

  const required = [
    "analysis/repo-fingerprint.json",
    "analysis/risk-map.json",
    "analysis/read-back-requirements.json",
    "analysis/batch-plan.json",
  ];
  for (const relative of required) {
    assert(fs.existsSync(path.join(runRoot, relative)), `${relative} must exist`);
  }

  const fingerprint = readJson(path.join(runRoot, "analysis", "repo-fingerprint.json"));
  assert.strictEqual(fingerprint.schema, "generic-repo-tool-importer.repo-fingerprint.v1");
  assert.strictEqual(fingerprint.runId, runId);
  assert(fingerprint.files.some((file) => file.path === "tool.js"));
  assert(fingerprint.files.some((file) => file.path === "package.json"));
  assert.strictEqual(fingerprint.licenseFile, "LICENSE");

  const toolCandidates = fs.readdirSync(path.join(runRoot, "analysis", "tool-candidates"));
  assert(toolCandidates.some((file) => file.endsWith(".json") && file !== "none.json"));
  const automationCandidates = fs.readdirSync(path.join(runRoot, "analysis", "automation-candidates"));
  assert(automationCandidates.some((file) => file.endsWith(".json") && file !== "none.json"));

  const riskMap = readJson(path.join(runRoot, "analysis", "risk-map.json"));
  assert.strictEqual(riskMap.schema, "generic-repo-tool-importer.risk-map.v1");
  assert.strictEqual(riskMap.checks.localOllama, "rejected_by_manifest_validation");
  assert.strictEqual(riskMap.checks.namedRepoAssumptions, "passed");
  assert.strictEqual(riskMap.checks.secrets, "passed");
  assert.strictEqual(riskMap.checks.worktreesCreated, false);
  assert.strictEqual(riskMap.checks.liveCepAeRun, false);

  const batchPlan = readJson(path.join(runRoot, "analysis", "batch-plan.json"));
  assert.strictEqual(batchPlan.schema, "generic-repo-tool-importer.batch-plan.v1");
  assert.strictEqual(batchPlan.implementationWorktreesCreated, false);
  assert.strictEqual(batchPlan.batches[0].worktree, null);

  const supervisorPlan = readJson(path.join(runRoot, "supervisor-plan.json"));
  assert.strictEqual(supervisorPlan.auxiliaryId, "AUX-016");
  assert.strictEqual(supervisorPlan.status, "stopped_after_analysis");
  assert.strictEqual(supervisorPlan.stopBeforePhase, "implementation_worktrees");
  assert.strictEqual(supervisorPlan.analysis.worktreesCreated, false);
  assert.strictEqual(supervisorPlan.analysis.liveCepAeRun, false);

  assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain"]), "");
}

function assertSuccessfulAnalysisFixture() {
  const fixture = createTempFixture("analysis-success");
  try {
    const manifestPath = writeManifest(fixture.root, validManifest(fixture, "aux016-analysis-success"));
    const output = parseJson(run(["--manifest", manifestPath, "--run-analysis", "--json"]));
    assert.strictEqual(output.resumed, false);
    assertAnalysisArtifacts(output, fixture, "aux016-analysis-success");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertMissingOutputFailClosedFixture() {
  const fixture = createTempFixture("missing-output");
  try {
    const manifestPath = writeManifest(fixture.root, validManifest(fixture, "aux016-missing-output"));
    parseJson(run(["--manifest", manifestPath, "--run-analysis", "--json"]));
    const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", "aux016-missing-output");
    fs.rmSync(path.join(runRoot, "analysis", "risk-map.json"), { force: true });
    const result = run(["--manifest", manifestPath, "--run-analysis", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /analysis-output-missing: analysis\/risk-map\.json/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertUnsafeSecretFixture() {
  const fixture = createTempFixture("unsafe-secret");
  try {
    fs.writeFileSync(path.join(fixture.source, "secret.env"), "OPENAI_API_KEY=sk-fixtureSecretValue\n", "utf8");
    const manifestPath = writeManifest(fixture.root, validManifest(fixture, "aux016-secret-stop"));
    const result = run(["--manifest", manifestPath, "--run-analysis", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /unsafe-secret-detected/);
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLicenseStopFixture() {
  const fixture = createTempFixture("license-stop");
  try {
    fs.rmSync(path.join(fixture.source, "LICENSE"), { force: true });
    const manifest = validManifest(fixture, "aux016-license-stop");
    manifest.intake.licensePolicy = "require-license";
    const manifestPath = writeManifest(fixture.root, manifest);
    const result = run(["--manifest", manifestPath, "--run-analysis", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /license-review-failed/);
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertNamedRepoAssumptionFixture() {
  const fixture = createTempFixture("named-repo");
  try {
    const manifest = validManifest(fixture, "aux016-named-repo");
    manifest.run.requestedGoal = "Import Dakkshin-specific tools";
    const manifestPath = writeManifest(fixture.root, manifest);
    const result = run(["--manifest", manifestPath, "--run-analysis", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /named-repo assumptions/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertAnalysisResumeFixture() {
  const fixture = createTempFixture("analysis-resume");
  try {
    const manifestPath = writeManifest(fixture.root, validManifest(fixture, "aux016-analysis-resume"));
    const init = parseJson(run(["--manifest", manifestPath, "--json"]));
    assert.strictEqual(init.status, "stopped_before_analysis");

    const analysis = parseJson(run(["--manifest", manifestPath, "--run-analysis", "--json"]));
    assert.strictEqual(analysis.resumed, true);
    assertAnalysisArtifacts(analysis, fixture, "aux016-analysis-resume");

    const second = parseJson(run(["--manifest", manifestPath, "--run-analysis", "--json"]));
    assert.strictEqual(second.resumed, true);
    assert.strictEqual(second.status, "stopped_after_analysis");

    const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", "aux016-analysis-resume");
    const state = readJson(path.join(runRoot, "state.json"));
    assert.strictEqual(state.resumeCount, 2);
    assert.strictEqual(state.currentPhase, "analysis_complete");
    assert.strictEqual(state.nextPhase, "implementation_planning");

    const events = fs.readFileSync(path.join(runRoot, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse);
    assert(events.some((event) => event.event === "analysis_started"));
    assert(events.some((event) => event.event === "analysis_complete"));
    assert(events.some((event) => event.event === "analysis_resume_verified"));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationPlanningArtifacts(output, fixture, runId) {
  assert.strictEqual(output.schema, "generic-repo-tool-importer.command-skeleton.v1");
  assert.strictEqual(output.auxiliaryId, "AUX-017");
  assert.strictEqual(output.runId, runId);
  assert.strictEqual(output.status, "stopped_after_implementation_planning");
  assert.strictEqual(output.currentPhase, "implementation_planned");
  assert.strictEqual(output.nextPhase, "implementation_worktrees");
  assert.strictEqual(output.analysisCompleted, true);
  assert.strictEqual(output.implementationPlanned, true);
  assert.strictEqual(output.worktreesCreated, false);
  assert.strictEqual(output.childRunsCreated, false);
  assert.strictEqual(output.liveCepAeRun, false);
  assert.strictEqual(output.localOllamaUsed, false);

  const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", runId);
  const state = readJson(path.join(runRoot, "state.json"));
  assert.strictEqual(state.auxiliaryId, "AUX-017");
  assert.strictEqual(state.status, "stopped");
  assert.strictEqual(state.currentPhase, "implementation_planned");
  assert.strictEqual(state.nextPhase, "implementation_worktrees");
  assert.strictEqual(state.stopReason, "stopped_before_actual_implementation_worktrees");
  assert.strictEqual(state.flags.implementationPlanned, true);
  assert.strictEqual(state.flags.worktreesCreated, false);
  assert.strictEqual(state.flags.childRunsCreated, false);

  for (const relative of [
    "implementation/batch-worktree-plan.json",
    "implementation/planned-paths.json",
  ]) {
    assert(fs.existsSync(path.join(runRoot, relative)), `${relative} must exist`);
  }

  const plannedPaths = readJson(path.join(runRoot, "implementation", "planned-paths.json"));
  assert.strictEqual(plannedPaths.schema, "generic-repo-tool-importer.planned-paths.v1");
  assert.strictEqual(plannedPaths.status, "planned_only");
  assert.strictEqual(plannedPaths.dependencyChangesAllowed, false);
  assert.strictEqual(plannedPaths.checks.allowlist, "passed");
  assert.strictEqual(plannedPaths.checks.forbiddenPaths, "passed");
  assert(plannedPaths.allPlannedPaths.some((entry) => entry.startsWith("scripts/imported-tools/")));
  assert(plannedPaths.allPlannedPaths.some((entry) => entry.startsWith("scripts/imported-automations/")));

  const worktreePlan = readJson(path.join(runRoot, "implementation", "batch-worktree-plan.json"));
  assert.strictEqual(worktreePlan.schema, "generic-repo-tool-importer.batch-worktree-plan.v1");
  assert.strictEqual(worktreePlan.status, "planned_only");
  assert.strictEqual(worktreePlan.worktreesCreated, false);
  assert.strictEqual(worktreePlan.childRunsCreated, false);
  assert.strictEqual(worktreePlan.batches[0].actualWorktreePath, null);
  assert.strictEqual(worktreePlan.batches[0].worktreeCreated, false);
  assert(worktreePlan.batches[0].promptPath.endsWith(".md"));
  assert(fs.existsSync(path.join(runRoot, worktreePlan.batches[0].promptPath)));

  const prompt = fs.readFileSync(path.join(runRoot, worktreePlan.batches[0].promptPath), "utf8");
  assert(prompt.includes("Do not create branches or git worktrees."));
  assert(prompt.includes("Do not use Local/Ollama"));

  const supervisorPlan = readJson(path.join(runRoot, "supervisor-plan.json"));
  assert.strictEqual(supervisorPlan.auxiliaryId, "AUX-017");
  assert.strictEqual(supervisorPlan.status, "stopped_after_implementation_planning");
  assert.strictEqual(supervisorPlan.stopBeforePhase, "implementation_worktrees");
  assert.strictEqual(supervisorPlan.implementationPlanning.worktreesCreated, false);
  assert.strictEqual(supervisorPlan.implementationPlanning.childRunsCreated, false);

  assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain"]), "");
}

function assertSuccessfulImplementationPlanningFixture() {
  const fixture = createTempFixture("implementation-success");
  try {
    const manifestPath = writeManifest(fixture.root, validManifest(fixture, "aux017-implementation-success"));
    const analysis = parseJson(run(["--manifest", manifestPath, "--run-analysis", "--json"]));
    assert.strictEqual(analysis.status, "stopped_after_analysis");

    const output = parseJson(run(["--manifest", manifestPath, "--plan-implementation", "--json"]));
    assert.strictEqual(output.resumed, true);
    assertImplementationPlanningArtifacts(output, fixture, "aux017-implementation-success");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationMissingAnalysisArtifactFixture() {
  const fixture = createTempFixture("implementation-missing-analysis");
  try {
    const manifestPath = writeManifest(fixture.root, validManifest(fixture, "aux017-missing-analysis"));
    parseJson(run(["--manifest", manifestPath, "--run-analysis", "--json"]));
    const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", "aux017-missing-analysis");
    fs.rmSync(path.join(runRoot, "analysis", "batch-plan.json"), { force: true });

    const result = run(["--manifest", manifestPath, "--plan-implementation", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /analysis-output-missing: analysis\/batch-plan\.json/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationForbiddenPathFixture() {
  const fixture = createTempFixture("implementation-forbidden-path");
  try {
    const manifest = validManifest(fixture, "aux017-forbidden-path");
    manifest.implementation.plannedPathsPerBatch = [
      {
        id: "bad-cep-panel-path",
        candidateIds: ["*"],
        plannedPaths: ["cep-panel/panel.js"],
      },
    ];
    const manifestPath = writeManifest(fixture.root, manifest);
    parseJson(run(["--manifest", manifestPath, "--run-analysis", "--json"]));

    const result = run(["--manifest", manifestPath, "--plan-implementation", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /forbidden-target-path: cep-panel\/panel\.js/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationDependencyChangeFixture() {
  const fixture = createTempFixture("implementation-dependency-change");
  try {
    const manifest = validManifest(fixture, "aux017-dependency-change");
    manifest.targetRepo.allowedWritePaths = [...manifest.targetRepo.allowedWritePaths, "package.json"];
    manifest.targetRepo.forbiddenWritePaths = manifest.targetRepo.forbiddenWritePaths.filter(
      (entry) => !["package.json", "package-lock.json"].includes(entry),
    );
    manifest.safety.forbiddenPaths = manifest.safety.forbiddenPaths.filter(
      (entry) => !["package.json", "package-lock.json"].includes(entry),
    );
    manifest.implementation.plannedPathsPerBatch = [
      {
        id: "dependency-file-path",
        candidateIds: ["*"],
        plannedPaths: ["package.json"],
      },
    ];
    const manifestPath = writeManifest(fixture.root, manifest);
    parseJson(run(["--manifest", manifestPath, "--run-analysis", "--json"]));

    const result = run(["--manifest", manifestPath, "--plan-implementation", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /dependency-change-requested-without-manifest-allowance: package\.json/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationSharedConflictFixture() {
  const fixture = createTempFixture("implementation-shared-conflict");
  try {
    const manifest = validManifest(fixture, "aux017-shared-conflict");
    manifest.analysis.batching.maxParallelImplementationBatches = 2;
    manifest.implementation.plannedPathsPerBatch = [
      {
        id: "batch-one",
        candidateIds: ["*"],
        plannedPaths: ["scripts/shared-registry.js"],
      },
      {
        id: "batch-two",
        candidateIds: ["*"],
        plannedPaths: ["scripts/shared-registry.js"],
      },
    ];
    const manifestPath = writeManifest(fixture.root, manifest);
    parseJson(run(["--manifest", manifestPath, "--run-analysis", "--json"]));

    const result = run(["--manifest", manifestPath, "--plan-implementation", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /shared-file-batch-conflict-without-merge-owner: scripts\/shared-registry\.js/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationResumeFixture() {
  const fixture = createTempFixture("implementation-resume");
  try {
    const manifestPath = writeManifest(fixture.root, validManifest(fixture, "aux017-implementation-resume"));
    parseJson(run(["--manifest", manifestPath, "--run-analysis", "--json"]));
    const first = parseJson(run(["--manifest", manifestPath, "--plan-implementation", "--json"]));
    assertImplementationPlanningArtifacts(first, fixture, "aux017-implementation-resume");

    const second = parseJson(run(["--manifest", manifestPath, "--plan-implementation", "--json"]));
    assert.strictEqual(second.resumed, true);
    assertImplementationPlanningArtifacts(second, fixture, "aux017-implementation-resume");

    const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", "aux017-implementation-resume");
    const state = readJson(path.join(runRoot, "state.json"));
    assert(state.resumeCount >= 2);
    const events = fs.readFileSync(path.join(runRoot, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse);
    assert(events.some((event) => event.event === "implementation_planned"));
    assert(events.some((event) => event.event === "implementation_plan_resume_verified"));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationWorktreeArtifacts(output, fixture, runId) {
  assert.strictEqual(output.schema, "generic-repo-tool-importer.command-skeleton.v1");
  assert.strictEqual(output.auxiliaryId, "AUX-020");
  assert.strictEqual(output.runId, runId);
  assert.strictEqual(output.status, "stopped_after_implementation_worktrees");
  assert.strictEqual(output.currentPhase, "implementation_worktrees_ready");
  assert.strictEqual(output.nextPhase, "implementation_child_runs");
  assert.strictEqual(output.analysisCompleted, true);
  assert.strictEqual(output.implementationPlanned, true);
  assert.strictEqual(output.implementationWorktreesReady, true);
  assert.strictEqual(output.worktreesCreated, true);
  assert.strictEqual(output.branchCreated, false);
  assert.strictEqual(output.childRunsCreated, false);
  assert.strictEqual(output.controlledMergeApplied, false);
  assert.strictEqual(output.liveCepAeRun, false);
  assert.strictEqual(output.localOllamaUsed, false);
  assert.strictEqual(output.fallbackProviderUsed, false);

  const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", runId);
  const state = readJson(path.join(runRoot, "state.json"));
  assert.strictEqual(state.auxiliaryId, "AUX-020");
  assert.strictEqual(state.status, "stopped");
  assert.strictEqual(state.currentPhase, "implementation_worktrees_ready");
  assert.strictEqual(state.nextPhase, "implementation_child_runs");
  assert.strictEqual(state.stopReason, "stopped_before_codex_child_runs");
  assert.strictEqual(state.flags.implementationWorktreesReady, true);
  assert.strictEqual(state.flags.worktreesCreated, true);
  assert.strictEqual(state.flags.branchCreated, false);
  assert.strictEqual(state.flags.childRunsCreated, false);

  for (const relative of [
    "implementation/worktree-run.json",
  ]) {
    assert(fs.existsSync(path.join(runRoot, relative)), `${relative} must exist`);
  }

  const worktreeRun = readJson(path.join(runRoot, "implementation", "worktree-run.json"));
  assert.strictEqual(worktreeRun.schema, "generic-repo-tool-importer.implementation-worktree-run.v1");
  assert.strictEqual(worktreeRun.status, "worktrees_created_child_runs_not_started");
  assert.strictEqual(worktreeRun.worktreesCreated, true);
  assert.strictEqual(worktreeRun.branchCreated, false);
  assert.strictEqual(worktreeRun.childRunsCreated, false);
  assert.strictEqual(worktreeRun.controlledMergeApplied, false);
  assert.strictEqual(worktreeRun.validationCommandsRun, false);
  assert.strictEqual(worktreeRun.liveCepAeRun, false);
  assert.strictEqual(worktreeRun.localOllamaUsed, false);
  assert.strictEqual(worktreeRun.fallbackProviderUsed, false);
  assert.strictEqual(worktreeRun.checks.branchCreation, "detached_worktree_only");
  assert.strictEqual(worktreeRun.checks.childRuns, "not_started");
  assert.strictEqual(worktreeRun.checks.mergeApplication, "not_started");
  assert(worktreeRun.batches.length > 0);

  const firstBatch = worktreeRun.batches[0];
  assert(fs.existsSync(firstBatch.actualWorktreePath), "actual worktree must exist");
  assert(firstBatch.actualWorktreeRelativePath.startsWith(`.codex-runtime/sdk/generic-repo-importer/${runId}/worktrees/`));
  assert(fs.existsSync(path.join(runRoot, firstBatch.batchResultPath)), "batch result must exist");
  assert(fs.existsSync(path.join(runRoot, firstBatch.childRunIntentPath)), "child run intent must exist");
  assert.strictEqual(sh(firstBatch.actualWorktreePath, ["git", "rev-parse", "--is-inside-work-tree"]), "true");
  const branch = spawnSync("git", ["symbolic-ref", "-q", "--short", "HEAD"], {
    cwd: firstBatch.actualWorktreePath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.notStrictEqual(branch.status, 0, "implementation worktree must be detached");
  assert.strictEqual(sh(firstBatch.actualWorktreePath, ["git", "status", "--porcelain", "--untracked-files=all"]), "");

  const batchResult = readJson(path.join(runRoot, firstBatch.batchResultPath));
  assert.strictEqual(batchResult.status, "worktree_ready");
  assert.strictEqual(batchResult.worktreeCreated, true);
  assert.strictEqual(batchResult.branchCreated, false);
  assert.strictEqual(batchResult.childRunCreated, false);
  assert.strictEqual(batchResult.controlledMergeApplied, false);
  assert.strictEqual(batchResult.validationCommandsRun, false);
  assert.strictEqual(batchResult.liveCepAeRun, false);

  const childRunIntent = readJson(path.join(runRoot, firstBatch.childRunIntentPath));
  assert.strictEqual(childRunIntent.status, "not_started");
  assert.strictEqual(childRunIntent.commandNotRun, true);
  assert.strictEqual(childRunIntent.localOllama, false);
  assert.strictEqual(childRunIntent.stopReason, "stopped_before_codex_child_runs");

  const supervisorPlan = readJson(path.join(runRoot, "supervisor-plan.json"));
  assert.strictEqual(supervisorPlan.auxiliaryId, "AUX-020");
  assert.strictEqual(supervisorPlan.status, "stopped_after_implementation_worktrees");
  assert.strictEqual(supervisorPlan.stopBeforePhase, "codex_child_runs");
  assert.strictEqual(supervisorPlan.implementationWorktrees.worktreesCreated, true);
  assert.strictEqual(supervisorPlan.implementationWorktrees.branchCreated, false);
  assert.strictEqual(supervisorPlan.implementationWorktrees.childRunsCreated, false);
  assert.strictEqual(supervisorPlan.implementationWorktrees.controlledMergeApplied, false);

  assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
}

function assertSuccessfulImplementationWorktreeFixture() {
  const fixture = createTempFixture("implementation-worktree-success");
  try {
    const runId = "aux020-worktree-success";
    const { manifestPath } = prepareImplementationFixture(fixture, runId);
    const output = parseJson(run(["--manifest", manifestPath, "--run-implementation-worktrees", "--json"]));
    assert.strictEqual(output.resumed, true);
    assertImplementationWorktreeArtifacts(output, fixture, runId);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationWorktreeMissingPlanFixture() {
  const fixture = createTempFixture("implementation-worktree-missing-plan");
  try {
    const runId = "aux020-missing-plan";
    const { manifestPath, runRoot } = prepareImplementationFixture(fixture, runId);
    fs.rmSync(path.join(runRoot, "implementation", "planned-paths.json"), { force: true });

    const result = run(["--manifest", manifestPath, "--run-implementation-worktrees", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /implementation-plan-output-missing: implementation\/planned-paths\.json/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationWorktreeExistingPathFixture() {
  const fixture = createTempFixture("implementation-worktree-existing-path");
  try {
    const runId = "aux020-existing-path";
    const { manifestPath, runRoot } = prepareImplementationFixture(fixture, runId);
    const worktreePlan = readJson(path.join(runRoot, "implementation", "batch-worktree-plan.json"));
    fs.mkdirSync(path.join(runRoot, worktreePlan.batches[0].plannedWorktreePath), { recursive: true });

    const result = run(["--manifest", manifestPath, "--run-implementation-worktrees", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /implementation-worktree-path-exists: fixture-analysis-batch-1/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationWorktreeRunOwnedPathFixture() {
  const fixture = createTempFixture("implementation-worktree-run-owned");
  try {
    const runId = "aux020-run-owned-path";
    const { manifestPath, runRoot } = prepareImplementationFixture(fixture, runId);
    const worktreePlanPath = path.join(runRoot, "implementation", "batch-worktree-plan.json");
    const worktreePlan = readJson(worktreePlanPath);
    worktreePlan.batches[0].plannedWorktreePath = "outside-worktrees/fixture-analysis-batch-1";
    fs.writeFileSync(worktreePlanPath, `${JSON.stringify(worktreePlan, null, 2)}\n`, "utf8");

    const result = run(["--manifest", manifestPath, "--run-implementation-worktrees", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /implementation-worktree-path-not-run-owned: fixture-analysis-batch-1/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationWorktreeResumeFixture() {
  const fixture = createTempFixture("implementation-worktree-resume");
  try {
    const runId = "aux020-worktree-resume";
    const { manifestPath, runRoot } = prepareImplementationFixture(fixture, runId);
    const first = parseJson(run(["--manifest", manifestPath, "--run-implementation-worktrees", "--json"]));
    assertImplementationWorktreeArtifacts(first, fixture, runId);

    const second = parseJson(run(["--manifest", manifestPath, "--run-implementation-worktrees", "--json"]));
    assert.strictEqual(second.resumed, true);
    assertImplementationWorktreeArtifacts(second, fixture, runId);

    const state = readJson(path.join(runRoot, "state.json"));
    assert(state.resumeCount >= 3);
    const events = fs.readFileSync(path.join(runRoot, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse);
    assert(events.some((event) => event.event === "implementation_worktrees_ready"));
    assert(events.some((event) => event.event === "implementation_worktrees_resume_verified"));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function prepareImplementationFixture(fixture, runId, manifest = validManifest(fixture, runId)) {
  const manifestPath = writeManifest(fixture.root, manifest);
  parseJson(run(["--manifest", manifestPath, "--run-analysis", "--json"]));
  parseJson(run(["--manifest", manifestPath, "--plan-implementation", "--json"]));
  const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", runId);
  return { manifestPath, runRoot };
}

function prepareImplementationWorktreeFixture(fixture, runId, manifest = validManifest(fixture, runId)) {
  const prepared = prepareImplementationFixture(fixture, runId, manifest);
  parseJson(run(["--manifest", prepared.manifestPath, "--run-implementation-worktrees", "--json"]));
  return prepared;
}

function prepareImplementationChildRunFixture(fixture, runId, manifest = validManifest(fixture, runId), writePath = "scripts/imported-tools/tool-tool.js") {
  const prepared = prepareImplementationWorktreeFixture(fixture, runId, manifest);
  const binDir = writeFakeCodex(fixture.root);
  parseJson(
    run(
      ["--manifest", prepared.manifestPath, "--run-implementation-child-runs", "--json"],
      repo,
      fakeCodexEnv(binDir, "success", writePath),
    ),
  );
  return { ...prepared, binDir };
}

function assertImplementationChildRunArtifacts(output, fixture, runId) {
  assert.strictEqual(output.schema, "generic-repo-tool-importer.command-skeleton.v1");
  assert.strictEqual(output.auxiliaryId, "AUX-021");
  assert.strictEqual(output.runId, runId);
  assert.strictEqual(output.status, "stopped_after_implementation_child_runs");
  assert.strictEqual(output.currentPhase, "implementation_child_runs_complete");
  assert.strictEqual(output.nextPhase, "controlled_merge");
  assert.strictEqual(output.analysisCompleted, true);
  assert.strictEqual(output.implementationPlanned, true);
  assert.strictEqual(output.implementationWorktreesReady, true);
  assert.strictEqual(output.implementationChildRunsComplete, true);
  assert.strictEqual(output.worktreesCreated, true);
  assert.strictEqual(output.branchCreated, false);
  assert.strictEqual(output.childRunsCreated, true);
  assert.strictEqual(output.controlledMergeApplied, false);
  assert.strictEqual(output.validationCommandsRun, false);
  assert.strictEqual(output.liveCepAeRun, false);
  assert.strictEqual(output.localOllamaUsed, false);
  assert.strictEqual(output.fallbackProviderUsed, false);

  const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", runId);
  const state = readJson(path.join(runRoot, "state.json"));
  assert.strictEqual(state.auxiliaryId, "AUX-021");
  assert.strictEqual(state.status, "stopped");
  assert.strictEqual(state.currentPhase, "implementation_child_runs_complete");
  assert.strictEqual(state.nextPhase, "controlled_merge");
  assert.strictEqual(state.stopReason, "stopped_before_source_merge_application");
  assert.strictEqual(state.flags.implementationChildRunsComplete, true);
  assert.strictEqual(state.flags.worktreesCreated, true);
  assert.strictEqual(state.flags.branchCreated, false);
  assert.strictEqual(state.flags.childRunsCreated, true);
  assert.strictEqual(state.flags.controlledMergeApplied, false);
  assert.strictEqual(state.flags.sourceMergeApplied, false);
  assert.strictEqual(state.flags.validationCommandsRun, false);

  const childRun = readJson(path.join(runRoot, "implementation", "child-run-run.json"));
  assert.strictEqual(childRun.schema, "generic-repo-tool-importer.implementation-child-run.v1");
  assert.strictEqual(childRun.status, "child_runs_completed_source_merge_not_started");
  assert.strictEqual(childRun.worktreesCreated, true);
  assert.strictEqual(childRun.branchCreated, false);
  assert.strictEqual(childRun.childRunsCreated, true);
  assert.strictEqual(childRun.controlledMergeApplied, false);
  assert.strictEqual(childRun.sourceMergeApplied, false);
  assert.strictEqual(childRun.validationCommandsRun, false);
  assert.strictEqual(childRun.liveCepAeRun, false);
  assert.strictEqual(childRun.localOllamaUsed, false);
  assert.strictEqual(childRun.fallbackProviderUsed, false);
  assert.strictEqual(childRun.checks.plannedPathGate, "passed");
  assert.strictEqual(childRun.checks.sourceMergeApplication, "not_started");
  assert.strictEqual(childRun.checks.validationCommands, "not_started");
  assert(childRun.batches.length > 0);

  const firstBatch = childRun.batches[0];
  assert(fs.existsSync(path.join(runRoot, firstBatch.childRunResultPath)), "child run result must exist");
  assert(fs.existsSync(path.join(runRoot, firstBatch.stdoutPath)), "child run stdout must exist");
  assert(fs.existsSync(path.join(runRoot, firstBatch.stderrPath)), "child run stderr must exist");
  assert(fs.existsSync(path.join(firstBatch.actualWorktreePath, "scripts", "imported-tools", "tool-tool.js")));

  const childResult = readJson(path.join(runRoot, firstBatch.childRunResultPath));
  assert.strictEqual(childResult.schema, "generic-repo-tool-importer.implementation-child-run-result.v1");
  assert.strictEqual(childResult.status, "child_run_completed");
  assert.deepStrictEqual(childResult.changedPaths, ["scripts/imported-tools/tool-tool.js"]);
  assert.deepStrictEqual(childResult.unplannedPaths, []);
  assert.strictEqual(childResult.plannedPathGate, "passed");
  assert.strictEqual(childResult.preRunWorktreeClean, true);
  assert.strictEqual(childResult.detachedWorktreeVerified, true);
  assert.strictEqual(childResult.childRunCreated, true);
  assert.strictEqual(childResult.branchCreated, false);
  assert.strictEqual(childResult.sourceMergeApplied, false);
  assert.strictEqual(childResult.validationCommandsRun, false);
  assert.strictEqual(childResult.liveCepAeRun, false);
  assert.strictEqual(childResult.localOllamaUsed, false);
  assert.strictEqual(childResult.fallbackProviderUsed, false);
  assert.strictEqual(childResult.preRunHead, childResult.postRunHead);
  assert(fs.readFileSync(path.join(runRoot, childResult.stdoutPath), "utf8").includes("fake codex success"));

  const supervisorPlan = readJson(path.join(runRoot, "supervisor-plan.json"));
  assert.strictEqual(supervisorPlan.auxiliaryId, "AUX-021");
  assert.strictEqual(supervisorPlan.status, "stopped_after_implementation_child_runs");
  assert.strictEqual(supervisorPlan.stopBeforePhase, "source_merge_application");
  assert.strictEqual(supervisorPlan.implementationChildRuns.childRunsCreated, true);
  assert.strictEqual(supervisorPlan.implementationChildRuns.sourceMergeApplied, false);
  assert.strictEqual(supervisorPlan.implementationChildRuns.validationCommandsRun, false);

  assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
}

function assertSuccessfulImplementationChildRunFixture() {
  const fixture = createTempFixture("implementation-child-success");
  try {
    const runId = "aux021-child-success";
    const { manifestPath } = prepareImplementationWorktreeFixture(fixture, runId);
    const binDir = writeFakeCodex(fixture.root);
    const output = parseJson(
      run(
        ["--manifest", manifestPath, "--run-implementation-child-runs", "--json"],
        repo,
        fakeCodexEnv(binDir, "success", "scripts/imported-tools/tool-tool.js"),
      ),
    );
    assert.strictEqual(output.resumed, true);
    assertImplementationChildRunArtifacts(output, fixture, runId);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationChildRunLargeOutputFixture() {
  const fixture = createTempFixture("implementation-child-large-output");
  try {
    const runId = "aux021-child-large-output";
    const { manifestPath, runRoot } = prepareImplementationWorktreeFixture(fixture, runId);
    const binDir = writeFakeCodex(fixture.root);
    const output = parseJson(
      run(
        ["--manifest", manifestPath, "--run-implementation-child-runs", "--json"],
        repo,
        fakeCodexEnv(binDir, "large-output", "scripts/imported-tools/tool-tool.js"),
      ),
    );
    assert.strictEqual(output.resumed, true);
    const childResult = readJson(path.join(runRoot, "implementation", "child-run-results", "fixture-analysis-batch-1.json"));
    assert.strictEqual(childResult.status, "child_run_completed");
    assert(childResult.stdoutBytes > 2 * 1024 * 1024, "large child stdout must not fail with ENOBUFS");
    assert(fs.readFileSync(path.join(runRoot, childResult.stdoutPath), "utf8").includes("fake codex large-output"));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertCompactImporterParentOutputExcludesRuntimeState() {
  const fixture = createTempFixture("compact-parent");
  try {
    const runId = "aux021-compact-parent";
    const { manifestPath } = prepareImplementationWorktreeFixture(fixture, runId);
    const binDir = writeFakeCodex(fixture.root);
    const result = run(
      ["--manifest", manifestPath, "--run-implementation-child-runs", "--compact-json"],
      repo,
      fakeCodexEnv(binDir, "success", "scripts/imported-tools/tool-tool.js"),
    );
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert(result.stdout.length < 8192, `compact importer output too large: ${result.stdout.length}`);
    assertNoParentFacingRuntimeLeak(result.stdout);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.schema, "generic-repo-tool-importer.parent-compact-output.v1");
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.status, "stopped_after_implementation_child_runs");
    assert.strictEqual(output.proofEnvelope.contractComplete, true);
    assert(output.artifacts.proofEnvelope.path.endsWith("proof-envelope.json"));
    assert(output.artifacts.resultSummary.path.endsWith("result-summary.json"));
    assert(output.artifacts.artifactHashManifest.path.endsWith("proof-artifact-hashes.json"));
    assert(fs.existsSync(path.join(fixture.target, output.artifacts.proofEnvelope.path)));
    assert(fs.existsSync(path.join(fixture.target, output.artifacts.resultSummary.path)));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationChildRunMissingIntentFixture() {
  const fixture = createTempFixture("implementation-child-missing-intent");
  try {
    const runId = "aux021-missing-intent";
    const { manifestPath, runRoot } = prepareImplementationWorktreeFixture(fixture, runId);
    const worktreeRun = readJson(path.join(runRoot, "implementation", "worktree-run.json"));
    fs.rmSync(path.join(runRoot, worktreeRun.batches[0].childRunIntentPath), { force: true });
    const binDir = writeFakeCodex(fixture.root);

    const result = run(
      ["--manifest", manifestPath, "--run-implementation-child-runs", "--json"],
      repo,
      fakeCodexEnv(binDir, "success", "scripts/imported-tools/tool-tool.js"),
    );
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /implementation-worktree-output-missing: implementation\/child-run-intents\/fixture-analysis-batch-1\.json/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationChildRunUnplannedPathFixture() {
  const fixture = createTempFixture("implementation-child-unplanned");
  try {
    const runId = "aux021-unplanned-path";
    const { manifestPath, runRoot } = prepareImplementationWorktreeFixture(fixture, runId);
    const binDir = writeFakeCodex(fixture.root);

    const result = run(
      ["--manifest", manifestPath, "--run-implementation-child-runs", "--json"],
      repo,
      fakeCodexEnv(binDir, "success", "scripts/unplanned.js"),
    );
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /implementation-child-run-unplanned-paths: fixture-analysis-batch-1:scripts\/unplanned\.js/);
    const childResult = readJson(path.join(runRoot, "implementation", "child-run-results", "fixture-analysis-batch-1.json"));
    assert.strictEqual(childResult.status, "failed_unplanned_paths");
    assert.deepStrictEqual(childResult.unplannedPaths, ["scripts/unplanned.js"]);
    const state = readJson(path.join(runRoot, "state.json"));
    assert.strictEqual(state.currentPhase, "implementation_worktrees_ready");
    assert.strictEqual(state.nextPhase, "implementation_child_runs");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationChildRunDirtyWorktreeFixture() {
  const fixture = createTempFixture("implementation-child-dirty-worktree");
  try {
    const runId = "aux021-dirty-worktree";
    const { manifestPath, runRoot } = prepareImplementationWorktreeFixture(fixture, runId);
    const worktreeRun = readJson(path.join(runRoot, "implementation", "worktree-run.json"));
    const worktreePath = worktreeRun.batches[0].actualWorktreePath;
    fs.mkdirSync(path.join(worktreePath, "scripts", "imported-tools"), { recursive: true });
    fs.writeFileSync(path.join(worktreePath, "scripts", "imported-tools", "tool-tool.js"), "// dirty before child\n", "utf8");
    const binDir = writeFakeCodex(fixture.root);

    const result = run(
      ["--manifest", manifestPath, "--run-implementation-child-runs", "--json"],
      repo,
      fakeCodexEnv(binDir, "success", "scripts/imported-tools/tool-tool.js"),
    );
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /implementation-worktree-dirty: fixture-analysis-batch-1/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationChildRunProcessFailureFixture() {
  const fixture = createTempFixture("implementation-child-process-failure");
  try {
    const runId = "aux021-process-failure";
    const { manifestPath, runRoot } = prepareImplementationWorktreeFixture(fixture, runId);
    const binDir = writeFakeCodex(fixture.root);

    const result = run(
      ["--manifest", manifestPath, "--run-implementation-child-runs", "--json"],
      repo,
      fakeCodexEnv(binDir, "fail", "scripts/imported-tools/tool-tool.js"),
    );
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /implementation-child-run-failed: fixture-analysis-batch-1/);
    const childResult = readJson(path.join(runRoot, "implementation", "child-run-results", "fixture-analysis-batch-1.json"));
    assert.strictEqual(childResult.status, "failed_process");
    assert.strictEqual(childResult.exitCode, 7);
    assert(fs.readFileSync(path.join(runRoot, childResult.stderrPath), "utf8").includes("fake codex failure"));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertImplementationChildRunResumeFixture() {
  const fixture = createTempFixture("implementation-child-resume");
  try {
    const runId = "aux021-child-resume";
    const { manifestPath, runRoot } = prepareImplementationWorktreeFixture(fixture, runId);
    const binDir = writeFakeCodex(fixture.root);
    const first = parseJson(
      run(
        ["--manifest", manifestPath, "--run-implementation-child-runs", "--json"],
        repo,
        fakeCodexEnv(binDir, "success", "scripts/imported-tools/tool-tool.js"),
      ),
    );
    assertImplementationChildRunArtifacts(first, fixture, runId);

    const second = parseJson(
      run(
        ["--manifest", manifestPath, "--run-implementation-child-runs", "--json"],
        repo,
        fakeCodexEnv(binDir, "fail", "scripts/unplanned.js"),
      ),
    );
    assert.strictEqual(second.resumed, true);
    assertImplementationChildRunArtifacts(second, fixture, runId);

    const state = readJson(path.join(runRoot, "state.json"));
    assert(state.resumeCount >= 4);
    const events = fs.readFileSync(path.join(runRoot, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse);
    assert(events.some((event) => event.event === "implementation_child_runs_complete"));
    assert(events.some((event) => event.event === "implementation_child_runs_resume_verified"));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertControlledSourceMergeArtifacts(output, fixture, runId) {
  assert.strictEqual(output.schema, "generic-repo-tool-importer.command-skeleton.v1");
  assert.strictEqual(output.auxiliaryId, "AUX-022");
  assert.strictEqual(output.runId, runId);
  assert.strictEqual(output.status, "stopped_after_controlled_source_merge");
  assert.strictEqual(output.currentPhase, "source_merged");
  assert.strictEqual(output.nextPhase, "non_live_validation");
  assert.strictEqual(output.implementationChildRunsComplete, true);
  assert.strictEqual(output.sourceMerged, true);
  assert.strictEqual(output.nonLiveValidationComplete, false);
  assert.strictEqual(output.worktreesCreated, true);
  assert.strictEqual(output.childRunsCreated, true);
  assert.strictEqual(output.controlledMergeApplied, true);
  assert.strictEqual(output.sourceMergeApplied, true);
  assert.strictEqual(output.validationCommandsRun, false);
  assert.strictEqual(output.liveCepAeRun, false);
  assert.strictEqual(output.localOllamaUsed, false);
  assert.strictEqual(output.fallbackProviderUsed, false);

  const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", runId);
  const state = readJson(path.join(runRoot, "state.json"));
  assert.strictEqual(state.auxiliaryId, "AUX-022");
  assert.strictEqual(state.status, "stopped");
  assert.strictEqual(state.currentPhase, "source_merged");
  assert.strictEqual(state.nextPhase, "non_live_validation");
  assert.strictEqual(state.stopReason, "stopped_before_non_live_validation");
  assert.strictEqual(state.flags.controlledSourceMergeComplete, true);
  assert.strictEqual(state.flags.controlledMergeApplied, true);
  assert.strictEqual(state.flags.sourceMergeApplied, true);
  assert.strictEqual(state.flags.validationCommandsRun, false);
  assert.deepStrictEqual(state.ownedDirtyPaths, ["scripts/imported-tools/tool-tool.js"]);

  for (const relative of [
    "merge/controlled-source-merge-plan.json",
    "merge/controlled-source-merge-report.json",
  ]) {
    assert(fs.existsSync(path.join(runRoot, relative)), `${relative} must exist`);
  }

  const report = readJson(path.join(runRoot, "merge", "controlled-source-merge-report.json"));
  assert.strictEqual(report.schema, "generic-repo-tool-importer.controlled-source-merge.v1");
  assert.strictEqual(report.status, "applied");
  assert.strictEqual(report.controlledMergeApplied, true);
  assert.strictEqual(report.sourceMergeApplied, true);
  assert.strictEqual(report.validationCommandsRun, false);
  assert.strictEqual(report.checks.childRunEvidence, "passed");
  assert.strictEqual(report.checks.plannedPathsOnly, "passed");
  assert.strictEqual(report.checks.targetHeadDrift, "passed");
  assert.strictEqual(report.checks.targetBranchDrift, "passed");
  assert.deepStrictEqual(report.appliedPaths, ["scripts/imported-tools/tool-tool.js"]);
  assert.deepStrictEqual(report.ownedDirtyPaths, ["scripts/imported-tools/tool-tool.js"]);
  assert.strictEqual(report.operations[0].operation, "created");

  const importedPath = path.join(fixture.target, "scripts", "imported-tools", "tool-tool.js");
  assert(fs.existsSync(importedPath), "controlled merge must copy imported file into target");
  assert(fs.readFileSync(importedPath, "utf8").includes("fake imported output"));
  assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "?? scripts/imported-tools/tool-tool.js");

  const supervisorPlan = readJson(path.join(runRoot, "supervisor-plan.json"));
  assert.strictEqual(supervisorPlan.auxiliaryId, "AUX-022");
  assert.strictEqual(supervisorPlan.status, "stopped_after_controlled_source_merge");
  assert.strictEqual(supervisorPlan.stopBeforePhase, "non_live_validation");
  assert.strictEqual(supervisorPlan.controlledSourceMerge.sourceMergeApplied, true);
  assert.strictEqual(supervisorPlan.controlledSourceMerge.validationCommandsRun, false);
}

function assertSuccessfulControlledSourceMergeFixture() {
  const fixture = createTempFixture("controlled-merge-success");
  try {
    const runId = "aux022-controlled-merge-success";
    const { manifestPath } = prepareImplementationChildRunFixture(fixture, runId);
    const output = parseJson(run(["--manifest", manifestPath, "--apply-controlled-merge", "--json"]));
    assert.strictEqual(output.resumed, true);
    assertControlledSourceMergeArtifacts(output, fixture, runId);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertControlledSourceMergeTrackedModifiedPathFixture() {
  const fixture = createTempFixture("controlled-merge-tracked-modified");
  try {
    const trackedPath = path.join(fixture.target, "scripts", "imported-tools", "tool-tool.js");
    fs.mkdirSync(path.dirname(trackedPath), { recursive: true });
    fs.writeFileSync(trackedPath, "// original tracked importer output\nmodule.exports = 'original';\n", "utf8");
    sh(fixture.target, ["git", "add", "scripts/imported-tools/tool-tool.js"]);
    sh(fixture.target, [
      "git",
      "-c",
      "user.name=Smoke",
      "-c",
      "user.email=smoke@example.local",
      "commit",
      "-m",
      "tracked planned file",
    ]);

    const runId = "aux022-controlled-merge-tracked-modified";
    const { manifestPath, runRoot } = prepareImplementationChildRunFixture(fixture, runId);
    const output = parseJson(run(["--manifest", manifestPath, "--apply-controlled-merge", "--json"]));
    assert.strictEqual(output.resumed, true);
    assert.strictEqual(output.status, "stopped_after_controlled_source_merge");

    const report = readJson(path.join(runRoot, "merge", "controlled-source-merge-report.json"));
    assert.strictEqual(report.schema, "generic-repo-tool-importer.controlled-source-merge.v1");
    assert.deepStrictEqual(report.appliedPaths, ["scripts/imported-tools/tool-tool.js"]);
    assert.deepStrictEqual(report.ownedDirtyPaths, ["scripts/imported-tools/tool-tool.js"]);
    assert.strictEqual(report.operations[0].operation, "updated");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "M scripts/imported-tools/tool-tool.js");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertControlledSourceMergeMissingEvidenceFixture() {
  const fixture = createTempFixture("controlled-merge-missing-evidence");
  try {
    const runId = "aux022-missing-evidence";
    const { manifestPath, runRoot } = prepareImplementationChildRunFixture(fixture, runId);
    fs.rmSync(path.join(runRoot, "implementation", "child-run-run.json"), { force: true });

    const result = run(["--manifest", manifestPath, "--apply-controlled-merge", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /implementation-child-run-output-missing: implementation\/child-run-run\.json/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertControlledSourceMergeDirtyTargetFixture() {
  const fixture = createTempFixture("controlled-merge-dirty-target");
  try {
    const runId = "aux022-dirty-target";
    const { manifestPath } = prepareImplementationChildRunFixture(fixture, runId);
    fs.writeFileSync(path.join(fixture.target, "unowned.txt"), "dirty\n", "utf8");

    const result = run(["--manifest", manifestPath, "--apply-controlled-merge", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /target-repo-dirty-unowned: unowned\.txt/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertControlledSourceMergeCommitDriftFixture() {
  const fixture = createTempFixture("controlled-merge-commit-drift");
  try {
    const runId = "aux022-commit-drift";
    const { manifestPath } = prepareImplementationChildRunFixture(fixture, runId);
    fs.writeFileSync(path.join(fixture.target, "README.md"), "# target\n\ncommit drift\n", "utf8");
    sh(fixture.target, ["git", "add", "README.md"]);
    sh(fixture.target, [
      "git",
      "-c",
      "user.name=Smoke",
      "-c",
      "user.email=smoke@example.local",
      "commit",
      "-m",
      "commit drift",
    ]);

    const result = run(["--manifest", manifestPath, "--apply-controlled-merge", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /controlled-merge-target-head-drift: fixture-analysis-batch-1/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertControlledSourceMergeBranchDriftFixture() {
  const fixture = createTempFixture("controlled-merge-branch-drift");
  try {
    const runId = "aux022-branch-drift";
    const { manifestPath } = prepareImplementationChildRunFixture(fixture, runId);
    sh(fixture.target, ["git", "checkout", "-b", "branch-drift"]);

    const result = run(["--manifest", manifestPath, "--apply-controlled-merge", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /controlled-merge-target-branch-drift:/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertControlledSourceMergeResumeFixture() {
  const fixture = createTempFixture("controlled-merge-resume");
  try {
    const runId = "aux022-controlled-merge-resume";
    const { manifestPath, runRoot } = prepareImplementationChildRunFixture(fixture, runId);
    const first = parseJson(run(["--manifest", manifestPath, "--apply-controlled-merge", "--json"]));
    assertControlledSourceMergeArtifacts(first, fixture, runId);

    const second = parseJson(run(["--manifest", manifestPath, "--apply-controlled-merge", "--json"]));
    assert.strictEqual(second.resumed, true);
    assertControlledSourceMergeArtifacts(second, fixture, runId);

    const state = readJson(path.join(runRoot, "state.json"));
    assert(state.resumeCount >= 5);
    const events = fs.readFileSync(path.join(runRoot, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse);
    assert(events.some((event) => event.event === "controlled_source_merge_complete"));
    assert(events.some((event) => event.event === "controlled_source_merge_resume_verified"));
  } finally {
    removeFixture(fixture.root);
  }
}

function prepareControlledSourceMergeFixture(fixture, runId, manifest = validManifest(fixture, runId)) {
  const prepared = prepareImplementationChildRunFixture(fixture, runId, manifest);
  parseJson(run(["--manifest", prepared.manifestPath, "--apply-controlled-merge", "--json"]));
  return prepared;
}

function assertNonLiveValidationArtifacts(output, fixture, runId) {
  assert.strictEqual(output.schema, "generic-repo-tool-importer.command-skeleton.v1");
  assert.strictEqual(output.auxiliaryId, "AUX-023");
  assert.strictEqual(output.runId, runId);
  assert.strictEqual(output.status, "stopped_after_non_live_validation");
  assert.strictEqual(output.currentPhase, "non_live_validation_complete");
  assert.strictEqual(output.nextPhase, "live_acceptance");
  assert.strictEqual(output.sourceMerged, true);
  assert.strictEqual(output.nonLiveValidationComplete, true);
  assert.strictEqual(output.controlledMergeApplied, true);
  assert.strictEqual(output.sourceMergeApplied, true);
  assert.strictEqual(output.validationCommandsRun, true);
  assert.strictEqual(output.liveCepAeRun, false);
  assert.strictEqual(output.localOllamaUsed, false);
  assert.strictEqual(output.fallbackProviderUsed, false);

  const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", runId);
  const state = readJson(path.join(runRoot, "state.json"));
  assert.strictEqual(state.auxiliaryId, "AUX-023");
  assert.strictEqual(state.status, "stopped");
  assert.strictEqual(state.currentPhase, "non_live_validation_complete");
  assert.strictEqual(state.nextPhase, "live_acceptance");
  assert.strictEqual(state.stopReason, "stopped_before_live_acceptance");
  assert.strictEqual(state.flags.nonLiveValidationComplete, true);
  assert.strictEqual(state.flags.validationCommandsRun, true);
  assert.deepStrictEqual(state.ownedDirtyPaths, ["scripts/imported-tools/tool-tool.js"]);

  const report = readJson(path.join(runRoot, "validation", "non-live-report.json"));
  assert.strictEqual(report.schema, "generic-repo-tool-importer.non-live-validation.v1");
  assert.strictEqual(report.status, "passed");
  assert.strictEqual(report.validationCommandsRun, true);
  assert.strictEqual(report.liveCepAeRun, false);
  assert.strictEqual(report.commands.length, 2);
  assert.strictEqual(report.commands[0].status, "passed");
  assert.strictEqual(report.commands[1].status, "passed");
  assert(fs.existsSync(path.join(runRoot, report.commands[0].stdoutPath)));
  assert(fs.existsSync(path.join(runRoot, report.commands[0].stderrPath)));
  assert.strictEqual(report.checks.commandExitCodes, "passed");
  assert.strictEqual(report.checks.validationDidNotModifyImportedFiles, "passed");

  const supervisorPlan = readJson(path.join(runRoot, "supervisor-plan.json"));
  assert.strictEqual(supervisorPlan.auxiliaryId, "AUX-023");
  assert.strictEqual(supervisorPlan.status, "stopped_after_non_live_validation");
  assert.strictEqual(supervisorPlan.stopBeforePhase, "live_acceptance");
  assert.strictEqual(supervisorPlan.nonLiveValidation.validationCommandsRun, true);

  assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "?? scripts/imported-tools/tool-tool.js");
}

function assertSuccessfulNonLiveValidationFixture() {
  const fixture = createTempFixture("non-live-success");
  try {
    const runId = "aux023-non-live-success";
    const { manifestPath } = prepareControlledSourceMergeFixture(fixture, runId);
    const output = parseJson(run(["--manifest", manifestPath, "--run-non-live-validation", "--json"]));
    assert.strictEqual(output.resumed, true);
    assertNonLiveValidationArtifacts(output, fixture, runId);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertNonLiveValidationFailureFixture() {
  const fixture = createTempFixture("non-live-failure");
  try {
    const runId = "aux023-non-live-failure";
    const { manifestPath, runRoot } = prepareControlledSourceMergeFixture(fixture, runId);
    fs.writeFileSync(path.join(fixture.target, "scripts", "imported-tools", "tool-tool.js"), "module.exports = ;\n", "utf8");

    const result = run(["--manifest", manifestPath, "--run-non-live-validation", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /non-live-validation-failed/);

    const report = readJson(path.join(runRoot, "validation", "non-live-report.json"));
    assert.strictEqual(report.schema, "generic-repo-tool-importer.non-live-validation.v1");
    assert.strictEqual(report.status, "failed");
    assert.strictEqual(report.commands[0].status, "failed");
    assert.strictEqual(report.checks.commandExitCodes, "failed");

    const state = readJson(path.join(runRoot, "state.json"));
    assert.strictEqual(state.currentPhase, "source_merged");
    assert.strictEqual(state.nextPhase, "non_live_validation");
    assert.strictEqual(state.flags.validationCommandsRun, false);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertNonLiveValidationResumeFixture() {
  const fixture = createTempFixture("non-live-resume");
  try {
    const runId = "aux023-non-live-resume";
    const { manifestPath, runRoot } = prepareControlledSourceMergeFixture(fixture, runId);
    const first = parseJson(run(["--manifest", manifestPath, "--run-non-live-validation", "--json"]));
    assertNonLiveValidationArtifacts(first, fixture, runId);

    const second = parseJson(run(["--manifest", manifestPath, "--run-non-live-validation", "--json"]));
    assert.strictEqual(second.resumed, true);
    assertNonLiveValidationArtifacts(second, fixture, runId);

    const state = readJson(path.join(runRoot, "state.json"));
    assert(state.resumeCount >= 6);
    const events = fs.readFileSync(path.join(runRoot, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse);
    assert(events.some((event) => event.event === "non_live_validation_complete"));
    assert(events.some((event) => event.event === "non_live_validation_resume_verified"));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertMergePlanningArtifacts(output, fixture, runId) {
  assert.strictEqual(output.schema, "generic-repo-tool-importer.command-skeleton.v1");
  assert.strictEqual(output.auxiliaryId, "AUX-018");
  assert.strictEqual(output.runId, runId);
  assert.strictEqual(output.status, "stopped_after_merge_planning");
  assert.strictEqual(output.currentPhase, "merge_planned");
  assert.strictEqual(output.nextPhase, "live_queue_planning");
  assert.strictEqual(output.analysisCompleted, true);
  assert.strictEqual(output.implementationPlanned, true);
  assert.strictEqual(output.mergePlanned, true);
  assert.strictEqual(output.worktreesCreated, false);
  assert.strictEqual(output.childRunsCreated, false);
  assert.strictEqual(output.controlledMergeApplied, false);
  assert.strictEqual(output.liveCepAeRun, false);
  assert.strictEqual(output.localOllamaUsed, false);

  const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", runId);
  const state = readJson(path.join(runRoot, "state.json"));
  assert.strictEqual(state.auxiliaryId, "AUX-018");
  assert.strictEqual(state.status, "stopped");
  assert.strictEqual(state.currentPhase, "merge_planned");
  assert.strictEqual(state.nextPhase, "live_queue_planning");
  assert.strictEqual(state.stopReason, "stopped_before_live_queue_design");
  assert.strictEqual(state.flags.mergePlanned, true);
  assert.strictEqual(state.flags.controlledMergeApplied, false);
  assert.strictEqual(state.flags.worktreesCreated, false);
  assert.strictEqual(state.flags.childRunsCreated, false);

  for (const relative of [
    "merge/supervisor-merge-plan.json",
    "merge/accepted-batches.json",
    "merge/rejected-batches.json",
    "validation/non-live-report.json",
  ]) {
    assert(fs.existsSync(path.join(runRoot, relative)), `${relative} must exist`);
  }

  const mergePlan = readJson(path.join(runRoot, "merge", "supervisor-merge-plan.json"));
  assert.strictEqual(mergePlan.schema, "generic-repo-tool-importer.supervisor-merge-plan.v1");
  assert.strictEqual(mergePlan.status, "planned_only");
  assert.strictEqual(mergePlan.controlledMergeApplied, false);
  assert.strictEqual(mergePlan.worktreesCreated, false);
  assert.strictEqual(mergePlan.childRunsCreated, false);
  assert.strictEqual(mergePlan.checks.plannedPathsOnly, "passed");
  assert.strictEqual(mergePlan.checks.nonLiveValidation, "planned_not_run");

  const accepted = readJson(path.join(runRoot, "merge", "accepted-batches.json"));
  assert.strictEqual(accepted.schema, "generic-repo-tool-importer.accepted-batches.v1");
  assert.strictEqual(accepted.status, "planned_only");
  assert(accepted.batches.length > 0);
  assert.strictEqual(accepted.batches[0].controlledMergeApplied, false);

  const rejected = readJson(path.join(runRoot, "merge", "rejected-batches.json"));
  assert.strictEqual(rejected.schema, "generic-repo-tool-importer.rejected-batches.v1");
  assert.strictEqual(rejected.status, "planned_only");
  assert.deepStrictEqual(rejected.batches, []);

  const validationReport = readJson(path.join(runRoot, "validation", "non-live-report.json"));
  assert.strictEqual(validationReport.schema, "generic-repo-tool-importer.non-live-report.v1");
  assert.strictEqual(validationReport.status, "planned_only");
  assert.strictEqual(validationReport.commandsRun, false);
  assert.strictEqual(validationReport.gitDiffCheck, true);
  assert.strictEqual(validationReport.liveCepAeRun, false);
  assert.strictEqual(validationReport.localOllamaUsed, false);

  const supervisorPlan = readJson(path.join(runRoot, "supervisor-plan.json"));
  assert.strictEqual(supervisorPlan.auxiliaryId, "AUX-018");
  assert.strictEqual(supervisorPlan.status, "stopped_after_merge_planning");
  assert.strictEqual(supervisorPlan.stopBeforePhase, "live_queue_design");
  assert.strictEqual(supervisorPlan.mergePlanning.controlledMergeApplied, false);
  assert.strictEqual(supervisorPlan.mergePlanning.childRunsCreated, false);

  assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain"]), "");
}

function assertSuccessfulMergePlanningFixture() {
  const fixture = createTempFixture("merge-success");
  try {
    const runId = "aux018-merge-success";
    const { manifestPath } = prepareImplementationFixture(fixture, runId);
    const output = parseJson(run(["--manifest", manifestPath, "--plan-merge", "--json"]));
    assert.strictEqual(output.resumed, true);
    assertMergePlanningArtifacts(output, fixture, runId);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertMergeMissingImplementationArtifactFixture() {
  const fixture = createTempFixture("merge-missing-implementation");
  try {
    const runId = "aux018-missing-implementation";
    const { manifestPath, runRoot } = prepareImplementationFixture(fixture, runId);
    fs.rmSync(path.join(runRoot, "implementation", "planned-paths.json"), { force: true });

    const result = run(["--manifest", manifestPath, "--plan-merge", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /implementation-plan-output-missing: implementation\/planned-paths\.json/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertMergeUnplannedPathFixture() {
  const fixture = createTempFixture("merge-unplanned-path");
  try {
    const runId = "aux018-unplanned-path";
    const manifest = validManifest(fixture, runId);
    manifest.merge.fixtureBatchResults = [
      {
        id: "fixture-analysis-batch-1",
        status: "fixture_completed",
        validationStatus: "passed",
        changedPaths: ["scripts/unplanned.js"],
      },
    ];
    const { manifestPath } = prepareImplementationFixture(fixture, runId, manifest);

    const result = run(["--manifest", manifestPath, "--plan-merge", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /unplanned-path-change: fixture-analysis-batch-1:scripts\/unplanned\.js/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertMergeDependencyChangeFixture() {
  const fixture = createTempFixture("merge-dependency-change");
  try {
    const runId = "aux018-dependency-change";
    const manifest = validManifest(fixture, runId);
    manifest.merge.fixtureBatchResults = [
      {
        id: "fixture-analysis-batch-1",
        status: "fixture_completed",
        validationStatus: "passed",
        changedPaths: ["package.json"],
      },
    ];
    const { manifestPath } = prepareImplementationFixture(fixture, runId, manifest);

    const result = run(["--manifest", manifestPath, "--plan-merge", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /dependency-change-requested-without-manifest-allowance: package\.json/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertMergeSharedConflictFixture() {
  const fixture = createTempFixture("merge-shared-conflict");
  try {
    const runId = "aux018-shared-conflict";
    const { manifestPath, runRoot } = prepareImplementationFixture(fixture, runId);
    const worktreePlanPath = path.join(runRoot, "implementation", "batch-worktree-plan.json");
    const plannedPathsPath = path.join(runRoot, "implementation", "planned-paths.json");
    const worktreePlan = readJson(worktreePlanPath);
    const plannedPaths = readJson(plannedPathsPath);
    const firstBatch = worktreePlan.batches[0];
    const sharedPath = firstBatch.plannedPaths[0];
    worktreePlan.batches.push({
      ...firstBatch,
      id: "tampered-second-batch",
      plannedPaths: [sharedPath],
    });
    plannedPaths.batches.push({
      ...plannedPaths.batches[0],
      id: "tampered-second-batch",
      plannedPaths: [sharedPath],
    });
    fs.writeFileSync(worktreePlanPath, `${JSON.stringify(worktreePlan, null, 2)}\n`, "utf8");
    fs.writeFileSync(plannedPathsPath, `${JSON.stringify(plannedPaths, null, 2)}\n`, "utf8");

    const result = run(["--manifest", manifestPath, "--plan-merge", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`shared-file-batch-conflict-without-merge-owner: ${sharedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertMergeDirtyTargetFixture() {
  const fixture = createTempFixture("merge-dirty-target");
  try {
    const runId = "aux018-dirty-target";
    const { manifestPath } = prepareImplementationFixture(fixture, runId);
    fs.writeFileSync(path.join(fixture.target, "unowned.txt"), "dirty\n", "utf8");

    const result = run(["--manifest", manifestPath, "--plan-merge", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /target-repo-dirty-unowned: unowned\.txt/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertMergeResumeFixture() {
  const fixture = createTempFixture("merge-resume");
  try {
    const runId = "aux018-merge-resume";
    const { manifestPath, runRoot } = prepareImplementationFixture(fixture, runId);
    const first = parseJson(run(["--manifest", manifestPath, "--plan-merge", "--json"]));
    assertMergePlanningArtifacts(first, fixture, runId);

    const second = parseJson(run(["--manifest", manifestPath, "--plan-merge", "--json"]));
    assert.strictEqual(second.resumed, true);
    assertMergePlanningArtifacts(second, fixture, runId);

    const state = readJson(path.join(runRoot, "state.json"));
    assert(state.resumeCount >= 3);
    const events = fs.readFileSync(path.join(runRoot, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse);
    assert(events.some((event) => event.event === "merge_planned"));
    assert(events.some((event) => event.event === "merge_plan_resume_verified"));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function prepareMergeFixture(fixture, runId, manifest = validManifest(fixture, runId)) {
  const prepared = prepareImplementationFixture(fixture, runId, manifest);
  parseJson(run(["--manifest", prepared.manifestPath, "--plan-merge", "--json"]));
  return prepared;
}

function assertLiveQueuePlanningArtifacts(output, fixture, runId) {
  assert.strictEqual(output.schema, "generic-repo-tool-importer.command-skeleton.v1");
  assert.strictEqual(output.auxiliaryId, "AUX-019");
  assert.strictEqual(output.runId, runId);
  assert.strictEqual(output.status, "stopped_after_live_queue_planning");
  assert.strictEqual(output.currentPhase, "live_queue_planned");
  assert.strictEqual(output.nextPhase, "completed");
  assert.strictEqual(output.analysisCompleted, true);
  assert.strictEqual(output.implementationPlanned, true);
  assert.strictEqual(output.mergePlanned, true);
  assert.strictEqual(output.liveQueuePlanned, true);
  assert.strictEqual(output.worktreesCreated, false);
  assert.strictEqual(output.childRunsCreated, false);
  assert.strictEqual(output.controlledMergeApplied, false);
  assert.strictEqual(output.liveCepAeRun, false);
  assert.strictEqual(output.localOllamaUsed, false);

  const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", runId);
  const state = readJson(path.join(runRoot, "state.json"));
  assert.strictEqual(state.auxiliaryId, "AUX-019");
  assert.strictEqual(state.status, "stopped");
  assert.strictEqual(state.currentPhase, "live_queue_planned");
  assert.strictEqual(state.nextPhase, "completed");
  assert.strictEqual(state.stopReason, "stopped_before_live_queue_execution");
  assert.strictEqual(state.flags.liveQueuePlanned, true);
  assert.strictEqual(state.flags.liveCepAeRun, false);
  assert.strictEqual(state.flags.localOllamaUsed, false);
  assert.strictEqual(state.flags.fallbackProviderUsed, false);

  const queuePath = path.join(runRoot, "live-queue", "queue.json");
  const lockPath = path.join(runRoot, "locks", "live-ae-cep.lock");
  assert(fs.existsSync(queuePath), "live queue must exist");
  assert(fs.existsSync(lockPath), "live lock fixture must exist");

  const queue = readJson(queuePath);
  assert.strictEqual(queue.schema, "generic-repo-tool-importer.live-queue.v1");
  assert.strictEqual(queue.status, "planned_only");
  assert.strictEqual(queue.liveCepAeRun, false);
  assert.strictEqual(queue.localOllamaUsed, false);
  assert.strictEqual(queue.fallbackProviderUsed, false);
  assert.strictEqual(queue.checks.lockArtifact, "fixture_available");
  assert.strictEqual(queue.checks.m100Proposal, "present");
  assert.strictEqual(queue.checks.dryRunProposalMatch, "passed");
  assert.strictEqual(queue.checks.confirmedRunProposalMatch, "passed");
  assert.strictEqual(queue.checks.readBack, "present");
  assert.strictEqual(queue.checks.semanticVerification, "passed");
  assert.strictEqual(queue.checks.cleanupProof, "passed");
  assert(queue.items.length > 0);

  const item = queue.items[0];
  for (const relative of item.artifacts) {
    assert(fs.existsSync(path.join(runRoot, relative)), `${relative} must exist`);
  }
  const proposal = readJson(path.join(runRoot, "live-queue", item.id, "m100-proposal.json"));
  const dryRun = readJson(path.join(runRoot, "live-queue", item.id, "dry-run.json"));
  const confirmedRun = readJson(path.join(runRoot, "live-queue", item.id, "confirmed-run.json"));
  const readBack = readJson(path.join(runRoot, "live-queue", item.id, "read-back.json"));
  const semantic = readJson(path.join(runRoot, "live-queue", item.id, "semantic-verification.json"));
  const cleanup = readJson(path.join(runRoot, "live-queue", item.id, "cleanup-proof.json"));
  assert.strictEqual(proposal.m100ProposalPresent, true);
  assert.strictEqual(dryRun.proposalId, proposal.proposalId);
  assert.strictEqual(confirmedRun.proposalId, proposal.proposalId);
  assert.strictEqual(confirmedRun.mutationApplied, false);
  assert.strictEqual(readBack.status, "present");
  assert.strictEqual(semantic.status, "passed");
  assert.strictEqual(cleanup.status, "passed");
  assert.deepStrictEqual(cleanup.leftovers, []);

  const lock = readJson(lockPath);
  assert.strictEqual(lock.schema, "generic-repo-tool-importer.live-lock-fixture.v1");
  assert.strictEqual(lock.status, "fixture_available");
  assert.strictEqual(lock.actualLockAcquired, false);
  assert.strictEqual(lock.liveCepAeRun, false);

  const supervisorPlan = readJson(path.join(runRoot, "supervisor-plan.json"));
  assert.strictEqual(supervisorPlan.auxiliaryId, "AUX-019");
  assert.strictEqual(supervisorPlan.status, "stopped_after_live_queue_planning");
  assert.strictEqual(supervisorPlan.stopBeforePhase, "live_queue_execution");
  assert.strictEqual(supervisorPlan.liveQueuePlanning.liveCepAeRun, false);
  assert.strictEqual(supervisorPlan.liveQueuePlanning.fallbackProviderUsed, false);

  assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain"]), "");
}

function assertSuccessfulLiveQueuePlanningFixture() {
  const fixture = createTempFixture("live-success");
  try {
    const runId = "aux019-live-success";
    const { manifestPath } = prepareMergeFixture(fixture, runId);
    const output = parseJson(run(["--manifest", manifestPath, "--plan-live-queue", "--json"]));
    assert.strictEqual(output.resumed, true);
    assertLiveQueuePlanningArtifacts(output, fixture, runId);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLiveQueueMissingMergeArtifactFixture() {
  const fixture = createTempFixture("live-missing-merge");
  try {
    const runId = "aux019-missing-merge";
    const { manifestPath, runRoot } = prepareMergeFixture(fixture, runId);
    fs.rmSync(path.join(runRoot, "merge", "supervisor-merge-plan.json"), { force: true });

    const result = run(["--manifest", manifestPath, "--plan-live-queue", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /merge-plan-output-missing: merge\/supervisor-merge-plan\.json/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLiveQueueLockUnavailableFixture() {
  const fixture = createTempFixture("live-lock-unavailable");
  try {
    const runId = "aux019-lock-unavailable";
    const manifest = validManifest(fixture, runId);
    manifest.liveAcceptance.fixtureEvidence = { lockAvailable: false };
    const { manifestPath } = prepareMergeFixture(fixture, runId, manifest);

    const result = run(["--manifest", manifestPath, "--plan-live-queue", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /live-lock-not-available/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLiveQueueM100MissingFixture() {
  const fixture = createTempFixture("live-m100-missing");
  try {
    const runId = "aux019-m100-missing";
    const manifest = validManifest(fixture, runId);
    manifest.liveAcceptance.fixtureEvidence = { m100ProposalMissing: true };
    const { manifestPath } = prepareMergeFixture(fixture, runId, manifest);

    const result = run(["--manifest", manifestPath, "--plan-live-queue", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /m100-proposal-missing/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLiveQueueDryRunMismatchFixture() {
  const fixture = createTempFixture("live-dry-run-mismatch");
  try {
    const runId = "aux019-dry-run-mismatch";
    const manifest = validManifest(fixture, runId);
    manifest.liveAcceptance.fixtureEvidence = {
      proposalId: "proposal-one",
      dryRunProposalId: "proposal-two",
    };
    const { manifestPath } = prepareMergeFixture(fixture, runId, manifest);

    const result = run(["--manifest", manifestPath, "--plan-live-queue", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /dry-run-proposal-mismatch/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLiveQueueConfirmedMismatchFixture() {
  const fixture = createTempFixture("live-confirmed-mismatch");
  try {
    const runId = "aux019-confirmed-mismatch";
    const manifest = validManifest(fixture, runId);
    manifest.liveAcceptance.fixtureEvidence = {
      proposalId: "proposal-one",
      confirmedProposalId: "proposal-two",
    };
    const { manifestPath } = prepareMergeFixture(fixture, runId, manifest);

    const result = run(["--manifest", manifestPath, "--plan-live-queue", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /confirmed-run-proposal-mismatch/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLiveQueueReadBackMissingFixture() {
  const fixture = createTempFixture("live-read-back-missing");
  try {
    const runId = "aux019-read-back-missing";
    const manifest = validManifest(fixture, runId);
    manifest.liveAcceptance.fixtureEvidence = { readBackMissing: true };
    const { manifestPath } = prepareMergeFixture(fixture, runId, manifest);

    const result = run(["--manifest", manifestPath, "--plan-live-queue", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /read-back-missing/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLiveQueueSemanticNotPassedFixture() {
  const fixture = createTempFixture("live-semantic-not-passed");
  try {
    const runId = "aux019-semantic-not-passed";
    const manifest = validManifest(fixture, runId);
    manifest.liveAcceptance.fixtureEvidence = { semanticStatus: "needs_review" };
    const { manifestPath } = prepareMergeFixture(fixture, runId, manifest);

    const result = run(["--manifest", manifestPath, "--plan-live-queue", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /semantic-verification-not-passed: needs_review/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLiveQueueProviderRejectionFixture() {
  const fixture = createTempFixture("live-provider-rejection");
  try {
    const runId = "aux019-provider-rejection";
    const manifest = validManifest(fixture, runId);
    manifest.liveAcceptance.fixtureEvidence = { providerPath: "Local/Ollama" };
    const { manifestPath } = prepareMergeFixture(fixture, runId, manifest);

    const result = run(["--manifest", manifestPath, "--plan-live-queue", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /Local\/Ollama/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLiveQueueFallbackProviderFixture() {
  const fixture = createTempFixture("live-fallback-provider");
  try {
    const runId = "aux019-fallback-provider";
    const manifest = validManifest(fixture, runId);
    manifest.liveAcceptance.fixtureEvidence = { fallbackProviderUsed: true };
    const { manifestPath } = prepareMergeFixture(fixture, runId, manifest);

    const result = run(["--manifest", manifestPath, "--plan-live-queue", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /fallback-provider-evidence-rejected/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLiveQueueCleanupLeftoversFixture() {
  const fixture = createTempFixture("live-cleanup-leftovers");
  try {
    const runId = "aux019-cleanup-leftovers";
    const manifest = validManifest(fixture, runId);
    manifest.liveAcceptance.fixtureEvidence = { cleanupLeftovers: ["Generated leftover"] };
    const { manifestPath } = prepareMergeFixture(fixture, runId, manifest);

    const result = run(["--manifest", manifestPath, "--plan-live-queue", "--json"]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /generated-prefix-cleanup-leftovers/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLiveQueueResumeFixture() {
  const fixture = createTempFixture("live-resume");
  try {
    const runId = "aux019-live-resume";
    const { manifestPath, runRoot } = prepareMergeFixture(fixture, runId);
    const first = parseJson(run(["--manifest", manifestPath, "--plan-live-queue", "--json"]));
    assertLiveQueuePlanningArtifacts(first, fixture, runId);

    const second = parseJson(run(["--manifest", manifestPath, "--plan-live-queue", "--json"]));
    assert.strictEqual(second.resumed, true);
    assertLiveQueuePlanningArtifacts(second, fixture, runId);

    const state = readJson(path.join(runRoot, "state.json"));
    assert(state.resumeCount >= 4);
    const events = fs.readFileSync(path.join(runRoot, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse);
    assert(events.some((event) => event.event === "live_queue_planned"));
    assert(events.some((event) => event.event === "live_queue_plan_resume_verified"));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function main() {
  assertValidManifestFixture();
  assertInvalidSchemaFixture();
  assertLocalOllamaRejectedFixture();
  assertDirtyUnownedTargetFixture();
  assertResumeFromStateFixture();
  assertSuccessfulAnalysisFixture();
  assertMissingOutputFailClosedFixture();
  assertUnsafeSecretFixture();
  assertLicenseStopFixture();
  assertNamedRepoAssumptionFixture();
  assertAnalysisResumeFixture();
  assertSuccessfulImplementationPlanningFixture();
  assertImplementationMissingAnalysisArtifactFixture();
  assertImplementationForbiddenPathFixture();
  assertImplementationDependencyChangeFixture();
  assertImplementationSharedConflictFixture();
  assertImplementationResumeFixture();
  assertSuccessfulImplementationWorktreeFixture();
  assertImplementationWorktreeMissingPlanFixture();
  assertImplementationWorktreeExistingPathFixture();
  assertImplementationWorktreeRunOwnedPathFixture();
  assertImplementationWorktreeResumeFixture();
  assertSuccessfulImplementationChildRunFixture();
  assertImplementationChildRunLargeOutputFixture();
  assertCompactImporterParentOutputExcludesRuntimeState();
  assertImplementationChildRunMissingIntentFixture();
  assertImplementationChildRunUnplannedPathFixture();
  assertImplementationChildRunDirtyWorktreeFixture();
  assertImplementationChildRunProcessFailureFixture();
  assertImplementationChildRunResumeFixture();
  assertSuccessfulControlledSourceMergeFixture();
  assertControlledSourceMergeTrackedModifiedPathFixture();
  assertControlledSourceMergeMissingEvidenceFixture();
  assertControlledSourceMergeDirtyTargetFixture();
  assertControlledSourceMergeCommitDriftFixture();
  assertControlledSourceMergeBranchDriftFixture();
  assertControlledSourceMergeResumeFixture();
  assertSuccessfulNonLiveValidationFixture();
  assertNonLiveValidationFailureFixture();
  assertNonLiveValidationResumeFixture();
  assertSuccessfulMergePlanningFixture();
  assertMergeMissingImplementationArtifactFixture();
  assertMergeUnplannedPathFixture();
  assertMergeDependencyChangeFixture();
  assertMergeSharedConflictFixture();
  assertMergeDirtyTargetFixture();
  assertMergeResumeFixture();
  assertSuccessfulLiveQueuePlanningFixture();
  assertLiveQueueMissingMergeArtifactFixture();
  assertLiveQueueLockUnavailableFixture();
  assertLiveQueueM100MissingFixture();
  assertLiveQueueDryRunMismatchFixture();
  assertLiveQueueConfirmedMismatchFixture();
  assertLiveQueueReadBackMissingFixture();
  assertLiveQueueSemanticNotPassedFixture();
  assertLiveQueueProviderRejectionFixture();
  assertLiveQueueFallbackProviderFixture();
  assertLiveQueueCleanupLeftoversFixture();
  assertLiveQueueResumeFixture();

  console.log("SDK generic repo importer command smoke: pass");
}

if (require.main === module) {
  main();
}

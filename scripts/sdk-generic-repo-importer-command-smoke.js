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
      defaultModel: "gpt-5.5",
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

function main() {
  assertValidManifestFixture();
  assertInvalidSchemaFixture();
  assertLocalOllamaRejectedFixture();
  assertDirtyUnownedTargetFixture();
  assertResumeFromStateFixture();

  console.log("SDK generic repo importer command smoke: pass");
}

if (require.main === module) {
  main();
}

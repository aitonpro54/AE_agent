#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const CONTRACT_PATH = ".codex-audit/sdk-generic-repo-importer/aux-014-generic-repo-importer-contract.json";
const RUN_ROOT_RELATIVE = ".codex-runtime/sdk/generic-repo-importer";
const RUNNER_SCHEMA = "generic-repo-tool-importer.command-skeleton.v1";
const SUPERVISOR_PLAN_SCHEMA = "generic-repo-tool-importer.supervisor-plan.v1";
const ANALYSIS_SCHEMA = "generic-repo-tool-importer.analysis-fixture.v1";
const IMPLEMENTATION_PLAN_SCHEMA = "generic-repo-tool-importer.implementation-plan.v1";
const MERGE_PLAN_SCHEMA = "generic-repo-tool-importer.merge-plan.v1";
const ANALYSIS_ARTIFACTS = Object.freeze([
  "analysis/repo-fingerprint.json",
  "analysis/risk-map.json",
  "analysis/read-back-requirements.json",
  "analysis/batch-plan.json",
]);
const IMPLEMENTATION_PLAN_ARTIFACTS = Object.freeze([
  "implementation/batch-worktree-plan.json",
  "implementation/planned-paths.json",
]);
const MERGE_PLAN_ARTIFACTS = Object.freeze([
  "merge/supervisor-merge-plan.json",
  "merge/accepted-batches.json",
  "merge/rejected-batches.json",
  "validation/non-live-report.json",
]);
const DEPENDENCY_PATHS = new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "deno.json",
  "deno.lock",
  "jsr.json",
]);
const TEXT_FILE_MAX_BYTES = 256 * 1024;
const SECRET_PATTERN =
  /\b(?:[A-Z0-9]+[_-])*?(?:api[_-]?key|access[_-]?token|secret|password)\b\s*[:=]\s*["']?(?:sk-|xox|ghp_|[A-Za-z0-9_\-]{12,})/i;
const NAMED_REPO_ASSUMPTION_PATTERN = /\bdakkshin\b/i;

const HELP = `
Generic repository tool importer skeleton

Usage:
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path>
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --run-analysis
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --plan-implementation
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --plan-merge
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --json

Options:
  --manifest <path>  generic-repo-tool-importer.manifest.v1 JSON file.
  --run-analysis     Run the AUX-016 fixture-backed analysis phase, then stop
                     before implementation worktrees.
  --plan-implementation
                     Run the AUX-017 plan-only implementation batch planner,
                     then stop before creating branches or worktrees.
  --plan-merge      Run the AUX-018 plan-only controlled merge supervisor,
                     then stop before applying changes or live validation.
  --json             Print machine-readable output.
  --help             Show this help.

This skeleton validates the AUX-014 manifest contract, creates an ignored run
root, writes durable state artifacts, optionally writes fixture-backed analysis
artifacts, plan-only implementation batch artifacts, and plan-only merge
artifacts, then stops before implementation. It does not create branches,
worktrees, child runs, live AE/CEP runs, dependency changes, product runtime
edits, push, PR, or GitHub automation.
`;

const VALUE_OPTIONS = new Set(["manifest"]);
const BOOLEAN_OPTIONS = new Set(["help", "json", "run-analysis", "plan-implementation", "plan-merge"]);

function splitInlineOption(raw) {
  const index = raw.indexOf("=");
  if (index === -1) {
    return { inlineValue: undefined, name: raw };
  }
  return { inlineValue: raw.slice(index + 1), name: raw.slice(0, index) };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }

    const { inlineValue, name } = splitInlineOption(arg.slice(2));
    if (BOOLEAN_OPTIONS.has(name)) {
      if (inlineValue !== undefined && inlineValue !== "true" && inlineValue !== "false") {
        throw new Error(`Invalid boolean value for --${name}: ${inlineValue}`);
      }
      options[name] = inlineValue === undefined ? true : inlineValue === "true";
      continue;
    }

    if (!VALUE_OPTIONS.has(name)) {
      throw new Error(`Unknown option: --${name}`);
    }

    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    options[name] = value;
    if (inlineValue === undefined) {
      index += 1;
    }
  }
  return options;
}

function readJsonFile(filePath, label) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${label} JSON at ${filePath}: ${error.message}`);
  }
  return parsed;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendEvent(runRoot, event) {
  appendFileSync(path.join(runRoot, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
}

function normalizeRepoPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function pathStartsWith(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireBoolean(value, label, expected) {
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
}

function assertIncludesAll(actual, expected, label) {
  requireArray(actual, label);
  for (const value of expected) {
    if (!actual.includes(value)) {
      throw new Error(`${label} must include ${value}`);
    }
  }
}

function assertRequiredFields(object, fields, label) {
  requireObject(object, label);
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(object, field)) {
      throw new Error(`${label} missing required field: ${field}`);
    }
  }
}

function assertNoLocalOllamaProvider(value, label) {
  if (typeof value !== "string") {
    return;
  }
  if (/\bollama\b/i.test(value) || /\blocal\b/i.test(value)) {
    throw new Error(`${label} must not select Local/Ollama`);
  }
}

function assertNoNamedRepoAssumptions(value, label) {
  const text = typeof value === "string" ? value : stableStringify(value);
  if (NAMED_REPO_ASSUMPTION_PATTERN.test(text)) {
    throw new Error(`${label} must not contain named-repo assumptions`);
  }
}

function resolveInside(cwd, candidate, label) {
  const resolved = path.resolve(cwd, candidate);
  if (resolved !== cwd && !resolved.startsWith(`${cwd}${path.sep}`)) {
    throw new Error(`${label} must stay inside repository: ${candidate}`);
  }
  return resolved;
}

function validateManifest(contract, manifest) {
  const schema = contract.manifestSchema;
  assertRequiredFields(manifest, schema.requiredTopLevelFields, "manifest");
  if (manifest.schema !== schema.schema) {
    throw new Error(`manifest.schema must be ${schema.schema}`);
  }

  assertRequiredFields(manifest.run, schema.run.requiredFields, "manifest.run");
  requireString(manifest.run.runId, "manifest.run.runId");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(manifest.run.runId)) {
    throw new Error("manifest.run.runId must be a safe path segment");
  }
  requireBoolean(manifest.run.codexCliOnly, "manifest.run.codexCliOnly", schema.run.constraints.codexCliOnly);
  requireBoolean(manifest.run.resumable, "manifest.run.resumable", schema.run.constraints.resumable);
  requireBoolean(manifest.run.resumeFromState, "manifest.run.resumeFromState", true);
  if (manifest.run.webSearch !== schema.run.constraints.webSearch) {
    throw new Error(`manifest.run.webSearch must be ${schema.run.constraints.webSearch}`);
  }
  if (Object.prototype.hasOwnProperty.call(manifest.run, "localOllama")) {
    requireBoolean(manifest.run.localOllama, "manifest.run.localOllama", false);
  }
  assertNoLocalOllamaProvider(manifest.run.defaultModel, "manifest.run.defaultModel");

  assertRequiredFields(manifest.sourceRepo, schema.sourceRepo.requiredFields, "manifest.sourceRepo");
  if (!schema.sourceRepo.inputKinds.includes(manifest.sourceRepo.inputKind)) {
    throw new Error(`manifest.sourceRepo.inputKind must be one of ${schema.sourceRepo.inputKinds.join(", ")}`);
  }
  requireString(manifest.sourceRepo.location, "manifest.sourceRepo.location");
  requireArray(manifest.sourceRepo.allowedReadRoots, "manifest.sourceRepo.allowedReadRoots");
  requireArray(manifest.sourceRepo.deniedReadRoots, "manifest.sourceRepo.deniedReadRoots");

  assertRequiredFields(manifest.targetRepo, schema.targetRepo.requiredFields, "manifest.targetRepo");
  requireString(manifest.targetRepo.path, "manifest.targetRepo.path");
  requireArray(manifest.targetRepo.allowedWritePaths, "manifest.targetRepo.allowedWritePaths");
  requireArray(manifest.targetRepo.forbiddenWritePaths, "manifest.targetRepo.forbiddenWritePaths");
  if (manifest.targetRepo.branchPolicy !== schema.targetRepo.branchPolicy) {
    throw new Error(`manifest.targetRepo.branchPolicy must be ${schema.targetRepo.branchPolicy}`);
  }
  if (manifest.targetRepo.pushPolicy !== schema.targetRepo.pushPolicy) {
    throw new Error(`manifest.targetRepo.pushPolicy must be ${schema.targetRepo.pushPolicy}`);
  }

  assertRequiredFields(manifest.intake, schema.intake.requiredFields, "manifest.intake");
  assertRequiredFields(manifest.analysis, schema.analysis.requiredFields, "manifest.analysis");
  assertRequiredFields(manifest.implementation, schema.implementation.requiredFields, "manifest.implementation");
  assertRequiredFields(manifest.merge, schema.merge.requiredFields, "manifest.merge");
  assertRequiredFields(manifest.validation, schema.validation.requiredFields, "manifest.validation");
  assertRequiredFields(manifest.liveAcceptance, schema.liveAcceptance.requiredFields, "manifest.liveAcceptance");
  requireObject(manifest.approvals, "manifest.approvals");
  assertRequiredFields(manifest.safety, schema.safety.requiredFields, "manifest.safety");

  requireObject(manifest.analysis.batching, "manifest.analysis.batching");
  const maxAnalysis = manifest.analysis.batching.maxParallelAnalysisWorkers;
  const maxBatches = manifest.analysis.batching.maxParallelImplementationBatches;
  if (!Number.isInteger(maxAnalysis) || maxAnalysis < 1) {
    throw new Error("manifest.analysis.batching.maxParallelAnalysisWorkers must be a positive integer");
  }
  if (!Number.isInteger(maxBatches) || maxBatches < 1) {
    throw new Error("manifest.analysis.batching.maxParallelImplementationBatches must be a positive integer");
  }

  const codexInvocation = manifest.implementation.codexCliInvocation;
  requireObject(codexInvocation, "manifest.implementation.codexCliInvocation");
  if (codexInvocation.engine !== schema.implementation.codexCliInvocation.engine) {
    throw new Error(`manifest.implementation.codexCliInvocation.engine must be ${schema.implementation.codexCliInvocation.engine}`);
  }
  if (codexInvocation.sandbox !== "workspace-write") {
    throw new Error("manifest.implementation.codexCliInvocation.sandbox must be workspace-write");
  }
  if (codexInvocation.approvalPolicy !== schema.implementation.codexCliInvocation.approvalPolicy) {
    throw new Error(
      `manifest.implementation.codexCliInvocation.approvalPolicy must be ${schema.implementation.codexCliInvocation.approvalPolicy}`,
    );
  }
  if (codexInvocation.webSearch !== schema.implementation.codexCliInvocation.webSearch) {
    throw new Error(`manifest.implementation.codexCliInvocation.webSearch must be ${schema.implementation.codexCliInvocation.webSearch}`);
  }
  requireBoolean(codexInvocation.localOllama, "manifest.implementation.codexCliInvocation.localOllama", false);

  if (manifest.liveAcceptance.lock !== schema.liveAcceptance.lock) {
    throw new Error(`manifest.liveAcceptance.lock must be ${schema.liveAcceptance.lock}`);
  }
  if (manifest.liveAcceptance.mode !== schema.liveAcceptance.mode) {
    throw new Error(`manifest.liveAcceptance.mode must be ${schema.liveAcceptance.mode}`);
  }
  assertNoLocalOllamaProvider(manifest.liveAcceptance.providerPath, "manifest.liveAcceptance.providerPath");
  assertIncludesAll(manifest.liveAcceptance.flow, schema.liveAcceptance.flow, "manifest.liveAcceptance.flow");

  assertIncludesAll(
    manifest.approvals.manualUserApprovalRequiredFor,
    schema.approvals.manualUserApprovalRequiredFor,
    "manifest.approvals.manualUserApprovalRequiredFor",
  );
  assertIncludesAll(
    manifest.approvals.automaticSafetyGatesFor,
    schema.approvals.automaticSafetyGatesFor,
    "manifest.approvals.automaticSafetyGatesFor",
  );
  assertIncludesAll(
    manifest.safety.forbiddenActions,
    [
      "use_local_ollama",
      "write_source_repository",
      "push_without_manual_user_approval",
      "create_pr_without_manual_user_approval",
    ],
    "manifest.safety.forbiddenActions",
  );
}

function resolveTargetRepo(manifest, cwd) {
  const targetPath = path.resolve(cwd, manifest.targetRepo.path);
  if (!existsSync(targetPath) || !statSync(targetPath).isDirectory()) {
    throw new Error(`target-repo-missing: ${targetPath}`);
  }
  return targetPath;
}

function runGit(cwd, args, label) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function gitStatusEntries(cwd) {
  const output = runGit(cwd, ["status", "--porcelain", "--untracked-files=all"], "git status");
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function assertGitTargetCleanOrOwned(cwd, state) {
  runGit(cwd, ["rev-parse", "--show-toplevel"], "target git root check");
  const dirtyEntries = gitStatusEntries(cwd);
  if (dirtyEntries.length === 0) {
    return;
  }

  const owned = new Set((state?.ownedDirtyPaths || []).map(normalizeRepoPath));
  const unowned = dirtyEntries
    .map((entry) => normalizeRepoPath(entry.slice(3).trim() || entry))
    .filter((entry) => !owned.has(entry));
  if (unowned.length > 0) {
    throw new Error(`target-repo-dirty-unowned: ${unowned.join(", ")}`);
  }
}

function assertRunRootIgnored(targetRepo, runId) {
  const probe = `${RUN_ROOT_RELATIVE}/${runId}/state.json`;
  const result = spawnSync("git", ["check-ignore", "-q", probe], {
    cwd: targetRepo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`run-root-not-ignored: ${probe}`);
  }
}

function createNormalizedManifest(manifest, manifestPath, contractPath) {
  const normalized = JSON.parse(stableStringify(manifest));
  const manifestHash = sha256Text(stableStringify(normalized));
  return {
    manifestHash,
    normalizedManifest: {
      ...normalized,
      _meta: {
        normalizedBy: "AUX-016 generic repo importer command skeleton",
        sourceManifestPath: path.resolve(manifestPath),
        sourceContractPath: path.resolve(contractPath),
        manifestHash,
      },
    },
  };
}

function createSupervisorPlan(manifest, manifestHash, runRootRelative) {
  return {
    schema: SUPERVISOR_PLAN_SCHEMA,
    auxiliaryId: "AUX-015",
    sourceContract: CONTRACT_PATH,
    manifestHash,
    runId: manifest.run.runId,
    status: "stopped_before_analysis",
    stopBeforePhase: "analysis",
    runRoot: runRootRelative,
    codexCliSemantics: {
      engine: "codex-cli",
      sandbox: "workspace-write",
      approvalPolicy: "never",
      webSearch: "disabled",
      localOllama: false,
      executionStarted: false,
    },
    phasePlan: [
      {
        phase: "initialized",
        status: "written",
        artifacts: [
          "state.json",
          "events.jsonl",
          "manifest.original.json",
          "manifest.normalized.json",
          "supervisor-plan.json",
        ],
      },
      {
        phase: "analysis",
        status: "not_started",
        reason: "Run with --run-analysis to execute the AUX-016 fixture-backed analysis phase.",
      },
      {
        phase: "implementation_worktrees",
        status: "not_started",
        reason: "AUX-016 does not create implementation worktrees.",
      },
    ],
    forbiddenBoundaries: {
      sourceRepoWrite: false,
      branchCreation: false,
      worktreeCreation: false,
      liveCepAeRun: false,
      localOllamaUse: false,
      dependencyChange: false,
      productRuntimeEdit: false,
      push: false,
      pullRequest: false,
      githubAutomation: false,
    },
  };
}

function updateSupervisorPlanForAnalysis(runRoot, manifest, manifestHash, runRootRelative, artifactPaths) {
  const planPath = path.join(runRoot, "supervisor-plan.json");
  const existing = existsSync(planPath)
    ? readJsonFile(planPath, "supervisor plan")
    : createSupervisorPlan(manifest, manifestHash, runRootRelative);
  const plan = {
    ...existing,
    auxiliaryId: "AUX-016",
    status: "stopped_after_analysis",
    stopBeforePhase: "implementation_worktrees",
    analysis: {
      schema: ANALYSIS_SCHEMA,
      status: "completed",
      artifacts: artifactPaths,
      worktreesCreated: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
    },
    phasePlan: [
      {
        phase: "initialized",
        status: "written",
        artifacts: [
          "state.json",
          "events.jsonl",
          "manifest.original.json",
          "manifest.normalized.json",
          "supervisor-plan.json",
        ],
      },
      {
        phase: "analysis",
        status: "written",
        artifacts: artifactPaths,
      },
      {
        phase: "implementation_worktrees",
        status: "not_started",
        reason: "AUX-016 stops before implementation worktrees by design.",
      },
    ],
  };
  writeJson(planPath, plan);
}

function updateSupervisorPlanForImplementationPlanning(runRoot, manifest, manifestHash, runRootRelative, artifactPaths, batches) {
  const planPath = path.join(runRoot, "supervisor-plan.json");
  const existing = existsSync(planPath)
    ? readJsonFile(planPath, "supervisor plan")
    : createSupervisorPlan(manifest, manifestHash, runRootRelative);
  const plan = {
    ...existing,
    auxiliaryId: "AUX-017",
    status: "stopped_after_implementation_planning",
    stopBeforePhase: "implementation_worktrees",
    implementationPlanning: {
      schema: IMPLEMENTATION_PLAN_SCHEMA,
      status: "completed",
      artifacts: artifactPaths,
      batches: batches.map((batch) => ({
        id: batch.id,
        candidateIds: batch.candidateIds,
        plannedPaths: batch.plannedPaths,
        promptPath: batch.promptPath,
        plannedWorktreePath: batch.plannedWorktreePath,
        worktreeCreated: false,
      })),
      worktreesCreated: false,
      childRunsCreated: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
    },
    phasePlan: [
      {
        phase: "initialized",
        status: "written",
        artifacts: [
          "state.json",
          "events.jsonl",
          "manifest.original.json",
          "manifest.normalized.json",
          "supervisor-plan.json",
        ],
      },
      {
        phase: "analysis",
        status: "written",
        artifacts: existing.analysis?.artifacts || [],
      },
      {
        phase: "implementation_planning",
        status: "written",
        artifacts: artifactPaths,
      },
      {
        phase: "implementation_worktrees",
        status: "not_started",
        reason: "AUX-017 plans batches only and does not create branches, worktrees, or child runs.",
      },
    ],
  };
  writeJson(planPath, plan);
}

function updateSupervisorPlanForMergePlanning(runRoot, manifest, manifestHash, runRootRelative, artifactPaths, accepted, rejected) {
  const planPath = path.join(runRoot, "supervisor-plan.json");
  const existing = existsSync(planPath)
    ? readJsonFile(planPath, "supervisor plan")
    : createSupervisorPlan(manifest, manifestHash, runRootRelative);
  const plan = {
    ...existing,
    auxiliaryId: "AUX-018",
    status: "stopped_after_merge_planning",
    stopBeforePhase: "live_queue_design",
    mergePlanning: {
      schema: MERGE_PLAN_SCHEMA,
      status: "completed",
      artifacts: artifactPaths,
      acceptedBatchIds: accepted.map((batch) => batch.id),
      rejectedBatchIds: rejected.map((batch) => batch.id),
      controlledMergeApplied: false,
      worktreesCreated: false,
      childRunsCreated: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
    },
    phasePlan: [
      {
        phase: "initialized",
        status: "written",
        artifacts: [
          "state.json",
          "events.jsonl",
          "manifest.original.json",
          "manifest.normalized.json",
          "supervisor-plan.json",
        ],
      },
      {
        phase: "analysis",
        status: "written",
        artifacts: existing.analysis?.artifacts || [],
      },
      {
        phase: "implementation_planning",
        status: "written",
        artifacts: existing.implementationPlanning?.artifacts || [],
      },
      {
        phase: "merge_planning",
        status: "written",
        artifacts: artifactPaths,
      },
      {
        phase: "live_queue_design",
        status: "not_started",
        reason: "AUX-018 plans controlled merge and non-live report artifacts only.",
      },
    ],
  };
  writeJson(planPath, plan);
}

function loadState(runRoot) {
  const statePath = path.join(runRoot, "state.json");
  if (!existsSync(statePath)) {
    return null;
  }
  return readJsonFile(statePath, "state");
}

function initializeRun({ manifest, normalizedManifest, manifestHash, manifestPath, targetRepo, runRoot, runRootRelative }) {
  const now = new Date().toISOString();
  mkdirSync(runRoot, { recursive: true });

  const state = {
    schema: RUNNER_SCHEMA,
    auxiliaryId: "AUX-015",
    runId: manifest.run.runId,
    status: "stopped",
    currentPhase: "initialized",
    nextPhase: "analysis",
    stopReason: "stopped_before_analysis",
    manifestHash,
    manifestPath: path.resolve(manifestPath),
    targetRepo,
    runRoot: runRootRelative,
    createdAt: now,
    updatedAt: now,
    resumeCount: 0,
    ownedDirtyPaths: [],
    flags: {
      analysisStarted: false,
      worktreesCreated: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
      dependencyChanged: false,
      productRuntimeEdited: false,
      branchCreated: false,
      pushOrPrCreated: false,
    },
  };

  writeJson(path.join(runRoot, "manifest.original.json"), manifest);
  writeJson(path.join(runRoot, "manifest.normalized.json"), normalizedManifest);
  writeJson(path.join(runRoot, "supervisor-plan.json"), createSupervisorPlan(manifest, manifestHash, runRootRelative));
  writeJson(path.join(runRoot, "state.json"), state);
  appendEvent(runRoot, {
    event: "run_initialized",
    auxiliaryId: "AUX-015",
    runId: manifest.run.runId,
    manifestHash,
    at: now,
  });
  appendEvent(runRoot, {
    event: "stopped_before_analysis",
    runId: manifest.run.runId,
    nextPhase: "analysis",
    at: now,
  });
  return state;
}

function assertResumeStateMatches(manifest, manifestHash, existingState) {
  if (existingState.manifestHash !== manifestHash) {
    throw new Error("resume-manifest-hash-mismatch");
  }
  if (existingState.runId !== manifest.run.runId) {
    throw new Error("resume-run-id-mismatch");
  }
  if (existingState.status !== "stopped") {
    throw new Error("resume-state-not-stopped");
  }
}

function resumeRun({ manifest, manifestHash, runRoot, existingState }) {
  const now = new Date().toISOString();
  assertResumeStateMatches(manifest, manifestHash, existingState);
  const atAnalysisBoundary = existingState.nextPhase === "analysis";
  const atImplementationBoundary =
    existingState.currentPhase === "analysis_complete" &&
    existingState.nextPhase === "implementation_planning";
  const atImplementationPlannedBoundary =
    existingState.currentPhase === "implementation_planned" &&
    existingState.nextPhase === "implementation_worktrees";
  const atMergePlannedBoundary =
    existingState.currentPhase === "merge_planned" &&
    existingState.nextPhase === "live_queue_planning";
  if (!atAnalysisBoundary && !atImplementationBoundary && !atImplementationPlannedBoundary && !atMergePlannedBoundary) {
    throw new Error("resume-state-not-at-supported-boundary");
  }

  const state = {
    ...existingState,
    updatedAt: now,
    resumeCount: Number(existingState.resumeCount || 0) + 1,
    lastResumeAt: now,
  };
  writeJson(path.join(runRoot, "state.json"), state);
  appendEvent(runRoot, {
    event: "resume_from_state_checked",
    runId: manifest.run.runId,
    manifestHash,
    currentPhase: state.currentPhase,
    nextPhase: state.nextPhase,
    at: now,
  });
  if (state.nextPhase === "analysis") {
    appendEvent(runRoot, {
      event: "stopped_before_analysis",
      runId: manifest.run.runId,
      nextPhase: "analysis",
      at: now,
    });
  }
  return state;
}

function resolveSourceRoot(manifest) {
  if (manifest.sourceRepo.inputKind !== "local-path") {
    throw new Error("analysis-source-input-kind-not-supported");
  }

  const sourceRoot = path.resolve(manifest.sourceRepo.location);
  if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
    throw new Error(`analysis-source-missing: ${sourceRoot}`);
  }

  const allowedRoots = manifest.sourceRepo.allowedReadRoots.map((entry) => path.resolve(entry));
  if (!allowedRoots.some((allowedRoot) => pathStartsWith(sourceRoot, allowedRoot))) {
    throw new Error("analysis-source-outside-allowed-read-roots");
  }
  return sourceRoot;
}

function isDeniedSourcePath(relativePath, deniedRoots) {
  const normalized = normalizeRepoPath(relativePath);
  return deniedRoots.some((entry) => {
    const denied = normalizeRepoPath(entry).replace(/\/+$/, "");
    return normalized === denied || normalized.startsWith(`${denied}/`) || normalized.includes(`/${denied}/`);
  });
}

function readTextIfSmall(filePath, size) {
  if (size > TEXT_FILE_MAX_BYTES) {
    return "";
  }
  const text = readFileSync(filePath, "utf8");
  if (text.includes("\u0000")) {
    return "";
  }
  return text;
}

function collectSourceInventory(sourceRoot, manifest) {
  const deniedRoots = [".git", "node_modules", ...(manifest.sourceRepo.deniedReadRoots || [])];
  const sizeLimits = manifest.intake.sizeLimits || {};
  const maxFiles = Number.isInteger(sizeLimits.maxFiles) ? sizeLimits.maxFiles : 500;
  const maxBytes = Number.isInteger(sizeLimits.maxBytes) ? sizeLimits.maxBytes : 10 * 1024 * 1024;
  const files = [];
  let totalBytes = 0;
  let secretMatch = null;
  let licenseFile = null;

  function visit(directory) {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = normalizeRepoPath(path.relative(sourceRoot, absolute));
      if (isDeniedSourcePath(relative, deniedRoots)) {
        continue;
      }
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const stat = statSync(absolute);
      totalBytes += stat.size;
      if (files.length + 1 > maxFiles) {
        throw new Error("analysis-source-size-limit-files-exceeded");
      }
      if (totalBytes > maxBytes) {
        throw new Error("analysis-source-size-limit-bytes-exceeded");
      }

      const text = readTextIfSmall(absolute, stat.size);
      if (!licenseFile && /^(?:license|licence|copying)(?:\..*)?$/i.test(entry.name)) {
        licenseFile = relative;
      }
      if (!secretMatch && SECRET_PATTERN.test(text)) {
        secretMatch = relative;
      }
      if (NAMED_REPO_ASSUMPTION_PATTERN.test(relative) || NAMED_REPO_ASSUMPTION_PATTERN.test(text)) {
        throw new Error(`named-repo-assumption-detected: ${relative}`);
      }

      files.push({
        path: relative,
        size: stat.size,
        sha256: sha256Text(readFileSync(absolute)),
        extension: path.extname(entry.name).toLowerCase(),
      });
    }
  }

  visit(sourceRoot);
  return { files, licenseFile, secretMatch, sourceRoot, totalBytes };
}

function enforceIntakePolicies(manifest, inventory) {
  if (manifest.intake.secretPolicy === "reject-secrets" && inventory.secretMatch) {
    throw new Error(`unsafe-secret-detected: ${inventory.secretMatch}`);
  }
  if (
    ["require-license", "reject-missing-license", "require-classified-license"].includes(
      manifest.intake.licensePolicy,
    ) &&
    !inventory.licenseFile
  ) {
    throw new Error("license-review-failed: missing license file");
  }
}

function candidateId(prefix, relativePath) {
  const base = normalizeRepoPath(relativePath)
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${prefix}-${base || "candidate"}`;
}

function safeId(value, fallback = "batch") {
  return String(value || fallback)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || fallback;
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function normalizePlannedPath(value) {
  const normalized = normalizeRepoPath(value).replace(/\/+/g, "/");
  if (
    normalized === "" ||
    path.isAbsolute(String(value || "")) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`invalid-planned-path: ${value}`);
  }
  return normalized;
}

function pathMatchesPattern(relativePath, pattern) {
  const normalized = normalizeRepoPath(relativePath);
  const normalizedPattern = normalizeRepoPath(pattern).replace(/\/+$/, "");
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  return normalized === normalizedPattern;
}

function pathMatchesAny(relativePath, patterns) {
  return (patterns || []).some((pattern) => pathMatchesPattern(relativePath, pattern));
}

function isDependencyPath(relativePath) {
  return DEPENDENCY_PATHS.has(normalizeRepoPath(relativePath));
}

function defaultPlannedPathForCandidate(candidate) {
  const id = safeId(candidate.id, "candidate");
  if (candidate.kind === "tool") {
    return `scripts/imported-tools/${id}.js`;
  }
  return `scripts/imported-automations/${id}.md`;
}

function buildToolCandidates(sourceRoot, inventory) {
  const candidates = [];
  for (const file of inventory.files) {
    if (![".js", ".mjs", ".jsx", ".ts"].includes(file.extension)) {
      continue;
    }
    const text = readTextIfSmall(path.join(sourceRoot, file.path), file.size);
    if (!/(?:export\s+function|module\.exports|function\s+\w+|class\s+\w+|run_extendscript|tool)/i.test(text)) {
      continue;
    }
    candidates.push({
      schema: "generic-repo-tool-importer.tool-candidate.v1",
      id: candidateId("tool", file.path),
      sourcePath: file.path,
      evidence: ["code-shape-heuristic"],
      risk: "review_required",
      readBackRequired: true,
      implementationWorktreeCreated: false,
    });
  }
  return candidates;
}

function buildAutomationCandidates(sourceRoot, inventory) {
  const candidates = [];
  const packageFile = inventory.files.find((file) => file.path === "package.json");
  if (packageFile) {
    const packageJson = readJsonFile(path.join(sourceRoot, "package.json"), "source package");
    for (const [scriptName, command] of Object.entries(packageJson.scripts || {})) {
      candidates.push({
        schema: "generic-repo-tool-importer.automation-candidate.v1",
        id: candidateId("automation", `package-${scriptName}`),
        sourcePath: "package.json",
        scriptName,
        command,
        risk: "review_required",
        implementationWorktreeCreated: false,
      });
    }
  }

  for (const file of inventory.files) {
    if (/^(?:scripts|bin)\//.test(file.path) || [".ps1", ".cmd", ".bat", ".sh"].includes(file.extension)) {
      candidates.push({
        schema: "generic-repo-tool-importer.automation-candidate.v1",
        id: candidateId("automation", file.path),
        sourcePath: file.path,
        risk: "review_required",
        implementationWorktreeCreated: false,
      });
    }
  }
  return candidates;
}

function writeCandidateFiles(runRoot, directoryName, candidates, noneId) {
  const directory = path.join(runRoot, "analysis", directoryName);
  mkdirSync(directory, { recursive: true });
  if (candidates.length === 0) {
    const none = {
      schema: `generic-repo-tool-importer.${noneId}.v1`,
      id: "none",
      status: "none_detected",
      implementationWorktreeCreated: false,
    };
    writeJson(path.join(directory, "none.json"), none);
    return [`analysis/${directoryName}/none.json`];
  }

  const paths = [];
  for (const candidate of candidates) {
    const relative = `analysis/${directoryName}/${candidate.id}.json`;
    writeJson(path.join(runRoot, relative), candidate);
    paths.push(relative);
  }
  return paths;
}

function buildAnalysisArtifacts(manifest, manifestHash, runRoot) {
  assertNoNamedRepoAssumptions(manifest, "manifest");
  const sourceRoot = resolveSourceRoot(manifest);
  const inventory = collectSourceInventory(sourceRoot, manifest);
  enforceIntakePolicies(manifest, inventory);

  const toolCandidates = buildToolCandidates(sourceRoot, inventory);
  const automationCandidates = buildAutomationCandidates(sourceRoot, inventory);
  const analysisRoot = path.join(runRoot, "analysis");
  mkdirSync(analysisRoot, { recursive: true });

  const fingerprint = {
    schema: "generic-repo-tool-importer.repo-fingerprint.v1",
    runId: manifest.run.runId,
    manifestHash,
    sourceInputKind: manifest.sourceRepo.inputKind,
    sourceRoot,
    revision: manifest.sourceRepo.revision,
    fileCount: inventory.files.length,
    totalBytes: inventory.totalBytes,
    licenseFile: inventory.licenseFile,
    files: inventory.files,
  };
  writeJson(path.join(analysisRoot, "repo-fingerprint.json"), fingerprint);

  const toolPaths = writeCandidateFiles(runRoot, "tool-candidates", toolCandidates, "tool-candidate-summary");
  const automationPaths = writeCandidateFiles(
    runRoot,
    "automation-candidates",
    automationCandidates,
    "automation-candidate-summary",
  );

  const riskMap = {
    schema: "generic-repo-tool-importer.risk-map.v1",
    runId: manifest.run.runId,
    manifestHash,
    status: "review_required",
    checks: {
      localOllama: "rejected_by_manifest_validation",
      namedRepoAssumptions: "passed",
      secrets: "passed",
      license: inventory.licenseFile ? "present" : "not_required_by_manifest",
      worktreesCreated: false,
      liveCepAeRun: false,
    },
    candidateRisks: [...toolCandidates, ...automationCandidates].map((candidate) => ({
      id: candidate.id,
      risk: candidate.risk,
      sourcePath: candidate.sourcePath,
    })),
  };
  writeJson(path.join(analysisRoot, "risk-map.json"), riskMap);

  const readBackRequirements = {
    schema: "generic-repo-tool-importer.read-back-requirements.v1",
    runId: manifest.run.runId,
    manifestHash,
    requirements: toolCandidates.map((candidate) => ({
      candidateId: candidate.id,
      sourcePath: candidate.sourcePath,
      requiredBeforePromotion: true,
      evidenceKinds: ["non-live-smoke", "semantic-verification", "future-read-back"],
    })),
  };
  writeJson(path.join(analysisRoot, "read-back-requirements.json"), readBackRequirements);

  const batchPlan = {
    schema: "generic-repo-tool-importer.batch-plan.v1",
    runId: manifest.run.runId,
    manifestHash,
    status: "planned_for_future_implementation",
    maxParallelAnalysisWorkers: manifest.analysis.batching.maxParallelAnalysisWorkers,
    maxParallelImplementationBatches: manifest.analysis.batching.maxParallelImplementationBatches,
    implementationWorktreesCreated: false,
    batches: [
      {
        id: "fixture-analysis-batch-1",
        candidateIds: [...toolCandidates, ...automationCandidates].map((candidate) => candidate.id),
        plannedPaths: [],
        worktree: null,
        status: "not_started",
      },
    ],
  };
  writeJson(path.join(analysisRoot, "batch-plan.json"), batchPlan);

  return [
    ...ANALYSIS_ARTIFACTS,
    ...toolPaths,
    ...automationPaths,
  ];
}

function verifyAnalysisOutputs(runRoot) {
  const required = [...ANALYSIS_ARTIFACTS];
  for (const relative of required) {
    const absolute = path.join(runRoot, relative);
    if (!existsSync(absolute)) {
      throw new Error(`analysis-output-missing: ${relative}`);
    }
    readJsonFile(absolute, relative);
  }

  for (const directoryName of ["tool-candidates", "automation-candidates"]) {
    const directory = path.join(runRoot, "analysis", directoryName);
    if (!existsSync(directory) || !statSync(directory).isDirectory()) {
      throw new Error(`analysis-output-missing: analysis/${directoryName}`);
    }
    const jsonFiles = readdirSync(directory).filter((entry) => entry.endsWith(".json"));
    if (jsonFiles.length === 0) {
      throw new Error(`analysis-output-missing: analysis/${directoryName}/*.json`);
    }
    for (const fileName of jsonFiles) {
      readJsonFile(path.join(directory, fileName), `analysis/${directoryName}/${fileName}`);
    }
  }
}

function readCandidateArtifacts(runRoot, directoryName, kind) {
  const directory = path.join(runRoot, "analysis", directoryName);
  const jsonFiles = readdirSync(directory)
    .filter((entry) => entry.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));
  const candidates = [];
  for (const fileName of jsonFiles) {
    const candidate = readJsonFile(path.join(directory, fileName), `analysis/${directoryName}/${fileName}`);
    if (candidate.id === "none" || candidate.status === "none_detected") {
      continue;
    }
    requireString(candidate.id, `analysis/${directoryName}/${fileName}.id`);
    requireString(candidate.sourcePath, `analysis/${directoryName}/${fileName}.sourcePath`);
    candidates.push({ ...candidate, kind });
  }
  return candidates;
}

function expandCandidateIds(candidateIds, candidates) {
  if (!candidateIds || candidateIds.length === 0 || candidateIds.includes("*")) {
    return candidates.map((candidate) => candidate.id);
  }
  return uniqueValues(candidateIds);
}

function buildBatchDefinitions(manifest, batchPlan, candidates) {
  const overrides = Array.isArray(manifest.implementation.plannedPathsPerBatch)
    ? manifest.implementation.plannedPathsPerBatch
    : [];
  const sourceBatches = overrides.length > 0 ? overrides : batchPlan.batches;
  if (!Array.isArray(sourceBatches) || sourceBatches.length === 0) {
    throw new Error("implementation-batch-plan-empty");
  }

  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return sourceBatches.map((sourceBatch, index) => {
    const id = safeId(sourceBatch.id || `implementation-batch-${index + 1}`, `implementation-batch-${index + 1}`);
    const candidateIds = expandCandidateIds(sourceBatch.candidateIds, candidates);
    for (const candidateIdValue of candidateIds) {
      if (!candidateById.has(candidateIdValue)) {
        throw new Error(`implementation-batch-candidate-missing: ${candidateIdValue}`);
      }
    }

    const sourcePlannedPaths = Array.isArray(sourceBatch.plannedPaths) ? sourceBatch.plannedPaths : [];
    const plannedPaths =
      sourcePlannedPaths.length > 0
        ? sourcePlannedPaths.map(normalizePlannedPath)
        : candidateIds.map((candidateIdValue) => defaultPlannedPathForCandidate(candidateById.get(candidateIdValue)));
    const normalizedPlannedPaths = uniqueValues(plannedPaths.map(normalizePlannedPath));
    if (normalizedPlannedPaths.length === 0) {
      throw new Error(`batch-without-planned-paths: ${id}`);
    }

    return {
      id,
      candidateIds,
      plannedPaths: normalizedPlannedPaths,
      sharedFileOwnerFor: Array.isArray(sourceBatch.sharedFileOwnerFor)
        ? sourceBatch.sharedFileOwnerFor.map(normalizePlannedPath)
        : [],
      plannedWorktreePath: `worktrees/${id}`,
      worktreeCreated: false,
    };
  });
}

function validatePlannedPaths(manifest, batches) {
  const allowed = manifest.targetRepo.allowedWritePaths || [];
  const forbidden = [...(manifest.targetRepo.forbiddenWritePaths || []), ...(manifest.safety.forbiddenPaths || [])];
  const dependencyChangesAllowed = manifest.implementation.dependencyChangesAllowed === true;

  for (const batch of batches) {
    for (const plannedPath of batch.plannedPaths) {
      if (isDependencyPath(plannedPath) && !dependencyChangesAllowed) {
        throw new Error(`dependency-change-requested-without-manifest-allowance: ${plannedPath}`);
      }
      if (pathMatchesAny(plannedPath, forbidden)) {
        throw new Error(`forbidden-target-path: ${plannedPath}`);
      }
      if (!pathMatchesAny(plannedPath, allowed)) {
        throw new Error(`planned-path-outside-allowlist: ${plannedPath}`);
      }
    }
  }
}

function validateSharedPathOwnership(manifest, batches) {
  const occurrences = new Map();
  for (const batch of batches) {
    for (const plannedPath of batch.plannedPaths) {
      const current = occurrences.get(plannedPath) || [];
      current.push(batch.id);
      occurrences.set(plannedPath, current);
    }
  }

  const manifestOwners = manifest.implementation.sharedFileOwners || {};
  for (const [plannedPath, owners] of occurrences.entries()) {
    if (owners.length < 2) {
      continue;
    }
    const inlineOwner = batches.find((batch) => batch.sharedFileOwnerFor.includes(plannedPath))?.id;
    const owner = manifestOwners[plannedPath] || inlineOwner;
    if (!owner) {
      throw new Error(`shared-file-batch-conflict-without-merge-owner: ${plannedPath}`);
    }
    if (!owners.includes(owner)) {
      throw new Error(`shared-file-owner-not-in-conflict: ${plannedPath}`);
    }
  }
}

function buildPromptText(manifest, batch, candidates) {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const candidateSummaries = batch.candidateIds.map((candidateIdValue) => {
    const candidate = candidateById.get(candidateIdValue);
    return {
      id: candidate.id,
      kind: candidate.kind,
      sourcePath: candidate.sourcePath,
      risk: candidate.risk,
    };
  });
  return [
    `# Generic Repo Importer Batch ${batch.id}`,
    "",
    "This is an AUX-017 plan-only prompt artifact. Do not run it yet.",
    "",
    `Run ID: ${manifest.run.runId}`,
    `Requested goal: ${manifest.run.requestedGoal}`,
    "",
    "Hard boundaries:",
    "- Edit only the planned paths listed below.",
    "- Do not create branches or git worktrees.",
    "- Do not launch Codex child runs from this prompt.",
    "- Do not use Local/Ollama, fallback providers, web search, live AE/CEP, push, PR, or GitHub automation.",
    "- Do not change package/dependency files unless a later approved manifest explicitly allows that path.",
    "",
    "Planned paths:",
    ...batch.plannedPaths.map((plannedPath) => `- ${plannedPath}`),
    "",
    "Candidates:",
    "```json",
    JSON.stringify(candidateSummaries, null, 2),
    "```",
    "",
  ].join("\n");
}

function buildImplementationPlanningArtifacts(manifest, manifestHash, runRoot) {
  verifyAnalysisOutputs(runRoot);
  const batchPlan = readJsonFile(path.join(runRoot, "analysis", "batch-plan.json"), "analysis batch plan");
  const riskMap = readJsonFile(path.join(runRoot, "analysis", "risk-map.json"), "analysis risk map");
  const readBackRequirements = readJsonFile(
    path.join(runRoot, "analysis", "read-back-requirements.json"),
    "analysis read-back requirements",
  );
  const candidates = [
    ...readCandidateArtifacts(runRoot, "tool-candidates", "tool"),
    ...readCandidateArtifacts(runRoot, "automation-candidates", "automation"),
  ];
  assertNoNamedRepoAssumptions({ manifest, batchPlan, riskMap, readBackRequirements, candidates }, "implementation planning inputs");

  const batches = buildBatchDefinitions(manifest, batchPlan, candidates);
  validatePlannedPaths(manifest, batches);
  validateSharedPathOwnership(manifest, batches);

  const implementationRoot = path.join(runRoot, "implementation");
  const promptRoot = path.join(implementationRoot, "batch-prompts");
  mkdirSync(promptRoot, { recursive: true });

  const promptPaths = [];
  for (const batch of batches) {
    const promptPath = `implementation/batch-prompts/${safeId(batch.id)}.md`;
    batch.promptPath = promptPath;
    writeFileSync(path.join(runRoot, promptPath), buildPromptText(manifest, batch, candidates), "utf8");
    promptPaths.push(promptPath);
  }

  const allPlannedPaths = uniqueValues(batches.flatMap((batch) => batch.plannedPaths)).sort((left, right) =>
    left.localeCompare(right),
  );
  const plannedPaths = {
    schema: "generic-repo-tool-importer.planned-paths.v1",
    runId: manifest.run.runId,
    manifestHash,
    status: "planned_only",
    dependencyChangesAllowed: manifest.implementation.dependencyChangesAllowed === true,
    allowedWritePaths: manifest.targetRepo.allowedWritePaths,
    forbiddenWritePaths: uniqueValues([...(manifest.targetRepo.forbiddenWritePaths || []), ...(manifest.safety.forbiddenPaths || [])]),
    allPlannedPaths,
    batches: batches.map((batch) => ({
      id: batch.id,
      candidateIds: batch.candidateIds,
      plannedPaths: batch.plannedPaths,
      promptPath: batch.promptPath,
      worktreeCreated: false,
    })),
    checks: {
      allowlist: "passed",
      forbiddenPaths: "passed",
      dependencyChanges: manifest.implementation.dependencyChangesAllowed === true ? "explicitly_allowed" : "not_requested",
      sharedPathOwnership: "passed",
    },
  };
  writeJson(path.join(implementationRoot, "planned-paths.json"), plannedPaths);

  const worktreePlan = {
    schema: "generic-repo-tool-importer.batch-worktree-plan.v1",
    runId: manifest.run.runId,
    manifestHash,
    status: "planned_only",
    sourceAnalysisBatchPlan: "analysis/batch-plan.json",
    maxParallelImplementationBatches: manifest.analysis.batching.maxParallelImplementationBatches,
    worktreesCreated: false,
    childRunsCreated: false,
    liveCepAeRun: false,
    localOllamaUsed: false,
    batches: batches.map((batch) => ({
      id: batch.id,
      candidateIds: batch.candidateIds,
      plannedPaths: batch.plannedPaths,
      promptPath: batch.promptPath,
      plannedWorktreePath: batch.plannedWorktreePath,
      actualWorktreePath: null,
      worktreeCreated: false,
      childRunCreated: false,
      status: "not_started",
    })),
  };
  writeJson(path.join(implementationRoot, "batch-worktree-plan.json"), worktreePlan);

  return {
    artifactPaths: [...IMPLEMENTATION_PLAN_ARTIFACTS, ...promptPaths],
    batches,
  };
}

function verifyImplementationPlanningOutputs(runRoot) {
  for (const relative of IMPLEMENTATION_PLAN_ARTIFACTS) {
    const absolute = path.join(runRoot, relative);
    if (!existsSync(absolute)) {
      throw new Error(`implementation-plan-output-missing: ${relative}`);
    }
    readJsonFile(absolute, relative);
  }

  const worktreePlan = readJsonFile(
    path.join(runRoot, "implementation", "batch-worktree-plan.json"),
    "implementation batch worktree plan",
  );
  if (worktreePlan.schema !== "generic-repo-tool-importer.batch-worktree-plan.v1") {
    throw new Error("implementation-plan-schema-mismatch: batch-worktree-plan.json");
  }
  if (worktreePlan.worktreesCreated !== false || worktreePlan.childRunsCreated !== false) {
    throw new Error("implementation-plan-boundary-violated");
  }
  for (const batch of worktreePlan.batches || []) {
    const promptPath = batch.promptPath;
    if (!promptPath || !existsSync(path.join(runRoot, promptPath))) {
      throw new Error(`implementation-plan-output-missing: ${promptPath || "batch prompt"}`);
    }
  }
}

function readImplementationPlanningOutputs(runRoot) {
  verifyImplementationPlanningOutputs(runRoot);
  const plannedPaths = readJsonFile(path.join(runRoot, "implementation", "planned-paths.json"), "implementation planned paths");
  const worktreePlan = readJsonFile(
    path.join(runRoot, "implementation", "batch-worktree-plan.json"),
    "implementation batch worktree plan",
  );
  if (!Array.isArray(plannedPaths.batches) || !Array.isArray(worktreePlan.batches)) {
    throw new Error("implementation-plan-output-invalid: batches missing");
  }
  return { plannedPaths, worktreePlan };
}

function validateMergeSharedPathOwnership(manifest, worktreePlan) {
  const batches = (worktreePlan.batches || []).map((batch) => ({
    id: batch.id,
    plannedPaths: (batch.plannedPaths || []).map(normalizePlannedPath),
    sharedFileOwnerFor: Array.isArray(batch.sharedFileOwnerFor)
      ? batch.sharedFileOwnerFor.map(normalizePlannedPath)
      : [],
  }));
  validateSharedPathOwnership(manifest, batches);
}

function buildFixtureBatchResults(worktreePlan, manifest) {
  const fixtureResults = manifest.merge.fixtureBatchResults;
  if (Array.isArray(fixtureResults) && fixtureResults.length > 0) {
    return fixtureResults.map((result, index) => ({
      id: safeId(result.id || `fixture-result-${index + 1}`, `fixture-result-${index + 1}`),
      status: result.status || "fixture_completed",
      validationStatus: result.validationStatus || "passed",
      changedPaths: Array.isArray(result.changedPaths) ? result.changedPaths.map(normalizePlannedPath) : [],
      notes: result.notes || "",
    }));
  }
  return (worktreePlan.batches || []).map((batch) => ({
    id: batch.id,
    status: "fixture_completed",
    validationStatus: "passed",
    changedPaths: (batch.plannedPaths || []).map(normalizePlannedPath),
    notes: "Generated by AUX-018 from plan-only implementation artifacts.",
  }));
}

function validateBatchResultPaths(manifest, worktreePlan, batchResults) {
  const batchById = new Map((worktreePlan.batches || []).map((batch) => [batch.id, batch]));
  const allowed = manifest.targetRepo.allowedWritePaths || [];
  const forbidden = [...(manifest.targetRepo.forbiddenWritePaths || []), ...(manifest.safety.forbiddenPaths || [])];
  const dependencyChangesAllowed = manifest.implementation.dependencyChangesAllowed === true;

  for (const result of batchResults) {
    const plannedBatch = batchById.get(result.id);
    if (!plannedBatch) {
      throw new Error(`merge-batch-result-without-plan: ${result.id}`);
    }
    const plannedSet = new Set((plannedBatch.plannedPaths || []).map(normalizePlannedPath));
    for (const changedPath of result.changedPaths) {
      if (isDependencyPath(changedPath) && !dependencyChangesAllowed) {
        throw new Error(`dependency-change-requested-without-manifest-allowance: ${changedPath}`);
      }
      if (pathMatchesAny(changedPath, forbidden)) {
        throw new Error(`forbidden-target-path: ${changedPath}`);
      }
      if (!pathMatchesAny(changedPath, allowed)) {
        throw new Error(`planned-path-outside-allowlist: ${changedPath}`);
      }
      if (!plannedSet.has(changedPath)) {
        throw new Error(`unplanned-path-change: ${result.id}:${changedPath}`);
      }
    }
  }
}

function buildMergePlanningArtifacts(manifest, manifestHash, runRoot) {
  verifyAnalysisOutputs(runRoot);
  const { plannedPaths, worktreePlan } = readImplementationPlanningOutputs(runRoot);
  assertNoNamedRepoAssumptions({ manifest, plannedPaths, worktreePlan }, "merge planning inputs");
  validateMergeSharedPathOwnership(manifest, worktreePlan);

  const batchResults = buildFixtureBatchResults(worktreePlan, manifest);
  validateBatchResultPaths(manifest, worktreePlan, batchResults);

  const accepted = [];
  const rejected = [];
  for (const result of batchResults) {
    const record = {
      id: result.id,
      changedPaths: result.changedPaths,
      status: result.status,
      validationStatus: result.validationStatus,
      controlledMergeApplied: false,
      worktreeCreated: false,
      childRunCreated: false,
    };
    if (result.status === "fixture_completed" && result.validationStatus === "passed") {
      accepted.push(record);
    } else {
      rejected.push({
        ...record,
        reason: result.validationStatus === "passed" ? "batch_not_completed" : "fixture_validation_not_passed",
      });
    }
  }

  const mergeRoot = path.join(runRoot, "merge");
  const validationRoot = path.join(runRoot, "validation");
  mkdirSync(mergeRoot, { recursive: true });
  mkdirSync(validationRoot, { recursive: true });

  const mergePlan = {
    schema: "generic-repo-tool-importer.supervisor-merge-plan.v1",
    runId: manifest.run.runId,
    manifestHash,
    status: "planned_only",
    sourceImplementationPlan: "implementation/batch-worktree-plan.json",
    sourcePlannedPaths: "implementation/planned-paths.json",
    acceptedBatchIds: accepted.map((batch) => batch.id),
    rejectedBatchIds: rejected.map((batch) => batch.id),
    controlledMergeApplied: false,
    worktreesCreated: false,
    childRunsCreated: false,
    liveCepAeRun: false,
    localOllamaUsed: false,
    checks: {
      plannedPathsOnly: "passed",
      sharedPathOwnership: "passed",
      dependencyChanges: manifest.implementation.dependencyChangesAllowed === true ? "explicitly_allowed" : "not_requested",
      dirtyTreeOwnership: "checked_before_run",
      nonLiveValidation: "planned_not_run",
    },
  };
  writeJson(path.join(mergeRoot, "supervisor-merge-plan.json"), mergePlan);

  writeJson(path.join(mergeRoot, "accepted-batches.json"), {
    schema: "generic-repo-tool-importer.accepted-batches.v1",
    runId: manifest.run.runId,
    manifestHash,
    status: "planned_only",
    batches: accepted,
  });

  writeJson(path.join(mergeRoot, "rejected-batches.json"), {
    schema: "generic-repo-tool-importer.rejected-batches.v1",
    runId: manifest.run.runId,
    manifestHash,
    status: "planned_only",
    batches: rejected,
  });

  writeJson(path.join(validationRoot, "non-live-report.json"), {
    schema: "generic-repo-tool-importer.non-live-report.v1",
    runId: manifest.run.runId,
    manifestHash,
    status: "planned_only",
    commands: manifest.validation.nonLiveCommands || [],
    commandsRun: false,
    nodeCheckTouchedJs: manifest.validation.nodeCheckTouchedJs === true,
    gitDiffCheck: manifest.validation.gitDiffCheck === true,
    semanticVerificationRequiredBeforeLive: manifest.validation.semanticVerification?.requiredBeforeLive === true,
    reportPath: manifest.validation.reportPath,
    liveCepAeRun: false,
    localOllamaUsed: false,
  });

  return {
    artifactPaths: [...MERGE_PLAN_ARTIFACTS],
    accepted,
    rejected,
  };
}

function verifyMergePlanningOutputs(runRoot) {
  for (const relative of MERGE_PLAN_ARTIFACTS) {
    const absolute = path.join(runRoot, relative);
    if (!existsSync(absolute)) {
      throw new Error(`merge-plan-output-missing: ${relative}`);
    }
    readJsonFile(absolute, relative);
  }
  const mergePlan = readJsonFile(path.join(runRoot, "merge", "supervisor-merge-plan.json"), "merge supervisor plan");
  if (mergePlan.schema !== "generic-repo-tool-importer.supervisor-merge-plan.v1") {
    throw new Error("merge-plan-schema-mismatch: supervisor-merge-plan.json");
  }
  if (mergePlan.controlledMergeApplied !== false || mergePlan.worktreesCreated !== false || mergePlan.childRunsCreated !== false) {
    throw new Error("merge-plan-boundary-violated");
  }
}

function runAnalysisPhase({ manifest, manifestHash, runRoot, runRootRelative, state }) {
  const now = new Date().toISOString();
  if (state.currentPhase === "analysis_complete" && state.nextPhase === "implementation_planning") {
    verifyAnalysisOutputs(runRoot);
    appendEvent(runRoot, {
      event: "analysis_resume_verified",
      runId: manifest.run.runId,
      manifestHash,
      nextPhase: state.nextPhase,
      at: now,
    });
    return state;
  }

  if (state.status !== "stopped" || state.nextPhase !== "analysis") {
    throw new Error("analysis-state-not-at-boundary");
  }

  const startedState = {
    ...state,
    auxiliaryId: "AUX-016",
    status: "running",
    currentPhase: "analysis",
    nextPhase: null,
    stopReason: null,
    updatedAt: now,
    analysisStartedAt: now,
    flags: {
      ...state.flags,
      analysisStarted: true,
      worktreesCreated: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
    },
  };
  writeJson(path.join(runRoot, "state.json"), startedState);
  appendEvent(runRoot, {
    event: "analysis_started",
    auxiliaryId: "AUX-016",
    runId: manifest.run.runId,
    manifestHash,
    at: now,
  });

  try {
    const artifactPaths = buildAnalysisArtifacts(manifest, manifestHash, runRoot);
    verifyAnalysisOutputs(runRoot);
    const completedAt = new Date().toISOString();
    const completedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "analysis_complete",
      nextPhase: "implementation_planning",
      stopReason: "stopped_before_implementation_worktrees",
      updatedAt: completedAt,
      analysisCompletedAt: completedAt,
      analysisArtifacts: artifactPaths,
      flags: {
        ...startedState.flags,
        analysisCompleted: true,
        worktreesCreated: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
        dependencyChanged: false,
        productRuntimeEdited: false,
        branchCreated: false,
        pushOrPrCreated: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), completedState);
    updateSupervisorPlanForAnalysis(runRoot, manifest, manifestHash, runRootRelative, artifactPaths);
    appendEvent(runRoot, {
      event: "analysis_complete",
      runId: manifest.run.runId,
      manifestHash,
      artifacts: artifactPaths,
      nextPhase: "implementation_planning",
      at: completedAt,
    });
    appendEvent(runRoot, {
      event: "stopped_before_implementation_worktrees",
      runId: manifest.run.runId,
      nextPhase: "implementation_planning",
      at: completedAt,
    });
    return completedState;
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "analysis",
      nextPhase: "analysis",
      stopReason: error.message.split(":")[0],
      updatedAt: failedAt,
      flags: {
        ...startedState.flags,
        analysisCompleted: false,
        worktreesCreated: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), failedState);
    appendEvent(runRoot, {
      event: "analysis_failed",
      runId: manifest.run.runId,
      reason: error.message,
      at: failedAt,
    });
    throw error;
  }
}

function runImplementationPlanningPhase({ manifest, manifestHash, runRoot, runRootRelative, state }) {
  const now = new Date().toISOString();
  if (state.currentPhase === "implementation_planned" && state.nextPhase === "implementation_worktrees") {
    verifyAnalysisOutputs(runRoot);
    verifyImplementationPlanningOutputs(runRoot);
    appendEvent(runRoot, {
      event: "implementation_plan_resume_verified",
      runId: manifest.run.runId,
      manifestHash,
      nextPhase: state.nextPhase,
      at: now,
    });
    return state;
  }

  if (state.status !== "stopped" || state.currentPhase !== "analysis_complete" || state.nextPhase !== "implementation_planning") {
    throw new Error("implementation-planning-state-not-at-boundary");
  }

  const startedState = {
    ...state,
    auxiliaryId: "AUX-017",
    status: "running",
    currentPhase: "implementation_planning",
    nextPhase: null,
    stopReason: null,
    updatedAt: now,
    implementationPlanningStartedAt: now,
    flags: {
      ...state.flags,
      implementationPlanningStarted: true,
      worktreesCreated: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
      dependencyChanged: false,
      productRuntimeEdited: false,
      branchCreated: false,
      pushOrPrCreated: false,
    },
  };
  writeJson(path.join(runRoot, "state.json"), startedState);
  appendEvent(runRoot, {
    event: "implementation_planning_started",
    auxiliaryId: "AUX-017",
    runId: manifest.run.runId,
    manifestHash,
    at: now,
  });

  try {
    const { artifactPaths, batches } = buildImplementationPlanningArtifacts(manifest, manifestHash, runRoot);
    verifyImplementationPlanningOutputs(runRoot);
    const completedAt = new Date().toISOString();
    const completedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "implementation_planned",
      nextPhase: "implementation_worktrees",
      stopReason: "stopped_before_actual_implementation_worktrees",
      updatedAt: completedAt,
      implementationPlanningCompletedAt: completedAt,
      implementationArtifacts: artifactPaths,
      implementationBatches: batches.map((batch) => ({
        id: batch.id,
        candidateIds: batch.candidateIds,
        plannedPaths: batch.plannedPaths,
        promptPath: batch.promptPath,
        plannedWorktreePath: batch.plannedWorktreePath,
        worktreeCreated: false,
      })),
      flags: {
        ...startedState.flags,
        implementationPlanned: true,
        worktreesCreated: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
        dependencyChanged: false,
        productRuntimeEdited: false,
        branchCreated: false,
        pushOrPrCreated: false,
        childRunsCreated: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), completedState);
    updateSupervisorPlanForImplementationPlanning(
      runRoot,
      manifest,
      manifestHash,
      runRootRelative,
      artifactPaths,
      completedState.implementationBatches,
    );
    appendEvent(runRoot, {
      event: "implementation_planned",
      runId: manifest.run.runId,
      manifestHash,
      artifacts: artifactPaths,
      nextPhase: "implementation_worktrees",
      at: completedAt,
    });
    appendEvent(runRoot, {
      event: "stopped_before_actual_implementation_worktrees",
      runId: manifest.run.runId,
      nextPhase: "implementation_worktrees",
      at: completedAt,
    });
    return completedState;
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "analysis_complete",
      nextPhase: "implementation_planning",
      stopReason: error.message.split(":")[0],
      updatedAt: failedAt,
      flags: {
        ...startedState.flags,
        implementationPlanned: false,
        worktreesCreated: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
        childRunsCreated: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), failedState);
    appendEvent(runRoot, {
      event: "implementation_planning_failed",
      runId: manifest.run.runId,
      reason: error.message,
      at: failedAt,
    });
    throw error;
  }
}

function runMergePlanningPhase({ manifest, manifestHash, runRoot, runRootRelative, state }) {
  const now = new Date().toISOString();
  if (state.currentPhase === "merge_planned" && state.nextPhase === "live_queue_planning") {
    verifyAnalysisOutputs(runRoot);
    verifyImplementationPlanningOutputs(runRoot);
    verifyMergePlanningOutputs(runRoot);
    appendEvent(runRoot, {
      event: "merge_plan_resume_verified",
      runId: manifest.run.runId,
      manifestHash,
      nextPhase: state.nextPhase,
      at: now,
    });
    return state;
  }

  if (state.status !== "stopped" || state.currentPhase !== "implementation_planned" || state.nextPhase !== "implementation_worktrees") {
    throw new Error("merge-planning-state-not-at-boundary");
  }

  const startedState = {
    ...state,
    auxiliaryId: "AUX-018",
    status: "running",
    currentPhase: "merge_planning",
    nextPhase: null,
    stopReason: null,
    updatedAt: now,
    mergePlanningStartedAt: now,
    flags: {
      ...state.flags,
      mergePlanningStarted: true,
      controlledMergeApplied: false,
      worktreesCreated: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
      dependencyChanged: false,
      productRuntimeEdited: false,
      branchCreated: false,
      pushOrPrCreated: false,
      childRunsCreated: false,
    },
  };
  writeJson(path.join(runRoot, "state.json"), startedState);
  appendEvent(runRoot, {
    event: "merge_planning_started",
    auxiliaryId: "AUX-018",
    runId: manifest.run.runId,
    manifestHash,
    at: now,
  });

  try {
    const { artifactPaths, accepted, rejected } = buildMergePlanningArtifacts(manifest, manifestHash, runRoot);
    verifyMergePlanningOutputs(runRoot);
    const completedAt = new Date().toISOString();
    const completedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "merge_planned",
      nextPhase: "live_queue_planning",
      stopReason: "stopped_before_live_queue_design",
      updatedAt: completedAt,
      mergePlanningCompletedAt: completedAt,
      mergeArtifacts: artifactPaths,
      acceptedBatchIds: accepted.map((batch) => batch.id),
      rejectedBatchIds: rejected.map((batch) => batch.id),
      flags: {
        ...startedState.flags,
        mergePlanned: true,
        controlledMergeApplied: false,
        worktreesCreated: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
        dependencyChanged: false,
        productRuntimeEdited: false,
        branchCreated: false,
        pushOrPrCreated: false,
        childRunsCreated: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), completedState);
    updateSupervisorPlanForMergePlanning(
      runRoot,
      manifest,
      manifestHash,
      runRootRelative,
      artifactPaths,
      accepted,
      rejected,
    );
    appendEvent(runRoot, {
      event: "merge_planned",
      runId: manifest.run.runId,
      manifestHash,
      artifacts: artifactPaths,
      nextPhase: "live_queue_planning",
      at: completedAt,
    });
    appendEvent(runRoot, {
      event: "stopped_before_live_queue_design",
      runId: manifest.run.runId,
      nextPhase: "live_queue_planning",
      at: completedAt,
    });
    return completedState;
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "implementation_planned",
      nextPhase: "implementation_worktrees",
      stopReason: error.message.split(":")[0],
      updatedAt: failedAt,
      flags: {
        ...startedState.flags,
        mergePlanned: false,
        controlledMergeApplied: false,
        worktreesCreated: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
        childRunsCreated: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), failedState);
    appendEvent(runRoot, {
      event: "merge_planning_failed",
      runId: manifest.run.runId,
      reason: error.message,
      at: failedAt,
    });
    throw error;
  }
}

export function runImporter(options, cwd = process.cwd()) {
  if (!options.manifest) {
    throw new Error("Missing --manifest <path>");
  }

  const contractPath = path.join(REPO_ROOT, CONTRACT_PATH);
  const contract = readJsonFile(contractPath, "AUX-014 contract");
  const manifestPath = path.resolve(cwd, options.manifest);
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
    throw new Error(`manifest-missing: ${manifestPath}`);
  }
  const manifest = readJsonFile(manifestPath, "manifest");

  validateManifest(contract, manifest);
  const targetRepo = resolveTargetRepo(manifest, cwd);
  const runRootRelative = `${RUN_ROOT_RELATIVE}/${manifest.run.runId}`;
  const runRoot = resolveInside(targetRepo, runRootRelative, "run root");
  assertRunRootIgnored(targetRepo, manifest.run.runId);

  const existingState = loadState(runRoot);
  assertGitTargetCleanOrOwned(targetRepo, existingState);

  const { normalizedManifest, manifestHash } = createNormalizedManifest(manifest, manifestPath, contractPath);
  let state;
  let resumed = false;
  if (existingState) {
    if (manifest.run.resumeFromState !== true) {
      throw new Error("run-root-exists-and-resume-disabled");
    }
    state = resumeRun({ manifest, manifestHash, runRoot, existingState });
    resumed = true;
  } else {
    state = initializeRun({
      manifest,
      normalizedManifest,
      manifestHash,
      manifestPath,
      targetRepo,
      runRoot,
      runRootRelative,
    });
  }

  if (options["run-analysis"]) {
    state = runAnalysisPhase({ manifest, manifestHash, runRoot, runRootRelative, state });
  }
  if (options["plan-implementation"]) {
    state = runImplementationPlanningPhase({ manifest, manifestHash, runRoot, runRootRelative, state });
  }
  if (options["plan-merge"]) {
    state = runMergePlanningPhase({ manifest, manifestHash, runRoot, runRootRelative, state });
  }

  const mergePlanned = state.currentPhase === "merge_planned";
  const implementationPlanned = mergePlanned || state.currentPhase === "implementation_planned";
  const analysisComplete = implementationPlanned || state.currentPhase === "analysis_complete";
  const status = implementationPlanned
    ? mergePlanned
      ? "stopped_after_merge_planning"
      : "stopped_after_implementation_planning"
    : analysisComplete
      ? "stopped_after_analysis"
      : "stopped_before_analysis";
  const artifacts = [
    "state.json",
    "events.jsonl",
    "manifest.original.json",
    "manifest.normalized.json",
    "supervisor-plan.json",
  ];
  if (analysisComplete) {
    artifacts.push(...(state.analysisArtifacts || []));
  }
  if (implementationPlanned) {
    artifacts.push(...(state.implementationArtifacts || []));
  }
  if (mergePlanned) {
    artifacts.push(...(state.mergeArtifacts || []));
  }

  return {
    schema: RUNNER_SCHEMA,
    auxiliaryId: mergePlanned ? "AUX-018" : implementationPlanned ? "AUX-017" : analysisComplete ? "AUX-016" : "AUX-015",
    runId: manifest.run.runId,
    status,
    resumed,
    manifestHash,
    targetRepo,
    runRoot,
    artifacts,
    currentPhase: state.currentPhase,
    nextPhase: state.nextPhase,
    analysisStarted: state.flags.analysisStarted === true,
    analysisCompleted: state.flags.analysisCompleted === true,
    implementationPlanned,
    mergePlanned,
    worktreesCreated: false,
    childRunsCreated: false,
    controlledMergeApplied: false,
    liveCepAeRun: false,
    localOllamaUsed: false,
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(HELP.trimStart());
      return;
    }
    const result = runImporter(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`Generic repo importer skeleton initialized ${result.runId}; ${result.status}.\n`);
      process.stdout.write(`Run root: ${result.runRoot}\n`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
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
const IMPLEMENTATION_WORKTREE_SCHEMA = "generic-repo-tool-importer.implementation-worktree-run.v1";
const IMPLEMENTATION_CHILD_RUN_SCHEMA = "generic-repo-tool-importer.implementation-child-run.v1";
const CONTROLLED_SOURCE_MERGE_SCHEMA = "generic-repo-tool-importer.controlled-source-merge.v1";
const NON_LIVE_VALIDATION_SCHEMA = "generic-repo-tool-importer.non-live-validation.v1";
const MERGE_PLAN_SCHEMA = "generic-repo-tool-importer.merge-plan.v1";
const LIVE_QUEUE_PLAN_SCHEMA = "generic-repo-tool-importer.live-queue-plan.v1";
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
const IMPLEMENTATION_WORKTREE_ARTIFACTS = Object.freeze([
  "implementation/worktree-run.json",
]);
const IMPLEMENTATION_CHILD_RUN_ARTIFACTS = Object.freeze([
  "implementation/child-run-run.json",
]);
const CONTROLLED_SOURCE_MERGE_ARTIFACTS = Object.freeze([
  "merge/controlled-source-merge-plan.json",
  "merge/controlled-source-merge-report.json",
]);
const NON_LIVE_VALIDATION_ARTIFACTS = Object.freeze([
  "validation/non-live-report.json",
]);
const MERGE_PLAN_ARTIFACTS = Object.freeze([
  "merge/supervisor-merge-plan.json",
  "merge/accepted-batches.json",
  "merge/rejected-batches.json",
  "validation/non-live-report.json",
]);
const LIVE_QUEUE_ROOT_ARTIFACTS = Object.freeze([
  "live-queue/queue.json",
  "locks/live-ae-cep.lock",
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
const CHILD_RUN_OUTPUT_MAX_BUFFER_BYTES = 2 * 1024 * 1024;
const CHILD_RUN_SUMMARY_MAX_BYTES = 64 * 1024;
const RESULT_SUMMARY_MAX_ARTIFACT_PATHS = 200;
const DEFAULT_CHILD_RUN_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_CHILD_RUN_TIMEOUT_MS = 30 * 60 * 1000;
const SECRET_PATTERN =
  /\b(?:[A-Z0-9]+[_-])*?(?:api[_-]?key|access[_-]?token|secret|password)\b\s*[:=]\s*["']?(?:sk-|xox|ghp_|[A-Za-z0-9_\-]{12,})/i;
const NAMED_REPO_ASSUMPTION_PATTERN = /\bdakkshin\b/i;

const HELP = `
Generic repository tool importer skeleton

Usage:
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path>
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --run-analysis
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --plan-implementation
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --run-implementation-worktrees
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --run-implementation-child-runs
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --apply-controlled-merge
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --run-non-live-validation
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --plan-merge
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --plan-live-queue
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --json

Options:
  --manifest <path>  generic-repo-tool-importer.manifest.v1 JSON file.
  --run-analysis     Run the AUX-016 fixture-backed analysis phase, then stop
                     before implementation worktrees.
  --plan-implementation
                      Run the AUX-017 plan-only implementation batch planner,
                      then stop before creating branches or worktrees.
  --run-implementation-worktrees
                      Run the AUX-020 implementation worktree boundary: create
                      detached importer-owned worktrees only, record child-run
                      intent, then stop before Codex child runs or merge.
  --run-implementation-child-runs
                      Run the AUX-021 child-run boundary: launch Codex CLI only
                      inside AUX-020 detached importer-owned worktrees from
                      child-run intents, capture evidence, enforce planned paths,
                      then stop before source merge or validation commands.
  --apply-controlled-merge
                      Run the AUX-022 controlled source merge application lane:
                      copy only accepted child-run planned paths into the target
                      repo, record durable merge evidence, then stop before
                      non-live validation.
  --run-non-live-validation
                      Run the AUX-023 non-live validation lane against imported
                      target changes, capture full command logs and report
                      evidence, then stop before live acceptance.
  --plan-merge      Run the AUX-018 plan-only controlled merge supervisor,
                      then stop before applying changes or live validation.
  --plan-live-queue Run the AUX-019 fixture-only serial live queue evidence
                     planner, then stop before live AE/CEP execution.
  --json             Print machine-readable output.
  --help             Show this help.

This skeleton validates the AUX-014 manifest contract, creates an ignored run
root, writes durable state artifacts, optionally writes fixture-backed analysis
artifacts, plan-only implementation batch artifacts, opt-in detached implementation
worktree boundary artifacts, opt-in bounded child-run artifacts, plan-only merge
artifacts, opt-in controlled source merge evidence, opt-in non-live validation
evidence, and fixture-only live queue evidence. It does not run live AE/CEP,
change dependencies unless explicitly allowed and validated, edit product runtime
files outside planned paths, push, create PRs, or trigger GitHub automation.
`;

const VALUE_OPTIONS = new Set(["manifest"]);
const BOOLEAN_OPTIONS = new Set([
  "help",
  "json",
  "run-analysis",
  "plan-implementation",
  "run-implementation-worktrees",
  "run-implementation-child-runs",
  "apply-controlled-merge",
  "run-non-live-validation",
  "plan-merge",
  "plan-live-queue",
]);

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

function gitCurrentHead(cwd) {
  return runGit(cwd, ["rev-parse", "HEAD"], "target git head");
}

function gitCurrentBranch(cwd) {
  const result = spawnSync("git", ["symbolic-ref", "-q", "--short", "HEAD"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error("target-repo-branch-detached");
  }
  return result.stdout.trim();
}

function gitStatusEntries(cwd) {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git status failed: ${result.stderr || result.stdout}`);
  }
  return (result.stdout || "").split(/\r?\n/).filter((line) => line.trim().length > 0);
}

function statusEntryPath(entry) {
  const rawPath = entry.slice(3).trim() || entry.trim();
  const renameSeparator = " -> ";
  const normalizedPath = rawPath.includes(renameSeparator)
    ? rawPath.slice(rawPath.lastIndexOf(renameSeparator) + renameSeparator.length)
    : rawPath;
  return normalizeRepoPath(normalizedPath);
}

function gitStatusPaths(cwd) {
  return sortedNormalizedPaths(gitStatusEntries(cwd).map(statusEntryPath));
}

function assertGitTargetCleanOrOwned(cwd, state) {
  runGit(cwd, ["rev-parse", "--show-toplevel"], "target git root check");
  const dirtyEntries = gitStatusEntries(cwd);
  if (dirtyEntries.length === 0) {
    return;
  }

  const owned = new Set((state?.ownedDirtyPaths || []).map(normalizeRepoPath));
  const unowned = dirtyEntries
    .map(statusEntryPath)
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
        sharedFileOwnerFor: batch.sharedFileOwnerFor,
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

function updateSupervisorPlanForImplementationWorktrees(runRoot, manifest, manifestHash, runRootRelative, artifactPaths, batches) {
  const planPath = path.join(runRoot, "supervisor-plan.json");
  const existing = existsSync(planPath)
    ? readJsonFile(planPath, "supervisor plan")
    : createSupervisorPlan(manifest, manifestHash, runRootRelative);
  const plan = {
    ...existing,
    auxiliaryId: "AUX-020",
    status: "stopped_after_implementation_worktrees",
    stopBeforePhase: "codex_child_runs",
    implementationWorktrees: {
      schema: IMPLEMENTATION_WORKTREE_SCHEMA,
      status: "completed",
      artifacts: artifactPaths,
      batches: batches.map((batch) => ({
        id: batch.id,
        plannedPaths: batch.plannedPaths,
        promptPath: batch.promptPath,
        actualWorktreePath: batch.actualWorktreePath,
        worktreeCreated: true,
        childRunCreated: false,
      })),
      worktreesCreated: true,
      branchCreated: false,
      childRunsCreated: false,
      controlledMergeApplied: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
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
        phase: "implementation_worktrees",
        status: "written",
        artifacts: artifactPaths,
      },
      {
        phase: "codex_child_runs",
        status: "not_started",
        reason: "AUX-020 creates importer-owned detached worktrees only and stops before Codex child runs.",
      },
      {
        phase: "controlled_merge",
        status: "not_started",
        reason: "AUX-020 does not apply source merges or run validation commands.",
      },
    ],
  };
  writeJson(planPath, plan);
}

function updateSupervisorPlanForImplementationChildRuns(runRoot, manifest, manifestHash, runRootRelative, artifactPaths, batches) {
  const planPath = path.join(runRoot, "supervisor-plan.json");
  const existing = existsSync(planPath)
    ? readJsonFile(planPath, "supervisor plan")
    : createSupervisorPlan(manifest, manifestHash, runRootRelative);
  const plan = {
    ...existing,
    auxiliaryId: "AUX-021",
    status: "stopped_after_implementation_child_runs",
    stopBeforePhase: "source_merge_application",
    implementationChildRuns: {
      schema: IMPLEMENTATION_CHILD_RUN_SCHEMA,
      status: "completed",
      artifacts: artifactPaths,
      batches: batches.map((batch) => ({
        id: batch.id,
        plannedPaths: batch.plannedPaths,
        childRunIntentPath: batch.childRunIntentPath,
        childRunResultPath: batch.childRunResultPath,
        actualWorktreePath: batch.actualWorktreePath,
        exitCode: batch.exitCode,
        changedPaths: batch.changedPaths,
        plannedPathGate: batch.plannedPathGate,
      })),
      worktreesCreated: true,
      branchCreated: false,
      childRunsCreated: true,
      controlledMergeApplied: false,
      sourceMergeApplied: false,
      validationCommandsRun: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
      dependencyChanged: false,
      productRuntimeEdited: false,
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
        phase: "implementation_worktrees",
        status: "written",
        artifacts: existing.implementationWorktrees?.artifacts || [],
      },
      {
        phase: "implementation_child_runs",
        status: "written",
        artifacts: artifactPaths,
      },
      {
        phase: "source_merge_application",
        status: "not_started",
        reason: "AUX-021 runs child processes only inside importer-owned detached worktrees and stops before source merge application.",
      },
      {
        phase: "validation_commands",
        status: "not_started",
        reason: "AUX-021 captures child-run evidence only and does not run validation commands against imported changes.",
      },
    ],
  };
  writeJson(planPath, plan);
}

function updateSupervisorPlanForControlledSourceMerge(runRoot, manifest, manifestHash, runRootRelative, artifactPaths, report) {
  const planPath = path.join(runRoot, "supervisor-plan.json");
  const existing = existsSync(planPath)
    ? readJsonFile(planPath, "supervisor plan")
    : createSupervisorPlan(manifest, manifestHash, runRootRelative);
  const plan = {
    ...existing,
    auxiliaryId: "AUX-022",
    status: "stopped_after_controlled_source_merge",
    stopBeforePhase: "non_live_validation",
    controlledSourceMerge: {
      schema: CONTROLLED_SOURCE_MERGE_SCHEMA,
      status: "completed",
      artifacts: artifactPaths,
      acceptedBatchIds: report.acceptedBatchIds,
      rejectedBatchIds: report.rejectedBatchIds,
      appliedPaths: report.appliedPaths,
      ownedDirtyPaths: report.ownedDirtyPaths,
      targetHead: report.targetHeadBefore,
      targetBranch: report.targetBranch,
      worktreesCreated: true,
      branchCreated: false,
      childRunsCreated: true,
      controlledMergeApplied: true,
      sourceMergeApplied: true,
      validationCommandsRun: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
      dependencyChanged: report.dependencyChanged,
      productRuntimeEdited: false,
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
        phase: "implementation_worktrees",
        status: "written",
        artifacts: existing.implementationWorktrees?.artifacts || [],
      },
      {
        phase: "implementation_child_runs",
        status: "written",
        artifacts: existing.implementationChildRuns?.artifacts || [],
      },
      {
        phase: "source_merge_application",
        status: "written",
        artifacts: artifactPaths,
      },
      {
        phase: "non_live_validation",
        status: "not_started",
        reason: "AUX-022 applies only accepted child-run planned paths and stops before validation commands.",
      },
    ],
  };
  writeJson(planPath, plan);
}

function updateSupervisorPlanForNonLiveValidation(runRoot, manifest, manifestHash, runRootRelative, artifactPaths, report) {
  const planPath = path.join(runRoot, "supervisor-plan.json");
  const existing = existsSync(planPath)
    ? readJsonFile(planPath, "supervisor plan")
    : createSupervisorPlan(manifest, manifestHash, runRootRelative);
  const plan = {
    ...existing,
    auxiliaryId: "AUX-023",
    status: "stopped_after_non_live_validation",
    stopBeforePhase: "live_acceptance",
    nonLiveValidation: {
      schema: NON_LIVE_VALIDATION_SCHEMA,
      status: report.status,
      artifacts: artifactPaths,
      commandCount: report.commands.length,
      passedCommandCount: report.commands.filter((command) => command.status === "passed" || command.status === "skipped").length,
      touchedPaths: report.touchedPaths,
      ownedDirtyPaths: report.ownedDirtyPaths,
      validationCommandsRun: true,
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
      dependencyChanged: report.dependencyChanged,
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
        phase: "implementation_worktrees",
        status: "written",
        artifacts: existing.implementationWorktrees?.artifacts || [],
      },
      {
        phase: "implementation_child_runs",
        status: "written",
        artifacts: existing.implementationChildRuns?.artifacts || [],
      },
      {
        phase: "source_merge_application",
        status: "written",
        artifacts: existing.controlledSourceMerge?.artifacts || [],
      },
      {
        phase: "non_live_validation",
        status: "written",
        artifacts: artifactPaths,
      },
      {
        phase: "live_acceptance",
        status: "not_started",
        reason: "AUX-023 runs non-live validation only and stops before live AE/CEP acceptance.",
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

function updateSupervisorPlanForLiveQueuePlanning(runRoot, manifest, manifestHash, runRootRelative, artifactPaths, items) {
  const planPath = path.join(runRoot, "supervisor-plan.json");
  const existing = existsSync(planPath)
    ? readJsonFile(planPath, "supervisor plan")
    : createSupervisorPlan(manifest, manifestHash, runRootRelative);
  const plan = {
    ...existing,
    auxiliaryId: "AUX-019",
    status: "stopped_after_live_queue_planning",
    stopBeforePhase: "live_queue_execution",
    liveQueuePlanning: {
      schema: LIVE_QUEUE_PLAN_SCHEMA,
      status: "completed",
      artifacts: artifactPaths,
      itemIds: items.map((item) => item.id),
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
      childRunsCreated: false,
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
        artifacts: existing.mergePlanning?.artifacts || [],
      },
      {
        phase: "live_queue_planning",
        status: "written",
        artifacts: artifactPaths,
      },
      {
        phase: "live_queue_execution",
        status: "not_started",
        reason: "AUX-019 writes fixture evidence only and does not run live AE/CEP validation.",
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
  const targetHead = gitCurrentHead(targetRepo);
  const targetBranch = gitCurrentBranch(targetRepo);

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
    targetHead,
    targetBranch,
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
  const atImplementationWorktreesBoundary =
    existingState.currentPhase === "implementation_worktrees_ready" &&
    existingState.nextPhase === "implementation_child_runs";
  const atImplementationChildRunsBoundary =
    existingState.currentPhase === "implementation_child_runs_complete" &&
    existingState.nextPhase === "controlled_merge";
  const atControlledSourceMergeBoundary =
    existingState.currentPhase === "source_merged" &&
    existingState.nextPhase === "non_live_validation";
  const atNonLiveValidationBoundary =
    existingState.currentPhase === "non_live_validation_complete" &&
    existingState.nextPhase === "live_acceptance";
  const atMergePlannedBoundary =
    existingState.currentPhase === "merge_planned" &&
    existingState.nextPhase === "live_queue_planning";
  const atLiveQueuePlannedBoundary =
    existingState.currentPhase === "live_queue_planned" &&
    existingState.nextPhase === "completed";
  if (
    !atAnalysisBoundary &&
    !atImplementationBoundary &&
    !atImplementationPlannedBoundary &&
    !atImplementationWorktreesBoundary &&
    !atImplementationChildRunsBoundary &&
    !atControlledSourceMergeBoundary &&
    !atNonLiveValidationBoundary &&
    !atMergePlannedBoundary &&
    !atLiveQueuePlannedBoundary
  ) {
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
      sharedFileOwnerFor: batch.sharedFileOwnerFor,
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
      sharedFileOwnerFor: batch.sharedFileOwnerFor,
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

function implementationWorktreePathForBatch({ targetRepo, runRootRelative, batch }) {
  const plannedWorktreePath = normalizePlannedPath(batch.plannedWorktreePath || `worktrees/${safeId(batch.id)}`);
  if (!plannedWorktreePath.startsWith("worktrees/") || plannedWorktreePath === "worktrees/") {
    throw new Error(`implementation-worktree-path-not-run-owned: ${batch.id}:${plannedWorktreePath}`);
  }
  const targetRelative = normalizeRepoPath(path.posix.join(normalizeRepoPath(runRootRelative), plannedWorktreePath));
  const expectedPrefix = `${normalizeRepoPath(runRootRelative)}/worktrees/`;
  if (!targetRelative.startsWith(expectedPrefix)) {
    throw new Error(`implementation-worktree-path-not-run-owned: ${batch.id}:${targetRelative}`);
  }
  return {
    plannedWorktreePath,
    targetRelative,
    absolute: resolveInside(targetRepo, targetRelative, "implementation worktree"),
  };
}

function assertDetachedCleanWorktree(worktreePath, label) {
  if (!existsSync(worktreePath)) {
    throw new Error(`implementation-worktree-missing: ${label}`);
  }
  const inside = runGit(worktreePath, ["rev-parse", "--is-inside-work-tree"], `verify implementation worktree ${label}`).trim();
  if (inside !== "true") {
    throw new Error(`implementation-worktree-invalid: ${label}`);
  }
  const branch = spawnSync("git", ["symbolic-ref", "-q", "--short", "HEAD"], {
    cwd: worktreePath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (branch.status === 0) {
    throw new Error(`implementation-worktree-branch-created: ${label}:${branch.stdout.trim()}`);
  }
  const status = runGit(worktreePath, ["status", "--porcelain", "--untracked-files=all"], `implementation worktree status ${label}`);
  if (status.trim() !== "") {
    throw new Error(`implementation-worktree-dirty: ${label}:${status.trim()}`);
  }
}

function validateImplementationWorktreeInputs(manifest, plannedPaths, worktreePlan) {
  assertNoNamedRepoAssumptions({ manifest, plannedPaths, worktreePlan }, "implementation worktree inputs");
  if (worktreePlan.status !== "planned_only") {
    throw new Error("implementation-worktree-plan-not-plan-only");
  }
  const batches = (worktreePlan.batches || []).map((batch) => ({
    id: batch.id,
    plannedPaths: (batch.plannedPaths || []).map(normalizePlannedPath),
    sharedFileOwnerFor: Array.isArray(batch.sharedFileOwnerFor)
      ? batch.sharedFileOwnerFor.map(normalizePlannedPath)
      : [],
  }));
  if (batches.length === 0) {
    throw new Error("implementation-worktree-batch-plan-empty");
  }
  validatePlannedPaths(manifest, batches);
  validateSharedPathOwnership(manifest, batches);
}

function buildChildRunIntent(manifest, batch, worktreePath) {
  return {
    schema: "generic-repo-tool-importer.child-run-intent.v1",
    runId: manifest.run.runId,
    batchId: batch.id,
    status: "not_started",
    engine: manifest.implementation.codexCliInvocation.engine,
    sandbox: manifest.implementation.codexCliInvocation.sandbox,
    approvalPolicy: manifest.implementation.codexCliInvocation.approvalPolicy,
    webSearch: manifest.implementation.codexCliInvocation.webSearch,
    localOllama: false,
    cwd: worktreePath,
    promptPath: batch.promptPath,
    plannedPaths: batch.plannedPaths,
    commandNotRun: true,
    stopReason: "stopped_before_codex_child_runs",
  };
}

function buildImplementationWorktreeArtifacts(manifest, manifestHash, targetRepo, runRoot, runRootRelative) {
  verifyAnalysisOutputs(runRoot);
  const { plannedPaths, worktreePlan } = readImplementationPlanningOutputs(runRoot);
  validateImplementationWorktreeInputs(manifest, plannedPaths, worktreePlan);

  const batchResultRoot = path.join(runRoot, "implementation", "batch-results");
  const childIntentRoot = path.join(runRoot, "implementation", "child-run-intents");
  mkdirSync(batchResultRoot, { recursive: true });
  mkdirSync(childIntentRoot, { recursive: true });

  const artifactPaths = [...IMPLEMENTATION_WORKTREE_ARTIFACTS];
  const batches = [];
  for (const batch of worktreePlan.batches) {
    const safeBatchId = safeId(batch.id);
    const { targetRelative, absolute } = implementationWorktreePathForBatch({
      targetRepo,
      runRootRelative,
      batch,
    });
    if (existsSync(absolute)) {
      throw new Error(`implementation-worktree-path-exists: ${batch.id}:${targetRelative}`);
    }

    runGit(targetRepo, ["worktree", "add", "--detach", absolute, "HEAD"], `create implementation worktree ${batch.id}`);
    assertDetachedCleanWorktree(absolute, batch.id);

    const childIntentPath = `implementation/child-run-intents/${safeBatchId}.json`;
    const batchResultPath = `implementation/batch-results/${safeBatchId}.json`;
    writeJson(path.join(runRoot, childIntentPath), buildChildRunIntent(manifest, batch, absolute));
    writeJson(path.join(runRoot, batchResultPath), {
      schema: "generic-repo-tool-importer.implementation-batch-result.v1",
      runId: manifest.run.runId,
      manifestHash,
      batchId: batch.id,
      status: "worktree_ready",
      plannedPaths: batch.plannedPaths,
      promptPath: batch.promptPath,
      plannedWorktreePath: batch.plannedWorktreePath,
      actualWorktreePath: absolute,
      actualWorktreeRelativePath: targetRelative,
      worktreeCreated: true,
      branchCreated: false,
      childRunCreated: false,
      childRunIntentPath: childIntentPath,
      controlledMergeApplied: false,
      validationCommandsRun: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
      dependencyChanged: false,
      productRuntimeEdited: false,
    });
    artifactPaths.push(childIntentPath, batchResultPath);
    batches.push({
      id: batch.id,
      plannedPaths: batch.plannedPaths,
      promptPath: batch.promptPath,
      actualWorktreePath: absolute,
      actualWorktreeRelativePath: targetRelative,
      childRunIntentPath: childIntentPath,
      batchResultPath,
    });
  }

  writeJson(path.join(runRoot, "implementation", "worktree-run.json"), {
    schema: "generic-repo-tool-importer.implementation-worktree-run.v1",
    runId: manifest.run.runId,
    manifestHash,
    status: "worktrees_created_child_runs_not_started",
    sourceImplementationPlan: "implementation/batch-worktree-plan.json",
    sourcePlannedPaths: "implementation/planned-paths.json",
    worktreeRoot: `${normalizeRepoPath(runRootRelative)}/worktrees`,
    worktreesCreated: true,
    branchCreated: false,
    childRunsCreated: false,
    controlledMergeApplied: false,
    validationCommandsRun: false,
    liveCepAeRun: false,
    localOllamaUsed: false,
    fallbackProviderUsed: false,
    dependencyChanged: false,
    productRuntimeEdited: false,
    batches: batches.map((batch) => ({
      id: batch.id,
      plannedPaths: batch.plannedPaths,
      promptPath: batch.promptPath,
      actualWorktreePath: batch.actualWorktreePath,
      actualWorktreeRelativePath: batch.actualWorktreeRelativePath,
      childRunIntentPath: batch.childRunIntentPath,
      batchResultPath: batch.batchResultPath,
      status: "worktree_ready",
      childRunCreated: false,
    })),
    checks: {
      cleanTargetTree: "checked_before_run",
      manifestHashBinding: "passed",
      sourceReadOnly: "passed",
      plannedPathAllowlist: "passed",
      forbiddenPaths: "passed",
      dependencyChanges: manifest.implementation.dependencyChangesAllowed === true ? "explicitly_allowed" : "not_requested",
      sharedPathOwnership: "passed",
      localOllama: "rejected",
      fallbackProvider: "rejected",
      branchCreation: "detached_worktree_only",
      childRuns: "not_started",
      mergeApplication: "not_started",
      liveValidation: "not_started",
    },
  });

  return {
    artifactPaths,
    batches,
  };
}

function verifyImplementationWorktreeOutputs(runRoot, targetRepo) {
  for (const relative of IMPLEMENTATION_WORKTREE_ARTIFACTS) {
    const absolute = path.join(runRoot, relative);
    if (!existsSync(absolute)) {
      throw new Error(`implementation-worktree-output-missing: ${relative}`);
    }
    readJsonFile(absolute, relative);
  }

  const worktreeRun = readJsonFile(path.join(runRoot, "implementation", "worktree-run.json"), "implementation worktree run");
  if (worktreeRun.schema !== "generic-repo-tool-importer.implementation-worktree-run.v1") {
    throw new Error("implementation-worktree-schema-mismatch: worktree-run.json");
  }
  if (
    worktreeRun.worktreesCreated !== true ||
    worktreeRun.branchCreated !== false ||
    worktreeRun.childRunsCreated !== false ||
    worktreeRun.controlledMergeApplied !== false ||
    worktreeRun.liveCepAeRun !== false ||
    worktreeRun.localOllamaUsed !== false ||
    worktreeRun.fallbackProviderUsed !== false ||
    worktreeRun.dependencyChanged !== false ||
    worktreeRun.productRuntimeEdited !== false
  ) {
    throw new Error("implementation-worktree-boundary-violated");
  }
  for (const batch of worktreeRun.batches || []) {
    if (!batch.batchResultPath || !existsSync(path.join(runRoot, batch.batchResultPath))) {
      throw new Error(`implementation-worktree-output-missing: ${batch.batchResultPath || "batch result"}`);
    }
    if (!batch.childRunIntentPath || !existsSync(path.join(runRoot, batch.childRunIntentPath))) {
      throw new Error(`implementation-worktree-output-missing: ${batch.childRunIntentPath || "child run intent"}`);
    }
    const batchResult = readJsonFile(path.join(runRoot, batch.batchResultPath), `implementation batch result ${batch.id}`);
    if (batchResult.childRunCreated !== false || batchResult.controlledMergeApplied !== false || batchResult.liveCepAeRun !== false) {
      throw new Error(`implementation-worktree-batch-boundary-violated: ${batch.id}`);
    }
    const worktreePath = path.resolve(batch.actualWorktreePath || "");
    if (!pathStartsWith(worktreePath, targetRepo)) {
      throw new Error(`implementation-worktree-path-outside-target: ${batch.id}`);
    }
    assertDetachedCleanWorktree(worktreePath, batch.id);
  }
}

function assertDetachedWorktree(worktreePath, label) {
  if (!existsSync(worktreePath)) {
    throw new Error(`implementation-child-run-worktree-missing: ${label}`);
  }
  const inside = runGit(worktreePath, ["rev-parse", "--is-inside-work-tree"], `verify implementation child worktree ${label}`).trim();
  if (inside !== "true") {
    throw new Error(`implementation-child-run-worktree-invalid: ${label}`);
  }
  const branch = spawnSync("git", ["symbolic-ref", "-q", "--short", "HEAD"], {
    cwd: worktreePath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (branch.status === 0) {
    throw new Error(`implementation-child-run-branch-created: ${label}:${branch.stdout.trim()}`);
  }
}

function assertDetachedCleanChildRunWorktree(worktreePath, label) {
  assertDetachedWorktree(worktreePath, label);
  const status = runGit(worktreePath, ["status", "--porcelain", "--untracked-files=all"], `implementation child worktree status ${label}`);
  if (status.trim() !== "") {
    throw new Error(`implementation-child-run-worktree-not-clean: ${label}:${status.trim()}`);
  }
}

function sortedNormalizedPaths(paths) {
  return uniqueValues((paths || []).map(normalizePlannedPath)).sort((left, right) => left.localeCompare(right));
}

function sameStringSet(left, right) {
  const sortedLeft = sortedNormalizedPaths(left);
  const sortedRight = sortedNormalizedPaths(right);
  return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index]);
}

function worktreeChangedPaths(worktreePath) {
  const tracked = runGit(worktreePath, ["diff", "--name-only", "HEAD", "--"], "implementation child tracked diff")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const untracked = runGit(worktreePath, ["ls-files", "--others", "--exclude-standard"], "implementation child untracked files")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return sortedNormalizedPaths([...tracked, ...untracked]);
}

function assertRunOwnedChildWorktree({ targetRepo, runRootRelative, batch }) {
  const batchId = batch.id || batch.batchId;
  const worktreePath = path.resolve(batch.actualWorktreePath || "");
  if (!pathStartsWith(worktreePath, targetRepo)) {
    throw new Error(`implementation-child-run-worktree-outside-target: ${batchId}`);
  }
  const expectedPrefix = `${normalizeRepoPath(runRootRelative)}/worktrees/`;
  const relative = normalizeRepoPath(batch.actualWorktreeRelativePath || path.relative(targetRepo, worktreePath));
  if (!relative.startsWith(expectedPrefix)) {
    throw new Error(`implementation-child-run-worktree-not-run-owned: ${batchId}:${relative}`);
  }
  return worktreePath;
}

function validateChildRunIntent({ manifest, intent, batch, worktreePath }) {
  if (intent.schema !== "generic-repo-tool-importer.child-run-intent.v1") {
    throw new Error(`implementation-child-run-intent-schema-mismatch: ${batch.id}`);
  }
  if (intent.runId !== manifest.run.runId || intent.batchId !== batch.id) {
    throw new Error(`implementation-child-run-intent-binding-mismatch: ${batch.id}`);
  }
  if (intent.status !== "not_started" || intent.commandNotRun !== true) {
    throw new Error(`implementation-child-run-intent-already-used: ${batch.id}`);
  }
  if (intent.engine !== "codex-cli") {
    throw new Error(`implementation-child-run-engine-not-allowed: ${batch.id}`);
  }
  if (intent.sandbox !== "workspace-write") {
    throw new Error(`implementation-child-run-sandbox-not-allowed: ${batch.id}`);
  }
  if (intent.approvalPolicy !== "never") {
    throw new Error(`implementation-child-run-approval-policy-not-allowed: ${batch.id}`);
  }
  if (intent.webSearch !== "disabled") {
    throw new Error(`implementation-child-run-web-search-not-disabled: ${batch.id}`);
  }
  if (intent.localOllama !== false) {
    throw new Error(`implementation-child-run-local-ollama-not-allowed: ${batch.id}`);
  }
  if (path.resolve(intent.cwd || "") !== worktreePath) {
    throw new Error(`implementation-child-run-cwd-mismatch: ${batch.id}`);
  }
  if (intent.promptPath !== batch.promptPath) {
    throw new Error(`implementation-child-run-prompt-mismatch: ${batch.id}`);
  }
  if (!sameStringSet(intent.plannedPaths, batch.plannedPaths)) {
    throw new Error(`implementation-child-run-planned-path-mismatch: ${batch.id}`);
  }
}

function childRunTimeoutMs(manifest) {
  const configured = manifest.implementation.codexCliInvocation.timeoutMs;
  if (configured === undefined) {
    return DEFAULT_CHILD_RUN_TIMEOUT_MS;
  }
  if (!Number.isInteger(configured) || configured < 1000 || configured > MAX_CHILD_RUN_TIMEOUT_MS) {
    throw new Error("implementation-child-run-timeout-out-of-bounds");
  }
  return configured;
}

function buildChildRunPrompt(intent, promptText) {
  return [
    "AUX-021 generic repository importer child-run execution wrapper.",
    "Execute this batch now inside the already-selected detached importer-owned worktree.",
    "This wrapper supersedes older plan-only wording inside the batch prompt artifact.",
    "",
    "Hard boundaries:",
    "- Edit only the planned paths in the child-run intent.",
    "- Do not create branches, commits, extra worktrees, source merges, validation runs, live AE/CEP/CDP/OpenAI CLI planner runs, package/dependency changes, push, PR, GitHub automation, or user-asset mutations.",
    "- Do not use Local/Ollama, fallback providers, or web search.",
    "- Leave changes in this detached worktree only; the parent importer will stop before any source merge application.",
    "",
    "<child_run_intent_json>",
    JSON.stringify(intent, null, 2),
    "</child_run_intent_json>",
    "",
    promptText,
  ].join("\n");
}

function buildCodexChildRunInvocation(manifest, worktreePath) {
  const codexArgs = [
    "exec",
    "--cd",
    worktreePath,
    "--sandbox",
    "workspace-write",
    "--ephemeral",
    "-c",
    "approval_policy=\"never\"",
    "-c",
    "sandbox_workspace_write.network_access=false",
    "--disable",
    "web_search",
  ];
  if (manifest.run.defaultModel) {
    codexArgs.push("--model", manifest.run.defaultModel);
  }
  codexArgs.push("-");
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "codex", ...codexArgs],
      displayCommand: "codex",
      displayArgs: codexArgs,
    };
  }
  return {
    command: "codex",
    args: codexArgs,
    displayCommand: "codex",
    displayArgs: codexArgs,
  };
}

function resultStatusForChildRun({ changedPaths, exitCode, error, postRunHead, preRunHead, timedOut, unplannedPaths }) {
  if (timedOut) {
    return "failed_timeout";
  }
  if (error || exitCode !== 0) {
    return "failed_process";
  }
  if (postRunHead !== preRunHead) {
    return "failed_commit_created";
  }
  if (unplannedPaths.length > 0) {
    return "failed_unplanned_paths";
  }
  return changedPaths.length > 0 ? "child_run_completed" : "child_run_completed_no_changes";
}

function assertChildRunResultPassed(result) {
  if (result.status === "failed_timeout") {
    throw new Error(`implementation-child-run-timeout: ${result.batchId}`);
  }
  if (result.status === "failed_process") {
    throw new Error(`implementation-child-run-failed: ${result.batchId}`);
  }
  if (result.status === "failed_commit_created") {
    throw new Error(`implementation-child-run-commit-created: ${result.batchId}`);
  }
  if (result.status === "failed_unplanned_paths") {
    throw new Error(`implementation-child-run-unplanned-paths: ${result.batchId}:${result.unplannedPaths.join(", ")}`);
  }
}

function runImplementationChildBatch({ manifest, manifestHash, runRoot, runRootRelative, targetRepo, batch }) {
  const safeBatchId = safeId(batch.id);
  const resultRoot = path.join(runRoot, "implementation", "child-run-results");
  const logRoot = path.join(runRoot, "implementation", "child-run-logs");
  mkdirSync(resultRoot, { recursive: true });
  mkdirSync(logRoot, { recursive: true });

  const worktreePath = assertRunOwnedChildWorktree({ targetRepo, runRootRelative, batch });
  assertDetachedCleanChildRunWorktree(worktreePath, batch.id);

  const intentPath = batch.childRunIntentPath;
  if (!intentPath || !existsSync(path.join(runRoot, intentPath))) {
    throw new Error(`implementation-child-run-intent-missing: ${batch.id}`);
  }
  const intent = readJsonFile(path.join(runRoot, intentPath), `implementation child run intent ${batch.id}`);
  validateChildRunIntent({ manifest, intent, batch, worktreePath });
  const promptPath = path.join(runRoot, intent.promptPath);
  if (!existsSync(promptPath)) {
    throw new Error(`implementation-child-run-prompt-missing: ${batch.id}:${intent.promptPath}`);
  }

  const prompt = buildChildRunPrompt(intent, readFileSync(promptPath, "utf8"));
  const invocation = buildCodexChildRunInvocation(manifest, worktreePath);
  const timeoutMs = childRunTimeoutMs(manifest);
  const startedAt = new Date().toISOString();
  const preRunHead = runGit(worktreePath, ["rev-parse", "HEAD"], `implementation child pre-run head ${batch.id}`);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: worktreePath,
    input: prompt,
    encoding: "utf8",
    maxBuffer: CHILD_RUN_OUTPUT_MAX_BUFFER_BYTES,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: timeoutMs,
  });
  const completedAt = new Date().toISOString();
  assertDetachedWorktree(worktreePath, batch.id);
  const postRunHead = runGit(worktreePath, ["rev-parse", "HEAD"], `implementation child post-run head ${batch.id}`);
  const changedPaths = worktreeChangedPaths(worktreePath);
  const unplannedPaths = changedPaths.filter((changedPath) => !pathMatchesAny(changedPath, batch.plannedPaths));
  const timedOut = result.error?.code === "ETIMEDOUT";
  const stdoutPath = `implementation/child-run-logs/${safeBatchId}.stdout.txt`;
  const stderrPath = `implementation/child-run-logs/${safeBatchId}.stderr.txt`;
  writeFileSync(path.join(runRoot, stdoutPath), result.stdout || "", "utf8");
  writeFileSync(path.join(runRoot, stderrPath), result.stderr || "", "utf8");
  const stdoutSummary = streamSummary(result.stdout || "");
  const stderrSummary = streamSummary(result.stderr || "");

  const childRunResult = {
    schema: "generic-repo-tool-importer.implementation-child-run-result.v1",
    runId: manifest.run.runId,
    manifestHash,
    batchId: batch.id,
    status: resultStatusForChildRun({
      changedPaths,
      error: result.error,
      exitCode: result.status,
      postRunHead,
      preRunHead,
      timedOut,
      unplannedPaths,
    }),
    startedAt,
    completedAt,
    timeoutMs,
    plannedPaths: batch.plannedPaths,
    changedPaths,
    unplannedPaths,
    plannedPathGate: unplannedPaths.length === 0 ? "passed" : "failed",
    promptPath: intent.promptPath,
    childRunIntentPath: intentPath,
    actualWorktreePath: worktreePath,
    actualWorktreeRelativePath: batch.actualWorktreeRelativePath,
    command: {
      name: invocation.displayCommand,
      args: invocation.displayArgs,
      stdin: "batch prompt wrapper",
    },
    exitCode: result.status,
    signal: result.signal || null,
    error: result.error ? result.error.message : null,
    stdoutPath,
    stderrPath,
    stdoutBytes: stdoutSummary.bytes,
    stdoutTail: stdoutSummary.tail,
    stdoutTruncated: stdoutSummary.truncated,
    stderrBytes: stderrSummary.bytes,
    stderrTail: stderrSummary.tail,
    stderrTruncated: stderrSummary.truncated,
    preRunHead,
    postRunHead,
    preRunWorktreeClean: true,
    detachedWorktreeVerified: true,
    worktreeCreated: true,
    branchCreated: false,
    childRunCreated: true,
    controlledMergeApplied: false,
    sourceMergeApplied: false,
    validationCommandsRun: false,
    liveCepAeRun: false,
    localOllamaUsed: false,
    fallbackProviderUsed: false,
    dependencyChanged: false,
    productRuntimeEdited: false,
    pushOrPrCreated: false,
  };

  const childRunResultPath = `implementation/child-run-results/${safeBatchId}.json`;
  const childRunSummaryPath = `implementation/child-run-summaries/${safeBatchId}.result-summary.json`;
  const childRunSummary = {
    schema: "generic-repo-tool-importer.implementation-child-run-result-summary.v1",
    runId: childRunResult.runId,
    manifestHash,
    batchId: childRunResult.batchId,
    status: childRunResult.status,
    startedAt,
    completedAt,
    timeoutMs,
    plannedPaths: childRunResult.plannedPaths,
    changedPaths: childRunResult.changedPaths,
    unplannedPaths: childRunResult.unplannedPaths,
    plannedPathGate: childRunResult.plannedPathGate,
    childRunIntentPath: childRunResult.childRunIntentPath,
    childRunResultPath,
    actualWorktreePath: childRunResult.actualWorktreePath,
    actualWorktreeRelativePath: childRunResult.actualWorktreeRelativePath,
    exitCode: childRunResult.exitCode,
    signal: childRunResult.signal,
    error: childRunResult.error,
    stdoutPath,
    stderrPath,
    stdout: stdoutSummary,
    stderr: stderrSummary,
    preRunHead,
    postRunHead,
    preRunWorktreeClean: true,
    detachedWorktreeVerified: true,
    worktreeCreated: true,
    branchCreated: false,
    childRunCreated: true,
    controlledMergeApplied: false,
    sourceMergeApplied: false,
    validationCommandsRun: false,
    liveCepAeRun: false,
    localOllamaUsed: false,
    fallbackProviderUsed: false,
    dependencyChanged: false,
    productRuntimeEdited: false,
    pushOrPrCreated: false,
  };
  mkdirSync(path.dirname(path.join(runRoot, childRunSummaryPath)), { recursive: true });
  writeJson(path.join(runRoot, childRunSummaryPath), childRunSummary);
  if (statSync(path.join(runRoot, childRunSummaryPath)).size > CHILD_RUN_SUMMARY_MAX_BYTES) {
    throw new Error(`implementation-child-run-summary-too-large: ${batch.id}`);
  }
  childRunResult.resultSummaryPath = childRunSummaryPath;
  writeJson(path.join(runRoot, childRunResultPath), childRunResult);
  assertChildRunResultPassed(childRunResult);
  return { ...childRunResult, childRunResultPath, resultSummaryPath: childRunSummaryPath };
}

function buildImplementationChildRunArtifacts(manifest, manifestHash, targetRepo, runRoot, runRootRelative) {
  verifyAnalysisOutputs(runRoot);
  verifyImplementationPlanningOutputs(runRoot);
  verifyImplementationWorktreeOutputs(runRoot, targetRepo);

  const worktreeRun = readJsonFile(path.join(runRoot, "implementation", "worktree-run.json"), "implementation worktree run");
  if (!Array.isArray(worktreeRun.batches) || worktreeRun.batches.length === 0) {
    throw new Error("implementation-child-run-batch-plan-empty");
  }

  const artifactPaths = [...IMPLEMENTATION_CHILD_RUN_ARTIFACTS];
  const batches = [];
  for (const batch of worktreeRun.batches) {
    const childResult = runImplementationChildBatch({
      manifest,
      manifestHash,
      runRoot,
      runRootRelative,
      targetRepo,
      batch,
    });
    artifactPaths.push(childResult.childRunResultPath, childResult.resultSummaryPath, childResult.stdoutPath, childResult.stderrPath);
    batches.push(childResult);
  }

  writeJson(path.join(runRoot, "implementation", "child-run-run.json"), {
    schema: IMPLEMENTATION_CHILD_RUN_SCHEMA,
    runId: manifest.run.runId,
    manifestHash,
    status: "child_runs_completed_source_merge_not_started",
    sourceImplementationWorktreeRun: "implementation/worktree-run.json",
    worktreesCreated: true,
    branchCreated: false,
    childRunsCreated: true,
    controlledMergeApplied: false,
    sourceMergeApplied: false,
    validationCommandsRun: false,
    liveCepAeRun: false,
    localOllamaUsed: false,
    fallbackProviderUsed: false,
    dependencyChanged: false,
    productRuntimeEdited: false,
    pushOrPrCreated: false,
    batches: batches.map((batch) => ({
      id: batch.batchId,
      status: batch.status,
      plannedPaths: batch.plannedPaths,
      changedPaths: batch.changedPaths,
      unplannedPaths: batch.unplannedPaths,
      plannedPathGate: batch.plannedPathGate,
      childRunIntentPath: batch.childRunIntentPath,
      childRunResultPath: batch.childRunResultPath,
      resultSummaryPath: batch.resultSummaryPath,
      actualWorktreePath: batch.actualWorktreePath,
      actualWorktreeRelativePath: batch.actualWorktreeRelativePath,
      exitCode: batch.exitCode,
      stdoutPath: batch.stdoutPath,
      stderrPath: batch.stderrPath,
      stdoutBytes: batch.stdoutBytes,
      stderrBytes: batch.stderrBytes,
    })),
    checks: {
      manifestHashBinding: "passed",
      sourceReadOnly: "passed",
      preRunWorktreeClean: "passed",
      detachedImporterOwnedWorktrees: "passed",
      plannedPathGate: "passed",
      branchCreation: "not_created",
      commits: "not_created",
      sourceMergeApplication: "not_started",
      validationCommands: "not_started",
      liveValidation: "not_started",
      localOllama: "rejected",
      fallbackProvider: "rejected",
    },
  });

  return { artifactPaths, batches };
}

function verifyImplementationChildRunOutputs(runRoot, targetRepo, runRootRelative) {
  for (const relative of IMPLEMENTATION_CHILD_RUN_ARTIFACTS) {
    const absolute = path.join(runRoot, relative);
    if (!existsSync(absolute)) {
      throw new Error(`implementation-child-run-output-missing: ${relative}`);
    }
    readJsonFile(absolute, relative);
  }

  const childRun = readJsonFile(path.join(runRoot, "implementation", "child-run-run.json"), "implementation child run");
  if (childRun.schema !== IMPLEMENTATION_CHILD_RUN_SCHEMA) {
    throw new Error("implementation-child-run-schema-mismatch: child-run-run.json");
  }
  if (
    childRun.worktreesCreated !== true ||
    childRun.branchCreated !== false ||
    childRun.childRunsCreated !== true ||
    childRun.controlledMergeApplied !== false ||
    childRun.sourceMergeApplied !== false ||
    childRun.validationCommandsRun !== false ||
    childRun.liveCepAeRun !== false ||
    childRun.localOllamaUsed !== false ||
    childRun.fallbackProviderUsed !== false ||
    childRun.dependencyChanged !== false ||
    childRun.productRuntimeEdited !== false ||
    childRun.pushOrPrCreated !== false
  ) {
    throw new Error("implementation-child-run-boundary-violated");
  }
  for (const batch of childRun.batches || []) {
    if (!batch.childRunResultPath || !existsSync(path.join(runRoot, batch.childRunResultPath))) {
      throw new Error(`implementation-child-run-output-missing: ${batch.childRunResultPath || "child run result"}`);
    }
    const childResult = readJsonFile(path.join(runRoot, batch.childRunResultPath), `implementation child run result ${batch.id}`);
    if (
      !["child_run_completed", "child_run_completed_no_changes"].includes(childResult.status) ||
      childResult.childRunCreated !== true ||
      childResult.controlledMergeApplied !== false ||
      childResult.sourceMergeApplied !== false ||
      childResult.validationCommandsRun !== false ||
      childResult.liveCepAeRun !== false ||
      childResult.localOllamaUsed !== false ||
      childResult.fallbackProviderUsed !== false ||
      childResult.pushOrPrCreated !== false
    ) {
      throw new Error(`implementation-child-run-result-boundary-violated: ${batch.id}`);
    }
    const worktreePath = assertRunOwnedChildWorktree({ targetRepo, runRootRelative, batch: childResult });
    assertDetachedWorktree(worktreePath, batch.id);
    const currentHead = runGit(worktreePath, ["rev-parse", "HEAD"], `implementation child resume head ${batch.id}`);
    if (currentHead !== childResult.preRunHead || childResult.postRunHead !== childResult.preRunHead) {
      throw new Error(`implementation-child-run-commit-created: ${batch.id}`);
    }
    const currentChangedPaths = worktreeChangedPaths(worktreePath);
    if (!sameStringSet(currentChangedPaths, childResult.changedPaths)) {
      throw new Error(`implementation-child-run-changed-paths-drift: ${batch.id}`);
    }
    const unplannedPaths = currentChangedPaths.filter((changedPath) => !pathMatchesAny(changedPath, childResult.plannedPaths));
    if (unplannedPaths.length > 0) {
      throw new Error(`implementation-child-run-unplanned-paths: ${batch.id}:${unplannedPaths.join(", ")}`);
    }
  }
}

function readImplementationChildRunOutputs(runRoot, targetRepo, runRootRelative) {
  verifyImplementationChildRunOutputs(runRoot, targetRepo, runRootRelative);
  const childRun = readJsonFile(path.join(runRoot, "implementation", "child-run-run.json"), "implementation child run");
  const results = (childRun.batches || []).map((batch) =>
    readJsonFile(path.join(runRoot, batch.childRunResultPath), `implementation child run result ${batch.id}`),
  );
  return { childRun, results };
}

function batchSharedPathOwner(manifest, worktreePlan, plannedPath) {
  const manifestOwner = manifest.implementation.sharedFileOwners?.[plannedPath];
  if (manifestOwner) {
    return manifestOwner;
  }
  const ownerBatch = (worktreePlan.batches || []).find((batch) =>
    Array.isArray(batch.sharedFileOwnerFor) && batch.sharedFileOwnerFor.map(normalizePlannedPath).includes(plannedPath),
  );
  return ownerBatch?.id || null;
}

function copyControlledPathFromWorktree({ targetRepo, worktreePath, relativePath }) {
  const normalized = normalizePlannedPath(relativePath);
  const sourcePath = resolveInside(worktreePath, normalized, "controlled merge source path");
  const targetPath = resolveInside(targetRepo, normalized, "controlled merge target path");
  const sourceExists = existsSync(sourcePath);
  const targetExistsBefore = existsSync(targetPath);
  if (!sourceExists) {
    rmSync(targetPath, { force: true, recursive: true });
    return {
      path: normalized,
      operation: targetExistsBefore ? "deleted" : "missing_noop",
      sourceExists,
      targetExistedBefore: targetExistsBefore,
    };
  }

  const sourceStat = statSync(sourcePath);
  if (!sourceStat.isFile()) {
    throw new Error(`controlled-merge-source-path-not-file: ${normalized}`);
  }
  mkdirSync(path.dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
  return {
    path: normalized,
    operation: targetExistsBefore ? "updated" : "created",
    sourceExists,
    targetExistedBefore: targetExistsBefore,
    bytes: sourceStat.size,
  };
}

function buildControlledSourceMergeArtifacts({ manifest, manifestHash, targetRepo, runRoot, runRootRelative, state }) {
  verifyAnalysisOutputs(runRoot);
  const { worktreePlan } = readImplementationPlanningOutputs(runRoot);
  validateMergeSharedPathOwnership(manifest, worktreePlan);
  const { childRun, results } = readImplementationChildRunOutputs(runRoot, targetRepo, runRootRelative);
  assertNoNamedRepoAssumptions({ manifest, worktreePlan, childRun, results }, "controlled source merge inputs");
  assertGitTargetCleanOrOwned(targetRepo, { ownedDirtyPaths: [] });

  const targetHeadBefore = gitCurrentHead(targetRepo);
  const targetBranch = gitCurrentBranch(targetRepo);
  if (!state.targetBranch) {
    throw new Error("controlled-merge-target-branch-baseline-missing");
  }
  if (targetBranch !== state.targetBranch) {
    throw new Error(`controlled-merge-target-branch-drift: expected ${state.targetBranch} actual ${targetBranch}`);
  }

  const resultByBatchId = new Map(results.map((result) => [result.batchId, result]));
  const accepted = [];
  const rejected = [];
  const pathOccurrences = new Map();

  for (const batch of worktreePlan.batches || []) {
    const result = resultByBatchId.get(batch.id);
    if (!result) {
      throw new Error(`controlled-merge-child-result-missing: ${batch.id}`);
    }
    if (result.preRunHead !== targetHeadBefore) {
      throw new Error(`controlled-merge-target-head-drift: ${batch.id}`);
    }
    const worktreePath = assertRunOwnedChildWorktree({ targetRepo, runRootRelative, batch: result });
    const worktreeHead = runGit(worktreePath, ["rev-parse", "HEAD"], `controlled merge child head ${batch.id}`);
    if (worktreeHead !== result.preRunHead || result.postRunHead !== result.preRunHead) {
      throw new Error(`controlled-merge-child-head-drift: ${batch.id}`);
    }
    assertDetachedWorktree(worktreePath, batch.id);
    if (result.plannedPathGate !== "passed" || (result.unplannedPaths || []).length > 0) {
      throw new Error(`controlled-merge-child-unplanned-paths: ${batch.id}`);
    }

    const changedPaths = sortedNormalizedPaths(result.changedPaths || []);
    for (const changedPath of changedPaths) {
      const current = pathOccurrences.get(changedPath) || [];
      current.push(batch.id);
      pathOccurrences.set(changedPath, current);
    }
    accepted.push({
      id: batch.id,
      status: "accepted",
      childRunStatus: result.status,
      plannedPaths: (batch.plannedPaths || []).map(normalizePlannedPath),
      changedPaths,
      childRunResultPath: result.childRunResultPath,
      actualWorktreePath: result.actualWorktreePath,
      actualWorktreeRelativePath: result.actualWorktreeRelativePath,
    });
  }

  validateBatchResultPaths(
    manifest,
    worktreePlan,
    accepted.map((batch) => ({
      id: batch.id,
      status: "child_run_completed",
      validationStatus: "passed",
      changedPaths: batch.changedPaths,
    })),
  );

  const skippedPaths = [];
  const operations = [];
  const appliedPaths = [];
  for (const batch of accepted) {
    for (const changedPath of batch.changedPaths) {
      const occurrences = pathOccurrences.get(changedPath) || [];
      const owner = occurrences.length > 1 ? batchSharedPathOwner(manifest, worktreePlan, changedPath) : null;
      if (owner && owner !== batch.id) {
        skippedPaths.push({
          batchId: batch.id,
          path: changedPath,
          reason: `shared_path_owned_by:${owner}`,
        });
        continue;
      }
      if (occurrences.length > 1 && !owner) {
        throw new Error(`controlled-merge-shared-path-owner-missing: ${changedPath}`);
      }
      const operation = copyControlledPathFromWorktree({
        targetRepo,
        worktreePath: batch.actualWorktreePath,
        relativePath: changedPath,
      });
      operations.push({
        batchId: batch.id,
        ...operation,
      });
      if (operation.operation !== "missing_noop") {
        appliedPaths.push(changedPath);
      }
    }
  }

  const ownedDirtyPaths = gitStatusPaths(targetRepo);
  const unownedDirtyPaths = ownedDirtyPaths.filter((dirtyPath) => !appliedPaths.includes(dirtyPath));
  if (unownedDirtyPaths.length > 0) {
    throw new Error(`controlled-merge-unowned-dirty-paths-after-apply: ${unownedDirtyPaths.join(", ")}`);
  }

  const dependencyChanged = ownedDirtyPaths.some(isDependencyPath);
  const mergeRoot = path.join(runRoot, "merge");
  mkdirSync(mergeRoot, { recursive: true });

  const baseReport = {
    schema: CONTROLLED_SOURCE_MERGE_SCHEMA,
    runId: manifest.run.runId,
    manifestHash,
    status: "applied",
    sourceImplementationChildRun: "implementation/child-run-run.json",
    targetRepo,
    targetBranch,
    targetHeadBefore,
    targetHeadAfter: gitCurrentHead(targetRepo),
    acceptedBatchIds: accepted.map((batch) => batch.id),
    rejectedBatchIds: rejected.map((batch) => batch.id),
    acceptedBatches: accepted,
    rejectedBatches: rejected,
    appliedPaths: sortedNormalizedPaths(appliedPaths),
    skippedPaths,
    ownedDirtyPaths,
    operations,
    worktreesCreated: true,
    branchCreated: false,
    childRunsCreated: true,
    controlledMergeApplied: true,
    sourceMergeApplied: true,
    validationCommandsRun: false,
    liveCepAeRun: false,
    localOllamaUsed: false,
    fallbackProviderUsed: false,
    dependencyChanged,
    productRuntimeEdited: false,
    pushOrPrCreated: false,
    checks: {
      targetCleanBeforeApply: "passed",
      manifestHashBinding: "passed",
      childRunEvidence: "passed",
      targetHeadDrift: "passed",
      targetBranchDrift: "passed",
      plannedPathsOnly: "passed",
      forbiddenPaths: "passed",
      dependencyChanges: dependencyChanged ? "explicitly_allowed_and_applied" : "not_requested",
      dirtyTreeOwnership: "passed",
      validationCommands: "not_started",
      liveValidation: "not_started",
    },
  };

  writeJson(path.join(mergeRoot, "controlled-source-merge-plan.json"), {
    ...baseReport,
    status: "planned_for_application",
    controlledMergeApplied: false,
    sourceMergeApplied: false,
    validationCommandsRun: false,
    operations: operations.map((operation) => ({
      batchId: operation.batchId,
      path: operation.path,
      plannedOperation: operation.operation,
    })),
  });
  writeJson(path.join(mergeRoot, "controlled-source-merge-report.json"), baseReport);

  return {
    artifactPaths: [...CONTROLLED_SOURCE_MERGE_ARTIFACTS],
    report: baseReport,
  };
}

function verifyControlledSourceMergeOutputs(runRoot, targetRepo, state) {
  for (const relative of CONTROLLED_SOURCE_MERGE_ARTIFACTS) {
    const absolute = path.join(runRoot, relative);
    if (!existsSync(absolute)) {
      throw new Error(`controlled-merge-output-missing: ${relative}`);
    }
    readJsonFile(absolute, relative);
  }
  const report = readJsonFile(path.join(runRoot, "merge", "controlled-source-merge-report.json"), "controlled source merge report");
  if (report.schema !== CONTROLLED_SOURCE_MERGE_SCHEMA) {
    throw new Error("controlled-merge-schema-mismatch: controlled-source-merge-report.json");
  }
  if (
    report.controlledMergeApplied !== true ||
    report.sourceMergeApplied !== true ||
    report.validationCommandsRun !== false ||
    report.liveCepAeRun !== false ||
    report.localOllamaUsed !== false ||
    report.fallbackProviderUsed !== false ||
    report.pushOrPrCreated !== false
  ) {
    throw new Error("controlled-merge-boundary-violated");
  }
  if (state?.ownedDirtyPaths && !sameStringSet(gitStatusPaths(targetRepo), state.ownedDirtyPaths)) {
    throw new Error("controlled-merge-owned-dirty-paths-drift");
  }
  return report;
}

function shellCommandForPlatform(command) {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", command],
    };
  }
  return {
    command: "/bin/sh",
    args: ["-lc", command],
  };
}

function quoteShellPath(value) {
  const raw = normalizeRepoPath(value);
  if (/^[A-Za-z0-9_./:-]+$/.test(raw)) {
    return raw;
  }
  if (process.platform === "win32") {
    return `"${raw.replace(/"/g, '\\"')}"`;
  }
  return `'${raw.replace(/'/g, "'\\''")}'`;
}

function textSummary(value, limit = 2000) {
  const text = String(value || "");
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars]`;
}

function tailLines(value, maxLines = 40, maxChars = 4000) {
  const text = String(value || "").trimEnd();
  if (!text) return "";
  const tail = text.split(/\r?\n/).slice(-maxLines).join("\n").trim();
  return tail.length > maxChars ? tail.slice(tail.length - maxChars) : tail;
}

function streamSummary(value, maxLines = 40) {
  const text = String(value || "");
  const trimmed = text.trimEnd();
  const lineCount = trimmed ? trimmed.split(/\r?\n/).length : 0;
  return {
    bytes: Buffer.byteLength(text, "utf8"),
    lineCount,
    tail: tailLines(text, maxLines),
    tailLineCount: Math.min(lineCount, maxLines),
    truncated: lineCount > maxLines,
  };
}

function fileSnapshot(targetRepo, relativePath) {
  const absolute = resolveInside(targetRepo, relativePath, "validation snapshot path");
  if (!existsSync(absolute)) {
    return {
      path: relativePath,
      exists: false,
      sha256: null,
      bytes: 0,
    };
  }
  const stat = statSync(absolute);
  if (!stat.isFile()) {
    return {
      path: relativePath,
      exists: true,
      sha256: "non-file",
      bytes: 0,
    };
  }
  const bytes = readFileSync(absolute);
  return {
    path: relativePath,
    exists: true,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
}

function snapshotPaths(targetRepo, paths) {
  return sortedNormalizedPaths(paths).map((relativePath) => fileSnapshot(targetRepo, relativePath));
}

function sameSnapshots(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function expandNonLiveCommands(commands, touchedPaths) {
  const touchedJs = sortedNormalizedPaths(touchedPaths.filter((entry) => /\.(?:cjs|mjs|js)$/i.test(entry)));
  const expanded = [];
  for (const command of commands || []) {
    requireString(command, "manifest.validation.nonLiveCommands[]");
    if (command.includes("<touched-js-files>")) {
      if (touchedJs.length === 0) {
        expanded.push({
          sourceCommand: command,
          command: command.replace("<touched-js-files>", ""),
          status: "skipped",
          reason: "no_touched_js_files",
        });
        continue;
      }
      for (const touchedJsPath of touchedJs) {
        expanded.push({
          sourceCommand: command,
          command: command.replace("<touched-js-files>", quoteShellPath(touchedJsPath)),
          touchedPath: touchedJsPath,
        });
      }
      continue;
    }
    expanded.push({
      sourceCommand: command,
      command,
    });
  }
  return expanded;
}

function runNonLiveCommand({ commandSpec, index, targetRepo, logRoot, logRootRelative }) {
  const startedAt = new Date().toISOString();
  const stdoutPath = `${logRootRelative}/${String(index + 1).padStart(2, "0")}-stdout.txt`;
  const stderrPath = `${logRootRelative}/${String(index + 1).padStart(2, "0")}-stderr.txt`;
  if (commandSpec.status === "skipped") {
    writeFileSync(path.join(logRoot, `${String(index + 1).padStart(2, "0")}-stdout.txt`), "", "utf8");
    writeFileSync(path.join(logRoot, `${String(index + 1).padStart(2, "0")}-stderr.txt`), commandSpec.reason || "skipped", "utf8");
    return {
      ...commandSpec,
      index: index + 1,
      cwd: targetRepo,
      startedAt,
      completedAt: new Date().toISOString(),
      exitCode: null,
      status: "skipped",
      stdoutPath,
      stderrPath,
      stdoutSummary: "",
      stderrSummary: commandSpec.reason || "skipped",
    };
  }

  const invocation = shellCommandForPlatform(commandSpec.command);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: targetRepo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: CHILD_RUN_OUTPUT_MAX_BUFFER_BYTES,
  });
  const completedAt = new Date().toISOString();
  writeFileSync(path.join(logRoot, `${String(index + 1).padStart(2, "0")}-stdout.txt`), result.stdout || "", "utf8");
  writeFileSync(path.join(logRoot, `${String(index + 1).padStart(2, "0")}-stderr.txt`), result.stderr || "", "utf8");
  return {
    ...commandSpec,
    index: index + 1,
    cwd: targetRepo,
    startedAt,
    completedAt,
    exitCode: result.status,
    signal: result.signal || null,
    error: result.error ? result.error.message : null,
    status: result.status === 0 && !result.error ? "passed" : "failed",
    stdoutPath,
    stderrPath,
    stdoutSummary: textSummary(result.stdout || ""),
    stderrSummary: textSummary(result.stderr || ""),
  };
}

function buildNonLiveValidationArtifacts({ manifest, manifestHash, targetRepo, runRoot, state }) {
  const mergeReport = verifyControlledSourceMergeOutputs(runRoot, targetRepo, state);
  const touchedPaths = sortedNormalizedPaths(mergeReport.ownedDirtyPaths || mergeReport.appliedPaths || []);
  assertGitTargetCleanOrOwned(targetRepo, state);
  if (!sameStringSet(gitStatusPaths(targetRepo), touchedPaths)) {
    throw new Error("non-live-validation-target-dirty-paths-drift");
  }

  const validationRoot = path.join(runRoot, "validation");
  const logRootRelative = "validation/non-live-logs";
  const logRoot = path.join(runRoot, logRootRelative);
  mkdirSync(logRoot, { recursive: true });
  const beforeSnapshot = snapshotPaths(targetRepo, touchedPaths);
  const expandedCommands = expandNonLiveCommands(manifest.validation.nonLiveCommands || [], touchedPaths);
  const commandResults = [];

  for (let index = 0; index < expandedCommands.length; index += 1) {
    const commandResult = runNonLiveCommand({
      commandSpec: expandedCommands[index],
      index,
      targetRepo,
      logRoot,
      logRootRelative,
    });
    commandResults.push(commandResult);
    assertGitTargetCleanOrOwned(targetRepo, state);
    if (commandResult.status === "failed") {
      break;
    }
  }

  const afterSnapshot = snapshotPaths(targetRepo, touchedPaths);
  const dirtyPathsAfter = gitStatusPaths(targetRepo);
  const snapshotUnchanged = sameSnapshots(beforeSnapshot, afterSnapshot);
  const commandsPassed = commandResults.every((command) => command.status === "passed" || command.status === "skipped");
  const dirtyPathsStable = sameStringSet(dirtyPathsAfter, touchedPaths);
  const status = commandsPassed && snapshotUnchanged && dirtyPathsStable ? "passed" : "failed";
  const report = {
    schema: NON_LIVE_VALIDATION_SCHEMA,
    runId: manifest.run.runId,
    manifestHash,
    status,
    sourceControlledMergeReport: "merge/controlled-source-merge-report.json",
    targetRepo,
    touchedPaths,
    ownedDirtyPaths: dirtyPathsAfter,
    commands: commandResults,
    beforeSnapshot,
    afterSnapshot,
    validationCommandsRun: true,
    liveCepAeRun: false,
    localOllamaUsed: false,
    fallbackProviderUsed: false,
    dependencyChanged: mergeReport.dependencyChanged === true,
    productRuntimeEdited: false,
    pushOrPrCreated: false,
    checks: {
      controlledMergeEvidence: "passed",
      dirtyTreeOwnership: dirtyPathsStable ? "passed" : "failed",
      commandExitCodes: commandsPassed ? "passed" : "failed",
      validationDidNotModifyImportedFiles: snapshotUnchanged ? "passed" : "failed",
      liveValidation: "not_started",
    },
  };
  writeJson(path.join(validationRoot, "non-live-report.json"), report);
  if (status !== "passed") {
    throw new Error("non-live-validation-failed");
  }
  return {
    artifactPaths: [
      ...NON_LIVE_VALIDATION_ARTIFACTS,
      ...commandResults.flatMap((command) => [command.stdoutPath, command.stderrPath]),
    ],
    report,
  };
}

function verifyNonLiveValidationOutputs(runRoot, targetRepo, state) {
  for (const relative of NON_LIVE_VALIDATION_ARTIFACTS) {
    const absolute = path.join(runRoot, relative);
    if (!existsSync(absolute)) {
      throw new Error(`non-live-validation-output-missing: ${relative}`);
    }
    readJsonFile(absolute, relative);
  }
  const report = readJsonFile(path.join(runRoot, "validation", "non-live-report.json"), "non-live validation report");
  if (report.schema !== NON_LIVE_VALIDATION_SCHEMA) {
    throw new Error("non-live-validation-schema-mismatch: non-live-report.json");
  }
  if (
    report.status !== "passed" ||
    report.validationCommandsRun !== true ||
    report.liveCepAeRun !== false ||
    report.localOllamaUsed !== false ||
    report.fallbackProviderUsed !== false ||
    report.pushOrPrCreated !== false
  ) {
    throw new Error("non-live-validation-boundary-violated");
  }
  assertGitTargetCleanOrOwned(targetRepo, state);
  if (state?.ownedDirtyPaths && !sameStringSet(gitStatusPaths(targetRepo), state.ownedDirtyPaths)) {
    throw new Error("non-live-validation-owned-dirty-paths-drift");
  }
  return report;
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

function readMergePlanningOutputs(runRoot) {
  verifyMergePlanningOutputs(runRoot);
  const mergePlan = readJsonFile(path.join(runRoot, "merge", "supervisor-merge-plan.json"), "merge supervisor plan");
  const accepted = readJsonFile(path.join(runRoot, "merge", "accepted-batches.json"), "accepted batches");
  const rejected = readJsonFile(path.join(runRoot, "merge", "rejected-batches.json"), "rejected batches");
  return { mergePlan, accepted, rejected };
}

function buildLiveQueueItems(acceptedBatches) {
  const batches = Array.isArray(acceptedBatches.batches) ? acceptedBatches.batches : [];
  if (batches.length === 0) {
    throw new Error("live-queue-no-accepted-batches");
  }
  return batches.map((batch) => ({
    id: `live-${safeId(batch.id, "batch")}`,
    batchId: batch.id,
    changedPaths: (batch.changedPaths || []).map(normalizePlannedPath),
    generatedPrefix: `generic-importer-${safeId(batch.id, "batch")}`,
  }));
}

function liveQueueFixtureEvidence(manifest) {
  const evidence = manifest.liveAcceptance.fixtureEvidence || {};
  const providerPath = evidence.providerPath || manifest.liveAcceptance.providerPath;
  assertNoLocalOllamaProvider(providerPath, "manifest.liveAcceptance.fixtureEvidence.providerPath");
  if (evidence.fallbackProviderUsed === true) {
    throw new Error("fallback-provider-evidence-rejected");
  }
  if (evidence.lockAvailable === false) {
    throw new Error("live-lock-not-available");
  }
  if (evidence.m100ProposalMissing === true) {
    throw new Error("m100-proposal-missing");
  }
  if (evidence.readBackMissing === true) {
    throw new Error("read-back-missing");
  }
  if (evidence.cleanupProofMissing === true) {
    throw new Error("generated-prefix-cleanup-proof-missing");
  }
  if (Array.isArray(evidence.cleanupLeftovers) && evidence.cleanupLeftovers.length > 0) {
    throw new Error("generated-prefix-cleanup-leftovers");
  }
  const semanticStatus = evidence.semanticStatus || "passed";
  if (semanticStatus !== "passed") {
    throw new Error(`semantic-verification-not-passed: ${semanticStatus}`);
  }
  return { ...evidence, providerPath, semanticStatus };
}

function validateLiveQueueEvidenceForItem(item, evidence) {
  const proposalId = evidence.proposalId || `m100-${item.id}`;
  const dryRunProposalId = evidence.dryRunProposalId || proposalId;
  if (dryRunProposalId !== proposalId) {
    throw new Error(`dry-run-proposal-mismatch: ${item.id}`);
  }
  const confirmedProposalId = evidence.confirmedProposalId || proposalId;
  if (confirmedProposalId !== proposalId) {
    throw new Error(`confirmed-run-proposal-mismatch: ${item.id}`);
  }
  return {
    proposalId,
    dryRunId: evidence.dryRunId || `dry-${item.id}`,
    confirmedRunId: evidence.confirmedRunId || `confirmed-${item.id}`,
  };
}

function buildLiveQueuePlanningArtifacts(manifest, manifestHash, runRoot) {
  verifyAnalysisOutputs(runRoot);
  verifyImplementationPlanningOutputs(runRoot);
  const { mergePlan, accepted, rejected } = readMergePlanningOutputs(runRoot);
  assertNoNamedRepoAssumptions({ manifest, mergePlan, accepted, rejected }, "live queue planning inputs");
  const evidence = liveQueueFixtureEvidence(manifest);
  const items = buildLiveQueueItems(accepted);

  const liveQueueRoot = path.join(runRoot, "live-queue");
  const lockRoot = path.join(runRoot, "locks");
  mkdirSync(liveQueueRoot, { recursive: true });
  mkdirSync(lockRoot, { recursive: true });

  writeJson(path.join(lockRoot, "live-ae-cep.lock"), {
    schema: "generic-repo-tool-importer.live-lock-fixture.v1",
    runId: manifest.run.runId,
    manifestHash,
    status: "fixture_available",
    lockPath: "locks/live-ae-cep.lock",
    actualLockAcquired: false,
    liveCepAeRun: false,
  });

  const artifactPaths = [...LIVE_QUEUE_ROOT_ARTIFACTS];
  const queueItems = [];
  for (const item of items) {
    const ids = validateLiveQueueEvidenceForItem(item, evidence);
    const itemRoot = path.join(liveQueueRoot, item.id);
    mkdirSync(itemRoot, { recursive: true });
    const itemArtifacts = [
      `live-queue/${item.id}/m100-proposal.json`,
      `live-queue/${item.id}/dry-run.json`,
      `live-queue/${item.id}/confirmed-run.json`,
      `live-queue/${item.id}/read-back.json`,
      `live-queue/${item.id}/semantic-verification.json`,
      `live-queue/${item.id}/cleanup-proof.json`,
    ];
    artifactPaths.push(...itemArtifacts);

    writeJson(path.join(itemRoot, "m100-proposal.json"), {
      schema: "generic-repo-tool-importer.live-m100-proposal.v1",
      runId: manifest.run.runId,
      itemId: item.id,
      batchId: item.batchId,
      proposalId: ids.proposalId,
      providerPath: evidence.providerPath,
      generatedOnly: true,
      m100ProposalPresent: true,
      liveCepAeRun: false,
    });
    writeJson(path.join(itemRoot, "dry-run.json"), {
      schema: "generic-repo-tool-importer.live-dry-run.v1",
      runId: manifest.run.runId,
      itemId: item.id,
      dryRunId: ids.dryRunId,
      proposalId: ids.proposalId,
      status: "passed",
      matchesProposal: true,
      liveCepAeRun: false,
    });
    writeJson(path.join(itemRoot, "confirmed-run.json"), {
      schema: "generic-repo-tool-importer.live-confirmed-run.v1",
      runId: manifest.run.runId,
      itemId: item.id,
      confirmedRunId: ids.confirmedRunId,
      dryRunId: ids.dryRunId,
      proposalId: ids.proposalId,
      status: "fixture_confirmed",
      matchesProposal: true,
      mutationApplied: false,
      liveCepAeRun: false,
    });
    writeJson(path.join(itemRoot, "read-back.json"), {
      schema: "generic-repo-tool-importer.live-read-back.v1",
      runId: manifest.run.runId,
      itemId: item.id,
      status: "present",
      changedPaths: item.changedPaths,
      generatedPrefix: item.generatedPrefix,
      liveCepAeRun: false,
    });
    writeJson(path.join(itemRoot, "semantic-verification.json"), {
      schema: "generic-repo-tool-importer.live-semantic-verification.v1",
      runId: manifest.run.runId,
      itemId: item.id,
      status: "passed",
      outcomeVerification: "passed",
      liveCepAeRun: false,
    });
    writeJson(path.join(itemRoot, "cleanup-proof.json"), {
      schema: "generic-repo-tool-importer.live-cleanup-proof.v1",
      runId: manifest.run.runId,
      itemId: item.id,
      status: "passed",
      generatedPrefix: item.generatedPrefix,
      leftovers: [],
      liveCepAeRun: false,
    });
    queueItems.push({
      ...item,
      proposalId: ids.proposalId,
      dryRunId: ids.dryRunId,
      confirmedRunId: ids.confirmedRunId,
      artifacts: itemArtifacts,
      status: "fixture_evidence_ready",
    });
  }

  writeJson(path.join(liveQueueRoot, "queue.json"), {
    schema: "generic-repo-tool-importer.live-queue.v1",
    runId: manifest.run.runId,
    manifestHash,
    status: "planned_only",
    lockPath: "locks/live-ae-cep.lock",
    items: queueItems,
    checks: {
      lockArtifact: "fixture_available",
      m100Proposal: "present",
      dryRunProposalMatch: "passed",
      confirmedRunProposalMatch: "passed",
      readBack: "present",
      semanticVerification: "passed",
      cleanupProof: "passed",
      providerEvidence: "openai_cli_only_no_fallback",
    },
    liveCepAeRun: false,
    localOllamaUsed: false,
    fallbackProviderUsed: false,
  });

  return { artifactPaths, items: queueItems };
}

function verifyLiveQueuePlanningOutputs(runRoot) {
  for (const relative of LIVE_QUEUE_ROOT_ARTIFACTS) {
    const absolute = path.join(runRoot, relative);
    if (!existsSync(absolute)) {
      throw new Error(`live-queue-output-missing: ${relative}`);
    }
    readJsonFile(absolute, relative);
  }
  const queue = readJsonFile(path.join(runRoot, "live-queue", "queue.json"), "live queue");
  if (queue.schema !== "generic-repo-tool-importer.live-queue.v1") {
    throw new Error("live-queue-schema-mismatch: queue.json");
  }
  if (queue.liveCepAeRun !== false || queue.localOllamaUsed !== false || queue.fallbackProviderUsed !== false) {
    throw new Error("live-queue-boundary-violated");
  }
  for (const item of queue.items || []) {
    for (const relative of item.artifacts || []) {
      if (!existsSync(path.join(runRoot, relative))) {
        throw new Error(`live-queue-output-missing: ${relative}`);
      }
    }
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

function runImplementationWorktreePhase({ manifest, manifestHash, targetRepo, runRoot, runRootRelative, state }) {
  const now = new Date().toISOString();
  if (state.currentPhase === "implementation_worktrees_ready" && state.nextPhase === "implementation_child_runs") {
    verifyAnalysisOutputs(runRoot);
    verifyImplementationPlanningOutputs(runRoot);
    verifyImplementationWorktreeOutputs(runRoot, targetRepo);
    appendEvent(runRoot, {
      event: "implementation_worktrees_resume_verified",
      runId: manifest.run.runId,
      manifestHash,
      nextPhase: state.nextPhase,
      at: now,
    });
    return state;
  }

  if (state.status !== "stopped" || state.currentPhase !== "implementation_planned" || state.nextPhase !== "implementation_worktrees") {
    throw new Error("implementation-worktree-state-not-at-boundary");
  }

  const startedState = {
    ...state,
    auxiliaryId: "AUX-020",
    status: "running",
    currentPhase: "implementation_worktrees_running",
    nextPhase: null,
    stopReason: null,
    updatedAt: now,
    implementationWorktreesStartedAt: now,
    flags: {
      ...state.flags,
      implementationWorktreesStarted: true,
      worktreesCreated: false,
      branchCreated: false,
      childRunsCreated: false,
      controlledMergeApplied: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
      dependencyChanged: false,
      productRuntimeEdited: false,
      pushOrPrCreated: false,
    },
  };
  writeJson(path.join(runRoot, "state.json"), startedState);
  appendEvent(runRoot, {
    event: "implementation_worktrees_started",
    auxiliaryId: "AUX-020",
    runId: manifest.run.runId,
    manifestHash,
    at: now,
  });

  try {
    const { artifactPaths, batches } = buildImplementationWorktreeArtifacts(
      manifest,
      manifestHash,
      targetRepo,
      runRoot,
      runRootRelative,
    );
    verifyImplementationWorktreeOutputs(runRoot, targetRepo);
    const completedAt = new Date().toISOString();
    const completedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "implementation_worktrees_ready",
      nextPhase: "implementation_child_runs",
      stopReason: "stopped_before_codex_child_runs",
      updatedAt: completedAt,
      implementationWorktreesCompletedAt: completedAt,
      implementationWorktreeArtifacts: artifactPaths,
      implementationWorktreeBatches: batches.map((batch) => ({
        id: batch.id,
        plannedPaths: batch.plannedPaths,
        promptPath: batch.promptPath,
        actualWorktreePath: batch.actualWorktreePath,
        actualWorktreeRelativePath: batch.actualWorktreeRelativePath,
        childRunIntentPath: batch.childRunIntentPath,
        childRunCreated: false,
      })),
      flags: {
        ...startedState.flags,
        implementationWorktreesReady: true,
        worktreesCreated: true,
        branchCreated: false,
        childRunsCreated: false,
        controlledMergeApplied: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
        fallbackProviderUsed: false,
        dependencyChanged: false,
        productRuntimeEdited: false,
        pushOrPrCreated: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), completedState);
    updateSupervisorPlanForImplementationWorktrees(
      runRoot,
      manifest,
      manifestHash,
      runRootRelative,
      artifactPaths,
      completedState.implementationWorktreeBatches,
    );
    appendEvent(runRoot, {
      event: "implementation_worktrees_ready",
      runId: manifest.run.runId,
      manifestHash,
      artifacts: artifactPaths,
      nextPhase: "implementation_child_runs",
      at: completedAt,
    });
    appendEvent(runRoot, {
      event: "stopped_before_codex_child_runs",
      runId: manifest.run.runId,
      nextPhase: "implementation_child_runs",
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
        implementationWorktreesReady: false,
        worktreesCreated: false,
        branchCreated: false,
        childRunsCreated: false,
        controlledMergeApplied: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
        fallbackProviderUsed: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), failedState);
    appendEvent(runRoot, {
      event: "implementation_worktrees_failed",
      runId: manifest.run.runId,
      reason: error.message,
      at: failedAt,
    });
    throw error;
  }
}

function runImplementationChildRunPhase({ manifest, manifestHash, targetRepo, runRoot, runRootRelative, state }) {
  const now = new Date().toISOString();
  if (state.currentPhase === "implementation_child_runs_complete" && state.nextPhase === "controlled_merge") {
    verifyAnalysisOutputs(runRoot);
    verifyImplementationPlanningOutputs(runRoot);
    verifyImplementationChildRunOutputs(runRoot, targetRepo, runRootRelative);
    appendEvent(runRoot, {
      event: "implementation_child_runs_resume_verified",
      runId: manifest.run.runId,
      manifestHash,
      nextPhase: state.nextPhase,
      at: now,
    });
    return state;
  }

  if (state.status !== "stopped" || state.currentPhase !== "implementation_worktrees_ready" || state.nextPhase !== "implementation_child_runs") {
    throw new Error("implementation-child-run-state-not-at-boundary");
  }

  const startedState = {
    ...state,
    auxiliaryId: "AUX-021",
    status: "running",
    currentPhase: "implementation_child_runs_running",
    nextPhase: null,
    stopReason: null,
    updatedAt: now,
    implementationChildRunsStartedAt: now,
    flags: {
      ...state.flags,
      implementationChildRunsStarted: true,
      worktreesCreated: true,
      branchCreated: false,
      childRunsCreated: false,
      controlledMergeApplied: false,
      sourceMergeApplied: false,
      validationCommandsRun: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
      dependencyChanged: false,
      productRuntimeEdited: false,
      pushOrPrCreated: false,
    },
  };
  writeJson(path.join(runRoot, "state.json"), startedState);
  appendEvent(runRoot, {
    event: "implementation_child_runs_started",
    auxiliaryId: "AUX-021",
    runId: manifest.run.runId,
    manifestHash,
    at: now,
  });

  try {
    const { artifactPaths, batches } = buildImplementationChildRunArtifacts(
      manifest,
      manifestHash,
      targetRepo,
      runRoot,
      runRootRelative,
    );
    verifyImplementationChildRunOutputs(runRoot, targetRepo, runRootRelative);
    const completedAt = new Date().toISOString();
    const completedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "implementation_child_runs_complete",
      nextPhase: "controlled_merge",
      stopReason: "stopped_before_source_merge_application",
      updatedAt: completedAt,
      implementationChildRunsCompletedAt: completedAt,
      implementationChildRunArtifacts: artifactPaths,
      implementationChildRunBatches: batches.map((batch) => ({
        id: batch.batchId,
        status: batch.status,
        plannedPaths: batch.plannedPaths,
        changedPaths: batch.changedPaths,
        childRunIntentPath: batch.childRunIntentPath,
        childRunResultPath: batch.childRunResultPath,
        actualWorktreePath: batch.actualWorktreePath,
        actualWorktreeRelativePath: batch.actualWorktreeRelativePath,
      })),
      flags: {
        ...startedState.flags,
        implementationChildRunsComplete: true,
        worktreesCreated: true,
        branchCreated: false,
        childRunsCreated: true,
        controlledMergeApplied: false,
        sourceMergeApplied: false,
        validationCommandsRun: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
        fallbackProviderUsed: false,
        dependencyChanged: false,
        productRuntimeEdited: false,
        pushOrPrCreated: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), completedState);
    updateSupervisorPlanForImplementationChildRuns(
      runRoot,
      manifest,
      manifestHash,
      runRootRelative,
      artifactPaths,
      completedState.implementationChildRunBatches,
    );
    appendEvent(runRoot, {
      event: "implementation_child_runs_complete",
      runId: manifest.run.runId,
      manifestHash,
      artifacts: artifactPaths,
      nextPhase: "controlled_merge",
      at: completedAt,
    });
    appendEvent(runRoot, {
      event: "stopped_before_source_merge_application",
      runId: manifest.run.runId,
      nextPhase: "controlled_merge",
      at: completedAt,
    });
    return completedState;
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "implementation_worktrees_ready",
      nextPhase: "implementation_child_runs",
      stopReason: error.message.split(":")[0],
      updatedAt: failedAt,
      flags: {
        ...startedState.flags,
        implementationChildRunsComplete: false,
        controlledMergeApplied: false,
        sourceMergeApplied: false,
        validationCommandsRun: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
        fallbackProviderUsed: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), failedState);
    appendEvent(runRoot, {
      event: "implementation_child_runs_failed",
      runId: manifest.run.runId,
      reason: error.message,
      at: failedAt,
    });
    throw error;
  }
}

function runControlledSourceMergePhase({ manifest, manifestHash, targetRepo, runRoot, runRootRelative, state }) {
  const now = new Date().toISOString();
  if (state.currentPhase === "source_merged" && state.nextPhase === "non_live_validation") {
    verifyAnalysisOutputs(runRoot);
    verifyImplementationPlanningOutputs(runRoot);
    verifyImplementationChildRunOutputs(runRoot, targetRepo, runRootRelative);
    verifyControlledSourceMergeOutputs(runRoot, targetRepo, state);
    appendEvent(runRoot, {
      event: "controlled_source_merge_resume_verified",
      runId: manifest.run.runId,
      manifestHash,
      nextPhase: state.nextPhase,
      at: now,
    });
    return state;
  }

  if (state.status !== "stopped" || state.currentPhase !== "implementation_child_runs_complete" || state.nextPhase !== "controlled_merge") {
    throw new Error("controlled-source-merge-state-not-at-boundary");
  }

  const startedState = {
    ...state,
    auxiliaryId: "AUX-022",
    status: "running",
    currentPhase: "controlled_source_merge_running",
    nextPhase: null,
    stopReason: null,
    updatedAt: now,
    controlledSourceMergeStartedAt: now,
    flags: {
      ...state.flags,
      controlledSourceMergeStarted: true,
      worktreesCreated: true,
      branchCreated: false,
      childRunsCreated: true,
      controlledMergeApplied: false,
      sourceMergeApplied: false,
      validationCommandsRun: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
      productRuntimeEdited: false,
      pushOrPrCreated: false,
    },
  };
  writeJson(path.join(runRoot, "state.json"), startedState);
  appendEvent(runRoot, {
    event: "controlled_source_merge_started",
    auxiliaryId: "AUX-022",
    runId: manifest.run.runId,
    manifestHash,
    at: now,
  });

  try {
    const { artifactPaths, report } = buildControlledSourceMergeArtifacts({
      manifest,
      manifestHash,
      targetRepo,
      runRoot,
      runRootRelative,
      state: startedState,
    });
    const completedAt = new Date().toISOString();
    const completedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "source_merged",
      nextPhase: "non_live_validation",
      stopReason: "stopped_before_non_live_validation",
      updatedAt: completedAt,
      controlledSourceMergeCompletedAt: completedAt,
      controlledSourceMergeArtifacts: artifactPaths,
      controlledSourceMergeReportPath: "merge/controlled-source-merge-report.json",
      ownedDirtyPaths: report.ownedDirtyPaths,
      flags: {
        ...startedState.flags,
        controlledSourceMergeComplete: true,
        worktreesCreated: true,
        branchCreated: false,
        childRunsCreated: true,
        controlledMergeApplied: true,
        sourceMergeApplied: true,
        validationCommandsRun: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
        fallbackProviderUsed: false,
        dependencyChanged: report.dependencyChanged,
        productRuntimeEdited: false,
        pushOrPrCreated: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), completedState);
    updateSupervisorPlanForControlledSourceMerge(
      runRoot,
      manifest,
      manifestHash,
      runRootRelative,
      artifactPaths,
      report,
    );
    appendEvent(runRoot, {
      event: "controlled_source_merge_complete",
      runId: manifest.run.runId,
      manifestHash,
      artifacts: artifactPaths,
      ownedDirtyPaths: report.ownedDirtyPaths,
      nextPhase: "non_live_validation",
      at: completedAt,
    });
    appendEvent(runRoot, {
      event: "stopped_before_non_live_validation",
      runId: manifest.run.runId,
      nextPhase: "non_live_validation",
      at: completedAt,
    });
    return completedState;
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "implementation_child_runs_complete",
      nextPhase: "controlled_merge",
      stopReason: error.message.split(":")[0],
      updatedAt: failedAt,
      flags: {
        ...startedState.flags,
        controlledSourceMergeComplete: false,
        controlledMergeApplied: false,
        sourceMergeApplied: false,
        validationCommandsRun: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
        fallbackProviderUsed: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), failedState);
    appendEvent(runRoot, {
      event: "controlled_source_merge_failed",
      runId: manifest.run.runId,
      reason: error.message,
      at: failedAt,
    });
    throw error;
  }
}

function runNonLiveValidationPhase({ manifest, manifestHash, targetRepo, runRoot, runRootRelative, state }) {
  const now = new Date().toISOString();
  if (state.currentPhase === "non_live_validation_complete" && state.nextPhase === "live_acceptance") {
    verifyAnalysisOutputs(runRoot);
    verifyImplementationPlanningOutputs(runRoot);
    verifyImplementationChildRunOutputs(runRoot, targetRepo, runRootRelative);
    verifyControlledSourceMergeOutputs(runRoot, targetRepo, state);
    verifyNonLiveValidationOutputs(runRoot, targetRepo, state);
    appendEvent(runRoot, {
      event: "non_live_validation_resume_verified",
      runId: manifest.run.runId,
      manifestHash,
      nextPhase: state.nextPhase,
      at: now,
    });
    return state;
  }

  if (state.status !== "stopped" || state.currentPhase !== "source_merged" || state.nextPhase !== "non_live_validation") {
    throw new Error("non-live-validation-state-not-at-boundary");
  }

  const startedState = {
    ...state,
    auxiliaryId: "AUX-023",
    status: "running",
    currentPhase: "non_live_validation_running",
    nextPhase: null,
    stopReason: null,
    updatedAt: now,
    nonLiveValidationStartedAt: now,
    flags: {
      ...state.flags,
      nonLiveValidationStarted: true,
      controlledMergeApplied: true,
      sourceMergeApplied: true,
      validationCommandsRun: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
      pushOrPrCreated: false,
    },
  };
  writeJson(path.join(runRoot, "state.json"), startedState);
  appendEvent(runRoot, {
    event: "non_live_validation_started",
    auxiliaryId: "AUX-023",
    runId: manifest.run.runId,
    manifestHash,
    at: now,
  });

  try {
    const { artifactPaths, report } = buildNonLiveValidationArtifacts({
      manifest,
      manifestHash,
      targetRepo,
      runRoot,
      state: startedState,
    });
    const completedAt = new Date().toISOString();
    const completedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "non_live_validation_complete",
      nextPhase: "live_acceptance",
      stopReason: "stopped_before_live_acceptance",
      updatedAt: completedAt,
      nonLiveValidationCompletedAt: completedAt,
      nonLiveValidationArtifacts: artifactPaths,
      ownedDirtyPaths: report.ownedDirtyPaths,
      flags: {
        ...startedState.flags,
        nonLiveValidationComplete: true,
        controlledMergeApplied: true,
        sourceMergeApplied: true,
        validationCommandsRun: true,
        liveCepAeRun: false,
        localOllamaUsed: false,
        fallbackProviderUsed: false,
        dependencyChanged: report.dependencyChanged,
        productRuntimeEdited: false,
        pushOrPrCreated: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), completedState);
    updateSupervisorPlanForNonLiveValidation(
      runRoot,
      manifest,
      manifestHash,
      runRootRelative,
      artifactPaths,
      report,
    );
    appendEvent(runRoot, {
      event: "non_live_validation_complete",
      runId: manifest.run.runId,
      manifestHash,
      artifacts: artifactPaths,
      nextPhase: "live_acceptance",
      at: completedAt,
    });
    appendEvent(runRoot, {
      event: "stopped_before_live_acceptance",
      runId: manifest.run.runId,
      nextPhase: "live_acceptance",
      at: completedAt,
    });
    return completedState;
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "source_merged",
      nextPhase: "non_live_validation",
      stopReason: error.message.split(":")[0],
      updatedAt: failedAt,
      flags: {
        ...startedState.flags,
        nonLiveValidationComplete: false,
        validationCommandsRun: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
        fallbackProviderUsed: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), failedState);
    appendEvent(runRoot, {
      event: "non_live_validation_failed",
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

function runLiveQueuePlanningPhase({ manifest, manifestHash, runRoot, runRootRelative, state }) {
  const now = new Date().toISOString();
  if (state.currentPhase === "live_queue_planned" && state.nextPhase === "completed") {
    verifyAnalysisOutputs(runRoot);
    verifyImplementationPlanningOutputs(runRoot);
    verifyMergePlanningOutputs(runRoot);
    verifyLiveQueuePlanningOutputs(runRoot);
    appendEvent(runRoot, {
      event: "live_queue_plan_resume_verified",
      runId: manifest.run.runId,
      manifestHash,
      nextPhase: state.nextPhase,
      at: now,
    });
    return state;
  }

  if (state.status !== "stopped" || state.currentPhase !== "merge_planned" || state.nextPhase !== "live_queue_planning") {
    throw new Error("live-queue-planning-state-not-at-boundary");
  }

  const startedState = {
    ...state,
    auxiliaryId: "AUX-019",
    status: "running",
    currentPhase: "live_queue_planning",
    nextPhase: null,
    stopReason: null,
    updatedAt: now,
    liveQueuePlanningStartedAt: now,
    flags: {
      ...state.flags,
      liveQueuePlanningStarted: true,
      liveQueuePlanned: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
      dependencyChanged: false,
      productRuntimeEdited: false,
      branchCreated: false,
      pushOrPrCreated: false,
      childRunsCreated: false,
    },
  };
  writeJson(path.join(runRoot, "state.json"), startedState);
  appendEvent(runRoot, {
    event: "live_queue_planning_started",
    auxiliaryId: "AUX-019",
    runId: manifest.run.runId,
    manifestHash,
    at: now,
  });

  try {
    const { artifactPaths, items } = buildLiveQueuePlanningArtifacts(manifest, manifestHash, runRoot);
    verifyLiveQueuePlanningOutputs(runRoot);
    const completedAt = new Date().toISOString();
    const completedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "live_queue_planned",
      nextPhase: "completed",
      stopReason: "stopped_before_live_queue_execution",
      updatedAt: completedAt,
      liveQueuePlanningCompletedAt: completedAt,
      liveQueueArtifacts: artifactPaths,
      liveQueueItemIds: items.map((item) => item.id),
      flags: {
        ...startedState.flags,
        liveQueuePlanned: true,
        liveCepAeRun: false,
        localOllamaUsed: false,
        fallbackProviderUsed: false,
        dependencyChanged: false,
        productRuntimeEdited: false,
        branchCreated: false,
        pushOrPrCreated: false,
        childRunsCreated: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), completedState);
    updateSupervisorPlanForLiveQueuePlanning(
      runRoot,
      manifest,
      manifestHash,
      runRootRelative,
      artifactPaths,
      items,
    );
    appendEvent(runRoot, {
      event: "live_queue_planned",
      runId: manifest.run.runId,
      manifestHash,
      artifacts: artifactPaths,
      nextPhase: "completed",
      at: completedAt,
    });
    appendEvent(runRoot, {
      event: "stopped_before_live_queue_execution",
      runId: manifest.run.runId,
      nextPhase: "completed",
      at: completedAt,
    });
    return completedState;
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failedState = {
      ...startedState,
      status: "stopped",
      currentPhase: "merge_planned",
      nextPhase: "live_queue_planning",
      stopReason: error.message.split(":")[0],
      updatedAt: failedAt,
      flags: {
        ...startedState.flags,
        liveQueuePlanned: false,
        liveCepAeRun: false,
        localOllamaUsed: false,
        fallbackProviderUsed: false,
        childRunsCreated: false,
      },
    };
    writeJson(path.join(runRoot, "state.json"), failedState);
    appendEvent(runRoot, {
      event: "live_queue_planning_failed",
      runId: manifest.run.runId,
      reason: error.message,
      at: failedAt,
    });
    throw error;
  }
}

function importerResultSummary(result, artifacts) {
  const artifactPaths = artifacts.slice(0, RESULT_SUMMARY_MAX_ARTIFACT_PATHS);
  return {
    schema: "generic-repo-tool-importer.result-summary.v1",
    runId: result.runId,
    status: result.status,
    currentPhase: result.currentPhase,
    nextPhase: result.nextPhase,
    artifactCount: artifacts.length,
    artifactPaths,
    artifactPathsTruncated: artifacts.length > artifactPaths.length,
    nonLiveValidationComplete: result.nonLiveValidationComplete === true,
    validationCommandsRun: result.validationCommandsRun === true,
    flags: {
      analysisCompleted: result.analysisCompleted === true,
      branchCreated: result.branchCreated === true,
      childRunsCreated: result.childRunsCreated === true,
      controlledMergeApplied: result.controlledMergeApplied === true,
      dependencyChanged: false,
      fallbackProviderUsed: result.fallbackProviderUsed === true,
      liveCepAeRun: result.liveCepAeRun === true,
      localOllamaUsed: result.localOllamaUsed === true,
      sourceMergeApplied: result.sourceMergeApplied === true,
      validationCommandsRun: result.validationCommandsRun === true,
      worktreesCreated: result.worktreesCreated === true,
    },
    createdAt: new Date().toISOString(),
  };
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
  if (options["run-implementation-worktrees"]) {
    state = runImplementationWorktreePhase({ manifest, manifestHash, targetRepo, runRoot, runRootRelative, state });
  }
  if (options["run-implementation-child-runs"]) {
    state = runImplementationChildRunPhase({ manifest, manifestHash, targetRepo, runRoot, runRootRelative, state });
  }
  if (options["apply-controlled-merge"]) {
    state = runControlledSourceMergePhase({ manifest, manifestHash, targetRepo, runRoot, runRootRelative, state });
  }
  if (options["run-non-live-validation"]) {
    state = runNonLiveValidationPhase({ manifest, manifestHash, targetRepo, runRoot, runRootRelative, state });
  }
  if (options["plan-merge"]) {
    state = runMergePlanningPhase({ manifest, manifestHash, runRoot, runRootRelative, state });
  }
  if (options["plan-live-queue"]) {
    state = runLiveQueuePlanningPhase({ manifest, manifestHash, runRoot, runRootRelative, state });
  }

  const liveQueuePlanned = state.currentPhase === "live_queue_planned";
  const mergePlanned = liveQueuePlanned || state.currentPhase === "merge_planned";
  const nonLiveValidationComplete = state.currentPhase === "non_live_validation_complete";
  const sourceMerged = nonLiveValidationComplete || state.currentPhase === "source_merged";
  const implementationChildRunsComplete = sourceMerged || state.currentPhase === "implementation_child_runs_complete";
  const implementationWorktreesReady = implementationChildRunsComplete || state.currentPhase === "implementation_worktrees_ready";
  const implementationPlanned = implementationWorktreesReady || mergePlanned || state.currentPhase === "implementation_planned";
  const analysisComplete = implementationPlanned || state.currentPhase === "analysis_complete";
  let status = "stopped_before_analysis";
  if (liveQueuePlanned) {
    status = "stopped_after_live_queue_planning";
  } else if (mergePlanned) {
    status = "stopped_after_merge_planning";
  } else if (nonLiveValidationComplete) {
    status = "stopped_after_non_live_validation";
  } else if (sourceMerged) {
    status = "stopped_after_controlled_source_merge";
  } else if (implementationChildRunsComplete) {
    status = "stopped_after_implementation_child_runs";
  } else if (implementationWorktreesReady) {
    status = "stopped_after_implementation_worktrees";
  } else if (implementationPlanned) {
    status = "stopped_after_implementation_planning";
  } else if (analysisComplete) {
    status = "stopped_after_analysis";
  }
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
  if (implementationWorktreesReady) {
    artifacts.push(...(state.implementationWorktreeArtifacts || []));
  }
  if (implementationChildRunsComplete) {
    artifacts.push(...(state.implementationChildRunArtifacts || []));
  }
  if (sourceMerged) {
    artifacts.push(...(state.controlledSourceMergeArtifacts || []));
  }
  if (nonLiveValidationComplete) {
    artifacts.push(...(state.nonLiveValidationArtifacts || []));
  }
  if (mergePlanned) {
    artifacts.push(...(state.mergeArtifacts || []));
  }
  if (liveQueuePlanned) {
    artifacts.push(...(state.liveQueueArtifacts || []));
  }

  const result = {
    schema: RUNNER_SCHEMA,
    auxiliaryId: liveQueuePlanned
      ? "AUX-019"
      : mergePlanned
        ? "AUX-018"
        : nonLiveValidationComplete
          ? "AUX-023"
          : sourceMerged
            ? "AUX-022"
            : implementationChildRunsComplete
              ? "AUX-021"
              : implementationWorktreesReady
                ? "AUX-020"
                : implementationPlanned
                  ? "AUX-017"
                  : analysisComplete
                    ? "AUX-016"
                    : "AUX-015",
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
    implementationWorktreesReady,
    implementationChildRunsComplete,
    sourceMerged,
    nonLiveValidationComplete,
    mergePlanned,
    liveQueuePlanned,
    worktreesCreated: state.flags.worktreesCreated === true,
    branchCreated: state.flags.branchCreated === true,
    childRunsCreated: state.flags.childRunsCreated === true,
    controlledMergeApplied: state.flags.controlledMergeApplied === true,
    sourceMergeApplied: state.flags.sourceMergeApplied === true,
    validationCommandsRun: state.flags.validationCommandsRun === true,
    liveCepAeRun: state.flags.liveCepAeRun === true,
    localOllamaUsed: state.flags.localOllamaUsed === true,
    fallbackProviderUsed: state.flags.fallbackProviderUsed === true,
  };
  const summaryPath = path.join(runRoot, "result-summary.json");
  const summary = importerResultSummary(result, artifacts);
  writeJson(summaryPath, summary);
  if (statSync(summaryPath).size > CHILD_RUN_SUMMARY_MAX_BYTES) {
    throw new Error(`importer-result-summary-too-large: ${statSync(summaryPath).size}`);
  }
  return {
    ...result,
    resultSummaryPath: summaryPath,
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

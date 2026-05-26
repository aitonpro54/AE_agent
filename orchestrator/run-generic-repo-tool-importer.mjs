#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
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

const HELP = `
Generic repository tool importer skeleton

Usage:
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path>
  node orchestrator/run-generic-repo-tool-importer.mjs --manifest <path> --json

Options:
  --manifest <path>  generic-repo-tool-importer.manifest.v1 JSON file.
  --json             Print machine-readable output.
  --help             Show this help.

This AUX-015 skeleton validates the AUX-014 manifest contract, creates an
ignored run root, writes durable initial state artifacts, and stops before
analysis. It does not create branches, worktrees, child runs, live AE/CEP runs,
dependency changes, product runtime edits, push, PR, or GitHub automation.
`;

const VALUE_OPTIONS = new Set(["manifest"]);
const BOOLEAN_OPTIONS = new Set(["help", "json"]);

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
        normalizedBy: "AUX-015 generic repo importer command skeleton",
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
        reason: "AUX-015 stops before analysis by design.",
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

function resumeRun({ manifest, manifestHash, runRoot, existingState }) {
  const now = new Date().toISOString();
  if (existingState.manifestHash !== manifestHash) {
    throw new Error("resume-manifest-hash-mismatch");
  }
  if (existingState.runId !== manifest.run.runId) {
    throw new Error("resume-run-id-mismatch");
  }
  if (existingState.status !== "stopped" || existingState.nextPhase !== "analysis") {
    throw new Error("resume-state-not-at-analysis-boundary");
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
    nextPhase: "analysis",
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

  return {
    schema: RUNNER_SCHEMA,
    auxiliaryId: "AUX-015",
    runId: manifest.run.runId,
    status: "stopped_before_analysis",
    resumed,
    manifestHash,
    targetRepo,
    runRoot,
    artifacts: [
      "state.json",
      "events.jsonl",
      "manifest.original.json",
      "manifest.normalized.json",
      "supervisor-plan.json",
    ],
    nextPhase: state.nextPhase,
    analysisStarted: false,
    worktreesCreated: false,
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
      process.stdout.write(`Generic repo importer skeleton initialized ${result.runId}; stopped before analysis.\n`);
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

#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const PLAN_SCHEMA = "generic-repo-queue-supervisor.plan-only.v1";
const AUXILIARY_ID = "AUX-031";
const DEFAULT_LEDGER_PATH =
  ".codex-runtime/sdk/generic-repo-importer/kyletmartinez-after-effects-scripts-intake/queue-ledger.json";
const SAFE_CLASSIFICATIONS = new Set([
  "existing_typed_tools_recipe_only",
  "small_safe_typed_tool_library_recipe_addition",
]);
const SHARED_OWNER_PATHS = Object.freeze([
  "registry/solutions.json",
  "scripts/solution-library-validation-smoke.js",
  "plans/target-app-execplan.md",
  ".codex/handoff.md",
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
const LIVE_LANE_READY_STATUSES = new Set([
  "available",
  "generated_only_lane_registered",
  "passed",
  "ready",
  "registered",
  "reusable_lane_available",
]);

const HELP = `
Generic repository queue supervisor plan-only proof

Usage:
  node orchestrator/run-generic-repo-queue-supervisor.mjs --plan-only --ledger <path> --max-items <n> --json

Options:
  --ledger <path>        Durable generic repository importer ledger.
                        Defaults to ${DEFAULT_LEDGER_PATH}
  --target-repo <path>   Optional target repo override. Defaults to ledger.target.repoPath.
  --max-items <n>        Number of queued safe ranked candidates to plan. Default 3.
  --context-percent <n>  Fail closed at >= 70 before any new work.
  --plan-only            Required; this supervisor never executes candidates.
  --json                 Print machine-readable output.
  --help                 Show this help.

This first bounded layer only reads the ledger, verifies safety gates, and emits
a deterministic plan-only run list. It does not create worktrees, run child
commands, perform controlled merge, run validation, run live AE/CEP/CDP/OpenAI
CLI lanes, write source repositories, change packages, push, or create PRs.
`;

const VALUE_OPTIONS = new Set(["context-percent", "ledger", "max-items", "target-repo"]);
const BOOLEAN_OPTIONS = new Set(["help", "json", "plan-only"]);

class QueueSupervisorError extends Error {
  constructor(message, report = null) {
    super(message);
    this.name = "QueueSupervisorError";
    this.report = report;
  }
}

function splitInlineOption(raw) {
  const index = raw.indexOf("=");
  if (index === -1) {
    return { inlineValue: undefined, name: raw };
  }
  return { inlineValue: raw.slice(index + 1), name: raw.slice(0, index) };
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
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
      options[toCamelCase(name)] = inlineValue === undefined ? true : inlineValue === "true";
      continue;
    }

    if (!VALUE_OPTIONS.has(name)) {
      throw new Error(`Unknown option: --${name}`);
    }

    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    options[toCamelCase(name)] = value;
    if (inlineValue === undefined) {
      index += 1;
    }
  }
  return options;
}

function normalizeRepoPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label}-read-failed: ${filePath}: ${error.message}`);
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parsePositiveInteger(value, label, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label}-must-be-positive-integer: ${value}`);
  }
  return parsed;
}

function parseFiniteNumber(value, label) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label}-invalid-number: ${value}`);
  }
  return parsed;
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
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

function requireBoolean(value, label, expected = null) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  if (expected !== null && value !== expected) {
    throw new Error(`${label} must be ${expected}`);
  }
}

function blocker(code, message, details = {}) {
  return { code, details, message };
}

function gitOutput(cwd, args, label) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git-${label}-failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function statusEntryPath(entry) {
  const raw = entry.slice(3).trim();
  const renameIndex = raw.indexOf(" -> ");
  return normalizeRepoPath(renameIndex === -1 ? raw : raw.slice(renameIndex + 4));
}

function gitChangedPaths(cwd) {
  const output = gitOutput(cwd, ["status", "--porcelain=v1", "--untracked-files=all"], "status");
  return output ? output.split(/\r?\n/).filter(Boolean).map(statusEntryPath).sort() : [];
}

function isDependencyPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  return DEPENDENCY_PATHS.has(normalized) || normalized.split("/").some((part) => DEPENDENCY_PATHS.has(part));
}

function isRawJsxTargetPath(repoPath) {
  return /\.(?:jsx|jsxinc)$/i.test(normalizeRepoPath(repoPath));
}

function pathStartsWith(child, parent) {
  const normalizedChild = normalizeRepoPath(child);
  const normalizedParent = normalizeRepoPath(parent).replace(/\/+$/, "");
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

function resolveLedgerPath(cwd, value) {
  const candidate = value || DEFAULT_LEDGER_PATH;
  return path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
}

function resolveTargetRepo(cwd, ledger, options) {
  const candidate = options.targetRepo || (ledger.target && ledger.target.repoPath) || cwd;
  const resolved = path.resolve(cwd, candidate);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(`target-repo-missing: ${resolved}`);
  }
  gitOutput(resolved, ["rev-parse", "--show-toplevel"], "show-toplevel");
  return resolved;
}

function assertRequiredLedgerShape(ledger) {
  requireObject(ledger, "ledger");
  requireString(ledger.schema, "ledger.schema");
  requireObject(ledger.source, "ledger.source");
  requireString(ledger.source.repo, "ledger.source.repo");
  requireString(ledger.source.checkout, "ledger.source.checkout");
  requireString(ledger.source.revision, "ledger.source.revision");
  requireObject(ledger.target, "ledger.target");
  requireString(ledger.target.repoPath, "ledger.target.repoPath");
  requireString(ledger.target.branch, "ledger.target.branch");
  requireString(ledger.target.head, "ledger.target.head");
  requireString(ledger.target.remoteName, "ledger.target.remoteName");
  requireString(ledger.target.remoteBranch, "ledger.target.remoteBranch");
  requireObject(ledger.constraints, "ledger.constraints");
  requireBoolean(ledger.constraints.noLocalOllama, "ledger.constraints.noLocalOllama", true);
  requireBoolean(
    ledger.constraints.noDependencyOrPackageChanges,
    "ledger.constraints.noDependencyOrPackageChanges",
    true,
  );
  requireBoolean(ledger.constraints.noRawJsxCopiedIntoProduct, "ledger.constraints.noRawJsxCopiedIntoProduct", true);
  requireBoolean(ledger.constraints.noUserAssetMutation, "ledger.constraints.noUserAssetMutation", true);
  requireArray(ledger.entries, "ledger.entries");
}

function validateEntryShape(entry, label) {
  requireObject(entry, label);
  requireString(entry.id, `${label}.id`);
  requireString(entry.sourcePath, `${label}.sourcePath`);
  requireString(entry.status, `${label}.status`);
  requireString(entry.classification, `${label}.classification`);
  requireArray(entry.suggestedTools, `${label}.suggestedTools`);
  requireObject(entry.liveGate, `${label}.liveGate`);
  requireBoolean(entry.liveGate.required, `${label}.liveGate.required`);
  requireString(entry.liveGate.status, `${label}.liveGate.status`);
  requireObject(entry.implementation, `${label}.implementation`);
  requireArray(entry.implementation.plannedPaths, `${label}.implementation.plannedPaths`);
  requireObject(entry.safetySignals, `${label}.safetySignals`);
}

function contextBlockers(options) {
  const contextPercent = parseFiniteNumber(options.contextPercent, "context-percent");
  if (contextPercent === null) {
    return { blockers: [], contextPercent: null, status: "not_provided" };
  }
  if (contextPercent >= 70) {
    return {
      blockers: [
        blocker("context-pressure", `Context percent ${contextPercent} is at or above the hard handoff trigger for this queue supervisor.`),
      ],
      contextPercent,
      status: "handoff_required",
    };
  }
  return { blockers: [], contextPercent, status: "ok" };
}

function hasUnsafeProviderText(value) {
  return /\b(?:local|ollama|openrouter)\b/i.test(String(value || ""));
}

function commandIsNarrowGeneratedOpenAiCli(command) {
  const text = String(command || "");
  if (!text) {
    return false;
  }
  if (!/\bopenai-cli\b/i.test(text)) {
    return false;
  }
  if (hasUnsafeProviderText(text)) {
    return false;
  }
  if (/\bcep-panel-cdp-smoke\.js\s+smoke\b/i.test(text)) {
    return false;
  }
  return true;
}

function liveLaneEvidence(liveGate) {
  const command = liveGate.command || liveGate.liveCommand || null;
  const commands = Array.isArray(liveGate.commands) ? liveGate.commands : [];
  const commandList = [command, ...commands].filter(Boolean);
  const status = String(liveGate.status || "");
  const laneId = liveGate.laneId || liveGate.liveLaneId || liveGate.reusableLaneId || null;
  const provider = liveGate.providerPath || liveGate.provider || "";

  if (!liveGate.required) {
    return { reason: "not_required", status: "not_required", ok: true };
  }
  if (hasUnsafeProviderText(provider)) {
    return { reason: "forbidden_provider", status: "blocked", ok: false };
  }
  if (commandList.some((entry) => !commandIsNarrowGeneratedOpenAiCli(entry))) {
    return { reason: "unsafe_live_command", status: "blocked", ok: false };
  }
  if (commandList.length > 0 || laneId) {
    return { reason: "explicit_lane_registered", status: "ready", ok: true };
  }
  if (LIVE_LANE_READY_STATUSES.has(status)) {
    return { reason: "ready_status", status: "ready", ok: true };
  }
  return { reason: `missing_required_live_lane:${status || "missing_status"}`, status: "blocked", ok: false };
}

function candidateSlug(entry) {
  const base = path.basename(entry.sourcePath, path.extname(entry.sourcePath));
  const candidate = base
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return candidate || entry.id.replace(/[^a-zA-Z0-9.-]+/g, "-").toLowerCase();
}

function plannedRecipePath(entry) {
  return `recipes/${candidateSlug(entry)}-typed-plan.md`;
}

function sortedUnique(values) {
  return Array.from(new Set(values.map(normalizeRepoPath).filter(Boolean))).sort();
}

function sharedOwnershipRecords() {
  return SHARED_OWNER_PATHS.map((repoPath) => ({
    owner: "serial-merge/shared-owner",
    path: repoPath,
    reason: "Shared tracked coordination file; never merge in parallel candidate batches.",
    serialPhase: repoPath === ".codex/handoff.md" ? "handoff_update" : "controlled_merge",
  }));
}

function phasePlan(entry) {
  return {
    parallelizablePreparation: [
      {
        allowedInThisPlanOnlyRun: true,
        live: false,
        name: "read_only_ledger_candidate_analysis",
        parallelizable: true,
        scope: "ledger and source metadata only",
      },
      {
        allowedInThisPlanOnlyRun: true,
        live: false,
        name: "importer_manifest_and_prompt_planning",
        parallelizable: true,
        scope: "deterministic plan artifacts only",
      },
      {
        allowedInThisPlanOnlyRun: false,
        live: false,
        name: "importer_owned_worktree_preparation",
        parallelizable: true,
        scope: "future importer-owned detached worktree boundary",
      },
    ],
    serialPhases: [
      {
        name: "controlled_merge",
        parallelizable: false,
        sharedOwnerPaths: SHARED_OWNER_PATHS,
      },
      { name: "non_live_validation", parallelizable: false },
      {
        name: "read_only_cep_cdp_preflight",
        parallelizable: false,
        live: true,
        reason: "Live preflight must stay serialized even when read-only.",
      },
      {
        name: "generated_only_openai_cli_live_acceptance",
        parallelizable: false,
        live: true,
        reason: "No live parallelism; one generated-only lane at a time.",
        required: entry.liveGate.required === true,
      },
      { name: "plan_update", parallelizable: false, sharedOwnerPaths: ["plans/target-app-execplan.md"] },
      { name: "handoff_update", parallelizable: false, sharedOwnerPaths: [".codex/handoff.md"] },
      { name: "commit", parallelizable: false },
      { name: "remote_safety_check", parallelizable: false },
      { name: "push_pr_gate", parallelizable: false, allowedWithoutApproval: false },
    ],
  };
}

function candidateBlockers(entry, ledger) {
  const blockers = [];
  const liveLane = liveLaneEvidence(entry.liveGate);
  if (!liveLane.ok) {
    blockers.push(
      blocker("required-live-lane-missing", `Required generated-only live lane is not registered for ${entry.id}.`, {
        liveGateStatus: entry.liveGate.status,
        reason: liveLane.reason,
        sourcePath: entry.sourcePath,
      }),
    );
  }

  const plannedPaths = Array.isArray(entry.implementation?.plannedPaths) ? entry.implementation.plannedPaths : [];
  const normalizedSourceCheckout = normalizeRepoPath(ledger.source?.checkout || "");
  for (const plannedPath of plannedPaths) {
    const normalized = normalizeRepoPath(plannedPath);
    if (isDependencyPath(normalized)) {
      blockers.push(
        blocker("dependency-package-change-forbidden", `Candidate ${entry.id} plans dependency/package path ${normalized}.`, {
          plannedPath: normalized,
        }),
      );
    }
    if (isRawJsxTargetPath(normalized)) {
      blockers.push(
        blocker("raw-jsx-copy-forbidden", `Candidate ${entry.id} plans raw JSX product path ${normalized}.`, {
          plannedPath: normalized,
        }),
      );
    }
    if (normalizedSourceCheckout && pathStartsWith(normalized, normalizedSourceCheckout)) {
      blockers.push(
        blocker("source-repo-write-forbidden", `Candidate ${entry.id} plans a source checkout write ${normalized}.`, {
          plannedPath: normalized,
        }),
      );
    }
  }

  return blockers;
}

function buildRunItem(entry, index, ledger) {
  const liveLane = liveLaneEvidence(entry.liveGate);
  const uniquePaths = sortedUnique([plannedRecipePath(entry), ...entry.implementation.plannedPaths, ...SHARED_OWNER_PATHS]);
  return {
    index,
    candidateId: entry.id,
    sourcePath: entry.sourcePath,
    queueRank: entry.queueRank,
    classification: entry.classification,
    runId: entry.implementation.sliceId || entry.id.replace(/^tool-/, ""),
    status: liveLane.ok ? "plan_only_ready" : "blocked_before_execution",
    liveGate: {
      required: entry.liveGate.required,
      status: entry.liveGate.status,
      supervisorStatus: liveLane.status,
      reason: liveLane.reason,
      parallelizable: false,
    },
    suggestedTools: [...entry.suggestedTools].sort(),
    plannedPaths: uniquePaths,
    sharedOwnerPaths: sharedOwnershipRecords(),
    phases: phasePlan(entry),
    executionFlags: {
      childRunsCreated: false,
      controlledMergeApplied: false,
      dependencyPackageChangesAllowed: false,
      liveCepAeRun: false,
      liveParallelismAllowed: false,
      localOllamaAllowed: false,
      planOnly: true,
      pushOrPrAllowed: false,
      rawJsxCopyAllowed: false,
      sourceRepoWritesAllowed: false,
      userAssetMutationAllowed: false,
      worktreesCreated: false,
    },
  };
}

function selectQueuedSafeCandidates(ledger, maxItems) {
  const blockers = [];
  const candidates = [];
  const rankedIds = new Set();

  ledger.entries.forEach((entry, index) => {
    validateEntryShape(entry, `ledger.entries[${index}]`);
    const safe = SAFE_CLASSIFICATIONS.has(entry.classification);
    const ranked = Number.isInteger(entry.queueRank);
    if (entry.status === "queued" && ranked) {
      rankedIds.add(entry.id);
    }
    if (entry.status === "queued" && ranked && !safe) {
      blockers.push(
        blocker("unsafe-ranked-candidate", `Queued ranked candidate ${entry.id} has unsafe classification ${entry.classification}.`, {
          classification: entry.classification,
          queueRank: entry.queueRank,
        }),
      );
    }
    if (entry.status === "queued" && safe && !ranked) {
      blockers.push(
        blocker("safe-candidate-rank-missing", `Queued safe candidate ${entry.id} is missing an integer queueRank.`),
      );
    }
    if (entry.status === "queued" && safe && ranked) {
      candidates.push(entry);
    }
  });

  candidates.sort((left, right) => left.queueRank - right.queueRank || left.id.localeCompare(right.id));

  if (ledger.nextCandidate) {
    requireObject(ledger.nextCandidate, "ledger.nextCandidate");
    requireString(ledger.nextCandidate.id, "ledger.nextCandidate.id");
    requireString(ledger.nextCandidate.sourcePath, "ledger.nextCandidate.sourcePath");
    requireString(ledger.nextCandidate.classification, "ledger.nextCandidate.classification");
    const first = candidates[0] || null;
    if (!SAFE_CLASSIFICATIONS.has(ledger.nextCandidate.classification)) {
      blockers.push(
        blocker("next-candidate-unsafe", `Next candidate ${ledger.nextCandidate.id} is not in a safe classification bucket.`, {
          classification: ledger.nextCandidate.classification,
        }),
      );
    }
    if (!rankedIds.has(ledger.nextCandidate.id)) {
      blockers.push(blocker("next-candidate-not-ranked", `Next candidate ${ledger.nextCandidate.id} is not queued with a rank.`));
    }
    if (first && first.id !== ledger.nextCandidate.id) {
      blockers.push(
        blocker("next-candidate-rank-mismatch", `Next candidate ${ledger.nextCandidate.id} is not the first safe ranked candidate.`, {
          firstSafeRankedCandidate: first.id,
        }),
      );
    }
  }

  return { blockers, selected: candidates.slice(0, maxItems) };
}

function buildPlan(options, cwd = process.cwd()) {
  if (options.planOnly !== true) {
    throw new Error("--plan-only is required for the generic repo queue supervisor.");
  }

  const maxItems = parsePositiveInteger(options.maxItems, "max-items", 3);
  const ledgerPath = resolveLedgerPath(cwd, options.ledger);
  if (!existsSync(ledgerPath) || !statSync(ledgerPath).isFile()) {
    throw new Error(`ledger-missing: ${ledgerPath}`);
  }

  const ledger = readJson(ledgerPath, "queue-ledger");
  assertRequiredLedgerShape(ledger);
  const targetRepo = resolveTargetRepo(cwd, ledger, options);
  const ledgerHash = sha256File(ledgerPath);
  const context = contextBlockers(options);
  const changedPaths = gitChangedPaths(targetRepo);
  const selection = selectQueuedSafeCandidates(ledger, maxItems);
  const runList = selection.selected.map((entry, index) => buildRunItem(entry, index + 1, ledger));
  const candidateSafetyBlockers = selection.selected.flatMap((entry) => candidateBlockers(entry, ledger));
  const policyBlockers = [];

  if (changedPaths.length > 0) {
    policyBlockers.push(
      blocker("target-repo-dirty", `Target repository has dirty paths: ${changedPaths.join(", ")}`, { changedPaths }),
    );
  }
  if (ledger.constraints.pushAllowed === true || ledger.constraints.pullRequestAllowed === true) {
    policyBlockers.push(blocker("push-pr-policy-unsafe", "Ledger constraints must not allow push or PR creation."));
  }
  if (ledger.constraints.noLocalOllama !== true) {
    policyBlockers.push(blocker("local-ollama-policy-missing", "Ledger must explicitly forbid Local/Ollama."));
  }
  if (ledger.constraints.noDependencyOrPackageChanges !== true) {
    policyBlockers.push(
      blocker("dependency-package-policy-missing", "Ledger must explicitly forbid dependency/package changes."),
    );
  }
  if (ledger.constraints.noRawJsxCopiedIntoProduct !== true) {
    policyBlockers.push(blocker("raw-jsx-policy-missing", "Ledger must explicitly forbid raw JSX product copies."));
  }

  const blockers = [
    ...context.blockers,
    ...selection.blockers,
    ...candidateSafetyBlockers,
    ...policyBlockers,
  ];
  const safetyPolicy = {
    childRunsAllowed: false,
    controlledMergeAllowed: false,
    dependencyPackageChangesAllowed: false,
    liveAeCepAllowed: false,
    liveParallelismAllowed: false,
    localOllamaAllowed: false,
    openAiCliLiveAllowedInThisRun: false,
    packageWritesAllowed: false,
    pushAllowed: false,
    pullRequestAllowed: false,
    rawJsxCopyAllowed: false,
    sourceRepoWritesAllowed: false,
    userAssetMutationAllowed: false,
    worktreesAllowed: false,
  };
  const report = {
    schema: PLAN_SCHEMA,
    auxiliaryId: AUXILIARY_ID,
    ok: blockers.length === 0,
    status: blockers.length === 0 ? "plan_only_ready" : "blocked",
    mode: "plan-only",
    ledgerPath: normalizeRepoPath(path.relative(targetRepo, ledgerPath)),
    ledgerSha256: ledgerHash,
    targetRepo,
    target: {
      branch: gitOutput(targetRepo, ["branch", "--show-current"], "branch-show-current"),
      changedPaths,
      currentHead: gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head"),
      ledgerBranch: ledger.target.branch,
      ledgerHead: ledger.target.head,
      remoteBranch: ledger.target.remoteBranch,
      remoteName: ledger.target.remoteName,
    },
    source: {
      checkout: normalizeRepoPath(ledger.source.checkout),
      repo: ledger.source.repo,
      revision: ledger.source.revision,
    },
    maxItems,
    selectedCandidateCount: runList.length,
    selectedCandidateIds: runList.map((entry) => entry.candidateId),
    nextCandidate: ledger.nextCandidate || null,
    sharedTrackedFiles: sharedOwnershipRecords(),
    phasePolicy: {
      parallelizablePreparationPhases: [
        "read_only_ledger_candidate_analysis",
        "importer_manifest_and_prompt_planning",
        "importer_owned_worktree_preparation_future_only",
      ],
      serialPhases: [
        "controlled_merge",
        "shared_file_merge",
        "non_live_validation",
        "read_only_cep_cdp_preflight",
        "generated_only_openai_cli_live_acceptance",
        "plan_update",
        "handoff_update",
        "commit",
        "remote_safety_check",
        "push_pr_gate",
      ],
      liveParallelismAllowed: false,
    },
    safetyPolicy,
    runList,
    blockers,
    context,
    planSha256: sha256Text(
      stableStringify({
        ledgerHash,
        maxItems,
        runList: runList.map((entry) => ({
          candidateId: entry.candidateId,
          classification: entry.classification,
          plannedPaths: entry.plannedPaths,
          queueRank: entry.queueRank,
          runId: entry.runId,
          sourcePath: entry.sourcePath,
        })),
        safetyPolicy,
      }),
    ),
    createdAt: new Date().toISOString(),
  };

  if (!report.ok) {
    throw new QueueSupervisorError(blockers.map((entry) => entry.code).join("; "), report);
  }
  return report;
}

function printResult(report, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Generic repo queue supervisor: ${report.status}\n`);
  process.stdout.write(`Selected: ${report.selectedCandidateIds.join(", ") || "none"}\n`);
  process.stdout.write(`Plan hash: ${report.planSha256}\n`);
  process.stdout.write(`Blockers: ${report.blockers.length ? report.blockers.map((entry) => entry.code).join(", ") : "none"}\n`);
}

async function main() {
  let asJson = false;
  try {
    const options = parseArgs(process.argv.slice(2));
    asJson = options.json === true;
    if (options.help) {
      process.stdout.write(HELP.trimStart());
      return;
    }
    const report = buildPlan(options, REPO_ROOT);
    printResult(report, asJson);
  } catch (error) {
    if (error instanceof QueueSupervisorError && error.report && asJson) {
      process.stdout.write(`${JSON.stringify(error.report, null, 2)}\n`);
    }
    console.error(error.message);
    process.exitCode = 1;
  }
}

export { buildPlan };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

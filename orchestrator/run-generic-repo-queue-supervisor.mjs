#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { runImporter } from "./run-generic-repo-tool-importer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const PLAN_SCHEMA = "generic-repo-queue-supervisor.plan-only.v1";
const BATCH_SCHEMA = "generic-repo-queue-supervisor.batch-report.v1";
const AUXILIARY_ID = "AUX-031";
const BATCH_AUXILIARY_ID = "AUX-038";
const DEFAULT_LEDGER_PATH =
  ".codex-runtime/sdk/generic-repo-importer/kyletmartinez-after-effects-scripts-intake/queue-ledger.json";
const BATCH_ROOT_RELATIVE = ".codex-runtime/sdk/generic-repo-queue-supervisor";
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
  node orchestrator/run-generic-repo-queue-supervisor.mjs --batch --ledger <path> --max-items <n> --json

Options:
  --ledger <path>        Durable generic repository importer ledger.
                        Defaults to ${DEFAULT_LEDGER_PATH}
  --target-repo <path>   Optional target repo override. Defaults to ledger.target.repoPath.
  --max-items <n>        Number of queued safe ranked candidates to plan. Default 3.
  --run-id <id>          Optional stable batch runtime id.
  --report-dir <path>    Optional report root inside target repo.
  --context-percent <n>  Fail closed at >= 70 before any new work.
  --plan-only            Required; this supervisor never executes candidates.
  --batch                Process a bounded queue batch. Safe candidates with a
                        ready/not-required live gate run through importer
                        non-live validation; missing live lanes are recorded
                        per candidate as blocked_needs_live_lane.
  --prepare-only         With --batch, stop after importer analysis and
                        implementation planning instead of child runs/merge.
  --json                 Print machine-readable output.
  --help                 Show this help.

This first bounded layer only reads the ledger, verifies safety gates, and emits
a deterministic plan-only run list. It does not create worktrees, run child
commands, perform controlled merge, run validation, run live AE/CEP/CDP/OpenAI
CLI lanes, write source repositories, change packages, push, or create PRs.

Batch mode is still non-live: it writes ignored runtime evidence, rejects
Local/Ollama and fallback providers, never runs live AE/CEP/CDP/OpenAI CLI lanes,
never writes source repositories, never changes package files, and never pushes
or creates PRs.
`;

const VALUE_OPTIONS = new Set(["context-percent", "ledger", "max-items", "report-dir", "run-id", "target-repo"]);
const BOOLEAN_OPTIONS = new Set(["batch", "help", "json", "plan-only", "prepare-only"]);

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

function safeId(value, fallback = "batch") {
  return (
    String(value || fallback)
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || fallback
  );
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
  const match = String(entry || "").match(/^.{1,2}\s+(.+)$/);
  const raw = (match ? match[1] : entry.slice(3)).trim();
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

function resolveInside(root, candidate, label) {
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return resolved;
  }
  throw new Error(`${label}-outside-target-repo: ${candidate}`);
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

function resolveSourceCheckout(targetRepo, ledger) {
  const checkout = ledger.source?.checkout || "";
  const resolved = path.isAbsolute(checkout) ? checkout : path.resolve(targetRepo, checkout);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(`source-checkout-missing: ${resolved}`);
  }
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

function candidateNonLiveSafetyBlockers(entry, ledger) {
  return candidateBlockers(entry, ledger).filter((entryBlocker) => entryBlocker.code !== "required-live-lane-missing");
}

function targetPolicyBlockers(ledger, changedPaths) {
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

  return policyBlockers;
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

function selectQueuedRankedCandidatesForBatch(ledger, maxItems) {
  const candidates = [];
  const unrankedSafeCandidates = [];

  ledger.entries.forEach((entry, index) => {
    validateEntryShape(entry, `ledger.entries[${index}]`);
    const safe = SAFE_CLASSIFICATIONS.has(entry.classification);
    const ranked = Number.isInteger(entry.queueRank);
    if (entry.status === "queued" && ranked) {
      candidates.push(entry);
    } else if (entry.status === "queued" && safe && !ranked) {
      unrankedSafeCandidates.push({
        candidateId: entry.id,
        classification: entry.classification,
        sourcePath: entry.sourcePath,
        status: "skipped_missing_queue_rank",
      });
    }
  });

  candidates.sort((left, right) => left.queueRank - right.queueRank || left.id.localeCompare(right.id));
  return { selected: candidates.slice(0, maxItems), unrankedSafeCandidates };
}

function classifyBatchCandidate(entry, index, ledger) {
  const runItem = buildRunItem(entry, index, ledger);
  const liveLane = liveLaneEvidence(entry.liveGate);
  const safeClassification = SAFE_CLASSIFICATIONS.has(entry.classification);
  const safetyBlockers = candidateNonLiveSafetyBlockers(entry, ledger);
  let status = "eligible_for_import";
  let reason = "safe_candidate_ready_for_non_live_import";
  let blockers = [];

  if (!safeClassification) {
    status = "skipped_unsafe_classification";
    reason = `classification_not_allowed:${entry.classification}`;
    blockers = [
      blocker("unsafe-ranked-candidate", `Queued ranked candidate ${entry.id} has unsafe classification ${entry.classification}.`, {
        classification: entry.classification,
        queueRank: entry.queueRank,
      }),
    ];
  } else if (safetyBlockers.length > 0) {
    status = "blocked_policy";
    reason = "candidate_non_live_safety_policy_blocked";
    blockers = safetyBlockers;
  } else if (!liveLane.ok) {
    status = "blocked_needs_live_lane";
    reason = liveLane.reason;
    blockers = [
      blocker("required-live-lane-missing", `Required generated-only live lane is not registered for ${entry.id}.`, {
        liveGateStatus: entry.liveGate.status,
        reason: liveLane.reason,
        sourcePath: entry.sourcePath,
      }),
    ];
  }

  return {
    ...runItem,
    status,
    reason,
    blockers,
    eligibleForImport: status === "eligible_for_import",
  };
}

function batchRunId(options, ledgerHash) {
  if (options.runId) {
    return safeId(options.runId, "aux038-batch").slice(0, 80);
  }
  return safeId(`aux038-${Date.now().toString(36)}-${ledgerHash.slice(0, 8)}`, "aux038-batch").slice(0, 80);
}

function batchReportPath(targetRepo, options, runId) {
  const reportRoot = options.reportDir
    ? resolveInside(targetRepo, options.reportDir, "batch-report-dir")
    : path.join(targetRepo, BATCH_ROOT_RELATIVE);
  return path.join(reportRoot, runId, "batch-report.json");
}

function importerManifestPath(targetRepo, options, runId) {
  const reportRoot = options.reportDir
    ? resolveInside(targetRepo, options.reportDir, "batch-report-dir")
    : path.join(targetRepo, BATCH_ROOT_RELATIVE);
  return path.join(reportRoot, runId, "importer.manifest.json");
}

function batchStatus({ eligibleItems, importError, importerResult, items, policyBlockers, prepareOnly }) {
  if (policyBlockers.length > 0) {
    return "blocked_before_batch";
  }
  if (importError) {
    return "failed_during_import";
  }
  if (eligibleItems.length === 0) {
    return items.some((item) => item.status === "blocked_needs_live_lane")
      ? "completed_with_blocked_candidates"
      : "completed_no_importable_candidates";
  }
  if (prepareOnly) {
    return "prepared";
  }
  if (importerResult?.nonLiveValidationComplete === true) {
    return "imported_non_live_validated";
  }
  return "completed";
}

function buildImporterManifest({ eligibleItems, ledger, runId, sourceCheckout, targetRepo }) {
  const plannedPaths = sortedUnique(eligibleItems.flatMap((item) => item.plannedPaths));
  const candidateIds = eligibleItems.map((item) => item.candidateId);
  const batchId = safeId(`queue-batch-${candidateIds.length}-${sha256Text(candidateIds.join("|")).slice(0, 10)}`);

  return {
    schema: "generic-repo-tool-importer.manifest.v1",
    run: {
      runId: safeId(`queue-${runId}`, "queue-batch").slice(0, 80),
      createdAt: new Date().toISOString(),
      requestedGoal: `Import safe generic repository queue candidates: ${candidateIds.join(", ")}`,
      codexCliOnly: true,
      resumable: true,
      resumeFromState: true,
      defaultModel: "gpt-5.5",
      webSearch: "disabled",
    },
    sourceRepo: {
      inputKind: "local-path",
      location: sourceCheckout,
      revision: ledger.source.revision,
      allowedReadRoots: [sourceCheckout],
      deniedReadRoots: [".git", "node_modules"],
    },
    targetRepo: {
      path: targetRepo,
      allowedWritePaths: plannedPaths,
      forbiddenWritePaths: [
        ".git/**",
        "node_modules/**",
        "package.json",
        "package-lock.json",
        "npm-shrinkwrap.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "bun.lockb",
        "deno.json",
        "deno.lock",
        "jsr.json",
        "cep-panel/**",
      ],
      branchPolicy: "do-not-create-branch-by-default",
      pushPolicy: "manual-user-approval-required",
    },
    intake: {
      fingerprintFiles: ["package.json", "README.md"],
      inventoryRules: ["queue-supervisor-safe-ranked-candidates"],
      licensePolicy: "classify-before-import",
      secretPolicy: "reject-secrets",
      sizeLimits: {
        maxFiles: 1000,
        maxBytes: 20 * 1024 * 1024,
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
      plannedPathsPerBatch: [
        {
          id: batchId,
          candidateIds,
          plannedPaths,
        },
      ],
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
      forbiddenPaths: [
        ".git/**",
        "node_modules/**",
        "package.json",
        "package-lock.json",
        "npm-shrinkwrap.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "bun.lockb",
        "deno.json",
        "deno.lock",
        "jsr.json",
        "cep-panel/**",
      ],
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

function runBatch(options, cwd = process.cwd()) {
  if (options.batch !== true) {
    throw new Error("--batch is required for generic repo queue batch mode.");
  }
  if (options.planOnly === true) {
    throw new Error("--batch and --plan-only are mutually exclusive.");
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
  const runId = batchRunId(options, ledgerHash);
  const reportPath = batchReportPath(targetRepo, options, runId);
  const manifestPath = importerManifestPath(targetRepo, options, runId);
  const context = contextBlockers(options);
  const changedPathsBefore = gitChangedPaths(targetRepo);
  const selection = selectQueuedRankedCandidatesForBatch(ledger, maxItems);
  const items = selection.selected.map((entry, index) => classifyBatchCandidate(entry, index + 1, ledger));
  const eligibleItems = items.filter((item) => item.eligibleForImport);
  const policyBlockers = [...context.blockers, ...targetPolicyBlockers(ledger, changedPathsBefore)];
  const prepareOnly = options.prepareOnly === true;
  let importerResult = null;
  let importerError = null;
  let importerManifest = null;
  let sourceCheckout = null;

  if (policyBlockers.length === 0 && eligibleItems.length > 0) {
    try {
      sourceCheckout = resolveSourceCheckout(targetRepo, ledger);
      importerManifest = buildImporterManifest({
        eligibleItems,
        ledger,
        runId,
        sourceCheckout,
        targetRepo,
      });
      writeJson(manifestPath, importerManifest);
      importerResult = runImporter(
        {
          manifest: manifestPath,
          "run-analysis": true,
          "plan-implementation": true,
          "run-implementation-worktrees": !prepareOnly,
          "run-implementation-child-runs": !prepareOnly,
          "apply-controlled-merge": !prepareOnly,
          "run-non-live-validation": !prepareOnly,
        },
        REPO_ROOT,
      );
      for (const item of eligibleItems) {
        item.status = prepareOnly ? "prepared" : "imported_non_live_validated";
        item.reason = prepareOnly ? "importer_prepared_candidate_batch" : "importer_non_live_validation_passed";
        item.importerRunId = importerResult.runId;
      }
    } catch (error) {
      importerError = error;
      for (const item of eligibleItems) {
        item.status = "failed_importer";
        item.reason = error.message;
        item.importerRunId = importerManifest?.run?.runId || null;
      }
    }
  }

  const changedPathsAfter = gitChangedPaths(targetRepo);
  const importedCandidateCount =
    importerResult && importerError === null && prepareOnly === false ? eligibleItems.length : 0;
  const preparedCandidateCount =
    importerResult && importerError === null && prepareOnly === true ? eligibleItems.length : 0;
  const report = {
    schema: BATCH_SCHEMA,
    auxiliaryId: BATCH_AUXILIARY_ID,
    ok: policyBlockers.length === 0 && importerError === null,
    status: batchStatus({
      eligibleItems,
      importError: importerError,
      importerResult,
      items,
      policyBlockers,
      prepareOnly,
    }),
    mode: "batch",
    runId,
    reportPath: normalizeRepoPath(path.relative(targetRepo, reportPath)),
    ledgerPath: normalizeRepoPath(path.relative(targetRepo, ledgerPath)),
    ledgerSha256: ledgerHash,
    targetRepo,
    target: {
      branch: gitOutput(targetRepo, ["branch", "--show-current"], "branch-show-current"),
      changedPathsBefore,
      changedPathsAfter,
      currentHead: gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head"),
      ledgerBranch: ledger.target.branch,
      ledgerHead: ledger.target.head,
      remoteBranch: ledger.target.remoteBranch,
      remoteName: ledger.target.remoteName,
    },
    source: {
      checkout: sourceCheckout
        ? normalizeRepoPath(path.relative(targetRepo, sourceCheckout)) || normalizeRepoPath(sourceCheckout)
        : normalizeRepoPath(ledger.source.checkout),
      repo: ledger.source.repo,
      revision: ledger.source.revision,
    },
    maxItems,
    consideredCandidateCount: items.length,
    eligibleCandidateCount: eligibleItems.length,
    importedCandidateCount,
    preparedCandidateCount,
    blockedCandidateCount: items.filter((item) => item.status.startsWith("blocked_")).length,
    skippedCandidateCount: items.filter((item) => item.status.startsWith("skipped_")).length,
    selectedCandidateIds: items.map((item) => item.candidateId),
    eligibleCandidateIds: eligibleItems.map((item) => item.candidateId),
    blockedCandidateIds: items
      .filter((item) => item.status === "blocked_needs_live_lane")
      .map((item) => item.candidateId),
    unrankedSafeCandidates: selection.unrankedSafeCandidates,
    nextCandidate: ledger.nextCandidate || null,
    prepareOnly,
    runImports: !prepareOnly,
    importer: importerManifest
      ? {
          manifestPath: normalizeRepoPath(path.relative(targetRepo, manifestPath)),
          runId: importerManifest.run.runId,
          result: importerResult,
          error: importerError ? importerError.message : null,
        }
      : {
          manifestPath: null,
          runId: null,
          result: null,
          error: null,
          skippedReason: policyBlockers.length > 0 ? "policy_blocked" : "no_eligible_candidates",
        },
    validation: {
      nonLiveValidationRun: importerResult?.validationCommandsRun === true,
      nonLiveValidationComplete: importerResult?.nonLiveValidationComplete === true,
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
      pushOrPrCreated: false,
    },
    safetyPolicy: {
      dependencyPackageChangesAllowed: false,
      liveAeCepAllowed: false,
      liveParallelismAllowed: false,
      localOllamaAllowed: false,
      packageWritesAllowed: false,
      pushAllowed: false,
      pullRequestAllowed: false,
      rawJsxCopyAllowed: false,
      sourceRepoWritesAllowed: false,
      userAssetMutationAllowed: false,
    },
    items,
    blockers: policyBlockers,
    context,
    createdAt: new Date().toISOString(),
  };
  report.batchSha256 = sha256Text(
    stableStringify({
      eligibleCandidateIds: report.eligibleCandidateIds,
      items: report.items.map((item) => ({
        candidateId: item.candidateId,
        plannedPaths: item.plannedPaths,
        queueRank: item.queueRank,
        reason: item.reason,
        status: item.status,
      })),
      ledgerHash,
      maxItems,
      prepareOnly,
      status: report.status,
    }),
  );

  writeJson(reportPath, report);
  if (!report.ok) {
    throw new QueueSupervisorError(
      policyBlockers.length > 0
        ? policyBlockers.map((entry) => entry.code).join("; ")
        : `batch-importer-failed: ${importerError.message}`,
      report,
    );
  }
  return report;
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
  const policyBlockers = targetPolicyBlockers(ledger, changedPaths);

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
  if (report.schema === BATCH_SCHEMA) {
    process.stdout.write(`Generic repo queue supervisor batch: ${report.status}\n`);
    process.stdout.write(`Considered: ${report.selectedCandidateIds.join(", ") || "none"}\n`);
    process.stdout.write(`Eligible: ${report.eligibleCandidateIds.join(", ") || "none"}\n`);
    process.stdout.write(`Report: ${report.reportPath}\n`);
    process.stdout.write(`Blockers: ${report.blockers.length ? report.blockers.map((entry) => entry.code).join(", ") : "none"}\n`);
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
    const report = options.batch === true ? runBatch(options, REPO_ROOT) : buildPlan(options, REPO_ROOT);
    printResult(report, asJson);
  } catch (error) {
    if (error instanceof QueueSupervisorError && error.report && asJson) {
      process.stdout.write(`${JSON.stringify(error.report, null, 2)}\n`);
    }
    console.error(error.message);
    process.exitCode = 1;
  }
}

export { buildPlan, runBatch };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { runBatch } from "./run-generic-repo-queue-supervisor.mjs";
import { runImporter } from "./run-generic-repo-tool-importer.mjs";
import {
  parallelCandidateWorktreeModeEnabled,
  runParallelCandidateWorktrees,
} from "./parallel-candidate-worktrees.mjs";
import boundedProcess from "./bounded-process-result.cjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const { boundedSpawnSyncResult, readCompactJson, writeProcessLog } = boundedProcess;
const RUN_SCHEMA = "generic-repo-full-intake.run.v1";
const STATE_SCHEMA = "generic-repo-full-intake.state.v1";
const PROOF_ENVELOPE_SCHEMA = "generic-repo-full-intake.proof-envelope.v1";
const RESUME_CARD_SCHEMA = "generic-repo-full-intake.resume-card.v1";
const RESOLUTION_TICKET_SCHEMA = "generic-repo-full-intake.resolution-ticket.v1";
const RECOVERY_VALIDATION_SCHEMA = "generic-repo-full-intake.recovery-validation.v1";
const CHILD_TIMEOUT_RECOVERY_SCHEMA = "generic-repo-full-intake.child-timeout-recovery.v1";
const AUXILIARY_ID = "AUX-043";
const DEFAULT_LEDGER_PATH =
  ".codex-runtime/sdk/generic-repo-importer/kyletmartinez-after-effects-scripts-intake/queue-ledger.json";
const DEFAULT_RUN_ROOT_RELATIVE = ".codex-runtime/sdk/generic-repo-full-intake";
const DEFAULT_LIVE_LANE_REGISTRY = "orchestrator/generic-repo-live-lane-registry.json";
const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_RESULT_TAIL_LINES = 40;
const CHILD_RESULT_SUMMARY_MAX_BYTES = 64 * 1024;
const BATCH_REPORT_SUMMARY_MAX_BYTES = 192 * 1024;
const PROOF_ENVELOPE_MAX_BYTES = 32 * 1024;
const RESUME_CARD_MAX_BYTES = 8 * 1024;
const RESUME_CARD_MAX_LINES = 30;
const DEFAULT_CONTEXT_BUDGET = Object.freeze({
  softStopPercent: 72,
  noNewWorkPercent: 80,
  handoffPercent: 86,
  hardStopPercent: 100,
});
const MAX_NORMAL_HANDOFF_PERCENT = 100;
const MAX_NORMAL_HARD_STOP_PERCENT = 100;
const CONTEXT_STEP_COST = Object.freeze({
  recoveryBranch: 8,
  resumePreflight: 1,
  childRun: 6,
  importerPhase: 6,
  liveLane: 8,
  liveRerun: 6,
  ledgerMutation: 2,
  docsHandoffWrite: 3,
  commit: 3,
  finalization: 2,
});
const STRICT_PHASES = Object.freeze([
  "select_candidate",
  "prove_or_register_live_lane",
  "run_importer_phase",
  "controlled_merge",
  "non_live_validation",
  "generated_only_live_rerun",
  "ledger_docs_handoff_commit_finalization",
]);
const SAFE_CLASSIFICATIONS = new Set([
  "existing_typed_tools_recipe_only",
  "small_safe_typed_tool_library_recipe_addition",
]);
const LIVE_LANE_RECLASSIFIABLE_CLASSIFICATIONS = new Set([
  "live_lane_needed",
]);
const SELF_IMPROVEMENT_RECLASSIFIABLE_CLASSIFICATIONS = new Set([
  "live_lane_needed",
  "unsafe_skip_tool_gap",
]);
const SYNTHESIZABLE_CLASSIFICATIONS = new Set([
  ...SAFE_CLASSIFICATIONS,
  ...LIVE_LANE_RECLASSIFIABLE_CLASSIFICATIONS,
]);
const LIVE_LANE_READY_STATUSES = new Set([
  "available",
  "generated_only_lane_registered",
  "passed",
  "ready",
  "registered",
  "reusable_lane_available",
]);
const TERMINAL_ITEM_STATUSES = new Set([
  "blocked_live_lane_synthesis_ambiguous",
  "blocked_live_lane_synthesis_incomplete",
  "blocked_live_lane_synthesis_unsafe",
  "blocked_live_lane_template_missing",
  "blocked_live_lane_validation_failed",
  "blocked_live_preflight_failed",
  "blocked_live_proof_failed",
  "blocked_policy",
  "completed",
  "failed_import",
  "failed_live_rerun",
  "recovered_patch_non_live_validated_pending_semantic_review",
  "skipped_unsafe_candidate",
]);
const RECOVERABLE_LIVE_LANE_STATUSES = new Set([
  "blocked_live_lane_synthesis_ambiguous",
  "blocked_live_lane_synthesis_incomplete",
  "blocked_live_lane_template_missing",
]);
const CHILD_TIMEOUT_REASONS = Object.freeze([
  "implementation-child-run-timeout",
]);
const IMPORT_RETRY_REASONS = Object.freeze([
  "resume-manifest-hash-mismatch",
]);
const LEGACY_REASONING_EFFORT_CLI_ERROR = "unexpected argument '--reasoning-effort'";
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
const DEFAULT_PREFLIGHT_COMMANDS = Object.freeze([
  "node scripts/cep-panel-cdp-smoke.js inspect",
  "node scripts/cep-panel-cdp-smoke.js connector-status-smoke",
]);
const AUTO_LANE_UNSAFE_SIGNAL_FIELDS = Object.freeze([
  "destructiveCleanup",
  "thirdPartyAssumption",
  "usesFileIo",
  "usesRenderQueue",
  "usesSettings",
]);
const AUTO_LANE_COMMON_NON_LIVE_COMMANDS = Object.freeze([
  "node --check scripts/cep-panel-cdp-smoke.js",
]);
const AUTO_LANE_READ_BACK_POLICY = Object.freeze({
  generatedOnly: true,
  readBackRequired: true,
  semanticVerificationRequired: true,
});
const AUTO_LANE_FAMILIES = Object.freeze([
  {
    id: "generated-shape-effect-layer",
    requiredTools: ["create_shape_layer", "add_effect"],
    allowedTools: [
      "add_effect",
      "create_shape_layer",
      "get_active_comp",
      "get_comp_details",
      "get_effect_details",
      "get_layer_details",
      "list_effects",
    ],
    command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-background-layer-openai-cli-smoke",
    proofLane: "background-layer",
    readBackTools: ["get_comp_details", "get_layer_details"],
    semanticVerification: true,
    scope:
      "generated-only shape/effect layer family proof using create_shape_layer, add_effect, get_comp_details, and get_layer_details; candidate-specific native adjustment/guide semantics remain fail-closed in the recipe",
  },
  {
    id: "generated-shape-layer-readback",
    requiredTools: ["create_shape_layer"],
    allowedTools: [
      "create_shape_layer",
      "get_active_comp",
      "get_comp_details",
      "get_layer_details",
    ],
    command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-composition-guide-openai-cli-smoke",
    proofLane: "composition-guide",
    readBackTools: ["get_comp_details", "get_layer_details"],
    semanticVerification: true,
    scope:
      "generated-only shape layer read-back family proof using create_shape_layer, get_comp_details, and get_layer_details; native guide-layer semantics remain fail-closed in the recipe",
  },
  {
    id: "selected-layer-rename",
    requiredTools: ["get_selected_layers", "rename_layers"],
    allowedTools: [
      "get_active_comp",
      "get_comp_details",
      "get_selected_layers",
      "rename_layers",
    ],
    command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-rename-find-replace-openai-cli-smoke",
    proofLane: "rename-find-replace",
    readBackTools: ["get_comp_details"],
    semanticVerification: true,
    scope:
      "generated-only selected-layer rename family proof using get_selected_layers, rename_layers, and get_comp_details; candidate-specific naming conventions must be explicit in the recipe",
  },
  {
    id: "selected-layer-duplicate",
    requiredTools: ["get_selected_layers", "duplicate_layers"],
    allowedTools: [
      "duplicate_layers",
      "get_active_comp",
      "get_comp_details",
      "get_selected_layers",
    ],
    command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-duplicate-layers-openai-cli-smoke",
    proofLane: "duplicate-layers",
    readBackTools: ["get_comp_details"],
    semanticVerification: true,
    scope:
      "generated-only selected-layer duplicate family proof using get_selected_layers, duplicate_layers, and get_comp_details; exact source placement semantics remain fail-closed in the recipe",
  },
  {
    id: "layer-timing-generated-only",
    requiredTools: ["set_layer_time_range", "stagger_layers"],
    allowedTools: [
      "get_active_comp",
      "get_comp_details",
      "get_selected_layers",
      "set_layer_time_range",
      "stagger_layers",
    ],
    command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-layer-timing-openai-cli-smoke",
    proofLane: "layer-timing",
    readBackTools: ["get_comp_details", "get_layer_details"],
    semanticVerification: true,
    scope:
      "generated-only layer timing family proof using set_layer_time_range, stagger_layers, get_comp_details, and get_layer_details; random, below-layer, and selection-specific timing semantics remain explicit recipe constraints",
  },
  {
    id: "layer-transform-fit-generated-only",
    requiredTools: ["fit_layer_to_comp", "set_layer_transform"],
    allowedTools: [
      "fit_layer_to_comp",
      "get_active_comp",
      "get_layer_details",
      "get_selected_layers",
      "set_layer_transform",
    ],
    command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-layer-transform-openai-cli-smoke",
    proofLane: "layer-transform-fit",
    readBackTools: ["get_layer_details"],
    semanticVerification: true,
    scope:
      "generated-only layer transform/fit family proof using set_layer_transform, fit_layer_to_comp, and get_layer_details; average-position and selection-derived transforms remain explicit recipe constraints",
  },
  {
    id: "project-item-rename-source-generated-only",
    requiredTools: ["rename_project_items", "replace_layer_source"],
    allowedTools: [
      "create_project_folder",
      "get_project_info",
      "move_project_items_to_folder",
      "rename_project_items",
      "replace_layer_source",
    ],
    command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-project-items-openai-cli-smoke",
    proofLane: "project-items",
    readBackTools: ["find_project_items", "get_comp_details", "list_project_folder_items"],
    semanticVerification: true,
    scope:
      "generated-only project-item rename/source family proof using create_project_folder, move_project_items_to_folder, replace_layer_source, rename_project_items, and read-back; imported/user footage and file I/O remain fail-closed",
  },
  {
    id: "effect-property-generated-only",
    requiredTools: ["add_effect", "get_effect_details", "set_effect_property"],
    allowedTools: [
      "add_effect",
      "get_active_comp",
      "get_effect_details",
      "get_selected_layers",
      "set_effect_property",
    ],
    command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-effect-property-openai-cli-smoke",
    proofLane: "effect-property",
    readBackTools: ["get_effect_details", "get_layer_details"],
    semanticVerification: true,
    scope:
      "generated-only effect property family proof using add_effect, get_effect_details, set_effect_property, and read-back; expression-rig semantics and locale-specific property assumptions remain explicit recipe constraints",
  },
  {
    id: "selected-property-expression-generated-only",
    requiredTools: ["get_selected_properties", "set_expression", "clear_expression"],
    allowedTools: [
      "clear_expression",
      "get_active_comp",
      "get_layer_details",
      "get_selected_properties",
      "set_expression",
    ],
    command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-expression-openai-cli-smoke",
    proofLane: "selected-property-expression",
    readBackTools: ["get_selected_properties", "get_layer_details"],
    semanticVerification: true,
    plannedPaths: [
      "scripts/agent-scenario-fixtures.js",
      "scripts/cep-panel-cdp-smoke.js",
    ],
    reclassifiedClassification: "existing_typed_tools_recipe_only",
    scope:
      "generated-only expression set/clear family proof using get_selected_properties, set_expression, clear_expression, get_layer_details, read-back, semantic verification, and cleanup; source-specific selected-property semantics remain explicit recipe constraints",
  },
  {
    id: "comp-properties-work-area-generated-only",
    requiredTools: ["get_comp_details", "set_comp_properties", "set_comp_work_area"],
    allowedTools: [
      "get_active_comp",
      "get_comp_details",
      "rename_project_items",
      "set_comp_properties",
      "set_comp_work_area",
      "set_property_value",
    ],
    candidateIds: [
      "tool-compositions-change-nested-composition-background",
      "tool-compositions-change-nested-composition-duration",
      "tool-compositions-change-nested-composition-duration-with-timecode",
      "tool-compositions-change-nested-composition-frame-rate",
      "tool-compositions-change-nested-composition-start-frame",
      "tool-compositions-change-nested-composition-work-area",
      "tool-compositions-cycle-composition-background-color",
    ],
    command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-comp-properties-openai-cli-smoke",
    proofLane: "comp-properties-work-area",
    readBackTools: ["get_comp_details"],
    semanticVerification: true,
    plannedPaths: [
      "scripts/agent-scenario-fixtures.js",
      "scripts/cep-panel-cdp-smoke.js",
    ],
    reclassifiedClassification: "existing_typed_tools_recipe_only",
    scope:
      "generated-only explicit composition properties/work-area proof using set_comp_properties, set_comp_work_area, get_comp_details, read-back, semantic verification, and cleanup; recursive nested-comp traversal, layer switches, and broad composition workflows remain fail-closed",
  },
]);

const HELP = `
Generic repository full-intake orchestrator

Usage:
  node orchestrator/run-generic-repo-full-intake.mjs --ledger <path> --run-id <id> --max-items <n> --json

Options:
  --ledger <path>              Durable generic repository importer ledger.
                              Defaults to ${DEFAULT_LEDGER_PATH}
  --run-id <id>                Stable run id. Required for resumable runs.
  --max-items <n>              Number of queued ranked candidates to consider. Default 1.
  --target-repo <path>         Optional target repo override. Defaults to ledger.target.repoPath.
  --live-lane-registry <path>  Candidate live-lane template registry.
                              Defaults to ${DEFAULT_LIVE_LANE_REGISTRY}
  --report-dir <path>          Optional run root inside target repo.
  --context-percent <n>        Required for longrun work; unknown context stops before new work.
  --soft-stop-percent <n>      Start conservative resume posture. Default ${DEFAULT_CONTEXT_BUDGET.softStopPercent}.
  --no-new-work-percent <n>    Refuse new work when current+predicted cost reaches this. Default ${DEFAULT_CONTEXT_BUDGET.noNewWorkPercent}.
  --handoff-percent <n>        Write only compact handoff/resume artifacts at this point. Default ${DEFAULT_CONTEXT_BUDGET.handoffPercent}; normal max ${MAX_NORMAL_HANDOFF_PERCENT}.
  --hard-stop-percent <n>      Fail closed with context pressure at this point. Default ${DEFAULT_CONTEXT_BUDGET.hardStopPercent}; normal max ${MAX_NORMAL_HARD_STOP_PERCENT}.
  --next-step-context-cost <n> Override the first predicted step cost.
  --command-timeout-ms <n>     Per-command timeout. Default ${DEFAULT_COMMAND_TIMEOUT_MS}.
  --allow-batch-mode           Explicitly approve parent-facing max-items > 1.
  --allow-self-improvement-lane-synthesis
                              Allow bounded live-lane synthesis. Default is disabled.
  --resolution-candidate-ids <ids>
                              Optional comma-separated candidate ids for scoped
                              live-lane/import-failure resolution processing.
  --parallel-candidate-worktrees
                              Opt in to AUX parallel candidate worktrees and a
                              serial parent reducer. Default serial behavior is unchanged.
  --parallel-candidate-limit <n>
                              Maximum candidates to schedule in opt-in parallel mode.
  --parallel-candidate-ids <ids>
                              Optional comma-separated scoped candidate ids for
                              fixture/test parallel mode.
  --plan-parallel-candidate-worktrees
                              Write only the parallel scheduling plan; do not create worktrees.
  --no-commit                  Do not create git commits after completed candidates.
  --json                       Write full machine-readable output only with --output, or print only with --allow-full-json-for-debug.
  --output <path>              Full JSON output path for --json. Stdout stays compact.
  --allow-full-json-for-debug  Permit full run report on stdout for local debug only.
  --compact-json               Print bounded parent-facing machine-readable output.
                              This parent-facing mode runs exactly one durable
                              transaction phase per invocation.
  --help                       Show this help.

The parent-facing loop is serial at strict durable boundaries:
select_candidate, prove_or_register_live_lane, run_importer_phase,
controlled_merge, non_live_validation, generated_only_live_rerun, and
ledger_docs_handoff_commit_finalization.
`;

const VALUE_OPTIONS = new Set([
  "command-timeout-ms",
  "context-percent",
  "ledger",
  "live-lane-registry",
  "handoff-percent",
  "hard-stop-percent",
  "max-items",
  "next-step-context-cost",
  "no-new-work-percent",
  "output",
  "parallel-candidate-ids",
  "parallel-candidate-limit",
  "report-dir",
  "resolution-candidate-ids",
  "run-id",
  "soft-stop-percent",
  "target-repo",
]);
const BOOLEAN_OPTIONS = new Set([
  "allow-batch-mode",
  "allow-full-json-for-debug",
  "allow-self-improvement-lane-synthesis",
  "compact-json",
  "help",
  "json",
  "no-commit",
  "parallel-candidate-worktrees",
  "plan-parallel-candidate-worktrees",
]);
const COMPACT_OUTPUT_ID_LIMIT = 16;
const COMPACT_OUTPUT_FAMILY_LIMIT = 12;
const COMPACT_OUTPUT_COMMIT_LIMIT = 24;

class FullIntakeError extends Error {
  constructor(message, report = null) {
    super(message);
    this.name = "FullIntakeError";
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

function safeId(value, fallback = "run") {
  return (
    String(value || fallback)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || fallback
  );
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label}-json-read-failed: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function sha256FileIfExists(filePath) {
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return null;
  }
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sha256Json(value) {
  return sha256Text(stableStringify(value));
}

function parsePositiveInteger(value, label, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseFiniteNumber(value, label) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a finite number`);
  }
  return parsed;
}

function parsePercent(value, label, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = parseFiniteNumber(value, label);
  if (parsed < 0 || parsed > 100) {
    throw new Error(`${label} must be between 0 and 100`);
  }
  return parsed;
}

function parseCsvSet(value) {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? new Set(items) : null;
}

function candidateAllowedByResolutionScope(entry, scopeIds) {
  if (!scopeIds || scopeIds.size === 0) return true;
  return scopeIds.has(entry.id);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
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
  const raw = (match ? match[1] : String(entry || "").slice(3)).trim();
  const renameIndex = raw.indexOf(" -> ");
  return normalizeRepoPath(renameIndex >= 0 ? raw.slice(renameIndex + 4) : raw);
}

function gitStatusEntries(cwd) {
  const output = gitOutput(cwd, ["status", "--porcelain=v1", "--untracked-files=all"], "status");
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function gitChangedPaths(cwd) {
  return gitStatusEntries(cwd).map(statusEntryPath).filter(Boolean).sort();
}

function gitStatusSha256(cwd) {
  return sha256Text(gitStatusEntries(cwd).join("\n"));
}

function gitCommitChangedPaths(cwd, commitId) {
  if (!commitId) {
    return [];
  }
  const output = gitOutput(cwd, ["show", "--name-only", "--format=", commitId], "show-name-only");
  return output.split(/\r?\n/).map(normalizeRepoPath).filter(Boolean).sort();
}

function gitPathIsIgnored(cwd, repoPath) {
  const result = spawnSync("git", ["check-ignore", "-q", repoPath], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function gitPathIsTracked(cwd, repoPath) {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", repoPath], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function isDependencyPath(repoPath) {
  return DEPENDENCY_PATHS.has(normalizeRepoPath(repoPath));
}

function isRawJsxTargetPath(repoPath) {
  return /\.(jsx|jsxinc)$/i.test(normalizeRepoPath(repoPath));
}

function pathStartsWith(child, parent) {
  const normalizedChild = normalizeRepoPath(child);
  const normalizedParent = normalizeRepoPath(parent).replace(/\/+$/, "");
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

function resolveInside(root, candidate, label) {
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return resolved;
  }
  throw new Error(`${label}-outside-target-repo: ${candidate}`);
}

function contextBudgetFromOptions(options) {
  const softStopPercent = parsePercent(options.softStopPercent, "soft-stop-percent", DEFAULT_CONTEXT_BUDGET.softStopPercent);
  const noNewWorkPercent = parsePercent(options.noNewWorkPercent, "no-new-work-percent", DEFAULT_CONTEXT_BUDGET.noNewWorkPercent);
  const handoffPercent = parsePercent(options.handoffPercent, "handoff-percent", DEFAULT_CONTEXT_BUDGET.handoffPercent);
  const hardStopPercent = parsePercent(options.hardStopPercent, "hard-stop-percent", DEFAULT_CONTEXT_BUDGET.hardStopPercent);
  if (handoffPercent > MAX_NORMAL_HANDOFF_PERCENT || hardStopPercent > MAX_NORMAL_HARD_STOP_PERCENT) {
    throw new Error(`context-budget-threshold-too-high: handoff<=${MAX_NORMAL_HANDOFF_PERCENT}, hard-stop<=${MAX_NORMAL_HARD_STOP_PERCENT}`);
  }
  if (!(softStopPercent <= noNewWorkPercent && noNewWorkPercent <= handoffPercent && handoffPercent <= hardStopPercent)) {
    throw new Error("context-budget-thresholds-out-of-order");
  }
  const currentContextPercent = parsePercent(options.contextPercent, "context-percent", null);
  return {
    contextPercentKnown: currentContextPercent !== null,
    currentContextPercent,
    hardStopPercent,
    handoffPercent,
    noNewWorkPercent,
    overrideNextStepCost: parsePercent(options.nextStepContextCost, "next-step-context-cost", null),
    predictedContextPercent: currentContextPercent,
    softStopPercent,
  };
}

function estimateNextStepContextCost(budget, step, fallbackCost) {
  if (budget.overrideNextStepCost !== undefined && budget.overrideNextStepCost !== null) {
    const value = budget.overrideNextStepCost;
    budget.overrideNextStepCost = null;
    return value;
  }
  return fallbackCost ?? CONTEXT_STEP_COST[step] ?? 1;
}

function checkContextBudget(budget, step, fallbackCost) {
  if (budget.currentContextPercent === null || budget.predictedContextPercent === null) {
    return {
      currentContextPercent: null,
      nextStep: step,
      predictedNextStepCost: null,
      predictedContextPercent: null,
      threshold: "contextPercentUnknown",
      action: "handoff_only",
    };
  }
  const predictedCost = estimateNextStepContextCost(budget, step, fallbackCost);
  const nextPercent = budget.predictedContextPercent + predictedCost;
  const decision = {
    currentContextPercent: budget.currentContextPercent,
    nextStep: step,
    predictedNextStepCost: predictedCost,
    predictedContextPercent: nextPercent,
    threshold: null,
    action: "continue",
  };
  if (nextPercent >= budget.hardStopPercent || budget.currentContextPercent >= budget.hardStopPercent) {
    decision.action = "hard_stop";
    decision.threshold = "hardStopPercent";
    return decision;
  }
  if (nextPercent >= budget.handoffPercent || budget.currentContextPercent >= budget.handoffPercent) {
    decision.action = "handoff_only";
    decision.threshold = "handoffPercent";
    return decision;
  }
  if (nextPercent >= budget.noNewWorkPercent || budget.currentContextPercent >= budget.noNewWorkPercent) {
    decision.action = "resume_only";
    decision.threshold = "noNewWorkPercent";
    return decision;
  }
  if (nextPercent >= budget.softStopPercent || budget.currentContextPercent >= budget.softStopPercent) {
    decision.threshold = "softStopPercent";
  }
  budget.predictedContextPercent = nextPercent;
  return decision;
}

function nestedBatchContextPercent(budget) {
  const value = budget.predictedContextPercent ?? budget.currentContextPercent;
  if (value === null || value === undefined) {
    throw new Error("context-percent-required-before-nested-batch");
  }
  return String(Math.min(100, Math.max(0, Math.ceil(value))));
}

function resolveOptionalPath(base, value, fallback) {
  const candidate = value || fallback;
  return path.isAbsolute(candidate) ? candidate : path.resolve(base, candidate);
}

function assertRequiredLedgerShape(ledger) {
  requireObject(ledger, "ledger");
  requireObject(ledger.source, "ledger.source");
  requireString(ledger.source.repo, "ledger.source.repo");
  requireString(ledger.source.checkout, "ledger.source.checkout");
  requireString(ledger.source.revision, "ledger.source.revision");
  requireObject(ledger.target, "ledger.target");
  requireString(ledger.target.repoPath, "ledger.target.repoPath");
  requireString(ledger.target.branch, "ledger.target.branch");
  requireObject(ledger.constraints, "ledger.constraints");
  if (ledger.constraints.noLocalOllama !== true) {
    throw new Error("ledger.constraints.noLocalOllama must be true");
  }
  if (ledger.constraints.noDependencyOrPackageChanges !== true) {
    throw new Error("ledger.constraints.noDependencyOrPackageChanges must be true");
  }
  if (ledger.constraints.noRawJsxCopiedIntoProduct !== true) {
    throw new Error("ledger.constraints.noRawJsxCopiedIntoProduct must be true");
  }
  if (ledger.constraints.noUserAssetMutation !== true) {
    throw new Error("ledger.constraints.noUserAssetMutation must be true");
  }
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
  if (typeof entry.liveGate.required !== "boolean") {
    throw new Error(`${label}.liveGate.required must be a boolean`);
  }
  requireString(entry.liveGate.status, `${label}.liveGate.status`);
  requireObject(entry.implementation || {}, `${label}.implementation`);
}

function hasUnsafeProviderText(value) {
  return /\b(?:local|ollama|openrouter|fallback)\b/i.test(String(value || ""));
}

function commandIsNarrowGeneratedOpenAiCli(command) {
  const text = String(command || "");
  if (!text || !/\bopenai-cli\b/i.test(text)) {
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

function commandIsReadOnlyPreflight(command) {
  const text = String(command || "");
  if (hasUnsafeProviderText(text)) {
    return false;
  }
  return /\bcep-panel-cdp-smoke\.js\s+(inspect|connector-status-smoke)\b/i.test(text);
}

function liveLaneReady(liveGate) {
  const command = liveGate.command || liveGate.liveCommand || null;
  const commands = Array.isArray(liveGate.commands) ? liveGate.commands : [];
  const commandList = [command, ...commands].filter(Boolean);
  const status = String(liveGate.status || "");
  const laneId = liveGate.laneId || liveGate.liveLaneId || liveGate.reusableLaneId || null;
  const provider = liveGate.providerPath || liveGate.provider || "";

  if (!liveGate.required) {
    return { ok: true, reason: "not_required", status: "not_required" };
  }
  if (hasUnsafeProviderText(provider)) {
    return { ok: false, reason: "forbidden_provider", status: "blocked" };
  }
  if (commandList.some((entry) => !commandIsNarrowGeneratedOpenAiCli(entry))) {
    return { ok: false, reason: "unsafe_live_command", status: "blocked" };
  }
  if (commandList.length > 0 || laneId || LIVE_LANE_READY_STATUSES.has(status)) {
    return { ok: true, reason: "explicit_or_status_ready", status: "ready" };
  }
  return { ok: false, reason: `missing_required_live_lane:${status || "missing_status"}`, status: "blocked" };
}

function plannedRecipePath(entry) {
  const base = path.basename(entry.sourcePath, path.extname(entry.sourcePath));
  const slug =
    base
      .replace(/[_\s]+/g, "-")
      .replace(/[^a-zA-Z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || entry.id.replace(/[^a-zA-Z0-9.-]+/g, "-").toLowerCase();
  return `recipes/${slug}-typed-plan.md`;
}

function sortedUnique(values) {
  return Array.from(new Set(values.map(normalizeRepoPath).filter(Boolean))).sort();
}

function candidatePlannedPaths(entry) {
  const implementationPaths = Array.isArray(entry.implementation?.plannedPaths)
    ? entry.implementation.plannedPaths
    : [];
  return sortedUnique([plannedRecipePath(entry), ...implementationPaths, ...SHARED_OWNER_PATHS]);
}

function candidatePolicyBlockers(entry, ledger, targetRepo) {
  const blockers = [];
  const plannedPaths = candidatePlannedPaths(entry);
  const normalizedSourceCheckout = normalizeRepoPath(path.relative(targetRepo, path.resolve(targetRepo, ledger.source.checkout)));
  for (const plannedPath of plannedPaths) {
    const normalized = normalizeRepoPath(plannedPath);
    if (isDependencyPath(normalized)) {
      blockers.push({ code: "dependency-package-change-forbidden", plannedPath: normalized });
    }
    if (isRawJsxTargetPath(normalized)) {
      blockers.push({ code: "raw-jsx-copy-forbidden", plannedPath: normalized });
    }
    if (normalizedSourceCheckout && pathStartsWith(normalized, normalizedSourceCheckout)) {
      blockers.push({ code: "source-repo-write-forbidden", plannedPath: normalized });
    }
  }
  return blockers;
}

function selectNextQueuedRankedCandidate(ledger, skippedIds) {
  const entries = ledger.entries.slice();
  entries.forEach((entry, index) => validateEntryShape(entry, `ledger.entries[${index}]`));
  return (
    entries
      .filter((entry) => entry.status === "queued")
      .filter((entry) => Number.isInteger(entry.queueRank))
      .filter((entry) => !skippedIds.has(entry.id))
      .sort((left, right) => left.queueRank - right.queueRank || left.id.localeCompare(right.id))[0] || null
  );
}

function resolveTargetRepo(cwd, ledger, options) {
  return path.resolve(cwd, options.targetRepo || ledger.target.repoPath || ".");
}

function resolveRunRoot(targetRepo, runId, reportDir) {
  const rootRelative = reportDir || `${DEFAULT_RUN_ROOT_RELATIVE}/${runId}`;
  return resolveInside(targetRepo, rootRelative, "full-intake-run-root");
}

function appendEvent(runRoot, event) {
  appendFileSync(path.join(runRoot, "events.jsonl"), `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`, "utf8");
}

function loadOrCreateState({ ledgerPath, maxItems, runId, runRoot, targetRepo }) {
  mkdirSync(runRoot, { recursive: true });
  const statePath = path.join(runRoot, "state.json");
  if (existsSync(statePath)) {
    const state = readJson(statePath, "full-intake-state");
    if (state.schema !== STATE_SCHEMA) {
      throw new Error("full-intake-state-schema-mismatch");
    }
    if (state.runId !== runId) {
      throw new Error("full-intake-state-run-id-mismatch");
    }
    const resumed = {
      ...state,
      maxItems,
      resumeCount: Number(state.resumeCount || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    writeJson(statePath, resumed);
    appendEvent(runRoot, { event: "resume_from_state", runId, resumeCount: resumed.resumeCount });
    return { resumed: true, state: resumed };
  }

  const now = new Date().toISOString();
  const state = {
    schema: STATE_SCHEMA,
    auxiliaryId: AUXILIARY_ID,
    runId,
    status: "running",
    startedAt: now,
    updatedAt: now,
    ledgerPath: normalizeRepoPath(path.relative(targetRepo, ledgerPath)) || normalizeRepoPath(ledgerPath),
    maxItems,
    resumeCount: 0,
    items: [],
    completedCandidateIds: [],
    blockedCandidateIds: [],
    skippedCandidateIds: [],
    commitIds: [],
  };
  writeJson(statePath, state);
  appendEvent(runRoot, { event: "run_initialized", runId });
  return { resumed: false, state };
}

function saveState(runRoot, state) {
  const nextState = { ...state, updatedAt: new Date().toISOString() };
  writeJson(path.join(runRoot, "state.json"), nextState);
  return nextState;
}

function readLiveLaneRegistry(registryPath) {
  if (!existsSync(registryPath)) {
    return { schema: "generic-repo-live-lane-registry.v1", entries: [], selfImprovementFamilies: [] };
  }
  const registry = readJson(registryPath, "live-lane-registry");
  requireObject(registry, "live-lane-registry");
  requireArray(registry.entries, "live-lane-registry.entries");
  if (registry.selfImprovementFamilies !== undefined) {
    requireArray(registry.selfImprovementFamilies, "live-lane-registry.selfImprovementFamilies");
  }
  return registry;
}

function captureBindingSnapshot({ ledgerPath, registryPath, runRoot, safetyPolicy, step, targetRepo }) {
  return {
    schema: "generic-repo-full-intake.binding-snapshot.v1",
    step,
    queueSha256: sha256FileIfExists(ledgerPath),
    ledgerSha256: sha256FileIfExists(ledgerPath),
    runtimeStateSha256: sha256FileIfExists(path.join(runRoot, "state.json")),
    policySha256: sha256Json(safetyPolicy || {}),
    gitHead: gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head"),
    gitStatusSha256: gitStatusSha256(targetRepo),
    liveBindingsSha256: sha256FileIfExists(registryPath),
    createdAt: new Date().toISOString(),
  };
}

function appendBindingSnapshot(runRoot, snapshot) {
  appendEvent(runRoot, { event: "binding_snapshot", ...snapshot });
  return snapshot;
}

function liveLaneTemplateFor(registry, candidate) {
  return registry.entries.find((entry) => entry.candidateId === candidate.id) || null;
}

function candidateTools(candidate) {
  return sortedUnique(Array.isArray(candidate.suggestedTools) ? candidate.suggestedTools : []);
}

function unsafeSynthesisSignals(candidate) {
  const signals = candidate.safetySignals && typeof candidate.safetySignals === "object"
    ? candidate.safetySignals
    : {};
  return AUTO_LANE_UNSAFE_SIGNAL_FIELDS.filter((field) => signals[field] === true);
}

function selfImprovementAllowedUnsafeSignals(family) {
  if (!family || !Array.isArray(family.allowedUnsafeSignals)) return [];
  const knownUnsafeFields = new Set(AUTO_LANE_UNSAFE_SIGNAL_FIELDS);
  return sortedUnique(family.allowedUnsafeSignals.filter((field) => knownUnsafeFields.has(field)));
}

function normalizedSafetySignalSummary(candidate) {
  const signals = candidate.safetySignals && typeof candidate.safetySignals === "object"
    ? candidate.safetySignals
    : {};
  return Object.keys(signals)
    .sort()
    .filter((field) => signals[field] === true);
}

function familyRequirementMatches(family, tools) {
  const toolSet = new Set(tools);
  return family.requiredTools.every((tool) => toolSet.has(tool));
}

function familyAllowsAllTools(family, tools) {
  const allowed = new Set(family.allowedTools);
  return tools.every((tool) => allowed.has(tool));
}

function familyAppliesToCandidate(family, candidate) {
  if (!Array.isArray(family.candidateIds) || family.candidateIds.length === 0) {
    return true;
  }
  return family.candidateIds.includes(candidate.id);
}

function failClosedSynthesisReport({ candidate, reason, runId, status, tools, extra = {} }) {
  return {
    schema: "generic-repo-full-intake.auto-live-lane-synthesis.v1",
    runId,
    candidateId: candidate.id,
    sourcePath: candidate.sourcePath,
    status,
    ok: false,
    reason,
    candidateTools: tools,
    readBackPolicy: AUTO_LANE_READ_BACK_POLICY,
    supportedFamilies: AUTO_LANE_FAMILIES.map((family) => ({
      id: family.id,
      allowedTools: family.allowedTools.slice(),
      proofLane: family.proofLane,
      readBackTools: family.readBackTools.slice(),
      requiredTools: family.requiredTools.slice(),
      candidateIds: Array.isArray(family.candidateIds) ? family.candidateIds.slice() : null,
      semanticVerification: family.semanticVerification === true,
    })),
    ...extra,
    createdAt: new Date().toISOString(),
  };
}

function synthesizeLiveLaneTemplate(candidate, runId) {
  const tools = candidateTools(candidate);
  const unsafeSignals = unsafeSynthesisSignals(candidate);
  if (!SYNTHESIZABLE_CLASSIFICATIONS.has(candidate.classification)) {
    return failClosedSynthesisReport({
      candidate,
      reason: `classification_not_allowed:${candidate.classification}`,
      runId,
      status: "blocked_live_lane_synthesis_unsafe",
      tools,
    });
  }
  if (unsafeSignals.length > 0) {
    return failClosedSynthesisReport({
      candidate,
      extra: { unsafeSignals },
      reason: `unsafe_safety_signals:${unsafeSignals.join(",")}`,
      runId,
      status: "blocked_live_lane_synthesis_unsafe",
      tools,
    });
  }
  if (tools.length === 0) {
    return failClosedSynthesisReport({
      candidate,
      reason: "candidate_has_no_suggested_tools",
      runId,
      status: "blocked_live_lane_synthesis_incomplete",
      tools,
    });
  }

  const requirementMatches = AUTO_LANE_FAMILIES
    .filter((family) => familyAppliesToCandidate(family, candidate))
    .filter((family) => familyRequirementMatches(family, tools));
  const exactMatches = requirementMatches.filter((family) => familyAllowsAllTools(family, tools));
  if (exactMatches.length > 1) {
    return failClosedSynthesisReport({
      candidate,
      extra: { matchingFamilies: exactMatches.map((family) => family.id) },
      reason: "candidate_tools_match_multiple_auto_lane_families",
      runId,
      status: "blocked_live_lane_synthesis_ambiguous",
      tools,
    });
  }
  if (requirementMatches.length === 0) {
    return failClosedSynthesisReport({
      candidate,
      reason: "candidate_tools_do_not_match_a_supported_auto_lane_family",
      runId,
      status: "blocked_live_lane_synthesis_incomplete",
      tools,
    });
  }
  if (exactMatches.length === 0 && requirementMatches.length > 1) {
    return failClosedSynthesisReport({
      candidate,
      extra: { matchingFamilies: requirementMatches.map((family) => family.id) },
      reason: "candidate_tools_match_multiple_auto_lane_families",
      runId,
      status: "blocked_live_lane_synthesis_ambiguous",
      tools,
    });
  }

  const family = exactMatches[0] || requirementMatches[0];
  if (family.semanticVerification !== true || !Array.isArray(family.readBackTools) || family.readBackTools.length === 0) {
    return failClosedSynthesisReport({
      candidate,
      extra: { familyId: family.id },
      reason: `auto_lane_family_missing_read_back_semantic_contract:${family.id}`,
      runId,
      status: "blocked_live_lane_synthesis_incomplete",
      tools,
    });
  }
  const unsupportedTools = tools.filter((tool) => !family.allowedTools.includes(tool));
  if (!familyAllowsAllTools(family, tools)) {
    return failClosedSynthesisReport({
      candidate,
      extra: {
        familyId: family.id,
        unsupportedTools,
      },
      reason: `candidate_tools_exceed_family_contract:${family.id}`,
      runId,
      status: "blocked_live_lane_synthesis_incomplete",
      tools,
    });
  }

  const laneId = safeId(`auto-${family.id}-${candidate.id}-openai-cli`).slice(0, 96);
  const synthesis = {
    schema: "generic-repo-full-intake.auto-live-lane-synthesis.v1",
    runId,
    candidateId: candidate.id,
    sourcePath: candidate.sourcePath,
    status: "synthesized",
    ok: true,
    familyId: family.id,
    proofLane: family.proofLane,
    readBackPolicy: AUTO_LANE_READ_BACK_POLICY,
    readBackTools: family.readBackTools.slice(),
    candidateTools: tools,
    reason: "candidate_tools_safely_match_existing_typed_tool_family",
    semanticVerification: true,
    createdAt: new Date().toISOString(),
  };
  return {
    ...synthesis,
    template: {
      candidateId: candidate.id,
      command: family.command,
      laneId,
      nonLiveValidationCommands: Array.isArray(family.nonLiveValidationCommands)
        ? family.nonLiveValidationCommands.slice()
        : AUTO_LANE_COMMON_NON_LIVE_COMMANDS.slice(),
      plannedPaths: Array.isArray(family.plannedPaths)
        ? family.plannedPaths.slice()
        : ["scripts/cep-panel-cdp-smoke.js"],
      providerPath: "openai-cli",
      reclassifiedClassification: family.reclassifiedClassification || null,
      scope: `${family.scope}; synthesized for ${candidate.id}`,
      synthesis,
      synthesized: true,
      templateSource: "auto_synthesis",
    },
  };
}

function selfImprovementWorkPacket({ entries, groupId, reason, runId, tools }) {
  return {
    schema: "generic-repo-full-intake.self-improvement-work-packet.v1",
    runId,
    groupId,
    reason,
    candidateCount: entries.length,
    candidateIds: entries.map((entry) => entry.id).sort(),
    candidates: entries.map((entry) => ({
      id: entry.id,
      classification: entry.classification,
      sourcePath: entry.sourcePath,
      suggestedTools: candidateTools(entry),
      safetySignals: normalizedSafetySignalSummary(entry),
      plannedPaths: candidatePlannedPaths(entry),
    })),
    requestedRoles: [
      "lane-designer",
      "lane-implementer",
      "lane-reviewer",
      "validation-runner",
    ],
    constraints: {
      compactSummaryRequired: true,
      fallbackProviderAllowed: false,
      localOllamaAllowed: false,
      rawJsxCopyAllowed: false,
      sourceCheckoutWritesAllowed: false,
    },
    toolPattern: tools,
    createdAt: new Date().toISOString(),
  };
}

function selfImprovementFamilyMatches(family, candidate, tools) {
  if (!family || typeof family !== "object") return false;
  if (Array.isArray(family.candidateIds) && family.candidateIds.length > 0 && !family.candidateIds.includes(candidate.id)) {
    return false;
  }
  if (Array.isArray(family.requiredTools) && !familyRequirementMatches(family, tools)) {
    return false;
  }
  if (Array.isArray(family.allowedTools) && !familyAllowsAllTools(family, tools)) {
    return false;
  }
  return true;
}

function matchingSelfImprovementFamily(registry, candidate, tools) {
  const families = Array.isArray(registry.selfImprovementFamilies) ? registry.selfImprovementFamilies : [];
  const matches = families.filter((family) => selfImprovementFamilyMatches(family, candidate, tools));
  if (matches.length !== 1) {
    return { family: null, reason: matches.length > 1 ? "self_improvement_family_ambiguous" : "self_improvement_family_missing" };
  }
  return { family: matches[0], reason: null };
}

function templateFromSelfImprovementFamily(family, candidate, runId) {
  const familyId = safeId(family.id || `self-improvement-${sha256Text(stableStringify(family)).slice(0, 12)}`);
  if (family.productionTypedTools !== true) {
    throw new Error(`self-improvement-production-typed-tool-proof-missing:${familyId}`);
  }
  if (family.semanticVerification !== true || !Array.isArray(family.readBackTools) || family.readBackTools.length === 0) {
    throw new Error(`self-improvement-read-back-contract-missing:${familyId}`);
  }
  const laneId = safeId(`self-improved-${familyId}-${candidate.id}-openai-cli`).slice(0, 96);
  const synthesis = {
    schema: "generic-repo-full-intake.self-improvement-synthesis.v1",
    runId,
    candidateId: candidate.id,
    familyId,
    proofLane: family.proofLane || familyId,
    readBackPolicy: AUTO_LANE_READ_BACK_POLICY,
    readBackTools: family.readBackTools.slice(),
    allowedUnsafeSignals: selfImprovementAllowedUnsafeSignals(family),
    candidateTools: candidateTools(candidate),
    semanticVerification: true,
    status: "designed",
    ok: true,
    createdAt: new Date().toISOString(),
  };
  return {
    candidateId: candidate.id,
    command: family.command,
    laneId,
    nonLiveValidationCommands: Array.isArray(family.nonLiveValidationCommands)
      ? family.nonLiveValidationCommands.slice()
      : AUTO_LANE_COMMON_NON_LIVE_COMMANDS.slice(),
    plannedPaths: Array.isArray(family.plannedPaths) ? family.plannedPaths.slice() : ["scripts/cep-panel-cdp-smoke.js"],
    providerPath: family.providerPath || "openai-cli",
    reclassifiedClassification: family.reclassifiedClassification || "existing_typed_tools_recipe_only",
    scope: `${family.scope || "self-improved generated-only OpenAI CLI live lane"}; synthesized for ${candidate.id}`,
    synthesis,
    synthesized: true,
    templateSource: "bounded_self_improvement",
  };
}

function writeSelfImprovementRoleSummary(root, role, summary) {
  const summaryPath = path.join(root, role, "result-summary.json");
  mkdirSync(path.dirname(summaryPath), { recursive: true });
  writeJson(summaryPath, {
    schema: "generic-repo-full-intake.self-improvement-role-summary.v1",
    role,
    ...summary,
    createdAt: new Date().toISOString(),
  });
  const stats = statSync(summaryPath);
  if (stats.size > CHILD_RESULT_SUMMARY_MAX_BYTES) {
    throw new Error(`self-improvement-role-summary-too-large:${role}:${stats.size}`);
  }
  return summaryPath;
}

function runSelfImprovementPipeline({ bucket, groupId, registry, runId, runRoot, targetRepo }) {
  const representative = bucket.entries[0];
  const tools = candidateTools(representative);
  const root = path.join(runRoot, "self-improvement", safeId(groupId));
  mkdirSync(root, { recursive: true });
  const packet = selfImprovementWorkPacket({
    entries: bucket.entries,
    groupId,
    reason: bucket.synthesis.reason,
    runId,
    tools,
  });
  const packetPath = path.join(root, "work-packet.json");
  writeJson(packetPath, packet);

  const baseEvidence = {
    groupId,
    packetPath: normalizeRepoPath(path.relative(targetRepo, packetPath)),
    roles: {},
  };
  const unsafeSignals = unsafeSynthesisSignals(representative);
  const match = matchingSelfImprovementFamily(registry, representative, tools);
  const allowedUnsafeSignals = new Set(selfImprovementAllowedUnsafeSignals(match.family));
  const disallowedUnsafeSignals = unsafeSignals.filter((signal) => !allowedUnsafeSignals.has(signal));
  if (disallowedUnsafeSignals.length > 0) {
    const rolePath = writeSelfImprovementRoleSummary(root, "lane-designer", {
      ok: false,
      reason: `unsafe_safety_signals:${disallowedUnsafeSignals.join(",")}`,
      status: "rejected_unsafe",
      allowedUnsafeSignals: Array.from(allowedUnsafeSignals),
    });
    return {
      ok: false,
      reason: `unsafe_safety_signals:${disallowedUnsafeSignals.join(",")}`,
      status: "blocked_self_improvement_unsafe",
      evidence: {
        ...baseEvidence,
        roles: { "lane-designer": normalizeRepoPath(path.relative(targetRepo, rolePath)) },
      },
    };
  }

  if (!match.family) {
    const rolePath = writeSelfImprovementRoleSummary(root, "lane-designer", {
      ok: false,
      reason: match.reason,
      status: "missing_family_contract",
      toolPattern: tools,
    });
    return {
      ok: false,
      reason: match.reason,
      status: "blocked_self_improvement_missing_lane_contract",
      evidence: {
        ...baseEvidence,
        roles: { "lane-designer": normalizeRepoPath(path.relative(targetRepo, rolePath)) },
      },
    };
  }

  let template;
  try {
    template = templateFromSelfImprovementFamily(match.family, representative, runId);
    validateLiveLaneTemplate(template, representative, targetRepo);
  } catch (error) {
    const rolePath = writeSelfImprovementRoleSummary(root, "lane-reviewer", {
      ok: false,
      reason: error.message,
      status: "rejected_contract",
      toolPattern: tools,
    });
    return {
      ok: false,
      reason: error.message,
      status: /production-typed-tool-proof-missing/i.test(error.message)
        ? "blocked_self_improvement_missing_production_typed_tool"
        : "blocked_self_improvement_unsafe",
      evidence: {
        ...baseEvidence,
        familyId: match.family.id || null,
        roles: { "lane-reviewer": normalizeRepoPath(path.relative(targetRepo, rolePath)) },
      },
    };
  }

  const designerPath = writeSelfImprovementRoleSummary(root, "lane-designer", {
    familyId: template.synthesis.familyId,
    ok: true,
    status: "designed",
    template: {
      command: template.command,
      laneId: template.laneId,
      readBackTools: template.synthesis.readBackTools,
    },
  });
  const implementerPath = writeSelfImprovementRoleSummary(root, "lane-implementer", {
    ok: true,
    plannedPaths: template.plannedPaths,
    status: "implemented_as_registry_bounded_lane",
  });
  const reviewerPath = writeSelfImprovementRoleSummary(root, "lane-reviewer", {
    ok: true,
    providerPath: template.providerPath,
    semanticVerification: template.synthesis.semanticVerification,
    status: "reviewed",
  });
  const validationRunnerPath = writeSelfImprovementRoleSummary(root, "validation-runner", {
    ok: true,
    command: template.command,
    liveAcceptance: "serialized_by_parent_after_summary",
    status: "ready_for_serial_live_acceptance",
  });

  const synthesisReportPath = path.join(root, "self-improvement-synthesis.json");
  const report = {
    schema: "generic-repo-full-intake.self-improvement-synthesis-report.v1",
    runId,
    groupId,
    status: "lane_ready_for_serial_acceptance",
    ok: true,
    familyId: template.synthesis.familyId,
    packetPath: normalizeRepoPath(path.relative(targetRepo, packetPath)),
    roles: {
      "lane-designer": normalizeRepoPath(path.relative(targetRepo, designerPath)),
      "lane-implementer": normalizeRepoPath(path.relative(targetRepo, implementerPath)),
      "lane-reviewer": normalizeRepoPath(path.relative(targetRepo, reviewerPath)),
      "validation-runner": normalizeRepoPath(path.relative(targetRepo, validationRunnerPath)),
    },
    safetyPolicy: {
      fallbackProviderAllowed: false,
      localOllamaAllowed: false,
      rawJsxCopyAllowed: false,
      sourceCheckoutWritesAllowed: false,
    },
    template,
    createdAt: new Date().toISOString(),
  };
  writeJson(synthesisReportPath, report);
  return {
    ok: true,
    status: report.status,
    template,
    evidence: {
      familyId: template.synthesis.familyId,
      reportPath: normalizeRepoPath(path.relative(targetRepo, synthesisReportPath)),
      roles: report.roles,
      packetPath: report.packetPath,
    },
  };
}

function validateLiveLaneTemplate(template, candidate, targetRepo) {
  requireObject(template, `liveLaneTemplate:${candidate.id}`);
  requireString(template.candidateId, "liveLaneTemplate.candidateId");
  requireString(template.laneId, "liveLaneTemplate.laneId");
  requireString(template.command, "liveLaneTemplate.command");
  requireString(template.providerPath, "liveLaneTemplate.providerPath");
  if (template.providerPath !== "openai-cli") {
    throw new Error(`live-lane-provider-must-be-openai-cli: ${template.providerPath}`);
  }
  if (!commandIsNarrowGeneratedOpenAiCli(template.command)) {
    throw new Error(`live-lane-command-not-narrow-openai-cli: ${template.command}`);
  }
  const preflightCommands = Array.isArray(template.preflightCommands)
    ? template.preflightCommands
    : DEFAULT_PREFLIGHT_COMMANDS;
  for (const command of preflightCommands) {
    if (!commandIsReadOnlyPreflight(command)) {
      throw new Error(`live-lane-preflight-not-read-only: ${command}`);
    }
  }
  const plannedPaths = Array.isArray(template.plannedPaths) ? template.plannedPaths : [];
  for (const plannedPath of plannedPaths) {
    const normalized = normalizeRepoPath(plannedPath);
    if (isDependencyPath(normalized)) {
      throw new Error(`live-lane-dependency-path-forbidden: ${normalized}`);
    }
    if (isRawJsxTargetPath(normalized)) {
      throw new Error(`live-lane-raw-jsx-path-forbidden: ${normalized}`);
    }
    resolveInside(targetRepo, normalized, "live-lane-planned-path");
  }
}

function runCommand({ command, cwd, env, label, logPath, timeoutMs }) {
  mkdirSync(path.dirname(logPath), { recursive: true });
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const result = spawnSync(command, [], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...(env || {}) },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startedMs;
  writeProcessLog(logPath, {
    command,
    completedAt,
    durationMs,
    error: result.error ? result.error.message : null,
    exitCode: result.status,
    label,
    signal: result.signal || null,
    startedAt,
    stderr: result.stderr,
    stdout: result.stdout,
    timedOut: result.error && result.error.code === "ETIMEDOUT",
  });
  const bounded = boundedSpawnSyncResult(result, {
    command,
    completedAt,
    durationMs,
    label,
    logPath,
    startedAt,
    tailLines: DEFAULT_RESULT_TAIL_LINES,
  });
  return {
    command,
    completedAt,
    durationMs,
    error: bounded.error,
    exitCode: bounded.exitCode,
    label,
    logPath,
    ok: bounded.ok,
    signal: bounded.signal,
    stderrBytes: bounded.stderr.bytes,
    stderrTail: bounded.stderr.tail,
    stderrTruncated: bounded.stderr.truncated,
    stdoutBytes: bounded.stdout.bytes,
    stdoutTail: bounded.stdout.tail,
    stdoutTruncated: bounded.stdout.truncated,
    timedOut: bounded.timedOut,
  };
}

function tailText(value, maxLength = 1000) {
  const text = String(value || "");
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}

function commandEvidence(commandResult, targetRepo) {
  return {
    command: commandResult.command,
    durationMs: commandResult.durationMs ?? null,
    exitCode: commandResult.exitCode,
    label: commandResult.label,
    logPath: normalizeRepoPath(path.relative(targetRepo, commandResult.logPath)),
    ok: commandResult.ok,
    stderrBytes: commandResult.stderrBytes ?? null,
    stderrTail: commandResult.stderrTail || "",
    stderrTruncated: commandResult.stderrTruncated === true,
    stdoutBytes: commandResult.stdoutBytes ?? null,
    stdoutTail: commandResult.stdoutTail || "",
    stdoutTruncated: commandResult.stdoutTruncated === true,
    timedOut: commandResult.timedOut,
  };
}

function runCommandSeries({ commands, cwd, env, labelPrefix, logDir, targetRepo, timeoutMs }) {
  const results = [];
  for (let index = 0; index < commands.length; index += 1) {
    const label = `${labelPrefix}-${index + 1}`;
    const logPath = path.join(logDir, `${safeId(label)}.log`);
    const result = runCommand({ command: commands[index], cwd, env, label, logPath, timeoutMs });
    results.push(result);
    if (!result.ok) {
      return { ok: false, failed: commandEvidence(result, targetRepo), results };
    }
  }
  return { ok: true, failed: null, results };
}

function updateLedgerLiveGate({ candidate, ledger, ledgerPath, liveReport, targetRepo, template }) {
  const entry = ledger.entries.find((item) => item.id === candidate.id);
  if (!entry) {
    throw new Error(`candidate-missing-during-live-gate-update: ${candidate.id}`);
  }
  entry.liveGate = {
    ...entry.liveGate,
    required: true,
    status: "passed",
    laneId: template.laneId,
    command: template.command,
    providerPath: "openai-cli",
    scope: template.scope || "generated-only OpenAI CLI live lane",
    summary: normalizeRepoPath(path.relative(targetRepo, liveReport.reportPath)),
    artifact:
      liveReport.liveProof && liveReport.liveProof.logPath
        ? liveReport.liveProof.logPath
        : normalizeRepoPath(path.relative(targetRepo, liveReport.reportPath)),
    autoLaneRunId: liveReport.runId,
    synthesisEvidence: liveReport.synthesisReport || null,
    synthesisFamily: template.synthesis?.familyId || null,
    synthesized: template.synthesized === true,
    templateSource: template.templateSource || "registry",
    updatedAt: new Date().toISOString(),
  };
  writeJson(ledgerPath, ledger);
}

function runAutoLiveLane({
  allowSelfImprovementLaneSynthesis = false,
  candidate,
  ledger,
  ledgerPath,
  registry,
  runRoot,
  runId,
  targetRepo,
  timeoutMs,
  templateOverride = null,
}) {
  let template = templateOverride || liveLaneTemplateFor(registry, candidate);
  const laneRoot = path.join(runRoot, "candidates", safeId(candidate.id), "live-lane");
  const logDir = path.join(laneRoot, "logs");
  mkdirSync(logDir, { recursive: true });
  let synthesisReport = null;
  let synthesisReportPath = null;

  if (!template) {
    if (!allowSelfImprovementLaneSynthesis) {
      const report = {
        schema: "generic-repo-full-intake.live-lane-report.v1",
        runId,
        candidateId: candidate.id,
        status: "blocked_live_lane_template_missing",
        ok: false,
        reason: "self_improvement_lane_synthesis_disabled",
        createdAt: new Date().toISOString(),
      };
      report.reportPath = path.join(laneRoot, "live-lane-report.json");
      writeJson(report.reportPath, report);
      return report;
    }
    synthesisReport = synthesizeLiveLaneTemplate(candidate, runId);
    synthesisReportPath = path.join(laneRoot, "live-lane-synthesis.json");
    writeJson(synthesisReportPath, synthesisReport);
    if (!synthesisReport.ok) {
      const report = {
        schema: "generic-repo-full-intake.live-lane-report.v1",
        runId,
        candidateId: candidate.id,
        status: synthesisReport.status,
        ok: false,
        reason: synthesisReport.reason,
        synthesisReport: normalizeRepoPath(path.relative(targetRepo, synthesisReportPath)),
        autoLaneSynthesis: synthesisReport,
        createdAt: new Date().toISOString(),
      };
      report.reportPath = path.join(laneRoot, "live-lane-report.json");
      writeJson(report.reportPath, report);
      return report;
    }
    template = synthesisReport.template;
  }

  validateLiveLaneTemplate(template, candidate, targetRepo);
  writeJson(path.join(laneRoot, "live-lane-template.json"), template);

  const nonLiveCommands = Array.isArray(template.nonLiveValidationCommands)
    ? template.nonLiveValidationCommands
    : [];
  const nonLive = runCommandSeries({
    commands: nonLiveCommands,
    cwd: targetRepo,
    labelPrefix: "lane-non-live",
    logDir,
    targetRepo,
    timeoutMs,
  });
  if (!nonLive.ok) {
    const report = {
      schema: "generic-repo-full-intake.live-lane-report.v1",
      runId,
      candidateId: candidate.id,
      laneId: template.laneId,
      status: "blocked_live_lane_validation_failed",
      ok: false,
      failedCommand: nonLive.failed,
      nonLiveValidation: nonLive.results.map((entry) => commandEvidence(entry, targetRepo)),
      synthesisReport: synthesisReportPath ? normalizeRepoPath(path.relative(targetRepo, synthesisReportPath)) : null,
      templateSource: template.templateSource || "registry",
      createdAt: new Date().toISOString(),
    };
    report.reportPath = path.join(laneRoot, "live-lane-report.json");
    writeJson(report.reportPath, report);
    return report;
  }

  const preflightCommands = Array.isArray(template.preflightCommands)
    ? template.preflightCommands
    : DEFAULT_PREFLIGHT_COMMANDS;
  const preflight = runCommandSeries({
    commands: preflightCommands,
    cwd: targetRepo,
    labelPrefix: "lane-read-only-preflight",
    logDir,
    targetRepo,
    timeoutMs,
  });
  if (!preflight.ok) {
    const report = {
      schema: "generic-repo-full-intake.live-lane-report.v1",
      runId,
      candidateId: candidate.id,
      laneId: template.laneId,
      status: "blocked_live_preflight_failed",
      ok: false,
      failedCommand: preflight.failed,
      nonLiveValidation: nonLive.results.map((entry) => commandEvidence(entry, targetRepo)),
      preflight: preflight.results.map((entry) => commandEvidence(entry, targetRepo)),
      synthesisReport: synthesisReportPath ? normalizeRepoPath(path.relative(targetRepo, synthesisReportPath)) : null,
      templateSource: template.templateSource || "registry",
      createdAt: new Date().toISOString(),
    };
    report.reportPath = path.join(laneRoot, "live-lane-report.json");
    writeJson(report.reportPath, report);
    return report;
  }

  const liveProofResult = runCommand({
    command: template.command,
    cwd: targetRepo,
    label: "lane-generated-only-openai-cli-proof",
    logPath: path.join(logDir, "lane-generated-only-openai-cli-proof.log"),
    timeoutMs,
  });
  const liveProof = commandEvidence(liveProofResult, targetRepo);
  if (!liveProofResult.ok) {
    const report = {
      schema: "generic-repo-full-intake.live-lane-report.v1",
      runId,
      candidateId: candidate.id,
      laneId: template.laneId,
      status: "blocked_live_proof_failed",
      ok: false,
      failedCommand: liveProof,
      nonLiveValidation: nonLive.results.map((entry) => commandEvidence(entry, targetRepo)),
      preflight: preflight.results.map((entry) => commandEvidence(entry, targetRepo)),
      liveProof,
      synthesisReport: synthesisReportPath ? normalizeRepoPath(path.relative(targetRepo, synthesisReportPath)) : null,
      templateSource: template.templateSource || "registry",
      createdAt: new Date().toISOString(),
    };
    report.reportPath = path.join(laneRoot, "live-lane-report.json");
    writeJson(report.reportPath, report);
    return report;
  }

  const report = {
    schema: "generic-repo-full-intake.live-lane-report.v1",
    runId,
    candidateId: candidate.id,
    laneId: template.laneId,
    status: "passed",
    ok: true,
    command: template.command,
    providerPath: "openai-cli",
    scope: template.scope || "generated-only OpenAI CLI live lane",
    nonLiveValidation: nonLive.results.map((entry) => commandEvidence(entry, targetRepo)),
    preflight: preflight.results.map((entry) => commandEvidence(entry, targetRepo)),
    liveProof,
    synthesisReport: synthesisReportPath ? normalizeRepoPath(path.relative(targetRepo, synthesisReportPath)) : null,
    templateSource: template.templateSource || "registry",
    createdAt: new Date().toISOString(),
  };
  report.reportPath = path.join(laneRoot, "live-lane-report.json");
  writeJson(report.reportPath, report);
  updateLedgerLiveGate({ candidate, ledger, ledgerPath, liveReport: report, targetRepo, template });
  return report;
}

function hasReasonFragment(entry, fragments) {
  const text = [
    entry.reason,
    entry.failClosed?.reason,
    entry.implementation?.failureReason,
    entry.liveGate?.status,
  ].filter(Boolean).join("\n");
  return fragments.some((fragment) => text.includes(fragment));
}

function isRecoverableLiveLaneEntry(entry) {
  if (!SYNTHESIZABLE_CLASSIFICATIONS.has(entry.classification)) return false;
  if (entry.status === "completed") return false;
  if (entry.status === "queued") {
    return entry.classification === "live_lane_needed" &&
      entry.liveGate?.required === true &&
      !liveLaneReady(entry.liveGate).ok;
  }
  if (RECOVERABLE_LIVE_LANE_STATUSES.has(entry.status)) return true;
  if (RECOVERABLE_LIVE_LANE_STATUSES.has(entry.failClosed?.status)) return true;
  return /candidate_tools_(?:do_not_match|exceed|match_multiple)|auto_lane_family_missing/i.test(entry.failClosed?.reason || "");
}

function isScopedUnsafeSkipToolGapEntry(entry) {
  return entry &&
    entry.status === "blocked_or_skipped" &&
    entry.classification === "unsafe_skip_tool_gap";
}

function childTimeoutRecoveryExhausted(entry) {
  if (entry.implementation?.childTimeoutRecoveryExhausted === true) return true;
  if (/child-timeout-recovery-exhausted|child-timeout-recovery-failed/i.test(entry.failClosed?.reason || "")) return true;
  if (
    entry.status === "failed_import" &&
    entry.liveGate?.status === "ready" &&
    entry.resolution?.status === "resolved_requeued" &&
    hasReasonFragment(entry, CHILD_TIMEOUT_REASONS)
  ) {
    return true;
  }
  return false;
}

function recoverableImportFailureKind(entry) {
  if (entry.status !== "failed_import" && entry.failClosed?.status !== "failed_import") {
    return null;
  }
  if (childTimeoutRecoveryExhausted(entry)) {
    return null;
  }
  if (hasReasonFragment(entry, CHILD_TIMEOUT_REASONS)) {
    return "child_timeout";
  }
  if (hasReasonFragment(entry, IMPORT_RETRY_REASONS)) {
    return "retry_narrow_once";
  }
  return null;
}

function resolutionGroupId({ candidate, familyId, reason, type }) {
  const basis = {
    familyId: familyId || null,
    reason: reason || null,
    safetySignals: normalizedSafetySignalSummary(candidate),
    tools: candidateTools(candidate),
    type,
  };
  return safeId(`${type}-${familyId || sha256Text(stableStringify(basis)).slice(0, 16)}`);
}

function resolutionTicketPath(runRoot, groupId) {
  return path.join(runRoot, "resolution-tickets", safeId(groupId), "ticket.json");
}

function recordResolutionTicket({ affected, evidence = {}, groupId, reason, runId, runRoot, status, targetRepo, type }) {
  const ticketPath = resolutionTicketPath(runRoot, groupId);
  const ticket = {
    schema: RESOLUTION_TICKET_SCHEMA,
    runId,
    groupId,
    type,
    status,
    reason: reason || null,
    affectedCandidateIds: affected.map((entry) => entry.id),
    group: {
      suggestedTools: candidateTools(affected[0] || {}),
      safetySignals: normalizedSafetySignalSummary(affected[0] || {}),
      synthesisFamily: evidence.familyId || null,
    },
    isolation: {
      runtimeOnly: true,
      ticketPath: normalizeRepoPath(path.relative(targetRepo, ticketPath)),
      trackedSharedFileMerge: "serial_only",
      worktrees: "importer_owned_ignored_dirs_only",
    },
    safetyPolicy: {
      broadCepSmokeAllowed: false,
      dependencyPackageChangesAllowed: false,
      fallbackProviderAllowed: false,
      localOllamaAllowed: false,
      rawJsxCopyAllowed: false,
      sourceRepoWritesAllowed: false,
      userAssetMutationOutsideGeneratedOnlyLaneAllowed: false,
    },
    evidence,
    createdAt: new Date().toISOString(),
  };
  writeJson(ticketPath, ticket);
  return ticket;
}

function readResolutionTicket(targetRepo, ticketRef) {
  return readJsonIfExists(absoluteReportPath(targetRepo, ticketRef), "resolution-ticket");
}

function finalizeResolutionTicket({ affected = [], evidence = {}, reason, status, targetRepo, ticketRef }) {
  const ticketPath = absoluteReportPath(targetRepo, ticketRef);
  const existing = readJsonIfExists(ticketPath, "resolution-ticket");
  if (!existing) {
    throw new Error(`resolution-ticket-missing:${ticketRef || "none"}`);
  }
  const affectedIds = sortedUnique([
    ...(Array.isArray(existing.affectedCandidateIds) ? existing.affectedCandidateIds : []),
    ...affected.map((entry) => entry.id),
  ]);
  const ticket = {
    ...existing,
    status,
    reason,
    affectedCandidateIds: affectedIds,
    evidence: {
      ...(existing.evidence || {}),
      ...evidence,
    },
    updatedAt: new Date().toISOString(),
  };
  writeJson(ticketPath, ticket);
  return ticket;
}

function attachResolutionReference(entry, ticket, status) {
  const ticketRef = ticket.isolation.ticketPath;
  const existing = Array.isArray(entry.resolutionTickets) ? entry.resolutionTickets : [];
  entry.resolutionTickets = sortedUnique([...existing, ticketRef]);
  entry.resolution = {
    schema: "generic-repo-full-intake.entry-resolution.v1",
    latestTicket: ticketRef,
    status,
    groupId: ticket.groupId,
    type: ticket.type,
    updatedAt: new Date().toISOString(),
  };
}

function requeueEntryAfterResolution(entry, ticket, extraImplementation = {}) {
  if (entry.failClosed) {
    entry.previousFailClosed = entry.failClosed;
    delete entry.failClosed;
  }
  entry.status = "queued";
  delete entry.blockedAt;
  entry.nextAction = `requeued_by_resolution_${safeId(ticket.groupId)}`;
  entry.implementation = {
    ...(entry.implementation || {}),
    ...extraImplementation,
    resolutionTicket: ticket.isolation.ticketPath,
  };
  attachResolutionReference(entry, ticket, "resolved_requeued");
}

function nextQueueRankAllocator(ledger) {
  let nextRank = ledger.entries.reduce((max, entry) => (
    Number.isInteger(entry.queueRank) ? Math.max(max, entry.queueRank) : max
  ), 0) + 1;
  return () => {
    const rank = nextRank;
    nextRank += 1;
    return rank;
  };
}

function applyFamilyProofToEntry(entry, ticket, liveReport, template, allocateQueueRank) {
  const previousClassification = entry.classification;
  requeueEntryAfterResolution(entry, ticket);
  if (SELF_IMPROVEMENT_RECLASSIFIABLE_CLASSIFICATIONS.has(previousClassification)) {
    entry.previousClassification = previousClassification;
    entry.classification = template.reclassifiedClassification || "existing_typed_tools_recipe_only";
  }
  if (!Number.isInteger(entry.queueRank)) {
    entry.queueRank = allocateQueueRank();
  }
  entry.liveGate = {
    ...(entry.liveGate || {}),
    required: true,
    status: "passed",
    laneId: template.laneId,
    command: template.command,
    providerPath: "openai-cli",
    scope: template.scope || "generated-only OpenAI CLI live lane",
    summary: normalizeRepoPath(path.relative(ticket.evidence.targetRepo || REPO_ROOT, liveReport.reportPath)),
    artifact:
      liveReport.liveProof && liveReport.liveProof.logPath
        ? liveReport.liveProof.logPath
        : normalizeRepoPath(path.relative(ticket.evidence.targetRepo || REPO_ROOT, liveReport.reportPath)),
    autoLaneRunId: liveReport.runId,
    synthesisEvidence: liveReport.synthesisReport || null,
    synthesisFamily: template.synthesis?.familyId || ticket.evidence.familyId || null,
    synthesized: template.synthesized === true,
    templateSource: template.templateSource || "auto_synthesis",
    updatedAt: new Date().toISOString(),
  };
  entry.implementation = {
    ...(entry.implementation || {}),
    liveLaneReclassification: {
      from: previousClassification,
      to: entry.classification,
      familyId: template.synthesis?.familyId || ticket.evidence.familyId || null,
      queueRank: entry.queueRank,
      ticketPath: ticket.isolation.ticketPath,
      updatedAt: new Date().toISOString(),
    },
  };
}

function processLiveLaneResolutionTickets({
  allowSelfImprovementLaneSynthesis = false,
  ledger,
  ledgerPath,
  registry,
  resolutionCandidateIds = null,
  runId,
  runRoot,
  targetRepo,
  timeoutMs,
}) {
  const allowScopedUnsafeSkipResolution = allowSelfImprovementLaneSynthesis &&
    resolutionCandidateIds instanceof Set &&
    resolutionCandidateIds.size > 0;
  const recoverable = ledger.entries
    .filter((entry) => candidateAllowedByResolutionScope(entry, resolutionCandidateIds))
    .filter((entry) => isRecoverableLiveLaneEntry(entry) || (
      allowScopedUnsafeSkipResolution &&
      isScopedUnsafeSkipToolGapEntry(entry)
    ));
  const allocateQueueRank = nextQueueRankAllocator(ledger);
  const buckets = new Map();
  for (const entry of recoverable) {
    const synthesis = synthesizeLiveLaneTemplate(entry, runId);
    const familyId = synthesis.ok ? synthesis.familyId : synthesis.familyId || synthesis.extra?.familyId || null;
    const groupId = resolutionGroupId({
      candidate: entry,
      familyId,
      reason: synthesis.reason || entry.failClosed?.reason || entry.status,
      type: "live-lane-family",
    });
    if (!buckets.has(groupId)) {
      buckets.set(groupId, { entries: [], familyId, synthesis });
    }
    buckets.get(groupId).entries.push(entry);
  }

  const tickets = [];
  const requeuedCandidateIds = [];
  for (const [groupId, bucket] of buckets) {
    const representative = bucket.entries[0];
    if (!bucket.synthesis.ok) {
      if (!allowSelfImprovementLaneSynthesis) {
        const ticket = recordResolutionTicket({
          affected: bucket.entries,
          evidence: {
            familyId: bucket.familyId,
            selfImprovement: { status: "disabled_by_context_budgeted_safe_mode" },
            synthesis: bucket.synthesis,
          },
          groupId,
          reason: bucket.synthesis.reason || "self_improvement_lane_synthesis_disabled",
          runId,
          runRoot,
          status: "terminal_unresolved",
          targetRepo,
          type: "live-lane-family",
        });
        for (const entry of bucket.entries) {
          attachResolutionReference(entry, ticket, "terminal_unresolved");
        }
        tickets.push(ticket);
        continue;
      }
      const selfImprovement = runSelfImprovementPipeline({
        bucket,
        groupId,
        registry,
        runId,
        runRoot,
        targetRepo,
      });
      if (selfImprovement.ok) {
        const liveReport = runAutoLiveLane({
          candidate: representative,
          ledger,
          ledgerPath,
          registry,
          runRoot,
          runId,
          targetRepo,
          timeoutMs,
          templateOverride: selfImprovement.template,
        });
        const template = selfImprovement.template;
        const status = liveReport.ok ? "proved_requeued" : "terminal_unresolved";
        const ticket = recordResolutionTicket({
          affected: bucket.entries,
          evidence: {
            familyId: selfImprovement.evidence.familyId,
            liveLaneReport: normalizeRepoPath(path.relative(targetRepo, liveReport.reportPath)),
            ok: liveReport.ok,
            readBackPolicy: AUTO_LANE_READ_BACK_POLICY,
            reason: liveReport.reason || null,
            selfImprovement: selfImprovement.evidence,
            status: liveReport.status,
            targetRepo,
            template: {
              command: template.command,
              laneId: template.laneId,
              proofLane: template.synthesis.proofLane,
              readBackTools: template.synthesis.readBackTools,
              semanticVerification: template.synthesis.semanticVerification,
            },
          },
          groupId,
          reason: liveReport.ok
            ? "bounded_self_improvement_lane_proved_with_read_back_and_semantic_verification"
            : liveReport.reason || liveReport.status,
          runId,
          runRoot,
          status,
          targetRepo,
          type: "live-lane-family",
        });
        if (liveReport.ok) {
          for (const entry of bucket.entries) {
            applyFamilyProofToEntry(entry, ticket, liveReport, template, allocateQueueRank);
            requeuedCandidateIds.push(entry.id);
          }
        } else {
          for (const entry of bucket.entries) {
            attachResolutionReference(entry, ticket, "terminal_unresolved");
          }
        }
        tickets.push(ticket);
        continue;
      }
      const ticket = recordResolutionTicket({
        affected: bucket.entries,
        evidence: {
          familyId: bucket.familyId,
          selfImprovement: selfImprovement.evidence,
          synthesis: bucket.synthesis,
        },
        groupId,
        reason: selfImprovement.reason || bucket.synthesis.reason,
        runId,
        runRoot,
        status: "terminal_unresolved",
        targetRepo,
        type: "live-lane-family",
      });
      for (const entry of bucket.entries) {
        attachResolutionReference(entry, ticket, "terminal_unresolved");
      }
      tickets.push(ticket);
      continue;
    }

    const liveReport = runAutoLiveLane({
      candidate: representative,
      ledger,
      ledgerPath,
      registry,
      runRoot,
      runId,
      targetRepo,
      timeoutMs,
      templateOverride: bucket.synthesis.template,
    });
    const template = bucket.synthesis.template;
    const status = liveReport.ok ? "proved_requeued" : "terminal_unresolved";
    const ticket = recordResolutionTicket({
      affected: bucket.entries,
      evidence: {
        familyId: bucket.synthesis.familyId,
        liveLaneReport: normalizeRepoPath(path.relative(targetRepo, liveReport.reportPath)),
        ok: liveReport.ok,
        proofLane: bucket.synthesis.proofLane,
        readBackPolicy: AUTO_LANE_READ_BACK_POLICY,
        reason: liveReport.reason || null,
        status: liveReport.status,
        targetRepo,
        template: {
          command: template.command,
          laneId: template.laneId,
          proofLane: bucket.synthesis.proofLane,
          readBackTools: bucket.synthesis.readBackTools,
          semanticVerification: bucket.synthesis.semanticVerification,
        },
      },
      groupId,
      reason: liveReport.ok
        ? "generated_only_family_proved_with_read_back_and_semantic_verification"
        : liveReport.reason || liveReport.status,
      runId,
      runRoot,
      status,
      targetRepo,
      type: "live-lane-family",
    });
    if (liveReport.ok) {
      for (const entry of bucket.entries) {
        applyFamilyProofToEntry(entry, ticket, liveReport, template, allocateQueueRank);
        requeuedCandidateIds.push(entry.id);
      }
    } else {
      for (const entry of bucket.entries) {
        attachResolutionReference(entry, ticket, "terminal_unresolved");
      }
    }
    tickets.push(ticket);
  }
  return { requeuedCandidateIds, tickets };
}

function processImportFailureResolutionTickets({ ledger, resolutionCandidateIds = null, runId, runRoot, targetRepo }) {
  const tickets = [];
  const requeuedCandidateIds = [];
  const buckets = new Map();
  const batchReportByCandidateId = new Map();
  for (const entry of ledger.entries) {
    if (!candidateAllowedByResolutionScope(entry, resolutionCandidateIds)) {
      continue;
    }
    const knownBatchReport = entry.failClosed?.batchReport || entry.implementation?.batchReport || null;
    const verifiedKnownBatchReport = knownBatchReport && existsSync(absoluteReportPath(targetRepo, knownBatchReport))
      ? knownBatchReport
      : null;
    const discoveredBatchReport = verifiedKnownBatchReport || discoverCandidateBatchReportPath({
      candidateId: entry.id,
      runRoot,
      targetRepo,
    });
    if (discoveredBatchReport) {
      batchReportByCandidateId.set(entry.id, discoveredBatchReport);
    }
    let kind = recoverableImportFailureKind(entry);
    if (
      !kind &&
      discoveredBatchReport &&
      childTimeoutRecoveryExhausted(entry) &&
      hasReasonFragment(entry, CHILD_TIMEOUT_REASONS)
    ) {
      kind = "child_timeout";
    }
    if (
      !kind &&
      discoveredBatchReport &&
      isLegacyReasoningEffortCliFailure({ batchReportPath: discoveredBatchReport, targetRepo })
    ) {
      kind = "legacy_reasoning_effort_cli";
    }
    if (!kind || !SAFE_CLASSIFICATIONS.has(entry.classification)) {
      continue;
    }
    const groupId = resolutionGroupId({
      candidate: entry,
      familyId: entry.liveGate?.synthesisFamily || null,
      reason: entry.failClosed?.reason || entry.implementation?.failureReason || kind,
      type: kind === "child_timeout" ? "child-timeout" : "import-retry",
    });
    if (!buckets.has(groupId)) {
      buckets.set(groupId, { entries: [], kind });
    }
    buckets.get(groupId).entries.push(entry);
  }
  for (const [groupId, bucket] of buckets) {
    const representative = bucket.entries[0];
    const kind = bucket.kind;
    const ticket = recordResolutionTicket({
      affected: bucket.entries,
      evidence: {
        batchReport: batchReportByCandidateId.get(representative.id) || representative.failClosed?.batchReport || representative.implementation?.batchReport || null,
        failureReason: representative.failClosed?.reason || representative.implementation?.failureReason || null,
        familyId: representative.liveGate?.synthesisFamily || null,
        retryNonce: safeId(`${groupId}-${sha256Text(`${bucket.entries.map((entry) => entry.id).sort().join(",")}:${runId}`).slice(0, 8)}`),
      },
      groupId,
      reason: kind === "child_timeout"
        ? "child_timeout_patch_recovery_queued"
        : kind === "legacy_reasoning_effort_cli"
          ? "fresh_retry_queued_after_legacy_reasoning_effort_cli_arg"
          : "fresh_retry_queued_after_manifest_mismatch",
      runId,
      runRoot,
      status: "resolved_requeued",
      targetRepo,
      type: kind === "child_timeout" ? "child-timeout" : "import-retry",
    });
    const retryNonce = ticket.evidence.retryNonce;
    for (const entry of bucket.entries) {
      const recoveryIntent = kind === "child_timeout"
          ? {
              mode: "recover_child_timeout_patch",
              batchReport: batchReportByCandidateId.get(entry.id) || entry.failClosed?.batchReport || entry.implementation?.batchReport || ticket.evidence.batchReport,
              retryNonce,
              ticketPath: ticket.isolation.ticketPath,
            }
        : {
            mode: "retry_narrow_once",
            previousFailure: entry.failClosed?.reason || entry.implementation?.failureReason || ticket.evidence.failureReason,
            retryNonce,
            ticketPath: ticket.isolation.ticketPath,
          };
      requeueEntryAfterResolution(entry, ticket, {
        recoveryAttemptCount: Number(entry.implementation?.recoveryAttemptCount || 0),
        recoveryIntent,
        retryNonce,
      });
      requeuedCandidateIds.push(entry.id);
    }
    tickets.push(ticket);
  }
  return { requeuedCandidateIds, tickets };
}

function closeStaleRunningChildTimeoutTickets({ ledger, runId, runRoot, targetRepo }) {
  const ticketsRoot = path.join(runRoot, "resolution-tickets");
  if (!existsSync(ticketsRoot)) {
    return { closedCandidateIds: [], tickets: [] };
  }
  const closedCandidateIds = [];
  const tickets = [];
  for (const item of readdirSync(ticketsRoot, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const ticketPath = path.join(ticketsRoot, item.name, "ticket.json");
    const ticket = readJsonIfExists(ticketPath, "resolution-ticket");
    if (!ticket || ticket.type !== "child-timeout" || ticket.status !== "running_recovery") {
      continue;
    }
    const affected = (ticket.affectedCandidateIds || [])
      .map((id) => ledger.entries.find((entry) => entry.id === id))
      .filter(Boolean);
    const terminalAffected = affected.filter((entry) => (
      entry.status === "failed_import" && hasReasonFragment(entry, CHILD_TIMEOUT_REASONS)
    ));
    if (terminalAffected.length === 0) {
      continue;
    }
    const finalized = finalizeResolutionTicket({
      affected: terminalAffected,
      evidence: {
        closedOnResume: true,
        closedRunId: runId,
        terminalCandidateIds: terminalAffected.map((entry) => entry.id),
        terminalFailureReasons: Object.fromEntries(
          terminalAffected.map((entry) => [entry.id, entry.failClosed?.reason || entry.implementation?.failureReason || null])
        ),
      },
      reason: "child_timeout_recovery_exhausted",
      status: "terminal_unresolved",
      targetRepo,
      ticketRef: ticket.isolation.ticketPath,
    });
    for (const entry of terminalAffected) {
      attachResolutionReference(entry, finalized, "terminal_unresolved");
      entry.implementation = {
        ...(entry.implementation || {}),
        childTimeoutRecoveryExhausted: true,
        resolutionTicket: finalized.isolation.ticketPath,
      };
      if (entry.failClosed) {
        entry.failClosed.reason = `child-timeout-recovery-exhausted:${entry.failClosed.reason || "implementation-child-run-timeout"}`;
      }
      closedCandidateIds.push(entry.id);
    }
    tickets.push(finalized);
  }
  return { closedCandidateIds: sortedUnique(closedCandidateIds), tickets };
}

function processResolutionTickets({
  allowSelfImprovementLaneSynthesis = false,
  ledger,
  ledgerPath,
  registry,
  resolutionCandidateIds = null,
  runId,
  runRoot,
  targetRepo,
  timeoutMs,
}) {
  const closed = closeStaleRunningChildTimeoutTickets({ ledger, runId, runRoot, targetRepo });
  const live = processLiveLaneResolutionTickets({
    allowSelfImprovementLaneSynthesis,
    ledger,
    ledgerPath,
    registry,
    resolutionCandidateIds,
    runId,
    runRoot,
    targetRepo,
    timeoutMs,
  });
  const imports = processImportFailureResolutionTickets({ ledger, resolutionCandidateIds, runId, runRoot, targetRepo });
  if (closed.tickets.length > 0 || live.tickets.length > 0 || imports.tickets.length > 0) {
    updateLedgerNextCandidate(ledger, null);
    writeJson(ledgerPath, ledger);
  }
  return {
    schema: "generic-repo-full-intake.resolution-queue.v1",
    runId,
    status: "terminal",
    tickets: [...closed.tickets, ...live.tickets, ...imports.tickets].map((ticket) => ({
      groupId: ticket.groupId,
      path: ticket.isolation.ticketPath,
      status: ticket.status,
      type: ticket.type,
      affectedCandidateIds: ticket.affectedCandidateIds,
    })),
    requeuedCandidateIds: sortedUnique([...live.requeuedCandidateIds, ...imports.requeuedCandidateIds]),
    terminalTicketCount: closed.tickets.length + live.tickets.length + imports.tickets.length,
    closedCandidateIds: closed.closedCandidateIds,
    openTicketCount: 0,
  };
}

function boundedStrings(values, limit = COMPACT_OUTPUT_ID_LIMIT) {
  const seen = new Set();
  const all = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    all.push(text);
  }
  return {
    count: all.length,
    ids: all.slice(0, limit),
    omitted: Math.max(0, all.length - limit),
  };
}

function compactTicketFamily(ticket) {
  return String(ticket?.groupId || ticket?.type || "unknown-family").trim() || "unknown-family";
}

function summarizeResolutionQueueForParent(resolutionQueue) {
  const tickets = Array.isArray(resolutionQueue?.tickets) ? resolutionQueue.tickets : [];
  const families = new Map();
  for (const ticket of tickets) {
    const family = compactTicketFamily(ticket);
    const current = families.get(family) || { affectedCandidateIds: [], ticketCount: 0 };
    current.ticketCount += 1;
    current.affectedCandidateIds.push(...(Array.isArray(ticket.affectedCandidateIds) ? ticket.affectedCandidateIds : []));
    families.set(family, current);
  }
  const familyEntries = Array.from(families.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, COMPACT_OUTPUT_FAMILY_LIMIT)
    .map(([family, value]) => ({
      family,
      ticketCount: value.ticketCount,
      affectedCandidateIds: boundedStrings(value.affectedCandidateIds, COMPACT_OUTPUT_ID_LIMIT),
    }));
  return {
    status: resolutionQueue?.status || null,
    openTicketCount: Number(resolutionQueue?.openTicketCount || 0),
    terminalTicketCount: Number(resolutionQueue?.terminalTicketCount || 0),
    ticketCount: tickets.length,
    closedCandidateIds: boundedStrings(resolutionQueue?.closedCandidateIds, COMPACT_OUTPUT_ID_LIMIT),
    requeuedCandidateIds: boundedStrings(resolutionQueue?.requeuedCandidateIds, COMPACT_OUTPUT_ID_LIMIT),
    affectedFamilies: familyEntries,
    affectedFamilyCount: families.size,
    affectedFamilyOmitted: Math.max(0, families.size - COMPACT_OUTPUT_FAMILY_LIMIT),
  };
}

function compactLastItem(item) {
  if (!item) {
    return null;
  }
  return {
    candidateId: item.candidateId || null,
    status: item.status || null,
    reason: item.reason || null,
    importStatus: item.importStatus || null,
    liveLaneStatus: item.liveLaneStatus || null,
    liveRerunStatus: item.liveRerunStatus || null,
    commitId: item.commitId || null,
    completedAt: item.completedAt || null,
  };
}

function inferParentNextAction(report, resolutionSummary, failedCandidateIds) {
  if (report.ok === false) {
    return "stop and resolve the compact blocker before rerunning";
  }
  if (report.status === "phase_boundary") {
    return `rerun compact full-intake to continue next strict phase: ${report.phaseBoundary?.nextPhase || report.nextPhase || "unknown"}`;
  }
  if (failedCandidateIds.count > 0) {
    return "inspect the named failed candidate through compact evidence only, then rerun with --compact-json";
  }
  if (resolutionSummary.requeuedCandidateIds.count > 0) {
    return "rerun the full-intake supervisor with --compact-json to process requeued candidates";
  }
  if (report.status === "completed_no_candidates") {
    return "use compact status and ledger summary to choose the next bounded lane";
  }
  if (String(report.status || "").startsWith("completed")) {
    return "review compact status and ledger summary; avoid full runtime reports in parent chat";
  }
  return "continue only through compact-json/status/ledger-summary commands";
}

function compactPathsForParent(report) {
  const runRoot = normalizeRepoPath(report.runRoot || "");
  const ledgerPath = normalizeRepoPath(report.ledgerPath || "");
  return {
    runRoot,
    proofEnvelope: report.proofEnvelopePath || (runRoot ? normalizeRepoPath(`${runRoot}/proof-envelope.json`) : null),
    resumeCard: report.resumeCardPath || (runRoot ? normalizeRepoPath(`${runRoot}/resume-card.json`) : null),
    ledger: ledgerPath || null,
    compactStatusCommand: report.runId
      ? `node orchestrator/full-intake-status.mjs --run-id ${report.runId} --compact --event-limit 8 --batch-limit 1`
      : null,
    proofCommand: report.runId
      ? `node orchestrator/full-intake-proof.mjs --run-id ${report.runId} --compact-json`
      : null,
    fullJsonOutput: report.fullJsonOutputPath || null,
    ledgerSummaryCommand: ledgerPath
      ? `node orchestrator/full-intake-ledger-summary.mjs --ledger ${ledgerPath} --compact`
      : null,
  };
}

function pathFromTarget(targetRepo, repoPath) {
  if (!repoPath) return null;
  return path.isAbsolute(repoPath) ? repoPath : path.resolve(targetRepo, repoPath);
}

function proofHashForRepoPath(targetRepo, repoPath) {
  const absolute = pathFromTarget(targetRepo, repoPath);
  return sha256FileIfExists(absolute);
}

function compactPathArray(values, limit = COMPACT_OUTPUT_ID_LIMIT) {
  return Array.from(new Set((values || []).map(normalizeRepoPath).filter(Boolean))).sort().slice(0, limit);
}

function validationCommandsFromReports({ batch, liveRerun }) {
  const commands = [];
  const importerSummary = batch?.report?.importer?.resultSummary || null;
  for (const value of [
    ...(Array.isArray(importerSummary?.validationCommandsRun) ? importerSummary.validationCommandsRun : []),
    ...(Array.isArray(importerSummary?.validationCommands) ? importerSummary.validationCommands : []),
  ]) {
    if (typeof value === "string") {
      commands.push(value);
    } else if (value?.command) {
      commands.push(value.command);
    }
  }
  if (liveRerun?.command) {
    commands.push(liveRerun.command);
  }
  return compactPathArray(commands, 24);
}

function importerSummaryPathFromBatch(targetRepo, batch) {
  const summaryPath = batch?.report?.importer?.resultSummary?.resultSummaryPath || null;
  if (!summaryPath) return null;
  return pathFromTarget(targetRepo, summaryPath);
}

function importerRunRoot(targetRepo, batch) {
  const importerRunId = batch?.report?.importer?.runId || null;
  if (!importerRunId) return null;
  return path.join(targetRepo, ".codex-runtime", "sdk", "generic-repo-importer", importerRunId);
}

function nonLiveReportPathFromBatch(targetRepo, batch) {
  if (batch?.report?.recovery?.validationReport) {
    return pathFromTarget(targetRepo, batch.report.recovery.validationReport);
  }
  const root = importerRunRoot(targetRepo, batch);
  if (!root) return null;
  const reportPath = path.join(root, "validation", "non-live-report.json");
  return existsSync(reportPath) ? reportPath : null;
}

function controlledMergeReportPathFromBatch(targetRepo, batch) {
  const root = importerRunRoot(targetRepo, batch);
  if (!root) return null;
  for (const candidate of [
    path.join(root, "merge", "controlled-merge-report.json"),
    path.join(root, "merge", "supervisor-merge-plan.json"),
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function childSummaryPathFromBatch(targetRepo, batch) {
  const importerRunId = batch?.report?.importer?.runId || null;
  if (!importerRunId) return null;
  const dir = path.join(targetRepo, ".codex-runtime", "sdk", "generic-repo-importer", importerRunId, "implementation", "child-run-summaries");
  if (!existsSync(dir)) return null;
  const summaries = readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => path.join(dir, entry));
  return summaries[0] || null;
}

function expectedHashesPresent(envelope) {
  if (envelope.status !== "completed") {
    return false;
  }
  const always = [
    "queueSha256",
    "ledgerSha256Before",
    "ledgerSha256After",
    "manifestSha256",
    "runtimeStateSha256",
    "changedPathsSha256",
  ];
  return always.every((field) => typeof envelope[field] === "string" && envelope[field].length > 0);
}

function missingCompletionProofHashes(envelope) {
  if (envelope.status !== "completed") {
    return [];
  }
  return [
    "queueSha256",
    "ledgerSha256Before",
    "ledgerSha256After",
    "manifestSha256",
    "runtimeStateSha256",
    "changedPathsSha256",
  ].filter((field) => typeof envelope[field] !== "string" || envelope[field].length === 0);
}

function buildProofEnvelope({ batch, candidate, gitHeadAfter, gitHeadBefore, item, ledgerSha256Before, liveRerun, registryPath, report, runRoot, state, targetRepo }) {
  const changedPaths = compactPathArray(
    item?.commitId ? gitCommitChangedPaths(targetRepo, item.commitId) : gitChangedPaths(targetRepo),
    64,
  );
  const plannedPaths = compactPathArray(item?.plannedPaths || (candidate ? candidatePlannedPaths(candidate) : []), 64);
  const plannedSet = new Set(plannedPaths);
  const unplannedPaths = changedPaths.filter((entry) => !plannedSet.has(entry) && !SHARED_OWNER_PATHS.includes(entry));
  const childSummaryPath = childSummaryPathFromBatch(targetRepo, batch);
  const importerSummaryPath = importerSummaryPathFromBatch(targetRepo, batch);
  const controlledMergeReportPath = controlledMergeReportPathFromBatch(targetRepo, batch);
  const nonLiveReportPath = nonLiveReportPathFromBatch(targetRepo, batch);
  const liveRerunReportPath = pathFromTarget(targetRepo, item?.liveRerunReport);
  const manifestPath = batch?.singleLedgerPath || null;
  const ledgerPath = pathFromTarget(targetRepo, report.ledgerPath);
  const envelope = {
    schema: PROOF_ENVELOPE_SCHEMA,
    runId: report.runId,
    candidateId: candidate?.id || item?.candidateId || null,
    phase: item?.status === "completed"
      ? "candidate_completed"
      : report.phaseBoundary?.completedPhase || report.currentPhase || report.status || item?.status || "unknown",
    nextPhase: report.phaseBoundary?.nextPhase || report.nextPhase || null,
    status: item?.status || report.status,
    strictOnePhase: report.strictOnePhase?.enabled === true,
    contractComplete: false,
    gitHeadBefore: gitHeadBefore || null,
    gitHeadAfter: gitHeadAfter || null,
    queueSha256: sha256FileIfExists(ledgerPath),
    ledgerSha256Before: ledgerSha256Before || null,
    ledgerSha256After: sha256FileIfExists(ledgerPath),
    manifestSha256: sha256FileIfExists(manifestPath),
    runtimeStateSha256: sha256FileIfExists(path.join(runRoot, "state.json")),
    changedPaths,
    changedPathsSha256: sha256Json(changedPaths),
    plannedPaths,
    unplannedPaths,
    childResultSummarySha256: sha256FileIfExists(childSummaryPath),
    importerResultSummarySha256: sha256FileIfExists(importerSummaryPath),
    controlledMergeReportSha256: sha256FileIfExists(controlledMergeReportPath),
    nonLiveReportSha256: sha256FileIfExists(nonLiveReportPath),
    liveRerunReportSha256: sha256FileIfExists(liveRerunReportPath),
    validationCommandsRun: validationCommandsFromReports({ batch, liveRerun }),
    nonLiveValidationComplete: Boolean(nonLiveReportPath || batch?.report?.status === "completed"),
    liveCepAeRun: Boolean(liveRerun),
    fallbackProviderUsed: false,
    localOllamaUsed: false,
    dependencyChanged: changedPaths.some(isDependencyPath),
    pushOrPrCreated: false,
    nextCommand: `node orchestrator/run-generic-repo-full-intake.mjs --ledger ${report.ledgerPath} --run-id ${report.runId} --max-items 1 --compact-json`,
    artifactPaths: {
      childResultSummary: childSummaryPath ? normalizeRepoPath(path.relative(targetRepo, childSummaryPath)) : null,
      controlledMergeReport: controlledMergeReportPath ? normalizeRepoPath(path.relative(targetRepo, controlledMergeReportPath)) : null,
      importerResultSummary: importerSummaryPath ? normalizeRepoPath(path.relative(targetRepo, importerSummaryPath)) : null,
      liveRerunReport: liveRerunReportPath ? normalizeRepoPath(path.relative(targetRepo, liveRerunReportPath)) : null,
      manifest: manifestPath ? normalizeRepoPath(path.relative(targetRepo, manifestPath)) : null,
      nonLiveReport: nonLiveReportPath ? normalizeRepoPath(path.relative(targetRepo, nonLiveReportPath)) : null,
    },
    bindingSha256: {
      liveBindingsSha256: sha256FileIfExists(registryPath),
      policySha256: sha256Json(report.safetyPolicy || {}),
      stateSha256: sha256FileIfExists(path.join(runRoot, "state.json")),
    },
    createdAt: new Date().toISOString(),
  };
  if (process.env.AE_AGENT_FULL_INTAKE_TEST_DROP_MANIFEST_HASH === "1" && envelope.status === "completed") {
    envelope.manifestSha256 = null;
  }
  envelope.missingRequiredHashes = missingCompletionProofHashes(envelope);
  envelope.contractComplete = expectedHashesPresent(envelope);
  return envelope;
}

function writeProofEnvelope(args) {
  const envelope = buildProofEnvelope(args);
  if (envelope.status === "completed" && envelope.contractComplete !== true) {
    throw new Error(`proof-envelope-missing-required-hashes:${envelope.missingRequiredHashes.join(",")}`);
  }
  const proofPath = path.join(args.runRoot, "proof-envelope.json");
  writeJson(proofPath, envelope);
  const size = statSync(proofPath).size;
  if (size > PROOF_ENVELOPE_MAX_BYTES) {
    throw new Error(`proof-envelope-too-large:${size}>${PROOF_ENVELOPE_MAX_BYTES}`);
  }
  return {
    envelope,
    path: normalizeRepoPath(path.relative(args.targetRepo, proofPath)),
    sha256: sha256FileIfExists(proofPath),
  };
}

function buildResumeCard({ blockers = [], candidate, item, ledgerPath, proof, queuePath, report, runRoot, targetRepo }) {
  const ledgerSha256 = sha256FileIfExists(ledgerPath);
  const queueSha256 = sha256FileIfExists(queuePath || ledgerPath);
  return {
    schema: RESUME_CARD_SCHEMA,
    runId: report.runId,
    lastCompletedPhase: proof?.envelope?.phase || item?.status || report.status,
    nextPhase: proof?.envelope?.nextPhase || report.nextPhase || null,
    strictOnePhase: report.strictOnePhase?.enabled === true,
    candidateId: candidate?.id || item?.candidateId || null,
    status: item?.status || report.status,
    blockers,
    proofEnvelopePath: proof?.path || normalizeRepoPath(path.relative(targetRepo, path.join(runRoot, "proof-envelope.json"))),
    proofEnvelopeSha256: proof?.sha256 || sha256FileIfExists(path.join(runRoot, "proof-envelope.json")),
    ledgerPath: normalizeRepoPath(path.relative(targetRepo, ledgerPath)) || normalizeRepoPath(ledgerPath),
    ledgerSha256,
    queuePath: normalizeRepoPath(path.relative(targetRepo, queuePath || ledgerPath)) || normalizeRepoPath(queuePath || ledgerPath),
    queueSha256,
    nextCommand: proof?.envelope?.nextCommand || `node orchestrator/run-generic-repo-full-intake.mjs --ledger ${report.ledgerPath} --run-id ${report.runId} --max-items 1 --compact-json`,
    forbiddenNextActions: [
      "do not print full runtime reports in parent chat",
      "do not run max-items > 1 without explicit batch approval",
      "do not use Local/Ollama or fallback providers",
      "do not commit recovered timeout patches before semantic review proof",
    ],
  };
}

function writeResumeCard(args) {
  const card = buildResumeCard(args);
  const cardPath = path.join(args.runRoot, "resume-card.json");
  writeJson(cardPath, card);
  const size = statSync(cardPath).size;
  if (size > RESUME_CARD_MAX_BYTES) {
    throw new Error(`resume-card-too-large:${size}>${RESUME_CARD_MAX_BYTES}`);
  }
  return {
    card,
    path: normalizeRepoPath(path.relative(args.targetRepo, cardPath)),
    sha256: sha256FileIfExists(cardPath),
  };
}

function compactParallelForParent(report) {
  const parallel = report.parallel || null;
  if (!parallel) {
    return null;
  }
  const reducer = parallel.reducer || null;
  return {
    optIn: parallel.optIn === true,
    mode: parallel.mode || null,
    limit: parallel.limit ?? null,
    planPath: parallel.planPath || null,
    selectedCandidateIds: boundedStrings(parallel.selectedCandidateIds || [], COMPACT_OUTPUT_ID_LIMIT),
    worktrees: {
      created: parallel.worktrees?.created || 0,
      detached: parallel.worktrees?.detached || 0,
      runOwned: parallel.worktrees?.runOwned || 0,
    },
    proposals: {
      count: Array.isArray(parallel.proposals) ? parallel.proposals.length : 0,
      ready: Array.isArray(parallel.proposals)
        ? parallel.proposals.filter((entry) => entry.status === "proposal_ready").length
        : 0,
      paths: boundedStrings((parallel.proposals || []).map((entry) => entry.path), COMPACT_OUTPUT_ID_LIMIT),
    },
    reducer: reducer
      ? {
          status: reducer.status || null,
          acceptedCandidateIds: boundedStrings((reducer.accepted || []).map((entry) => entry.candidateId), COMPACT_OUTPUT_ID_LIMIT),
          rejectedCandidateIds: boundedStrings((reducer.rejected || []).map((entry) => entry.candidateId), COMPACT_OUTPUT_ID_LIMIT),
          blockedCandidateIds: boundedStrings((reducer.blocked || []).map((entry) => entry.candidateId), COMPACT_OUTPUT_ID_LIMIT),
          commitId: reducer.commitId || null,
          liveRerun: reducer.liveRerun || null,
        }
      : null,
  };
}

function compactParentReport(report) {
  const items = Array.isArray(report.items) ? report.items : [];
  const resolutionSummary = summarizeResolutionQueueForParent(report.resolutionQueue);
  const failedCandidateIds = boundedStrings(
    items
      .filter((item) => String(item.status || "").startsWith("failed_"))
      .map((item) => item.candidateId),
    COMPACT_OUTPUT_ID_LIMIT,
  );
  const blockedCandidateIds = boundedStrings(
    items
      .filter((item) => String(item.status || "").startsWith("blocked_"))
      .map((item) => item.candidateId),
    COMPACT_OUTPUT_ID_LIMIT,
  );
  const skippedCount = items.filter((item) => String(item.status || "").startsWith("skipped_")).length;
  const completedCandidateIds = boundedStrings(
    items
      .filter((item) => item.status === "completed")
      .map((item) => item.candidateId),
    COMPACT_OUTPUT_ID_LIMIT,
  );
  const commits = boundedStrings(report.commits, COMPACT_OUTPUT_COMMIT_LIMIT);
  return {
    schema: "generic-repo-full-intake.parent-compact-output.v1",
    ok: report.ok === true,
    status: report.status || null,
    runId: report.runId || null,
    strictOnePhase: report.strictOnePhase?.enabled === true
      ? {
          enabled: true,
          completedPhase: report.phaseBoundary?.completedPhase || report.currentPhase || null,
          nextPhase: report.phaseBoundary?.nextPhase || report.nextPhase || null,
          stopBoundary: report.phaseBoundary?.stopBoundary || null,
        }
      : { enabled: false },
    counts: {
      items: items.length,
      completed: completedCandidateIds.count,
      blocked: blockedCandidateIds.count,
      failed: failedCandidateIds.count,
      skipped: skippedCount,
      commits: commits.count,
      requeued: resolutionSummary.requeuedCandidateIds.count,
      terminalTickets: resolutionSummary.terminalTicketCount,
      openTickets: resolutionSummary.openTicketCount,
    },
    lastItem: compactLastItem(items[items.length - 1] || null),
    commits,
    requeuedCandidateIds: resolutionSummary.requeuedCandidateIds,
    failedCandidateIds,
    resolutionQueue: resolutionSummary,
    proofEnvelope: {
      path: report.proofEnvelopePath || null,
      sha256: report.proofEnvelopeSha256 || null,
      contractComplete: report.proofEnvelopeContractComplete === true,
    },
    resumeCard: {
      path: report.resumeCardPath || null,
      sha256: report.resumeCardSha256 || null,
    },
    contextBudget: {
      currentContextPercent: report.contextBudget?.currentContextPercent ?? null,
      predictedContextPercent: report.contextBudget?.predictedContextPercent ?? null,
      lastDecision: report.contextBudget?.lastDecision || null,
    },
    parallel: compactParallelForParent(report),
    nextAction: inferParentNextAction(report, resolutionSummary, failedCandidateIds),
    compactPaths: compactPathsForParent(report),
  };
}

function createSingleCandidateLedger({ candidate, ledger, runRoot, targetRepo }) {
  const currentHead = gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head");
  const currentBranch = gitOutput(targetRepo, ["branch", "--show-current"], "branch-show-current");
  const cloned = JSON.parse(JSON.stringify(ledger));
  cloned.target = {
    ...cloned.target,
    branch: currentBranch || cloned.target.branch,
    head: currentHead,
    repoPath: targetRepo,
  };
  cloned.nextCandidate = {
    id: candidate.id,
    sourcePath: candidate.sourcePath,
    classification: candidate.classification,
    suggestedTools: candidate.suggestedTools,
    reason: "Selected by generic full-intake serial loop.",
  };
  cloned.entries = cloned.entries.map((entry) => {
    if (entry.id === candidate.id) {
      return { ...entry, status: "queued" };
    }
    return { ...entry, status: entry.status === "queued" ? "full_intake_not_selected" : entry.status };
  });
  const ledgerPath = path.join(runRoot, "candidates", safeId(candidate.id), "import", "single-candidate-ledger.json");
  writeJson(ledgerPath, cloned);
  return ledgerPath;
}

function runCandidateImport({ candidate, contextPercent, ledger, runId, runRoot, targetRepo }) {
  const singleLedgerPath = createSingleCandidateLedger({ candidate, ledger, runRoot, targetRepo });
  const retryNonce = candidate.implementation?.retryNonce || candidate.implementation?.recoveryIntent?.retryNonce || "";
  const batchRunId = safeId(
    `${safeId(runId).slice(0, 36)}-${sha256Text(`${candidate.id}:${retryNonce}`).slice(0, 10)}-import`,
  ).slice(0, 60);
  const reportDir = normalizeRepoPath(path.relative(targetRepo, path.join(runRoot, "queue-supervisor")));
  let report = null;
  try {
    report = runBatch(
      {
        batch: true,
        contextPercent,
        ledger: singleLedgerPath,
        maxItems: "1",
        reportDir,
        runId: batchRunId,
        targetRepo,
      },
      REPO_ROOT,
    );
  } catch (error) {
    const reportPath = discoverCandidateBatchReportPath({ candidateId: candidate.id, runRoot, targetRepo });
    const discoveredReport = readCompactJsonIfExists(
      absoluteReportPath(targetRepo, reportPath),
      "candidate-import-error-batch-report",
      BATCH_REPORT_SUMMARY_MAX_BYTES,
    );
    if (discoveredReport) {
      error.report = discoveredReport;
    }
    throw error;
  }
  return { batchRunId, report, singleLedgerPath };
}

function absoluteReportPath(targetRepo, reportPath) {
  if (!reportPath) return null;
  return path.isAbsolute(reportPath) ? reportPath : path.resolve(targetRepo, reportPath);
}

function readJsonIfExists(filePath, label) {
  if (!filePath || !existsSync(filePath)) return null;
  return readJson(filePath, label);
}

function readCompactJsonIfExists(filePath, label, maxBytes) {
  if (!filePath || !existsSync(filePath)) return null;
  return readCompactJson(filePath, label, maxBytes);
}

function childRunSummariesForImporter(targetRepo, importerRunId) {
  const dir = path.join(targetRepo, ".codex-runtime", "sdk", "generic-repo-importer", importerRunId, "implementation", "child-run-summaries");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => path.join(dir, entry))
    .map((filePath) => readCompactJson(filePath, `child-run-summary:${filePath}`, CHILD_RESULT_SUMMARY_MAX_BYTES));
}

function batchReportMentionsCandidate(report, candidateId) {
  if (!report || !candidateId) return false;
  if (report.nextCandidate?.id === candidateId) return true;
  if (Array.isArray(report.selectedCandidateIds) && report.selectedCandidateIds.includes(candidateId)) return true;
  if (Array.isArray(report.eligibleCandidateIds) && report.eligibleCandidateIds.includes(candidateId)) return true;
  return Array.isArray(report.items) && report.items.some((item) => item?.candidateId === candidateId);
}

function discoverCandidateBatchReportPath({ candidateId, runRoot, targetRepo }) {
  const queueRoot = path.join(runRoot, "queue-supervisor");
  if (!candidateId || !existsSync(queueRoot)) return null;
  const matches = [];
  for (const entry of readdirSync(queueRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const reportPath = path.join(queueRoot, entry.name, "batch-report.json");
    if (!existsSync(reportPath)) continue;
    const report = readCompactJsonIfExists(reportPath, `candidate-batch-report:${entry.name}`, BATCH_REPORT_SUMMARY_MAX_BYTES);
    if (!batchReportMentionsCandidate(report, candidateId)) continue;
    matches.push({
      createdAtMs: Date.parse(report.createdAt || "") || 0,
      mtimeMs: statSync(reportPath).mtimeMs,
      reportPath,
    });
  }
  matches.sort((left, right) => (right.createdAtMs || right.mtimeMs) - (left.createdAtMs || left.mtimeMs));
  return matches.length > 0 ? normalizeRepoPath(path.relative(targetRepo, matches[0].reportPath)) : null;
}

function isLegacyReasoningEffortCliFailure({ batchReportPath, targetRepo }) {
  const report = readCompactJsonIfExists(
    absoluteReportPath(targetRepo, batchReportPath),
    "legacy-reasoning-effort-batch-report",
    BATCH_REPORT_SUMMARY_MAX_BYTES,
  );
  const importerRunId = report?.importer?.runId || report?.items?.[0]?.importerRunId || null;
  if (!importerRunId) return false;
  return childRunSummariesForImporter(targetRepo, importerRunId).some((summary) => (
    summary?.status === "failed_process" &&
    summary.exitCode === 2 &&
    Array.isArray(summary.changedPaths) &&
    summary.changedPaths.length === 0 &&
    Array.isArray(summary.unplannedPaths) &&
    summary.unplannedPaths.length === 0 &&
    String(summary.stderr?.tail || "").includes(LEGACY_REASONING_EFFORT_CLI_ERROR)
  ));
}

function resolveChildTimeoutEvidence({ candidate, targetRepo, batchReportPath }) {
  const report = readCompactJsonIfExists(
    absoluteReportPath(targetRepo, batchReportPath),
    "child-timeout-batch-report",
    BATCH_REPORT_SUMMARY_MAX_BYTES,
  );
  if (!report) {
    throw new Error(`child-timeout-batch-report-missing:${batchReportPath || "none"}`);
  }
  const importerRunId = report.importer?.runId || report.items?.[0]?.importerRunId || null;
  if (!importerRunId) {
    throw new Error("child-timeout-importer-run-id-missing");
  }
  const childSummaries = childRunSummariesForImporter(targetRepo, importerRunId);
  if (childSummaries.length === 0) {
    throw new Error(`child-timeout-child-summary-missing:${importerRunId}`);
  }
  const childResult = childSummaries.find((entry) => (
    entry.status === "failed_timeout" &&
    Array.isArray(entry.changedPaths) &&
    entry.changedPaths.length > 0
  )) || childSummaries.find((entry) => entry.status === "failed_timeout") || null;
  if (!childResult) {
    throw new Error(`child-timeout-summary-result-missing:${importerRunId}`);
  }
  return { childResult, importerRunId, report };
}

function recoverableChildPatchPaths(childResult) {
  const planned = new Set((childResult.plannedPaths || []).map(normalizeRepoPath));
  const changed = (childResult.changedPaths || []).map(normalizeRepoPath).filter(Boolean);
  const unplanned = Array.isArray(childResult.unplannedPaths) ? childResult.unplannedPaths.filter(Boolean) : [];
  if (unplanned.length > 0 || childResult.plannedPathGate !== "passed") {
    throw new Error(`child-timeout-planned-path-gate-failed:${unplanned.join(",") || childResult.plannedPathGate}`);
  }
  for (const changedPath of changed) {
    if (!planned.has(changedPath)) {
      throw new Error(`child-timeout-unplanned-changed-path:${changedPath}`);
    }
    if (isDependencyPath(changedPath)) {
      throw new Error(`child-timeout-dependency-path-forbidden:${changedPath}`);
    }
    if (isRawJsxTargetPath(changedPath)) {
      throw new Error(`child-timeout-raw-jsx-path-forbidden:${changedPath}`);
    }
  }
  return changed
    .filter((repoPath) => repoPath !== ".codex/handoff.md")
    .filter((repoPath) => repoPath !== "plans/target-app-execplan.md")
    .sort();
}

function spawnGitApply(targetRepo, args, label) {
  const result = spawnSync("git", ["apply", ...args], {
    cwd: targetRepo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    exitCode: result.status,
    label,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

function spawnGit(targetRepo, args, label) {
  const result = spawnSync("git", args, {
    cwd: targetRepo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    exitCode: result.status,
    label,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

function rollbackChildTimeoutPatch({ applyPaths, patchPath, targetRepo }) {
  const reverse = spawnGitApply(targetRepo, ["-R", patchPath], "recovery-git-apply-reverse");
  if (!reverse.ok) {
    return {
      ok: false,
      reason: `reverse-failed:${reverse.stderr || reverse.stdout}`,
    };
  }
  const unstage = spawnGit(targetRepo, ["restore", "--staged", "--source=HEAD", "--", ...applyPaths], "recovery-git-restore-staged");
  if (!unstage.ok) {
    return {
      ok: false,
      reason: `unstage-failed:${unstage.stderr || unstage.stdout}`,
    };
  }
  const remainingDirty = gitChangedPaths(targetRepo).filter((repoPath) => applyPaths.includes(repoPath));
  if (remainingDirty.length > 0) {
    const restore = spawnGit(targetRepo, ["restore", "--worktree", "--source=HEAD", "--", ...remainingDirty], "recovery-git-restore-worktree");
    if (!restore.ok) {
      return {
        ok: false,
        reason: `worktree-restore-failed:${restore.stderr || restore.stdout}`,
      };
    }
  }
  const dirtyAfterRollback = gitChangedPaths(targetRepo).filter((repoPath) => applyPaths.includes(repoPath));
  if (dirtyAfterRollback.length > 0) {
    return {
      ok: false,
      reason: `rollback-left-dirty-paths:${dirtyAfterRollback.join(",")}`,
    };
  }
  return { ok: true };
}

function buildDiffPatchFromWorktree({ applyPaths, patchPath, worktreePath }) {
  const untrackedExisting = applyPaths.filter((repoPath) => {
    const absolute = path.join(worktreePath, repoPath);
    return existsSync(absolute) && !gitPathIsTracked(worktreePath, repoPath);
  });
  if (untrackedExisting.length > 0) {
    const addResult = spawnSync("git", ["add", "--intent-to-add", "--", ...untrackedExisting], {
      cwd: worktreePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (addResult.status !== 0) {
      throw new Error(`child-timeout-worktree-intent-to-add-failed:${addResult.stderr || addResult.stdout}`);
    }
  }
  const result = spawnSync("git", ["diff", "--binary", "--", ...applyPaths], {
    cwd: worktreePath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`child-timeout-worktree-diff-failed:${result.stderr || result.stdout}`);
  }
  if (!result.stdout.trim()) {
    throw new Error("child-timeout-worktree-diff-empty");
  }
  writeFileSync(patchPath, result.stdout, "utf8");
}

function runRecoveryValidation({ applyPaths, logDir, targetRepo, timeoutMs }) {
  const jsPaths = applyPaths.filter((repoPath) => /\.(?:c?m?js)$/i.test(repoPath));
  const commands = [
    ...jsPaths.map((repoPath) => `node --check ${repoPath}`),
    applyPaths.includes("scripts/solution-library-validation-smoke.js")
      ? "node scripts/solution-library-validation-smoke.js"
      : null,
    "git diff --check",
  ].filter(Boolean);
  const series = runCommandSeries({
    commands,
    cwd: targetRepo,
    labelPrefix: "recovery-non-live",
    logDir,
    targetRepo,
    timeoutMs,
  });
  const report = {
    schema: RECOVERY_VALIDATION_SCHEMA,
    status: series.ok ? "passed" : "failed",
    ok: series.ok,
    commands: series.results.map((entry) => commandEvidence(entry, targetRepo)),
    failedCommand: series.failed ? commandEvidence(series.failed, targetRepo) : null,
    createdAt: new Date().toISOString(),
  };
  return report;
}

function childTimeoutRecoveryExhaustedError({ affected, recoveryError, retryError, targetRepo, ticket }) {
  const retryMessage = retryError && retryError.message ? retryError.message : String(retryError || "");
  const recoveryMessage = recoveryError && recoveryError.message ? recoveryError.message : String(recoveryError || "");
  const finalMessage = retryMessage || recoveryMessage || "child timeout recovery exhausted";
  const finalized = finalizeResolutionTicket({
    affected,
    evidence: {
      attemptsExhausted: true,
      recoveryError: recoveryMessage || null,
      retryError: retryMessage || null,
    },
    reason: "child_timeout_recovery_exhausted",
    status: "terminal_unresolved",
    targetRepo,
    ticketRef: ticket.isolation.ticketPath,
  });
  const error = new Error(`child-timeout-recovery-exhausted:${finalMessage}`);
  error.childTimeoutRecoveryExhausted = true;
  error.resolutionStatus = "terminal_unresolved";
  error.resolutionTicket = finalized.isolation.ticketPath;
  return error;
}

function recoverChildTimeoutPatch({ candidate, runId, runRoot, targetRepo, timeoutMs }) {
  const intent = candidate.implementation?.recoveryIntent || {};
  const ticketPath = intent.ticketPath || path.join("resolution-tickets", safeId(candidate.id), "ticket.json");
  const recoveryRoot = path.join(runRoot, "candidates", safeId(candidate.id), "import-recovery");
  const logDir = path.join(recoveryRoot, "logs");
  mkdirSync(logDir, { recursive: true });
  const batchReportPath =
    intent.batchReport ||
    candidate.failClosed?.batchReport ||
    candidate.implementation?.batchReport ||
    discoverCandidateBatchReportPath({ candidateId: candidate.id, runRoot, targetRepo });
  const { childResult, importerRunId, report: sourceBatchReport } = resolveChildTimeoutEvidence({
    batchReportPath,
    candidate,
    targetRepo,
  });
  const worktreePath = childResult.actualWorktreePath;
  if (!worktreePath || !existsSync(worktreePath)) {
    throw new Error(`child-timeout-worktree-missing:${worktreePath || "none"}`);
  }
  const worktreeRelative = normalizeRepoPath(path.relative(targetRepo, worktreePath));
  if (!gitPathIsIgnored(targetRepo, worktreeRelative)) {
    throw new Error(`child-timeout-worktree-not-ignored:${worktreeRelative}`);
  }
  const applyPaths = recoverableChildPatchPaths(childResult);
  if (applyPaths.length === 0) {
    throw new Error("child-timeout-no-mergeable-planned-paths");
  }
  const dirtyBefore = gitChangedPaths(targetRepo);
  if (dirtyBefore.length > 0) {
    throw new Error(`child-timeout-target-dirty-before-recovery:${dirtyBefore.join(",")}`);
  }

  const patchPath = path.join(recoveryRoot, "controlled-child-timeout.patch");
  buildDiffPatchFromWorktree({ applyPaths, patchPath, worktreePath });
  const check = spawnGitApply(targetRepo, ["--check", "--3way", patchPath], "recovery-git-apply-check");
  if (!check.ok) {
    throw new Error(`child-timeout-patch-not-applicable:${check.stderr || check.stdout}`);
  }
  const apply = spawnGitApply(targetRepo, ["--3way", patchPath], "recovery-git-apply");
  if (!apply.ok) {
    throw new Error(`child-timeout-patch-apply-failed:${apply.stderr || apply.stdout}`);
  }

  const dirtyAfterApply = gitChangedPaths(targetRepo);
  const unexpectedDirty = dirtyAfterApply.filter((repoPath) => !applyPaths.includes(repoPath));
  if (unexpectedDirty.length > 0) {
    throw new Error(`child-timeout-recovery-unexpected-dirty-path:${unexpectedDirty.join(",")}`);
  }

  const validation = runRecoveryValidation({ applyPaths, logDir, targetRepo, timeoutMs });
  validation.reportPath = normalizeRepoPath(path.relative(targetRepo, path.join(recoveryRoot, "recovery-validation-report.json")));
  writeJson(path.join(recoveryRoot, "recovery-validation-report.json"), validation);
  if (!validation.ok) {
    const rollback = rollbackChildTimeoutPatch({ applyPaths, patchPath, targetRepo });
    if (!rollback.ok) {
      throw new Error(`child-timeout-recovery-validation-failed-and-rollback-failed:${rollback.reason}`);
    }
    throw new Error(`child-timeout-recovery-validation-failed:${validation.failedCommand?.label || "unknown"}`);
  }

  const recoveryReport = {
    schema: CHILD_TIMEOUT_RECOVERY_SCHEMA,
    runId,
    candidateId: candidate.id,
    status: "imported_non_live_validated",
    ok: true,
    mode: "controlled_child_timeout_patch",
    sourceBatchReport: normalizeRepoPath(path.relative(targetRepo, absoluteReportPath(targetRepo, batchReportPath))),
    importerRunId,
    sourceImporterRunId: importerRunId,
    sourceChildStatus: childResult.status,
    sourceWorktree: worktreeRelative,
    patchPath: normalizeRepoPath(path.relative(targetRepo, patchPath)),
    plannedPaths: childResult.plannedPaths || [],
    appliedPaths: applyPaths,
    skippedSharedPaths: [".codex/handoff.md", "plans/target-app-execplan.md"].filter((repoPath) =>
      (childResult.changedPaths || []).map(normalizeRepoPath).includes(repoPath)),
    validationReport: validation.reportPath,
    resolutionTicket: ticketPath,
    safetyPolicy: {
      controlledMergeOnly: true,
      targetCleanBeforeApply: true,
      plannedPathsOnly: true,
      sharedTrackedFilesMergedSerially: true,
      ignoredImporterWorktreeOnly: true,
    },
    createdAt: new Date().toISOString(),
  };
  recoveryReport.reportPath = normalizeRepoPath(path.relative(targetRepo, path.join(recoveryRoot, "child-timeout-recovery-report.json")));
  writeJson(path.join(recoveryRoot, "child-timeout-recovery-report.json"), recoveryReport);

  return {
    batchRunId: safeId(`${safeId(runId).slice(0, 36)}-${sha256Text(`${candidate.id}:recovered`).slice(0, 10)}-recovery`).slice(0, 60),
    report: {
      schema: "generic-repo-queue-supervisor.batch-report.v1",
      auxiliaryId: AUXILIARY_ID,
      ok: true,
      status: "imported_non_live_validated",
      mode: "child-timeout-recovery",
      runId: recoveryReport.runId,
      reportPath: recoveryReport.reportPath,
      importer: {
        manifestPath: sourceBatchReport.importer?.manifestPath || null,
        runId: importerRunId,
        resultSummary: {
          artifacts: [recoveryReport.validationReport],
          nonLiveValidationComplete: true,
          recoveryReport: recoveryReport.reportPath,
          runId: importerRunId,
          schema: "generic-repo-tool-importer.result-summary.v1",
          status: "recovered_child_timeout_patch",
          validationCommandsRun: true,
        },
        error: null,
      },
      recovery: recoveryReport,
      items: [
        {
          candidateId: candidate.id,
          plannedPaths: applyPaths,
          sourcePath: candidate.sourcePath,
          status: "imported_non_live_validated",
        },
      ],
      validation: {
        nonLiveValidationComplete: true,
        nonLiveValidationRun: true,
      },
    },
    recoveryReport,
    singleLedgerPath: null,
  };
}

function tryRecoverImportFailure({ candidate, contextPercent, error, ledger, runId, runRoot, targetRepo, timeoutMs }) {
  const message = error && error.message ? error.message : String(error || "");
  const reportPath =
    error?.report?.reportPath ||
    candidate.failClosed?.batchReport ||
    candidate.implementation?.batchReport ||
    discoverCandidateBatchReportPath({ candidateId: candidate.id, runRoot, targetRepo });
  if (!CHILD_TIMEOUT_REASONS.some((fragment) => message.includes(fragment))) {
    return null;
  }
  const groupId = resolutionGroupId({
    candidate,
    familyId: candidate.liveGate?.synthesisFamily || null,
    reason: message,
    type: "child-timeout",
  });
  const ticket = recordResolutionTicket({
    affected: [candidate],
    evidence: {
      batchReport: reportPath,
      failureReason: message,
      familyId: candidate.liveGate?.synthesisFamily || null,
      retryNonce: safeId(`${groupId}-${sha256Text(`${candidate.id}:${runId}:runtime`).slice(0, 8)}`),
    },
    groupId,
    reason: "runtime_child_timeout_recovery_started",
    runId,
    runRoot,
    status: "running_recovery",
    targetRepo,
    type: "child-timeout",
  });

  const recoveryCandidate = JSON.parse(JSON.stringify(candidate));
  recoveryCandidate.implementation = {
    ...(recoveryCandidate.implementation || {}),
    recoveryIntent: {
      mode: "recover_child_timeout_patch",
      batchReport: reportPath,
      retryNonce: ticket.evidence.retryNonce,
      ticketPath: ticket.isolation.ticketPath,
    },
    resolutionTicket: ticket.isolation.ticketPath,
    retryNonce: ticket.evidence.retryNonce,
  };

  try {
    const recovered = recoverChildTimeoutPatch({ candidate: recoveryCandidate, runId, runRoot, targetRepo, timeoutMs });
    recordResolutionTicket({
      affected: [candidate],
      evidence: {
        ...ticket.evidence,
        recoveryReport: recovered.recoveryReport.reportPath,
      },
      groupId,
      reason: "child_timeout_patch_recovered",
      runId,
      runRoot,
      status: "proved_recovered",
      targetRepo,
      type: "child-timeout",
    });
    return recovered;
  } catch (recoveryError) {
    const attempts = Number(candidate.implementation?.recoveryAttemptCount || 0);
    if (attempts >= 1) {
      throw childTimeoutRecoveryExhaustedError({
        affected: [candidate],
        recoveryError,
        targetRepo,
        ticket,
      });
    }
    const retryCandidate = JSON.parse(JSON.stringify(candidate));
    retryCandidate.implementation = {
      ...(retryCandidate.implementation || {}),
      recoveryAttemptCount: attempts + 1,
      recoveryIntent: {
        mode: "retry_narrow_once_after_child_timeout",
        previousRecoveryError: recoveryError.message,
        ticketPath: ticket.isolation.ticketPath,
      },
      retryNonce: ticket.evidence.retryNonce,
    };
    try {
      return runCandidateImport({ candidate: retryCandidate, contextPercent, ledger, runId, runRoot, targetRepo });
    } catch (retryError) {
      throw childTimeoutRecoveryExhaustedError({
        affected: [candidate],
        recoveryError,
        retryError,
        targetRepo,
        ticket,
      });
    }
  }
}

function runLiveRerun({ candidate, command, runRoot, targetRepo, timeoutMs }) {
  if (!command) {
    throw new Error(`live-rerun-command-missing: ${candidate.id}`);
  }
  if (!commandIsNarrowGeneratedOpenAiCli(command)) {
    throw new Error(`live-rerun-command-not-narrow-openai-cli: ${command}`);
  }
  const rerunRoot = path.join(runRoot, "candidates", safeId(candidate.id), "live-rerun");
  const logDir = path.join(rerunRoot, "logs");
  const preflight = runCommandSeries({
    commands: DEFAULT_PREFLIGHT_COMMANDS,
    cwd: targetRepo,
    labelPrefix: "rerun-read-only-preflight",
    logDir,
    targetRepo,
    timeoutMs,
  });
  const liveResult = preflight.ok
    ? runCommand({
        command,
        cwd: targetRepo,
        label: "rerun-generated-only-openai-cli-proof",
        logPath: path.join(logDir, "rerun-generated-only-openai-cli-proof.log"),
        timeoutMs,
      })
    : null;
  const report = {
    schema: "generic-repo-full-intake.live-rerun-report.v1",
    candidateId: candidate.id,
    status: preflight.ok && liveResult && liveResult.ok ? "passed" : "failed",
    ok: preflight.ok && liveResult && liveResult.ok,
    preflight: preflight.results.map((entry) => commandEvidence(entry, targetRepo)),
    liveProof: liveResult ? commandEvidence(liveResult, targetRepo) : null,
    failedCommand: preflight.failed || (liveResult && !liveResult.ok ? commandEvidence(liveResult, targetRepo) : null),
    createdAt: new Date().toISOString(),
  };
  report.reportPath = path.join(rerunRoot, "live-rerun-report.json");
  writeJson(report.reportPath, report);
  return report;
}

function findNextSafeQueuedCandidate(ledger, completedId) {
  return (
    ledger.entries
      .filter((entry) => entry.id !== completedId)
      .filter((entry) => entry.status === "queued")
      .filter((entry) => SAFE_CLASSIFICATIONS.has(entry.classification))
      .filter((entry) => Number.isInteger(entry.queueRank))
      .sort((left, right) => left.queueRank - right.queueRank || left.id.localeCompare(right.id))[0] || null
  );
}

function updateLedgerNextCandidate(ledger, completedId) {
  const next = findNextSafeQueuedCandidate(ledger, completedId);
  ledger.nextCandidate = next
    ? {
        id: next.id,
        sourcePath: next.sourcePath,
        classification: next.classification,
        suggestedTools: next.suggestedTools,
        reason: next.shortReason || next.description || "Next safe queued candidate selected by full-intake orchestrator.",
      }
    : null;
}

function updateLedgerTerminalStatus({ candidate, item, ledger, ledgerPath, targetRepo }) {
  const entry = ledger.entries.find((candidateEntry) => candidateEntry.id === candidate.id);
  if (!entry) {
    throw new Error(`candidate-missing-during-terminal-update: ${candidate.id}`);
  }
  const now = new Date().toISOString();
  entry.status = item.status;
  entry.blockedAt = now;
  entry.nextAction = `${safeId(item.status)}_by_${safeId(item.runId)}`;
  entry.failClosed = {
    schema: "generic-repo-full-intake.fail-closed.v1",
    runId: item.runId,
    candidateId: candidate.id,
    sourcePath: candidate.sourcePath,
    status: item.status,
    reason: item.reason || null,
    blockers: item.blockers || [],
    liveLaneStatus: item.liveLaneStatus || null,
    liveLaneReport: item.liveLaneReport || null,
    batchReport: item.batchReport || null,
    safetyPolicy: {
      broadCepSmokeAllowed: false,
      dependencyPackageChangesAllowed: false,
      fallbackProviderAllowed: false,
      localOllamaAllowed: false,
      rawJsxCopyAllowed: false,
      sourceRepoWritesAllowed: false,
      userAssetMutationOutsideGeneratedOnlyLaneAllowed: false,
    },
    createdAt: now,
  };
  entry.implementation = {
    ...(entry.implementation || {}),
    failureReason: item.reason || null,
    batchReport: item.batchReport || entry.implementation?.batchReport || null,
    plannedPaths: Array.isArray(entry.implementation?.plannedPaths) ? entry.implementation.plannedPaths : [],
  };
  if (item.resolutionTicket) {
    const ticket = readResolutionTicket(targetRepo, item.resolutionTicket);
    if (ticket) {
      attachResolutionReference(entry, ticket, item.resolutionStatus || ticket.status || item.status);
    }
    entry.implementation.resolutionTicket = item.resolutionTicket;
  }
  if (item.childTimeoutRecoveryExhausted === true) {
    entry.implementation.childTimeoutRecoveryExhausted = true;
  }
  if (item.liveLaneStatus || item.liveLaneReport) {
    entry.liveGate = {
      ...entry.liveGate,
      status: item.liveLaneStatus || entry.liveGate.status,
      failClosedEvidence: item.liveLaneReport || null,
      updatedAt: now,
    };
  }
  updateLedgerNextCandidate(ledger, candidate.id);
  writeJson(ledgerPath, ledger);
}

function updateLedgerCompletion({ batch, candidate, commitId, ledger, ledgerPath, liveRerun, targetRepo }) {
  const entry = ledger.entries.find((item) => item.id === candidate.id);
  if (!entry) {
    throw new Error(`candidate-missing-during-completion-update: ${candidate.id}`);
  }
  const importedItem = (batch.report.items || []).find((item) => item.candidateId === candidate.id) || null;
  entry.status = "completed";
  entry.completedAt = new Date().toISOString();
  entry.nextAction = `completed_by_${safeId(batch.batchRunId)}`;
  entry.implementation = {
    ...(entry.implementation || {}),
    batchReport: normalizeRepoPath(path.relative(targetRepo, path.join(targetRepo, batch.report.reportPath || ""))),
    batchRunId: batch.report.runId,
    commit: commitId || null,
    importerNonLiveReport: batch.report.recovery?.validationReport
      ? batch.report.recovery.validationReport
      : batch.report.importer?.resultSummary?.artifactPaths?.includes("validation/non-live-report.json") ||
          batch.report.importer?.resultSummary?.artifacts?.includes("validation/non-live-report.json")
      ? normalizeRepoPath(`.codex-runtime/sdk/generic-repo-importer/${batch.report.importer.runId}/validation/non-live-report.json`)
      : null,
    importerRunId: batch.report.importer?.runId || null,
    liveSummary: liveRerun ? normalizeRepoPath(path.relative(targetRepo, liveRerun.reportPath)) : null,
    plannedPaths: importedItem ? importedItem.plannedPaths : candidatePlannedPaths(candidate),
    sliceId: entry.implementation?.sliceId || safeId(`${candidate.id}-recipe-only-import`),
  };
  updateLedgerNextCandidate(ledger, candidate.id);
  writeJson(ledgerPath, ledger);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function insertAfterHeading(text, heading, line) {
  if (text.includes(line)) {
    return text;
  }
  const match = new RegExp(`(^|\\r?\\n)${escapeRegExp(heading)}\\r?\\n`).exec(text);
  if (!match) {
    return `${text.replace(/\s*$/, "\n\n")}${heading}\n\n${line}\n`;
  }
  const insertAt = match.index + match[0].length;
  const prefix = text.slice(0, insertAt);
  const suffix = text.slice(insertAt);
  return `${prefix}\n${line}${suffix.startsWith("\n") ? "" : "\n"}${suffix}`;
}

function insertValidationRow(text, row) {
  if (text.includes(row)) {
    return text;
  }
  const match = /(^|\r?\n)## Validation\r?\n/.exec(text);
  if (!match) {
    return `${text.replace(/\s*$/, "\n\n")}## Validation\n\n${row}\n`;
  }
  const afterHeading = match.index + match[0].length;
  const nextSection = text.indexOf("\n## ", afterHeading);
  const sectionEnd = nextSection === -1 ? text.length : nextSection;
  const section = text.slice(afterHeading, sectionEnd);
  const lines = section.split(/\n/);
  const separatorIndex = lines.findIndex((line) => /^\|\s*-+/.test(line));
  if (separatorIndex >= 0) {
    lines.splice(separatorIndex + 1, 0, row);
    return `${text.slice(0, afterHeading)}${lines.join("\n")}${text.slice(sectionEnd)}`;
  }
  return `${text.slice(0, afterHeading)}\n${row}${section.startsWith("\n") ? "" : "\n"}${section}${text.slice(sectionEnd)}`;
}

function updatePlanDocument({ candidate, commitId, item, targetRepo }) {
  const planPath = path.join(targetRepo, "plans", "target-app-execplan.md");
  if (!existsSync(planPath)) {
    return null;
  }
  const marker = `full-intake:${item.runId}:${candidate.id}`;
  let text = readFileSync(planPath, "utf8");
  const commitText = commitId || "recorded after candidate commit";
  const progressLine = `- [x] Full intake ${candidate.id}: completed by reusable generic full-intake orchestrator (${marker}); live gate ${item.liveLaneStatus || "not_required"}, importer batch ${item.batchRunId || "n/a"}, commit ${commitText}.`;
  const decisionLine = `- 2026-05-27: Generic full-intake orchestrator processed \`${candidate.sourcePath}\` as \`${candidate.id}\`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (${marker}).`;
  const validationRow = `| Full intake ${candidate.id} | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run \`${item.runId}\`: live lane \`${item.liveLaneStatus || "not_required"}\`, batch \`${item.batchRunId || "n/a"}\`, live rerun \`${item.liveRerunStatus || "not_required"}\`, commit \`${commitText}\`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |`;
  text = insertAfterHeading(text, "## Progress", progressLine);
  text = insertAfterHeading(text, "## Decision Log", decisionLine);
  text = insertValidationRow(text, validationRow);
  writeFileSync(planPath, text, "utf8");
  return normalizeRepoPath(path.relative(targetRepo, planPath));
}

function writeHandoff({ candidate, commitId, item, state, targetRepo }) {
  const handoffPath = path.join(targetRepo, ".codex", "handoff.md");
  mkdirSync(path.dirname(handoffPath), { recursive: true });
  const ledgerPath = pathFromTarget(targetRepo, state.ledgerPath);
  const ledgerSha256 = sha256FileIfExists(ledgerPath);
  const proofEnvelopePath = item.proofEnvelopePath || ".codex-runtime/sdk/generic-repo-full-intake/<run-id>/proof-envelope.json";
  const proofEnvelopeSha256 = item.proofEnvelopeSha256 || "pending";
  const nextCommand = `node orchestrator/run-generic-repo-full-intake.mjs --ledger ${state.ledgerPath} --run-id ${state.runId} --max-items 1 --compact-json`;
  const text = [
    "# Resume Card",
    `runId: ${state.runId}`,
    `lastCompletedPhase: ${item.status || "unknown"}`,
    `candidateId: ${candidate.id}`,
    `status: ${item.status || "unknown"}`,
    `blockers: ${item.reason || "none"}`,
    `proofEnvelopePath: ${proofEnvelopePath}`,
    `proofEnvelopeSha256: ${proofEnvelopeSha256}`,
    `ledgerPath: ${state.ledgerPath}`,
    `ledgerSha256: ${ledgerSha256 || "pending"}`,
    `queuePath: ${state.ledgerPath}`,
    `queueSha256: ${ledgerSha256 || "pending"}`,
    `nextCommand: ${nextCommand}`,
    "forbiddenNextActions: no full runtime reports; no maxItems>1 without approval; no Local/Ollama; no fallback providers; no broad live acceptance; no recovered-timeout commit before semantic proof",
    `commit: ${commitId || "pending"}`,
    "",
  ].join("\n");
  const lineCount = text.split(/\r?\n/).filter(Boolean).length;
  if (lineCount > RESUME_CARD_MAX_LINES || Buffer.byteLength(text, "utf8") > RESUME_CARD_MAX_BYTES) {
    throw new Error("handoff-resume-card-too-large");
  }
  writeFileSync(handoffPath, text, "utf8");
  return normalizeRepoPath(path.relative(targetRepo, handoffPath));
}

function stageAndCommitReviewableChanges(targetRepo, message) {
  const paths = gitChangedPaths(targetRepo)
    .filter((repoPath) => !gitPathIsIgnored(targetRepo, repoPath))
    .filter((repoPath) => gitPathIsTracked(targetRepo, repoPath) || existsSync(path.join(targetRepo, repoPath)));
  if (paths.length === 0) {
    return null;
  }
  for (const repoPath of paths) {
    if (isDependencyPath(repoPath)) {
      throw new Error(`commit-dependency-path-forbidden: ${repoPath}`);
    }
    if (isRawJsxTargetPath(repoPath)) {
      throw new Error(`commit-raw-jsx-path-forbidden: ${repoPath}`);
    }
  }
  const addResult = spawnSync("git", ["add", "--", ...paths], {
    cwd: targetRepo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (addResult.status !== 0) {
    throw new Error(`git-add-failed: ${addResult.stderr || addResult.stdout}`);
  }
  const staged = gitOutput(targetRepo, ["diff", "--cached", "--name-only"], "diff-cached-name-only")
    .split(/\r?\n/)
    .filter(Boolean);
  if (staged.length === 0) {
    return null;
  }
  const commitResult = spawnSync(
    "git",
    [
      "-c",
      "user.name=Generic Repo Full Intake",
      "-c",
      "user.email=generic-repo-full-intake@example.local",
      "commit",
      "-m",
      message,
    ],
    {
      cwd: targetRepo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (commitResult.status !== 0) {
    throw new Error(`git-commit-failed: ${commitResult.stderr || commitResult.stdout}`);
  }
  return gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head");
}

function pushItem(state, item) {
  const existingIndex = state.items.findIndex((entry) => entry.candidateId === item.candidateId);
  if (existingIndex >= 0) {
    state.items[existingIndex] = item;
  } else {
    state.items.push(item);
  }
  state.completedCandidateIds = state.items
    .filter((entry) => entry.status === "completed")
    .map((entry) => entry.candidateId);
  state.blockedCandidateIds = state.items
    .filter((entry) => String(entry.status || "").startsWith("blocked_") || String(entry.status || "").startsWith("failed_"))
    .map((entry) => entry.candidateId);
  state.skippedCandidateIds = state.items
    .filter((entry) => String(entry.status || "").startsWith("skipped_"))
    .map((entry) => entry.candidateId);
  return state;
}

function nextStrictPhase(phase) {
  const index = STRICT_PHASES.indexOf(phase);
  if (index < 0) {
    throw new Error(`strict-phase-unknown:${phase}`);
  }
  return STRICT_PHASES[index + 1] || null;
}

function strictItemStatusForPhase(phase) {
  return {
    select_candidate: "selected",
    prove_or_register_live_lane: "live_lane_ready",
    run_importer_phase: "importer_phase_complete",
    controlled_merge: "controlled_merge_complete",
    non_live_validation: "non_live_validation_complete",
    generated_only_live_rerun: "generated_only_live_rerun_complete",
    ledger_docs_handoff_commit_finalization: "completed",
  }[phase] || "phase_complete";
}

function activeStrictTransaction(state) {
  const transaction = state.activeTransaction || null;
  if (!transaction) return null;
  if (transaction.schema !== "generic-repo-full-intake.transaction.v1") {
    throw new Error("strict-transaction-schema-mismatch");
  }
  if (!STRICT_PHASES.includes(transaction.nextPhase)) {
    throw new Error(`strict-transaction-next-phase-invalid:${transaction.nextPhase || "missing"}`);
  }
  return transaction;
}

function loadBatchFromItem({ item, targetRepo }) {
  if (!item?.batchReport) return null;
  const reportPath = absoluteReportPath(targetRepo, item.batchReport);
  if (!existsSync(reportPath) || !statSync(reportPath).isFile()) return null;
  const report = readJson(reportPath, "strict-recovery-batch-report");
  const manifestPath = path.join(path.dirname(reportPath), "importer.manifest.json");
  return {
    batchRunId: item.batchRunId || report.runId || path.basename(path.dirname(reportPath)),
    report,
    singleLedgerPath: existsSync(manifestPath) ? manifestPath : null,
  };
}

function findRecoverableFailedLiveRerunTransaction({ dirtyPaths, ledger, runId, state, targetRepo }) {
  if (!dirtyPaths.length || state.activeTransaction) return null;
  const failedItem = (state.items || [])
    .slice()
    .reverse()
    .find((entry) => entry?.status === "failed_live_rerun" && Array.isArray(entry.plannedPaths) && entry.plannedPaths.length > 0);
  if (!failedItem) return null;
  const plannedSet = new Set(failedItem.plannedPaths.map(normalizeRepoPath));
  const dirtyIsPlanned = dirtyPaths.every((repoPath) => plannedSet.has(normalizeRepoPath(repoPath)) || SHARED_OWNER_PATHS.includes(normalizeRepoPath(repoPath)));
  if (!dirtyIsPlanned) return null;
  const candidate = (ledger.entries || []).find((entry) => entry.id === failedItem.candidateId);
  if (!candidate || candidate.status !== "failed_live_rerun") return null;
  if (candidate.liveGate?.required === true && !candidate.liveGate.command) return null;
  const batch = loadBatchFromItem({ item: failedItem, targetRepo });
  if (!batch?.report) return null;
  const item = {
    ...failedItem,
    completedAt: null,
    liveRerunStatus: null,
    reason: null,
    status: "non_live_validation_complete",
  };
  const transaction = {
    schema: "generic-repo-full-intake.transaction.v1",
    runId,
    candidate,
    item,
    batch,
    liveRerun: null,
    lastCompletedPhase: "non_live_validation",
    nextPhase: "generated_only_live_rerun",
    phaseProofs: [],
    recovery: {
      mode: "retry_failed_live_rerun_with_planned_dirty_paths",
      previousReason: failedItem.reason || null,
      previousLiveRerunReport: failedItem.liveRerunReport || null,
    },
    startedAt: failedItem.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return { batch, candidate, item, transaction };
}

function firstContextBudgetStep({ state, strictOnePhase }) {
  if (!strictOnePhase) {
    return {
      cost: CONTEXT_STEP_COST.resumePreflight,
      step: "resumePreflight",
    };
  }
  const transaction = activeStrictTransaction(state);
  const phase = transaction?.nextPhase || "select_candidate";
  return {
    cost: CONTEXT_STEP_COST.resumePreflight,
    phase,
    step: `strict_${phase}_resume_preflight`,
  };
}

function saveStrictTransaction({ runRoot, state, transaction }) {
  const nextState = {
    ...state,
    activeTransaction: {
      ...transaction,
      updatedAt: new Date().toISOString(),
    },
    strictOnePhase: {
      enabled: true,
      phases: STRICT_PHASES,
    },
  };
  return saveState(runRoot, nextState);
}

function clearStrictTransaction({ runRoot, state }) {
  const nextState = {
    ...state,
    strictOnePhase: {
      enabled: true,
      phases: STRICT_PHASES,
    },
  };
  delete nextState.activeTransaction;
  return saveState(runRoot, nextState);
}

function beginStrictTransaction({ candidate, item, phase, runId }) {
  return {
    schema: "generic-repo-full-intake.transaction.v1",
    runId,
    candidate,
    item,
    batch: null,
    liveRerun: null,
    lastCompletedPhase: phase,
    nextPhase: nextStrictPhase(phase),
    phaseProofs: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function recordStrictBoundary({ completedPhase, nextPhase, report, transaction }) {
  report.status = "phase_boundary";
  report.currentPhase = completedPhase;
  report.nextPhase = nextPhase;
  report.phaseBoundary = {
    schema: "generic-repo-full-intake.phase-boundary.v1",
    completedPhase,
    nextPhase,
    candidateId: transaction?.candidate?.id || transaction?.item?.candidateId || null,
    strictOnePhase: true,
    stopBoundary: "phase_boundary",
  };
}

function readImporterSummaryFromResult(importerResult, targetRepo) {
  const summaryPath = importerResult?.resultSummaryPath || null;
  if (!summaryPath) return null;
  const absolute = path.isAbsolute(summaryPath) ? summaryPath : path.resolve(targetRepo, summaryPath);
  return readCompactJson(absolute, `strict-importer-result-summary:${absolute}`, CHILD_RESULT_SUMMARY_MAX_BYTES);
}

function patchBatchWithImporterResult({ batch, importerResult, status, targetRepo }) {
  const resultSummary = readImporterSummaryFromResult(importerResult, targetRepo);
  const report = {
    ...batch.report,
    ok: true,
    status,
    importer: {
      ...(batch.report.importer || {}),
      error: null,
      manifestPath: batch.report.importer?.manifestPath || importerResult?.manifestPath || null,
      resultSummary,
      runId: importerResult?.runId || batch.report.importer?.runId || null,
    },
    importSummary: {
      ...(batch.report.importSummary || {}),
      manifestPath: batch.report.importer?.manifestPath || importerResult?.manifestPath || null,
      resultSummaryPath: resultSummary?.resultSummaryPath || importerResult?.resultSummaryPath || null,
      runId: importerResult?.runId || batch.report.importer?.runId || null,
    },
    validation: {
      ...(batch.report.validation || {}),
      nonLiveValidationRun: importerResult?.validationCommandsRun === true,
      nonLiveValidationComplete: importerResult?.nonLiveValidationComplete === true,
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
      pushOrPrCreated: false,
    },
  };
  const reportPath = pathFromTarget(targetRepo, report.reportPath);
  if (reportPath) {
    writeJson(reportPath, report);
  }
  return { ...batch, report };
}

function importerManifestPathFromBatch(targetRepo, batch) {
  const manifestPath = batch?.report?.importer?.manifestPath || batch?.report?.importSummary?.manifestPath || null;
  if (!manifestPath) {
    throw new Error("strict-importer-manifest-missing");
  }
  return pathFromTarget(targetRepo, manifestPath);
}

function runCandidateImporterPhase({ candidate, contextPercent, ledger, runId, runRoot, targetRepo }) {
  const singleLedgerPath = createSingleCandidateLedger({ candidate, ledger, runRoot, targetRepo });
  const retryNonce = candidate.implementation?.retryNonce || candidate.implementation?.recoveryIntent?.retryNonce || "";
  const batchRunId = safeId(
    `${safeId(runId).slice(0, 36)}-${sha256Text(`${candidate.id}:${retryNonce}`).slice(0, 10)}-import`,
  ).slice(0, 60);
  const reportDir = normalizeRepoPath(path.relative(targetRepo, path.join(runRoot, "queue-supervisor")));
  const prepareReport = runBatch(
    {
      batch: true,
      contextPercent,
      ledger: singleLedgerPath,
      maxItems: "1",
      prepareOnly: true,
      reportDir,
      runId: batchRunId,
      targetRepo,
    },
    REPO_ROOT,
  );
  if (!prepareReport.ok) {
    const error = new Error(`strict-importer-prepare-failed:${prepareReport.status}`);
    error.report = prepareReport;
    throw error;
  }
  let batch = { batchRunId, report: prepareReport, singleLedgerPath };
  const manifestPath = importerManifestPathFromBatch(targetRepo, batch);
  const importerResult = runImporter(
    {
      manifest: manifestPath,
      "run-implementation-worktrees": true,
      "run-implementation-child-runs": true,
    },
    REPO_ROOT,
  );
  batch = patchBatchWithImporterResult({
    batch,
    importerResult,
    status: "stopped_after_implementation_child_runs",
    targetRepo,
  });
  return batch;
}

function runImporterBoundaryPhase({ batch, flag, status, targetRepo }) {
  const manifestPath = importerManifestPathFromBatch(targetRepo, batch);
  const importerResult = runImporter(
    {
      manifest: manifestPath,
      [flag]: true,
    },
    REPO_ROOT,
  );
  return patchBatchWithImporterResult({ batch, importerResult, status, targetRepo });
}

function strictTerminalStatusForItems(items) {
  const completed = items.filter((item) => item.status === "completed").length;
  const blocked = items.filter((item) => String(item.status || "").startsWith("blocked_")).length;
  const failed = items.filter((item) => String(item.status || "").startsWith("failed_")).length;
  const skipped = items.filter((item) => String(item.status || "").startsWith("skipped_")).length;
  if (failed > 0) return "completed_with_failed_candidates";
  if (blocked > 0 || skipped > 0) {
    return completed > 0 ? "completed_with_blocked_or_skipped_candidates" : "completed_with_blocked_candidates";
  }
  return completed > 0 ? "completed" : "completed_no_candidates";
}

function finishStrictImporterBoundaryFailure({
  batch,
  candidate,
  error,
  gitHeadBefore,
  item,
  ledger,
  ledgerPath,
  ledgerSha256Before,
  liveRerun,
  registryPath,
  report,
  runRoot,
  state,
  targetRepo,
}) {
  item.status = "failed_import";
  item.reason = error.message;
  item.completedAt = new Date().toISOString();
  updateLedgerTerminalStatus({ candidate, item, ledger, ledgerPath, targetRepo });
  state = clearStrictTransaction({ runRoot, state: pushItem(state, item) });
  report.items.push(item);
  appendEvent(runRoot, { candidateId: candidate.id, event: "candidate_import_failed", reason: error.message, runId: item.runId });
  if (gitChangedPaths(targetRepo).length > 0) {
    report.status = "stopped_after_failed_import_dirty_target";
    report.ok = false;
  }
  return finishStrictPhaseReport({
    batch,
    candidate,
    gitHeadBefore,
    item,
    ledgerPath,
    ledgerSha256Before,
    liveRerun,
    registryPath,
    report,
    runRoot,
    state,
    targetRepo,
  });
}

function finishStrictPhaseReport({
  batch,
  candidate,
  gitHeadBefore,
  item,
  ledgerPath,
  ledgerSha256Before,
  liveRerun,
  registryPath,
  report,
  runRoot,
  state,
  targetRepo,
}) {
  if (report.status === "running") {
    report.status = strictTerminalStatusForItems(report.items || []);
  }
  report.completedCandidateIds = state.completedCandidateIds || [];
  report.blockedCandidateIds = state.blockedCandidateIds || [];
  report.skippedCandidateIds = state.skippedCandidateIds || [];
  report.finishedAt = new Date().toISOString();
  report.runSha256 = sha256Text(stableStringify({
    items: (report.items || []).map((entry) => ({ candidateId: entry.candidateId, status: entry.status })),
    phaseBoundary: report.phaseBoundary || null,
    runId: report.runId,
    status: report.status,
  }));
  state.status = report.status;
  state = saveState(runRoot, state);
  const proof = writeProofEnvelope({
    batch,
    candidate,
    gitHeadAfter: gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head"),
    gitHeadBefore,
    item,
    ledgerSha256Before,
    liveRerun,
    registryPath,
    report,
    runRoot,
    state,
    targetRepo,
  });
  report.proofEnvelopePath = proof.path;
  report.proofEnvelopeSha256 = proof.sha256;
  report.proofEnvelopeContractComplete = proof.envelope.contractComplete;
  if (item) {
    item.proofEnvelopePath = proof.path;
    item.proofEnvelopeSha256 = proof.sha256;
  }
  const resume = writeResumeCard({
    blockers: report.blockers,
    candidate,
    item,
    ledgerPath,
    proof,
    queuePath: ledgerPath,
    report,
    runRoot,
    targetRepo,
  });
  report.resumeCardPath = resume.path;
  report.resumeCardSha256 = resume.sha256;
  writeJson(path.join(runRoot, "run-report.json"), report);
  if (report.ok === false) {
    throw new FullIntakeError(report.blockers.map((entry) => entry.code).join("; ") || report.status, report);
  }
  return report;
}

function itemFromCandidate(candidate, runId) {
  return {
    candidateId: candidate.id,
    classification: candidate.classification,
    queueRank: candidate.queueRank,
    runId,
    sourcePath: candidate.sourcePath,
    startedAt: new Date().toISOString(),
    status: "started",
  };
}

function terminalProcessedIds(state, ledger) {
  const ledgerStatusById = new Map((ledger.entries || []).map((entry) => [entry.id, entry.status]));
  return new Set(
    (state.items || [])
      .filter((entry) => TERMINAL_ITEM_STATUSES.has(entry.status))
      .filter((entry) => ledgerStatusById.get(entry.candidateId) !== "queued")
      .map((entry) => entry.candidateId),
  );
}

function runStrictOnePhase({
  contextBudget,
  gitHeadBefore,
  initialLedger,
  ledgerPath,
  ledgerSha256Before,
  options,
  registry,
  registryPath,
  report,
  runId,
  runRoot,
  state,
  targetRepo,
  timeoutMs,
}) {
  report.strictOnePhase = {
    enabled: true,
    phases: STRICT_PHASES,
  };

  let transaction = activeStrictTransaction(state);
  let completedPhase = transaction?.nextPhase || "select_candidate";
  report.currentPhase = completedPhase;
  report.nextPhase = completedPhase;

  let candidate = transaction?.candidate || null;
  let item = transaction?.item || null;
  let batch = transaction?.batch || null;
  let liveRerun = transaction?.liveRerun || null;

  if (completedPhase === "select_candidate" && !transaction) {
    const dirtyBefore = gitChangedPaths(targetRepo);
    const recovery = findRecoverableFailedLiveRerunTransaction({
      dirtyPaths: dirtyBefore,
      ledger: initialLedger,
      runId,
      state,
      targetRepo,
    });
    if (recovery) {
      ({ batch, candidate, item, transaction } = recovery);
      liveRerun = null;
      completedPhase = transaction.nextPhase;
      report.currentPhase = completedPhase;
      report.nextPhase = completedPhase;
      state = saveStrictTransaction({ runRoot, state, transaction });
      appendEvent(runRoot, {
        candidateId: candidate.id,
        event: "strict_failed_live_rerun_recovered",
        phase: completedPhase,
        runId,
      });
    }
  }

  if (completedPhase === "select_candidate") {
    const dirtyBefore = gitChangedPaths(targetRepo);
    if (dirtyBefore.length > 0) {
      report.status = "blocked_target_dirty";
      report.ok = false;
      report.blockers.push({ code: "target-repo-dirty", changedPaths: dirtyBefore });
      return finishStrictPhaseReport({
        batch,
        candidate,
        gitHeadBefore,
        item,
        ledgerPath,
        ledgerSha256Before,
        liveRerun,
        registryPath,
        report,
        runRoot,
        state,
        targetRepo,
      });
    }

    const processedIds = terminalProcessedIds(state, initialLedger);
    candidate = selectNextQueuedRankedCandidate(initialLedger, processedIds);
    if (!candidate) {
      report.status = "completed_no_candidates";
      state = clearStrictTransaction({ runRoot, state });
      return finishStrictPhaseReport({
        batch: null,
        candidate: null,
        gitHeadBefore,
        item: null,
        ledgerPath,
        ledgerSha256Before,
        liveRerun: null,
        registryPath,
        report,
        runRoot,
        state,
        targetRepo,
      });
    }

    item = itemFromCandidate(candidate, runId);
    item.gitHeadBefore = gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head");
    item.ledgerSha256Before = sha256FileIfExists(ledgerPath);
    appendEvent(runRoot, { candidateId: candidate.id, event: "candidate_started", runId });

    if (!SAFE_CLASSIFICATIONS.has(candidate.classification)) {
      item.status = "skipped_unsafe_candidate";
      item.reason = `classification_not_allowed:${candidate.classification}`;
      item.completedAt = new Date().toISOString();
      updateLedgerTerminalStatus({ candidate, item, ledger: initialLedger, ledgerPath, targetRepo });
      state = clearStrictTransaction({ runRoot, state: pushItem(state, item) });
      report.items.push(item);
      appendEvent(runRoot, { candidateId: candidate.id, event: "candidate_skipped_unsafe", runId });
      return finishStrictPhaseReport({
        batch: null,
        candidate,
        gitHeadBefore,
        item,
        ledgerPath,
        ledgerSha256Before,
        liveRerun: null,
        registryPath,
        report,
        runRoot,
        state,
        targetRepo,
      });
    }

    const policyBlockers = candidatePolicyBlockers(candidate, initialLedger, targetRepo);
    if (policyBlockers.length > 0) {
      item.status = "blocked_policy";
      item.blockers = policyBlockers;
      item.completedAt = new Date().toISOString();
      updateLedgerTerminalStatus({ candidate, item, ledger: initialLedger, ledgerPath, targetRepo });
      state = clearStrictTransaction({ runRoot, state: pushItem(state, item) });
      report.items.push(item);
      appendEvent(runRoot, { candidateId: candidate.id, event: "candidate_blocked_policy", runId, blockers: policyBlockers });
      return finishStrictPhaseReport({
        batch: null,
        candidate,
        gitHeadBefore,
        item,
        ledgerPath,
        ledgerSha256Before,
        liveRerun: null,
        registryPath,
        report,
        runRoot,
        state,
        targetRepo,
      });
    }

    item.status = strictItemStatusForPhase(completedPhase);
    transaction = beginStrictTransaction({ candidate, item, phase: completedPhase, runId });
    state = saveStrictTransaction({ runRoot, state, transaction });
    report.items.push(item);
    recordStrictBoundary({ completedPhase, nextPhase: transaction.nextPhase, report, transaction });
    appendEvent(runRoot, { candidateId: candidate.id, event: "strict_phase_boundary", phase: completedPhase, runId });
    return finishStrictPhaseReport({
      batch,
      candidate,
      gitHeadBefore,
      item,
      ledgerPath,
      ledgerSha256Before,
      liveRerun,
      registryPath,
      report,
      runRoot,
      state,
      targetRepo,
    });
  }

  if (!transaction || !candidate || !item) {
    throw new Error("strict-transaction-missing-active-candidate");
  }

  const ledger = readJson(ledgerPath, "queue-ledger");
  assertRequiredLedgerShape(ledger);
  const refreshedCandidate = ledger.entries.find((entry) => entry.id === candidate.id);
  if (refreshedCandidate) {
    candidate = { ...candidate, ...refreshedCandidate };
    transaction.candidate = candidate;
  }

  if (completedPhase === "prove_or_register_live_lane") {
    let liveGate = liveLaneReady(candidate.liveGate);
    if (!liveGate.ok) {
      const liveDecision = checkContextBudget(contextBudget, "liveLane", CONTEXT_STEP_COST.liveLane);
      report.contextBudget.lastDecision = liveDecision;
      if (liveDecision.action !== "continue") {
        item.status = liveDecision.action === "hard_stop" ? "failed_context_pressure" : "blocked_context_budget_resume_required";
        item.reason = `context-budget-${liveDecision.threshold}`;
        item.completedAt = new Date().toISOString();
        report.status = liveDecision.action === "hard_stop" ? "context_pressure" : "resume_only_context_budget";
        report.ok = liveDecision.action !== "hard_stop";
        report.blockers.push({ code: "context-budget", decision: liveDecision, candidateId: candidate.id });
        state = saveStrictTransaction({ runRoot, state, transaction: { ...transaction, item } });
        report.items.push(item);
        return finishStrictPhaseReport({
          batch,
          candidate,
          gitHeadBefore,
          item,
          ledgerPath,
          ledgerSha256Before,
          liveRerun,
          registryPath,
          report,
          runRoot,
          state,
          targetRepo,
        });
      }
      const liveReport = runAutoLiveLane({
        allowSelfImprovementLaneSynthesis: options.allowSelfImprovementLaneSynthesis === true,
        candidate,
        ledger,
        ledgerPath,
        registry,
        runRoot,
        runId,
        targetRepo,
        timeoutMs,
      });
      item.liveLaneReport = normalizeRepoPath(path.relative(targetRepo, liveReport.reportPath));
      item.liveLaneStatus = liveReport.status;
      if (!liveReport.ok) {
        item.status = liveReport.status;
        item.reason = liveReport.reason || liveReport.failedCommand?.label || "live_lane_failed";
        item.completedAt = new Date().toISOString();
        updateLedgerTerminalStatus({ candidate, item, ledger, ledgerPath, targetRepo });
        state = clearStrictTransaction({ runRoot, state: pushItem(state, item) });
        report.items.push(item);
        appendEvent(runRoot, { candidateId: candidate.id, event: "candidate_blocked_live_lane", runId, status: item.status });
        return finishStrictPhaseReport({
          batch,
          candidate,
          gitHeadBefore,
          item,
          ledgerPath,
          ledgerSha256Before,
          liveRerun,
          registryPath,
          report,
          runRoot,
          state,
          targetRepo,
        });
      }
      const nextLedger = readJson(ledgerPath, "queue-ledger");
      const nextCandidate = nextLedger.entries.find((entry) => entry.id === candidate.id);
      if (nextCandidate) {
        candidate = { ...candidate, ...nextCandidate };
      }
      liveGate = liveLaneReady(candidate.liveGate);
    } else {
      item.liveLaneStatus = liveGate.status;
    }

    if (candidate.liveGate.required === true && !candidate.liveGate.command) {
      item.status = "blocked_live_proof_failed";
      item.reason = "live_command_missing_after_lane_gate";
      item.completedAt = new Date().toISOString();
      updateLedgerTerminalStatus({ candidate, item, ledger, ledgerPath, targetRepo });
      state = clearStrictTransaction({ runRoot, state: pushItem(state, item) });
      report.items.push(item);
      return finishStrictPhaseReport({
        batch,
        candidate,
        gitHeadBefore,
        item,
        ledgerPath,
        ledgerSha256Before,
        liveRerun,
        registryPath,
        report,
        runRoot,
        state,
        targetRepo,
      });
    }

    item.status = strictItemStatusForPhase(completedPhase);
    transaction = {
      ...transaction,
      candidate,
      item,
      lastCompletedPhase: completedPhase,
      nextPhase: nextStrictPhase(completedPhase),
    };
    state = saveStrictTransaction({ runRoot, state, transaction });
    report.items.push(item);
    recordStrictBoundary({ completedPhase, nextPhase: transaction.nextPhase, report, transaction });
    appendEvent(runRoot, { candidateId: candidate.id, event: "strict_phase_boundary", phase: completedPhase, runId });
    return finishStrictPhaseReport({
      batch,
      candidate,
      gitHeadBefore,
      item,
      ledgerPath,
      ledgerSha256Before,
      liveRerun,
      registryPath,
      report,
      runRoot,
      state,
      targetRepo,
    });
  }

  if (completedPhase === "run_importer_phase") {
    try {
      const importDecision = checkContextBudget(contextBudget, "importerPhase", CONTEXT_STEP_COST.importerPhase);
      report.contextBudget.lastDecision = importDecision;
      if (importDecision.action !== "continue") {
        item.status = importDecision.action === "hard_stop" ? "failed_context_pressure" : "blocked_context_budget_resume_required";
        item.reason = `context-budget-${importDecision.threshold}`;
        item.completedAt = new Date().toISOString();
        report.status = importDecision.action === "hard_stop" ? "context_pressure" : "resume_only_context_budget";
        report.ok = importDecision.action !== "hard_stop";
        report.blockers.push({ code: "context-budget", decision: importDecision, candidateId: candidate.id });
        transaction = { ...transaction, item };
        state = saveStrictTransaction({ runRoot, state, transaction });
        report.items.push(item);
        return finishStrictPhaseReport({
          batch,
          candidate,
          gitHeadBefore,
          item,
          ledgerPath,
          ledgerSha256Before,
          liveRerun,
          registryPath,
          report,
          runRoot,
          state,
          targetRepo,
        });
      }
      appendBindingSnapshot(runRoot, captureBindingSnapshot({
        ledgerPath,
        registryPath,
        runRoot,
        safetyPolicy: report.safetyPolicy,
        step: "strict_before_importer_phase",
        targetRepo,
      }));
      if (candidate.implementation?.recoveryIntent?.mode === "recover_child_timeout_patch") {
        batch = recoverChildTimeoutPatch({ candidate, runId, runRoot, targetRepo, timeoutMs });
      } else {
        batch = runCandidateImporterPhase({
          candidate,
          contextPercent: nestedBatchContextPercent(contextBudget),
          ledger,
          runId,
          runRoot,
          targetRepo,
        });
      }
      appendBindingSnapshot(runRoot, captureBindingSnapshot({
        ledgerPath,
        registryPath,
        runRoot,
        safetyPolicy: report.safetyPolicy,
        step: "strict_after_importer_phase",
        targetRepo,
      }));
      item.batchRunId = batch.batchRunId;
      item.batchReport = batch.report.reportPath;
      item.importStatus = batch.report.status;
      item.plannedPaths = compactPathArray(
        ((batch.report.items || []).find((entry) => entry.candidateId === candidate.id) || {}).plannedPaths ||
          candidatePlannedPaths(candidate),
        64,
      );
    } catch (error) {
      let recoveryError = null;
      let recoveredBatch = null;
      try {
        const recoveryDecision = checkContextBudget(contextBudget, "recoveryBranch", CONTEXT_STEP_COST.recoveryBranch);
        report.contextBudget.lastDecision = recoveryDecision;
        if (recoveryDecision.action !== "continue") {
          throw new Error(`context-budget-${recoveryDecision.threshold}`);
        }
        recoveredBatch = tryRecoverImportFailure({
          candidate,
          contextPercent: nestedBatchContextPercent(contextBudget),
          error,
          ledger,
          runId,
          runRoot,
          targetRepo,
          timeoutMs,
        });
      } catch (innerError) {
        recoveryError = innerError;
      }
      if (recoveredBatch) {
        batch = recoveredBatch;
        item.batchRunId = batch.batchRunId;
        item.batchReport = batch.report.reportPath;
        item.importStatus = batch.report.status;
        item.plannedPaths = compactPathArray(candidatePlannedPaths(candidate), 64);
        item.status = "recovered_patch_non_live_validated_pending_semantic_review";
        item.reason = "child_timeout_recovery_requires_separate_semantic_review_slice";
        item.completedAt = new Date().toISOString();
        updateLedgerTerminalStatus({ candidate, item, ledger, ledgerPath, targetRepo });
        state = clearStrictTransaction({ runRoot, state: pushItem(state, item) });
        report.items.push(item);
        report.status = "stopped_recovery_pending_semantic_review";
        report.ok = true;
        appendEvent(runRoot, {
          candidateId: candidate.id,
          event: "candidate_recovery_pending_semantic_review",
          runId,
          status: item.status,
        });
        return finishStrictPhaseReport({
          batch,
          candidate,
          gitHeadBefore,
          item,
          ledgerPath,
          ledgerSha256Before,
          liveRerun,
          registryPath,
          report,
          runRoot,
          state,
          targetRepo,
        });
      }
      const finalError = recoveryError || error;
      item.status = "failed_import";
      item.reason = finalError.message;
      item.batchReport = error.report?.reportPath || null;
      if (finalError.resolutionTicket) {
        item.resolutionTicket = finalError.resolutionTicket;
        item.resolutionStatus = finalError.resolutionStatus || "terminal_unresolved";
      }
      if (finalError.childTimeoutRecoveryExhausted === true) {
        item.childTimeoutRecoveryExhausted = true;
      }
      item.completedAt = new Date().toISOString();
      updateLedgerTerminalStatus({ candidate, item, ledger, ledgerPath, targetRepo });
      state = clearStrictTransaction({ runRoot, state: pushItem(state, item) });
      report.items.push(item);
      appendEvent(runRoot, { candidateId: candidate.id, event: "candidate_import_failed", reason: finalError.message, runId });
      return finishStrictPhaseReport({
        batch,
        candidate,
        gitHeadBefore,
        item,
        ledgerPath,
        ledgerSha256Before,
        liveRerun,
        registryPath,
        report,
        runRoot,
        state,
        targetRepo,
      });
    }

    if (batch?.report?.mode === "child-timeout-recovery" || batch?.report?.recovery) {
      item.status = "recovered_patch_non_live_validated_pending_semantic_review";
      item.reason = "child_timeout_recovery_requires_separate_semantic_review_slice";
      item.completedAt = new Date().toISOString();
      updateLedgerTerminalStatus({ candidate, item, ledger, ledgerPath, targetRepo });
      state = clearStrictTransaction({ runRoot, state: pushItem(state, item) });
      report.items.push(item);
      report.status = "stopped_recovery_pending_semantic_review";
      report.ok = true;
      appendEvent(runRoot, {
        candidateId: candidate.id,
        event: "candidate_recovery_pending_semantic_review",
        runId,
        status: item.status,
      });
      return finishStrictPhaseReport({
        batch,
        candidate,
        gitHeadBefore,
        item,
        ledgerPath,
        ledgerSha256Before,
        liveRerun,
        registryPath,
        report,
        runRoot,
        state,
        targetRepo,
      });
    }

    item.status = strictItemStatusForPhase(completedPhase);
    transaction = {
      ...transaction,
      batch,
      candidate,
      item,
      lastCompletedPhase: completedPhase,
      nextPhase: nextStrictPhase(completedPhase),
    };
    state = saveStrictTransaction({ runRoot, state, transaction });
    report.items.push(item);
    recordStrictBoundary({ completedPhase, nextPhase: transaction.nextPhase, report, transaction });
    appendEvent(runRoot, { candidateId: candidate.id, event: "strict_phase_boundary", phase: completedPhase, runId });
    return finishStrictPhaseReport({
      batch,
      candidate,
      gitHeadBefore,
      item,
      ledgerPath,
      ledgerSha256Before,
      liveRerun,
      registryPath,
      report,
      runRoot,
      state,
      targetRepo,
    });
  }

  if (completedPhase === "controlled_merge") {
    try {
      batch = runImporterBoundaryPhase({
        batch,
        flag: "apply-controlled-merge",
        status: "stopped_after_controlled_source_merge",
        targetRepo,
      });
    } catch (error) {
      return finishStrictImporterBoundaryFailure({
        batch,
        candidate,
        error,
        gitHeadBefore,
        item,
        ledger,
        ledgerPath,
        ledgerSha256Before,
        liveRerun,
        registryPath,
        report,
        runRoot,
        state,
        targetRepo,
      });
    }
    item.batchReport = batch.report.reportPath;
    item.importStatus = batch.report.status;
    item.status = strictItemStatusForPhase(completedPhase);
    transaction = {
      ...transaction,
      batch,
      item,
      lastCompletedPhase: completedPhase,
      nextPhase: nextStrictPhase(completedPhase),
    };
    state = saveStrictTransaction({ runRoot, state, transaction });
    report.items.push(item);
    recordStrictBoundary({ completedPhase, nextPhase: transaction.nextPhase, report, transaction });
    appendEvent(runRoot, { candidateId: candidate.id, event: "strict_phase_boundary", phase: completedPhase, runId });
    return finishStrictPhaseReport({
      batch,
      candidate,
      gitHeadBefore,
      item,
      ledgerPath,
      ledgerSha256Before,
      liveRerun,
      registryPath,
      report,
      runRoot,
      state,
      targetRepo,
    });
  }

  if (completedPhase === "non_live_validation") {
    try {
      batch = runImporterBoundaryPhase({
        batch,
        flag: "run-non-live-validation",
        status: "stopped_after_non_live_validation",
        targetRepo,
      });
    } catch (error) {
      return finishStrictImporterBoundaryFailure({
        batch,
        candidate,
        error,
        gitHeadBefore,
        item,
        ledger,
        ledgerPath,
        ledgerSha256Before,
        liveRerun,
        registryPath,
        report,
        runRoot,
        state,
        targetRepo,
      });
    }
    item.batchReport = batch.report.reportPath;
    item.importStatus = batch.report.status;
    item.status = strictItemStatusForPhase(completedPhase);
    transaction = {
      ...transaction,
      batch,
      item,
      lastCompletedPhase: completedPhase,
      nextPhase: candidate.liveGate?.required === true ? nextStrictPhase(completedPhase) : "ledger_docs_handoff_commit_finalization",
    };
    state = saveStrictTransaction({ runRoot, state, transaction });
    report.items.push(item);
    recordStrictBoundary({ completedPhase, nextPhase: transaction.nextPhase, report, transaction });
    appendEvent(runRoot, { candidateId: candidate.id, event: "strict_phase_boundary", phase: completedPhase, runId });
    return finishStrictPhaseReport({
      batch,
      candidate,
      gitHeadBefore,
      item,
      ledgerPath,
      ledgerSha256Before,
      liveRerun,
      registryPath,
      report,
      runRoot,
      state,
      targetRepo,
    });
  }

  if (completedPhase === "generated_only_live_rerun") {
    if (candidate.liveGate?.required === true) {
      const liveRerunDecision = checkContextBudget(contextBudget, "liveRerun", CONTEXT_STEP_COST.liveRerun);
      report.contextBudget.lastDecision = liveRerunDecision;
      if (liveRerunDecision.action !== "continue") {
        item.status = liveRerunDecision.action === "hard_stop" ? "failed_context_pressure" : "blocked_context_budget_resume_required";
        item.reason = `context-budget-${liveRerunDecision.threshold}`;
        item.completedAt = new Date().toISOString();
        report.status = liveRerunDecision.action === "hard_stop" ? "context_pressure" : "resume_only_context_budget";
        report.ok = liveRerunDecision.action !== "hard_stop";
        report.blockers.push({ code: "context-budget", decision: liveRerunDecision, candidateId: candidate.id });
        transaction = { ...transaction, item };
        state = saveStrictTransaction({ runRoot, state, transaction });
        report.items.push(item);
        return finishStrictPhaseReport({
          batch,
          candidate,
          gitHeadBefore,
          item,
          ledgerPath,
          ledgerSha256Before,
          liveRerun,
          registryPath,
          report,
          runRoot,
          state,
          targetRepo,
        });
      }
      liveRerun = runLiveRerun({
        candidate,
        command: candidate.liveGate.command,
        runRoot,
        targetRepo,
        timeoutMs,
      });
      item.liveRerunReport = normalizeRepoPath(path.relative(targetRepo, liveRerun.reportPath));
      item.liveRerunStatus = liveRerun.status;
      if (!liveRerun.ok) {
        item.status = "failed_live_rerun";
        item.reason = liveRerun.failedCommand?.label || "live_rerun_failed";
        item.completedAt = new Date().toISOString();
        updateLedgerTerminalStatus({ candidate, item, ledger, ledgerPath, targetRepo });
        state = clearStrictTransaction({ runRoot, state: pushItem(state, item) });
        report.items.push(item);
        report.status = "stopped_after_failed_live_rerun";
        report.ok = false;
        appendEvent(runRoot, { candidateId: candidate.id, event: "candidate_live_rerun_failed", runId });
        return finishStrictPhaseReport({
          batch,
          candidate,
          gitHeadBefore,
          item,
          ledgerPath,
          ledgerSha256Before,
          liveRerun,
          registryPath,
          report,
          runRoot,
          state,
          targetRepo,
        });
      }
    } else {
      item.liveRerunStatus = "not_required";
    }
    item.status = strictItemStatusForPhase(completedPhase);
    transaction = {
      ...transaction,
      item,
      liveRerun,
      lastCompletedPhase: completedPhase,
      nextPhase: nextStrictPhase(completedPhase),
    };
    state = saveStrictTransaction({ runRoot, state, transaction });
    report.items.push(item);
    recordStrictBoundary({ completedPhase, nextPhase: transaction.nextPhase, report, transaction });
    appendEvent(runRoot, { candidateId: candidate.id, event: "strict_phase_boundary", phase: completedPhase, runId });
    return finishStrictPhaseReport({
      batch,
      candidate,
      gitHeadBefore,
      item,
      ledgerPath,
      ledgerSha256Before,
      liveRerun,
      registryPath,
      report,
      runRoot,
      state,
      targetRepo,
    });
  }

  if (completedPhase === "ledger_docs_handoff_commit_finalization") {
    const docsDecision = checkContextBudget(contextBudget, "docsHandoffWrite", CONTEXT_STEP_COST.docsHandoffWrite);
    report.contextBudget.lastDecision = docsDecision;
    if (docsDecision.action !== "continue") {
      item.status = docsDecision.action === "hard_stop" ? "failed_context_pressure" : "blocked_context_budget_resume_required";
      item.reason = `context-budget-${docsDecision.threshold}`;
      item.completedAt = new Date().toISOString();
      report.status = docsDecision.action === "hard_stop" ? "context_pressure" : "resume_only_context_budget";
      report.ok = docsDecision.action !== "hard_stop";
      report.blockers.push({ code: "context-budget", decision: docsDecision, candidateId: candidate.id });
      transaction = { ...transaction, item };
      state = saveStrictTransaction({ runRoot, state, transaction });
      report.items.push(item);
      return finishStrictPhaseReport({
        batch,
        candidate,
        gitHeadBefore,
        item,
        ledgerPath,
        ledgerSha256Before,
        liveRerun,
        registryPath,
        report,
        runRoot,
        state,
        targetRepo,
      });
    }
    const planPath = updatePlanDocument({ candidate, commitId: null, item, targetRepo });
    item.planPath = planPath;
    const handoffPath = writeHandoff({ candidate, commitId: null, item, state, targetRepo });
    item.handoffPath = handoffPath;

    const commitDecision = checkContextBudget(contextBudget, "commit", CONTEXT_STEP_COST.commit);
    report.contextBudget.lastDecision = commitDecision;
    if (commitDecision.action !== "continue") {
      item.status = commitDecision.action === "hard_stop" ? "failed_context_pressure" : "blocked_context_budget_resume_required";
      item.reason = `context-budget-${commitDecision.threshold}`;
      item.completedAt = new Date().toISOString();
      report.status = commitDecision.action === "hard_stop" ? "context_pressure" : "resume_only_context_budget";
      report.ok = commitDecision.action !== "hard_stop";
      report.blockers.push({ code: "context-budget", decision: commitDecision, candidateId: candidate.id });
      transaction = { ...transaction, item };
      state = saveStrictTransaction({ runRoot, state, transaction });
      report.items.push(item);
      return finishStrictPhaseReport({
        batch,
        candidate,
        gitHeadBefore,
        item,
        ledgerPath,
        ledgerSha256Before,
        liveRerun,
        registryPath,
        report,
        runRoot,
        state,
        targetRepo,
      });
    }
    const commitId =
      options.noCommit === true
        ? null
        : stageAndCommitReviewableChanges(targetRepo, `feat: import ${safeId(candidate.id)} recipe`);
    item.commitId = commitId;
    item.gitHeadAfter = gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head");
    if (commitId) {
      report.commits.push(commitId);
      state.commitIds = [...(state.commitIds || []), commitId];
    }

    item.status = "completed";
    item.completedAt = new Date().toISOString();
    writeHandoff({ candidate, commitId, item, state, targetRepo });
    const completionLedger = readJson(ledgerPath, "queue-ledger");
    updateLedgerCompletion({ batch, candidate, commitId, ledger: completionLedger, ledgerPath, liveRerun, targetRepo });
    state = clearStrictTransaction({ runRoot, state: pushItem(state, item) });
    report.items.push(item);
    appendEvent(runRoot, { candidateId: candidate.id, commitId, event: "candidate_completed", runId });
    return finishStrictPhaseReport({
      batch,
      candidate,
      gitHeadBefore,
      item,
      ledgerPath,
      ledgerSha256Before,
      liveRerun,
      registryPath,
      report,
      runRoot,
      state,
      targetRepo,
    });
  }

  throw new Error(`strict-phase-unhandled:${completedPhase}`);
}

export function runFullIntake(options, cwd = process.cwd()) {
  const runId = safeId(options.runId, "full-intake");
  if (!options.runId) {
    throw new Error("--run-id is required for generic repo full-intake runs");
  }
  const maxItems = parsePositiveInteger(options.maxItems, "max-items", 1);
  if (maxItems > 1 && options.allowBatchMode !== true) {
    throw new Error("max-items-greater-than-1-requires-allow-batch-mode");
  }
  const timeoutMs = parsePositiveInteger(options.commandTimeoutMs, "command-timeout-ms", DEFAULT_COMMAND_TIMEOUT_MS);
  const contextBudget = contextBudgetFromOptions(options);
  const ledgerPath = resolveOptionalPath(cwd, options.ledger, DEFAULT_LEDGER_PATH);
  if (!existsSync(ledgerPath) || !statSync(ledgerPath).isFile()) {
    throw new Error(`ledger-missing: ${ledgerPath}`);
  }
  let initialLedger = readJson(ledgerPath, "queue-ledger");
  assertRequiredLedgerShape(initialLedger);
  const targetRepo = resolveTargetRepo(cwd, initialLedger, options);
  const runRoot = resolveRunRoot(targetRepo, runId, options.reportDir);
  const registryPath = resolveOptionalPath(cwd, options.liveLaneRegistry, DEFAULT_LIVE_LANE_REGISTRY);
  const registry = readLiveLaneRegistry(registryPath);
  const resolutionCandidateIds = parseCsvSet(options.resolutionCandidateIds);
  const { resumed, state: loadedState } = loadOrCreateState({ ledgerPath, maxItems, runId, runRoot, targetRepo });
  let state = loadedState;
  const gitHeadBefore = gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head");
  const ledgerSha256Before = sha256FileIfExists(ledgerPath);
  const report = {
    schema: RUN_SCHEMA,
    auxiliaryId: AUXILIARY_ID,
    ok: true,
    status: "running",
    runId,
    runRoot: normalizeRepoPath(path.relative(targetRepo, runRoot)),
    ledgerPath: normalizeRepoPath(path.relative(targetRepo, ledgerPath)) || normalizeRepoPath(ledgerPath),
    liveLaneRegistryPath: normalizeRepoPath(path.relative(targetRepo, registryPath)) || normalizeRepoPath(registryPath),
    targetRepo,
    maxItems,
    resumed,
    gitHeadBefore,
    contextBudget: {
      ...contextBudget,
      overrideNextStepCost: contextBudget.overrideNextStepCost ?? null,
    },
    items: [],
    resolutionQueue: null,
    blockers: [],
    commits: [],
    safetyPolicy: {
      broadCepSmokeAllowed: false,
      dependencyPackageChangesAllowed: false,
      fallbackProviderAllowed: false,
      liveParallelismAllowed: false,
      localOllamaAllowed: false,
      pushAllowed: false,
      pullRequestAllowed: false,
      rawJsxCopyAllowed: false,
      sourceRepoWritesAllowed: false,
      userAssetMutationOutsideGeneratedOnlyLaneAllowed: false,
    },
    createdAt: new Date().toISOString(),
  };

  appendBindingSnapshot(runRoot, captureBindingSnapshot({
    ledgerPath,
    registryPath,
    runRoot,
    safetyPolicy: report.safetyPolicy,
    step: "run_start",
    targetRepo,
  }));

  if (contextBudget.currentContextPercent !== null && contextBudget.currentContextPercent >= contextBudget.hardStopPercent) {
    report.status = "handoff_required";
    report.ok = false;
    report.blockers.push({ code: "context-pressure", contextPercent: contextBudget.currentContextPercent });
    state.status = report.status;
    state = saveState(runRoot, state);
    const proof = writeProofEnvelope({
      batch: null,
      candidate: null,
      gitHeadAfter: gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head"),
      gitHeadBefore,
      item: null,
      ledgerSha256Before,
      liveRerun: null,
      registryPath,
      report,
      runRoot,
      state,
      targetRepo,
    });
    report.proofEnvelopePath = proof.path;
    report.proofEnvelopeSha256 = proof.sha256;
    report.proofEnvelopeContractComplete = proof.envelope.contractComplete;
    const resume = writeResumeCard({
      blockers: report.blockers,
      candidate: null,
      item: null,
      ledgerPath,
      proof,
      queuePath: ledgerPath,
      report,
      runRoot,
      targetRepo,
    });
    report.resumeCardPath = resume.path;
    report.resumeCardSha256 = resume.sha256;
    throw new FullIntakeError("context-pressure", report);
  }

  const strictOnePhase = options.compactJson === true;
  const firstBudgetStep = firstContextBudgetStep({ state, strictOnePhase });
  const firstBudgetDecision = checkContextBudget(contextBudget, firstBudgetStep.step, firstBudgetStep.cost);
  report.contextBudget.lastDecision = firstBudgetDecision;
  if (firstBudgetDecision.action !== "continue") {
    report.status = firstBudgetDecision.action === "hard_stop" ? "context_pressure" : "resume_only_context_budget";
    report.ok = firstBudgetDecision.action !== "hard_stop";
    report.blockers.push({ code: "context-budget", decision: firstBudgetDecision });
    state.status = report.status;
    state = saveState(runRoot, state);
    const proof = writeProofEnvelope({
      batch: null,
      candidate: null,
      gitHeadAfter: gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head"),
      gitHeadBefore,
      item: null,
      ledgerSha256Before,
      liveRerun: null,
      registryPath,
      report,
      runRoot,
      state,
      targetRepo,
    });
    report.proofEnvelopePath = proof.path;
    report.proofEnvelopeSha256 = proof.sha256;
    report.proofEnvelopeContractComplete = proof.envelope.contractComplete;
    const resume = writeResumeCard({
      blockers: report.blockers,
      candidate: null,
      item: null,
      ledgerPath,
      proof,
      queuePath: ledgerPath,
      report,
      runRoot,
      targetRepo,
    });
    report.resumeCardPath = resume.path;
    report.resumeCardSha256 = resume.sha256;
    writeJson(path.join(runRoot, "run-report.json"), report);
    if (firstBudgetDecision.action === "hard_stop") {
      throw new FullIntakeError("context-pressure", report);
    }
    return report;
  }

  if (parallelCandidateWorktreeModeEnabled(options)) {
    const parallelReport = runParallelCandidateWorktrees({
      contextBudget,
      ledger: initialLedger,
      ledgerPath,
      options,
      runId,
      runRoot,
      targetRepo,
    });
    if (parallelReport.ok === false) {
      throw new FullIntakeError(parallelReport.status || "parallel-candidate-worktrees-failed", parallelReport);
    }
    return parallelReport;
  }

  const hasActiveStrictTransaction = strictOnePhase && activeStrictTransaction(state) !== null;
  const resolutionQueue = hasActiveStrictTransaction
    ? {
        closedCandidateIds: [],
        openTicketCount: 0,
        requeuedCandidateIds: [],
        status: "skipped_active_strict_transaction",
        terminalTicketCount: 0,
        tickets: [],
      }
    : processResolutionTickets({
        allowSelfImprovementLaneSynthesis: options.allowSelfImprovementLaneSynthesis === true,
        ledger: initialLedger,
        ledgerPath,
        registry,
        resolutionCandidateIds,
        runId,
        runRoot,
        targetRepo,
        timeoutMs,
      });
  report.resolutionQueue = {
    closedCandidateIds: resolutionQueue.closedCandidateIds || [],
    openTicketCount: resolutionQueue.openTicketCount,
    requeuedCandidateIds: resolutionQueue.requeuedCandidateIds,
    status: resolutionQueue.status,
    terminalTicketCount: resolutionQueue.terminalTicketCount,
    tickets: resolutionQueue.tickets,
  };
  if (resolutionQueue.requeuedCandidateIds.length > 0 || resolutionQueue.terminalTicketCount > 0) {
    appendEvent(runRoot, {
      event: "resolution_queue_processed",
      requeuedCandidateIds: resolutionQueue.requeuedCandidateIds,
      runId,
      terminalTicketCount: resolutionQueue.terminalTicketCount,
    });
    initialLedger = readJson(ledgerPath, "queue-ledger");
    assertRequiredLedgerShape(initialLedger);
  }

  if (strictOnePhase) {
    return runStrictOnePhase({
      contextBudget,
      gitHeadBefore,
      initialLedger,
      ledgerPath,
      ledgerSha256Before,
      options,
      registry,
      registryPath,
      report,
      runId,
      runRoot,
      state,
      targetRepo,
      timeoutMs,
    });
  }

  let considered = 0;
  const processedIds = terminalProcessedIds(state, initialLedger);
  let lastBatch = null;
  let lastCandidate = null;
  let lastItem = null;
  let lastLiveRerun = null;

  while (considered < maxItems) {
    const dirtyBefore = gitChangedPaths(targetRepo);
    if (dirtyBefore.length > 0) {
      report.status = "blocked_target_dirty";
      report.ok = false;
      report.blockers.push({ code: "target-repo-dirty", changedPaths: dirtyBefore });
      break;
    }

    const ledger = readJson(ledgerPath, "queue-ledger");
    assertRequiredLedgerShape(ledger);
    let activeLedger = ledger;
    const candidate = selectNextQueuedRankedCandidate(ledger, processedIds);
    if (!candidate) {
      report.status = considered === 0 ? "completed_no_candidates" : "completed";
      break;
    }
    considered += 1;

    const item = itemFromCandidate(candidate, runId);
    item.gitHeadBefore = gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head");
    item.ledgerSha256Before = sha256FileIfExists(ledgerPath);
    lastCandidate = candidate;
    lastItem = item;
    appendEvent(runRoot, { candidateId: candidate.id, event: "candidate_started", runId });

    if (!SAFE_CLASSIFICATIONS.has(candidate.classification)) {
      item.status = "skipped_unsafe_candidate";
      item.reason = `classification_not_allowed:${candidate.classification}`;
      item.completedAt = new Date().toISOString();
      processedIds.add(candidate.id);
      updateLedgerTerminalStatus({ candidate, item, ledger: activeLedger, ledgerPath, targetRepo });
      state = saveState(runRoot, pushItem(state, item));
      report.items.push(item);
      appendEvent(runRoot, { candidateId: candidate.id, event: "candidate_skipped_unsafe", runId });
      continue;
    }

    const policyBlockers = candidatePolicyBlockers(candidate, activeLedger, targetRepo);
    if (policyBlockers.length > 0) {
      item.status = "blocked_policy";
      item.blockers = policyBlockers;
      item.completedAt = new Date().toISOString();
      processedIds.add(candidate.id);
      updateLedgerTerminalStatus({ candidate, item, ledger: activeLedger, ledgerPath, targetRepo });
      state = saveState(runRoot, pushItem(state, item));
      report.items.push(item);
      appendEvent(runRoot, { candidateId: candidate.id, event: "candidate_blocked_policy", runId, blockers: policyBlockers });
      continue;
    }

    let liveGate = liveLaneReady(candidate.liveGate);
    if (!liveGate.ok) {
      const liveDecision = checkContextBudget(contextBudget, "liveLane", CONTEXT_STEP_COST.liveLane);
      report.contextBudget.lastDecision = liveDecision;
      if (liveDecision.action !== "continue") {
        item.status = liveDecision.action === "hard_stop" ? "failed_context_pressure" : "blocked_context_budget_resume_required";
        item.reason = `context-budget-${liveDecision.threshold}`;
        item.completedAt = new Date().toISOString();
        report.status = liveDecision.action === "hard_stop" ? "context_pressure" : "resume_only_context_budget";
        report.ok = liveDecision.action !== "hard_stop";
        report.blockers.push({ code: "context-budget", decision: liveDecision, candidateId: candidate.id });
        report.items.push(item);
        break;
      }
      const liveReport = runAutoLiveLane({
        allowSelfImprovementLaneSynthesis: options.allowSelfImprovementLaneSynthesis === true,
        candidate,
        ledger: activeLedger,
        ledgerPath,
        registry,
        runRoot,
        runId,
        targetRepo,
        timeoutMs,
      });
      item.liveLaneReport = normalizeRepoPath(path.relative(targetRepo, liveReport.reportPath));
      item.liveLaneStatus = liveReport.status;
      if (!liveReport.ok) {
        item.status = liveReport.status;
        item.reason = liveReport.reason || liveReport.failedCommand?.label || "live_lane_failed";
        item.completedAt = new Date().toISOString();
        processedIds.add(candidate.id);
        updateLedgerTerminalStatus({ candidate, item, ledger, ledgerPath, targetRepo });
        state = saveState(runRoot, pushItem(state, item));
        report.items.push(item);
        appendEvent(runRoot, { candidateId: candidate.id, event: "candidate_blocked_live_lane", runId, status: item.status });
        continue;
      }
      const refreshedLedger = readJson(ledgerPath, "queue-ledger");
      const refreshedCandidate = refreshedLedger.entries.find((entry) => entry.id === candidate.id);
      activeLedger = refreshedLedger;
      Object.assign(candidate, refreshedCandidate);
      liveGate = liveLaneReady(candidate.liveGate);
    } else {
      item.liveLaneStatus = liveGate.status;
    }

    if (candidate.liveGate.required === true && !candidate.liveGate.command) {
      item.status = "blocked_live_proof_failed";
      item.reason = "live_command_missing_after_lane_gate";
      item.completedAt = new Date().toISOString();
      processedIds.add(candidate.id);
      updateLedgerTerminalStatus({ candidate, item, ledger: activeLedger, ledgerPath, targetRepo });
      state = saveState(runRoot, pushItem(state, item));
      report.items.push(item);
      continue;
    }

    let batch;
    try {
      const importDecision = checkContextBudget(contextBudget, "importerPhase", CONTEXT_STEP_COST.importerPhase);
      report.contextBudget.lastDecision = importDecision;
      if (importDecision.action !== "continue") {
        item.status = importDecision.action === "hard_stop" ? "failed_context_pressure" : "blocked_context_budget_resume_required";
        item.reason = `context-budget-${importDecision.threshold}`;
        item.completedAt = new Date().toISOString();
        report.status = importDecision.action === "hard_stop" ? "context_pressure" : "resume_only_context_budget";
        report.ok = importDecision.action !== "hard_stop";
        report.blockers.push({ code: "context-budget", decision: importDecision, candidateId: candidate.id });
        report.items.push(item);
        break;
      }
      appendBindingSnapshot(runRoot, captureBindingSnapshot({
        ledgerPath,
        registryPath,
        runRoot,
        safetyPolicy: report.safetyPolicy,
        step: "before_importer_phase",
        targetRepo,
      }));
      if (candidate.implementation?.recoveryIntent?.mode === "recover_child_timeout_patch") {
        batch = recoverChildTimeoutPatch({ candidate, runId, runRoot, targetRepo, timeoutMs });
      } else {
        batch = runCandidateImport({
          candidate,
          contextPercent: nestedBatchContextPercent(contextBudget),
          ledger: activeLedger,
          runId,
          runRoot,
          targetRepo,
        });
      }
      appendBindingSnapshot(runRoot, captureBindingSnapshot({
        ledgerPath,
        registryPath,
        runRoot,
        safetyPolicy: report.safetyPolicy,
        step: "after_importer_phase",
        targetRepo,
      }));
      item.batchRunId = batch.batchRunId;
      item.batchReport = batch.report.reportPath;
      item.importStatus = batch.report.status;
      item.plannedPaths = compactPathArray(
        ((batch.report.items || []).find((entry) => entry.candidateId === candidate.id) || {}).plannedPaths ||
          candidatePlannedPaths(candidate),
        64,
      );
      lastBatch = batch;
    } catch (error) {
      let recoveryError = null;
      let recoveredBatch = null;
      try {
        const recoveryDecision = checkContextBudget(contextBudget, "recoveryBranch", CONTEXT_STEP_COST.recoveryBranch);
        report.contextBudget.lastDecision = recoveryDecision;
        if (recoveryDecision.action !== "continue") {
          throw new Error(`context-budget-${recoveryDecision.threshold}`);
        }
        recoveredBatch = tryRecoverImportFailure({
          candidate,
          contextPercent: nestedBatchContextPercent(contextBudget),
          error,
          ledger: activeLedger,
          runId,
          runRoot,
          targetRepo,
          timeoutMs,
        });
      } catch (innerError) {
        recoveryError = innerError;
      }
      if (recoveredBatch) {
        batch = recoveredBatch;
        item.batchRunId = batch.batchRunId;
        item.batchReport = batch.report.reportPath;
        item.importStatus = batch.report.status;
        item.plannedPaths = compactPathArray(candidatePlannedPaths(candidate), 64);
        lastBatch = batch;
        item.status = "recovered_patch_non_live_validated_pending_semantic_review";
        item.reason = "child_timeout_recovery_requires_separate_semantic_review_slice";
        item.completedAt = new Date().toISOString();
        processedIds.add(candidate.id);
        updateLedgerTerminalStatus({ candidate, item, ledger: activeLedger, ledgerPath, targetRepo });
        state = saveState(runRoot, pushItem(state, item));
        report.items.push(item);
        report.status = "stopped_recovery_pending_semantic_review";
        report.ok = true;
        appendEvent(runRoot, {
          candidateId: candidate.id,
          event: "candidate_recovery_pending_semantic_review",
          runId,
          status: item.status,
        });
        break;
      } else {
        const finalError = recoveryError || error;
        item.status = "failed_import";
        item.reason = finalError.message;
        item.batchReport = error.report?.reportPath || null;
        if (finalError.resolutionTicket) {
          item.resolutionTicket = finalError.resolutionTicket;
          item.resolutionStatus = finalError.resolutionStatus || "terminal_unresolved";
        }
        if (finalError.childTimeoutRecoveryExhausted === true) {
          item.childTimeoutRecoveryExhausted = true;
        }
        item.completedAt = new Date().toISOString();
        processedIds.add(candidate.id);
        updateLedgerTerminalStatus({ candidate, item, ledger: activeLedger, ledgerPath, targetRepo });
        state = saveState(runRoot, pushItem(state, item));
        report.items.push(item);
        appendEvent(runRoot, { candidateId: candidate.id, event: "candidate_import_failed", reason: finalError.message, runId });
        if (gitChangedPaths(targetRepo).length > 0) {
          report.status = "stopped_after_failed_import_dirty_target";
          report.ok = false;
          break;
        }
        continue;
      }
    }

    if (batch?.report?.mode === "child-timeout-recovery" || batch?.report?.recovery) {
      item.status = "recovered_patch_non_live_validated_pending_semantic_review";
      item.reason = "child_timeout_recovery_requires_separate_semantic_review_slice";
      item.completedAt = new Date().toISOString();
      processedIds.add(candidate.id);
      updateLedgerTerminalStatus({ candidate, item, ledger: activeLedger, ledgerPath, targetRepo });
      state = saveState(runRoot, pushItem(state, item));
      report.items.push(item);
      report.status = "stopped_recovery_pending_semantic_review";
      report.ok = true;
      appendEvent(runRoot, {
        candidateId: candidate.id,
        event: "candidate_recovery_pending_semantic_review",
        runId,
        status: item.status,
      });
      break;
    }

    let liveRerun = null;
    if (candidate.liveGate.required === true) {
      const liveRerunDecision = checkContextBudget(contextBudget, "liveRerun", CONTEXT_STEP_COST.liveRerun);
      report.contextBudget.lastDecision = liveRerunDecision;
      if (liveRerunDecision.action !== "continue") {
        item.status = liveRerunDecision.action === "hard_stop" ? "failed_context_pressure" : "blocked_context_budget_resume_required";
        item.reason = `context-budget-${liveRerunDecision.threshold}`;
        item.completedAt = new Date().toISOString();
        report.status = liveRerunDecision.action === "hard_stop" ? "context_pressure" : "resume_only_context_budget";
        report.ok = liveRerunDecision.action !== "hard_stop";
        report.blockers.push({ code: "context-budget", decision: liveRerunDecision, candidateId: candidate.id });
        report.items.push(item);
        break;
      }
      liveRerun = runLiveRerun({
        candidate,
        command: candidate.liveGate.command,
        runRoot,
        targetRepo,
        timeoutMs,
      });
      lastLiveRerun = liveRerun;
      item.liveRerunReport = normalizeRepoPath(path.relative(targetRepo, liveRerun.reportPath));
      item.liveRerunStatus = liveRerun.status;
      if (!liveRerun.ok) {
        item.status = "failed_live_rerun";
        item.reason = liveRerun.failedCommand?.label || "live_rerun_failed";
        item.completedAt = new Date().toISOString();
        processedIds.add(candidate.id);
        const failedLedger = readJson(ledgerPath, "queue-ledger");
        updateLedgerTerminalStatus({ candidate, item, ledger: failedLedger, ledgerPath, targetRepo });
        state = saveState(runRoot, pushItem(state, item));
        report.items.push(item);
        report.status = "stopped_after_failed_live_rerun";
        report.ok = false;
        appendEvent(runRoot, { candidateId: candidate.id, event: "candidate_live_rerun_failed", runId });
        break;
      }
    } else {
      item.liveRerunStatus = "not_required";
    }

    const docsDecision = checkContextBudget(contextBudget, "docsHandoffWrite", CONTEXT_STEP_COST.docsHandoffWrite);
    report.contextBudget.lastDecision = docsDecision;
    if (docsDecision.action !== "continue") {
      item.status = docsDecision.action === "hard_stop" ? "failed_context_pressure" : "blocked_context_budget_resume_required";
      item.reason = `context-budget-${docsDecision.threshold}`;
      item.completedAt = new Date().toISOString();
      report.status = docsDecision.action === "hard_stop" ? "context_pressure" : "resume_only_context_budget";
      report.ok = docsDecision.action !== "hard_stop";
      report.blockers.push({ code: "context-budget", decision: docsDecision, candidateId: candidate.id });
      report.items.push(item);
      break;
    }
    const planPath = updatePlanDocument({ candidate, commitId: null, item, targetRepo });
    item.planPath = planPath;
    const handoffPath = writeHandoff({ candidate, commitId: null, item, state, targetRepo });
    item.handoffPath = handoffPath;

    const commitDecision = checkContextBudget(contextBudget, "commit", CONTEXT_STEP_COST.commit);
    report.contextBudget.lastDecision = commitDecision;
    if (commitDecision.action !== "continue") {
      item.status = commitDecision.action === "hard_stop" ? "failed_context_pressure" : "blocked_context_budget_resume_required";
      item.reason = `context-budget-${commitDecision.threshold}`;
      item.completedAt = new Date().toISOString();
      report.status = commitDecision.action === "hard_stop" ? "context_pressure" : "resume_only_context_budget";
      report.ok = commitDecision.action !== "hard_stop";
      report.blockers.push({ code: "context-budget", decision: commitDecision, candidateId: candidate.id });
      report.items.push(item);
      break;
    }
    const commitId =
      options.noCommit === true
        ? null
        : stageAndCommitReviewableChanges(targetRepo, `feat: import ${safeId(candidate.id)} recipe`);
    item.commitId = commitId;
    item.gitHeadAfter = gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head");
    if (commitId) {
      report.commits.push(commitId);
      state.commitIds = [...(state.commitIds || []), commitId];
    }

    item.status = "completed";
    item.completedAt = new Date().toISOString();
    writeHandoff({ candidate, commitId, item, state, targetRepo });
    const completionLedger = readJson(ledgerPath, "queue-ledger");
    updateLedgerCompletion({ batch, candidate, commitId, ledger: completionLedger, ledgerPath, liveRerun, targetRepo });
    processedIds.add(candidate.id);
    state = saveState(runRoot, pushItem(state, item));
    report.items.push(item);
    appendEvent(runRoot, { candidateId: candidate.id, commitId, event: "candidate_completed", runId });
  }

  if (report.status === "running") {
    const completed = report.items.filter((item) => item.status === "completed").length;
    const blocked = report.items.filter((item) => String(item.status || "").startsWith("blocked_")).length;
    const failed = report.items.filter((item) => String(item.status || "").startsWith("failed_")).length;
    const skipped = report.items.filter((item) => String(item.status || "").startsWith("skipped_")).length;
    if (failed > 0) {
      report.status = "completed_with_failed_candidates";
    } else if (blocked > 0 || skipped > 0) {
      report.status = completed > 0 ? "completed_with_blocked_or_skipped_candidates" : "completed_with_blocked_candidates";
    } else {
      report.status = "completed";
    }
  }
  report.completedCandidateIds = state.completedCandidateIds || [];
  report.blockedCandidateIds = state.blockedCandidateIds || [];
  report.skippedCandidateIds = state.skippedCandidateIds || [];
  report.finishedAt = new Date().toISOString();
  report.runSha256 = sha256Text(stableStringify({
    items: report.items.map((item) => ({ candidateId: item.candidateId, status: item.status })),
    runId,
    status: report.status,
  }));
  report.contextBudget = {
    ...report.contextBudget,
    predictedContextPercent: contextBudget.predictedContextPercent,
  };
  state.status = report.status;
  state = saveState(runRoot, state);
  const finalItem = report.items[report.items.length - 1] || lastItem || null;
  const finalCandidate = finalItem?.candidateId && (!lastCandidate || lastCandidate.id !== finalItem.candidateId)
    ? (readJson(ledgerPath, "queue-ledger").entries || []).find((entry) => entry.id === finalItem.candidateId) || lastCandidate
    : lastCandidate;
  const proof = writeProofEnvelope({
    batch: lastBatch,
    candidate: finalCandidate,
    gitHeadAfter: gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head"),
    gitHeadBefore,
    item: finalItem,
    ledgerSha256Before,
    liveRerun: lastLiveRerun,
    registryPath,
    report,
    runRoot,
    state,
    targetRepo,
  });
  report.proofEnvelopePath = proof.path;
  report.proofEnvelopeSha256 = proof.sha256;
  report.proofEnvelopeContractComplete = proof.envelope.contractComplete;
  if (finalItem) {
    finalItem.proofEnvelopePath = proof.path;
    finalItem.proofEnvelopeSha256 = proof.sha256;
  }
  const resume = writeResumeCard({
    blockers: report.blockers,
    candidate: finalCandidate,
    item: finalItem,
    ledgerPath,
    proof,
    queuePath: ledgerPath,
    report,
    runRoot,
    targetRepo,
  });
  report.resumeCardPath = resume.path;
  report.resumeCardSha256 = resume.sha256;
  if (finalCandidate && finalItem) {
    writeHandoff({
      candidate: finalCandidate,
      commitId: finalItem.commitId || null,
      item: finalItem,
      state,
      targetRepo,
    });
  }
  writeJson(path.join(runRoot, "run-report.json"), report);

  if (report.ok === false) {
    throw new FullIntakeError(report.blockers.map((entry) => entry.code).join("; ") || report.status, report);
  }
  return report;
}

function printResult(report, outputMode, options = {}, cwd = process.cwd()) {
  if (outputMode === "json") {
    if (options.output) {
      const outputPath = resolveOptionalPath(cwd, options.output, options.output);
      writeJson(outputPath, report);
      const compact = compactParentReport({
        ...report,
        fullJsonOutputPath: normalizeRepoPath(path.relative(report.targetRepo || cwd, outputPath)) || normalizeRepoPath(outputPath),
      });
      process.stdout.write(`${JSON.stringify(compact, null, 2)}\n`);
      return;
    }
    if (options.allowFullJsonForDebug === true) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return;
    }
    throw new Error("full-json-stdout-forbidden-use-compact-json-or-json-output-or-allow-full-json-for-debug");
  }
  if (outputMode === "compact-json") {
    const text = `${JSON.stringify(compactParentReport(report), null, 2)}\n`;
    if (Buffer.byteLength(text, "utf8") > RESUME_CARD_MAX_BYTES) {
      throw new Error("compact-parent-output-too-large");
    }
    process.stdout.write(text);
    return;
  }
  process.stdout.write(`Generic repo full intake: ${report.status}\n`);
  process.stdout.write(`Proof: ${report.proofEnvelopePath || "pending"}\n`);
  process.stdout.write(`Resume: ${report.resumeCardPath || "pending"}\n`);
}

async function main() {
  let outputMode = "text";
  try {
    const options = parseArgs(process.argv.slice(2));
    outputMode = options.compactJson === true ? "compact-json" : options.json === true ? "json" : "text";
    if (options.help) {
      process.stdout.write(HELP.trimStart());
      return;
    }
    if (outputMode === "json" && !options.output && options.allowFullJsonForDebug !== true) {
      throw new Error("full-json-stdout-forbidden-use-compact-json-or-json-output-or-allow-full-json-for-debug");
    }
    const report = runFullIntake(options, REPO_ROOT);
    printResult(report, outputMode, options, REPO_ROOT);
  } catch (error) {
    if (error instanceof FullIntakeError && error.report && (outputMode === "json" || outputMode === "compact-json")) {
      try {
        printResult(error.report, outputMode === "json" ? "json" : "compact-json", parseArgs(process.argv.slice(2)), REPO_ROOT);
      } catch {
        process.stdout.write(`${JSON.stringify(compactParentReport(error.report), null, 2)}\n`);
      }
    }
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

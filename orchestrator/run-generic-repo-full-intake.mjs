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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const RUN_SCHEMA = "generic-repo-full-intake.run.v1";
const STATE_SCHEMA = "generic-repo-full-intake.state.v1";
const RESOLUTION_TICKET_SCHEMA = "generic-repo-full-intake.resolution-ticket.v1";
const RECOVERY_VALIDATION_SCHEMA = "generic-repo-full-intake.recovery-validation.v1";
const CHILD_TIMEOUT_RECOVERY_SCHEMA = "generic-repo-full-intake.child-timeout-recovery.v1";
const AUXILIARY_ID = "AUX-043";
const DEFAULT_LEDGER_PATH =
  ".codex-runtime/sdk/generic-repo-importer/kyletmartinez-after-effects-scripts-intake/queue-ledger.json";
const DEFAULT_RUN_ROOT_RELATIVE = ".codex-runtime/sdk/generic-repo-full-intake";
const DEFAULT_LIVE_LANE_REGISTRY = "orchestrator/generic-repo-live-lane-registry.json";
const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const SAFE_CLASSIFICATIONS = new Set([
  "existing_typed_tools_recipe_only",
  "small_safe_typed_tool_library_recipe_addition",
]);
const LIVE_LANE_RECLASSIFIABLE_CLASSIFICATIONS = new Set([
  "live_lane_needed",
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
  --context-percent <n>        Stop before new work at >= 70.
  --command-timeout-ms <n>     Per-command timeout. Default ${DEFAULT_COMMAND_TIMEOUT_MS}.
  --no-commit                  Do not create git commits after completed candidates.
  --json                       Print machine-readable output.
  --help                       Show this help.

The loop is serial at shared gates: live proof, importer controlled merge,
non-live validation, live rerun, plan/handoff updates, and commit. It may skip
blocked or unsafe candidates and continue to the next safe queued item when no
tracked target mutation has happened.
`;

const VALUE_OPTIONS = new Set([
  "command-timeout-ms",
  "context-percent",
  "ledger",
  "live-lane-registry",
  "max-items",
  "report-dir",
  "run-id",
  "target-repo",
]);
const BOOLEAN_OPTIONS = new Set(["help", "json", "no-commit"]);

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
    return { schema: "generic-repo-live-lane-registry.v1", entries: [] };
  }
  const registry = readJson(registryPath, "live-lane-registry");
  requireObject(registry, "live-lane-registry");
  requireArray(registry.entries, "live-lane-registry.entries");
  return registry;
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
  const result = spawnSync(command, [], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...(env || {}) },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });
  const completedAt = new Date().toISOString();
  const timedOut = result.error && result.error.code === "ETIMEDOUT";
  const record = {
    command,
    completedAt,
    error: result.error ? result.error.message : null,
    exitCode: result.status,
    label,
    signal: result.signal || null,
    startedAt,
    timedOut: Boolean(timedOut),
  };
  writeFileSync(
    logPath,
    [
      `# ${label}`,
      `command: ${command}`,
      `startedAt: ${startedAt}`,
      `completedAt: ${completedAt}`,
      `exitCode: ${result.status}`,
      `signal: ${result.signal || ""}`,
      `timedOut: ${Boolean(timedOut)}`,
      "",
      "## stdout",
      result.stdout || "",
      "",
      "## stderr",
      result.stderr || "",
    ].join("\n"),
    "utf8",
  );
  return {
    ...record,
    logPath,
    ok: result.status === 0 && !result.error,
    stderrTail: tailText(result.stderr),
    stdoutTail: tailText(result.stdout),
  };
}

function tailText(value, maxLength = 1000) {
  const text = String(value || "");
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}

function commandEvidence(commandResult, targetRepo) {
  return {
    command: commandResult.command,
    exitCode: commandResult.exitCode,
    label: commandResult.label,
    logPath: normalizeRepoPath(path.relative(targetRepo, commandResult.logPath)),
    ok: commandResult.ok,
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

function runAutoLiveLane({ candidate, ledger, ledgerPath, registry, runRoot, runId, targetRepo, timeoutMs }) {
  let template = liveLaneTemplateFor(registry, candidate);
  const laneRoot = path.join(runRoot, "candidates", safeId(candidate.id), "live-lane");
  const logDir = path.join(laneRoot, "logs");
  mkdirSync(logDir, { recursive: true });
  let synthesisReport = null;
  let synthesisReportPath = null;

  if (!template) {
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
  if (LIVE_LANE_RECLASSIFIABLE_CLASSIFICATIONS.has(previousClassification)) {
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

function processLiveLaneResolutionTickets({ ledger, ledgerPath, registry, runId, runRoot, targetRepo, timeoutMs }) {
  const recoverable = ledger.entries.filter(isRecoverableLiveLaneEntry);
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
      const ticket = recordResolutionTicket({
        affected: bucket.entries,
        evidence: {
          familyId: bucket.familyId,
          synthesis: bucket.synthesis,
        },
        groupId,
        reason: bucket.synthesis.reason,
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

function processImportFailureResolutionTickets({ ledger, runId, runRoot, targetRepo }) {
  const tickets = [];
  const requeuedCandidateIds = [];
  const buckets = new Map();
  for (const entry of ledger.entries) {
    const kind = recoverableImportFailureKind(entry);
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
        batchReport: representative.failClosed?.batchReport || representative.implementation?.batchReport || null,
        failureReason: representative.failClosed?.reason || representative.implementation?.failureReason || null,
        familyId: representative.liveGate?.synthesisFamily || null,
        retryNonce: safeId(`${groupId}-${sha256Text(`${bucket.entries.map((entry) => entry.id).sort().join(",")}:${runId}`).slice(0, 8)}`),
      },
      groupId,
      reason: kind === "child_timeout" ? "child_timeout_patch_recovery_queued" : "fresh_retry_queued_after_manifest_mismatch",
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
            batchReport: entry.failClosed?.batchReport || entry.implementation?.batchReport || ticket.evidence.batchReport,
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

function processResolutionTickets({ ledger, ledgerPath, registry, runId, runRoot, targetRepo, timeoutMs }) {
  const closed = closeStaleRunningChildTimeoutTickets({ ledger, runId, runRoot, targetRepo });
  const live = processLiveLaneResolutionTickets({ ledger, ledgerPath, registry, runId, runRoot, targetRepo, timeoutMs });
  const imports = processImportFailureResolutionTickets({ ledger, runId, runRoot, targetRepo });
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

function runCandidateImport({ candidate, ledger, runId, runRoot, targetRepo }) {
  const singleLedgerPath = createSingleCandidateLedger({ candidate, ledger, runRoot, targetRepo });
  const retryNonce = candidate.implementation?.retryNonce || candidate.implementation?.recoveryIntent?.retryNonce || "";
  const batchRunId = safeId(
    `${safeId(runId).slice(0, 36)}-${sha256Text(`${candidate.id}:${retryNonce}`).slice(0, 10)}-import`,
  ).slice(0, 60);
  const reportDir = normalizeRepoPath(path.relative(targetRepo, path.join(runRoot, "queue-supervisor")));
  const report = runBatch(
    {
      batch: true,
      ledger: singleLedgerPath,
      maxItems: "1",
      reportDir,
      runId: batchRunId,
      targetRepo,
    },
    REPO_ROOT,
  );
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

function childRunResultsForImporter(targetRepo, importerRunId) {
  const dir = path.join(targetRepo, ".codex-runtime", "sdk", "generic-repo-importer", importerRunId, "implementation", "child-run-results");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => path.join(dir, entry))
    .map((filePath) => readJson(filePath, `child-run-result:${filePath}`));
}

function resolveChildTimeoutEvidence({ candidate, targetRepo, batchReportPath }) {
  const report = readJsonIfExists(absoluteReportPath(targetRepo, batchReportPath), "child-timeout-batch-report");
  if (!report) {
    throw new Error(`child-timeout-batch-report-missing:${batchReportPath || "none"}`);
  }
  const importerRunId = report.importer?.runId || report.items?.[0]?.importerRunId || null;
  if (!importerRunId) {
    throw new Error("child-timeout-importer-run-id-missing");
  }
  const childResults = childRunResultsForImporter(targetRepo, importerRunId);
  const childResult = childResults.find((entry) => (
    entry.status === "failed_timeout" &&
    Array.isArray(entry.changedPaths) &&
    entry.changedPaths.length > 0
  )) || childResults.find((entry) => entry.status === "failed_timeout") || null;
  if (!childResult) {
    throw new Error(`child-timeout-result-missing:${importerRunId}`);
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
  const batchReportPath = intent.batchReport || candidate.failClosed?.batchReport || candidate.implementation?.batchReport || null;
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
        result: {
          artifacts: [recoveryReport.validationReport],
          nonLiveValidationComplete: true,
          recoveryReport: recoveryReport.reportPath,
          runId: importerRunId,
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

function tryRecoverImportFailure({ candidate, error, ledger, runId, runRoot, targetRepo, timeoutMs }) {
  const message = error && error.message ? error.message : String(error || "");
  const reportPath = error?.report?.reportPath || null;
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
      return runCandidateImport({ candidate: retryCandidate, ledger, runId, runRoot, targetRepo });
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
      : batch.report.importer?.result?.artifacts?.includes("validation/non-live-report.json")
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
  const changedPaths = gitChangedPaths(targetRepo);
  const text = [
    `# Handoff: generic repository full-intake orchestrator, ${new Date().toISOString()}`,
    "",
    "## Текущая цель",
    "",
    "Довести generic repository full-intake loop так, чтобы один верхнеуровневый запуск шел по ledger queue без ручного запуска каждого кандидата.",
    "",
    "## Текущее состояние",
    "",
    `- Run id: \`${state.runId}\`.`,
    `- Последний кандидат: \`${candidate.id}\` (${candidate.sourcePath}).`,
    `- Статус кандидата: \`${item.status}\`.`,
    `- Live lane: \`${item.liveLaneStatus || "not_required"}\`.`,
    `- Import batch: \`${item.batchRunId || "n/a"}\`.`,
    `- Live rerun: \`${item.liveRerunStatus || "not_required"}\`.`,
    `- Commit: \`${commitId || "pending"}\`.`,
    "",
    "## Файлы затронуты",
    "",
    ...(changedPaths.length ? changedPaths.map((entry) => `- \`${entry}\``) : ["- Нет tracked working-tree изменений на момент handoff."]),
    "",
    "## Валидация",
    "",
    `- Lane report: \`${item.liveLaneReport || "not_required"}\`.`,
    `- Batch report: \`${item.batchReport || "n/a"}\`.`,
    `- Live rerun report: \`${item.liveRerunReport || "not_required"}\`.`,
    "",
    "## Решения",
    "",
    "- Full-intake loop keeps shared files, validation, live proof, plan/handoff, and commit serial.",
    "- Missing live lanes are resolved through registry-backed generated-only OpenAI CLI templates when available; otherwise the candidate is blocked with evidence and the loop can continue.",
    "",
    "## Риски / блокеры",
    "",
    "- Push/PR не выполнялись и требуют отдельного approval.",
    "- Local/Ollama, fallback providers, broad/default CEP smoke, dependency/package changes, raw JSX copies, and source checkout writes remain forbidden.",
    "",
    "## Точный Prompt Для Следующего Чата",
    "",
    "Продолжи в `C:\\Users\\Ant\\Documents\\Codex\\AE_agent`. Прочитай `AGENTS.md`, `.codex/handoff.md`, `specs/target-app.md`, `plans/target-app-execplan.md` в UTF-8. Начни с `git status --short --branch` и `git remote -v`; `origin` указывает на ae-mcp-bridge, push туда не делать. Продолжай generic repository full-intake loop по ledger, соблюдая no Local/Ollama, no fallback providers, no dependency/package changes, no raw JSX copy, no source checkout writes, no broad CEP smoke, no PR/push без approval.",
    "",
  ].join("\n");
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

export function runFullIntake(options, cwd = process.cwd()) {
  const runId = safeId(options.runId, "full-intake");
  if (!options.runId) {
    throw new Error("--run-id is required for generic repo full-intake runs");
  }
  const maxItems = parsePositiveInteger(options.maxItems, "max-items", 1);
  const timeoutMs = parsePositiveInteger(options.commandTimeoutMs, "command-timeout-ms", DEFAULT_COMMAND_TIMEOUT_MS);
  const contextPercent = parseFiniteNumber(options.contextPercent, "context-percent");
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
  const { resumed, state: loadedState } = loadOrCreateState({ ledgerPath, maxItems, runId, runRoot, targetRepo });
  let state = loadedState;
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

  if (contextPercent !== null && contextPercent >= 70) {
    report.status = "handoff_required";
    report.ok = false;
    report.blockers.push({ code: "context-pressure", contextPercent });
    state.status = report.status;
    state = saveState(runRoot, state);
    throw new FullIntakeError("context-pressure", report);
  }

  const resolutionQueue = processResolutionTickets({
    ledger: initialLedger,
    ledgerPath,
    registry,
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

  let considered = 0;
  const processedIds = terminalProcessedIds(state, initialLedger);

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
      const liveReport = runAutoLiveLane({ candidate, ledger: activeLedger, ledgerPath, registry, runRoot, runId, targetRepo, timeoutMs });
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
      if (candidate.implementation?.recoveryIntent?.mode === "recover_child_timeout_patch") {
        batch = recoverChildTimeoutPatch({ candidate, runId, runRoot, targetRepo, timeoutMs });
      } else {
        batch = runCandidateImport({ candidate, ledger: activeLedger, runId, runRoot, targetRepo });
      }
      item.batchRunId = batch.batchRunId;
      item.batchReport = batch.report.reportPath;
      item.importStatus = batch.report.status;
    } catch (error) {
      let recoveryError = null;
      let recoveredBatch = null;
      try {
        recoveredBatch = tryRecoverImportFailure({
          candidate,
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

    let liveRerun = null;
    if (candidate.liveGate.required === true) {
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

    const planPath = updatePlanDocument({ candidate, commitId: null, item, targetRepo });
    item.planPath = planPath;
    const handoffPath = writeHandoff({ candidate, commitId: null, item, state, targetRepo });
    item.handoffPath = handoffPath;

    const commitId =
      options.noCommit === true
        ? null
        : stageAndCommitReviewableChanges(targetRepo, `feat: import ${safeId(candidate.id)} recipe`);
    item.commitId = commitId;
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
  state.status = report.status;
  state = saveState(runRoot, state);
  writeJson(path.join(runRoot, "run-report.json"), report);

  if (report.ok === false) {
    throw new FullIntakeError(report.blockers.map((entry) => entry.code).join("; ") || report.status, report);
  }
  return report;
}

function printResult(report, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Generic repo full intake: ${report.status}\n`);
  process.stdout.write(`Items: ${report.items.map((item) => `${item.candidateId}:${item.status}`).join(", ") || "none"}\n`);
  process.stdout.write(`Commits: ${report.commits.join(", ") || "none"}\n`);
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
    const report = runFullIntake(options, REPO_ROOT);
    printResult(report, asJson);
  } catch (error) {
    if (error instanceof FullIntakeError && error.report && asJson) {
      process.stdout.write(`${JSON.stringify(error.report, null, 2)}\n`);
    }
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

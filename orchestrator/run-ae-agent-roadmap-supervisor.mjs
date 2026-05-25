#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
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
import { pathToFileURL } from "node:url";

export const DEFAULT_QUEUE_PATH =
  ".codex-audit/sdk-roadmap-supervisor/199-roadmap-supervisor-queue.json";
export const DEFAULT_LOG_DIR = ".codex-runtime/sdk/roadmap-supervisor";
export const DEFAULT_MAX_ITEMS = 3;
export const DEFAULT_MAX_MINUTES = 180;
export const HARD_MAX_ITEMS = 5;
export const HARD_MAX_MINUTES = 300;
export const DEFAULT_TAIL_LINES = 80;
const CHILD_OUTPUT_MAX_BUFFER_BYTES = 30 * 1024 * 1024;
const REVIEWER_LIMIT = 2;
const LIVE_CHECK_TIMEOUT_MS = 5 * 60 * 1000;
const REVIEWER_SDK_PROCESS_TERMINATION_RE =
  /Failed to parse item:\s*(?:SUCCESS:\s*The process with PID \d+ \(child process of PID \d+\) has been terminated\.|Успешно:\s*.*?\d+.*?\d+.*?заверш[её]н)/i;

const HELP = `
AE Agent roadmap supervisor

Usage:
  node orchestrator/run-ae-agent-roadmap-supervisor.mjs --plan-only --queue <path> --max-items <n> --json
  node orchestrator/run-ae-agent-roadmap-supervisor.mjs --live-check --json
  node orchestrator/run-ae-agent-roadmap-supervisor.mjs --execute-one --item <id> --approval-text "<exact text>"
  node orchestrator/run-ae-agent-roadmap-supervisor.mjs --run-until-budget --max-items <n> --max-minutes <m> --reviewers parallel --approval-text "<exact text>"
  node orchestrator/run-ae-agent-roadmap-supervisor.mjs --mission-plan-only --mission-prompt "<goal>" --json
  node orchestrator/run-ae-agent-roadmap-supervisor.mjs --mission-run --mission-prompt "<goal>" --approval-text "<exact mission approval>"
  node orchestrator/run-ae-agent-roadmap-supervisor.mjs --mission-run --queue <path> --approval-text "<exact mission approval>"

Options:
  --queue <path>             Roadmap supervisor queue. Defaults to ${DEFAULT_QUEUE_PATH}
  --item <id>                Queue item for --execute-one.
  --engine <sdk|cli>         Child execution engine for delegated runners. Default: sdk.
  --session-id <id>          Runtime session id.
  --resume-session <id>      Resume existing runtime state for run-until-budget.
  --log-dir <path>           Runtime session root under .codex-runtime/.
  --max-items <n>            Default ${DEFAULT_MAX_ITEMS}, hard cap ${HARD_MAX_ITEMS}.
  --max-minutes <n>          Default ${DEFAULT_MAX_MINUTES}, hard cap ${HARD_MAX_MINUTES}.
  --reviewers <none|parallel>
                             Run read-only reviewer tasks, up to two in parallel.
  --approval-text <text>     Exact supervisor approval text printed by --plan-only.
  --live-approval-text <text>
                             Exact item-level live validation approval text.
  --mission-prompt <text>    Mission intent used to synthesize a bounded queue when --queue is not provided.
  --require-live-connectivity
                             Run read-only AE/CEP connectivity before writer work.
  --tail-lines <n>           Failure tail lines. Default ${DEFAULT_TAIL_LINES}.
  --json                     Print machine-readable output.
  --help                     Show this help.

The supervisor is deterministic control-plane code. Writer children run one
approved milestone at a time through direct roadmap SDK, Codex CLI fallback,
bounded runners, or smoke fixtures. Reviewer children are read-only, and
push/dependency/live/CEP/external-provider work is rejected unless a future
queue item adds its own narrow approval lane.
`;

const VALUE_OPTIONS = new Set([
  "approval-text",
  "engine",
  "item",
  "live-approval-text",
  "log-dir",
  "max-items",
  "max-minutes",
  "mission-prompt",
  "queue",
  "resume-session",
  "reviewers",
  "session-id",
  "tail-lines",
]);

const BOOLEAN_OPTIONS = new Set([
  "execute-one",
  "help",
  "json",
  "live-check",
  "mission-plan-only",
  "mission-run",
  "plan-only",
  "require-live-connectivity",
  "run-until-budget",
]);

const UNSAFE_OPTIONS = new Set([
  "auto-push",
  "cep-panel-sdk-write",
  "commit",
  "dependency",
  "external-provider",
  "force",
  "install",
  "live",
  "mutating-live",
  "openai-cli-planner",
  "package-install",
  "pr",
  "push",
]);

const GLOBAL_FORBIDDEN_PATH_PATTERNS = Object.freeze([
  ".git/**",
  "node_modules/**",
  "package-lock.json",
  "**/package-lock.json",
  ".env*",
  "**/.env*",
  "*.key",
  "**/*.key",
  "*.pem",
  "**/*.pem",
  "*credential*",
  "**/*credential*",
  "*secret*",
  "**/*secret*",
  "*token*",
  "**/*token*",
]);

const QUEUE_ITEM_LABEL_PATTERN = /^(?:M\d{1,4}|AUX-\d{3})$/;

function splitInlineOption(raw) {
  const index = raw.indexOf("=");
  if (index === -1) {
    return { inlineValue: undefined, name: raw };
  }
  return { inlineValue: raw.slice(index + 1), name: raw.slice(0, index) };
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function parsePositiveInt(name, value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid value for --${name}: ${value}. Expected ${min}..${max}.`);
  }
  return parsed;
}

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }

    const { inlineValue, name } = splitInlineOption(arg.slice(2));
    if (UNSAFE_OPTIONS.has(name)) {
      throw new Error(`Unsafe roadmap supervisor flag rejected: --${name}`);
    }

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

    if (name === "engine" && !["sdk", "cli"].includes(value)) {
      throw new Error(`Invalid value for --engine: ${value}. Expected sdk or cli.`);
    }
    if (name === "reviewers" && !["none", "parallel"].includes(value)) {
      throw new Error(`Invalid value for --reviewers: ${value}. Expected none or parallel.`);
    }
    if (name === "max-items") {
      options.maxItems = parsePositiveInt(name, value, 1, HARD_MAX_ITEMS);
    } else if (name === "max-minutes") {
      options.maxMinutes = parsePositiveInt(name, value, 1, HARD_MAX_MINUTES);
    } else if (name === "tail-lines") {
      options.tailLines = parsePositiveInt(name, value, 1, 1000);
    } else {
      options[toCamelCase(name)] = value;
    }

    if (inlineValue === undefined) {
      index += 1;
    }
  }
  return options;
}

function normalizeRepoPath(value) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function normalizeQueuePath(cwd, queuePath) {
  const normalized = normalizeRepoPath(queuePath || DEFAULT_QUEUE_PATH);
  if (
    normalized === "" ||
    normalized === "." ||
    normalized.startsWith("../") ||
    /^[A-Za-z]:\//.test(normalized) ||
    path.isAbsolute(queuePath)
  ) {
    throw new Error(`Queue path must stay inside repository: ${queuePath}`);
  }
  const resolvedCwd = path.resolve(cwd);
  const resolved = path.resolve(resolvedCwd, normalized);
  if (!resolved.startsWith(`${resolvedCwd}${path.sep}`)) {
    throw new Error(`Queue path must stay inside repository: ${queuePath}`);
  }
  return normalized;
}

function normalizeRuntimeRoot(cwd, logDir = DEFAULT_LOG_DIR) {
  const normalized = normalizeRepoPath(logDir || DEFAULT_LOG_DIR);
  if (
    normalized === "" ||
    normalized === "." ||
    normalized.startsWith("../") ||
    /^[A-Za-z]:\//.test(normalized) ||
    path.isAbsolute(logDir)
  ) {
    throw new Error(`Runtime log directory must stay inside repository: ${logDir}`);
  }
  if (normalized !== ".codex-runtime" && !normalized.startsWith(".codex-runtime/")) {
    throw new Error(`Runtime log directory must stay under .codex-runtime/: ${logDir}`);
  }
  const resolvedCwd = path.resolve(cwd);
  const resolved = path.resolve(resolvedCwd, normalized);
  if (!resolved.startsWith(`${resolvedCwd}${path.sep}`)) {
    throw new Error(`Runtime log directory must stay inside repository: ${logDir}`);
  }
  return normalized;
}

function isUnsafeRepoPathShape(value) {
  const normalized = normalizeRepoPath(value);
  return (
    normalized === "" ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.includes("//") ||
    /^[A-Za-z]:\//.test(normalized) ||
    path.isAbsolute(value)
  );
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function patternToRegex(pattern) {
  const normalized = normalizeRepoPath(pattern);
  let regex = "";
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized.slice(index, index + 2) === "**") {
      regex += ".*";
      index += 1;
    } else if (normalized[index] === "*") {
      regex += "[^/]*";
    } else {
      regex += escapeRegex(normalized[index]);
    }
  }
  return new RegExp(`^${regex}$`);
}

function matchesPattern(repoPath, pattern) {
  return patternToRegex(pattern).test(normalizeRepoPath(repoPath));
}

function readJson(cwd, repoPath) {
  return JSON.parse(readFileSync(path.join(cwd, repoPath), "utf8"));
}

function readText(cwd, repoPath) {
  return readFileSync(path.join(cwd, repoPath), "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function fileSha256(cwd, repoPath) {
  const absolute = path.join(cwd, normalizeRepoPath(repoPath));
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    return null;
  }
  return sha256(readFileSync(absolute));
}

function fileFingerprint(cwd, repoPath) {
  const absolute = path.join(cwd, normalizeRepoPath(repoPath));
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    return null;
  }
  const stats = statSync(absolute);
  return {
    mtimeMs: stats.mtimeMs,
    sha256: fileSha256(cwd, repoPath),
    size: stats.size,
  };
}

function uniqueSorted(values) {
  return Array.from(new Set(values.map(normalizeRepoPath))).sort();
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
}

function queueItemLabel(item) {
  if (typeof item.label === "string" && item.label.trim()) {
    return item.label.trim();
  }
  return `M${item.milestone}`;
}

function validateQueueItemLabel(item) {
  const hasMilestone = Object.hasOwn(item, "milestone");
  const hasLabel = Object.hasOwn(item, "label");
  if (!hasMilestone && !hasLabel) {
    throw new Error(`Queue item ${item.id || "(missing id)"} must include milestone or label.`);
  }
  if (hasLabel) {
    if (typeof item.label !== "string" || !QUEUE_ITEM_LABEL_PATTERN.test(item.label)) {
      throw new Error(`Queue item label is invalid for ${item.id}: ${item.label}`);
    }
    if (item.label.startsWith("AUX-") && hasMilestone) {
      throw new Error(`AUX queue item must not include numeric milestone: ${item.id}`);
    }
    if (item.label.startsWith("M")) {
      const labelMilestone = Number.parseInt(item.label.slice(1), 10);
      if (!Number.isInteger(labelMilestone) || (hasMilestone && item.milestone !== labelMilestone)) {
        throw new Error(`Queue item label/milestone mismatch for ${item.id}: ${item.label}`);
      }
    }
  }
  if (hasMilestone && (!Number.isInteger(item.milestone) || item.milestone < 1)) {
    throw new Error(`Queue milestone is invalid at ${item.id}.`);
  }
}

function auxLabelNumber(item) {
  const label = queueItemLabel(item);
  if (!label.startsWith("AUX-")) {
    return null;
  }
  return Number.parseInt(label.slice(4), 10);
}

function validatePlannedPath(item, repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  if (isUnsafeRepoPathShape(normalized)) {
    throw new Error(`Unsafe planned path in ${item.id}: ${repoPath}`);
  }
  if (normalized.endsWith("/")) {
    throw new Error(`Planned path must be a file path in ${item.id}: ${repoPath}`);
  }
  const forbidden = [...GLOBAL_FORBIDDEN_PATH_PATTERNS, ...(item.forbiddenPaths || [])];
  for (const pattern of forbidden) {
    if (matchesPattern(normalized, pattern)) {
      throw new Error(`Planned path is forbidden in ${item.id}: ${repoPath}`);
    }
  }
}

function validateQueue(queue) {
  if (queue.schema !== "sdk-roadmap-supervisor-queue.v1") {
    throw new Error(`Unexpected roadmap supervisor queue schema: ${queue.schema}`);
  }
  assertArray(queue.queueItems, "queueItems");
  const ids = new Set();
  let previousMilestone = 0;
  let previousAuxLabel = 0;
  for (const item of queue.queueItems) {
    for (const field of [
      "id",
      "title",
      "dependencies",
      "runner",
      "mode",
      "plannedPaths",
      "forbiddenPaths",
      "allowedActions",
      "forbiddenActions",
      "allowedCommands",
      "validationCommands",
      "reviewerTasks",
      "approval",
      "maxChildRuns",
      "maxMinutes",
      "commitPolicy",
      "handoffPolicy",
      "stopGates",
      "status",
    ]) {
      if (!(field in item)) {
        throw new Error(`Queue item ${item.id || "(missing id)"} is missing ${field}.`);
      }
    }
    if (ids.has(item.id)) {
      throw new Error(`Duplicate queue item id: ${item.id}`);
    }
    ids.add(item.id);
    validateQueueItemLabel(item);
    if (Object.hasOwn(item, "milestone")) {
      if (item.milestone < previousMilestone) {
        throw new Error(`Queue milestone ordering is invalid at ${item.id}.`);
      }
      previousMilestone = item.milestone;
    }
    const auxNumber = auxLabelNumber(item);
    if (auxNumber !== null) {
      if (auxNumber < previousAuxLabel) {
        throw new Error(`AUX queue label ordering is invalid at ${item.id}.`);
      }
      previousAuxLabel = auxNumber;
    }
    assertArray(item.dependencies, `${item.id}.dependencies`);
    assertArray(item.plannedPaths, `${item.id}.plannedPaths`);
    assertArray(item.forbiddenPaths, `${item.id}.forbiddenPaths`);
    assertArray(item.allowedActions, `${item.id}.allowedActions`);
    assertArray(item.forbiddenActions, `${item.id}.forbiddenActions`);
    assertArray(item.allowedCommands, `${item.id}.allowedCommands`);
    assertArray(item.validationCommands, `${item.id}.validationCommands`);
    assertArray(item.reviewerTasks, `${item.id}.reviewerTasks`);
    assertArray(item.stopGates, `${item.id}.stopGates`);
    if (item.plannedPaths.length === 0) {
      throw new Error(`Queue item has no planned paths: ${item.id}`);
    }
    for (const repoPath of item.plannedPaths) {
      validatePlannedPath(item, repoPath);
    }
    if (!["fixture", "feature-conveyor", "cleanup-conveyor", "roadmap-sdk"].includes(item.runner.kind)) {
      throw new Error(`Unsupported runner kind for ${item.id}: ${item.runner.kind}`);
    }
    if (!["local-only", "sdk-write", "fixture"].includes(item.mode)) {
      throw new Error(`Unsupported queue item mode for ${item.id}: ${item.mode}`);
    }
    if (!["queued", "blocked", "completed"].includes(item.status)) {
      throw new Error(`Unsupported queue item status for ${item.id}: ${item.status}`);
    }
    if (!["approved", "pending-explicit-approval"].includes(item.approval.state)) {
      throw new Error(`Unsupported approval state for ${item.id}: ${item.approval.state}`);
    }
    if (item.approval.freshRequired !== true) {
      throw new Error(`Queue item approval must be fresh-required: ${item.id}`);
    }
    if (!Number.isInteger(item.maxChildRuns) || item.maxChildRuns < 0) {
      throw new Error(`Invalid maxChildRuns for ${item.id}.`);
    }
    if (!Number.isInteger(item.maxMinutes) || item.maxMinutes < 1 || item.maxMinutes > HARD_MAX_MINUTES) {
      throw new Error(`Invalid maxMinutes for ${item.id}.`);
    }
    if (item.commitPolicy.autoCommit !== true) {
      throw new Error(`Queue item must require autoCommit for supervisor execution: ${item.id}`);
    }
    if (!item.commitPolicy.message) {
      throw new Error(`Queue item commit message is missing: ${item.id}`);
    }
    if (item.handoffPolicy.required === true && !item.handoffPolicy.path) {
      throw new Error(`Queue item handoff path is missing: ${item.id}`);
    }
    if (!item.stopGates.includes("validation-failed") || !item.stopGates.includes("context-pressure")) {
      throw new Error(`Queue item must include validation/context stop gates: ${item.id}`);
    }
    validateLiveValidationPolicy(item);
  }
  for (const item of queue.queueItems) {
    for (const dependency of item.dependencies) {
      if (!ids.has(dependency)) {
        throw new Error(`Unknown dependency for ${item.id}: ${dependency}`);
      }
    }
  }
}

function validateLiveValidationPolicy(item) {
  const policy = item.liveValidation || { mode: "none" };
  if (!["none", "read-only-connectivity", "generated-only-command"].includes(policy.mode)) {
    throw new Error(`Unsupported liveValidation mode for ${item.id}: ${policy.mode}`);
  }
  if (policy.mode === "none") {
    return;
  }
  assertArray(policy.commands, `${item.id}.liveValidation.commands`);
  if (policy.commands.length === 0) {
    throw new Error(`liveValidation commands are required for ${item.id}.`);
  }
  if (policy.mode === "generated-only-command") {
    if (policy.approvalRequired !== true || !policy.approvalText) {
      throw new Error(`generated-only liveValidation requires exact approval text for ${item.id}.`);
    }
    if (policy.mutatingLive !== true) {
      throw new Error(`generated-only liveValidation must explicitly mark mutatingLive for ${item.id}.`);
    }
    if (policy.generatedOnlyLive === true && policy.noUserAssetMutation !== true) {
      throw new Error(`single-approval generated-only liveValidation must forbid user asset mutation for ${item.id}.`);
    }
  }
}

function queueItemIds(queue) {
  return queue.queueItems.map((item) => item.id).join(",") || "none";
}

function liveApprovalBindings(queue) {
  const bindings = [];
  for (const item of queue.queueItems) {
    const policy = item.liveValidation || { mode: "none" };
    if (
      policy.mode !== "generated-only-command" ||
      policy.generatedOnlyLive !== true ||
      policy.noUserAssetMutation !== true
    ) {
      continue;
    }
    for (const command of policy.commands) {
      bindings.push(
        [
          item.id,
          "generatedOnlyLive=true",
          "noUserAssetMutation=true",
          `command=${encodeURIComponent(command)}`,
        ].join(":"),
      );
    }
  }
  return bindings.length > 0 ? bindings.join("|") : "none";
}

function missionPromptSha(prompt) {
  const normalized = String(prompt || "").trim();
  if (!normalized) {
    throw new Error("--mission-prompt is required when --queue is not provided.");
  }
  return sha256(normalized);
}

function missionQueuePathFromPrompt(prompt) {
  const missionSha256 = missionPromptSha(prompt);
  return `.codex-audit/sdk-roadmap-supervisor/mission-${missionSha256.slice(0, 12)}-queue.json`;
}

function buildPromptMissionQueue(prompt) {
  const missionSha256 = missionPromptSha(prompt);
  const shortId = missionSha256.slice(0, 12);
  const notePath = `.codex-audit/sdk-roadmap-supervisor/mission-${shortId}-result.md`;
  return {
    schema: "sdk-roadmap-supervisor-queue.v1",
    title: `Mission ${shortId}`,
    createdAt: "mission-prompt",
    purpose: "Deterministic mission queue synthesized from a user mission prompt.",
    sourceContext: {
      missionPrompt: prompt,
      missionSha256,
      boundaries: {
        dependencies: false,
        deterministicFallback: false,
        externalAoRuntime: false,
        localOllama: false,
        openRouterFallback: false,
        push: false,
        pullRequest: false,
        userAssetMutation: false,
      },
    },
    queueItems: [
      {
        id: `mission-${shortId}-bounded-work`,
        label: "AUX-010",
        title: "Execute synthesized supervisor mission",
        dependencies: [],
        runner: {
          kind: "roadmap-sdk",
        },
        mode: "sdk-write",
        plannedPaths: [
          notePath,
          "plans/target-app-execplan.md",
          ".codex/handoff.md",
        ],
        forbiddenPaths: [
          "cep-panel/**",
          "package.json",
          "package-lock.json",
          "node_modules/**",
          "logs/**",
          "backups/**",
          "snapshots/**",
          ".github/**",
        ],
        allowedActions: [
          `complete the mission prompt within this bounded supervisor item: ${prompt}`,
          `write concise implementation evidence or a bounded follow-up note to ${notePath}`,
          "update plans/target-app-execplan.md Progress, Decision Log, and Validation notes",
          "update .codex/handoff.md with mission state, validation, decisions, risks, and exact next prompt",
        ],
        forbiddenActions: [
          "run Local/Ollama, OpenRouter, deterministic fallback, or external-provider planner validation",
          "install or run any external AO runtime",
          "create a branch, worktree, push, PR, GitHub issue, or GitHub Action",
          "change dependencies, package manifests, or package locks",
          "edit CEP panel files or run live AE/CEP unless a generated-only liveValidation lane is explicitly present",
          "mutate user assets",
        ],
        allowedCommands: [
          "git diff --check",
        ],
        validationCommands: [
          "git diff --check",
        ],
        reviewerTasks: [],
        liveValidation: {
          mode: "none",
          commands: [],
        },
        approval: {
          state: "pending-explicit-approval",
          freshRequired: true,
        },
        maxChildRuns: 1,
        maxMinutes: 60,
        commitPolicy: {
          autoCommit: true,
          message: "chore: execute supervisor mission",
        },
        handoffPolicy: {
          required: true,
          path: ".codex/handoff.md",
        },
        stopGates: [
          "dirty-git-before-execution",
          "missing-exact-fresh-approval",
          "roadmap-sdk-child-failed",
          "validation-failed",
          "context-pressure",
          "unplanned-path-change",
          "handoff-stale",
          "ao-runtime-requested",
          "local-ollama-openrouter-deterministic-fallback-requested",
        ],
        status: "queued",
      },
    ],
  };
}

export function buildSupervisorApprovalText({
  autoCommit = true,
  cwd = process.cwd(),
  itemIds = "none",
  liveBindings = "none",
  maxItems = DEFAULT_MAX_ITEMS,
  maxMinutes = DEFAULT_MAX_MINUTES,
  queueSha256 = "",
  queuePath = DEFAULT_QUEUE_PATH,
} = {}) {
  return [
    "I approve AE Agent roadmap supervisor",
    `repo=${path.resolve(cwd)}`,
    `queue=${normalizeRepoPath(queuePath)}`,
    `queueSha256=${queueSha256}`,
    `itemIds=${itemIds}`,
    `maxItems=${maxItems}`,
    `maxMinutes=${maxMinutes}`,
    `autoCommit=${autoCommit ? "true" : "false"}`,
    "noPush=true",
    "noDependencyChanges=true",
    `liveBindings=${liveBindings}`,
    "noLiveCepAeUnlessPerItemApproved=true",
  ].join(" ");
}

export function buildMissionApprovalText({
  cwd = process.cwd(),
  liveBindings = "none",
  maxItems = DEFAULT_MAX_ITEMS,
  maxMinutes = DEFAULT_MAX_MINUTES,
  missionSha256 = "none",
  queuePath = DEFAULT_QUEUE_PATH,
  queueSha256 = "",
} = {}) {
  return [
    "I approve AE Agent roadmap supervisor mission",
    `repo=${path.resolve(cwd)}`,
    `missionSha256=${missionSha256}`,
    `queue=${normalizeRepoPath(queuePath)}`,
    `queueSha256=${queueSha256}`,
    `maxItems=${maxItems}`,
    `maxMinutes=${maxMinutes}`,
    "autoCommit=true",
    "autoFollowups=bounded",
    "livePolicy=generatedOnlyOpenAiCli",
    `liveBindings=${liveBindings}`,
    "noPush=true",
    "noDependencyChanges=true",
    "noUserAssetMutation=true",
  ].join(" ");
}

function ensureMode(options) {
  const modes = [
    "planOnly",
    "liveCheck",
    "executeOne",
    "runUntilBudget",
    "missionPlanOnly",
    "missionRun",
  ].filter((key) => options[key]);
  if (options.help) {
    return "help";
  }
  if (modes.length !== 1) {
    throw new Error("Select exactly one mode: --plan-only, --live-check, --execute-one, --run-until-budget, --mission-plan-only, or --mission-run.");
  }
  return modes[0];
}

function gitOutput(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function gitStatus(cwd) {
  return gitOutput(cwd, ["status", "--porcelain"])
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function gitHead(cwd) {
  return gitOutput(cwd, ["rev-parse", "HEAD"]).trim();
}

function gitPathIsTracked(cwd, repoPath) {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", "--", normalizeRepoPath(repoPath)], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function gitPathIsIgnored(cwd, repoPath) {
  const result = spawnSync("git", ["check-ignore", "-q", "--", normalizeRepoPath(repoPath)], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function parseStatusPath(line) {
  const raw = line.slice(3).trim();
  const renameIndex = raw.indexOf(" -> ");
  return normalizeRepoPath(renameIndex === -1 ? raw : raw.slice(renameIndex + 4));
}

function enumerateRepoFiles(cwd, repoPath) {
  const absolute = path.join(cwd, repoPath);
  if (!existsSync(absolute)) {
    return [repoPath];
  }
  if (statSync(absolute).isFile()) {
    return [repoPath];
  }
  const found = [];
  const stack = [repoPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const currentAbsolute = path.join(cwd, current);
    if (statSync(currentAbsolute).isFile()) {
      found.push(normalizeRepoPath(current));
      continue;
    }
    for (const entry of readdirSync(currentAbsolute, { withFileTypes: true })) {
      stack.push(normalizeRepoPath(path.posix.join(current, entry.name)));
    }
  }
  return found.sort();
}

function collectWorkingTreeChangedPaths(cwd) {
  const paths = [];
  for (const line of gitStatus(cwd)) {
    const repoPath = parseStatusPath(line);
    if (line.startsWith("??") && existsSync(path.join(cwd, repoPath)) && statSync(path.join(cwd, repoPath)).isDirectory()) {
      paths.push(...enumerateRepoFiles(cwd, repoPath));
    } else {
      paths.push(repoPath);
    }
  }
  return uniqueSorted(paths);
}

function collectCommittedChangedPaths(cwd, preHead, postHead) {
  if (!preHead || preHead === postHead) {
    return [];
  }
  return uniqueSorted(
    gitOutput(cwd, ["diff", "--name-only", `${preHead}..${postHead}`])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

function assertCleanGit(cwd) {
  const status = gitStatus(cwd);
  if (status.length > 0) {
    throw new Error(`Refusing roadmap supervisor execution with dirty git state: ${status.join("; ")}`);
  }
}

function assertChangedPathsAllowed(cwd, plannedPaths, preHead = null) {
  const workingTreeChangedPaths = collectWorkingTreeChangedPaths(cwd);
  const postHead = preHead ? gitHead(cwd) : null;
  const committedChangedPaths = preHead ? collectCommittedChangedPaths(cwd, preHead, postHead) : [];
  const changedPaths = uniqueSorted([...workingTreeChangedPaths, ...committedChangedPaths]);
  const allowed = new Set(plannedPaths.map(normalizeRepoPath));
  const outOfScope = changedPaths.filter((repoPath) => !allowed.has(repoPath));
  if (outOfScope.length > 0) {
    throw new Error(`Roadmap supervisor changed paths outside plannedPaths: ${outOfScope.join(", ")}`);
  }
  return { changedPaths, committedChangedPaths, postHead, preHead, workingTreeChangedPaths };
}

function safeSessionToken(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

function defaultSessionId() {
  return `roadmap-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function createRuntime(cwd, options) {
  const sessionId = safeSessionToken(options.resumeSession || options.sessionId || defaultSessionId());
  const root = normalizeRuntimeRoot(cwd, options.logDir);
  const repoPath = normalizeRepoPath(path.posix.join(root, sessionId));
  const absolute = path.join(cwd, repoPath);
  mkdirSync(absolute, { recursive: true });
  mkdirSync(path.join(absolute, "children"), { recursive: true });
  mkdirSync(path.join(absolute, "live"), { recursive: true });
  mkdirSync(path.join(absolute, "reviewers"), { recursive: true });
  return {
    absolute,
    childDir: path.join(absolute, "children"),
    eventsPath: path.join(absolute, "events.jsonl"),
    finalReportPath: path.join(absolute, "final-report.json"),
    liveDir: path.join(absolute, "live"),
    repoPath,
    reviewerDir: path.join(absolute, "reviewers"),
    sessionId,
    statePath: path.join(absolute, "state.json"),
  };
}

function loadState(runtime, options) {
  if (options.resumeSession && existsSync(runtime.statePath)) {
    return JSON.parse(readFileSync(runtime.statePath, "utf8"));
  }
  return {
    schema: "sdk-roadmap-supervisor-state.v1",
    completedItems: [],
    failedItems: [],
    sessionId: runtime.sessionId,
    startedAt: new Date().toISOString(),
  };
}

function writeState(runtime, state) {
  writeFileSync(runtime.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function appendEvent(runtime, event) {
  appendFileSync(runtime.eventsPath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, "utf8");
}

function recordMissionPhase(runtime, state, phase, details = {}) {
  if (!state.mission) {
    return;
  }
  const entry = { at: new Date().toISOString(), details, phase };
  state.missionPhases = [...(state.missionPhases || []), entry];
  state.currentPhase = phase;
  state.updatedAt = entry.at;
  writeState(runtime, state);
  appendEvent(runtime, { phase, type: "mission-phase", ...details });
}

function writeFinalReport(runtime, report) {
  writeFileSync(runtime.finalReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return normalizeRepoPath(path.relative(process.cwd(), runtime.finalReportPath));
}

function writeLog(filePath, result) {
  writeFileSync(
    filePath,
    [
      `createdAt: ${new Date().toISOString()}`,
      `status: ${result.status}`,
      `signal: ${result.signal || ""}`,
      `error: ${result.error ? result.error.message : ""}`,
      "",
      "## stdout",
      result.stdout || "(empty)",
      "",
      "## stderr",
      result.stderr || "(empty)",
      "",
    ].join("\n"),
    "utf8",
  );
}

function tailLines(value, maxLines) {
  const output = String(value || "").trimEnd();
  if (!output) {
    return "";
  }
  return output.split(/\r?\n/).slice(-maxLines).join("\n").trim();
}

function splitCommandLine(command) {
  const args = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if ((char === "\"" || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) {
    throw new Error(`Unterminated quote in command: ${command}`);
  }
  if (current) {
    args.push(current);
  }
  return args;
}

function isWindowsCommandScript(program) {
  return /\.(?:cmd|bat)$/i.test(program);
}

function runShellCommand(cwd, command, timeoutMs = 120000) {
  const [program, ...args] = splitCommandLine(command);
  if (!program) {
    throw new Error("Validation command must not be empty.");
  }
  const executable = process.platform === "win32" && isWindowsCommandScript(program)
    ? (process.env.ComSpec || "cmd.exe")
    : program;
  const commandArgs = process.platform === "win32" && isWindowsCommandScript(program)
    ? ["/d", "/c", "call", program, ...args]
    : args;
  return spawnSync(executable, commandArgs, {
    cwd,
    encoding: "utf8",
    maxBuffer: CHILD_OUTPUT_MAX_BUFFER_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });
}

function liveConnectivityCommands() {
  const nodeCommand = "node";
  return [
    {
      command: `${nodeCommand} scripts/cep-panel-cdp-smoke.js inspect`,
      id: "live-cep-inspect",
      timeoutMs: LIVE_CHECK_TIMEOUT_MS,
    },
    {
      command: `${nodeCommand} scripts/cep-panel-cdp-smoke.js connector-status-smoke`,
      id: "live-connector-status-smoke",
      timeoutMs: LIVE_CHECK_TIMEOUT_MS,
    },
  ];
}

function runLoggedCommand(cwd, runtime, command, id, directory, timeoutMs = 120000) {
  const result = runShellCommand(cwd, command, timeoutMs);
  const logPath = path.join(directory, `${safeSessionToken(id)}.log`);
  writeLog(logPath, result);
  return {
    command,
    logPath: normalizeRepoPath(path.relative(cwd, logPath)),
    ok: !result.error && result.status === 0,
    status: result.status,
    stderrTail: tailLines(result.stderr, DEFAULT_TAIL_LINES),
    stdoutTail: tailLines(result.stdout, DEFAULT_TAIL_LINES),
  };
}

function runLiveConnectivityCheck(cwd, runtime) {
  const results = [];
  for (const command of liveConnectivityCommands()) {
    const result = runLoggedCommand(cwd, runtime, command.command, command.id, runtime.liveDir, command.timeoutMs);
    results.push({ ...result, id: command.id, mode: "read-only-connectivity" });
    if (!result.ok) {
      throw new Error(`Live AE/CEP connectivity failed: ${command.id}. ${result.logPath}\n${result.stderrTail || result.stdoutTail}`);
    }
  }
  return results;
}

function singleApprovalAllowsLiveValidation(cwd, queue, item, options) {
  const policy = item.liveValidation || { mode: "none" };
  if (
    policy.mode !== "generated-only-command" ||
    policy.generatedOnlyLive !== true ||
    policy.noUserAssetMutation !== true
  ) {
    return false;
  }
  if (options.missionSingleApprovalLive === true) {
    return true;
  }
  return options.approvalText === expectedSupervisorApproval(
    options,
    cwd,
    queue,
    options.queuePath,
    options.queueSha256,
  );
}

function runItemLiveValidation(cwd, runtime, queue, item, options) {
  const policy = item.liveValidation || { mode: "none" };
  if (policy.mode === "none") {
    return [];
  }
  if (policy.mode === "read-only-connectivity") {
    return runLiveConnectivityCheck(cwd, runtime);
  }
  if (
    options.liveApprovalText !== policy.approvalText &&
    !singleApprovalAllowsLiveValidation(cwd, queue, item, options)
  ) {
    throw new Error(`Missing exact --live-approval-text for ${item.id}: ${policy.approvalText}`);
  }
  const results = [];
  for (const [index, command] of policy.commands.entries()) {
    const id = `item-live-${item.id}-${index + 1}`;
    const result = runLoggedCommand(cwd, runtime, command, id, runtime.liveDir, item.maxMinutes * 60 * 1000);
    results.push({ ...result, id, mode: policy.mode });
    if (!result.ok) {
      throw new Error(`Item live validation failed for ${item.id}: ${command}. ${result.logPath}\n${result.stderrTail || result.stdoutTail}`);
    }
  }
  return results;
}

function runFixtureWriter(cwd, item) {
  const action = item.runner.action || "write-planned";
  if (action === "fail-until-path-exists") {
    const requiredPath = normalizeRepoPath(item.runner.requiredPath || "");
    if (!requiredPath || !existsSync(path.join(cwd, requiredPath))) {
      return {
        status: 1,
        stdout: "",
        stderr: "Failed to parse item: SUCCESS: The process with PID 16172 (child process of PID 12936) has been terminated.\n",
      };
    }
  }
  if (action === "write-unplanned") {
    const target = path.join(cwd, item.runner.unplannedPath || "unplanned-roadmap-supervisor.txt");
    writeFileSync(target, "unplanned\n", "utf8");
    return { status: 0, stdout: "fixture wrote unplanned path\n", stderr: "" };
  }
  if (action === "no-op") {
    return { status: 0, stdout: "fixture no-op\n", stderr: "" };
  }
  const files = item.runner.writePaths || item.plannedPaths;
  for (const repoPath of files) {
    const absolute = path.join(cwd, normalizeRepoPath(repoPath));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, `roadmap supervisor fixture ${item.id}\n`, "utf8");
  }
  return { status: 0, stdout: `fixture wrote ${files.length} path(s)\n`, stderr: "" };
}

function buildBoundedRunnerCommand(item, engine) {
  const kind = item.runner.kind;
  if (kind === "feature-conveyor") {
    const args = ["run", "codex:orchestrator:ae-agent-feature-conveyor", "--", "--item", item.runner.itemId];
    if (engine === "cli") {
      args.push("--engine", "cli", "--execute");
    } else {
      args.push("--execute-sdk");
    }
    args.push("--approval-text", item.runner.approvalText);
    return { command: "npm.cmd", args };
  }
  if (kind === "cleanup-conveyor") {
    const args = ["run", "codex:orchestrator:ae-agent-cleanup-conveyor", "--", "--item", item.runner.itemId];
    if (engine === "cli") {
      args.push("--engine", "cli", "--execute");
    } else {
      args.push("--execute-sdk");
    }
    args.push("--approval-text", item.runner.approvalText);
    return { command: "npm.cmd", args };
  }
  throw new Error(`No bounded command registered for runner kind: ${kind}`);
}

function buildRoadmapSdkPrompt(item) {
  const payload = {
    allowedActions: item.allowedActions,
    forbiddenActions: item.forbiddenActions,
    handoffPolicy: item.handoffPolicy,
    id: item.id,
    label: queueItemLabel(item),
    plannedPaths: item.plannedPaths,
    title: item.title,
    validationCommands: item.validationCommands,
  };
  if (Object.hasOwn(item, "milestone")) {
    payload.milestone = item.milestone;
  }
  return [
    "You are a writer child for AE Agent roadmap supervisor.",
    "Complete exactly the provided queue item. Do not perform unrelated work.",
    "Write only files listed in plannedPaths. Do not push, create a PR, install packages, change dependencies, edit CEP panel files, or run live AE/CEP unless this item explicitly asks for it.",
    "Update the handoff file when handoffPolicy.required is true.",
    "Respect forbiddenActions even if the task seems easier with a broader change.",
    "",
    "<roadmap_item_json>",
    JSON.stringify(payload, null, 2),
    "</roadmap_item_json>",
  ].join("\n");
}

function runRoadmapSdkWriter(cwd, item) {
  const prompt = buildRoadmapSdkPrompt(item);
  const args = [
    path.join("orchestrator", "codex-sdk-orchestrator.mjs"),
    "--cwd",
    cwd,
    "--sandbox",
    "workspace-write",
    "--approval",
    "never",
    "--web-search",
    "disabled",
    "--reasoning",
    "high",
    "--prompt",
    prompt,
  ];
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: CHILD_OUTPUT_MAX_BUFFER_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: item.maxMinutes * 60 * 1000,
  });
}

function runRoadmapCliWriter(cwd, item) {
  const prompt = buildRoadmapSdkPrompt(item);
  const args = [
    "/d",
    "/s",
    "/c",
    "codex",
    "exec",
    "--cd",
    cwd,
    "--sandbox",
    "workspace-write",
    "--ephemeral",
    "-c",
    "approval_policy=\"never\"",
    "-c",
    "model_reasoning_effort=\"high\"",
    "-c",
    "sandbox_workspace_write.network_access=false",
    "--disable",
    "web_search",
    "-",
  ];
  return spawnSync("cmd.exe", args, {
    cwd,
    input: prompt,
    encoding: "utf8",
    maxBuffer: CHILD_OUTPUT_MAX_BUFFER_BYTES,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: item.maxMinutes * 60 * 1000,
  });
}

function runWriterChild(cwd, runtime, item, engine) {
  const logPath = path.join(runtime.childDir, `${safeSessionToken(item.id)}.log`);
  if (item.runner.kind === "fixture") {
    const result = runFixtureWriter(cwd, item);
    writeLog(logPath, result);
    return { ...result, logPath };
  }
  if (item.runner.kind === "roadmap-sdk") {
    const result = engine === "cli" ? runRoadmapCliWriter(cwd, item) : runRoadmapSdkWriter(cwd, item);
    writeLog(logPath, result);
    return { ...result, logPath };
  }

  const { command, args } = buildBoundedRunnerCommand(item, engine);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: CHILD_OUTPUT_MAX_BUFFER_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: item.maxMinutes * 60 * 1000,
  });
  writeLog(logPath, result);
  return { ...result, logPath };
}

function buildReviewerPrompt(item, task) {
  return [
    "Read-only reviewer for AE Agent roadmap supervisor.",
    "Do not edit files, run mutating commands, install packages, push, or create a PR.",
    task.prompt || `Review queue item ${item.id} for blocking risks.`,
  ].join("\n");
}

function buildReviewerInvocation(cwd, prompt, engine) {
  const command = engine === "cli" ? "cmd.exe" : process.execPath;
  const args = engine === "cli"
    ? [
        "/d",
        "/s",
        "/c",
        "codex",
        "exec",
        "--cd",
        cwd,
        "--sandbox",
        "read-only",
        "--ephemeral",
        "-c",
        "approval_policy=\"never\"",
        "-c",
        "sandbox_workspace_write.network_access=false",
        "--disable",
        "web_search",
        "-",
      ]
    : [
        path.join("orchestrator", "codex-sdk-orchestrator.mjs"),
        "--cwd",
        cwd,
        "--sandbox",
        "read-only",
        "--approval",
        "never",
        "--web-search",
        "disabled",
        "--prompt",
        prompt,
      ];
  return { args, command, input: engine === "cli" ? prompt : "" };
}

function runReviewerAttempt(cwd, invocation) {
  return new Promise((resolve) => {
    let settled = false;
    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    }

    const child = spawn(invocation.command, invocation.args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      finish({ error, status: 1, stderr, stdout });
    });
    if (invocation.input !== undefined) {
      child.stdin.end(invocation.input);
    } else {
      child.stdin.end();
    }
    child.on("close", (status, signal) => {
      finish({ status, signal, stdout, stderr });
    });
  });
}

function isReviewerSdkProcessTermination(result) {
  if (!result || result.status === 0) {
    return false;
  }
  return isReviewerSdkProcessTerminationText(`${result.stderr || ""}\n${result.stdout || ""}`);
}

function isReviewerSdkProcessTerminationText(text) {
  if (REVIEWER_SDK_PROCESS_TERMINATION_RE.test(text)) {
    return true;
  }
  const parseLine = String(text || "")
    .split(/\r?\n/)
    .find((line) => /Failed to parse item:/i.test(line));
  if (!parseLine) {
    return false;
  }
  const numericIds = parseLine.match(/\b\d{3,}\b/g) || [];
  return parseLine.includes("\uFFFD") && numericIds.length >= 2;
}

function combineReviewerFallbackResult(primary, fallback) {
  return {
    error: fallback.error,
    fallbackEngine: "cli",
    primaryStatus: primary.status,
    signal: fallback.signal,
    status: fallback.status,
    stderr: [
      "## sdk reviewer attempt stderr",
      primary.stderr || "(empty)",
      "## cli reviewer fallback stderr",
      fallback.stderr || "(empty)",
    ].join("\n"),
    stdout: [
      "## sdk reviewer attempt stdout",
      primary.stdout || "(empty)",
      "## cli reviewer fallback stdout",
      fallback.stdout || "(empty)",
    ].join("\n"),
  };
}

async function runReviewerProcess(cwd, runtime, item, task, index, engine) {
  const logPath = path.join(runtime.reviewerDir, `${safeSessionToken(item.id)}-${index + 1}.log`);
  if (task.kind === "noop") {
    const result = {
      status: 0,
      stdout: `noop reviewer ${task.id || index + 1} used read-only contract\n`,
      stderr: "",
    };
    writeLog(logPath, result);
    return { ...result, id: task.id || `reviewer-${index + 1}`, logPath, readOnly: true };
  }

  const prompt = buildReviewerPrompt(item, task);
  const primary = await runReviewerAttempt(cwd, buildReviewerInvocation(cwd, prompt, engine));
  const result = engine === "sdk" && isReviewerSdkProcessTermination(primary)
    ? combineReviewerFallbackResult(primary, await runReviewerAttempt(cwd, buildReviewerInvocation(cwd, prompt, "cli")))
    : primary;
  writeLog(logPath, result);
  return { ...result, id: task.id || `reviewer-${index + 1}`, logPath, readOnly: true };
}

async function runReviewers(cwd, runtime, item, mode, engine) {
  if (mode !== "parallel" || item.reviewerTasks.length === 0) {
    return [];
  }
  const selectedTasks = item.reviewerTasks.slice(0, REVIEWER_LIMIT);
  const results = await Promise.all(
    selectedTasks.map((task, index) => runReviewerProcess(cwd, runtime, item, task, index, engine)),
  );
  for (const result of results) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    if (result.status !== 0) {
      throw new Error(
        [
          `Read-only reviewer failed for ${item.id}: ${result.id}`,
          `Log: ${normalizeRepoPath(path.relative(cwd, result.logPath))}`,
          tailLines(output, 20),
        ].join("\n"),
      );
    }
    if (item.reviewerBlocking === true && /\b(CRITICAL|BLOCKING)\b/i.test(output)) {
      throw new Error(`Read-only reviewer reported a blocking finding for ${item.id}: ${result.id}`);
    }
  }
  return results.map((result) => ({
    ...(result.fallbackEngine ? { fallbackEngine: result.fallbackEngine } : {}),
    id: result.id,
    logPath: normalizeRepoPath(path.relative(cwd, result.logPath)),
    readOnly: true,
    status: result.status,
  }));
}

function runValidationCommands(cwd, runtime, item) {
  const results = [];
  item.validationCommands.forEach((command, index) => {
    if (!item.allowedCommands.includes(command)) {
      throw new Error(`Validation command is not allowlisted for ${item.id}: ${command}`);
    }
    const result = runShellCommand(cwd, command);
    const logPath = path.join(runtime.childDir, `${safeSessionToken(item.id)}-validation-${index + 1}.log`);
    writeLog(logPath, result);
    results.push({
      command,
      logPath: normalizeRepoPath(path.relative(cwd, logPath)),
      status: result.status,
    });
    if (result.error || result.status !== 0) {
      throw new Error(
        `Validation failed for ${item.id}: ${command}. ${normalizeRepoPath(path.relative(cwd, logPath))}\n${tailLines(result.stderr || result.stdout, DEFAULT_TAIL_LINES)}`,
      );
    }
  });
  return results;
}

function stageAndCommit(cwd, item) {
  const existingPaths = item.plannedPaths
    .map(normalizeRepoPath)
    .filter((repoPath) => existsSync(path.join(cwd, repoPath)))
    .filter((repoPath) => gitPathIsTracked(cwd, repoPath) || !gitPathIsIgnored(cwd, repoPath));
  if (existingPaths.length === 0) {
    throw new Error(`No planned paths exist to commit for ${item.id}.`);
  }
  const addResult = spawnSync("git", ["add", "--", ...existingPaths], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (addResult.status !== 0) {
    throw new Error(`git add failed for ${item.id}: ${addResult.stderr || addResult.stdout}`);
  }
  const status = gitStatus(cwd);
  if (status.length === 0) {
    throw new Error(`No reviewable changes remain to commit for ${item.id}.`);
  }
  const commitResult = spawnSync(
    "git",
    [
      "-c",
      "user.name=Roadmap Supervisor",
      "-c",
      "user.email=roadmap-supervisor@example.local",
      "commit",
      "-m",
      item.commitPolicy.message,
    ],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (commitResult.status !== 0) {
    throw new Error(`git commit failed for ${item.id}: ${commitResult.stderr || commitResult.stdout}`);
  }
  return gitHead(cwd);
}

function stageAndCommitPaths(cwd, repoPaths, message) {
  const existingPaths = repoPaths
    .map(normalizeRepoPath)
    .filter((repoPath) => existsSync(path.join(cwd, repoPath)))
    .filter((repoPath) => gitPathIsTracked(cwd, repoPath) || !gitPathIsIgnored(cwd, repoPath));
  if (existingPaths.length === 0) {
    throw new Error("No paths exist to commit.");
  }
  const addResult = spawnSync("git", ["add", "--", ...existingPaths], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (addResult.status !== 0) {
    throw new Error(`git add failed: ${addResult.stderr || addResult.stdout}`);
  }
  const status = gitStatus(cwd);
  if (status.length === 0) {
    throw new Error("No reviewable changes remain to commit.");
  }
  const commitResult = spawnSync(
    "git",
    [
      "-c",
      "user.name=Roadmap Supervisor",
      "-c",
      "user.email=roadmap-supervisor@example.local",
      "commit",
      "-m",
      message,
    ],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (commitResult.status !== 0) {
    throw new Error(`git commit failed: ${commitResult.stderr || commitResult.stdout}`);
  }
  return gitHead(cwd);
}

function createRequiredHandoffSnapshot(cwd, item) {
  if (item.handoffPolicy.required !== true) {
    return null;
  }
  const handoffPath = normalizeRepoPath(item.handoffPolicy.path);
  if (!item.plannedPaths.map(normalizeRepoPath).includes(handoffPath)) {
    throw new Error(`Required handoff path is not in plannedPaths for ${item.id}: ${handoffPath}`);
  }
  return {
    path: handoffPath,
    fingerprint: fileFingerprint(cwd, handoffPath),
  };
}

function assertRequiredHandoffUpdated(cwd, item, snapshot) {
  if (!snapshot) {
    return;
  }
  if (requiredHandoffUpdated(cwd, snapshot)) {
    return;
  }
  throw new Error(`Required handoff was not updated for ${item.id}: ${snapshot.path}`);
}

function requiredHandoffUpdated(cwd, snapshot) {
  if (!snapshot) {
    return true;
  }
  const next = fileFingerprint(cwd, snapshot.path);
  if (!next) {
    return false;
  }
  const previous = snapshot.fingerprint;
  return !(
    previous &&
    next.sha256 === previous.sha256 &&
    next.mtimeMs === previous.mtimeMs &&
    next.size === previous.size
  );
}

function writeSupervisorHandoff(cwd, item, context) {
  const handoffPath = normalizeRepoPath(item.handoffPolicy.path);
  const validationLines = context.validationResults.map((entry) => `- ${entry.command}: status ${entry.status}`);
  const liveLines = context.itemLiveValidationResults.map((entry) => `- ${entry.command}: status ${entry.status}`);
  const reviewerLines = context.reviewerResults.map((entry) => `- ${entry.id}: status ${entry.status}`);
  const lines = [
    `# Handoff: ${item.id}, ${new Date().toISOString()}`,
    "",
    "## Текущая цель",
    "",
    `${item.title}.`,
    "",
    "## Текущее состояние",
    "",
    `- Queue item: ${item.id}.`,
    `- Queue label: ${queueItemLabel(item)}.`,
    `- Commit: ${context.commitId || "pending supervisor commit"}.`,
    "- Push: не выполнялся.",
    "- PR: не создавался.",
    "",
    "## Files Touched",
    "",
    ...item.plannedPaths.map((repoPath) => `- ${normalizeRepoPath(repoPath)}`),
    "",
    "## Validation Run And Results",
    "",
    ...(validationLines.length > 0 ? validationLines : ["- No validation commands recorded."]),
    "",
    "## Reviewer Results",
    "",
    ...(reviewerLines.length > 0 ? reviewerLines : ["- Reviewer mode was none or no reviewer tasks were selected."]),
    "",
    "## Live Validation",
    "",
    ...(liveLines.length > 0 ? liveLines : ["- No item live validation commands ran for this item."]),
    "",
    "## Decisions Made",
    "",
    "- Handoff was finalized by deterministic roadmap supervisor because the writer child did not update the ignored `.codex/handoff.md` file directly.",
    "- No push, PR, dependency change, CEP panel SDK write, or unapproved live mutation was performed by the supervisor.",
    "",
    "## Known Risks / Blockers",
    "",
    "- Continue with the next queue item only from a clean working tree and matching fresh supervisor approval text.",
    "",
  ];
  const absolute = path.join(cwd, handoffPath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${lines.join("\n")}\n`, "utf8");
}

function dependencySatisfied(item, completedItems, queue) {
  return item.dependencies.every((dependency) => {
    if (completedItems.includes(dependency)) {
      return true;
    }
    const dependencyItem = queue.queueItems.find((entry) => entry.id === dependency);
    return dependencyItem && dependencyItem.status === "completed";
  });
}

function selectableItems(queue, completedItems) {
  return queue.queueItems.filter(
    (item) =>
      item.status === "queued" &&
      !completedItems.includes(item.id) &&
      dependencySatisfied(item, completedItems, queue),
  );
}

function expectedSupervisorApproval(options, cwd, queue, queuePath, queueSha256) {
  const maxItems = options.maxItems || DEFAULT_MAX_ITEMS;
  const maxMinutes = options.maxMinutes || DEFAULT_MAX_MINUTES;
  return buildSupervisorApprovalText({
    cwd,
    itemIds: queueItemIds(queue),
    liveBindings: liveApprovalBindings(queue),
    maxItems,
    maxMinutes,
    queuePath,
    queueSha256,
  });
}

function assertSupervisorApproval(options, cwd, queue, queuePath, queueSha256) {
  const expected = expectedSupervisorApproval(options, cwd, queue, queuePath, queueSha256);
  if (options.approvalText !== expected) {
    throw new Error(`Missing exact --approval-text: ${expected}`);
  }
}

function assertItemExecutable(item) {
  if (item.runner.kind !== "roadmap-sdk" && item.approval.state !== "approved") {
    throw new Error(`Queue item is not approved for supervisor execution: ${item.id}`);
  }
  if (item.maxChildRuns < 1) {
    throw new Error(`Queue item maxChildRuns must be at least 1 for execution: ${item.id}`);
  }
}

async function executeQueueItem(cwd, runtime, state, queue, item, options, preApproved = false) {
  if (!preApproved) {
    assertSupervisorApproval(options, cwd, queue, options.queuePath, options.queueSha256);
  }
  assertItemExecutable(item);
  assertCleanGit(cwd);
  const preHead = gitHead(cwd);
  const handoffSnapshot = createRequiredHandoffSnapshot(cwd, item);
  recordMissionPhase(runtime, state, "item_running", { item: item.id });
  appendEvent(runtime, { item: item.id, type: "item-started" });
  const preflightLiveResults = options.requireLiveConnectivity
    ? runLiveConnectivityCheck(cwd, runtime)
    : [];
  recordMissionPhase(runtime, state, "reviewing", { item: item.id, reviewerMode: options.reviewers || "none" });
  const reviewerResults = await runReviewers(cwd, runtime, item, options.reviewers || "none", options.engine || "sdk");
  const childResult = runWriterChild(cwd, runtime, item, options.engine || "sdk");
  if (childResult.error || childResult.status !== 0) {
    throw new Error(
      `Writer child failed for ${item.id}: ${normalizeRepoPath(path.relative(cwd, childResult.logPath))}\n${tailLines(childResult.stderr || childResult.stdout, options.tailLines)}`,
    );
  }
  const preValidationChanges = assertChangedPathsAllowed(cwd, item.plannedPaths);
  recordMissionPhase(runtime, state, "validating", { item: item.id });
  const validationResults = runValidationCommands(cwd, runtime, item);
  const policy = item.liveValidation || { mode: "none" };
  const preItemLiveConnectivityResults = [];
  if (state.mission && policy.mode === "generated-only-command") {
    recordMissionPhase(runtime, state, "live_validating", { item: item.id, stage: "connectivity" });
    preItemLiveConnectivityResults.push(...runLiveConnectivityCheck(cwd, runtime));
  }
  if (state.mission && policy.mode !== "none") {
    recordMissionPhase(runtime, state, "live_validating", { item: item.id, stage: "item-live" });
  }
  const itemLiveValidationResults = runItemLiveValidation(cwd, runtime, queue, item, options);
  assertChangedPathsAllowed(cwd, item.plannedPaths);
  let handoffFinalizedBySupervisor = false;
  if (handoffSnapshot && !requiredHandoffUpdated(cwd, handoffSnapshot)) {
    writeSupervisorHandoff(cwd, item, {
      childResult,
      itemLiveValidationResults,
      preflightLiveResults,
      reviewerResults,
      validationResults,
    });
    handoffFinalizedBySupervisor = true;
  }
  assertRequiredHandoffUpdated(cwd, item, handoffSnapshot);
  recordMissionPhase(runtime, state, "handoff_written", { item: item.id });
  const commitId = stageAndCommit(cwd, item);
  if (handoffFinalizedBySupervisor) {
    writeSupervisorHandoff(cwd, item, {
      childResult,
      commitId,
      itemLiveValidationResults,
      preflightLiveResults,
      reviewerResults,
      validationResults,
    });
  }
  const postRun = assertChangedPathsAllowed(cwd, item.plannedPaths, preHead);
  if (!state.completedItems.includes(item.id)) {
    state.completedItems.push(item.id);
  }
  state.lastCommitId = commitId;
  state.updatedAt = new Date().toISOString();
  writeState(runtime, state);
  recordMissionPhase(runtime, state, "committed", { commitId, item: item.id });
  appendEvent(runtime, { commitId, item: item.id, type: "item-completed" });
  return {
    changedPaths: postRun.changedPaths,
    childLogPath: normalizeRepoPath(path.relative(cwd, childResult.logPath)),
    commitId,
    item: item.id,
    itemLiveValidationResults,
    liveConnectivityResults: [...preflightLiveResults, ...preItemLiveConnectivityResults],
    preValidationChangedPaths: preValidationChanges.changedPaths,
    reviewerResults,
    validationResults,
  };
}

function prepareRun(argv = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseArgs(argv);
  const mode = ensureMode(options);
  if (mode === "help") {
    return { help: true };
  }
  if (mode === "missionPlanOnly" || mode === "missionRun") {
    return prepareMissionRun(cwd, mode, options);
  }
  const queuePath = normalizeQueuePath(cwd, options.queue || DEFAULT_QUEUE_PATH);
  options.queuePath = queuePath;
  const queueText = readText(cwd, queuePath);
  const queueSha256 = sha256(queueText);
  options.queueSha256 = queueSha256;
  const queue = JSON.parse(queueText);
  validateQueue(queue);
  const maxItems = options.maxItems || DEFAULT_MAX_ITEMS;
  const maxMinutes = options.maxMinutes || DEFAULT_MAX_MINUTES;
  return {
    cwd,
    maxItems,
    maxMinutes,
    mode,
    options: {
      engine: options.engine || "sdk",
      reviewers: options.reviewers || "none",
      tailLines: options.tailLines || DEFAULT_TAIL_LINES,
      ...options,
    },
    queue,
    queueSha256,
    queuePath,
  };
}

function prepareMissionRun(cwd, mode, rawOptions) {
  const maxItems = rawOptions.maxItems || DEFAULT_MAX_ITEMS;
  const maxMinutes = rawOptions.maxMinutes || DEFAULT_MAX_MINUTES;
  const options = {
    engine: rawOptions.engine || "sdk",
    reviewers: rawOptions.reviewers || "parallel",
    tailLines: rawOptions.tailLines || DEFAULT_TAIL_LINES,
    ...rawOptions,
    maxItems,
    maxMinutes,
    missionSingleApprovalLive: true,
  };
  let missionSha256 = "none";
  let queue;
  let queueExists = false;
  let queuePath;
  let queueText;
  let source;
  if (rawOptions.queue) {
    queuePath = normalizeQueuePath(cwd, rawOptions.queue);
    queueText = readText(cwd, queuePath);
    queue = JSON.parse(queueText);
    queueExists = true;
    missionSha256 = rawOptions.missionPrompt ? missionPromptSha(rawOptions.missionPrompt) : "none";
    source = "existing-queue";
  } else {
    if (!rawOptions.missionPrompt) {
      throw new Error("--mission-prompt is required when --queue is not provided.");
    }
    missionSha256 = missionPromptSha(rawOptions.missionPrompt);
    queuePath = missionQueuePathFromPrompt(rawOptions.missionPrompt);
    if (existsSync(path.join(cwd, queuePath))) {
      queueText = readText(cwd, queuePath);
      queue = JSON.parse(queueText);
      queueExists = true;
      source = "existing-prompt-queue";
    } else {
      queue = buildPromptMissionQueue(rawOptions.missionPrompt);
      queueText = stableJson(queue);
      source = "synthesized-prompt";
    }
  }
  validateQueue(queue);
  const queueSha256 = sha256(queueText);
  options.queuePath = queuePath;
  options.queueSha256 = queueSha256;
  return {
    cwd,
    maxItems,
    maxMinutes,
    missionSha256,
    mode,
    options,
    queue,
    queueExists,
    queuePath,
    queueSha256,
    queueText,
    source,
  };
}

export function planOnlyEnvelope(prepared) {
  const ready = selectableItems(prepared.queue, []).slice(0, prepared.maxItems);
  return {
    approvalText: buildSupervisorApprovalText({
      cwd: prepared.cwd,
      itemIds: queueItemIds(prepared.queue),
      liveBindings: liveApprovalBindings(prepared.queue),
      maxItems: prepared.maxItems,
      maxMinutes: prepared.maxMinutes,
      queuePath: prepared.queuePath,
      queueSha256: prepared.queueSha256,
    }),
    childRunsCreated: false,
    engine: prepared.options.engine,
    items: ready.map((item) => ({
      approvalState: item.approval.state,
      id: item.id,
      label: queueItemLabel(item),
      maxChildRuns: item.maxChildRuns,
      plannedPaths: item.plannedPaths,
      reviewerTasks: item.reviewerTasks.length,
      liveValidationMode: (item.liveValidation || { mode: "none" }).mode,
      status: item.status,
      ...(Object.hasOwn(item, "milestone") ? { milestone: item.milestone } : {}),
    })),
    maxItems: prepared.maxItems,
    maxMinutes: prepared.maxMinutes,
    mode: "plan-only",
    queueSha256: prepared.queueSha256,
    queuePath: prepared.queuePath,
    runtimeStateWritten: false,
    sdkThreadCreated: false,
  };
}

function expectedMissionApproval(prepared) {
  return buildMissionApprovalText({
    cwd: prepared.cwd,
    liveBindings: liveApprovalBindings(prepared.queue),
    maxItems: prepared.maxItems,
    maxMinutes: prepared.maxMinutes,
    missionSha256: prepared.missionSha256,
    queuePath: prepared.queuePath,
    queueSha256: prepared.queueSha256,
  });
}

function assertMissionApproval(prepared) {
  const expected = expectedMissionApproval(prepared);
  if (prepared.options.approvalText !== expected) {
    throw new Error(`Missing exact --approval-text: ${expected}`);
  }
}

export function missionPlanOnlyEnvelope(prepared) {
  const ready = selectableItems(prepared.queue, []).slice(0, prepared.maxItems);
  return {
    approvalText: expectedMissionApproval(prepared),
    childRunsCreated: false,
    engine: prepared.options.engine,
    items: ready.map((item) => ({
      approvalState: item.approval.state,
      id: item.id,
      label: queueItemLabel(item),
      liveValidationMode: (item.liveValidation || { mode: "none" }).mode,
      maxChildRuns: item.maxChildRuns,
      plannedPaths: item.plannedPaths,
      reviewerTasks: item.reviewerTasks.length,
      status: item.status,
      ...(Object.hasOwn(item, "milestone") ? { milestone: item.milestone } : {}),
    })),
    liveBindings: liveApprovalBindings(prepared.queue),
    maxItems: prepared.maxItems,
    maxMinutes: prepared.maxMinutes,
    missionSha256: prepared.missionSha256,
    mode: "mission-plan-only",
    queueExists: prepared.queueExists,
    queuePath: prepared.queuePath,
    queueSha256: prepared.queueSha256,
    runtimeStateWritten: false,
    sdkThreadCreated: false,
    source: prepared.source,
  };
}

export function liveCheck(prepared) {
  const runtime = createRuntime(prepared.cwd, prepared.options);
  const state = loadState(runtime, prepared.options);
  writeState(runtime, state);
  appendEvent(runtime, { type: "live-check-started" });
  const liveConnectivityResults = runLiveConnectivityCheck(prepared.cwd, runtime);
  const report = {
    liveConnectivityResults,
    mode: "live-check",
    ok: true,
    queueSha256: prepared.queueSha256,
    queuePath: prepared.queuePath,
    sessionId: runtime.sessionId,
    statePath: normalizeRepoPath(path.relative(prepared.cwd, runtime.statePath)),
  };
  report.finalReportPath = writeFinalReport(runtime, report);
  appendEvent(runtime, { type: "live-check-completed" });
  return report;
}

export async function executeOne(prepared) {
  if (!prepared.options.item) {
    throw new Error("--execute-one requires --item <id>.");
  }
  assertSupervisorApproval(prepared.options, prepared.cwd, prepared.queue, prepared.queuePath, prepared.queueSha256);
  const item = prepared.queue.queueItems.find((entry) => entry.id === prepared.options.item);
  if (!item) {
    throw new Error(`Unknown queue item: ${prepared.options.item}`);
  }
  const runtime = createRuntime(prepared.cwd, prepared.options);
  const state = loadState(runtime, prepared.options);
  writeState(runtime, state);
  const result = await executeQueueItem(prepared.cwd, runtime, state, prepared.queue, item, prepared.options, true);
  const report = {
    mode: "execute-one",
    ok: true,
    queueSha256: prepared.queueSha256,
    queuePath: prepared.queuePath,
    results: [result],
    sessionId: runtime.sessionId,
    statePath: normalizeRepoPath(path.relative(prepared.cwd, runtime.statePath)),
  };
  report.finalReportPath = writeFinalReport(runtime, report);
  return report;
}

export async function runUntilBudget(prepared) {
  assertSupervisorApproval(prepared.options, prepared.cwd, prepared.queue, prepared.queuePath, prepared.queueSha256);
  const runtime = createRuntime(prepared.cwd, prepared.options);
  const state = loadState(runtime, prepared.options);
  writeState(runtime, state);
  const startedAt = Date.now();
  const results = [];
  let stopReason = null;
  while (results.length < prepared.maxItems) {
    const elapsedMinutes = (Date.now() - startedAt) / 60000;
    if (elapsedMinutes >= prepared.maxMinutes) {
      stopReason = "max-minutes";
      break;
    }
    const next = selectableItems(prepared.queue, state.completedItems)[0];
    if (!next) {
      stopReason = "no-ready-items";
      break;
    }
    const result = await executeQueueItem(prepared.cwd, runtime, state, prepared.queue, next, prepared.options, true);
    results.push(result);
  }
  if (!stopReason) {
    stopReason = results.length >= prepared.maxItems ? "max-items" : "completed";
  }
  const report = {
    completedItems: state.completedItems,
    maxItems: prepared.maxItems,
    maxMinutes: prepared.maxMinutes,
    mode: "run-until-budget",
    ok: true,
    queueSha256: prepared.queueSha256,
    queuePath: prepared.queuePath,
    results,
    sessionId: runtime.sessionId,
    statePath: normalizeRepoPath(path.relative(prepared.cwd, runtime.statePath)),
    stopReason,
  };
  report.finalReportPath = writeFinalReport(runtime, report);
  return report;
}

function writeMissionQueueArtifact(prepared, runtime, state) {
  if (prepared.queueExists) {
    return null;
  }
  assertCleanGit(prepared.cwd);
  const preHead = gitHead(prepared.cwd);
  const absolute = path.join(prepared.cwd, prepared.queuePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, prepared.queueText, "utf8");
  validateQueue(JSON.parse(readText(prepared.cwd, prepared.queuePath)));
  assertChangedPathsAllowed(prepared.cwd, [prepared.queuePath]);
  const commitId = stageAndCommitPaths(
    prepared.cwd,
    [prepared.queuePath],
    "chore: add supervisor mission queue",
  );
  assertChangedPathsAllowed(prepared.cwd, [prepared.queuePath], preHead);
  prepared.queueExists = true;
  state.queueCreatedCommit = commitId;
  state.updatedAt = new Date().toISOString();
  writeState(runtime, state);
  recordMissionPhase(runtime, state, "queue_created", { commitId, queuePath: prepared.queuePath });
  return commitId;
}

function missionFollowupAllowedPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  return (
    normalized === ".codex/handoff.md" ||
    normalized === "plans/target-app-execplan.md" ||
    normalized.startsWith(".codex-audit/sdk-roadmap-supervisor/") ||
    normalized.startsWith(".codex-audit/sdk-ao-pattern-intake/") ||
    normalized.startsWith("orchestrator/") ||
    normalized.startsWith("scripts/")
  );
}

function assertMissionFollowupAllowedPaths(paths) {
  for (const repoPath of paths) {
    if (!missionFollowupAllowedPath(repoPath)) {
      throw new Error(`Mission follow-up planned path is outside support scope: ${repoPath}`);
    }
  }
}

function missionFailureAllowsFollowup(error) {
  const text = error && error.message ? error.message : String(error || "");
  return isReviewerSdkProcessTerminationText(text);
}

function buildMissionFollowupItem(runtime, failedItem) {
  const markerPath = normalizeRepoPath(
    failedItem.runner && failedItem.runner.missionFollowup && failedItem.runner.missionFollowup.markerPath
      ? failedItem.runner.missionFollowup.markerPath
      : `.codex-audit/sdk-roadmap-supervisor/${runtime.sessionId}-${safeSessionToken(failedItem.id)}-followup.json`,
  );
  const plannedPaths = uniqueSorted([markerPath, ".codex/handoff.md"]);
  assertMissionFollowupAllowedPaths(plannedPaths);
  return {
    id: `aux-mission-followup-${safeSessionToken(failedItem.id)}`,
    label: "AUX-010",
    title: `Bounded mission follow-up for ${failedItem.id}`,
    dependencies: [],
    runner: {
      kind: "fixture",
      action: "write-planned",
      writePaths: plannedPaths,
    },
    mode: "fixture",
    plannedPaths,
    forbiddenPaths: [
      "cep-panel/**",
      "mcp-server/**",
      "chatgpt-connector/**",
      "registry/**",
      "recipes/**",
      "package.json",
      "package-lock.json",
      "node_modules/**",
      "logs/**",
      "backups/**",
      "snapshots/**",
      ".github/**",
    ],
    allowedActions: [
      "write one bounded support follow-up artifact for a mission parser/transport failure",
      "update .codex/handoff.md with the follow-up state",
    ],
    forbiddenActions: [
      "edit product runtime behavior",
      "run live AE/CEP validation",
      "use Local/Ollama, OpenRouter, deterministic fallback, or external-provider planner validation",
      "install or run any external AO runtime",
      "create a branch, worktree, push, PR, GitHub issue, or GitHub Action",
      "change dependencies, package manifests, or package locks",
    ],
    allowedCommands: ["git diff --check"],
    validationCommands: ["git diff --check"],
    reviewerTasks: [],
    liveValidation: {
      mode: "none",
      commands: [],
    },
    approval: {
      state: "approved",
      freshRequired: true,
    },
    maxChildRuns: 1,
    maxMinutes: 5,
    commitPolicy: {
      autoCommit: true,
      message: "chore: add mission follow-up artifact",
    },
    handoffPolicy: {
      required: true,
      path: ".codex/handoff.md",
    },
    stopGates: [
      "dirty-git-before-execution",
      "missing-exact-fresh-approval",
      "validation-failed",
      "context-pressure",
      "unplanned-path-change",
      "handoff-stale",
      "ao-runtime-requested",
      "live-cep-ae-requested",
      "local-ollama-openrouter-deterministic-fallback-requested",
    ],
    status: "queued",
  };
}

export async function missionRun(prepared) {
  assertMissionApproval(prepared);
  const runtime = createRuntime(prepared.cwd, prepared.options);
  const state = loadState(runtime, prepared.options);
  state.mission = true;
  state.missionSha256 = prepared.missionSha256;
  state.queuePath = prepared.queuePath;
  state.queueSha256 = prepared.queueSha256;
  writeState(runtime, state);
  recordMissionPhase(runtime, state, "intake", { source: prepared.source });
  const queueCreatedCommit = writeMissionQueueArtifact(prepared, runtime, state);
  recordMissionPhase(runtime, state, "plan_verified", {
    liveBindings: liveApprovalBindings(prepared.queue),
    queueSha256: prepared.queueSha256,
  });

  const startedAt = Date.now();
  const results = [];
  const followupsUsed = new Set();
  let completedPrimaryItems = 0;
  let stopReason = null;
  while (completedPrimaryItems < prepared.maxItems) {
    const elapsedMinutes = (Date.now() - startedAt) / 60000;
    if (elapsedMinutes >= prepared.maxMinutes) {
      stopReason = "max-minutes";
      break;
    }
    const next = selectableItems(prepared.queue, state.completedItems)[0];
    if (!next) {
      stopReason = "no-ready-items";
      break;
    }
    try {
      const result = await executeQueueItem(prepared.cwd, runtime, state, prepared.queue, next, prepared.options, true);
      results.push(result);
      completedPrimaryItems += 1;
    } catch (error) {
      if (!followupsUsed.has(next.id) && missionFailureAllowsFollowup(error)) {
        const followup = buildMissionFollowupItem(runtime, next);
        const followupQueue = {
          ...prepared.queue,
          queueItems: [...prepared.queue.queueItems, followup],
        };
        validateQueue(followupQueue);
        recordMissionPhase(runtime, state, "followup_running", { item: next.id, followup: followup.id });
        const followupResult = await executeQueueItem(
          prepared.cwd,
          runtime,
          state,
          followupQueue,
          followup,
          prepared.options,
          true,
        );
        results.push({ ...followupResult, followupFor: next.id });
        followupsUsed.add(next.id);
        continue;
      }
      if (!state.failedItems.includes(next.id)) {
        state.failedItems.push(next.id);
      }
      state.updatedAt = new Date().toISOString();
      writeState(runtime, state);
      recordMissionPhase(runtime, state, "stopped", { error: error.message, item: next.id });
      throw error;
    }
  }
  if (!stopReason) {
    stopReason = completedPrimaryItems >= prepared.maxItems ? "max-items" : "completed";
  }
  recordMissionPhase(runtime, state, "stopped", { stopReason });
  const report = {
    completedItems: state.completedItems,
    completedPrimaryItems,
    followupsUsed: Array.from(followupsUsed),
    maxItems: prepared.maxItems,
    maxMinutes: prepared.maxMinutes,
    missionSha256: prepared.missionSha256,
    mode: "mission-run",
    ok: true,
    queueCreatedCommit,
    queuePath: prepared.queuePath,
    queueSha256: prepared.queueSha256,
    results,
    sessionId: runtime.sessionId,
    statePath: normalizeRepoPath(path.relative(prepared.cwd, runtime.statePath)),
    stopReason,
  };
  report.finalReportPath = writeFinalReport(runtime, report);
  return report;
}

function printResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Mode: ${result.mode}`);
  console.log(`Queue: ${result.queuePath}`);
  if (result.sessionId) {
    console.log(`Session: ${result.sessionId}`);
  }
  if (result.approvalText) {
    console.log(`Approval text: ${result.approvalText}`);
  }
  if (result.results) {
    console.log(`Completed: ${result.results.map((item) => item.item).join(", ") || "(none)"}`);
  }
  if (result.stopReason) {
    console.log(`Stop reason: ${result.stopReason}`);
  }
  if (result.finalReportPath) {
    console.log(`Final report: ${result.finalReportPath}`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const prepared = prepareRun(argv);
  if (prepared.help) {
    console.log(HELP.trim());
    return;
  }
  let result;
  if (prepared.mode === "planOnly") {
    result = planOnlyEnvelope(prepared);
  } else if (prepared.mode === "missionPlanOnly") {
    result = missionPlanOnlyEnvelope(prepared);
  } else if (prepared.mode === "liveCheck") {
    result = liveCheck(prepared);
  } else if (prepared.mode === "executeOne") {
    result = await executeOne(prepared);
  } else if (prepared.mode === "missionRun") {
    result = await missionRun(prepared);
  } else {
    result = await runUntilBudget(prepared);
  }
  printResult(result, prepared.options.json);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

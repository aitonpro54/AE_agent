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

const HELP = `
AE Agent roadmap supervisor

Usage:
  node orchestrator/run-ae-agent-roadmap-supervisor.mjs --plan-only --queue <path> --max-items <n> --json
  node orchestrator/run-ae-agent-roadmap-supervisor.mjs --live-check --json
  node orchestrator/run-ae-agent-roadmap-supervisor.mjs --execute-one --item <id> --approval-text "<exact text>"
  node orchestrator/run-ae-agent-roadmap-supervisor.mjs --run-until-budget --max-items <n> --max-minutes <m> --reviewers parallel --approval-text "<exact text>"

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
  --require-live-connectivity
                             Run read-only AE/CEP connectivity before writer work.
  --tail-lines <n>           Failure tail lines. Default ${DEFAULT_TAIL_LINES}.
  --json                     Print machine-readable output.
  --help                     Show this help.

The supervisor is deterministic control-plane code. Writer children run one
approved milestone at a time through direct roadmap SDK, bounded runners, or
smoke fixtures. Reviewer children are read-only, and push/dependency/live/CEP/
external-provider work is rejected unless a future queue item adds its own
narrow approval lane.
`;

const VALUE_OPTIONS = new Set([
  "approval-text",
  "engine",
  "item",
  "live-approval-text",
  "log-dir",
  "max-items",
  "max-minutes",
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

function uniqueSorted(values) {
  return Array.from(new Set(values.map(normalizeRepoPath))).sort();
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
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
  for (const item of queue.queueItems) {
    for (const field of [
      "id",
      "milestone",
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
    if (!Number.isInteger(item.milestone) || item.milestone < previousMilestone) {
      throw new Error(`Queue milestone ordering is invalid at ${item.id}.`);
    }
    previousMilestone = item.milestone;
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

function ensureMode(options) {
  const modes = ["planOnly", "liveCheck", "executeOne", "runUntilBudget"].filter((key) => options[key]);
  if (options.help) {
    return "help";
  }
  if (modes.length !== 1) {
    throw new Error("Select exactly one mode: --plan-only, --live-check, --execute-one, or --run-until-budget.");
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

function runShellCommand(cwd, command, timeoutMs = 120000) {
  const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-lc", command];
  const shell = process.platform === "win32" ? "cmd.exe" : "sh";
  return spawnSync(shell, args, {
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
    milestone: item.milestone,
    plannedPaths: item.plannedPaths,
    title: item.title,
    validationCommands: item.validationCommands,
  };
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

function runWriterChild(cwd, runtime, item, engine) {
  const logPath = path.join(runtime.childDir, `${safeSessionToken(item.id)}.log`);
  if (item.runner.kind === "fixture") {
    const result = runFixtureWriter(cwd, item);
    writeLog(logPath, result);
    return { ...result, logPath };
  }
  if (item.runner.kind === "roadmap-sdk") {
    const result = runRoadmapSdkWriter(cwd, item);
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

function runReviewerProcess(cwd, runtime, item, task, index, engine) {
  const logPath = path.join(runtime.reviewerDir, `${safeSessionToken(item.id)}-${index + 1}.log`);
  if (task.kind === "noop") {
    const result = {
      status: 0,
      stdout: `noop reviewer ${task.id || index + 1} used read-only contract\n`,
      stderr: "",
    };
    writeLog(logPath, result);
    return Promise.resolve({ ...result, id: task.id || `reviewer-${index + 1}`, logPath, readOnly: true });
  }

  const prompt = [
    "Read-only reviewer for AE Agent roadmap supervisor.",
    "Do not edit files, run mutating commands, install packages, push, or create a PR.",
    task.prompt || `Review queue item ${item.id} for blocking risks.`,
  ].join("\n");
  const command = engine === "cli" ? "cmd.exe" : process.execPath;
  const args = engine === "cli"
    ? ["/d", "/s", "/c", "codex", "exec", "--cd", cwd, "--sandbox", "read-only", "--ephemeral", "-c", "approval_policy=\"never\"", "-"]
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

  return new Promise((resolve) => {
    const child = spawn(command, args, {
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
    if (engine === "cli") {
      child.stdin.end(prompt);
    }
    child.on("close", (status, signal) => {
      const result = { status, signal, stdout, stderr };
      writeLog(logPath, result);
      resolve({ ...result, id: task.id || `reviewer-${index + 1}`, logPath, readOnly: true });
    });
  });
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
      throw new Error(`Read-only reviewer failed for ${item.id}: ${result.id}`);
    }
    if (item.reviewerBlocking === true && /\b(CRITICAL|BLOCKING)\b/i.test(output)) {
      throw new Error(`Read-only reviewer reported a blocking finding for ${item.id}: ${result.id}`);
    }
  }
  return results.map((result) => ({
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
    .filter((repoPath) => existsSync(path.join(cwd, repoPath)));
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
  appendEvent(runtime, { item: item.id, type: "item-started" });
  const preflightLiveResults = options.requireLiveConnectivity
    ? runLiveConnectivityCheck(cwd, runtime)
    : [];
  const reviewerResults = await runReviewers(cwd, runtime, item, options.reviewers || "none", options.engine || "sdk");
  const childResult = runWriterChild(cwd, runtime, item, options.engine || "sdk");
  if (childResult.error || childResult.status !== 0) {
    throw new Error(
      `Writer child failed for ${item.id}: ${normalizeRepoPath(path.relative(cwd, childResult.logPath))}\n${tailLines(childResult.stderr || childResult.stdout, options.tailLines)}`,
    );
  }
  const preValidationChanges = assertChangedPathsAllowed(cwd, item.plannedPaths);
  const validationResults = runValidationCommands(cwd, runtime, item);
  const itemLiveValidationResults = runItemLiveValidation(cwd, runtime, queue, item, options);
  const preCommitChanges = assertChangedPathsAllowed(cwd, item.plannedPaths);
  if (item.handoffPolicy.required === true) {
    const handoffPath = normalizeRepoPath(item.handoffPolicy.path);
    if (!item.plannedPaths.map(normalizeRepoPath).includes(handoffPath)) {
      throw new Error(`Required handoff path is not in plannedPaths for ${item.id}: ${handoffPath}`);
    }
    if (!preCommitChanges.workingTreeChangedPaths.includes(handoffPath)) {
      throw new Error(`Required handoff was not updated for ${item.id}: ${handoffPath}`);
    }
  }
  const commitId = stageAndCommit(cwd, item);
  const postRun = assertChangedPathsAllowed(cwd, item.plannedPaths, preHead);
  if (!state.completedItems.includes(item.id)) {
    state.completedItems.push(item.id);
  }
  state.lastCommitId = commitId;
  state.updatedAt = new Date().toISOString();
  writeState(runtime, state);
  appendEvent(runtime, { commitId, item: item.id, type: "item-completed" });
  return {
    changedPaths: postRun.changedPaths,
    childLogPath: normalizeRepoPath(path.relative(cwd, childResult.logPath)),
    commitId,
    item: item.id,
    itemLiveValidationResults,
    liveConnectivityResults: preflightLiveResults,
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
      maxChildRuns: item.maxChildRuns,
      milestone: item.milestone,
      plannedPaths: item.plannedPaths,
      reviewerTasks: item.reviewerTasks.length,
      liveValidationMode: (item.liveValidation || { mode: "none" }).mode,
      status: item.status,
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
  } else if (prepared.mode === "liveCheck") {
    result = liveCheck(prepared);
  } else if (prepared.mode === "executeOne") {
    result = await executeOne(prepared);
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

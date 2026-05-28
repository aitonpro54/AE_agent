#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import boundedProcess from "./bounded-process-result.cjs";

const DEFAULT_QUEUE_PATH =
  ".codex-audit/sdk-feature-conveyor/184-dakkshin-intake-feature-queue.json";
const DEFAULT_EXECUTION_LOG_DIR = ".codex-runtime/sdk/feature-conveyor-logs";
const DEFAULT_LIVE_VALIDATION_LOG_DIR = ".codex-runtime/sdk/feature-conveyor-live-logs";
const DEFAULT_LIVE_VALIDATION_REPORT_DIR = ".codex-runtime/sdk/feature-conveyor-live-reports";
const DEFAULT_TAIL_LINES = 80;
const CHILD_OUTPUT_MAX_BUFFER_BYTES = 50 * 1024 * 1024;
const LIVE_VALIDATION_CHILD_TIMEOUT_MS = 20 * 60 * 1000;
const { boundedSpawnSyncResult, writeProcessLog } = boundedProcess;

export const EXECUTE_APPROVAL_TEXT =
  "I approve one SDK feature conveyor workspace-write run for the selected queued feature item planned paths only";
export const CLI_EXECUTE_APPROVAL_TEXT =
  "I approve one Codex CLI feature conveyor workspace-write run for the selected queued feature item planned paths only";
export const LIVE_VALIDATION_APPROVAL_TEXT =
  "I approve one M188 staged live AE validation run for M187 advisory recipes using generated-only mutations";
export const M190_LIVE_VALIDATION_APPROVAL_TEXT =
  "I approve one M190 Full UI Agent live conveyor validation run for new typed tools using OpenAI CLI and generated-only mutations";
export const M191_LIVE_VALIDATION_APPROVAL_TEXT =
  "I approve one M191 live CEP AE validation run for generated-only mask safety checks inside After Effects";
export const M198_LIVE_VALIDATION_APPROVAL_TEXT =
  "I approve one M198 live CEP AE validation run for generated-only marker lifecycle checks using OpenAI CLI";
export const M207_LIVE_VALIDATION_APPROVAL_TEXT =
  "I approve one M207 live CEP AE validation run for generated-only bulk selected layer duplicate checks using OpenAI CLI";

const HELP = `
AE Agent feature conveyor runner

Usage:
  node orchestrator/run-ae-agent-feature-conveyor.mjs --all
  node orchestrator/run-ae-agent-feature-conveyor.mjs --item m185-dakkshin-intake-scope-brief
  node orchestrator/run-ae-agent-feature-conveyor.mjs --item <future-approved-item> --execute-sdk --approval-text "${EXECUTE_APPROVAL_TEXT}"
  node orchestrator/run-ae-agent-feature-conveyor.mjs --item <future-approved-item> --engine cli --execute --approval-text "${CLI_EXECUTE_APPROVAL_TEXT}"
  node orchestrator/run-ae-agent-feature-conveyor.mjs --item m188-dakkshin-advisory-field-validation --validate-live --stage both --allow-mutating-live --approval-text "${LIVE_VALIDATION_APPROVAL_TEXT}"
  node orchestrator/run-ae-agent-feature-conveyor.mjs --item m190-full-ui-agent-new-tools-validation --validate-live --stage both --allow-mutating-live --approval-text "${M190_LIVE_VALIDATION_APPROVAL_TEXT}"
  node orchestrator/run-ae-agent-feature-conveyor.mjs --item m191-mask-safety-live-validation --validate-live --stage both --allow-mutating-live --approval-text "${M191_LIVE_VALIDATION_APPROVAL_TEXT}"
  node orchestrator/run-ae-agent-feature-conveyor.mjs --item m198-marker-lifecycle-live-validation --validate-live --stage both --allow-mutating-live --approval-text "${M198_LIVE_VALIDATION_APPROVAL_TEXT}"
  node orchestrator/run-ae-agent-feature-conveyor.mjs --item m207-duplicate-layers-live-validation --validate-live --stage both --allow-mutating-live --approval-text "${M207_LIVE_VALIDATION_APPROVAL_TEXT}"

Options:
  --queue <path>             Queue artifact path. Defaults to M184 feature queue.
  --item <id>                Select one queue item. Repeatable for dry-run preview.
  --all                      Select all queue items in queue order.
  --engine <sdk|cli>         Future execution backend. Default: sdk.
  --execute                  Start one AI workspace-write turn with the selected engine.
  --execute-sdk              Start one workspace-write Codex SDK turn.
  --validate-live            Run the M188 staged local live-validation lane. Does not create SDKThread/Codex child runs.
  --stage <read-only|mutating|both>
                             Live-validation stage. Default: both.
  --allow-mutating-live      Required with exact approval text for mutating live stage.
  --dry-run                  With --validate-live, print planned local validation commands without running them.
  --approval-text <text>     Required exact approval text for execution.
  --model <name>             Optional Codex model override.
  --reasoning <effort>       minimal, low, medium, high, or xhigh. Default: high.
  --codex-path <path>        Optional Codex executable override for SDK runner.
  --log-dir <path>           Full child stdout/stderr log directory.
                             Must stay under .codex-runtime/.
                             Default: ${DEFAULT_EXECUTION_LOG_DIR}
  --tail-lines <n>           Failure tail lines printed to terminal. Default: ${DEFAULT_TAIL_LINES}.
  --stream-output            Debug escape hatch: print captured child output after run.
  --json                     Print machine-readable dry-run/execution metadata.
  --help                     Show this help.

M184 dry-run never starts an SDK thread or Codex CLI session. Execution is also
fail-closed for the current Dakkshin intake queue: each item has
executionApprovalState:"pending-explicit-approval" and maxAiTurns:0. A future
milestone must approve exactly one item before this runner can start an AI turn.
Live validation is separate from SDK workspace-write execution: it runs local
validation commands only and fails closed when AE/CEP/bridge/project preflight is
not ready. M188 never runs external-provider/OpenAI CLI planner validation; M190,
M191, M198, and M207 use only the OpenAI CLI Full UI Agent path and do not run
deterministic, Ollama, OpenRouter, or local-provider fallbacks.
`;

const VALUE_OPTIONS = new Set([
  "approval-text",
  "codex-path",
  "engine",
  "item",
  "log-dir",
  "model",
  "queue",
  "reasoning",
  "stage",
  "tail-lines",
]);
const BOOLEAN_OPTIONS = new Set([
  "allow-mutating-live",
  "all",
  "dry-run",
  "execute",
  "execute-sdk",
  "help",
  "json",
  "stream-output",
  "validate-live",
]);

function splitInlineOption(raw) {
  const equalsIndex = raw.indexOf("=");
  if (equalsIndex === -1) {
    return { inlineValue: undefined, name: raw };
  }
  return {
    inlineValue: raw.slice(equalsIndex + 1),
    name: raw.slice(0, equalsIndex),
  };
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function parseArgs(argv) {
  const options = { items: [] };

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

    if (name === "item") {
      options.items.push(value);
    } else if (name === "engine") {
      if (!["sdk", "cli"].includes(value)) {
        throw new Error(`Invalid value for --engine: ${value}. Expected sdk or cli.`);
      }
      options.engine = value;
    } else if (name === "stage") {
      if (!["read-only", "mutating", "both"].includes(value)) {
        throw new Error(`Invalid value for --stage: ${value}. Expected read-only, mutating, or both.`);
      }
      options.stage = value;
    } else if (name === "tail-lines") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
        throw new Error(`Invalid value for --tail-lines: ${value}. Expected 1..1000.`);
      }
      options.tailLines = parsed;
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
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function readQueue(cwd, queuePath) {
  const resolvedCwd = path.resolve(cwd);
  const resolved = path.resolve(resolvedCwd, queuePath);
  if (!resolved.startsWith(`${resolvedCwd}${path.sep}`)) {
    throw new Error(`Queue path must stay inside repository: ${queuePath}`);
  }
  return JSON.parse(readFileSync(resolved, "utf8"));
}

function normalizeRuntimeLogDirectory(cwd, logDir = DEFAULT_EXECUTION_LOG_DIR) {
  const normalized = normalizeRepoPath(logDir).replace(/\/+$/, "");
  if (
    normalized === "" ||
    normalized === "." ||
    normalized.startsWith("../") ||
    /^[A-Za-z]:\//.test(normalized) ||
    path.isAbsolute(logDir)
  ) {
    throw new Error(`Execution log directory must stay inside repository: ${logDir}`);
  }
  if (normalized !== ".codex-runtime" && !normalized.startsWith(".codex-runtime/")) {
    throw new Error(`Execution log directory must stay under .codex-runtime/: ${logDir}`);
  }

  const resolvedCwd = path.resolve(cwd);
  const resolved = path.resolve(resolvedCwd, normalized);
  if (!resolved.startsWith(`${resolvedCwd}${path.sep}`)) {
    throw new Error(`Execution log directory must stay inside repository: ${logDir}`);
  }
  return normalized;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.map(normalizeRepoPath))).sort();
}

function selectQueueItems(queue, options) {
  if (options.all && options.items.length > 0) {
    throw new Error("Use either --all or --item, not both.");
  }

  if (options.all) {
    return queue.queueItems;
  }

  if (options.items.length === 0) {
    throw new Error("Select feature queue work with --all or --item <id>.");
  }

  return options.items.map((id) => {
    const item = queue.queueItems.find((entry) => entry.id === id);
    if (!item) {
      throw new Error(`Unknown feature queue item: ${id}`);
    }
    return item;
  });
}

function validateSelectedItems(items, options = {}) {
  for (const item of items) {
    if (item.status !== "queued") {
      throw new Error(`Feature queue item is not queued: ${item.id}`);
    }
    const allowedModes = options.validateLive ? ["local-live-validation"] : ["local-only", "local-live-validation"];
    if (!allowedModes.includes(item.mode)) {
      throw new Error(`Feature queue item mode is not allowed for this runner mode: ${item.id}`);
    }
    if (!Array.isArray(item.plannedPaths) || item.plannedPaths.length === 0) {
      throw new Error(`Feature queue item has no planned paths: ${item.id}`);
    }
  }
}

function assertExecutionApproved(prepared) {
  const expectedApproval =
    prepared.engine === "cli" ? CLI_EXECUTE_APPROVAL_TEXT : EXECUTE_APPROVAL_TEXT;
  if (prepared.options.approvalText !== expectedApproval) {
    throw new Error(`Missing exact --approval-text: ${expectedApproval}`);
  }
  if (prepared.selectedItems.length !== 1) {
    throw new Error("Feature conveyor execution requires exactly one selected queue item.");
  }

  const item = prepared.selectedItems[0];
  if (item.executionApprovalState !== "approved" || item.maxAiTurns !== 1) {
    throw new Error(
      `Feature conveyor execution is not approved for ${item.id}: executionApprovalState=${item.executionApprovalState}, maxAiTurns=${item.maxAiTurns}`,
    );
  }
}

function liveStageIncludesMutating(stage) {
  return stage === "mutating" || stage === "both";
}

function selectedLiveValidationItem(prepared) {
  if (prepared.selectedItems.length !== 1) {
    throw new Error("Live validation requires exactly one selected queue item.");
  }
  const item = prepared.selectedItems[0];
  if (item.mode !== "local-live-validation") {
    throw new Error(`Live validation can only run local-live-validation queue items, not ${item.id}.`);
  }
  if (!item.liveValidation || item.liveValidation.approvalState !== "approved") {
    throw new Error(`Live validation is not approved in the queue item: ${item.id}.`);
  }
  return item;
}

function assertLiveValidationSelection(prepared) {
  selectedLiveValidationItem(prepared);
}

function liveValidationBlockedBy(prepared) {
  const blocked = [];
  if (prepared.selectedItems.length !== 1 || prepared.selectedItems[0].mode !== "local-live-validation") {
    blocked.push("local-live-validation-item-not-selected");
  }
  const item = prepared.selectedItems[0] || {};
  if (!item.liveValidation || item.liveValidation.approvalState !== "approved") {
    blocked.push("per-item-live-validation-approval-missing");
  }
  if (liveStageIncludesMutating(prepared.liveStage)) {
    const expectedApprovalText = item.liveValidation && item.liveValidation.approvalText
      ? item.liveValidation.approvalText
      : LIVE_VALIDATION_APPROVAL_TEXT;
    if (prepared.options.allowMutatingLive !== true) {
      blocked.push("allow-mutating-live-flag-missing");
    }
    if (prepared.options.approvalText !== expectedApprovalText) {
      blocked.push("exact-mutating-live-approval-text-missing");
    }
  }
  return blocked;
}

function assertLiveValidationApproved(prepared) {
  assertLiveValidationSelection(prepared);
  const blocked = liveValidationBlockedBy(prepared);
  if (blocked.length > 0) {
    if (blocked.includes("exact-mutating-live-approval-text-missing")) {
      const item = prepared.selectedItems[0] || {};
      const expectedApprovalText = item.liveValidation && item.liveValidation.approvalText
        ? item.liveValidation.approvalText
        : LIVE_VALIDATION_APPROVAL_TEXT;
      throw new Error(`Missing exact --approval-text: ${expectedApprovalText}`);
    }
    throw new Error(`Live validation is blocked: ${blocked.join(", ")}`);
  }
}

function gitStatus(cwd) {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git status failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
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
    const stat = statSync(currentAbsolute);
    if (stat.isFile()) {
      found.push(normalizeRepoPath(current));
      continue;
    }
    for (const entry of readdirSync(currentAbsolute, { withFileTypes: true })) {
      stack.push(normalizeRepoPath(path.posix.join(current, entry.name)));
    }
  }
  return found.sort();
}

function collectActualChangedPaths(cwd, statusLines) {
  const paths = [];
  for (const line of statusLines) {
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

export function validatePostRunChanges(cwd, plannedPaths, preHead) {
  const statusLines = gitStatus(cwd);
  const workingTreeChangedPaths = collectActualChangedPaths(cwd, statusLines);
  const postHead = preHead ? gitHead(cwd) : null;
  const committedChangedPaths = collectCommittedChangedPaths(cwd, preHead, postHead);
  const actualChangedPaths = uniqueSorted([...workingTreeChangedPaths, ...committedChangedPaths]);
  const allowed = new Set(plannedPaths);
  const outOfScope = actualChangedPaths.filter((repoPath) => !allowed.has(repoPath));
  if (outOfScope.length > 0) {
    throw new Error(`Feature conveyor changed paths outside queue allowlist: ${outOfScope.join(", ")}`);
  }
  return {
    changedPaths: actualChangedPaths,
    committedChangedPaths,
    headChanged: Boolean(preHead && postHead && preHead !== postHead),
    postHead,
    preHead,
    workingTreeChangedPaths,
  };
}

function buildPrompt(queue, selectedItems, plannedPaths) {
  const itemSummaries = selectedItems.map((item, index) => ({
    order: index + 1,
    id: item.id,
    milestone: item.milestone,
    title: item.title,
    plannedPaths: item.plannedPaths,
    allowedActions: item.allowedActions,
    forbiddenActions: item.forbiddenActions,
    validationCommands: item.validationCommands,
    stopGates: item.stopGates,
  }));

  return [
    "You are running the AE Agent feature conveyor from the command line.",
    "Work in Russian for project docs and handoff text.",
    "Follow AGENTS.md. Preserve user changes. Do not push, create a PR, install packages, run live CEP/AE, run external providers, or enable CEP-panel SDK writes.",
    "This is one bounded workspace-write turn only if a future queue item explicitly approved execution. Edit only the planned paths listed below.",
    "For Dakkshin intake items, do not implement product behavior; write intake evidence, scope notes, and handoff only.",
    "Keep command output compact: summarize command results and save detailed logs to files when needed.",
    "The wrapper captures full child stdout/stderr into an ignored runtime log and enforces the post-run git path allowlist against both working-tree changes and commits created since pre-run HEAD.",
    "",
    `Queue artifact: ${DEFAULT_QUEUE_PATH}`,
    `Queue schema: ${queue.schema}`,
    "",
    "Planned path allowlist:",
    ...plannedPaths.map((repoPath) => `- ${repoPath}`),
    "",
    "Selected feature queue items:",
    JSON.stringify(itemSummaries, null, 2),
    "",
    "Required end state:",
    "- Complete only the selected feature intake item as far as its allowedActions permit.",
    "- Keep active AE Agent runtime behavior unchanged unless a future item explicitly approves product implementation.",
    "- Keep CEP-panel SDK writes, live CEP/AE, external-provider/OpenAI CLI planner, mutating-live validation, dependency changes, push, and PR out of scope.",
    "- Update validation/handoff notes if those files are in the planned path allowlist.",
    "- If blocked, write the blocker into the planned docs instead of touching unplanned files.",
  ].join("\n");
}

function buildSdkCommand(options, prompt) {
  const args = [
    "orchestrator/codex-sdk-orchestrator.mjs",
    "--cwd",
    process.cwd(),
    "--sandbox",
    "workspace-write",
    "--approval",
    "never",
    "--web-search",
    "disabled",
    "--reasoning",
    options.reasoning || "high",
    "--prompt",
    prompt,
  ];

  if (options.model) {
    args.splice(args.length - 2, 0, "--model", options.model);
  }
  if (options.codexPath) {
    args.splice(args.length - 2, 0, "--codex-path", options.codexPath);
  }

  return args;
}

function buildCliCommand(options) {
  const args = [
    "exec",
    "--cd",
    process.cwd(),
    "--sandbox",
    "workspace-write",
    "--ephemeral",
    "-c",
    "approval_policy=\"never\"",
  ];

  if (options.model) {
    args.push("--model", options.model);
  }

  args.push("-");
  return args;
}

function renderCommandLine(command, args) {
  return [command, ...args]
    .map((part) => (/\s|"/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part))
    .join(" ");
}

function sanitizeLogToken(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function createExecutionLogPath(cwd, prepared) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const itemToken =
    prepared.selectedItems.length === 1
      ? sanitizeLogToken(prepared.selectedItems[0].id)
      : `${prepared.selectedItems.length}-items`;
  const fileName = `${timestamp}-${prepared.engine}-${itemToken}.log`;
  const repoPath = normalizeRepoPath(path.posix.join(prepared.executionLogDirectory, fileName));
  const absolute = path.resolve(cwd, repoPath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  return { absolute, repoPath };
}

function normalizeChildOutput(value) {
  if (!value) {
    return "";
  }
  return typeof value === "string" ? value : value.toString("utf8");
}

function tailLines(value, maxLines) {
  const output = normalizeChildOutput(value).trimEnd();
  if (!output) {
    return "";
  }
  return output.split(/\r?\n/).slice(-maxLines).join("\n").trim();
}

function formatExecutionLog({ commandLine, prepared, result }) {
  const stdout = normalizeChildOutput(result.stdout);
  const stderr = normalizeChildOutput(result.stderr);
  const error = result.error ? result.error.message : "";
  return [
    "# AE Agent feature conveyor execution log",
    "",
    `createdAt: ${new Date().toISOString()}`,
    `engine: ${prepared.engine}`,
    `items: ${prepared.selectedItems.map((item) => item.id).join(", ")}`,
    `queuePath: ${prepared.queuePath}`,
    `status: ${result.status}`,
    `signal: ${result.signal || ""}`,
    `error: ${error}`,
    `command: ${commandLine}`,
    "",
    "## stdout",
    "",
    stdout || "(empty)",
    "",
    "## stderr",
    "",
    stderr || "(empty)",
    "",
  ].join("\n");
}

function writeExecutionLog(cwd, prepared, commandLine, result) {
  const logPath = createExecutionLogPath(cwd, prepared);
  writeFileSync(logPath.absolute, formatExecutionLog({ commandLine, prepared, result }), "utf8");
  return logPath;
}

function compactExecutionResult(result, commandLine, logPath, tailLinesCount) {
  const bounded = boundedSpawnSyncResult(result, {
    command: commandLine,
    completedAt: new Date().toISOString(),
    durationMs: result.durationMs ?? null,
    label: "feature-conveyor-child",
    logPath: logPath.repoPath,
    startedAt: null,
    tailLines: tailLinesCount || DEFAULT_TAIL_LINES,
  });
  return {
    error: result.error,
    logPath: logPath.repoPath,
    signal: result.signal || null,
    status: result.status,
    stderrBytes: bounded.stderr.bytes,
    stderrTail: bounded.stderr.tail,
    stderrTruncated: bounded.stderr.truncated,
    stdoutBytes: bounded.stdout.bytes,
    stdoutTail: bounded.stdout.tail,
    stdoutTruncated: bounded.stdout.truncated,
    timedOut: bounded.timedOut,
  };
}

function runChildProcess(prepared, cwd) {
  if (prepared.engine === "cli") {
    const args = ["/d", "/s", "/c", "codex", ...buildCliCommand(prepared.options)];
    return {
      commandLine: renderCommandLine("cmd.exe", args),
      result: spawnSync("cmd.exe", args, {
        cwd,
        encoding: "utf8",
        input: prepared.prompt,
        maxBuffer: CHILD_OUTPUT_MAX_BUFFER_BYTES,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30 * 60 * 1000,
      }),
    };
  }

  const args = buildSdkCommand(prepared.options, prepared.prompt);
  return {
    commandLine: renderCommandLine(process.execPath, args),
    result: spawnSync(process.execPath, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: CHILD_OUTPUT_MAX_BUFFER_BYTES,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30 * 60 * 1000,
    }),
  };
}

function liveValidationCommands(prepared) {
  const item = selectedLiveValidationItem(prepared);
  if (item.id === "m207-duplicate-layers-live-validation") {
    const commands = [];
    if (prepared.liveStage === "read-only" || prepared.liveStage === "both") {
      commands.push({
        id: "m207-live-cep-inspect",
        stage: "read-only",
        command: process.execPath,
        args: [
          path.join("scripts", "cep-panel-cdp-smoke.js"),
          "inspect"
        ],
        timeoutMs: LIVE_VALIDATION_CHILD_TIMEOUT_MS
      });
    }
    if (prepared.liveStage === "mutating" || prepared.liveStage === "both") {
      commands.push({
        id: "m207-full-ui-agent-openai-cli-duplicate-layers-smoke",
        stage: "mutating",
        command: process.execPath,
        args: [
          path.join("scripts", "cep-panel-cdp-smoke.js"),
          "full-ui-agent-duplicate-layers-openai-cli-smoke"
        ],
        timeoutMs: LIVE_VALIDATION_CHILD_TIMEOUT_MS
      });
    }
    return commands;
  }

  if (item.id === "m198-marker-lifecycle-live-validation") {
    const commands = [];
    if (prepared.liveStage === "read-only" || prepared.liveStage === "both") {
      commands.push({
        id: "m198-live-cep-inspect",
        stage: "read-only",
        command: process.execPath,
        args: [
          path.join("scripts", "cep-panel-cdp-smoke.js"),
          "inspect"
        ],
        timeoutMs: LIVE_VALIDATION_CHILD_TIMEOUT_MS
      });
    }
    if (prepared.liveStage === "mutating" || prepared.liveStage === "both") {
      commands.push({
        id: "m198-full-ui-agent-openai-cli-marker-lifecycle-smoke",
        stage: "mutating",
        command: process.execPath,
        args: [
          path.join("scripts", "cep-panel-cdp-smoke.js"),
          "full-ui-agent-marker-lifecycle-openai-cli-smoke"
        ],
        timeoutMs: LIVE_VALIDATION_CHILD_TIMEOUT_MS
      });
    }
    return commands;
  }

  if (item.id === "m191-mask-safety-live-validation") {
    const commands = [];
    if (prepared.liveStage === "read-only" || prepared.liveStage === "both") {
      commands.push({
        id: "m191-live-cep-inspect",
        stage: "read-only",
        command: process.execPath,
        args: [
          path.join("scripts", "cep-panel-cdp-smoke.js"),
          "inspect"
        ],
        timeoutMs: LIVE_VALIDATION_CHILD_TIMEOUT_MS
      });
    }
    if (prepared.liveStage === "mutating" || prepared.liveStage === "both") {
      commands.push({
        id: "m191-full-ui-agent-openai-cli-mask-safety-smoke",
        stage: "mutating",
        command: process.execPath,
        args: [
          path.join("scripts", "cep-panel-cdp-smoke.js"),
          "full-ui-agent-mask-safety-openai-cli-smoke"
        ],
        timeoutMs: LIVE_VALIDATION_CHILD_TIMEOUT_MS
      });
    }
    return commands;
  }

  if (item.id === "m190-full-ui-agent-new-tools-validation") {
    const commands = [];
    if (prepared.liveStage === "read-only" || prepared.liveStage === "both") {
      commands.push({
        id: "m190-live-cep-inspect",
        stage: "read-only",
        command: process.execPath,
        args: [
          path.join("scripts", "cep-panel-cdp-smoke.js"),
          "inspect"
        ],
        timeoutMs: LIVE_VALIDATION_CHILD_TIMEOUT_MS
      });
    }
    if (prepared.liveStage === "mutating" || prepared.liveStage === "both") {
      commands.push({
        id: "m190-full-ui-agent-openai-cli-new-tools-smoke",
        stage: "mutating",
        command: process.execPath,
        args: [
          path.join("scripts", "cep-panel-cdp-smoke.js"),
          "full-ui-agent-new-tools-openai-cli-smoke"
        ],
        timeoutMs: LIVE_VALIDATION_CHILD_TIMEOUT_MS
      });
    }
    return commands;
  }

  if (item.id !== "m188-dakkshin-advisory-field-validation") {
    throw new Error(`No live validation command plan is registered for ${item.id}.`);
  }

  const commands = [];
  if (prepared.liveStage === "read-only" || prepared.liveStage === "both") {
    commands.push({
      id: "read-only-live-reliability",
      stage: "read-only",
      command: process.execPath,
      args: [
        path.join("scripts", "reliability-validation-suite.js"),
        "read-only-live",
        "--write-report",
        "--stop-on-fail"
      ],
      timeoutMs: LIVE_VALIDATION_CHILD_TIMEOUT_MS
    });
    commands.push({
      id: "m187-read-only-field-smoke",
      stage: "read-only",
      command: process.execPath,
      args: [
        path.join("scripts", "m187-advisory-field-smoke.js"),
        "read-only",
        "--json"
      ],
      timeoutMs: LIVE_VALIDATION_CHILD_TIMEOUT_MS
    });
  }
  if (prepared.liveStage === "mutating" || prepared.liveStage === "both") {
    commands.push({
      id: "m187-generated-mutating-field-smoke",
      stage: "mutating",
      command: process.execPath,
      args: [
        path.join("scripts", "m187-advisory-field-smoke.js"),
        "mutating",
        "--json"
      ],
      timeoutMs: LIVE_VALIDATION_CHILD_TIMEOUT_MS
    });
    commands.push({
      id: "mutating-live-local-reliability",
      stage: "mutating",
      command: process.execPath,
      args: [
        path.join("scripts", "reliability-validation-suite.js"),
        "mutating-live-local",
        "--allow-mutating-live",
        "--write-report",
        "--stop-on-fail"
      ],
      timeoutMs: LIVE_VALIDATION_CHILD_TIMEOUT_MS
    });
  }
  return commands;
}

function createLiveValidationArtifactPath(cwd, prepared, directory, suffix) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const itemToken = sanitizeLogToken(prepared.selectedItems[0].id);
  const fileName = `${timestamp}-${itemToken}-${prepared.liveStage}.${suffix}`;
  const repoPath = normalizeRepoPath(path.posix.join(directory, fileName));
  const absolute = path.resolve(cwd, repoPath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  return { absolute, repoPath };
}

function commandResultSummary(command, result, logPath) {
  return {
    id: command.id,
    stage: command.stage,
    command: renderCommandLine(command.command, command.args),
    status: result.status,
    signal: result.signal || null,
    error: result.error ? result.error.message : null,
    durationMs: result.durationMs,
    logPath: logPath.repoPath,
    stdoutTail: tailLines(result.stdout, 60),
    stderrTail: tailLines(result.stderr, 60),
    ok: !result.error && result.status === 0
  };
}

function formatLiveValidationChildLog(command, result) {
  return [
    "# AE Agent feature conveyor live validation child log",
    "",
    `createdAt: ${new Date().toISOString()}`,
    `id: ${command.id}`,
    `stage: ${command.stage}`,
    `status: ${result.status}`,
    `signal: ${result.signal || ""}`,
    `error: ${result.error ? result.error.message : ""}`,
    `durationMs: ${result.durationMs}`,
    `command: ${renderCommandLine(command.command, command.args)}`,
    "",
    "## stdout",
    "",
    normalizeChildOutput(result.stdout) || "(empty)",
    "",
    "## stderr",
    "",
    normalizeChildOutput(result.stderr) || "(empty)",
    "",
  ].join("\n");
}

function runLiveValidationCommand(cwd, prepared, command) {
  const startedAt = Date.now();
  const result = spawnSync(command.command, command.args, {
    cwd,
    encoding: "utf8",
    maxBuffer: CHILD_OUTPUT_MAX_BUFFER_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: command.timeoutMs,
    windowsHide: true
  });
  result.durationMs = Date.now() - startedAt;
  const logPath = createLiveValidationArtifactPath(
    cwd,
    prepared,
    prepared.liveValidationLogDirectory,
    `${sanitizeLogToken(command.id)}.log`
  );
  writeFileSync(logPath.absolute, formatLiveValidationChildLog(command, result), "utf8");
  return commandResultSummary(command, result, logPath);
}

function writeLiveValidationReport(cwd, prepared, report) {
  const reportPath = createLiveValidationArtifactPath(
    cwd,
    prepared,
    prepared.liveValidationReportDirectory,
    "json"
  );
  writeFileSync(reportPath.absolute, JSON.stringify(report, null, 2) + "\n", "utf8");
  return reportPath;
}

function buildFailureTail(result, tailLineCount) {
  const stderrTail = result.stderrTail || tailLines(result.stderr, tailLineCount);
  const stdoutTail = result.stdoutTail || tailLines(result.stdout, tailLineCount);
  const sections = [];
  if (stderrTail) {
    sections.push(`stderr tail:\n${stderrTail}`);
  }
  if (stdoutTail) {
    sections.push(`stdout tail:\n${stdoutTail}`);
  }
  return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
}

function anyExecutionApproved(selectedItems) {
  return selectedItems.some(
    (item) => item.executionApprovalState === "approved" && item.maxAiTurns === 1,
  );
}

function printResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Queue: ${result.queuePath}`);
  console.log(`Items: ${result.items.join(", ")}`);
  console.log(`Mode: ${result.mode}`);
  if (result.status) {
    console.log(`Status: ${result.status}`);
  }
  if (result.executionApproved === false) {
    console.log("Execution approved: false");
  }
  if (result.liveValidationApproved === false) {
    console.log("Live validation approved: false");
  }
  if (result.liveValidationStage) {
    console.log(`Live validation stage: ${result.liveValidationStage}`);
  } else if (result.stage) {
    console.log(`Live validation stage: ${result.stage}`);
  }
  if (result.executionLogMode) {
    console.log(`Execution output: ${result.executionLogMode}`);
  }
  if (result.liveValidationReportPath) {
    console.log(`Live validation report: ${result.liveValidationReportPath}`);
  }
  if (result.logPath) {
    console.log(`Full execution log: ${result.logPath}`);
  } else if (result.executionLogDirectory) {
    console.log(`Execution log directory: ${result.executionLogDirectory}`);
  }
  if (result.liveValidationLogDirectory) {
    console.log(`Live validation log directory: ${result.liveValidationLogDirectory}`);
  }
  console.log("");
  console.log("Planned paths:");
  for (const repoPath of result.plannedPaths) {
    console.log(`- ${repoPath}`);
  }
  if (result.executeCommand) {
    console.log("");
    console.log("Future execute command:");
    console.log(result.executeCommand);
  }
  if (result.executeCliCommand) {
    console.log("");
    console.log("Future execute command via Codex CLI:");
    console.log(result.executeCliCommand);
  }
  if (result.plannedCommands) {
    console.log("");
    console.log("Planned live validation commands:");
    for (const command of result.plannedCommands) {
      console.log(`- ${command.id}: ${command.command}`);
    }
  }
  if (result.commands) {
    console.log("");
    console.log("Live validation commands:");
    for (const command of result.commands) {
      console.log(`- ${command.id}: ${command.ok ? "passed" : "failed"} (${command.logPath})`);
    }
  }
  if (result.changedPaths) {
    console.log("");
    console.log("Changed paths since pre-run HEAD:");
    for (const repoPath of result.changedPaths) {
      console.log(`- ${repoPath}`);
    }
  }
}

export function prepareRun(argv = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseArgs(argv);
  if (options.help) {
    return { help: true };
  }
  if (options.validateLive && (options.execute || options.executeSdk)) {
    throw new Error("--validate-live cannot be combined with --execute or --execute-sdk.");
  }
  if (options.validateLive && options.engine && options.engine !== "sdk") {
    throw new Error("--validate-live does not use --engine; it runs local validation commands only.");
  }

  const queuePath = options.queue || DEFAULT_QUEUE_PATH;
  const queue = readQueue(cwd, queuePath);
  const selectedItems = selectQueueItems(queue, options);
  validateSelectedItems(selectedItems, { validateLive: Boolean(options.validateLive) });

  const plannedPaths = uniqueSorted(selectedItems.flatMap((item) => item.plannedPaths));
  const prompt = buildPrompt(queue, selectedItems, plannedPaths);
  const executionLogDirectory = normalizeRuntimeLogDirectory(cwd, options.logDir);
  const liveValidationLogDirectory = normalizeRuntimeLogDirectory(cwd, options.logDir || DEFAULT_LIVE_VALIDATION_LOG_DIR);
  const liveValidationReportDirectory = normalizeRuntimeLogDirectory(cwd, DEFAULT_LIVE_VALIDATION_REPORT_DIR);
  const tailLineCount = options.tailLines || DEFAULT_TAIL_LINES;

  return {
    engine: options.engine || "sdk",
    executionApproved: anyExecutionApproved(selectedItems),
    executionLogDirectory,
    executeSdk: Boolean(options.executeSdk || options.execute),
    json: Boolean(options.json),
    liveStage: options.stage || "both",
    liveValidationLogDirectory,
    liveValidationReportDirectory,
    options,
    plannedPaths,
    prompt,
    queue,
    queuePath,
    selectedItems,
    tailLineCount,
    validateLive: Boolean(options.validateLive),
  };
}

export function dryRunEnvelope(prepared) {
  return {
    blockedBy: prepared.executionApproved
      ? []
      : ["per-item-feature-execution-approval-missing"],
    executeCommand: `npm.cmd run codex:orchestrator:ae-agent-feature-conveyor -- --item <future-approved-item> --execute-sdk --approval-text "${EXECUTE_APPROVAL_TEXT}"`,
    executeCliCommand: `npm.cmd run codex:orchestrator:ae-agent-feature-conveyor -- --item <future-approved-item> --engine cli --execute --approval-text "${CLI_EXECUTE_APPROVAL_TEXT}"`,
    engine: prepared.engine,
    executionApproved: prepared.executionApproved,
    executionLogDirectory: prepared.executionLogDirectory,
    executionLogMode: "log-file-on-execute",
    items: prepared.selectedItems.map((item) => item.id),
    mode: "dry-run",
    plannedPaths: prepared.plannedPaths,
    queuePath: prepared.queuePath,
    sdkThreadCreated: false,
    tailLines: prepared.tailLineCount,
  };
}

export function liveValidationDryRunEnvelope(prepared) {
  assertLiveValidationSelection(prepared);
  const blockedBy = liveValidationBlockedBy(prepared);
  const commands = liveValidationCommands(prepared).map((command) => ({
    id: command.id,
    stage: command.stage,
    command: renderCommandLine(command.command, command.args),
    timeoutMs: command.timeoutMs
  }));
  return {
    blockedBy,
    engine: "local-live-validation",
    executionApproved: false,
    items: prepared.selectedItems.map((item) => item.id),
    liveValidationApproved: blockedBy.length === 0,
    liveValidationLogDirectory: prepared.liveValidationLogDirectory,
    liveValidationReportDirectory: prepared.liveValidationReportDirectory,
    liveValidationStage: prepared.liveStage,
    mode: "live-validation-dry-run",
    plannedCommands: commands,
    plannedPaths: prepared.plannedPaths,
    queuePath: prepared.queuePath,
    sdkThreadCreated: false,
    tailLines: prepared.tailLineCount
  };
}

export function runFeatureConveyor(prepared, cwd = process.cwd()) {
  assertExecutionApproved(prepared);

  const preStatus = gitStatus(cwd);
  if (preStatus.length > 0) {
    throw new Error(`Refusing feature conveyor run with dirty git state: ${preStatus.join("; ")}`);
  }
  const preHead = gitHead(cwd);

  const { commandLine, result } = runChildProcess(prepared, cwd);
  const logPath = writeExecutionLog(cwd, prepared, commandLine, result);
  const compactResult = compactExecutionResult(result, commandLine, logPath, prepared.tailLineCount);

  if (prepared.options.streamOutput) {
    const stdout = normalizeChildOutput(result.stdout);
    const stderr = normalizeChildOutput(result.stderr);
    if (stdout) {
      process.stdout.write(stdout);
    }
    if (stderr) {
      process.stderr.write(stderr);
    }
  }

  const postRunChanges = validatePostRunChanges(cwd, prepared.plannedPaths, preHead);

  if (result.error) {
    throw new Error(
      `Codex feature conveyor run failed before completion: ${result.error.message}. Full log: ${logPath.repoPath}${buildFailureTail(compactResult, prepared.tailLineCount)}`,
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `Codex feature conveyor run failed with exit code ${result.status}. Full log: ${logPath.repoPath}${buildFailureTail(compactResult, prepared.tailLineCount)}`,
    );
  }

  return {
    changedPaths: postRunChanges.changedPaths,
    committedChangedPaths: postRunChanges.committedChangedPaths,
    executionApproved: true,
    executionLogDirectory: prepared.executionLogDirectory,
    executionLogMode: "log-file",
    engine: prepared.engine,
    headChanged: postRunChanges.headChanged,
    items: prepared.selectedItems.map((item) => item.id),
    logPath: logPath.repoPath,
    stderrBytes: compactResult.stderrBytes,
    stderrTruncated: compactResult.stderrTruncated,
    stdoutBytes: compactResult.stdoutBytes,
    stdoutTruncated: compactResult.stdoutTruncated,
    mode: prepared.engine === "cli" ? "executed-cli" : "executed-sdk",
    plannedPaths: prepared.plannedPaths,
    postHead: postRunChanges.postHead,
    preHead: postRunChanges.preHead,
    queuePath: prepared.queuePath,
    sdkThreadCreated: prepared.engine === "sdk",
    tailLines: prepared.tailLineCount,
    workingTreeChangedPaths: postRunChanges.workingTreeChangedPaths,
  };
}

export function runLiveValidation(prepared, cwd = process.cwd()) {
  assertLiveValidationApproved(prepared);

  const preStatus = gitStatus(cwd);
  if (preStatus.length > 0) {
    throw new Error(`Refusing live validation with dirty git state: ${preStatus.join("; ")}`);
  }

  const item = selectedLiveValidationItem(prepared);
  const startedAt = new Date().toISOString();
  const commands = liveValidationCommands(prepared);
  const commandResults = [];
  let failed = false;
  for (const command of commands) {
    const result = runLiveValidationCommand(cwd, prepared, command);
    commandResults.push(result);
    if (!result.ok) {
      failed = true;
      break;
    }
  }

  const report = {
    schemaVersion: "ae-agent-feature-conveyor-live-validation.v1",
    generatedAt: new Date().toISOString(),
    startedAt,
    ok: !failed,
    status: failed ? "failed" : "passed",
    item: item.id,
    items: prepared.selectedItems.map((item) => item.id),
    queuePath: prepared.queuePath,
    stage: prepared.liveStage,
    sdkThreadCreated: false,
    externalProviderValidationRun: item.liveValidation.externalProviderValidationRun === true,
    openAiCliPlannerValidationRun: item.liveValidation.openAiCliPlannerValidationRun === true,
    deterministicBackendFallbackAllowed: item.liveValidation.deterministicBackendFallbackAllowed === true,
    localProviderFallbackAllowed: item.liveValidation.localProviderFallbackAllowed === true,
    openRouterFallbackAllowed: item.liveValidation.openRouterFallbackAllowed === true,
    packageOrDependencyChangesAllowed: false,
    commands: commandResults,
    summary: {
      total: commandResults.length,
      passed: commandResults.filter((item) => item.ok).length,
      failed: commandResults.filter((item) => !item.ok).length
    }
  };
  const reportPath = writeLiveValidationReport(cwd, prepared, report);
  return {
    ...report,
    liveValidationLogDirectory: prepared.liveValidationLogDirectory,
    liveValidationReportPath: reportPath.repoPath,
    mode: failed ? "live-validation-failed" : "live-validation-passed",
    plannedPaths: prepared.plannedPaths
  };
}

export function main(argv = process.argv.slice(2)) {
  const prepared = prepareRun(argv);
  if (prepared.help) {
    console.log(HELP.trim());
    return;
  }

  let result;
  if (prepared.validateLive) {
    result = prepared.options.dryRun ? liveValidationDryRunEnvelope(prepared) : runLiveValidation(prepared);
  } else {
    result = prepared.executeSdk ? runFeatureConveyor(prepared) : dryRunEnvelope(prepared);
  }
  printResult(result, prepared.json);
  if (result && result.ok === false) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

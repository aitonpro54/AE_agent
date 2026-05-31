#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_QUEUE_PATH =
  ".codex-audit/sdk-milestone-conveyor/173-ae-agent-cleanup-conveyor-queue.json";
const DEFAULT_EXECUTION_LOG_DIR = ".codex-runtime/sdk/cleanup-conveyor-logs";
const DEFAULT_TAIL_LINES = 80;
export const DEFAULT_CHILD_MODEL = "gpt-5.3-codex";
export const DEFAULT_CHILD_REASONING = "high";
const CHILD_OUTPUT_MAX_BUFFER_BYTES = 50 * 1024 * 1024;

export const EXECUTE_APPROVAL_TEXT =
  "I approve one SDK cleanup conveyor workspace-write run for M174-M177 planned paths only";
export const CLI_EXECUTE_APPROVAL_TEXT =
  "I approve one Codex CLI cleanup conveyor workspace-write run for M174-M177 planned paths only";

const HELP = `
AE Agent cleanup conveyor runner

Usage:
  node orchestrator/run-ae-agent-cleanup-conveyor.mjs --all
  node orchestrator/run-ae-agent-cleanup-conveyor.mjs --item m174-roadmap-active-state-split
  node orchestrator/run-ae-agent-cleanup-conveyor.mjs --all --execute-sdk --approval-text "${EXECUTE_APPROVAL_TEXT}"
  node orchestrator/run-ae-agent-cleanup-conveyor.mjs --item m174-roadmap-active-state-split --engine cli --execute --approval-text "${CLI_EXECUTE_APPROVAL_TEXT}"

Options:
  --queue <path>             Queue artifact path. Defaults to M173 cleanup queue.
  --item <id>                Select one queue item. Repeatable.
  --all                      Select all queue items in queue order.
  --engine <sdk|cli>         Execution backend. Default: sdk.
                             Use cli to avoid @openai/codex-sdk stream transport.
  --execute                  Start one AI workspace-write turn with the selected engine.
  --execute-sdk              Start one workspace-write Codex SDK turn. Omit for dry-run.
  --approval-text <text>     Required exact approval text for --execute-sdk.
  --model <name>             Optional Codex model override. Default: ${DEFAULT_CHILD_MODEL}.
  --reasoning <effort>       minimal, low, medium, high, or xhigh. Default: ${DEFAULT_CHILD_REASONING}.
  --codex-path <path>        Optional Codex executable override.
  --log-dir <path>           Full child stdout/stderr log directory.
                             Must stay under .codex-runtime/.
                             Default: ${DEFAULT_EXECUTION_LOG_DIR}
  --tail-lines <n>           Failure tail lines printed to terminal. Default: ${DEFAULT_TAIL_LINES}.
  --stream-output            Debug escape hatch: print captured child output after run.
  --json                     Print machine-readable dry-run/execution metadata.
  --help                     Show this help.

Dry-run never starts an SDK thread. Execution starts exactly one AI turn, forbids
pre-existing git dirt, captures full child output into an ignored runtime log,
asks the selected backend to edit only the planned paths, and fails after the run
if the working tree or commits created since pre-run HEAD contain paths outside
that allowlist.
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
  "tail-lines",
]);
const BOOLEAN_OPTIONS = new Set([
  "all",
  "execute",
  "execute-sdk",
  "help",
  "json",
  "stream-output",
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
  const resolved = path.resolve(cwd, queuePath);
  if (!resolved.startsWith(`${cwd}${path.sep}`)) {
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

  const resolved = path.resolve(cwd, normalized);
  if (!resolved.startsWith(`${cwd}${path.sep}`)) {
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
    throw new Error("Select queue work with --all or --item <id>.");
  }

  return options.items.map((id) => {
    const item = queue.queueItems.find((entry) => entry.id === id);
    if (!item) {
      throw new Error(`Unknown queue item: ${id}`);
    }
    return item;
  });
}

function validateSelectedItems(items) {
  for (const item of items) {
    if (item.status !== "queued") {
      throw new Error(`Queue item is not queued: ${item.id}`);
    }
    if (item.mode !== "local-only") {
      throw new Error(`Queue item mode is not local-only: ${item.id}`);
    }
    if (item.approvalRequired !== false || item.maxSdkThreadRuns !== 0) {
      throw new Error(`Queue item is not safe for command wrapper approval: ${item.id}`);
    }
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
    throw new Error(`Cleanup conveyor changed paths outside queue allowlist: ${outOfScope.join(", ")}`);
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
    "You are running the AE Agent cleanup conveyor from the command line.",
    "Work in Russian for project docs and handoff text.",
    "Follow AGENTS.md. Preserve user changes. Do not push, create a PR, install packages, run live CEP/AE, run external providers, or delete/move runtime artifacts.",
    "This is one bounded workspace-write SDK turn. Edit only the planned paths listed below.",
    "Keep command output compact: summarize command results, save detailed logs to files when needed, and do not paste large diffs or validation logs into the terminal transcript.",
    "The wrapper captures full child stdout/stderr into an ignored runtime log and enforces the post-run git path allowlist against both working-tree changes and commits created since pre-run HEAD.",
    "Do not stop only because the terminal log is large; finish the selected items, record handoff, and end with a concise summary.",
    "",
    `Queue artifact: ${DEFAULT_QUEUE_PATH}`,
    `Queue schema: ${queue.schema}`,
    "",
    "Planned path allowlist:",
    ...plannedPaths.map((repoPath) => `- ${repoPath}`),
    "",
    "Selected queue items:",
    JSON.stringify(itemSummaries, null, 2),
    "",
    "Required end state:",
    "- Implement the selected cleanup item(s) as far as possible in this single turn.",
    "- Keep active AE Agent runtime behavior unchanged.",
    "- Keep SDKThread/network, CEP-panel SDK writes, live CEP/AE, external-provider/OpenAI CLI planner, mutating-live validation, dependency changes, push, and PR out of scope.",
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
    "--model",
    options.model || DEFAULT_CHILD_MODEL,
    "--reasoning",
    options.reasoning || DEFAULT_CHILD_REASONING,
    "--prompt",
    prompt,
  ];

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
    "--model",
    options.model || DEFAULT_CHILD_MODEL,
    "-c",
    "approval_policy=\"never\"",
    "-c",
    `model_reasoning_effort="${options.reasoning || DEFAULT_CHILD_REASONING}"`,
  ];

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
    "# AE Agent cleanup conveyor execution log",
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

function buildFailureTail(result, tailLineCount) {
  const stderrTail = tailLines(result.stderr, tailLineCount);
  const stdoutTail = tailLines(result.stdout, tailLineCount);
  const sections = [];
  if (stderrTail) {
    sections.push(`stderr tail:\n${stderrTail}`);
  }
  if (stdoutTail) {
    sections.push(`stdout tail:\n${stdoutTail}`);
  }
  return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
}

function printResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Queue: ${result.queuePath}`);
  console.log(`Items: ${result.items.join(", ")}`);
  console.log(`Mode: ${result.mode}`);
  if (result.executionLogMode) {
    console.log(`Execution output: ${result.executionLogMode}`);
  }
  if (result.logPath) {
    console.log(`Full execution log: ${result.logPath}`);
  } else if (result.executionLogDirectory) {
    console.log(`Execution log directory: ${result.executionLogDirectory}`);
  }
  console.log("");
  console.log("Planned paths:");
  for (const repoPath of result.plannedPaths) {
    console.log(`- ${repoPath}`);
  }
  if (result.executeCommand) {
    console.log("");
    console.log("Execute command:");
    console.log(result.executeCommand);
  }
  if (result.executeCliCommand) {
    console.log("");
    console.log("Execute command via Codex CLI:");
    console.log(result.executeCliCommand);
  }
  if (result.changedPaths) {
    console.log("");
    console.log("Changed paths since pre-run HEAD:");
    for (const repoPath of result.changedPaths) {
      console.log(`- ${repoPath}`);
    }
    if (result.headChanged) {
      console.log("");
      console.log(`HEAD changed: ${result.preHead} -> ${result.postHead}`);
    }
  }
}

export function prepareRun(argv = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseArgs(argv);
  if (options.help) {
    return { help: true };
  }

  const queuePath = options.queue || DEFAULT_QUEUE_PATH;
  const queue = readQueue(cwd, queuePath);
  const selectedItems = selectQueueItems(queue, options);
  validateSelectedItems(selectedItems);

  const plannedPaths = uniqueSorted(selectedItems.flatMap((item) => item.plannedPaths));
  const prompt = buildPrompt(queue, selectedItems, plannedPaths);
  const executionLogDirectory = normalizeRuntimeLogDirectory(cwd, options.logDir);
  const tailLineCount = options.tailLines || DEFAULT_TAIL_LINES;

  return {
    engine: options.engine || "sdk",
    executionLogDirectory,
    executeSdk: Boolean(options.executeSdk || options.execute),
    json: Boolean(options.json),
    options,
    plannedPaths,
    prompt,
    queue,
    queuePath,
    selectedItems,
    tailLineCount,
  };
}

export function dryRunEnvelope(prepared) {
  return {
    executeCommand: `npm.cmd run codex:orchestrator:ae-agent-cleanup-conveyor -- --all --execute-sdk --approval-text "${EXECUTE_APPROVAL_TEXT}"`,
    executeCliCommand: `npm.cmd run codex:orchestrator:ae-agent-cleanup-conveyor -- --all --engine cli --execute --approval-text "${CLI_EXECUTE_APPROVAL_TEXT}"`,
    engine: prepared.engine,
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

export function runSdk(prepared, cwd = process.cwd()) {
  const expectedApproval =
    prepared.engine === "cli" ? CLI_EXECUTE_APPROVAL_TEXT : EXECUTE_APPROVAL_TEXT;
  if (prepared.options.approvalText !== expectedApproval) {
    throw new Error(`Missing exact --approval-text: ${expectedApproval}`);
  }

  const preStatus = gitStatus(cwd);
  if (preStatus.length > 0) {
    throw new Error(`Refusing SDK cleanup conveyor run with dirty git state: ${preStatus.join("; ")}`);
  }
  const preHead = gitHead(cwd);

  const { commandLine, result } = runChildProcess(prepared, cwd);
  const logPath = writeExecutionLog(cwd, prepared, commandLine, result);

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
      `Codex SDK cleanup conveyor run failed before completion: ${result.error.message}. Full log: ${logPath.repoPath}${buildFailureTail(result, prepared.tailLineCount)}`,
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `Codex SDK cleanup conveyor run failed with exit code ${result.status}. Full log: ${logPath.repoPath}${buildFailureTail(result, prepared.tailLineCount)}`,
    );
  }

  return {
    changedPaths: postRunChanges.changedPaths,
    committedChangedPaths: postRunChanges.committedChangedPaths,
    executionLogDirectory: prepared.executionLogDirectory,
    executionLogMode: "log-file",
    engine: prepared.engine,
    headChanged: postRunChanges.headChanged,
    items: prepared.selectedItems.map((item) => item.id),
    logPath: logPath.repoPath,
    mode: prepared.engine === "cli" ? "executed-cli" : "executed-sdk",
    plannedPaths: prepared.plannedPaths,
    postHead: postRunChanges.postHead,
    preHead: postRunChanges.preHead,
    queuePath: prepared.queuePath,
    sdkThreadCreated: true,
    tailLines: prepared.tailLineCount,
    workingTreeChangedPaths: postRunChanges.workingTreeChangedPaths,
  };
}

export function main(argv = process.argv.slice(2)) {
  const prepared = prepareRun(argv);
  if (prepared.help) {
    console.log(HELP.trim());
    return;
  }

  const result = prepared.executeSdk ? runSdk(prepared) : dryRunEnvelope(prepared);
  printResult(result, prepared.json);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

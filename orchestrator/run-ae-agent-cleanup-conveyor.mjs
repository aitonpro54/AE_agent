#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_QUEUE_PATH =
  ".codex-audit/sdk-milestone-conveyor/173-ae-agent-cleanup-conveyor-queue.json";

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
  --model <name>             Optional Codex model override.
  --reasoning <effort>       minimal, low, medium, high, or xhigh. Default: high.
  --codex-path <path>        Optional Codex executable override.
  --json                     Print machine-readable dry-run/execution metadata.
  --help                     Show this help.

Dry-run never starts an SDK thread. Execution starts exactly one AI turn, forbids
pre-existing git dirt, asks the selected backend to edit only the planned paths, and
fails after the run if git reports changes outside those paths.
`;

const VALUE_OPTIONS = new Set([
  "approval-text",
  "codex-path",
  "engine",
  "item",
  "model",
  "queue",
  "reasoning",
]);
const BOOLEAN_OPTIONS = new Set(["all", "execute", "execute-sdk", "help", "json"]);

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

function validatePostRunChanges(cwd, plannedPaths) {
  const statusLines = gitStatus(cwd);
  const actualChangedPaths = collectActualChangedPaths(cwd, statusLines);
  const allowed = new Set(plannedPaths);
  const outOfScope = actualChangedPaths.filter((repoPath) => !allowed.has(repoPath));
  if (outOfScope.length > 0) {
    throw new Error(`Cleanup conveyor changed paths outside queue allowlist: ${outOfScope.join(", ")}`);
  }
  return actualChangedPaths;
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
    "Do not commit. The wrapper will enforce the post-run git path allowlist.",
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

function printResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Queue: ${result.queuePath}`);
  console.log(`Items: ${result.items.join(", ")}`);
  console.log(`Mode: ${result.mode}`);
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
    console.log("Changed paths:");
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

  const queuePath = options.queue || DEFAULT_QUEUE_PATH;
  const queue = readQueue(cwd, queuePath);
  const selectedItems = selectQueueItems(queue, options);
  validateSelectedItems(selectedItems);

  const plannedPaths = uniqueSorted(selectedItems.flatMap((item) => item.plannedPaths));
  const prompt = buildPrompt(queue, selectedItems, plannedPaths);

  return {
    engine: options.engine || "sdk",
    executeSdk: Boolean(options.executeSdk || options.execute),
    json: Boolean(options.json),
    options,
    plannedPaths,
    prompt,
    queue,
    queuePath,
    selectedItems,
  };
}

export function dryRunEnvelope(prepared) {
  return {
    executeCommand: `npm.cmd run codex:orchestrator:ae-agent-cleanup-conveyor -- --all --execute-sdk --approval-text "${EXECUTE_APPROVAL_TEXT}"`,
    executeCliCommand: `npm.cmd run codex:orchestrator:ae-agent-cleanup-conveyor -- --all --engine cli --execute --approval-text "${CLI_EXECUTE_APPROVAL_TEXT}"`,
    engine: prepared.engine,
    items: prepared.selectedItems.map((item) => item.id),
    mode: "dry-run",
    plannedPaths: prepared.plannedPaths,
    queuePath: prepared.queuePath,
    sdkThreadCreated: false,
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

  const result =
    prepared.engine === "cli"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", "codex", ...buildCliCommand(prepared.options)], {
          cwd,
          encoding: "utf8",
          input: prepared.prompt,
          stdio: ["pipe", "inherit", "inherit"],
          timeout: 30 * 60 * 1000,
        })
      : spawnSync(process.execPath, buildSdkCommand(prepared.options, prepared.prompt), {
          cwd,
          encoding: "utf8",
          stdio: "inherit",
          timeout: 30 * 60 * 1000,
        });

  const changedPaths = validatePostRunChanges(cwd, prepared.plannedPaths);

  if (result.status !== 0) {
    throw new Error(`Codex SDK cleanup conveyor run failed with exit code ${result.status}.`);
  }

  return {
    changedPaths,
    engine: prepared.engine,
    items: prepared.selectedItems.map((item) => item.id),
    mode: prepared.engine === "cli" ? "executed-cli" : "executed-sdk",
    plannedPaths: prepared.plannedPaths,
    queuePath: prepared.queuePath,
    sdkThreadCreated: true,
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

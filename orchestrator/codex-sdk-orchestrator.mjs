#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { Codex } from "@openai/codex-sdk";

const HELP = `
Codex SDK orchestrator

Usage:
  node orchestrator/codex-sdk-orchestrator.mjs --prompt "Summarize repo status"
  node orchestrator/codex-sdk-orchestrator.mjs --resume <thread-id> --prompt "Continue"

Options:
  --prompt <text>            Prompt to send to Codex.
  --resume <thread-id>       Resume an existing Codex thread.
  --cwd <path>               Working directory. Defaults to the current directory.
  --model <name>             Codex model override.
  --reasoning <effort>       minimal, low, medium, high, or xhigh. Default: medium.
  --sandbox <mode>           read-only, workspace-write, or danger-full-access. Default: read-only.
  --approval <mode>          never, on-request, on-failure, or untrusted. Default: never.
  --codex-path <path>        Explicit codex executable path.
  --network                  Enable network access for the Codex thread.
  --web-search <mode>        disabled, cached, or live. Default: disabled.
  --json                     Print a JSON result envelope.
  --stream                   Print streamed SDK events as they arrive.
  --skip-git-repo-check      Pass skipGitRepoCheck to the SDK thread options.
  --help                     Show this help.
`;

const VALUE_OPTIONS = new Set([
  "approval",
  "codex-path",
  "cwd",
  "model",
  "prompt",
  "reasoning",
  "resume",
  "sandbox",
  "web-search",
]);

const BOOLEAN_OPTIONS = new Set(["help", "json", "network", "skip-git-repo-check", "stream"]);

function parseArgs(argv) {
  const options = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const raw = arg.slice(2);
    const [name, inlineValue] = raw.split(/=(.*)/s, 2);

    if (BOOLEAN_OPTIONS.has(name)) {
      options[toCamelCase(name)] = inlineValue === undefined ? true : inlineValue !== "false";
      continue;
    }

    if (!VALUE_OPTIONS.has(name)) {
      throw new Error(`Unknown option: --${name}`);
    }

    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }

    options[toCamelCase(name)] = value;
    if (inlineValue === undefined) {
      index += 1;
    }
  }

  if (!options.prompt && positional.length > 0) {
    options.prompt = positional.join(" ");
  }

  return options;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function resolveDefaultCodexPath() {
  const candidates = [
    process.env.CODEX_CLI_PATH,
    process.env.CODEX_PATH,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "OpenAI", "Codex", "bin", "codex.exe")
      : undefined,
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
}

function createCodex(options) {
  const codexPathOverride = options.codexPath || resolveDefaultCodexPath();
  return new Codex(removeUndefined({ codexPathOverride }));
}

function createThread(codex, options, threadOptions) {
  if (options.resume) {
    return codex.resumeThread(options.resume, threadOptions);
  }

  return codex.startThread(threadOptions);
}

function createThreadOptions(options) {
  return removeUndefined({
    approvalPolicy: options.approval || "never",
    model: options.model,
    modelReasoningEffort: options.reasoning || "medium",
    networkAccessEnabled: Boolean(options.network),
    sandboxMode: options.sandbox || "read-only",
    skipGitRepoCheck: Boolean(options.skipGitRepoCheck),
    webSearchMode: options.webSearch || "disabled",
    workingDirectory: path.resolve(options.cwd || process.cwd()),
  });
}

function summarizeItems(items) {
  const byType = {};
  for (const item of items) {
    byType[item.type] = (byType[item.type] || 0) + 1;
  }
  return byType;
}

function printResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Thread: ${result.threadId || "(not reported)"}`);
  if (result.usage) {
    console.log(`Usage: input=${result.usage.input_tokens} output=${result.usage.output_tokens}`);
  }
  console.log("");
  console.log(result.finalResponse || "(no final response)");
}

async function runStreamed(thread, prompt, asJson) {
  const { events } = await thread.runStreamed(prompt);
  let finalResponse = "";
  let usage = null;

  for await (const event of events) {
    if (asJson) {
      console.log(JSON.stringify(event));
      continue;
    }

    if (event.type === "item.completed" && event.item.type === "agent_message") {
      finalResponse = event.item.text;
      console.log(event.item.text);
    } else if (event.type === "turn.completed") {
      usage = event.usage;
    } else {
      console.log(event.type);
    }
  }

  return { finalResponse, threadId: thread.id, usage };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || !options.prompt) {
    console.log(HELP.trim());
    return;
  }

  const codex = createCodex(options);
  const threadOptions = createThreadOptions(options);
  const thread = createThread(codex, options, threadOptions);

  if (options.stream) {
    const result = await runStreamed(thread, options.prompt, Boolean(options.json));
    if (!options.json) {
      printResult(result, false);
    }
    return;
  }

  const turn = await thread.run(options.prompt);
  printResult(
    {
      finalResponse: turn.finalResponse,
      itemSummary: summarizeItems(turn.items),
      threadId: thread.id,
      usage: turn.usage,
    },
    Boolean(options.json),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

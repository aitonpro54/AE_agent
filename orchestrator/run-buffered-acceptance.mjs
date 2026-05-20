import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repo = process.cwd();

const DEFAULT_MILESTONE_PATH = path.join(
  ".codex",
  "milestones",
  "m107-sdk-orchestrator-acceptance-smoke.md",
);

const DEFAULT_REPORT_PATH = path.join(
  ".codex-audit",
  "107-sdk-orchestrator-acceptance-smoke.md",
);

const BUFFERED_ACCEPTANCE_THREAD_OPTIONS = Object.freeze({
  approvalPolicy: "never",
  networkAccessEnabled: false,
  sandboxMode: "read-only",
  webSearchMode: "disabled",
  workingDirectory: repo,
});

const REJECTED_BUFFERED_FLAGS = Object.freeze([
  "approval",
  "external-provider",
  "mutating-live",
  "network",
  "openai-cli-planner",
  "sandbox",
  "skip-git-repo-check",
  "tenant-policy-bypass",
  "web-search",
]);

const SUPPORTED_BUFFERED_FLAGS = new Set(["contract-smoke", "help"]);

function getOptionName(arg) {
  return arg.slice(2).split("=", 1)[0];
}

export function parseBufferedAcceptanceArgs(argv) {
  const options = {};
  const positional = [];

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const name = getOptionName(arg);

    if (REJECTED_BUFFERED_FLAGS.includes(name)) {
      throw new Error(`Unsafe buffered acceptance flag rejected: --${name}`);
    }

    if (!SUPPORTED_BUFFERED_FLAGS.has(name)) {
      throw new Error(`Unsupported buffered acceptance flag: --${name}`);
    }

    if (arg.includes("=")) {
      throw new Error(`Flag does not accept a value in buffered acceptance mode: --${name}`);
    }

    options[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true;
  }

  if (positional.length > 2) {
    throw new Error("Buffered acceptance accepts at most milestone and report paths.");
  }

  return {
    contractSmoke: Boolean(options.contractSmoke),
    help: Boolean(options.help),
    milestonePath: positional[0] ?? DEFAULT_MILESTONE_PATH,
    reportPath: positional[1] ?? DEFAULT_REPORT_PATH,
  };
}

function printHelp() {
  console.log(
    [
      "Buffered Codex SDK acceptance wrapper",
      "",
      "Usage:",
      "  node orchestrator/run-buffered-acceptance.mjs [milestone.md] [report.md]",
      "  node orchestrator/run-buffered-acceptance.mjs --contract-smoke",
      "",
      "Buffered acceptance mode always forces:",
      '  sandboxMode: "read-only"',
      '  approvalPolicy: "never"',
      "  networkAccessEnabled: false",
      '  webSearchMode: "disabled"',
      "",
      "Unsafe override flags are rejected before any SDK thread is created.",
    ].join("\n"),
  );
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function serialize(value) {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(
      value,
      (_key, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    );
  } catch {
    return String(value);
  }
}

function sh(command, timeoutMs = 120000) {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
    }).trim();
  } catch (err) {
    return [
      `COMMAND FAILED: ${command}`,
      err?.stdout ?? "",
      err?.stderr ?? "",
      String(err),
    ].join("\n");
  }
}

function readIfExists(filePath, maxChars = 60000) {
  if (!fs.existsSync(filePath)) {
    return `(missing: ${filePath})`;
  }

  const text = fs.readFileSync(filePath, "utf8");

  if (text.length <= maxChars) {
    return text;
  }

  return [
    text.slice(0, maxChars),
    "",
    `--- TRUNCATED ${filePath}: ${text.length - maxChars} chars omitted ---`,
  ].join("\n");
}

function assertContract(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function runNode(args, timeoutMs = 30000) {
  return spawnSync(process.execPath, args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });
}

async function runContractSmoke() {
  const failures = [];
  const helpResult = runNode([path.join("orchestrator", "codex-sdk-orchestrator.mjs"), "--help"]);
  const helpOutput = `${helpResult.stdout ?? ""}\n${helpResult.stderr ?? ""}`;

  assertContract(helpResult.status === 0, "codex orchestrator help command failed", failures);
  assertContract(helpOutput.includes("Codex SDK orchestrator"), "help output missing title", failures);
  assertContract(helpOutput.includes("--sandbox <mode>"), "help output missing sandbox option", failures);
  assertContract(helpOutput.includes("--web-search <mode>"), "help output missing web-search option", failures);

  const { createThreadOptions } = await import("./codex-sdk-orchestrator.mjs");
  const safeDefaults = createThreadOptions({});

  assertContract(
    safeDefaults.approvalPolicy === "never",
    "orchestrator default approvalPolicy is not never",
    failures,
  );
  assertContract(
    safeDefaults.networkAccessEnabled === false,
    "orchestrator default networkAccessEnabled is not false",
    failures,
  );
  assertContract(
    safeDefaults.sandboxMode === "read-only",
    "orchestrator default sandboxMode is not read-only",
    failures,
  );
  assertContract(
    safeDefaults.webSearchMode === "disabled",
    "orchestrator default webSearchMode is not disabled",
    failures,
  );

  const unsafeArgCases = [
    ["--sandbox", "danger-full-access"],
    ["--sandbox=danger-full-access"],
    ["--approval", "on-request"],
    ["--approval=on-request"],
    ["--network"],
    ["--web-search", "live"],
    ["--web-search=live"],
    ["--skip-git-repo-check"],
    ["--external-provider"],
    ["--openai-cli-planner"],
    ["--mutating-live"],
    ["--tenant-policy-bypass"],
  ];

  for (const unsafeArgs of unsafeArgCases) {
    let rejected = false;
    try {
      parseBufferedAcceptanceArgs(unsafeArgs);
    } catch (error) {
      rejected =
        error instanceof Error &&
        error.message.startsWith("Unsafe buffered acceptance flag rejected:");
    }

    assertContract(
      rejected,
      `buffered acceptance did not reject unsafe args: ${unsafeArgs.join(" ")}`,
      failures,
    );
  }

  assertContract(
    BUFFERED_ACCEPTANCE_THREAD_OPTIONS.approvalPolicy === "never",
    "buffered acceptance approvalPolicy is not forced to never",
    failures,
  );
  assertContract(
    BUFFERED_ACCEPTANCE_THREAD_OPTIONS.networkAccessEnabled === false,
    "buffered acceptance network access is not forced off",
    failures,
  );
  assertContract(
    BUFFERED_ACCEPTANCE_THREAD_OPTIONS.sandboxMode === "read-only",
    "buffered acceptance sandbox is not forced to read-only",
    failures,
  );
  assertContract(
    BUFFERED_ACCEPTANCE_THREAD_OPTIONS.webSearchMode === "disabled",
    "buffered acceptance web search is not forced disabled",
    failures,
  );

  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assertContract(
    packageJson.scripts?.["codex:orchestrator"] ===
      "node orchestrator/codex-sdk-orchestrator.mjs",
    "package.json codex:orchestrator script is not the expected local runner",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:help"] ===
      "node orchestrator/codex-sdk-orchestrator.mjs --help",
    "package.json codex:orchestrator:help script is not the expected help runner",
    failures,
  );
  assertContract(
    packageJson.scripts?.["check:rules"] ===
      "node orchestrator/run-buffered-acceptance.mjs --contract-smoke",
    "package.json check:rules script is not wired to the local contract smoke",
    failures,
  );

  const readme = readIfExists(path.join("orchestrator", "README.md"), 40000);
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:help"),
    "README does not document codex:orchestrator:help",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run check:rules"),
    "README does not document check:rules",
    failures,
  );
  assertContract(
    readme.includes('sandboxMode: "read-only"') &&
      readme.includes('approvalPolicy: "never"') &&
      readme.includes("networkAccessEnabled: false") &&
      readme.includes('webSearchMode: "disabled"'),
    "README does not document all safe defaults",
    failures,
  );
  assertContract(
    readme.includes("--sandbox danger-full-access") &&
      readme.includes("--approval on-request") &&
      readme.includes("--network") &&
      readme.includes("--web-search live"),
    "README does not document the unsafe buffered-mode rejections",
    failures,
  );

  if (failures.length > 0) {
    console.error("M108 contract smoke failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("PASS M108 SDK orchestrator contract smoke");
  console.log("Unsafe flags rejected:");
  for (const flag of REJECTED_BUFFERED_FLAGS) {
    console.log(`- --${flag}`);
  }
}

async function runBufferedAcceptance({ milestonePath, reportPath }) {
  fs.mkdirSync(path.join(".codex", "sdk", "logs"), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  if (!fs.existsSync(milestonePath)) {
    console.error(`Milestone file not found: ${milestonePath}`);
    process.exit(1);
  }

  const checks = {
    repo,
    statusBefore: sh("git status --short --branch"),
    log: sh("git log --oneline -8"),
    nodeCheck: sh("node --check orchestrator\\codex-sdk-orchestrator.mjs"),
    rulesCheck: sh("npm.cmd run check:rules"),
    diffCheck: sh("git diff --check"),
    diffNameOnlyBefore: sh("git diff --name-only"),
  };

  const prompt = `
You are running a buffered Codex SDK acceptance review.

IMPORTANT EXECUTION MODE:
- Analyze only.
- Do not edit files.
- Do not commit.
- Do not run external-provider validation.
- Do not run OpenAI CLI planner validation.
- Do not run mutating-live.
- Do not modify production code.
- Do not modify CEP panel code.
- Do not bypass tenant policy.
- Do not run broad npm/cache/network diagnostics.
- The host wrapper will write your final response to the acceptance report file.

Repository:
${repo}

Milestone file:
${milestonePath}

Acceptance report output path:
${reportPath}

SDK thread options forced by host wrapper:
${JSON.stringify(BUFFERED_ACCEPTANCE_THREAD_OPTIONS, null, 2)}

Pre-run checks:
${JSON.stringify(checks, null, 2)}

Milestone:
--- BEGIN MILESTONE ---
${readIfExists(milestonePath, 30000)}
--- END MILESTONE ---

Current handoff:
--- BEGIN HANDOFF ---
${readIfExists(".codex/handoff.md", 40000)}
--- END HANDOFF ---

Orchestrator README:
--- BEGIN README ---
${readIfExists("orchestrator/README.md", 40000)}
--- END README ---

Orchestrator source:
--- BEGIN ORCHESTRATOR SOURCE ---
${readIfExists("orchestrator/codex-sdk-orchestrator.mjs", 60000)}
--- END ORCHESTRATOR SOURCE ---

package.json:
--- BEGIN PACKAGE ---
${readIfExists("package.json", 20000)}
--- END PACKAGE ---

Write the final acceptance report in this exact structure:

# M107 SDK Orchestrator Acceptance Smoke

## Result
pass | partial | fail

## What was checked

## Pre-run validation

## Orchestrator readiness

## Risks

## Blocked items

## Next safe milestone

## Commands allowed next

## Commands forbidden

## Notes
`;

  const { Codex } = await import("@openai/codex-sdk");
  const codex = new Codex();

  const maybeThread = codex.startThread(BUFFERED_ACCEPTANCE_THREAD_OPTIONS);

  const thread =
    maybeThread && typeof maybeThread.then === "function" ? await maybeThread : maybeThread;

  const turn = await thread.run(prompt);

  const finalResponse =
    turn?.finalResponse ??
    turn?.final_response ??
    (typeof turn === "string" ? turn : serialize(turn));

  fs.writeFileSync(reportPath, finalResponse, "utf8");

  const id = `${stamp()}-m107-buffered-acceptance`;

  fs.writeFileSync(`.codex/sdk/logs/${id}-turn.json`, serialize(turn), "utf8");
  fs.writeFileSync(`.codex/sdk/logs/${id}-checks.json`, serialize(checks), "utf8");
  fs.writeFileSync(
    `.codex/sdk/logs/${id}-status-after.txt`,
    sh("git status --short --branch"),
    "utf8",
  );
  fs.writeFileSync(`.codex/sdk/logs/${id}-diff-check.txt`, sh("git diff --check"), "utf8");
  fs.writeFileSync(
    `.codex/sdk/logs/${id}-diff-name-only.txt`,
    sh("git diff --name-only"),
    "utf8",
  );

  console.log(`Buffered acceptance report written: ${reportPath}`);
  console.log(`SDK log prefix: .codex/sdk/logs/${id}`);
  console.log("");
  console.log("Review now:");
  console.log("  git status --short --branch");
  console.log("  git diff --check");
  console.log("  git diff --name-only");
  console.log("  git diff");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseBufferedAcceptanceArgs(argv);

  if (options.help) {
    printHelp();
    return;
  }

  if (options.contractSmoke) {
    await runContractSmoke();
    return;
  }

  await runBufferedAcceptance(options);
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

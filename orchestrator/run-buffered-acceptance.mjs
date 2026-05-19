import { Codex } from "@openai/codex-sdk";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const milestonePath =
  process.argv[2] ?? ".codex\\milestones\\m107-sdk-orchestrator-acceptance-smoke.md";

const reportPath =
  process.argv[3] ?? ".codex-audit\\107-sdk-orchestrator-acceptance-smoke.md";

fs.mkdirSync(".codex/sdk/logs", { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function serialize(value) {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(
      value,
      (_key, v) => (typeof v === "bigint" ? v.toString() : v),
      2
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

const codex = new Codex();

const maybeThread = codex.startThread({
  workingDirectory: repo,
});

const thread =
  maybeThread && typeof maybeThread.then === "function"
    ? await maybeThread
    : maybeThread;

const turn = await thread.run(prompt);

const finalResponse =
  turn?.finalResponse ??
  turn?.final_response ??
  (typeof turn === "string" ? turn : serialize(turn));

fs.writeFileSync(reportPath, finalResponse, "utf8");

const id = `${stamp()}-m107-buffered-acceptance`;

fs.writeFileSync(`.codex/sdk/logs/${id}-turn.json`, serialize(turn), "utf8");
fs.writeFileSync(`.codex/sdk/logs/${id}-checks.json`, serialize(checks), "utf8");
fs.writeFileSync(`.codex/sdk/logs/${id}-status-after.txt`, sh("git status --short --branch"), "utf8");
fs.writeFileSync(`.codex/sdk/logs/${id}-diff-check.txt`, sh("git diff --check"), "utf8");
fs.writeFileSync(`.codex/sdk/logs/${id}-diff-name-only.txt`, sh("git diff --name-only"), "utf8");

console.log(`Buffered acceptance report written: ${reportPath}`);
console.log(`SDK log prefix: .codex/sdk/logs/${id}`);
console.log("");
console.log("Review now:");
console.log("  git status --short --branch");
console.log("  git diff --check");
console.log("  git diff --name-only");
console.log("  git diff");
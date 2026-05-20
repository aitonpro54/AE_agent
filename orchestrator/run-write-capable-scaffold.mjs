#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const HELP = `
Codex SDK write-capable runner scaffold

Usage:
  node orchestrator/run-write-capable-scaffold.mjs --scope orchestrator --prompt "Implement a narrow orchestrator change"
  node orchestrator/run-write-capable-scaffold.mjs --contract-smoke

Required:
  --scope <name>             docs-audit, orchestrator, production-code, or cep-panel.
  --prompt <text>            Requested work. Policy-scanned before any SDK thread can exist.

Options:
  --cwd <path>               Working directory. Defaults to the current directory.
  --acknowledge-existing-change <path>
                             Explicitly acknowledge one pre-existing dirty path.
  --json                     Print a JSON scaffold envelope.
  --contract-smoke           Run local scaffold contract checks only.
  --help                     Show this help.

This M112 scaffold is non-live. It validates the write contract, captures pre/post git
snapshots, and reports would-be SDK thread options, but does not import the SDK or create
a thread.
`;

const COMMON_AUDIT_ALLOWLIST = Object.freeze([
  ".codex-audit/**",
  ".codex/handoff.md",
]);

export const WRITE_SCOPES = Object.freeze([
  "docs-audit",
  "orchestrator",
  "production-code",
  "cep-panel",
]);

export const SCOPE_PATH_ALLOWLISTS = Object.freeze({
  "docs-audit": Object.freeze([
    ...COMMON_AUDIT_ALLOWLIST,
    "AGENTS.md",
    "README.md",
    "RELEASES.md",
    "docs/**",
    "plans/**",
    "specs/**",
    "orchestrator/README.md",
  ]),
  orchestrator: Object.freeze([
    ...COMMON_AUDIT_ALLOWLIST,
    "orchestrator/**",
    "package.json",
  ]),
  "production-code": Object.freeze([
    ...COMMON_AUDIT_ALLOWLIST,
    "chatgpt-connector/**",
    "mcp-server/**",
    "recipes/**",
    "registry/**",
    "scripts/**",
    "package.json",
  ]),
  "cep-panel": Object.freeze([
    ...COMMON_AUDIT_ALLOWLIST,
    "cep-panel/**",
  ]),
});

export const FORBIDDEN_PATH_PATTERNS = Object.freeze([
  ".git/**",
  "node_modules/**",
  "logs/**",
  "backups/**",
  "snapshots/**",
  "pro-review-bundles/**",
  "mcp-config.json",
  ".env*",
  "**/.env*",
  "*.key",
  "**/*.key",
  "*.pem",
  "**/*.pem",
  "*secret*",
  "**/*secret*",
  "*token*",
  "**/*token*",
]);

export const UNSAFE_WRITE_RUNNER_FLAGS = Object.freeze([
  "approval",
  "auto-commit",
  "commit",
  "danger-full-access",
  "execute",
  "external-provider",
  "force",
  "live",
  "mutating-live",
  "network",
  "openai-cli-planner",
  "sandbox",
  "skip-git-repo-check",
  "tenant-policy-bypass",
  "unsafe",
  "web-search",
]);

export const WRITE_CAPABLE_THREAD_OPTION_CONTRACT = Object.freeze({
  approvalPolicy: "never",
  networkAccessEnabled: false,
  sandboxMode: "workspace-write",
  webSearchMode: "disabled",
});

const VALUE_OPTIONS = new Set(["acknowledge-existing-change", "cwd", "prompt", "scope"]);
const BOOLEAN_OPTIONS = new Set(["contract-smoke", "help", "json"]);

const HARD_STOP_PROMPT_PATTERNS = Object.freeze([
  {
    id: "external-provider",
    pattern: /\bexternal[- ]provider\b/i,
  },
  {
    id: "openai-cli-planner",
    pattern: /\bopenai[- ]cli[- ]planner\b/i,
  },
  {
    id: "live-or-mutating",
    pattern: /\b(mutating[- ]live|live[- ]mutation|live ae|live cep|live smoke)\b/i,
  },
  {
    id: "tenant-policy-bypass",
    pattern: /\b(tenant[- ]policy[- ]bypass|bypass tenant policy)\b/i,
  },
  {
    id: "auto-commit",
    pattern: /\b(auto[- ]commit|commit automatically|commit the changes|commit these changes)\b/i,
  },
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
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function splitLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(normalizeRepoPath))].sort();
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function pathSignatureHash(value) {
  return hashText(JSON.stringify(value));
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `git ${args.join(" ")} failed with status ${result.status}`,
        result.stdout ?? "",
        result.stderr ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return (result.stdout ?? "").trimEnd();
}

function readFileHashIfPresent(cwd, repoPath) {
  const absolutePath = path.resolve(cwd, repoPath);

  if (!existsSync(absolutePath)) {
    return null;
  }

  const stats = statSync(absolutePath);
  if (!stats.isFile()) {
    return `non-file:${stats.isDirectory() ? "directory" : "other"}`;
  }

  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

function createPathSignature(cwd, repoPath) {
  return pathSignatureHash({
    fileHash: readFileHashIfPresent(cwd, repoPath),
    stagedDiffHash: hashText(runGit(["diff", "--cached", "--", repoPath], cwd)),
    worktreeDiffHash: hashText(runGit(["diff", "--", repoPath], cwd)),
  });
}

function parseStatusPaths(statusShort) {
  const paths = [];

  for (const line of splitLines(statusShort)) {
    if (line.startsWith("## ")) {
      continue;
    }

    const rawPath = line.slice(3).trim();
    if (!rawPath) {
      continue;
    }

    if (rawPath.includes(" -> ")) {
      paths.push(...rawPath.split(" -> "));
      continue;
    }

    paths.push(rawPath);
  }

  return paths;
}

function patternToRegExp(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wildcarded = escaped.replace(/\\\*\\\*/g, ".*").replace(/\\\*/g, "[^/]*");
  return new RegExp(`^${wildcarded}$`);
}

function matchesPathPattern(repoPath, pattern) {
  const normalizedPath = normalizeRepoPath(repoPath);
  const normalizedPattern = normalizeRepoPath(pattern);

  if (normalizedPattern.endsWith("/**")) {
    const root = normalizedPattern.slice(0, -3);
    return normalizedPath === root || normalizedPath.startsWith(`${root}/`);
  }

  if (normalizedPattern.includes("*")) {
    return patternToRegExp(normalizedPattern).test(normalizedPath);
  }

  return normalizedPath === normalizedPattern;
}

export function normalizeRepoPath(value) {
  const raw = String(value ?? "").trim().replace(/\\/g, "/");
  const withoutDot = raw.replace(/^\.\//, "");
  const normalized = path.posix.normalize(withoutDot);
  return normalized === "." ? "" : normalized;
}

export function isUnsafePathShape(repoPath) {
  const raw = String(repoPath ?? "");
  const normalized = normalizeRepoPath(raw);

  return (
    raw.includes("\0") ||
    path.isAbsolute(raw) ||
    /^[A-Za-z]:[\\/]/.test(raw) ||
    normalized === ".." ||
    normalized.startsWith("../")
  );
}

export function validateScope(scope) {
  if (!WRITE_SCOPES.includes(scope)) {
    throw new Error(`Unknown write scope: ${scope}. Expected one of: ${WRITE_SCOPES.join(", ")}.`);
  }
}

export function isForbiddenPath(repoPath) {
  if (isUnsafePathShape(repoPath)) {
    return true;
  }

  return FORBIDDEN_PATH_PATTERNS.some((pattern) => matchesPathPattern(repoPath, pattern));
}

export function isPathAllowedForScope(scope, repoPath) {
  validateScope(scope);

  if (isForbiddenPath(repoPath)) {
    return false;
  }

  return SCOPE_PATH_ALLOWLISTS[scope].some((pattern) => matchesPathPattern(repoPath, pattern));
}

export function getPathContractViolations(scope, repoPaths) {
  validateScope(scope);

  return uniqueSorted(repoPaths).flatMap((repoPath) => {
    if (isUnsafePathShape(repoPath)) {
      return [{ path: repoPath, reason: "unsafe-path-shape" }];
    }

    if (isForbiddenPath(repoPath)) {
      return [{ path: repoPath, reason: "forbidden-path" }];
    }

    if (!isPathAllowedForScope(scope, repoPath)) {
      return [{ path: repoPath, reason: "outside-scope-allowlist" }];
    }

    return [];
  });
}

export function parseWriteRunnerArgs(argv) {
  const options = { acknowledgedExistingChanges: [] };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const raw = arg.slice(2);
    const { inlineValue, name } = splitInlineOption(raw);

    if (UNSAFE_WRITE_RUNNER_FLAGS.includes(name)) {
      throw new Error(`Unsafe write-capable runner flag rejected: --${name}`);
    }

    if (BOOLEAN_OPTIONS.has(name)) {
      if (inlineValue !== undefined) {
        throw new Error(`Flag does not accept a value in write-capable scaffold mode: --${name}`);
      }
      options[toCamelCase(name)] = true;
      continue;
    }

    if (!VALUE_OPTIONS.has(name)) {
      throw new Error(`Unsupported write-capable runner flag: --${name}`);
    }

    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }

    if (name === "acknowledge-existing-change") {
      options.acknowledgedExistingChanges.push(normalizeRepoPath(value));
    } else {
      options[toCamelCase(name)] = value;
    }

    if (inlineValue === undefined) {
      index += 1;
    }
  }

  if (positional.length > 0) {
    throw new Error("Positional arguments are not supported in write-capable scaffold mode.");
  }

  validateWriteRunnerOptions(options);
  return options;
}

export function validateWriteRunnerOptions(options) {
  if (options.help || options.contractSmoke) {
    return;
  }

  if (!options.scope) {
    throw new Error(`Missing required --scope. Expected one of: ${WRITE_SCOPES.join(", ")}.`);
  }

  validateScope(options.scope);

  if (!options.prompt) {
    throw new Error("Missing required --prompt for write-capable scaffold mode.");
  }
}

export function validatePromptPolicy(prompt) {
  const text = String(prompt ?? "");

  for (const rule of HARD_STOP_PROMPT_PATTERNS) {
    if (rule.pattern.test(text)) {
      throw new Error(`Hard-stop policy rejected prompt request: ${rule.id}`);
    }
  }
}

export function createWriteCapableThreadOptions(options = {}) {
  return {
    ...WRITE_CAPABLE_THREAD_OPTION_CONTRACT,
    workingDirectory: path.resolve(options.cwd || process.cwd()),
  };
}

export function captureGitSnapshot(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const statusShort = runGit(["status", "--short", "--branch"], cwd);
  const diffNameOnly = splitLines(runGit(["diff", "--name-only"], cwd));
  const stagedDiffNameOnly = splitLines(runGit(["diff", "--cached", "--name-only"], cwd));
  const untrackedNameOnly = splitLines(runGit(["ls-files", "--others", "--exclude-standard"], cwd));
  const changedPaths = uniqueSorted([
    ...parseStatusPaths(statusShort),
    ...diffNameOnly,
    ...stagedDiffNameOnly,
    ...untrackedNameOnly,
  ]);
  const pathSignatures = Object.fromEntries(
    changedPaths.map((repoPath) => [repoPath, createPathSignature(cwd, repoPath)]),
  );

  return {
    capturedAt: new Date().toISOString(),
    changedPaths,
    cwd,
    diffNameOnly,
    label: options.label || "git-snapshot",
    pathSignatures,
    stagedDiffNameOnly,
    statusShort,
    untrackedNameOnly,
  };
}

export function collectPathsChangedSincePre(preSnapshot, postSnapshot) {
  const paths = uniqueSorted([
    ...Object.keys(preSnapshot.pathSignatures || {}),
    ...Object.keys(postSnapshot.pathSignatures || {}),
  ]);

  return paths.filter(
    (repoPath) => preSnapshot.pathSignatures?.[repoPath] !== postSnapshot.pathSignatures?.[repoPath],
  );
}

export function assertPreRunGitState(snapshot, options = {}) {
  const changedPaths = uniqueSorted(snapshot.changedPaths || []);

  if (changedPaths.length === 0) {
    return;
  }

  const acknowledged = uniqueSorted(options.acknowledgedExistingChanges || []);

  if (acknowledged.length === 0) {
    throw new Error(
      `Dirty unexpected git state before write-capable run: ${changedPaths.join(", ")}`,
    );
  }

  const unexpected = changedPaths.filter((repoPath) => !acknowledged.includes(repoPath));
  if (unexpected.length > 0) {
    throw new Error(
      `Dirty unexpected git state before write-capable run: ${unexpected.join(", ")}`,
    );
  }

  const staleAcknowledgements = acknowledged.filter((repoPath) => !changedPaths.includes(repoPath));
  if (staleAcknowledgements.length > 0) {
    throw new Error(
      `Acknowledged paths are not dirty and may be stale: ${staleAcknowledgements.join(", ")}`,
    );
  }

  const forbiddenExisting = changedPaths.filter(isForbiddenPath);
  if (forbiddenExisting.length > 0) {
    throw new Error(`Forbidden path dirty before write-capable run: ${forbiddenExisting.join(", ")}`);
  }
}

export function assertValidationResult(validationResult) {
  if (!validationResult || validationResult.ok !== true) {
    throw new Error("Hard-stop policy rejected failed validation result.");
  }
}

export function validatePostRunContract({ postSnapshot, preSnapshot, scope, validationResult }) {
  validateScope(scope);
  assertValidationResult(validationResult);

  const changedSincePre = collectPathsChangedSincePre(preSnapshot, postSnapshot);
  const violations = getPathContractViolations(scope, changedSincePre);

  if (violations.length > 0) {
    const forbidden = violations.filter((violation) => violation.reason === "forbidden-path");
    const summary = violations
      .map((violation) => `${violation.path} (${violation.reason})`)
      .join(", ");

    if (forbidden.length > 0) {
      throw new Error(`Forbidden path diff detected after write-capable run: ${summary}`);
    }

    throw new Error(`Path allowlist violation after write-capable run: ${summary}`);
  }

  return { changedSincePre, violations };
}

export async function runWriteCapableScaffold(options) {
  validateWriteRunnerOptions(options);
  validatePromptPolicy(options.prompt);

  const cwd = path.resolve(options.cwd || process.cwd());
  const preSnapshot = captureGitSnapshot({ cwd, label: "pre-run" });
  assertPreRunGitState(preSnapshot, {
    acknowledgedExistingChanges: options.acknowledgedExistingChanges,
  });

  const threadOptions = createWriteCapableThreadOptions({ cwd });
  const validationResult = { ok: true, source: "m112-non-live-scaffold" };

  const postSnapshot = captureGitSnapshot({ cwd, label: "post-run" });
  const postContract = validatePostRunContract({
    postSnapshot,
    preSnapshot,
    scope: options.scope,
    validationResult,
  });

  return {
    autoCommit: false,
    postContract,
    postSnapshot,
    preSnapshot,
    result: "scaffold-only",
    scope: options.scope,
    sdkThreadCreated: false,
    threadOptions,
  };
}

function assertContract(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function assertRejects(fn, expectedMessageStart, failures, label) {
  let rejected = false;

  try {
    fn();
  } catch (error) {
    rejected =
      error instanceof Error &&
      (expectedMessageStart ? error.message.startsWith(expectedMessageStart) : true);
  }

  assertContract(rejected, label, failures);
}

export function runWriteCapableContractSmoke() {
  const failures = [];

  assertContract(
    WRITE_SCOPES.join(",") === "docs-audit,orchestrator,production-code,cep-panel",
    "write scope list changed unexpectedly",
    failures,
  );

  for (const scope of WRITE_SCOPES) {
    assertContract(
      Array.isArray(SCOPE_PATH_ALLOWLISTS[scope]) && SCOPE_PATH_ALLOWLISTS[scope].length > 0,
      `missing path allowlist for scope ${scope}`,
      failures,
    );
  }

  const parsed = parseWriteRunnerArgs([
    "--scope",
    "orchestrator",
    "--prompt",
    "Implement a narrow orchestrator scaffold contract.",
    "--acknowledge-existing-change",
    ".codex-audit/112-sdk-write-capable-runner-scaffold-spec.md",
  ]);

  assertContract(parsed.scope === "orchestrator", "write runner did not parse scope", failures);
  assertContract(parsed.prompt.includes("orchestrator"), "write runner did not parse prompt", failures);
  assertContract(
    parsed.acknowledgedExistingChanges.includes(
      ".codex-audit/112-sdk-write-capable-runner-scaffold-spec.md",
    ),
    "write runner did not parse acknowledged existing changes",
    failures,
  );

  assertRejects(
    () => parseWriteRunnerArgs(["--scope", "unknown", "--prompt", "No-op"]),
    "Unknown write scope:",
    failures,
    "write runner did not reject unknown scope",
  );

  assertRejects(
    () => parseWriteRunnerArgs(["--prompt", "No-op"]),
    "Missing required --scope.",
    failures,
    "write runner did not require explicit scope",
  );

  const unsafeArgCases = [
    ["--scope", "orchestrator", "--prompt", "No-op", "--sandbox", "workspace-write"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--sandbox=workspace-write"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--approval", "on-request"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--network"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--web-search", "live"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--skip-git-repo-check"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--external-provider"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--openai-cli-planner"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--mutating-live"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--tenant-policy-bypass"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--auto-commit"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--commit"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--force"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--live"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--execute"],
  ];

  for (const unsafeArgs of unsafeArgCases) {
    assertRejects(
      () => parseWriteRunnerArgs(unsafeArgs),
      "Unsafe write-capable runner flag rejected:",
      failures,
      `write runner did not reject unsafe args: ${unsafeArgs.join(" ")}`,
    );
  }

  for (const prompt of [
    "Run external-provider validation",
    "Use the OpenAI CLI planner",
    "Run live CEP smoke",
    "Use tenant-policy bypass",
    "Auto-commit the changes",
  ]) {
    assertRejects(
      () => validatePromptPolicy(prompt),
      "Hard-stop policy rejected prompt request:",
      failures,
      `write runner did not reject forbidden prompt request: ${prompt}`,
    );
  }

  const threadOptions = createWriteCapableThreadOptions({ cwd: process.cwd() });
  assertContract(
    threadOptions.sandboxMode === "workspace-write",
    "write runner thread contract is not workspace-write",
    failures,
  );
  assertContract(
    threadOptions.approvalPolicy === "never",
    "write runner thread contract is not approval never",
    failures,
  );
  assertContract(
    threadOptions.networkAccessEnabled === false,
    "write runner thread contract did not disable network",
    failures,
  );
  assertContract(
    threadOptions.webSearchMode === "disabled",
    "write runner thread contract did not disable web search",
    failures,
  );

  const allowedPathCases = [
    ["docs-audit", ".codex-audit/112-sdk-write-capable-runner-scaffold.md"],
    ["docs-audit", "plans/target-app-execplan.md"],
    ["orchestrator", "orchestrator/run-write-capable-scaffold.mjs"],
    ["orchestrator", "package.json"],
    ["production-code", "mcp-server/bridge-daemon.js"],
    ["production-code", "chatgpt-connector/server.js"],
    ["production-code", "scripts/smoke-test.js"],
    ["cep-panel", "cep-panel/panel.js"],
  ];

  for (const [scope, repoPath] of allowedPathCases) {
    assertContract(
      isPathAllowedForScope(scope, repoPath),
      `path should be allowed for ${scope}: ${repoPath}`,
      failures,
    );
  }

  const deniedPathCases = [
    ["docs-audit", "orchestrator/codex-sdk-orchestrator.mjs"],
    ["orchestrator", "mcp-server/bridge-daemon.js"],
    ["production-code", "cep-panel/panel.js"],
    ["cep-panel", "mcp-server/bridge-daemon.js"],
    ["orchestrator", "node_modules/pkg/index.js"],
    ["orchestrator", ".git/config"],
    ["orchestrator", "logs/dev-requests/request.json"],
    ["orchestrator", ".env.local"],
    ["orchestrator", "mcp-config.json"],
  ];

  for (const [scope, repoPath] of deniedPathCases) {
    assertContract(
      !isPathAllowedForScope(scope, repoPath),
      `path should be denied for ${scope}: ${repoPath}`,
      failures,
    );
  }

  const syntheticPre = {
    pathSignatures: {
      "orchestrator/README.md": "same",
      "test": "pre-only",
    },
  };
  const syntheticPost = {
    pathSignatures: {
      "orchestrator/README.md": "changed",
      "test": "pre-only",
    },
  };
  const changedSincePre = collectPathsChangedSincePre(syntheticPre, syntheticPost);

  assertContract(
    changedSincePre.length === 1 && changedSincePre[0] === "orchestrator/README.md",
    "pre/post snapshot diff comparison did not isolate changed paths",
    failures,
  );

  const postContract = validatePostRunContract({
    postSnapshot: syntheticPost,
    preSnapshot: syntheticPre,
    scope: "orchestrator",
    validationResult: { ok: true },
  });

  assertContract(
    postContract.changedSincePre.includes("orchestrator/README.md"),
    "post-run contract did not report changed path",
    failures,
  );

  assertRejects(
    () =>
      validatePostRunContract({
        postSnapshot: {
          pathSignatures: {
            "node_modules/pkg/index.js": "changed",
          },
        },
        preSnapshot: { pathSignatures: {} },
        scope: "orchestrator",
        validationResult: { ok: true },
      }),
    "Forbidden path diff detected after write-capable run:",
    failures,
    "post-run contract did not reject forbidden path diff",
  );

  assertRejects(
    () =>
      validatePostRunContract({
        postSnapshot: {
          pathSignatures: {
            "mcp-server/bridge-daemon.js": "changed",
          },
        },
        preSnapshot: { pathSignatures: {} },
        scope: "orchestrator",
        validationResult: { ok: true },
      }),
    "Path allowlist violation after write-capable run:",
    failures,
    "post-run contract did not reject outside-scope path diff",
  );

  assertRejects(
    () =>
      validatePostRunContract({
        postSnapshot: syntheticPost,
        preSnapshot: syntheticPre,
        scope: "orchestrator",
        validationResult: { ok: false },
      }),
    "Hard-stop policy rejected failed validation result.",
    failures,
    "post-run contract did not reject failed validation",
  );

  assertRejects(
    () =>
      assertPreRunGitState(
        { changedPaths: ["orchestrator/README.md", "test"] },
        { acknowledgedExistingChanges: ["orchestrator/README.md"] },
      ),
    "Dirty unexpected git state before write-capable run:",
    failures,
    "pre-run git state did not reject unacknowledged dirty paths",
  );

  if (failures.length > 0) {
    const message = ["M112 write-capable scaffold contract smoke failed:", ...failures.map((f) => `- ${f}`)].join(
      "\n",
    );
    throw new Error(message);
  }

  return {
    forbiddenPaths: FORBIDDEN_PATH_PATTERNS,
    result: "pass",
    scopes: WRITE_SCOPES,
    unsafeFlags: UNSAFE_WRITE_RUNNER_FLAGS,
  };
}

function printResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Result: ${result.result}`);
  console.log(`Scope: ${result.scope}`);
  console.log(`SDK thread created: ${result.sdkThreadCreated}`);
  console.log(`Auto-commit: ${result.autoCommit}`);
  console.log(`Changed since pre-run: ${result.postContract.changedSincePre.join(", ") || "(none)"}`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseWriteRunnerArgs(argv);

  if (options.help) {
    console.log(HELP.trim());
    return;
  }

  if (options.contractSmoke) {
    const result = runWriteCapableContractSmoke();
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log("PASS M112 write-capable runner scaffold contract smoke");
    return;
  }

  const result = await runWriteCapableScaffold(options);
  printResult(result, Boolean(options.json));
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

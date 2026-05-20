#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const HELP = `
Codex SDK write-capable runner scaffold

Usage:
  node orchestrator/run-write-capable-scaffold.mjs --scope orchestrator --prompt "Implement a narrow orchestrator change"
  node orchestrator/run-write-capable-scaffold.mjs --dry-run --operation-file .codex-audit/m114-operation.json
  node orchestrator/run-write-capable-scaffold.mjs --contract-smoke

Required:
  --scope <name>             docs-audit, orchestrator, production-code, or cep-panel.
                             Required for non-dry scaffold mode.
  --prompt <text>            Requested work. Policy-scanned before any SDK thread can exist.
                             Required for non-dry scaffold mode.

Options:
  --cwd <path>               Working directory. Defaults to the current directory.
  --acknowledge-existing-change <path>
                             Explicitly acknowledge one pre-existing dirty path.
  --dry-run                  Evaluate local safety/path policy only; do not run write work.
  --operation-file <path>    Local JSON planned-operation envelope. Required with --dry-run.
  --planned-path <path>      Planned repo path for programmatic allowlist checks. Repeatable.
  --json                     Print a JSON scaffold envelope.
  --contract-smoke           Run local scaffold contract checks only.
  --help                     Show this help.

This scaffold is non-live. It validates the write contract, captures git snapshots,
reports would-be SDK thread options, and can run a guarded local dry-run, but does not
import the SDK or create a thread.
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

export const OPERATION_ENVELOPE_VERSION = 1;
export const OPERATION_ENVELOPE_MODE = "dry-run";
export const OPERATION_ENVELOPE_REQUIRED_FIELDS = Object.freeze([
  "version",
  "operationId",
  "scope",
  "mode",
  "prompt",
  "plannedPaths",
]);

const UNSAFE_OPERATION_ENVELOPE_FIELDS = Object.freeze([
  "approval",
  "approvalPolicy",
  "auto-commit",
  "autoCommit",
  "commit",
  "danger-full-access",
  "dangerFullAccess",
  "execute",
  "external-provider",
  "externalProvider",
  "force",
  "live",
  "mutating-live",
  "mutatingLive",
  "network",
  "networkAccessEnabled",
  "openai-cli-planner",
  "openaiCliPlanner",
  "realWriteWork",
  "sandbox",
  "sandboxMode",
  "sdkThreadCreated",
  "skip-git-repo-check",
  "skipGitRepoCheck",
  "tenant-policy-bypass",
  "tenantPolicyBypass",
  "unsafe",
  "web-search",
  "webSearch",
  "webSearchMode",
]);

const VALUE_OPTIONS = new Set([
  "acknowledge-existing-change",
  "cwd",
  "operation-file",
  "planned-path",
  "prompt",
  "scope",
]);
const BOOLEAN_OPTIONS = new Set(["contract-smoke", "dry-run", "help", "json"]);

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

export function createPlannedPathCheck(scope, plannedPaths = []) {
  validateScope(scope);

  const normalizedPlannedPaths = uniqueSorted(plannedPaths);
  const violations = getPathContractViolations(scope, normalizedPlannedPaths);
  const violationPaths = new Set(violations.map((violation) => violation.path));

  return {
    allowed: violations.length === 0,
    allowedPaths: normalizedPlannedPaths.filter((repoPath) => !violationPaths.has(repoPath)),
    plannedPaths: normalizedPlannedPaths,
    violations,
  };
}

function isPathInsideDirectory(candidatePath, directoryPath) {
  const relative = path.relative(directoryPath, candidatePath);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveOperationFilePath(operationFile, cwd = process.cwd()) {
  if (!operationFile) {
    throw new Error("Missing required --operation-file for write-capable dry-run mode.");
  }

  const repoRoot = path.resolve(cwd);
  const absolutePath = path.resolve(repoRoot, operationFile);

  if (!isPathInsideDirectory(absolutePath, repoRoot)) {
    throw new Error(`Operation file outside repo: ${operationFile}`);
  }

  return {
    absolutePath,
    repoPath: normalizeRepoPath(path.relative(repoRoot, absolutePath)),
    repoRoot,
  };
}

export function parseOperationEnvelopeJson(text, source = "operation file") {
  let parsed = null;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Malformed operation file JSON: ${source}. ${detail}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Malformed operation file JSON: ${source}. Expected a JSON object.`);
  }

  return validateOperationEnvelope(parsed);
}

export function validateOperationEnvelope(envelope) {
  for (const field of UNSAFE_OPERATION_ENVELOPE_FIELDS) {
    if (Object.hasOwn(envelope, field)) {
      throw new Error(`Unsafe operation envelope field rejected: ${field}`);
    }
  }

  if (envelope.version !== OPERATION_ENVELOPE_VERSION) {
    throw new Error(
      `Unsupported operation envelope version: ${String(
        envelope.version,
      )}. Expected ${OPERATION_ENVELOPE_VERSION}.`,
    );
  }

  if (typeof envelope.operationId !== "string" || envelope.operationId.trim() === "") {
    throw new Error("Missing operation envelope operationId.");
  }

  if (typeof envelope.scope !== "string" || envelope.scope.trim() === "") {
    throw new Error(`Missing operation envelope scope. Expected one of: ${WRITE_SCOPES.join(", ")}.`);
  }

  validateScope(envelope.scope);

  if (envelope.mode !== OPERATION_ENVELOPE_MODE) {
    throw new Error(
      `Unsupported operation envelope mode: ${String(envelope.mode)}. Only dry-run is supported.`,
    );
  }

  if (typeof envelope.prompt !== "string" || envelope.prompt.trim() === "") {
    throw new Error("Missing operation envelope prompt.");
  }

  if (!Array.isArray(envelope.plannedPaths) || envelope.plannedPaths.length === 0) {
    throw new Error("Missing or empty operation envelope plannedPaths.");
  }

  if (envelope.plannedPaths.some((repoPath) => typeof repoPath !== "string")) {
    throw new Error("Operation envelope plannedPaths entries must be strings.");
  }

  const plannedPaths = envelope.plannedPaths.map(normalizeRepoPath);
  if (plannedPaths.some((repoPath) => repoPath === "")) {
    throw new Error("Operation envelope plannedPaths contains an empty path.");
  }

  validatePromptPolicy(envelope.prompt);

  const plannedPathCheck = createPlannedPathCheck(envelope.scope, plannedPaths);
  if (!plannedPathCheck.allowed) {
    const summary = plannedPathCheck.violations
      .map((violation) => `${violation.path} (${violation.reason})`)
      .join(", ");
    const hasUnsafeShape = plannedPathCheck.violations.some(
      (violation) => violation.reason === "unsafe-path-shape",
    );
    const hasForbiddenPath = plannedPathCheck.violations.some(
      (violation) => violation.reason === "forbidden-path",
    );

    if (hasUnsafeShape) {
      throw new Error(`Operation envelope plannedPaths include unsafe path shapes: ${summary}`);
    }

    if (hasForbiddenPath) {
      throw new Error(`Operation envelope plannedPaths include forbidden paths: ${summary}`);
    }

    throw new Error(`Operation envelope plannedPaths outside scope allowlist: ${summary}`);
  }

  return {
    mode: envelope.mode,
    operationId: envelope.operationId.trim(),
    plannedPathCheck,
    plannedPaths,
    prompt: envelope.prompt,
    scope: envelope.scope,
    version: envelope.version,
  };
}

export function loadOperationEnvelopeOptions(options = {}, hooks = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const resolved = resolveOperationFilePath(options.operationFile, cwd);
  const fileExists = hooks.existsSync || existsSync;
  const fileStats = hooks.statSync || statSync;
  const readFile = hooks.readFileSync || readFileSync;
  const realpath = hooks.realpathSync || realpathSync;

  if (!fileExists(resolved.absolutePath)) {
    throw new Error(`Missing operation file: ${resolved.repoPath || options.operationFile}`);
  }

  if (!fileStats(resolved.absolutePath).isFile()) {
    throw new Error(`Operation file is not a file: ${resolved.repoPath}`);
  }

  const realRepoRoot = realpath(resolved.repoRoot);
  const realOperationFile = realpath(resolved.absolutePath);
  if (!isPathInsideDirectory(realOperationFile, realRepoRoot)) {
    throw new Error(`Operation file outside repo: ${options.operationFile}`);
  }

  const operationEnvelope = parseOperationEnvelopeJson(
    readFile(resolved.absolutePath, "utf8"),
    resolved.repoPath,
  );

  return {
    ...options,
    dryRun: true,
    mode: OPERATION_ENVELOPE_MODE,
    operationEnvelope: {
      mode: operationEnvelope.mode,
      operationId: operationEnvelope.operationId,
      sourcePath: resolved.repoPath,
      version: operationEnvelope.version,
    },
    operationFilePath: resolved.absolutePath,
    operationFileRepoPath: resolved.repoPath,
    plannedPaths: operationEnvelope.plannedPaths,
    prompt: operationEnvelope.prompt,
    scope: operationEnvelope.scope,
  };
}

export function parseWriteRunnerArgs(argv) {
  const options = { acknowledgedExistingChanges: [], plannedPaths: [] };
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
    } else if (name === "operation-file") {
      options.operationFile = value;
    } else if (name === "planned-path") {
      options.plannedPaths.push(normalizeRepoPath(value));
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

  validateWriteRunnerCliOptions(options);
  return options;
}

export function validateWriteRunnerCliOptions(options) {
  if (options.help || options.contractSmoke) {
    return;
  }

  if (options.operationFile && !options.dryRun) {
    throw new Error("Operation file is supported only with --dry-run in M114.");
  }

  if (options.dryRun && !options.operationFile) {
    throw new Error("Missing required --operation-file for write-capable dry-run mode.");
  }

  if (options.operationFile) {
    if (options.scope || options.prompt || options.plannedPaths.length > 0) {
      throw new Error(
        "Do not combine --operation-file with --scope, --prompt, or --planned-path; put those fields in the operation envelope.",
      );
    }
    return;
  }

  validateWriteRunnerOptions(options);
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

export function evaluatePreRunGitState(snapshot, options = {}) {
  const changedPaths = uniqueSorted(snapshot.changedPaths || []);
  const acknowledged = uniqueSorted(options.acknowledgedExistingChanges || []);

  if (changedPaths.length === 0) {
    return {
      acknowledgedExistingChanges: acknowledged,
      changedPaths,
      forbiddenExisting: [],
      ok: true,
      staleAcknowledgements: [],
      status: "clean",
      unexpected: [],
    };
  }

  const unexpected =
    acknowledged.length === 0
      ? changedPaths
      : changedPaths.filter((repoPath) => !acknowledged.includes(repoPath));
  const staleAcknowledgements =
    acknowledged.length === 0
      ? []
      : acknowledged.filter((repoPath) => !changedPaths.includes(repoPath));
  const forbiddenExisting = changedPaths.filter(isForbiddenPath);

  return {
    acknowledgedExistingChanges: acknowledged,
    changedPaths,
    forbiddenExisting,
    ok:
      unexpected.length === 0 &&
      staleAcknowledgements.length === 0 &&
      forbiddenExisting.length === 0,
    staleAcknowledgements,
    status: "dirty",
    unexpected,
  };
}

export function assertPreRunGitState(snapshot, options = {}) {
  const state = evaluatePreRunGitState(snapshot, options);

  if (state.ok) {
    return;
  }

  if (state.acknowledgedExistingChanges.length === 0) {
    throw new Error(
      `Dirty unexpected git state before write-capable run: ${state.changedPaths.join(", ")}`,
    );
  }

  if (state.unexpected.length > 0) {
    throw new Error(
      `Dirty unexpected git state before write-capable run: ${state.unexpected.join(", ")}`,
    );
  }

  if (state.staleAcknowledgements.length > 0) {
    throw new Error(
      `Acknowledged paths are not dirty and may be stale: ${state.staleAcknowledgements.join(", ")}`,
    );
  }

  if (state.forbiddenExisting.length > 0) {
    throw new Error(
      `Forbidden path dirty before write-capable run: ${state.forbiddenExisting.join(", ")}`,
    );
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

export function runWriteCapableDryRun(options, hooks = {}) {
  const preparedOptions = options.operationFile
    ? loadOperationEnvelopeOptions(options, hooks)
    : options;

  validateWriteRunnerOptions(preparedOptions);
  validatePromptPolicy(preparedOptions.prompt);

  const cwd = path.resolve(preparedOptions.cwd || process.cwd());
  const captureSnapshot = hooks.captureGitSnapshot || captureGitSnapshot;
  const preSnapshot = captureSnapshot({ cwd, label: "dry-run-pre" });
  const preRunGitState = evaluatePreRunGitState(preSnapshot, {
    acknowledgedExistingChanges: preparedOptions.acknowledgedExistingChanges,
  });
  const plannedPathCheck = createPlannedPathCheck(
    preparedOptions.scope,
    preparedOptions.plannedPaths,
  );
  const threadOptions = createWriteCapableThreadOptions({ cwd });
  const wouldAllow = preRunGitState.ok && plannedPathCheck.allowed;

  return {
    autoCommit: false,
    dryRun: true,
    plannedPathCheck,
    preRunGitState,
    preSnapshot,
    realWriteWork: false,
    result: wouldAllow ? "dry-run-allowed" : "dry-run-denied",
    operationEnvelope: preparedOptions.operationEnvelope,
    scope: preparedOptions.scope,
    sdkThreadCreated: false,
    threadOptions,
    wouldAllow,
  };
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

  const validOperationEnvelope = {
    version: OPERATION_ENVELOPE_VERSION,
    operationId: "m114-contract-smoke",
    scope: "orchestrator",
    mode: OPERATION_ENVELOPE_MODE,
    prompt: "Check local operation envelope policy.",
    plannedPaths: ["orchestrator/README.md", "package.json"],
  };
  const parsedDryRun = parseWriteRunnerArgs([
    "--dry-run",
    "--operation-file",
    ".codex-audit/m114-operation-envelope.json",
  ]);

  assertContract(parsedDryRun.dryRun === true, "write runner did not parse dry-run mode", failures);
  assertContract(
    parsedDryRun.operationFile === ".codex-audit/m114-operation-envelope.json",
    "write runner did not parse dry-run operation file",
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

  assertRejects(
    () => parseWriteRunnerArgs(["--dry-run"]),
    "Missing required --operation-file",
    failures,
    "dry-run mode did not require an operation file",
  );

  assertRejects(
    () =>
      parseWriteRunnerArgs([
        "--dry-run",
        "--operation-file",
        ".codex-audit/m114-operation-envelope.json",
        "--scope",
        "orchestrator",
      ]),
    "Do not combine --operation-file",
    failures,
    "dry-run operation envelope mode allowed conflicting CLI scope",
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

  for (const unsafeArgs of unsafeArgCases) {
    assertRejects(
      () => parseWriteRunnerArgs(["--dry-run", ...unsafeArgs]),
      "Unsafe write-capable runner flag rejected:",
      failures,
      `dry-run mode did not reject unsafe args: ${unsafeArgs.join(" ")}`,
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

  const validatedEnvelope = validateOperationEnvelope(validOperationEnvelope);
  assertContract(
    validatedEnvelope.operationId === "m114-contract-smoke" &&
      validatedEnvelope.scope === "orchestrator" &&
      validatedEnvelope.mode === OPERATION_ENVELOPE_MODE &&
      validatedEnvelope.plannedPaths.join(",") === "orchestrator/README.md,package.json",
    "operation envelope did not validate the expected schema",
    failures,
  );

  assertRejects(
    () => resolveOperationFilePath(path.join("..", "outside-operation.json"), process.cwd()),
    "Operation file outside repo:",
    failures,
    "operation envelope did not reject file outside repo",
  );

  assertRejects(
    () =>
      loadOperationEnvelopeOptions({
        dryRun: true,
        operationFile: ".codex-audit/missing-operation-envelope.json",
      }),
    "Missing operation file:",
    failures,
    "operation envelope did not reject a missing operation file",
  );

  assertRejects(
    () => parseOperationEnvelopeJson("{not-json", "contract-smoke"),
    "Malformed operation file JSON:",
    failures,
    "operation envelope did not reject malformed JSON",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, version: 2 }),
    "Unsupported operation envelope version:",
    failures,
    "operation envelope did not reject unsupported version",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, operationId: "" }),
    "Missing operation envelope operationId.",
    failures,
    "operation envelope did not reject missing operationId",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, scope: "" }),
    "Missing operation envelope scope.",
    failures,
    "operation envelope did not reject missing scope",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, scope: "unknown" }),
    "Unknown write scope:",
    failures,
    "operation envelope did not reject unknown scope",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, mode: "live" }),
    "Unsupported operation envelope mode:",
    failures,
    "operation envelope did not reject non-dry-run mode",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, prompt: "" }),
    "Missing operation envelope prompt.",
    failures,
    "operation envelope did not reject missing prompt",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, plannedPaths: [] }),
    "Missing or empty operation envelope plannedPaths.",
    failures,
    "operation envelope did not reject empty plannedPaths",
  );

  assertRejects(
    () =>
      validateOperationEnvelope({
        ...validOperationEnvelope,
        plannedPaths: ["../outside.txt"],
      }),
    "Operation envelope plannedPaths include unsafe path shapes:",
    failures,
    "operation envelope did not reject unsafe planned path shape",
  );

  assertRejects(
    () =>
      validateOperationEnvelope({
        ...validOperationEnvelope,
        plannedPaths: ["node_modules/pkg/index.js"],
      }),
    "Operation envelope plannedPaths include forbidden paths:",
    failures,
    "operation envelope did not reject forbidden planned path",
  );

  assertRejects(
    () =>
      validateOperationEnvelope({
        ...validOperationEnvelope,
        plannedPaths: ["mcp-server/bridge-daemon.js"],
      }),
    "Operation envelope plannedPaths outside scope allowlist:",
    failures,
    "operation envelope did not reject outside-scope planned path",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, sandboxMode: "workspace-write" }),
    "Unsafe operation envelope field rejected:",
    failures,
    "operation envelope did not reject unsafe bypass-capable fields",
  );

  assertRejects(
    () =>
      parseWriteRunnerArgs([
        "--dry-run",
        "--operation-file",
        ".codex-audit/m114-operation-envelope.json",
        "--network",
      ]),
    "Unsafe write-capable runner flag rejected:",
    failures,
    "operation envelope dry-run did not reject unsafe CLI flags",
  );

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

  const plannedAllowed = createPlannedPathCheck("orchestrator", [
    "orchestrator/run-write-capable-scaffold.mjs",
    "package.json",
  ]);
  assertContract(
    plannedAllowed.allowed &&
      plannedAllowed.allowedPaths.length === 2 &&
      plannedAllowed.violations.length === 0,
    "dry-run planned allowlist check did not allow orchestrator paths",
    failures,
  );

  const plannedForbidden = createPlannedPathCheck("orchestrator", [
    "node_modules/pkg/index.js",
  ]);
  assertContract(
    plannedForbidden.allowed === false &&
      plannedForbidden.violations[0]?.reason === "forbidden-path",
    "dry-run planned path check did not reject forbidden path",
    failures,
  );

  const plannedOutsideScope = createPlannedPathCheck("orchestrator", [
    "mcp-server/bridge-daemon.js",
  ]);
  assertContract(
    plannedOutsideScope.allowed === false &&
      plannedOutsideScope.violations[0]?.reason === "outside-scope-allowlist",
    "dry-run planned path check did not reject outside-scope path",
    failures,
  );

  const plannedUnsafeShape = createPlannedPathCheck("orchestrator", ["../outside.txt"]);
  assertContract(
    plannedUnsafeShape.allowed === false &&
      plannedUnsafeShape.violations[0]?.reason === "unsafe-path-shape",
    "dry-run planned path check did not reject unsafe path shape",
    failures,
  );

  const syntheticCleanSnapshot = {
    changedPaths: [],
    cwd: process.cwd(),
    pathSignatures: {},
  };
  const dryRunAllowed = runWriteCapableDryRun(
    {
      dryRun: true,
      plannedPaths: ["orchestrator/README.md"],
      prompt: "Check local dry-run policy.",
      scope: "orchestrator",
    },
    { captureGitSnapshot: () => syntheticCleanSnapshot },
  );

  assertContract(
    dryRunAllowed.result === "dry-run-allowed" &&
      dryRunAllowed.wouldAllow === true &&
      dryRunAllowed.sdkThreadCreated === false &&
      dryRunAllowed.realWriteWork === false &&
      dryRunAllowed.autoCommit === false,
    "dry-run allowed result did not preserve local-only safety contract",
    failures,
  );

  const dryRunEnvelopeAllowed = runWriteCapableDryRun(
    {
      dryRun: true,
      operationFile: ".codex-audit/m114-operation-envelope.json",
    },
    {
      captureGitSnapshot: () => syntheticCleanSnapshot,
      existsSync: () => true,
      readFileSync: () => JSON.stringify(validOperationEnvelope),
      realpathSync: (value) => value,
      statSync: () => ({ isFile: () => true }),
    },
  );

  assertContract(
    dryRunEnvelopeAllowed.result === "dry-run-allowed" &&
      dryRunEnvelopeAllowed.operationEnvelope?.operationId === "m114-contract-smoke" &&
      dryRunEnvelopeAllowed.sdkThreadCreated === false &&
      dryRunEnvelopeAllowed.realWriteWork === false &&
      dryRunEnvelopeAllowed.autoCommit === false,
    "operation envelope dry-run did not preserve local-only safety report fields",
    failures,
  );

  const dryRunDenied = runWriteCapableDryRun(
    {
      dryRun: true,
      plannedPaths: ["node_modules/pkg/index.js"],
      prompt: "Check local dry-run policy.",
      scope: "orchestrator",
    },
    { captureGitSnapshot: () => syntheticCleanSnapshot },
  );

  assertContract(
    dryRunDenied.result === "dry-run-denied" &&
      dryRunDenied.wouldAllow === false &&
      dryRunDenied.plannedPathCheck.violations[0]?.reason === "forbidden-path",
    "dry-run denied result did not report forbidden planned path",
    failures,
  );

  const dryRunDirtyDenied = runWriteCapableDryRun(
    {
      dryRun: true,
      plannedPaths: ["orchestrator/README.md"],
      prompt: "Check local dry-run policy.",
      scope: "orchestrator",
    },
    {
      captureGitSnapshot: () => ({
        changedPaths: ["orchestrator/README.md"],
        cwd: process.cwd(),
        pathSignatures: {},
      }),
    },
  );

  assertContract(
    dryRunDirtyDenied.result === "dry-run-denied" &&
      dryRunDirtyDenied.preRunGitState.unexpected.includes("orchestrator/README.md"),
    "dry-run did not report unacknowledged pre-run dirty state",
    failures,
  );

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
    const message = ["M114 write-capable scaffold contract smoke failed:", ...failures.map((f) => `- ${f}`)].join(
      "\n",
    );
    throw new Error(message);
  }

  return {
    dryRunMode: "pass",
    forbiddenPaths: FORBIDDEN_PATH_PATTERNS,
    operationEnvelopeMode: "pass",
    operationEnvelopeVersion: OPERATION_ENVELOPE_VERSION,
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
  if (result.operationEnvelope) {
    console.log(`Operation: ${result.operationEnvelope.operationId}`);
    console.log(`Operation file: ${result.operationEnvelope.sourcePath}`);
  }
  console.log(`SDK thread created: ${result.sdkThreadCreated}`);
  console.log(`Auto-commit: ${result.autoCommit}`);
  if (result.dryRun) {
    console.log(`Real write work: ${result.realWriteWork}`);
    console.log(`Would allow: ${result.wouldAllow}`);
    console.log(
      `Planned paths: ${result.plannedPathCheck.plannedPaths.join(", ") || "(none supplied)"}`,
    );
    console.log(
      `Path violations: ${
        result.plannedPathCheck.violations
          .map((violation) => `${violation.path} (${violation.reason})`)
          .join(", ") || "(none)"
      }`,
    );
    console.log(`Pre-run git state: ${result.preRunGitState.status}`);
    if (result.preRunGitState.unexpected.length > 0) {
      console.log(`Unexpected dirty paths: ${result.preRunGitState.unexpected.join(", ")}`);
    }
    return;
  }
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
    console.log("PASS M114 write-capable runner scaffold contract smoke");
    return;
  }

  const result = options.dryRun
    ? runWriteCapableDryRun(options)
    : await runWriteCapableScaffold(options);
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

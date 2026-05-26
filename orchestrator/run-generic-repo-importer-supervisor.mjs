#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const IMPORTER_ROOT_RELATIVE = ".codex-runtime/sdk/generic-repo-importer";
const SUPERVISOR_ROOT_RELATIVE = ".codex-runtime/sdk/generic-repo-importer-supervisor";
const STATUS_SCHEMA = "generic-repo-importer-supervisor.status.v1";
const STATE_SCHEMA = "generic-repo-importer-supervisor.state.v1";
const AUXILIARY_ID = "AUX-025";
const DEFAULT_LIVE_TIMEOUT_MS = 45000;

const DEPENDENCY_PATHS = new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "deno.json",
  "deno.lock",
  "jsr.json",
]);

const HELP = `
Generic repository importer supervisor mission shell

Usage:
  node orchestrator/run-generic-repo-importer-supervisor.mjs --run-id <id> --status
  node orchestrator/run-generic-repo-importer-supervisor.mjs --state <path> --status --json
  node orchestrator/run-generic-repo-importer-supervisor.mjs --run-id <id> --closeout --inspect-live --write-handoff

Options:
  --run-id <id>          Existing importer run id under ${IMPORTER_ROOT_RELATIVE}/.
  --state <path>         Existing importer state.json path.
  --manifest <path>      Optional manifest path when state does not include one.
  --session-id <id>      Stable supervisor runtime session id.
  --extra-owned-path <p> Additional already-known dirty path allowed for this supervisor invocation.
  --context-percent <n>  Context meter percent. Values >= 70 fail closed before new work.
  --live-command <cmd>   Optional generated-only OpenAI CLI live command to run after read-only preflight passes.
  --live-timeout-ms <n>  Timeout for each live command. Default ${DEFAULT_LIVE_TIMEOUT_MS}.
  --status              Inspect durable state and write a compact status artifact. Default mode.
  --inspect-live        Run read-only CEP/CDP inspect and connector-status checks when closeout reaches live gate.
  --allow-ancestor-head-drift
                         Permit target HEAD drift only when importer targetHead is an ancestor of current HEAD.
  --allow-generated-live
                         Permit --live-command execution after generated-only/OpenAI CLI policy checks.
  --closeout            Stop at the current reviewable closeout gate and record live unavailable/pass evidence.
  --write-handoff       Update .codex/handoff.md in the target repo with compact mission state.
  --json                Print machine-readable output.
  --help                Show this help.

The supervisor is a small durable shell for existing importer runs. It does not
create worktrees, apply merges, edit source repositories, use Local/Ollama,
change dependencies, push, create PRs, or mutate AE assets outside an explicit
generated-only live command.
`;

const VALUE_OPTIONS = new Set([
  "context-percent",
  "extra-owned-path",
  "live-command",
  "live-timeout-ms",
  "manifest",
  "run-id",
  "session-id",
  "state",
]);

const BOOLEAN_OPTIONS = new Set([
  "allow-generated-live",
  "allow-ancestor-head-drift",
  "closeout",
  "help",
  "inspect-live",
  "json",
  "status",
  "write-handoff",
]);

class SupervisorError extends Error {
  constructor(message, report = null) {
    super(message);
    this.name = "SupervisorError";
    this.report = report;
  }
}

function splitInlineOption(raw) {
  const index = raw.indexOf("=");
  if (index === -1) {
    return { inlineValue: undefined, name: raw };
  }
  return { inlineValue: raw.slice(index + 1), name: raw.slice(0, index) };
}

function parseArgs(argv) {
  const options = { extraOwnedPath: [] };
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
    if (name === "extra-owned-path") {
      options.extraOwnedPath.push(value);
    } else {
      options[toCamelCase(name)] = value;
    }
    if (inlineValue === undefined) {
      index += 1;
    }
  }
  return options;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function normalizeRepoPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function safeToken(value) {
  return String(value || "mission")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function nowToken() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label}-read-failed: ${filePath}: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendEvent(runtime, event) {
  appendFileSync(
    runtime.eventsPath,
    `${JSON.stringify({ at: new Date().toISOString(), auxiliaryId: AUXILIARY_ID, ...event })}\n`,
    "utf8",
  );
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function fileSnapshot(targetRepo, relativePath) {
  const absolute = path.join(targetRepo, relativePath);
  if (!existsSync(absolute)) {
    return { bytes: 0, exists: false, path: normalizeRepoPath(relativePath), sha256: null };
  }
  const stats = statSync(absolute);
  if (!stats.isFile()) {
    return { bytes: 0, exists: true, path: normalizeRepoPath(relativePath), sha256: "directory" };
  }
  return {
    bytes: stats.size,
    exists: true,
    path: normalizeRepoPath(relativePath),
    sha256: sha256File(absolute),
  };
}

function gitOutput(cwd, args, label = args.join(" ")) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git-${label}-failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function gitStatusEntries(cwd) {
  return gitOutput(cwd, ["status", "--porcelain=v1", "--untracked-files=all"], "status")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function statusEntryPath(entry) {
  const raw = entry.slice(3).trim();
  const renameIndex = raw.indexOf(" -> ");
  return normalizeRepoPath(renameIndex === -1 ? raw : raw.slice(renameIndex + 4));
}

function gitChangedPaths(cwd) {
  return uniqueSorted(gitStatusEntries(cwd).map(statusEntryPath));
}

function gitHead(cwd) {
  return gitOutput(cwd, ["rev-parse", "HEAD"], "rev-parse-head").trim();
}

function gitBranch(cwd) {
  return gitOutput(cwd, ["branch", "--show-current"], "branch-show-current").trim();
}

function sourceHeadIfGit(sourcePath) {
  if (!sourcePath || !existsSync(path.join(sourcePath, ".git"))) {
    return null;
  }
  return gitHead(sourcePath);
}

function uniqueSorted(values) {
  return Array.from(new Set(values.map(normalizeRepoPath).filter(Boolean))).sort();
}

function pathMatchesPattern(repoPath, pattern) {
  const normalizedPath = normalizeRepoPath(repoPath);
  const normalizedPattern = normalizeRepoPath(pattern);
  if (normalizedPattern.endsWith("/**")) {
    return normalizedPath === normalizedPattern.slice(0, -3) || normalizedPath.startsWith(normalizedPattern.slice(0, -2));
  }
  return normalizedPath === normalizedPattern;
}

function isDependencyPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  return DEPENDENCY_PATHS.has(normalized) || normalized.split("/").some((part) => DEPENDENCY_PATHS.has(part));
}

function parseFiniteNumber(value, label, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label}-invalid-number: ${value}`);
  }
  return parsed;
}

function resolveRunContext(options, cwd) {
  if (options.runId && options.state) {
    throw new Error("Use either --run-id or --state, not both.");
  }
  let statePath;
  if (options.state) {
    statePath = path.resolve(cwd, options.state);
  } else if (options.runId) {
    statePath = path.resolve(cwd, IMPORTER_ROOT_RELATIVE, options.runId, "state.json");
  } else if (options.manifest) {
    const manifest = readJson(path.resolve(cwd, options.manifest), "manifest");
    if (!manifest.run || !manifest.run.runId) {
      throw new Error("manifest-run-id-missing");
    }
    statePath = path.resolve(cwd, IMPORTER_ROOT_RELATIVE, manifest.run.runId, "state.json");
  } else {
    throw new Error("Missing --run-id, --state, or --manifest.");
  }
  if (!existsSync(statePath)) {
    throw new Error(`importer-state-missing: ${statePath}`);
  }

  const state = readJson(statePath, "importer-state");
  const runRoot = path.dirname(statePath);
  const runId = state.runId || options.runId || path.basename(runRoot);
  const manifestPath = path.resolve(
    cwd,
    options.manifest || state.manifestPath || path.join(runRoot, "manifest.normalized.json"),
  );
  if (!existsSync(manifestPath)) {
    throw new Error(`importer-manifest-missing: ${manifestPath}`);
  }
  const manifest = readJson(manifestPath, "importer-manifest");
  const targetRepo = path.resolve(
    cwd,
    state.targetRepo || (manifest.targetRepo && manifest.targetRepo.path) || cwd,
  );
  return {
    manifest,
    manifestPath,
    runId,
    runRoot,
    state,
    statePath,
    targetRepo,
  };
}

function createRuntime(targetRepo, runId, options) {
  const sessionId = safeToken(options.sessionId || `${runId}-${nowToken()}`);
  const repoPath = normalizeRepoPath(path.posix.join(SUPERVISOR_ROOT_RELATIVE, sessionId));
  const absolute = path.join(targetRepo, repoPath);
  mkdirSync(absolute, { recursive: true });
  mkdirSync(path.join(absolute, "live"), { recursive: true });
  return {
    absolute,
    eventsPath: path.join(absolute, "events.jsonl"),
    liveDir: path.join(absolute, "live"),
    repoPath,
    sessionId,
    statePath: path.join(absolute, "state.json"),
    statusReportPath: path.join(absolute, "status-report.json"),
  };
}

function blocker(code, message, details = {}) {
  return { code, details, message };
}

function verifyDirtyOwnership(targetRepo, ownedPatterns) {
  const changedPaths = gitChangedPaths(targetRepo);
  const ownedDirtyPaths = uniqueSorted(ownedPatterns);
  const unownedDirtyPaths = changedPaths.filter(
    (repoPath) => !ownedDirtyPaths.some((pattern) => pathMatchesPattern(repoPath, pattern)),
  );
  const dependencyDirtyPaths = changedPaths.filter(isDependencyPath);
  return {
    changedPaths,
    dependencyDirtyPaths,
    ownedDirtyPaths,
    unownedDirtyPaths,
  };
}

function verifyNonLiveReport(runRoot, targetRepo, state) {
  const reportPath = path.join(runRoot, "validation", "non-live-report.json");
  if (!existsSync(reportPath)) {
    return {
      blockers: [blocker("non-live-report-missing", `Missing non-live report: ${reportPath}`)],
      report: null,
      reportPath,
      snapshotStatus: "missing",
      status: "missing",
    };
  }

  const report = readJson(reportPath, "non-live-report");
  const blockers = [];
  if (report.status !== "passed") {
    blockers.push(blocker("non-live-validation-failed", `Non-live report status is ${report.status || "(missing)"}.`));
  }
  if (report.runId && state.runId && report.runId !== state.runId) {
    blockers.push(blocker("non-live-report-run-mismatch", `Non-live report run id ${report.runId} does not match ${state.runId}.`));
  }

  const snapshots = Array.isArray(report.afterSnapshot) ? report.afterSnapshot : [];
  const staleSnapshots = [];
  for (const expected of snapshots) {
    const actual = fileSnapshot(targetRepo, expected.path);
    if (
      actual.exists !== expected.exists ||
      actual.bytes !== expected.bytes ||
      actual.sha256 !== expected.sha256
    ) {
      staleSnapshots.push({ actual, expected });
    }
  }
  if (snapshots.length === 0) {
    blockers.push(blocker("non-live-report-snapshot-missing", "Non-live report has no afterSnapshot evidence."));
  }
  if (staleSnapshots.length > 0) {
    blockers.push(
      blocker("non-live-report-stale", "Current imported files no longer match non-live report snapshots.", {
        stalePaths: staleSnapshots.map((entry) => entry.expected.path),
      }),
    );
  }

  return {
    blockers,
    report,
    reportPath,
    snapshotStatus: staleSnapshots.length > 0 ? "stale" : "matched",
    status: report.status || "unknown",
  };
}

function verifyStateForCloseout(state) {
  const blockers = [];
  if (state.currentPhase !== "non_live_validation_complete" || state.nextPhase !== "live_acceptance") {
    blockers.push(
      blocker(
        "unexpected-importer-phase",
        `Expected non_live_validation_complete -> live_acceptance, got ${state.currentPhase || "(missing)"} -> ${state.nextPhase || "(missing)"}.`,
      ),
    );
  }
  if (state.stopReason !== "stopped_before_live_acceptance") {
    blockers.push(
      blocker("unexpected-stop-reason", `Expected stopped_before_live_acceptance, got ${state.stopReason || "(missing)"}.`),
    );
  }
  if (!state.flags || state.flags.validationCommandsRun !== true || state.flags.nonLiveValidationComplete !== true) {
    blockers.push(blocker("non-live-state-incomplete", "Importer state does not record completed non-live validation."));
  }
  if (state.flags && state.flags.localOllamaUsed === true) {
    blockers.push(blocker("local-ollama-used", "Importer state records Local/Ollama use."));
  }
  if (state.flags && state.flags.dependencyChanged === true) {
    blockers.push(blocker("dependency-change-recorded", "Importer state records dependency/package changes."));
  }
  return blockers;
}

function gitIsAncestor(cwd, maybeAncestor, descendant) {
  if (!maybeAncestor || !descendant) {
    return false;
  }
  const result = spawnSync("git", ["merge-base", "--is-ancestor", maybeAncestor, descendant], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function verifyBranchAndHead(targetRepo, state, options = {}) {
  const currentHead = gitHead(targetRepo);
  const currentBranch = gitBranch(targetRepo);
  const blockers = [];
  let headDrift = null;
  if (state.targetHead && currentHead !== state.targetHead) {
    const ancestorAllowed = options.allowAncestorHeadDrift === true && gitIsAncestor(targetRepo, state.targetHead, currentHead);
    headDrift = {
      allowed: ancestorAllowed,
      currentHead,
      expectedHead: state.targetHead,
      mode: ancestorAllowed ? "ancestor" : "blocked",
    };
    if (!ancestorAllowed) {
      blockers.push(
        blocker("branch-or-head-drift", `Target HEAD drifted from importer state ${state.targetHead} to ${currentHead}.`, {
          currentHead,
          expectedHead: state.targetHead,
        }),
      );
    }
  }
  if (state.targetBranch && currentBranch !== state.targetBranch) {
    blockers.push(
      blocker("branch-or-head-drift", `Target branch drifted from importer state ${state.targetBranch} to ${currentBranch}.`, {
        currentBranch,
        expectedBranch: state.targetBranch,
      }),
    );
  }
  return { blockers, currentBranch, currentHead, headDrift };
}

function verifySourceRevision(manifest) {
  const sourceRepo = manifest.sourceRepo || {};
  const sourceLocation = sourceRepo.location ? path.resolve(REPO_ROOT, sourceRepo.location) : null;
  const actualRevision = sourceHeadIfGit(sourceLocation);
  const expectedRevision = sourceRepo.revision || null;
  const blockers = [];
  if (expectedRevision && actualRevision && actualRevision !== expectedRevision) {
    blockers.push(
      blocker("source-revision-drift", `Source checkout drifted from ${expectedRevision} to ${actualRevision}.`, {
        actualRevision,
        expectedRevision,
      }),
    );
  }
  return {
    actualRevision,
    blockers,
    expectedRevision,
    sourceLocation,
  };
}

function verifyContext(options) {
  const contextPercent = parseFiniteNumber(options.contextPercent, "context-percent", null);
  if (contextPercent === null) {
    return { blockers: [], contextPercent: null, status: "not_provided" };
  }
  if (contextPercent >= 70) {
    return {
      blockers: [
        blocker("context-pressure", `Context percent ${contextPercent} is at or above the project handoff threshold.`),
      ],
      contextPercent,
      status: "handoff_required",
    };
  }
  return { blockers: [], contextPercent, status: "ok" };
}

function livePolicy(manifest) {
  const liveAcceptance = manifest.liveAcceptance || {};
  const generatedPolicy = liveAcceptance.generatedOnlyPolicy || {};
  const providerPath = String(liveAcceptance.providerPath || "");
  const blockers = [];
  if (generatedPolicy.required !== true) {
    blockers.push(blocker("live-generated-only-policy-missing", "Live acceptance does not require generated-only policy."));
  }
  if (!/openai cli|codex cli/i.test(providerPath)) {
    blockers.push(blocker("live-provider-policy-unsafe", `Live provider path must be OpenAI CLI/Codex CLI, got: ${providerPath}`));
  }
  if (/local|ollama|openrouter/i.test(providerPath)) {
    blockers.push(blocker("live-provider-policy-unsafe", `Live provider path names forbidden fallback provider: ${providerPath}`));
  }
  return {
    blockers,
    generatedPrefix: generatedPolicy.generatedPrefix || null,
    providerPath,
    required: generatedPolicy.required === true,
  };
}

function verifyGeneratedLiveCommand(command) {
  if (!command) {
    return { blockers: [], status: "not_configured" };
  }
  const blockers = [];
  if (!/\bopenai-cli\b/i.test(command)) {
    blockers.push(blocker("live-command-not-openai-cli", "Generated live command must be an OpenAI CLI lane."));
  }
  if (/\b(?:ollama|local|openrouter)\b/i.test(command)) {
    blockers.push(blocker("live-command-forbidden-provider", "Generated live command references Local/Ollama/OpenRouter."));
  }
  if (/\bsmoke\b/i.test(command) && !/\bagent\b/i.test(command)) {
    blockers.push(blocker("live-command-too-broad", "Live command must be a narrow agent generated-only lane, not a broad smoke."));
  }
  return { blockers, status: blockers.length === 0 ? "configured" : "blocked" };
}

function runLoggedCommand({ args, cwd, label, logDir, timeoutMs }) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });
  const completedAt = new Date().toISOString();
  const stdoutPath = path.join(logDir, `${label}-stdout.txt`);
  const stderrPath = path.join(logDir, `${label}-stderr.txt`);
  writeFileSync(stdoutPath, result.stdout || "", "utf8");
  writeFileSync(stderrPath, result.stderr || "", "utf8");
  return {
    args,
    completedAt,
    error: result.error ? result.error.message : null,
    exitCode: result.status,
    signal: result.signal || null,
    startedAt,
    status: result.status === 0 ? "passed" : "failed",
    stderrPath: normalizeRepoPath(path.relative(cwd, stderrPath)),
    stdoutPath: normalizeRepoPath(path.relative(cwd, stdoutPath)),
    timedOut: result.error && result.error.code === "ETIMEDOUT",
  };
}

function inspectLiveAvailability(targetRepo, runtime, options) {
  const timeoutMs = parseFiniteNumber(options.liveTimeoutMs, "live-timeout-ms", DEFAULT_LIVE_TIMEOUT_MS);
  const inspect = runLoggedCommand({
    args: [process.execPath, "scripts/cep-panel-cdp-smoke.js", "inspect"],
    cwd: targetRepo,
    label: "01-inspect",
    logDir: runtime.liveDir,
    timeoutMs,
  });
  const connector = runLoggedCommand({
    args: [process.execPath, "scripts/cep-panel-cdp-smoke.js", "connector-status-smoke"],
    cwd: targetRepo,
    label: "02-connector-status-smoke",
    logDir: runtime.liveDir,
    timeoutMs,
  });
  const commands = [inspect, connector];
  const passed = commands.every((entry) => entry.status === "passed");
  return {
    available: passed,
    commands,
    reason: passed ? null : "read-only CEP/CDP inspect or connector-status smoke is unavailable",
    status: passed ? "passed" : "unavailable",
  };
}

function runGeneratedLiveAcceptance(targetRepo, runtime, options, livePreflight) {
  const commandPolicy = verifyGeneratedLiveCommand(options.liveCommand);
  if (commandPolicy.blockers.length > 0) {
    return {
      blockers: commandPolicy.blockers,
      command: options.liveCommand || null,
      status: "blocked",
    };
  }
  if (!options.liveCommand) {
    return {
      blockers: [],
      command: null,
      reason: "no reset-work-area generated-only live acceptance lane is registered for this importer slice",
      status: "unavailable",
    };
  }
  if (options.allowGeneratedLive !== true) {
    return {
      blockers: [],
      command: options.liveCommand,
      reason: "--allow-generated-live was not provided",
      status: "not_started",
    };
  }
  if (!livePreflight || livePreflight.available !== true) {
    return {
      blockers: [],
      command: options.liveCommand,
      reason: "read-only live preflight did not pass",
      status: "not_started",
    };
  }

  const timeoutMs = parseFiniteNumber(options.liveTimeoutMs, "live-timeout-ms", DEFAULT_LIVE_TIMEOUT_MS);
  const commandResult = runLoggedCommand({
    args: shellCommandForPlatform(options.liveCommand),
    cwd: targetRepo,
    label: "03-generated-live",
    logDir: runtime.liveDir,
    timeoutMs,
  });
  return {
    blockers: commandResult.status === "passed" ? [] : [blocker("generated-live-validation-failed", "Generated-only live command failed.")],
    command: options.liveCommand,
    result: commandResult,
    status: commandResult.status,
  };
}

function shellCommandForPlatform(command) {
  if (process.platform === "win32") {
    return ["cmd.exe", "/d", "/s", "/c", command];
  }
  return ["/bin/sh", "-lc", command];
}

function buildNextAction(state, liveAcceptance) {
  if (state.currentPhase === "non_live_validation_complete" && state.nextPhase === "live_acceptance") {
    return {
      gate: "live_acceptance",
      phase: "live_acceptance",
      safeAction:
        liveAcceptance.status === "passed"
          ? "record_live_acceptance_and_commit"
          : "record_live_unavailable_or_run_explicit_generated_only_lane",
      stopBoundary: "reviewable_closeout",
    };
  }
  return {
    gate: state.nextPhase || "unknown",
    phase: state.nextPhase || "unknown",
    safeAction: "inspect_only",
    stopBoundary: "phase_boundary",
  };
}

function buildStatusReport(run, runtime, options) {
  const context = verifyContext(options);
  const branch = verifyBranchAndHead(run.targetRepo, run.state, options);
  const source = verifySourceRevision(run.manifest);
  const dirty = verifyDirtyOwnership(run.targetRepo, [
    ...(Array.isArray(run.state.ownedDirtyPaths) ? run.state.ownedDirtyPaths : []),
    ...(options.extraOwnedPath || []),
  ]);
  const nonLive = verifyNonLiveReport(run.runRoot, run.targetRepo, run.state);
  const stateBlockers = verifyStateForCloseout(run.state);
  const live = livePolicy(run.manifest);
  const hardBlockers = [
    ...context.blockers,
    ...branch.blockers,
    ...source.blockers,
    ...stateBlockers,
    ...nonLive.blockers,
    ...live.blockers,
  ];
  if (dirty.unownedDirtyPaths.length > 0) {
    hardBlockers.push(
      blocker("target-repo-dirty-unowned", `Dirty paths outside importer/supervisor ownership: ${dirty.unownedDirtyPaths.join(", ")}`, {
        unownedDirtyPaths: dirty.unownedDirtyPaths,
      }),
    );
  }
  if (dirty.dependencyDirtyPaths.length > 0) {
    hardBlockers.push(
      blocker("dependency-change-dirty", `Dependency/package files are dirty: ${dirty.dependencyDirtyPaths.join(", ")}`, {
        dependencyDirtyPaths: dirty.dependencyDirtyPaths,
      }),
    );
  }

  let livePreflight = null;
  if ((options.inspectLive || options.closeout) && hardBlockers.length === 0) {
    livePreflight = inspectLiveAvailability(run.targetRepo, runtime, options);
  }
  let liveAcceptance = {
    blockers: [],
    generatedPrefix: live.generatedPrefix,
    policyStatus: live.blockers.length === 0 ? "passed" : "blocked",
    providerPath: live.providerPath,
    status: "not_started",
  };
  if (options.closeout && hardBlockers.length === 0) {
    const generated = runGeneratedLiveAcceptance(run.targetRepo, runtime, options, livePreflight);
    liveAcceptance = {
      ...liveAcceptance,
      ...generated,
    };
    hardBlockers.push(...(generated.blockers || []));
  }

  const report = {
    schema: STATUS_SCHEMA,
    auxiliaryId: AUXILIARY_ID,
    mission: `generic-repo-importer/${run.runId}`,
    runId: run.runId,
    ok: hardBlockers.length === 0,
    status: hardBlockers.length === 0 ? "ready_at_reviewable_boundary" : "blocked",
    currentPhase: run.state.currentPhase || null,
    nextPhase: run.state.nextPhase || null,
    stopReason: run.state.stopReason || null,
    targetRepo: run.targetRepo,
    targetBranch: branch.currentBranch,
    targetHead: branch.currentHead,
    targetHeadDrift: branch.headDrift,
    importerStatePath: normalizeRepoPath(path.relative(run.targetRepo, run.statePath)),
    importerManifestPath: normalizeRepoPath(path.relative(run.targetRepo, run.manifestPath)),
    supervisorRunRoot: runtime.repoPath,
    ownedDirtyPaths: dirty.ownedDirtyPaths,
    changedPaths: dirty.changedPaths,
    unownedDirtyPaths: dirty.unownedDirtyPaths,
    dependencyDirtyPaths: dirty.dependencyDirtyPaths,
    validation: {
      nonLiveReportPath: normalizeRepoPath(path.relative(run.targetRepo, nonLive.reportPath)),
      snapshotStatus: nonLive.snapshotStatus,
      status: nonLive.status,
    },
    source: {
      actualRevision: source.actualRevision,
      expectedRevision: source.expectedRevision,
      location: source.sourceLocation,
    },
    livePreflight,
    liveAcceptance,
    nextAction: buildNextAction(run.state, liveAcceptance),
    blockers: hardBlockers,
    context,
    closeout: options.closeout
      ? {
          status:
            hardBlockers.length > 0
              ? "blocked"
              : liveAcceptance.status === "passed"
                ? "live_acceptance_passed"
                : "closed_with_live_unavailable",
          reason:
            liveAcceptance.status === "unavailable"
              ? liveAcceptance.reason
              : livePreflight && livePreflight.status === "unavailable"
                ? livePreflight.reason
                : null,
        }
      : null,
    createdAt: new Date().toISOString(),
  };
  return report;
}

function writeSupervisorState(runtime, report) {
  const state = {
    schema: STATE_SCHEMA,
    auxiliaryId: AUXILIARY_ID,
    sessionId: runtime.sessionId,
    mission: report.mission,
    currentPhase: report.currentPhase,
    nextPhase: report.nextPhase,
    status: report.status,
    nextAction: report.nextAction,
    blockers: report.blockers,
    statusReportPath: normalizeRepoPath(path.relative(report.targetRepo, runtime.statusReportPath)),
    updatedAt: new Date().toISOString(),
  };
  writeJson(runtime.statePath, state);
  return state;
}

function writeHandoff(targetRepo, report) {
  const handoffPath = path.join(targetRepo, ".codex", "handoff.md");
  mkdirSync(path.dirname(handoffPath), { recursive: true });
  const blockers = report.blockers.length > 0 ? report.blockers.map((entry) => `- ${entry.code}: ${entry.message}`).join("\n") : "- Нет.";
  const liveReason =
    report.closeout && report.closeout.reason
      ? report.closeout.reason
      : report.liveAcceptance && report.liveAcceptance.status
        ? report.liveAcceptance.status
        : "not_started";
  const text = `# Handoff: AUX-025 generic repo importer supervisor, ${new Date().toISOString().slice(0, 10)}

Дата handoff: ${new Date().toISOString()}

## Текущая цель

Закрыть текущий generic repo importer mission для \`${report.mission}\` через durable supervisor shell, не раздувая Codex chat.

## Текущее состояние

- Importer phase: \`${report.currentPhase}\` -> \`${report.nextPhase}\`.
- Non-live validation: \`${report.validation.status}\`, snapshots: \`${report.validation.snapshotStatus}\`.
- Live acceptance: \`${report.liveAcceptance.status}\`; reason: ${liveReason}.
- Supervisor report: \`${normalizeRepoPath(path.relative(targetRepo, path.join(targetRepo, report.supervisorRunRoot, "status-report.json")))}\`.
- Next gate: \`${report.nextAction.gate}\`; safe action: \`${report.nextAction.safeAction}\`.

## Файлы в работе

${report.ownedDirtyPaths.map((entry) => `- \`${entry}\``).join("\n") || "- Нет importer-owned dirty paths."}

## Валидация

- Durable non-live evidence checked from \`${report.validation.nonLiveReportPath}\`.
- Read-only live preflight: \`${report.livePreflight ? report.livePreflight.status : "not_run"}\`.
- Generated-only live proof: \`${report.liveAcceptance.status}\`.

## Решения

- Local/Ollama не используется.
- Dependency/package changes запрещены и проверяются fail-closed.
- Live mutation допускается только через явный generated-only OpenAI CLI lane; для текущего slice runner записывает unavailable, если такой lane отсутствует или preflight недоступен.

## Риски / блокеры

${blockers}

## Commit

Commit еще не создан этим handoff. Создать один reviewable commit после plan update и validation.

## Точный Prompt Для Следующего Чата

Продолжи в \`${targetRepo}\`. Прочитай \`AGENTS.md\`, \`.codex/handoff.md\`, \`specs/target-app.md\` и \`plans/target-app-execplan.md\` в UTF-8. Используй AUX-025 supervisor report \`${normalizeRepoPath(path.relative(targetRepo, path.join(targetRepo, report.supervisorRunRoot, "status-report.json")))}\`, не откатывай importer-owned changes, проверь validation, затем продолжи с ближайшего указанного gate без Local/Ollama, dependency changes, user-asset mutation, push/PR без явного разрешения.
`;
  writeFileSync(handoffPath, text, "utf8");
  return normalizeRepoPath(path.relative(targetRepo, handoffPath));
}

export function runSupervisor(options, cwd = process.cwd()) {
  const run = resolveRunContext(options, cwd);
  const runtime = createRuntime(run.targetRepo, run.runId, options);
  appendEvent(runtime, { event: "supervisor_started", runId: run.runId });
  const report = buildStatusReport(run, runtime, options);
  writeJson(runtime.statusReportPath, report);
  writeSupervisorState(runtime, report);
  if (options.writeHandoff) {
    report.handoffPath = writeHandoff(run.targetRepo, report);
    writeJson(runtime.statusReportPath, report);
    writeSupervisorState(runtime, report);
  }
  appendEvent(runtime, {
    blockers: report.blockers.map((entry) => entry.code),
    event: "supervisor_completed",
    ok: report.ok,
    status: report.status,
  });
  if (!report.ok) {
    throw new SupervisorError(report.blockers.map((entry) => entry.code).join("; "), report);
  }
  return report;
}

function printResult(report, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Mission: ${report.mission}\n`);
  process.stdout.write(`Phase: ${report.currentPhase} -> ${report.nextPhase}\n`);
  process.stdout.write(`Owned dirty paths: ${report.ownedDirtyPaths.length ? report.ownedDirtyPaths.join(", ") : "none"}\n`);
  process.stdout.write(`Validation: ${report.validation.status} (${report.validation.snapshotStatus})\n`);
  process.stdout.write(`Next gate: ${report.nextAction.gate}\n`);
  process.stdout.write(`Blockers: ${report.blockers.length ? report.blockers.map((entry) => entry.code).join(", ") : "none"}\n`);
  process.stdout.write(`Status report: ${normalizeRepoPath(path.relative(report.targetRepo, path.join(report.targetRepo, report.supervisorRunRoot, "status-report.json")))}\n`);
}

async function main() {
  let asJson = false;
  try {
    const options = parseArgs(process.argv.slice(2));
    asJson = options.json === true;
    if (options.help) {
      process.stdout.write(HELP.trimStart());
      return;
    }
    if (!options.status && !options.closeout) {
      options.status = true;
    }
    const report = runSupervisor(options);
    printResult(report, asJson);
  } catch (error) {
    if (error instanceof SupervisorError && error.report && asJson) {
      process.stdout.write(`${JSON.stringify(error.report, null, 2)}\n`);
    }
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

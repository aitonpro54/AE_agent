#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AUTO_RUN_SCHEMA = "generic-repo-auto-intake.run.v1";
const COMPACT_OUTPUT_SCHEMA = "generic-repo-auto-intake.parent-compact-output.v1";
const INVENTORY_SCHEMA = "generic-repo-auto-intake.inventory.v1";
const LEDGER_SCHEMA = "generic-repo-auto-intake.queue-ledger.v1";
const STATUS_SCHEMA = "generic-repo-auto-intake.status.v1";
const PROOF_SCHEMA = "generic-repo-auto-intake.proof.v1";
const PARALLEL_PLAN_SCHEMA = "generic-repo-full-intake.parallel-candidate-plan.v1";

const RUNTIME_ROOT_RELATIVE = ".codex-runtime/sdk/generic-repo-importer";
const DEFAULT_PARALLEL_LIMIT = 2;
const DEFAULT_CANDIDATE_LIMIT = 50;
const DEFAULT_MAX_VISITED_FILES = 5000;
const DEFAULT_MAX_INVENTORY_FILES = 500;
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_LICENSE_BYTES = 64 * 1024;

const SAFE_CLASSIFICATIONS = new Set([
  "existing_typed_tools_recipe_only",
  "small_safe_typed_tool_library_recipe_addition",
]);

const DENIED_SOURCE_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".codex",
  ".codex-runtime",
  "node_modules",
  "logs",
  "dist",
  "build",
  "out",
  "coverage",
]);

const SAFETY_POLICY = Object.freeze({
  broadCepSmokeAllowed: false,
  candidateExecutionAllowed: false,
  centralSourceMergeAllowed: false,
  dependencyPackageChangesAllowed: false,
  fallbackProviderAllowed: false,
  liveCepAeAllowed: false,
  localOllamaAllowed: false,
  pushAllowed: false,
  pullRequestAllowed: false,
  rawJsxCopyAllowed: false,
  sourceRepoWritesAllowed: false,
  worktreeCreationAllowed: false,
});

class AutoIntakeError extends Error {
  constructor(message, report = null) {
    super(message);
    this.name = "AutoIntakeError";
    this.report = report;
  }
}

function parseArgs(argv) {
  const options = {
    compactJson: false,
    json: false,
    parallelCandidateLimit: DEFAULT_PARALLEL_LIMIT,
    candidateLimit: DEFAULT_CANDIDATE_LIMIT,
    maxVisitedFiles: DEFAULT_MAX_VISITED_FILES,
    maxInventoryFiles: DEFAULT_MAX_INVENTORY_FILES,
    maxFileBytes: DEFAULT_MAX_FILE_BYTES,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--compact-json") {
      options.compactJson = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--repo") {
      options.repo = argv[++index];
    } else if (arg === "--run-id") {
      options.runId = argv[++index];
    } else if (arg === "--context-percent") {
      options.contextPercent = argv[++index];
    } else if (arg === "--parallel-candidate-limit") {
      options.parallelCandidateLimit = argv[++index];
    } else if (arg === "--candidate-limit") {
      options.candidateLimit = argv[++index];
    } else if (arg === "--max-inventory-files") {
      options.maxInventoryFiles = argv[++index];
    } else if (arg === "--max-visited-files") {
      options.maxVisitedFiles = argv[++index];
    } else if (arg === "--max-file-bytes") {
      options.maxFileBytes = argv[++index];
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`unknown-argument: ${arg}`);
    }
  }
  return options;
}

function usage() {
  return [
    "Usage:",
    "  node orchestrator/run-generic-repo-auto-intake.mjs --repo <github-url-or-local-path> --run-id <id> --context-percent <n> --parallel-candidate-limit 2 --compact-json",
    "",
    "Creates a bounded ignored auto-intake runtime with inventory, queue ledger,",
    "plan-only parallel candidate scheduling, compact status, proof, and handoff.",
  ].join("\n");
}

function parsePositiveInteger(value, label, fallback, max = 1000) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${label}-must-be-integer-1-${max}`);
  }
  return parsed;
}

function parseContextPercent(value) {
  if (value === undefined || value === null || value === "") {
    throw new Error("--context-percent is required");
  }
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("context-percent-must-be-0-100");
  }
  return parsed;
}

function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function normalizeRepoPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function relativeTo(base, target) {
  return normalizeRepoPath(path.relative(base, target)) || ".";
}

function safeId(value, fallback = "item") {
  const candidate = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/-{2,}/g, "-");
  const base = candidate || fallback;
  if (base.length <= 72) return base;
  return `${base.slice(0, 56).replace(/[._-]+$/g, "")}-${sha256Text(base).slice(0, 10)}`;
}

function intakeSlug(identity) {
  const name = safeId(identity.slugBase, "repo");
  return safeId(`${name}-${sha256Text(identity.normalizedRepo).slice(0, 8)}`, "repo");
}

function isGitHubUrl(raw) {
  const value = String(raw || "").trim();
  if (/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+(?:\.git)?\/?$/i.test(value)) return true;
  if (/^git@github\.com:[^/\s]+\/[^/\s]+(?:\.git)?$/i.test(value)) return true;
  if (/^ssh:\/\/git@github\.com\/[^/\s]+\/[^/\s]+(?:\.git)?$/i.test(value)) return true;
  return false;
}

function githubSlugBase(raw) {
  const value = String(raw || "").trim();
  const httpsMatch = value.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  if (httpsMatch) return `${httpsMatch[1]}-${httpsMatch[2]}`;
  const sshMatch = value.match(/^(?:git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) return `${sshMatch[1]}-${sshMatch[2]}`;
  throw new Error("repo-url-must-be-github");
}

function resolveRepoIdentity(rawRepo, cwd) {
  if (!rawRepo) throw new Error("--repo is required");
  const raw = String(rawRepo).trim();
  if (isGitHubUrl(raw)) {
    return {
      inputKind: "github-url",
      normalizedRepo: raw.replace(/\/+$/g, ""),
      slugBase: githubSlugBase(raw),
      localPath: null,
    };
  }

  const resolved = path.resolve(cwd, raw);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(`local-repo-path-missing: ${resolved}`);
  }
  return {
    inputKind: "local-path",
    normalizedRepo: normalizeRepoPath(resolved),
    slugBase: path.basename(resolved) || "local-repo",
    localPath: resolved,
  };
}

function assertInside(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  throw new Error(`${label}-outside-expected-root`);
}

function assertSourceAllowed(identity, cwd) {
  if (identity.inputKind !== "local-path") return;
  const sourcePath = path.resolve(identity.localPath);
  const repoRoot = path.resolve(cwd);
  if (sourcePath === repoRoot) {
    throw new Error("source-repo-must-not-be-target-repo");
  }
  const relative = normalizeRepoPath(path.relative(repoRoot, sourcePath));
  if (!relative.startsWith("..") && relative !== ".") {
    const deniedRoots = [".codex", ".codex-runtime", "logs", "plans/archive", "node_modules"];
    if (deniedRoots.some((root) => relative === root || relative.startsWith(`${root}/`))) {
      throw new Error(`source-path-denied-generated-root: ${relative}`);
    }
  }
}

function gitOutput(cwd, args, fallback = null) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (result.status !== 0) return fallback;
  return result.stdout.trim() || fallback;
}

function targetGitInfo(cwd) {
  return {
    branch: gitOutput(cwd, ["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    head: gitOutput(cwd, ["rev-parse", "HEAD"], "unknown"),
    remoteName: gitOutput(cwd, ["remote"], "")
      .split(/\r?\n/)
      .filter(Boolean)[0] || "none",
    remoteBranch: gitOutput(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "none"),
    remoteHead: gitOutput(cwd, ["rev-parse", "@{u}"], "unknown"),
  };
}

function sourceRevision(sourceRoot) {
  return gitOutput(sourceRoot, ["rev-parse", "HEAD"], null) || `local-${sha256Text(sourceRoot).slice(0, 12)}`;
}

function runRootFor(cwd, slug) {
  const root = path.resolve(cwd, RUNTIME_ROOT_RELATIVE, `${slug}-intake`);
  assertInside(path.resolve(cwd, RUNTIME_ROOT_RELATIVE), root, "run-root");
  return root;
}

function cloneGithubSource(identity, runRoot) {
  const checkout = path.join(runRoot, "source-checkout");
  if (existsSync(checkout)) {
    return { checkout, cloned: false, reusedExistingCheckout: true };
  }
  mkdirSync(runRoot, { recursive: true });
  const result = spawnSync("git", ["clone", "--depth", "1", identity.normalizedRepo, checkout], {
    cwd: runRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`github-clone-failed: ${(result.stderr || result.stdout || "").trim().slice(0, 240)}`);
  }
  return { checkout, cloned: true, reusedExistingCheckout: false };
}

function prepareSource(identity, runRoot) {
  if (identity.inputKind === "local-path") {
    return { checkout: identity.localPath, cloned: false, reusedExistingCheckout: false };
  }
  return cloneGithubSource(identity, runRoot);
}

function isLicenseLike(relativePath) {
  const base = path.basename(relativePath).toLowerCase();
  return /^(?:license|licence|copying|copying\.lesser|notice|copyright)(?:\..*)?$/.test(base);
}

function fileCategory(relativePath) {
  const lower = relativePath.toLowerCase();
  if (isLicenseLike(relativePath)) return "license-like";
  if (lower.endsWith(".jsx")) return "jsx";
  if (lower.endsWith(".jsxinc")) return "jsxinc";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith("package.json")) return "package-manifest";
  return "other";
}

function interestingFile(relativePath) {
  const category = fileCategory(relativePath);
  return ["license-like", "jsx", "jsxinc", "markdown", "package-manifest"].includes(category);
}

function readSmallFile(filePath, maxBytes) {
  const stat = statSync(filePath);
  const bytes = Math.min(stat.size, maxBytes);
  const buffer = readFileSync(filePath).subarray(0, bytes);
  return buffer.toString("utf8");
}

function classifyLicense(licenseFiles, sourceRoot) {
  if (licenseFiles.length === 0) {
    return {
      status: "missing",
      file: null,
      id: null,
      recognized: false,
      referenceOnlyDefault: true,
      importAllowed: false,
      reason: "missing-license",
    };
  }

  const first = licenseFiles[0];
  const text = readSmallFile(path.join(sourceRoot, first.path), MAX_LICENSE_BYTES);
  const normalized = text.toLowerCase();
  const checks = [
    {
      id: "MIT",
      permissive: true,
      test: () => normalized.includes("mit license") || normalized.includes("permission is hereby granted, free of charge"),
    },
    {
      id: "Apache-2.0",
      permissive: true,
      test: () => normalized.includes("apache license") && normalized.includes("version 2.0"),
    },
    {
      id: "BSD",
      permissive: true,
      test: () => normalized.includes("redistribution and use in source and binary forms"),
    },
    {
      id: "ISC",
      permissive: true,
      test: () => normalized.includes("permission to use, copy, modify, and/or distribute this software"),
    },
    {
      id: "MPL",
      permissive: false,
      test: () => normalized.includes("mozilla public license"),
    },
    {
      id: "GPL-family",
      permissive: false,
      test: () => normalized.includes("gnu general public license") || normalized.includes("gnu lesser general public license"),
    },
  ];
  const match = checks.find((entry) => entry.test());
  if (!match) {
    return {
      status: "unrecognized",
      file: first.path,
      id: null,
      recognized: false,
      referenceOnlyDefault: true,
      importAllowed: false,
      reason: "unrecognized-license",
    };
  }
  return {
    status: match.permissive ? "recognized_permissive" : "recognized_reference_only",
    file: first.path,
    id: match.id,
    recognized: true,
    referenceOnlyDefault: !match.permissive,
    importAllowed: match.permissive,
    reason: match.permissive ? "recognized-permissive-license" : "recognized-non-permissive-license",
  };
}

function collectInventory(sourceRoot, options) {
  const maxInventoryFiles = parsePositiveInteger(options.maxInventoryFiles, "max-inventory-files", DEFAULT_MAX_INVENTORY_FILES, 5000);
  const maxVisitedFiles = parsePositiveInteger(options.maxVisitedFiles, "max-visited-files", DEFAULT_MAX_VISITED_FILES, 50000);
  const maxFileBytes = parsePositiveInteger(options.maxFileBytes, "max-file-bytes", DEFAULT_MAX_FILE_BYTES, 50 * 1024 * 1024);
  const stack = [sourceRoot];
  const files = [];
  const skipped = [];
  let totalVisitedFiles = 0;
  let totalBytes = 0;
  let truncated = false;

  walk:
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = normalizeRepoPath(path.relative(sourceRoot, absolute));
      if (entry.isDirectory()) {
        if (DENIED_SOURCE_DIRS.has(entry.name.toLowerCase())) {
          skipped.push({ path: relative, reason: "denied-directory" });
          continue;
        }
        stack.push(absolute);
        continue;
      }
      if (entry.isSymbolicLink()) {
        skipped.push({ path: relative, reason: "symlink-skipped" });
        continue;
      }
      if (!entry.isFile()) continue;

      totalVisitedFiles += 1;
      if (totalVisitedFiles > maxVisitedFiles) {
        truncated = true;
        break walk;
      }
      const stat = lstatSync(absolute);
      totalBytes += stat.size;
      if (!interestingFile(relative)) continue;
      if (files.length >= maxInventoryFiles) {
        truncated = true;
        continue;
      }
      const tooLarge = stat.size > maxFileBytes;
      files.push({
        path: relative,
        category: fileCategory(relative),
        extension: path.extname(relative).toLowerCase(),
        bytes: stat.size,
        sha256: tooLarge ? null : sha256File(absolute),
        tooLarge,
      });
    }
  }

  const licenseFiles = files.filter((file) => file.category === "license-like");
  const license = classifyLicense(licenseFiles, sourceRoot);
  const counts = files.reduce(
    (accumulator, file) => {
      accumulator[file.category] = (accumulator[file.category] || 0) + 1;
      return accumulator;
    },
    {
      "license-like": 0,
      jsx: 0,
      jsxinc: 0,
      markdown: 0,
      "package-manifest": 0,
    },
  );

  return {
    schema: INVENTORY_SCHEMA,
    sourceRoot: normalizeRepoPath(sourceRoot),
    totalVisitedFiles,
    totalInterestingFiles: files.length,
    totalBytes,
    truncated,
    limits: { maxVisitedFiles, maxInventoryFiles, maxFileBytes },
    counts,
    license,
    skipped: skipped.slice(0, 50),
    files,
  };
}

function sourceTextForRisk(sourceRoot, relativePath, maxFileBytes) {
  const absolute = path.join(sourceRoot, relativePath);
  const stat = statSync(absolute);
  if (stat.size > maxFileBytes) return "";
  return readSmallFile(absolute, maxFileBytes);
}

function riskFlagsForSource(text) {
  const risk = {
    rawJsxSource: true,
    usesEval: /\beval\s*\(|new Function\s*\(/i.test(text),
    usesFileSystem: /\b(?:File|Folder)\b|(?:\$\.evalFile)/.test(text),
    usesNetwork: /\b(?:Socket|http:\/\/|https:\/\/|curl|fetch\s*\()/i.test(text),
    usesExternalProcess: /system\.callSystem|app\.system/i.test(text),
    usesRenderQueue: /renderQueue/i.test(text),
    mutatesProject: /\b(?:remove|delete|setValue|setValueAtTime|executeCommand|addComp|layers\.add|save)\b/i.test(text),
  };
  risk.highRisk = risk.usesEval || risk.usesNetwork || risk.usesExternalProcess;
  risk.needsLiveLane = risk.usesRenderQueue || risk.mutatesProject;
  risk.level = risk.highRisk ? "high" : risk.needsLiveLane ? "medium" : "low";
  return risk;
}

function classifyCandidate(riskFlags) {
  if (riskFlags.highRisk) return "unsafe_skip_tool_gap";
  if (riskFlags.needsLiveLane) return "live_lane_needed";
  return "existing_typed_tools_recipe_only";
}

function suggestedToolsFor(relativePath, riskFlags) {
  const lower = relativePath.toLowerCase();
  const tools = new Set(["get_active_comp"]);
  if (lower.includes("text")) tools.add("get_selected_layers");
  if (lower.includes("layer")) tools.add("get_layer_details");
  if (lower.includes("comp")) tools.add("get_comp_details");
  if (lower.includes("keyframe") || lower.includes("property")) tools.add("get_selected_properties");
  if (riskFlags.usesRenderQueue) tools.add("get_render_queue_status");
  if (tools.size === 1) tools.add("get_layer_details");
  return Array.from(tools);
}

function candidateIdFromPath(relativePath) {
  return safeId(`tool-${relativePath}`, "tool-candidate");
}

function buildEntries({ inventory, sourceRoot }) {
  let queueRank = 1;
  return inventory.files
    .filter((file) => file.category === "jsx" || file.category === "jsxinc")
    .map((file) => {
      const text = sourceTextForRisk(sourceRoot, file.path, inventory.limits.maxFileBytes);
      const riskFlags = riskFlagsForSource(text);
      const classification = classifyCandidate(riskFlags);
      const safeClassification = SAFE_CLASSIFICATIONS.has(classification);
      const referenceOnly = inventory.license.referenceOnlyDefault === true;
      const canQueueForImport = !referenceOnly && safeClassification && riskFlags.level === "low";
      const rank = canQueueForImport ? queueRank++ : null;
      const status = referenceOnly
        ? "reference_only"
        : canQueueForImport
          ? "queued"
          : classification === "live_lane_needed"
            ? "blocked_live_lane_required"
            : "blocked_policy";

      return {
        id: candidateIdFromPath(file.path),
        sourcePath: file.path,
        status,
        classification,
        suggestedTools: suggestedToolsFor(file.path, riskFlags),
        liveGate: {
          required: classification === "live_lane_needed",
          status: classification === "live_lane_needed" ? "needed_or_reusable_lane_required" : "not_required_for_plan_only",
        },
        implementation: {
          mode: referenceOnly ? "reference-only-no-product-copy" : "typed-recipe-only-no-raw-jsx-copy",
          plannedPaths: referenceOnly ? [] : [`recipes/generic-repo-intake/${candidateIdFromPath(file.path)}.md`],
          rawJsxCopyAllowed: false,
          sourceMergeAllowed: false,
        },
        license: {
          file: inventory.license.file,
          id: inventory.license.id,
          status: inventory.license.status,
          recognized: inventory.license.recognized,
          referenceOnly,
          importAllowed: !referenceOnly,
          rawJsxCopyAllowed: false,
        },
        referenceOnly,
        riskFlags,
        queueRank: rank,
        referenceRank: rank === null && safeClassification && riskFlags.level === "low" ? file.path : null,
        failClosed: referenceOnly
          ? {
              schema: "generic-repo-auto-intake.fail-closed-license.v1",
              reason: inventory.license.reason,
              referenceOnly: true,
              rawJsxCopyBlocked: true,
            }
          : null,
      };
    });
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function firstQueued(entries) {
  return entries
    .filter((entry) => entry.status === "queued" && Number.isInteger(entry.queueRank))
    .sort((left, right) => left.queueRank - right.queueRank || left.id.localeCompare(right.id))[0] || null;
}

function buildLedger({ cwd, entries, identity, inventory, runId, sourceCheckout }) {
  const target = targetGitInfo(cwd);
  const queued = firstQueued(entries);
  const ledger = {
    schema: LEDGER_SCHEMA,
    updatedAt: new Date().toISOString(),
    runId,
    source: {
      repo: identity.normalizedRepo,
      inputKind: identity.inputKind,
      checkout: normalizeRepoPath(sourceCheckout),
      revision: sourceRevision(sourceCheckout),
      jsxCandidateCount: entries.length,
      licenseFile: inventory.license.file,
      licenseStatus: inventory.license.status,
      referenceOnlyDefault: inventory.license.referenceOnlyDefault,
    },
    target: {
      repoPath: normalizeRepoPath(cwd),
      branch: target.branch,
      head: target.head,
      remoteName: target.remoteName,
      remoteBranch: target.remoteBranch,
      remoteHead: target.remoteHead,
    },
    constraints: {
      noLocalOllama: true,
      noFallbackProviders: true,
      noLiveCepAe: true,
      noDependencyOrPackageChanges: true,
      noRawJsxCopiedIntoProduct: true,
      noUserAssetMutation: true,
      sourceRepoWritesAllowed: false,
      parallelAllowedOnlyFor: ["plan-only candidate scheduling"],
      serialGates: [
        "candidate execution",
        "child worktree creation",
        "controlled merge",
        "non-live validation",
        "live CEP/AE validation",
        "plan update",
        "handoff update",
        "commit",
        "push",
        "pull request",
      ],
    },
    licensePolicy: {
      failClosedOnMissingOrUnrecognized: true,
      referenceOnlyDefault: inventory.license.referenceOnlyDefault,
      rawJsxCopyAllowed: false,
      importAllowed: inventory.license.importAllowed,
      status: inventory.license.status,
      id: inventory.license.id,
      file: inventory.license.file,
    },
    classificationBuckets: countBy(entries, (entry) => entry.classification),
    statusBuckets: countBy(entries, (entry) => entry.status),
    entries,
  };
  if (queued) {
    ledger.nextCandidate = {
      id: queued.id,
      sourcePath: queued.sourcePath,
      classification: queued.classification,
      suggestedTools: queued.suggestedTools,
      reason: "First safe queued candidate with permissive recognized license.",
    };
  }
  return ledger;
}

function selectParallelPlanCandidates(entries, limit) {
  return entries
    .filter((entry) => SAFE_CLASSIFICATIONS.has(entry.classification))
    .filter((entry) => entry.riskFlags?.level === "low")
    .filter((entry) => entry.referenceOnly === true || entry.status === "queued")
    .sort((left, right) => {
      const leftRank = Number.isInteger(left.queueRank) ? left.queueRank : Number.MAX_SAFE_INTEGER;
      const rightRank = Number.isInteger(right.queueRank) ? right.queueRank : Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.sourcePath.localeCompare(right.sourcePath) || left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}

function buildParallelPlan({ baseHead, limit, runId, selected }) {
  return {
    schema: PARALLEL_PLAN_SCHEMA,
    runId,
    mode: "auto_intake_parallel_plan_only",
    baseHead,
    limit,
    scopedCandidateIds: [],
    selectedCandidateIds: selected.map((entry) => entry.id),
    candidates: selected.map((entry) => ({
      candidateId: entry.id,
      sourcePath: entry.sourcePath,
      classification: entry.classification,
      status: entry.status,
      referenceOnly: entry.referenceOnly === true,
      license: {
        status: entry.license.status,
        id: entry.license.id,
        referenceOnly: entry.license.referenceOnly,
        importAllowed: entry.license.importAllowed,
      },
      riskLevel: entry.riskFlags.level,
      plannedPaths: entry.implementation.plannedPaths,
      rawJsxCopyAllowed: false,
    })),
    execution: {
      candidatesExecuted: 0,
      childWorktreesCreated: 0,
      centralSourceMerge: false,
      parentReducerRequiredForFutureExecution: true,
    },
    safetyPolicy: {
      branchCreationAllowedForChild: false,
      candidateExecutionAllowed: false,
      centralLedgerWritesAllowedForChild: false,
      centralSourceMergeAllowed: false,
      dependencyPackageChangesAllowed: false,
      fallbackProviderAllowed: false,
      liveCepAeAllowedForChild: false,
      localOllamaAllowed: false,
      parentReducerSerial: true,
      planHandoffWritesAllowedForChild: false,
      rawJsxCopyAllowed: false,
      worktreeCreationAllowed: false,
    },
    createdAt: new Date().toISOString(),
  };
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function artifactRef(cwd, filePath) {
  return {
    path: relativeTo(cwd, filePath),
    sha256: sha256File(filePath),
  };
}

function buildStatus({ artifacts, entries, inventory, limit, runId, selected, slug }) {
  return {
    schema: STATUS_SCHEMA,
    ok: true,
    status: "auto_intake_plan_ready",
    runId,
    intakeSlug: slug,
    counts: {
      inventoryFiles: inventory.totalInterestingFiles,
      jsxCandidates: entries.length,
      referenceOnlyCandidates: entries.filter((entry) => entry.referenceOnly).length,
      queuedCandidates: entries.filter((entry) => entry.status === "queued").length,
      selectedParallelCandidates: selected.length,
    },
    license: {
      status: inventory.license.status,
      id: inventory.license.id,
      referenceOnlyDefault: inventory.license.referenceOnlyDefault,
    },
    parallel: {
      mode: "plan_only",
      limit,
      selectedCandidateIds: selected.map((entry) => entry.id),
      candidatesExecuted: 0,
      childWorktreesCreated: 0,
      centralSourceMerge: false,
    },
    safetyPolicy: SAFETY_POLICY,
    artifacts,
    updatedAt: new Date().toISOString(),
  };
}

function buildProof({ artifacts, candidateLimit, entries, inventory, parallelPlan, runId, slug }) {
  const missingOrUnrecognized = inventory.license.status === "missing" || inventory.license.status === "unrecognized";
  return {
    schema: PROOF_SCHEMA,
    runId,
    intakeSlug: slug,
    contractComplete: true,
    assertions: {
      boundedLedger: entries.length <= candidateLimit,
      missingOrUnrecognizedLicenseReferenceOnly: missingOrUnrecognized
        ? entries.every((entry) => entry.referenceOnly === true && entry.status === "reference_only")
        : true,
      noLocalOllama: true,
      noFallbackProviders: true,
      noLiveCepAe: true,
      noDependencyChanges: true,
      noPushPr: true,
      rawJsxCopyBlocked: entries.every((entry) => entry.implementation.rawJsxCopyAllowed === false),
      noCandidateExecution: parallelPlan.execution.candidatesExecuted === 0,
      noChildWorktrees: parallelPlan.execution.childWorktreesCreated === 0,
      noCentralSourceMerge: parallelPlan.execution.centralSourceMerge === false,
      compactArtifactsOnly: true,
    },
    artifacts,
    createdAt: new Date().toISOString(),
  };
}

function writeRuntimeHandoff({ artifacts, entries, inventory, runId, slug }) {
  const lines = [
    "# Generic Repo Auto Intake Handoff",
    "",
    `currentGoal: Создать bounded auto-intake ledger и plan-only parallel schedule для ${slug}.`,
    "",
    `currentState: status=auto_intake_plan_ready; runId=${runId}; entries=${entries.length}; referenceOnly=${entries.filter((entry) => entry.referenceOnly).length}; queued=${entries.filter((entry) => entry.status === "queued").length}.`,
    "",
    "artifacts:",
    `- inventory: ${artifacts.inventory.path}`,
    `- ledger: ${artifacts.ledger.path}`,
    `- parallelPlan: ${artifacts.parallelPlan.path}`,
    `- status: ${artifacts.status.path}`,
    `- proof: ${artifacts.proof.path}`,
    "",
    "decisions:",
    `- licenseStatus=${inventory.license.status}; referenceOnlyDefault=${inventory.license.referenceOnlyDefault}.`,
    "- raw JSX copy, candidate execution, child worktrees, central merge, Local/Ollama, fallback providers, live CEP/AE, dependency changes, push and PR are disabled.",
    "",
    "nextPrompt: Review the generated queue-ledger.json and parallel-plan.json, then choose explicit candidate ids before any future scoped execution.",
    "",
  ];
  return lines.join("\n");
}

function compactOutput({ artifacts, entries, identity, inventory, limit, runId, selected, slug }) {
  return {
    schema: COMPACT_OUTPUT_SCHEMA,
    ok: true,
    status: "auto_intake_plan_ready",
    runId,
    intakeSlug: slug,
    source: {
      inputKind: identity.inputKind,
      repo: identity.normalizedRepo,
      license: {
        status: inventory.license.status,
        id: inventory.license.id,
        referenceOnlyDefault: inventory.license.referenceOnlyDefault,
      },
    },
    counts: {
      inventoryFiles: inventory.totalInterestingFiles,
      jsxCandidates: entries.length,
      referenceOnlyCandidates: entries.filter((entry) => entry.referenceOnly).length,
      queuedCandidates: entries.filter((entry) => entry.status === "queued").length,
      selectedParallelCandidates: selected.length,
    },
    classificationBuckets: countBy(entries, (entry) => entry.classification),
    statusBuckets: countBy(entries, (entry) => entry.status),
    parallel: {
      mode: "plan_only",
      limit,
      selectedCandidateIds: selected.map((entry) => entry.id),
      candidatesExecuted: 0,
      worktrees: { created: 0 },
      centralSourceMerge: false,
    },
    safetyPolicy: SAFETY_POLICY,
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([key, ref]) => [key, ref.path])),
  };
}

export async function runAutoIntake(options, cwd = process.cwd()) {
  const contextPercent = parseContextPercent(options.contextPercent);
  const runId = safeId(options.runId, "generic-repo-auto-intake");
  if (!options.runId) throw new Error("--run-id is required");
  const parallelLimit = parsePositiveInteger(
    options.parallelCandidateLimit,
    "parallel-candidate-limit",
    DEFAULT_PARALLEL_LIMIT,
    10,
  );
  const candidateLimit = parsePositiveInteger(options.candidateLimit, "candidate-limit", DEFAULT_CANDIDATE_LIMIT, 200);
  const identity = resolveRepoIdentity(options.repo, cwd);
  assertSourceAllowed(identity, cwd);
  const slug = intakeSlug(identity);
  const runRoot = runRootFor(cwd, slug);
  mkdirSync(runRoot, { recursive: true });

  if (contextPercent >= 70) {
    const statusPath = path.join(runRoot, "status.json");
    const status = {
      schema: STATUS_SCHEMA,
      ok: false,
      status: "handoff_required_context_pressure",
      runId,
      intakeSlug: slug,
      contextPercent,
      message: "Context percent is at or above 70; auto-intake work did not start.",
      safetyPolicy: SAFETY_POLICY,
      updatedAt: new Date().toISOString(),
    };
    writeJson(statusPath, status);
    const artifacts = { status: artifactRef(cwd, statusPath) };
    throw new AutoIntakeError("handoff-required-context-pressure", {
      schema: COMPACT_OUTPUT_SCHEMA,
      ok: false,
      status: status.status,
      runId,
      intakeSlug: slug,
      artifacts: { status: artifacts.status.path },
      blockers: [{ code: "context-pressure", contextPercent }],
    });
  }

  const source = prepareSource(identity, runRoot);
  const inventory = collectInventory(source.checkout, options);
  const inventoryPath = path.join(runRoot, "inventory.json");
  writeJson(inventoryPath, inventory);

  const entries = buildEntries({ inventory, sourceRoot: source.checkout }).slice(0, candidateLimit);
  const ledger = buildLedger({ cwd, entries, identity, inventory, runId, sourceCheckout: source.checkout });
  const ledgerPath = path.join(runRoot, "queue-ledger.json");
  writeJson(ledgerPath, ledger);

  const selected = selectParallelPlanCandidates(entries, parallelLimit);
  const parallelPlan = buildParallelPlan({
    baseHead: targetGitInfo(cwd).head,
    limit: parallelLimit,
    runId,
    selected,
  });
  const parallelPlanPath = path.join(runRoot, "parallel-candidates", "parallel-plan.json");
  writeJson(parallelPlanPath, parallelPlan);

  const artifactBase = {
    runRoot: { path: relativeTo(cwd, runRoot), sha256: null },
    inventory: artifactRef(cwd, inventoryPath),
    ledger: artifactRef(cwd, ledgerPath),
    parallelPlan: artifactRef(cwd, parallelPlanPath),
  };
  const statusPath = path.join(runRoot, "status.json");
  const status = buildStatus({
    artifacts: artifactBase,
    entries,
    inventory,
    limit: parallelLimit,
    runId,
    selected,
    slug,
  });
  writeJson(statusPath, status);
  const statusRef = artifactRef(cwd, statusPath);
  const artifactsWithStatus = { ...artifactBase, status: statusRef };

  const proofPath = path.join(runRoot, "proof.json");
  const proof = buildProof({
    artifacts: artifactsWithStatus,
    candidateLimit,
    entries,
    inventory,
    parallelPlan,
    runId,
    slug,
  });
  writeJson(proofPath, proof);
  const proofRef = artifactRef(cwd, proofPath);
  const artifactsWithProof = { ...artifactsWithStatus, proof: proofRef };

  const handoffPath = path.join(runRoot, "handoff.md");
  writeFileSync(
    handoffPath,
    writeRuntimeHandoff({ artifacts: artifactsWithProof, entries, inventory, runId, slug }),
    "utf8",
  );
  const artifacts = { ...artifactsWithProof, handoff: artifactRef(cwd, handoffPath) };

  return {
    schema: AUTO_RUN_SCHEMA,
    ok: true,
    status: "auto_intake_plan_ready",
    runId,
    intakeSlug: slug,
    source,
    identity,
    inventory,
    ledger,
    parallelPlan,
    artifacts,
    compact: compactOutput({ artifacts, entries, identity, inventory, limit: parallelLimit, runId, selected, slug }),
  };
}

function printResult(result, options) {
  if (options.compactJson || !options.json) {
    process.stdout.write(`${JSON.stringify(result.compact, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  try {
    const result = await runAutoIntake(options);
    printResult(result, options);
  } catch (error) {
    if (options.compactJson || options.json) {
      const output = error instanceof AutoIntakeError && error.report
        ? error.report
        : {
            schema: COMPACT_OUTPUT_SCHEMA,
            ok: false,
            status: "failed",
            blockers: [{ code: "auto-intake-error", message: error.message }],
          };
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    }
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

export const PARALLEL_PLAN_SCHEMA = "generic-repo-full-intake.parallel-candidate-plan.v1";
export const PARALLEL_PROPOSAL_SCHEMA = "generic-repo-full-intake.parallel-candidate-proposal.v1";
export const PARALLEL_REDUCER_SCHEMA = "generic-repo-full-intake.parallel-candidate-reducer.v1";
export const PARALLEL_PROOF_SCHEMA = "generic-repo-full-intake.parallel-candidate-proof.v1";

const SHARED_OWNER_PATHS = Object.freeze([
  "registry/solutions.json",
  "scripts/solution-library-validation-smoke.js",
  "plans/target-app-execplan.md",
  ".codex/handoff.md",
]);
const PARENT_ONLY_WRITE_PATHS = new Set([
  "plans/target-app-execplan.md",
  ".codex/handoff.md",
]);
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
const SAFE_CLASSIFICATIONS = new Set([
  "existing_typed_tools_recipe_only",
  "small_safe_typed_tool_library_recipe_addition",
]);
const NON_TERMINAL_CANDIDATE_STATUSES = new Set(["queued"]);
const PROPOSAL_TERMINAL_STATUSES = new Set(["proposal_ready", "rejected", "blocked", "failed"]);
const DEFAULT_PARALLEL_LIMIT = 2;
const DEFAULT_CHILD_PROCESS_TIMEOUT_MS = 30 * 60 * 1000;
const PROCESS_TAIL_MAX_CHARS = 4096;
const TEXT_FILE_MAX_BYTES = 256 * 1024;
const SMOKE_COMPARE_MAX_BYTES = 1024 * 1024;
const SMOKE_APPEND_MAX_BYTES = 64 * 1024;

export function parallelCandidateWorktreeModeEnabled(options = {}) {
  return options.parallelCandidateWorktrees === true || options.planParallelCandidateWorktrees === true;
}

function normalizeRepoPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function safeId(value, fallback = "candidate") {
  return (
    String(value || fallback)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || fallback
  );
}

function shortSafeId(value, maxLength = 40, fallback = "candidate") {
  const normalized = safeId(value, fallback);
  return `${normalized.slice(0, maxLength)}-${sha256Text(normalized).slice(0, 8)}`;
}

function sortedUnique(values) {
  return Array.from(new Set((values || []).map(normalizeRepoPath).filter(Boolean))).sort();
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label}-json-read-failed: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function sha256Json(value) {
  return sha256Text(stableStringify(value));
}

function sha256FileIfExists(filePath) {
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return null;
  }
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function boundedTail(value, maxChars = PROCESS_TAIL_MAX_CHARS) {
  const text = String(value || "");
  return text.length > maxChars ? text.slice(text.length - maxChars) : text;
}

function boundedProcessTextStats(value) {
  const text = String(value || "");
  const lines = text ? text.split(/\r?\n/) : [];
  return {
    bytes: Buffer.byteLength(text, "utf8"),
    lineCount: text ? lines.length : 0,
    tail: boundedTail(text),
    truncated: text.length > PROCESS_TAIL_MAX_CHARS,
  };
}

function runProcessBounded(command, args, { cwd, env = process.env, timeoutMs = DEFAULT_CHILD_PROCESS_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        error: error.message,
        exitCode: null,
        ok: false,
        stderr: boundedProcessTextStats(stderr),
        stdout: boundedProcessTextStats(stdout),
        timedOut,
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        ok: exitCode === 0 && timedOut === false,
        stderr: boundedProcessTextStats(stderr),
        stdout: boundedProcessTextStats(stdout),
        timedOut,
      });
    });
  });
}

function gitOutput(cwd, args, label) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git-${label}-failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function gitStatusEntries(cwd) {
  const output = gitOutput(cwd, ["status", "--porcelain=v1", "--untracked-files=all"], "status");
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function statusEntryPath(entry) {
  const match = String(entry || "").match(/^.{1,2}\s+(.+)$/);
  const raw = (match ? match[1] : String(entry || "").slice(3)).trim();
  const renameIndex = raw.indexOf(" -> ");
  return normalizeRepoPath(renameIndex >= 0 ? raw.slice(renameIndex + 4) : raw);
}

function gitChangedPaths(cwd) {
  return gitStatusEntries(cwd).map(statusEntryPath).filter(Boolean).sort();
}

function gitPathIsIgnored(cwd, repoPath) {
  const result = spawnSync("git", ["check-ignore", "-q", repoPath], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function gitPathIsTracked(cwd, repoPath) {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", repoPath], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function stageAndCommitReviewableChanges(targetRepo, message) {
  const paths = gitChangedPaths(targetRepo)
    .filter((repoPath) => !gitPathIsIgnored(targetRepo, repoPath))
    .filter((repoPath) => gitPathIsTracked(targetRepo, repoPath) || existsSync(path.join(targetRepo, repoPath)));
  if (paths.length === 0) {
    return null;
  }
  for (const repoPath of paths) {
    if (isDependencyPath(repoPath)) {
      throw new Error(`parallel-reducer-commit-dependency-path-forbidden: ${repoPath}`);
    }
    if (isRawJsxTargetPath(repoPath)) {
      throw new Error(`parallel-reducer-commit-raw-jsx-path-forbidden: ${repoPath}`);
    }
  }
  const addResult = spawnSync("git", ["add", "--", ...paths], {
    cwd: targetRepo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (addResult.status !== 0) {
    throw new Error(`git-add-parallel-reducer-failed: ${addResult.stderr || addResult.stdout}`);
  }
  const staged = gitOutput(targetRepo, ["diff", "--cached", "--name-only"], "diff-cached-name-only")
    .split(/\r?\n/)
    .filter(Boolean);
  if (staged.length === 0) {
    return null;
  }
  const commitResult = spawnSync(
    "git",
    [
      "-c",
      "user.name=Generic Repo Full Intake",
      "-c",
      "user.email=generic-repo-full-intake@example.local",
      "commit",
      "-m",
      message,
    ],
    {
      cwd: targetRepo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (commitResult.status !== 0) {
    throw new Error(`git-commit-parallel-reducer-failed: ${commitResult.stderr || commitResult.stdout}`);
  }
  return gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head");
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function parsePositiveInteger(value, label, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function pathStartsWith(child, parent) {
  const normalizedChild = normalizeRepoPath(child);
  const normalizedParent = normalizeRepoPath(parent).replace(/\/+$/, "");
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

function isInsidePath(parent, child) {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assertInsidePath(parent, child, label) {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  if (!isInsidePath(resolvedParent, resolvedChild) && resolvedParent !== resolvedChild) {
    throw new Error(`${label}-outside-run-root: ${child}`);
  }
  return resolvedChild;
}

function parallelWorktreesRoot(targetRepo, runId) {
  return path.join(os.tmpdir(), "codex-pi", safeId(runId).slice(0, 32), sha256Text(path.resolve(targetRepo)).slice(0, 10), "w");
}

function candidateWorktreeDirectoryName(candidate) {
  return shortSafeId(candidate.id, 36);
}

function isDependencyPath(repoPath) {
  return DEPENDENCY_PATHS.has(normalizeRepoPath(repoPath));
}

function isRawJsxTargetPath(repoPath) {
  return /\.(jsx|jsxinc)$/i.test(normalizeRepoPath(repoPath));
}

function plannedRecipePath(entry) {
  const base = path.basename(entry.sourcePath, path.extname(entry.sourcePath));
  const slug =
    base
      .replace(/[_\s]+/g, "-")
      .replace(/[^a-zA-Z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || entry.id.replace(/[^a-zA-Z0-9.-]+/g, "-").toLowerCase();
  return `recipes/${slug}-typed-plan.md`;
}

function candidatePlannedPaths(entry) {
  const implementationPaths = Array.isArray(entry.implementation?.plannedPaths)
    ? entry.implementation.plannedPaths
    : [];
  return sortedUnique([plannedRecipePath(entry), ...implementationPaths, ...SHARED_OWNER_PATHS]);
}

function validateEntryShape(entry, label) {
  requireObject(entry, label);
  requireString(entry.id, `${label}.id`);
  requireString(entry.sourcePath, `${label}.sourcePath`);
  requireString(entry.status, `${label}.status`);
  requireString(entry.classification, `${label}.classification`);
  requireArray(entry.suggestedTools, `${label}.suggestedTools`);
  requireObject(entry.liveGate, `${label}.liveGate`);
  if (typeof entry.liveGate.required !== "boolean") {
    throw new Error(`${label}.liveGate.required must be a boolean`);
  }
  requireString(entry.liveGate.status, `${label}.liveGate.status`);
  requireObject(entry.implementation || {}, `${label}.implementation`);
}

function liveLaneFamily(entry) {
  if (!entry.liveGate?.required) {
    return "not-required";
  }
  return entry.liveGate.laneId || entry.liveGate.liveLaneId || entry.liveGate.reusableLaneId || entry.liveGate.status || "required";
}

function liveLaneIsReadyForParallelScheduling(entry) {
  if (!entry.liveGate?.required) {
    return true;
  }
  return Boolean(entry.liveGate.command || entry.liveGate.liveCommand || entry.liveGate.laneId || entry.liveGate.reusableLaneId);
}

function candidateNeedsNewTypedToolContract(entry) {
  if (entry.implementation?.requiresTypedToolContract === true) return true;
  if (entry.implementation?.needsNewTypedToolContract === true) return true;
  return String(entry.classification || "") === "live_lane_needed";
}

function isParallelSchedulableCandidate(entry) {
  return (
    NON_TERMINAL_CANDIDATE_STATUSES.has(entry.status) &&
    SAFE_CLASSIFICATIONS.has(entry.classification) &&
    Number.isInteger(entry.queueRank) &&
    !entry.implementation?.recoveryIntent &&
    !candidateNeedsNewTypedToolContract(entry) &&
    liveLaneIsReadyForParallelScheduling(entry)
  );
}

export function selectParallelCandidates(ledger, { candidateIds = [], limit = DEFAULT_PARALLEL_LIMIT } = {}) {
  requireArray(ledger.entries, "ledger.entries");
  ledger.entries.forEach((entry, index) => validateEntryShape(entry, `ledger.entries[${index}]`));
  const scope = new Set(candidateIds);
  const candidates = ledger.entries
    .filter(isParallelSchedulableCandidate)
    .filter((entry) => scope.size === 0 || scope.has(entry.id))
    .sort((left, right) => left.queueRank - right.queueRank || left.id.localeCompare(right.id));
  if (scope.size > 0) {
    return candidates.slice(0, limit);
  }
  const first = candidates[0] || null;
  if (!first) {
    return [];
  }
  const family = liveLaneFamily(first);
  return candidates.filter((entry) => liveLaneFamily(entry) === family).slice(0, limit);
}

function structuredRecipeChange(structuredChanges = {}) {
  if (structuredChanges.recipe && typeof structuredChanges.recipe === "object") {
    return structuredChanges.recipe;
  }
  if (structuredChanges.recipePath || structuredChanges.recipeContent) {
    return {
      path: structuredChanges.recipePath,
      content: structuredChanges.recipeContent,
    };
  }
  return null;
}

function structuredRegistrySolutions(structuredChanges = {}) {
  return Array.isArray(structuredChanges.registrySolutions) ? structuredChanges.registrySolutions : [];
}

function structuredSmokeEntries(structuredChanges = {}) {
  return Array.isArray(structuredChanges.smokeEntries) ? structuredChanges.smokeEntries : [];
}

function structuredFileChanges(structuredChanges = {}) {
  return Array.isArray(structuredChanges.fileChanges) ? structuredChanges.fileChanges : [];
}

function structuredChangedPaths(structuredChanges = {}) {
  const paths = [];
  const recipe = structuredRecipeChange(structuredChanges);
  if (recipe?.path) {
    paths.push(recipe.path);
  }
  if (structuredRegistrySolutions(structuredChanges).length > 0) {
    paths.push("registry/solutions.json");
  }
  for (const entry of structuredSmokeEntries(structuredChanges)) {
    paths.push(entry.file || "scripts/solution-library-validation-smoke.js");
  }
  for (const entry of structuredFileChanges(structuredChanges)) {
    if (entry?.path) {
      paths.push(entry.path);
    }
  }
  return sortedUnique(paths);
}

function structuredRegistrySolutionIds(structuredChanges = {}) {
  return sortedUnique([
    ...(Array.isArray(structuredChanges.registrySolutionIds) ? structuredChanges.registrySolutionIds : []),
    ...structuredRegistrySolutions(structuredChanges).map((entry) => entry?.id),
  ]);
}

function structuredSmokeEntryIds(structuredChanges = {}) {
  return sortedUnique([
    ...(Array.isArray(structuredChanges.smokeEntryIds) ? structuredChanges.smokeEntryIds : []),
    ...structuredSmokeEntries(structuredChanges).map((entry) => entry?.id),
  ]);
}

function structuredFileChangePaths(structuredChanges = {}) {
  return sortedUnique(structuredFileChanges(structuredChanges).map((entry) => entry?.path));
}

function centralLedgerPathFromProposal(proposal, targetRepo) {
  if (!proposal.ledgerPath) return null;
  return path.isAbsolute(proposal.ledgerPath)
    ? normalizeRepoPath(path.relative(targetRepo, proposal.ledgerPath))
    : normalizeRepoPath(proposal.ledgerPath);
}

function forbiddenCentralWriteReason(repoPath, proposal, targetRepo) {
  const normalized = normalizeRepoPath(repoPath);
  const ledgerRelative = centralLedgerPathFromProposal(proposal, targetRepo);
  if (ledgerRelative && normalized === ledgerRelative) return "central-ledger-write-forbidden";
  if (PARENT_ONLY_WRITE_PATHS.has(normalized)) return "parent-doc-write-forbidden";
  if (pathStartsWith(normalized, ".codex-runtime/")) return "runtime-state-write-forbidden";
  if (isDependencyPath(normalized)) return "dependency-package-change-forbidden";
  if (isRawJsxTargetPath(normalized)) return "source-jsx-copy-forbidden";
  return null;
}

function detectForbiddenPaths(paths, proposal, targetRepo) {
  return sortedUnique((paths || []).filter((repoPath) => forbiddenCentralWriteReason(repoPath, proposal, targetRepo)));
}

function unplannedPathsForCandidate(candidate, changedPaths) {
  const planned = new Set(candidatePlannedPaths(candidate));
  return sortedUnique((changedPaths || []).filter((repoPath) => !planned.has(normalizeRepoPath(repoPath))));
}

function applyStructuredChangesToWorktree(worktreePath, structuredChanges) {
  const recipe = structuredRecipeChange(structuredChanges);
  if (recipe?.path && typeof recipe.content === "string") {
    const recipePath = path.join(worktreePath, ...normalizeRepoPath(recipe.path).split("/"));
    mkdirSync(path.dirname(recipePath), { recursive: true });
    writeFileSync(recipePath, recipe.content.endsWith("\n") ? recipe.content : `${recipe.content}\n`, "utf8");
  }
  const registrySolutions = structuredRegistrySolutions(structuredChanges);
  if (registrySolutions.length > 0) {
    const registryPath = path.join(worktreePath, "registry", "solutions.json");
    const registry = existsSync(registryPath)
      ? readJson(registryPath, "parallel-worktree-registry")
      : {
          schema: "ae-solution-registry.v1",
          solutionSchema: "ae-solution.v1",
          updatedAt: new Date().toISOString().slice(0, 10),
          policy: {
            trackedStatuses: ["recipe", "typed-tool-candidate", "tool"],
            candidateLocation: "logs/solution-candidates/",
            plannerUse: "advisory-retrieval-enabled",
            executionRule: "Solutions are advisory metadata; execution still uses validated Agent plans.",
          },
          solutions: [],
        };
    registry.solutions = [...(Array.isArray(registry.solutions) ? registry.solutions : []), ...registrySolutions];
    registry.updatedAt = new Date().toISOString().slice(0, 10);
    writeJson(registryPath, registry);
  }
  for (const smoke of structuredSmokeEntries(structuredChanges)) {
    const smokeRelative = normalizeRepoPath(smoke.file || "scripts/solution-library-validation-smoke.js");
    const smokePath = path.join(worktreePath, ...smokeRelative.split("/"));
    mkdirSync(path.dirname(smokePath), { recursive: true });
    const appendText = typeof smoke.appendText === "string" ? smoke.appendText : `\n// parallel smoke entry: ${safeId(smoke.id)}\n`;
    const previous = existsSync(smokePath) ? readFileSync(smokePath, "utf8") : "";
    if (!previous.includes(appendText.trim())) {
      writeFileSync(smokePath, `${previous.replace(/\s*$/, "\n")}${appendText.endsWith("\n") ? appendText : `${appendText}\n`}`, "utf8");
    }
  }
}

function readTextFileIfSmall(filePath, label) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return null;
  }
  const size = statSync(filePath).size;
  if (size > TEXT_FILE_MAX_BYTES) {
    throw new Error(`${label}-too-large:${size}`);
  }
  return readFileSync(filePath, "utf8");
}

function readSmokeTextForAppendCompare(filePath, label) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return null;
  }
  const size = statSync(filePath).size;
  if (size > SMOKE_COMPARE_MAX_BYTES) {
    throw new Error(`${label}-too-large:${size}`);
  }
  return readFileSync(filePath, "utf8");
}

function readJsonIfExists(filePath, label) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return null;
  }
  return readJson(filePath, label);
}

function registrySolutionsAddedByChild({ targetRepo, worktreePath }) {
  const repoPath = "registry/solutions.json";
  const baseRegistry = readJsonIfExists(path.join(targetRepo, repoPath), "parallel-base-solution-registry");
  const childRegistry = readJsonIfExists(path.join(worktreePath, repoPath), "parallel-child-solution-registry");
  if (!childRegistry || !Array.isArray(childRegistry.solutions)) {
    return [];
  }
  const baseIds = new Set((Array.isArray(baseRegistry?.solutions) ? baseRegistry.solutions : []).map((entry) => entry?.id).filter(Boolean));
  return childRegistry.solutions.filter((entry) => entry?.id && !baseIds.has(entry.id));
}

function smokeEntryAddedByChild({ candidate, targetRepo, worktreePath }) {
  const repoPath = "scripts/solution-library-validation-smoke.js";
  const baseText = readSmokeTextForAppendCompare(path.join(targetRepo, repoPath), "parallel-base-smoke") || "";
  const childText = readSmokeTextForAppendCompare(path.join(worktreePath, repoPath), "parallel-child-smoke");
  if (childText === null || childText === baseText) {
    return null;
  }
  let appendText = null;
  if (childText.startsWith(baseText)) {
    appendText = childText.slice(baseText.length);
  } else {
    const normalizedBase = baseText.replace(/\r\n/g, "\n");
    const normalizedChild = childText.replace(/\r\n/g, "\n");
    if (!normalizedChild.startsWith(normalizedBase)) {
      return null;
    }
    appendText = normalizedChild.slice(normalizedBase.length);
  }
  if (!appendText.trim()) {
    return null;
  }
  if (Buffer.byteLength(appendText, "utf8") > SMOKE_APPEND_MAX_BYTES) {
    throw new Error(`parallel-child-smoke-append-too-large:${Buffer.byteLength(appendText, "utf8")}`);
  }
  return {
    id: `${safeId(candidate.id)}-child-smoke`,
    file: repoPath,
    appendText,
  };
}

function fileChangeFromChild({ repoPath, targetRepo, worktreePath }) {
  const absolute = path.join(worktreePath, ...normalizeRepoPath(repoPath).split("/"));
  const content = readTextFileIfSmall(absolute, `parallel-child-file:${repoPath}`);
  if (content === null) {
    return {
      path: normalizeRepoPath(repoPath),
      deleted: true,
    };
  }
  const baseContent = readTextFileIfSmall(path.join(targetRepo, ...normalizeRepoPath(repoPath).split("/")), `parallel-base-file:${repoPath}`);
  return {
    path: normalizeRepoPath(repoPath),
    content,
    sha256: sha256Text(content),
    baseSha256: baseContent === null ? null : sha256Text(baseContent),
  };
}

function structuredChangesFromChild({ candidate, changedPaths, targetRepo, worktreePath }) {
  const registrySolutions = changedPaths.includes("registry/solutions.json")
    ? registrySolutionsAddedByChild({ targetRepo, worktreePath })
    : [];
  const smokeEntry = changedPaths.includes("scripts/solution-library-validation-smoke.js")
    ? smokeEntryAddedByChild({ candidate, targetRepo, worktreePath })
    : null;
  const recipePaths = changedPaths.filter((repoPath) => pathStartsWith(repoPath, "recipes/") && repoPath.endsWith(".md"));
  const recipePath = recipePaths[0] || null;
  const recipe = recipePath
    ? {
        path: recipePath,
        content: readTextFileIfSmall(path.join(worktreePath, ...recipePath.split("/")), `parallel-child-recipe:${recipePath}`) || "",
      }
    : null;
  const handledPaths = new Set([
    ...(recipePath ? [recipePath] : []),
    ...(registrySolutions.length > 0 ? ["registry/solutions.json"] : []),
    ...(smokeEntry ? ["scripts/solution-library-validation-smoke.js"] : []),
  ]);
  const fileChanges = changedPaths
    .filter((repoPath) => !handledPaths.has(repoPath))
    .map((repoPath) => fileChangeFromChild({ repoPath, targetRepo, worktreePath }));
  return {
    ...(recipe ? { recipe } : {}),
    ...(registrySolutions.length > 0 ? { registrySolutions } : {}),
    ...(smokeEntry ? { smokeEntries: [smokeEntry] } : {}),
    ...(fileChanges.length > 0 ? { fileChanges } : {}),
  };
}

function proposalProofForCandidate({ candidate, changedPaths, evidence = {}, runId, worktreePath }) {
  return {
    schema: "generic-repo-full-intake.parallel-candidate-proposal-proof.v1",
    candidateId: candidate.id,
    runId,
    worktreePath,
    changedPaths,
    evidence,
    generatedAt: new Date().toISOString(),
  };
}

function buildProposalFromCandidate({ baseHead, candidate, ledgerPath, runId, targetRepo, worktreePath, proposalDir }) {
  const override = candidate.implementation?.parallelProposal || {};
  const structuredChanges = requireObject(override.structuredChanges || {}, "parallelProposal.structuredChanges");
  applyStructuredChangesToWorktree(worktreePath, structuredChanges);

  const inferredPaths = structuredChangedPaths(structuredChanges);
  const changedPaths = sortedUnique(Object.prototype.hasOwnProperty.call(override, "changedPaths") ? override.changedPaths : inferredPaths);
  const proposalShell = {
    ledgerPath: normalizeRepoPath(path.relative(targetRepo, ledgerPath)) || normalizeRepoPath(ledgerPath),
  };
  const forbiddenPaths = sortedUnique(
    Object.prototype.hasOwnProperty.call(override, "forbiddenPaths")
      ? override.forbiddenPaths
      : detectForbiddenPaths(changedPaths, proposalShell, targetRepo),
  );
  const unplannedPaths = sortedUnique(
    Object.prototype.hasOwnProperty.call(override, "unplannedPaths")
      ? override.unplannedPaths
      : unplannedPathsForCandidate(candidate, changedPaths),
  );
  const proofPath = path.join(proposalDir, `${safeId(candidate.id)}.proof.json`);
  const proof = proposalProofForCandidate({ candidate, changedPaths, runId, worktreePath });
  writeJson(proofPath, proof);
  const generatedProofSha256 = sha256FileIfExists(proofPath);
  const status = override.status || (changedPaths.length > 0 ? "proposal_ready" : "blocked");
  const reason = override.reason || (status === "blocked" ? "parallel_candidate_child_execution_not_requested" : null);
  const proposal = {
    schema: PARALLEL_PROPOSAL_SCHEMA,
    candidateId: candidate.id,
    baseHead: Object.prototype.hasOwnProperty.call(override, "baseHead") ? override.baseHead : baseHead,
    worktreeHead: gitOutput(worktreePath, ["rev-parse", "HEAD"], "worktree-rev-parse-head"),
    runId,
    worktreePath,
    ledgerPath: proposalShell.ledgerPath,
    changedPaths,
    unplannedPaths,
    forbiddenPaths,
    validationCommands: Array.isArray(override.validationCommands) ? override.validationCommands : [],
    validationResults: Array.isArray(override.validationResults) ? override.validationResults : [],
    importStatus: override.importStatus || (status === "proposal_ready" ? "speculative_non_live_validated" : "not_run"),
    liveLaneStatus: override.liveLaneStatus || (candidate.liveGate?.required ? "parent_serial_required" : "not_required"),
    liveRerunRequired: Object.prototype.hasOwnProperty.call(override, "liveRerunRequired")
      ? override.liveRerunRequired === true
      : candidate.liveGate?.required === true,
    proofPaths: [
      normalizeRepoPath(path.relative(targetRepo, proofPath)) || normalizeRepoPath(proofPath),
      ...(Array.isArray(override.proofPaths) ? override.proofPaths : []),
    ],
    proofSha256: Object.prototype.hasOwnProperty.call(override, "proofSha256") ? override.proofSha256 : generatedProofSha256,
    batchRunId: override.batchRunId || `parallel-${safeId(candidate.id)}`,
    structuredChanges: {
      ...structuredChanges,
      recipePathAdded: structuredRecipeChange(structuredChanges)?.path || null,
      registrySolutionIds: structuredRegistrySolutionIds(structuredChanges),
      smokeEntryIds: structuredSmokeEntryIds(structuredChanges),
      childDocsHandoffNotes: Array.isArray(structuredChanges.childDocsHandoffNotes)
        ? structuredChanges.childDocsHandoffNotes
        : [],
    },
    status,
    reason,
    createdAt: new Date().toISOString(),
  };
  const proposalPath = path.join(proposalDir, `${safeId(candidate.id)}.json`);
  writeJson(proposalPath, proposal);
  return {
    path: proposalPath,
    proposal,
    relativePath: normalizeRepoPath(path.relative(targetRepo, proposalPath)),
  };
}

function candidateHasStaticParallelProposal(candidate) {
  return Boolean(candidate.implementation?.parallelProposal);
}

function candidateHasChildExecutionPlan(candidate) {
  return Array.isArray(candidate.implementation?.plannedPaths) && candidate.implementation.plannedPaths.length > 0;
}

function childContextPercent(contextBudget) {
  const value = contextBudget?.currentContextPercent;
  return Number.isFinite(value) ? value : null;
}

function childQueueBatchRunId(runId, candidate) {
  return safeId(`${safeId(runId).slice(0, 36)}-${sha256Text(`${candidate.id}:parallel-child`).slice(0, 10)}-parallel`).slice(0, 80);
}

function childQueueReportPath(worktreePath, batchRunId) {
  return path.join(worktreePath, ".codex-runtime", "sdk", "generic-repo-queue-supervisor", batchRunId, "batch-report.json");
}

function proposalStatusFromChildBatch(batchReport, changedPaths) {
  if (batchReport?.ok !== true) {
    return "failed";
  }
  if (batchReport.validation?.nonLiveValidationComplete !== true) {
    return "failed";
  }
  return changedPaths.length > 0 ? "proposal_ready" : "blocked";
}

function validationResultsFromChild({ batchReport, childProcess }) {
  const summary = batchReport?.importer?.resultSummary || {};
  return [
    {
      command: "node orchestrator/run-generic-repo-queue-supervisor.mjs --batch --compact-json",
      status: childProcess.ok ? "passed" : "failed",
      exitCode: childProcess.exitCode,
      timedOut: childProcess.timedOut,
      stdout: childProcess.stdout,
      stderr: childProcess.stderr,
    },
    {
      command: "generic-repo-tool-importer non-live validation",
      status: summary.nonLiveValidationComplete === true ? "passed" : "failed",
      artifactCount: summary.artifactCount || 0,
      resultSummaryPath: summary.resultSummaryPath || null,
      validationCommandsRun: summary.validationCommandsRun === true,
    },
  ];
}

async function runChildQueueSupervisor({
  batchRunId,
  contextPercent,
  singleLedgerPath,
  targetRepo,
  timeoutMs,
  worktreePath,
}) {
  const scriptPath = path.join(REPO_ROOT, "orchestrator", "run-generic-repo-queue-supervisor.mjs");
  return runProcessBounded(
    process.execPath,
    [
      scriptPath,
      "--batch",
      "--ledger",
      singleLedgerPath,
      "--target-repo",
      worktreePath,
      "--max-items",
      "1",
      "--run-id",
      batchRunId,
      "--context-percent",
      String(contextPercent),
      "--compact-json",
    ],
    {
      cwd: REPO_ROOT,
      timeoutMs,
    },
  );
}

async function buildProposalFromChildExecution({
  baseHead,
  candidate,
  contextBudget,
  ledgerPath,
  proposalDir,
  runId,
  singleLedgerPath,
  targetRepo,
  timeoutMs,
  worktreePath,
}) {
  const contextPercent = childContextPercent(contextBudget);
  if (contextPercent === null) {
    return buildProposalFromFailure({
      baseHead,
      candidate,
      failureReason: "parallel_child_context_percent_required",
      ledgerPath,
      proposalDir,
      runId,
      targetRepo,
      worktreePath,
    });
  }

  const batchRunId = childQueueBatchRunId(runId, candidate);
  const childProcess = await runChildQueueSupervisor({
    batchRunId,
    contextPercent,
    singleLedgerPath,
    targetRepo,
    timeoutMs,
    worktreePath,
  });
  const batchReportPath = childQueueReportPath(worktreePath, batchRunId);
  const batchReport = readJsonIfExists(batchReportPath, `parallel-child-batch-report:${candidate.id}`);
  const changedPaths = sortedUnique(batchReport?.target?.changedPathsAfter || gitChangedPaths(worktreePath));
  const structuredChanges = childProcess.ok && batchReport
    ? structuredChangesFromChild({ candidate, changedPaths, targetRepo, worktreePath })
    : {};
  const forbiddenPaths = detectForbiddenPaths(changedPaths, {
    ledgerPath: normalizeRepoPath(path.relative(targetRepo, ledgerPath)) || normalizeRepoPath(ledgerPath),
  }, targetRepo);
  const unplannedPaths = unplannedPathsForCandidate(candidate, changedPaths);
  const proofPath = path.join(proposalDir, `${safeId(candidate.id)}.proof.json`);
  const proof = proposalProofForCandidate({
    candidate,
    changedPaths,
    evidence: {
      batchReportPath: batchReport ? normalizeRepoPath(path.relative(targetRepo, batchReportPath)) : null,
      batchReportSha256: sha256FileIfExists(batchReportPath),
      childProcess,
      importerRunId: batchReport?.importer?.runId || null,
      importerResultSummaryPath: batchReport?.importer?.resultSummary?.resultSummaryPath || null,
      queueSupervisorStatus: batchReport?.status || null,
      singleCandidateLedgerPath: normalizeRepoPath(path.relative(targetRepo, singleLedgerPath)),
    },
    runId,
    worktreePath,
  });
  writeJson(proofPath, proof);
  const status = proposalStatusFromChildBatch(batchReport, changedPaths);
  const proposal = {
    schema: PARALLEL_PROPOSAL_SCHEMA,
    candidateId: candidate.id,
    baseHead,
    worktreeHead: gitOutput(worktreePath, ["rev-parse", "HEAD"], "worktree-rev-parse-head"),
    runId,
    worktreePath,
    ledgerPath: normalizeRepoPath(path.relative(targetRepo, ledgerPath)) || normalizeRepoPath(ledgerPath),
    changedPaths,
    unplannedPaths,
    forbiddenPaths,
    validationCommands: ["node orchestrator/run-generic-repo-queue-supervisor.mjs --batch --compact-json"],
    validationResults: validationResultsFromChild({ batchReport, childProcess }),
    importStatus: batchReport?.status || (childProcess.ok ? "child_batch_report_missing" : "child_process_failed"),
    liveLaneStatus: candidate.liveGate?.required ? "parent_serial_required" : "not_required",
    liveRerunRequired: candidate.liveGate?.required === true,
    proofPaths: [normalizeRepoPath(path.relative(targetRepo, proofPath)) || normalizeRepoPath(proofPath)],
    proofSha256: sha256FileIfExists(proofPath),
    batchRunId,
    structuredChanges: {
      ...structuredChanges,
      recipePathAdded: structuredRecipeChange(structuredChanges)?.path || null,
      registrySolutionIds: structuredRegistrySolutionIds(structuredChanges),
      smokeEntryIds: structuredSmokeEntryIds(structuredChanges),
      fileChangePaths: structuredFileChangePaths(structuredChanges),
      childDocsHandoffNotes: [],
    },
    status,
    reason:
      status === "proposal_ready"
        ? null
        : batchReport?.importer?.error || batchReport?.status || (childProcess.timedOut ? "parallel_child_timeout" : "parallel_child_no_changes"),
    createdAt: new Date().toISOString(),
  };
  const proposalPath = path.join(proposalDir, `${safeId(candidate.id)}.json`);
  writeJson(proposalPath, proposal);
  return {
    path: proposalPath,
    proposal,
    relativePath: normalizeRepoPath(path.relative(targetRepo, proposalPath)),
  };
}

function buildProposalFromFailure({ baseHead, candidate, failureReason, ledgerPath, proposalDir, runId, targetRepo, worktreePath }) {
  const proofPath = path.join(proposalDir, `${safeId(candidate.id)}.proof.json`);
  const proof = proposalProofForCandidate({
    candidate,
    changedPaths: [],
    evidence: { failureReason },
    runId,
    worktreePath,
  });
  writeJson(proofPath, proof);
  const proposal = {
    schema: PARALLEL_PROPOSAL_SCHEMA,
    candidateId: candidate.id,
    baseHead,
    worktreeHead: gitOutput(worktreePath, ["rev-parse", "HEAD"], "worktree-rev-parse-head"),
    runId,
    worktreePath,
    ledgerPath: normalizeRepoPath(path.relative(targetRepo, ledgerPath)) || normalizeRepoPath(ledgerPath),
    changedPaths: [],
    unplannedPaths: [],
    forbiddenPaths: [],
    validationCommands: [],
    validationResults: [],
    importStatus: "not_run",
    liveLaneStatus: candidate.liveGate?.required ? "parent_serial_required" : "not_required",
    liveRerunRequired: candidate.liveGate?.required === true,
    proofPaths: [normalizeRepoPath(path.relative(targetRepo, proofPath)) || normalizeRepoPath(proofPath)],
    proofSha256: sha256FileIfExists(proofPath),
    batchRunId: `parallel-${safeId(candidate.id)}`,
    structuredChanges: {
      childDocsHandoffNotes: [],
      fileChangePaths: [],
      registrySolutionIds: [],
      smokeEntryIds: [],
    },
    status: "blocked",
    reason: failureReason,
    createdAt: new Date().toISOString(),
  };
  const proposalPath = path.join(proposalDir, `${safeId(candidate.id)}.json`);
  writeJson(proposalPath, proposal);
  return {
    path: proposalPath,
    proposal,
    relativePath: normalizeRepoPath(path.relative(targetRepo, proposalPath)),
  };
}

function removeExistingWorktreeIfSafe({ targetRepo, worktreePath, worktreesRoot }) {
  if (!existsSync(worktreePath)) {
    return;
  }
  assertInsidePath(worktreesRoot, worktreePath, "parallel-worktree-remove");
  spawnSync("git", ["worktree", "remove", "--force", worktreePath], {
    cwd: targetRepo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (existsSync(worktreePath)) {
    rmSync(worktreePath, { recursive: true, force: true });
  }
}

function createDetachedCandidateWorktree({ baseHead, candidate, targetRepo, worktreesRoot }) {
  const worktreePath = assertInsidePath(worktreesRoot, path.join(worktreesRoot, candidateWorktreeDirectoryName(candidate)), "parallel-worktree");
  removeExistingWorktreeIfSafe({ targetRepo, worktreePath, worktreesRoot });
  mkdirSync(path.dirname(worktreePath), { recursive: true });
  const cloneResult = spawnSync("git", ["-c", "core.longpaths=true", "clone", "--no-hardlinks", "--no-checkout", targetRepo, worktreePath], {
    cwd: targetRepo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (cloneResult.status !== 0) {
    throw new Error(`parallel-worktree-clone-failed:${candidate.id}: ${cloneResult.stderr || cloneResult.stdout}`);
  }
  const configResult = spawnSync("git", ["config", "core.longpaths", "true"], {
    cwd: worktreePath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (configResult.status !== 0) {
    throw new Error(`parallel-worktree-longpaths-config-failed:${candidate.id}: ${configResult.stderr || configResult.stdout}`);
  }
  const checkoutResult = spawnSync("git", ["-c", "core.longpaths=true", "checkout", "--detach", baseHead], {
    cwd: worktreePath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (checkoutResult.status !== 0) {
    throw new Error(`parallel-worktree-detach-checkout-failed:${candidate.id}: ${checkoutResult.stderr || checkoutResult.stdout}`);
  }
  const branch = gitOutput(worktreePath, ["branch", "--show-current"], "worktree-branch-show-current");
  const head = gitOutput(worktreePath, ["rev-parse", "HEAD"], "worktree-rev-parse-head");
  return {
    detached: branch === "",
    head,
    kind: "local_clone_detached",
    runOwned: true,
    path: worktreePath,
    relativePath: normalizeRepoPath(path.relative(targetRepo, worktreePath)),
  };
}

function singleCandidateLedger({ baseHead, candidate, ledger, targetRepo, worktreePath }) {
  const cloned = JSON.parse(JSON.stringify(ledger));
  cloned.target = {
    ...cloned.target,
    detachedAllowed: true,
    head: baseHead,
    repoPath: worktreePath,
  };
  cloned.nextCandidate = {
    id: candidate.id,
    sourcePath: candidate.sourcePath,
    classification: candidate.classification,
    suggestedTools: candidate.suggestedTools,
    reason: "Selected by opt-in parallel candidate worktree scheduling.",
  };
  cloned.entries = cloned.entries.map((entry) => {
    if (entry.id === candidate.id) {
      return { ...entry, status: "queued" };
    }
    return { ...entry, status: entry.status === "queued" ? "parallel_candidate_not_selected" : entry.status };
  });
  return cloned;
}

function writeSingleCandidateLedger({ baseHead, candidate, ledger, ledgerRoot, targetRepo, worktreePath }) {
  const ledgerPath = path.join(ledgerRoot, `${safeId(candidate.id)}.json`);
  writeJson(ledgerPath, singleCandidateLedger({ baseHead, candidate, ledger, targetRepo, worktreePath }));
  return ledgerPath;
}

function existingRegistrySolutionIds(targetRepo) {
  const registryPath = path.join(targetRepo, "registry", "solutions.json");
  if (!existsSync(registryPath)) {
    return new Set();
  }
  const registry = readJson(registryPath, "solution-registry");
  return new Set((Array.isArray(registry.solutions) ? registry.solutions : []).map((entry) => entry.id).filter(Boolean));
}

function registryObjectForTarget(targetRepo) {
  const registryPath = path.join(targetRepo, "registry", "solutions.json");
  if (existsSync(registryPath)) {
    return readJson(registryPath, "solution-registry");
  }
  return {
    schema: "ae-solution-registry.v1",
    solutionSchema: "ae-solution.v1",
    updatedAt: new Date().toISOString().slice(0, 10),
    policy: {
      trackedStatuses: ["recipe", "typed-tool-candidate", "tool"],
      candidateLocation: "logs/solution-candidates/",
      plannerUse: "advisory-retrieval-enabled",
      executionRule: "Solutions are advisory metadata; execution still uses validated Agent plans.",
    },
    solutions: [],
  };
}

function validateProposalSchema(proposal) {
  requireObject(proposal, "proposal");
  if (proposal.schema !== PARALLEL_PROPOSAL_SCHEMA) {
    throw new Error("parallel-proposal-schema-mismatch");
  }
  requireString(proposal.candidateId, "proposal.candidateId");
  requireString(proposal.baseHead, "proposal.baseHead");
  requireString(proposal.worktreeHead, "proposal.worktreeHead");
  requireString(proposal.runId, "proposal.runId");
  requireString(proposal.worktreePath, "proposal.worktreePath");
  requireArray(proposal.changedPaths, "proposal.changedPaths");
  requireArray(proposal.unplannedPaths, "proposal.unplannedPaths");
  requireArray(proposal.forbiddenPaths, "proposal.forbiddenPaths");
  requireArray(proposal.validationCommands, "proposal.validationCommands");
  requireArray(proposal.validationResults, "proposal.validationResults");
  requireString(proposal.importStatus, "proposal.importStatus");
  requireString(proposal.liveLaneStatus, "proposal.liveLaneStatus");
  if (typeof proposal.liveRerunRequired !== "boolean") {
    throw new Error("proposal.liveRerunRequired must be a boolean");
  }
  requireArray(proposal.proofPaths, "proposal.proofPaths");
  requireString(proposal.batchRunId, "proposal.batchRunId");
  requireObject(proposal.structuredChanges, "proposal.structuredChanges");
  requireString(proposal.status, "proposal.status");
  if (!PROPOSAL_TERMINAL_STATUSES.has(proposal.status)) {
    throw new Error(`parallel-proposal-status-unknown:${proposal.status}`);
  }
}

function rejection(code, proposal, extra = {}) {
  return {
    candidateId: proposal.candidateId,
    code,
    proposalPath: proposal.proposalPath || null,
    reason: code,
    status: "rejected",
    ...extra,
  };
}

function validateProposalForReduction({
  acceptedFileChangePaths,
  acceptedRecipePaths,
  acceptedRegistrySolutionIds,
  currentHead,
  existingRecipePaths,
  existingSolutionIds,
  proposal,
  targetRepo,
  worktreesRoot,
}) {
  try {
    validateProposalSchema(proposal);
  } catch (error) {
    return rejection(`schema:${error.message}`, proposal);
  }
  if (proposal.status !== "proposal_ready") {
    return {
      candidateId: proposal.candidateId,
      code: proposal.status,
      proposalPath: proposal.proposalPath || null,
      reason: proposal.reason || proposal.status,
      status: proposal.status,
    };
  }
  const worktreePath = path.resolve(proposal.worktreePath);
  if (!isInsidePath(worktreesRoot, worktreePath)) {
    return rejection("worktree-not-run-owned", proposal, { worktreePath: proposal.worktreePath });
  }
  const detachedBranch = gitOutput(worktreePath, ["branch", "--show-current"], "proposal-worktree-branch");
  if (detachedBranch !== "") {
    return rejection("worktree-not-detached", proposal);
  }
  if (proposal.baseHead !== currentHead) {
    return rejection("stale-base-head", proposal, { baseHead: proposal.baseHead, currentHead });
  }
  if (proposal.unplannedPaths.length > 0) {
    return rejection("unplanned-paths", proposal, { unplannedPaths: proposal.unplannedPaths });
  }
  const detectedForbiddenPaths = detectForbiddenPaths(proposal.changedPaths, proposal, targetRepo);
  const forbiddenPaths = sortedUnique([...proposal.forbiddenPaths, ...detectedForbiddenPaths]);
  if (forbiddenPaths.length > 0) {
    return rejection("forbidden-paths", proposal, { forbiddenPaths });
  }
  if (!proposal.proofSha256) {
    return rejection("missing-proof-hash", proposal);
  }
  if (proposal.liveRerunRequired === true) {
    return rejection("live-rerun-parent-serial-unavailable", proposal);
  }
  const recipe = structuredRecipeChange(proposal.structuredChanges);
  if (recipe?.path) {
    const recipePath = normalizeRepoPath(recipe.path);
    if (existingRecipePaths.has(recipePath) || acceptedRecipePaths.has(recipePath)) {
      return rejection("duplicate-recipe-path", proposal, { recipePath });
    }
  }
  for (const solutionId of structuredRegistrySolutionIds(proposal.structuredChanges)) {
    if (existingSolutionIds.has(solutionId) || acceptedRegistrySolutionIds.has(solutionId)) {
      return rejection("duplicate-registry-solution-id", proposal, { solutionId });
    }
  }
  for (const filePath of structuredFileChangePaths(proposal.structuredChanges)) {
    if (acceptedFileChangePaths.has(filePath)) {
      return rejection("duplicate-file-change-path", proposal, { filePath });
    }
  }
  return null;
}

function applyRegistrySolutions(targetRepo, registrySolutions) {
  if (registrySolutions.length === 0) {
    return null;
  }
  const registryPath = path.join(targetRepo, "registry", "solutions.json");
  const registry = registryObjectForTarget(targetRepo);
  registry.solutions = Array.isArray(registry.solutions) ? registry.solutions : [];
  registry.solutions.push(...registrySolutions);
  registry.updatedAt = new Date().toISOString().slice(0, 10);
  writeJson(registryPath, registry);
  return normalizeRepoPath(path.relative(targetRepo, registryPath));
}

function applySmokeEntries(targetRepo, smokeEntries) {
  const touched = [];
  for (const smoke of smokeEntries) {
    const smokeRelative = normalizeRepoPath(smoke.file || "scripts/solution-library-validation-smoke.js");
    if (smokeRelative !== "scripts/solution-library-validation-smoke.js") {
      throw new Error(`parallel-smoke-entry-file-forbidden:${smokeRelative}`);
    }
    const smokePath = path.join(targetRepo, ...smokeRelative.split("/"));
    mkdirSync(path.dirname(smokePath), { recursive: true });
    const previous = existsSync(smokePath) ? readFileSync(smokePath, "utf8") : "";
    const appendText = typeof smoke.appendText === "string" ? smoke.appendText : `\n// parallel smoke entry: ${safeId(smoke.id)}\n`;
    if (!previous.includes(appendText.trim())) {
      writeFileSync(smokePath, `${previous.replace(/\s*$/, "\n")}${appendText.endsWith("\n") ? appendText : `${appendText}\n`}`, "utf8");
    }
    touched.push(smokeRelative);
  }
  return touched;
}

function applyFileChanges(targetRepo, fileChanges) {
  const touched = [];
  for (const change of fileChanges) {
    const relative = normalizeRepoPath(change?.path);
    if (!relative) {
      throw new Error("parallel-file-change-path-missing");
    }
    if (PARENT_ONLY_WRITE_PATHS.has(relative) || pathStartsWith(relative, ".codex-runtime/")) {
      throw new Error(`parallel-file-change-parent-owned-path:${relative}`);
    }
    if (relative === "registry/solutions.json" || relative === "scripts/solution-library-validation-smoke.js") {
      throw new Error(`parallel-file-change-shared-path-requires-structured-merge:${relative}`);
    }
    if (isDependencyPath(relative) || isRawJsxTargetPath(relative)) {
      throw new Error(`parallel-file-change-forbidden-path:${relative}`);
    }
    const absolute = path.join(targetRepo, ...relative.split("/"));
    if (change.deleted === true) {
      if (existsSync(absolute)) {
        rmSync(absolute, { force: true });
      }
      touched.push(relative);
      continue;
    }
    if (typeof change.content !== "string") {
      throw new Error(`parallel-file-change-content-missing:${relative}`);
    }
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, change.content, "utf8");
    touched.push(relative);
  }
  return touched;
}

function applyAcceptedProposal(targetRepo, proposal) {
  const touched = [];
  const recipe = structuredRecipeChange(proposal.structuredChanges);
  if (recipe?.path && typeof recipe.content === "string") {
    const recipeRelative = normalizeRepoPath(recipe.path);
    const recipePath = path.join(targetRepo, ...recipeRelative.split("/"));
    mkdirSync(path.dirname(recipePath), { recursive: true });
    writeFileSync(recipePath, recipe.content.endsWith("\n") ? recipe.content : `${recipe.content}\n`, "utf8");
    touched.push(recipeRelative);
  }
  const registryPath = applyRegistrySolutions(targetRepo, structuredRegistrySolutions(proposal.structuredChanges));
  if (registryPath) {
    touched.push(registryPath);
  }
  touched.push(...applySmokeEntries(targetRepo, structuredSmokeEntries(proposal.structuredChanges)));
  touched.push(...applyFileChanges(targetRepo, structuredFileChanges(proposal.structuredChanges)));
  return sortedUnique(touched);
}

function insertAfterHeading(text, heading, line) {
  if (text.includes(line)) {
    return text;
  }
  const match = new RegExp(`(^|\\r?\\n)${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\r?\\n`).exec(text);
  if (!match) {
    return `${text.replace(/\s*$/, "\n\n")}${heading}\n\n${line}\n`;
  }
  const insertAt = match.index + match[0].length;
  const prefix = text.slice(0, insertAt);
  const suffix = text.slice(insertAt);
  return `${prefix}\n${line}${suffix.startsWith("\n") ? "" : "\n"}${suffix}`;
}

function insertValidationRow(text, row) {
  if (text.includes(row)) {
    return text;
  }
  const match = /(^|\r?\n)## Validation\r?\n/.exec(text);
  if (!match) {
    return `${text.replace(/\s*$/, "\n\n")}## Validation\n\n${row}\n`;
  }
  const afterHeading = match.index + match[0].length;
  const nextSection = text.indexOf("\n## ", afterHeading);
  const sectionEnd = nextSection === -1 ? text.length : nextSection;
  const section = text.slice(afterHeading, sectionEnd);
  const lines = section.split(/\n/);
  const separatorIndex = lines.findIndex((line) => /^\|\s*-+/.test(line));
  if (separatorIndex >= 0) {
    lines.splice(separatorIndex + 1, 0, row);
    return `${text.slice(0, afterHeading)}${lines.join("\n")}${text.slice(sectionEnd)}`;
  }
  return `${text.slice(0, afterHeading)}\n${row}${section.startsWith("\n") ? "" : "\n"}${section}${text.slice(sectionEnd)}`;
}

function updateParentPlanForParallel({ accepted, rejected, runId, targetRepo }) {
  const planPath = path.join(targetRepo, "plans", "target-app-execplan.md");
  if (!existsSync(planPath)) {
    return null;
  }
  const marker = `AUX parallel candidate worktrees architecture (${runId})`;
  const acceptedIds = accepted.map((entry) => entry.candidateId).join(", ") || "none";
  const rejectedIds = rejected.map((entry) => `${entry.candidateId}:${entry.code}`).join(", ") || "none";
  let text = readFileSync(planPath, "utf8");
  text = insertAfterHeading(
    text,
    "## Progress",
    `- [x] ${marker}: parent reducer serially handled accepted proposals [${acceptedIds}] and rejected [${rejectedIds}].`,
  );
  text = insertAfterHeading(
    text,
    "## Decision Log",
    `- ${new Date().toISOString().slice(0, 10)}: AUX parallel candidate worktrees stay opt-in; child worktrees produce proposals only, while the parent owns ledger, registry, plan, handoff, live rerun, and commits (${runId}).`,
  );
  text = insertValidationRow(
    text,
    `| ${marker} | Required to prove opt-in parallel candidate worktrees plus a serial parent reducer without running the real queue. | Accepted ${accepted.length}, rejected ${rejected.length}; central writes stayed parent-owned, live rerun stayed serial, and unplanned paths were rejected. |`,
  );
  writeFileSync(planPath, text, "utf8");
  return normalizeRepoPath(path.relative(targetRepo, planPath));
}

function writeParentHandoffForParallel({ accepted, commitId, rejected, runId, targetRepo }) {
  const handoffPath = path.join(targetRepo, ".codex", "handoff.md");
  mkdirSync(path.dirname(handoffPath), { recursive: true });
  const acceptedIds = accepted.map((entry) => entry.candidateId).join(", ") || "none";
  const rejectedIds = rejected.map((entry) => `${entry.candidateId}:${entry.code}`).join(", ") || "none";
  const text = [
    "# Handoff",
    "",
    "currentGoal: AUX parallel candidate worktrees architecture.",
    `currentState: Parent reducer handled proposals for run ${runId}. Accepted: ${acceptedIds}. Rejected: ${rejectedIds}.`,
    "filesTouched: parent-owned reducer output, registry/solutions.json, recipes, solution-library smoke, plan, and this handoff when proposals were accepted.",
    "validationRun: targeted parallel proposal/reducer smoke plus repository validation should be run before using on real queue.",
    "decisions: Parallel candidates are opt-in; worktrees are detached and run-owned; central ledger/docs/commits/live rerun remain parent-owned and serial.",
    "risks: Real queue usage still needs a separate longrun with scoped candidates and live lane availability.",
    `commitId: ${commitId || "pending"}`,
    "exactNextPrompt: Продолжи отдельным longrun только после review этого AUX milestone; используй --parallel-candidate-worktrees со scoped ids и не запускай broad/live/default smoke.",
    "",
  ].join("\n");
  writeFileSync(handoffPath, text, "utf8");
  return normalizeRepoPath(path.relative(targetRepo, handoffPath));
}

function updateLedgerForReduction({ accepted, commitId, ledger, ledgerPath, rejected, runId }) {
  const now = new Date().toISOString();
  for (const acceptedEntry of accepted) {
    const entry = ledger.entries.find((candidate) => candidate.id === acceptedEntry.candidateId);
    if (!entry) continue;
    entry.status = "completed";
    entry.completedAt = now;
    entry.nextAction = `parallel_proposal_accepted_by_${safeId(runId)}`;
    entry.implementation = {
      ...(entry.implementation || {}),
      batchRunId: acceptedEntry.batchRunId || null,
      commit: commitId || null,
      parallelProposal: {
        schema: PARALLEL_REDUCER_SCHEMA,
        proposalPath: acceptedEntry.proposalPath,
        reducerRunId: runId,
        status: "accepted",
      },
    };
  }
  for (const rejectedEntry of rejected) {
    const entry = ledger.entries.find((candidate) => candidate.id === rejectedEntry.candidateId);
    if (!entry) continue;
    entry.failClosed = {
      schema: "generic-repo-full-intake.parallel-candidate-rejection.v1",
      runId,
      candidateId: rejectedEntry.candidateId,
      status: "rejected",
      reason: rejectedEntry.code,
      proposalPath: rejectedEntry.proposalPath || null,
      createdAt: now,
    };
  }
  writeJson(ledgerPath, ledger);
}

export function reduceParallelCandidateProposals({
  ledger,
  ledgerPath,
  noCommit = false,
  proposals,
  runId,
  runRoot,
  targetRepo,
}) {
  const dirtyBefore = gitChangedPaths(targetRepo).filter((repoPath) => !gitPathIsIgnored(targetRepo, repoPath));
  if (dirtyBefore.length > 0) {
    return {
      schema: PARALLEL_REDUCER_SCHEMA,
      ok: false,
      status: "blocked_parallel_reducer_dirty_central_tree",
      accepted: [],
      rejected: [],
      blockers: [{ code: "dirty-central-tree", changedPaths: dirtyBefore }],
      commitId: null,
      liveRerun: { parentOwned: true, serial: true, runByChild: false },
    };
  }
  const currentHead = gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head");
  const worktreesRoot = parallelWorktreesRoot(targetRepo, runId);
  const existingRecipePaths = new Set(
    existsSync(path.join(targetRepo, "recipes"))
      ? readdirSync(path.join(targetRepo, "recipes"))
          .filter((entry) => entry.endsWith(".md"))
          .map((entry) => `recipes/${entry}`)
      : [],
  );
  const existingSolutionIds = existingRegistrySolutionIds(targetRepo);
  const acceptedFileChangePaths = new Set();
  const acceptedRecipePaths = new Set();
  const acceptedRegistrySolutionIds = new Set();
  const accepted = [];
  const rejected = [];
  const blocked = [];

  for (const proposal of proposals) {
    const decision = validateProposalForReduction({
      acceptedFileChangePaths,
      acceptedRecipePaths,
      acceptedRegistrySolutionIds,
      currentHead,
      existingRecipePaths,
      existingSolutionIds,
      proposal,
      targetRepo,
      worktreesRoot,
    });
    if (decision) {
      if (decision.status === "blocked" || decision.status === "failed") {
        blocked.push(decision);
      } else {
        rejected.push(decision);
      }
      continue;
    }
    const touchedPaths = applyAcceptedProposal(targetRepo, proposal);
    const recipe = structuredRecipeChange(proposal.structuredChanges);
    if (recipe?.path) {
      acceptedRecipePaths.add(normalizeRepoPath(recipe.path));
    }
    for (const solutionId of structuredRegistrySolutionIds(proposal.structuredChanges)) {
      acceptedRegistrySolutionIds.add(solutionId);
    }
    for (const filePath of structuredFileChangePaths(proposal.structuredChanges)) {
      acceptedFileChangePaths.add(filePath);
    }
    accepted.push({
      batchRunId: proposal.batchRunId,
      candidateId: proposal.candidateId,
      liveRerunRequired: proposal.liveRerunRequired,
      proposalPath: proposal.proposalPath || null,
      status: "accepted",
      touchedPaths,
    });
  }

  let planPath = null;
  let handoffPath = null;
  let commitId = null;
  if (accepted.length > 0) {
    planPath = updateParentPlanForParallel({ accepted, rejected, runId, targetRepo });
    handoffPath = writeParentHandoffForParallel({ accepted, commitId: null, rejected, runId, targetRepo });
    if (!noCommit) {
      commitId = stageAndCommitReviewableChanges(targetRepo, "AUX: accept parallel candidate proposals");
    }
    if (commitId) {
      handoffPath = writeParentHandoffForParallel({ accepted, commitId, rejected, runId, targetRepo });
    }
  }
  updateLedgerForReduction({ accepted, commitId, ledger, ledgerPath, rejected, runId });
  return {
    schema: PARALLEL_REDUCER_SCHEMA,
    ok: true,
    status:
      accepted.length > 0 && rejected.length > 0
        ? "parallel_reducer_completed_with_rejections"
        : accepted.length > 0
        ? "parallel_reducer_completed"
        : rejected.length > 0
        ? "parallel_reducer_rejected_all"
        : blocked.length > 0
        ? "parallel_proposals_blocked"
        : "parallel_reducer_no_ready_proposals",
    accepted,
    rejected,
    blocked,
    blockers: [],
    commitId,
    handoffPath,
    liveRerun: { parentOwned: true, serial: true, runByChild: false },
    planPath,
  };
}

function writeParallelProof({ candidatePlans, planPath, proposals, reducer, report, runRoot, targetRepo }) {
  const worktrees = candidatePlans.map((entry) => entry.worktree).filter(Boolean);
  const proof = {
    schema: PARALLEL_PROOF_SCHEMA,
    runId: report.runId,
    mode: report.parallel?.mode || null,
    contractComplete: reducer ? reducer.ok === true : report.status === "parallel_plan_ready",
    evidence: {
      centralWriterOnly: true,
      childWorktreesDetached: worktrees.every((entry) => entry.detached === true),
      noUnplannedPathsAccepted: (reducer?.accepted || []).every((entry) => {
        const proposal = proposals.find((item) => item.candidateId === entry.candidateId);
        return proposal && Array.isArray(proposal.unplannedPaths) && proposal.unplannedPaths.length === 0;
      }),
      proposalsAcceptedSerially: true,
      proposalsRejectedSerially: true,
      worktreesRunOwned: worktrees.every((entry) => entry.runOwned === true),
    },
    planPath,
    proposalPaths: proposals.map((entry) => entry.proposalPath).filter(Boolean),
    reducerStatus: reducer?.status || null,
    createdAt: new Date().toISOString(),
  };
  const proofPath = path.join(runRoot, "parallel-candidates", "parallel-proof-envelope.json");
  writeJson(proofPath, proof);
  return {
    envelope: proof,
    path: normalizeRepoPath(path.relative(targetRepo, proofPath)),
    sha256: sha256FileIfExists(proofPath),
  };
}

function compactParallelPlan({ baseHead, candidateIds, limit, mode, runId, selected, targetRepo, worktreesRoot }) {
  return {
    schema: PARALLEL_PLAN_SCHEMA,
    runId,
    mode,
    baseHead,
    limit,
    scopedCandidateIds: candidateIds,
    selectedCandidateIds: selected.map((entry) => entry.id),
    candidates: selected.map((entry) => ({
      candidateId: entry.id,
      classification: entry.classification,
      liveLaneFamily: liveLaneFamily(entry),
      liveRerunRequired: entry.liveGate?.required === true,
      plannedPaths: candidatePlannedPaths(entry),
      sourcePath: entry.sourcePath,
    })),
    runOwnedRoot: normalizeRepoPath(path.relative(targetRepo, worktreesRoot)),
    safetyPolicy: {
      branchCreationAllowedForChild: false,
      centralLedgerWritesAllowedForChild: false,
      dependencyPackageChangesAllowed: false,
      extraWorktreesAllowedForChild: false,
      fallbackProviderAllowed: false,
      liveCepAeAllowedForChild: false,
      liveRerunParentOwnedSerial: true,
      localOllamaAllowed: false,
      parentReducerSerial: true,
      planHandoffWritesAllowedForChild: false,
    },
    createdAt: new Date().toISOString(),
  };
}

export async function runParallelCandidateWorktrees({
  contextBudget,
  ledger,
  ledgerPath,
  options,
  runId,
  runRoot,
  targetRepo,
}) {
  const limit = parsePositiveInteger(options.parallelCandidateLimit, "parallel-candidate-limit", DEFAULT_PARALLEL_LIMIT);
  const timeoutMs = parsePositiveInteger(options.commandTimeoutMs, "command-timeout-ms", DEFAULT_CHILD_PROCESS_TIMEOUT_MS);
  const candidateIds = parseCsv(options.parallelCandidateIds);
  const planOnly = options.planParallelCandidateWorktrees === true && options.parallelCandidateWorktrees !== true;
  const mode = planOnly ? "parallel_plan_only" : "parallel_candidate_worktrees";
  const baseHead = gitOutput(targetRepo, ["rev-parse", "HEAD"], "rev-parse-head");
  const selected = selectParallelCandidates(ledger, { candidateIds, limit });
  const parallelRoot = path.join(runRoot, "parallel-candidates");
  const worktreesRoot = parallelWorktreesRoot(targetRepo, runId);
  const proposalDir = path.join(parallelRoot, "proposals");
  mkdirSync(parallelRoot, { recursive: true });

  const plan = compactParallelPlan({ baseHead, candidateIds, limit, mode, runId, selected, targetRepo, worktreesRoot });
  const planPath = path.join(parallelRoot, "parallel-plan.json");
  writeJson(planPath, plan);

  const report = {
    schema: "generic-repo-full-intake.parallel-candidate-worktrees-run.v1",
    ok: true,
    status: planOnly ? "parallel_plan_ready" : "parallel_worktrees_running",
    runId,
    runRoot: normalizeRepoPath(path.relative(targetRepo, runRoot)),
    ledgerPath: normalizeRepoPath(path.relative(targetRepo, ledgerPath)) || normalizeRepoPath(ledgerPath),
    targetRepo,
    maxItems: limit,
    resumed: false,
    gitHeadBefore: baseHead,
    contextBudget: {
      ...(contextBudget || {}),
      overrideNextStepCost: contextBudget?.overrideNextStepCost ?? null,
    },
    items: [],
    blockers: [],
    commits: [],
    parallel: {
      schema: PARALLEL_PLAN_SCHEMA,
      optIn: true,
      mode,
      limit,
      planPath: normalizeRepoPath(path.relative(targetRepo, planPath)),
      selectedCandidateIds: selected.map((entry) => entry.id),
      worktrees: {
        created: 0,
        detached: 0,
        runOwned: 0,
        cleaned: 0,
      },
      proposals: [],
      reducer: null,
    },
    createdAt: new Date().toISOString(),
  };

  if (planOnly) {
    const proof = writeParallelProof({
      candidatePlans: [],
      planPath: report.parallel.planPath,
      proposals: [],
      reducer: null,
      report,
      runRoot,
      targetRepo,
    });
    report.proofEnvelopePath = proof.path;
    report.proofEnvelopeSha256 = proof.sha256;
    report.proofEnvelopeContractComplete = true;
    writeJson(path.join(runRoot, "run-report.json"), report);
    return report;
  }

  const dirtyBeforeParallelWork = gitChangedPaths(targetRepo).filter((repoPath) => !gitPathIsIgnored(targetRepo, repoPath));
  if (dirtyBeforeParallelWork.length > 0) {
    const reducer = {
      schema: PARALLEL_REDUCER_SCHEMA,
      ok: false,
      status: "blocked_parallel_reducer_dirty_central_tree",
      accepted: [],
      rejected: [],
      blocked: [],
      blockers: [{ code: "dirty-central-tree", changedPaths: dirtyBeforeParallelWork }],
      commitId: null,
      liveRerun: { parentOwned: true, serial: true, runByChild: false },
    };
    report.parallel.reducer = reducer;
    report.status = reducer.status;
    report.ok = false;
    report.blockers = reducer.blockers;
    const proof = writeParallelProof({
      candidatePlans: [],
      planPath: report.parallel.planPath,
      proposals: [],
      reducer,
      report,
      runRoot,
      targetRepo,
    });
    report.proofEnvelopePath = proof.path;
    report.proofEnvelopeSha256 = proof.sha256;
    report.proofEnvelopeContractComplete = false;
    writeJson(path.join(runRoot, "run-report.json"), report);
    return report;
  }

  const candidatePlanTasks = selected.map((candidate) => {
    const worktree = createDetachedCandidateWorktree({ baseHead, candidate, targetRepo, worktreesRoot });
    const childLedgerRoot = path.join(
      worktree.path,
      ".codex-runtime",
      "sdk",
      "generic-repo-full-intake",
      safeId(runId),
      "parallel-single-candidate-ledgers",
    );
    const singleLedgerPath = writeSingleCandidateLedger({
      baseHead,
      candidate,
      ledger,
      ledgerRoot: childLedgerRoot,
      targetRepo,
      worktreePath: worktree.path,
    });
    const candidatePlan = {
      candidateId: candidate.id,
      singleCandidateLedgerPath: normalizeRepoPath(path.relative(targetRepo, singleLedgerPath)),
      worktree,
      proposalPath: null,
    };
    return (async () => {
      let proposalResult;
      try {
        if (candidateHasStaticParallelProposal(candidate)) {
          proposalResult = buildProposalFromCandidate({
            baseHead,
            candidate,
            ledgerPath,
            proposalDir,
            runId,
            targetRepo,
            worktreePath: worktree.path,
          });
        } else if (!candidateHasChildExecutionPlan(candidate)) {
          proposalResult = buildProposalFromFailure({
            baseHead,
            candidate,
            failureReason: "parallel_candidate_child_execution_not_requested",
            ledgerPath,
            proposalDir,
            runId,
            targetRepo,
            worktreePath: worktree.path,
          });
        } else {
          proposalResult = await buildProposalFromChildExecution({
            baseHead,
            candidate,
            contextBudget,
            ledgerPath,
            proposalDir,
            runId,
            singleLedgerPath,
            targetRepo,
            timeoutMs,
            worktreePath: worktree.path,
          });
        }
      } catch (error) {
        proposalResult = buildProposalFromFailure({
          baseHead,
          candidate,
          failureReason: `parallel_child_exception:${error.message}`,
          ledgerPath,
          proposalDir,
          runId,
          targetRepo,
          worktreePath: worktree.path,
        });
      }
      proposalResult.proposal.proposalPath = proposalResult.relativePath;
      candidatePlan.proposalPath = proposalResult.relativePath;
      return { candidate, candidatePlan, proposalResult };
    })();
  });

  const candidateResults = await Promise.all(candidatePlanTasks);
  const candidatePlans = [];
  const proposals = [];
  for (const { candidate, candidatePlan, proposalResult } of candidateResults) {
    proposalResult.proposal.proposalPath = proposalResult.relativePath;
    proposals.push(proposalResult.proposal);
    candidatePlans.push(candidatePlan);
    report.parallel.proposals.push({
      candidateId: candidate.id,
      path: proposalResult.relativePath,
      status: proposalResult.proposal.status,
    });
    report.items.push({
      candidateId: candidate.id,
      batchRunId: proposalResult.proposal.batchRunId,
      importStatus: proposalResult.proposal.importStatus,
      liveLaneStatus: proposalResult.proposal.liveLaneStatus,
      liveRerunRequired: proposalResult.proposal.liveRerunRequired,
      proposalPath: proposalResult.relativePath,
      status: proposalResult.proposal.status,
    });
  }
  report.parallel.worktrees = {
    created: candidatePlans.length,
    detached: candidatePlans.filter((entry) => entry.worktree.detached).length,
    runOwned: candidatePlans.filter((entry) => entry.worktree.runOwned).length,
    cleaned: 0,
  };

  const reducer = reduceParallelCandidateProposals({
    ledger,
    ledgerPath,
    noCommit: options.noCommit === true,
    proposals,
    runId,
    runRoot,
    targetRepo,
  });
  report.parallel.reducer = reducer;
  report.status = reducer.status;
  report.ok = reducer.ok === true;
  report.blockers = reducer.blockers || [];
  report.commits = reducer.commitId ? [reducer.commitId] : [];
  for (const item of report.items) {
    const accepted = reducer.accepted.find((entry) => entry.candidateId === item.candidateId);
    const rejected = reducer.rejected.find((entry) => entry.candidateId === item.candidateId);
    const blocked = reducer.blocked.find((entry) => entry.candidateId === item.candidateId);
    if (accepted) {
      item.status = "completed";
      item.commitId = reducer.commitId;
      item.liveRerunStatus = "not_required";
    } else if (rejected) {
      item.status = "rejected";
      item.reason = rejected.code;
      item.liveRerunStatus = rejected.code === "live-rerun-parent-serial-unavailable" ? "parent_serial_unavailable" : null;
    } else if (blocked) {
      item.status = blocked.status;
      item.reason = blocked.reason;
    }
  }

  let cleaned = 0;
  for (const planEntry of candidatePlans) {
    removeExistingWorktreeIfSafe({ targetRepo, worktreePath: planEntry.worktree.path, worktreesRoot });
    if (!existsSync(planEntry.worktree.path)) {
      cleaned += 1;
    }
  }
  report.parallel.worktrees.cleaned = cleaned;

  const proof = writeParallelProof({
    candidatePlans,
    planPath: report.parallel.planPath,
    proposals,
    reducer,
    report,
    runRoot,
    targetRepo,
  });
  report.proofEnvelopePath = proof.path;
  report.proofEnvelopeSha256 = proof.sha256;
  report.proofEnvelopeContractComplete = reducer.ok === true;
  writeJson(path.join(runRoot, "run-report.json"), report);
  return report;
}

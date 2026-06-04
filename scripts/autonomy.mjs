#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const AUTONOMY_DIR = ".codex-autonomy";
const STATE_SCHEMA_VERSION = "1";
const STATE_SCHEMA = "codex-autonomy.state.v1";
const INVENTORY_SCHEMA = "codex-autonomy.inventory.v1";
const RANKING_SCHEMA = "codex-autonomy.ranking.v1";
const VALIDATION_SCHEMA = "codex-autonomy.validation-results.v1";
const LANE_SCHEMA = "codex-autonomy.validation-lane.v1";
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;
const DEFAULT_MAX_WALL_TIME_MINUTES = 60;
const DEFAULT_CODEX_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_FILE_BYTES = 768 * 1024;
const MAX_PROMPT_PREVIEW_CHARS = 1800;

const VALID_STATE_STATUSES = new Set(["continue", "done", "blocked", "needs_human"]);
const VALID_LAST_RUN_STATUSES = new Set(["not_run", "passed", "failed", "partial"]);
const SCRIPT_STATUSES = ["pending", "in_progress", "accepted", "rejected", "needs_lane", "needs_revalidation", "blocked"];
const SAFE_EXTERNAL_RISK_STRATEGIES = new Set(["mock", "dry-run", "read-only-fixture", "static-fixture"]);

const CANDIDATE_EXTENSIONS = new Set([
  ".bat",
  ".cjs",
  ".cmd",
  ".js",
  ".jsx",
  ".jsxinc",
  ".mjs",
  ".ps1",
  ".py",
  ".sh",
  ".ts",
  ".tsx",
]);

const IGNORE_DIRS = new Set([
  ".cache",
  ".codex",
  ".codex-autonomy",
  ".codex-runtime",
  ".git",
  ".hg",
  ".next",
  ".svn",
  ".turbo",
  ".venv",
  ".vite",
  "__pycache__",
  "backups",
  "build",
  "cache",
  "coverage",
  "dist",
  "logs",
  "node_modules",
  "out",
  "target",
  "tmp",
  "venv",
]);

const SECRET_FILE_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /\.pem$/i,
  /\.key$/i,
  /credential/i,
  /secret/i,
  /token/i,
];

const RANKING_POLICY = Object.freeze([
  { name: "detectability", weight: 1, description: "Назначение понятно по имени, help/main/signals." },
  { name: "runnable", weight: 1, description: "Есть entrypoint, package script, shebang или dry-run/help." },
  { name: "testability", weight: 1, description: "Есть smoke/test/validation lane или понятный fixture path." },
  { name: "safety", weight: 2, description: "Нет destructive/network/credential side effects без dry-run/mock." },
  { name: "relevance", weight: 1, description: "Кандидат относится к текущему AE Agent workflow." },
  { name: "maintainability", weight: 1, description: "Размер, зависимости и структура позволяют сопровождение." },
  { name: "evidence", weight: 1, description: "Есть результаты validation или lane evidence." },
]);

const DEFAULT_OBJECTIVE =
  "Итеративно инвентаризировать, ранжировать, валидировать и отбирать scripts/tools в репозитории через компактный файловый state/handoff contract.";

function nowIso() {
  return new Date().toISOString();
}

function normalizeRepoPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function relativeTo(repoRoot, targetPath) {
  return normalizeRepoPath(path.relative(repoRoot, targetPath)) || ".";
}

function safeId(value, fallback = "item") {
  const normalized = normalizeRepoPath(value)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/[\\/]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/-{2,}/g, "-");
  const base = normalized || fallback;
  if (base.length <= 80) return base;
  return `${base.slice(0, 64).replace(/[._-]+$/g, "")}-${sha256Text(base).slice(0, 10)}`;
}

function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function repoPath(repoRoot, repoRelativePath) {
  return path.join(repoRoot, ...normalizeRepoPath(repoRelativePath).split("/").filter(Boolean));
}

function autonomyPath(repoRoot, ...parts) {
  return path.join(repoRoot, AUTONOMY_DIR, ...parts);
}

function readText(filePath, label = filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`${label}-read-failed: ${error.message}`);
  }
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) {
    if (fallback !== null) return fallback;
    throw new Error(`json-missing: ${filePath}`);
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`json-read-failed: ${filePath}: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function writeIfMissing(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  if (!existsSync(filePath)) {
    if (typeof value === "string") {
      writeText(filePath, value);
    } else {
      writeJson(filePath, value);
    }
    return true;
  }
  return false;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean).map(String))];
}

function boundedList(values, limit = 25) {
  const list = unique(values);
  return list.length > limit ? [...list.slice(0, limit), `...и еще ${list.length - limit}`] : list;
}

function redactText(value) {
  return String(value || "")
    .replace(/-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/gi, "[REDACTED_PRIVATE_KEY]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-[REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_JWT]")
    .replace(/((?:api[_-]?key|token|secret|password|credential)\s*[:=]\s*)["']?[^"'\s,;]+/gi, "$1[REDACTED]");
}

function parsePositiveInteger(value, label, fallback, max = 10000) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${label}-must-be-integer-1-${max}`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, label, fallback, max = 10000) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    throw new Error(`${label}-must-be-integer-0-${max}`);
  }
  return parsed;
}

function parseOptions(argv) {
  const commandParts = [];
  const optionArgs = [];
  let seenOption = false;
  for (const arg of argv) {
    if (!seenOption && !arg.startsWith("--") && commandParts.length < 2) {
      commandParts.push(arg);
      continue;
    }
    seenOption = true;
    optionArgs.push(arg);
  }

  const command =
    commandParts[0] === "lane" && commandParts[1] === "create"
      ? "lane:create"
      : commandParts[0] || "help";
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    codexBin: "codex",
    codexTimeoutMs: DEFAULT_CODEX_TIMEOUT_MS,
    command,
    dryRun: false,
    includeBlocked: false,
    json: false,
    maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES,
    maxIterations: null,
    maxWallTimeMinutes: DEFAULT_MAX_WALL_TIME_MINUTES,
    repoRoot: process.cwd(),
    runExistingLanes: false,
    sandbox: "workspace-write",
  };

  const valueOptions = new Set([
    "batch-size",
    "codex-bin",
    "codex-timeout-ms",
    "max-consecutive-failures",
    "max-iterations",
    "max-wall-time-minutes",
    "repo",
    "run-id",
    "sandbox",
  ]);
  const booleanOptions = new Set(["dry-run", "help", "include-blocked", "json", "run-existing-lanes"]);

  for (let index = 0; index < optionArgs.length; index += 1) {
    const raw = optionArgs[index];
    if (!raw.startsWith("--")) {
      throw new Error(`unexpected-positional-argument: ${raw}`);
    }
    const option = raw.slice(2);
    const equalsIndex = option.indexOf("=");
    const name = equalsIndex >= 0 ? option.slice(0, equalsIndex) : option;
    const inlineValue = equalsIndex >= 0 ? option.slice(equalsIndex + 1) : undefined;
    if (booleanOptions.has(name)) {
      const value = inlineValue === undefined ? "true" : inlineValue;
      if (value !== "true" && value !== "false") throw new Error(`invalid-boolean-option: --${name}`);
      options[toCamelCase(name)] = value === "true";
      continue;
    }
    if (!valueOptions.has(name)) {
      throw new Error(`unknown-option: --${name}`);
    }
    const value = inlineValue ?? optionArgs[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new Error(`missing-option-value: --${name}`);
    }
    options[toCamelCase(name)] = value;
    if (inlineValue === undefined) index += 1;
  }

  options.repoRoot = path.resolve(options.repo || options.repoRoot);
  options.batchSize = parsePositiveInteger(options.batchSize, "batch-size", DEFAULT_BATCH_SIZE, 1000);
  options.codexTimeoutMs = parsePositiveInteger(options.codexTimeoutMs, "codex-timeout-ms", DEFAULT_CODEX_TIMEOUT_MS, 24 * 60 * 60 * 1000);
  options.maxConsecutiveFailures = parsePositiveInteger(
    options.maxConsecutiveFailures,
    "max-consecutive-failures",
    DEFAULT_MAX_CONSECUTIVE_FAILURES,
    100,
  );
  options.maxIterations = parsePositiveInteger(options.maxIterations, "max-iterations", null, 1000);
  options.maxWallTimeMinutes = parsePositiveInteger(
    options.maxWallTimeMinutes,
    "max-wall-time-minutes",
    DEFAULT_MAX_WALL_TIME_MINUTES,
    24 * 60,
  );
  return options;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function usage() {
  return [
    "Usage:",
    "  npm run autonomy -- init",
    "  npm run autonomy -- inventory",
    "  npm run autonomy -- rank",
    "  npm run autonomy -- validate --batch-size 5",
    "  npm run autonomy -- lane create --batch-size 5",
    "  npm run autonomy -- revalidate --batch-size 5",
    "  npm run autonomy -- revalidate --include-blocked --batch-size 5",
    "  npm run autonomy -- handoff",
    "  npm run autonomy -- thread-request",
    "  npm run autonomy -- run-once --batch-size 5",
    "  npm run autonomy -- supervise --dry-run",
    "",
    "Options:",
    "  --repo <path>                    Repository root. Defaults to cwd.",
    "  --batch-size <n>                Bounded item count. Default 5.",
    "  --include-blocked              For revalidate, include blocked items with explicit safe lanes.",
    "  --run-existing-lanes           Opt in to running detected local JS smoke lanes.",
    "  --dry-run                      For supervise, print command and prompt only.",
    "  --max-iterations <n>           Supervisor loop limit.",
    "  --max-consecutive-failures <n>  Supervisor failure limit. Default 3.",
    "  --max-wall-time-minutes <n>     Supervisor wall clock limit. Default 60.",
    "  --codex-bin <name>              Codex executable. Default codex.",
    "  --sandbox <mode>                Codex sandbox. Default workspace-write.",
    "  --json                         Print machine-readable result.",
  ].join("\n");
}

function emptyState(repoRoot) {
  const timestamp = nowIso();
  return {
    schema: STATE_SCHEMA,
    schema_version: STATE_SCHEMA_VERSION,
    status: "continue",
    objective: DEFAULT_OBJECTIVE,
    repo_root: repoRoot,
    created_at: timestamp,
    updated_at: timestamp,
    iteration: 0,
    max_iterations: DEFAULT_MAX_ITERATIONS,
    script_inventory: {
      total: 0,
      pending: [],
      in_progress: [],
      accepted: [],
      rejected: [],
      needs_lane: [],
      needs_revalidation: [],
      blocked: [],
    },
    current_batch: [],
    lanes: {
      existing: [],
      created: [],
      missing: [],
    },
    validation: {
      commands: [],
      last_run_status: "not_run",
      last_run_summary: "",
      failed_items: [],
    },
    ranking_policy: {
      criteria: RANKING_POLICY,
    },
    safety: {
      do_not_touch: [
        ".git/",
        ".codex/",
        ".codex-runtime/",
        "node_modules/",
        "dist/",
        "build/",
        "target/",
        ".env",
        "*.pem",
        "*.key",
        "credentials*",
        "secrets*",
      ],
      requires_human_approval: [],
    },
    next: {
      next_step: "Run `npm run autonomy -- run-once --batch-size 5`.",
      exact_next_prompt_path: ".codex-autonomy/exact_next_prompt.md",
    },
  };
}

function normalizeStateShape(state, repoRoot) {
  const shaped = {
    ...emptyState(repoRoot),
    ...(state || {}),
    repo_root: repoRoot,
  };
  shaped.script_inventory = {
    ...emptyState(repoRoot).script_inventory,
    ...(state?.script_inventory || {}),
  };
  for (const key of SCRIPT_STATUSES) {
    shaped.script_inventory[key] = unique(shaped.script_inventory[key]);
  }
  shaped.current_batch = unique(shaped.current_batch);
  shaped.lanes = {
    existing: unique(state?.lanes?.existing || []),
    created: unique(state?.lanes?.created || []),
    missing: unique(state?.lanes?.missing || []),
  };
  shaped.validation = {
    ...emptyState(repoRoot).validation,
    ...(state?.validation || {}),
  };
  shaped.validation.commands = Array.isArray(shaped.validation.commands) ? shaped.validation.commands.slice(-100) : [];
  shaped.validation.failed_items = unique(shaped.validation.failed_items);
  shaped.ranking_policy = {
    criteria: Array.isArray(state?.ranking_policy?.criteria) ? state.ranking_policy.criteria : RANKING_POLICY,
  };
  shaped.safety = {
    ...emptyState(repoRoot).safety,
    ...(state?.safety || {}),
  };
  shaped.safety.do_not_touch = unique(shaped.safety.do_not_touch);
  shaped.safety.requires_human_approval = unique(shaped.safety.requires_human_approval);
  shaped.next = {
    ...emptyState(repoRoot).next,
    ...(state?.next || {}),
  };
  if (!VALID_STATE_STATUSES.has(shaped.status)) shaped.status = "continue";
  if (!VALID_LAST_RUN_STATUSES.has(shaped.validation.last_run_status)) shaped.validation.last_run_status = "not_run";
  shaped.updated_at = nowIso();
  return shaped;
}

function readState(repoRoot) {
  const statePath = autonomyPath(repoRoot, "state.json");
  return normalizeStateShape(readJson(statePath, emptyState(repoRoot)), repoRoot);
}

function writeState(repoRoot, state) {
  const shaped = normalizeStateShape(state, repoRoot);
  writeJson(autonomyPath(repoRoot, "state.json"), shaped);
  return shaped;
}

function appendLedger(repoRoot, event) {
  const entry = {
    ts: nowIso(),
    iteration: Number(event.iteration || 0),
    event: event.event || "handoff",
    script: event.script || "",
    lane: event.lane || "",
    status: event.status || "",
    summary: redactText(event.summary || ""),
    evidence: (event.evidence || []).map((item) => redactText(item)),
    commands: (event.commands || []).map((item) => redactText(item)),
  };
  mkdirSync(autonomyPath(repoRoot), { recursive: true });
  appendFileSync(autonomyPath(repoRoot, "ledger.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
}

function buildSchemaDocument() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Codex autonomy state/handoff contract",
    type: "object",
    required: ["schema_version", "status", "objective", "repo_root", "updated_at", "script_inventory", "next"],
    properties: {
      schema_version: { const: STATE_SCHEMA_VERSION },
      status: { enum: [...VALID_STATE_STATUSES] },
      objective: { type: "string", minLength: 1 },
      repo_root: { type: "string", minLength: 1 },
      updated_at: { type: "string", minLength: 1 },
      script_inventory: {
        type: "object",
        required: ["total", "pending", "accepted", "rejected", "needs_lane", "needs_revalidation"],
        properties: {
          total: { type: "number" },
          pending: { type: "array", items: { type: "string" } },
          accepted: { type: "array", items: { type: "string" } },
          rejected: { type: "array", items: { type: "string" } },
          needs_lane: { type: "array", items: { type: "string" } },
          needs_revalidation: { type: "array", items: { type: "string" } },
        },
      },
      next: {
        type: "object",
        required: ["next_step", "exact_next_prompt_path"],
        properties: {
          next_step: { type: "string" },
          exact_next_prompt_path: { type: "string", minLength: 1 },
        },
      },
    },
  };
}

function buildInitialHandoff(state) {
  return [
    "# Autonomy Handoff",
    "",
    "## Цель",
    "",
    state.objective,
    "",
    "## Что уже сделано",
    "",
    "- Autonomy state contract инициализирован.",
    "",
    "## Следующий конкретный шаг",
    "",
    state.next.next_step,
    "",
    "## Exact next prompt",
    "",
    "См. `.codex-autonomy/exact_next_prompt.md`.",
  ].join("\n");
}

function buildInitialExactPrompt(state) {
  return [
    `Продолжай автономный проход в репозитории \`${state.repo_root}\`.`,
    "",
    "Не переноси старый контекст. Используй только компактные файлы:",
    "- `.codex-autonomy/state.json`",
    "- `.codex-autonomy/ledger.jsonl`",
    "- `.codex-autonomy/inventory.json`",
    "- `.codex-autonomy/ranking.json`",
    "- `.codex-autonomy/validation_results.json`",
    "- `.codex-autonomy/lanes/`",
    "",
    "Сначала выполни один bounded шаг:",
    "",
    "```powershell",
    "npm run autonomy -- run-once --batch-size 5",
    "```",
    "",
    "Затем обнови handoff/state через `npm run autonomy -- handoff` и не читай широкие логи без конкретной причины.",
  ].join("\n");
}

function initAutonomy(options) {
  const repoRoot = options.repoRoot;
  const root = autonomyPath(repoRoot);
  mkdirSync(root, { recursive: true });
  for (const dir of ["lanes", "reports", "runs", "logs"]) {
    mkdirSync(path.join(root, dir), { recursive: true });
  }

  const state = readState(repoRoot);
  const created = [];
  if (writeIfMissing(autonomyPath(repoRoot, "state.json"), emptyState(repoRoot))) created.push("state.json");
  if (writeIfMissing(autonomyPath(repoRoot, "handoff.schema.json"), buildSchemaDocument())) created.push("handoff.schema.json");
  const ledgerPath = autonomyPath(repoRoot, "ledger.jsonl");
  if (!existsSync(ledgerPath)) {
    writeFileSync(ledgerPath, "", "utf8");
    created.push("ledger.jsonl");
  }
  if (writeIfMissing(autonomyPath(repoRoot, "inventory.json"), emptyInventory())) created.push("inventory.json");
  if (writeIfMissing(autonomyPath(repoRoot, "ranking.json"), emptyRanking())) created.push("ranking.json");
  if (writeIfMissing(autonomyPath(repoRoot, "validation_results.json"), emptyValidationResults())) created.push("validation_results.json");
  if (writeIfMissing(autonomyPath(repoRoot, "handoff.md"), buildInitialHandoff(state))) created.push("handoff.md");
  if (writeIfMissing(autonomyPath(repoRoot, "exact_next_prompt.md"), buildInitialExactPrompt(state))) created.push("exact_next_prompt.md");
  if (writeIfMissing(autonomyPath(repoRoot, "lanes", "README.md"), lanesReadme())) created.push("lanes/README.md");

  if (created.length > 0 || options.command === "init") {
    appendLedger(repoRoot, {
      iteration: state.iteration,
      event: "handoff",
      status: "initialized",
      summary: created.length ? `Created autonomy files: ${created.join(", ")}` : "Autonomy files already existed; no overwrite.",
    });
  }

  return { schema: "codex-autonomy.init.v1", created, root: AUTONOMY_DIR };
}

function emptyInventory() {
  return {
    schema: INVENTORY_SCHEMA,
    updated_at: nowIso(),
    total: 0,
    candidates: [],
    ignored: {
      directories: [...IGNORE_DIRS].sort(),
      secret_file_patterns: SECRET_FILE_PATTERNS.map((pattern) => pattern.source),
    },
  };
}

function emptyRanking() {
  return {
    schema: RANKING_SCHEMA,
    updated_at: nowIso(),
    policy: RANKING_POLICY,
    total: 0,
    items: [],
  };
}

function emptyValidationResults() {
  return {
    schema: VALIDATION_SCHEMA,
    updated_at: nowIso(),
    results: {},
    summary: {
      accepted: 0,
      rejected: 0,
      needs_lane: 0,
      needs_revalidation: 0,
      blocked: 0,
    },
  };
}

function lanesReadme() {
  return [
    "# Validation Lanes",
    "",
    "Generated lane files live here. Each lane is intentionally minimal, reproducible, and non-mutating unless a future milestone explicitly approves a broader validation mode.",
    "",
    "The default generated lane checks readability, static safety signals, and Node syntax for `.js`, `.mjs`, and `.cjs` candidates. It does not execute arbitrary candidate behavior.",
  ].join("\n");
}

function shouldIgnoreFile(relativePath) {
  const name = path.basename(relativePath);
  return SECRET_FILE_PATTERNS.some((pattern) => pattern.test(name) || pattern.test(relativePath));
}

function shouldIgnoreDir(dirName) {
  return IGNORE_DIRS.has(dirName);
}

function walkFiles(repoRoot, relativeDir = "") {
  const absoluteDir = path.join(repoRoot, relativeDir);
  if (!existsSync(absoluteDir)) return [];
  const found = [];
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = normalizeRepoPath(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) {
      if (shouldIgnoreDir(entry.name)) continue;
      found.push(...walkFiles(repoRoot, relativePath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (shouldIgnoreFile(relativePath)) continue;
    found.push(relativePath);
  }
  return found;
}

function languageForExtension(extension) {
  if ([".js", ".mjs", ".cjs"].includes(extension)) return "node";
  if ([".jsx", ".jsxinc"].includes(extension)) return "extendscript";
  if ([".ts", ".tsx"].includes(extension)) return "typescript";
  if (extension === ".py") return "python";
  if (extension === ".ps1") return "powershell";
  if ([".sh", ".bat", ".cmd"].includes(extension)) return "shell";
  return "unknown";
}

function scanSafety(text, candidate = {}) {
  const source = `${text || ""}\n${candidate.command || ""}`;
  const dryRun = /\b(--dry-run|dryRun|dry-run|plan-only|inspect|mock|fixture|no-write|read-only)\b/i.test(source);
  const destructivePatterns = [
    /\brm\s+-rf\b/i,
    /\bRemove-Item\b[\s\S]{0,80}\b-Recurse\b/i,
    /\bfs\.(?:rmSync|unlinkSync|rmdirSync)\b/i,
    /\bdeleteFile\b/i,
    /\bgit\s+(?:reset\s+--hard|clean\s+-fd|push)\b/i,
    /\bdel\s+\/[fsq]/i,
  ];
  const networkPatterns = [
    /\bfetch\s*\(/i,
    /\baxios\b/i,
    /\bhttps?:\/\//i,
    /\bInvoke-WebRequest\b/i,
    /\b(?:curl|wget)\s+https?:\/\//i,
  ];
  const credentialPatterns = [
    /process\.env\.[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/,
    /\b(?:api[_-]?key|token|secret|password|credential)\b/i,
    /PRIVATE KEY/i,
  ];
  const livePatterns = [
    /\bAfter Effects\b/i,
    /\bCSInterface\b/i,
    /\bcep-panel-cdp\b/i,
    /\b127\.0\.0\.1\b/,
    /\blocalhost:\d+\b/i,
  ];
  const matches = (patterns) => patterns.some((pattern) => pattern.test(source));
  return {
    credentials: matches(credentialPatterns),
    destructive: matches(destructivePatterns),
    dry_run_signal: dryRun,
    live: matches(livePatterns),
    network: matches(networkPatterns),
    reasons: [
      matches(destructivePatterns) ? "destructive-signal" : "",
      matches(networkPatterns) ? "network-signal" : "",
      matches(credentialPatterns) ? "credential-signal" : "",
      matches(livePatterns) ? "live-runtime-signal" : "",
      dryRun ? "dry-run-signal" : "",
    ].filter(Boolean),
  };
}

function candidateFromFile(repoRoot, relativePath) {
  const absolutePath = repoPath(repoRoot, relativePath);
  const stats = statSync(absolutePath);
  const extension = path.extname(relativePath).toLowerCase();
  const language = languageForExtension(extension);
  const text = stats.size <= MAX_FILE_BYTES ? readFileSync(absolutePath, "utf8") : "";
  const firstLines = text.split(/\r?\n/).slice(0, 30).join("\n");
  const hasShebang = firstLines.startsWith("#!");
  const hasMain = /\b(require\.main\s*===\s*module|import\.meta\.url|process\.argv|function\s+main|async\s+function\s+main)\b/.test(text);
  const hasHelp = /\b(--help|-h|Usage:|Options:)\b/i.test(text);
  const id = relativePath;
  return {
    id,
    path: relativePath,
    type: "file",
    language,
    extension,
    size_bytes: stats.size,
    signals: {
      has_help: hasHelp,
      has_main: hasMain,
      has_shebang: hasShebang,
      oversized: stats.size > MAX_FILE_BYTES,
      smoke_or_test: /\b(smoke|test|validation|fixture)\b/i.test(relativePath),
    },
    safety: scanSafety(text, { path: relativePath }),
  };
}

function packageScriptCandidates(repoRoot) {
  const packagePath = path.join(repoRoot, "package.json");
  if (!existsSync(packagePath)) return [];
  const packageJson = readJson(packagePath, {});
  const scripts = packageJson.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts : {};
  return Object.entries(scripts).map(([name, command]) => ({
    id: `package.json#scripts/${name}`,
    path: "package.json",
    type: "package-script",
    language: "package-script",
    command,
    size_bytes: String(command).length,
    signals: {
      has_help: false,
      has_main: true,
      has_shebang: false,
      oversized: false,
      smoke_or_test: /\b(smoke|test|check|validation)\b/i.test(name),
    },
    safety: scanSafety("", { command, path: "package.json" }),
  }));
}

function buildInventory(options) {
  initAutonomy(options);
  const repoRoot = options.repoRoot;
  const fileCandidates = walkFiles(repoRoot)
    .filter((relativePath) => CANDIDATE_EXTENSIONS.has(path.extname(relativePath).toLowerCase()))
    .map((relativePath) => candidateFromFile(repoRoot, relativePath));
  const candidates = [...fileCandidates, ...packageScriptCandidates(repoRoot)].sort((a, b) => a.id.localeCompare(b.id));
  const inventory = {
    ...emptyInventory(),
    updated_at: nowIso(),
    total: candidates.length,
    candidates,
  };
  writeJson(autonomyPath(repoRoot, "inventory.json"), inventory);

  const state = readState(repoRoot);
  const candidateIds = candidates.map((candidate) => candidate.id);
  for (const status of SCRIPT_STATUSES) {
    state.script_inventory[status] = unique(state.script_inventory[status]).filter((id) => candidateIds.includes(id));
  }
  const alreadyKnown = new Set(SCRIPT_STATUSES.flatMap((status) => state.script_inventory[status]));
  state.script_inventory.pending = unique([
    ...state.script_inventory.pending,
    ...candidateIds.filter((id) => !alreadyKnown.has(id)),
  ]);
  state.script_inventory.total = candidateIds.length;
  state.current_batch = [];
  writeState(repoRoot, state);
  appendLedger(repoRoot, {
    iteration: state.iteration,
    event: "inventory",
    status: "written",
    summary: `Inventory found ${candidateIds.length} candidates.`,
    evidence: ["inventory.json"],
  });
  return inventory;
}

function loadInventoryOrBuild(options) {
  const inventoryPath = autonomyPath(options.repoRoot, "inventory.json");
  const inventory = readJson(inventoryPath, null);
  if (!inventory || inventory.schema !== INVENTORY_SCHEMA || !Array.isArray(inventory.candidates) || inventory.candidates.length === 0) {
    return buildInventory(options);
  }
  return inventory;
}

function candidateMap(inventory) {
  return new Map((inventory.candidates || []).map((candidate) => [candidate.id, candidate]));
}

function detectExistingLane(repoRoot, candidate) {
  if (!candidate) return null;
  if (candidate.type === "package-script") {
    if (/\b(smoke|test|check|validation)\b/i.test(candidate.id) && /^node\s+[\w./\\-]+\.js\b/i.test(candidate.command || "")) {
      return {
        id: safeId(candidate.id, "package-lane"),
        kind: "package-script",
        command: candidate.command,
        path: "package.json",
      };
    }
    return null;
  }
  if (candidate.signals?.smoke_or_test) {
    return {
      id: safeId(candidate.id, "self-lane"),
      kind: "self-static",
      path: candidate.path,
    };
  }
  const parsed = path.parse(candidate.path);
  const siblingNames = [
    `${parsed.name}-smoke.js`,
    `${parsed.name}.smoke.js`,
    `${parsed.name}-test.js`,
    `${parsed.name}.test.js`,
  ];
  for (const name of siblingNames) {
    const laneRelative = normalizeRepoPath(path.join(parsed.dir, name));
    if (existsSync(repoPath(repoRoot, laneRelative))) {
      return {
        id: safeId(laneRelative, "lane"),
        kind: "js-smoke",
        path: laneRelative,
      };
    }
  }
  return null;
}

function scoreCandidate(repoRoot, candidate, validationResults = {}) {
  const existingLane = detectExistingLane(repoRoot, candidate);
  const validation = validationResults[candidate.id];
  const scores = {
    detectability: candidate.signals?.has_help || /[-_/](run|smoke|test|check|validate|tool|agent|provider|bridge|solution)/i.test(candidate.id) ? 4 : 2,
    runnable: candidate.type === "package-script" || candidate.signals?.has_main || candidate.signals?.has_shebang ? 4 : 2,
    testability: existingLane ? 4 : candidate.signals?.smoke_or_test ? 3 : 1,
    safety: candidate.safety?.destructive && !candidate.safety?.dry_run_signal ? 0 : candidate.safety?.credentials || candidate.safety?.network ? 2 : 5,
    relevance: /^(scripts|orchestrator|mcp-server|chatgpt-connector|cep-panel|registry)\//i.test(candidate.path) || candidate.type === "package-script" ? 4 : 2,
    maintainability: candidate.size_bytes > MAX_FILE_BYTES ? 1 : candidate.size_bytes > 200 * 1024 ? 2 : 4,
    evidence: validation ? 5 : existingLane ? 3 : 0,
  };
  const total = RANKING_POLICY.reduce((sum, criterion) => sum + scores[criterion.name] * criterion.weight, 0);
  return {
    id: candidate.id,
    path: candidate.path,
    type: candidate.type,
    total_score: total,
    scores,
    safety: candidate.safety,
    existing_lane: existingLane,
    reasons: [
      existingLane ? `existing-lane:${existingLane.kind}` : "lane-missing",
      candidate.safety?.reasons?.length ? `safety:${candidate.safety.reasons.join(",")}` : "safety:no-obvious-risk",
      validation ? `validation:${validation.status}` : "validation:not-run",
    ],
  };
}

function rankCandidates(options) {
  initAutonomy(options);
  const repoRoot = options.repoRoot;
  const inventory = loadInventoryOrBuild(options);
  const validation = readJson(autonomyPath(repoRoot, "validation_results.json"), emptyValidationResults());
  const items = inventory.candidates
    .map((candidate) => scoreCandidate(repoRoot, candidate, validation.results || {}))
    .sort((a, b) => b.total_score - a.total_score || a.id.localeCompare(b.id));
  const ranking = {
    ...emptyRanking(),
    updated_at: nowIso(),
    total: items.length,
    items,
  };
  writeJson(autonomyPath(repoRoot, "ranking.json"), ranking);

  const rankedIds = items.map((item) => item.id);
  const state = readState(repoRoot);
  state.ranking_policy.criteria = RANKING_POLICY;
  state.script_inventory.pending = rankedIds.filter((id) => state.script_inventory.pending.includes(id));
  writeState(repoRoot, state);
  appendLedger(repoRoot, {
    iteration: state.iteration,
    event: "rank",
    status: "written",
    summary: `Ranking wrote ${items.length} candidates.`,
    evidence: ["ranking.json"],
  });
  return ranking;
}

function removeFromStatusArrays(state, id) {
  for (const status of SCRIPT_STATUSES) {
    state.script_inventory[status] = unique(state.script_inventory[status]).filter((candidateId) => candidateId !== id);
  }
}

function addStatus(state, id, status) {
  removeFromStatusArrays(state, id);
  if (!state.script_inventory[status]) state.script_inventory[status] = [];
  state.script_inventory[status] = unique([...state.script_inventory[status], id]);
}

function commandSummary(command, args) {
  return [command, ...args].join(" ");
}

function runNodeCheck(repoRoot, relativePath) {
  const args = ["--check", relativePath];
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30 * 1000,
  });
  return {
    command: commandSummary("node", args),
    ok: result.status === 0 && !result.error,
    status: result.status,
    stderr: redactText(result.stderr || ""),
    stdout: redactText(result.stdout || ""),
  };
}

function runExistingLane(repoRoot, lane) {
  if (!lane || lane.kind !== "js-smoke" || !lane.path) {
    return null;
  }
  const args = [lane.path];
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60 * 1000,
  });
  return {
    command: commandSummary("node", args),
    ok: result.status === 0 && !result.error,
    status: result.status,
    stderr: redactText(result.stderr || ""),
    stdout: redactText(result.stdout || ""),
  };
}

function generatedLanePathFor(candidate) {
  return normalizeRepoPath(path.posix.join(AUTONOMY_DIR, "lanes", `${safeId(candidate.id, "candidate")}.json`));
}

function findGeneratedLane(repoRoot, candidate) {
  const relativePath = generatedLanePathFor(candidate);
  const absolutePath = repoPath(repoRoot, relativePath);
  if (!existsSync(absolutePath)) return null;
  const lane = readJson(absolutePath, null);
  return {
    ...lane,
    repo_path: relativePath,
  };
}

function hasExternalRuntimeRisk(candidate) {
  return Boolean(candidate?.safety?.credentials || candidate?.safety?.network || candidate?.safety?.live);
}

function laneCoversExternalRuntimeRisk(lane) {
  const coverage = lane?.external_risk_coverage || lane?.safety?.external_risk_coverage;
  if (!coverage || coverage.approved !== true) return false;
  if (!SAFE_EXTERNAL_RISK_STRATEGIES.has(String(coverage.strategy || ""))) return false;
  if (!Array.isArray(coverage.evidence) || coverage.evidence.length === 0) return false;

  const safety = lane.safety || {};
  if (safety.uses_network || safety.requires_secrets || safety.writes_source_files) return false;
  if (safety.executes_candidate_behavior && coverage.strategy !== "dry-run") return false;
  return true;
}

function laneExternalRuntimeRiskEvidence(lane) {
  const coverage = lane?.external_risk_coverage || lane?.safety?.external_risk_coverage;
  if (!coverage) return [];
  return [
    `external-risk-lane:${coverage.strategy || "unknown"}`,
    ...(coverage.evidence || []).map((item) => `external-risk-evidence:${item}`),
  ];
}

function validateCandidate(repoRoot, candidate, options = {}) {
  const startedAt = nowIso();
  const commands = [];
  const evidence = [];
  let status = "needs_lane";
  let summary = "No validation lane found.";
  let lane = detectExistingLane(repoRoot, candidate);

  if (options.generatedLane) {
    lane = findGeneratedLane(repoRoot, candidate) || lane;
  }

  if (!candidate) {
    return {
      id: "",
      status: "blocked",
      summary: "Candidate missing from inventory.",
      evidence,
      commands,
      started_at: startedAt,
      completed_at: nowIso(),
    };
  }

  const hasExternalRisk = hasExternalRuntimeRisk(candidate);
  const safeExternalRiskLane = hasExternalRisk && laneCoversExternalRuntimeRisk(lane);

  if (candidate.safety?.destructive && !candidate.safety?.dry_run_signal) {
    status = "rejected";
    summary = "Rejected: destructive signal without a safe dry-run/mock signal.";
    evidence.push("safety:destructive-without-dry-run");
  } else if (hasExternalRisk && !candidate.safety?.dry_run_signal && !safeExternalRiskLane) {
    status = options.generatedLane ? "blocked" : "needs_lane";
    summary = options.generatedLane
      ? "Blocked: external credential/network/live signal still lacks a mock, dry-run, or explicit read-only fixture lane."
      : "Needs lane: external credential/network/live signal requires a mock, dry-run, or read-only fixture lane.";
    evidence.push(...(candidate.safety?.reasons || []));
  } else {
    if (safeExternalRiskLane) {
      evidence.push(...laneExternalRuntimeRiskEvidence(lane));
    }
    if (["node"].includes(candidate.language)) {
      const check = runNodeCheck(repoRoot, candidate.path);
      commands.push(check.command);
      evidence.push(check.ok ? "node-check:passed" : `node-check:failed:${check.stderr || check.stdout}`.slice(0, 300));
      if (!check.ok) {
        status = "rejected";
        summary = "Rejected: Node syntax check failed.";
      }
    } else if (candidate.type === "package-script") {
      evidence.push("package-script:static-reviewed");
    } else if (["extendscript", "powershell", "python", "shell", "typescript"].includes(candidate.language)) {
      evidence.push(`${candidate.language}:static-reviewed`);
    }

    if (status !== "rejected") {
      if (lane) {
        if (options.runExistingLanes && lane.kind === "js-smoke") {
          const laneRun = runExistingLane(repoRoot, lane);
          commands.push(laneRun.command);
          evidence.push(laneRun.ok ? "existing-lane:passed" : `existing-lane:failed:${laneRun.stderr || laneRun.stdout}`.slice(0, 300));
          status = laneRun.ok ? "accepted" : "needs_revalidation";
          summary = laneRun.ok ? "Accepted: static check and existing smoke lane passed." : "Needs revalidation: existing smoke lane failed.";
        } else {
          status = "accepted";
          summary = safeExternalRiskLane
            ? "Accepted: explicit safe external-risk validation lane passed."
            : options.generatedLane
              ? "Accepted: generated static validation lane passed."
              : "Accepted: static checks passed and an existing validation lane is present.";
          evidence.push(lane.repo_path || lane.path || lane.command || `lane:${lane.kind}`);
        }
      } else {
        status = "needs_lane";
        summary = "Needs lane: static checks passed but no validation lane exists yet.";
      }
    }
  }

  return {
    id: candidate.id,
    path: candidate.path,
    type: candidate.type,
    status,
    summary: redactText(summary),
    lane: lane ? lane.repo_path || lane.path || lane.command || lane.id : "",
    safety: candidate.safety,
    evidence: evidence.map((item) => redactText(item)),
    commands: commands.map((item) => redactText(item)),
    started_at: startedAt,
    completed_at: nowIso(),
  };
}

function choosePendingBatch(state, ranking, size) {
  const rankedIds = (ranking.items || []).map((item) => item.id);
  const pending = state.script_inventory.pending || [];
  const sorted = [
    ...rankedIds.filter((id) => pending.includes(id)),
    ...pending.filter((id) => !rankedIds.includes(id)),
  ];
  return sorted.slice(0, size);
}

function summarizeValidation(results) {
  const counts = {
    accepted: 0,
    rejected: 0,
    needs_lane: 0,
    needs_revalidation: 0,
    blocked: 0,
  };
  for (const result of results) {
    if (counts[result.status] !== undefined) counts[result.status] += 1;
  }
  let lastRunStatus = "passed";
  if (counts.rejected || counts.blocked) lastRunStatus = counts.accepted ? "partial" : "failed";
  if (counts.needs_lane || counts.needs_revalidation) lastRunStatus = counts.accepted || counts.rejected || counts.blocked ? "partial" : "partial";
  if (results.length === 0) lastRunStatus = "not_run";
  return {
    counts,
    lastRunStatus,
    summary: `accepted=${counts.accepted}, rejected=${counts.rejected}, needs_lane=${counts.needs_lane}, needs_revalidation=${counts.needs_revalidation}, blocked=${counts.blocked}`,
  };
}

function updateValidationResults(repoRoot, results) {
  const validation = readJson(autonomyPath(repoRoot, "validation_results.json"), emptyValidationResults());
  validation.updated_at = nowIso();
  validation.results = validation.results || {};
  for (const result of results) {
    validation.results[result.id] = result;
  }
  validation.summary = summarizeValidation(Object.values(validation.results)).counts;
  writeJson(autonomyPath(repoRoot, "validation_results.json"), validation);
  return validation;
}

function applyValidationToState(state, results) {
  for (const result of results) {
    if (!result.id) continue;
    if (result.status === "accepted") addStatus(state, result.id, "accepted");
    else if (result.status === "rejected") addStatus(state, result.id, "rejected");
    else if (result.status === "needs_lane") addStatus(state, result.id, "needs_lane");
    else if (result.status === "needs_revalidation") addStatus(state, result.id, "needs_revalidation");
    else if (result.status === "blocked") addStatus(state, result.id, "blocked");
  }
  const summary = summarizeValidation(results);
  state.validation.commands = [...(state.validation.commands || []), ...results.flatMap((result) => result.commands || [])].slice(-100);
  state.validation.last_run_status = summary.lastRunStatus;
  state.validation.last_run_summary = summary.summary;
  state.validation.failed_items = results
    .filter((result) => ["rejected", "blocked"].includes(result.status))
    .map((result) => result.id);
  return state;
}

function validateBatch(options) {
  initAutonomy(options);
  const repoRoot = options.repoRoot;
  const inventory = loadInventoryOrBuild(options);
  const ranking = rankCandidates(options);
  const map = candidateMap(inventory);
  const state = readState(repoRoot);
  const batch = choosePendingBatch(state, ranking, options.batchSize);
  state.current_batch = batch;
  for (const id of batch) addStatus(state, id, "in_progress");
  writeState(repoRoot, state);

  const results = batch.map((id) => validateCandidate(repoRoot, map.get(id), { runExistingLanes: options.runExistingLanes }));
  const updatedState = applyValidationToState(readState(repoRoot), results);
  updatedState.current_batch = batch;
  writeState(repoRoot, updatedState);
  updateValidationResults(repoRoot, results);
  for (const result of results) {
    appendLedger(repoRoot, {
      iteration: updatedState.iteration,
      event: "validate",
      script: result.id,
      lane: result.lane,
      status: result.status,
      summary: result.summary,
      evidence: result.evidence,
      commands: result.commands,
    });
  }
  return {
    schema: "codex-autonomy.validate.v1",
    batch,
    results,
    summary: summarizeValidation(results),
  };
}

function buildLane(candidate) {
  const commands = [
    {
      kind: "readability",
      command: `internal: read ${candidate.path}`,
      expected: "Candidate file exists and is readable within the repository.",
    },
    {
      kind: "static-safety",
      command: "internal: scan destructive/network/credential/live signals",
      expected: "Dangerous candidates remain rejected or require an explicit human-approved lane.",
    },
  ];
  if (candidate.language === "node") {
    commands.push({
      kind: "node-syntax",
      command: `node --check ${candidate.path}`,
      expected: "Node parser accepts the candidate without executing it.",
    });
  } else {
    commands.push({
      kind: `${candidate.language}-static`,
      command: `internal: static review ${candidate.path}`,
      expected: "No execution by default; future deeper validation must be explicit.",
    });
  }
  return {
    schema: LANE_SCHEMA,
    id: safeId(candidate.id, "lane"),
    candidate_id: candidate.id,
    candidate_path: candidate.path,
    created_at: nowIso(),
    updated_at: nowIso(),
    type: "static-validation-lane",
    description: "Minimal reproducible non-mutating lane generated by the autonomy layer.",
    safety: {
      executes_candidate_behavior: false,
      writes_source_files: false,
      uses_network: false,
      requires_secrets: false,
      notes: "This lane only checks readability/static signals and Node syntax where applicable.",
    },
    commands,
  };
}

function createLanes(options) {
  initAutonomy(options);
  const repoRoot = options.repoRoot;
  const inventory = loadInventoryOrBuild(options);
  const map = candidateMap(inventory);
  const state = readState(repoRoot);
  const batch = (state.script_inventory.needs_lane || []).slice(0, options.batchSize);
  const created = [];
  for (const id of batch) {
    const candidate = map.get(id);
    if (!candidate) continue;
    const lane = buildLane(candidate);
    const laneRelative = generatedLanePathFor(candidate);
    const laneAbsolute = repoPath(repoRoot, laneRelative);
    if (!existsSync(laneAbsolute)) {
      writeJson(laneAbsolute, lane);
      created.push(laneRelative);
    } else {
      created.push(laneRelative);
    }
    state.lanes.created = unique([...state.lanes.created, laneRelative]);
    state.lanes.missing = unique(state.lanes.missing).filter((entry) => entry !== id && entry !== laneRelative);
    addStatus(state, id, "needs_revalidation");
    appendLedger(repoRoot, {
      iteration: state.iteration,
      event: "lane_create",
      script: id,
      lane: laneRelative,
      status: "created",
      summary: "Generated minimal static validation lane.",
      evidence: [laneRelative],
    });
  }
  writeState(repoRoot, state);
  return {
    schema: "codex-autonomy.lane-create.v1",
    batch,
    created,
  };
}

function revalidateBatch(options) {
  initAutonomy(options);
  const repoRoot = options.repoRoot;
  const inventory = loadInventoryOrBuild(options);
  const map = candidateMap(inventory);
  const state = readState(repoRoot);
  const source = options.includeBlocked ? state.script_inventory.blocked || [] : state.script_inventory.needs_revalidation || [];
  const batch = source.slice(0, options.batchSize);
  state.current_batch = batch;
  for (const id of batch) addStatus(state, id, "in_progress");
  writeState(repoRoot, state);

  const results = batch.map((id) => validateCandidate(repoRoot, map.get(id), { generatedLane: true }));
  const updatedState = applyValidationToState(readState(repoRoot), results);
  updatedState.current_batch = batch;
  writeState(repoRoot, updatedState);
  updateValidationResults(repoRoot, results);
  for (const result of results) {
    appendLedger(repoRoot, {
      iteration: updatedState.iteration,
      event: "revalidate",
      script: result.id,
      lane: result.lane,
      status: result.status,
      summary: result.summary,
      evidence: result.evidence,
      commands: result.commands,
    });
  }
  return {
    schema: "codex-autonomy.revalidate.v1",
    batch,
    results,
    summary: summarizeValidation(results),
  };
}

function computeStateStatus(state) {
  if ((state.safety.requires_human_approval || []).length > 0) return "needs_human";
  const pending = state.script_inventory.pending?.length || 0;
  const needsLane = state.script_inventory.needs_lane?.length || 0;
  const needsRevalidation = state.script_inventory.needs_revalidation?.length || 0;
  const blocked = state.script_inventory.blocked?.length || 0;
  if (pending || needsLane || needsRevalidation) return "continue";
  if (blocked) return "blocked";
  return "done";
}

function reportCounts(state) {
  return {
    total: state.script_inventory.total || 0,
    pending: state.script_inventory.pending?.length || 0,
    accepted: state.script_inventory.accepted?.length || 0,
    rejected: state.script_inventory.rejected?.length || 0,
    needs_lane: state.script_inventory.needs_lane?.length || 0,
    needs_revalidation: state.script_inventory.needs_revalidation?.length || 0,
    blocked: state.script_inventory.blocked?.length || 0,
  };
}

function markdownList(values, empty = "_нет_") {
  const list = boundedList(values || []);
  return list.length ? list.map((value) => `- \`${value}\``).join("\n") : empty;
}

function validationReasonList(validation, ids) {
  const results = validation.results || {};
  const lines = boundedList(ids || [], 50).map((id) => {
    const result = results[id];
    return `- \`${id}\` - ${result ? redactText(result.summary) : "нет validation result"}`;
  });
  return lines.length ? lines.join("\n") : "_нет_";
}

function writeReports(repoRoot, state) {
  const ranking = readJson(autonomyPath(repoRoot, "ranking.json"), emptyRanking());
  const validation = readJson(autonomyPath(repoRoot, "validation_results.json"), emptyValidationResults());
  const counts = reportCounts(state);
  const acceptedRanked = (ranking.items || []).filter((item) => state.script_inventory.accepted.includes(item.id)).slice(0, 10);
  const rejectionReasons = {};
  for (const id of state.script_inventory.rejected || []) {
    const summary = validation.results?.[id]?.summary || "unknown";
    rejectionReasons[summary] = (rejectionReasons[summary] || 0) + 1;
  }
  const rejectionSummary = Object.entries(rejectionReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => `- ${reason}: ${count}`)
    .join("\n") || "_нет_";

  writeText(
    autonomyPath(repoRoot, "reports", "summary.md"),
    [
      "# Autonomy Summary",
      "",
      `Updated: ${state.updated_at}`,
      "",
      "## Counts",
      "",
      `- total: ${counts.total}`,
      `- accepted: ${counts.accepted}`,
      `- rejected: ${counts.rejected}`,
      `- needs_lane: ${counts.needs_lane}`,
      `- needs_revalidation: ${counts.needs_revalidation}`,
      `- blocked: ${counts.blocked}`,
      `- pending: ${counts.pending}`,
      "",
      "## Top Accepted Tools",
      "",
      acceptedRanked.length
        ? acceptedRanked.map((item) => `- \`${item.id}\` - score ${item.total_score}`).join("\n")
        : "_нет_",
      "",
      "## Main Rejection Reasons",
      "",
      rejectionSummary,
      "",
      "## Lanes Created",
      "",
      markdownList(state.lanes.created || []),
      "",
      "## Remaining Work",
      "",
      `- pending: ${counts.pending}`,
      `- needs_lane: ${counts.needs_lane}`,
      `- needs_revalidation: ${counts.needs_revalidation}`,
      `- blocked: ${counts.blocked}`,
    ].join("\n"),
  );

  writeText(autonomyPath(repoRoot, "reports", "accepted.md"), ["# Accepted", "", validationReasonList(validation, state.script_inventory.accepted)].join("\n"));
  writeText(autonomyPath(repoRoot, "reports", "rejected.md"), ["# Rejected", "", validationReasonList(validation, state.script_inventory.rejected)].join("\n"));
  writeText(
    autonomyPath(repoRoot, "reports", "needs_lane.md"),
    [
      "# Needs Lane",
      "",
      validationReasonList(validation, state.script_inventory.needs_lane),
      "",
      "## Needs Revalidation",
      "",
      validationReasonList(validation, state.script_inventory.needs_revalidation),
    ].join("\n"),
  );

  const rows = ["| Script | Status | Lane | Summary |", "| --- | --- | --- | --- |"];
  const ids = unique(SCRIPT_STATUSES.flatMap((status) => state.script_inventory[status] || []));
  for (const id of ids) {
    const result = validation.results?.[id];
    const status = SCRIPT_STATUSES.find((entry) => state.script_inventory[entry]?.includes(id)) || "unknown";
    rows.push(`| \`${id}\` | ${status} | \`${result?.lane || ""}\` | ${redactText(result?.summary || "")} |`);
  }
  writeText(autonomyPath(repoRoot, "reports", "validation_matrix.md"), ["# Validation Matrix", "", ...rows].join("\n"));
}

function buildExactNextPrompt(state) {
  const counts = reportCounts(state);
  const nextCommand =
    state.status === "continue"
      ? "npm run autonomy -- run-once --batch-size 5"
      : "npm run autonomy -- handoff";
  return [
    `Продолжай автономный слой в репозитории \`${state.repo_root}\`.`,
    "",
    "Работай только от компактного файлового state, не переноси старый chat context и не читай широкие логи без точной причины.",
    "",
    "Источники правды:",
    "- `.codex-autonomy/state.json`",
    "- `.codex-autonomy/ledger.jsonl`",
    "- `.codex-autonomy/inventory.json`",
    "- `.codex-autonomy/ranking.json`",
    "- `.codex-autonomy/validation_results.json`",
    "- `.codex-autonomy/lanes/`",
    "- `.codex-autonomy/reports/summary.md`",
    "",
    "Текущее состояние:",
    `- status: ${state.status}`,
    `- iteration: ${state.iteration}/${state.max_iterations}`,
    `- total: ${counts.total}`,
    `- pending: ${counts.pending}`,
    `- accepted: ${counts.accepted}`,
    `- rejected: ${counts.rejected}`,
    `- needs_lane: ${counts.needs_lane}`,
    `- needs_revalidation: ${counts.needs_revalidation}`,
    `- blocked: ${counts.blocked}`,
    "",
    "Следующий bounded шаг:",
    "",
    "```powershell",
    nextCommand,
    "```",
    "",
    "После шага обнови `.codex-autonomy/handoff.md` и `.codex-autonomy/exact_next_prompt.md`. Не используй GUI/browser/computer-use для продолжения; supervisor должен идти через CLI/SDK/App Server-compatible backend.",
  ].join("\n");
}

function updateHandoff(options) {
  initAutonomy(options);
  const repoRoot = options.repoRoot;
  let state = readState(repoRoot);
  state.status = computeStateStatus(state);
  state.next.next_step =
    state.status === "continue"
      ? "Run `npm run autonomy -- run-once --batch-size 5`."
      : `Autonomy loop stopped with status ${state.status}; inspect reports before continuing.`;
  state = writeState(repoRoot, state);
  writeReports(repoRoot, state);

  const validation = readJson(autonomyPath(repoRoot, "validation_results.json"), emptyValidationResults());
  const exactPrompt = buildExactNextPrompt(state);
  writeText(autonomyPath(repoRoot, "exact_next_prompt.md"), exactPrompt);
  const handoff = [
    "# Autonomy Handoff",
    "",
    "## Цель",
    "",
    state.objective,
    "",
    "## Что уже сделано",
    "",
    `- Iteration: ${state.iteration}/${state.max_iterations}`,
    `- Status: ${state.status}`,
    `- Last validation: ${state.validation.last_run_status} - ${state.validation.last_run_summary || "not_run"}`,
    "",
    "## Какие скрипты приняты",
    "",
    validationReasonList(validation, state.script_inventory.accepted),
    "",
    "## Какие отклонены и почему",
    "",
    validationReasonList(validation, state.script_inventory.rejected),
    "",
    "## Какие требуют lane",
    "",
    validationReasonList(validation, state.script_inventory.needs_lane),
    "",
    "## Какие требуют повторной валидации",
    "",
    validationReasonList(validation, state.script_inventory.needs_revalidation),
    "",
    "## Какие команды запускались",
    "",
    markdownList(state.validation.commands || []),
    "",
    "## Последние ошибки",
    "",
    validationReasonList(validation, state.validation.failed_items),
    "",
    "## Следующий конкретный шаг",
    "",
    state.next.next_step,
    "",
    "## Exact next prompt",
    "",
    "См. `.codex-autonomy/exact_next_prompt.md`.",
  ].join("\n");
  writeText(autonomyPath(repoRoot, "handoff.md"), handoff);
  validateStateContract(repoRoot);
  appendLedger(repoRoot, {
    iteration: state.iteration,
    event: "handoff",
    status: state.status,
    summary: "Updated handoff, exact next prompt, and reports.",
    evidence: [
      ".codex-autonomy/handoff.md",
      ".codex-autonomy/exact_next_prompt.md",
      ".codex-autonomy/reports/summary.md",
    ],
  });
  return {
    schema: "codex-autonomy.handoff.v1",
    status: state.status,
    exact_next_prompt_path: state.next.exact_next_prompt_path,
  };
}

function buildThreadRequest(options) {
  initAutonomy(options);
  const repoRoot = options.repoRoot;
  const state = readState(repoRoot);
  validateStateContract(repoRoot);
  const promptPath = repoPath(repoRoot, state.next.exact_next_prompt_path);
  const prompt = readText(promptPath, "exact-next-prompt");
  const counts = reportCounts(state);
  const request = {
    schema: "codex-autonomy.thread-request.v1",
    created_at: nowIso(),
    status: state.status,
    repo_root: repoRoot,
    prompt_path: state.next.exact_next_prompt_path,
    title: `AE Agent autonomy continuation (${state.status})`,
    target: {
      kind: "codex-app-project-thread",
      environment: "local",
      repo_root: repoRoot,
    },
    context_contract: {
      source: "compact-file-state",
      required_reads: [
        ".codex-autonomy/state.json",
        ".codex-autonomy/handoff.md",
        ".codex-autonomy/reports/summary.md",
        ".codex-autonomy/exact_next_prompt.md",
      ],
      counts,
    },
    safety: {
      parent_managed: true,
      app_tool: "codex_app.create_thread",
      created_by_script: false,
      notes: "The autonomy CLI prepares this request but does not call Codex app tools itself.",
    },
    prompt,
  };
  const requestPath = autonomyPath(repoRoot, "thread_request.json");
  writeJson(requestPath, request);
  appendLedger(repoRoot, {
    iteration: state.iteration,
    event: "thread_request",
    status: "created",
    summary: "Prepared parent-managed Codex app thread request.",
    evidence: [normalizeRepoPath(path.join(AUTONOMY_DIR, "thread_request.json"))],
  });
  return {
    schema: request.schema,
    status: request.status,
    thread_request_path: ".codex-autonomy/thread_request.json",
    app_tool: request.safety.app_tool,
    parent_managed: true,
  };
}

function validateStateContract(repoRoot) {
  const state = readState(repoRoot);
  if (state.schema_version !== STATE_SCHEMA_VERSION) throw new Error("state.schema_version-invalid");
  if (!VALID_STATE_STATUSES.has(state.status)) throw new Error(`state.status-invalid:${state.status}`);
  if (!state.next?.exact_next_prompt_path) throw new Error("state.next.exact_next_prompt_path-missing");
  const promptPath = repoPath(repoRoot, state.next.exact_next_prompt_path);
  if (!existsSync(promptPath)) throw new Error(`exact-next-prompt-missing:${state.next.exact_next_prompt_path}`);
  return true;
}

function runOnce(options) {
  initAutonomy(options);
  const repoRoot = options.repoRoot;
  let state = readState(repoRoot);
  if (state.iteration >= state.max_iterations) {
    state.status = "blocked";
    state.next.next_step = "Iteration limit reached; inspect state before continuing.";
    writeState(repoRoot, state);
    return updateHandoff(options);
  }
  state.iteration += 1;
  writeState(repoRoot, state);

  const inventory = loadInventoryOrBuild(options);
  let ranking = readJson(autonomyPath(repoRoot, "ranking.json"), emptyRanking());
  if (!ranking.items?.length || ranking.total !== inventory.total) {
    ranking = rankCandidates(options);
  }

  const steps = [];
  state = readState(repoRoot);
  if ((state.script_inventory.pending || []).length > 0) {
    steps.push(validateBatch(options));
  }
  state = readState(repoRoot);
  if ((state.script_inventory.needs_lane || []).length > 0) {
    steps.push(createLanes(options));
  }
  state = readState(repoRoot);
  if ((state.script_inventory.needs_revalidation || []).length > 0) {
    steps.push(revalidateBatch(options));
  }
  const handoff = updateHandoff(options);
  return {
    schema: "codex-autonomy.run-once.v1",
    iteration: readState(repoRoot).iteration,
    steps,
    handoff,
  };
}

function buildCodexInvocation(options) {
  const args = ["exec", "--sandbox", options.sandbox, "-"];
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", options.codexBin, ...args],
      display: `${options.codexBin} ${args.join(" ")}`,
    };
  }
  return {
    command: options.codexBin,
    args,
    display: `${options.codexBin} ${args.join(" ")}`,
  };
}

function supervise(options) {
  initAutonomy(options);
  const repoRoot = options.repoRoot;
  let state = readState(repoRoot);
  validateStateContract(repoRoot);
  const promptPath = repoPath(repoRoot, state.next.exact_next_prompt_path);
  const prompt = readText(promptPath, "exact-next-prompt");
  const invocation = buildCodexInvocation(options);
  const maxIterations = options.maxIterations || Math.max(1, state.max_iterations - state.iteration);

  if (options.dryRun) {
    return {
      schema: "codex-autonomy.supervise-dry-run.v1",
      status: state.status,
      cwd: repoRoot,
      command: invocation.display,
      prompt_path: state.next.exact_next_prompt_path,
      prompt_preview: prompt.slice(0, MAX_PROMPT_PREVIEW_CHARS),
      will_execute: false,
    };
  }

  if (["done", "blocked", "needs_human"].includes(state.status)) {
    return {
      schema: "codex-autonomy.supervise.v1",
      status: state.status,
      stopped: true,
      reason: `state-status-${state.status}`,
      runs: [],
    };
  }

  const started = Date.now();
  let consecutiveFailures = 0;
  const runs = [];
  for (let index = 0; index < maxIterations; index += 1) {
    state = readState(repoRoot);
    if (["done", "blocked", "needs_human"].includes(state.status)) break;
    if ((Date.now() - started) / 60000 > options.maxWallTimeMinutes) break;
    if (consecutiveFailures >= options.maxConsecutiveFailures) break;

    const runId = options.runId || `${new Date().toISOString().replace(/[:.]/g, "-")}-${String(index + 1).padStart(3, "0")}`;
    const runRoot = autonomyPath(repoRoot, "runs", runId);
    mkdirSync(runRoot, { recursive: true });
    writeText(path.join(runRoot, "prompt.md"), prompt);

    const result = spawnSync(invocation.command, invocation.args, {
      cwd: repoRoot,
      input: prompt,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: options.codexTimeoutMs,
    });
    const stdout = redactText(result.stdout || "");
    const stderr = redactText(result.stderr || "");
    writeText(path.join(runRoot, "stdout.txt"), stdout);
    writeText(path.join(runRoot, "stderr.txt"), stderr);
    const runResult = {
      schema: "codex-autonomy.supervise-run-result.v1",
      run_id: runId,
      command: invocation.display,
      exit_code: result.status,
      error: result.error ? result.error.message : "",
      timed_out: result.error?.code === "ETIMEDOUT",
      stdout_path: normalizeRepoPath(path.join(AUTONOMY_DIR, "runs", runId, "stdout.txt")),
      stderr_path: normalizeRepoPath(path.join(AUTONOMY_DIR, "runs", runId, "stderr.txt")),
    };
    writeJson(path.join(runRoot, "result.json"), runResult);
    appendLedger(repoRoot, {
      iteration: state.iteration,
      event: "handoff",
      status: result.status === 0 && !result.error ? "supervise-run-complete" : "supervise-run-failed",
      summary: `Supervisor run ${runId} exit=${result.status}`,
      evidence: [normalizeRepoPath(path.join(AUTONOMY_DIR, "runs", runId, "result.json"))],
      commands: [invocation.display],
    });
    appendFileSync(autonomyPath(repoRoot, "logs", "supervise.jsonl"), `${JSON.stringify(runResult)}\n`, "utf8");
    runs.push(runResult);
    if (result.status === 0 && !result.error) consecutiveFailures = 0;
    else consecutiveFailures += 1;
  }

  state = readState(repoRoot);
  return {
    schema: "codex-autonomy.supervise.v1",
    status: state.status,
    stopped: true,
    runs,
    consecutive_failures: consecutiveFailures,
  };
}

function printResult(result, options) {
  if (options.json || typeof result !== "string") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result);
  }
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help || options.command === "help") {
    console.log(usage());
    return;
  }

  const commands = {
    init: initAutonomy,
    inventory: buildInventory,
    rank: rankCandidates,
    validate: validateBatch,
    "lane:create": createLanes,
    revalidate: revalidateBatch,
    handoff: updateHandoff,
    "thread-request": buildThreadRequest,
    "run-once": runOnce,
    supervise,
  };
  const handler = commands[options.command];
  if (!handler) {
    throw new Error(`unknown-command:${options.command}`);
  }
  const result = handler(options);
  printResult(result, options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

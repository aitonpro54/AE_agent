"use strict";

const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const auditLiteral = [".codex", "audit"].join("-");
const oldPlanRoot = ["plans", "archive"].join("/");
const oldPlanHistory = ["target-app-execplan", "history"].join("-");
const stagingRootChild = `${["C:", "Users", "Ant", "Documents", "Codex", "AE_agent_clean"].join("\\")}\\`;
const stagingRootChildEscaped = `${["C:", "Users", "Ant", "Documents", "Codex", "AE_agent_clean"].join("\\\\")}\\\\`;
const userRuntimeCache = `${["C:", "Users", "Ant", ".cache", "codex-runtimes"].join("\\")}\\`;
const userRuntimeCacheEscaped = `${["C:", "Users", "Ant", ".cache", "codex-runtimes"].join("\\\\")}\\\\`;
const oldImporterLedger = [
  [["kylet", "martinez"].join(""), "after-effects-scripts-intake"].join("-"),
  "queue-ledger.json",
].join("/");

const scannedRoots = [
  "package.json",
  "mcp-config.example.json",
  "AGENTS.md",
  "README.md",
  "RELEASES.md",
  "docs",
  "mcp-server",
  "orchestrator",
  "scripts",
  "plans",
];

const allowedReferenceFiles = new Set([
  path.normalize("docs/cleanup-migration.md"),
]);

const allowedImporterProtocolFiles = new Set([
  path.normalize("orchestrator/run-generic-repo-importer-supervisor.mjs"),
  path.normalize("orchestrator/run-generic-repo-tool-importer.mjs"),
  path.normalize("orchestrator/run-generic-repo-queue-supervisor.mjs"),
  path.normalize("orchestrator/run-generic-repo-full-intake.mjs"),
  path.normalize("orchestrator/contracts/generic-repo-importer-contract.json"),
  path.normalize("orchestrator/contracts/generic-repo-importer-supervisor-plan.json"),
  path.normalize("scripts/sdk-generic-repo-importer-command-smoke.js"),
  path.normalize("scripts/sdk-generic-repo-queue-supervisor-smoke.js"),
  path.normalize("scripts/sdk-generic-repo-full-intake-smoke.js"),
]);

const ignoredRuntimeRoots = [
  ".codex",
  ".codex-runtime",
  ".codex-autonomy",
  auditLiteral,
  "logs",
  "backups",
  "snapshots",
  "pro-review-bundles",
  oldPlanRoot,
];

const legacyMarkerRules = [
  {
    label: "old QA prefix",
    pattern: new RegExp(["Codex", "QA", "AUX"].join("\\s+")),
  },
  {
    label: "old external source name",
    pattern: new RegExp(["Ky", "let"].join("")),
  },
  {
    label: "old external source run id",
    pattern: new RegExp(["kylet", "martinez"].join("")),
  },
  {
    label: "old queue batch id",
    pattern: new RegExp(["queue", "batch"].join("-")),
  },
  {
    label: "old blocked status literal",
    pattern: new RegExp(["blocked", "or", "skipped"].join("_")),
  },
  {
    label: "old continuation-doc label",
    pattern: new RegExp(["handoff", "only"].join("-")),
  },
  {
    label: "old evidence packet label",
    pattern: new RegExp(["audit", "packet"].join("\\s+")),
  },
  {
    label: "old evidence dump label",
    pattern: new RegExp(["proof", "dump"].join("\\s+")),
  },
  {
    label: "old auxiliary lane id",
    pattern: new RegExp(["AUX", "\\d+"].join("-")),
  },
];

function walk(relativePath) {
  const absolute = path.join(repo, relativePath);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [relativePath];
  const found = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    found.push(...walk(path.join(relativePath, entry.name)));
  }
  return found;
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), "utf8");
}

function gitLsFiles(args = []) {
  return execFileSync("git", ["ls-files", ...args], {
    cwd: repo,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
}

function assertNoOldReferences() {
  const violations = [];
  for (const root of scannedRoots) {
    for (const relativePath of walk(root)) {
      if (allowedReferenceFiles.has(path.normalize(relativePath))) continue;
      const text = readText(relativePath);
      for (const forbidden of [
        auditLiteral,
        oldPlanRoot,
        oldPlanHistory,
        stagingRootChild,
        stagingRootChildEscaped,
        userRuntimeCache,
        userRuntimeCacheEscaped,
        oldImporterLedger,
      ]) {
        if (text.includes(forbidden)) {
          violations.push(`${relativePath}: ${forbidden}`);
        }
      }
    }
  }
  assert.deepStrictEqual(violations, [], "Clean repo must not reference old audit/archive paths.");
}

function assertNoLegacyMarkersOutsideImporterProtocol() {
  const violations = [];
  for (const root of scannedRoots) {
    for (const relativePath of walk(root)) {
      const normalized = path.normalize(relativePath);
      if (allowedImporterProtocolFiles.has(normalized)) continue;
      const text = readText(relativePath);
      for (const rule of legacyMarkerRules) {
        if (rule.pattern.test(text)) {
          violations.push(`${relativePath}: ${rule.label}`);
        }
      }
    }
  }
  assert.deepStrictEqual(
    violations,
    [],
    "Legacy longrun/evidence markers must stay out of product docs, registry, recipes, and non-protocol scripts."
  );
}

function assertPackageSurface() {
  const packageJson = JSON.parse(readText("package.json"));
  assert.strictEqual(packageJson.scripts["check:rules"], "node scripts/clean-current-check.js");
  assert(!packageJson.scripts["codex:orchestrator:write-scaffold"], "old SDK write scaffold script must be absent.");
  assert(!packageJson.scripts["codex:orchestrator:historical-evidence:smoke"], "old historical smoke script must be absent.");
  assert(!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0, "clean repo should not carry unused SDK dependency.");
}

function assertRuntimeRootsUntracked() {
  const tracked = new Set(gitLsFiles());
  const violations = [];
  for (const file of tracked) {
    const normalized = file.replace(/\\/g, "/");
    for (const root of ignoredRuntimeRoots) {
      if (normalized === root || normalized.startsWith(`${root}/`)) {
        violations.push(normalized);
      }
    }
  }
  assert.deepStrictEqual(violations, [], "Runtime/cache/archive roots must stay untracked.");
}

function assertIgnoreSurface() {
  const gitignore = readText(".gitignore");
  for (const pattern of [
    ".codex/",
    ".codex-runtime/",
    ".codex-autonomy/",
    "logs/*.jsonl",
    "backups/*.aep",
    "pro-review-bundles/",
  ]) {
    assert(gitignore.includes(pattern), `.gitignore must include ${pattern}`);
  }
}

function assertPlanCompact() {
  const lineCount = readText("plans/target-app-execplan.md").split(/\r?\n/).length;
  assert(lineCount <= 180, `target-app-execplan.md must stay compact; found ${lineCount} lines.`);
}

function assertCopiedCore() {
  for (const relativePath of [
    "cep-panel/index.html",
    "cep-panel/panel.js",
    "mcp-server/bridge-daemon.js",
    "mcp-server/semantic-verification.js",
    "registry/solutions.json",
    "scripts/provider-contract-smoke.js",
    "scripts/sdk-generic-repo-full-intake-smoke.js",
    "orchestrator/run-generic-repo-full-intake.mjs",
    "orchestrator/contracts/generic-repo-importer-contract.json",
    "plans/target-app-execplan.md",
    "docs/cleanup-migration.md",
  ]) {
    assert(fs.existsSync(path.join(repo, relativePath)), `Expected clean project file: ${relativePath}`);
  }
}

function main() {
  assertNoOldReferences();
  assertNoLegacyMarkersOutsideImporterProtocol();
  assertPackageSurface();
  assertCopiedCore();
  assertRuntimeRootsUntracked();
  assertIgnoreSurface();
  assertPlanCompact();
  console.log("Clean current check: pass");
}

if (require.main === module) {
  main();
}

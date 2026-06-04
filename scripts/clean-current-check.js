"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const auditLiteral = [".codex", "audit"].join("-");
const oldPlanRoot = ["plans", "archive"].join("/");
const oldPlanHistory = ["target-app-execplan", "history"].join("-");
const oldSourceRootChild = `${["C:", "Users", "Ant", "Documents", "Codex", "AE_agent"].join("\\")}\\`;
const oldSourceRootChildEscaped = `${["C:", "Users", "Ant", "Documents", "Codex", "AE_agent"].join("\\\\")}\\\\`;
const oldImporterLedger = ["kyletmartinez-after-effects-scripts-intake", "queue-ledger.json"].join("/");

const scannedRoots = [
  "package.json",
  "AGENTS.md",
  "README.md",
  "docs",
  "mcp-server",
  "orchestrator",
  "scripts",
  "plans",
];

const allowedReferenceFiles = new Set([
  path.normalize("docs/cleanup-migration.md"),
]);

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
        oldSourceRootChild,
        oldSourceRootChildEscaped,
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

function assertPackageSurface() {
  const packageJson = JSON.parse(readText("package.json"));
  assert.strictEqual(packageJson.scripts["check:rules"], "node scripts/clean-current-check.js");
  assert(!packageJson.scripts["codex:orchestrator:write-scaffold"], "old SDK write scaffold script must be absent.");
  assert(!packageJson.scripts["codex:orchestrator:historical-evidence:smoke"], "old historical smoke script must be absent.");
  assert(!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0, "clean repo should not carry unused SDK dependency.");
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
  assertPackageSurface();
  assertCopiedCore();
  console.log("Clean current check: pass");
}

if (require.main === module) {
  main();
}

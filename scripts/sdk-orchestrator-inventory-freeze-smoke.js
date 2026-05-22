"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const INVENTORY_PATH =
  ".codex-audit/sdk-orchestrator-extraction/159-sdk-orchestrator-inventory-freeze.json";
const M158_PATH =
  ".codex-audit/sdk-orchestrator-extraction/158-sdk-orchestrator-extraction-cleanup-plan.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function assertIncludes(list, value, label) {
  assert(Array.isArray(list), `${label} must be an array.`);
  assert(list.includes(value), `${label} must include ${value}.`);
}

function flattenEvidencePaths(entries) {
  return entries.flatMap((entry) => entry.paths || []);
}

function main() {
  const inventory = readJson(INVENTORY_PATH);
  const m158 = readJson(M158_PATH);
  const packageJson = readJson("package.json");

  assert.strictEqual(inventory.schema, "sdk-orchestrator-inventory-freeze.v1");
  assert.strictEqual(inventory.milestone, 159);
  assert.strictEqual(inventory.sourceContext.previousMilestone, 158);
  assert.strictEqual(inventory.sourceContext.previousArtifact, M158_PATH);
  assert.strictEqual(m158.schema, "sdk-orchestrator-extraction-cleanup-plan.v1");
  assert.strictEqual(m158.milestone, 158);
  assert.strictEqual(m158.safeAeAgentCleanupPlan[0].name, "Freeze current inventory");
  assert.strictEqual(m158.sourceContext.currentBoundary.cleanupPerformed, false);
  assert.strictEqual(m158.sourceContext.currentBoundary.deletionPerformed, false);

  for (const section of inventory.machineCheck.requiredInventorySections) {
    assert(
      Array.isArray(inventory.frozenInventory[section]) &&
        inventory.frozenInventory[section].length > 0,
      `${section} must be present and non-empty.`,
    );
  }

  for (const flag of inventory.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      inventory.sourceContext.noCleanupBoundary[flag],
      false,
      `${flag} must remain false.`,
    );
  }

  for (const repoPath of inventory.machineCheck.mustExist) {
    assert(fs.existsSync(path.join(repo, repoPath)), `machineCheck.mustExist missing: ${repoPath}`);
  }

  const commands = inventory.checkEntrypoints.map((entry) => entry.command);
  for (const command of inventory.machineCheck.requiredCommands) {
    assertIncludes(commands, command, "checkEntrypoints commands");
  }

  assert.strictEqual(
    packageJson.scripts?.["codex:orchestrator:inventory-freeze:smoke"],
    "node scripts/sdk-orchestrator-inventory-freeze-smoke.js",
  );

  const historicalPaths = new Set(
    flattenEvidencePaths(inventory.frozenInventory.historicalEvidenceKeptUntilIndexed),
  );
  for (const currentPath of inventory.machineCheck.currentEvidenceMustNotBeHistoricalOnly) {
    assert(
      !historicalPaths.has(currentPath),
      `current evidence must not be historical-only: ${currentPath}`,
    );
  }

  for (const activeEntry of inventory.frozenInventory.activeCommandSurface) {
    assert(Array.isArray(activeEntry.paths) && activeEntry.paths.length > 0);
    assert(
      ["active", "active-ae-agent-source", "candidate-only-disabled"].includes(activeEntry.status),
      `unexpected active command surface status: ${activeEntry.status}`,
    );
  }

  assert.strictEqual(inventory.extractionReadiness.cleanupAllowedNow, false);
  assert.strictEqual(inventory.extractionReadiness.archiveMoveAllowedNow, false);
  assert.strictEqual(inventory.extractionReadiness.deleteAllowedNow, false);
  assert.strictEqual(
    inventory.extractionReadiness.nextAllowedMilestone,
    "Extract reusable core without behavior change",
  );

  for (const forbidden of [
    "SDKThread/network proof",
    "CEP-panel SDK write",
    "edit cep-panel/panel.js through SDK",
    "live CEP/After Effects validation",
    "external-provider/OpenAI CLI planner validation",
    "mutating-live validation",
    "package install",
    "dependency change",
    "push",
  ]) {
    assertIncludes(
      inventory.extractionReadiness.blockedWithoutFreshApproval,
      forbidden,
      "blockedWithoutFreshApproval",
    );
  }

  console.log("SDK orchestrator inventory freeze smoke: pass");
}

if (require.main === module) {
  main();
}

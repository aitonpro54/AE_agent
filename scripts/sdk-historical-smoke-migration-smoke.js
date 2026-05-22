"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const MIGRATION_PATH =
  ".codex-audit/sdk-orchestrator-extraction/163-sdk-historical-smoke-migration.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function readText(repoPath) {
  return fs.readFileSync(path.join(repo, repoPath), "utf8");
}

function assertIncludes(list, value, label) {
  assert(Array.isArray(list), `${label} must be an array.`);
  assert(list.includes(value), `${label} must include ${value}.`);
}

function assertFileExists(repoPath, label) {
  assert(fs.existsSync(path.join(repo, repoPath)), `${label} must exist: ${repoPath}`);
}

function packageScriptsFromCurrent(entry) {
  if (entry.packageScript) {
    return [entry.packageScript];
  }
  return entry.packageScripts || [];
}

function pathJoinInvocation(repoPath) {
  const [directory, fileName] = repoPath.split("/");
  return `path.join("${directory}", "${fileName}")`;
}

function main() {
  const migration = readJson(MIGRATION_PATH);
  const previousIndex = readJson(migration.sourceContext.previousArtifact);
  const packageJson = readJson("package.json");
  const runner = readText("orchestrator/run-buffered-acceptance.mjs");
  const readme = readText("orchestrator/README.md");

  assert.strictEqual(migration.schema, "sdk-historical-smoke-migration.v1");
  assert.strictEqual(migration.milestone, 163);
  assert.strictEqual(migration.sourceContext.previousMilestone, 162);
  assert.strictEqual(
    migration.sourceContext.previousArtifact,
    ".codex-audit/sdk-orchestrator-extraction/162-sdk-historical-evidence-index.json",
  );
  assert.strictEqual(previousIndex.schema, "sdk-historical-evidence-index.v1");
  assert.strictEqual(
    previousIndex.historyAction.smokeMigratedToIndex,
    migration.machineCheck.requiredPreviousIndexAction.smokeMigratedToIndex,
  );

  for (const flag of migration.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      migration.sourceContext.behaviorBoundary[flag],
      false,
      `${flag} must remain false.`,
    );
  }

  assert.strictEqual(migration.migrationAction.smokeMigratedToIndex, true);
  assert.strictEqual(migration.migrationAction.historicalSmokeScriptsRetainedInPlace, true);
  assert.strictEqual(migration.migrationAction.historicalPackageScriptsRetired, true);
  assert.strictEqual(migration.migrationAction.checkRulesDirectHistoricalRunsRemoved, true);
  assert.strictEqual(migration.migrationAction.currentEvidenceRemainsDirectlyChecked, true);
  assert.strictEqual(migration.migrationAction.archiveMoveAllowedNow, false);
  assert.strictEqual(migration.migrationAction.deleteAllowedNow, false);
  assert.strictEqual(migration.migrationAction.squashAllowedNow, false);

  assert.strictEqual(
    packageJson.scripts?.[migration.machineCheck.requiredPackageScript],
    migration.machineCheck.requiredPackageScriptCommand,
  );

  for (const scriptName of migration.machineCheck.retiredPackageScripts) {
    assert.strictEqual(
      packageJson.scripts?.[scriptName],
      undefined,
      `retired package script must be absent: ${scriptName}`,
    );
    assert(
      !runner.includes(`packageJson.scripts?.["${scriptName}"]`),
      `check:rules must not assert retired package script: ${scriptName}`,
    );
  }

  for (const scriptName of migration.machineCheck.currentPackageScriptsMustRemain) {
    assert(
      typeof packageJson.scripts?.[scriptName] === "string",
      `current package script must remain: ${scriptName}`,
    );
  }

  const migratedScriptPaths = migration.historicalSmokeCoverageMigrated.map(
    (entry) => entry.scriptPath,
  );
  for (const scriptPath of migration.machineCheck.retainedHistoricalSmokeScripts) {
    assertIncludes(migratedScriptPaths, scriptPath, "migrated historical script paths");
    assertFileExists(scriptPath, "retained historical smoke script");
  }

  for (const entry of migration.historicalSmokeCoverageMigrated) {
    assertIncludes(
      migration.machineCheck.retiredPackageScripts,
      entry.retiredPackageScript,
      "retired package scripts",
    );
    assert.strictEqual(
      packageJson.scripts?.[entry.retiredPackageScript],
      undefined,
      `package script must be retired for ${entry.id}`,
    );
    for (const artifactPath of entry.coveredArtifacts) {
      assertFileExists(artifactPath, `${entry.id} covered artifact`);
    }
  }

  const currentScripts = migration.currentSmokeCoverageStillDirectlyChecked.flatMap(
    packageScriptsFromCurrent,
  );
  for (const scriptName of migration.machineCheck.currentPackageScriptsMustRemain) {
    assertIncludes(currentScripts, scriptName, "current directly checked package scripts");
  }

  for (const scriptPath of migration.machineCheck.directRunScriptPathsMustRemain) {
    assert(
      runner.includes(pathJoinInvocation(scriptPath)),
      `check:rules must still run current smoke script: ${scriptPath}`,
    );
  }

  for (const scriptPath of migration.machineCheck.directRunScriptPathsMustBeRemoved) {
    assert(
      !runner.includes(pathJoinInvocation(scriptPath)),
      `check:rules must not directly run historical smoke script: ${scriptPath}`,
    );
  }

  for (const snippet of migration.machineCheck.requiredReadmeSnippets) {
    assert(readme.includes(snippet), `README must include: ${snippet}`);
  }

  assert(
    runner.includes("sdk-historical-smoke-migration-smoke.js") &&
      runner.includes("SDK historical smoke migration smoke: pass"),
    "check:rules must run and report the M163 migration smoke.",
  );

  console.log("SDK historical smoke migration smoke: pass");
}

if (require.main === module) {
  main();
}

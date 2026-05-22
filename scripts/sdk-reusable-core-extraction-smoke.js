"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const repo = path.resolve(__dirname, "..");
const ARTIFACT_PATH =
  ".codex-audit/sdk-orchestrator-extraction/160-sdk-reusable-core-extraction.json";
const M159_PATH =
  ".codex-audit/sdk-orchestrator-extraction/159-sdk-orchestrator-inventory-freeze.json";
const ADAPTER_PATH = "orchestrator/adapters/ae-agent-policy.example.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function assertIncludes(list, value, label) {
  assert(Array.isArray(list), `${label} must be an array.`);
  assert(list.includes(value), `${label} must include ${value}.`);
}

async function main() {
  const artifact = readJson(ARTIFACT_PATH);
  const m159 = readJson(M159_PATH);
  const adapter = readJson(ADAPTER_PATH);
  const packageJson = readJson("package.json");
  const runner = await import(
    pathToFileURL(path.join(repo, "orchestrator", "run-write-capable-scaffold.mjs")).href
  );
  const pathPolicy = await import(
    pathToFileURL(path.join(repo, "orchestrator", "core", "path-policy.mjs")).href
  );
  const gitSnapshot = await import(
    pathToFileURL(path.join(repo, "orchestrator", "core", "git-snapshot.mjs")).href
  );
  const threadOptions = await import(
    pathToFileURL(path.join(repo, "orchestrator", "core", "thread-options.mjs")).href
  );

  assert.strictEqual(artifact.schema, "sdk-reusable-core-extraction.v1");
  assert.strictEqual(artifact.milestone, 160);
  assert.strictEqual(artifact.sourceContext.previousMilestone, 159);
  assert.strictEqual(artifact.sourceContext.previousArtifact, M159_PATH);
  assert.strictEqual(m159.schema, "sdk-orchestrator-inventory-freeze.v1");
  assert.strictEqual(
    m159.extractionReadiness.nextAllowedMilestone,
    "Extract reusable core without behavior change",
  );

  for (const repoPath of artifact.machineCheck.mustExist) {
    assert(fs.existsSync(path.join(repo, repoPath)), `machineCheck.mustExist missing: ${repoPath}`);
  }

  for (const flag of artifact.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      artifact.sourceContext.behaviorBoundary[flag],
      false,
      `${flag} must remain false.`,
    );
  }

  assert.strictEqual(
    packageJson.scripts?.[artifact.machineCheck.requiredPackageScript],
    "node scripts/sdk-reusable-core-extraction-smoke.js",
  );

  assert.strictEqual(runner.normalizeRepoPath, pathPolicy.normalizeRepoPath);
  assert.strictEqual(runner.isUnsafePathShape, pathPolicy.isUnsafeRepoPathShape);
  assert.strictEqual(typeof gitSnapshot.captureGitSnapshot, "function");
  assert.strictEqual(typeof threadOptions.createThreadOptionsFromContract, "function");

  assert.strictEqual(runner.normalizeRepoPath(".\\orchestrator\\README.md"), "orchestrator/README.md");
  assert.strictEqual(runner.isUnsafePathShape("../outside.md"), true);
  assert.strictEqual(
    pathPolicy.matchesRepoPathPattern("orchestrator/core/path-policy.mjs", "orchestrator/**"),
    true,
  );

  const plannedAllowed = runner.createPlannedPathCheck("orchestrator", [
    "orchestrator/core/path-policy.mjs",
  ]);
  assert.strictEqual(plannedAllowed.allowed, true);
  assert.deepStrictEqual(plannedAllowed.violations, []);

  const plannedForbidden = runner.createPlannedPathCheck("orchestrator", [
    "package-lock.json",
  ]);
  assert.strictEqual(plannedForbidden.allowed, false);
  assert.strictEqual(plannedForbidden.violations[0].reason, "forbidden-path");

  const parsedStatusPaths = gitSnapshot.parseStatusPaths(
    "## codex/example...origin/codex/example\n M orchestrator/README.md\nR  old.js -> new.js\n?? scripts/example.js",
  );
  assert.deepStrictEqual(parsedStatusPaths, [
    "orchestrator/README.md",
    "old.js",
    "new.js",
    "scripts/example.js",
  ]);

  const threadOptionsFromRunner = runner.createWriteCapableThreadOptions({ cwd: repo });
  assert.deepStrictEqual(threadOptionsFromRunner, {
    ...runner.WRITE_CAPABLE_THREAD_OPTION_CONTRACT,
    workingDirectory: repo,
  });
  assert.deepStrictEqual(
    threadOptions.createThreadOptionsFromContract(
      runner.WRITE_CAPABLE_THREAD_OPTION_CONTRACT,
      { cwd: repo },
    ),
    threadOptionsFromRunner,
  );

  assert.strictEqual(adapter.schema, "codex-sdk-orchestrator-adapter-policy.example.v1");
  assertIncludes(adapter.scopes, "cep-panel", "adapter scopes");
  assert.strictEqual(adapter.sdkWrite.cepPanelSdkWritesEnabled, false);
  assert.deepStrictEqual(adapter.sdkWrite.plannedPathAllowlists["production-code"], [
    "scripts/provider-api-smoke.js",
    "scripts/provider-contract-smoke.js",
  ]);
  assertIncludes(
    adapter.blockedWithoutFreshApproval,
    "SDKThread/network proof",
    "adapter blockedWithoutFreshApproval",
  );

  for (const moduleInfo of artifact.extractedCoreModules) {
    assert.strictEqual(moduleInfo.policyNeutral, true, `${moduleInfo.path} must be policy-neutral.`);
    assert.strictEqual(
      moduleInfo.status,
      "wired-through-existing-runner",
      `${moduleInfo.path} must be wired through the existing runner.`,
    );
  }

  assert.strictEqual(artifact.facadeCompatibility.behaviorPreserving, true);
  for (const exportName of artifact.facadeCompatibility.keptPublicExports) {
    assert.strictEqual(typeof runner[exportName], "function", `missing runner export: ${exportName}`);
  }

  console.log("SDK reusable core extraction smoke: pass");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

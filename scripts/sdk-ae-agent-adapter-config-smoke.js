"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const repo = path.resolve(__dirname, "..");
const ARTIFACT_PATH =
  ".codex-audit/sdk-orchestrator-extraction/161-ae-agent-adapter-config.json";
const M160_PATH =
  ".codex-audit/sdk-orchestrator-extraction/160-sdk-reusable-core-extraction.json";
const CONFIG_PATH = "orchestrator/adapters/ae-agent-sdk-policy.mjs";
const EXAMPLE_POLICY_PATH = "orchestrator/adapters/ae-agent-policy.example.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function assertFileExists(repoPath) {
  assert(fs.existsSync(path.join(repo, repoPath)), `Expected file to exist: ${repoPath}`);
}

async function importModule(repoPath) {
  return import(pathToFileURL(path.join(repo, repoPath)).href);
}

async function main() {
  const artifact = readJson(ARTIFACT_PATH);
  const m160 = readJson(M160_PATH);
  const examplePolicy = readJson(EXAMPLE_POLICY_PATH);
  const packageJson = readJson("package.json");
  const runner = await importModule("orchestrator/run-write-capable-scaffold.mjs");
  const adapterModule = await importModule(CONFIG_PATH);
  const config = adapterModule.AE_AGENT_SDK_ADAPTER_CONFIG;

  assert.strictEqual(artifact.schema, "sdk-ae-agent-adapter-config.v1");
  assert.strictEqual(artifact.milestone, 161);
  assert.strictEqual(artifact.sourceContext.previousMilestone, 160);
  assert.strictEqual(artifact.sourceContext.previousArtifact, M160_PATH);
  assert.strictEqual(m160.schema, "sdk-reusable-core-extraction.v1");

  for (const repoPath of artifact.machineCheck.mustExist) {
    assertFileExists(repoPath);
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
    "node scripts/sdk-ae-agent-adapter-config-smoke.js",
  );

  assert.strictEqual(config.schema, "codex-sdk-orchestrator-adapter-policy.v1");
  assert.strictEqual(config.status, "active-runtime-config");
  assert.strictEqual(Object.isFrozen(config), true);
  assert.deepStrictEqual(adapterModule.createAeAgentSdkAdapterSnapshot(), JSON.parse(JSON.stringify(config)));

  assert.strictEqual(runner.AE_AGENT_SDK_ADAPTER_CONFIG, config);
  assert.deepStrictEqual(runner.WRITE_SCOPES, config.scopes);
  assert.deepStrictEqual(runner.SCOPE_PATH_ALLOWLISTS, config.scopePathAllowlists);
  assert.deepStrictEqual(runner.FORBIDDEN_PATH_PATTERNS, config.forbiddenPathPatterns);
  assert.deepStrictEqual(runner.UNSAFE_WRITE_RUNNER_FLAGS, config.unsafeWriteRunnerFlags);
  assert.deepStrictEqual(
    runner.WRITE_CAPABLE_THREAD_OPTION_CONTRACT,
    config.threadOptionContracts.writeCapable,
  );

  assert.deepStrictEqual(runner.SDK_WRITE_ALLOWED_SCOPES, [
    "docs-audit",
    "orchestrator",
    "production-code",
  ]);
  assert.deepStrictEqual(runner.SDK_WRITE_REVIEW_REQUIRED_SCOPES, [
    "production-code",
    "cep-panel",
  ]);
  assert.strictEqual(config.sdkWrite.cepPanelSdkWritesEnabled, false);
  assert.strictEqual(runner.SDK_WRITE_ALLOWED_SCOPES.includes("cep-panel"), false);
  assert.deepStrictEqual(
    runner.SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST,
    artifact.governanceParity.expectedProductionCodePlannedPathAllowlist,
  );
  assert.deepStrictEqual(
    runner.SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST,
    config.sdkWrite.plannedPathAllowlists["production-code"],
  );
  assert.deepStrictEqual(
    runner.SDK_WRITE_PRODUCTION_CODE_LEGACY_SINGLE_FILE_PLANNED_PATH_ALLOWLIST,
    config.sdkWrite.productionCodeLegacySingleFilePlannedPathAllowlist,
  );

  assert.deepStrictEqual(examplePolicy.scopes, config.scopes);
  assert.deepStrictEqual(examplePolicy.scopePathAllowlists, config.scopePathAllowlists);
  assert.deepStrictEqual(examplePolicy.forbiddenPathPatterns, config.forbiddenPathPatterns);
  assert.deepStrictEqual(
    examplePolicy.sdkWrite.plannedPathAllowlists["production-code"],
    config.sdkWrite.plannedPathAllowlists["production-code"],
  );
  assert.strictEqual(examplePolicy.sdkWrite.cepPanelSdkWritesEnabled, false);

  const productionCodeCheck = runner.createSdkWritePlannedPathCheck(
    "production-code",
    config.sdkWrite.plannedPathAllowlists["production-code"],
  );
  assert.strictEqual(productionCodeCheck.allowed, true);
  assert.deepStrictEqual(productionCodeCheck.violations, []);

  assert.throws(
    () => runner.createSdkWritePlannedPathCheck("cep-panel", ["cep-panel/panel.js"]),
    /scope rejected: cep-panel/,
  );

  const launchGovernancePacket = readJson(config.evidence.currentGovernancePacket);
  const productionLaneEnablementPacket = readJson(config.evidence.currentEnablementPacket);
  const driftReport = runner.buildSdkLaunchGovernanceDriftReport({
    launchGovernancePacket,
    productionLaneEnablementPacket,
  });
  assert.strictEqual(driftReport.schema, config.evidence.launchGovernanceDriftReportSchema);
  assert.strictEqual(driftReport.launchGovernanceState, "local-gated");
  assert.strictEqual(driftReport.driftDetected, false);
  assert(driftReport.checks.every((check) => check.ok), "governance checks must all pass");
  assert.deepStrictEqual(
    driftReport.productionCodePlannedPathAllowlist,
    artifact.governanceParity.expectedProductionCodePlannedPathAllowlist,
  );

  for (const repoPath of config.evidence.currentConveyorPackets) {
    assertFileExists(repoPath);
  }

  console.log("SDK AE Agent adapter config smoke: pass");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

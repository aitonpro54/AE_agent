"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const ARTIFACT_PATH =
  ".codex-audit/sdk-orchestrator-extraction/172-sdk-adapter-interface-design-review.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function readText(repoPath) {
  return fs.readFileSync(path.join(repo, repoPath), "utf8");
}

function assertFileExists(repoPath) {
  assert(fs.existsSync(path.join(repo, repoPath)), `Expected file to exist: ${repoPath}`);
}

function assertIncludesAll(source, snippets, sourceName) {
  for (const snippet of snippets) {
    assert(source.includes(snippet), `${sourceName} must include: ${snippet}`);
  }
}

async function main() {
  const artifact = readJson(ARTIFACT_PATH);
  const previous = readJson(artifact.sourceContext.previousArtifact);
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");

  assert.strictEqual(artifact.schema, "sdk-adapter-interface-design-review.v1");
  assert.strictEqual(artifact.milestone, 172);
  assert.strictEqual(artifact.decision.type, "review-only-design-no-implementation");
  assert.strictEqual(
    artifact.decision.reviewFirstResult,
    "standalone-adapter-interface-designed-local-only",
  );
  assert.strictEqual(artifact.sourceContext.previousMilestone, 171);
  assert.strictEqual(previous.schema, "sdk-orchestrator-extraction-closeout-review.v1");
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.reviewOnly, true);
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.designOnly, true);
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.publicExportsPreserved, true);
  assert.strictEqual(
    artifact.sourceContext.behaviorBoundary.packageCommandEntrypointsPreserved,
    true,
  );
  assert.strictEqual(
    artifact.sourceContext.behaviorBoundary.governancePacketValidatorsProjectLocal,
    true,
  );
  assert.strictEqual(
    artifact.sourceContext.behaviorBoundary.currentM152PlusDirectChecksProjectLocal,
    true,
  );
  assert.strictEqual(
    artifact.sourceContext.behaviorBoundary.packageScriptAssertionsProjectLocal,
    true,
  );
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.readmeAssertionsProjectLocal, true);
  assert.strictEqual(
    artifact.sourceContext.behaviorBoundary.aeAgentProjectEvidencePolicyProjectLocal,
    true,
  );

  for (const flag of artifact.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      artifact.sourceContext.behaviorBoundary[flag],
      false,
      `${flag} must remain false.`,
    );
  }

  assert.strictEqual(
    artifact.standaloneAdapterInterface.interfaceSchema,
    "codex-sdk-orchestrator-standalone-adapter-interface.v1",
  );
  assert.deepStrictEqual(artifact.standaloneAdapterInterface.adapterModuleShape.identity, [
    "adapterId",
    "projectName",
    "projectRootPolicy",
    "schemaVersion",
  ]);
  assert.deepStrictEqual(artifact.standaloneAdapterInterface.adapterModuleShape.policy, [
    "scopeNames",
    "scopePathAllowlists",
    "sdkWriteAllowedScopes",
    "sdkWritePlannedPathAllowlists",
    "sdkWriteReviewRequiredScopes",
    "forbiddenPathPatterns",
    "unsafeRunnerFlags",
    "threadOptionContract",
    "runtimePathPolicy",
    "operationEnvelopeContract",
    "postRunDiffContract",
  ]);
  assert.deepStrictEqual(artifact.standaloneAdapterInterface.adapterModuleShape.projectChecks, [
    "governancePacketValidators",
    "currentEvidenceChecks",
    "packageScriptAssertions",
    "readmeAssertions",
    "evidencePolicyAssertions",
    "handoffAndPlanContinuityRules",
    "localSmokeCatalog",
  ]);

  assert.strictEqual(
    artifact.aeAgentMapping.adapterRuntimeConfig,
    "orchestrator/adapters/ae-agent-sdk-policy.mjs",
  );
  assert.strictEqual(
    artifact.aeAgentMapping.projectLocalAcceptanceRunner,
    "orchestrator/run-buffered-acceptance.mjs",
  );
  assert.deepStrictEqual(artifact.aeAgentMapping.currentProductionCodeSdkWriteAllowlist, [
    "scripts/provider-api-smoke.js",
    "scripts/provider-contract-smoke.js",
  ]);
  assert.strictEqual(artifact.aeAgentMapping.cepPanelSdkWritesEnabled, false);
  assert(artifact.aeAgentMapping.mustRemainProjectLocalUntilImplementation.length >= 6);
  assert(
    artifact.aeAgentMapping.mustRemainProjectLocalUntilImplementation.includes(
      "governance packet validators",
    ),
  );
  assert(
    artifact.aeAgentMapping.mustRemainProjectLocalUntilImplementation.includes(
      "README assertions",
    ),
  );

  const blockerStatus = new Map(
    artifact.standalonePackagingBlockers.map((entry) => [entry.id, entry.status]),
  );
  assert.strictEqual(blockerStatus.get("adapter-plugin-interface-missing"), "designed-not-implemented");
  assert.strictEqual(blockerStatus.get("standalone-package-not-created"), "blocked-out-of-scope");
  assert.strictEqual(
    blockerStatus.get("buffered-acceptance-remains-project-local"),
    "intentional",
  );

  assert.strictEqual(
    packageJson.scripts?.[artifact.machineCheck.requiredPackageScript],
    artifact.machineCheck.requiredPackageScriptCommand,
  );
  assert.strictEqual(
    packageJson.scripts?.["check:rules"],
    "node orchestrator/run-buffered-acceptance.mjs --contract-smoke",
  );

  for (const repoPath of artifact.machineCheck.mustExist) {
    assertFileExists(repoPath);
  }

  assertIncludesAll(readme, artifact.machineCheck.requiredReadmeSnippets, "README");

  for (const [repoPath, snippets] of Object.entries(artifact.machineCheck.requiredSourceSnippets)) {
    assertIncludesAll(readText(repoPath), snippets, repoPath);
  }

  assert.deepStrictEqual(artifact.nextRecommendedState.blockedWorkWithoutSeparateApproval, [
    "SDKThread/network proof",
    "CEP-panel SDK write",
    "live CEP/After Effects validation",
    "external-provider/OpenAI CLI planner validation",
    "mutating-live validation",
    "package install",
    "dependency change",
    "archive/delete/squash cleanup",
    "push",
    "PR creation",
  ]);

  console.log("SDK adapter interface design smoke: pass");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const repo = path.resolve(__dirname, "..");
const ARTIFACT_PATH =
  ".codex-audit/sdk-orchestrator-extraction/166-sdk-runner-split-review.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function readText(repoPath) {
  return fs.readFileSync(path.join(repo, repoPath), "utf8");
}

function assertFileExists(repoPath) {
  assert(fs.existsSync(path.join(repo, repoPath)), `Expected file to exist: ${repoPath}`);
}

async function importModule(repoPath) {
  return import(pathToFileURL(path.join(repo, repoPath)).href);
}

async function main() {
  const artifact = readJson(ARTIFACT_PATH);
  const previous = readJson(artifact.sourceContext.previousArtifact);
  const extractionPlan = readJson(artifact.sourceContext.relatedExtractionPlan);
  const reusableCore = readJson(artifact.sourceContext.relatedReusableCoreArtifact);
  const adapterConfig = readJson(artifact.sourceContext.relatedAdapterConfigArtifact);
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");

  assert.strictEqual(artifact.schema, "sdk-runner-split-review.v1");
  assert.strictEqual(artifact.milestone, 166);
  assert.strictEqual(artifact.sourceContext.previousMilestone, 165);
  assert.strictEqual(previous.schema, "sdk-historical-archive-move.v1");
  assert.strictEqual(extractionPlan.schema, "sdk-orchestrator-extraction-cleanup-plan.v1");
  assert.strictEqual(reusableCore.schema, "sdk-reusable-core-extraction.v1");
  assert.strictEqual(adapterConfig.schema, "sdk-ae-agent-adapter-config.v1");
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.reviewOnly, true);

  for (const flag of artifact.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      artifact.sourceContext.behaviorBoundary[flag],
      false,
      `${flag} must remain false.`,
    );
  }

  assert.strictEqual(
    packageJson.scripts?.[artifact.machineCheck.requiredPackageScript],
    artifact.machineCheck.requiredPackageScriptCommand,
  );

  for (const repoPath of artifact.machineCheck.mustExist) {
    assertFileExists(repoPath);
  }

  for (const snippet of artifact.machineCheck.requiredReadmeSnippets) {
    assert(readme.includes(snippet), `README must include: ${snippet}`);
  }

  for (const [repoPath, snippets] of Object.entries(artifact.machineCheck.requiredSourceSnippets)) {
    const source = readText(repoPath);
    for (const snippet of snippets) {
      assert(source.includes(snippet), `${repoPath} must include: ${snippet}`);
    }
  }

  const runner = await importModule("orchestrator/run-write-capable-scaffold.mjs");
  const adapterModule = await importModule("orchestrator/adapters/ae-agent-sdk-policy.mjs");

  assert.strictEqual(
    runner.AE_AGENT_SDK_ADAPTER_CONFIG,
    adapterModule.AE_AGENT_SDK_ADAPTER_CONFIG,
    "write runner must still consume the active AE Agent adapter config.",
  );
  assert.strictEqual(typeof runner.validateOperationEnvelope, "function");
  assert.strictEqual(typeof runner.resolveSdkRuntimePaths, "function");
  assert.strictEqual(typeof runner.validateSdkWriteDiffAllowlist, "function");
  assert.strictEqual(typeof runner.validateSdkLaunchGovernancePacket, "function");
  assert.strictEqual(typeof runner.runWriteCapableSdkWrite, "function");

  const operationEnvelopeCandidate = artifact.recommendedNextExtractionOrder.find(
    (entry) => entry.candidate === "operation-envelope-core",
  );
  assert(operationEnvelopeCandidate, "operation-envelope-core candidate must be recorded.");
  assert.strictEqual(
    operationEnvelopeCandidate.targetPath,
    "orchestrator/core/operation-envelope.mjs",
  );
  assert(operationEnvelopeCandidate.sourceFunctions.includes("validateOperationEnvelope"));

  const projectLocalBufferedReview = artifact.remainingProjectSpecificRunnerMaterial.find(
    (entry) => entry.id === "buffered-acceptance-governance-and-readme-smoke",
  );
  assert(projectLocalBufferedReview, "buffered acceptance project-local review must be recorded.");
  assert.strictEqual(projectLocalBufferedReview.extractability, "low for current checks, medium for a generic harness shell");

  assert.deepStrictEqual(
    artifact.nextRecommendedMilestone.blockedWork,
    [
      "SDKThread/network proof",
      "CEP-panel SDK write",
      "live CEP/After Effects validation",
      "external-provider/OpenAI CLI planner validation",
      "mutating-live validation",
      "package install",
      "dependency change",
      "delete/squash cleanup",
      "push",
    ],
  );

  console.log("SDK runner split review smoke: pass");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

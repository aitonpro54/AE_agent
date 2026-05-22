"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const repo = path.resolve(__dirname, "..");
const ARTIFACT_PATH =
  ".codex-audit/sdk-orchestrator-extraction/171-sdk-orchestrator-extraction-closeout-review.json";

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
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");
  const bufferedRunnerSource = readText("orchestrator/run-buffered-acceptance.mjs");

  assert.strictEqual(artifact.schema, "sdk-orchestrator-extraction-closeout-review.v1");
  assert.strictEqual(artifact.milestone, 171);
  assert.strictEqual(artifact.decision.type, "closeout-review-no-extraction");
  assert.strictEqual(
    artifact.decision.reviewFirstResult,
    "sdk-extraction-block-closed-local-gated",
  );
  assert.strictEqual(artifact.sourceContext.previousMilestone, 170);
  assert.strictEqual(previous.schema, "sdk-buffered-acceptance-split-review.v1");
  assert.strictEqual(artifact.closedExtractionBlock.status, "closed-local-gated");
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.reviewOnly, true);
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.publicExportsPreserved, true);
  assert.strictEqual(
    artifact.sourceContext.behaviorBoundary.packageCommandEntrypointsPreserved,
    true,
  );

  for (const flag of artifact.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      artifact.sourceContext.behaviorBoundary[flag],
      false,
      `${flag} must remain false.`,
    );
  }

  const sourceSchemas = new Map(
    artifact.sourceContext.sourceArtifacts.map((repoPath) => [repoPath, readJson(repoPath).schema]),
  );
  assert.strictEqual(
    sourceSchemas.get(".codex-audit/sdk-orchestrator-extraction/158-sdk-orchestrator-extraction-cleanup-plan.json"),
    "sdk-orchestrator-extraction-cleanup-plan.v1",
  );
  assert.strictEqual(
    sourceSchemas.get(".codex-audit/sdk-orchestrator-extraction/160-sdk-reusable-core-extraction.json"),
    "sdk-reusable-core-extraction.v1",
  );
  assert.strictEqual(
    sourceSchemas.get(".codex-audit/sdk-orchestrator-extraction/161-ae-agent-adapter-config.json"),
    "sdk-ae-agent-adapter-config.v1",
  );
  assert.strictEqual(
    sourceSchemas.get(".codex-audit/sdk-orchestrator-extraction/166-sdk-runner-split-review.json"),
    "sdk-runner-split-review.v1",
  );
  assert.strictEqual(
    sourceSchemas.get(".codex-audit/sdk-orchestrator-extraction/167-sdk-operation-envelope-core-extraction.json"),
    "sdk-operation-envelope-core-extraction.v1",
  );
  assert.strictEqual(
    sourceSchemas.get(".codex-audit/sdk-orchestrator-extraction/168-sdk-runtime-diagnostics-review-or-extraction.json"),
    "sdk-runtime-diagnostics-review-or-extraction.v1",
  );
  assert.strictEqual(
    sourceSchemas.get(".codex-audit/sdk-orchestrator-extraction/169-sdk-post-run-contract-review-or-extraction.json"),
    "sdk-post-run-contract-review-or-extraction.v1",
  );
  assert.strictEqual(
    sourceSchemas.get(".codex-audit/sdk-orchestrator-extraction/170-sdk-buffered-acceptance-split-review.json"),
    "sdk-buffered-acceptance-split-review.v1",
  );

  assert.strictEqual(
    packageJson.scripts?.[artifact.machineCheck.requiredPackageScript],
    artifact.machineCheck.requiredPackageScriptCommand,
  );
  assert.strictEqual(
    packageJson.scripts?.["check:rules"],
    "node orchestrator/run-buffered-acceptance.mjs --contract-smoke",
  );
  assert.strictEqual(
    packageJson.scripts?.["codex:orchestrator:governance-report"],
    "node orchestrator/run-buffered-acceptance.mjs --governance-report",
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

  const extractedCorePaths = artifact.reusableCoreNowExtracted.map((entry) => entry.path).sort();
  assert.deepStrictEqual(extractedCorePaths, [
    "orchestrator/core/failure-diagnostics.mjs",
    "orchestrator/core/git-snapshot.mjs",
    "orchestrator/core/operation-envelope.mjs",
    "orchestrator/core/path-policy.mjs",
    "orchestrator/core/post-run-contract.mjs",
    "orchestrator/core/runtime-store.mjs",
    "orchestrator/core/thread-options.mjs",
  ]);

  const boundaryIds = artifact.adapterAndProjectLocalBoundaries.map((entry) => entry.id).sort();
  assert.deepStrictEqual(boundaryIds, [
    "ae-agent-sdk-policy-adapter",
    "buffered-acceptance-project-local-runner",
    "continuity-and-governance-docs",
    "write-runner-compatibility-facade",
  ]);

  const blockerIds = artifact.standalonePackagingBlockers.map((entry) => entry.id).sort();
  assert.deepStrictEqual(blockerIds, [
    "adapter-plugin-interface-missing",
    "approval-gated-work-not-run",
    "buffered-acceptance-remains-project-local",
    "read-only-turn-wrapper-not-extracted",
    "standalone-package-not-created",
  ]);

  for (const preservedContract of artifact.preservedContracts) {
    assert.strictEqual(typeof preservedContract, "string");
    assert(preservedContract.length > 0, "preserved contract entries must be non-empty.");
  }

  assert.deepStrictEqual(
    artifact.nextRecommendedState.blockedWorkWithoutSeparateApproval,
    [
      "SDKThread/network proof",
      "CEP-panel SDK write",
      "live CEP/After Effects validation",
      "external-provider/OpenAI CLI planner validation",
      "mutating-live validation",
      "package install",
      "dependency change",
      "archive/delete/squash cleanup",
      "push",
    ],
  );

  const writeRunner = await importModule("orchestrator/run-write-capable-scaffold.mjs");
  const bufferedRunner = await importModule("orchestrator/run-buffered-acceptance.mjs");
  assert.strictEqual(typeof writeRunner.validateOperationEnvelope, "function");
  assert.strictEqual(typeof writeRunner.resolveSdkRuntimePaths, "function");
  assert.strictEqual(typeof writeRunner.validateSdkWriteDiffAllowlist, "function");
  assert.strictEqual(typeof writeRunner.runWriteCapableSdkWrite, "function");
  assert.strictEqual(typeof bufferedRunner.parseBufferedAcceptanceArgs, "function");
  assert.strictEqual(typeof bufferedRunner.main, "function");

  assert(
    bufferedRunnerSource.includes("sdk-orchestrator-extraction-closeout-smoke.js"),
    "check:rules must directly run the M171 closeout smoke.",
  );
  assert(
    bufferedRunnerSource.includes("M171 SDK orchestrator extraction closeout smoke failed"),
    "check:rules must report M171 smoke failures explicitly.",
  );

  console.log("SDK orchestrator extraction closeout smoke: pass");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

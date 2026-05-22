"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const repo = path.resolve(__dirname, "..");
const ARTIFACT_PATH =
  ".codex-audit/sdk-orchestrator-extraction/170-sdk-buffered-acceptance-split-review.json";

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

function assertThrowsWithMessage(fn, expected) {
  assert.throws(fn, (error) => {
    assert(
      error instanceof Error && error.message.startsWith(expected),
      `Expected error starting with "${expected}", got "${error?.message}"`,
    );
    return true;
  });
}

async function main() {
  const artifact = readJson(ARTIFACT_PATH);
  const previous = readJson(artifact.sourceContext.previousArtifact);
  const runnerSplitReview = readJson(artifact.sourceContext.relatedRunnerSplitReviewArtifact);
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");
  const bufferedRunnerSource = readText("orchestrator/run-buffered-acceptance.mjs");

  assert.strictEqual(artifact.schema, "sdk-buffered-acceptance-split-review.v1");
  assert.strictEqual(artifact.milestone, 170);
  assert.strictEqual(artifact.decision.type, "review-only-no-extraction");
  assert.strictEqual(artifact.decision.reviewFirstResult, "keep-buffered-acceptance-project-local");
  assert.strictEqual(artifact.sourceContext.previousMilestone, 169);
  assert.strictEqual(previous.schema, "sdk-post-run-contract-review-or-extraction.v1");
  assert.strictEqual(runnerSplitReview.schema, "sdk-runner-split-review.v1");
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.reviewOnly, true);
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
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.packageScriptAssertionsProjectLocal, true);
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

  const projectLocalIds = artifact.projectLocalMaterial.map((entry) => entry.id).sort();
  assert.deepStrictEqual(projectLocalIds, [
    "ae-agent-project-evidence-policy",
    "current-m152-plus-direct-checks",
    "governance-packet-validators",
    "package-script-assertions",
    "readme-assertions",
  ]);
  assert(
    artifact.projectLocalMaterial.every((entry) => entry.neutralBoundaryVerdict === "not extracted"),
    "all project-local material must remain unextracted.",
  );

  const neutralVerdicts = new Map(
    artifact.neutralBoundaryAssessment.map((entry) => [entry.candidate, entry.verdict]),
  );
  assert.strictEqual(neutralVerdicts.get("buffered-acceptance-thread-options"), "defer-no-extraction");
  assert.strictEqual(neutralVerdicts.get("buffered-argument-rejection"), "defer-no-extraction");
  assert.strictEqual(neutralVerdicts.get("local-contract-smoke-harness-shell"), "not-extracted");

  const bufferedRunner = await importModule("orchestrator/run-buffered-acceptance.mjs");
  assert.strictEqual(typeof bufferedRunner.parseBufferedAcceptanceArgs, "function");
  assert.strictEqual(typeof bufferedRunner.main, "function");

  assert.deepStrictEqual(bufferedRunner.parseBufferedAcceptanceArgs(["--contract-smoke"]), {
    contractSmoke: true,
    governanceReport: false,
    help: false,
    milestonePath: path.join(".codex", "milestones", "m107-sdk-orchestrator-acceptance-smoke.md"),
    reportPath: path.join(".codex-audit", "107-sdk-orchestrator-acceptance-smoke.md"),
  });
  assert.strictEqual(
    bufferedRunner.parseBufferedAcceptanceArgs(["--governance-report"]).governanceReport,
    true,
  );
  assertThrowsWithMessage(
    () => bufferedRunner.parseBufferedAcceptanceArgs(["--sandbox", "danger-full-access"]),
    "Unsafe buffered acceptance flag rejected: --sandbox",
  );
  assertThrowsWithMessage(
    () => bufferedRunner.parseBufferedAcceptanceArgs(["--skip-git-repo-check"]),
    "Unsafe buffered acceptance flag rejected: --skip-git-repo-check",
  );
  assertThrowsWithMessage(
    () => bufferedRunner.parseBufferedAcceptanceArgs(["--contract-smoke=true"]),
    "Flag does not accept a value in buffered acceptance mode: --contract-smoke",
  );

  for (const preservedContract of artifact.preservedContracts) {
    assert.strictEqual(typeof preservedContract, "string");
    assert(preservedContract.length > 0, "preserved contract entries must be non-empty.");
  }

  assert(
    bufferedRunnerSource.includes("sdk-buffered-acceptance-split-review-smoke.js"),
    "check:rules must directly run the M170 buffered acceptance split review smoke.",
  );
  assert(
    bufferedRunnerSource.includes("M170 SDK buffered acceptance split review smoke failed"),
    "check:rules must report M170 smoke failures explicitly.",
  );

  console.log("SDK buffered acceptance split review smoke: pass");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

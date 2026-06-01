"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const repo = path.resolve(__dirname, "..");
const ARTIFACT_PATH =
  ".codex-audit/sdk-orchestrator-extraction/169-sdk-post-run-contract-review-or-extraction.json";

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

function syntheticSnapshot(pathSignatures, label = "synthetic") {
  return {
    changedPaths: Object.keys(pathSignatures),
    cwd: repo,
    label,
    pathSignatures,
  };
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
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");

  assert.strictEqual(artifact.schema, "sdk-post-run-contract-review-or-extraction.v1");
  assert.strictEqual(artifact.milestone, 169);
  assert.strictEqual(artifact.decision.type, "behavior-preserving-extraction");
  assert.strictEqual(artifact.sourceContext.previousMilestone, 168);
  assert.strictEqual(previous.schema, "sdk-runtime-diagnostics-review-or-extraction.v1");
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.behaviorPreservingExtraction, true);
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.publicExportsPreserved, true);
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.scopePolicyAdapterInjected, true);
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.forbiddenPathPolicyAdapterInjected, true);
  assert.strictEqual(
    artifact.sourceContext.behaviorBoundary.sdkWritePlannedPathAllowlistsAdapterInjected,
    true,
  );
  assert.strictEqual(
    artifact.sourceContext.behaviorBoundary.productionCodeExistingSourceRequirementAdapterInjected,
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
  const core = await importModule("orchestrator/core/post-run-contract.mjs");
  const adapterModule = await importModule("orchestrator/adapters/ae-agent-sdk-policy.mjs");

  assert.strictEqual(
    runner.AE_AGENT_SDK_ADAPTER_CONFIG,
    adapterModule.AE_AGENT_SDK_ADAPTER_CONFIG,
    "write runner must still consume the active AE Agent adapter config.",
  );
  assert.strictEqual(typeof core.createPostRunContractHelpers, "function");
  assert.strictEqual(typeof core.evaluatePreRunGitState, "function");
  assert.strictEqual(typeof core.assertPreRunGitState, "function");
  assert.strictEqual(typeof core.validatePostRunContract, "function");
  assert.strictEqual(typeof core.validateSdkWriteDiffAllowlist, "function");
  assert.strictEqual(typeof core.validateSdkWritePlannedPathPrecondition, "function");
  assert.strictEqual(typeof runner.evaluatePreRunGitState, "function");
  assert.strictEqual(typeof runner.assertPreRunGitState, "function");
  assert.strictEqual(typeof runner.validatePostRunContract, "function");
  assert.strictEqual(typeof runner.validateSdkWriteDiffAllowlist, "function");
  assert.strictEqual(typeof runner.validateSdkWritePlannedPathPrecondition, "function");

  const coreHelpers = core.createPostRunContractHelpers({
    allowedImplementationReportPaths: runner.SDK_WRITE_ALLOWED_HOST_REPORT_PATHS,
    collectPathsChangedSincePre: runner.collectPathsChangedSincePre,
    createSdkWritePlannedPathCheck: runner.createSdkWritePlannedPathCheck,
    docsAuditScope: runner.SDK_WRITE_ALLOWED_SCOPE,
    getPathContractViolations: runner.getPathContractViolations,
    isForbiddenPath: runner.isForbiddenPath,
    normalizeRepoPath: runner.normalizeRepoPath,
    productionCodeScope: runner.SDK_WRITE_PRODUCTION_CODE_SCOPE,
    validateScope: runner.validateScope,
  });

  const cleanPre = syntheticSnapshot({}, "clean-pre");
  const cleanState = coreHelpers.evaluatePreRunGitState(cleanPre);
  assert.deepStrictEqual(cleanState, runner.evaluatePreRunGitState(cleanPre));
  assert.strictEqual(cleanState.ok, true);
  assert.doesNotThrow(() => coreHelpers.assertPreRunGitState(cleanPre));

  const dirtyReadme = syntheticSnapshot({ "orchestrator/README.md": "dirty" }, "dirty-pre");
  assert.deepStrictEqual(
    coreHelpers.evaluatePreRunGitState(dirtyReadme, {
      acknowledgedExistingChanges: ["orchestrator/README.md"],
    }),
    runner.evaluatePreRunGitState(dirtyReadme, {
      acknowledgedExistingChanges: ["orchestrator/README.md"],
    }),
  );
  assertThrowsWithMessage(
    () => coreHelpers.assertPreRunGitState(dirtyReadme),
    "Dirty unexpected git state before write-capable run:",
  );
  assertThrowsWithMessage(
    () =>
      coreHelpers.assertPreRunGitState(dirtyReadme, {
        acknowledgedExistingChanges: ["orchestrator/missing.md"],
      }),
    "Dirty unexpected git state before write-capable run:",
  );

  const forbiddenDirty = syntheticSnapshot({ ".env": "dirty" }, "forbidden-pre");
  assertThrowsWithMessage(
    () =>
      coreHelpers.assertPreRunGitState(forbiddenDirty, {
        acknowledgedExistingChanges: [".env"],
      }),
    "Forbidden path dirty before write-capable run:",
  );

  const postReadme = syntheticSnapshot({ "orchestrator/README.md": "after" }, "post-readme");
  assert.deepStrictEqual(
    coreHelpers.validatePostRunContract({
      postSnapshot: postReadme,
      preSnapshot: cleanPre,
      scope: "orchestrator",
      validationResult: { ok: true },
    }),
    runner.validatePostRunContract({
      postSnapshot: postReadme,
      preSnapshot: cleanPre,
      scope: "orchestrator",
      validationResult: { ok: true },
    }),
  );
  assertThrowsWithMessage(
    () =>
      coreHelpers.validatePostRunContract({
        postSnapshot: syntheticSnapshot(
          { "scripts/provider-api-smoke.js": "after" },
          "post-production-file",
        ),
        preSnapshot: cleanPre,
        scope: "docs-audit",
        validationResult: { ok: true },
      }),
    "Path allowlist violation after write-capable run:",
  );
  assertThrowsWithMessage(
    () =>
      coreHelpers.validatePostRunContract({
        postSnapshot: postReadme,
        preSnapshot: cleanPre,
        scope: "orchestrator",
        validationResult: { ok: false },
      }),
    "Hard-stop policy rejected failed validation result.",
  );

  const docsPlannedPath = ".codex-audit/m169-post-run-contract-smoke.md";
  const docsPost = syntheticSnapshot({ [docsPlannedPath]: "after" }, "docs-post");
  const docsSdkWriteContract = coreHelpers.validateSdkWriteDiffAllowlist({
    plannedPaths: [docsPlannedPath],
    postSnapshot: docsPost,
    preSnapshot: cleanPre,
    scope: runner.SDK_WRITE_ALLOWED_SCOPE,
    validationResult: { ok: true },
  });
  assert.deepStrictEqual(docsSdkWriteContract.actualChangedFiles, [docsPlannedPath]);
  assert.deepStrictEqual(
    docsSdkWriteContract,
    runner.validateSdkWriteDiffAllowlist({
      plannedPaths: [docsPlannedPath],
      postSnapshot: docsPost,
      preSnapshot: cleanPre,
      scope: runner.SDK_WRITE_ALLOWED_SCOPE,
      validationResult: { ok: true },
    }),
  );

  assertThrowsWithMessage(
    () =>
      coreHelpers.validateSdkWriteDiffAllowlist({
        plannedPaths: [docsPlannedPath],
        postSnapshot: syntheticSnapshot(
          {
            [docsPlannedPath]: "after",
            "orchestrator/README.md": "after",
          },
          "docs-out-of-scope-post",
        ),
        preSnapshot: cleanPre,
        scope: runner.SDK_WRITE_ALLOWED_SCOPE,
        validationResult: { ok: true },
      }),
    "Post-run diff outside docs-audit sdk-write allowlist:",
  );
  assertThrowsWithMessage(
    () =>
      coreHelpers.validateSdkWriteDiffAllowlist({
        plannedPaths: [docsPlannedPath],
        postSnapshot: syntheticSnapshot({ ".env": "after" }, "forbidden-post"),
        preSnapshot: cleanPre,
        scope: runner.SDK_WRITE_ALLOWED_SCOPE,
        validationResult: { ok: true },
      }),
    "Forbidden path diff detected after sdk-write run:",
  );
  assertThrowsWithMessage(
    () =>
      coreHelpers.validateSdkWriteDiffAllowlist({
        plannedPaths: [docsPlannedPath],
        postSnapshot: syntheticSnapshot({}, "missing-post"),
        preSnapshot: cleanPre,
        scope: runner.SDK_WRITE_ALLOWED_SCOPE,
        validationResult: { ok: true },
      }),
    "SDK write did not change planned output path:",
  );

  const fixturePlannedPath = "orchestrator/fixtures/sdk-write/m169-post-run-contract-smoke.json";
  const fixtureDirectoryPost = syntheticSnapshot(
    { "orchestrator/fixtures/sdk-write/": "directory-changed" },
    "fixture-dir-post",
  );
  const fixtureDirectoryContract = coreHelpers.validateSdkWriteDiffAllowlist({
    directoryChildEnumerator: () => [fixturePlannedPath],
    plannedPaths: [fixturePlannedPath],
    postSnapshot: fixtureDirectoryPost,
    preSnapshot: cleanPre,
    scope: runner.SDK_WRITE_ORCHESTRATOR_SCOPE,
    validationResult: { ok: true },
  });
  assert.deepStrictEqual(fixtureDirectoryContract.actualChangedFiles, [fixturePlannedPath]);
  assert.deepStrictEqual(fixtureDirectoryContract.normalizedDirectoryEntries, [
    "orchestrator/fixtures/sdk-write/",
  ]);
  assertThrowsWithMessage(
    () =>
      coreHelpers.validateSdkWriteDiffAllowlist({
        directoryChildEnumerator: () => [
          fixturePlannedPath,
          "orchestrator/fixtures/sdk-write/unplanned.json",
        ],
        plannedPaths: [fixturePlannedPath],
        postSnapshot: fixtureDirectoryPost,
        preSnapshot: cleanPre,
        scope: runner.SDK_WRITE_ORCHESTRATOR_SCOPE,
        validationResult: { ok: true },
      }),
    "Post-run diff outside orchestrator sdk-write allowlist:",
  );

  const productionPrecondition = coreHelpers.validateSdkWritePlannedPathPrecondition({
    pathExists: (repoPath) => repoPath === "scripts/provider-api-smoke.js",
    plannedPaths: ["scripts/provider-api-smoke.js"],
    scope: runner.SDK_WRITE_PRODUCTION_CODE_SCOPE,
  });
  assert.strictEqual(productionPrecondition.mode, "existing-source-update");
  assert.deepStrictEqual(productionPrecondition.existingPlannedPaths, [
    "scripts/provider-api-smoke.js",
  ]);
  assertThrowsWithMessage(
    () =>
      coreHelpers.validateSdkWritePlannedPathPrecondition({
        pathExists: () => false,
        plannedPaths: ["scripts/provider-api-smoke.js"],
        scope: runner.SDK_WRITE_PRODUCTION_CODE_SCOPE,
      }),
    "Planned production-code sdk-write source path missing before SDK thread creation:",
  );
  assertThrowsWithMessage(
    () =>
      coreHelpers.validateSdkWritePlannedPathPrecondition({
        pathExists: () => true,
        plannedPaths: [docsPlannedPath],
        scope: runner.SDK_WRITE_ALLOWED_SCOPE,
      }),
    "Planned sdk-write output already exists before SDK thread creation:",
  );

  const customExistingSourceHelpers = core.createPostRunContractHelpers({
    allowedImplementationReportPaths: [],
    collectPathsChangedSincePre: runner.collectPathsChangedSincePre,
    createSdkWritePlannedPathCheck: runner.createSdkWritePlannedPathCheck,
    docsAuditScope: runner.SDK_WRITE_ALLOWED_SCOPE,
    getPathContractViolations: runner.getPathContractViolations,
    isForbiddenPath: runner.isForbiddenPath,
    normalizeRepoPath: runner.normalizeRepoPath,
    productionCodeScope: "custom-production",
    validateScope: runner.validateScope,
  });
  assert.strictEqual(
    customExistingSourceHelpers.validateSdkWritePlannedPathPrecondition({
      pathExists: () => true,
      plannedPaths: ["custom/source.js"],
      scope: "custom-production",
    }).mode,
    "existing-source-update",
    "production-code existing-source behavior must come from injected policy.",
  );
  assert.strictEqual(
    customExistingSourceHelpers.validateSdkWritePlannedPathPrecondition({
      pathExists: () => false,
      plannedPaths: ["scripts/provider-api-smoke.js"],
      scope: runner.SDK_WRITE_PRODUCTION_CODE_SCOPE,
    }).mode,
    "new-output-only",
    "runner production-code scope must not be hard-coded inside core preconditions.",
  );

  console.log("SDK post-run contract extraction smoke: pass");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

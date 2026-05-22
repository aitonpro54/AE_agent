"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const repo = path.resolve(__dirname, "..");
const ARTIFACT_PATH =
  ".codex-audit/sdk-orchestrator-extraction/168-sdk-runtime-diagnostics-review-or-extraction.json";

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

function repoPathFromAbsolute(filePath) {
  return path.relative(repo, filePath).replace(/\\/g, "/");
}

async function main() {
  const artifact = readJson(ARTIFACT_PATH);
  const previous = readJson(artifact.sourceContext.previousArtifact);
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");

  assert.strictEqual(artifact.schema, "sdk-runtime-diagnostics-review-or-extraction.v1");
  assert.strictEqual(artifact.milestone, 168);
  assert.strictEqual(artifact.decision.type, "behavior-preserving-extraction");
  assert.strictEqual(artifact.sourceContext.previousMilestone, 167);
  assert.strictEqual(previous.schema, "sdk-operation-envelope-core-extraction.v1");
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.behaviorPreservingExtraction, true);
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.publicExportsPreserved, true);
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.runtimePathsAdapterInjected, true);
  assert.strictEqual(
    artifact.sourceContext.behaviorBoundary.fallbackReportDirectoryAdapterInjected,
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
  const runtimeStore = await importModule("orchestrator/core/runtime-store.mjs");
  const diagnostics = await importModule("orchestrator/core/failure-diagnostics.mjs");
  const adapterModule = await importModule("orchestrator/adapters/ae-agent-sdk-policy.mjs");

  assert.strictEqual(
    runner.AE_AGENT_SDK_ADAPTER_CONFIG,
    adapterModule.AE_AGENT_SDK_ADAPTER_CONFIG,
    "write runner must still consume the active AE Agent adapter config.",
  );
  assert.strictEqual(typeof runtimeStore.createSdkRuntimeStoreHelpers, "function");
  assert.strictEqual(typeof runtimeStore.resolveSdkRuntimePaths, "function");
  assert.strictEqual(typeof runtimeStore.writeSdkWriteLog, "function");
  assert.strictEqual(typeof diagnostics.createSdkWriteFallbackReport, "function");
  assert.strictEqual(typeof diagnostics.createSdkWriteFailureMessage, "function");
  assert.strictEqual(typeof diagnostics.errorDiagnostic, "function");
  assert.strictEqual(typeof runner.resolveSdkRuntimePaths, "function");
  assert.strictEqual(typeof runner.writeSdkWriteLog, "function");
  assert.strictEqual(typeof runner.createSdkWriteFallbackReport, "function");
  assert.strictEqual(typeof runner.createSdkWriteFailureMessage, "function");

  const adapterRuntimePolicy = {
    ...adapterModule.AE_AGENT_SDK_ADAPTER_CONFIG.runtime,
    normalizeRepoPath: runner.normalizeRepoPath,
  };
  const adapterCore = runtimeStore.createSdkRuntimeStoreHelpers(adapterRuntimePolicy);
  const syntheticPrimaryRuntimeError = new Error("Access denied to synthetic primary runtime");
  syntheticPrimaryRuntimeError.code = "EACCES";
  const runtimeProbeWrites = [];
  const runtimeProbeDeletes = [];
  const adapterPreflight = adapterCore.resolveSdkRuntimePaths(repo, {
    mkdirSync: (directoryPath) => {
      const repoPath = repoPathFromAbsolute(directoryPath);
      if (repoPath.startsWith(runner.SDK_WRITE_PRIMARY_RUNTIME_DIRECTORY)) {
        throw syntheticPrimaryRuntimeError;
      }
    },
    unlinkSync: (filePath) => {
      runtimeProbeDeletes.push(repoPathFromAbsolute(filePath));
    },
    writeFileSync: (filePath) => {
      runtimeProbeWrites.push(repoPathFromAbsolute(filePath));
    },
  });

  assert.strictEqual(adapterPreflight.primaryWritable, false);
  assert.strictEqual(adapterPreflight.fallbackWritable, true);
  assert.strictEqual(adapterPreflight.selectedRuntimePath, runner.SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY);
  assert(
    runtimeProbeWrites.some((repoPath) =>
      repoPath.startsWith(`${runner.SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY}/logs/`),
    ),
    "fallback runtime logs directory was not probed.",
  );
  assert(
    runtimeProbeWrites.some((repoPath) =>
      repoPath.startsWith(`${runner.SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY}/operations/`),
    ),
    "fallback runtime operations directory was not probed.",
  );
  assert(
    runtimeProbeWrites.length > 0 &&
      runtimeProbeWrites.every((repoPath) => runtimeProbeDeletes.includes(repoPath)),
    "runtime preflight did not clean temp probe files.",
  );

  const customPolicy = {
    fallbackReportDirectory: ".custom-audit",
    fallbackRuntimeDirectory: ".custom-runtime/fallback",
    primaryRuntimeDirectory: ".custom-runtime/primary",
    runtimeSubdirectories: ["logs", "operations"],
    normalizeRepoPath: runner.normalizeRepoPath,
  };
  const customCore = runtimeStore.createSdkRuntimeStoreHelpers(customPolicy);
  const customReportPath = customCore.createSdkWriteFallbackReportPath("M168 custom smoke");
  assert(
    customReportPath.startsWith(".custom-audit/"),
    "fallback report path must come from the injected fallback report directory.",
  );

  const syntheticLogError = new Error("EPERM: synthetic runtime write denied");
  syntheticLogError.code = "EPERM";
  const syntheticSdkError = new Error("synthetic original SDK failure preserved");
  syntheticSdkError.code = "SYNTHETIC_SDK_FAILURE";
  const fallbackWrites = new Map();
  const customPreflight = {
    fallbackProbe: { writable: false },
    fallbackRuntimePath: customPolicy.fallbackRuntimeDirectory,
    fallbackWritable: false,
    primaryProbe: { writable: false },
    primaryRuntimePath: customPolicy.primaryRuntimeDirectory,
    primaryWritable: false,
    reasonSelected: "synthetic both runtimes unavailable",
    selectedLogDirectory: `${customPolicy.fallbackRuntimeDirectory}/logs`,
    selectedOperationDirectory: `${customPolicy.fallbackRuntimeDirectory}/operations`,
    selectedRuntimePath: customPolicy.fallbackRuntimeDirectory,
    selectedRuntimeWritable: false,
  };
  const logResult = customCore.writeSdkWriteLog(
    repo,
    "m168-runtime-diagnostics-smoke",
    {
      failure: diagnostics.errorDiagnostic(syntheticSdkError),
      operationEnvelope: {
        operationId: "m168-runtime-diagnostics-smoke",
        sourcePath: customCore.createSdkWriteOperationFallbackPath(
          "m168-runtime-diagnostics-smoke",
          customPreflight,
        ),
      },
      outputFileCreatedBySdk: false,
      plannedPathCheck: { plannedPaths: ["orchestrator/README.md"] },
      realWriteWork: false,
      sdkRunFailure: diagnostics.errorDiagnostic(syntheticSdkError),
      sdkThreadCompleted: false,
      sdkThreadCreated: false,
      sdkThreadId: null,
      sdkThreadOutputPath: "orchestrator/README.md",
    },
    {
      mkdirSync: (directoryPath) => {
        const repoPath = repoPathFromAbsolute(directoryPath);
        if (repoPath.startsWith(".custom-runtime")) {
          throw syntheticLogError;
        }
      },
      writeFileSync: (filePath, text) => {
        const repoPath = repoPathFromAbsolute(filePath);
        if (repoPath.startsWith(".custom-runtime")) {
          throw syntheticLogError;
        }
        fallbackWrites.set(repoPath, text);
      },
      runtimePreflight: customPreflight,
    },
  );

  assert.strictEqual(logResult.path, null);
  assert.strictEqual(logResult.errorCode, "EPERM");
  assert.strictEqual(logResult.fallbackReportWritten, true);
  assert(logResult.fallbackReportPath.startsWith(".custom-audit/"));
  assert(logResult.fallbackOperationPath.startsWith(".custom-runtime/fallback/operations/"));
  const report = fallbackWrites.get(logResult.fallbackReportPath);
  assert(report.includes("synthetic original SDK failure preserved"));
  assert(report.includes("sdkThreadCreated: false"));
  assert(report.includes("realWriteWork: false"));
  assert(report.includes("selected runtime path: .custom-runtime/fallback"));

  const failureMessage = diagnostics.createSdkWriteFailureMessage(syntheticSdkError, logResult);
  assert(failureMessage.includes("synthetic original SDK failure preserved"));
  assert(failureMessage.includes("SDK log write failed: EPERM"));
  assert(failureMessage.includes("Fallback diagnostic report: .custom-audit/"));

  assert(runner.createSdkWriteFallbackReportPath("m168 facade").startsWith(".codex-audit/"));
  assert(
    runner
      .createSdkWriteOperationFallbackPath("m168 facade", adapterPreflight)
      .startsWith(`${runner.SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY}/operations/`),
    "runner facade must preserve adapter-injected fallback operation paths.",
  );

  console.log("SDK runtime diagnostics extraction smoke: pass");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

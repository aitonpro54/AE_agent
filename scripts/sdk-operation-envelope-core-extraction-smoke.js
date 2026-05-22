"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const repo = path.resolve(__dirname, "..");
const ARTIFACT_PATH =
  ".codex-audit/sdk-orchestrator-extraction/167-sdk-operation-envelope-core-extraction.json";

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
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");

  assert.strictEqual(artifact.schema, "sdk-operation-envelope-core-extraction.v1");
  assert.strictEqual(artifact.milestone, 167);
  assert.strictEqual(artifact.sourceContext.previousMilestone, 166);
  assert.strictEqual(previous.schema, "sdk-runner-split-review.v1");
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.behaviorPreservingExtraction, true);
  assert.strictEqual(artifact.sourceContext.behaviorBoundary.publicExportsPreserved, true);

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
  const core = await importModule("orchestrator/core/operation-envelope.mjs");
  const adapterModule = await importModule("orchestrator/adapters/ae-agent-sdk-policy.mjs");

  assert.strictEqual(
    runner.AE_AGENT_SDK_ADAPTER_CONFIG,
    adapterModule.AE_AGENT_SDK_ADAPTER_CONFIG,
    "write runner must still consume the active AE Agent adapter config.",
  );
  assert.strictEqual(typeof core.createOperationEnvelopeHelpers, "function");
  assert.strictEqual(typeof core.resolveOperationFilePath, "function");
  assert.strictEqual(typeof core.parseOperationEnvelopeJson, "function");
  assert.strictEqual(typeof core.validateOperationEnvelope, "function");
  assert.strictEqual(typeof core.loadOperationEnvelopeOptions, "function");
  assert.strictEqual(typeof runner.resolveOperationFilePath, "function");
  assert.strictEqual(typeof runner.parseOperationEnvelopeJson, "function");
  assert.strictEqual(typeof runner.validateOperationEnvelope, "function");
  assert.strictEqual(typeof runner.loadOperationEnvelopeOptions, "function");

  const validEnvelope = {
    version: runner.OPERATION_ENVELOPE_VERSION,
    operationId: "m167-operation-envelope-core-smoke",
    scope: "orchestrator",
    mode: runner.OPERATION_ENVELOPE_MODE,
    prompt: "Check local operation envelope policy.",
    plannedPaths: ["orchestrator/README.md"],
  };

  const localCoreHelpers = core.createOperationEnvelopeHelpers({
    createPlannedPathCheck: runner.createPlannedPathCheck,
    createSdkWritePlannedPathCheck: runner.createSdkWritePlannedPathCheck,
    dryRunMode: runner.OPERATION_ENVELOPE_MODE,
    modes: runner.OPERATION_ENVELOPE_MODES,
    normalizeRepoPath: runner.normalizeRepoPath,
    requiredFields: runner.OPERATION_ENVELOPE_REQUIRED_FIELDS,
    sdkWriteAllowedScopes: runner.SDK_WRITE_ALLOWED_SCOPES,
    sdkWriteMode: runner.SDK_WRITE_OPERATION_MODE,
    scopes: runner.WRITE_SCOPES,
    throwPlannedPathCheckError(plannedPathCheck) {
      const summary = plannedPathCheck.violations
        .map((violation) => `${violation.path} (${violation.reason})`)
        .join(", ");
      throw new Error(`planned path rejected: ${summary}`);
    },
    unsafeFields: ["sandboxMode"],
    validatePromptPolicy: runner.validatePromptPolicy,
    validateScope: runner.validateScope,
    version: runner.OPERATION_ENVELOPE_VERSION,
  });

  assert.deepStrictEqual(
    localCoreHelpers.validateOperationEnvelope(validEnvelope),
    runner.validateOperationEnvelope(validEnvelope),
    "core helper validation must match the runner facade for a valid AE Agent dry-run envelope.",
  );
  assert.deepStrictEqual(
    runner.parseOperationEnvelopeJson(JSON.stringify(validEnvelope), "m167-smoke"),
    runner.validateOperationEnvelope(validEnvelope),
    "runner facade parse helper must keep returning validated envelope options.",
  );

  const hooks = {
    existsSync: () => true,
    readFileSync: () => JSON.stringify(validEnvelope),
    realpathSync: (value) => value,
    statSync: () => ({ isFile: () => true }),
  };
  const loaded = runner.loadOperationEnvelopeOptions(
    {
      cwd: repo,
      dryRun: true,
      operationFile: ".codex-audit/m167-operation-envelope-smoke.json",
    },
    hooks,
  );
  assert.strictEqual(loaded.dryRun, true);
  assert.strictEqual(loaded.sdkWrite, false);
  assert.strictEqual(loaded.scope, validEnvelope.scope);
  assert.deepStrictEqual(loaded.plannedPaths, validEnvelope.plannedPaths);
  assert.strictEqual(
    loaded.operationEnvelope.sourcePath,
    ".codex-audit/m167-operation-envelope-smoke.json",
  );

  assertThrowsWithMessage(
    () => runner.resolveOperationFilePath(path.join("..", "outside-operation.json"), repo),
    "Operation file outside repo:",
  );
  assertThrowsWithMessage(
    () => runner.parseOperationEnvelopeJson("{not-json", "m167-smoke"),
    "Malformed operation file JSON:",
  );
  assertThrowsWithMessage(
    () => runner.validateOperationEnvelope({ ...validEnvelope, sandboxMode: "workspace-write" }),
    "Unsafe operation envelope field rejected:",
  );
  assertThrowsWithMessage(
    () => runner.validateOperationEnvelope({ ...validEnvelope, plannedPaths: ["package-lock.json"] }),
    "Operation envelope plannedPaths include forbidden paths:",
  );

  console.log("SDK operation envelope core extraction smoke: pass");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

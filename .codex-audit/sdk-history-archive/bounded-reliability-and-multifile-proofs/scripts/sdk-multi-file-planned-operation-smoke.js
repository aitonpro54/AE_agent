"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const repo = path.resolve(__dirname, "..");
const CONTRACT_PATH = path.join(
  repo,
  ".codex-audit",
  "sdk-multi-file-planned-operation",
  "148-sdk-multi-file-planned-operation-contract.json",
);
const EXPECTED_PLANNED_PATHS = [
  "orchestrator/fixtures/sdk-write/m148-multi-file-alpha.json",
  "orchestrator/fixtures/sdk-write/m148-multi-file-beta.json",
];
const MULTI_FILE_FIXTURE_DIRECTORY = "orchestrator/fixtures/sdk-write/";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function plannedPathSignatures(status = "created") {
  return Object.fromEntries(EXPECTED_PLANNED_PATHS.map((repoPath) => [repoPath, status]));
}

function assertRejects(fn, expectedMessageStart, label) {
  let thrown = null;

  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  assert(thrown, label);
  assert(
    String(thrown.message).startsWith(expectedMessageStart),
    `${label}: expected "${expectedMessageStart}", received "${thrown.message}"`,
  );
}

function createDirectoryChildEnumerator(childrenByDirectory) {
  return (repoPath) => {
    const normalizedPath = String(repoPath).replace(/\\/g, "/");
    const withoutTrailingSlash = normalizedPath.replace(/\/+$/u, "");

    if (Object.hasOwn(childrenByDirectory, normalizedPath)) {
      return childrenByDirectory[normalizedPath];
    }

    if (Object.hasOwn(childrenByDirectory, withoutTrailingSlash)) {
      return childrenByDirectory[withoutTrailingSlash];
    }

    throw new Error(`unexpected directory enumeration request: ${repoPath}`);
  };
}

async function main() {
  const artifact = readJson(CONTRACT_PATH);
  const scaffold = await import(
    pathToFileURL(path.join(repo, "orchestrator", "run-write-capable-scaffold.mjs")).href
  );
  const {
    OPERATION_ENVELOPE_VERSION,
    SDK_MULTI_FILE_PLANNED_OPERATION_CONTRACT_SCHEMA,
    SDK_MULTI_FILE_PLANNED_OPERATION_DIRECTORY,
    SDK_WRITE_OPERATION_MODE,
    SDK_WRITE_ORCHESTRATOR_MULTI_FILE_CONTRACT_PLANNED_PATHS,
    SDK_WRITE_ORCHESTRATOR_SCOPE,
    createSdkWritePlannedPathCheck,
    createSdkWritePrompt,
    validateOperationEnvelope,
    validateSdkWriteDiffAllowlist,
  } = scaffold;

  assert.strictEqual(artifact.schema, SDK_MULTI_FILE_PLANNED_OPERATION_CONTRACT_SCHEMA);
  assert.strictEqual(artifact.milestone, 148);
  assert.strictEqual(
    artifact.artifactDirectory,
    SDK_MULTI_FILE_PLANNED_OPERATION_DIRECTORY,
  );
  assert.deepStrictEqual(
    SDK_WRITE_ORCHESTRATOR_MULTI_FILE_CONTRACT_PLANNED_PATHS,
    EXPECTED_PLANNED_PATHS,
  );
  assert.deepStrictEqual(artifact.operation.plannedPaths, EXPECTED_PLANNED_PATHS);
  assert.strictEqual(artifact.verdict.multiFilePlannedOperationContract, "local-pass");
  assert.strictEqual(artifact.verdict.sdkThreadProofRun, false);
  assert.strictEqual(artifact.verdict.generalSdkWorkflow, "not-production-ready");
  assert.strictEqual(artifact.safetyBoundary.sdkThreadCreated, false);
  assert.strictEqual(artifact.safetyBoundary.networkUsed, false);
  assert.strictEqual(artifact.safetyBoundary.packageInstallAllowed, false);
  assert.strictEqual(artifact.safetyBoundary.gitMutationAllowed, false);

  const operationEnvelope = {
    version: OPERATION_ENVELOPE_VERSION,
    operationId: "m148-multi-file-planned-operation-contract",
    scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
    mode: SDK_WRITE_OPERATION_MODE,
    prompt: "Validate the local multi-file planned operation contract before any SDKThread proof.",
    plannedPaths: EXPECTED_PLANNED_PATHS,
  };
  const validatedEnvelope = validateOperationEnvelope(operationEnvelope);
  assert.deepStrictEqual(validatedEnvelope.plannedPaths, EXPECTED_PLANNED_PATHS);
  assert.strictEqual(validatedEnvelope.scope, SDK_WRITE_ORCHESTRATOR_SCOPE);
  assert.strictEqual(validatedEnvelope.mode, SDK_WRITE_OPERATION_MODE);

  const plannedPathCheck = createSdkWritePlannedPathCheck(
    SDK_WRITE_ORCHESTRATOR_SCOPE,
    EXPECTED_PLANNED_PATHS,
  );
  assert.strictEqual(plannedPathCheck.allowed, true);
  assert.deepStrictEqual(plannedPathCheck.violations, []);
  assert.deepStrictEqual(plannedPathCheck.allowedPaths, EXPECTED_PLANNED_PATHS);

  const prompt = createSdkWritePrompt({
    ...operationEnvelope,
    operationEnvelope,
    sdkWrite: true,
  });
  assert(prompt.includes("Allowed planned output paths:"));
  assert(prompt.includes("Write each JSON file with this object shape:"));
  for (const repoPath of EXPECTED_PLANNED_PATHS) {
    assert(prompt.includes(repoPath), `Prompt missing planned path: ${repoPath}`);
  }

  const postRunContract = validateSdkWriteDiffAllowlist({
    plannedPaths: EXPECTED_PLANNED_PATHS,
    postSnapshot: {
      pathSignatures: plannedPathSignatures(),
    },
    preSnapshot: { pathSignatures: {} },
    scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
    validationResult: { ok: true },
  });
  assert.strictEqual(postRunContract.verdict, "pass");
  assert.deepStrictEqual(postRunContract.actualChangedFiles, EXPECTED_PLANNED_PATHS);
  assert.deepStrictEqual(postRunContract.outOfScopeFiles, []);
  assert.deepStrictEqual(postRunContract.missingPlannedChanges, []);

  const directoryPostRunContract = validateSdkWriteDiffAllowlist({
    directoryChildEnumerator: createDirectoryChildEnumerator({
      [MULTI_FILE_FIXTURE_DIRECTORY]: EXPECTED_PLANNED_PATHS,
    }),
    plannedPaths: EXPECTED_PLANNED_PATHS,
    postSnapshot: {
      cwd: repo,
      pathSignatures: {
        [MULTI_FILE_FIXTURE_DIRECTORY]: "created",
      },
    },
    preSnapshot: { pathSignatures: {} },
    scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
    validationResult: { ok: true },
  });
  assert.strictEqual(directoryPostRunContract.verdict, "pass");
  assert.deepStrictEqual(directoryPostRunContract.actualChangedFiles, EXPECTED_PLANNED_PATHS);

  const rejectedCases = [
    {
      id: "extra-file-post-run-diff",
      expectedMessageStart: "Post-run diff outside orchestrator sdk-write allowlist:",
      run: () =>
        validateSdkWriteDiffAllowlist({
          plannedPaths: EXPECTED_PLANNED_PATHS,
          postSnapshot: {
            pathSignatures: {
              ...plannedPathSignatures(),
              "orchestrator/fixtures/sdk-write/m148-extra.json": "created",
            },
          },
          preSnapshot: { pathSignatures: {} },
          scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
          validationResult: { ok: true },
        }),
    },
    {
      id: "forbidden-planned-env-path",
      expectedMessageStart: "Operation envelope plannedPaths include forbidden paths:",
      run: () =>
        validateOperationEnvelope({
          ...operationEnvelope,
          plannedPaths: [...EXPECTED_PLANNED_PATHS, ".env"],
        }),
    },
    {
      id: "unplanned-directory-child",
      expectedMessageStart: "Post-run diff outside orchestrator sdk-write allowlist:",
      run: () =>
        validateSdkWriteDiffAllowlist({
          directoryChildEnumerator: createDirectoryChildEnumerator({
            [MULTI_FILE_FIXTURE_DIRECTORY]: [
              ...EXPECTED_PLANNED_PATHS,
              "orchestrator/fixtures/sdk-write/m148-unplanned-child.json",
            ],
          }),
          plannedPaths: EXPECTED_PLANNED_PATHS,
          postSnapshot: {
            cwd: repo,
            pathSignatures: {
              [MULTI_FILE_FIXTURE_DIRECTORY]: "created",
            },
          },
          preSnapshot: { pathSignatures: {} },
          scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
          validationResult: { ok: true },
        }),
    },
    {
      id: "env-directory-child",
      expectedMessageStart: "Forbidden path diff detected after sdk-write run:",
      run: () =>
        validateSdkWriteDiffAllowlist({
          directoryChildEnumerator: createDirectoryChildEnumerator({
            [MULTI_FILE_FIXTURE_DIRECTORY]: [
              ...EXPECTED_PLANNED_PATHS,
              "orchestrator/fixtures/sdk-write/.env",
            ],
          }),
          plannedPaths: EXPECTED_PLANNED_PATHS,
          postSnapshot: {
            cwd: repo,
            pathSignatures: {
              [MULTI_FILE_FIXTURE_DIRECTORY]: "created",
            },
          },
          preSnapshot: { pathSignatures: {} },
          scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
          validationResult: { ok: true },
        }),
    },
    {
      id: "credential-directory-child",
      expectedMessageStart: "Forbidden path diff detected after sdk-write run:",
      run: () =>
        validateSdkWriteDiffAllowlist({
          directoryChildEnumerator: createDirectoryChildEnumerator({
            [MULTI_FILE_FIXTURE_DIRECTORY]: [
              ...EXPECTED_PLANNED_PATHS,
              "orchestrator/fixtures/sdk-write/credentials.json",
            ],
          }),
          plannedPaths: EXPECTED_PLANNED_PATHS,
          postSnapshot: {
            cwd: repo,
            pathSignatures: {
              [MULTI_FILE_FIXTURE_DIRECTORY]: "created",
            },
          },
          preSnapshot: { pathSignatures: {} },
          scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
          validationResult: { ok: true },
        }),
    },
    {
      id: "package-lock-churn",
      expectedMessageStart: "Forbidden path diff detected after sdk-write run:",
      run: () =>
        validateSdkWriteDiffAllowlist({
          plannedPaths: EXPECTED_PLANNED_PATHS,
          postSnapshot: {
            pathSignatures: {
              ...plannedPathSignatures(),
              "package-lock.json": "changed",
            },
          },
          preSnapshot: {
            pathSignatures: {
              "package-lock.json": "before",
            },
          },
          scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
          validationResult: { ok: true },
        }),
    },
    {
      id: "git-metadata-churn",
      expectedMessageStart: "Forbidden path diff detected after sdk-write run:",
      run: () =>
        validateSdkWriteDiffAllowlist({
          plannedPaths: EXPECTED_PLANNED_PATHS,
          postSnapshot: {
            pathSignatures: {
              ...plannedPathSignatures(),
              ".git/config": "changed",
            },
          },
          preSnapshot: {
            pathSignatures: {
              ".git/config": "before",
            },
          },
          scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
          validationResult: { ok: true },
        }),
    },
  ];

  assert.deepStrictEqual(
    artifact.rejectedCases.map((item) => item.id).sort(),
    rejectedCases.map((item) => item.id).sort(),
  );

  for (const rejectedCase of rejectedCases) {
    assertRejects(rejectedCase.run, rejectedCase.expectedMessageStart, rejectedCase.id);
  }

  console.log("SDK multi-file planned operation smoke: pass");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

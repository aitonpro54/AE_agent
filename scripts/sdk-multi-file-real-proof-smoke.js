"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const EXPECTED_PLANNED_PATHS = [
  "orchestrator/fixtures/sdk-write/m149-multi-file-alpha.json",
  "orchestrator/fixtures/sdk-write/m149-multi-file-beta.json",
];
const GATE_PATH = path.join(
  repo,
  ".codex-audit",
  "sdk-multi-file-planned-operation",
  "149-sdk-multi-file-real-proof.json",
);
const PROOF_PATHS = EXPECTED_PLANNED_PATHS.map((repoPath) => path.join(repo, repoPath));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertNoForbiddenChangedFiles(changedFiles) {
  for (const repoPath of changedFiles) {
    assert(!repoPath.startsWith(".git/"), "M149 proof must not mutate git metadata.");
    assert(!repoPath.startsWith("node_modules/"), "M149 proof must not touch node_modules.");
    assert(!repoPath.startsWith("cep-panel/"), "M149 proof must not touch CEP panel files.");
    assert(!repoPath.startsWith("mcp-server/"), "M149 proof must not touch bridge code.");
    assert(!repoPath.endsWith("package-lock.json"), "M149 proof must not churn package-lock.");
    assert(!repoPath.endsWith("package.json"), "M149 proof must not change package metadata.");
    assert(!/(^|\/)\.env/i.test(repoPath), "M149 proof must not touch env files.");
    assert(!/(secret|token|credential|\.pem$|\.key$)/i.test(repoPath), "M149 proof touched a sensitive path.");
  }
}

function assertProofFixture(proof, expected) {
  assert.strictEqual(proof.schema, "sdk-multi-file-real-proof.v1");
  assert.strictEqual(proof.result, "created-by-sdk-thread");
  assert.strictEqual(proof.variant, expected.variant);
  assert.strictEqual(proof.sequence, expected.sequence);
  assert.strictEqual(proof.operation.operationId, "m149-multi-file-planned-operation-real-proof");
  assert.strictEqual(proof.operation.scope, "orchestrator");
  assert.strictEqual(proof.operation.mode, "sdk-write");
  assert.strictEqual(proof.operation.plannedPath, expected.plannedPath);
  assert.deepStrictEqual(proof.plannedPaths, EXPECTED_PLANNED_PATHS);
  assert.deepStrictEqual(proof.changedFiles, EXPECTED_PLANNED_PATHS);
  assert.strictEqual(proof.safetyBoundary.noPackageInstall, true);
  assert.strictEqual(proof.safetyBoundary.noGitMutation, true);
  assert.strictEqual(proof.safetyBoundary.noCepAeEndpoint, true);
  assert.strictEqual(proof.safetyBoundary.noSecretRead, true);
  assert(
    proof.safetyNotes.some((item) =>
      item.includes("Only the planned orchestrator fixture JSON output files"),
    ),
    "M149 proof fixture must include the planned-files-only safety note.",
  );

  assertNoForbiddenChangedFiles(proof.changedFiles);
}

function main() {
  const gate = readJson(GATE_PATH);
  const [alpha, beta] = PROOF_PATHS.map(readJson);

  assert.strictEqual(gate.schema, "sdk-multi-file-real-proof-gate.v1");
  assert.strictEqual(gate.milestone, 149);
  assert.strictEqual(
    gate.sourceMultiFileContractArtifact,
    ".codex-audit/sdk-multi-file-planned-operation/148-sdk-multi-file-planned-operation-contract.json",
  );
  assert.strictEqual(
    gate.sourceIterativeReliabilityArtifact,
    ".codex-audit/sdk-iterative-cmd/147-sdk-iterative-cmd-reliability.json",
  );
  assert.strictEqual(
    gate.sourceProductionReadinessArtifact,
    ".codex-audit/sdk-production-readiness/146-sdk-production-ready.json",
  );
  assert.deepStrictEqual(gate.proofArtifacts, EXPECTED_PLANNED_PATHS);
  assert.strictEqual(gate.verdict.multiFileSdkThreadProof, "passed");
  assert.strictEqual(gate.verdict.boundedMultiFileOrchestratorFixtureWrite, true);
  assert.strictEqual(gate.verdict.generalSdkWorkflow, "not-production-ready");
  assert.strictEqual(gate.operation.operationId, "m149-multi-file-planned-operation-real-proof");
  assert.strictEqual(
    gate.operation.operationFile,
    ".codex-runtime/sdk/operations/m149-multi-file-planned-operation-real-proof.json",
  );
  assert.match(gate.operation.runtimeLog, /m149-multi-file-planned-operation-real-proof-sdk-write\.json$/);
  assert.strictEqual(gate.operation.scope, "orchestrator");
  assert.strictEqual(gate.operation.mode, "sdk-write");
  assert.deepStrictEqual(gate.operation.plannedPaths, EXPECTED_PLANNED_PATHS);
  assert.strictEqual(gate.operation.localEnvelopeValidation.allowed, true);
  assert.deepStrictEqual(gate.operation.localEnvelopeValidation.violations, []);
  assert.deepStrictEqual(gate.operation.plannedPathPrecondition.existingPlannedPaths, []);
  assert.deepStrictEqual(
    gate.operation.plannedPathPrecondition.missingPlannedPaths,
    EXPECTED_PLANNED_PATHS,
  );
  assert.strictEqual(gate.operation.plannedPathPrecondition.mode, "new-output-only");
  assert.strictEqual(gate.sdkThread.sdkThreadCreated, true);
  assert.strictEqual(gate.sdkThread.sdkThreadCompleted, true);
  assert.match(gate.sdkThread.sdkThreadId, /^[0-9a-f-]{36}$/);
  assert.strictEqual(gate.sdkThread.result, "sdk-write-completed");
  assert.deepStrictEqual(gate.threadOptions, {
    approvalPolicy: "never",
    networkAccessEnabled: false,
    sandboxMode: "workspace-write",
    webSearchMode: "disabled",
  });
  assert.strictEqual(gate.postRunContract.verdict, "pass");
  assert.deepStrictEqual(gate.postRunContract.actualChangedFiles, EXPECTED_PLANNED_PATHS);
  assert.deepStrictEqual(gate.postRunContract.outOfScopeFiles, []);
  assert.deepStrictEqual(gate.postRunContract.missingPlannedChanges, []);
  assert.deepStrictEqual(gate.postRunContract.stagedDiffNameOnly, []);
  assert.strictEqual(gate.postRunContract.packageInstallOrDependencyChurn, false);
  assert.strictEqual(gate.postRunContract.gitMutationDetected, false);
  assert.strictEqual(gate.postRunContract.liveCepAeDetected, false);
  assert.strictEqual(gate.postRunContract.secretOrCredentialPathTouched, false);
  assert.strictEqual(gate.approval.escalationApprovalRecorded, true);
  assert.strictEqual(
    gate.remainingExclusions.find((item) => item.id === "general-sdk-workflow").status,
    "not-production-ready",
  );
  assert.strictEqual(
    gate.remainingExclusions.find((item) => item.id === "cep-panel-sdk-writes").status,
    "not-production-ready",
  );

  assertProofFixture(alpha, {
    plannedPath: "orchestrator/fixtures/sdk-write/m149-multi-file-alpha.json",
    sequence: 1,
    variant: "alpha",
  });
  assertProofFixture(beta, {
    plannedPath: "orchestrator/fixtures/sdk-write/m149-multi-file-beta.json",
    sequence: 2,
    variant: "beta",
  });
  assertNoForbiddenChangedFiles(gate.postRunContract.actualChangedFiles);

  console.log("SDK multi-file real proof smoke: pass");
}

if (require.main === module) {
  main();
}

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const PROOF_REPO_PATH =
  "orchestrator/fixtures/sdk-write/m147-iterative-cmd-reliability-proof.json";
const OPERATION_PATH = path.join(
  repo,
  ".codex-audit",
  "sdk-iterative-cmd",
  "147-operation-envelope.json",
);
const GATE_PATH = path.join(
  repo,
  ".codex-audit",
  "sdk-iterative-cmd",
  "147-sdk-iterative-cmd-reliability.json",
);
const PROOF_PATH = path.join(repo, PROOF_REPO_PATH);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertNoForbiddenChangedFiles(changedFiles) {
  for (const repoPath of changedFiles) {
    assert(!repoPath.startsWith(".git/"), "M147 proof must not mutate git metadata.");
    assert(!repoPath.startsWith("node_modules/"), "M147 proof must not touch node_modules.");
    assert(!repoPath.startsWith("cep-panel/"), "M147 proof must not touch CEP panel files.");
    assert(!repoPath.startsWith("mcp-server/"), "M147 proof must not touch bridge code.");
    assert(!repoPath.endsWith("package-lock.json"), "M147 proof must not churn package-lock.");
    assert(!repoPath.endsWith("package.json"), "M147 proof must not change package metadata.");
    assert(!/(^|\/)\.env/i.test(repoPath), "M147 proof must not touch env files.");
    assert(!/(secret|token|credential|\.pem$|\.key$)/i.test(repoPath), "M147 proof touched a sensitive path.");
  }
}

function main() {
  const operation = readJson(OPERATION_PATH);
  const gate = readJson(GATE_PATH);
  const proof = readJson(PROOF_PATH);

  assert.strictEqual(operation.schema, "sdk-iterative-cmd-operation.v1");
  assert.strictEqual(operation.milestone, 147);
  assert.strictEqual(operation.envelope.version, 1);
  assert.strictEqual(operation.envelope.operationId, "m147-iterative-cmd-reliability-proof");
  assert.strictEqual(operation.envelope.scope, "orchestrator");
  assert.strictEqual(operation.envelope.mode, "sdk-write");
  assert.deepStrictEqual(operation.envelope.plannedPaths, [PROOF_REPO_PATH]);
  assert.deepStrictEqual(operation.localCommandPolicy.scopedContextReads.sort(), [
    "orchestrator/README.md",
    "scripts/provider-contract-smoke.js",
  ]);
  assert.strictEqual(operation.localCommandPolicy.requiredRepairLoop.firstAttemptExitCode, 1);
  assert.strictEqual(operation.localCommandPolicy.requiredRepairLoop.secondAttemptExitCode, 0);
  assert.strictEqual(operation.localCommandPolicy.requiredRepairLoop.repairIterations, 1);
  assert.strictEqual(operation.safetyBoundary.packageInstallAllowed, false);
  assert.strictEqual(operation.safetyBoundary.gitMutationAllowed, false);
  assert.strictEqual(operation.safetyBoundary.liveCepAeAllowed, false);
  assert.strictEqual(operation.safetyBoundary.secretReadAllowed, false);
  assert.strictEqual(operation.safetyBoundary.autoCommitAllowed, false);

  assert.strictEqual(proof.schema, "sdk-iterative-cmd-proof.v1");
  assert.strictEqual(proof.operationId, operation.envelope.operationId);
  assert.strictEqual(proof.result, "pass");
  assert.strictEqual(proof.scope, "orchestrator");
  assert.strictEqual(proof.mode, "sdk-write");
  assert.strictEqual(proof.plannedPath, PROOF_REPO_PATH);
  assert.deepStrictEqual(proof.changedFiles, [PROOF_REPO_PATH]);
  assert.strictEqual(proof.repairState, "ready");
  assert.strictEqual(proof.repairIterations, 1);
  assert.deepStrictEqual(
    proof.scopedContextRead.map((item) => item.path).sort(),
    ["orchestrator/README.md", "scripts/provider-contract-smoke.js"],
  );
  assert.strictEqual(proof.localChecksRun.length, 2);
  assert.strictEqual(proof.localChecksRun[0].check, "json-ready-check");
  assert.strictEqual(proof.localChecksRun[1].check, "json-ready-check");
  assert.strictEqual(proof.localChecksRun[0].command, proof.localChecksRun[1].command);
  assert.strictEqual(proof.localChecksRun[0].observedExitCode, 1);
  assert.match(proof.localChecksRun[0].observedOutput, /needs-repair/);
  assert.strictEqual(proof.localChecksRun[1].observedExitCode, 0);
  assert.match(proof.localChecksRun[1].observedOutput, /passed/);
  assert.strictEqual(proof.commandBoundary.noPackageInstall, true);
  assert.strictEqual(proof.commandBoundary.noGitCommand, true);
  assert.strictEqual(proof.commandBoundary.noCepAeEndpoint, true);
  assert.strictEqual(proof.commandBoundary.noSecretRead, true);
  assert(proof.safetyNotes.some((item) => item.includes("Only the planned orchestrator fixture JSON")));

  assert.strictEqual(gate.schema, "sdk-iterative-cmd-reliability-gate.v1");
  assert.strictEqual(gate.milestone, 147);
  assert.strictEqual(gate.sourceProductionReadinessArtifact, ".codex-audit/sdk-production-readiness/146-sdk-production-ready.json");
  assert.strictEqual(gate.operationArtifact, ".codex-audit/sdk-iterative-cmd/147-operation-envelope.json");
  assert.strictEqual(gate.proofArtifact, PROOF_REPO_PATH);
  assert.strictEqual(gate.verdict.iterativeCmdReliability, "passed");
  assert.strictEqual(gate.verdict.boundedMultiStepLocalCommandIteration, true);
  assert.strictEqual(gate.verdict.generalSdkWorkflow, "not-production-ready");
  assert.strictEqual(gate.operation.operationId, operation.envelope.operationId);
  assert.deepStrictEqual(gate.operation.plannedPaths, [PROOF_REPO_PATH]);
  assert.strictEqual(gate.operation.localEnvelopeValidation.allowed, true);
  assert.deepStrictEqual(gate.operation.localEnvelopeValidation.violations, []);
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
  assert.strictEqual(gate.commandExecutionEvidence.scopedContextReads.length, 2);
  assert(
    gate.commandExecutionEvidence.scopedContextReads.every(
      (item) => item.exitCode === 0 && item.status === "completed",
    ),
    "Scoped context reads must complete successfully.",
  );
  assert.deepStrictEqual(
    gate.commandExecutionEvidence.repairLoop.map((item) => item.observedExitCode),
    [1, 0],
  );
  assert.deepStrictEqual(gate.commandExecutionEvidence.disallowedCommandExecutions, []);
  assert.strictEqual(gate.postRunContract.verdict, "pass");
  assert.deepStrictEqual(gate.postRunContract.actualChangedFiles, [PROOF_REPO_PATH]);
  assert.deepStrictEqual(gate.postRunContract.outOfScopeFiles, []);
  assert.deepStrictEqual(gate.postRunContract.missingPlannedChanges, []);
  assert.deepStrictEqual(gate.postRunContract.stagedDiffNameOnly, []);
  assert.strictEqual(gate.postRunContract.packageInstallOrDependencyChurn, false);
  assert.strictEqual(gate.postRunContract.gitMutationDetected, false);
  assert.strictEqual(gate.postRunContract.liveCepAeDetected, false);
  assert.strictEqual(gate.postRunContract.secretOrCredentialPathTouched, false);
  assert.strictEqual(gate.approval.userApprovalRecorded, true);
  assert.strictEqual(gate.remainingExclusions.find((item) => item.id === "general-sdk-workflow").status, "not-production-ready");
  assert.strictEqual(gate.remainingExclusions.find((item) => item.id === "cep-panel-sdk-writes").status, "not-production-ready");

  assertNoForbiddenChangedFiles(gate.postRunContract.actualChangedFiles);
  assertNoForbiddenChangedFiles(proof.changedFiles);

  console.log("SDK iterative cmd reliability smoke: pass");
}

if (require.main === module) {
  main();
}

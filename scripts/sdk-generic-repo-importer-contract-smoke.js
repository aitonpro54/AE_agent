"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const CONTRACT_PATH = ".codex-audit/sdk-generic-repo-importer/aux-014-generic-repo-importer-contract.json";
const PLAN_PATH = ".codex-audit/sdk-generic-repo-importer/aux-014-supervisor-plan-artifact.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function assertIncludesAll(actualValues, expectedValues, label) {
  for (const expected of expectedValues) {
    assert(actualValues.includes(expected), `${label} must include ${expected}`);
  }
}

function assertFalseFlags(record, flags, label) {
  for (const flag of flags) {
    assert.strictEqual(record[flag], false, `${label}.${flag} must remain false`);
  }
}

function assertNoNamedRepoBinding(contractText) {
  assert(!contractText.includes("Dakkshin"), "generic importer contract must not contain a named source-repo binding");
  assert(!contractText.includes("dakkshin"), "generic importer contract must not contain a named source-repo binding");
}

function assertContract(contract) {
  assert.strictEqual(contract.schema, contract.machineCheck.requiredSchema);
  assert.strictEqual(contract.auxiliaryId, contract.machineCheck.requiredAuxiliaryId);
  assert.strictEqual(contract.manifestSchema.schema, contract.machineCheck.requiredManifestSchema);
  assert.strictEqual(contract.runStateLayout.root, contract.machineCheck.requiredRunStateRoot);

  assertFalseFlags(contract.scope, contract.machineCheck.requiredFalseScopeClaims, "contract.scope");
  assert.strictEqual(contract.scope.kind, "internal-tooling");
  assert.strictEqual(contract.scope.genericRepositoryOnly, true);
  assert.strictEqual(contract.scope.notProductMilestone, true);

  assertIncludesAll(
    contract.manifestSchema.requiredTopLevelFields,
    [
      "run",
      "sourceRepo",
      "targetRepo",
      "analysis",
      "implementation",
      "merge",
      "validation",
      "liveAcceptance",
      "approvals",
      "safety",
    ],
    "manifest required fields",
  );

  assert.strictEqual(contract.manifestSchema.run.constraints.codexCliOnly, true);
  assert.strictEqual(contract.manifestSchema.run.constraints.resumable, true);
  assert.strictEqual(contract.manifestSchema.run.constraints.webSearch, "disabled");
  assert.strictEqual(contract.manifestSchema.run.constraints.localOllama, false);
  assert.strictEqual(contract.manifestSchema.implementation.codexCliInvocation.engine, "codex-cli");
  assert.strictEqual(contract.manifestSchema.implementation.codexCliInvocation.approvalPolicy, "never");
  assert.strictEqual(contract.manifestSchema.implementation.codexCliInvocation.webSearch, "disabled");
  assert.strictEqual(contract.manifestSchema.implementation.codexCliInvocation.localOllama, false);

  assert.strictEqual(contract.manifestSchema.analysis.parallelizable, true);
  assert.strictEqual(contract.manifestSchema.implementation.parallelizable, true);
  assert.strictEqual(contract.manifestSchema.merge.parallelizable, false);
  assert.strictEqual(contract.manifestSchema.liveAcceptance.parallelizable, false);
  assert.deepStrictEqual(contract.manifestSchema.liveAcceptance.flow, contract.machineCheck.requiredLiveFlow);
  assert.strictEqual(contract.manifestSchema.liveAcceptance.lock, "locks/live-ae-cep.lock");
  assert.strictEqual(contract.manifestSchema.liveAcceptance.mode, "generated-only-openai-cli-when-available");
  assert(contract.manifestSchema.liveAcceptance.failClosedIf.includes("Local/Ollama or fallback provider appears in evidence"));

  assert.deepStrictEqual(contract.manifestSchema.approvals.manualUserApprovalRequiredFor, ["push", "pull_request"]);
  assertIncludesAll(
    contract.manifestSchema.approvals.automaticSafetyGatesFor,
    [
      "external repository intake",
      "parallel analysis",
      "parallel implementation worktrees",
      "controlled merge",
      "non-live validation",
      "generated-only live queue gating",
    ],
    "automatic safety gates",
  );

  assertIncludesAll(
    contract.automaticSafetyGates,
    contract.machineCheck.requiredAutomaticSafetyGates,
    "contract automatic safety gates",
  );

  assertIncludesAll(
    contract.runStateLayout.files,
    [
      "state.json",
      "events.jsonl",
      "manifest.normalized.json",
      "supervisor-plan.json",
      "analysis/tool-candidates/*.json",
      "analysis/batch-plan.json",
      "worktrees/<batch-id>/",
      "merge/supervisor-merge-plan.json",
      "validation/non-live-report.json",
      "live-queue/queue.json",
      "locks/live-ae-cep.lock",
      "final-report.json",
    ],
    "run state files",
  );
  assertIncludesAll(
    contract.runStateLayout.stateMachine,
    [
      "initialized",
      "analysis_complete",
      "implementation_running",
      "merge_complete",
      "non_live_validation_passed",
      "live_queue_running",
      "completed",
      "stopped",
    ],
    "run state machine",
  );
  assert.strictEqual(contract.runStateLayout.concurrency.mergeSupervisors, 1);
  assert.strictEqual(contract.runStateLayout.concurrency.liveAcceptance, 1);
}

function assertPlan(plan, contract) {
  assert.strictEqual(plan.schema, plan.machineCheck.requiredSchema);
  assert.strictEqual(plan.auxiliaryId, plan.machineCheck.requiredAuxiliaryId);
  assert.strictEqual(plan.sourceContract, plan.machineCheck.requiredSourceContract);
  assert.strictEqual(plan.sourceContract, CONTRACT_PATH);
  assert.strictEqual(contract.machineCheck.requiredPlanArtifactPath, PLAN_PATH);

  assert.strictEqual(plan.planOnly, true);
  assertFalseFlags(plan, plan.machineCheck.requiredFalseFlags, "plan");
  assert.strictEqual(plan.currentMilestone.label, "AUX-014");
  assertIncludesAll(plan.currentMilestone.plannedPaths, [CONTRACT_PATH, PLAN_PATH], "current planned paths");
  assertIncludesAll(
    plan.currentMilestone.validationCommands,
    plan.machineCheck.requiredCurrentValidationCommands,
    "current validation commands",
  );

  const nextLabels = plan.nextAuxMilestones.map((entry) => entry.label);
  assert.deepStrictEqual(nextLabels, plan.machineCheck.requiredNextLabels);
  for (const entry of plan.nextAuxMilestones) {
    assert(entry.id.startsWith(entry.label.toLowerCase()), `${entry.label} id must start with lower-case label`);
    assert.strictEqual(entry.runner, "codex-cli-only");
    assert.strictEqual(entry.manualUserApprovalRequired, false);
    assert(entry.stopGates.length > 0, `${entry.label} must define stop gates`);
  }

  assert.deepStrictEqual(plan.approvalPolicy.manualUserApprovalRequiredFor, ["push", "pull_request"]);
  assert.strictEqual(plan.approvalPolicy.exactSupervisorApprovalTextNeededForInternalRuns, false);
  assert.strictEqual(plan.forbiddenBoundaries.useLocalOllama, false);
  assert.strictEqual(plan.forbiddenBoundaries.runLiveCepAeInAUX014, false);
  assert.strictEqual(plan.forbiddenBoundaries.createBranchOrWorktreeInAUX014, false);
  assert.strictEqual(plan.forbiddenBoundaries.changeProductRuntime, false);
}

function main() {
  const contractText = fs.readFileSync(path.join(repo, CONTRACT_PATH), "utf8");
  assertNoNamedRepoBinding(contractText);

  const contract = JSON.parse(contractText);
  const plan = readJson(PLAN_PATH);

  assertContract(contract);
  assertPlan(plan, contract);

  console.log("SDK generic repo importer contract smoke: pass");
}

if (require.main === module) {
  main();
}

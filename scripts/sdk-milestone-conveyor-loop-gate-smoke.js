"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const GATE_PATH =
  ".codex-audit/sdk-milestone-conveyor/157-sdk-conveyor-commit-handoff-loop-gate.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function renderSamplePrompt(inputs) {
  return [
    `Продолжай в \`${inputs.cwd}\`.`,
    "",
    "Работай по-русски. Сначала прочитай UTF-8:",
    "- `AGENTS.md`",
    "- `.codex/handoff.md`",
    "- `specs/target-app.md`",
    "- targeted current SDK sections of `plans/target-app-execplan.md`",
    "",
    `${inputs.lastCompletedMilestone} завершен commit \`${inputs.lastCommitId}\` and is not pushed. Continue with the next plan-defined SDK milestone only if context is healthy. Do not run SDKThread/network without fresh explicit approval, enable CEP-panel SDK writes, perform production-code writes, run live CEP/AE, external-provider/OpenAI CLI planner, mutating-live validation, package installs, dependency changes, or push.`,
  ].join("\n");
}

function assertIncludes(list, value, label) {
  assert(Array.isArray(list), `${label} must be an array.`);
  assert(list.includes(value), `${label} must include ${value}.`);
}

function main() {
  const gate = readJson(GATE_PATH);

  assert.strictEqual(gate.schema, "sdk-conveyor-commit-handoff-loop-gate.v1");
  assert.strictEqual(gate.milestone, 157);
  assert.strictEqual(gate.localOnly, true);
  assert.strictEqual(gate.sdkThreadAllowed, false);
  assert.strictEqual(gate.networkAllowed, false);
  assert.deepStrictEqual(gate.sourceArtifacts, [
    ".codex-audit/sdk-milestone-conveyor/154-sdk-milestone-conveyor-spec.json",
    ".codex-audit/sdk-milestone-conveyor/155-sdk-milestone-conveyor-local-dry-run.json",
    ".codex-audit/sdk-milestone-conveyor/156-sdk-conveyor-sdkthread-proof.json",
  ]);

  assert.strictEqual(gate.loopContract.oneMilestonePerLoop, true);
  assert.deepStrictEqual(gate.loopContract.orderedSteps, [
    "select one queued milestone",
    "apply only milestone-owned edits",
    "run required validation",
    "create one reviewable commit",
    "update .codex/handoff.md with exact continuation state",
    "start next milestone only when context is healthy",
  ]);
  assert.strictEqual(gate.loopContract.validationBeforeCommit, true);
  assert.strictEqual(gate.loopContract.commitBeforeHandoff, true);
  assert.strictEqual(gate.loopContract.handoffAfterEveryMilestone, true);
  assert.strictEqual(gate.loopContract.autoPush, false);
  assert.strictEqual(gate.loopContract.pushPolicy, "no-push-by-default");

  const stopGateIds = gate.stopConditions.map((condition) => condition.id);
  for (const gateId of [
    "validation-failed",
    "dirty-tree-unrelated-changes",
    "dirty-tree-overlap",
    "context-pressure",
    "sdkthread-requested-without-explicit-approval",
    "forbidden-work-requested",
    "push-requested-by-conveyor",
  ]) {
    assertIncludes(stopGateIds, gateId, "stop condition ids");
  }

  assert.strictEqual(gate.dirtyTreeHandling.preCommitStatusRequired, true);
  assert.strictEqual(gate.dirtyTreeHandling.stageOnlyMilestoneOwnedFiles, true);
  assert.strictEqual(gate.dirtyTreeHandling.neverRevertUserChanges, true);
  assert.strictEqual(gate.dirtyTreeHandling.overlapRequiresStop, true);
  assert.strictEqual(gate.dirtyTreeHandling.commitMessageRequired, true);

  assert.strictEqual(
    gate.contextPressureHandoff.threshold,
    "context > 70 percent or compaction pressure felt",
  );
  assertIncludes(
    gate.contextPressureHandoff.allowedWork,
    "update .codex/handoff.md",
    "context pressure allowed work",
  );
  assertIncludes(
    gate.contextPressureHandoff.forbiddenWork,
    "new SDKThread",
    "context pressure forbidden work",
  );
  assertIncludes(
    gate.contextPressureHandoff.forbiddenWork,
    "full validation",
    "context pressure forbidden work",
  );

  assert.strictEqual(
    gate.exactNextPromptGeneration.templateId,
    "sdk-conveyor-fresh-thread-continuation.v1",
  );
  for (const inputName of [
    "cwd",
    "language",
    "readFiles",
    "lastCompletedMilestone",
    "lastCommitId",
    "nextMilestone",
    "forbiddenWork",
  ]) {
    assertIncludes(
      gate.exactNextPromptGeneration.requiredInputs,
      inputName,
      "prompt required inputs",
    );
  }
  assert.strictEqual(
    renderSamplePrompt(gate.exactNextPromptGeneration.sampleInputs),
    gate.exactNextPromptGeneration.expectedSamplePrompt,
  );
  assert.match(gate.exactNextPromptGeneration.expectedSamplePrompt, /M157 завершен/);
  assert.match(gate.exactNextPromptGeneration.expectedSamplePrompt, /not pushed/);
  assert.match(gate.exactNextPromptGeneration.expectedSamplePrompt, /fresh explicit approval/);

  assert.strictEqual(gate.proofExpectations.oneMilestoneValidationCommitHandoff, true);
  assert.strictEqual(gate.proofExpectations.exactNextPromptGenerated, true);
  assert.strictEqual(gate.proofExpectations.contextPressureStopsBeforeNextMilestone, true);
  assert.strictEqual(gate.proofExpectations.dirtyTreePolicyRecorded, true);
  assert.strictEqual(gate.proofExpectations.noAutoPush, true);

  for (const forbidden of [
    "SDKThread creation",
    "network access",
    "CEP-panel SDK write",
    "production-code SDK write",
    "live CEP/AE validation",
    "external-provider/OpenAI CLI planner validation",
    "mutating-live validation",
    "package install or dependency change",
    "push",
  ]) {
    assertIncludes(gate.notPerformed, forbidden, "notPerformed");
  }

  console.log("SDK milestone conveyor loop gate smoke: pass");
}

if (require.main === module) {
  main();
}

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const REVIEW_PATH =
  ".codex-audit/sdk-feature-conveyor/184-ae-agent-feature-conveyor-review.json";
const READINESS_PATH =
  ".codex-audit/sdk-feature-conveyor/184-ae-agent-feature-conveyor-readiness.json";
const GOVERNANCE_PATH =
  ".codex-audit/sdk-feature-conveyor/184-ae-agent-feature-conveyor-governance.json";
const QUEUE_PATH = ".codex-audit/sdk-feature-conveyor/184-dakkshin-intake-feature-queue.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function readText(repoPath) {
  return fs.readFileSync(path.join(repo, repoPath), "utf8");
}

function assertFileExists(repoPath) {
  assert(fs.existsSync(path.join(repo, repoPath)), `Expected file to exist: ${repoPath}`);
}

function assertIncludes(list, value, label) {
  assert(Array.isArray(list), `${label} must be an array.`);
  assert(list.includes(value), `${label} must include ${value}.`);
}

function assertIncludesAll(source, snippets, sourceName) {
  for (const snippet of snippets) {
    assert(source.includes(snippet), `${sourceName} must include: ${snippet}`);
  }
}

function assertFalseBoundaryFlags(artifact, boundaryPath = "sourceContext.behaviorBoundary") {
  const boundary = artifact.sourceContext?.behaviorBoundary;
  for (const flag of artifact.machineCheck.requiredFalseBoundaryFlags) {
    assert.strictEqual(
      boundary?.[flag],
      false,
      `${artifact.schema} ${boundaryPath}.${flag} must remain false.`,
    );
  }
}

function assertQueueItem(item) {
  assert.strictEqual(item.status, "queued", `${item.id} must stay queued.`);
  assert(Array.isArray(item.plannedPaths) && item.plannedPaths.length > 0);
  assertIncludes(item.stopGates, "validation-failed", `${item.id} stop gates`);
  assertIncludes(item.stopGates, "context-pressure", `${item.id} stop gates`);
}

function assertPendingQueueItem(item) {
  assertQueueItem(item);
  assert.strictEqual(item.mode, "local-only", `${item.id} must stay local-only.`);
  assert.strictEqual(
    item.executionApprovalState,
    "pending-explicit-approval",
    `${item.id} must stay pending.`,
  );
  assert.strictEqual(item.explicitApprovalText, null, `${item.id} must not carry approval text.`);
  assert.strictEqual(item.maxAiTurns, 0, `${item.id} must not allow AI turns.`);
}

function assertApprovedM186Item(item) {
  assertQueueItem(item);
  assert.strictEqual(item.id, "m186-dakkshin-intake-tool-gap-map");
  assert.strictEqual(item.mode, "local-only");
  assert.strictEqual(item.executionApprovalState, "approved");
  assert.strictEqual(
    item.explicitApprovalText,
    "I approve one SDK feature conveyor workspace-write run for the selected queued feature item planned paths only",
  );
  assert.strictEqual(item.maxAiTurns, 1);
}

function assertLiveValidationM188Item(item) {
  assertQueueItem(item);
  assert.strictEqual(item.id, "m188-dakkshin-advisory-field-validation");
  assert.strictEqual(item.mode, "local-live-validation");
  assert.strictEqual(item.executionApprovalState, "pending-explicit-approval");
  assert.strictEqual(item.explicitApprovalText, null);
  assert.strictEqual(item.maxAiTurns, 0);
  assert(item.liveValidation, "M188 item must carry separate liveValidation approval metadata.");
  assert.strictEqual(item.liveValidation.approvalState, "approved");
  assert.strictEqual(
    item.liveValidation.approvalText,
    "I approve one M188 staged live AE validation run for M187 advisory recipes using generated-only mutations",
  );
  assert.strictEqual(item.liveValidation.sdkThreadCreated, false);
  assert.strictEqual(item.liveValidation.codexCliChildCreated, false);
  assert.strictEqual(item.liveValidation.failClosedUnavailablePolicy, true);
  assertIncludes(item.allowedActions, "run generated-only M187 mutating field smoke with stable generated prefixes, read-back verification, and cleanup", `${item.id} allowed actions`);
  assertIncludes(item.forbiddenActions, "run external-provider/OpenAI CLI planner validation", `${item.id} forbidden actions`);
  assertIncludes(item.forbiddenActions, "make package/dependency changes", `${item.id} forbidden actions`);
  assertIncludes(item.forbiddenActions, "create masks, destructive project edits, audio changes, or broad comp changes", `${item.id} forbidden actions`);
  assertIncludes(item.stopGates, "project-not-saved", `${item.id} stop gates`);
  assertIncludes(item.stopGates, "generated-cleanup-leftovers", `${item.id} stop gates`);
  assertIncludes(item.stopGates, "render-queue-drift", `${item.id} stop gates`);
}

function assertLiveValidationM190Item(item) {
  assertQueueItem(item);
  assert.strictEqual(item.id, "m190-full-ui-agent-new-tools-validation");
  assert.strictEqual(item.mode, "local-live-validation");
  assert.strictEqual(item.executionApprovalState, "pending-explicit-approval");
  assert.strictEqual(item.explicitApprovalText, null);
  assert.strictEqual(item.maxAiTurns, 0);
  assert(item.liveValidation, "M190 item must carry separate liveValidation approval metadata.");
  assert.strictEqual(item.liveValidation.approvalState, "approved");
  assert.strictEqual(
    item.liveValidation.approvalText,
    "I approve one M190 Full UI Agent live conveyor validation run for new typed tools using OpenAI CLI and generated-only mutations",
  );
  assert.strictEqual(item.liveValidation.openAiCliProviderUsed, true);
  assert.strictEqual(item.liveValidation.externalProviderValidationRun, true);
  assert.strictEqual(item.liveValidation.openAiCliPlannerValidationRun, true);
  assert.strictEqual(item.liveValidation.deterministicBackendFallbackAllowed, false);
  assert.strictEqual(item.liveValidation.localProviderFallbackAllowed, false);
  assert.strictEqual(item.liveValidation.openRouterFallbackAllowed, false);
  assertIncludes(item.allowedActions, "run Full UI Agent validation through CDP with provider openai-cli, model gpt-5.5, and Agent mode", `${item.id} allowed actions`);
  assertIncludes(item.allowedActions, "require the panel-generated plan to cover create_comp, create_project_folder, list_project_folder_items, move_project_items_to_folder, and create_camera_layer", `${item.id} allowed actions`);
  assertIncludes(item.forbiddenActions, "accept deterministic backend fallback as live validation evidence", `${item.id} forbidden actions`);
  assertIncludes(item.forbiddenActions, "fall back to ollama-local, Local/Ollama, OpenRouter, or openrouter/free planners", `${item.id} forbidden actions`);
  assertIncludes(item.stopGates, "openai-cli-not-ready", `${item.id} stop gates`);
  assertIncludes(item.stopGates, "panel-generated-plan-missing-required-typed-tools", `${item.id} stop gates`);
  assertIncludes(item.stopGates, "deterministic-backend-fallback-attempted", `${item.id} stop gates`);
  assertIncludes(item.stopGates, "ollama-openrouter-fallback-attempted", `${item.id} stop gates`);
}

function assertLiveValidationM191Item(item) {
  assertQueueItem(item);
  assert.strictEqual(item.id, "m191-mask-safety-live-validation");
  assert.strictEqual(item.mode, "local-live-validation");
  assert.strictEqual(item.executionApprovalState, "pending-explicit-approval");
  assert.strictEqual(item.explicitApprovalText, null);
  assert.strictEqual(item.maxAiTurns, 0);
  assert(item.liveValidation, "M191 item must carry separate liveValidation approval metadata.");
  assert.strictEqual(item.liveValidation.approvalState, "approved");
  assert.strictEqual(
    item.liveValidation.approvalText,
    "I approve one M191 live CEP AE validation run for generated-only mask safety checks inside After Effects",
  );
  assert.strictEqual(item.liveValidation.openAiCliProviderUsed, true);
  assert.strictEqual(item.liveValidation.externalProviderValidationRun, true);
  assert.strictEqual(item.liveValidation.openAiCliPlannerValidationRun, true);
  assert.strictEqual(item.liveValidation.deterministicBackendFallbackAllowed, false);
  assert.strictEqual(item.liveValidation.localProviderFallbackAllowed, false);
  assert.strictEqual(item.liveValidation.openRouterFallbackAllowed, false);
  assertIncludes(item.allowedActions, "run Full UI Agent validation through CDP with provider openai-cli, model gpt-5.5, and Agent mode", `${item.id} allowed actions`);
  assertIncludes(item.allowedActions, "require the panel-generated plan to cover create_comp, create_solid_layer, create_layer_mask, and get_layer_details", `${item.id} allowed actions`);
  assertIncludes(item.forbiddenActions, "accept deterministic backend fallback as live validation evidence", `${item.id} forbidden actions`);
  assertIncludes(item.forbiddenActions, "fall back to ollama-local, Local/Ollama, OpenRouter, or openrouter/free planners", `${item.id} forbidden actions`);
  assertIncludes(item.forbiddenActions, "delete masks, invert masks, edit arbitrary existing mask paths, mutate user assets, create destructive project edits, audio changes, or broad comp changes", `${item.id} forbidden actions`);
  assertIncludes(item.stopGates, "openai-cli-not-ready", `${item.id} stop gates`);
  assertIncludes(item.stopGates, "active-comp-unavailable", `${item.id} stop gates`);
  assertIncludes(item.stopGates, "panel-generated-plan-missing-required-typed-tools", `${item.id} stop gates`);
  assertIncludes(item.stopGates, "deterministic-backend-fallback-attempted", `${item.id} stop gates`);
  assertIncludes(item.stopGates, "ollama-openrouter-fallback-attempted", `${item.id} stop gates`);
  assertIncludes(item.stopGates, "generated-cleanup-leftovers", `${item.id} stop gates`);
}

function main() {
  const review = readJson(REVIEW_PATH);
  const readiness = readJson(READINESS_PATH);
  const governance = readJson(GOVERNANCE_PATH);
  const queue = readJson(QUEUE_PATH);
  const current = readJson(".codex-audit/sdk-current-state.json");
  const packageJson = readJson("package.json");
  const readme = readText("orchestrator/README.md");
  const policy = readText("orchestrator/adapters/ae-agent-sdk-policy.mjs");

  assert.strictEqual(review.schema, "sdk-feature-conveyor-review.v1");
  assert.strictEqual(readiness.schema, "sdk-feature-conveyor-readiness.v1");
  assert.strictEqual(governance.schema, "sdk-feature-conveyor-governance.v1");
  assert.strictEqual(queue.schema, "sdk-ae-agent-feature-conveyor-queue.v1");
  assert.strictEqual(review.milestone, 184);
  assert.strictEqual(readiness.sourceReviewPacket, REVIEW_PATH);
  assert.strictEqual(readiness.queueArtifact, QUEUE_PATH);
  assert.deepStrictEqual(governance.sourcePackets, [REVIEW_PATH, READINESS_PATH, QUEUE_PATH]);

  assertFalseBoundaryFlags(review);
  assertFalseBoundaryFlags(queue);
  for (const field of governance.machineCheck.requiredFalseFields) {
    assert.strictEqual(governance[field], false, `${field} must remain false.`);
  }

  assert.strictEqual(review.reviewedLane.featureExecutionApproved, false);
  assert.strictEqual(readiness.featureExecutionApproved, false);
  assert.strictEqual(governance.featureConveyorExecutionApproved, false);
  assert.strictEqual(governance.dakkshinFeatureImplementationApproved, false);
  assert.strictEqual(queue.commandRunner.executionApprovedNow, true);
  assert.strictEqual(queue.commandRunner.sdkThreadCreatedByDryRun, false);
  assert.strictEqual(queue.commandRunner.sdkThreadCreatedByLiveValidation, false);
  assert.strictEqual(queue.commandRunner.autoCommit, false);
  assert.strictEqual(queue.commandRunner.autoPush, false);
  assert.strictEqual(
    queue.commandRunner.validateLiveRequiresExactApprovalText,
    "I approve one M188 staged live AE validation run for M187 advisory recipes using generated-only mutations",
  );
  assert.strictEqual(
    queue.commandRunner.m190ValidateLiveRequiresExactApprovalText,
    "I approve one M190 Full UI Agent live conveyor validation run for new typed tools using OpenAI CLI and generated-only mutations",
  );
  assert.strictEqual(
    queue.commandRunner.m191ValidateLiveRequiresExactApprovalText,
    "I approve one M191 live CEP AE validation run for generated-only mask safety checks inside After Effects",
  );

  assert.deepStrictEqual(
    queue.queueItems.map((item) => item.id),
    [
      "m185-dakkshin-intake-scope-brief",
      "m186-dakkshin-intake-tool-gap-map",
      "m187-dakkshin-intake-implementation-slice-plan",
      "m188-dakkshin-advisory-field-validation",
      "m190-full-ui-agent-new-tools-validation",
      "m191-mask-safety-live-validation",
    ],
  );
  for (const item of queue.queueItems) {
    if (item.id === "m186-dakkshin-intake-tool-gap-map") {
      assertApprovedM186Item(item);
    } else if (item.id === "m188-dakkshin-advisory-field-validation") {
      assertLiveValidationM188Item(item);
    } else if (item.id === "m190-full-ui-agent-new-tools-validation") {
      assertLiveValidationM190Item(item);
    } else if (item.id === "m191-mask-safety-live-validation") {
      assertLiveValidationM191Item(item);
    } else {
      assertPendingQueueItem(item);
    }
    assert(
      item.plannedPaths.every((repoPath) => !repoPath.startsWith("cep-panel/")),
      `${item.id} must not plan CEP-panel paths.`,
    );
    if (item.mode !== "local-live-validation") {
      assertIncludes(
        item.forbiddenActions,
        "run live CEP/After Effects validation",
        `${item.id} forbidden actions`,
      );
    }
  }

  assertIncludes(
    queue.globalStopGates,
    "no-dakkshin-implementation-in-m184",
    "global stop gates",
  );
  assertIncludes(queue.globalStopGates, "no-cep-panel-sdk-write", "global stop gates");
  assertIncludes(
    queue.globalStopGates,
    "no-live-cep-ae-outside-approved-live-validation-items",
    "global stop gates",
  );
  assertIncludes(
    queue.globalStopGates,
    "no-external-provider-openai-cli-planner-outside-approved-m190-m191-live-validation",
    "global stop gates",
  );
  assertIncludes(
    queue.globalStopGates,
    "no-ollama-openrouter-fallback-for-full-ui-agent-live-validation",
    "global stop gates",
  );
  assertIncludes(
    queue.globalStopGates,
    "no-mutating-live-outside-generated-approved-live-validation-lanes",
    "global stop gates",
  );
  assertIncludes(queue.globalStopGates, "no-package-install", "global stop gates");
  assertIncludes(queue.globalStopGates, "no-dependency-change", "global stop gates");
  assertIncludes(queue.globalStopGates, "no-push-by-default", "global stop gates");

  for (const repoPath of [
    REVIEW_PATH,
    READINESS_PATH,
    GOVERNANCE_PATH,
    QUEUE_PATH,
    "orchestrator/run-ae-agent-feature-conveyor.mjs",
    "scripts/sdk-ae-agent-feature-conveyor-readiness-smoke.js",
    "scripts/sdk-ae-agent-feature-conveyor-command-smoke.js",
  ]) {
    assertFileExists(repoPath);
  }

  for (const [scriptName, command] of Object.entries(queue.machineCheck.requiredPackageScripts)) {
    assert.strictEqual(packageJson.scripts?.[scriptName], command, `${scriptName} mismatch`);
  }
  for (const [scriptName, command] of Object.entries(readiness.machineCheck.requiredPackageScripts)) {
    assert.strictEqual(packageJson.scripts?.[scriptName], command, `${scriptName} mismatch`);
  }

  assertIncludesAll(readme, queue.machineCheck.requiredReadmeSnippets, "README");
  for (const [repoPath, snippets] of Object.entries(queue.machineCheck.requiredSourceSnippets)) {
    assertIncludesAll(readText(repoPath), snippets, repoPath);
  }

  assert(policy.includes("featureConveyorReviewSchema"));
  assert(policy.includes("currentFeatureConveyorPackets"));
  assert(
    current.currentDirectCheckSets.some(
      (entry) => entry.id === "m184-feature-conveyor-readiness",
    ),
    "current SDK state must include M184 feature conveyor readiness.",
  );
  assertIncludes(
    current.machineCheck.requiredCurrentSetIds,
    "m184-feature-conveyor-readiness",
    "current required set ids",
  );

  console.log("SDK AE Agent feature conveyor readiness smoke: pass");
}

if (require.main === module) {
  main();
}

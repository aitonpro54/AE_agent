"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const CONTRACT_PATH = ".codex-audit/sdk-feature-conveyor/dakkshin-intake/m220-dakkshin-risky-typed-tools-safety-contract.json";
const QUEUE_PATH = ".codex-audit/sdk-roadmap-supervisor/220-dakkshin-typed-tools-queue.json";
const QUEUE_ITEM_ID = "m220-dakkshin-risky-tools-safety-contract";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function sameMembers(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && expected.every((value) => actual.includes(value));
}

function requireTrue(errors, value, label) {
  if (value !== true) errors.push(`${label} must be true`);
}

function requireFalse(errors, value, label) {
  if (value !== false) errors.push(`${label} must be false`);
}

function requireIncludes(errors, values, expected, label) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    errors.push(`${label} must include ${expected}`);
  }
}

function requireSameMembers(errors, values, expected, label) {
  if (!sameMembers(values, expected)) {
    errors.push(`${label} must be exactly ${expected.join(", ")}`);
  }
}

function getTool(contract, toolName, errors) {
  const tool = Array.isArray(contract.toolContracts)
    ? contract.toolContracts.find((candidate) => candidate.toolName === toolName)
    : null;
  if (!tool) errors.push(`missing tool contract ${toolName}`);
  return tool || {};
}

function validateContract(contract, queue) {
  const errors = [];
  assert(contract && typeof contract === "object", "contract must be an object");
  assert(queue && typeof queue === "object", "queue must be an object");

  const machine = contract.machineCheck || {};
  if (contract.schema !== machine.requiredSchema) errors.push("schema must match machineCheck.requiredSchema");
  if (contract.milestone !== machine.requiredMilestone) errors.push("milestone must match machineCheck.requiredMilestone");
  if (!contract.source || contract.source.queuePath !== QUEUE_PATH) errors.push("source queuePath must target M220 queue");
  if (!contract.source || contract.source.queueItemId !== QUEUE_ITEM_ID) errors.push("source queueItemId must target M220 item");
  requireTrue(errors, contract.source && contract.source.notRuntimeImplementation, "source.notRuntimeImplementation");
  requireTrue(errors, contract.source && contract.source.notLiveValidation, "source.notLiveValidation");

  const queueItem = Array.isArray(queue.queueItems)
    ? queue.queueItems.find((item) => item.id === QUEUE_ITEM_ID)
    : null;
  if (!queueItem) {
    errors.push("queue must include M220 item");
  } else {
    requireIncludes(errors, queueItem.plannedPaths, CONTRACT_PATH, "M220 plannedPaths");
    requireIncludes(errors, queueItem.plannedPaths, machine.requiredSmokeScript, "M220 plannedPaths");
    requireIncludes(errors, queueItem.validationCommands, `node --check ${machine.requiredSmokeScript}`, "M220 validationCommands");
    requireIncludes(errors, queueItem.validationCommands, `node ${machine.requiredSmokeScript}`, "M220 validationCommands");
    requireIncludes(errors, queueItem.forbiddenActions, "implement runtime typed tools in M220", "M220 forbiddenActions");
    requireIncludes(errors, queueItem.forbiddenActions, "edit CEP panel files", "M220 forbiddenActions");
    requireIncludes(errors, queueItem.forbiddenActions, "run live AE/CEP validation", "M220 forbiddenActions");
    requireIncludes(errors, queueItem.forbiddenActions, "mutate user assets", "M220 forbiddenActions");
  }

  for (const claim of machine.requiredFalseBoundaryClaims || []) {
    requireFalse(errors, contract.boundaryClaims && contract.boundaryClaims[claim], `boundaryClaims.${claim}`);
  }

  requireSameMembers(
    errors,
    (contract.toolContracts || []).map((tool) => tool.toolName),
    machine.requiredToolNames || [],
    "toolContracts tool names"
  );

  const deleteLayer = getTool(contract, "delete_layer", errors);
  requireTrue(errors, deleteLayer.risk && deleteLayer.risk.m100Required, "delete_layer.risk.m100Required");
  if (!deleteLayer.risk || deleteLayer.risk.m100RiskLevel !== machine.deleteLayerRequiredRiskLevel) {
    errors.push("delete_layer must be M100 destructive");
  }
  requireTrue(errors, deleteLayer.targeting && deleteLayer.targeting.explicitCompTargetRequired, "delete_layer explicit comp target");
  requireTrue(errors, deleteLayer.targeting && deleteLayer.targeting.oneExplicitLayerOnly, "delete_layer one explicit layer");
  requireTrue(errors, deleteLayer.targeting && deleteLayer.targeting.expectedLayerNameGuardRequired, "delete_layer expected layer name guard");
  requireFalse(errors, deleteLayer.targeting && deleteLayer.targeting.bulkTargetingAllowed, "delete_layer bulk targeting");
  requireFalse(errors, deleteLayer.targeting && deleteLayer.targeting.selectionBasedTargetingAllowed, "delete_layer selection targeting");
  requireFalse(errors, deleteLayer.targeting && deleteLayer.targeting.nameOnlyTargetingAllowed, "delete_layer name-only targeting");
  requireIncludes(errors, deleteLayer.targeting && deleteLayer.targeting.requiredFields, "layerIndex", "delete_layer requiredFields");
  requireIncludes(errors, deleteLayer.targeting && deleteLayer.targeting.requiredFields, "expectedLayerName", "delete_layer requiredFields");
  requireTrue(errors, deleteLayer.requiredReadBack && deleteLayer.requiredReadBack.beforeLayerSummary, "delete_layer before read-back");
  requireTrue(errors, deleteLayer.requiredReadBack && deleteLayer.requiredReadBack.afterLayerSummary, "delete_layer after read-back");
  requireTrue(errors, deleteLayer.semanticVerification && deleteLayer.semanticVerification.absenceVerificationRequired, "delete_layer semantic absence");
  requireTrue(errors, deleteLayer.semanticVerification && deleteLayer.semanticVerification.missingReadBackFailsClosed, "delete_layer missing read-back fail-closed");
  for (const rejection of ["locked_layer", "out_of_range_layer", "bulk_delete_request", "missing_expected_layer_name"]) {
    requireIncludes(errors, deleteLayer.requiredRejections, rejection, "delete_layer requiredRejections");
  }

  const compProps = getTool(contract, "set_comp_properties", errors);
  requireTrue(errors, compProps.targeting && compProps.targeting.explicitCompTargetRequired, "set_comp_properties explicit comp target");
  requireTrue(errors, compProps.targeting && compProps.targeting.oneExplicitCompositionOnly, "set_comp_properties one explicit comp");
  requireFalse(errors, compProps.targeting && compProps.targeting.activeCompFallbackAllowed, "set_comp_properties active comp fallback");
  requireFalse(errors, compProps.targeting && compProps.targeting.bulkCompositionTargetingAllowed, "set_comp_properties bulk comp targeting");
  requireSameMembers(errors, compProps.allowedUpdateFields, machine.setCompPropertiesAllowedFields || [], "set_comp_properties allowedUpdateFields");
  requireTrue(errors, compProps.requiredReadBack && compProps.requiredReadBack.beforeCompSummary, "set_comp_properties before read-back");
  requireTrue(errors, compProps.requiredReadBack && compProps.requiredReadBack.afterCompSummary, "set_comp_properties after read-back");
  requireTrue(errors, compProps.semanticVerification && compProps.semanticVerification.mustVerifyOnlyRequestedFieldsChanged, "set_comp_properties only requested fields");
  requireTrue(errors, compProps.semanticVerification && compProps.semanticVerification.missingReadBackFailsClosed, "set_comp_properties missing read-back fail-closed");
  for (const rejection of ["empty_update", "unknown_update_field", "multiple_comp_targets", "arbitrary_comp_property_path"]) {
    requireIncludes(errors, compProps.requiredRejections, rejection, "set_comp_properties requiredRejections");
  }

  const mask = getTool(contract, "set_layer_mask", errors);
  requireTrue(errors, mask.targeting && mask.targeting.explicitCompTargetRequired, "set_layer_mask explicit comp target");
  requireTrue(errors, mask.targeting && mask.targeting.oneExplicitLayerOnly, "set_layer_mask one explicit layer");
  requireFalse(errors, mask.targeting && mask.targeting.bulkLayerTargetingAllowed, "set_layer_mask bulk layer targeting");
  requireFalse(errors, mask.targeting && mask.targeting.selectionBasedTargetingAllowed, "set_layer_mask selection targeting");
  requireSameMembers(errors, mask.operationPolicy && mask.operationPolicy.supportedOperations, machine.setLayerMaskSupportedOperations || [], "set_layer_mask operations");
  requireFalse(errors, mask.operationPolicy && mask.operationPolicy.deleteOperationAllowed, "set_layer_mask delete operation");
  requireFalse(errors, mask.operationPolicy && mask.operationPolicy.bulkMaskOperationsAllowed, "set_layer_mask bulk mask operation");
  requireFalse(errors, mask.operationPolicy && mask.operationPolicy.rotoOperationsAllowed, "set_layer_mask roto operation");
  requireFalse(errors, mask.operationPolicy && mask.operationPolicy.arbitraryMaskPropertyPathsAllowed, "set_layer_mask arbitrary mask paths");
  requireTrue(errors, mask.operationPolicy && mask.operationPolicy.updateRequiresExplicitMaskTarget, "set_layer_mask explicit mask target for update");
  for (const field of machine.setLayerMaskBoundedFields || []) {
    requireTrue(errors, mask.boundedFields && mask.boundedFields[field] && mask.boundedFields[field].allowed, `set_layer_mask bounded field ${field}`);
  }
  requireTrue(errors, mask.requiredReadBack && mask.requiredReadBack.beforeMaskSummary, "set_layer_mask before read-back");
  requireTrue(errors, mask.requiredReadBack && mask.requiredReadBack.afterMaskSummary, "set_layer_mask after read-back");
  requireTrue(errors, mask.semanticVerification && mask.semanticVerification.mustVerifyCreatedOrUpdatedMaskAfterReadBack, "set_layer_mask semantic read-back");
  requireTrue(errors, mask.semanticVerification && mask.semanticVerification.missingReadBackFailsClosed, "set_layer_mask missing read-back fail-closed");
  for (const rejection of ["missing_mask_target_for_update", "delete_mask_request", "bulk_mask_request", "roto_request", "arbitrary_mask_path"]) {
    requireIncludes(errors, mask.requiredRejections, rejection, "set_layer_mask requiredRejections");
  }

  const live = contract.liveAcceptanceContract || {};
  requireTrue(errors, live.parentOwned, "liveAcceptanceContract.parentOwned");
  requireTrue(errors, live.runOnlyWhenLiveStackAvailable, "liveAcceptanceContract.runOnlyWhenLiveStackAvailable");
  if (live.mode !== "generated-only-full-ui-agent-openai-cli") errors.push("live acceptance must be generated-only Full UI Agent OpenAI CLI");
  if (live.provider !== "openai-cli") errors.push("live acceptance provider must be openai-cli");
  requireTrue(errors, live.installedPanelRequired, "liveAcceptanceContract.installedPanelRequired");
  requireTrue(errors, live.panelGeneratedPlanRequired, "liveAcceptanceContract.panelGeneratedPlanRequired");
  requireTrue(errors, live.dryRunRequired, "liveAcceptanceContract.dryRunRequired");
  requireTrue(errors, live.protectedRunRequired, "liveAcceptanceContract.protectedRunRequired");
  requireTrue(errors, live.bridgeReadBackRequired, "liveAcceptanceContract.bridgeReadBackRequired");
  requireTrue(errors, live.generatedCleanupRequired, "liveAcceptanceContract.generatedCleanupRequired");
  requireFalse(errors, live.userAssetMutationAllowed, "liveAcceptanceContract.userAssetMutationAllowed");
  if (live.semanticVerificationStatusRequired !== "passed") errors.push("live acceptance must require semantic status passed");
  for (const failClosed of machine.requiredLiveFailClosedOn || []) {
    requireIncludes(errors, live.failClosedOn, failClosed, "live failClosedOn");
  }

  return errors;
}

function assertValid(contract, queue, label) {
  const errors = validateContract(contract, queue);
  assert.deepStrictEqual(errors, [], `${label} failed:\n${errors.join("\n")}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertMissingClauseFails(contract, queue, mutate, expectedSnippet) {
  const candidate = clone(contract);
  mutate(candidate);
  const errors = validateContract(candidate, queue);
  assert(errors.some((error) => error.includes(expectedSnippet)), `missing clause must fail closed for ${expectedSnippet}`);
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const queue = readJson(QUEUE_PATH);

  assertValid(contract, queue, "M220 Dakkshin risky typed-tools safety contract");

  assertMissingClauseFails(
    contract,
    queue,
    (candidate) => {
      const tool = candidate.toolContracts.find((item) => item.toolName === "delete_layer");
      tool.targeting.expectedLayerNameGuardRequired = false;
    },
    "expected layer name guard"
  );
  assertMissingClauseFails(
    contract,
    queue,
    (candidate) => {
      const tool = candidate.toolContracts.find((item) => item.toolName === "set_comp_properties");
      tool.allowedUpdateFields.push("name");
    },
    "allowedUpdateFields"
  );
  assertMissingClauseFails(
    contract,
    queue,
    (candidate) => {
      const tool = candidate.toolContracts.find((item) => item.toolName === "set_layer_mask");
      tool.operationPolicy.deleteOperationAllowed = true;
    },
    "delete operation"
  );
  assertMissingClauseFails(
    contract,
    queue,
    (candidate) => {
      candidate.liveAcceptanceContract.failClosedOn = candidate.liveAcceptanceContract.failClosedOn.filter((item) => item !== "generated_leftovers");
    },
    "generated_leftovers"
  );

  console.log(JSON.stringify({
    ok: true,
    checked: [
      "M220 queue binds contract and smoke planned paths",
      "boundary claims remain false",
      "delete_layer destructive M100 contract",
      "set_comp_properties narrow field contract",
      "set_layer_mask create/update bounded mask contract",
      "generated-only parent-owned OpenAI CLI live acceptance contract",
      "missing required clauses fail closed"
    ]
  }, null, 2));
}

main();

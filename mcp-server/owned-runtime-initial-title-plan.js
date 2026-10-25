"use strict";

// Pure descriptors for the first two retained native title states. This module
// never issues a native cap, reads a project/file, dispatches AE/AME or joins M100.
const path = require("node:path");
const ame = require("./ame-title-jobs");
const variants = require("./native-render-variant");
const FACTS_SCHEMA = "ae-agent.owned-runtime-initial-title-facts.v1";
const PLAN_SCHEMA = "ae-agent.owned-runtime-initial-title-plan.v1";
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const builtTables = new WeakSet(); // Local data provenance only; never authority.
const MISSING = Object.freeze({
  checkpoint: "owned_title_plan_fixed_ram_checkpoint_contract_missing",
  clean_copy: "owned_title_plan_fixed_clean_copy_contract_missing",
  stage: "owned_title_plan_fixed_immutable_stage_contract_missing",
  restore: "owned_title_plan_fixed_restoration_contract_missing"
});
function fail(code) { throw Object.assign(new Error(code), { code, closed: true }); }
function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("owned_title_plan_invalid_facts");
  const own = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key) ||
      !Object.hasOwn(descriptors[key], "value") || !descriptors[key].enumerable)) fail("owned_title_plan_invalid_facts");
}
function list(value, min, max) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length < min || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) fail("owned_title_plan_invalid_facts");
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) fail("owned_title_plan_invalid_facts");
  }
  return value;
}
function integer(value, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum) fail("owned_title_plan_invalid_facts");
  return value;
}
function text(value, maximum) {
  if (typeof value !== "string" || !value || value !== value.trim() ||
      value.length > maximum || /[\x00-\x1f\x7f]/.test(value)) fail("owned_title_plan_invalid_facts");
  return value;
}
function sha(value) {
  if (typeof value !== "string" || !SHA.test(value) || /^0{64}$/.test(value)) fail("owned_title_plan_missing_hash_provenance");
  return value;
}
function projectFile(value) {
  text(value, 4096);
  if ((!/^[A-Za-z]:[\\/]/.test(value) && !(process.platform !== "win32" && path.posix.isAbsolute(value))) ||
      /^(?:\\\\|\/\/)/.test(value) || value.replace(/\\/g, "/").split("/").some(part => part === "." || part === "..") ||
      !/\.aep$/i.test(value)) fail("owned_title_plan_invalid_project_path");
  return value;
}
const samePath = (a, b) => a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
function nullable(value, validate) { return value === null ? null : validate(value); }
function uuid(value) {
  if (typeof value !== "string" || !UUID.test(value)) fail("owned_title_plan_invalid_runtime_id");
  return value;
}
function range(value) {
  exact(value, ["startFrame", "frameCount", "fpsNumerator", "fpsDenominator"]);
  const result = { startFrame: integer(value.startFrame, 0), frameCount: integer(value.frameCount),
    fpsNumerator: integer(value.fpsNumerator), fpsDenominator: integer(value.fpsDenominator) };
  if (!Number.isSafeInteger(result.startFrame + result.frameCount) ||
      !Number.isSafeInteger(result.startFrame * result.fpsDenominator) ||
      !Number.isSafeInteger((result.startFrame + result.frameCount) * result.fpsDenominator)) fail("owned_title_plan_invalid_frame_range");
  return result;
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function normalizeFacts(raw) {
  exact(raw, ["schema", "sourceProject", "baseline", "selectedTextLayerIDs", "variants", "ame"]);
  if (raw.schema !== FACTS_SCHEMA) fail("owned_title_plan_facts_schema_required");
  exact(raw.sourceProject, ["file", "sha25664"]);
  const sourceProject = { file: projectFile(raw.sourceProject.file), sha25664: sha(raw.sourceProject.sha25664) };
  exact(raw.baseline, ["revision", "graphSha25664", "rootCompItemId", "variantCompItemId", "controlled"]);
  const controlled = list(raw.baseline.controlled, 2, 64).map(row => {
    exact(row, ["id", "contentSha25664", "enabled"]);
    if (typeof row.enabled !== "boolean") fail("owned_title_plan_invalid_baseline_enabled");
    return { id: integer(row.id), contentSha25664: sha(row.contentSha25664), enabled: row.enabled };
  });
  const ids = controlled.map(row => row.id);
  if (new Set(ids).size !== ids.length) fail("owned_title_plan_duplicate_controlled_id");
  const baseline = { revision: integer(raw.baseline.revision, 0), graphSha25664: sha(raw.baseline.graphSha25664),
    rootCompItemId: integer(raw.baseline.rootCompItemId), variantCompItemId: integer(raw.baseline.variantCompItemId), controlled };
  const selectedTextLayerIDs = list(raw.selectedTextLayerIDs, 2, 2).map(id => integer(id));
  if (selectedTextLayerIDs[0] === selectedTextLayerIDs[1] || selectedTextLayerIDs.some(id => !ids.includes(id))) fail("owned_title_plan_selected_id_not_controlled");
  // Order is the retained native predicate's order; IDs are never sorted to
  // invent "first two". This cannot independently attest inventory completeness.
  const frozenVariants = list(raw.variants, 2, 2).map((row, index) => {
    exact(row, ["slot", "variantId", "workingProjectFile", "snapshotProjectFile", "outputFileName", "range"]);
    if (row.slot !== index + 1) fail("owned_title_plan_exact_variant_slots_required");
    return { slot: row.slot, variantId: text(row.variantId, 120), workingProjectFile: projectFile(row.workingProjectFile), snapshotProjectFile: projectFile(row.snapshotProjectFile),
      outputFileName: text(row.outputFileName, 96), range: range(row.range) };
  });
  if (samePath(frozenVariants[0].snapshotProjectFile, frozenVariants[1].snapshotProjectFile) ||
      frozenVariants.some(row => samePath(row.snapshotProjectFile, sourceProject.file)) ||
      frozenVariants[0].variantId === frozenVariants[1].variantId ||
      frozenVariants[0].outputFileName.toLowerCase() === frozenVariants[1].outputFileName.toLowerCase()) fail("owned_title_plan_distinct_variant_bindings_required");
  const projectSelectors=[sourceProject.file,...frozenVariants.flatMap(row=>[row.workingProjectFile,row.snapshotProjectFile])];
  for(let i=0;i<projectSelectors.length;i++)for(let j=0;j<i;j++)if(samePath(projectSelectors[i],projectSelectors[j]))fail("owned_title_plan_distinct_variant_bindings_required");
  try {
    variants.validateInput(variants.INSPECT, { expectedProjectFile: sourceProject.file,
      rootCompItemId: baseline.rootCompItemId, variantCompItemId: baseline.variantCompItemId, controlledLayerIds: ids,
      variants: frozenVariants.map((row, index) => ({ variantId: row.variantId, activeLayerIds: [selectedTextLayerIDs[index]], outputFileName: row.outputFileName })) });
  } catch (_) { fail("owned_title_plan_existing_inspection_contract_closed"); }
  if (frozenVariants.some(row => !/\.mov$/i.test(row.outputFileName))) fail("owned_title_plan_mov_output_required");
  let ameFacts = null;
  if (raw.ame !== null) {
    exact(raw.ame, ["targetSpecifier", "expectedProcess", "expectedSessionNonce", "presetId", "presetSha25664", "timeoutMs", "slots"]);
    exact(raw.ame.expectedProcess, ["pid", "startedAt"]);
    if (!/^ame-[0-9]{1,3}\.[0-9]{1,3}$/.test(text(raw.ame.targetSpecifier, 512)) ||
        !(raw.ame.expectedSessionNonce===null||/^[A-Za-z0-9._-]{1,128}$/.test(text(raw.ame.expectedSessionNonce, 128))) ||
        typeof raw.ame.presetId !== "string" || !/^amep_[a-f0-9]{40}$/.test(raw.ame.presetId) || typeof raw.ame.expectedProcess.startedAt !== "string" ||
        !Number.isFinite(Date.parse(raw.ame.expectedProcess.startedAt)) ||
        !Number.isSafeInteger(raw.ame.timeoutMs) || raw.ame.timeoutMs < 1000 || raw.ame.timeoutMs > 10000) fail("owned_title_plan_invalid_ame_provenance");
    const slots = list(raw.ame.slots, 2, 2).map((row, index) => {
      exact(row, ["slot", "batchId", "sourceProjectFile", "expectedSourceSha25664", "sourceGuid", "queueManifestSha25664", "completedOwnedPrefix"]);
      if (row.slot !== index + 1) fail("owned_title_plan_exact_ame_slots_required");
      const sourceFile = nullable(row.sourceProjectFile, projectFile);
      if (sourceFile !== null && !samePath(sourceFile, frozenVariants[index].snapshotProjectFile)) fail("owned_title_plan_foreign_snapshot_source");
      const prefix = nullable(row.completedOwnedPrefix, value => list(value, 0, 1).map(ref => {
        exact(ref, ["batchId", "jobId"]); return { batchId: uuid(ref.batchId), jobId: uuid(ref.jobId) };
      }));
      return { slot: row.slot, batchId: nullable(row.batchId, uuid), sourceProjectFile: sourceFile,
        expectedSourceSha25664: nullable(row.expectedSourceSha25664, sha), sourceGuid: nullable(row.sourceGuid, value => text(value, 160)),
        queueManifestSha25664: nullable(row.queueManifestSha25664, sha), completedOwnedPrefix: prefix };
    });
    if (slots[0].batchId !== null && slots[0].batchId === slots[1].batchId) fail("owned_title_plan_distinct_batch_ids_required");
    if (slots[0].completedOwnedPrefix?.length || slots[1].completedOwnedPrefix?.some(ref => slots[0].batchId === null || ref.batchId !== slots[0].batchId)) fail("owned_title_plan_foreign_completed_prefix");
    ameFacts = { targetSpecifier: raw.ame.targetSpecifier,
      expectedProcess: { pid: integer(raw.ame.expectedProcess.pid), startedAt: raw.ame.expectedProcess.startedAt },
      expectedSessionNonce: raw.ame.expectedSessionNonce, presetId: raw.ame.presetId, presetSha25664: sha(raw.ame.presetSha25664),
      timeoutMs: raw.ame.timeoutMs, slots };
  }
  return { schema: FACTS_SCHEMA, sourceProject, baseline, selectedTextLayerIDs, variants: frozenVariants, ame: ameFacts };
}
function ameDescriptor(facts, operation, slot) {
  const provenance = facts.ame, binding = provenance?.slots[slot - 1];
  const required = operation === "enqueue" ? ["batchId", "sourceProjectFile", "expectedSourceSha25664", "sourceGuid"] :
    ["batchId", "queueManifestSha25664", "completedOwnedPrefix"];
  if (!binding || required.some(key => binding[key] === null) ||
      operation === "start" && slot === 2 && binding.completedOwnedPrefix.length !== 1) {
    return { status: "CLOSED", code: "owned_title_plan_actual_ame_" + operation + "_provenance_missing", args: null, argsHash: null };
  }
  const common = { targetSpecifier: provenance.targetSpecifier, expectedProcess: provenance.expectedProcess,
    ...(typeof provenance.expectedSessionNonce==="string"?{expectedSessionNonce:provenance.expectedSessionNonce}:{}), timeoutMs: provenance.timeoutMs, batchId: binding.batchId };
  const frameRange = facts.variants[slot - 1].range;
  const tool = operation === "enqueue" ? ame.ENQUEUE : ame.START;
  const raw = operation === "enqueue" ? { ...common, sourceProjectFile: binding.sourceProjectFile,
    expectedSourceSha25664: binding.expectedSourceSha25664, sourceGuid: binding.sourceGuid,
    presetId: provenance.presetId, presetSha25664: provenance.presetSha25664, outputFileName: facts.variants[slot - 1].outputFileName,
    range: { startSeconds: frameRange.startFrame * frameRange.fpsDenominator / frameRange.fpsNumerator,
      endSeconds: (frameRange.startFrame + frameRange.frameCount) * frameRange.fpsDenominator / frameRange.fpsNumerator } } :
    { ...common, manualQueueMode: "cep_user_declaration_v2", manualQueueManifestSha25664: binding.queueManifestSha25664,
      completedOwnedPrefix: binding.completedOwnedPrefix };
  try {
    const args = ame.validateInput(tool, raw);
    return { status: "DESCRIPTOR_ONLY", code: "owned_title_plan_native_join_required", args, argsHash: ame.operationArgsHash(tool, args) };
  } catch (_) {
    return { status: "CLOSED", code: "owned_title_plan_existing_ame_contract_closed", args: null, argsHash: null };
  }
}
function buildFixedTitlePlan(nativeFacts) {
  const facts = normalizeFacts(nativeFacts), rows = [];
  function row(operation, slot, leaf) {
    const descriptor = MISSING[operation] ? { status: "CLOSED", code: MISSING[operation], args: null, argsHash: null } :
      ameDescriptor(facts, operation, slot);
    rows.push({ key: operation + ":" + slot, operation, slot, leaf, ...descriptor,
      guard: { sourceProject: facts.sourceProject, baseline: facts.baseline, selectedTextLayerIDs: facts.selectedTextLayerIDs,
        variant: slot ? facts.variants[slot - 1] : null, selectedTextLayerID: slot ? facts.selectedTextLayerIDs[slot - 1] : null } });
  }
  row("checkpoint", 0, 14);
  for (const [operation, leaf] of [["clean_copy", 15], ["stage", 5], ["enqueue", 6], ["start", 7], ["restore", 8]]) {
    row(operation, 1, leaf); row(operation, 2, leaf);
  }
  const table = freeze({ schema: PLAN_SCHEMA, sourceOnly: true, nativeAuthority: false, ready: false, facts, rows });
  builtTables.add(table); return table;
}
function selectFixedTitleOperation(table, selector) {
  if (!builtTables.has(table)) fail("owned_title_plan_foreign_descriptor_table");
  exact(selector, ["operation", "slot"]);
  const row = table.rows.find(candidate => candidate.operation === selector.operation && candidate.slot === selector.slot);
  if (!row) fail("owned_title_plan_fixed_operation_required");
  return row;
}
module.exports = { FACTS_SCHEMA, PLAN_SCHEMA, buildFixedTitlePlan, selectFixedTitleOperation };

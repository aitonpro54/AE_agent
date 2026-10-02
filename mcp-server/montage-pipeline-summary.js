"use strict";

const {isRecord, isPositiveInteger, isSha256, deepClone, addBlocker} = require("./montage-contract");
const {COMPILATION_SCHEMA, compileMontagePipeline} = require("./montage-pipeline");
const {validateMontageManifest} = require("./montage-manifest");
const {verifyPlaceholderReadBack} = require("./placeholder-readback");
const {verifyPlaceholderCoverage} = require("./placeholder-framing");
const {reconcilePlanRun, SCHEMA: RECONCILIATION_SCHEMA} = require("./plan-run-reconciliation");
const {classifyMutationStep, buildRunOutcome, originalExecutionError} = require("./run-outcome");
const {isMutatingStep} = require("./semantic-verification");
const {UUID, sha256, equal, projectId, boundedInput, recordBinding, technicalFacts, withoutIndices, validUnitGraph, completeTransform} = require("./montage-run-bindings");

const SUMMARY_SCHEMA = "ae-agent-montage-pipeline-summary.v1";
const CHANGE_KINDS = new Set(["target", "source", "route", "property", "crop", "timing", "matte", "effect", "parent", "material", "manual", "project", "index_drift"]);

// Revalidate the actual M1 graph against its bounded native baseline, including
// current/planned sources and shared occurrences. complete:true alone is not proof.
function affectedMontageScenesChecked(input = {}) {
  const blockers = [], targets = new Map(), scenes = new Set(), frames = new Set();
  let baselineRequired = false;
  const failure = boundedInput(input);
  if (failure) return {ok: false, changedTargets: [], affectedScenes: [], affectedFrameIds: [], baselineRequired: true,
    blockers: [{code: failure, path: "input"}]};
  const m = isRecord(input.manifest) ? input.manifest : {};
  const assignments = Array.isArray(m.assignments) ? m.assignments.filter(isRecord) : [];
  const allScenes = Array.isArray(m.scenes) ? m.scenes.filter(isRecord) : [];
  const coverage = Array.isArray(m.frameCoverage) ? m.frameCoverage.filter(isRecord) : [];
  const strictManifest = deepClone(m), normalizedMaterials = strictManifest.materials;
  delete strictManifest.materials;
  const materials = input.materials || (Array.isArray(normalizedMaterials) ?
    {schema: "ae-agent-prepared-materials.v1", revision: input.materialRevision, materials: normalizedMaterials} : null);
  const validated = validateMontageManifest({manifest: strictManifest, materials, observations: input.observations, budgets: input.budgets || {}});
  const routeTransformsKnown = Array.isArray(input.observations?.targets) && input.observations.targets.every(t =>
    Array.isArray(t?.route) && t.route.every(edge => completeTransform(edge?.transform)));
  if (!validated.ok || !routeTransformsKnown) {
    baselineRequired = true;
    addBlocker(blockers, "incomplete_dependency_graph", "manifest.dependencies", {reason: "native_baseline_or_graph_unverified"});
  }
  const edges = Array.isArray(m.dependencies?.edges) ? m.dependencies.edges.filter(isRecord) : [];
  const materialRows = Array.isArray(materials?.materials) ? materials.materials : [];
  const addTarget = t => { if (isPositiveInteger(t?.compItemId) && isPositiveInteger(t?.layerId)) targets.set(t.compItemId + ":" + t.layerId, {compItemId: t.compItemId, layerId: t.layerId}); };
  const changes = Array.isArray(input.changes) ? input.changes : isRecord(input.changes) ? [input.changes] : [];
  if (input.changes !== undefined && !Array.isArray(input.changes) && !isRecord(input.changes)) {
    baselineRequired = true; addBlocker(blockers, "invalid_changes_container", "changes");
  }
  for (const [index, change] of changes.entries()) {
    const path = "changes[" + index + "]";
    if (!isRecord(change) || !CHANGE_KINDS.has(change.kind) || change.unknownFootprint === true || change.footprint?.complete === false) {
      baselineRequired = true; addBlocker(blockers, "unknown_footprint_requires_baseline", path); continue;
    }
    if (["manual", "property", "matte", "effect", "parent"].includes(change.kind) && change.footprint?.complete !== true) {
      baselineRequired = true; addBlocker(blockers, "unknown_footprint_requires_baseline", path); continue;
    }
    if (change.kind === "project") {
      baselineRequired = true; addBlocker(blockers, "project_drift_detected", path); continue;
    }
    const target = change.target || change.route || change;
    if (change.kind === "index_drift") {
      const before = change.before, after = change.after;
      const actual = (Array.isArray(input.observations?.targets) ? input.observations.targets : []).find(t => t?.target?.compItemId === target.compItemId && t?.target?.layerId === target.layerId);
      if (change.contentChanged === true || !isRecord(before) || !isRecord(after) || !actual ||
          !equal(after, actual) || !equal(withoutIndices(before), withoutIndices(after)) ||
          !isPositiveInteger(before.targetLayer?.index) || !isPositiveInteger(after.targetLayer?.index) ||
          before.targetLayer.id !== target.layerId || after.targetLayer.id !== target.layerId) {
        baselineRequired = true; addBlocker(blockers, "index_drift_unproven_requires_baseline", path);
      }
      continue;
    }
    const sourceChange = ["source", "material"].includes(change.kind);
    const sourceIds = new Set(materialRows.filter(row => row?.materialId === change.materialId).map(row => row.sourceItemId));
    if (isPositiveInteger(change.sourceItemId)) sourceIds.add(change.sourceItemId);
    const matched = edges.filter(edge => sourceChange ? edge.kind === "source" && sourceIds.has(edge.sourceItemId) :
      ["target", "route"].includes(edge.kind) && edge.compItemId === target.compItemId && edge.layerId === target.layerId);
    if (!matched.length) {
      baselineRequired = true; addBlocker(blockers, "unbound_change_requires_baseline", path); continue;
    }
    if (!sourceChange) addTarget(target);
    for (const edge of matched) for (const sceneId of Array.isArray(edge.sceneIds) ? edge.sceneIds : []) scenes.add(sceneId);
  }
  if (baselineRequired) {
    for (const scene of allScenes) if (scene.sceneId) scenes.add(scene.sceneId);
    for (const frame of coverage) if (frame.frameId) frames.add(frame.frameId);
  }
  for (const assignment of assignments) if (baselineRequired || scenes.has(assignment.sceneId)) addTarget(assignment.target);
  for (const frame of coverage) if (scenes.has(frame.sceneId)) frames.add(frame.frameId);
  return {ok: blockers.length === 0, changedTargets: [...targets.values()].sort((a, b) => a.compItemId - b.compItemId || a.layerId - b.layerId),
    affectedScenes: [...scenes].sort(), affectedFrameIds: [...frames].sort(), baselineRequired, blockers};
}

function emptySummary(blockers) {
  return {schema: SUMMARY_SCHEMA, ok: false, status: "blocked", project: null, manifestHash: null, materialsHash: null, evidenceHash: null,
    execution: {status: "unknown", errors: []}, mutation: {status: "unknown", stepCounts: {applied: 0, not_applied: 0, unknown: 0, total: 0}},
    technicalVerification: {status: "insufficient", checks: []}, visualAcceptance: {status: "not_established", artisticAccepted: false, frames: []},
    units: [], reviewPackets: [], affectedScenes: [], changedTargets: [], blockers, nextAction: "inspect_missing_or_failed_evidence"};
}

function summarizeMontagePipelineChecked(input = {}) {
  const failure = boundedInput(input);
  if (failure) return emptySummary([{code: failure, path: "input"}]);
  const c = input.compilation, blockers = [];
  if (!isRecord(c) || c.schema !== COMPILATION_SCHEMA || c.ok !== true || c.readiness !== "ready" ||
      !isRecord(c.project) || typeof c.project.projectFile !== "string" ||
      ![c.manifestHash, c.materialsHash, c.evidenceHash].every(isSha256) || !validUnitGraph(c.units)) {
    return emptySummary([{code: "invalid_compilation_or_unit_graph", path: "compilation"}]);
  }
  const readBack = isRecord(input.readBack) ? input.readBack : {};
  const records = Array.isArray(input.runEvidence) ? input.runEvidence : input.runEvidence?.records || [];
  if (!Array.isArray(records)) return emptySummary([{code: "invalid_run_evidence_container", path: "runEvidence"}]);
  const byUnit = new Map(), runIds = new Set(), invalidUnits = new Set(), unitIds = new Set(c.units.map(u => u.unitId));
  for (const [i, record] of records.entries()) {
    const id = record?.plan?.montagePipeline?.unitId;
    if (!isRecord(record) || !unitIds.has(id)) { addBlocker(blockers, "unknown_or_unbound_run_record", "runEvidence[" + i + "]"); continue; }
    if (!UUID.test(record.runId || "") || record.run?.id !== record.runId || runIds.has(record.runId) || byUnit.has(id)) {
      addBlocker(blockers, runIds.has(record.runId) ? "duplicate_run_id" : "invalid_or_duplicate_unit_binding", "runEvidence[" + i + "]");
      invalidUnits.add(id);
      for (const [otherId, other] of byUnit) if (other.runId === record.runId) invalidUnits.add(otherId);
    }
    runIds.add(record.runId); byUnit.set(id, record);
  }
  const supplied = input.reconciliation === undefined ? [] : Array.isArray(input.reconciliation) ? input.reconciliation : [input.reconciliation];
  const suppliedByRun = new Map();
  for (const report of supplied) {
    if (!isRecord(report) || report.schema !== RECONCILIATION_SCHEMA || !UUID.test(report.runId || "") ||
        !runIds.has(report.runId) || suppliedByRun.has(report.runId)) addBlocker(blockers, "invalid_supplied_reconciliation", "reconciliation");
    else suppliedByRun.set(report.runId, report);
  }
  const summaries = [];
  const freshBaseline = isRecord(readBack.baseline) ? compileMontagePipeline(readBack.baseline) : null;
  for (const unit of c.units) {
    const us = {unitId: unit.unitId, assignmentIds: unit.assignmentIds || [], contentHash: unit.contentHash, runId: null,
      status: "incomplete", executionStatus: "not_started", mutationStatus: "unknown", verificationStatus: "insufficient",
      steps: [], remainingSteps: [], unresolvedSteps: [], replayAllowed: false, rebuildRequired: true,
      eligibleForProposal: false, blockedBy: [], error: null};
    summaries.push(us);
    const record = byUnit.get(unit.unitId);
    if (!record) {
      // Absence of a record does not prove that a run was never delivered.
      const current = (Array.isArray(readBack.unexecutedUnits) ? readBack.unexecutedUnits : []).filter(row => row?.unitId === unit.unitId &&
        row.schema === "ae-agent-montage-never-proposed.v1" && row.contentHash === unit.contentHash &&
        row.planSha256 === sha256(unit.plan) && row.serverConfirmedNeverProposed === true && row.phase === "current_baseline" &&
        row.projectId === projectId(c.project.projectFile) && row.manifestHash === c.manifestHash &&
        row.materialsHash === c.materialsHash && row.evidenceHash === c.evidenceHash &&
        row.observedAt === readBack.baseline?.observations?.observedAt && freshBaseline?.ok === true &&
        freshBaseline.manifestHash === c.manifestHash && freshBaseline.materialsHash === c.materialsHash &&
        freshBaseline.evidenceHash === c.evidenceHash && freshBaseline.units.some(freshUnit => freshUnit.unitId === unit.unitId &&
          freshUnit.contentHash === unit.contentHash && equal(freshUnit.plan, unit.plan)) &&
        records.every(r => Number.isFinite(Date.parse(r?.run?.finishedAt)) && Date.parse(row.observedAt) >= Date.parse(r.run.finishedAt)));
      if (current.length === 1) { us.status = "ready_for_proposal"; us.eligibleForProposal = true; us.mutationStatus = "not_started"; }
      else addBlocker(blockers, "missing_unit_run_evidence", unit.unitId);
      continue;
    }
    us.runId = record.runId;
    const bindingError = invalidUnits.has(unit.unitId) ? "ambiguous_unit_binding" : recordBinding(record, unit, c.project);
    if (bindingError) { addBlocker(blockers, bindingError, unit.unitId); us.status = "failed"; continue; }
    const run = record.run;
    us.executionStatus = buildRunOutcome(run, unit.plan).execution.status;
    if (us.executionStatus === "completed" && run.steps.length < unit.plan.steps.length) us.executionStatus = "partial";
    us.error = originalExecutionError(run);
    const facts = technicalFacts({readBack, record, unit, project: c.project});
    const reconciliation = reconcilePlanRun({record, project: {file: c.project.projectFile}, freshReadSteps: facts.reads});
    const suppliedWithAdapterData = suppliedByRun.get(record.runId);
    const suppliedReport = suppliedWithAdapterData ? Object.fromEntries(Object.entries(suppliedWithAdapterData).filter(([key]) => key !== "montageReadBack")) : null;
    if (suppliedReport && !equal(suppliedReport, reconciliation)) addBlocker(blockers, "supplied_reconciliation_conflicts_with_fresh_reads", unit.unitId);
    const rows = new Map(reconciliation.steps.map(row => [row.index, row]));
    for (const [i, step] of unit.plan.steps.entries()) {
      const index = i + 1;
      if (!isMutatingStep(step)) { us.steps.push({index, tool: step.tool, mutationStatus: "not_required", verificationStatus: "not_required"}); continue; }
      const executed = run.steps.find(s => s.index === index), row = rows.get(index);
      const classification = executed ? classifyMutationStep(executed) : {status: "unknown", reasonCode: "missing_executed_step"};
      const commands = (Array.isArray(executed?.commands) ? executed.commands : []).filter(cmd => cmd?.role === "mutation");
      const neverDelivered = classification.reasonCode === "mutation_not_delivered" &&
        (executed?.phase === "before_delivery" || commands.length && commands.every(cmd => cmd.neverSubmitted === true && !cmd.submittedAt && !cmd.leasedAt));
      const rejected = classification.reasonCode === "rejected_before_mutation";
      let mutationStatus = "unknown", verificationStatus = row?.verificationStatus || "insufficient";
      if (!run.dryRun && executed && (row?.mutationStatus === "applied" || classification.status === "applied")) mutationStatus = "applied";
      else if (executed && (neverDelivered || rejected)) { mutationStatus = "not_applied"; verificationStatus = "not_required"; }
      if (mutationStatus === "not_applied") us.remainingSteps.push(index);
      if (mutationStatus === "unknown") us.unresolvedSteps.push(index);
      us.steps.push({index, tool: step.tool, mutationStatus, verificationStatus, reasonCode: row?.reasonCode || classification.reasonCode});
    }
    const mutations = us.steps.filter(isMutatingStep);
    us.mutationStatus = mutations.some(s => s.mutationStatus === "unknown") ? "unknown" : mutations.every(s => s.mutationStatus === "applied") ? "applied" :
      mutations.some(s => s.mutationStatus === "applied") ? "partial" : "not_applied";
    us.rebuildRequired = us.mutationStatus !== "applied";
    us.status = us.mutationStatus === "applied" ? "incomplete" : "partial";
    let rb = null, coverage = null;
    if (facts.target) {
      rb = verifyPlaceholderReadBack(unit.expectedReadBack, facts.target);
      coverage = verifyPlaceholderCoverage({geometry: facts.target.geometry, transform: facts.target.transform});
    }
    const rbFailed = rb?.reason === "read_back_mismatch";
    const knownFailure = facts.drift.length || rbFailed || us.steps.some(s => s.verificationStatus === "failed");
    if (knownFailure) { us.verificationStatus = "failed"; us.status = "failed"; }
    else if (us.mutationStatus === "applied" && !facts.missing.length && rb?.ok && coverage?.eligible && coverage?.covered &&
        reconciliation.sameProject && mutations.every(s => s.verificationStatus === "passed")) {
      us.verificationStatus = "passed"; us.status = "completed";
    }
    for (const code of facts.drift) addBlocker(blockers, code, unit.unitId);
    for (const code of facts.missing) addBlocker(blockers, code, unit.unitId);
  }
  const byId = new Map(summaries.map(u => [u.unitId, u]));
  // Fixed point: dependency propagation is independent of client unit order.
  let changed = true;
  while (changed) {
    changed = false;
    for (const unit of c.units) {
      const us = byId.get(unit.unitId), deps = unit.dependsOn.filter(id => byId.get(id).status !== "completed");
      if (deps.length && us.status !== "blocked") { us.status = "blocked"; changed = true; }
      if (deps.length) { us.blockedBy = deps; us.eligibleForProposal = false; }
    }
  }
  const packets = Array.isArray(c.reviewPackets) ? c.reviewPackets : [];
  const reviewPackets = packets.map(pkt => {
    const dependsOn = Array.isArray(pkt?.dependsOn) ? pkt.dependsOn : [];
    const canBuild = dependsOn.length > 0 && dependsOn.every(id => byId.get(id)?.status === "completed");
    return {packetId: pkt?.packetId || null, dependsOn, status: canBuild ? "ready_for_build" : "blocked", canBuild};
  });
  // This pure helper cannot authenticate official views or owner receipts.
  // Complete-looking PNG declarations remain not_established; use the existing owner API.
  const visual = input.visualReview || input.runEvidence?.visualReview;
  const declaredFrames = Array.isArray(visual?.frames) ? visual.frames : [];
  const visualFrames = declaredFrames.filter(isRecord).map(f => ({frameId: f.frameId || null,
    sha256: f.sha256 || f.imageSha256 || null, status: "unverified_declaration"}));
  const stale = declaredFrames.some(f => isRecord(f) && f.stateHash &&
    c.units.some(u => u.frameRequirements?.some(r => r.frameId === f.frameId) && f.stateHash !== u.contentHash));
  if (stale) addBlocker(blockers, "stale_png_rejected", "visualReview");
  const mutations = summaries.flatMap(u => u.steps).filter(isMutatingStep);
  const counts = {applied: 0, not_applied: 0, unknown: 0, total: mutations.length};
  for (const step of mutations) counts[step.mutationStatus]++;
  const tech = summaries.some(u => u.verificationStatus === "failed") ? "failed" : summaries.every(u => u.verificationStatus === "passed") ? "passed" : "insufficient";
  const allCompleted = summaries.every(u => u.status === "completed");
  const ok = allCompleted && tech === "passed" && !blockers.length;
  const unknown = summaries.some(u => u.mutationStatus === "unknown"), failed = summaries.some(u => u.status === "failed"), blocked = summaries.some(u => u.status === "blocked");
  return {schema: SUMMARY_SCHEMA, ok, status: ok ? "completed" : unknown ? "partial" : failed ? "failed" : blocked ? "blocked" : "incomplete",
    project: deepClone(c.project), manifestHash: c.manifestHash, materialsHash: c.materialsHash, evidenceHash: c.evidenceHash,
    execution: {status: summaries.some(u => u.executionStatus === "failed") ? "failed" : summaries.every(u => u.executionStatus === "completed") ? "completed" :
      summaries.some(u => u.executionStatus === "completed") ? "partial" : "not_started", errors: summaries.map(u => u.error).filter(Boolean)},
    mutation: {status: unknown ? "unknown" : counts.applied === counts.total && counts.total > 0 ? "applied" : counts.applied ? "partial" : counts.not_applied ? "not_applied" : "not_started", stepCounts: counts},
    technicalVerification: {status: tech, checks: summaries.map(u => ({unitId: u.unitId, verificationStatus: u.verificationStatus}))},
    visualAcceptance: {status: stale ? "pending" : "not_established", artisticAccepted: false,
      reason: stale ? "stale_png_rejected" : "existing_visual_owner_api_required", frames: visualFrames},
    units: summaries, reviewPackets, affectedScenes: c.affectedScenes || [],
    changedTargets: c.units.filter(u => !["not_started", "not_applied"].includes(byId.get(u.unitId).mutationStatus)).map(u => ({compItemId: u.expectedReadBack.compItemId, layerId: u.expectedReadBack.layerId})),
    blockers, nextAction: unknown ? "read_only_reconciliation" : blockers.length || failed ? "inspect_missing_or_failed_evidence" :
      summaries.some(u => u.eligibleForProposal) ? "propose_independent_units" : allCompleted ? "review_frames" : "rebuild_verified_remaining_work"};
}

function affectedMontageScenes(input) {
  try { return affectedMontageScenesChecked(input); }
  catch { return {ok: false, changedTargets: [], affectedScenes: [], affectedFrameIds: [], baselineRequired: true,
    blockers: [{code: "malformed_dependency_input", path: "input"}]}; }
}
function summarizeMontagePipeline(input) {
  try { return summarizeMontagePipelineChecked(input); }
  catch { return emptySummary([{code: "malformed_summary_input", path: "input"}]); }
}

module.exports = {SUMMARY_SCHEMA, affectedMontageScenes, summarizeMontagePipeline};
